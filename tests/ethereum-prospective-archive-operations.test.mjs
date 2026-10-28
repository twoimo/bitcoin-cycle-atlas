import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {readEthereumCalibrationInputs} from '../scripts/build-ethereum-prospective-calibration-readiness.mjs';
import {createAssetOutcomeSnapshot,assetOutcomeSnapshotEntry} from '../dist/asset-outcome-records.js';
import {ETH_PROSPECTIVE_ARCHIVE_POLICY,buildEthereumProspectiveArchive,verifyEthereumProspectiveArchive,
  restoreEthereumProspectiveArchive} from '../scripts/ethereum-prospective-archive-core.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY,ethereumArchiveGitTree} from '../scripts/ethereum-prospective-archive-remote.mjs';
import {readEthereumArchiveDirectory,writeEthereumArchiveDirectory,collectEthereumArchiveLogicalInputs} from '../scripts/manage-ethereum-prospective-archive.mjs';
import {openEthereumProspectiveArchiveSource,ethereumProspectiveArchiveSourceInfo as sourceInfo,
  readEthereumProspectiveArchiveFile,visitEthereumProspectiveArchiveRecords} from '../scripts/ethereum-prospective-archive-source.mjs';
import {ETH_ARCHIVE_OPERATION_PATHS as P,restoreEthereumArchiveOperations,openEthereumActiveArchiveSource,
  appendEthereumArchiveOperations,verifyEthereumArchiveOperations,assertEthereumArchiveCollectedInputs,
} from '../scripts/ethereum-prospective-archive-operations.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const encode=value=>Buffer.from(canonicalForecastJson(value)+'\n'),decode=bytes=>JSON.parse(bytes.toString('utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const sourceIdentity={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:'1234'};
const createdAt='2026-10-29T00:00:00.000Z',appendedAt='2026-10-29T01:00:00.000Z';
// Retained seed bytes below are real committed evidence. Added growth samples,
// archive execution clocks, and Git transport contexts are SYNTHETIC fixtures.
// They are never new market captures, actual 501-day history, or accuracy proof.
const seedFiles=await readEthereumArchiveDirectory(resolve(root,P.seed));
const seedVerified=await verifyEthereumProspectiveArchive({files:seedFiles});
const seedProspective=await readEthereumArchiveDirectory(resolve(root,'research-data/ethereum-prospective-ledger'));
const seedOutcomes=await readEthereumArchiveDirectory(resolve(root,'research-data/asset-outcome-ledger'));
const originalRecordIds=seedVerified.receipt.recordIds;
const originalObservationIds=[...seedVerified.logicalFiles.keys()].filter(path=>/^(observations|outcome-observations)\//.test(path))
  .map(path=>path.slice(path.lastIndexOf('/')+1,-5)).sort();
const tinyDocument=JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',dailyHistory:{
  source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,candles:[
    {date:'2024-01-01T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
    {date:'2024-01-02T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
  ]}});
async function syntheticOutcome(index){return createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument:tinyDocument,
  sourceUrl:'https://example.invalid/synthetic-archive-operation-growth-only',
  collectedAt:new Date(Date.parse(createdAt)+index*1000).toISOString()});}
function remoteReceipt(files=new Map(),overrides={}){
  const policy=ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY,restored=files.size>0;
  const entries=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes),gitBlobSha:blob(bytes)}));
  const body={schemaVersion:1,kind:'ethereum-prospective-archive-remote-read',policyVersion:policy.version,
    repository:policy.repository,branch:policy.branch,status:restored?'restored':'absent',
    expectedHead:restored?sourceIdentity.sourceCommit:null,expectedTree:restored?ethereumArchiveGitTree(files).sha:null,
    manifestId:restored?decode(files.get('manifest.json')).id:null,
    inventory:{files:entries.length,bytes:entries.reduce((sum,row)=>sum+row.bytes,0),sha256:sha(Buffer.from(canonicalForecastJson(entries)))},
    absenceProof:restored?null:{repository:policy.repository,repositoryId:123,publicRepositoryReadSucceeded:true,exactBranchReadReturned404:true},
    transport:{method:'synthetic-test-fixture-no-network',startedAt:createdAt,completedAt:createdAt},
    automaticSeedFallback:false,allGitBlobsVerified:restored,allArchiveBytesVerified:restored,providerAuthenticity:false,
    productionPromoted:false,releaseAuthorized:false,...overrides};
  return {id:sha(Buffer.from(canonicalForecastJson(body))),...body};
}
async function put(repositoryRoot,path,bytes){
  const full=resolve(repositoryRoot,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,bytes);
}
const absent=path=>assert.rejects(access(path),error=>error.code==='ENOENT');
async function fixture(t,{remote=null}={}){
  const repositoryRoot=await mkdtemp(resolve(tmpdir(),'eth-archive-operations-'));t.after(()=>rm(repositoryRoot,{recursive:true,force:true}));
  for(const [path,files]of [[P.seed,seedFiles],['research-data/ethereum-prospective-ledger',seedProspective],['research-data/asset-outcome-ledger',seedOutcomes]])
    await writeEthereumArchiveDirectory({repositoryRoot,path,files});
  if(remote){
    await writeEthereumArchiveDirectory({repositoryRoot,path:P.remote,files:remote});
    await put(repositoryRoot,P.remoteReceipt,encode(remoteReceipt(remote)));
  }
  return repositoryRoot;
}
const restore=repositoryRoot=>restoreEthereumArchiveOperations({repositoryRoot,now:()=>createdAt});
const append=repositoryRoot=>appendEthereumArchiveOperations({repositoryRoot,sourceIdentity,now:()=>appendedAt});
const verify=repositoryRoot=>verifyEthereumArchiveOperations({repositoryRoot,sourceIdentity});
async function addCurrentOutcome(repositoryRoot,snapshot){
  await put(repositoryRoot,P.outcomes+'/observations/'+snapshot.id+'.json',encode(snapshot));
  await put(repositoryRoot,P.outcomes+'/index.json',encode({schemaVersion:1,kind:'atlas-asset-outcome-index',
    observations:[assetOutcomeSnapshotEntry(snapshot)],evaluations:[],latestEvaluationId:null}));
}
async function assertEmptyCurrentDelta(repositoryRoot){
  const prospective=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.prospective));
  const outcomes=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.outcomes));
  assert.deepEqual([...prospective.keys()],['index.json']);assert.deepEqual([...outcomes.keys()],['index.json']);
  assert.deepEqual(decode(prospective.get('index.json')).entries,[]);
  assert.deepEqual(decode(outcomes.get('index.json')).observations,[]);
  assert.ok(prospective.get('index.json').length<ETH_PROSPECTIVE_ARCHIVE_POLICY.maximumActiveIndexBytes);
  assert.ok(outcomes.get('index.json').length<ETH_PROSPECTIVE_ARCHIVE_POLICY.maximumActiveIndexBytes);
}
let growthPromise;
function syntheticGrowth(){
  return growthPromise??=(async()=>{
    const files=new Map(),ids=[];
    for(let index=0;index<501;index++){const snapshot=await syntheticOutcome(index);files.set('outcome-observations/'+snapshot.id+'.json',encode(snapshot));ids.push(snapshot.id);}
    return {...await buildEthereumProspectiveArchive({files,previous:seedFiles,source:sourceIdentity,createdAt}),syntheticObservationIds:ids.sort()};
  })();
}

test('committed seed plus 501 synthetic independent vintages survive restore, append, verification and a fresh remote restore byte-for-byte',async t=>{
  const growth=await syntheticGrowth(),repositoryRoot=await fixture(t,{remote:growth.files});
  const restored=await restore(repositoryRoot);
  assert.equal(restored.mode,'archive-backed');assert.equal(restored.basis,'verified-remote-branch');
  assert.equal(restored.restoration.flatGlobalIndexCreated,false);assert.equal(restored.restoration.legacyFlatLimitsUnchanged,true);
  assert.equal(restored.restoration.currentDeltaRecords,0);assert.equal(restored.restoration.currentDeltaObservations,0);
  assert.deepEqual(restored.preservedRecordIds,originalRecordIds);
  assert.deepEqual(restored.preservedObservationIds,[...originalObservationIds,...growth.syntheticObservationIds].sort());
  await assertEmptyCurrentDelta(repositoryRoot);
  await assert.rejects(()=>restoreEthereumProspectiveArchive(growth),/unchanged active observation limit/);
  await assert.rejects(()=>readEthereumCalibrationInputs({repositoryRoot}),/Archive-backed workspace.*legacy flat reader cannot represent retained history/);

  const next=await syntheticOutcome(1000);await addCurrentOutcome(repositoryRoot,next);
  const before=await openEthereumActiveArchiveSource({repositoryRoot}),beforeInfo=sourceInfo(before);
  assert.equal(beforeInfo.observations,originalObservationIds.length+502);
  const appended=await append(repositoryRoot),verification=await verify(repositoryRoot);
  assert.equal(appended.status,'appended-and-restored');assert.equal(appended.mode,'archive-backed');
  assert.equal(appended.sequence,growth.manifest.sequence+1);assert.equal(appended.previousManifestId,growth.manifest.id);
  assert.deepEqual(appended.newRecordIds,[]);assert.deepEqual(appended.newObservationIds,[next.id]);
  assert.equal(appended.exactPreviousFilesRetained,true);assert.equal(appended.roundTripOriginalBytesMatched,true);
  assert.equal(appended.restoration.flatGlobalIndexCreated,false);assert.equal(appended.remotePublished,false);
  assert.equal(verification.status,'verified');assert.equal(verification.observations,beforeInfo.observations);
  assert.equal(verification.completeInventoryVerified,true);assert.equal(verification.releaseAuthorized,false);
  const output=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.output));
  for(const [path,bytes]of growth.files)if(path!=='manifest.json')assert.deepEqual(output.get(path),bytes,'retained physical '+path);
  const after=await openEthereumProspectiveArchiveSource({repositoryRoot,archivePath:P.output}),afterInfo=sourceInfo(after);
  assert.deepEqual(afterInfo.recordIds,beforeInfo.recordIds);assert.deepEqual(afterInfo.observationIds,beforeInfo.observationIds);
  for(const descriptor of beforeInfo.logicalDescriptors){
    const saved=afterInfo.logicalDescriptors.find(row=>row.path===descriptor.path);assert.ok(saved,descriptor.path);
    for(const field of ['bytes','sha256','gitBlobSha','objectPath'])assert.equal(saved[field],descriptor[field],descriptor.path+' '+field);
    assert.deepEqual(await readEthereumProspectiveArchiveFile(after,descriptor.path),await readEthereumProspectiveArchiveFile(before,descriptor.path),descriptor.path);
  }
  await visitEthereumProspectiveArchiveRecords(after,record=>{
    assert.equal(record.issuedAt,seedVerified.receipt.originalIssuedAt[record.id]);assert.equal(record.output.path.length,731);
  });

  const fresh=await fixture(t,{remote:output}),freshReceipt=await restore(fresh);
  assert.equal(freshReceipt.manifestId,appended.manifestId);assert.equal(freshReceipt.expectedRemoteHead,sourceIdentity.sourceCommit);
  assert.deepEqual(freshReceipt.preservedRecordIds,beforeInfo.recordIds);assert.deepEqual(freshReceipt.preservedObservationIds,beforeInfo.observationIds);
  await assertEmptyCurrentDelta(fresh);
  const freshPrevious=await readEthereumArchiveDirectory(resolve(fresh,P.previous));
  assert.equal(freshPrevious.size,output.size);for(const [path,bytes]of output)assert.deepEqual(freshPrevious.get(path),bytes,'fresh '+path);
  await assert.rejects(()=>restoreEthereumProspectiveArchive({files:output}),/unchanged active observation limit/);
});

test('a seed-only restore keeps an empty current delta while authenticating every original archive input',async t=>{
  const repositoryRoot=await fixture(t),receipt=await restore(repositoryRoot);await assertEmptyCurrentDelta(repositoryRoot);
  assert.equal(receipt.basis,'committed-seed');assert.equal(receipt.manifestId,seedVerified.manifest.id);
  const source=await openEthereumActiveArchiveSource({repositoryRoot}),summary=sourceInfo(source);
  assert.deepEqual(summary.recordIds,originalRecordIds);assert.deepEqual(summary.observationIds,originalObservationIds);
  assert.equal(summary.foreignObservationIds.length,2);assert.equal(summary.limits.maximumActiveObservations,500);
  for(const [path,bytes]of seedVerified.logicalFiles)assert.deepEqual(await readEthereumProspectiveArchiveFile(source,path),bytes);
});

test('every restore destination is checked before any new archive evidence or marker is promoted',async t=>{
  const repositoryRoot=await fixture(t);await put(repositoryRoot,P.prospective+'/index.json',encode({unexpected:true}));
  await assert.rejects(()=>restore(repositoryRoot),/destination contains different evidence/);
  await absent(resolve(repositoryRoot,P.previous));await absent(resolve(repositoryRoot,P.outcomes));await absent(resolve(repositoryRoot,P.active));
});

test('remote receipt failures never become an automatic seed fallback',async t=>{
  for(const mode of ['missing-receipt','claimed-absent','missing-files','malformed','wrong-manifest','changed-receipt-hash'])await t.test(mode,async t=>{
    const repositoryRoot=await fixture(t);
    if(['missing-receipt','claimed-absent','wrong-manifest','changed-receipt-hash'].includes(mode))
      await writeEthereumArchiveDirectory({repositoryRoot,path:P.remote,files:seedFiles});
    if(mode==='claimed-absent')await put(repositoryRoot,P.remoteReceipt,encode(remoteReceipt()));
    if(mode==='missing-files')await put(repositoryRoot,P.remoteReceipt,encode(remoteReceipt(seedFiles)));
    if(mode==='malformed')await put(repositoryRoot,P.remoteReceipt,Buffer.from('{broken'));
    if(mode==='wrong-manifest')await put(repositoryRoot,P.remoteReceipt,encode(remoteReceipt(seedFiles,{manifestId:'0'.repeat(64)})));
    if(mode==='changed-receipt-hash')await put(repositoryRoot,P.remoteReceipt,encode({...remoteReceipt(seedFiles),id:'0'.repeat(64)}));
    await assert.rejects(()=>restore(repositoryRoot));
    await absent(resolve(repositoryRoot,P.previous));await absent(resolve(repositoryRoot,P.active));
  });
});

test('an explicit valid absent receipt can select the complete committed seed',async t=>{
  const repositoryRoot=await fixture(t);await put(repositoryRoot,P.remoteReceipt,encode(remoteReceipt()));
  const receipt=await restore(repositoryRoot);assert.equal(receipt.basis,'explicitly-absent-remote-with-committed-seed');
  assert.deepEqual(receipt.preservedObservationIds,originalObservationIds);
  assert.deepEqual(sourceInfo(await openEthereumActiveArchiveSource({repositoryRoot})).recordIds,originalRecordIds);
});

test('a fully valid independent remote archive cannot substitute for the retained committed seed prefix',async t=>{
  const unrelated=await buildEthereumProspectiveArchive({files:new Map(),source:sourceIdentity,createdAt});
  const repositoryRoot=await fixture(t,{remote:unrelated.files});
  await assert.rejects(()=>restore(repositoryRoot),/changed or omitted original physical evidence/);
  await absent(resolve(repositoryRoot,P.previous));await absent(resolve(repositoryRoot,P.active));
});

test('missing or corrupt prior original bytes block both active open and append despite an old successful restore receipt',async t=>{
  for(const mode of ['missing','corrupt'])await t.test(mode,async t=>{
    const repositoryRoot=await fixture(t);await restore(repositoryRoot);
    const entry=seedVerified.entries.find(row=>row.path.startsWith('records/'));
    if(mode==='missing')await rm(resolve(repositoryRoot,P.previous,entry.objectPath));
    else {const changed=Buffer.from(seedFiles.get(entry.objectPath));changed[changed.length-2]^=1;await put(repositoryRoot,P.previous+'/'+entry.objectPath,changed);}
    await assert.rejects(()=>openEthereumActiveArchiveSource({repositoryRoot}),/raw-byte|Git-blob|missing|Unlisted/i);
    await assert.rejects(()=>append(repositoryRoot),/raw-byte|Git-blob|missing|Unlisted/i);
    await absent(resolve(repositoryRoot,P.output));await absent(resolve(repositoryRoot,P.appendReceipt));
  });
});

test('routing marker fields cannot widen archive paths or trust a caller verification flag',async t=>{
  const repositoryRoot=await fixture(t);await restore(repositoryRoot);
  const marker=decode(await readFile(resolve(repositoryRoot,P.active)));
  for(const change of [{archivePath:P.output},{mode:'flat'},{verified:true},{manifestId:'f'.repeat(64)}]){
    await put(repositoryRoot,P.active,encode({...marker,...change}));
    await assert.rejects(()=>openEthereumActiveArchiveSource({repositoryRoot}),/marker|restore/i);
  }
  await put(repositoryRoot,P.active,encode(marker));
  assert.equal(sourceInfo(await openEthereumActiveArchiveSource({repositoryRoot})).archiveManifestId,seedVerified.manifest.id);
});

test('matching forged marker and restore receipt cannot authorize a different valid descendant from the originally selected seed',async t=>{
  const repositoryRoot=await fixture(t);await restore(repositoryRoot);
  const added=await syntheticOutcome(2000),different=await buildEthereumProspectiveArchive({
    files:new Map([['outcome-observations/'+added.id+'.json',encode(added)]]),previous:seedFiles,source:sourceIdentity,createdAt});
  await rm(resolve(repositoryRoot,P.previous),{recursive:true,force:true});
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.previous,files:different.files});
  const marker=decode(await readFile(resolve(repositoryRoot,P.active))),receipt=decode(await readFile(resolve(repositoryRoot,P.restoreReceipt)));
  await put(repositoryRoot,P.active,encode({...marker,manifestId:different.manifest.id}));
  await put(repositoryRoot,P.restoreReceipt,encode({...receipt,manifestId:different.manifest.id,sequence:different.manifest.sequence,
    archive:different.receipt,preservedObservationIds:[...originalObservationIds,added.id].sort()}));
  await assert.rejects(()=>openEthereumActiveArchiveSource({repositoryRoot}),/exact selected seed/);
  await assert.rejects(()=>append(repositoryRoot),/exact selected seed/);await absent(resolve(repositoryRoot,P.output));
});

test('the original remote read files and receipt remain mandatory after restore',async t=>{
  const repositoryRoot=await fixture(t,{remote:seedFiles});await restore(repositoryRoot);
  await rm(resolve(repositoryRoot,P.remote),{recursive:true,force:true});
  await assert.rejects(()=>openEthereumActiveArchiveSource({repositoryRoot}),/original remote read bytes/);
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.remote,files:seedFiles});
  const receipt=remoteReceipt(seedFiles);receipt.inventory.sha256='0'.repeat(64);
  const {id,...body}=receipt;await put(repositoryRoot,P.remoteReceipt,encode({id:sha(Buffer.from(canonicalForecastJson(body))),...body}));
  await assert.rejects(()=>openEthereumActiveArchiveSource({repositoryRoot}),/inventory|byte|receipt/i);
});

test('separate collection must preserve every pinned logical byte and cannot add, omit or corrupt a buffer',async t=>{
  const repositoryRoot=await fixture(t);await restore(repositoryRoot);
  const added=await syntheticOutcome(3000);await addCurrentOutcome(repositoryRoot,added);
  const source=await openEthereumActiveArchiveSource({repositoryRoot}),files=await collectEthereumArchiveLogicalInputs({repositoryRoot});
  const previousLogicalFiles=seedVerified.logicalFiles,args={source,previousLogicalFiles,files};
  await assertEthereumArchiveCollectedInputs(args);
  const path='outcome-observations/'+added.id+'.json',changed=new Map(files),bytes=Buffer.from(changed.get(path));bytes[bytes.length-2]^=1;changed.set(path,bytes);
  await assert.rejects(async()=>assertEthereumArchiveCollectedInputs({...args,files:changed}),/differ|changed|pinned/i);
  const missing=new Map(files);missing.delete(path);
  await assert.rejects(async()=>assertEthereumArchiveCollectedInputs({...args,files:missing}),/omit|pinned/i);
  const extra=new Map(files),unseen=await syntheticOutcome(3001);extra.set('outcome-observations/'+unseen.id+'.json',encode(unseen));
  await assert.rejects(async()=>assertEthereumArchiveCollectedInputs({...args,files:extra}),/differ|pinned/i);
  const missingPrior=new Map(previousLogicalFiles),archiveOnly=[...missingPrior.keys()].find(path=>!files.has(path));assert.ok(archiveOnly);
  missingPrior.delete(archiveOnly);
  await assert.rejects(async()=>assertEthereumArchiveCollectedInputs({...args,previousLogicalFiles:missingPrior}),/omit|pinned/i);
  await assert.rejects(async()=>assertEthereumArchiveCollectedInputs({...args,source:{verified:true,...sourceInfo(source)}}),/opaque verified archive source/);
  await absent(resolve(repositoryRoot,P.output));
});

test('mutable restore summary counts cannot relabel retained evidence as new',async t=>{
  const repositoryRoot=await fixture(t);await restore(repositoryRoot);
  const receipt=decode(await readFile(resolve(repositoryRoot,P.restoreReceipt)));
  await put(repositoryRoot,P.restoreReceipt,encode({...receipt,preservedRecordIds:[],preservedObservationIds:[],inputSourceId:'0'.repeat(64)}));
  const appended=await append(repositoryRoot);
  assert.deepEqual(appended.newRecordIds,[]);assert.deepEqual(appended.newObservationIds,[]);
  assert.deepEqual(appended.preservedRecordIds,originalRecordIds);assert.deepEqual(appended.preservedObservationIds,originalObservationIds);
  await verify(repositoryRoot);
});

test('verification checks original output bytes and the exact append source identity',async t=>{
  const repositoryRoot=await fixture(t);await restore(repositoryRoot);await append(repositoryRoot);
  const receipt=decode(await readFile(resolve(repositoryRoot,P.appendReceipt)));
  await put(repositoryRoot,P.appendReceipt,encode({...receipt,source:{...sourceIdentity,sourceCommit:'c'.repeat(40)}}));
  await assert.rejects(()=>verify(repositoryRoot),/exact append\/source/);
  await put(repositoryRoot,P.appendReceipt,encode(receipt));
  const entry=seedVerified.entries.find(row=>row.path.startsWith('records/')),changed=Buffer.from(seedFiles.get(entry.objectPath));changed[0]^=1;
  await put(repositoryRoot,P.output+'/'+entry.objectPath,changed);
  await assert.rejects(()=>verify(repositoryRoot),/raw-byte or Git-blob mismatch/);await absent(resolve(repositoryRoot,P.verifyReceipt));
});
