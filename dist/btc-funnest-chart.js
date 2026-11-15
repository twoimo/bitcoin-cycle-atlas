import { mountAtlasFunnestChart, ATLAS_FUNNEST_THEME } from './funnest-chart-runtime.bundle.js';
import { createPriceDisplay, formatDisplayPrice } from './price-display.js?v=1.29.0';
import { barPriceChange } from './chart-math.js?v=1.29.0';
import { resolveMagnetPoint, advanceMeasurement } from './chart-magnet.js?v=1.29.0';
import { EVENT_COLORS, historicalMarkersMarkup } from './chart-overlays.js?v=1.29.0';
import { milestoneMarkersMarkup } from './cycle-milestones-view.js?v=1.29.0';
import { cycleIntervalsOverlayMarkup } from './cycle-interval-overlay.js?v=1.31.3';

const DAY = 86_400_000;
let nextBtcRenderInstance = 1;
const NS = 'http://www.w3.org/2000/svg';
const finitePositive = value => Number.isFinite(value) && value > 0;
const utcMs = date => {
  const text = typeof date === 'string' ? date : '';
  const value = typeof date === 'number' ? date : /^\d{4}-\d{2}-\d{2}$/u.test(text) ? Date.parse(`${text}T00:00:00Z`) : Date.parse(text);
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`Invalid BTC chart UTC date: ${date}`);
  return value;
};
const dateText = row => row.endDate ?? row.date ?? new Date(row.time * 1000).toISOString().slice(0, 10);
const sourceName = value => typeof value === 'string' ? value : value?.name ?? value?.label ?? value?.provider ?? '관측 자료';
const timeMs = row => Number.isSafeInteger(row.time) ? row.time * 1000 : utcMs(dateText(row));

/** Select the last observed Coin Metrics close in each UTC week; gaps remain absent. */
export function atlasBtcClosePoints(rows, frequency = 'daily') {
  if (!Array.isArray(rows)) throw new TypeError('BTC close series must be an array');
  const ordered = rows.map((row, index) => {
    const time = utcMs(row?.date), close = row?.price;
    if (!finitePositive(close)) throw new TypeError(`Invalid Coin Metrics close at index ${index}`);
    return { time, close, date: String(row.date).slice(0, 10) };
  });
  for (let i = 1; i < ordered.length; i++) if (ordered[i].time <= ordered[i - 1].time) throw new RangeError(`Coin Metrics close dates are not strictly increasing at index ${i}`);
  if (frequency === 'daily') return ordered;
  if (frequency !== 'weekly') throw new RangeError(`Unsupported close frequency: ${frequency}`);
  const weeks = new Map();
  for (const row of ordered) {
    const day = Math.floor(row.time / DAY), monday = day - ((day + 3) % 7 + 7) % 7;
    weeks.set(monday, row);
  }
  return [...weeks.values()];
}

/** Validate source OHLCV and convert seconds-based Atlas candles to Funnest UTC-ms bars. */
export function atlasBtcCandles(candles) {
  if (!Array.isArray(candles)) throw new TypeError('BTC observed candles must be an array');
  let previous = -Infinity;
  return candles.map((row, index) => {
    const time = timeMs(row);
    if (time <= previous) throw new RangeError(`BTC candle times are not strictly increasing at index ${index}`);
    const bar = { time, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume };
    if (!Object.values(bar).every(Number.isFinite) || bar.low <= 0 || bar.volume < 0 || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) throw new TypeError(`Invalid observed BTC OHLCV at index ${index}`);
    previous = time;
    return { ...bar, date: dateText(row), startDate: row.startDate ?? row.periodStartDate ?? dateText(row), endDate: row.endDate ?? dateText(row), sourceRow: row };
  });
}

function rangeTime(value, end = false) {
  if (typeof value === 'number') return value * 1000 + (end ? DAY - 1 : 0);
  return utcMs(value) + (end ? DAY - 1 : 0);
}
function scaleValue(value, display) { return display.toDisplay(value); }
function svgLabelWidth11(text) { return [...String(text)].reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 11 : 6.6), 0); }
function gapSize(frequency) { return /^\d+(m|h)$/.test(frequency) ? Number(frequency.slice(0, -1)) * (frequency.endsWith('h') ? 3_600_000 : 60_000) : frequency === 'weekly' ? 7 * DAY : DAY; }
function svgNode(doc, tag, attrs = {}, text) {
  const node = doc.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

const annotationIdentity = node => {
  if (node.nodeType !== 1) return null;
  const target = node.getAttribute('data-btc-overlay-target');
  if (target) return `target:${target}:${node.getAttribute('data-id') || ''}`;
  for (const attribute of ['data-cycle-interval', 'data-history-event-label', 'data-cycle-marker-label']) {
    const value = node.getAttribute(attribute);
    if (value !== null) return `${attribute}:${value}`;
  }
  return null;
};

// Reconcile the real SVG nodes in place. Equal nodes receive no DOM writes,
// while matching identities keep focus as their real geometry/ARIA is updated.
function reconcileAnnotationNode(current, desired) {
  if (current.nodeType !== desired.nodeType || current.nodeName !== desired.nodeName) return desired;
  if (current.nodeType === 1) {
    const desiredAttrs = new Map([...desired.attributes].map(attribute => [attribute.name, attribute.value]));
    for (const attribute of [...current.attributes]) if (!desiredAttrs.has(attribute.name)) current.removeAttribute(attribute.name);
    for (const [name, value] of desiredAttrs) if (current.getAttribute(name) !== value) current.setAttribute(name, value);
    reconcileAnnotationChildren(current, [...desired.childNodes]);
  } else if (current.data !== desired.data) current.data = desired.data;
  return current;
}

function reconcileAnnotationChildren(parent, desiredChildren) {
  const existing = [...parent.childNodes], keyed = new Map();
  for (const node of existing) { const key = annotationIdentity(node); if (key !== null) keyed.set(key, node); }
  const used = new Set();
  desiredChildren.forEach((desired, index) => {
    const key = annotationIdentity(desired);
    let current = key !== null ? keyed.get(key) : null;
    if (current && used.has(current)) current = null;
    if (!current && key === null) {
      const positional = parent.childNodes[index];
      if (positional && !used.has(positional) && annotationIdentity(positional) === null && positional.nodeType === desired.nodeType && positional.nodeName === desired.nodeName) current = positional;
      else current = existing.find(node => !used.has(node) && annotationIdentity(node) === null && node.nodeType === desired.nodeType && node.nodeName === desired.nodeName) || null;
    }
    const node = current ? reconcileAnnotationNode(current, desired) : desired;
    used.add(node);
    if (parent.childNodes[index] !== node) parent.insertBefore(node, parent.childNodes[index] || null);
  });
  for (const node of [...parent.childNodes]) if (!used.has(node)) parent.removeChild(node);
}

const timingStateLabels = Object.freeze({ shortened: '단축 가정', aligned: '기준 범위', lengthened: '연장 가정', insufficient: '근거 부족' });
const timingStateColors = Object.freeze({ shortened: '#df7c83', aligned: '#65c3a5', lengthened: '#74a7ee', insufficient: '#8290a3' });

/** Map replay boundary dates through the current Funnest PaneCoords time scale. */
export function mapAtlasReplayBoundaries(boundaries = [], coords, { start = null, end = null } = {}) {
  if (!Array.isArray(boundaries) || !coords || typeof coords.timeToX !== 'function') throw new TypeError('Replay boundaries require Funnest pane coordinates');
  return boundaries.filter(item => item && typeof item.date === 'string' && (!start || item.date >= start) && (!end || item.date <= end))
    .map(item => ({ ...item, x: coords.timeToX(utcMs(item.date)) }))
    .filter(item => Number.isFinite(item.x) && item.x >= 0 && item.x <= coords.plotWidth);
}

/** Preserve the old replay ribbon's causal, daily, contiguous-state grouping. */
export function mapAtlasReplayTimingRows(cycleCalibration, coords, { cursorDate, start = null, end = null } = {}) {
  if (!cycleCalibration || !Array.isArray(cycleCalibration.series) || !coords || typeof coords.timeToX !== 'function') return [];
  if (cursorDate) utcMs(cursorDate);
  const valid = cycleCalibration.series.filter(point => point?.causal === true && typeof point.date === 'string' &&
    (!cursorDate || point.date <= cursorDate) && (!start || point.date >= start) && (!end || point.date <= end) && Number.isFinite(point.shiftDays))
    .filter(point => { const x = coords.timeToX(utcMs(point.date)); return Number.isFinite(x) && x >= 0 && x <= coords.plotWidth; });
  const groups = [];
  for (const point of valid) {
    const epochDay = Number.isFinite(point.epochDay) ? point.epochDay : Math.floor(utcMs(point.date) / DAY);
    const previous = groups.at(-1);
    if (previous && previous.state === point.state && epochDay === previous.lastEpochDay + 1) {
      previous.end = point; previous.lastEpochDay = epochDay; previous.rows.push(point);
      previous.shiftLow = Math.min(previous.shiftLow, point.shiftDays); previous.shiftHigh = Math.max(previous.shiftHigh, point.shiftDays);
    } else groups.push({ start: point, end: point, state: point.state, lastEpochDay: epochDay, rows: [point], shiftLow: point.shiftDays, shiftHigh: point.shiftDays });
  }
  const splitX = cursorDate ? coords.timeToX(utcMs(cursorDate)) : coords.plotWidth;
  const observedRight = Number.isFinite(splitX) ? Math.min(coords.plotWidth, splitX) : coords.plotWidth;
  return groups.map(group => {
    const x1 = coords.timeToX(utcMs(group.start.date));
    const nextX = coords.timeToX(utcMs(group.end.date) + DAY);
    const x2 = Math.min(observedRight, nextX);
    return { ...group, x: x1, width: Math.max(0, x2 - x1), label: timingStateLabels[group.state] ?? timingStateLabels.insufficient,
      color: timingStateColors[group.state] ?? timingStateColors.insufficient };
  }).filter(group => Number.isFinite(group.x) && Number.isFinite(group.width) && group.x >= 0 && group.x <= coords.plotWidth && group.x <= observedRight && group.width >= 0);
}

function sourcePointDetail(row, prior, display, { frequency, source, kind = 'observed' } = {}) {
  const price = row?.price ?? row?.close;
  const change = barPriceChange(price, prior?.close ?? prior?.price, row?.open);
  const detail = {
    date: row?.date ?? row?.endDate ?? new Date(row.time).toISOString().slice(0, 10),
    price, displayedPrice: display.toDisplay(price), display: display.metadata, kind,
    source: source?.name ?? source?.label ?? source ?? '관측 자료', frequency, ...change,
  };
  if (Number.isFinite(row?.open)) Object.assign(detail, { open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume, source: detail.source, interval: frequency, completed: row.complete !== false });
  return detail;
}

/** Mount the active BTC price path on the pinned Funnest engine; no legacy price/axis painter runs. */
export function mountAtlasBtcFunnestChart({
  container, svg, sourceMode = 'close-only', observedRows = [], observedCandles = [], candleSource = 'Bitstamp', closeSource = 'Coin Metrics',
  frequency = 'daily', chartType = 'line', start, end, forecast = [], retrospective = [], band = true,
  events = [], historicalEvents = [], turns = [], cycleMarkers = [], cycleIntervals = [], cycleClockAnchors = [], cyclePeriodComparisons = null, cycleRelation = 'all', cycleOverlayObstacles = [], activeCycleInterval = null, activeCycleMarkerId = null, activeCycleMarkerIds = [], activeHistoricalEventId = null,
  forecastEvidence = [], researchAnnotations = [], activeAnnotationId = null, selectedDate = null, scale = 'log', invertScale = false,
  priceDomain = null, priceOnlyAuto = false, unit = 'usd', denominator = null, denominatorDate = null,
  volumeBars = [], volumeSource = candleSource, showVolume = false, tool = 'crosshair', magnet = 'off', measurement = null,
  states = [], showStates = false, showDrawdown = false, fib = [], nextTurn = null, onNextTurn = () => {},
  onHover = () => {}, onInspect = () => {}, onAnnotation = () => {}, onMeasurement = () => {},
  onHistoricalEvent = () => {}, onForecastEvidence = () => {}, onCycleMarker = () => {}, onCycleInterval = () => {},
  onCycleClock = () => {}, onViewport = () => {}, onAnnotationCounts = () => {}, source = {},
  replayBoundaries = [], cycleCalibration = null, showCycleTiming = false, replayCursorDate = null, selectionPreview = false,
} = {}) {
  if (!container?.ownerDocument || !svg || svg.parentElement !== container) throw new TypeError('BTC Funnest chart requires the chart stage and its SVG overlay');
  const intraday = !['daily', 'weekly'].includes(frequency);
  let rawRows, bars, observations, actualSource;
  if (sourceMode === 'ohlc') {
    rawRows = atlasBtcCandles(observedCandles);
    if (!rawRows.length) throw new RangeError('BTC OHLC mode requires actual source candles');
    observations = rawRows.map(row => ({ ...row })); actualSource = candleSource;
  } else if (sourceMode === 'close-only') {
    rawRows = atlasBtcClosePoints(observedRows, frequency).map(row => ({ ...row, price: row.close }));
    if (!rawRows.length) throw new RangeError('BTC close-only mode requires actual Coin Metrics closes');
    observations = rawRows.map(row => ({ time: row.time, close: row.close, date: row.date })); actualSource = sourceName(closeSource);
  } else throw new RangeError(`Unsupported BTC source mode: ${sourceMode}`);

  const bridgeRows = sourceMode === 'ohlc' && observedRows.length && !intraday
    ? atlasBtcClosePoints(observedRows, frequency).filter(row => row.date >= (rawRows.at(-1)?.endDate ?? rawRows.at(-1)?.date ?? ''))
    : [];
  const volumeByDate = new Map(volumeBars.map(row => [row.endDate ?? row.date, row]));
  const display = createPriceDisplay({ unit, rows: rawRows.concat(bridgeRows).map(row => ({ date: row.date, price: row.price ?? row.close })), denominator, denominatorDate, scale });
  const volumeByTime = sourceMode === 'close-only' && showVolume ? rawRows.map(row => ({ time: row.time, volume: volumeByDate.get(row.date)?.volume })).filter(row => Number.isFinite(row.volume)) : null;
  const effectiveScale = display.effectiveScale === 'log' ? 'log' : 'normal';
  const toEngineBar = row => sourceMode === 'close-only'
    ? { time: row.time, close: scaleValue(row.close, display) }
    : { time: row.time, open: scaleValue(row.open, display), high: scaleValue(row.high, display), low: scaleValue(row.low, display), close: scaleValue(row.close, display), volume: row.volume };
  bars = rawRows.map(toEngineBar);
  const forecastRows = forecast.filter(row => row?.date && finitePositive(row.price)).map(row => ({ ...row, time: utcMs(row.date) }));
  const retrospectiveRows = retrospective.filter(row => row?.date && finitePositive(row.price)).map(row => ({ ...row, time: utcMs(row.date) }));
  const eventRows = [...events.map(row => ({ ...row, kind: 'forecast' })), ...historicalEvents.map(row => ({ ...row, kind: 'historical' }))].filter(row => row?.date).map(row => ({ ...row, time: utcMs(row.date) }));
  const turnsRows = turns.filter(row => row?.date && finitePositive(row.price)).map(row => ({ ...row, time: utcMs(row.date) }));
  const markerRows = cycleMarkers.filter(row => row?.date && finitePositive(row.price)).map(row => ({ ...row, time: utcMs(row.date) }));
  const intervalRows = cycleIntervals.filter(row => row?.startDate && row?.endDate && row.endDate >= row.startDate).map(row => ({ ...row, startTime: utcMs(row.startDate), endTime: utcMs(row.endDate) }));
  const clockRows = cycleClockAnchors.filter(row => row?.date).map(row => ({ ...row, time: utcMs(row.date) }));
  const evidenceRows = forecastEvidence.filter(row => row?.date).map(row => ({ ...row, time: utcMs(row.date) }));
  const annotationRows = researchAnnotations.filter(row => row?.start?.date && row?.end?.date).map(row => ({ ...row, startTime: utcMs(row.start.date), endTime: utcMs(row.end.date) }));
  const selectedRows = [
    ...rawRows.map(row => ({ ...row, kind: 'observed', price: row.price ?? row.close })),
    ...bridgeRows.map(row => ({ ...row, kind: 'observed-line', price: row.close })),
    ...forecastRows.map(row => ({ ...row, kind: 'simulated' })),
    ...retrospectiveRows.map(row => ({ ...row, kind: 'retrospective' })),
  ].sort((a, b) => a.time - b.time || (a.kind.startsWith('observed') ? -1 : 1));
  const uniqueRows = selectedRows.filter((row, index) => index === 0 || row.time !== selectedRows[index - 1].time || row.kind !== selectedRows[index - 1].kind);
  const latestObservedTime = Math.max(rawRows.at(-1).time, bridgeRows.at(-1)?.time ?? -Infinity);
  const futureSelectionRows = uniqueRows.filter(row => row.kind === 'simulated' && row.time > latestObservedTime);
  const displayUnit = new Map(rawRows.map(row => [row.time, row]));
  const nativeBarsByDate = new Map(rawRows.map(row => [row.date, row]));
  const nativeCrosshairMatchesPointer = detail => {
    if (!pointerDetail) return true;
    const row = nativeBarsByDate.get(pointerDetail.date);
    return pointerDetail.kind === 'observed' && row?.time === detail?.bar?.time;
  };
  const resolveThemeColor = (property, fallback) => {
    const probe = container.ownerDocument.createElement('span'); probe.style.cssText = `position:absolute;visibility:hidden;color:var(${property},${fallback})`; container.append(probe);
    const color = getComputedStyle(probe).color; probe.remove(); return color || fallback;
  };
  const background = resolveThemeColor('--bg', '#17171c');
  const lineColor = resolveThemeColor('--accent-ink', '#74a7ee');
  const chartTheme = { ...ATLAS_FUNNEST_THEME, accent: lineColor, background, surface: resolveThemeColor('--surface-raised', background), text: resolveThemeColor('--text', '#e4e4e5'), textSecondary: resolveThemeColor('--muted', '#7e7e87'), grid: resolveThemeColor('--border', '#2c2c35'), border: resolveThemeColor('--border', '#2c2c35') };
  const initialRange = start && end ? { from: rangeTime(start), to: rangeTime(end, true) } : null;
  let destroyed = false, pointerDetail = null, futurePointerActive = false, nativeInputCanvas = null, clearingNativeCrosshair = false;
  const clearNativeCrosshair = () => {
    if (clearingNativeCrosshair || !nativeInputCanvas) return;
    const win = svg.ownerDocument.defaultView; if (!win?.PointerEvent) return;
    clearingNativeCrosshair = true;
    nativeInputCanvas.dispatchEvent(new win.PointerEvent('pointerleave', { bubbles: false, pointerId: 1, pointerType: 'mouse' }));
    clearingNativeCrosshair = false;
  };
  const hideFuturePreview = ({ clearPointer = false } = {}) => {
    futurePointerActive = false; futurePreviewLayer.setAttribute('display', 'none');
    if (clearPointer) pointerDetail = null;
  };
  const mounted = mountAtlasFunnestChart(container, {
    bars, sourceMode, chartType: sourceMode === 'close-only' ? 'line' : chartType, symbol: 'BTCUSD', currency: unit === 'usd' ? 'USD' : unit,
    timezone: 'UTC', locale: 'ko', precision: unit === 'usd' ? 2 : 2, tickSize: unit === 'usd' ? 0.01 : 0.01,
    scale: effectiveScale, invertScale, range: initialRange, theme: chartTheme, volume: showVolume, volumeByTime, volumeSource: sourceMode === 'close-only' && showVolume ? volumeSource : actualSource,
    source: { name: actualSource, ...source, ...(bridgeRows.length ? { bridgeSource: 'Coin Metrics', bridgeCloseOnlyRows: bridgeRows.length } : {}), ...(sourceMode === 'close-only' && showVolume ? { volumeSource: { name: volumeSource, scope: 'BTC-USD 단일 거래소 거래량', rows: volumeByTime.length } } : {}) }, accessibleName: `비트코인 ${sourceMode === 'ohlc' ? '실제 OHLC 가격 차트' : `${actualSource} 실제 일말 종가 차트`}`,
    onCrosshair: detail => {
      if (destroyed || selectionPreview) return;
      if (futurePointerActive) { if (detail?.bar) clearNativeCrosshair(); return; }
      if (!detail?.bar) return;
      if (!nativeCrosshairMatchesPointer(detail)) { clearNativeCrosshair(); return; }
      const row = displayUnit.get(detail.bar.time);
      if (row) {
        const index = rawRows.indexOf(row), prior = rawRows[index - 1];
        onHover(sourcePointDetail(row, prior, display, { frequency, source: actualSource }));
      }
    },
    onViewport: next => onViewport(mounted?.chart?.getVisibleTimeRange?.() ?? next),
  });
  const host = mounted.host;
  nativeInputCanvas = [...host.querySelectorAll('canvas')].at(-1) || null;
  const timingPaneHeight = showCycleTiming && Array.isArray(cycleCalibration?.series) ? 42 : 0;
  if (timingPaneHeight) host.style.bottom = `${timingPaneHeight}px`;
  const replayBoundaryLayer = svgNode(svg.ownerDocument, 'g', { 'data-replay-boundaries': 'true', 'pointer-events': 'none' });
  const replayTimingLayer = svgNode(svg.ownerDocument, 'g', { 'data-replay-cycle-timing': 'true', role: 'img', 'aria-label': '사이클 시계 · 관측 기반 보정 · 매매 신호 아님', 'pointer-events': 'none' });
  svg.style.position = 'absolute'; svg.style.inset = '0'; svg.style.zIndex = '2'; svg.style.pointerEvents = 'auto';
  svg.setAttribute('viewBox', '0 0 1000 500');
  svg.dataset.chartEngine = 'funnest'; svg.dataset.observedMode = sourceMode; svg.dataset.source = actualSource; svg.dataset.replaySelectionPreview = String(Boolean(selectionPreview));
  svg.dataset.observedCandleCount = sourceMode === 'ohlc' ? String(rawRows.length) : '0';
  svg.dataset.observedLineCount = sourceMode === 'close-only' ? String(rawRows.length) : String(bridgeRows.length);
  svg.dataset.chartType = sourceMode === 'close-only' ? 'line' : chartType;
  svg.dataset.scale = effectiveScale; svg.dataset.invertScale = String(Boolean(invertScale));

  let activeAnnotationIdLocal = activeAnnotationId, activeSelection = selectedDate ?? rawRows.at(-1).date;
  let targetItems = [], lastCoords = null;
  let cycleOverlayObstaclesLocal = Array.isArray(cycleOverlayObstacles) ? [...cycleOverlayObstacles] : [];
  const renderInstance = nextBtcRenderInstance++;
  let renderSequence = 0, paintOrder = 0, lastBands = null, lastOverlay = null;
  const targetLayer = svgNode(svg.ownerDocument, 'g', { 'data-funnest-hit-targets': 'true' });
  const futurePreviewLayer = svgNode(svg.ownerDocument, 'g', { 'data-btc-future-preview': 'true', class: 'btc-future-cross', 'pointer-events': 'none', 'aria-hidden': 'true', display: 'none' });
  const futureVertical = svgNode(svg.ownerDocument, 'line', { stroke: '#e2b66c', 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: .72 });
  const futureHorizontal = svgNode(svg.ownerDocument, 'line', { stroke: '#e2b66c', 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: .5 });
  const futurePoint = svgNode(svg.ownerDocument, 'circle', { r: 4, fill: background, stroke: '#e2b66c', 'stroke-width': 1.5 });
  const futureLabel = svgNode(svg.ownerDocument, 'text', { fill: '#f0c87e', stroke: background, 'stroke-width': 3, 'paint-order': 'stroke', 'font-size': 11, 'font-weight': 600, 'pointer-events': 'none' });
  futurePreviewLayer.append(futureVertical, futureHorizontal, futurePoint, futureLabel);
  const annotationLabelLayer = svgNode(svg.ownerDocument, 'g', { 'data-funnest-annotation-labels': 'true', 'pointer-events': 'none' });
  const intervalLayer = svgNode(svg.ownerDocument, 'g', { 'data-funnest-cycle-intervals': 'true' });
  Object.assign(svg.dataset, { historyLabelCount: '0', historyEventCount: '0', historyLabelMode: 'off', historyHiddenLabelCount: '0', cycleMarkerCount: '0', cycleMarkerLabelCount: '0', cycleIntervalCount: '0', cycleIntervalLabelCount: '0' });
  svg.append(targetLayer, annotationLabelLayer, intervalLayer, replayBoundaryLayer, replayTimingLayer, futurePreviewLayer);
  const forecastValueRows = [...forecastRows, ...retrospectiveRows];
  const expectedGap = gapSize(frequency);
  // Funnest invokes this real underlay before its observed-price series.
  const bandOverlay = {
    layer: 'below',
    render({ coords, painter }) {
      if (destroyed) return;
      const receipt = { layer: 'below', order: ++paintOrder, forecast: null, retrospective: null };
      const drawBand = (rows, key) => {
        if (!band || rows.length < 2) return;
        const points = rows.filter(row => Number.isFinite(row.lower) && Number.isFinite(row.upper) && row.lower > 0 && row.upper >= row.lower);
        if (points.length < 2) return;
        const upper = points.map(row => ({ time: row.time, date: row.date, value: row.upper, x: coords.timeToX(row.time), y: coords.priceToY(scaleValue(row.upper, display)) }));
        const lower = points.map(row => ({ time: row.time, date: row.date, value: row.lower, x: coords.timeToX(row.time), y: coords.priceToY(scaleValue(row.lower, display)) })).reverse();
        const polygon = [...upper, ...lower];
        if (!polygon.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return;
        const ctx = painter.ctx, color = 'rgba(199,155,75,.14)';
        ctx.save(); ctx.beginPath(); ctx.moveTo(polygon[0].x, polygon[0].y);
        for (const point of polygon.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
        receipt[key] = { layer: 'below', order: ++paintOrder, color, polygon, sourceCount: points.length };
      };
      drawBand(forecastRows, 'forecast'); drawBand(retrospectiveRows, 'retrospective');
      lastBands = receipt;
    },
  };
  const bandOverlayHandle = mounted.addOverlay(bandOverlay);
  const overlay = {
    layer: 'above',
    render({ coords, painter }) {
      if (destroyed) return;
      lastCoords = coords;
      const receipt = { sequence: ++renderSequence, layer: 'above', order: ++paintOrder, paths: {}, markers: [], intervals: [], turns: [], boundaries: [], measurements: [], snapFeedback: null, bands: lastBands };
      lastOverlay = receipt;
      const boundaryRows = mapAtlasReplayBoundaries(replayBoundaries, coords, { start, end });
      replayBoundaryLayer.replaceChildren(...boundaryRows.map(item => {
        const color = item.color === 'var(--muted)' ? chartTheme.textSecondary : item.color === 'var(--data-gold)' ? '#e2b66c' : item.color === 'var(--text)' ? chartTheme.text : item.color || chartTheme.textSecondary;
        painter.vLine(item.x, 0, coords.height, color, [3, 5]);
        receipt.boundaries.push({ ...item, color, dash: [3, 5], top: 0, bottom: coords.height, layer: 'above', order: ++paintOrder });
        const group = svgNode(svg.ownerDocument, 'g', { role: 'img', 'aria-label': `${item.label} ${item.date}`, 'data-date': item.date, 'data-x': item.x, 'data-replay-boundary': item.name || 'boundary' });
        group.append(svgNode(svg.ownerDocument, 'title', {}, `${item.label} ${item.date}`));
        return group;
      }));
      const timingRows = timingPaneHeight ? mapAtlasReplayTimingRows(cycleCalibration, coords, { cursorDate: replayCursorDate, start, end }) : [];
      const layoutHeight = Number(mounted.chart.layout?.height) || 0;
      replayTimingLayer.replaceChildren();
      if (timingPaneHeight) {
        const title = svgNode(svg.ownerDocument, 'text', { x: 8, y: layoutHeight + 10, fill: chartTheme.textSecondary, 'font-size': 11, 'data-cycle-timing-title': 'true' }, '사이클 시계 · 관측 보정');
        title.append(svgNode(svg.ownerDocument, 'title', {}, '사이클 시계 · 관측 기반 보정 · 매매 신호 아님'));
        replayTimingLayer.append(title);
        if (timingRows.length) for (const row of timingRows) {
          const rect = svgNode(svg.ownerDocument, 'rect', { x: row.x, y: layoutHeight + 17, width: row.width, height: 12, fill: row.color,
            'data-cycle-state': row.state, 'data-cycle-start': row.start.date, 'data-cycle-end': row.end.date,
            'data-cycle-shift-low': row.shiftLow, 'data-cycle-shift-high': row.shiftHigh, 'data-cycle-row-count': row.rows.length });
          rect.append(svgNode(svg.ownerDocument, 'title', {}, `${row.start.date}–${row.end.date} UTC · ${row.label} · 시계 이동 ${row.shiftLow.toFixed(1)}–${row.shiftHigh.toFixed(1)}일. 각 날짜까지 확인된 자료로 계산한 보정이며 매매 신호·확률구간이 아닙니다.`));
          replayTimingLayer.append(rect);
        } else replayTimingLayer.append(svgNode(svg.ownerDocument, 'text', { x: 16, y: layoutHeight + 28, fill: chartTheme.textSecondary, 'font-size': 11 }, '이 구간에는 완료된 관측 보정이 없습니다.'));
      }
      svg.dataset.replayBoundaryCount = String(boundaryRows.length);
      svg.dataset.replayCycleTimingCount = String(timingRows.reduce((sum, row) => sum + row.rows.length, 0));
      const ctx = painter.ctx;
      const path = (rows, field, color, width, dash = [], key = 'bridge', contrast = false) => {
        const subpaths = []; let current = null, previousTime = null;
        for (const row of rows) {
          const value = row[field];
          if (!Number.isFinite(value) || value <= 0) { current = null; previousTime = null; continue; }
          const x = coords.timeToX(row.time), y = coords.priceToY(scaleValue(value, display));
          if (!Number.isFinite(x) || !Number.isFinite(y)) { current = null; previousTime = null; continue; }
          if (!current || previousTime === null || row.time - previousTime > expectedGap * 1.5) { current = []; subpaths.push(current); }
          current.push({ time: row.time, date: row.date, value, x, y }); previousTime = row.time;
        }
        const strokes = [];
        for (const stroke of [...(contrast ? [{ color: background, width: width + 3, kind: 'halo' }] : []), { color, width, kind: 'path' }]) {
          ctx.save(); ctx.beginPath(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(dash);
          for (const points of subpaths) { ctx.moveTo(points[0].x, points[0].y); for (const point of points.slice(1)) ctx.lineTo(point.x, point.y); }
          if (subpaths.length) ctx.stroke(); ctx.restore();
          strokes.push({ ...stroke, dash: [...dash], layer: 'above', order: ++paintOrder });
        }
        receipt.paths[key] = { subpaths, strokes, sourceCount: rows.length, coordinateBasis: 'actual CanvasRenderingContext2D path arguments' };
      };
      if (bridgeRows.length) path(bridgeRows, 'close', lineColor, 1.9);
      path(forecastRows, 'price', '#e2b66c', 1.8, [7, 5], 'forecast', true);
      path(retrospectiveRows, 'price', '#74a7ee', 1.7, [1, 5], 'retrospective', true);
      const actualRows = rawRows.filter(row => Number.isFinite(row.price ?? row.close) && (row.price ?? row.close) > 0);
      const hasAnnotationDomain = typeof start === 'string' && typeof end === 'string';
      const historicalAnchors = historicalEvents.filter(event => hasAnnotationDomain && event?.date && event.date >= start && event.date <= end && actualRows.length)
        .map(event => {
          const time = utcMs(event.date);
          let nearest = actualRows[0], distance = Math.abs(nearest.time - time);
          for (const row of actualRows.slice(1)) { const next = Math.abs(row.time - time); if (next < distance) { nearest = row; distance = next; } }
          return { event, x: coords.timeToX(time), y: coords.priceToY(scaleValue(nearest.price ?? nearest.close, display)) };
        }).filter(anchor => anchor.event.date >= actualRows[0].date && anchor.event.date <= (actualRows.at(-1).endDate ?? actualRows.at(-1).date));
      const historyLayout = historicalMarkersMarkup(historicalAnchors, { left: 0, right: coords.plotWidth, top: 5, bottom: coords.height - 4, activeEventId: activeHistoricalEventId, ...(hasAnnotationDomain ? { visibleSpanDays: Math.max(1, (utcMs(end) - utcMs(start)) / DAY) } : {}) });
      const annotationLabels = [];
      for (const marker of historyLayout.markers) {
        const override = marker.event.category && EVENT_COLORS[marker.event.category];
        const color = typeof override === 'string' ? override : EVENT_COLORS[marker.event.category] || EVENT_COLORS.market;
        painter.circle(marker.x, marker.y, marker.active ? 5 : 4, marker.active ? `${color}44` : background, color, marker.active ? 2.2 : 1.5);
        receipt.markers.push({ id: marker.event.id, date: marker.event.date, x: marker.x, y: marker.y, radius: marker.active ? 5 : 4, color, type: 'history', active: Boolean(marker.active), layer: 'above', order: ++paintOrder });
        if (marker.box) {
          const label = svgNode(svg.ownerDocument, 'g', { 'data-history-event-label': marker.event.id || '', 'pointer-events': 'none' });
          label.append(svgNode(svg.ownerDocument, 'path', { d: `M${marker.x},${marker.y}L${marker.box.x + marker.box.width / 2},${marker.box.y + 22}`, fill: 'none', stroke: color, 'stroke-width': .8, opacity: .7 }));
          label.append(svgNode(svg.ownerDocument, 'rect', { x: marker.box.x, y: marker.box.y, width: marker.box.width, height: marker.box.height, rx: 4, fill: chartTheme.surface, 'fill-opacity': .96, stroke: color, 'stroke-opacity': .65 }));
          label.append(svgNode(svg.ownerDocument, 'text', { x: marker.box.x + marker.box.width / 2, y: marker.box.y + 15, 'text-anchor': 'middle', fill: color, 'font-size': 11 }, marker.label));
          annotationLabels.push(label);
        }
      }
      for (const row of eventRows) {
        if (row.kind === 'historical') continue;
        const x = coords.timeToX(row.time); if (!Number.isFinite(x) || x < 0 || x > coords.plotWidth) continue;
        painter.vLine(x, 0, coords.height, '#bca176', [2, 6]);
      }
      svg.dataset.historyLabelCount = String(historyLayout.labelCount);
      svg.dataset.historyEventCount = String(historyLayout.totalCount);
      svg.dataset.historyLabelMode = historyLayout.totalCount ? historyLayout.labelMode : 'off';
      svg.dataset.historyHiddenLabelCount = String(historyLayout.hiddenLabelCount);
      for (const row of clockRows) { const x = coords.timeToX(row.time); if (Number.isFinite(x) && x >= -12 && x <= coords.plotWidth + 12) painter.vLine(x, 0, Math.min(24, coords.height), '#9ab0cc', [3, 4]); }

      for (const row of turnsRows) {
        const x = coords.timeToX(row.time), y = coords.priceToY(scaleValue(row.price, display));
        if (Number.isFinite(x) && Number.isFinite(y)) { painter.circle(x, y, 3, row.type === 'high' ? '#e7bb73' : '#85bfdc', background, 1); receipt.turns.push({ date: row.date, time: row.time, kind: row.kind ?? null, type: row.type, x, y, radius: 3, layer: 'above', order: ++paintOrder }); }
      }
      const cycleLayout = milestoneMarkersMarkup({ markers: markerRows, start, end, x: marker => coords.timeToX(utcMs(marker.date)), y: price => coords.priceToY(scaleValue(price, display)), left: 0, right: coords.plotWidth, top: 0, bottom: coords.height, clipId: `${svg.id || 'btc'}-milestones`, activeMarkerId: activeCycleMarkerId, activeMarkerIds: activeCycleMarkerIds, activeInterval: activeCycleInterval });
      const visibleCycleIds = new Set(cycleLayout.markers.map(point => point.marker.id));
      for (const point of cycleLayout.markers) {
        const marker = point.marker, color = point.color, radius = point.radius || 4;
        painter.circle(point.x, point.y, radius + (point.active ? 1 : 0), point.active ? `${color}44` : background, color, point.active ? 2.6 : 1.5);
        receipt.markers.push({ id: marker.id, date: marker.date, time: utcMs(marker.date), x: point.x, y: point.y, radius, color, type: marker.type, active: Boolean(point.active), selectedEndpoint: Boolean(point.selectedEndpoint), layer: 'above', order: ++paintOrder });
        if (point.box) {
          const label = svgNode(svg.ownerDocument, 'g', { 'data-cycle-marker-label': marker.id, class: point.active ? 'is-active' : '', 'pointer-events': 'none' });
          const edgeX = Math.max(point.box.x + 5, Math.min(point.box.x + point.box.width - 5, point.x));
          const edgeY = point.box.y > point.y ? point.box.y : point.box.y + point.box.height;
          label.append(svgNode(svg.ownerDocument, 'path', { d: `M${point.x},${point.y}L${edgeX},${edgeY}`, fill: 'none', stroke: color, 'stroke-width': .8, opacity: .65 }));
          label.append(svgNode(svg.ownerDocument, 'rect', { x: point.box.x, y: point.box.y, width: point.box.width, height: point.box.height, rx: 4, fill: chartTheme.surface, 'fill-opacity': .96, stroke: color, 'stroke-opacity': .45 }));
          label.append(svgNode(svg.ownerDocument, 'text', { x: point.box.x + point.box.width / 2, y: point.box.y + 12.5, 'text-anchor': 'middle', fill: color, 'font-size': 11, 'font-weight': point.active ? 700 : 600 }, point.label));
          annotationLabels.push(label);
        }
      }
      reconcileAnnotationChildren(annotationLabelLayer, annotationLabels);
      svg.dataset.cycleMarkerCount = String(cycleLayout.count);
      svg.dataset.cycleMarkerLabelCount = String(cycleLayout.labelCount);
      const intervalClipId = `${svg.id || 'btc-chart'}-cycle-periods-${renderInstance}`;
      const priceStride = Math.max(1, Math.ceil(selectedRows.length / Math.max(24, coords.plotWidth / 4)));
      const pricePoints = selectedRows.filter((_, index) => index % priceStride === 0 || index === selectedRows.length - 1)
        .map(row => ({ x: coords.timeToX(row.time), y: coords.priceToY(scaleValue(row.price ?? row.close, display)) }));
      const intervalObstacles = [
        ...cycleOverlayObstaclesLocal,
        ...historyLayout.markers.filter(marker => marker.box).map(marker => marker.box),
        ...evidenceRows.flatMap(row => {
          const x = coords.timeToX(row.time), y = finitePositive(row.price) ? coords.priceToY(scaleValue(row.price, display)) : NaN;
          return Number.isFinite(x) && Number.isFinite(y) ? [{ x: x - 10, y: y - 10, width: 20, height: 20 }] : [];
        }),
        ...cycleLayout.markers.flatMap(point => [
          { x: point.x - point.radius - 3, y: point.y - point.radius - 3, width: 2 * point.radius + 6, height: 2 * point.radius + 6 },
          ...(point.box ? [point.box] : []),
        ]),
      ];
      const intervalLayout = cycleIntervalsOverlayMarkup({
        intervals: intervalRows, comparisons: cyclePeriodComparisons, start, end,
        x: point => coords.timeToX(utcMs(point.date)), left: 0, right: coords.plotWidth, top: 0, bottom: coords.height,
        clipId: intervalClipId, relation: cycleRelation,
        activeIntervalId: typeof activeCycleInterval === 'string' ? activeCycleInterval : activeCycleInterval?.id,
        activeMarkerId: activeCycleMarkerId, obstacles: intervalObstacles, pricePoints,
      });
      const intervalChildren = [];
      if (intervalLayout.markup) {
        const defs = svgNode(svg.ownerDocument, 'defs');
        const clipPath = svgNode(svg.ownerDocument, 'clipPath', { id: intervalClipId });
        clipPath.append(svgNode(svg.ownerDocument, 'rect', { x: 0, y: 0, width: coords.plotWidth, height: coords.height }));
        defs.append(clipPath); intervalChildren.push(defs);
        const markupContainer = svgNode(svg.ownerDocument, 'g');
        markupContainer.innerHTML = intervalLayout.markup;
        intervalChildren.push(markupContainer);
      }
      reconcileAnnotationChildren(intervalLayer, intervalChildren);
      for (const item of intervalLayout.items) {
        const interval = item.interval;
        receipt.intervals.push({ id: interval.id, startDate: interval.startDate, endDate: interval.endDate, days: item.days, duration: item.duration,
          x1: item.x1, x2: item.x2, y: item.y, clippedStart: item.clippedStart, clippedEnd: item.clippedEnd,
          labelMode: item.labelMode, labelVisible: Boolean(item.labelBox), coordinateBasis: 'cycleIntervalsOverlayMarkup with current Funnest PaneCoords',
          layer: 'above', order: ++paintOrder });
      }
      receipt.intervalLayout = { visibleCount: intervalLayout.visibleCount, labelCount: intervalLayout.labelCount, hiddenLabelCount: intervalLayout.hiddenLabelCount, bandTop: intervalLayout.bandTop, bandBottom: intervalLayout.bandBottom };
      svg.dataset.cycleIntervalCount = String(intervalLayout.visibleCount);
      svg.dataset.cycleIntervalLabelCount = String(intervalLayout.labelCount);
      if (Number.isFinite(intervalLayout.bandTop) && Number.isFinite(intervalLayout.bandBottom)) {
        svg.dataset.cycleIntervalBandTop = String(intervalLayout.bandTop);
        svg.dataset.cycleIntervalBandBottom = String(intervalLayout.bandBottom);
      }
      for (const row of forecastValueRows) {
        const x = coords.timeToX(row.time), y = coords.priceToY(scaleValue(row.price, display));
        if (Number.isFinite(x) && Number.isFinite(y)) painter.circle(x, y, 2.5, row.replaySource === 'retrospective' ? '#74a7ee' : '#e2b66c');
      }
      for (const row of evidenceRows) {
        const x = coords.timeToX(row.time);
        if (!Number.isFinite(x)) continue;
        if (finitePositive(row.price)) { const y = coords.priceToY(scaleValue(row.price, display)); if (Number.isFinite(y)) painter.circle(x, y, 7, '#202027', '#a8c695', 1.5); }
        else painter.vLine(x, 0, Math.min(28, coords.height), '#a8c695', [2, 4]);
      }
      for (const item of annotationRows) {
        const x1 = coords.timeToX(item.startTime), x2 = coords.timeToX(item.endTime), y1 = coords.priceToY(scaleValue(item.start.price, display)), y2 = coords.priceToY(scaleValue(item.end.price, display));
        if ([x1, x2, y1, y2].every(Number.isFinite)) { painter.line(x1, y1, x2, y2, item.color || '#e2b66c', item.id === activeAnnotationIdLocal ? 2.5 : 1.5, item.kind === 'conditional' ? [5, 4] : []); painter.circle(x1, y1, 3, background, item.color || '#e2b66c', 1); painter.circle(x2, y2, 3, background, item.color || '#e2b66c', 1); }
      }
      if (measurement?.startDate && finitePositive(measurement.startPrice)) {
        const atDate = value => uniqueRows.find(row => row.date === value)?.time ?? utcMs(value);
        const x1 = coords.timeToX(atDate(measurement.startDate)), y1 = coords.priceToY(scaleValue(measurement.startPrice, display));
        if (Number.isFinite(x1) && Number.isFinite(y1)) {
          painter.circle(x1, y1, 4, background, '#e2b66c', 1.5);
          receipt.measurements.push({ kind: 'start', date: measurement.startDate, price: measurement.startPrice, field: measurement.startField || 'free', x: x1, y: y1 });
          if (measurement.endDate && finitePositive(measurement.endPrice)) {
            const x2 = coords.timeToX(atDate(measurement.endDate)), y2 = coords.priceToY(scaleValue(measurement.endPrice, display));
            if (Number.isFinite(x2) && Number.isFinite(y2)) {
              painter.line(x1, y1, x2, y2, '#e2b66c', 1.5, [4, 3]); painter.circle(x2, y2, 4, background, '#e2b66c', 1.5);
              receipt.measurements.push({ kind: 'end', date: measurement.endDate, price: measurement.endPrice, field: measurement.endField || 'free', x: x2, y: y2, from: { x: x1, y: y1 }, dash: [4, 3] });
            }
          }
        }
      }
      const snap = tool === 'measure' ? pointerDetail?.measurementAnchor : null;
      if (snap?.snapped) {
        const x = coords.timeToX(snap.time), y = coords.priceToY(scaleValue(snap.price, display));
        if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= coords.plotWidth && y >= 0 && y <= coords.height) {
          painter.circle(x, y, 7, background, '#e2b66c', 1.5);
          painter.text(snap.field + ' · 자석', Math.min(coords.plotWidth - 56, Math.max(4, x + 10)), Math.max(12, y - 10), chartTheme.text);
          receipt.snapFeedback = { ...snap, x, y, radius: 7 };
        }
      }
      for (const item of fib) { if (!finitePositive(item.price)) continue; const y = coords.priceToY(scaleValue(item.price, display)), x = item.startDate ? coords.timeToX(utcMs(item.startDate)) : 0; if (Number.isFinite(y) && Number.isFinite(x)) { painter.hLine(y, Math.max(0, x), coords.plotWidth, '#95a3ba', [3, 5]); painter.text(`${Math.round(item.ratio * 100)}%`, Math.max(2, x + 4), Math.max(10, y - 3), '#aab8ce'); } }
      if (showDrawdown) {
        let peak = 0; const ddRows = rawRows.concat(bridgeRows).map(row => { const price = row.price ?? row.close; peak = Math.max(peak, price); return { time: row.time, dd: (price / peak - 1) * 100 }; });
        const projectDd = forecastRows.map(row => ({ time: row.time, dd: Number.isFinite(row.drawdownPct) ? row.drawdownPct : null }));
        const paintDd = (rows, color, dash = []) => { let previous = null; for (const row of rows) { if (!Number.isFinite(row.dd)) { previous = null; continue; } const x = coords.timeToX(row.time), y = coords.height - 10 - Math.max(0, Math.min(100, -row.dd)) * .14; if (previous && Number.isFinite(x) && Number.isFinite(y)) painter.line(previous.x, previous.y, x, y, color, 1, dash); previous = { x, y, time: row.time }; } };
        paintDd(ddRows, '#a7b8cd'); paintDd(projectDd, '#e2b66c', [4, 3]);
      }
      if (showStates && states.length) {
        const palette = { warmup:'#637080','price-discovery':'#d8aa60','bottom-formation':'#7f91c4',range:'#8f9ba8',rebound:'#6ea89d',pullback:'#a58ca5',advance:'#6e9f87',correction:'#bd7e82',transition:'#617181' };
        for (let index = 0; index < states.length; index++) { const item = states[index]; if (!item?.date) continue; const x1 = coords.timeToX(utcMs(item.date)), x2 = coords.timeToX(utcMs(states[index + 1]?.date || item.date) + (states[index + 1] ? 0 : expectedGap)); if (Number.isFinite(x1) && Number.isFinite(x2)) { ctx.save(); ctx.globalAlpha = .28; ctx.fillStyle = palette[item.state] || '#718096'; ctx.fillRect(Math.max(0, x1), coords.height - 6, Math.max(1, Math.min(coords.plotWidth, x2) - Math.max(0, x1)), 4); ctx.restore(); } }
      }
      if (nextTurn?.date) { const x = coords.timeToX(utcMs(nextTurn.date)); if (Number.isFinite(x)) painter.vLine(x, 0, coords.height, '#e2b66c', [3, 5]); }
      targetItems = [
        ...(nextTurn?.date ? [{ type: 'next-turn', id: nextTurn.type || nextTurn.date, title: nextTurn.label || '다음 방향 후보', time: utcMs(nextTurn.date), price: nextTurn.price, fixedY: 24 }] : []),
        ...eventRows.filter(row => row.kind !== 'historical').map(row => ({ type: 'event', id: row.id, title: row.label || row.title || row.shortLabel, time: row.time, price: row.price, fixedY: 14 })),
        ...historyLayout.markers.map(marker => ({ type: 'history', id: marker.event.id, title: `${marker.event.date} ${marker.event.title || marker.event.label || ''} · 사건 원문 보기`, time: utcMs(marker.event.date), price: actualRows.reduce((best, row) => Math.abs(row.time - utcMs(marker.event.date)) < Math.abs(best.time - utcMs(marker.event.date)) ? row : best, actualRows[0]).price ?? actualRows[0].close, pressed: Boolean(marker.active) })),
        ...markerRows.filter(row => visibleCycleIds.has(row.id)).map(row => ({ type: 'cycle', id: row.id, title: row.displayLabel || row.label || row.type, time: row.time, price: row.price, pressed: Boolean(cycleLayout.markers.find(point => point.marker.id === row.id)?.active) })),
        ...clockRows.map(row => ({ type: 'clock', id: row.id, title: row.label, time: row.time, price: rawRows.at(-1).price ?? rawRows.at(-1).close, fixedY: 20 })),
        ...evidenceRows.map(row => ({ type: 'evidence', id: row.id, title: row.title, time: row.time, price: row.price, fixedY: 22 })),
        ...forecastValueRows.map(row => ({ type: 'forecast', id: row.date, title: row.date, time: row.time, price: row.price })),
        ...annotationRows.map(row => ({ type: 'annotation', id: row.id, title: row.label, time: row.startTime, price: row.start.price })),
      ];
      const desiredTargets = (selectionPreview ? [] : targetItems.filter(item => item.id)).map(item => {
        const x = Number.isFinite(item.fixedX) ? item.fixedX : coords.timeToX(item.time), y = Number.isFinite(item.fixedY) ? item.fixedY : coords.priceToY(scaleValue(item.price, display));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > coords.plotWidth || y < 0 || y > coords.height) return null;
        return svgNode(svg.ownerDocument, 'circle', { cx: x, cy: y, r: 10, fill: 'transparent', stroke: 'transparent', 'pointer-events': 'all', tabindex: item.type === 'forecast' ? '-1' : '0', role: item.type === 'forecast' ? 'presentation' : 'button', 'data-btc-overlay-target': item.type, 'data-id': item.id, 'aria-label': item.title || item.id || item.type, ...(item.pressed !== undefined ? { 'aria-pressed': item.pressed } : {}) });
      }).filter(Boolean);
      reconcileAnnotationChildren(targetLayer, desiredTargets);
      const paintedCounts = { instance: renderInstance, sequence: receipt.sequence, historyEventCount: historyLayout.totalCount, historyLabelCount: historyLayout.labelCount, historyHiddenLabelCount: historyLayout.hiddenLabelCount, historyLabelMode: historyLayout.totalCount ? historyLayout.labelMode : 'off', cycleMarkerCount: cycleLayout.count, cycleMarkerLabelCount: cycleLayout.labelCount, cycleIntervalCount: intervalLayout.visibleCount, cycleIntervalLabelCount: intervalLayout.labelCount };
      queueMicrotask(() => { if (!destroyed && renderSequence === receipt.sequence) onAnnotationCounts(paintedCounts); });
    },
  };
  const overlayHandle = mounted.addOverlay(overlay);
  let initialRangeApplied = false, redrawTimer = null;
  const scheduleReplayOverlayRedraw = () => {
    clearTimeout(redrawTimer);
    // Range installation can happen during Funnest's first layout pass. Wait
    // until it is observable, then force a frame so overlays use final PaneCoords.
    let attempts = 0;
    const refresh = () => {
      redrawTimer = null;
      if (destroyed) return;
      const visible = mounted.chart.getVisibleTimeRange?.();
      const ready = visible && visible.from <= initialRange.from + DAY && visible.to >= initialRange.to - DAY;
      if (ready) redrawTimer = setTimeout(() => { redrawTimer = null; if (!destroyed) mounted.chart.render(); }, 40);
      else if (attempts++ >= 30) mounted.chart.render();
      else redrawTimer = setTimeout(refresh, 16);
    };
    redrawTimer = setTimeout(refresh, 16);
  };

  const updateLayout = () => {
    if (destroyed) return;
    const layout = mounted.chart.layout, width = Number(layout?.width), height = Number(layout?.height), plotWidth = Number(layout?.plotWidth), plotBottom = Number(mounted.chart.mainScale?.height);
    if (!(width > 0 && height > 0 && plotWidth > 0 && plotBottom > 0)) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height + timingPaneHeight}`);
    const plotGeometry = { plotLeft: '0', plotRight: String(plotWidth), plotTop: String(mounted.chart.mainScale.insetTop || 0), plotBottom: String(plotBottom), priceBottom: String(plotBottom), timeAxisTop: String(layout.panesHeight || plotBottom), visiblePointCount: String(rawRows.length) };
    const plotGeometryChanged = Object.entries(plotGeometry).some(([key, value]) => svg.dataset[key] !== value);
    Object.assign(svg.dataset, plotGeometry);
    // The legend dock and HUD read these plot coordinates from the SVG dataset. Funnest reports its
    // layout asynchronously, so tell those listeners the pane moved; this carries no paint or data.
    if (plotGeometryChanged) {
      const doc = container.ownerDocument, EventType = doc.defaultView?.CustomEvent ?? globalThis.CustomEvent;
      doc.dispatchEvent(new EventType('atlas:hud-layout-change', { detail: { source: 'funnest-layout', plotRight: plotWidth, priceBottom: plotBottom } }));
    }
    if (initialRange && !initialRangeApplied) {
      // The shared runtime owns startup dates; this schedules only the annotation paint.
      initialRangeApplied = true;
      scheduleReplayOverlayRedraw();
    }
    svg.style.width = '100%'; svg.style.height = '100%';
  };
  const cleanupLayout = mounted.chart.on('layoutChange', updateLayout);
  const cleanupReplayViewport = mounted.chart.on('visibleRangeChange', () => { if (futurePointerActive) hideFuturePreview({ clearPointer: true }); overlayHandle.redraw(); });
  // The shared runtime owns the detached, read-only getAtlasFunnestSnapshot hook.
  updateLayout();

  const sourceByTime = new Map(rawRows.map(row => [row.time, row]));
  const previousAt = row => {
    const index = rawRows.indexOf(row); return index > 0 ? rawRows[index - 1] : null;
  };
  const byDate = new Map(uniqueRows.map(row => [row.date, row]));
  const nearestFromRows = (value, rows) => {
    const target = typeof value === 'number' ? value : utcMs(value);
    let best = rows[0];
    for (const row of rows) if (Math.abs(row.time - target) < Math.abs(best.time - target)) best = row;
    return best;
  };
  const nearestSelection = value => nearestFromRows(value, uniqueRows);
  const nearestFutureSelection = value => {
    const selected = futureSelectionRows.length ? nearestFromRows(value, futureSelectionRows) : null;
    return selected && Math.abs(selected.time - Number(value)) <= gapSize(frequency) * 1.5 ? selected : null;
  };
  const showFuturePreview = row => {
    const x = lastCoords?.timeToX(row.time), y = lastCoords?.priceToY(scaleValue(row.price, display));
    if (!Number.isFinite(x) || !Number.isFinite(y)) { hideFuturePreview(); return false; }
    futureVertical.setAttribute('x1', x); futureVertical.setAttribute('x2', x); futureVertical.setAttribute('y1', 0); futureVertical.setAttribute('y2', lastCoords.height);
    futureHorizontal.setAttribute('x1', 0); futureHorizontal.setAttribute('x2', lastCoords.plotWidth); futureHorizontal.setAttribute('y1', y); futureHorizontal.setAttribute('y2', y);
    futurePoint.setAttribute('cx', x); futurePoint.setAttribute('cy', y);
    const labelText = `${row.date} · ${formatDisplayPrice(row.price, display.metadata, 2)} · 가정`, labelWidth = svgLabelWidth11(labelText);
    const labelX = Math.max(4, Math.min(lastCoords.plotWidth - labelWidth - 4, x > lastCoords.plotWidth * .72 ? x - labelWidth - 8 : x + 8));
    futureLabel.setAttribute('x', labelX); futureLabel.setAttribute('y', Math.max(12, y - 9));
    futureLabel.setAttribute('text-anchor', 'start'); futureLabel.textContent = labelText;
    futurePreviewLayer.setAttribute('display', 'inline'); futurePointerActive = true; return true;
  };
  const detailFor = row => {
    if (!row) return null;
    const displayRow = row.kind === 'observed' ? sourceByTime.get(row.time) : row;
    if (row.kind === 'observed' && displayRow) {
      const detail = sourcePointDetail(displayRow, previousAt(displayRow), display, { frequency, source: actualSource });
      if (sourceMode === 'close-only' && showVolume) { const observedVolume = volumeByDate.get(displayRow.date); if (observedVolume) Object.assign(detail, { volume: observedVolume.volume, volumeSource, volumeUnit: 'BTC', volumeStartDate: observedVolume.startDate || observedVolume.date, volumeEndDate: observedVolume.endDate || observedVolume.date }); }
      return detail;
    }
    if (row.kind === 'observed-line') { const index = bridgeRows.indexOf(row); return sourcePointDetail(row, bridgeRows[index - 1], display, { frequency, source: 'Coin Metrics' }); }
    return { date: row.date, price: row.price, displayedPrice: display.toDisplay(row.price), display: display.metadata, kind: 'simulated', source: row.kind === 'retrospective' ? '현재 생성 회고 경로' : 'Atlas 조건부 모델', frequency };
  };
  let selectionIndex = uniqueRows.findIndex(row => row.date === activeSelection);
  if (selectionIndex < 0) { const nearest = nearestSelection(activeSelection); selectionIndex = Math.max(0, uniqueRows.indexOf(nearest)); activeSelection = nearest?.date ?? uniqueRows.at(-1)?.date; }
  const commit = (row, user = true) => { if (!row) return; activeSelection = row.date; selectionIndex = uniqueRows.indexOf(row); onHover(detailFor(row)); onInspect({ label: `${row.date} · ${row.kind === 'observed' ? '관측' : '조건부 가정'}`, date: row.date, kind: row.kind === 'observed' ? 'observed' : 'simulated', fields: [{ label: row.kind === 'observed' ? '관측 가격' : '조건부 가격', value: formatDisplayPrice(row.price ?? row.close, display.metadata, 2) }] }, { user, openPanel: user }); };
  const moveCrosshair = (event, preview = true) => {
    if (destroyed || selectionPreview) return false;
    const win = svg.ownerDocument.defaultView, rect = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
    if (!win?.PointerEvent || !lastCoords || !(rect.width > 0 && rect.height > 0 && view.width > 0 && view.height > 0)) return false;
    const x = (event.clientX - rect.left) / rect.width * view.width, y = (event.clientY - rect.top) / rect.height * view.height;
    if (x < 0 || x > lastCoords.plotWidth || y < 0 || y > lastCoords.height) { hideFuturePreview({ clearPointer: true }); return false; }
    const point = lastCoords.pointAt(x, y);
    if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.price)) { hideFuturePreview({ clearPointer: true }); return false; }
    const futurePointer = point.time > latestObservedTime;
    const selected = futurePointer ? nearestFutureSelection(point.time) : nearestSelection(point.time);
    if (futurePointer && !selected) { hideFuturePreview({ clearPointer: true }); clearNativeCrosshair(); return false; }
    const sourceRow = selected?.kind === 'observed' ? sourceByTime.get(selected.time) : selected;
    const resolved = tool === 'measure' && sourceRow ? resolveMagnetPoint({ row: sourceRow, pointerY: y,
      y: value => lastCoords.priceToY(display.toDisplay(value)), invertY: value => display.fromDisplay(lastCoords.yToPrice(value)),
      mode: magnet, ctrlKey: Boolean(event.ctrlKey), metaKey: Boolean(event.metaKey), thresholdPx: 12 * view.height / rect.height }) : null;
    const measurementAnchor = resolved ? { ...resolved, time: selected.time, date: selected.date, kind: selected.kind === 'observed' || selected.kind === 'observed-line' ? 'observed' : 'simulated' } : null;
    pointerDetail = { time: point.time, value: display.fromDisplay(point.price), price: display.fromDisplay(point.price), x, y, date: selected?.date || null, kind: selected?.kind || null, measurementAnchor };
    const hostRect = host.getBoundingClientRect(); if (!(hostRect.width > 0 && hostRect.height > 0)) return false;
    // In pinned Funnest the second (overlay) canvas owns Interaction; events
    // dispatched only on its ancestor host never reach the native listener.
    const inputCanvas = [...host.querySelectorAll('canvas')].at(-1);
    if (!inputCanvas) return false;
    nativeInputCanvas = inputCanvas;
    if (futurePointer) {
      if (!showFuturePreview(selected)) return false;
      if (!event.buttons) clearNativeCrosshair();
    } else {
      hideFuturePreview();
      const forwarded = new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: event.pointerId || 1, pointerType: event.pointerType || 'mouse', isPrimary: true, clientX: event.clientX, clientY: event.clientY, buttons: event.buttons || 0, pressure: event.pressure || 0, ctrlKey: Boolean(event.ctrlKey), metaKey: Boolean(event.metaKey) });
      inputCanvas.dispatchEvent(forwarded);
    }
    if (selected) onHover(detailFor(selected));
    if (tool === 'measure') overlayHandle.redraw();
    return Boolean(preview);
  };
  const onPointerMove = event => { moveCrosshair(event); };
  const onPointerLeave = event => {
    hideFuturePreview({ clearPointer: true });
    if (selectionPreview) return;
    if (tool === 'measure') overlayHandle.redraw();
    const win = svg.ownerDocument.defaultView; if (!win?.PointerEvent) return;
    [...host.querySelectorAll('canvas')].at(-1)?.dispatchEvent(new win.PointerEvent('pointerleave', { bubbles: false, pointerId: event.pointerId || 1, pointerType: event.pointerType || 'mouse', clientX: event.clientX, clientY: event.clientY }));
  };
  const onCrosshair = detail => {
    if (destroyed) return;
    if (futurePointerActive) { if (detail?.bar) clearNativeCrosshair(); return; }
    if (!detail?.bar) return;
    if (!nativeCrosshairMatchesPointer(detail)) { clearNativeCrosshair(); return; }
    const row = nearestSelection(detail.time);
    if (row) { activeSelection = row.date; onHover(detailFor(row)); }
  };
  const cleanupCrosshair = mounted.chart.on('crosshairMove', onCrosshair);
  const onClick = event => {
    if (destroyed || selectionPreview) return;
    const interval = event.target.closest?.('[data-cycle-interval]');
    if (interval) { onCycleInterval(interval.dataset.cycleInterval); return; }
    const target = event.target.closest?.('[data-btc-overlay-target]');
    if (target) {
      const item = targetItems.find(row => row.id === target.dataset.id && row.type === target.dataset.btcOverlayTarget);
      if (!item) return;
      if (item.type === 'history') onHistoricalEvent(item.id);
      else if (item.type === 'evidence') onForecastEvidence(item.id);
      else if (item.type === 'cycle') onCycleMarker(item.id);
      else if (item.type === 'interval') onCycleInterval(item.id);
      else if (item.type === 'clock') onCycleClock(item.id);
      else if (item.type === 'next-turn') onNextTurn(item.id);
      else if (item.type === 'annotation') onAnnotation(item.id, { user: true });
      else commit(byDate.get(item.id) || nearestSelection(item.time));
      return;
    }
    if (tool === 'measure') {
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) moveCrosshair(event, false);
      const point = pointerDetail?.measurementAnchor;
      if (!point || !finitePositive(point.price)) return;
      onMeasurement(advanceMeasurement(measurement, point));
      return;
    }
    if (pointerDetail?.kind === 'simulated' && pointerDetail.date) commit(byDate.get(pointerDetail.date) || nearestFutureSelection(pointerDetail.time));
    else if (Number.isFinite(pointerDetail?.time)) commit(nearestSelection(pointerDetail.time));
  };
  const onKeyDown = event => {
    if (selectionPreview || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    const interval = event.target.closest?.('[data-cycle-interval]');
    if (interval && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); onCycleInterval(interval.dataset.cycleInterval); return; }
    const target = event.target.closest?.('[data-btc-overlay-target]');
    if (target && ['Enter', ' '].includes(event.key)) { event.preventDefault(); target.click(); return; }
    let next = null;
    if (event.key === 'ArrowLeft') next = Math.max(0, selectionIndex - 1);
    else if (event.key === 'ArrowRight') next = Math.min(uniqueRows.length - 1, selectionIndex + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = uniqueRows.length - 1;
    if (next !== null) { event.preventDefault(); commit(uniqueRows[next], false); }
  };
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerleave', onPointerLeave);
  svg.addEventListener('click', onClick);
  svg.addEventListener('keydown', onKeyDown);

  // Establish native scale settings before installing the manual forecast-aware domain.
  mounted.setScale(effectiveScale);
  mounted.setInverted(invertScale);
  const values = [];
  const inRequestedWindow = row => !initialRange || (Number.isFinite(row.time) && row.time >= initialRange.from && row.time <= initialRange.to);
  if (!priceDomain) {
    for (const row of rawRows.concat(bridgeRows).filter(inRequestedWindow)) for (const value of [row.price ?? row.close, row.low, row.high]) if (Number.isFinite(value) && value > 0) values.push(scaleValue(value, display));
    for (const row of [...forecastRows, ...retrospectiveRows].filter(inRequestedWindow)) for (const value of [row.price, row.lower, row.upper]) if (Number.isFinite(value) && value > 0 && (!priceOnlyAuto || value === row.price)) values.push(scaleValue(value, display));
    for (const row of markerRows.filter(inRequestedWindow)) if (Number.isFinite(row.price) && row.price > 0 && !priceOnlyAuto) values.push(scaleValue(row.price, display));
  }
  let min = priceDomain ? scaleValue(priceDomain.min, display) : (values.length ? Math.min(...values) : NaN), max = priceDomain ? scaleValue(priceDomain.max, display) : (values.length ? Math.max(...values) : NaN);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    if (!priceDomain && max <= min) { const pad = Math.max(1, Math.abs(max) * .01); min -= pad; max += pad; }
    mounted.setPriceExtrema({ min, max });
  }
  mounted.setDrawingTool(null); mounted.setMagnet(magnet !== 'off');
  if (initialRange) mounted.setRange(initialRange);
  const svgPointAt = clientX => {
    const coords = lastCoords, rect = svg.getBoundingClientRect(), view = svg.viewBox?.baseVal;
    const viewWidth = Number(view?.width) || Number(svg.getAttribute('viewBox')?.trim().split(/\s+/)[2]);
    if (!coords || !(rect.width > 0) || !(viewWidth > 0) || !Number.isFinite(clientX)) return null;
    const x = (clientX - rect.left) / rect.width * viewWidth;
    if (x < 0 || x > coords.plotWidth) return null;
    let best = null, distance = Infinity;
    for (const row of rawRows) {
      const candidate = coords.timeToX(row.time), delta = Math.abs(candidate - x);
      if (Number.isFinite(candidate) && delta < distance) { best = row; distance = delta; }
    }
    return best;
  };
  const readRenderSnapshot = () => {
    const coords = lastCoords;
    const projected = rawRows.map(row => ({ ...row, x: coords?.timeToX(row.time) ?? null,
      projectedY: Object.fromEntries(['open', 'high', 'low', 'close'].filter(key => Number.isFinite(row[key])).map(key => [key, coords?.priceToY(scaleValue(row[key], display)) ?? null])) }));
    return structuredClone({ engine: 'funnest', version: '0.6.22', instance: renderInstance, rendered: !destroyed && renderSequence > 0,
      sequence: renderSequence, sourceMode, source: { name: actualSource, ...source }, frequency, chartType: sourceMode === 'close-only' ? 'line' : chartType,
      unit, display: display.metadata, theme: chartTheme, nativeRange: mounted.chart.getVisibleTimeRange?.() ?? null,
      priceScale: { min: display.fromDisplay(mounted.chart.mainScale.min), max: display.fromDisplay(mounted.chart.mainScale.max), displayMin: mounted.chart.mainScale.min, displayMax: mounted.chart.mainScale.max, scale: mounted.chart.settings.priceScale, inverted: Boolean(invertScale) },
      pane: coords ? { width: coords.plotWidth, height: coords.height } : null,
      observed: { coordinateBasis: 'projection through the real rendered Funnest PaneCoords; not intercepted core draw calls', rows: projected },
      bridgeRows, volumeByTime, showVolume, forecastRows, retrospectiveRows,
      // An unconfirmed start preview has no committed cursor; its disclosure limit stays an internal filter.
      replay: { cursorDate: selectionPreview ? null : replayCursorDate, previewDisclosureThrough: selectionPreview ? replayCursorDate : null, selectionPreview, boundaries: replayBoundaries },
      interaction: { selectedDate: activeSelection, measurementAnchor: pointerDetail?.measurementAnchor ?? null, pointer: pointerDetail ? { time: pointerDetail.time, value: pointerDetail.value, x: pointerDetail.x, y: pointerDetail.y } : null, pointerBasis: 'Funnest PaneCoords.pointAt; not an observed source bar' },
      paint: lastOverlay });
  };
  Object.defineProperty(host, 'getAtlasBtcRenderSnapshot', { configurable: true, enumerable: false, writable: false, value: readRenderSnapshot });
  const controller = {
    engine: 'funnest', chart: mounted.chart, host,
    getPriceScale() { const axis = mounted.chart.mainScale, layout = mounted.chart.layout; return { min: display.fromDisplay(axis.min), max: display.fromDisplay(axis.max), scale: effectiveScale, inverted: Boolean(invertScale), top: axis.insetTop, bottom: axis.height, left: 0, right: layout.plotWidth, display: display.metadata, priceToY: value => axis.priceToY(scaleValue(value, display)), yToPrice: value => display.fromDisplay(axis.yToPrice(value)) }; },
    x(value) { const coords = lastCoords; const date = typeof value === 'string' ? value : value?.date; return coords && date ? coords.timeToX(utcMs(date)) : NaN; },
    dateAt(clientX) { const row = svgPointAt(clientX); return row?.date ?? row?.endDate ?? null; },
    barDateAt(clientX) { const row = svgPointAt(clientX); return row ? (sourceMode === 'ohlc' && chartType === 'candles' ? row.sourceRow?.periodStartDate ?? row.sourceRow?.startDate ?? row.startDate ?? row.date : row.date) : null; },
    getVisibleTimeRange() { return mounted.chart.getVisibleTimeRange?.() ?? null; },
    getSelection({ anchor } = {}) { const row = Number.isFinite(anchor) ? uniqueRows[Math.max(0, Math.min(uniqueRows.length - 1, Math.floor(anchor * (uniqueRows.length - 1))))] : nearestSelection(activeSelection); const detail = detailFor(row); return { label: row?.date ?? '선택한 가격', copyText: detail ? `${detail.date}\n가격: ${formatDisplayPrice(detail.price, display.metadata, 2)}\n${detail.source}` : null }; },
    selectDate(value) { commit(nearestSelection(value)); },
    getDate() { return activeSelection; },
    previous() { if (selectionIndex > 0) commit(uniqueRows[--selectionIndex]); },
    next() { if (selectionIndex < uniqueRows.length - 1) commit(uniqueRows[++selectionIndex]); },
    hasPrevious() { return selectionIndex > 0; }, hasNext() { return selectionIndex < uniqueRows.length - 1; },
    previewPointer(point) { return moveCrosshair(point); }, clearPreview() { pointerDetail = null; if (host && !selectionPreview) onPointerLeave({ pointerId: 1, pointerType: 'mouse' }); return true; },
    updateCycleOverlayObstacles(obstacles = []) {
      if (destroyed) return false;
      cycleOverlayObstaclesLocal = Array.isArray(obstacles) ? [...obstacles] : [];
      overlayHandle.redraw();
      return true;
    },
    inspect() { return mounted.inspect(); },
    exportCanvas() {
      const snapshot = mounted.chart.takeScreenshot();
      if (!snapshot || !(snapshot.width > 0 && snapshot.height > 0)) throw new Error('Funnest BTC chart screenshot is not painted');
      const hostBounds = host.getBoundingClientRect();
      if (!(hostBounds.width > 0 && hostBounds.height > 0)) throw new Error('Funnest BTC chart host has no exportable CSS bounds');
      const containerBounds = container.getBoundingClientRect();
      const left = hostBounds.left - containerBounds.left - (container.clientLeft || 0);
      const top = hostBounds.top - containerBounds.top - (container.clientTop || 0);
      Object.assign(snapshot.style, { position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${hostBounds.width}px`, height: `${hostBounds.height}px`, opacity: '0', pointerEvents: 'none', zIndex: '-1' });
      snapshot.setAttribute('aria-hidden', 'true'); snapshot.dataset.funnestExportCanvas = 'true';
      Object.defineProperty(snapshot, 'atlasFunnestExportOwner', { value: host, enumerable: false, writable: false, configurable: false });
      container.append(snapshot);
      return snapshot;
    },
    destroy() {
      if (destroyed) return; destroyed = true;
      clearTimeout(redrawTimer); cleanupLayout?.(); cleanupReplayViewport?.(); cleanupCrosshair?.(); overlayHandle?.remove?.(); bandOverlayHandle?.remove?.();
      if (Object.getOwnPropertyDescriptor(host, 'getAtlasBtcRenderSnapshot')?.value === readRenderSnapshot) delete host.getAtlasBtcRenderSnapshot;
      svg.removeEventListener('pointermove', onPointerMove); svg.removeEventListener('pointerleave', onPointerLeave); svg.removeEventListener('click', onClick); svg.removeEventListener('keydown', onKeyDown);
      hideFuturePreview({ clearPointer: true }); targetLayer.remove(); annotationLabelLayer.remove(); intervalLayer.remove(); replayBoundaryLayer.remove(); replayTimingLayer.remove(); futurePreviewLayer.remove(); mounted.destroy();
    },
  };
  // Publish the selected real observation on mount; a price readout must not
  // depend on the first mouse movement or a synthetic crosshair event.
  if (!selectionPreview) onHover(detailFor(nearestSelection(activeSelection)));
  return controller;
}
