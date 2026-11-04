import {calibrateCycleTiming,CYCLE_CALIBRATION_VERSION} from './cycle-calibration.js';
import {shiftCalendarMonths} from './cycle-timing.js';
import {HALVINGS,utcDay,dateFromDay,validateDataset} from './cycle-engine.js';

const KIND='atlas-cycle-clock-backtest';
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const shift=(date,days)=>dateFromDay(utcDay(date)+days);
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

/** Every target gets one vote, after averaging absolute errors at its distinct origins. */
export function groupClockTargets(records){
  if(!Array.isArray(records)||records.length>600)throw new TypeError('Bounded clock records required');
  const groups=new Map();
  for(const row of records){
    if(!['peak','trough'].includes(row.type)||typeof row.cycleId!=='string'||!row.cycleId||row.targetId!==row.cycleId+':'+row.type||row.trainingThrough!==row.origin)throw new TypeError('Invalid clock target identity or cutoff');
    for(const key of ['origin','referencePeakDate','baselineDate','adjustedDate','targetDate','targetKnownAt'])utcDay(row[key]);
    const nominalPeak=shiftCalendarMonths(row.referencePeakDate,48),baseline=row.type==='peak'?nominalPeak:shiftCalendarMonths(nominalPeak,12);
    if(row.origin>=row.targetDate||row.baselineDate<=row.origin||row.adjustedDate<=row.origin||row.referencePeakDate>row.origin||row.targetKnownAt<row.targetDate||!Number.isSafeInteger(row.appliedShiftDays)||Math.abs(row.appliedShiftDays)>180||row.baselineDate!==baseline||row.adjustedDate!==shift(baseline,row.appliedShiftDays)||row.baselineErrorDays!==utcDay(row.baselineDate)-utcDay(row.targetDate)||row.adjustedErrorDays!==utcDay(row.adjustedDate)-utcDay(row.targetDate))throw new RangeError('Clock date/error provenance mismatch');
    let group=groups.get(row.targetId);
    if(!group){group={targetId:row.targetId,cycleId:row.cycleId,cycleYear:row.cycleYear,type:row.type,targetDate:row.targetDate,targetKnownAt:row.targetKnownAt,origins:new Map()};groups.set(row.targetId,group);}
    if(group.cycleYear!==row.cycleYear||group.targetDate!==row.targetDate||group.targetKnownAt!==row.targetKnownAt)throw new Error('Conflicting actual outcome for the same clock target');
    const prior=group.origins.get(row.origin);
    if(prior&&JSON.stringify(prior)!==JSON.stringify(row))throw new Error('Conflicting prediction at the same target and origin');
    group.origins.set(row.origin,row);
  }
  return [...groups.values()].sort((a,b)=>a.cycleYear-b.cycleYear||a.type.localeCompare(b.type)).map(group=>{
    const origins=[...group.origins.values()].sort((a,b)=>a.origin.localeCompare(b.origin));
    const baselineMaeDays=mean(origins.map(r=>Math.abs(r.baselineErrorDays))),adjustedMaeDays=mean(origins.map(r=>Math.abs(r.adjustedErrorDays)));
    return {...group,origins,originCount:origins.length,baselineMaeDays,adjustedMaeDays,improvementDays:baselineMaeDays-adjustedMaeDays};
  });
}

export function summarizeClockTargets(targets){
  return ['peak','trough'].map(type=>{
    const selected=targets.filter(t=>t.type===type),baselineMaeDays=mean(selected.map(t=>t.baselineMaeDays)),adjustedMaeDays=mean(selected.map(t=>t.adjustedMaeDays));
    return {type,uniqueTargetCount:selected.length,uniqueCycleCount:new Set(selected.map(t=>t.cycleId)).size,
      originCount:new Set(selected.flatMap(t=>t.origins.map(r=>r.origin))).size,baselineMaeDays,adjustedMaeDays,
      improvementDays:selected.length?baselineMaeDays-adjustedMaeDays:null,targetWeight:'equal-after-mean-absolute-origin-errors',
      sufficientForPredictiveSuperiorityClaim:false};
  });
}

/** Fixed UTC quarter ends, independent of extrema, availability or audit scores. */
export function quarterlyClockOrigins(firstDate,asOf){
  utcDay(firstDate);utcDay(asOf);const dates=[];
  for(let year=Number(firstDate.slice(0,4));year<=Number(asOf.slice(0,4));year++)for(const suffix of ['03-31','06-30','09-30','12-31']){
    const date=String(year).padStart(4,'0')+'-'+suffix;if(date>=firstDate&&date<=asOf)dates.push(date);
  }
  if(dates.length>300)throw new RangeError('At most 300 fixed clock origins required');return dates;
}

function destination(origin){
  const index=HALVINGS.findLastIndex(h=>h.date<=origin),next=HALVINGS[index+1];
  return {originEraIndex:index,targetCycleId:next?'halving-'+next.year:'after-halving-'+HALVINGS.at(-1).year};
}

/** This snapshot uses only prices at or before the requested origin. */
function originSnapshot(rows,origin){
  const availableRows=rows.filter(([date])=>date<=origin);
  if(!availableRows.length)return {origin,trainingThrough:null,referencePeakDate:null,referenceCountAtOrigin:0,referenceKnownAts:[],peakConfirmedAt:null,troughConfirmedAt:null,baselinePeak:null,baselineTrough:null,adjustedPeak:null,adjustedTrough:null,appliedShiftDays:null,calibrationAvailable:false,calibrationReason:'origin-before-history'};
  const model=calibrateCycleTiming(availableRows),c=model.current,exact=c.asOf===origin;
  const baselinePeak=exact?c.nominalPeakDate:null,baselineTrough=baselinePeak?shiftCalendarMonths(baselinePeak,12):null;
  const calibrationAvailable=exact&&c.available;
  return {origin,trainingThrough:c.asOf,referencePeakDate:exact?c.referencePeakDate:null,referenceCountAtOrigin:c.referenceCount,
    referenceKnownAts:model.closedReferences.map(r=>r.knownAt),peakConfirmedAt:exact?c.peakConfirmedAt:null,troughConfirmedAt:exact?c.troughConfirmedAt:null,
    baselinePeak,baselineTrough,adjustedPeak:calibrationAvailable?c.expectedNextPeakDate:null,
    adjustedTrough:calibrationAvailable?shift(baselineTrough,c.appliedShiftDays):null,appliedShiftDays:calibrationAvailable?c.appliedShiftDays:null,
    calibrationAvailable,calibrationReason:!exact?'origin-close-missing':c.unavailableReason};
}

function coverageFor(catalog,assessments,baselineRecords,records){
  const historicalTargets=catalog.map(target=>{
    const origins=assessments.filter(a=>a.targetCycleId===target.cycleId),baseline=baselineRecords.filter(r=>r.targetId===target.targetId),paired=records.filter(r=>r.targetId===target.targetId);
    return {...target,originCount:origins.length,baselineOriginCount:baseline.length,pairedOriginCount:paired.length,
      insufficientOriginCount:origins.filter(r=>!r.calibrationAvailable).length,
      baselineMaeDays:mean(baseline.map(r=>Math.abs(r.baselineErrorDays))),
      pairedBaselineMaeDays:mean(paired.map(r=>Math.abs(r.baselineErrorDays))),adjustedMaeDays:mean(paired.map(r=>Math.abs(r.adjustedErrorDays))),origins};
  });
  const baselineSummary=['peak','trough'].map(type=>{
    const selected=historicalTargets.filter(t=>t.type===type&&t.baselineOriginCount);
    return {type,uniqueTargetCount:selected.length,uniqueCycleCount:new Set(selected.map(t=>t.cycleId)).size,
      originCount:new Set(selected.flatMap(t=>t.origins.filter(a=>a.status==='paired'||a.status==='baseline-only').map(a=>a.origin))).size,
      baselineMaeDays:mean(selected.map(t=>t.baselineMaeDays)),targetWeight:'equal-after-mean-absolute-origin-errors'};
  });
  const coverageStats={historicalCycleCount:new Set(catalog.map(t=>t.cycleId)).size,
    baselineCycleCount:new Set(baselineRecords.map(r=>r.cycleId)).size,pairedCycleCount:new Set(records.map(r=>r.cycleId)).size,
    pairedOrigins:assessments.filter(a=>a.status==='paired').length,baselineOnlyOrigins:assessments.filter(a=>a.status==='baseline-only').length,
    unavailableOrigins:assessments.filter(a=>a.status==='unavailable').length,pendingOrigins:assessments.filter(a=>a.status==='pending').length,
    invalidOrigins:assessments.filter(a=>a.status==='invalid').length,
    insufficientOrigins:assessments.filter(a=>!a.calibrationAvailable).length};
  return {historicalTargets,baselineSummary,coverageStats};
}

export function buildCycleClockBacktest(input,{asOf,origins,inputHash=null}={}){
  const raw=Array.isArray(input)?input:input?.prices;
  if(!Array.isArray(raw)||!raw.length||raw.length>100000)throw new TypeError('A bounded observed daily series is required');
  const cutoff=asOf??(Array.isArray(raw.at(-1))?raw.at(-1)[0]:raw.at(-1).date);utcDay(cutoff);
  const rows=validateDataset(raw.filter(r=>(Array.isArray(r)?r[0]:r.date)<=cutoff)).map(r=>[r.date,r.price]);
  if(rows.at(-1)?.[0]!==cutoff)throw new RangeError('The clock evaluation cutoff needs an actual completed close');
  if(origins!==undefined&&(!Array.isArray(origins)||origins.length>300))throw new TypeError('At most 300 fixed clock origins required');
  const supplied=origins??quarterlyClockOrigins(rows[0][0],cutoff);supplied.forEach(utcDay);
  const requested=[...new Set(supplied)].sort(),duplicateOriginsRemoved=supplied.length-requested.length;
  const complete=calibrateCycleTiming(rows,{asOf:cutoff}),records=[],baselineRecords=[],assessments=[],excluded=[];
  const catalog=complete.closedReferences.flatMap(t=>['peak','trough'].map(type=>({targetId:'halving-'+t.year+':'+type,cycleId:'halving-'+t.year,cycleYear:t.year,type,targetDate:t[type].date,targetKnownAt:t.knownAt})));
  for(const origin of requested){
    const a=originSnapshot(rows,origin),d=destination(origin),target=complete.closedReferences.find(t=>'halving-'+t.year===d.targetCycleId);
    let reason=origin>cutoff?'origin-not-observed':a.trainingThrough===null?'origin-before-history':a.trainingThrough!==origin?'origin-close-missing':null;
    if(!reason&&a.calibrationReason==='incomplete-current-era')reason='incomplete-current-era';
    const outcomeClosed=Boolean(target),nextBoundary=HALVINGS[d.originEraIndex+2];
    const outcomeReason=outcomeClosed?null:nextBoundary&&nextBoundary.date<=cutoff?'outcome-reference-unavailable':'next-era-outcome-not-closed';
    const futureClock=a.baselinePeak&&a.baselinePeak>origin&&(!a.calibrationAvailable||a.adjustedPeak>origin);
    if(!reason&&!futureClock&&a.baselinePeak)reason='clock-not-in-future';
    const valid=!reason,canBaseline=valid&&outcomeClosed&&Boolean(a.baselinePeak),canPair=canBaseline&&a.calibrationAvailable;
    const status=!valid?'invalid':!outcomeClosed?'pending':canPair?'paired':canBaseline?'baseline-only':'unavailable';
    if(!reason)reason=!a.calibrationAvailable?'timing-unavailable-at-origin':!outcomeClosed?outcomeReason:null;
    const assessment={...a,...d,targetCycleId:d.targetCycleId,outcomeClosed,outcomeReason,status,reason};assessments.push(assessment);
    if(!canPair)excluded.push(assessment);
    if(!canBaseline)continue;
    for(const type of ['peak','trough']){
      const baselineDate=type==='peak'?a.baselinePeak:a.baselineTrough,targetDate=target[type].date;
      if(targetDate<=origin)throw new RangeError('The actual target precedes its forecast origin');
      const row={targetId:'halving-'+target.year+':'+type,cycleId:'halving-'+target.year,cycleYear:target.year,type,origin,trainingThrough:a.trainingThrough,
        referencePeakDate:a.referencePeakDate,baselineDate,targetDate,targetKnownAt:target.knownAt,referenceCountAtOrigin:a.referenceCountAtOrigin,
        baselineErrorDays:utcDay(baselineDate)-utcDay(targetDate)};
      baselineRecords.push(row);
      if(canPair){const adjustedDate=type==='peak'?a.adjustedPeak:a.adjustedTrough;records.push({...row,adjustedDate,appliedShiftDays:a.appliedShiftDays,adjustedErrorDays:utcDay(adjustedDate)-utcDay(targetDate)});}
    }
  }
  const targets=groupClockTargets(records),summary=summarizeClockTargets(targets),current=complete.current;
  const baselinePeak=current.nominalPeakDate,baselineTrough=baselinePeak?shiftCalendarMonths(baselinePeak,12):null;
  const result={version:2,kind:KIND,modelVersion:CYCLE_CALIBRATION_VERSION,asOf:cutoff,inputHash,observationCount:rows.length,firstObservation:rows[0][0],
    records,baselineRecords,targets,summary,originAssessments:assessments,closedTargetCatalog:catalog,...coverageFor(catalog,assessments,baselineRecords,records),
    excluded,duplicateOriginsRemoved,scoredOriginCount:new Set(records.map(r=>r.origin)).size,requestedOriginCount:requested.length,
    uniqueCycleCount:new Set(targets.map(t=>t.cycleId)).size,
    currentClock:{asOf:cutoff,available:current.available,referencePeakDate:current.referencePeakDate,baselinePeak,baselineTrough,
      adjustedPeak:current.available?current.expectedNextPeakDate:null,adjustedTrough:current.available?shift(baselineTrough,current.appliedShiftDays):null,
      appliedShiftDays:current.available?current.appliedShiftDays:null,unavailableReason:current.unavailableReason},
    policy:{originSelection:origins===undefined?'Every completed UTC quarter end from the first observed price through the evaluation cutoff; no selection by future peaks, availability or audit scores':'Explicit origins supplied; no selection by audit scores',
      targetSelection:'Next closed halving era’s last running high with persistent deep drawdown. Pre-first-halving origins are coverage only: no reference clock is invented.',
      grouping:'Distinct halving-era target and turn type; average absolute errors at distinct origins, then equal target weight',
      pairedComparison:'Only identical origins with an available causal correction enter both sides of the correction comparison. Broader baseline-only results are separate.',
      lowRule:'Unadjusted peak +12 calendar months, then the same integer day shift as the peak',
      meaning:'current-rule-retrospective-clock-audit-not-contemporaneously-issued',futureOutcomesUsedInPrediction:false,
      historicalVintageAvailable:false,settingsSelectedFromAuditScores:false,sufficientForPredictiveSuperiorityClaim:false,
      excludes:'Scenario arrival/dwell offsets, price-path extrema and renderer feasibility fallbacks are not this causal clock-rule audit'},settings:complete.settings};
  assertCycleClockBacktest(result,{asOf:cutoff,inputHash});return freeze(result);
}

export function assertCycleClockBacktest(result,{asOf=result?.asOf,inputHash=result?.inputHash}={}){
  if(result?.kind!==KIND||result.version!==2||result.modelVersion!==CYCLE_CALIBRATION_VERSION||result.asOf!==asOf||result.inputHash!==inputHash||inputHash!==null&&!/^[a-f0-9]{64}$/.test(inputHash)||result.policy?.futureOutcomesUsedInPrediction!==false||result.policy?.historicalVintageAvailable!==false||result.policy?.settingsSelectedFromAuditScores!==false||result.policy?.sufficientForPredictiveSuperiorityClaim!==false)throw new TypeError('Invalid clock result identity, cutoff or scoring policy');
  utcDay(result.asOf);
  const targets=groupClockTargets(result.records),summary=summarizeClockTargets(targets);
  if(JSON.stringify(targets)!==JSON.stringify(result.targets)||JSON.stringify(summary)!==JSON.stringify(result.summary)||result.uniqueCycleCount!==new Set(targets.map(t=>t.cycleId)).size||result.scoredOriginCount!==new Set(result.records.map(r=>r.origin)).size)throw new Error('Clock target grouping or summary was changed');
  if(!Array.isArray(result.excluded)||result.excluded.length>300||new Set(result.excluded.map(r=>r.origin)).size!==result.excluded.length||result.excluded.some(e=>result.records.some(r=>r.origin===e.origin)))throw new TypeError('Invalid excluded origin coverage');
  result.excluded.forEach(r=>utcDay(r.origin));
  if(result.requestedOriginCount!==new Set([...result.records.map(r=>r.origin),...result.excluded.map(r=>r.origin)]).size||result.records.some(r=>r.targetKnownAt>asOf||r.targetDate>asOf||r.origin>asOf))throw new RangeError('Unclosed or future target cannot be scored');
  for(const row of result.records)if(!result.records.some(r=>r.cycleId===row.cycleId&&r.origin===row.origin&&r.type!==row.type&&r.appliedShiftDays===row.appliedShiftDays&&r.referencePeakDate===row.referencePeakDate))throw new Error('Peak and low need the same origin clock');
  const assessments=result.originAssessments,catalog=result.closedTargetCatalog;
  if(!Array.isArray(assessments)||assessments.length>300||assessments.length!==result.requestedOriginCount||new Set(assessments.map(a=>a.origin)).size!==assessments.length)throw new Error('Invalid historical origin coverage');
  for(const a of assessments){
    utcDay(a.origin);if(typeof a.calibrationAvailable!=='boolean'||!Number.isSafeInteger(a.referenceCountAtOrigin))throw new Error('Invalid origin evidence state');if(a.trainingThrough!==null){utcDay(a.trainingThrough);if(a.trainingThrough>a.origin||a.trainingThrough>asOf)throw new Error('Future training date');}
    const expectedDestination=destination(a.origin);if(a.targetCycleId!==expectedDestination.targetCycleId||a.originEraIndex!==expectedDestination.originEraIndex)throw new Error('Changed origin target cohort');
    if(!Array.isArray(a.referenceKnownAts)||a.referenceCountAtOrigin!==a.referenceKnownAts.length||a.referenceKnownAts.some(d=>{utcDay(d);return d>a.origin;}))throw new Error('Future reference in an origin');
    for(const key of ['peakConfirmedAt','troughConfirmedAt'])if(a[key]!==null){utcDay(a[key]);if(a[key]>a.origin)throw new Error('Future confirmation in an origin');}
    if(a.referencePeakDate!==null){utcDay(a.referencePeakDate);if(a.referencePeakDate>a.origin||a.baselinePeak!==shiftCalendarMonths(a.referencePeakDate,48)||a.baselineTrough!==shiftCalendarMonths(a.baselinePeak,12))throw new Error('Changed origin calendar clock');}
    else if(a.baselinePeak!==null||a.baselineTrough!==null)throw new Error('Missing origin reference cannot invent dates');
    if(a.calibrationAvailable){if(!a.referenceCountAtOrigin||!a.peakConfirmedAt||a.trainingThrough!==a.origin||a.calibrationReason!==null||!Number.isSafeInteger(a.appliedShiftDays)||Math.abs(a.appliedShiftDays)>180||a.adjustedPeak!==shift(a.baselinePeak,a.appliedShiftDays)||a.adjustedTrough!==shift(a.baselineTrough,a.appliedShiftDays))throw new Error('Invalid available origin correction');}
    else if(a.adjustedPeak!==null||a.adjustedTrough!==null||a.appliedShiftDays!==null||!a.calibrationReason)throw new Error('Unavailable correction cannot be zero-filled');
    const closed=catalog.some(t=>t.cycleId===a.targetCycleId);if(a.outcomeClosed!==closed)throw new Error('Changed outcome availability');
    const invalid=a.origin>asOf||a.trainingThrough!==a.origin||a.calibrationReason==='incomplete-current-era'||a.baselinePeak&&(a.baselinePeak<=a.origin||a.calibrationAvailable&&a.adjustedPeak<=a.origin);
    const status=invalid?'invalid':!closed?'pending':a.calibrationAvailable?'paired':a.baselinePeak?'baseline-only':'unavailable';
    if(a.status!==status)throw new Error('Changed origin eligibility');
  }
  if(!Array.isArray(catalog)||catalog.length>8||new Set(catalog.map(t=>t.targetId)).size!==catalog.length)throw new Error('Invalid historical target catalog');
  for(const t of catalog){
    for(const key of ['targetDate','targetKnownAt'])utcDay(t[key]);
    const eraIndex=HALVINGS.findIndex(h=>h.year===t.cycleYear),era=HALVINGS[eraIndex],next=HALVINGS[eraIndex+1];
    if(!era||!next||t.cycleId!=='halving-'+era.year||t.targetId!==t.cycleId+':'+t.type||!['peak','trough'].includes(t.type)||t.targetDate<era.date||t.targetDate>=next.date||t.targetKnownAt!==next.date||t.targetKnownAt>asOf)throw new Error('Unclosed historical target');
    const counterpart=catalog.find(c=>c.cycleId===t.cycleId&&c.type!==t.type);
    if(!counterpart||t.type==='peak'&&t.targetDate>=counterpart.targetDate)throw new Error('Historical peak and low need one closed era');
  }
  if(JSON.stringify(result.excluded)!==JSON.stringify(assessments.filter(a=>a.status!=='paired')))throw new Error('Excluded origins changed');
  const expectedBaseline=[];
  for(const a of assessments.filter(a=>a.status==='paired'||a.status==='baseline-only'))for(const t of catalog.filter(t=>t.cycleId===a.targetCycleId)){
    const baselineDate=t.type==='peak'?a.baselinePeak:a.baselineTrough;
    if(t.targetDate<=a.origin)throw new Error('Historical outcome precedes origin');
    expectedBaseline.push({...t,origin:a.origin,trainingThrough:a.trainingThrough,referencePeakDate:a.referencePeakDate,baselineDate,referenceCountAtOrigin:a.referenceCountAtOrigin,baselineErrorDays:utcDay(baselineDate)-utcDay(t.targetDate)});
  }
  const normalize=rows=>rows.map(r=>Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b))));
  if(JSON.stringify(normalize(expectedBaseline))!==JSON.stringify(normalize(result.baselineRecords)))throw new Error('Baseline cohort or errors changed');
  const expectedPaired=expectedBaseline.filter(r=>assessments.find(a=>a.origin===r.origin)?.status==='paired');
  if(expectedPaired.length!==result.records.length||expectedPaired.some(r=>!result.records.some(p=>p.origin===r.origin&&p.targetId===r.targetId&&p.baselineDate===r.baselineDate&&p.appliedShiftDays===assessments.find(a=>a.origin===r.origin).appliedShiftDays)))throw new Error('Paired comparison origin sets differ');
  const rebuilt=coverageFor(catalog,assessments,result.baselineRecords,result.records);
  for(const key of Object.keys(rebuilt))if(JSON.stringify(result[key])!==JSON.stringify(rebuilt[key]))throw new Error('Historical coverage grouping changed');
  const c=result.currentClock;
  if(c?.asOf!==asOf||typeof c.available!=='boolean')throw new TypeError('Invalid current clock');
  if(c.referencePeakDate!==null){utcDay(c.referencePeakDate);if(c.referencePeakDate>asOf||c.baselinePeak!==shiftCalendarMonths(c.referencePeakDate,48)||c.baselineTrough!==shiftCalendarMonths(c.baselinePeak,12))throw new RangeError('Invalid conditional calendar clock');}
  else if(c.baselinePeak!==null||c.baselineTrough!==null)throw new Error('Missing reference cannot manufacture calendar dates');
  if(c.available){if(!Number.isSafeInteger(c.appliedShiftDays)||Math.abs(c.appliedShiftDays)>180||c.adjustedPeak!==shift(c.baselinePeak,c.appliedShiftDays)||c.adjustedTrough!==shift(c.baselineTrough,c.appliedShiftDays))throw new RangeError('Invalid conditional adjustment');}
  else if(c.adjustedPeak!==null||c.adjustedTrough!==null||c.appliedShiftDays!==null)throw new Error('Unavailable clock cannot manufacture an adjustment');
  return result;
}
