import test from 'node:test';
import assert from 'node:assert/strict';
import {chartLegendSlot,fitLegendEntries,overlayBoxesIntersect,placePlotLabel} from '../dist/ui/chart-legend-layout.js';

test('six requested viewports keep the legend inside the price plot, at most 42%, with a single mobile chip',()=>{
  for(const [viewportWidth,height] of [[320,740],[390,844],[768,1024],[1024,768],[1440,900],[1920,1080]]){
    const width=viewportWidth<=430?viewportWidth:viewportWidth-101,left=8,right=width-80,top=18;
    const slot=chartLegendSlot({width,height,left,right,top,viewportWidth});
    assert.ok(slot.width<=(right-left)*.42+.01);assert.ok(slot.x>=left);assert.ok(slot.x+slot.width<=right-4+.01);
    assert.equal(slot.y,top);assert.ok(slot.y+slot.height<height);
    assert.equal(slot.compact,viewportWidth<=430);assert.equal(slot.height,viewportWidth<=430?44:20);
    assert.ok(slot.hudMaxWidth+20<=slot.x+.01,'readout and replay HUD end before the legend');
  }
});

test('whole entry fitting accounts for the +N hit area without dropping any legend meaning',()=>{
  const widths=[84,73,72,84,106,68,96];
  for(let available=40;available<=700;available++){
    const fit=fitLegendEntries(widths,{available,gap:8,moreWidth:36});
    assert.equal(fit.visibleCount+fit.hiddenCount,widths.length);
    const used=widths.slice(0,fit.visibleCount).reduce((sum,width)=>sum+width,0)+Math.max(0,fit.visibleCount-1)*8+(fit.hiddenCount?36+(fit.visibleCount?8:0):0);
    assert.ok(used<=available,'an entire entry or its +N affordance fits; none is partially clipped');
  }
  assert.deepEqual(fitLegendEntries([],{available:0}),{visibleCount:0,hiddenCount:0});
});

test('legend yields below immutable model anchors while retaining its right inset and width budget',()=>{
  const input={width:1340,height:820,left:8,right:1260,top:18,viewportWidth:1440};
  const before=chartLegendSlot(input),anchor={x:before.x+30,y:before.y+8,width:20,height:20},snapshot=JSON.stringify(anchor);
  const after=chartLegendSlot({...input,protectedAnchors:[anchor]});
  assert.equal(after.x,before.x);assert.equal(after.width,before.width);assert.ok(after.y>before.y);
  assert.equal(overlayBoxesIntersect(after,anchor,4),false);assert.equal(JSON.stringify(anchor),snapshot);
});

test('short replay price panes use the full-list chip before a reserved cycle or footer lane',()=>{
  const input={width:795,height:285,left:12,right:713,top:18,bottom:110,viewportWidth:900};
  const rows=chartLegendSlot(input),anchor={x:rows.x+30,y:rows.y+8,width:20,height:20};
  const snapshot=JSON.stringify(input),slot=chartLegendSlot({...input,protectedAnchors:[anchor]});
  // The 20px row drops below this anchor and stays inside the price pane.
  assert.equal(slot.compact,false);assert.equal(slot.compactReason,null);
  assert.equal(slot.height,20);assert.ok(slot.y>=anchor.y+anchor.height);
  assert.equal(slot.x+slot.width,input.right-4);assert.ok(slot.y+slot.height<=input.bottom-4);
  assert.equal(overlayBoxesIntersect(slot,anchor,4),false);assert.equal(JSON.stringify(input),snapshot);
  const blocked=chartLegendSlot({...input,bottom:90,protectedAnchors:[anchor]});
  assert.equal(blocked.compact,false);assert.equal(blocked.height,20);
  assert.ok(blocked.y>=anchor.y+anchor.height);assert.ok(blocked.y+blocked.height<=86);
  const crowded={x:rows.x+30,y:14,width:20,height:60};
  const chip=chartLegendSlot({...input,bottom:90,protectedAnchors:[crowded]});
  assert.equal(chip.compact,true);assert.equal(chip.compactReason,'protected-anchors');
  assert.equal(chip.height,44);assert.ok(chip.y+chip.height<=90);
  const shorter=chartLegendSlot({...input,bottom:85});
  assert.equal(shorter.compact,true);assert.equal(shorter.compactReason,'height');assert.equal(shorter.height,44);
  assert.ok(shorter.y>=input.top);assert.ok(shorter.y+shorter.height<=85);
});

test('a 52px replay price pane keeps the full 44px chip inside the observed 900x430 geometry',()=>{
  // Screen 900×430 produced a 52px price pane from T=18 to priceBottom=70.
  // That pane still uses the 44px chip, and the chip stays inside the pane.
  const input={width:795,height:285,left:12,right:713,top:18,bottom:70,viewportWidth:900};
  const slot=chartLegendSlot(input);
  assert.equal(slot.compact,true);assert.equal(slot.compactReason,'height');
  assert.equal(slot.height,44);assert.equal(slot.width,68);
  assert.ok(slot.y>=input.top);assert.ok(slot.y+slot.height<=input.bottom);
  assert.equal(slot.x+slot.width,input.right-4);
  const tiny=chartLegendSlot({...input,bottom:60});
  assert.equal(tiny.height,42);assert.ok(tiny.y+tiny.height<=60);
});

test('model, macro and event label boxes avoid the same reserved corner without altering their supplied anchors',()=>{
  const corner={x:730,y:30,width:510,height:64},args={x:1000,y:45,width:196,height:18,left:8,right:1260,top:18,bottom:760,obstacles:[corner]};
  const snapshot=JSON.stringify(args),placed=placePlotLabel(args);
  assert.ok(placed);assert.equal(overlayBoxesIntersect(placed,corner,4),false);
  assert.ok(placed.x>=args.left&&placed.x+placed.width<=args.right);assert.ok(placed.y>=args.top&&placed.y+placed.height<=args.bottom);
  assert.equal(JSON.stringify(args),snapshot);
  assert.equal(placePlotLabel({...args,obstacles:[{x:0,y:0,width:2000,height:2000}]}),null,'a blocked label collapses to its existing accessible anchor instead of covering information');
});

test('a renderer that reports only its horizontal plot bounds keeps the legend on the price-pane top',()=>{
  const reported=chartLegendSlot({width:1333,height:800,left:0,right:1245,viewportWidth:1440});
  assert.equal(reported.y,18);assert.equal(reported.height,20);assert.equal(reported.width,1245*.42);assert.equal(reported.x+reported.width,1245-4);
  assert.deepEqual(chartLegendSlot({width:1333,height:800,left:0,right:1245,top:18,bottom:800,viewportWidth:1440}),reported);
});
