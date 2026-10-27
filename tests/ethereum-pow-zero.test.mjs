import test from 'node:test';
import assert from 'node:assert/strict';
import {POW_ZERO_POLICY as P,POW_ZERO_SOURCES,EMPTY_OMMERS,validateEthereumPowZeroBlock,collectEthereumPowZeroCore} from '../scripts/ethereum-pow-zero-core.mjs';
import {POW_ZERO_TRANSPORT as T,createPowZeroTransport,captureEthereumPowZero} from '../scripts/capture-ethereum-pow-zero.mjs';

// Deliberately synthetic chain and manifests. These unit fixtures are never
// evidence of mainnet, source-byte verification, historical availability or price.
const BASE=Date.parse('2022-09-15T07:00:00Z')/1000;
const START='2026-10-27T00:20:00.000Z',TTD=58750000000000000000000n;
const HEAD=P.transition+Math.floor((Date.parse('2026-10-27T00:10:00Z')/1000-BASE)/12);
const hex=n=>'0x'+BigInt(n).toString(16),hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const manifests=POW_ZERO_SOURCES.map(s=>({id:s.id,url:s.url,blobSha:s.blobSha,sourceSha256:'f'.repeat(64),bytes:1}));
function block(n){
  return {number:hex(n),timestamp:hex(BASE+(n-P.transition)*12),hash:hash(n),parentHash:hash(n-1),
    difficulty:hex(n<P.transition?2:0),nonce:n<P.transition?'0x0000000000000001':'0x0000000000000000',
    sha3Uncles:EMPTY_OMMERS,uncles:[],mixHash:'0x'+'7'.repeat(64),
    totalDifficulty:hex(n<P.terminal?TTD-1n:TTD+1n)};
}
function fixture({mutate,chain='0x1'}={}){
  const reads=[],counts=new Map();
  const read=async(method,params)=>{
    reads.push({method,params});
    if(method==='eth_chainId')return chain;
    const n=params[0]==='finalized'?HEAD:Number(BigInt(params[0]));
    const count=(counts.get(n)||0)+1;counts.set(n,count);
    const raw=block(n);return mutate?mutate(raw,{n,count,tag:params[0]}):raw;
  };
  return {reads,read,counts};
}
const input=f=>({read:f.read,observedThrough:'2026-10-26',captureStartedAt:START,clock:()=>START,sourceManifests:manifests});

test('synthetic post-Merge range yields only one partial zero, with no PIT or model activation',async()=>{
  const f=fixture(),r=await collectEthereumPowZeroCore(input(f));
  assert.deepEqual(r.partialMetrics,{executionPowIssuanceEth:{value:0,unit:'ETH/28 UTC days'}});
  assert.equal(r.windowStart,'2026-09-29');assert.equal(r.windowDays,28);
  assert.equal(r.publishedAt,null);assert.equal(r.definitionMatchedPartialMetricCount,1);
  assert.equal(r.pointInTimeEligibleMetricCount,0);assert.equal(r.eligibleModelSnapshotCount,0);
  assert.equal(r.fullModelSnapshotReady,false);assert.equal(r.historicalPointInTimeReady,false);
  assert.equal(r.modelInputActivated,false);assert.deepEqual(r.modelSnapshots,[]);
  assert.equal(r.independentConsensusValidation,false);assert.equal(r.completeHeaderChainVerified,false);
  assert.equal(r.providerCount,1);assert.match(r.zeroBasis,/not total ETH issuance/);
  assert.equal(r.queryCount,f.reads.length);assert.ok(r.queryCount<=61);assert.ok(r.searchCacheMisses<=51);
  assert.equal(r.recheckedBlockNumbers.length,5);
  for(const n of r.recheckedBlockNumbers)assert.equal(f.counts.get(n),2);
  assert.equal(r.transitionEvidence.ttdThresholdComparison,'observed-and-consistent');
  const start=Date.parse(r.windowStart)/1000,end=Date.parse('2026-10-27')/1000;
  assert.ok(r.boundaryEvidence.startPrevious.timestampSeconds<start);
  assert.ok(r.canonicalBlockRange.first.timestampSeconds>=start);
  assert.ok(r.canonicalBlockRange.last.timestampSeconds<end);
  assert.ok(r.boundaryEvidence.endNext.timestampSeconds>=end);
});
test('missing totalDifficulty is recorded as unavailable, never as passed arithmetic',async()=>{
  const f=fixture({mutate:b=>{delete b.totalDifficulty;return b;}});
  const r=await collectEthereumPowZeroCore(input(f));
  assert.equal(r.transitionEvidence.ttdThresholdComparison,'unavailable-rpc-fields');
  assert.equal(r.transitionEvidence.terminal.totalDifficulty,null);
});
test('non-zero RANDAO mixHash is valid under EIP-4399',()=>{
  assert.equal(validateEthereumPowZeroBlock(block(P.transition),P.transition).difficulty,0n);
});
test('post-Merge header form, block identity and RPC quantities fail closed',()=>{
  const cases=[
    {difficulty:'0x1'},{nonce:'0x0000000000000001'},{sha3Uncles:hash(9)},{uncles:[hash(10)]},
    {number:'0x00'},{timestamp:'0x0'},{hash:'0x'+'0'.repeat(64)},{parentHash:'0x12'},
    {timestamp:hex(BigInt(Number.MAX_SAFE_INTEGER)+1n)},{nonce:'0x0'},{number:hex(P.maximumHeadExclusive)}
  ];
  for(const change of cases)assert.throws(()=>validateEthereumPowZeroBlock({...block(P.transition),...change},P.transition));
  assert.throws(()=>validateEthereumPowZeroBlock(block(P.transition+1),P.transition),/another block/);
  assert.throws(()=>validateEthereumPowZeroBlock({...block(P.terminal),difficulty:'0x0'}),/PoW/);
  assert.throws(()=>validateEthereumPowZeroBlock(null),/Missing RPC/);
});
test('wrong chain and missing block abort before any observation',async()=>{
  await assert.rejects(collectEthereumPowZeroCore(input(fixture({chain:'0x89'}))),/mainnet/);
  await assert.rejects(collectEthereumPowZeroCore(input(fixture({mutate:()=>null}))),/Missing RPC/);
});
test('source identities and duplicate manifests must match before RPC reads',async()=>{
  const f=fixture(),bad=manifests.map(x=>({...x}));bad[0].blobSha='a'.repeat(40);
  await assert.rejects(collectEthereumPowZeroCore({...input(f),sourceManifests:bad}),/manifest/);
  await assert.rejects(collectEthereumPowZeroCore({...input(f),sourceManifests:[...manifests,manifests[0]]}),/Duplicate/);
  assert.equal(f.reads.length,0);
});
test('incomplete, stale, invalid and partly pre-Merge UTC windows are rejected',async()=>{
  for(const change of [
    {observedThrough:'2026-10-27'},{observedThrough:'2026-10-01'},
    {observedThrough:'2026-02-30'},{captureStartedAt:'2026-10-27T00:20:00+00:00'},
    {captureStartedAt:'2026-02-30T00:20:00Z'},
    {observedThrough:'2022-09-19',captureStartedAt:'2022-09-20T00:20:00Z'}
  ])await assert.rejects(collectEthereumPowZeroCore({...input(fixture()),...change}));
});
test('future finalized anchor and incomplete finality coverage cannot define zero',async()=>{
  for(const timestamp of [Date.parse(START)/1000+1,Date.parse('2026-10-26T23:59:59Z')/1000]){
    const f=fixture({mutate:(b,{tag})=>tag==='finalized'?{...b,timestamp:hex(timestamp)}:b});
    await assert.rejects(collectEthereumPowZeroCore(input(f)),/temporal coverage/);
  }
});
test('TTD crossing, terminal arithmetic and transition linkage are independently checked',async()=>{
  const cases=[
    (b,n)=>n===P.terminal-1?{...b,totalDifficulty:hex(TTD)}:b,
    (b,n)=>n===P.terminal?{...b,totalDifficulty:hex(TTD-1n)}:b,
    (b,n)=>n===P.terminal?{...b,totalDifficulty:hex(TTD+10n)}:b,
    (b,n)=>n===P.transition?{...b,totalDifficulty:hex(TTD+2n)}:b,
    (b,n)=>n===P.transition?{...b,parentHash:hash(99)}:b
  ];
  for(const change of cases)await assert.rejects(collectEthereumPowZeroCore(input(fixture({mutate:(b,{n})=>change(b,n)}))));
});
test('changed canonical identity on fresh boundary read prevents observation',async()=>{
  const f=fixture({mutate:(b,{count})=>count>1?{...b,hash:hash(99)}:b});
  await assert.rejects(collectEthereumPowZeroCore(input(f)),/identity changed/);
});
test('adjacent UTC boundary parent links are verified',async()=>{
  const start=Date.parse('2026-09-29T00:00:00Z')/1000;
  const n=P.transition+Math.ceil((start-BASE)/12);
  const f=fixture({mutate:(b,q)=>q.n===n?{...b,parentHash:hash(99)}:b});
  await assert.rejects(collectEthereumPowZeroCore(input(f)),/Adjacent/);
});
test('non-monotonic sampled timestamps and reversed collection clock fail closed',async()=>{
  const f=fixture({mutate:(b,{n})=>n>P.transition&&n<HEAD?{...b,timestamp:hex(BASE-1)}:b});
  await assert.rejects(collectEthereumPowZeroCore(input(f)),/monotonic/);
  await assert.rejects(collectEthereumPowZeroCore({...input(fixture()),clock:()=> '2026-10-27T00:19:59Z'}),/backwards/);
});
function harness({respond,limits={}}={}){
  let time=Date.parse(START);const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options,at:time});
    return respond?respond({url,options,calls,advance:ms=>{time+=ms;}}):
      new Response(JSON.stringify({jsonrpc:'2.0',id:JSON.parse(options.body).id,result:'0x1'}),{headers:{'content-type':'application/json'}});
  };
  const t=createPowZeroTransport({fetchImpl,nowMs:()=>time,sleep:async ms=>{time+=ms;},limits:{...T,...limits}});
  return {t,calls,advance:ms=>{time+=ms;}};
}
test('transport uses only fixed endpoint and read-only methods; rate limit and raw receipt are real',async()=>{
  const h=harness();
  assert.equal(await h.t.read('eth_chainId',[]),'0x1');
  assert.equal(await h.t.read('eth_chainId',[]),'0x1');
  assert.equal(h.calls[1].at-h.calls[0].at,500);
  for(const c of h.calls){assert.equal(c.url,P.endpoint);assert.equal(c.options.redirect,'error');assert.equal(c.options.credentials,'omit');}
  assert.equal(h.t.requests.length,2);assert.equal(h.t.rawFiles.length,2);
  assert.equal(h.t.requests[0].rpcValidated,true);assert.equal(h.t.requests[0].publishedAt,null);
  assert.equal(h.t.requests[0].bytes,h.t.rawFiles[0].bytes.length);
  assert.match(h.t.requests[0].sha256,/^[a-f0-9]{64}$/);
});
test('write RPC, arbitrary block tags, full transactions and non-canonical quantities never reach network',async()=>{
  const h=harness();
  for(const [method,params]of [
    ['eth_sendRawTransaction',['0x00']],['eth_getBlockByNumber',['latest',false]],
    ['eth_getBlockByNumber',['0x1',true]],['eth_getBlockByNumber',['0x01',false]],
    ['eth_getBlockByNumber',[hex(P.maximumHeadExclusive),false]],['eth_chainId',['0x1']]
  ])await assert.rejects(h.t.read(method,params),/allowlist/);
  assert.equal(h.calls.length,0);assert.equal(h.t.stats().rpcRequests,0);
});
test('RPC ID, error, null result, JSON and UTF-8 failures retain raw response without accepting observation',async()=>{
  const bodies=[
    '{"jsonrpc":"2.0","id":2,"result":"0x1"}',
    '{"jsonrpc":"2.0","id":1,"result":"0x1","error":{"code":-1}}',
    '{"jsonrpc":"2.0","id":1,"result":null}','not json',new Uint8Array([0xff])
  ];
  for(const body of bodies){
    const h=harness({respond:()=>new Response(body)});
    await assert.rejects(h.t.read('eth_chainId',[]));
    assert.equal(h.t.rawFiles.length,1);assert.equal(h.t.requests[0].complete,true);
    assert.ok(h.t.requests[0].validationError);assert.notEqual(h.t.requests[0].rpcValidated,true);
  }
});
test('HTTP failure body is preserved once without retries',async()=>{
  const h=harness({respond:()=>new Response('rate limited',{status:429})});
  await assert.rejects(h.t.read('eth_chainId',[]),/HTTP 429/);
  assert.equal(h.calls.length,1);assert.equal(h.t.requests[0].httpStatus,429);
  assert.equal(h.t.rawFiles[0].bytes.toString(),'rate limited');
});
test('RPC request and rate-delay deadline budgets prevent further fetches',async()=>{
  const h=harness({limits:{maximumRpcRequests:1}});
  await h.t.read('eth_chainId',[]);await assert.rejects(h.t.read('eth_chainId',[]),/budget/);assert.equal(h.calls.length,1);
  const d=harness({limits:{totalTimeoutMs:499}});
  await d.t.read('eth_chainId',[]);await assert.rejects(d.t.read('eth_chainId',[]),/deadline/);assert.equal(d.calls.length,1);
});
test('a rate-limit sleep that overruns the deadline does not launch a new request',async()=>{
  let now=0,fetches=0;
  const t=createPowZeroTransport({nowMs:()=>now,sleep:async()=>{now+=1000;},limits:{...T,totalTimeoutMs:900},
    fetchImpl:async()=>{fetches++;return new Response('{"jsonrpc":"2.0","id":1,"result":"0x1"}');}});
  await t.read('eth_chainId',[]);await assert.rejects(t.read('eth_chainId',[]),/after rate limit/);assert.equal(fetches,1);
});
test('declared, streamed and total byte limits retain incomplete status and no invented raw bytes',async()=>{
  for(const options of [
    {limits:{maximumResponseBytes:5},respond:()=>new Response('abcdef',{headers:{'content-length':'6'}})},
    {limits:{maximumResponseBytes:5},respond:()=>new Response('abcdef')},
    {limits:{maximumTotalBytes:5},respond:()=>new Response('abcdef')}
  ]){
    const h=harness(options);await assert.rejects(h.t.read('eth_chainId',[]),/byte limit/);
    assert.equal(h.t.requests[0].complete,false);assert.equal(h.t.rawFiles.length,0);
  }
});
test('per-request timeout aborts fetch and preserves failure receipt',async()=>{
  const t=createPowZeroTransport({limits:{...T,requestTimeoutMs:10},fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new Error('request aborted')),{once:true});
  })});
  await assert.rejects(t.read('eth_chainId',[]),/aborted/);
  assert.equal(t.requests.length,1);assert.equal(t.requests[0].complete,false);assert.match(t.requests[0].error,/aborted/);
});
test('immutable source bytes must match Git blob identity; failed bytes remain inspectable',async()=>{
  const h=harness({respond:()=>new Response('not the pinned EIP')});
  await assert.rejects(h.t.source(POW_ZERO_SOURCES[0]),/Git blob mismatch/);
  assert.equal(h.t.rawFiles.length,1);assert.equal(h.t.requests[0].complete,true);
  assert.notEqual(h.t.requests[0].sourceBytesVerified,true);assert.equal(h.t.stats().rpcRequests,0);
  await assert.rejects(h.t.source({...POW_ZERO_SOURCES[0],rawUrl:'https://example.org'}),/immutable/);
  assert.equal(h.calls.length,1);
});
test('capture failure cannot manufacture zero, publication time, snapshot or model activation',async()=>{
  const {receipt,rawFiles}=await captureEthereumPowZero({nowMs:()=>Date.parse(START),fetchImpl:async()=>new Response('not source'),sourceCommit:'synthetic-test-only'});
  assert.equal(receipt.status,'capture-failed');assert.equal(receipt.observation,null);
  assert.equal(receipt.definitionMatchedPartialMetricCount,0);assert.equal(receipt.pointInTimeEligibleMetricCount,0);
  assert.equal(receipt.publishedAt,null);assert.equal(receipt.eligibleModelSnapshotCount,0);
  assert.equal(receipt.fullModelSnapshotReady,false);assert.equal(receipt.modelInputActivated,false);
  assert.equal(receipt.requests.length,1);assert.equal(rawFiles.length,1);
  assert.match(receipt.rawManifestSha256,/^[a-f0-9]{64}$/);
});
