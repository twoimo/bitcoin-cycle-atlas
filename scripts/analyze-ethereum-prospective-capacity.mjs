import {readFile,readdir,lstat,realpath,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp} from '../dist/forecast-information-time.js';
import {ETH_PROSPECTIVE_PRICE_POLICY} from '../dist/ethereum-prospective-prices.js';
import {readEthereumCalibrationInputs} from './build-ethereum-prospective-calibration-readiness.mjs';
import {projectEthereumProspectiveCapacity} from './ethereum-prospective-capacity-core.mjs';

const json=canonicalForecastJson,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SOURCES=['scripts/analyze-ethereum-prospective-capacity.mjs','scripts/ethereum-prospective-capacity-core.mjs',
  'scripts/ethereum-prospective-calibration-core.mjs','scripts/build-ethereum-prospective-calibration-readiness.mjs',
  'scripts/ethereum-prospective-base.mjs','scripts/issue-ethereum-prospective.mjs',
  'scripts/ethereum-prospective-collector-core.mjs','scripts/evaluate-asset-forecasts.mjs',
  'dist/ethereum-prospective-prices.js','dist/ethereum-prospective-records.js',
  'dist/ethereum-prospective-dispatch.js','dist/asset-outcome-records.js'];

/** Actual raw ledger verification precedes metadata-only capacity arithmetic.
 * This local-byte receipt does not claim a remote Git commit or historical
 * authenticity. No network, issuance, archive deletion or cap change occurs. */
export async function buildEthereumProspectiveCapacityReport({repositoryRoot,informationCutoffAt}={}){
  if(typeof repositoryRoot!=='string'||!isAbsolute(repositoryRoot))throw new TypeError('Absolute repository root required');
  const root=await realpath(repositoryRoot),cutoff=normalizeForecastTimestamp(informationCutoffAt);
  const input=await readEthereumCalibrationInputs({repositoryRoot:root}),sourceFiles={},workflowSources=[];
  async function source(path,maximumBytes){
    const file=resolve(root,path),info=await lstat(file),actual=await realpath(file),location=relative(root,actual);
    if(!info.isFile()||info.isSymbolicLink()||location.startsWith('..')||isAbsolute(location)||info.size>maximumBytes)
      throw new Error('Capacity source must be a bounded regular file inside the repository');
    const bytes=await readFile(actual);
    if(bytes.length>maximumBytes)throw new Error('Capacity source exceeds byte limit');
    const text=bytes.toString('utf8');
    if(!Buffer.from(text,'utf8').equals(bytes))throw new Error('Capacity source is not lossless UTF-8');
    sourceFiles[path]={bytes:bytes.length,sha256:sha(bytes)};return text;
  }
  const baseText=await source(ETH_PROSPECTIVE_PRICE_POLICY.basePath,ETH_PROSPECTIVE_PRICE_POLICY.maximumBaseBytes);
  const names=(await readdir(resolve(root,'.github/workflows'),{withFileTypes:true})).filter(value=>/\.ya?ml$/.test(value.name));
  if(names.length>100)throw new Error('Too many workflow sources for bounded capacity inspection');
  for(const entry of names.sort((a,b)=>a.name.localeCompare(b.name))){
    if(!entry.isFile()||!/^[a-zA-Z0-9._-]+\.ya?ml$/.test(entry.name))throw new Error('Invalid workflow source path');
    const path='.github/workflows/'+entry.name;
    workflowSources.push({path,text:await source(path,256*1024)});
  }
  for(const path of SOURCES)await source(path,512*1024);
  const diagnostic=projectEthereumProspectiveCapacity({records:input.records,observations:input.observations,baseText,
    informationCutoffAt:cutoff,workflowSources});
  const body={schemaVersion:1,kind:'ethereum-prospective-capacity-report',informationCutoffAt:cutoff,
    inputFiles:input.inputFiles,directories:input.directories,sourceFiles,
    inputValidation:'Exact index metadata, immutable IDs, preserved raw snapshots and merged bounds verified by readEthereumCalibrationInputs',
    sourceIdentityScope:'SHA-256 of actual local source bytes. A remote commit/tree is not inferred from this report.',
    diagnostic,networkRequests:0,actualNewRecords:0,actualNewObservations:0,releaseAuthorized:false,
    limitation:'Structural raw-input validation is separate from provider authenticity, durable previous-run retention and future collection. Hypothetical capacity dates are not promised availability dates.'};
  return {id:await forecastHash(body),...body};
}

async function main(){
  const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),informationCutoffAt=new Date().toISOString();
  const report=await buildEthereumProspectiveCapacityReport({repositoryRoot,informationCutoffAt});
  const path=resolve(repositoryRoot,'build/ethereum-prospective-capacity.json');
  await mkdir(dirname(path),{recursive:true});await writeFile(path,json(report)+'\n');
  console.log('ETH_PROSPECTIVE_CAPACITY_RECEIPT '+json({id:report.id,informationCutoffAt,
    records:report.diagnostic.inventory.records,observations:report.diagnostic.inventory.observations,
    calendars:report.diagnostic.calendars.length,actualNewRecords:0,releaseAuthorized:false,
    output:'build/ethereum-prospective-capacity.json'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error=>{console.error(error.stack??String(error));process.exitCode=1;});
