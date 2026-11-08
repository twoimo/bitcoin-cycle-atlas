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
import {emitBrowserEvidenceChunks,emitCompressedBrowserReport} from './browser-evidence-transport.mjs';

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

/** Keep six chart/replay/selection sets and native entry route evidence, plus
 * the two mobile and one desktop full legend. Always include failure images. */
export function selectUiReviewScreenshots(report,phase){
  assert.ok(['before','after'].includes(phase));
  const selected=new Map(),sizes='(?:320x740|390x844|768x1024|1024x768|1440x900|1920x1080)';
  const charts=new RegExp('^wp4-'+phase+'-'+sizes+'-(?:chart|replay|replay-picking)\\.png$');
  const legends=new RegExp('^wp4-'+phase+'-(?:320x740|390x844|1440x900)-legend\\.png$');
  const entries=phase==='after'?/^ui-entry-(?:mstr|bmnr)-(?:root|charts)-1440x900\.png$/:null;
  for(const entry of report.cases??[])for(const screenshot of entry.screenshots??[]){
    if(!charts.test(screenshot.file)&&!legends.test(screenshot.file)&&!entries?.test(screenshot.file)&&!screenshot.file?.endsWith('-failure.png'))continue;
    const previous=selected.get(screenshot.file);
    if(previous)assert.deepEqual(previous,screenshot,'Conflicting screenshot receipts for one artifact');
    selected.set(screenshot.file,screenshot);
  }
  return [...selected.values()];
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

async function runPhase({phase,directory,output,environment,applicationCommit,verifierCommit,expectedHarness,remaining}){
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
    for(const screenshot of selectUiReviewScreenshots(report,phase)){
      const image=await readUiReviewScreenshot(output,screenshot);
      entry.screenshots.push({...screenshot,transport:emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',image,{name:'ui-review-'+phase+'/'+screenshot.file})});
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

export async function runUiCloudflareReview(){
  const started=Date.now(),deadline=started+19*60*1000;
  const remaining=()=>{const value=deadline-Date.now();assert.ok(value>1000,'Supplementary UI build time budget exhausted');return value;};
  await mkdir(resolve(root,'build/ui-review'),{recursive:true});
  const directory=await mkdtemp(resolve(root,'build/ui-review/run-')),baselineDirectory=resolve(directory,'baseline-source');
  const receipt={schemaVersion:1,kind:'atlas-supplementary-ui-review',scope:'wp4-wp7',startedAt:new Date(started).toISOString(),status:'running',
    diagnosticOnly:true,qualifiesForPublication:false,canonicalBrowserGateUnchanged:true,deploymentPerformed:false,
    baselineCommit:uiReviewBaseline,phases:[],outputDirectory:relative(root,directory)};
  let worktreeCreated=false;
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
      applicationCommit:uiReviewBaseline,verifierCommit:application.sourceCommit,expectedHarness,remaining}));
    receipt.phases.push(await runPhase({phase:'after',directory:root,output:resolve(directory,'after'),environment,
      applicationCommit:application.sourceCommit,verifierCommit:application.sourceCommit,expectedHarness,remaining}));
    receipt.status=receipt.phases.every(phase=>phase.status==='passed')?'passed':'failed';
  }catch(error){receipt.status='failed';receipt.error=errorText(error);}
  finally{
    if(worktreeCreated)try{await git(root,['worktree','remove','--force',baselineDirectory]);receipt.baselineWorktreeRemoved=true;}
    catch(error){receipt.cleanupError=errorText(error);receipt.status='failed';}
    else await rm(baselineDirectory,{recursive:true,force:true});
    receipt.finishedAt=new Date().toISOString();receipt.durationMs=Date.now()-started;
    const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');await writeFile(resolve(directory,'diagnostic.json'),bytes);
    const transport=emitCompressedBrowserReport(bytes,{name:'ui-review/diagnostic.json'});
    log('RECEIPT',{status:receipt.status,diagnosticOnly:true,qualifiesForPublication:false,deploymentPerformed:false,
      applicationCommit:receipt.application?.sourceCommit,baselineCommit:uiReviewBaseline,phases:receipt.phases.map(({phase,status})=>({phase,status})),
      transport,error:receipt.error,cleanupError:receipt.cleanupError});
  }
  return receipt;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(!await relaunchUnderPinnedNode()){const receipt=await runUiCloudflareReview();if(receipt.status!=='passed')process.exitCode=1;}}
  catch(error){console.error('ATLAS_UI_REVIEW_ERROR '+errorText(error));process.exitCode=1;}
}
