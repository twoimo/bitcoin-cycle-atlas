import assert from 'node:assert/strict';
import test from 'node:test';
import {assertPriceLegendScrollSurface,readPriceLegendScrollSurface} from '../scripts/verify-workspace-browser.mjs';
import {readChart} from '../scripts/verify-chart-zoom-browser.mjs';
import {readNativeMeasurementTargets,verifyNativeChartWorkbench} from '../scripts/verify-native-chart-workbench-browser.mjs';

const itemNames=['실제 가격','미래 가정','가정 범위','고점·저점','CYCLE TOP','PIT STOP','FIRST TOP','ATH','MID-TOP','BOTTOM'];
const statusNames=['실선 · 관측 사후 기준','점선 · 잠정·가정','◇ 거시 시계 · ○ 예시 경로'];
function compact(){
  return {width:320,height:900,scrollX:0,scrollY:0,pageWidth:320,url:'/',
    range:{start:1704067200000,end:1830297600000,interval:'daily'},observed:{count:100,sourceMode:'close-only',hash:'funnest-bars-1'},
    price:{scale:'log',unit:'USD',inverted:false,mainPanePixelHash:'canvas-pixels-1'},
    paint:{engine:'funnest',painted:true,legacyPriceNodes:0,hostVisible:true,canvases:[{visible:true,readable:true,opaquePixels:500,sampledColors:14,mainPanePixelHash:'canvas-pixels-1'}]},
    pricePane:{left:8,right:240,top:18,bottom:700},sheet:null,
    legend:{left:160,right:228,top:30,bottom:74,width:68,height:44,clientWidth:68,maximum:0,mode:'chip',
      items:itemNames.map(name=>({name,painted:false,width:0,height:0})),statusItems:statusNames.map(name=>({name})),
      trigger:{name:'범례',painted:true,width:68,height:44}}};
}

test('the browser reader sources chart state from Funnest snapshots and real canvas pixels',()=>{
  const source=readPriceLegendScrollSurface.toString();
  assert.match(source,/getAtlasFunnestSnapshot/);assert.match(source,/getImageData/);assert.match(source,/engineBars/);
  assert.doesNotMatch(source,/observedLineCount|dataset\\.priceMin|dataset\\.priceMax|querySelectorAll\\('path'\\)/);
});

test('native zoom evidence reads Funnest bars, source archives and actual canvas pixels',()=>{
  const source=readChart.toString();
  assert.match(source,/getAtlasFunnestSnapshot/);assert.match(source,/engineBars/);assert.match(source,/getImageData/);
  assert.match(source,/btc-ohlc\.json/);assert.match(source,/btc-daily\.json/);assert.match(source,/btc-volume\.json/);
  assert.match(source,/replace\(\/-\?usd\$\/i/);assert.match(source,/volumeMismatches/);assert.match(source,/scaleConsistent/);
  assert.doesNotMatch(source,/dataset\.plot(?:Left|Right)|dataset\.price(?:Min|Max)|dataset\.chartType/);assert.doesNotMatch(source,/observed-candle|volume-bar/);
});

test('native measurement input and workbench bind to actual source-bar and painter evidence',()=>{
  const measurement=readNativeMeasurementTargets.toString(),workbench=verifyNativeChartWorkbench.toString();
  assert.match(measurement,/getAtlasFunnestSnapshot/);assert.match(measurement,/engineBars/);assert.match(measurement,/snapshot\.range/);assert.match(measurement,/layout\.plotWidth/);
  assert.doesNotMatch(measurement,/observed-candle|volume-bar|dataset\.plot(?:Left|Right)/);
  assert.match(workbench,/parseEthArchive/);assert.match(workbench,/parseEquityArchive/);assert.match(workbench,/readNativeFunnestEvidence/);assert.match(workbench,/assertNativeObservedEvidence/);assert.match(workbench,/assertNativeOverlayEvidence/);
  assert.match(workbench,/forecastSegments/);assert.match(workbench,/baselineSegments/);
  assert.match(workbench,/inspectAtlasInteractionRender/);assert.match(workbench,/readNativeMeasurementInk/);assert.match(workbench,/markup:record\.export\.markup/);
  assert.doesNotMatch(workbench,/chart-measurement|measurement-start|measureDate/,'the Funnest workbench must not read the replaced SVG measurement layer');
});

test('native compact legend retains every semantic entry while hiding its replaced inline list',()=>{
  const state=compact();assert.doesNotThrow(()=>assertPriceLegendScrollSurface(state));
  const missing=structuredClone(state);missing.legend.items.pop();assert.throws(()=>assertPriceLegendScrollSurface(missing,state),/lost actual items/);
  const overflow=structuredClone(state);overflow.legend.maximum=10;assert.throws(()=>assertPriceLegendScrollSurface(overflow,state),/must not overflow/);
  const blank=structuredClone(state);blank.paint.canvases[0].opaquePixels=0;assert.throws(()=>assertPriceLegendScrollSurface(blank),/readable painted canvas pixels/);
  const legacy=structuredClone(state);legacy.paint.legacyPriceNodes=1;assert.throws(()=>assertPriceLegendScrollSurface(legacy),/no legacy price renderer/);
});

test('responsive legend adaptation preserves the original native chart/document invariants',()=>{
  const baseline=compact();
  for(const field of ['range','observed','price']){
    const state=structuredClone(baseline);state[field]={...state[field],changed:true};
    assert.throws(()=>assertPriceLegendScrollSurface(state,baseline),/native legend gesture changed/);
  }
  const scrolled=structuredClone(baseline);scrolled.scrollY=12;assert.throws(()=>assertPriceLegendScrollSurface(scrolled,baseline),/moved the document/);
  const navigated=structuredClone(baseline);navigated.url='/?range=changed';assert.throws(()=>assertPriceLegendScrollSurface(navigated,baseline),/changed URL state/);
});

test('the full sheet must expose all meanings in a bounded native vertical scroll owner',()=>{
  const baseline=compact(),state=structuredClone(baseline);
  state.sheet={left:0,right:320,top:0,bottom:900,width:320,height:900,clientHeight:820,maximum:500,horizontalOverflow:0,overflowY:'auto',
    items:[...itemNames,...statusNames].map(name=>({name,painted:true,width:200,height:20}))};
  assert.doesNotThrow(()=>assertPriceLegendScrollSurface(state,baseline));
  const hidden=structuredClone(state);hidden.sheet.items[3].painted=false;assert.throws(()=>assertPriceLegendScrollSurface(hidden,baseline),/entry is hidden/);
  const missing=structuredClone(state);missing.sheet.items.pop();assert.throws(()=>assertPriceLegendScrollSurface(missing,baseline),/every original meaning/);
  const clipped=structuredClone(state);clipped.sheet.horizontalOverflow=40;assert.throws(()=>assertPriceLegendScrollSurface(clipped,baseline),/horizontal overflow/);
  const inert=structuredClone(state);inert.sheet.overflowY='hidden';assert.throws(()=>assertPriceLegendScrollSurface(inert,baseline),/own its native vertical scrolling/);
});
