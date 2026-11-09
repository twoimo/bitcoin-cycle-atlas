import assert from 'node:assert/strict';
import test from 'node:test';
import {assertConsolidatedChartAllocation} from '../scripts/verify-consolidated-workspace-browser.mjs';
import {createEthBrowserCaseSpecs,selectEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';

const rect=(left,top,width,height)=>({left,right:left+width,top,bottom:top+height,width,height});
const measured=(box,extra={})=>({rect:box,content:{...box},visible:true,marginTop:0,marginBottom:0,...extra});
const fields=['holdings','quantity','average-cost','current-price','pnl','next-trigger','updated-at'];

// Saved native f12 dimensions, used only as oracle boundary fixtures. These
// tests do not substitute for rerunning the unchanged native browser cases.
function allocation({width=390,height=708,hudHeight=196.78125,symbol='TQQQ'}={}){
  const hud=measured(rect(0,0,width,hudHeight));
  const body=measured(rect(0,hudHeight+16,width,height-hudHeight-16));
  const canvas=measured({...body.rect}),svg=measured({...body.rect});
  return {svg:{width,height:svg.rect.height,visible:true},childHeight:height,allocation:{
    frame:{source:'https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1',documentUrl:'https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1',parentUrl:'https://example.test/bitcoin-cycle-atlas/market-lab/charts/?symbol=TQQQ',rect:rect(0,92,width,height)},
    viewport:{width,height},owners:{activeWindow:true,svgInActiveFrame:true,canvasOwnsSvg:true,bodyOwnsCanvas:true,hudSharesWorkbench:true},
    svg,canvas,body,workbench:measured(rect(0,0,width,height)),flow:{display:'flex',direction:'column',gap:16,children:[{kind:'hud',...structuredClone(hud)},{kind:'body',...structuredClone(body)}]},
    hud:{...hud,label:symbol+' 분할 매매 평단가',fields:fields.map((key,index)=>({key,text:key,...measured(rect(8,50+index*15,width-16,13))}))},
  }};
}

test('WP6 mobile SVG fills the measured remainder although it is below 75% of the full iframe',()=>{
  for(const dimensions of [{width:390,height:708,hudHeight:196.78125},{width:320,height:604,hudHeight:246.875}]){
    const result=allocation(dimensions);
    assert.ok(result.svg.height<result.childHeight*.75,'The old denominator rejects this recorded layout');
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,'TQQQ'));
  }
});

test('each RSI instrument requires its own full seven-field HUD; removing it cannot fall back to the legacy gate',()=>{
  for(const symbol of ['TQQQ','SOXL','233740']){
    const result=allocation({symbol});
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,symbol));
    result.allocation.hud=null;
    assert.throws(()=>assertConsolidatedChartAllocation(result,symbol),/actual WP6 HUD and chart allocation must exist/);
  }
});

test('non-HUD instruments retain the original 75% child-viewport threshold',()=>{
  const result={svg:{height:600,visible:true},childHeight:800};
  for(const symbol of ['HYPE','HOUSING-SEOUL']){
    assert.doesNotThrow(()=>assertConsolidatedChartAllocation(result,symbol));
    assert.throws(()=>assertConsolidatedChartAllocation({...result,svg:{height:599,visible:true}},symbol),/chart fills its allocated work area/);
  }
});

test('a SVG below 75% of the real canvas fails even when the entire HUD is present',()=>{
  const result=allocation();
  result.svg.height=result.allocation.canvas.content.height*.74;
  result.allocation.svg=measured(rect(0,result.allocation.canvas.rect.top,390,result.svg.height));
  assert.throws(()=>assertConsolidatedChartAllocation(result,'TQQQ'),/chart fills its allocated work area/);
});

test('shrinking the body, canvas and SVG together cannot hide unused remaining height',()=>{
  const result=allocation(),a=result.allocation;
  for(const key of ['body','canvas','svg'])a[key]=measured(rect(0,a[key].rect.top,390,a[key].rect.height-50));
  a.flow.children[1]={kind:'body',...structuredClone(a.body)};result.svg.height=a.svg.rect.height;
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

test('HUD overlap, unpainted or missing fields, and a wrong instrument owner remain failures',()=>{
  const overlapping=allocation();overlapping.allocation.hud.rect.bottom+=30;overlapping.allocation.hud.rect.height+=30;
  assert.throws(()=>assertConsolidatedChartAllocation(overlapping,'TQQQ'),/HUD and chart are contained without overlap/);
  const hidden=allocation();hidden.allocation.hud.fields[6].visible=false;
  assert.throws(()=>assertConsolidatedChartAllocation(hidden,'TQQQ'),/HUD field remains visible and contained: updated-at/);
  const missing=allocation();missing.allocation.hud.fields.pop();
  assert.throws(()=>assertConsolidatedChartAllocation(missing,'TQQQ'),/all seven HUD fields/);
  const owner=allocation();owner.allocation.hud.label='SOXL 분할 매매 평단가';
  assert.throws(()=>assertConsolidatedChartAllocation(owner,'TQQQ'),/selected instrument owner/);
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
