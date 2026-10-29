import {canonicalForecastJson} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp} from '../dist/forecast-information-time.js';
import {ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
import {ETH_PROSPECTIVE_CALIBRATION_POLICY} from './ethereum-prospective-calibration-core.mjs';

export const ETH_PROSPECTIVE_WRITE_BUDGET=Object.freeze({
  version:'eth-prospective-write-budget-1',
  maximumRecords:ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumRecords,
  maximumObservations:ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumObservations,
  maximumIndexBytes:1024*1024,
});
const P=ETH_PROSPECTIVE_WRITE_BUDGET,HEX=/^[a-f0-9]{64}$/,json=canonicalForecastJson;
const bytes=value=>Buffer.byteLength(value,'utf8');

function recordShape(record){
  if(record?.schemaVersion!==1||record.kind!=='ethereum-prospective-record'||record.recordKind!=='issued'||
    record.symbol!=='ETHUSD'||!HEX.test(record.id)||!HEX.test(record.runKey)||!HEX.test(record.snapshotId)||
    !['adaptive','pooled','warmStart'].includes(record.modelKey)||
    typeof record.model?.version!=='string'||!record.model.version.length||record.model.version.length>120||
    !HEX.test(record.model.sourceHash)||typeof record.asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(record.asOf))
    throw new TypeError('Supported original ETH record metadata required for the write budget');
  const date=new Date(record.asOf+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==record.asOf)
    throw new TypeError('Valid ETH record origin date required for the write budget');
  normalizeForecastTimestamp(record.issuedAt,'issuedAt');
}
function observationShape(snapshot){
  if(snapshot?.schemaVersion!==1||!HEX.test(snapshot.id))throw new TypeError('Immutable ETH observation identity required for the write budget');
  if(snapshot.kind==='ethereum-prospective-input')normalizeForecastTimestamp(snapshot.informationCutoffAt,'informationCutoffAt');
  else if(snapshot.kind==='atlas-asset-outcome-snapshot'&&snapshot.symbol==='ETHUSD')
    normalizeForecastTimestamp(snapshot.sourceReceipt?.collectedAt,'collectedAt');
  else throw new TypeError('Only prospective or independent ETH outcome observations fit this write budget');
}
function boundedArray(values,maximum,label){
  if(!Array.isArray(values)||values.length>maximum)throw new TypeError('Bounded '+label+' array required for the write budget');
}

/** A write-capacity check, never an immutable-evidence validator. Callers must
 * first verify the complete retained records, associated raw snapshots and
 * observations, then verify proposed additions. No ID, index or receipt from
 * this helper substitutes for those validations. All unique inputs remain in
 * the projection: overflow blocks the write instead of selecting or pruning.
 */
export function validateEthereumProspectiveWriteBudget(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>
    !['records','observations','additionalRecords','additionalObservations'].includes(key)))
    throw new TypeError('Only retained and additional records and observations are accepted by the write budget');
  const {records,observations,additionalRecords=[],additionalObservations=[]}=input;
  // Duplicate paths can describe the same immutable object in seed/build
  // directories. Bound even those supplied lists before canonicalizing them.
  for(const values of [records,additionalRecords])boundedArray(values,P.maximumRecords*2,'record');
  for(const values of [observations,additionalObservations])boundedArray(values,P.maximumObservations*4,'observation');
  const recordById=new Map(),observationById=new Map(),recordByRun=new Map();
  function retainRecords(values){
    for(const record of values){
      recordShape(record);
      const old=recordById.get(record.id),run=recordByRun.get(record.runKey);
      if(old&&old.record!==record&&json(old.record)!==json(record))throw new Error('Conflicting immutable record ID in prospective write budget');
      if(run&&run!==record.id)throw new Error('Conflicting immutable run key in prospective write budget');
      if(!old){
        if(recordById.size>=P.maximumRecords)throw new RangeError('Prospective write would exceed 2000 merged records');
        recordById.set(record.id,{record,entry:ethereumProspectiveIndexEntry(record)});
        recordByRun.set(record.runKey,record.id);
      }
    }
  }
  function retainObservations(values){
    for(const snapshot of values){
      observationShape(snapshot);
      const old=observationById.get(snapshot.id);
      if(old!==undefined&&old!==snapshot&&json(old)!==json(snapshot))throw new Error('Conflicting immutable observation ID in prospective write budget');
      if(old===undefined){
        if(observationById.size>=P.maximumObservations)throw new RangeError('Prospective write would exceed 500 merged observations');
        observationById.set(snapshot.id,snapshot);
      }
    }
  }
  retainRecords(records);retainObservations(observations);
  const existingRecords=recordById.size,existingObservations=observationById.size;
  retainRecords(additionalRecords);retainObservations(additionalObservations);
  const entries=[...recordById.values()].map(value=>Object.freeze(value.entry)).sort((a,b)=>a.id.localeCompare(b.id));
  const projectedIndex=Object.freeze({schemaVersion:1,kind:'ethereum-prospective-index',entries:Object.freeze(entries)});
  const projectedIndexText=json(projectedIndex)+'\n',projectedIndexBytes=bytes(projectedIndexText);
  if(projectedIndexBytes>P.maximumIndexBytes)throw new RangeError('Prospective write would exceed the 1 MiB candidate index');
  return Object.freeze({kind:'ethereum-prospective-write-budget',policy:P,status:'within-capacity',
    existingRecords,existingObservations,
    additionalUniqueRecords:recordById.size-existingRecords,additionalUniqueObservations:observationById.size-existingObservations,
    projectedRecords:recordById.size,projectedObservations:observationById.size,
    projectedIndex,projectedIndexText,projectedIndexBytes,
    rawEvidenceValidated:false,selectedEvidenceOmitted:false,limitsChanged:false,
    coverageGuarantee:false,releaseAuthorized:false,productionPromoted:false});
}
