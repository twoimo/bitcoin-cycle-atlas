// Pure R17 assertions. Browser evidence is collected separately; no DOM, CDP,
// rounding, pixel allowance, or screenshot substitution belongs in this module.
export const priceAxisWidths = Object.freeze([320, 390, 768, 1440]);
export const priceAxisSymbols = Object.freeze(['BTCUSD', 'ETHUSD']);

const finite = value => Number.isFinite(value);
const hasBox = box => Boolean(box && ['left', 'top', 'right', 'bottom'].every(key => finite(box[key])) && box.right > box.left && box.bottom > box.top);
const contained = (inner, outer) => hasBox(inner) && hasBox(outer) && inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
export const priceAxisIntersectionArea = (a, b) => a && b
  ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;

/** Prove an empty clipping region, never infer sr-only from an ID or size.
 * CSS inset shorthand uses T/R/B/L; opposing insets totaling at least 100%
 * leave no area (CSS Shapes 1, inset()). Only nonnegative percentages and
 * zero lengths are recognized; other syntax keeps the strict geometry path.
 * Exact decimal arithmetic prevents a tiny positive area rounding to zero. */
export function priceAxisHasEmptyInsetClip(value) {
  const match = typeof value === 'string' && /^inset\(\s*([^()]*)\s*\)$/i.exec(value.trim());
  if (!match) return false;
  const tokens = match[1].trim().split(/\s+/);
  if (tokens.length < 1 || tokens.length > 4) return false;
  const values = tokens.map(token => {
    if (/^\+?(?:0+(?:\.0+)?|\.0+)(?:px)?$/i.test(token)) return {n:0n,d:1n};
    const percent = /^\+?(\d+(?:\.\d+)?|\.\d+)%$/.exec(token);
    if (!percent) return null;
    const [whole, fraction = ''] = percent[1].split('.');
    return {n:BigInt((whole || '0') + fraction),d:10n ** BigInt(fraction.length)};
  });
  if (values.some(value => value === null)) return false;
  const [top, right = top, bottom = top, left = right] = values;
  const closed = (a,b) => a.n * b.d + b.n * a.d >= 100n * a.d * b.d;
  return closed(top,bottom) || closed(left,right);
}

/** Computed visibility belongs to the actual node: a child may override a
 * hidden ancestor. Display/opacity still suppress the whole subtree. A hidden
 * content subtree retains its owner's background, but not its text ink. */
export function priceAxisPaintStyleState(styles, {content = false} = {}) {
  const own = styles?.[0];
  const visible = Boolean(own && own.visibility === 'visible' && styles.every((style,index) =>
    style.display !== 'none' && Number(style.opacity ?? 1) > 0 && !((index > 0 || content) && style.contentVisibility === 'hidden')));
  const colorPaints = value => Boolean(value && !['none','transparent'].includes(value)
    && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value) && !/\/\s*0(?:\.0+)?\s*\)$/.test(value));
  const fill = Boolean(own && colorPaints(own.fill) && Number(own.fillOpacity ?? 1) > 0);
  const stroke = Boolean(own && colorPaints(own.stroke) && Number(own.strokeOpacity ?? 1) > 0 && Number.parseFloat(own.strokeWidth) > 0);
  return {visible,fill,stroke,ink:visible && (fill || stroke)};
}

export function expectedPriceAxisUsd(value) {
  if (!finite(value) || value <= 0) throw new TypeError('Expected a positive observed USD price');
  return '$' + new Intl.NumberFormat('en-US', {maximumFractionDigits:value < 1 ? 6 : 2}).format(value);
}

/** Read expectations from preserved source rows, never from a label, axis
 * domain, forecast, browser readout, or a hard-coded remembered quote. */
export function priceAxisSourceExpectations({btcDaily, ethArchive, btcVolume}) {
  const btc = btcDaily?.prices?.at(-1), eth = ethArchive?.dailyHistory?.candles?.at(-1);
  if (!Array.isArray(btc) || typeof btc[0] !== 'string' || !finite(btc[1])) throw new TypeError('Missing last Coin Metrics BTC observation');
  if (ethArchive?.source !== 'Coinbase Exchange' || ethArchive?.product !== 'ETH-USD' || ethArchive?.dailyHistory?.completedOnly !== true || !eth || !finite(eth.close)) throw new TypeError('Missing completed Coinbase ETH observation');
  const expected = {
    BTCUSD:{symbol:'BTCUSD', source:'Coin Metrics', file:'dist/data/btc-daily.json', date:btc[0], rawValue:btc[1], text:expectedPriceAxisUsd(btc[1])},
    ETHUSD:{symbol:'ETHUSD', source:'Coinbase Exchange', file:'dist/data/eth-ohlc.json', date:eth.date.slice(0,10), rawDate:eth.date, rawValue:eth.close, text:expectedPriceAxisUsd(eth.close)},
  };
  if (btcVolume) {
    const row = btcVolume.bars?.filter(value => value.date <= btc[0]).at(-1);
    if (btcVolume.source !== 'Bitstamp' || !row || !finite(row.close)) throw new TypeError('Missing last Bitstamp BTC candle');
    expected.BTCUSD.candle = {symbol:'BTCUSD', source:'Bitstamp', file:'dist/data/btc-volume.json', date:row.date, rawValue:row.close, text:expectedPriceAxisUsd(row.close)};
  }
  return expected;
}

export const priceAxisObservationForState = (state, expected) => state.chartType === 'candles' && expected?.candle ? expected.candle : expected;

export function activePriceAxisBadge(state, source) {
  const expected = priceAxisObservationForState(state, source);
  if (state.latest?.painted) return {role:'latest', target:state.latest, sameValueCursor:false};
  const cursor = state.cursor;
  const latestMatches = state.latest?.text === expected?.text;
  const readoutMatches = state.readout?.priceText === expected?.text && state.readout?.date === expected?.date && state.readout?.kind === 'observed';
  if (latestMatches && cursor?.painted && cursor.text === expected?.text && readoutMatches) {
    return {role:'latest-observation-cursor', target:cursor, sameValueCursor:true};
  }
  return {role:'missing-latest-observation', target:null, sameValueCursor:false};
}

export function priceAxisOverlapEvidence(state, expected) {
  const badge = activePriceAxisBadge(state, expected), targets = (state.ticks || []).filter(item => item.painted);
  if (badge.target) targets.push(badge.target);
  const occlusions = [], underlaps = [];
  // Straight frame lines use their actually visible stroke rectangle. Normal
  // outer half-stroke clipping is already applied by the browser collector.
  const frameTargets = Object.entries(state.boundaries || {}).flatMap(([kind,lines]) => lines.map((line,index) => ({key:`frame-${kind}-${index}`,rect:line.paintRect})));
  for (const target of [...targets,...frameTargets]) for (const obstacle of state.obstacles || []) {
    const area = priceAxisIntersectionArea(target.rect, obstacle.paintRect);
    if (area > 0) {
      const evidence = {target:target.key,obstacle:obstacle.key,category:obstacle.category,area,paintOrder:obstacle.paintOrder || 'unknown'};
      // SVG document order is the paint order within this same chart. Retain
      // intersections behind the axis as evidence, not as foreground masking.
      if (obstacle.surface === 'svg' && obstacle.chartId === state.chart?.id && obstacle.paintOrder === 'before-axis') underlaps.push(evidence);
      else occlusions.push(evidence);
    }
  }
  const labelCollisions = [];
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const area = priceAxisIntersectionArea(targets[i].rect, targets[j].rect);
    if (area > 0) labelCollisions.push({a:targets[i].key, b:targets[j].key, area});
  }
  return {occlusions,underlaps,labelCollisions,occludedArea:occlusions.reduce((total, item) => total + item.area, 0),underlapArea:underlaps.reduce((total,item) => total + item.area,0)};
}

export function priceAxisAlignment(state, expected) {
  const badge = activePriceAxisBadge(state, expected).target, chart = state.chart?.rect, plotRight = state.chart?.plot?.right;
  const ticks = (state.ticks || []).filter(item => item.painted);
  if (!chart || !finite(plotRight) || !ticks.length || !badge) return null;
  return {
    gutter:chart.right - plotRight,
    labelX: ticks[0].anchor?.x - chart.left,
    labelInset:ticks[0].anchor?.x - plotRight,
    tagLeft:badge.rect?.left - chart.left,
    tagTextX:badge.textAnchor?.x - chart.left,
    tagRightGap:chart.right - badge.rect?.right,
  };
}

export function validatePriceAxisState(state, source, expectedViewport) {
  const failures = [], fail = message => failures.push(message);
  if (!state || !source) return ['missing state or independent source expectation'];
  if (!expectedViewport || !finite(expectedViewport.width) || !finite(expectedViewport.height)) fail('missing requested viewport');
  else if (state.width !== expectedViewport.width || state.height !== expectedViewport.height) fail(`actual viewport ${state.width}x${state.height} differs from requested ${expectedViewport.width}x${expectedViewport.height}`);
  const expected = priceAxisObservationForState(state, source);
  if (state.symbol !== expected.symbol) fail('symbol does not match independent source');
  if (state.boot !== 'ready' || state.page !== 'outlook') fail('native outlook route is not ready');
  if (state.interval !== 'daily' || !['line','candles'].includes(state.chartType) || state.unit !== 'usd') fail('unverified source selection: expected daily USD line/candles');
  if (state.overflow !== 0) fail(`horizontal overflow ${state.overflow}`);
  const chart = state.chart, owner = state.owner, viewport = {left:0, top:0, right:state.width, bottom:state.height};
  if (!chart?.painted || !hasBox(chart.rect) || !hasBox(chart.frame)) fail('missing painted chart/frame');
  if (state.ownerCount !== 1 || !owner?.key || owner.chartId !== chart?.id) fail('missing unique chart-owned price-axis paint layer');
  if (owner?.lastSvgChild !== true) fail('price-axis paint owner is not the final SVG child');
  if (!state.ticks?.length) fail('missing price-axis ticks');
  const ticks = (state.ticks || []).filter(item => item.painted);
  if (!ticks.length) fail('no painted price-axis ticks');
  for (const tick of state.ticks || []) if (!tick.painted && tick.explicitVisibility !== 'hidden') fail(`${tick.key}: tick lost paint outside explicit badge suppression`);
  if (new Set(ticks.map(item => item.text)).size !== ticks.length) fail('duplicate painted tick text');
  if (!state.latest || state.latest.text !== expected.text) fail(`latest label does not match ${expected.source} ${expected.date} ${expected.text}`);
  const badge = activePriceAxisBadge(state, expected);
  if (!badge.target) fail('latest hidden without a visible cursor for the same last observed price/date');
  if (state.readout?.date !== expected.date || state.readout?.kind !== 'observed') fail('readout does not identify the last observed source date');
  if (state.readout?.priceText !== expected.text) fail('readout does not match independent last observation');
  if (state.readout?.raw) {
    if (state.readout.raw.price !== expected.rawValue || state.readout.raw.date?.slice(0,10) !== expected.date || state.readout.raw.kind !== 'observed') fail('raw readout differs from independent last observation');
  }
  if (state.chartType === 'candles' && source.candle) {
    if (state.readout?.raw && (state.readout.raw.close !== expected.rawValue || state.readout.raw.source !== expected.source)) fail('raw candle readout differs from independent venue close/source');
  }
  const targets = [...ticks, ...(badge.target ? [badge.target] : [])];
  for (const target of targets) {
    if (!priceAxisPaintStyleState(target.textStyles,{content:true}).ink) fail(`${target.key}: price text has no visible fill or stroke ink`);
    if (target.ownerKey !== owner?.key) fail(`${target.key}: paint owner mismatch`);
    if (!hasBox(target.rect) || !contained(target.rect, chart?.rect) || !contained(target.rect, viewport)) fail(`${target.key}: clipped or outside chart/viewport`);
    if (!hasBox(target.paintRect) || !contained(target.rect, target.paintRect)) fail(`${target.key}: clipped painted bounds`);
    if (target.textRect && !contained(target.textRect,target.rect)) fail(`${target.key}: text escapes the price badge`);
    if (!finite(target.anchor?.x ?? target.textAnchor?.x)) fail(`${target.key}: missing raw text anchor`);
    if (target.rect?.left < chart?.plot?.right) fail(`${target.key}: crosses the price gutter boundary`);
    const hit = target.hit;
    if (!hit || !['self','paint-layer'].includes(hit.relationship) || hit.ownerKey !== owner?.key || hit.chartId !== chart?.id) fail(`${target.key}: center hit is not itself or its owned paint layer`);
    if (!hit || hit.x !== (target.rect.left + target.rect.right) / 2 || hit.y !== (target.rect.top + target.rect.bottom) / 2) fail(`${target.key}: center hit did not use raw rectangle center`);
    for (const issue of target.paintIssues || []) fail(`${target.key}: ${issue}`);
  }
  for (const issue of state.geometryIssues || []) fail(`geometry: ${issue}`);
  for (const obstacle of state.obstacles || []) if (!hasBox(obstacle.paintRect)) fail(`${obstacle.key}: missing obstacle paint geometry`);
  const overlap = priceAxisOverlapEvidence(state, expected);
  for (const item of overlap.occlusions) fail(`${item.target}: ${item.category} ${item.obstacle} occludes ${item.area} square CSS pixels`);
  for (const item of overlap.labelCollisions) fail(`${item.a}/${item.b}: labels overlap ${item.area} square CSS pixels`);
  const frame = chart?.frame, right = chart?.plot?.right;
  for (const kind of ['axis','top','bottom']) {
    const lines = state.boundaries?.[kind] || [];
    if (lines.length !== 1) { fail(`${kind}: expected one continuous frame line`); continue; }
    const line = lines[0];
    if (!line.painted || !(line.strokeWidth > 0) || !line.stroke || ['none','transparent'].includes(line.stroke) || line.dash !== 'none' || line.ownerKey !== owner?.key) fail(`${kind}: frame line is unpainted, dashed, or outside its owner`);
    if (!frame) continue;
    const a = line.start, b = line.end;
    if (!a || !b) { fail(`${kind}: missing raw line endpoints`); continue; }
    if (!hasBox(line.paintRect) || [a,b].some(point => point.x < line.paintRect.left || point.x > line.paintRect.right || point.y < line.paintRect.top || point.y > line.paintRect.bottom)) fail(`${kind}: clipping removes part of the continuous frame`);
    if (kind === 'axis') {
      if (a.x !== right || b.x !== right || Math.min(a.y,b.y) !== frame.top || Math.max(a.y,b.y) !== frame.bottom) fail('axis: does not span the complete SVG frame top to bottom');
    } else {
      const y = kind === 'top' ? frame.top : frame.bottom;
      if (a.y !== y || b.y !== y || Math.min(a.x,b.x) !== frame.left || Math.max(a.x,b.x) !== right) fail(`${kind}: grid does not meet the left frame and price axis`);
    }
  }
  const alignment = priceAxisAlignment(state, expected);
  if (!alignment || Object.values(alignment).some(value => !finite(value)) || !(alignment.gutter > 0)) fail('missing raw alignment measurements');
  if (ticks.some(tick => tick.anchor?.x !== ticks[0]?.anchor?.x)) fail('tick x anchors are not aligned');
  return failures;
}

/** A category absent in a particular viewport is explicitly unobserved.
 * Matrix coverage requires actual paint at least once for every requested
 * category; empty arrays are never advertised as a checked zero occlusion. */
export function priceAxisOverlayCoverage(cases) {
  const categories = Object.fromEntries(['legend','event','forecast'].map(category => {
    const observed = cases.filter(item => item.state?.overlays?.paintObjectCounts?.[category] > 0).map(item => item.id);
    const unobserved = cases.filter(item => !(item.state?.overlays?.paintObjectCounts?.[category] > 0)).map(item => ({id:item.id,reason:item.state?.overlays?.observations?.[category]?.reason || 'no painted evidence'}));
    return [category,{observedCaseCount:observed.length,observedCases:observed,unobservedCases:unobserved}];
  }));
  const missing = Object.keys(categories).filter(category => categories[category].observedCaseCount === 0);
  return {status:missing.length ? 'unverified' : 'passed',categories,missing};
}

/** ±2 CSS pixels applies only to the requested BTC/ETH layout comparison.
 * It is never reused for occlusion, clipping, overflow, or source identity. */
export function comparePriceAxisStates(btc, eth, expected) {
  const failures = [];
  if (btc?.symbol !== 'BTCUSD' || eth?.symbol !== 'ETHUSD' || btc.width !== eth.width || btc.height !== eth.height) return {deltas:null, failures:['missing same-viewport BTC/ETH pair']};
  const a = priceAxisAlignment(btc, expected.BTCUSD), b = priceAxisAlignment(eth, expected.ETHUSD);
  if (!a || !b) return {deltas:null, failures:['missing BTC/ETH alignment evidence']};
  const deltas = Object.fromEntries(Object.keys(a).map(key => [key,b[key] - a[key]]));
  for (const [key, value] of Object.entries(deltas)) if (!finite(value) || Math.abs(value) > 2) failures.push(`${key}: BTC/ETH difference ${value} exceeds 2 CSS pixels`);
  return {btc:a, eth:b, deltas, failures};
}
