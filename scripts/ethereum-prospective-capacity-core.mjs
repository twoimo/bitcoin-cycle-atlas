import {canonicalForecastJson} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp} from '../dist/forecast-information-time.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
import {ETH_PROSPECTIVE_PRICE_POLICY,planEthereumResearchPriceRequest} from '../dist/ethereum-prospective-prices.js';
import {ETH_PROSPECTIVE_CALIBRATION_POLICY} from './ethereum-prospective-calibration-core.mjs';

export const ETH_PROSPECTIVE_CAPACITY_POLICY=Object.freeze({
  version:'eth-prospective-operational-capacity-1',
  requiredDisjointWindows:ETH_PROSPECTIVE_CALIBRATION_POLICY.fixedCalibrationCases,
  maximumRecords:ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumRecords,
  maximumObservations:ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumObservations,
  maximumCandidateIndexBytes:1024*1024,
  maximumRequestDays:ETH_PROSPECTIVE_PRICE_POLICY.maximumRequestDays,
  futureIssuanceAssumption:'One issue per unchanged exact experiment and completed UTC origin day; revisions add further load',
  futureObservationAssumption:'At least one newly collected prospective snapshot per successful daily capture; independent outcome vintages add load only when actually created',
  futureDatesArePromises:false,missingPastOriginsBackfilled:false,limitsChanged:false,
});
const P=ETH_PROSPECTIVE_CAPACITY_POLICY,DAY=86400000,HEX=/^[a-f0-9]{64}$/;
const json=canonicalForecastJson,bytes=value=>new TextEncoder().encode(value).length;
const closeAt=day=>new Date((day+1)*DAY).toISOString();
const bindingOf=record=>({modelKey:record.modelKey,modelVersion:record.model.version,
  modelSourceHash:record.model.sourceHash,options:JSON.parse(json(record.options))});

function uniqueIds(values,maximum,label){
  if(!Array.isArray(values)||values.length>maximum||values.some(value=>!HEX.test(value?.id))||
    new Set(values.map(value=>value.id)).size!==values.length)throw new TypeError('Unique bounded '+label+' required');
}
function acquisition(snapshot){
  if(snapshot.kind==='ethereum-prospective-input')return {kind:'prospective',at:normalizeForecastTimestamp(snapshot.informationCutoffAt)};
  if(snapshot.kind==='atlas-asset-outcome-snapshot'&&snapshot.symbol==='ETHUSD')
    return {kind:'independent-outcome',at:normalizeForecastTimestamp(snapshot.sourceReceipt?.collectedAt)};
  throw new TypeError('Preserved ETH raw acquisition metadata required');
}

/** Limited, explicit static inspection of the repository's block-style YAML.
 * An unfamiliar event format remains unknown. A download marker does not
 * prove a complete, validated, durable append-only restoration protocol. */
export function inspectEthereumProspectiveWorkflow({path,text}={}){
  if(typeof path!=='string'||!/^\.github\/workflows\/[a-zA-Z0-9._-]+\.ya?ml$/.test(path)||
    typeof text!=='string'||bytes(text)>256*1024)throw new TypeError('Bounded workflow source required');
  const lines=text.split(/\r?\n/),start=lines.findIndex(line=>/^on:\s*(?:#.*)?$/.test(line));
  let events=null;
  if(start>=0&&!text.includes('\t')){
    let end=start+1;
    while(end<lines.length&&(!lines[end].trim()||/^\s|^#/.test(lines[end])))end++;
    const block=lines.slice(start+1,end);
    const found=block.map(line=>line.match(/^  ([a-zA-Z_][a-zA-Z0-9_-]*):(?:\s|$)/)?.[1]).filter(Boolean);
    if(found.length&&new Set(found).size===found.length)events=found.sort();
  }
  const directIssuance=/^\s+(?:-\s+)?(?:run:\s*)?node\s+scripts\/issue-ethereum-prospective\.mjs(?:\s|$)/m.test(text);
  const downloadAction=/^\s*(?:-\s*)?uses:\s*actions\/download-artifact@/m.test(text);
  const restoreMarker=downloadAction||/\bgh\s+run\s+download\b|restor[^\r\n]*ethereum|ethereum[^\r\n]*restor|actions\/artifacts/i.test(text);
  const retentionDays=[...text.matchAll(/^\s+retention-days:\s*(\d+)\s*(?:#.*)?$/gm)].map(match=>Number(match[1]));
  return {path,eventInspection:events?'recognized-block-events':'unknown-event-format',events,directIssuance,
    scheduledDirectIssuance:events?directIssuance&&events.includes('schedule'):null,
    dispatchDirectIssuance:events?directIssuance&&events.includes('workflow_dispatch'):null,
    downloadArtifactActionPresent:downloadAction,priorRunRestoreMarkerPresent:restoreMarker,
    automaticPriorRunRestoreProven:false,declaredArtifactRetentionDays:retentionDays};
}

/** Calendar and size arithmetic only. The CLI first verifies raw ledgers with
 * readEthereumCalibrationInputs. This pure projection neither authenticates
 * a caller's metadata nor creates forecasts, residuals or calibration cases. */
export function projectEthereumProspectiveCapacity({records,observations=[],baseText,informationCutoffAt,workflowSources=[]}={}){
  const cutoff=normalizeForecastTimestamp(informationCutoffAt),today=Math.floor(Date.parse(cutoff)/DAY),latestCompleted=today-1;
  uniqueIds(records,P.maximumRecords,'prospective metadata');uniqueIds(observations,P.maximumObservations,'observation metadata');
  if(!Array.isArray(workflowSources)||workflowSources.length>100)throw new TypeError('Bounded workflow sources required');
  const groups=new Map();
  for(const record of records){
    if(record.kind!=='ethereum-prospective-record'||record.recordKind!=='issued'||!['adaptive','pooled','warmStart'].includes(record.modelKey)||
      typeof record.model?.version!=='string'||!record.model.version.length||!HEX.test(record.model.sourceHash)||
      !HEX.test(record.snapshotId)||!HEX.test(record.runKey)||record.options?.horizonDays!==730||
      record.options?.sampleCount!==256||record.options?.seed!==20261027||
      Object.keys(record.options).sort().join(',')!=='horizonDays,sampleCount,seed')throw new TypeError('Exact original issued experiment metadata required');
    const issuedAt=normalizeForecastTimestamp(record.issuedAt),origin=utcDay(record.asOf);
    if(issuedAt>cutoff||origin>latestCompleted||Date.parse(issuedAt)<(origin+1)*DAY)
      throw new RangeError('Capacity inventory contains future or invalid issue clocks');
    const binding=bindingOf(record),key=json(binding);
    if(!groups.has(key))groups.set(key,{binding,records:[]});
    groups.get(key).records.push(record);
  }
  const observed=observations.map(snapshot=>({id:snapshot.id,...acquisition(snapshot)}));
  if(observed.some(value=>value.at>cutoff))throw new RangeError('Capacity inventory contains future acquisitions');
  const daily=new Map();
  for(const value of observed){
    const date=value.at.slice(0,10);
    if(!daily.has(date))daily.set(date,{date,prospective:0,independentOutcome:0});
    daily.get(date)[value.kind==='prospective'?'prospective':'independentOutcome']++;
  }
  const acquisitionDays=[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const maximumObservedProspectivePerDay=Math.max(0,...acquisitionDays.map(value=>value.prospective));
  const orderedGroups=[...groups.values()].sort((a,b)=>json(a.binding).localeCompare(json(b.binding)));
  const lastKnownOrigin=records.length?Math.max(...records.map(record=>utcDay(record.asOf))):latestCompleted-1;
  const firstNewOrigin=Math.max(latestCompleted,lastKnownOrigin+1),modelsPerDay=groups.size;
  // A new origin needs its own completed-day acquisition. After a missed run
  // the latest completed origin can be captured today; an already issued
  // latest origin instead makes tomorrow the first new daily capture.
  const firstNewCapture=firstNewOrigin+1;
  const entries=records.map(ethereumProspectiveIndexEntry);
  const compactIndexBytes=bytes(json({schemaVersion:1,kind:'ethereum-prospective-index',entries})+'\n');
  // All dates/IDs use fixed-width canonical representations. These are byte
  // lengths of retained entry shapes, not fabricated future record objects.
  const dailyIndexByteGrowth=orderedGroups.reduce((sum,group)=>sum+bytes(json(ethereumProspectiveIndexEntry(group.records[0])))+1,0);
  const recordDays=modelsPerDay?Math.max(0,Math.floor((P.maximumRecords-records.length)/modelsPerDay)):null;
  const indexDays=dailyIndexByteGrowth?Math.max(0,Math.floor((P.maximumCandidateIndexBytes-compactIndexBytes)/dailyIndexByteGrowth)):null;
  const observationScenarios=[...new Set([1,maximumObservedProspectivePerDay].filter(value=>value>0))].sort((a,b)=>a-b).map(perDay=>{
    const completeDays=Math.floor((P.maximumObservations-observations.length)/perDay);
    return {newProspectiveSnapshotsPerDay:perDay,
      basis:perDay===1?'conditional single successful daily capture':'conditional repetition of maximum retained same-day prospective captures',
      additionalIndependentSnapshotsAssumed:0,completeAdditionalCaptureDaysWithinLimit:completeDays,
      firstAdditionalCaptureDate:dateFromDay(firstNewCapture),
      firstExceedingCaptureDate:dateFromDay(firstNewCapture+completeDays),
      historicalScheduleOrFutureFrequencyProven:false};
  });
  if(typeof baseText!=='string'||!baseText.length||bytes(baseText)>ETH_PROSPECTIVE_PRICE_POLICY.maximumBaseBytes)
    throw new TypeError('Bounded current base archive required');
  const base=parseEthArchive(JSON.parse(baseText));
  if(base.requestedEnd*1000>Date.parse(cutoff)||Date.parse(base.retrievedAt)>Date.parse(cutoff))
    throw new RangeError('Current base contains future archive clocks');
  const requestStart=Math.max(base.requestedStart,base.requestedEnd-ETH_PROSPECTIVE_PRICE_POLICY.overlapDays*86400);
  const lastAllowedRequestDay=requestStart/86400+P.maximumRequestDays;
  let currentRequestPlan=null,currentRequestError=null;
  try{currentRequestPlan=planEthereumResearchPriceRequest(baseText,cutoff);}
  catch(error){currentRequestError={name:error.name,message:error.message};}
  // Independently exercise both exact endpoints with the frozen planner.
  planEthereumResearchPriceRequest(baseText,new Date(lastAllowedRequestDay*DAY).toISOString());
  let nextDayRejected=false;
  try{planEthereumResearchPriceRequest(baseText,new Date((lastAllowedRequestDay+1)*DAY).toISOString());}
  catch{nextDayRejected=true;}
  if(!nextDayRejected)throw new Error('The fixed-base request boundary differs from its declared policy');
  const calendars=[];
  for(const group of orderedGroups)for(const horizonDays of [30,90,180]){
    const sorted=[...group.records].sort((a,b)=>a.asOf.localeCompare(b.asOf)||a.issuedAt.localeCompare(b.issuedAt)||a.id.localeCompare(b.id));
    const origins=new Map();for(const record of sorted){if(!origins.has(record.asOf))origins.set(record.asOf,[]);origins.get(record.asOf).push(record);}
    const windows=[];let boundary=-Infinity,overlappingOrigins=0;
    for(const [asOf,revisionGroup]of origins){
      const origin=utcDay(asOf),first=revisionGroup[0];
      if(origin<boundary){overlappingOrigins++;continue;}
      boundary=origin+horizonDays;
      if(windows.length<P.requiredDisjointWindows)windows.push({originDate:asOf,targetDate:dateFromDay(boundary),
        observationEndAt:closeAt(boundary),kind:'actually-issued',recordId:first.id,
        ambiguousFirstIssue:revisionGroup.filter(record=>record.issuedAt===first.issuedAt).length>1});
    }
    const actualWindows=windows.length;
    let futureOrigin=Math.max(latestCompleted,utcDay(sorted.at(-1).asOf)+1,
      windows.length?utcDay(windows.at(-1).targetDate):-Infinity);
    while(windows.length<P.requiredDisjointWindows){
      const target=futureOrigin+horizonDays;
      windows.push({originDate:dateFromDay(futureOrigin),targetDate:dateFromDay(target),observationEndAt:closeAt(target),kind:'hypothetical-future-calendar-only'});
      futureOrigin=target;
    }
    const last=windows.at(-1),lastTarget=utcDay(last.targetDate),additionalDailyOrigins=Math.max(0,lastTarget-firstNewOrigin+1);
    const projectedRecords=records.length+additionalDailyOrigins*modelsPerDay;
    const projectedIndexBytes=compactIndexBytes+additionalDailyOrigins*dailyIndexByteGrowth;
    const additionalCaptureDays=Math.max(0,Math.floor(Date.parse(last.observationEndAt)/DAY)-firstNewCapture+1);
    const observationsAtEnd=observationScenarios.map(scenario=>({newProspectiveSnapshotsPerDay:scenario.newProspectiveSnapshotsPerDay,
      projectedObservations:observations.length+additionalCaptureDays*scenario.newProspectiveSnapshotsPerDay,
      withinObservationLimit:observations.length+additionalCaptureDays*scenario.newProspectiveSnapshotsPerDay<=P.maximumObservations}));
    const blockers=[];
    if(Math.floor(Date.parse(last.observationEndAt)/DAY)>lastAllowedRequestDay)blockers.push('current-base-290-day-tail-limit');
    if(projectedRecords>P.maximumRecords)blockers.push('records-2000-limit');
    if(projectedIndexBytes>P.maximumCandidateIndexBytes)blockers.push('candidate-index-1MiB-limit');
    if(observationsAtEnd.some(value=>!value.withinObservationLimit))blockers.push('observations-500-limit-in-listed-cadence');
    calendars.push({binding:{...group.binding,horizonDays},uniqueActuallyIssuedOrigins:origins.size,
      sameOriginRevisions:sorted.length-origins.size,overlappingActuallyIssuedOrigins:overlappingOrigins,
      actualDisjointWindowsInFirstTwelve:actualWindows,
      actualMaturedWindowsInFirstTwelve:windows.filter(value=>value.kind==='actually-issued'&&value.observationEndAt<=cutoff).length,
      hypotheticalFutureWindows:P.requiredDisjointWindows-actualWindows,windows,
      earliestCalendarObservationEndAt:last.observationEndAt,
      forecastOrOutcomeAvailabilityPromised:false,additionalDailyOriginDays:additionalDailyOrigins,
      projectedRecords,projectedCompactIndexBytes:projectedIndexBytes,observationsAtCalendarEnd:observationsAtEnd,
      conditionalOperationalBlockers:blockers});
  }
  const workflows=workflowSources.map(inspectEthereumProspectiveWorkflow);
  const issuerWorkflows=workflows.filter(value=>value.directIssuance);
  return {policy:P,informationCutoffAt:cutoff,
    inventory:{records:records.length,exactExperiments:groups.size,uniqueOrigins:new Set(records.map(record=>record.asOf)).size,
      observations:observations.length,prospectiveAcquisitions:observed.filter(value=>value.kind==='prospective').length,
      independentOutcomeAcquisitions:observed.filter(value=>value.kind==='independent-outcome').length,
      acquisitionDays,maximumObservedProspectivePerDay,completeHistoricalAcquisitionScheduleProven:false,
      recordIds:records.map(record=>record.id).sort(),observationIds:observations.map(value=>value.id).sort()},
    dailyContinuation:{firstPossibleAdditionalOriginDate:dateFromDay(firstNewOrigin),unchangedExperimentsPerDay:modelsPerDay,
      completeAdditionalOriginDaysWithinRecordLimit:recordDays,
      firstOriginDayExceedingRecordLimit:recordDays===null?null:dateFromDay(firstNewOrigin+recordDays),
      currentMergedCompactIndexBytes:compactIndexBytes,additionalIndexBytesPerCompleteOriginDay:dailyIndexByteGrowth,
      completeAdditionalOriginDaysWithinIndexLimit:indexDays,
      firstOriginDayExceedingIndexLimit:indexDays===null?null:dateFromDay(firstNewOrigin+indexDays),
      indexByteLimitScope:'Per individual input index; this projection assumes accumulation into one retained seed index',
      indexProjectionBasis:'Canonical compact merged inventory with current exact experiment entry lengths; extra whitespace, revisions and changed versions can exhaust the bound sooner',
      observationScenarios},
    unchangedCurrentBase:{path:ETH_PROSPECTIVE_PRICE_POLICY.basePath,requestedStart:base.requestedStart,requestedEnd:base.requestedEnd,
      requestOverlapStartAt:new Date(requestStart*1000).toISOString(),lastAllowedRequestUtcDate:dateFromDay(lastAllowedRequestDay),
      firstRejectedRequestUtcDate:dateFromDay(lastAllowedRequestDay+1),boundaryPlannerChecksPassed:true,
      currentRequestPlan,currentRequestError,explicitCommittedBaseReplacementSupported:true,automaticBaseRolloverImplemented:false,
      scope:'This boundary holds only while these exact base bytes remain unchanged. The separate committed-base reader permits an explicitly reviewed committed replacement; it does not generate or schedule that replacement.'},
    calendars,workflowInspection:{sources:workflows,directIssuerWorkflowCount:issuerWorkflows.length,
      knownScheduledDirectIssuer:issuerWorkflows.some(value=>value.scheduledDirectIssuance===true),
      recognizedIssuerEventsOnly:issuerWorkflows.length>0&&issuerWorkflows.every(value=>value.events!==null),
      onlyPullRequestDirectIssuance:issuerWorkflows.length>0&&issuerWorkflows.every(value=>json(value.events)===json(['pull_request'])),
      priorRunRestoreMarkerPresent:workflows.some(value=>value.priorRunRestoreMarkerPresent),automaticPriorRunRestoreProven:false,
      scope:'Literal inspected workflow sources only; indirect commands or unfamiliar YAML require review. Artifact upload and retention are not proof of restore, seed append or permanent preservation.'},
    remainingOperationalRequirements:['Actually capture, publish and durably preserve each future issuance and its raw outcomes',
      'A reviewed trigger and validated complete prior-run archive restoration/append protocol',
      'Reviewed committed base updates before the unchanged-base request boundary',
      'A bounded archival/streaming design that preserves all required evidence beyond current flat inventory limits',
      'First twelve exact-bound nonoverlapping actual windows with all selected outcomes; no substitution or retrospective issues'],
    actualNewRecords:0,actualNewObservations:0,actualCalibrationFreezes:0,actualCalibratedRecordsIssued:0,
    actualRawInputReadinessProven:false,metadataAuthenticatedByProjection:false,calibrationReadinessClaimed:false,
    releaseAuthorized:false,productionPromoted:false,coverageGuarantee:false,limitsChanged:false,retrospectiveIssuance:false,
    limitation:'An operational lower-bound calendar and bounded-storage projection. It makes no prediction of market, provider, institution or business-day data readiness, and never counts a hypothetical window as an issued calibration sample.'};
}
