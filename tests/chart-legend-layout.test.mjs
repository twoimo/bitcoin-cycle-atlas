import test from 'node:test';
import assert from 'node:assert/strict';
import {chartLegendSlot,fitLegendEntries,overlayBoxesIntersect,placePlotLabel} from '../dist/ui/chart-legend-layout.js';

test('six requested viewports keep the legend inside the price plot, at most 42%, with a single mobile chip',()=>{
  for(const [viewportWidth,height] of [[320,740],[390,844],[768,1024],[1024,768],[1440,900],[1920,1080]]){
    const width=viewportWidth<=430?viewportWidth:viewportWidth-101,left=8,right=width-80,top=18;
    const slot=chartLegendSlot({width,height,left,right,top,viewportWidth});
    assert.ok(slot.width<=(right-left)*.42+.01);assert.ok(slot.x>=left);assert.ok(slot.x+slot.width<=right-12+.01);
    assert.equal(slot.y,top+12);assert.ok(slot.y+slot.height<height);
    assert.equal(slot.compact,viewportWidth<=430);assert.equal(slot.height,viewportWidth<=430?44:40);
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

test('narrow desktop plots collapse before either semantic group loses its label or 44px disclosure target',()=>{
  const input={width:1024,height:768,left:8,top:56,bottom:700,viewportWidth:1024};
  for(const plotWidth of [490,495]){
    const slot=chartLegendSlot({...input,right:input.left+plotWidth});
    assert.ok(slot.maxWidth>=200&&slot.maxWidth<208);
    assert.equal(slot.compact,true);assert.equal(slot.compactReason,'width');
    assert.equal(slot.width,68);assert.equal(slot.height,44);
    assert.ok(slot.x+slot.width<=input.left+plotWidth-12+.01);
  }
  const widths=[84,73,72,84,106,68,96],labelWidth=32,gap=8,moreWidth=44;
  for(const plotWidth of [496,640,768,1024]){
    const slot=chartLegendSlot({...input,width:plotWidth+32,right:input.left+plotWidth});
    assert.equal(slot.compact,false);assert.equal(slot.height,40);
    assert.ok(slot.width<=plotWidth*.42+.01);
    const groupWidth=(slot.width-14-gap)/2; // Dock padding/borders and the shared group gap.
    const fit=fitLegendEntries(widths,{available:groupWidth-labelWidth-gap,gap,moreWidth});
    assert.equal(fit.visibleCount+fit.hiddenCount,widths.length);
    const entriesWidth=widths.slice(0,fit.visibleCount).reduce((sum,width)=>sum+width,0)+Math.max(0,fit.visibleCount-1)*gap;
    const used=labelWidth+gap+entriesWidth+(fit.hiddenCount?gap+moreWidth:0);
    assert.ok(used<=groupWidth,'even an empty items container retains both gaps before its +N control');
    if(plotWidth===496){assert.equal(fit.visibleCount,0);assert.equal(fit.hiddenCount,widths.length);}
  }
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
  assert.equal(slot.compact,true);assert.equal(slot.compactReason,'protected-anchors');
  assert.equal(slot.height,44);assert.equal(slot.y,input.top+12);
  assert.equal(slot.x+slot.width,input.right-12);assert.ok(slot.y+slot.height<=input.bottom-12);
  assert.equal(overlayBoxesIntersect(slot,anchor,4),false);assert.equal(JSON.stringify(input),snapshot);
  const shorter=chartLegendSlot({...input,bottom:85});
  assert.equal(shorter.compact,true);assert.equal(shorter.compactReason,'height');assert.equal(shorter.height,43);
  assert.ok(shorter.y+shorter.height<=85-12);
});

test('model, macro and event label boxes avoid the same reserved corner without altering their supplied anchors',()=>{
  const corner={x:730,y:30,width:510,height:64},args={x:1000,y:45,width:196,height:18,left:8,right:1260,top:18,bottom:760,obstacles:[corner]};
  const snapshot=JSON.stringify(args),placed=placePlotLabel(args);
  assert.ok(placed);assert.equal(overlayBoxesIntersect(placed,corner,4),false);
  assert.ok(placed.x>=args.left&&placed.x+placed.width<=args.right);assert.ok(placed.y>=args.top&&placed.y+placed.height<=args.bottom);
  assert.equal(JSON.stringify(args),snapshot);
  assert.equal(placePlotLabel({...args,obstacles:[{x:0,y:0,width:2000,height:2000}]}),null,'a blocked label collapses to its existing accessible anchor instead of covering information');
});
