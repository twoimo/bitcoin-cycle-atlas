import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {modelComponentFixture} from './helpers/cloudflare-staged-fixture.mjs';
import {serializeModelComponent} from '../scripts/cloudflare-model-provider-policy.mjs';
import {ModelArtifactError,assertModelBuildIdentity,buildModelComponentArtifact,modelArtifactPaths,modelArtifactProfile,modelCommandEnvironment,
  parseModelArtifactArgs,readModelBuildIdentity,reportModelArtifactFailure,verifyModelComponentArtifact} from '../scripts/cloudflare-model-artifact.mjs';
import {assertPublicationHook,deployModelComponent,triggerPublicationHook,verifyPublishedModelBytes} from '../scripts/deploy-cloudflare-model-component.mjs';

const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const now=new Date('2026-11-07T00:02:00.000Z');
const hookId='33333333-3333-4333-8333-333333333333';
const hook='https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/'+hookId;
const consumerBuild='44444444-4444-4444-8444-444444444444';
const clone=value=>structuredClone(value);
const identityFor=component=>({sourceCommit:component.sourceCommit,sourceTree:component.sourceTree,branch:component.branch,
  runId:component.runId,clean:true,workersCi:true,ciSourceCommit:component.sourceCommit,remoteHead:component.sourceCommit,envMode:component.mode});
const environmentFor=component=>({WORKERS_CI:'1',WORKERS_CI_COMMIT_SHA:component.sourceCommit,WORKERS_CI_BUILD_UUID:component.runId,
  WORKERS_CI_BRANCH:component.branch,ATLAS_VERIFICATION_MODE:component.mode,ATLAS_PUBLICATION_DEPLOY_HOOK:hook,
  CLOUDFLARE_ACCOUNT_ID:component.accountId,CLOUDFLARE_API_TOKEN:'synthetic-build-token-for-mocked-deployment',
  PATH:process.env.PATH,HOME:process.env.HOME,CI:'1'});
const acknowledgement=extra=>new Response(JSON.stringify({success:true,errors:[],messages:[],result:{build_uuid:consumerBuild,...extra}}),{headers:{'content-type':'application/json'}});

async function fixture(t,{mode='review',realBuild=false}={}){
  const root=await mkdtemp(resolve(tmpdir(),'atlas-model-artifact-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(resolve(root,'build'),{recursive:true});
  await mkdir(resolve(root,'dist'));await writeFile(resolve(root,'dist/sentinel.txt'),'product output must remain unchanged');
  await mkdir(resolve(root,'.cloudflare'));await writeFile(resolve(root,'.cloudflare/sentinel.txt'),'product prebuilt output must remain unchanged');
  await cp(resolve(repository,'package.json'),resolve(root,'package.json'));
  await symlink(resolve(repository,'node_modules'),resolve(root,'node_modules'),'dir');
  const component=modelComponentFixture({mode}),identity=identityFor(component),env=environmentFor(component),calls=[];
  await writeFile(resolve(root,modelArtifactPaths.component),serializeModelComponent(component));
  const readIdentity=()=>clone(identity);
  const run=async(command,args,options)=>{
    calls.push({command,args,options});
    assert.equal(options.env.ATLAS_PUBLICATION_DEPLOY_HOOK,undefined,'The private hook must not reach the tool process');
    const workspace=resolve(root,modelArtifactPaths.workspace),profile=modelArtifactProfile(mode);
    await mkdir(resolve(workspace,'.cloudflare/output/v0/workers/default'),{recursive:true});
    await cp(resolve(workspace,'public'),resolve(workspace,modelArtifactPaths.assets),{recursive:true});
    await writeFile(resolve(workspace,modelArtifactPaths.workerConfig),JSON.stringify({name:profile.producerWorkerName,compatibilityDate:'2026-11-07',assets:{htmlHandling:'none',notFoundHandling:'none'},workersDev:true,previewUrls:false}));
    await writeFile(resolve(workspace,modelArtifactPaths.rootConfig),JSON.stringify({buildContext:{isPreview:false,mode}}));
  };
  const options={root,mode,env,now,readIdentity,...(realBuild?{}:{run})};
  const artifact=await buildModelComponentArtifact(options);
  return {root,mode,env,component,identity,readIdentity,calls,artifact,options};
}
async function verifiedFixture(t,options){
  const value=await fixture(t,options);
  return {...value,...await verifyModelComponentArtifact({root:value.root,mode:value.mode,env:value.env,now,readIdentity:value.readIdentity})};
}
function readbackFetch(value,events=[]){
  return async(url,options)=>{
    events.push({url,options});
    if(options.method==='POST')return acknowledgement({branch:value.component.branch,worker:value.profile.consumerWorkerName});
    if(url===value.profile.origin+value.index.receipt.path)return new Response(value.componentBytes);
    if(url===value.profile.origin+value.artifact.index.path)return new Response(value.indexBytes);
    throw new Error('Unexpected fixture request');
  };
}

test('only explicit production or review mode and one non-deploying flag are accepted',()=>{
  assert.deepEqual(parseModelArtifactArgs(['--mode=review','--check'],{deploy:true}),{mode:'review',checkOnly:true,dryRun:false});
  for(const args of [[],['--mode=preview'],['--mode=review','--mode=review'],['--mode=review','--check','--dry-run'],['--mode=review','--force']])assert.throws(()=>parseModelArtifactArgs(args,{deploy:true}));
  assert.throws(()=>parseModelArtifactArgs(['--mode=review','--check']));
  assert.equal(modelArtifactProfile('production').producerWorkerName,'bitcoin-cycle-atlas-models');
  assert.equal(modelArtifactProfile('review').origin,'https://bitcoin-cycle-atlas-models-verify.twoimo.workers.dev');
});

test('source, tree, clean checkout, active Build UUID and remote head all bind before publication',()=>{
  const component=modelComponentFixture(),identity=identityFor(component);
  assertModelBuildIdentity(component,identity,{mode:'review',remote:true,now});
  for(const change of [{sourceCommit:'d'.repeat(40)},{sourceTree:'e'.repeat(40)},{clean:false},{workersCi:false},{ciSourceCommit:'f'.repeat(40)},
    {runId:consumerBuild},{branch:'different/branch'},{remoteHead:'9'.repeat(40)},{envMode:'production'}]){
    assert.throws(()=>assertModelBuildIdentity(component,{...identity,...change},{mode:'review',remote:true,now}));
  }
  for(const change of [{status:'FAIL'},{qualifiesFullVerification:true},{workerName:'bitcoin-cycle-atlas'},
    {gates:component.gates.slice(1)},{privateHook:hook}])assert.throws(()=>assertModelBuildIdentity({...component,...change},identity,{mode:'review',now}));
});

test('real git reads require actual CI identity and reject dirty or advanced source',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'atlas-model-source-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['init','--initial-branch=verify/component']);await writeFile(resolve(root,'tracked.txt'),'source');
  git(['add','tracked.txt']);git(['-c','user.name=Atlas Fixture','-c','user.email=fixture@example.invalid','commit','-m','Synthetic source fixture']);
  git(['remote','add','origin',root]);
  const component=modelComponentFixture({sourceCommit:git(['rev-parse','HEAD']),sourceTree:git(['rev-parse','HEAD^{tree}']),branch:'verify/component'});
  const env=environmentFor(component);
  const identity=readModelBuildIdentity({root,mode:'review',env,remote:true});
  assertModelBuildIdentity(component,identity,{mode:'review',remote:true,now});
  for(const change of [{WORKERS_CI:undefined},{WORKERS_CI_COMMIT_SHA:undefined},{WORKERS_CI_BUILD_UUID:undefined},{WORKERS_CI_BRANCH:'bad..branch'}]){
    assert.throws(()=>readModelBuildIdentity({root,mode:'review',env:{...env,...change}}));
  }
  await writeFile(resolve(root,'untracked.txt'),'unreviewed');
  assert.throws(()=>assertModelBuildIdentity(component,readModelBuildIdentity({root,mode:'review',env}),{mode:'review',now}));
});

test('isolated packaging preserves exact component bytes and both product output directories',async t=>{
  const value=await verifiedFixture(t);
  assert.equal(value.artifact.qualifiesFullVerification,false);
  assert.equal(value.componentBytes.toString(),serializeModelComponent(value.component).toString());
  assert.equal(value.artifact.component.path,`/receipts/${value.component.sourceCommit}/${value.component.runId}.json`);
  assert.equal(value.artifact.index.path,`/sources/${value.component.sourceCommit}.json`);
  assert.equal(await readFile(resolve(value.root,'dist/sentinel.txt'),'utf8'),'product output must remain unchanged');
  assert.equal(await readFile(resolve(value.root,'.cloudflare/sentinel.txt'),'utf8'),'product prebuilt output must remain unchanged');
  assert.equal(value.calls.length,1);
  assert.deepEqual(value.calls[0].args.slice(1),['build','--config','vite.config.ts','--mode','review']);
  assert.equal(value.calls[0].options.cwd,resolve(value.root,modelArtifactPaths.workspace));
});

test('pinned Vite creates an actual assets-only prebuilt artifact and cf validates it without network deployment',async t=>{
  const value=await fixture(t,{realBuild:true});
  const result=await deployModelComponent({root:value.root,mode:value.mode,env:value.env,now:()=>now,dryRun:true,readIdentity:value.readIdentity,
    fetchImpl:()=>{throw new Error('A dry run must never issue a request');}});
  assert.equal(result.status,'MODEL_COMPONENT_DRY_RUN');
  assert.equal(JSON.parse(await readFile(resolve(value.root,modelArtifactPaths.workspace,modelArtifactPaths.workerConfig),'utf8')).previewUrls,false);
  assert.equal(result.qualifiesFullVerification,false);
  assert.equal(await readFile(resolve(value.root,'dist/sentinel.txt'),'utf8'),'product output must remain unchanged');
  assert.equal(await readFile(resolve(value.root,'.cloudflare/sentinel.txt'),'utf8'),'product prebuilt output must remain unchanged');
});

test('extra app files, latest pointers and symlinks cannot enter component assets',async t=>{
  for(const name of ['index.html','sources/latest.json','receipts/latest.json']){
    const value=await fixture(t);const path=resolve(value.root,modelArtifactPaths.workspace,modelArtifactPaths.assets,name);
    await mkdir(dirname(path),{recursive:true});await writeFile(path,'unexpected');
    await assert.rejects(()=>verifyModelComponentArtifact(value.options),error=>error.code==='MODEL_COMPONENT_INVENTORY');
  }
  const value=await fixture(t);await symlink(resolve(value.root,'dist/sentinel.txt'),resolve(value.root,modelArtifactPaths.workspace,modelArtifactPaths.assets,'linked'));
  await assert.rejects(()=>verifyModelComponentArtifact(value.options),error=>error.code==='MODEL_COMPONENT_INVENTORY');
});

test('changed public bytes, source component and packaging receipt are independently rejected',async t=>{
  for(const target of ['component','index','input','artifact']){
    const value=await fixture(t);
    const path=target==='input'?resolve(value.root,modelArtifactPaths.component):target==='artifact'?resolve(value.root,modelArtifactPaths.receipt):
      resolve(value.root,modelArtifactPaths.workspace,modelArtifactPaths.assets,value.artifact[target].path.slice(1));
    const bytes=await readFile(path);await writeFile(path,Buffer.concat([bytes,Buffer.from(' ')]));
    if(target==='artifact'){
      const artifact=JSON.parse(bytes);artifact.component.sha256='e'.repeat(64);await writeFile(path,JSON.stringify(artifact));
    }
    await assert.rejects(()=>verifyModelComponentArtifact(value.options));
  }
});

test('runtime entrypoints, bindings, alternate workers, preview modes and edited config scripts fail closed',async t=>{
  for(const change of [{entrypoint:'worker.js'},{bindings:{SECRET:{type:'secret'}}},{name:'bitcoin-cycle-atlas'},
    {assets:{htmlHandling:'none',notFoundHandling:'none',runWorkerFirst:true}},{previewUrls:true},{previewUrls:undefined}]){
    const value=await fixture(t),path=resolve(value.root,modelArtifactPaths.workspace,modelArtifactPaths.workerConfig);
    const config=JSON.parse(await readFile(path));await writeFile(path,JSON.stringify({...config,...change}));
    await assert.rejects(()=>verifyModelComponentArtifact(value.options),error=>error.code==='MODEL_COMPONENT_CONFIG');
  }
  for(const name of [modelArtifactPaths.rootConfig,'cloudflare.config.ts','vite.config.ts','package.json']){
    const value=await fixture(t),path=resolve(value.root,modelArtifactPaths.workspace,name);
    await writeFile(path,name===modelArtifactPaths.rootConfig?JSON.stringify({buildContext:{isPreview:true,mode:'review'}}):'changed');
    await assert.rejects(()=>verifyModelComponentArtifact(value.options),error=>error.code==='MODEL_COMPONENT_CONFIG');
  }
});

test('an invalid or incomplete model component never starts packaging or deployment',async t=>{
  const value=await fixture(t);value.component.gates.pop();await writeFile(resolve(value.root,modelArtifactPaths.component),serializeModelComponent(value.component));
  let commands=0,requests=0;
  await assert.rejects(()=>buildModelComponentArtifact({...value.options,run:async()=>{commands++;}}));
  await assert.rejects(()=>deployModelComponent({...value.options,now:()=>now,run:async()=>{commands++;},fetchImpl:async()=>{requests++;}}));
  assert.equal(commands,0);assert.equal(requests,0);
});

test('the private hook runs once only after successful deployment, both exact readbacks and a fresh source check',async t=>{
  const value=await verifiedFixture(t),events=[];let identityReads=0;
  const result=await deployModelComponent({root:value.root,mode:value.mode,env:value.env,now:()=>now,
    readIdentity:()=>{identityReads++;events.push('identity');return clone(value.identity);},
    run:async(command,args,options)=>{events.push('deploy');assert.ok(args.includes('--prebuilt'));assert.equal(options.env.ATLAS_PUBLICATION_DEPLOY_HOOK,undefined);},
    fetchImpl:readbackFetch(value,events)});
  assert.equal(identityReads,2);assert.equal(result.publication.buildUuid,consumerBuild);assert.equal(result.qualifiesFullVerification,false);
  assert.deepEqual(events.map(event=>typeof event==='string'?event:event.options.method),['identity','deploy','GET','GET','identity','POST']);
  const post=events.at(-1);assert.equal(post.options.redirect,'error');assert.equal(post.options.headers.Authorization,undefined);
  const receipt=await readFile(resolve(value.root,'build/cloudflare-model-publication.json'),'utf8');
  assert.equal(receipt.includes(hook),false);assert.equal(receipt.includes(hookId),false);
});

test('deployment failure, readback mismatch and branch advance cannot trigger publication',async t=>{
  for(const scenario of ['deploy','readback','advanced']){
    const value=await verifiedFixture(t);let posts=0,identityReads=0;
    await assert.rejects(()=>deployModelComponent({root:value.root,mode:value.mode,env:value.env,now:()=>now,
      readIdentity:()=>{identityReads++;return {...value.identity,...(scenario==='advanced'&&identityReads>1?{remoteHead:'d'.repeat(40)}:{})};},
      run:async()=>{if(scenario==='deploy')throw new Error('tool failed '+hook);},
      fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;if(scenario==='readback')return new Response('{}');return readbackFetch(value)(url,options);}}));
    assert.equal(posts,0,scenario);
  }
});

test('--check and --dry-run never read or request the private hook',async t=>{
  const value=await fixture(t);let requests=0,runs=0;
  const env={...value.env};delete env.ATLAS_PUBLICATION_DEPLOY_HOOK;
  for(const flags of [{checkOnly:true},{dryRun:true}]){
    const result=await deployModelComponent({root:value.root,mode:value.mode,env,now:()=>now,readIdentity:value.readIdentity,...flags,
      run:async(command,args)=>{runs++;assert.ok(args.includes('--dry-run'));},fetchImpl:async()=>{requests++;throw new Error('unexpected');}});
    assert.equal(result.qualifiesFullVerification,false);
  }
  assert.equal(runs,1);assert.equal(requests,0);
});

test('a wrong deployment account or missing existing Build token blocks upload and hook',async t=>{
  const value=await fixture(t);
  for(const change of [{CLOUDFLARE_ACCOUNT_ID:'f'.repeat(32)},{CLOUDFLARE_ACCOUNT_ID:undefined},{CLOUDFLARE_API_TOKEN:undefined}]){
    let actions=0;
    await assert.rejects(()=>deployModelComponent({root:value.root,mode:value.mode,env:{...value.env,...change},now:()=>now,readIdentity:value.readIdentity,
      run:async()=>{actions++;},fetchImpl:async()=>{actions++;}}));
    assert.equal(actions,0);
  }
});

test('hook destination rejects redirects, credential URLs, queries and alternate endpoints',()=>{
  assert.equal(assertPublicationHook(hook),hook);
  for(const value of [undefined,'',hook+'/',hook+'?token=x',hook+'#secret',hook.replace('https:','http:'),hook.replace('api.cloudflare.com','api.cloudflare.com:443'),
    hook.replace('api.cloudflare.com','user@api.cloudflare.com'),hook.replace('/deploy_hooks/','/anything/'),hook.replace('api.cloudflare.com','evil.example')])assert.throws(()=>assertPublicationHook(value));
});

test('hook acknowledgements preserve actual build UUIDs and reject failed, redirected or foreign responses',async()=>{
  const expected={expectedBranch:'main',expectedWorker:'bitcoin-cycle-atlas'};
  assert.deepEqual(await triggerPublicationHook(hook,{...expected,fetchImpl:async()=>acknowledgement({already_exists:true})}),{buildUuid:consumerBuild,alreadyExists:true});
  for(const response of [()=>new Response('redirect',{status:302,headers:{Location:hook}}),()=>new Response(JSON.stringify({success:false,errors:[{message:hook}]})),
    ()=>acknowledgement({branch:'different'}),()=>acknowledgement({worker:'different'}),()=>acknowledgement({build_uuid:'not-a-build'}),
    ()=>new Response(hook,{headers:{'content-length':'999999'}})]){
    await assert.rejects(()=>triggerPublicationHook(hook,{...expected,fetchImpl:async()=>response()}),error=>!error.message.includes(hook)&&!error.message.includes(hookId));
  }
});

test('network errors and arbitrary provider bodies never leak the hook URL or identifier into errors or logs',async()=>{
  let error;
  try{await triggerPublicationHook(hook,{fetchImpl:async()=>{throw new Error('request failed at '+hook);}});}catch(caught){error=caught;}
  assert.ok(error);assert.equal(error.message.includes(hook),false);assert.equal(error.message.includes(hookId),false);
  const lines=[];reportModelArtifactFailure(error,line=>lines.push(line));reportModelArtifactFailure(new Error(hook),line=>lines.push(line));
  assert.equal(lines.join('').includes(hook),false);assert.equal(lines.join('').includes(hookId),false);
  assert.equal(modelCommandEnvironment({ATLAS_PUBLICATION_DEPLOY_HOOK:hook,CLOUDFLARE_API_TOKEN:'normal-build-token'}).CLOUDFLARE_API_TOKEN,'normal-build-token');
  assert.equal(modelCommandEnvironment({ATLAS_PUBLICATION_DEPLOY_HOOK:hook}).ATLAS_PUBLICATION_DEPLOY_HOOK,undefined);
});

test('public readback requires both original byte sequences with no redirect or oversized-body acceptance',async t=>{
  const value=await verifiedFixture(t);
  await verifyPublishedModelBytes({...value,fetchImpl:readbackFetch(value)});
  for(const fetchImpl of [async()=>new Response('{}'),async()=>new Response('redirect',{status:302}),
    async()=>new Response(value.componentBytes,{headers:{'content-length':'999999999'}})]){
    await assert.rejects(()=>verifyPublishedModelBytes({...value,fetchImpl}));
  }
});

function readbackClock(){
  let elapsed=0;
  return {clock:()=>elapsed,advance:ms=>{elapsed+=ms;},get elapsed(){return elapsed;},
    delay:async(ms,{signal})=>{signal.throwIfAborted();elapsed+=ms;signal.throwIfAborted();}};
}

test('transient readback availability retries within one budget and retains safe recovery evidence',async t=>{
  const value=await verifiedFixture(t);
  for(const transient of [404,408,425,429,500,502,503,504,'transport']){
    const time=readbackClock(),calls=[];
    const result=await verifyPublishedModelBytes({...value,clock:time.clock,delay:time.delay,
      fetchImpl:async(url,options)=>{
        calls.push(url);assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
        assert.ok(options.signal instanceof AbortSignal);
        if(calls.length===1){if(transient==='transport')throw new Error(hook);return new Response('unavailable',{status:transient});}
        return readbackFetch(value)(url,options);
      }});
    assert.equal(result.status,'EXACT_BYTES_CONFIRMED');assert.equal(result.attempts,2);assert.equal(result.elapsedMs,2000);
    assert.deepEqual(calls,[value.profile.origin+value.index.receipt.path,value.profile.origin+value.index.receipt.path,value.profile.origin+value.artifact.index.path]);
    assert.deepEqual(result.responses,[{asset:'component',status:200,bytes:value.componentBytes.length},{asset:'index',status:200,bytes:value.indexBytes.length}]);
    assert.equal(result.retries.length,1);assert.equal(result.retries[0].category,transient==='transport'?'transport':'http');
    assert.equal(result.retries[0].status,transient==='transport'?null:transient);
    assert.equal(JSON.stringify(result).includes(hookId),false);
  }
});

test('a transient second-file failure rereads both exact files before the private hook',async t=>{
  const value=await verifiedFixture(t),time=readbackClock(),events=[];let indexReads=0;
  const result=await deployModelComponent({root:value.root,mode:value.mode,env:value.env,now:()=>now,readIdentity:value.readIdentity,
    readbackClock:time.clock,readbackDelay:time.delay,run:async()=>{},
    fetchImpl:async(url,options)=>{
      events.push(options.method==='POST'?'hook':url.endsWith(value.artifact.index.path)?'index':'component');
      if(options.method==='GET'&&url.endsWith(value.artifact.index.path)&&++indexReads===1)return new Response('propagating',{status:404});
      return readbackFetch(value)(url,options);
    }});
  assert.deepEqual(events,['component','index','component','index','hook']);
  assert.equal(result.readback.attempts,2);assert.equal(result.readback.retries[0].asset,'index');
  assert.equal(result.publication.buildUuid,consumerBuild);assert.equal(result.qualifiesFullVerification,false);
});

test('receipt bytes from a previous retry cannot mask a later integrity failure or dispatch a hook',async t=>{
  const value=await verifiedFixture(t),time=readbackClock(),events=[];let componentReads=0;
  const wrong=Buffer.from(value.componentBytes);wrong[0]^=1;
  await assert.rejects(()=>deployModelComponent({root:value.root,mode:value.mode,env:value.env,now:()=>now,readIdentity:value.readIdentity,
    readbackClock:time.clock,readbackDelay:time.delay,run:async()=>{},
    fetchImpl:async(url,options)=>{
      events.push(options.method==='POST'?'hook':url.endsWith(value.artifact.index.path)?'index':'component');
      if(options.method==='POST')return acknowledgement();
      if(url.endsWith(value.artifact.index.path))return new Response('propagating',{status:503});
      return new Response(++componentReads===1?value.componentBytes:wrong);
    }}),error=>error.code==='MODEL_COMPONENT_READBACK'&&error.readback.category==='integrity'&&error.readback.attempt===2);
  assert.deepEqual(events,['component','index','component']);
});

test('authentication, redirects, permanent HTTP errors, sizes and equal-length corruption never retry',async t=>{
  const value=await verifiedFixture(t),wrong=Buffer.from(value.componentBytes);wrong[0]^=1;
  for(const [response,category,status] of [
    [()=>new Response('denied',{status:401}),'http',401],[()=>new Response('denied',{status:403}),'http',403],
    [()=>new Response('invalid',{status:400}),'http',400],[()=>new Response('gone',{status:410}),'http',410],
    [()=>new Response('unsupported',{status:501}),'http',501],
    [()=>new Response('redirect',{status:302,headers:{Location:hook}}),'redirect',302],
    [()=>new Response(wrong),'integrity',200],
    [()=>new Response(value.componentBytes,{headers:{'content-length':'999999999'}}),'size',200],
  ]){
    let requests=0,delays=0;
    await assert.rejects(()=>verifyPublishedModelBytes({...value,clock:()=>0,delay:async()=>{delays++;},
      fetchImpl:async()=>{requests++;return response();}}),error=>error.code==='MODEL_COMPONENT_READBACK'&&
        error.readback.category===category&&error.readback.status===status&&error.readback.attempt===1);
    assert.equal(requests,1);assert.equal(delays,0);
  }
});

test('the shared thirty-second deadline includes retries and blocks the hook on exhaustion',async t=>{
  const value=await verifiedFixture(t),time=readbackClock();let requests=0,posts=0;
  await assert.rejects(()=>deployModelComponent({root:value.root,mode:value.mode,env:value.env,now:()=>now,readIdentity:value.readIdentity,
    readbackClock:time.clock,readbackDelay:time.delay,run:async()=>{},fetchImpl:async(url,options)=>{
      if(options.method==='POST')posts++;requests++;return new Response('propagating',{status:503});
    }}),error=>error.code==='MODEL_COMPONENT_READBACK'&&error.readback.category==='deadline'&&
      error.readback.status===503&&error.readback.elapsedMs===30_000);
  assert.equal(time.elapsed,30_000);assert.equal(requests,15);assert.equal(posts,0);
});

test('fetch and body elapsed time share the same deadline rather than receiving fresh per-file budgets',async t=>{
  const value=await verifiedFixture(t);
  for(const phase of ['fetch','body']){
    const time=readbackClock();let requests=0;
    await assert.rejects(()=>verifyPublishedModelBytes({...value,clock:time.clock,delay:time.delay,
      fetchImpl:async()=>{
        requests++;
        if(phase==='fetch'){time.advance(30_001);return new Response(value.componentBytes);}
        return new Response(new ReadableStream({pull(controller){time.advance(30_001);controller.enqueue(value.componentBytes);controller.close();}},{highWaterMark:0}));
      }}),error=>error.readback?.category==='deadline');
    assert.equal(requests,1);
  }
});

test('cancellation stops an already-aborted call, stalled fetch/body and an in-progress retry wait', {timeout:5000},async t=>{
  const value=await verifiedFixture(t);
  for(const phase of ['before','fetch','body','wait']){
    const controller=new AbortController(),time=readbackClock();let requests=0,delays=0;
    if(phase==='before')controller.abort(new Error(hook));
    await assert.rejects(()=>verifyPublishedModelBytes({...value,signal:controller.signal,clock:time.clock,
      delay:async()=>{
        delays++;queueMicrotask(()=>controller.abort(new Error(hook)));return new Promise(()=>{});
      },
      fetchImpl:async()=>{
        requests++;
        if(phase==='fetch'){queueMicrotask(()=>controller.abort(new Error(hook)));return new Promise(()=>{});}
        if(phase==='body')return new Response(new ReadableStream({pull(){queueMicrotask(()=>controller.abort(new Error(hook)));return new Promise(()=>{});},cancel(){return new Promise(()=>{});}},{highWaterMark:0}));
        return new Response('propagating',{status:503});
      }}),error=>error.readback?.category==='cancelled'&&!error.message.includes(hookId));
    assert.equal(requests,phase==='before'?0:1);assert.equal(delays,phase==='wait'?1:0);
  }
});

test('cancellation after byte readback but before the fresh source check completes cannot dispatch a hook',async t=>{
  const value=await verifiedFixture(t),controller=new AbortController();let identityReads=0,posts=0;
  await assert.rejects(()=>deployModelComponent({root:value.root,mode:value.mode,env:value.env,now:()=>now,signal:controller.signal,
    readIdentity:()=>{if(++identityReads===2)controller.abort(new Error(hook));return clone(value.identity);},run:async()=>{},
    fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return readbackFetch(value)(url,options);}}),
    error=>error.code==='MODEL_COMPONENT_CANCELLED');
  assert.equal(posts,0);assert.equal(identityReads,2);
});

test('readback diagnostics expose only allowlisted categories and numeric status without provider text',()=>{
  const detail={category:'http',asset:'index',status:503,attempt:2,elapsedMs:2000};
  const error=new ModelArtifactError('MODEL_COMPONENT_READBACK',hook);error.readback={...detail,url:hook,body:hook};error.cause=new Error(hook);
  const lines=[];reportModelArtifactFailure(error,line=>lines.push(line));
  assert.deepEqual(JSON.parse(lines[0]),{status:'FAIL',code:'MODEL_COMPONENT_READBACK',readback:detail});
  for(const field of ['category','asset','status','attempt','elapsedMs']){
    error.readback={...detail,[field]:hook};reportModelArtifactFailure(error,line=>lines.push(line));
    assert.equal(JSON.parse(lines.at(-1)).readback,undefined);
  }
  assert.equal(lines.join('').includes(hookId),false);
});

test('observed streamed oversize remains fatal even when stream cancellation never settles', {timeout:5000},async t=>{
  const value=await verifiedFixture(t),time=readbackClock();let requests=0,posts=0,cancellations=0;
  const tooLarge=Buffer.concat([value.componentBytes,Buffer.from('!')]),signals=[];
  await assert.rejects(()=>deployModelComponent({root:value.root,mode:value.mode,env:value.env,now:()=>now,readIdentity:value.readIdentity,
    readbackClock:time.clock,readbackDelay:time.delay,run:async()=>{},
    fetchImpl:async(url,options)=>{
      if(options.method==='POST')posts++;
      requests++;signals.push(options.signal);
      if(requests===1)return new Response(new ReadableStream({start(stream){stream.enqueue(tooLarge);},cancel(){cancellations++;return new Promise(()=>{});}}));
      return readbackFetch(value)(url,options);
    }}),error=>error.code==='MODEL_COMPONENT_READBACK'&&error.readback.category==='size'&&error.readback.attempt===1);
  assert.equal(requests,1);assert.equal(posts,0);assert.equal(cancellations,1);
  assert.equal(signals[0].aborted,true);assert.equal(time.elapsed,0);
});
