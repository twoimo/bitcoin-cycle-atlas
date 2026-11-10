import assert from 'node:assert/strict';
import test from 'node:test';
import {assertConsolidatedChartAllocation,assertSimulationDetailsRoundTrip} from '../scripts/verify-consolidated-workspace-browser.mjs';
import {createEthBrowserCaseSpecs,selectEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';

const rect=(left,top,width,height)=>({left,right:left+width,top,bottom:top+height,width,height});
const measured=(box,extra={})=>({rect:box,content:{...box},visible:true,marginTop:0,marginBottom:0,...extra});
const criteriaRows=['criteria','win-rate','current','buy','sell','strong','neutral'];
const hudFields=['holdings','quantity','average-cost','current-price','pnl','next-trigger','updated-at'];

// Saved native f12 dimensions, used only as oracle boundary fixtures. These
// tests do not substitute for rerunning the unchanged native browser cases.
// cd53cad places the position HUD in the details dialog and paints the trading
// criteria inside the chart canvas, so the chart tab has one in-flow body.
function allocation({width=390,height=708,statusHeight=0,symbol='TQQQ'}={}){
  const rows=[];
  if(statusHeight)rows.push({kind:'status',...measured(rect(0,0,width,statusHeight))});
  const bodyTop=rows.reduce((sum,row)=>sum+row.rect.height,0)+16*rows.length;
  const body=measured(rect(0,bodyTop,width,height-bodyTop));
  const canvas=measured({...body.rect}),svg=measured({...body.rect});
  rows.push({kind:'body',...structuredClone(body)});
  const criteriaTop=canvas.rect.top+24,criteriaHeight=Math.min(120,canvas.rect.height-48),rowHeight=(criteriaHeight-8)/criteriaRows.length;
  const criteria={...measured(rect(canvas.rect.left+8,criteriaTop,width-16,criteriaHeight)),symbol,label:symbol+' 매매 기준 상세 · 현재 미충족',hasPopup:'dialog',expanded:'false',collapsed:'false',chip:null,
    fields:criteriaRows.map((key,index)=>({key,text:key,...measured(rect(canvas.rect.left+12,criteriaTop+4+index*rowHeight,width-24,rowHeight-2))}))};
  return {svg:{width,height:svg.rect.height,visible:true},childHeight:height,allocation:{
    frame:{source:'https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1',documentUrl:'https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1',parentUrl:'https://example.test/bitcoin-cycle-atlas/market-lab/charts/?symbol=TQQQ',rect:rect(0,92,width,height)},
    viewport:{width,height},owners:{activeWindow:true,svgInActiveFrame:true,canvasOwnsSvg:true,bodyOwnsCanvas:true,criteriaSharesCanvas:true},
    svg,canvas,body,workbench:measured(rect(0,0,width,height)),flow:{display:'flex',direction:'column',gap:16,children:rows},
    criteria,
  }};
}

function detailsOpen(symbol='TQQQ',{fields=hudFields}={}){
  return {dialog:{...measured(rect(0,0,600,700)),body:measured(rect(4,40,592,656)),open:true,name:'simulation',label:symbol+' 매매 기준 · 분할 매매 성과'},
    hud:{...measured(rect(12,60,576,320)),label:symbol+' 분할 매매 평단가',
      fields:fields.map((key,index)=>({key,text:key,...measured(rect(16,70+index*40,560,30))}))},
    criteria:{...measured(rect(12,60,576,240)),label:symbol+' 매매 기준과 전체 기간 결과',fields:criteriaRows.map((key,index)=>({key,text:key,...measured(rect(16,64+index*30,560,24))}))},criteriaViewport:rect(4,40,592,656),
    criteriaExpanded:'true'};
}

test('the SVG threshold is measured against its real canvas, not the whole iframe',()=>{
  for(const dimensions of [{width:390,height:708,statusHeight:196.78125},{width:320,height:604,statusHeight:246.875}]){
    const result=allocation(dimensions);
    assert.ok(result.svg.height<result.childHeight*.75,'The old whole-iframe denominator rejects this layout');
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,'TQQQ'));
  }
});

test('each RSI instrument requires its own in-chart criteria; removing it cannot fall back to the legacy gate',()=>{
  for(const symbol of ['TQQQ','SOXL','233740']){
    const result=allocation({symbol});
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,symbol));
    result.allocation.criteria=null;
    assert.throws(()=>assertConsolidatedChartAllocation(result,symbol),/actual in-chart trading criteria and chart allocation must exist/);
    result.allocation.criteria=allocation({symbol}).allocation.criteria;
    result.allocation.criteria.symbol=symbol==='SOXL'?'TQQQ':'SOXL';
    assert.throws(()=>assertConsolidatedChartAllocation(result,symbol),/criteria overlay retains its selected instrument owner/);
  }
});

test('non-HUD instruments retain the original 75% child-viewport threshold',()=>{
  const result={svg:{height:600,visible:true},childHeight:800};
  for(const symbol of ['HYPE','HOUSING-SEOUL']){
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,symbol));
    assert.throws(()=>assertConsolidatedChartAllocation({...result,svg:{height:599,visible:true}},symbol),/chart fills its allocated work area/);
  }
});

test('a SVG below 75% of the real canvas fails even when the criteria overlay is present',()=>{
  const result=allocation();
  result.svg.height=result.allocation.canvas.content.height*.74;
  result.allocation.svg=measured(rect(0,result.allocation.canvas.rect.top,390,result.svg.height));
  assert.throws(()=>assertConsolidatedChartAllocation(result,'TQQQ'),/chart fills its allocated work area/);
});

test('shrinking the body, canvas and SVG together cannot hide unused remaining height',()=>{
  const result=allocation(),a=result.allocation;
  for(const key of ['body','canvas','svg'])a[key]=measured(rect(0,a[key].rect.top,390,a[key].rect.height-50));
  a.flow.children[a.flow.children.length-1]={kind:'body',...structuredClone(a.body)};result.svg.height=a.svg.rect.height;
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

test('criteria overlay that is unpainted, outside its canvas or missing a row remains a failure',()=>{
  const unpainted=allocation();unpainted.allocation.criteria.visible=false;
  assert.throws(()=>assertConsolidatedChartAllocation(unpainted,'TQQQ'),/criteria overlay is painted/);
  const escaping=allocation();escaping.allocation.criteria.rect.left=-6;escaping.allocation.criteria.rect.right-=6;
  assert.throws(()=>assertConsolidatedChartAllocation(escaping,'TQQQ'),/criteria overlay stays inside the chart canvas/);
  const owner=allocation();owner.allocation.owners.criteriaSharesCanvas=false;
  assert.throws(()=>assertConsolidatedChartAllocation(owner,'TQQQ'),/active-frame owners/);
  const missingRow=allocation();missingRow.allocation.criteria.fields.pop();
  assert.throws(()=>assertConsolidatedChartAllocation(missingRow,'TQQQ'),/every trading-criteria row/);
  const hiddenRow=allocation();hiddenRow.allocation.criteria.fields[2].visible=false;
  assert.throws(()=>assertConsolidatedChartAllocation(hiddenRow,'TQQQ'),/criteria row remains visible and contained: current/);
  const noPopup=allocation();noPopup.allocation.criteria.hasPopup='false';
  assert.throws(()=>assertConsolidatedChartAllocation(noPopup,'TQQQ'),/declares its details dialog/);
  const extraRow=allocation();extraRow.allocation.flow.children.splice(0,0,{kind:'criteria',...measured(rect(0,0,390,120))});
  assert.throws(()=>assertConsolidatedChartAllocation(extraRow,'TQQQ'),/must not claim an in-flow row/);
});

test('the details dialog must own the same seven HUD fields for the selected instrument',()=>{
  const before=allocation(),after=allocation();
  const roundTrip=(opened,symbol='TQQQ')=>assertSimulationDetailsRoundTrip({symbol,before,opened,after});
  assert.doesNotThrow(()=>roundTrip(detailsOpen()));
  const closed=detailsOpen();closed.dialog.open=false;
  assert.throws(()=>roundTrip(closed),/details dialog must be open/);
  const wrongView=detailsOpen();wrongView.dialog.name='backtest';
  assert.throws(()=>roundTrip(wrongView),/identifies the simulation view/);
  const noHud=detailsOpen();noHud.hud=null;
  assert.throws(()=>roundTrip(noHud),/position HUD must exist inside the opened details/);
  const owner=detailsOpen('SOXL');
  assert.throws(()=>roundTrip(owner),/HUD retains its selected instrument owner/);
  const missing=detailsOpen('TQQQ',{fields:hudFields.slice(0,6)});
  assert.throws(()=>roundTrip(missing),/all seven HUD fields remain present/);
  const blank=detailsOpen();blank.hud.fields[0].text='';
  assert.throws(()=>roundTrip(blank),/HUD field remains visible and contained: holdings/);
  const outside=detailsOpen();outside.hud.rect.top=800;outside.hud.rect.bottom=1120;
  assert.throws(()=>roundTrip(outside),/HUD stays inside the details dialog content/);
  const notExpanded=detailsOpen();notExpanded.criteriaExpanded='false';
  assert.throws(()=>roundTrip(notExpanded),/criteria control reports its expanded details/);
});

test('closing the details must restore the exact chart height it had before opening',()=>{
  const before=allocation(),opened=detailsOpen();
  for(const grow of [24,-24]){
    const after=allocation();
    for(const key of ['body','canvas','svg']){
      after.allocation[key]=measured(rect(0,after.allocation[key].rect.top,390,after.allocation[key].rect.height+grow));
      after.allocation[key].rect.bottom=after.allocation[key].rect.top+after.allocation[key].rect.height;
    }
    after.svg.height=after.allocation.svg.rect.height;
    assert.throws(()=>assertSimulationDetailsRoundTrip({symbol:'TQQQ',before,opened,after}),/closing details restores the/);
  }
  const stillOpen=allocation();
  assert.throws(()=>assertSimulationDetailsRoundTrip({symbol:'TQQQ',before,opened,after:{...stillOpen,allocation:{...stillOpen.allocation,criteria:{...stillOpen.allocation.criteria,expanded:'true'}}}}),
    /returns to its collapsed state/);
});

test('same-application SPA query and hash updates preserve valid active-frame ownership',()=>{
  const result=allocation();
  result.allocation.frame.documentUrl='https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1&symbol=SOXL&epoch=9#chart';
  assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,'TQQQ'));
  result.allocation.frame.documentUrl='https://example.test/bitcoin-cycle-atlas/other-app/?embedded=1';
  assert.throws(()=>assertConsolidatedChartAllocation(result,'TQQQ'),/active iframe source application/);
});

test('wrong iframe or source geometry cannot supply the allocation denominator',()=>{
  const pending=allocation();pending.allocation.frame.documentUrl='about:blank';
  assert.throws(()=>assertConsolidatedChartAllocation(pending,'TQQQ'),/active iframe source application/);
  const stale=allocation();stale.allocation.owners.svgInActiveFrame=false;
  assert.throws(()=>assertConsolidatedChartAllocation(stale,'TQQQ'),/active-frame owners/);
  const scaled=allocation();scaled.allocation.frame.rect.height+=50;
  assert.throws(()=>assertConsolidatedChartAllocation(scaled,'TQQQ'),/maps to its child viewport 1:1/);
});

test('an unexplained spacer cannot become a legitimate deduction from chart height',()=>{
  const result=allocation();
  result.allocation.flow.children.splice(1,0,{kind:'unexpected',...measured(rect(0,212.78125,390,80))});
  assert.throws(()=>assertConsolidatedChartAllocation(result,'TQQQ'),/no unexplained in-flow spacer/);
});

test('the canonical 53 cases and three original consolidated viewport cases are unchanged',()=>{
  assert.equal(createEthBrowserCaseSpecs().length,53);
  assert.deepEqual(selectEthBrowserCaseSpecs('workspace-consolidated').map(({width,height})=>[width,height]),[[320,900],[390,844],[1440,900]]);
});


test('collapsed criteria preserves its reachable chip and still requires all seven detailed fields',()=>{
  const result=allocation();result.allocation.criteria.collapsed='true';result.allocation.criteria.fields=[];
  result.allocation.criteria.chip={...measured(rect(16,28,100,24)),text:'매매 기준'};
  assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,'TQQQ'));
  const missing=structuredClone(result);missing.allocation.criteria.chip=null;
  assert.throws(()=>assertConsolidatedChartAllocation(missing,'TQQQ'),/readable contained trigger/);
  const opened=detailsOpen();opened.criteria.fields.pop();
  assert.throws(()=>assertSimulationDetailsRoundTrip({symbol:'TQQQ',before:result,opened,after:result}),/all seven detailed criteria fields/);
  const clipped=detailsOpen();clipped.criteriaViewport=rect(4,600,592,50);
  assert.throws(()=>assertSimulationDetailsRoundTrip({symbol:'TQQQ',before:result,opened:clipped,after:result}),/scrolled into the visible dialog body/);
});
