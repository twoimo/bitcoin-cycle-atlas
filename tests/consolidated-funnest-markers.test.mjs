import assert from 'node:assert/strict';
import test from 'node:test';
import {assertConsolidatedFunnestMarkers} from '../scripts/verify-consolidated-workspace-browser.mjs';

// Geometry recorded from the actual hosted HYPE chart (dist/market-lab, 1440px
// and 320px): plot 105..1265 over 366 source rows, gutter labels at x=1273.
const box=(x,y,width,height)=>({x,y,width,height});
function marker({date,kind,rowIndex,plotLeft=105,plotRight=1265,rows=366,label='E',labelX=null,connectorX2=null,target=null}){
  const cx=plotLeft+(rowIndex+.5)*(plotRight-plotLeft)/rows,textX=labelX??cx+7;
  return {date,kind,rowIndex,label,title:`${date} · ${kind==='judgment'?'판정':'근거'} · 표식`,ariaLabel:`${date} · ${kind==='judgment'?'판정':'근거'} · 표식`,role:'button',tabIndex:'0',disabled:'false',hitTarget:target?'44':'unplaced',
    anchor:{cx,cy:200,r:4,strokeWidth:2,box:box(cx-4,196,8,8),visible:true},
    text:{box:box(textX,185,6.48,13),pointerEvents:'none',visible:true},
    connector:connectorX2===null?null:{x1:cx,x2:connectorX2,pointerEvents:'none'},
    target:target?{box:box(target,170,44,44),width:44,height:44,pointerEvents:'all',fill:'transparent'}:null};
}
function result(markers,{status='not-required',count=0,unplaced=0,label='근거·판정 표식'}={}){
  return {markers,markerRows:366,gutterTexts:[box(1273,92,13.52,13),box(1273,45,13.52,13)],
    markerGroup:{label,role:'group',status,count,unplaced},
    svg:{viewWidth:1333,viewHeight:683},plot:{left:105,right:1265,top:20,axisBox:{x:1265,y:0,width:68,height:20}}};
}
const wide=()=>result([marker({date:'2025-11-18',kind:'evidence',rowIndex:16}),marker({date:'2026-11-03',kind:'evidence',rowIndex:365,label:'E·2',labelX:1244,connectorX2:1263.4153005464}),
  marker({date:'2026-11-03',kind:'judgment',rowIndex:365,label:'J',labelX:1228,connectorX2:1240})]);

test('actual Funnest anchors on observed rows, in-plot labels and connectors pass',()=>{
  assert.doesNotThrow(()=>assertConsolidatedFunnestMarkers(wide(),'HYPE'));
});

test('markers must exist and cover both evidence and judgment kinds',()=>{
  assert.throws(()=>assertConsolidatedFunnestMarkers(result([]),'HYPE'),/evidence and judgment badges must be present/);
  const evidenceOnly=wide();evidenceOnly.markers=evidenceOnly.markers.filter(m=>m.kind==='evidence');
  assert.throws(()=>assertConsolidatedFunnestMarkers(evidenceOnly,'HYPE'),/both evidence and judgment markers/);
  const noGroup=wide();noGroup.markerGroup=null;
  assert.throws(()=>assertConsolidatedFunnestMarkers(noGroup,'HYPE'),/marker group must be present/);
});

test('an anchor moved off its observed source row is rejected',()=>{
  const moved=wide();moved.markers[0].anchor.cx+=.5;moved.markers[0].anchor.box.x+=.5;
  assert.throws(()=>assertConsolidatedFunnestMarkers(moved,'HYPE'),/preserve its anchor on the observed source row/);
  const detached=wide();detached.markers[1].connector.x1-=1;
  assert.throws(()=>assertConsolidatedFunnestMarkers(detached,'HYPE'),/connector starts at the anchor/);
  const unbound=wide();unbound.markers[0].rowIndex=-1;
  assert.throws(()=>assertConsolidatedFunnestMarkers(unbound,'HYPE'),/binds to an actual source row/);
});

test('label glyphs and anchors cannot enter the price gutter or cover axis labels',()=>{
  const gutter=wide();gutter.markers[1].text.box.x=1260;// 1260+6.48 crosses the 1265 gutter edge
  assert.throws(()=>assertConsolidatedFunnestMarkers(gutter,'HYPE'),/label glyph must not enter the price gutter/);
  const covering=wide();covering.markers[1].anchor.box=box(1270,95,8,8);
  assert.throws(()=>assertConsolidatedFunnestMarkers(covering,'HYPE'),/must not cover price-axis labels/);
  const clipped=wide();clipped.markers[0].anchor.box.x=-1;
  assert.throws(()=>assertConsolidatedFunnestMarkers(clipped,'HYPE'),/not clipped by the SVG/);
});

test('markers stay native buttons with disclosed names and inert glyphs',()=>{
  for(const [key,value,pattern] of [['role','group',/native button/],['tabIndex','-1',/keyboard reachable/],['disabled','true',/is enabled/],['ariaLabel','표식',/discloses the observed date and kind/]]){
    const broken=wide();broken.markers[0][key]=value;
    assert.throws(()=>assertConsolidatedFunnestMarkers(broken,'HYPE'),pattern);
  }
  const hitText=wide();hitText.markers[0].text.pointerEvents='all';
  assert.throws(()=>assertConsolidatedFunnestMarkers(hitText,'HYPE'),/never a hit target/);
  const hitConnector=wide();hitConnector.markers[1].connector.pointerEvents='auto';
  assert.throws(()=>assertConsolidatedFunnestMarkers(hitConnector,'HYPE'),/connectors cannot become hit targets/);
  const hiddenRect=wide();hiddenRect.markers[0].target={box:box(105,170,44,44),width:44,height:44,pointerEvents:'all',fill:'transparent'};
  assert.throws(()=>assertConsolidatedFunnestMarkers(hiddenRect,'HYPE'),/no undeclared hit rect/);
});

test('narrow plots disclose real 44px touch targets that stay inside the plot band',()=>{
  const narrow=()=>{const r=result([marker({date:'2025-11-18',kind:'evidence',rowIndex:16,plotLeft:105,plotRight:250,target:105}),marker({date:'2026-11-03',kind:'judgment',rowIndex:365,plotLeft:105,plotRight:250,label:'J',labelX:138.96,connectorX2:163.98,target:206})],
    {status:'complete',count:2,unplaced:0,label:'근거·판정 표식 · 44px 터치 영역 2/2'});r.plot={left:105,right:250,top:20,axisBox:{x:250,y:0,width:68,height:20}};r.svg.viewWidth=318;r.gutterTexts=[box(258,92,13.52,13)];return r;};
  assert.doesNotThrow(()=>assertConsolidatedFunnestMarkers(narrow(),'HYPE'));
  const small=narrow();small.markers[0].target.width=40;
  assert.throws(()=>assertConsolidatedFunnestMarkers(small,'HYPE'),/44px touch target is a real transparent hit area/);
  const outside=narrow();outside.markers[1].target.box.x=207;
  assert.throws(()=>assertConsolidatedFunnestMarkers(outside,'HYPE'),/touch target stays inside the plot band/);
  const miscounted=narrow();miscounted.markerGroup.count=1;
  assert.throws(()=>assertConsolidatedFunnestMarkers(miscounted,'HYPE'),/disclosure matches the painted targets/);
  const undisclosed=narrow();undisclosed.markerGroup.label='근거·판정 표식';
  assert.throws(()=>assertConsolidatedFunnestMarkers(undisclosed,'HYPE'),/coverage is disclosed in the group name/);
});
