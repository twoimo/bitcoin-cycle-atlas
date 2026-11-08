import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {drawReplaySelection} from '../dist/chart-replay-renderer.js';
import {chartPaneLayout} from '../dist/chart-overlays.js';
import {readChartReplayFocusTarget,readChartReplayFloatingGeometry,assertChartReplayPricePaneAccess} from '../scripts/verify-chart-replay-browser.mjs';

const box=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});

// The actual native renderer supplies its axis metadata. These DOM boundary
// dimensions model the reported 320×568 surface; browser hit rasterization
// remains part of the real Chrome gate, not a claim made by this fixture.
function fixture(symbol='ETHUSD'){
  const id=symbol==='ETHUSD'?'eth-chart':'equity-chart';
  const controls=['first','select-menu','mode-badge','pick','play','next','speed','update-interval','live'];
  const fields=['date','start','display','mode','record','horizon','details','pooled-retry','scrub','export'];
  const {document,window}=parseHTML(`<html><body><main class="atlas-plot">
    <svg id="${id}"></svg><section class="chart-replay-controls">
      <div class="chart-replay-bar"><div class="chart-replay-actions">${controls.map(name=>`<button data-cr="${name}"></button>`).join('')}</div></div>
      <button data-cr="exit"></button><button data-cr="pick-cancel" hidden></button>
      <section data-cr="select-panel" hidden>${fields.map(name=>`<div data-cr="${name}"></div>`).join('')}</section>
    </section><div id="unexpected-blocker"></div></main></body></html>`);
  const svg=document.querySelector('svg'),plot=document.querySelector('.atlas-plot'),root=document.querySelector('.chart-replay-controls');
  const bar=document.querySelector('.chart-replay-bar'),actions=document.querySelector('.chart-replay-actions'),exit=document.querySelector('[data-cr="exit"]');
  const rectangles=new Map([[svg,box(0,48,320,476)],[plot,box(0,48,320,476)],[root,box(0,48,320,476)],
    [bar,box(8,420,252,56)],[actions,box(13,425,242,46)],[exit,box(268,426,44,44)]]);
  const style=node=>({display:node.hidden?'none':'block',visibility:'visible',opacity:'1',pointerEvents:node===root?'none':'auto',
    backgroundColor:node===root?'rgba(0, 0, 0, 0)':'rgb(19, 23, 34)',flexWrap:'nowrap',fontFamily:'Arial',fontWeight:'400',fontStyle:'normal',letterSpacing:'0'});
  window.getComputedStyle=style;
  for(const node of document.querySelectorAll('*')){
    node.getBoundingClientRect=()=>rectangles.get(node)??box(13,426,44,44);
    node.getClientRects=()=>node.closest('[hidden]')?[]:[node.getBoundingClientRect()];
  }
  for(const node of [svg,plot])Object.defineProperties(node,{clientWidth:{value:320},clientHeight:{value:476}});
  Object.defineProperties(actions,{clientWidth:{value:242},scrollWidth:{value:640}});actions.scrollLeft=0;
  for(const node of [document.documentElement,document.body])Object.defineProperty(node,'scrollWidth',{value:320});
  let matrix={a:1,b:0,c:0,d:1,e:0,f:48},blocked=null;
  svg.getScreenCTM=()=>matrix;
  svg.createSVGPoint=()=>({x:0,y:0,matrixTransform(value){return {x:value.a*this.x+value.c*this.y+value.e,y:value.b*this.x+value.d*this.y+value.f};}});
  document.elementFromPoint=(x,y)=>{
    if(blocked&&Math.abs(blocked.x-x)<.01&&Math.abs(blocked.y-y)<.01)return document.querySelector('#unexpected-blocker');
    const area=rectangles.get(bar);
    if(x>=area.left&&x<=area.right&&y>=area.top&&y<=area.bottom)return bar;
    return svg;
  };
  drawReplaySelection({svg,symbol,source:symbol==='ETHUSD'?'Coinbase Exchange':'Nasdaq',start:'2026-01-01',end:'2026-01-10',chartType:'line',
    observations:Array.from({length:10},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,price:100+i}))});
  return {svg,bar,rectangles,setMatrix:value=>{matrix=value;},block:point=>{blocked=point;},read:()=>vm.runInNewContext(`(${readChartReplayFloatingGeometry.toString()})(options)`,
    {document,getComputedStyle:style,scrollX:0,scrollY:0,options:{chartSelector:'#'+id,panel:'.chart-replay-controls'}})};
}

for(const symbol of ['ETHUSD','MSTR','BMNR'])test(`${symbol} floating-bar probes use the actual native price pane instead of the full SVG`,()=>{
  const f=fixture(symbol),geometry=f.read();
  assert.equal(geometry.chart.width,320);assert.equal(geometry.chart.height,476);
  assert.equal(geometry.pricePane.left,Number(f.svg.dataset.plotLeft));
  assert.equal(geometry.pricePane.right,Number(f.svg.dataset.plotRight));
  assert.equal(geometry.pricePane.top,48+Number(f.svg.dataset.plotTop));
  assert.equal(geometry.pricePane.bottom,48+Number(f.svg.dataset.priceBottom));
  assert.ok(geometry.pricePane.right<geometry.chart.right,'Price-axis gutter is not price input space');
  assert.ok(geometry.pricePane.bottom<geometry.chart.bottom,'Time-axis gutter is not price input space');
  const formerlySampled={x:geometry.chart.left+geometry.chart.width*.16,y:geometry.chart.top+geometry.chart.height*.78};
  assert.equal(formerlySampled.x,51.2);assert.ok(Math.abs(formerlySampled.y-419.28)<1e-9);
  assert.ok(geometry.probes.length>=3);
  assert.ok(geometry.probes.every(point=>point.x>geometry.pricePane.left&&point.x<geometry.pricePane.right&&point.y>geometry.pricePane.top&&point.y<geometry.pricePane.bottom));
  assert.ok(!geometry.probeCandidates.some(point=>point.x===formerlySampled.x&&point.y===formerlySampled.y));
  assert.doesNotThrow(()=>assertChartReplayPricePaneAccess(geometry));
});

test('replay probes transform native viewBox coordinates into the actual screen coordinate system',()=>{
  const f=fixture();f.setMatrix({a:.75,b:0,c:0,d:.5,e:30,f:90});
  const geometry=f.read();
  assert.equal(geometry.pricePane.left,30+.75*Number(f.svg.dataset.plotLeft));
  assert.equal(geometry.pricePane.top,90+.5*Number(f.svg.dataset.plotTop));
  assert.equal(geometry.pricePane.bottom,90+.5*Number(f.svg.dataset.priceBottom));
  assert.doesNotThrow(()=>assertChartReplayPricePaneAccess(geometry));
});

test('known painted controls are excluded by their geometry while an arbitrary blocker still fails the SVG ownership gate',()=>{
  const f=fixture(),first=f.read(),known=first.probeCandidates.find(point=>point.xFraction===.5&&point.yFraction===.58);
  f.rectangles.set(f.bar,box(known.x-10,known.y-10,20,20));
  const withBar=f.read(),excluded=withBar.probeCandidates.find(point=>point.x===known.x&&point.y===known.y);
  assert.deepEqual(Array.from(excluded.excludedBy),['bar']);
  assert.ok(withBar.probes.length>=3);assert.doesNotThrow(()=>assertChartReplayPricePaneAccess(withBar));
  f.block(withBar.probes[0]);const blocked=f.read();
  assert.equal(blocked.probes.length,withBar.probes.length,'A failed hit cannot remove its probe');
  assert.equal(blocked.probes[0].owner.id,'unexpected-blocker');
  assert.throws(()=>assertChartReplayPricePaneAccess(blocked),/unobstructed price-pane probe.*unexpected-blocker.*pricePane.*excludedRects/);
});

test('missing or detached native price-axis metadata fails instead of silently probing the whole SVG',()=>{
  for(const invalid of ['metadata','matrix']){
    const f=fixture();if(invalid==='metadata')delete f.svg.dataset.priceBottom;else f.setMatrix(null);
    const geometry=f.read();assert.equal(geometry.pricePane,null);assert.equal(geometry.probes.length,0);
    assert.throws(()=>assertChartReplayPricePaneAccess(geometry),/transformable price-pane bounds/);
  }
});

test('the pre-replay focus click uses the SVG gutter even when its center opens a research article',()=>{
  const f=fixture(),document=f.svg.ownerDocument;
  const article=document.createElementNS('http://www.w3.org/2000/svg','g');article.setAttribute('role','button');article.dataset.forecastEvidence='model-method';f.svg.append(article);
  document.elementFromPoint=x=>x<Number(f.svg.dataset.plotLeft)?f.svg:article;
  const nativeContext=vm.createContext({document});
  const read=()=>vm.runInContext(`(${readChartReplayFocusTarget.toString()})('#eth-chart')`,nativeContext);
  assert.equal(document.elementFromPoint(160,286),article,'the old center click would open the source-owned article');
  const live=read();assert.ok(live,'the live chart needs the same safe native focus entrance as replay');
  assert.equal(live.reachesChart,true);assert.equal(live.interactive,false);assert.ok(live.point.x<Number(f.svg.dataset.plotLeft));
  f.svg.dataset.chartReplayActive='true';
  assert.deepEqual(read(),live,'replay does not move the native focus entrance');
  document.elementFromPoint=()=>article;
  assert.equal(read().interactive,true,'an interactive SVG descendant cannot masquerade as an inert focus target');
  document.elementFromPoint=()=>document.querySelector('#unexpected-blocker');
  assert.equal(read().reachesChart,false,'an overlay blocker cannot be bypassed by programmatic focus');
});

test('replay keeps the live pane allocation unchanged unless its footer inset is explicitly requested',()=>{
  const options={width:795,height:285,top:18,volume:false,cycleTiming:true},live=chartPaneLayout(options);
  assert.deepEqual(Object.fromEntries(['axisY','dateBadgeTop','bottom','priceBottom','cycleTop','cycleBottom'].map(key=>[key,live[key]])),
    {axisY:256,dateBadgeTop:264,bottom:239,priceBottom:206,cycleTop:230,cycleBottom:239});
  for(const bottomInset of [0,-10,NaN,Infinity])assert.deepEqual(chartPaneLayout({...options,bottomInset}),live);
});

test('touch replay transport keeps 44px controls in its own lane below time labels and every requested pane',async()=>{
  const css=await readFile(new URL('../dist/chart-replay.css',import.meta.url),'utf8');
  const {document}=parseHTML(`<html><head><style>${css}</style></head></html>`);
  const coarse=Array.from(document.querySelector('style').sheet.cssRules).find(rule=>rule.media?.mediaText==='(max-width:620px), (pointer:coarse)');
  const controls=Array.from(coarse.cssRules).find(rule=>rule.selectorText==='.chart-replay-controls').style;
  const barHeight=Number.parseFloat(controls.getPropertyValue('--replay-bar-height'));
  const targetHeight=Number.parseFloat(controls.getPropertyValue('--replay-control-size'));
  assert.ok(targetHeight>=44,'compact presentation must preserve touch targets');
  assert.ok(barHeight>=targetHeight+10,'controls retain their padding and border');
  // Includes the observed short 900×430 surface, where the plot is795×285.
  // Verify the actual allocator; native CSS/hit geometry remains a browser gate.
  for(const [width,height] of [[320,476],[390,752],[795,285],[1024,660],[1440,760]]){
    const bottomInset=barHeight+40,barTop=height-12-barHeight;
    const pane=chartPaneLayout({width,height,top:18,volume:true,drawdown:true,states:true,cycleTiming:true,bottomInset});
    assert.ok(pane.priceBottom>pane.top,'reserving transport must leave a usable price pane');
    for(const name of ['volume','dd','state','cycle'])assert.ok(pane[name+'Bottom']>pane[name+'Top'],'requested '+name+' pane remains present at '+width+'×'+height);
    assert.ok(pane.priceBottom<pane.cycleTop);assert.ok(pane.volumeBottom<pane.axisY);
    assert.ok(pane.dateBadgeTop+21<=height-bottomInset,'date labels stay above the reserved lane');
    assert.ok(pane.dateBadgeTop+21<barTop-16,'transport and its overflow hint do not cover time labels');
  }
});
