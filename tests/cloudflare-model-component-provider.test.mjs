import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudflareModelProviderPolicy as policy,modelStagePublicationProfile,createModelComponentIndex,
  assertModelComponentIndex,serializeModelComponent,serializeModelComponentIndex,modelProviderCanonicalBytes,
  modelProviderSha256,assertVerifiedModelAttestation,modelComponentIndexPath,
} from '../scripts/cloudflare-model-provider-policy.mjs';
import {readVerifiedCloudflareModelStage} from '../scripts/cloudflare-model-component-provider.mjs';
import {cloudflareStagedPlanSha256,browserBuildIdentity} from '../scripts/cloudflare-staged-contract.mjs';
import {modelComponentFixture,browserComponentFixture,modelAttestationFixture} from './helpers/cloudflare-staged-fixture.mjs';

const copy=value=>structuredClone(value);
const at=value=>new Date(value).toISOString();
function jsonResponse(value,{bytes,headers={},status=200,redirected=false}={}){
  const body=bytes??Buffer.from(JSON.stringify(value));
  const response=new Response(body,{status,headers:{'content-type':'application/json',...headers}});
  if(redirected)Object.defineProperty(response,'redirected',{value:true});
  return response;
}

function fixture(options={}){
  const mode=options.mode??'review',base=modelComponentFixture({mode});
  const component=options.component??copy(base);
  const browser=options.browser??browserComponentFixture({mode});
  const browserBuild=browserBuildIdentity(browser),source={sourceCommit:base.sourceCommit,sourceTree:base.sourceTree};
  const profile=modelStagePublicationProfile(browserBuild.workerName);
  const receipt=serializeModelComponent(component),index=createModelComponentIndex(component,receipt);
  const defaults=modelAttestationFixture({model:component,browser}).authority.checks;
  const snapshots=options.snapshots??[defaults];
  const requests=[],delays=[];
  let time=options.now??Date.parse(browser.startedAt)+1000,poll=-1;
  const fetchImpl=async(url,request)=>{
    requests.push({url,request});
    assert.equal(request.method,'GET');assert.equal(request.redirect,'error');
    assert.equal(request.cache,'no-store');assert.ok(request.signal instanceof AbortSignal);
    assert.ok(!Object.keys(request.headers).some(key=>key.toLowerCase()==='authorization'),'Public checks must not receive credentials');
    let response;
    if(url===profile.origin+modelComponentIndexPath(source.sourceCommit)){
      response=jsonResponse(null,{bytes:options.indexBytes??serializeModelComponentIndex(index)});
    }else if(url===profile.origin+index.receipt.path){
      response=jsonResponse(null,{bytes:options.receiptBytes??receipt});
    }else{
      const endpoint=new URL(url);
      assert.equal(endpoint.origin,'https://api.github.com');
      assert.equal(endpoint.searchParams.get('filter'),'all');assert.equal(endpoint.searchParams.get('app_id'),String(policy.app.id));
      assert.equal(endpoint.searchParams.get('check_name'),'Workers Builds: '+profile.producerWorkerName);
      assert.equal(endpoint.searchParams.get('per_page'),'100');
      const page=Number(endpoint.searchParams.get('page'));
      if(page===1)poll++;
      const checks=snapshots[Math.min(poll,snapshots.length-1)];
      response=jsonResponse({total_count:checks.length,check_runs:checks.slice((page-1)*100,page*100)});
    }
    return options.response?options.response({url,request,response,index,receipt,poll,requests}):response;
  };
  const parameters={source,planSha256:cloudflareStagedPlanSha256,browserBuild,policy,fetchImpl,now:()=>time,
    delay:async ms=>{delays.push(ms);time+=ms;}};
  return {component,browser,browserBuild,source,profile,receipt,index,requests,delays,
    parameters,now:()=>time,read:extra=>readVerifiedCloudflareModelStage({...parameters,...extra})};
}

test('exact public provider success accepts a complete model component and retains normal pending duplication',async()=>{
  const f=fixture(),result=await f.read();
  assert.deepEqual(result.component,f.component);
  assert.equal(result.attestation.authority.checks.length,2);
  assert.deepEqual(result.attestation.authority.terminalCheckIds,[2]);
  assert.equal(result.attestation.publication.receiptSha256,modelProviderSha256(f.receipt));
  assert.equal(result.attestation.reuse,'exact-source-tree-plan-and-mode-not-dispatch-lineage');
  assert.equal(f.requests.length,3);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.component)&&Object.isFrozen(result.attestation.authority.checks));
  assertVerifiedModelAttestation(result.attestation,{component:result.component,...f.parameters,now:f.now()});
});

test('provider webhook completion may appear after consumer Build start, before acceptance',async()=>{
  const f=fixture(),checks=modelAttestationFixture({model:f.component,browser:f.browser}).authority.checks;
  checks[1].started_at=at(Date.parse(f.browser.startedAt)+500);
  checks[1].completed_at=checks[1].started_at;
  const other=fixture({snapshots:[checks]});
  const result=await other.read();
  assert.ok(Date.parse(result.attestation.authority.checks[1].completed_at)>Date.parse(other.browser.startedAt));
  assert.ok(Date.parse(result.attestation.acceptedAt)>=Date.parse(checks[1].completed_at));
});

test('production and review use separate fixed receipt hosts and Workers',async()=>{
  for(const mode of ['production','review']){
    const f=fixture({mode}),result=await f.read();
    assert.equal(result.component.mode,mode);
    assert.ok(f.requests[0].url.startsWith(policy.modes[mode].origin+'/sources/'));
    assert.equal(result.attestation.producer.workerName,policy.modes[mode].modelWorker);
  }
  assert.throws(()=>modelStagePublicationProfile('attacker-worker'),/Unknown/);
  const f=fixture();
  await assert.rejects(f.read({policy:{...policy,maxAgeMs:Infinity}}),/cannot be overridden/);
  assert.equal(f.requests.length,0);
});

test('pending status polls only the fixed producer; source pointer and receipt are fetched once',async()=>{
  const initial=fixture(),checks=modelAttestationFixture({model:initial.component,browser:initial.browser}).authority.checks;
  const f=fixture({snapshots:[[checks[0]],[checks[0]],checks]});
  const result=await f.read();
  assert.equal(f.requests.filter(item=>item.url.includes('/sources/')).length,1);
  assert.equal(f.requests.filter(item=>item.url.includes('/receipts/')).length,1);
  assert.equal(f.requests.filter(item=>item.url.startsWith('https://api.github.com/')).length,3);
  assert.deepEqual(f.delays,[5000,5000]);
  assert.equal(result.attestation.publication.index.producerBuildUuid,f.component.runId);
});

test('bounded pagination checks the complete public snapshot before accepting a terminal row',async()=>{
  const f=fixture(),checks=modelAttestationFixture({model:f.component,browser:f.browser}).authority.checks;
  const unrelated=Array.from({length:99},(_,i)=>({...copy(checks[0]),id:100+i,
    external_id:'33333333-3333-4333-8333-333333333333'}));
  const other=fixture({snapshots:[[...unrelated,checks[0],checks[1]]]});
  const result=await other.read();
  assert.equal(other.requests.filter(item=>item.url.startsWith('https://api.github.com/')).length,2);
  assert.deepEqual(result.attestation.authority.checks,checks);
});

test('every non-success terminal outcome rejects, including a success plus conflicting failure',async t=>{
  for(const conclusion of ['failure','cancelled','timed_out','neutral','skipped','action_required','stale']){
    await t.test(conclusion,async()=>{
      const seed=fixture(),checks=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks;
      checks.push({...copy(checks[1]),id:3,url:'https://api.github.com/repos/'+policy.repository+'/check-runs/3',conclusion});
      await assert.rejects(fixture({snapshots:[checks]}).read(),/terminal provider check/);
    });
  }
});

test('provider authority requires official App, owner, source, account, Worker and exact Build path',async t=>{
  const corruptions={
    app:check=>{check.app.id++;},slug:check=>{check.app.slug='lookalike';},
    ownerId:check=>{check.app.owner.id++;},ownerLogin:check=>{check.app.owner.login='lookalike';},
    source:check=>{check.head_sha='f'.repeat(40);},
    workerName:check=>{check.name='Workers Builds: wrong';},
    account:check=>{check.details_url=check.details_url.replace(policy.accountId,'f'.repeat(32));},
    workerPath:check=>{check.details_url=check.details_url.replace('/bitcoin-cycle-atlas-models-verify/','/other/');},
    buildPath:check=>{check.details_url=check.details_url.replace('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');},
    query:check=>{check.details_url+='?misleading=1';},
    wrongApiRepository:check=>{check.url=check.url.replace('twoimo/bitcoin-cycle-atlas','attacker/bitcoin-cycle-atlas');},
    pendingConclusion:check=>{check.status='in_progress';check.conclusion='success';},
  };
  for(const [name,change]of Object.entries(corruptions)){
    await t.test(name,async()=>{
      const f=fixture(),checks=modelAttestationFixture({model:f.component,browser:f.browser}).authority.checks;
      change(checks[1]);await assert.rejects(fixture({snapshots:[checks]}).read());
    });
  }
});

test('a green check from another Build cannot qualify this fixed receipt',async()=>{
  const f=fixture(),checks=modelAttestationFixture({model:f.component,browser:f.browser}).authority.checks;
  for(const check of checks)check.external_id='33333333-3333-4333-8333-333333333333';
  const other=fixture({snapshots:[checks]});
  await assert.rejects(other.read(),/no observed terminal provider success/);
  assert.equal(other.requests.filter(item=>item.url.startsWith('https://api.github.com/')).length,policy.maximumPollAttempts);
  assert.equal(other.requests.filter(item=>item.url.includes('/sources/')).length,1);
});

test('incomplete, omitted, reordered and skipped model verification never reaches provider qualification',async t=>{
  const mutations={
    missingGate:value=>value.gates.pop(),
    reversedGates:value=>value.gates.reverse(),
    failedGate:value=>{value.gates[3].status='FAIL';},
    incomplete:value=>{value.modelTests.complete=false;},
    skipped:value=>{value.modelTests.pass=2;value.modelTests.skipped=1;},
    partialTotal:value=>{value.modelTests.pass=2;},
    wrongRuntime:value=>{value.runtime.node='v22.0.0';},
    loweredPriority:value=>{value.modelPriority.actualNice=10;},
    fullPassRelabel:value=>{value.qualifiesFullVerification=true;},
  };
  for(const [name,change]of Object.entries(mutations)){
    await t.test(name,async()=>{
      const component=modelComponentFixture();change(component);
      const f=fixture({component});
      await assert.rejects(f.read());
      assert.equal(f.requests.filter(item=>item.url.startsWith('https://api.github.com/')).length,0);
    });
  }
});

test('index fields and paths cannot redirect or mix another source, tree, plan, mode or producer',async t=>{
  const changes={
    source:value=>{value.sourceCommit='e'.repeat(40);},
    tree:value=>{value.sourceTree='e'.repeat(40);},
    plan:value=>{value.planSha256='e'.repeat(64);},
    mode:value=>{value.mode='production';},
    externalPath:value=>{value.receipt.path='https://attacker.example/receipt.json';},
    traversal:value=>{value.receipt.path='/receipts/../different.json';},
    unknownField:value=>{value.latest='https://attacker.example';},
    wrongBuild:value=>{value.producerBuildUuid='33333333-3333-4333-8333-333333333333';},
    invalidSize:value=>{value.receipt.bytes=policy.maximumReceiptBytes+1;},
  };
  for(const [name,change]of Object.entries(changes)){
    await t.test(name,async()=>{
      const seed=fixture(),index=copy(seed.index);change(index);
      const f=fixture({indexBytes:modelProviderCanonicalBytes(index)});
      await assert.rejects(f.read());assert.equal(f.requests.length,1);
    });
  }
});

test('byte identity rejects substituted, truncated and noncanonical receipts without re-resolving the pointer',async t=>{
  const seed=fixture();
  for(const [name,bytes]of [
    ['substitution',Buffer.from(seed.receipt.toString().replace('"status":"PASS"','"status":"FAIL"'))],
    ['truncated',seed.receipt.subarray(0,-1)],
    ['whitespace',Buffer.from(seed.receipt.toString()+' ')],
  ]){
    await t.test(name,async()=>{
      const f=fixture({receiptBytes:bytes});await assert.rejects(f.read(),/byte count|digest/);
      assert.equal(f.requests.length,2);
    });
  }
  const duplicate=Buffer.from(serializeModelComponentIndex(seed.index).toString().replace('"schemaVersion":1','"schemaVersion":1,"schemaVersion":1'));
  await assert.rejects(fixture({indexBytes:duplicate}).read(),/not canonical/);
  assert.throws(()=>createModelComponentIndex(seed.component,Buffer.from(JSON.stringify(seed.component,null,2)+'\n')),/canonical serializer/);
});

test('response boundaries enforce streaming size, media type, redirect and valid UTF-8 JSON',async t=>{
  const cases={
    streamedOverLimit:()=>jsonResponse(null,{bytes:Buffer.alloc(policy.maximumIndexBytes+1,32)}),
    declaredOverLimit:()=>jsonResponse({}, {headers:{'content-length':String(policy.maximumIndexBytes+1)}}),
    truncated:()=>jsonResponse({}, {headers:{'content-length':'30'}}),
    wrongType:()=>jsonResponse({}, {headers:{'content-type':'text/html'}}),
    redirect:()=>jsonResponse({}, {redirected:true}),
    invalidUtf8:()=>jsonResponse(null,{bytes:Buffer.from([0xff])}),
    invalidJson:()=>jsonResponse(null,{bytes:Buffer.from('{')}),
  };
  for(const [name,response]of Object.entries(cases)){
    await t.test(name,async()=>{
      const f=fixture({response});await assert.rejects(f.read());assert.equal(f.requests.length,1);
    });
  }
});

test('HTTP authorization, rate-limit and server failures remain failures without credential fallback',async t=>{
  for(const status of [401,403,404,429,500,503]){
    await t.test(String(status),async()=>{
      const f=fixture({response:({url,response})=>url.startsWith('https://api.github.com/')?jsonResponse({message:'unavailable'},{status}):response});
      await assert.rejects(f.read(),new RegExp('HTTP '+status));assert.equal(f.requests.length,3);
    });
  }
});

test('header rejection cancels the unread body instead of leaving a response streaming',async()=>{
  let cancelled=false;
  const f=fixture({response:()=>new Response(new ReadableStream({
    start(controller){controller.enqueue(Buffer.from('{'));},
    cancel(){cancelled=true;},
  }),{headers:{'content-type':'application/json','content-length':String(policy.maximumIndexBytes+1)}})});
  await assert.rejects(f.read(),/byte budget/);
  assert.equal(cancelled,true);
});

test('six-hour reuse is exact and neither component nor provider future clocks qualify',async t=>{
  const component=modelComponentFixture(),completed=Date.parse(component.completedAt);
  const boundary=completed+policy.maxAgeMs;
  const browser=browserComponentFixture({startedAt:at(boundary-1000)});
  await fixture({component,browser,now:boundary}).read();
  await assert.rejects(fixture({component,browser,now:boundary+1}).read(),/older than/);
  const seed=fixture();
  const future=modelComponentFixture({startedAt:at(seed.now())});
  await assert.rejects(fixture({component:future}).read(),/future/);
  const checks=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks;
  checks[1].started_at=at(seed.now()+1);checks[1].completed_at=checks[1].started_at;
  await assert.rejects(fixture({snapshots:[checks]}).read(),/future/);
  const rounded=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks;
  rounded[1].started_at='2026-11-07T00:00:22Z';rounded[1].completed_at=rounded[1].started_at;
  await fixture({snapshots:[rounded]}).read();
  rounded[1].started_at='2026-11-07T00:00:20Z';rounded[1].completed_at=rounded[1].started_at;
  await assert.rejects(fixture({snapshots:[rounded]}).read(),/predates/);
});

test('pagination cannot conceal a conflicting terminal or silently accept a changed/truncated inventory',async t=>{
  const seed=fixture(),checks=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks;
  const page=Array.from({length:100},(_,i)=>({...copy(checks[0]),id:100+i,external_id:'33333333-3333-4333-8333-333333333333'}));
  for(const [name,body]of Object.entries({
    changed:{total_count:102,check_runs:[checks[1]]},
    duplicate:{total_count:101,check_runs:[page[0]]},
    truncated:{total_count:101,check_runs:[]},
    excessive:{total_count:1001,check_runs:[]},
  })){
    await t.test(name,async()=>{
      const f=fixture({snapshots:[[...page,checks[1]]],response:({url,response})=>
        url.startsWith('https://api.github.com/')&&new URL(url).searchParams.get('page')==='2'?jsonResponse(body):response});
      await assert.rejects(f.read());
    });
  }
});

test('request budget bounds repeated paginated pending status',async()=>{
  const seed=fixture(),pending=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks[0];
  const records=Array.from({length:1000},(_,i)=>({...copy(pending),id:i+1,external_id:'33333333-3333-4333-8333-333333333333'}));
  const f=fixture({snapshots:[records]});
  await assert.rejects(f.read(),/request budget exhausted/);
  assert.equal(f.requests.filter(item=>item.url.startsWith('https://api.github.com/')).length,policy.maximumProviderRequests);
});

test('abort during the provider wait settles without another request or a success attestation',async()=>{
  const seed=fixture(),pending=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks[0];
  const f=fixture({snapshots:[[pending]]}),controller=new AbortController();
  await assert.rejects(f.read({signal:controller.signal,delay:async(ms,{signal})=>{
    assert.equal(ms,policy.pollIntervalMs);controller.abort(new Error('cancelled consumer'));signal.throwIfAborted();
  }}),/cancelled consumer/);
  assert.equal(f.requests.length,3);
  const already=new AbortController();already.abort(new Error('already stopped'));
  const other=fixture();await assert.rejects(other.read({signal:already.signal}),/already stopped/);assert.equal(other.requests.length,0);
});

test('aggregate revalidation rejects changed bytes, consumer identity and forged provider snapshots',async t=>{
  const f=fixture(),result=await f.read();
  const mutations={
    receiptHash:value=>{value.publication.receiptSha256='e'.repeat(64);},
    pointer:value=>{value.publication.index.producerBuildUuid='33333333-3333-4333-8333-333333333333';},
    consumer:value=>{value.consumer.buildUuid='33333333-3333-4333-8333-333333333333';},
    uncheckedDigest:value=>{value.authority.checks[1].conclusion='failure';},
    recomputedForgery:value=>{
      value.authority.checks[1].app.id++;
      value.authority.checksSha256=modelProviderSha256(modelProviderCanonicalBytes(value.authority.checks));
    },
    futureAcceptance:value=>{value.acceptedAt=at(f.now()+1);},
    nonceClaim:value=>{value.reuse='nonce-bound-dispatch';},
  };
  for(const [name,change]of Object.entries(mutations)){
    await t.test(name,()=>{
      const attestation=copy(result.attestation);change(attestation);
      assert.throws(()=>assertVerifiedModelAttestation(attestation,{component:result.component,...f.parameters,now:f.now()}));
    });
  }
  assert.throws(()=>assertModelComponentIndex({...f.index,unreviewed:true}),/unreviewed/);
});
