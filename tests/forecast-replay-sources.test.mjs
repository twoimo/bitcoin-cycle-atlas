import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseReplayPriceArchive,loadReplayPriceArchive} from '../dist/forecast-replay-sources.js';

// A real WHATWG Response supplies native arrayBuffer/clone behavior. Its finite
// producer models fetch's AbortSignal contract, including a stalled connection.
function streamingFixture({chunkBytes=1000000,totalChunks=64,stallAfter=null,failAfter=null}={}){
  let started,first,unblock=null;
  const state={producedBytes:0,completed:false,nativeResolved:false,nativeRejected:false,abortCount:0,
    nativeStarted:new Promise(resolve=>{started=resolve;}),firstChunk:new Promise(resolve=>{first=resolve;})};
  const fetchImpl=async(_path,{signal})=>{
    state.signal=signal;let controller,index=0;
    const abort=()=>{state.abortCount++;controller.error(signal.reason);unblock?.();};
    const stream=new ReadableStream({
      start(value){controller=value;signal.addEventListener('abort',abort,{once:true});},
      async pull(value){
        if(stallAfter!==null&&index>=stallAfter){await new Promise(resolve=>{unblock=resolve;});return;}
        await new Promise(resolve=>setTimeout(resolve,0));
        if(signal.aborted)return;
        if(index===failAfter){value.error(new Error('Fixture connection interrupted'));return;}
        if(index===totalChunks){state.completed=true;signal.removeEventListener('abort',abort);value.close();return;}
        value.enqueue(new Uint8Array(chunkBytes));index++;state.producedBytes+=chunkBytes;first();
      },
      cancel(){signal.removeEventListener('abort',abort);unblock?.();},
    });
    const response=new Response(stream),read=response.arrayBuffer.bind(response);
    response.arrayBuffer=async()=>{started();try{const value=await read();state.nativeResolved=true;return value;}catch(error){state.nativeRejected=true;throw error;}};
    return response;
  };
  return {state,fetchImpl};
}

test('actual saved BTC prices remain Coin Metrics closes without manufactured OHLC',async()=>{
  const raw=await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'),parsed=JSON.parse(raw);
  const result=await parseReplayPriceArchive('BTCUSD',raw);
  assert.equal(result.observations.length,parsed.prices.length);
  assert.equal(result.observations.at(-1).price,parsed.prices.at(-1)[1]);
  assert.equal(result.source.ohlcAvailable,false);assert.ok(!Object.hasOwn(result.observations[0],'open'));
  assert.equal(result.observedAt,new Date(parsed.meta.retrievedAt).toISOString());
  assert.equal(result.source.publishedAt,null);assert.equal(result.source.providerAuthenticityProven,false);
  await assert.rejects(parseReplayPriceArchive('BTCUSD',JSON.stringify({...parsed,meta:{...parsed.meta,sourceName:'Coinbase Exchange'}})),/Coin Metrics/);
});

test('ETH and equities preserve actual completed OHLC without mixing price providers',async()=>{
  for(const [symbol,path]of [['ETHUSD','eth-ohlc'],['MSTR','mstr-ohlc'],['BMNR','bmnr-ohlc']]){
    const raw=await readFile(new URL('../dist/data/'+path+'.json',import.meta.url),'utf8'),parsed=JSON.parse(raw);
    const result=await parseReplayPriceArchive(symbol,raw,{archivePath:'data/'+path+'.json'});
    const original=(parsed.dailyHistory??parsed).candles.at(-1),last=result.observations.at(-1);
    for(const field of ['open','high','low','close','volume'])assert.equal(last[field],original[field]);
    assert.equal(last.price,original.close);assert.equal(result.source.ohlcAvailable,true);
    assert.equal(result.source.publishedAt,null);assert.match(result.source.sourceHash,/^[a-f0-9]{64}$/);
  }
});

test('load uses the dedicated ETH outcome archive and preserves bounded fetch options',async()=>{
  const raw=await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8');
  let request;
  const controller=new AbortController();
  const result=await loadReplayPriceArchive('ETHUSD',{signal:controller.signal,fetchImpl:async(path,options)=>{
    request={path,options};return new Response(raw,{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal(request.path,'data/replay-eth-ohlc.json');assert.notEqual(request.options.signal,controller.signal);
  assert.equal(request.options.signal.aborted,false);
  assert.equal(request.options.redirect,'error');assert.equal(request.options.credentials,'omit');
  assert.deepEqual(result,await parseReplayPriceArchive('ETHUSD',raw));
  controller.abort(new Error('Completed caller disposed'));
  assert.equal(request.options.signal.aborted,false,'a completed fetch no longer belongs to the caller abort listener');
});

test('source loader rejects unsafe paths, HTTP errors, byte overflow and invalid UTF-8',async()=>{
  await assert.rejects(loadReplayPriceArchive('ETHUSD',{archivePath:'../secret.json'}),/local data/);
  await assert.rejects(loadReplayPriceArchive('ETHUSD',{fetchImpl:async()=>new Response('',{status:503})}),/503/);
  await assert.rejects(loadReplayPriceArchive('ETHUSD',{fetchImpl:async()=>new Response('',{headers:{'content-length':'16000001'}})}),/byte limit/);
  await assert.rejects(loadReplayPriceArchive('ETHUSD',{fetchImpl:async()=>new Response(new Uint8Array([0xff,0xfe]))}),/encoded data/);
  let cancelled=false;
  const response={ok:true,headers:new Headers(),body:new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(8000001));},cancel(){cancelled=true;}})};
  await assert.rejects(loadReplayPriceArchive('ETHUSD',{fetchImpl:async()=>response}),/byte limit/);
  assert.equal(cancelled,true);
});

test('already cancelled requests do not fetch and preserve the caller cancellation reason',async()=>{
  const controller=new AbortController(),reason=new Error('Caller already closed');controller.abort(reason);
  let calls=0;
  await assert.rejects(loadReplayPriceArchive('ETHUSD',{signal:controller.signal,fetchImpl:async()=>{calls++;return new Response('');}}),error=>error===reason);
  assert.equal(calls,0);
});

test('caller cancellation interrupts both native consumption and a stalled clone monitor',async()=>{
  const fixture=streamingFixture({stallAfter:1}),controller=new AbortController(),reason=new Error('Caller changed asset');
  const loading=loadReplayPriceArchive('ETHUSD',{signal:controller.signal,fetchImpl:fixture.fetchImpl});
  const rejected=assert.rejects(loading,error=>error===reason);
  await Promise.all([fixture.state.nativeStarted,fixture.state.firstChunk]);controller.abort(reason);await rejected;
  assert.equal(fixture.state.signal.aborted,true);assert.equal(fixture.state.signal.reason,reason);
  assert.equal(fixture.state.abortCount,1);assert.equal(fixture.state.nativeRejected,true);
  assert.equal(fixture.state.nativeResolved,false);assert.equal(fixture.state.completed,false);
});

test('a caller deadline rejects a stalled body without leaving a native read running',async()=>{
  const fixture=streamingFixture({stallAfter:1}),controller=new AbortController();
  const reason=new DOMException('Replay deadline elapsed','TimeoutError');
  const timer=setTimeout(()=>controller.abort(reason),20);
  try{await assert.rejects(loadReplayPriceArchive('ETHUSD',{signal:controller.signal,fetchImpl:fixture.fetchImpl}),error=>error===reason);}
  finally{clearTimeout(timer);}
  assert.equal(fixture.state.nativeRejected,true);assert.equal(fixture.state.completed,false);assert.equal(fixture.state.abortCount,1);
});

test('the progressive byte limit aborts the original native body before a malicious response completes',async()=>{
  const fixture=streamingFixture();
  await assert.rejects(loadReplayPriceArchive('ETHUSD',{fetchImpl:fixture.fetchImpl}),/byte limit/);
  assert.equal(fixture.state.nativeResolved,false);assert.equal(fixture.state.nativeRejected,true);
  assert.equal(fixture.state.completed,false);assert.equal(fixture.state.signal.aborted,true);
  assert.ok(fixture.state.producedBytes>16000000&&fixture.state.producedBytes<64000000);
  assert.equal(fixture.state.abortCount,1);
});

test('an interrupted native response rejects and settles the monitored branch',async()=>{
  const fixture=streamingFixture({failAfter:2});
  await assert.rejects(loadReplayPriceArchive('ETHUSD',{fetchImpl:fixture.fetchImpl}),/Fixture connection interrupted/);
  assert.equal(fixture.state.nativeRejected,true);assert.equal(fixture.state.nativeResolved,false);
  assert.equal(fixture.state.completed,false);assert.equal(fixture.state.signal.aborted,true);
});
