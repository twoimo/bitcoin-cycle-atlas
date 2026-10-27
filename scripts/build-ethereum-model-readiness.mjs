import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {assessEthereumEconomicFeasibility,ETH_ECONOMIC_VERSION,ETH_ECONOMIC_INPUT_SCHEMA} from '../dist/ethereum-economic-model.js';
import {auditEthereumSupplyAccounting} from './ethereum-supply-accounting-core.mjs';
import {verifyEthereumProspectiveRecord,ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
const root=fileURLToPath(new URL('..',import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}'),sources={};
async function read(path,optional=false){
  try{const text=await readFile(resolve(root,path),'utf8');sources[path]=sha(text);return JSON.parse(text);}
  catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}
const comparison=await read('build/ethereum-model-comparison.json'),stability=await read('build/ethereum-monte-carlo-stability.json');
const intervalControls=await read('build/ethereum-interval-controls.json'),warmStart=await read('build/ethereum-warm-start.json');
const sourceTiming=await read('build/ethereum-source-timing.json');
const commonCohort=await read('build/ethereum-common-cohort.json'),economicCoverage=await read('build/ethereum-economic-evidence-coverage.json');
const independentCalibration=await read('build/ethereum-independent-calibration.json');
const economicVintages=await read('build/ethereum-economic-vintages/receipt.json'),economicVintageReplay=await read('build/ethereum-economic-vintages/replay.json');
assert.equal(independentCalibration.provenance.sourceCommit,sourceCommit);assert.equal(independentCalibration.provenance.sourceTree,sourceTree);
assert.equal(independentCalibration.provenance.comparisonSha256,sources['build/ethereum-model-comparison.json']);
assert.equal(independentCalibration.provenance.warmStartSha256,sources['build/ethereum-warm-start.json']);
assert.equal(independentCalibration.provenance.inputSha256['dist/data/eth-ohlc.json'],comparison.provenance.inputSha256['dist/data/eth-ohlc.json']);
assert(!independentCalibration.results.some(row=>row.status==='incomplete'));
for(const report of [economicVintages,economicVintageReplay]){
  assert.equal(report.sourceCommit,sourceCommit);assert.equal(report.sourceTree,sourceTree);assert.equal(report.sourceIdentityStatus,'verified-checkout');
  assert.equal(report.networkRequests,0);assert.equal(report.fullModelSnapshotReady,false);assert.equal(report.modelInputActivated,false);
}
assert.equal(economicVintageReplay.recordCount,economicVintages.recordCount);assert.equal(economicVintageReplay.newCaptureCount,0);
assert.equal(economicVintages.metricDefinitionVersion,ETH_ECONOMIC_INPUT_SCHEMA.snapshot.metricDefinitionVersion);
const supplyAudits=[];
const supplyDirectories=(await readdir(resolve(root,'build/ethereum-supply-accounting'),{withFileTypes:true})).filter(e=>e.isDirectory()&&/^capture-[A-Za-z0-9_-]+$/.test(e.name));
assert(supplyDirectories.length>0&&supplyDirectories.length<=10,'Bounded actual supply capture receipts required');
for(const entry of supplyDirectories){
  const directory='build/ethereum-supply-accounting/'+entry.name,receipt=await read(directory+'/receipt.json');
  assert.equal(receipt.sourceCommit,sourceCommit);assert.equal(receipt.sourceTree,sourceTree);
  for(const [path,hash]of Object.entries(receipt.sourceHashes))assert.equal(sha(await readFile(resolve(root,path))),hash,'Supply source changed: '+path);
  let history=null;
  for(const file of receipt.rawFiles){
    assert(/^[A-Za-z0-9_.-]+$/.test(file.file),'Invalid supply raw file name');
    const path=directory+'/'+file.file,bytes=await readFile(resolve(root,path));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);sources[path]=file.sha256;
    if(file.file==='history-30d.raw.json'&&receipt.status==='provider-accounting-audited')history=JSON.parse(bytes);
  }
  if(receipt.status==='provider-accounting-audited'){
    assert(history,'A successful supply audit needs original history bytes');
    assert.deepEqual(auditEthereumSupplyAccounting(history,{collectedAt:receipt.collectedAt,observedThrough:receipt.observation.utcWindow.observedThrough}),receipt.observation,'Supply arithmetic does not replay');
  }
  supplyAudits.push({status:receipt.status,error:receipt.error??null,sourceCommit:receipt.sourceCommit,collectedAt:receipt.collectedAt??null,
    receiptPath:directory+'/receipt.json',receiptSha256:sources[directory+'/receipt.json'],rawFiles:receipt.rawFiles,
    definitionFinding:receipt.observation?.definitionFinding??null,series:receipt.observation?.series??null,
    utcWindow:receipt.observation?.utcWindow??null,independentCanonicalValidation:false,modelInputActivated:false});
}
assert.equal(intervalControls.provenance.sourceCommit,sourceCommit);assert.equal(warmStart.provenance.sourceCommit,sourceCommit);
assert.equal(commonCohort.provenance.sourceCommit,sourceCommit);assert.equal(commonCohort.provenance.sourceTree,sourceTree);
assert.equal(commonCohort.provenance.comparisonSha256,sources['build/ethereum-model-comparison.json']);
assert.equal(commonCohort.provenance.warmStartSha256,sources['build/ethereum-warm-start.json']);
assert.deepEqual(commonCohort.provenance.inputSha256,{'dist/data/eth-ohlc.json':comparison.provenance.inputSha256['dist/data/eth-ohlc.json']});
assert.equal(commonCohort.result.status,'complete');
assert.equal(economicCoverage.sourceCommit,sourceCommit);assert.equal(economicCoverage.sourceTree,sourceTree);
assert.equal(economicCoverage.sourceIdentityStatus,'verified-checkout');
for(const [path,hash]of Object.entries(economicCoverage.provenance.inputSha256))assert.equal(sha(await readFile(resolve(root,path))),hash,'Economic evidence input changed: '+path);
assert.equal(economicCoverage.fullModelSnapshotReady,false);assert.equal(economicCoverage.modelInputActivated,false);
const receipt=await read('build/ethereum-prospective-ledger/receipt.json'),index=await read('build/ethereum-prospective-ledger/index.json',true);
assert.equal(comparison.provenance.sourceCommit,sourceCommit);assert.equal(stability.sourceCommit,sourceCommit);assert.equal(receipt.sourceCommit,sourceCommit);
const records=[];
for(const entry of index?.entries??[]){
  assert.match(entry.id,/^[a-f0-9]{64}$/);assert.match(entry.snapshotId,/^[a-f0-9]{64}$/);
  assert.equal(entry.recordPath,'records/'+entry.id+'.json');assert.equal(entry.snapshotPath,'snapshots/'+entry.snapshotId+'.json');
  const record=await read('build/ethereum-prospective-ledger/'+entry.recordPath),snapshot=await read('build/ethereum-prospective-ledger/'+entry.snapshotPath);
  await verifyEthereumProspectiveRecord(record,snapshot);assert.deepEqual(ethereumProspectiveIndexEntry(record),entry);records.push(record);
}
const evaluation=receipt.evaluation?await read('build/ethereum-prospective-ledger/evaluations/'+receipt.evaluation.id+'.json'):null;
if(evaluation){const {id,...body}=evaluation;assert.equal(await forecastHash(body),id);assert.deepEqual(evaluation.recordIds,records.map(r=>r.id).sort());}
const replayReceipt=await read('build/ethereum-prospective-ledger/replay-receipt.json',true);
if(receipt.status==='issued-or-reused'){assert.equal(replayReceipt?.status,'verified-preserved');assert.equal(replayReceipt.networkRequests,0);assert.equal(replayReceipt.newRecords,0);}
const previous=await read('dist/data/asset-forecast-ledger/index.json');
const priorModels=Object.values(Object.groupBy(previous.entries,e=>e.symbol)).map(entries=>({
  symbol:entries[0].symbol,records:entries.length,
  modelVersions:[...new Set(entries.map(e=>e.modelVersion??e.model?.version??'version-held-in-record'))],
  candidateAdaptiveOrPooledEvidence:false,
}));
const report={kind:'ethereum-model-remaining-conditions',sourceCommit,sourceTree,executedAt:new Date().toISOString(),inputSha256:sources,
  asOf:comparison.asOf,priceModels:{default:'adaptive',defaultChanged:false,
    historicalVintagesProven:false,retrospectiveComparisons:comparison.summaries.filter(s=>['adaptiveEth','pooledEth'].includes(s.model)).map(s=>({
      model:s.model,horizonDays:s.horizonDays,completedOutcomes:s.completedOutcomes,disjointTargetIntervals:s.disjointTargetIntervals,
      meanAbsoluteLogError:s.disjoint.meanAbsoluteLogError})),
    simulationSensitivity:{status:stability.result.status,policy:stability.policy.version,defaultReplayCases:stability.defaultReplay.length,
      comparisons:stability.result.comparisons??[],marketAccuracyProven:false}},
  addedResearchControls:{
    intervalBenchmarks:{gaussian:intervalControls.gaussian.summaries,empirical:intervalControls.empiricalControls,
      calibratedForProduction:false,comparisonAcrossDifferentOrigins:false},
    initialization:{model:warmStart.policy.version,
      classifiedReturnsBefore:warmStart.current.prior.classifiedReturns,
      classifiedReturnsAfter:warmStart.current.candidate.classifiedReturns,
      restoredClassifiedReturns:warmStart.current.restoredClassifiedReturns,
      preMergeReturnsUsed:warmStart.current.candidate.preMergeReturnsUsed,
      preMergeRiskDaysUsed:warmStart.current.candidate.preMergeRiskDaysUsed,
      pointComparisons:warmStart.pointComparisons.filter(row=>row.left==='warmStartEth'),
      intervalComparisons:warmStart.intervalComparisons,
      defaultChanged:false,prospectiveRecordsIssued:records.filter(r=>r.modelKey==='warmStart').length,
      newProspectiveRecordsThisRun:(receipt.decisions??[]).filter(d=>d.modelKey==='warmStart'&&d.action==='append').length,
      predictiveImprovementProven:false},
    commonCohort:{policy:commonCohort.policy.version,status:commonCohort.result.status,
      cohorts:commonCohort.cohorts.map(c=>({id:c.id,kind:c.kind,horizonDays:c.horizonDays,models:c.models,n:c.n,
        eligibleBeforeDisjoint:c.eligibleBeforeDisjoint,disjointOrigins:c.disjointOrigins,exclusionReasonCounts:c.exclusionReasonCounts})),
      sampleCounts:commonCohort.policy.sampleCounts,seeds:commonCohort.policy.seeds,
      summaries:commonCohort.result.summaries,comparisons:commonCohort.result.comparisons,
      defaultReplayCases:commonCohort.defaultReplay.length,failures:commonCohort.failures,
      separatePointAndIntervalCohorts:true,marketAccuracyProven:false,statisticalSignificanceClaim:false},
    independentCalibration:{policy:independentCalibration.policy,reportSha256:sources['build/ethereum-independent-calibration.json'],
      results:independentCalibration.results.map(row=>({model:row.split.model,horizonDays:row.split.horizonDays,status:row.status,
        calibrationCases:row.split.calibrationCases,calibrationBoundary:row.split.calibrationBoundary,selectedTestCases:row.selectedTestCases,
        completedTestCases:row.completedTestCases,summaries:row.summaries,pairedIntervalSkill:row.pairedIntervalSkill})),
      futureProtocol:independentCalibration.futureProtocol,untouchedHistoricalHoldout:false,prospectiveScoredTargets:0,
      historicalVintagesVerified:false,coverageGuarantee:false,calibratedForProduction:false}},
  prospective:{status:receipt.status,replayFromPersistedFiles:replayReceipt?{status:replayReceipt.status,networkRequests:replayReceipt.networkRequests,newRecords:replayReceipt.newRecords,reusedRecords:replayReceipt.reusedRecords,indexUnchanged:replayReceipt.indexUnchanged}:null,previousAssetLedger:{records:previous.entries.length,models:priorModels,separateFromNewCandidates:true},
    candidateRecords:records.length,uniqueOrigins:new Set(records.map(r=>r.asOf)).size,
    modelEvidence:[...new Set(['adaptive','pooled','warmStart',...records.map(r=>r.modelKey)])].map(modelKey=>{
      const owned=records.filter(r=>r.modelKey===modelKey),rows=(evaluation?.rows??[]).filter(r=>r.modelKey===modelKey);
      return {modelKey,recordCount:owned.length,uniqueOrigins:new Set(owned.map(r=>r.asOf)).size,
        pending:rows.filter(r=>r.status==='pending').length,scored:rows.filter(r=>r.status==='scored').length,
        earliestOutcomeEventAt:owned.flatMap(r=>r.targets.map(t=>t.eventAt)).sort()[0]??null,
        independentlyValidatedMarketRegimes:null,accuracyProven:false};
    }),issuanceReceiptSha256:sources['build/ethereum-prospective-ledger/receipt.json'],
    requiresFutureObservedAndCollectedPrices:true,multipleModelsOrHorizonsAreNotIndependentOrigins:true},
  economics:{version:ETH_ECONOMIC_VERSION,metricDefinitionVersion:ETH_ECONOMIC_INPUT_SCHEMA.snapshot.metricDefinitionVersion,
    requiredMetricCount:Object.keys(ETH_ECONOMIC_INPUT_SCHEMA.metrics).length,
    requiredNonFeeExecutionDestruction:true,legacyFullInputAutomaticallyUpgraded:false,providedSnapshots:comparison.data.economicSnapshotCount,
    eligibleFullSnapshots:comparison.data.economicSnapshotReadiness?.definitionAndTimeQualifiedSnapshots??null,
    inputInspection:comparison.data.economicSnapshotReadiness??null,
    metricEvidence:{version:economicCoverage.version,asOf:economicCoverage.asOf,issuedAt:economicCoverage.issuedAt,
      summary:economicCoverage.summary,sources:economicCoverage.sources,
      metrics:economicCoverage.metrics.map(({metric,status,relations,evidence,sourceCaptureStates,clockTags,gaps})=>
        ({metric,status,relations,evidence,sourceCaptureStates,clockTags,gaps})),
      reportSha256:sources['build/ethereum-economic-evidence-coverage.json'],
      eligibleModelSnapshotCount:economicCoverage.eligibleModelSnapshotCount,modelInputActivated:false,
      historicalPointInTimeReady:false},
    observationVintages:{version:economicVintages.version,ledgerId:economicVintages.ledgerId,
      recordCount:economicVintages.recordCount,newCaptureCount:economicVintages.newCaptureCount,reusedCaptureCount:economicVintages.reusedCaptureCount,
      distinctDataVersions:economicVintages.distinctDataVersions,verifiedInputFiles:economicVintages.verifiedInputFiles,
      selection:economicVintages.selection.summary,receiptSha256:sources['build/ethereum-economic-vintages/receipt.json'],
      replay:{networkRequests:economicVintageReplay.networkRequests,newCaptureCount:economicVintageReplay.newCaptureCount,
        reusedCaptureCount:economicVintageReplay.reusedCaptureCount,verifiedInputFiles:economicVintageReplay.verifiedInputFiles},
      actualReceiptClocksRetained:true,firstPublicationProven:false,fullModelSnapshotReady:false,modelInputActivated:false},
    supplyAccountingAudits:supplyAudits,
    retainedSourceTiming:{sourceSha256:sourceTiming.source.sha256,collectedAt:sourceTiming.source.collectedAt,
      publishedAt:sourceTiming.source.publishedAt,latestComplete:sourceTiming.rows.latestComplete,
      completeMergeEraRows:sourceTiming.rows.completeMetricRows,
      providerCompletionOverOneDay:sourceTiming.completionLag.strictlyOver1Day,
      providerCompletionOverThirtyDays:sourceTiming.completionLag.strictlyOver30Days,
      historicalPointInTimeReady:false},
    active:comparison.current.candidates.economic.status==='ready',
    feasibility:assessEthereumEconomicFeasibility({asOf:comparison.asOf}),
    partialProtocolPoWZeroIsNotTotalIssuance:true,definitionContractsRelaxed:false,
    remaining:['Definition-matched complete '+Object.keys(ETH_ECONOMIC_INPUT_SCHEMA.metrics).length+'-metric snapshots including measured non-fee execution destruction','Actual publication and collection vintages available by each historical origin',
      'Cohort-specific earned net staking returns and disjoint underlying collateral','Enough same-horizon matured labels and market regimes']},
  release:{draft:true,authorized:false,productionPromoted:false,
    geminiOpposition:'omitted-by-user',followupReverseReview:'omitted-by-user',
    gatesNotSubstitutedByCodeTests:['Mature prospective outcomes','Adequate horizon-specific nonoverlapping samples','Validated forecast calibration','Separate release authorization']},
};
await writeFile(resolve(root,'build/ethereum-model-readiness.json'),JSON.stringify(report,null,2)+'\n');
console.log('ETH_MODEL_READINESS_RECEIPT '+JSON.stringify(report));
