import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePriceAxisStates, expectedPriceAxisUsd, priceAxisAlignment, priceAxisIntersectionArea, priceAxisLabelText, priceAxisOverlapEvidence,
  priceAxisOverlayCoverage, priceAxisSourceExpectations, validatePriceAxisState as validateState,
} from '../scripts/price-axis-browser-contract.mjs';

const validatePriceAxisState = (state,source,viewport={width:320,height:900}) => validateState(state,source,viewport);
const box = (left, top, width, height) => ({left, top, right:left + width, bottom:top + height, width, height});
const sources = priceAxisSourceExpectations({
  btcDaily:{prices:[['2026-11-05', 1], ['2026-11-06', 75826.5258667446]]},
  ethArchive:{source:'Coinbase Exchange', product:'ETH-USD', dailyHistory:{completedOnly:true, candles:[{date:'2026-11-06T00:00:00.000Z', close:2235.37}]}},
  btcVolume:{source:'Bitstamp', bars:[{date:'2026-11-06', close:75746.53}, {date:'2026-11-07', close:99999}]},
});
const day = 86_400_000, lastTime = Date.UTC(2026,10,6);
// Host 0..320 x 118..618 with a 64 px gutter: labels are left-aligned at plotWidth + 8, the tag fills the gutter minus 2 px each side.
function fixture(symbol = 'BTCUSD', gutter = 64) {
  const expected = sources[symbol], plotWidth = 320 - gutter, hostTop = 118;
  const label = (key, text, y) => {
    const rect = box(plotWidth + 8, hostTop + y - 7, 52, 14), center = {x:(rect.left + rect.right) / 2, y:(rect.top + rect.bottom) / 2};
    return {key, text, x:plotWidth + 8, y, align:'left', baseline:'middle', fill:'#7e7e87', alpha:1, box:rect, anchor:{x:plotWidth + 8, y:hostTop + y}, ink:210, hit:{x:center.x, y:center.y, target:'canvas', insideHost:true}};
  };
  const tag = label('latest', priceAxisLabelText(expected), 200), badge = box(plotWidth + 2, hostTop + 190, gutter - 4, 20);
  return {
    symbol, width:320, height:900, boot:'ready', page:'outlook', chartType:'line', overflow:0,
    canvas:{engine:'funnest', state:'ready', painted:true, legacyPriceNodes:0, chartType:'line', sourceMode:symbol === 'BTCUSD' ? 'close-only' : 'ohlc', currency:'USD', timeUnit:'UTC milliseconds', barCount:3, tapInstalled:true,
      lastBar:{time:lastTime, open:expected.rawValue, high:expected.rawValue, low:expected.rawValue, close:expected.rawValue}, lastIntervalMs:day,
      layout:{width:320, height:500, plotWidth, panesHeight:472, timeAxisHeight:28, main:{top:0, height:450}},
      hostRect:box(0,hostTop,320,500), scale:{x:1,y:1}, plotRect:box(0,hostTop,plotWidth,450), axisRect:box(plotWidth,hostTop,gutter,450), paintRect:box(0,hostTop,320,500),
      labels:{frame:{textCount:20, rectCount:1, sequence:4}, badgeCount:1, countdown:null,
        ticks:[label('tick-0','100,000.00',60), label('tick-1','50,000.00',130), label('tick-2','25,000.00',300), label('tick-3','10,000.00',390)],
        latest:{...tag, badge:{rect:badge, fill:'#d53544', alpha:1, hit:{x:(badge.left + badge.right) / 2, y:(badge.top + badge.bottom) / 2, target:'canvas', insideHost:true}}}},
      ink:{readable:true, modal:'20,20,21,255', ruleColumns:[0], rule:{rect:box(plotWidth,hostTop,1,450)}, bottomLine:{row:450, color:'48,48,52,255', rect:box(0,hostTop + 450,320,1)}, strayInkPixels:0}},
    readout:{date:expected.date, kind:'observed', priceText:expected.text, raw:{price:expected.rawValue, date:expected.date, kind:'observed'}},
    obstacles:[], geometryIssues:[], overlays:{paintObjectCounts:{legend:3,event:2,forecast:2,hud:1},unobservedCategories:[]},
  };
}
const fails = (state, pattern, source = sources.BTCUSD) => assert.ok(validatePriceAxisState(state,source).some(value => pattern.test(value)), String(pattern));

test('independent source rows preserve BTC precision and select the candle source at the same cutoff', () => {
  assert.equal(sources.BTCUSD.rawValue, 75826.5258667446);
  assert.equal(sources.BTCUSD.text, '$75,826.53');
  assert.equal(priceAxisLabelText(sources.BTCUSD), '75,826.53');
  assert.equal(sources.BTCUSD.candle.rawValue, 75746.53);
  assert.equal(sources.ETHUSD.text, '$2,235.37');
  assert.equal(expectedPriceAxisUsd(0.01234567), '$0.012346');
  assert.throws(() => priceAxisSourceExpectations({btcDaily:{prices:[]}}), /Coin Metrics/);
  assert.throws(() => priceAxisSourceExpectations({btcDaily:{prices:[['2026-11-06',1]]}, ethArchive:{source:'Other'}}), /completed Coinbase/);
});

test('a painted Funnest gutter with measured label boxes satisfies the price-axis contract', () => {
  for (const symbol of ['BTCUSD','ETHUSD']) assert.deepEqual(validatePriceAxisState(fixture(symbol), sources[symbol]), []);
});

test('the engine must be a painted Funnest canvas with no legacy price renderer behind it', () => {
  for (const [patch, message] of [
    [canvas => {canvas.engine = 'svg';}, /not a painted Funnest canvas/], [canvas => {canvas.painted = false;}, /not a painted Funnest canvas/],
    [canvas => {canvas.state = 'loading';}, /not a painted Funnest canvas/], [canvas => {canvas.legacyPriceNodes = 2;}, /legacy price renderer/],
    [canvas => {canvas.chartType = 'candles';}, /chart type differs/], [canvas => {canvas.currency = 'KRW';}, /USD observations/],
    [canvas => {canvas.timeUnit = 'seconds';}, /UTC milliseconds/], [canvas => {canvas.lastIntervalMs = 3_600_000;}, /daily bars/],
    [canvas => {canvas.tapInstalled = false;}, /draw recorder is not installed/],
  ]) {
    const state = fixture(); patch(state.canvas); fails(state, message);
  }
  assert.ok(validatePriceAxisState({...fixture(),canvas:null},sources.BTCUSD).includes('missing native Funnest canvas evidence'));
  const unrecorded = fixture(); unrecorded.canvas.labels = null;
  fails(unrecorded, /no price-axis draw calls were recorded/);
});

test('the last engine bar must match the independent source date and exact value', () => {
  for (const patch of [{close:75826.5258667446 + 2e-11}, {close:75826.53}, {time:lastTime - day}, {time:lastTime + day}]) {
    const state = fixture(); Object.assign(state.canvas.lastBar,patch);
    assert.notEqual(patch.close ?? 0,sources.BTCUSD.rawValue,'the mutation must change the double');
    fails(state, /last engine bar does not match Coin Metrics/);
  }
  const state = fixture(); state.canvas.lastBar = null; fails(state, /last engine bar/);
});

test('the last-price tag digits must equal the independent value, with or without a currency symbol', () => {
  for (const [text, ok] of [['75,826.53',true], ['$75,826.53',true], ['75,826.54',false], ['75826.53',false], ['$75,826.5',false], ['',false]]) {
    const state = fixture(); state.canvas.labels.latest.text = text;
    const result = validatePriceAxisState(state,sources.BTCUSD).filter(value => /latest label/.test(value));
    assert.equal(result.length === 0, ok, text);
  }
  const eth = fixture('ETHUSD'); eth.canvas.labels.latest.text = '2,235.38';
  assert.ok(validatePriceAxisState(eth,sources.ETHUSD).some(value => /latest label "2,235.38" does not match Coinbase Exchange 2026-11-06 2,235.37/.test(value)));
});

test('candles require OHLC bars, the venue close and the venue digits, and reject the Coin Metrics last bar', () => {
  const state = fixture(); state.chartType = 'candles'; state.canvas.chartType = 'candles'; state.canvas.sourceMode = 'ohlc';
  fails(state, /last engine bar does not match Bitstamp 2026-11-06 75746.53/);
  Object.assign(state.canvas.lastBar,{open:75982.57,high:76294.91,low:74761.63,close:75746.53});
  state.readout = {date:'2026-11-06', kind:'observed', priceText:sources.BTCUSD.candle.text, raw:{price:75746.53, close:75746.53, source:'Bitstamp', date:'2026-11-06', kind:'observed'}};
  fails(state, /latest label "75,826.53" does not match Bitstamp 2026-11-06 75,746.53/);
  state.canvas.labels.latest.text = '75,746.53';
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  state.canvas.sourceMode = 'close-only'; fails(state, /candles must come from observed OHLC/);
  state.canvas.sourceMode = 'ohlc'; state.readout.raw.source = 'Coin Metrics'; fails(state, /raw candle readout differs/);
});

test('correct rounded text does not hide a raw readout precision or source mismatch', () => {
  const state = fixture(); state.readout.raw.price = 75826.53; fails(state, /raw readout differs/);
  for (const [key, value] of [['date','2026-11-05'],['kind','unavailable'],['priceText','$75,826.54']]) {
    const broken = fixture(); broken.readout[key] = value;
    assert.ok(validatePriceAxisState(broken,sources.BTCUSD).length > 0,key);
  }
});

test('actual CSS viewport and horizontal overflow must match the requested matrix case', () => {
  assert.ok(validatePriceAxisState(fixture(),sources.BTCUSD,{width:390,height:900}).some(value => /actual viewport 320x900 differs from requested 390x900/.test(value)));
  assert.ok(validatePriceAxisState(fixture(),sources.BTCUSD,{width:320,height:844}).some(value => /differs from requested 320x844/.test(value)));
  assert.ok(validatePriceAxisState(fixture(),sources.BTCUSD,null).includes('missing requested viewport'));
  const state = fixture(); state.overflow = 1; fails(state, /horizontal overflow 1/);
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
    const state = fixture(); patch(state); fails(state, message);
  }
});

test('every tick must be unique, aligned, inked, inside the chart and reachable at its raw center', () => {
  for (const [patch, message] of [
    [state => {state.canvas.labels.ticks.length = 0;}, /missing price-axis ticks/],
    [state => {state.canvas.labels.ticks[1].text = state.canvas.labels.ticks[0].text;}, /duplicate painted tick text/],
    [state => {state.canvas.labels.ticks[2].anchor.x += 1;}, /tick x anchors are not aligned/],
    [state => {state.canvas.labels.ticks[0].ink = 0;}, /tick-0: price text has no visible/],
    [state => {state.canvas.labels.ticks[0].alpha = 0;}, /tick-0: price text has no visible/],
    [state => {state.canvas.labels.ticks[0].fill = 'rgba(126, 126, 135, 0)';}, /tick-0: price text has no visible/],
    [state => {state.canvas.labels.ticks[0].fill = 'transparent';}, /tick-0: price text has no visible/],
    [state => {state.canvas.labels.ticks[1].box = box(300,248,30,14);}, /tick-1: clipped or outside chart\/viewport/],
    [state => {state.canvas.labels.ticks[1].box = box(250,248,52,14);}, /tick-1: crosses the price gutter boundary/],
    [state => {state.canvas.labels.ticks[1].hit = {...state.canvas.labels.ticks[1].hit, insideHost:false, target:'div.legend'};}, /tick-1: center hit is not the chart \(div.legend\)/],
    [state => {state.canvas.labels.ticks[1].hit = {...state.canvas.labels.ticks[1].hit, x:291};}, /tick-1: center hit did not use raw rectangle center/],
    [state => {state.canvas.labels.ticks[1].hit = null;}, /tick-1: center hit is not the chart \(none\)/],
    [state => {state.canvas.labels.ticks[1].anchor = {x:NaN,y:3};}, /tick-1: missing raw text anchor/],
  ]) {
    const state = fixture(); patch(state); fails(state, message);
  }
  const clipped = fixture(); clipped.canvas.paintRect = box(0,118,310,500); fails(clipped, /tick-0: clipped painted bounds/);
});

test('the last-price tag must exist, match, stay inside its badge and the chart, and be reachable', () => {
  for (const [patch, message] of [
    [state => {state.canvas.labels.latest = null;}, /latest price tag was not painted/],
    [state => {state.canvas.labels.latest.box = box(264,300,70,14);}, /latest: text escapes the price badge/],
    [state => {state.canvas.labels.latest.badge.rect = box(250,308,60,20);}, /latest-tag: crosses the price gutter boundary/],
    [state => {state.canvas.labels.latest.badge.rect = box(258,308,70,20);}, /latest-tag: clipped or outside chart\/viewport/],
    [state => {state.canvas.labels.latest.badge.hit = {x:1,y:1,target:'div.hud',insideHost:false};}, /latest-tag: center hit is not the chart \(div.hud\)/],
    [state => {state.canvas.labels.latest.ink = 0;}, /latest: price text has no visible/],
    [state => {state.canvas.labels.countdown = {...state.canvas.labels.latest, key:'countdown', box:box(264,330,80,14), hit:{x:304,y:337,target:'canvas',insideHost:true}};}, /countdown: text escapes the price badge/],
  ]) {
    const state = fixture(); patch(state); fails(state, message);
  }
});

test('the boundary rule, the bottom frame line and every gutter pixel must be accounted for', () => {
  for (const ruleColumns of [[], [1], [0,1]]) {
    const state = fixture(); state.canvas.ink.ruleColumns = ruleColumns; fails(state, /axis: does not span the complete frame as one continuous rule/);
  }
  let state = fixture(); state.canvas.ink.rule = null; fails(state, /axis: does not span the complete frame/);
  state = fixture(); state.canvas.ink.bottomLine = null; fails(state, /bottom: the frame line does not meet the left frame and price axis/);
  state = fixture(); state.canvas.ink.strayInkPixels = 1; fails(state, /canvas paint covers the price axis outside its labels \(1 pixels\)/);
  state = fixture(); state.canvas.ink.readable = false; fails(state, /native canvas pixels are unreadable/);
});

test('touching paint bounds pass, but every positive occlusion of a tick, the tag or a frame line fails without rounding', () => {
  const state = fixture(), tick = state.canvas.labels.ticks[0].box, tag = state.canvas.labels.latest.badge.rect, rule = state.canvas.ink.rule.rect, bottom = state.canvas.ink.bottomLine.rect;
  for (const [target, rect, name] of [['tick-0',tick,'a tick'], ['latest-tag',tag,'the tag'], ['frame-axis',rule,'the rule'], ['frame-bottom',bottom,'the bottom line']]) {
    const probe = fixture(); probe.obstacles = [{key:'legend',category:'legend',surface:'html',paintRect:box(rect.left - 1,rect.top - 1,1,1)}];
    assert.equal(priceAxisIntersectionArea(rect,probe.obstacles[0].paintRect),0,name);
    assert.deepEqual(validatePriceAxisState(probe,sources.BTCUSD),[],`touching ${name}`);
    for (const amount of [1,0.001,Number.EPSILON * 512]) {
      probe.obstacles[0].paintRect = box(rect.left - 1,rect.top - 1,1 + amount,1 + amount);
      assert.ok(priceAxisOverlapEvidence(probe).occludedArea > 0,name);
      assert.ok(validatePriceAxisState(probe,sources.BTCUSD).some(value => value.startsWith(`${target}: legend legend occludes`)),`${name} ${amount}`);
    }
  }
  assert.ok(state.obstacles.length === 0);
});

test('legend, event, forecast and hud paint are all strict zero-area checks', () => {
  const badge = fixture().canvas.labels.latest.badge.rect;
  for (const [category, surface] of [['legend','html'],['event','svg'],['forecast','svg'],['hud','html']]) {
    const state = fixture(); state.obstacles = [{key:category,category,surface,paintRect:box(badge.left + 2,badge.top + 3,1,1)}];
    fails(state, new RegExp(`latest-tag: ${category} ${category} occludes 1`));
  }
});

test('two labels, or a label and the tag, that share area collide', () => {
  let state = fixture(); state.canvas.labels.ticks[1].box = box(264,128 + 100,52,14).left ? {...state.canvas.labels.ticks[0].box, top:state.canvas.labels.ticks[0].box.top + 5, bottom:state.canvas.labels.ticks[0].box.bottom + 5} : null;
  fails(state, /tick-0\/tick-1: labels overlap/);
  state = fixture(); state.canvas.labels.ticks[2].box = {...state.canvas.labels.latest.box};
  fails(state, /tick-2\/latest: labels overlap/);
  state = fixture(); const badge = state.canvas.labels.latest.badge.rect; state.canvas.labels.ticks[3].box = box(badge.left + 4,badge.top - 5,40,14);
  fails(state, /tick-3\/latest-tag: labels overlap/);
  state = fixture(); state.canvas.labels.countdown = {...structuredClone(state.canvas.labels.latest), key:'countdown', text:'03:12:40', box:{...state.canvas.labels.latest.box, top:state.canvas.labels.latest.box.top + 6, bottom:state.canvas.labels.latest.box.bottom + 6}};
  state.canvas.labels.latest.badge.rect = box(258,308,60,40);
  fails(state, /latest\/countdown: labels overlap/);
  state = fixture(); const [a, b] = state.canvas.labels.ticks; b.box = box(a.box.left,a.box.bottom,a.box.width,14);
  assert.deepEqual(priceAxisOverlapEvidence(state).labelCollisions,[], 'boxes that only touch do not collide');
});

test('an overlay over the empty part of the gutter is recorded as evidence and does not fail', () => {
  const state = fixture(); state.obstacles = [{key:'hud-summary',category:'hud',surface:'html',paintRect:box(258,200,4,24)}];
  const evidence = priceAxisOverlapEvidence(state);
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  assert.equal(evidence.occlusions.length,0);
  assert.deepEqual(evidence.gutterIntrusions,[{obstacle:'hud-summary',category:'hud',surface:'html',area:96}]);
  assert.equal(evidence.intrudedArea,96);
});

test('missing obstacle geometry and unsupported clip shapes cannot count as a pass', () => {
  const state = fixture(); state.obstacles = [{key:'ghost',category:'legend',surface:'html',paintRect:null}];
  fails(state, /ghost: missing obstacle paint geometry/);
  const clipped = fixture(); clipped.geometryIssues = ['unsupported clip geometry on path: url(#clip)'];
  fails(clipped, /^geometry: unsupported clip geometry/);
  assert.deepEqual(validatePriceAxisState(null,sources.BTCUSD),['missing state or independent source expectation']);
});

test('alignment reads gutter, label x, label inset, tag left, tag text x and tag right gap from the engine geometry', () => {
  assert.deepEqual(priceAxisAlignment(fixture()),{gutter:64,labelX:264,labelInset:8,tagLeft:258,tagTextX:264,tagRightGap:2});
  assert.deepEqual(priceAxisAlignment(fixture('ETHUSD',80)),{gutter:80,labelX:248,labelInset:8,tagLeft:242,tagTextX:248,tagRightGap:2});
  const state = fixture(); state.canvas.labels.ticks.forEach(tick => {tick.ink = 0;});
  assert.equal(priceAxisAlignment(state),null,'an unpainted tick is no anchor');
  const noTag = fixture(); noTag.canvas.labels.latest = null; assert.equal(priceAxisAlignment(noTag),null);
});

test('BTC and ETH must match within exactly 2 CSS pixels in every compared value', () => {
  const same = comparePriceAxisStates(fixture('BTCUSD',88), fixture('ETHUSD',88));
  assert.deepEqual(same.failures,[]); assert.deepEqual(same.deltas.gutter,0);
  const gap = comparePriceAxisStates(fixture('BTCUSD',88), fixture('ETHUSD',80));
  assert.ok(gap.failures.some(value => /gutter: BTC\/ETH difference -8 exceeds 2 CSS pixels/.test(value)));
  assert.ok(gap.failures.some(value => /labelX: BTC\/ETH difference 8 exceeds/.test(value)), 'the label x follows the gutter when the plot width differs');
  assert.deepEqual(comparePriceAxisStates(fixture('BTCUSD',88), fixture('ETHUSD',86)).failures.filter(value => /gutter/.test(value)),[], 'exactly 2 passes');
  assert.ok(comparePriceAxisStates(fixture('BTCUSD',88), fixture('ETHUSD',85.999)).failures.some(value => /gutter/.test(value)), 'beyond 2 fails without rounding');
  for (const key of ['tagLeft','tagTextX','tagRightGap','labelInset']) {
    const eth = fixture('ETHUSD',88), btc = fixture('BTCUSD',88);
    if (key === 'tagLeft') eth.canvas.labels.latest.badge.rect = box(eth.canvas.labels.latest.badge.rect.left + 2.5,308,56,20);
    if (key === 'tagTextX') eth.canvas.labels.latest.anchor.x += 3;
    if (key === 'tagRightGap') eth.canvas.labels.latest.badge.rect = box(eth.canvas.labels.latest.badge.rect.left,308,eth.canvas.labels.latest.badge.rect.width - 3,20);
    if (key === 'labelInset') eth.canvas.labels.ticks.forEach(tick => {tick.anchor.x += 2.5;});
    assert.ok(comparePriceAxisStates(btc,eth).failures.some(value => value.startsWith(`${key}:`)),key);
  }
  assert.deepEqual(comparePriceAxisStates(fixture('BTCUSD'), null).failures,['missing same-viewport BTC/ETH pair']);
  const unlabeled = fixture('ETHUSD'); unlabeled.canvas.labels.latest = null;
  assert.deepEqual(comparePriceAxisStates(fixture('BTCUSD'), unlabeled).failures,['missing BTC/ETH alignment evidence']);
  const wide = fixture('ETHUSD'); wide.width = 390;
  assert.deepEqual(comparePriceAxisStates(fixture('BTCUSD'), wide).failures,['missing same-viewport BTC/ETH pair']);
});

test('overlay coverage distinguishes absent cases and requires actual paint somewhere in the matrix', () => {
  for (const category of ['legend','event','forecast']) {
    const state = fixture(); state.overlays.paintObjectCounts[category] = 0;
    assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
    assert.equal(priceAxisOverlayCoverage([{id:'absent',state}]).status,'unverified');
    const coverage = priceAxisOverlayCoverage([{id:'absent',state},{id:'observed',state:fixture()}]);
    assert.equal(coverage.status,'passed');
    assert.deepEqual(coverage.categories[category].observedCases,['observed']);
    assert.equal(coverage.categories[category].unobservedCases[0].id,'absent');
  }
  assert.deepEqual(priceAxisOverlayCoverage([]).missing,['legend','event','forecast']);
});
