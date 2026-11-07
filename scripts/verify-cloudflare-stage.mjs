import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bootstrapCloudflareBuild,bootstrapCloudflareFormal,startIsolatedPostgres} from './bootstrap-cloudflare-build.mjs';
import {assertModelPriorityReceipt,assertCompleteNativeBrowserReport} from './cloudflare-build-contract.mjs';
import {
  cloudflareStageGates,cloudflareStagedPolicy,stageIdentityFromEnvironment,summarizeStageRuntime,
  assertModelComponent,assertBrowserComponent,assertAcceptedModelStage,browserBuildIdentity,createStagedVerification,
} from './cloudflare-staged-contract.mjs';
import {cloudflareModelProviderPolicy,serializeModelComponent} from './cloudflare-model-provider-policy.mjs';
import {executeLoggedGate,runVerificationCommand,installVerificationSignalHandlers,drainVerificationOutput,completeLineWriter} from './cloudflare-gate-runner.mjs';
import {commandPriorityPrefix} from './cloudflare-priority-command.mjs';
import {readBrowserSourceIdentity} from './browser-source-identity.mjs';
import {readBrowserBuildSource,assertBrowserBuildSource} from './cloudflare-browser-source.mjs';
import {readFastCadenceContext,createFastCadenceReleaseWaiter,assertFastCadenceCaseEvidence} from './browser-fast-cadence-contract.mjs';

const repositoryRoot=fileURLToPath(new URL('..',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export function parseCloudflareStageArguments(args){
  assert.equal(args.length,2,'Staged verification requires exactly --stage=model|browser and --mode=production|review');
  const stage=args.find(value=>value.startsWith('--stage='))?.slice(8),mode=args.find(value=>value.startsWith('--mode='))?.slice(7);
  assert.ok(['model','browser'].includes(stage),'Unknown verification stage');assert.ok(['production','review'].includes(mode),'Unknown verification mode');
  assert.deepEqual([...args].sort(),[`--mode=${mode}`,`--stage=${stage}`].sort(),'Unrecognized staged verification arguments');
  return {stage,mode};
}

// This executor enumerates the committed plan; callers cannot provide a subset
// or manufacture a successful empty preparation run. The browser acceptance
// barrier is independent of its later, unchanged intra-browser cadence barrier.
export async function executeCloudflareStagePlan({stage,execute,record,beforeNative=async()=>{},afterGate=async()=>{},signal}){
  for(const gate of cloudflareStageGates(stage)){
    signal?.throwIfAborted();
    if(gate.id==='native-browser')await beforeNative();
    signal?.throwIfAborted();
    await record(await Promise.allSettled([execute(gate)]));
    await afterGate(gate);signal?.throwIfAborted();
  }
}

export function validateStagedModelGate({value,logBytes}){
  const lines=logBytes.toString('utf8').split('\n');
  const priorities=lines.filter(line=>line.startsWith(commandPriorityPrefix));
  assert.equal(priorities.length,1,'One actual model-command priority observation is required');
  const modelPriority=assertModelPriorityReceipt(JSON.parse(priorities[0].slice(commandPriorityPrefix.length)));
  assert.equal(modelPriority.wrapperPid,value.pid,'Priority evidence belongs to another managed command');
  const totals=lines.filter(line=>line.startsWith('ATLAS_TEST_TOTAL '));
  assert.equal(totals.length,1,'One complete canonical model test receipt is required');
  const modelTests=JSON.parse(totals[0].slice('ATLAS_TEST_TOTAL '.length));
  assert.deepEqual(Object.keys(modelTests).sort(),['batches','complete','fail','pass','skipped','tests']);
  assert.equal(modelTests.complete,true);assert.equal(modelTests.batches,1,'The canonical runtime must not fall back to Docker');
  assert.ok(Number.isSafeInteger(modelTests.tests)&&modelTests.tests>0);assert.equal(modelTests.pass,modelTests.tests);
  assert.equal(modelTests.fail,0);assert.equal(modelTests.skipped,0);
  assert.ok(Number.isFinite(Date.parse(value.launchedAt)),'The actual managed model launch clock is required');
  return {modelPriority,modelManagedPid:value.pid,modelLaunchedAt:value.launchedAt,modelTests};
}

export async function verifyCloudflareStage({stage,mode,root=repositoryRoot}={}){
  cloudflareStageGates(stage);assert.ok(['production','review'].includes(mode));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
  const source=()=>({sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}')});
  const sourceIdentity=source(),startedAt=new Date().toISOString(),deadline=Date.now()+cloudflareStagedPolicy.maximumExecutionMs;
  const out=resolve(root,`build/cloudflare-stage-${stage}`),componentPath=resolve(root,`build/cloudflare-${stage}-component.json`),
    aggregatePath=resolve(root,'build/cloudflare-verification.json');
  const persist=async(path,value,{canonical=false}={})=>{
    await mkdir(resolve(root,'build'),{recursive:true});
    const temporary=path+'.tmp';await writeFile(temporary,canonical?serializeModelComponent(value):JSON.stringify(value,null,2)+'\n');await rename(temporary,path);
  };
  // Invalidate any cached deployment success before checking environment or
  // source. A component is explicitly ineligible to deploy the product.
  await persist(aggregatePath,{schemaVersion:1,kind:'atlas-cloudflare-staged-verification',status:'RUNNING',qualifiesFullVerification:false,
    ...sourceIdentity,stage,startedAt,gates:[]});
  let receipt={schemaVersion:1,kind:`atlas-cloudflare-${stage}-component`,stage,status:'RUNNING',qualifiesFullVerification:false,
    ...sourceIdentity,startedAt,gates:[]};
  await persist(componentPath,receipt);
  let environment={...process.env,ATLAS_VERIFICATION_MODE:mode,ATLAS_VERIFICATION_STAGE:stage,ATLAS_BROWSER_CASE_SCOPE:'all',ATLAS_BROWSER_OUT:'build/eth-browser',ETH_BROWSER_IMAGE_LOG_MODE:'representative'};
  delete environment.TEST_DATABASE_URL;
  const cancellation=new AbortController();
  let removeSignalHandlers,verificationError,database,acceptedModel,fastCadenceContext,fastCadenceWaiter;
  function assertCleanSource({remote=false}={}){
    assert.deepEqual(source(),sourceIdentity,'Source revision changed during staged verification');
    assert.equal(git('status','--porcelain','--untracked-files=normal'),'','Verification requires committed unchanged source, including new files');
    if(stage==='browser'){
      assertBrowserBuildSource(receipt.providerSource,{source:sourceIdentity,environment,mode,branch:receipt.branch,runId:receipt.runId});
      if(remote)assert.deepEqual(readBrowserBuildSource({root,environment,mode,source:sourceIdentity}),receipt.providerSource,'The frozen browser source changed');
    }else assert.equal(environment.WORKERS_CI_COMMIT_SHA,sourceIdentity.sourceCommit,'Checkout differs from the actual Workers Build source');
  }
  async function execute(gate){
    console.log('ATLAS_CLOUDFLARE_GATE '+JSON.stringify({stage,id:gate.id,status:'RUNNING'}));
    return executeLoggedGate({id:gate.id,root,directory:out,signal:cancellation.signal,run:async({log,signal})=>{
      if(gate.kind==='runtime'){
        const bootstrap=stage==='model'?bootstrapCloudflareFormal:bootstrapCloudflareBuild;
        const runtime=await bootstrap({root,log,timeoutMs:Math.min(stage==='model'?180000:480000,deadline-Date.now())});
        environment={...environment,...runtime.environment};receipt.runtime=summarizeStageRuntime(runtime.receipt,stage);
        if(stage==='browser'){
          database=await startIsolatedPostgres({log,...runtime.postgres,environment});environment.TEST_DATABASE_URL=database.url;
          receipt.database={serverVersion:database.serverVersion,host:'127.0.0.1',isolated:true};
        }
        log(JSON.stringify(receipt.runtime)+'\n');return;
      }
      let command=gate.command==='node'?process.execPath:gate.command,args=gate.args;
      if(gate.kind==='node-tests'){
        command=process.execPath;
        const files=(await readdir(resolve(root,gate.directory))).filter(file=>file.endsWith(gate.extension)).sort();
        assert.ok(files.length,'The test inventory is empty: '+gate.directory);
        args=['--import','tsx','--test','--test-concurrency=2',...files.map(file=>gate.directory+'/'+file)];
      }
      assert.ok(deadline-Date.now()>1000,'The unchanged execution budget requires a new complete attempt; gates cannot be skipped');
      if(gate.nice!==undefined){assert.equal(gate.id,'model-tests');assert.equal(gate.nice,0);}
      let commandError;
      const phaseLines=gate.id==='native-browser'?completeLineWriter(line=>fastCadenceWaiter.observeLine(line)):null;
      try{
        return await runVerificationCommand(command,args,{id:gate.id,cwd:root,environment:{...environment},deadline,signal,nice:gate.nice,
          log:(bytes,pipe)=>{log(bytes,pipe);if(pipe==='stdout')phaseLines?.write(bytes);}});
      }catch(error){commandError=error;if(gate.id==='native-browser')fastCadenceWaiter?.fail(error);throw error;}
      finally{
        if(phaseLines)try{phaseLines.end();}finally{
          if(!fastCadenceWaiter.release)fastCadenceWaiter.fail(new Error('Native browser ended before its validated cadence release'));
        }
        if(gate.id==='postgres-service-tests'&&database){
          try{
            await database.cleanup({log});database=null;delete environment.TEST_DATABASE_URL;
            receipt.database={...receipt.database,cleanedUpAt:new Date().toISOString(),cleanupGate:gate.id};
          }catch(error){
            if(commandError)throw new AggregateError([commandError,error],'PostgreSQL service verification and cleanup failed',{cause:commandError});
            throw error;
          }
        }
      }
    },validate:async({value,logBytes})=>{
      if(gate.id==='model-tests')return validateStagedModelGate({value,logBytes});
      if(gate.id!=='native-browser')return {};
      assert.equal(value.initialNice,0,'Native browser must retain unchanged normal priority');
      assert.ok(Date.parse(value.launchedAt)>=Date.parse(acceptedModel.attestation.acceptedAt),'Native browser started before trusted model acceptance');
      const bytes=await readFile(resolve(root,'build/eth-browser/report.json')),report=JSON.parse(bytes.toString('utf8'));
      assertCompleteNativeBrowserReport(report,sourceIdentity.sourceCommit);
      const release=fastCadenceWaiter.assertPassed();assert.deepEqual(report.fastCadence,release);
      assertFastCadenceCaseEvidence(report,release,fastCadenceContext);
      for(const [path,digest] of Object.entries(report.sourceHashes))assert.equal(sha(await readFile(resolve(root,path))),digest,'Browser-bound source changed: '+path);
      for(const item of report.cases)for(const screenshot of item.screenshots){
        const location=resolve(root,'build/eth-browser',screenshot.file);
        assert.ok(location.startsWith(resolve(root,'build/eth-browser')+'/'),'Unsafe browser screenshot path');
        const image=await readFile(location);assert.equal(image.length,screenshot.bytes);assert.equal(sha(image),screenshot.sha256,'Rendered screenshot changed');
      }
      return {nativeBrowserLaunchedAt:value.launchedAt,fastCadence:release,
        browser:{caseCount:report.cases.length,scope:report.caseScope,sourceCommit:report.sourceCommit,sourceIntegrity:true,
          report:'build/eth-browser/report.json',reportSha256:sha(bytes),browserVersion:report.browserVersion.product,
          processPriority:{pid:value.pid,nice:value.initialNice},suiteRunId:report.suiteRunId,sourceInventorySha256:release.sourceInventorySha256}};
    }});
  }
  async function record(results){
    for(const result of results){
      const entry=result.status==='fulfilled'?result.value.gate:result.reason.gateResult;
      if(entry){receipt.gates.push(entry);console.log('ATLAS_CLOUDFLARE_GATE '+JSON.stringify({stage,...entry}));}
      if(result.status==='fulfilled')Object.assign(receipt,result.value.details);
    }
    await persist(componentPath,receipt);
    const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(errors.length)throw new AggregateError(errors,'Required staged verification failed: '+errors.map(error=>error.message).join('; '));
  }
  async function beforeNative(){
    assert.equal(database,null,'PostgreSQL must finish cleanup before native browser execution');assertCleanSource({remote:true});
    const {readVerifiedCloudflareModelStage}=await import('./cloudflare-model-component-provider.mjs');
    const browserBuild=browserBuildIdentity(receipt);
    const remaining=deadline-Date.now();assert.ok(remaining>1000,'The execution budget expired before trusted model acceptance');
    const signal=AbortSignal.any([cancellation.signal,AbortSignal.timeout(remaining)]);
    acceptedModel=assertAcceptedModelStage(await readVerifiedCloudflareModelStage({source:sourceIdentity,planSha256:receipt.planSha256,
      browserBuild,policy:cloudflareModelProviderPolicy,signal}),{source:sourceIdentity,browserBuild});
    await persist(resolve(root,'build/cloudflare-model-acceptance.json'),acceptedModel);
    console.log('ATLAS_CLOUDFLARE_MODEL_ACCEPTED '+JSON.stringify({producerBuildUuid:acceptedModel.component.runId,
      consumerBuildUuid:receipt.runId,acceptedAt:acceptedModel.attestation.acceptedAt,sourceCommit:receipt.sourceCommit,planSha256:receipt.planSha256}));
    assertCleanSource({remote:true});
    environment.ATLAS_BROWSER_SUITE_RUN_ID=randomUUID();
    const browserSource=await readBrowserSourceIdentity(root);
    assert.equal(browserSource.sourceCommit,sourceIdentity.sourceCommit);assert.equal(browserSource.sourceTree,sourceIdentity.sourceTree);
    fastCadenceContext=await readFastCadenceContext({root,source:browserSource,suiteRunId:environment.ATLAS_BROWSER_SUITE_RUN_ID});
    fastCadenceWaiter=createFastCadenceReleaseWaiter({context:fastCadenceContext});
  }
  try{
    const providerSource=stage==='browser'?readBrowserBuildSource({root,environment,mode,source:sourceIdentity}):undefined;
    Object.assign(receipt,stageIdentityFromEnvironment({stage,mode,source:sourceIdentity,environment,providerSource}));
    assertCleanSource();git('check-ref-format','--branch',receipt.branch);
    await executeCloudflareStagePlan({stage,execute,record,beforeNative,signal:cancellation.signal,afterGate:async gate=>{
      if(gate.kind==='runtime')removeSignalHandlers=installVerificationSignalHandlers(cancellation);
      assertCleanSource();
    }});
    if(stage==='browser'){
      const manifest=JSON.parse(await readFile(resolve(root,'dist/publication.json'),'utf8'));
      assert.equal(manifest.sourceCommit,sourceIdentity.sourceCommit);assert.equal(manifest.sourceTree?.status,'clean');
      assert.deepEqual(manifest.workflow?.providerSource,receipt.providerSource,'Publication lost the current browser source provenance');
      assert.equal(manifest.eventCommit,receipt.providerSource.refKind==='branch'?null:receipt.providerSource.rawRef);
      receipt.publication={sourceCommit:manifest.sourceCommit,manifestSha256:manifest.manifestSha256};
    }
    cancellation.signal.throwIfAborted();assertCleanSource({remote:true});
    receipt.completedAt=new Date().toISOString();receipt.status='PASS';
    if(stage==='model'){
      assertModelComponent(receipt,{...sourceIdentity,mode,branch:receipt.branch});
      await persist(componentPath,receipt,{canonical:true});
      console.log('ATLAS_CLOUDFLARE_MODEL_COMPONENT '+JSON.stringify({status:receipt.status,qualifiesFullVerification:false,
        sourceCommit:receipt.sourceCommit,sourceTree:receipt.sourceTree,planSha256:receipt.planSha256,runId:receipt.runId,gateCount:receipt.gates.length}));
    }else{
      assertBrowserComponent(receipt,{...sourceIdentity,mode,branch:receipt.branch});
      const aggregate=createStagedVerification({model:acceptedModel.component,browser:receipt,attestation:acceptedModel.attestation});
      await persist(componentPath,receipt);await persist(aggregatePath,aggregate);
      console.log('ATLAS_CLOUDFLARE_STAGED_VERIFICATION '+JSON.stringify(aggregate));
    }
    cancellation.signal.throwIfAborted();return receipt;
  }catch(error){
    verificationError=error;receipt.status='FAIL';receipt.completedAt=new Date().toISOString();receipt.error=error.stack??String(error);
    await persist(componentPath,receipt);
    await persist(aggregatePath,{schemaVersion:1,kind:'atlas-cloudflare-staged-verification',status:'FAIL',qualifiesFullVerification:false,
      ...sourceIdentity,stage,runId:receipt.runId,startedAt,completedAt:receipt.completedAt,gates:receipt.gates,error:receipt.error});
    throw error;
  }finally{
    fastCadenceWaiter?.dispose();const errors=[];
    try{await drainVerificationOutput();}catch(error){errors.push(error);}
    if(database){
      try{
        const result=await executeLoggedGate({id:'database-cleanup',root,directory:out,run:({log})=>database.cleanup({log})});
        receipt.databaseCleanup=result.gate;database=null;delete environment.TEST_DATABASE_URL;
      }catch(error){receipt.databaseCleanup=error.gateResult;errors.push(error);}
      await persist(componentPath,receipt);
    }
    removeSignalHandlers?.();
    if(errors.length){
      const error=new AggregateError([...(verificationError?[verificationError]:[]),...errors],'Staged verification output or database cleanup failed');
      receipt.status='FAIL';receipt.completedAt=new Date().toISOString();receipt.error=error.stack;await persist(componentPath,receipt);
      await persist(aggregatePath,{schemaVersion:1,kind:'atlas-cloudflare-staged-verification',status:'FAIL',qualifiesFullVerification:false,
        ...sourceIdentity,stage,runId:receipt.runId,startedAt,completedAt:receipt.completedAt,gates:receipt.gates,error:receipt.error});throw error;
    }
  }
}
