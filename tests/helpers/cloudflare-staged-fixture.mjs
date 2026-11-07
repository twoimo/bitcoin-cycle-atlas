import {cloudflareRuntime,cloudflareBrowserCaseCount} from '../../scripts/cloudflare-build-contract.mjs';
import {cloudflareStageGateIds,cloudflareStagedPolicy,cloudflareStagedPlanSha256,browserBuildIdentity,createStagedVerification} from '../../scripts/cloudflare-staged-contract.mjs';
import {cloudflareModelProviderPolicy,serializeModelComponent,serializeModelComponentIndex,createModelComponentIndex,
  modelProviderSha256,modelProviderCanonicalBytes,modelCheckRunsEndpoint,modelComponentIndexPath} from '../../scripts/cloudflare-model-provider-policy.mjs';
import {fastCadenceFixture} from './fast-cadence-fixture.mjs';

// Synthetic contract fixtures only. These are never executed verification or
// provider evidence and cannot be used by the Build entrypoints.
const at=(start,ms)=>new Date(Date.parse(start)+ms).toISOString();
const sourceCommit='a'.repeat(40),sourceTree='b'.repeat(40);
const ids={model:'11111111-1111-4111-8111-111111111111',browser:'22222222-2222-4222-8222-222222222222'};
function header(stage,options){
  const mode=options.mode??'review',branch=options.branch??(mode==='production'?'main':'verify/staged-contract');
  return {schemaVersion:1,kind:`atlas-cloudflare-${stage}-component`,status:'PASS',qualifiesFullVerification:false,stage,
    provider:'cloudflare-workers-builds',runId:options.runId??ids[stage],accountId:cloudflareModelProviderPolicy.accountId,
    repository:cloudflareModelProviderPolicy.repository,workerName:cloudflareModelProviderPolicy.modes[mode][stage==='model'?'modelWorker':'browserWorker'],
    mode,branch,sourceCommit:options.sourceCommit??sourceCommit,sourceTree:options.sourceTree??sourceTree,planSha256:cloudflareStagedPlanSha256,
    startedAt:options.startedAt??(stage==='model'?'2026-11-07T00:00:00.000Z':'2026-11-07T00:01:00.000Z')};
}
function gates(stage,start){
  let elapsed=0;
  return cloudflareStageGateIds[stage].map(id=>{
    const durationMs=id==='model-tests'?10_000:id==='native-browser'?30_000:1_000,startedAt=at(start,elapsed);
    elapsed+=durationMs;
    return {id,status:'PASS',startedAt,completedAt:at(start,elapsed),durationMs,
      log:`build/cloudflare-stage-${stage}/${id}.log`,logSha256:'c'.repeat(64)};
  });
}
function runtime(stage,start){
  return {profile:stage==='model'?cloudflareStagedPolicy.modelRuntime:cloudflareStagedPolicy.browserRuntime,
    node:cloudflareRuntime.node,platform:cloudflareRuntime.platform,arch:cloudflareRuntime.arch,ubuntu:cloudflareRuntime.ubuntu,
    gateStatus:stage==='model'?'FORMAL_TOOLS_READY':'READY',completedAt:at(start,400),durationMs:400,
    java:{version:cloudflareRuntime.java.version,archiveSha256:cloudflareRuntime.java.sha256},tlc:{sha256:cloudflareRuntime.tlc.sha256},
    ...(stage==='browser'?{chrome:{version:cloudflareRuntime.chrome.version,archiveSha256:cloudflareRuntime.chrome.sha256},
      font:{gitBlob:cloudflareRuntime.font.gitBlob,licenseGitBlob:cloudflareRuntime.font.licenseGitBlob},
      postgres:{version:cloudflareRuntime.postgres.version,packageSha256s:cloudflareRuntime.postgres.packages.map(item=>item.sha256)}}:{})};
}
export function modelComponentFixture(options={}){
  const value=header('model',options);value.gates=gates('model',value.startedAt);value.completedAt=at(value.gates.at(-1).completedAt,1);
  value.runtime=runtime('model',value.startedAt);
  value.modelPriority={schemaVersion:1,kind:'atlas-cloudflare-command-priority',status:'APPLIED',gateId:'model-tests',requestedNice:0,beforeNice:0,actualNice:0,
    wrapperPid:102,parentPid:101,parentNice:0,commandPid:103,commandNice:0,command:'npm',args:['test','--','--test-concurrency=2']};
  value.modelManagedPid=102;value.modelLaunchedAt=at(value.gates.find(gate=>gate.id==='model-tests').startedAt,1);
  value.modelTests={complete:true,tests:3,pass:3,fail:0,skipped:0,batches:1};return value;
}
export function browserComponentFixture(options={}){
  const value=header('browser',options);value.gates=gates('browser',value.startedAt);value.completedAt=at(value.gates.at(-1).completedAt,1);
  value.runtime=runtime('browser',value.startedAt);
  value.database={serverVersion:'17.11',host:'127.0.0.1',isolated:true,
    cleanedUpAt:at(value.gates.find(gate=>gate.id==='postgres-service-tests').completedAt,-1),cleanupGate:'postgres-service-tests'};
  value.nativeBrowserLaunchedAt=at(value.gates.find(gate=>gate.id==='native-browser').startedAt,1);
  const {release}=fastCadenceFixture(value),began=at(value.nativeBrowserLaunchedAt,1);
  release.startedAt=began;release.releasedAt=at(began,3000);release.milestone.startedAt=began;release.milestone.completedAt=at(began,2000);
  value.fastCadence=release;
  value.browser={caseCount:cloudflareBrowserCaseCount,scope:'all',sourceCommit:value.sourceCommit,sourceIntegrity:true,report:'build/eth-browser/report.json',reportSha256:'d'.repeat(64),
    browserVersion:'Chrome/'+cloudflareRuntime.chrome.version,processPriority:{pid:104,nice:0},suiteRunId:release.suiteRunId,sourceInventorySha256:release.sourceInventorySha256};
  value.publication={sourceCommit:value.sourceCommit,manifestSha256:'f'.repeat(64)};
  return value;
}

export function modelAttestationFixture({model=modelComponentFixture(),browser=browserComponentFixture(),acceptedAt=at(browser.startedAt,1000)}={}){
  const p=cloudflareModelProviderPolicy,receiptBytes=serializeModelComponent(model),index=createModelComponentIndex(model,receiptBytes),indexBytes=serializeModelComponentIndex(index);
  const identity={external_id:model.runId,head_sha:model.sourceCommit,name:'Workers Builds: '+model.workerName,
    details_url:'https://dash.cloudflare.com/'+p.accountId+'/workers/services/view/'+model.workerName+'/production/builds/'+model.runId,
    app:{id:p.app.id,slug:p.app.slug,owner:{id:p.app.ownerId,login:p.app.ownerLogin}}};
  const checks=[{...identity,id:1,url:'https://api.github.com/repos/'+p.repository+'/check-runs/1',status:'in_progress',conclusion:null,
    started_at:model.startedAt,completed_at:null},
  {...identity,id:2,url:'https://api.github.com/repos/'+p.repository+'/check-runs/2',status:'completed',conclusion:'success',
    started_at:at(model.completedAt,1),completed_at:at(model.completedAt,1)}];
  return {schemaVersion:1,kind:'atlas-cloudflare-model-provider-attestation',status:'VERIFIED',trust:p.trust,reuse:p.reuse,acceptedAt,
    producer:{buildUuid:model.runId,workerName:model.workerName,accountId:p.accountId,repository:p.repository,mode:model.mode},
    consumer:browserBuildIdentity(browser),
    publication:{origin:p.modes[model.mode].origin,indexPath:modelComponentIndexPath(model.sourceCommit),index,indexBytes:indexBytes.length,indexSha256:modelProviderSha256(indexBytes),
      receiptPath:index.receipt.path,receiptBytes:receiptBytes.length,receiptSha256:modelProviderSha256(receiptBytes)},
    authority:{endpoint:modelCheckRunsEndpoint(model.sourceCommit,model.workerName),observedAt:at(acceptedAt,-1),checks,
      checksSha256:modelProviderSha256(modelProviderCanonicalBytes(checks)),terminalCheckIds:[2]}};
}

export function stagedVerificationFixture(options={}){
  const model=modelComponentFixture(options),browser=browserComponentFixture({...options,runId:options.browserRunId??ids.browser,startedAt:options.browserStartedAt??'2026-11-07T00:01:00.000Z'});
  const attestation=modelAttestationFixture({model,browser});
  return createStagedVerification({model,browser,attestation,now:Date.parse(browser.completedAt)+1});
}
