import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {instrumentChartLegendMarkup,mountInstrumentChartLegend} from '../dist/ui/instrument-chart-legend.js';

const prices=[['2026-10-01',40],['2026-10-02',42]],bars=[['2026-10-01',39,41,38,40,100]],rows=[{date:'2026-10-01',rsi:33.5,signal:34}];
const view={chartType:'line',frequency:'daily',showRsi:true,showSignal:true,showLevels:true,showCrossings:true,showVolume:false};
const parse=markup=>parseHTML(`<html><body>${markup}</body></html>`).document;
const labels=document=>[...document.querySelectorAll('[class^="instrument-legend-"]>span')].map(node=>node.textContent);

test('RSI legend follows real indicator toggles and preserves crossings versus execution',()=>{
  const options={symbol:'TQQQ',unit:'USD',prices,bars,rows,view};
  let document=parse(instrumentChartLegendMarkup(options));
  assert.deepEqual(labels(document),['실제 가격','RSI14','SMA9','29.5 / 33.5 / 40 / 43','Buy / Sell']);
  assert.equal(document.querySelector('.instrument-legend-price path').getAttribute('stroke'),'var(--data-gold)');
  assert.match(document.querySelectorAll('.instrument-legend-indicator')[3].title,/시뮬레이션의 체결과 구분/);
  document=parse(instrumentChartLegendMarkup({...options,view:{...view,showRsi:false,showCrossings:false,showVolume:true,chartType:'candles'}}));
  assert.deepEqual(labels(document),['관측 캔들','거래량']);assert.equal(document.querySelectorAll('.instrument-legend-price rect').length,2);
  document=parse(instrumentChartLegendMarkup({...options,rows:[{rsi:null,signal:null}]}));
  assert.deepEqual(labels(document),['실제 가격'],'Warmup rows cannot invent a calculated RSI series');
});

test('HYPE retains USDC observations and distinct evidence/judgment meanings without RSI or future paths',()=>{
  const markup=instrumentChartLegendMarkup({symbol:'HYPE',unit:'USDC',prices,bars,series:{frequency:'daily',volumes:[{value:1}]},
    view:{chartType:'candles',showVolume:true},markers:[{kind:'evidence'},{kind:'judgment'}],volumeUnit:'HYPE'}),document=parse(markup);
  assert.deepEqual(labels(document),['관측 캔들','거래량 · HYPE','E · 근거','J · 판정']);
  assert.match(document.querySelector('.instrument-legend-price').title,/USDC/);assert.doesNotMatch(markup,/RSI14|미래 가정|승률/);
});

test('monthly housing legend preserves gaps, real zero volume, actual averages and available states',()=>{
  const options={symbol:'HOUSING-SEOUL',unit:'지수',prices,view:{chartType:'line',showVolume:true},volumeUnit:'건',
    series:{frequency:'monthly',volumes:[{value:0,average:0,state:'below'},{value:null,average:null,state:'above'},{value:2,average:null,state:'warmup'}]}};
  let document=parse(instrumentChartLegendMarkup(options));
  assert.deepEqual(labels(document),['실제 지수','거래량 · 건','과거 평균','하회','산정 전']);
  assert.match(document.querySelector('.instrument-legend-price').title,/미공표월은 선을 연결하거나 값을 채우지 않습니다/);
  document=parse(instrumentChartLegendMarkup({...options,view:{...options.view,showVolume:false}}));assert.deepEqual(labels(document),['실제 지수']);
  document=parse(instrumentChartLegendMarkup({...options,prices:[],series:{frequency:'monthly',volumes:[{value:null,average:null,state:'above'}]}}));
  assert.deepEqual(labels(document),[],'Missing data cannot create a price or volume legend');
});

test('the reusable child controller replaces meanings and removes its dialog on unmount',()=>{
  const document=parse('<div class="atlas-plot rsi-chart-canvas"><svg></svg></div>'),plot=document.querySelector('.rsi-chart-canvas'),CustomEvent=document.defaultView.CustomEvent;
  class MutationObserver{observe(){}disconnect(){}takeRecords(){return [];}}
  Object.defineProperty(document,'defaultView',{value:{CustomEvent,MutationObserver,innerWidth:390,addEventListener(){},removeEventListener(){}}});
  plot.getBoundingClientRect=()=>({width:390,height:600});Object.defineProperties(plot,{clientWidth:{value:390},clientHeight:{value:600}});
  const controller=mountInstrumentChartLegend({plot}),geometry={width:390,height:600,left:12,right:310,top:18,bottom:420};
  try{
    controller.update({symbol:'TQQQ',unit:'USD',prices,bars,rows,view,active:true},geometry);
    const foot=plot.querySelector('.chart-legend-dock');assert.equal(foot.dataset.legendMode,'chip');assert.ok(parseFloat(foot.style.getPropertyValue('--chart-legend-width'))<=(310-12)*.42);
    const dialog=document.querySelector('#chart-legend-dialog');dialog.showModal=()=>{dialog.open=true;};plot.querySelector('.chart-legend-open').click();
    assert.match(dialog.textContent,/RSI14/);assert.match(dialog.textContent,/체결과 구분/);
    controller.update({symbol:'HYPE',unit:'USDC',prices,bars,rows:[],view:{chartType:'candles'},markers:[{kind:'evidence'}],active:true},geometry);
    assert.doesNotMatch(dialog.textContent,/RSI14|SMA9|Buy \/ Sell/);assert.match(dialog.textContent,/E · 근거/);
    controller.update({symbol:'HYPE',unit:'USDC',prices,view:{},active:false},geometry);assert.equal(foot.hidden,true);
  }finally{controller.destroy();}
  assert.equal(document.querySelector('.chart-legend-dock'),null);assert.equal(document.querySelector('#chart-legend-dialog'),null);
});
