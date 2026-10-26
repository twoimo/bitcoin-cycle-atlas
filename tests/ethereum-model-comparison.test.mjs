import test from 'node:test';
import {shortCycleFixture} from './helpers/eth-cycle-short-fixture.mjs';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {buildSimpleEthereumBtcLink,buildEthereumRelativeBenchmarks,buildEthereumCombinedCandidate,summarizeEthereumComparison,runEthereumModelComparison,disjointEthereumCases} from '../dist/ethereum-model-comparison.js';

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

test('pairwise candidate scores never substitute noncommon dates or call overlap independent',()=>{
  const cases=[
    {origin:'2024-01-01',targetDate:'2024-01-31',horizonDays:30,anchorPrice:100,actual:110,predictions:{btcTransfer:110,ethRefit:100},intervals:{}},
    {origin:'2024-01-15',targetDate:'2024-02-14',horizonDays:30,anchorPrice:100,actual:80,predictions:{btcTransfer:800,ethRefit:80},intervals:{}},
    {origin:'2024-02-01',targetDate:'2024-03-02',horizonDays:30,anchorPrice:100,actual:120,predictions:{btcTransfer:120,ethRefit:100},intervals:{}},
    {origin:'2024-03-03',targetDate:'2024-04-02',horizonDays:30,anchorPrice:100,actual:1,predictions:{legacyEth:1},intervals:{}},
  ];
  const report=summarizeEthereumComparison([...cases].reverse(),{horizons:[30],models:['btcTransfer','ethRefit','legacyEth']});
  const pair=report.pairwise.find(p=>p.left==='btcTransfer'&&p.right==='ethRefit');
  assert.equal(pair.sameOriginCases,3);
  assert.equal(pair.firstCommonOrigin,'2024-01-01');
  assert.equal(pair.lastCommonOrigin,'2024-02-01');
  assert.equal(pair.disjointCases,2);
  assert.deepEqual(pair.disjointOrigins,['2024-01-01','2024-02-01']);
  assert.equal(pair.leftScore.meanAbsoluteLogError,0);
  assert.equal(pair.leftSkillAgainstRight,1);
  assert.equal(pair.independentSampleSize,null);
  const missing=report.pairwise.find(p=>p.left==='ethRefit'&&p.right==='legacyEth');
  assert.equal(missing.sameOriginCases,0);
  assert.equal(missing.leftScore.meanAbsoluteLogError,null);
  assert.equal(missing.leftSkillAgainstRight,null);
});
test('late BTC archive makes only BTC-dependent origins unavailable without aborting ETH replay',()=>{
  const {btc,eth}=fixture('2020-01-01',1400);
  const report=runEthereumModelComparison({ethHistory:eth,btcHistory:btc.slice(800)},{asOf:eth.at(-1).date});
  const early=report.cases[0];
  assert.ok(early.predictions.flat>0);
  assert.ok(early.unavailableModels.btcLinked);
  assert.equal(early.predictions.btcLinked,undefined);
  assert.equal(report.current.candidates.btcLinked.status,'ready');
  assert.deepEqual(report.data.btcGaps,[]);
  assert.equal(report.data.discardedEarlyBtcObservations,0);
  const gapped=runEthereumModelComparison({ethHistory:eth,btcHistory:btc.filter((r,i)=>i!==800)},{asOf:eth.at(-1).date});
  assert.equal(gapped.data.btcGaps.length,1);
  assert.equal(gapped.data.discardedEarlyBtcObservations,0);
  assert.equal(gapped.data.currentPrefixDiscardedBtcObservations,800);
  assert.ok(report.summaries.find(s=>s.model==='flat'&&s.horizonDays===30).completedOutcomes>0);
});

test('ETH/BTC has its own observed target and causal ratio benchmarks',()=>{
  const {btc,eth}=fixture('2020-01-01',1000),asOf=eth[800].date;
  const reference=buildEthereumRelativeBenchmarks({ethRows:eth,btcRows:btc,asOf});
  assert.equal(reference.status,'ready');
  assert.equal(reference.assumptions.target,'ETH/BTC');
  assert.equal(reference.anchorRatio,eth[800].price/btc[800].price);
  const poisoned=btc.map(r=>r.date>asOf?{...r,price:1e90}:r);
  assert.deepEqual(buildEthereumRelativeBenchmarks({ethRows:eth,btcRows:poisoned,asOf}),reference);
  const report=runEthereumModelComparison({ethHistory:eth,btcHistory:btc},{asOf:eth.at(-1).date});
  const ratio=report.relativeStrength.cases.find(c=>c.actual!==null);
  const ethTarget=eth.find(r=>r.date===ratio.targetDate),btcTarget=btc.find(r=>r.date===ratio.targetDate);
  assert.equal(ratio.actual,ethTarget.price/btcTarget.price);
  assert.notEqual(ratio.actual,ethTarget.price);
  assert.equal(ratio.predictions.economic,undefined);
  assert.equal(report.relativeStrength.summaries.find(s=>s.model==='economic').completedOutcomes,0);
});
test('unexpected input accessor faults propagate instead of looking like missing prices',()=>{
  const {btc,eth}=fixture();
  const sentinel=new Error('sentinel internal failure');
  const broken=[{get date(){throw sentinel;}}];
  assert.throws(()=>buildSimpleEthereumBtcLink({ethRows:eth,btcRows:broken,asOf:eth.at(-1).date}),e=>e===sentinel);
});

test('explicit issue clocks are preserved and cannot predate the completed origin close',()=>{
  const {btc,eth}=fixture(),asOf=eth.at(-1).date;
  const next=dateFromDay(utcDay(asOf)+1),issuedAt=next+'T06:00:00.000Z';
  const input={ethHistory:eth,btcHistory:btc,issuedAtByOrigin:{[asOf]:issuedAt}};
  const report=runEthereumModelComparison(input,{asOf});
  assert.equal(report.current.issuedAt,issuedAt);
  assert.equal(report.current.informationCutoffAt,issuedAt);
  assert.equal(report.data.explicitIssueTimeCount,1);
  assert.ok(report.cases.every(c=>c.targetAvailableAt===null));
  assert.throws(()=>runEthereumModelComparison({...input,issuedAtByOrigin:{[asOf]:asOf+'T23:00:00Z'}},{asOf}),/issue timestamp/);
});


test('the complete comparison preserves valid per-horizon ETH refits and precise unavailable reasons',()=>{
  const eth=shortCycleFixture(),asOf=eth.at(-1).date;
  const btc=eth.map(row=>({...row,price:row.price*10}));
  const report=runEthereumModelComparison({ethHistory:eth,btcHistory:btc},{asOf});
  for(const h of [30,90]){
    const row=report.cases.find(c=>c.origin===asOf&&c.horizonDays===h);
    assert.ok(row.predictions.ethRefit>0);
    assert.equal(row.unavailableModels.ethRefit,undefined);
  }
  const unavailable=report.cases.find(c=>c.origin===asOf&&c.horizonDays===180);
  assert.equal(unavailable.predictions.ethRefit,undefined);
  assert.match(unavailable.unavailableModels.ethRefit,/next estimated low/);
  assert.deepEqual(report.origins.find(o=>o.origin===asOf).models.ethRefit.perHorizonAvailability,[
    {horizonDays:30,available:true},{horizonDays:90,available:true},{horizonDays:180,available:false},
  ]);
  assert.equal(report.adoption.productionModelChanged,false);
});

test('a later BTC gap cannot erase already completed earlier predictions or their paired targets',()=>{
  const {eth,btc}=fixture('2020-01-01',1400),asOf=eth.at(-1).date,origin=eth[1010].date;
  const base=runEthereumModelComparison({ethHistory:eth,btcHistory:btc},{asOf});
  const gap=runEthereumModelComparison({ethHistory:eth,btcHistory:btc.filter((_,i)=>i!==1200)},{asOf});
  assert.deepEqual(gap.cases.filter(r=>r.origin===origin),base.cases.filter(r=>r.origin===origin));
  assert.deepEqual(gap.relativeStrength.cases.filter(r=>r.origin===origin),base.relativeStrength.cases.filter(r=>r.origin===origin));
  assert.deepEqual(gap.origins.find(r=>r.origin===origin),base.origins.find(r=>r.origin===origin));
  assert.ok(gap.cases.some(r=>r.origin===origin&&r.predictions.btcLinked>0));
  assert.equal(gap.data.btcObservations,1399);
});

test('a later ETH gap preserves the first eligible grid and marks only insufficient past prefixes unavailable',()=>{
  const {eth,btc}=fixture('2020-01-01',1400),asOf=eth.at(-1).date,origin=eth[1010].date;
  const base=runEthereumModelComparison({ethHistory:eth,btcHistory:btc},{asOf});
  const gap=runEthereumModelComparison({ethHistory:eth.filter((_,i)=>i!==1200),btcHistory:btc},{asOf});
  assert.deepEqual(gap.cases.filter(r=>r.origin===origin),base.cases.filter(r=>r.origin===origin));
  assert.deepEqual(gap.origins.filter(r=>r.origin<eth[1200].date),base.origins.filter(r=>r.origin<eth[1200].date));
  assert.equal(gap.data.discardedEarlyEthObservations,0);
  for(const candidate of Object.values(gap.current.candidates)){
    assert.equal(candidate.status,'unavailable');assert.match(candidate.reason,/730 contiguous/);
  }
});

test('mature missing ETH or BTC target observations are not future pending targets and later history can recover',()=>{
  const {eth,btc}=fixture('2020-01-01',2200),asOf=eth.at(-1).date,origin=eth[1010].date;
  const base=runEthereumModelComparison({ethHistory:eth,btcHistory:btc},{asOf});
  for(const symbol of ['ETH','BTC']){
    const gap=runEthereumModelComparison({ethHistory:symbol==='ETH'?eth.filter((_,i)=>i!==1040):eth,
      btcHistory:symbol==='BTC'?btc.filter((_,i)=>i!==1040):btc},{asOf});
    const cases=symbol==='ETH'?gap.cases:gap.relativeStrength.cases;
    const prior=symbol==='ETH'?base.cases:base.relativeStrength.cases;
    const row=cases.find(r=>r.origin===origin&&r.horizonDays===30);
    assert.deepEqual(row.predictions,prior.find(r=>r.origin===origin&&r.horizonDays===30).predictions);
    assert.equal(row.actual,null);
    assert.equal(row.status,symbol==='ETH'?'missing-observation':'missing-paired-close');
    const summary=(symbol==='ETH'?gap.summaries:gap.relativeStrength.summaries).find(r=>r.model==='flat'&&r.horizonDays===30);
    assert.ok(summary.missingOutcomes>=1);
    assert.equal(summary.pendingTargets,cases.filter(r=>r.horizonDays===30&&r.status==='pending'&&r.predictions.flat>0).length);
    assert.equal(gap.current.candidates.flat.status,'ready');
  }
});
