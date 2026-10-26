import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastHash} from '../dist/forecast-records.js';
import {createForecastInformationClock} from '../dist/forecast-information-time.js';
import {assetSourceHash,createAssetForecastSnapshot,createAssetForecastRecord,assetForecastIndexEntry} from '../dist/asset-forecast-records.js';
import {createAssetJournalLoader} from '../dist/asset-forecast-journal.js';

const BASE='https://example.invalid/app/';
const ROOT=BASE+'data/asset-forecast-ledger/';
const DAY=86400000;
const testOptions={timeout:5000};
const day=(start,offset)=>new Date(Date.parse(start+'T00:00:00Z')+offset*DAY).toISOString().slice(0,10);

// All prices, source text, identities and URLs below are synthetic test data.
async function validFixture(){
  const issuedAt='2026-10-26T10:00:00.000Z',retrievedAt='2026-10-26T09:00:00.000Z',asOf='2026-10-25';
  const candles=Array.from({length:25},(_,i)=>{
    const sessionDate=day('2026-10-01',i),date=sessionDate+'T00:00:00Z',close=2000+i;
    return {date,sessionDate,time:Date.parse(date)/1000,open:close,high:close,low:close,close,volume:10};
  });
  const raw=JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,retrievedAt,candles,
    dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,retrievedAt,candles}});
  const informationClock=createForecastInformationClock({issuedAt,inputs:[{
    id:'eth-price',kind:'crypto-daily',symbol:'ETHUSD',asOf,sourceObservedThrough:asOf,
    publishedAt:null,collectedAt:issuedAt,vintageId:'synthetic-journal-v1',
    sourceHash:await assetSourceHash(raw),sourceUrl:'https://example.invalid/eth-price'
  }]});
  const snapshot=await createAssetForecastSnapshot({symbol:'ETHUSD',asOf,informationClock,inputs:{
    primaryPrices:candles.map(row=>[row.sessionDate,row.close]),sourceDocuments:{'eth-price':raw}
  }});
  const files={'dist/synthetic-journal-test-model.js':'a'.repeat(64)};
  const model={version:'synthetic-journal-test-only',sourceCommit:'b'.repeat(40),sourceHash:await forecastHash(files),files};
  const anchor=snapshot.inputs.primaryPrices.at(-1)[1];
  const forecast={symbol:'ETHUSD',asOf,scenario:{id:'base',label:'Synthetic journal fixture'},displayEnd:day(asOf,200),
    path:Array.from({length:201},(_,i)=>{
      const price=anchor*Math.exp(i*.001);
      return {date:day(asOf,i),price,low:price*.9,high:price*1.1,baselinePrice:price};
    })};
  const record=await createAssetForecastRecord({snapshot,forecast,model,options:{seed:17}});
  const index={schemaVersion:1,kind:'atlas-asset-forecast-index',entries:[assetForecastIndexEntry(record)]};
  return {index,record,snapshot};
}
const fixture=await validFixture();

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function response(value,status=200){
  return {ok:status>=200&&status<300,status,statusText:status===404?'Not Found':'OK',
    headers:{get:()=>null},textReads:0,
    async text(){this.textReads++;return JSON.stringify(value);}};
}
async function flush(){for(let i=0;i<24;i++)await Promise.resolve();}
function harness(){
  const requests=[],states=[],timers=new Map(),cleared=new Set();
  let nextTimer=0;
  const loader=createAssetJournalLoader({baseUrl:BASE,timeoutMs:1234,
    fetchImpl:(url,options={})=>{
      // Deliberately ignore abort: a provider may resolve or reject after cancellation.
      const pending=deferred();
      requests.push({url:String(url),signal:options.signal,...pending});
      return pending.promise;
    },
    setTimer:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;},
    // Keep callbacks available to simulate an already queued, cleared timer.
    clearTimer:id=>cleared.add(id),
    onState:state=>states.push(state)
  });
  return {loader,requests,states,timers,cleared};
}
async function selectedPair(h,index=fixture.index){
  await flush();
  const indexRequest=h.requests.at(-1),start=h.requests.length;
  assert.equal(indexRequest.url,ROOT+'index.json');
  indexRequest.resolve(response(index));
  await flush();
  const requests=h.requests.slice(start),entry=index.entries[0];
  assert.equal(requests.length,2,'record and snapshot requests start together');
  const record=requests.find(request=>request.url===ROOT+entry.recordPath);
  const snapshot=requests.find(request=>request.url===ROOT+entry.snapshotPath);
  assert.ok(record,'selected record path was fetched');
  assert.ok(snapshot,'selected snapshot path was fetched');
  assert.equal(record.signal,indexRequest.signal);
  assert.equal(snapshot.signal,indexRequest.signal);
  return {indexRequest,record,snapshot};
}
function resolvePair(pair,record=fixture.record,snapshot=fixture.snapshot){
  const recordResponse=response(record),snapshotResponse=response(snapshot);
  pair.record.resolve(recordResponse);pair.snapshot.resolve(snapshotResponse);
  return {recordResponse,snapshotResponse};
}
const statuses=h=>h.states.map(state=>state.status);

test('journal loads and verifies a complete hashed selected record and snapshot',testOptions,async()=>{
  const h=harness();
  const pending=h.loader.load({symbol:'ETHUSD',recordId:fixture.record.id});
  const pair=await selectedPair(h);
  const replies=resolvePair(pair);
  const state=await pending;
  assert.equal(state.status,'ready');
  assert.equal(state.symbol,'ETHUSD');
  assert.deepEqual(state.entries,fixture.index.entries);
  assert.deepEqual(state.record,fixture.record);
  assert.deepEqual(state.snapshot,fixture.snapshot);
  assert.deepEqual(statuses(h),['loading','ready']);
  assert.equal(replies.recordResponse.textReads,1);
  assert.equal(replies.snapshotResponse.textReads,1);
  assert.equal(h.timers.get(1).delay,1234);
  assert.ok(h.cleared.has(1),'completion clears its own timeout');
});
test('journal rejects tampering in the preserved raw source document',testOptions,async()=>{
  const h=harness(),tampered=structuredClone(fixture.snapshot);
  tampered.inputs.sourceDocuments['eth-price']+=' ';
  const pending=h.loader.load({symbol:'ETHUSD'});
  resolvePair(await selectedPair(h),fixture.record,tampered);
  assert.equal(await pending,null);
  assert.deepEqual(statuses(h),['loading','error']);
  assert.match(h.states.at(-1).message,/hash|source|integrity/i);
});
test('journal requires the index entry to exactly match the verified selected record',testOptions,async()=>{
  const h=harness(),index=structuredClone(fixture.index);
  index.entries[0].modelVersion='unrelated-model-version';
  const pending=h.loader.load({symbol:'ETHUSD'});
  resolvePair(await selectedPair(h,index));
  assert.equal(await pending,null);
  assert.deepEqual(statuses(h),['loading','error']);
  assert.match(h.states.at(-1).message,/index|metadata|differ|색인|식별자/i);
});
for(const status of [200,404]){
  test('journal treats '+(status===404?'an absent index':'an empty index')+' as empty',testOptions,async()=>{
    const h=harness();
    const pending=h.loader.load({symbol:'BMNR'});
    await flush();
    h.requests[0].resolve(response({schemaVersion:1,kind:'atlas-asset-forecast-index',entries:[]},status));
    const state=await pending;
    assert.equal(state.status,'empty');
    assert.deepEqual(statuses(h),['loading','empty']);
    assert.equal(h.requests.length,1);
    assert.ok(h.cleared.has(1));
  });
}
for(const missing of ['record','snapshot']){
  test('journal reports a missing selected '+missing+' as an error',testOptions,async()=>{
    const h=harness();
    const pending=h.loader.load({symbol:'ETHUSD'});
    const pair=await selectedPair(h);
    pair.record.resolve(response(fixture.record,missing==='record'?404:200));
    pair.snapshot.resolve(response(fixture.snapshot,missing==='snapshot'?404:200));
    assert.equal(await pending,null);
    assert.deepEqual(statuses(h),['loading','error']);
    assert.match(h.states.at(-1).message,/record|snapshot|404|not found|missing/i);
  });
}
test('a late successful old pair cannot replace the successful retry',testOptions,async()=>{
  const h=harness();
  const first=h.loader.load({symbol:'ETHUSD'});
  const old=await selectedPair(h);
  const second=h.loader.load({symbol:'ETHUSD',recordId:fixture.record.id});
  const current=await selectedPair(h);
  assert.equal(old.record.signal.aborted,true);
  resolvePair(current);
  assert.equal((await second).status,'ready');
  const count=h.states.length;
  const replies=resolvePair(old);
  assert.equal(await first,null);
  await flush();
  assert.equal(h.states.length,count);
  assert.deepEqual(statuses(h),['loading','loading','ready']);
  assert.equal(replies.recordResponse.textReads,0,'revoked work cannot consume its late body');
  assert.equal(replies.snapshotResponse.textReads,0,'revoked work cannot consume its late body');
});
test('late old network failures cannot replace the successful retry',testOptions,async()=>{
  const h=harness();
  const first=h.loader.load({symbol:'ETHUSD'});
  const old=await selectedPair(h);
  const second=h.loader.load({symbol:'ETHUSD'});
  resolvePair(await selectedPair(h));
  assert.equal((await second).status,'ready');
  const count=h.states.length;
  old.record.reject(new Error('obsolete record request failed'));
  old.snapshot.reject(new Error('obsolete snapshot request failed'));
  assert.equal(await first,null);
  await flush();
  assert.equal(h.states.length,count);
  assert.deepEqual(statuses(h),['loading','loading','ready']);
});
test('cancelled closed journal cannot publish a late successful pair',testOptions,async()=>{
  const h=harness();
  const pending=h.loader.load({symbol:'ETHUSD'});
  const pair=await selectedPair(h);
  h.loader.cancel();
  assert.equal(pair.record.signal.aborted,true);
  assert.ok(h.cleared.has(1));
  const count=h.states.length;
  const replies=resolvePair(pair);
  assert.equal(await pending,null);
  await flush();
  assert.equal(h.states.length,count);
  assert.deepEqual(statuses(h),['loading']);
  assert.equal(replies.recordResponse.textReads,0);
  assert.equal(replies.snapshotResponse.textReads,0);
});
test('a cleared old timeout cannot abort or fail the reopened journal',testOptions,async()=>{
  const h=harness();
  const first=h.loader.load({symbol:'ETHUSD'});
  await flush();
  const oldRequest=h.requests[0],oldTimeout=h.timers.get(1).callback;
  h.loader.cancel();
  const second=h.loader.load({symbol:'ETHUSD'});
  await flush();
  const newRequest=h.requests.at(-1);
  assert.equal(oldRequest.signal.aborted,true);
  assert.ok(h.cleared.has(1));
  assert.equal(newRequest.signal.aborted,false);
  oldTimeout();
  await flush();
  assert.equal(newRequest.signal.aborted,false,'an obsolete timer cannot abort the new controller');
  assert.deepEqual(statuses(h),['loading','loading']);
  assert.equal(h.cleared.has(2),false,'an obsolete timer cannot clear the new timer');
  resolvePair(await selectedPair(h));
  assert.equal((await second).status,'ready');
  oldRequest.resolve(response(fixture.index));
  assert.equal(await first,null);
  await flush();
  assert.deepEqual(statuses(h),['loading','loading','ready']);
  assert.equal(h.requests.length,4,'a late obsolete index cannot begin record reads');
});
for(const stage of ['index','selected pair']){
  test('owned timeout settles an ignored-abort '+stage+' request and prevents late publication',testOptions,async()=>{
    const h=harness();
    const pending=h.loader.load({symbol:'ETHUSD'});
    const pair=stage==='selected pair'?await selectedPair(h):null;
    await flush();
    const signal=h.requests[0].signal;
    h.timers.get(1).callback();
    assert.equal(await pending,null,'timeout must settle even when fetch ignores abort');
    assert.equal(signal.aborted,true);
    assert.deepEqual(statuses(h),['loading','error']);
    assert.match(h.states.at(-1).message,/timed?\s*out|timeout|시간.*초과/i);
    assert.match(h.states.at(-1).message,/retry|try again|다시\s*시도/i);
    const count=h.states.length;
    if(pair){
      const replies=resolvePair(pair);
      await flush();
      assert.equal(replies.recordResponse.textReads,0);
      assert.equal(replies.snapshotResponse.textReads,0);
    }else{
      h.requests[0].resolve(response(fixture.index));
      await flush();
      assert.equal(h.requests.length,1,'timed-out index cannot start the pair');
    }
    assert.equal(h.states.length,count);
    assert.ok(h.cleared.has(1));
  });
}

for(const [name,index,status] of [
  ['different indexed record',fixture.index,200],
  ['empty refreshed index',{schemaVersion:1,kind:'atlas-asset-forecast-index',entries:[]},200],
  ['missing refreshed index',null,404],
]){
  test('explicit saved ID cannot fall back after '+name,testOptions,async()=>{
    const h=harness(),requested='0'.repeat(64);
    assert.notEqual(requested,fixture.record.id);
    const pending=h.loader.load({symbol:'ETHUSD',recordId:requested});
    await flush();h.requests[0].resolve(response(index,status));
    assert.equal(await pending,null);
    assert.deepEqual(statuses(h),['loading','error']);
    assert.equal(h.requests.length,1,'a missing requested identity must not fetch a replacement pair');
    assert.match(h.states.at(-1).message,/선택|색인|record|index|missing/i);
  });
}
