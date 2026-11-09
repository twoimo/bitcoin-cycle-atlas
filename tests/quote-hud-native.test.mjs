import assert from 'node:assert/strict';
import test from 'node:test';
import {ethPayload,ethViewFixture} from './helpers/eth-view-fixture.mjs';
import {equityPayload,equityViewFixture} from './helpers/equity-view-fixture.mjs';

const lastQuote=f=>f.hudUpdates.at(-1);
const observed=(row,extra={})=>({...row,price:row.close,kind:'observed',changePct:1.25,hovered:false,...extra});
async function loadedEth(){
  const f=await ethViewFixture({query:'&forecast=off'}),payload=ethPayload();
  payload.dailyHistory.candles.forEach((row,index)=>Object.assign(row,{open:100+index,low:99+index,high:103+index,close:102+index}));
  f.reply(0,payload);await f.settle();await f.initialization;return f;
}
async function loadedEquity(symbol){
  const f=await equityViewFixture(symbol);f.reply(0,equityPayload(symbol,1));await f.microtasks();
  f.reply(1,{revision:1});await f.settle();await f.initialization;return f;
}
function ids(f,prefix){
  assert.equal(f.hudMounts.length,1);
  assert.equal(f.hudMounts[0].host,f.app.querySelector('.eth-readout'));
  assert.deepEqual({...f.hudMounts[0].options.ids},{interval:`${prefix}-readout-interval`,price:`${prefix}-price`,change:`${prefix}-change`,kind:`${prefix}-kind`,time:`${prefix}-bar-time`,detail:`${prefix}-ohlc`});
}

// The complete native initializers own these onHover callbacks. The shared HUD
// DOM itself has its own parsed-DOM tests; this boundary records its real input.
test('ETH common HUD uses actual close/change/RSI and preserves selected time through hover and redraw',async()=>{
  const f=await loadedEth();ids(f,'eth');const latest=f.latest(),row=latest.series.candles.at(-1),before=structuredClone(latest.series.candles);
  latest.onHover(observed(row));const quote=lastQuote(f);
  assert.equal(quote.symbol,'ETHUSD');assert.equal(quote.name,'이더리움');assert.equal(quote.interval,'1D');
  assert.equal(quote.priceText,'$154.00');assert.equal(quote.changePct,1.25);assert.equal(quote.changeText,'+1.25%');assert.equal(quote.rsi,100);
  assert.equal(quote.dateTime,row.date);assert.equal(quote.timezone,'UTC');assert.equal(quote.source,'Coinbase');
  assert.match(quote.sourceDescription,/ETH-USD.*USD/);assert.match(quote.detailText,/O 152.00.*H 155.00.*L 151.00.*C 154.00/);
  latest.onHover(observed(latest.series.candles[20],{hovered:true}));f.resize();await f.frame();
  assert.equal(f.latest().selectedTime,row.time,'pointer preview never changes the persisted selected candle');
  assert.deepEqual(f.latest().series.candles,before,'the HUD does not change source observations');
  f.app.querySelector('.eth-plot').clientHeight=200;f.resize();await f.frame();assert.equal(f.latest().headerInset,56);
});

test('ETH exact-time, intraday, future and missing readouts do not borrow a nearby observed RSI',async()=>{
  const f=await loadedEth(),row=f.latest().series.candles.at(-1);
  f.latest().onHover(observed({...row,time:row.time+1}));assert.equal(lastQuote(f).rsi,null);assert.match(lastQuote(f).rsiReason,/일치/);
  f.latest().onHover({kind:'forecast',time:row.time,date:'2030-01-01T00:00:00Z',price:200,low:150,high:250,source:'모형 예시 1개',changePct:99,hovered:true});
  let quote=lastQuote(f);assert.equal(quote.priceText,'$200.00');assert.equal(quote.kindLabel,'모형 예시');assert.equal(quote.source,'모형');assert.match(quote.sourceDescription,/모형 예시 1개.*관측 기초 Coinbase/);assert.equal(quote.rsi,null);assert.equal(quote.changePct,null);
  assert.match(quote.detailText,/모의 10–90%.*150.00.*250.00.*미래 OHLC 아님/);
  f.latest().onHover({kind:'unavailable',date:row.date,time:row.time,close:999,changePct:99});quote=lastQuote(f);
  assert.equal(quote.priceText,'—');assert.equal(quote.dateTime,'');assert.equal(quote.rsi,null);assert.equal(quote.changePct,null);
  f.interval('1h');await f.settle();const hourly=f.latest().series.candles.at(-1);
  f.latest().onHover(observed(hourly));quote=lastQuote(f);assert.equal(quote.interval,'1h');assert.equal(quote.dateTime,hourly.date);
  assert.equal(quote.timestampText,`${hourly.date.slice(0,16).replaceAll('-','.').replace('T',' ')} UTC`);
});

for(const symbol of ['MSTR','BMNR'])test(`${symbol} common HUD retains NY session labels, short-history RSI and simulated-bar details`,async()=>{
  const f=await loadedEquity(symbol);ids(f,'equity');const series=f.latest().series,row=series.candles.at(-1),before=structuredClone(series.candles);
  f.latest().onHover(observed(row,{changePct:-2.5}));let quote=lastQuote(f);
  assert.equal(quote.symbol,symbol);assert.equal(quote.name,symbol==='MSTR'?'스트래티지':'비트마인');assert.equal(quote.interval,'1D');assert.equal(quote.priceText,'$102.00');
  assert.equal(quote.changePct,-2.5);assert.equal(quote.changeText,'−2.50%');assert.equal(quote.rsi,null);assert.match(quote.rsiReason,/이전 관측 봉이 부족/);
  assert.equal(quote.dateTime,row.date,'synthetic UTC midnight still identifies the same NY trading session');assert.equal(quote.timezone,'America/New_York');
  assert.equal(quote.source,'Yahoo Finance');assert.match(quote.sourceDescription,/분할 조정 OHLC/);assert.match(quote.detailText,/O \$101.00.*C \$102.00/);
  f.latest().onHover(observed(series.candles[0],{hovered:true}));f.pan({...f.latest().range});await f.frame();assert.equal(f.latest().selectedTime,row.time);
  assert.deepEqual(f.latest().series.candles,before);
  f.interval('weekly');await f.settle();const weekly=f.latest().series.candles[0],weeklyHover=observed(weekly,{changePct:null});
  delete weeklyHover.lastSessionDate;f.latest().onHover(weeklyHover);quote=lastQuote(f);
  assert.equal(quote.interval,'1W');assert.equal(quote.dateTime,weekly.lastSessionDate,'the actual hover shape resolves the close session from its exact Monday key');assert.equal(quote.changePct,null);
  assert.match(quote.description,new RegExp(`주봉 시작 ${weekly.date.slice(0,10)}`));
  f.pan({...f.latest().range});await f.frame();assert.equal(f.latest().selectedTime,weekly.time,'the Friday quote clock does not change the weekly navigation key');
  const candle={startDate:'2030-01-01',endDate:'2030-01-04',open:100,high:220,low:90,close:200};
  f.latest().onHover({kind:'forecast',time:weekly.time,date:'2030-01-01T00:00:00Z',price:200,low:150,high:250,candle,source:'조건부 시나리오',hovered:false,changePct:99});quote=lastQuote(f);
  assert.equal(quote.kindLabel,'모의 경로봉');assert.equal(quote.source,'모형');assert.match(quote.sourceDescription,/조건부 시나리오.*관측 기초.*Yahoo Finance/);assert.equal(quote.dateTime,candle.endDate);assert.equal(quote.priceText,'$200.00');assert.equal(quote.rsi,null);assert.equal(quote.changePct,null);
  assert.match(quote.detailText,/2030-01-01 – 2030-01-04.*시작 \$100.00.*최고 \$220.00.*최저 \$90.00.*끝 \$200.00.*조건 범위 \$150.00 – \$250.00.*simulated values/);
  f.latest().onHover({kind:'forecast',time:weekly.time,date:'2030-01-01T00:00:00Z',price:0,low:0,high:100,interpolated:true,interpolation:{unavailableBounds:['low']},hovered:true});quote=lastQuote(f);
  assert.equal(quote.priceText,'$0.00');assert.equal(quote.kindLabel,'조건부 가정 · 보간');assert.match(quote.detailText,/로그축 0 경계 · 선형축에서 확인/);
  f.app.querySelector('.equity-plot').clientHeight=200;f.pan({...f.latest().range});await f.frame();assert.equal(f.latest().headerInset,56);
});

for(const symbol of ['ETHUSD','MSTR','BMNR'])test(`${symbol} loading and failure keep quote slots present with unknown time and values`,async()=>{
  const f=symbol==='ETHUSD'?await ethViewFixture():await equityViewFixture(symbol);
  let quote=lastQuote(f);assert.equal(quote.symbol,symbol);assert.equal(quote.kind,'unavailable');assert.equal(quote.priceText,'—');assert.equal(quote.dateTime,'');assert.equal(quote.changePct,null);assert.equal(quote.rsi,null);
  f.reject(0);await f.settle();await f.initialization;quote=lastQuote(f);
  assert.equal(f.app.querySelector('.eth-readout').hidden,false);assert.equal(quote.priceText,'—');assert.equal(quote.dateTime,'');assert.equal(quote.rsi,null);
});
