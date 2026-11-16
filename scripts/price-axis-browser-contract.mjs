// Pure price-axis assertions for the Funnest canvas renderer. Browser evidence is
// collected separately; no DOM, CDP, rounding, pixel allowance, or screenshot
// substitution belongs in this module. The engine paints the axis labels as
// canvas pixels, so the label boxes are measured from the engine's own layout.
export const priceAxisWidths = Object.freeze([320, 390, 768, 1440]);
export const priceAxisSymbols = Object.freeze(['BTCUSD', 'ETHUSD']);
const priceAxisDayMs = 86_400_000;

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

/** Label rows are the canvas analog of the old tick and latest-price boxes.
 * Any painted overlay with positive area over a row covers a label; touching
 * is allowed. Overlap with the rest of the gutter strip, which holds no label,
 * is recorded as evidence and does not fail. */
export function priceAxisOverlapEvidence(state) {
  const rows = (state.canvas?.ink?.surfaces || []).flatMap(surface => surface.bands.map(band => ({key:`label-${band.top}-${band.bottom}`,rect:band.rect})));
  const occlusions = [], gutterIntrusions = [];
  for (const obstacle of state.obstacles || []) {
    const strip = priceAxisIntersectionArea(state.canvas?.axisRect, obstacle.paintRect);
    if (strip > 0) gutterIntrusions.push({obstacle:obstacle.key,category:obstacle.category,surface:obstacle.surface,area:strip});
    for (const row of rows) {
      const area = priceAxisIntersectionArea(row.rect, obstacle.paintRect);
      if (area > 0) occlusions.push({target:row.key,obstacle:obstacle.key,category:obstacle.category,surface:obstacle.surface,area});
    }
  }
  return {occlusions,gutterIntrusions,occludedArea:occlusions.reduce((total, item) => total + item.area, 0),intrudedArea:gutterIntrusions.reduce((total, item) => total + item.area, 0)};
}

/** Label rows are measured from canvas pixels, so their text cannot be read.
 * Each row must stay clear of the plot boundary rule and the canvas edge,
 * and the pointer must reach the chart at its centre. */
function validateAxisInk(surface, canvas, fail) {
  if (!surface.readable) {fail('native canvas pixels are unreadable');return;}
  if (!surface.bands.length) return;
  if (JSON.stringify(surface.ruleColumns) !== '[0]') fail(`axis rule is not one continuous column at the plot boundary (columns ${JSON.stringify(surface.ruleColumns)})`);
  for (const band of surface.bands) {
    if (band.left < 1) fail(`label row ${band.top}-${band.bottom} touches the plot boundary`);
    if (band.right > surface.width - 2) fail(`label row ${band.top}-${band.bottom} touches the canvas edge`);
    if (!contained(band.rect, canvas.axisRect)) fail(`label row ${band.top}-${band.bottom} escapes the price-axis gutter`);
    const hit = band.hit;
    if (!hit || hit.insideHost !== true) fail(`label row ${band.top}-${band.bottom}: center hit is not the chart (${hit?.target ?? 'none'})`);
    if (!hit || hit.x !== (band.rect.left + band.rect.right) / 2 || hit.y !== (band.rect.top + band.rect.bottom) / 2) fail(`label row ${band.top}-${band.bottom}: center hit did not use the raw rectangle center`);
  }
}

export function validatePriceAxisState(state, source, expectedViewport) {
  const failures = [], fail = message => failures.push(message);
  if (!state || !source) return ['missing state or independent source expectation'];
  if (!expectedViewport || !finite(expectedViewport.width) || !finite(expectedViewport.height)) fail('missing requested viewport');
  else if (state.width !== expectedViewport.width || state.height !== expectedViewport.height) fail(`actual viewport ${state.width}x${state.height} differs from requested ${expectedViewport.width}x${expectedViewport.height}`);
  const expected = priceAxisObservationForState(state, source);
  if (state.symbol !== expected.symbol) fail('symbol does not match independent source');
  if (state.boot !== 'ready' || state.page !== 'outlook') fail('native outlook route is not ready');
  if (!['line','candles'].includes(state.chartType)) fail('unverified source selection: expected a line or candle chart');
  if (state.overflow !== 0) fail(`horizontal overflow ${state.overflow}`);
  const canvas = state.canvas, viewport = {left:0, top:0, right:state.width, bottom:state.height};
  if (!canvas) {fail('missing native Funnest canvas evidence');return failures;}
  if (canvas.engine !== 'funnest' || canvas.painted !== true || canvas.state !== 'ready') fail('price chart is not a painted Funnest canvas');
  if (canvas.legacyPriceNodes !== 0) fail('a legacy price renderer remains behind the canvas');
  if (canvas.chartType !== state.chartType) fail('engine chart type differs from the route state');
  if (canvas.currency !== 'USD' || canvas.timeUnit !== 'UTC milliseconds') fail('unverified source selection: expected USD observations on UTC milliseconds');
  if (state.chartType === 'candles' && canvas.sourceMode !== 'ohlc') fail('candles must come from observed OHLC bars');
  const last = canvas.lastBar;
  if (!finite(canvas.lastIntervalMs) || canvas.lastIntervalMs !== priceAxisDayMs) fail('unverified source selection: expected daily bars');
  if (!last || !finite(last.time) || new Date(last.time).toISOString().slice(0,10) !== expected.date || last.close !== expected.rawValue) fail(`last engine bar does not match ${expected.source} ${expected.date} ${expected.rawValue}`);
  if (state.readout?.date !== expected.date || state.readout?.kind !== 'observed') fail('readout does not identify the last observed source date');
  if (state.readout?.priceText !== expected.text) fail('readout does not match independent last observation');
  if (state.readout?.raw) {
    if (state.readout.raw.price !== expected.rawValue || state.readout.raw.date?.slice(0,10) !== expected.date || state.readout.raw.kind !== 'observed') fail('raw readout differs from independent last observation');
    if (state.chartType === 'candles' && source.candle && (state.readout.raw.close !== expected.rawValue || state.readout.raw.source !== expected.source)) fail('raw candle readout differs from independent venue close/source');
  }
  const layout = canvas.layout, host = canvas.hostRect, axis = canvas.axisRect, plot = canvas.plotRect;
  if (!hasBox(host) || !hasBox(axis) || !hasBox(plot) || !hasBox(canvas.paintRect)) fail('missing host, plot or price-axis geometry');
  else {
    if (!(layout?.plotWidth > 0 && layout.width > layout.plotWidth)) fail('the engine reserved no price-axis gutter');
    if (plot.left !== host.left || plot.right !== axis.left || axis.right !== host.right) fail('plot and price-axis gutter do not tile the chart host');
    if (!contained(axis, viewport)) fail('price-axis gutter is outside the viewport');
    if (!contained(axis, canvas.paintRect)) fail('price-axis gutter is clipped by an ancestor');
  }
  const surfaces = canvas.ink?.surfaces || [];
  if (!surfaces.length) fail('no native canvas surface was read');
  for (const surface of surfaces) validateAxisInk(surface, canvas, fail);
  if (!surfaces.some(surface => surface.readable && surface.bands.length >= 2)) fail('price-axis gutter shows fewer than two painted label rows');
  for (const issue of state.geometryIssues || []) fail(`geometry: ${issue}`);
  for (const obstacle of state.obstacles || []) if (!hasBox(obstacle.paintRect)) fail(`${obstacle.key}: missing obstacle paint geometry`);
  for (const item of priceAxisOverlapEvidence(state).occlusions) fail(`${item.target}: ${item.category} ${item.obstacle} occludes ${item.area} square CSS pixels`);
  return failures;
}

/** A category absent in a particular viewport is explicitly unobserved.
 * Matrix coverage requires actual paint at least once for every requested
 * category; empty arrays are never advertised as a checked zero occlusion. */
const priceAxisOverlayCategories = Object.freeze(['legend','hud','annotation']);
export function priceAxisOverlayCoverage(cases) {
  const categories = Object.fromEntries(priceAxisOverlayCategories.map(category => {
    const observed = cases.filter(item => item.state?.overlays?.paintObjectCounts?.[category] > 0).map(item => item.id);
    const unobserved = cases.filter(item => !(item.state?.overlays?.paintObjectCounts?.[category] > 0)).map(item => ({id:item.id,reason:item.state?.overlays?.observations?.[category]?.reason || 'no painted evidence'}));
    return [category,{observedCaseCount:observed.length,observedCases:observed,unobservedCases:unobserved}];
  }));
  const missing = Object.keys(categories).filter(category => categories[category].observedCaseCount === 0);
  return {status:missing.length ? 'unverified' : 'passed',categories,missing};
}
