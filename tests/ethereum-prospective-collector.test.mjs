import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {captureEthereumResearchTail} from '../scripts/ethereum-prospective-collector-core.mjs';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
async function setup(){
  const f=await prospectiveFixture();let calls=0;
  const clock=()=>calls++===0?f.tail.requestStartedAt:f.tail.bodyCompletedAt;
  return {f,options:{baseText:f.base.text,clock}};
}
test('one exact public GET keeps original bytes and EOF collection time',async()=>{
  const {f,options}=await setup();let count=0,request;
  const result=await captureEthereumResearchTail({...options,fetchImpl:async(url,init)=>{
    count++;request={url,init};return new Response(f.tail.text,{status:200});
  }});
  assert.equal(result.status,'success');assert.equal(count,1);assert.equal(request.url,f.tail.sourceUrl);
  assert.equal(request.init.method,'GET');assert.equal(request.init.redirect,'error');assert.equal(request.init.credentials,'omit');
  assert.equal(result.rawText,f.tail.text);assert.equal(result.rawSha256,digest(f.tail.text));
  assert.equal(result.bodyCompletedAt,f.tail.bodyCompletedAt);assert.equal(result.requests,1);assert.equal(result.retries,0);
});
test('HTTP 429 has one attempt, complete original response and no successful capture',async()=>{
  const {options}=await setup();let count=0;
  const result=await captureEthereumResearchTail({...options,fetchImpl:async()=>{count++;return new Response('rate limit',{status:429});}});
  assert.equal(count,1);assert.equal(result.status,'failed');assert.equal(result.httpStatus,429);
  assert.equal(result.completeBody,true);assert.equal(result.rawText,'rate limit');assert.equal(result.rawSha256,digest('rate limit'));
});
test('timeout remains active after headers through body EOF and aborts the actual signal',async()=>{
  const {options}=await setup();let signal,cancelled=false;
  const result=await captureEthereumResearchTail({...options,timeoutMs:10,fetchImpl:async(url,init)=>{
    signal=init.signal;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('['));},cancel(){cancelled=true;}}));
  }});
  assert.equal(result.status,'failed');assert.match(result.error.message,/timed out/);
  assert.equal(signal.aborted,true);assert.equal(cancelled,true);assert.equal(result.receivedBytes,1);
  assert.equal(result.completeBody,false);assert.equal(result.rawSha256,null);assert.equal(result.rawText,null);
});
test('declared and streamed body overflow abort with no fabricated complete-body hash',async()=>{
  for(const declared of [true,false]){
    const {options}=await setup();let signal;
    const result=await captureEthereumResearchTail({...options,maximumBodyBytes:4,fetchImpl:async(url,init)=>{
      signal=init.signal;return new Response('12345',{headers:declared?{'content-length':'5'}:{}});
    }});
    assert.equal(result.status,'failed');assert.equal(signal.aborted,true);assert.equal(result.completeBody,false);assert.equal(result.rawSha256,null);
    assert.match(result.error.message,/byte bound/);
  }
});
test('invalid JSON, invalid UTF-8 and a missing completed day preserve failure source bytes',async()=>{
  const {f}=await setup();
  for(const raw of [Buffer.from('{oops'),Buffer.from([0xff,0xfe]),Buffer.from(JSON.stringify(JSON.parse(f.tail.text).slice(1)))]){
    const {options}=await setup();
    const result=await captureEthereumResearchTail({...options,fetchImpl:async()=>new Response(raw)});
    assert.equal(result.status,'failed');assert.equal(result.completeBody,true);
    assert.equal(result.rawSha256,digest(raw));assert.equal(result.rawBase64,raw.toString('base64'));
  }
});
test('timeout before response headers never fabricates a provider status or raw data',async()=>{
  const {options}=await setup();let signal;
  const result=await captureEthereumResearchTail({...options,timeoutMs:10,fetchImpl:async(url,init)=>{
    signal=init.signal;return await new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
  }});
  assert.equal(result.status,'failed');assert.equal(result.httpStatus,null);assert.equal(signal.aborted,true);
  assert.equal(result.rawSha256,null);assert.equal(result.receivedBytes,0);
});

test('UTF-8 BOM cannot silently change the exact raw source bytes during decode',async()=>{
  const {f,options}=await setup(),raw=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(f.tail.text)]);
  const result=await captureEthereumResearchTail({...options,fetchImpl:async()=>new Response(raw)});
  assert.equal(result.status,'failed');assert.match(result.error.message,/lossless UTF-8/);
  assert.equal(result.completeBody,true);assert.equal(result.rawText,null);
  assert.equal(result.rawSha256,digest(raw));assert.equal(result.rawBase64,raw.toString('base64'));
});
