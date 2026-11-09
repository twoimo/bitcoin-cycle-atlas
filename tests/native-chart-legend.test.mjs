import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {mountNativeChartLegend,nativeChartLegendMarkup} from '../dist/ui/native-chart-legend.js';

const series={source:'Yahoo Finance',lastDate:'2026-11-06T00:00:00Z',retrievedAt:'2026-11-07T05:00:00Z'};
const parsed=html=>parseHTML(`<html><body>${html}</body></html>`).document;

test('native legend preserves ETH model semantics and omits the unavailable forecast',()=>{
  const document=parsed('<div id="source" title="국면 적응 · 관측 2026-11-06"><span class="eth-observed-key">— 실제 관측</span><span>·· 모형 중앙값</span><span>음영: 모의 10–90%</span><span>┄ 모형 예시 1개 · 적중률 미보정</span></div>');
  const source=document.querySelector('#source'),input={symbol:'ETHUSD',chartType:'candles',series:{...series,source:'Coinbase Exchange'},source};
  let markup=nativeChartLegendMarkup(input),output=parsed(markup);
  assert.equal(output.querySelectorAll('.price-legend-item').length,4);
  const observed=output.querySelector('.price-legend-item');
  assert.equal(observed.textContent,'실제 가격');
  assert.equal(observed.getAttribute('title'),'Coinbase Exchange의 완료된 OHLC 봉입니다. 실시간 현재가 표시는 아닙니다.');
  assert.match(output.body.textContent,/모형 중앙값/);assert.match(output.body.textContent,/모의 10–90%/);assert.match(output.body.textContent,/적중률 미보정/);
  assert.match(markup,/Coinbase Exchange.*완료된 OHLC/);assert.match(markup,/수집 2026-11-07T05:00:00Z/);
  const observedLine=parsed(nativeChartLegendMarkup({...input,chartType:'line'})).querySelector('.price-legend-item');
  assert.equal(observedLine.textContent,'실제 가격');
  assert.equal(observedLine.getAttribute('title'),'Coinbase Exchange의 관측 종가를 이은 선입니다. 실시간 현재가 표시는 아닙니다.');
  source.hidden=true;output=parsed(nativeChartLegendMarkup(input));
  assert.equal(output.querySelectorAll('.price-legend-item').length,1);
  assert.doesNotMatch(output.body.textContent,/모형 예시|모형 중앙값|10–90%/);
});

test('the BMNR T3 source cannot contribute a hidden future series or a fabricated vintage',()=>{
  const document=parsed('<div class="equity-legend"><span class="observed">— 실제 관측</span><span class="equity-projected" hidden>┄ 조건부 경로 · 근거 ○</span><span id="equity-vintage"></span></div>');
  const source=document.querySelector('.equity-legend');
  // The old native observed span is replaced by a genuine completed-price key.
  let output=parsed(nativeChartLegendMarkup({symbol:'BMNR',chartType:'line',series,source}));
  assert.equal(output.querySelector('.price-legend-item').textContent,'실제 가격');
  assert.equal(output.querySelector('.price-legend-item').getAttribute('title'),'Yahoo Finance의 관측 종가를 이은 선입니다. 실시간 현재가 표시는 아닙니다.');
  assert.equal(output.querySelectorAll('.price-legend-item').length,1);assert.doesNotMatch(output.body.textContent,/조건부|재무/);
  source.querySelector('.equity-projected').hidden=false;
  source.querySelector('#equity-vintage').textContent='재무 2026-09-30 · 과거 구조 가정';
  output=parsed(nativeChartLegendMarkup({symbol:'MSTR',chartType:'line',series,source}));
  assert.equal(output.querySelectorAll('.price-legend-item').length,2);assert.match(output.body.textContent,/재무 2026-09-30/);
});

for(const width of [320,390,768,1440])test(`native ${width}px plot mounts the existing legend controller and full disclosure`,()=>{
  const document=parsed('<section class="atlas-plot"><svg id="equity-chart"></svg><div class="equity-legend"><span class="eth-observed-key">— 실제 관측</span><span class="equity-projected">┄ 조건부 경로 · 근거 ○</span><span id="equity-vintage">재무 2026-09-30 · 과거 구조 가정</span></div></section>');
  const CustomEvent=document.defaultView.CustomEvent;
  class MutationObserver{observe(){}disconnect(){}takeRecords(){return [];}}
  Object.defineProperty(document,'defaultView',{value:{CustomEvent,MutationObserver,innerWidth:width,addEventListener(){},removeEventListener(){}}});
  const plot=document.querySelector('.atlas-plot'),svg=plot.querySelector('svg');
  plot.getBoundingClientRect=()=>({width,height:700});
  Object.assign(svg.dataset,{plotLeft:'8',plotRight:String(width-80),plotTop:'88',priceBottom:'600'});
  const state={chartType:'candles'},controller=mountNativeChartLegend({plot,symbol:'MSTR',state,getSeries:()=>series});
  try{
    controller.update();
    const foot=plot.querySelector('.chart-legend-dock'),source=foot.querySelector('.lab-legend');
    assert.equal(plot.dataset.legendDock,'top-right');assert.equal(foot.dataset.legendMode,width<=390?'chip':'rows');
    assert.ok(parseFloat(foot.style.getPropertyValue('--chart-legend-width'))<=(width-88)*.42+.01);
    assert.equal(source.querySelectorAll('.chart-legend-row').length,2);
    assert.equal(source.querySelector('[data-legend-group="basis"]').getAttribute('aria-label'),'출처·해석');
    const original=plot.querySelector('.equity-legend');assert.equal(original.getAttribute('aria-hidden'),'true');
    const dialog=document.querySelector('#chart-legend-dialog');dialog.showModal=()=>{dialog.open=true;};
    document.querySelector('.chart-legend-open').click();assert.match(dialog.textContent,/조건부 경로/);assert.match(dialog.textContent,/재무 2026-09-30/);
    original.querySelector('.equity-projected').hidden=true;original.querySelector('#equity-vintage').textContent='';controller.update();
    assert.doesNotMatch(dialog.textContent,/조건부 경로|재무 2026-09-30/);
  }finally{controller.destroy();}
  assert.equal(document.querySelector('#chart-legend-dialog'),null);
});
