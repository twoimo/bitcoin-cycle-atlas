import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {gzipSync,brotliCompressSync} from 'node:zlib';
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

test('identity lengths stay exact and malformed lengths are rejected for encoded bodies too',async t=>{
  for(const encoding of [undefined,'identity']){
    await t.test(encoding??'absent encoding',async()=>{
      const response=async({response})=>{
        const bytes=Buffer.from(await response.arrayBuffer());
        return jsonResponse(null,{bytes,headers:{'content-length':String(bytes.length),
          ...(encoding?{'content-encoding':encoding}:{})}});
      };
      const f=fixture({response});await f.read();assert.equal(f.requests.length,3);
      for(const delta of [-1,1]){
        const broken=fixture({response:async input=>{
          const result=await response(input);
          result.headers.set('content-length',String(Number(result.headers.get('content-length'))+delta));
          return result;
        }});
        await assert.rejects(broken.read(),/was truncated/);assert.equal(broken.requests.length,1);
      }
    });
  }
  for(const encoding of ['identity','gzip']){
    for(const length of ['-1','1.5','1, 1','NaN']){
      const f=fixture({response:()=>jsonResponse({},{
        headers:{'content-encoding':encoding,'content-length':length}})});
      await assert.rejects(f.read(),/invalid Content-Length/);assert.equal(f.requests.length,1);
    }
  }
});

test('decoded gzip and brotli bodies retain exact index, receipt and provider evidence',async t=>{
  for(const [encoding,compress]of [['gzip',gzipSync],['br',brotliCompressSync]]){
    await t.test(encoding,async()=>{
      let decodedResponses=0;
      const f=fixture({response:async({response})=>{
        const bytes=Buffer.from(await response.arrayBuffer()),encoded=compress(bytes);
        assert.notEqual(encoded.length,bytes.length);decodedResponses++;
        return jsonResponse(null,{bytes,headers:{'content-encoding':encoding,'content-length':String(encoded.length)}});
      }});
      const result=await f.read();assert.equal(decodedResponses,3);
      assert.deepEqual(result.component,f.component);
      assert.equal(result.attestation.publication.indexSha256,modelProviderSha256(serializeModelComponentIndex(f.index)));
      assert.equal(result.attestation.publication.receiptBytes,f.receipt.length);
      assert.equal(result.attestation.publication.receiptSha256,modelProviderSha256(f.receipt));
      assert.deepEqual(result.attestation.authority.checks,
        modelAttestationFixture({model:f.component,browser:f.browser}).authority.checks);
    });
  }
});

test('native Fetch decodes real gzip bytes without discarding integrity failures',{timeout:20000},async t=>{
  const payloads=new Map(),observations=[];
  const server=createServer((request,response)=>{
    const body=payloads.get(request.url);
    if(!body){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':'application/json','content-encoding':'gzip',
      'content-length':String(body.length),'connection':'close'});
    response.end(body);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());server.closeAllConnections();
  }));
  const origin='http://127.0.0.1:'+server.address().port;
  const route=corruptReceipt=>async({url,request,response})=>{
    const bytes=Buffer.from(await response.arrayBuffer()),encoded=gzipSync(bytes);
    assert.notEqual(encoded.length,bytes.length);
    if(corruptReceipt&&url.includes('/receipts/'))encoded[encoded.length-8]^=1;
    const path='/evidence/'+(payloads.size+1);payloads.set(path,encoded);
    const actual=await fetch(origin+path,request);
    assert.equal(actual.status,200);assert.equal(actual.headers.get('content-encoding'),'gzip');
    assert.equal(actual.headers.get('content-length'),String(encoded.length));
    observations.push({encoded:encoded.length,decoded:bytes.length});
    // The test transport routes approved fixture URLs through loopback; the body
    // remains the actual Fetch-decoded stream with its original response headers.
    return new Response(actual.body,{status:actual.status,headers:actual.headers});
  };
  const f=fixture({response:route(false)}),result=await f.read();
  assert.equal(observations.length,3);
  assert.ok(observations.every(item=>item.encoded!==item.decoded));
  assert.deepEqual(result.component,f.component);
  assert.equal(result.attestation.publication.receiptSha256,modelProviderSha256(f.receipt));
  const corrupt=fixture({response:route(true)});
  await assert.rejects(corrupt.read(),error=>{assert.equal(error.cause?.code,'Z_DATA_ERROR');return true;});
  assert.equal(corrupt.requests.length,2);
});

test('compressed responses cannot bypass decoded limits, receipt hashes or stream errors',async t=>{
  await t.test('decoded byte budget',async()=>{
    const bytes=Buffer.alloc(policy.maximumIndexBytes+1,32);
    const f=fixture({response:()=>jsonResponse(null,{bytes,
      headers:{'content-encoding':'gzip','content-length':String(gzipSync(bytes).length)}})});
    await assert.rejects(f.read(),/byte budget/);assert.equal(f.requests.length,1);
  });
  await t.test('decoded receipt digest',async()=>{
    const f=fixture({response:async({url,response})=>{
      if(!url.includes('/receipts/'))return response;
      const bytes=Buffer.from((await response.text()).replace('"status":"PASS"','"status":"FAIL"'));
      return jsonResponse(null,{bytes,headers:{'content-encoding':'gzip','content-length':String(gzipSync(bytes).length)}});
    }});
    await assert.rejects(f.read(),/receipt digest differs/);assert.equal(f.requests.length,2);
  });
  await t.test('decoded stream failure',async()=>{
    const failure=new Error('decoded stream stopped');
    const f=fixture({response:()=>new Response(new ReadableStream({
      start(controller){controller.enqueue(Buffer.from('{"'));},
      pull(controller){controller.error(failure);},
    }),{headers:{'content-type':'application/json','content-encoding':'gzip','content-length':'20'}})});
    await assert.rejects(f.read(),error=>error===failure);assert.equal(f.requests.length,1);
  });
});

test('cumulative provider budget counts decoded rather than compressed response bytes',async()=>{
  const seed=fixture(),pending=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks[0];
  const records=[pending,...Array.from({length:100},(_,i)=>({...copy(pending),id:100+i,
    external_id:'33333333-3333-4333-8333-333333333333'}))];
  const f=fixture({snapshots:[records],response:async({url,response})=>{
    if(!url.startsWith('https://api.github.com/'))return response;
    const body=await response.json();body.padding='';
    const overhead=Buffer.byteLength(JSON.stringify(body));
    body.padding='x'.repeat(policy.maximumProviderResponseBytes-overhead);
    const bytes=Buffer.from(JSON.stringify(body));assert.equal(bytes.length,policy.maximumProviderResponseBytes);
    return jsonResponse(null,{bytes,headers:{'content-encoding':'gzip','content-length':String(gzipSync(bytes).length)}});
  }});
  await assert.rejects(f.read(),/Public provider byte budget exhausted/);
  assert.equal(f.requests.filter(item=>item.url.startsWith('https://api.github.com/')).length,
    Math.floor(policy.maximumProviderBytes/policy.maximumProviderResponseBytes)+1);
});

test('HTTP authorization, rate-limit and other server failures remain immediate failures without credential fallback',async t=>{
  for(const status of [401,403,404,429,500,501,505]){
    await t.test(String(status),async()=>{
      const f=fixture({response:({url,response})=>url.startsWith('https://api.github.com/')?jsonResponse({message:'unavailable'},{status}):response});
      await assert.rejects(f.read(),new RegExp('HTTP '+status));assert.equal(f.requests.length,3);
    });
  }
});

test('only provider 502, 503 and 504 may consume an existing poll before exact success',async t=>{
  for(const status of [502,503,504]){
    await t.test(String(status),async()=>{
      let cancelled=0;
      const f=fixture({response:({url,response,poll})=>{
        if(!url.startsWith('https://api.github.com/')||poll!==0)return response;
        return new Response(new ReadableStream({
          start(controller){controller.enqueue(Buffer.from('untrusted error body'));},
          cancel(){cancelled++;},
        }),{status,headers:{'content-type':'text/plain'}});
      }});
      const result=await f.read(),requests=f.requests.filter(item=>item.url.startsWith('https://api.github.com/'));
      assert.equal(requests.length,2);assert.equal(new Set(requests.map(item=>item.url)).size,1);
      assert.equal(f.requests.filter(item=>item.url.includes('/sources/')).length,1);
      assert.equal(f.requests.filter(item=>item.url.includes('/receipts/')).length,1);
      assert.deepEqual(f.delays,[policy.pollIntervalMs]);assert.equal(cancelled,1);
      assert.deepEqual(result.attestation.authority.terminalCheckIds,[2]);
      assertVerifiedModelAttestation(result.attestation,{component:result.component,...f.parameters,now:f.now()});
    });
  }
});

test('transient provider failures exhaust the original six polls without accepting any error response',async t=>{
  for(const status of [502,503,504]){
    await t.test(String(status),async()=>{
      const f=fixture({response:({url,response})=>url.startsWith('https://api.github.com/')?jsonResponse({},{status}):response});
      await assert.rejects(f.read(),new RegExp('HTTP '+status));
      assert.equal(f.requests.length,2+policy.maximumPollAttempts);
      assert.deepEqual(f.delays,Array(policy.maximumPollAttempts-1).fill(policy.pollIntervalMs));
    });
  }
});

test('pending snapshots and transient responses share the same poll budget',async()=>{
  const seed=fixture(),pending=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks[0];
  const f=fixture({snapshots:[[pending]],response:({url,response,poll})=>
    url.startsWith('https://api.github.com/')&&poll%2===1?jsonResponse({},{status:504}):response});
  await assert.rejects(f.read(),/HTTP 504/);
  assert.equal(f.requests.length,2+policy.maximumPollAttempts);
  assert.deepEqual(f.delays,Array(policy.maximumPollAttempts-1).fill(policy.pollIntervalMs));
});

test('a failed later page discards an earlier green row and restarts the complete snapshot at page one',async()=>{
  const seed=fixture(),checks=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks;
  const unrelated=Array.from({length:99},(_,i)=>({...copy(checks[0]),id:100+i,
    external_id:'33333333-3333-4333-8333-333333333333'}));
  const fresh=[checks[0],{...copy(checks[1]),id:3,url:'https://api.github.com/repos/'+policy.repository+'/check-runs/3'}];
  const f=fixture({snapshots:[[...unrelated,checks[1],checks[0]],fresh],response:({url,response,poll})=>
    url.startsWith('https://api.github.com/')&&poll===0&&new URL(url).searchParams.get('page')==='2'?
      jsonResponse({},{status:503}):response});
  const result=await f.read();
  assert.deepEqual(f.requests.filter(item=>item.url.startsWith('https://api.github.com/'))
    .map(item=>Number(new URL(item.url).searchParams.get('page'))),[1,2,1]);
  assert.deepEqual(result.attestation.authority.checks,fresh);
  assert.deepEqual(result.attestation.authority.terminalCheckIds,[3]);
  assert.deepEqual(f.delays,[policy.pollIntervalMs]);
});

test('a transient response cannot relax the next snapshot authority or JSON checks',async t=>{
  const mutations={
    app:checks=>{checks[1].app.id++;},
    source:checks=>{checks[1].head_sha='f'.repeat(40);},
    terminalFailure:checks=>{checks[1].conclusion='failure';},
    conflictingFailure:checks=>{checks.push({...copy(checks[1]),id:3,
      url:'https://api.github.com/repos/'+policy.repository+'/check-runs/3',conclusion:'failure'});},
    invalidJson:null,
  };
  for(const [name,change]of Object.entries(mutations)){
    await t.test(name,async()=>{
      const seed=fixture(),checks=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks;
      change?.(checks);
      const f=fixture({snapshots:[checks],response:({url,response,poll})=>{
        if(!url.startsWith('https://api.github.com/'))return response;
        if(poll===0)return jsonResponse({},{status:502});
        return name==='invalidJson'?jsonResponse(null,{bytes:Buffer.from('{')}):response;
      }});
      await assert.rejects(f.read());assert.equal(f.requests.length,4);
      assert.deepEqual(f.delays,[policy.pollIntervalMs]);
    });
  }
  await t.test('another producer remains unqualified after a transient response',async()=>{
    const seed=fixture(),checks=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks;
    for(const check of checks)check.external_id='33333333-3333-4333-8333-333333333333';
    const f=fixture({snapshots:[checks],response:({url,response,poll})=>
      url.startsWith('https://api.github.com/')&&poll===0?jsonResponse({},{status:503}):response});
    await assert.rejects(f.read(),/no observed terminal provider success/);
    assert.equal(f.requests.length,2+policy.maximumPollAttempts);
  });
});

test('index and receipt 502, 503 and 504 are never retried or re-resolved',async t=>{
  for(const path of ['/sources/','/receipts/'])for(const status of [502,503,504]){
    await t.test(path+status,async()=>{
      const f=fixture({response:({url,response})=>url.includes(path)?jsonResponse({},{status}):response});
      await assert.rejects(f.read(),new RegExp('HTTP '+status));
      assert.equal(f.requests.length,path==='/sources/'?1:2);assert.deepEqual(f.delays,[]);
    });
  }
});

test('transport errors and errors from another consumer cannot masquerade as retryable responses',async t=>{
  for(const failure of [new TypeError('Public provider check runs HTTP 503'),
    new DOMException('request expired','TimeoutError'),Object.assign(new Error('unavailable'),{status:504,code:'HTTP_504'})]){
    await t.test(failure.name+': '+failure.message,async()=>{
      const f=fixture({response:({url,response})=>{if(url.startsWith('https://api.github.com/'))throw failure;return response;}});
      await assert.rejects(f.read(),error=>error===failure);assert.equal(f.requests.length,3);assert.deepEqual(f.delays,[]);
    });
  }
  await t.test('a previously observed error is private to its consumer invocation',async()=>{
    let previous;
    const first=fixture({response:({url,response})=>url.startsWith('https://api.github.com/')?jsonResponse({},{status:503}):response});
    await assert.rejects(first.read(),error=>{previous=error;return /HTTP 503/.test(error.message);});
    const next=fixture({response:({url,response})=>{if(url.startsWith('https://api.github.com/'))throw previous;return response;}});
    await assert.rejects(next.read(),error=>error===previous);assert.equal(next.requests.length,3);assert.deepEqual(next.delays,[]);
  });
});

test('redirected or substituted provider URLs never become transient failures',async t=>{
  for(const kind of ['redirected','wrong URL']){
    await t.test(kind,async()=>{
      const f=fixture({response:({url,response})=>{
        if(!url.startsWith('https://api.github.com/'))return response;
        const failed=jsonResponse({},{status:503,redirected:kind==='redirected'});
        if(kind==='wrong URL')Object.defineProperty(failed,'url',{value:'https://api.github.com/other'});
        return failed;
      }});
      await assert.rejects(f.read(),kind==='redirected'?/redirected away/:/response URL differs/);
      assert.equal(f.requests.length,3);assert.deepEqual(f.delays,[]);
    });
  }
});

test('abort during a transient response, its cleanup or its wait prevents another request',async t=>{
  for(const phase of ['response','cleanup','wait']){
    await t.test(phase,async()=>{
      const controller=new AbortController(),failure=new Error('consumer stopped during '+phase);
      const f=fixture({response:({url,response})=>{
        if(!url.startsWith('https://api.github.com/'))return response;
        if(phase==='response')controller.abort(failure);
        return new Response(new ReadableStream({cancel(){if(phase==='cleanup')controller.abort(failure);}}),{status:504});
      }});
      await assert.rejects(f.read({signal:controller.signal,delay:async(ms,{signal})=>{
        assert.equal(phase,'wait');assert.equal(ms,policy.pollIntervalMs);
        controller.abort(failure);signal.throwIfAborted();
      }}),error=>error===failure);
      assert.equal(f.requests.length,3);
    });
  }
  await t.test('the existing request timeout takes precedence over a late 503',async t=>{
    const timeouts=[],failure=new DOMException('request expired','TimeoutError');
    t.mock.method(AbortSignal,'timeout',ms=>{
      assert.equal(ms,policy.requestTimeoutMs);const controller=new AbortController();timeouts.push(controller);return controller.signal;
    });
    const f=fixture({response:({url,response})=>{
      if(!url.startsWith('https://api.github.com/'))return response;
      timeouts.at(-1).abort(failure);return jsonResponse({},{status:503});
    }});
    await assert.rejects(f.read(),error=>error===failure);assert.equal(f.requests.length,3);assert.deepEqual(f.delays,[]);
  });
});

test('partial snapshots still consume the original provider request budget',async()=>{
  const seed=fixture(),pending=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks[0];
  const records=Array.from({length:1000},(_,i)=>({...copy(pending),id:i+1,external_id:'33333333-3333-4333-8333-333333333333'}));
  const f=fixture({snapshots:[records],response:({url,response})=>
    url.startsWith('https://api.github.com/')&&new URL(url).searchParams.get('page')==='10'?jsonResponse({},{status:503}):response});
  await assert.rejects(f.read(),/Public provider request budget exhausted/);
  assert.equal(f.requests.length,2+policy.maximumProviderRequests);
  assert.deepEqual(f.delays,[policy.pollIntervalMs,policy.pollIntervalMs]);
});

test('decoded bytes from partial snapshots still consume the original cumulative byte budget',async()=>{
  const seed=fixture(),pending=modelAttestationFixture({model:seed.component,browser:seed.browser}).authority.checks[0];
  const records=Array.from({length:201},(_,i)=>({...copy(pending),id:i+1,external_id:'33333333-3333-4333-8333-333333333333'}));
  const f=fixture({snapshots:[records],response:async({url,response})=>{
    if(!url.startsWith('https://api.github.com/'))return response;
    if(new URL(url).searchParams.get('page')==='3')return jsonResponse({},{status:504});
    const body=await response.json();body.padding='';
    body.padding='x'.repeat(policy.maximumProviderResponseBytes-Buffer.byteLength(JSON.stringify(body)));
    const bytes=Buffer.from(JSON.stringify(body));assert.equal(bytes.length,policy.maximumProviderResponseBytes);
    return jsonResponse(null,{bytes,headers:{'content-encoding':'gzip','content-length':String(gzipSync(bytes).length)}});
  }});
  await assert.rejects(f.read(),/Public provider byte budget exhausted/);
  assert.equal(f.requests.filter(item=>item.url.startsWith('https://api.github.com/')).length,13);
  assert.deepEqual(f.delays,Array(4).fill(policy.pollIntervalMs));
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
