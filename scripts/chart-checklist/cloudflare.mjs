#!/usr/bin/env node
// Supplementary before/after diagnostics only. No build, model, publication,
// deployment or provider configuration mutation is performed by this wrapper.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {bootstrapCloudflareBuild, runRuntimeCommand} from '../bootstrap-cloudflare-build.mjs';
import {cloudflareRuntime, cloudflarePlanSha256} from '../cloudflare-build-contract.mjs';
import {emitBrowserEvidenceChunks, emitCompressedBrowserReport} from '../browser-evidence-transport.mjs';
import {runVerificationCommand, drainVerificationOutput, installVerificationSignalHandlers} from '../cloudflare-gate-runner.mjs';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const verifier=resolve(root,'scripts/chart-checklist/verify.mjs');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorText=error=>String(error?.stack||error?.message||error).slice(0,12000);
const symbols=Object.freeze(['BTCUSD','ETHUSD','MSTR','TQQQ','SOXL','233740']);
const viewports=Object.freeze([[390,844],[320,740],[768,1024],[1024,768],[1440,900],[1920,1080]]);
const harnessFiles=Object.freeze([
  'scripts/chart-checklist/cloudflare.mjs','scripts/chart-checklist/verify.mjs',
  'scripts/bootstrap-cloudflare-build.mjs','scripts/cloudflare-build-contract.mjs',
  'scripts/browser-evidence-transport.mjs','scripts/cloudflare-gate-runner.mjs',
]);
const imageBudget=Object.freeze({pngBytes:2_000_000,logBytes:2_900_000,individualBytes:2_000_000});
const writeLine=line=>new Promise((accept,reject)=>process.stdout.write(line,error=>error?reject(error):accept()));

async function emitArtifact(bytes,{name,image=false}){
  const lines=[];
  const transport=image
    ?emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',bytes,{name,log:line=>lines.push(line+'\n')})
    :emitCompressedBrowserReport(bytes,{name,log:line=>lines.push(line+'\n')});
  let batch=0,logBytes=0;
  for(const line of lines){
    await writeLine(line);batch+=Buffer.byteLength(line);logBytes+=Buffer.byteLength(line);
    if(batch>=64_000){await drainVerificationOutput();await new Promise(accept=>setTimeout(accept,100));batch=0;}
  }
  await drainVerificationOutput();
  return {...transport,logBytes};
}

function validateNativeReport(report,manifestBytes,{phase,item,source,identity,harness}){
  assert.equal(report.kind,'atlas-chart-checklist-native-browser');
  assert.equal(report.item,item);assert.equal(report.phase,phase);
  assert.equal(report.productionDeployment,false);assert.equal(report.qualifiesFullVerification,false);
  assert.equal(report.sourceDirectory,source);assert.equal(report.completeRequestedMatrix,true);
  assert.deepEqual(report.symbols,symbols);assert.deepEqual(report.viewports,viewports);
  assert.equal(report.status,phase==='before'?'OBSERVED':'PASS');
  assert.equal(report.error,undefined);assert.deepEqual(report.failures,[]);assert.deepEqual(report.serverErrors,[]);
  assert.equal(report.sourceIdentity.sourceCommit,identity.sourceCommit);
  assert.equal(report.sourceIdentity.sourceTree,identity.sourceTree);
  assert.equal(report.sourceIdentity.dirty,false);assert.equal(report.sourceIdentity.workingChanges,'');
  assert.equal(report.inspector.sha256,harness['scripts/chart-checklist/verify.mjs']);
  assert.equal(report.inspector.node,cloudflareRuntime.node);
  assert.equal(report.sourceManifest.file,'source-manifest.json');
  assert.equal(digest(manifestBytes),report.sourceManifest.sha256,'Source manifest bytes differ from the native report');
  const manifest=JSON.parse(manifestBytes);
  assert.equal(digest(JSON.stringify(manifest.files)),manifest.sha256,'Source manifest inventory hash is invalid');
  assert.deepEqual(Object.keys(manifest.files).sort(),identity.distFiles,'Native server inventory differs from the exact committed dist file list');
  assert.equal(report.sourceManifest.fileCount,identity.distFiles.length);
  assert.equal(report.sourceIdentity.distTreeSha256,manifest.sha256);
  assert.equal(report.sourceIdentity.afterDistTreeSha256,manifest.sha256,'Served dist bytes changed during the phase');
  const expected=viewports.flatMap(([width,height])=>symbols.map(symbol=>({symbol,width,height})));
  assert.deepEqual(report.cases.map(({symbol,width,height})=>({symbol,width,height})),expected,'Every phase requires all 36 explicit cases');
  assert.equal(new Set(report.cases.map(value=>value.contextId)).size,expected.length,'Each case requires a separate browser context');
  for(const row of report.cases){
    assert.ok(typeof row.contextId==='string'&&row.contextId.length>0);
    assert.equal(row.status,phase==='before'?'OBSERVED':'PASS',row.id);
    assert.deepEqual(row.runtimeErrors,[],row.id+' has unhandled browser errors');
    assert.ok(row.measured&&row.checks&&row.dataIdentity,row.id+' has no measured source-bound result');
    assert.ok(row.screenshots.some(image=>image.file===row.id+'-chart.png'),row.id+' has no chart screenshot');
    if(phase==='after')assert.deepEqual(row.mismatches,[],row.id+' did not meet the requested checklist contract');
  }
  return {caseCount:expected.length,distTreeSha256:manifest.sha256,
    baselineMismatchCases:phase==='before'?report.cases.filter(value=>value.mismatches.length>0).length:0};
}

export async function runChecklistCloudflare(args=process.argv.slice(2)){
  const options=new Map();
  for(let index=0;index<args.length;index+=2){
    assert.ok(['--item','--baseline'].includes(args[index])&&args[index+1]&&!options.has(args[index]),'Use --item R0 --baseline <full commit SHA>');
    options.set(args[index],args[index+1]);
  }
  const item=String(options.get('--item')||'R0').toUpperCase(),baseline=options.get('--baseline');
  assert.equal(item,'R0','Only the current R0 verifier is implemented');
  assert.match(baseline??'',/^[a-f0-9]{40}$/,'--baseline must be an exact full commit SHA');
  assert.equal(process.version,cloudflareRuntime.node,'Set NODE_VERSION=24.22.2 in the verification-only Workers Build');
  assert.equal(process.platform,cloudflareRuntime.platform);assert.equal(process.arch,cloudflareRuntime.arch);
  const started=Date.now(),deadline=started+19*60*1000,controller=new AbortController();
  const removeSignals=installVerificationSignalHandlers(controller);
  const deadlineTimer=setTimeout(()=>controller.abort(new Error('Checklist diagnostic exceeded its 19 minute budget')),Math.max(1,deadline-Date.now()));
  const remaining=(reserve=0)=>{controller.signal.throwIfAborted();const value=deadline-Date.now()-reserve;assert.ok(value>1000,'Checklist diagnostic time budget exhausted');return value;};
  const directory=resolve(root,'build/chart-checklist-cloudflare',item);
  await mkdir(directory,{recursive:true});
  const receipt={schemaVersion:1,kind:'atlas-chart-checklist-cloudflare',item,baseline,status:'RUNNING',
    diagnosticOnly:true,productionDeployment:false,qualifiesForPublication:false,canonicalGatesUnchanged:true,
    canonicalGatePlanSha256:cloudflarePlanSha256,startedAt:new Date(started).toISOString(),maximumDurationMs:19*60*1000,
    providerBuildUuid:process.env.WORKERS_CI_BUILD_UUID??null,phases:[],errors:[],
    screenshotTransport:{budget:imageBudget,pngBytes:0,logBytes:0,emitted:[],omitted:[],failureImageEmitted:false},
    scope:'Exact committed dist before/after comparison. Baseline OBSERVED preserves known failures; after PASS requires 36 source-bound cases. This does not qualify a model, full CI or production deployment.',
    dependencyInstallation:'Not needed: the focused verifier and runtime bootstrap use Node built-ins and committed modules only.'};
  let temporary,baselineDirectory,baselineAdded=false;
  const git=async(parameters,{cwd=root,allowFailure=false,cleanup=false,timeout=15000}={})=>runRuntimeCommand('git',parameters,{cwd,allowFailure,timeout:cleanup?10000:Math.min(timeout,remaining(20000))});
  const gitText=async(parameters,options)=>(await git(parameters,options)).output.trim();
  async function sourceIdentity(source){
    assert.equal(await gitText(['status','--porcelain=v1','--untracked-files=all'],{cwd:source}),'','Verification requires a completely clean committed source checkout');
    const distFiles=(await gitText(['ls-tree','-r','--name-only','HEAD','--','dist'],{cwd:source})).split('\n').filter(Boolean).sort();
    assert.ok(distFiles.includes('dist/index.html'));
    return {sourceCommit:await gitText(['rev-parse','HEAD'],{cwd:source}),sourceTree:await gitText(['rev-parse','HEAD^{tree}'],{cwd:source}),
      distGitTreeSha256:digest(await gitText(['ls-tree','-r','HEAD','--','dist'],{cwd:source})),distFiles};
  }
  const harnessIdentity=async()=>Object.fromEntries(await Promise.all(harnessFiles.map(async file=>[file,digest(await readFile(resolve(root,file)))])));
  async function phaseEvidence(phase,source,identity,runtime){
    const phaseDirectory=resolve(directory,phase);await mkdir(phaseDirectory,{recursive:true});
    const result={phase,sourceCommit:identity.sourceCommit,sourceTree:identity.sourceTree,status:'RUNNING',errors:[],artifacts:[],startedAt:new Date().toISOString()};
    receipt.phases.push(result);
    console.log('CHECKLIST_PHASE_START '+JSON.stringify({item,phase,sourceCommit:identity.sourceCommit,cases:36,remainingMs:remaining()}));
    let native,reportBytes,manifestBytes;
    try{
      await rm(resolve(phaseDirectory,'report.json'),{force:true});await rm(resolve(phaseDirectory,'source-manifest.json'),{force:true});
      const command=[verifier,'--item',item,'--source',source,'--phase',phase,'--out',phaseDirectory];
      try{
        result.process=await runVerificationCommand(process.execPath,command,{id:'checklist-'+item+'-'+phase,cwd:root,
          environment:{...process.env,...runtime.environment},deadline:Math.min(Date.now()+6*60*1000,deadline-25000),signal:controller.signal,
          log:bytes=>process.stdout.write(bytes)});
      }catch(error){result.errors.push(errorText(error));}
      reportBytes=await readFile(resolve(phaseDirectory,'report.json'));native=JSON.parse(reportBytes);
      result.nativeStatus=native.status;result.caseCount=native.cases?.length??0;result.failures=native.failures;
      manifestBytes=await readFile(resolve(phaseDirectory,'source-manifest.json'));
      const validation=validateNativeReport(native,manifestBytes,{phase,item,source,identity,harness:receipt.harness});
      Object.assign(result,validation);
      assert.equal(result.process?.code,0,'Native browser process did not exit successfully');
    }catch(error){result.errors.push(errorText(error));}
    finally{
      try{assert.deepEqual(await sourceIdentity(source),identity,'Source commit/tree or working bytes changed during this phase');
        assert.deepEqual(await harnessIdentity(),receipt.harness,'The current verifier source changed during capture');
      }catch(error){result.errors.push(errorText(error));}
      // Partial and failed native receipts remain evidence; they never pass
      // validation simply because their bytes can be transported.
      for(const [file,role]of [['report.json','native-report'],['source-manifest.json','source-manifest']]){
        try{
          const bytes=file==='report.json'?(reportBytes??await readFile(resolve(phaseDirectory,file))):(manifestBytes??await readFile(resolve(phaseDirectory,file)));
          assert.ok(bytes.length<=16*1024*1024,'Diagnostic JSON exceeds the transport bound');
          const transport=await emitArtifact(bytes,{name:`chart-checklist-${item.toLowerCase()}-${phase}/${file}`});
          result.artifacts.push({role,...transport});console.log('CHECKLIST_ARTIFACT '+JSON.stringify({item,phase,role,...transport}));
        }catch(error){result.errors.push(errorText(error));}
      }
      if(native?.cases)try{
        const images=native.cases.flatMap(row=>row.screenshots??[]),names=new Set();
        for(const image of images){
          assert.match(image.file,/^[a-z0-9-]+\.png$/);assert.ok(!names.has(image.file),'Duplicate screenshot name');names.add(image.file);
          assert.ok(Number.isSafeInteger(image.bytes)&&image.bytes>0&&image.bytes<=imageBudget.individualBytes);assert.match(image.sha256,/^[a-f0-9]{64}$/);
        }
        const required=['tqqq-1440x900-chart.png','btcusd-390x844-chart.png'];
        const selected=required.map(file=>images.find(image=>image.file===file)).filter(Boolean);
        for(const file of required)if(!names.has(file))result.errors.push('Required representative screenshot missing: '+file);
        const failure=!receipt.screenshotTransport.failureImageEmitted&&images.find(image=>image.file.endsWith('-failure.png'));
        if(failure&&!selected.includes(failure))selected.push(failure);
        for(const image of selected){
          const bytes=await readFile(resolve(phaseDirectory,image.file));
          assert.equal(bytes.length,image.bytes);assert.equal(digest(bytes),image.sha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
          const name=`chart-checklist-${item.toLowerCase()}-${phase}/${image.file}`,lines=[];
          emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',bytes,{name,log:line=>lines.push(line+'\n')});
          const logBytes=lines.reduce((sum,line)=>sum+Buffer.byteLength(line),0),budget=receipt.screenshotTransport;
          if(budget.pngBytes+bytes.length>imageBudget.pngBytes||budget.logBytes+logBytes>imageBudget.logBytes){
            budget.omitted.push({phase,...image,reason:'Declared combined PNG/log budget exceeded'});
            if(required.includes(image.file))result.errors.push('Required screenshot exceeds transport budget: '+image.file);
            continue;
          }
          const transport=await emitArtifact(bytes,{name,image:true});assert.equal(transport.logBytes,logBytes);
          budget.pngBytes+=bytes.length;budget.logBytes+=transport.logBytes;budget.emitted.push({phase,...transport});
          if(image===failure)budget.failureImageEmitted=true;
          result.artifacts.push({role:'screenshot',...transport});console.log('CHECKLIST_ARTIFACT '+JSON.stringify({item,phase,role:'screenshot',...transport}));
        }
        const selectedNames=new Set(selected.map(image=>image.file));
        for(const image of images)if(!selectedNames.has(image.file))receipt.screenshotTransport.omitted.push({phase,...image,reason:'Additional original capture retained in native report; representative transport only'});
      }catch(error){result.errors.push(errorText(error));}
      result.status=result.errors.length?'FAIL':phase==='before'?'OBSERVED':'PASS';result.finishedAt=new Date().toISOString();
      if(result.errors.length)receipt.errors.push(...result.errors.map(error=>phase+': '+error));
      console.log('CHECKLIST_PHASE_COMPLETE '+JSON.stringify({item,phase,status:result.status,nativeStatus:result.nativeStatus,cases:result.caseCount,
        baselineMismatchCases:result.baselineMismatchCases,sourceCommit:result.sourceCommit,artifacts:result.artifacts,errors:result.errors.map(error=>error.split('\n')[0])}));
      await drainVerificationOutput();
    }
  }
  try{
    receipt.currentSource=await sourceIdentity(root);
    await git(['ls-files','--error-unmatch','--',...harnessFiles]);
    await git(['diff','--exit-code','HEAD','--',...harnessFiles]);
    receipt.harness=await harnessIdentity();
    assert.notEqual(receipt.currentSource.sourceCommit,baseline,'Before and after must identify different source commits');
    console.log('CHECKLIST_START '+JSON.stringify({item,baseline,currentSource:receipt.currentSource.sourceCommit,
      diagnosticOnly:true,productionDeployment:false,canonicalGatePlanSha256:cloudflarePlanSha256,maximumDurationMs:receipt.maximumDurationMs}));
    if((await git(['cat-file','-e',baseline+'^{commit}'],{allowFailure:true})).code!==0)
      await git(['fetch','--no-tags','--depth=1','origin',baseline],{timeout:120000});
    assert.equal(await gitText(['rev-parse',baseline+'^{commit}']),baseline);
    temporary=await mkdtemp(resolve(tmpdir(),'atlas-checklist-baseline-'));baselineDirectory=resolve(temporary,'source');
    await git(['worktree','add','--detach',baselineDirectory,baseline],{timeout:120000});baselineAdded=true;
    receipt.baselineSource=await sourceIdentity(baselineDirectory);assert.equal(receipt.baselineSource.sourceCommit,baseline);
    console.log('CHECKLIST_RUNTIME_START '+JSON.stringify({node:process.version,remainingMs:remaining()}));
    const runtime=await bootstrapCloudflareBuild({root,timeoutMs:Math.min(8*60*1000,remaining(25000)),log:text=>process.stdout.write(text)});
    receipt.runtime=runtime.receipt;
    console.log('CHECKLIST_RUNTIME_READY '+JSON.stringify({node:process.version,chrome:runtime.receipt.chrome.version,remainingMs:remaining()}));
    await phaseEvidence('before',baselineDirectory,receipt.baselineSource,runtime);
    remaining(30000);await phaseEvidence('after',root,receipt.currentSource,runtime);
    assert.deepEqual(await sourceIdentity(root),receipt.currentSource,'Committed candidate identity changed during the diagnostic');
    assert.deepEqual(await harnessIdentity(),receipt.harness,'Verifier hashes changed during the diagnostic');
    receipt.status=receipt.errors.length||receipt.phases.length!==2||receipt.phases[0].status!=='OBSERVED'||receipt.phases[1].status!=='PASS'?'FAIL':'PASS';
  }catch(error){receipt.status='FAIL';receipt.errors.push(errorText(error));}
  finally{
    try{
      if(baselineAdded)try{await git(['worktree','remove','--force',baselineDirectory],{cleanup:true});baselineAdded=false;}catch(error){receipt.status='FAIL';receipt.errors.push(errorText(error));}
      if(temporary&&!baselineAdded)try{await rm(temporary,{recursive:true,force:true});}catch(error){receipt.status='FAIL';receipt.errors.push(errorText(error));}
      receipt.finishedAt=new Date().toISOString();receipt.durationMs=Date.now()-started;
      receipt.screenshotTransport.meaning='Only listed original PNG bytes were emitted. Retrieval must validate complete chunks and SHA-256 hashes; missing artifacts are never treated as delivered.';
      const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');await writeFile(resolve(directory,'diagnostic.json'),bytes);
      const transport=await emitArtifact(bytes,{name:`chart-checklist-${item.toLowerCase()}/diagnostic.json`});
      console.log('CHECKLIST_COMPLETE '+JSON.stringify({item,status:receipt.status,baseline,currentSource:receipt.currentSource?.sourceCommit,
        diagnosticOnly:true,productionDeployment:false,qualifiesForPublication:false,durationMs:receipt.durationMs,
        phases:receipt.phases.map(({phase,status,caseCount,sourceCommit})=>({phase,status,caseCount,sourceCommit})),transport,
        images:receipt.screenshotTransport.emitted.length,pngBytes:receipt.screenshotTransport.pngBytes,errors:receipt.errors.map(error=>error.split('\n')[0])}));
      await drainVerificationOutput();
    }finally{clearTimeout(deadlineTimer);removeSignals();}
  }
  return receipt;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const receipt=await runChecklistCloudflare();if(receipt.status!=='PASS')process.exitCode=1;}
  catch(error){console.error('CHECKLIST_ERROR '+errorText(error));process.exitCode=1;}
}
