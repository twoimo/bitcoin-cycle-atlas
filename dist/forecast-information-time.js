import {parseDay, sessionCloseUtc, MARKET_CALENDAR} from './data-freshness.js';
import {canonicalForecastJson} from './forecast-records.js';

export const FORECAST_INFORMATION_VERSION = 'forecast-information-clock-1';
const HEX = /^[a-f0-9]{64}$/;
const SYMBOLS = new Set(['BTCUSD','ETHUSD','MSTR','BMNR']);

export function normalizeForecastTimestamp(value, name='timestamp') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw new TypeError(name+' must be an explicit UTC timestamp with at most millisecond precision');
  parseDay(value.slice(0,10));
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0,19)!==value.slice(0,19)) throw new RangeError(name+' is not a valid timestamp');
  return new Date(result).toISOString();
}
function nonempty(value, name) {
  if (typeof value!=='string' || !value.trim() || value.length>1024) throw new TypeError(name+' is required');
  return value;
}
function receipt(input) {
  if (!input || !['crypto-daily','equity-session','document'].includes(input.kind)) throw new TypeError('An explicit input kind is required');
  const id=nonempty(input.id,'input id'), vintageId=nonempty(input.vintageId,'vintageId');
  if (!HEX.test(input.sourceHash)) throw new TypeError('Input sourceHash must be SHA-256');
  let url; try { url=new URL(input.sourceUrl); } catch { throw new TypeError('A source URL is required'); }
  if(url.protocol!=='https:' || url.username || url.password) throw new TypeError('Input source URL must be HTTPS without credentials');
  let eventAt=null, asOf=null, symbol=null, calendar=null, sourceObservedThrough=null, sourceEventAt=null;
  if(input.kind!=='document') {
    symbol=input.symbol;
    if(!SYMBOLS.has(symbol) || (input.kind==='crypto-daily')!==['BTCUSD','ETHUSD'].includes(symbol)) throw new RangeError('Input symbol and market kind disagree');
    asOf=input.asOf; parseDay(asOf);
    eventAt=sessionCloseUtc(asOf,input.kind==='crypto-daily'?'crypto':'equity');
    if(eventAt===null) throw new RangeError('Equity close is unavailable for a holiday or unsupported calendar');
    if(input.eventAt!==undefined && input.eventAt!==null && normalizeForecastTimestamp(input.eventAt,'eventAt')!==eventAt) throw new RangeError('Input event time differs from its market close');
    sourceObservedThrough=input.sourceObservedThrough??asOf;parseDay(sourceObservedThrough);
    if(sourceObservedThrough<asOf)throw new RangeError('Consumed prefix exceeds its source archive');
    sourceEventAt=sessionCloseUtc(sourceObservedThrough,input.kind==='crypto-daily'?'crypto':'equity');
    if(sourceEventAt===null)throw new RangeError('Full source archive close is unavailable');
    calendar=input.kind==='crypto-daily'?'utc-daily':MARKET_CALENDAR.id;
  } else {
    if(input.asOf!==undefined && input.asOf!==null) {asOf=input.asOf;parseDay(asOf);}
    eventAt=input.eventAt===undefined || input.eventAt===null?null:normalizeForecastTimestamp(input.eventAt,'eventAt');
  }
  const publishedAt=input.publishedAt===undefined || input.publishedAt===null?null:normalizeForecastTimestamp(input.publishedAt,'publishedAt');
  const collectedAt=normalizeForecastTimestamp(input.collectedAt,'collectedAt');
  if(eventAt!==null && collectedAt<eventAt || sourceEventAt!==null && collectedAt<sourceEventAt || publishedAt!==null && (publishedAt>collectedAt || eventAt!==null && publishedAt<eventAt || sourceEventAt!==null && publishedAt<sourceEventAt)) throw new RangeError('Input observation, publication and collection times are out of order');
  const availabilityBasis=publishedAt===null?'collection-upper-bound':'documented-publication-and-collection';
  if(input.availabilityBasis!==undefined && input.availabilityBasis!==availabilityBasis) throw new RangeError('Availability basis conflicts with the recorded publication time');
  return {id,kind:input.kind,symbol,asOf,consumedThrough:asOf,sourceObservedThrough,eventAt,sourceEventAt,publishedAt,collectedAt,knownBy:collectedAt,availabilityBasis,vintageId,sourceHash:input.sourceHash,sourceUrl:url.href,calendar};
}

/** Actual acquisition proves only that this exact source vintage was known by
 * collectedAt. A null publisher timestamp stays null; no old observation is
 * turned into a contemporaneous historical receipt. */
export function createForecastInformationClock({issuedAt,informationCutoffAt=issuedAt,inputs}={}) {
  const issued=normalizeForecastTimestamp(issuedAt,'issuedAt'),cutoff=normalizeForecastTimestamp(informationCutoffAt,'informationCutoffAt');
  if(cutoff>issued) throw new RangeError('Information cutoff cannot follow issuance');
  if(!Array.isArray(inputs) || !inputs.length || inputs.length>1000) throw new TypeError('A bounded nonempty input receipt list is required');
  const normalized=inputs.map(receipt).sort((a,b)=>a.id.localeCompare(b.id)), ids=new Set();
  for(const input of normalized) {
    if(ids.has(input.id)) throw new RangeError('Duplicate information input id');
    ids.add(input.id);
    if(input.collectedAt>cutoff || input.eventAt!==null && input.eventAt>cutoff || input.publishedAt!==null && input.publishedAt>cutoff) throw new RangeError('Input was not known by the information cutoff');
  }
  return {version:FORECAST_INFORMATION_VERSION,issuedAt:issued,informationCutoffAt:cutoff,inputs:normalized,
    latestCollectionAt:normalized.reduce((latest,row)=>row.collectedAt>latest?row.collectedAt:latest,''),
    allPublicationTimesKnown:normalized.every(row=>row.publishedAt!==null),historicalVintagesProven:false,simultaneousPriceClaim:false,
    interpretation:'Actual source acquisition is an upper bound on availability. Unknown publisher times remain null; market close, collection, cutoff and issuance are distinct.'};
}

export function verifyForecastInformationClock(clock) {
  const expected=createForecastInformationClock(clock);
  if(canonicalForecastJson(expected)!==canonicalForecastJson(clock)) throw new Error('Information clock metadata mismatch');
  return clock;
}

export function requireForecastInput(clock,{kind,symbol,asOf,id}={}) {
  verifyForecastInformationClock(clock);
  const matching=clock.inputs.filter(row=>(kind===undefined||row.kind===kind)&&(symbol===undefined||row.symbol===symbol)&&(asOf===undefined||row.asOf===asOf)&&(id===undefined||row.id===id));
  if(matching.length!==1) throw new RangeError('Exactly one matching information receipt is required');
  return matching[0];
}

/** Select versions that this observer had actually collected at the cutoff.
 * Later corrections cannot rewrite an earlier selected vintage. The same
 * date/vintage must have exactly one value and receipt, regardless of order.
 * Every cutoff-visible collection time must also be unambiguous, including
 * older revisions that are no longer selected as the latest observation. */
export function selectPriceVintages(observations,{symbol,market='crypto',informationCutoffAt}={}) {
  const cutoff=normalizeForecastTimestamp(informationCutoffAt,'informationCutoffAt');
  if(!['crypto','equity'].includes(market) || !Array.isArray(observations) || observations.length>100000) throw new TypeError('Invalid price-vintage collection');
  const versions=new Map(),visibleTimes=new Map(),dates=new Map(); let futureVersions=0;
  for(const row of observations) {
    if(!row || !Number.isFinite(row.price) || row.price<=0) throw new RangeError('Observed prices must be positive and finite');
    const normalized=receipt({...row,id:row.id??symbol+':'+row.date+':'+row.vintageId,kind:market==='crypto'?'crypto-daily':'equity-session',symbol,asOf:row.date});
    const value={...normalized,date:row.date,price:row.price},key=row.date+'\0'+row.vintageId;
    if(versions.has(key)) {
      if(canonicalForecastJson(versions.get(key))!==canonicalForecastJson(value)) throw new RangeError('Conflicting immutable price vintage');
      continue;
    }
    versions.set(key,value);
    if(value.collectedAt>cutoff || value.eventAt>cutoff || value.publishedAt!==null && value.publishedAt>cutoff) {futureVersions++;continue;}
    const timeKey=row.date+'\0'+value.collectedAt,sameTime=visibleTimes.get(timeKey);
    if(sameTime && sameTime.vintageId!==value.vintageId && (sameTime.price!==value.price || sameTime.sourceHash!==value.sourceHash)) throw new RangeError('Ambiguous equally timed price revisions');
    if(!sameTime)visibleTimes.set(timeKey,value);
    const prior=dates.get(row.date);
    if(!prior || prior.collectedAt<value.collectedAt || prior.collectedAt===value.collectedAt && prior.vintageId.localeCompare(value.vintageId)<0) dates.set(row.date,value);
  }
  const rows=[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));
  return {symbol,market,informationCutoffAt:cutoff,rows,futureVersions,missingValuesImputed:false,selectionPolicy:'latest-actually-collected-vintage-by-date',historicalPublicationTimesProven:false};
}
