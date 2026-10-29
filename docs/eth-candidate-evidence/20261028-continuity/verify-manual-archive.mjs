import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

// Scratch-only review helper. It performs no network requests, Git mutations,
// branch updates, workflow dispatches, or automatic publisher calls.
const configPath=process.argv[2];
if(process.argv.length!==3||!configPath)throw new Error('Pass one absolute audit configuration JSON path');
const config=JSON.parse(await readFile(configPath,'utf8'));
const hex40=/^[a-f0-9]{40}$/,hex64=/^[a-f0-9]{64}$/;
for(const field of ['repositoryRoot','archiveDirectory','previousDirectory','output'])if(!isAbsolute(config[field]??''))throw new Error('Absolute '+field+' required');
if(!resolve(config.output).startsWith('/tmp/'))throw new Error('This helper only writes an intermediate /tmp audit receipt');
if(!hex40.test(config.expectedParent)||!hex40.test(config.source?.sourceCommit)||!hex40.test(config.source?.sourceTree)||!/^\d+$/.test(config.source?.runId??''))throw new Error('Exact source, run, and parent identities required');
const core=await import(pathToFileURL(resolve(config.repositoryRoot,'scripts/ethereum-prospective-archive-core.mjs')));
const io=await import(pathToFileURL(resolve(config.repositoryRoot,'scripts/manage-ethereum-prospective-archive.mjs')));
const remote=await import(pathToFileURL(resolve(config.repositoryRoot,'scripts/ethereum-prospective-archive-remote.mjs')));
const {canonicalForecastJson:canonical}=await import(pathToFileURL(resolve(config.repositoryRoot,'dist/forecast-records.js')));
const sha=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const files=await io.readEthereumArchiveDirectory(config.archiveDirectory),previous=await io.readEthereumArchiveDirectory(config.previousDirectory);
const [next,prior]=await Promise.all([core.verifyEthereumProspectiveArchive({files}),core.verifyEthereumProspectiveArchive({files:previous})]);
if(next.manifest.previousManifestId!==prior.manifest.id||next.manifest.sequence!==prior.manifest.sequence+1)throw new Error('Not an exact one-step manifest successor');
if(canonical(next.manifest.source)!==canonical(config.source))throw new Error('Archive manifest source/run is not the selected successful workflow source');
for(const [path,value]of previous)if(path!=='manifest.json'&&!files.get(path)?.equals(value))throw new Error('Prior immutable archive bytes were changed or removed: '+path);
if(config.initial&&config.expectedParent!==config.source.sourceCommit)throw new Error('Initial data commit must have the selected source as its sole parent');
const expected=remote.ethereumArchiveGitTree(files),previousTree=remote.ethereumArchiveGitTree(previous);
const rows=[...files].map(([path,value])=>({path,mode:'100644',type:'blob',bytes:value.length,sha256:sha(value),sha:blob(value)})).sort((a,b)=>a.path.localeCompare(b.path));
async function load(path){
  const raw=JSON.parse(await readFile(path,'utf8'));
  if(typeof raw.structuredContent?.content==='string')return JSON.parse(raw.structuredContent.content);
  return raw;
}
let sourceSeedVerified=false;
if(config.initial){
  if(!config.sourceCommitJson||!config.sourceTreeJson)throw new Error('Initial audit requires GitHub source commit and recursive source tree JSON');
  const commit=await load(config.sourceCommitJson),tree=await load(config.sourceTreeJson);
  if(commit.sha!==config.source.sourceCommit||commit.tree?.sha!==config.source.sourceTree||tree.sha!==config.source.sourceTree||tree.truncated!==false||!Array.isArray(tree.tree))throw new Error('Initial source commit/tree metadata mismatch');
  const prefix='research-data/ethereum-prospective-archive/';
  const seedRows=tree.tree.filter(entry=>entry.path?.startsWith(prefix)&&entry.type!=='tree');
  if(seedRows.length!==previous.size)throw new Error('Committed seed inventory differs from the previous archive');
  const seen=new Set();
  for(const entry of seedRows){
    const path=entry.path.slice(prefix.length),value=previous.get(path);
    if(seen.has(path)||entry.type!=='blob'||entry.mode!=='100644'||!value||entry.size!==value.length||entry.sha!==blob(value))throw new Error('Initial seed is not the exact committed seed');
    seen.add(path);
  }
  sourceSeedVerified=true;
}
let artifact=null;
if(config.artifact){
  const selected=config.artifact;
  if(!isAbsolute(selected.path??'')||!hex64.test(selected.sha256)||!Number.isSafeInteger(selected.bytes)||selected.bytes<1)throw new Error('Exact downloaded artifact bytes/hash required');
  const info=await lstat(selected.path);if(!info.isFile()||info.isSymbolicLink()||info.size!==selected.bytes)throw new Error('Artifact file size/type mismatch');
  const hash=createHash('sha256');for await(const chunk of createReadStream(selected.path))hash.update(chunk);
  if(hash.digest('hex')!==selected.sha256)throw new Error('Artifact ZIP hash mismatch');
  artifact={id:selected.id??null,bytes:selected.bytes,sha256:selected.sha256,actualBytesRehashed:true};
}
let publication=null;
if(config.remoteCommitJson||config.remoteTreeJson||config.remoteRefJson){
  if(!config.remoteCommitJson||!config.remoteTreeJson||!config.remoteRefJson)throw new Error('Readback needs commit, recursive tree, and exact ref metadata');
  const [commit,tree,ref]=await Promise.all([load(config.remoteCommitJson),load(config.remoteTreeJson),load(config.remoteRefJson)]);
  if(!hex40.test(commit.sha)||commit.tree?.sha!==expected.sha||!Array.isArray(commit.parents)||commit.parents.length!==1||commit.parents[0].sha!==config.expectedParent)throw new Error('Manual data commit tree or sole parent mismatch');
  if(ref.ref!=='refs/heads/eth-prospective-archive'||ref.object?.type!=='commit'||ref.object.sha!==commit.sha)throw new Error('Manual data branch readback mismatch');
  if(tree.sha!==expected.sha||tree.truncated!==false||!Array.isArray(tree.tree))throw new Error('Incomplete manual data tree readback');
  const normalized=tree.tree.map(({path,mode,type,sha,size})=>({path,mode,type,sha,...(type==='blob'?{size}:{})})).sort((a,b)=>a.path.localeCompare(b.path));
  if(canonical(normalized)!==canonical(expected.tree))throw new Error('Manual data tree contains missing, additional or changed entries');
  publication={commit:commit.sha,tree:tree.sha,soleParent:config.expectedParent,ref:ref.ref,exactTreeReadbackMatched:true};
}
const receipt={schemaVersion:1,kind:'manual-ethereum-prospective-archive-audit',checkedAt:new Date().toISOString(),
  procedure:'manual-github-connector-publication',automaticPublisherExecuted:false,initial:config.initial===true,
  source:config.source,expectedParent:config.expectedParent,expectedTree:expected.sha,previousTree:previousTree.sha,
  previousManifestId:prior.manifest.id,manifestId:next.manifest.id,sequence:next.manifest.sequence,
  previousFiles:previous.size,files:files.size,bytes:rows.reduce((sum,row)=>sum+row.bytes,0),
  inventorySha256:sha(Buffer.from(canonical(rows))),inventory:rows,sourceSeedVerified,artifact,publication,
  originalIssuedAt:next.receipt.originalIssuedAt,recordIds:next.receipt.recordIds,observations:next.receipt.observationCount,
  exactPriorImmutableBytesRetained:true,archiveSemanticsVerified:true,networkRequests:0,remoteWrites:0,
  releaseAuthorized:false,productionPromoted:false,providerAuthenticity:false};
await writeFile(config.output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({output:config.output,manifestId:receipt.manifestId,expectedTree:receipt.expectedTree,
  files:receipt.files,bytes:receipt.bytes,sourceSeedVerified,readbackMatched:!!publication}));
