import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {assessEthereumEconomicFeasibility} from '../dist/ethereum-economic-model.js';
import {verifyEthereumProspectiveRecord,ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-records.js';
const root=fileURLToPath(new URL('..',import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}'),sources={};
async function read(path,optional=false){
  try{const text=await readFile(resolve(root,path),'utf8');sources[path]=sha(text);return JSON.parse(text);}
  catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}
const comparison=await read('build/ethereum-model-comparison.json'),stability=await read('build/ethereum-monte-carlo-stability.json');
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
  prospective:{status:receipt.status,replayFromPersistedFiles:replayReceipt?{status:replayReceipt.status,networkRequests:replayReceipt.networkRequests,newRecords:replayReceipt.newRecords,reusedRecords:replayReceipt.reusedRecords,indexUnchanged:replayReceipt.indexUnchanged}:null,previousAssetLedger:{records:previous.entries.length,models:priorModels,separateFromNewCandidates:true},
    candidateRecords:records.length,uniqueOrigins:new Set(records.map(r=>r.asOf)).size,
    modelEvidence:['adaptive','pooled'].map(modelKey=>{
      const owned=records.filter(r=>r.modelKey===modelKey),rows=(evaluation?.rows??[]).filter(r=>r.modelKey===modelKey);
      return {modelKey,recordCount:owned.length,uniqueOrigins:new Set(owned.map(r=>r.asOf)).size,
        pending:rows.filter(r=>r.status==='pending').length,scored:rows.filter(r=>r.status==='scored').length,
        earliestOutcomeEventAt:owned.flatMap(r=>r.targets.map(t=>t.eventAt)).sort()[0]??null,
        independentlyValidatedMarketRegimes:null,accuracyProven:false};
    }),issuanceReceiptSha256:sources['build/ethereum-prospective-ledger/receipt.json'],
    requiresFutureObservedAndCollectedPrices:true,multipleModelsOrHorizonsAreNotIndependentOrigins:true},
  economics:{version:'eth-economic-ridge-5',eligibleFullSnapshots:comparison.data.economicSnapshotCount,
    active:comparison.current.candidates.economic.status==='ready',
    feasibility:assessEthereumEconomicFeasibility({asOf:comparison.asOf}),
    partialProtocolPoWZeroIsNotTotalIssuance:true,definitionContractsRelaxed:false,
    remaining:['Definition-matched complete 25-metric snapshots','Actual publication and collection vintages available by each historical origin',
      'Cohort-specific earned net staking returns and disjoint underlying collateral','Enough same-horizon matured labels and market regimes']},
  release:{draft:true,authorized:false,productionPromoted:false,
    geminiOpposition:'omitted-by-user',followupReverseReview:'omitted-by-user',
    gatesNotSubstitutedByCodeTests:['Mature prospective outcomes','Adequate horizon-specific nonoverlapping samples','Validated forecast calibration','Separate release authorization']},
};
await writeFile(resolve(root,'build/ethereum-model-readiness.json'),JSON.stringify(report,null,2)+'\n');
console.log('ETH_MODEL_READINESS_RECEIPT '+JSON.stringify(report));
