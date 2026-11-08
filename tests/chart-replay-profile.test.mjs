import test from 'node:test';
import assert from 'node:assert/strict';
import {readReplayDiagnosticOptions,replayProfileEnabled,replayProfileEnvironmentKey,profileEarlyReplayCadence} from '../scripts/chart-replay-profile.mjs';
import {fastCadencePolicy} from '../scripts/browser-fast-cadence-contract.mjs';

const source='a'.repeat(40),tree='b'.repeat(40),runId='11111111-1111-4111-8111-111111111111';
const environment={WORKERS_CI:'1',WORKERS_CI_COMMIT_SHA:source,WORKERS_CI_BUILD_UUID:runId,
  ATLAS_BROWSER_CASE_SCOPE:'chart-replay',ATLAS_BROWSER_LANE:'chart-replay',ATLAS_BROWSER_SUITE_RUN_ID:runId,
  [replayProfileEnvironmentKey]:'1'};

// These are CDP/control-flow fixtures, not Chrome timing or browser evidence.
function fixture({fail={},profileMissing=false,snapshotMissing=false,onCaptured}={}){
  const calls=[],receipt={},captures=[];
  const cpuProfile={nodes:[{id:1,callFrame:{functionName:'fixture',url:'fixture.js',scriptId:'1',lineNumber:0,columnNumber:0}}],
    startTime:10000,endTime:12000,samples:[1,1],timeDeltas:[1000,1000]};
  const cdp={send:async method=>{calls.push(method);if(fail[method])throw fail[method];
    if(method==='Profiler.stop')return profileMissing?{}:{profile:cpuProfile};
    if(method==='Performance.getMetrics')return {metrics:[{name:'Timestamp',value:1},{name:'TaskDuration',value:.01}]};
    return {};}};
  let now=0;
  const evaluate=async()=>({now:now+=5,timeOrigin:1000000,url:'http://fixture.invalid/',
    ...(snapshotMissing?{}:{atlas:{observations:{longTasks:[]},actions:{entries:[]}}})});
  const identity={sourceCommit:source,sourceTree:tree,sourceInventorySha256:'c'.repeat(64),suiteRunId:runId,
    providerBuildUuid:runId,lane:'chart-replay',caseSpec:{...fastCadencePolicy.caseSpec},phase:fastCadencePolicy.phase};
  const measurement={observations:[{cursor:'2026-10-21',at:11},{cursor:'2026-10-22',at:14}]};
  const options={cdp,evaluate,receipt,identity,expectedCaseSpec:fastCadencePolicy.caseSpec,readMeasurement:()=>measurement,
    onCaptured:async capture=>{captures.push(structuredClone(capture));await onCaptured?.(capture);}};
  return {calls,receipt,captures,cpuProfile,identity,measurement,options,run:callback=>profileEarlyReplayCadence(options,callback)};
}

test('profiling is opt-in and rejects canonical, unrelated, malformed and ambiguous diagnostic inputs',async()=>{
  const args=['--expected-source='+source,'--expected-tree='+tree];
  assert.deepEqual(readReplayDiagnosticOptions(args),{'expected-source':source,'expected-tree':tree,profile:false});
  assert.equal(readReplayDiagnosticOptions([...args,'--profile']).profile,true);
  for(const invalid of [[...args,'--profile','--profile'],[...args,'--expected-source='+source],[...args,'--profile=1'],args.slice(1),[...args,'--scope=all']])
    assert.throws(()=>readReplayDiagnosticOptions(invalid));
  assert.equal(replayProfileEnabled({ATLAS_VERIFICATION_STAGE:'browser'}),false);
  assert.equal(replayProfileEnabled(environment),true);
  for(const overrides of [{[replayProfileEnvironmentKey]:'0'},{ATLAS_VERIFICATION_STAGE:'browser'},{ATLAS_VERIFICATION_MODE:'review'},
    {ATLAS_UI_REVIEW:'wp4-wp7'},{ATLAS_BROWSER_LANE:'non-chart-replay'},{ATLAS_BROWSER_CASE_SCOPE:'all'},
    {ATLAS_BROWSER_SUITE_RUN_ID:''},{WORKERS_CI:'0'},{WORKERS_CI_COMMIT_SHA:'main'},{WORKERS_CI_BUILD_UUID:''}])
    assert.throws(()=>replayProfileEnabled({...environment,...overrides}));
  const wrong=fixture();wrong.identity.caseSpec.width=320;
  await assert.rejects(wrong.run(async()=>{}),/another replay case/);assert.deepEqual(wrong.calls,[]);
});

test('profile capture retains raw samples, independent clocks and metrics before returning the original result',async()=>{
  const f=fixture(),result={originalPhaseResult:true};
  assert.equal(await f.run(async()=>{
    assert.equal(f.calls.at(-1),'Profiler.start');assert.equal(f.receipt.earlyCadenceProfile.phaseStatus,'running');return result;
  }),result);
  const capture=f.receipt.earlyCadenceProfile;
  assert.deepEqual(capture.cpuProfile,f.cpuProfile);assert.equal(capture.sourceCommit,source);assert.equal(capture.sourceTree,tree);
  assert.equal(capture.suiteRunId,runId);assert.deepEqual(capture.caseSpec,fastCadencePolicy.caseSpec);
  assert.equal(capture.status,'collected');assert.equal(capture.phaseStatus,'passed');
  assert.equal(capture.qualifiesCadence,false);assert.equal(capture.qualifiesFullVerification,false);
  assert.equal(capture.cursorWindow.first,f.measurement.observations[0]);assert.equal(capture.cursorWindow.last,f.measurement.observations[1]);
  assert.ok(capture.clockAnchors.beforeProfilerStart.now<capture.clockAnchors.afterProfilerStart.now);
  assert.ok(capture.clockAnchors.beforeProfilerStop.now<capture.clockAnchors.afterProfilerStop.now);
  assert.equal(capture.metrics.before.metrics[0].name,'Timestamp');assert.equal(capture.metrics.after.metrics[0].name,'Timestamp');
  assert.ok(capture.snapshots.before.atlas);assert.ok(capture.snapshots.after.atlas);
  assert.deepEqual(f.calls,['Performance.enable','Profiler.enable','Performance.getMetrics','Profiler.start','Profiler.stop','Performance.getMetrics','Profiler.disable','Performance.disable']);
  assert.equal(f.captures.length,1);assert.deepEqual(f.captures[0],capture);
});

test('an unchanged phase failure still stops and transports the complete profile before rethrowing the same error',async()=>{
  const original=new Error('unchanged cadence threshold failed'),f=fixture();
  await assert.rejects(f.run(async()=>{throw original;}),error=>error===original);
  assert.equal(f.receipt.earlyCadenceProfile.phaseStatus,'failed');assert.equal(f.receipt.earlyCadenceProfile.status,'collected');
  assert.deepEqual(f.receipt.earlyCadenceProfile.cpuProfile,f.cpuProfile);
  assert.deepEqual(f.calls.slice(-3),['Performance.getMetrics','Profiler.disable','Performance.disable']);
  assert.equal(f.captures.length,1);assert.match(f.captures[0].error,/unchanged cadence threshold/);
});

test('a failed profiler start never runs the phase and still attempts stop, capture and domain cleanup',async()=>{
  const startError=new Error('start response lost'),f=fixture({fail:{'Profiler.start':startError}});let ran=false;
  await assert.rejects(f.run(async()=>{ran=true;}),error=>error instanceof AggregateError&&error.errors.includes(startError));
  assert.equal(ran,false);assert.equal(f.receipt.earlyCadenceProfile.phaseStatus,'not-started');
  assert.equal(f.receipt.earlyCadenceProfile.status,'failed');assert.ok(f.calls.includes('Profiler.stop'));
  assert.deepEqual(f.calls.slice(-2),['Profiler.disable','Performance.disable']);assert.equal(f.captures.length,1);
});

test('cleanup failure preserves the original phase error and does not prevent the remaining evidence or disable attempts',async()=>{
  const original=new Error('original native failure'),stopError=new Error('stop response lost'),f=fixture({fail:{'Profiler.stop':stopError}});
  await assert.rejects(f.run(async()=>{throw original;}),error=>error instanceof AggregateError&&error.errors[0]===original&&error.errors.includes(stopError));
  const capture=f.receipt.earlyCadenceProfile;
  assert.equal(capture.status,'failed');assert.equal(capture.phaseStatus,'failed');assert.equal(capture.cpuProfile,null);
  assert.ok(capture.metrics.after);assert.ok(capture.snapshots.after.atlas);
  assert.deepEqual(f.calls.slice(-2),['Profiler.disable','Performance.disable']);assert.equal(f.captures.length,1);
  assert.ok(capture.errors.some(error=>error.operation==='Profiler.stop'));
});

test('missing raw profile or existing diagnostics cannot become a successful capture',async()=>{
  for(const missing of [{profileMissing:true},{snapshotMissing:true}]){
    const f=fixture(missing);await assert.rejects(f.run(async()=>true));
    assert.equal(f.receipt.earlyCadenceProfile.status,'failed');assert.equal(f.captures.length,1);
    assert.deepEqual(f.calls.slice(-2),['Profiler.disable','Performance.disable']);
    assert.ok(f.receipt.earlyCadenceProfile.errors.some(error=>error.operation==='validate-captured-evidence'));
  }
});

test('immediate transport failure remains nonzero and cannot erase an original phase failure',async()=>{
  const original=new Error('native cadence failed'),transportError=new Error('stdout transport failed');
  const f=fixture({onCaptured:()=>{throw transportError;}});
  await assert.rejects(f.run(async()=>{throw original;}),error=>error instanceof AggregateError&&error.errors[0]===original&&error.errors.includes(transportError));
  assert.equal(f.receipt.earlyCadenceProfile.status,'failed');assert.deepEqual(f.receipt.earlyCadenceProfile.cpuProfile,f.cpuProfile);
  assert.equal(f.captures.length,1);assert.deepEqual(f.calls.slice(-2),['Profiler.disable','Performance.disable']);
});
