import test from 'node:test';
import assert from 'node:assert/strict';
import {fastCadencePolicy,fastCadenceMilestonePrefix,fastCadenceReleasePrefix,assertFastCadenceMilestone,
  assertFastCadenceRelease,createFastCadenceBarrier,createFastCadenceReleaseWaiter,assertFastCadenceCaseEvidence} from '../scripts/browser-fast-cadence-contract.mjs';
import {runPhasedNativeBrowserLanes} from '../scripts/verify-native-browser-suite.mjs';
import {createEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';
import {fastCadenceFixture} from './helpers/fast-cadence-fixture.mjs';

const line=value=>fastCadenceMilestonePrefix+JSON.stringify(value)+'\n';
const releaseLine=value=>fastCadenceReleasePrefix+JSON.stringify(value)+'\n';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('fast cadence retains the original case and full dynamic source observation sequence without reducing bounds',()=>{
  assert.deepEqual(fastCadencePolicy.caseSpec,createEthBrowserCaseSpecs().find(spec=>spec.chartReplay&&spec.symbol==='BTCUSD'&&spec.width===1440));
  for(const count of [17,18,31]){const f=fastCadenceFixture({count});assertFastCadenceMilestone(f.milestone,f.context);assertFastCadenceRelease(f.release,f.context);}
  for(const change of [value=>value.sourceCommit='f'.repeat(40),value=>value.sourceTree='f'.repeat(40),
    value=>value.sourceInventorySha256='f'.repeat(64),value=>value.suiteRunId='22222222-2222-4222-8222-222222222222',
    value=>value.caseSpec.width=320,value=>value.restored=false,value=>value.fixture.displayFrequency='daily',
    value=>value.measurement.observations.pop(),value=>value.measurement.observations.reverse(),value=>value.measurement.meanMilliseconds=99,
    value=>value.measurement.intervals[0]=101,value=>value.measurement.allowedMeanRatio=[.85,2.1],
  ]){const f=fastCadenceFixture();change(f.milestone);assert.throws(()=>assertFastCadenceMilestone(f.milestone,f.context));}
  const slow=fastCadenceFixture(),measurement=slow.milestone.measurement;
  measurement.observations.forEach((row,index)=>{row.at=100+index*206.25;});measurement.intervals.fill(206.25);
  measurement.meanMilliseconds=206.25;measurement.averageUpdatesPerSecond=1000/206.25;
  assert.throws(()=>assertFastCadenceMilestone(slow.milestone,slow.context),/unchanged100ms tolerance/,'A self-consistent slow actual cadence cannot be relabeled as passed');
});

test('early failed marker, malformed/wrong-run marker, missing child marker and bounded timeout all release only failed diagnostics',async()=>{
  for(const variant of ['failed','malformed','wrong-run','closed','timeout']){
    const f=fastCadenceFixture(),barrier=createFastCadenceBarrier({context:f.context,timeoutMs:20});
    try{
      if(variant==='failed')barrier.observeLine(line({...f.milestone,status:'failed',restored:false,fixture:null,measurement:null,error:'source setup failed'}));
      if(variant==='malformed')barrier.observeLine(fastCadenceMilestonePrefix+'{invalid}\n');
      if(variant==='wrong-run')barrier.observeLine(line({...f.milestone,suiteRunId:'22222222-2222-4222-8222-222222222222'}));
      if(variant==='closed')barrier.close({code:1,signal:null});
      const release=await barrier.released;assert.equal(release.status,'failed');assert.ok(release.error);assert.throws(()=>barrier.assertPassed());
    }finally{barrier.dispose();}
  }
});

test('duplicate or late successful markers cannot erase a terminal cadence failure',async()=>{
  const f=fastCadenceFixture();
  for(const failedFirst of [false,true]){
    const barrier=createFastCadenceBarrier({context:f.context});
    try{
      if(failedFirst)barrier.close({code:1});else barrier.observeLine(line(f.milestone));
      const release=await barrier.released;barrier.observeLine(line(f.milestone));
      assert.equal(barrier.release,release);assert.throws(()=>barrier.assertPassed());
    }finally{barrier.dispose();}
  }
});

test('replay runs alone until a validated milestone; both terminal statuses then release the other46-case lane',async()=>{
  for(const failed of [false,true]){
    const f=fastCadenceFixture(),events=[],writes=[];let releaseTime;
    const result=await runPhasedNativeBrowserLanes({root:'/unused',out:'/unused',source:{},suiteRunId:f.context.suiteRunId,context:f.context,
      write:text=>{writes.push(text);if(text.startsWith(fastCadenceReleasePrefix))releaseTime=JSON.parse(text.slice(fastCadenceReleasePrefix.length)).releasedAt;},
      runLane:async({lane,onLine})=>{
        const startedAt=new Date().toISOString();events.push('start:'+lane.name);
        if(lane.name==='chart-replay'){
          assert.deepEqual(events,['start:chart-replay']);await pause(20);assert.equal(releaseTime,undefined);
          onLine(line(failed?{...f.milestone,status:'failed',restored:false,fixture:null,measurement:null,error:'cadence failed'}:f.milestone));
          await pause(20);
        }else{assert.ok(releaseTime);assert.ok(Date.parse(startedAt)>=Date.parse(releaseTime));}
        return {name:lane.name,code:0,signal:null,startedAt};
      }});
    assert.deepEqual(events,['start:chart-replay','start:non-chart-replay']);
    assert.deepEqual(result.processes.map(row=>row.name),['non-chart-replay','chart-replay']);
    assert.equal(result.release.status,failed?'failed':'passed');assert.equal(Boolean(result.error),failed);
    assert.equal(writes.filter(text=>text.startsWith(fastCadenceReleasePrefix)).length,1);
  }
});

test('a replay process that closes or rejects before the milestone cannot deadlock later diagnostic launch',async()=>{
  for(const rejects of [false,true]){
    const f=fastCadenceFixture(),calls=[];
    const result=await runPhasedNativeBrowserLanes({root:'/unused',out:'/unused',source:{},suiteRunId:f.context.suiteRunId,context:f.context,write:()=>{},
      runLane:async({lane})=>{calls.push(lane.name);if(rejects&&lane.name==='chart-replay')throw new Error('spawn fixture failed');return {name:lane.name,code:1,signal:null};}});
    assert.deepEqual(calls,['chart-replay','non-chart-replay']);assert.equal(result.release.status,'failed');assert.equal(result.release.reason,'lane-closed');
  }
});

test('model barrier accepts only the parent nonce and supports cancellation while no command has launched',async()=>{
  const f=fastCadenceFixture(),waiter=createFastCadenceReleaseWaiter({context:f.context}),controller=new AbortController();let launched=false;
  const pending=waiter.wait(controller.signal).then(()=>{controller.signal.throwIfAborted();launched=true;});
  controller.abort(new Error('fixture verification cancelled'));await assert.rejects(pending,/cancelled/);assert.equal(launched,false);waiter.dispose();
  const wrong=createFastCadenceReleaseWaiter({context:f.context});
  try{assert.throws(()=>wrong.observeLine(releaseLine({...f.release,suiteRunId:'22222222-2222-4222-8222-222222222222'})));await assert.rejects(wrong.wait());}finally{wrong.dispose();}
  const timeout=createFastCadenceReleaseWaiter({context:f.context,timeoutMs:20});try{await assert.rejects(timeout.wait(),/bounded wait/);}finally{timeout.dispose();}
  const ready=createFastCadenceReleaseWaiter({context:f.context});
  try{const waiting=ready.wait();ready.observeLine(releaseLine(f.release));assert.deepEqual(await waiting,f.release);assert.throws(()=>ready.observeLine(releaseLine(f.release)),/Duplicate/);assert.throws(()=>ready.assertPassed());}finally{ready.dispose();}
  const diagnostic=createFastCadenceReleaseWaiter({context:f.context});
  try{const failed={...f.release,status:'failed',reason:'timeout',milestone:null,error:'phase deadline'};const waiting=diagnostic.wait();diagnostic.observeLine(releaseLine(failed));assert.deepEqual(await waiting,failed);assert.throws(()=>diagnostic.assertPassed(),/diagnostics only/);}finally{diagnostic.dispose();}
});

test('an early failed phase cannot qualify53 otherwise passing cases and all four final speed observations stay bound',()=>{
  const f=fastCadenceFixture(),report={cases:createEthBrowserCaseSpecs().map(caseSpec=>({caseSpec,status:'passed'}))};
  const target=report.cases.find(row=>row.caseSpec.chartReplay&&row.caseSpec.symbol==='BTCUSD'&&row.caseSpec.width===1440);
  target.fastCadence=f.milestone;target.chartReplay={timing:[f.milestone.measurement,...[1,.5,.3].map(speed=>({speed}))],
    states:['early-10x-weekly-display-daily-observations','weekly-four-year-restored'].map((label,index)=>({label,
      ...f.milestone.fixture,frequency:'weekly',chartType:'candles',scale:'log',unit:'usd',outputHash:'f'.repeat(64),forecastValueSignature:'frozen-fixture',
      observedCandleCount:103+index,volumeCount:102+index}))};
  assertFastCadenceCaseEvidence(report,f.release,f.context);
  assert.throws(()=>assertFastCadenceCaseEvidence(report,{...f.release,status:'failed',error:'early cadence failed'},f.context),/Failed early cadence/);
  const original=target.chartReplay.states[1].viewEnd;target.chartReplay.states[1].viewEnd='2028-12-01';
  assert.throws(()=>assertFastCadenceCaseEvidence(report,f.release,f.context),/original later fixture/);target.chartReplay.states[1].viewEnd=original;
  target.chartReplay.timing.pop();assert.throws(()=>assertFastCadenceCaseEvidence(report,f.release,f.context),/Every original cadence speed/);
});
