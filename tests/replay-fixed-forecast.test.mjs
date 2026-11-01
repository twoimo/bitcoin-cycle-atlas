import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {svgFixture} from './replay-svg-fixture.mjs';
import {parseProjectReplayBaseline} from '../dist/project-replay-baseline.js';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import {createCurrentChartReplaySession,buildReplayChartData,buildReplayObservedCandles} from '../dist/forecast-replay.js';
import {createAtlasReplayContext,drawAtlasChartReplay} from '../dist/chart-replay-atlas.js';
const {drawAtlasPriceChart,forecastValueSignature}=await import('../dist/atlas-price-chart.js');
const {captureAtlasReplaySnapshot}=await import('../dist/chart-replay.js');
const at='2026-10-31T02:00:00.000Z';
const archive=await parseBitcoinReplayCandles(await frozenMarketText('btc-volume'),{now:Date.parse(at)});
const saved=await parseProjectReplayBaseline(await readFile(new URL('../dist/data/project-origin-btc-2026-10-21.json',import.meta.url),'utf8'));
const forecast=saved.forecast,dataset=saved.dataset;
const presentation={band:true,scale:'log',unit:'usd',showCycleMarkers:true,showCycleIntervals:true,showTurns:true,showHistoricalEvents:true};
const session=await createCurrentChartReplaySession({...archive,dataset,forecast,asOf:'2026-10-20',playbackStartDate:'2026-10-21',createdAt:at,evaluatedAt:at});
const fixedSignature=forecastValueSignature(session.chartForecast.path);
function paint(data,{chartType='candles',width=1440,start='2026-10-01',end='2029-10-21',priceDomain=null}={}){
  const {svg}=svgFixture(width);const predicted=session.forecast.map(row=>({...row,replaySource:'forecast'})),actual=data.observedRows.map(row=>({...row,replaySource:'observed'}));const dates=new Set(actual.map(row=>row.date));
  drawAtlasPriceChart({svg,rows:[...actual,...predicted.filter(row=>!dates.has(row.date))].sort((a,b)=>a.date.localeCompare(b.date)),start,end,split:data.frame.cursorDate,fixedForecast:predicted,forecastOrigin:forecast.asOf,observedCandles:data.observedCandles,frequency:data.frequency,chartType,band:true,showDrawdown:false,priceDomain});return svg;
}
const read=cursorDate=>buildReplayChartData(session,{cursorDate,frequency:'daily',clockMode:'observed-date'});
function assertForecastAboveActuals(svg){
  const series=svg.querySelector('.price-series-layer'),path=series.querySelector('[data-replay-forecast-path]'),halo=series.querySelector('[data-replay-forecast-halo]'),band=series.querySelector('[data-indicator-layer="range"]'),order=series.children;
  const actual=series.querySelectorAll('.observed-close-line,.observed-candle,.observed-candles-batched');
  assert.ok(actual.length,'the fixture must contain revealed actual prices');
  for(const node of actual){assert.ok(order.indexOf(band)<order.indexOf(node),'the brown range stays below actual prices');assert.ok(order.indexOf(node)<order.indexOf(halo),'revealed prices must not cover the comparison path');}
  assert.ok(order.indexOf(halo)<order.indexOf(path));
  assert.equal(halo.getAttribute('d'),path.getAttribute('d'),'the halo cannot move or replace the frozen forecast');
  assert.equal(halo.getAttribute('stroke-dasharray'),path.getAttribute('stroke-dasharray'));
  assert.ok(Number(halo.getAttribute('stroke-width'))>Number(path.getAttribute('stroke-width')));
  for(const node of [halo,path])assert.equal(node.getAttribute('pointer-events'),'none');
}
test('current-chart capture is detached and recursively immutable before asynchronous work',()=>{const original={dataset:structuredClone(dataset),forecast:structuredClone(forecast),presentation:structuredClone(presentation)};const captured=captureAtlasReplaySnapshot(original);original.forecast.path[1].price*=2;original.presentation.band=false;assert.equal(captured.forecast.path[1].price,forecast.path[1].price);assert.equal(captured.presentation.band,true);assert.ok(Object.isFrozen(captured.forecast.path[1]));assert.throws(()=>{captured.forecast.path[1].price=0;},TypeError);assert.equal(captureAtlasReplaySnapshot(null),null);});
test('the fixed dashed comparison paints above actual candles while the brown range stays below them',()=>{const svg=paint(read('2026-10-25'));assert.ok(svg.querySelector('.observed-candle'));assertForecastAboveActuals(svg);});
test('revealing all five archived days changes actual candles, never forecast values or band values',()=>{const signature=JSON.stringify(session.forecast);let count=-1;for(const cursorDate of session.timeline){const data=read(cursorDate),svg=paint(data);assert.equal(svg.dataset.forecastValueSignature,fixedSignature);assert.equal(JSON.stringify(data.frame.forecast),signature);assert.ok(data.observedRows.every(row=>row.date<=cursorDate));assert.ok(data.observedCandles.every(row=>row.endDate<=cursorDate));assert.ok(data.observedCandles.length>=count);count=data.observedCandles.length;assert.ok(svg.querySelector('[data-replay-forecast-path]'));assert.ok(svg.querySelector('[data-indicator-layer="range"]'));}});
test('fixed snapshot is never scored as an October 21 issued prediction',()=>{const data=read('2026-10-25');assert.equal(session.identity.issuedAt,null);assert.equal(session.policy.forecastScoringEnabled,false);assert.equal(data.frame.metrics.matchedCount,0);assert.equal(data.frame.metrics.meanAbsolutePercentageError,null);assert.equal(data.frame.metrics.directionAccuracy,null);});
test('weekly D updates preserve the week opening and position using genuine venue candles',()=>{const a=buildReplayObservedCandles({...archive,symbol:'BTCUSD',cursorDate:'2026-08-17',frequency:'weekly',evaluatedAt:at}).candles.at(-1),b=buildReplayObservedCandles({...archive,symbol:'BTCUSD',cursorDate:'2026-08-18',frequency:'weekly',evaluatedAt:at}).candles.at(-1);assert.equal(a.periodStartDate,b.periodStartDate);assert.equal(a.open,b.open);assert.equal(a.daysIncluded,1);assert.equal(b.daysIncluded,2);assert.equal(a.close,64484.76);assert.equal(b.close,64686.09);assert.equal(b.high,65000);});
test('unrevealed extreme actuals cannot affect auto axis or fixed line geometry',()=>{const context=createAtlasReplayContext({dataset,forecast,presentation,originDate:'2026-10-20'});const a=read('2026-10-21'),b=structuredClone(a);b.observedRows.push({date:'2026-10-25',price:9e15});b.observedCandles.push({date:'2026-10-25',startDate:'2026-10-25',endDate:'2026-10-25',open:8e15,high:1e16,low:7e15,close:9e15});const sa=svgFixture().svg,sb=svgFixture().svg;for(const [svg,data] of [[sa,a],[sb,b]])drawAtlasChartReplay({svg,session,data,start:'2026-10-01',end:'2029-10-21',chartType:'candles',context});assert.equal(sa.dataset.replayPriceMin,sb.dataset.replayPriceMin);assert.equal(sa.dataset.replayPriceMax,sb.dataset.replayPriceMax);assert.equal(sa.querySelector('[data-replay-forecast-path]').getAttribute('d'),sb.querySelector('[data-replay-forecast-path]').getAttribute('d'));});
test('dense candle batching cannot cover the fixed forecast',()=>{const svg=paint(read('2026-10-25'),{width:320,start:'2024-10-21'});const batch=svg.querySelector('.observed-candles-batched');assert.ok(batch,'fixture must exercise the dense-candle branch');assert.ok(Number(batch.dataset.count)>256);assertForecastAboveActuals(svg);});
test('line display and weekly display retain the entire fixed path identity',()=>{for(const frequency of ['daily','weekly'])for(const chartType of ['line','candles']){const svg=paint(buildReplayChartData(session,{cursorDate:'2026-10-25',frequency}),{chartType});assert.equal(svg.dataset.forecastValueSignature,fixedSignature);assert.equal(svg.querySelectorAll('[data-replay-forecast-path]').length,1);}});
test('the same fixed path and range continue across both sides of the advancing daily or weekly cutoff',()=>{
  const original=JSON.stringify(session.forecast),xs=node=>[...node.getAttribute('d').matchAll(/[ML](-?[\d.]+),/g)].map(match=>Number(match[1]));
  for(const frequency of ['daily','weekly'])for(const chartType of ['line','candles']){
    let previous=null;
    for(const cursorDate of ['2026-10-22','2026-10-25']){
      const data=buildReplayChartData(session,{cursorDate,frequency,clockMode:'observed-date'});
      const svg=paint(data,{chartType,start:'2026-10-19',end:'2026-11-03',priceDomain:{min:10000,max:300000}});
      const path=svg.querySelector('[data-replay-forecast-path]'),band=svg.querySelector('[data-indicator-layer="range"]').querySelector('path'),cursorX=Number(svg.querySelector('.observed-split-boundary').getAttribute('x1'));
      const left=Number(svg.dataset.plotLeft),right=Number(svg.dataset.plotRight),originX=left+(Date.parse(forecast.asOf)-Date.parse('2026-10-19'))/(Date.parse('2026-11-03')-Date.parse('2026-10-19'))*(right-left);
      for(const node of [path,band]){const points=xs(node);assert.ok(points.some(x=>x<cursorX),'the frozen layer must remain over revealed dates');assert.ok(points.some(x=>x>cursorX),'the same frozen layer must continue into undisclosed dates');assert.ok(Math.abs(Math.min(...points)-originX)<.01,'the layer cannot extend into dates before its source forecast');assert.ok(Math.abs(Math.max(...points)-right)<.01);}
      assertForecastAboveActuals(svg);
      assert.equal(svg.dataset.forecastValueSignature,fixedSignature);assert.equal(JSON.stringify(data.frame.forecast),original);
      assert.ok(data.observedRows.every(row=>row.date<=cursorDate));assert.ok(data.observedCandles.every(row=>row.endDate<=cursorDate));
      const geometry={path:path.getAttribute('d'),band:band.getAttribute('d')};
      if(previous)assert.deepEqual(geometry,previous,'with a fixed viewport and scale, revealing actuals cannot trim or move either forecast layer');
      previous=geometry;
    }
  }
  assert.equal(JSON.stringify(session.forecast),original);
});
