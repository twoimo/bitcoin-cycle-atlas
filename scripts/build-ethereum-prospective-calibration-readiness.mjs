import {readFile,readdir,mkdir,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp} from '../dist/forecast-information-time.js';
import {verifyEthereumProspectiveRecord,ethereumProspectiveIndexEntry,replayEthereumProspectiveRecord} from '../dist/ethereum-prospective-dispatch.js';
import {verifyEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {validateAssetOutcomeIndex,verifyAssetOutcomeSnapshot,assetOutcomeSnapshotEntry} from '../dist/asset-outcome-records.js';
import {ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {ETH_POOLED_POLICY} from '../dist/ethereum-pooled-model.js';
import {ETH_WARM_START_PROSPECTIVE_POLICY,ETH_WARM_START_PROSPECTIVE_ENTRY} from '../dist/ethereum-warm-start-prospective.js';
import {collectForecastModelIdentity} from './build-forecast-ledger.mjs';
import {ETH_PROSPECTIVE_CALIBRATION_POLICY,createEthereumProspectiveCalibrationSession,
  buildEthereumProspectiveCalibrationReadinessBatch} from './ethereum-prospective-calibration-core.mjs';

const HEX=/^[a-f0-9]{64}$/,json=canonicalForecastJson;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const CANDIDATES=['research-data/ethereum-prospective-ledger','build/ethereum-prospective-ledger'];
const OUTCOMES=['research-data/asset-outcome-ledger','build/asset-outcome-ledger'];
const ordered=values=>[...values].sort((a,b)=>a.id.localeCompare(b.id));

/** Read both retained seed and current execution evidence. New issuance is not
 * required. Index metadata, original bytes and content-addressed paths agree
 * before a record can influence binding, origin selection or readiness. */
export async function readEthereumCalibrationInputs({repositoryRoot}={}){
  if(typeof repositoryRoot!=='string'||!isAbsolute(repositoryRoot))throw new TypeError('Absolute repository root required');
  repositoryRoot=await realpath(repositoryRoot);
  const records=new Map(),snapshots={},observations=new Map(),inputFiles={},directories=[];
  const paths=new Set();
  async function read(path,{optional=false,canonical=false,maximumBytes=8*1024*1024}={}){
    if(paths.has(path))throw new Error('Duplicate input read '+path);
    paths.add(path);
    let bytes;
    try{
      const file=resolve(repositoryRoot,path),info=await lstat(file),actual=await realpath(file),location=relative(repositoryRoot,actual);
      if(!info.isFile()||info.isSymbolicLink()||location.startsWith('..')||isAbsolute(location))throw new Error('Calibration evidence must be a regular file inside the repository');
      if(info.size>maximumBytes)throw new Error('Calibration evidence exceeds byte limit '+path);
      bytes=await readFile(actual);
      if(bytes.length>maximumBytes)throw new Error('Calibration evidence exceeds byte limit '+path);
    }
    catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
    const text=bytes.toString('utf8');
    if(!Buffer.from(text,'utf8').equals(bytes))throw new Error('Non-UTF-8 calibration evidence '+path);
    const value=JSON.parse(text);
    if(canonical&&text!==json(value)+'\n')throw new Error('Noncanonical immutable calibration evidence '+path);
    inputFiles[path]={bytes:bytes.length,sha256:sha(bytes)};
    return {value,text};
  }
  const retain=(map,value,label)=>{
    if(map.has(value.id)&&json(map.get(value.id))!==json(value))throw new Error('Conflicting immutable '+label);
    map.set(value.id,value);
  };
  for(const directory of CANDIDATES){
    const index=await read(directory+'/index.json',{optional:directory.startsWith('build/'),maximumBytes:1024*1024});
    directories.push({path:directory,indexPresent:index!==null});
    if(index){
      const value=index.value;
      if(value.schemaVersion!==1||value.kind!=='ethereum-prospective-index'||!Array.isArray(value.entries)||value.entries.length>2000)
        throw new Error('Invalid prospective calibration source index');
      const ids=new Set(),runs=new Set();
      for(const entry of value.entries){
        if(!HEX.test(entry.id)||!HEX.test(entry.snapshotId)||entry.recordPath!=='records/'+entry.id+'.json'||
          entry.snapshotPath!=='snapshots/'+entry.snapshotId+'.json'||ids.has(entry.id)||runs.has(entry.runKey))
          throw new Error('Unsafe or duplicate prospective calibration source index');
        ids.add(entry.id);runs.add(entry.runKey);
        if(!records.has(entry.id)&&records.size>=ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumRecords)throw new Error('Too many merged calibration records');
        const record=(await read(directory+'/'+entry.recordPath,{canonical:true,maximumBytes:2*1024*1024})).value;
        const snapshotPath=directory+'/'+entry.snapshotPath;
        let snapshot;
        if(paths.has(snapshotPath))snapshot=snapshots[entry.snapshotId];
        else snapshot=(await read(snapshotPath,{canonical:true})).value;
        await verifyEthereumProspectiveRecord(record,snapshot);
        if(json(ethereumProspectiveIndexEntry(record))!==json(entry))throw new Error('Prospective calibration index metadata mismatch');
        if(snapshots[snapshot.id]&&json(snapshots[snapshot.id])!==json(snapshot))throw new Error('Conflicting forecast snapshot');
        snapshots[snapshot.id]=snapshot;retain(records,record,'record');
      }
    }
    let names=[];
    try{names=await readdir(resolve(repositoryRoot,directory,'observations'),{withFileTypes:true});}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(names.length>ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumObservations)throw new Error('Too many preserved calibration observations');
    for(const entry of names.sort((a,b)=>a.name.localeCompare(b.name))){
      if(!entry.isFile()||!/^[a-f0-9]{64}\.json$/.test(entry.name))throw new Error('Unexpected prospective outcome evidence path');
      if(!observations.has(entry.name.slice(0,-5))&&observations.size>=ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumObservations)throw new Error('Too many merged calibration observations');
      const value=(await read(directory+'/observations/'+entry.name,{canonical:true})).value;
      if(value.id+'.json'!==entry.name)throw new Error('Prospective outcome evidence filename mismatch');
      await verifyEthereumResearchSnapshot(value);retain(observations,value,'outcome observation');
    }
  }
  if(new Set([...records.values()].map(record=>record.runKey)).size!==records.size)
    throw new Error('Conflicting preserved forecast identities for one economic run');
  for(const directory of OUTCOMES){
    const input=await read(directory+'/index.json',{optional:directory.startsWith('build/'),maximumBytes:1024*1024});
    directories.push({path:directory,indexPresent:input!==null});
    if(!input)continue;
    const index=validateAssetOutcomeIndex(input.value);
    for(const entry of index.observations){
      if(entry.symbol!=='ETHUSD')continue;
      if(!observations.has(entry.id)&&observations.size>=ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumObservations)throw new Error('Too many merged calibration observations');
      const value=(await read(directory+'/'+entry.path,{canonical:true})).value;
      await verifyAssetOutcomeSnapshot(value);
      if(json(assetOutcomeSnapshotEntry(value))!==json(entry))throw new Error('Outcome calibration index metadata mismatch');
      retain(observations,value,'outcome observation');
    }
  }
  if(observations.size>ETH_PROSPECTIVE_CALIBRATION_POLICY.maximumObservations)throw new Error('Too many preserved calibration observations');
  return {records:ordered(records.values()),snapshots,observations:ordered(observations.values()),inputFiles,directories};
}

/** No calibration is issued here. Original models are actually reexecuted from
 * their retained raw input bytes before any operational readiness is reported. */
export async function buildEthereumProspectiveCalibrationReport({repositoryRoot,informationCutoffAt}={}){
  const cutoff=normalizeForecastTimestamp(informationCutoffAt,'informationCutoffAt');
  const input=await readEthereumCalibrationInputs({repositoryRoot}),replay=[],models={};
  const bindings=new Map();
  for(const record of input.records){
    if(!models[record.modelKey]){
      const entry=record.modelKey==='warmStart'?ETH_WARM_START_PROSPECTIVE_ENTRY:'dist/ethereum-prospective-records.js';
      const graph=await collectForecastModelIdentity(repositoryRoot,entry);
      const version={adaptive:ETH_ADAPTIVE_POLICY.version,pooled:ETH_POOLED_POLICY.version,warmStart:ETH_WARM_START_PROSPECTIVE_POLICY.modelVersion}[record.modelKey];
      models[record.modelKey]={...graph,version};
    }
    // A missing old graph is not permission to silently drop an old forecast.
    replay.push(await replayEthereumProspectiveRecord({record,snapshot:input.snapshots[record.snapshotId],currentModel:models[record.modelKey]}));
    for(const horizonDays of [30,90,180]){
      const binding={modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,options:record.options,horizonDays};
      bindings.set(json(binding),binding);
    }
  }
  const session=await createEthereumProspectiveCalibrationSession(input);
  const results=await buildEthereumProspectiveCalibrationReadinessBatch({session,informationCutoffAt:cutoff,
    bindings:[...bindings.values()].sort((a,b)=>json(a).localeCompare(json(b)))});
  const ready=results.filter(result=>result.status==='ready-to-freeze');
  const body={schemaVersion:1,kind:'ethereum-prospective-calibration-report',informationCutoffAt:cutoff,
    policy:ETH_PROSPECTIVE_CALIBRATION_POLICY,
    inputFiles:input.inputFiles,directories:input.directories,
    preservedRecordIds:input.records.map(record=>record.id),preservedObservationIds:input.observations.map(snapshot=>snapshot.id),
    preservedRecords:input.records.length,uniqueOrigins:new Set(input.records.map(record=>record.asOf)).size,
    actualSourceReplay:replay,sourceGraphs:Object.fromEntries(Object.entries(models).map(([key,value])=>[key,{sourceHash:value.sourceHash,files:value.files,version:value.version}])),
    results,readyBindings:ready.length,freezeRequired:ready.length>0,
    actualFreezesCreated:0,actualCalibratedRecordsIssued:0,prospectiveCalibratedTargetsScored:0,
    existingRecordsChanged:false,networkRequests:0,productionPromoted:false,coverageGuarantee:false,
    historicalPublicationAuthenticated:false,
    limitation:'Reexecution proves equality to these preserved raw bytes and matching model source. It does not independently authenticate historical collection/publication or prove predictive skill. This command only reports readiness; a full block still requires a separate immutable freeze and later forecast issuance.'};
  return {id:await forecastHash(body),...body};
}

async function main(){
  const root=fileURLToPath(new URL('..',import.meta.url));
  if(process.argv.length!==2)throw new Error('This evidence command takes no options; it uses retained and current build ledgers and the actual current cutoff');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  const sourceFiles={};
  async function visit(path){
    if(Object.hasOwn(sourceFiles,path))return;
    const bytes=await readFile(resolve(root,path));sourceFiles[path]=sha(bytes);
    for(const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const dependency=relative(root,resolve(dirname(resolve(root,path)),match[1].split('?')[0])).replaceAll('\\','/');
      if(dependency.startsWith('..')||isAbsolute(dependency))throw new Error('Calibration evidence dependency leaves repository');
      await visit(dependency);
    }
  }
  await visit('scripts/build-ethereum-prospective-calibration-readiness.mjs');
  if(git('status','--porcelain','--',...Object.keys(sourceFiles)))throw new Error('Commit the calibration report source before collecting evidence');
  const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
  const report=await buildEthereumProspectiveCalibrationReport({repositoryRoot:root,informationCutoffAt:new Date().toISOString()});
  // The content-addressed report is unchanged. Execution provenance belongs to
  // an explicit envelope, not unbound extra fields on the report's hashed body.
  const result={report,provenance:{sourceCommit,sourceTree,sourceFiles,executedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null}};
  const output=resolve(root,'build/ethereum-prospective-calibration-readiness.json');
  await mkdir(dirname(output),{recursive:true});await writeFile(output,json(result)+'\n');
  console.log('ETH_PROSPECTIVE_CALIBRATION_RECEIPT '+JSON.stringify({id:report.id,provenance:result.provenance,
    preservedRecords:report.preservedRecords,uniqueOrigins:report.uniqueOrigins,actualSourceReplay:report.actualSourceReplay,
    readyBindings:report.readyBindings,actualFreezesCreated:0,actualCalibratedRecordsIssued:0,
    results:report.results.map(row=>({modelKey:row.binding.modelKey,horizonDays:row.binding.horizonDays,status:row.status,
      selectedCalibrationCases:row.selectedCalibrationCases,validSelectedOutcomes:row.validSelectedOutcomes,
      pendingRecords:row.pendingRecords.length,invalidObservations:row.invalidObservations.length,logRadius:row.logRadius}))}));
  if(report.results.some(row=>row.invalidObservations.length||row.invalidSelectedForecasts))throw new Error('Invalid preserved calibration evidence; inspect the report');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
