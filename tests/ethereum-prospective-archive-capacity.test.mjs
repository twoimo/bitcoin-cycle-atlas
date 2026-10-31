import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {createAssetOutcomeSnapshot} from '../dist/asset-outcome-records.js';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';
import {buildEthereumProspectiveArchive,restoreEthereumProspectiveArchive} from '../scripts/ethereum-prospective-archive-core.mjs';
import {openEthereumProspectiveArchiveSource,ethereumProspectiveArchiveSourceInfo} from '../scripts/ethereum-prospective-archive-source.mjs';
import {projectEthereumProspectiveCapacity,projectEthereumProspectiveArchiveCapacityMetadata,
  inspectEthereumProspectiveWorkflow} from '../scripts/ethereum-prospective-capacity-core.mjs';
import {buildEthereumArchiveCapacityReport} from '../scripts/ethereum-prospective-archive-capacity.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY as REMOTE} from '../scripts/ethereum-prospective-archive-remote.mjs';
import {ETH_PROSPECTIVE_PAGED_CALIBRATION_POLICY as CALIBRATION} from '../scripts/ethereum-prospective-calibration-paged.mjs';

// All generated prices, acquisition clocks, source identities and record graphs
// below are SYNTHETIC CONTRACT FIXTURES. They do not establish market accuracy,
// historical acquisition, source-graph replay, or an actually activated trigger.
const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let repositoryRoot;
const cutoff='2026-10-29T12:00:00.000Z',encode=value=>Buffer.from(canonicalForecastJson(value)+'\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
const sourceIdentity={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:'1234'};
const dailyWorkflow={path:'.github/workflows/synthetic-daily.yml',text:'on:\n  schedule:\n    - cron: "0 0 * * *"\n  workflow_dispatch:\njobs:\n  prepare:\n    steps:\n      - run: node scripts/ethereum-prospective-archive-operations.mjs issue\n'};
const raw=JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',dailyHistory:{
  source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,candles:[
    {date:'2024-01-01T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
    {date:'2024-01-02T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
  ]}});
let fixture,root,archive,source,summary,capacity,outcomes;
async function write(root,files,path='archive'){
  for(const [name,bytes]of files){const file=join(root,path,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
}
function metadata(overrides={}){
  return {records:[fixture.record],observations:[fixture.snapshot],baseText:fixture.base.text,
    informationCutoffAt:cutoff,workflowSources:[dailyWorkflow],...overrides};
}
before(async()=>{
  fixture=await prospectiveFixture();root=await mkdtemp(join(tmpdir(),'eth-archive-capacity-'));outcomes=[];
  const files=new Map([['records/'+fixture.record.id+'.json',encode(fixture.record)],
    ['snapshots/'+fixture.snapshot.id+'.json',encode(fixture.snapshot)]]);
  for(let index=0;index<501;index++){
    const snapshot=await createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument:raw,
      sourceUrl:'https://example.invalid/synthetic-capacity-only',
      collectedAt:new Date(Date.parse(cutoff)-(502-index)*1000).toISOString()});
    outcomes.push(snapshot);files.set('outcome-observations/'+snapshot.id+'.json',encode(snapshot));
  }
  archive=await buildEthereumProspectiveArchive({files,source:sourceIdentity,createdAt:cutoff});
  await write(root,archive.files);source=await openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath:'archive'});
  summary=ethereumProspectiveArchiveSourceInfo(source);
  repositoryRoot=join(root,'capacity-source');
  await cp(resolve(sourceRoot,'scripts'),join(repositoryRoot,'scripts'),{recursive:true});
  await cp(resolve(sourceRoot,'.github/workflows'),join(repositoryRoot,'.github/workflows'),{recursive:true});
  await mkdir(join(repositoryRoot,'dist/data'),{recursive:true});
  await writeFile(join(repositoryRoot,'dist/data/eth-ohlc.json'),await frozenMarketText('eth-ohlc'));
  capacity=await buildEthereumArchiveCapacityReport({source,repositoryRoot,informationCutoffAt:cutoff});
});
after(async()=>{if(root)await rm(root,{recursive:true,force:true});});

test('archive metadata arithmetic is exactly the legacy projection within original bounds',()=>{
  const independent=outcomes.slice(0,2),different={...structuredClone(fixture.record),id:'c'.repeat(64),runKey:'d'.repeat(64),
    model:{...fixture.record.model,sourceHash:'e'.repeat(64)}};
  for(const input of [metadata(),metadata({observations:[fixture.snapshot,...independent]}),
    metadata({records:[fixture.record,different]}),metadata({informationCutoffAt:'2028-05-04T12:00:00.000Z'})]){
    const legacy=projectEthereumProspectiveCapacity(input),paged=projectEthereumProspectiveArchiveCapacityMetadata(input);
    assert.deepEqual(paged,legacy);
    assert.equal(paged.metadataAuthenticatedByProjection,false);assert.equal(paged.actualRawInputReadinessProven,false);
    assert.equal(paged.calibrationReadinessClaimed,false);assert.equal(paged.limitsChanged,false);
  }
});

test('metadata above the legacy observation bound has zero remaining flat days and cannot claim raw authentication',()=>{
  const input=metadata({observations:outcomes});
  assert.throws(()=>projectEthereumProspectiveCapacity(input),/Unique bounded observation metadata/);
  const diagnostic=projectEthereumProspectiveArchiveCapacityMetadata(input);
  assert.equal(diagnostic.inventory.observations,501);assert.equal(diagnostic.policy.maximumObservations,500);
  assert.equal(diagnostic.actualRawInputReadinessProven,false);assert.equal(diagnostic.metadataAuthenticatedByProjection,false);
  for(const scenario of diagnostic.dailyContinuation.observationScenarios){
    assert.equal(scenario.completeAdditionalCaptureDaysWithinLimit,0);
    assert.equal(scenario.firstExceedingCaptureDate,scenario.firstAdditionalCaptureDate);
  }
});

test('the capacity adapter accepts all 501 raw observations only through an opaque verified source',async()=>{
  assert.equal(summary.observations,501);assert.equal(summary.records,1);
  assert.equal(capacity.inputSource.id,summary.id);assert.equal(capacity.inputSource.archiveManifestId,archive.manifest.id);
  assert.deepEqual(capacity.inputSource.observationIds,outcomes.map(value=>value.id).sort());
  assert.deepEqual(capacity.inventory.observationIds,summary.observationIds);
  assert.equal(capacity.inventory.observations,501);assert.equal(capacity.inventory.independentOutcomeAcquisitions,501);
  assert.equal(capacity.inventory.prospectiveAcquisitions,0);assert.equal(capacity.rawInputInventoryVerified,true);
  assert.equal(capacity.legacyFlatteningComparison.blockedByLegacyGlobalInventory,true);
  assert.equal(capacity.legacyFlatteningComparison.policy.maximumObservations,500);
  await assert.rejects(()=>restoreEthereumProspectiveArchive(archive),/unchanged active observation limit/);
  for(const forged of [{},summary,JSON.parse(JSON.stringify(source)),Object.create(source),new Proxy(source,{})])
    await assert.rejects(()=>buildEthereumArchiveCapacityReport({source:forged,repositoryRoot,informationCutoffAt:cutoff,
      records:[fixture.record],observations:outcomes,verified:true}),/opaque verified archive source/);
  const {id,...body}=capacity;assert.equal(id,await forecastHash(body));
});

test('source and finite transport headroom count actual bytes without doubling the deduplicated handoff',()=>{
  const archiveFiles=Object.entries(summary.archiveFiles),allFiles=Object.entries(summary.inputFiles),
    archiveBytes=archiveFiles.reduce((sum,[,value])=>sum+value.bytes,0),physicalBytes=allFiles.reduce((sum,[,value])=>sum+value.bytes,0);
  const stages=new Map(capacity.effectiveLimits.map(row=>[row.stage,row])),sourceLimit=stages.get('complete-source-including-current-delta-and-aliases'),
    filesystem=stages.get('archive-filesystem'),handoff=stages.get('deduplicated-daily-handoff');
  assert.equal(sourceLimit.files,allFiles.length);assert.equal(sourceLimit.bytes,physicalBytes);
  assert.equal(sourceLimit.maximumFiles,40000);assert.equal(sourceLimit.maximumBytes,2*1024*1024*1024);
  assert.equal(filesystem.files,archiveFiles.length);assert.equal(filesystem.bytes,archiveBytes);
  assert.equal(handoff.files,archiveFiles.length+2);assert.equal(handoff.bytes,archiveBytes);assert.equal(handoff.additionalFiles,2);
  assert.match(handoff.additionalBytes,/actual original read receipt.*actual handoff manifest/);
  assert.equal(capacity.currentHeadroom.sourceBytes,sourceLimit.maximumBytes-physicalBytes);
  assert.equal(capacity.currentHeadroom.archiveBytes,filesystem.maximumBytes-archiveBytes);
  assert.equal(capacity.currentHeadroom.handoffBytesAfterConservativeMetadataReserve,
    handoff.maximumBytes-archiveBytes-handoff.conservativeMetadataReserve);
  assert.equal(capacity.currentHeadroom.handoffFiles,40000-archiveFiles.length-2);
});

test('remote publication reports the actual 37,121-file bound and separates Git-pack reads from REST request budgets',()=>{
  const remote=capacity.effectiveLimits.find(row=>row.stage==='remote-git-transport');
  assert.equal(remote.maximumFiles,37121);assert.equal(remote.maximumFiles,REMOTE.maximumFiles);
  assert.equal(remote.maximumTreeEntries,37124);assert.equal(remote.maximumRequests,4096);
  assert.equal(remote.maximumRequests,REMOTE.maximumRequests);assert.equal(remote.maximumReceivedBytes,REMOTE.maximumReceivedBytes);
  assert.equal(remote.requestTimeoutMs,REMOTE.requestTimeoutMs);assert.equal(remote.totalTimeoutMs,REMOTE.totalTimeoutMs);
  assert.equal(remote.maximumBytes,2*1024*1024*1024);
  assert.equal(capacity.currentHeadroom.remoteFiles,37121-Object.keys(summary.archiveFiles).length);
  assert.match(remote.productionRead,/depth-one Git pack fetch/);assert.match(remote.productionRead,/REST blob diagnostic.*per-blob request budget/);
  assert.match(remote.publication,/Changed blob uploads/);assert.match(remote.publication,/unchanged retained blobs are not reuploaded/);
  assert.equal(REMOTE.forceUpdates,false);assert.equal(capacity.remotePublicationPerformed,false);
});

test('manifest, page, metadata and calibration consumer bounds stay explicit after the flat bottleneck is removed',()=>{
  const stages=new Map(capacity.effectiveLimits.map(row=>[row.stage,row]));
  assert.equal(stages.get('archive-history').manifests,summary.archiveSequence);
  assert.equal(stages.get('archive-history').maximumManifests,4096);
  assert.equal(stages.get('archive-pages').pages,archive.manifest.pages.length);
  assert.equal(stages.get('archive-pages').maximumPages,4096);
  assert.equal(stages.get('archive-metadata').bytes,summary.metadataBytes);
  assert.equal(stages.get('archive-metadata').maximumBytes,64*1024*1024);
  const calibration=stages.get('calibration-report-batch');
  assert.equal(calibration.maximumReportBindings,256);assert.equal(calibration.maximumReportBindings,CALIBRATION.maximumReportBindings);
  assert.equal(calibration.maximumTargetDates,100000);assert.equal(calibration.maximumTargetDates,CALIBRATION.maximumTargetDates);
  assert.equal(capacity.wholePipelineConstantMemory,false);assert.match(capacity.appendImplementation,/Finite complete byte maps/);
  assert.equal(capacity.futureCapacityDatePromised,false);assert.equal(capacity.firstTwelveActualDisjointCasesRequired,true);
  assert.equal(capacity.unchangedCurrentBase.automaticBaseRolloverImplemented,false);
  assert.equal(capacity.unchangedCurrentBase.boundaryPlannerChecksPassed,true);
  for(const calendar of capacity.calendars){
    assert.equal(calendar.windows.length,12);assert.equal(calendar.actualDisjointWindowsInFirstTwelve,1);
    assert.equal(calendar.hypotheticalFutureWindows,11);assert.equal(calendar.forecastOrOutcomeAvailabilityPromised,false);
    assert.equal(calendar.conditionalOperationalBlockers.some(value=>/records-2000|observations-500|candidate-index-1MiB/.test(value)),false);
    assert.ok(calendar.conditionalOperationalBlockers.includes('archive-byte-file-page-history-capacity-must-be-rechecked-for-every-append'));
  }
});

test('workflow inspection recognizes the new issue command and does not mistake replay or archive writes for issuance',async()=>{
  const checked=inspectEthereumProspectiveWorkflow(dailyWorkflow);
  assert.equal(checked.directIssuance,true);assert.equal(checked.scheduledDirectIssuance,true);assert.equal(checked.dispatchDirectIssuance,true);
  assert.equal(checked.automaticPriorRunRestoreProven,false);
  for(const command of ['restore','replay','readiness','capacity','append','verify','issue-extra']){
    const value=inspectEthereumProspectiveWorkflow({...dailyWorkflow,text:dailyWorkflow.text.replace(/\.mjs issue\n/,'.mjs '+command+'\n')});
    assert.equal(value.directIssuance,false,command);assert.equal(value.scheduledDirectIssuance,false,command);
  }
  const path='.github/workflows/eth-prospective-daily.yml',actual=inspectEthereumProspectiveWorkflow({path,text:await readFile(resolve(repositoryRoot,path),'utf8')});
  assert.equal(actual.directIssuance,true);assert.deepEqual(actual.events,['schedule','workflow_dispatch']);
  const inspected=capacity.workflowInspection.sources.find(value=>value.path===path);
  assert.deepEqual(inspected,actual);assert.equal(capacity.workflowInspection.knownScheduledDirectIssuer,true);
  assert.equal(capacity.workflowInspection.triggerActivationVerified,false);assert.equal(capacity.triggerActivationVerified,false);
});

test('capacity evidence binds its source files and never relabels a storage projection as new forecasts or calibration',async()=>{
  for(const path of ['scripts/ethereum-prospective-calibration-paged.mjs','scripts/ethereum-prospective-archive-capacity.mjs',
    'scripts/ethereum-prospective-archive-issuer.mjs','scripts/ethereum-prospective-handoff.mjs']){
    const bytes=await readFile(resolve(repositoryRoot,path));assert.deepEqual(capacity.sourceFiles[path],{bytes:bytes.length,sha256:sha(bytes)});
  }
  for(const field of ['actualNewRecords','actualNewObservations','actualCalibrationFreezes','actualCalibratedRecordsIssued'])assert.equal(capacity[field],0);
  for(const field of ['releaseAuthorized','productionPromoted','coverageGuarantee','remotePublicationPerformed','triggerActivationVerified'])assert.equal(capacity[field],false);
  assert.match(capacity.limitation,/does not prove historical provider authenticity, future collection, forecast skill, or continuous operation/);
});

test('an earlier opaque verification cannot authenticate changed raw capacity evidence',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'eth-capacity-changed-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const value=await buildEthereumProspectiveArchive({files:new Map([['outcome-observations/'+outcomes[0].id+'.json',encode(outcomes[0])]]),
    source:sourceIdentity,createdAt:cutoff});
  await write(directory,value.files);const opened=await openEthereumProspectiveArchiveSource({repositoryRoot:directory,archivePath:'archive'});
  const descriptor=ethereumProspectiveArchiveSourceInfo(opened).logicalDescriptors[0],path=join(directory,'archive',descriptor.objectPath),bytes=await readFile(path);
  const changed=Buffer.from(bytes);changed[changed.indexOf(Buffer.from('Coinbase'))]=88;await writeFile(path,changed);
  assert.equal(changed.length,bytes.length);
  await assert.rejects(()=>buildEthereumArchiveCapacityReport({source:opened,repositoryRoot,informationCutoffAt:cutoff}),/raw-byte|Git-blob|changed/);
});
