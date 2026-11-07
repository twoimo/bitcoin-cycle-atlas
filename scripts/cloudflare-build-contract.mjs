import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createEthBrowserCaseSpecs} from './eth-browser-case-specs.mjs';

// These are execution gates, not names of old GitHub jobs. Every gate runs
// against one clean source checkout before the Cloudflare artifact is built.
export const cloudflareBuildGates=Object.freeze([
  {id:'runtime-preflight',kind:'runtime'},
  {id:'locked-dependencies',command:'npm',args:['ci','--ignore-scripts']},
  {id:'generated-pages',command:'npm',args:['run','verify:pages']},
  {id:'model-tests',command:'npm',args:['test','--','--test-concurrency=2']},
  {id:'typecheck',command:'npm',args:['run','typecheck']},
  {id:'panel-tests',kind:'node-tests',directory:'tests/web',extension:'.test.tsx'},
  {id:'service-build',command:'npm',args:['run','build:web']},
  {id:'postgres-service-tests',kind:'node-tests',directory:'tests/service',extension:'.test.ts'},
  ...['forecast','research','eth-events','treasury-paths','numerics','formal','cycle','performance','static','chart-replay'].map(id=>({id,command:'npm',args:['run','verify:'+id]})),
  {id:'native-browser',command:'node',args:['scripts/verify-eth-candidate-browser.mjs']},
  {id:'publication',command:'npm',args:['run','build:publication']},
  {id:'publication-check',command:'npm',args:['run','verify:publication']},
  {id:'standalone',command:'node',args:['scripts/build-standalone.mjs','build/Bitcoin_Cycles_Comparison.html']},
  {id:'standalone-check',command:'node',args:['scripts/verify-static.mjs','--standalone','build/Bitcoin_Cycles_Comparison.html']},
].map(gate=>Object.freeze(gate)));

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
  gates:cloudflareBuildGates,runtime:cloudflareRuntime,browserCases:createEthBrowserCaseSpecs(),
})).digest('hex');

export function assertCloudflareVerificationReceipt(receipt,{sourceCommit,sourceTree}={}){
  assert.equal(receipt?.schemaVersion,1,'Expected the current Cloudflare verification receipt schema');
  assert.equal(receipt?.kind,'atlas-cloudflare-verification');
  assert.equal(receipt?.status,'PASS','A complete successful verification is required');
  assert.match(sourceCommit??'',/^[a-f0-9]{40}$/,'Current committed source is required');
  assert.equal(receipt.sourceCommit,sourceCommit,'Verification belongs to another source commit');
  if(sourceTree)assert.equal(receipt.sourceTree,sourceTree,'Verification belongs to another source tree');
  assert.equal(receipt.planSha256,cloudflarePlanSha256,'Verification used a different gate/runtime plan');
  assert.deepEqual(receipt.gates?.map(gate=>gate.id),requiredCloudflareGateIds,'Every required gate must execute exactly once in order');
  for(const gate of receipt.gates){
    assert.equal(gate.status,'PASS','Incomplete or failed gate: '+gate.id);
    assert.ok(Number.isFinite(gate.durationMs)&&gate.durationMs>=0,'Actual gate duration is required');
    assert.match(gate.logSha256??'',/^[a-f0-9]{64}$/,'Actual gate log hash is required');
  }
  assert.equal(receipt.browser?.caseCount,cloudflareBrowserCaseCount,'Complete native browser inventory is required');
  assert.equal(receipt.browser?.scope,'all');
  assert.equal(receipt.browser?.sourceCommit,sourceCommit);
  assert.equal(receipt.browser?.sourceIntegrity,true);
  assert.match(receipt.browser?.reportSha256??'',/^[a-f0-9]{64}$/);
  assert.equal(receipt.runtime?.node,cloudflareRuntime.node);
  assert.equal(receipt.runtime?.platform,cloudflareRuntime.platform);
  assert.equal(receipt.runtime?.arch,cloudflareRuntime.arch);
  assert.ok(Number.isFinite(Date.parse(receipt.completedAt))&&Date.parse(receipt.completedAt)>=Date.parse(receipt.startedAt),'Actual completed execution clock is required');
  return receipt;
}
