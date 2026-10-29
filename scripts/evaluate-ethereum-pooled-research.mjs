import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {ETH_POOLED_POLICY,fitEthereumPooledModel,simulateEthereumPooled} from '../dist/ethereum-pooled-model.js';
import {fitEthereumAdaptiveModel,simulateEthereumAdaptive} from '../dist/ethereum-adaptive-model.js';
import {compactEthereumReport} from './evaluate-ethereum-models.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
const sourcePaths=['dist/ethereum-pooled-model.js','dist/ethereum-adaptive-model.js','dist/ethereum-model-comparison.js',
  'scripts/evaluate-ethereum-pooled-research.mjs','scripts/evaluate-ethereum-models.mjs',
  'tests/ethereum-pooled-model.test.mjs','tests/ethereum-interval-comparison.test.mjs',
  'docs/eth-candidate-evidence/20261027-remodel/current-path.json','docs/eth-candidate-evidence/20261027-remodel/comparison.json'];
if(git('status','--porcelain','--',...sourcePaths,'dist/data/eth-ohlc.json','dist/data/btc-daily.json'))throw new Error('Research diagnostics require committed sources and inputs');
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,sha(await readFile(resolve(root,p)))])));
const ethText=await readFile(resolve(root,'dist/data/eth-ohlc.json'),'utf8'),btcText=await readFile(resolve(root,'dist/data/btc-daily.json'),'utf8');
const inputSha256={'dist/data/eth-ohlc.json':sha(ethText),'dist/data/btc-daily.json':sha(btcText)},ethHistory=JSON.parse(ethText);
const comparison=await readJson('build/ethereum-model-comparison.json'),asOf=comparison.asOf;
assert.equal(comparison.provenance.sourceCommit,sourceCommit);
assert.deepEqual(comparison.provenance.inputSha256,inputSha256);
const start=performance.now(),fit=fitEthereumPooledModel(ethHistory,asOf),simulation=simulateEthereumPooled(fit,{horizonDays:730});
const runtimeMs=performance.now()-start;
for(const p of comparison.current.candidates.pooledEth.predictions){
  assert.equal(p.price,simulation.path[p.horizonDays].baselinePrice);
  assert.equal(p.simulatedLower,simulation.path[p.horizonDays].low);
  assert.equal(p.simulatedUpper,simulation.path[p.horizonDays].high);
}
assert.equal(fit.training.returnCount,fit.training.observations-1);
const previousPath=await readJson('docs/eth-candidate-evidence/20261027-remodel/current-path.json');
const previousComparison=await readJson('docs/eth-candidate-evidence/20261027-remodel/comparison.json');
const compact=compactEthereumReport(comparison),adaptive=simulateEthereumAdaptive(fitEthereumAdaptiveModel(ethHistory,asOf),{horizonDays:730});
const sameInputs=asOf===previousPath.asOf&&Object.entries(inputSha256).every(([p,h])=>previousPath.inputSha256[p]===h&&previousComparison.inputSha256[p]===h);
const preservation={status:sameInputs?'pending-check':'not-comparable-inputs-changed',
  previousSourceCommit:previousPath.sourceCommit,sameInputs,priorAsOf:previousPath.asOf,currentAsOf:asOf,
  currentDefault:'adaptive',pathPointsChecked:0,priorModelSummaryRowsChecked:0,priorPairwiseRowsChecked:0};
if(sameInputs){
  assert.deepEqual(adaptive.path,previousPath.path,'Existing adaptive current path must remain exactly unchanged');
  assert.deepEqual(adaptive.metadata,previousPath.metadata,'Existing adaptive simulation meaning must remain unchanged');
  const oldSummaries=compact.summaries.filter(s=>s.model!=='pooledEth');
  assert.deepEqual(oldSummaries,previousComparison.summaries,'Existing model summary scores must remain exactly unchanged');
  const oldPairs=compact.pairwise.filter(p=>p.left!=='pooledEth'&&p.right!=='pooledEth');
  assert.deepEqual(oldPairs,previousComparison.pairwise,'Existing pairwise scores must remain exactly unchanged');
  for(const [id,candidate] of Object.entries(previousComparison.current))assert.deepEqual(compact.current[id],candidate,'Existing current candidate changed: '+id);
  Object.assign(preservation,{status:'verified',pathPointsChecked:adaptive.path.length,
    priorModelSummaryRowsChecked:oldSummaries.length,priorPairwiseRowsChecked:oldPairs.length});
}
const report={
  kind:'ethereum-pooled-followup-research',asOf,sourceCommit,sourceTree,sourceHashes,inputSha256,
  executedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null,policy:ETH_POOLED_POLICY,
  training:fit.training,simulation:simulation.metadata,currentPath:simulation.path,
  adaptivePreservation:preservation,
  currentPointPredictions:comparison.current.candidates.pooledEth.predictions,
  pointComparisons:comparison.pairwise.filter(p=>(p.left==='pooledEth'||p.right==='pooledEth')&&
    [p.left,p.right].some(id=>['flat','shrunkenTrend','btcLinked','adaptiveEth','legacyEth'].includes(id))),
  summaries:compact.summaries.filter(s=>['adaptiveEth','pooledEth'].includes(s.model)),
  intervalComparisons:comparison.intervalComparisons,
  currentIntervalEvidence:{...comparison.currentIntervalEvidence,horizons:comparison.currentIntervalEvidence.horizons.map(h=>({
    ...h,models:Object.fromEntries(Object.entries(h.models).filter(([id])=>['adaptiveEth','pooledEth'].includes(id)))}))},
  runtime:{fitAnd730Day256DrawSimulationMs:runtimeMs,environment:'GitHub Actions Node; not physical mobile latency',
    logMatrixBytes:731*256*8,complexity:'O(history + horizon*draws*log(draws))',timingIsNotGuaranteed:true},
  forecastPerformance:{prospectiveScoredTargets:comparison.prospectiveScoredTargets,productionPromoted:false,
    policyPreregistered:false,historicalVintagesAvailable:false,
    externalGeminiReview:'omitted-by-user-2026-10-27',reverseReview:'omitted-by-user-2026-10-27'},
  limitations:[
    'Pooled candidate jointly changes state conditioning, included returns and explicit drift policy; no single-component causal attribution',
    'Candidate was designed after examining historical data; not an untouched historical holdout',
    'All-return origin availability differs; compare intersections before choosing disjoint target intervals',
    'Zero explicit drift does not guarantee zero conditional mean, a price martingale or a fixed median',
    'Fixed variance and 28-day block policies were not optimized against these new scores',
    'Raw pointwise Monte Carlo bands omit parameter uncertainty and do not guarantee empirical coverage',
    'Minimum 12 mature same-horizon disjoint errors is an unchanged experiment policy, not a coverage theorem',
    'Current-vintage replay and 30/90/180-day tests do not validate a two-year price prediction',
    'Supplemental throughput data is never passed into this price model',
  ],
};
const output=resolve(root,'build/ethereum-pooled-research.json');await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
const {currentPath,...receipt}=report;
console.log('ETH_POOLED_RECEIPT '+JSON.stringify(receipt));
const pathText=JSON.stringify({kind:'reconstructed-research-path',issued:false,asOf,sourceCommit,sourceTree,
  executedAt:report.executedAt,inputSha256,metadata:simulation.metadata,path:currentPath});
const size=20000,total=Math.ceil(pathText.length/size);
for(let index=0;index<total;index++)console.log('ETH_POOLED_PATH_CHUNK '+JSON.stringify({index,total,data:pathText.slice(index*size,(index+1)*size)}));
