import {readFile,lstat,readdir} from 'node:fs/promises';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {ETH_PROSPECTIVE_PRICE_POLICY} from '../dist/ethereum-prospective-prices.js';
import {ETH_ARCHIVE_IO_PATHS,readEthereumArchiveDirectory,writeEthereumArchiveDirectory,collectEthereumArchiveLogicalInputs} from './manage-ethereum-prospective-archive.mjs';
import {buildEthereumProspectiveArchive,verifyEthereumProspectiveArchive,normalizeEthereumProspectiveArchiveInputPath} from './ethereum-prospective-archive-core.mjs';
import {validateEthereumArchiveRemoteReadReceipt,validateEthereumArchiveRemoteReadInventory,ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY} from './ethereum-prospective-archive-remote.mjs';
import {openEthereumProspectiveArchiveSource,ethereumProspectiveArchiveSourceInfo,visitEthereumProspectiveArchiveRecords,
  visitEthereumProspectiveArchiveObservations} from './ethereum-prospective-archive-source.mjs';
import {buildEthereumProspectivePagedCalibrationReport} from './ethereum-prospective-calibration-paged.mjs';
import {prepareEthereumArchiveIssue,collectEthereumArchiveModelIdentities,replayEthereumArchiveSource,evaluateEthereumArchiveSource} from './ethereum-prospective-archive-issuer.mjs';
import {buildEthereumArchiveCapacityReport} from './ethereum-prospective-archive-capacity.mjs';
import {ethereumOperationJson as encoded,ethereumOperationSha as sha,readEthereumOperationJson,
  writeEthereumOperationFile,writeEthereumOperationJson} from './ethereum-prospective-operation-io.mjs';

const P=ETH_ARCHIVE_IO_PATHS,json=canonicalForecastJson;
export const ETH_ARCHIVE_OPERATION_PATHS=Object.freeze({...P,active:'build/ethereum-prospective-archive-active.json',
  evaluation:'build/ethereum-prospective-archive-evaluation.json',readiness:'build/ethereum-prospective-calibration-readiness.json',
  capacity:'build/ethereum-prospective-capacity.json'});
const O=ETH_ARCHIVE_OPERATION_PATHS;
const sameFiles=(a,b)=>a.size===b.size&&[...a].every(([path,bytes])=>bytes.equals(b.get(path)??Buffer.alloc(0))&&b.has(path));
function prefix(previous,next){
  for(const [path,bytes]of previous)if(path!=='manifest.json'&&!next.get(path)?.equals(bytes))throw new Error('Archive continuation changed or omitted original physical evidence: '+path);
}
function bounds(files,{extraBytes=0,extraFiles=0}={}){
  const total=[...files.values()].reduce((sum,bytes)=>sum+bytes.length,0);
  if(files.size+extraFiles>Math.min(40000,ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY.maximumFiles)||total+extraBytes>2*1024*1024*1024||[...files.values()].some(bytes=>bytes.length>8*1024*1024))
    throw new Error('Archive continuation exceeds unchanged filesystem or handoff transport bounds');
  return {files:files.size,bytes:total};
}
async function present(root,paths){
  const found=[];
  for(const path of paths){try{await lstat(resolve(root,path));found.push(path);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return found;
}
async function selectedPrevious(repositoryRoot){
  const seed=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.seed)),seedVerified=await verifyEthereumProspectiveArchive({files:seed});
  const read=await readEthereumOperationJson(repositoryRoot,P.remoteReceipt,{optional:true,maximumBytes:1024*1024});
  const remote=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.remote),{optional:true});
  if(remote&&read?.status!=='restored')throw new Error('Remote bytes have no successful exact read receipt; seed fallback denied');
  if(read)validateEthereumArchiveRemoteReadReceipt({receipt:read,files:remote??new Map()});
  let files=seed,basis='committed-seed';
  if(read?.status==='restored'){
    if(!remote)throw new Error('Successful archive read has no preserved bytes');prefix(seed,remote);files=remote;basis='verified-remote-branch';
  }else if(read?.status==='absent'&&read.expectedHead===null)basis='explicitly-absent-remote-with-committed-seed';
  else if(read)throw new Error('Unknown or failed archive read; seed fallback denied');
  const verified=await verifyEthereumProspectiveArchive({files});
  if(read?.status==='restored'&&verified.manifest.id!==read.manifestId)throw new Error('Read receipt and selected archive disagree');
  return {files,verified,read,basis,seedManifestId:seedVerified.manifest.id};
}

/** Restore the immutable physical archive and an empty bounded current delta.
 * No synthetic global flat index is created and no old evidence is pruned. */
export async function restoreEthereumArchiveOperations({repositoryRoot,now=()=>new Date().toISOString()}={}){
  const selected=await selectedPrevious(repositoryRoot);
  const prospective=new Map([['index.json',encoded({schemaVersion:1,kind:'ethereum-prospective-index',entries:[]})]]);
  const outcomes=new Map([['index.json',encoded({schemaVersion:1,kind:'atlas-asset-outcome-index',observations:[],evaluations:[],latestEvaluationId:null})]]);
  for(const [path,files]of [[P.previous,selected.files],[P.prospective,prospective],[P.outcomes,outcomes]]){
    const existing=await readEthereumArchiveDirectory(resolve(repositoryRoot,path),{optional:true});
    if(existing&&!sameFiles(existing,files))throw new Error('Archive-backed restore destination contains different evidence: '+path);
  }
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.previous,files:selected.files});
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.prospective,files:prospective});
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.outcomes,files:outcomes});
  const marker={schemaVersion:1,kind:'ethereum-prospective-archive-active',mode:'archive-backed',archivePath:P.previous,manifestId:selected.verified.manifest.id};
  await writeEthereumOperationJson(repositoryRoot,O.active,marker);
  const source=await openEthereumActiveArchiveSource({repositoryRoot,requireRestoreReceipt:false}),info=ethereumProspectiveArchiveSourceInfo(source);
  const receipt={schemaVersion:1,kind:'ethereum-prospective-archive-restore',mode:'archive-backed',status:'restored',completedAt:now(),
    basis:selected.basis,manifestId:info.archiveManifestId,sequence:info.archiveSequence,seedManifestId:selected.seedManifestId,
    expectedRemoteHead:selected.read?.expectedHead??null,archive:selected.verified.receipt,
    inputSourceId:info.id,preservedRecordIds:info.recordIds,preservedObservationIds:info.observationIds,
    restoration:{mode:'archive-backed',records:info.records,observations:info.observations,flatGlobalIndexCreated:false,
      currentDeltaRecords:0,currentDeltaObservations:0,legacyFlatLimitsUnchanged:true},
    existingRecordsChanged:false,archiveBytesRevalidated:true,productionPromoted:false,releaseAuthorized:false};
  await writeEthereumOperationJson(repositoryRoot,P.restoreReceipt,receipt,{immutable:false});return receipt;
}

export async function openEthereumActiveArchiveSource({repositoryRoot,requireRestoreReceipt=true}={}){
  const marker=await readEthereumOperationJson(repositoryRoot,O.active,{maximumBytes:1024*1024});
  if(json(Object.keys(marker).sort())!==json(['archivePath','kind','manifestId','mode','schemaVersion'])||marker.schemaVersion!==1||
    marker.kind!=='ethereum-prospective-archive-active'||marker.mode!=='archive-backed'||marker.archivePath!==P.previous||!/^[a-f0-9]{64}$/.test(marker.manifestId))
    throw new Error('Exact archive-backed routing marker required');
  if(requireRestoreReceipt){
    const receipt=await readEthereumOperationJson(repositoryRoot,P.restoreReceipt);
    if(receipt.status!=='restored'||receipt.mode!=='archive-backed'||receipt.manifestId!==marker.manifestId)throw new Error('Archive marker differs from successful restore');
  }
  const source=await openEthereumProspectiveArchiveSource({repositoryRoot,archivePath:P.previous,expectedManifestId:marker.manifestId,
    prospectivePaths:await present(repositoryRoot,['research-data/ethereum-prospective-ledger',P.prospective]),
    outcomePaths:await present(repositoryRoot,['research-data/asset-outcome-ledger','build/asset-outcome-ledger',P.outcomes])});
  const info=ethereumProspectiveArchiveSourceInfo(source),seed=await openEthereumProspectiveArchiveSource({repositoryRoot,archivePath:P.seed});
  const seedInfo=ethereumProspectiveArchiveSourceInfo(seed);
  for(const [path,descriptor]of Object.entries(seedInfo.archiveFiles))if(path!=='manifest.json'&&json(info.archiveFiles[path])!==json(descriptor))
    throw new Error('Active archive changed or omitted committed seed evidence');
  const read=await readEthereumOperationJson(repositoryRoot,P.remoteReceipt,{optional:true,maximumBytes:1024*1024});
  const remotePresent=(await present(repositoryRoot,[P.remote])).length!==0;
  if(read?.status==='restored'){
    if(!remotePresent)throw new Error('Active archive lost its original remote read bytes');
    const remote=await openEthereumProspectiveArchiveSource({repositoryRoot,archivePath:P.remote,expectedManifestId:read.manifestId});
    const remoteInfo=ethereumProspectiveArchiveSourceInfo(remote);
    if(json(remoteInfo.archiveFiles)!==json(info.archiveFiles))throw new Error('Active predecessor differs from original remote read bytes');
    validateEthereumArchiveRemoteReadInventory({receipt:read,manifestId:info.archiveManifestId,
      entries:Object.entries(info.archiveFiles).map(([path,value])=>({path,...value}))});
  }else{
    if(remotePresent)throw new Error('Active archive has unbound remote bytes; seed fallback denied');
    if(read)validateEthereumArchiveRemoteReadReceipt({receipt:read,files:new Map()});
    if(json(info.archiveFiles)!==json(seedInfo.archiveFiles))throw new Error('Active archive differs from exact selected seed');
  }
  // Extra anchor reads above must not turn a stale active token into authority.
  await visitEthereumProspectiveArchiveObservations(source,async()=>{});
  return source;
}

/** Preflight the actual planned immutable bytes against the existing archive
 * format. It preserves the builder's finite full-map bound and claims no
 * constant-memory append. Publisher/handoff still enforce their own final sizes. */
export async function preflightEthereumArchiveDelta({repositoryRoot,sourceIdentity,files,now=()=>new Date().toISOString()}={}){
  const source=await openEthereumActiveArchiveSource({repositoryRoot}),info=ethereumProspectiveArchiveSourceInfo(source);
  const previous=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.previous));
  if(previous.size!==Object.keys(info.archiveFiles).length||[...previous].some(([path,bytes])=>
    !info.archiveFiles[path]||info.archiveFiles[path].bytes!==bytes.length||info.archiveFiles[path].sha256!==sha(bytes)))
    throw new Error('Planned archive predecessor differs from pinned original bytes');
  const verifiedPrevious=await verifyEthereumProspectiveArchive({files:previous});
  const input=await collectEthereumArchiveLogicalInputs({repositoryRoot});
  assertEthereumArchiveCollectedInputs({source,previousLogicalFiles:verifiedPrevious.logicalFiles,files:input});
  for(const [path,bytes]of files){
    const normalized=normalizeEthereumProspectiveArchiveInputPath(path,bytes);
    if(input.has(normalized)&&!input.get(normalized).equals(bytes))throw new Error('Planned operation conflicts with original evidence');
    input.set(normalized,bytes);
  }
  const result=await buildEthereumProspectiveArchive({files:input,previous,source:sourceIdentity,createdAt:now()});
  const transport=bounds(result.files);
  await visitEthereumProspectiveArchiveObservations(source,async()=>{});
  return {manifestId:result.manifest.id,transport,scope:'Planned capture and forecast bytes; final receipts and handoff are rechecked before append/publication',limitsChanged:false};
}

async function saveDelta(root,files){
  // Every immutable file is complete before the mutable current-run index moves.
  for(const [path,bytes]of files)if(path!=='index.json')await writeEthereumOperationFile(root,P.prospective+'/'+path,bytes);
  if(files.has('index.json'))await writeEthereumOperationFile(root,P.prospective+'/index.json',files.get('index.json'),{immutable:false});
}
async function persistCheckpoint(root,value){
  const bytes=encoded(value);await writeEthereumOperationFile(root,P.prospective+'/receipts/'+sha(bytes)+'.json',bytes);
}
export async function issueEthereumArchiveOperations({repositoryRoot,sourceIdentity,capture,now=()=>new Date().toISOString()}={}){
  const source=await openEthereumActiveArchiveSource({repositoryRoot});
  const prepared=await prepareEthereumArchiveIssue({repositoryRoot,source,sourceIdentity,capture,now});
  const receipt=prepared.receipt;
  if(receipt.status!=='blocked'){
    try{receipt.projectedArchiveBudget=await preflightEthereumArchiveDelta({repositoryRoot,sourceIdentity,files:prepared.files,now});}
    catch(error){
      for(const path of prepared.files.keys())if(!/^(acquisitions|raw)\//.test(path))prepared.files.delete(path);
      receipt.status='blocked';receipt.newRecords=0;receipt.newSnapshots=0;receipt.reusedRecords=0;receipt.errors.push({name:error.name,message:error.message});
    }
  }
  await saveDelta(repositoryRoot,prepared.files);
  if(receipt.status!=='blocked'){
    try{
      // The source is reopened after the new delta exists. During each verified
      // visit all result files stay in memory; writes happen only afterward.
      const current=await openEthereumActiveArchiveSource({repositoryRoot}),identities=await collectEthereumArchiveModelIdentities(repositoryRoot);
      const result=await evaluateEthereumArchiveSource({source:current,evaluatedAt:now(),...identities});
      await saveDelta(repositoryRoot,result.files);
      await writeEthereumOperationJson(repositoryRoot,O.evaluation,result.report,{immutable:false});
      const evaluationBytes=encoded(result.report),evaluationSha=sha(evaluationBytes);
      receipt.evaluation={id:result.report.id,evaluatedAt:result.report.evaluatedAt,pending:result.report.pending,
        missingObservations:result.report.missingObservations,scored:result.report.scored,
        checkpoint:{path:'receipts/'+evaluationSha+'.json',bytes:evaluationBytes.length,sha256:evaluationSha}};
      receipt.prospectiveScoredTargets=result.report.scored;
    }catch(error){receipt.status='blocked';receipt.errors.push({name:error.name,message:error.message});}
  }
  receipt.finishedAt=now();
  await writeEthereumOperationJson(repositoryRoot,P.prospective+'/receipt.json',receipt,{immutable:false});
  await writeEthereumOperationJson(repositoryRoot,P.prospective+'/issuances/'+await forecastHash(receipt)+'.json',receipt);
  return {...receipt,acquisition:prepared.acquisition};
}

export async function replayEthereumArchiveOperations({repositoryRoot}={}){
  const source=await openEthereumActiveArchiveSource({repositoryRoot}),identities=await collectEthereumArchiveModelIdentities(repositoryRoot);
  const result=await replayEthereumArchiveSource({source,models:identities.models});
  const evaluation=await evaluateEthereumArchiveSource({source,evaluatedAt:new Date().toISOString(),...identities});
  await saveDelta(repositoryRoot,result.files);
  await saveDelta(repositoryRoot,evaluation.files);
  await writeEthereumOperationJson(repositoryRoot,O.evaluation,evaluation.report,{immutable:false});
  await writeEthereumOperationJson(repositoryRoot,P.prospective+'/replay-receipt.json',result.report,{immutable:false});return result.report;
}
export async function readinessEthereumArchiveOperations({repositoryRoot,sourceIdentity,informationCutoffAt=new Date().toISOString()}={}){
  const source=await openEthereumActiveArchiveSource({repositoryRoot}),identities=await collectEthereumArchiveModelIdentities(repositoryRoot);
  const replay=await replayEthereumArchiveSource({source,models:identities.models});
  const readiness=await buildEthereumProspectivePagedCalibrationReport({source,informationCutoffAt,bindings:replay.bindings});
  const body={schemaVersion:1,kind:'ethereum-prospective-archive-calibration-report',readiness,
    actualSourceReplay:replay.report,actualSourceReplayPerformed:true,actualFreezesCreated:0,actualCalibratedRecordsIssued:0,
    existingRecordsChanged:false,releaseAuthorized:false,productionPromoted:false};
  const report={id:await forecastHash(body),...body},result={report,provenance:{...sourceIdentity,executedAt:new Date().toISOString()}};
  await saveDelta(repositoryRoot,replay.files);await persistCheckpoint(repositoryRoot,report);
  await writeEthereumOperationJson(repositoryRoot,O.readiness,result,{immutable:false});
  if(readiness.results.some(row=>row.invalidObservations.length||row.invalidSelectedForecasts))throw new Error('Invalid preserved calibration evidence; inspect the archive-backed report');
  return result;
}

/** Compare the separately collected bytes with the whole opaque pinned source,
 * including checkpoints and failed acquisition bodies that have no record ID. */
export function assertEthereumArchiveCollectedInputs({source,previousLogicalFiles,files}={}){
  if(!(previousLogicalFiles instanceof Map)||!(files instanceof Map))throw new TypeError('Exact logical byte maps required');
  const info=ethereumProspectiveArchiveSourceInfo(source),pinned=new Map(info.logicalDescriptors.map(row=>[row.path,row]));
  for(const [path,bytes]of files){
    const expected=pinned.get(path);
    if(!Buffer.isBuffer(bytes)||!expected||expected.bytes!==bytes.length||expected.sha256!==sha(bytes))throw new Error('Collected archive bytes differ from complete pinned source: '+path);
  }
  const complete=new Map(previousLogicalFiles);
  for(const [path,bytes]of files)complete.set(path,bytes);
  if(complete.size!==pinned.size||[...complete].some(([path,bytes])=>!Buffer.isBuffer(bytes)||!pinned.has(path)||pinned.get(path).bytes!==bytes.length||pinned.get(path).sha256!==sha(bytes)))
    throw new Error('Archive append omitted or changed a pinned logical input');
  return {logicalFiles:complete.size,allPinnedLogicalBytesMatched:true};
}

export async function appendEthereumArchiveOperations({repositoryRoot,sourceIdentity,now=()=>new Date().toISOString()}={}){
  const source=await openEthereumActiveArchiveSource({repositoryRoot}),info=ethereumProspectiveArchiveSourceInfo(source);
  const selected=await selectedPrevious(repositoryRoot),previous=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.previous));
  if(!sameFiles(previous,selected.files)||info.archiveManifestId!==selected.verified.manifest.id)throw new Error('Append predecessor differs from original selected read bytes');
  const input=await collectEthereumArchiveLogicalInputs({repositoryRoot});
  assertEthereumArchiveCollectedInputs({source,previousLogicalFiles:selected.verified.logicalFiles,files:input});
  // Authenticate the pinned complete input inventory again after the separate
  // byte-map collector; callbacks intentionally keep no parsed snapshots.
  await visitEthereumProspectiveArchiveRecords(source,async()=>{});
  await visitEthereumProspectiveArchiveObservations(source,async()=>{});
  const next=await buildEthereumProspectiveArchive({files:input,previous,source:sourceIdentity,createdAt:now()});
  prefix(previous,next.files);const transport=bounds(next.files);
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.output,files:next.files});
  const restored=await openEthereumProspectiveArchiveSource({repositoryRoot,archivePath:P.output,expectedManifestId:next.manifest.id});
  const after=ethereumProspectiveArchiveSourceInfo(restored),beforeRecords=new Set(selected.verified.semantics.records.map(row=>row.id));
  const beforeObservations=new Set([...selected.verified.logicalFiles.keys()].filter(path=>/^(observations|outcome-observations)\//.test(path)).map(path=>path.slice(path.lastIndexOf('/')+1,-5)));
  if(json(after.recordIds)!==json(info.recordIds)||json(after.observationIds)!==json(info.observationIds))throw new Error('Archive append round-trip changed the complete semantic inventory');
  const receipt={schemaVersion:1,kind:'ethereum-prospective-archive-append',mode:'archive-backed',status:'appended-and-restored',completedAt:now(),source:sourceIdentity,
    previousManifestId:info.archiveManifestId,manifestId:after.archiveManifestId,sequence:after.archiveSequence,archive:next.receipt,transport,
    restoration:{mode:'archive-backed',records:after.records,observations:after.observations,flatGlobalIndexCreated:false,completeInventoryVerified:true},
    newRecordIds:after.recordIds.filter(id=>!beforeRecords.has(id)),newObservationIds:after.observationIds.filter(id=>!beforeObservations.has(id)),
    preservedRecordIds:after.recordIds,preservedObservationIds:after.observationIds,exactPreviousFilesRetained:true,roundTripOriginalBytesMatched:true,
    existingRecordsChanged:false,remotePublished:false,productionPromoted:false,releaseAuthorized:false};
  await writeEthereumOperationJson(repositoryRoot,P.appendReceipt,receipt,{immutable:false});return receipt;
}
export async function verifyEthereumArchiveOperations({repositoryRoot,sourceIdentity}={}){
  const source=await openEthereumProspectiveArchiveSource({repositoryRoot,archivePath:P.output}),info=ethereumProspectiveArchiveSourceInfo(source);
  const appended=await readEthereumOperationJson(repositoryRoot,P.appendReceipt);
  if(appended.manifestId!==info.archiveManifestId||json(appended.source)!==json(sourceIdentity))throw new Error('Verified archive differs from this exact append/source');
  const receipt={schemaVersion:1,kind:'ethereum-prospective-archive-verification',mode:'archive-backed',status:'verified',source:sourceIdentity,
    completedAt:new Date().toISOString(),manifestId:info.archiveManifestId,archiveSequence:info.archiveSequence,
    records:info.records,observations:info.observations,allAncestorReferenceClosuresVerified:true,completeInventoryVerified:true,
    flatGlobalIndexCreated:false,networkRequests:0,remotePublished:false,productionPromoted:false,releaseAuthorized:false};
  await writeEthereumOperationJson(repositoryRoot,P.verifyReceipt,receipt,{immutable:false});return receipt;
}

async function sourceIdentity(root){
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim(),sourceFiles={};
  async function visit(path){
    if(Object.hasOwn(sourceFiles,path))return;
    if(path.startsWith('..')||isAbsolute(path))throw new Error('Operation source dependency leaves repository');
    const bytes=await readFile(resolve(root,path));sourceFiles[path]=sha(bytes);
    for(const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))
      await visit(relative(root,resolve(dirname(resolve(root,path)),match[1].split('?')[0])).replaceAll('\\','/'));
  }
  await visit('scripts/ethereum-prospective-archive-operations.mjs');
  if(git('status','--porcelain','--',...Object.keys(sourceFiles),P.seed,'research-data/ethereum-prospective-ledger','research-data/asset-outcome-ledger',
    '.github/workflows','scripts/build-eth-review-evidence.mjs',ETH_PROSPECTIVE_PRICE_POLICY.basePath))
    throw new Error('Archive operations require committed source, seed, and base inputs');
  return {sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),runId:process.env.GITHUB_RUN_ID??null};
}
async function main(){
  const [command,...extra]=process.argv.slice(2),root=fileURLToPath(new URL('..',import.meta.url));
  if(extra.length||!['restore','issue','replay','readiness','capacity','append','verify'].includes(command))throw new Error('Use exactly restore, issue, replay, readiness, capacity, append, or verify');
  const identity=await sourceIdentity(root),args={repositoryRoot:root,sourceIdentity:identity};let result;
  if(command==='restore')result=await restoreEthereumArchiveOperations(args);
  if(command==='issue')result=await issueEthereumArchiveOperations(args);
  if(command==='replay')result=await replayEthereumArchiveOperations(args);
  if(command==='readiness')result=await readinessEthereumArchiveOperations(args);
  if(command==='capacity'){
    const source=await openEthereumActiveArchiveSource(args);result=await buildEthereumArchiveCapacityReport({source,repositoryRoot:root,informationCutoffAt:new Date().toISOString()});
    await writeEthereumOperationJson(root,O.capacity,result,{immutable:false});
  }
  if(command==='append')result=await appendEthereumArchiveOperations(args);
  if(command==='verify')result=await verifyEthereumArchiveOperations(args);
  console.log('ETH_PROSPECTIVE_ARCHIVE_'+command.toUpperCase()+'_RECEIPT '+json(result));
  if(result.status==='blocked')process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
