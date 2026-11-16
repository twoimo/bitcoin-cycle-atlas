import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activePriceAxisBadge, comparePriceAxisStates, expectedPriceAxisUsd, priceAxisIntersectionArea,
  priceAxisOverlapEvidence, priceAxisOverlayCoverage, priceAxisPaintStyleState, priceAxisSourceExpectations, validatePriceAxisState as validateState,
} from '../scripts/price-axis-browser-contract.mjs';

const validatePriceAxisState = (state,source,viewport={width:320,height:900}) => validateState(state,source,viewport);
const inkStyle = {display:'inline',visibility:'visible',opacity:'1',contentVisibility:'visible',fill:'#fff',fillOpacity:'1',stroke:'none',strokeOpacity:'1',strokeWidth:'1px'};
const box = (left, top, width, height) => ({left, top, right:left + width, bottom:top + height, width, height});
const sources = priceAxisSourceExpectations({
  btcDaily:{prices:[['2026-11-05', 1], ['2026-11-06', 75826.5258667446]]},
  ethArchive:{source:'Coinbase Exchange', product:'ETH-USD', dailyHistory:{completedOnly:true, candles:[{date:'2026-11-06T00:00:00.000Z', close:2235.37}]}},
  btcVolume:{source:'Bitstamp', bars:[{date:'2026-11-06', close:75746.53}, {date:'2026-11-07', close:99999}]},
});
function fixture(symbol = 'BTCUSD') {
  const expected = sources[symbol], chartId = symbol === 'BTCUSD' ? 'lab-chart' : 'eth-chart', ownerKey = `${chartId}:axis`;
  const target = (key, text, rect, x = 260) => ({key, text, rect, paintRect:{...rect}, painted:true, ownerKey,
    textStyles:[{...inkStyle}],
    anchor:{x, y:rect.top + 10}, textAnchor:{x, y:rect.top + 13}, paintIssues:[],
    hit:{x:(rect.left + rect.right) / 2, y:(rect.top + rect.bottom) / 2, relationship:'paint-layer', ownerKey, chartId, target:'rect.price-axis-hit'}});
  const line = (kind, start, end) => ({key:kind, start, end, paintRect:box(Math.min(start.x,end.x)-.5,Math.min(start.y,end.y)-.5,Math.abs(start.x-end.x)+1,Math.abs(start.y-end.y)+1),painted:true, stroke:'#28323f', strokeWidth:1, dash:'none', ownerKey});
  return {
    symbol, width:320, height:900, boot:'ready', page:'outlook', interval:'daily', chartType:'line', unit:'usd', overflow:0,
    chart:{id:chartId, painted:true, rect:box(0,100,320,500), frame:box(0,100,320,500), plot:{left:8, top:118, right:256, bottom:550}},
    ownerCount:1, owner:{key:ownerKey, chartId,lastSvgChild:true},
    ticks:[target('tick-0','$100,000',box(260,180,52,14)), target('tick-1','$50,000',box(260,420,49,14))],
    latest:target('latest',expected.text,box(256,290,61,18)), cursor:null,
    readout:{date:expected.date, kind:'observed', priceText:expected.text, raw:{price:expected.rawValue, date:expected.date, kind:'observed'}},
    boundaries:{axis:[line('axis',{x:256,y:100},{x:256,y:600})], top:[line('top',{x:0,y:100},{x:256,y:100})], bottom:[line('bottom',{x:0,y:600},{x:256,y:600})]},
    obstacles:[], geometryIssues:[], overlays:{paintObjectCounts:{legend:3,event:2,forecast:2},unobservedCategories:[]},
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

test('actual chart-owned hit surface and a continuous SVG frame satisfy the price-axis contract', () => {
  for (const symbol of ['BTCUSD','ETHUSD']) assert.deepEqual(validatePriceAxisState(fixture(symbol), sources[symbol]), []);
});

test('price glyph ink is required even when a tag rectangle or axis hit surface remains visible', () => {
  for (const patch of [{fill:'none'}, {fill:'rgba(255, 255, 255, 0)'}, {fillOpacity:'0'}, {visibility:'hidden'}, {opacity:'0'}]) {
    const state = fixture(); Object.assign(state.latest.textStyles[0],patch);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /latest: price text has no visible/.test(value)),JSON.stringify(patch));
  }
  const state = fixture(); state.ticks[0].textStyles[0].fill = 'none';
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /tick-0: price text has no visible/.test(value)));
  state.ticks[0].textStyles[0].stroke = '#fff';
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  state.ticks[0].textStyles[0].strokeOpacity = '0';
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /tick-0: price text has no visible/.test(value)));
  state.ticks[0].painted = false; state.ticks[0].explicitVisibility = 'visible';
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /tick lost paint/.test(value)));
  state.ticks[0].explicitVisibility = 'hidden';
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  state.cursor = {...structuredClone(state.latest),key:'cursor'}; state.latest.painted = false; state.cursor.textStyles[0].opacity = '0';
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /cursor: price text has no visible/.test(value)));
});

test('computed child visibility overrides a hidden ancestor while display and opacity suppress descendants', () => {
  const own = {...inkStyle}, ancestor = {...inkStyle,display:'block',visibility:'hidden'};
  assert.equal(priceAxisPaintStyleState([own,ancestor],{content:true}).ink,true);
  assert.equal(priceAxisPaintStyleState([{...own,visibility:'hidden'},{...ancestor,visibility:'visible'}],{content:true}).ink,false);
  for (const patch of [{display:'none'}, {opacity:'0'}, {contentVisibility:'hidden'}]) assert.equal(priceAxisPaintStyleState([own,{...ancestor,...patch}],{content:true}).ink,false);
  assert.equal(priceAxisPaintStyleState([{...own,hidden:true}],{content:true}).ink,true,'computed paint wins over a semantic hidden property overridden by CSS');
  assert.equal(priceAxisPaintStyleState([{...own,contentVisibility:'hidden'}]).visible,true,'content visibility retains the owner background');
  assert.equal(priceAxisPaintStyleState([{...own,contentVisibility:'hidden'}],{content:true}).ink,false);
});

test('actual CSS viewport must exactly match the requested matrix case', () => {
  const state = fixture();
  assert.ok(validateState(state,sources.BTCUSD).includes('missing requested viewport'));
  for (const actual of [{width:980,height:900},{width:320.001,height:900},{width:320,height:899}]) {
    Object.assign(state,actual);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /actual viewport/.test(value)));
  }
});

test('foreground paint cannot interrupt frame lines between labels, including a clipped half-stroke', () => {
  const locations = {axis:box(255.9,240,.2,1),top:box(80,100,1,.001),bottom:box(80,599.999,1,.001)};
  for (const [kind,paintRect] of Object.entries(locations)) {
    const state = fixture();
    state.boundaries.axis[0].paintRect = box(255.5,100,1,500);
    state.boundaries.top[0].paintRect = box(0,100,256,.5);
    state.boundaries.bottom[0].paintRect = box(0,599.5,256,.5);
    assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
    state.obstacles = [{key:'foreground',category:'legend',surface:'html',pointerEvents:'none',paintRect}];
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => value.startsWith(`frame-${kind}-0:`) && value.includes('occludes')));
    Object.assign(state.obstacles[0],{surface:'svg',chartId:'lab-chart',paintOrder:'before-axis'});
    assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
    assert.ok(priceAxisOverlapEvidence(state,sources.BTCUSD).underlapArea>0);
    state.obstacles[0].paintOrder = 'after-axis';
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => value.startsWith(`frame-${kind}-0:`) && value.includes('occludes')));
  }
});

test('direct label center hits are valid, but another chart or arbitrary overlay cannot own the hit', () => {
  const state = fixture(); state.ticks[0].hit.relationship = 'self';
  assert.deepEqual(validatePriceAxisState(state, sources.BTCUSD), []);
  for (const patch of [{relationship:'other'}, {ownerKey:'eth-chart:axis'}, {chartId:'eth-chart'}, {x:286.001}]) {
    const broken = structuredClone(state); Object.assign(broken.ticks[0].hit, patch);
    assert.ok(validatePriceAxisState(broken, sources.BTCUSD).some(value => /center hit/.test(value)), JSON.stringify(patch));
  }
});

test('touching paint bounds pass, but every positive occlusion area fails without rounding', () => {
  const state = fixture(), label = state.ticks[0];
  state.obstacles = [{key:'legend',category:'legend',paintRect:box(259,180,1,14)}];
  assert.equal(priceAxisIntersectionArea(label.rect,state.obstacles[0].paintRect),0);
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  for (const amount of [1,0.001,Number.EPSILON * 512]) {
    state.obstacles[0].paintRect = box(259,180,1 + amount,14);
    const evidence = priceAxisOverlapEvidence(state,sources.BTCUSD);
    assert.ok(evidence.occludedArea > 0);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /occludes/.test(value)));
  }
});

test('legend, event, and forecast occlusions are all strict zero-area checks', () => {
  for (const category of ['legend','event','forecast']) {
    const state = fixture(); state.obstacles = [{key:category,category,paintRect:box(270,295,1,1)}];
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => value.includes(`${category} ${category} occludes 1`)));
  }
});

test('same-chart SVG underlap is recorded separately, but foreground paint blocks even without pointer events', () => {
  const state = fixture();
  state.obstacles = [{key:'event',category:'event',surface:'svg',chartId:'lab-chart',paintOrder:'before-axis',pointerEvents:'none',paintRect:box(270,295,1,1)}];
  let evidence = priceAxisOverlapEvidence(state,sources.BTCUSD);
  assert.equal(evidence.underlapArea,1); assert.equal(evidence.occludedArea,0);
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  state.obstacles[0].paintOrder = 'after-axis';
  evidence = priceAxisOverlapEvidence(state,sources.BTCUSD);
  assert.equal(evidence.occludedArea,1);
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /occludes 1/.test(value)));
  state.obstacles[0].paintOrder = 'before-axis'; state.obstacles[0].chartId = 'other-chart';
  assert.equal(priceAxisOverlapEvidence(state,sources.BTCUSD).occludedArea,1);
  state.obstacles = []; state.owner.lastSvgChild = false;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).includes('price-axis paint owner is not the final SVG child'));
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

test('two painted labels cannot overlap even when center hits reach their shared layer', () => {
  const state = fixture();
  state.ticks[1] = {...structuredClone(state.ticks[0]),key:'tick-1',text:'$60,000'};
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /labels overlap/.test(value)));
});

test('the visible cursor can represent the hidden latest only for the same independent price and date', () => {
  const state = fixture(); state.cursor = {...structuredClone(state.latest),key:'cursor'}; state.latest.painted = false;
  assert.equal(activePriceAxisBadge(state,sources.BTCUSD).role,'latest-observation-cursor');
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  for (const mutate of [value => {value.cursor.text = '$70,000';}, value => {value.readout.date = '2026-11-05';}, value => {value.readout.kind = 'forecast';}, value => {value.latest.text = '$70,000';}]) {
    const broken = structuredClone(state); mutate(broken);
    assert.equal(activePriceAxisBadge(broken,sources.BTCUSD).role,'missing-latest-observation');
    assert.ok(validatePriceAxisState(broken,sources.BTCUSD).some(value => /latest/.test(value)));
  }
});

test('candles require the venue close and reject the old Coin Metrics latest label', () => {
  const state = fixture(), expected = sources.BTCUSD.candle;
  state.chartType = 'candles'; state.readout = {date:expected.date,kind:'observed',priceText:expected.text,raw:{date:expected.date,kind:'observed',price:expected.rawValue,close:expected.rawValue,source:expected.source}};
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /latest label/.test(value)));
  state.latest.text = expected.text;
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
  state.cursor = {...structuredClone(state.latest),key:'cursor'}; state.latest.painted = false;
  assert.deepEqual(validatePriceAxisState(state,sources.BTCUSD),[]);
});

test('correct rounded text does not hide a raw readout precision or source mismatch', () => {
  const state = fixture(); state.readout.raw.price = 75826.53;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /raw readout differs/.test(value)));
});

test('hidden or empty ticks, missing ownership, and clipping cannot count as a pass', () => {
  for (const mutate of [state => {state.ticks = [];}, state => {for (const tick of state.ticks) tick.painted = false;}, state => {state.ownerCount = 0;}, state => {state.ticks[0].paintRect.right -= 0.0001;}]) {
    const state = fixture(); mutate(state);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).length > 0);
  }
});

test('frame lines must meet raw endpoints without gaps, dashes, or transparent paint', () => {
  for (const mutate of [
    state => {state.boundaries.axis[0].end.y -= 0.001;},
    state => {state.boundaries.axis[0].start.y = state.chart.plot.top;},
    state => {state.boundaries.top[0].end.x -= 0.001;},
    state => {state.boundaries.bottom[0].start.x += 0.001;},
    state => {state.boundaries.axis[0].dash = '3 3';},
    state => {state.boundaries.axis[0].stroke = 'none';},
    state => {state.boundaries.axis[0].paintRect.top = state.chart.plot.top;},
    state => {state.boundaries.axis = [];},
  ]) {
    const state = fixture(); mutate(state);
    assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /axis|top|bottom/.test(value)));
  }
});

test('BTC/ETH alignment allows exactly 2 CSS pixels and rejects 2.001 without rounding', () => {
  const btc = fixture(), eth = fixture('ETHUSD');
  assert.deepEqual(comparePriceAxisStates(btc,eth,sources).failures,[]);
  eth.latest.textAnchor.x += 2;
  assert.deepEqual(comparePriceAxisStates(btc,eth,sources).failures,[]);
  eth.latest.textAnchor.x += 0.001;
  assert.ok(comparePriceAxisStates(btc,eth,sources).failures.some(value => /tagTextX/.test(value)));
});

test('the ±2 comparison allowance does not allow overflow or subpixel gutter intrusion', () => {
  const state = fixture(); state.overflow = 0.0001;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /overflow/.test(value)));
  state.overflow = 0; state.latest.rect.left -= 0.0001;
  assert.ok(validatePriceAxisState(state,sources.BTCUSD).some(value => /gutter/.test(value)));
});
