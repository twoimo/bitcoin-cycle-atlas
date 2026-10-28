import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,symlink,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {buildEthereumProspectiveArchive,verifyEthereumProspectiveArchive} from '../scripts/ethereum-prospective-archive-core.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY,ethereumArchiveGitTree} from '../scripts/ethereum-prospective-archive-remote.mjs';
import {ETH_ARCHIVE_IO_PATHS,readEthereumArchiveDirectory,writeEthereumArchiveDirectory,
  collectEthereumArchiveLogicalInputs,restoreEthereumArchiveIntoRepository,
  appendEthereumArchiveFromRepository} from '../scripts/manage-ethereum-prospective-archive.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),P=ETH_ARCHIVE_IO_PATHS;
const json=value=>canonicalForecastJson(value)+'\n';
// The records and provider bytes below are actual previously committed data.
// Archive creation clocks and source contexts in these temporary-directory
// tests are supplied fixture metadata, not new captures or publications.
const source={sourceCommit:'15b5f65158074d0e2d4e2d6ad0c64a345eed740d',sourceTree:'752b66423d2eafb92507e37b871f43a44262c631',runId:null};
const createdAt='2026-10-27T18:00:00.000Z',appendedAt='2026-10-27T18:10:00.000Z';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function remoteReceiptFixture(files=new Map(),overrides={}){
  const policy=ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY,restored=files.size>0;
  const entries=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>({path,bytes:bytes.length,
    sha256:sha(bytes),gitBlobSha:createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')}));
  const body={schemaVersion:1,kind:'ethereum-prospective-archive-remote-read',policyVersion:policy.version,
    repository:policy.repository,branch:policy.branch,status:restored?'restored':'absent',
    expectedHead:restored?source.sourceCommit:null,expectedTree:restored?ethereumArchiveGitTree(files).sha:null,
    manifestId:restored?JSON.parse(files.get('manifest.json').toString('utf8')).id:null,
    inventory:{files:entries.length,bytes:entries.reduce((sum,entry)=>sum+entry.bytes,0),sha256:sha(Buffer.from(canonicalForecastJson(entries)))},
    absenceProof:restored?null:{repository:policy.repository,repositoryId:123,publicRepositoryReadSucceeded:true,exactBranchReadReturned404:true},
    transport:{method:'test-fixture-no-network',startedAt:createdAt,completedAt:createdAt},
    automaticSeedFallback:false,allGitBlobsVerified:restored,allArchiveBytesVerified:restored,providerAuthenticity:false,
    productionPromoted:false,releaseAuthorized:false,...overrides};
  return {id:sha(Buffer.from(canonicalForecastJson(body))),...body};
}
const seedProspective=await readEthereumArchiveDirectory(resolve(root,'research-data/ethereum-prospective-ledger'));
const seedOutcomes=await readEthereumArchiveDirectory(resolve(root,'research-data/asset-outcome-ledger'));
const priorRun=await readEthereumArchiveDirectory(resolve(root,'docs/eth-candidate-evidence/20261028-operating-inputs/final-run/ethereum-prospective-ledger'));
const priorObservationPath=[...priorRun.keys()].find(path=>path.startsWith('observations/')&&!seedProspective.has(path));
assert.equal(priorObservationPath,'observations/278fc6046b123011216c7c59e678d6ce152824e82fd7cbc0bb843b7a112e5a36.json');

async function put(repositoryRoot,path,bytes){
  const full=resolve(repositoryRoot,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,bytes);
}
async function absent(path){await assert.rejects(access(path),error=>error.code==='ENOENT');}
async function baseRepository(t){
  const repositoryRoot=await mkdtemp(resolve(tmpdir(),'eth-archive-io-'));
  t.after(()=>rm(repositoryRoot,{recursive:true,force:true}));
  await writeEthereumArchiveDirectory({repositoryRoot,path:'research-data/ethereum-prospective-ledger',files:seedProspective});
  await writeEthereumArchiveDirectory({repositoryRoot,path:'research-data/asset-outcome-ledger',files:seedOutcomes});
  return repositoryRoot;
}
let seedArchivePromise;
async function seedArchive(repositoryRoot){
  if(!seedArchivePromise)seedArchivePromise=(async()=>{
    const files=await collectEthereumArchiveLogicalInputs({repositoryRoot});
    return buildEthereumProspectiveArchive({files,source,createdAt});
  })();
  return seedArchivePromise;
}
async function fixture(t){
  const repositoryRoot=await baseRepository(t),seed=await seedArchive(repositoryRoot);
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.seed,files:seed.files});
  return {repositoryRoot,seed};
}
const restore=repositoryRoot=>restoreEthereumArchiveIntoRepository({repositoryRoot,now:()=>createdAt});
const append=repositoryRoot=>appendEthereumArchiveFromRepository({repositoryRoot,source,now:()=>appendedAt});

test('real seed restore, actual prior-run append and fresh remote restore preserve original bytes, clocks and independent ETH evidence',async t=>{
  const first=await fixture(t),restored=await restore(first.repositoryRoot);
  assert.equal(restored.status,'restored');assert.equal(restored.preservedRecordIds.length,3);
  assert.equal(restored.preservedObservationIds.length,3);
  assert.equal(restored.restoration.restoredIndependentObservations,1);
  for(const [path,bytes]of priorRun){
    const full=resolve(first.repositoryRoot,P.prospective,path);
    try{const old=await readFile(full);assert.deepEqual(old,bytes,'existing prior-run file differs: '+path);}
    catch(error){if(error.code!=='ENOENT')throw error;await put(first.repositoryRoot,P.prospective+'/'+path,bytes);}
  }
  const appended=await append(first.repositoryRoot);
  assert.equal(appended.status,'appended-and-restored');assert.deepEqual(appended.newRecordIds,[]);
  assert.deepEqual(appended.newObservationIds,[priorObservationPath.slice('observations/'.length,-5)]);
  assert.equal(appended.preservedObservationIds.length,4);assert.equal(appended.sequence,2);
  assert.equal(appended.roundTripOriginalBytesMatched,true);assert.equal(appended.remotePublished,false);
  assert.deepEqual(appended.originalIssuedAt,restored.originalIssuedAt);
  const output=await readEthereumArchiveDirectory(resolve(first.repositoryRoot,P.output));
  const second=await fixture(t);
  await writeEthereumArchiveDirectory({repositoryRoot:second.repositoryRoot,path:P.remote,files:output});
  await put(second.repositoryRoot,P.remoteReceipt,json(remoteReceiptFixture(output)));
  const rerestored=await restore(second.repositoryRoot);
  assert.equal(rerestored.basis,'verified-remote-branch');assert.equal(rerestored.sequence,2);
  assert.deepEqual(rerestored.originalIssuedAt,restored.originalIssuedAt);
  assert.equal(rerestored.preservedObservationIds.length,4);
  for(const [path,bytes]of seedProspective)assert.deepEqual(await readFile(resolve(second.repositoryRoot,P.prospective,path)),bytes,path);
  assert.deepEqual(await readFile(resolve(second.repositoryRoot,P.prospective,priorObservationPath)),priorRun.get(priorObservationPath));
  const independent=JSON.parse(seedOutcomes.get('index.json').toString('utf8')).observations.find(entry=>entry.symbol==='ETHUSD').path;
  assert.deepEqual(await readFile(resolve(second.repositoryRoot,P.outcomes,independent)),seedOutcomes.get(independent));
});

test('filesystem reads reject root, file, directory and ancestor symlinks before following archive evidence',async t=>{
  const {repositoryRoot}=await fixture(t),real=resolve(repositoryRoot,P.seed);
  const alias=resolve(repositoryRoot,'alias');await symlink(real,alias,'dir');
  await assert.rejects(readEthereumArchiveDirectory(alias),/symlink|regular|ancestor/i);
  const fileLink=resolve(repositoryRoot,'file-link');await mkdir(fileLink);
  await symlink(resolve(real,'manifest.json'),resolve(fileLink,'manifest.json'));
  await assert.rejects(readEthereumArchiveDirectory(fileLink),/inside|symlink|regular/i);
  const directoryLink=resolve(repositoryRoot,'directory-link');await mkdir(directoryLink);
  await symlink(resolve(real,'objects'),resolve(directoryLink,'objects'),'dir');
  await assert.rejects(readEthereumArchiveDirectory(directoryLink),/inside|symlink|regular/i);
  const parentLink=resolve(repositoryRoot,'parent-link');await symlink(resolve(repositoryRoot,'research-data'),parentLink,'dir');
  await assert.rejects(readEthereumArchiveDirectory(resolve(parentLink,'ethereum-prospective-archive')),/symlink|regular|ancestor/i);
});

test('unsafe filesystem names and oversized regular inputs are rejected without accepting an archive',async t=>{
  const repositoryRoot=await baseRepository(t),unsafe=resolve(repositoryRoot,'unsafe'),large=resolve(repositoryRoot,'large');
  await mkdir(unsafe);await writeFile(resolve(unsafe,'bad name.json'),'{}');
  await assert.rejects(readEthereumArchiveDirectory(unsafe),/Unsafe archive filesystem path/);
  await mkdir(large);await writeFile(resolve(large,'large.json'),Buffer.alloc(8*1024*1024+1));
  await assert.rejects(readEthereumArchiveDirectory(large),/byte or file budget/);
});

test('write rejects traversal, symlinked parents and conflicting existing destinations while exact retries are idempotent',async t=>{
  const repositoryRoot=await baseRepository(t),files=new Map([['manifest.json',Buffer.from('original')]]);
  await writeEthereumArchiveDirectory({repositoryRoot,path:'build/example',files});
  await writeEthereumArchiveDirectory({repositoryRoot,path:'build/example',files});
  await assert.rejects(writeEthereumArchiveDirectory({repositoryRoot,path:'build/example',files:new Map([['manifest.json',Buffer.from('changed')]])}),/Refusing to replace/);
  assert.equal(await readFile(resolve(repositoryRoot,'build/example/manifest.json'),'utf8'),'original');
  await assert.rejects(writeEthereumArchiveDirectory({repositoryRoot,path:'../outside',files}),/Unsafe fixed archive output path/);
  await assert.rejects(writeEthereumArchiveDirectory({repositoryRoot,path:'build/traversal',files:new Map([['../escaped',Buffer.from('bad')]])}),/Invalid bounded archive output bytes/);
  await absent(resolve(repositoryRoot,'build/escaped'));await absent(resolve(repositoryRoot,'build/traversal'));
  await symlink(resolve(repositoryRoot,'research-data'),resolve(repositoryRoot,'linked-parent'),'dir');
  await assert.rejects(writeEthereumArchiveDirectory({repositoryRoot,path:'linked-parent/archive',files}),/parent must be a regular directory/);
});

test('all restore destinations are checked before the first archive or ledger promotion',async t=>{
  const {repositoryRoot}=await fixture(t);
  await put(repositoryRoot,P.prospective+'/index.json','{"different":true}\n');
  await assert.rejects(restore(repositoryRoot),/Restore destination already contains different evidence/);
  assert.equal(await readFile(resolve(repositoryRoot,P.prospective,'index.json'),'utf8'),'{"different":true}\n');
  await absent(resolve(repositoryRoot,P.previous));await absent(resolve(repositoryRoot,P.outcomes));
});

test('missing, corrupted and unlisted seed archive files block restoration rather than bootstrap a smaller history',async t=>{
  for(const mode of ['missing','corrupted','unlisted'])await t.test(mode,async t=>{
    const {repositoryRoot,seed}=await fixture(t),path=[...seed.files.keys()].find(path=>path.startsWith('objects/'));
    if(mode==='missing')await rm(resolve(repositoryRoot,P.seed,path));
    else if(mode==='corrupted'){const raw=Buffer.from(seed.files.get(path));raw[0]^=1;await put(repositoryRoot,P.seed+'/'+path,raw);}
    else await put(repositoryRoot,P.seed+'/unlisted.json','{}\n');
    await assert.rejects(restore(repositoryRoot),/raw-byte|missing|Unlisted/i);
    await absent(resolve(repositoryRoot,P.previous));await absent(resolve(repositoryRoot,P.prospective));
  });
});

test('denied, malformed and mismatched remote receipts never turn into an absent-branch seed fallback',async t=>{
  for(const mode of ['denied','malformed','mismatched'])await t.test(mode,async t=>{
    const {repositoryRoot,seed}=await fixture(t);
    if(mode==='denied')await put(repositoryRoot,P.remoteReceipt,json({status:'denied',expectedHead:null}));
    if(mode==='malformed')await put(repositoryRoot,P.remoteReceipt,'{broken');
    if(mode==='mismatched'){
      await writeEthereumArchiveDirectory({repositoryRoot,path:P.remote,files:seed.files});
      await put(repositoryRoot,P.remoteReceipt,json(remoteReceiptFixture(seed.files,{manifestId:'0'.repeat(64)})));
    }
    await assert.rejects(restore(repositoryRoot));
    await absent(resolve(repositoryRoot,P.previous));await absent(resolve(repositoryRoot,P.prospective));
  });
});

test('an explicit absent remote may bootstrap the complete committed seed and records that basis',async t=>{
  const {repositoryRoot}=await fixture(t);
  await put(repositoryRoot,P.remoteReceipt,json(remoteReceiptFixture()));
  const receipt=await restore(repositoryRoot);
  assert.equal(receipt.basis,'explicitly-absent-remote-with-committed-seed');assert.equal(receipt.preservedRecordIds.length,3);
});

test('existing remote files require a successful matching receipt and cannot be ignored as seed-only or absent',async t=>{
  for(const mode of ['missing-receipt','claimed-absent','missing-files'])await t.test(mode,async t=>{
    const {repositoryRoot,seed}=await fixture(t);
    if(mode!=='missing-files')await writeEthereumArchiveDirectory({repositoryRoot,path:P.remote,files:seed.files});
    if(mode==='claimed-absent')await put(repositoryRoot,P.remoteReceipt,json(remoteReceiptFixture()));
    if(mode==='missing-files')await put(repositoryRoot,P.remoteReceipt,json(remoteReceiptFixture(seed.files)));
    await assert.rejects(restore(repositoryRoot),/remote|receipt|fallback/i);
    await absent(resolve(repositoryRoot,P.previous));await absent(resolve(repositoryRoot,P.prospective));
  });
});

test('a modified remote receipt hash is rejected before any archive or ledger is restored',async t=>{
  const {repositoryRoot,seed}=await fixture(t);
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.remote,files:seed.files});
  const receipt=remoteReceiptFixture(seed.files);receipt.id='0'.repeat(64);
  await put(repositoryRoot,P.remoteReceipt,json(receipt));
  await assert.rejects(restore(repositoryRoot),/Invalid remote-read receipt/);
  await absent(resolve(repositoryRoot,P.previous));await absent(resolve(repositoryRoot,P.prospective));
});

test('a valid independent remote archive must still contain the complete committed seed prefix',async t=>{
  const {repositoryRoot}=await fixture(t);
  const empty=await buildEthereumProspectiveArchive({files:new Map(),source,createdAt});
  await verifyEthereumProspectiveArchive({files:empty.files});
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.remote,files:empty.files});
  await put(repositoryRoot,P.remoteReceipt,json(remoteReceiptFixture(empty.files)));
  await assert.rejects(restore(repositoryRoot),/removes or changes a retained file/);
  await absent(resolve(repositoryRoot,P.previous));
});

test('a successful old restore receipt cannot authenticate changed working raw evidence',async t=>{
  const {repositoryRoot}=await fixture(t);await restore(repositoryRoot);
  const path=[...seedProspective.keys()].find(path=>path.startsWith('observations/'));
  const changed=JSON.parse(seedProspective.get(path).toString('utf8'));changed.primaryPrices[0][1]+=1;
  await put(repositoryRoot,P.prospective+'/'+path,json(changed));
  await assert.rejects(append(repositoryRoot),/snapshot source, prices, hash or metadata mismatch|Conflicting/i);
  await absent(resolve(repositoryRoot,P.output));
});

test('previous archive storage cannot conceal deletion of a restored observation that is absent from the committed seed',async t=>{
  const {repositoryRoot,seed}=await fixture(t);
  const continued=await buildEthereumProspectiveArchive({files:priorRun,previous:seed.files,source,createdAt:appendedAt});
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.remote,files:continued.files});
  await put(repositoryRoot,P.remoteReceipt,json(remoteReceiptFixture(continued.files)));
  const restored=await restore(repositoryRoot);assert.equal(restored.preservedObservationIds.length,4);
  await rm(resolve(repositoryRoot,P.prospective,priorObservationPath));
  await assert.rejects(append(repositoryRoot),/missing|remov|omit|changed|preserv/i);
  await absent(resolve(repositoryRoot,P.output));
});

test('mutable restore receipt inventories cannot relabel prior immutable records or observations as new',async t=>{
  const {repositoryRoot}=await fixture(t);await restore(repositoryRoot);
  const old=JSON.parse(await readFile(resolve(repositoryRoot,P.restoreReceipt),'utf8'));
  old.preservedRecordIds=[];old.preservedObservationIds=[];old.originalIssuedAt={};
  await put(repositoryRoot,P.restoreReceipt,json(old));
  const result=await append(repositoryRoot);
  assert.deepEqual(result.newRecordIds,[]);assert.deepEqual(result.newObservationIds,[]);
  assert.equal(result.preservedRecordIds.length,3);assert.equal(result.preservedObservationIds.length,3);
  assert.equal(Object.keys(result.originalIssuedAt).length,3);
});

test('the current restored index still has the unchanged 1 MiB read bound before JSON parsing',async t=>{
  const {repositoryRoot}=await fixture(t);await restore(repositoryRoot);
  const original=await readFile(resolve(repositoryRoot,P.prospective,'index.json'));
  const oversized=Buffer.concat([original,Buffer.alloc(1024*1024+1-original.length,0x20)]);
  assert.equal(oversized.length,1024*1024+1);await put(repositoryRoot,P.prospective+'/index.json',oversized);
  await assert.rejects(append(repositoryRoot),/exceeds byte limit/);await absent(resolve(repositoryRoot,P.output));
});
