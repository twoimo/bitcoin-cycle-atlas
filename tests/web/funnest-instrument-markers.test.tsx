import React, { act } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createRoot, type Root } from 'react-dom/client';
import { CartesianChart } from '@funnest/charts-react';
import { FunnestInstrumentMarkers, activateInstrumentMarkerGroup, groupInstrumentMarkers, placeInstrumentMarkerLabels, shouldUseInstrumentMarkerTouchTargets, type FunnestInstrumentMarker } from '../../apps/web/src/components/funnest-instrument-markers.js';

const marker = (id: string, kind: 'evidence'|'judgment', selected: boolean, onSelect: () => void, at = 2, value = 10): FunnestInstrumentMarker => ({
  id, date: '2026-11-13', kind, selected, onSelect, label: kind === 'evidence' ? 'E' : 'J', title: `full title ${id}`, at, value,
});

test('groups same kind/date, keeps identities and titles, and leaves source data untouched', () => {
  const picks: string[] = [];
  const source = [marker('a','evidence',false,()=>picks.push('a')),marker('b','evidence',true,()=>picks.push('b')),marker('c','judgment',false,()=>picks.push('c'))];
  const original = structuredClone(source.map(({ onSelect: _fn, ...rest }) => rest));
  const groups = groupInstrumentMarkers(source);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].markers.map(item => item.id), ['a','b']);
  assert.equal(groups[0].markers[1].title, 'full title b');
  assert.deepEqual(source.map(({ onSelect: _fn, ...rest }) => rest), original);
  activateInstrumentMarkerGroup(groups[0]);
  assert.deepEqual(picks, ['b']);
});

test('label placement clears prior boxes, obeys plot bounds and omits text when no space remains', () => {
  const groups = groupInstrumentMarkers([marker('a','evidence',false,()=>{}, 10, 10), marker('b','judgment',false,()=>{}, 10, 10)]);
  const labels = placeInstrumentMarkerLabels(groups, 300, 120);
  assert.equal(labels.length, 2);
  assert.notDeepEqual(labels[0].labelBox, labels[1].labelBox);
  const plot = { left: 40, right: 80, top: 30, bottom: 60 };
  const bounded = placeInstrumentMarkerLabels(groups, 300, 120, [], plot);
  assert(bounded.every(label => label.labelBox !== null && label.labelBox.x >= plot.left && label.labelBox.x + label.labelBox.width <= plot.right && label.labelBox.y >= plot.top && label.labelBox.y + label.labelBox.height <= plot.bottom), 'labels stay inside the actual plot, not axis gutters');
  const multi = groupInstrumentMarkers([marker('a','evidence',false,()=>{}), marker('b','evidence',false,()=>{})]);
  const tooNarrow = placeInstrumentMarkerLabels(multi, 100, 100, [], {left:10,right:25,top:10,bottom:40});
  assert.equal(tooNarrow[0].labelX, null, 'count labels cannot overflow a plot narrower than their measured text');
  const blocked = placeInstrumentMarkerLabels(groups, 20, 20, [{x:0,y:0,width:20,height:20}]);
  assert.equal(blocked.length, groups.length);
  assert(blocked.every(label => label.labelX === null && label.labelY === null));
  assert.equal(groups[0].markers[0].title, 'full title a', 'source/title access survives absent visible labels');
});

test('44px targets are plot-bounded, clear of overlays and one another, or explicitly unplaced', () => {
  assert.equal(shouldUseInstrumentMarkerTouchTargets(500,false),true);
  assert.equal(shouldUseInstrumentMarkerTouchTargets(501,false),false);
  assert.equal(shouldUseInstrumentMarkerTouchTargets(900,true),true,'coarse pointers receive touch targets on wide plots');
  const first = marker('a','evidence',false,()=>{},50,50);
  const second = {...marker('b','judgment',false,()=>{},52,50),date:'2026-11-14'};
  const groups = groupInstrumentMarkers([first,second]);
  const obstacle = {x:0,y:0,width:20,height:20};
  const bounds = {left:0,right:160,top:0,bottom:100};
  const layout = placeInstrumentMarkerLabels(groups,160,100,[obstacle],bounds,44);
  assert.equal(layout.length,2);
  for (const item of layout) {
    assert(item.targetBox, 'a 44px hit target was placed');
    assert.equal(item.targetBox.width,44); assert.equal(item.targetBox.height,44);
    assert(item.targetBox.x >= bounds.left && item.targetBox.y >= bounds.top && item.targetBox.x + 44 <= bounds.right && item.targetBox.y + 44 <= bounds.bottom, 'target remains inside plot bounds');
    assert(!(item.targetBox.x < obstacle.x + obstacle.width && obstacle.x < item.targetBox.x + 44 && item.targetBox.y < obstacle.y + obstacle.height && obstacle.y < item.targetBox.y + 44), 'target avoids measured overlay');
  }
  assert(!(layout[0].targetBox!.x < layout[1].targetBox!.x + 44 && layout[1].targetBox!.x < layout[0].targetBox!.x + 44 && layout[0].targetBox!.y < layout[1].targetBox!.y + 44 && layout[1].targetBox!.y < layout[0].targetBox!.y + 44), 'separate marker targets cannot overlap');
  assert.deepEqual(layout.map(item=>item.anchor),[{x:50,y:50},{x:52,y:50}], 'target placement never moves source circles');
  assert(layout[1].connector, 'a relocated touch target connects back to its source marker');
  assert.deepEqual({x:layout[1].connector!.x1,y:layout[1].connector!.y1},layout[1].anchor);
  const impossible = placeInstrumentMarkerLabels(groups,40,100,[],{left:0,right:40,top:0,bottom:100},44);
  assert(impossible.every(item=>item.targetBox===null), 'a plot narrower than the target does not claim a fit');
  assert(impossible.every(item=>item.group.markers.length>0), 'source access remains represented when hit-target placement fails');
});

test('displaced labels connect back to, but never replace, the exact source anchor', () => {
  const groups = groupInstrumentMarkers([marker('a','evidence',false,()=>{}, 50, 50), marker('b','evidence',false,()=>{}, 50, 50)]);
  const labels = placeInstrumentMarkerLabels(groups, 200, 120, [{x:56,y:30,width:35,height:20}]);
  const label = labels[0];
  assert.notEqual(label.labelX, null);
  assert(label.connector, 'a collision-displaced label gets a visible connector');
  assert.deepEqual(label.anchor, {x:50,y:50});
  assert.deepEqual({x:label.connector!.x1,y:label.connector!.y1}, label.anchor, 'connector begins at the actual source circle coordinate');
  assert.notDeepEqual({x:label.connector!.x2,y:label.connector!.y2}, label.anchor, 'connector ends at the displaced annotation');
  const unblocked = placeInstrumentMarkerLabels(groups.slice(0,1), 200, 120)[0];
  assert.equal(unblocked.connector, null, 'labels at their preferred location need no connector');
});

test('group activation calls selected-or-last source and onMarker once; keyboard Enter and Space activate', async () => {
  const { document, window } = parseHTML('<html><body><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document });
  const root: Root = createRoot(document.getElementById('root')!);
  const calls: string[] = [];
  const items = [marker('first','evidence',false,()=>calls.push('first')), marker('selected','evidence',true,()=>calls.push('selected'))];
  await act(async () => root.render(<CartesianChart width={300} height={240} series={[{id:'price',data:[8,9,10,11]}]}><FunnestInstrumentMarkers markers={items} active onMarker={()=>calls.push('parent')}/></CartesianChart>));
  const control = document.querySelector('[data-hit-target="44"][role="button"]');
  assert(control, 'coarse-pointer marker remains an accessible control');
  const hitRect = control.querySelector('rect[aria-hidden="true"]');
  assert.equal(hitRect?.getAttribute('width'),'44');
  assert.equal(hitRect?.getAttribute('height'),'44');
  assert.equal(document.querySelector('.atlas-funnest-instrument-markers')?.getAttribute('data-hit-target-status'),'complete');
  for (const key of ['Enter',' ']) {
    const event = new window.Event('keydown',{bubbles:true,cancelable:true}); Object.defineProperty(event,'key',{value:key});
    await act(async()=>control.dispatchEvent(event));
  }
  let bubbled = false;
  document.addEventListener('click',()=>{bubbled=true;},{once:true});
  await act(async()=>control.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true})));
  assert.equal(bubbled, false, 'marker click stops propagation to the chart parent');
  assert.deepEqual(calls, ['selected','parent','selected','parent','selected','parent']);
  await act(async()=>root.render(<CartesianChart width={30} height={30} series={[{id:'price',data:[8,9,10,11]}]}><FunnestInstrumentMarkers markers={items} active/></CartesianChart>));
  const markerGroup = document.querySelector('[data-marker-kind]');
  assert(markerGroup?.getAttribute('aria-label')?.includes('full title selected'), 'inaccessible fit does not erase the full source name');
  assert.equal(document.querySelector('.atlas-funnest-instrument-markers')?.getAttribute('data-hit-target-status'),'limited');
  assert(document.querySelector('circle'), 'source circle remains present even when no 44px target fits');
  await act(async()=>root.unmount());
});
