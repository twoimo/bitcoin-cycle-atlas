/**
 * Bounded public-data supplement, never a 25-metric model snapshot.
 * Execute in the repository's GitHub Actions evidence workflow.
 */
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const ETH_THROUGHPUT_SOURCE=Object.freeze({
  masterUrl:'https://api.growthepie.com/v1/master.json',
  dataUrl:'https://api.growthepie.com/v1/metrics/chains/ethereum/throughput.json',
  termsUrl:'https://www.growthepie.com/data-terms',
  license:'CC-BY-4.0',attribution:'Source: growthepie, https://www.growthepie.com.',
  backendEvidenceCommit:'567f60415e8b48eb84f7b08e1bd83c8ca99995bf',
  hostedBackendVersionVerified:false,
});
const ALLOWED=new Set([ETH_THROUGHPUT_SOURCE.masterUrl,ETH_THROUGHPUT_SOURCE.dataUrl]);
const DAY=86400000,MAX_BYTES=8*1024*1024,MAX_ROWS=50000;
const now=()=>new Date().toISOString();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const message=error=>String(error?.message??error).slice(0,800);
function isoTimestamp(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))throw new RangeError('Invalid UTC timestamp');
  const time=Date.parse(value);
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,19)!==value.slice(0,19))throw new RangeError('Invalid UTC timestamp');
  return time;
}
export function parseEthereumThroughput(master,payload,{collectedAt}={}){
  const collected=isoTimestamp(collectedAt),today=Math.floor(collected/DAY)*DAY;
  const chain=master?.chains?.ethereum;
  if(chain?.url_key!=='ethereum'||chain.chain_type!=='l1'||chain.caip2!=='eip155:1'||
    chain.evm_chain_id!==1||chain.deployment!=='PROD'||!Array.isArray(chain.supported_metrics)||
    !chain.supported_metrics.includes('throughput')||chain.excluded_metrics?.includes('throughput'))
    throw new TypeError('Provider master does not identify the expected Ethereum L1 throughput source');
  if(payload?.details?.metric_id!=='throughput')throw new TypeError('Unexpected throughput metric identity');
  const daily=payload.details.timeseries?.daily;
  if(!Array.isArray(daily?.types)||daily.types.length!==2||daily.types[0]!=='unix'||daily.types[1]!=='value'||
    !Array.isArray(daily.data)||daily.data.length<28||daily.data.length>MAX_ROWS)
    throw new TypeError('Unexpected bounded throughput daily schema');
  const generated=payload.last_updated_utc;
  if(typeof generated!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(generated))throw new TypeError('Unknown provider generation timestamp format');
  const providerGeneratedAt=generated.replace(' ','T')+'Z';
  if(isoTimestamp(providerGeneratedAt)>collected+300000)throw new RangeError('Provider generation clock is in the future');
  let previous=-Infinity;
  for(const row of daily.data){
    if(!Array.isArray(row)||row.length!==2||!Number.isSafeInteger(row[0])||row[0]%DAY!==0||
      row[0]<=previous||row[0]>=today||row[0]<Date.parse('2015-07-30T00:00:00Z'))
      throw new RangeError('Throughput dates must be unique ascending completed UTC days in milliseconds');
    if(row[1]!==null&&(!Number.isFinite(row[1])||row[1]<0))throw new RangeError('Throughput values must be numeric nonnegative Mgas/s or explicit null');
    previous=row[0];
  }
  const selected=daily.data.slice(-28),end=selected.at(-1)[0];
  const ageDays=(today-end)/DAY;
  if(ageDays>7)throw new RangeError('Latest completed throughput observation is older than the fixed seven-day freshness limit');
  for(let i=0;i<selected.length;i++){
    if(selected[i][0]!==end-(27-i)*DAY||!Number.isFinite(selected[i][1]))
      throw new RangeError('The selected 28 UTC days have a missing date or missing value');
  }
  const gas=selected.reduce((sum,row)=>sum+row[1]*86400*1000000,0);
  if(!Number.isFinite(gas)||gas<0)throw new RangeError('Derived throughput gas total overflow');
  const day=ms=>new Date(ms).toISOString().slice(0,10);
  return {
    status:'supplement-collected',observationKind:'ethereum-l1-gas-rate-derived-supplement',
    sourceUnit:'Mgas/s',derivedUnit:'gas/28 UTC days',l1GasUsedRateDerived:gas,
    conversion:'sum(dailyValue * 86400 * 1000000)',exactIntegerGas:false,roundingAppliedByCollector:false,
    sourceRows:daily.data.length,windowObservations:selected.length,windowStart:day(selected[0][0]),observedThrough:day(end),
    requestedWindowEnd:day(today-DAY),requestedLatestWindowComplete:end===today-DAY,
    daysBehindRequestedEnd:ageDays-1,freshnessLimitDays:7,collectedAt,providerGeneratedAt,publishedAt:null,
    rows:selected.map(([unix,value])=>({date:day(unix),unixMilliseconds:unix,mgasPerSecond:value})),
    chainIdentity:{provider:'growthepie',urlKey:chain.url_key,caip2:chain.caip2,evmChainId:chain.evm_chain_id,chainType:chain.chain_type},
    upstreamSource:payload.details.source??null,
    chainCompletenessIndependentlyVerified:false,precisionPromotionPolicyEstablished:false,
    strictDefinitionMatchedMetricCount:0,fullModelSnapshotReady:false,eligibleModelSnapshotCount:0,
    historicalPointInTimeReady:false,modelInputActivated:false,modelSnapshots:[],
    interpretation:'Rate-derived latest-available supplement; no exact integer-gas, first-publication, complete-network or historical-vintage claim.',
  };
}

export async function fetchEthereumThroughputBytes(url,{fetchImpl=fetch,timeoutMs=45000,maximumBytes=MAX_BYTES}={}){
  if(!ALLOWED.has(url))throw new TypeError('Throughput URL is not allowlisted');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>45000||
    !Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>MAX_BYTES)throw new RangeError('Invalid bounded acquisition limits');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Throughput request timed out')),timeoutMs);
  const acquisition={url,requestedAt:now(),responseReceivedAt:null,completedAt:null,httpStatus:null,receivedBytes:0,complete:false};
  let reader;
  try{
    const response=await fetchImpl(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}});
    acquisition.responseReceivedAt=now();acquisition.httpStatus=response.status;
    acquisition.responseHeaders={date:response.headers.get('date'),etag:response.headers.get('etag'),contentType:response.headers.get('content-type')};
    if(response.url&&response.url!==url)throw new Error('Unexpected throughput response URL');
    const advertised=response.headers.get('content-length');
    if(advertised!==null&&(!/^\d+$/.test(advertised)||Number(advertised)>maximumBytes))throw new RangeError('Throughput advertised body exceeds limit or is malformed');
    if(!response.body?.getReader)throw new TypeError('Throughput body stream is unavailable');
    reader=response.body.getReader();const chunks=[];
    while(true){
      const {done,value}=await reader.read();if(done)break;
      acquisition.receivedBytes+=value.byteLength;
      if(acquisition.receivedBytes>maximumBytes)throw new RangeError('Throughput streamed body exceeds limit');
      chunks.push(Buffer.from(value));
    }
    const bytes=Buffer.concat(chunks);
    acquisition.completedAt=now();acquisition.complete=true;acquisition.sha256=digest(bytes);
    return {bytes,ok:response.ok,acquisition};
  }catch(error){
    acquisition.failedAt=now();acquisition.error=message(error);error.acquisition=acquisition;throw error;
  }finally{
    clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}
  }
}

export async function collectEthereumThroughput({repositoryRoot=fileURLToPath(new URL('..',import.meta.url))}={}){
  const parent=resolve(repositoryRoot,'build/ethereum-throughput-supplement');await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'capture-')),outputDirectory=relative(repositoryRoot,directory).split('\\').join('/');
  const writeJson=(name,value)=>writeFile(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const receipt={version:'eth-throughput-supplement-1',status:'started',startedAt:now(),source:ETH_THROUGHPUT_SOURCE,
    outputDirectory,runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,
    sourceCommit:null,sourceTree:null,sourceHashes:{},network:[],rawFiles:[],observation:null,
    strictDefinitionMatchedMetricCount:0,fullModelSnapshotReady:false,historicalPointInTimeReady:false,modelInputActivated:false};
  await writeJson('started.json',receipt);
  try{
    const git=(...args)=>execFileSync('git',args,{cwd:repositoryRoot,encoding:'utf8',timeout:10000}).trim();
    receipt.sourceCommit=git('rev-parse','HEAD');receipt.sourceTree=git('rev-parse','HEAD^{tree}');
    for(const path of ['scripts/capture-ethereum-throughput.mjs','tests/ethereum-throughput-supplement.test.mjs'])
      receipt.sourceHashes[path]=digest(await readFile(resolve(repositoryRoot,path)));
    if(git('status','--porcelain','--',...Object.keys(receipt.sourceHashes)))throw new Error('Supplement source must be committed');
    const payloads={};
    for(const [name,url] of [['master',ETH_THROUGHPUT_SOURCE.masterUrl],['throughput',ETH_THROUGHPUT_SOURCE.dataUrl]]){
      let result;
      try{result=await fetchEthereumThroughputBytes(url);}
      catch(error){if(error.acquisition)receipt.network.push(error.acquisition);throw error;}
      receipt.network.push(result.acquisition);
      const filename=name+'.raw.json';
      await writeFile(join(directory,filename),result.bytes,{flag:'wx'});
      receipt.rawFiles.push({file:filename,bytes:result.bytes.length,sha256:result.acquisition.sha256,url,complete:true});
      if(!result.ok)throw new Error('Throughput HTTP '+result.acquisition.httpStatus+' for '+name);
      payloads[name]=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.bytes));
    }
    receipt.collectedAt=now();
    receipt.observation=parseEthereumThroughput(payloads.master,payloads.throughput,{collectedAt:receipt.collectedAt});
    await writeJson('observation.json',receipt.observation);
    receipt.status='supplement-collected';
  }catch(error){
    receipt.status='failed';receipt.error=message(error);process.exitCode=1;
  }finally{
    receipt.finishedAt=now();await writeJson('receipt.json',receipt);
    console.log('ETH_THROUGHPUT_RECEIPT '+JSON.stringify(receipt));
    // The exact vendor bytes also remain in the source-bound Actions artifact.
    // Emit only the compact daily payload for durable connector-only recovery.
    const entry=receipt.rawFiles.find(item=>item.file==='throughput.raw.json');
    if(entry&&entry.bytes<=500000){
      const bytes=await readFile(join(directory,entry.file)),encoded=bytes.toString('base64'),size=20000,total=Math.ceil(encoded.length/size);
      for(let index=0;index<total;index++)console.log('ETH_THROUGHPUT_RAW_CHUNK '+JSON.stringify({file:entry.file,index,total,encoding:'base64',sha256:entry.sha256,data:encoded.slice(index*size,(index+1)*size)}));
    }
  }
  return receipt;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await collectEthereumThroughput();
