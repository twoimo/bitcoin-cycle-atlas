import {createHash} from 'node:crypto';
import {ETH_PROSPECTIVE_PRICE_POLICY,planEthereumResearchPriceRequest,rebuildEthereumResearchPrices} from '../dist/ethereum-prospective-prices.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** One exact GET. Keep the timeout through EOF and abort a rejected body. */
export async function captureEthereumResearchTail({baseText,fetchImpl=globalThis.fetch,clock=()=>new Date().toISOString(),
  timeoutMs=ETH_PROSPECTIVE_PRICE_POLICY.maximumRequestMilliseconds,maximumBodyBytes=ETH_PROSPECTIVE_PRICE_POLICY.maximumBodyBytes}={}){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isSafeInteger(maximumBodyBytes)||maximumBodyBytes<1||maximumBodyBytes>2097152)throw new RangeError('Capture limits may only tighten the fixed policy');
  const started=clock(),request=planEthereumResearchPriceRequest(baseText,started),controller=new AbortController();
  const receipt={kind:'ethereum-prospective-tail-acquisition',version:1,status:'started',requestStartedAt:started,
    sourceUrl:request.sourceUrl,request,method:'GET',requests:0,retries:0,redirect:'error',credentials:'omit',
    timeoutMs,maximumBodyBytes,httpStatus:null,bodyCompletedAt:null,receivedBytes:0,completeBody:false,
    rawSha256:null,rawText:null,rawBase64:null,error:null};
  let reader=null,timer;
  try{
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('ETH raw tail timed out before complete body');controller.abort(error);reject(error);},timeoutMs);});
    await Promise.race([(async()=>{
      receipt.requests=1;
      const response=await fetchImpl(request.sourceUrl,{method:'GET',redirect:'error',credentials:'omit',signal:controller.signal,
        headers:{Accept:'application/json','User-Agent':'bitcoin-cycle-atlas-research/1.0'}});
      controller.signal.throwIfAborted();receipt.httpStatus=response.status;
      const declared=response.headers.get('content-length');
      if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maximumBodyBytes))throw new RangeError('ETH declared body exceeds byte bound');
      if(!response.body)throw new Error('ETH response has no readable body');
      reader=response.body.getReader();const parts=[];
      while(true){
        const row=await reader.read();controller.signal.throwIfAborted();
        if(row.done)break;
        receipt.receivedBytes+=row.value.byteLength;
        if(receipt.receivedBytes>maximumBodyBytes)throw new RangeError('ETH streamed body exceeds byte bound');
        parts.push(Buffer.from(row.value));
      }
      const bytes=Buffer.concat(parts);receipt.bodyCompletedAt=clock();receipt.completeBody=true;receipt.rawSha256=sha(bytes);receipt.rawBase64=bytes.toString('base64');
      receipt.rawText=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      if(!response.ok)throw new Error('ETH provider returned HTTP '+response.status);
      rebuildEthereumResearchPrices({baseText,tailText:receipt.rawText,requestStartedAt:started,bodyCompletedAt:receipt.bodyCompletedAt,sourceUrl:receipt.sourceUrl});
      receipt.status='success';
    })(),timeout]);
  }catch(error){
    controller.abort(error);receipt.status='failed';receipt.error={name:error.name,message:error.message};
    if(reader)void reader.cancel().catch(()=>{});
  }finally{clearTimeout(timer);}
  receipt.finishedAt=clock();return receipt;
}
