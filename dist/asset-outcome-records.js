/**
 * Immutable evaluation inputs and results for already issued asset forecasts.
 * No forecast is generated here. Unknown publication times remain unknown.
 */
import {canonicalForecastJson,forecastHash} from './forecast-records.js';
import {assetSourceHash,evaluateAssetForecastRecords} from './asset-forecast-records.js';
import {normalizeForecastTimestamp,selectPriceVintages} from './forecast-information-time.js';
import {readAssetDailyRows} from './asset-daily-observations.js';
import {parseEquityArchive} from './equity-market-data.js';

export const ASSET_OUTCOME_VERSION='asset-outcome-evaluation-1';
const HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const SYMBOLS=['ETHUSD','BMNR','MSTR'];
const json=canonicalForecastJson,copy=value=>JSON.parse(json(value));
const marketFor=symbol=>{if(!SYMBOLS.includes(symbol))throw new RangeError('Unsupported outcome symbol');return symbol==='ETHUSD'?'crypto':'equity';};

/** Parse exact retained provider archive bytes; no interpolation or recency gate. */
export function readAssetOutcomePrices(symbol,sourceDocument){
  marketFor(symbol);
  if(typeof sourceDocument!=='string'||sourceDocument.length===0||sourceDocument.length>16000000)throw new TypeError('A bounded original outcome source document is required');
  if(new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(sourceDocument))!==sourceDocument)throw new TypeError('Outcome source is not lossless UTF-8');
  let parsed;try{parsed=JSON.parse(sourceDocument);}catch{throw new TypeError('Outcome source must be an original JSON price archive');}
  let prices;
  if(symbol==='ETHUSD'){
    const daily=parsed.dailyHistory??parsed;
    if(parsed.source!=='Coinbase Exchange'||parsed.product!=='ETH-USD'||daily.source!=='Coinbase Exchange'||daily.product!=='ETH-USD'||daily.completedOnly!==true||parsed.completedOnly===false)throw new TypeError('Outcome source must identify completed Coinbase ETH-USD observations');
    const raw=daily.candles,last=raw?.at(-1),label=Array.isArray(last)?last[0]:last?.date;
    if(typeof label!=='string')throw new TypeError('Outcome source has no terminal ETH close');
    prices=readAssetDailyRows(parsed,'ETH',label.slice(0,10)).map(row=>[row.date,row.price]);
  }else{
    prices=parseEquityArchive(parsed,{symbol,interval:'daily'}).candles.map(row=>[row.date.slice(0,10),row.close]);
  }
  if(!prices.length||prices.length>100000)throw new RangeError('Outcome source observation count is outside the bound');
  return prices;
}
async function address(value,kind){
  if(value?.schemaVersion!==1||value.kind!==kind||!HEX.test(value.id))throw new TypeError('Invalid '+kind);
  const {id,...body}=value;
  if(await forecastHash(body)!==id)throw new Error(kind+' content hash mismatch');
}

/** Each distinct acquisition receipt has its own vintage ID. Collectors may
 * reuse an older verified receipt for byte-identical data without backdating it. */
export async function createAssetOutcomeSnapshot({symbol,sourceDocument,sourceUrl,publishedAt=null,collectedAt}={}){
  const market=marketFor(symbol),prices=readAssetOutcomePrices(symbol,sourceDocument);
  const captured=normalizeForecastTimestamp(collectedAt,'collectedAt');
  const published=publishedAt===null?null:normalizeForecastTimestamp(publishedAt,'publishedAt');
  sourceUrl=new URL(sourceUrl).href;
  const sourceHash=await assetSourceHash(sourceDocument);
  const vintageId='outcome:'+await forecastHash({symbol,sourceHash,sourceUrl,publishedAt:published,collectedAt:captured});
  const [date,price]=prices.at(-1);
  const sourceReceipt=selectPriceVintages([{date,price,sourceHash,sourceUrl,publishedAt:published,collectedAt:captured,vintageId,sourceObservedThrough:date}],{
    symbol,market,informationCutoffAt:captured,
  }).rows[0];
  if(!sourceReceipt)throw new RangeError('Outcome source had not completed by its actual collection');
  const body={schemaVersion:1,kind:'atlas-asset-outcome-snapshot',symbol,market,
    observedFrom:prices[0][0],observedThrough:date,observationCount:prices.length,
    priceRowsHash:await forecastHash(prices),sourceReceipt,sourceDocument,
    historicalPublicationProven:false,productionAdopted:false};
  return {id:await forecastHash(body),...body};
}
export async function verifyAssetOutcomeSnapshot(snapshot){
  await address(snapshot,'atlas-asset-outcome-snapshot');
  const expected=await createAssetOutcomeSnapshot({symbol:snapshot.symbol,sourceDocument:snapshot.sourceDocument,
    sourceUrl:snapshot.sourceReceipt?.sourceUrl,publishedAt:snapshot.sourceReceipt?.publishedAt,collectedAt:snapshot.sourceReceipt?.collectedAt});
  if(json(expected)!==json(snapshot))throw new Error('Outcome snapshot metadata or raw-source binding mismatch');
  return snapshot;
}
async function evaluatorIdentity(evaluator){
  if(evaluator?.version!==ASSET_OUTCOME_VERSION||!COMMIT.test(evaluator.sourceCommit)||!HEX.test(evaluator.sourceHash)||!evaluator.files||Array.isArray(evaluator.files)||!Object.keys(evaluator.files).length)throw new TypeError('Committed outcome evaluator identity is required');
  for(const [path,hash]of Object.entries(evaluator.files))if(!/^dist\/[a-zA-Z0-9._/-]+\.js$/.test(path)||path.includes('..')||!HEX.test(hash))throw new TypeError('Invalid outcome evaluator file identity');
  if(await forecastHash(evaluator.files)!==evaluator.sourceHash)throw new Error('Outcome evaluator source hash mismatch');
  return copy(evaluator);
}

/** Re-evaluate unchanged issued records with separately preserved observations. */
export async function createAssetOutcomeEvaluation({records,observationSnapshots=[],evaluatedAt,evaluator,acquisitionFailures=[]}={}){
  const at=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt'),identity=await evaluatorIdentity(evaluator);
  if(!Array.isArray(records)||records.length>50000||new Set(records.map(r=>r.id)).size!==records.length)throw new TypeError('Unique bounded preserved forecast records are required');
  if(!Array.isArray(observationSnapshots)||observationSnapshots.length>1000||new Set(observationSnapshots.map(s=>s.id)).size!==observationSnapshots.length)throw new TypeError('Unique bounded outcome snapshots are required');
  if(!Array.isArray(acquisitionFailures)||acquisitionFailures.length>SYMBOLS.length)throw new TypeError('Bounded per-asset acquisition failures are required');
  const failures=acquisitionFailures.map(row=>{
    marketFor(row?.symbol);
    if(typeof row.reason!=='string'||!row.reason.trim()||row.reason.length>800)throw new TypeError('An acquisition failure needs a bounded reason');
    return {symbol:row.symbol,reason:row.reason};
  }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  if(new Set(failures.map(row=>row.symbol)).size!==failures.length)throw new RangeError('Duplicate asset acquisition failure');
  const ordered=[...records].sort((a,b)=>a.id.localeCompare(b.id)),observations=Object.fromEntries(SYMBOLS.map(s=>[s,[]]));
  const needed=Object.fromEntries(SYMBOLS.map(symbol=>[symbol,new Set(ordered.filter(r=>r.symbol===symbol).flatMap(r=>r.targets.map(t=>t.targetDate)))]));
  const snapshotByVintage=new Map();
  for(const snapshot of observationSnapshots){
    await verifyAssetOutcomeSnapshot(snapshot);
    const receipt=snapshot.sourceReceipt,key=snapshot.symbol+':'+receipt.vintageId;
    if(snapshotByVintage.has(key))throw new Error('Conflicting outcome acquisition identity');
    snapshotByVintage.set(key,snapshot);
    for(const [date,price]of readAssetOutcomePrices(snapshot.symbol,snapshot.sourceDocument)){
      if(!needed[snapshot.symbol].has(date))continue;
      observations[snapshot.symbol].push({date,price,vintageId:receipt.vintageId,
        sourceHash:receipt.sourceHash,sourceUrl:receipt.sourceUrl,publishedAt:receipt.publishedAt,
        collectedAt:receipt.collectedAt,sourceObservedThrough:snapshot.observedThrough});
    }
  }
  const selected=Object.fromEntries(SYMBOLS.map(symbol=>[symbol,new Map(selectPriceVintages(observations[symbol],{
    symbol,market:marketFor(symbol),informationCutoffAt:at,
  }).rows.map(row=>[row.date,row]))]));
  const result=await evaluateAssetForecastRecords(ordered,observations,{evaluatedAt:at});
  const rows=result.rows.map(row=>{
    if(row.actual===null)return {...row,actualSource:null};
    const value=selected[row.symbol].get(row.targetDate),snapshot=snapshotByVintage.get(row.symbol+':'+value.vintageId);
    if(!snapshot||value.price!==row.actual||value.vintageId!==row.actualVintage)throw new Error('Evaluation does not match its selected retained outcome');
    return {...row,actualSource:{snapshotId:snapshot.id,vintageId:value.vintageId,
      sourceHash:value.sourceHash,sourceUrl:value.sourceUrl,eventAt:value.eventAt,
      sourceObservedThrough:value.sourceObservedThrough,sourceEventAt:value.sourceEventAt,
      publishedAt:value.publishedAt,collectedAt:value.collectedAt,availabilityBasis:value.availabilityBasis}};
  });
  const body={schemaVersion:1,kind:'atlas-asset-outcome-evaluation',version:ASSET_OUTCOME_VERSION,evaluatedAt:at,
    recordIds:ordered.map(r=>r.id),observationSnapshotIds:observationSnapshots.map(s=>s.id).sort(),
    evaluator:identity,acquisitionFailures:failures,
    result:{...result,rows,missingObservationTargets:rows.filter(r=>r.status==='missing-observation').length,
      retrospectiveTargets:rows.filter(r=>r.status==='retrospective').length},
    forecastRecordsChanged:false,productionAdopted:false,
    scope:'Independent evaluation of preserved research forecasts. Actual selected outcomes bind exact raw bytes and acquisition clocks. Later revisions create new evaluation identities; prior evaluations remain immutable. Snapshot inventory may include later receipts that the cutoff excludes.'};
  return {id:await forecastHash(body),...body};
}
export async function verifyAssetOutcomeEvaluation(evaluation,records,snapshots){
  await address(evaluation,'atlas-asset-outcome-evaluation');
  const suppliedRecords=evaluation.recordIds.map(id=>{const r=records[id];if(!r)throw new Error('Missing referenced forecast record');return r;});
  const suppliedSnapshots=evaluation.observationSnapshotIds.map(id=>{const s=snapshots[id];if(!s)throw new Error('Missing referenced outcome snapshot');return s;});
  const expected=await createAssetOutcomeEvaluation({records:suppliedRecords,observationSnapshots:suppliedSnapshots,
    evaluatedAt:evaluation.evaluatedAt,evaluator:evaluation.evaluator,acquisitionFailures:evaluation.acquisitionFailures});
  if(json(expected)!==json(evaluation))throw new Error('Outcome evaluation does not replay exactly');
  return evaluation;
}
export function assetOutcomeSnapshotEntry(snapshot){
  return {id:snapshot.id,symbol:snapshot.symbol,collectedAt:snapshot.sourceReceipt.collectedAt,
    sourceHash:snapshot.sourceReceipt.sourceHash,path:'observations/'+snapshot.id+'.json'};
}
export function assetOutcomeEvaluationEntry(evaluation){
  return {id:evaluation.id,evaluatedAt:evaluation.evaluatedAt,path:'evaluations/'+evaluation.id+'.json'};
}
export function validateAssetOutcomeIndex(index){
  if(index?.schemaVersion!==1||index.kind!=='atlas-asset-outcome-index'||!Array.isArray(index.observations)||!Array.isArray(index.evaluations)||index.observations.length>1000||index.evaluations.length>10000)throw new TypeError('Invalid asset outcome index');
  for(const [kind,items]of [['observations',index.observations],['evaluations',index.evaluations]]){
    const ids=new Set();
    for(const item of items){
      if(!HEX.test(item.id)||ids.has(item.id)||item.path!==kind+'/'+item.id+'.json')throw new RangeError('Invalid or duplicate outcome index path');
      ids.add(item.id);normalizeForecastTimestamp(kind==='observations'?item.collectedAt:item.evaluatedAt);
      if(kind==='observations'){marketFor(item.symbol);if(!HEX.test(item.sourceHash))throw new TypeError('Invalid outcome source hash');}
    }
  }
  const latest=[...index.evaluations].sort((a,b)=>a.evaluatedAt.localeCompare(b.evaluatedAt)||a.id.localeCompare(b.id)).at(-1)?.id??null;
  if(index.latestEvaluationId!==latest)throw new RangeError('Outcome latest pointer does not match the indexed history');
  return index;
}
export async function verifyAssetOutcomeArchive(index,snapshots,evaluations,records){
  validateAssetOutcomeIndex(index);
  const indexedSnapshotIds=new Set(index.observations.map(entry=>entry.id));
  for(const entry of index.observations){
    const snapshot=snapshots[entry.id];await verifyAssetOutcomeSnapshot(snapshot);
    if(json(assetOutcomeSnapshotEntry(snapshot))!==json(entry))throw new Error('Outcome snapshot index mismatch');
  }
  for(const entry of index.evaluations){
    const evaluation=evaluations[entry.id];
    if(!Array.isArray(evaluation?.observationSnapshotIds)||evaluation.observationSnapshotIds.some(id=>!indexedSnapshotIds.has(id)))throw new Error('Outcome evaluation references an unindexed snapshot');
    await verifyAssetOutcomeEvaluation(evaluation,records,snapshots);
    if(json(assetOutcomeEvaluationEntry(evaluation))!==json(entry))throw new Error('Outcome evaluation index mismatch');
  }
  return {status:'verified',observations:index.observations.length,evaluations:index.evaluations.length,forecastRecordsChanged:false};
}
