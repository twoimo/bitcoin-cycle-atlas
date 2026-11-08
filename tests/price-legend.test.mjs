import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import { priceLegendMarkup, priceReadoutKind } from '../dist/price-legend.js';
import {mountChartLegend} from '../dist/ui/chart-legend.js';

const attributes=text=>Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
const items=markup=>[...markup.matchAll(/<span class="price-legend-item" title="([^"]*)"><svg\b([^>]*)>([\s\S]*?)<\/svg><span>([^<]*)<\/span><\/span>/g)].map(match=>({title:match[1],svg:attributes(match[2]),sample:match[3],label:match[4]}));
const elements=(item,tag)=>[...item.sample.matchAll(new RegExp(`<${tag}\\b([^>]*)\\/>`,'g'))].map(match=>attributes(match[1]));

test('observed line and candle legends identify their source and completed-price meaning with distinct real SVG samples',()=>{
  const line=items(priceLegendMarkup({source:'Coin Metrics'})),candles=items(priceLegendMarkup({candles:true,source:'Coinbase BTC-USD'}));
  assert.equal(line.length,1);assert.equal(line[0].label,'관측 가격선');assert.match(line[0].title,/Coin Metrics.*관측 종가/);assert.match(line[0].title,/실시간 현재가.*아닙니다/);
  assert.equal(candles.length,1);assert.equal(candles[0].label,'관측 캔들');assert.match(candles[0].title,/Coinbase BTC-USD.*완료된 OHLC/);assert.match(candles[0].title,/실시간 현재가.*아닙니다/);
  const linePaths=elements(line[0],'path');assert.equal(linePaths.length,1);assert.equal(linePaths[0]['stroke-dasharray'],undefined);
  const bodies=elements(candles[0],'rect'),wicks=elements(candles[0],'path');assert.equal(bodies.length,2);assert.equal(wicks.length,2);assert.equal(new Set(bodies.map(body=>body.fill)).size,2);
  assert.ok(bodies.every(body=>Number(body.width)>0&&Number(body.height)>0));assert.deepEqual(new Set(wicks.map(wick=>wick.stroke)),new Set(bodies.map(body=>body.fill)));
});

test('a forming replay week explains its disclosed daily OHLC without claiming the week is complete',()=>{
  const completed=items(priceLegendMarkup({candles:true,source:'Bitstamp'}))[0];
  const forming=items(priceLegendMarkup({candles:true,forming:true,source:'Bitstamp'}))[0];
  assert.equal(forming.label,'관측 캔들');assert.equal(forming.sample,completed.sample);
  assert.match(forming.title,/Bitstamp.*공개된 실제 일봉.*진행 중 주봉/);
  assert.match(forming.title,/다음 일봉.*OHLC가 갱신/);assert.match(forming.title,/실시간 현재가.*아닙니다/);
  assert.doesNotMatch(forming.title,/완료된 OHLC/);assert.match(completed.title,/완료된 OHLC/);
  const line=items(priceLegendMarkup({forming:true,source:'Coin Metrics'}))[0];
  assert.match(line.title,/관측 종가/);assert.doesNotMatch(line.title,/진행 중 주봉/);
});

test('future path and assumption band appear only for forecast geometry and cannot imply a live quote or probability interval',()=>{
  assert.deepEqual(items(priceLegendMarkup({forecast:false,band:true})).map(item=>item.label),['관측 가격선']);
  assert.deepEqual(items(priceLegendMarkup({forecast:true,band:false})).map(item=>item.label),['관측 가격선','미래 가정']);
  const all=items(priceLegendMarkup({forecast:true,band:true,turns:true}));assert.deepEqual(all.map(item=>item.label),['관측 가격선','미래 가정','가정 범위','고점·저점']);
  const observed=elements(all[0],'path')[0],future=elements(all[1],'path')[0];assert.ok(future['stroke-dasharray'].split(/\s+/).every(value=>Number(value)>0));assert.notEqual(future.stroke,observed.stroke);assert.match(all[1].title,/조건부.*실제 거래 가격이 아닙니다/);
  const range=elements(all[2],'rect');assert.equal(range.length,1);assert.ok(Number(range[0].width)>0&&Number(range[0].height)>0);assert.notEqual(range[0].fill,'none');assert.match(all[2].title,/확률구간이 아닙니다/);
  assert.equal(elements(all[3],'ellipse').length,1);assert.match(all[3].title,/관측.*미래 가정/);
});

test('cutoff replay identifies the actual blue fixed forecast and model band without changing ordinary gold assumptions',()=>{
  const options={compact:true,forecast:true,band:true,turns:true,source:'Bitstamp'},ordinary=items(priceLegendMarkup(options));
  const cutoff=items(priceLegendMarkup({...options,replayMode:'cutoff-backtest'}));
  assert.deepEqual(cutoff.map(item=>item.label),['실제 가격','고정 예측','모형 범위','고점·저점']);
  assert.deepEqual(cutoff[0],ordinary[0]);assert.deepEqual(cutoff[3],ordinary[3]);
  const path=elements(cutoff[1],'path')[0],band=elements(cutoff[2],'rect')[0];
  assert.equal(path.stroke,'var(--replay-cutoff-ink,#74a7ee)');assert.equal(path['stroke-dasharray'],'5 3');
  assert.equal(band.fill,path.stroke);assert.equal(band.stroke,path.stroke);assert.equal(Number(band['fill-opacity']),.13);
  assert.match(cutoff[1].title,/시작일 전날까지.*공개된 평가 자료.*현재 재구성.*고정/);
  assert.match(cutoff[1].title,/당시 발행된 예측 기록이나 실제 거래 가격이 아닙니다/);
  assert.match(cutoff[2].title,/기준시점 모형.*고정.*보정된 확률구간이 아닙니다/);
  assert.doesNotMatch(cutoff[2].title,/경제 가정/);
  for(const replayMode of [null,'current-chart-snapshot','project-baseline','historical-reconstruction','recorded']){
    const current=items(priceLegendMarkup({...options,replayMode}));assert.deepEqual(current,ordinary);
    assert.equal(elements(current[1],'path')[0].stroke,'#f2b960');assert.equal(current[1].label,'미래 가정');assert.equal(current[2].label,'가정 범위');
  }
  assert.deepEqual(items(priceLegendMarkup({replayMode:'cutoff-backtest',forecast:false,band:true})).map(item=>item.label),['관측 가격선']);
  assert.deepEqual(items(priceLegendMarkup({replayMode:'cutoff-backtest',forecast:true,band:false})).map(item=>item.label),['관측 가격선','고정 예측']);
});

test('the full legend modal inherits cutoff colors and explanations and updates back to the ordinary forecast',()=>{
  const options={compact:true,forecast:true,band:true,source:'Bitstamp'};
  const {document}=parseHTML(`<html><body><div class="atlas-plot"><svg id="lab-chart"></svg><div class="lab-chart-foot"><div id="atlas-chart-legend">${priceLegendMarkup({...options,replayMode:'cutoff-backtest'})}</div></div></div></body></html>`);
  // Deliver only external source mutations. The parsed DOM's observer also
  // reports the controller's disconnected reparenting, unlike native Chrome.
  const observers=[],CustomEvent=document.defaultView.CustomEvent;
  class MutationObserver{
    constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this);}
    observe(target){this.targets.add(target);}
    disconnect(){this.targets.clear();}
  }
  Object.defineProperty(document,'defaultView',{value:{CustomEvent,MutationObserver,innerWidth:320,addEventListener(){},removeEventListener(){}}});
  const plot=document.querySelector('.atlas-plot'),source=document.querySelector('#atlas-chart-legend');
  plot.getBoundingClientRect=()=>({width:320,height:700});
  Object.assign(document.querySelector('svg').dataset,{plotLeft:'8',plotRight:'240',plotTop:'18',priceBottom:'600'});
  const controller=mountChartLegend({plot}),dialog=document.querySelector('#chart-legend-dialog');
  dialog.showModal=()=>{dialog.open=true;};
  try{
    document.querySelector('.chart-legend-open').click();assert.equal(dialog.open,true);
    const entries=()=>[...dialog.querySelectorAll('li')].map(node=>({label:node.querySelector('.chart-legend-dialog-sample').textContent,
      description:node.querySelector('p')?.textContent,path:node.querySelector('path')?.getAttribute('stroke'),fill:node.querySelector('rect')?.getAttribute('fill')}));
    const cutoff=entries();assert.deepEqual(cutoff.map(entry=>entry.label),['실제 가격','고정 예측','모형 범위']);
    assert.equal(cutoff[1].path,'var(--replay-cutoff-ink,#74a7ee)');assert.equal(cutoff[2].fill,cutoff[1].path);
    assert.match(cutoff[1].description,/현재 재구성.*당시 발행된 예측 기록이나 실제 거래 가격이 아닙니다/);
    assert.match(cutoff[2].description,/보정된 확률구간이 아닙니다/);
    assert.ok([...dialog.querySelectorAll('svg')].every(node=>node.getAttribute('aria-hidden')==='true'));
    source.innerHTML=priceLegendMarkup(options);
    for(const observer of observers)if(observer.targets.has(source))observer.callback([]);
    const ordinary=entries();assert.deepEqual(ordinary.map(entry=>entry.label),['실제 가격','미래 가정','가정 범위']);
    assert.equal(ordinary[1].path,'#f2b960');assert.equal(ordinary[2].fill,'#f2aa4c25');
    assert.match(ordinary[2].description,/경제 가정/);assert.doesNotMatch(dialog.textContent,/현재 재구성|기준시점 모형/);
  }finally{controller.destroy();}
});

test('price samples are bounded decorative SVGs while text carries the accessible meaning',()=>{
  for(const candles of [true,false]){
    const markup=priceLegendMarkup({candles,forecast:true,band:true,turns:true});assert.match(markup,/role="group" aria-label="가격 표시 범례"/);
    for(const item of items(markup)){
      assert.equal(item.svg['aria-hidden'],'true');assert.equal(item.svg.focusable,'false');assert.ok(item.label.length>0&&item.title.length>0);
      const viewBox=item.svg.viewBox.split(/\s+/).map(Number);assert.equal(viewBox.length,4);assert.ok(viewBox.every(Number.isFinite));
      assert.ok(Number(item.svg.width)>0&&Number(item.svg.width)<=24);assert.ok(Number(item.svg.height)>0&&Number(item.svg.height)<=24);assert.equal(Number(item.svg.width)/Number(item.svg.height),viewBox[2]/viewBox[3]);
    }
    assert.doesNotMatch(markup,/<button|<a\b|on(?:click|pointer)|D-\d+|scenario-countdown|\$[\d,]+/,'the legend does not contain an action, countdown or changing price quote');
  }
});

test('provider strings cannot inject markup into the legend title',()=>{
  const markup=priceLegendMarkup({source:'Venue "quoted" <script>run()</script> & BTC'}),parsed=items(markup);
  assert.equal(parsed.length,1);assert.doesNotMatch(markup,/<script>|<\/script>/);assert.match(parsed[0].title,/&quot;quoted&quot;/);assert.match(parsed[0].title,/&lt;script&gt;/);assert.match(parsed[0].title,/&amp; BTC/);
});

test('readout kind distinguishes a completed candle close, observed series close, model price and absent data',()=>{
  assert.equal(priceReadoutKind({kind:'observed',price:81567.49,open:82000,high:83000,low:81000,close:81567.49}),'봉 종가');
  assert.equal(priceReadoutKind({kind:'observed',price:81567.49}),'관측 종가');
  for(const open of [undefined,null,NaN,'82000'])assert.equal(priceReadoutKind({kind:'observed',price:81567.49,open}),'관측 종가');
  assert.equal(priceReadoutKind({kind:'simulated',price:95000}),'가정');assert.equal(priceReadoutKind({kind:'simulated',price:95000,open:90000}),'가정','source kind takes precedence over incidental OHLC fields');
  assert.equal(priceReadoutKind({kind:'unavailable',price:NaN}),'자료 없음');assert.equal(priceReadoutKind({kind:'unavailable',open:82000}),'자료 없음');
});
