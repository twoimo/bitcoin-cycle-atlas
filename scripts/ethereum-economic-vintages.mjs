/** Offline append-only observation ledger. Existing capture collectors own network IO. */
import {readFile,writeFile,mkdir,realpath,stat,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {inspectEconomicEvidenceFiles} from './build-ethereum-economic-evidence-coverage.mjs';
import {ETH_ECONOMIC_VINTAGES_VERSION,sha256,contentId,safePath,utc,createEconomicVintageRecord,validateEconomicVintageRecord,appendEconomicVintages,selectEconomicVintages} from './ethereum-economic-vintages-core.mjs';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const SEED='research-data/ethereum-economic-vintages',OUTPUT='build/ethereum-economic-vintages';
const ownSources=['scripts/ethereum-economic-vintages-core.mjs','scripts/ethereum-economic-vintages.mjs'];
const fileKey=file=>contentId({path:file.path,sha256:file.sha256});
const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function exists(path){try{await stat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function safeRead(root,path){
  assert(safePath(path),'Unsafe vintage file path');const actual=await realpath(resolve(root,path)),rel=relative(root,actual);
  assert(!rel.startsWith('..')&&!isAbsolute(rel),'Vintage file escapes repository');const meta=await stat(actual);
  assert(meta.isFile()&&meta.size>0&&meta.size<=32*1024*1024,'Vintage input must be a bounded file');return readFile(actual);
}
async function confinedMkdir(root,path){
  const rel=relative(root,path);assert(!rel.startsWith('..')&&!isAbsolute(rel),'Output directory escapes repository');let current=root;
  for(const part of rel.split('/').filter(Boolean)){current=resolve(current,part);if(!await exists(current))await mkdir(current);const real=await realpath(current),inside=relative(root,real);assert(!inside.startsWith('..')&&!isAbsolute(inside),'Output directory symlink escapes repository');}
}
async function immutableWrite(root,path,bytes){
  assert(safePath(path),'Unsafe output path');const target=resolve(root,path);await confinedMkdir(root,dirname(target));
  if(await exists(target)){assert.deepEqual(await safeRead(root,path),bytes,'Immutable vintage output would change: '+path);return;}
  // The output directory is checked for confinement before any write.
  const parent=await realpath(dirname(target));assert(!relative(root,parent).startsWith('..')&&!isAbsolute(relative(root,parent)),'Output parent escapes repository');
  await writeFile(target,bytes,{flag:'wx'});
}
async function readSeed(root,directory){
  assert(safePath(directory),'Unsafe ledger directory');if(!await exists(resolve(root,directory+'/index.json'))){assert(!await exists(resolve(root,directory)),'Existing seed directory is missing its trusted index');return {records:[],locations:[],indexSha256:null};}
  const indexBytes=await safeRead(root,directory+'/index.json'),index=JSON.parse(indexBytes),manifest=JSON.parse(await safeRead(root,directory+'/files.json'));
  assert(index.version===ETH_ECONOMIC_VINTAGES_VERSION&&Array.isArray(index.recordIds)&&index.recordIds.length<=512,'Invalid vintage index');
  assert(index.ledgerId===contentId(index.recordIds)&&new Set(index.recordIds).size===index.recordIds.length,'Vintage index identity mismatch');
  assert(manifest.version===ETH_ECONOMIC_VINTAGES_VERSION&&Array.isArray(manifest.files)&&manifest.files.length<=51200,'Invalid vintage file locations');
  const locations=new Map();
  for(const file of manifest.files){assert(safePath(file.location)&&/^[a-f0-9]{64}$/.test(file.sha256)&&Number.isSafeInteger(file.bytes),'Invalid vintage locator');const key=fileKey(file);assert(!locations.has(key),'Duplicate vintage locator');locations.set(key,file);}
  const records=[],verifiedFiles=new Map(),used=new Set();let verifiedBytes=0;
  for(const id of index.recordIds){
    assert(/^[a-f0-9]{64}$/.test(id),'Invalid record ID');const record=JSON.parse(await safeRead(root,directory+'/records/'+id+'.json'));
    validateEconomicVintageRecord(record);assert(record.id===id,'Index record differs');
    for(const file of [record.receipt,...record.rawFiles]){
      const key=fileKey(file),location=locations.get(key);assert(location&&location.bytes===file.bytes,'Missing preserved raw locator: '+file.path);used.add(key);
      if(!verifiedFiles.has(key)){const bytes=await safeRead(root,location.location);assert.equal(bytes.length,file.bytes,'Preserved raw bytes differ');assert.equal(sha256(bytes),file.sha256,'Preserved raw hash differs');verifiedBytes+=bytes.length;assert(verifiedBytes<=128*1024*1024,'Seed raw inventory exceeds 128 MiB; use an explicitly bounded archive');verifiedFiles.set(key,bytes);}
    }
    const receipt=JSON.parse(verifiedFiles.get(fileKey(record.receipt)));
    assert.equal(receipt.status,record.collectorStatus,'Preserved collector status differs');
    for(const o of record.observations){const collected=receipt.observation?.collectedAt??receipt.collectedAt;assert.equal(o.clocks.collectedAt,collected,'Preserved acquisition clock differs');}
    await replayPreservedRecord(record,receipt,verifiedFiles);
    records.push(record);
  }
  assert.equal(used.size,locations.size,'Unused raw locator is not part of the supplied ledger');
  // A trusted previous index (here, committed Git data) is needed to detect an
  // omitted seed record. SHA identities are integrity checks, not authenticity.
  return {records,locations:[...locations.values()],indexSha256:sha256(indexBytes),verifiedFiles:verifiedFiles.size};
}

async function replayPreservedRecord(record,receipt,verifiedFiles){
  const temp=await mkdtemp(resolve(tmpdir(),'eth-economic-vintage-replay-'));
  try{
    const directory=record.sourceKind==='coinmetrics'?'build/ethereum-economic-data/capture-vintage':record.sourceKind==='throughput'?'build/ethereum-throughput-supplement/capture-vintage':'build/ethereum-pow-zero';
    await mkdir(resolve(temp,directory),{recursive:true});
    await writeFile(resolve(temp,directory,'receipt.json'),verifiedFiles.get(fileKey(record.receipt)));
    const originalDirectory=dirname(record.receipt.path);
    for(const file of record.rawFiles){
      assert(file.path.startsWith(originalDirectory+'/'),'Raw input is outside its original receipt capture');
      let name=file.path.slice(originalDirectory.length+1);if(record.sourceKind==='coinmetrics'&&name==='eth.csv')name='coinmetrics-eth.csv';
      assert(safePath(name),'Unsafe replay capture name');const destination=resolve(temp,directory,name);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,verifiedFiles.get(fileKey(file)));
    }
    const asOf=new Date(Math.floor(utc(record.recordedAt,'recordedAt')/86400000)*86400000-86400000).toISOString().slice(0,10);
    const report=await inspectEconomicEvidenceFiles({repositoryRoot:temp,asOf,issuedAt:record.recordedAt});
    assert.equal(report.metricDefinitionVersion,record.metricDefinitionVersion,'Preserved vintage needs its reviewed definition adapter; do not silently reinterpret it');
    assert.equal(report.sources.length,1,'Isolated vintage replay must have exactly one source');const source=report.sources[0];
    const replay=createEconomicVintageRecord({source:{...source,receiptPath:record.receipt.path,receiptSha256:record.receipt.sha256},
      observations:report.observations,metrics:report.metrics,metricDefinitionVersion:report.metricDefinitionVersion,receipt,
      files:[record.receipt,...record.rawFiles],recordedAt:record.recordedAt});
    assert.deepEqual(replay,record,'Preserved vintage values/definitions/clocks do not replay from original raw bytes');
  }finally{await rm(temp,{recursive:true,force:true});}
}

function sourceIdentity(){
  let sourceCommit=null,sourceTree=null,sourceIdentityStatus='unavailable';
  try{const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
    sourceCommit=git('rev-parse','HEAD');sourceTree=git('rev-parse','HEAD^{tree}');assert(/^[a-f0-9]{40}$/.test(sourceCommit)&&/^[a-f0-9]{40}$/.test(sourceTree));sourceIdentityStatus='verified-checkout';
  }catch(e){if(process.env.GITHUB_ACTIONS==='true')throw e;}
  return {sourceCommit,sourceTree,sourceIdentityStatus};
}
export async function buildEconomicVintageLedgerFiles({repositoryRoot=ROOT,recordedAt=new Date().toISOString(),asOf=null,
  seedDirectory=SEED,outputDirectory=OUTPUT,verifyPreservedOnly=false}={}){
  const root=await realpath(repositoryRoot);utc(recordedAt,'recordedAt');assert(safePath(outputDirectory)&&safePath(seedDirectory)&&outputDirectory!==seedDirectory,'Distinct safe seed/output directories required');
  if(verifyPreservedOnly){
    const directory=await exists(resolve(root,outputDirectory+'/index.json'))?outputDirectory:seedDirectory,seed=await readSeed(root,directory);
    assert(seed.indexSha256,'No preserved vintage ledger to verify');const selection=selectEconomicVintages(seed.records,{cutoff:recordedAt});
    return {kind:'ethereum-economic-vintages-replay',version:ETH_ECONOMIC_VINTAGES_VERSION,...sourceIdentity(),recordedAt,networkRequests:0,
      seedDirectory:directory,seedIndexSha256:seed.indexSha256,recordCount:seed.records.length,verifiedInputFiles:seed.verifiedFiles,
      newCaptureCount:0,reusedCaptureCount:seed.records.length,replayedCaptures:seed.records.length,selection,modelInputActivated:false,fullModelSnapshotReady:false};
  }
  const seed=await readSeed(root,seedDirectory),cutoff=recordedAt,diagnosticAsOf=asOf??new Date(Math.floor(Date.parse(cutoff)/86400000)*86400000-86400000).toISOString().slice(0,10);
  // Recompute from actual raw files. A saved report alone cannot mint a vintage.
  const report=await inspectEconomicEvidenceFiles({repositoryRoot:root,asOf:diagnosticAsOf,issuedAt:cutoff});
  const newRecords=[],locations=new Map(seed.locations.map(f=>[fileKey(f),f]));
  for(const source of report.sources){
    assert(safePath(source.receiptPath),'Receipt bundles are not standalone acquisition evidence');const receiptBytes=await safeRead(root,source.receiptPath);
    assert.equal(sha256(receiptBytes),source.receiptSha256,'Capture receipt changed during inspection');const receipt=JSON.parse(receiptBytes),directory=dirname(source.receiptPath);
    const files=[];
    for(const [path,hash]of Object.entries(report.provenance.inputSha256)){
      if(path!==source.receiptPath&&!path.startsWith(directory+'/'))continue;
      const bytes=await safeRead(root,path);assert.equal(sha256(bytes),hash,'Input changed after replay: '+path);
      const file={path,sha256:hash,bytes:bytes.length};files.push(file);const key=fileKey(file);
      if(!locations.has(key))locations.set(key,{...file,location:path});
    }
    const observations=report.observations.filter(o=>o.sourceId===source.id&&o.rawBytesVerified&&o.replayedFromRaw);
    newRecords.push(createEconomicVintageRecord({source,observations,metrics:report.metrics,metricDefinitionVersion:report.metricDefinitionVersion,receipt,files,recordedAt}));
  }
  const appended=appendEconomicVintages(seed.records,newRecords),records=appended.records;
  const recordIds=records.map(r=>r.id),index={kind:'ethereum-economic-vintages-index',version:ETH_ECONOMIC_VINTAGES_VERSION,ledgerId:contentId(recordIds),recordIds};
  const filesManifest={kind:'ethereum-economic-vintages-file-locations',version:ETH_ECONOMIC_VINTAGES_VERSION,
    relocationPolicy:'Locations may move only when exact bytes/SHA match; logical original paths and record IDs stay fixed.',files:[...locations.values()].sort((a,b)=>fileKey(a).localeCompare(fileKey(b)))};
  for(const record of records)await immutableWrite(root,outputDirectory+'/records/'+record.id+'.json',jsonBytes(record));
  for(const [name,value]of [['index.json',index],['files.json',filesManifest]])await immutableWrite(root,outputDirectory+'/'+name,jsonBytes(value));
  const selection=selectEconomicVintages(records,{cutoff}),sourceHashes={...report.sourceHashes};
  for(const path of ownSources)sourceHashes[path]=sha256(await readFile(resolve(ROOT,path)));
  const result={kind:'ethereum-economic-vintages-capture',version:ETH_ECONOMIC_VINTAGES_VERSION,...sourceIdentity(),sourceHashes,recordedAt,asOf:diagnosticAsOf,
    coverageVersion:report.version,metricDefinitionVersion:report.metricDefinitionVersion,networkRequests:0,
    seedDirectory,seedIndexSha256:seed.indexSha256,outputDirectory,ledgerId:index.ledgerId,recordCount:records.length,
    newCaptureCount:appended.newCaptureCount,reusedCaptureCount:appended.reusedCaptureCount,
    distinctDataVersions:new Set(records.flatMap(r=>r.observations.map(o=>o.dataVersionId))).size,
    failedOrIncompleteCaptures:records.filter(r=>r.observations.length===0).length,verifiedInputFiles:filesManifest.files.length,selection,
    rawFilesAreReferencedNotDuplicated:true,rawInventoryScope:'only files actually verified and read by the inspector; a failed capture may have receipt-only evidence',recordedAtIsNotCollectedAt:true,numericRepresentationDoesNotProveExactDecimalEquality:true,rawReceiptRevisionsRetained:true,sourceAuthenticityIndependentlyProven:false,
    seedOmissionDetectionRequiresTrustedPreviousIndex:true,eligibleModelSnapshotCount:0,fullModelSnapshotReady:false,modelInputActivated:false,historicalPointInTimeReady:false};
  const resultBytes=jsonBytes(result);await immutableWrite(root,outputDirectory+'/runs/'+sha256(resultBytes)+'.json',resultBytes);
  return result;
}
async function main(){
  const args=process.argv.slice(2);assert(args.length===0||args.length===1&&args[0]==='--verify-preserved-only','Usage: node scripts/ethereum-economic-vintages.mjs [--verify-preserved-only]');
  const result=await buildEconomicVintageLedgerFiles({verifyPreservedOnly:args.includes('--verify-preserved-only')});
  const name=args.length?'replay.json':'receipt.json',path=OUTPUT+'/'+name,bytes=jsonBytes(result);await mkdir(resolve(ROOT,OUTPUT),{recursive:true});await writeFile(resolve(ROOT,path),bytes);
  console.log('ETH_ECONOMIC_VINTAGES_RECEIPT '+JSON.stringify({...result,selection:{...result.selection,selections:undefined},path,bytes:bytes.length,sha256:sha256(bytes)}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
