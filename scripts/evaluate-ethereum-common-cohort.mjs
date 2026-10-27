import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {readAssetDailyRows} from '../dist/asset-daily-observations.js';
import {buildIndependentBenchmarks} from '../dist/forecast-evaluation.js';
import {fitEthereumAdaptiveModel,simulateEthereumAdaptive} from '../dist/ethereum-adaptive-model.js';
import {fitEthereumPooledModel,simulateEthereumPooled} from '../dist/ethereum-pooled-model.js';
import {fitEthereumWarmStartModel,simulateEthereumWarmStart,ETH_WARM_START_POLICY} from '../dist/ethereum-warm-start-model.js';
import {buildEthereumGaussianIntervalBenchmark} from '../dist/ethereum-interval-benchmark.js';
import {ETH_COMMON_COHORT_POLICY as policy,selectEthereumCommonCohorts,staticCommonCohortReplicates,summarizeEthereumCommonPanel} from './ethereum-common-cohort-core.mjs';

const fits={adaptiveEth:fitEthereumAdaptiveModel,pooledEth:fitEthereumPooledModel,warmStartEth:fitEthereumWarmStartModel};
const simulations={adaptiveEth:simulateEthereumAdaptive,pooledEth:simulateEthereumPooled,warmStartEth:simulateEthereumWarmStart};
const identity=row=>row.origin+'|'+row.horizonDays;
const pointKey=(model,origin,sampleCount,seed,horizonDays)=>[model,origin,sampleCount,seed,horizonDays].join('|');
function withoutWarm(row){
  const {warmStartEth:point,...predictions}=row.predictions??{};
  const {warmStartEth:band,...simulatedIntervals}=row.simulatedIntervals??{};
  return {...row,predictions,simulatedIntervals};
}

/** Existing issued/default values define membership. Source outcomes, control
 * fits and default simulations are checked again before their losses are used. */
export function buildEthereumCommonCohortReport({ethHistory,comparison,warmStart}={}){
  const began=performance.now();
  if(comparison?.kind!=='ethereum-candidate-comparison'||warmStart?.kind!=='ethereum-warm-start-research'||
    comparison.asOf!==warmStart.asOf||warmStart.policy?.version!==ETH_WARM_START_POLICY.version)
    throw new TypeError('Matching original comparison and separately versioned warm-start reports are required');
  if(!Array.isArray(comparison.cases)||!Array.isArray(warmStart.cases)||comparison.cases.length!==warmStart.cases.length||comparison.cases.length>policy.maximumInputCases)
    throw new RangeError('Bounded matching comparison cases required');
  const original=new Map();
  for(const row of comparison.cases){
    if(original.has(identity(row)))throw new RangeError('Duplicate original comparison origin/horizon');
    if(row.predictions?.warmStartEth!==undefined||row.simulatedIntervals?.warmStartEth!==undefined)throw new RangeError('Original comparison must remain unchanged by the research candidate');
    original.set(identity(row),row);
  }
  for(const row of warmStart.cases){
    const prior=original.get(identity(row));
    if(!prior)throw new RangeError('Warm-start report changed the original origin grid');
    assert.deepEqual(withoutWarm(row),prior,'Warm-start report changed a pre-existing comparison field');
  }
  const asOf=comparison.asOf,sourceRows=readAssetDailyRows(ethHistory,'ETH',asOf),prices=new Map(sourceRows.map(row=>[row.date,row.price]));
  const controls=new Map(),gaussianControls=[];
  for(const row of warmStart.cases){
    if(row.origin>asOf||row.targetDate>asOf||row.status==='pending'||row.status==='missing-observation'||row.actual==null)continue;
    assert.equal(row.actual,prices.get(row.targetDate),'Cached target differs from the source close');
    assert.equal(row.anchorPrice,prices.get(row.origin),'Cached anchor differs from the source close');
    if(!controls.has(row.origin))controls.set(row.origin,buildEthereumGaussianIntervalBenchmark({ethHistory,asOf:row.origin,horizons:policy.horizons}));
    const control=controls.get(row.origin),prediction=control.predictions.find(value=>value.horizonDays===row.horizonDays);
    gaussianControls.push({origin:row.origin,horizonDays:row.horizonDays,targetDate:row.targetDate,
      ...(prediction??{status:'unavailable',reason:control.reason??'Control unavailable'})});
  }
  const cohorts=selectEthereumCommonCohorts({cases:warmStart.cases,asOf,gaussianControls,warmOrigins:warmStart.origins});
  const required=new Map(),selectedCases=new Map();
  for(const cohort of cohorts)for(const row of cohort.cases){
    selectedCases.set(identity(row),row);
    for(const model of policy.simulationModels){
      const key=model+'|'+row.origin;
      if(!required.has(key))required.set(key,{model,origin:row.origin,horizons:new Set()});
      required.get(key).horizons.add(cohort.horizonDays);
    }
  }
  const horizonDays=Math.max(...policy.horizons),plannedDrawDays=required.size*policy.seeds.length*policy.sampleCounts.reduce((sum,value)=>sum+value,0)*horizonDays;
  if(plannedDrawDays>policy.maximumDrawDays)throw new RangeError('Common-cohort Monte Carlo work budget exceeded before simulation');
  // Recompute selected deterministic point controls using only the origin prefix.
  const deterministic=new Map();
  for(const row of selectedCases.values()){
    if(!deterministic.has(row.origin)){
      const prefix=sourceRows.filter(value=>value.date<=row.origin);let start=0;
      for(let index=1;index<prefix.length;index++)if(prefix[index].epochDay!==prefix[index-1].epochDay+1)start=index;
      deterministic.set(row.origin,buildIndependentBenchmarks(prefix.slice(start),{asOf:row.origin,horizons:policy.horizons}));
    }
    const control=deterministic.get(row.origin).targets.find(value=>value.horizonDays===row.horizonDays);
    for(const model of ['flat','shrunkenTrend'])if(row.predictions[model]!=null)assert.equal(row.predictions[model],control[model],'Frozen deterministic control differs from its source-prefix replay');
  }
  const points=new Map(),failures=[],defaultReplay=[],fitDiagnostics=[];
  let successfulFits=0,simulationAttempts=0,successfulSimulations=0,completedDrawDays=0;
  const selected=[...required.values()].sort((a,b)=>a.origin.localeCompare(b.origin)||a.model.localeCompare(b.model));
  for(const {model,origin,horizons} of selected){
    let fit;
    try{
      fit=fits[model](ethHistory,origin);successfulFits++;
      assert.equal(fit.anchorPrice,prices.get(origin),'Fitted anchor differs from the source close');
      assert.equal(fit.training.informationThrough,origin);
      fitDiagnostics.push({model,origin,firstObservation:fit.training.firstObservation,informationThrough:fit.training.informationThrough,
        observations:fit.training.observations,returnCount:fit.training.classifiedReturns??fit.training.returnCount,
        initialization:fit.training.initialization??null});
    }catch(error){failures.push({model,origin,stage:'fit',reason:error.message});continue;}
    for(const sampleCount of policy.sampleCounts)for(const seed of policy.seeds){
      simulationAttempts++;
      try{
        const simulation=simulations[model](fit,{horizonDays,sampleCount,seed});
        const generated=[];
        for(const horizon of [...horizons].sort((a,b)=>a-b)){
          const value=simulation.path[horizon],point={origin,targetDate:value.date,horizonDays:horizon,median:value.baselinePrice,lower:value.low,upper:value.high};
          const frozen=selectedCases.get(origin+'|'+horizon);
          assert.equal(point.targetDate,frozen.targetDate);
          if(sampleCount===256&&seed===20261027){
            assert.equal(point.median,frozen.predictions[model],'Default median replay changed');
            const band=frozen.simulatedIntervals[model];
            if(band){assert.equal(point.lower,band.lower,'Default lower replay changed');assert.equal(point.upper,band.upper,'Default upper replay changed');}
            defaultReplay.push({model,origin,horizonDays:horizon,medianExact:true,intervalExact:band?true:null});
          }
          generated.push([pointKey(model,origin,sampleCount,seed,horizon),point]);
        }
        for(const [key,point] of generated)points.set(key,point);
        successfulSimulations++;completedDrawDays+=sampleCount*horizonDays;
      }catch(error){failures.push({model,origin,sampleCount,seed,stage:'simulation-or-default-replay',reason:error.message});}
    }
  }
  const rawReplicates=cohorts.flatMap(cohort=>policy.simulationModels.flatMap(model=>policy.sampleCounts.flatMap(sampleCount=>policy.seeds.map(seed=>({
    cohortId:cohort.id,model,sampleCount,seed,points:cohort.cases.map(row=>points.get(pointKey(model,row.origin,sampleCount,seed,cohort.horizonDays))??
      {origin:row.origin,targetDate:row.targetDate,horizonDays:cohort.horizonDays,unavailable:true}),
  })))));
  rawReplicates.push(...staticCommonCohortReplicates(cohorts));
  const result=failures.length?{status:'incomplete',reason:'Selected fit, simulation or replay failed; no seed or origin was removed'}:summarizeEthereumCommonPanel(cohorts,rawReplicates);
  // Inputs and numerical outputs occur once even when point/interval cohorts
  // share cases. Membership tables retain all links, including failed slots.
  const factoredCohorts=cohorts.map(({cases,excluded,...cohort})=>({...cohort,caseKeys:cases.map(identity),
    excluded:excluded.map(({origin,horizonDays,reasons})=>({caseKey:origin+'|'+horizonDays,reasons}))}));
  const simulationPoints=[...points].map(([key,point])=>{
    const [model,origin,sampleCount,seed,horizonDays]=key.split('|');
    return {key,model,caseKey:origin+'|'+horizonDays,sampleCount:Number(sampleCount),seed:Number(seed),
      median:point.median,lower:point.lower,upper:point.upper};
  });
  const panelMembership=rawReplicates.map(({points,...replicate})=>({...replicate,
    ...(policy.simulationModels.includes(replicate.model)?{
      pointKeys:points.map(point=>pointKey(replicate.model,point.origin,replicate.sampleCount,replicate.seed,point.horizonDays)),
      unavailablePointKeys:points.filter(point=>point.unavailable).map(point=>pointKey(replicate.model,point.origin,replicate.sampleCount,replicate.seed,point.horizonDays)),
    }:{caseKeys:points.map(identity),source:'selectedCases frozen control'})}));
  return {kind:'ethereum-common-cohort-research',asOf,policy,cohorts:factoredCohorts,
    selectedCases:[...selectedCases].map(([key,row])=>({key,...row})),simulationPoints,panelMembership,
    fitDiagnostics,defaultReplay,failures,result,
    runtime:{milliseconds:performance.now()-began,selectedUniqueOrigins:new Set(selected.map(value=>value.origin)).size,
      requiredFits:required.size,successfulFits,gaussianOriginFits:controls.size,simulationAttempts,successfulSimulations,
      plannedDrawDays,completedDrawDays,maximumLogMatrixBytes:(horizonDays+1)*Math.max(...policy.sampleCounts)*8,
      physicalMobileMeasurement:false},
    existingComparisonCasesPreserved:true,sourceOutcomeMatchingRequired:true,cohortsFixedBeforeSeedEvaluation:true,
    seedSelection:false,defaultModelChanged:false,defaultSeedChanged:false,existingIssuedRecordsChanged:false,
    prospectiveRecordsIssued:0,prospectiveScoredTargets:0,historicalVintagesVerified:false,calibratedForProduction:false,
    parameterUncertaintyIncluded:false,statisticalSignificanceClaim:false,productionPromoted:false,
    limitations:[
      'Point comparisons use the five-model intersection; interval comparisons separately use the three simulations plus Gaussian intersection. Each horizon has its own fixed cohort.',
      'Loss ranges and cross-seed combinations describe the declared numerical panel, not confidence intervals or independent market evidence.',
      'Identical seed numbers do not imply identical innovations across models. No common-random-number variance reduction is assumed.',
      'The original default output fixes availability before simulations. The selected cohort is not expanded or contracted after seeing seed performance.',
      'A complete numerical panel does not make the historical archive point-in-time authentic, preregister the research policy, or establish prospective superiority.',
      'Warm-start changes detector history, state classification and the estimation sample together. This experiment does not isolate a single component effect.',
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
      if(rel.startsWith('..')||isAbsolute(rel))throw new Error('Common-cohort dependency leaves the repository');
      await visit(rel);
    }
  }
  await visit('scripts/evaluate-ethereum-common-cohort.mjs');await visit('tests/ethereum-common-cohort.test.mjs');
  if(git('status','--porcelain','--',...Object.keys(sourceFiles),inputPath))throw new Error('Common-cohort evaluation requires committed source and inputs');
  const report=buildEthereumCommonCohortReport({ethHistory:JSON.parse(input),comparison,warmStart});
  report.provenance={sourceCommit,sourceTree,sourceFiles,inputSha256:{[inputPath]:sha(input)},
    comparisonSha256:sha(comparisonBytes),warmStartSha256:sha(warmBytes),executedAt:new Date().toISOString(),
    runId:process.env.GITHUB_RUN_ID??null,executionEnvironment:process.env.GITHUB_ACTIONS==='true'?'GitHub Actions':'Explicit Node invocation'};
  const output=resolve(root,'build/ethereum-common-cohort.json');await mkdir(dirname(output),{recursive:true});
  // Preserve all fields without indentation bytes in the bounded source book.
  const text=JSON.stringify(report);await writeFile(output,text+'\n');
  const {simulationPoints,selectedCases,panelMembership,fitDiagnostics,cohorts,...receipt}=report;
  console.log('ETH_COMMON_COHORT_RECEIPT '+JSON.stringify({...receipt,cohorts:cohorts.map(({excluded,...cohort})=>({...cohort,excludedCases:excluded.length})),
    storage:{selectedCases:selectedCases.length,simulationPoints:simulationPoints.length,panelMembership:panelMembership.length,
      fullReportBytes:Buffer.byteLength(text+'\n')}}));
  const size=20000,total=Math.ceil(text.length/size);
  for(let index=0;index<total;index++)console.log('ETH_COMMON_COHORT_CHUNK '+JSON.stringify({index,total,data:text.slice(index*size,(index+1)*size)}));
  if(report.result.status!=='complete')throw new Error('Incomplete common-cohort panel; inspect preserved failures');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
