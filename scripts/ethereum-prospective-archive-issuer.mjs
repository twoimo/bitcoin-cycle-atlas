import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp} from '../dist/forecast-information-time.js';
import {buildEthereumAdaptiveForecast,ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {buildEthereumPooledForecast,ETH_POOLED_POLICY} from '../dist/ethereum-pooled-model.js';
import {createEthereumResearchSnapshot,rebuildEthereumResearchPrices} from '../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord,verifyEthereumProspectiveRecord,ethereumProspectiveIndexEntry,
  replayEthereumProspectiveRecord,evaluateEthereumProspectiveRecords} from '../dist/ethereum-prospective-dispatch.js';
import {buildEthereumWarmStartProspectiveForecast,ETH_WARM_START_PROSPECTIVE_POLICY,ETH_WARM_START_PROSPECTIVE_ENTRY} from '../dist/ethereum-warm-start-prospective.js';
import {collectForecastModelIdentity} from './build-forecast-ledger.mjs';
import {captureEthereumResearchTail} from './ethereum-prospective-collector-core.mjs';
import {readEthereumCommittedBase,ETH_COMMITTED_BASE_POLICY} from './ethereum-prospective-base.mjs';
import {decideEthereumProspectiveIssue,ETH_PROSPECTIVE_REUSE_POLICY,ethereumProspectiveConsumedIdentity} from './ethereum-prospective-reuse.mjs';
import {ethereumProspectiveArchiveSourceInfo,visitEthereumProspectiveArchiveRecords,readEthereumProspectiveArchiveFile} from './ethereum-prospective-archive-source.mjs';
import {selectEthereumProspectivePagedObservations} from './ethereum-prospective-calibration-paged.mjs';
import {ethereumOperationJson as encoded,ethereumOperationSha as sha,readEthereumOperationJson} from './ethereum-prospective-operation-io.mjs';

const json=canonicalForecastJson,MODELS=['adaptive','pooled','warmStart'];
export const ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY=Object.freeze({
  version:'eth-prospective-archive-operations-1',receiptPageSize:128,maximumReceiptBytes:64*1024*1024,
  originalModelContractsUnchanged:true,originalReusePolicyUnchanged:true,
  globalFlatLedgerMaterialized:false,retrospectiveIssuance:false,releaseAuthorized:false,productionPromoted:false,
});
const P=ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY;
const sourceSummary=source=>{
  const info=ethereumProspectiveArchiveSourceInfo(source);
  return {id:info.id,archiveManifestId:info.archiveManifestId,archiveSequence:info.archiveSequence,
    records:info.records,observations:info.observations,recordIds:info.recordIds,observationIds:info.observationIds,
    completeInventoryVerified:info.completeInventoryVerified};
};
function receiptFiles(){
  const files=new Map();let total=0;
  return {files,add(path,bytes){
    if(files.has(path)){if(!files.get(path).equals(bytes))throw new Error('Conflicting archive operation result');return;}
    if(bytes.length>8*1024*1024||(total+=bytes.length)>P.maximumReceiptBytes)throw new Error('Archive operation receipt byte budget exhausted');
    files.set(path,bytes);
  },checkpoint(value){const bytes=encoded(value),path='receipts/'+sha(bytes)+'.json';this.add(path,bytes);return {path,bytes:bytes.length,sha256:sha(bytes)};}};
}
function pages(rows,kind,collector){
  const result=[];
  for(let offset=0;offset<rows.length;offset+=P.receiptPageSize){
    const entries=rows.slice(offset,offset+P.receiptPageSize);
    result.push({...collector.checkpoint({schemaVersion:1,kind,offset,entries}),entries:entries.length});
  }
  return result;
}
export async function collectEthereumArchiveModelIdentities(repositoryRoot){
  const ledger=await collectForecastModelIdentity(repositoryRoot,'dist/ethereum-prospective-records.js');
  const warm=await collectForecastModelIdentity(repositoryRoot,ETH_WARM_START_PROSPECTIVE_ENTRY);
  return {models:{adaptive:{...ledger,version:ETH_ADAPTIVE_POLICY.version},pooled:{...ledger,version:ETH_POOLED_POLICY.version},
    warmStart:{...warm,version:ETH_WARM_START_PROSPECTIVE_POLICY.modelVersion}},
    evaluator:{...ledger,version:'eth-prospective-evaluator-1'},warmStartEvaluator:{...warm,version:'eth-warm-start-prospective-evaluator-1'}};
}

/** Every retained record is replayed against its exact current committed graph.
 * A missing historical graph is an error, never an excuse to omit a record. */
export async function replayEthereumArchiveSource({source,models}={}){
  const receipts=[],bindings=new Map(),origins=new Set(),collected=receiptFiles();
  await visitEthereumProspectiveArchiveRecords(source,async(record,snapshot)=>{
    const currentModel=models?.[record.modelKey];if(!currentModel)throw new Error('Missing committed replay model '+record.modelKey);
    receipts.push(await replayEthereumProspectiveRecord({record,snapshot,currentModel}));origins.add(record.asOf);
    for(const horizonDays of [30,90,180]){
      const binding={modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,options:record.options,horizonDays};
      bindings.set(json(binding),binding);
    }
  });
  const body={schemaVersion:1,kind:'ethereum-prospective-paged-replay',policyVersion:P.version,inputSource:sourceSummary(source),
    status:'verified-preserved',replayedRecords:receipts.length,uniqueOrigins:origins.size,
    replayPages:pages(receipts,'ethereum-prospective-replay-page',collected),
    sourceGraphs:Object.fromEntries(Object.entries(models).map(([key,value])=>[key,{sourceHash:value.sourceHash,files:value.files,version:value.version}])),
    originalRecordsChanged:false,networkRequests:0,productionPromoted:false,releaseAuthorized:false};
  return {report:{id:await forecastHash(body),...body},files:collected.files,bindings:[...bindings.values()].sort((a,b)=>json(a).localeCompare(json(b)))};
}

/** Global vintage checks precede bounded, unchanged one-record evaluator calls.
 * Components keep their original IDs. The aggregate is a new versioned receipt,
 * not the ID of a fictitious legacy evaluation of a pruned global ledger. */
export async function evaluateEthereumArchiveSource({source,evaluatedAt,evaluator,warmStartEvaluator}={}){
  const cutoff=normalizeForecastTimestamp(evaluatedAt),targetDates=new Set(),origins=new Set();
  await visitEthereumProspectiveArchiveRecords(source,async record=>{
    if(record.issuedAt>cutoff)throw new Error('Candidate cannot be evaluated before actual issuance');
    for(const target of record.targets)targetDates.add(target.targetDate);origins.add(record.asOf);
  });
  const selected=await selectEthereumProspectivePagedObservations({source,targetDates:[...targetDates].sort(),informationCutoffAt:cutoff,
    observationKinds:['ethereum-prospective-input']});
  if(selected.invalidObservations.length)throw new Error('Invalid globally retained prospective observation vintages: '+json(selected.invalidObservations));
  const actuals=new Map(selected.rows.map(row=>[row.date,row])),collected=receiptFiles(),components=[];
  let pending=0,missingObservations=0,scored=0;
  await visitEthereumProspectiveArchiveRecords(source,async(record,snapshot)=>{
    const needed=new Map();
    for(const target of record.targets){const row=actuals.get(target.targetDate);if(row)needed.set(row.observationId,row.descriptor.logicalPath);}
    const observations=[];
    for(const [id,path]of needed){
      const observation=JSON.parse((await readEthereumProspectiveArchiveFile(source,path)).toString('utf8'));
      if(observation.id!==id||observation.kind!=='ethereum-prospective-input')throw new Error('Selected original observation identity differs');
      observations.push(observation);
    }
    const component=await evaluateEthereumProspectiveRecords({records:[record],snapshots:{[snapshot.id]:snapshot},observations,
      evaluatedAt:cutoff,evaluator,warmStartEvaluator});
    // Whole original winning snapshots can contain other targets. Verify each
    // resulting row against the globally selected price and exact vintage.
    for(const row of component.rows){
      const expected=actuals.get(row.targetDate);
      if(row.status==='scored'&&(!expected||row.actual!==expected.price||row.source.snapshotId!==expected.observationId))
        throw new Error('Bounded evaluator differs from global archive vintage selection');
      if(row.eventAt<=cutoff&&Boolean(expected)!==(row.status==='scored'))throw new Error('Archive evaluator lost an eligible global target');
    }
    // Pack complete unchanged component receipts into bounded pages. One Git
    // object per historical record per run would create a quadratic file-count
    // bottleneck even while each component's raw semantics remain unchanged.
    components.push(component);
    pending+=component.pending;missingObservations+=component.missingObservations;scored+=component.scored;
  });
  const body={schemaVersion:1,kind:'ethereum-prospective-paged-evaluation',policyVersion:P.version,evaluatedAt:cutoff,
    inputSource:sourceSummary(source),records:components.length,uniqueOrigins:origins.size,pending,missingObservations,scored,
    componentPages:pages(components,'ethereum-prospective-evaluation-page',collected),
    observationSelection:{scope:['ethereum-prospective-input'],totalValidated:selected.observationCount,
      futureObservationIds:selected.futureObservationIds,ignoredObservationIds:selected.ignoredObservationIds,
      foreignObservationIds:selected.foreignObservationIds,globalVintageConflictsChecked:true},
    evaluator,warmStartEvaluator:warmStartEvaluator??null,originalEvaluatorContractsUnchanged:true,productionPromoted:false,coverageGuarantee:false,releaseAuthorized:false};
  const report={id:await forecastHash(body),...body};collected.checkpoint(report);
  return {report,files:collected.files};
}

/** Prepare one bounded current-run delta. No original archive is flattened or
 * overwritten. Reuse examines every record and applies the unchanged original
 * policy to every possible global match, including raw-run conflicts. */
export async function prepareEthereumArchiveIssue({repositoryRoot,source,sourceIdentity,includeWarmStart=true,
  capture=captureEthereumResearchTail,now=()=>new Date().toISOString()}={}){
  const files=new Map(),info=ethereumProspectiveArchiveSourceInfo(source),keys=includeWarmStart?MODELS:MODELS.slice(0,2);
  const receipt={schemaVersion:1,kind:'ethereum-prospective-archive-issuance',policyVersion:P.version,...sourceIdentity,
    inputSource:sourceSummary(source),startedAt:now(),status:'started',mode:'archive-backed-capture-and-issue',selectedModelKeys:keys,
    reusePolicy:ETH_PROSPECTIVE_REUSE_POLICY,preservedRecords:info.records,newRecords:0,reusedRecords:0,newSnapshots:0,
    prospectiveScoredTargets:0,priceOnlyCandidates:true,economicSnapshotsActivated:0,productionAdopted:false,
    externalGeminiReview:'omitted-by-user',reverseReview:'omitted-by-user',releaseAuthorized:false,productionPromoted:false,errors:[]};
  let tail=null;
  try{
    const committedBase=await readEthereumCommittedBase({repositoryRoot,...sourceIdentity,clock:now});
    receipt.baseSelection=committedBase.receipt;receipt.baseSelectionPolicy=ETH_COMMITTED_BASE_POLICY;
    tail=await capture({baseText:committedBase.base.text});
    files.set('acquisitions/'+await forecastHash(tail)+'.json',encoded(tail));
    if(tail.completeBody&&tail.rawText!==null)files.set('raw/coinbase-tail-'+tail.rawSha256+'.json',Buffer.from(tail.rawText));
    else if(tail.completeBody&&tail.rawBase64!==null)files.set('raw/coinbase-tail-'+tail.rawSha256+'.base64.txt',Buffer.from(tail.rawBase64));
    if(tail.status!=='success')throw new Error('No candidate issue after failed ETH capture: '+tail.error?.message);
    const snapshot=await createEthereumResearchSnapshot({base:committedBase.base,
      tail:{text:tail.rawText,requestStartedAt:tail.requestStartedAt,bodyCompletedAt:tail.bodyCompletedAt,sourceUrl:tail.sourceUrl}});
    const prices=rebuildEthereumResearchPrices({baseText:committedBase.base.text,tailText:tail.rawText,
      requestStartedAt:tail.requestStartedAt,bodyCompletedAt:tail.bodyCompletedAt,sourceUrl:tail.sourceUrl});
    const generationStartedAt=now(),options={ethHistory:prices.archive,asOf:snapshot.asOf,horizonDays:730,sampleCount:256,seed:20261027};
    const forecasts={adaptive:buildEthereumAdaptiveForecast(options),pooled:buildEthereumPooledForecast(options)};
    if(includeWarmStart)forecasts.warmStart=buildEthereumWarmStartProspectiveForecast(options);
    const generatedAt=now(),identities=await collectEthereumArchiveModelIdentities(repositoryRoot),issuedAt=now(),prepared=[];
    for(const modelKey of keys){
      const candidate=await createEthereumProspectiveRecord({snapshot,forecast:forecasts[modelKey],model:identities.models[modelKey],modelKey,generationStartedAt,generatedAt,issuedAt});
      await verifyEthereumProspectiveRecord(candidate,snapshot);
      prepared.push({candidate,consumedInputHash:await ethereumProspectiveConsumedIdentity(candidate,snapshot),matches:[],record:candidate});
    }
    await visitEthereumProspectiveArchiveRecords(source,async(record,originalSnapshot)=>{
      for(const item of prepared){
        const candidate=item.candidate;
        if(record.runKey!==candidate.runKey&&(record.asOf!==candidate.asOf||record.modelKey!==candidate.modelKey||
          record.model.sourceHash!==candidate.model.sourceHash||record.model.version!==candidate.model.version))continue;
        const decision=await decideEthereumProspectiveIssue({records:[record],snapshots:{[originalSnapshot.id]:originalSnapshot},candidate,candidateSnapshot:snapshot});
        if(decision.action!=='reuse')continue;
        item.matches.push(record.id);
        if(item.record===candidate||record.issuedAt<item.record.issuedAt||record.issuedAt===item.record.issuedAt&&record.id<item.record.id)item.record=record;
      }
    });
    const index=await readEthereumOperationJson(repositoryRoot,'build/ethereum-prospective-ledger/index.json',{maximumBytes:1024*1024});
    const entries=[...index.entries],decisions=[];
    for(const item of prepared){
      const {candidate,record}=item,action=item.matches.length?'reuse':'append';
      decisions.push({modelKey:candidate.modelKey,action,id:record.id,runKey:record.runKey,attemptedRunKey:candidate.runKey,
        attemptedSnapshotId:snapshot.id,reusePolicy:ETH_PROSPECTIVE_REUSE_POLICY,consumedInputHash:item.consumedInputHash,
        reason:action==='append'?'new-completed-input-or-model':record.runKey===candidate.runKey?'same-raw-run':'same-completed-input-excluded-rows-may-differ',
        equivalentPreservedIds:item.matches.sort()});
      if(action==='append'){
        if(info.recordEntries.some(entry=>entry.runKey===record.runKey||entry.id===record.id))throw new Error('New candidate conflicts with global archive identity');
        files.set('records/'+record.id+'.json',encoded(record));entries.push(ethereumProspectiveIndexEntry(record));receipt.newRecords++;
      }else receipt.reusedRecords++;
    }
    if(receipt.newRecords){files.set('snapshots/'+snapshot.id+'.json',encoded(snapshot));receipt.newSnapshots=1;}
    const currentObservationPaths=Object.keys(info.inputFiles).filter(path=>path.startsWith('build/ethereum-prospective-ledger/observations/'));
    if(!currentObservationPaths.includes('build/ethereum-prospective-ledger/observations/'+snapshot.id+'.json')&&currentObservationPaths.length>=500)
      throw new Error('Current-run delta exceeds unchanged observation bound');
    files.set('observations/'+snapshot.id+'.json',encoded(snapshot));
    const indexBytes=encoded({schemaVersion:1,kind:'ethereum-prospective-index',entries});
    if(entries.length>2000||indexBytes.length>1024*1024)throw new Error('Current-run delta exceeds unchanged record or index bound');
    files.set('index.json',indexBytes);
    receipt.status='issued-or-reused';receipt.asOf=snapshot.asOf;receipt.anchor=snapshot.primaryPrices.at(-1)[1];
    receipt.informationCutoffAt=snapshot.informationCutoffAt;receipt.attemptedIssueAt=issuedAt;receipt.decisions=decisions;
    receipt.recordIssuedAt=Object.fromEntries(prepared.map(item=>[item.candidate.modelKey,item.record.issuedAt]));
    receipt.totalRecords=info.records+receipt.newRecords;receipt.actualCaptureSnapshotId=snapshot.id;
  }catch(error){
    // Preserve complete acquisition evidence even when candidate preparation
    // fails. No partly prepared forecast/snapshot/index is returned as issued.
    for(const path of files.keys())if(!/^(acquisitions|raw)\//.test(path))files.delete(path);
    receipt.newRecords=0;receipt.newSnapshots=0;receipt.reusedRecords=0;receipt.status='blocked';receipt.errors.push({name:error.name,message:error.message});
  }
  receipt.finishedAt=now();
  return {files,receipt,acquisition:tail?{status:tail.status,requestStartedAt:tail.requestStartedAt,bodyCompletedAt:tail.bodyCompletedAt,
    requests:tail.requests,retries:tail.retries,bytes:tail.receivedBytes,rawSha256:tail.rawSha256,error:tail.error}:null};
}
