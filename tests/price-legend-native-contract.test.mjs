import assert from 'node:assert/strict';
import test from 'node:test';
import {assertPriceLegendScrollSurface} from '../scripts/verify-workspace-browser.mjs';

const itemNames=['실제 가격','미래 가정','가정 범위','고점·저점','CYCLE TOP','PIT STOP','FIRST TOP','ATH','MID-TOP','BOTTOM'];
const statusNames=['실선 · 관측 사후 기준','점선 · 잠정·가정','◇ 거시 시계 · ○ 예시 경로'];
function compact(){
  return {width:320,height:900,scrollX:0,scrollY:0,pageWidth:320,url:'/',
    range:{start:'2024-01-01',end:'2028-01-01',interval:'daily'},observed:{line:100,candles:0},
    price:{min:100,max:200,mode:'auto',scale:'log',unit:'usd',inverted:'false'},
    pricePane:{left:8,right:240,top:18,bottom:700},sheet:null,
    legend:{left:160,right:228,top:30,bottom:74,width:68,height:44,clientWidth:68,maximum:0,mode:'chip',
      items:itemNames.map(name=>({name,painted:false,width:0,height:0})),statusItems:statusNames.map(name=>({name})),
      trigger:{name:'범례',painted:true,width:68,height:44}}};
}

test('native compact legend retains every semantic entry while hiding its replaced inline list',()=>{
  const state=compact();assert.doesNotThrow(()=>assertPriceLegendScrollSurface(state));
  const missing=structuredClone(state);missing.legend.items.pop();assert.throws(()=>assertPriceLegendScrollSurface(missing,state),/lost actual items/);
  const overflow=structuredClone(state);overflow.legend.maximum=10;assert.throws(()=>assertPriceLegendScrollSurface(overflow,state),/must not overflow/);
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
