import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildEthReviewPacket} from './build-eth-review-packet.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const scope=JSON.parse(await readFile(resolve(root,'research-data/eth-review-scope.json'),'utf8'));
const evidencePaths=[
  'build/ethereum-model-comparison.json',
  'build/ethereum-adaptive-research.json',
  'build/ethereum-pooled-research.json',
  'build/ethereum-monte-carlo-stability.json',
  'build/ethereum-model-readiness.json',
  'build/ethereum-source-timing.json',
  'build/ethereum-interval-controls.json',
  'build/ethereum-warm-start.json',
  'build/ethereum-common-cohort.json',
  'build/ethereum-economic-evidence-coverage.json',
  'build/ethereum-independent-calibration.json',
  'build/ethereum-prospective-calibration-readiness.json',
  'build/ethereum-prospective-capacity.json',
  'build/ethereum-supply-resolution.json',
  'build/ethereum-economic-ablation.json',
  'build/eth-browser/report.json',
];
async function addFiles(directory,{filter=()=>true}={}){
  for(const entry of await readdir(resolve(root,directory),{withFileTypes:true})){
    const path=directory+'/'+entry.name;
    if(entry.isDirectory())await addFiles(path,{filter});
    else if(entry.isFile()&&filter(path))evidencePaths.push(path);
    else if(!entry.isFile())throw new Error('Unexpected non-regular review evidence: '+path);
  }
}
await addFiles('build/ethereum-economic-data',{filter:path=>!path.endsWith('/capture.json')});
await addFiles('build/ethereum-throughput-supplement');
await addFiles('build/ethereum-pow-zero');
await addFiles('build/ethereum-economic-vintages');
await addFiles('build/ethereum-supply-accounting');
await addFiles('build/ethereum-staking-cohort');
await addFiles('build/ethereum-prospective-ledger');
await addFiles('build/asset-forecast-ledger',{filter:path=>path.endsWith('.json')});
await addFiles('build/asset-outcome-ledger',{filter:path=>path.endsWith('.json')});
const manifest=await buildEthReviewPacket({
  repositoryRoot:root,outputDirectory:'build/eth-review-packet',
  baselineCommit:scope.baselineCommit,seedPaths:scope.seedPaths,
  dynamicResolutions:scope.dynamicResolutions,evidencePaths,
  // 47f2ae58 retained 64,037,165 bytes. The next declared scope also includes
  // the preserved 801,491-byte supply history and its acquisition receipt,
  // fixed-cohort raw state captures, and the new capacity/validation sources.
  // Preserve those exact inputs inside a finite 70 MB resource budget.
  // This byte budget does not change model, sample-size or release conditions.
  maximumBundleBytes:70000000,
});
await writeFile(resolve(root,'build/eth-review-packet/scope-notes.txt'),scope.scope+'\nScreenshots remain in the separately preserved browser artifact; report.json binds their filenames and hashes. Parsed duplicate economic rows are omitted because the exact CSV and acquisition/coverage receipts are present.\n');
console.log('ETH_REVIEW_MANIFEST '+JSON.stringify(manifest));
if(manifest.sourceAccess!=='complete-for-declared-scope')throw new Error('SOURCE_MISSING: inspect unresolved imports before external review');
