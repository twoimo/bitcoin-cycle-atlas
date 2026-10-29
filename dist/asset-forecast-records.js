import {canonicalForecastJson,forecastHash} from './forecast-records.js';
import {buildIndependentBenchmarks,FORECAST_HORIZONS,absoluteLogError} from './forecast-evaluation.js';
import {parseDay,isEquitySession,sessionCloseUtc} from './data-freshness.js';
import {verifyForecastInformationClock,requireForecastInput,normalizeForecastTimestamp,selectPriceVintages} from './forecast-information-time.js';
import {readAssetDailyRows} from './asset-daily-observations.js';
import {parseEquityArchive} from './equity-market-data.js';

export const ASSET_FORECAST_SCHEMA=1;
export const ASSET_FORECAST_COLUMNS=Object.freeze(['date','price','lower','upper','baselinePrice']);
const HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/,DAY=86400000;
const marketFor=symbol=>{if(!['ETHUSD','BMNR','MSTR'].includes(symbol))throw new RangeError('Separate asset ledger supports ETHUSD, BMNR or MSTR');return symbol==='ETHUSD'?'crypto':'equity';};
const isoDay=time=>new Date(time).toISOString().slice(0,10);
const copy=value=>JSON.parse(canonicalForecastJson(value));
const positive=value=>Number.isFinite(value)&&value>0;

export async function assetSourceHash(text) {
  if(typeof text!=='string')throw new TypeError('Source text must preserve its UTF-8 content');
  if(!globalThis.crypto?.subtle)throw new Error('SHA-256 is unavailable');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function priceRows(input,asOf,market) {
  if(!Array.isArray(input)||!input.length||input.length>100000)throw new TypeError('A bounded primary price prefix is required');
  let prior='';
  const rows=input.map(row=>{
    if(!Array.isArray(row)||row.length!==2)throw new TypeError('Primary prices require [date,price]');
    parseDay(row[0]);
    if(row[0]<=prior||row[0]>asOf||!positive(row[1]))throw new RangeError('Primary prices must be ordered, positive and no later than asOf');
    if(market==='equity'&&isEquitySession(row[0])===false)throw new RangeError('Primary price occurs on a closed equity session');
    prior=row[0];return [...row];
  });
  if(rows.at(-1)[0]!==asOf)throw new RangeError('Primary price prefix must end at the exact origin');
  return rows;
}
export function latestCompletedAssetDate(at,market='crypto') {
  const timestamp=normalizeForecastTimestamp(at),time=Date.parse(timestamp),today=parseDay(timestamp.slice(0,10));
  if(market==='crypto')return isoDay(today-DAY);
  if(market!=='equity')throw new RangeError('Unknown asset market');
  for(let offset=0;offset<15;offset++){
    const candidate=isoDay(today-offset*DAY),session=isEquitySession(candidate);
    if(session===null)throw new RangeError('Equity freshness is outside the reviewed calendar');
    if(session&&Date.parse(sessionCloseUtc(candidate,'equity'))<=time)return candidate;
  }
  throw new RangeError('No completed equity session in the bounded search');
}
function targetDate(asOf,horizonDays,market){
  let candidate=isoDay(parseDay(asOf)+horizonDays*DAY);
  if(market==='crypto')return candidate;
  for(let offset=0;offset<8;offset++){
    const at=isoDay(parseDay(candidate)+offset*DAY),session=isEquitySession(at);
    if(session===null)throw new RangeError('Target is outside the reviewed equity calendar');
    if(session)return at;
  }
  throw new RangeError('No equity target session in the bounded search');
}
async function address(value,kind){
  if(!value||value.schemaVersion!==ASSET_FORECAST_SCHEMA||value.kind!==kind||!HEX.test(value.id))throw new TypeError('Invalid '+kind);
  const{id,...body}=value;
  if(await forecastHash(body)!==id)throw new Error(kind+' content hash mismatch');
}
async function verifySources(inputs,clock){
  if(!inputs.sourceDocuments||typeof inputs.sourceDocuments!=='object'||Array.isArray(inputs.sourceDocuments))throw new TypeError('Full sourceDocuments keyed by receipt id are required');
  const ids=Object.keys(inputs.sourceDocuments);
  if(ids.length!==clock.inputs.length)throw new RangeError('Every preserved source document must have exactly one receipt');
  for(const receipt of clock.inputs){
    if(typeof inputs.sourceDocuments[receipt.id]!=='string'||await assetSourceHash(inputs.sourceDocuments[receipt.id])!==receipt.sourceHash)throw new Error('Preserved input source hash mismatch: '+receipt.id);
  }
}
function sourcePricePrefix(inputs,receipt) {
  let parsed;
  try { parsed=JSON.parse(inputs.sourceDocuments[receipt.id]); }
  catch { throw new TypeError('Price source document must be the original JSON archive'); }
  let full;
  if(receipt.kind==='equity-session') {
    full=parseEquityArchive(parsed,{symbol:receipt.symbol,interval:'daily'}).candles.map(row=>[row.date.slice(0,10),row.close]);
  } else {
    const asset=receipt.symbol==='ETHUSD'?'ETH':'BTC';
    const daily=parsed?.dailyHistory??parsed;
    if(asset==='ETH'&&(parsed?.source!=='Coinbase Exchange'||parsed?.product!=='ETH-USD'||daily?.source!=='Coinbase Exchange'||daily?.product!=='ETH-USD'||daily?.completedOnly!==true||parsed?.completedOnly===false))throw new TypeError('ETH source must be the completed Coinbase ETH-USD archive');
    if(asset==='BTC'&&parsed?.meta?.metric!=='PriceUSD')throw new TypeError('BTC source must identify the PriceUSD metric');
    full=readAssetDailyRows(parsed,asset,receipt.sourceObservedThrough).map(row=>[row.date,row.price]);
    const raw=asset==='ETH'?(parsed.dailyHistory?.candles??parsed.candles):parsed.prices;
    if(!Array.isArray(raw)||!raw.length)throw new TypeError('Missing raw source observations');
    const label=Array.isArray(raw.at(-1))?raw.at(-1)[0]:raw.at(-1)?.date;
    if(typeof label!=='string'||label.slice(0,10)!==receipt.sourceObservedThrough)throw new RangeError('Full source coverage differs from its receipt');
  }
  if(full.at(-1)?.[0]!==receipt.sourceObservedThrough)throw new RangeError('Full source coverage differs from its receipt');
  const prefix=full.filter(row=>row[0]<=receipt.asOf);
  if(prefix.at(-1)?.[0]!==receipt.asOf)throw new RangeError('Source has no exact consumed origin');
  return prefix;
}
function verifyConsumedPrices(inputs,clock,symbol,asOf) {
  const market=marketFor(symbol);
  const primary=requireForecastInput(clock,{kind:market==='crypto'?'crypto-daily':'equity-session',symbol,asOf});
  if(canonicalForecastJson(sourcePricePrefix(inputs,primary))!==canonicalForecastJson(inputs.primaryPrices))throw new Error('Primary price prefix differs from the preserved raw source');
  if(market==='equity') {
    const underlying=requireForecastInput(clock,{kind:'crypto-daily',symbol:symbol==='BMNR'?'ETHUSD':'BTCUSD',asOf});
    if(!Array.isArray(inputs.underlyingPrices)||canonicalForecastJson(sourcePricePrefix(inputs,underlying))!==canonicalForecastJson(inputs.underlyingPrices))throw new Error('Underlying price prefix differs from the preserved raw source');
  }
}
export async function createAssetForecastSnapshot({symbol,asOf,informationClock,inputs}={}){
  const market=marketFor(symbol);parseDay(asOf);verifyForecastInformationClock(informationClock);
  if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw new TypeError('Complete input documents are required');
  const normalized=copy(inputs);normalized.primaryPrices=priceRows(normalized.primaryPrices,asOf,market);
  requireForecastInput(informationClock,{kind:market==='crypto'?'crypto-daily':'equity-session',symbol,asOf});
  if(symbol!=='ETHUSD'){
    requireForecastInput(informationClock,{kind:'document',id:'treasury-research'});
    if(!informationClock.inputs.some(row=>row.kind==='crypto-daily'&&row.symbol===(symbol==='BMNR'?'ETHUSD':'BTCUSD')))throw new RangeError('Treasury requires its underlying crypto receipt');
  }
  await verifySources(normalized,informationClock);
  verifyConsumedPrices(normalized,informationClock,symbol,asOf);
  const dataHash=await forecastHash({symbol,asOf,inputs:normalized});
  const body={schemaVersion:ASSET_FORECAST_SCHEMA,kind:'atlas-asset-forecast-snapshot',symbol,market,asOf,
    eventAt:sessionCloseUtc(asOf,market),informationClock:copy(informationClock),inputs:normalized,dataHash,
    historicalVintagesProven:false,publisherTimestampsMayBeUnknown:true};
  return {id:await forecastHash(body),...body};
}
export async function verifyAssetForecastSnapshot(snapshot){
  await address(snapshot,'atlas-asset-forecast-snapshot');
  const regenerated=await createAssetForecastSnapshot(snapshot);
  if(canonicalForecastJson(regenerated)!==canonicalForecastJson(snapshot))throw new Error('Asset snapshot metadata mismatch');
  return snapshot;
}
async function modelIdentity(model){
  if(!model||typeof model.version!=='string'||!model.version.trim()||!COMMIT.test(model.sourceCommit)||!HEX.test(model.sourceHash)||!model.files||!Object.keys(model.files).length)throw new TypeError('Committed model identity is required');
  for(const[path,hash]of Object.entries(model.files))if(!/^dist\/[a-zA-Z0-9._/-]+\.js$/.test(path)||path.includes('..')||!HEX.test(hash))throw new TypeError('Invalid model source file');
  if(await forecastHash(model.files)!==model.sourceHash)throw new Error('Model source hash mismatch');
  return copy(model);
}
function compactAssetPath(assetPath){
  if(assetPath===undefined||assetPath===null)return null;
  const {path,...metadata}=assetPath;
  return copy(metadata);
}
function anchorMatches(actual,observed){
  return Number.isFinite(actual)&&positive(observed)&&Math.abs(actual-observed)<=8*Number.EPSILON*Math.max(1,Math.abs(observed));
}
function normalizedOutput(forecast,snapshot){
  if(forecast?.asOf!==snapshot.asOf||forecast?.symbol!==snapshot.symbol||!forecast?.scenario?.id||!forecast?.scenario?.label)throw new RangeError('Forecast identity does not match the asset snapshot');
  if(forecast.probability!==undefined&&forecast.probability!==null||forecast.calibrated===true)throw new RangeError('Research ledger accepts conditional scenarios, not asserted calibrated probabilities');
  if(!Array.isArray(forecast.path)||forecast.path.length<2||forecast.path.length>20000)throw new TypeError('Complete bounded daily forecast path is required');
  const origin=parseDay(snapshot.asOf),path=forecast.path.map((point,index)=>{
    const price=point.price,lower=point.lower??point.low,upper=point.upper??point.high,baselinePrice=point.baselinePrice??null;
    if(point.date!==isoDay(origin+index*DAY))throw new RangeError('Asset forecast path must contain consecutive calendar dates');
    if(![price,lower,upper].every(v=>Number.isFinite(v)&&v>=0)||lower>price||price>upper||snapshot.market==='crypto'&&price===0||baselinePrice!==null&&!positive(baselinePrice))throw new RangeError('Invalid conditional asset path price or envelope');
    return [point.date,price,lower,upper,baselinePrice];
  });
  const observedAnchorPrice=snapshot.inputs.primaryPrices.at(-1)[1];
  if(!anchorMatches(path[0][1],observedAnchorPrice)||path.at(-1)[0]!==forecast.displayEnd)throw new RangeError('Forecast anchor or end differs from the preserved input');
  return {columns:[...ASSET_FORECAST_COLUMNS],path,displayEnd:forecast.displayEnd,observedAnchorPrice,anchorRoundoff:path[0][1]-observedAnchorPrice,probability:null,calibrated:false,
    bandMeaning:'Min/max of declared conditional scenarios; not a prediction interval',
    metadata:{modelReviewedAt:forecast.modelReviewedAt??null,financialAsOf:forecast.financialAsOf??null,coinAnchor:forecast.coinAnchor??null,
      training:forecast.training??null,assumptions:forecast.assumptions??null,assetPath:compactAssetPath(forecast.assetPath),warnings:forecast.warnings??[]}};
}
function benchmarkTargets(snapshot,output,horizons){
  if(!Array.isArray(horizons)||!horizons.length||new Set(horizons).size!==horizons.length)throw new TypeError('Unique target horizons are required');
  const origin=parseDay(snapshot.asOf),dates=horizons.map(h=>{
    if(!Number.isSafeInteger(h)||h<1||h>3650)throw new RangeError('Invalid target horizon');
    const date=targetDate(snapshot.asOf,h,snapshot.market);return {horizonDays:h,targetDate:date,effectiveCalendarDays:(parseDay(date)-origin)/DAY};
  });
  const baselines=buildIndependentBenchmarks(snapshot.inputs.primaryPrices,{asOf:snapshot.asOf,horizons:[...new Set(dates.map(x=>x.effectiveCalendarDays))]});
  const rows=new Map(output.path.map(row=>[row[0],row]));
  const targets=dates.map(item=>{
    const row=rows.get(item.targetDate),baseline=baselines.targets.find(x=>x.horizonDays===item.effectiveCalendarDays);
    if(!row)throw new RangeError('Forecast does not cover the target observation date');
    return {...item,eventAt:sessionCloseUtc(item.targetDate,snapshot.market),price:row[1],flat:baseline.flat,shrunkenTrend:baseline.shrunkenTrend};
  });
  return {targets,benchmarks:baselines};
}
function runKeyBody(record){
  return {symbol:record.symbol,recordKind:record.recordKind,snapshotDataHash:record.snapshotDataHash,modelSourceHash:record.model.sourceHash,
    modelVersion:record.model.version,options:record.options,scenario:record.scenario.id,horizons:record.targets.map(x=>x.horizonDays)};
}
export async function createAssetForecastRecord({snapshot,forecast,model,options={},recordKind='issued',replaces=null,revisionReason=null,horizons=FORECAST_HORIZONS}={}){
  await verifyAssetForecastSnapshot(snapshot);
  if(!['issued','reconstructed'].includes(recordKind))throw new RangeError('Unknown asset record kind');
  const clock=snapshot.informationClock,identity=await modelIdentity(model),output=normalizedOutput(forecast,snapshot);
  if(forecast.issuedAt!==undefined&&forecast.issuedAt!==null&&forecast.issuedAt!==clock.issuedAt)throw new RangeError('Forecast issue time conflicts with its receipt');
  if(recordKind==='issued'&&(snapshot.asOf!==latestCompletedAssetDate(clock.informationCutoffAt,snapshot.market)||snapshot.asOf!==latestCompletedAssetDate(clock.issuedAt,snapshot.market)))throw new RangeError('Issued asset forecasts require the latest completed market observation; old origins are reconstructed');
  if(replaces!==null&&(!HEX.test(replaces)||typeof revisionReason!=='string'||!revisionReason.trim()))throw new TypeError('A revision needs an immutable predecessor and reason');
  const targetData=benchmarkTargets(snapshot,output,horizons);
  if(recordKind==='issued'&&targetData.targets.some(t=>t.eventAt<=clock.issuedAt))throw new RangeError('Issued targets must still be in the future');
  const base={schemaVersion:ASSET_FORECAST_SCHEMA,kind:'atlas-asset-forecast-record',recordKind,symbol:snapshot.symbol,market:snapshot.market,asOf:snapshot.asOf,
    issuedAt:clock.issuedAt,informationCutoffAt:clock.informationCutoffAt,informationClock:copy(clock),firstPublishedAt:null,
    issuanceMeaning:'Actual research generation and immutable preservation; publication or production adoption is established separately',
    snapshotId:snapshot.id,snapshotDataHash:snapshot.dataHash,model:identity,options:copy(options),scenario:copy(forecast.scenario),
    replaces,revisionReason,targetPolicy:snapshot.market==='crypto'?'calendar-days':'first-reviewed-equity-session-on-or-after-calendar-horizon',
    ...targetData,outputHash:await forecastHash(output),output,historicalVintagesProven:false,productionAdopted:false,publicationScope:'draft-pr-research'};
  const body={...base,runKey:await forecastHash(runKeyBody(base))};
  const record={id:await forecastHash(body),...body};
  await verifyAssetForecastRecord(record,snapshot);return record;
}
export async function verifyAssetForecastRecord(record,snapshot=null){
  await address(record,'atlas-asset-forecast-record');marketFor(record.symbol);parseDay(record.asOf);
  if(record.market!==marketFor(record.symbol)||!['issued','reconstructed'].includes(record.recordKind)||!HEX.test(record.snapshotId)||!HEX.test(record.snapshotDataHash))throw new TypeError('Invalid asset record identity');
  await modelIdentity(record.model);verifyForecastInformationClock(record.informationClock);
  if(record.issuedAt!==record.informationClock.issuedAt||record.informationCutoffAt!==record.informationClock.informationCutoffAt)throw new RangeError('Asset issue time mismatch');
  requireForecastInput(record.informationClock,{kind:record.market==='crypto'?'crypto-daily':'equity-session',symbol:record.symbol,asOf:record.asOf});
  if(record.recordKind==='issued'&&(record.asOf!==latestCompletedAssetDate(record.informationCutoffAt,record.market)||record.asOf!==latestCompletedAssetDate(record.issuedAt,record.market)))throw new RangeError('Issued asset origin is stale or incomplete');
  if(record.firstPublishedAt!==null||record.productionAdopted!==false||record.historicalVintagesProven!==false||record.publicationScope!=='draft-pr-research')throw new RangeError('Research record cannot assert deployment, adoption or unproven historical vintages');
  if(record.replaces!==null&&(!HEX.test(record.replaces)||typeof record.revisionReason!=='string'||!record.revisionReason.trim()))throw new TypeError('Invalid asset revision');
  if(await forecastHash(record.output)!==record.outputHash||record.output.probability!==null||record.output.calibrated!==false||canonicalForecastJson(record.output.columns)!==canonicalForecastJson(ASSET_FORECAST_COLUMNS))throw new Error('Invalid preserved conditional asset output');
  const rows=record.output.path;
  if(!Array.isArray(rows)||rows.length<2||rows.length>20000)throw new RangeError('Invalid asset output length');
  for(let index=0;index<rows.length;index++){
    const row=rows[index];
    if(!Array.isArray(row)||row.length!==5||row[0]!==isoDay(parseDay(record.asOf)+index*DAY)||![row[1],row[2],row[3]].every(v=>Number.isFinite(v)&&v>=0)||row[2]>row[1]||row[1]>row[3]||record.market==='crypto'&&row[1]===0||row[4]!==null&&!positive(row[4]))throw new RangeError('Invalid daily asset output');
  }
  if(rows.at(-1)[0]!==record.output.displayEnd)throw new RangeError('Asset display end mismatch');
  if(!anchorMatches(rows[0][1],record.output.observedAnchorPrice)||record.output.anchorRoundoff!==rows[0][1]-record.output.observedAnchorPrice)throw new RangeError('Asset observed anchor or normalization roundoff mismatch');
  if(!Array.isArray(record.targets)||!record.targets.length||new Set(record.targets.map(t=>t.horizonDays)).size!==record.targets.length)throw new TypeError('Unique asset targets are required');
  for(const target of record.targets){
    if(!Number.isSafeInteger(target.horizonDays)||target.horizonDays<1||target.horizonDays>3650||target.targetDate!==targetDate(record.asOf,target.horizonDays,record.market)||target.eventAt!==sessionCloseUtc(target.targetDate,record.market)||target.effectiveCalendarDays!==(parseDay(target.targetDate)-parseDay(record.asOf))/DAY||!positive(target.flat)||!positive(target.shrunkenTrend)||target.price!==rows[target.effectiveCalendarDays]?.[1])throw new RangeError('Asset target differs from preserved output or calendar');
    if(record.recordKind==='issued'&&target.eventAt<=record.issuedAt)throw new RangeError('Issued asset target had already completed');
  }
  if(record.runKey!==await forecastHash(runKeyBody(record)))throw new Error('Asset run key mismatch');
  if(snapshot){
    await verifyAssetForecastSnapshot(snapshot);
    if(snapshot.id!==record.snapshotId||snapshot.dataHash!==record.snapshotDataHash||snapshot.symbol!==record.symbol||snapshot.asOf!==record.asOf||canonicalForecastJson(snapshot.informationClock)!==canonicalForecastJson(record.informationClock)||snapshot.inputs.primaryPrices.at(-1)[1]!==record.output.observedAnchorPrice)throw new Error('Asset input snapshot mismatch');
    const expected=benchmarkTargets(snapshot,record.output,record.targets.map(t=>t.horizonDays));
    if(canonicalForecastJson(expected.targets)!==canonicalForecastJson(record.targets)||canonicalForecastJson(expected.benchmarks)!==canonicalForecastJson(record.benchmarks))throw new Error('Asset benchmark mismatch');
  }
  return record;
}
export function restoreAssetForecastPath(record){
  return record.output.path.map(row=>({...Object.fromEntries(ASSET_FORECAST_COLUMNS.map((key,index)=>[key,row[index]])),kind:'preserved-conditional-path',probability:null,calibrated:false}));
}
export function assetForecastIndexEntry(record){
  return {id:record.id,runKey:record.runKey,symbol:record.symbol,asOf:record.asOf,issuedAt:record.issuedAt,informationCutoffAt:record.informationCutoffAt,
    scenario:record.scenario.id,kind:record.recordKind,modelVersion:record.model.version,sourceCommit:record.model.sourceCommit,sourceHash:record.model.sourceHash,
    snapshotId:record.snapshotId,snapshotDataHash:record.snapshotDataHash,recordPath:'records/'+record.id+'.json',snapshotPath:'snapshots/'+record.snapshotId+'.json',replaces:record.replaces};
}
export function validateAssetForecastIndex(index){
  if(index?.schemaVersion!==ASSET_FORECAST_SCHEMA||index.kind!=='atlas-asset-forecast-index'||!Array.isArray(index.entries)||index.entries.length>50000)throw new TypeError('Invalid separate asset forecast index');
  const ids=new Set(),runs=new Set();
  for(const entry of index.entries){
    marketFor(entry.symbol);parseDay(entry.asOf);normalizeForecastTimestamp(entry.issuedAt);normalizeForecastTimestamp(entry.informationCutoffAt);
    if(!HEX.test(entry.id)||!HEX.test(entry.runKey)||!HEX.test(entry.snapshotId)||!HEX.test(entry.snapshotDataHash)||!HEX.test(entry.sourceHash)||!COMMIT.test(entry.sourceCommit)||entry.recordPath!=='records/'+entry.id+'.json'||entry.snapshotPath!=='snapshots/'+entry.snapshotId+'.json')throw new TypeError('Invalid asset index identity');
    if(ids.has(entry.id)||runs.has(entry.runKey))throw new RangeError('Duplicate asset identity or run');
    ids.add(entry.id);runs.add(entry.runKey);
  }
  return index;
}
export async function evaluateAssetForecastRecords(records,observations,{evaluatedAt}={}){
  const at=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  if(!Array.isArray(records)||records.length>50000)throw new TypeError('A bounded asset record list is required');
  const selected=new Map(),rows=[];
  for(const record of records){
    await verifyAssetForecastRecord(record);
    if(record.issuedAt>at)throw new RangeError('Evaluation cannot precede actual forecast issuance');
    if(!selected.has(record.symbol))selected.set(record.symbol,new Map(selectPriceVintages(observations?.[record.symbol]??[],{symbol:record.symbol,market:record.market,informationCutoffAt:at}).rows.map(row=>[row.date,row])));
    for(const target of record.targets){
      const observation=selected.get(record.symbol).get(target.targetDate),prospective=record.recordKind==='issued'&&target.eventAt>record.issuedAt;
      const status=target.eventAt>at?'pending':!observation?'missing-observation':prospective?'scored':'retrospective';
      const actual=status==='scored'||status==='retrospective'?observation.price:null;
      rows.push({recordId:record.id,symbol:record.symbol,scenario:record.scenario.id,modelSourceHash:record.model.sourceHash,asOf:record.asOf,issuedAt:record.issuedAt,
        horizonDays:target.horizonDays,targetDate:target.targetDate,targetEventAt:target.eventAt,actualLeadDays:(Date.parse(target.eventAt)-Date.parse(record.issuedAt))/DAY,
        status,prospective,predicted:target.price,actual,actualVintage:actual===null?null:observation.vintageId,actualCollectedAt:actual===null?null:observation.collectedAt,
        errors:actual===null?null:{forecast:target.price>0?absoluteLogError(target.price,actual):null,flat:absoluteLogError(target.flat,actual),shrunkenTrend:absoluteLogError(target.shrunkenTrend,actual)},
        logErrorStatus:actual===null?'unscored':target.price===0?'zero-conditional-price-log-error-undefined':'available',probability:null});
    }
  }
  return {schemaVersion:ASSET_FORECAST_SCHEMA,kind:'atlas-asset-forecast-evaluation',evaluatedAt:at,records:records.length,
    uniqueOrigins:new Set(records.map(r=>r.symbol+':'+r.asOf)).size,scoredTargets:rows.filter(r=>r.status==='scored').length,pendingTargets:rows.filter(r=>r.status==='pending').length,
    rows,independentMarketRegimes:null,calibrated:false,scope:'Actual issue time precedes target close. Scores use observed vintages collected by evaluation time; missing/late targets are not filled. No production adoption or probability claim.'};
}

export async function verifyAssetForecastArchive(index,records,snapshots){
  validateAssetForecastIndex(index);
  if(!records||!snapshots)throw new TypeError('Complete indexed asset records and snapshots are required');
  for(const entry of index.entries){
    const record=records[entry.id],snapshot=snapshots[entry.snapshotId];
    if(!record||!snapshot)throw new Error('Missing indexed asset record or snapshot');
    await verifyAssetForecastRecord(record,snapshot);
    if(canonicalForecastJson(assetForecastIndexEntry(record))!==canonicalForecastJson(entry))throw new Error('Asset index metadata differs from its record');
    if(record.replaces!==null){
      const prior=records[record.replaces];
      if(!prior||!index.entries.some(item=>item.id===prior.id)||prior.id===record.id||prior.symbol!==record.symbol||prior.asOf!==record.asOf||prior.scenario.id!==record.scenario.id||prior.issuedAt>record.issuedAt)throw new RangeError('Asset revision must reference an earlier preserved same-origin scenario');
    }
  }
  const indexed=new Map(index.entries.map(entry=>[entry.id,records[entry.id]]));
  for(const start of indexed.values()){
    const seen=new Set();let current=start;
    while(current){
      if(seen.has(current.id))throw new RangeError('Cyclic asset revision ancestry');
      seen.add(current.id);current=current.replaces===null?null:indexed.get(current.replaces);
    }
  }
  return {records:index.entries.length,snapshots:new Set(index.entries.map(entry=>entry.snapshotId)).size,status:'verified',productionAdopted:false};
}
