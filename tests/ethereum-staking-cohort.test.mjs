import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ETH_STAKING_COHORT_POLICY as POLICY,stakingCohortUrl,beaconHeaderMessageRoot,gweiToExactEth,inspectEthereumStakingCohort,replayEthereumStakingCohortCapture} from '../scripts/ethereum-staking-cohort-core.mjs';
import {ETH_STAKING_COHORT_TRANSPORT as TRANSPORT,captureEthereumStakingCohort} from '../scripts/capture-ethereum-staking-cohort.mjs';

const FAR='18446744073709551615',STAMP='2026-10-27T16:35:00.000Z';
const h=n=>'0x'+String(n).padStart(64,'0');
function fixture(){
  const message={slot:'15524480',proposer_index:'1840702',parent_root:h(1),state_root:h(2),body_root:h(3)};
  const genesis={data:{genesis_time:POLICY.genesisTime,genesis_validators_root:POLICY.genesisValidatorsRoot,genesis_fork_version:POLICY.genesisForkVersion}};
  const header={execution_optimistic:false,finalized:true,data:{root:beaconHeaderMessageRoot(message),canonical:true,header:{message,signature:'0x'+'0'.repeat(192)}}};
  const validators={execution_optimistic:false,finalized:true,data:Array.from({length:8},(_,i)=>{
    const effective=i===7?0n:i===0?34000000000n:i===6?40000000000n:32000000000n;
    return {index:String(i),status:i===7?'withdrawal_done':'active_ongoing',balance:(i===7?0n:effective+50000000n).toString(),validator:{
      pubkey:'0x'+String(i+1).padStart(96,'0'),withdrawal_credentials:'0x02'+'0'.repeat(62),effective_balance:effective.toString(),slashed:false,
      activation_eligibility_epoch:'0',activation_epoch:'0',exit_epoch:i===7?'400000':FAR,withdrawable_epoch:i===7?'400256':FAR,
    }};})};
  const acquisition=(kind,value,start,end)=>({url:stakingCohortUrl(kind,kind==='validators'?message.state_root:null),httpStatus:200,complete:true,
    startedAt:'2026-10-27T16:35:0'+start+'.000Z',collectedAt:'2026-10-27T16:35:0'+end+'.000Z',bytes:Buffer.from(JSON.stringify(value))});
  return {genesis:acquisition('genesis',genesis,0,1),header:acquisition('header',header,1,2),validators:acquisition('validators',validators,2,3),captureStartedAt:STAMP,finishedAt:'2026-10-27T16:35:04.000Z'};
}
function mutate(input,part,change){const parsed=JSON.parse(input[part].bytes);change(parsed);input[part].bytes=Buffer.from(JSON.stringify(parsed));return input;}
const inspect=inspectEthereumStakingCohort;
function transportFixture(transform=()=>{},settings={}){
  const input=fixture(),responses=['genesis','header','validators'].map(key=>input[key].bytes),calls=[];
  const fetchImpl=async(url,options)=>{const index=calls.length;calls.push({url,options});return transform(index,url,options)??new Response(responses[index],{status:200,headers:{'content-type':'application/json'}});};
  return {calls,run:()=>captureEthereumStakingCohort({fetchImpl,nowMs:()=>Date.parse(STAMP),sourceCommit:'a'.repeat(40),...settings})};
}
function reducedTransportFixture(){
  const input=fixture(),lengths=['genesis','header','validators'].map(key=>input[key].bytes.length);
  let now=Date.parse(STAMP);
  return transportFixture(()=>{now+=5;},{nowMs:()=>now,limits:{...TRANSPORT,
    maximumResponseBytes:Math.max(...lengths),maximumTotalBytes:lengths.reduce((sum,n)=>sum+n,0),requestTimeoutMs:20,totalTimeoutMs:50}});
}

test('fixed sample preserves 34/40 ETH effective balances, exact actual balances and all missing economic conditions',()=>{
  const input=fixture(),before=JSON.stringify(input),out=inspect(input);
  assert.equal(out.capturedValidatorCount,8);assert.equal(out.totals.activeValidatorCount,7);
  assert.equal(out.validators[0].effectiveBalanceEth,'34');assert.equal(out.validators[6].effectiveBalanceEth,'40');
  assert.equal(out.totals.effectiveBalanceEth,'234');assert.equal(out.totals.actualBalanceEth,'234.35');
  assert.equal(out.totals.activeCountTimes32Eth,'224');assert.equal(out.totals.activeCountTimes32MatchesEffective,false);
  assert.equal(out.validators[7].status,'withdrawal_done');assert.equal(out.validators[7].actualBalanceEth,'0');
  for(const key of ['earnedReturn','timeWeightedRewardEligiblePrincipal','completedExitWait','networkStakedEth','publishedAt'])assert.equal(out[key],null);
  for(const key of ['modelInputActivated','fullModelSnapshotReady','fullUtcWindowObserved','stakingCohortRepresentative','historicalAvailabilityProven'])assert.equal(out[key],false);
  assert.equal(out.eligibleModelSnapshotCount,0);assert.equal(out.state.headerSszRootMatched,true);
  assert.equal(out.state.validatorStateMembershipProven,false);assert.equal(out.state.independentFinalityProven,false);assert.equal(out.state.headerSignatureAuthenticated,false);
  assert.equal(JSON.stringify(input),before);
});

test('response order is not trusted and exact requested IDs determine the retained order',()=>{
  const normal=inspect(fixture()),changed=mutate(fixture(),'validators',x=>x.data.reverse());
  assert.deepEqual(inspect(changed).validators,normal.validators);
  assert.notEqual(inspect(changed).acquisition[2].sha256,normal.acquisition[2].sha256);
});

test('HTTP200 with a missing, duplicate, additional or unexpected validator is rejected',()=>{
  for(const change of [x=>x.data.pop(),x=>x.data.push(x.data[0]),x=>x.data[7]=x.data[0],x=>x.data[7].index='8'])
    assert.throws(()=>inspect(mutate(fixture(),'validators',change)),/cohort|index/i);
});

test('public keys, decimal integers and protocol fields are validated before aggregation',()=>{
  for(const change of [x=>x.data[1].validator.pubkey=x.data[0].validator.pubkey,x=>x.data[0].index='00',x=>x.data[0].balance=34000000000,
    x=>x.data[0].balance='18446744073709551616',x=>x.data[0].validator.slashed='false',x=>x.data[0].validator.withdrawal_credentials='0x12',
    x=>x.data[0].validator.activation_epoch='500000',x=>x.data[0].status='active_exiting'])
    assert.throws(()=>inspect(mutate(fixture(),'validators',change)));
});

test('effective balance can exceed actual balance after losses without being silently corrected',()=>{
  const input=mutate(fixture(),'validators',x=>{x.data[0].balance='33000000001';});
  const out=inspect(input);assert.equal(out.validators[0].actualBalanceEth,'33.000000001');assert.equal(out.validators[0].effectiveBalanceEth,'34');
});

test('gwei arithmetic keeps low digits beyond Number safe integer range',()=>{
  const input=mutate(fixture(),'validators',x=>{x.data[0].balance='9007199254740993';});
  const out=inspect(input);assert.equal(out.validators[0].actualBalanceEth,'9007199.254740993');
  assert.equal(gweiToExactEth('1'),'0.000000001');assert.equal(gweiToExactEth('1000000000'),'1');
  assert.equal(BigInt(out.totals.actualBalanceGwei),out.validators.reduce((sum,row)=>sum+BigInt(row.actualBalanceGwei),0n));
});

test('mainnet genesis identity is required and not inferred from the hostname',()=>{
  for(const change of [x=>x.data.genesis_time='1606824024',x=>x.data.genesis_validators_root=h(9),x=>x.data.genesis_fork_version='0x01000000'])
    assert.throws(()=>inspect(mutate(fixture(),'genesis',change)),/mainnet/);
});

test('header SSZ root binds state and other header fields; provider root lookup is separately bound',()=>{
  for(const key of ['parent_root','state_root','body_root'])assert.throws(()=>inspect(mutate(fixture(),'header',x=>x.data.header.message[key]=h(4))),/SSZ/);
  assert.throws(()=>inspect(mutate(fixture(),'header',x=>x.data.header.message.proposer_index='1840703')),/SSZ/);
  const changed=mutate(fixture(),'header',x=>{x.data.header.message.state_root=h(4);x.data.root=beaconHeaderMessageRoot(x.data.header.message);});
  assert.throws(()=>inspect(changed),/exact endpoint/);
});

test('optimistic, unfinalized and noncanonical provider assertions fail closed',()=>{
  for(const part of ['header','validators'])for(const change of [x=>x.execution_optimistic=true,x=>delete x.execution_optimistic,x=>x.finalized=false,x=>delete x.finalized])
    assert.throws(()=>inspect(mutate(fixture(),part,change)),/finalized|nonoptimistic/);
  assert.throws(()=>inspect(mutate(fixture(),'header',x=>x.data.canonical=false)),/canonical/);
});

test('future header clocks and acquisition before the pinned-root request are rejected',()=>{
  const future=mutate(fixture(),'header',x=>{x.data.header.message.slot='999999999';x.data.root=beaconHeaderMessageRoot(x.data.header.message);});
  assert.throws(()=>inspect(future),/after its actual collection/);
  const early=fixture();early.validators.startedAt=early.captureStartedAt;assert.throws(()=>inspect(early),/predates/);
  const lateGenesis=fixture();lateGenesis.genesis.collectedAt='2026-10-27T16:35:03Z';assert.throws(()=>inspect(lateGenesis),/predates/);
  const backwards=fixture();backwards.genesis.collectedAt='2026-10-27T16:34:59Z';assert.throws(()=>inspect(backwards),/chronology/);
  const badCalendar=fixture();badCalendar.captureStartedAt='2026-02-30T00:00:00Z';assert.throws(()=>inspect(badCalendar),/calendar/);
});

test('arbitrary endpoints, incomplete responses, invalid UTF8/JSON and oversized bodies are rejected',()=>{
  for(const change of [x=>x.url='https://example.invalid/validators',x=>x.complete=false,x=>x.httpStatus=500,
    x=>x.bytes=Buffer.from([255]),x=>x.bytes=Buffer.from('{'),x=>x.bytes=Buffer.alloc(POLICY.maximumResponseBytes+1,32)]){
    const input=fixture();change(input.validators);assert.throws(()=>inspect(input));
  }
});

test('earned rewards and completed exit waiting time cannot be inferred from a single status sample',()=>{
  const out=inspect(fixture());
  assert.equal(out.completedExitWait,null);assert.equal(out.earnedReturn,null);
  assert(out.requiredBeforeEconomicUse.some(x=>x.includes('consolidation principal')));
  assert(out.requiredBeforeEconomicUse.some(x=>x.includes('without counting builder payments twice')));
  assert(out.requiredBeforeEconomicUse.some(x=>x.includes('service fees')));
});

test('collector performs only genesis/header/root-pinned validator GETs and preserves all raw bytes',async()=>{
  const fixture=transportFixture(),{receipt,rawFiles}=await fixture.run();
  assert.equal(receipt.status,'partial-cohort-state-captured');assert.equal(fixture.calls.length,3);assert.equal(rawFiles.length,3);
  assert.deepEqual(fixture.calls.map(c=>c.url),[stakingCohortUrl('genesis'),stakingCohortUrl('header'),stakingCohortUrl('validators',h(2))]);
  for(const call of fixture.calls){assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'error');assert.equal(call.options.credentials,'omit');}
  for(const file of rawFiles)assert.equal(file.sha256,createHash('sha256').update(file.bytes).digest('hex'));
  assert.equal(receipt.network.retries,0);assert.equal(receipt.observation.eligibleModelSnapshotCount,0);
});

test('collector retains actual HTTP failure bytes without retry or invented observations',async()=>{
  const f=transportFixture(()=>new Response('{"error":"unavailable"}',{status:503})),{receipt,rawFiles}=await f.run();
  assert.equal(f.calls.length,1);assert.equal(receipt.status,'capture-failed');assert.equal(receipt.observation,null);assert.match(receipt.error,/503/);
  assert.equal(rawFiles.length,1);assert.equal(rawFiles[0].bytes.toString(),'{"error":"unavailable"}');assert.equal(rawFiles[0].complete,true);
});

test('oversized streamed data retains only a marked bounded prefix and cannot become an observation',async()=>{
  const f=transportFixture(()=>new Response('x'.repeat(301)),{limits:{...TRANSPORT,maximumResponseBytes:100}}),{receipt,rawFiles}=await f.run();
  assert.equal(f.calls.length,1);assert.equal(receipt.status,'capture-failed');assert.equal(receipt.observation,null);
  assert.equal(rawFiles[0].bytes.length,100);assert.equal(rawFiles[0].truncated,true);assert.equal(rawFiles[0].complete,false);assert.equal(receipt.network.totalReceivedBytes,301);
});

test('combined capture byte cap remains bounded across otherwise individually valid responses',async()=>{
  const f=transportFixture(()=>{}, {limits:{...TRANSPORT,maximumTotalBytes:300}}),{receipt,rawFiles}=await f.run();
  assert.equal(f.calls.length,2);assert.equal(receipt.status,'capture-failed');assert.equal(receipt.network.retainedRawBytes,300);
  assert.equal(rawFiles.at(-1).truncated,true);assert.equal(receipt.observation,null);
});

test('invalid header is rejected before any state-root request is sent',async()=>{
  const data=JSON.parse(fixture().header.bytes);data.data.root=h(8);
  const f=transportFixture(index=>index===1?new Response(JSON.stringify(data)):undefined),{receipt}=await f.run();
  assert.equal(f.calls.length,2);assert.equal(receipt.status,'capture-failed');assert.match(receipt.error,/SSZ/);
});

test('request timeout aborts once and preserves a failure receipt',async()=>{
  const calls=[];const fetchImpl=(url,options)=>{calls.push(url);return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted timeout')),{once:true}));};
  const {receipt}=await captureEthereumStakingCohort({fetchImpl,nowMs:()=>Date.parse(STAMP),limits:{...TRANSPORT,requestTimeoutMs:5}});
  assert.equal(calls.length,1);assert.equal(receipt.status,'capture-failed');assert.match(receipt.error,/aborted/);assert.equal(receipt.observation,null);
});

test('transport budgets cannot be raised or changed to retries or redirects',async()=>{
  for(const limits of [{...TRANSPORT,maximumRequests:4},{...TRANSPORT,maximumRequests:1},{...TRANSPORT,maximumResponseBytes:TRANSPORT.maximumResponseBytes+1},
    {...TRANSPORT,maximumTotalBytes:0},{...TRANSPORT,requestTimeoutMs:NaN},{...TRANSPORT,retries:1},{...TRANSPORT,redirects:'follow'},{...TRANSPORT,unknownOverride:true}])
    await assert.rejects(()=>captureEthereumStakingCohort({limits}));
});

test('complete persisted capture recomputes from all raw files without network calls',async()=>{
  const f=transportFixture(),capture=await f.run(),replay=replayEthereumStakingCohortCapture(capture);
  assert.equal(f.calls.length,3);assert.equal(replay.networkRequestsDuringReplay,0);assert.equal(replay.status,'raw-replay-matched');
  assert.deepEqual(replay.observation,capture.receipt.observation);assert.equal(replay.modelInputActivated,false);
});

test('replay rejects altered bytes, accounting, clocks and promoted economic claims',async()=>{
  const capture=await transportFixture().run();
  for(const change of [c=>c.rawFiles[0].bytes[0]=32,c=>c.receipt.rawFiles[0].bytes++,c=>c.receipt.requests[0].receivedBytes++,
    c=>c.receipt.network.retries=1,c=>c.receipt.requests[0].finishedAt='2026-10-27T16:34:00Z',c=>c.receipt.modelInputActivated=true,
    c=>c.receipt.observation.totals.actualBalanceEth='999',c=>c.receipt.observation.earnedReturn=0]){
    const changed=structuredClone(capture);change(changed);assert.throws(()=>replayEthereumStakingCohortCapture(changed));
  }
});

test('replay rejects missing or duplicate raw files and actual failed capture receipts',async()=>{
  const capture=await transportFixture().run();
  for(const change of [c=>c.rawFiles.pop(),c=>c.rawFiles[2]=c.rawFiles[0],c=>c.receipt.rawFiles[2]=c.receipt.rawFiles[0],c=>c.receipt.requests[2]=c.receipt.requests[0]]){
    const changed=structuredClone(capture);change(changed);assert.throws(()=>replayEthereumStakingCohortCapture(changed));
  }
  const failed=await transportFixture(()=>new Response('unavailable',{status:503})).run();
  assert.throws(()=>replayEthereumStakingCohortCapture(failed),/successful/);
});

test('replay rejects each independently reproduced deadline, byte, request-count and cohort-policy mutation',async()=>{
  const capture=await transportFixture().run();
  assert.equal(replayEthereumStakingCohortCapture(capture).status,'raw-replay-matched');
  for(const [change,reason] of [
    [c=>c.receipt.network.deadlineAt='2026-10-27T16:34:00.000Z',/Network deadline/],
    [c=>c.receipt.transportPolicy.maximumResponseBytes=1,/byte budget/],
    [c=>c.receipt.transportPolicy.maximumRequests=1,/exactly three/],
    [c=>c.receipt.policy.cohortId='other-cohort',/exact fixed cohort policy/],
  ]){
    const changed=structuredClone(capture);change(changed);assert.throws(()=>replayEthereumStakingCohortCapture(changed),reason);
  }
});

test('capture and replay accept reduced byte/time budgets with exact retained byte boundaries',async()=>{
  const f=reducedTransportFixture(),capture=await f.run(),{receipt}=capture;
  assert.equal(receipt.status,'partial-cohort-state-captured');assert.equal(f.calls.length,3);
  assert.equal(receipt.network.retainedRawBytes,receipt.transportPolicy.maximumTotalBytes);
  assert.equal(Math.max(...receipt.rawFiles.map(file=>file.bytes)),receipt.transportPolicy.maximumResponseBytes);
  assert.equal(Date.parse(receipt.network.completedAt)-Date.parse(receipt.captureStartedAt),15);
  assert.equal(replayEthereumStakingCohortCapture(capture).status,'raw-replay-matched');
  const changed=structuredClone(capture);changed.receipt.transportPolicy.maximumTotalBytes--;
  assert.throws(()=>replayEthereumStakingCohortCapture(changed),/byte budget/);
});

test('replay checks the complete fixed identity and the same allowed transport schema as capture',async()=>{
  const capture=await transportFixture().run();
  const reordered=structuredClone(capture);reordered.receipt.policy=Object.fromEntries(Object.entries(reordered.receipt.policy).reverse());
  assert.equal(replayEthereumStakingCohortCapture(reordered).status,'raw-replay-matched');
  for(const change of [c=>c.receipt.policy.validatorIndices.reverse(),c=>c.receipt.policy.extra=true,c=>delete c.receipt.policy.genesisTime,
    c=>c.receipt.transportPolicy.totalTimeoutMs=TRANSPORT.totalTimeoutMs+1,c=>c.receipt.transportPolicy.requestTimeoutMs=0,
    c=>c.receipt.transportPolicy.redirects='follow',c=>c.receipt.transportPolicy.retries=1,c=>delete c.receipt.transportPolicy.maximumTotalBytes,
    c=>c.receipt.transportPolicy.extra=true]){
    const changed=structuredClone(capture);change(changed);assert.throws(()=>replayEthereumStakingCohortCapture(changed),/policy|transport|GETs/);
  }
});

test('replay budgets body EOF against both request and total deadlines, with consistent declared deadlines',async()=>{
  const capture=await reducedTransportFixture().run();
  for(const [key,value] of [['requestTimeoutMs',5],['totalTimeoutMs',15]]){
    const changed=structuredClone(capture),r=changed.receipt;r.transportPolicy[key]=value;
    const deadline=Date.parse(r.captureStartedAt)+r.transportPolicy.totalTimeoutMs;r.network.deadlineAt=new Date(deadline).toISOString();
    for(const request of r.requests)request.deadlineAt=new Date(Math.min(Date.parse(request.startedAt)+r.transportPolicy.requestTimeoutMs,deadline)).toISOString();
    assert.throws(()=>replayEthereumStakingCohortCapture(changed),/body collection exceeds/);
  }
  for(const [change,reason] of [
    [c=>c.receipt.requests[0].deadlineAt=c.receipt.network.deadlineAt,/Request deadline/],
    [c=>c.receipt.network.completedAt=c.receipt.captureStartedAt,/Network completion/],
    [c=>c.receipt.requests[1].startedAt=c.receipt.captureStartedAt,/chronology or sequence/],
    [c=>c.receipt.requests.reverse(),/request sequence/],
  ]){
    const changed=structuredClone(capture);change(changed);assert.throws(()=>replayEthereumStakingCohortCapture(changed),reason);
  }
});

test('local hashing, observation processing and replay after the network deadline do not invalidate timely body EOF',async()=>{
  const capture=await reducedTransportFixture().run(),r=capture.receipt,start=Date.parse(r.captureStartedAt);
  r.requests[2].finishedAt=new Date(start+500).toISOString();
  r.observation.finishedAt=new Date(start+700).toISOString();r.finishedAt=new Date(start+800).toISOString();
  const replay=replayEthereumStakingCohortCapture(capture);
  assert.equal(replay.status,'raw-replay-matched');assert.equal(replay.networkRequestsDuringReplay,0);
  assert(Date.parse(r.network.completedAt)<Date.parse(r.network.deadlineAt));
  assert(Date.parse(r.finishedAt)>Date.parse(r.network.deadlineAt));
});

test('a signal-respecting stalled body aborts once and preserves its partial bytes on disk', {timeout:2000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'eth-cohort-partial-')),prefix='{"partial":';let aborts=0;
  try{
    const f=transportFixture((_index,_url,{signal})=>new Response(new ReadableStream({start(controller){
      controller.enqueue(new TextEncoder().encode(prefix));
      signal.addEventListener('abort',()=>{aborts++;controller.error(new Error('cooperative body abort'));},{once:true});
    }})),{outputDirectory:directory,limits:{...TRANSPORT,requestTimeoutMs:5}});
    const {receipt,rawFiles}=await f.run(),persisted=JSON.parse(await readFile(join(directory,'receipt.json'),'utf8'));
    assert.equal(f.calls.length,1);assert.equal(aborts,1);assert.equal(receipt.status,'capture-failed');
    assert.match(receipt.error,/cooperative body abort/);assert.equal(receipt.observation,null);assert.equal(receipt.network.completedAt,null);
    assert.equal(rawFiles.length,1);assert.equal(rawFiles[0].complete,false);assert.equal(rawFiles[0].truncated,false);
    assert.equal(rawFiles[0].bytes.toString(),prefix);assert.equal(await readFile(join(directory,'genesis.raw.json'),'utf8'),prefix);
    assert.equal(persisted.rawFiles[0].sha256,createHash('sha256').update(prefix).digest('hex'));
    assert.equal(persisted.requests[0].receivedBytes,Buffer.byteLength(prefix));assert.equal(persisted.network.retries,0);
    assert.throws(()=>replayEthereumStakingCohortCapture({receipt:persisted,rawFiles}),/successful/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
