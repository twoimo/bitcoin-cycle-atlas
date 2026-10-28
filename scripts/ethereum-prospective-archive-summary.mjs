import {execFileSync} from 'node:child_process';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {ETH_PROSPECTIVE_ARCHIVE_FORMAT as F} from './ethereum-prospective-archive-core.mjs';
import {ethereumProspectiveArchiveSourceInfo,visitEthereumProspectiveArchiveRecords,
  readEthereumProspectiveArchiveFile} from './ethereum-prospective-archive-source.mjs';
import {ETH_ARCHIVE_OPERATION_PATHS as P,openEthereumActiveArchiveSource} from './ethereum-prospective-archive-operations.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY,collectEthereumArchiveModelIdentities,
  replayEthereumArchiveSource,evaluateEthereumArchiveSource} from './ethereum-prospective-archive-issuer.mjs';
import {ethereumOperationJson as encoded,ethereumOperationSha as sha,readEthereumOperationFile} from './ethereum-prospective-operation-io.mjs';

export const ETH_PROSPECTIVE_ARCHIVE_SUMMARY_POLICY=Object.freeze({
  version:'eth-prospective-archive-summary-1',maximumFileBytes:8*1024*1024,
  maximumReportBytes:ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY.maximumReceiptBytes,
  receiptPageSize:ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY.receiptPageSize,
  completeInventoryRequired:true,originalModelReplayRequired:true,globalEvaluationReplayRequired:true,
  legacyReaderUnchanged:true,releaseAuthorized:false,productionPromoted:false,
});
const POLICY=ETH_PROSPECTIVE_ARCHIVE_SUMMARY_POLICY,json=canonicalForecastJson,HEX=/^[a-f0-9]{64}$/;
const fail=message=>{throw new Error(message);},equal=(a,b)=>json(a)===json(b);
const copy=value=>JSON.parse(json(value));
function canonical(bytes,path){
  const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))fail('Summary evidence is not lossless UTF-8 '+path);
  const value=JSON.parse(text);if(!encoded(value).equals(bytes))fail('Summary evidence is not canonical '+path);return value;
}
function graphSummary(models){
  return Object.fromEntries(Object.entries(models).map(([key,value])=>[key,{sourceHash:value.sourceHash,files:value.files,version:value.version}]));
}
function sameSemanticInput(input,info,label){
  F.keys(input,['id','archiveManifestId','archiveSequence','records','observations','recordIds','observationIds','completeInventoryVerified'],label+' source');
  const ancestor=info.archiveAncestors.find(row=>row.id===input.archiveManifestId);
  if(!HEX.test(input.id)||!ancestor||ancestor.sequence!==input.archiveSequence||input.completeInventoryVerified!==true||
    input.records!==info.records||input.observations!==info.observations||
    !equal(input.recordIds,info.recordIds)||!equal(input.observationIds,info.observationIds))
    fail(label+' does not cover the complete current semantic inventory; a fresh issuance/evaluation run is required');
}
function sameReexecutedReport(actual,expected,label){
  // Receipt checkpoints written after an operation change inputSource.id.
  // Complete semantic inventories and retained manifest ancestry are checked
  // separately; all numerical fields, source graphs and page bytes must replay.
  const {id:actualId,inputSource:actualInput,...body}=actual;
  const {id:expectedId,inputSource:expectedInput,...reexecuted}=expected;
  if(!equal(body,reexecuted))fail(label+' differs from actual original-source reexecution');
}

/** Read and independently verify the full archive-backed downstream evidence.
 * A missing active marker returns null so the unchanged legacy consumer can
 * handle its own format. Every positive replay/scoring assertion here follows
 * actual frozen-model execution and exact bounded-page comparison. */
export async function readEthereumProspectiveArchiveSummary({repositoryRoot,sourceCommit,sourceTree}={}){
  const markerBytes=await readEthereumOperationFile(repositoryRoot,P.active,{optional:true,maximumBytes:1024*1024});
  if(markerBytes===null)return null;
  const source=await openEthereumActiveArchiveSource({repositoryRoot}),info=ethereumProspectiveArchiveSourceInfo(source);
  const identities=await collectEthereumArchiveModelIdentities(repositoryRoot);
  const git=(...args)=>execFileSync('git',args,{cwd:repositoryRoot,encoding:'utf8',timeout:10000}).trim();
  if(sourceCommit!==identities.evaluator.sourceCommit||sourceTree!==git('rev-parse','HEAD^{tree}'))
    fail('Archive summary requires the exact current committed source identity');
  const inputSha256={},reads=new Map(),logical=new Map(info.logicalDescriptors.map(row=>[row.path,row]));
  const physicalBySha=new Map();
  for(const [path,descriptor]of Object.entries(info.inputFiles)){
    if(!physicalBySha.has(descriptor.sha256))physicalBySha.set(descriptor.sha256,[]);
    physicalBySha.get(descriptor.sha256).push(path);
  }
  function trackLogical(path){
    const descriptor=logical.get(path);if(!descriptor)fail('Missing immutable summary checkpoint '+path);
    for(const physical of physicalBySha.get(descriptor.sha256)??[])inputSha256[physical]=descriptor.sha256;
    return descriptor;
  }
  async function read(path,{optional=false,checkpoint=false}={}){
    const bytes=await readEthereumOperationFile(repositoryRoot,path,{optional,maximumBytes:POLICY.maximumFileBytes});
    if(bytes===null)return null;
    const value=canonical(bytes,path),hash=sha(bytes);inputSha256[path]=hash;reads.set(path,{bytes:bytes.length,sha256:hash});
    if(checkpoint){
      const logicalPath='receipts/'+hash+'.json';trackLogical(logicalPath);
      if(!(await readEthereumProspectiveArchiveFile(source,logicalPath)).equals(bytes))fail('Mutable summary report differs from its immutable checkpoint '+path);
    }
    return {value,bytes:bytes.length};
  }
  inputSha256[P.active]=sha(markerBytes);reads.set(P.active,{bytes:markerBytes.length,sha256:sha(markerBytes)});
  await read(P.restoreReceipt);
  const issued=await read(P.prospective+'/receipt.json',{checkpoint:true}),receipt=issued.value;
  if(receipt.sourceCommit!==sourceCommit||receipt.sourceTree!==sourceTree||
    receipt.kind!=='ethereum-prospective-archive-issuance'||receipt.policyVersion!==ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY.version||
    !['issued-or-reused','blocked'].includes(receipt.status)||receipt.releaseAuthorized!==false||receipt.productionPromoted!==false)
    fail('Archive issuance receipt differs from this exact committed run');
  const evaluated=await read(P.evaluation,{checkpoint:true});
  const replayed=await read(P.prospective+'/replay-receipt.json',{checkpoint:true}),replayReceipt=replayed.value;
  F.addressed(replayReceipt,'ethereum-prospective-paged-replay');sameSemanticInput(replayReceipt.inputSource,info,'Replay');
  if(replayReceipt.policyVersion!==ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY.version||replayReceipt.status!=='verified-preserved'||
    replayReceipt.replayedRecords!==info.records||replayReceipt.networkRequests!==0||replayReceipt.originalRecordsChanged!==false||
    !equal(replayReceipt.sourceGraphs,graphSummary(identities.models)))fail('Replay summary or frozen source graphs do not match actual inputs');
  const evaluation=evaluated?.value??null;
  if(evaluation){
    F.addressed(evaluation,'ethereum-prospective-paged-evaluation');sameSemanticInput(evaluation.inputSource,info,'Evaluation');
    if(evaluation.policyVersion!==ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY.version||evaluation.records!==info.records||
      !equal(evaluation.evaluator,identities.evaluator)||!equal(evaluation.warmStartEvaluator,identities.warmStartEvaluator))
      fail('Evaluation provenance differs from this exact committed evaluator');
  }
  if(receipt.status==='issued-or-reused'&&!receipt.evaluation)fail('Successful archive issuance has no evaluation binding');
  let issuanceEvaluation=null,issuanceEvaluationBytes=0;
  if(receipt.evaluation){
    const descriptor=receipt.evaluation.checkpoint;
    F.keys(descriptor,['path','bytes','sha256'],'issuance evaluation checkpoint');
    if(!HEX.test(descriptor.sha256)||descriptor.path!=='receipts/'+descriptor.sha256+'.json'||!Number.isSafeInteger(descriptor.bytes)||
      descriptor.bytes<1||descriptor.bytes>POLICY.maximumFileBytes)fail('Invalid immutable issuance evaluation checkpoint');
    trackLogical(descriptor.path);const raw=await readEthereumProspectiveArchiveFile(source,descriptor.path);
    if(raw.length!==descriptor.bytes||sha(raw)!==descriptor.sha256)fail('Issuance evaluation checkpoint byte identity mismatch');
    issuanceEvaluation=canonical(raw,descriptor.path);issuanceEvaluationBytes=raw.length;
    F.addressed(issuanceEvaluation,'ethereum-prospective-paged-evaluation');
    sameSemanticInput(issuanceEvaluation.inputSource,info,'Original issuance evaluation');
    if(issuanceEvaluation.policyVersion!==ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY.version||
      !equal(issuanceEvaluation.evaluator,identities.evaluator)||!equal(issuanceEvaluation.warmStartEvaluator,identities.warmStartEvaluator)||
      receipt.evaluation.id!==issuanceEvaluation.id||receipt.evaluation.evaluatedAt!==issuanceEvaluation.evaluatedAt||
      receipt.evaluation.pending!==issuanceEvaluation.pending||receipt.evaluation.missingObservations!==issuanceEvaluation.missingObservations||
      receipt.evaluation.scored!==issuanceEvaluation.scored||receipt.prospectiveScoredTargets!==issuanceEvaluation.scored||
      issuanceEvaluation.evaluatedAt>evaluation.evaluatedAt)
      fail('Original issuance evaluation pointer, provenance or counts differ from its immutable checkpoint');
  }

  const records=[],byId=new Map();
  await visitEthereumProspectiveArchiveRecords(source,record=>{
    const metadata={id:record.id,modelKey:record.modelKey,asOf:record.asOf,issuedAt:record.issuedAt,snapshotId:record.snapshotId,
      model:{version:record.model.version,sourceHash:record.model.sourceHash},outputHash:record.outputHash,pointCount:record.output.path.length,
      targets:record.targets.map(({horizonDays,targetDate,eventAt})=>({horizonDays,targetDate,eventAt}))};
    records.push(metadata);byId.set(metadata.id,metadata);
  });
  if(!equal(records.map(record=>record.id),info.recordIds))fail('Archive summary record visit omitted original evidence');
  const modelEvidence=[...new Set(['adaptive','pooled','warmStart',...records.map(record=>record.modelKey)])].map(modelKey=>{
    const owned=records.filter(record=>record.modelKey===modelKey);
    return {modelKey,recordCount:owned.length,uniqueOrigins:new Set(owned.map(record=>record.asOf)).size,pending:0,scored:0,
      earliestOutcomeEventAt:owned.flatMap(record=>record.targets.map(target=>target.eventAt)).sort()[0]??null,
      independentlyValidatedMarketRegimes:null,accuracyProven:false};
  });
  const models=new Map(modelEvidence.map(row=>[row.modelKey,row]));
  async function pages(descriptors,kind,reportBytes,{evaluationPages=false,input=info,accumulateModels=true}={}){
    const pageRecords=input.recordIds.map(id=>byId.get(id)),allowedObservations=new Set(input.observationIds);
    if(pageRecords.some(record=>!record)||!Array.isArray(descriptors)||descriptors.length!==Math.ceil(pageRecords.length/POLICY.receiptPageSize))
      fail('Summary page inventory does not cover every original record');
    const used=new Set(),componentIds=new Set();let offset=0,totalBytes=reportBytes,pending=0,missingObservations=0,scored=0;
    for(const descriptor of descriptors){
      F.keys(descriptor,['path','bytes','sha256','entries'],'summary page descriptor');
      if(!/^receipts\/[a-f0-9]{64}\.json$/.test(descriptor.path)||descriptor.path!=='receipts/'+descriptor.sha256+'.json'||
        used.has(descriptor.path)||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>POLICY.maximumFileBytes||
        !Number.isSafeInteger(descriptor.entries)||descriptor.entries<1||descriptor.entries>POLICY.receiptPageSize)
        fail('Invalid or duplicate bounded summary page descriptor');
      used.add(descriptor.path);totalBytes+=descriptor.bytes;
      if(totalBytes>POLICY.maximumReportBytes)fail('Summary report exceeds the unchanged cumulative receipt byte bound');
      const expected=trackLogical(descriptor.path),raw=await readEthereumProspectiveArchiveFile(source,descriptor.path);
      if(raw.length!==descriptor.bytes||sha(raw)!==descriptor.sha256||expected.sha256!==descriptor.sha256)
        fail('Summary page byte identity mismatch');
      const page=canonical(raw,descriptor.path);F.keys(page,['schemaVersion','kind','offset','entries'],'summary page');
      if(page.schemaVersion!==1||page.kind!==kind||page.offset!==offset||!Array.isArray(page.entries)||page.entries.length!==descriptor.entries)
        fail('Summary page kind, offset or entry count mismatch');
      for(const entry of page.entries){
        const record=pageRecords[offset++];if(!record)fail('Summary page contains an extra record');
        if(evaluationPages){
          F.addressed(entry,'ethereum-prospective-evaluation');
          if(componentIds.has(entry.id)||entry.records!==1||!equal(entry.recordIds,[record.id])||!Array.isArray(entry.rows)||entry.rows.length!==record.targets.length||
            !Array.isArray(entry.observationIds)||!equal(entry.observationIds,[...new Set(entry.observationIds)].sort())||
            entry.observationIds.some(id=>!allowedObservations.has(id)))
            fail('Evaluation component identity or original record coverage mismatch');
          componentIds.add(entry.id);
          let componentPending=0,componentMissing=0,componentScored=0;
          for(let index=0;index<entry.rows.length;index++){
            const row=entry.rows[index],target=record.targets[index];
            if(row.recordId!==record.id||row.modelKey!==record.modelKey||row.modelSourceHash!==record.model.sourceHash||row.asOf!==record.asOf||
              row.horizonDays!==target.horizonDays||row.targetDate!==target.targetDate||row.eventAt!==target.eventAt||
              !['pending','missing-observation','scored'].includes(row.status))fail('Evaluation row differs from its original record target');
            if(row.status==='pending'){pending++;componentPending++;if(accumulateModels)models.get(record.modelKey).pending++;}
            if(row.status==='missing-observation'){missingObservations++;componentMissing++;}
            if(row.status==='scored'){scored++;componentScored++;if(accumulateModels)models.get(record.modelKey).scored++;}
          }
          if(entry.pending!==componentPending||entry.missingObservations!==componentMissing||entry.scored!==componentScored)
            fail('Evaluation component counts differ from its complete rows');
        }else if(entry.id!==record.id||entry.modelKey!==record.modelKey||entry.outputHash!==record.outputHash||entry.points!==record.pointCount||
          entry.method!=='models-reexecuted-from-own-preserved-base-and-tail'||entry.recordIdentityEqual!==true)
          fail('Replay page does not bind the exact original output and identity');
      }
    }
    if(offset!==pageRecords.length)fail('Summary pages omitted an original record');
    return {records:offset,pending,missingObservations,scored,totalBytes};
  }
  await pages(replayReceipt.replayPages,'ethereum-prospective-replay-page',replayed.bytes);
  let counts=null;
  if(evaluation){
    counts=await pages(evaluation.componentPages,'ethereum-prospective-evaluation-page',evaluated.bytes,{evaluationPages:true});
    if(['records','pending','missingObservations','scored'].some(key=>evaluation[key]!==counts[key])||
      evaluation.uniqueOrigins!==new Set(records.map(record=>record.asOf)).size)fail('Aggregate evaluation counts differ from complete original components');
  }
  if(issuanceEvaluation){
    const originalCounts=await pages(issuanceEvaluation.componentPages,'ethereum-prospective-evaluation-page',issuanceEvaluationBytes,
      {evaluationPages:true,input:issuanceEvaluation.inputSource,accumulateModels:false});
    const originalOrigins=new Set(issuanceEvaluation.inputSource.recordIds.map(id=>byId.get(id).asOf)).size;
    if(['records','pending','missingObservations','scored'].some(key=>issuanceEvaluation[key]!==originalCounts[key])||issuanceEvaluation.uniqueOrigins!==originalOrigins)
      fail('Original issuance aggregate counts differ from its complete preserved components');
  }

  const graphs={...identities.evaluator.files,...identities.warmStartEvaluator.files};
  async function checkGraphs(){
    for(const [path,hash]of Object.entries(graphs)){
      const bytes=await readEthereumOperationFile(repositoryRoot,path,{maximumBytes:POLICY.maximumFileBytes});
      if(sha(bytes)!==hash)fail('Committed model source bytes changed during summary verification '+path);inputSha256[path]=hash;
    }
  }
  await checkGraphs();
  const actualReplay=await replayEthereumArchiveSource({source,models:identities.models});
  sameReexecutedReport(replayReceipt,actualReplay.report,'Preserved replay');
  for(const descriptor of replayReceipt.replayPages)if(!(await readEthereumProspectiveArchiveFile(source,descriptor.path)).equals(actualReplay.files.get(descriptor.path)??Buffer.alloc(0)))
    fail('Replay page differs from actual frozen-model reexecution');
  let actualEvaluation=null;
  if(evaluation){
    actualEvaluation=await evaluateEthereumArchiveSource({source,evaluatedAt:evaluation.evaluatedAt,
      evaluator:identities.evaluator,warmStartEvaluator:identities.warmStartEvaluator});
    sameReexecutedReport(evaluation,actualEvaluation.report,'Preserved evaluation');
    for(const descriptor of evaluation.componentPages)if(!(await readEthereumProspectiveArchiveFile(source,descriptor.path)).equals(actualEvaluation.files.get(descriptor.path)??Buffer.alloc(0)))
      fail('Evaluation page differs from actual global-vintage reexecution');
  }
  if(issuanceEvaluation){
    // The original issuance cutoff is independently meaningful. A valid later
    // evaluation cannot authenticate an altered earlier numeric result.
    if(actualEvaluation?.report.evaluatedAt!==issuanceEvaluation.evaluatedAt){
      actualEvaluation=null;
      actualEvaluation=await evaluateEthereumArchiveSource({source,evaluatedAt:issuanceEvaluation.evaluatedAt,
        evaluator:identities.evaluator,warmStartEvaluator:identities.warmStartEvaluator});
    }
    sameReexecutedReport(issuanceEvaluation,actualEvaluation.report,'Original issuance evaluation');
    for(const descriptor of issuanceEvaluation.componentPages)
      if(!(await readEthereumProspectiveArchiveFile(source,descriptor.path)).equals(actualEvaluation.files.get(descriptor.path)??Buffer.alloc(0)))
        fail('Original issuance evaluation page differs from actual global-vintage reexecution');
  }
  await checkGraphs();
  for(const [path,expected]of reads){
    const bytes=await readEthereumOperationFile(repositoryRoot,path,{maximumBytes:POLICY.maximumFileBytes});
    if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)fail('Summary report changed during independent verification '+path);
  }
  if(git('rev-parse','HEAD')!==sourceCommit||git('rev-parse','HEAD^{tree}')!==sourceTree)fail('Committed source identity changed during summary verification');
  const semanticDescriptors=info.logicalDescriptors.filter(row=>['records','snapshots','observations','outcome-observations'].includes(row.category))
    .map(({path,bytes,sha256,gitBlobSha})=>({path,bytes,sha256,gitBlobSha}));
  return {receipt,records,modelEvidence,evaluation,issuanceEvaluation,
    replayReceipt:{...replayReceipt,newRecords:0,reusedRecords:info.records,indexUnchanged:true},inputSha256,
    verification:{policyVersion:POLICY.version,mode:'archive-backed',inputSourceId:info.id,archiveManifestId:info.archiveManifestId,
      archiveSequence:info.archiveSequence,recordIds:info.recordIds,observationIds:info.observationIds,
      semanticInventorySha256:sha(Buffer.from(json(semanticDescriptors))),completeSemanticInventoryMatched:true,
      evaluationId:evaluation?.id??null,replayId:replayReceipt.id,
      originalIssuanceEvaluationId:issuanceEvaluation?.id??null,originalIssuanceEvaluationCheckpoint:copy(receipt.evaluation?.checkpoint??null),
      originalIssuanceEvaluationPagesVerified:issuanceEvaluation!==null,
      originalIssuanceEvaluationActuallyReexecuted:issuanceEvaluation!==null,
      evaluationComponentPages:copy(evaluation?.componentPages??[]),replayPages:copy(replayReceipt.replayPages),
      reportedInputSourceIds:{evaluation:evaluation?.inputSource.id??null,replay:replayReceipt.inputSource.id},
      historicalReceiptSourceIdsComparedBySemanticInventory:true,allOriginalRecordsActuallyReexecuted:true,
      globalVintageEvaluationActuallyReexecuted:evaluation!==null,replayedRecords:info.records,evaluatedRecords:counts?.records??0,
      newForecastsCreated:0,originalRecordsChanged:false,providerAuthenticity:false,productionPromoted:false,releaseAuthorized:false}};
}
