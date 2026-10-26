import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildEthReviewPacket} from './build-eth-review-packet.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const scope=JSON.parse(await readFile(resolve(root,'research-data/eth-review-scope.json'),'utf8'));
const evidencePaths=[
  'build/ethereum-model-comparison.json',
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
await addFiles('build/asset-forecast-ledger',{filter:path=>path.endsWith('.json')});
await addFiles('build/asset-outcome-ledger',{filter:path=>path.endsWith('.json')});
const manifest=await buildEthReviewPacket({
  repositoryRoot:root,outputDirectory:'build/eth-review-packet',
  baselineCommit:scope.baselineCommit,seedPaths:scope.seedPaths,
  dynamicResolutions:scope.dynamicResolutions,evidencePaths,
  maximumBundleBytes:50000000,
});
await writeFile(resolve(root,'build/eth-review-packet/scope-notes.txt'),scope.scope+'\nScreenshots remain in the separately preserved browser artifact; report.json binds their filenames and hashes. Parsed duplicate economic rows are omitted because the exact CSV and acquisition/coverage receipts are present.\n');
console.log('ETH_REVIEW_MANIFEST '+JSON.stringify(manifest));
if(manifest.sourceAccess!=='complete-for-declared-scope')throw new Error('SOURCE_MISSING: inspect unresolved imports before external review');
