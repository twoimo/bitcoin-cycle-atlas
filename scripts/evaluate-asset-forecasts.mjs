import {readFile,writeFile,mkdir,rename,rm,realpath} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {ASSET_OUTCOME_VERSION,createAssetOutcomeSnapshot,createAssetOutcomeEvaluation,
  assetOutcomeSnapshotEntry,assetOutcomeEvaluationEntry,validateAssetOutcomeIndex,verifyAssetOutcomeArchive} from '../dist/asset-outcome-records.js';
import {readAssetForecastArchive,assetFileIdentity} from './issue-asset-forecasts.mjs';
import {collectForecastModelIdentity} from './build-forecast-ledger.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE_PATHS=Object.freeze({ETHUSD:'dist/data/eth-ohlc.json',BMNR:'dist/data/bmnr-ohlc.json',MSTR:'dist/data/mstr-ohlc.json'});
const SCRIPT='scripts/evaluate-asset-forecasts.mjs';
const json=value=>canonicalForecastJson(value)+'\n';
const equal=(a,b)=>canonicalForecastJson(a)===canonicalForecastJson(b);
const now=()=>new Date().toISOString();
const emptyIndex=()=>({schemaVersion:1,kind:'atlas-asset-outcome-index',observations:[],evaluations:[],latestEvaluationId:null});
const emptyArchive=()=>({index:emptyIndex(),snapshots:{},evaluations:{},texts:new Map()});
const message=error=>String(error?.message??error).slice(0,800);
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:10000}).trim();
function within(parent,child){const r=relative(parent,child);return r===''||!/^(\.\.(?:[\\/]|$)|[\\/]|[A-Za-z]:)/.test(r);}

export async function readAssetOutcomeArchive(directory,records){
  const archive=emptyArchive();let text;
  try{text=await readFile(resolve(directory,'index.json'),'utf8');}
  catch(error){if(error.code==='ENOENT')return archive;throw error;}
  archive.index=validateAssetOutcomeIndex(JSON.parse(text));
  for(const [kind,items]of [['snapshots',archive.index.observations],['evaluations',archive.index.evaluations]]){
    for(const entry of items){
      const raw=await readFile(resolve(directory,entry.path),'utf8');
      archive[kind][entry.id]=JSON.parse(raw);archive.texts.set(entry.path,raw);
    }
  }
  await verifyAssetOutcomeArchive(archive.index,archive.snapshots,archive.evaluations,records);
  return archive;
}
export async function mergeAssetOutcomeArchives(records,...archives){
  const merged=emptyArchive();
  for(const archive of archives){
    await verifyAssetOutcomeArchive(archive.index,archive.snapshots,archive.evaluations,records);
    for(const [kind,indexKey]of [['snapshots','observations'],['evaluations','evaluations']]){
      for(const entry of archive.index[indexKey]){
        const value=archive[kind][entry.id],text=archive.texts.get(entry.path)??json(value);
        if(merged[kind][entry.id]&&!equal(merged[kind][entry.id],value))throw new Error('Immutable outcome content conflict');
        if(merged.texts.has(entry.path)&&merged.texts.get(entry.path)!==text)throw new Error('Immutable outcome byte conflict');
        if(!merged[kind][entry.id])merged.index[indexKey].push(entry);
        merged[kind][entry.id]=value;merged.texts.set(entry.path,text);
      }
    }
  }
  sortIndex(merged.index);
  await verifyAssetOutcomeArchive(merged.index,merged.snapshots,merged.evaluations,records);
  return merged;
}
function sortIndex(index){
  index.observations.sort((a,b)=>a.collectedAt.localeCompare(b.collectedAt)||a.id.localeCompare(b.id));
  index.evaluations.sort((a,b)=>a.evaluatedAt.localeCompare(b.evaluatedAt)||a.id.localeCompare(b.id));
  index.latestEvaluationId=index.evaluations.at(-1)?.id??null;
}

/** This boundary deliberately has no forecast generator, treasury input or
 * latest-session requirement. A stale archive can still contain a valid target. */
export async function collectAssetOutcomes({records,priorSnapshots={},sourceReader,evaluator,clock=now}={}){
  if(typeof sourceReader!=='function')throw new TypeError('An actual per-asset source reader is required');
  const symbols=[...new Set(records.map(r=>r.symbol))].sort(),snapshots={...priorSnapshots},failures=[],attempts=[];
  const acquired=await Promise.allSettled(symbols.map(async symbol=>{
    const source=await sourceReader(symbol);
    const snapshot=await createAssetOutcomeSnapshot({...source,symbol});
    return {symbol,snapshot};
  }));
  for(let index=0;index<acquired.length;index++){
    const item=acquired[index],symbol=symbols[index];
    if(item.status==='rejected'){const reason=message(item.reason);failures.push({symbol,reason});attempts.push({symbol,status:'failed',reason});continue;}
    const candidate=item.value.snapshot;
    const reusable=Object.values(priorSnapshots).filter(old=>old.symbol===symbol&&
      old.sourceDocument===candidate.sourceDocument&&old.sourceReceipt.sourceHash===candidate.sourceReceipt.sourceHash&&
      old.sourceReceipt.publishedAt===candidate.sourceReceipt.publishedAt&&old.sourceReceipt.collectedAt<=candidate.sourceReceipt.collectedAt)
      .sort((a,b)=>a.sourceReceipt.collectedAt.localeCompare(b.sourceReceipt.collectedAt)||a.id.localeCompare(b.id))[0];
    const snapshot=reusable??candidate;snapshots[snapshot.id]=snapshot;
    attempts.push({symbol,status:reusable?'reused':'captured',snapshotId:snapshot.id,
      attemptCollectedAt:candidate.sourceReceipt.collectedAt,attemptSourceUrl:candidate.sourceReceipt.sourceUrl,
      sourceHash:candidate.sourceReceipt.sourceHash,retainedCollectedAt:snapshot.sourceReceipt.collectedAt});
  }
  const evaluatedAt=clock();
  if(attempts.some(a=>a.attemptCollectedAt>evaluatedAt))throw new RangeError('Evaluation clock precedes its actual acquisition');
  const evaluation=await createAssetOutcomeEvaluation({records,observationSnapshots:Object.values(snapshots),evaluatedAt,evaluator,acquisitionFailures:failures});
  return {evaluation,snapshots,attempts,status:failures.length?'partial':'PASS'};
}
export function appendAssetOutcomeEvaluation(archive,collected){
  for(const snapshot of Object.values(collected.snapshots)){
    const entry=assetOutcomeSnapshotEntry(snapshot);
    if(!archive.snapshots[snapshot.id]){
      archive.snapshots[snapshot.id]=snapshot;archive.index.observations.push(entry);archive.texts.set(entry.path,json(snapshot));
    }else if(!equal(archive.snapshots[snapshot.id],snapshot))throw new Error('Immutable retained outcome snapshot conflict');
  }
  const evaluation=collected.evaluation,entry=assetOutcomeEvaluationEntry(evaluation);
  if(!archive.evaluations[evaluation.id]){
    archive.evaluations[evaluation.id]=evaluation;archive.index.evaluations.push(entry);archive.texts.set(entry.path,json(evaluation));
  }else if(!equal(archive.evaluations[evaluation.id],evaluation))throw new Error('Immutable retained evaluation conflict');
  sortIndex(archive.index);return archive;
}
async function writeImmutable(directory,path,text){
  const file=resolve(directory,path);await mkdir(dirname(file),{recursive:true});
  try{await writeFile(file,text,{encoding:'utf8',flag:'wx'});}
  catch(error){if(error.code!=='EEXIST')throw error;if(await readFile(file,'utf8')!==text)throw new Error('Refusing to replace immutable outcome bytes: '+path);}
}
async function writeCurrent(directory,path,text){
  const file=resolve(directory,path),temp=file+'.tmp-'+process.pid;
  await mkdir(dirname(file),{recursive:true});
  try{await writeFile(temp,text,{encoding:'utf8',flag:'wx'});await rename(temp,file);}
  finally{await rm(temp,{force:true});}
}
export async function writeAssetOutcomeArchive(directory,archive,records){
  await verifyAssetOutcomeArchive(archive.index,archive.snapshots,archive.evaluations,records);
  for(const [path,text]of archive.texts)await writeImmutable(directory,path,text);
  await writeCurrent(directory,'index.json',json(archive.index));
  const saved=await readAssetOutcomeArchive(directory,records);
  if(!equal(saved.index,archive.index))throw new Error('Outcome archive read-back mismatch');
}
export function assetOutcomeTransport(path,text){
  if(!path.startsWith('observations/'))return null;
  const snapshot=JSON.parse(text),receipt=snapshot.sourceReceipt,url=new URL(receipt.sourceUrl);
  const match=url.pathname.match(/^\/twoimo\/bitcoin-cycle-atlas\/blob\/([a-f0-9]{40})\/(.+)$/);
  if(url.origin!=='https://github.com'||!match||match[2].includes('..')||json(snapshot)!==text)return null;
  if(createHash('sha256').update(snapshot.sourceDocument).digest('hex')!==receipt.sourceHash)throw new Error('Outcome transport raw source hash mismatch');
  const {sourceDocument,...snapshotTemplate}=snapshot;
  return {kind:'atlas-asset-outcome-snapshot-transport',schemaVersion:1,path,snapshotId:snapshot.id,
    originalFile:assetFileIdentity(text),snapshotTemplate,
    sourceDocumentRef:{gitSourceCommit:match[1],path:match[2],sha256:receipt.sourceHash,bytes:Buffer.byteLength(sourceDocument,'utf8')},
    reconstruction:'Read exact Git UTF-8 bytes into sourceDocument; canonicalForecastJson(snapshot) + LF'};
}
export function emitAssetOutcomeFiles(texts,writeLine=line=>console.log(line)){
  const paths=[...texts.keys()].sort();
  writeLine('ASSET_OUTCOME_FILE_MANIFEST '+JSON.stringify({schemaVersion:1,files:paths.map(path=>({path,...assetFileIdentity(texts.get(path))}))}));
  for(const path of paths){
    const original=texts.get(path),transport=assetOutcomeTransport(path,original),body=transport?json(transport):original,parts=[];
    for(let start=0;start<body.length;){let end=Math.min(start+12000,body.length);if(end<body.length&&body.charCodeAt(end-1)>=0xD800&&body.charCodeAt(end-1)<=0xDBFF)end--;parts.push(body.slice(start,end));start=end;}
    for(let part=0;part<parts.length;part++)writeLine((transport?'ASSET_OUTCOME_SNAPSHOT_TRANSPORT_CHUNK ':'ASSET_OUTCOME_FILE_CHUNK ')+JSON.stringify({
      path,part,total:parts.length,...assetFileIdentity(original),transportSha256:createHash('sha256').update(body).digest('hex'),text:parts[part],
    }));
  }
}
function assertCommitted(paths,commit){
  if(git('rev-parse','HEAD')!==commit)throw new Error('Checkout changed during outcome evaluation');
  git('ls-files','--error-unmatch','--',...paths);
  if(git('status','--porcelain','--',...paths))throw new Error('Commit outcome evaluator and its source archives before evaluation');
}
export async function evaluateAssetForecasts({
  outputDirectory=resolve(ROOT,'build/asset-outcome-ledger'),
  priorDirectory=resolve(ROOT,'research-data/asset-outcome-ledger'),
  forecastDirectory=resolve(ROOT,'dist/data/asset-forecast-ledger'),emitFiles=false,
}={}){
  const output=resolve(outputDirectory),prior=resolve(priorDirectory),forecast=resolve(forecastDirectory),build=resolve(ROOT,'build');
  if(output===build||!within(build,output)||output===prior||within(forecast,output)||within(output,forecast))throw new Error('Use a separate build subdirectory for outcome evaluation');
  await mkdir(output,{recursive:true});
  if(!within(await realpath(build),await realpath(output)))throw new Error('Outcome output symlink escapes the research build directory');
  const lock=resolve(output,'.evaluation-lock');await mkdir(lock);
  try{
    const startedAt=now(),commit=git('rev-parse','HEAD');
    const forecastArchive=await readAssetForecastArchive(forecast);
    const records=forecastArchive.index.entries.map(e=>forecastArchive.records[e.id]);
    if(!records.length)throw new Error('No preserved asset forecasts to evaluate');
    const model=await collectForecastModelIdentity(ROOT,'dist/asset-outcome-records.js');
    const evaluator={...model,version:ASSET_OUTCOME_VERSION};
    if(model.sourceCommit!==commit)throw new Error('Outcome evaluator source changed during capture');
    const paths=[SCRIPT,'scripts/issue-asset-forecasts.mjs','scripts/build-forecast-ledger.mjs',...Object.keys(model.files)];
    assertCommitted(paths,commit);
    const [a,b]=await Promise.all([readAssetOutcomeArchive(prior,forecastArchive.records),readAssetOutcomeArchive(output,forecastArchive.records)]);
    const archive=await mergeAssetOutcomeArchives(forecastArchive.records,a,b);
    const beforeForecastBytes=new Map(forecastArchive.texts),beforeForecastIndex=canonicalForecastJson(forecastArchive.index);
    const collected=await collectAssetOutcomes({records,priorSnapshots:archive.snapshots,evaluator,sourceReader:async symbol=>{
      const path=SOURCE_PATHS[symbol];if(!path)throw new Error('No reviewed outcome archive for '+symbol);
      assertCommitted([path],commit);
      const bytes=await readFile(resolve(ROOT,path)),collectedAt=now();
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      if(!Buffer.from(text,'utf8').equals(bytes)||assetFileIdentity(text).gitBlobSha!==git('rev-parse',commit+':'+path))throw new Error('Outcome archive differs from committed UTF-8 bytes: '+path);
      return {sourceDocument:text,sourceUrl:'https://github.com/twoimo/bitcoin-cycle-atlas/blob/'+commit+'/'+path,publishedAt:null,collectedAt};
    }});
    appendAssetOutcomeEvaluation(archive,collected);
    assertCommitted(paths,commit);
    for(const [path,text]of beforeForecastBytes)if(await readFile(resolve(forecast,path),'utf8')!==text)throw new Error('Preserved forecast bytes changed during independent evaluation');
    if(canonicalForecastJson(JSON.parse(await readFile(resolve(forecast,'index.json'),'utf8')))!==beforeForecastIndex)throw new Error('Preserved forecast index changed during evaluation');
    await writeAssetOutcomeArchive(output,archive,forecastArchive.records);
    const result=collected.evaluation.result;
    const summary={status:collected.status,sourceCommit:commit,sourceTree:git('rev-parse',commit+'^{tree}'),
      startedAt,evaluatedAt:collected.evaluation.evaluatedAt,evaluationId:collected.evaluation.id,
      collector:{path:SCRIPT,sourceHash:createHash('sha256').update(await readFile(resolve(ROOT,SCRIPT))).digest('hex')},
      outputDirectory:relative(ROOT,output).replaceAll('\\','/'),preservedForecastRecords:records.length,
      preservedForecastSnapshots:Object.keys(forecastArchive.snapshots).length,forecastRecordsChanged:false,
      observationSnapshots:archive.index.observations.length,evaluationRevisions:archive.index.evaluations.length,
      pendingTargets:result.pendingTargets,scoredTargets:result.scoredTargets,
      missingObservationTargets:result.missingObservationTargets,retrospectiveTargets:result.retrospectiveTargets,
      attempts:collected.attempts,acquisitionFailures:collected.evaluation.acquisitionFailures,
      productionAdopted:false,automaticProductionScheduleEnabled:false};
    // The exact evaluation is immutable. Attempt metadata is a separate execution
    // receipt and is never used to move an old forecast's issuance clock.
    const receipt={schemaVersion:1,kind:'atlas-asset-outcome-run-receipt',...summary};
    const receiptText=json(receipt),receiptName='receipts/'+createHash('sha256').update(receiptText).digest('hex')+'.json';
    await writeImmutable(output,receiptName,receiptText);
    const texts=new Map(archive.texts);texts.set('index.json',json(archive.index));texts.set(receiptName,receiptText);
    console.log('ASSET_OUTCOME_SUMMARY '+JSON.stringify(summary));
    if(emitFiles)emitAssetOutcomeFiles(texts);
    return {summary,index:archive.index,evaluation:collected.evaluation};
  }finally{await rm(lock,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--emit-files')options.emitFiles=true;
    else if(['--output-dir','--prior-dir','--forecast-dir'].includes(arg)){
      const value=args[++i];if(!value||value.startsWith('--'))throw new Error('Missing outcome path argument');
      options[arg==='--output-dir'?'outputDirectory':arg==='--prior-dir'?'priorDirectory':'forecastDirectory']=resolve(value);
    }else throw new Error('Unknown outcome evaluator argument: '+arg);
  }
  const result=await evaluateAssetForecasts(options);
  if(result.summary.status!=='PASS')process.exitCode=1;
}
