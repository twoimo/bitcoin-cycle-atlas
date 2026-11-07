import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const sha40=/^[a-f0-9]{40}$/,commitRef=/^[a-f0-9]{40}$/i,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const keys=['schemaVersion','kind','sourceCommit','sourceTree','rawRef','refKind','branch','mode','buildUuid','remoteHead'];
export const cloudflareBrowserSourcePolicy=Object.freeze({
  schemaVersion:1,repository:'twoimo/bitcoin-cycle-atlas',
  branchForm:'exact-provider-branch-only-for-browser-with-clean-checkout-and-current-remote-head',
  shaForm:'literal-full-sha-equality-with-no-branch-fallback',
  authority:'complete-same-source-tree-plan-model-and-terminal-provider-success-before-native-and-publication',
});
function assertBranch(branch,mode){
  assert.ok(['production','review'].includes(mode),'A browser verification mode is required');
  assert.ok(typeof branch==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch),'Invalid browser source branch');
  assert.ok(!branch.includes('..')&&!branch.includes('//')&&!branch.endsWith('/')&&!branch.endsWith('.')&&
    !branch.split('/').some(part=>part.startsWith('.')||part.endsWith('.lock')),'Invalid browser source branch');
  assert.equal(mode==='production',branch==='main','Production requires main; review requires its actual non-main branch');
}
export function assertBrowserBuildSource(value,{source,environment,mode,branch,runId}={}){
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'Browser source provenance is required');
  assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),'Browser source provenance has omitted or unreviewed fields');
  assert.equal(value.schemaVersion,1);assert.equal(value.kind,'atlas-cloudflare-browser-source');
  assert.match(value.sourceCommit??'',sha40);assert.match(value.sourceTree??'',sha40);
  assert.match(value.buildUuid??'',uuid);assertBranch(value.branch,value.mode);
  if(source){assert.equal(value.sourceCommit,source.sourceCommit,'Browser checkout commit differs');assert.equal(value.sourceTree,source.sourceTree,'Browser checkout tree differs');}
  if(mode!==undefined)assert.equal(value.mode,mode);if(branch!==undefined)assert.equal(value.branch,branch);
  if(runId!==undefined)assert.equal(value.buildUuid,runId,'Browser source belongs to another Build');
  // Classify full SHAs first. Even a branch with a SHA-shaped name cannot turn a
  // different provider SHA into a successful branch resolution.
  if(commitRef.test(value.rawRef??'')){
    assert.equal(value.refKind,'commit');assert.equal(value.rawRef,value.sourceCommit,'Workers Build and checkout commits differ');
    assert.equal(value.remoteHead,null);
  }else{
    assert.equal(value.refKind,'branch');assert.equal(value.rawRef,value.branch,'Provider source ref must exactly equal its CI branch');
    assert.equal(value.remoteHead,value.sourceCommit,'The fixed repository branch no longer identifies this checkout');
  }
  if(environment){
    assert.equal(environment.WORKERS_CI,'1','Browser branch resolution requires an actual Workers Build');
    assert.equal(environment.WORKERS_CI_COMMIT_SHA,value.rawRef,'The raw provider source ref changed');
    assert.equal(environment.WORKERS_CI_BRANCH,value.branch,'The actual provider branch changed');
    assert.equal(environment.WORKERS_CI_BUILD_UUID,value.buildUuid,'The actual provider Build changed');
    if(environment.ATLAS_VERIFICATION_MODE!==undefined)assert.equal(environment.ATLAS_VERIFICATION_MODE,value.mode);
  }
  return value;
}
function repositoryGit(root,args){
  return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30_000}).trim();
}
export function readBrowserBuildSource({root,environment=process.env,mode,source,gitRead=args=>repositoryGit(root,args)}){
  assert.equal(environment.WORKERS_CI,'1','Browser source resolution requires an actual Workers Build');
  const branch=environment.WORKERS_CI_BRANCH,rawRef=environment.WORKERS_CI_COMMIT_SHA;
  assertBranch(branch,mode);assert.match(environment.WORKERS_CI_BUILD_UUID??'',uuid);
  const current={sourceCommit:gitRead(['rev-parse','HEAD']),sourceTree:gitRead(['rev-parse','HEAD^{tree}'])};
  assert.match(current.sourceCommit,sha40);assert.match(current.sourceTree,sha40);
  if(source)assert.deepEqual(current,{sourceCommit:source.sourceCommit,sourceTree:source.sourceTree},'Browser source revision changed');
  assert.equal(gitRead(['status','--porcelain','--untracked-files=all']),'','Browser source requires a clean committed checkout');
  const refKind=commitRef.test(rawRef??'')?'commit':'branch';
  if(refKind==='commit')assert.equal(rawRef,current.sourceCommit,'Workers Build and checkout commits differ');
  else assert.equal(rawRef,branch,'Only the exact provider branch is an accepted browser source ref');
  let remoteHead=null;
  if(refKind==='branch'){
    gitRead(['check-ref-format','--branch',branch]);
    const ref='refs/heads/'+branch;
    const lines=gitRead(['ls-remote','--exit-code','--refs','https://github.com/'+cloudflareBrowserSourcePolicy.repository+'.git',ref]).split('\n');
    assert.equal(lines.length,1,'The fixed repository branch head is absent or ambiguous');
    const parts=lines[0].split(/\s+/);assert.equal(parts.length,2);assert.equal(parts[1],ref,'Remote source is not the exact requested branch');
    assert.match(parts[0],sha40);remoteHead=parts[0];
    assert.equal(remoteHead,current.sourceCommit,'A newer or different remote branch superseded this browser Build');
  }
  return Object.freeze(assertBrowserBuildSource({schemaVersion:1,kind:'atlas-cloudflare-browser-source',...current,
    rawRef,refKind,branch,mode,buildUuid:environment.WORKERS_CI_BUILD_UUID,remoteHead},{source:current,environment,mode}));
}
async function readRecord(root,name){
  const bytes=await readFile(resolve(root,'build',name));
  assert.ok(bytes.length>0&&bytes.length<=2*1024*1024,'Browser identity evidence exceeds its bounded size');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

// Local and legacy SHA-only callers retain literal SHA checking. The branch
// form can only use the fixed current-B files written by the staged runner;
// neither an environment override nor a caller-selected evidence path exists.
export async function assertWorkersBuildSource({root,environment=process.env,source,verification,gitRead,now=Date.now()}){
  assert.match(source?.sourceCommit??'',sha40);assert.match(source?.sourceTree??'',sha40);
  const raw=environment.WORKERS_CI_COMMIT_SHA;
  const staged=verification?.kind==='atlas-cloudflare-staged-verification'||environment.ATLAS_VERIFICATION_STAGE==='browser';
  if(raw===undefined||raw===''){
    assert.equal(staged,false,'A staged browser Build must identify its actual provider source');
    return null;
  }
  const isCommit=commitRef.test(raw);
  if(isCommit)assert.equal(raw,source.sourceCommit,'Workers Builds source does not match the checked-out commit');
  if(isCommit&&!staged)return null;
  assert.equal(environment.WORKERS_CI,'1','A branch source requires an actual browser Build');
  const component=await readRecord(root,'cloudflare-browser-component.json');
  assert.ok(['RUNNING','PASS'].includes(component.status),'A failed or incomplete browser header cannot authorize its source');
  assert.equal(component.kind,'atlas-cloudflare-browser-component');assert.equal(component.stage,'browser');
  assert.equal(component.qualifiesFullVerification,false);
  const current=readBrowserBuildSource({root,environment,source,mode:component.mode,gitRead});
  assert.deepEqual(component.providerSource,current,'The frozen browser source provenance changed');
  const {assertStageIdentity,assertAcceptedModelStage,browserBuildIdentity,assertStagedVerification}=await import('./cloudflare-staged-contract.mjs');
  assertStageIdentity(component,{stage:'browser',...source,mode:current.mode,branch:current.branch});
  assert.equal(component.runId,current.buildUuid,'The browser header belongs to another current Build');
  assert.ok(Number.isFinite(Date.parse(component.startedAt)),'The actual browser Build start is required');
  const accepted=await readRecord(root,'cloudflare-model-acceptance.json');
  assertAcceptedModelStage(accepted,{source,browserBuild:browserBuildIdentity(component),now});
  if(verification){
    assertStagedVerification(verification,{...source,now});
    assert.deepEqual(verification.components.browser,component,'The completed aggregate and current browser component differ');
    assert.deepEqual(verification.components.model,accepted.component,'The completed aggregate changed the accepted model component');
    assert.deepEqual(verification.modelAttestation,accepted.attestation,'The completed aggregate changed model provider authority');
  }
  return current;
}

export function publicationSourceProvenance(environment,providerSource){
  return {
    // A branch name is provider provenance, never an event commit SHA.
    eventCommit:providerSource?.refKind==='branch'?null:(environment.WORKERS_CI_COMMIT_SHA||environment.GITHUB_SHA||null),
    ...(providerSource?{providerSource}:{}),
  };
}
