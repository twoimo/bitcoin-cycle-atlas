import {canonicalForecastJson} from './forecast-records.js?v=1.29.0';
import {validateAssetForecastIndex,verifyAssetForecastRecord,verifyAssetForecastArchive,assetForecastIndexEntry} from './asset-forecast-records.js?v=1.29.0';

const SYMBOLS=new Set(['ETHUSD','BMNR','MSTR']);
const ROOT_PATH='data/asset-forecast-ledger/';
const same=(left,right)=>canonicalForecastJson(left)===canonicalForecastJson(right);
const aborted=()=>new DOMException('Research journal request cancelled','AbortError');

/** Fetch/verification ownership spans index, record, snapshot and timeout.
 * Abort is an optimization; generation checks also reject late ignored aborts. */
export function createAssetJournalLoader({
  baseUrl=globalThis.document?.baseURI,fetchImpl=globalThis.fetch,
  embeddedArchive=()=>globalThis.document?.getElementById('atlas-asset-forecast-ledger')?.textContent??null,
  timeoutMs=15000,setTimer=setTimeout,clearTimer=clearTimeout,onState=()=>{},
}={}){
  if(!baseUrl||typeof fetchImpl!=='function'||typeof embeddedArchive!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new TypeError('A journal base URL, fetch implementation and positive timeout are required');
  let generation=0,current=null;
  function cancel(){
    generation++;
    if(current){current.controller.abort();current.reject(aborted());clearTimer(current.timer);current=null;}
  }
  async function read(path,request,{missingIndex=false}={}){
    const response=await fetchImpl(new URL(ROOT_PATH+path,baseUrl),{
      credentials:'omit',redirect:'error',cache:'no-cache',signal:request.controller.signal,
    });
    if(!request.owned())throw aborted();
    if(missingIndex&&response.status===404)return null;
    if(!response.ok)throw new Error('자료 요청 실패 · HTTP '+response.status);
    const length=Number(response.headers?.get?.('content-length'));
    if(Number.isFinite(length)&&length>12000000)throw new Error('기록 자료의 크기 제한을 초과했습니다.');
    const text=await response.text();
    if(!request.owned())throw aborted();
    if(text.length>12000000||new TextEncoder().encode(text).byteLength>12000000)throw new Error('기록 자료의 크기 제한을 초과했습니다.');
    return JSON.parse(text);
  }
  async function load({symbol,recordId=null}={}){
    if(!SYMBOLS.has(symbol))throw new RangeError('Unknown saved-research asset');
    cancel();
    const token=generation,controller=new AbortController();
    let rejectStop;
    const stopped=new Promise((_,reject)=>{rejectStop=reject;});
    const request={controller,reject:rejectStop,timer:null,owned:()=>current===request&&generation===token};
    current=request;
    request.timer=setTimer(()=>{
      if(!request.owned())return;
      controller.abort();
      rejectStop(new Error('기록 확인 시간이 초과되었습니다. 다시 시도해 주세요.'));
    },timeoutMs);
    onState({status:'loading',symbol});
    try{
      const work=(async()=>{
        let embedded=null;
        const embeddedText=embeddedArchive();
        if(embeddedText!==null&&embeddedText!==undefined){
          if(typeof embeddedText!=='string'||embeddedText.length>64000000||new TextEncoder().encode(embeddedText).byteLength>64000000)throw new Error('내장 기록 자료의 크기 제한을 초과했습니다.');
          embedded=JSON.parse(embeddedText);
          if(embedded.schemaVersion!==1||embedded.kind!=='atlas-asset-forecast-archive')throw new Error('내장 자산 기록의 형식을 확인하지 못했습니다.');
          await verifyAssetForecastArchive(embedded.index,embedded.records,embedded.snapshots);
          if(!request.owned())throw aborted();
        }
        const raw=embedded?embedded.index:await read('index.json',request,{missingIndex:true});
        if(raw===null){
          if(recordId!==null)throw new Error('선택한 보존 기록이 현재 색인에 없습니다. 목록을 다시 열어 주세요.');
          return {status:'empty',symbol,entries:[]};
        }
        const index=validateAssetForecastIndex(raw);
        const entries=index.entries.filter(entry=>entry.symbol===symbol)
          .sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||a.scenario.localeCompare(b.scenario)||a.id.localeCompare(b.id));
        if(recordId!==null&&!entries.some(item=>item.id===recordId))throw new Error('선택한 보존 기록이 현재 색인에 없습니다. 목록을 다시 열어 주세요.');
        if(!entries.length)return {status:'empty',symbol,entries};
        const entry=recordId!==null?entries.find(item=>item.id===recordId):entries.find(item=>item.scenario==='base')||entries[0];
        const [record,snapshot]=embedded?[embedded.records[entry.id],embedded.snapshots[entry.snapshotId]]:
          await Promise.all([read(entry.recordPath,request),read(entry.snapshotPath,request)]);
        if(!request.owned())throw aborted();
        await verifyAssetForecastRecord(record,snapshot);
        if(!same(assetForecastIndexEntry(record),entry))throw new Error('색인과 보존 기록의 식별자가 다릅니다.');
        if(!request.owned())throw aborted();
        return {status:'ready',symbol,entries,record,snapshot};
      })();
      const result=await Promise.race([work,stopped]);
      if(!request.owned())return null;
      onState(result);return result;
    }catch(error){
      if(!request.owned())return null;
      controller.abort();
      onState({status:'error',symbol,message:error?.message||'보존 기록을 검증하지 못했습니다.'});
      return null;
    }finally{
      clearTimer(request.timer);
      if(request.owned())current=null;
    }
  }
  return {load,cancel};
}
