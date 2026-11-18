import test from 'node:test';
import assert from 'node:assert/strict';
import {rsiCriteriaSlot,RSI_CRITERIA_AREA_LIMIT,RSI_CRITERIA_CARD_HEIGHT} from '../dist/ui/rsi-criteria-layout.js';
import {chartLegendSlot,overlayBoxesIntersect} from '../dist/ui/chart-legend-layout.js';
import {rsiChartLayout} from '../dist/rsi-chart-layout.js';

function geometry(viewportWidth,height){
  // Preserve the existing outer rails and the real 64px chart price axis.
  const width=viewportWidth-108,{left,right,top,priceBottom:bottom}=rsiChartLayout(width,height,true,64);
  const input={width,height,left,right,top,bottom,viewportWidth};
  return {...input,legend:chartLegendSlot(input)};
}

for(const viewportWidth of [320,390,768,1024,1440,1920])for(const height of [740,600,180]){
  test(`criteria ${viewportWidth}px × ${height}px stays inside its real price pane and clear of the legend`,()=>{
    const bounds=geometry(viewportWidth,height),box=rsiCriteriaSlot(bounds),area=(bounds.right-bounds.left)*(bounds.bottom-bounds.top);
    assert.equal(box.visible,true);assert(box.width>=44);assert(box.height>=44);
    assert(box.x>=bounds.left);assert(box.x+box.width<=bounds.right,'price ticks stay outside the card');
    assert(box.y>=Math.max(bounds.top,56),'quote HUD is above the card');assert(box.y+box.height<=bounds.bottom,'RSI pane stays outside the card');
    assert.equal(overlayBoxesIntersect(box,bounds.legend,8),false);
    assert(box.width*box.height/area<=RSI_CRITERIA_AREA_LIMIT+.00001);
    if(viewportWidth<=640)assert.equal(box.collapsed,true);
    if(!box.collapsed){assert.equal(box.height,RSI_CRITERIA_CARD_HEIGHT);assert(box.width>=244);assert.equal(box.placement,'below');}
    if(height===180)assert.equal(box.placement,viewportWidth<=430?'beside':'below');
    assert.equal(bounds.width-bounds.right,64,'R2 gutter is unchanged');
  });
}

test('a displaced native legend remains the placement owner and a physically insufficient pane is not overlaid',()=>{
  const bounds=geometry(1440,740),moved={...bounds.legend,y:bounds.bottom-60};
  const box=rsiCriteriaSlot({...bounds,legend:moved});
  assert.equal(box.collapsed,true);assert.equal(box.placement,'beside');
  assert.equal(overlayBoxesIntersect(box,moved,8),false);
  const tiny=rsiCriteriaSlot({width:120,height:90,left:12,right:56,top:56,bottom:80,viewportWidth:320});
  assert.equal(tiny.visible,false);assert.equal(tiny.areaRatio,0);
});


test('tablet criteria yields to measured signal labels without moving native price axes or discarding signals',()=>{
  const input={width:917,height:628,left:84,right:781,top:20,bottom:498,viewportWidth:1024,
    protectedAnchors:[{x:600,y:100,width:44,height:13},{x:700,y:200,width:44,height:13}]};
  const original=structuredClone(input),box=rsiCriteriaSlot(input),legend=chartLegendSlot(input);
  assert.equal(box.visible,true);assert(box.width>=44&&box.height>=44);
  assert(box.x>=input.left&&box.x+box.width<=input.right);
  assert(box.y>=56&&box.y+box.height<=input.bottom);
  assert.equal(overlayBoxesIntersect(box,legend,8),false);
  assert(input.protectedAnchors.every(anchor=>!overlayBoxesIntersect(box,anchor,8)));
  assert(box.width*box.height/((input.right-input.left)*(input.bottom-input.top))<=RSI_CRITERIA_AREA_LIMIT);
  assert.deepEqual(input,original,'overlay placement never moves axes or source signal boxes');
});

test('a fully obstructed pane does not paint a criteria card over protected source labels',()=>{
  const input={width:917,height:628,left:84,right:781,top:20,bottom:498,viewportWidth:1024,
    protectedAnchors:[{x:84,y:20,width:697,height:478}]};
  assert.equal(rsiCriteriaSlot(input).visible,false,'the existing Backtest dialog retains the criteria when no overlay can fit');
});
