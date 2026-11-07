import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {CLOUDFLARE_BUILD_UUID} from './ethereum-archive-provider-identity.mjs';

export const MARKET_REFRESH_REPOSITORY='twoimo/bitcoin-cycle-atlas';
export const MARKET_REFRESH_REMOTE='https://github.com/twoimo/bitcoin-cycle-atlas.git';
export const MARKET_REFRESH_RECEIPT_PATH='dist/data/refresh-attempts.json';
export const MARKET_REFRESH_PROVIDER_IDS=Object.freeze(['btc','cycle','ohlc','volume','eth','equities','comparison']);
export const MARKET_REFRESH_GATE_IDS=Object.freeze(['comparison-validation','judgment-capture','research','forecast-build','forecast-verification','tests','formal','cycle','performance','static']);
export const MARKET_REFRESH_MUTABLE_PATHS=Object.freeze([
  'dist/data/btc-daily.json','dist/data-update.js','dist/data/btc-ohlc.json','dist/data/btc-volume.json',
  'dist/data/cycle-calibration.json','dist/data/eth-ohlc.json','dist/data/mstr-ohlc.json','dist/data/bmnr-ohlc.json',
  'dist/data/asset-comparison.json','dist/treasury-catalog.js','dist/data/judgment-snapshots/index.json',
  'dist/data/forecast-ledger/index.json','dist/data/forecast-ledger/evaluation.json','dist/data/forecast-ledger/experiments.json',
]);
const mutable=new Set(MARKET_REFRESH_MUTABLE_PATHS),sha=/^[a-f0-9]{64}$/,commit=/^[a-f0-9]{40}$/;
const immutable=/^dist\/data\/(?:judgment-snapshots\/\d{4}-\d{2}-\d{2}T\d{9}Z-[a-f0-9]{12}|forecast-ledger\/(?:records|snapshots)\/[a-f0-9]{64})\.json$/;
export const isImmutableMarketRefreshPath=path=>immutable.test(path);
export const isMarketRefreshPath=path=>mutable.has(path)||immutable.test(path)||path===MARKET_REFRESH_RECEIPT_PATH;
export const refreshSha256=value=>createHash('sha256').update(value).digest('hex');
export const marketRefreshReceiptBytes=value=>Buffer.from(canonicalForecastJson(value)+'\n');
const exact=(value,keys,label)=>assert.deepEqual(Object.keys(value??{}).sort(),[...keys].sort(),'Unexpected '+label+' fields');
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

export function assertMarketRefreshReceipt(value) {
  exact(value,['schemaVersion','kind','status','provider','repository','branch','baseSourceCommit','baseSourceTree','buildId','triggerId','eventName','startedAt','completedAt','attempts','gates','files'],'refresh receipt');
  assert.equal(value.schemaVersion,1);assert.equal(value.kind,'atlas-market-refresh');assert.equal(value.status,'VALIDATED');
  assert.equal(value.provider,'cloudflare-workers-builds');assert.equal(value.repository,MARKET_REFRESH_REPOSITORY);assert.equal(value.branch,'main');
  for(const name of ['baseSourceCommit','baseSourceTree'])assert.match(value[name]??'',commit,'Exact base source identity is required');
  for(const name of ['buildId','triggerId'])assert.match(value[name]??'',CLOUDFLARE_BUILD_UUID,'Actual Cloudflare UUID is required');
  assert.ok(['deploy_hook','manual','api'].includes(value.eventName),'Only authenticated scheduled/manual refresh builds may collect data');
  assert.ok(timestamp(value.startedAt)&&timestamp(value.completedAt)&&value.completedAt>=value.startedAt,'Actual refresh execution clocks are required');
  exact(value.attempts,MARKET_REFRESH_PROVIDER_IDS,'provider attempts');
  let previous=value.startedAt;
  for(const name of MARKET_REFRESH_PROVIDER_IDS){
    const attempt=value.attempts[name];exact(attempt,['outcome','attemptedAt','completedAt','retainedPrevious','logSha256'],'provider attempt');
    assert.ok(['success','failure'].includes(attempt.outcome),'Every provider must actually finish before a refresh is committed');
    if(name==='btc'||name==='cycle')assert.equal(attempt.outcome,'success','Required provider failed: '+name);
    assert.ok(timestamp(attempt.attemptedAt)&&timestamp(attempt.completedAt)&&attempt.attemptedAt>=previous&&attempt.completedAt>=attempt.attemptedAt&&attempt.completedAt<=value.completedAt,'Provider execution clock/order mismatch: '+name);
    assert.equal(attempt.retainedPrevious,attempt.outcome==='failure','A failed optional provider must retain its exact previous bytes');
    assert.match(attempt.logSha256??'',sha);previous=attempt.completedAt;
  }
  assert.deepEqual(value.gates?.map(gate=>gate.id),MARKET_REFRESH_GATE_IDS,'All original refresh gates must be recorded in order');
  for(const gate of value.gates){
    exact(gate,['id','status','durationMs','logSha256'],'refresh gate');
    const skipped=gate.id==='judgment-capture'&&value.attempts.comparison.outcome==='failure';
    assert.equal(gate.status,skipped?'skipped':'success','Incomplete refresh verification gate: '+gate.id);
    assert.ok(Number.isFinite(gate.durationMs)&&gate.durationMs>=0);assert.match(gate.logSha256??'',sha);
  }
  assert.ok(Array.isArray(value.files)&&value.files.length>=MARKET_REFRESH_MUTABLE_PATHS.length&&value.files.length<=2048,'Bounded exact refreshed-file inventory is required');
  assert.deepEqual(value.files.map(file=>file.path),[...new Set(value.files.map(file=>file.path))].sort(),'Refreshed files must be unique and sorted');
  for(const file of value.files){
    exact(file,['path','sha256','bytes'],'refreshed file');
    assert.ok((mutable.has(file.path)||immutable.test(file.path))&&file.path!==MARKET_REFRESH_RECEIPT_PATH,'Unreviewed refresh output path');
    assert.match(file.sha256??'',sha);assert.ok(Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=64*1024*1024);
  }
  for(const path of MARKET_REFRESH_MUTABLE_PATHS)assert.ok(value.files.some(file=>file.path===path),'Missing refreshed source binding: '+path);
  assert.ok(marketRefreshReceiptBytes(value).length<=512*1024,'Refresh receipt exceeds its byte budget');
  return value;
}

/** Collectors, validators and anonymous Git reads never inherit write secrets,
 * clone authentication hooks, tracing or arbitrary Git configuration overrides. */
export function marketRefreshCommandEnvironment(environment=process.env) {
  return {...Object.fromEntries(Object.entries(environment).filter(([key])=>!/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|DEPLOY_HOOK)/i.test(key)&&!/^GIT_|^GH_TOKEN$|^GITHUB_TOKEN$|^SSH_ASKPASS$/.test(key))),
    GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
}
const execute=promisify(execFile);
export async function refreshGit(root,args,{environment=marketRefreshCommandEnvironment(),timeout=30000,encoding='utf8'}={}) {
  const result=await execute('git',args,{cwd:resolve(root),env:environment,encoding,timeout,maxBuffer:64*1024*1024});
  return typeof result.stdout==='string'?result.stdout.trimEnd():result.stdout;
}

/** An explicit token is supplied only to the one fixed-repository push. Never
 * save it in .git/config, a URL, a command argument or the receipt. */
export async function marketRefreshGitEnvironment(root,{environment=process.env,token=null}={}) {
  const clean=marketRefreshCommandEnvironment(environment);
  let headerKeys=[];
  try{headerKeys=(await refreshGit(root,['config','--name-only','--get-regexp','^http\\..*extraheader$'],{environment:clean})).split('\n').filter(Boolean);}catch(error){if(error.code!==1)throw error;}
  const pairs=[['credential.helper',''],['http.extraHeader',''],...headerKeys.map(key=>[key,'']),['http.followRedirects','false'],['core.hooksPath','/dev/null']];
  if(token!==null){assert.ok(typeof token==='string'&&token.length>0&&!/[\r\n]/.test(token),'An explicit repository-scoped ATLAS_DATA_GITHUB_TOKEN is required');pairs.push(['http.https://github.com/.extraHeader','Authorization: Basic '+Buffer.from('x-access-token:'+token).toString('base64')]);}
  const configured={...clean,GIT_CONFIG_COUNT:String(pairs.length)};
  for(const [index,[key,value]]of pairs.entries()){configured['GIT_CONFIG_KEY_'+index]=key;configured['GIT_CONFIG_VALUE_'+index]=value;}
  const destination=await refreshGit(root,['ls-remote','--get-url',MARKET_REFRESH_REMOTE],{environment:configured});
  assert.equal(destination,MARKET_REFRESH_REMOTE,'Git URL rewriting cannot redirect the refresh credential');
  return configured;
}

/** The publication stays bound to its current Build SHA. The last data refresh
 * is separately traced to the one-parent commit which introduced this receipt.
 * Bounded public history fetches only complete a shallow object graph. */
export async function readCommittedMarketRefreshOutcomes({root,sourceCommit,environment=process.env,git=refreshGit}={}) {
  assert.match(sourceCommit??'',commit);
  const clean=await marketRefreshGitEnvironment(root,{environment}),run=args=>git(root,args,{environment:clean});
  assert.equal(await run(['rev-parse','HEAD']),sourceCommit,'Publication source changed while reading refresh provenance');
  const tracked=await run(['ls-tree','--name-only',sourceCommit,'--',MARKET_REFRESH_RECEIPT_PATH]);
  if(!tracked)return {outcomes:{},provenance:null};
  const raw=await git(root,['show',`${sourceCommit}:${MARKET_REFRESH_RECEIPT_PATH}`],{environment:clean,encoding:'buffer'});
  assert.ok(raw.length<=512*1024,'Committed refresh receipt is too large');
  const receipt=assertMarketRefreshReceipt(JSON.parse(raw.toString('utf8')));
  assert.ok(marketRefreshReceiptBytes(receipt).equals(raw),'Committed refresh receipt must preserve canonical bytes');
  let lineage;
  for(const depth of [0,16,64,256]){
    if(depth)await run(['fetch','--quiet','--no-tags',`--depth=${depth}`,MARKET_REFRESH_REMOTE,sourceCommit]);
    const row=await run(['log','-1','--first-parent','--format=%H %P',sourceCommit,'--',MARKET_REFRESH_RECEIPT_PATH]);
    const [introduced,...parents]=row.split(' ');
    if(parents.length){lineage={introduced,parents};break;}
    assert.equal(await run(['rev-parse','--is-shallow-repository']),'true','Refresh receipt lacks its base parent');
  }
  assert.ok(lineage,'Refresh receipt source ancestry exceeds the bounded history fetch');
  assert.deepEqual(lineage.parents,[receipt.baseSourceCommit],'Refresh receipt must be introduced by one ordinary commit on its exact collected source');
  assert.equal(await run(['rev-parse',`${receipt.baseSourceCommit}^{tree}`]),receipt.baseSourceTree,'Refresh base source tree mismatch');
  await run(['merge-base','--is-ancestor',lineage.introduced,sourceCommit]);
  const mode=await run(['ls-tree',lineage.introduced,'--',MARKET_REFRESH_RECEIPT_PATH]);assert.match(mode,/^100644 blob /,'Refresh receipt must be a regular committed file');
  for(const file of receipt.files){
    const original=await run(['rev-parse',`${lineage.introduced}:${file.path}`]),current=await run(['rev-parse',`${sourceCommit}:${file.path}`]);
    assert.equal(current,original,'Published data changed without a matching refresh receipt: '+file.path);
    const bytes=await git(root,['show',`${lineage.introduced}:${file.path}`],{environment:clean,encoding:'buffer'});
    assert.equal(bytes.length,file.bytes,'Refresh file length mismatch: '+file.path);assert.equal(refreshSha256(bytes),file.sha256,'Refresh file hash mismatch: '+file.path);
  }
  assert.equal(await run(['rev-parse','HEAD']),sourceCommit,'Refresh history lookup must not move the publication checkout');
  return {outcomes:Object.fromEntries(MARKET_REFRESH_PROVIDER_IDS.map(name=>[name,{outcome:receipt.attempts[name].outcome,attemptedAt:receipt.attempts[name].attemptedAt}])),
    provenance:{provider:receipt.provider,buildId:receipt.buildId,triggerId:receipt.triggerId,baseSourceCommit:receipt.baseSourceCommit,receiptCommit:lineage.introduced,receiptSha256:refreshSha256(raw),completedAt:receipt.completedAt}};
}
