import {assetSourceHash} from './asset-forecast-records.js';
import {normalizeForecastTimestamp} from './forecast-information-time.js';
import {parseEthArchive} from './eth-market-data.js';
import {parseEquityArchive} from './equity-market-data.js';
import {forecastPricePrefix} from './forecast-evaluation.js';

const PATHS=Object.freeze({BTCUSD:'data/btc-daily.json',ETHUSD:'data/replay-eth-ohlc.json',MSTR:'data/mstr-ohlc.json',BMNR:'data/bmnr-ohlc.json'});
export {PATHS as REPLAY_ARCHIVE_PATHS};
const MAXIMUM_BYTES=16000000;
function replayProvenance(value,retrievedAt){
  if(value===undefined)return null;
  if(value?.kind!=='verified-preserved-base-and-live-tail'||value.releaseAuthorized!==false||value.productionPromoted!==false||
    value.historicalPublicationProven!==false||!/^[a-f0-9]{64}$/.test(value.rawSha256)||!/^[a-f0-9]{64}$/.test(value.snapshotId))throw new TypeError('Invalid replay acquisition provenance');
  for(const key of ['rawPath','receiptPath'])if(typeof value[key]!=='string'||!/^research-data\/[a-zA-Z0-9._/-]+\.json$/.test(value[key])||value[key].includes('..'))throw new TypeError('Unsafe replay acquisition evidence path');
  const collectedAt=normalizeForecastTimestamp(value.collectedAt,'replay acquisition time');
  if(collectedAt<normalizeForecastTimestamp(retrievedAt,'archive retrieval time'))throw new RangeError('Replay acquisition precedes its archive source');
  return value;
}

export async function parseReplayPriceArchive(symbol,text,{archivePath=PATHS[symbol]}={}){
  if(!Object.hasOwn(PATHS,symbol))throw new RangeError('Unsupported replay price symbol');
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAXIMUM_BYTES)throw new RangeError('Replay archive exceeds its byte limit');
  const payload=JSON.parse(text);
  const provenance=replayProvenance(payload.replayProvenance,payload.retrievedAt);
  let observations,reportedAt,provider,providerUrl;
  if(symbol==='BTCUSD'){
    const last=payload.prices?.at(-1)?.[0];
    if(typeof last!=='string'||payload.meta?.sourceName!=='Coin Metrics Community API'||payload.meta?.metric!=='PriceUSD')throw new TypeError('BTC replay requires the preserved Coin Metrics PriceUSD series');
    observations=forecastPricePrefix(payload,last).map(({date,price})=>({date,price}));
    reportedAt=payload.meta.retrievedAt;provider=payload.meta.sourceName;providerUrl=payload.meta.source;
  }else{
    const archive=symbol==='ETHUSD'?parseEthArchive(payload):parseEquityArchive(payload,{symbol});
    observations=archive.candles.map(row=>({date:row.date.slice(0,10),price:row.close,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume}));
    reportedAt=provenance?.collectedAt??payload.retrievedAt??archive.retrievedAt;
    provider=archive.source;providerUrl=archive.sourceUrl??(symbol==='ETHUSD'?'https://api.exchange.coinbase.com/products/ETH-USD/candles':null);
  }
  const observedAt=normalizeForecastTimestamp(reportedAt,'archive retrieval time');
  const observedThrough=observations.at(-1)?.date;
  if(!observedThrough)throw new RangeError('Replay archive is empty');
  const sourceHash=await assetSourceHash(text);
  const source={archivePath,provider,sourceUrl:providerUrl,sourceHash,vintageId:'saved-archive:'+sourceHash,
    collectedAt:observedAt,publishedAt:null,sourceObservedThrough:observedThrough,
    collectionBasis:provenance?'replay-acquisition-receipt-reference':'saved-archive-retrieval-metadata',
    hashScope:'exact-saved-archive-utf8',historicalAvailabilityProven:false,providerAuthenticityProven:false,
    ...(provenance?{replayProvenance:provenance}:{}),
    ...(symbol==='BTCUSD'?{ohlcAvailable:false,priceMeaning:'Coin Metrics end-of-day USD price; Coinbase candles are not substituted.'}:{ohlcAvailable:true,priceMeaning:'Preserved provider daily OHLC; current archive vintage.'})};
  return {symbol,observations,observedAt,observedThrough,source};
}

async function readLimitedStream(stream,owner,{collect=false}={}){
  const reader=stream.getReader(),chunks=[];let bytes=0,cancellation=null;
  const cancel=()=>cancellation??=(reader.cancel(owner.signal.reason).catch(()=>{}));
  const aborted=()=>{void cancel();};
  owner.signal.addEventListener('abort',aborted,{once:true});
  try{
    while(true){
      owner.signal.throwIfAborted();
      const item=await reader.read();
      owner.signal.throwIfAborted();
      if(item.done)break;
      bytes+=item.value.byteLength;
      if(bytes>MAXIMUM_BYTES)throw new RangeError('Replay archive exceeds its byte limit');
      if(collect)chunks.push(item.value);
    }
    return {bytes,chunks};
  }catch(error){owner.abort(error);await cancel();throw error;}
  finally{owner.signal.removeEventListener('abort',aborted);reader.releaseLock();}
}

async function readReplayText(response,owner){
  let bytes;
  if(response.body?.getReader&&typeof response.clone==='function'&&typeof response.arrayBuffer==='function'){
    // Consume the original fetch body natively. Chromium can otherwise report
    // ERR_ABORTED after a complete manual reader drain. A clone independently
    // enforces the progressive byte budget and aborts both branches on overflow.
    const monitorBody=response.clone().body;
    const native=response.arrayBuffer(),monitor=readLimitedStream(monitorBody,owner);
    try{const [buffer]=await Promise.all([native,monitor]);bytes=new Uint8Array(buffer);}
    catch(error){owner.abort(error);await Promise.allSettled([native,monitor]);throw error;}
  }else if(response.body?.getReader){
    const read=await readLimitedStream(response.body,owner,{collect:true});
    bytes=new Uint8Array(read.bytes);let offset=0;
    for(const chunk of read.chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  }else if(typeof response.arrayBuffer==='function')bytes=new Uint8Array(await response.arrayBuffer());
  else return response.text();
  owner.signal.throwIfAborted();
  if(bytes.byteLength>MAXIMUM_BYTES)throw new RangeError('Replay archive exceeds its byte limit');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

// Injected fetch implementations must honor Fetch's supplied AbortSignal,
// including aborting an in-progress native body read.
export async function loadReplayPriceArchive(symbol,{signal,fetchImpl=globalThis.fetch,archivePath=PATHS[symbol]}={}){
  if(!Object.hasOwn(PATHS,symbol)||typeof fetchImpl!=='function')throw new TypeError('A supported replay symbol and fetch implementation are required');
  if(typeof archivePath!=='string'||!/^data\/[a-zA-Z0-9._/-]+\.json$/.test(archivePath)||archivePath.includes('..'))throw new TypeError('Replay archive path must remain within local data');
  signal?.throwIfAborted();
  const bundleNode=archivePath===PATHS[symbol]?globalThis.document?.getElementById('atlas-replay-price-archives'):null;
  if(bundleNode){
    const text=bundleNode.textContent;
    if(typeof text!=='string'||text.length>MAXIMUM_BYTES*4)throw new RangeError('Embedded replay archives exceed their byte limit');
    const bundle=JSON.parse(text),entry=bundle.archives?.[symbol];
    if(bundle.schemaVersion!==1||bundle.kind!=='atlas-replay-price-archives'||entry?.archivePath!==archivePath||
      typeof entry.sourceText!=='string'||!/^[a-f0-9]{64}$/.test(entry.sourceHash))throw new TypeError('Missing or invalid embedded replay archive: '+symbol);
    // A JSON string preserves the exact source bytes even when HTML escapes <.
    // Never replace a missing replay outcome archive with the older model input.
    const parsed=await parseReplayPriceArchive(symbol,entry.sourceText,{archivePath});
    if(parsed.source.sourceHash!==entry.sourceHash)throw new Error('Embedded replay archive hash mismatch');
    signal?.throwIfAborted();
    return parsed;
  }
  const embedded=symbol==='BTCUSD'&&archivePath===PATHS.BTCUSD?globalThis.document?.getElementById('embedded-btc-data'):null;
  if(embedded){const parsed=await parseReplayPriceArchive(symbol,embedded.textContent,{archivePath});signal?.throwIfAborted();return parsed;}
  const owner=new AbortController(),aborted=()=>owner.abort(signal.reason);
  signal?.addEventListener('abort',aborted,{once:true});
  if(signal?.aborted)aborted();
  let response;
  try{
    owner.signal.throwIfAborted();
    response=await fetchImpl(archivePath,{credentials:'omit',redirect:'error',cache:'no-cache',signal:owner.signal});
    owner.signal.throwIfAborted();
    if(!response.ok)throw new Error('Replay observations: HTTP '+response.status);
    const length=Number(response.headers?.get?.('content-length')??0);
    if(length>MAXIMUM_BYTES)throw new RangeError('Replay archive exceeds its byte limit');
    const text=await readReplayText(response,owner);
    owner.signal.throwIfAborted();
    const parsed=await parseReplayPriceArchive(symbol,text,{archivePath});
    owner.signal.throwIfAborted();return parsed;
  }catch(error){
    owner.abort(error);
    if(response?.body&&!response.body.locked)await response.body.cancel(error).catch(()=>{});
    throw error;
  }finally{signal?.removeEventListener('abort',aborted);}
}
