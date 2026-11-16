import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAtlasBtcDatafeed,ATLAS_BTC_SYMBOL} from '../spikes/funnest-p2a0/atlas-datafeed.mjs';
import {volumeCoverage} from '../dist/volume-data.js';

const snapshot = JSON.parse(await readFile(new URL('../dist/data/btc-volume.json',import.meta.url),'utf8'));
const now = () => Date.parse(snapshot.retrievedAt)+86400000;
const expected = row => ({time:row.time*1000,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume});
const first = snapshot.bars[0].time*1000,last = snapshot.bars.at(-1).time*1000;
function fixture(payload=snapshot) {
  let loads = 0; const events = [];
  const adapter = createAtlasBtcDatafeed({loadSnapshot:async()=>{loads++;return payload;},now,onEvent:event=>events.push(event)});
  return {...adapter,events,get loads(){return loads;}};
}
function subset(rows) {
  const coverage = volumeCoverage(rows);
  return {...snapshot,bars:rows,coverage,firstDate:coverage.firstDate,lastDate:coverage.lastDate};
}

test('the shipped native daily archive retains every OHLCV value and converts seconds to UTC milliseconds exactly',async()=>{
  const f=fixture(),info=await f.datafeed.resolveSymbol('BTCUSD');
  const result=await f.datafeed.getBars(info,'1D',{from:0,to:now(),countBack:10000});
  assert.deepEqual(result.bars,snapshot.bars.map(expected));
  assert.equal(result.bars.length,5560);assert.equal(result.noMoreData,true);
  assert.equal(result.bars.filter(bar=>bar.volume===0).length,33);
  assert.equal(result.bars[0].time,Date.parse('2011-08-18T00:00:00Z'));
  assert.equal(result.bars.at(-1).time,Date.parse('2026-11-06T00:00:00Z'));
  const p=f.inspect().provenance;
  assert.equal(p.source,'Bitstamp');assert.equal(p.priceCurrency,'USD');assert.equal(p.volumeUnit,'BTC');
  assert.equal(p.volumeScope,'single-exchange-spot-pair');assert.equal(p.globalMarketVolume,false);
  assert.equal(p.realtime,false);assert.equal(p.imputedBars,0);assert.equal(p.gapCount,0);
  assert.equal(p.retrievedAt,snapshot.retrievedAt);assert.deepEqual(p.sourceUrls,snapshot.sourceUrls);
});

test('concurrent first requests share one lazy snapshot load and expose copied inspection metadata',async()=>{
  const f=fixture();assert.equal(f.loads,0);assert.equal(f.inspect().status,'idle');
  const info=await f.datafeed.resolveSymbol('BTCUSD');
  await f.datafeed.searchSymbols('비트코인');assert.equal(f.loads,0);
  const [bars,sparkline]=await Promise.all([
    f.datafeed.getBars(info,'1D',{from:last,to:now(),countBack:2}),f.datafeed.getSparkline('BTCUSD'),
  ]);
  assert.equal(f.loads,1);assert.equal(f.inspect().status,'ready');
  assert.equal(f.events.filter(event=>event.type==='snapshot-ready').length,1);
  assert.deepEqual(sparkline,snapshot.bars.slice(-60).map(bar=>bar.close));
  const view=f.inspect();view.provenance.sourceUrls.length=0;view.calls.getBars=100;
  assert.equal(f.inspect().calls.getBars,1);assert.equal(f.inspect().provenance.sourceUrls.length,snapshot.sourceUrls.length);
  bars.bars[0].open=1;sparkline[0]=1;
  assert.deepEqual((await f.datafeed.getBars(info,'1D',{from:last,to:now(),countBack:2})).bars,snapshot.bars.slice(-2).map(expected));
});

test('countBack precedes from while the inclusive to boundary and older-history flag follow actual rows',async()=>{
  const f=fixture(),info=await f.datafeed.resolveSymbol('BTCUSD');
  const to=snapshot.bars[4].time*1000;
  const page=await f.datafeed.getBars(info,'1D',{from:to,to,countBack:3});
  assert.deepEqual(page.bars,snapshot.bars.slice(2,5).map(expected));assert.equal(page.noMoreData,false);
  const older=await f.datafeed.getBars(info,'1D',{from:0,to:page.bars[0].time-1,countBack:3});
  assert.deepEqual(older.bars,snapshot.bars.slice(0,2).map(expected));assert.equal(older.noMoreData,true);
  const oldest=await f.datafeed.getBars(info,'1D',{from:0,to:first-1,countBack:3});
  assert.deepEqual(oldest,{bars:[],noMoreData:true});
});

test('range-only requests do not extrapolate outside saved dates or fill missing days',async()=>{
  const rows=[snapshot.bars[0],snapshot.bars[2]],f=fixture(subset(rows));
  const info=await f.datafeed.resolveSymbol('BTCUSD');
  assert.deepEqual((await f.datafeed.getBars(info,'1D',{from:0,to:now()})).bars,rows.map(expected));
  const gap=snapshot.bars[1].time*1000;
  assert.deepEqual(await f.datafeed.getBars(info,'1D',{from:gap,to:gap}),{bars:[],noMoreData:false});
  assert.deepEqual(await f.datafeed.getBars(info,'1D',{from:last+86400000,to:now()}),{bars:[],noMoreData:false});
  assert.deepEqual(await f.datafeed.getBars(info,'1D',{from:0,to:first-1}),{bars:[],noMoreData:true});
  assert.equal(f.inspect().provenance.gapCount,1);assert.equal(f.inspect().provenance.imputedBars,0);
});

test('symbol search is real BTC metadata in Korean or English with no invented assets or live quote',async()=>{
  const f=fixture();
  for(const query of ['','BTC','btc/usd','비트코인','bitcoin','Bitstamp']){
    const results=await f.datafeed.searchSymbols(query);assert.equal(results.length,1,query);
    assert.equal(results[0].symbol,'BTCUSD');assert.equal(results[0].timezone,'UTC');
    assert.deepEqual(results[0].supportedResolutions,['1D']);
    assert.equal('price' in results[0],false);assert.equal('changePercent' in results[0],false);
  }
  assert.deepEqual(await f.datafeed.searchSymbols('ETH'),[]);
  assert.deepEqual(await f.datafeed.searchSymbols('MSTR'),[]);
  const changed=await f.datafeed.resolveSymbol('BTCUSD');changed.supportedResolutions.push('1');
  assert.deepEqual((await f.datafeed.resolveSymbol('BTCUSD')).supportedResolutions,['1D']);
  assert.equal(f.datafeed.subscribeQuotes,undefined);assert.equal(f.loads,0);
  assert.deepEqual(ATLAS_BTC_SYMBOL.supportedResolutions,['1D']);
});

test('unsupported symbols and resolutions fail before fetching data',async()=>{
  const f=fixture(),info=await f.datafeed.resolveSymbol('BTCUSD');
  await assert.rejects(f.datafeed.resolveSymbol('ETHUSD'),/BTCUSD only/);
  await assert.rejects(f.datafeed.getSparkline('MSTR'),/BTCUSD only/);
  await assert.rejects(f.datafeed.getBars({symbol:'ETHUSD'},'1D',{from:0,to:now()}),/BTCUSD only/);
  for(const resolution of ['1','60','1W','daily']){
    await assert.rejects(f.datafeed.getBars(info,resolution,{from:0,to:now()}),/native 1D/);
    assert.throws(()=>f.datafeed.subscribeBars(info,resolution,()=>{}),/native 1D/);
  }
  assert.equal(f.loads,0);
});

test('invalid request bounds and countBack are rejected rather than coerced',async()=>{
  const f=fixture(),info=await f.datafeed.resolveSymbol('BTCUSD');
  for(const request of [null,{from:NaN,to:now()},{from:0,to:Infinity},{from:1,to:0},
    {from:0,to:1.5},{from:0,to:now(),countBack:0},{from:0,to:now(),countBack:-1},
    {from:0,to:now(),countBack:2.5},{from:0,to:now(),countBack:'3'}]){
    await assert.rejects(f.datafeed.getBars(info,'1D',request),/BarsRequest|countBack/);
  }
  assert.equal(f.loads,0);
});

test('static subscription returns idempotent cleanup and never fabricates a bar, reset, or live connection',async()=>{
  const f=fixture(),info=await f.datafeed.resolveSymbol('BTCUSD'),calls=[];
  const close=f.datafeed.subscribeBars(info,'1D',value=>calls.push(value),()=>calls.push('reset'),value=>calls.push(value));
  assert.equal(f.inspect().activeSubscriptions,1);assert.equal(typeof close,'function');
  await Promise.resolve();close();close();
  assert.deepEqual(calls,[]);assert.equal(f.inspect().activeSubscriptions,0);
  assert.equal(f.inspect().calls.unsubscribeBars,1);assert.equal(f.loads,0);
});

test('malformed snapshot metadata and OHLC fail through the unchanged Atlas parser',async()=>{
  for(const change of [
    payload=>payload.source='Coinbase Exchange',payload=>payload.bars[0].time*=1000,
    payload=>payload.bars[0].high=0,payload=>payload.bars[0].volume=-1,
    payload=>payload.globalMarketVolume=true,payload=>payload.completedOnly=false,
    payload=>payload.retrievedAt='2030-01-01T00:00:00Z',
  ]){
    const payload=structuredClone(snapshot);change(payload);
    const f=fixture(payload),info=await f.datafeed.resolveSymbol('BTCUSD');
    await assert.rejects(f.datafeed.getBars(info,'1D',{from:0,to:now()}));
    assert.equal(f.inspect().status,'error');assert.equal(f.inspect().provenance,null);
  }
});

test('failed snapshot loading stays an explicit error and never returns a passing empty series',async()=>{
  let loads=0;const events=[];
  const f=createAtlasBtcDatafeed({loadSnapshot:async()=>{loads++;throw new Error('HTTP 503');},now,onEvent:event=>events.push(event)});
  const info=await f.datafeed.resolveSymbol('BTCUSD');
  await assert.rejects(f.datafeed.getBars(info,'1D',{from:0,to:now()}),/HTTP 503/);
  await assert.rejects(f.datafeed.getSparkline('BTCUSD'),/HTTP 503/);
  assert.equal(loads,1);assert.equal(f.inspect().status,'error');assert.equal(f.inspect().error,'HTTP 503');
  assert.equal(f.inspect().lastBarsRequest,null);assert.equal(f.inspect().provenance,null);
  assert.deepEqual(events,[{type:'snapshot-error',message:'HTTP 503'}]);
});
