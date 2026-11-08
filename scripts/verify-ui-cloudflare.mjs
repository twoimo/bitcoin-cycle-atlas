#!/usr/bin/env node
// Supplementary UI measurements only. This command never publishes a release,
// invokes deployment, or replaces the canonical 53-case native browser gate.
import assert from 'node:assert/strict';
import {access,copyFile,mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename,delimiter,dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bootstrapCloudflareBuild,runRuntimeCommand} from './bootstrap-cloudflare-build.mjs';
import {cloudflareRuntime} from './cloudflare-build-contract.mjs';
import {browserEvidenceChunkSize,emitBrowserEvidenceChunks,emitCompressedBrowserReport} from './browser-evidence-transport.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
export const uiReviewBaseline='1635f87a10962b7ff5eecd094b6e0625e09771f4';
export const uiReviewHarnessFiles=Object.freeze([
  'scripts/verify-eth-candidate-browser.mjs',
  'scripts/verify-ui-contract-browser.mjs',
  'scripts/browser-source-identity.mjs',
]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorText=error=>error instanceof Error?(error.stack||error.message):String(error);
const log=(event,value)=>console.log('ATLAS_UI_REVIEW_'+event+' '+JSON.stringify(value));
const canRead=path=>access(path,constants.R_OK).then(()=>true,()=>false);

/** The native verifier emits unqualified report.json chunks. Suppress those
 * lines, including partial writes, before transporting the original files with
 * an unambiguous phase prefix. Preserve every native case/error log line. */
export function createUiReviewLogFilter(write){
  let pending='';
  const line=value=>{if(value&&!/^(ETH_BROWSER_(?:IMAGE_CHUNK|REPORT_CHUNK|RECEIPT|LANE_RECEIPT))\s/.test(value))write(value);};
  return {
    write(chunk){pending+=String(chunk);let end;while((end=pending.indexOf('\n'))!==-1){line(pending.slice(0,end).replace(/\r$/,''));pending=pending.slice(end+1);}},
    flush(){if(pending)line(pending.replace(/\r$/,''));pending='';},
  };
}

const uiReviewSizes=['320x740','390x844','768x1024','1024x768','1440x900','1920x1080'];
export const uiReviewScreenshotBudgets=Object.freeze({
  before:Object.freeze({pngBytes:1_300_000,logBytes:1_850_000}),
  after:Object.freeze({pngBytes:2_200_000,logBytes:3_150_000}),
});
function screenshotInventory(report){
  const inventory=new Map();
  for(const entry of report.cases??[])for(const screenshot of entry.screenshots??[]){
    assert.equal(typeof screenshot.file,'string');assert.ok(Number.isSafeInteger(screenshot.bytes)&&screenshot.bytes>0);
    assert.match(screenshot.sha256,/^[a-f0-9]{64}$/);
    const previous=inventory.get(screenshot.file);
    if(previous)assert.deepEqual(previous,screenshot,'Conflicting screenshot receipts for one artifact');
    inventory.set(screenshot.file,screenshot);
  }
  return inventory;
}
function screenshotPriority(file,phase){
  if(uiReviewSizes.some(size=>file===`wp4-${phase}-${size}-chart.png`))return 0;
  if(file.endsWith('-failure.png'))return 1;
  if(phase==='after'&&/^ui-entry-(?:mstr|bmnr)-root-1440x900\.png$/.test(file))return 2;
  if(phase==='after'&&/^wp4-after-(?:320x740|390x844|1440x900)-legend\.png$/.test(file))return 3;
  if(phase==='after'&&/^wp4-after-(?:1440x900|1920x1080)-replay\.png$/.test(file))return 4;
  return null;
}
/** Select bounded representative images; original reports retain every capture. */
export function selectUiReviewScreenshots(report,phase){
  assert.ok(['before','after'].includes(phase));
  return [...screenshotInventory(report).values()].filter(screenshot=>screenshotPriority(screenshot.file,phase)!==null)
    .sort((a,b)=>screenshotPriority(a.file,phase)-screenshotPriority(b.file,phase));
}
export function screenshotLogBytes(screenshot,phase){
  const encodedBytes=Math.ceil(screenshot.bytes/3)*4,total=Math.max(1,Math.ceil(encodedBytes/browserEvidenceChunkSize));
  let bytes=0;
  for(let index=0;index<total;index++)bytes+=Buffer.byteLength('ETH_BROWSER_IMAGE_CHUNK '+JSON.stringify({schemaVersion:1,
    name:'ui-review-'+phase+'/'+screenshot.file,bytes:screenshot.bytes,sha256:screenshot.sha256,total,index,data:''})+'\n')+
    Math.min(browserEvidenceChunkSize,encodedBytes-index*browserEvidenceChunkSize);
  return bytes;
}
export function planUiReviewScreenshots(report,phase,budget=uiReviewScreenshotBudgets[phase]){
  assert.ok(['before','after'].includes(phase));
  for(const key of ['pngBytes','logBytes'])assert.ok(Number.isSafeInteger(budget?.[key])&&budget[key]>0);
  const inventory=screenshotInventory(report),selected=[],omitted=[],errors=[];
  const required=uiReviewSizes.map(size=>`wp4-${phase}-${size}-chart.png`);
  if(phase==='after')required.push('ui-entry-mstr-root-1440x900.png','ui-entry-bmnr-root-1440x900.png');
  for(const file of required)if(!inventory.has(file))errors.push('Required screenshot was not captured: '+file);
  let pngBytes=0,logBytes=0;
  for(const screenshot of selectUiReviewScreenshots(report,phase)){
    const cost=screenshotLogBytes(screenshot,phase);
    if(pngBytes+screenshot.bytes>budget.pngBytes||logBytes+cost>budget.logBytes){
      omitted.push({file:screenshot.file,bytes:screenshot.bytes,reason:'PNG or encoded log budget exceeded'});
      if(required.includes(screenshot.file)||screenshot.file.endsWith('-failure.png'))errors.push('Required or failure screenshot exceeds transport budget: '+screenshot.file);
      continue;
    }
    selected.push(screenshot);pngBytes+=screenshot.bytes;logBytes+=cost;
  }
  for(const screenshot of inventory.values())if(screenshotPriority(screenshot.file,phase)===null){
    const canonical=phase==='after'&&screenshot.file.match(/^ui-entry-(mstr|bmnr)-charts-1440x900\.png$/);
    omitted.push({file:screenshot.file,bytes:screenshot.bytes,reason:canonical?'Canonical entry has its own full route receipt; root entry supplies the representative native chart image':'Additional state retained in original native report; omitted from bounded log transport',
      ...(canonical?{representativeFile:`ui-entry-${canonical[1]}-root-1440x900.png`}:{})});
  }
  return {budget,originalCount:inventory.size,selected,omitted,errors,pngBytes,logBytes};
}

export async function readUiReviewScreenshot(directory,screenshot){
  assert.equal(typeof screenshot.file,'string');
  assert.equal(isAbsolute(screenshot.file),false,'Screenshot path must remain inside its phase output');
  const path=resolve(directory,screenshot.file),suffix=relative(directory,path);
  assert.ok(suffix&&!suffix.startsWith('..'+sep)&&suffix!=='..'&&!isAbsolute(suffix),'Screenshot path escapes its phase output');
  const bytes=await readFile(path);
  assert.equal(bytes.length,screenshot.bytes,'Native screenshot byte count changed');
  assert.equal(sha(bytes),screenshot.sha256,'Native screenshot bytes changed after capture');
  return bytes;
}

async function git(directory,args){
  const result=await runRuntimeCommand('git',args,{cwd:directory,timeout:180000});
  return result.output.trim();
}
async function cleanDistIdentity(directory){
  await git(directory,['diff','--exit-code','HEAD','--','dist']);
  const untracked=await git(directory,['ls-files','--others','--exclude-standard','--','dist']);
  assert.equal(untracked,'','UI measurements require an unchanged committed dist tree');
  return {sourceCommit:await git(directory,['rev-parse','HEAD']),sourceTree:await git(directory,['rev-parse','HEAD^{tree}']),
    distTree:await git(directory,['rev-parse','HEAD:dist']),trackedDistFiles:(await git(directory,['ls-files','--','dist'])).split('\n').filter(Boolean).length,
    distUnchanged:true};
}
async function harnessHashes(directory){
  return Object.fromEntries(await Promise.all(uiReviewHarnessFiles.map(async file=>[file,sha(await readFile(resolve(directory,file)))])));
}

async function npmCliPath(){
  const candidates=[process.env.npm_execpath,resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
  for(const directory of (process.env.PATH??'').split(delimiter).filter(Boolean))candidates.push(resolve(directory,'npm'));
  for(const candidate of candidates.filter(Boolean)){
    const path=await realpath(candidate).catch(()=>null);
    if(path&&basename(path)==='npm-cli.js'&&await canRead(path))return path;
  }
  throw new Error('The build image must provide npm-cli.js; npm will run under the pinned Node executable.');
}

async function relaunchUnderPinnedNode(){
  if(process.version===cloudflareRuntime.node)return false;
  // Only reuse already installed executables. Do not relax the runtime pin or
  // replace provider variables to make a different Node version look canonical.
  const candidates=[process.env.ATLAS_UI_NODE_PATH,process.env.npm_node_execpath,process.env.CODEX_PRIMARY_RUNTIME_NODE,process.env.NODE_BINARY,
    ...(process.env.PATH??'').split(delimiter).filter(Boolean).map(directory=>resolve(directory,'node'))];
  for(const candidate of [...new Set(candidates.filter(Boolean))]){
    const path=await realpath(candidate).catch(()=>null);if(!path||path===await realpath(process.execPath))continue;
    const version=await runRuntimeCommand(path,['--version'],{timeout:15000,allowFailure:true});
    if(version.code||version.output.trim()!==cloudflareRuntime.node)continue;
    log('NODE_RELAUNCH',{from:process.version,to:cloudflareRuntime.node,executable:path});
    const result=await runRuntimeCommand(path,[fileURLToPath(import.meta.url)],{cwd:root,timeout:20*60*1000,
      env:{...process.env,PATH:dirname(path)+delimiter+(process.env.PATH??'')},log:text=>process.stdout.write(text),allowFailure:true});
    process.exitCode=result.code;return true;
  }
  throw new Error('Supplementary UI review requires '+cloudflareRuntime.node+'. Set NODE_VERSION=24.22.2 in Workers Builds or ATLAS_UI_NODE_PATH to that existing runtime.');
}

async function runPhase({phase,directory,output,environment,applicationCommit,verifierCommit,expectedHarness,remaining,imageQueue}){
  const entry={phase,kind:phase==='before'?'baseline-measurement':'changed-ui-assertions',status:'running',
    application:await cleanDistIdentity(directory),verifier:{sourceCommit:verifierCommit,copiedIntoBaseline:phase==='before',files:await harnessHashes(directory)},
    outputDirectory:relative(root,output),diagnosticOnly:true,qualifiesForPublication:false,errors:[],screenshots:[]};
  assert.equal(entry.application.sourceCommit,applicationCommit);assert.deepEqual(entry.verifier.files,expectedHarness);
  await mkdir(output,{recursive:true});
  log('PHASE',{phase,status:'running',applicationCommit,verifierCommit});
  const lines=createUiReviewLogFilter(message=>log('BROWSER_LOG',{phase,message}));
  try{
    const result=await runRuntimeCommand(process.execPath,['scripts/verify-eth-candidate-browser.mjs'],{cwd:directory,
      env:{...environment,ATLAS_UI_REVIEW:'wp4-wp7',ATLAS_UI_REVIEW_PHASE:phase,ATLAS_BROWSER_OUT:output,
        ETH_BROWSER_IMAGE_LOG_MODE:'failures-only',ATLAS_BROWSER_CASE_SCOPE:'all',ATLAS_BROWSER_LANE:'',ATLAS_BROWSER_SUITE_RUN_ID:''},
      timeout:Math.min(8*60*1000,remaining()),log:chunk=>lines.write(chunk),allowFailure:true});
    entry.exitCode=result.code;entry.signal=result.signal??null;
  }catch(error){entry.errors.push(errorText(error));}finally{lines.flush();}
  try{
    const bytes=await readFile(resolve(output,'report.json')),report=JSON.parse(bytes);
    entry.nativeReport={status:report.status,caseScope:report.caseScope,expectedCaseCount:report.expectedCaseCount,
      completedCaseCount:report.cases?.length??0,browserVersion:report.browserVersion,sourceCommit:report.sourceCommit,
      sourceIntegrity:report.sourceIntegrity,failedCases:(report.cases??[]).filter(item=>item.status!=='passed').map(item=>({page:item.page,width:item.width,height:item.height,error:item.error}))};
    // Preserve the complete original native receipt, even if its assertions failed.
    entry.reportTransport=emitCompressedBrowserReport(bytes,{name:'ui-review-'+phase+'/report.json'});
    assert.equal(report.caseScope,'wp4-wp7','Supplementary UI scope must never impersonate the full browser gate');
    assert.equal(report.sourceCommit,applicationCommit,'Native receipt belongs to another UI source');
    const plan=planUiReviewScreenshots(report,phase);entry.screenshotPlan=plan;entry.errors.push(...plan.errors);
    log('IMAGE_PLAN',{phase,...plan,selected:plan.selected.map(screenshot=>screenshot.file)});
    for(const screenshot of plan.selected){
      const image=await readUiReviewScreenshot(output,screenshot);
      const name='ui-review-'+phase+'/'+screenshot.file,transport=emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',image,{name,log:()=>{}});
      entry.screenshots.push({...screenshot,transport});imageQueue.push({name,image,transport});
    }
    assert.equal(report.cases?.length,report.expectedCaseCount,'Native UI case inventory is incomplete');
    assert.equal(report.status,'passed','Native UI diagnostic has failed assertions');
    assert.equal(entry.exitCode,0,'Native UI process did not complete successfully');
  }catch(error){entry.errors.push(errorText(error));}
  try{
    assert.deepEqual(await cleanDistIdentity(directory),entry.application,'The application changed during measurement');
    assert.deepEqual(await harnessHashes(directory),expectedHarness,'The copied verifier changed during measurement');
  }catch(error){entry.errors.push(errorText(error));}
  entry.status=entry.errors.length?'failed':'passed';
  await writeFile(resolve(output,'phase.json'),JSON.stringify(entry,null,2)+'\n');
  log('PHASE',{phase,status:entry.status,applicationCommit,cases:entry.nativeReport?.completedCaseCount,
    screenshots:entry.screenshots.length,errors:entry.errors});
  return entry;
}

/** Emit receipts before PNGs so a provider log limit cannot erase verdicts. */
export async function emitUiReviewArtifacts({receipt,directory,imageQueue,writeLog=console.log}){
  receipt.screenshotTransport={status:'prepared',images:imageQueue.length,pngBytes:imageQueue.reduce((sum,item)=>sum+item.image.length,0),
    estimatedLogBytes:receipt.phases.reduce((sum,phase)=>sum+(phase.screenshotPlan?.logBytes??0),0),order:'native reports, diagnostic receipt, then bounded PNGs'};
  const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');await writeFile(resolve(directory,'diagnostic.json'),bytes);
  const transport=emitCompressedBrowserReport(bytes,{name:'ui-review/diagnostic.json',log:writeLog});
  writeLog('ATLAS_UI_REVIEW_RECEIPT '+JSON.stringify({status:receipt.status,diagnosticOnly:true,qualifiesForPublication:false,deploymentPerformed:false,
    applicationCommit:receipt.application?.sourceCommit,baselineCommit:uiReviewBaseline,phases:receipt.phases.map(({phase,status})=>({phase,status})),
    screenshotTransport:receipt.screenshotTransport,transport,error:receipt.error,cleanupError:receipt.cleanupError}));
  for(const item of imageQueue)assert.deepEqual(emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',item.image,{name:item.name,log:writeLog}),item.transport);
  writeLog('ATLAS_UI_REVIEW_IMAGES_COMPLETE '+JSON.stringify({status:'emitted',images:imageQueue.length,pngBytes:receipt.screenshotTransport.pngBytes,estimatedLogBytes:receipt.screenshotTransport.estimatedLogBytes}));
}

export async function runUiCloudflareReview(){
  const started=Date.now(),deadline=started+19*60*1000;
  const remaining=()=>{const value=deadline-Date.now();assert.ok(value>1000,'Supplementary UI build time budget exhausted');return value;};
  await mkdir(resolve(root,'build/ui-review'),{recursive:true});
  const directory=await mkdtemp(resolve(root,'build/ui-review/run-')),baselineDirectory=resolve(directory,'baseline-source');
  const receipt={schemaVersion:1,kind:'atlas-supplementary-ui-review',scope:'wp4-wp7',startedAt:new Date(started).toISOString(),status:'running',
    diagnosticOnly:true,qualifiesForPublication:false,canonicalBrowserGateUnchanged:true,deploymentPerformed:false,
    baselineCommit:uiReviewBaseline,phases:[],outputDirectory:relative(root,directory)};
  let worktreeCreated=false;const imageQueue=[];
  try{
    await git(root,['ls-files','--error-unmatch','--',...uiReviewHarnessFiles,'scripts/verify-ui-cloudflare.mjs']);
    await git(root,['diff','--exit-code','HEAD','--',...uiReviewHarnessFiles,'scripts/verify-ui-cloudflare.mjs']);
    const application=await cleanDistIdentity(root),expectedHarness=await harnessHashes(root);
    receipt.application=application;receipt.verifier={sourceCommit:application.sourceCommit,files:expectedHarness,
      wrapperSha256:sha(await readFile(fileURLToPath(import.meta.url))),committedHarness:true};
    log('START',{...receipt,phases:undefined});
    const runtime=await bootstrapCloudflareBuild({root,timeoutMs:Math.min(8*60*1000,remaining()),log:text=>process.stdout.write(text)});
    receipt.runtime=runtime.receipt;
    const environment={...process.env,...runtime.environment,PATH:dirname(process.execPath)+delimiter+(runtime.environment.PATH??process.env.PATH??'')};
    const npm=await npmCliPath();
    await runRuntimeCommand(process.execPath,[npm,'ci','--no-audit','--no-fund'],{cwd:root,env:environment,timeout:Math.min(3*60*1000,remaining()),log:text=>process.stdout.write(text)});
    receipt.dependencies={command:'npm ci --no-audit --no-fund',node:process.version,npmCli:npm,lockSha256:sha(await readFile(resolve(root,'package-lock.json')))};
    const exists=await runRuntimeCommand('git',['cat-file','-e',uiReviewBaseline+'^{commit}'],{cwd:root,allowFailure:true});
    if(exists.code)await git(root,['fetch','--no-tags','--depth=1','origin',uiReviewBaseline]);
    await git(root,['worktree','add','--detach',baselineDirectory,uiReviewBaseline]);worktreeCreated=true;
    // Only test code changes in this worktree. No application, generated bundle,
    // market data, lock file or package manifest is copied into the baseline.
    for(const file of uiReviewHarnessFiles){await mkdir(dirname(resolve(baselineDirectory,file)),{recursive:true});await copyFile(resolve(root,file),resolve(baselineDirectory,file));}
    receipt.phases.push(await runPhase({phase:'before',directory:baselineDirectory,output:resolve(directory,'before'),environment,
      applicationCommit:uiReviewBaseline,verifierCommit:application.sourceCommit,expectedHarness,remaining,imageQueue}));
    receipt.phases.push(await runPhase({phase:'after',directory:root,output:resolve(directory,'after'),environment,
      applicationCommit:application.sourceCommit,verifierCommit:application.sourceCommit,expectedHarness,remaining,imageQueue}));
    receipt.status=receipt.phases.every(phase=>phase.status==='passed')?'passed':'failed';
  }catch(error){receipt.status='failed';receipt.error=errorText(error);}
  finally{
    if(worktreeCreated)try{await git(root,['worktree','remove','--force',baselineDirectory]);receipt.baselineWorktreeRemoved=true;}
    catch(error){receipt.cleanupError=errorText(error);receipt.status='failed';}
    else await rm(baselineDirectory,{recursive:true,force:true});
    receipt.finishedAt=new Date().toISOString();receipt.durationMs=Date.now()-started;
    await emitUiReviewArtifacts({receipt,directory,imageQueue});
  }
  return receipt;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(!await relaunchUnderPinnedNode()){const receipt=await runUiCloudflareReview();if(receipt.status!=='passed')process.exitCode=1;}}
  catch(error){console.error('ATLAS_UI_REVIEW_ERROR '+errorText(error));process.exitCode=1;}
}
