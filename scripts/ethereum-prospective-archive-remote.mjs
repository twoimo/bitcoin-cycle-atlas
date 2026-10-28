import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat,realpath,opendir,rename,rm} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync,execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {verifyEthereumProspectiveArchive} from './ethereum-prospective-archive-core.mjs';

/** Git storage is an append-only transport for already validated evidence.
 * It does not authorize release, authenticate provider observations or prune
 * calibration inputs. PR jobs never call the privileged publish command. */
export const ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY=Object.freeze({
  version:'eth-prospective-archive-github-1',repository:'twoimo/bitcoin-cycle-atlas',branch:'eth-prospective-archive',
  apiOrigin:'https://api.github.com',apiVersion:'2026-03-10',
  maximumRequests:4096,requestTimeoutMs:15000,totalTimeoutMs:600000,
  maximumTreeEntries:37124,maximumFiles:37121,maximumBlobBytes:8*1024*1024,
  maximumArchiveBytes:2*1024*1024*1024,maximumResponseBytes:12*1024*1024,
  maximumReceivedBytes:3*1024*1024*1024,maximumRequestBytes:12*1024*1024,
  retries:0,redirects:0,forceUpdates:false,productionPromoted:false,releaseAuthorized:false,
});
const P=ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY,HEX=/^[a-f0-9]{40}$/,DIGEST=/^[a-f0-9]{64}$/;
const json=canonicalForecastJson,sha=value=>createHash('sha256').update(value).digest('hex');
const encoded=value=>Buffer.from(json(value)+'\n','utf8');
const blobSha=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const apiPrefix='/repos/'+P.repository;
const remoteDirectory='build/ethereum-prospective-archive-remote';
const receiptPath='build/ethereum-prospective-archive-remote-receipt.json';
const seedDirectory='research-data/ethereum-prospective-archive';
const outputDirectory='build/ethereum-prospective-archive';
const safePath=path=>typeof path==='string'&&(path==='manifest.json'||/^(manifests|pages)\/[a-f0-9]{64}\.json$/.test(path)||/^objects\/[a-f0-9]{64}\.blob$/.test(path));
const fail=message=>{throw new Error(message);};
const timestamp=now=>new Date(now()).toISOString();
const signed=body=>({id:sha(Buffer.from(json(body))),...body});
function snapshotFiles(files){
  if(!(files instanceof Map)||files.size>P.maximumFiles)throw new TypeError('Bounded archive file Map required');
  let total=0;const copy=new Map();
  for(const [path,value]of files){
    if(!safePath(path)||!Buffer.isBuffer(value)||value.length>P.maximumBlobBytes)throw new TypeError('Unsafe or oversized archive transport file');
    total+=value.length;if(total>P.maximumArchiveBytes)throw new RangeError('Remote archive byte budget exceeded');
    copy.set(path,Buffer.from(value));
  }
  return copy;
}
function inventory(files){return [...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,value])=>({path,bytes:value.length,sha256:sha(value),gitBlobSha:blobSha(value)}));}
function inventorySummary(files){
  const entries=inventory(files);return {files:entries.length,bytes:entries.reduce((sum,entry)=>sum+entry.bytes,0),sha256:sha(Buffer.from(json(entries)))};
}

/** Rebuild Git's actual tree object hashes, including intermediate trees.
 * No remote tree label can replace the identities of its retained bytes. */
export function ethereumArchiveGitTree(files){
  return ethereumArchiveGitTreeFromInventory(inventory(snapshotFiles(files)));
}
/** Descriptor-only form for the opaque filesystem reader. The caller must
 * verify these hashes against every original byte before relying on this tree. */
export function ethereumArchiveGitTreeFromInventory(items){
  if(!Array.isArray(items)||items.length>P.maximumFiles)throw new TypeError('Bounded archive transport inventory required');
  let total=0;
  const root=new Map(),entries=[];
  for(const value of items){
    if(!value||Object.keys(value).sort().join(',')!=='bytes,gitBlobSha,path,sha256'||!safePath(value.path)||
      !Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>P.maximumBlobBytes||!DIGEST.test(value.sha256)||!HEX.test(value.gitBlobSha)||
      (total+=value.bytes)>P.maximumArchiveBytes)throw new Error('Invalid bounded archive transport descriptor');
    const path=value.path;
    const parts=path.split('/');let current=root;
    for(const part of parts.slice(0,-1)){
      if(!current.has(part))current.set(part,new Map());
      if(!(current.get(part) instanceof Map))fail('Archive file/directory collision');
      current=current.get(part);
    }
    const name=parts.at(-1);if(current.has(name))fail('Duplicate archive tree path');current.set(name,value);
  }
  function visit(tree,prefix){
    const chunks=[];
    const ordered=[...tree].sort(([a,av],[b,bv])=>Buffer.compare(Buffer.from(a+(av instanceof Map?'/':'')),Buffer.from(b+(bv instanceof Map?'/':''))));
    for(const [name,value]of ordered){
      const path=prefix+name,isTree=value instanceof Map,hash=isTree?visit(value,path+'/'):value.gitBlobSha,mode=isTree?'040000':'100644';
      entries.push({path,mode,type:isTree?'tree':'blob',sha:hash,...(!isTree?{size:value.bytes}:{})});
      chunks.push(Buffer.from((isTree?'40000':'100644')+' '+name+'\0'),Buffer.from(hash,'hex'));
    }
    const bytes=Buffer.concat(chunks);return createHash('sha1').update('tree '+bytes.length+'\0').update(bytes).digest('hex');
  }
  return {sha:visit(root,''),tree:entries.sort((a,b)=>a.path.localeCompare(b.path))};
}
function checkTree(value,expectedSha){
  if(!value||value.sha!==expectedSha||value.truncated!==false||!Array.isArray(value.tree)||value.tree.length>P.maximumTreeEntries)
    fail('Incomplete or oversized remote archive tree');
  const files=[],seen=new Set();let total=0;
  for(const entry of value.tree){
    if(!entry||typeof entry.path!=='string'||seen.has(entry.path)||!HEX.test(entry.sha))fail('Unsafe or duplicate remote archive tree entry');
    seen.add(entry.path);
    if(entry.type==='tree'){
      if(entry.mode!=='040000'||!['manifests','pages','objects'].includes(entry.path))fail('Unexpected remote archive directory');
    }else{
      if(entry.type!=='blob'||entry.mode!=='100644'||!safePath(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>P.maximumBlobBytes)
        fail('Unsafe remote archive file mode, path or size');
      total+=entry.size;files.push(entry);
    }
  }
  if(files.length>P.maximumFiles||total>P.maximumArchiveBytes)throw new RangeError('Remote archive inventory budget exceeded');
  if(!files.some(entry=>entry.path==='manifest.json'))fail('Remote archive has no manifest');
  return files.sort((a,b)=>a.path.localeCompare(b.path));
}
function equalTree(remote,files){
  const rebuilt=ethereumArchiveGitTree(files);
  if(rebuilt.sha!==remote.sha)fail('Remote Git tree does not match preserved archive bytes');
  const actual=remote.tree.map(({path,mode,type,sha,size})=>({path,mode,type,sha,...(type==='blob'?{size}:{})})).sort((a,b)=>a.path.localeCompare(b.path));
  if(json(actual)!==json(rebuilt.tree))fail('Remote archive tree inventory mismatch');
  return rebuilt;
}
function createClient({fetchImpl=globalThis.fetch,token=null,now=Date.now}={}){
  if(typeof fetchImpl!=='function'||typeof now!=='function'||token!==null&&(typeof token!=='string'||!token||/[\r\n]/.test(token)))throw new TypeError('Valid bounded GitHub transport required');
  const startedAt=timestamp(now),startedMs=now();let requests=0,receivedBytes=0;
  async function request(method,path,{body,allow404=false}={}){
    if(!['GET','POST','PATCH'].includes(method)||path!==apiPrefix&&!path.startsWith(apiPrefix+'/')||path.includes('..')||/[\r\n]/.test(path))fail('Unsafe GitHub archive request');
    if(++requests>P.maximumRequests||now()-startedMs>=P.totalTimeoutMs)throw new RangeError('Remote archive request or deadline budget exceeded');
    const payload=body===undefined?undefined:JSON.stringify(body);
    if(payload!==undefined&&Buffer.byteLength(payload)>P.maximumRequestBytes)throw new RangeError('Remote archive request body exceeds byte budget');
    const controller=new AbortController(),remaining=Math.min(P.requestTimeoutMs,P.totalTimeoutMs-(now()-startedMs));
    const timer=setTimeout(()=>controller.abort(new Error('Remote archive request deadline exceeded')),remaining);
    let reader,response;
    try{
      const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':P.apiVersion,...(token?{Authorization:'Bearer '+token}:{}),...(payload===undefined?{}:{'Content-Type':'application/json'})};
      const bounded=promise=>new Promise((accept,reject)=>{
        const abort=()=>reject(controller.signal.reason);
        if(controller.signal.aborted){reject(controller.signal.reason);return;}
        controller.signal.addEventListener('abort',abort,{once:true});
        Promise.resolve(promise).then(value=>{controller.signal.removeEventListener('abort',abort);accept(value);},error=>{
          controller.signal.removeEventListener('abort',abort);reject(error);
        });
      });
      response=await bounded(fetchImpl(P.apiOrigin+path,{method,headers,body:payload,redirect:'error',signal:controller.signal}));
      if(response.redirected||response.status>=300&&response.status<400)fail('Remote archive redirects are forbidden');
      if(response.status===404&&allow404)return null;
      if(response.status<200||response.status>=300)fail('GitHub archive request failed: HTTP '+response.status);
      const length=response.headers?.get('content-length');
      if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>P.maximumResponseBytes))throw new RangeError('Remote archive response exceeds byte budget');
      if(!response.body?.getReader)fail('Readable GitHub archive response required');
      reader=response.body.getReader();const chunks=[];let count=0;
      while(true){
        if(controller.signal.aborted||now()-startedMs>=P.totalTimeoutMs)throw new Error('Remote archive response deadline exceeded');
        const part=await bounded(reader.read());if(part.done)break;
        count+=part.value.byteLength;receivedBytes+=part.value.byteLength;
        if(count>P.maximumResponseBytes||receivedBytes>P.maximumReceivedBytes)throw new RangeError('Remote archive response byte budget exceeded');
        chunks.push(Buffer.from(part.value));
      }
      const bytes=Buffer.concat(chunks),text=bytes.toString('utf8');
      if(!Buffer.from(text,'utf8').equals(bytes))fail('Non-UTF-8 GitHub archive response');
      return JSON.parse(text);
    }finally{
      clearTimeout(timer);controller.abort();
      if(reader){reader.cancel().catch(()=>{});reader.releaseLock();}
      else if(response?.body){try{response.body.cancel().catch(()=>{});}catch{/* A failed cancellation must never hold the request open. */}}
    }
  }
  return {request,receipt:()=>({startedAt,completedAt:timestamp(now),requests,receivedBytes,retries:0,redirects:0})};
}
async function remoteTree(client,head){
  const commit=await client.request('GET',apiPrefix+'/git/commits/'+head);
  if(commit?.sha!==head||!HEX.test(commit.tree?.sha))fail('Remote archive commit identity mismatch');
  const tree=await client.request('GET',apiPrefix+'/git/trees/'+commit.tree.sha+'?recursive=1');
  const entries=checkTree(tree,commit.tree.sha);return {commit,tree,entries};
}
function checkRef(ref){
  if(ref?.ref!=='refs/heads/'+P.branch||ref.object?.type!=='commit'||!HEX.test(ref.object?.sha))fail('Unexpected remote archive reference');
  return ref.object.sha;
}
function readBody(receipt){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))fail('Original remote-read receipt required');
  const {id,...body}=receipt;
  if(!DIGEST.test(id)||signed(body).id!==id||body.kind!=='ethereum-prospective-archive-remote-read'||body.policyVersion!==P.version||
    body.repository!==P.repository||body.branch!==P.branch||!['restored','absent'].includes(body.status)||
    !body.inventory||Object.keys(body.inventory).sort().join(',')!=='bytes,files,sha256'||
    !Number.isSafeInteger(body.inventory.files)||body.inventory.files<0||body.inventory.files>P.maximumFiles||
    !Number.isSafeInteger(body.inventory.bytes)||body.inventory.bytes<0||body.inventory.bytes>P.maximumArchiveBytes||!DIGEST.test(body.inventory.sha256))
    fail('Invalid remote-read receipt');
  if(body.status==='absent'){
    if(body.expectedHead!==null||body.expectedTree!==null||body.manifestId!==null||json(body.inventory)!==json(inventorySummary(new Map())))fail('Invalid absent archive receipt');
  }else if(!HEX.test(body.expectedHead)||!HEX.test(body.expectedTree)||!DIGEST.test(body.manifestId))fail('Invalid restored archive identity');
  return body;
}
/** Disk receipts are integrity checks, never cached verification authority.
 * The caller still verifies the full archive semantics after this transport
 * binding check. No network operation occurs in this function or on import. */
export function validateEthereumArchiveRemoteReadReceipt({receipt,files}={}){
  const body=readBody(receipt),captured=snapshotFiles(files);
  if(json(body.inventory)!==json(inventorySummary(captured)))fail('Remote-read receipt inventory differs from retained bytes');
  if(body.status==='restored'){
    if(body.expectedTree!==ethereumArchiveGitTree(captured).sha)fail('Remote-read receipt Git tree differs from retained bytes');
    const manifest=JSON.parse(captured.get('manifest.json')?.toString('utf8')??'null');
    if(manifest?.id!==body.manifestId)fail('Remote-read receipt manifest differs from retained bytes');
  }else if(captured.size||body.absenceProof?.repository!==P.repository||body.absenceProof?.publicRepositoryReadSucceeded!==true||
    body.absenceProof?.exactBranchReadReturned404!==true||!Number.isSafeInteger(body.absenceProof?.repositoryId)||body.absenceProof.repositoryId<1)
    fail('Explicit absent-branch receipt requires its successful public repository check');
  return {status:body.status,expectedHead:body.expectedHead,expectedTree:body.expectedTree,manifestId:body.manifestId,receiptId:receipt.id,
    inventory:JSON.parse(json(body.inventory)),allRetainedTransportBytesBound:body.status==='restored'};
}

/** Rebind a raw-verified opaque filesystem source to the original read receipt
 * without materializing a second full archive byte Map. This function checks
 * descriptors, not original file bytes; source verification remains mandatory. */
export function validateEthereumArchiveRemoteReadInventory({receipt,entries,manifestId}={}){
  const body=readBody(receipt),tree=ethereumArchiveGitTreeFromInventory(entries);
  const ordered=[...entries].sort((a,b)=>a.path.localeCompare(b.path));
  const summary={files:ordered.length,bytes:ordered.reduce((sum,value)=>sum+value.bytes,0),sha256:sha(Buffer.from(json(ordered)))};
  if(json(body.inventory)!==json(summary))fail('Remote-read receipt inventory differs from verified source descriptors');
  if(body.status==='restored'){
    if(body.expectedTree!==tree.sha||body.manifestId!==manifestId)fail('Remote-read receipt tree or manifest differs from verified source');
  }else{
    if(entries.length||manifestId!==null)fail('Absent archive receipt cannot bind archive descriptors');
    validateEthereumArchiveRemoteReadReceipt({receipt,files:new Map()});
  }
  return {status:body.status,expectedHead:body.expectedHead,expectedTree:body.expectedTree,manifestId:body.manifestId,
    receiptId:receipt.id,inventory:summary,rawSourceVerificationRequired:true};
}

export async function readEthereumProspectiveArchiveRemote(options={}){
  const client=createClient(options),ref=await client.request('GET',apiPrefix+'/git/ref/heads/'+P.branch,{allow404:true});
  let files=new Map(),expectedHead=null,expectedTree=null,verified=null,gitTransport=null,absenceProof=null;
  if(ref){
    expectedHead=checkRef(ref);
    if(options.readGitObjects){
      if(typeof options.readGitObjects!=='function')throw new TypeError('Git object reader must be a function');
      const remote=await remoteTree(client,expectedHead);expectedTree=remote.tree.sha;
      const result=await options.readGitObjects({head:expectedHead,expectedTree,entries:remote.entries});files=snapshotFiles(result.files);
      equalTree(remote.tree,files);
      gitTransport=result.receipt;
    }else{
      const remote=await remoteTree(client,expectedHead);expectedTree=remote.tree.sha;
      if(new Set(remote.entries.map(entry=>entry.sha)).size+3>P.maximumRequests)throw new RangeError('REST blob diagnostic exceeds request budget; production CLI uses one Git pack fetch');
      const blobs=new Map();
      for(const entry of remote.entries){
        let bytes=blobs.get(entry.sha);
        if(!bytes){
          const blob=await client.request('GET',apiPrefix+'/git/blobs/'+entry.sha);
          if(blob?.sha!==entry.sha||blob.encoding!=='base64'||blob.size!==entry.size||typeof blob.content!=='string')fail('Remote Git blob metadata mismatch');
          const compact=blob.content.replace(/\n/g,'');
          if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact))fail('Invalid remote Git blob base64');
          bytes=Buffer.from(compact,'base64');
          if(bytes.length!==entry.size||bytes.length>P.maximumBlobBytes||blobSha(bytes)!==entry.sha)fail('Remote Git blob byte identity mismatch');
          blobs.set(entry.sha,bytes);
        }
        if(bytes.length!==entry.size)fail('Inconsistent repeated Git blob size');files.set(entry.path,Buffer.from(bytes));
      }
      equalTree(remote.tree,files);
    }
    verified=await verifyEthereumProspectiveArchive({files});
  }else{
    // A private/inaccessible repository can also produce 404. It is not
    // evidence that the fixed data branch is absent or that bootstrap is safe.
    const repository=await client.request('GET',apiPrefix);
    if(repository?.full_name!==P.repository||repository.private!==false||!Number.isSafeInteger(repository.id)||repository.id<1)
      fail('An accessible intended public repository is required to establish an absent archive branch');
    absenceProof={repository:P.repository,repositoryId:repository.id,publicRepositoryReadSucceeded:true,exactBranchReadReturned404:true};
  }
  const receipt=signed({schemaVersion:1,kind:'ethereum-prospective-archive-remote-read',policyVersion:P.version,
    repository:P.repository,branch:P.branch,status:ref?'restored':'absent',expectedHead,expectedTree,
    manifestId:verified?.manifest.id??null,inventory:inventorySummary(files),absenceProof,transport:{...client.receipt(),method:options.readGitObjects?'git-object-pack':'rest-blobs-diagnostic',git:gitTransport},
    automaticSeedFallback:false,allGitBlobsVerified:!!ref,allArchiveBytesVerified:!!ref,providerAuthenticity:false,
    productionPromoted:false,releaseAuthorized:false});
  return {files,receipt};
}
function checkSource(source){
  if(!source||Object.keys(source).sort().join(',')!=='runId,sourceCommit,sourceTree'||!HEX.test(source.sourceCommit)||!HEX.test(source.sourceTree)||
    typeof source.runId!=='string'||!/^\d{1,24}$/.test(source.runId))throw new TypeError('Exact scheduled archive source and run identity required');
}
function checkContext(context){
  if(!context||context.repository!==P.repository||!['schedule','workflow_dispatch'].includes(context.eventName)||
    typeof context.defaultBranch!=='string'||!context.defaultBranch||context.ref!=='refs/heads/'+context.defaultBranch||
    context.defaultBranch===P.branch||/[\x00-\x20~^:?*\[\\]/.test(context.defaultBranch)||context.defaultBranch.includes('..'))
    fail('Archive publication requires the intended repository and a scheduled/manual default-branch context');
}
async function checkCommittedSeed(client,files,source){
  const commit=await client.request('GET',apiPrefix+'/git/commits/'+source.sourceCommit);
  if(commit?.sha!==source.sourceCommit||commit.tree?.sha!==source.sourceTree)fail('Initial archive seed source commit/tree mismatch');
  const tree=await client.request('GET',apiPrefix+'/git/trees/'+source.sourceTree+'?recursive=1');
  if(tree?.sha!==source.sourceTree||tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>20000)fail('Incomplete committed archive seed tree');
  const prefix=seedDirectory+'/';
  const entries=tree.tree.filter(entry=>entry.path?.startsWith(prefix)&&entry.type!=='tree');
  if(entries.length!==files.size)fail('Initial archive seed inventory mismatch');
  const seen=new Set();
  for(const entry of entries){
    const path=entry.path.slice(prefix.length),bytes=files.get(path);
    if(seen.has(path)||!bytes||entry.type!=='blob'||entry.mode!=='100644'||entry.size!==bytes.length||entry.sha!==blobSha(bytes))fail('Initial archive seed is not the exact committed seed');
    seen.add(path);
  }
}

export async function publishEthereumProspectiveArchiveRemote({files,previousFiles,readReceipt,source,context,fetchImpl,token,now}={}){
  checkContext(context);checkSource(source);if(typeof token!=='string'||!token)fail('Archive publication token required');
  source=JSON.parse(json(source));context=JSON.parse(json(context));readReceipt=JSON.parse(json(readReceipt));
  const nextFiles=snapshotFiles(files),priorFiles=snapshotFiles(previousFiles),read=readBody(readReceipt);
  validateEthereumArchiveRemoteReadReceipt({receipt:readReceipt,files:read.status==='restored'?priorFiles:new Map()});
  const prior=await verifyEthereumProspectiveArchive({files:priorFiles}),next=await verifyEthereumProspectiveArchive({files:nextFiles});
  if(next.manifest.previousManifestId!==prior.manifest.id||next.manifest.sequence!==prior.manifest.sequence+1||json(next.manifest.source)!==json(source))
    fail('Publication must be exactly one validated archive append from this source');
  for(const [path,bytes]of priorFiles)if(path!=='manifest.json'&&!nextFiles.get(path)?.equals(bytes))fail('Publication changed or removed previous archive bytes');
  const plannedUploads=[...nextFiles].filter(([path,bytes])=>read.status!=='restored'||!priorFiles.get(path)?.equals(bytes)).length;
  if(plannedUploads+9>P.maximumRequests)throw new RangeError('Publication delta exceeds the finite request budget');
  if(read.status==='restored'&&(read.manifestId!==prior.manifest.id||json(read.inventory)!==json(inventorySummary(priorFiles))||read.expectedTree!==ethereumArchiveGitTree(priorFiles).sha))
    fail('Previous archive differs from the original remote-read receipt');
  const client=createClient({fetchImpl,token,now}),live=await client.request('GET',apiPrefix+'/git/ref/heads/'+P.branch,{allow404:true});
  if((live?checkRef(live):null)!==read.expectedHead)fail('Archive branch changed after restoration; stale append rejected');
  let previousTree=null;
  if(live){
    const actual=await remoteTree(client,read.expectedHead);previousTree=actual.tree.sha;
    if(previousTree!==read.expectedTree)fail('Archive parent tree changed');equalTree(actual.tree,priorFiles);
  }else await checkCommittedSeed(client,priorFiles,source);
  const tree=ethereumArchiveGitTree(nextFiles),changed=[];
  for(const [path,bytes]of [...nextFiles].sort(([a],[b])=>a.localeCompare(b))){
    if(live&&priorFiles.get(path)?.equals(bytes))continue;
    const expected=blobSha(bytes),response=await client.request('POST',apiPrefix+'/git/blobs',{body:{content:bytes.toString('base64'),encoding:'base64'}});
    if(response?.sha!==expected)fail('Uploaded archive blob identity mismatch');changed.push({path,mode:'100644',type:'blob',sha:expected});
  }
  const createdTree=await client.request('POST',apiPrefix+'/git/trees',{body:{...(previousTree?{base_tree:previousTree}:{}),tree:changed}});
  if(createdTree?.sha!==tree.sha)fail('Uploaded archive tree identity mismatch');
  const parent=read.expectedHead??source.sourceCommit;
  const commit=await client.request('POST',apiPrefix+'/git/commits',{body:{message:'Preserve ETH prospective evidence '+next.manifest.id,tree:tree.sha,parents:[parent]}});
  if(!HEX.test(commit?.sha)||commit.tree?.sha!==tree.sha||!Array.isArray(commit.parents)||commit.parents.length!==1||commit.parents[0].sha!==parent)
    fail('Archive publication commit parent/tree mismatch');
  if(live)await client.request('PATCH',apiPrefix+'/git/refs/heads/'+P.branch,{body:{sha:commit.sha,force:false}});
  else await client.request('POST',apiPrefix+'/git/refs',{body:{ref:'refs/heads/'+P.branch,sha:commit.sha}});
  const finalRef=await client.request('GET',apiPrefix+'/git/ref/heads/'+P.branch);
  if(checkRef(finalRef)!==commit.sha)fail('Archive publication reference readback mismatch');
  const readback=await remoteTree(client,commit.sha);equalTree(readback.tree,nextFiles);
  return signed({schemaVersion:1,kind:'ethereum-prospective-archive-publication',policyVersion:P.version,
    repository:P.repository,branch:P.branch,status:'published',previousHead:read.expectedHead,parent,source,
    commit:commit.sha,tree:tree.sha,previousManifestId:prior.manifest.id,manifestId:next.manifest.id,sequence:next.manifest.sequence,
    preservedFiles:priorFiles.size-1,uploadedFiles:changed.length,totalFiles:nextFiles.size,archiveBytes:[...nextFiles.values()].reduce((sum,value)=>sum+value.length,0),
    readReceiptId:readReceipt.id,force:false,readbackMatched:true,transport:client.receipt(),
    providerAuthenticity:false,productionPromoted:false,releaseAuthorized:false});
}

/** Fetch exactly one public commit into a temporary bare object database.
 * There is no checkout, hook, submodule, archive extraction or executed data.
 * The API tree has already bounded the object inventory before this fetch.
 * Git's wire byte count is not exposed; decoded object sizes and total time
 * remain checked, and every returned blob/tree is independently rehashed. */
async function readGitArchiveObjects({root,head,expectedTree,entries}){
  if(!HEX.test(head)||!HEX.test(expectedTree)||!Array.isArray(entries))fail('Pinned bounded archive Git identity required');
  const build=await checkedDirectory(root,'build',{create:true}),temporary=resolve(build,'eth-archive-git-'+randomUUID());
  const startedAt=new Date().toISOString(),started=Date.now(),env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
  Object.assign(env,{GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'});
  const exec=promisify(execFile),prefix=['-c','core.hooksPath=/dev/null','-c','http.followRedirects=false','-c','http.lowSpeedLimit=1024','-c','http.lowSpeedTime=15','-c','transfer.fsckObjects=true'];
  const remaining=()=>{const value=P.totalTimeoutMs-(Date.now()-started);if(value<=0)fail('Git archive total deadline exceeded');return value;};
  const run=(args,{maximumBytes=128*1024}={})=>exec('git',[...prefix,...args],{cwd:root,env,encoding:'buffer',timeout:remaining(),maxBuffer:maximumBytes});
  await mkdir(temporary);
  try{
    await run(['init','--bare','--template=',temporary]);
    await run(['-C',temporary,'fetch','--depth=1','--no-tags','--no-recurse-submodules','--no-write-fetch-head','https://github.com/'+P.repository+'.git',head]);
    const actual=(await run(['-C',temporary,'rev-parse',head+'^{tree}'])).stdout.toString('utf8').trim();
    if(actual!==expectedTree)fail('Fetched archive commit/tree mismatch');
    const listing=(await run(['-C',temporary,'ls-tree','-r','-l','-z','--full-tree',head],{maximumBytes:8*1024*1024})).stdout;
    const text=listing.toString('utf8');if(!Buffer.from(text,'utf8').equals(listing))fail('Non-UTF-8 archive Git paths');
    const listed=text.split('\0');if(listed.pop()!=='')fail('Incomplete archive Git tree listing');
    const actualEntries=listed.map(line=>{
      const match=/^(100644) blob ([a-f0-9]{40}) +([0-9]+)\t(.+)$/.exec(line);
      if(!match||!safePath(match[4]))fail('Unsafe fetched archive Git tree entry');
      return {path:match[4],mode:match[1],type:'blob',sha:match[2],size:Number(match[3])};
    }).sort((a,b)=>a.path.localeCompare(b.path));
    const expected=entries.map(({path,mode,type,sha,size})=>({path,mode,type,sha,size})).sort((a,b)=>a.path.localeCompare(b.path));
    if(json(actualEntries)!==json(expected))fail('Fetched archive Git inventory differs from the bounded API tree');
    const unique=[...new Map(entries.map(entry=>[entry.sha,entry])).values()],blobs=new Map();
    const child=spawn('git',[...prefix,'-C',temporary,'cat-file','--batch'],{cwd:root,env,stdio:['pipe','pipe','pipe']});
    let stderrBytes=0,total=0,position=0,header=Buffer.alloc(0),body=null,processError=null;
    const timer=setTimeout(()=>child.kill('SIGKILL'),remaining());
    const completion=new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>code===0?accept():reject(new Error('Bounded Git object read failed '+String(code??signal))));});
    completion.catch(error=>{processError=error;});
    child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;if(stderrBytes>128*1024)child.kill('SIGKILL');});
    child.stdin.on('error',()=>{});child.stdin.end(unique.map(entry=>entry.sha).join('\n')+'\n');
    try{
      for await(const chunk of child.stdout){
        remaining();let offset=0;
        while(offset<chunk.length){
          if(!body){
            const end=chunk.indexOf(10,offset),count=(end<0?chunk.length:end)-offset;
            if(header.length+count>128)fail('Oversized Git object header');
            header=Buffer.concat([header,chunk.subarray(offset,offset+count)]);offset+=count;
            if(end<0)break;
            const match=/^([a-f0-9]{40}) blob ([0-9]+)$/.exec(header.toString('ascii')),entry=unique[position];
            if(!entry||!match||match[1]!==entry.sha||Number(match[2])!==entry.size||entry.size>P.maximumBlobBytes)fail('Unexpected Git archive object');
            if(total+entry.size>P.maximumArchiveBytes)throw new RangeError('Git archive object byte budget exceeded');
            body={entry,value:Buffer.alloc(entry.size),filled:0};header=Buffer.alloc(0);offset++;
          }
          const count=Math.min(chunk.length-offset,body.entry.size-body.filled);
          if(count){chunk.copy(body.value,body.filled,offset,offset+count);body.filled+=count;offset+=count;}
          if(body.filled<body.entry.size||offset===chunk.length)continue;
          if(chunk[offset]!==10||blobSha(body.value)!==body.entry.sha)fail('Fetched Git blob hash mismatch');
          total+=body.value.length;blobs.set(body.entry.sha,body.value);body=null;position++;offset++;
        }
      }
      await completion;if(processError)throw processError;
      if(header.length||body||position!==unique.length)fail('Truncated Git archive object stream');
    }catch(error){child.kill('SIGKILL');await completion.catch(()=>{});throw error;}finally{clearTimeout(timer);}
    const files=new Map(entries.map(entry=>[entry.path,Buffer.from(blobs.get(entry.sha))]));
    return {files,receipt:{method:'git-fetch-depth-one-no-checkout',commit:head,tree:expectedTree,startedAt,completedAt:new Date().toISOString(),
      fetchOperations:1,httpRequestCount:null,wireBytes:null,uniqueBlobs:unique.length,decodedBytes:total,allBlobHashesVerified:true,
      apiTreeMatched:true,checkoutPerformed:false,hooksEnabled:false,credentialsPersisted:false}};
  }finally{await rm(temporary,{recursive:true,force:true});}
}

async function checkedDirectory(root,path,{create=false}={}){
  const parts=path.split('/');let current=root;
  for(const part of parts){
    current=resolve(current,part);if(create)await mkdir(current).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const info=await lstat(current),actual=await realpath(current),location=relative(root,actual);
    if(!info.isDirectory()||info.isSymbolicLink()||location.startsWith('..')||isAbsolute(location))fail('Archive directory must remain a regular directory inside the repository');
  }
  return current;
}
async function readDirectory(root,path){
  const directory=await checkedDirectory(root,path),files=new Map();let count=0,total=0;
  async function walk(current,prefix){
    const stream=await opendir(current);
    for await(const entry of stream){
      if(++count>P.maximumTreeEntries)throw new RangeError('Archive directory entry budget exceeded');
      const name=prefix+entry.name,full=resolve(current,entry.name),info=await lstat(full);
      if(info.isSymbolicLink())fail('Archive symlinks are forbidden');
      if(info.isDirectory()){
        if(prefix||!['manifests','pages','objects'].includes(entry.name))fail('Unexpected archive directory');
        await walk(full,name+'/');
      }else{
        if(!info.isFile()||!safePath(name)||info.size>P.maximumBlobBytes)fail('Unsafe archive file');
        const bytes=await readFile(full);total+=bytes.length;
        if(bytes.length!==info.size||total>P.maximumArchiveBytes)fail('Archive file changed or byte budget exceeded');files.set(name,bytes);
      }
    }
  }
  await walk(directory,'');return snapshotFiles(files);
}
async function saveRemote(root,result){
  const build=await checkedDirectory(root,'build',{create:true}),stage=resolve(build,'eth-archive-remote-stage-'+randomUUID()),destination=resolve(root,remoteDirectory);
  try{await lstat(destination);fail('Remote restore destination already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(result.receipt.status==='absent'){
    if(result.files.size)fail('Absent archive cannot contain restored bytes');
    await writeFile(resolve(root,receiptPath),encoded(result.receipt),{flag:'wx'});return;
  }
  await mkdir(stage);
  try{
    for(const [path,bytes]of result.files){const full=resolve(stage,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,bytes,{flag:'wx'});}
    await rename(stage,destination);await writeFile(resolve(root,receiptPath),encoded(result.receipt),{flag:'wx'});
  }finally{await rm(stage,{recursive:true,force:true});}
}
async function main(){
  const command=process.argv[2];if(process.argv.length!==3||!['read','publish'].includes(command))fail('Use exactly read or publish');
  const root=await realpath(fileURLToPath(new URL('..',import.meta.url))),token=process.env.ETH_ARCHIVE_GITHUB_TOKEN??null;
  if(command==='read'){
    const result=await readEthereumProspectiveArchiveRemote({token,readGitObjects:options=>readGitArchiveObjects({root,...options})});await saveRemote(root,result);
    console.log('ETH_PROSPECTIVE_ARCHIVE_REMOTE_RECEIPT '+json(result.receipt));return;
  }
  const eventPath=process.env.GITHUB_EVENT_PATH;
  if(!eventPath)fail('GitHub event context required for archive publication');
  const eventInfo=await lstat(eventPath);if(!eventInfo.isFile()||eventInfo.isSymbolicLink()||eventInfo.size>1024*1024)fail('Bounded GitHub event file required');
  const event=JSON.parse(await readFile(eventPath,'utf8'));
  const context={eventName:process.env.GITHUB_EVENT_NAME,repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,defaultBranch:event.repository?.default_branch};
  checkContext(context);
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  const source={sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),runId:process.env.GITHUB_RUN_ID};
  if(source.sourceCommit!==process.env.GITHUB_SHA)fail('Archive publisher checkout differs from the triggering source commit');
  if(git('status','--porcelain','--untracked-files=no'))fail('Archive publisher requires unchanged committed source bytes');
  const remoteReceiptFile=resolve(root,receiptPath),info=await lstat(remoteReceiptFile);
  if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)fail('Bounded original restore receipt required');
  const readReceipt=JSON.parse(await readFile(remoteReceiptFile,'utf8'));readBody(readReceipt);
  const [files,previousFiles]=await Promise.all([readDirectory(root,outputDirectory),readDirectory(root,readReceipt.status==='restored'?remoteDirectory:seedDirectory)]);
  const receipt=await publishEthereumProspectiveArchiveRemote({files,previousFiles,readReceipt,source,context,token});
  await writeFile(resolve(root,'build/ethereum-prospective-archive-publication.json'),encoded(receipt),{flag:'wx'});
  console.log('ETH_PROSPECTIVE_ARCHIVE_PUBLICATION_RECEIPT '+json(receipt));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
