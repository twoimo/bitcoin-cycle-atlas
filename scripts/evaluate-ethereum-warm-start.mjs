import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fitEthereumAdaptiveModel,ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {ETH_WARM_START_POLICY,fitEthereumWarmStartModel,simulateEthereumWarmStart,buildEthereumWarmStartCandidate} from '../dist/ethereum-warm-start-model.js';
import {evaluateEthereumGaussianIntervalBenchmark} from '../dist/ethereum-interval-benchmark.js';
import {summarizeEthereumComparison,summarizeEthereumIntervalPair} from '../dist/ethereum-model-comparison.js';
import {intervalScore} from '../dist/forecast-evaluation.js';

function diagnostics(fit){
  const t=fit.training;
  return {firstObservation:t.firstObservation,observations:t.observations,classifiedReturns:t.classifiedReturns,
    unclassifiedReturns:t.unclassifiedReturns,initialization:t.initialization??null,spells:t.spells??null,
    preMergeReturnsUsed:t.preMergeReturnsUsed??0,preMergeRiskDaysUsed:t.preMergeRiskDaysUsed??0,
    currentState:t.currentState,currentStateKnownAt:t.currentStateKnownAt,currentAge:t.currentAge,
    currentRightCensored:t.currentRightCensored,
    states:Object.fromEntries(Object.entries(fit.states).map(([state,s])=>[state,{
      ...s,hazardPriorWeightByAge:s.riskByAge.map(risk=>ETH_ADAPTIVE_POLICY.bucketPriorDays/(risk+ETH_ADAPTIVE_POLICY.bucketPriorDays)),
      fullyObservedCompletedSpells:s.completedDurations.length,
    }])),
    stateMeaning:'A confirmed drawdown/rebound state, not an extremum-to-extremum bull/bear period. The down state can have positive returns.',
    fixedThreeUpOneDownProven:false,independentMarketCycles:null};
}

export function buildEthereumWarmStartReport({ethHistory,comparison}={}){
  if(comparison?.kind!=='ethereum-candidate-comparison'||!Array.isArray(comparison.cases))throw new TypeError('An actual ETH comparison report is required');
  const asOf=comparison.asOf,horizons=[30,90,180],model='warmStartEth',candidates=new Map(),origins=[];
  const original=JSON.stringify(comparison.cases);
  const cases=comparison.cases.map(row=>{
    if(!candidates.has(row.origin)){
      const candidate=buildEthereumWarmStartCandidate({ethRows:ethHistory,asOf:row.origin,horizons});
      candidates.set(row.origin,candidate);
      origins.push({origin:row.origin,status:candidate.status,reason:candidate.reason??null,
        classifiedReturns:candidate.training?.classifiedReturns??null,
        unclassifiedReturns:candidate.training?.unclassifiedReturns??null,
        initialization:candidate.training?.initialization??null});
    }
    const p=candidates.get(row.origin).predictions.find(value=>value.horizonDays===row.horizonDays);
    if(!p)return {...row,predictions:{...row.predictions},simulatedIntervals:{...row.simulatedIntervals}};
    assert.equal(p.targetDate,row.targetDate);
    return {...row,predictions:{...row.predictions,[model]:p.price},
      simulatedIntervals:{...row.simulatedIntervals,[model]:{lower:p.simulatedLower,upper:p.simulatedUpper,
        nominalPointwiseMass:.8,covered:row.actual===null?null:row.actual>=p.simulatedLower&&row.actual<=p.simulatedUpper,
        logWidth:Math.log(p.simulatedUpper)-Math.log(p.simulatedLower),
        logIntervalScore:row.actual===null?null:intervalScore(Math.log(p.simulatedLower),Math.log(p.simulatedUpper),Math.log(row.actual),.2),
        coverageGuarantee:false}}};
  });
  assert.equal(JSON.stringify(comparison.cases),original,'Existing comparison cases must remain exactly unchanged');
  const fit=fitEthereumWarmStartModel(ethHistory,asOf),prior=fitEthereumAdaptiveModel(ethHistory,asOf);
  const simulation=simulateEthereumWarmStart(fit,{horizonDays:730});
  const point=summarizeEthereumComparison(cases,{horizons,models:[model,'adaptiveEth','pooledEth'],baselineModels:['flat','shrunkenTrend']});
  const intervals=horizons.flatMap(horizonDays=>['adaptiveEth','pooledEth'].map(other=>summarizeEthereumIntervalPair(cases,{
    asOf,horizonDays,left:{model,kind:'simulated'},right:{model:other,kind:'simulated'}})));
  const gaussian=evaluateEthereumGaussianIntervalBenchmark({ethHistory,cases,asOf,models:[model]});
  return {kind:'ethereum-warm-start-research',asOf,policy:ETH_WARM_START_POLICY,
    current:{prior:diagnostics(prior),candidate:diagnostics(fit),simulation:simulation.metadata,
      restoredClassifiedReturns:fit.training.classifiedReturns-prior.training.classifiedReturns,
      path:simulation.path},origins,cases,pointComparisons:point.pairwise,summaries:point.summaries,
    intervalComparisons:intervals,gaussianControl:gaussian,
    existingComparisonCasesPreserved:true,defaultChanged:false,existingIssuedRecordsChanged:false,
    prospectiveRecordsIssued:0,prospectiveScoredTargets:0,productionPromoted:false,calibratedForProduction:false,
    historicalVintagesVerified:false,
    limitations:[
      'Earlier prices initialize the full confirmation detector, including state, age, running extrema and confirmation streaks. Only post-Merge return intervals and observed post-Merge risk days enter the fit.',
      'Left-truncated state periods have known initial age but incomplete observed exposure in this estimation era; they are not fully observed completed spells.',
      'Confirmation-state duration is not a bull/bear extremum duration and does not prove a three-year rise or one-year decline.',
      'Initialization changes both state history and the usable sample; this is not an isolated causal estimate of any one model component.',
      'The candidate is a retrospective sensitivity experiment with fixed inherited parameters and seed; no winning setting was selected.',
      'Compare each pair on its own shared origins. Raw Monte Carlo bands and a 730-day illustrative path do not establish calibrated future coverage.',
      'Existing issued v1 records retain their exact source and values. This candidate has no prospective record or realized performance.',
    ]};
}

async function main(){
  const root=fileURLToPath(new URL('..',import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
  const inputPath='dist/data/eth-ohlc.json',input=await readFile(resolve(root,inputPath));
  const comparisonText=await readFile(resolve(root,'build/ethereum-model-comparison.json')),comparison=JSON.parse(comparisonText);
  assert.equal(comparison.provenance.sourceCommit,sourceCommit);assert.equal(comparison.provenance.sourceTree,sourceTree);
  assert.equal(comparison.provenance.inputSha256[inputPath],sha(input));
  const sourceFiles={},visited=new Set();
  async function visit(path){
    if(visited.has(path))return;visited.add(path);
    const bytes=await readFile(resolve(root,path)),text=bytes.toString('utf8');sourceFiles[path]=sha(bytes);
    for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const file=resolve(dirname(resolve(root,path)),match[1].split('?')[0]);
      if(!file.startsWith(root))throw new Error('Warm-start dependency leaves the repository');
      await visit(file.slice(root.length));
    }
  }
  await visit('scripts/evaluate-ethereum-warm-start.mjs');await visit('tests/ethereum-warm-start-model.test.mjs');
  if(git('status','--porcelain','--',...Object.keys(sourceFiles),inputPath))throw new Error('Warm-start research requires committed source and inputs');
  const start=performance.now(),report=buildEthereumWarmStartReport({ethHistory:JSON.parse(input),comparison});
  report.provenance={sourceCommit,sourceTree,sourceFiles,inputSha256:{[inputPath]:sha(input)},
    comparisonSha256:sha(comparisonText),executedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null,
    executionEnvironment:process.env.GITHUB_ACTIONS==='true'?'GitHub Actions':'Explicit Node invocation'};
  report.runtime={elapsedMs:performance.now()-start,originFits:report.origins.length,physicalMobileMeasurement:false};
  const output=resolve(root,'build/ethereum-warm-start.json');await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log('ETH_WARM_START_RECEIPT '+JSON.stringify({kind:report.kind,asOf,policy:report.policy,provenance:report.provenance,runtime:report.runtime,
    current:{...report.current,path:undefined,pathPoints:report.current.path.length},
    originCount:report.origins.length,availableOrigins:report.origins.filter(r=>r.status==='available').length,
    pointComparisons:report.pointComparisons,intervalComparisons:report.intervalComparisons,gaussianSummaries:report.gaussianControl.summaries,
    defaultChanged:false,prospectiveRecordsIssued:0,prospectiveScoredTargets:0,limitations:report.limitations}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
