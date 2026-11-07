#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bootstrapCloudflareBuild,inspectCloudflareRuntime,startIsolatedPostgres} from './bootstrap-cloudflare-build.mjs';
import {cloudflareBuildGates,cloudflareParallelGroups,cloudflareBrowserCaseCount,cloudflarePlanSha256,assertCloudflareVerificationReceipt} from './cloudflare-build-contract.mjs';
import {createEthBrowserCaseSpecs} from './eth-browser-case-specs.mjs';
import {executeLoggedGate,runVerificationCommand,runVerificationGroup,installVerificationSignalHandlers} from './cloudflare-gate-runner.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),out=resolve(root,'build/cloudflare-verification');
const receiptPath=resolve(root,'build/cloudflare-verification.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
const source=()=>({sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}')});
function assertCleanSource(expected){
  assert.deepEqual(source(),expected,'Source revision changed during verification');
  assert.equal(git('status','--porcelain','--untracked-files=normal'),'','Verification requires committed unchanged source, including new files');
  if(process.env.WORKERS_CI_COMMIT_SHA)assert.equal(expected.sourceCommit,process.env.WORKERS_CI_COMMIT_SHA,'Checkout differs from the Cloudflare build source');
}
async function persist(receipt){
  await mkdir(resolve(root,'build'),{recursive:true});
  const temporary=receiptPath+'.tmp';await writeFile(temporary,JSON.stringify(receipt,null,2)+'\n');await rename(temporary,receiptPath);
}
export function assertCompleteNativeBrowserReport(report,sourceCommit){
  assert.equal(report.status,'passed','Native browser failures cannot become a deployment pass');
  assert.equal(report.caseScope,'all','A partial scope cannot satisfy the complete browser gate');
  assert.equal(report.sourceCommit,sourceCommit,'Browser evidence belongs to another revision');
  assert.equal(report.declaredCaseCount,cloudflareBrowserCaseCount);
  assert.equal(report.expectedCaseCount,cloudflareBrowserCaseCount);
  assert.equal(report.cases?.length,cloudflareBrowserCaseCount);
  assert.deepEqual(report.cases.map(item=>item.caseSpec),createEthBrowserCaseSpecs(),'Browser cases must match the complete ordered source inventory');
  assert.deepEqual(report.failures,[]);
  assert.equal(report.sourceIntegrity?.unchangedDuringRun,true);
  assert.ok(report.sourceIntegrity.checkedFiles>0,'Browser source hashes are required');
  assert.deepEqual(report.sourceIntegrity.changedSources,[]);
  for(const item of report.cases){assert.equal(item.status,'passed');assert.ok(item.screenshots?.length>0,'Every browser case requires actual rendered evidence');}
}
export async function verifyCloudflareBuild(){
  const identity=source(),startedAt=new Date().toISOString(),deadline=Date.now()+19*60*1000;
  const receipt={schemaVersion:1,kind:'atlas-cloudflare-verification',status:'RUNNING',...identity,startedAt,
    provider:process.env.WORKERS_CI==='1'?'cloudflare-workers-builds':'local',
    runId:process.env.WORKERS_CI_BUILD_UUID??randomUUID(),planSha256:cloudflarePlanSha256,gates:[],executionGroups:[],browser:null,
    heavyResearchQualification:'separate-evidence-obligation',scheduledRefreshActivation:'not-inferred-from-build-success'};
  await mkdir(out,{recursive:true});await persist(receipt);
  // Keep the existing bounded representative PNG transport in the authenticated
  // build log so successful renders can be inspected after the runner exits.
  let environment={...process.env,ATLAS_BROWSER_CASE_SCOPE:'all',ATLAS_BROWSER_OUT:'build/eth-browser',ETH_BROWSER_IMAGE_LOG_MODE:'representative'},database;
  // Never reuse a caller-supplied database or let an optional browser scope turn
  // the same command into a weaker deployment gate.
  delete environment.TEST_DATABASE_URL;
  const cancellation=new AbortController();
  let removeSignalHandlers;
  async function execute(gate,{signal=cancellation.signal}={}){
    const gateEnvironment={...environment};
    console.log('ATLAS_CLOUDFLARE_GATE '+JSON.stringify({id:gate.id,status:'RUNNING'}));
    return executeLoggedGate({id:gate.id,root,directory:out,signal,run:async({log,signal})=>{
      if(gate.kind==='runtime'){
        const runtime=await bootstrapCloudflareBuild({root,log,timeoutMs:Math.min(8*60*1000,deadline-Date.now())});
        environment={...environment,...runtime.environment};receipt.runtime=runtime.receipt;
        database=await startIsolatedPostgres({log,...runtime.postgres,environment});environment.TEST_DATABASE_URL=database.url;
        receipt.database={serverVersion:database.serverVersion,host:'127.0.0.1',isolated:true};
        log(JSON.stringify(runtime.receipt)+'\n');
      }else{
        let command=gate.command==='node'?process.execPath:gate.command,args=gate.args;
        if(gate.kind==='node-tests'){
          command=process.execPath;
          const files=(await readdir(resolve(root,gate.directory))).filter(file=>file.endsWith(gate.extension)).sort();
          assert.ok(files.length,'The test inventory is empty: '+gate.directory);
          args=['--import','tsx','--test','--test-concurrency=2',...files.map(file=>gate.directory+'/'+file)];
        }
        const remaining=deadline-Date.now();assert.ok(remaining>1000,'The free20-minute build bound requires another complete attempt; gates cannot be skipped');
        await runVerificationCommand(command,args,{id:gate.id,cwd:root,environment:gateEnvironment,deadline,signal,log});
      }
    },validate:async({logBytes})=>{
    const details={};
    if(gate.id==='native-browser'){
      const bytes=await readFile(resolve(root,'build/eth-browser/report.json')),report=JSON.parse(bytes.toString('utf8'));
      assertCompleteNativeBrowserReport(report,identity.sourceCommit);
      for(const [path,digest] of Object.entries(report.sourceHashes))assert.equal(sha(await readFile(resolve(root,path))),digest,'Browser-bound source changed: '+path);
      for(const item of report.cases)for(const screenshot of item.screenshots){
        const location=resolve(root,'build/eth-browser',screenshot.file);
        assert.ok(location.startsWith(resolve(root,'build/eth-browser')+'/'),'Unsafe browser screenshot path');
        const bytes=await readFile(location);assert.equal(bytes.length,screenshot.bytes);assert.equal(sha(bytes),screenshot.sha256,'Browser screenshot changed');
      }
      details.browser={caseCount:report.cases.length,scope:report.caseScope,sourceCommit:report.sourceCommit,sourceIntegrity:true,
        report:'build/eth-browser/report.json',reportSha256:sha(bytes),browserVersion:report.browserVersion};
    }
    if(gate.id==='model-tests'){
      const log=logBytes.toString('utf8');
      const total=log.match(/^ATLAS_TEST_TOTAL (.+)$/m);assert.ok(total,'Complete numerical/model test receipt is missing');
      const result=JSON.parse(total[1]);assert.equal(result.complete,true);assert.equal(result.fail,0);assert.ok(result.pass>0);assert.equal(result.batches,1,'The canonical runtime must not fall back to Docker');
      details.modelTests=result;
    }
    return details;
    }});
  }
  async function record(results){
    for(const result of results){
      const entry=result.status==='fulfilled'?result.value.gate:result.reason.gateResult;
      if(entry){receipt.gates.push(entry);console.log('ATLAS_CLOUDFLARE_GATE '+JSON.stringify(entry));}
      if(result.status==='fulfilled')Object.assign(receipt,result.value.details);
    }
    await persist(receipt);
    const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(errors.length)throw new AggregateError(errors,'Required Cloudflare verification gate failed: '+errors.map(error=>error.message).join('; '));
  }
  try{
    assertCleanSource(identity);
    for(let index=0;index<cloudflareBuildGates.length;index++){
      const gate=cloudflareBuildGates[index],group=cloudflareParallelGroups.find(ids=>ids[0]===gate.id);
      if(group){
        const gates=cloudflareBuildGates.slice(index,index+group.length);
        assert.deepEqual(gates.map(item=>item.id),group,'Parallel gates must remain adjacent in the complete plan');
        assertCleanSource(identity);
        const result=await runVerificationGroup(gates,execute,{signal:cancellation.signal});
        receipt.executionGroups.push(result.measurement);
        console.log('ATLAS_CLOUDFLARE_EXECUTION_GROUP '+JSON.stringify(result.measurement));
        await record(result.settled);assertCleanSource(identity);index+=group.length-1;
      }else{
        await record(await Promise.allSettled([execute(gate)]));
      }
      // Bootstrap keeps its existing process-level termination behavior. Once
      // it finishes, every command is a managed process group with joined IO.
      if(gate.kind==='runtime'){
        removeSignalHandlers=installVerificationSignalHandlers(cancellation);
      }
      cancellation.signal.throwIfAborted();
    }
    assertCleanSource(identity);
    const manifest=JSON.parse(await readFile(resolve(root,'dist/publication.json'),'utf8'));
    assert.equal(manifest.sourceCommit,identity.sourceCommit);assert.equal(manifest.sourceTree?.status,'clean');
    receipt.publication={sourceCommit:manifest.sourceCommit,manifestSha256:manifest.manifestSha256};
    await database?.cleanup();database=null;
    cancellation.signal.throwIfAborted();
    receipt.completedAt=new Date().toISOString();receipt.status='PASS';
    assertCloudflareVerificationReceipt(receipt,identity);await persist(receipt);
    cancellation.signal.throwIfAborted();
    console.log('ATLAS_CLOUDFLARE_VERIFICATION '+JSON.stringify(receipt));
    return receipt;
  }catch(error){
    receipt.status='FAIL';receipt.completedAt=new Date().toISOString();receipt.error=error.stack??String(error);await persist(receipt);throw error;
  }finally{
    removeSignalHandlers?.();
    await database?.cleanup();
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.length&&!(args.length===1&&args[0]==='--inspect'))throw new Error('Use no arguments for complete verification, or --inspect for runtime capabilities only');
    if(args[0]==='--inspect'){
      // An inspect request explicitly invalidates a stale success receipt.
      await persist({schemaVersion:1,kind:'atlas-cloudflare-verification',status:'INSPECTED_ONLY',...source(),gates:[]});
      console.log('ATLAS_CLOUDFLARE_PREFLIGHT '+JSON.stringify(await inspectCloudflareRuntime()));
    }else await verifyCloudflareBuild();
  }catch(error){console.error(error.stack??error);process.exitCode=1;}
}
