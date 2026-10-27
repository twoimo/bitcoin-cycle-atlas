import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp,selectPriceVintages} from '../dist/forecast-information-time.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {verifyEthereumProspectiveRecord} from '../dist/ethereum-prospective-dispatch.js';
import {verifyEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {verifyAssetOutcomeSnapshot,readAssetOutcomePrices} from '../dist/asset-outcome-records.js';
import {ETH_FUTURE_CALIBRATION_CONTRACT,calibrationOrderStatistic} from './ethereum-independent-calibration-core.mjs';

/** Implements the existing prospective-only contract. A retrospective audit,
 * cached evaluation score or an unverified numeric label is never an input. */
export const ETH_PROSPECTIVE_CALIBRATION_POLICY=Object.freeze({
  version:'eth-prospective-calibration-gate-1',contractVersion:ETH_FUTURE_CALIBRATION_CONTRACT.version,
  minimumCalibrationCases:12,fixedCalibrationCases:12,alpha:.2,
  maximumRecords:2000,maximumObservations:500,
  originSelection:'Earliest actually issued record per exact-bound origin; tied revisions are incomplete',
  windowSelection:'First twelve chronological nonoverlapping matured forecast windows, before inspecting labels',
  outcomeSelection:'Latest verified actually collected outcome vintage at the fixed cutoff',
  missingSelectedSlotReplacement:false,retrospectiveErrorsAllowed:false,
  independentMarketSampleSize:null,coverageGuarantee:false,productionPromoted:false,
});
const P=ETH_PROSPECTIVE_CALIBRATION_POLICY,HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const json=canonicalForecastJson,copy=value=>JSON.parse(json(value));
const closeAt=date=>new Date((utcDay(date)+1)*86400000).toISOString();
const safeError=error=>({name:error.name,message:String(error.message).slice(0,800)});

function normalizedBinding(binding){
  if(!binding||!['adaptive','pooled','warmStart'].includes(binding.modelKey)||
    typeof binding.modelVersion!=='string'||!binding.modelVersion.length||binding.modelVersion.length>120||
    !HEX.test(binding.modelSourceHash)||![30,90,180].includes(binding.horizonDays))
    throw new TypeError('Exact candidate model, source graph and target horizon binding required');
  const options=binding.options;
  if(!options||options.horizonDays!==730||options.sampleCount!==256||options.seed!==20261027||
    Object.keys(options).sort().join(',')!=='horizonDays,sampleCount,seed')
    throw new RangeError('The exact original prospective simulation options are required');
  if(Object.keys(binding).sort().join(',')!=='horizonDays,modelKey,modelSourceHash,modelVersion,options')
    throw new TypeError('Unexpected prospective calibration binding fields');
  return copy(binding);
}
function matches(record,binding){
  return record?.modelKey===binding.modelKey&&record.model?.version===binding.modelVersion&&
    record.model?.sourceHash===binding.modelSourceHash&&json(record.options)===json(binding.options);
}
function boundedUnique(values,maximum,label){
  if(!Array.isArray(values)||values.length>maximum||values.some(value=>!HEX.test(value?.id))||
    new Set(values.map(value=>value.id)).size!==values.length)
    throw new TypeError('Unique bounded immutable '+label+' required');
}
async function verifyRecordInventory(records,snapshots){
  for(const record of records){
    if(record.kind!=='ethereum-prospective-record'||record.recordKind!=='issued')
      throw new TypeError('Only original immutable issued prospective records are accepted');
    try{await verifyEthereumProspectiveRecord(record,snapshots[record.snapshotId]);}
    catch(error){throw new Error('Invalid preserved prospective record '+record.id+': '+error.message,{cause:error});}
  }
}

async function observationRows(snapshot){
  if(snapshot.kind==='ethereum-prospective-input'){
    await verifyEthereumResearchSnapshot(snapshot);
    return {rows:snapshot.primaryPrices,receipt:{vintageId:snapshot.id,sourceHash:snapshot.primaryPricesHash,
      sourceUrl:snapshot.tail.sourceUrl,collectedAt:snapshot.informationCutoffAt,publishedAt:null,
      sourceObservedThrough:snapshot.asOf}};
  }
  if(snapshot.kind==='atlas-asset-outcome-snapshot'){
    if(snapshot.symbol!=='ETHUSD')throw new RangeError('Only ETHUSD outcomes may calibrate an ETH candidate');
    await verifyAssetOutcomeSnapshot(snapshot);
    const receipt=snapshot.sourceReceipt;
    return {rows:readAssetOutcomePrices('ETHUSD',snapshot.sourceDocument),receipt:{
      vintageId:receipt.vintageId,sourceHash:receipt.sourceHash,sourceUrl:receipt.sourceUrl,
      collectedAt:receipt.collectedAt,publishedAt:receipt.publishedAt,sourceObservedThrough:snapshot.observedThrough}};
  }
  throw new TypeError('Only preserved raw ETH observation snapshots are accepted');
}
function observationCollectedAt(snapshot){
  if(snapshot.kind==='ethereum-prospective-input')return normalizeForecastTimestamp(snapshot.informationCutoffAt);
  if(snapshot.kind==='atlas-asset-outcome-snapshot')return normalizeForecastTimestamp(snapshot.sourceReceipt?.collectedAt);
  throw new TypeError('Only preserved raw ETH observation snapshots are accepted');
}

/** Selection never reads losses. Same-origin revisions cannot inflate n or
 * replace a missing first issue. Validation failure remains in its selected
 * slot; invalid visible outcome evidence blocks the entire freeze. */
export async function buildEthereumProspectiveCalibrationReadiness({records,snapshots,observations=[],informationCutoffAt,binding}={}){
  const at=normalizeForecastTimestamp(informationCutoffAt,'informationCutoffAt'),bound=normalizedBinding(binding);
  boundedUnique(records,P.maximumRecords,'prospective records');
  boundedUnique(observations,P.maximumObservations,'outcome snapshots');
  if(!snapshots||typeof snapshots!=='object'||Array.isArray(snapshots))throw new TypeError('Preserved forecast snapshots by ID are required');
  // Identity, binding and clocks are untrusted routing inputs until the whole
  // original record and its snapshot reproduce. A changed model hash/issue
  // time must not make a bad first record disappear as another experiment or
  // a future issue and silently promote the thirteenth origin into its slot.
  await verifyRecordInventory(records,snapshots);
  const excluded=[],pending=[],matured=[];
  for(const record of records){
    if(!matches(record,bound)){excluded.push({recordId:record.id,reason:'different-experiment-binding'});continue;}
    const issuedAt=normalizeForecastTimestamp(record.issuedAt,'issuedAt');
    if(issuedAt>at){excluded.push({recordId:record.id,reason:'issued-after-cutoff'});continue;}
    utcDay(record.asOf);
    const targetDate=dateFromDay(utcDay(record.asOf)+bound.horizonDays),eventAt=closeAt(targetDate);
    const row={record,recordId:record.id,asOf:record.asOf,targetDate,eventAt,issuedAt};
    if(eventAt>at){pending.push({recordId:record.id,asOf:record.asOf,targetDate,eventAt});continue;}
    matured.push(row);
  }
  matured.sort((a,b)=>a.asOf.localeCompare(b.asOf)||a.issuedAt.localeCompare(b.issuedAt)||a.recordId.localeCompare(b.recordId));
  const origins=new Map();
  for(const row of matured){if(!origins.has(row.asOf))origins.set(row.asOf,[]);origins.get(row.asOf).push(row);}
  const disjoint=[],overlapping=[],revisions=[];
  let boundary=-Infinity;
  for(const group of origins.values()){
    const first=group[0],sameTime=group.filter(row=>row.issuedAt===first.issuedAt);
    for(const row of group.slice(1))revisions.push({recordId:row.recordId,asOf:row.asOf,firstRecordId:first.recordId});
    if(utcDay(first.asOf)<boundary){overlapping.push(first.recordId);continue;}
    boundary=utcDay(first.targetDate);
    disjoint.push({...first,tiedRecordIds:sameTime.length>1?sameTime.map(row=>row.recordId):[]});
  }
  const selected=disjoint.slice(0,P.fixedCalibrationCases),needed=new Set(selected.map(row=>row.targetDate));
  const slots=[];
  for(const row of selected){
    let forecastError=null,target=null;
    try{
      if(row.tiedRecordIds.length)throw new Error('Ambiguous equally timed same-origin prospective revisions');
      if(row.issuedAt>=row.eventAt)throw new RangeError('Prospective issue must precede its target observation end');
      target=row.record.targets.find(value=>value.horizonDays===bound.horizonDays);
      if(!target||target.targetDate!==row.targetDate||target.eventAt!==row.eventAt)
        throw new RangeError('Selected prospective target clock differs from the bound horizon');
    }catch(error){forecastError=safeError(error);}
    slots.push({recordId:row.recordId,snapshotId:row.record.snapshotId,asOf:row.asOf,
      issuedAt:row.issuedAt,firstPublishedAt:row.record.firstPublishedAt??null,
      targetDate:row.targetDate,eventAt:row.eventAt,horizonDays:bound.horizonDays,
      tiedRecordIds:row.tiedRecordIds,predicted:target?.median??null,
      status:forecastError?'invalid-forecast-evidence':'missing-observation',forecastError,
      observationId:null,actual:null,actualSource:null,absoluteLogError:null});
  }
  const prices=[],byVintage=new Map(),futureObservations=[],invalidObservations=[];
  for(const snapshot of observations){
    try{
      // The acquisition clock is part of the immutable evidence too. Verify
      // it before deciding a vintage lies beyond this cutoff.
      const {rows,receipt}=await observationRows(snapshot),collectedAt=receipt.collectedAt;
      if(collectedAt>at){futureObservations.push(snapshot.id);continue;}
      if(byVintage.has(receipt.vintageId))throw new Error('Conflicting outcome acquisition identity');
      byVintage.set(receipt.vintageId,snapshot);
      for(const [date,price]of rows)if(needed.has(date))prices.push({date,price,...receipt});
    }catch(error){invalidObservations.push({observationId:snapshot.id,...safeError(error)});}
  }
  let selectedPrices=null;
  try{selectedPrices=selectPriceVintages(prices,{symbol:'ETHUSD',market:'crypto',informationCutoffAt:at});}
  catch(error){invalidObservations.push({observationId:null,...safeError(error)});}
  const actuals=new Map(selectedPrices?.rows.map(row=>[row.date,row])??[]);
  for(const slot of slots){
    if(slot.forecastError)continue;
    const actual=actuals.get(slot.targetDate);
    if(!actual)continue;
    const snapshot=byVintage.get(actual.vintageId);
    if(!snapshot)throw new Error('Selected outcome lost its immutable snapshot binding');
    slot.observationId=snapshot.id;slot.actual=actual.price;
    slot.actualSource={vintageId:actual.vintageId,sourceHash:actual.sourceHash,sourceUrl:actual.sourceUrl,
      eventAt:actual.eventAt,sourceObservedThrough:actual.sourceObservedThrough,sourceEventAt:actual.sourceEventAt,
      publishedAt:actual.publishedAt,collectedAt:actual.collectedAt,availabilityBasis:actual.availabilityBasis};
    slot.absoluteLogError=Math.abs(Math.log(slot.predicted)-Math.log(slot.actual));
    if(!Number.isFinite(slot.absoluteLogError))throw new RangeError('Nonfinite prospective calibration residual');
    slot.status='available';
  }
  const available=slots.filter(slot=>slot.status==='available').length,complete=slots.length===P.fixedCalibrationCases;
  const status=!complete?'insufficient-calibration-cases':
    invalidObservations.length||available!==slots.length?'incomplete-calibration-block':'ready-to-freeze';
  const orderStatistic=status==='ready-to-freeze'?calibrationOrderStatistic(slots.map(slot=>slot.absoluteLogError),{alpha:P.alpha}):null;
  if(orderStatistic&&orderStatistic.status!=='available')throw new Error('Fixed prospective calibration block has an unavailable rank');
  const body={schemaVersion:1,kind:'ethereum-prospective-calibration-readiness',policy:P,binding:bound,
    informationCutoffAt:at,status,requiredCalibrationCases:P.fixedCalibrationCases,
    eligibleMaturedRecords:matured.length,uniqueMaturedOrigins:origins.size,
    disjointMaturedOrigins:disjoint.length,selectedCalibrationCases:slots.length,
    validSelectedOutcomes:available,missingSelectedOutcomes:slots.filter(slot=>slot.status==='missing-observation').length,
    invalidSelectedForecasts:slots.filter(slot=>slot.status==='invalid-forecast-evidence').length,
    slots,calibrationBoundary:slots.length?slots.at(-1).targetDate:null,
    calibrationObservationEndAt:slots.length?slots.at(-1).eventAt:null,
    orderStatistic,logRadius:orderStatistic?.logRadius??null,
    pendingRecords:pending.sort((a,b)=>a.recordId.localeCompare(b.recordId)),
    excludedRecords:excluded.sort((a,b)=>a.recordId.localeCompare(b.recordId)),
    overlappingRecordIds:overlapping.sort(),sameOriginRevisions:revisions.sort((a,b)=>a.recordId.localeCompare(b.recordId)),
    invalidObservations:invalidObservations.sort((a,b)=>String(a.observationId).localeCompare(String(b.observationId))),
    futureObservationIds:futureObservations.sort(),
    inputRecordIds:records.map(record=>record.id).sort(),inputObservationIds:observations.map(snapshot=>snapshot.id).sort(),
    existingRecordsChanged:false,retrospectiveResidualsUsed:false,actualCalibratedRecordsIssued:0,
    prospectiveCalibratedTargetsScored:0,productionPromoted:false,coverageGuarantee:false,
    historicalPublicationProven:false,actualModelExecutionAuthenticated:false,
    evidenceMeaning:'Structural replay of preserved issued records, raw outcomes and supplied acquisition clocks. Unknown publication times stay null; this does not independently authenticate historical collection, public publication or model execution.'};
  return {id:await forecastHash(body),...body};
}

function originalInputs(readiness,{records,snapshots,observations=[]}){
  boundedUnique(records,P.maximumRecords,'prospective records');
  boundedUnique(observations,P.maximumObservations,'outcome snapshots');
  const select=(ids,values,label)=>{
    if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new TypeError('Invalid frozen '+label+' inventory');
    const byId=new Map(values.map(value=>[value.id,value]));
    return ids.map(id=>{const value=byId.get(id);if(!value)throw new Error('Missing original '+label+' '+id);return value;});
  };
  return {records:select(readiness.inputRecordIds,records,'record'),snapshots,
    observations:select(readiness.inputObservationIds,observations,'observation'),
    informationCutoffAt:readiness.informationCutoffAt,binding:readiness.binding};
}
async function verifyReadiness(readiness,inputs){
  if(readiness?.schemaVersion!==1||readiness.kind!=='ethereum-prospective-calibration-readiness'||!HEX.test(readiness.id))
    throw new TypeError('Original prospective calibration readiness required');
  // Rebuild against every supplied input. Letting an untrusted readiness pick
  // its own inventory would allow it to omit the first bad outcome/origin.
  const rebuilt=await buildEthereumProspectiveCalibrationReadiness({...inputs,
    informationCutoffAt:readiness.informationCutoffAt,binding:readiness.binding});
  if(json(rebuilt)!==json(readiness))throw new Error('Readiness fields do not reproduce from original records and raw outcomes');
  return rebuilt;
}
async function checkedFreezeSource(source){
  if(!source||!COMMIT.test(source.sourceCommit)||!HEX.test(source.sourceHash)||!source.files||Array.isArray(source.files)||
    !source.files['scripts/ethereum-prospective-calibration-core.mjs'])
    throw new TypeError('Exact committed calibration freezer source required');
  for(const [path,hash]of Object.entries(source.files))if(!/^(?:dist|scripts)\/[a-zA-Z0-9._/-]+\.(?:js|mjs)$/.test(path)||path.includes('..')||!HEX.test(hash))
    throw new TypeError('Invalid calibration freezer source file');
  if(await forecastHash(source.files)!==source.sourceHash)throw new Error('Calibration freezer source graph/hash mismatch');
  return copy(source);
}

/** Caller-supplied readiness, including a recomputed hash, is insufficient:
 * reproduce its full selected block from the original immutable inputs first. */
export async function createEthereumProspectiveCalibrationFreeze({readiness,records,snapshots,observations=[],frozenAt,freezeSource}={}){
  const checked=await verifyReadiness(readiness,{records,snapshots,observations});
  if(checked.status!=='ready-to-freeze')throw new RangeError('Twelve complete same-bound prospective outcomes are required before freezing');
  const frozen=normalizeForecastTimestamp(frozenAt,'frozenAt');
  if(frozen<checked.informationCutoffAt)throw new RangeError('A calibration freeze cannot precede its actual information cutoff');
  const source=await checkedFreezeSource(freezeSource);
  const body={schemaVersion:1,kind:'ethereum-prospective-calibration-freeze',policyVersion:P.version,
    contractVersion:P.contractVersion,frozenAt:frozen,source,binding:checked.binding,
    readinessId:checked.id,readiness:checked,calibrationRecordIds:checked.slots.map(slot=>slot.recordId),
    calibrationObservationIds:checked.slots.map(slot=>slot.observationId),
    exactResiduals:checked.slots.map(slot=>slot.absoluteLogError),orderStatistic:checked.orderStatistic,
    logRadius:checked.logRadius,calibrationBoundary:checked.calibrationBoundary,
    nextOriginMustBeStrictlyAfter:checked.calibrationBoundary,
    actualCalibratedRecordsIssued:0,existingRecordsChanged:false,retrospectiveResidualsUsed:false,
    coverageGuarantee:false,productionPromoted:false,
    meaning:'Immutable calibration block only. This is not a forecast issuance, a coverage guarantee or a production promotion.'};
  return {id:await forecastHash(body),...body};
}

export async function verifyEthereumProspectiveCalibrationFreeze(freeze,{records,snapshots,observations=[]}={}){
  if(freeze?.schemaVersion!==1||freeze.kind!=='ethereum-prospective-calibration-freeze'||!HEX.test(freeze.id))
    throw new TypeError('Immutable prospective calibration freeze required');
  const original=originalInputs(freeze.readiness,{records,snapshots,observations});
  await verifyRecordInventory(records,snapshots);
  for(const snapshot of observations)await observationRows(snapshot);
  const recordIds=new Set(original.records.map(record=>record.id)),observationIds=new Set(original.observations.map(snapshot=>snapshot.id));
  for(const record of records)if(!recordIds.has(record.id)&&matches(record,freeze.readiness.binding)&&
    normalizeForecastTimestamp(record.issuedAt)<=freeze.readiness.informationCutoffAt)
    throw new Error('A cutoff-visible same-bound record is omitted from the frozen inventory');
  for(const snapshot of observations)if(!observationIds.has(snapshot.id)&&observationCollectedAt(snapshot)<=freeze.readiness.informationCutoffAt)
    throw new Error('A cutoff-visible observation is omitted from the frozen inventory');
  const rebuilt=await createEthereumProspectiveCalibrationFreeze({readiness:freeze.readiness,...original,
    frozenAt:freeze.frozenAt,freezeSource:freeze.source});
  if(json(rebuilt)!==json(freeze))throw new Error('Prospective calibration freeze does not reproduce from its original evidence');
  return freeze;
}
