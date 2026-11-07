import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const sha40=/^[a-f0-9]{40}$/,sha64=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const freeze=value=>{
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
};

// Public status does not sign the receipt bytes. The receipt publisher is
// explicitly trusted with the same deployment authority as the product.
export const cloudflareModelProviderPolicy=freeze({
  schemaVersion:1,kind:'atlas-model-public-provider-policy',
  accountId:'7bd4c42b9400babab532b604f48a86f0',
  repository:'twoimo/bitcoin-cycle-atlas',
  trust:'owned-worker-publication-and-official-provider-check',
  reuse:'exact-source-tree-plan-and-mode-not-dispatch-lineage',
  maxAgeMs:6*60*60*1000,maximumFutureClockMs:0,
  providerTimestampResolutionMs:1000,
  indexPathPrefix:'/sources/',
  maximumIndexBytes:16*1024,maximumReceiptBytes:128*1024,
  maximumProviderResponseBytes:2*1024*1024,maximumProviderBytes:16*1024*1024,
  maximumProviderRequests:20,maximumCheckPages:10,checksPerPage:100,
  maximumPollAttempts:6,pollIntervalMs:5000,requestTimeoutMs:15000,
  app:{id:85455,slug:'cloudflare-workers-and-pages',ownerId:314135,ownerLogin:'cloudflare'},
  modes:{
    production:{modelWorker:'bitcoin-cycle-atlas-models',browserWorker:'bitcoin-cycle-atlas',
      origin:'https://bitcoin-cycle-atlas-models.twoimo.workers.dev'},
    review:{modelWorker:'bitcoin-cycle-atlas-models-verify',browserWorker:'bitcoin-cycle-atlas-verify',
      origin:'https://bitcoin-cycle-atlas-models-verify.twoimo.workers.dev'},
  },
});

export function modelStagePublicationProfile(consumerWorkerName){
  for(const [mode,value]of Object.entries(cloudflareModelProviderPolicy.modes)){
    if(value.browserWorker===consumerWorkerName)return freeze({
      mode,origin:value.origin,producerWorkerName:value.modelWorker,consumerWorkerName:value.browserWorker,
      modelWorker:value.modelWorker,browserWorker:value.browserWorker,
      accountId:cloudflareModelProviderPolicy.accountId,repository:cloudflareModelProviderPolicy.repository,
    });
  }
  throw new Error('Unknown model-component consumer Worker');
}

export function modelProviderSha256(bytes){return createHash('sha256').update(bytes).digest('hex');}

function canonicalJson(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){assert.ok(Number.isFinite(value),'Non-finite JSON number');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  assert.ok(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),
    'Only plain JSON values may enter provider evidence');
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key])).join(',')+'}';
}

export function modelProviderCanonicalBytes(value){return Buffer.from(canonicalJson(value)+'\n');}
export const serializeModelComponent=modelProviderCanonicalBytes;
export const serializeModelComponentIndex=modelProviderCanonicalBytes;

export function modelComponentIndexPath(sourceCommit){
  assert.match(sourceCommit??'',sha40);
  return cloudflareModelProviderPolicy.indexPathPrefix+sourceCommit+'.json';
}

function keys(value,expected,label){
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),label+' must be an object');
  assert.deepEqual(Object.keys(value).sort(),[...expected].sort(),label+' has omitted or unreviewed fields');
}

export function modelProviderClock(value,label='Evidence clock'){
  assert.equal(typeof value,'string',label+' must be a UTC timestamp');
  assert.match(value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,label+' must be canonical UTC');
  const time=Date.parse(value);
  assert.ok(Number.isFinite(time)&&new Date(time).toISOString()===(value.includes('.')?value:value.slice(0,-1)+'.000Z'),
    label+' is invalid');
  return time;
}

export function assertModelProviderPolicy(policy=cloudflareModelProviderPolicy){
  assert.deepEqual(policy,cloudflareModelProviderPolicy,'The source-bound public provider policy cannot be overridden');
  return policy;
}

export function assertModelBrowserBuild(browserBuild,{now=Date.now()}={}){
  keys(browserBuild,['buildUuid','startedAt','workerName','accountId','repository','mode','branch'],'Consumer Build identity');
  const profile=modelStagePublicationProfile(browserBuild.workerName);
  assert.match(browserBuild.buildUuid??'',uuid,'Actual consumer Build UUID is required');
  assert.equal(browserBuild.accountId,profile.accountId);
  assert.equal(browserBuild.repository,profile.repository);
  assert.equal(browserBuild.mode,profile.mode);
  assert.ok(typeof browserBuild.branch==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(browserBuild.branch));
  assert.ok(!browserBuild.branch.includes('..')&&!browserBuild.branch.includes('//')&&!browserBuild.branch.endsWith('/')&&
    !browserBuild.branch.endsWith('.')&&!browserBuild.branch.split('/').some(part=>part.startsWith('.')||part.endsWith('.lock')));
  assert.equal(profile.mode==='production',browserBuild.branch==='main','Production must use main; review must use its actual non-main branch');
  assert.ok(modelProviderClock(browserBuild.startedAt,'Consumer start')<=now,'Consumer start is in the future');
  return profile;
}

export function assertModelComponentIndex(index,{sourceCommit,sourceTree,planSha256,mode}={}){
  const p=cloudflareModelProviderPolicy;
  keys(index,['schemaVersion','kind','sourceCommit','sourceTree','planSha256','producerBuildUuid','mode','receipt'],'Model component index');
  assert.equal(index.schemaVersion,1);assert.equal(index.kind,'atlas-model-component-index');
  assert.match(index.sourceCommit??'',sha40);assert.match(index.sourceTree??'',sha40);assert.match(index.planSha256??'',sha64);
  assert.match(index.producerBuildUuid??'',uuid);
  assert.ok(Object.hasOwn(p.modes,index.mode),'Unknown component mode');
  for(const [field,value]of Object.entries({sourceCommit,sourceTree,planSha256,mode})){
    if(value!==undefined)assert.equal(index[field],value,'Model index '+field+' differs from the consumer');
  }
  keys(index.receipt,['path','bytes','sha256'],'Model receipt descriptor');
  assert.equal(index.receipt.path,'/receipts/'+index.sourceCommit+'/'+index.producerBuildUuid+'.json','Unsafe or mixed-source receipt path');
  assert.ok(Number.isSafeInteger(index.receipt.bytes)&&index.receipt.bytes>0&&index.receipt.bytes<=p.maximumReceiptBytes,'Model receipt byte budget is invalid');
  assert.match(index.receipt.sha256??'',sha64,'Model receipt digest is invalid');
  return index;
}

export function createModelComponentIndex(component,rawBytes){
  assert.ok(Buffer.isBuffer(rawBytes),'Exact model component bytes are required');
  assert.ok(rawBytes.equals(serializeModelComponent(component)),'Model component bytes must use the reviewed canonical serializer');
  const index={schemaVersion:1,kind:'atlas-model-component-index',sourceCommit:component.sourceCommit,
    sourceTree:component.sourceTree,planSha256:component.planSha256,producerBuildUuid:component.runId,mode:component.mode,
    receipt:{path:'/receipts/'+component.sourceCommit+'/'+component.runId+'.json',bytes:rawBytes.length,sha256:modelProviderSha256(rawBytes)}};
  assertModelComponentIndex(index);
  assert.ok(serializeModelComponentIndex(index).length<=cloudflareModelProviderPolicy.maximumIndexBytes);
  return index;
}

export function modelCheckRunsEndpoint(sourceCommit,producerWorkerName){
  assert.match(sourceCommit??'',sha40);
  assert.ok(Object.values(cloudflareModelProviderPolicy.modes).some(value=>value.modelWorker===producerWorkerName));
  const query=new URLSearchParams({check_name:'Workers Builds: '+producerWorkerName,
    app_id:String(cloudflareModelProviderPolicy.app.id),filter:'all',per_page:String(cloudflareModelProviderPolicy.checksPerPage)});
  return 'https://api.github.com/repos/'+cloudflareModelProviderPolicy.repository+'/commits/'+sourceCommit+'/check-runs?'+query;
}

export function assertModelProviderContext({component,source,planSha256,browserBuild,now=Date.now()}){
  const p=cloudflareModelProviderPolicy,profile=assertModelBrowserBuild(browserBuild,{now});
  keys(source,['sourceCommit','sourceTree'],'Source identity');
  assert.match(source.sourceCommit??'',sha40);assert.match(source.sourceTree??'',sha40);assert.match(planSha256??'',sha64);
  assert.equal(component?.schemaVersion,1);assert.equal(component?.kind,'atlas-cloudflare-model-component');
  assert.equal(component.status,'PASS');assert.equal(component.qualifiesFullVerification,false);assert.equal(component.stage,'model');
  assert.equal(component.provider,'cloudflare-workers-builds');assert.equal(component.accountId,p.accountId);
  assert.equal(component.repository,p.repository);assert.equal(component.workerName,profile.producerWorkerName);
  assert.equal(component.mode,profile.mode);assert.equal(component.branch,browserBuild.branch);
  assert.equal(component.sourceCommit,source.sourceCommit);assert.equal(component.sourceTree,source.sourceTree);
  assert.equal(component.planSha256,planSha256);assert.match(component.runId??'',uuid);
  assert.notEqual(component.runId,browserBuild.buildUuid,'Model and browser stages require distinct actual Builds');
  const start=modelProviderClock(component.startedAt,'Model component start');
  const completed=modelProviderClock(component.completedAt,'Model component completion');
  assert.ok(completed>=start&&completed<=now,'Model component completion is invalid or in the future');
  assert.ok(now-completed<=p.maxAgeMs,'Model component is older than the six-hour reuse bound');
  return profile;
}

// A pending check can remain visible after Cloudflare creates a separate final
// check. Its clock is provider metadata, never the actual Build start clock.
export function selectSuccessfulModelChecks(checks,{component,now=Date.now()}){
  const p=cloudflareModelProviderPolicy;
  assert.ok(Array.isArray(checks)&&checks.length<=p.maximumCheckPages*p.checksPerPage,'Provider check inventory is invalid');
  const expectedUrl='https://dash.cloudflare.com/'+p.accountId+'/workers/services/view/'+component.workerName+
    '/production/builds/'+component.runId;
  const ids=new Set(),terminal=[];
  for(const check of checks){
    assert.ok(check&&typeof check==='object'&&!Array.isArray(check),'Provider check must be an object');
    assert.ok(Number.isSafeInteger(check.id)&&check.id>0&&!ids.has(check.id),'Provider check IDs must be unique');
    ids.add(check.id);
    assert.equal(check.external_id,component.runId,'Provider check belongs to another Build');
    assert.equal(check.head_sha,component.sourceCommit,'Provider check belongs to another source');
    assert.equal(check.name,'Workers Builds: '+component.workerName,'Provider check belongs to another Worker');
    assert.equal(check.details_url,expectedUrl,'Provider check account, Worker or Build path differs');
    assert.equal(check.app?.id,p.app.id);assert.equal(check.app?.slug,p.app.slug);
    assert.equal(check.app?.owner?.id,p.app.ownerId);assert.equal(check.app?.owner?.login,p.app.ownerLogin);
    if(check.url!==undefined)assert.equal(check.url,'https://api.github.com/repos/'+p.repository+'/check-runs/'+check.id);
    assert.ok(['queued','in_progress','waiting','pending','requested','completed'].includes(check.status),'Unknown provider status');
    if(check.status!=='completed'){
      assert.equal(check.conclusion,null,'A nonterminal provider check cannot carry a conclusion');
      assert.equal(check.completed_at,null,'A nonterminal provider check cannot carry a completion clock');
      continue;
    }
    assert.equal(check.conclusion,'success','A failed or conflicting terminal provider check cannot qualify');
    const finished=modelProviderClock(check.completed_at,'Provider completion');
    assert.ok(finished<=now,'Provider completion is in the future');
    assert.ok(finished+p.providerTimestampResolutionMs>=modelProviderClock(component.completedAt),
      'Provider success predates the model component');
    if(check.started_at!==null&&check.started_at!==undefined){
      assert.ok(modelProviderClock(check.started_at,'Provider check start')<=finished,'Provider check clocks are reversed');
    }
    terminal.push(check.id);
  }
  return terminal.length?terminal.sort((a,b)=>a-b):null;
}

export function assertVerifiedModelAttestation(attestation,{component,source,planSha256,browserBuild,
  policy=cloudflareModelProviderPolicy,now=Date.now()}={}){
  assertModelProviderPolicy(policy);
  const profile=assertModelProviderContext({component,source,planSha256,browserBuild,now});
  keys(attestation,['schemaVersion','kind','status','trust','reuse','acceptedAt','producer','consumer','publication','authority'],'Model provider attestation');
  assert.equal(attestation.schemaVersion,1);assert.equal(attestation.kind,'atlas-cloudflare-model-provider-attestation');
  assert.equal(attestation.status,'VERIFIED');assert.equal(attestation.trust,policy.trust);assert.equal(attestation.reuse,policy.reuse);
  const accepted=modelProviderClock(attestation.acceptedAt,'Consumer acceptance');
  assert.ok(accepted<=now&&accepted>=modelProviderClock(browserBuild.startedAt)&&accepted>=modelProviderClock(component.completedAt),
    'Consumer acceptance clock is invalid');
  assert.ok(accepted-modelProviderClock(component.completedAt)<=policy.maxAgeMs,'Model component was too old at acceptance');
  assert.deepEqual(attestation.consumer,browserBuild,'Attestation belongs to another consumer Build');
  assert.deepEqual(attestation.producer,{buildUuid:component.runId,workerName:component.workerName,accountId:policy.accountId,
    repository:policy.repository,mode:component.mode},'Attestation belongs to another model producer');
  const pub=attestation.publication;
  keys(pub,['origin','indexPath','index','indexBytes','indexSha256','receiptPath','receiptBytes','receiptSha256'],'Model publication evidence');
  assert.equal(pub.origin,profile.origin);assert.equal(pub.indexPath,modelComponentIndexPath(source.sourceCommit));
  assertModelComponentIndex(pub.index,{...source,planSha256,mode:profile.mode});
  assert.equal(pub.index.producerBuildUuid,component.runId);
  const indexBytes=serializeModelComponentIndex(pub.index),receiptBytes=serializeModelComponent(component);
  assert.equal(pub.indexBytes,indexBytes.length);assert.equal(pub.indexSha256,modelProviderSha256(indexBytes));
  assert.equal(pub.receiptPath,pub.index.receipt.path);assert.equal(pub.receiptBytes,pub.index.receipt.bytes);
  assert.equal(pub.receiptSha256,pub.index.receipt.sha256);
  assert.equal(pub.receiptBytes,receiptBytes.length);assert.equal(pub.receiptSha256,modelProviderSha256(receiptBytes),
    'Attested component bytes differ from the accepted receipt');
  const authority=attestation.authority;
  keys(authority,['endpoint','observedAt','checks','checksSha256','terminalCheckIds'],'Public provider authority');
  assert.equal(authority.endpoint,modelCheckRunsEndpoint(source.sourceCommit,component.workerName));
  const observed=modelProviderClock(authority.observedAt,'Provider observation');
  assert.ok(observed<=accepted&&observed>=modelProviderClock(browserBuild.startedAt),'Provider observation clock is invalid');
  assert.equal(authority.checksSha256,modelProviderSha256(modelProviderCanonicalBytes(authority.checks)),
    'Provider check snapshot digest differs');
  const terminals=selectSuccessfulModelChecks(authority.checks,{component,now:observed});
  assert.ok(terminals,'Actual completed provider success is required');
  assert.deepEqual(authority.terminalCheckIds,terminals,'Terminal provider check identity differs');
  return attestation;
}
