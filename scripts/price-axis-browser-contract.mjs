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

/** The engine draws the number without a currency symbol; its digits must equal the independent source value. */
export const priceAxisLabelText = expected => expected.text.replace(/^\$/, '');

const gutterTargets = state => {
  const labels = state.canvas?.labels, ink = state.canvas?.ink;
  return [
    ...(labels?.ticks || []).map(tick => ({key:tick.key, rect:tick.box})),
    ...(labels?.latest ? [{key:'latest-tag', rect:labels.latest.badge.rect}] : []),
    ...(ink?.rule ? [{key:'frame-axis', rect:ink.rule.rect}] : []),
    ...(ink?.bottomLine ? [{key:'frame-bottom', rect:ink.bottomLine.rect}] : []),
  ];
};
const labelTargets = state => {
  const labels = state.canvas?.labels;
  return [...(labels?.ticks || []), ...(labels?.latest ? [labels.latest] : []), ...(labels?.countdown ? [labels.countdown] : [])].map(item => ({key:item.key, rect:item.box}));
};

/** Painted overlays that touch a tick label, the last-price tag or a frame line occlude them: any positive area fails
 * and touching is allowed. Two labels, or a label and the tag, that share area collide. Overlap with the rest of the
 * gutter strip, which holds nothing, is recorded and does not fail. */
export function priceAxisOverlapEvidence(state) {
  const targets = gutterTargets(state), occlusions = [], gutterIntrusions = [], labelCollisions = [];
  for (const obstacle of state.obstacles || []) {
    const strip = priceAxisIntersectionArea(state.canvas?.axisRect, obstacle.paintRect);
    if (strip > 0) gutterIntrusions.push({obstacle:obstacle.key,category:obstacle.category,surface:obstacle.surface,area:strip});
    for (const target of targets) {
      const area = priceAxisIntersectionArea(target.rect, obstacle.paintRect);
      if (area > 0) occlusions.push({target:target.key,obstacle:obstacle.key,category:obstacle.category,surface:obstacle.surface,area});
    }
  }
  const labels = labelTargets(state), tag = state.canvas?.labels?.latest?.badge?.rect;
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const area = priceAxisIntersectionArea(labels[i].rect, labels[j].rect);
    if (area > 0) labelCollisions.push({a:labels[i].key, b:labels[j].key, area});
  }
  for (const tick of state.canvas?.labels?.ticks || []) {
    const area = priceAxisIntersectionArea(tick.box, tag);
    if (area > 0) labelCollisions.push({a:tick.key, b:'latest-tag', area});
  }
  return {occlusions,gutterIntrusions,labelCollisions,occludedArea:occlusions.reduce((total, item) => total + item.area, 0),
    intrudedArea:gutterIntrusions.reduce((total, item) => total + item.area, 0)};
}

/** Every value is read from the engine: gutter from its layout, label x from the recorded fillText anchor, tag from the
 * recorded roundRect and its text. Nothing is rounded here. */
export function priceAxisAlignment(state) {
  const canvas = state.canvas, labels = canvas?.labels, host = canvas?.hostRect, axis = canvas?.axisRect, tag = labels?.latest;
  const first = [...(labels?.ticks || [])].filter(tick => tick.ink > 0).sort((a, b) => a.anchor.y - b.anchor.y)[0];
  if (!hasBox(host) || !hasBox(axis) || !first || !tag?.badge?.rect) return null;
  return {
    gutter:host.right - axis.left,
    labelX:first.anchor.x - host.left,
    labelInset:first.anchor.x - axis.left,
    tagLeft:tag.badge.rect.left - host.left,
    tagTextX:tag.anchor.x - host.left,
    tagRightGap:host.right - tag.badge.rect.right,
  };
}

/** Label text is canvas pixels, so each box comes from the recorded draw call and measureText; ink and the center hit
 * are read from the pixels and the document at that box. */
function validateLabel(target, canvas, viewport, fail) {
  const {key, box, ink, hit, fill, alpha} = target;
  if (!(ink > 0) || !(alpha > 0) || /^(?:transparent|rgba\([^)]*,\s*0(?:\.0+)?\s*\))$/.test(fill)) fail(`${key}: price text has no visible fill or stroke ink`);
  if (!hasBox(box) || !contained(box, canvas.hostRect) || !contained(box, viewport)) fail(`${key}: clipped or outside chart/viewport`);
  if (!hasBox(canvas.paintRect) || !contained(box, canvas.paintRect)) fail(`${key}: clipped painted bounds`);
  if (!finite(target.anchor?.x) || !finite(target.anchor?.y)) fail(`${key}: missing raw text anchor`);
  if (box?.left < canvas.axisRect?.left) fail(`${key}: crosses the price gutter boundary`);
  if (!hit || hit.insideHost !== true) fail(`${key}: center hit is not the chart (${hit?.target ?? 'none'})`);
  if (!hit || hit.x !== (box.left + box.right) / 2 || hit.y !== (box.top + box.bottom) / 2) fail(`${key}: center hit did not use raw rectangle center`);
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
  const labels = canvas.labels, ink = canvas.ink;
  if (!canvas.tapInstalled) fail('the canvas draw recorder is not installed');
  if (!labels || !ink) {fail('no price-axis draw calls were recorded for the latest frame');return failures;}
  if (!labels.ticks.length) fail('missing price-axis ticks');
  if (new Set(labels.ticks.map(tick => tick.text)).size !== labels.ticks.length) fail('duplicate painted tick text');
  if (labels.ticks.some(tick => tick.anchor?.x !== labels.ticks[0]?.anchor?.x)) fail('tick x anchors are not aligned');
  for (const tick of labels.ticks) validateLabel(tick, canvas, viewport, fail);
  if (!labels.latest) fail('latest price tag was not painted');
  else {
    const tag = labels.latest, rect = tag.badge.rect;
    if (tag.text.replace(/^\$/, '') !== priceAxisLabelText(expected)) fail(`latest label ${JSON.stringify(tag.text)} does not match ${expected.source} ${expected.date} ${priceAxisLabelText(expected)}`);
    validateLabel(tag, canvas, viewport, fail);
    if (!hasBox(rect) || !contained(rect, canvas.hostRect) || !contained(rect, viewport) || !contained(rect, canvas.paintRect)) fail('latest-tag: clipped or outside chart/viewport');
    if (rect?.left < axis?.left) fail('latest-tag: crosses the price gutter boundary');
    if (!contained(tag.box, rect)) fail('latest: text escapes the price badge');
    if (labels.countdown && !contained(labels.countdown.box, rect)) fail('countdown: text escapes the price badge');
    if (!tag.badge.hit || tag.badge.hit.insideHost !== true) fail(`latest-tag: center hit is not the chart (${tag.badge.hit?.target ?? 'none'})`);
  }
  if (labels.countdown) validateLabel(labels.countdown, canvas, viewport, fail);
  if (!ink.readable) fail('native canvas pixels are unreadable');
  else {
    if (JSON.stringify(ink.ruleColumns) !== '[0]' || !ink.rule) fail(`axis: does not span the complete frame as one continuous rule at the plot boundary (columns ${JSON.stringify(ink.ruleColumns)})`);
    if (!ink.bottomLine) fail('bottom: the frame line does not meet the left frame and price axis');
    if (ink.strayInkPixels !== 0) fail(`canvas paint covers the price axis outside its labels (${ink.strayInkPixels} pixels)`);
  }
  for (const issue of state.geometryIssues || []) fail(`geometry: ${issue}`);
  for (const obstacle of state.obstacles || []) if (!hasBox(obstacle.paintRect)) fail(`${obstacle.key}: missing obstacle paint geometry`);
  const overlap = priceAxisOverlapEvidence(state);
  for (const item of overlap.occlusions) fail(`${item.target}: ${item.category} ${item.obstacle} occludes ${item.area} square CSS pixels`);
  for (const item of overlap.labelCollisions) fail(`${item.a}/${item.b}: labels overlap ${item.area} square CSS pixels`);
  const alignment = priceAxisAlignment(state);
  if (!alignment || Object.values(alignment).some(value => !finite(value)) || !(alignment.gutter > 0)) fail('missing raw alignment measurements');
  return failures;
}

/** ±2 CSS pixels applies only to the requested BTC/ETH layout comparison.
 * It is never reused for occlusion, clipping, overflow, or source identity. */
export function comparePriceAxisStates(btc, eth) {
  const failures = [];
  if (btc?.symbol !== 'BTCUSD' || eth?.symbol !== 'ETHUSD' || btc.width !== eth.width || btc.height !== eth.height) return {deltas:null, failures:['missing same-viewport BTC/ETH pair']};
  const a = priceAxisAlignment(btc), b = priceAxisAlignment(eth);
  if (!a || !b) return {deltas:null, failures:['missing BTC/ETH alignment evidence']};
  const deltas = Object.fromEntries(Object.keys(a).map(key => [key,b[key] - a[key]]));
  for (const [key, value] of Object.entries(deltas)) if (!finite(value) || Math.abs(value) > 2) failures.push(`${key}: BTC/ETH difference ${value} exceeds 2 CSS pixels`);
  return {btc:a, eth:b, deltas, failures};
}

/** A category absent in a particular viewport is explicitly unobserved.
 * Matrix coverage requires actual paint at least once for every requested
 * category; empty arrays are never advertised as a checked zero occlusion. */
const priceAxisOverlayCategories = Object.freeze(['legend','event','forecast']);
export function priceAxisOverlayCoverage(cases) {
  const categories = Object.fromEntries(priceAxisOverlayCategories.map(category => {
    const observed = cases.filter(item => item.state?.overlays?.paintObjectCounts?.[category] > 0).map(item => item.id);
    const unobserved = cases.filter(item => !(item.state?.overlays?.paintObjectCounts?.[category] > 0)).map(item => ({id:item.id,reason:item.state?.overlays?.observations?.[category]?.reason || 'no painted evidence'}));
    return [category,{observedCaseCount:observed.length,observedCases:observed,unobservedCases:unobserved}];
  }));
  const missing = Object.keys(categories).filter(category => categories[category].observedCaseCount === 0);
  return {status:missing.length ? 'unverified' : 'passed',categories,missing};
}
