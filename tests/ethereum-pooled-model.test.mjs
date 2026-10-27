import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {ETH_POOLED_POLICY,fitEthereumPooledModel,simulateEthereumPooled,buildEthereumPooledCandidate,buildEthereumPooledForecast} from '../dist/ethereum-pooled-model.js';
import {buildEthereumAdaptiveCandidate} from '../dist/ethereum-adaptive-model.js';
import {runEthereumModelComparison} from '../dist/ethereum-model-comparison.js';
import {ethViewQuery} from '../dist/eth-view-state.js';
import {ethViewFixture} from './helpers/eth-view-fixture.mjs';

function fixture(n=1200){
  const start=utcDay('2022-09-15');
  return Array.from({length:n},(_,i)=>({date:dateFromDay(start+i),price:1500*Math.exp(.08*Math.sin(i*.07)+.012*Math.sin(i*.71))}));
}
const rows=fixture(),asOf=rows.at(-1).date,fit=fitEthereumPooledModel(rows,asOf);
test('pooled fit uses every continuous return even when no threshold state can be confirmed',()=>{
  assert.equal(buildEthereumAdaptiveCandidate({ethRows:rows,asOf}).status,'unavailable');
  assert.equal(buildEthereumPooledCandidate({ethRows:rows,asOf}).status,'available');
  assert.equal(fit.training.returnCount,rows.length-1);
  assert.equal(fit.training.innovationCount,rows.length-1);
  assert.equal(fit.training.unclassifiedReturnsExcluded,false);
  assert.equal(fit.training.stateConditioningUsed,false);
  assert.equal(fit.states,undefined);
  const changed=rows.map((r,i)=>i===2?{...r,price:r.price*1.02}:r);
  assert.notDeepEqual(fitEthereumPooledModel(changed,asOf).innovations,fit.innovations);
});
test('pooled fit and paths ignore future prices without mutating inputs',()=>{
  const origin=rows[800].date,poisoned=rows.map(r=>r.date>origin?{...r,price:NaN}:r);
  const before=structuredClone(poisoned);
  assert.deepEqual(fitEthereumPooledModel(poisoned,origin),fitEthereumPooledModel(rows.slice(0,801),origin));
  assert.deepEqual(buildEthereumPooledCandidate({ethRows:poisoned,asOf:origin}),buildEthereumPooledCandidate({ethRows:rows,asOf:origin}));
  assert.deepEqual(poisoned,before);
});
test('independent return calculation checks sample variance and the pre-return variance denominator',()=>{
  const returns=rows.slice(1).map((r,i)=>Math.log(r.price/rows[i].price));
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const sampleVariance=returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1);
  assert.ok(Math.abs(sampleVariance-fit.longRunVariance)<1e-14);
  let v=sampleVariance;const innovations=[];
  for(const r of returns){
    const residual=r-mean;
    innovations.push(residual/Math.sqrt(v));
    v=.02*sampleVariance+.06*residual**2+.92*v;
  }
  assert.ok(Math.abs(v-fit.currentVariance)<1e-14);
  const center=innovations.reduce((a,b)=>a+b,0)/innovations.length;
  const scale=Math.sqrt(innovations.reduce((a,b)=>a+(b-center)**2,0)/innovations.length);
  for(let i=0;i<innovations.length;i++)assert.ok(Math.abs((innovations[i]-center)/scale-fit.innovations[i])<1e-10);
  assert.ok(Math.abs(fit.training.innovationPopulationMean)<1e-12);
  assert.ok(Math.abs(fit.training.innovationPopulationSecondMoment-1)<1e-12);
  assert.equal(fit.training.explicitFutureLogDrift,0);
});
test('changing the price unit changes path prices by the same factor',()=>{
  const factor=123.4,scaled=fitEthereumPooledModel(rows.map(r=>({...r,price:r.price*factor})),asOf);
  assert.ok(Math.abs(scaled.longRunVariance-fit.longRunVariance)<1e-14);
  const a=simulateEthereumPooled(fit,{horizonDays:30,sampleCount:64,seed:17});
  const b=simulateEthereumPooled(scaled,{horizonDays:30,sampleCount:64,seed:17});
  for(let i=0;i<a.path.length;i++)for(const key of ['price','baselinePrice','low','high'])
    assert.ok(Math.abs(b.path[i][key]/a.path[i][key]/factor-1)<1e-10);
});
test('seeded pooled prefixes are stable across horizon and draw budgets with positive ordered quantiles',()=>{
  const a=simulateEthereumPooled(fit,{horizonDays:30,sampleCount:128,seed:7});
  const b=simulateEthereumPooled(fit,{horizonDays:180,sampleCount:128,seed:7});
  const c=simulateEthereumPooled(fit,{horizonDays:180,sampleCount:256,seed:7});
  assert.deepEqual(a.path,b.path.slice(0,31));
  assert.deepEqual(a.representative,b.representative.slice(0,31));
  assert.deepEqual(b.representative,c.representative);
  assert.notDeepEqual(a.path,simulateEthereumPooled(fit,{horizonDays:30,sampleCount:128,seed:8}).path);
  assert.ok(c.path.every(p=>p.low>0&&p.low<=p.baselinePrice&&p.baselinePrice<=p.high&&Number.isFinite(p.price)));
  assert.ok(c.representative.every(p=>p.variance>0&&Number.isFinite(p.variance)));
});
test('gaps, absent exact origins, duplicate observations and unbounded work are rejected',()=>{
  for(const input of [rows.slice(0,365),rows.slice(0,-1),rows.filter((_,i)=>i!==rows.length-100),[rows[0],...rows]])
    assert.equal(buildEthereumPooledCandidate({ethRows:input,asOf}).status,'unavailable');
  assert.throws(()=>fitEthereumPooledModel(fixture(365),fixture(365).at(-1).date),/366/);
  for(const horizonDays of [0,731,NaN,1.5])assert.throws(()=>simulateEthereumPooled(fit,{horizonDays}),/horizon/);
  for(const sampleCount of [63,2049,Infinity])assert.throws(()=>simulateEthereumPooled(fit,{sampleCount}),/draws/);
  for(const seed of [-1,1.5,4294967296,NaN])assert.throws(()=>simulateEthereumPooled(fit,{seed}),/seed/);
  assert.throws(()=>buildEthereumPooledCandidate({ethRows:rows,asOf,horizons:[30,30]}),/unique/);
  assert.throws(()=>simulateEthereumPooled({...fit,innovations:[NaN]}),/Invalid/);
  assert.throws(()=>simulateEthereumPooled({...fit,currentVariance:1e300,innovations:Array(365).fill(1)}),/overflow|underflow/);
});
test('comparison uses the actual pooled median and raw band and exposes current calibration without promotion',()=>{
  const btc=rows.map((r,i)=>({date:r.date,price:30000*Math.exp(.0001*i+.03*Math.sin(i/31))}));
  const report=runEthereumModelComparison({ethHistory:rows,btcHistory:btc},{asOf});
  assert.deepEqual(report.current.candidates.pooledEth.predictions,buildEthereumPooledCandidate({ethRows:rows,asOf}).predictions);
  assert.equal(report.currentIntervalEvidence.calibratedForProduction,false);
  assert.equal(report.intervalComparisons.length,9);
  for(const horizon of report.currentIntervalEvidence.horizons){
    const actual=report.cases.find(r=>r.origin===asOf&&r.horizonDays===horizon.horizonDays);
    assert.deepEqual(horizon.models.pooledEth.empiricalCalibration,actual.intervals.pooledEth);
    assert.equal(horizon.models.pooledEth.minimumCalibrationCases,12);
    assert.equal(horizon.models.pooledEth.empiricalFallbackApplied,false);
    assert.ok(horizon.models.pooledEth.empiricalCalibration.usedOrigins.every(d=>utcDay(d)+horizon.horizonDays<=utcDay(asOf)));
  }
  assert.equal(report.prospectiveScoredTargets,0);
  assert.equal(report.adoption.productionModelChanged,false);
});
test('pooled chart metadata distinguishes zero explicit drift from a price martingale and proven coverage',()=>{
  const f=buildEthereumPooledForecast({ethHistory:rows,asOf,horizonDays:90,sampleCount:64});
  assert.equal(f.researchModel,'pooled');assert.equal(f.metadata.version,ETH_POOLED_POLICY.version);
  for(const key of ['conditionalMeanZeroGuaranteed','priceMartingaleGuaranteed','parameterUncertaintyIncluded','calibrated','policyPreregistered','productionPromoted'])assert.equal(f.metadata[key],false);
  assert.equal(f.metadata.explicitFutureLogDrift,0);
  assert.equal(f.probability,null);assert.deepEqual(f.milestones,[]);
  assert.ok(f.path.every(p=>!('open'in p)&&!('volume'in p)));
});
test('pooled URL and real initializer preserve mode, observations, cache and intraday boundaries',async()=>{
  const archive=JSON.parse(await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8'));
  const query=ethViewQuery({frequency:'daily',chartType:'line',scale:'log',span:'4y',ethModel:'pooled',ethScenario:'bull'});
  assert.equal(new URLSearchParams(query).get('eth-model'),'pooled');
  assert.equal(new URLSearchParams(query).has('eth-scenario'),false);
  const f=await ethViewFixture({query:'&'+query});f.reply(0,archive);await f.settle();await f.initialization;
  const first=f.latest().forecast,observed=structuredClone(f.latest().series.candles);
  assert.equal(first.researchModel,'pooled');assert.equal(first.path.length,731);
  assert.equal(first.path[0].price,observed.at(-1).close);
  const dialog=f.forecastDialog();
  assert.match(dialog.querySelector('#eth-data-content').innerHTML,/전체 수익률|연속 수익률/);
  f.forecastSetting('eth-model','valuation');await f.settle();
  assert.equal(f.latest().forecast.assetPath.method,'eth-post-merge-historical-blocks');
  f.forecastSetting('eth-model','pooled');await f.settle();
  assert.equal(f.latest().forecast,first);
  assert.deepEqual(f.latest().series.candles,observed);
  f.forecastSetting('eth-forecast-visible',false);await f.settle();assert.equal(f.latest().forecast,null);
  f.forecastSetting('eth-forecast-visible',true);await f.settle();assert.equal(f.latest().forecast,first);
  f.interval('1h');await f.settle();
  if(f.requests.length>1){for(let i=1;i<f.requests.length;i++)f.replyCandles(i);await f.settle();}
  assert.equal(f.latest().forecast,null);
  f.interval('daily');await f.settle();assert.equal(f.latest().forecast,first);
});
