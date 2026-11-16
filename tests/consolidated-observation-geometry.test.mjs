import assert from 'node:assert/strict';
import test from 'node:test';
import {assertConsolidatedObservationGeometry,assertConsolidatedDiagnosisChart} from '../scripts/verify-consolidated-workspace-browser.mjs';

// Pure boundary counterexamples; only the native Chrome cases supply real DOM
// ranges, font measurements, and the original observed prices and units.
const box=(left,top,width,height)=>({left,right:left+width,top,bottom:top+height,width,height});
function observation({unit='USDC',left=100,width=184}={}){
  const clip=box(left+1,49,width-2,42),date={text:'2026-07-05',box:box(left+9,62,65,15)};
  const value={text:'71.346',box:box(left+78,62,40,15)},quote={text:unit,box:box(left+122,62,unit==='지수'?24:31,15)};
  return {buttons:[{name:'hype-observation',box:box(left,48,width,44),clip,visible:true,disabled:false,
    overflow:{x:'hidden',y:'hidden'},summary:{text:date.text+value.text+unit,box:box(left+9,62,144,15),glyphs:[date,value,quote]},units:[quote]}]};
}

test('a complete observation and its USDC glyphs fit their own button clip',()=>{
  assert.doesNotThrow(()=>assertConsolidatedObservationGeometry(observation(),'HYPE','USDC'));
});

test('a clipped final currency glyph fails even though the source text still says USDC',()=>{
  const result=observation({width:148});
  assert.equal(result.buttons[0].units[0].text,'USDC');
  assert.throws(()=>assertConsolidatedObservationGeometry(result,'HYPE','USDC'),/glyphs must fit their own button clip/);
});

test('header scrolling can move the whole button outside the viewport without clipping its contents',()=>{
  for(const left of [-400,900])assert.doesNotThrow(()=>assertConsolidatedObservationGeometry(observation({left}),'HYPE','USDC'));
});

test('KRW and housing units use the same local bounds while clipped numeric text fails independently',()=>{
  for(const [symbol,unit]of [['233740','KRW'],['HOUSING-SEOUL','지수']]){
    const result=observation({unit});
    assert.doesNotThrow(()=>assertConsolidatedObservationGeometry(result,symbol,unit));
    result.buttons[0].summary.glyphs[1]={text:'123,456.789',box:box(178,62,120,15)};
    assert.throws(()=>assertConsolidatedObservationGeometry(result,symbol,unit),/observation text glyphs/);
  }
});

test('the consolidated diagnosis chart is ready only when its real Funnest SVG, complete source rows, units and selected index agree',()=>{
  const result={ready:true,engine:'funnest',id:'price',sourceCount:3,
    renderer:{engine:'funnest',svgPaths:[{visible:true,dLength:120,stroke:'var(--data-gold)'}]},
    svg:{role:'img',tabindex:'0',label:'미국 관측 종가 · 1개 관측',visible:true,box:{width:320,height:240}},
    input:{min:0,max:2,index:2,valueText:'2026-01-03, 관측값 없음 USD'},
    tableCaption:'미국 관측 종가 (USD), 날짜별 원자료',caption:'미국 관측 종가 · 2026-01-03 · 관측값 없음 USD',
    rows:[{date:'2026-01-01',value:'10.00'},{date:'2026-01-02',value:'관측값 없음'},{date:'2026-01-03',value:'관측값 없음'}]};
  assert.deepEqual(assertConsolidatedDiagnosisChart(result,'US'),result.rows[2]);
  assert.throws(()=>assertConsolidatedDiagnosisChart({...result,rows:result.rows.slice(1)},'US'),/every original row/);
  assert.throws(()=>assertConsolidatedDiagnosisChart({...result,input:{...result.input,index:0,valueText:'2026-01-03, 관측값 없음 USD'}},'US'),/exact source row/);
  assert.throws(()=>assertConsolidatedDiagnosisChart({...result,engine:'ztd'},'US'),/actual Funnest/);
  assert.throws(()=>assertConsolidatedDiagnosisChart({...result,renderer:{...result.renderer,svgPaths:[]}},'US'),/real Funnest SVG path geometry/);
  assert.throws(()=>assertConsolidatedDiagnosisChart({...result,renderer:{...result.renderer,svgPaths:[{visible:true,dLength:120,stroke:'var(--muted)'}]}},'US'),/real Funnest SVG path geometry/);
  assert.throws(()=>assertConsolidatedDiagnosisChart({...result,svg:{...result.svg,visible:false}},'US'),/visibly painted/);
  assert.throws(()=>assertConsolidatedDiagnosisChart({...result,svg:{...result.svg,label:'미국 관측 종가 · 2개 관측'}},'US'),/finite values/);
});

test('a missing or substituted unit cannot qualify as a fully readable observation',()=>{
  const result=observation();result.buttons[0].units=[];
  assert.throws(()=>assertConsolidatedObservationGeometry(result,'HYPE','USDC'),/one original source unit/);
  const substituted=observation({unit:'USD'});
  assert.throws(()=>assertConsolidatedObservationGeometry(substituted,'HYPE','USDC'),/original source unit/);
});
