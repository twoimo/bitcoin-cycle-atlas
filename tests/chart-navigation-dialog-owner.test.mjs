import assert from 'node:assert/strict';
import test from 'node:test';
import {bindChartNavigation} from '../dist/chart-navigation.js';
import {navigationHarness} from './helpers/navigation-fixture.mjs';

const range={start:'2024-01-01',end:'2024-04-09',min:'2023-01-01',max:'2025-12-31'};

for(const native of [false,true])test(`${native?'Native dialog':'ARIA dialog'} inside a chart retains its own plain-cell input`,()=>{
  const h=navigationHarness(range),dialog=h.document.createElement(native?'dialog':'section'),cell=h.document.createElement('th');
  if(!native)dialog.setAttribute('role','dialog');dialog.append(cell);h.element.append(dialog);
  for(const [type,props] of [['wheel',{deltaY:380}],['keydown',{key:'+'}],['dblclick',{}],['contextmenu',{}]]){
    const event=h.fire(type,{target:cell,...props});h.flush();
    assert.equal(event.defaultPrevented,false,`${type} must remain available to the dialog`);
  }
  h.fire('pointerdown',{target:cell,clientX:300,clientY:200});
  h.pointer('pointermove',{target:cell,clientX:600,clientY:200});
  h.pointer('pointerup',{target:cell,clientX:600,clientY:200});h.flush();
  assert.deepEqual(h.changes,[]);assert.equal(h.resets,0);assert.equal(h.controller.menu.hidden,true);
  h.controller.destroy();
});

test('A chart in an outer dialog keeps its own wheel navigation',()=>{
  const h=navigationHarness(range),dialog=h.document.createElement('dialog');dialog.append(h.element);
  const event=h.fire('wheel',{deltaY:120});h.flush();
  assert.equal(event.defaultPrevented,true);assert.equal(h.changes.length,1);assert.notDeepEqual(h.range,range);
  h.controller.destroy();
});

test('A chart whose own root is a dialog keeps its wheel navigation',()=>{
  const h=navigationHarness(range);h.element.setAttribute('role','dialog');
  const event=h.fire('wheel',{deltaY:120});h.flush();
  assert.equal(event.defaultPrevented,true);assert.equal(h.changes.length,1);
  h.controller.destroy();
});

test('A nested chart inside a child dialog changes only its own range',()=>{
  const outer=navigationHarness(range),dialog=outer.document.createElement('section');dialog.setAttribute('role','dialog');outer.element.append(dialog);
  const inner=outer.document.createElement('div'),svg=outer.document.createElement('svg');svg.dataset={...outer.svg.dataset};svg.viewBox=outer.svg.viewBox;inner.append(svg);dialog.append(inner);
  let innerRange={...range};const innerChanges=[];
  const control=bindChartNavigation({element:inner,getRange:()=>innerRange,getTool:()=> 'crosshair',onRangeChange:value=>{innerRange=value;innerChanges.push(value);},onReset:()=>{}});
  const capture=outer.fire('wheel',{target:svg,deltaY:120});outer.flush();assert.equal(capture.defaultPrevented,false);
  const owned=inner.emit('wheel',{target:svg,deltaY:120});outer.flush();
  assert.equal(owned.defaultPrevented,true);assert.equal(innerChanges.length,1);assert.deepEqual(outer.changes,[]);
  control.destroy();outer.controller.destroy();
});
