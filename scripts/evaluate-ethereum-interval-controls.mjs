import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {buildEthereumGaussianIntervalBenchmark,evaluateEthereumGaussianIntervalBenchmark} from '../dist/ethereum-interval-benchmark.js';

export function buildEthereumIntervalControlReport({ethHistory,comparison}={}){
  if(comparison?.kind!=='ethereum-candidate-comparison'||!Array.isArray(comparison.cases))throw new TypeError('An actual ETH comparison report is required');
  const {asOf}=comparison;
  const result=evaluateEthereumGaussianIntervalBenchmark({ethHistory,cases:comparison.cases,asOf});
  const empiricalControls=comparison.intervalComparisons.filter(row=>row.left.kind==='simulated'&&
    ['adaptiveEth','pooledEth'].includes(row.left.model)&&row.right.kind==='experimental'&&['flat','shrunkenTrend'].includes(row.right.model));
  if(empiricalControls.length!==12)throw new Error('All twelve same-origin empirical baseline comparisons must be present');
  return {kind:'ethereum-interval-controls',asOf,gaussian:result,empiricalControls,
    currentGaussianControl:buildEthereumGaussianIntervalBenchmark({ethHistory,asOf}),
    economicSnapshotReadiness:comparison.data.economicSnapshotReadiness,
    legacyPriceModelsChanged:false,priorForecastsReissued:false,calibratedForProduction:false,
    historicalVintagesVerified:false,productionPromoted:false,
    interpretation:'Compare candidate uncertainty with both a fixed Gaussian log-random-walk control and originally issued empirical-error baseline bands. Each pair has its own common-origin set; no ranking across unmatched samples.',
    limitations:[
      'The Gaussian 180-return window and 80% nominal mass are fixed controls, not claims that ETH returns are normal or independent.',
      'A raw simulation or empirical-error band can fail nominal coverage; proper interval score penalizes both excess width and misses.',
      'Log-space and USD-space scores target different loss coordinates and must not be silently interchanged.',
      'All historical data use the currently retained archive; this does not authenticate historical vintages or prospective accuracy.',
      'Model parameters and their uncertainty were not changed or calibrated by this comparison.',
    ]};
}

async function main(){
  const root=fileURLToPath(new URL('..',import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
  const inputPath='dist/data/eth-ohlc.json',input=await readFile(resolve(root,inputPath));
  const comparisonText=await readFile(resolve(root,'build/ethereum-model-comparison.json'));
  const comparison=JSON.parse(comparisonText);
  assert.equal(comparison.provenance.sourceCommit,sourceCommit);assert.equal(comparison.provenance.sourceTree,sourceTree);
  assert.equal(comparison.provenance.inputSha256[inputPath],sha(input));
  const sourceFiles={},visited=new Set();
  async function visit(path){
    if(visited.has(path))return;visited.add(path);
    const bytes=await readFile(resolve(root,path)),text=bytes.toString('utf8');sourceFiles[path]=sha(bytes);
    for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const file=resolve(dirname(resolve(root,path)),match[1].split('?')[0]);
      if(!file.startsWith(root))throw new Error('Interval-control dependency leaves the repository');
      await visit(file.slice(root.length));
    }
  }
  await visit('scripts/evaluate-ethereum-interval-controls.mjs');
  await visit('tests/ethereum-interval-benchmark.test.mjs');
  if(git('status','--porcelain','--',...Object.keys(sourceFiles),inputPath))throw new Error('Interval controls require committed source and inputs');
  const start=performance.now(),report=buildEthereumIntervalControlReport({ethHistory:JSON.parse(input),comparison});
  report.provenance={sourceCommit,sourceTree,sourceFiles,inputSha256:{[inputPath]:sha(input)},
    comparisonSha256:sha(comparisonText),executedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null,
    executionEnvironment:process.env.GITHUB_ACTIONS==='true'?'GitHub Actions':'Explicit Node invocation'};
  report.runtime={elapsedMs:performance.now()-start,fitCount:report.gaussian.fitCount,physicalMobileMeasurement:false};
  const output=resolve(root,'build/ethereum-interval-controls.json');await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  const {cases,excluded,...gaussian}=report.gaussian;
  console.log('ETH_INTERVAL_CONTROLS_RECEIPT '+JSON.stringify({...report,gaussian:{...gaussian,caseCount:cases.length,excludedCount:excluded.length}}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
