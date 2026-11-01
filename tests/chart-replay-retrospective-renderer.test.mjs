import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import {svgFixture} from './replay-svg-fixture.mjs';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import {buildReplayObservedCandles} from '../dist/forecast-replay.js';
import {createAtlasReplayContext,drawAtlasChartReplay} from '../dist/chart-replay-atlas.js';
import {forecastValueSignature} from '../dist/atlas-price-chart.js';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';

const dataset=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
const original=buildLongHorizonForecast(dataset,{scenario:'base'}),originDate='2026-08-16',createdAt='2026-11-01T02:00:00.000Z';
const archive=await parseBitcoinReplayCandles(await frozenMarketText('btc-volume'),{now:Date.parse(createdAt)});
const anchor=dataset.prices.find(row=>row[0]===originDate)[1];
// These explicitly authored prices isolate renderer behavior from model fitting.
// Engine tests separately verify generation, provenance hashes and causal input.
const retrospective={kind:'atlas-replay-retrospective-forecast',schemaVersion:1,status:'ready',asOf:originDate,displayEnd:original.asOf,
  createdAt,issuedAt:null,inputHash:'a'.repeat(64),outputHash:'b'.repeat(64),modelVersion:'renderer-fixture',modelOptions:{},
  publicationTimeProven:false,forecastScoringEnabled:false,
  path:Array.from({length:utcDay(original.asOf)-utcDay(originDate)+1},(_,i)=>{const price=anchor*(1+i*.003);return {date:dateFromDay(utcDay(originDate)+i),price,lower:price*.9,upper:price*1.12};})};
const presentation={band:true,scale:'log',unit:'usd',showCycleMarkers:true,showCycleIntervals:true,showTurns:false,showHistoricalEvents:false};
const context=createAtlasReplayContext({dataset,forecast:original,presentation,originDate,retrospectiveForecast:retrospective});
function dataAt(cursorDate,{origin=originDate,captured=context,record=retrospective}={}){
  return {originDate:origin,frequency:'weekly',observedRows:archive.observations.map(row=>({date:row.date,price:row.price})),
    observedCandles:buildReplayObservedCandles({...archive,cursorDate,frequency:'weekly',evaluatedAt:createdAt}).candles,
    priceSource:archive.source.provider,candleSource:archive.source.provider,
    frame:{cursorDate,inputVisible:true,forecastVisible:true,forecast:captured.forecast,retrospectiveForecast:record.path}};
}
function paint(data,options={}){
  const {width=1440,height=760,...chartOptions}=options;
  const {svg}=svgFixture(width,height),chart=drawAtlasChartReplay({svg,session:{asOf:originDate},data,start:'2026-08-08',end:'2026-11-15',chartType:'candles',context,...chartOptions});
  return {svg,chart};
}
const vertices=node=>[...node.getAttribute('d').matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match=>({x:Number(match[1]),y:Number(match[2])}));
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<.011,message??`${actual} differs from ${expected}`);
function frozenGeometry(svg){return Object.fromEntries(['forecast-path','forecast-band','retrospective-path','retrospective-band'].map(kind=>[kind,svg.querySelector('[data-replay-'+kind+']')?.getAttribute('d')??null]));}
function assertIndependentLayers(svg){
  const series=svg.querySelector('.price-series-layer'),order=series.children,range=series.querySelector('[data-indicator-layer="range"]');
  const actual=series.querySelectorAll('.observed-close-line,.observed-candle,.observed-candles-batched');
  const halos=['retrospective','forecast'].map(kind=>series.querySelector('[data-replay-'+kind+'-halo]'));
  const paths=['retrospective','forecast'].map(kind=>series.querySelector('[data-replay-'+kind+'-path]'));
  assert.ok(actual.length);
  for(const node of actual){assert.ok(order.indexOf(range)<order.indexOf(node));for(const halo of halos)assert.ok(order.indexOf(node)<order.indexOf(halo));}
  for(const path of paths)for(const halo of halos)assert.ok(order.indexOf(halo)<order.indexOf(path),'all contrast halos must stay below both independent lines');
  for(const [index,kind] of ['retrospective','forecast'].entries()){
    assert.equal(series.querySelectorAll('[data-replay-'+kind+'-path]').length,1);
    assert.equal(paths[index].getAttribute('d'),halos[index].getAttribute('d'));
    assert.equal(paths[index].getAttribute('stroke-dasharray'),kind==='retrospective'?'1 5':'5 3','retrospective dots stay distinct while the original dash remains unchanged');
    assert.equal(halos[index].getAttribute('stroke-dasharray'),paths[index].getAttribute('stroke-dasharray'));
    assert.equal((paths[index].getAttribute('d').match(/M/g)??[]).length,1,'one record must remain one independent path');
    for(const node of [paths[index],halos[index],series.querySelector('[data-replay-'+kind+'-band]')])assert.equal(node.getAttribute('pointer-events'),'none');
  }
}

test('a separate frozen retrospective record leaves the original forecast and annotations unchanged',()=>{
  const baseline=createAtlasReplayContext({dataset,forecast:original,presentation,originDate});
  const record=structuredClone(retrospective),captured=createAtlasReplayContext({dataset,forecast:original,presentation,originDate,retrospectiveForecast:record});
  assert.deepEqual({...captured,retrospectiveForecast:null},baseline);
  assert.deepEqual(captured.retrospectiveForecast,record);
  assert.ok(Object.isFrozen(captured.retrospectiveForecast));assert.ok(Object.isFrozen(captured.retrospectiveForecast.path[1]));
  record.path[1].price*=2;record.createdAt='2030-01-01T00:00:00.000Z';
  assert.deepEqual(captured.retrospectiveForecast,retrospective);
  assert.equal(forecastValueSignature(captured.forecast),forecastValueSignature(original.path));
});

test('each origin labels its own cutoff at the fixed path anchor on desktop and narrow charts',()=>{
  for(const asOf of ['2026-05-31','2026-08-16']){
    const startPrice=dataset.prices.find(row=>row[0]===asOf)[1];
    const record={...retrospective,asOf,path:Array.from({length:utcDay(original.asOf)-utcDay(asOf)+1},(_,i)=>{const price=startPrice*(1+i*.003);return {date:dateFromDay(utcDay(asOf)+i),price,lower:price*.9,upper:price*1.12};})};
    const captured=createAtlasReplayContext({dataset,forecast:original,presentation:{...presentation,priceDomain:{min:30000,max:200000}},originDate:asOf,retrospectiveForecast:record});
    for(const width of [1440,320]){
      let prior=null;
      for(const days of [1,2]){
        const cursorDate=dateFromDay(utcDay(asOf)+days),data=dataAt(cursorDate,{origin:asOf,captured,record});
        const {svg,chart}=paint(data,{width,session:{asOf},context:captured,start:dateFromDay(utcDay(asOf)-8),end:'2026-11-15'});
        const marker=svg.querySelector('[data-replay-retrospective-origin-label]'),label=marker?.querySelector('[data-replay-retrospective-input-date]');
        assert.ok(marker);assert.equal(label.textContent,`회고 · 입력 ${asOf}`);assert.equal(marker.dataset.inputThrough,asOf);
        assert.equal(marker.getAttribute('pointer-events'),'none');assert.equal(marker.querySelector('rect'),null,'the input date is an annotation, not a price-difference badge');
        near(Number(marker.dataset.anchorX),chart.x(asOf));near(Number(marker.dataset.anchorY),chart.axis.y(startPrice));
        const first=vertices(svg.querySelector('[data-replay-retrospective-path]'))[0];near(first.x,Number(marker.dataset.anchorX));near(first.y,Number(marker.dataset.anchorY));
        const tx=Number(label.getAttribute('x')),ty=Number(label.getAttribute('y'));
        assert.ok(tx>=chart.axis.left+4&&tx<=chart.axis.right-4);assert.ok(ty>=chart.axis.top+14&&ty<=chart.axis.bottom-4);
        const state={label:marker.innerHTML,geometry:frozenGeometry(svg)};if(prior)assert.deepEqual(state,prior);else prior=state;
        assertIndependentLayers(svg);assert.equal(svg.dataset.forecastValueSignature,forecastValueSignature(original.path));
      }
    }
  }
});

test('panning past the retrospective origin does not move its date label to another point',()=>{
  const {svg}=paint(dataAt('2026-08-18'),{start:'2026-08-17'});
  assert.ok(svg.querySelector('[data-replay-retrospective-path]'));
  assert.equal(svg.querySelector('[data-replay-retrospective-origin-label]'),null);
  const clipped=paint(dataAt('2026-08-18'),{context:createAtlasReplayContext({dataset,forecast:original,presentation:{...presentation,priceDomain:{min:100000,max:200000}},originDate,retrospectiveForecast:retrospective})});
  assert.equal(clipped.svg.querySelector('[data-replay-retrospective-origin-label]'),null,'an off-scale origin must not be relabelled at an invented boundary price');
});

test('August 17 and 18 grow one genuine weekly candle underneath two independent fixed paths and ranges',()=>{
  const stableContext=createAtlasReplayContext({dataset,forecast:original,presentation:{...presentation,priceDomain:{min:30000,max:200000}},originDate,retrospectiveForecast:retrospective});
  let first=null;
  for(const cursorDate of ['2026-08-17','2026-08-18']){
    const data=dataAt(cursorDate),{svg,chart}=paint(data,{context:stableContext}),candle=svg.querySelectorAll('.observed-candle').at(-1);
    assert.equal(candle.dataset.periodStart,'2026-08-17');assert.equal(candle.dataset.date,cursorDate);
    assert.equal(candle.dataset.daysIncluded,cursorDate==='2026-08-17'?'1':'2');
    assertIndependentLayers(svg);
    const retro=vertices(svg.querySelector('[data-replay-retrospective-path]')),current=vertices(svg.querySelector('[data-replay-forecast-path]'));
    for(const kind of ['path','band']){const xs=vertices(svg.querySelector('[data-replay-retrospective-'+kind+']')).map(point=>point.x);assert.ok(Math.min(...xs)<chart.x(cursorDate));assert.ok(Math.max(...xs)>chart.x(cursorDate));}
    near(retro[0].x,chart.x(originDate));near(retro.at(-1).x,chart.x(original.asOf));near(current[0].x,chart.x(original.asOf));
    near(retro.at(-1).y,chart.axis.y(retrospective.path.at(-1).price));near(current[0].y,chart.axis.y(original.path[0].price));
    assert.notEqual(retro.at(-1).y,current[0].y,'the fixture must expose different model values at the shared boundary date');
    assert.equal(svg.dataset.forecastValueSignature,forecastValueSignature(original.path));
    assert.equal(svg.dataset.retrospectiveForecastValueSignature,forecastValueSignature(retrospective.path));
    assert.equal(svg.dataset.replayRetrospectiveOutputHash,retrospective.outputHash);assert.equal(svg.dataset.replayRetrospectiveIssuedAt,'null');assert.equal(svg.dataset.replayRetrospectiveScoringEnabled,'false');
    const now={geometry:frozenGeometry(svg),open:candle.dataset.open,x:candle.querySelector('line').getAttribute('x1'),close:candle.dataset.close};
    if(first){assert.deepEqual(now.geometry,first.geometry);assert.equal(now.open,first.open);assert.equal(now.x,first.x);assert.notEqual(now.close,first.close);}else first=now;
    assert.deepEqual(data.frame.retrospectiveForecast,retrospective.path);assert.deepEqual(data.frame.forecast,context.forecast);
  }
});

test('inspection distinguishes retrospective prices and prefers the original at the shared boundary',()=>{
  const {chart}=paint(dataAt('2026-08-18'));
  chart.selectDate('2026-08-17');let value=chart.getSelection();
  assert.equal(value.kind,'observed');assert.ok(value.actual>0);assert.equal(value.originalPredicted,null);assert.equal(value.predictedKind,'retrospective');assert.equal(value.predicted,retrospective.path[1].price);
  chart.selectDate('2026-08-19');value=chart.getSelection();
  assert.equal(value.kind,'retrospective');assert.equal(value.actual,null);assert.equal(value.candle,null);assert.ok(value.retrospectivePredicted>0);assert.match(value.copyText,/회고 경로\(현재 생성\)/);
  chart.selectDate(original.asOf);value=chart.getSelection();
  assert.equal(value.predictedKind,'original');assert.equal(value.predicted,original.path[0].price);assert.equal(value.originalPredicted,original.path[0].price);assert.equal(value.retrospectivePredicted,retrospective.path.at(-1).price);assert.equal(value.actual,null);
});

test('unrevealed high, low and close values cannot affect the scale or either fixed path',()=>{
  const normal=dataAt('2026-08-18'),poisoned=structuredClone(normal);
  for(const row of poisoned.observedRows)if(row.date>'2026-08-18')row.price=9e15;
  poisoned.observedCandles.push({date:'2026-08-19',startDate:'2026-08-17',endDate:'2026-08-19',periodStartDate:'2026-08-17',open:8e15,high:1e16,low:7e15,close:9e15});
  const a=paint(normal),b=paint(poisoned);
  assert.equal(a.chart.axis.min,b.chart.axis.min);assert.equal(a.chart.axis.max,b.chart.axis.max);
  assert.deepEqual(frozenGeometry(a.svg),frozenGeometry(b.svg));
  assert.equal(a.svg.dataset.observedCandleCount,b.svg.dataset.observedCandleCount);
  assert.doesNotMatch(b.svg.innerHTML,/9000000000000000|10000000000000000/);
  b.chart.selectDate('2026-08-19');assert.equal(b.chart.getSelection().actual,null);assert.equal(b.chart.getSelection().candle,null);
});

test('a withheld or unavailable retrospective path cannot be replaced by actuals or joined to the original',()=>{
  const hidden=dataAt('2026-08-18');hidden.frame.retrospectiveForecast=[];
  const a=paint(hidden);assert.equal(a.svg.querySelector('[data-replay-retrospective-path]'),null);assert.equal(a.svg.querySelector('[data-replay-retrospective-band]'),null);
  assert.equal(a.svg.querySelector('[data-replay-retrospective-origin-label]'),null);
  a.chart.selectDate('2026-08-19');assert.equal(a.chart.getSelection().predicted,null);
  const unavailable={...retrospective,status:'unavailable',path:[],reason:'fixture-input-unavailable'};
  const unavailableContext=createAtlasReplayContext({dataset,forecast:original,presentation,originDate,retrospectiveForecast:unavailable});
  const b=paint(hidden,{context:unavailableContext});assert.equal(b.svg.dataset.replayRetrospectiveStatus,'unavailable');assert.equal(b.svg.dataset.replayRetrospectivePoints,'0');assert.equal(b.svg.querySelector('[data-replay-retrospective-path]'),null);
  assert.equal(b.svg.dataset.forecastValueSignature,forecastValueSignature(original.path));
  const changed=dataAt('2026-08-18');changed.frame.retrospectiveForecast=structuredClone(retrospective.path);changed.frame.retrospectiveForecast[1].price*=1.01;
  assert.throws(()=>paint(changed),/does not match its separate frozen record/);
  assert.throws(()=>createAtlasReplayContext({dataset,forecast:original,presentation,originDate,retrospectiveForecast:{...retrospective,asOf:'2026-08-15'}}),/identity does not match/);
});
