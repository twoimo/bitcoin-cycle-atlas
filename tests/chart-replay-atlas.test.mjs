import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createAtlasReplayContext,drawAtlasChartReplay} from '../dist/chart-replay-atlas.js';
import {drawAtlasPriceChart,forecastValueSignature} from '../dist/atlas-price-chart.js';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';

// A small parsed SVG boundary verifies the existing painter's actual layers.
// Native pointer, touch and font geometry are exercised by the browser suite.
class Node {
  constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.attrs=new Map();this.children=[];this.dataset={};this.value='';}
  setAttribute(key,value){this.attrs.set(key,String(value));if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);}
  getAttribute(key){return this.attrs.get(key)??null;}
  removeAttribute(key){this.attrs.delete(key);}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  set textContent(value){this.value=String(value);this.children=[];}
  get textContent(){return this.value+this.children.map(child=>child.textContent).join('');}
  set innerHTML(markup){
    this.children=[];const stack=[this];
    for(const token of markup.match(/<[^>]+>|[^<]+/g)??[]){
      if(token.startsWith('</')){assert.equal(stack.pop().tagName,token.slice(2,-1));continue;}
      if(token.startsWith('<')){const node=new Node(token.match(/^<([\w:-]+)/)[1],this.ownerDocument);for(const [,key,value]of token.matchAll(/([\w:-]+)="([^"]*)"/g))node.setAttribute(key,value);stack.at(-1).append(node);if(!token.endsWith('/>'))stack.push(node);}
      else{const node=new Node('#text',this.ownerDocument);node.value=token;stack.at(-1).append(node);}
    }
    assert.equal(stack.length,1);
  }
  get innerHTML(){return this.children.map(node=>node.tagName==='#text'?node.value:`<${node.tagName}${[...node.attrs].map(([key,value])=>` ${key}="${value}"`).join('')}>${node.value}${node.innerHTML}</${node.tagName}>`).join('');}
  matches(selector){
    const tag=selector.match(/^[a-zA-Z][\w-]*/)?.[0],className=selector.match(/\.([\w-]+)/)?.[1],attribute=selector.match(/\[([\w-]+)(?:(\$?=)"([^"]*)")?\]/);
    if(tag&&tag!==this.tagName)return false;
    if(className&&!(this.getAttribute('class')??'').split(' ').includes(className))return false;
    if(attribute){const value=this.getAttribute(attribute[1]);if(value===null||attribute[2]==='$='&&!value.endsWith(attribute[3])||attribute[2]==='='&&value!==attribute[3])return false;}
    return Boolean(tag||className||attribute);
  }
  querySelectorAll(selector){return this.children.flatMap(child=>[...(selector.split(',').some(value=>child.matches(value.trim()))?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest?.(selector)??null;}
  focus(){}
}
function fixture(width=1440,height=700){
  const queue=new Map();let count=0;
  const doc={createElementNS:(_,tag)=>new Node(tag,doc),defaultView:{requestAnimationFrame(callback){queue.set(++count,callback);return count;},cancelAnimationFrame(id){queue.delete(id);}}};
  const svg=new Node('svg',doc);Object.assign(svg,{id:'lab-chart',clientWidth:width,clientHeight:height,parentElement:{style:{setProperty(){}}},getBoundingClientRect:()=>({left:0,top:0,width,height})});
  return {svg,flush(){const pending=[...queue.values()];queue.clear();for(const callback of pending)callback();}};
}

const dataset=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
const original=JSON.parse(await readFile(new URL('../docs/THREE_YEAR_RESULTS.json',import.meta.url),'utf8'));
const originalForecast={...original.scenarios[0],nominalClock:original.scenarios[0].timing};
const originDate='2026-10-20';
const current=buildLongHorizonForecast(dataset,{scenario:'base'});
const presentation={showCycleMarkers:true,showCycleIntervals:true,showTurns:true,showHistoricalEvents:true,band:true,scale:'log',unit:'usd'};
const context=createAtlasReplayContext({dataset,forecast:current,presentation,originDate});
const rows=dataset.prices.map(([date,price])=>({date,price}));
const frame=(cursorDate=originDate)=>({cursorDate,inputVisible:true,forecastVisible:true,forecast:context.forecast.map(row=>({date:row.date,price:row.price,lower:row.lower,upper:row.upper}))});
const data=(cursorDate=originDate)=>({originDate,frequency:'daily',observedRows:rows,observedCandles:[],candleSource:'Coin Metrics',frame:frame(cursorDate)});
function draw(svg,options={}){return drawAtlasChartReplay({svg,session:{asOf:originDate},data:data(),start:'2024-10-20',end:'2028-10-20',context,...options});}

test('a captured current forecast keeps its distinct input date and immutable path, while historical labels use only the replay origin',()=>{
  const clone=structuredClone(current),input=structuredClone(dataset);
  const result=createAtlasReplayContext({dataset:input,forecast:clone,presentation,originDate});
  assert.equal(result.originDate,originDate);assert.equal(result.forecastOrigin,current.asOf);assert.ok(result.forecastOrigin>result.originDate);
  assert.equal(forecastValueSignature(result.forecast),forecastValueSignature(current.path));
  assert.ok(result.cycleMarkers.filter(marker=>marker.kind==='observed').every(marker=>marker.date<=originDate));
  assert.ok(result.turns.filter(turn=>turn.replaySource==='observed').every(turn=>turn.confirmationDate<=originDate));
  const signature=result.annotationSignature;clone.path[1].price*=10;input.prices.at(-1)[1]*=100;
  assert.equal(result.annotationSignature,signature);assert.equal(result.forecast[1].price,current.path[1].price);assert.ok(Object.isFrozen(result.forecast[1]));
});

test('the same primary SVG retains Atlas cycle and interval layers and the exact orange forecast before and after revealing actual bars',()=>{
  const {svg}=fixture();
  const live=[...rows,...current.path.filter(row=>row.date>current.asOf)];
  drawAtlasPriceChart({svg,rows:live,split:current.asOf,forecastIdentityRows:current.path,start:'2024-10-20',end:'2028-10-20',showDrawdown:false});
  const originalSignature=svg.dataset.forecastValueSignature;
  draw(svg);
  assert.equal(svg.id,'lab-chart');assert.equal(svg.dataset.replayRenderer,'atlas');
  assert.equal(svg.dataset.replayActualCount,'0');
  assert.equal(svg.dataset.forecastValueSignature,originalSignature);
  assert.equal(svg.querySelectorAll('.price-series-layer').length,1);
  assert.equal(svg.querySelectorAll('.cycle-interval-overlay-layer').length,1);
  assert.ok(Number(svg.dataset.cycleMarkerCount)>0);assert.ok(Number(svg.dataset.cycleIntervalCount)>0);
  const frozen=svg.dataset.replayAnnotationSignature;
  const baselinePath=svg.querySelector('[data-replay-forecast-path]').getAttribute('d');
  draw(svg,{data:data('2026-10-21')});
  assert.equal(svg.dataset.forecastValueSignature,originalSignature);assert.equal(svg.dataset.replayAnnotationSignature,frozen);
  assert.equal(svg.querySelector('[data-replay-forecast-path]').getAttribute('d'),baselinePath);
  assert.equal(svg.dataset.replayActualThrough,'2026-10-21');
  assert.equal(svg.dataset.replayActualCount,'1');
  assert.equal(svg.dataset.replayViewStart,'2024-10-20');assert.equal(svg.dataset.replayViewEnd,'2028-10-20');
});

test('unrevealed closes and candles cannot change the actual line, axis, inspection or frozen forecast',()=>{
  const a=fixture(),b=fixture(),normal=data(),poisoned=structuredClone(normal);
  for(const row of poisoned.observedRows)if(row.date>originDate)row.price=9e15;
  poisoned.observedCandles=[{date:'2026-10-21',startDate:'2026-10-21',endDate:'2026-10-21',open:9e15,high:1e16,low:8e15,close:9e15}];
  const left=draw(a.svg,{data:normal}),right=draw(b.svg,{data:poisoned,chartType:'candles'});
  assert.equal(left.axis.min,right.axis.min);assert.equal(left.axis.max,right.axis.max);
  assert.equal(a.svg.querySelector('.observed-close-line').getAttribute('d'),b.svg.querySelector('.observed-close-line').getAttribute('d'));
  assert.equal(b.svg.dataset.observedCandleCount,'0');assert.doesNotMatch(b.svg.innerHTML,/9000000000000000|10000000000000000/);
  right.selectDate('2026-10-21');assert.equal(right.getSelection().actual,null);assert.equal(right.getSelection().predicted,null);
});

test('real venue candles are revealed by their actual date without replacing Coin Metrics comparison values',()=>{
  const {svg}=fixture(),input=data();
  input.priceSource='Coin Metrics';input.candleSource='Bitstamp';input.observedCandles=[originDate,'2026-10-21'].map(date=>({date,startDate:date,endDate:date,open:80000,high:84000,low:79000,close:81000,volume:123}));
  const chart=draw(svg,{data:input,chartType:'candles'});
  assert.equal(svg.dataset.observedCandleCount,'1');assert.equal(svg.querySelector('.observed-candle').dataset.date,originDate);
  assert.match(svg.querySelector('.observed-candle').textContent,/Bitstamp BTC-USD/);
  chart.selectDate(originDate);assert.equal(chart.getSelection().actual,rows.find(row=>row.date===originDate).price);assert.equal(chart.getSelection().candle.close,81000);
  assert.equal(chart.getSelection().source,'Coin Metrics');assert.equal(chart.getSelection().candleSource,'Bitstamp');
  assert.equal(chart.getSelection().forecastOrigin,current.asOf);assert.equal(chart.getSelection().replayOrigin,originDate);
  chart.selectDate('2026-10-21');assert.equal(chart.getSelection().actual,null);assert.equal(chart.getSelection().candle,null);
});

test('mismatched forecast values and origins fail instead of scoring a different orange path',()=>{
  const {svg}=fixture(),input=data();input.frame.forecast[0].price+=1;
  assert.throws(()=>draw(svg,{data:input}),/does not match the scored replay forecast/);
  assert.throws(()=>draw(svg,{session:{asOf:'2026-10-19'}}),/different forecast origin/);
  const changed=structuredClone(current);changed.path[0].price+=1;
  assert.throws(()=>createAtlasReplayContext({dataset,forecast:changed,originDate}),/exact origin/);
  assert.throws(()=>createAtlasReplayContext({dataset,forecast:current,originDate:'2026-11-01'}),/cannot follow/);
});

test('the original publication path remains a separately supported context with its original origin',()=>{
  const originalContext=createAtlasReplayContext({dataset,forecast:originalForecast,presentation});
  assert.equal(originalContext.originDate,originalForecast.asOf);assert.equal(originalContext.forecastOrigin,originalForecast.asOf);
  assert.equal(originalContext.forecast.length,1098);assert.equal(originalContext.forecast[10].price,originalForecast.path[10].price);
  assert.ok(originalContext.cycleMarkers.some(marker=>marker.kind==='scenario'));
});

test('a forecast-only viewport never exposes a nearest actual and preserves correct scaled coordinates',()=>{
  for(const width of [320,900,1440]){
    const {svg}=fixture(width,500),chart=draw(svg,{start:'2029-01-01',end:'2029-12-31'});
    chart.selectDate('2029-04-01');assert.equal(chart.getSelection().actual,null);assert.ok(chart.getSelection().predicted>0);
    svg.getBoundingClientRect=()=>({left:20,top:30,width:width/2,height:250});
    assert.equal(chart.dateAt(20+chart.x('2029-04-01')/2),'2029-04-01');
    assert.equal(svg.dataset.observedLineCount,'0');assert.doesNotMatch(svg.innerHTML,/NaN|Infinity/);
  }
});

test('old replay disposal cannot detach the newer native Atlas chart handlers',()=>{
  const harness=fixture(),old=draw(harness.svg),next=draw(harness.svg,{data:data(dateFromDay(utcDay(originDate)+1))});
  const pointer=harness.svg.onpointermove;old.destroy();assert.equal(harness.svg.onpointermove,pointer);
  assert.equal(next.previewPointer({clientX:next.x(originDate),clientY:next.axis.top+30,pointerType:'mouse'}),true);
  next.destroy();assert.equal(harness.svg.onpointermove,null);harness.flush();
});

test('an empty replay viewport does not inherit unrevealed live prices and still identifies the frozen orange path',()=>{
  const {svg}=fixture();
  drawAtlasPriceChart({svg,rows:[{date:'2026-10-29',price:9e15}],start:'2026-10-28',end:'2026-10-30',split:'2026-10-29',showDrawdown:false});
  const chart=draw(svg,{start:'2100-01-01',end:'2100-12-31'});
  assert.equal(chart.axis.min,1);assert.equal(chart.axis.max,10);assert.equal(svg.dataset.observedCandleCount,'0');
  assert.equal(svg.dataset.forecastValueSignature,forecastValueSignature(context.forecast));
  assert.ok(svg.querySelector('.chart-empty-message'));assert.doesNotMatch(svg.innerHTML,/9000000000000000/);
});
