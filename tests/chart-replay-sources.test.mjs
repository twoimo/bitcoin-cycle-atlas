import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseBitcoinReplayCandles,loadChartReplayArchive,loadChartReplayRecord} from '../dist/chart-replay-sources.js';
import {parseVolumeSnapshot} from '../dist/volume-data.js';
import {createHistoricalReplaySession,buildReplayChartData} from '../dist/forecast-replay.js';
import {forecastHash,forecastIndexEntry,verifyForecastRecord} from '../dist/forecast-records.js';

const dataRoot=new URL('../dist/data/',import.meta.url);
const raw=await readFile(new URL('btc-volume.json',dataRoot),'utf8'),payload=JSON.parse(raw);
const now=Date.parse(payload.retrievedAt)+3*86400000;
const btcIndex=JSON.parse(await readFile(new URL('forecast-ledger/index.json',dataRoot),'utf8'));
const baseEntry=btcIndex.entries.filter(row=>row.scenario==='base').sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||a.id.localeCompare(b.id))[0];
const savedRecord=JSON.parse(await readFile(new URL('forecast-ledger/'+baseEntry.recordPath,dataRoot),'utf8'));
const savedSnapshot=JSON.parse(await readFile(new URL('forecast-ledger/'+baseEntry.snapshotPath,dataRoot),'utf8'));
function fixtureFetch(overrides=new Map(),calls=[]){
  return async(url,options)=>{
    calls.push({url:String(url),options});
    const path=new URL(url).pathname.replace('/app/data/','');
    const text=overrides.has(path)?overrides.get(path):await readFile(new URL(path,dataRoot),'utf8');
    return new Response(text,{headers:{'content-type':'application/json'}});
  };
}
async function withDocument(document,work){
  const previous=globalThis.document;
  globalThis.document=document;
  try{return await work();}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}

test('BTC rehearsal preserves genuine Bitstamp OHLC, acquisition clock and exact source bytes',async()=>{
  const archive=await parseBitcoinReplayCandles(raw,{now});
  assert.equal(archive.observations.length,payload.bars.length);
  assert.equal(archive.observedAt,payload.retrievedAt);assert.equal(archive.observedThrough,payload.lastDate);
  for(const index of [0,180,payload.bars.length-1]){
    for(const key of ['date','time','open','high','low','close','volume'])assert.equal(archive.observations[index][key],payload.bars[index][key]);
    assert.equal(archive.observations[index].price,payload.bars[index].close);
  }
  assert.equal(archive.source.provider,'Bitstamp');assert.equal(archive.source.ohlcAvailable,true);
  assert.equal(archive.source.sourceHash,createHash('sha256').update(raw).digest('hex'));
  assert.deepEqual(archive.source.sourceUrls,payload.sourceUrls);
  assert.equal(archive.source.publishedAt,null);assert.equal(archive.source.historicalAvailabilityProven,false);
});

test('a valid different-provider snapshot cannot masquerade as the Bitstamp replay source',async()=>{
  const swapped={...payload,source:'Coinbase Exchange',provider:'Coinbase Exchange',providerProduct:'BTC-USD',
    sourceUrls:['https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400'],
    documentationUrls:['https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles']};
  assert.equal(parseVolumeSnapshot(swapped,{now}).source,'Coinbase Exchange');
  await assert.rejects(parseBitcoinReplayCandles(JSON.stringify(swapped),{now}),/Bitstamp/);
});

test('inconsistent OHLC, altered coverage and future acquisition clocks fail before replay',async()=>{
  const invalid=structuredClone(payload);invalid.bars[0].high=invalid.bars[0].low-1;
  await assert.rejects(parseBitcoinReplayCandles(JSON.stringify(invalid),{now}),/OHLC/);
  const wrongDate=new Date(Date.parse(payload.lastDate+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  await assert.rejects(parseBitcoinReplayCandles(JSON.stringify({...payload,lastDate:wrongDate}),{now}),/coverage/);
  await assert.rejects(parseBitcoinReplayCandles(JSON.stringify({...payload,retrievedAt:new Date(now+86400000).toISOString()}),{now}),/evaluation clock/);
  await assert.rejects(parseBitcoinReplayCandles(JSON.stringify({...payload,retrievedAt:payload.retrievedAt.slice(0,10)}),{now}),/timestamp|time|ISO/i);
});

test('mutating future Bitstamp outcomes cannot improve the origin forecast or earlier visible scores',async()=>{
  const asOf='2026-04-28',cursorDate='2026-05-05',changed=structuredClone(payload);
  for(const row of changed.bars)if(row.date>cursorDate)for(const key of ['open','high','low','close'])row[key]*=100;
  const original=await parseBitcoinReplayCandles(raw,{now}),mutated=await parseBitcoinReplayCandles(JSON.stringify(changed),{now});
  const options={asOf,horizonDays:30,generatedAt:new Date(now).toISOString()};
  const a=await createHistoricalReplaySession({...original,...options}),b=await createHistoricalReplaySession({...mutated,...options});
  assert.notEqual(original.source.sourceHash,mutated.source.sourceHash,'changed archive bytes have a new source identity');
  assert.equal(a.identity.outputHash,b.identity.outputHash);assert.equal(a.id,b.id);
  assert.deepEqual(a.forecast,b.forecast);assert.deepEqual(a.training,b.training);
  const left=buildReplayChartData(a,{cursorDate}),right=buildReplayChartData(b,{cursorDate});
  assert.deepEqual(left.observedRows,right.observedRows);assert.deepEqual(left.observedCandles,right.observedCandles);
  assert.deepEqual(left.priceDomain,right.priceDomain);assert.deepEqual(left.frame.metrics,right.frame.metrics);
});

test('BTC historical and recorded modes request different archives and preserve their price definitions',async()=>{
  const calls=[],controller=new AbortController();
  const historical=await loadChartReplayArchive('BTCUSD',{signal:controller.signal,now,fetchImpl:async(url,options)=>{
    calls.push({url:String(url),options});return new Response(raw);
  }});
  assert.match(calls[0].url,/data\/btc-volume\.json$/);
  assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
  assert.equal(historical.source.provider,'Bitstamp');
  controller.abort();assert.equal(calls[0].options.signal.aborted,false,'completed request releases its caller listener');
  const daily=await readFile(new URL('btc-daily.json',dataRoot),'utf8');let path;
  const recorded=await loadChartReplayArchive('BTCUSD',{mode:'recorded',fetchImpl:async value=>{path=value;return new Response(daily);}});
  assert.equal(path,'data/btc-daily.json');assert.equal(recorded.source.provider,'Coin Metrics Community API');
  assert.equal(recorded.source.ohlcAvailable,false);assert.ok(!Object.hasOwn(recorded.observations[0],'open'));
  assert.equal(recorded.observations.at(-1).price,JSON.parse(daily).prices.at(-1)[1]);
});

test('embedded Bitstamp bytes work offline and a damaged embedded archive cannot silently fetch a replacement',async()=>{
  let fetches=0;const fetchImpl=async()=>{fetches++;throw new Error('offline');};
  await withDocument({getElementById:id=>id==='embedded-volume-data'?{textContent:raw}:null},async()=>{
    assert.equal((await loadChartReplayArchive('BTCUSD',{now,fetchImpl})).observations.length,payload.bars.length);
  });
  await withDocument({getElementById:id=>id==='embedded-volume-data'?{textContent:''}:null},async()=>{
    await assert.rejects(loadChartReplayArchive('BTCUSD',{now,fetchImpl}),SyntaxError);
  });
  assert.equal(fetches,0);
});

test('archive HTTP errors, invalid UTF-8 and declared oversized bodies fail explicitly',async()=>{
  await assert.rejects(loadChartReplayArchive('BTCUSD',{fetchImpl:async()=>new Response('',{status:503})}),/503/);
  await assert.rejects(loadChartReplayArchive('BTCUSD',{fetchImpl:async()=>new Response('',{headers:{'content-length':'16000001'}})}),/byte limit/);
  await assert.rejects(loadChartReplayArchive('BTCUSD',{fetchImpl:async()=>new Response(new Uint8Array([0xc3,0x28]))}),TypeError);
  await assert.rejects(loadChartReplayArchive('BTCUSD',{mode:'unvalidated-mode'}),/supported/);
});

test('undeclared oversized streams are stopped before their entire body is read',async()=>{
  let produced=0,complete=false,aborted=false;
  const fetchImpl=async(_url,{signal})=>{
    let source;
    const abort=()=>{aborted=true;source.error(signal.reason);};
    return new Response(new ReadableStream({
      start(controller){source=controller;signal.addEventListener('abort',abort,{once:true});},
      async pull(controller){
        await new Promise(resolve=>setTimeout(resolve,0));if(signal.aborted)return;
        if(produced>=64000000){complete=true;signal.removeEventListener('abort',abort);controller.close();return;}
        controller.enqueue(new Uint8Array(1000000));produced+=1000000;
      },
      cancel(){signal.removeEventListener('abort',abort);},
    }));
  };
  await assert.rejects(loadChartReplayArchive('BTCUSD',{fetchImpl}),/byte limit/);
  assert.equal(aborted,true);assert.equal(complete,false);assert.ok(produced<64000000);
});

test('caller abort and timeout settle archive requests even when an injected fetch ignores cancellation',async()=>{
  const before=new AbortController();before.abort(new Error('cancel before fetch'));let calls=0;
  await assert.rejects(loadChartReplayArchive('BTCUSD',{signal:before.signal,fetchImpl:async()=>{calls++;return new Response(raw);}}),/cancel before/);
  assert.equal(calls,0);
  const owner=new AbortController();let started;
  const requested=new Promise(resolve=>{started=resolve;});
  const pending=loadChartReplayArchive('BTCUSD',{signal:owner.signal,fetchImpl:async()=>{started();return new Promise(()=>{});}});
  await requested;owner.abort(new Error('cancel active fetch'));
  await assert.rejects(pending,/cancel active/);
  await assert.rejects(loadChartReplayArchive('BTCUSD',{timeoutMs:5,fetchImpl:async()=>new Promise(()=>{})}),error=>error.name==='TimeoutError');
});

test('BTC issued-record loading verifies the real indexed record and snapshot as a pair',async()=>{
  const calls=[],value=await loadChartReplayRecord('BTCUSD',{baseUrl:'https://example.test/app/',fetchImpl:fixtureFetch(new Map(),calls)});
  assert.equal(value.record.id,baseEntry.id);assert.equal(value.snapshot.id,baseEntry.snapshotId);
  assert.equal(value.record.outputHash,savedRecord.outputHash);assert.deepEqual(value.snapshot.prices,savedSnapshot.prices);
  assert.equal(calls.length,3);assert.ok(calls.every(call=>call.options.credentials==='omit'&&call.options.redirect==='error'));
  await assert.rejects(loadChartReplayRecord('BTCUSD',{recordId:'f'.repeat(64),baseUrl:'https://example.test/app/',fetchImpl:fixtureFetch()}),/보존 예측/);
  await assert.rejects(loadChartReplayRecord('BTCUSD',{recordId:''}),/valid record identity/);
});

test('a correctly addressed record with inconsistent benchmark inputs is rejected by the source loader',async()=>{
  const invalid=structuredClone(savedRecord);invalid.benchmarks.anchorPrice*=2;
  const {id,...body}=invalid;invalid.id=await forecastHash(body);
  await verifyForecastRecord(invalid);
  const entry=forecastIndexEntry(invalid),index={...btcIndex,entries:[entry]};
  const overrides=new Map([
    ['forecast-ledger/index.json',JSON.stringify(index)],
    ['forecast-ledger/'+entry.recordPath,JSON.stringify(invalid)],
  ]);
  await assert.rejects(loadChartReplayRecord('BTCUSD',{baseUrl:'https://example.test/app/',fetchImpl:fixtureFetch(overrides)}),/benchmark inputs mismatch/);
});

test('indexed record or snapshot tampering is never returned as a verified replay record',async()=>{
  const record=structuredClone(savedRecord);record.output.path[1][1]*=2;
  await assert.rejects(loadChartReplayRecord('BTCUSD',{recordId:baseEntry.id,baseUrl:'https://example.test/app/',
    fetchImpl:fixtureFetch(new Map([['forecast-ledger/'+baseEntry.recordPath,JSON.stringify(record)]]))}),/hash mismatch/);
  const snapshot=structuredClone(savedSnapshot);snapshot.prices[0][1]*=2;
  await assert.rejects(loadChartReplayRecord('BTCUSD',{recordId:baseEntry.id,baseUrl:'https://example.test/app/',
    fetchImpl:fixtureFetch(new Map([['forecast-ledger/'+baseEntry.snapshotPath,JSON.stringify(snapshot)]]))}),/hash mismatch/);
});

test('ETH record loader returns the verified real asset pair and honors the same timeout boundary',async()=>{
  const value=await loadChartReplayRecord('ETHUSD',{baseUrl:'https://example.test/app/',fetchImpl:fixtureFetch()});
  assert.equal(value.record.symbol,'ETHUSD');assert.equal(value.record.snapshotId,value.snapshot.id);
  assert.equal(value.record.scenario.id,'base');assert.ok(value.entries.every(row=>row.symbol==='ETHUSD'));
  for(const symbol of ['BTCUSD','ETHUSD'])await assert.rejects(loadChartReplayRecord(symbol,{baseUrl:'https://example.test/app/',timeoutMs:10,
    fetchImpl:async()=>new Promise(()=>{})}),error=>error.name==='TimeoutError');
});
