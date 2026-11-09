#!/usr/bin/env node
// Explicit supplementary public-origin evidence. Never deploys, changes the
// canonical browser inventory, or qualifies a model/publication release.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { bootstrapCloudflareBuild, runRuntimeCommand } from './bootstrap-cloudflare-build.mjs';
import { cloudflareRuntime } from './cloudflare-build-contract.mjs';
import { emitBrowserEvidenceChunks, emitCompressedBrowserReport } from './browser-evidence-transport.mjs';
import { drainVerificationOutput } from './cloudflare-gate-runner.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorText=error=>String(error?.stack||error?.message||error);
const harnessFiles=['scripts/verify-wp6-browser.mjs','scripts/verify-wp6-cloudflare.mjs'];
export const wp6EvidenceViewports=Object.freeze([[390,844],[320,740],[768,1024],[1024,768],[1440,900],[1920,1080]].map(Object.freeze));
export const wp6EvidenceSymbols=Object.freeze(['BTCUSD','ETHUSD','MSTR','BMNR','TQQQ']);
export const wp6EvidenceLimits=Object.freeze({pngBytes:24*1024*1024,individualPngBytes:2*1024*1024});

/** Validate every case and byte receipt before transporting evidence. Missing
 * or failed measurements stay failed; this never invents a replacement case. */
export function validateWp6Report(report,{phase,origin,expectedSource}={}){
  assert.equal(report.kind,'atlas-wp6-native-browser-evidence');assert.equal(report.qualifiesFullVerification,false);
  assert.equal(report.phase,phase);assert.equal(report.origin,origin);assert.equal(report.status,'PASS');
  assert.deepEqual(report.failures,[]);assert.equal(report.error,undefined);
  if(phase==='after')assert.match(expectedSource??'',/^[a-f0-9]{40}$/,'After evidence requires an exact published source');
  assert.match(report.publicationBefore?.sourceCommit??'',/^[a-f0-9]{40}$/);
  assert.equal(report.publicationAfter?.sourceCommit,report.publicationBefore.sourceCommit,'Publication source changed during capture');
  assert.equal(report.publicationAfter?.sha256,report.publicationBefore.sha256,'Publication bytes changed during capture');
  if(expectedSource)assert.equal(report.publicationBefore.sourceCommit,expectedSource);
  const expected=wp6EvidenceViewports.flatMap(([width,height])=>wp6EvidenceSymbols.map(symbol=>({symbol,width,height})));
  assert.deepEqual(report.cases.map(({symbol,width,height})=>({symbol,width,height})),expected,'WP6 evidence requires every instrument at all six viewports');
  assert.equal(new Set(report.cases.map(item=>item.contextId)).size,expected.length,'Each case requires isolated browser state');
  const screenshots=[];
  for(const item of report.cases){
    assert.equal(item.status,'PASS',item.id+' failed');assert.deepEqual(item.runtimeErrors,[]);
    assert.ok(typeof item.contextId==='string'&&item.contextId.length>0);
    const prefix=item.symbol.toLowerCase()+'-'+item.width+'x'+item.height;
    const required=[prefix+'-chart.png',...(item.symbol==='BTCUSD'?[prefix+'-replay.png']:[]),...(phase==='after'&&item.symbol==='TQQQ'?[prefix+'-statistics.png']:[])];
    for(const file of required)assert.ok(item.screenshots.some(image=>image.file===file),'Required screenshot missing: '+file);
    for(const image of item.screenshots){
      assert.match(image.file,/^[a-z0-9-]+\.png$/);assert.match(image.sha256,/^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(image.bytes)&&image.bytes>0&&image.bytes<=wp6EvidenceLimits.individualPngBytes);
      screenshots.push(image);
    }
  }
  assert.equal(new Set(screenshots.map(image=>image.file)).size,screenshots.length,'Duplicate screenshot receipt');
  assert.ok(screenshots.reduce((sum,image)=>sum+image.bytes,0)<=wp6EvidenceLimits.pngBytes,'All screenshots exceed the explicit transport budget');
  return screenshots;
}

async function pinnedNode(){
  if(process.version===cloudflareRuntime.node)return false;
  const candidates=[process.env.ATLAS_UI_NODE_PATH,process.env.npm_node_execpath,process.env.CODEX_PRIMARY_RUNTIME_NODE,process.env.NODE_BINARY,
    ...(process.env.PATH??'').split(delimiter).filter(Boolean).map(directory=>resolve(directory,'node'))];
  for(const candidate of [...new Set(candidates.filter(Boolean))]){
    const binary=await realpath(candidate).catch(()=>null);if(!binary||binary===await realpath(process.execPath))continue;
    const check=await runRuntimeCommand(binary,['--version'],{timeout:15000,allowFailure:true});
    if(check.code||check.output.trim()!==cloudflareRuntime.node)continue;
    const result=await runRuntimeCommand(binary,[fileURLToPath(import.meta.url),...process.argv.slice(2)],{cwd:root,timeout:20*60*1000,
      env:{...process.env,PATH:dirname(binary)+delimiter+(process.env.PATH??'')},log:text=>process.stdout.write(text),allowFailure:true});
    process.exitCode=result.code;return true;
  }
  throw new Error('WP6 diagnostics require '+cloudflareRuntime.node+'; set NODE_VERSION=24.22.2 in Workers Builds.');
}

export async function runWp6CloudflareReview(args=process.argv.slice(2)){
  const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
  const phase=option('--phase','before'),origin=option('--origin','https://bitcoin-cycle-atlas.twoimo.workers.dev').replace(/\/$/,''),expectedSource=option('--expected-source',null);
  assert.ok(['before','after'].includes(phase));assert.equal(new URL(origin).origin,origin);assert.equal(new URL(origin).protocol,'https:');
  if(phase==='after')assert.match(expectedSource??'',/^[a-f0-9]{40}$/,'--expected-source is required for after evidence');
  if(expectedSource)assert.match(expectedSource,/^[a-f0-9]{40}$/);
  const started=Date.now(),deadline=started+19*60*1000,remaining=()=>{const value=deadline-Date.now();assert.ok(value>1000,'WP6 diagnostic time budget exhausted');return value;};
  const directory=resolve(root,'build/wp6-review',phase);await mkdir(directory,{recursive:true});
  const receipt={schemaVersion:1,kind:'atlas-supplementary-wp6-review',phase,origin,expectedSource,startedAt:new Date(started).toISOString(),status:'RUNNING',
    diagnosticOnly:true,qualifiesForPublication:false,canonicalBrowserGateUnchanged:true,deploymentPerformed:false,providerBuildUuid:process.env.WORKERS_CI_BUILD_UUID??null,
    outputDirectory:relative(root,directory),errors:[],screenshots:[]};
  let reportBytes=null;const imageQueue=[];
  try{
    await runRuntimeCommand('git',['ls-files','--error-unmatch','--',...harnessFiles],{cwd:root,timeout:15000});
    await runRuntimeCommand('git',['diff','--exit-code','HEAD','--',...harnessFiles],{cwd:root,timeout:15000});
    receipt.inspectorCommit=(await runRuntimeCommand('git',['rev-parse','HEAD'],{cwd:root,timeout:15000})).output.trim();
    receipt.harness=Object.fromEntries(await Promise.all(harnessFiles.map(async file=>[file,sha(await readFile(resolve(root,file)))])));
    console.log('ATLAS_WP6_REVIEW_START '+JSON.stringify(receipt));
    const runtime=await bootstrapCloudflareBuild({root,timeoutMs:Math.min(8*60*1000,remaining()),log:text=>process.stdout.write(text)});receipt.runtime=runtime.receipt;
    const command=['scripts/verify-wp6-browser.mjs','--origin',origin,'--phase',phase,'--out',directory,...(expectedSource?['--expected-source',expectedSource]:[])];
    const result=await runRuntimeCommand(process.execPath,command,{cwd:root,env:{...process.env,...runtime.environment},timeout:Math.min(11*60*1000,remaining()),
      log:text=>process.stdout.write(text),allowFailure:true});
    receipt.exitCode=result.code;receipt.signal=result.signal??null;
    reportBytes=await readFile(resolve(directory,'report.json'));const report=JSON.parse(reportBytes);
    receipt.nativeReport={status:report.status,cases:report.cases?.length??0,publicationBefore:report.publicationBefore,publicationAfter:report.publicationAfter,browser:report.browser,
      failures:report.failures,error:report.error};
    const inventory=validateWp6Report(report,{phase,origin,expectedSource});assert.equal(result.code,0,'Native browser process failed');
    for(const image of inventory){const bytes=await readFile(resolve(directory,image.file));assert.equal(bytes.length,image.bytes);assert.equal(sha(bytes),image.sha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      receipt.screenshots.push(image);imageQueue.push({name:'wp6-'+phase+'/'+image.file,bytes});}
    assert.deepEqual(Object.fromEntries(await Promise.all(harnessFiles.map(async file=>[file,sha(await readFile(resolve(root,file)))]))),receipt.harness,'Verifier source changed during capture');
    receipt.status='PASS';
  }catch(error){receipt.status='FAIL';receipt.errors.push(errorText(error));if(!reportBytes)try{reportBytes=await readFile(resolve(directory,'report.json'));}catch{}}
  finally{
    receipt.finishedAt=new Date().toISOString();receipt.durationMs=Date.now()-started;
    receipt.screenshotTransport={images:imageQueue.length,pngBytes:imageQueue.reduce((sum,item)=>sum+item.bytes.length,0),limit:wp6EvidenceLimits.pngBytes,allCapturedImagesIncluded:receipt.status==='PASS'};
    if(reportBytes)receipt.reportTransport=emitCompressedBrowserReport(reportBytes,{name:'wp6-'+phase+'/report.json'});
    const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');await writeFile(resolve(directory,'diagnostic.json'),bytes);
    const transport=emitCompressedBrowserReport(bytes,{name:'wp6-'+phase+'/diagnostic.json'});
    console.log('ATLAS_WP6_REVIEW_RECEIPT '+JSON.stringify({status:receipt.status,phase,origin,expectedSource,inspectorCommit:receipt.inspectorCommit,qualifiesForPublication:false,deploymentPerformed:false,
      nativeStatus:receipt.nativeReport?.status,cases:receipt.nativeReport?.cases,screenshotTransport:receipt.screenshotTransport,transport,errors:receipt.errors}));
    for(const item of imageQueue)emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',item.bytes,{name:item.name});
    console.log('ATLAS_WP6_REVIEW_IMAGES_COMPLETE '+JSON.stringify(receipt.screenshotTransport));await drainVerificationOutput();
  }
  return receipt;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(!await pinnedNode()){const receipt=await runWp6CloudflareReview();if(receipt.status!=='PASS')process.exitCode=1;}}
  catch(error){console.error('ATLAS_WP6_REVIEW_ERROR '+errorText(error));process.exitCode=1;}
}
