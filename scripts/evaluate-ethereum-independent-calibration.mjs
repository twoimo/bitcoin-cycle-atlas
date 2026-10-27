import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {utcDay} from '../dist/cycle-engine.js';
import {readAssetDailyRows} from '../dist/asset-daily-observations.js';
import {buildEthereumAdaptiveCandidate,ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {buildEthereumPooledCandidate,ETH_POOLED_POLICY} from '../dist/ethereum-pooled-model.js';
import {buildEthereumWarmStartCandidate,ETH_WARM_START_POLICY} from '../dist/ethereum-warm-start-model.js';
import {buildEthereumGaussianIntervalBenchmark} from '../dist/ethereum-interval-benchmark.js';
import {ETH_INDEPENDENT_CALIBRATION_POLICY as policy,ETH_FUTURE_CALIBRATION_CONTRACT,
  selectEthereumCalibrationSplit,auditEthereumIndependentCalibration} from './ethereum-independent-calibration-core.mjs';

const builders={adaptiveEth:buildEthereumAdaptiveCandidate,pooledEth:buildEthereumPooledCandidate,warmStartEth:buildEthereumWarmStartCandidate};
const modelPolicies={adaptiveEth:ETH_ADAPTIVE_POLICY,pooledEth:ETH_POOLED_POLICY,warmStartEth:ETH_WARM_START_POLICY};
const key=row=>row.origin+'|'+row.horizonDays;
const closeAt=date=>new Date((utcDay(date)+1)*86400000).toISOString();

/** Source replay validates every selected calibration/test prediction and
 * realized close; cached coverage/interval scores never enter the audit. */
export function buildEthereumIndependentCalibrationReport({ethHistory,comparison,warmStart}={}){
  const began=performance.now();
  if(comparison?.kind!=='ethereum-candidate-comparison'||warmStart?.kind!=='ethereum-warm-start-research'||
    comparison.asOf!==warmStart.asOf||warmStart.policy?.version!==ETH_WARM_START_POLICY.version)
    throw new TypeError('Matching source comparison and separately versioned warm-start reports required');
  if(!Array.isArray(comparison.cases)||!Array.isArray(warmStart.cases)||comparison.cases.length!==warmStart.cases.length||comparison.cases.length>policy.maximumInputCases)
    throw new RangeError('Bounded matching original cases required');
  const originals=new Map();
  for(const row of comparison.cases){
    if(originals.has(key(row)))throw new RangeError('Duplicate original calibration case');originals.set(key(row),row);
  }
  const warmKeys=new Set();
  for(const row of warmStart.cases){
    if(warmKeys.has(key(row)))throw new RangeError('Duplicate warm-start calibration case');warmKeys.add(key(row));
    const {warmStartEth:point,...predictions}=row.predictions??{},
      {warmStartEth:band,...simulatedIntervals}=row.simulatedIntervals??{};
    assert.deepEqual({...row,predictions,simulatedIntervals},originals.get(key(row)),'Warm-start report changed an original comparison field');
  }
  const asOf=comparison.asOf,cases=warmStart.cases,prices=new Map(readAssetDailyRows(ethHistory,'ETH',asOf).map(row=>[row.date,row.price]));
  const plans=policy.models.flatMap(model=>policy.horizons.map(horizonDays=>selectEthereumCalibrationSplit(cases,{asOf,model,horizonDays})));
  const byKey=new Map(cases.map(row=>[key(row),row])),candidateCache=new Map(),controlCache=new Map(),replay=[];
  for(const plan of plans){
    const p=modelPolicies[plan.model];
    assert.equal(p.version,plan.modelVersion);assert.equal(p.sampleCount,policy.sampleCount);assert.equal(p.seed,policy.seed);
    for(const caseKey of [...plan.calibrationCaseKeys,...plan.testCaseKeys]){
      const row=byKey.get(caseKey);
      if(row.informationCutoffAt!==undefined)assert.equal(row.informationCutoffAt,closeAt(row.origin),'Selected forecast information cutoff differs from the completed origin');
      if(row.observationThroughAt!==undefined)assert.equal(row.observationThroughAt,closeAt(row.origin),'Selected predictor observation clock differs from the completed origin');
      if(row.targetObservationEndAt!==undefined)assert.equal(row.targetObservationEndAt,closeAt(row.targetDate),'Selected target observation clock differs from the completed target');
      assert.equal(row.anchorPrice,prices.get(row.origin),'Selected calibration/test anchor differs from source close');
      if(row.actual!=null)assert.equal(row.actual,prices.get(row.targetDate),'Selected calibration/test target differs from source close');
      const cacheKey=plan.model+'|'+row.origin;
      if(!candidateCache.has(cacheKey))candidateCache.set(cacheKey,builders[plan.model]({ethRows:ethHistory,asOf:row.origin,horizons:policy.horizons}));
      const candidate=candidateCache.get(cacheKey),prediction=candidate.predictions.find(value=>value.horizonDays===row.horizonDays);
      assert.ok(prediction,'A selected source-replayed prediction is missing');
      assert.equal(prediction.targetDate,row.targetDate);assert.equal(prediction.price,row.predictions[plan.model]);
      assert.equal(prediction.simulatedLower,row.simulatedIntervals[plan.model].lower);
      assert.equal(prediction.simulatedUpper,row.simulatedIntervals[plan.model].upper);
      replay.push({model:plan.model,modelVersion:plan.modelVersion,caseKey,medianExact:true,intervalExact:true,
        outcomeExact:row.actual==null?null:true,seed:policy.seed,sampleCount:policy.sampleCount});
      if(!controlCache.has(row.origin))controlCache.set(row.origin,buildEthereumGaussianIntervalBenchmark({ethHistory,asOf:row.origin,horizons:policy.horizons}));
    }
  }
  const gaussianControls=[...controlCache].flatMap(([origin,report])=>report.predictions.map(row=>({origin,...row})));
  const results=policy.models.flatMap(model=>policy.horizons.map(horizonDays=>auditEthereumIndependentCalibration(cases,{asOf,model,horizonDays,gaussianControls})));
  return {kind:'ethereum-independent-calibration-audit',asOf,policy,modelVersions:policy.modelVersions,
    results,replay,futureProtocol:ETH_FUTURE_CALIBRATION_CONTRACT,
    runtime:{milliseconds:performance.now()-began,candidateOriginReplays:candidateCache.size,selectedPredictionReplays:replay.length,
      gaussianOriginFits:controlCache.size,physicalMobileMeasurement:false},
    noExistingModelOrRecordChanged:true,actualCalibratedRecordsIssued:0,prospectiveScoredTargets:0,
    developmentDataChronologicalSeparation:true,untouchedHistoricalHoldout:false,policyPreregistered:false,
    historicalVintagesVerified:false,coverageGuarantee:false,productionPromoted:false,
    limitations:[
      'The first twelve nonoverlapping calibration windows and all later disjoint test windows are fixed before any test loss is calculated. Missing selected labels or controls are retained as incomplete, never replaced.',
      'Forecast parameter fits may use all completed prices available at each forecast origin. The calibration radius alone is frozen and receives no later test residuals.',
      'This is a new audit on already examined current-vintage development data. Chronological separation is not an untouched historical holdout, historical publication proof or prospective validation.',
      'The rank ceil((n+1)*(1-alpha)) is an empirical order statistic. Serial dependence and regime shifts prevent asserting distribution-free ETH coverage from this calculation.',
      'Coverage is reported as exact hit counts with one-case resolution. No IID binomial confidence interval, independent sample size, significance test or calibrated production probability is claimed.',
      'Each candidate/horizon has its own available calibration block; compare only paired interval scores inside that exact test set, not cross-model table ranks.',
      'The future contract requires new immutable calibrated records and actual previously collected prospective outcomes. Existing raw records and reconstructed historical residuals cannot be relabeled.',
    ]};
}

async function main(){
  const root=fileURLToPath(new URL('..',import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
  const inputPath='dist/data/eth-ohlc.json',comparisonPath='build/ethereum-model-comparison.json',warmPath='build/ethereum-warm-start.json';
  const input=await readFile(resolve(root,inputPath)),comparisonBytes=await readFile(resolve(root,comparisonPath)),warmBytes=await readFile(resolve(root,warmPath));
  const comparison=JSON.parse(comparisonBytes),warmStart=JSON.parse(warmBytes);
  for(const report of [comparison,warmStart]){
    assert.equal(report.provenance.sourceCommit,sourceCommit);assert.equal(report.provenance.sourceTree,sourceTree);
    assert.equal(report.provenance.inputSha256[inputPath],sha(input));
  }
  assert.equal(warmStart.provenance.comparisonSha256,sha(comparisonBytes));
  const sourceFiles={};
  async function visit(path){
    if(sourceFiles[path])return;
    const bytes=await readFile(resolve(root,path));sourceFiles[path]=sha(bytes);
    for(const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const file=resolve(dirname(resolve(root,path)),match[1].split('?')[0]),rel=relative(root,file);
      if(rel.startsWith('..')||isAbsolute(rel))throw new Error('Calibration audit dependency leaves repository');await visit(rel);
    }
  }
  await visit('scripts/evaluate-ethereum-independent-calibration.mjs');await visit('tests/ethereum-independent-calibration.test.mjs');
  if(git('status','--porcelain','--',...Object.keys(sourceFiles),inputPath))throw new Error('Calibration audit requires committed sources and inputs');
  const report=buildEthereumIndependentCalibrationReport({ethHistory:JSON.parse(input),comparison,warmStart});
  report.provenance={sourceCommit,sourceTree,sourceFiles,inputSha256:{[inputPath]:sha(input)},
    policySha256:sha(JSON.stringify(policy)),futureProtocolSha256:sha(JSON.stringify(ETH_FUTURE_CALIBRATION_CONTRACT)),
    comparisonSha256:sha(comparisonBytes),warmStartSha256:sha(warmBytes),executedAt:new Date().toISOString(),
    runId:process.env.GITHUB_RUN_ID??null,executionEnvironment:process.env.GITHUB_ACTIONS==='true'?'GitHub Actions':'Explicit Node invocation'};
  const output=resolve(root,'build/ethereum-independent-calibration.json');await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report)+'\n');
  console.log('ETH_INDEPENDENT_CALIBRATION_RECEIPT '+JSON.stringify({kind:report.kind,asOf:report.asOf,policy,provenance:report.provenance,runtime:report.runtime,
    results:report.results.map(({split,status,calibration,selectedTestCases,completedTestCases,summaries,pairedIntervalSkill,failures})=>({
      model:split.model,horizonDays:split.horizonDays,status,calibrationCases:split.calibrationCases,calibrationBoundary:split.calibrationBoundary,
      orderStatistic:calibration.orderStatistic,selectedTestCases,completedTestCases,summaries,pairedIntervalSkill,failures})),
    historicalVintagesVerified:false,untouchedHistoricalHoldout:false,actualCalibratedRecordsIssued:0,prospectiveScoredTargets:0,productionPromoted:false}));
  if(report.results.some(row=>row.status==='incomplete'))throw new Error('Selected calibration audit slots are incomplete; inspect preserved report');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
