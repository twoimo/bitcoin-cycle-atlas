import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mountUiReviewCase,readHostedUiReadiness,readUiContractGeometry,readShellContract,uiContractBrowserCases} from '../scripts/verify-ui-contract-browser.mjs';
import {uiReviewBaseline} from '../scripts/verify-ui-cloudflare.mjs';

const box=(x,y,width,height)=>({x,y,left:x,top:y,right:x+width,bottom:y+height,width,height});
function geometryFixture(){
  const {document}=parseHTML('<html><body><div class="atlas-plot"><svg id="lab-chart"><text class="price-time-label">26.06</text><g class="cross-date-tag"><text>2026-06-01</text></g></svg><section class="chart-replay-controls"><div class="chart-replay-bar"><div class="chart-replay-actions"></div><span class="chart-replay-scroll-hint" hidden>더 보기</span></div><button data-cr="pick-cancel">선택 취소</button></section></div></body></html>');
  const svg=document.querySelector('svg');Object.assign(svg.dataset,{plotLeft:'8',plotRight:'254',plotTop:'18',priceBottom:'450'});
  const rects=new Map([
    [document.querySelector('.atlas-plot'),box(0,0,320,600)],
    [svg,box(0,0,320,600)],
    [document.querySelector('.chart-replay-bar'),box(10,544,300,44)],
    [document.querySelector('.chart-replay-actions'),box(15,549,250,34)],
    [document.querySelector('[data-cr="pick-cancel"]'),box(100,490,120,44)],
    [document.querySelector('.price-time-label'),box(116,496,80,14)],
    [document.querySelector('.cross-date-tag'),box(110,513,100,18)],
    [document.querySelector('.cross-date-tag text'),box(120,515,80,14)],
  ]);
  for(const node of document.querySelectorAll('*')){
    node.getBoundingClientRect=()=>rects.get(node)||box(0,0,0,0);
    node.getClientRects=()=>node.closest('[hidden],[display="none"]')?[]:[node.getBoundingClientRect()];
  }
  for(const node of [document.documentElement,document.body])Object.defineProperty(node,'scrollWidth',{value:320});
  const context=vm.createContext({document,innerWidth:320,innerHeight:740,location:{pathname:'/',search:''},localStorage:{},history:{length:1},
    getComputedStyle:node=>({display:node.hidden?'none':'block',visibility:'visible',fontSize:'12px',flexWrap:'nowrap'})});
  return {document,rects,read:()=>vm.runInContext('('+readUiContractGeometry.toString()+')()',context),readShell:()=>vm.runInContext('('+readShellContract.toString()+')()',context)};
}

test('native replay geometry catches a cancel button covering time labels and a date badge independently of the bar',()=>{
  const fixture=geometryFixture(),geometry=fixture.read();
  assert.equal(geometry.replay.coveredLabels.length,0,'the original bar-only probe cannot see this regression');
  assert.equal(geometry.replay.informationCollisions.length,3);
  assert.ok(geometry.replay.informationCollisions.every(item=>item.overlay==='pick-cancel'));
  assert.ok(geometry.replay.informationCollisions.some(item=>item.label.kind==='price-time-label'));
  assert.ok(geometry.replay.informationCollisions.some(item=>item.label.kind==='cross-date-tag'));
  fixture.document.querySelector('[data-cr="pick-cancel"]').hidden=true;
  assert.equal(fixture.read().replay.informationCollisions.length,0,'closed selection control does not count as a painted blocker');
});

test('native geometry excludes a hidden SVG selection badge and retains actual visible label collisions',()=>{
  const fixture=geometryFixture();fixture.document.querySelector('.cross-date-tag').setAttribute('display','none');
  const geometry=fixture.read();
  assert.equal(geometry.replay.informationCollisions.length,1);
  assert.equal(geometry.replay.informationCollisions[0].label.kind,'price-time-label');
  fixture.rects.set(fixture.document.querySelector('[data-cr="pick-cancel"]'),box(100,512,120,32));
  assert.equal(fixture.read().replay.informationCollisions.length,0);
});

test('a disabled shell title alone cannot masquerade as an unavailable-feature explanation',()=>{
  const fixture=geometryFixture(),owner=fixture.document.createElement('div'),control=fixture.document.createElement('button');
  owner.dataset.shellRegion='top';control.dataset.shellOwner='top';control.dataset.shellSlot='1';control.dataset.shellKey='symbol';
  control.disabled=true;control.title='종목 검색';owner.append(control);fixture.document.body.append(owner);
  for(const node of [owner,control]){node.getClientRects=()=>[box(0,0,32,32)];node.getBoundingClientRect=()=>box(0,0,32,32);}
  assert.equal(fixture.readShell().regions.top.slots[0].reason,'');
  control.setAttribute('aria-description','자료가 준비된 뒤 사용할 수 있습니다.');
  assert.equal(fixture.readShell().regions.top.slots[0].reason,'자료가 준비된 뒤 사용할 수 있습니다.');
});

test('the UI native-entry inventory explicitly covers both equity symbols on both public entry paths',()=>{
  const cases=uiContractBrowserCases.filter(item=>item.uiNativeEntry);
  assert.deepEqual(cases.map(item=>[item.symbol,item.route,item.canonicalRoute]),[
    ['MSTR','/?symbol=MSTR','/?symbol=MSTR'],['MSTR','/market-lab/charts/?symbol=MSTR','/?symbol=MSTR'],
    ['BMNR','/?symbol=BMNR','/?symbol=BMNR'],['BMNR','/market-lab/charts/?symbol=BMNR','/?symbol=BMNR'],
  ]);
  assert.equal(new Set(cases.map(item=>item.page)).size,4,'each route owns a separate receipt and screenshot');
  assert.equal(uiReviewBaseline,'1635f87a10962b7ff5eecd094b6e0625e09771f4','the before UI must match the supplied deployed source');
});

test('fixture requests and exact canonical expectations share the declared Pages mount without changing query state',()=>{
  const native=uiContractBrowserCases.find(item=>item.page==='ui-entry-mstr-charts');
  const mounted=mountUiReviewCase(native,'/bitcoin-cycle-atlas/');
  assert.equal(mounted.route,'/bitcoin-cycle-atlas/market-lab/charts/?symbol=MSTR');
  assert.equal(mounted.canonicalRoute,'/bitcoin-cycle-atlas/?symbol=MSTR');
  assert.equal(mounted.publicRoute,native.route);assert.equal(mounted.publicCanonicalRoute,native.canonicalRoute);
  assert.equal(native.route,'/market-lab/charts/?symbol=MSTR','mounting must not mutate the public four-route inventory');
  for(const spec of uiContractBrowserCases){
    const underRoot=mountUiReviewCase(spec,'/'),underPages=mountUiReviewCase(spec,'/bitcoin-cycle-atlas/');
    assert.equal(underRoot.route,spec.route);
    assert.equal(underPages.route,'/bitcoin-cycle-atlas'+spec.route);
    assert.equal(underPages.route.slice(underPages.route.indexOf('?')),spec.route.slice(spec.route.indexOf('?')));
    if(spec.canonicalRoute)assert.equal(underRoot.canonicalRoute,spec.canonicalRoute);
  }
  const settings={route:'/?symbol=BMNR&scale=linear&indicator-hide=volume%2Crsi&from=2026-01-01#chart'};
  assert.equal(mountUiReviewCase(settings,'/bitcoin-cycle-atlas/').route,'/bitcoin-cycle-atlas'+settings.route);
  for(const projectRoot of ['https://example.test/','//example.test/','/../','/bitcoin-cycle-atlas'])assert.throws(()=>mountUiReviewCase(native,projectRoot));
  for(const route of ['//example.test/','/../?symbol=MSTR','/market-lab/./charts/'])assert.throws(()=>mountUiReviewCase({route},'/bitcoin-cycle-atlas/'));
});

test('hosted fixtures wait for the native boot and current painted iframe before measuring refresh failure disclosure',()=>{
  const {document}=parseHTML('<html data-boot="loading"><body data-chart-controls="ready"><div class="atlas-plot" data-chart-symbol="HOUSING-SEOUL"><iframe class="atlas-center-frame" data-center-loaded="true" data-center-status="ready"></iframe></div></body></html>');
  const frame=document.querySelector('iframe'),child={readyState:'complete'};let visibility='visible';
  Object.defineProperty(frame,'contentDocument',{value:child});frame.getBoundingClientRect=()=>box(50,50,600,500);
  const context=vm.createContext({document,getComputedStyle:()=>({display:'block',visibility})});
  const read=()=>vm.runInContext('('+readHostedUiReadiness.toString()+')('+JSON.stringify('HOUSING-SEOUL')+')',context);
  assert.equal(read().ready,false,'a child ack cannot make the boot-hidden parent notice visible');
  document.documentElement.dataset.boot='ready';assert.equal(read().ready,true);
  document.documentElement.dataset.boot='error';assert.equal(read().ready,false);
  document.documentElement.dataset.boot='ready';visibility='hidden';assert.equal(read().ready,false);
  visibility='visible';child.readyState='loading';assert.equal(read().ready,false);
  child.readyState='complete';frame.dataset.centerStatus='loading';assert.equal(read().ready,false);
  frame.dataset.centerStatus='ready';document.querySelector('.atlas-plot').dataset.chartSymbol='TQQQ';assert.equal(read().ready,false);
  document.querySelector('.atlas-plot').dataset.chartSymbol='HOUSING-SEOUL';frame.dataset.centerLoaded='false';assert.equal(read().ready,false);
  frame.dataset.centerLoaded='true';assert.equal(read().ready,true);
  const stale=document.createElement('iframe');stale.className='atlas-center-frame';document.querySelector('.atlas-plot').append(stale);
  assert.equal(read().ready,false,'two visible frame owners must not qualify for the shell screenshot');
  stale.hidden=true;assert.equal(read().ready,true);
});

test('hosted readiness treats the empty navigation document and partial shell as pending before its real ready state',()=>{
  const {document}=parseHTML('<html data-boot="ready"><body data-chart-controls="ready"><div class="atlas-plot" data-chart-symbol="HYPE"><iframe class="atlas-center-frame" data-center-loaded="true" data-center-status="ready"></iframe></div></body></html>');
  const frame=document.querySelector('iframe');
  Object.defineProperty(frame,'contentDocument',{value:{readyState:'complete'}});frame.getBoundingClientRect=()=>box(50,50,600,500);
  const context=vm.createContext({document:{documentElement:null,body:null,querySelectorAll:()=>[],querySelector:()=>null},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  const read=()=>vm.runInContext('('+readHostedUiReadiness.toString()+')("HYPE")',context);
  const empty=read();assert.equal(empty.ready,false);assert.equal(empty.frameCount,0);assert.equal(empty.framePainted,false);
  context.document={documentElement:document.documentElement,body:null,querySelectorAll:()=>[],querySelector:()=>null};
  const partial=read();assert.equal(partial.boot,'ready');assert.equal(partial.controls,undefined);assert.equal(partial.ready,false);
  context.document=document;
  const ready=read();assert.equal(ready.ready,true);assert.equal(ready.symbol,'HYPE');assert.equal(ready.frameCount,1);
  assert.equal(ready.frameLoaded,'true');assert.equal(ready.frameStatus,'ready');assert.equal(ready.documentReady,'complete');assert.equal(ready.framePainted,true);
});
