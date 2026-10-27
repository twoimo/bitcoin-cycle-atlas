import test from 'node:test';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {summarizeEthereumIntervalPair,summarizeEthereumBenchmarkIntervals} from '../dist/ethereum-model-comparison.js';
import {calibrateLogInterval} from '../dist/forecast-experiments.js';

const options={asOf:'2025-12-31',horizonDays:30,left:{model:'adaptiveEth',kind:'simulated'},right:{model:'pooledEth',kind:'simulated'}};
const band=(lower=90,upper=110)=>({lower,upper,nominalPointwiseMass:.8,covered:false,logWidth:-999,logIntervalScore:-999});
function row(origin,{actual=100,left=band(),right=band(),status='completed'}={}){
  return {origin,targetDate:dateFromDay(utcDay(origin)+30),horizonDays:30,actual,status,
    simulatedIntervals:{adaptiveEth:left,pooledEth:right}};
}
const compare=rows=>summarizeEthereumIntervalPair(rows,options);
test('interval pairs intersect origins before disjoint selection and ignore unpaired easy cases',()=>{
  const common=[row('2025-01-10'),row('2025-02-09'),row('2025-03-11')];
  const baseline=compare(common);
  assert.deepEqual(compare([row('2025-01-01',{right:null}),...common]),baseline);
  assert.equal(baseline.disjointCases,3);
  assert.deepEqual(baseline.disjointOrigins,common.map(r=>r.origin));
  assert.deepEqual(compare([...common].reverse()),baseline);
});
test('proper interval score penalizes excessive width even when coverage is identical and ignores cached scores',()=>{
  const result=compare([row('2025-01-01',{left:band(90,110),right:band(1,10000)})]);
  assert.equal(result.disjoint.left.empiricalCoverage,1);
  assert.equal(result.disjoint.right.empiricalCoverage,1);
  assert.ok(Math.abs(result.disjoint.left.meanLogIntervalScore-Math.log(110/90))<1e-12);
  assert.ok(result.rightMinusLeftMeanLogIntervalScore>8);
  assert.equal(result.disjoint.left.lowerMisses,0);
  assert.equal(result.disjoint.left.upperMisses,0);
});
test('interval score recomputes upper and lower misses in log coordinates',()=>{
  const result=compare([row('2025-01-01',{actual:80}),row('2025-02-01',{actual:120})]);
  assert.equal(result.disjoint.left.empiricalCoverage,0);
  assert.equal(result.disjoint.left.lowerMisses,1);
  assert.equal(result.disjoint.left.upperMisses,1);
  const expected=Math.log(110/90)+5*(Math.log(90/80)+Math.log(120/110));
  assert.ok(Math.abs(result.disjoint.left.meanLogIntervalScore-expected)<1e-12);
});
test('future, pending and missing outcomes do not contribute to scores',()=>{
  const rows=[row('2025-01-01'),row('2025-12-15'),row('2025-02-01',{status:'pending'}),row('2025-03-01',{actual:null})];
  assert.deepEqual(compare(rows),compare(rows.slice(0,1)));
});
test('invalid interval definitions, outcomes and duplicate common origins fail explicitly',()=>{
  for(const invalid of [band(110,90),band(0,110),band(90,Infinity),{...band(),nominalPointwiseMass:.9},{...band(),nominalPointwiseMass:'0.8'}])
    assert.throws(()=>compare([row('2025-01-01',{left:invalid})]),/bounds|mass/);
  assert.throws(()=>compare([row('2025-01-01',{actual:NaN})]),/outcome/);
  assert.throws(()=>compare([{...row('2025-01-01'),targetDate:'2025-02-01'}]),/clock/);
  assert.throws(()=>compare([row('2025-01-01'),row('2025-01-01')]),/Duplicate/);
  for(const alpha of [0,1,NaN,'0.2'])assert.throws(()=>summarizeEthereumIntervalPair([],{...options,alpha}),/settings/);
  assert.throws(()=>summarizeEthereumIntervalPair([],{...options,left:{model:'unknown',kind:'simulated'}}),/Unknown/);
});
test('empty common evidence is unavailable with null scores, never zero error',()=>{
  const result=compare([row('2025-01-01',{right:null})]);
  assert.equal(result.status,'unavailable');assert.equal(result.sameOriginCases,0);assert.equal(result.disjointCases,0);
  assert.equal(result.disjoint.left.meanLogIntervalScore,null);
  assert.equal(result.disjoint.left.empiricalCoverage,null);
  assert.equal(result.rightMinusLeftMeanLogIntervalScore,null);
});
test('raw versus empirical comparison excludes insufficient calibration without filling missing bands',()=>{
  const raw=row('2025-01-01');raw.intervals={adaptiveEth:{status:'insufficient-matured-errors',lower:null,upper:null}};
  const settings={...options,right:{model:'adaptiveEth',kind:'experimental'}};
  assert.equal(summarizeEthereumIntervalPair([raw],settings).sameOriginCases,0);
  raw.intervals.adaptiveEth={status:'experimental',alpha:.2,lower:80,upper:120};
  assert.equal(summarizeEthereumIntervalPair([raw],settings).sameOriginCases,1);
  raw.intervals.adaptiveEth.alpha=.1;
  assert.throws(()=>summarizeEthereumIntervalPair([raw],settings),/mass/);
});

const empirical=(lower=90,upper=110)=>({status:'experimental',alpha:.2,lower,upper,
  covered:false,logWidth:-999,logIntervalScore:-999});
const benchmarkComparison=(rows,baseline='flat',model='adaptiveEth')=>
  summarizeEthereumBenchmarkIntervals(rows,{asOf:options.asOf,horizons:[30]})
    .find(result=>result.left.model===model&&result.right.model===baseline);

test('simple interval controls use each exact common cohort before removing target overlap',()=>{
  const early=row('2025-01-01');
  early.intervals={flat:{status:'insufficient-matured-errors',lower:null,upper:null},shrunkenTrend:empirical()};
  const common=[row('2025-01-10'),row('2025-02-09'),row('2025-03-11')];
  for(const item of common)item.intervals={flat:empirical(),shrunkenTrend:empirical(80,120)};
  for(const model of ['adaptiveEth','pooledEth']){
    assert.deepEqual(benchmarkComparison([early,...common],'flat',model),benchmarkComparison(common,'flat',model));
    assert.deepEqual(benchmarkComparison(common,'flat',model).disjointOrigins,common.map(r=>r.origin));
    assert.deepEqual(benchmarkComparison([early,...common],'shrunkenTrend',model).disjointOrigins,
      ['2025-01-01','2025-02-09','2025-03-11']);
  }
  assert.equal(benchmarkComparison([early]).status,'unavailable');
  assert.equal(benchmarkComparison([early]).disjoint.right.meanLogIntervalScore,null);
});

test('benchmark interval scores are recalculated from frozen bounds despite tampered cached fields',()=>{
  const item=row('2025-01-01');item.intervals={flat:empirical(),shrunkenTrend:empirical(80,120)};
  const before=summarizeEthereumBenchmarkIntervals([item],{asOf:options.asOf,horizons:[30]});
  const forged=structuredClone(item);
  for(const interval of Object.values(forged.intervals))Object.assign(interval,{covered:true,logWidth:1e100,logIntervalScore:-1e100});
  assert.deepEqual(summarizeEthereumBenchmarkIntervals([forged],{asOf:options.asOf,horizons:[30]}),before);
  forged.intervals.flat.lower=70;forged.intervals.flat.upper=80;
  const changed=benchmarkComparison([forged]);
  assert.equal(changed.disjoint.right.empiricalCoverage,0);
  assert.equal(changed.disjoint.right.upperMisses,1);
  assert.ok(Math.abs(changed.disjoint.right.meanLogIntervalScore-(Math.log(80/70)+10*Math.log(100/80)))<1e-12);
  assert.ok(changed.rightMinusLeftMeanLogIntervalScore>0);
});

test('benchmark calibration is fixed at the original origin and excludes later large or invalid outcomes',()=>{
  const origin='2025-01-01',first=utcDay('2023-01-01');
  const past=Array.from({length:14},(_,i)=>({origin:dateFromDay(first+30*i),targetDate:dateFromDay(first+30*(i+1)),
    horizonDays:30,predicted:100,actual:100*Math.exp((i%2?-1:1)*(.01+.005*i))}));
  const settings={origin,predicted:100,horizonDays:30,alpha:.2,minCount:12};
  const fixed=calibrateLogInterval(past,settings);
  assert.equal(fixed.status,'experimental');assert.equal(fixed.usedCount,14);
  const future=[
    {origin:'2024-12-15',targetDate:'2025-01-14',horizonDays:30,predicted:1e200,actual:1e-200},
    {origin:'2025-01-15',targetDate:'2025-02-14',horizonDays:30,predicted:NaN,actual:NaN},
  ];
  assert.deepEqual(calibrateLogInterval([...past,...future],settings),fixed);
  const current=row(origin);current.intervals={flat:fixed,shrunkenTrend:{...fixed}};
  const pending=row('2025-12-15',{actual:1e250});pending.intervals={flat:empirical(1,2),shrunkenTrend:empirical(1,2)};
  assert.deepEqual(summarizeEthereumBenchmarkIntervals([current,pending],{asOf:options.asOf,horizons:[30]}),
    summarizeEthereumBenchmarkIntervals([current],{asOf:options.asOf,horizons:[30]}));
});

test('simple interval controls keep horizon clocks and nominal probability mass separate',()=>{
  const rows=[30,90,180].map(horizonDays=>({origin:'2025-01-01',targetDate:dateFromDay(utcDay('2025-01-01')+horizonDays),
    horizonDays,actual:100,status:'completed',simulatedIntervals:{adaptiveEth:band(),pooledEth:band()},
    intervals:{flat:empirical(),shrunkenTrend:empirical(80,120)}}));
  const results=summarizeEthereumBenchmarkIntervals(rows,{asOf:options.asOf});
  assert.equal(results.length,12);
  for(const result of results){
    assert.equal(result.sameOriginCases,1);assert.equal(result.disjointCases,1);
    assert.equal(result.alpha,.2);assert.equal(result.coverageGuarantee,false);
    assert.equal(result.disjoint.right.empiricalCoverage,1);
  }
  rows[1].intervals.flat.alpha=.1;
  assert.throws(()=>summarizeEthereumBenchmarkIntervals(rows,{asOf:options.asOf}),/mass/);
});
