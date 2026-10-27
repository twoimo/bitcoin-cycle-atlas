import test from 'node:test';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {ETH_INTERVAL_BENCHMARK_POLICY,buildEthereumGaussianIntervalBenchmark,evaluateEthereumGaussianIntervalBenchmark} from '../dist/ethereum-interval-benchmark.js';
const first=utcDay('2024-01-01'),date=i=>dateFromDay(first+i);
function history(n=500){
  let value=100;
  return Array.from({length:n},(_,i)=>{
    if(i)value*=Math.exp(i%2?.01:-.01);
    return {date:date(i),price:value};
  });
}
function caseAt(rows,i,h=30,{models=['adaptiveEth','pooledEth'],point=1,lower=.8,upper=1.2}={}){
  const anchor=rows[i].price;
  return {origin:date(i),targetDate:date(i+h),horizonDays:h,status:'retrospective',anchorPrice:anchor,actual:rows[i+h].price,
    predictions:Object.fromEntries(models.map(model=>[model,anchor*point])),
    simulatedIntervals:Object.fromEntries(models.map(model=>[model,{lower:anchor*lower,upper:anchor*upper,nominalPointwiseMass:.8,
      covered:true,logWidth:-999,logIntervalScore:-999}]))};
}
function evaluate(rows,cases,extra={}){
  return evaluateEthereumGaussianIntervalBenchmark({ethHistory:rows,cases,asOf:rows.at(-1).date,horizons:[30],...extra});
}
test('Gaussian control uses exactly 180 lagged log returns and the sample denominator 179',()=>{
  const rows=history(181),result=buildEthereumGaussianIntervalBenchmark({ethHistory:rows,asOf:date(180),horizons:[30]});
  assert.equal(result.status,'available');assert.equal(result.training.returnCount,180);assert.equal(result.training.varianceDenominator,179);
  const variance=.0001*180/179,radius=1.2815515655446004*Math.sqrt(variance*30),anchor=rows.at(-1).price;
  assert.ok(Math.abs(result.training.sampleLogReturnVariance-variance)<1e-15);
  assert.ok(Math.abs(Math.log(result.predictions[0].lower/anchor)+radius)<1e-12);
  assert.ok(Math.abs(Math.log(result.predictions[0].upper/anchor)-radius)<1e-12);
  assert.equal(result.predictions[0].price,anchor);assert.equal(result.predictions[0].nominalPointwiseMass,.8);
  assert.equal(result.assumptions.meanPriceEqualsObservedAnchor,false);assert.equal(result.assumptions.coverageGuarantee,false);
});
test('control fit and predictions ignore prices after their origin and changes before the 181-close window',()=>{
  const rows=history(),input={ethHistory:rows,asOf:date(250),horizons:[30,90,180]};
  const before=buildEthereumGaussianIntervalBenchmark(input),changed=structuredClone(rows);
  for(let i=0;i<70;i++)changed[i].price*=1000;
  for(let i=251;i<changed.length;i++)changed[i].price=Infinity;
  assert.deepEqual(buildEthereumGaussianIntervalBenchmark({...input,ethHistory:changed}),before);
});
test('missing or insufficient past daily closes leave control unavailable without interpolation',()=>{
  const rows=history(181);
  assert.equal(buildEthereumGaussianIntervalBenchmark({ethHistory:rows.slice(1),asOf:date(180)}).status,'unavailable');
  const missing=rows.filter((_,i)=>i!==90);
  const result=buildEthereumGaussianIntervalBenchmark({ethHistory:missing,asOf:date(180)});
  assert.equal(result.status,'unavailable');assert.equal(result.missingDate,date(90));assert.deepEqual(result.predictions,[]);
});
test('same-origin intersection precedes disjoint selection; fit is shared across models and horizons',()=>{
  const rows=history(),paired=[caseAt(rows,200),caseAt(rows,215),caseAt(rows,230),caseAt(rows,260)];
  const result=evaluate(rows,paired),base=result.summaries[0];
  assert.equal(base.sameOriginCases,4);assert.equal(base.disjointCases,3);
  assert.deepEqual(base.disjointOrigins,[date(200),date(230),date(260)]);assert.equal(result.fitCount,4);
  const extra=caseAt(rows,185,30,{models:[]}),next=evaluate(rows,[extra,...paired]);
  assert.deepEqual(next.summaries,result.summaries);
  assert.deepEqual(evaluate(rows,[...paired].reverse()),result);
});
test('point and proper interval scores are recomputed from source outcome and raw bounds',()=>{
  const rows=history(),row=caseAt(rows,200),result=evaluate(rows,[row]),s=result.summaries[0].disjoint.candidate;
  assert.equal(s.n,1);assert.equal(s.empiricalCoverage,1);assert.equal(s.lowerMisses,0);assert.equal(s.upperMisses,0);
  assert.ok(Math.abs(s.meanAbsoluteLogError)<1e-12);
  assert.ok(Math.abs(s.meanLogIntervalScore-Math.log(1.2/.8))<1e-12);
  assert.ok(Math.abs(s.meanUsdIntervalScore-row.anchorPrice*.4)<1e-10);
  assert.equal(s.meanLogWidth,s.medianLogWidth);assert.equal(s.meanUsdWidth,s.medianUsdWidth);
  const wide=evaluate(rows,[caseAt(rows,200,30,{lower:.01,upper:100})]).summaries[0].disjoint.candidate;
  assert.equal(wide.empiricalCoverage,1);assert.ok(wide.meanLogIntervalScore>s.meanLogIntervalScore);
  assert.ok(wide.meanUsdIntervalScore>s.meanUsdIntervalScore);
});
test('miss penalties are 2/alpha in log and USD coordinates and direction counts are explicit',()=>{
  const rows=history(),low=caseAt(rows,200,30,{point:1.4,lower:1.2,upper:1.6}),high=caseAt(rows,230,30,{point:.6,lower:.4,upper:.8});
  const result=evaluate(rows,[low,high]),s=result.summaries[0].disjoint.candidate;
  assert.equal(s.empiricalCoverage,0);assert.equal(s.lowerMisses,1);assert.equal(s.upperMisses,1);
  const exact=result.cases.find(row=>row.origin===low.origin&&row.model==='adaptiveEth');
  assert.ok(Math.abs(exact.scores.candidate.logIntervalScore-(Math.log(1.6/1.2)+10*Math.log(1.2)))<1e-12);
  assert.ok(Math.abs(exact.scores.candidate.usdIntervalScore-low.anchorPrice*2.4)<1e-9);
});
test('future/pending/missing outcomes do not score, and empty evidence stays null',()=>{
  const rows=history(),pending={...caseAt(rows,200),status:'pending'},missing={...caseAt(rows,230),actual:null};
  const result=evaluate(rows,[pending,missing]);
  assert.equal(result.status,'unavailable');assert.equal(result.summaries[0].disjoint.candidate.meanLogIntervalScore,null);
  assert.equal(result.summaries[0].intervalSkillAgainstControl,null);assert.equal(result.cases.length,0);
  const selected=rows.slice(0,251),future=caseAt(rows,240);
  assert.equal(evaluate(selected,[future]).cases.length,0);
});
test('appending or mutating future archive prices cannot change an already completed comparison',()=>{
  const rows=history(),cases=[caseAt(rows,200),caseAt(rows,230)],asOf=date(300);
  const initial=evaluateEthereumGaussianIntervalBenchmark({ethHistory:rows.slice(0,301),cases,asOf,horizons:[30]});
  const extended=structuredClone(rows);for(let i=301;i<extended.length;i++)extended[i].price=NaN;
  assert.deepEqual(evaluateEthereumGaussianIntervalBenchmark({ethHistory:extended,cases,asOf,horizons:[30]}),initial);
});
test('source binding, exact clock, common mass, ordered finite bounds and duplicate cases are mandatory',()=>{
  const rows=history(),row=caseAt(rows,200);
  for(const mutation of [r=>r.actual*=2,r=>r.anchorPrice*=2]){
    const changed=structuredClone(row);mutation(changed);assert.throws(()=>evaluate(rows,[changed]),/source close/);
  }
  assert.throws(()=>evaluate(rows,[{...row,targetDate:date(231)}]),/clock/);
  assert.throws(()=>evaluate(rows,[row,row]),/Duplicate/);
  for(const changes of [{lower:0},{upper:Infinity},{lower:200},{nominalPointwiseMass:.9}]){
    const changed=structuredClone(row);Object.assign(changed.simulatedIntervals.adaptiveEth,changes);
    assert.throws(()=>evaluate(rows,[changed]),/ordered|mass/);
  }
  assert.throws(()=>evaluate(rows,[row],{models:['legacyEth']}),/model keys/);
  assert.throws(()=>buildEthereumGaussianIntervalBenchmark({ethHistory:rows,asOf:date(499),horizons:[0]}),/horizons/);
});
test('a source gap makes only affected controls unavailable and does not remove valid common origins',()=>{
  const rows=history(),cases=[caseAt(rows,200),caseAt(rows,400)],broken=rows.filter((_,i)=>i!==100);
  const result=evaluate(broken,cases);
  assert.deepEqual(result.summaries[0].disjointOrigins,[date(400)]);
  assert.ok(result.excluded.some(row=>row.origin===date(200)&&/181/.test(row.reason)));
});
test('zero-variance control is explicitly degenerate and never divides by a zero baseline score',()=>{
  const rows=history().map(row=>({...row,price:100})),result=evaluate(rows,[caseAt(rows,200)]);
  assert.equal(result.cases[0].benchmark.lower,100);assert.equal(result.cases[0].benchmark.upper,100);
  assert.equal(result.summaries[0].disjoint.benchmark.meanLogIntervalScore,0);
  assert.equal(result.summaries[0].intervalSkillAgainstControl,null);
  assert.equal(result.summaries[0].pointSkillAgainstFlat,null);
});
test('USD scores beyond representable range are explicitly unavailable while finite log scores remain',()=>{
  const rows=history().map(row=>({...row,price:1e308})),row=caseAt(rows,200,30,{point:.5,lower:.1,upper:.5});
  const result=evaluate(rows,[row]),s=result.summaries[0].disjoint.candidate;
  assert.equal(s.usdScoreCount,0);assert.equal(s.usdScoreUnavailable,1);assert.equal(s.meanUsdIntervalScore,null);
  assert.ok(Number.isFinite(s.meanLogIntervalScore));assert.equal(result.summaries[0].candidateMinusControlUsdScore,null);
  assert.doesNotThrow(()=>JSON.stringify(result));
  assert.equal(ETH_INTERVAL_BENCHMARK_POLICY.coverageGuarantee,false);
});
