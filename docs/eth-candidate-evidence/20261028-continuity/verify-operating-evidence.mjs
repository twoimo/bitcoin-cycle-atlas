import {readFile,writeFile,mkdir,readdir,lstat,copyFile,mkdtemp} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
// Scratch-only replay and evidence staging. No network or source edits.
if(process.argv.length!==3)throw new Error('Pass one absolute operating-evidence configuration JSON path');
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
const root=config.repositoryRoot??'/workspace/scratch/f88ec447ef8c/bitcoin-cycle-atlas';
const artifact=config.artifactRoot,stage=config.stage,sourceCommit=config.expectedSourceCommit,sourceTree=config.expectedSourceTree,runId=config.expectedRunId;
if(!['first-run','second-run'].includes(stage)||![root,artifact,config.output,config.artifactVerification].every(path=>typeof path==='string'&&isAbsolute(path)))throw new Error('Absolute paths and first-run or second-run stage required');
if(!resolve(config.output).startsWith('/tmp/')||!/^[a-f0-9]{40}$/.test(sourceCommit)||!/^[a-f0-9]{40}$/.test(sourceTree)||!/^\d+$/.test(runId))throw new Error('Exact source/tree/run identities and /tmp output required');
if(config.publishedDataCommit!==null&&config.publishedDataCommit!==undefined&&!/^[a-f0-9]{40}$/.test(config.publishedDataCommit))throw new Error('Exact published data commit or null required');
const destination='docs/eth-candidate-evidence/20261028-continuity/'+stage;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const load=async path=>JSON.parse(await readFile(path,'utf8'));
const manifest=await load(resolve(artifact,'eth-review-packet/source-manifest.json'));
assert.equal(manifest.sourceCommit,sourceCommit);assert.equal(manifest.sourceTree,sourceTree);
const sourceEntries=new Map(manifest.entries.map(entry=>[entry.path,entry]));
const sourceFiles={};
async function checkSource(path){
  if(sourceFiles[path])return;
  const bytes=await readFile(resolve(root,path)),expected=sourceEntries.get(path);
  assert.ok(expected,'Replayer source is outside bound source scope: '+path);
  assert.equal(expected.sha256,sha(bytes));assert.equal(expected.bytes,bytes.length);
  if(expected.gitBlob)assert.equal(expected.gitBlob,git(bytes));
  sourceFiles[path]={bytes:bytes.length,sha256:sha(bytes),gitBlobSha:git(bytes)};
  for(const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
    const child=relative(root,resolve(dirname(resolve(root,path)),match[1].split('?')[0])).replaceAll('\\','/');
    assert.ok(!child.startsWith('..')&&!isAbsolute(child));await checkSource(child);
  }
}
for(const path of ['scripts/ethereum-staking-cohort-core.mjs','scripts/ethereum-supply-accounting-core.mjs',
  'scripts/ethereum-supply-resolution-core.mjs','scripts/analyze-ethereum-supply-resolution.mjs','scripts/build-eth-review-packet.mjs'])await checkSource(path);
const {validateEthReviewSource}=await import(pathToFileURL(resolve(root,'scripts/build-eth-review-packet.mjs')));
const framed=validateEthReviewSource({manifest,sourceBook:await readFile(resolve(artifact,'eth-review-packet/source-book.txt'))}).sources;
const {replayEthereumStakingCohortCapture}=await import(pathToFileURL(resolve(root,'scripts/ethereum-staking-cohort-core.mjs')));
const {auditEthereumSupplyAccounting}=await import(pathToFileURL(resolve(root,'scripts/ethereum-supply-accounting-core.mjs')));
const {buildEthereumSupplyResolutionReport}=await import(pathToFileURL(resolve(root,'scripts/analyze-ethereum-supply-resolution.mjs')));
const cohort=await load(resolve(artifact,'ethereum-staking-cohort/receipt.json'));
assert.equal(cohort.sourceCommit,sourceCommit);assert.equal(cohort.sourceTree,sourceTree);
const cohortRaw=await Promise.all(cohort.rawFiles.map(async file=>({path:file.path,bytes:await readFile(resolve(artifact,'ethereum-staking-cohort',file.path))})));
const cohortReplay=replayEthereumStakingCohortCapture({receipt:cohort,rawFiles:cohortRaw});
assert.deepEqual(cohortReplay,await load(resolve(artifact,'ethereum-staking-cohort/replay.json')));
const supplyDirectories=(await readdir(resolve(artifact,'ethereum-supply-accounting'),{withFileTypes:true})).filter(entry=>entry.isDirectory()&&/^capture-[A-Za-z0-9_-]+$/.test(entry.name));
assert.equal(supplyDirectories.length,1,'Exactly one current supply capture is expected');
const supplyPath='ethereum-supply-accounting/'+supplyDirectories[0].name;
const supply=await load(resolve(artifact,supplyPath,'receipt.json'));
assert.equal(supply.sourceCommit,sourceCommit);assert.equal(supply.sourceTree,sourceTree);assert.equal(supply.runId,runId);
const rawChecks=[];
for(const file of supply.rawFiles){
  const bytes=await readFile(resolve(artifact,supplyPath,file.file));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);
  const request=supply.network.filter(request=>request.url===file.url);assert.equal(request.length,1);
  assert.equal(request[0].httpStatus,200);assert.equal(request[0].receivedBytes,bytes.length);assert.equal(request[0].sha256,sha(bytes));
  if(request[0].responseHeaders['x-supply-sha256'])assert.equal(request[0].responseHeaders['x-supply-sha256'],sha(bytes));
  rawChecks.push({path:supplyPath+'/'+file.file,bytes:bytes.length,sha256:sha(bytes),gitBlobSha:git(bytes),receiptAndRequestMatched:true,
    providerDigestMatched:request[0].responseHeaders['x-supply-sha256']!==null,independentProviderAuthenticity:false});
}
const history=await load(resolve(artifact,supplyPath,'history-30d.raw.json'));
const observation=auditEthereumSupplyAccounting(history,{collectedAt:supply.collectedAt,observedThrough:supply.observation.utcWindow.observedThrough});
assert.deepEqual(observation,supply.observation);assert.deepEqual(observation,await load(resolve(artifact,supplyPath,'observation.json')));
const resolution=await load(resolve(artifact,'ethereum-supply-resolution.json'));
assert.equal(resolution.provenance.sourceCommit,sourceCommit);assert.equal(resolution.provenance.sourceTree,sourceTree);
const mirror=await mkdtemp('/tmp/eth-continuity-supply-mirror-');
const older='docs/eth-candidate-evidence/20261027-vintages-calibration/final-run/ethereum-supply-accounting/capture-0kqcvW';
for(const [directory,from]of [['build/'+supplyPath,resolve(artifact,supplyPath)],[older,resolve(root,older)]]){
  await mkdir(resolve(mirror,directory),{recursive:true});
  for(const name of ['receipt.json','history-30d.raw.json']){
    const data=directory===older?framed.get(directory+'/'+name)?.body:await readFile(resolve(from,name));assert.ok(data);
    if(directory===older){const entry=sourceEntries.get(directory+'/'+name);assert.ok(entry);assert.equal(entry.bytes,data.length);assert.equal(entry.sha256,sha(data));}
    await writeFile(resolve(mirror,directory,name),data);
  }
}
const resolutionReplay=await buildEthereumSupplyResolutionReport({repositoryRoot:mirror,informationCutoffAt:resolution.report.informationCutoffAt});
assert.deepEqual(resolutionReplay,resolution.report);
const selected=[];
for(const directory of ['ethereum-staking-cohort','ethereum-supply-accounting']){
  async function visit(path){
    for(const entry of await readdir(resolve(artifact,path),{withFileTypes:true})){
      const child=path+'/'+entry.name;if(entry.isDirectory())await visit(child);else{assert.ok(entry.isFile());selected.push(child);}
    }
  }
  await visit(directory);
}
selected.push('ethereum-supply-resolution.json','ethereum-prospective-capacity.json','ethereum-prospective-calibration-readiness.json',
  'ethereum-model-readiness.json','eth-browser/report.json','eth-review-packet/source-manifest.json',
  'ethereum-prospective-archive-remote-receipt.json','ethereum-prospective-archive-restore.json',
  'ethereum-prospective-archive-append.json','ethereum-prospective-archive-verify.json');
const mappings=[];
for(const artifactPath of selected.sort()){
  const input=resolve(artifact,artifactPath),info=await lstat(input);assert.ok(info.isFile()&&!info.isSymbolicLink());
  const bytes=await readFile(input),entry=sourceEntries.get('build/'+artifactPath);
  if(artifactPath!=='eth-review-packet/source-manifest.json'){
    assert.ok(entry,'No framed execution entry for selected artifact '+artifactPath);assert.equal(entry.kind,'provided-execution-evidence');
    assert.equal(entry.bytes,bytes.length);assert.equal(entry.sha256,sha(bytes));
  }
  const repositoryPath=destination+'/'+artifactPath,output=resolve(root,repositoryPath);await mkdir(dirname(output),{recursive:true});
  try{await writeFile(output,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await readFile(output),bytes);}
  assert.deepEqual(await readFile(output),bytes);
  mappings.push({artifactPath,repositoryPath,bytes:bytes.length,sha256:sha(bytes),gitBlobSha:git(bytes),
    sourceManifestPayloadMatched:!!entry,manifestSelfReferenceExcluded:!entry,copiedBytesMatched:true});
}
const models=await load(resolve(artifact,'ethereum-model-readiness.json'));
const readiness=(await load(resolve(artifact,'ethereum-prospective-calibration-readiness.json'))).report;
const capacity=await load(resolve(artifact,'ethereum-prospective-capacity.json'));
const verification=await load(config.artifactVerification);
assert.equal(verification.status,'verified');assert.equal(verification.source.sourceCommit,sourceCommit);assert.equal(verification.source.sourceTree,sourceTree);
const currentDiagnostic=resolution.report.captures.find(value=>value.path==='build/'+supplyPath).diagnostic;
const report={schemaVersion:1,kind:'ethereum-continuity-operating-evidence-staging',stage,status:'verified-and-staged',
  checkedAt:new Date().toISOString(),source:{sourceCommit,sourceTree:manifest.sourceTree,runId},
  artifactRoot:artifact,destination,files:mappings.length,totalBytes:mappings.reduce((sum,value)=>sum+value.bytes,0),mappings,
  semanticReplay:{staking:'exact-match-to-retained-replay-and-observation',supplyAccounting:'exact-match-to-retained-observation-and-receipt',
    supplyResolution:'entire-two-capture-report-reproduced-exactly',networkRequests:0,localSourceFilesBoundToArtifactManifest:sourceFiles},
  rawChecks:[...cohortRaw.map(file=>({path:'ethereum-staking-cohort/'+file.path,bytes:file.bytes.length,sha256:sha(file.bytes),gitBlobSha:git(file.bytes),
    receiptAndRequestMatched:true,independentProviderAuthenticity:false})),...rawChecks],
  summary:{
    staking:{captureStartedAt:cohort.captureStartedAt,collectedAt:cohort.observation.collectedAt,network:cohort.network,
      state:cohort.observation.state,totals:cohort.observation.totals,
      validators:cohort.observation.validators.map(({index,status,actualBalanceEth,effectiveBalanceEth})=>({index,status,actualBalanceEth,effectiveBalanceEth})),
      earnedReturn:cohort.observation.earnedReturn,timeWeightedRewardEligiblePrincipal:cohort.observation.timeWeightedRewardEligiblePrincipal,
      completedExitWait:cohort.observation.completedExitWait,fullUtcWindowObserved:false,
      requiredBeforeEconomicUse:cohort.observation.requiredBeforeEconomicUse,eligibleModelSnapshotCount:0},
    supply:{capture:supplyPath,collectedAt:supply.collectedAt,providerGeneratedAt:observation.providerGeneratedAt,
      providerRevision:observation.providerRevision,intervalSlots:observation.intervalSlots,rows:observation.series.slots.rows,
      adjacentPairsChecked:observation.series.slots.endpointArithmetic.adjacentPairsChecked,
      mismatchedPairs:observation.series.slots.endpointArithmetic.mismatchedPairs,
      reportedEndpointDecomposition:observation.series.slots.endpointArithmetic.endpointDecomposition,
      requestedUtcWindow:observation.utcWindow,observedGrid:currentDiagnostic.observedGrid,utcAlignment:currentDiagnostic.utcAlignment,
      exactStockBoundaries:{start:currentDiagnostic.requestedWindow.startBoundary,end:currentDiagnostic.requestedWindow.endBoundary},
      allResolutionCaptures:{diagnosed:resolution.report.diagnosedCaptures,invalid:resolution.report.invalidSourceCaptures,
        unavailable:resolution.report.unavailableCaptures,conditionalGridMismatches:resolution.report.sameGridConditionalIncompatibilityCount},
      independentCanonicalValidation:false,eligibleModelSnapshotCount:0},
    economics:{requiredMetricCount:models.economics.requiredMetricCount,providedSnapshots:models.economics.providedSnapshots,
      eligibleFullSnapshots:models.economics.eligibleFullSnapshots,active:models.economics.active,inputInspection:models.economics.inputInspection,
      relatedEvidenceSummary:models.economics.metricEvidence.summary,remaining:models.economics.remaining},
    calibration:{preservedRecords:readiness.preservedRecords,uniqueOrigins:readiness.uniqueOrigins,observations:readiness.preservedObservationIds.length,
      bindings:readiness.results.map(value=>({modelKey:value.binding.modelKey,horizonDays:value.binding.horizonDays,status:value.status,
        selectedCalibrationCases:value.selectedCalibrationCases,validSelectedOutcomes:value.validSelectedOutcomes,logRadius:value.logRadius})),
      actualFreezesCreated:readiness.actualFreezesCreated,actualCalibratedRecordsIssued:readiness.actualCalibratedRecordsIssued,
      prospectiveCalibratedTargetsScored:readiness.prospectiveCalibratedTargetsScored},
    capacity:{id:capacity.id,informationCutoffAt:capacity.informationCutoffAt,inventory:capacity.diagnostic.inventory,
      unchangedCurrentBase:capacity.diagnostic.unchangedCurrentBase,remainingOperationalRequirements:capacity.diagnostic.remainingOperationalRequirements},
    artifactSourceScope:verification.source,browserVerification:verification.browser,release:models.release,
  },
  permanentRetentionScope:{selectedArtifactFilesOnly:true,completeArtifactRetained:false,fullSourceBookCopied:false,pngFilesCopied:false,
    archiveAndLedgerCopied:false,archiveAndLedgerPreviouslyPublishedDataCommit:config.publishedDataCommit??null,
    dataCommitSuppliedByParentNotIndependentlyFetchedThisStep:config.publishedDataCommit!=null,publicationOfStagedDocsPerformed:false},
  limitations:['Raw-byte and model-consistency replay does not independently authenticate provider membership, finality, publication history or economic completeness.',
    'Endpoint supply arithmetic uses retained provider buckets. It is not a substitute for exact UTC-window boundary stocks and flows.',
    'A validator balance change is not measured staking earned return. Deposits, withdrawals, consolidations, costs and reward-eligible principal remain separate requirements.',
    'Only the selected twenty files are staged. The complete artifact, source-book and PNG payloads are not permanently retained by this operation.']};
await writeFile(config.output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,files:report.files,totalBytes:report.totalBytes,
  semanticReplay:{staking:report.semanticReplay.staking,supplyAccounting:report.semanticReplay.supplyAccounting,supplyResolution:report.semanticReplay.supplyResolution},
  stakingBalanceEth:report.summary.staking.totals.actualBalanceEth,effectiveBalanceEth:report.summary.staking.totals.effectiveBalanceEth,
  supplyGrid:report.summary.supply.observedGrid,eligibleFullSnapshots:report.summary.economics.eligibleFullSnapshots,
  output:config.output}));
