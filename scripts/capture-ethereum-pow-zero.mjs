// Optional, bounded read-only RPC capture. No wallet, secrets or transactions.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {POW_ZERO_POLICY,POW_ZERO_SOURCES,collectEthereumPowZeroCore} from './ethereum-pow-zero-core.mjs';

export const POW_ZERO_TRANSPORT=Object.freeze({maximumRpcRequests:64,requestTimeoutMs:10000,totalTimeoutMs:120000,minimumIntervalMs:500,maximumResponseBytes:2*1024*1024,maximumTotalBytes:16*1024*1024,maximumLogTransportRawBytes:4*1024*1024,retries:0,redirects:'error'});
const digest=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const message=e=>String(e?.message??e).slice(0,800);
export function createPowZeroTransport({fetchImpl=globalThis.fetch,nowMs=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),limits=POW_ZERO_TRANSPORT}={}){
  const startedMs=nowMs(),deadline=startedMs+limits.totalTimeoutMs;
  let lastRequest=-Infinity,rpcCount=0,totalBytes=0;
  const requests=[],rawFiles=[];
  async function acquire({url,method='GET',body=null,path,stage}){
    if(nowMs()>=deadline)throw new Error('Total capture deadline exceeded');
    const wait=Math.max(0,lastRequest+limits.minimumIntervalMs-nowMs());
    if(nowMs()+wait>=deadline)throw new Error('Capture deadline would be exceeded by rate limit');
    if(wait)await sleep(wait);
    if(nowMs()>=deadline)throw new Error('Total capture deadline exceeded after rate limit');
    const entry={stage,url,method,requestBody:body,startedAt:new Date(nowMs()).toISOString(),httpStatus:null,receivedBytes:0,complete:false,publishedAt:null,path:null};
    requests.push(entry);lastRequest=nowMs();
    const timeout=Math.min(limits.requestTimeoutMs,deadline-nowMs()),controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetchImpl(url,{method,redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,headers:method==='POST'?{'content-type':'application/json','accept':'application/json'}:{accept:'text/plain'},...(body===null?{}:{body})});
      entry.httpStatus=response.status;entry.responseDate=response.headers.get('date');entry.responseContentType=response.headers.get('content-type');
      if(!response.body)throw new Error('Response has no readable body');
      const declared=response.headers.get('content-length');
      if(declared!==null&&Number.isFinite(Number(declared))&&Number(declared)>limits.maximumResponseBytes)throw new Error('Declared response exceeds byte limit');
      const chunks=[];
      for await(const value of response.body){
        const chunk=Buffer.from(value);entry.receivedBytes+=chunk.length;totalBytes+=chunk.length;
        if(entry.receivedBytes>limits.maximumResponseBytes||totalBytes>limits.maximumTotalBytes){controller.abort();throw new Error('Response/capture byte limit exceeded');}
        if(nowMs()>=deadline){controller.abort();throw new Error('Total capture deadline exceeded while reading');}
        chunks.push(chunk);
      }
      const bytes=Buffer.concat(chunks);
      entry.complete=true;entry.path=path;entry.bytes=bytes.length;entry.sha256=digest(bytes);entry.receivedAt=new Date(nowMs()).toISOString();
      rawFiles.push({path,bytes,sha256:entry.sha256});
      if(!response.ok)throw new Error('HTTP '+response.status);
      if(nowMs()>=deadline)throw new Error('Total capture deadline exceeded');
      return {bytes,entry};
    }catch(error){controller.abort();entry.error=message(error);throw error;}
    finally{clearTimeout(timer);entry.finishedAt=new Date(nowMs()).toISOString();}
  }
  return {
    requests,rawFiles,
    stats:()=>({rpcRequests:rpcCount,totalReceivedBytes:totalBytes,startedAt:new Date(startedMs).toISOString(),deadlineAt:new Date(deadline).toISOString()}),
    async source(source){
      const expected=POW_ZERO_SOURCES.find(s=>s.id===source?.id);
      if(!expected||source.rawUrl!==expected.rawUrl||source.blobSha!==expected.blobSha)throw new Error('Source is not an approved immutable specification');
      const {bytes,entry}=await acquire({url:expected.rawUrl,path:'sources/'+source.id+'.raw',stage:'source:'+source.id});
      const actualBlob=blob(bytes);entry.gitBlobSha=actualBlob;
      if(actualBlob!==expected.blobSha){entry.validationError='Pinned source Git blob mismatch';throw new Error(entry.validationError);}
      entry.sourceBytesVerified=true;
      return {id:expected.id,url:expected.url,blobSha:actualBlob,bytes:bytes.length,sourceSha256:digest(bytes)};
    },
    async read(method,params){
      const allowed=method==='eth_chainId'&&Array.isArray(params)&&params.length===0||
        method==='eth_getBlockByNumber'&&Array.isArray(params)&&params.length===2&&params[1]===false&&
        (params[0]==='finalized'||typeof params[0]==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(params[0])&&BigInt(params[0])<BigInt(POW_ZERO_POLICY.maximumHeadExclusive));
      if(!allowed)throw new Error('RPC method/parameters are outside the read-only allowlist');
      if(rpcCount>=limits.maximumRpcRequests)throw new Error('RPC request budget exhausted');
      const id=++rpcCount,body=JSON.stringify({jsonrpc:'2.0',id,method,params});
      const {bytes,entry}=await acquire({url:POW_ZERO_POLICY.endpoint,method:'POST',body,path:'rpc/'+String(id).padStart(3,'0')+'.raw.json',stage:'rpc:'+method});
      try{
        const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
        if(!data||Array.isArray(data)||data.jsonrpc!=='2.0'||data.id!==id)throw new Error('Mismatched RPC envelope or response ID');
        if(Object.hasOwn(data,'error'))throw new Error('RPC error: '+message(JSON.stringify(data.error)));
        if(!Object.hasOwn(data,'result')||data.result===null)throw new Error('RPC result is missing/null');
        entry.rpcValidated=true;return data.result;
      }catch(error){entry.validationError=message(error);throw error;}
    }
  };
}
export async function captureEthereumPowZero({outputDirectory,fetchImpl=globalThis.fetch,nowMs=()=>Date.now(),sleep,sourceCommit='unknown',limits=POW_ZERO_TRANSPORT}={}){
  const transport=createPowZeroTransport({fetchImpl,nowMs,sleep,limits});
  const started=nowMs(),captureStartedAt=new Date(started).toISOString();
  const observedThrough=new Date(Math.floor(started/86400000)*86400000-86400000).toISOString().slice(0,10);
  const receipt={schemaVersion:1,kind:'eth-pow-zero-capture',status:'started',sourceCommit,policy:POW_ZERO_POLICY,transportPolicy:limits,captureStartedAt,observedThrough,observation:null,definitionMatchedPartialMetricCount:0,pointInTimeEligibleMetricCount:0,eligibleModelSnapshotCount:0,fullModelSnapshotReady:false,historicalPointInTimeReady:false,modelInputActivated:false,publishedAt:null,requests:transport.requests,rawFiles:[],providerTerms:'https://www.publicnode.com/terms',providerDataLicense:'not-asserted',sourceAccess:'pending'};
  if(outputDirectory){await mkdir(outputDirectory,{recursive:true});await writeFile(resolve(outputDirectory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');}
  try{
    const sourceManifests=[];
    for(const source of POW_ZERO_SOURCES)sourceManifests.push(await transport.source(source));
    receipt.sourceAccess='pinned-source-bytes-verified';
    receipt.observation=await collectEthereumPowZeroCore({read:transport.read,observedThrough,captureStartedAt,clock:()=>new Date(nowMs()).toISOString(),sourceManifests});
    receipt.status='partial-protocol-observation-collected';receipt.definitionMatchedPartialMetricCount=1;
  }catch(error){receipt.status='capture-failed';receipt.error=message(error);}
  receipt.finishedAt=new Date(nowMs()).toISOString();receipt.network=transport.stats();
  for(const file of transport.rawFiles){
    receipt.rawFiles.push({path:file.path,bytes:file.bytes.length,sha256:file.sha256});
    if(outputDirectory){await mkdir(resolve(outputDirectory,file.path,'..'),{recursive:true});await writeFile(resolve(outputDirectory,file.path),file.bytes);}
  }
  receipt.rawManifestSha256=digest(Buffer.from(JSON.stringify(receipt.rawFiles)));
  if(outputDirectory)await writeFile(resolve(outputDirectory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  return {receipt,rawFiles:transport.rawFiles};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const root=fileURLToPath(new URL('..',import.meta.url)),outputDirectory=resolve(root,'build/ethereum-pow-zero');
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const {receipt,rawFiles}=await captureEthereumPowZero({outputDirectory,sourceCommit});
  const rawBytes=rawFiles.reduce((n,f)=>n+f.bytes.length,0);
  const transportComplete=rawBytes<=POW_ZERO_TRANSPORT.maximumLogTransportRawBytes;
  receipt.logTransport={complete:transportComplete,rawBytes,maximumRawBytes:POW_ZERO_TRANSPORT.maximumLogTransportRawBytes};
  await writeFile(resolve(outputDirectory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log('ETH_POW_ZERO_RECEIPT '+JSON.stringify(receipt));
  if(transportComplete)for(const file of rawFiles){
    const base64=file.bytes.toString('base64'),total=Math.ceil(base64.length/48000);
    for(let index=0;index<total;index++)console.log('ETH_POW_ZERO_RAW_PART '+JSON.stringify({path:file.path,bytes:file.bytes.length,sha256:file.sha256,index,total,base64:base64.slice(index*48000,(index+1)*48000)}));
  }
  if(receipt.status!=='partial-protocol-observation-collected')process.exitCode=1;
}
