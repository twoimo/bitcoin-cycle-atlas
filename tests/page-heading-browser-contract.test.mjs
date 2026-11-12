import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHeadingIntersectionArea, pageHeadingOverlapAreas, validatePageHeadingState} from '../scripts/page-heading-browser-contract.mjs';

const rect = (left, top, width, height) => ({left, top, right:left + width, bottom:top + height, width, height});
const clone = value => structuredClone(value);
const validate = (state, previous = null) => validatePageHeadingState(state, previous, state.title);

function labelState() {
  const heading = rect(8, 52, 68, 14), glyphs = [rect(8, 52, 68, 14)];
  return {
    title:'가격 차트', h1Count:1, paintedH1Count:1, heading, glyphs, painted:true,
    headingInViewport:true, glyphsInViewport:true, headingInToolbar:false, glyphsInToolbar:false,
    color:'rgb(219, 219, 219)', fontSize:'12px', lineHeight:'14px', paintIssues:[],
    describedBy:'atlas-page-description', description:'가격 관측과 역사적 주기 자료를 함께 살펴보는 차트입니다.', descriptionCount:1,
    followsToolbar:true, outsidePlot:true, inDashboardHeader:false,
    placement:{kind:'label', anchor:null, expected:null, delta:null},
    labelRow:{rect:rect(0, 48, 1440, 22), glyphs, painted:true, inViewport:true, position:'static', order:'-1', padding:'4px 8px'},
    overflow:0, duplicateTitles:[], overlayCollisions:[], symbolCollision:false,
    symbolButton:rect(48, 2, 200, 44), symbolLabel:rect(80, 14, 120, 18), symbolGlyphs:[rect(80, 16, 44, 14)],
    symbolGlyphsInToolbar:true,
    geometry:{toolbar:rect(0, 0, 1440, 48), plot:rect(0, 70, 1440, 830), bottom:null, readout:null, source:null},
  };
}

function compareState() {
  return {...labelState(), title:'사이클 비교', heading:rect(48, 869, 68, 14), glyphs:[rect(48, 869, 68, 14)],
    headingInToolbar:true, glyphsInToolbar:true, labelRow:null,
    placement:{kind:'compare', anchor:rect(124, 852, 196, 48), expected:{left:48, top:869}, delta:{left:0, top:0}},
    symbolButton:null, symbolLabel:null, symbolGlyphs:[],
    geometry:{toolbar:rect(0, 852, 320, 48), plot:rect(0, 0, 320, 852), bottom:null, readout:null, source:null}};
}

test('the normal-flow label is visible outside the toolbar and plot with zero overlap area', () => {
  const state = labelState();
  assert.equal(state.headingInToolbar, false);
  assert.deepEqual(pageHeadingOverlapAreas(state), {
    headingSymbolButton:0, headingSymbolLabel:0, glyphSymbolButton:0, glyphSymbolLabel:0,
    headingSymbolGlyphs:0, labelPlot:0, headingPlot:0, glyphPlot:0, labelToolbar:0, headingToolbar:0, glyphToolbar:0,
  });
  assert.deepEqual(validate(state), []);
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

test('touching an edge has zero area and remains valid, including label-to-plot contact', () => {
  assert.equal(pageHeadingIntersectionArea(rect(0, 0, 44, 44), rect(44, 0, 44, 44)), 0);
  assert.equal(pageHeadingIntersectionArea(rect(0, 0, 44, 44), rect(0, 44, 44, 44)), 0);
  const state = labelState();
  assert.equal(state.labelRow.rect.bottom, state.geometry.plot.top);
  assert.deepEqual(validate(state), []);
});

test('one pixel of button overlap fails using raw rectangles despite false summary flags', () => {
  const state = labelState();
  state.symbolButton = rect(state.heading.right - 1, state.heading.top, 44, 44);
  state.symbolCollision = false; state.overlapAreas = {headingSymbolButton:0};
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolButton, 14);
  assert.ok(validate(state).includes('headingSymbolButton overlap area 14px²'));
});

test('positive subpixel overlap is not rounded away by the existing 0.01px coordinate tolerance', () => {
  const state = labelState(); state.symbolButton = rect(state.heading.right - .001, state.heading.top, 44, 44);
  assert.ok(pageHeadingOverlapAreas(state).headingSymbolButton > 0);
  assert.match(validate(state).join('\n'), /headingSymbolButton overlap area/);
});

test('the symbol label rectangle is checked independently of its button and ticker text', () => {
  const state = labelState(); state.symbolLabel = rect(state.heading.right - 1, state.heading.top, 44, 14);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolButton, 0);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolGlyphs, 0);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolLabel, 14);
  assert.match(validate(state).join('\n'), /headingSymbolLabel overlap area 14px²/);
});

test('actual ticker Range rectangles cannot overlap H1 Range rectangles', () => {
  const state = labelState(); state.symbolGlyphs = [rect(state.glyphs[0].right - 1, state.glyphs[0].top, 20, 14)];
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolButton, 0);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolLabel, 0);
  assert.equal(pageHeadingOverlapAreas(state).headingSymbolGlyphs, 14);
  assert.match(validate(state).join('\n'), /headingSymbolGlyphs overlap area 14px²/);
});

test('H1 glyph overhang cannot enter a symbol button or label even when the H1 box is clear', () => {
  const state = labelState(); state.glyphs = [rect(78, 52, 68, 14)];
  state.symbolButton = rect(140, 52, 44, 44); state.symbolLabel = rect(140, 52, 44, 14);
  const areas = pageHeadingOverlapAreas(state);
  assert.equal(areas.headingSymbolButton, 0); assert.equal(areas.headingSymbolLabel, 0);
  assert.equal(areas.glyphSymbolButton, 84); assert.equal(areas.glyphSymbolLabel, 84);
  assert.match(validate(state).join('\n'), /glyphSymbolButton overlap area 84px²/);
  assert.match(validate(state).join('\n'), /glyphSymbolLabel overlap area 84px²/);
});

test('only the normal-flow label, H1 and glyphs must clear the entire toolbar', () => {
  const state = labelState(); state.geometry.toolbar = rect(0, 0, 1440, 49);
  let areas = pageHeadingOverlapAreas(state);
  assert.equal(areas.labelToolbar, 1440); assert.equal(areas.headingToolbar, 0); assert.equal(areas.glyphToolbar, 0);
  assert.match(validate(state).join('\n'), /labelToolbar overlap area 1440px²/);
  state.geometry.toolbar = rect(0, 0, 1440, 53); areas = pageHeadingOverlapAreas(state);
  assert.equal(areas.headingToolbar, 68); assert.equal(areas.glyphToolbar, 68);
  assert.match(validate(state).join('\n'), /headingToolbar overlap area 68px²/);
  assert.match(validate(state).join('\n'), /glyphToolbar overlap area 68px²/);
  const comparison = compareState();
  assert.ok(pageHeadingIntersectionArea(comparison.heading, comparison.geometry.toolbar) > 0);
  assert.equal(Object.hasOwn(pageHeadingOverlapAreas(comparison), 'headingToolbar'), false);
  assert.deepEqual(validate(comparison), []);
});

test('one pixel of label-row intrusion into the plot fails before the H1 itself touches the plot', () => {
  const state = labelState(); state.geometry.plot = rect(0, 69, 1440, 831);
  const areas = pageHeadingOverlapAreas(state);
  assert.equal(areas.labelPlot, 1440); assert.equal(areas.headingPlot, 0); assert.equal(areas.glyphPlot, 0);
  assert.match(validate(state).join('\n'), /labelPlot overlap area 1440px²/);
});

test('the H1 box and its glyphs are checked separately against the plot', () => {
  const state = labelState(); state.geometry.plot = rect(0, 65, 1440, 835);
  assert.equal(pageHeadingOverlapAreas(state).headingPlot, 68);
  assert.equal(pageHeadingOverlapAreas(state).glyphPlot, 68);
  assert.match(validate(state).join('\n'), /headingPlot overlap area 68px²/);
  assert.match(validate(state).join('\n'), /glyphPlot overlap area 68px²/);
  const escaped = labelState(); escaped.glyphs = [rect(8, 57, 68, 14)];
  assert.equal(pageHeadingOverlapAreas(escaped).headingPlot, 0);
  assert.equal(pageHeadingOverlapAreas(escaped).glyphPlot, 68);
  assert.match(validate(escaped).join('\n'), /glyphPlot overlap area 68px²/);
});

test('missing raw geometry and invalid numeric rectangles cannot masquerade as zero overlap', () => {
  for (const mutate of [
    state => { state.symbolButton = null; }, state => { state.symbolLabel = null; },
    state => { state.symbolGlyphs = []; }, state => { state.geometry.plot = null; }, state => { state.geometry.toolbar = null; },
    state => { state.heading.right = NaN; }, state => { state.labelRow = null; },
  ]) { const state = labelState(); mutate(state); assert.ok(validate(state).length > 0); }
});

test('the label must remain visible, in normal flow, outside the plot and in its shell-owned sibling', () => {
  for (const mutate of [
    state => { state.labelRow.painted = false; }, state => { state.labelRow.inViewport = false; },
    state => { state.labelRow.position = 'fixed'; }, state => { state.labelRow.order = '0'; },
    state => { state.labelRow.rect = rect(0, 48, 1440, 21); }, state => { state.fontSize = '11px'; },
    state => { state.lineHeight = '13px'; }, state => { state.followsToolbar = false; },
    state => { state.outsidePlot = false; }, state => { state.glyphs = [rect(7, 52, 68, 14)]; state.labelRow.rect = rect(8, 48, 1432, 22); },
  ]) { const state = labelState(); mutate(state); assert.ok(validate(state).length > 0); }
});

test('sole painted H1, duplicate-title, description, viewport, clipping and overlay checks remain strict', () => {
  for (const mutate of [
    state => { state.h1Count = 2; }, state => { state.paintedH1Count = 0; }, state => { state.painted = false; },
    state => { state.duplicateTitles = ['H2']; }, state => { state.descriptionCount = 2; },
    state => { state.describedBy = null; }, state => { state.description = ''; },
    state => { state.headingInViewport = false; }, state => { state.glyphsInViewport = false; },
    state => { state.paintIssues = ['horizontal clipping: ancestor']; }, state => { state.color = 'transparent'; },
    state => { state.overflow = 1; }, state => { state.overlayCollisions = ['.atlas-quote-hud']; },
    state => { state.symbolGlyphsInToolbar = false; },
  ]) { const state = labelState(); mutate(state); assert.ok(validate(state).length > 0); }
});

test('compare retains the toolbar-owned fixed anchor and its unchanged 0.01px coordinate budget', () => {
  const state = compareState(); assert.deepEqual(validate(state), []);
  state.placement.delta = {left:.01, top:-.01}; assert.deepEqual(validate(state), []);
  for (const mutate of [
    value => { value.placement.delta.left = .010001; }, value => { value.placement.delta.top = -.010001; },
    value => { value.headingInToolbar = false; }, value => { value.glyphsInToolbar = false; },
    value => { value.placement.kind = 'label'; },
  ]) { const value = compareState(); mutate(value); assert.ok(validate(value).length > 0); }
});

test('geometry preservation is applied only with an explicit prior state and remains 0.01px', () => {
  const state = labelState(), previous = clone(state);
  previous.geometry.plot = rect(0, 48, 1440, 852);
  assert.deepEqual(validate(state), []);
  assert.match(validate(state, previous).join('\n'), /plot\.top 48 -> 70/);
  assert.match(validate(state, previous).join('\n'), /plot\.height 852 -> 830/);
  const comparison = compareState(), changed = clone(comparison); changed.geometry.toolbar.width += .011;
  assert.match(validate(changed, comparison).join('\n'), /toolbar\.width/);
  assert.deepEqual(validate(comparison, clone(comparison)), [], 'compare restoration still uses its actual prior geometry');
});

test('conference retains its existing dashboard heading contract without adopting the chart label contract', () => {
  const state = {...labelState(), title:'컨퍼런스 복습', inDashboardHeader:true, followsToolbar:false,
    labelRow:null, placement:{kind:null, anchor:null, expected:null, delta:null},
    symbolButton:null, symbolLabel:null, symbolGlyphs:[], geometry:{toolbar:null, plot:null, bottom:null, readout:null, source:null}};
  assert.deepEqual(validate(state), []);
  state.inDashboardHeader = false; assert.match(validate(state).join('\n'), /heading lost shell ownership/);
});
