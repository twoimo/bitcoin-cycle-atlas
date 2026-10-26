import { readdir, readFile, writeFile, rename, mkdir, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeFreshness, alignObservations, observationTiming } from '../dist/data-freshness.js';
import { createPublication, validatePublication, preparePublication, confirmPublication } from '../dist/publication-contract.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist');
const sha=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>JSON.stringify(canonical(value));
function canonical(value) {
  if (value===null || ['string','boolean'].includes(typeof value)) return value;
  if (typeof value==='number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  throw new TypeError('Publication metadata must contain only finite JSON values');
}
const gitHead=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
async function inventory(directory=dist,base=directory) {
  const files=[];
  for (const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
    const path=resolve(directory,entry.name), name=relative(base,path).split(sep).join('/');
    if (name==='publication.json' || name==='publication.json.tmp') continue;
    if (entry.isSymbolicLink()) throw new Error(`Public symlink is not allowed: ${name}`);
    if (entry.isDirectory()) files.push(...await inventory(path,base));
    else if (entry.isFile()) {const data=await readFile(path);files.push({path:name,bytes:data.byteLength,sha256:sha(data)});}
  }
  return files;
}
async function readJson(path) {return JSON.parse(await readFile(resolve(dist,path),'utf8'));}
function observedSeries(input) {
  const rows=input.prices || input.dailyHistory?.candles || input.candles || [];
  return rows.map(row=>Array.isArray(row)?row:[row.date.slice(0,10),row.close]);
}
export function publicationAsset(input,{symbol,role,sourcePath,market,outcome=null},now) {
  const prices=observedSeries(input), latest=prices.at(-1), meta=input.meta || {};
  if (!latest) throw new Error(`${symbol} has no completed observations`);
  const observedAt=meta.retrievedAt || input.dailyHistory?.retrievedAt || input.retrievedAt || null;
  const gaps=meta.missingDayCount || input.dailyHistory?.gapCount || meta.unavailableSessions?.length || meta.missingDates?.length || 0;
  return {id:role==='chart'?symbol:`comparison:${symbol}`,symbol,role,sourcePath,latestPrice:latest[1],observationCount:prices.length,
    source:meta.sourceName || input.source || null,sourceUrl:meta.source || null,priceDefinition:meta.priceDefinition || null,
    freshness:describeFreshness({latestDate:latest[0],market,observedAt,gaps,lastOutcome:outcome?.outcome || null,lastAttemptAt:outcome?.attemptedAt || null},now)};
}
async function assetInventory(now,outcomes) {
  const assets=[],series=[];
  for (const [symbol,file,market,step] of [
    ['BTCUSD','data/btc-daily.json','crypto','btc'],['ETHUSD','data/eth-ohlc.json','crypto','eth'],
    ['MSTR','data/mstr-ohlc.json','equity','equities'],['BMNR','data/bmnr-ohlc.json','equity','equities'],
  ]) {
    const input=await readJson(file),prices=observedSeries(input);
    const asset=publicationAsset(input,{symbol,role:'chart',sourcePath:file,market,outcome:outcomes[step]},now);
    assets.push(asset);series.push({symbol,market,prices,observedAt:asset.freshness.observedAt});
  }
  const comparison=await readJson('data/asset-comparison.json');
  for (const asset of comparison.assets) {
    // The enclosing bundle assembly time is not a provider collection time.
    assets.push(publicationAsset(asset,{symbol:asset.symbol,role:'comparison',sourcePath:'data/asset-comparison.json',market:asset.symbol==='BTC'?'crypto':'equity',outcome:outcomes.comparison},now));
  }
  const comparisonTime=series.map(item=>observationTiming(item.prices.at(-1)[0],item.market).eligibleAt).sort()[0];
  return {assets,alignment:alignObservations(series,comparisonTime,{mode:'reconstructed'})};
}
export function checkPublicationMetadata(manifest) {
  if (manifest?.schemaVersion!==1 || manifest?.kind!=='atlas-publication') throw new Error('Unsupported publication manifest');
  const {manifestSha256,...body}=manifest;
  if (sha(stable(body))!==manifestSha256) throw new Error('Publication metadata checksum mismatch');
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Publication file inventory is empty');
  const candidate=createPublication({sourceCommit:manifest.sourceCommit,digest:manifest.contentDigest});
  const verified=validatePublication(candidate,{checkedDigest:manifest.contentDigest,valid:true});
  const ready=preparePublication(verified,{currentCommit:manifest.sourceCommit,currentDigest:manifest.contentDigest});
  if (stable(ready)!==stable(manifest.state)) throw new Error('Publication state does not identify the validated artifact');
  const names=new Set();
  for (const file of manifest.files) {
    if (typeof file.path!=='string' || file.path.startsWith('/') || file.path.split('/').some(p=>!p || p==='.' || p==='..') || file.path.includes('\\') || names.has(file.path)) throw new Error('Unsafe or duplicate public file path');
    names.add(file.path);
    if (!Number.isSafeInteger(file.bytes) || file.bytes<0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid public file identity');
  }
  if (sha(stable(manifest.files))!==manifest.contentDigest) throw new Error('Publication inventory checksum mismatch');
  return manifest.files.length;
}
export async function checkPublication(manifest,{directory=dist}={}) {
  checkPublicationMetadata(manifest);
  const base=await realpath(directory);
  for (const file of manifest.files) {
    const path=resolve(directory,file.path);
    const physical=await realpath(path);
    if (!physical.startsWith(base+sep)) throw new Error(`Public path leaves its artifact: ${file.path}`);
    if (!(await lstat(path)).isFile()) throw new Error(`Not a regular public file: ${file.path}`);
    const data=await readFile(path);
    if (data.byteLength!==file.bytes || sha(data)!==file.sha256) throw new Error(`Published file checksum mismatch: ${file.path}`);
  }
  if (stable(await inventory(directory))!==stable(manifest.files)) throw new Error('Public directory changed after publication preparation');
  return manifest.files.length;
}
export async function verifyServedPublication({baseUrl,expectedManifest,expectedSource,fetchImpl=fetch}) {
  if (!/^[a-f0-9]{64}$/.test(expectedManifest) || !/^[a-f0-9]{40}$/.test(expectedSource)) throw new Error('Exact build manifest and source identities are required');
  const base=new URL(baseUrl);
  if (base.protocol!=='https:' && !(base.protocol==='http:' && base.hostname==='127.0.0.1')) throw new Error('Expected a public HTTPS site');
  const response=await fetchImpl(new URL('publication.json',base),{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Public manifest HTTP ${response.status}`);
  const text=await response.text();if(text.length>2_000_000)throw new Error('Public manifest size limit exceeded');
  const remote=JSON.parse(text);checkPublicationMetadata(remote);
  if (remote.manifestSha256!==expectedManifest || remote.sourceCommit!==expectedSource) throw new Error('Served publication metadata differs from the validated build');
  if (remote.sourceTree?.status!=='clean') throw new Error('A local preview cannot be confirmed as a committed publication');
  const confirmed=confirmPublication(remote.state,{servedCommit:remote.sourceCommit,servedDigest:remote.contentDigest});
  if (confirmed.phase!=='confirmed') throw new Error(confirmed.reason);
  const verified=[];
  for (const name of ['index.html','site-entry.js','data/btc-daily.json','data/forecast-ledger/index.json']) {
    const file=remote.files.find(file=>file.path===name);if(!file)throw new Error(`Critical public file absent: ${name}`);
    const res=await fetchImpl(new URL(name,base),{cache:'no-store',signal:AbortSignal.timeout(30000)});
    if (!res.ok || sha(Buffer.from(await res.arrayBuffer()))!==file.sha256) throw new Error(`Served file differs: ${name}`);
    verified.push(name);
  }
  return {status:'PASS',scope:'Public manifest identity and four critical HTTP file bodies; other remote files are not fetched',sourceCommit:remote.sourceCommit,manifestSha256:remote.manifestSha256,verified,state:confirmed};
}
async function main() {
  if (process.argv.includes('--check')) {
    const manifest=await readJson('publication.json');
    const checkedFiles=await checkPublication(manifest);
    console.log(JSON.stringify({status:'PASS',sourceCommit:manifest.sourceCommit,checkedFiles,contentDigest:manifest.contentDigest}));return;
  }
  const verifyIndex=process.argv.indexOf('--verify-url');
  if (verifyIndex>=0) {
    const option=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null;};
    let expectedManifest=option('--expected-manifest'),expectedSource=option('--expected-source'),localFilesChecked=null;
    if (!expectedManifest && !expectedSource) {
      const local=await readJson('publication.json');localFilesChecked=await checkPublication(local);
      expectedManifest=local.manifestSha256;expectedSource=local.sourceCommit;
    }
    const result=await verifyServedPublication({baseUrl:process.argv[verifyIndex+1],expectedManifest,expectedSource});
    console.log(JSON.stringify({...result,localFilesChecked}));return;
  }
  const sourceCommit=gitHead(), now=new Date().toISOString();
  const dirty=execFileSync('git',['status','--porcelain','--untracked-files=all','--','dist','scripts','package.json'],{cwd:root,encoding:'utf8'}).trim();
  if (dirty && !process.argv.includes('--preview')) throw new Error('Commit publishable sources before preparing a release, or use --preview for local checks');
  const outcomes=process.env.ATLAS_REFRESH_OUTCOMES ? JSON.parse(process.env.ATLAS_REFRESH_OUTCOMES) : {};
  const files=await inventory(), contentDigest=sha(stable(files));
  let state=createPublication({sourceCommit,digest:contentDigest});
  const data=await assetInventory(now,outcomes);
  state=validatePublication(state,{checkedDigest:sha(stable(await inventory())),valid:true});
  state=preparePublication(state,{currentCommit:gitHead(),currentDigest:sha(stable(await inventory()))});
  if (state.phase!=='ready') throw new Error(`Publication is ${state.phase}: ${state.reason}`);
  const body={schemaVersion:1,kind:'atlas-publication',sourceCommit,sourceTree:{status:dirty?'modified-preview':'clean',scope:'dist, scripts and package.json'},eventCommit:process.env.GITHUB_SHA || null,
    checkedOutCommit:process.env.ATLAS_CHECKOUT_SHA || sourceCommit,generatedAt:now,
    workflow:{runId:process.env.GITHUB_RUN_ID || null,attempt:process.env.GITHUB_RUN_ATTEMPT || null},refreshAttempts:outcomes,
    contentDigest,files,...data,state,scope:'Prepared artifact identities; generatedAt is not a provider publication or successful deployment timestamp'};
  const manifest={...body,manifestSha256:sha(stable(body))};
  await checkPublication(manifest);
  await mkdir(dist,{recursive:true});
  await writeFile(resolve(dist,'publication.json.tmp'),JSON.stringify(manifest)+'\n');
  await rename(resolve(dist,'publication.json.tmp'),resolve(dist,'publication.json'));
  console.log(JSON.stringify({status:'PASS',sourceCommit,files:files.length,assets:data.assets.length,contentDigest,manifestSha256:manifest.manifestSha256}));
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
