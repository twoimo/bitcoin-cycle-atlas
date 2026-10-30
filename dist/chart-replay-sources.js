import {parseVolumeSnapshot} from './volume-data.js';
import {assetSourceHash} from './asset-forecast-records.js';
import {loadReplayPriceArchive} from './forecast-replay-sources.js';
import {loadForecastIndex,loadForecastRecord,loadForecastSnapshot,verifyForecastRecord} from './forecast-records.js';
import {normalizeForecastTimestamp} from './forecast-information-time.js';

const MAXIMUM_BYTES=16000000;
const SYMBOLS=new Set(['BTCUSD','ETHUSD','MSTR','BMNR']);

async function withRequest({signal,timeoutMs=20000},work){
  signal?.throwIfAborted();
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new RangeError('A positive replay request timeout is required');
  const owner=new AbortController(),abort=()=>owner.abort(signal.reason);
  const timer=setTimeout(()=>owner.abort(new DOMException('리플레이 자료 확인 시간이 초과되었습니다.','TimeoutError')),timeoutMs);
  let rejectStop;
  const stopped=new Promise((_,reject)=>{rejectStop=reject;});
  const stop=()=>rejectStop(owner.signal.reason);
  owner.signal.addEventListener('abort',stop,{once:true});
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  try{return await Promise.race([Promise.resolve().then(()=>{owner.signal.throwIfAborted();return work(owner);}),stopped]);}
  catch(error){owner.abort(error);throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);owner.signal.removeEventListener('abort',stop);}
}

async function readBoundedText(response,owner,limit=MAXIMUM_BYTES){
  if(Number(response.headers?.get?.('content-length'))>limit)throw new RangeError('Replay archive exceeds its byte limit');
  let bytes;
  if(response.body?.getReader){
    // Keep the native read for Chromium transport compatibility; the clone
    // enforces the limit progressively and aborts both sides on overflow.
    const native=typeof response.clone==='function'&&typeof response.arrayBuffer==='function';
    const reader=(native?response.clone().body:response.body).getReader();
    let cancellation=null;
    const cancel=()=>cancellation??=(reader.cancel(owner.signal.reason).catch(()=>{}));
    const abort=()=>{void cancel();};
    owner.signal.addEventListener('abort',abort,{once:true});
    const collect=(async()=>{
      let length=0;const chunks=[];
      try{
        while(true){
          owner.signal.throwIfAborted();const item=await reader.read();owner.signal.throwIfAborted();
          if(item.done)break;
          length+=item.value.byteLength;
          if(length>limit)throw new RangeError('Replay archive exceeds its byte limit');
          if(!native)chunks.push(item.value);
        }
        if(native)return;
        const result=new Uint8Array(length);let offset=0;
        for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}
        return result;
      }catch(error){owner.abort(error);await cancel();throw error;}
      finally{owner.signal.removeEventListener('abort',abort);reader.releaseLock();}
    })();
    if(native){
      const read=response.arrayBuffer();
      try{const [buffer]=await Promise.all([read,collect]);bytes=new Uint8Array(buffer);}
      catch(error){owner.abort(error);await Promise.allSettled([read,collect]);throw error;}
    }else bytes=await collect;
  }else if(typeof response.arrayBuffer==='function')bytes=new Uint8Array(await response.arrayBuffer());
  else{
    const text=await response.text();owner.signal.throwIfAborted();
    if(typeof text!=='string'||text.length>limit||new TextEncoder().encode(text).byteLength>limit)throw new RangeError('Replay archive exceeds its byte limit');
    return text;
  }
  owner.signal.throwIfAborted();
  if(bytes.byteLength>limit)throw new RangeError('Replay archive exceeds its byte limit');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

// The candlestick rehearsal has its own source identity. Saved Coin Metrics
// forecasts must continue to be evaluated against their original price series.
export async function parseBitcoinReplayCandles(text,{now=Date.now()}={}) {
  if(typeof text!=='string'||text.length>MAXIMUM_BYTES||new TextEncoder().encode(text).length>MAXIMUM_BYTES)throw new RangeError('BTC 봉 자료의 크기 제한을 초과했습니다.');
  const payload=JSON.parse(text);
  if(payload.source!=='Bitstamp')throw new TypeError('BTC candle replay requires the preserved Bitstamp BTC/USD archive');
  const observedAt=normalizeForecastTimestamp(payload.retrievedAt,'BTC candle acquisition time');
  if(Date.parse(observedAt)>now)throw new RangeError('BTC candle acquisition is later than the evaluation clock');
  const archive=parseVolumeSnapshot(payload,{now});
  const sourceHash=await assetSourceHash(text);
  const observations=archive.bars.map(row=>({...row,price:row.close}));
  if(!observations.length)throw new RangeError('BTC candle replay has no completed observations');
  return {symbol:'BTCUSD',observations,observedAt,observedThrough:observations.at(-1)?.date,
    source:{archivePath:'data/btc-volume.json',provider:archive.source,sourceUrl:payload.sourceUrls[0],sourceHash,
      sourceUrls:[...payload.sourceUrls],vintageId:'saved-archive:'+sourceHash,collectedAt:observedAt,publishedAt:null,
      sourceObservedThrough:observations.at(-1)?.date,ohlcAvailable:true,
      priceMeaning:'Actual Bitstamp BTC/USD daily OHLC; current-vintage historical reconstruction.',
      historicalAvailabilityProven:false,providerAuthenticityProven:false,hashScope:'exact-saved-archive-utf8'}};
}

export async function loadChartReplayArchive(symbol,{mode='historical-reconstruction',signal,fetchImpl=globalThis.fetch,timeoutMs=20000,now=Date.now()}={}) {
  if(!SYMBOLS.has(symbol)||!['historical-reconstruction','recorded'].includes(mode)||typeof fetchImpl!=='function')throw new TypeError('A supported replay symbol, mode and fetch implementation are required');
  return withRequest({signal,timeoutMs},async owner=>{
    if(symbol!=='BTCUSD'||mode==='recorded')return loadReplayPriceArchive(symbol,{signal:owner.signal,fetchImpl});
    const embedded=globalThis.document?.getElementById('embedded-volume-data');
    let text=embedded?.textContent;
    if(!embedded){
      const response=await fetchImpl(new URL('./data/btc-volume.json',globalThis.document?.baseURI??import.meta.url),{
        credentials:'omit',redirect:'error',cache:'no-cache',signal:owner.signal});
      owner.signal.throwIfAborted();
      if(!response.ok)throw new Error('BTC 봉 자료 요청 실패 · HTTP '+response.status);
      text=await readBoundedText(response,owner);
    }
    owner.signal.throwIfAborted();
    const archive=await parseBitcoinReplayCandles(text,{now});
    owner.signal.throwIfAborted();return archive;
  });
}

export async function loadChartReplayRecord(symbol,{recordId=null,signal,fetchImpl=globalThis.fetch,baseUrl=globalThis.document?.baseURI??new URL('./',import.meta.url),timeoutMs=20000}={}) {
  if(!SYMBOLS.has(symbol)||recordId!==null&&!/^[a-f0-9]{64}$/.test(recordId)||typeof fetchImpl!=='function')throw new TypeError('A supported replay symbol and valid record identity are required');
  return withRequest({signal,timeoutMs},async owner=>{
    const fetchArchive=async(url,options)=>{
      const response=await fetchImpl(url,{...options,signal:owner.signal});owner.signal.throwIfAborted();
      return {ok:response.ok,status:response.status,headers:response.headers,
        text:()=>readBoundedText(response,owner,String(url).endsWith('/index.json')?2000000:12000000)};
    };
    if(symbol==='BTCUSD'){
    const options={signal:owner.signal,fetchImpl:fetchArchive,baseUrl:new URL('./data/forecast-ledger/',baseUrl)},index=await loadForecastIndex(options);
    owner.signal.throwIfAborted();
    const entries=[...index.entries].sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||a.id.localeCompare(b.id));
    const entry=recordId?entries.find(row=>row.id===recordId):entries.find(row=>row.scenarioId==='base'||row.scenario==='base')??entries[0];
    if(!entry)throw new Error('선택한 보존 예측이 없습니다. 과거 재구성을 선택해 주세요.');
    const [record,snapshot]=await Promise.all([loadForecastRecord(entry,options),loadForecastSnapshot(entry,options)]);
    await verifyForecastRecord(record,snapshot);owner.signal.throwIfAborted();
    return {record,snapshot,entries};
  }
  const {createAssetJournalLoader}=await import('./asset-forecast-loader.js');
  owner.signal.throwIfAborted();
  let failure=null;
  const loader=createAssetJournalLoader({baseUrl,fetchImpl:fetchArchive,timeoutMs,onState:state=>{if(state.status==='error')failure=state.message;}});
  const cancel=()=>loader.cancel();owner.signal.addEventListener('abort',cancel,{once:true});
  try{
    const value=await loader.load({symbol,recordId});
    owner.signal.throwIfAborted();
    if(!value?.record)throw new Error(failure??'이 자산의 보존 예측을 찾지 못했습니다.');
    return value;
  }finally{owner.signal.removeEventListener('abort',cancel);loader.cancel();}
  });
}
