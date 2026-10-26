import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runEthereumModelComparison} from '../dist/ethereum-model-comparison.js';
import {runEthereumEconomicAblations} from '../dist/ethereum-economic-ablation.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=text=>createHash('sha256').update(text).digest('hex');
export async function evaluateEthereumModels({repositoryRoot=root,output=null}={}) {
  const ethText=await readFile(resolve(repositoryRoot,'dist/data/eth-ohlc.json'),'utf8');
  const btcText=await readFile(resolve(repositoryRoot,'dist/data/btc-daily.json'),'utf8');
  const ethHistory=JSON.parse(ethText),btcHistory=JSON.parse(btcText);
  const ethLast=ethHistory.dailyHistory.candles.at(-1).date.slice(0,10);
  const btcLast=btcHistory.prices.at(-1)[0];
  const asOf=ethLast<btcLast?ethLast:btcLast;
  const sourceFiles={},visited=new Set();
  async function visit(path){
    if(visited.has(path))return;
    visited.add(path);
    const text=await readFile(resolve(repositoryRoot,path),'utf8');sourceFiles[path]=digest(text);
    for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const dependency=resolve(dirname(resolve(repositoryRoot,path)),match[1].split('?')[0]);
      const relative=dependency.slice(repositoryRoot.length+1);
      if(!dependency.startsWith(repositoryRoot+'/'))throw new Error('Source dependency leaves the repository');
      await visit(relative);
    }
  }
  await visit('dist/ethereum-model-comparison.js');
  await visit('scripts/evaluate-ethereum-models.mjs');
  await visit('scripts/verify-eth-candidate-browser.mjs');
  await visit('tests/ethereum-economic-ablation.test.mjs');
  for(const path of ['dist/eth-view.js','dist/eth-view.css','dist/intraday-chart.js','dist/equity-forecast-chart.js','tests/equity-chart-rendering.test.mjs','tests/ethereum-forecast.test.mjs']) await visit(path);
  for(const path of ['tests/ethereum-cycle-models.test.mjs','tests/ethereum-economic-model.test.mjs','tests/ethereum-model-comparison.test.mjs','tests/ethereum-forecast-boundary.test.mjs']) await visit(path);
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8'}).trim();
  const sourceTree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repositoryRoot,encoding:'utf8'}).trim();
  const dirty=execFileSync('git',['status','--porcelain','--',...Object.keys(sourceFiles),'dist/data/eth-ohlc.json','dist/data/btc-daily.json'],{cwd:repositoryRoot,encoding:'utf8'}).trim();
  if(dirty)throw new Error('Comparison must identify committed candidate source and observed input bytes');
  const report=runEthereumModelComparison({ethHistory,btcHistory,economicSnapshots:[]},{asOf});
  const ablation=runEthereumEconomicAblations({ethRows:[],btcRows:[],economicSnapshots:[],asOf,origins:report.origins.map(row=>row.origin)});
  report.provenance={sourceCommit,sourceTree,sourceFiles,inputSha256:{'dist/data/eth-ohlc.json':digest(ethText),'dist/data/btc-daily.json':digest(btcText)},executedAt:new Date().toISOString(),
    executionEnvironment:process.env.GITHUB_ACTIONS==='true'?'GitHub Actions':'Explicit Node invocation',runId:process.env.GITHUB_RUN_ID??null,externalModelReview:null};
  if(output){
    await mkdir(dirname(output),{recursive:true});
    const bundlePaths=[...new Set([...Object.keys(sourceFiles),
      'tests/ethereum-cycle-models.test.mjs','tests/ethereum-economic-model.test.mjs',
      'tests/ethereum-model-comparison.test.mjs','tests/ethereum-forecast-boundary.test.mjs',
      'docs/ETH_MODEL_COMPARISON.md','docs/ETH_ECONOMIC_SOURCE_REVIEW.md','docs/ETH_CANDIDATE_REVIEW.md','.github/workflows/eth-model-evaluation.yml',
      'dist/data/eth-ohlc.json','dist/data/btc-daily.json'])].sort();
    const entries=[],parts=['Ethereum candidate review source book\nSource commit: '+sourceCommit+'\nNo Gemini review has been performed.\n'];
    for(const path of bundlePaths){
      const body=await readFile(resolve(repositoryRoot,path));
      const sha256=digest(body),bytes=body.length;
      entries.push({path,sha256,bytes});
      parts.push('\nBEGIN FILE '+path+'\nUTF8_BYTES '+bytes+'\nSHA256 '+sha256+'\n\n'+body.toString('utf8')+'\nEND FILE '+path+'\n');
    }
    const bundle=parts.join(''),bundleSha256=digest(bundle);
    const manifest={sourceCommit,bundleSha256,bundleBytes:Buffer.byteLength(bundle),entries,scope:'Complete dependency closure, focused tests, review contract, workflow and exact current stored price files; external review pending'};
    await writeFile(resolve(dirname(output),'eth-review-source-bundle.txt'),bundle);
    await writeFile(resolve(dirname(output),'eth-review-source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    report.provenance.reviewSourceBundle={sha256:bundleSha256,bytes:manifest.bundleBytes,files:entries.length};
    await writeFile(output,JSON.stringify(report,null,2)+'\n');
    ablation.provenance={sourceCommit,sourceTree,inputSha256:report.provenance.inputSha256,executedAt:report.provenance.executedAt,sourceFiles};
    await writeFile(resolve(dirname(output),'ethereum-economic-ablation.json'),JSON.stringify(ablation,null,2)+'\n');
    process.stdout.write('ETH_ABLATION_RECEIPT '+JSON.stringify({kind:ablation.kind,status:ablation.status,sourceCommit,asOf,economicSnapshotsProvided:ablation.economicSnapshotsProvided,uniqueOrigins:ablation.uniqueOrigins,prospectiveScoredTargets:ablation.prospectiveScoredTargets,summaries:ablation.summaries,limitations:ablation.limitations})+'\n');
  }
  return report;
}
export function compactEthereumReport(report){
  return {kind:report.kind,asOf:report.asOf,sourceCommit:report.provenance.sourceCommit,sourceTree:report.provenance.sourceTree,executedAt:report.provenance.executedAt,runId:report.provenance.runId,inputSha256:report.provenance.inputSha256,
    uniqueOrigins:report.uniqueOrigins,maturedTargets:report.maturedTargets,prospectiveScoredTargets:report.prospectiveScoredTargets,
    historicalVintagesAvailable:report.data.historicalVintagesAvailable,discardedEarlyEthObservations:report.data.discardedEarlyEthObservations,
    economicSnapshotCount:report.data.economicSnapshotCount,common:report.common,pairwise:report.pairwise.filter(p=>!['flat','shrunkenTrend','btcLinked'].includes(p.left)&&!['flat','shrunkenTrend','btcLinked'].includes(p.right)),
    summaries:report.summaries.map(s=>({model:s.model,horizonDays:s.horizonDays,availableOrigins:s.availableOrigins,completedOutcomes:s.completedOutcomes,
      disjointTargetIntervals:s.disjointTargetIntervals,meanAbsoluteLogError:s.disjoint.meanAbsoluteLogError,directionAccuracy:s.disjoint.directionAccuracy,
      directionalCallCoverage:s.disjoint.directionalCallCoverage,directionAccuracyAmongDirectionalCalls:s.disjoint.directionAccuracyAmongDirectionalCalls,
      pairedBaselines:Object.fromEntries(Object.entries(s.pairedBaselines).map(([id,p])=>[id,{n:p.disjointCases,skill:p.skill,candidateError:p.candidateMeanAbsoluteLogError,baselineError:p.baselineMeanAbsoluteLogError}])),
      interval:s.experimentalInterval})),
    current:Object.fromEntries(Object.entries(report.current.candidates).map(([id,c])=>[id,{status:c.status,reason:c.reason??null,predictions:c.predictions,assumptions:c.assumptions??null}])),
    reviewSourceBundle:report.provenance.reviewSourceBundle,
    relativeStrength:{target:report.relativeStrength.target,unit:report.relativeStrength.unit,summaries:report.relativeStrength.summaries.map(s=>({model:s.model,horizonDays:s.horizonDays,availableOrigins:s.availableOrigins,completedOutcomes:s.completedOutcomes,disjointCases:s.disjointTargetIntervals,meanAbsoluteLogError:s.disjoint.meanAbsoluteLogError})),pairwise:report.relativeStrength.pairwise,scope:report.relativeStrength.scope},
    adoption:report.adoption,scope:report.scope};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const output=resolve(root,'build/ethereum-model-comparison.json');
  const report=await evaluateEthereumModels({output});
  process.stdout.write('ETH_COMPARISON_RECEIPT '+JSON.stringify(compactEthereumReport(report))+'\n');
}
