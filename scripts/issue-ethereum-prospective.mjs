import {readFile,writeFile,mkdir,readdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {buildEthereumAdaptiveForecast,ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {buildEthereumPooledForecast,ETH_POOLED_POLICY} from '../dist/ethereum-pooled-model.js';
import {ETH_PROSPECTIVE_PRICE_POLICY,createEthereumResearchSnapshot,verifyEthereumResearchSnapshot,rebuildEthereumResearchPrices} from '../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord,verifyEthereumProspectiveRecord,decideEthereumProspectiveAppend,ethereumProspectiveIndexEntry,evaluateEthereumProspectiveRecords} from '../dist/ethereum-prospective-records.js';
import {collectForecastModelIdentity} from './build-forecast-ledger.mjs';
import {captureEthereumResearchTail} from './ethereum-prospective-collector-core.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),out=resolve(root,'build/ethereum-prospective-ledger');
const stored=resolve(root,'research-data/ethereum-prospective-ledger');
const json=x=>canonicalForecastJson(x)+'\n',now=()=>new Date().toISOString(),sha=x=>createHash('sha256').update(x).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
const PIN={sourceCommit:'54317f7d05abd8fe569b0912ff34caee2bbe9981',gitBlobSha:'882c49f0263034426e4e3afe377cc60a17448b6c',bytes:895609};
const files=new Map(),records=[],snapshots={};
const sourcePaths=['scripts/issue-ethereum-prospective.mjs','scripts/ethereum-prospective-collector-core.mjs',
  'dist/ethereum-prospective-records.js','dist/ethereum-prospective-prices.js',ETH_PROSPECTIVE_PRICE_POLICY.basePath];
if(git('status','--porcelain','--',...sourcePaths))throw new Error('Prospective issuer requires committed source and base input');
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,sha(await readFile(resolve(root,p)))])));
async function save(path,text,immutable=true){
  const full=resolve(out,path);await mkdir(dirname(full),{recursive:true});
  if(immutable){
    try{await writeFile(full,text,{flag:'wx'});}
    catch(error){if(error.code!=='EEXIST')throw error;if(await readFile(full,'utf8')!==text)throw new Error('Immutable prospective bytes conflict: '+path);}
  }else{
    const temporary=full+'.tmp-'+process.pid;
    try{await writeFile(temporary,text,{flag:'wx'});await rename(temporary,full);}
    finally{await rm(temporary,{force:true});}
  }
  files.set(path,text);
}
async function loadExisting(){
  let index;
  try{index=JSON.parse(await readFile(resolve(stored,'index.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return;throw error;}
  if(index.schemaVersion!==1||index.kind!=='ethereum-prospective-index'||!Array.isArray(index.entries)||index.entries.length>2000)throw new Error('Invalid existing prospective index');
  const seen=new Set(),runs=new Set();
  for(const entry of index.entries){
    if(!/^[a-f0-9]{64}$/.test(entry.id)||!entry.snapshotId||entry.recordPath!=='records/'+entry.id+'.json'||entry.snapshotPath!=='snapshots/'+entry.snapshotId+'.json'||!/^[a-f0-9]{64}$/.test(entry.snapshotId))throw new Error('Unsafe prospective index path');
    if(seen.has(entry.id)||runs.has(entry.runKey))throw new Error('Duplicate existing prospective record/run');
    seen.add(entry.id);runs.add(entry.runKey);
    const rt=await readFile(resolve(stored,entry.recordPath),'utf8'),st=await readFile(resolve(stored,entry.snapshotPath),'utf8');
    const record=JSON.parse(rt),snapshot=JSON.parse(st);
    await verifyEthereumProspectiveRecord(record,snapshot);
    if(json(ethereumProspectiveIndexEntry(record))!==json(entry)||json(record)!==rt||json(snapshot)!==st)throw new Error('Existing prospective bytes/index mismatch');
    records.push(record);snapshots[snapshot.id]=snapshot;
    await save(entry.recordPath,rt);await save(entry.snapshotPath,st);
  }
}
const receipt={kind:'ethereum-prospective-issuance',sourceCommit,sourceTree,sourceHashes,runId:process.env.GITHUB_RUN_ID??null,
  startedAt:now(),status:'started',priceOnlyCandidates:true,economicSnapshotsActivated:0,
  newRecords:0,reusedRecords:0,newSnapshots:0,prospectiveScoredTargets:0,productionAdopted:false,
  externalGeminiReview:'omitted-by-user',reverseReview:'omitted-by-user',releaseAuthorized:false,errors:[]};
let tail=null,captureSnapshot=null;
await mkdir(out,{recursive:true});await save('receipt.json',json(receipt),false);
try{
  await loadExisting();receipt.preservedRecords=records.length;
  const baseText=await readFile(resolve(root,ETH_PROSPECTIVE_PRICE_POLICY.basePath),'utf8'),baseCollectedAt=now();
  const baseBytes=Buffer.from(baseText,'utf8');
  if(baseBytes.length!==PIN.bytes||createHash('sha1').update('blob '+baseBytes.length+'\0').update(baseBytes).digest('hex')!==PIN.gitBlobSha)throw new Error('Current committed base differs from the declared immutable pin; review a new pin explicitly');
  tail=await captureEthereumResearchTail({baseText});
  await save('acquisition.json',json(tail));
  if(tail.completeBody&&tail.rawText!==null)await save('raw/coinbase-tail.json',tail.rawText);
  else if(tail.completeBody&&tail.rawBase64!==null)await save('raw/coinbase-tail.base64.txt',tail.rawBase64);
  if(tail.status!=='success')throw new Error('No candidate issue after failed ETH capture: '+tail.error?.message);
  captureSnapshot=await createEthereumResearchSnapshot({base:{text:baseText,...PIN,collectedAt:baseCollectedAt},
    tail:{text:tail.rawText,requestStartedAt:tail.requestStartedAt,bodyCompletedAt:tail.bodyCompletedAt,sourceUrl:tail.sourceUrl}});
  const priceSource=rebuildEthereumResearchPrices({baseText,tailText:tail.rawText,requestStartedAt:tail.requestStartedAt,
    bodyCompletedAt:tail.bodyCompletedAt,sourceUrl:tail.sourceUrl});
  const generationStartedAt=now(),options={ethHistory:priceSource.archive,asOf:captureSnapshot.asOf,horizonDays:730,sampleCount:256,seed:20261027};
  const forecasts={adaptive:buildEthereumAdaptiveForecast(options),pooled:buildEthereumPooledForecast(options)};
  const generatedAt=now();
  const ledger=await collectForecastModelIdentity(root,'dist/ethereum-prospective-records.js');
  const modelFor=modelKey=>({...ledger,version:modelKey==='adaptive'?ETH_ADAPTIVE_POLICY.version:ETH_POOLED_POLICY.version});
  const issuedAt=now(),decisions=[],prepared=[];
  for(const modelKey of ['adaptive','pooled']){
    const candidate=await createEthereumProspectiveRecord({snapshot:captureSnapshot,forecast:forecasts[modelKey],model:modelFor(modelKey),modelKey,
      generationStartedAt,generatedAt,issuedAt});
    const decision=decideEthereumProspectiveAppend(records,candidate);
    prepared.push({candidate,decision});decisions.push({modelKey,action:decision.action,id:decision.record.id,runKey:decision.record.runKey});
  }
  // Validate both candidates before the first new immutable record is written.
  for(const {candidate,decision}of prepared){
    if(decision.action==='append'){
      records.push(candidate);snapshots[captureSnapshot.id]=captureSnapshot;receipt.newRecords++;
      await save('records/'+candidate.id+'.json',json(candidate));
    }else receipt.reusedRecords++;
  }
  if(records.some(r=>r.snapshotId===captureSnapshot.id)){
    await save('snapshots/'+captureSnapshot.id+'.json',json(captureSnapshot));receipt.newSnapshots=1;
  }
  // Preserve this acquisition even if an earlier economic run is reused.
  await save('observations/'+captureSnapshot.id+'.json',json(captureSnapshot));
  const evaluatedAt=now(),evaluator={...ledger,version:'eth-prospective-evaluator-1'};
  const evaluation=await evaluateEthereumProspectiveRecords({records,snapshots,observations:[captureSnapshot],evaluatedAt,evaluator});
  await save('evaluations/'+evaluation.id+'.json',json(evaluation));
  const index={schemaVersion:1,kind:'ethereum-prospective-index',entries:records.map(ethereumProspectiveIndexEntry).sort((a,b)=>a.id.localeCompare(b.id))};
  await save('index.json',json(index),false);
  const replay=[];
  for(const {modelKey,action,id}of decisions){
    const record=records.find(r=>r.id===id);
    const replayed=await createEthereumProspectiveRecord({snapshot:snapshots[record.snapshotId],forecast:forecasts[modelKey],model:record.model,modelKey,
      generationStartedAt:record.generationStartedAt,generatedAt:record.generatedAt,issuedAt:record.issuedAt});
    if(replayed.outputHash!==record.outputHash||replayed.id!==record.id)throw new Error('Candidate failed exact preserved-path replay');
    replay.push({modelKey,id,outputHash:record.outputHash,points:731,recordIdentityEqual:true});
  }
  receipt.status='issued-or-reused';receipt.asOf=captureSnapshot.asOf;receipt.anchor=captureSnapshot.primaryPrices.at(-1)[1];
  receipt.informationCutoffAt=captureSnapshot.informationCutoffAt;receipt.issuedAt=issuedAt;receipt.decisions=decisions;receipt.replay=replay;
  receipt.totalRecords=records.length;receipt.uniqueOrigins=new Set(records.map(r=>r.asOf)).size;
  receipt.modelOrigins=Object.fromEntries(['adaptive','pooled'].map(k=>[k,new Set(records.filter(r=>r.modelKey===k).map(r=>r.asOf)).size]));
  receipt.evaluation={id:evaluation.id,evaluatedAt,pending:evaluation.pending,missingObservations:evaluation.missingObservations,scored:evaluation.scored,
    earliestOutcomeEventAt:records.flatMap(r=>r.targets.map(t=>t.eventAt)).sort()[0]};
  receipt.prospectiveScoredTargets=evaluation.scored;
}catch(error){receipt.status='blocked';receipt.errors.push({name:error.name,message:error.message});}
receipt.finishedAt=now();await save('receipt.json',json(receipt),false);
const manifest=[...files].map(([path,text])=>({path,bytes:Buffer.byteLength(text,'utf8'),sha256:sha(text),
  gitBlobSha:createHash('sha1').update('blob '+Buffer.byteLength(text,'utf8')+'\0').update(text).digest('hex')}));
await save('files.json',json({files:manifest}),false);
console.log('ETH_PROSPECTIVE_RECEIPT '+JSON.stringify({...receipt,acquisition:tail?{status:tail.status,requestStartedAt:tail.requestStartedAt,
  bodyCompletedAt:tail.bodyCompletedAt,requests:tail.requests,retries:tail.retries,bytes:tail.receivedBytes,rawSha256:tail.rawSha256,error:tail.error}:null,files:manifest}));
const transportSize=[...files.values()].reduce((n,text)=>n+Buffer.byteLength(text,'utf8'),0);
if(transportSize<=8*1024*1024){
  for(const [path,text]of files){const size=20000,total=Math.ceil(text.length/size);for(let index=0;index<total;index++)console.log('ETH_PROSPECTIVE_FILE_CHUNK '+JSON.stringify({path,index,total,data:text.slice(index*size,(index+1)*size)}));}
}else console.log('ETH_PROSPECTIVE_LOG_TRANSPORT '+JSON.stringify({status:'artifact-only',bytes:transportSize,maximumRawBytes:8*1024*1024}));
if(receipt.status==='blocked')process.exitCode=1;
