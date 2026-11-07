import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export const fastCadenceMilestonePrefix='ATLAS_BROWSER_FAST_CADENCE ';
export const fastCadenceReleasePrefix='ATLAS_BROWSER_FAST_CADENCE_RELEASE ';
export const fastCadencePolicy=Object.freeze({
  phase:'btc-10x-weekly-display-daily-observations',maximumWaitMs:120000,releaseWaitMs:130000,
  origin:'2026-10-20',displayFrequency:'weekly',updateInterval:'daily',speed:10,expectedMilliseconds:100,
  allowedMeanRatio:Object.freeze([.85,1.3]),
  caseSpec:Object.freeze({symbol:'BTCUSD',surface:'btc',width:1440,height:900,touch:false,
    page:'chart-replay-btc',chartReplay:true,route:'/?symbol=BTCUSD&granularity=daily&type=line'}),
  startsBeforeRelease:Object.freeze(['chart-replay']),startsAfterRelease:Object.freeze(['non-chart-replay','model-tests']),
  failedRelease:'diagnostics-only; never qualifies verification',
});
const digest=value=>createHash('sha256').update(value).digest('hex');
const message=error=>(error instanceof Error?error.message:String(error)).slice(0,4000);
const clock=value=>Number.isFinite(Date.parse(value));
export const browserSourceInventorySha256=sourceHashes=>digest(JSON.stringify(Object.entries(sourceHashes).sort(([a],[b])=>a.localeCompare(b))));

export async function readFastCadenceContext({root,source,suiteRunId}){
  const archive=JSON.parse(await readFile(resolve(root,'dist/data/btc-volume.json'),'utf8'));
  const expectedObservationDates=archive.bars.filter(row=>row.date>fastCadencePolicy.origin).map(row=>row.date);
  assert.ok(expectedObservationDates.length>=5,'Fast cadence requires the complete genuine source prefix');
  assert.ok(expectedObservationDates.every((date,index)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&(!index||date>expectedObservationDates[index-1])));
  return {sourceCommit:source.sourceCommit,sourceTree:source.sourceTree,
    sourceInventorySha256:browserSourceInventorySha256(source.sourceHashes),suiteRunId,expectedObservationDates};
}

function assertIdentity(value,context){
  assert.equal(value?.schemaVersion,1);assert.equal(value.phase,fastCadencePolicy.phase);
  for(const key of ['sourceCommit','sourceTree']){assert.match(value[key]??'',/^[a-f0-9]{40}$/);assert.equal(value[key],context[key],'Fast cadence belongs to another '+key);}
  assert.match(value.sourceInventorySha256??'',/^[a-f0-9]{64}$/);assert.equal(value.sourceInventorySha256,context.sourceInventorySha256,'Fast cadence source inventory changed');
  assert.match(value.suiteRunId??'',/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.equal(value.suiteRunId,context.suiteRunId,'Fast cadence belongs to another suite run');
  assert.equal(value.lane,'chart-replay');assert.deepEqual(value.caseSpec,fastCadencePolicy.caseSpec,'Fast cadence belongs to another case');
  assert.ok(['passed','failed'].includes(value.status));
}

export function assertFastCadenceMilestone(value,context){
  assertIdentity(value,context);assert.equal(value.kind,'atlas-browser-fast-cadence');
  assert.ok(clock(value.startedAt)&&clock(value.completedAt)&&Date.parse(value.completedAt)>=Date.parse(value.startedAt),'Fast cadence clocks are invalid');
  if(value.status==='failed'){assert.ok(typeof value.error==='string'&&value.error.length>0&&value.error.length<=4000);return value;}
  assert.equal(value.restored,true,'Fast cadence must restore and verify the original chart before release');
  const fixture=value.fixture,m=value.measurement;
  assert.equal(fixture?.origin,fastCadencePolicy.origin);assert.equal(fixture.displayFrequency,fastCadencePolicy.displayFrequency);
  assert.equal(fixture.updateInterval,fastCadencePolicy.updateInterval);assert.ok(fixture.viewStart<fixture.viewEnd);
  assert.equal(m?.speed,10);assert.equal(m.expectedMilliseconds,100);assert.deepEqual(m.allowedMeanRatio,fastCadencePolicy.allowedMeanRatio);
  assert.deepEqual(m.observations?.map(row=>row.cursor),context.expectedObservationDates,'Fast cadence omitted or duplicated a genuine daily observation');
  assert.ok(m.observations.length>=5);
  for(const [index,row] of m.observations.entries())assert.ok(Number.isFinite(row.at)&&row.at>=0&&(!index||row.at>m.observations[index-1].at),'Fast cadence timestamps must advance');
  const intervals=m.observations.slice(1).map((row,index)=>row.at-m.observations[index].at);
  assert.deepEqual(m.intervals,intervals,'Fast cadence intervals do not match the raw observations');
  const mean=intervals.reduce((sum,value)=>sum+value,0)/intervals.length;
  assert.ok(Math.abs(m.meanMilliseconds-mean)<1e-6);assert.ok(Math.abs(m.averageUpdatesPerSecond-1000/mean)<1e-6);
  assert.ok(mean>=85&&mean<=130,'Fast cadence failed the unchanged100ms tolerance');
  assert.equal(m.setupAllowanceMilliseconds,5000);
  assert.equal(m.completionTimeoutMilliseconds,Math.ceil(context.expectedObservationDates.length*100*1.3)+5000);
  return value;
}

function releaseRecord(context,{status,reason,milestone=null,error=null,startedAt,releasedAt=new Date().toISOString()}){
  return {schemaVersion:1,kind:'atlas-browser-fast-cadence-release',phase:fastCadencePolicy.phase,
    ...context,lane:'chart-replay',caseSpec:fastCadencePolicy.caseSpec,status,reason,startedAt,releasedAt,
    durationMs:Date.parse(releasedAt)-Date.parse(startedAt),milestone,...(error?{error:message(error)}:{})};
}

export function assertFastCadenceRelease(value,context){
  assertIdentity(value,context);assert.equal(value.kind,'atlas-browser-fast-cadence-release');
  assert.deepEqual(value.expectedObservationDates,context.expectedObservationDates);
  assert.ok(clock(value.startedAt)&&clock(value.releasedAt)&&Date.parse(value.releasedAt)>=Date.parse(value.startedAt));
  assert.equal(value.durationMs,Date.parse(value.releasedAt)-Date.parse(value.startedAt));
  if(value.status==='passed'){
    assert.equal(value.reason,'milestone');assertFastCadenceMilestone(value.milestone,context);assert.equal(value.milestone.status,'passed');
    assert.ok(Date.parse(value.releasedAt)>=Date.parse(value.milestone.completedAt));
  }else{assert.ok(typeof value.error==='string'&&value.error.length>0);if(value.milestone)assertFastCadenceMilestone(value.milestone,context);}
  return value;
}

/** A terminal failure releases diagnostics, but remains sticky for the final
 * report. No signal pauses a live model test or another browser interaction. */
export function createFastCadenceBarrier({context,onRelease=()=>{},timeoutMs=fastCadencePolicy.maximumWaitMs}={}){
  let release=null,problem=null,resolveRelease;const startedAt=new Date().toISOString();
  const released=new Promise(accept=>{resolveRelease=accept;});
  const settle=({status,reason,milestone,error})=>{
    if(release)return;
    release=releaseRecord(context,{status,reason,milestone,error,startedAt});clearTimeout(timer);
    try{onRelease(release);}catch(error){problem??=error;}finally{resolveRelease(release);}
  };
  const fail=(error,reason='invalid-milestone')=>{problem??=error;settle({status:'failed',reason,error});};
  const timer=setTimeout(()=>fail(new Error('Fast cadence milestone exceeded its bounded wait'),'timeout'),timeoutMs);
  return {released,get release(){return release;},get error(){return problem;},
    observeLine(line){
      if(!line.startsWith(fastCadenceMilestonePrefix))return false;
      try{
        assert.equal(release,null,'Fast cadence emitted a duplicate or late milestone');
        const milestone=assertFastCadenceMilestone(JSON.parse(line.slice(fastCadenceMilestonePrefix.length)),context);
        if(milestone.status==='failed')problem??=new Error(milestone.error);
        settle({status:milestone.status,reason:'milestone',milestone,error:milestone.status==='failed'?milestone.error:null});
      }catch(error){fail(error);}
      return true;
    },
    close(outcome){if(!release)fail(new Error('Replay lane closed before its fast cadence milestone: '+JSON.stringify({code:outcome?.code,signal:outcome?.signal,error:outcome?.error})),'lane-closed');},
    fail,
    assertPassed(){if(problem)throw problem;assert.equal(release?.status,'passed','Fast cadence did not pass');return assertFastCadenceRelease(release,context);},
    dispose(){clearTimeout(timer);},
  };
}

export function createFastCadenceReleaseWaiter({context,timeoutMs=fastCadencePolicy.releaseWaitMs}={}){
  let release=null,problem=null,accept,reject;
  const pending=new Promise((resolve,rejectPromise)=>{accept=resolve;reject=rejectPromise;});pending.catch(()=>{});
  const fail=error=>{problem??=error;clearTimeout(timer);if(!release)reject(error);};
  const timer=setTimeout(()=>fail(new Error('Validated fast cadence release exceeded its bounded wait')),timeoutMs);
  return {get release(){return release;},get error(){return problem;},fail,
    observeLine(line){
      if(!line.startsWith(fastCadenceReleasePrefix))return false;
      try{assert.equal(release,null,'Duplicate validated fast cadence release');release=assertFastCadenceRelease(JSON.parse(line.slice(fastCadenceReleasePrefix.length)),context);clearTimeout(timer);accept(release);}
      catch(error){fail(error);throw error;}return true;
    },
    async wait(signal){
      signal?.throwIfAborted();
      let abort;
      try{return await Promise.race([pending,new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();})]);}
      finally{signal?.removeEventListener('abort',abort);}
    },
    assertPassed(){if(problem)throw problem;assert.equal(release?.status,'passed','A failed fast cadence release permits diagnostics only');return assertFastCadenceRelease(release,context);},
    dispose(){clearTimeout(timer);},
  };
}

export function assertFastCadenceCaseEvidence(report,release,context){
  assertFastCadenceRelease(release,context);assert.equal(release.status,'passed','Failed early cadence cannot qualify otherwise passing browser cases');
  const target=report.cases.find(item=>item.caseSpec.page===fastCadencePolicy.caseSpec.page&&item.caseSpec.width===1440);
  assert.ok(target,'The original fast cadence case is missing');assert.deepEqual(target.fastCadence,release.milestone);
  const timing=target.chartReplay?.timing;assert.deepEqual(timing?.map(item=>item.speed),[10,1,.5,.3],'Every original cadence speed is required exactly once');
  assert.deepEqual(timing[0],release.milestone.measurement,'Final browser evidence changed the early measurement');
  const state=label=>{
    const matches=target.chartReplay.states?.filter(row=>row.label===label);
    assert.equal(matches?.length,1,'The exact original cadence fixture checkpoint is required: '+label);return matches[0];
  };
  const early=state('early-10x-weekly-display-daily-observations'),later=state('weekly-four-year-restored');
  for(const field of ['origin','viewStart','viewEnd','frequency','updateInterval','chartType','scale','unit','outputHash','forecastValueSignature']){
    assert.notEqual(early[field],undefined,'The early cadence fixture is missing '+field);
    assert.deepEqual(early[field],later[field],'Early cadence differs from the original later fixture: '+field);
  }
  const fixture=release.milestone.fixture;
  for(const field of ['origin','viewStart','viewEnd','updateInterval'])assert.equal(fixture[field],later[field]);
  assert.equal(fixture.displayFrequency,later.frequency);assert.equal(later.chartType,'candles');
  for(const checkpoint of [early,later])assert.ok(checkpoint.observedCandleCount>0&&checkpoint.volumeCount>0,'Cadence must keep genuine candles and volume enabled');
  return release;
}
