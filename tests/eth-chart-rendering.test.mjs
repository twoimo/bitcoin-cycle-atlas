import {buildEthereumPooledForecast} from '../dist/ethereum-pooled-model.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drawIntradayChart } from '../dist/intraday-chart.js';
import { CHART_INTERVALS } from '../dist/ohlc-data.js';
import {readFile} from 'node:fs/promises';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {equityForecastRows,equityForecastWindowRows} from '../dist/equity-forecast-chart.js';
import {buildEthereumAdaptiveForecast} from '../dist/ethereum-adaptive-model.js';
import {buildEthereumForecasts} from '../dist/ethereum-forecast.js';
import {ethHistoryRange} from '../dist/eth-view-state.js';

class SvgNode {
  constructor(){this.attrs=new Map();this.nodes=new Map();this.dataset={};this.textContent='';}
  setAttribute(key,value){this.attrs.set(key,String(value));}
  removeAttribute(key){this.attrs.delete(key);}
  getAttribute(key){return this.attrs.get(key);}
  querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new SvgNode());return this.nodes.get(selector);}
  querySelectorAll(){return [];}
  focus(){}
}
function svgFixture(width=1100,height=450){
  const svg=new SvgNode();
  Object.assign(svg,{id:'eth-render-test',clientWidth:width,clientHeight:height,innerHTML:'',parentElement:{style:{setProperty(){}}}});
  svg.getBoundingClientRect=()=>({left:0,top:0,width,height});
  return svg;
}
const start=Date.parse('2022-01-03T00:00:00Z')/1000;
const candle=(index,seconds=86400)=>({time:start+index*seconds,date:new Date((start+index*seconds)*1000).toISOString(),open:2000+index%70,high:2040+index%70,low:1980+index%70,close:2020+index%70,volume:100+index%90});
const series=(candles,interval='daily',extra={})=>({interval,source:'Coinbase Exchange',product:'ETH-USD',retrievedAt:'2026-10-24T00:00:00.000Z',candles,gapCount:0,...extra});
const ticks=svg=>[...svg.innerHTML.matchAll(/class="market-time-label"[^>]*>([^<]+)<\/text>/g)].map(match=>match[1]);

test('ETH line and candle views identify the same observed OHLC across every supported interval',()=>{
  for(const interval of CHART_INTERVALS)for(const chartType of ['line','candles']){
    const rows=Array.from({length:4},(_,i)=>candle(i,interval.seconds)),svg=svgFixture();
    let hovered,inspected;
    const controller=drawIntradayChart({svg,series:series(rows,interval.id),chartType,showVolume:false,onHover:value=>{hovered=value;},onInspect:value=>{inspected=value;}});
    controller.selectDate(rows[1].date);
    assert.equal(svg.dataset.product,'ETH-USD');
    assert.equal(svg.dataset.observedCandleCount,'4');
    assert.match(svg.innerHTML,/<title>Coinbase Exchange ETH-USD/);
    assert.doesNotMatch(svg.innerHTML,/BTC|volume-pane|volume-projection|forecast|cycle-marker/);
    assert.equal(hovered.product,'ETH-USD');
    assert.equal(hovered.volumeUnit,'ETH');
    assert.equal(hovered.kind,'observed');
    assert.equal(hovered.completed,true);
    for(const key of ['time','open','high','low','close','volume'])assert.equal(hovered[key],rows[1][key]);
    assert.equal(inspected.product,'ETH-USD');
    assert.equal(inspected.kind,'observed');
    assert.ok(inspected.fields.some(field=>field.label==='거래량 · ETH'));
    assert.ok(inspected.fields.some(field=>field.label==='출처'&&field.value==='Coinbase Exchange · ETH-USD'));
    assert.doesNotMatch(controller.getSelection().copyText,/BTC|조건부|예측/);
  }
});

test('current ETH conditional paths preserve real OHLC and render future prices as lines at desktop and mobile widths',async()=>{
  const archive=JSON.parse(await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8'));
  const daily=parseEthArchive(archive),asOf=daily.lastDate.slice(0,10);
  const forecast=buildEthereumForecasts({ethHistory:archive,asOf}).forecasts.base;
  for(const interval of ['daily','weekly'])for(const width of [320,768,1440]){
    const actual=parseEthArchive(archive,interval),original=structuredClone(actual.candles),svg=svgFixture(width,600);
    let hovered;
    const range=ethHistoryRange(actual,'4y',null,forecast.displayEnd);
    const controller=drawIntradayChart({svg,series:actual,range,forecast,chartType:'candles',showVolume:false,onHover:value=>{hovered=value;}});
    const selected=original.at(-1);controller.selectDate(selected.date);
    assert.equal(hovered.kind,'observed');assert.equal(hovered.completed,true);
    for(const key of ['time','open','high','low','close','volume'])assert.equal(hovered[key],selected[key]);
    controller.selectDate(`${forecast.path[5].date}T00:00:00Z`);
    assert.equal(hovered.kind,'forecast');assert.equal(hovered.completed,false);
    assert.equal(hovered.price,forecast.path[5].price);
    assert.equal(svg.dataset.forecastCandleCount,'0');
    assert.match(svg.innerHTML,/equity-forecast-line/);
    assert.doesNotMatch(svg.innerHTML,/class="equity-forecast-candle"|NaN|Infinity/);
    assert.deepEqual(actual.candles,original);
  }
});

test('multiyear daily and weekly ETH charts show years on desktop and mobile without losing source selection',()=>{
  for(const interval of [{id:'daily',seconds:86400,count:1461},{id:'weekly',seconds:604800,count:209}])for(const width of [360,1100]){
    const rows=Array.from({length:interval.count},(_,i)=>candle(i,interval.seconds)),svg=svgFixture(width);
    let hovered;
    const controller=drawIntradayChart({svg,series:series(rows,interval.id),showVolume:false,onHover:value=>{hovered=value;}});
    const labels=ticks(svg);
    assert.ok(labels.length>=3);
    assert.ok(labels.every(label=>/^20\d{2}-\d{2}$/.test(label)),labels.join(', '));
    assert.ok(new Set(labels.map(label=>label.slice(0,4))).size>=3);
    for(const index of [0,Math.floor(rows.length/2),rows.length-1]){
      controller.selectDate(rows[index].date);
      assert.equal(hovered.time,rows[index].time);
      assert.equal(hovered.close,rows[index].close);
      assert.equal(hovered.product,'ETH-USD');
    }
  }
});

test('intraday time labels retain hours while short daily labels use calendar dates',()=>{
  const intraday=svgFixture(),daily=svgFixture();
  drawIntradayChart({svg:intraday,series:series([candle(0,60),candle(1,60),candle(2,60)],'1m'),showVolume:false});
  drawIntradayChart({svg:daily,series:series([candle(0),candle(1),candle(2)]),showVolume:false});
  assert.ok(ticks(intraday).every(label=>/^01-03 00:0[0-2]$/.test(label)));
  assert.deepEqual(ticks(daily),['2022-01-03','2022-01-04','2022-01-05']);
});

test('missing ETH minutes, days, and weeks break the close line without inventing candles',()=>{
  for(const interval of [{id:'1m',seconds:60},{id:'daily',seconds:86400},{id:'weekly',seconds:604800}]){
    const rows=[0,1,3,4].map(index=>candle(index,interval.seconds)),svg=svgFixture();
    drawIntradayChart({svg,series:series(rows,interval.id,{gapCount:1}),chartType:'line',showVolume:false});
    const path=svg.innerHTML.match(/class="market-close-line" d="([^"]*)"/)[1];
    assert.equal((path.match(/M/g)||[]).length,2);
    assert.equal((path.match(/[ML]/g)||[]).length,4);
    assert.equal(svg.dataset.observedCandleCount,'4');
    assert.doesNotMatch(svg.innerHTML,/NaN|Infinity/);
  }
});

test('an empty ETH viewport clears the prior readout while retaining ETH identity and unavailable state',()=>{
  const svg=svgFixture(360);let hovered;
  drawIntradayChart({svg,series:series([candle(0)],'daily',{product:'BTC-USD'}),showVolume:false,onHover:value=>{hovered=value;}});
  assert.equal(hovered.product,'BTC-USD');
  const controller=drawIntradayChart({svg,series:series([candle(10)]),range:{start,end:start+86400},showVolume:false,onHover:value=>{hovered=value;}});
  assert.equal(svg.dataset.product,'ETH-USD');
  assert.equal(hovered.product,'ETH-USD');
  assert.equal(hovered.volumeUnit,'ETH');
  assert.equal(hovered.kind,'unavailable');
  assert.equal(hovered.completed,false);
  assert.ok(Number.isNaN(hovered.price));
  assert.equal(controller.getSelection(),null);
  assert.doesNotMatch(svg.innerHTML,/market-candle|market-close-line|BTC-USD/);
});

test('legacy series without an explicit product retain BTC identity in rendered and copied data',()=>{
  const svg=svgFixture();let hovered,inspected;
  const controller=drawIntradayChart({svg,series:series([candle(0)],'daily',{product:undefined}),showVolume:false,onHover:value=>{hovered=value;},onInspect:value=>{inspected=value;}});
  assert.equal(hovered.product,'BTC-USD');
  assert.equal(hovered.volumeUnit,'BTC');
  assert.equal(inspected.product,'BTC-USD');
  assert.match(svg.innerHTML,/<title>Coinbase Exchange BTC-USD/);
  assert.match(controller.getSelection().copyText,/Coinbase Exchange · BTC-USD/);
});


for(const builder of [buildEthereumAdaptiveForecast,buildEthereumPooledForecast])test(builder.name+' SVG titles and inspection use model quantiles rather than legacy external-condition labels',async()=>{
  const archive=JSON.parse(await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8'));
  const actual=parseEthArchive(archive),asOf=actual.lastDate.slice(0,10);
  const forecast=builder({ethHistory:archive,asOf,horizonDays:90,sampleCount:64});
  const svg=svgFixture(),range=ethHistoryRange(actual,'all',null,forecast.displayEnd);
  const controller=drawIntradayChart({svg,series:actual,range,forecast,showVolume:false});
  assert.match(svg.innerHTML,/<title>모형 중앙값/);
  assert.match(svg.innerHTML,/점별 10–90% 모의 분위수/);
  assert.match(svg.innerHTML,/aria-label="모형 예시 1개 · 적중률 미보정"/);
  assert.doesNotMatch(svg.innerHTML,/같은 무작위 잔차를 사용한 세 조건/);
  controller.selectDate(forecast.path[5].date+'T00:00:00Z');
  const selected=controller.getSelection().copyText;
  assert.match(selected,/모형 중앙값/);assert.match(selected,/모의 10–90%/);
  assert.doesNotMatch(selected,/외부 평가 조건|세 조건 범위/);
});

for(const researchModel of ['adaptive','pooled'])test(researchModel+' example may lie outside its quantiles without widening the band or blocking render',()=>{
  const rows=[candle(0)],anchor=rows[0].close,date=offset=>new Date((start+offset*86400)*1000).toISOString().slice(0,10);
  const forecast={symbol:'ETHUSD',pathMode:'crypto-conditional-daily',researchModel,asOf:date(0),milestones:[],
    path:[{date:date(0),price:anchor,baselinePrice:anchor,low:anchor,high:anchor},
      {date:date(1),price:4000,baselinePrice:2100,low:1800,high:2400},
      {date:date(2),price:1000,baselinePrice:2200,low:1600,high:2600}]};
  const future=equityForecastRows(forecast,start);
  assert.equal(future.length,2);
  for(const scale of ['linear','log'])for(const fraction of [.25,.9]){
    const min=start+(1+fraction)*86400,max=start+2*86400;
    const interpolated=equityForecastWindowRows(future,{...rows[0],baselinePrice:anchor},min,max,scale,true,false).find(r=>r.interpolated);
    const expectedLow=scale==='log'?1800**(1-fraction)*1600**fraction:1800*(1-fraction)+1600*fraction;
    const expectedHigh=scale==='log'?2400**(1-fraction)*2600**fraction:2400*(1-fraction)+2600*fraction;
    assert.ok(Math.abs(interpolated.low-expectedLow)<1e-9);
    assert.ok(Math.abs(interpolated.high-expectedHigh)<1e-9);
    const svg=svgFixture(320,600);
    drawIntradayChart({svg,series:series(rows),forecast,scale,range:{start,end:start+2*86400},showVolume:false});
    assert.equal(svg.dataset.forecastPointCount,'2');
    assert.doesNotMatch(svg.innerHTML,/NaN|Infinity/);
  }
  for(const corrupted of [{low:2300},{high:2000},{price:0},{baselinePrice:NaN}]){
    const invalid=structuredClone(forecast);Object.assign(invalid.path[1],corrupted);
    assert.throws(()=>equityForecastRows(invalid,start),/Invalid/);
  }
  assert.throws(()=>equityForecastRows({...forecast,researchModel:undefined},start),/Invalid equity forecast path/);
});
