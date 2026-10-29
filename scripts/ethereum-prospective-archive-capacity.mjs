import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {ETH_PROSPECTIVE_PRICE_POLICY} from '../dist/ethereum-prospective-prices.js';
import {ethereumProspectiveArchiveSourceInfo,visitEthereumProspectiveArchiveRecords,visitEthereumProspectiveArchiveObservations} from './ethereum-prospective-archive-source.mjs';
import {projectEthereumProspectiveArchiveCapacityMetadata} from './ethereum-prospective-capacity-core.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY as REMOTE} from './ethereum-prospective-archive-remote.mjs';
import {ETH_PROSPECTIVE_PAGED_CALIBRATION_POLICY as CALIBRATION} from './ethereum-prospective-calibration-paged.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_ISSUER_POLICY as ISSUER} from './ethereum-prospective-archive-issuer.mjs';
import {readEthereumOperationFile,ethereumOperationSha as sha} from './ethereum-prospective-operation-io.mjs';

/** Report the real bounded source/transport headroom. Calendar assumptions stay
 * explicit and no hypothetical case is promoted to an issued or scored case. */
export async function buildEthereumArchiveCapacityReport({source,repositoryRoot,informationCutoffAt}={}){
  const info=ethereumProspectiveArchiveSourceInfo(source),records=[],observations=[],sourceFiles={},workflowSources=[];
  await visitEthereumProspectiveArchiveRecords(source,async record=>{
    const {id,kind,recordKind,modelKey,model,options,snapshotId,runKey,asOf,issuedAt}=record;
    records.push({id,kind,recordKind,modelKey,model:{version:model.version,sourceHash:model.sourceHash},options,snapshotId,runKey,asOf,issuedAt});
  });
  await visitEthereumProspectiveArchiveObservations(source,async snapshot=>{
    observations.push(snapshot.kind==='ethereum-prospective-input'?{id:snapshot.id,kind:snapshot.kind,informationCutoffAt:snapshot.informationCutoffAt}:
      {id:snapshot.id,kind:snapshot.kind,symbol:snapshot.symbol,sourceReceipt:{collectedAt:snapshot.sourceReceipt.collectedAt}});
  });
  async function read(path,maximumBytes){
    const bytes=await readEthereumOperationFile(repositoryRoot,path,{maximumBytes});sourceFiles[path]={bytes:bytes.length,sha256:sha(bytes)};
    const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))throw new Error('Capacity source must be lossless UTF-8');return text;
  }
  const baseText=await read(ETH_PROSPECTIVE_PRICE_POLICY.basePath,ETH_PROSPECTIVE_PRICE_POLICY.maximumBaseBytes);
  const workflowNames=(await readdir(resolve(repositoryRoot,'.github/workflows'))).filter(name=>/^[a-zA-Z0-9._-]+\.ya?ml$/.test(name)).sort();
  if(workflowNames.length>100)throw new Error('Too many workflow sources');
  for(const name of workflowNames){const path='.github/workflows/'+name;workflowSources.push({path,text:await read(path,256*1024)});}
  for(const path of ['scripts/ethereum-prospective-archive-capacity.mjs','scripts/ethereum-prospective-capacity-core.mjs',
    'scripts/ethereum-prospective-archive-operations.mjs','scripts/ethereum-prospective-archive-source.mjs',
    'scripts/ethereum-prospective-archive-issuer.mjs','scripts/ethereum-prospective-calibration-paged.mjs',
    'scripts/ethereum-prospective-handoff.mjs'])await read(path,512*1024);
  const reviewSource=await read('scripts/build-eth-review-evidence.mjs',512*1024);
  const reviewLimits=[...reviewSource.matchAll(/maximumBundleBytes:\s*([0-9]+)\b/g)];
  if(reviewLimits.length!==1||!Number.isSafeInteger(Number(reviewLimits[0][1]))||Number(reviewLimits[0][1])<1024)
    throw new Error('Candidate review source-book byte limit requires explicit inspection');
  const comparison=projectEthereumProspectiveArchiveCapacityMetadata({records,observations,baseText,informationCutoffAt,workflowSources});
  const archiveEntries=Object.entries(info.archiveFiles),allEntries=Object.entries(info.inputFiles);
  const archiveBytes=archiveEntries.reduce((sum,[,value])=>sum+value.bytes,0),physicalBytes=allEntries.reduce((sum,[,value])=>sum+value.bytes,0);
  const maximumBytes=2*1024*1024*1024,maximumFiles=40000,metadataReserve=2*1024*1024;
  const limits=[
    {stage:'complete-source-including-current-delta-and-aliases',files:allEntries.length,maximumFiles,bytes:physicalBytes,maximumBytes},
    {stage:'archive-filesystem',files:archiveEntries.length,maximumFiles,bytes:archiveBytes,maximumBytes},
    {stage:'remote-git-transport',files:archiveEntries.length,maximumFiles:REMOTE.maximumFiles,bytes:archiveBytes,maximumBytes:REMOTE.maximumArchiveBytes,
      maximumTreeEntries:REMOTE.maximumTreeEntries,maximumRequests:REMOTE.maximumRequests,requestTimeoutMs:REMOTE.requestTimeoutMs,
      totalTimeoutMs:REMOTE.totalTimeoutMs,maximumReceivedBytes:REMOTE.maximumReceivedBytes,
      productionRead:'One verified depth-one Git pack fetch; the full REST blob diagnostic has a separate per-blob request budget',
      publication:'Changed blob uploads plus bounded metadata requests; unchanged retained blobs are not reuploaded'},
    {stage:'deduplicated-daily-handoff',files:archiveEntries.length+2,maximumFiles,bytes:archiveBytes,
      maximumBytes,additionalFiles:2,additionalBytes:'actual original read receipt plus actual handoff manifest',conservativeMetadataReserve:metadataReserve},
    {stage:'archive-metadata',bytes:info.metadataBytes,maximumBytes:info.limits.maximumMetadataTotalBytes},
    {stage:'archive-pages',pages:info.archiveManifest.pages.length,maximumPages:info.limits.maximumPages},
    {stage:'archive-history',manifests:info.archiveSequence,maximumManifests:info.limits.maximumHistory},
    {stage:'calibration-report-batch',maximumReportBindings:CALIBRATION.maximumReportBindings,maximumTargetDates:CALIBRATION.maximumTargetDates,
      scope:'Oversized binding sets are rejected before allocation; each bounded explicit batch still validates the entire raw inventory'},
    {stage:'operation-receipts',maximumFileBytes:8*1024*1024,maximumRetainedReceiptBytes:ISSUER.maximumReceiptBytes,
      maximumEntriesPerPage:ISSUER.receiptPageSize,
      scope:'Individual readiness reports must also fit the single-file bound; accepted archive size alone does not guarantee every report fits'},
    {stage:'candidate-review-source-book',maximumBytes:Number(reviewLimits[0][1]),currentBytes:null,
      source:'scripts/build-eth-review-evidence.mjs',dailyPreservationDependency:false,
      scope:'Separate candidate-review evidence bound, below archive storage capacity. Actual source-book generation measures total framed bytes and may refuse a larger retained archive.'},
  ];
  const calendars=comparison.calendars.map(row=>({...row,
    conditionalOperationalBlockers:[...row.conditionalOperationalBlockers.filter(value=>value==='current-base-290-day-tail-limit'),
      'archive-byte-file-page-history-capacity-must-be-rechecked-for-every-append',
      'future-daily-capture-publication-and-selected-outcomes-not-yet-observed'],
    flatIndexProjectionScope:'Legacy comparison only; archive operations retain per-run bounded indexes and do not create this global flat index'}));
  const body={schemaVersion:1,kind:'ethereum-prospective-archive-capacity-report',policyVersion:'eth-prospective-archive-capacity-1',informationCutoffAt,
    sourceIdentityScope:'SHA-256 of actual local source bytes; a remote source commit is not inferred from this report',
    inputSource:{id:info.id,archiveManifestId:info.archiveManifestId,records:info.records,observations:info.observations,
      recordIds:info.recordIds,observationIds:info.observationIds},sourceFiles,inventory:comparison.inventory,
    calendars,unchangedCurrentBase:comparison.unchangedCurrentBase,workflowInspection:comparison.workflowInspection,
    effectiveLimits:limits,currentHeadroom:{sourceBytes:maximumBytes-physicalBytes,sourceFiles:maximumFiles-allEntries.length,
      archiveBytes:maximumBytes-archiveBytes,archiveFiles:maximumFiles-archiveEntries.length,
      remoteFiles:REMOTE.maximumFiles-archiveEntries.length,
      handoffBytesAfterConservativeMetadataReserve:maximumBytes-archiveBytes-metadataReserve,handoffFiles:maximumFiles-archiveEntries.length-2},
    legacyFlatteningComparison:{policy:comparison.policy,dailyContinuation:comparison.dailyContinuation,
      blockedByLegacyGlobalInventory:info.records>2000||info.observations>500||comparison.dailyContinuation.currentMergedCompactIndexBytes>1024*1024,
      scope:'Comparison only. Unchanged legacy flat readers still refuse these bounds; the explicit archive-backed path validates the whole paged inventory.'},
    rawInputInventoryVerified:true,wholePipelineConstantMemory:false,appendImplementation:'Finite complete byte maps; filesystem semantic consumers read one raw object at a time',
    futureCapacityDatePromised:false,firstTwelveActualDisjointCasesRequired:true,actualNewRecords:0,actualNewObservations:0,
    actualCalibrationFreezes:0,actualCalibratedRecordsIssued:0,triggerActivationVerified:false,remotePublicationPerformed:false,
    releaseAuthorized:false,productionPromoted:false,coverageGuarantee:false,
    remainingOperationalRequirements:['Activate a reviewed daily trigger only after authorization and verify actual publish/readback',
      'Review committed base replacement before the unchanged 290-day request boundary',
      'Recheck finite byte, file, page, history and handoff bounds for each append; none promises multi-year retention',
      'Collect the first twelve exact-bound nonoverlapping actual cases with all selected outcomes; no retrospective issuance or substitution'],
    limitation:'This report verifies currently retained bytes and deterministic calendar arithmetic. It does not prove historical provider authenticity, future collection, forecast skill, or continuous operation.'};
  return {id:await forecastHash(body),...body};
}
