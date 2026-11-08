import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {assertModelComponent,cloudflareStagedPlanSha256} from './cloudflare-staged-contract.mjs';
import {
  cloudflareModelProviderPolicy,assertModelProviderPolicy,assertModelBrowserBuild,assertModelComponentIndex,
  assertModelProviderContext,assertVerifiedModelAttestation,selectSuccessfulModelChecks,
  serializeModelComponent,serializeModelComponentIndex,modelProviderCanonicalBytes,modelProviderSha256,
  modelCheckRunsEndpoint,modelComponentIndexPath,
} from './cloudflare-model-provider-policy.mjs';

const clone=value=>JSON.parse(modelProviderCanonicalBytes(value).toString('utf8'));
function immutable(value){
  if(value&&typeof value==='object'){for(const child of Object.values(value))immutable(child);Object.freeze(value);}
  return value;
}

async function responseBytes(response,maximumBytes,label){
  const length=response.headers.get('content-length');
  if(length!==null){
    assert.match(length,/^\d+$/,label+' has an invalid Content-Length');
    assert.ok(Number(length)<=maximumBytes,label+' exceeds its byte budget');
  }
  assert.match(response.headers.get('content-type')??'',/^application\/(?:[a-z0-9.-]+\+)?json(?:;|$)/i,
    label+' is not a JSON response');
  assert.ok(response.body,label+' has no body');
  const reader=response.body.getReader(),chunks=[];
  let total=0,complete=false;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done){complete=true;break;}
      assert.ok(value instanceof Uint8Array,label+' body is invalid');
      total+=value.byteLength;assert.ok(total<=maximumBytes,label+' exceeds its byte budget');
      chunks.push(Buffer.from(value));
    }
  }finally{
    if(!complete)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  assert.ok(total>0,label+' is empty');
  // Fetch decodes content codings but retains the encoded representation headers.
  // Only an identity Content-Length describes the bytes streamed above.
  const identity=(response.headers.get('content-encoding')??'identity').trim().toLowerCase()==='identity';
  if(length!==null&&identity)assert.equal(total,Number(length),label+' was truncated');
  return Buffer.concat(chunks,total);
}

function parseJson(bytes,label){
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch(error){throw new Error(label+' is not valid UTF-8 JSON',{cause:error});}
}

/**
 * Reuse is deliberately limited to this exact source/tree/plan/mode. The
 * public pointer is resolved once, not treated as a producer-to-consumer nonce.
 * Full model gates are validated here and again by the aggregate contract.
 */
export async function readVerifiedCloudflareModelStage({
  source,planSha256,browserBuild,policy=cloudflareModelProviderPolicy,
  fetchImpl=fetch,now=Date.now,delay=(ms,{signal}={})=>wait(ms,undefined,{signal}),signal,
}={}){
  assertModelProviderPolicy(policy);
  assert.equal(planSha256,cloudflareStagedPlanSha256,'The current staged verification plan is required');
  const clock=()=>{const value=typeof now==='function'?now():now;assert.ok(Number.isFinite(value),'Actual provider-read clock is required');return value;};
  const profile=assertModelBrowserBuild(browserBuild,{now:clock()});
  assert.match(source?.sourceCommit??'',/^[a-f0-9]{40}$/);assert.match(source?.sourceTree??'',/^[a-f0-9]{40}$/);
  let providerRequests=0,providerBytes=0;
  const transientProviderFailures=new WeakSet();
  async function get(url,maximumBytes,label,{provider=false}={}){
    signal?.throwIfAborted();
    const parsed=new URL(url);
    assert.equal(parsed.origin,provider?'https://api.github.com':profile.origin,'Unapproved evidence origin');
    assert.equal(parsed.username,'');assert.equal(parsed.password,'');assert.equal(parsed.hash,'');
    if(provider)assert.ok(++providerRequests<=policy.maximumProviderRequests,'Public provider request budget exhausted');
    const timeout=AbortSignal.timeout(policy.requestTimeoutMs);
    const requestSignal=signal?AbortSignal.any([timeout,signal]):timeout;
    const response=await fetchImpl(url,{
      method:'GET',redirect:'error',cache:'no-store',signal:requestSignal,
      headers:provider?{'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Atlas-source-bound-verification'}:
        {'Accept':'application/json'},
    });
    try{
      requestSignal.throwIfAborted();
      assert.notEqual(response.redirected,true,label+' redirected away from its approved URL');
      if(response.url)assert.equal(new URL(response.url).href,parsed.href,label+' response URL differs');
      if(provider&&[502,503,504].includes(response.status)){
        // Only this observed provider response may consume another existing poll.
        // A transport error or an untrusted error message cannot enter this set.
        const error=new Error(label+' HTTP '+response.status);
        transientProviderFailures.add(error);throw error;
      }
      assert.equal(response.status,200,label+' HTTP '+response.status);
      const bytes=await responseBytes(response,maximumBytes,label);
      if(provider){providerBytes+=bytes.length;assert.ok(providerBytes<=policy.maximumProviderBytes,'Public provider byte budget exhausted');}
      requestSignal.throwIfAborted();
      return bytes;
    }catch(error){
      // Header/status rejection occurs before acquiring a body reader. Close
      // that response too, so a rejected large response does not keep streaming.
      if(response.body&&!response.body.locked)await response.body.cancel().catch(()=>{});
      requestSignal.throwIfAborted();
      throw error;
    }
  }

  const indexPath=modelComponentIndexPath(source.sourceCommit);
  // One pointer snapshot. A later deployment cannot silently select another A.
  const indexBytes=await get(profile.origin+indexPath,policy.maximumIndexBytes,'Model component index');
  const index=parseJson(indexBytes,'Model component index');
  assertModelComponentIndex(index,{...source,planSha256,mode:profile.mode});
  assert.ok(indexBytes.equals(serializeModelComponentIndex(index)),'Model component index is not canonical JSON');
  const receiptPath='/receipts/'+source.sourceCommit+'/'+index.producerBuildUuid+'.json';
  assert.equal(receiptPath,index.receipt.path);
  const receiptBytes=await get(profile.origin+receiptPath,policy.maximumReceiptBytes,'Model component receipt');
  assert.equal(receiptBytes.length,index.receipt.bytes,'Model component receipt byte count differs');
  assert.equal(modelProviderSha256(receiptBytes),index.receipt.sha256,'Model component receipt digest differs');
  const component=parseJson(receiptBytes,'Model component receipt');
  assert.ok(receiptBytes.equals(serializeModelComponent(component)),'Model component receipt is not canonical JSON');
  assert.equal(component.runId,index.producerBuildUuid,'Model component belongs to another indexed Build');
  assertModelComponent(component,{...source,mode:browserBuild.mode,branch:browserBuild.branch,now:clock()});
  assertModelProviderContext({component,source,planSha256,browserBuild,now:clock()});

  const endpoint=modelCheckRunsEndpoint(source.sourceCommit,component.workerName);
  async function snapshot(){
    const records=[],ids=new Set();
    let totalCount;
    for(let page=1;page<=policy.maximumCheckPages;page++){
      const bytes=await get(endpoint+'&page='+page,policy.maximumProviderResponseBytes,'Public provider check runs',{provider:true});
      const body=parseJson(bytes,'Public provider check runs');
      assert.ok(body&&typeof body==='object'&&!Array.isArray(body));
      assert.ok(Number.isSafeInteger(body.total_count)&&body.total_count>=0&&body.total_count<=policy.maximumCheckPages*policy.checksPerPage,
        'Public provider check inventory exceeds its bound');
      assert.ok(Array.isArray(body.check_runs)&&body.check_runs.length<=policy.checksPerPage,'Public provider check page is invalid');
      totalCount??=body.total_count;
      assert.equal(body.total_count,totalCount,'Public provider check pagination changed during the snapshot');
      for(const check of body.check_runs){
        assert.ok(check&&typeof check==='object'&&!Array.isArray(check)&&Number.isSafeInteger(check.id)&&check.id>0);
        assert.ok(!ids.has(check.id),'Public provider check pagination repeated an entry');
        ids.add(check.id);records.push(check);
      }
      assert.ok(records.length<=totalCount,'Public provider check inventory is inconsistent');
      if(records.length===totalCount)return records.filter(check=>check.external_id===component.runId);
      assert.equal(body.check_runs.length,policy.checksPerPage,'Public provider check pagination was truncated');
    }
    throw new Error('Public provider pagination budget exhausted');
  }

  let authority;
  for(let attempt=0;attempt<policy.maximumPollAttempts;attempt++){
    try{
      const checks=await snapshot(),observedAt=new Date(clock()).toISOString();
      const terminalCheckIds=selectSuccessfulModelChecks(checks,{component,now:Date.parse(observedAt)});
      if(terminalCheckIds){
        authority={endpoint,observedAt,checks,checksSha256:modelProviderSha256(modelProviderCanonicalBytes(checks)),terminalCheckIds};
        break;
      }
    }catch(error){
      signal?.throwIfAborted();
      if(!transientProviderFailures.has(error)||attempt+1===policy.maximumPollAttempts)throw error;
      // snapshot() owns its pages; discard every partial row before the next poll.
    }
    if(attempt+1<policy.maximumPollAttempts){
      signal?.throwIfAborted();await delay(policy.pollIntervalMs,{signal});signal?.throwIfAborted();
    }
  }
  assert.ok(authority,'The exact model Build has no observed terminal provider success within the bounded wait');
  signal?.throwIfAborted();
  const attestation={
    schemaVersion:1,kind:'atlas-cloudflare-model-provider-attestation',status:'VERIFIED',
    trust:policy.trust,reuse:policy.reuse,acceptedAt:new Date(clock()).toISOString(),
    producer:{buildUuid:component.runId,workerName:component.workerName,accountId:policy.accountId,
      repository:policy.repository,mode:component.mode},
    consumer:clone(browserBuild),
    publication:{origin:profile.origin,indexPath,index:clone(index),indexBytes:indexBytes.length,indexSha256:modelProviderSha256(indexBytes),
      receiptPath,receiptBytes:receiptBytes.length,receiptSha256:modelProviderSha256(receiptBytes)},
    authority,
  };
  assertVerifiedModelAttestation(attestation,{component,source,planSha256,browserBuild,policy,now:clock()});
  return immutable({component,attestation});
}
