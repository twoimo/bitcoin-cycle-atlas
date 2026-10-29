import test from 'node:test';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {buildIndependentBenchmarks} from '../dist/forecast-evaluation.js';
import {buildEthereumAdaptiveCandidate} from '../dist/ethereum-adaptive-model.js';
import {buildEthereumPooledCandidate} from '../dist/ethereum-pooled-model.js';
import {buildEthereumWarmStartCandidate,ETH_WARM_START_POLICY} from '../dist/ethereum-warm-start-model.js';
import {ETH_MC_STABILITY_POLICY} from '../scripts/ethereum-monte-carlo-stability-core.mjs';
import {ETH_COMMON_COHORT_POLICY as policy,selectEthereumCommonCohorts,staticCommonCohortReplicates,summarizeEthereumCommonPanel} from '../scripts/ethereum-common-cohort-core.mjs';
import {buildEthereumCommonCohortReport} from '../scripts/evaluate-ethereum-common-cohort.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,a+' != '+b);
function example(origin='2024-01-01',horizonDays=30){
  const anchorPrice=Math.exp(.25);
  return {origin,targetDate:dateFromDay(utcDay(origin)+horizonDays),horizonDays,anchorPrice,actual:1,status:'retrospective',
    predictions:{adaptiveEth:anchorPrice,pooledEth:Math.exp(.2),warmStartEth:Math.exp(.1),flat:anchorPrice,shrunkenTrend:Math.exp(.15)},
    simulatedIntervals:Object.fromEntries(policy.simulationModels.map(model=>[model,{lower:Math.exp(-.1),upper:Math.exp(.5),nominalPointwiseMass:.8}]))};
}
function controls(cases){return cases.map(row=>({origin:row.origin,targetDate:row.targetDate,horizonDays:row.horizonDays,status:'available',
  price:row.anchorPrice,lower:1,upper:Math.exp(.5),nominalPointwiseMass:.8}));}
function select(cases,gaussianControls=controls(cases)){return selectEthereumCommonCohorts({cases,asOf:'2024-12-31',gaussianControls});}
function panel(cohorts){
  const rows=cohorts.flatMap(cohort=>policy.simulationModels.flatMap(model=>policy.sampleCounts.flatMap(sampleCount=>policy.seeds.map(seed=>({
    cohortId:cohort.id,model,sampleCount,seed,points:cohort.cases.map(row=>({origin:row.origin,targetDate:row.targetDate,horizonDays:cohort.horizonDays,
      median:Math.exp(model==='adaptiveEth'?.25:model==='warmStartEth'?.1:seed===20261027?.2:.3),lower:Math.exp(-.1),upper:Math.exp(.5)})),
  })))));
  return [...rows,...staticCommonCohortReplicates(cohorts)];
}

test('five-way intersection precedes disjoint selection, with a distinct Gaussian interval cohort',()=>{
  assert.equal(policy.seeds,ETH_MC_STABILITY_POLICY.seeds);assert.equal(policy.sampleCounts,ETH_MC_STABILITY_POLICY.sampleCounts);
  const cases=['2024-01-01','2024-01-15','2024-01-20','2024-02-14','2024-03-15'].map(date=>example(date));
  delete cases[0].predictions.warmStartEth;delete cases[0].simulatedIntervals.warmStartEth;
  delete cases[4].predictions.shrunkenTrend;
  const before=structuredClone(cases),cohorts=select(cases),point=cohorts.find(row=>row.id==='common-point:30'),interval=cohorts.find(row=>row.id==='common-interval:30');
  assert.deepEqual(point.disjointOrigins,['2024-01-15','2024-02-14']);
  assert.deepEqual(interval.disjointOrigins,['2024-01-15','2024-02-14','2024-03-15']);
  assert.equal(point.eligibleBeforeDisjoint,3);assert.equal(point.n,2);
  assert.ok(point.excluded.find(row=>row.origin==='2024-01-01').reasons.some(reason=>reason.model==='warmStartEth'));
  assert.equal(point.excluded.find(row=>row.origin==='2024-01-20').reasons[0].code,'overlaps-earlier-common-window');
  assert.ok(point.excluded.find(row=>row.origin==='2024-03-15').reasons.some(reason=>reason.model==='shrunkenTrend'));
  assert.deepEqual(cases,before);
});

test('future poisoned outcomes cannot alter fixed cohorts and unavailable controls only affect interval membership',()=>{
  const cases=[example(),example('2024-02-15')],gaussian=controls(cases);
  gaussian[0]={...gaussian[0],status:'unavailable',reason:'Missing past close'};
  const result=select(cases,gaussian);
  assert.equal(result.find(row=>row.id==='common-point:30').n,2);
  assert.equal(result.find(row=>row.id==='common-interval:30').n,1);
  const future=example('2025-01-01'),initial=select([...cases,future],gaussian);
  future.actual=NaN;future.anchorPrice=NaN;future.predictions.warmStartEth=-1;
  assert.deepEqual(select([...cases,future],gaussian),initial);
  assert.ok(initial.find(row=>row.id==='common-point:30').excluded.some(row=>row.reasons[0].code==='not-mature-at-cutoff'));
});

test('duplicate identities, incompatible mass, malformed mature prices and wrong target clocks fail',()=>{
  const row=example();assert.throws(()=>select([row,row]),/Duplicate/);
  assert.throws(()=>select([{...row,targetDate:'2024-02-01'}]),/identity/);
  assert.throws(()=>select([{...row,actual:NaN}]),/positive and finite/);
  const wrongMass=structuredClone(row);wrongMass.simulatedIntervals.warmStartEth.nominalPointwiseMass=.9;
  assert.throws(()=>select([wrongMass]),/identical nominal mass/);
  const crossed=structuredClone(row);crossed.simulatedIntervals.adaptiveEth.lower=10;
  assert.throws(()=>select([crossed]),/Ordered/);
  const wrongFlat=structuredClone(row);wrongFlat.predictions.flat=2;
  assert.throws(()=>select([wrongFlat]),/origin anchor/);
});

test('hand-calculated panel compares all models on one cohort and reports cross-seed changes without statistical claims',()=>{
  const cohorts=select([example()]),result=summarizeEthereumCommonPanel(cohorts,panel(cohorts));
  const summary=result.summaries.find(row=>row.cohortId==='common-point:30'&&row.model==='warmStartEth'&&row.sampleCount===256);
  close(summary.meanAbsoluteLogError.min,.1);close(summary.meanAbsoluteLogError.max,.1);
  close(summary.pointSkillsAgainstStaticControls.flat.min,.6);
  const sensitive=result.comparisons.find(row=>row.cohortId==='common-point:30'&&row.left==='adaptiveEth'&&row.right==='pooledEth'&&row.sampleCount===256);
  close(sensitive.leftMinusRightCrossSeedEnvelope.min,-.05);close(sensitive.leftMinusRightCrossSeedEnvelope.max,.05);
  assert.match(sensitive.status,/sensitive/);
  const warm=result.comparisons.find(row=>row.cohortId==='common-point:30'&&row.left==='adaptiveEth'&&row.right==='warmStartEth'&&row.sampleCount===256);
  assert.equal(warm.status,'all-declared-combinations-favor-right');
  const staticRows=result.replicates.filter(row=>row.cohortId==='common-point:30'&&row.model==='flat');assert.equal(staticRows.length,1);
  assert.equal(result.summaries.find(row=>row.model==='flat').replicateCount,1);
  assert.equal(result.interpretation.commonRandomNumbersAcrossModels,false);assert.equal(result.interpretation.confidenceInterval,false);
  assert.equal(result.interpretation.marketPredictionSignificance,false);
});

test('cached scores never override raw points and proper interval scores punish extra width',()=>{
  const cohorts=select([example()]),original=panel(cohorts),poisoned=structuredClone(original).reverse();
  for(const replicate of poisoned)for(const point of replicate.points){point.absoluteLogError=-100;point.logIntervalScore=-100;point.covered=false;}
  const expected=summarizeEthereumCommonPanel(cohorts,original);
  assert.deepEqual(summarizeEthereumCommonPanel(cohorts,poisoned),expected);
  const changed=structuredClone(original),row=changed.find(value=>value.cohortId==='common-interval:30'&&value.model==='warmStartEth'&&value.sampleCount===256&&value.seed===20261027);
  row.points[0].upper=Math.exp(1.5);
  const score=summarizeEthereumCommonPanel(cohorts,changed).replicates.find(value=>value.cohortId===row.cohortId&&value.model===row.model&&value.seed===row.seed&&value.sampleCount===row.sampleCount);
  const prior=expected.replicates.find(value=>value.cohortId===row.cohortId&&value.model===row.model&&value.seed===row.seed&&value.sampleCount===row.sampleCount);
  close(score.meanLogIntervalScore-prior.meanLogIntervalScore,1);assert.equal(score.included,prior.included);
});

test('missing or failed selected slots, controls, cohorts and target identities are never silently omitted',()=>{
  const cohorts=select([example()]),values=panel(cohorts);
  assert.throws(()=>summarizeEthereumCommonPanel(cohorts,values.slice(1)),/Incomplete/);
  assert.throws(()=>summarizeEthereumCommonPanel(cohorts,[...values,values[0]]),/duplicated/);
  assert.throws(()=>summarizeEthereumCommonPanel(cohorts.slice(1),values),/Incomplete fixed/);
  const missing=structuredClone(values);missing[0].points=[];
  assert.throws(()=>summarizeEthereumCommonPanel(cohorts,missing),/fixed common cohort/);
  const failed=structuredClone(values);failed[0].status='failed';failed[0].reason='overflow';
  assert.throws(()=>summarizeEthereumCommonPanel(cohorts,failed),/no selective omission/);
  const wrong=structuredClone(values);wrong[0].points[0].targetDate='2024-02-01';
  assert.throws(()=>summarizeEthereumCommonPanel(cohorts,wrong),/target identity/);
  assert.throws(()=>summarizeEthereumCommonPanel(cohorts,values.filter(row=>row.model!=='gaussian')),/Incomplete/);
});

test('empty common cohorts remain null evidence and zero-loss controls have undefined skill',()=>{
  const empty=select([]),result=summarizeEthereumCommonPanel(empty,panel(empty));
  assert.ok(result.replicates.every(row=>row.n===0&&row.meanAbsoluteLogError===null));
  assert.ok(result.comparisons.every(row=>row.status==='no-mature-common-cases'));
  const row=example();row.actual=row.anchorPrice;const cohorts=select([row]);
  const summaries=summarizeEthereumCommonPanel(cohorts,panel(cohorts)).summaries;
  assert.ok(summaries.filter(value=>value.kind==='point').every(value=>value.pointSkillsAgainstStaticControls.flat.count===0));
});

function fixture(){
  const first=utcDay('2021-01-01');let log=7;
  const ethHistory=Array.from({length:1620},(_,index)=>{
    if(index)log+=(index%260<160?.013:-.020)+.012*Math.sin(index*.41);
    return {date:dateFromDay(first+index),price:Math.exp(log)};
  });
  const originIndex=1400,origin=ethHistory[originIndex].date,asOf=ethHistory[originIndex+180].date;
  const simple=buildIndependentBenchmarks(ethHistory,{asOf:origin,horizons:policy.horizons});
  const models={adaptiveEth:buildEthereumAdaptiveCandidate({ethRows:ethHistory,asOf:origin}),
    pooledEth:buildEthereumPooledCandidate({ethRows:ethHistory,asOf:origin}),warmStartEth:buildEthereumWarmStartCandidate({ethRows:ethHistory,asOf:origin})};
  for(const candidate of Object.values(models))assert.equal(candidate.status,'available');
  const cases=policy.horizons.map(horizonDays=>{
    const baseline=simple.targets.find(row=>row.horizonDays===horizonDays);
    const predictions={flat:baseline.flat,shrunkenTrend:baseline.shrunkenTrend},simulatedIntervals={};
    for(const model of ['adaptiveEth','pooledEth']){
      const p=models[model].predictions.find(row=>row.horizonDays===horizonDays);
      predictions[model]=p.price;simulatedIntervals[model]={lower:p.simulatedLower,upper:p.simulatedUpper,nominalPointwiseMass:.8};
    }
    return {origin,targetDate:baseline.targetDate,horizonDays,anchorPrice:ethHistory[originIndex].price,
      actual:ethHistory[originIndex+horizonDays].price,status:'retrospective',predictions,simulatedIntervals};
  });
  const comparison={kind:'ethereum-candidate-comparison',asOf,cases};
  const warmStart={kind:'ethereum-warm-start-research',policy:ETH_WARM_START_POLICY,asOf,origins:[{origin,status:'available',reason:null}],
    cases:cases.map(row=>{
      const p=models.warmStartEth.predictions.find(value=>value.horizonDays===row.horizonDays);
      return {...row,predictions:{...row.predictions,warmStartEth:p.price},simulatedIntervals:{...row.simulatedIntervals,
        warmStartEth:{lower:p.simulatedLower,upper:p.simulatedUpper,nominalPointwiseMass:.8}}};
    })};
  return {ethHistory,comparison,warmStart};
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const withoutRuntime=report=>{const {runtime,...rest}=report;return rest;};
let realInput,realReport;

test('actual model panel replays defaults, reuses fits and preserves factorized raw results and original reports',()=>{
  realInput=fixture();const before=structuredClone(realInput);freeze(realInput);
  realReport=buildEthereumCommonCohortReport(realInput);
  assert.equal(realReport.result.status,'complete');assert.deepEqual(realReport.failures,[]);
  assert.equal(realReport.runtime.requiredFits,3);assert.equal(realReport.runtime.successfulFits,3);
  assert.equal(realReport.runtime.successfulSimulations,48);assert.equal(realReport.runtime.completedDrawDays,5529600);
  assert.equal(realReport.defaultReplay.length,9);assert.ok(realReport.defaultReplay.every(row=>row.medianExact&&row.intervalExact));
  assert.equal(realReport.selectedCases.length,3);assert.equal(realReport.simulationPoints.length,144);
  const caseMap=new Map(realReport.selectedCases.map(row=>[row.key,row])),pointMap=new Map(realReport.simulationPoints.map(row=>[row.key,row]));
  const cohorts=realReport.cohorts.map(row=>({...row,cases:row.caseKeys.map(key=>caseMap.get(key))}));
  const replicates=realReport.panelMembership.map(row=>({...row,points:(row.pointKeys??row.caseKeys).map(key=>{
    const point=row.pointKeys?pointMap.get(key):null,input=caseMap.get(point?.caseKey??key);
    return {origin:input.origin,targetDate:input.targetDate,horizonDays:input.horizonDays,
      ...(point?{median:point.median,lower:point.lower,upper:point.upper}:row.model==='gaussian'?input.gaussian:{median:input.predictions[row.model]})};
  })}));
  assert.deepEqual(summarizeEthereumCommonPanel(cohorts,replicates),realReport.result);
  assert.deepEqual(realInput,before);
});

test('full fixed-seed results ignore future archive poison; changed later outcomes change scores but never origin forecasts',()=>{
  const poisoned=structuredClone(realInput);
  for(const row of poisoned.ethHistory)if(row.date>poisoned.comparison.asOf)row.price=NaN;
  assert.deepEqual(withoutRuntime(buildEthereumCommonCohortReport(poisoned)),withoutRuntime(realReport));
  const changed=structuredClone(realInput),targetDates=new Set(changed.comparison.cases.map(row=>row.targetDate));
  for(const row of changed.ethHistory)if(targetDates.has(row.date))row.price*=1.25;
  for(const report of [changed.comparison,changed.warmStart])for(const row of report.cases)row.actual*=1.25;
  const result=buildEthereumCommonCohortReport(changed);
  assert.deepEqual(result.simulationPoints,realReport.simulationPoints);assert.deepEqual(result.fitDiagnostics,realReport.fitDiagnostics);
  assert.deepEqual(result.cohorts.map(row=>row.caseKeys),realReport.cohorts.map(row=>row.caseKeys));
  assert.notDeepEqual(result.result.replicates,realReport.result.replicates);
});

test('source mismatch and pre-existing report mutation fail; a warm default mismatch leaves the fixed panel incomplete',()=>{
  const priorChanged=structuredClone(realInput);priorChanged.warmStart.cases[0].predictions.adaptiveEth*=1.001;
  assert.throws(()=>buildEthereumCommonCohortReport(priorChanged),/pre-existing comparison field/);
  const wrongOutcome=structuredClone(realInput);
  for(const report of [wrongOutcome.comparison,wrongOutcome.warmStart])report.cases[0].actual*=1.001;
  assert.throws(()=>buildEthereumCommonCohortReport(wrongOutcome),/source close/);
  const tampered=structuredClone(realInput);tampered.warmStart.cases[0].predictions.warmStartEth*=1.001;
  const report=buildEthereumCommonCohortReport(tampered);
  assert.equal(report.result.status,'incomplete');assert.equal(report.failures.length,1);
  assert.match(report.failures[0].reason,/Default median replay changed/);
  assert.deepEqual(report.cohorts.map(row=>row.caseKeys),realReport.cohorts.map(row=>row.caseKeys));
  assert.equal(report.panelMembership.filter(row=>row.unavailablePointKeys?.length).length,6);
  assert.equal(report.simulationPoints.length,realReport.simulationPoints.length-3);
});
