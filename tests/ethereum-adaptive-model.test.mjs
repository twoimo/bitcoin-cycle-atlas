import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {ETH_ADAPTIVE_POLICY,confirmedEthereumRegimes,fitEthereumAdaptiveModel,simulateEthereumAdaptive,buildEthereumAdaptiveCandidate,buildEthereumAdaptiveForecast} from '../dist/ethereum-adaptive-model.js';
import {runEthereumModelComparison} from '../dist/ethereum-model-comparison.js';
import {ethViewFixture} from './helpers/eth-view-fixture.mjs';

function fixture(n=1200){
  const start=utcDay('2022-09-15');let log=7;
  return Array.from({length:n},(_,i)=>{
    if(i)log+=(i%260<160?.013:-.020)+.012*Math.sin(i*.41);
    return {date:dateFromDay(start+i),price:Math.exp(log)};
  });
}
const rows=fixture(),asOf=rows.at(-1).date,fit=fitEthereumAdaptiveModel(rows,asOf);
test('adaptive states use confirmation clocks, lagged returns and censored risk exposure',()=>{
  const t=fit.training;
  assert.ok(t.events.length>3);
  assert.equal(t.currentAge,utcDay(asOf)-utcDay(t.currentStateKnownAt));
  assert.equal(t.currentRightCensored,true);
  for(const e of t.events)assert.ok(utcDay(e.knownAt)-utcDay(e.turnDate)>=ETH_ADAPTIVE_POLICY.confirmationDays);
  let state=null,age=0;
  const expected={up:{count:0,events:0,sum:0},down:{count:0,events:0,sum:0}};
  const events=new Map(t.events.map(e=>[e.knownAt,e]));
  for(let i=1;i<rows.length;i++){
    const event=events.get(rows[i].date);
    if(state){
      expected[state].count++;expected[state].sum+=Math.log(rows[i].price/rows[i-1].price);age++;
      if(event)expected[state].events++;
    }
    if(event){state=event.state;age=0;}
  }
  for(const s of ['up','down']){
    const g=fit.states[s];
    assert.equal(g.returnCount,expected[s].count);
    assert.equal(g.riskDays,expected[s].count);
    assert.equal(g.switches,expected[s].events);
    assert.equal(g.completedDurations.reduce((a,b)=>a+b,0)+(s===state?age:0),g.riskDays);
    assert.ok(Math.abs(g.rawMean-expected[s].sum/expected[s].count)<1e-12);
    assert.ok(g.hazard.every(h=>h>0&&h<1));
    assert.ok(Math.abs(g.mean)<=Math.abs(g.rawMean));
  }
});
test('future poisoning cannot alter a fitted origin or historical predictions',()=>{
  const origin=rows[850].date,base=buildEthereumAdaptiveCandidate({ethRows:rows,asOf:origin});
  assert.equal(base.status,'available');
  const changed=rows.map(r=>r.date>origin?{...r,price:NaN}:r),before=structuredClone(changed);
  assert.deepEqual(buildEthereumAdaptiveCandidate({ethRows:changed,asOf:origin}),base);
  assert.deepEqual(changed,before);
  assert.deepEqual(fitEthereumAdaptiveModel(rows.slice(0,851),origin),fitEthereumAdaptiveModel(changed,origin));
});
test('filtered innovation centering does not silently reintroduce historical drift or rescale variance',()=>{
  assert.ok(Math.abs(fit.training.innovationPopulationMean)<1e-12);
  assert.ok(Math.abs(fit.training.innovationPopulationSecondMoment-1)<1e-12);
  for(const state of Object.values(fit.states))assert.ok(state.longRunVariance>0);
  // Uniform circular starting indices include each innovation exactly once at
  // every block offset; this checks the actual marginal sampling weights.
  for(const offset of [0,1,27]){
    const sum=fit.innovations.reduce((s,_,start)=>s+fit.innovations[(start+offset)%fit.innovations.length],0);
    assert.ok(Math.abs(sum/fit.innovations.length)<1e-12);
  }
});
test('seeded paths retain their prefixes across horizons and draw budgets with ordered positive bands',()=>{
  const a=simulateEthereumAdaptive(fit,{horizonDays:30,sampleCount:128,seed:7});
  const b=simulateEthereumAdaptive(fit,{horizonDays:180,sampleCount:128,seed:7});
  const c=simulateEthereumAdaptive(fit,{horizonDays:180,sampleCount:256,seed:7});
  assert.deepEqual(a.path,b.path.slice(0,31));assert.deepEqual(a.representative,b.representative.slice(0,31));
  assert.deepEqual(b.representative,c.representative);
  assert.equal(b.path[0].price,rows.at(-1).price);
  assert.ok(b.path.every(p=>p.low>0&&p.low<=p.baselinePrice&&p.baselinePrice<=p.high&&Number.isFinite(p.price)));
  assert.ok(b.representative.every(p=>p.variance>0&&Number.isFinite(p.variance)));
  assert.ok(new Set(b.representative.map(p=>p.variance)).size>100);
  assert.notDeepEqual(b.path,simulateEthereumAdaptive(fit,{horizonDays:180,sampleCount:128,seed:8}).path);
  assert.equal(b.metadata.probability,null);assert.equal(b.metadata.calibrated,false);
});
test('missing inputs, invalid clocks and work budgets fail explicitly',()=>{
  assert.equal(buildEthereumAdaptiveCandidate({ethRows:rows.slice(0,200),asOf:rows[199].date}).status,'unavailable');
  assert.equal(buildEthereumAdaptiveCandidate({ethRows:rows.slice(0,-1),asOf}).status,'unavailable');
  const missing=rows.filter((_,i)=>i!==rows.length-100);
  assert.equal(buildEthereumAdaptiveCandidate({ethRows:missing,asOf}).status,'unavailable');
  const duplicate=[rows[0],...rows];
  assert.equal(buildEthereumAdaptiveCandidate({ethRows:duplicate,asOf}).status,'unavailable');
  for(const horizonDays of [0,731,NaN,1.5])assert.throws(()=>simulateEthereumAdaptive(fit,{horizonDays}),/horizon/);
  for(const sampleCount of [0,63,2049,Infinity])assert.throws(()=>simulateEthereumAdaptive(fit,{sampleCount}),/draws/);
  for(const seed of [-1,1.5,4294967296,NaN])assert.throws(()=>simulateEthereumAdaptive(fit,{seed}),/seed/);
  assert.throws(()=>buildEthereumAdaptiveCandidate({ethRows:rows,asOf,horizons:[30,30]}),/unique/);
});
test('rolling comparison scores the same median and raw interval without prospective or external-review claims',()=>{
  const btc=rows.map((r,i)=>({date:r.date,price:20000*Math.exp(.0002*i+.1*Math.sin(i/50))}));
  const report=runEthereumModelComparison({ethHistory:rows,btcHistory:btc},{asOf});
  const current=buildEthereumAdaptiveCandidate({ethRows:rows,asOf});
  assert.deepEqual(report.current.candidates.adaptiveEth.predictions,current.predictions);
  assert.equal(report.policy.externalReviewRequired,false);
  assert.equal(report.adoption.externalGeminiReview,'omitted-by-user-2026-10-27');
  assert.equal(report.prospectiveScoredTargets,0);
  const summary=report.summaries.find(r=>r.model==='adaptiveEth'&&r.horizonDays===30);
  assert.ok(summary.completedOutcomes>0);
  assert.equal(summary.simulatedInterval.cases,summary.completedOutcomes);
  assert.ok(summary.simulatedInterval.meanLogIntervalScore>=0);
  assert.equal(summary.simulatedInterval.coverageGuarantee,false);
  const first=report.cases.find(r=>r.actual&&r.predictions.adaptiveEth);
  const ref=buildEthereumAdaptiveCandidate({ethRows:rows,asOf:first.origin}).predictions.find(r=>r.horizonDays===first.horizonDays);
  assert.equal(first.predictions.adaptiveEth,ref.price);
  assert.equal(first.simulatedIntervals.adaptiveEth.lower,ref.simulatedLower);
  assert.equal(first.simulatedIntervals.adaptiveEth.covered,first.actual>=ref.simulatedLower&&first.actual<=ref.simulatedUpper);
});
test('ETH default research mode switches to preserved valuation semantics without changing observations',async()=>{
  const archive=JSON.parse(await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8'));
  const f=await ethViewFixture();f.reply(0,archive);await f.settle();await f.initialization;
  const first=f.latest().forecast,observed=structuredClone(f.latest().series.candles);
  assert.equal(first.researchModel,'adaptive');assert.equal(first.path.length,731);
  assert.equal(first.path[0].price,observed.at(-1).close);
  assert.equal(first.metadata.sampleCount,256);
  const dialog=f.forecastDialog();assert.match(dialog.querySelector('#eth-data-content').innerHTML,/모의 분포|모의 분위수|모의 예시/);
  f.forecastSetting('eth-model','valuation');await f.settle();
  assert.equal(f.latest().forecast.assetPath.method,'eth-post-merge-historical-blocks');
  assert.deepEqual(f.latest().series.candles,observed);
  f.forecastSetting('eth-scenario','stress');await f.settle();assert.equal(f.latest().forecast.scenario.id,'stress');
  f.forecastSetting('eth-model','adaptive');await f.settle();
  assert.equal(f.latest().forecast,first,'Immutable cached model is reused after presentation changes');
  f.forecastSetting('eth-forecast-visible',false);await f.settle();assert.equal(f.latest().forecast,null);
  f.forecastSetting('eth-forecast-visible',true);await f.settle();assert.equal(f.latest().forecast,first);
  assert.deepEqual(f.latest().series.candles,observed);
});
test('new chart model cannot disguise pointwise simulation percentiles as calibrated confidence',()=>{
  const model=buildEthereumAdaptiveForecast({ethHistory:rows,asOf,horizonDays:90,sampleCount:64});
  assert.equal(model.milestones.length,0);assert.equal(model.calibrated,false);assert.equal(model.probability,null);
  assert.equal(model.metadata.deterministicFourYearCycle,false);
  assert.equal(model.metadata.parameterUncertaintyIncluded,false);
  assert.ok(model.path.every(p=>!('open'in p)&&!('volume'in p)));
});


test('threshold confirmations occur on the independently known fourteenth close, never at the extremum',()=>{
  const start=utcDay('2023-01-01'),make=prices=>prices.map((price,i)=>({date:dateFromDay(start+i),price}));
  assert.deepEqual(confirmedEthereumRegimes(make([100,...Array(13).fill(60)])),[]);
  const down=confirmedEthereumRegimes(make([100,...Array(14).fill(60)]));
  assert.deepEqual(down,[{state:'down',turnDate:'2023-01-01',knownAt:'2023-01-15',index:14,price:100}]);
  const before=[100,...Array(14).fill(60),50,...Array(13).fill(60)];
  assert.deepEqual(confirmedEthereumRegimes(make(before)),down);
  const both=confirmedEthereumRegimes(make([...before,60]));
  assert.deepEqual(both,[...down,{state:'up',turnDate:'2023-01-16',knownAt:'2023-01-30',index:29,price:50}]);
  const reset=[100,...Array(13).fill(60),61,...Array(13).fill(60)];
  assert.equal(confirmedEthereumRegimes(make(reset)).length,0,'A recovery resets consecutive confirmation days');
});
test('the variance filter uses the pre-return variance and normalized, raw-mean-centered shocks',()=>{
  const byDate=new Map(fit.training.events.map(e=>[e.knownAt,e.state]));
  let state=null,v=fit.training.initialVariance;const z=[];
  for(let i=1;i<rows.length;i++){
    if(state){
      const shock=Math.log(rows[i].price)-Math.log(rows[i-1].price)-fit.states[state].rawMean;
      z.push(shock/Math.sqrt(v));
      v=.02*fit.states[state].longRunVariance+.06*shock**2+.92*v;
    }
    if(byDate.has(rows[i].date))state=byDate.get(rows[i].date);
  }
  assert.ok(Math.abs(v-fit.currentVariance)<1e-12);
  const center=z.reduce((s,x)=>s+x,0)/z.length;
  const scale=Math.sqrt(z.reduce((s,x)=>s+(x-center)**2,0)/z.length);
  for(let i=0;i<z.length;i++)assert.ok(Math.abs((z[i]-center)/scale-fit.innovations[i])<1e-10);
});
