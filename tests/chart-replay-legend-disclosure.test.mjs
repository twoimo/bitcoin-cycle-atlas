import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {priceLegendMarkup} from '../dist/price-legend.js';
import {cycleLegendMarkup} from '../dist/cycle-milestones-view.js';
import * as chartLegend from '../dist/ui/chart-legend.js';
import {readChartReplayLegendStatusAccess,assertChartReplayLegendStatusAccess} from '../scripts/verify-chart-replay-browser.mjs';

const expectedStatus=['실선 · 관측 사후 기준','점선 · 잠정·가정','◇ 거시 시계 · ○ 예시 경로'];
const statusSelector='.cycle-style-sample,.cycle-reference-key';
const text=node=>node.textContent.replace(/\s+/g,' ').trim();
const box=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const source=readFileSync(new URL('../dist/lab-view.js',import.meta.url),'utf8');
const start=source.indexOf('    onAtlasFrame:'),end=source.indexOf('\n    }});',start);
assert.ok(start>=0&&end>start,'Exercise the actual Atlas replay frame callback');
const callback=source.slice(start,end).replace(/^\s*onAtlasFrame:/,'')+'\n}';
const {mountChartLegend}=chartLegend;

function fixture(width){
  const {document,window}=parseHTML(`<html><body><div class="atlas-plot"><svg id="lab-chart"></svg><div class="lab-chart-foot"><div id="atlas-chart-legend"></div></div></div><span id="atlas-chart-caveat"></span><span id="lab-chart-title"></span><span id="lab-asof"></span><span id="atlas-chart-note"></span><input id="lab-window"></body></html>`);
  const observers=[],frames=new Map(),fontListeners=new Map(),windowListeners=new Map();
  let frameId=0,availableWidth=480,entryWidth=80,measurements=0,focused=null;
  class MutationObserver{
    constructor(fn){this.fn=fn;this.targets=new Set();this.records=[];observers.push(this);}
    observe(node){this.targets.add(node);}disconnect(){this.targets.clear();this.records=[];}
    takeRecords(){const records=this.records;this.records=[];return records;}
  }
  const measure=node=>{
    node.getBoundingClientRect=()=>{measurements++;return box(0,0,node.classList.contains('chart-legend-row-label')?32:node.classList.contains('chart-legend-more')?32:entryWidth,20);};
    node.focus=()=>{focused=node;};
    node.getClientRects=()=>node.closest('[hidden]')?[]:[node.getBoundingClientRect()];return node;
  };
  const create=document.createElement.bind(document);document.createElement=(...args)=>measure(create(...args));
  Object.defineProperty(document,'activeElement',{get:()=>focused});
  Object.defineProperty(document,'fonts',{value:{ready:{then(){}},addEventListener:(name,fn)=>fontListeners.set(name,fn),removeEventListener:name=>fontListeners.delete(name)}});
  Object.defineProperty(document,'defaultView',{value:{CustomEvent:window.CustomEvent,MutationObserver,innerWidth:width,
    requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
    addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:name=>windowListeners.delete(name)}});
  const plot=document.querySelector('.atlas-plot'),legend=document.querySelector('#atlas-chart-legend');
  let prototype=legend,html;
  while(!html&&prototype){html=Object.getOwnPropertyDescriptor(prototype,'innerHTML');prototype=Object.getPrototypeOf(prototype);}
  Object.defineProperty(legend,'innerHTML',{get:()=>html.get.call(legend),set:value=>{
    html.set.call(legend,value);
    for(const observer of observers)if(observer.targets.has(legend))observer.records.push({type:'childList',target:legend});
  }});
  plot.getBoundingClientRect=()=>box(0,0,width,700);
  Object.defineProperties(plot,{clientWidth:{value:width},clientHeight:{value:700}});
  Object.defineProperty(legend,'clientWidth',{get:()=>availableWidth});
  Object.assign(document.querySelector('svg').dataset,{plotLeft:'8',plotRight:String(width-80),plotTop:'18',priceBottom:'600'});
  const frame=vm.runInNewContext('('+callback+')',{document,CustomEvent:window.CustomEvent,$:selector=>document.querySelector(selector),
    priceLegendMarkup,cycleLegendMarkup,writeChartLegendMarkup:chartLegend.writeChartLegendMarkup,dateLabel:value=>value,chartInterval:()=>({label:'1D'}),state:{scenario:'base'},DEFAULT_CHART_SPAN:'focus'});
  const render=(mode='current-chart-snapshot',cycles=true,{frequency='daily',candles=false,forming=false,cursorDate='2026-06-01',provider='Coin Metrics'}={})=>{
    frame({session:{mode,asOf:'2026-05-30',identity:{recordKind:'reconstructed'}},
      data:{frequency,observedRows:[{date:cursorDate}],observedCandles:candles?[{date:cursorDate,endDate:cursorDate,complete:!forming,daysIncluded:2}]:[],priceSource:provider,candleSource:'Bitstamp',frame:{cursorDate,forecast:[{lower:1,upper:3}]}},
      context:{presentation:{band:true,showTurns:true,showCycleMarkers:cycles,showCycleIntervals:cycles}},start:'2026-01-01',end:'2028-01-01',chartType:candles?'candles':'line',window:'focus'});
    for(const node of legend.querySelectorAll('*'))measure(node);
    for(const observer of observers){const records=observer.takeRecords();if(records.length)observer.fn(records);}
  };
  const flush=()=>{for(let limit=0;frames.size&&limit<10;limit++){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}assert.equal(frames.size,0,'Legend layout must settle without an animation loop');};
  return {document,plot,legend,render,flush,measurements:()=>measurements,setWidth:value=>{availableWidth=value;},setEntryWidth:value=>{entryWidth=value;},
    fontLoaded:()=>fontListeners.get('loadingdone')?.(),windowResized:()=>windowListeners.get('resize')?.(),
    pendingMutation:record=>{for(const observer of observers)if(observer.targets.has(legend))observer.records.push(record);}};
}

test('unchanged actual replay frames preserve legend entries, native disclosure focus and open-dialog samples',()=>{
  const f=fixture(1440);f.render();const controller=mountChartLegend({plot:f.plot});
  const dialog=f.document.querySelector('#chart-legend-dialog');dialog.showModal=()=>{dialog.open=true;};
  dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new f.document.defaultView.CustomEvent('close'));};
  try{
    f.render();f.flush();
    const entries=[...f.legend.querySelectorAll('.chart-legend-entry')],trigger=f.legend.querySelector('[data-legend-group="cycle"] .chart-legend-more');
    assert.equal(entries.length,13);trigger.focus();
    for(const cursorDate of ['2026-06-02','2026-06-03','2026-06-04'])f.render('current-chart-snapshot',true,{cursorDate});
    f.flush();
    assert.ok([...f.legend.querySelectorAll('.chart-legend-entry')].every((node,index)=>node===entries[index]),'Daily cursor updates must not replace unchanged semantic legend nodes');
    assert.equal(trigger.isConnected,true);assert.equal(f.document.activeElement,trigger);
    assert.match(f.document.querySelector('#lab-asof').textContent,/2026-06-04 UTC/,'Reusing the legend must not freeze the disclosed observation clock');
    trigger.click();const samples=[...dialog.querySelectorAll('.chart-legend-dialog-sample')];
    f.render('current-chart-snapshot',true,{cursorDate:'2026-06-05'});f.flush();
    assert.ok([...dialog.querySelectorAll('.chart-legend-dialog-sample')].every((node,index)=>node===samples[index]),'An unchanged frame must retain the open disclosure content');
    assert.deepEqual([...dialog.querySelectorAll(statusSelector)].map(text),expectedStatus);
    dialog.close();assert.equal(f.document.activeElement,trigger,'Closing returns focus to the same surviving disclosure control');
  }finally{controller.destroy();}
});

test('semantic source changes and external restoration cannot reuse a stale replay legend',()=>{
  const f=fixture(1440);f.render();const controller=mountChartLegend({plot:f.plot});
  const dialog=f.document.querySelector('#chart-legend-dialog');dialog.showModal=()=>{dialog.open=true;};
  try{
    f.render();f.flush();f.legend.querySelector('[data-legend-group="cycle"] .chart-legend-more').click();
    f.render('current-chart-snapshot',true,{frequency:'weekly',candles:true,forming:true});f.flush();
    assert.match(dialog.querySelector('.price-legend-item').getAttribute('title'),/공개된 실제 일봉.*진행 중 주봉/);
    f.render('current-chart-snapshot',true,{frequency:'weekly',candles:true,forming:false});f.flush();
    assert.match(dialog.querySelector('.price-legend-item').getAttribute('title'),/완료된 OHLC/);
    f.render('current-chart-snapshot',true,{provider:'Changed venue'});f.flush();
    assert.match(dialog.querySelector('.price-legend-item').getAttribute('title'),/Changed venue/);
    f.legend.innerHTML=priceLegendMarkup({source:'External restoration'});
    f.render('current-chart-snapshot',true,{provider:'Changed venue'});f.flush();
    assert.equal(dialog.querySelectorAll('.chart-legend-dialog-sample').length,13,'A replaced source must recover the requested complete legend even before observer delivery');
    const sample=f.legend.querySelector('.price-legend-item');sample.setAttribute('title','Stale wrapped source');
    f.pendingMutation({type:'attributes',target:sample,attributeName:'title'});
    f.setWidth(320);controller.refresh();
    assert.equal(dialog.querySelector('.price-legend-item').getAttribute('title'),'Stale wrapped source','A resize must deliver a pending external meaning change before disconnecting its observer');
    f.render('current-chart-snapshot',true,{provider:'Changed venue'});f.flush();
    assert.match(dialog.querySelector('.price-legend-item').getAttribute('title'),/Changed venue/,'Pending external mutations must invalidate the semantic writer cache');
    f.render('current-chart-snapshot',false);f.flush();assert.equal(dialog.querySelectorAll(statusSelector).length,0);
  }finally{controller.destroy();}
});

test('legend fitting reuses stable measurements and invalidates on actual width, font, visibility and source changes',()=>{
  const f=fixture(1440);f.render();const controller=mountChartLegend({plot:f.plot});
  const visible=()=>[...f.legend.querySelectorAll('.chart-legend-row')].reduce((sum,row)=>sum+Number(row.dataset.visibleCount),0);
  try{
    f.render();f.flush();const initial=f.measurements(),wide=visible();
    const slot=controller.refresh();
    const shifted=controller.refresh({width:1440,height:700,left:8,right:1360,top:18,bottom:600,protectedAnchors:[{x:slot.x,y:slot.y,width:slot.width,height:slot.height}]});
    assert.ok(shifted.y>slot.y,'Protected price/date anchors still change actual placement while fitting is reused');
    assert.equal(f.measurements(),initial,'Repeated geometry refresh must not unhide and remeasure every unchanged entry');
    f.setWidth(320);controller.refresh();assert.ok(f.measurements()>initial);assert.ok(visible()<wide,'A narrower actual row must expose fewer whole entries');
    const narrow=visible(),beforeFont=f.measurements();f.setEntryWidth(140);f.fontLoaded();f.flush();
    assert.ok(f.measurements()>beforeFont);assert.ok(visible()<narrow,'Loaded font metrics must be applied at the same available width');
    const settled=f.measurements();controller.refresh();assert.equal(f.measurements(),settled);
    f.document.querySelector('.lab-chart-foot').hidden=true;controller.refresh();
    f.document.querySelector('.lab-chart-foot').hidden=false;f.setEntryWidth(80);controller.refresh();assert.equal(visible(),narrow,'Visible rows must not retain hidden-state measurements');
    const beforeSource=f.measurements();f.render('cutoff-backtest');f.flush();assert.ok(f.measurements()>beforeSource,'New labels and meanings require fresh fitting');
    const beforeResize=f.measurements();f.windowResized();f.flush();assert.ok(f.measurements()>beforeResize,'Viewport/style changes invalidate the measured row even when its supplied width is unchanged');
  }finally{controller.destroy();}
});

for(const width of [320,1440])test(`actual replay frame keeps all three cycle meanings through the ${width}px full-list disclosure`,()=>{
  const f=fixture(width);f.render();
  assert.deepEqual([...f.legend.querySelectorAll(statusSelector)].map(text),expectedStatus);
  const controller=mountChartLegend({plot:f.plot}),dialog=f.document.querySelector('#chart-legend-dialog');
  dialog.showModal=()=>{dialog.open=true;};
  try{
    const reference=f.legend.querySelector('.cycle-reference-key');
    assert.ok(reference.closest('[hidden]'),'The real compact layout places the reference behind its disclosure');
    const trigger=f.document.querySelector(width===320?'.chart-legend-open':'.chart-legend-row[data-legend-group="cycle"] .chart-legend-more');
    assert.equal(trigger.hidden,false);trigger.click();assert.equal(dialog.open,true);
    const statuses=()=>[...dialog.querySelectorAll(statusSelector)];
    assert.deepEqual(statuses().map(text),expectedStatus);
    assert.ok(statuses().every(node=>!node.closest('[hidden],[inert],[aria-hidden="true"]')),'Full-list clones must not inherit compact visibility');
    f.render('cutoff-backtest');
    assert.deepEqual(statuses().map(text),expectedStatus,'A later replay frame must retain the reference meaning in the open modal');
    assert.ok(dialog.textContent.includes('고정 예측')&&dialog.textContent.includes('모형 범위'));
    assert.equal(dialog.querySelectorAll('.cycle-reference-key').length,1);
    f.render('current-chart-snapshot',false);
    assert.equal(dialog.querySelectorAll(statusSelector).length,0,'A disabled cycle layer must not advertise cycle semantics');
  }finally{controller.destroy();}
});

test('the browser disclosure gate rejects missing, hidden, clipped or covered reference meanings',()=>{
  // Deterministic DOM/geometry boundary only. Native wheel and hit ownership
  // are checked by the canonical browser run using these same reader/oracle.
  const {document}=parseHTML(`<html><body><dialog id="chart-legend-dialog" open><div class="chart-legend-dialog-content">${expectedStatus.map((label,index)=>`<span class="${index===2?'cycle-reference-key':'cycle-style-sample'}">${label}</span>`).join('')}</div></dialog></body></html>`);
  const owner=document.querySelector('.chart-legend-dialog-content'),entries=[...owner.children],rects=new Map([[owner,box(0,0,320,220)],...entries.map((node,index)=>[node,box(16,24+index*55,260,24)])]);
  for(const node of [owner,...entries]){node.getBoundingClientRect=()=>rects.get(node);node.getClientRects=()=>node.closest('[hidden]')?[]:[node.getBoundingClientRect()];}
  Object.defineProperties(owner,{scrollHeight:{value:1000},clientHeight:{value:220}});owner.scrollTop=780;
  const style=()=>({display:'block',visibility:'visible',opacity:'1',overflowY:'auto'});
  let covered=false;
  document.elementFromPoint=(x,y)=>covered?owner:entries.find(node=>{const r=rects.get(node);return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
  const read=()=>vm.runInNewContext('('+readChartReplayLegendStatusAccess.toString()+')()',{document,getComputedStyle:style});
  const check=()=>assertChartReplayLegendStatusAccess(JSON.parse(JSON.stringify(read())),expectedStatus);
  assert.doesNotThrow(check);
  entries[2].hidden=true;assert.throws(check,/meaning remains hidden/);entries[2].hidden=false;
  const original=rects.get(entries[2]);rects.set(entries[2],box(16,210,260,24));assert.throws(check,/complete meaning/);rects.set(entries[2],original);
  covered=true;assert.throws(check,/meaning is covered/);covered=false;
  entries[2].remove();assert.throws(check,/lost a provisional, retrospective or reference meaning/);
});
