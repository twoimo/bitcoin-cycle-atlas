import {readFile,writeFile,mkdir,readdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {buildEthereumAdaptiveForecast,ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {buildEthereumPooledForecast,ETH_POOLED_POLICY} from '../dist/ethereum-pooled-model.js';
import {ETH_PROSPECTIVE_PRICE_POLICY,createEthereumResearchSnapshot,verifyEthereumResearchSnapshot,rebuildEthereumResearchPrices} from '../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord,verifyEthereumProspectiveRecord,ethereumProspectiveIndexEntry,evaluateEthereumProspectiveRecords,replayEthereumProspectiveRecord} from '../dist/ethereum-prospective-dispatch.js';
import {ETH_WARM_START_PROSPECTIVE_POLICY,ETH_WARM_START_PROSPECTIVE_ENTRY,buildEthereumWarmStartProspectiveForecast} from '../dist/ethereum-warm-start-prospective.js';
import {collectForecastModelIdentity} from './build-forecast-ledger.mjs';
import {captureEthereumResearchTail} from './ethereum-prospective-collector-core.mjs';
import {decideEthereumProspectiveIssue,ETH_PROSPECTIVE_REUSE_POLICY} from './ethereum-prospective-reuse.mjs';
import {parseEthereumProspectiveArguments} from './ethereum-prospective-options.mjs';
import {readEthereumCommittedBase,ETH_COMMITTED_BASE_POLICY} from './ethereum-prospective-base.mjs';
import {readEthereumCalibrationInputs} from './build-ethereum-prospective-calibration-readiness.mjs';
import {validateEthereumProspectiveWriteBudget} from './ethereum-prospective-write-guard.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),out=resolve(root,'build/ethereum-prospective-ledger');
const stored=resolve(root,'research-data/ethereum-prospective-ledger');
const json=x=>canonicalForecastJson(x)+'\n',now=()=>new Date().toISOString(),sha=x=>createHash('sha256').update(x).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
const {verifyOnly,includeWarmStart,modelKeys}=parseEthereumProspectiveArguments(process.argv.slice(2));
const receiptPath=verifyOnly?'replay-receipt.json':'receipt.json';
const files=new Map(),records=[],snapshots={},committedTransportReferences=new Map();
const sourcePaths=['scripts/issue-ethereum-prospective.mjs','scripts/ethereum-prospective-collector-core.mjs','scripts/ethereum-prospective-reuse.mjs',
  'scripts/ethereum-prospective-options.mjs','scripts/ethereum-prospective-base.mjs',
  'scripts/build-ethereum-prospective-calibration-readiness.mjs','scripts/ethereum-prospective-write-guard.mjs',
  'scripts/ethereum-prospective-calibration-core.mjs','dist/ethereum-prospective-dispatch.js','dist/ethereum-warm-start-prospective.js',
  'dist/ethereum-warm-start-model.js','dist/ethereum-prospective-records.js','dist/ethereum-prospective-prices.js',ETH_PROSPECTIVE_PRICE_POLICY.basePath];
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
async function loadExisting(directory=stored){
  let index;
  try{index=JSON.parse(await readFile(resolve(directory,'index.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return;throw error;}
  if(index.schemaVersion!==1||index.kind!=='ethereum-prospective-index'||!Array.isArray(index.entries)||index.entries.length>2000)throw new Error('Invalid existing prospective index');
  const seen=new Set(),runs=new Set();
  for(const entry of index.entries){
    if(!/^[a-f0-9]{64}$/.test(entry.id)||!entry.snapshotId||entry.recordPath!=='records/'+entry.id+'.json'||entry.snapshotPath!=='snapshots/'+entry.snapshotId+'.json'||!/^[a-f0-9]{64}$/.test(entry.snapshotId))throw new Error('Unsafe prospective index path');
    if(seen.has(entry.id)||runs.has(entry.runKey))throw new Error('Duplicate existing prospective record/run');
    seen.add(entry.id);runs.add(entry.runKey);
    const rt=await readFile(resolve(directory,entry.recordPath),'utf8'),st=await readFile(resolve(directory,entry.snapshotPath),'utf8');
    const record=JSON.parse(rt),snapshot=JSON.parse(st);
    await verifyEthereumProspectiveRecord(record,snapshot);
    if(json(ethereumProspectiveIndexEntry(record))!==json(entry)||json(record)!==rt||json(snapshot)!==st)throw new Error('Existing prospective bytes/index mismatch');
    const sameId=records.find(r=>r.id===record.id),sameRun=records.find(r=>r.runKey===record.runKey);
    if(sameRun&&sameRun.id!==record.id)throw new Error('Conflicting immutable candidate identity for the same economic run');
    if(sameId&&(json(sameId)!==rt||json(snapshots[snapshot.id])!==st))throw new Error('Preserved candidate archive conflict');
    if(!sameId)records.push(record);snapshots[snapshot.id]=snapshot;
    await save(entry.recordPath,rt);await save(entry.snapshotPath,st);
    if(directory===stored){
      committedTransportReferences.set(entry.recordPath,{path:entry.recordPath,repositoryPath:'research-data/ethereum-prospective-ledger/'+entry.recordPath,sourceCommit,sha256:sha(rt)});
      committedTransportReferences.set(entry.snapshotPath,{path:entry.snapshotPath,repositoryPath:'research-data/ethereum-prospective-ledger/'+entry.snapshotPath,sourceCommit,sha256:sha(st)});
    }
  }
}
const receipt={kind:'ethereum-prospective-issuance',sourceCommit,sourceTree,sourceHashes,runId:process.env.GITHUB_RUN_ID??null,
  startedAt:now(),status:'started',mode:verifyOnly?'verify-preserved-only':'capture-and-issue',reusePolicy:ETH_PROSPECTIVE_REUSE_POLICY,priceOnlyCandidates:true,economicSnapshotsActivated:0,
  newRecords:0,reusedRecords:0,newSnapshots:0,prospectiveScoredTargets:0,productionAdopted:false,
  externalGeminiReview:'omitted-by-user',reverseReview:'omitted-by-user',releaseAuthorized:false,errors:[]};
if(includeWarmStart)receipt.selectedModelKeys=[...modelKeys];
let tail=null,captureSnapshot=null;
await mkdir(out,{recursive:true});await save(receiptPath,json(receipt),false);
try{
  // Restored and retained raw evidence is validated before capture or any new
  // immutable forecast. The budget is separate from that evidence validation.
  const retained=await readEthereumCalibrationInputs({repositoryRoot:root});
  const retainedBudget=validateEthereumProspectiveWriteBudget({records:retained.records,observations:retained.observations});
  const budgetReceipt=({projectedIndex,projectedIndexText,...receipt})=>receipt;
  receipt.retainedWriteBudget=budgetReceipt(retainedBudget);
  await loadExisting();await loadExisting(out);receipt.preservedRecords=records.length;
  if(verifyOnly){
    const ledger=await collectForecastModelIdentity(root,'dist/ethereum-prospective-records.js');
    const warmLedger=includeWarmStart||records.some(r=>r.modelKey==='warmStart')?
      await collectForecastModelIdentity(root,ETH_WARM_START_PROSPECTIVE_ENTRY):null;
    const models={adaptive:{...ledger,version:ETH_ADAPTIVE_POLICY.version},pooled:{...ledger,version:ETH_POOLED_POLICY.version},
      ...(warmLedger?{warmStart:{...warmLedger,version:ETH_WARM_START_PROSPECTIVE_POLICY.modelVersion}}:{})};
    const eligible=records.filter(r=>r.model.sourceHash===models[r.modelKey]?.sourceHash&&r.model.version===models[r.modelKey]?.version);
    if(!modelKeys.every(k=>eligible.some(r=>r.modelKey===k)))throw new Error('All selected current candidates need preserved records for replay-only verification');
    receipt.replay=[];
    for(const record of eligible){
      const currentModel=models[record.modelKey];
      receipt.replay.push(await replayEthereumProspectiveRecord({record,snapshot:snapshots[record.snapshotId],currentModel}));
    }
    receipt.status='verified-preserved';receipt.networkRequests=0;receipt.reusedRecords=eligible.length;
    receipt.preservedOnlyRecords=records.length-eligible.length;receipt.totalRecords=records.length;
    receipt.uniqueOrigins=new Set(records.map(r=>r.asOf)).size;
    receipt.originalIssuedAt=Object.fromEntries(eligible.map(r=>[r.id,r.issuedAt]));
    receipt.indexUnchanged=true;
  }else{
  const committedBase=await readEthereumCommittedBase({repositoryRoot:root,sourceCommit,sourceTree});
  const baseText=committedBase.base.text;
  receipt.baseSelection=committedBase.receipt;
  receipt.baseSelectionPolicy=ETH_COMMITTED_BASE_POLICY;
  tail=await captureEthereumResearchTail({baseText});
  const acquisitionId=await forecastHash(tail);
  await save('acquisitions/'+acquisitionId+'.json',json(tail));
  if(tail.completeBody&&tail.rawText!==null)await save('raw/coinbase-tail-'+tail.rawSha256+'.json',tail.rawText);
  else if(tail.completeBody&&tail.rawBase64!==null)await save('raw/coinbase-tail-'+tail.rawSha256+'.base64.txt',tail.rawBase64);
  if(tail.status!=='success')throw new Error('No candidate issue after failed ETH capture: '+tail.error?.message);
  captureSnapshot=await createEthereumResearchSnapshot({base:committedBase.base,
    tail:{text:tail.rawText,requestStartedAt:tail.requestStartedAt,bodyCompletedAt:tail.bodyCompletedAt,sourceUrl:tail.sourceUrl}});
  const priceSource=rebuildEthereumResearchPrices({baseText,tailText:tail.rawText,requestStartedAt:tail.requestStartedAt,
    bodyCompletedAt:tail.bodyCompletedAt,sourceUrl:tail.sourceUrl});
  const generationStartedAt=now(),options={ethHistory:priceSource.archive,asOf:captureSnapshot.asOf,horizonDays:730,sampleCount:256,seed:20261027};
  const forecasts={adaptive:buildEthereumAdaptiveForecast(options),pooled:buildEthereumPooledForecast(options)};
  if(includeWarmStart)forecasts.warmStart=buildEthereumWarmStartProspectiveForecast(options);
  const generatedAt=now();
  const ledger=await collectForecastModelIdentity(root,'dist/ethereum-prospective-records.js');
  const warmLedger=includeWarmStart||records.some(r=>r.modelKey==='warmStart')?
    await collectForecastModelIdentity(root,ETH_WARM_START_PROSPECTIVE_ENTRY):null;
  const models={adaptive:{...ledger,version:ETH_ADAPTIVE_POLICY.version},pooled:{...ledger,version:ETH_POOLED_POLICY.version},
    ...(warmLedger?{warmStart:{...warmLedger,version:ETH_WARM_START_PROSPECTIVE_POLICY.modelVersion}}:{})};
  const modelFor=modelKey=>models[modelKey];
  const issuedAt=now(),decisions=[],prepared=[];
  for(const modelKey of modelKeys){
    const candidate=await createEthereumProspectiveRecord({snapshot:captureSnapshot,forecast:forecasts[modelKey],model:modelFor(modelKey),modelKey,
      generationStartedAt,generatedAt,issuedAt});
    await verifyEthereumProspectiveRecord(candidate,captureSnapshot);
    const decision=await decideEthereumProspectiveIssue({records,snapshots,candidate,candidateSnapshot:captureSnapshot});
    prepared.push({candidate,decision});decisions.push({modelKey,action:decision.action,id:decision.record.id,runKey:decision.record.runKey,
      attemptedRunKey:candidate.runKey,attemptedSnapshotId:captureSnapshot.id,reusePolicy:decision.reusePolicy,
      consumedInputHash:decision.consumedInputHash,reason:decision.reason,equivalentPreservedIds:decision.equivalentPreservedIds??[]});
  }
  // A full archive must stop before adding any record, snapshot, observation,
  // or index. Acquisition attempts retain their own truthful failure receipt.
  const writeBudget=validateEthereumProspectiveWriteBudget({records:retained.records,observations:retained.observations,
    additionalRecords:prepared.filter(value=>value.decision.action==='append').map(value=>value.candidate),
    additionalObservations:[captureSnapshot]});
  receipt.projectedWriteBudget=budgetReceipt(writeBudget);
  // Validate every selected candidate before the first new immutable record is written.
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
  const warmStartEvaluator=warmLedger?{...warmLedger,version:'eth-warm-start-prospective-evaluator-1'}:undefined;
  const evaluation=await evaluateEthereumProspectiveRecords({records,snapshots,observations:[captureSnapshot],evaluatedAt,evaluator,warmStartEvaluator});
  await save('evaluations/'+evaluation.id+'.json',json(evaluation));
  await save('index.json',writeBudget.projectedIndexText,false);
  const replay=[];
  for(const {modelKey,action,id}of decisions){
    const record=records.find(r=>r.id===id);
    replay.push(await replayEthereumProspectiveRecord({record,snapshot:snapshots[record.snapshotId],currentModel:modelFor(modelKey)}));
  }
  receipt.status='issued-or-reused';receipt.asOf=captureSnapshot.asOf;receipt.anchor=captureSnapshot.primaryPrices.at(-1)[1];
  receipt.informationCutoffAt=captureSnapshot.informationCutoffAt;receipt.attemptedIssueAt=issuedAt;receipt.recordIssuedAt=Object.fromEntries(decisions.map(d=>[d.modelKey,records.find(r=>r.id===d.id).issuedAt]));receipt.decisions=decisions;receipt.replay=replay;
  receipt.totalRecords=records.length;receipt.uniqueOrigins=new Set(records.map(r=>r.asOf)).size;
  receipt.modelOrigins=Object.fromEntries([...new Set([...modelKeys,...records.map(r=>r.modelKey)])].map(k=>[k,new Set(records.filter(r=>r.modelKey===k).map(r=>r.asOf)).size]));
  receipt.evaluation={id:evaluation.id,evaluatedAt,pending:evaluation.pending,missingObservations:evaluation.missingObservations,scored:evaluation.scored,
    earliestOutcomeEventAt:records.flatMap(r=>r.targets.map(t=>t.eventAt)).sort()[0]};
  receipt.prospectiveScoredTargets=evaluation.scored;
  }
}catch(error){receipt.status='blocked';receipt.errors.push({name:error.name,message:error.message});}
receipt.finishedAt=now();await save(receiptPath,json(receipt),false);
if(!verifyOnly)await save('issuances/'+await forecastHash(receipt)+'.json',json(receipt));
const manifest=[...files].map(([path,text])=>({path,bytes:Buffer.byteLength(text,'utf8'),sha256:sha(text),
  gitBlobSha:createHash('sha1').update('blob '+Buffer.byteLength(text,'utf8')+'\0').update(text).digest('hex')}));
await save(verifyOnly?'replay-files.json':'files.json',json({files:manifest}),false);
console.log((verifyOnly?'ETH_PROSPECTIVE_REPLAY_RECEIPT ':'ETH_PROSPECTIVE_RECEIPT ')+JSON.stringify({...receipt,acquisition:tail?{status:tail.status,requestStartedAt:tail.requestStartedAt,
  bodyCompletedAt:tail.bodyCompletedAt,requests:tail.requests,retries:tail.retries,bytes:tail.receivedBytes,rawSha256:tail.rawSha256,error:tail.error}:null,files:manifest}));
const transportFiles=[...files].filter(([path])=>!committedTransportReferences.has(path));
const transportSize=transportFiles.reduce((n,[,text])=>n+Buffer.byteLength(text,'utf8'),0);
if(!verifyOnly&&committedTransportReferences.size)console.log('ETH_PROSPECTIVE_COMMITTED_REFERENCES '+JSON.stringify({sourceCommit,files:[...committedTransportReferences.values()],allOriginalFilesRetainedInArtifact:true}));
if(!verifyOnly&&transportSize<=8*1024*1024){
  for(const [path,text]of transportFiles){const size=20000,total=Math.ceil(text.length/size);for(let index=0;index<total;index++)console.log('ETH_PROSPECTIVE_FILE_CHUNK '+JSON.stringify({path,index,total,data:text.slice(index*size,(index+1)*size)}));}
}else if(!verifyOnly)console.log('ETH_PROSPECTIVE_LOG_TRANSPORT '+JSON.stringify({status:'artifact-only',bytes:transportSize,maximumRawBytes:8*1024*1024}));
if(receipt.status==='blocked')process.exitCode=1;
