import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ETH_STAKING_COHORT_POLICY,ETH_STAKING_COHORT_TRANSPORT,ETH_STAKING_COHORT_SOURCES,validateEthereumStakingCohortTransport,stakingCohortUrl,inspectEthereumStakingCohortHeader,inspectEthereumStakingCohort,replayEthereumStakingCohortCapture} from './ethereum-staking-cohort-core.mjs';

export {ETH_STAKING_COHORT_TRANSPORT};
const sha=body=>createHash('sha256').update(body).digest('hex');
const message=error=>String(error?.message??error).slice(0,800);

/** Exactly three public GETs: mainnet genesis, finalized header, then the same
 * eight indices at that header's state root. No wallet, keys or transactions. */
export async function captureEthereumStakingCohort({outputDirectory,fetchImpl=globalThis.fetch,nowMs=()=>Date.now(),sourceCommit='unknown',sourceTree=null,sourceFiles={},limits=ETH_STAKING_COHORT_TRANSPORT}={}){
  limits=validateEthereumStakingCohortTransport(limits);
  const started=nowMs(),deadline=started+limits.totalTimeoutMs,rawFiles=[],requests=[];
  let totalReceivedBytes=0;
  const receipt={schemaVersion:1,kind:'ethereum-fixed-staking-cohort-capture',status:'started',
    sourceCommit,sourceTree,sourceFiles,policy:ETH_STAKING_COHORT_POLICY,transportPolicy:limits,definitionSources:ETH_STAKING_COHORT_SOURCES,
    captureStartedAt:new Date(started).toISOString(),publishedAt:null,requests,observation:null,
    definitionMatchedModelMetricCount:0,eligibleModelSnapshotCount:0,fullModelSnapshotReady:false,modelInputActivated:false,
    providerTerms:'https://www.publicnode.com/terms',providerDataLicense:'not-asserted'};
  if(outputDirectory){await mkdir(outputDirectory,{recursive:true});await writeFile(resolve(outputDirectory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');}
  async function acquire(kind,stateRoot=null){
    const requestStarted=nowMs();
    if(requests.length>=limits.maximumRequests||requestStarted>=deadline)throw new Error('Cohort request/deadline budget exhausted');
    const url=stakingCohortUrl(kind,stateRoot),controller=new AbortController(),requestDeadline=Math.min(requestStarted+limits.requestTimeoutMs,deadline);
    const entry={kind,url,method:'GET',startedAt:new Date(requestStarted).toISOString(),deadlineAt:new Date(requestDeadline).toISOString(),httpStatus:null,publishedAt:null,complete:false,receivedBytes:0,retainedBytes:0,truncated:false};
    requests.push(entry);
    const timer=setTimeout(()=>controller.abort(),requestDeadline-requestStarted),chunks=[];
    try{
      const response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{accept:'application/json'}});
      entry.httpStatus=response.status;entry.responseDate=response.headers.get('date');entry.responseContentType=response.headers.get('content-type');
      if(response.redirected||response.url&&response.url!==url)throw new Error('Cohort endpoint redirect/URL mismatch');
      const declared=response.headers.get('content-length');
      if(declared!==null&&Number.isFinite(Number(declared))&&Number(declared)>limits.maximumResponseBytes)throw new RangeError('Declared cohort body exceeds byte bound');
      if(!response.body)throw new Error('Cohort response has no readable body');
      for await(const value of response.body){
        const chunk=Buffer.from(value);entry.receivedBytes+=chunk.length;totalReceivedBytes+=chunk.length;
        const retain=Math.min(chunk.length,limits.maximumResponseBytes-entry.retainedBytes,limits.maximumTotalBytes-rawFiles.reduce((n,f)=>n+f.bytes.length,0)-entry.retainedBytes);
        if(retain>0){chunks.push(chunk.subarray(0,retain));entry.retainedBytes+=retain;}
        if(entry.receivedBytes>limits.maximumResponseBytes||totalReceivedBytes>limits.maximumTotalBytes){entry.truncated=true;throw new RangeError('Cohort response/capture byte bound exceeded');}
        if(controller.signal.aborted||nowMs()>=requestDeadline)throw new Error('Cohort request/total deadline exceeded during body read');
      }
      const collected=nowMs();entry.complete=true;entry.collectedAt=new Date(collected).toISOString();
      if(!response.ok)throw new Error('HTTP '+response.status);
      if(controller.signal.aborted||collected>=requestDeadline)throw new Error('Cohort request/total deadline exceeded');
      return {url,httpStatus:response.status,complete:true,startedAt:entry.startedAt,collectedAt:entry.collectedAt,bytes:Buffer.concat(chunks)};
    }catch(error){controller.abort();entry.error=message(error);throw error;}
    finally{
      clearTimeout(timer);
      const bytes=Buffer.concat(chunks);
      if(bytes.length){entry.path=kind+'.raw.json';entry.sha256=sha(bytes);rawFiles.push({path:entry.path,bytes,sha256:entry.sha256,complete:entry.complete,truncated:entry.truncated});}
      entry.finishedAt=new Date(nowMs()).toISOString();
    }
  }
  try{
    const genesis=await acquire('genesis'),header=await acquire('header');
    const anchor=inspectEthereumStakingCohortHeader({genesis,header,captureStartedAt:receipt.captureStartedAt,finishedAt:new Date(nowMs()).toISOString()});
    const validators=await acquire('validators',anchor.state.stateRoot);
    receipt.observation=inspectEthereumStakingCohort({genesis,header,validators,captureStartedAt:receipt.captureStartedAt,finishedAt:new Date(nowMs()).toISOString()});
    receipt.status='partial-cohort-state-captured';
  }catch(error){receipt.status='capture-failed';receipt.error=message(error);}
  receipt.finishedAt=new Date(nowMs()).toISOString();
  receipt.network={requests:requests.length,totalReceivedBytes,retainedRawBytes:rawFiles.reduce((n,f)=>n+f.bytes.length,0),retries:0,deadlineAt:new Date(deadline).toISOString(),completedAt:requests.at(-1)?.collectedAt??null};
  receipt.rawFiles=rawFiles.map(({path,bytes,sha256,complete,truncated})=>({path,bytes:bytes.length,sha256,complete,truncated}));
  if(outputDirectory){
    for(const file of rawFiles)await writeFile(resolve(outputDirectory,file.path),file.bytes);
    await writeFile(resolve(outputDirectory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  }
  return {receipt,rawFiles};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length!==2)throw new Error('This fixed-cohort evidence command takes no options');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const paths=['scripts/ethereum-staking-cohort-core.mjs','scripts/capture-ethereum-staking-cohort.mjs'],sourceFiles={};
  for(const path of paths)sourceFiles[path]=sha(await readFile(resolve(root,path)));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  if(git('status','--porcelain','--',...paths))throw new Error('Commit the cohort source before collecting execution evidence');
  const outputDirectory=resolve(root,'build/ethereum-staking-cohort');
  const {receipt,rawFiles}=await captureEthereumStakingCohort({outputDirectory,sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),sourceFiles});
  console.log('ETH_STAKING_COHORT_RECEIPT '+JSON.stringify(receipt));
  for(const file of rawFiles){
    const encoded=file.bytes.toString('base64'),total=Math.ceil(encoded.length/48000);
    for(let index=0;index<total;index++)console.log('ETH_STAKING_COHORT_RAW_PART '+JSON.stringify({path:file.path,bytes:file.bytes.length,sha256:file.sha256,complete:file.complete,truncated:file.truncated,index,total,base64:encoded.slice(index*48000,(index+1)*48000)}));
  }
  if(receipt.status==='partial-cohort-state-captured'){
    const storedReceipt=JSON.parse(await readFile(resolve(outputDirectory,'receipt.json'),'utf8')),storedRaw=[];
    for(const path of ['genesis.raw.json','header.raw.json','validators.raw.json'])storedRaw.push({path,bytes:await readFile(resolve(outputDirectory,path))});
    const replay=replayEthereumStakingCohortCapture({receipt:storedReceipt,rawFiles:storedRaw});
    await writeFile(resolve(outputDirectory,'replay.json'),JSON.stringify(replay,null,2)+'\n');
    console.log('ETH_STAKING_COHORT_REPLAY_RECEIPT '+JSON.stringify(replay));
  }
  if(receipt.status!=='partial-cohort-state-captured')process.exitCode=1;
}
