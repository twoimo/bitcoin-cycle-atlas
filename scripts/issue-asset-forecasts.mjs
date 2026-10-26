import {readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {collectForecastModelIdentity} from './build-forecast-ledger.mjs';
import {canonicalForecastJson, forecastHash} from '../dist/forecast-records.js';
import {createForecastInformationClock} from '../dist/forecast-information-time.js';
import {ASSET_FORECAST_SCHEMA, assetSourceHash, latestCompletedAssetDate, createAssetForecastSnapshot,
  createAssetForecastRecord, assetForecastIndexEntry, verifyAssetForecastArchive,
  validateAssetForecastIndex, evaluateAssetForecastRecords} from '../dist/asset-forecast-records.js';
import {buildEthereumForecasts} from '../dist/ethereum-forecast.js';
import {buildTreasuryProjection} from '../dist/treasury-projection.js';
import {readAssetDailyRows} from '../dist/asset-daily-observations.js';
import {parseEquityArchive} from '../dist/equity-market-data.js';
import {TREASURY_DATA} from '../dist/treasury-catalog.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SCENARIOS=Object.freeze(['stress','base','bull']);
const SYMBOLS=Object.freeze(['ETHUSD','BMNR','MSTR']);
const INPUT_PATHS=Object.freeze([
  'dist/data/eth-ohlc.json','dist/data/btc-daily.json',
  'dist/data/bmnr-ohlc.json','dist/data/mstr-ohlc.json',
  'research-data/treasury-bmnr.json','research-data/treasury-mstr.json',
  'dist/ethereum-forecast.js','dist/long-horizon-evidence.js',
  'dist/treasury-catalog.js','dist/treasury-research.js',
]);
const COLLECTOR_PATH='scripts/issue-asset-forecasts.mjs';
const jsonText=value=>canonicalForecastJson(value)+'\n';
const now=()=>new Date().toISOString();
const sha=text=>createHash('sha256').update(text).digest('hex');
const emptyIndex=()=>({schemaVersion:ASSET_FORECAST_SCHEMA,kind:'atlas-asset-forecast-index',entries:[]});
const emptyArchive=()=>({index:emptyIndex(),records:{},snapshots:{},texts:new Map()});
const equal=(left,right)=>canonicalForecastJson(left)===canonicalForecastJson(right);
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();

function assertCommitted(paths,commit){
  if(git('rev-parse','HEAD')!==commit)throw new Error('Checkout changed during research issuance');
  git('ls-files','--error-unmatch','--',...paths);
  if(git('status','--porcelain','--',...paths))throw new Error('Commit source inputs and the collector before immutable issuance');
}
async function capture(path,commit){
  const bytes=await readFile(resolve(ROOT,path));
  const collectedAt=now();
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!Buffer.from(text,'utf8').equals(bytes))throw new Error('Input is not lossless UTF-8: '+path);
  return {path,text,collectedAt,sourceHash:sha(bytes),
    sourceUrl:'https://github.com/twoimo/bitcoin-cycle-atlas/blob/'+commit+'/'+path,
    vintageId:'git:'+commit+':'+sha(bytes)};
}
function lastCryptoDate(payload,asset){
  const rows=asset==='ETH'?(payload.dailyHistory?.candles??payload.candles):payload.prices;
  const row=rows?.at(-1),label=Array.isArray(row)?row[0]:row?.date;
  if(typeof label!=='string')throw new TypeError('Missing crypto archive terminal observation');
  return label.slice(0,10);
}
function receipt(source,id,kind='document',symbol=null,asOf=null,sourceObservedThrough=null){
  return {id,kind,...(kind==='document'?{}:{symbol,asOf,sourceObservedThrough}),
    publishedAt:null,collectedAt:source.collectedAt,sourceHash:source.sourceHash,
    sourceUrl:source.sourceUrl,vintageId:source.vintageId,availabilityBasis:'collection-upper-bound'};
}
export function summarizeAssetRecordKinds(records){
  return {
    preservedRecordSummaries:records.map(record=>({id:record.id,recordKind:record.recordKind,symbol:record.symbol,scenario:record.scenario.id,asOf:record.asOf,issuedAt:record.issuedAt})),
    issuedRecordCount:records.filter(record=>record.recordKind==='issued').length,
    reconstructedRecordCount:records.filter(record=>record.recordKind==='reconstructed').length,
  };
}

function recordsIn(archive){return archive.index.entries.map(entry=>archive.records[entry.id]);}

export async function readAssetForecastArchive(directory){
  const archive=emptyArchive();
  let indexText;
  try{indexText=await readFile(resolve(directory,'index.json'),'utf8');}
  catch(error){if(error.code==='ENOENT')return archive;throw error;}
  archive.index=validateAssetForecastIndex(JSON.parse(indexText));
  for(const entry of archive.index.entries){
    for(const [kind,id,path] of [['records',entry.id,entry.recordPath],['snapshots',entry.snapshotId,entry.snapshotPath]]){
      if(archive[kind][id])continue;
      const text=await readFile(resolve(directory,path),'utf8');
      archive[kind][id]=JSON.parse(text);
      archive.texts.set(path,text);
    }
  }
  await verifyAssetForecastArchive(archive.index,archive.records,archive.snapshots);
  return archive;
}
export async function mergeAssetForecastArchives(...archives){
  const result=emptyArchive(),runs=new Map();
  for(const archive of archives){
    await verifyAssetForecastArchive(archive.index,archive.records,archive.snapshots);
    for(const entry of archive.index.entries){
      const existing=runs.get(entry.runKey);
      if(existing&&existing!==entry.id)throw new Error('Conflicting immutable identities for the same asset run');
      runs.set(entry.runKey,entry.id);
      if(!result.records[entry.id])result.index.entries.push(entry);
      for(const [kind,id,path] of [['records',entry.id,entry.recordPath],['snapshots',entry.snapshotId,entry.snapshotPath]]){
        const value=archive[kind][id],text=archive.texts.get(path)??jsonText(value);
        if(result[kind][id]&&!equal(result[kind][id],value))throw new Error('Immutable asset content conflict: '+path);
        if(result.texts.has(path)&&result.texts.get(path)!==text)throw new Error('Immutable asset byte conflict: '+path);
        result[kind][id]=value;result.texts.set(path,text);
      }
    }
  }
  await verifyAssetForecastArchive(result.index,result.records,result.snapshots);
  return result;
}

/** Duplicate checks ignore only execution metadata already excluded by runKey.
 * A different deterministic output for the same run is always an error. */
export function decideAssetAppend(records,candidate){
  const duplicate=records.find(record=>record.runKey===candidate.runKey);
  if(duplicate){
    if(duplicate.outputHash!==candidate.outputHash)throw new Error('Same asset run produced a different output hash');
    return {action:'reuse',record:duplicate,replaces:null,revisionReason:null};
  }
  const predecessors=records.filter(record=>record.symbol===candidate.symbol&&record.asOf===candidate.asOf&&record.scenario.id===candidate.scenario.id)
    .sort((a,b)=>a.issuedAt.localeCompare(b.issuedAt)||a.id.localeCompare(b.id));
  const prior=predecessors.at(-1);
  if(!prior)return {action:'append',replaces:null,revisionReason:null};
  const changed=[];
  if(prior.snapshotDataHash!==candidate.snapshotDataHash)changed.push('preserved input bytes or declared model inputs');
  if(prior.model.sourceHash!==candidate.model.sourceHash||prior.model.version!==candidate.model.version)changed.push('committed model source or version');
  if(!equal(prior.options,candidate.options)||!equal(prior.targets.map(row=>row.horizonDays),candidate.targets.map(row=>row.horizonDays)))changed.push('declared options or horizons');
  if(prior.recordKind!==candidate.recordKind)changed.push('record kind');
  if(!changed.length)throw new Error('Unexplained same-origin asset revision');
  return {action:'append',replaces:prior.id,revisionReason:'New research issue after change to '+changed.join('; ')+'. Prior preserved record and full output remain immutable.'};
}
async function collectModels(){
  const [ledger,eth,treasury]=await Promise.all([
    collectForecastModelIdentity(ROOT,'dist/asset-forecast-records.js'),
    collectForecastModelIdentity(ROOT,'dist/ethereum-forecast.js'),
    collectForecastModelIdentity(ROOT,'dist/treasury-projection.js'),
  ]);
  const compose=async(engine,version)=>{
    if(engine.sourceCommit!==ledger.sourceCommit)throw new Error('Model sources changed during identity collection');
    const files={...engine.files,...ledger.files};
    for(const [path,hash] of Object.entries(engine.files))if(ledger.files[path]&&ledger.files[path]!==hash)throw new Error('Model file changed during identity collection');
    return {version,sourceCommit:engine.sourceCommit,sourceHash:await forecastHash(files),files};
  };
  return {ETHUSD:await compose(eth,'ethereum-forecast-1'),
    BMNR:await compose(treasury,'treasury-asset-linked-daily-1'),
    MSTR:await compose(treasury,'treasury-asset-linked-daily-1')};
}
function renderPreservedInputs(symbol,asOf,inputs,informationClock){
  const settings=inputs.modelInputs;
  if(settings?.schemaVersion!==1||settings.symbol!==symbol||settings.asOf!==asOf)throw new Error('Unsupported preserved collector model inputs');
  const documents=inputs.sourceDocuments;
  if(symbol==='ETHUSD')return buildEthereumForecasts({ethHistory:JSON.parse(documents['eth-price']),asOf,endYear:settings.endYear,seed:settings.seed});
  const research=JSON.parse(documents['treasury-research']);
  if(!equal(research,TREASURY_DATA[symbol]))throw new Error('Preserved financial research differs from the actual compiled treasury inputs');
  const history=parseEquityArchive(JSON.parse(documents['equity-price']),{symbol,interval:'daily'});
  const coinHistory=JSON.parse(documents['coin-price']);
  return buildTreasuryProjection({symbol,history,asOf,endYear:settings.endYear,seed:settings.seed,
    capitalPolicy:settings.capitalPolicy,informationClock,
    ...(symbol==='BMNR'?{ethHistory:coinHistory}:{btcHistory:coinHistory})});
}
function prepareInputs(symbol,sources,{endYear,seed,informationCutoffAt}){
  const documents={},receipts=[],sourcePaths={};
  const add=(id,path,kind='document',receiptSymbol=null,asOf=null,fullThrough=null)=>{
    const source=sources[path];
    documents[id]=source.text;sourcePaths[id]=path;
    receipts.push(receipt(source,id,kind,receiptSymbol,asOf,fullThrough));
  };
  let asOf,primaryPrices,underlyingPrices;
  if(symbol==='ETHUSD'){
    const payload=JSON.parse(sources['dist/data/eth-ohlc.json'].text);
    asOf=lastCryptoDate(payload,'ETH');
    primaryPrices=readAssetDailyRows(payload,'ETH',asOf).map(row=>[row.date,row.price]);
    add('eth-price','dist/data/eth-ohlc.json','crypto-daily','ETHUSD',asOf,asOf);
    add('eth-conditions','dist/ethereum-forecast.js');
  }else{
    const equityPath='dist/data/'+symbol.toLowerCase()+'-ohlc.json';
    const history=parseEquityArchive(JSON.parse(sources[equityPath].text),{symbol,interval:'daily'});
    asOf=history.candles.at(-1).date.slice(0,10);
    primaryPrices=history.candles.map(row=>[row.date.slice(0,10),row.close]);
    const asset=symbol==='BMNR'?'ETH':'BTC',coinPath=asset==='ETH'?'dist/data/eth-ohlc.json':'dist/data/btc-daily.json';
    const coinPayload=JSON.parse(sources[coinPath].text),fullThrough=lastCryptoDate(coinPayload,asset);
    underlyingPrices=readAssetDailyRows(coinPayload,asset,asOf).map(row=>[row.date,row.price]);
    add('equity-price',equityPath,'equity-session',symbol,asOf,asOf);
    add('coin-price',coinPath,'crypto-daily',asset+'USD',asOf,fullThrough);
    add('treasury-research','research-data/treasury-'+symbol.toLowerCase()+'.json');
    add('treasury-compiled','dist/treasury-catalog.js');
    add('treasury-module','dist/treasury-research.js');
    if(symbol==='BMNR')add('eth-conditions','dist/ethereum-forecast.js');
    else add('btc-conditions','dist/long-horizon-evidence.js');
  }
  const market=symbol==='ETHUSD'?'crypto':'equity';
  if(asOf!==latestCompletedAssetDate(informationCutoffAt,market))throw new Error(symbol+' committed price archive is stale or incomplete at the actual cutoff');
  const modelInputs={schemaVersion:1,symbol,asOf,endYear,seed,...(symbol==='ETHUSD'?{}:{capitalPolicy:'cash-at-put'})};
  const inputs={primaryPrices,...(underlyingPrices?{underlyingPrices}:{}),sourceDocuments:documents,sourcePaths,modelInputs};
  const informationClock=createForecastInformationClock({issuedAt:informationCutoffAt,informationCutoffAt,inputs:receipts});
  const bundle=renderPreservedInputs(symbol,asOf,inputs,informationClock);
  return {symbol,asOf,inputs,receipts,bundle};
}
export async function verifySharedEthereumPaths(bmnr,ethHistory,{endYear,seed}){
  const standalone=buildEthereumForecasts({ethHistory,asOf:bmnr.asOf,endYear,seed});
  const scenarios=[];
  for(const id of SCENARIOS){
    const treasury=bmnr.forecasts[id].path.map(row=>[row.date,row.components.coinPrice,row.components.coinBaselinePrice]);
    const ethereum=standalone.forecasts[id].path.map(row=>[row.date,row.price,row.baselinePrice]);
    if(!equal(treasury,ethereum))throw new Error('BMNR underlying ETH differs from standalone ETH for '+id+' at '+bmnr.asOf);
    scenarios.push({scenario:id,rows:ethereum.length,pathHash:await forecastHash(ethereum),equal:true});
  }
  return {status:'verified',asOf:bmnr.asOf,endYear,seed,scenarios,
    comparison:'Exact full daily date, price and baselinePrice; identical source bytes, origin and seed; no rounding tolerance'};
}
async function replayPriorArchive(archive,models){
  const cache=new Map(),rows=[];
  for(const record of recordsIn(archive)){
    const model=models[record.symbol];
    if(record.model.sourceHash!==model.sourceHash||record.model.version!==model.version){
      rows.push({recordId:record.id,sourceHash:record.model.sourceHash,method:'preserved-output-and-source-snapshot-integrity-only',
        regenerated:false,reason:'Current committed model source differs; exact old output is preserved, not re-executed under a different model'});
      continue;
    }
    const snapshot=archive.snapshots[record.snapshotId];
    if(!cache.has(snapshot.id))cache.set(snapshot.id,renderPreservedInputs(record.symbol,record.asOf,snapshot.inputs,snapshot.informationClock));
    const bundle=cache.get(snapshot.id);
    const regenerated=await createAssetForecastRecord({snapshot,forecast:bundle.forecasts[record.scenario.id],
      model:record.model,options:record.options,recordKind:record.recordKind,replaces:record.replaces,
      revisionReason:record.revisionReason,horizons:record.targets.map(row=>row.horizonDays)});
    if(regenerated.outputHash!==record.outputHash||regenerated.id!==record.id)throw new Error('Saved asset forecast does not replay exactly: '+record.id);
    rows.push({recordId:record.id,sourceHash:record.model.sourceHash,method:'regenerated-from-full-preserved-inputs',
      regenerated:true,outputHash:regenerated.outputHash,recordIdentityEqual:true});
  }
  return {status:'verified',regeneratedRecords:rows.filter(row=>row.regenerated).length,
    preservedOnlyRecords:rows.filter(row=>!row.regenerated).length,rows};
}
function outcomeObservations(records,prepared,sources){
  return Object.fromEntries(SYMBOLS.map(symbol=>{
    const needed=new Set(records.filter(record=>record.symbol===symbol).flatMap(record=>record.targets.map(target=>target.targetDate)));
    const current=prepared.find(item=>item.symbol===symbol);
    const source=sources[symbol==='ETHUSD'?'dist/data/eth-ohlc.json':'dist/data/'+symbol.toLowerCase()+'-ohlc.json'];
    return [symbol,current.inputs.primaryPrices.filter(([date])=>needed.has(date)).map(([date,price])=>({
      date,price,publishedAt:null,collectedAt:source.collectedAt,sourceObservedThrough:current.asOf,
      vintageId:source.vintageId,sourceHash:source.sourceHash,sourceUrl:source.sourceUrl,
    }))];
  }));
}
async function writeImmutable(directory,path,text){
  const file=resolve(directory,path);
  await mkdir(dirname(file),{recursive:true});
  try{await writeFile(file,text,{encoding:'utf8',flag:'wx'});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    if(await readFile(file,'utf8')!==text)throw new Error('Refusing to overwrite immutable asset bytes: '+path);
  }
}
async function writeCurrent(directory,path,text){
  const file=resolve(directory,path),temporary=file+'.tmp-'+process.pid;
  await mkdir(dirname(file),{recursive:true});
  try{await writeFile(temporary,text,{encoding:'utf8',flag:'wx'});await rename(temporary,file);}
  finally{await rm(temporary,{force:true});}
}
export function assetFileIdentity(text){
  const bytes=Buffer.byteLength(text,'utf8');
  return {sha256:sha(text),gitBlobSha:createHash('sha1').update('blob '+bytes+'\0').update(text).digest('hex'),bytes};
}

/** Transport is not a snapshot. Hydrate the exact pinned source bytes into
 * snapshotTemplate.inputs.sourceDocuments, then canonicalForecastJson + LF.
 * Full snapshots are always preserved in the output artifact. */
export function assetSnapshotTransport(path,text){
  const snapshot=JSON.parse(text);
  if(jsonText(snapshot)!==text)return null;
  const refs={};
  for(const input of snapshot.informationClock.inputs){
    const url=new URL(input.sourceUrl);
    const match=url.pathname.match(/^\/twoimo\/bitcoin-cycle-atlas\/blob\/([a-f0-9]{40})\/(.+)$/);
    if(url.origin!=='https://github.com'||!match||match[2].includes('..'))return null;
    if(snapshot.inputs.sourcePaths?.[input.id]!==match[2])return null;
    const raw=snapshot.inputs.sourceDocuments[input.id];
    if(typeof raw!=='string'||sha(raw)!==input.sourceHash)throw new Error('Snapshot transport source hash mismatch');
    refs[input.id]={gitSourceCommit:match[1],path:match[2],sha256:input.sourceHash,bytes:Buffer.byteLength(raw,'utf8')};
  }
  const {sourceDocuments,...remainingInputs}=snapshot.inputs;
  return {kind:'atlas-asset-snapshot-transport',schemaVersion:1,path,snapshotId:snapshot.id,
    originalFile:assetFileIdentity(text),reconstruction:'Hydrate sourceDocuments with exact Git UTF-8 bytes; canonicalForecastJson(snapshot) + LF',
    snapshotTemplate:{...snapshot,inputs:remainingInputs},sourceDocumentRefs:refs};
}
function textChunks(text,size=12000){
  const chunks=[];
  for(let start=0;start<text.length;){
    let end=Math.min(start+size,text.length);
    if(end<text.length&&text.charCodeAt(end-1)>=0xD800&&text.charCodeAt(end-1)<=0xDBFF)end--;
    chunks.push(text.slice(start,end));start=end;
  }
  return chunks;
}
export function emitAssetForecastFiles(texts,writeLine=line=>console.log(line)){
  const paths=[...texts.keys()].sort();
  writeLine('ASSET_FORECAST_FILE_MANIFEST '+JSON.stringify({schemaVersion:1,files:paths.map(path=>({path,...assetFileIdentity(texts.get(path))}))}));
  for(const path of paths){
    const original=texts.get(path),transport=path.startsWith('snapshots/')?assetSnapshotTransport(path,original):null;
    const text=transport?jsonText(transport):original,chunks=textChunks(text);
    const marker=transport?'ASSET_FORECAST_SNAPSHOT_TRANSPORT_CHUNK ':'ASSET_FORECAST_FILE_CHUNK ';
    const identity=assetFileIdentity(original),transportHash=sha(text);
    for(let part=0;part<chunks.length;part++)writeLine(marker+JSON.stringify({
      path,part,total:chunks.length,...identity,transportSha256:transportHash,text:chunks[part],
    }));
  }
}
function containsDirectory(parent,child){
  const value=relative(parent,child);
  return value===''||!/^(\.\.(?:[\\/]|$)|[\\/]|[A-Za-z]:)/.test(value);
}
async function verifyCommittedModelBytes(models,commit){
  const files=Object.assign({},...Object.values(models).map(model=>model.files));
  await Promise.all(Object.entries(files).map(async([path,expected])=>{
    const text=await readFile(resolve(ROOT,path),'utf8');
    if(sha(text)!==expected||assetFileIdentity(text).gitBlobSha!==git('rev-parse',commit+':'+path))throw new Error('Model identity is not the exact committed source: '+path);
  }));
  return Object.keys(files);
}


/** Classify completed-date freshness without relaxing the new-issuance clock.
 * Future/malformed dates remain errors; only older completed input dates qualify
 * for the explicitly requested preservation workflow. */
export function assetIssuanceFreshness(lastDates,checkedAt){
  const inputs=SYMBOLS.map(symbol=>{
    const actualAsOf=lastDates?.[symbol],market=symbol==='ETHUSD'?'crypto':'equity';
    const expectedAsOf=latestCompletedAssetDate(checkedAt,market);
    const epoch=typeof actualAsOf==='string'?Date.parse(actualAsOf+'T00:00:00Z'):NaN;
    if(typeof actualAsOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(actualAsOf)||!Number.isFinite(epoch)||
      new Date(epoch).toISOString().slice(0,10)!==actualAsOf)throw new TypeError(symbol+' malformed archive completion date');
    if(actualAsOf>expectedAsOf)throw new Error(symbol+' archive contains an incomplete or future session at the actual cutoff');
    return {symbol,actualAsOf,expectedAsOf,checkedAt,status:actualAsOf===expectedAsOf?'current':'stale'};
  });
  return {checkedAt,eligibleForNewIssuance:inputs.every(input=>input.status==='current'),
    inputs,staleInputs:inputs.filter(input=>input.status==='stale')};
}
function currentInputFreshness(sources,checkedAt){
  const eth=JSON.parse(sources['dist/data/eth-ohlc.json'].text),lastDates={ETHUSD:lastCryptoDate(eth,'ETH')};
  readAssetDailyRows(eth,'ETH',lastDates.ETHUSD);
  for(const symbol of ['BMNR','MSTR']){
    const history=parseEquityArchive(JSON.parse(sources['dist/data/'+symbol.toLowerCase()+'-ohlc.json'].text),{symbol,interval:'daily'});
    lastDates[symbol]=history.candles.at(-1).date.slice(0,10);
  }
  return assetIssuanceFreshness(lastDates,checkedAt);
}
async function preserveAfterStaleInput({archive,models,output,commit,startedAt,informationCutoffAt,freshness,sources,protectedPaths,emitFiles}){
  if(!archive.index.entries.length)throw new Error('Stale inputs and no preserved asset forecast archive to verify');
  const integrity=await verifyAssetForecastArchive(archive.index,archive.records,archive.snapshots);
  const replay=await replayPriorArchive(archive,models),replayedAt=now(),records=recordsIn(archive);
  assertCommitted(protectedPaths,commit);
  const receiptBody={schemaVersion:1,kind:'atlas-asset-forecast-replay-receipt',status:'PASS',
    verificationScope:'Preserved immutable archive integrity and source-compatible replay only',
    mode:'preserved-replay-only',issuanceStatus:'skipped-stale-inputs',
    startedAt,informationCutoffAt,replayedAt,candidateFreezeAt:null,sourceCommit:commit,sourceTree:git('rev-parse','HEAD^{tree}'),
    collector:{path:COLLECTOR_PATH,sourceHash:sources[COLLECTOR_PATH].sourceHash},
    currentInputFreshness:freshness,newRecords:0,newSnapshots:0,appendedRecordIds:[],reusedRecordIds:[],
    preservedRecords:records.length,preservedSnapshots:Object.keys(archive.snapshots).length,...summarizeAssetRecordKinds(records),
    integrity,replay,sharedEthereumPaths:{status:'not-rerun-in-preservation-mode'},
    evaluation:{status:'not-run-in-preservation-mode',separateEvidence:'build/asset-outcome-ledger',
      existingOutputEvaluation:'If present, retained unchanged at its original evaluatedAt; not a new evaluation'},
    historicalVintagesProven:false,productionAdopted:false,publicationScope:'draft-pr-research',
    issuanceMeaning:'No new snapshot, record or issue clock is created. Existing bytes and issuedAt values remain unchanged. Freshness failure is not counted as successful new issuance.'};
  const runReceipt={id:await forecastHash(receiptBody),...receiptBody},texts=new Map(archive.texts);
  texts.set('index.json',jsonText(archive.index));texts.set('receipt.json',jsonText(runReceipt));
  texts.set('receipts/'+runReceipt.id+'.json',jsonText(runReceipt));
  try{
    const previousText=await readFile(resolve(output,'receipt.json'),'utf8'),previous=JSON.parse(previousText);
    if(!/^[a-f0-9]{64}$/.test(previous.id))throw new Error('Invalid existing asset run receipt identity');
    texts.set('receipts/'+previous.id+'.json',previousText);
  }catch(error){if(error.code!=='ENOENT')throw error;}
  for(const [path,text] of archive.texts)await writeImmutable(output,path,text);
  for(const [path,text] of texts)if(path.startsWith('receipts/'))await writeImmutable(output,path,text);
  await writeCurrent(output,'receipt.json',texts.get('receipt.json'));
  await writeCurrent(output,'index.json',texts.get('index.json'));
  const saved=await readAssetForecastArchive(output);
  if(!equal(saved.index,archive.index))throw new Error('Preserved asset index failed read-back verification');
  for(const [path,text] of archive.texts)if(saved.texts.get(path)!==text)throw new Error('Preserved asset bytes changed during stale-input replay: '+path);
  assertCommitted(protectedPaths,commit);
  const summary={status:'PASS',verificationScope:receiptBody.verificationScope,mode:receiptBody.mode,issuanceStatus:receiptBody.issuanceStatus,
    sourceCommit:commit,sourceTree:receiptBody.sourceTree,receiptId:runReceipt.id,outputDirectory:relative(ROOT,output).replaceAll('\\','/'),
    newRecords:0,newSnapshots:0,reusedRecords:0,verifiedExistingRecords:records.length,preservedRecords:records.length,
    preservedSnapshots:Object.keys(archive.snapshots).length,candidateFreezeAt:null,replayedAt,
    currentInputFreshness:freshness,regeneratedRecords:replay.regeneratedRecords,preservedOnlyRecords:replay.preservedOnlyRecords,
    newOutcomeEvaluation:false,outcomeEvidence:'build/asset-outcome-ledger',sharedEthereumPaths:'not-rerun-in-preservation-mode',
    productionAdopted:false,publicationScope:'draft-pr-research',
    artifactFileScope:'Files written or checked by this call; earlier receipt revisions may also be present',
    artifactFiles:texts.size,artifactBytes:[...texts.values()].reduce((sum,text)=>sum+Buffer.byteLength(text,'utf8'),0)};
  console.log('ASSET_FORECAST_SUMMARY '+JSON.stringify(summary));if(emitFiles)emitAssetForecastFiles(texts);
  return {summary,index:archive.index,receipt:runReceipt,evaluation:null};
}

export async function issueAssetForecasts({
  outputDirectory=resolve(ROOT,'build/asset-forecast-ledger'),
  priorDirectory=resolve(ROOT,'dist/data/asset-forecast-ledger'),
  endYear=2035,seed=20261022,emitFiles=false,replayPreservedIfStale=false,
}={}){
  if(typeof replayPreservedIfStale!=='boolean')throw new TypeError('replayPreservedIfStale must be boolean');
  if(!Number.isSafeInteger(endYear)||endYear<2027||endYear>2050)throw new RangeError('Invalid asset forecast end year');
  if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295)throw new RangeError('Invalid asset forecast seed');
  const output=resolve(outputDirectory),prior=resolve(priorDirectory);
  if(output===ROOT||containsDirectory(resolve(ROOT,'dist'),output)||output===prior)throw new Error('Use a separate research build directory; this collector does not write the production tree or prior archive');
  await mkdir(output,{recursive:true});
  const lock=resolve(output,'.issuance-lock');
  await mkdir(lock);
  try{
    const startedAt=now(),commit=git('rev-parse','HEAD');
    assertCommitted([...INPUT_PATHS,COLLECTOR_PATH],commit);
    const [priorArchive,outputArchive,models,captured]=await Promise.all([
      readAssetForecastArchive(prior),readAssetForecastArchive(output),collectModels(),
      Promise.all([...INPUT_PATHS,COLLECTOR_PATH].map(path=>capture(path,commit))),
    ]);
    if(Object.values(models).some(model=>model.sourceCommit!==commit))throw new Error('Forecast models do not match the captured checkout');
    const sources=Object.fromEntries(captured.map(source=>[source.path,source]));
    for(const source of captured){
      if(assetFileIdentity(source.text).gitBlobSha!==git('rev-parse',commit+':'+source.path))throw new Error('Captured input differs from pinned Git bytes: '+source.path);
    }
    const modelPaths=await verifyCommittedModelBytes(models,commit);
    const protectedPaths=[...new Set([...INPUT_PATHS,COLLECTOR_PATH,...modelPaths])];
    assertCommitted(protectedPaths,commit);
    const archive=await mergeAssetForecastArchives(priorArchive,outputArchive);
    const informationCutoffAt=now();
    if(replayPreservedIfStale){
      const freshness=currentInputFreshness(sources,informationCutoffAt);
      if(!freshness.eligibleForNewIssuance)return await preserveAfterStaleInput({archive,models,output,commit,startedAt,
        informationCutoffAt,freshness,sources,protectedPaths,emitFiles});
    }
    const prepared=SYMBOLS.map(symbol=>prepareInputs(symbol,sources,{endYear,seed,informationCutoffAt}));
    const sharedEthereumPaths=await verifySharedEthereumPaths(
      prepared.find(item=>item.symbol==='BMNR').bundle,
      JSON.parse(sources['dist/data/eth-ohlc.json'].text),{endYear,seed});
    // The paths now exist. Freeze the research issue at the actual current time.
    // Only clock metadata changes here; replay below independently regenerates
    // the exact full output from each final saved snapshot and final clock.
    const candidateFreezeAt=now(),appended=[],reused=[];
    for(const item of prepared){
      const informationClock=createForecastInformationClock({issuedAt:candidateFreezeAt,informationCutoffAt,inputs:item.receipts});
      const snapshot=await createAssetForecastSnapshot({symbol:item.symbol,asOf:item.asOf,informationClock,inputs:item.inputs});
      const options={endYear,seed,...(item.symbol==='ETHUSD'?{}:{capitalPolicy:'cash-at-put'})};
      for(const scenario of SCENARIOS){
        const forecast={...item.bundle.forecasts[scenario],issuedAt:candidateFreezeAt,informationCutoffAt,informationClock};
        const args={snapshot,forecast,model:models[item.symbol],options,recordKind:'issued',horizons:[30,90,180]};
        let record=await createAssetForecastRecord(args);
        const decision=decideAssetAppend(recordsIn(archive),record);
        if(decision.action==='reuse'){reused.push(decision.record.id);continue;}
        if(decision.replaces!==null)record=await createAssetForecastRecord({...args,replaces:decision.replaces,revisionReason:decision.revisionReason});
        const entry=assetForecastIndexEntry(record);
        archive.records[record.id]=record;archive.snapshots[snapshot.id]=snapshot;
        archive.index.entries.push(entry);
        archive.texts.set(entry.recordPath,jsonText(record));
        archive.texts.set(entry.snapshotPath,jsonText(snapshot));
        appended.push(record.id);
      }
    }
    archive.index.entries.sort((a,b)=>a.issuedAt.localeCompare(b.issuedAt)||a.symbol.localeCompare(b.symbol)||a.id.localeCompare(b.id));
    const integrity=await verifyAssetForecastArchive(archive.index,archive.records,archive.snapshots);
    const replay=await replayPriorArchive(archive,models);
    const records=recordsIn(archive),evaluatedAt=now();
    const evaluation=await evaluateAssetForecastRecords(records,outcomeObservations(records,prepared,sources),{evaluatedAt});
    assertCommitted(protectedPaths,commit);
    const receiptBody={
      schemaVersion:1,kind:'atlas-asset-forecast-run-receipt',status:'PASS',
      startedAt,informationCutoffAt,candidateFreezeAt,evaluatedAt,sourceCommit:commit,
      collector:{path:COLLECTOR_PATH,sourceHash:sources[COLLECTOR_PATH].sourceHash},
      inputs:captured.filter(source=>source.path!==COLLECTOR_PATH).map(source=>({
        path:source.path,sha256:source.sourceHash,collectedAt:source.collectedAt,publishedAt:null,
        gitBlobSha:assetFileIdentity(source.text).gitBlobSha,availabilityBasis:'collection-upper-bound',
      })),
      requestedOptions:{endYear,seed,capitalPolicy:'cash-at-put',horizons:[30,90,180]},
      models:Object.fromEntries(Object.entries(models).map(([symbol,model])=>[symbol,{
        version:model.version,sourceHash:model.sourceHash,sourceCommit:model.sourceCommit,
      }])),
      origins:prepared.map(item=>({symbol:item.symbol,asOf:item.asOf,
        primaryMarket:item.symbol==='ETHUSD'?'crypto-utc-daily':'new-york-equity-session'})),
      appendedRecordIds:appended,reusedRecordIds:reused,
      preservedRecords:records.length,preservedSnapshots:Object.keys(archive.snapshots).length,
      ...summarizeAssetRecordKinds(records),
      integrity,replay,sharedEthereumPaths,
      evaluation:{evaluatedAt,pendingTargets:evaluation.pendingTargets,scoredTargets:evaluation.scoredTargets},
      historicalVintagesProven:false,probability:null,calibrated:false,productionAdopted:false,
      publicationScope:'draft-pr-research',firstPublishedAt:null,
      issuanceMeaning:'The actual research path freeze precedes immutable artifact serialization. Reused records retain their original issue timestamp. Repository or site publication is separate.',
      sourceTiming:'Current collection of exact committed bytes proves availability by collection only. Original upstream retrieval and date-only publication metadata remain in the raw documents; unknown precise publication times stay null.',
    };
    const runReceipt={id:await forecastHash(receiptBody),...receiptBody};
    const texts=new Map(archive.texts);
    texts.set('index.json',jsonText(archive.index));
    texts.set('evaluation.json',jsonText(evaluation));
    texts.set('receipt.json',jsonText(runReceipt));
    // Existing record and snapshot bytes are never replaced. The index is
    // updated last, after every newly indexed immutable object is present.
    for(const [path,text] of archive.texts)await writeImmutable(output,path,text);
    await writeCurrent(output,'evaluation.json',texts.get('evaluation.json'));
    await writeCurrent(output,'receipt.json',texts.get('receipt.json'));
    await writeCurrent(output,'index.json',texts.get('index.json'));
    const saved=await readAssetForecastArchive(output);
    if(!equal(saved.index,archive.index))throw new Error('Written asset index failed read-back verification');
    const summary={status:'PASS',outputDirectory:relative(ROOT,output).replaceAll('\\','/'),
      sourceCommit:commit,receiptId:runReceipt.id,newRecords:appended.length,reusedRecords:reused.length,
      preservedRecords:records.length,preservedSnapshots:Object.keys(archive.snapshots).length,
      origins:runReceipt.origins,candidateFreezeAt,pendingTargets:evaluation.pendingTargets,
      scoredTargets:evaluation.scoredTargets,regeneratedRecords:replay.regeneratedRecords,
      preservedOnlyRecords:replay.preservedOnlyRecords,sharedEthereumPaths:sharedEthereumPaths.status,
      productionAdopted:false,publicationScope:'draft-pr-research',
      artifactFiles:texts.size,artifactBytes:[...texts.values()].reduce((sum,text)=>sum+Buffer.byteLength(text,'utf8'),0)};
    console.log('ASSET_FORECAST_SUMMARY '+JSON.stringify(summary));
    if(emitFiles)emitAssetForecastFiles(texts);
    return {summary,index:archive.index,receipt:runReceipt,evaluation};
  }finally{
    await rm(lock,{recursive:true,force:true});
  }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2),options={};
  for(let index=0;index<args.length;index++){
    const arg=args[index];
    if(arg==='--emit-files')options.emitFiles=true;
    else if(arg==='--replay-preserved-if-stale')options.replayPreservedIfStale=true;
    else if(arg==='--output-dir')options.outputDirectory=resolve(args[++index]??'');
    else if(arg==='--prior-dir')options.priorDirectory=resolve(args[++index]??'');
    else if(arg==='--end-year')options.endYear=Number(args[++index]);
    else if(arg==='--seed')options.seed=Number(args[++index]);
    else throw new Error('Unknown asset collector argument: '+arg);
  }
  await issueAssetForecasts(options);
}
