import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountNativeChartApp,mountNativeChartWorkbench} from '../dist/native-chart-workbench.js';
import {atlasNavigationPages} from '../dist/atlas-navigation.js';

// 2026-11-10 contract: 621-959px overlays the detail reader instead of
// splitting the plot. The overlay owns keyboard traversal and makes only the
// covered plot inert; every open/close/destroy restores the exact inert and
// aria-hidden state the boot shell or another owner had on the plot, and the
// price-chart controller shares the same 959px boundary.

const seconds=value=>Date.parse(value+'T00:00:00Z')/1000;

function fixture(t,symbol='ETHUSD'){
  const {document,window}=parseHTML(`<html><body><div id="atlas-boot-shell"></div>
    <nav class="atlas-sidebar"><button class="atlas-brand">Atlas</button><div class="atlas-side-foot">stale</div>
      <nav class="atlas-nav">${atlasNavigationPages.map(page=>`<button data-atlas-page="${page.id}"><span data-icon="nav"></span><span>${page.label}</span></button>`).join('')}</nav>
    </nav>
    <div class="workspace" data-boot-content inert aria-hidden="true"><main id="main" tabindex="-1"></main></div>
    <header data-atlas-shell></header><div id="atlas-boot-clock"></div>
    <div class="atlas-plot" id="legacy-plot"></div></body></html>`);
  const previousMatchMedia=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
  const previousSerializer=Object.getOwnPropertyDescriptor(globalThis,'XMLSerializer');
  const medias=new Map();
  const matchMedia=query=>{if(!medias.has(query))medias.set(query,{query,matches:false,listeners:new Set(),
    addEventListener(type,fn){if(type==='change')this.listeners.add(fn);},
    removeEventListener(type,fn){if(type==='change')this.listeners.delete(fn);}});return medias.get(query);};
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:matchMedia});
  Object.defineProperty(globalThis,'XMLSerializer',{configurable:true,value:class{serializeToString(node){return node.outerHTML;}}});
  const create=document.createElement.bind(document);
  document.createElement=tag=>{const node=create(tag);if(tag==='select')Object.defineProperty(node,'value',{value:'',writable:true,configurable:true});if(tag==='dialog'){
    node.showModal=()=>node.setAttribute('open','');node.close=()=>{if(node.hasAttribute('open')){node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));}};
  }return node;};
  let focused=null;
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>focused});
  const proto=window.HTMLElement.prototype,priorFocus=proto.focus;
  proto.focus=function(){focused=this;try{this.dispatchEvent(new window.Event('focusin',{bubbles:true}));}catch{}};
  const app=create('main');app.id='main';app.className='eth-app';app.dataset.bootContent='';
  app.innerHTML=`<nav class="eth-tools"><button data-eth-action="pan">legacy</button></nav><header class="eth-topbar"><button id="eth-symbol">${symbol}</button><div class="eth-interval-buttons"><button data-eth-interval="daily">1D</button></div></header><div class="atlas-plot"><svg id="eth-chart"></svg></div>`;
  mountNativeChartApp(app);
  const plot=app.querySelector('.atlas-plot'),svg=plot.querySelector('svg'),toolbar=create('div');toolbar.className='chart-navigation';
  const range={unit:'seconds',start:seconds('2026-01-01'),end:seconds('2026-10-23'),min:seconds('2020-01-01'),max:seconds('2035-12-31'),step:86400,minSpan:12};
  const series={source:'Coinbase Exchange',product:'ETH-USD',firstDate:'2020-01-01T00:00:00Z',lastDate:'2026-10-23T00:00:00Z',retrievedAt:'2026-10-24T08:00:00Z',candles:[{time:seconds('2026-10-23'),close:123,volume:17}]};
  const state={frequency:'daily',chartType:'line',scale:'log',span:'4y',tool:'crosshair',range,rangeTouched:false,priceDomain:null,selectedTime:seconds('2026-10-23'),measurement:null,magnet:'off',showVolume:false,invertScale:false,
    controller:{getPriceScale:()=>({min:100,max:150}),getSelection:()=>({label:symbol+' 관측',copyText:'관측 123 USD'})},financialModel:{preserved:true}};
  const adapter=mountNativeChartWorkbench({app,svg,plot,symbol,intervals:[{id:'daily',label:'1D',seconds:86400}],state,getSeries:()=>series,navigation:{toolbar,openMenu:()=>{}},cancelInteraction(){},onChange(){},onRestore(){},
    actions:{frequency(){},span(){},fit(){},source(){},forecast(){},history(){}}});
  const attachedDestroy=adapter.destroy;
  t.after(()=>{
    try{attachedDestroy();}catch{}
    proto.focus=priorFocus;
    document.createElement=create;
    if(previousMatchMedia)Object.defineProperty(globalThis,'matchMedia',previousMatchMedia);else Reflect.deleteProperty(globalThis,'matchMedia');
    if(previousSerializer)Object.defineProperty(globalThis,'XMLSerializer',previousSerializer);else Reflect.deleteProperty(globalThis,'XMLSerializer');
  });
  const overlayQuery='(max-width:959px)';
  return {document,window,app,medias,adapter,series,state,
    overlay:()=>medias.get(overlayQuery),
    resize(matches){const media=medias.get(overlayQuery);media.matches=matches;for(const fn of [...media.listeners])fn({matches});},
    key(target,init){const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(event,init);(target||document.body).dispatchEvent(event);return event;},
    command:action=>adapter.command('reader',action),
    reader:document.querySelector('#chart-reader')};
}

test('the compact-tablet reader overlays the plot and inerts only the covered surface',t=>{
  const f=fixture(t),{document,app,reader}=f;
  assert.equal(f.overlay().query,'(max-width:959px)','the overlay starts where the split layout ends');
  assert.equal(Boolean(app.inert),false,'the boot shell has released the plot before interaction');
  assert.equal(reader.hidden,true);
  f.resize(true);
  assert.equal(reader.hidden,true,'a closed reader never covers the plot');
  assert.equal(Boolean(app.inert),false,'a viewport change alone does not inert the plot');
  f.command('settings');
  assert.equal(reader.hidden,false);
  assert.equal(reader.dataset.overlay,'true');
  assert.equal(Boolean(app.inert),true,'the plot behind the overlay is inert while covered');
  assert.equal(app.getAttribute('aria-hidden'),'true');
  assert.equal(Boolean(document.querySelector('.workbench-rail').inert),false,'the rail keeps its own controls');
  f.command('settings');
  assert.equal(reader.hidden,true);
  assert.equal(reader.dataset.overlay,'false');
  assert.equal(Boolean(app.inert),false,'closing restores the original inert state');
  assert.equal(app.hasAttribute('aria-hidden'),false,'closing restores the original aria state');
});

test('a boot-owned inert or aria value on the plot is restored exactly, never released',t=>{
  const f=fixture(t),{app,reader}=f;
  f.resize(true);
  app.inert=true;app.setAttribute('aria-hidden','false');
  f.command('settings');
  assert.equal(Boolean(app.inert),true);assert.equal(app.getAttribute('aria-hidden'),'true');
  f.command('settings');
  assert.equal(Boolean(app.inert),true,'a boot-owned inert is re-applied, not cleared');
  assert.equal(app.getAttribute('aria-hidden'),'false','a source-owned aria value comes back verbatim');
  assert.equal(reader.hidden,true);
});

test('the desktop split keeps the plot operable and the overlay takes it back on resize',t=>{
  const f=fixture(t),{app,reader}=f;
  f.command('settings');
  assert.equal(Boolean(app.inert),false,'the desktop split-panel never inerts the plot');
  assert.equal(reader.dataset.overlay,'false');
  assert.equal(reader.hidden,false);
  f.resize(true);
  assert.equal(Boolean(app.inert),true,'shrinking into the overlay range takes ownership');
  f.resize(false);
  assert.equal(Boolean(app.inert),false,'growing back releases the plot');
  assert.equal(reader.dataset.overlay,'false');
  assert.equal(reader.hidden,false,'the open detail survives the viewport change');
});

test('the overlay owns Tab and Escape while it covers the plot',t=>{
  const f=fixture(t),{document,reader}=f;
  f.resize(true);f.command('settings');
  const railButtons=[...document.querySelectorAll('.workbench-rail button:not(:disabled)')];
  assert.ok(railButtons.length>0,'the rail stays a real focus owner under the overlay');
  const readerButtons=[...reader.querySelectorAll('button:not(:disabled)')];
  assert.ok(readerButtons.length>0);
  const first=readerButtons[0];
  railButtons[railButtons.length-1].focus();
  assert.equal(document.activeElement,railButtons[railButtons.length-1]);
  const forward=f.key(document.activeElement,{key:'Tab'});
  assert.equal(forward.defaultPrevented,true,'Tab from the last overlay target is owned, not leaked to the plot');
  assert.equal(document.activeElement,first,'Tab wraps to the reader heading controls');
  const backward=f.key(first,{key:'Tab',shiftKey:true});
  assert.equal(backward.defaultPrevented,true,'shift+Tab from the first overlay target is owned');
  assert.equal(document.activeElement,railButtons[railButtons.length-1]);
  const escape=f.key(document.activeElement,{key:'Escape'});
  assert.equal(escape.defaultPrevented,true,'Escape belongs to the open overlay reader');
  assert.equal(reader.hidden,true,'Escape closes the detail');
  assert.equal(Boolean(f.app.inert),false,'Escape releases the plot');
});

test('destroying an open overlay reader restores the plot before removing the panel',t=>{
  const f=fixture(t),{document,app}=f;
  f.resize(true);f.command('settings');
  assert.equal(Boolean(app.inert),true);
  f.adapter.destroy();
  assert.equal(Boolean(app.inert),false,'destroy cannot leave the document inert');
  assert.equal(app.hasAttribute('aria-hidden'),false);
  assert.equal(document.querySelector('#chart-reader'),null);
});

test('the price-chart controller shares the 959px boundary and hides the split handle',()=>{
  const source=readFileSync(new URL('../dist/viewport-workspace.js',import.meta.url),'utf8');
  assert.ok(source.includes("matchMedia('(max-width:959px)')"),'the BTC overlay must start at the overlay boundary, not 900px');
  assert.equal(source.includes("matchMedia('(max-width:900px)')"),false,'no split-layout overlay may stop above the overlay range');
  assert.ok(source.includes("reader.querySelector(':scope > .reader-resize')"),'the split handle visibility follows the overlay state');
  assert.ok(source.includes('resize.hidden=overlay.matches'),'the handle starts hidden whenever the panel already overlays');
  assert.ok(source.includes('isEnabled:()=>!reader.hidden&&!overlay.matches'),'the handle stays disabled while overlaying');
});
