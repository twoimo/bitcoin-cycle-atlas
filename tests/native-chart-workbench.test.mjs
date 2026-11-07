import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { mountNativeChartApp, mountNativeChartWorkbench, nativeChartSnapshot, nativeDateRange } from '../dist/native-chart-workbench.js';
import { parseGoToRequest } from '../dist/chart-view-policy.js';
import { atlasNavigationPages } from '../dist/atlas-navigation.js';

const seconds=value=>Date.parse(value+'T00:00:00Z')/1000;

function fixture(t,symbol='ETHUSD'){
  const {document,window}=parseHTML(`<html><body><div id="atlas-boot-shell"></div><aside class="atlas-sidebar"><button class="atlas-brand">Atlas</button><nav class="atlas-nav">${atlasNavigationPages.map(page=>`<button data-atlas-page="${page.id}"><span data-icon="nav"></span><span>${page.label}</span></button>`).join('')}</nav><div class="atlas-side-foot">BTC-only clock</div></aside><header data-atlas-shell="dashboard"></header><div class="workspace"><main id="old-btc">Old chart</main></div><dialog id="btc-only"></dialog><script id="retained-prices" type="application/json">{}</script></body></html>`);
  const old=new Map(['matchMedia','XMLSerializer'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
  Object.defineProperty(globalThis,'XMLSerializer',{configurable:true,value:class{serializeToString(node){return node.outerHTML;}}});
  const create=document.createElement.bind(document);
  document.createElement=tag=>{const node=create(tag);if(tag==='select')Object.defineProperty(node,'value',{value:'',writable:true,configurable:true});if(tag==='dialog'){
    node.showModal=()=>node.setAttribute('open','');node.close=()=>{if(node.hasAttribute('open')){node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));}};
  }return node;};
  const workspace=document.querySelector('.workspace'),sidebar=document.querySelector('.atlas-sidebar'),nav=document.querySelector('.atlas-nav');
  const app=create('main');app.id='main';app.className='eth-app';app.innerHTML=`<nav class="eth-tools"><button data-eth-action="pan">legacy</button></nav><header class="eth-topbar"><button id="eth-symbol">${symbol}</button><div class="eth-interval-buttons"><button data-eth-interval="daily">1D</button><button data-eth-interval="weekly">1W</button></div><select id="eth-interval"><option value="daily">1D</option></select><div class="eth-chart-types"><button data-eth-action="line">선</button><button data-eth-action="candles">봉</button></div><span class="eth-top-spacer"></span><button data-eth-action="forecast">전망</button><button data-eth-action="info">출처</button></header><section class="atlas-plot eth-plot"><svg id="eth-chart" viewBox="0 0 600 400"><path d="M1 1L2 2"/></svg></section><footer class="eth-bottom"><div class="eth-periods"></div><select id="eth-period-select"></select><span id="eth-status">2026-10-23</span></footer>`;
  mountNativeChartApp(app);
  const plot=app.querySelector('.atlas-plot'),svg=plot.querySelector('svg'),toolbar=create('div');toolbar.className='chart-navigation';
  const range={unit:'seconds',start:seconds('2026-01-01'),end:seconds('2026-10-23'),min:seconds('2020-01-01'),max:seconds('2035-12-31'),step:86400,minSpan:12};
  const series={source:symbol==='ETHUSD'?'Coinbase Exchange':'Yahoo Finance',product:symbol==='ETHUSD'?'ETH-USD':symbol,firstDate:'2020-01-01T00:00:00Z',lastDate:'2026-10-23T00:00:00Z',retrievedAt:'2026-10-24T08:00:00Z',candles:[{time:seconds('2026-10-23'),close:123,volume:17}]};
  const state={frequency:'daily',chartType:'line',scale:'log',span:'4y',tool:'crosshair',range,rangeTouched:false,priceDomain:null,selectedTime:seconds('2026-10-23'),measurement:null,magnet:'off',showVolume:false,invertScale:false,
    controller:{getPriceScale:()=>({min:100,max:150}),getSelection:()=>({label:symbol+' 관측',copyText:'관측 123 USD'})},financialModel:{preserved:true}};
  let changes=0,restores=0;const calls=[];
  const adapter=mountNativeChartWorkbench({app,svg,plot,symbol,intervals:[{id:'daily',label:'1D',seconds:86400},{id:'weekly',label:'1W',seconds:604800}],state,getSeries:()=>series,navigation:{toolbar,openMenu:()=>calls.push('menu')},cancelInteraction(){},onChange:()=>changes++,onRestore:()=>restores++,
    actions:{frequency:value=>{state.frequency=value;},span:value=>{state.span=value;},fit:()=>calls.push('fit'),source:()=>calls.push('source'),forecast:()=>calls.push('forecast'),history:()=>calls.push('history')}});
  t.after(()=>{adapter.destroy();for(const [key,descriptor]of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
  return {document,window,workspace,sidebar,nav,app,svg,adapter,state,series,calls,changes:()=>changes,restores:()=>restores};
}

for(const symbol of ['ETHUSD','MSTR','BMNR'])test(`${symbol} retains the real shell and gives only its observations the common chart controls`,t=>{
  const f=fixture(t,symbol),{document,state,series,adapter}=f,original=structuredClone(series);
  assert.equal(document.querySelector('.workspace'),f.workspace);assert.equal(document.querySelector('.atlas-sidebar'),f.sidebar);assert.equal(document.querySelector('.atlas-nav'),f.nav);
  assert.equal(f.nav.closest('.workbench-rail'),document.querySelector('.workbench-rail'));
  assert.equal(document.querySelectorAll('.atlas-canvas-heading').length,1);assert.equal(document.querySelectorAll('.workbench-bottom-bar').length,1);
  assert.equal(document.querySelectorAll('.atlas-nav [data-atlas-page]').length,5);assert.equal(document.querySelector('#old-btc'),null);assert.equal(document.querySelector('#btc-only'),null);assert.ok(document.querySelector('#retained-prices'));
  assert.equal(document.body.dataset.page,'outlook');assert.equal(document.body.dataset.shell,'chart');
  adapter.command('tool','measure');adapter.command('magnet');adapter.command('toggle','showVolume');adapter.command('auto-scale');adapter.command('chart-type');
  assert.equal(state.tool,'measure');assert.equal(state.magnet,'weak');assert.equal(state.showVolume,true);assert.equal(state.chartType,'candles');assert.equal(state.priceDomain,null);
  adapter.command('undo');assert.equal(state.chartType,'line');assert.deepEqual(state.priceDomain,{min:100,max:150});adapter.command('redo');assert.equal(state.chartType,'candles');
  adapter.command('frequency','1m');assert.equal(state.frequency,'daily','equity/instrument capability allowlist rejects unsupported intervals');
  adapter.command('frequency','weekly');assert.equal(state.frequency,'weekly');adapter.command('undo');assert.equal(state.frequency,'daily');assert.ok(f.restores()>0);
  adapter.command('span','history');assert.equal(state.span,'all');adapter.command('history');assert.equal(f.calls.at(-1),'history');
  assert.deepEqual(series,original,'UI commands cannot rewrite source prices, volume or clocks');assert.deepEqual(state.financialModel,{preserved:true});
});

test('an embedded instrument owns the perimeter until native state is restored',t=>{
  const f=fixture(t),{document,adapter,state,window}=f;
  adapter.command('tool','measure');adapter.command('reader','settings');assert.equal(document.querySelector('#chart-reader').hidden,false);
  document.body.dataset.centerTool='housing';document.querySelector('#workbench-scale').textContent='월별 지수';
  adapter.command('chart-type');adapter.command('toggle','showVolume');adapter.update();
  assert.equal(state.chartType,'line');assert.equal(state.showVolume,false);assert.equal(document.querySelector('#workbench-scale').textContent,'월별 지수');
  document.dispatchEvent(new window.CustomEvent('atlas:close-detail'));assert.equal(document.querySelector('#chart-reader').hidden,true);
  delete document.body.dataset.centerTool;document.dispatchEvent(new window.CustomEvent('atlas:center-restored'));
  assert.equal(document.querySelector('#workbench-scale').textContent,'로그');assert.equal(document.querySelector('[data-chart-tool=measure]').getAttribute('aria-pressed'),'true');
  adapter.command('export');const exportDialog=document.querySelector('#chart-export-dialog');assert.ok(exportDialog.hasAttribute('open'));assert.match(exportDialog.textContent,/ETHUSD · USD · UTC/);assert.match(exportDialog.querySelector('a[download]').download,/^ETHUSD-/);
});

test('native date selection preserves the weekly grid and source bounds without inventing candles',()=>{
  const range={unit:'seconds',start:seconds('2026-01-05'),end:seconds('2026-10-19'),min:seconds('2020-01-06'),max:seconds('2035-12-31'),step:604800,minSpan:12};
  const request=parseGoToRequest({frequency:'weekly',mode:'range',start:'2025-01-01',end:'2025-08-19'}),next=nativeDateRange(range,request);
  assert.ok(next);assert.equal((next.start-range.min)%604800,0);assert.equal((next.end-range.min)%604800,0);assert.equal(next.min,range.min);assert.equal(next.max,range.max);assert.equal(next.allowEmpty,true);assert.equal('candles'in next,false);
  const state={frequency:'daily',range:{...range},measurement:{startDate:'2026-01-05',startPrice:123},controller:{},prices:[123],financialModel:{input:44}};
  const saved=nativeChartSnapshot(state);state.range.start+=86400;state.measurement.startPrice=999;
  assert.equal(saved.range.start,range.start);assert.equal(saved.measurement.startPrice,123);assert.equal('prices'in saved,false);assert.equal('financialModel'in saved,false);assert.equal('controller'in saved,false);
});
