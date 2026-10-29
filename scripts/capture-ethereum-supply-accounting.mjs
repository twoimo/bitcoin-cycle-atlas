// Two bounded public requests. Keep source arithmetic separate from exact chain
// validation and from the economic model's eligibility contract.
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {auditEthereumSupplyAccounting,ETH_SUPPLY_ACCOUNTING_SOURCE as SOURCE,ETH_SUPPLY_ACCOUNTING_POLICY as POLICY} from './ethereum-supply-accounting-core.mjs';
const now=()=>new Date().toISOString(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const message=error=>String(error?.message??error).slice(0,800);
const allowed=new Map([[SOURCE.methodologyUrl,POLICY.methodologyMaximumBytes],[SOURCE.historyUrl,POLICY.historyMaximumBytes]]);
export async function fetchEthereumSupplyAccountingBytes(url,{fetchImpl=fetch,timeoutMs=45000,maximumBytes=allowed.get(url)}={}){
  if(!allowed.has(url))throw new TypeError('Supply accounting URL is not allowlisted');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>45000||!Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>allowed.get(url))throw new RangeError('Invalid supply acquisition bounds');
  const acquisition={url,requestedAt:now(),responseReceivedAt:null,completedAt:null,httpStatus:null,receivedBytes:0,complete:false};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Supply request timeout')),timeoutMs);let reader;
  try{
    const response=await fetchImpl(url,{signal:controller.signal,redirect:'error',headers:{Accept:url===SOURCE.historyUrl?'application/json':'text/html'}});
    acquisition.responseReceivedAt=now();acquisition.httpStatus=response.status;
    acquisition.responseHeaders=Object.fromEntries(['date','etag','content-type','x-supply-sha256','x-supply-generated-at','x-supply-revision'].map(k=>[k,response.headers.get(k)]));
    if(response.url&&response.url!==url)throw new Error('Unexpected supply response URL');
    const size=response.headers.get('content-length');
    if(size!==null&&(!/^\d+$/.test(size)||Number(size)>maximumBytes))throw new RangeError('Supply advertised body exceeds limit or is malformed');
    if(!response.body?.getReader)throw new TypeError('Supply response stream unavailable');
    reader=response.body.getReader();const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;acquisition.receivedBytes+=value.byteLength;
      if(acquisition.receivedBytes>maximumBytes)throw new RangeError('Supply streamed body exceeds limit');chunks.push(Buffer.from(value));}
    const bytes=Buffer.concat(chunks);acquisition.completedAt=now();acquisition.complete=true;acquisition.sha256=sha(bytes);
    // Return complete bytes before schema/digest checks so the caller preserves
    // the actual error response and disagreement, instead of losing the evidence.
    return {bytes,ok:response.ok,acquisition};
  }catch(error){acquisition.failedAt=now();acquisition.error=message(error);error.acquisition=acquisition;throw error;}
  finally{clearTimeout(timer);controller.abort();if(reader)try{await reader.cancel();}catch{}}
}
export function verifySupplyResponseDigest(acquisition){
  const expected=acquisition.responseHeaders?.['x-supply-sha256'];
  if(expected===null||expected===undefined)return {providerDigestPresent:false,providerDigestVerified:false,independentAuthenticityProven:false};
  if(!/^[a-fA-F0-9]{64}$/.test(expected)||expected.toLowerCase()!==acquisition.sha256)throw new RangeError('Provider response SHA-256 differs from exact captured bytes');
  return {providerDigestPresent:true,providerDigestVerified:true,independentAuthenticityProven:false};
}
export async function collectEthereumSupplyAccounting({repositoryRoot=fileURLToPath(new URL('..',import.meta.url))}={}){
  const parent=resolve(repositoryRoot,'build/ethereum-supply-accounting');await mkdir(parent,{recursive:true});
  const dir=await mkdtemp(join(parent,'capture-'));const writeJson=(name,data)=>writeFile(join(dir,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  const receipt={version:POLICY.version,status:'started',startedAt:now(),source:SOURCE,policy:POLICY,
    outputDirectory:relative(repositoryRoot,dir).split('\\').join('/'),runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,
    sourceCommit:null,sourceTree:null,sourceHashes:{},network:[],rawFiles:[],protocolEvidence:null,observation:null,
    definitionMatchedModelMetricCount:0,fullModelSnapshotReady:false,eligibleModelSnapshotCount:0,modelInputActivated:false};
  await writeJson('started.json',receipt);
  try{
    const git=(...args)=>execFileSync('git',args,{cwd:repositoryRoot,encoding:'utf8',timeout:10000}).trim();
    receipt.sourceCommit=git('rev-parse','HEAD');receipt.sourceTree=git('rev-parse','HEAD^{tree}');
    for(const p of ['scripts/ethereum-supply-accounting-core.mjs','scripts/capture-ethereum-supply-accounting.mjs','tests/ethereum-supply-accounting.test.mjs','dist/ethereum-economic-model.js',SOURCE.protocolFile])receipt.sourceHashes[p]=sha(await readFile(resolve(repositoryRoot,p)));
    if(git('status','--porcelain','--',...Object.keys(receipt.sourceHashes)))throw new Error('Supply accounting source must be committed');
    const protocol=await readFile(resolve(repositoryRoot,SOURCE.protocolFile));
    const blob=createHash('sha1').update(Buffer.from('blob '+protocol.length+'\0')).update(protocol).digest('hex');
    if(blob!==SOURCE.protocolGitBlobSha)throw new RangeError('Pinned EIP-6780 source bytes differ from reviewed Git blob');
    receipt.protocolEvidence={file:SOURCE.protocolFile,url:SOURCE.protocolUrl,gitBlobSha:blob,bytes:protocol.length,sha256:sha(protocol),sourceBytesVerified:true};
    let payload;
    for(const [name,url]of [['methodology',SOURCE.methodologyUrl],['history-30d',SOURCE.historyUrl]]){
      let r;try{r=await fetchEthereumSupplyAccountingBytes(url);}catch(e){if(e.acquisition)receipt.network.push(e.acquisition);throw e;}
      receipt.network.push(r.acquisition);const file=name+(name==='methodology'?'.raw.html':'.raw.json');
      await writeFile(join(dir,file),r.bytes,{flag:'wx'});const raw={file,url,bytes:r.bytes.length,sha256:sha(r.bytes),complete:true};receipt.rawFiles.push(raw);
      if(!r.ok)throw new Error('Supply HTTP '+r.acquisition.httpStatus+' for '+name);
      Object.assign(raw,verifySupplyResponseDigest(r.acquisition));
      const text=new TextDecoder('utf-8',{fatal:true}).decode(r.bytes);
      if(name==='history-30d')payload=JSON.parse(text);
      else if(!text.includes('otherExecutionBurnWei')||!text.includes('SELFDESTRUCT'))throw new Error('Captured methodology lacks the reviewed non-fee destruction terms');
    }
    receipt.collectedAt=now();const today=Math.floor(Date.parse(receipt.collectedAt)/86400000)*86400000;
    receipt.observation=auditEthereumSupplyAccounting(payload,{collectedAt:receipt.collectedAt,observedThrough:new Date(today-86400000).toISOString().slice(0,10)});
    await writeJson('observation.json',receipt.observation);receipt.status='provider-accounting-audited';
  }catch(error){receipt.status='failed';receipt.error=message(error);process.exitCode=1;}
  finally{receipt.finishedAt=now();await writeJson('receipt.json',receipt);console.log('ETH_SUPPLY_ACCOUNTING_RECEIPT '+JSON.stringify(receipt));}
  return receipt;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await collectEthereumSupplyAccounting();
