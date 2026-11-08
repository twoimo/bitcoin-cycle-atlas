import assert from 'node:assert/strict';

export const replayProfileEnvironmentKey='ATLAS_REPLAY_DIAGNOSTIC_PROFILE';
const sha=/^[a-f0-9]{40}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const errorText=error=>error instanceof Error?(error.stack||error.message):String(error);

export function readReplayDiagnosticOptions(argv){
  const options={profile:false};
  for(const value of argv){
    if(value==='--profile'){assert.equal(options.profile,false,'Duplicate profile option');options.profile=true;continue;}
    const match=/^--(expected-source|expected-tree)=([a-f0-9]{40})$/.exec(value);
    assert.ok(match,'Two exact immutable source arguments and optional --profile are required');
    assert.equal(options[match[1]],undefined,'Duplicate source option');options[match[1]]=match[2];
  }
  assert.match(options['expected-source']??'',sha);assert.match(options['expected-tree']??'',sha);
  return options;
}

export function replayProfileEnabled(environment){
  if(environment[replayProfileEnvironmentKey]===undefined)return false;
  assert.equal(environment[replayProfileEnvironmentKey],'1','Unknown replay profiling mode');
  assert.equal(environment.ATLAS_VERIFICATION_STAGE,undefined,'Profiling cannot run in a canonical stage');
  assert.equal(environment.ATLAS_VERIFICATION_MODE,undefined,'Profiling cannot run in canonical verification');
  assert.equal(environment.ATLAS_UI_REVIEW,undefined,'Profiling is not a UI review mode');
  assert.equal(environment.ATLAS_BROWSER_LANE,'chart-replay','Profiling requires the replay diagnostic lane');
  assert.equal(environment.ATLAS_BROWSER_CASE_SCOPE,'chart-replay','Profiling must retain all seven replay cases');
  assert.match(environment.ATLAS_BROWSER_SUITE_RUN_ID??'',uuid);
  assert.equal(environment.WORKERS_CI,'1');assert.match(environment.WORKERS_CI_COMMIT_SHA??'',sha);
  assert.match(environment.WORKERS_CI_BUILD_UUID??'',uuid);
  return true;
}

// This captures the existing early phase, including its native setup/restoration.
// Its sampled timing is diagnostic only, and cannot release a canonical gate.
export async function profileEarlyReplayCadence({cdp,evaluate,receipt,identity,expectedCaseSpec,readMeasurement,onCaptured=()=>{}},run){
  assert.deepEqual(identity.caseSpec,expectedCaseSpec,'CPU evidence belongs to another replay case');
  for(const key of ['sourceCommit','sourceTree'])assert.match(identity[key]??'',sha);
  assert.match(identity.sourceInventorySha256??'',/^[a-f0-9]{64}$/);
  assert.match(identity.suiteRunId??'',uuid);assert.match(identity.providerBuildUuid??'',uuid);
  assert.equal(identity.lane,'chart-replay');
  assert.equal(receipt.earlyCadenceProfile,undefined,'The early replay phase may be profiled only once');
  const capture=receipt.earlyCadenceProfile={schemaVersion:1,kind:'atlas-early-replay-cpu-diagnostic',
    qualifiesFullVerification:false,qualifiesCadence:false,...identity,status:'running',phaseStatus:'not-started',
    startedAt:new Date().toISOString(),cpuProfile:null,metrics:{before:null,after:null},snapshots:{before:null,after:null},
    clockAnchors:{},errors:[],
    scope:'Original early native replay phase including setup/restoration. CPU sampling adds overhead; cadence is not qualification. Cursor observations and Atlas long tasks use page performance.now milliseconds. CPU-profile start/end microseconds are bracketed by the page-clock anchors, not assumed to be exact page timestamps.'};
  const errors=[];
  const checked=async(operation,fn)=>{try{return await fn();}catch(error){errors.push(error);capture.errors.push({operation,error:errorText(error)});throw error;}};
  const recover=async(operation,fn)=>{try{return await checked(operation,fn);}catch{return null;}};
  const clock=()=>evaluate(cdp,()=>({now:performance.now(),timeOrigin:performance.timeOrigin,url:location.href}));
  const snapshot=()=>evaluate(cdp,()=>{
    if(typeof window.AtlasPerformance?.snapshot!=='function')throw new Error('The existing Atlas performance recorder is unavailable');
    const atlas=window.AtlasPerformance.snapshot();
    return {now:performance.now(),timeOrigin:performance.timeOrigin,url:location.href,atlas};
  });
  let performanceEnabled=false,profilerEnabled=false,startAttempted=false,result,failure;
  try{
    performanceEnabled=true;await checked('Performance.enable',()=>cdp.send('Performance.enable'));
    profilerEnabled=true;await checked('Profiler.enable',()=>cdp.send('Profiler.enable'));
    capture.metrics.before=await checked('Performance.getMetrics.before',()=>cdp.send('Performance.getMetrics'));
    capture.snapshots.before=await checked('AtlasPerformance.before',snapshot);
    capture.clockAnchors.beforeProfilerStart={now:capture.snapshots.before.now,timeOrigin:capture.snapshots.before.timeOrigin};
    startAttempted=true;await checked('Profiler.start',()=>cdp.send('Profiler.start'));
    capture.clockAnchors.afterProfilerStart=await checked('clock.afterProfilerStart',clock);
    capture.phaseStartedAt=new Date().toISOString();capture.phaseStatus='running';
    try{result=await run();capture.phaseStatus='passed';}
    catch(error){capture.phaseStatus='failed';throw error;}
    finally{capture.phaseCompletedAt=new Date().toISOString();}
  }catch(error){failure=error;capture.error=errorText(error);}
  finally{
    if(startAttempted){
      capture.clockAnchors.beforeProfilerStop=await recover('clock.beforeProfilerStop',clock);
      const stopped=await recover('Profiler.stop',()=>cdp.send('Profiler.stop'));
      capture.cpuProfile=stopped?.profile??null;
      capture.clockAnchors.afterProfilerStop=await recover('clock.afterProfilerStop',clock);
    }
    if(performanceEnabled){
      capture.metrics.after=await recover('Performance.getMetrics.after',()=>cdp.send('Performance.getMetrics'));
      capture.snapshots.after=await recover('AtlasPerformance.after',snapshot);
    }
    if(profilerEnabled)await recover('Profiler.disable',()=>cdp.send('Profiler.disable'));
    if(performanceEnabled)await recover('Performance.disable',()=>cdp.send('Performance.disable'));
    capture.completedAt=new Date().toISOString();
  }
  await recover('validate-captured-evidence',()=>{
    const profile=capture.cpuProfile;
    assert.ok(profile&&Array.isArray(profile.nodes)&&profile.nodes.length>0,'Raw CPU profile nodes are missing');
    assert.ok(Array.isArray(profile.samples)&&profile.samples.length>0,'Raw CPU samples are missing');
    assert.equal(profile.samples.length,profile.timeDeltas?.length,'Raw CPU sample timing is incomplete');
    assert.ok(Number.isFinite(profile.startTime)&&Number.isFinite(profile.endTime)&&profile.endTime>profile.startTime);
    assert.ok(profile.timeDeltas.every(value=>Number.isFinite(value)&&value>=0));
    for(const position of ['before','after']){
      assert.ok(Array.isArray(capture.metrics[position]?.metrics)&&capture.metrics[position].metrics.length>0,'Chrome performance metrics are missing');
      assert.ok(capture.snapshots[position]?.atlas,'Existing Atlas performance snapshot is missing');
    }
    for(const key of ['beforeProfilerStart','afterProfilerStart','beforeProfilerStop','afterProfilerStop']){
      const anchor=capture.clockAnchors[key];
      assert.ok(Number.isFinite(anchor?.now)&&Number.isFinite(anchor?.timeOrigin),'Profile clock anchor is missing');
      assert.equal(anchor.timeOrigin,capture.snapshots.before.timeOrigin,'The profiled document clock changed');
    }
  });
  const measurement=await recover('read-cursor-window',()=>readMeasurement?.());
  capture.cursorWindow=measurement?.observations?.length?{count:measurement.observations.length,
    first:measurement.observations[0],last:measurement.observations.at(-1),clock:'page performance.now milliseconds'}:null;
  capture.status=errors.length?'failed':'collected';
  await recover('transport-captured-evidence',()=>onCaptured(capture));
  capture.status=errors.length?'failed':'collected';
  const failures=[...(failure?[failure]:[]),...errors.filter(error=>error!==failure)];
  if(failures.length===1)throw failures[0];
  if(failures.length)throw new AggregateError(failures,'Replay phase or diagnostic capture failed');
  return result;
}
