import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {priceLegendMarkup} from '../dist/price-legend.js';
import {cycleLegendMarkup} from '../dist/cycle-milestones-view.js';
import {mountChartLegend} from '../dist/ui/chart-legend.js';
import {readChartReplayLegendStatusAccess,assertChartReplayLegendStatusAccess} from '../scripts/verify-chart-replay-browser.mjs';

const expectedStatus=['실선 · 관측 사후 기준','점선 · 잠정·가정','◇ 거시 시계 · ○ 예시 경로'];
const statusSelector='.cycle-style-sample,.cycle-reference-key';
const text=node=>node.textContent.replace(/\s+/g,' ').trim();
const box=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const source=readFileSync(new URL('../dist/lab-view.js',import.meta.url),'utf8');
const start=source.indexOf('    onAtlasFrame:'),end=source.indexOf('\n    }});',start);
assert.ok(start>=0&&end>start,'Exercise the actual Atlas replay frame callback');
const callback=source.slice(start,end).replace(/^\s*onAtlasFrame:/,'')+'\n}';

function fixture(width){
  const {document,window}=parseHTML(`<html><body><div class="atlas-plot"><svg id="lab-chart"></svg><div class="lab-chart-foot"><div id="atlas-chart-legend"></div></div></div><span id="atlas-chart-caveat"></span><span id="lab-chart-title"></span><span id="lab-asof"></span><span id="atlas-chart-note"></span><input id="lab-window"></body></html>`);
  const observers=[];
  class MutationObserver{
    constructor(fn){this.fn=fn;this.targets=new Set();observers.push(this);}
    observe(node){this.targets.add(node);}disconnect(){this.targets.clear();}
  }
  const measure=node=>{
    node.getBoundingClientRect=()=>box(0,0,node.classList.contains('chart-legend-row-label')?32:node.classList.contains('chart-legend-more')?32:80,20);
    node.getClientRects=()=>node.closest('[hidden]')?[]:[node.getBoundingClientRect()];return node;
  };
  const create=document.createElement.bind(document);document.createElement=(...args)=>measure(create(...args));
  Object.defineProperty(document,'defaultView',{value:{CustomEvent:window.CustomEvent,MutationObserver,innerWidth:width,addEventListener(){},removeEventListener(){}}});
  const plot=document.querySelector('.atlas-plot'),legend=document.querySelector('#atlas-chart-legend');
  plot.getBoundingClientRect=()=>box(0,0,width,700);
  Object.defineProperties(plot,{clientWidth:{value:width},clientHeight:{value:700}});
  Object.defineProperty(legend,'clientWidth',{value:480});
  Object.assign(document.querySelector('svg').dataset,{plotLeft:'8',plotRight:String(width-80),plotTop:'18',priceBottom:'600'});
  const frame=vm.runInNewContext('('+callback+')',{document,CustomEvent:window.CustomEvent,$:selector=>document.querySelector(selector),
    priceLegendMarkup,cycleLegendMarkup,dateLabel:value=>value,chartInterval:()=>({label:'1D'}),state:{scenario:'base'},DEFAULT_CHART_SPAN:'focus'});
  const render=(mode='current-chart-snapshot',cycles=true)=>{
    frame({session:{mode,asOf:'2026-05-30',identity:{recordKind:'reconstructed'}},
      data:{frequency:'daily',observedRows:[{date:'2026-05-30'}],observedCandles:[],priceSource:'Coin Metrics',candleSource:'Bitstamp',frame:{cursorDate:'2026-06-01',forecast:[{lower:1,upper:3}]}},
      context:{presentation:{band:true,showTurns:true,showCycleMarkers:cycles,showCycleIntervals:cycles}},start:'2026-01-01',end:'2028-01-01',chartType:'line',window:'focus'});
    for(const node of legend.querySelectorAll('*'))measure(node);
    for(const observer of observers)if(observer.targets.has(legend))observer.fn([]);
  };
  return {document,plot,legend,render};
}

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
