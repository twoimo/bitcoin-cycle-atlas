import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {runCloudflareMarketRefresh,confirmMarketRefreshCommit,pushMarketRefreshCommit,assertMarketRefreshEnvironment,
  marketRefreshRemainingBudget,MARKET_REFRESH_PROVIDERS,MARKET_REFRESH_GATES,MARKET_REFRESH_RESULT_PATH} from '../scripts/cloudflare-market-refresh.mjs';
import {MARKET_REFRESH_MUTABLE_PATHS,MARKET_REFRESH_RECEIPT_PATH,MARKET_REFRESH_REMOTE,isMarketRefreshPath,
  assertMarketRefreshReceipt,readCommittedMarketRefreshOutcomes,marketRefreshGitEnvironment,marketRefreshCommandEnvironment,
  marketRefreshReceiptBytes,refreshGit,refreshSha256} from '../scripts/cloudflare-market-refresh-receipt.mjs';

const now=Date.parse('2026-11-07T08:00:00.000Z'),runtime={node:'v24.22.2',platform:'linux',arch:'x64'};
const buildId='11111111-1111-4111-8111-111111111111',triggerId='22222222-2222-4222-8222-222222222222';
const oldJudgment='dist/data/judgment-snapshots/2026-11-06T010000000Z-aaaaaaaaaaaa.json';
const oldForecast='dist/data/forecast-ledger/records/'+ 'a'.repeat(64)+'.json';
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'atlas-market-refresh-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(path,value)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),value);};
  const git=(...args)=>refreshGit(root,args);
  await git('init','--quiet','--initial-branch=main');await git('config','user.name','Refresh unit fixture');await git('config','user.email','fixture@example.invalid');
  await put('.gitignore','build/\n');await put('dist/index.html','<main>unchanged application</main>\n');
  for(const path of MARKET_REFRESH_MUTABLE_PATHS)await put(path,JSON.stringify({retrievedAt:'2026-11-06T01:00:00.000Z',path})+'\n');
  await put('dist/data/judgment-snapshots/index.json',JSON.stringify({version:1,records:[{id:'original-judgment',file:oldJudgment.split('/').at(-1),sha256:'b'.repeat(64)}]})+'\n');
  await put('dist/data/forecast-ledger/index.json',JSON.stringify({entries:[{id:'original-forecast',recordPath:'records/'+ 'a'.repeat(64)+'.json',issuedAt:'2026-11-06T01:00:00.000Z'}]})+'\n');
  await put(oldJudgment,'{"immutable":"judgment original bytes"}\n');await put(oldForecast,'{"immutable":"forecast original bytes"}\n');
  await git('add','.');await git('commit','--quiet','-m','base source');
  const baseSourceCommit=await git('rev-parse','HEAD'),baseSourceTree=await git('rev-parse','HEAD^{tree}');
  const environment={...process.env,WORKERS_CI:'1',WORKERS_CI_COMMIT_SHA:baseSourceCommit,WORKERS_CI_BRANCH:'main',WORKERS_CI_BUILD_UUID:buildId,
    ATLAS_REFRESH_TRIGGER_UUID:triggerId,CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),ATLAS_BUILDS_READ_TOKEN:'build-read-fixture-secret',ATLAS_DATA_GITHUB_TOKEN:'repository-write-fixture-secret',
    CLOUDFLARE_API_TOKEN:'must-not-reach-collectors',GIT_TRACE:'1',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.extraheader',GIT_CONFIG_VALUE_0:'unused clone credential'};
  const build={build_uuid:buildId,status:'running',created_on:new Date(now-3000).toISOString(),initializing_on:new Date(now-3000).toISOString(),running_on:new Date(now-2000).toISOString(),
    build_trigger_metadata:{commit_hash:baseSourceCommit,branch:'main',provider_type:'github',provider_account_name:'twoimo',repo_name:'bitcoin-cycle-atlas',build_trigger_source:'deploy_hook'},
    trigger:{trigger_uuid:triggerId,repo_connection:{provider_type:'github',provider_account_name:'twoimo',repo_name:'bitcoin-cycle-atlas'}}};
  const calls=[],pushes=[],originals=new Map(await Promise.all([...MARKET_REFRESH_MUTABLE_PATHS,oldJudgment,oldForecast].map(async path=>[path,await readFile(join(root,path))])));
  let tick=now;
  async function execute(step){
    calls.push(step.id);
    for(const key of ['ATLAS_DATA_GITHUB_TOKEN','ATLAS_BUILDS_READ_TOKEN','CLOUDFLARE_API_TOKEN','GIT_TRACE','GIT_CONFIG_COUNT'])assert.equal(step.environment[key],undefined,'Collector/validator inherited '+key);
    const provider=MARKET_REFRESH_PROVIDERS.find(item=>item.id===step.id);
    if(provider)for(const path of provider.files)await put(path,JSON.stringify({retrievedAt:new Date(now).toISOString(),provider:step.id,path})+'\n');
    return {code:0,durationMs:1,output:Buffer.from('actual unit command '+step.id+'\n')};
  }
  const options={root,environment,runtime,clock:()=>tick++,execute,readBuild:async()=>structuredClone(build),
    bootstrapFormal:async()=>({receipt:{gateStatus:'FORMAL_TOOLS_READY'},environment:{JAVA:'/verified/java',TLA2TOOLS:'/verified/tla2tools.jar'}}),
    push:async value=>{pushes.push(value);return {sourceCommit:value.sourceCommit,confirmed:true};},log:()=>{}};
  return {root,put,git,baseSourceCommit,baseSourceTree,environment,build,calls,pushes,originals,execute,options};
}

test('two-build refresh rolls back every byte of optional partial failures and preserves its exact data-source lineage',async t=>{
  const f=await fixture(t),execute=async step=>{const result=await f.execute(step);return ['equities','comparison'].includes(step.id)?{...result,code:1}:result;};
  const result=await runCloudflareMarketRefresh({...f.options,execute});
  assert.equal(result.status,'SOURCE_COMMITTED');assert.notEqual(result.sourceCommit,f.baseSourceCommit);assert.equal(f.pushes.length,1);
  assert.equal(f.environment.WORKERS_CI_COMMIT_SHA,f.baseSourceCommit,'Producer must never impersonate the second build event');
  assert.equal(await f.git('rev-parse','HEAD^'),f.baseSourceCommit);assert.equal(await f.git('status','--porcelain'),'');
  for(const path of ['dist/data/mstr-ohlc.json','dist/data/bmnr-ohlc.json','dist/data/asset-comparison.json',oldJudgment,oldForecast])assert.ok((await readFile(join(f.root,path))).equals(f.originals.get(path)),path+' changed after a failed optional acquisition');
  assert.deepEqual(f.calls,[...MARKET_REFRESH_PROVIDERS.map(step=>step.id),...MARKET_REFRESH_GATES.filter(step=>step.id!=='judgment-capture').map(step=>step.id)]);
  assert.ok(!f.calls.includes('judgment-capture'));
  const raw=await readFile(join(f.root,MARKET_REFRESH_RECEIPT_PATH)),receipt=assertMarketRefreshReceipt(JSON.parse(raw));
  assert.ok(marketRefreshReceiptBytes(receipt).equals(raw));assert.equal(receipt.attempts.equities.retainedPrevious,true);assert.equal(receipt.attempts.comparison.outcome,'failure');
  assert.deepEqual((await f.git('diff-tree','--no-commit-id','--name-only','-r','HEAD')).split('\n').filter(path=>!isMarketRefreshPath(path)),[]);
  const read=await readCommittedMarketRefreshOutcomes({root:f.root,sourceCommit:result.sourceCommit});
  assert.equal(read.outcomes.btc.outcome,'success');assert.equal(read.outcomes.comparison.outcome,'failure');assert.equal(read.provenance.receiptCommit,result.sourceCommit);assert.equal(read.provenance.baseSourceCommit,f.baseSourceCommit);
  assert.equal((await confirmMarketRefreshCommit({...f.options,readRemote:async()=>result.sourceCommit})).sourceCommit,result.sourceCommit);
  await f.put('dist/index.html','<main>later application revision</main>\n');await f.git('add','dist/index.html');await f.git('commit','--quiet','-m','application only');
  const later=await f.git('rev-parse','HEAD'),laterRead=await readCommittedMarketRefreshOutcomes({root:f.root,sourceCommit:later});
  assert.equal(laterRead.provenance.receiptCommit,result.sourceCommit);assert.equal(await f.git('rev-parse','HEAD'),later,'Reading old refresh provenance cannot rewrite the current publication source');
});

for(const failed of ['btc','cycle'])test('required '+failed+' failure records the actual attempt, skips downstream work and never pushes',async t=>{
  const f=await fixture(t);
  await assert.rejects(runCloudflareMarketRefresh({...f.options,execute:async step=>{const result=await f.execute(step);return step.id===failed?{...result,code:1}:result;}}),/Required refresh provider failed/);
  assert.equal(f.pushes.length,0);assert.equal(await f.git('rev-parse','HEAD'),f.baseSourceCommit);
  const outcome=JSON.parse(await readFile(join(f.root,'build/cloudflare-refresh-outcomes.json'),'utf8'));
  assert.equal(outcome.attempts[failed].outcome,'failure');assert.ok(outcome.attempts[failed].attemptedAt);assert.equal(outcome.attempts[failed].retainedPrevious,true);
  assert.equal(outcome.attempts.ohlc.outcome,'skipped');assert.equal(outcome.attempts.ohlc.attemptedAt,null);
  for(const path of MARKET_REFRESH_PROVIDERS.find(step=>step.id===failed).files)assert.ok((await readFile(join(f.root,path))).equals(f.originals.get(path)));
});

test('a successful comparison is the only route to a new judgment and old journal bytes cannot be edited',async t=>{
  const f=await fixture(t),newPath='dist/data/judgment-snapshots/2026-11-07T080000000Z-bbbbbbbbbbbb.json';
  const result=await runCloudflareMarketRefresh({...f.options,execute:async step=>{
    const output=await f.execute(step);
    if(step.id==='judgment-capture'){
      await f.put(newPath,'{"immutable":"new current calculation"}\n');
      const path='dist/data/judgment-snapshots/index.json',index=JSON.parse(await readFile(join(f.root,path),'utf8'));
      index.records.unshift({id:'new-judgment',file:newPath.split('/').at(-1),sha256:refreshSha256(await readFile(join(f.root,newPath)))});await f.put(path,JSON.stringify(index)+'\n');
    }
    return output;
  }});
  assert.equal(f.calls.filter(id=>id==='judgment-capture').length,1);assert.ok((await readFile(join(f.root,oldJudgment))).equals(f.originals.get(oldJudgment)));
  const receipt=JSON.parse(await readFile(join(f.root,MARKET_REFRESH_RECEIPT_PATH),'utf8'));assert.ok(receipt.files.some(file=>file.path===newPath));
  assert.equal((await readCommittedMarketRefreshOutcomes({root:f.root,sourceCommit:result.sourceCommit})).provenance.receiptCommit,result.sourceCommit);
});

for(const invalid of ['application-file','old-record','index-entry','formal-failure'])test('refresh rejects '+invalid+' before any commit or push',async t=>{
  const f=await fixture(t);
  await assert.rejects(runCloudflareMarketRefresh({...f.options,execute:async step=>{
    const result=await f.execute(step);
    if(step.id==='research'&&invalid==='application-file')await f.put('dist/index.html','unreviewed application change\n');
    if(step.id==='forecast-build'&&invalid==='old-record')await f.put(oldForecast,'{"rewritten":true}\n');
    if(step.id==='forecast-build'&&invalid==='index-entry')await f.put('dist/data/forecast-ledger/index.json','{"entries":[]}\n');
    return step.id==='formal'&&invalid==='formal-failure'?{...result,code:1}:result;
  }}),/Unexpected refresh output|immutable journal|immutable journal index|Required refresh gate failed/);
  assert.equal(f.pushes.length,0);assert.equal(await f.git('rev-parse','HEAD'),f.baseSourceCommit);assert.equal(await f.git('diff','--cached','--name-only'),'');
});

test('push, PR, wrong repository/trigger/source and completed Build metadata are rejected before collectors run',async t=>{
  const f=await fixture(t);
  for(const change of [build=>build.build_trigger_metadata.build_trigger_source='push',build=>build.pull_request={number:1},
    build=>build.build_trigger_metadata.repo_name='another-repository',build=>build.trigger.trigger_uuid='3'.repeat(36),
    build=>build.build_trigger_metadata.commit_hash='f'.repeat(40),build=>{build.status='stopped';build.build_outcome='success';}]){
    const build=structuredClone(f.build);change(build);
    await assert.rejects(runCloudflareMarketRefresh({...f.options,readBuild:async()=>build}));
  }
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.pushes,[]);
  await assert.rejects(runCloudflareMarketRefresh({...f.options,readBuild:async()=>({...f.build,initializing_on:new Date(now-20*60*1000).toISOString()})}),/execution budget/);
});

test('a long free-plan queue does not consume the separate actual refresh execution budget',()=>{
  const build={created_on:new Date(now-60*60*1000).toISOString(),initializing_on:new Date(now-60*1000).toISOString(),running_on:new Date(now-30*1000).toISOString()};
  assert.equal(marketRefreshRemainingBudget(build,now),18*60*1000);
  assert.equal(marketRefreshRemainingBudget({...build,initializing_on:null},now),18.5*60*1000);
  for(const value of [{created_on:build.created_on},{...build,initializing_on:new Date(now+1).toISOString()},
    {...build,initializing_on:new Date(now-19*60*1000).toISOString()}])assert.throws(()=>marketRefreshRemainingBudget(value,now),/execution budget|execution clock/);
});

test('actual source environment and an explicit write credential are required without trusting clone credentials',async t=>{
  const f=await fixture(t),identity={sourceCommit:f.baseSourceCommit,sourceTree:f.baseSourceTree,runtime};
  assert.doesNotThrow(()=>assertMarketRefreshEnvironment(f.environment,identity));
  for(const change of [env=>delete env.ATLAS_DATA_GITHUB_TOKEN,env=>env.WORKERS_CI='0',env=>env.WORKERS_CI_COMMIT_SHA='f'.repeat(40),env=>env.WORKERS_CI_BRANCH='feature']){
    const environment={...f.environment};change(environment);assert.throws(()=>assertMarketRefreshEnvironment(environment,identity));
  }
  assert.throws(()=>assertMarketRefreshEnvironment(f.environment,{...identity,runtime:{...runtime,node:'v24.22.1'}}));
  await f.git('config','http.https://github.com/.extraheader','Authorization: clone credential');
  const anonymous=await marketRefreshGitEnvironment(f.root,{environment:f.environment}),authenticated=await marketRefreshGitEnvironment(f.root,{environment:f.environment,token:f.environment.ATLAS_DATA_GITHUB_TOKEN});
  assert.equal(marketRefreshCommandEnvironment(f.environment).ATLAS_DATA_GITHUB_TOKEN,undefined);
  assert.ok(!Object.values(anonymous).some(value=>String(value).includes('clone credential')));
  assert.ok(Object.entries(authenticated).some(([key,value])=>key.startsWith('GIT_CONFIG_VALUE_')&&value==='Authorization: Basic '+Buffer.from('x-access-token:'+f.environment.ATLAS_DATA_GITHUB_TOKEN).toString('base64')));
  assert.equal(await f.git('config','http.https://github.com/.extraheader'),'Authorization: clone credential','The orchestrator cannot persist a new write credential');
  await f.put('dist/index.html','dirty\n');await assert.rejects(runCloudflareMarketRefresh(f.options),/clean source checkout/);assert.deepEqual(f.calls,[]);
});

for(const race of [false,true])test('ordinary explicit-credential push '+(race?'rejects a concurrent main update':'publishes exactly the prepared source')+' in a real local Git remote',async t=>{
  const f=await fixture(t),bare=await mkdtemp(join(tmpdir(),'atlas-market-remote-'));t.after(()=>rm(bare,{recursive:true,force:true}));
  await refreshGit(bare,['init','--bare','--quiet']);await f.git('push','--quiet',bare,'HEAD:refs/heads/main');
  await f.put('dist/data/btc-daily.json','{"new":"validated source"}\n');await f.git('add','dist/data/btc-daily.json');await f.git('commit','--quiet','-m','prepared update');
  const sourceCommit=await f.git('rev-parse','HEAD'),calls=[];
  let competitor=null;if(race){competitor=await f.git('commit-tree',f.baseSourceTree,'-p',f.baseSourceCommit,'-m','concurrent main');await f.git('push','--quiet',bare,competitor+':refs/heads/competitor');}
  let checked=false;
  const git=async(root,args,options)=>{
    calls.push({args:[...args],environment:options.environment});const mapped=args.map(value=>value===MARKET_REFRESH_REMOTE?bare:value);
    const value=await refreshGit(root,mapped,options);
    if(race&&!checked&&args[0]==='ls-remote'&&args.includes('--exit-code')){checked=true;await refreshGit(bare,['update-ref','refs/heads/main',competitor]);}
    return value;
  };
  const operation=pushMarketRefreshCommit({root:f.root,sourceCommit,baseSourceCommit:f.baseSourceCommit,environment:f.environment,git});
  if(race)await assert.rejects(operation,/rejected|non-fast-forward|failed to push/i);else assert.equal((await operation).confirmed,true);
  const pushes=calls.filter(call=>call.args[0]==='push');assert.equal(pushes.length,1);
  assert.deepEqual(pushes[0].args,['push',MARKET_REFRESH_REMOTE,sourceCommit+':refs/heads/main']);
  assert.ok(!pushes[0].args.some(arg=>arg.includes('fixture-secret')||arg.includes('force')));
  assert.equal(await refreshGit(bare,['rev-parse','refs/heads/main']),race?competitor:sourceCommit);
});

test('publication refuses data edits without a new receipt and rejects fabricated source clocks or retained-failure claims',async t=>{
  const f=await fixture(t),result=await runCloudflareMarketRefresh(f.options),receipt=JSON.parse(await readFile(join(f.root,MARKET_REFRESH_RECEIPT_PATH),'utf8'));
  for(const change of [value=>value.baseSourceCommit='fake',value=>value.eventName='push',value=>value.attempts.eth.outcome='failure',
    value=>value.attempts.eth.attemptedAt='2026-11-06T08:00:00.000Z',value=>value.gates.pop(),value=>value.files[0].path='scripts/source.mjs']){
    const invalid=structuredClone(receipt);change(invalid);assert.throws(()=>assertMarketRefreshReceipt(invalid));
  }
  await f.put('dist/data/eth-ohlc.json','{"changed":"without a matching receipt"}\n');await f.git('add','dist/data/eth-ohlc.json');await f.git('commit','--quiet','-m','invalid data drift');
  await assert.rejects(readCommittedMarketRefreshOutcomes({root:f.root,sourceCommit:await f.git('rev-parse','HEAD')}),/without a matching refresh receipt/);
  assert.equal(JSON.parse(await readFile(join(f.root,MARKET_REFRESH_RESULT_PATH),'utf8')).sourceCommit,result.sourceCommit);
});
