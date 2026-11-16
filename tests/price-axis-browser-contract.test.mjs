import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedPriceAxisUsd, priceAxisIntersectionArea, priceAxisOverlapEvidence, priceAxisOverlayCoverage, priceAxisSourceExpectations, validatePriceAxisState as validateState,
} from '../scripts/price-axis-browser-contract.mjs';

const validatePriceAxisState = (state,source,viewport={width:320,height:900}) => validateState(state,source,viewport);
const box = (left, top, width, height) => ({left, top, right:left + width, bottom:top + height, width, height});
const sources = priceAxisSourceExpectations({
  btcDaily:{prices:[['2026-11-05', 1], ['2026-11-06', 75826.5258667446]]},
  ethArchive:{source:'Coinbase Exchange', product:'ETH-USD', dailyHistory:{completedOnly:true, candles:[{date:'2026-11-06T00:00:00.000Z', close:2235.37}]}},
  btcVolume:{source:'Bitstamp', bars:[{date:'2026-11-06', close:75746.53}, {date:'2026-11-07', close:99999}]},
});
const day = 86_400_000, lastTime = Date.UTC(2026,10,6);
// Gutter 256..320 x 118..568 in CSS pixels; three label rows and the last-price badge.
function fixture(symbol = 'BTCUSD') {
  const expected = sources[symbol], row = (top, bottom, left, right) => {
    const rect = box(256 + left, 118 + top, right - left + 1, bottom - top + 1);
    return {top, bottom, left, right, pixels:(right - left + 1) * (bottom - top + 1), rect, hit:{x:(rect.left + rect.right) / 2, y:(rect.top + rect.bottom) / 2, target:'canvas', insideHost:true}};
  };
  const surface = {readable:true, width:64, height:450, modal:'20,20,21,255', ruleColumns:[0], bands:[row(40,52,8,52), row(150,162,8,52), row(290,308,2,61), row(380,392,8,52)]};
  const overlay = {readable:true, width:64, height:450, modal:'0,0,0,0', ruleColumns:[], bands:[]};
  return {
    symbol, width:320, height:900, boot:'ready', page:'outlook', chartType:'line', overflow:0,
    canvas:{engine:'funnest', state:'ready', painted:true, legacyPriceNodes:0, chartType:'line', sourceMode:symbol === 'BTCUSD' ? 'close-only' : 'ohlc', currency:'USD', timeUnit:'UTC milliseconds', barCount:3,
      lastBar:{time:lastTime, open:expected.rawValue, high:expected.rawValue, low:expected.rawValue, close:expected.rawValue}, lastIntervalMs:day,
      layout:{width:320, height:500, plotWidth:256, panesHeight:472, timeAxisHeight:28, main:{top:0, height:450}},
      hostRect:box(0,118,320,500), scale:{x:1,y:1}, plotRect:box(0,118,256,450), axisRect:box(256,118,64,450), paintRect:box(0,118,320,500),
      ink:{surfaces:[surface, overlay]}},
    readout:{date:expected.date, kind:'observed', priceText:expected.text, raw:{price:expected.rawValue, date:expected.date, kind:'observed'}},
    obstacles:[], geometryIssues:[], overlays:{paintObjectCounts:{legend:3,hud:2,annotation:2},unobservedCategories:[]},
  };
}

test('independent source rows preserve BTC precision and select the candle source at the same cutoff', () => {
  assert.equal(sources.BTCUSD.rawValue, 75826.5258667446);
  assert.equal(sources.BTCUSD.text, '$75,826.53');
  assert.equal(sources.BTCUSD.candle.rawValue, 75746.53);
  assert.equal(sources.ETHUSD.text, '$2,235.37');
  assert.equal(expectedPriceAxisUsd(0.01234567), '$0.012346');
  assert.throws(() => priceAxisSourceExpectations({btcDaily:{prices:[]}}), /Coin Metrics/);
  assert.throws(() => priceAxisSourceExpectations({btcDaily:{prices:[['2026-11-06',1]]}, ethArchive:{source:'Other'}}), /completed Coinbase/);
});

test('a painted Funnest gutter with clear label rows satisfies the price-axis contract', () => {
  for (const symbol of ['BTCUSD','ETHUSD']) assert.deepEqual(validatePriceAxisState(fixture(symbol), sources[symbol]), []);
});

test('the engine must be a painted Funnest canvas with no legacy price renderer behind it', () => {
  for (const [patch, message] of [
    [canvas => {canvas.engine = 'svg';}, /not a painted Funnest canvas/], [canvas => {canvas.painted = false;}, /not a painted Funnest canvas/],
    [canvas => {canvas.state = 'loading';}, /not a painted Funnest canvas/], [canvas => {canvas.legacyPriceNodes = 2;}, /legacy price renderer/],
    [canvas => {canvas.chartType = 'candles';}, /chart type differs/], [canvas => {canvas.currency = 'KRW';}, /USD observations/],
    [canvas => {canvas.timeUnit = 'seconds';}, /UTC milliseconds/], [canvas => {canvas.lastIntervalMs = 3_600_000;}, /daily bars/],
  ]) {
    const state = fixture(); patch(state.canvas);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => message.test(value)),String(message));
  }
  assert.ok(validatePriceAxisState({...fixture(),canvas:null},sources.BTCUSD).includes('missing native Funnest canvas evidence'));
});

test('the last engine bar must match the independent source date and exact value', () => {
  for (const patch of [{close:75826.5258667446 + 2e-11}, {close:75826.53}, {time:lastTime - day}, {time:lastTime + day}]) {
    const state = fixture(); Object.assign(state.canvas.lastBar,patch);
    assert.notEqual(patch.close ?? 0,sources.BTCUSD.rawValue,'the mutation must change the double');
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /last engine bar does not match Coin Metrics/.test(value)),JSON.stringify(patch));
  }
  const state = fixture(); state.canvas.lastBar = null;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /last engine bar/.test(value)));
});

test('candles require OHLC bars and the venue close, and reject the Coin Metrics last bar', () => {
  const state = fixture(); state.chartType = 'candles'; state.canvas.chartType = 'candles'; state.canvas.sourceMode = 'ohlc';
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /last engine bar does not match Bitstamp 2026-11-06 75746.53/.test(value)));
  Object.assign(state.canvas.lastBar,{open:75982.57,high:76294.91,low:74761.63,close:75746.53});
  state.readout = {date:'2026-11-06', kind:'observed', priceText:sources.BTCUSD.candle.text, raw:{price:75746.53, close:75746.53, source:'Bitstamp', date:'2026-11-06', kind:'observed'}};
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  state.canvas.sourceMode = 'close-only';
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /candles must come from observed OHLC/.test(value)));
  state.canvas.sourceMode = 'ohlc'; state.readout.raw.source = 'Coin Metrics';
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /raw candle readout differs/.test(value)));
});

test('correct rounded text does not hide a raw readout precision or source mismatch', () => {
  const state = fixture(); state.readout.raw.price = 75826.53;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /raw readout differs/.test(value)));
  for (const [key, value] of [['date','2026-11-05'],['kind','unavailable'],['priceText','$75,826.54']]) {
    const broken = fixture(); broken.readout[key] = value;
    assert.ok(validatePriceAxisState(broken,sources.BTCUSD).length > 0,key);
  }
});

test('actual CSS viewport and horizontal overflow must match the requested matrix case', () => {
  assert.ok(validatePriceAxisState(fixture(),sources.BTCUSD,{width:390,height:900}).some(value => /actual viewport 320x900 differs from requested 390x900/.test(value)));
  assert.ok(validatePriceAxisState(fixture(),sources.BTCUSD,{width:320,height:844}).some(value => /differs from requested 320x844/.test(value)));
  assert.ok(validatePriceAxisState(fixture(),sources.BTCUSD,null).includes('missing requested viewport'));
  const state = fixture(); state.overflow = 1;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /horizontal overflow 1/.test(value)));
});

test('the gutter must exist, tile the host with the plot, stay in the viewport and escape no clip', () => {
  for (const [patch, message] of [
    [state => {state.canvas.layout.plotWidth = 320;}, /reserved no price-axis gutter/],
    [state => {state.canvas.plotRect = box(0,118,250,450);}, /do not tile the chart host/],
    [state => {state.canvas.axisRect = box(256,118,70,450); state.canvas.hostRect = box(0,118,326,500); state.canvas.paintRect = box(0,118,326,500);}, /outside the viewport/],
    [state => {state.canvas.paintRect = box(0,118,300,500);}, /clipped by an ancestor/],
    [state => {state.canvas.paintRect = null;}, /missing host, plot or price-axis geometry/],
    [state => {state.canvas.axisRect = null;}, /missing host, plot or price-axis geometry/],
  ]) {
    const state = fixture(); patch(state);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => message.test(value)),String(message));
  }
});

test('label ink must be readable, continuous behind one rule, and show at least two rows', () => {
  let state = fixture(); state.canvas.ink.surfaces[0].readable = false;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /unreadable/.test(value)));
  state = fixture(); state.canvas.ink.surfaces = [];
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /no native canvas surface/.test(value)));
  state = fixture(); state.canvas.ink.surfaces[0].bands = [state.canvas.ink.surfaces[0].bands[0]];
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /fewer than two painted label rows/.test(value)));
  state = fixture(); state.canvas.ink.surfaces[0].bands = [];
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /fewer than two painted label rows/.test(value)));
  for (const ruleColumns of [[], [1], [0,1]]) {
    state = fixture(); state.canvas.ink.surfaces[0].ruleColumns = ruleColumns;
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /axis rule is not one continuous column/.test(value)),JSON.stringify(ruleColumns));
  }
});

test('a label pushed into the plot or out of the canvas fails, however slightly', () => {
  for (const [patch, message] of [
    [band => {band.left = 0;}, /touches the plot boundary/], [band => {band.right = 63;}, /touches the canvas edge/],
    [band => {band.rect = box(255.5,band.rect.top,20,band.rect.height);}, /escapes the price-axis gutter/],
    [band => {band.rect = box(band.rect.left,band.rect.top,70,band.rect.height);}, /escapes the price-axis gutter/],
  ]) {
    const state = fixture(); patch(state.canvas.ink.surfaces[0].bands[1]);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => message.test(value)),String(message));
  }
  const state = fixture(); state.canvas.ink.surfaces[0].bands[2].left = 1;
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[],'one clear column from the rule is the zero-tolerance boundary');
});

test('every label center hit must reach the chart and use the raw rectangle center', () => {
  for (const patch of [{insideHost:false,target:'div.chart-legend-dock'}, {x:258}, {y:170}]) {
    const state = fixture(); Object.assign(state.canvas.ink.surfaces[0].bands[0].hit,patch);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /center hit/.test(value)),JSON.stringify(patch));
  }
  const state = fixture(); state.canvas.ink.surfaces[0].bands[0].hit = null;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /center hit is not the chart \(none\)/.test(value)));
});

test('touching paint bounds pass, but every positive occlusion of a label row fails without rounding', () => {
  const state = fixture(), label = state.canvas.ink.surfaces[0].bands[0].rect;
  state.obstacles = [{key:'legend',category:'legend',surface:'html',paintRect:box(label.left - 1,label.top,1,label.height)}];
  assert.equal(priceAxisIntersectionArea(label,state.obstacles[0].paintRect),0);
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  for (const amount of [1,0.001,Number.EPSILON * 512]) {
    state.obstacles[0].paintRect = box(label.left - 1,label.top,1 + amount,label.height);
    const evidence = priceAxisOverlapEvidence(state);
    assert.ok(evidence.occludedArea > 0);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /label-40-52: legend legend occludes/.test(value)));
  }
});

test('legend, hud and annotation paint are all strict zero-area checks on the last-price badge too', () => {
  const badge = fixture().canvas.ink.surfaces[0].bands[2].rect;
  for (const [category, surface] of [['legend','html'],['hud','html'],['annotation','svg']]) {
    const state = fixture(); state.obstacles = [{key:category,category,surface,paintRect:box(badge.left + 2,badge.top + 3,1,1)}];
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => value.includes(`label-290-308: ${category} ${category} occludes 1`)),category);
  }
});

test('an overlay over the empty part of the gutter is recorded as evidence and does not fail', () => {
  const state = fixture(); state.obstacles = [{key:'hud-summary',category:'hud',surface:'html',paintRect:box(250,200,10,24)}];
  const evidence = priceAxisOverlapEvidence(state);
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  assert.equal(evidence.occlusions.length,0);
  assert.deepEqual(evidence.gutterIntrusions,[{obstacle:'hud-summary',category:'hud',surface:'html',area:96}]);
  assert.equal(evidence.intrudedArea,96);
});

test('missing obstacle geometry and unsupported clip shapes cannot count as a pass', () => {
  const state = fixture(); state.obstacles = [{key:'ghost',category:'legend',surface:'html',paintRect:null}];
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /ghost: missing obstacle paint geometry/.test(value)));
  const clipped = fixture(); clipped.geometryIssues = ['unsupported clip geometry on path: url(#clip)'];
  assert.ok(validatePriceAxisState(clipped,sources.BTCUSD).some(value => /^geometry: unsupported clip geometry/.test(value)));
  assert.deepEqual(validatePriceAxisState(null,sources.BTCUSD),['missing state or independent source expectation']);
});

test('overlay coverage distinguishes absent cases and requires actual paint somewhere in the matrix', () => {
  for (const category of ['legend','hud','annotation']) {
    const state = fixture(); state.overlays.paintObjectCounts[category] = 0;
    assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
    assert.equal(priceAxisOverlayCoverage([{id:'absent',state}]).status,'unverified');
    const coverage = priceAxisOverlayCoverage([{id:'absent',state},{id:'observed',state:fixture()}]);
    assert.equal(coverage.status,'passed');
    assert.deepEqual(coverage.categories[category].observedCases,['observed']);
    assert.equal(coverage.categories[category].unobservedCases[0].id,'absent');
  }
  assert.deepEqual(priceAxisOverlayCoverage([]).missing,['legend','hud','annotation']);
});
