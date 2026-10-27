import {utcDay} from '../dist/cycle-engine.js';
import {ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {ETH_POOLED_POLICY} from '../dist/ethereum-pooled-model.js';
import {ETH_WARM_START_POLICY} from '../dist/ethereum-warm-start-model.js';

/** A new audit, not a change to any issued forecast or its calibration status.
 * Chronological separation is testable here. Historical preregistration,
 * exchangeability and independent market regimes are deliberately not claimed. */
export const ETH_INDEPENDENT_CALIBRATION_POLICY=Object.freeze({
  version:'eth-chronological-calibration-audit-1',horizons:Object.freeze([30,90,180]),
  models:Object.freeze(['adaptiveEth','pooledEth','warmStartEth']),
  modelVersions:Object.freeze({adaptiveEth:ETH_ADAPTIVE_POLICY.version,pooledEth:ETH_POOLED_POLICY.version,warmStartEth:ETH_WARM_START_POLICY.version}),
  alpha:.2,nominalPointwiseMass:.8,minimumCalibrationCases:12,fixedCalibrationCases:12,
  seed:20261027,sampleCount:256,maximumInputCases:3000,
  calibrationSelection:'First 12 chronologically nonoverlapping mature forecast windows; selected missing labels fail the block without replacement',
  testSelection:'Later chronologically nonoverlapping mature forecast windows; origin strictly later than the final calibration target date',
  scoreSelection:false,calibrationRefittedAfterTest:false,policyPreregistered:false,
  historicalVintagesVerified:false,coverageGuarantee:false,independentSampleSize:null,
});
const P=ETH_INDEPENDENT_CALIBRATION_POLICY,positive=x=>Number.isFinite(x)&&x>0;
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x/xs.length,0):null;
const identity=row=>row.origin+'|'+row.horizonDays;
const closeAt=date=>new Date((utcDay(date)+1)*86400000).toISOString();

function bandChecked(value,point){
  if(!value||!positive(point)||!positive(value.lower)||!positive(value.upper)||value.lower>point||point>value.upper)
    throw new RangeError('Finite positive ordered candidate median and bounds required');
  if(value.nominalPointwiseMass!==P.nominalPointwiseMass)throw new RangeError('Calibration audit requires the same nominal interval mass');
  return {price:point,lower:value.lower,upper:value.upper};
}

/** Frozen order statistic; ties are kept, zero residuals yield radius zero.
 * A finite-sample rank beyond n is unavailable, never clamped to the maximum. */
export function calibrationOrderStatistic(errors,{alpha=P.alpha}={}){
  if(!Array.isArray(errors)||errors.length>P.maximumInputCases||errors.some(x=>!Number.isFinite(x)||x<0)||
    !Number.isFinite(alpha)||alpha<=0||alpha>=1)throw new RangeError('Finite nonnegative errors and a valid alpha are required');
  const n=errors.length,rank=Math.ceil((n+1)*(1-alpha));
  return {n,rank,alpha,status:n&&rank<=n?'available':'insufficient-rank',
    logRadius:n&&rank<=n?[...errors].sort((a,b)=>a-b)[rank-1]:null};
}

function disjoint(rows){
  let boundary=-Infinity;
  return rows.filter(row=>{
    if(utcDay(row.origin)<boundary)return false;
    boundary=utcDay(row.targetDate);return true;
  });
}

/** The split uses clocks and forecast availability only. Actual values, cached
 * losses and control availability cannot change either selected origin set. */
export function selectEthereumCalibrationSplit(cases,{asOf,model,horizonDays}={}){
  utcDay(asOf);
  if(!P.models.includes(model)||!P.horizons.includes(horizonDays))throw new RangeError('An exact declared model and horizon are required');
  if(!Array.isArray(cases)||cases.length>P.maximumInputCases)throw new RangeError('Bounded calibration cases required');
  const seen=new Set(),eligible=[],excluded=[];
  for(const row of cases){
    if(row?.horizonDays!==horizonDays)continue;
    utcDay(row.origin);utcDay(row.targetDate);
    if(utcDay(row.targetDate)-utcDay(row.origin)!==horizonDays)throw new RangeError('Calibration target clock mismatch');
    if(seen.has(row.origin))throw new RangeError('Duplicate calibration origin/horizon');
    seen.add(row.origin);
    // Values from future or explicitly pending rows are never inspected.
    if(row.origin>asOf||row.targetDate>asOf||row.status==='pending'){
      excluded.push({caseKey:identity(row),reason:'not-matured'});continue;
    }
    if(row.predictions?.[model]==null||row.simulatedIntervals?.[model]==null){
      excluded.push({caseKey:identity(row),reason:'candidate-unavailable'});continue;
    }
    bandChecked(row.simulatedIntervals[model],row.predictions[model]);
    eligible.push(row);
  }
  eligible.sort((a,b)=>a.origin.localeCompare(b.origin));
  const allDisjoint=disjoint(eligible),calibration=allDisjoint.slice(0,P.fixedCalibrationCases);
  const complete=calibration.length===P.fixedCalibrationCases;
  const boundary=complete?calibration.at(-1).targetDate:null;
  const later=complete?eligible.filter(row=>row.origin>boundary):[];
  const test=disjoint(later);
  return {model,modelVersion:P.modelVersions[model],horizonDays,asOf,
    eligibleForecastWindows:eligible.length,disjointForecastWindows:allDisjoint.length,
    calibrationRequired:P.fixedCalibrationCases,calibrationCases:calibration.length,
    calibrationCaseKeys:calibration.map(identity),calibrationOrigins:calibration.map(row=>row.origin),
    calibrationTargetDates:calibration.map(row=>row.targetDate),calibrationBoundary:boundary,
    calibrationObservationEndAt:boundary?closeAt(boundary):null,
    testCandidateWindows:later.length,testCases:test.length,testCaseKeys:test.map(identity),
    testOrigins:test.map(row=>row.origin),testTargetDates:test.map(row=>row.targetDate),
    equalBoundaryOriginsExcluded:complete?eligible.filter(row=>row.origin===boundary).map(row=>row.origin):[],
    excluded,
    status:complete?(test.length?'partitioned':'no-later-matured-tests'):'insufficient-calibration-cases',
    independentSampleSize:null,historicalOutcomeAvailabilityProven:false};
}

function score(band,actual){
  if(!positive(actual))throw new RangeError('A completed finite positive actual close is required');
  const lo=Math.log(band.lower),hi=Math.log(band.upper),y=Math.log(actual);
  return {covered:actual>=band.lower&&actual<=band.upper,logWidth:hi-lo,
    logIntervalScore:hi-lo+2/P.alpha*Math.max(0,lo-y)+2/P.alpha*Math.max(0,y-hi),
    absoluteLogError:Math.abs(Math.log(band.price)-y)};
}
function summary(rows,kind){
  const values=rows.map(row=>row.scores[kind]),n=values.length,covered=values.filter(row=>row.covered).length;
  return {n,covered,missed:n-covered,empiricalCoverage:n?covered/n:null,
    oneCaseCoverageIncrement:n?1/n:null,meanLogWidth:mean(values.map(row=>row.logWidth)),
    meanLogIntervalScore:mean(values.map(row=>row.logIntervalScore)),
    meanAbsoluteLogError:mean(values.map(row=>row.absoluteLogError)),
    binomialConfidenceInterval:null,independentSampleSize:null,coverageGuarantee:false};
}

/** Evaluate the already frozen split. Missing/invalid selected observations,
 * failed controls or out-of-range calibrated bounds keep all slots and make
 * the result incomplete. None can improve scores by shrinking the test set. */
export function auditEthereumIndependentCalibration(cases,{asOf,model,horizonDays,gaussianControls=[]}={}){
  const split=selectEthereumCalibrationSplit(cases,{asOf,model,horizonDays});
  const byKey=new Map(cases.filter(row=>row.horizonDays===horizonDays).map(row=>[identity(row),row]));
  const controls=new Map();
  for(const row of gaussianControls){
    if(row.horizonDays!==horizonDays)continue;
    const key=identity(row);if(controls.has(key))throw new RangeError('Duplicate Gaussian control origin/horizon');controls.set(key,row);
  }
  const calibrationRows=split.calibrationCaseKeys.map(key=>{
    const row=byKey.get(key),actual=positive(row.actual)?row.actual:null,predicted=row.predictions[model];
    return {caseKey:key,origin:row.origin,targetDate:row.targetDate,predicted,actual,
      status:actual===null?'missing-or-invalid-selected-outcome':'available',
      absoluteLogError:actual===null?null:Math.abs(Math.log(predicted)-Math.log(actual))};
  });
  const failedCalibration=calibrationRows.filter(row=>row.status!=='available');
  const orderStatistic=split.calibrationCases===P.fixedCalibrationCases&&!failedCalibration.length?
    calibrationOrderStatistic(calibrationRows.map(row=>row.absoluteLogError)):null;
  const radius=orderStatistic?.logRadius??null,failures=failedCalibration.map(row=>({caseKey:row.caseKey,stage:'calibration',reason:row.status})),testRows=[];
  for(const key of split.testCaseKeys){
    const row=byKey.get(key),base={caseKey:key,origin:row.origin,targetDate:row.targetDate,horizonDays,actual:positive(row.actual)?row.actual:null};
    if(radius===null){testRows.push({...base,status:'calibration-unavailable',scores:null});continue;}
    try{
      if(!(row.origin>split.calibrationBoundary))throw new RangeError('Calibration target must mature strictly before test origin');
      const raw=bandChecked(row.simulatedIntervals[model],row.predictions[model]);
      const center=Math.log(raw.price),lower=radius===0?raw.price:Math.exp(center-radius),upper=radius===0?raw.price:Math.exp(center+radius);
      if(!positive(lower)||!positive(upper)||lower>raw.price||upper<raw.price)throw new RangeError('Frozen calibration endpoints exceed finite positive range; no clipping');
      const calibrated={price:raw.price,lower,upper},control=controls.get(key);
      if(!control||control.status!=='available'||control.targetDate!==row.targetDate)throw new RangeError('Selected Gaussian control is unavailable or has a different target');
      const gaussian=bandChecked(control,control.price);
      testRows.push({...base,status:'scored',bounds:{raw,calibrated,gaussian},
        scores:{raw:score(raw,row.actual),calibrated:score(calibrated,row.actual),gaussian:score(gaussian,row.actual)}});
    }catch(error){
      failures.push({caseKey:key,stage:'test',reason:error.message});testRows.push({...base,status:'incomplete',reason:error.message,scores:null});
    }
  }
  const completed=testRows.filter(row=>row.status==='scored');
  const status=split.status==='insufficient-calibration-cases'?split.status:failures.length?'incomplete':
    radius===null?'insufficient-calibration-rank':!split.testCases?'no-later-matured-tests':'evaluated';
  const summaries=status==='evaluated'?Object.fromEntries(['raw','calibrated','gaussian'].map(kind=>[kind,summary(completed,kind)])):null;
  const against=(left,right)=>summaries?.[right].meanLogIntervalScore>0?1-summaries[left].meanLogIntervalScore/summaries[right].meanLogIntervalScore:null;
  return {split,status,calibration:{rows:calibrationRows,orderStatistic,logRadius:radius,refittedAfterTest:false},
    testRows,failures,selectedTestCases:split.testCases,completedTestCases:completed.length,summaries,
    pairedIntervalSkill:{calibratedAgainstRaw:against('calibrated','raw'),calibratedAgainstGaussian:against('calibrated','gaussian'),rawAgainstGaussian:against('raw','gaussian')},
    noCalibrationTestReuse:true,noFutureOutcomeInCalibration:true,chronologicallySeparated:true,
    untouchedHistoricalHoldout:false,independentMarketEvidence:false,historicalVintagesVerified:false,
    prospectiveScoredTargets:0,calibratedForProduction:false,productionPromoted:false};
}

export const ETH_FUTURE_CALIBRATION_CONTRACT=Object.freeze({
  version:'eth-future-frozen-calibration-contract-1',status:'not-issued',minimumCalibrationCases:12,
  requiredBinding:Object.freeze(['modelKey','model.version','model.sourceHash','options.seed','options.sampleCount','horizonDays']),
  requiredLabels:'Same-bound issued prospective records with preserved completed target observations actually collected before the new information cutoff',
  calibrationRule:'First 12 chronologically nonoverlapping qualifying records; retain each original record ID, observation ID and exact residual; freeze the rank and radius',
  issueRule:'Issue a separately versioned calibrated forecast only after that block is fixed; preserve the unmodified raw forecast and its original record, and explicitly reference its model.sourceHash separately from the new calibration wrapper hash',
  evaluationRule:'Only later issued origins strictly after the final calibration target; preserve all selected missing and failed outcomes without substitution',
  retuningRule:'A changed seed, source graph, radius selection or calibration policy starts a different experiment and cannot inherit held-out scores',
  existingRecordsMayBeRewritten:false,currentRetrospectiveResidualsAreProspectiveEvidence:false,
  actualCalibratedRecordsIssued:0,coverageGuarantee:false,productionPromoted:false,
});
