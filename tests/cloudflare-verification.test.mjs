import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {cloudflareBuildGates,cloudflareParallelGroups,cloudflareBrowserExecution,cloudflareRuntime,requiredCloudflareGateIds,cloudflareBrowserCaseCount,cloudflarePlanSha256,assertCloudflareVerificationReceipt} from '../scripts/cloudflare-build-contract.mjs';
import {assertCompleteNativeBrowserReport} from '../scripts/verify-cloudflare-build.mjs';
import {missingRuntimePackages} from '../scripts/bootstrap-cloudflare-build.mjs';
import {createEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';
import {readArchivedWorkflow} from './support/archived-workflow.mjs';
import {fastCadenceFixture} from './helpers/fast-cadence-fixture.mjs';

const root=new URL('../',import.meta.url),sourceCommit='a'.repeat(40),sourceTree='b'.repeat(40);
test('rootless runtime dependency resolution only requests observed missing libraries and refuses unreviewed binaries',()=>{
  const output='linux-vdso.so.1 (0x0000)\n\tlibnss3.so => not found\n\tlibnssutil3.so => not found\n\tlibLLVM.so.19.1 => not found\n\tlibicuuc.so.74 => /lib/x86_64-linux-gnu/libicuuc.so.74 (0x1234)\n';
  assert.deepEqual(missingRuntimePackages(output),['libllvm19','libnss3']);
  assert.deepEqual(missingRuntimePackages('libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x1234)\n'),[]);
  assert.throws(()=>missingRuntimePackages('libunreviewed.so.9 => not found\n'),/Unmapped missing runtime libraries.*libunreviewed/);
});
const receipt=()=>({schemaVersion:1,kind:'atlas-cloudflare-verification',status:'PASS',sourceCommit,sourceTree,planSha256:cloudflarePlanSha256,
  startedAt:'2026-11-07T00:00:00.000Z',completedAt:'2026-11-07T00:10:00.000Z',
  runtime:{node:cloudflareRuntime.node,platform:'linux',arch:'x64'},
  gates:requiredCloudflareGateIds.map(id=>({id,status:'PASS',durationMs:1,logSha256:'c'.repeat(64)})),
  executionGroups:cloudflareParallelGroups.map(gateIds=>({gateIds,durationMs:1,startedAt:'2026-11-07T00:00:01.000Z',completedAt:'2026-11-07T00:00:01.001Z',resources:{available:false}})),
  modelPriority:{schemaVersion:1,kind:'atlas-cloudflare-command-priority',status:'APPLIED',gateId:'model-tests',requestedNice:0,beforeNice:0,actualNice:0,
    wrapperPid:102,parentPid:101,parentNice:0,commandPid:103,commandNice:0,command:'npm',args:['test','--','--test-concurrency=2']},
  fastCadence:fastCadenceFixture({sourceCommit,sourceTree}).release,modelLaunchedAt:'2026-11-07T00:00:04.000Z',
  browser:{caseCount:cloudflareBrowserCaseCount,scope:'all',sourceCommit,sourceIntegrity:true,reportSha256:'d'.repeat(64),processPriority:{pid:104,nice:0},
    suiteRunId:fastCadenceFixture().context.suiteRunId,sourceInventorySha256:fastCadenceFixture().context.sourceInventorySha256}});
const browser=()=>({status:'passed',caseScope:'all',sourceCommit,declaredCaseCount:cloudflareBrowserCaseCount,expectedCaseCount:cloudflareBrowserCaseCount,
  cases:createEthBrowserCaseSpecs().map(caseSpec=>({caseSpec,status:'passed',screenshots:[{file:'synthetic-unit-fixture.png'}]})),
  failures:[],sourceIntegrity:{unchangedDuringRun:true,changedSources:[],checkedFiles:1}});

test('Cloudflare deployment receipt rejects partial, stale, failed and inspect-only execution',()=>{
  assert.equal(assertCloudflareVerificationReceipt(receipt(),{sourceCommit,sourceTree}).status,'PASS');
  for(const change of [
    value=>value.status='INSPECTED_ONLY',value=>value.status='RUNNING',value=>value.sourceCommit='e'.repeat(40),
    value=>value.sourceTree='f'.repeat(40),value=>value.planSha256='0'.repeat(64),value=>value.gates.pop(),
    value=>value.gates.push(value.gates[0]),value=>value.gates.reverse(),value=>value.gates[0].status='FAIL',
    value=>value.gates[0].logSha256=null,value=>value.browser.caseCount--,value=>value.browser.scope='workspace-consolidated',
    value=>value.browser.sourceCommit='f'.repeat(40),value=>value.browser.sourceIntegrity=false,
    value=>value.runtime.node='v24.22.1',value=>value.completedAt='2026-11-06T00:00:00.000Z',
    value=>value.executionGroups=[{gateIds:['native-browser'],durationMs:1,startedAt:'2026-11-07T00:00:01.000Z',completedAt:'2026-11-07T00:00:01.001Z',resources:{available:false}}],value=>value.executionGroups=[{gateIds:['native-browser','model-tests'],durationMs:1,startedAt:'2026-11-07T00:00:01.000Z',completedAt:'2026-11-07T00:00:01.001Z',resources:{available:false}}],
    value=>value.modelPriority=null,value=>value.modelPriority.requestedNice=10,value=>value.modelPriority.actualNice=10,value=>value.modelPriority.commandNice=10,value=>value.modelPriority.parentNice=10,
    value=>value.modelPriority.args=['test','--','--test-concurrency=1'],value=>value.browser.processPriority.nice=10,
    value=>value.fastCadence.status='failed',value=>value.fastCadence=null,value=>value.modelLaunchedAt='2026-11-07T00:00:02.000Z',
    value=>value.browser.suiteRunId='22222222-2222-4222-8222-222222222222',
  ]){const value=receipt();change(value);assert.throws(()=>assertCloudflareVerificationReceipt(value,{sourceCommit,sourceTree}));}
});

test('complete native receipt requires every source case and actual screenshot records, with unchanged sources',()=>{
  assertCompleteNativeBrowserReport(browser(),sourceCommit);
  for(const change of [value=>value.status='failed',value=>value.caseScope='data',value=>value.cases.pop(),
    value=>value.cases.reverse(),value=>value.cases[0].status='skipped',value=>value.cases[0].screenshots=[],
    value=>value.failures.push({error:'render exception'}),value=>value.sourceIntegrity.unchangedDuringRun=false,
    value=>value.sourceIntegrity.changedSources.push('dist/index.html'),value=>value.sourceCommit='f'.repeat(40),
  ]){const value=browser();change(value);assert.throws(()=>assertCompleteNativeBrowserReport(value,sourceCommit));}
});

test('the migrated build retains ordinary model, numerical, formal, PostgreSQL and complete native browser gates',()=>{
  const commands=new Set(cloudflareBuildGates.filter(gate=>gate.command==='npm').map(gate=>gate.args.join(' ')));
  for(const name of ['pages','forecast','research','eth-events','treasury-paths','numerics','formal','cycle','performance','static','chart-replay','publication'])
    assert.ok(commands.has('run verify:'+name),'Missing actual verification command '+name);
  assert.ok(commands.has('test -- --test-concurrency=2'));
  assert.deepEqual(cloudflareBuildGates.filter(gate=>gate.nice!==undefined).map(gate=>[gate.id,gate.nice]),[['model-tests',0]]);
  // The cadence sample inside native-browser measures wall-clock replay timing;
  // it now runs alone so CPU-heavy model-tests cannot distort that measurement.
  assert.deepEqual(cloudflareParallelGroups,[]);
  assert.equal(cloudflareBrowserExecution.maximumProcesses,2);assert.equal(cloudflareBrowserExecution.perLaneConcurrency,1);
  assert.deepEqual(cloudflareBrowserExecution.lanes.map(lane=>lane.scope),['non-chart-replay','chart-replay']);
  assert.equal(cloudflareBrowserExecution.lanes.reduce((count,lane)=>count+lane.caseCount,0),cloudflareBrowserCaseCount);
  assert.deepEqual(cloudflareBuildGates.find(gate=>gate.id==='native-browser').args,['scripts/verify-native-browser-suite.mjs']);
  assert.ok(commands.has('run typecheck'));assert.ok(commands.has('run build:web'));
  for(const id of ['panel-tests','postgres-service-tests','native-browser','standalone','standalone-check'])assert.ok(requiredCloudflareGateIds.includes(id));
  assert.equal(cloudflareBrowserCaseCount,createEthBrowserCaseSpecs().length);
  assert.ok(cloudflareBrowserCaseCount>=53);
  assert.equal(cloudflareRuntime.postgres.version,'17.11');assert.equal(cloudflareRuntime.node,'v24.22.2');
});

test('all seven old GitHub triggers are nonexecuting, byte-preserved contracts with explicit replacement obligations',async()=>{
  const migration=JSON.parse(await readFile(new URL('ops/ci-migration.json',root),'utf8'));
  const names=['ci','pages','market-lab-service','eth-model-evaluation','refresh-data','eth-prospective-daily','release'];
  assert.deepEqual(migration.archives.map(item=>item.name),names);
  assert.deepEqual((await readdir(new URL('.github/workflows/',root))).filter(file=>/\.ya?ml$/i.test(file)),[]);
  for(const name of names)assert.ok(readArchivedWorkflow(name).startsWith('name:'));
  assert.deepEqual(migration.schedules.map(item=>[item.id,item.cron,item.runsPerDay]),[
    ['completed-market-data','20 0,6,12,18 * * *',4],['eth-prospective-archive','17 1 * * *',1],
  ]);
  for(const schedule of migration.schedules){assert.equal(typeof schedule.activationVerified,'boolean');assert.ok(schedule.required.length>=8);}
  assert.equal(migration.limits.maximumBuildMinutes,20);
  assert.equal(migration.limits.freeBuildMinutesPerMonth,3000);
});
