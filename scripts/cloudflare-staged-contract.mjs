import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  cloudflareBuildGates,requiredCloudflareGateIds,cloudflareBrowserCaseCount,
  cloudflareBrowserExecution,cloudflareRuntime,cloudflarePlanSha256,assertModelPriorityReceipt,
} from './cloudflare-build-contract.mjs';
import {assertFastCadenceRelease} from './browser-fast-cadence-contract.mjs';
import {cloudflareModelProviderPolicy,assertVerifiedModelAttestation} from './cloudflare-model-provider-policy.mjs';

const sha40=/^[a-f0-9]{40}$/,sha64=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const clock=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const time=value=>Date.parse(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const modelIds=['runtime-preflight','locked-dependencies','model-tests',
  'forecast','research','eth-events','treasury-paths','numerics','formal','cycle','performance','static','chart-replay'];
const browserIds=['runtime-preflight','locked-dependencies','generated-pages','typecheck','panel-tests','service-build',
  'postgres-service-tests','native-browser','publication','publication-check','standalone','standalone-check'];

// These are two independently executed Builds, not a renamed single run.
// Runtime/dependency preparation is deliberately repeated and retained in each
// component. The aggregate references the browser copy of those two gates.
export const cloudflareStageGateIds=Object.freeze({model:Object.freeze(modelIds),browser:Object.freeze(browserIds)});
export const cloudflareStagedPolicy=Object.freeze({
  schemaVersion:1,kind:'atlas-cloudflare-staged-plan',maximumExecutionMs:19*60*1000,
  modelRuntime:'canonical-node-and-pinned-formal-tools',browserRuntime:'full-chrome-postgres-and-formal-tools',
  chronology:'accept-terminal-model-success-before-native-browser-launch',
  reuse:'same-source-tree-plan-and-mode; not a producer-to-consumer dispatch assertion',
  maximumComponentAgeMs:6*60*60*1000,maximumClockSkewMs:30_000,
  stages:cloudflareStageGateIds,provider:cloudflareModelProviderPolicy,
});
export const cloudflareStagedPlanSha256=hash(JSON.stringify({
  legacyCompletePlanSha256:cloudflarePlanSha256,staged:cloudflareStagedPolicy,
  gates:cloudflareBuildGates,browserExecution:cloudflareBrowserExecution,
}));

export const cloudflareStageGates=stage=>{
  assert.ok(Object.hasOwn(cloudflareStageGateIds,stage),'Unknown Cloudflare verification stage');
  return cloudflareStageGateIds[stage].map(id=>cloudflareBuildGates.find(gate=>gate.id===id));
};

function exactKeys(value,keys,label){
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),label+' must be an object');
  assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),label+' has omitted or unreviewed fields');
}
const commonKeys=['schemaVersion','kind','status','qualifiesFullVerification','stage','provider','runId','accountId','repository','workerName',
  'mode','branch','sourceCommit','sourceTree','planSha256','startedAt','completedAt','runtime','gates'];
const modelKeys=[...commonKeys,'modelPriority','modelManagedPid','modelLaunchedAt','modelTests'];
const browserKeys=[...commonKeys,'database','nativeBrowserLaunchedAt','browser','fastCadence','publication'];
const gateKeys=['id','status','startedAt','completedAt','durationMs','log','logSha256'];

export function assertStageIdentity(value,{stage,sourceCommit,sourceTree,mode,branch}={}){
  assert.equal(value?.schemaVersion,1);assert.equal(value.provider,'cloudflare-workers-builds');
  assert.match(value.runId??'',uuid,'The actual Workers Build UUID is required');
  assert.match(value.sourceCommit??'',sha40);assert.match(value.sourceTree??'',sha40);
  if(sourceCommit!==undefined)assert.equal(value.sourceCommit,sourceCommit,'Component source commit differs');
  if(sourceTree!==undefined)assert.equal(value.sourceTree,sourceTree,'Component source tree differs');
  assert.equal(value.planSha256,cloudflareStagedPlanSha256,'Component verification plan differs');
  assert.equal(value.accountId,cloudflareModelProviderPolicy.accountId);
  assert.equal(value.repository,cloudflareModelProviderPolicy.repository);
  assert.ok(['production','review'].includes(value.mode));
  if(mode!==undefined)assert.equal(value.mode,mode,'Verification mode differs');
  if(branch!==undefined)assert.equal(value.branch,branch,'Verification branch differs');
  assert.ok(typeof value.branch==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value.branch));
  assert.ok(!value.branch.includes('..')&&!value.branch.includes('//')&&!value.branch.endsWith('/')&&!value.branch.endsWith('.')&&
    !value.branch.split('/').some(part=>part.startsWith('.')||part.endsWith('.lock')),'Invalid verification branch');
  assert.equal(value.mode==='production',value.branch==='main','Production requires main; review requires a non-main branch');
  assert.equal(value.stage,stage);
  const expected=cloudflareModelProviderPolicy.modes[value.mode];
  assert.equal(value.workerName,stage==='model'?expected.modelWorker:expected.browserWorker,'Component worker differs from the reviewed mode');
  return value;
}

export function stageIdentityFromEnvironment({stage,mode,source,environment=process.env}){
  assert.equal(environment.WORKERS_CI,'1','Staged verification requires an actual Workers Build');
  assert.equal(environment.WORKERS_CI_COMMIT_SHA,source.sourceCommit,'Workers Build and checkout commits differ');
  assert.ok(['model','browser'].includes(stage));assert.ok(['production','review'].includes(mode));
  const expected=cloudflareModelProviderPolicy.modes[mode];
  return assertStageIdentity({schemaVersion:1,stage,provider:'cloudflare-workers-builds',runId:environment.WORKERS_CI_BUILD_UUID,
    accountId:cloudflareModelProviderPolicy.accountId,repository:cloudflareModelProviderPolicy.repository,
    workerName:stage==='model'?expected.modelWorker:expected.browserWorker,mode,branch:environment.WORKERS_CI_BRANCH,
    ...source,planSha256:cloudflareStagedPlanSha256},{stage,...source,mode});
}

function assertClocks(value,now){
  assert.ok(clock(value.startedAt)&&clock(value.completedAt)&&time(value.completedAt)>=time(value.startedAt),'Actual component clocks are required');
  assert.ok(time(value.completedAt)-time(value.startedAt)<=cloudflareStagedPolicy.maximumExecutionMs,'Each component must finish within its unchanged execution budget');
  assert.ok(time(value.completedAt)<=now+cloudflareStagedPolicy.maximumClockSkewMs,'Component completion clock is in the future');
}
function assertGates(component,stage){
  assert.deepEqual(component.gates?.map(gate=>gate.id),cloudflareStageGateIds[stage],'Every stage gate must execute exactly once in declared order');
  let previous=time(component.startedAt);
  for(const gate of component.gates){
    exactKeys(gate,gateKeys,'Gate '+gate.id);assert.equal(gate.status,'PASS','Failed stage gate: '+gate.id);
    assert.ok(clock(gate.startedAt)&&clock(gate.completedAt)&&time(gate.startedAt)>=previous&&time(gate.completedAt)>=time(gate.startedAt),'Stage gates must retain their actual sequential clocks');
    assert.ok(time(gate.completedAt)<=time(component.completedAt));previous=time(gate.completedAt);
    assert.ok(Number.isFinite(gate.durationMs)&&gate.durationMs>=0&&gate.durationMs<=cloudflareStagedPolicy.maximumExecutionMs);
    assert.equal(gate.log,`build/cloudflare-stage-${stage}/${gate.id}.log`,'Gate logs must retain their own Build-relative paths');
    assert.match(gate.logSha256??'',sha64,'Actual gate log hash is required');
  }
}

// Public components contain selected runtime facts and content hashes, never
// the full bootstrap tool stdout, environment, credentials or raw test logs.
export function summarizeStageRuntime(receipt,stage){
  return {profile:stage==='model'?cloudflareStagedPolicy.modelRuntime:cloudflareStagedPolicy.browserRuntime,
    node:receipt.node,platform:receipt.platform,arch:receipt.arch,ubuntu:cloudflareRuntime.ubuntu,
    gateStatus:receipt.gateStatus,completedAt:receipt.completedAt,durationMs:receipt.durationMs,
    java:{version:cloudflareRuntime.java.version,archiveSha256:receipt.java?.archiveSha256},tlc:{sha256:receipt.tlc?.sha256},
    ...(stage==='browser'?{chrome:{version:cloudflareRuntime.chrome.version,archiveSha256:receipt.chrome?.archiveSha256},
      font:{gitBlob:receipt.font?.gitBlob,licenseGitBlob:receipt.font?.licenseGitBlob},
      postgres:{version:cloudflareRuntime.postgres.version,packageSha256s:receipt.postgres?.packages?.map(item=>item.sha256)}}:{})};
}
function assertRuntime(runtime,stage){
  exactKeys(runtime,['profile','node','platform','arch','ubuntu','gateStatus','completedAt','durationMs','java','tlc',
    ...(stage==='browser'?['chrome','font','postgres']:[])],'Runtime summary');
  assert.equal(runtime.profile,stage==='model'?cloudflareStagedPolicy.modelRuntime:cloudflareStagedPolicy.browserRuntime);
  for(const field of ['node','platform','arch','ubuntu'])assert.equal(runtime[field],cloudflareRuntime[field]);
  assert.equal(runtime.gateStatus,stage==='model'?'FORMAL_TOOLS_READY':'READY');
  assert.ok(clock(runtime.completedAt));assert.ok(Number.isFinite(runtime.durationMs)&&runtime.durationMs>=0);
  assert.deepEqual(runtime.java,{version:cloudflareRuntime.java.version,archiveSha256:cloudflareRuntime.java.sha256});
  assert.deepEqual(runtime.tlc,{sha256:cloudflareRuntime.tlc.sha256});
  if(stage==='browser'){
    assert.deepEqual(runtime.chrome,{version:cloudflareRuntime.chrome.version,archiveSha256:cloudflareRuntime.chrome.sha256});
    assert.deepEqual(runtime.font,{gitBlob:cloudflareRuntime.font.gitBlob,licenseGitBlob:cloudflareRuntime.font.licenseGitBlob});
    assert.deepEqual(runtime.postgres,{version:cloudflareRuntime.postgres.version,packageSha256s:cloudflareRuntime.postgres.packages.map(item=>item.sha256)});
  }
}

export function assertModelComponent(component,{sourceCommit,sourceTree,mode,branch,now=Date.now()}={}){
  exactKeys(component,modelKeys,'Model component');
  assert.equal(component.kind,'atlas-cloudflare-model-component');assert.equal(component.status,'PASS');
  assert.equal(component.qualifiesFullVerification,false,'A model component alone cannot qualify publication');
  assertStageIdentity(component,{stage:'model',sourceCommit,sourceTree,mode,branch});assertClocks(component,now);
  assertGates(component,'model');assertRuntime(component.runtime,'model');
  exactKeys(component.modelPriority,['schemaVersion','kind','status','gateId','requestedNice','beforeNice','actualNice','wrapperPid','parentPid',
    'parentNice','commandPid','commandNice','command','args'],'Model priority receipt');
  assertModelPriorityReceipt(component.modelPriority);
  assert.equal(component.modelManagedPid,component.modelPriority.wrapperPid,'Model priority belongs to another managed process');
  const gate=component.gates.find(item=>item.id==='model-tests');
  assert.ok(clock(component.modelLaunchedAt)&&time(component.modelLaunchedAt)>=time(gate.startedAt)&&time(component.modelLaunchedAt)<=time(gate.completedAt));
  const totals=component.modelTests;exactKeys(totals,['complete','tests','pass','fail','skipped','batches'],'Model test totals');
  assert.equal(totals.complete,true);assert.equal(totals.batches,1,'Canonical tests cannot fall back to Docker or split inventories');
  assert.ok(Number.isSafeInteger(totals.tests)&&totals.tests>0);assert.equal(totals.pass,totals.tests);assert.equal(totals.fail,0);assert.equal(totals.skipped,0);
  return component;
}

export function assertBrowserComponent(component,{sourceCommit,sourceTree,mode,branch,now=Date.now()}={}){
  exactKeys(component,browserKeys,'Browser component');
  assert.equal(component.kind,'atlas-cloudflare-browser-component');assert.equal(component.status,'PASS');assert.equal(component.qualifiesFullVerification,false);
  assertStageIdentity(component,{stage:'browser',sourceCommit,sourceTree,mode,branch});assertClocks(component,now);
  assertGates(component,'browser');assertRuntime(component.runtime,'browser');
  exactKeys(component.database,['serverVersion','host','isolated','cleanedUpAt','cleanupGate'],'Database evidence');
  assert.equal(component.database.serverVersion,cloudflareRuntime.postgres.version);assert.equal(component.database.host,'127.0.0.1');
  assert.equal(component.database.isolated,true);assert.equal(component.database.cleanupGate,'postgres-service-tests');assert.ok(clock(component.database.cleanedUpAt));
  const gate=component.gates.find(item=>item.id==='native-browser');
  assert.ok(clock(component.nativeBrowserLaunchedAt)&&time(component.nativeBrowserLaunchedAt)>=time(gate.startedAt)&&time(component.nativeBrowserLaunchedAt)<=time(gate.completedAt));
  assert.ok(time(component.database.cleanedUpAt)<=time(component.nativeBrowserLaunchedAt));
  const browser=component.browser;
  exactKeys(browser,['caseCount','scope','sourceCommit','sourceIntegrity','report','reportSha256','browserVersion','processPriority','suiteRunId','sourceInventorySha256'],'Browser evidence');
  assert.equal(browser.caseCount,cloudflareBrowserCaseCount);assert.equal(browser.scope,'all');assert.equal(browser.sourceCommit,component.sourceCommit);
  assert.equal(browser.sourceIntegrity,true);assert.equal(browser.report,'build/eth-browser/report.json');assert.match(browser.reportSha256??'',sha64);
  assert.ok(typeof browser.browserVersion==='string'&&browser.browserVersion.includes(cloudflareRuntime.chrome.version));
  exactKeys(browser.processPriority,['pid','nice'],'Browser process priority');assert.ok(Number.isSafeInteger(browser.processPriority.pid)&&browser.processPriority.pid>0);assert.equal(browser.processPriority.nice,0);
  assert.match(browser.suiteRunId??'',uuid);assert.match(browser.sourceInventorySha256??'',sha64);
  assert.equal(component.fastCadence?.status,'passed');
  assertFastCadenceRelease(component.fastCadence,{sourceCommit:component.sourceCommit,sourceTree:component.sourceTree,
    suiteRunId:browser.suiteRunId,sourceInventorySha256:browser.sourceInventorySha256,expectedObservationDates:component.fastCadence.expectedObservationDates});
  assert.ok(time(component.fastCadence.startedAt)>=time(component.nativeBrowserLaunchedAt));
  assert.ok(time(component.fastCadence.releasedAt)<=time(gate.completedAt));
  exactKeys(component.publication,['sourceCommit','manifestSha256'],'Publication summary');
  assert.equal(component.publication.sourceCommit,component.sourceCommit);assert.match(component.publication.manifestSha256??'',sha64);
  return component;
}

export function browserBuildIdentity(component){
  return {buildUuid:component.runId,startedAt:component.startedAt,workerName:component.workerName,
    accountId:component.accountId,repository:component.repository,mode:component.mode,branch:component.branch};
}

export function assertAcceptedModelStage({component,attestation},{browserBuild,source,now=Date.now()}={}){
  assertModelComponent(component,{...source,mode:browserBuild.mode,branch:browserBuild.branch,now});
  assert.notEqual(component.runId,browserBuild.buildUuid,'The model and browser components must retain distinct actual Build UUIDs');
  assertVerifiedModelAttestation(attestation,{component,source,planSha256:cloudflareStagedPlanSha256,browserBuild,
    policy:cloudflareModelProviderPolicy,now});
  assert.ok(clock(attestation.acceptedAt)&&time(attestation.acceptedAt)>=time(component.completedAt),'The model component must complete before consumer acceptance');
  assert.ok(time(attestation.acceptedAt)>=time(browserBuild.startedAt));
  assert.ok(time(attestation.acceptedAt)-time(component.completedAt)<=cloudflareStagedPolicy.maximumComponentAgeMs,'The model component is too old to reuse');
  assert.ok(time(attestation.acceptedAt)<=now+cloudflareStagedPolicy.maximumClockSkewMs);
  return {component,attestation};
}

function aggregateGates(model,browser){
  return requiredCloudflareGateIds.map(id=>{
    const component=browserIds.includes(id)?browser:model,gate=component.gates.find(item=>item.id===id);
    return {...gate,component:component.stage,buildUuid:component.runId};
  });
}

export function createStagedVerification({model,browser,attestation,now=Date.now()}){
  const receipt={schemaVersion:1,kind:'atlas-cloudflare-staged-verification',status:'PASS',qualifiesFullVerification:true,
    sourceCommit:browser.sourceCommit,sourceTree:browser.sourceTree,planSha256:cloudflareStagedPlanSha256,
    mode:browser.mode,branch:browser.branch,startedAt:model.startedAt,completedAt:browser.completedAt,
    components:{model,browser},modelAttestation:attestation,gates:aggregateGates(model,browser)};
  return assertStagedVerification(receipt,{sourceCommit:browser.sourceCommit,sourceTree:browser.sourceTree,now});
}

export function assertStagedVerification(receipt,{sourceCommit,sourceTree,now=Date.now()}={}){
  exactKeys(receipt,['schemaVersion','kind','status','qualifiesFullVerification','sourceCommit','sourceTree','planSha256','mode','branch',
    'startedAt','completedAt','components','modelAttestation','gates'],'Staged aggregate');
  assert.equal(receipt.schemaVersion,1);assert.equal(receipt.kind,'atlas-cloudflare-staged-verification');assert.equal(receipt.status,'PASS');assert.equal(receipt.qualifiesFullVerification,true);
  assert.match(sourceCommit??'',sha40,'Current committed source is required');assert.equal(receipt.sourceCommit,sourceCommit);
  if(sourceTree!==undefined)assert.equal(receipt.sourceTree,sourceTree);
  assert.equal(receipt.planSha256,cloudflareStagedPlanSha256);
  exactKeys(receipt.components,['model','browser'],'Build components');
  const {model,browser}=receipt.components,source={sourceCommit:receipt.sourceCommit,sourceTree:receipt.sourceTree};
  assertBrowserComponent(browser,{...source,mode:receipt.mode,branch:receipt.branch,now});
  assertAcceptedModelStage({component:model,attestation:receipt.modelAttestation},{source,browserBuild:browserBuildIdentity(browser),now});
  assert.ok(time(receipt.modelAttestation.acceptedAt)<=time(browser.nativeBrowserLaunchedAt),'Terminal producer success must be accepted before the browser starts');
  assert.equal(receipt.startedAt,model.startedAt);assert.equal(receipt.completedAt,browser.completedAt);
  assert.deepEqual(receipt.gates,aggregateGates(model,browser),'Aggregate gate references must preserve exact component evidence and original Build UUIDs');
  assert.deepEqual(receipt.gates.map(gate=>gate.id),requiredCloudflareGateIds,'The aggregate must retain all23 distinct required gates');
  return receipt;
}
