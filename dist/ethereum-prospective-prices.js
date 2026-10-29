import {parseEthArchive,mergeEthArchive} from './eth-market-data.js';
import {parseCoinbaseCandles,CANDLE_DOCUMENTATION} from './ohlc-data.js';
import {canonicalForecastJson,forecastHash} from './forecast-records.js';
import {assetSourceHash,latestCompletedAssetDate} from './asset-forecast-records.js';
import {normalizeForecastTimestamp} from './forecast-information-time.js';

export const ETH_PROSPECTIVE_PRICE_POLICY=Object.freeze({
  version:'eth-prospective-price-merge-1',product:'ETH-USD',granularity:86400,
  overlapDays:7,maximumRequestDays:290,maximumCandles:300,maximumBodyBytes:2097152,
  maximumBaseBytes:4194304,maximumRequestMilliseconds:30000,maximumRequests:1,
  endpoint:'https://api.exchange.coinbase.com/products/ETH-USD/candles',
  basePath:'dist/data/eth-ohlc.json',
});
const DAY=86400,HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const json=canonicalForecastJson,bytes=text=>new TextEncoder().encode(text);
async function gitBlob(text){
  const data=bytes(text),prefix=bytes('blob '+data.length+'\0'),all=new Uint8Array(prefix.length+data.length);
  all.set(prefix);all.set(data,prefix.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',all)),x=>x.toString(16).padStart(2,'0')).join('');
}
function checkedText(text,maximum,label){
  if(typeof text!=='string'||!text.length||bytes(text).length>maximum||new TextDecoder('utf-8',{fatal:true}).decode(bytes(text))!==text)throw new TypeError('Bounded lossless UTF-8 '+label+' required');
  return text;
}
export function planEthereumResearchPriceRequest(baseText,requestStartedAt){
  checkedText(baseText,ETH_PROSPECTIVE_PRICE_POLICY.maximumBaseBytes,'base archive');
  const at=normalizeForecastTimestamp(requestStartedAt),base=parseEthArchive(JSON.parse(baseText));
  const end=Math.floor(Date.parse(at)/1000/DAY)*DAY;
  const start=Math.max(base.requestedStart,base.requestedEnd-7*DAY);
  if(end<base.requestedEnd||end<=start||end-start>290*DAY)throw new RangeError('Single-page ETH tail is stale, reversed or exceeds 290 days');
  const url=new URL(ETH_PROSPECTIVE_PRICE_POLICY.endpoint);
  url.searchParams.set('granularity','86400');url.searchParams.set('start',new Date(start*1000).toISOString());url.searchParams.set('end',new Date(end*1000).toISOString());
  return {sourceUrl:url.href,requestedStart:start,requestedEnd:end,expectedAsOf:latestCompletedAssetDate(at,'crypto'),granularity:86400};
}
export function rebuildEthereumResearchPrices({baseText,tailText,requestStartedAt,bodyCompletedAt,sourceUrl}={}){
  const began=normalizeForecastTimestamp(requestStartedAt),completed=normalizeForecastTimestamp(bodyCompletedAt);
  if(completed<began)throw new RangeError('ETH response completion precedes request');
  const request=planEthereumResearchPriceRequest(baseText,began);
  if(sourceUrl!==request.sourceUrl)throw new RangeError('ETH raw tail URL differs from the exact bounded request');
  checkedText(tailText,ETH_PROSPECTIVE_PRICE_POLICY.maximumBodyBytes,'raw tail');
  const raw=JSON.parse(tailText);
  if(!Array.isArray(raw)||raw.length>300)throw new RangeError('ETH raw tail exceeds the single-page candle contract');
  const parsed=parseCoinbaseCandles(raw,{sourceSeconds:86400,now:Date.parse(completed),start:request.requestedStart,end:request.requestedEnd});
  const count=(request.requestedEnd-request.requestedStart)/DAY;
  if(parsed.candles.length!==count||parsed.candles.some((r,i)=>r.time!==request.requestedStart+i*DAY))throw new RangeError('ETH requested tail has missing completed daily candles; no interpolation');
  if(parsed.candles.at(-1)?.date.slice(0,10)!==request.expectedAsOf)throw new RangeError('ETH tail has no exact latest completed close');
  const tail={...request,interval:'daily',seconds:86400,source:'Coinbase Exchange',product:'ETH-USD',
    baseCurrency:'ETH',quoteCurrency:'USD',completedOnly:true,retrievedAt:completed,candles:parsed.candles,
    sourceUrls:[sourceUrl],documentationUrl:CANDLE_DOCUMENTATION,firstDate:parsed.candles[0].date,
    lastDate:parsed.candles.at(-1).date,aggregation:'native'};
  const archive=mergeEthArchive(JSON.parse(baseText),tail),observations=parseEthArchive(archive).candles;
  return {archive,asOf:request.expectedAsOf,request,
    primaryPrices:observations.map(r=>[r.date.slice(0,10),r.close]),
    merge:{policy:ETH_PROSPECTIVE_PRICE_POLICY.version,includedTailCandles:parsed.candles.length,
      excludedOutOfWindow:raw.length-parsed.candles.length,missingValuesImputed:false,
      oldRowCollectionTimesPreserved:true,rawProviderRowsPreserved:true}};
}
export async function createEthereumResearchSnapshot({base,tail}={}){
  if(!base||!tail||!COMMIT.test(base.sourceCommit)||!COMMIT.test(base.gitBlobSha))throw new TypeError('Pinned Git base identity required');
  checkedText(base.text,ETH_PROSPECTIVE_PRICE_POLICY.maximumBaseBytes,'base archive');
  const collected=normalizeForecastTimestamp(base.collectedAt),began=normalizeForecastTimestamp(tail.requestStartedAt),completed=normalizeForecastTimestamp(tail.bodyCompletedAt);
  if(collected>began||Date.parse(JSON.parse(base.text).dailyHistory?.retrievedAt)>Date.parse(collected))throw new RangeError('Base acquisition clock is out of order');
  if(await gitBlob(base.text)!==base.gitBlobSha)throw new Error('Pinned base Git blob differs from actual UTF-8 bytes');
  const rebuilt=rebuildEthereumResearchPrices({baseText:base.text,tailText:tail.text,requestStartedAt:began,bodyCompletedAt:completed,sourceUrl:tail.sourceUrl});
  const baseHash=await assetSourceHash(base.text),tailHash=await assetSourceHash(tail.text),rowsHash=await forecastHash(rebuilt.primaryPrices);
  const economicInputHash=await forecastHash({baseRawSha256:baseHash,tailRawSha256:tailHash,normalizedPriceRowsHash:rowsHash,
    asOf:rebuilt.asOf,mergePolicy:ETH_PROSPECTIVE_PRICE_POLICY.version});
  const body={schemaVersion:1,kind:'ethereum-prospective-input',asOf:rebuilt.asOf,
    eventAt:new Date((Date.parse(rebuilt.asOf+'T00:00:00Z')+86400000)).toISOString(),
    base:{text:base.text,sourceCommit:base.sourceCommit,gitBlobSha:base.gitBlobSha,collectedAt:collected,
      sourceUrl:'https://github.com/twoimo/bitcoin-cycle-atlas/blob/'+base.sourceCommit+'/'+ETH_PROSPECTIVE_PRICE_POLICY.basePath,
      sourceHash:baseHash,bytes:bytes(base.text).length,publishedAt:null},
    tail:{text:tail.text,requestStartedAt:began,bodyCompletedAt:completed,sourceUrl:tail.sourceUrl,
      sourceHash:tailHash,bytes:bytes(tail.text).length,publishedAt:null},
    request:rebuilt.request,merge:rebuilt.merge,primaryPrices:rebuilt.primaryPrices,primaryPricesHash:rowsHash,economicInputHash,
    informationCutoffAt:completed,historicalVintagesProven:false,productionAdopted:false};
  return {id:await forecastHash(body),...body};
}
export async function verifyEthereumResearchSnapshot(snapshot){
  if(snapshot?.schemaVersion!==1||snapshot.kind!=='ethereum-prospective-input'||!HEX.test(snapshot.id))throw new TypeError('Invalid Ethereum research snapshot');
  const regenerated=await createEthereumResearchSnapshot({base:snapshot.base,tail:snapshot.tail});
  if(json(regenerated)!==json(snapshot))throw new Error('Ethereum research snapshot source, prices, hash or metadata mismatch');
  return snapshot;
}
