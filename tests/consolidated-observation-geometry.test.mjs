import assert from 'node:assert/strict';
import test from 'node:test';
import {assertConsolidatedObservationGeometry} from '../scripts/verify-consolidated-workspace-browser.mjs';

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

test('a missing or substituted unit cannot qualify as a fully readable observation',()=>{
  const result=observation();result.buttons[0].units=[];
  assert.throws(()=>assertConsolidatedObservationGeometry(result,'HYPE','USDC'),/one original source unit/);
  const substituted=observation({unit:'USD'});
  assert.throws(()=>assertConsolidatedObservationGeometry(substituted,'HYPE','USDC'),/original source unit/);
});
