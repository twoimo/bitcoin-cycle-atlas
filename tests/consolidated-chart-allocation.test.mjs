import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {readConsolidatedChartAllocation,readConsolidatedCriteriaDialog,assertConsolidatedChartAllocation,assertConsolidatedCriteriaDialog} from '../scripts/verify-consolidated-workspace-browser.mjs';
import {createEthBrowserCaseSpecs,selectEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';

const rect=(left,top,width,height)=>({left,right:left+width,top,bottom:top+height,width,height});
const measured=(box,extra={})=>({rect:box,content:{...box},visible:true,marginTop:0,marginBottom:0,...extra});
const fields=['holdings','quantity','average-cost','current-price','pnl','next-trigger','updated-at'];
const criteriaFields=['criteria','win-rate','current','buy','sell','strong','neutral'];

// Geometry boundary fixtures, not native-browser measurements. R4 puts the
// criteria inside the price pane and reserves no in-flow simulation HUD row.
function allocation({width=390,height=708,symbol='TQQQ',statusHeight=0}={}){
  const body=measured(rect(0,statusHeight,width,height-statusHeight));
  const canvas=measured({...body.rect}),svg=measured({...body.rect});
  const pricePane=rect(24,statusHeight+56,width-88,(height-statusHeight)*.65-56),collapsed=width<=640;
  const card=rect(pricePane.right-12-(collapsed?140:280),pricePane.top+60,collapsed?140:280,collapsed?44:190);
  return {svg:{width,height:svg.rect.height,visible:true},childHeight:height,allocation:{
    frame:{source:'https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1',documentUrl:'https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1',parentUrl:'https://example.test/bitcoin-cycle-atlas/market-lab/charts/?symbol=TQQQ',rect:rect(0,105,width,height)},
    viewport:{width,height,parentWidth:width},owners:{activeWindow:true,svgInActiveFrame:true,canvasOwnsSvg:true,bodyOwnsCanvas:true,criteriaInActiveFrame:true,canvasOwnsCriteria:true},
    svg,canvas,body,workbench:measured(rect(0,0,width,height)),flow:{display:'flex',direction:'column',gap:0,children:[...(statusHeight?[{kind:'status',...measured(rect(0,0,width,statusHeight))}]:[]),{kind:'body',...structuredClone(body)}]},
    pricePane,legend:measured(rect(pricePane.right-102,pricePane.top+12,90,40)),criteriaCount:1,
    criteria:{...measured(card),symbol,label:symbol+' 매매 기준 상세 · 현재 미충족',popup:'dialog',position:'absolute',collapsed:String(collapsed),state:'unmet',through:'2026-11-09',
      fields:collapsed?[]:criteriaFields.map((key,index)=>({key,text:key,...measured(rect(card.left+9,card.top+9+index*22,card.width-18,22))}))},
  }};
}

function dialog(symbol='TQQQ'){
  const detailBox=rect(20,80,350,370),hudBox=rect(20,480,350,280);
  return {count:1,activeSymbol:symbol,expanded:'true',owners:{dialogInParent:true,dialogAtBody:true,hudInDialog:true,detailsInDialog:true},
    dialog:{...measured(rect(8,8,374,828)),open:true,label:symbol+' 매매 기준 · 분할 매매 성과'},
    details:{...measured(detailBox),label:symbol+' 매매 기준과 전체 기간 결과',fields:criteriaFields.map((key,index)=>({key,text:key,...measured(rect(28,90+index*46,334,40))}))},
    hud:{...measured(hudBox),label:symbol+' 분할 매매 평단가',fields:fields.map((key,index)=>({key,text:key,...measured(rect(28,510+index*30,334,20))}))}};
}

test('all six viewport allocations preserve the full chart body and bounded criteria overlay',()=>{
  for(const [width,height]of [[390,708],[320,604],[768,888],[1024,632],[1440,764],[1920,944]]){
    const result=allocation({width,height});
    assert.equal(result.svg.height,result.childHeight,'The overlay must not subtract an old in-flow HUD row');
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,'TQQQ'));
  }
  assert.doesNotThrow(()=>assertConsolidatedChartAllocation(allocation({statusHeight:20}),'TQQQ'));
});

test('each RSI instrument requires its actual criteria overlay and cannot fall back to the legacy gate',()=>{
  for(const symbol of ['TQQQ','SOXL','233740']){
    const result=allocation({symbol});
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,symbol));
    result.allocation.criteria=null;
    assert.throws(()=>assertConsolidatedChartAllocation(result,symbol),/actual criteria overlay and chart allocation must exist/);
  }
});

test('other instruments retain the original 75% child-viewport threshold',()=>{
  const result={svg:{height:600,visible:true},childHeight:800};
  for(const symbol of ['HYPE','HOUSING-SEOUL']){
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,symbol));
    assert.throws(()=>assertConsolidatedChartAllocation({...result,svg:{height:599,visible:true}},symbol),/chart fills its allocated work area/);
  }
});

test('a SVG below 75% of the real canvas fails even when the criteria are present',()=>{
  const result=allocation();
  result.svg.height=result.allocation.canvas.content.height*.74;
  result.allocation.svg=measured(rect(0,result.allocation.canvas.rect.top,390,result.svg.height));
  assert.throws(()=>assertConsolidatedChartAllocation(result,'TQQQ'),/chart fills its allocated work area/);
});

test('shrinking the body, canvas and SVG together cannot hide unused remaining height',()=>{
  const result=allocation(),a=result.allocation;
  for(const key of ['body','canvas','svg'])a[key]=measured(rect(0,a[key].rect.top,390,a[key].rect.height-50));
  a.flow.children[0]={kind:'body',...structuredClone(a.body)};result.svg.height=a.svg.rect.height;
  assert.throws(()=>assertConsolidatedChartAllocation(result,'TQQQ'),/fills all remaining height/);
});

test('a correctly sized SVG outside its canvas and a blank margin inside its body both fail',()=>{
  const outside=allocation();outside.allocation.svg.rect.left=-5;outside.allocation.svg.rect.right-=5;
  assert.throws(()=>assertConsolidatedChartAllocation(outside,'TQQQ'),/SVG stays contained/);
  const blank=allocation(),a=blank.allocation;
  a.canvas=measured(rect(0,a.canvas.rect.top+12,390,a.canvas.rect.height-12));
  a.svg=measured({...a.canvas.rect});blank.svg.height=a.svg.rect.height;
  assert.throws(()=>assertConsolidatedChartAllocation(blank,'TQQQ'),/canvas fills its allocated body/);
});

test('criteria must honor the price-pane budget and preserve the actual legend gap',()=>{
  const oversized=allocation(),a=oversized.allocation;
  a.criteria.rect=rect(a.pricePane.left,a.pricePane.top+60,a.pricePane.width,120);
  assert.throws(()=>assertConsolidatedChartAllocation(oversized,'TQQQ'),/at most 22%/);
  const overlap=allocation();overlap.allocation.criteria.rect=rect(176,68,140,44);
  assert.throws(()=>assertConsolidatedChartAllocation(overlap,'TQQQ'),/measured legend and its 8px gap/);
  const axis=allocation();axis.allocation.criteria.rect.left+=50;axis.allocation.criteria.rect.right+=50;
  assert.throws(()=>assertConsolidatedChartAllocation(axis,'TQQQ'),/stay inside the price pane/);
  const small=allocation();small.allocation.criteria.rect.width=40;
  assert.throws(()=>assertConsolidatedChartAllocation(small,'TQQQ'),/44px target/);
});

test('expanded criteria preserve all seven painted fields and the selected instrument',()=>{
  const hidden=allocation({width:1440});hidden.allocation.criteria.fields[6].visible=false;
  assert.throws(()=>assertConsolidatedChartAllocation(hidden,'TQQQ'),/criteria field remains visible and contained: neutral/);
  const missing=allocation({width:1440});missing.allocation.criteria.fields.pop();
  assert.throws(()=>assertConsolidatedChartAllocation(missing,'TQQQ'),/all seven criteria fields/);
  const owner=allocation();owner.allocation.criteria.symbol='SOXL';
  assert.throws(()=>assertConsolidatedChartAllocation(owner,'TQQQ'),/selected instrument owner/);
  const mobile=allocation();mobile.allocation.criteria.collapsed='false';
  assert.throws(()=>assertConsolidatedChartAllocation(mobile,'TQQQ'),/mobile criteria start collapsed/);
  const duplicate=allocation();duplicate.allocation.criteriaCount=2;
  assert.throws(()=>assertConsolidatedChartAllocation(duplicate,'TQQQ'),/one criteria disclosure/);
});

test('same-application SPA query and hash updates preserve valid active-frame ownership',()=>{
  const result=allocation();
  result.allocation.frame.documentUrl='https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1&symbol=TQQQ&epoch=9#chart';
  assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,'TQQQ'));
  result.allocation.frame.documentUrl='https://example.test/bitcoin-cycle-atlas/other-app/?embedded=1';
  assert.throws(()=>assertConsolidatedChartAllocation(result,'TQQQ'),/active iframe source application/);
});

test('wrong iframe or source geometry cannot supply the allocation denominator',()=>{
  const pending=allocation();pending.allocation.frame.documentUrl='about:blank';
  assert.throws(()=>assertConsolidatedChartAllocation(pending,'TQQQ'),/active iframe source application/);
  for(const key of ['svgInActiveFrame','criteriaInActiveFrame','canvasOwnsCriteria']){
    const stale=allocation();stale.allocation.owners[key]=false;
    assert.throws(()=>assertConsolidatedChartAllocation(stale,'TQQQ'),/active-frame owners/);
  }
  const scaled=allocation();scaled.allocation.frame.rect.height+=50;
  assert.throws(()=>assertConsolidatedChartAllocation(scaled,'TQQQ'),/maps to its child viewport 1:1/);
});

test('an old HUD row or unexplained spacer cannot become a legitimate deduction from chart height',()=>{
  for(const kind of ['hud','unexpected']){
    const result=allocation();
    result.allocation.flow.children.unshift({kind,...measured(rect(0,0,390,80))});
    assert.throws(()=>assertConsolidatedChartAllocation(result,'TQQQ'),/no unexplained in-flow spacer/);
  }
});

test('all three native criteria dialogs retain the full overall criteria and selected-period HUD',()=>{
  for(const symbol of ['TQQQ','SOXL','233740'])assert.doesNotThrow(()=>assertConsolidatedCriteriaDialog(dialog(symbol),symbol));
});

test('modal HUD missing, unpainted, clipped, or wrong-instrument fields remain failures',()=>{
  const hidden=dialog();hidden.hud.fields[6].visible=false;
  assert.throws(()=>assertConsolidatedCriteriaDialog(hidden,'TQQQ'),/HUD field remains visible and contained: updated-at/);
  const missing=dialog();missing.hud.fields.pop();
  assert.throws(()=>assertConsolidatedCriteriaDialog(missing,'TQQQ'),/all seven HUD fields/);
  const clipped=dialog();clipped.hud.fields[0].rect.right+=20;
  assert.throws(()=>assertConsolidatedCriteriaDialog(clipped,'TQQQ'),/HUD field remains visible and contained/);
  const owner=dialog();owner.hud.label='SOXL 분할 매매 평단가';
  assert.throws(()=>assertConsolidatedCriteriaDialog(owner,'TQQQ'),/selected instrument owner/);
  const missingCriteria=dialog();missingCriteria.details.fields.pop();
  assert.throws(()=>assertConsolidatedCriteriaDialog(missingCriteria,'TQQQ'),/all seven criteria detail fields/);
});

test('closed, duplicate, stale-chart, or wrong-document dialogs cannot supply HUD evidence',()=>{
  const closed=dialog();closed.dialog.open=false;
  assert.throws(()=>assertConsolidatedCriteriaDialog(closed,'TQQQ'),/must be visible/);
  const duplicate=dialog();duplicate.count=2;
  assert.throws(()=>assertConsolidatedCriteriaDialog(duplicate,'TQQQ'),/exactly one active/);
  const stale=dialog();stale.activeSymbol='SOXL';
  assert.throws(()=>assertConsolidatedCriteriaDialog(stale,'TQQQ'),/belongs to the selected chart/);
  const orphan=dialog();orphan.expanded='false';
  assert.throws(()=>assertConsolidatedCriteriaDialog(orphan,'TQQQ'),/actual chart disclosure owns/);
  const child=dialog();child.owners.dialogInParent=false;
  assert.throws(()=>assertConsolidatedCriteriaDialog(child,'TQQQ'),/parent-dialog owners/);
});

test('the exact observers read the child price pane and parent portal without inventing an in-flow HUD',()=>{
  const expected=allocation().allocation,modal=dialog();
  const {document}=parseHTML('<html><body><iframe class="atlas-center-frame"></iframe><dialog open data-rsi-dialog="simulation"><section class="rsi-criteria-details"></section><section class="rsi-simulation-hud"></section></dialog></body></html>');
  const {document:child}=parseHTML('<html><body><section class="rsi-workbench"><div class="rsi-workbench-body"><div class="rsi-chart-canvas"><svg width="780" height="1416" viewBox="0 0 780 1416"></svg><div class="chart-legend-dock"></div><button data-rsi-criteria="TQQQ" data-criteria-collapsed="true" data-criteria-state="unmet" data-criteria-through="2026-11-09" aria-haspopup="dialog" aria-expanded="true"></button></div></div></section></body></html>');
  const frame=document.querySelector('iframe'),svg=child.querySelector('svg'),criteria=child.querySelector('button'),nativeDialog=document.querySelector('dialog');
  const details=document.querySelector('.rsi-criteria-details'),hud=document.querySelector('.rsi-simulation-hud');
  frame.src=expected.frame.source;Object.defineProperty(frame,'contentDocument',{value:child});
  Object.defineProperty(document,'URL',{value:expected.frame.parentUrl});Object.defineProperty(child,'URL',{value:expected.frame.documentUrl});
  Object.assign(svg.dataset,{plotLeft:'48',plotRight:'652',plotTop:'112',priceBottom:String(expected.pricePane.bottom*2)});
  criteria.setAttribute('aria-label',expected.criteria.label);nativeDialog.open=true;nativeDialog.setAttribute('aria-label',modal.dialog.label);
  details.setAttribute('aria-label',modal.details.label);hud.setAttribute('aria-label',modal.hud.label);
  details.innerHTML=criteriaFields.map(key=>'<div data-criteria-detail="'+key+'">'+key+'</div>').join('');
  hud.innerHTML=fields.map(key=>'<dd data-rsi-hud="'+key+'">'+key+'</dd>').join('');
  const boxes=new Map([[frame,expected.frame.rect],[child.querySelector('.rsi-workbench'),expected.workbench.rect],[child.querySelector('.rsi-workbench-body'),expected.body.rect],
    [child.querySelector('.rsi-chart-canvas'),expected.canvas.rect],[svg,expected.svg.rect],[criteria,expected.criteria.rect],[child.querySelector('.chart-legend-dock'),expected.legend.rect],
    [nativeDialog,modal.dialog.rect],[details,modal.details.rect],[hud,modal.hud.rect]]);
  [...details.children].forEach((node,index)=>boxes.set(node,modal.details.fields[index].rect));
  [...hud.children].forEach((node,index)=>boxes.set(node,modal.hud.fields[index].rect));
  for(const [node,box]of boxes){node.getBoundingClientRect=()=>box;node.getClientRects=()=>[box];node.checkVisibility=()=>true;}
  const style=node=>({display:'flex',flexDirection:'column',rowGap:'0',position:node===criteria?'absolute':'static'});
  Object.defineProperty(child,'defaultView',{value:{innerWidth:390,innerHeight:708,frameElement:frame,getComputedStyle:style}});
  const observe=fn=>JSON.parse(JSON.stringify(runInNewContext('('+fn.toString()+')()',{document,innerWidth:390})));
  const result=observe(readConsolidatedChartAllocation);
  assert.deepEqual(result.flow.children.map(row=>row.kind),['body']);assert.deepEqual(result.pricePane,expected.pricePane);
  assertConsolidatedChartAllocation({svg:{width:390,height:708,visible:true},childHeight:708,allocation:result},'TQQQ');
  assertConsolidatedCriteriaDialog(observe(readConsolidatedCriteriaDialog),'TQQQ');
});

test('the canonical 53 cases and three original consolidated viewport cases are unchanged',()=>{
  assert.equal(createEthBrowserCaseSpecs().length,53);
  assert.deepEqual(selectEthBrowserCaseSpecs('workspace-consolidated').map(({width,height})=>[width,height]),[[320,900],[390,844],[1440,900]]);
});
