import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {
  cloudflareStageGates,cloudflareStageGateIds,cloudflareStagedPolicy,cloudflareStagedPlanSha256,
  assertModelComponent,assertBrowserComponent,stageIdentityFromEnvironment,assertStagedVerification,createStagedVerification,
} from '../scripts/cloudflare-staged-contract.mjs';
import {cloudflareBuildGates,requiredCloudflareGateIds} from '../scripts/cloudflare-build-contract.mjs';
import {parseCloudflareStageArguments,executeCloudflareStagePlan,validateStagedModelGate} from '../scripts/verify-cloudflare-stage.mjs';
import {verifyGateReceipt} from '../scripts/cloudflare-artifact.mjs';
import {commandPriorityPrefix} from '../scripts/cloudflare-priority-command.mjs';
import {modelProviderCanonicalBytes,modelProviderSha256} from '../scripts/cloudflare-model-provider-policy.mjs';
import {modelComponentFixture,browserComponentFixture,modelAttestationFixture,stagedVerificationFixture} from './helpers/cloudflare-staged-fixture.mjs';

const now=Date.parse('2026-11-07T00:03:00.000Z');
const run=promisify(execFile);
test('two explicit Builds retain every original command and all23 gates, repeating only their runtime and dependency preparation',()=>{
  assert.equal(cloudflareStageGateIds.model.length,13);assert.equal(cloudflareStageGateIds.browser.length,12);
  assert.deepEqual([...new Set([...cloudflareStageGateIds.model,...cloudflareStageGateIds.browser])].sort(),[...requiredCloudflareGateIds].sort());
  assert.deepEqual(cloudflareStageGateIds.model.filter(id=>cloudflareStageGateIds.browser.includes(id)),['runtime-preflight','locked-dependencies']);
  for(const stage of ['model','browser'])for(const gate of cloudflareStageGates(stage))assert.deepEqual(gate,cloudflareBuildGates.find(item=>item.id===gate.id));
  assert.deepEqual(cloudflareStageGates('model').find(gate=>gate.id==='model-tests'),{id:'model-tests',command:'npm',args:['test','--','--test-concurrency=2'],nice:0});
  assert.equal(cloudflareStageGateIds.model.includes('native-browser'),false);assert.equal(cloudflareStageGateIds.browser.includes('model-tests'),false);
  assert.equal(cloudflareStagedPolicy.maximumExecutionMs,19*60*1000);assert.equal(cloudflareStagedPolicy.maximumComponentAgeMs,6*60*60*1000);
  assert.match(cloudflareStagedPlanSha256,/^[a-f0-9]{64}$/);assert.throws(()=>cloudflareStageGates('preflight'));
});

test('a complete model component requires exact canonical counts, process binding, formal pins and every actual gate; it cannot deploy the product',()=>{
  const original=modelComponentFixture();assert.equal(assertModelComponent(original,{now}),original);
  assert.throws(()=>verifyGateReceipt(original,original.sourceCommit,original.sourceTree));
  for(const mutate of [
    value=>value.status='RUNNING',value=>value.status='FAIL',value=>value.qualifiesFullVerification=true,
    value=>value.gates=[],value=>value.gates.pop(),value=>value.gates.push(value.gates[0]),value=>value.gates.reverse(),
    value=>value.gates[2].status='FAIL',value=>value.gates[2].logSha256=null,value=>value.gates[2].log='/tmp/another.log',
    value=>value.gates[2].startedAt=value.startedAt,value=>value.runtime.profile='full-chrome-postgres-and-formal-tools',
    value=>value.runtime.node='v24.22.1',value=>value.runtime.java.archiveSha256='0'.repeat(64),value=>value.runtime.tlc.sha256='0'.repeat(64),
    value=>value.modelTests.complete=false,value=>value.modelTests.tests=0,value=>value.modelTests.pass=0,
    value=>value.modelTests.batches=2,value=>value.modelTests.fail=1,value=>value.modelTests.skipped=1,
    value=>value.modelManagedPid=999,value=>value.modelPriority.actualNice=10,value=>value.modelPriority.args=['test','--','--test-concurrency=1'],
    value=>value.modelLaunchedAt=value.startedAt,value=>value.planSha256='0'.repeat(64),value=>value.runId='123',
    value=>value.workerName='bitcoin-cycle-atlas-models',value=>value.branch='main',value=>value.accountId='0'.repeat(32),
    value=>value.repository='other/project',value=>value.environment={SECRET:'must never be public'},value=>value.runtime.rawStdout='unreviewed',
    value=>value.gates[0].rawLog='unreviewed',value=>value.completedAt='2026-11-07T00:20:00.000Z',
  ]){const value=modelComponentFixture();mutate(value);assert.throws(()=>assertModelComponent(value,{now}));}
});

test('browser component retains full source-bound native coverage, isolated10x and actual database cleanup without borrowing a model gate',()=>{
  const original=browserComponentFixture();assert.equal(assertBrowserComponent(original,{now}),original);
  assert.throws(()=>verifyGateReceipt(original,original.sourceCommit,original.sourceTree));
  for(const mutate of [
    value=>value.browser.caseCount=52,value=>value.browser.scope='chart-replay',value=>value.browser.sourceIntegrity=false,
    value=>value.browser.sourceCommit='0'.repeat(40),value=>value.browser.processPriority.nice=10,
    value=>value.browser.sourceInventorySha256='0'.repeat(64),value=>value.fastCadence.status='failed',
    value=>value.fastCadence.milestone.measurement.observations.pop(),value=>value.fastCadence.milestone.restored=false,
    value=>value.fastCadence.milestone.measurement.meanMilliseconds=160,
    value=>value.database.cleanedUpAt=value.completedAt,value=>value.database.serverVersion='17.10',value=>value.database.isolated=false,
    value=>value.runtime.chrome.archiveSha256='0'.repeat(64),value=>value.runtime.postgres.packageSha256s=[],
    value=>value.nativeBrowserLaunchedAt=value.startedAt,value=>value.publication.sourceCommit='0'.repeat(40),
  ]){const value=browserComponentFixture();mutate(value);assert.throws(()=>assertBrowserComponent(value,{now}));}
});

test('staged entrypoints require actual provider source, branch and UUID, with separate production/review identities',()=>{
  const component=modelComponentFixture(),source={sourceCommit:component.sourceCommit,sourceTree:component.sourceTree};
  const environment={WORKERS_CI:'1',WORKERS_CI_BUILD_UUID:component.runId,WORKERS_CI_COMMIT_SHA:component.sourceCommit,WORKERS_CI_BRANCH:component.branch};
  assert.equal(stageIdentityFromEnvironment({stage:'model',mode:'review',source,environment}).workerName,component.workerName);
  assert.equal(stageIdentityFromEnvironment({stage:'browser',mode:'production',source,environment:{...environment,WORKERS_CI_BRANCH:'main'}}).workerName,'bitcoin-cycle-atlas');
  for(const patch of [{WORKERS_CI:'0'},{WORKERS_CI_BUILD_UUID:undefined},{WORKERS_CI_COMMIT_SHA:undefined},{WORKERS_CI_COMMIT_SHA:'0'.repeat(40)},
    {WORKERS_CI_BRANCH:'main'},{WORKERS_CI_BRANCH:'bad..ref'},{WORKERS_CI_BRANCH:'bad.lock'},{WORKERS_CI_BRANCH:undefined}])
    assert.throws(()=>stageIdentityFromEnvironment({stage:'model',mode:'review',source,environment:{...environment,...patch}}));
  assert.deepEqual(parseCloudflareStageArguments(['--stage=model','--mode=review']),{stage:'model',mode:'review'});
  for(const args of [[],['--stage=model'],['--stage=model','--mode=local'],['--stage=preflight','--mode=review'],['--stage=model','--mode=review','--skip=formal']])
    assert.throws(()=>parseCloudflareStageArguments(args));
});

test('the current verification CLI reaches the staged argument guard without a circular module wait or an implicit partial run',async()=>{
  await assert.rejects(run(process.execPath,['scripts/verify-cloudflare-build.mjs','--stage=model','--mode=local'],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),timeout:3000,
  }),error=>{assert.equal(error.code,1);assert.match(error.stderr,/Unknown verification mode/);assert.equal(error.killed,false);return true;});
});

test('an invalid actual provider environment invalidates cached deployment and component success before any runtime or command launches',async t=>{
  const directory=await mkdtemp(resolve(tmpdir(),'atlas-staged-invalidation-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await run('git',['init','--quiet'],{cwd:directory});
  await run('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','--allow-empty','-m','fixture'],{cwd:directory});
  await mkdir(resolve(directory,'build'));await writeFile(resolve(directory,'build/cloudflare-verification.json'),'"stale PASS"');
  await writeFile(resolve(directory,'build/cloudflare-model-component.json'),'"stale PASS"');
  const entry=new URL('../scripts/verify-cloudflare-stage.mjs',import.meta.url).href;
  const environment={...process.env};delete environment.WORKERS_CI;
  await assert.rejects(run(process.execPath,['--input-type=module','-e',
    `import {verifyCloudflareStage} from ${JSON.stringify(entry)};await verifyCloudflareStage({stage:'model',mode:'review',root:${JSON.stringify(directory)}});`],
  {env:environment,timeout:3000}),error=>{assert.match(error.stderr,/actual Workers Build/);return true;});
  for(const name of ['cloudflare-verification.json','cloudflare-model-component.json']){
    const receipt=JSON.parse(await readFile(resolve(directory,'build',name),'utf8'));
    assert.equal(receipt.status,'FAIL');assert.equal(receipt.qualifiesFullVerification,false);assert.deepEqual(receipt.gates,[]);
  }
});

test('the real stage plan waits for trusted model acceptance before native launch, stops on failure and never accepts a subset inventory',async()=>{
  for(const stage of ['model','browser']){
    const events=[];
    await executeCloudflareStagePlan({stage,execute:async gate=>{events.push(gate.id);return gate;},
      record:async results=>{assert.equal(results.length,1);assert.equal(results[0].status,'fulfilled');},
      beforeNative:async()=>{events.push('model-accepted');}});
    assert.deepEqual(events,stage==='model'?[...cloudflareStageGateIds.model]:cloudflareStageGateIds.browser.flatMap(id=>id==='native-browser'?['model-accepted',id]:[id]));
  }
  const events=[];
  await assert.rejects(executeCloudflareStagePlan({stage:'browser',execute:async gate=>{events.push(gate.id);},record:async()=>{},
    beforeNative:async()=>{throw new Error('Official provider check failed');}}),/Official provider check failed/);
  assert.deepEqual(events,cloudflareStageGateIds.browser.slice(0,7));
  const failed=[];
  await assert.rejects(executeCloudflareStagePlan({stage:'model',execute:async gate=>{failed.push(gate.id);if(gate.id==='model-tests')throw new Error('real model failure');},
    record:async results=>{if(results[0].status==='rejected')throw results[0].reason;}}),/real model failure/);
  assert.deepEqual(failed,cloudflareStageGateIds.model.slice(0,3));
  const controller=new AbortController(),cancelled=[];
  await assert.rejects(executeCloudflareStagePlan({stage:'browser',signal:controller.signal,
    execute:async gate=>{cancelled.push(gate.id);},record:async()=>{},
    beforeNative:async()=>{controller.abort(new Error('cancelled during model acceptance'));}}),/cancelled during model acceptance/);
  assert.deepEqual(cancelled,cloudflareStageGateIds.browser.slice(0,7));
});

test('model gate receipt parsing rejects missing, duplicated, cancelled/incomplete and reduced-count results while binding the managed process',()=>{
  const component=modelComponentFixture(),value={pid:component.modelManagedPid,launchedAt:component.modelLaunchedAt};
  const priority=commandPriorityPrefix+JSON.stringify(component.modelPriority)+'\n',total='ATLAS_TEST_TOTAL '+JSON.stringify(component.modelTests)+'\n';
  assert.deepEqual(validateStagedModelGate({value,logBytes:Buffer.from(priority+total)}).modelTests,component.modelTests);
  for(const log of [priority,priority+priority+total,priority+total+total,total,
    priority+'ATLAS_TEST_TOTAL '+JSON.stringify({...component.modelTests,complete:false})+'\n',
    priority+'ATLAS_TEST_TOTAL '+JSON.stringify({...component.modelTests,pass:2,skipped:1})+'\n',
    priority+'ATLAS_TEST_TOTAL '+JSON.stringify({...component.modelTests,tests:0,pass:0})+'\n'])
    assert.throws(()=>validateStagedModelGate({value,logBytes:Buffer.from(log)}));
  assert.throws(()=>validateStagedModelGate({value:{...value,pid:999},logBytes:Buffer.from(priority+total)}));
});

test('staged mode invokes the unchanged canonical model launcher rather than an ordered or reduced replacement',async()=>{
  const launcher=await readFile(new URL('../scripts/test.mjs',import.meta.url),'utf8');
  assert.ok(launcher.includes("const files = (await readdir(resolve(root, 'tests'))).filter(name => name.endsWith('.test.mjs')).sort();"));
  const runner=await readFile(new URL('../scripts/verify-cloudflare-stage.mjs',import.meta.url),'utf8');
  assert.ok(runner.includes("stage==='model'?bootstrapCloudflareFormal:bootstrapCloudflareBuild"));
  assert.ok(runner.includes("if(stage==='browser'){\n          database=await startIsolatedPostgres"));
  assert.ok(!runner.includes('testNamePatterns'));assert.ok(!runner.includes('forceExit'));
});

test('typed aggregate retains original producer UUIDs and exact gate/log evidence, while accepting one complete same-source model component',()=>{
  const value=stagedVerificationFixture();
  assert.equal(assertStagedVerification(value,{sourceCommit:value.sourceCommit,sourceTree:value.sourceTree,now}),value);
  assert.equal(value.components.model.gates.length,13);assert.equal(value.components.browser.gates.length,12);assert.equal(value.gates.length,23);
  assert.deepEqual(value.gates.map(gate=>gate.id),requiredCloudflareGateIds);
  assert.equal(value.gates.find(gate=>gate.id==='model-tests').buildUuid,value.components.model.runId);
  assert.equal(value.gates.find(gate=>gate.id==='native-browser').buildUuid,value.components.browser.runId);
  assert.notEqual(value.components.model.runId,value.components.browser.runId);
  const current=stagedVerificationFixture({startedAt:new Date(Date.now()-120000).toISOString(),browserStartedAt:new Date(Date.now()-60000).toISOString()});
  assert.equal(verifyGateReceipt(current,current.sourceCommit,current.sourceTree),current,'Product artifact dispatch accepts only the complete typed aggregate');
  for(const gate of value.gates){
    const original=value.components[gate.component].gates.find(item=>item.id===gate.id);
    assert.equal(gate.logSha256,original.logSha256);assert.equal(gate.log,original.log);assert.equal(gate.durationMs,original.durationMs);
  }
  for(const mutate of [
    receipt=>receipt.status='FAIL',receipt=>receipt.qualifiesFullVerification=false,receipt=>receipt.components.model.gates.pop(),
    receipt=>receipt.components.model.runId=receipt.components.browser.runId,receipt=>receipt.components.model.sourceCommit='0'.repeat(40),
    receipt=>receipt.components.model.sourceTree='0'.repeat(40),receipt=>receipt.components.model.planSha256='0'.repeat(64),
    receipt=>receipt.components.model.workerName='bitcoin-cycle-atlas-models',receipt=>receipt.gates.pop(),receipt=>receipt.gates.reverse(),
    receipt=>receipt.gates[8].buildUuid=receipt.components.browser.runId,receipt=>receipt.gates[8].logSha256='0'.repeat(64),
    receipt=>receipt.modelAttestation.acceptedAt=receipt.components.browser.completedAt,
    receipt=>receipt.modelAttestation.publication.receiptSha256='0'.repeat(64),
    receipt=>receipt.modelAttestation.consumer.buildUuid=receipt.components.model.runId,
    receipt=>receipt.modelAttestation.authority.checks[1].conclusion='failure',
    receipt=>receipt.modelAttestation.authority.checks[1].app.id=123,
    receipt=>receipt.modelAttestation.authority.checks[1].external_id=receipt.components.browser.runId,
  ]){const receipt=stagedVerificationFixture();mutate(receipt);assert.throws(()=>assertStagedVerification(receipt,{sourceCommit:value.sourceCommit,sourceTree:value.sourceTree,now}));}
});

test('provider webhook completion may follow consumer startup, but actual success acceptance must precede the isolated browser phase',()=>{
  const browser=browserComponentFixture(),model=modelComponentFixture({startedAt:'2026-11-07T00:00:44.500Z'});
  const attestation=modelAttestationFixture({model,browser,acceptedAt:'2026-11-07T00:01:06.800Z'});
  assert.ok(Date.parse(attestation.authority.checks[1].completed_at)>Date.parse(browser.startedAt));
  const value=createStagedVerification({model,browser,attestation,now});
  assert.equal(value.status,'PASS');
  // A stale pending check and a distinct successful final check are genuine
  // provider behavior. A second conflicting final check must still fail even
  // when its public snapshot hash is recomputed correctly.
  const altered=structuredClone(attestation),failure={...altered.authority.checks[1],id:3,
    url:altered.authority.checks[1].url.replace('/2','/3'),conclusion:'failure'};
  altered.authority.checks.push(failure);altered.authority.checksSha256=modelProviderSha256(modelProviderCanonicalBytes(altered.authority.checks));
  assert.throws(()=>createStagedVerification({model,browser,attestation:altered,now}),/failed or conflicting/);
  const late=modelAttestationFixture({model,browser,acceptedAt:'2026-11-07T00:01:08.000Z'});
  assert.throws(()=>createStagedVerification({model,browser,attestation:late,now}),/before the browser starts/);
});

test('staged aggregation rejects a complete but expired same-source model component instead of silently rerunning or weakening model coverage',()=>{
  const model=modelComponentFixture({startedAt:'2026-11-06T17:00:00.000Z'}),browser=browserComponentFixture();
  const attestation=modelAttestationFixture({model,browser});
  assert.throws(()=>createStagedVerification({model,browser,attestation,now}),/six-hour|too old/);
});
