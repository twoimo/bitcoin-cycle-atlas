import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountQuoteHud,quoteTimestamp} from '../dist/ui/quote-hud.js';
import {quoteRsiAt} from '../dist/ui/quote-rsi.js';
import {calculateRsiSeries} from '../dist/market-lab-math.js';

function fixture(){const {document}=parseHTML('<html><body><div id="hud" aria-live="polite"></div></body></html>');const host=document.querySelector('#hud');return {host,hud:mountQuoteHud(host,{ids:{price:'legacy-price',time:'legacy-time',detail:'legacy-detail'}}),field:name=>host.querySelector(`[data-quote-field="${name}"]`)};}
const observed={symbol:'BTCUSD',name:'비트코인',fullName:'비트코인 / 미국 달러',interval:'1D',kind:'observed',priceText:'$74,967.72',changePct:-1,dateTime:'2026-11-08',timezone:'UTC',rsi:33.5,source:'Coin Metrics',sourceDescription:'Coin Metrics · UTC 일말 가격 · 공개 원자료',detailText:'O $75,000 · C $74,967.72'};

test('all six instruments use permanent fields and two identical rows through observed and missing states',()=>{
  const {host,hud,field}=fixture(),nodes=[...host.querySelectorAll('[data-quote-field]')];
  for(const symbol of ['BTCUSD','ETHUSD','MSTR','TQQQ','SOXL','233740']){
    hud.update({...observed,symbol,name:symbol,fullName:`${symbol} 전체 종목명`,priceText:symbol==='233740'?'₩4,990':observed.priceText});
    assert.equal(host.querySelectorAll(':scope > .quote-hud-row').length,2);
    assert.equal(host.dataset.symbol,symbol);assert.equal(field('name').getAttribute('aria-label'),`${symbol} 전체 종목명`);
    assert.equal(field('price').id,'legacy-price');assert.equal(field('time').id,'legacy-time');assert.equal(field('detail').id,'legacy-detail');
    assert.equal(field('source').textContent,'Coin Metrics');assert.equal(field('time').textContent,'2026.11.08 UTC');assert.match(field('rsi').textContent,/33\.5/);
    hud.update({symbol,name:symbol,interval:'1D',kind:'unavailable',priceText:'stale',changePct:9,rsi:99});
    assert.equal(field('price').textContent,'—');assert.equal(field('change').textContent,'전봉 —');assert.equal(field('time').textContent,'—');assert.equal(field('rsi').textContent,'RSI14—');
    assert.deepEqual([...host.querySelectorAll('[data-quote-field]')],nodes,'updates must not replace or reorder slots');
  }
  assert.equal(host.hasAttribute('aria-live'),false,'pointer inspection must not create repeated live announcements');
});

test('valid zeroes, future assumptions, source visibility and full details remain explicit',()=>{
  const {host,hud,field}=fixture();
  hud.update({...observed,changePct:0,rsi:0,sourceVisible:false});
  assert.equal(field('change').textContent,'전봉 0.0%');assert.equal(field('rsi').textContent,'RSI140.0');
  assert.equal(field('source').style.visibility,'hidden');assert.equal(field('source').getAttribute('aria-hidden'),'true');
  hud.update({...observed,sourceVisible:undefined});assert.equal(field('source').style.visibility,'hidden','saved source setting survives a quote update');
  for(const kind of ['forecast','simulated']){
    hud.update({...observed,kind,priceText:'$100,000',dateTime:'2030-01-01',sourceVisible:true});
    assert.equal(field('kind').textContent,'가정');assert.equal(field('price').textContent,'$100,000');
    assert.equal(field('change').textContent,'전봉 —');assert.equal(field('rsi').textContent,'RSI14—');
    assert.match(field('time').getAttribute('aria-label'),/^가정 시각/);assert.equal(field('source').style.visibility,'');
  }
  assert.match(field('source').title,/공개 원자료/);assert.match(field('detail').textContent,/O \$75,000/);
  assert.match(field('source').getAttribute('aria-label'),/가격 출처 Coin Metrics · UTC 일말 가격 · 공개 원자료/);
  hud.destroy();assert.equal(host.children.length,0);
});

test('compact presentation retains full source, clock, units and forecast identity in permanent fields',()=>{
  const {host,hud,field}=fixture();
  hud.update({...observed,interval:'15m',dateTime:'2026-11-09T12:30:00Z',source:'Coinbase',sourceDescription:'Coinbase Exchange · BTC-USD · USD 현물',description:'실제 OHLC · 12.34 BTC · 수집 시각 보존'});
  assert.equal(host.dataset.quoteIntraday,'true');assert.equal(field('time').textContent,'2026.11.09 12:30 UTC');
  assert.equal(field('source').textContent,'Coinbase');assert.equal(field('source').getAttribute('aria-label'),'가격 출처 Coinbase Exchange · BTC-USD · USD 현물');
  assert.equal(field('source').getAttribute('aria-hidden'),'false','narrow layout may visually hide source but must keep its full accessible text');
  assert.equal(field('price').textContent,'$74,967.72');assert.equal(host.title,'실제 OHLC · 12.34 BTC · 수집 시각 보존');
  hud.update({...observed,symbol:'HYPE',name:'하이퍼리퀴드',priceText:'41.68 USDC'});
  assert.equal(host.dataset.quoteIntraday,'false');assert.equal(field('name').textContent,'하이퍼리퀴드');assert.equal(field('price').textContent,'41.68 USDC');
  hud.update({...observed,kind:'forecast'});
  assert.equal(host.dataset.quoteState,'assumption');assert.equal(field('kind').textContent,'가정');
  assert.equal(host.querySelectorAll(':scope > .quote-hud-row').length,2);
});

test('source calendar labels retain their literal session date and intraday UTC time',()=>{
  assert.equal(quoteTimestamp('2026-11-06T00:00:00Z',{timezone:'America/New_York'}),'2026.11.06 NY');
  assert.equal(quoteTimestamp('2026-11-09T12:30:00Z',{timezone:'UTC',intraday:true}),'2026.11.09 12:30 UTC');
  assert.equal(quoteTimestamp('2026-11-02',{timezone:'Asia/Seoul'}),'2026.11.02 KST');
  assert.equal(quoteTimestamp(null),'—');
});

const prices=Array.from({length:35},(_,index)=>[new Date(Date.UTC(2026,0,1+index)).toISOString().slice(0,10),100+index*.7+Math.sin(index)*5]);
test('native intraday and daily quotes reuse canonical RSI with exact original keys and immutable source rows',()=>{
  const expected=calculateRsiSeries(prices,14,9),bars=prices.map(([date,close],index)=>({time:1767225600+index*60,date:new Date((1767225600+index*60)*1000).toISOString(),close}));
  const before=structuredClone(bars);
  for(let index=0;index<prices.length;index++){
    assert.equal(quoteRsiAt(prices,prices[index][0]).value,expected[index].rsi);
    assert.equal(quoteRsiAt(bars,bars[index].time).value,expected[index].rsi);
    assert.equal(quoteRsiAt(bars,{date:bars[index].date}).value,expected[index].rsi);
  }
  assert.deepEqual(bars,before);
  assert.equal(quoteRsiAt(bars,'2026-01-01').value,null,'a date-only query cannot choose an intraday bar');
  assert.equal(quoteRsiAt(bars,bars[20].time+1).value,null,'no nearest-point substitution');
  assert.equal(quoteRsiAt(bars,bars.at(-1).time,{kind:'forecast'}).value,null);
  assert.equal(quoteRsiAt(bars,bars.at(-1).time,{kind:'simulated'}).value,null);
  assert.match(quoteRsiAt(prices,prices[0][0]).reason,/이전 관측 봉/);
});

test('different providers and sampling periods retain their own Wilder seeds and unavailable states',()=>{
  const exchange=prices.map(([date,close],index)=>[date,close+index%3*30]);
  const weeks=prices.filter((_,index)=>index%7===6),date=prices.at(-1)[0];
  assert.equal(quoteRsiAt(exchange,date).value,calculateRsiSeries(exchange,14,9).at(-1).rsi);
  assert.notEqual(quoteRsiAt(exchange,date).value,quoteRsiAt(prices,date).value);
  assert.equal(quoteRsiAt(weeks,date).value,null,'daily history must not warm up a weekly RSI');
  assert.equal(quoteRsiAt([['2026-01-01',0]],'2026-01-01').value,null);
  assert.match(quoteRsiAt([...prices].reverse(),date).reason,/오름차순/);
  assert.match(quoteRsiAt([prices[0],prices[0]],prices[0][0]).reason,/중복/);
  const overLimit=Array.from({length:25001},()=>prices[0]);
  assert.match(quoteRsiAt(overLimit,prices[0][0]).reason,/25,000/,'never silently truncate the original Wilder seed');
});
