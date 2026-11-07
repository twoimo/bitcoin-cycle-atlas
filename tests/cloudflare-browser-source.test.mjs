import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {
  readBrowserBuildSource,assertBrowserBuildSource,assertWorkersBuildSource,publicationSourceProvenance,
} from '../scripts/cloudflare-browser-source.mjs';
import {stageIdentityFromEnvironment,createStagedVerification} from '../scripts/cloudflare-staged-contract.mjs';
import {modelProviderCanonicalBytes,modelProviderSha256} from '../scripts/cloudflare-model-provider-policy.mjs';
import {modelComponentFixture,browserComponentFixture,modelAttestationFixture} from './helpers/cloudflare-staged-fixture.mjs';

const run=promisify(execFile),clone=value=>structuredClone(value);
const source={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40)},branch='verify/staged-contract';
const buildUuid='22222222-2222-4222-8222-222222222222';
const environment={WORKERS_CI:'1',WORKERS_CI_BUILD_UUID:buildUuid,WORKERS_CI_COMMIT_SHA:branch,WORKERS_CI_BRANCH:branch};
const now=Date.parse('2026-11-07T00:02:00.000Z');
function gitFixture(options={}){
  const calls=[];
  const gitRead=args=>{
    calls.push(args);
    if(args[0]==='rev-parse')return args[1]==='HEAD'?(options.head??source.sourceCommit):(options.tree??source.sourceTree);
    if(args[0]==='status')return options.dirty??'';
    if(args[0]==='check-ref-format')return args[2];
    if(args[0]==='ls-remote'){
      assert.deepEqual(args.slice(0,4),['ls-remote','--exit-code','--refs','https://github.com/twoimo/bitcoin-cycle-atlas.git']);
      return options.remote??source.sourceCommit+'\t'+args[4];
    }
    throw new Error('Unexpected Git read '+args.join(' '));
  };
  return {gitRead,calls};
}
function resolveSource({env=environment,mode='review',...gitOptions}={}){
  const git=gitFixture(gitOptions);
  return {value:readBrowserBuildSource({root:'/fixture',environment:env,mode,source,gitRead:git.gitRead}),...git};
}
async function records(t,{mode='review',refKind='branch',status='RUNNING'}={}){
  const root=await mkdtemp(resolve(tmpdir(),'atlas-browser-source-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const actualBranch=mode==='production'?'main':branch;
  const model=modelComponentFixture({mode,branch:actualBranch});
  const browser=browserComponentFixture({mode,branch:actualBranch,providerRef:refKind==='branch'?actualBranch:source.sourceCommit});
  const accepted={component:model,attestation:modelAttestationFixture({model,browser})};
  const verification=createStagedVerification({model,browser,attestation:accepted.attestation,now});
  browser.status=status;
  await mkdir(resolve(root,'build'));
  const save=async()=>{
    await writeFile(resolve(root,'build/cloudflare-browser-component.json'),JSON.stringify(browser));
    await writeFile(resolve(root,'build/cloudflare-model-acceptance.json'),JSON.stringify(accepted));
  };
  await save();
  const env={...environment,WORKERS_CI_COMMIT_SHA:browser.providerSource.rawRef,WORKERS_CI_BRANCH:actualBranch};
  const git=gitFixture();
  return {root,browser,accepted,verification,env,save,git,
    check:extra=>assertWorkersBuildSource({root,environment:env,source,gitRead:git.gitRead,now,...extra})};
}

test('browser branch resolution preserves raw provider identity and resolves only the exact fixed-repository branch',()=>{
  const before=clone(environment),{value,calls}=resolveSource();
  assert.deepEqual(environment,before);assert.ok(Object.isFrozen(value));
  assert.equal(value.rawRef,branch);assert.equal(value.refKind,'branch');assert.equal(value.sourceCommit,source.sourceCommit);
  assert.equal(value.sourceTree,source.sourceTree);assert.equal(value.remoteHead,source.sourceCommit);
  assert.equal(calls.filter(args=>args[0]==='ls-remote').length,1);
  assert.equal(calls.at(-1).at(-1),'refs/heads/'+branch);
  assert.equal(assertBrowserBuildSource(value,{source,environment,mode:'review',branch,runId:buildUuid}),value);
});

test('a full provider SHA mismatch never falls back even when the CI branch has that SHA-shaped name',()=>{
  for(const wrong of ['c'.repeat(40),'C'.repeat(40),'aC'.repeat(20)]){
    const git=gitFixture();
    assert.throws(()=>readBrowserBuildSource({root:'/fixture',environment:{...environment,WORKERS_CI_COMMIT_SHA:wrong,WORKERS_CI_BRANCH:wrong},
      mode:'review',source,gitRead:git.gitRead}),/commits differ/);
    assert.equal(git.calls.some(args=>args[0]==='ls-remote'),false);
  }
  const good=resolveSource({env:{...environment,WORKERS_CI_COMMIT_SHA:source.sourceCommit}});
  assert.equal(good.value.refKind,'commit');assert.equal(good.value.remoteHead,null);
  assert.equal(good.calls.some(args=>args[0]==='ls-remote'),false);
});

test('branch aliases, malformed identity, wrong production policy, dirty source and ambiguous remote reads fail closed',()=>{
  for(const value of ['',undefined,'HEAD','refs/heads/'+branch,'refs/tags/v1','another/branch']){
    assert.throws(()=>resolveSource({env:{...environment,WORKERS_CI_COMMIT_SHA:value}}));
  }
  for(const patch of [{WORKERS_CI:'0'},{WORKERS_CI_BUILD_UUID:undefined},{WORKERS_CI_BUILD_UUID:'not-a-uuid'},
    {WORKERS_CI_BRANCH:'bad..ref'},{WORKERS_CI_BRANCH:'-option'},{WORKERS_CI_BRANCH:'bad.lock'}]){
    assert.throws(()=>resolveSource({env:{...environment,...patch}}));
  }
  assert.throws(()=>resolveSource({mode:'production'}));
  assert.throws(()=>resolveSource({env:{...environment,WORKERS_CI_BRANCH:'main',WORKERS_CI_COMMIT_SHA:'main'}}));
  assert.equal(resolveSource({mode:'production',env:{...environment,WORKERS_CI_BRANCH:'main',WORKERS_CI_COMMIT_SHA:'main'}}).value.branch,'main');
  for(const options of [{dirty:'?? unreviewed.js'},{head:'c'.repeat(40)},{tree:'c'.repeat(40)},
    {remote:''},{remote:source.sourceCommit+'\trefs/tags/'+branch},
    {remote:source.sourceCommit+'\trefs/heads/'+branch+'\n'+source.sourceCommit+'\trefs/heads/'+branch},
    {remote:'c'.repeat(40)+'\trefs/heads/'+branch}]){
    assert.throws(()=>resolveSource(options));
  }
});

test('browser identity does not authorize model-stage branch refs and pure validation ignores unrelated ambient provider state',()=>{
  const {value}=resolveSource();
  const browser=stageIdentityFromEnvironment({stage:'browser',mode:'review',source,environment,providerSource:value});
  assert.deepEqual(browser.providerSource,value);
  assert.throws(()=>stageIdentityFromEnvironment({stage:'model',mode:'review',source,environment,providerSource:value}),/commits differ/);
  assert.equal(assertBrowserBuildSource(value,{source,mode:'review',branch,runId:buildUuid}),value);
  for(const mutate of [x=>x.rawRef='another',x=>x.buildUuid='33333333-3333-4333-8333-333333333333',
    x=>x.sourceTree='c'.repeat(40),x=>x.remoteHead='c'.repeat(40),x=>x.unreviewed=true]){
    const changed=clone(value);mutate(changed);
    assert.throws(()=>assertBrowserBuildSource(changed,{source,environment,mode:'review',branch,runId:buildUuid}));
  }
});

test('current RUNNING browser header needs complete accepted A before native or publication, without Atlas stage hints',async t=>{
  const f=await records(t);
  assert.equal(f.env.ATLAS_VERIFICATION_STAGE,undefined);assert.equal(f.env.ATLAS_VERIFICATION_MODE,undefined);
  assert.deepEqual(await f.check(),f.browser.providerSource);
  await rm(resolve(f.root,'build/cloudflare-model-acceptance.json'));
  await assert.rejects(f.check(),/ENOENT/);
});

test('a cold separate Node process can validate same-B PASS source for package/deploy from fixed records and full aggregate',async t=>{
  for(const mode of ['review','production']){
    const f=await records(t,{mode,status:'PASS'});
    assert.deepEqual(await f.check({verification:f.verification}),f.browser.providerSource);
    const fixture=resolve(f.root,'fixture.json');
    await writeFile(fixture,JSON.stringify({source,verification:f.verification,now}));
    const moduleUrl=new URL('../scripts/cloudflare-browser-source.mjs',import.meta.url).href;
    const expression='const {readFile}=await import("node:fs/promises");'+
      'const {assertWorkersBuildSource}=await import('+JSON.stringify(moduleUrl)+');'+
      'const input=JSON.parse(await readFile('+JSON.stringify(fixture)+',"utf8"));'+
      'const gitRead=args=>args[0]==="rev-parse"?(args[1]==="HEAD"?input.source.sourceCommit:input.source.sourceTree):'+
      'args[0]==="status"?"":args[0]==="check-ref-format"?args[2]:input.source.sourceCommit+"\\t"+args[4];'+
      'const value=await assertWorkersBuildSource({...input,root:'+JSON.stringify(f.root)+',gitRead});process.stdout.write(JSON.stringify(value));';
    const env={...process.env,...f.env};delete env.ATLAS_VERIFICATION_MODE;delete env.ATLAS_VERIFICATION_STAGE;
    const result=await run(process.execPath,['--input-type=module','-e',expression],{env,timeout:5000});
    assert.deepEqual(JSON.parse(result.stdout),f.browser.providerSource);
  }
});

test('stale FAIL headers, another Build, changed raw provenance and current source/remote races cannot reuse A acceptance',async t=>{
  const mutations=[
    f=>f.browser.status='FAIL',f=>f.browser.runId='33333333-3333-4333-8333-333333333333',
    f=>f.browser.providerSource.rawRef=source.sourceCommit,
    f=>f.accepted.attestation.consumer.providerSource={...f.browser.providerSource,rawRef:source.sourceCommit,refKind:'commit',remoteHead:null},
    f=>f.env.WORKERS_CI_BUILD_UUID='33333333-3333-4333-8333-333333333333',
    f=>f.env.WORKERS_CI_BRANCH='verify/other',
  ];
  for(const mutate of mutations){const f=await records(t);mutate(f);await f.save();await assert.rejects(f.check());}
  const f=await records(t);assert.deepEqual(await f.check(),f.browser.providerSource);
  for(const options of [{head:'c'.repeat(40)},{tree:'c'.repeat(40)},{dirty:' M scripts/a.mjs'},
    {remote:'c'.repeat(40)+'\trefs/heads/'+branch}]){
    await assert.rejects(f.check({gitRead:gitFixture(options).gitRead}));
  }
  assert.equal(f.browser.providerSource.sourceCommit,source.sourceCommit,'A remote race cannot overwrite the frozen source');
});

test('failed, pending, mixed-plan or expired model authority remains ineligible through the branch-aware downstream guard',async t=>{
  const mutations=[
    f=>f.accepted.component.status='FAIL',f=>f.accepted.component.planSha256='c'.repeat(64),
    f=>f.accepted.component.sourceTree='c'.repeat(40),
    f=>{f.accepted.attestation.authority.checks[1].conclusion='failure';},
    f=>{f.accepted.attestation.authority.checks.splice(1);f.accepted.attestation.authority.terminalCheckIds=[];},
  ];
  for(const mutate of mutations){
    const f=await records(t);mutate(f);
    f.accepted.attestation.authority.checksSha256=modelProviderSha256(modelProviderCanonicalBytes(f.accepted.attestation.authority.checks));
    await f.save();await assert.rejects(f.check());
  }
  const f=await records(t);await assert.rejects(f.check({now:now+7*60*60*1000}),/old/);
});

test('the complete aggregate must retain the exact current B proof and the same accepted model authority',async t=>{
  const f=await records(t,{status:'PASS'});
  for(const mutate of [
    v=>v.components.browser.providerSource={...v.components.browser.providerSource,rawRef:source.sourceCommit,refKind:'commit',remoteHead:null},
    v=>v.components.browser.runId='33333333-3333-4333-8333-333333333333',
    v=>v.modelAttestation.consumer.providerSource.rawRef='other',
    v=>v.status='RUNNING',
  ]){
    const verification=clone(f.verification);mutate(verification);
    await assert.rejects(f.check({verification}));
  }
});

test('literal SHA and local preview guards preserve their old path, while a branch cannot bypass fixed B evidence',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'atlas-browser-source-empty-'));t.after(()=>rm(root,{recursive:true,force:true}));
  assert.equal(await assertWorkersBuildSource({root,environment:{},source}),null);
  assert.equal(await assertWorkersBuildSource({root,environment:{WORKERS_CI_COMMIT_SHA:source.sourceCommit},source}),null);
  await assert.rejects(assertWorkersBuildSource({root,environment:{WORKERS_CI_COMMIT_SHA:'c'.repeat(40)},source}),/does not match/);
  await assert.rejects(assertWorkersBuildSource({root,environment,source}),/ENOENT/);
  await assert.rejects(assertWorkersBuildSource({root,environment:{...environment,WORKERS_CI_COMMIT_SHA:undefined,ATLAS_VERIFICATION_STAGE:'browser'},source}),/actual provider source/);
  const f=await records(t,{status:'PASS',refKind:'commit'});
  assert.deepEqual(await f.check({verification:f.verification}),f.browser.providerSource);
});

test('publication keeps branch provenance separate from event commit SHA and retains the original raw provider value',()=>{
  const branchSource=resolveSource().value;
  const branchFields=publicationSourceProvenance(environment,branchSource);
  assert.equal(branchFields.eventCommit,null);assert.equal(branchFields.providerSource.rawRef,environment.WORKERS_CI_COMMIT_SHA);
  assert.equal(branchFields.providerSource.sourceCommit,source.sourceCommit);
  const env={...environment,WORKERS_CI_COMMIT_SHA:source.sourceCommit},commitSource=resolveSource({env}).value;
  assert.equal(publicationSourceProvenance(env,commitSource).eventCommit,source.sourceCommit);
  assert.deepEqual(publicationSourceProvenance({},null),{eventCommit:null});
});
