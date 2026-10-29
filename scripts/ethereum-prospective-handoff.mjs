import {createHash} from 'node:crypto';
import {readFile,writeFile,appendFile,lstat,realpath} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {verifyEthereumProspectiveArchive} from './ethereum-prospective-archive-core.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY,validateEthereumArchiveRemoteReadReceipt} from './ethereum-prospective-archive-remote.mjs';
import {ETH_ARCHIVE_IO_PATHS,readEthereumArchiveDirectory,writeEthereumArchiveDirectory} from './manage-ethereum-prospective-archive.mjs';

export const ETH_PROSPECTIVE_HANDOFF_POLICY=Object.freeze({
  version:'eth-prospective-publication-handoff-1',repository:ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY.repository,
  maximumFiles:40000,maximumBytes:2*1024*1024*1024,maximumFileBytes:8*1024*1024,maximumMetadataBytes:1024*1024,
  output:'build/ethereum-prospective-publication-handoff',download:'build/ethereum-prospective-publication-download',
  releaseAuthorized:false,productionPromoted:false,
});
const P=ETH_PROSPECTIVE_HANDOFF_POLICY,IO=ETH_ARCHIVE_IO_PATHS,HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const json=canonicalForecastJson,encoded=value=>Buffer.from(json(value)+'\n'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw new Error(message);};
const archivePath=path=>path==='manifest.json'||/^(manifests|pages)\/[a-f0-9]{64}\.json$/.test(path)||/^objects\/[a-f0-9]{64}\.blob$/.test(path);
const sameFiles=(a,b)=>a.size===b.size&&[...a].every(([path,bytes])=>bytes.equals(b.get(path)??Buffer.alloc(0))&&b.has(path));
function exactKeys(value,keys,label){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==keys.sort().join(','))fail('Unexpected '+label+' fields');
}
function contextIdentity(value){
  exactKeys(value,['repository','eventName','ref','defaultBranch','sourceCommit','sourceTree','runId','runAttempt','acquisitionOutcome'],'handoff context');
  if(value.repository!==P.repository||!['schedule','workflow_dispatch'].includes(value.eventName)||
    typeof value.defaultBranch!=='string'||!value.defaultBranch||value.ref!=='refs/heads/'+value.defaultBranch||
    value.defaultBranch===ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY.branch||/[\x00-\x20~^:?*\[\\]/.test(value.defaultBranch)||value.defaultBranch.includes('..')||
    !COMMIT.test(value.sourceCommit)||!COMMIT.test(value.sourceTree)||!/^\d{1,24}$/.test(value.runId)||typeof value.runId!=='string'||
    !/^[1-9]\d{0,9}$/.test(value.runAttempt)||typeof value.runAttempt!=='string'||!['success','failure'].includes(value.acquisitionOutcome))
    fail('Handoff requires the exact daily default-branch run, attempt, source and acquisition outcome');
  return JSON.parse(json(value));
}
function parse(bytes,label,maximum=P.maximumMetadataBytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>maximum)fail('Missing or oversized '+label);
  const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))fail('Invalid UTF-8 '+label);
  const value=JSON.parse(text);if(!encoded(value).equals(bytes))fail('Noncanonical '+label);return value;
}
function capture(files,{bundle=false}={}){
  if(!(files instanceof Map)||files.size>P.maximumFiles)fail('Bounded handoff file Map required');
  let total=0;
  for(const [path,value]of files){
    const valid=typeof path==='string'&&(bundle?(path==='handoff.json'||path==='remote-read.json'||
      path.startsWith('candidate/')&&archivePath(path.slice(10))):archivePath(path));
    if(!valid||!Buffer.isBuffer(value)||value.length>P.maximumFileBytes||(total+=value.length)>P.maximumBytes)fail('Unsafe handoff path, bytes or budget');
  }
  // Reject a combined budget overflow before copying any large input buffers.
  return new Map([...files].map(([path,value])=>[path,Buffer.from(value)]));
}
function inventory(files){
  const entries=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,value])=>({path,bytes:value.length,sha256:sha(value)}));
  return {files:entries.length,bytes:entries.reduce((sum,value)=>sum+value.bytes,0),sha256:sha(Buffer.from(json(entries)))};
}
function predecessorFromVerifiedCandidate(next){
  const id=next.manifest.previousManifestId;
  if(id===null)fail('Handoff must contain exactly one complete append from a verified predecessor');
  const files=next.files,previousBytes=files.get('manifests/'+id+'.json'),manifest=parse(previousBytes,'predecessor manifest');
  const previousFiles=new Map([['manifest.json',previousBytes]]);
  // Candidate verification has already checked this complete bounded ancestry,
  // every page descriptor, every original object and every reference closure.
  for(let ancestor=manifest;ancestor!==null;){
    const path='manifests/'+ancestor.id+'.json';previousFiles.set(path,files.get(path));
    ancestor=ancestor.previousManifestId===null?null:parse(files.get('manifests/'+ancestor.previousManifestId+'.json'),'ancestor manifest');
  }
  for(const expected of manifest.pages){
    const encoded=files.get(expected.path),page=parse(encoded,'predecessor page');previousFiles.set(expected.path,encoded);
    for(const entry of page.entries)previousFiles.set(entry.objectPath,files.get(entry.objectPath));
  }
  return previousFiles;
}
async function pair(expectedPreviousFiles,files,readReceiptBytes,context){
  const readReceipt=parse(readReceiptBytes,'original remote-read receipt');
  const next=await verifyEthereumProspectiveArchive({files}),previousFiles=predecessorFromVerifiedCandidate(next);
  if(expectedPreviousFiles&&!sameFiles(expectedPreviousFiles,previousFiles))fail('Handoff must contain exactly one complete append without changing or removing previously retained archive bytes');
  validateEthereumArchiveRemoteReadReceipt({receipt:readReceipt,files:readReceipt.status==='restored'?previousFiles:new Map()});
  const previous=await verifyEthereumProspectiveArchive({files:previousFiles});
  const source={sourceCommit:context.sourceCommit,sourceTree:context.sourceTree,runId:context.runId};
  if(next.manifest.previousManifestId!==previous.manifest.id||next.manifest.sequence!==previous.manifest.sequence+1||json(next.manifest.source)!==json(source))
    fail('Handoff must contain exactly one complete append from the selected source and run');
  return {readReceipt,previous,next,previousFiles};
}

/** This digest binds a trusted job output to all downloaded bytes. It is not
 * provider authentication or a replacement for the publisher's live ref check. */
export async function createEthereumProspectiveHandoff({previousFiles,files,readReceiptBytes,context}={}){
  context=contextIdentity(context);previousFiles=capture(previousFiles);files=capture(files);
  if(!Buffer.isBuffer(readReceiptBytes)||readReceiptBytes.length>P.maximumMetadataBytes)fail('Original bounded remote-read bytes required');
  readReceiptBytes=Buffer.from(readReceiptBytes);
  const verified=await pair(previousFiles,files,readReceiptBytes,context),payload=new Map([['remote-read.json',readReceiptBytes]]);
  for(const [path,bytes]of files)payload.set('candidate/'+path,bytes);
  capture(payload,{bundle:true});
  const manifest={schemaVersion:1,kind:'ethereum-prospective-publication-handoff',policyVersion:P.version,context,inventory:inventory(payload),
    previousManifestId:verified.previous.manifest.id,manifestId:verified.next.manifest.id,readReceiptId:verified.readReceipt.id,
    expectedRemoteHead:verified.readReceipt.expectedHead,releaseAuthorized:false,productionPromoted:false};
  const manifestBytes=encoded(manifest);if(manifestBytes.length>P.maximumMetadataBytes)fail('Handoff metadata byte budget exceeded');
  payload.set('handoff.json',manifestBytes);capture(payload,{bundle:true});
  return {files:payload,digest:sha(manifestBytes),manifest};
}

export async function verifyEthereumProspectiveHandoff({files,expectedDigest,context}={}){
  context=contextIdentity(context);files=capture(files,{bundle:true});
  if(!HEX.test(expectedDigest)||!files.has('handoff.json')||sha(files.get('handoff.json'))!==expectedDigest)fail('Handoff differs from the trusted preparation digest');
  const manifest=parse(files.get('handoff.json'),'handoff metadata');
  exactKeys(manifest,['schemaVersion','kind','policyVersion','context','inventory','previousManifestId','manifestId','readReceiptId','expectedRemoteHead','releaseAuthorized','productionPromoted'],'handoff manifest');
  if(manifest.schemaVersion!==1||manifest.kind!=='ethereum-prospective-publication-handoff'||manifest.policyVersion!==P.version||
    json(manifest.context)!==json(context)||manifest.releaseAuthorized!==false||manifest.productionPromoted!==false)
    fail('Handoff context, policy or publication state mismatch');
  const payload=new Map(files);payload.delete('handoff.json');
  if(json(manifest.inventory)!==json(inventory(payload)))fail('Handoff payload inventory does not match all original bytes');
  const candidateFiles=new Map();
  for(const [path,bytes]of payload){
    if(path.startsWith('candidate/'))candidateFiles.set(path.slice(10),bytes);
    else if(path!=='remote-read.json')fail('Unexpected handoff payload path');
  }
  const verified=await pair(null,candidateFiles,payload.get('remote-read.json'),context);
  if(manifest.previousManifestId!==verified.previous.manifest.id||manifest.manifestId!==verified.next.manifest.id||
    manifest.readReceiptId!==verified.readReceipt.id||manifest.expectedRemoteHead!==verified.readReceipt.expectedHead)fail('Handoff archive identities differ from verified bytes');
  return {previousFiles:verified.previousFiles,files:candidateFiles,readReceiptBytes:payload.get('remote-read.json'),readReceipt:verified.readReceipt,
    receipt:{schemaVersion:1,kind:'ethereum-prospective-handoff-verification',status:'verified',digest:expectedDigest,context,
      inventory:manifest.inventory,previousManifestId:manifest.previousManifestId,manifestId:manifest.manifestId,
      acquisitionFailed:context.acquisitionOutcome==='failure',remotePublished:false,releaseAuthorized:false,productionPromoted:false}};
}

async function fileBytes(path,{optional=false}={}){
  let info;try{info=await lstat(path);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  if(!info.isFile()||info.isSymbolicLink()||info.size>P.maximumMetadataBytes||await realpath(path)!==resolve(path))fail('Handoff metadata must be a bounded regular file without symlinks');
  const bytes=await readFile(path);if(bytes.length!==info.size||bytes.length>P.maximumMetadataBytes)fail('Handoff metadata changed while reading');return bytes;
}
async function regularRoot(root){
  if(typeof root!=='string'||!isAbsolute(root)||await realpath(root)!==resolve(root))fail('Regular absolute repository root required');return root;
}
export async function sealEthereumHandoffFromRepository({repositoryRoot,context}={}){
  const root=await regularRoot(repositoryRoot),readReceiptBytes=await fileBytes(resolve(root,IO.remoteReceipt));
  const read=parse(readReceiptBytes,'original remote-read receipt');
  const [previousFiles,files]=await Promise.all([
    readEthereumArchiveDirectory(resolve(root,read.status==='restored'?IO.remote:IO.seed)),
    readEthereumArchiveDirectory(resolve(root,IO.output)),
  ]);
  const result=await createEthereumProspectiveHandoff({previousFiles,files,readReceiptBytes,context});
  await writeEthereumArchiveDirectory({repositoryRoot:root,path:P.output,files:result.files});return result;
}
export async function restoreEthereumHandoffIntoRepository({repositoryRoot,context,expectedDigest}={}){
  const root=await regularRoot(repositoryRoot),downloaded=await readEthereumArchiveDirectory(resolve(root,P.download));
  const result=await verifyEthereumProspectiveHandoff({files:downloaded,expectedDigest,context});
  const destinations=[[IO.output,result.files]];
  if(result.readReceipt.status==='restored')destinations.push([IO.remote,result.previousFiles]);
  else{
    const seed=await readEthereumArchiveDirectory(resolve(root,IO.seed));
    if(!sameFiles(seed,result.previousFiles))fail('Absent-branch handoff differs from the exact checkout seed');
    if(await readEthereumArchiveDirectory(resolve(root,IO.remote),{optional:true}))fail('Absent-branch handoff cannot reuse an unrelated remote directory');
  }
  for(const [path,files]of destinations){
    const current=await readEthereumArchiveDirectory(resolve(root,path),{optional:true});
    if(current&&!sameFiles(current,files))fail('Handoff destination contains different existing bytes');
  }
  const receiptPath=resolve(root,IO.remoteReceipt),oldReceipt=await fileBytes(receiptPath,{optional:true});
  if(oldReceipt&&!oldReceipt.equals(result.readReceiptBytes))fail('Handoff remote-read receipt destination conflicts');
  for(const [path,files]of destinations)await writeEthereumArchiveDirectory({repositoryRoot:root,path,files});
  if(!oldReceipt)await writeFile(receiptPath,result.readReceiptBytes,{flag:'wx'});
  return result.receipt;
}

async function main(){
  const command=process.argv[2];if(process.argv.length!==3||!['seal','restore'].includes(command))fail('Use exactly seal or restore');
  const root=await realpath(fileURLToPath(new URL('..',import.meta.url)));
  if(!process.env.GITHUB_EVENT_PATH)fail('Daily workflow event file required');
  const event=JSON.parse((await fileBytes(process.env.GITHUB_EVENT_PATH)).toString('utf8'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  const context={repository:process.env.GITHUB_REPOSITORY,eventName:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,
    defaultBranch:event.repository?.default_branch,sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),
    runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,acquisitionOutcome:process.env.ETH_ARCHIVE_ACQUISITION_OUTCOME};
  contextIdentity(context);
  if(context.sourceCommit!==process.env.GITHUB_SHA||git('status','--porcelain','--untracked-files=no'))fail('Handoff requires unchanged exact triggering source');
  if(command==='seal'){
    const result=await sealEthereumHandoffFromRepository({repositoryRoot:root,context});
    if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'handoff_sha256='+result.digest+'\n');
    console.log('ETH_PROSPECTIVE_HANDOFF '+json({digest:result.digest,...result.manifest}));
  }else{
    const result=await restoreEthereumHandoffIntoRepository({repositoryRoot:root,context,expectedDigest:process.env.ETH_ARCHIVE_HANDOFF_SHA256});
    console.log('ETH_PROSPECTIVE_HANDOFF_VERIFIED '+json(result));
  }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
