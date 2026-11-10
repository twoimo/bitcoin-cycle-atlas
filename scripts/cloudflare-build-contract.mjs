import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createEthBrowserCaseSpecs} from './eth-browser-case-specs.mjs';
import {fastCadencePolicy,assertFastCadenceRelease} from './browser-fast-cadence-contract.mjs';

// These are execution gates, not names of old GitHub jobs. Every gate runs
// against one clean source checkout before the Cloudflare artifact is built.
export const cloudflareBuildGates=Object.freeze([
  {id:'runtime-preflight',kind:'runtime'},
  {id:'locked-dependencies',command:'npm',args:['ci','--ignore-scripts']},
  {id:'generated-pages',command:'npm',args:['run','verify:pages']},
  {id:'typecheck',command:'npm',args:['run','typecheck']},
  {id:'panel-tests',kind:'node-tests',directory:'tests/web',extension:'.test.tsx'},
  {id:'service-build',command:'npm',args:['run','build:web']},
  {id:'postgres-service-tests',kind:'node-tests',directory:'tests/service',extension:'.test.ts'},
  {id:'native-browser',command:'node',args:['scripts/verify-native-browser-suite.mjs']},
  {id:'model-tests',command:'npm',args:['test','--','--test-concurrency=2'],nice:0},
  ...['forecast','research','eth-events','treasury-paths','numerics','formal','cycle','performance','static','chart-replay'].map(id=>({id,command:'npm',args:['run','verify:'+id]})),
  {id:'publication',command:'npm',args:['run','build:publication']},
  {id:'publication-check',command:'npm',args:['run','verify:publication']},
  {id:'standalone',command:'node',args:['scripts/build-standalone.mjs','build/Bitcoin_Cycles_Comparison.html']},
  {id:'standalone-check',command:'node',args:['scripts/verify-static.mjs','--standalone','build/Bitcoin_Cycles_Comparison.html']},
].map(gate=>Object.freeze(gate)));

// Every gate runs sequentially. The native-browser lane contains a wall-clock
// cadence sample (10x replay, 100ms budget). Running it beside the CPU-heavy
// model-tests process on a shared build runner distorted that measurement
// (133-377ms observed while the same build renders in ~20ms frames locally),
// so the overlap is removed rather than the timing budget being relaxed.
export const cloudflareParallelGroups=Object.freeze([]);
export const cloudflareBrowserExecution=Object.freeze({
  maximumProcesses:2,perLaneConcurrency:1,isolatedFastCadence:fastCadencePolicy,
  lanes:Object.freeze([
    Object.freeze({scope:'non-chart-replay',caseCount:createEthBrowserCaseSpecs().filter(spec=>!spec.chartReplay).length}),
    Object.freeze({scope:'chart-replay',caseCount:createEthBrowserCaseSpecs().filter(spec=>spec.chartReplay).length}),
  ]),
});

export const cloudflareRuntime=Object.freeze({
  node:'v24.22.2',platform:'linux',arch:'x64',ubuntu:'24.04',
  chrome:{version:'157.0.8103.38',
    url:'https://storage.googleapis.com/chrome-for-testing-public/157.0.8103.38/linux64/chrome-linux64.zip',
    sha256:'8cdeb344e9b2cefe59f4aea8d1d93d5d93054c03cde217665c16fc1f62e72a66'},
  java:{version:'21.0.13',build:9,
    url:'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jre_x64_linux_hotspot_21.0.13_9.tar.gz',
    sha256:'a535a1df9c6284d9618872984e026ae0352d1f7e9e0605425c0e6114f47351dd'},
  postgres:{version:'17.11',packageVersion:'17.11-1.pgdg24.04+2',
    keyUrl:'https://www.postgresql.org/media/keys/ACCC4CF8.asc',fingerprint:'B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8',
    keySha256:'0144068502a1eddd2a0280ede10ef607d1ec592ce819940991203941564e8e76',
    packageIndex:'https://apt.postgresql.org/pub/repos/apt/dists/noble-pgdg/main/binary-amd64/Packages.bz2',
    packages:[
      {name:'postgresql-17',version:'17.11-1.pgdg24.04+2',url:'https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-17/postgresql-17_17.11-1.pgdg24.04+2_amd64.deb',sha256:'d5b58058a82a3f344f832aea2cc54badc4f6265c25c960752cb1f5df5d2180ee'},
      {name:'postgresql-client-17',version:'17.11-1.pgdg24.04+2',url:'https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-17/postgresql-client-17_17.11-1.pgdg24.04+2_amd64.deb',sha256:'b3b071b67a814a382516d6f6241b529c52f909672457e2f48083acce047b634f'},
      {name:'libpq5',version:'18.6-1.pgdg24.04+2',url:'https://apt.postgresql.org/pub/repos/apt/pool/main/p/postgresql-18/libpq5_18.6-1.pgdg24.04+2_amd64.deb',sha256:'b487c5ed2ceb9244c6a9d6ae65818ed6707c3c44a2e14488394ae4194c52c53b'},
    ]},
  font:{url:'https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf',
    gitBlob:'dc4a7c65e6f450bf17c10a2405250b620eb78703',
    licenseUrl:'https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/LICENSE',
    licenseGitBlob:'d952d62c065f3f35fb83a173496e90b21525aef3'},
  tlc:{version:'1.7.4',url:'https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar',
    sha256:'936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88'},
});

export const requiredCloudflareGateIds=Object.freeze(cloudflareBuildGates.map(gate=>gate.id));
export const cloudflareBrowserCaseCount=createEthBrowserCaseSpecs().length;
export const cloudflarePlanSha256=createHash('sha256').update(JSON.stringify({
  gates:cloudflareBuildGates,parallelGroups:cloudflareParallelGroups,browserExecution:cloudflareBrowserExecution,
  runtime:cloudflareRuntime,browserCases:createEthBrowserCaseSpecs(),
})).digest('hex');

export function assertModelPriorityReceipt(receipt){
  const gate=cloudflareBuildGates.find(gate=>gate.id==='model-tests');
  assert.equal(receipt?.schemaVersion,1);assert.equal(receipt?.kind,'atlas-cloudflare-command-priority');assert.equal(receipt?.status,'APPLIED');
  assert.equal(receipt.gateId,gate.id);assert.equal(receipt.requestedNice,gate.nice);assert.equal(receipt.actualNice,gate.nice);assert.equal(receipt.commandNice,gate.nice);
  assert.equal(receipt.parentNice,0,'The outer runner and browser sibling must retain normal priority');
  assert.equal(receipt.beforeNice,0,'The model wrapper must start from the unchanged outer runner priority');
  assert.equal(receipt.command,gate.command);assert.deepEqual(receipt.args,gate.args,'CPU priority cannot replace or reduce the canonical model command');
  for(const key of ['wrapperPid','parentPid','commandPid'])assert.ok(Number.isSafeInteger(receipt[key])&&receipt[key]>0,'Actual priority process IDs are required');
  assert.notEqual(receipt.wrapperPid,receipt.commandPid);assert.notEqual(receipt.wrapperPid,receipt.parentPid);
  return receipt;
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

export function assertCloudflareVerificationReceipt(receipt,{sourceCommit,sourceTree}={}){
  assert.equal(receipt?.schemaVersion,1,'Expected the current Cloudflare verification receipt schema');
  assert.equal(receipt?.kind,'atlas-cloudflare-verification');
  assert.equal(receipt?.status,'PASS','A complete successful verification is required');
  assert.match(sourceCommit??'',/^[a-f0-9]{40}$/,'Current committed source is required');
  assert.equal(receipt.sourceCommit,sourceCommit,'Verification belongs to another source commit');
  if(sourceTree)assert.equal(receipt.sourceTree,sourceTree,'Verification belongs to another source tree');
  assert.equal(receipt.planSha256,cloudflarePlanSha256,'Verification used a different gate/runtime plan');
  assert.deepEqual(receipt.gates?.map(gate=>gate.id),requiredCloudflareGateIds,'Every required gate must execute exactly once in declared receipt order');
  for(const gate of receipt.gates){
    assert.equal(gate.status,'PASS','Incomplete or failed gate: '+gate.id);
    assert.ok(Number.isFinite(gate.durationMs)&&gate.durationMs>=0,'Actual gate duration is required');
    assert.match(gate.logSha256??'',/^[a-f0-9]{64}$/,'Actual gate log hash is required');
  }
  assert.deepEqual(receipt.executionGroups?.map(group=>group.gateIds),cloudflareParallelGroups,'The observed execution groups must match the verified plan');
  for(const group of receipt.executionGroups){
    assert.ok(Number.isFinite(group.durationMs)&&group.durationMs>=0,'Actual execution group duration is required');
    assert.ok(Number.isFinite(Date.parse(group.startedAt))&&Date.parse(group.completedAt)>=Date.parse(group.startedAt),'Actual execution group clocks are required');
    assert.equal(typeof group.resources?.available,'boolean','Resource observation availability must be explicit');
  }
  assert.equal(receipt.browser?.caseCount,cloudflareBrowserCaseCount,'Complete native browser inventory is required');
  assert.equal(receipt.browser?.scope,'all');
  assert.equal(receipt.browser?.sourceCommit,sourceCommit);
  assert.equal(receipt.browser?.sourceIntegrity,true);
  assert.match(receipt.browser?.reportSha256??'',/^[a-f0-9]{64}$/);
  assert.equal(receipt.browser?.processPriority?.nice,0,'Native browser must retain normal CPU priority');
  assert.equal(receipt.fastCadence?.status,'passed','The isolated fast cadence phase must pass before verification qualifies');
  assertFastCadenceRelease(receipt.fastCadence,{sourceCommit,sourceTree:receipt.sourceTree,
    suiteRunId:receipt.browser.suiteRunId,sourceInventorySha256:receipt.browser.sourceInventorySha256,
    expectedObservationDates:receipt.fastCadence.expectedObservationDates});
  assert.ok(clockAtOrAfter(receipt.modelLaunchedAt,receipt.fastCadence.releasedAt),'The canonical model command must start after fast cadence release');
  assertModelPriorityReceipt(receipt.modelPriority);
  assert.equal(receipt.runtime?.node,cloudflareRuntime.node);
  assert.equal(receipt.runtime?.platform,cloudflareRuntime.platform);
  assert.equal(receipt.runtime?.arch,cloudflareRuntime.arch);
  assert.ok(Number.isFinite(Date.parse(receipt.completedAt))&&Date.parse(receipt.completedAt)>=Date.parse(receipt.startedAt),'Actual completed execution clock is required');
  return receipt;
}

const clockAtOrAfter=(value,baseline)=>Number.isFinite(Date.parse(value))&&Date.parse(value)>=Date.parse(baseline);
