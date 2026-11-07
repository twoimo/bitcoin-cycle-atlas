#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,rm,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {finished} from 'node:stream/promises';
import {createEthBrowserCaseSpecs,selectEthBrowserCaseSpecs} from './eth-browser-case-specs.mjs';
import {readBrowserSourceIdentity} from './browser-source-identity.mjs';
import {assertWorkersBuildSource} from './cloudflare-browser-source.mjs';
import {cloudflareBrowserExecution} from './cloudflare-build-contract.mjs';
import {completeLineWriter} from './cloudflare-gate-runner.mjs';
import {emitCompressedBrowserReport} from './browser-evidence-transport.mjs';
import {readFastCadenceContext,createFastCadenceBarrier,fastCadenceReleasePrefix,assertFastCadenceCaseEvidence} from './browser-fast-cadence-contract.mjs';

const defaultRoot=fileURLToPath(new URL('..',import.meta.url));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorText=error=>error instanceof Error?(error.stack||error.message):String(error);
const caseKey=spec=>`${spec.page}:${spec.width}x${spec.height}`;
export const nativeBrowserLanes=Object.freeze(cloudflareBrowserExecution.lanes.map(lane=>Object.freeze({...lane,name:lane.scope})));

function safePath(value){
  assert.equal(typeof value,'string');
  assert.ok(value.length>0&&!value.includes('\\')&&!value.startsWith('/')&&posix.normalize(value)===value
    &&value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'Unsafe browser artifact path: '+value);
  return value;
}

async function verifyFile(directory,record,{png=false}={}){
  safePath(record.file);assert.ok(Number.isSafeInteger(record.bytes)&&record.bytes>0,'Invalid artifact byte count');
  assert.match(record.sha256??'',/^[a-f0-9]{64}$/);
  const path=resolve(directory,record.file),base=await realpath(directory),actual=await realpath(path);
  assert.ok(actual.startsWith(base+'/'),'Browser artifact escaped its lane');
  assert.equal((await lstat(path)).isFile(),true,'Browser artifact must be a regular file');
  const bytes=await readFile(path);assert.equal(bytes.length,record.bytes,'Browser artifact size changed: '+record.file);
  assert.equal(digest(bytes),record.sha256,'Browser artifact hash changed: '+record.file);
  if(png){assert.ok(record.file.endsWith('.png'),'Screenshot must remain a PNG');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Screenshot is not PNG bytes');}
  return bytes;
}

// Download and screenshot receipts are paths relative to each original lane.
// Prefix the references in the joined copy; never rewrite artifact bytes.
async function prefixArtifacts(value,{directory,prefix,seen=new Map()}){
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value))return Promise.all(value.map(item=>prefixArtifacts(item,{directory,prefix,seen})));
  const copy={};
  for(const [key,item] of Object.entries(value))copy[key]=await prefixArtifacts(item,{directory,prefix,seen});
  if(typeof value.file==='string'&&Object.hasOwn(value,'bytes')&&Object.hasOwn(value,'sha256')){
    const identity=JSON.stringify([value.bytes,value.sha256]);
    if(seen.has(value.file))assert.equal(seen.get(value.file),identity,'Conflicting artifact receipts for '+value.file);
    else{await verifyFile(directory,value,{png:value.file.endsWith('.png')});seen.set(value.file,identity);}
    copy.file=prefix+'/'+safePath(value.file);
  }
  return copy;
}

export async function readNativeBrowserLaneReports(out,processes){
  return Promise.all(nativeBrowserLanes.map(async lane=>{
    const processResult=processes.find(item=>item.name===lane.name),file=`lanes/${lane.name}/report.json`;
    try{
      const bytes=await readFile(resolve(out,file));
      return {...lane,process:processResult,reportReceipt:{file,bytes:bytes.length,sha256:digest(bytes)},report:JSON.parse(bytes.toString('utf8'))};
    }catch(error){return {...lane,process:processResult,readError:errorText(error)};}
  }));
}

/** This function can return PASS only from complete source-bound real child
 * reports and their unchanged on-disk artifacts. It never synthesizes cases. */
export async function combineNativeBrowserLanes({root,out,source,suiteRunId,lanes,startedAt,finishedAt}){
  const expected=createEthBrowserCaseSpecs();
  assert.equal(cloudflareBrowserExecution.maximumProcesses,2);assert.equal(cloudflareBrowserExecution.perLaneConcurrency,1);
  assert.equal(lanes.length,nativeBrowserLanes.length,'Browser lane inventory is incomplete');
  assert.deepEqual(lanes.map(lane=>lane.name),nativeBrowserLanes.map(lane=>lane.name),'Browser lane order/identity changed');
  assert.match(source.sourceCommit??'',/^[a-f0-9]{40}$/);assert.match(source.sourceTree??'',/^[a-f0-9]{40}$/);
  assert.ok(Object.keys(source.sourceHashes??{}).length>0,'Parent source inventory is missing');
  const cases=new Map(),profiles=new Set(),browserPids=new Set(),execution=[];
  let common;
  for(const [index,lane] of lanes.entries()){
    const declared=nativeBrowserLanes[index],report=lane.report,selected=selectEthBrowserCaseSpecs(declared.scope);
    assert.equal(lane.readError,undefined,'A browser child report is missing or unreadable: '+lane.name);
    assert.equal(lane.process?.code,0,'Browser child did not exit successfully: '+lane.name);
    assert.equal(lane.process?.signal,null,'Browser child was interrupted: '+lane.name);
    assert.ok(!lane.process?.error,'Browser child execution failed: '+lane.name);
    const originalReport=await verifyFile(out,lane.reportReceipt);
    assert.deepEqual(JSON.parse(originalReport.toString('utf8')),report,'Child report changed after it was read');
    assert.equal(report?.schemaVersion,1);assert.equal(report.kind,'eth-candidate-real-browser');
    assert.equal(report.status,'passed','Browser lane failed: '+lane.name);
    assert.equal(report.lane,lane.name);assert.equal(report.suiteRunId,suiteRunId,'Stale/mixed browser suite report');
    assert.equal(report.caseScope,declared.scope);assert.equal(report.sourceCommit,source.sourceCommit,'Browser source commit differs');
    assert.equal(report.sourceTree,source.sourceTree,'Browser source tree differs');
    assert.deepEqual(report.sourceHashes,source.sourceHashes,'Browser source hashes differ from the parent snapshot');
    assert.equal(report.sourceIntegrity?.checkedFiles,Object.keys(source.sourceHashes).length);
    assert.equal(report.sourceIntegrity?.unchangedDuringRun,true);assert.deepEqual(report.sourceIntegrity.changedSources,[]);
    assert.equal(report.declaredCaseCount,expected.length);assert.equal(report.expectedCaseCount,declared.caseCount);
    assert.equal(selected.length,declared.caseCount);assert.equal(report.cases?.length,selected.length,'Incomplete browser lane');
    assert.deepEqual(report.cases.map(item=>item.caseSpec),selected,'Lane case identity/order changed');
    assert.deepEqual(report.failures,[]);assert.ok(!report.error&&!report.cleanupError,'Browser lane contains an execution/cleanup error');
    assert.ok(Number.isFinite(Date.parse(report.startedAt))&&Number.isFinite(Date.parse(report.finishedAt))
      &&Date.parse(report.finishedAt)>=Date.parse(report.startedAt),'Browser lane completion clock is invalid');
    assert.ok(report.browserVersion&&typeof report.browserVersion.product==='string'&&report.browserVersion.product.length>0,'Actual Chrome version is required');
    assert.ok(Array.isArray(report.koreanFonts)&&report.koreanFonts.length>0,'Korean fonts are required');
    assert.ok(Number.isSafeInteger(report.browserProcess?.pid)&&report.browserProcess.pid>0,'Actual Chrome PID is required');
    assert.ok(typeof report.browserProcess.profile==='string'&&report.browserProcess.profile.length>0,'Actual Chrome profile is required');
    assert.ok(!profiles.has(report.browserProcess.profile)&&!browserPids.has(report.browserProcess.pid),'Browser lanes shared a Chrome process/profile');
    profiles.add(report.browserProcess.profile);browserPids.add(report.browserProcess.pid);
    const shared=Object.fromEntries(['imageLogMode','browserVersion','browserBinary','koreanFonts','expectedObservedEth','expectedObservedBtc'].map(key=>[key,report[key]]));
    if(common)assert.deepEqual(shared,common,'Browser lanes used different browser/source observation environments');else common=shared;
    const directory=resolve(out,'lanes',lane.name),prefix='lanes/'+lane.name;
    for(const item of report.cases){
      const key=caseKey(item.caseSpec);assert.ok(!cases.has(key),'Duplicate browser case: '+key);
      for(const [field,value] of Object.entries(item.caseSpec))if(!['consolidated','replay','chartReplay','resize'].includes(field))
        assert.deepEqual(item[field],value,'Browser case changed its declared '+field);
      assert.equal(item.status,'passed');assert.ok(!item.error&&!item.screenshotFailure,'Browser case contains an error');
      assert.deepEqual(item.runtimeErrors,[]);assert.deepEqual(item.unscopedLocalRequests,[]);assert.deepEqual(item.unexpectedResourceErrors,[]);
      assert.ok(Array.isArray(item.screenshots)&&item.screenshots.length>0,'Every browser case requires rendered evidence');
      for(const shot of item.screenshots)await verifyFile(directory,shot,{png:true});
      cases.set(key,await prefixArtifacts(item,{directory,prefix}));
    }
    assert.ok(report.syntheticFixture,'Browser synthetic fixture is missing');
    await verifyFile(directory,report.syntheticFixture);
    execution.push({name:lane.name,scope:declared.scope,caseCount:report.cases.length,startedAt:report.startedAt,finishedAt:report.finishedAt,
      durationMs:Date.parse(report.finishedAt)-Date.parse(report.startedAt),browserProcess:report.browserProcess,process:lane.process,report:lane.reportReceipt});
  }
  assert.equal(cases.size,expected.length,'Complete ordered browser inventory is required');
  for(const [path,hash] of Object.entries(source.sourceHashes)){
    safePath(path);assert.match(hash,/^[a-f0-9]{64}$/);
    assert.equal(digest(await readFile(resolve(root,path))),hash,'Browser-bound source changed: '+path);
  }
  const sourceFixture=await prefixArtifacts(lanes[0].report.syntheticFixture,{directory:resolve(out,'lanes',lanes[0].name),prefix:'lanes/'+lanes[0].name});
  return {schemaVersion:1,kind:'eth-candidate-real-browser',status:'passed',caseScope:'all',suiteRunId,startedAt,finishedAt,
    ...source,...common,declaredCaseCount:expected.length,expectedCaseCount:expected.length,
    cases:expected.map(spec=>cases.get(caseKey(spec))),failures:[],syntheticFixture:sourceFixture,
    sourceIntegrity:{checkedFiles:Object.keys(source.sourceHashes).length,changedSources:[],unchangedDuringRun:true},
    execution:{kind:'independent-chrome-process-lanes',maximumProcesses:2,perLaneConcurrency:1,lanes:execution},
    scope:'Actual checked-out static site in two separate Chromium processes. Each lane preserves serial native interaction order; no Safari or physical-device claim.'};
}

export async function runNativeBrowserLane({root,out,lane,suiteRunId,environment=process.env,write=line=>process.stdout.write(line),
  command=process.execPath,args=['scripts/verify-eth-candidate-browser.mjs'],onLine=()=>{}}){
  const directory=resolve(out,'lanes',lane.name);await mkdir(directory,{recursive:true});
  const startedAt=new Date().toISOString(),began=Date.now();
  const child=spawn(command,args,{cwd:root,env:{...environment,ATLAS_BROWSER_CASE_SCOPE:lane.scope,ATLAS_BROWSER_LANE:lane.name,
    ATLAS_BROWSER_SUITE_RUN_ID:suiteRunId,ATLAS_BROWSER_OUT:directory},stdio:['ignore','pipe','pipe'],detached:false});
  const streams=[],writers=[];let problem=null;
  // Inherit the suite's process group. The outer gate kills that group on
  // timeout/abort, covering both Node lanes and their Chrome descendants.
  for(const [pipe,input] of [['stdout',child.stdout],['stderr',child.stderr]]){
    const output=createWriteStream(resolve(directory,pipe+'.log'),{flags:'w'}),writer=completeLineWriter(line=>{write(line);if(pipe==='stdout')onLine(line);});
    streams.push(output);writers.push(writer);
    output.on('error',error=>{problem??=error;child.kill('SIGTERM');});
    input.on('data',bytes=>{
      try{output.write(bytes);writer.write(bytes);}catch(error){problem??=error;child.kill('SIGTERM');}
    });
  }
  const outcome=await new Promise(accept=>{
    child.on('error',error=>{problem??=error;});
    child.on('close',(code,signal)=>accept({code,signal}));
  });
  for(const writer of writers)try{writer.end();}catch(error){problem??=error;}
  for(const stream of streams)stream.end();
  for(const stream of streams)try{await finished(stream);}catch(error){problem??=error;}
  const logs=[];
  for(const pipe of ['stdout','stderr']){
    const file=`lanes/${lane.name}/${pipe}.log`,bytes=await readFile(resolve(out,file));logs.push({file,bytes:bytes.length,sha256:digest(bytes)});
  }
  return {name:lane.name,pid:child.pid??null,...outcome,startedAt,finishedAt:new Date().toISOString(),durationMs:Date.now()-began,logs,
    ...(problem?{error:errorText(problem)}:{})};
}

export async function runPhasedNativeBrowserLanes({root,out,source,suiteRunId,environment,write,runLane=runNativeBrowserLane,context,timeoutMs}){
  context??=await readFastCadenceContext({root,source,suiteRunId});
  const barrier=createFastCadenceBarrier({context,timeoutMs,onRelease:release=>write(fastCadenceReleasePrefix+JSON.stringify(release)+'\n')});
  const replay=nativeBrowserLanes.find(lane=>lane.name==='chart-replay'),other=nativeBrowserLanes.find(lane=>lane.name==='non-chart-replay');
  const replayRun=Promise.resolve().then(()=>runLane({root,out,lane:replay,suiteRunId,environment,write,onLine:line=>barrier.observeLine(line)}))
    .then(value=>{barrier.close(value);return value;},error=>{barrier.close({error:errorText(error)});throw error;});
  replayRun.catch(()=>{});
  try{
    const release=await barrier.released;
    // A failed phase permits remaining diagnostics, never a successful suite.
    const otherRun=Promise.resolve().then(()=>runLane({root,out,lane:other,suiteRunId,environment,write}));
    const results=await Promise.allSettled([otherRun,replayRun]);
    const processes=results.map((result,index)=>result.status==='fulfilled'?result.value:{name:nativeBrowserLanes[index].name,code:null,signal:null,error:errorText(result.reason)});
    if(processes[0].startedAt)assert.ok(Date.parse(processes[0].startedAt)>=Date.parse(release.releasedAt),'The non-replay browser started before cadence release');
    return {processes,context,release,error:barrier.error?errorText(barrier.error):null};
  }finally{barrier.dispose();}
}

export async function verifyNativeBrowserSuite({root=defaultRoot,environment=process.env,write=line=>process.stdout.write(line)}={}){
  root=resolve(root);const out=resolve(root,environment.ATLAS_BROWSER_OUT??'build/eth-browser');
  assert.ok(relative(root,out).startsWith('build/'),'Native suite output must be inside its build directory');
  const suiteRunId=environment.ATLAS_BROWSER_SUITE_RUN_ID??randomUUID(),startedAt=new Date().toISOString();
  assert.match(suiteRunId,/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,'The parent browser run nonce is invalid');
  let source={},lanes=[],processes=[],report,phase;
  await mkdir(out,{recursive:true});await rm(resolve(out,'report.json'),{force:true});
  try{
    assert.equal(environment.ATLAS_BROWSER_CASE_SCOPE??'all','all','The suite always verifies the complete browser inventory');
    source=await readBrowserSourceIdentity(root);
    await assertWorkersBuildSource({root,environment,source:{sourceCommit:source.sourceCommit,sourceTree:source.sourceTree}});
    for(const lane of nativeBrowserLanes)await rm(resolve(out,'lanes',lane.name),{recursive:true,force:true});
    phase=await runPhasedNativeBrowserLanes({root,out,source,suiteRunId,environment,write});processes=phase.processes;
    lanes=await readNativeBrowserLaneReports(out,processes);
    report=await combineNativeBrowserLanes({root,out,source,suiteRunId,lanes,startedAt,finishedAt:new Date().toISOString()});
    if(phase.error)throw new Error(phase.error);
    report.fastCadence=assertFastCadenceCaseEvidence(report,phase.release,phase.context);
    assert.deepEqual(await readBrowserSourceIdentity(root),source,'Source revision/inventory changed during the suite');
  }catch(error){
    if(!lanes.length)lanes=await readNativeBrowserLaneReports(out,processes);
    report={schemaVersion:1,kind:'eth-candidate-real-browser',status:'failed',caseScope:'all',suiteRunId,startedAt,
      ...source,declaredCaseCount:createEthBrowserCaseSpecs().length,expectedCaseCount:createEthBrowserCaseSpecs().length,
      cases:[],failures:[{error:errorText(error)}],error:errorText(error),laneReports:lanes,fastCadence:phase?.release??null,
      scope:'Suite verification failed. Complete available child observations are retained in laneReports; no joined pass is asserted.'};
  }
  report.finishedAt=new Date().toISOString();
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeFile(resolve(out,'report.json'),bytes);
  const transport=emitCompressedBrowserReport(bytes,{name:'report.json',log:line=>write(line+'\n')});
  write('ETH_BROWSER_RECEIPT '+JSON.stringify({status:report.status,caseScope:report.caseScope,suiteRunId,sourceCommit:report.sourceCommit,
    declaredCaseCount:report.declaredCaseCount,expectedCaseCount:report.expectedCaseCount,completedCaseCount:report.cases.length,
    report:relative(root,resolve(out,'report.json')),reportBytes:bytes.length,reportSha256:digest(bytes),transport})+'\n');
  return report;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{if((await verifyNativeBrowserSuite()).status!=='passed')process.exitCode=1;}
  catch(error){console.error(errorText(error));process.exitCode=1;}
}
