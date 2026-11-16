import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHeadingIntersectionArea, pageHeadingOverlapAreas, validatePageHeadingState} from '../scripts/page-heading-browser-contract.mjs';

const rect = (left, top, width, height) => ({left, top, right:left + width, bottom:top + height, width, height});
const clone = value => structuredClone(value);
const validate = (state, previous = null) => validatePageHeadingState(state, previous, state.title);

const shared = () => ({
  h1Count:1, color:'rgb(219, 219, 219)', fontSize:'12px', lineHeight:'14px', hiddenBy:[],
  describedBy:'atlas-page-description', description:'가격 관측과 역사적 주기 자료를 함께 살펴보는 차트입니다.', descriptionCount:1,
  followsToolbar:true, outsidePlot:true,
  overflow:0, duplicateTitles:[], overlayCollisions:[], symbolCollision:false, symbolGlyphsInToolbar:true,
});

function labelState() {
  return {...shared(),
    title:'가격 차트', paintedH1Count:0, painted:false, heading:rect(0, 47, 1, 1), glyphs:[rect(0, 47, 49, 14)],
    headingInViewport:true, glyphsInViewport:true, headingInToolbar:true, glyphsInToolbar:false,
    paintIssues:['clip-path: atlas-page-heading inset(50%)', 'clip-path: atlas-page-intro inset(50%)', 'horizontal clipping: atlas-page-heading'],
    placement:{kind:'label', anchor:null, expected:null, delta:null},
    labelRow:{rect:rect(0, 47, 1, 1), position:'absolute'},
    symbolButton:rect(48, 2, 200, 44), symbolLabel:rect(80, 14, 120, 18), symbolGlyphs:[rect(80, 16, 44, 14)], symbolPainted:true,
    geometry:{toolbar:rect(0, 0, 1440, 48), plot:rect(0, 48, 1440, 852), bottom:null, readout:null, source:null},
  };
}

function visibleRowState() {
  return {...labelState(), paintedH1Count:1, painted:true, heading:rect(8, 52, 68, 14), glyphs:[rect(8, 52, 68, 14)],
    headingInToolbar:false, paintIssues:[], labelRow:{rect:rect(0, 48, 1440, 22), position:'static'},
    geometry:{toolbar:rect(0, 0, 1440, 48), plot:rect(0, 70, 1440, 830), bottom:null, readout:null, source:null}};
}

function compareState() {
  return {...shared(), title:'사이클 비교', paintedH1Count:1, painted:true, heading:rect(48, 869, 68, 14), glyphs:[rect(48, 869, 68, 14)],
    headingInViewport:true, glyphsInViewport:true, headingInToolbar:true, glyphsInToolbar:true, paintIssues:[], labelRow:null,
    placement:{kind:'compare', anchor:rect(124, 852, 196, 48), expected:{left:48, top:869}, delta:{left:0, top:0}},
    symbolButton:null, symbolLabel:null, symbolGlyphs:[],
    geometry:{toolbar:rect(0, 852, 320, 48), plot:rect(0, 0, 320, 852), bottom:null, readout:null, source:null}};
}

test('the price label keeps one described H1 without painting it or reserving a row above the plot', () => {
  assert.deepEqual(validate(labelState()), []);
});

test('the removed visible 22px label row now fails the price label contract', () => {
  const failures = validate(visibleRowState());
  assert.ok(failures.includes('h1 total=1, painted=1, expected painted=0'), failures.join('\n'));
  assert.ok(failures.includes('hidden heading must not paint a visible box'), failures.join('\n'));
  assert.ok(failures.includes('hidden label must take no layout flow'), failures.join('\n'));
});

test('the hidden H1 must stay exposed, out of flow, beside the toolbar and behind a painted instrument identity', () => {
  for (const mutate of [
    state => { state.paintedH1Count = 1; }, state => { state.painted = true; },
    state => { state.heading = rect(0, 47, 2, 1); }, state => { state.heading = rect(0, 47, 1, 14); }, state => { state.heading.right = NaN; },
    state => { state.labelRow.position = 'static'; }, state => { state.labelRow.position = 'relative'; },
    state => { state.labelRow.rect = rect(0, 47, 1440, 22); }, state => { state.labelRow = null; },
    state => { state.hiddenBy = ['atlas-page-intro']; }, state => { delete state.hiddenBy; },
    state => { state.followsToolbar = false; }, state => { state.outsidePlot = false; },
    state => { state.symbolPainted = false; }, state => { state.symbolButton = null; }, state => { state.symbolLabel = null; },
    state => { state.symbolGlyphs = []; }, state => { state.symbolGlyphsInToolbar = false; },
    state => { state.placement.kind = null; }, state => { state.placement.kind = 'symbol'; },
  ]) { const state = labelState(); mutate(state); assert.ok(validate(state).length > 0, mutate.toString()); }
});

test('the historical 1680px² heading-on-button layout fails even when ticker glyphs do not overlap', () => {
  const state = labelState();
  // The H1/button boxes are the user's actual old geometry. Text ranges are
  // independent synthetic inputs that isolate the missed button-area overlap.
  state.heading = rect(60, 3, 120, 14); state.symbolButton = rect(56, 1, 128, 36);
  state.glyphs = [rect(60, 3, 68, 14)];
  state.headingInToolbar = true; state.glyphsInToolbar = true;
  state.placement = {kind:'symbol', delta:{left:0, top:0}}; state.labelRow = null;
  state.symbolLabel = rect(80, 20, 100, 16); state.symbolGlyphs = [rect(80, 21, 44, 14)];
  const areas = pageHeadingOverlapAreas(state);
  assert.equal(areas.headingSymbolButton, 1680); assert.equal(areas.headingSymbolGlyphs, 0);
  assert.ok(validate(state).includes('headingSymbolButton overlap area 1680px²'));
});

test('touching an edge has zero area', () => {
  assert.equal(pageHeadingIntersectionArea(rect(0, 0, 44, 44), rect(44, 0, 44, 44)), 0);
  assert.equal(pageHeadingIntersectionArea(rect(0, 0, 44, 44), rect(0, 44, 44, 44)), 0);
  const state = compareState(); state.geometry.plot = rect(0, 0, 320, 869);
  assert.equal(state.heading.top, state.geometry.plot.bottom);
  assert.deepEqual(validate(state), []);
});

test('one pixel of button overlap fails using raw rectangles despite false summary flags', () => {
  const state = compareState();
  state.symbolButton = rect(state.heading.right - 1, state.heading.top, 44, 44);
  state.symbolCollision = false; state.overlapAreas = {headingSymbolButton:0};
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolButton, 14);
  assert.ok(validate(state).includes('headingSymbolButton overlap area 14px²'));
});

test('positive subpixel overlap is not rounded away by the existing 0.01px coordinate tolerance', () => {
  const state = compareState(); state.symbolButton = rect(state.heading.right - .001, state.heading.top, 44, 44);
  assert.ok(pageHeadingOverlapAreas(state).headingSymbolButton > 0);
  assert.match(validate(state).join('\n'), /headingSymbolButton overlap area/);
});

test('the symbol label rectangle is checked independently of its button and ticker text', () => {
  const state = compareState(); state.symbolLabel = rect(state.heading.right - 1, state.heading.top, 44, 14);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolButton, 0);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolGlyphs, 0);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolLabel, 14);
  assert.match(validate(state).join('\n'), /headingSymbolLabel overlap area 14px²/);
});

test('actual ticker Range rectangles cannot overlap H1 Range rectangles', () => {
  const state = compareState(); state.symbolGlyphs = [rect(state.glyphs[0].right - 1, state.glyphs[0].top, 20, 14)];
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolButton, 0);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolLabel, 0);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolGlyphs, 14);
  assert.match(validate(state).join('\n'), /headingSymbolGlyphs overlap area 14px²/);
});

test('H1 glyph overhang cannot enter a symbol button or label even when the H1 box is clear', () => {
  const state = compareState(); state.glyphs = [rect(118, 869, 68, 14)];
  state.symbolButton = rect(180, 869, 44, 44); state.symbolLabel = rect(180, 869, 44, 14);
  const areas = pageHeadingOverlapAreas(state);
  assert.equal(areas.headingSymbolButton, 0); assert.equal(areas.headingSymbolLabel, 0);
  assert.equal(areas.glyphSymbolButton, 84); assert.equal(areas.glyphSymbolLabel, 84);
  assert.match(validate(state).join('\n'), /glyphSymbolButton overlap area 84px²/);
  assert.match(validate(state).join('\n'), /glyphSymbolLabel overlap area 84px²/);
});

test('the H1 box and its glyphs are checked separately against the plot', () => {
  const state = compareState(); state.geometry.plot = rect(0, 0, 320, 870);
  assert.equal(pageHeadingOverlapAreas(state).headingPlot, 68);
  assert.equal(pageHeadingOverlapAreas(state).glyphPlot, 68);
  assert.match(validate(state).join('\n'), /headingPlot overlap area 68px²/);
  assert.match(validate(state).join('\n'), /glyphPlot overlap area 68px²/);
  const escaped = compareState(); escaped.glyphs = [rect(48, 851, 68, 14)];
  assert.equal(pageHeadingOverlapAreas(escaped).headingPlot, 0);
  assert.equal(pageHeadingOverlapAreas(escaped).glyphPlot, 68);
  assert.match(validate(escaped).join('\n'), /glyphPlot overlap area 68px²/);
});

test('missing raw geometry and invalid numeric rectangles cannot masquerade as zero overlap', () => {
  for (const mutate of [
    state => { state.geometry.plot = null; }, state => { state.heading.right = NaN; },
    state => { state.glyphs = []; }, state => { state.glyphs[0].bottom = NaN; },
  ]) { const state = compareState(); mutate(state); assert.ok(validate(state).length > 0, mutate.toString()); }
});

test('sole H1, duplicate-title, description, overflow and symbol checks stay strict for the hidden label', () => {
  for (const mutate of [
    state => { state.h1Count = 2; }, state => { state.title = '다른 제목'; },
    state => { state.duplicateTitles = ['H2']; }, state => { state.descriptionCount = 2; },
    state => { state.describedBy = null; }, state => { state.description = ''; },
    state => { state.overflow = 1; }, state => { state.symbolGlyphsInToolbar = false; },
  ]) { const state = labelState(); mutate(state); assert.ok(validatePageHeadingState(state, null, '가격 차트').length > 0, mutate.toString()); }
});

test('sole painted H1, viewport, clipping, hidden-ancestor and overlay checks remain strict for painted headings', () => {
  for (const mutate of [
    state => { state.h1Count = 2; }, state => { state.paintedH1Count = 0; }, state => { state.painted = false; },
    state => { state.duplicateTitles = ['H2']; }, state => { state.descriptionCount = 2; },
    state => { state.describedBy = null; }, state => { state.description = ''; },
    state => { state.headingInViewport = false; }, state => { state.glyphsInViewport = false; },
    state => { state.paintIssues = ['horizontal clipping: ancestor']; }, state => { state.hiddenBy = ['atlas-page-intro']; },
    state => { state.color = 'transparent'; },
    state => { state.overflow = 1; }, state => { state.overlayCollisions = ['.atlas-quote-hud']; }, state => { state.symbolCollision = true; },
    state => { state.symbolGlyphsInToolbar = false; },
  ]) { const state = compareState(); mutate(state); assert.ok(validate(state).length > 0, mutate.toString()); }
});

test('compare retains the toolbar-owned fixed anchor and its unchanged 0.01px coordinate budget', () => {
  const state = compareState(); assert.deepEqual(validate(state), []);
  assert.ok(pageHeadingIntersectionArea(state.heading, state.geometry.toolbar) > 0, 'compare paints its title inside the toolbar');
  state.placement.delta = {left:.01, top:-.01}; assert.deepEqual(validate(state), []);
  for (const mutate of [
    value => { value.placement.delta.left = .010001; }, value => { value.placement.delta.top = -.010001; },
    value => { value.headingInToolbar = false; }, value => { value.glyphsInToolbar = false; },
    value => { value.placement.kind = 'label'; },
  ]) { const value = compareState(); mutate(value); assert.ok(validate(value).length > 0); }
});

test('geometry preservation is applied only with an explicit prior state and remains 0.01px', () => {
  const state = labelState(), previous = clone(state);
  previous.geometry.plot = rect(0, 70, 1440, 830);
  assert.deepEqual(validate(state), []);
  assert.match(validate(state, previous).join('\n'), /plot\.top 70 -> 48/);
  assert.match(validate(state, previous).join('\n'), /plot\.height 830 -> 852/);
  const comparison = compareState(), changed = clone(comparison); changed.geometry.toolbar.width += .011;
  assert.match(validate(changed, comparison).join('\n'), /toolbar\.width/);
  assert.deepEqual(validate(comparison, clone(comparison)), [], 'compare restoration still uses its actual prior geometry');
});
