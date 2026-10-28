import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp,selectPriceVintages} from '../dist/forecast-information-time.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {readAssetOutcomePrices} from '../dist/asset-outcome-records.js';
import {ETH_FUTURE_CALIBRATION_CONTRACT,calibrationOrderStatistic} from './ethereum-independent-calibration-core.mjs';
import {ETH_PROSPECTIVE_CALIBRATION_POLICY} from './ethereum-prospective-calibration-core.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_SOURCE_POLICY,ethereumProspectiveArchiveSourceInfo,
  visitEthereumProspectiveArchiveRecords,visitEthereumProspectiveArchiveObservations,
  openEthereumProspectiveArchiveSourceAtManifest} from './ethereum-prospective-archive-source.mjs';

/** The original flat APIs and their numerical policy remain unchanged. This
 * separately versioned consumer uses a complete verified archive inventory.
 * It retains small record metadata and needed price/clock signatures, never a
 * collection of original parsed snapshots or forecast paths. */
export const ETH_PROSPECTIVE_PAGED_CALIBRATION_POLICY=Object.freeze({
  version:'eth-prospective-paged-calibration-gate-1',
  selectionPolicyVersion:ETH_PROSPECTIVE_CALIBRATION_POLICY.version,
  contractVersion:ETH_FUTURE_CALIBRATION_CONTRACT.version,
  minimumCalibrationCases:12,fixedCalibrationCases:12,alpha:.2,
  archiveSourcePolicyVersion:ETH_PROSPECTIVE_ARCHIVE_SOURCE_POLICY.version,
  maximumPhysicalFiles:ETH_PROSPECTIVE_ARCHIVE_SOURCE_POLICY.maximumPhysicalFiles,
  maximumPhysicalBytes:ETH_PROSPECTIVE_ARCHIVE_SOURCE_POLICY.maximumPhysicalBytes,
  maximumTargetDates:100000,maximumReportBindings:256,
  legacyReaderLimits:Object.freeze({records:2000,observations:500,indexBytes:1024*1024}),
  originSelection:ETH_PROSPECTIVE_CALIBRATION_POLICY.originSelection,
  windowSelection:ETH_PROSPECTIVE_CALIBRATION_POLICY.windowSelection,
  outcomeSelection:ETH_PROSPECTIVE_CALIBRATION_POLICY.outcomeSelection,
  missingSelectedSlotReplacement:false,retrospectiveErrorsAllowed:false,
  freezeRequiresImmutableManifest:true,legacyReaderLimitsUnchanged:true,
  independentMarketSampleSize:null,coverageGuarantee:false,productionPromoted:false,
});
const P=ETH_PROSPECTIVE_PAGED_CALIBRATION_POLICY,HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const KINDS=['ethereum-prospective-input','atlas-asset-outcome-snapshot'];
const json=canonicalForecastJson,copy=value=>JSON.parse(json(value));
const closeAt=date=>new Date((utcDay(date)+1)*86400000).toISOString();
const safeError=error=>({name:error.name,message:String(error.message).slice(0,800)});

function only(input,allowed,required){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key))||
    required.some(key=>!Object.hasOwn(input,key)))throw new TypeError('Only the documented paged calibration inputs are accepted');
}
function binding(value){
  if(!value||!['adaptive','pooled','warmStart'].includes(value.modelKey)||
    typeof value.modelVersion!=='string'||!value.modelVersion.length||value.modelVersion.length>120||
    !HEX.test(value.modelSourceHash)||![30,90,180].includes(value.horizonDays))
    throw new TypeError('Exact candidate model, source graph and target horizon binding required');
  const options=value.options;
  if(!options||options.horizonDays!==730||options.sampleCount!==256||options.seed!==20261027||
    Object.keys(options).sort().join(',')!=='horizonDays,sampleCount,seed')
    throw new RangeError('The exact original prospective simulation options are required');
  if(Object.keys(value).sort().join(',')!=='horizonDays,modelKey,modelSourceHash,modelVersion,options')
    throw new TypeError('Unexpected prospective calibration binding fields');
  return copy(value);
}
function matches(record,bound){
  return record.modelKey===bound.modelKey&&record.model.version===bound.modelVersion&&
    record.model.sourceHash===bound.modelSourceHash&&json(record.options)===json(bound.options);
}
function kinds(value=KINDS){
  if(!Array.isArray(value)||!value.length||value.some(item=>!KINDS.includes(item))||new Set(value).size!==value.length)
    throw new TypeError('Unique supported observation kinds required');
  return [...value].sort();
}
function dates(values){
  if(!Array.isArray(values)||values.length>P.maximumTargetDates)throw new TypeError('Bounded target-date projection required');
  const result=values.map(value=>{utcDay(value);return value;});
  if(new Set(result).size!==result.length)throw new TypeError('Unique target dates required');
  return result.sort();
}
function sourceIdentity(info){
  return {id:info.id,archiveManifestId:info.archiveManifestId,archiveSequence:info.archiveSequence,
    records:info.records,observations:info.observations,overlayInputFiles:info.overlayInputFiles,
    independentForeignObservations:info.independentForeignObservations,
    foreignObservationIds:info.foreignObservationIds??[]};
}
function observationEvidence(snapshot){
  // This function is called only by the opaque source's semantic-validation
  // visitor. Its complete raw bytes (including foreign inputs) were verified
  // before the callback; no caller-supplied verified flag is accepted.
  if(snapshot.kind==='ethereum-prospective-input')return {rows:snapshot.primaryPrices,receipt:{
    vintageId:snapshot.id,sourceHash:snapshot.primaryPricesHash,sourceUrl:snapshot.tail.sourceUrl,
    collectedAt:snapshot.informationCutoffAt,publishedAt:null,sourceObservedThrough:snapshot.asOf}};
  if(snapshot.kind==='atlas-asset-outcome-snapshot'&&snapshot.symbol==='ETHUSD'){
    const receipt=snapshot.sourceReceipt;
    return {rows:readAssetOutcomePrices('ETHUSD',snapshot.sourceDocument),receipt:{
      vintageId:receipt.vintageId,sourceHash:receipt.sourceHash,sourceUrl:receipt.sourceUrl,
      collectedAt:receipt.collectedAt,publishedAt:receipt.publishedAt,sourceObservedThrough:snapshot.observedThrough}};
  }
  throw new TypeError('Only verified ETH observation snapshots may enter a calibration projection');
}
function collectedAt(snapshot){
  return normalizeForecastTimestamp(snapshot.kind==='ethereum-prospective-input'?
    snapshot.informationCutoffAt:snapshot.sourceReceipt?.collectedAt,'collectedAt');
}

/** Normalize bounded per-snapshot projections through the unchanged clock
 * implementation. Global date/collection signatures preserve EVERY visible
 * old tie, including one hidden by a newer winner. Keeping only a page winner
 * would lose that evidence. There is no all-vintage 100,000-row array here. */
async function projectObservations(source,targetDates,at,observationKinds){
  const needed=new Set(targetDates),scope=new Set(observationKinds),info=ethereumProspectiveArchiveSourceInfo(source);
  const winners=new Map(),times=new Map(),conflicts=new Map(),vintages=new Map();
  const invalidObservations=[],futureObservationIds=[],ignoredObservationIds=[],visited=[];
  await visitEthereumProspectiveArchiveObservations(source,async(snapshot,descriptor)=>{
    visited.push(snapshot.id);
    // The source revalidates even a snapshot excluded by this projection.
    if(!scope.has(snapshot.kind)){ignoredObservationIds.push(snapshot.id);return;}
    try{
      const {rows,receipt}=observationEvidence(snapshot);
      if(receipt.collectedAt>at){futureObservationIds.push(snapshot.id);return;}
      if(vintages.has(receipt.vintageId))throw new Error('Conflicting outcome acquisition identity');
      vintages.set(receipt.vintageId,snapshot.id);
      const prices=[];
      for(const [date,price]of rows)if(needed.has(date))prices.push({date,price,...receipt});
      const normalized=selectPriceVintages(prices,{symbol:'ETHUSD',market:'crypto',informationCutoffAt:at});
      for(const row of normalized.rows){
        const key=row.date+'\0'+row.collectedAt,priorTime=times.get(key);
        if(priorTime&&priorTime.vintageId!==row.vintageId&&
          (priorTime.price!==row.price||priorTime.sourceHash!==row.sourceHash))
          conflicts.set(row.date,safeError(new RangeError('Ambiguous equally timed price revisions')));
        if(!priorTime)times.set(key,{vintageId:row.vintageId,price:row.price,sourceHash:row.sourceHash});
        const prior=winners.get(row.date);
        if(!prior||prior.collectedAt<row.collectedAt||prior.collectedAt===row.collectedAt&&prior.vintageId.localeCompare(row.vintageId)<0)
          winners.set(row.date,{...row,observationId:snapshot.id,descriptor:copy(descriptor)});
      }
    }catch(error){invalidObservations.push({observationId:snapshot.id,...safeError(error)});}
  });
  if(json(visited.sort())!==json(info.observationIds))throw new Error('Paged observation visit differs from its complete verified inventory');
  return {winners,conflicts,invalidObservations,futureObservationIds:futureObservationIds.sort(),
    ignoredObservationIds:ignoredObservationIds.sort(),info};
}
function projectedResult(projection,targetDates,at,observationKinds){
  const {info}=projection,invalidObservations=copy(projection.invalidObservations);
  const conflicts=targetDates.filter(date=>projection.conflicts.has(date));
  if(conflicts.length)invalidObservations.push({observationId:null,...projection.conflicts.get(conflicts[0])});
  // The legacy selector rejects its whole requested date block on any price
  // conflict. A different binding's unrelated date does not poison this one.
  const rows=conflicts.length?[]:targetDates.flatMap(date=>projection.winners.has(date)?[copy(projection.winners.get(date))]:[]);
  return {source:sourceIdentity(info),informationCutoffAt:at,observationKinds:[...observationKinds],targetDates:[...targetDates],
    rows,invalidObservations:invalidObservations.sort((a,b)=>String(a.observationId).localeCompare(String(b.observationId))),
    futureObservationIds:[...projection.futureObservationIds],ignoredObservationIds:[...projection.ignoredObservationIds],
    foreignObservationIds:[...(info.foreignObservationIds??[])],observationCount:info.observations,
    inputObservationIds:[...info.observationIds],conflictingTargetDates:conflicts,
    allRawEvidenceVerified:true,retainedParsedObservationCollections:0,missingValuesImputed:false};
}

/** Used both by calibration and by the archive evaluator. A prospective-only
 * evaluator can request observationKinds:['ethereum-prospective-input']; every
 * other input is still authenticated before that scope is applied. */
export async function selectEthereumProspectivePagedObservations(input={}){
  only(input,['source','targetDates','informationCutoffAt','observationKinds'],['source','targetDates','informationCutoffAt']);
  const source=input.source,needed=dates(input.targetDates),at=normalizeForecastTimestamp(input.informationCutoffAt,'informationCutoffAt'),
    scope=kinds(input.observationKinds);
  const projection=await projectObservations(source,needed,at,scope);
  return projectedResult(projection,needed,at,scope);
}

async function recordMetadata(source){
  const info=ethereumProspectiveArchiveSourceInfo(source),records=[];
  await visitEthereumProspectiveArchiveRecords(source,async(record)=>{
    if(record.kind!=='ethereum-prospective-record'||record.recordKind!=='issued')
      throw new TypeError('Only original immutable issued prospective records are accepted');
    records.push(copy({id:record.id,snapshotId:record.snapshotId,modelKey:record.modelKey,
      model:{version:record.model.version,sourceHash:record.model.sourceHash},options:record.options,
      asOf:record.asOf,issuedAt:record.issuedAt,firstPublishedAt:record.firstPublishedAt??null,
      targets:record.targets.map(({horizonDays,targetDate,eventAt,median})=>({horizonDays,targetDate,eventAt,median}))}));
  });
  if(json(records.map(record=>record.id).sort())!==json(info.recordIds))
    throw new Error('Paged record visit differs from its complete verified inventory');
  return records;
}
function selectBlock(records,at,bound){
  const excluded=[],pending=[],matured=[];
  for(const record of records){
    if(!matches(record,bound)){excluded.push({recordId:record.id,reason:'different-experiment-binding'});continue;}
    const issuedAt=normalizeForecastTimestamp(record.issuedAt,'issuedAt');
    if(issuedAt>at){excluded.push({recordId:record.id,reason:'issued-after-cutoff'});continue;}
    const targetDate=dateFromDay(utcDay(record.asOf)+bound.horizonDays),eventAt=closeAt(targetDate);
    const row={record,recordId:record.id,asOf:record.asOf,targetDate,eventAt,issuedAt};
    if(eventAt>at){pending.push({recordId:record.id,asOf:record.asOf,targetDate,eventAt});continue;}
    matured.push(row);
  }
  matured.sort((a,b)=>a.asOf.localeCompare(b.asOf)||a.issuedAt.localeCompare(b.issuedAt)||a.recordId.localeCompare(b.recordId));
  const origins=new Map();
  for(const row of matured){if(!origins.has(row.asOf))origins.set(row.asOf,[]);origins.get(row.asOf).push(row);}
  const disjoint=[],overlapping=[],revisions=[];let boundary=-Infinity;
  for(const group of origins.values()){
    const first=group[0],sameTime=group.filter(row=>row.issuedAt===first.issuedAt);
    for(const row of group.slice(1))revisions.push({recordId:row.recordId,asOf:row.asOf,firstRecordId:first.recordId});
    if(utcDay(first.asOf)<boundary){overlapping.push(first.recordId);continue;}
    boundary=utcDay(first.targetDate);
    disjoint.push({...first,tiedRecordIds:sameTime.length>1?sameTime.map(row=>row.recordId):[]});
  }
  const slots=[];
  for(const row of disjoint.slice(0,P.fixedCalibrationCases)){
    let forecastError=null,target=null;
    try{
      if(row.tiedRecordIds.length)throw new Error('Ambiguous equally timed same-origin prospective revisions');
      if(row.issuedAt>=row.eventAt)throw new RangeError('Prospective issue must precede its target observation end');
      target=row.record.targets.find(value=>value.horizonDays===bound.horizonDays);
      if(!target||target.targetDate!==row.targetDate||target.eventAt!==row.eventAt)
        throw new RangeError('Selected prospective target clock differs from the bound horizon');
    }catch(error){forecastError=safeError(error);}
    slots.push({recordId:row.recordId,snapshotId:row.record.snapshotId,asOf:row.asOf,
      issuedAt:row.issuedAt,firstPublishedAt:row.record.firstPublishedAt,targetDate:row.targetDate,eventAt:row.eventAt,
      horizonDays:bound.horizonDays,tiedRecordIds:row.tiedRecordIds,predicted:target?.median??null,
      status:forecastError?'invalid-forecast-evidence':'missing-observation',forecastError,
      observationId:null,actual:null,actualSource:null,absoluteLogError:null});
  }
  return {bound,slots,eligibleMaturedRecords:matured.length,uniqueMaturedOrigins:origins.size,
    disjointMaturedOrigins:disjoint.length,pendingRecords:pending.sort((a,b)=>a.recordId.localeCompare(b.recordId)),
    excludedRecords:excluded.sort((a,b)=>a.recordId.localeCompare(b.recordId)),overlappingRecordIds:overlapping.sort(),
    sameOriginRevisions:revisions.sort((a,b)=>a.recordId.localeCompare(b.recordId))};
}
async function readiness(block,projection,at){
  const {bound,slots,...selection}=block;
  const selected=projectedResult(projection,[...new Set(slots.map(slot=>slot.targetDate))].sort(),at,KINDS),
    actuals=new Map(selected.rows.map(row=>[row.date,row]));
  for(const slot of slots){
    if(slot.forecastError)continue;
    const actual=actuals.get(slot.targetDate);if(!actual)continue;
    slot.observationId=actual.observationId;slot.actual=actual.price;
    slot.actualSource={vintageId:actual.vintageId,sourceHash:actual.sourceHash,sourceUrl:actual.sourceUrl,
      eventAt:actual.eventAt,sourceObservedThrough:actual.sourceObservedThrough,sourceEventAt:actual.sourceEventAt,
      publishedAt:actual.publishedAt,collectedAt:actual.collectedAt,availabilityBasis:actual.availabilityBasis};
    slot.absoluteLogError=Math.abs(Math.log(slot.predicted)-Math.log(slot.actual));
    if(!Number.isFinite(slot.absoluteLogError))throw new RangeError('Nonfinite prospective calibration residual');
    slot.status='available';
  }
  const available=slots.filter(slot=>slot.status==='available').length,complete=slots.length===P.fixedCalibrationCases;
  const status=!complete?'insufficient-calibration-cases':selected.invalidObservations.length||available!==slots.length?
    'incomplete-calibration-block':'ready-to-freeze';
  const orderStatistic=status==='ready-to-freeze'?calibrationOrderStatistic(slots.map(slot=>slot.absoluteLogError),{alpha:P.alpha}):null;
  if(orderStatistic&&orderStatistic.status!=='available')throw new Error('Fixed prospective calibration block has an unavailable rank');
  const info=projection.info,body={schemaVersion:1,kind:'ethereum-prospective-paged-calibration-readiness',policy:P,binding:bound,
    informationCutoffAt:at,status,requiredCalibrationCases:P.fixedCalibrationCases,...selection,
    selectedCalibrationCases:slots.length,validSelectedOutcomes:available,
    missingSelectedOutcomes:slots.filter(slot=>slot.status==='missing-observation').length,
    invalidSelectedForecasts:slots.filter(slot=>slot.status==='invalid-forecast-evidence').length,
    slots,calibrationBoundary:slots.length?slots.at(-1).targetDate:null,
    calibrationObservationEndAt:slots.length?slots.at(-1).eventAt:null,orderStatistic,logRadius:orderStatistic?.logRadius??null,
    invalidObservations:selected.invalidObservations,futureObservationIds:selected.futureObservationIds,
    inputSource:sourceIdentity(info),inputRecordIds:[...info.recordIds],inputObservationIds:[...info.observationIds],
    existingRecordsChanged:false,retrospectiveResidualsUsed:false,actualCalibratedRecordsIssued:0,
    prospectiveCalibratedTargetsScored:0,productionPromoted:false,coverageGuarantee:false,
    historicalPublicationProven:false,actualModelExecutionAuthenticated:false,
    evidenceMeaning:'Structural replay of preserved issued records, raw outcomes and supplied acquisition clocks. Unknown publication times stay null; this does not independently authenticate historical collection, public publication or model execution.'};
  return {id:await forecastHash(body),...body};
}
function normalizedBindings(values,maximum){
  if(!Array.isArray(values)||values.length>maximum)throw new TypeError('Bounded exact calibration bindings required');
  const result=values.map(binding);
  if(new Set(result.map(json)).size!==result.length)throw new TypeError('Unique exact calibration bindings required');
  return result;
}
async function results(source,at,requested){
  const records=await recordMetadata(source);
  let bindings=requested;
  if(bindings===null){
    const derived=new Map();
    for(const record of records)for(const horizonDays of [30,90,180]){
      const value={modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,
        options:record.options,horizonDays},key=json(value);
      if(!derived.has(key)&&derived.size>=P.maximumReportBindings)
        throw new RangeError('Paged calibration report exceeds maximumReportBindings=256; request explicit bounded binding batches without pruning source evidence');
      derived.set(key,value);
    }
    bindings=[...derived.values()].sort((a,b)=>json(a).localeCompare(json(b)));
  }
  const blocks=bindings.map(bound=>selectBlock(records,at,bound)),needed=dates([...new Set(blocks.flatMap(block=>block.slots.map(slot=>slot.targetDate)))]);
  // One full raw-observation visit serves every binding. Date conflicts are
  // applied only to the selected block that actually requests that date.
  const projection=await projectObservations(source,needed,at,KINDS),items=[];
  for(const block of blocks)items.push(await readiness(block,projection,at));
  return {records,items,info:projection.info};
}

export async function buildEthereumProspectivePagedCalibrationReadiness(input={}){
  only(input,['source','informationCutoffAt','binding'],['source','informationCutoffAt','binding']);
  const source=input.source,at=normalizeForecastTimestamp(input.informationCutoffAt,'informationCutoffAt'),bound=binding(input.binding);
  return (await results(source,at,[bound])).items[0];
}

/** This report proves raw-byte and record-schema reproduction. Model-source
 * reexecution is an explicit separate operational step and is not claimed by
 * the calibration selector. The caller may supply bindings or derive all exact
 * preserved experiments and the three fixed horizons. */
export async function buildEthereumProspectivePagedCalibrationReport(input={}){
  only(input,['source','informationCutoffAt','bindings'],['source','informationCutoffAt']);
  const source=input.source,at=normalizeForecastTimestamp(input.informationCutoffAt,'informationCutoffAt'),
    requested=input.bindings===undefined?null:normalizedBindings(input.bindings,P.maximumReportBindings);
  const checked=await results(source,at,requested),ready=checked.items.filter(item=>item.status==='ready-to-freeze');
  const body={schemaVersion:1,kind:'ethereum-prospective-paged-calibration-report',informationCutoffAt:at,policy:P,
    inputSource:sourceIdentity(checked.info),inputFiles:checked.info.inputFiles,
    logicalInputFiles:checked.info.logicalDescriptors.map(({path,bytes,sha256,gitBlobSha})=>({path,bytes,sha256,gitBlobSha})),
    preservedRecordIds:[...checked.info.recordIds],preservedObservationIds:[...checked.info.observationIds],
    preservedRecords:checked.info.records,preservedObservations:checked.info.observations,
    uniqueOrigins:new Set(checked.records.map(record=>record.asOf)).size,results:checked.items,
    bindingSelection:requested===null?'all-preserved-experiments':'explicit-bounded-binding-batch',
    allPreservedBindingsIncluded:requested===null,reportedBindings:checked.items.length,maximumReportBindings:P.maximumReportBindings,
    readyBindings:ready.length,freezeRequired:ready.length>0,actualFreezesCreated:0,actualCalibratedRecordsIssued:0,
    prospectiveCalibratedTargetsScored:0,existingRecordsChanged:false,networkRequests:0,productionPromoted:false,
    coverageGuarantee:false,historicalPublicationAuthenticated:false,actualSourceReplayPerformed:false,
    retainedParsedObservationCollections:0,
    limitation:'Complete immutable inventory and selected calibration evidence only. Model-source replay remains a separate required operational check. No forecast is issued, source publication is not independently authenticated, and a ready block still requires a post-append immutable freeze followed by later forecast issuance.'};
  return {id:await forecastHash(body),...body};
}

async function checkedFreezeSource(source){
  if(!source||!COMMIT.test(source.sourceCommit)||!HEX.test(source.sourceHash)||!source.files||Array.isArray(source.files)||
    !source.files['scripts/ethereum-prospective-calibration-paged.mjs']||!source.files['scripts/ethereum-prospective-archive-source.mjs'])
    throw new TypeError('Exact committed paged calibration freezer and archive-reader source required');
  for(const [path,hash]of Object.entries(source.files))if(!/^(?:dist|scripts)\/[a-zA-Z0-9._/-]+\.(?:js|mjs)$/.test(path)||path.includes('..')||!HEX.test(hash))
    throw new TypeError('Invalid calibration freezer source file');
  if(await forecastHash(source.files)!==source.sourceHash)throw new Error('Calibration freezer source graph/hash mismatch');
  return source;
}
export async function createEthereumProspectivePagedCalibrationFreeze(input={}){
  only(input,['readiness','source','frozenAt','freezeSource'],['readiness','source','frozenAt','freezeSource']);
  const source=input.source,captured=copy({readiness:input.readiness,freezeSource:input.freezeSource}),
    frozen=normalizeForecastTimestamp(input.frozenAt,'frozenAt'),info=ethereumProspectiveArchiveSourceInfo(source);
  const claimed=captured.readiness;
  if(claimed?.schemaVersion!==1||claimed.kind!=='ethereum-prospective-paged-calibration-readiness'||!HEX.test(claimed.id))
    throw new TypeError('Original paged prospective calibration readiness required');
  if(info.overlayInputFiles!==0||info.overlayDirectories.length)
    throw new Error('A calibration freeze requires an immutable post-append archive manifest without overlays');
  const checked=await buildEthereumProspectivePagedCalibrationReadiness({source,
    informationCutoffAt:claimed.informationCutoffAt,binding:claimed.binding});
  if(json(checked)!==json(claimed))throw new Error('Paged readiness does not reproduce from the complete immutable archive inventory');
  if(checked.status!=='ready-to-freeze')throw new RangeError('Twelve complete same-bound prospective outcomes are required before freezing');
  if(frozen<checked.informationCutoffAt)throw new RangeError('A calibration freeze cannot precede its actual information cutoff');
  if(frozen<normalizeForecastTimestamp(info.archiveManifest.createdAt,'archiveManifest.createdAt'))
    throw new RangeError('A calibration freeze cannot precede the immutable archive manifest it binds');
  const freezer=await checkedFreezeSource(captured.freezeSource);
  const body={schemaVersion:1,kind:'ethereum-prospective-paged-calibration-freeze',policyVersion:P.version,
    contractVersion:P.contractVersion,frozenAt:frozen,source:freezer,archiveManifestId:info.archiveManifestId,
    archiveSourceId:info.id,binding:checked.binding,readinessId:checked.id,readiness:checked,
    calibrationRecordIds:checked.slots.map(slot=>slot.recordId),calibrationObservationIds:checked.slots.map(slot=>slot.observationId),
    exactResiduals:checked.slots.map(slot=>slot.absoluteLogError),orderStatistic:checked.orderStatistic,
    logRadius:checked.logRadius,calibrationBoundary:checked.calibrationBoundary,nextOriginMustBeStrictlyAfter:checked.calibrationBoundary,
    actualCalibratedRecordsIssued:0,existingRecordsChanged:false,retrospectiveResidualsUsed:false,
    coverageGuarantee:false,productionPromoted:false,
    meaning:'Immutable calibration block only. This is not a forecast issuance, a coverage guarantee or a production promotion.'};
  return {id:await forecastHash(body),...body};
}

export async function verifyEthereumProspectivePagedCalibrationFreeze(freeze,input={}){
  only(input,['source'],['source']);
  if(freeze?.schemaVersion!==1||freeze.kind!=='ethereum-prospective-paged-calibration-freeze'||!HEX.test(freeze.id))
    throw new TypeError('Immutable paged prospective calibration freeze required');
  const captured=copy(freeze),source=input.source;
  // A complete retained manifest, never a caller-selected list of IDs, defines
  // the original inventory. Its raw bytes are read and authenticated again.
  const original=await openEthereumProspectiveArchiveSourceAtManifest(source,captured.archiveManifestId),
    originalInfo=ethereumProspectiveArchiveSourceInfo(original),bound=binding(captured.readiness?.binding),
    at=normalizeForecastTimestamp(captured.readiness?.informationCutoffAt,'informationCutoffAt'),
    recordIds=new Set(originalInfo.recordIds),observationIds=new Set(originalInfo.observationIds);
  await visitEthereumProspectiveArchiveRecords(source,async record=>{
    if(!recordIds.has(record.id)&&matches(record,bound)&&normalizeForecastTimestamp(record.issuedAt,'issuedAt')<=at)
      throw new Error('A cutoff-visible same-bound record is omitted from the frozen inventory');
  });
  await visitEthereumProspectiveArchiveObservations(source,async snapshot=>{
    if(!observationIds.has(snapshot.id)&&collectedAt(snapshot)<=at)
      throw new Error('A cutoff-visible observation is omitted from the frozen inventory');
  });
  const rebuilt=await createEthereumProspectivePagedCalibrationFreeze({readiness:captured.readiness,source:original,
    frozenAt:captured.frozenAt,freezeSource:captured.source});
  if(json(rebuilt)!==json(captured))throw new Error('Paged prospective calibration freeze does not reproduce from its original archive evidence');
  return captured;
}
