import test from 'node:test';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {buildEthereumAdaptiveCandidate} from '../dist/ethereum-adaptive-model.js';
import {buildEthereumPooledCandidate} from '../dist/ethereum-pooled-model.js';
import {buildEthereumWarmStartCandidate,ETH_WARM_START_POLICY} from '../dist/ethereum-warm-start-model.js';
import {ETH_INDEPENDENT_CALIBRATION_POLICY as policy,ETH_FUTURE_CALIBRATION_CONTRACT,
  calibrationOrderStatistic,selectEthereumCalibrationSplit,auditEthereumIndependentCalibration} from '../scripts/ethereum-independent-calibration-core.mjs';
import {buildEthereumIndependentCalibrationReport} from '../scripts/evaluate-ethereum-independent-calibration.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-11,a+' != '+b);
const options={asOf:'2028-01-01',model:'pooledEth',horizonDays:30};
function cases(n=16){
  return Array.from({length:n},(_,index)=>{
    const origin=dateFromDay(utcDay('2024-01-01')+index*31),point=100;
    return {origin,targetDate:dateFromDay(utcDay(origin)+30),horizonDays:30,status:'retrospective',
      anchorPrice:100,actual:100*Math.exp((index+1)/100),predictions:{pooledEth:point},
      simulatedIntervals:{pooledEth:{lower:90,upper:110,nominalPointwiseMass:.8}}};
  });
}
function controls(rows){return rows.map(row=>({origin:row.origin,targetDate:row.targetDate,horizonDays:row.horizonDays,
  status:'available',price:100,lower:80,upper:120,nominalPointwiseMass:.8}));}
const audit=rows=>auditEthereumIndependentCalibration(rows,{...options,gaussianControls:controls(rows)});

test('fixed twelve-case block precedes every tested origin and cannot share an outcome with the test block',()=>{
  const rows=cases(),result=audit(rows);
  assert.equal(result.status,'evaluated');assert.equal(result.calibration.rows.length,12);assert.equal(result.selectedTestCases,4);
  assert.deepEqual(result.split.calibrationOrigins,rows.slice(0,12).map(row=>row.origin));
  assert.deepEqual(result.split.testOrigins,rows.slice(12).map(row=>row.origin));
  assert.ok(result.split.testOrigins.every(origin=>origin>result.split.calibrationBoundary));
  assert.equal(result.calibration.orderStatistic.rank,11);close(result.calibration.logRadius,.11);
  assert.equal(result.noCalibrationTestReuse,true);assert.equal(result.untouchedHistoricalHoldout,false);
  assert.equal(result.independentMarketEvidence,false);assert.equal(result.prospectiveScoredTargets,0);
});

test('chronological nonoverlap is chosen independently in each phase and equality with the calibration boundary is excluded',()=>{
  const rows=cases(),boundary=rows[11].targetDate;
  const equal={...structuredClone(rows[12]),origin:boundary,targetDate:dateFromDay(utcDay(boundary)+30)};
  const overlapping={...structuredClone(rows[0]),origin:dateFromDay(utcDay(rows[0].origin)+1),targetDate:dateFromDay(utcDay(rows[0].targetDate)+1)};
  const result=audit([equal,...rows,overlapping]);
  assert.deepEqual(result.split.calibrationOrigins,rows.slice(0,12).map(row=>row.origin));
  assert.deepEqual(result.split.testOrigins,rows.slice(12).map(row=>row.origin));
  assert.deepEqual(result.split.equalBoundaryOriginsExcluded,[boundary]);
});

test('test-loss poisoning changes only scored outcomes, never calibration radius or membership',()=>{
  const rows=cases(),before=structuredClone(rows),expected=audit(rows),changed=structuredClone(rows);
  for(const row of changed.slice(12))row.actual=1e200;
  const actual=audit(changed);
  assert.deepEqual(actual.calibration,expected.calibration);assert.deepEqual(actual.split,expected.split);
  assert.notDeepEqual(actual.summaries,expected.summaries);assert.deepEqual(rows,before);
  assert.deepEqual(audit([...rows].reverse()),expected);
});

test('future and pending poison cannot enter either block',()=>{
  const rows=cases(),future={...structuredClone(rows[0]),origin:'2030-01-01',targetDate:'2030-01-31'};
  const before=audit([...rows,future]);future.actual=NaN;future.predictions.pooledEth=-1;future.simulatedIntervals.pooledEth.lower=Infinity;
  assert.deepEqual(audit([...rows,future]),before);
  const pending={...structuredClone(future),origin:'2027-01-01',targetDate:'2027-01-31',status:'pending'};
  assert.equal(audit([...rows,pending]).selectedTestCases,4);
});

test('selected missing calibration labels fail the unchanged block without replacement',()=>{
  const rows=cases(),expected=audit(rows);rows[3].actual=null;rows[3].status='missing-observation';
  const actual=audit(rows);
  assert.equal(actual.status,'incomplete');assert.equal(actual.calibration.logRadius,null);assert.equal(actual.summaries,null);
  assert.deepEqual(actual.split,expected.split);assert.equal(actual.calibration.rows[3].status,'missing-or-invalid-selected-outcome');
  assert.equal(actual.selectedTestCases,4);assert.equal(actual.completedTestCases,0);
});

test('selected missing test labels and controls cannot shrink the selected sample or produce an aggregate score',()=>{
  const rows=cases(),expected=audit(rows),missing=structuredClone(rows);missing[13].actual=null;
  const actual=audit(missing);
  assert.equal(actual.status,'incomplete');assert.equal(actual.summaries,null);assert.equal(actual.selectedTestCases,4);
  assert.equal(actual.completedTestCases,3);assert.deepEqual(actual.split,expected.split);
  const noControl=auditEthereumIndependentCalibration(rows,{...options,gaussianControls:controls(rows).slice(0,15)});
  assert.equal(noControl.status,'incomplete');assert.equal(noControl.selectedTestCases,4);assert.equal(noControl.completedTestCases,3);
  assert.deepEqual(noControl.split,expected.split);assert.match(noControl.failures[0].reason,/control is unavailable/);
});

test('finite sample order statistic never clamps an impossible rank and handles ties and zero residuals exactly',()=>{
  assert.deepEqual(calibrationOrderStatistic([1,2,3]),{n:3,rank:4,alpha:.2,status:'insufficient-rank',logRadius:null});
  assert.equal(calibrationOrderStatistic([]).status,'insufficient-rank');
  assert.equal(calibrationOrderStatistic(Array(12).fill(.3)).logRadius,.3);
  const rows=cases();for(const row of rows)row.actual=100;
  const result=audit(rows);assert.equal(result.calibration.logRadius,0);
  assert.ok(result.testRows.every(row=>row.bounds.calibrated.lower===100&&row.bounds.calibrated.upper===100));
  assert.equal(result.summaries.calibrated.empiricalCoverage,1);assert.equal(result.summaries.calibrated.meanLogIntervalScore,0);
  assert.throws(()=>calibrationOrderStatistic([NaN]),/Finite nonnegative/);
  assert.throws(()=>calibrationOrderStatistic([1],{alpha:0}),/valid alpha/);
});

test('insufficient calibration and absence of later tests remain distinct null evidence',()=>{
  const insufficient=audit(cases(11));assert.equal(insufficient.status,'insufficient-calibration-cases');
  assert.equal(insufficient.calibration.logRadius,null);assert.equal(insufficient.summaries,null);assert.equal(insufficient.selectedTestCases,0);
  const onlyBlock=audit(cases(12));assert.equal(onlyBlock.status,'no-later-matured-tests');
  assert.equal(onlyBlock.calibration.orderStatistic.rank,11);assert.equal(onlyBlock.summaries,null);
});

test('raw cached losses and old empirical intervals cannot determine radius, coverage or proper score',()=>{
  const rows=cases(),expected=audit(rows),poisoned=structuredClone(rows);
  for(const row of poisoned){row.intervals={pooledEth:{status:'experimental',logRadius:0,lower:1e-200,upper:1e200}};
    Object.assign(row.simulatedIntervals.pooledEth,{covered:true,logWidth:0,logIntervalScore:-1e100});}
  assert.deepEqual(audit(poisoned),expected);
  const one=expected.testRows[0],y=Math.log(one.actual),lo=Math.log(one.bounds.calibrated.lower),hi=Math.log(one.bounds.calibrated.upper);
  close(one.scores.calibrated.logIntervalScore,hi-lo+10*Math.max(0,lo-y)+10*Math.max(0,y-hi));
  assert.equal(expected.summaries.raw.n,4);assert.equal(expected.summaries.raw.oneCaseCoverageIncrement,.25);
  assert.equal(expected.summaries.raw.binomialConfidenceInterval,null);
});

test('duplicate cases, invalid target clocks, mixed nominal mass and unknown candidate identity are rejected',()=>{
  const rows=cases();assert.throws(()=>audit([...rows,rows[0]]),/Duplicate/);
  const clock=structuredClone(rows);clock[0].targetDate='2024-02-01';assert.throws(()=>audit(clock),/target clock/);
  const mass=structuredClone(rows);mass[0].simulatedIntervals.pooledEth.nominalPointwiseMass=.9;assert.throws(()=>audit(mass),/same nominal/);
  assert.throws(()=>selectEthereumCalibrationSplit(rows,{...options,model:'adaptive'}),/exact declared model/);
  assert.throws(()=>selectEthereumCalibrationSplit(rows,{...options,horizonDays:365}),/exact declared model/);
  const duplicateControl=controls(rows);duplicateControl.push(duplicateControl[0]);
  assert.throws(()=>auditEthereumIndependentCalibration(rows,{...options,gaussianControls:duplicateControl}),/Duplicate Gaussian/);
});

test('candidate-specific residuals cannot borrow the available pooled calibration block',()=>{
  const rows=cases();
  for(const row of rows.slice(8)){
    row.predictions.warmStartEth=100;row.simulatedIntervals.warmStartEth={lower:90,upper:110,nominalPointwiseMass:.8};
  }
  const warm=auditEthereumIndependentCalibration(rows,{...options,model:'warmStartEth',gaussianControls:controls(rows)});
  assert.equal(warm.status,'insufficient-calibration-cases');assert.equal(warm.calibration.rows.length,8);
  assert.equal(warm.split.modelVersion,policy.modelVersions.warmStartEth);assert.equal(warm.summaries,null);
  assert.equal(audit(rows).status,'evaluated');
});

test('calibrated interval overflow and underflow are explicit incomplete outcomes without clipping or sample replacement',()=>{
  const rows=cases();for(const row of rows.slice(0,12))row.actual=100*Math.exp(10);
  for(const row of rows.slice(12)){
    row.predictions.pooledEth=1e308;row.simulatedIntervals.pooledEth={lower:9e307,upper:1.1e308,nominalPointwiseMass:.8};
  }
  const overflow=audit(rows);assert.equal(overflow.status,'incomplete');assert.equal(overflow.selectedTestCases,4);
  assert.ok(overflow.failures.every(row=>/finite positive range/.test(row.reason)));assert.equal(overflow.summaries,null);
  for(const row of rows.slice(12)){
    row.predictions.pooledEth=1e-320;row.simulatedIntervals.pooledEth={lower:5e-321,upper:2e-320,nominalPointwiseMass:.8};
  }
  assert.equal(audit(rows).status,'incomplete');
});

function sourceFixture(){
  const first=utcDay('2021-01-01');let log=7;
  const ethHistory=Array.from({length:1620},(_,index)=>{
    if(index)log+=(index%260<160?.013:-.020)+.012*Math.sin(index*.41);
    return {date:dateFromDay(first+index),price:Math.exp(log)};
  });
  const index=1400,origin=ethHistory[index].date,asOf=ethHistory[index+180].date;
  const candidates={adaptiveEth:buildEthereumAdaptiveCandidate({ethRows:ethHistory,asOf:origin}),
    pooledEth:buildEthereumPooledCandidate({ethRows:ethHistory,asOf:origin}),
    warmStartEth:buildEthereumWarmStartCandidate({ethRows:ethHistory,asOf:origin})};
  const original=policy.horizons.map(horizonDays=>{
    const predictions={},simulatedIntervals={};
    for(const model of ['adaptiveEth','pooledEth']){
      const p=candidates[model].predictions.find(row=>row.horizonDays===horizonDays);
      predictions[model]=p.price;simulatedIntervals[model]={lower:p.simulatedLower,upper:p.simulatedUpper,nominalPointwiseMass:.8};
    }
    return {origin,targetDate:dateFromDay(utcDay(origin)+horizonDays),horizonDays,status:'retrospective',anchorPrice:ethHistory[index].price,
      actual:ethHistory[index+horizonDays].price,predictions,simulatedIntervals};
  });
  const cases=original.map(row=>{
    const p=candidates.warmStartEth.predictions.find(value=>value.horizonDays===row.horizonDays);
    return {...row,predictions:{...row.predictions,warmStartEth:p.price},simulatedIntervals:{...row.simulatedIntervals,
      warmStartEth:{lower:p.simulatedLower,upper:p.simulatedUpper,nominalPointwiseMass:.8}}};
  });
  return {ethHistory,comparison:{kind:'ethereum-candidate-comparison',asOf,cases:original},
    warmStart:{kind:'ethereum-warm-start-research',asOf,policy:ETH_WARM_START_POLICY,cases}};
}
const withoutRuntime=({runtime,...rest})=>rest;
let sourceInput,sourceReport;

test('actual model source replay binds each exact candidate version, fixed seed and target without mutating inputs',()=>{
  sourceInput=sourceFixture();const before=structuredClone(sourceInput);
  sourceReport=buildEthereumIndependentCalibrationReport(sourceInput);
  assert.equal(sourceReport.replay.length,9);assert.ok(sourceReport.replay.every(row=>row.medianExact&&row.intervalExact&&row.outcomeExact));
  assert.equal(sourceReport.runtime.candidateOriginReplays,3);assert.equal(sourceReport.runtime.gaussianOriginFits,1);
  assert.ok(sourceReport.results.every(row=>row.status==='insufficient-calibration-cases'));
  assert.deepEqual(sourceInput,before);assert.equal(sourceReport.actualCalibratedRecordsIssued,0);
  const poisoned=structuredClone(sourceInput);for(const row of poisoned.ethHistory)if(row.date>sourceReport.asOf)row.price=NaN;
  assert.deepEqual(withoutRuntime(buildEthereumIndependentCalibrationReport(poisoned)),withoutRuntime(sourceReport));
});

test('altered report predictions, source actuals, model version and duplicate identities fail replay',()=>{
  const prior=structuredClone(sourceInput);prior.warmStart.cases[0].predictions.pooledEth*=1.0001;
  assert.throws(()=>buildEthereumIndependentCalibrationReport(prior),/original comparison field/);
  const wrong=structuredClone(sourceInput);wrong.warmStart.cases[0].predictions.warmStartEth*=1.0001;
  assert.throws(()=>buildEthereumIndependentCalibrationReport(wrong));
  const outcome=structuredClone(sourceInput);for(const report of [outcome.comparison,outcome.warmStart])report.cases[0].actual*=1.001;
  assert.throws(()=>buildEthereumIndependentCalibrationReport(outcome),/source close/);
  const version=structuredClone(sourceInput);version.warmStart.policy.version='other';
  assert.throws(()=>buildEthereumIndependentCalibrationReport(version),/separately versioned/);
  const duplicate=structuredClone(sourceInput);duplicate.warmStart.cases[1]=structuredClone(duplicate.warmStart.cases[0]);
  assert.throws(()=>buildEthereumIndependentCalibrationReport(duplicate),/Duplicate warm-start/);
  const clock=structuredClone(sourceInput);
  for(const report of [clock.comparison,clock.warmStart])report.cases[0].informationCutoffAt='2099-01-01T00:00:00.000Z';
  assert.throws(()=>buildEthereumIndependentCalibrationReport(clock),/information cutoff/);
});

test('future contract requires separate immutable issued records and does not confer prospective status on retrospective errors',()=>{
  assert.equal(ETH_FUTURE_CALIBRATION_CONTRACT.minimumCalibrationCases,12);
  assert.ok(ETH_FUTURE_CALIBRATION_CONTRACT.requiredBinding.includes('model.sourceHash'));
  assert.ok(ETH_FUTURE_CALIBRATION_CONTRACT.requiredBinding.includes('horizonDays'));
  assert.equal(ETH_FUTURE_CALIBRATION_CONTRACT.existingRecordsMayBeRewritten,false);
  assert.equal(ETH_FUTURE_CALIBRATION_CONTRACT.currentRetrospectiveResidualsAreProspectiveEvidence,false);
  assert.equal(ETH_FUTURE_CALIBRATION_CONTRACT.actualCalibratedRecordsIssued,0);
  assert.equal(policy.calibrationRefittedAfterTest,false);assert.equal(policy.policyPreregistered,false);
});
