import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
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
  'build/ethereum-prospective-archive-restore.json',
  'build/ethereum-prospective-archive-remote-receipt.json',
  'build/ethereum-prospective-archive-append.json',
  'build/ethereum-prospective-archive-verify.json',
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
await addFiles('build/ethereum-prospective-archive-outcomes');
// The archive's immutable pages bind its full file inventory. Include every
// object whose exact bytes are not already represented in the committed seed
// or current evidence, including older mutable-run checkpoints after restore.
await addFiles('build/ethereum-prospective-archive',{filter:path=>!path.includes('/objects/')});
await addFiles('build/asset-forecast-ledger',{filter:path=>path.endsWith('.json')});
await addFiles('build/asset-outcome-ledger',{filter:path=>path.endsWith('.json')});
const representedHashes=new Set();
for(const path of [...scope.seedPaths,...evidencePaths])
  representedHashes.add(createHash('sha256').update(await readFile(resolve(root,path))).digest('hex'));
for(const entry of await readdir(resolve(root,'build/ethereum-prospective-archive/objects'),{withFileTypes:true})){
  if(!entry.isFile()||!/^[a-f0-9]{64}\.blob$/.test(entry.name))throw new Error('Unexpected archive review object');
  const path='build/ethereum-prospective-archive/objects/'+entry.name;
  const digest=createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
  if(entry.name!==digest+'.blob')throw new Error('Archive object filename differs from its actual bytes');
  if(!representedHashes.has(digest)){evidencePaths.push(path);representedHashes.add(digest);}
}
const manifest=await buildEthReviewPacket({
  repositoryRoot:root,outputDirectory:'build/eth-review-packet',
  baselineCommit:scope.baselineCommit,seedPaths:scope.seedPaths,
  dynamicResolutions:scope.dynamicResolutions,evidencePaths,
  // 15b5f651 retained 65,085,434 bytes. This declared scope also includes the
  // committed immutable archive, previously omitted acquisition vintages,
  // separate restored ETH outcomes, append/restore receipts, and source tests.
  // Preserve those exact inputs inside a finite 85 MB resource budget.
  // This byte budget does not change model, sample-size or release conditions.
  maximumBundleBytes:85000000,
});
await writeFile(resolve(root,'build/eth-review-packet/scope-notes.txt'),scope.scope+'\nScreenshots remain in the separately preserved browser artifact; report.json binds their filenames and hashes. Parsed duplicate economic rows are omitted because the exact CSV and acquisition/coverage receipts are present.\n');
console.log('ETH_REVIEW_MANIFEST '+JSON.stringify(manifest));
if(manifest.sourceAccess!=='complete-for-declared-scope')throw new Error('SOURCE_MISSING: inspect unresolved imports before external review');
