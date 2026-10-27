import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {readEthereumCalibrationInputs} from '../scripts/build-ethereum-prospective-calibration-readiness.mjs';
import {createEthereumProspectiveCalibrationSession,buildEthereumProspectiveCalibrationReadinessBatch} from '../scripts/ethereum-prospective-calibration-core.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),candidate='research-data/ethereum-prospective-ledger';
const originalIndex=JSON.parse(await readFile(join(root,candidate,'index.json'),'utf8'));
const entry=originalIndex.entries[0];
const recordText=await readFile(join(root,candidate,entry.recordPath),'utf8');
const snapshotText=await readFile(join(root,candidate,entry.snapshotPath),'utf8');
const emptyOutcomes={schemaVersion:1,kind:'atlas-asset-outcome-index',observations:[],evaluations:[],latestEvaluationId:null};
const text=value=>canonicalForecastJson(value)+'\n';
async function put(directory,path,value){
  const file=join(directory,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,typeof value==='string'?value:text(value));
}
async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'eth-calibration-loader-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  await put(directory,candidate+'/index.json',{...originalIndex,entries:[entry]});
  await put(directory,candidate+'/'+entry.recordPath,recordText);
  await put(directory,candidate+'/'+entry.snapshotPath,snapshotText);
  await put(directory,'research-data/asset-outcome-ledger/index.json',emptyOutcomes);
  return directory;
}
const load=repositoryRoot=>readEthereumCalibrationInputs({repositoryRoot});

test('retained ledger remains readable when a new issuer never produced a build index',async t=>{
  const directory=await fixture(t),result=await load(directory);
  assert.deepEqual(result.records.map(value=>value.id),[entry.id]);
  assert.equal(result.observations.length,0);
  assert.equal(result.directories.find(value=>value.path==='build/ethereum-prospective-ledger').indexPresent,false);
  assert.equal(Object.keys(result.inputFiles).length,4);
});

test('identical retained and current records are counted once and both input inventories remain bound',async t=>{
  const directory=await fixture(t),build='build/ethereum-prospective-ledger';
  await put(directory,build+'/index.json',{...originalIndex,entries:[entry]});
  await put(directory,build+'/'+entry.recordPath,recordText);
  await put(directory,build+'/'+entry.snapshotPath,snapshotText);
  const result=await load(directory);
  assert.equal(result.records.length,1);assert.equal(Object.keys(result.snapshots).length,1);
  assert.ok(result.inputFiles[candidate+'/index.json']);assert.ok(result.inputFiles[build+'/index.json']);
});

test('index time and model metadata cannot disagree with the immutable record',async t=>{
  const directory=await fixture(t);
  await put(directory,candidate+'/index.json',{...originalIndex,entries:[{...entry,asOf:'2020-01-01'}]});
  await assert.rejects(()=>load(directory),/index metadata mismatch/);
});

test('index traversal and duplicate run entries fail before fallback or selection',async t=>{
  const directory=await fixture(t);
  await put(directory,candidate+'/index.json',{...originalIndex,entries:[{...entry,recordPath:'../../outside.json'}]});
  await assert.rejects(()=>load(directory),/Unsafe or duplicate/);
  await put(directory,candidate+'/index.json',{...originalIndex,entries:[entry,entry]});
  await assert.rejects(()=>load(directory),/Unsafe or duplicate/);
});

test('a missing file in a present current index is an error, not permission to ignore that index',async t=>{
  const directory=await fixture(t);
  await put(directory,'build/ethereum-prospective-ledger/index.json',{...originalIndex,entries:[entry]});
  await assert.rejects(()=>load(directory),error=>error.code==='ENOENT');
});

test('a captured observation survives an interrupted issue even when its build index is absent',async t=>{
  const directory=await fixture(t);
  await put(directory,'build/ethereum-prospective-ledger/observations/'+entry.snapshotId+'.json',snapshotText);
  const result=await load(directory);
  assert.deepEqual(result.observations.map(value=>value.id),[entry.snapshotId]);
  assert.equal(result.directories.find(value=>value.path==='build/ethereum-prospective-ledger').indexPresent,false);
});

test('an acquisition filename cannot rename an immutable observed snapshot',async t=>{
  const directory=await fixture(t);
  await put(directory,'build/ethereum-prospective-ledger/observations/'+'a'.repeat(64)+'.json',snapshotText);
  await assert.rejects(()=>load(directory),/filename mismatch/);
});

test('independent ETH outcome metadata is bound to its preserved raw observation',async t=>{
  const directory=await fixture(t),outcomes='research-data/asset-outcome-ledger';
  const index=JSON.parse(await readFile(join(root,outcomes,'index.json'),'utf8'));
  const source=index.observations.find(value=>value.symbol==='ETHUSD');
  await put(directory,outcomes+'/'+source.path,await readFile(join(root,outcomes,source.path),'utf8'));
  await put(directory,outcomes+'/index.json',{...emptyOutcomes,observations:[source]});
  assert.equal((await load(directory)).observations.length,1);
  await put(directory,outcomes+'/index.json',{...emptyOutcomes,observations:[{...source,collectedAt:'2030-01-01T00:00:00.000Z'}]});
  await assert.rejects(()=>load(directory),/Outcome calibration index metadata mismatch/);
});

test('an oversized source index fails on its byte limit before JSON decoding',async t=>{
  const directory=await fixture(t);
  await put(directory,'build/ethereum-prospective-ledger/index.json',' '.repeat(1024*1024+1));
  await assert.rejects(()=>load(directory),/exceeds byte limit/);
});

test('an oversized acquisition directory is rejected before any untrusted file body is parsed',async t=>{
  const directory=await fixture(t),path='build/ethereum-prospective-ledger/observations/';
  for(let index=0;index<501;index++)await put(directory,path+index.toString(16).padStart(64,'0')+'.json','invalid');
  await assert.rejects(()=>load(directory),/Too many preserved calibration observations/);
});

test('an indexed record cannot follow a symlink outside the supplied repository',async t=>{
  const directory=await fixture(t),external=await mkdtemp(join(tmpdir(),'eth-calibration-outside-'));
  t.after(()=>rm(external,{recursive:true,force:true}));
  await put(external,'record.json',recordText);
  await rm(join(directory,candidate,entry.recordPath));
  await symlink(join(external,'record.json'),join(directory,candidate,entry.recordPath));
  await assert.rejects(()=>load(directory),/regular file inside the repository/);
});

test('a prior opaque session cannot make a later loader read trust changed bytes under the same record ID',async t=>{
  const directory=await fixture(t),input=await load(directory),record=input.records[0];
  const session=await createEthereumProspectiveCalibrationSession(input);
  const binding={modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,
    options:record.options,horizonDays:30};
  const args={session,bindings:[binding],informationCutoffAt:record.issuedAt};
  const expected=await buildEthereumProspectiveCalibrationReadinessBatch(args);
  const changed=JSON.parse(recordText);changed.model.sourceHash='0'.repeat(64);
  await put(directory,candidate+'/'+entry.recordPath,changed);
  await assert.rejects(()=>load(directory),/hash|identity|source|mismatch/i);
  // The old token still represents its owned original bytes, never a claim
  // that the current files have been reread or the changed record is valid.
  assert.deepEqual(await buildEthereumProspectiveCalibrationReadinessBatch(args),expected);
});
