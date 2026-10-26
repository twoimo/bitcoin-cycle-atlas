import test from 'node:test';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {buildSimpleEthereumBtcLink,buildEthereumCombinedCandidate,summarizeEthereumComparison,runEthereumModelComparison,disjointEthereumCases} from '../dist/ethereum-model-comparison.js';

function fixture(start='2022-01-01',days=1000){
  const first=utcDay(start),btc=[],eth=[];
  for(let i=0;i<days;i++){
    const date=dateFromDay(first+i),price=100*Math.exp(.0002*i+.15*Math.sin(i/35));
    btc.push({date,epochDay:first+i,price});
    eth.push({date,epochDay:first+i,price:2*price**1.5});
  }
  return {btc,eth};
}
test('BTC-linked reference estimates past beta and uses only a past BTC trend',()=>{
  const {btc,eth}=fixture(),asOf=eth[800].date;
  const candidate=buildSimpleEthereumBtcLink({btcRows:btc,ethRows:eth,asOf});
  assert.equal(candidate.status,'ready');
  assert.ok(Math.abs(candidate.assumptions.beta-1.5)<1e-10);
  assert.equal(candidate.assumptions.btcFutureRealizationUsed,false);
  const altered=btc.map(r=>r.date>asOf?{...r,price:1e100}:r);
  assert.deepEqual(buildSimpleEthereumBtcLink({btcRows:altered,ethRows:eth,asOf}),candidate);
  const broken=btc.filter(r=>r.date!==btc[700].date);
  assert.equal(buildSimpleEthereumBtcLink({btcRows:broken,ethRows:eth,asOf}).status,'unavailable');
});
test('convex blend learns from mature disjoint origins and cannot use uncompleted targets',()=>{
  const first=utcDay('2020-01-01'),history=[];
  for(let i=0;i<15;i++){
    const cycle=100+i,economic=cycle*1.2;
    history.push({origin:dateFromDay(first+i*30),targetDate:dateFromDay(first+(i+1)*30),horizonDays:30,
      predictions:{ethRefit:cycle,economic},actual:Math.exp(.75*Math.log(cycle)+.25*Math.log(economic))});
  }
  const origin=dateFromDay(first+14*30),targetDate=dateFromDay(utcDay(origin)+30);
  const cycle={status:'ready',predictions:[{horizonDays:30,targetDate,price:200}]};
  const economic={status:'ready',predictions:[{horizonDays:30,targetDate,price:240}]};
  const result=buildEthereumCombinedCandidate({origin,horizons:[30],cycle,economic,history});
  assert.equal(result.status,'ready');
  assert.equal(result.fits[0].usedCount,14);
  assert.ok(Math.abs(result.predictions[0].economicWeight-.25)<1e-10);
  const poisoned=history.map(r=>r.targetDate>origin?{...r,actual:1e100}:r);
  assert.deepEqual(buildEthereumCombinedCandidate({origin,horizons:[30],cycle,economic,history:poisoned}),result);
  assert.equal(buildEthereumCombinedCandidate({origin,horizons:[30],cycle,economic,history:history.slice(0,3)}).status,'unavailable');
  assert.equal(buildEthereumCombinedCandidate({origin,horizons:[30],cycle,economic:{status:'unavailable'},history}).status,'unavailable');
});
test('paired summaries compare identical origins and count overlap instead of independent samples',()=>{
  const rows=[
    {origin:'2024-01-01',targetDate:'2024-01-31',horizonDays:30,anchorPrice:100,actual:110,predictions:{flat:100,shrunkenTrend:105,btcLinked:108,ethRefit:109},intervals:{}},
    {origin:'2024-01-15',targetDate:'2024-02-14',horizonDays:30,anchorPrice:100,actual:80,predictions:{flat:100,shrunkenTrend:105,btcLinked:90},intervals:{}},
    {origin:'2024-02-01',targetDate:'2024-03-02',horizonDays:30,anchorPrice:100,actual:120,predictions:{flat:100,shrunkenTrend:105,btcLinked:110,ethRefit:119},intervals:{}},
  ];
  assert.equal(disjointEthereumCases(rows).length,2);
  const result=summarizeEthereumComparison(rows,{horizons:[30]});
  const s=result.summaries.find(s=>s.model==='ethRefit');
  assert.equal(s.completedOutcomes,2);
  assert.equal(s.pairedBaselines.flat.sameOriginCases,2);
  assert.equal(s.pairedBaselines.flat.disjointCases,2);
  assert.equal(s.independentMarketRegimes,null);
  assert.equal(result.common[0].allRequestedCommonCases,0);
  assert.equal(s.experimentalInterval.cases,0);
  assert.equal(s.experimentalInterval.empiricalCoverage,null);
});
test('the integrated evaluator is deterministic, does not interpolate gaps or invent network data',()=>{
  const {btc,eth}=fixture(),asOf=eth.at(-1).date;
  const input={btcHistory:{prices:btc.map(r=>[r.date,r.price])},ethHistory:eth};
  const report=runEthereumModelComparison(input,{asOf});
  assert.equal(report.prospectiveScoredTargets,0);
  assert.equal(report.adoption.productionModelChanged,false);
  assert.equal(report.data.historicalVintagesAvailable,false);
  assert.equal(report.current.candidates.economic.status,'unavailable');
  assert.equal(report.current.candidates.combined.status,'unavailable');
  assert.ok(report.cases.some(r=>r.status==='pending'));
  assert.ok(report.cases.filter(r=>r.status==='pending').every(r=>r.actual===null));
  assert.ok(report.cases.every(r=>r.informationCutoffAt>r.origin));
  const altered={...input,ethHistory:[...eth,{date:dateFromDay(utcDay(asOf)+1),price:NaN}]};
  assert.deepEqual(runEthereumModelComparison(altered,{asOf}),report);
  const short=eth.filter((r,i)=>i!==500);
  assert.throws(()=>runEthereumModelComparison({...input,ethHistory:short},{asOf}),/730 contiguous/);
});
