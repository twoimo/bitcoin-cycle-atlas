import { createChart } from '@funnest/charts';

const BAR_FIELDS = ['time', 'open', 'high', 'low', 'close'];
const TIME_SCALE_BUDGET = Object.freeze({ minBarSpacing: 0.5, maxBarSpacing: 64, maxBars: 6000 });
const NATIVE_TIME_LABEL_MIN_GAP = 72; // Pinned Funnest 0.6.22 TIME_LABEL_MIN_GAP.
function sourceInterval(bars) {
  let interval = Infinity;
  for (let index = Math.max(1, bars.length - 20); index < bars.length; index++) interval = Math.min(interval, bars[index].time - bars[index - 1].time);
  return Number.isFinite(interval) && interval > 0 ? interval : 60_000;
}
function calendarPartsAt(time, timezone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}
function zonedMonthStart(year, month, timezone) {
  // Invert Intl's real timezone projection instead of treating UTC midnight as
  // local midnight; the latter shifts NY month anchors to the prior UTC day.
  const target = Date.UTC(year, month - 1, 1), formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let epoch = target;
  for (let pass = 0; pass < 5; pass++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch)).map(part => [part.type, part.value]));
    const projected = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = target - projected;
    if (!correction) break;
    epoch += correction;
  }
  const check = calendarPartsAt(epoch, timezone);
  if (check.year !== year || check.month !== month || check.day !== 1) throw new RangeError(`Cannot resolve ${year}-${String(month).padStart(2, '0')}-01 in ${timezone}`);
  return epoch;
}
function futureMonthLabel(year, month) {
  // Density filtering can omit January, so every future label keeps its year.
  return `${year}-${String(month).padStart(2, '0')}`;
}
function futureDayLabel(time, timezone, locale) {
  const { year, month, day } = calendarPartsAt(time, timezone), sep = locale === 'ko' ? '.' : '-';
  return `${year}${sep}${String(month).padStart(2, '0')}${sep}${String(day).padStart(2, '0')}`;
}
function sourceIndexAtTime(bars, time, interval) {
  if (!bars.length) return NaN;
  const last = bars.length - 1;
  if (time <= bars[0].time) return (time - bars[0].time) / interval;
  if (time >= bars[last].time) return last + (time - bars[last].time) / interval;
  let low = 0, high = last;
  while (low + 1 < high) { const middle = (low + high) >> 1; if (bars[middle].time <= time) low = middle; else high = middle; }
  const left = bars[low].time, right = bars[high].time;
  return low + (right > left ? (time - left) / (right - left) : 0);
}
function sourceRangeSpan(bars, range) {
  if (!bars.length || !range || !Number.isFinite(range.from) || !Number.isFinite(range.to) || !(range.to > range.from)) return 0;
  const interval = sourceInterval(bars);
  return Math.max(1, sourceIndexAtTime(bars, range.to, interval) - sourceIndexAtTime(bars, range.from, interval));
}
const DEFAULT_THEME = Object.freeze({
  background: 'var(--bg, #17171c)', surface: 'var(--surface-raised, #202027)',
  text: 'var(--text, #e4e4e5)', textSecondary: 'var(--muted, #7e7e87)',
  grid: 'var(--border, #2c2c35)', border: 'var(--border, #2c2c35)',
  // Native last-price badges use white text; keep both direction colors at >=4.5:1.
  crosshair: 'var(--muted, #7e7e87)', up: '#d53544', down: '#2e71d4',
  accent: 'var(--accent-ink, #74a7ee)', fontFamily: 'var(--font, sans-serif)',
  fontSize: 12, radius: 0,
});

/** Validate rather than repair: missing bars/gaps stay missing and source values are untouched. */
export function validateFunnestBars(bars) {
  if (!Array.isArray(bars)) throw new TypeError('Funnest chart data must be an array of observed bars');
  let previous = -Infinity;
  return bars.map((bar, index) => {
    if (!bar || BAR_FIELDS.some(key => !Number.isFinite(bar[key]))) throw new TypeError(`Invalid OHLC bar at index ${index}`);
    if (!Number.isSafeInteger(bar.time) || bar.time <= previous) throw new RangeError(`Bar times must be strictly increasing UTC milliseconds (index ${index})`);
    if (bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) throw new RangeError(`Invalid OHLC envelope at index ${index}`);
    if (bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0)) throw new RangeError(`Invalid volume at index ${index}`);
    previous = bar.time;
    return bar;
  });
}

/**
 * Funnest 0.6.22 has no public forecast-aware price-domain API. Its source-owned
 * `mainScale` (`PriceScale`) and `invalidate()` are ordinary TypeScript-private
 * fields/methods in this exact build. This narrowly guarded adapter sets the plot
 * extrema without adding synthetic forecast bars to observed market data.
 */
export function mapCloseOnlyToFunnestLine(points) {
  if (!Array.isArray(points)) throw new TypeError('Close-only series must be an array');
  let previous = -Infinity;
  const observations = points.map((point, index) => {
    if (!point || !Number.isSafeInteger(point.time) || point.time <= previous || !Number.isFinite(point.close)) throw new TypeError(`Invalid close-only observation at index ${index}`);
    previous = point.time;
    return { time: point.time, close: point.close };
  });
  // These flat bars are Funnest's internal line-coordinate substrate only. They never enter
  // source disclosures, OHLC readouts, export rows, forecasts or accessible value text.
  const lineGeometry = observations.map(({ time, close }) => ({ time, open: close, high: close, low: close, close }));
  return { observations, lineGeometry };
}

const invertedScaleMethods = new WeakMap();
const invertedCharts = new WeakSet();

/**
 * Funnest 0.6.22 has no public inverted-price-axis option. Reflect its actual scale coordinates
 * (and pointer-pan direction) around the inner plot bounds; ticks, candles, crosshair and Atlas
 * overlays continue to use the same Funnest scale. No data or axis labels are rewritten.
 */
export function setFunnestPriceScaleInverted(chart, inverted) {
  const scale = chart?.mainScale;
  if (!scale || typeof scale.priceToY !== 'function' || typeof scale.yToPrice !== 'function' || typeof scale.pan !== 'function') throw new TypeError('Pinned Funnest main price scale is unavailable');
  const previous = invertedScaleMethods.get(scale);
  if (!inverted) {
    if (previous) {
      scale.priceToY = previous.priceToY; scale.yToPrice = previous.yToPrice; scale.pan = previous.pan;
      invertedScaleMethods.delete(scale); chart.invalidate?.();
    }
    invertedCharts.delete(chart);
    return false;
  }
  if (previous) { invertedCharts.add(chart); return true; }
  const priceToY = scale.priceToY.bind(scale), yToPrice = scale.yToPrice.bind(scale), pan = scale.pan.bind(scale);
  const reflect = y => {
    const height = Number(scale.height) || 0, available = Math.max(height / 2, height - (Number(scale.insetTop) || 0));
    const top = height - available + available * scale.margins.top;
    const innerHeight = Math.max(1, available * (1 - scale.margins.top - scale.margins.bottom));
    return top + innerHeight - y;
  };
  scale.priceToY = price => reflect(priceToY(price));
  scale.yToPrice = y => yToPrice(reflect(y));
  scale.pan = delta => pan(-delta);
  invertedScaleMethods.set(scale, { priceToY, yToPrice, pan });
  invertedCharts.add(chart);
  chart.invalidate?.();
  return true;
}

export function setFunnestPriceExtrema(chart, domain) {
  const scale = chart?.mainScale;
  if (!scale || typeof scale.setRange !== 'function' || typeof chart.invalidate !== 'function' || typeof scale.autoScale !== 'boolean') {
    throw new TypeError('Funnest 0.6.22 manual price-scale extension is unavailable');
  }
  if (domain === null || domain === undefined) {
    scale.autoScale = true;
    chart.invalidate();
    return;
  }
  const { min, max } = domain;
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) throw new RangeError('A finite increasing forecast-aware price domain is required');
  scale.autoScale = false;
  scale.setRange(min, max);
  chart.invalidate();
}

/**
 * Funnest 0.6.22 re-measures its price-axis width from the visible tick labels on every frame and
 * keeps bars anchored to the plot's right edge. A zoom or price-axis gesture that narrows the labels
 * therefore widens the plot and slides every bar sideways under a stationary pointer.
 * `priceAxisWidth` is a TypeScript-private own field in this exact build, with no public option.
 * While `viewerOwnsViewport()` is true the width grows to fit a wider label and is never given back.
 * Until then the caller's range is refit after every layout, so the engine's own width passes through.
 */
export function holdFunnestPriceAxisWidth(chart, viewerOwnsViewport) {
  if (!chart || typeof chart.priceAxisWidth !== 'number') throw new TypeError('Funnest 0.6.22 price-axis width field is unavailable');
  if (typeof viewerOwnsViewport !== 'function') throw new TypeError('A viewport-ownership predicate is required');
  let held = chart.priceAxisWidth;
  Object.defineProperty(chart, 'priceAxisWidth', { configurable: true, enumerable: true, get: () => held, set(next) { held = viewerOwnsViewport() ? Math.max(held, next) : next; } });
}

/** Read-only evidence snapshot for QA: copied source values, actual engine state and canvas ink. */
export function inspectAtlasFunnestChart({ chart, host, source = {}, state = 'unknown', sourceMode = 'ohlc', observations = [], crosshair = null, crosshairEventSequence = 0 } = {}) {
  if (!chart || !host?.querySelectorAll) throw new TypeError('Funnest chart and mounted host are required for inspection');
  const canvases = [...host.querySelectorAll('canvas')].map(canvas => {
    const width = Number(canvas.width) || 0, height = Number(canvas.height) || 0;
    let readable = false, opaquePixels = 0, sampledColors = 0;
    try {
      const data = canvas.getContext('2d')?.getImageData(0, 0, width, height).data;
      if (data && width && height) {
        readable = true;
        const colors = new Set(), step = Math.max(4, Math.floor(data.length / 20000 / 4) * 4);
        for (let i = 0; i < data.length; i += step) {
          if (data[i + 3] > 0) opaquePixels++;
          colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
        }
        sampledColors = colors.size;
      }
    } catch { /* Cross-origin/tainted or unavailable canvas is explicit evidence, not a pass. */ }
    return { width, height, visible: Boolean(canvas.isConnected && width && height && (typeof canvas.checkVisibility !== 'function' || canvas.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))), readable, opaquePixels, sampledColors };
  });
  const bars = [...(chart.bars || [])].map(bar => ({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, ...(bar.volume === undefined ? {} : { volume: bar.volume }) }));
  const range = chart.getVisibleTimeRange?.() ?? null, layout = chart.layout ?? null;
  const visibleCanvases = canvases.filter(canvas => canvas.visible);
  const painted = state === 'ready' && bars.length > 0 && Number(layout?.plotWidth) > 0 && Number(layout?.panesHeight) > 0 &&
    visibleCanvases.some(canvas => canvas.readable && canvas.opaquePixels > 0 && canvas.sampledColors > 1);
  const legacy = [...(host.parentElement?.querySelectorAll?.('svg') || [])].filter(svg => !host.contains(svg));
  const legacyPriceNodes = legacy.reduce((total, svg) => total + svg.querySelectorAll('.market-close-line,.market-candle,.market-forecast-line,.price-line,.candle').length, 0);
  return structuredClone({ engine: 'funnest', version: '0.6.22', state, painted, source, sourceMode, symbol: host.dataset.symbol || null,
    currency: host.dataset.currency || null, timeUnit: 'UTC milliseconds', chartType: chart.type ?? null, settings: chart.settings ?? null,
    observations: sourceMode === 'close-only' ? observations.map(point => ({ time: point.time, close: point.close })) : bars,
    engineBars: bars, crosshair, crosshairEventSequence, internalLineGeometry: sourceMode === 'close-only' ? bars : null, range, layout, inverted: invertedCharts.has(chart), futureDateTicks: host.getAtlasFunnestFutureDateTicks?.() ?? [], canvases, legacy: { svgCount: legacy.length, priceNodes: legacyPriceNodes } });
}

/** Publish detached QA values without exposing the mutable engine to page callers. */
export function exposeAtlasFunnestSnapshot(host, readSnapshot) {
  if (!host || typeof readSnapshot !== 'function') throw new TypeError('A chart host and snapshot reader are required');
  const read = () => structuredClone(readSnapshot());
  Object.defineProperty(host, 'getAtlasFunnestSnapshot', {configurable:true, enumerable:false, writable:false, value:read});
  return () => { if (Object.getOwnPropertyDescriptor(host, 'getAtlasFunnestSnapshot')?.value === read) delete host.getAtlasFunnestSnapshot; };
}

/**
 * Mount Atlas's shared Funnest Canvas engine. Funnest owns observed prices, OHLC candles,
 * time/price axes, scaling, viewport, crosshair, pointer navigation and drawing state. Atlas
 * remains responsible for overlays, source disclosures and forecast/replay semantics.
 */
export function mountAtlasFunnestChart(container, options = {}) {
  if (!container?.ownerDocument || !container.isConnected) throw new TypeError('A connected chart host is required');
  const { bars = [], symbol = 'BTCUSD', currency = 'USD', timezone = 'Asia/Seoul', locale = 'ko',
    precision = 2, tickSize = 0, chartType = 'candles', scale = 'normal', invertScale = false, theme = {}, range = null, source = {}, sourceMode = 'ohlc',
    volumeByTime = null, volumeSource = null,
    accessibleName = `${symbol} 실제 관측 가격 차트`, onCrosshair = () => {}, onViewport = () => {},
    onError = () => {}, volume = true } = options;
  if (!['candles', 'line', 'area'].includes(chartType)) throw new RangeError(`Unsupported Funnest chart type: ${chartType}`);
  if (!['ohlc', 'close-only'].includes(sourceMode) || sourceMode === 'close-only' && chartType !== 'line') throw new RangeError('Close-only market sources require line mode and cannot be presented as OHLC candles');
  if (!['normal', 'log', 'percent'].includes(scale)) throw new RangeError(`Unsupported Funnest scale: ${scale}`);
  if (typeof onCrosshair !== 'function' || typeof onViewport !== 'function' || typeof onError !== 'function') throw new TypeError('Chart event callbacks must be functions');
  const host = container.ownerDocument.createElement('div');
  host.className = 'atlas-funnest-canvas';
  host.dataset.atlasChartEngine = 'funnest';
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', accessibleName);
  host.dataset.currency = currency;
  host.dataset.symbol = symbol;
  host.tabIndex = 0;
  Object.assign(host.style, { position: 'absolute', inset: '0', minWidth: '0', minHeight: '0' });
  container.appendChild(host);
  const status = container.ownerDocument.createElement('span');
  status.className = 'atlas-funnest-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
  container.appendChild(status);
  const showVolume = Boolean(volume && (sourceMode === 'ohlc' || volumeByTime !== null));
  const chart = createChart(host, { locale, displayTimezone: timezone, pricePrecision: precision, tickSize,
    volume: showVolume, theme: { ...DEFAULT_THEME, ...theme }, settings: { volume: showVolume, lastPriceLine: true, priceScale: scale },
    timeScale: { minBarSpacing: TIME_SCALE_BUDGET.minBarSpacing, maxBarSpacing: TIME_SCALE_BUDGET.maxBarSpacing } });
  // Funnest's first computeFrame switches scale mode and enables auto-scale when these
  // disagree. Set the native mode alongside constructor settings before data can paint.
  if (chart.mainScale && typeof chart.mainScale.mode === 'string') chart.mainScale.mode = scale;
  const cleanups = [];
  let destroyed = false, readyPromise = null, observations = [], currentBars = [], pendingRange = range, ownedRange = range, retainedRange = range, retainedMaxSpan = 0, retainedFitException = Boolean(range), initialRangeOwned = Boolean(range), userRange = false, futureDateTicks = [], announceTimer = 0, currentInverted = Boolean(invertScale), lastCrosshair = null, crosshairEventSequence = 0;
  const volumeMap = new Map();
  if (volumeByTime !== null) {
    if (!Array.isArray(volumeByTime)) throw new TypeError('Observed volume must be a time-keyed array');
    let previous = -Infinity;
    for (const row of volumeByTime) {
      if (!row || !Number.isSafeInteger(row.time) || row.time <= previous || !Number.isFinite(row.volume) || row.volume < 0) throw new TypeError('Observed volume needs strictly ordered UTC-millisecond times and nonnegative values');
      volumeMap.set(row.time, row.volume); previous = row.time;
    }
  }
  const mapData = input => {
    if (sourceMode === 'close-only') {
      const mapped = mapCloseOnlyToFunnestLine(input);
      observations = mapped.observations;
      currentBars = mapped.lineGeometry.map(bar => volumeMap.has(bar.time) ? { ...bar, volume: volumeMap.get(bar.time) } : bar);
    } else { observations = []; currentBars = validateFunnestBars(input); }
  };
  const configureRetainedRangeSpacing = (targetRange, plotWidth = chart.timeScale?.width) => {
    const width = Number(plotWidth);
    if (!(width > 0) || !chart.timeScale?.options) return;
    const ordinaryFloor = Math.max(TIME_SCALE_BUDGET.minBarSpacing, width / (TIME_SCALE_BUDGET.maxBars - 1));
    if (!retainedFitException || !targetRange) { chart.timeScale.options.minBarSpacing = ordinaryFloor; return; }
    const span = Math.max(retainedMaxSpan, sourceRangeSpan(currentBars, targetRange));
    if (!Number.isFinite(span) || !(span > 0)) { chart.timeScale.options.minBarSpacing = ordinaryFloor; return; }
    // Canonical Atlas spacing policy retains explicit Fit/date-window exceptions,
    // including windows above the normal 6,000-bar navigation budget.
    chart.timeScale.options.minBarSpacing = Math.min(TIME_SCALE_BUDGET.minBarSpacing, width / span);
  };
  holdFunnestPriceAxisWidth(chart, () => !initialRangeOwned);
  mapData(bars);
  chart.setData(currentBars);
  chart.setChartType(chartType);
  retainedMaxSpan = sourceRangeSpan(currentBars, retainedRange);
  setFunnestPriceScaleInverted(chart, invertScale);

  const futureDateRail = container.ownerDocument.createElement('div');
  futureDateRail.className = 'atlas-funnest-future-date-rail';
  futureDateRail.dataset.atlasFunnestFutureDateRail = 'true';
  futureDateRail.setAttribute('role', 'group');
  futureDateRail.dataset.timezone = timezone;
  futureDateRail.setAttribute('aria-label', `관측 봉 이후 달력 날짜 (${timezone})`);
  futureDateRail.style.cssText = 'position:absolute;left:0;top:0;height:0;width:0;overflow:hidden;pointer-events:none;z-index:2;';
  host.appendChild(futureDateRail);
  // The pinned engine creates the base canvas first and the crosshair/input
  // overlay canvas second. Keep the date rail between those native layers so
  // its text never covers the native crosshair's date badge.
  const nativeCanvases = [...host.querySelectorAll('.fnc-chart > canvas')];
  const originalCanvasZ = nativeCanvases.map(canvas => canvas.style.zIndex);
  if (nativeCanvases.length === 2) { nativeCanvases[0].style.zIndex = '1'; nativeCanvases[1].style.zIndex = '3'; }
  cleanups.push(() => nativeCanvases.forEach((canvas, index) => { canvas.style.zIndex = originalCanvasZ[index]; }));
  const clearFutureDateTicks = () => { futureDateTicks = []; futureDateRail.replaceChildren(); };
  const readFutureDateTicks = () => futureDateTicks.map(tick => ({ time: tick.time, label: tick.label, x: tick.x }));
  Object.defineProperty(host, 'getAtlasFunnestFutureDateTicks', { configurable: true, enumerable: false, writable: false, value: readFutureDateTicks });
  const futureDateOverlay = chart.addOverlay({
    layer: 'above',
    render({ coords, painter }) {
      if (destroyed || !currentBars.length) { clearFutureDateTicks(); return; }
      const layout = chart.layout, plotWidth = Math.min(Number(coords?.plotWidth), Number(layout?.plotWidth));
      const axisHeight = Number(layout?.timeAxisHeight), axisTop = Number(layout?.panesHeight);
      if (!(plotWidth > 0 && axisHeight > 0 && axisTop >= 0) || typeof coords?.timeToX !== 'function' || typeof painter?.measure !== 'function') { clearFutureDateTicks(); return; }
      futureDateRail.style.top = `${axisTop}px`;
      futureDateRail.style.height = `${axisHeight}px`;
      futureDateRail.style.width = `${plotWidth}px`;
      futureDateRail.style.fontSize = `${Number(chart.theme?.fontSize) || 12}px`;
      futureDateRail.style.fontFamily = chart.theme?.fontFamily || 'sans-serif';
      futureDateRail.style.color = chart.theme?.textSecondary || 'var(--muted, #7e7e87)';
      const visible = chart.getVisibleTimeRange?.(), lastObserved = currentBars.at(-1)?.time;
      const interval = sourceInterval(currentBars);
      if (!visible || !Number.isFinite(lastObserved) || visible.to <= lastObserved + interval) { clearFutureDateTicks(); return; }
      const observedX = coords.timeToX(lastObserved), candidates = [];
      const firstFuture = Math.max(lastObserved + interval, visible.from);
      const firstDate = calendarPartsAt(firstFuture, timezone);
      let year = firstDate.year, month = firstDate.month;
      let time = zonedMonthStart(year, month, timezone);
      if (time < firstFuture) { month++; if (month > 12) { month = 1; year++; } time = zonedMonthStart(year, month, timezone); }
      for (let count = 0; time <= visible.to && count < 8_000; count++) {
        if (time >= visible.from && time > lastObserved) candidates.push({ time, label: futureMonthLabel(year, month) });
        month++; if (month > 12) { month = 1; year++; } time = zonedMonthStart(year, month, timezone);
      }
      const accepted = [];
      for (const candidate of candidates) {
        const x = coords.timeToX(candidate.time), width = painter.measure(candidate.label);
        if (![x, width, observedX].every(Number.isFinite) || x - width / 2 < 0 || x + width / 2 > plotWidth || x - observedX < NATIVE_TIME_LABEL_MIN_GAP) continue;
        const previous = accepted.at(-1);
        if (previous && x - previous.x < Math.max(NATIVE_TIME_LABEL_MIN_GAP, (width + previous.width) / 2 + 4)) continue;
        accepted.push({ ...candidate, x, width });
      }
      // For short future windows with no month boundary, offer one exact UTC day label.
      if (!accepted.length) {
        let day = Math.ceil(firstFuture / 86_400_000) * 86_400_000;
        const label = futureDayLabel(day, timezone, locale), x = coords.timeToX(day), width = painter.measure(label);
        if (day <= visible.to && day > lastObserved && [x, width, observedX].every(Number.isFinite) && x - width / 2 >= 0 && x + width / 2 <= plotWidth && x - observedX >= NATIVE_TIME_LABEL_MIN_GAP) accepted.push({ time: day, label, x, width });
      }
      const keyed = new Map([...futureDateRail.children].map(node => [node.dataset.utcDate, node]));
      const nodes = accepted.map(({ time, label, x }) => {
        const key = new Date(time).toISOString().slice(0, 10); // Stable UTC identity, separate from the configured-zone label.
        const node = keyed.get(key) || container.ownerDocument.createElement('span');
        node.dataset.utcDate = key;
        node.textContent = label;
        node.style.cssText = `position:absolute;left:${x}px;top:50%;transform:translate(-50%,-50%);white-space:nowrap;font:inherit;color:inherit;pointer-events:none;`;
        return node;
      });
      futureDateRail.replaceChildren(...nodes);
      futureDateTicks = accepted.map(({ time, label, x }) => Object.freeze({ time, label, x }));
    },
  });
  cleanups.push(() => {
    clearFutureDateTicks();
    futureDateOverlay?.remove?.();
    if (Object.getOwnPropertyDescriptor(host, 'getAtlasFunnestFutureDateTicks')?.value === readFutureDateTicks) delete host.getAtlasFunnestFutureDateTicks;
    futureDateRail.remove();
  });
  cleanups.push(chart.on('layoutChange', layout => {
    if (destroyed || !(layout.plotWidth > 0 && layout.panesHeight > 0)) return;
    const spacingRange = initialRangeOwned && ownedRange ? ownedRange : retainedRange || pendingRange;
    configureRetainedRangeSpacing(spacingRange, Number(chart.timeScale?.width) || Number(layout.plotWidth));
    // Retained fit density survives user navigation, but a released viewport is
    // never overwritten by a late layout callback. Only an active explicit owner
    // or one not-yet-applied pending range may set the native time window.
    const targetRange = initialRangeOwned && ownedRange ? ownedRange : pendingRange;
    if (!targetRange) return;
    const current = chart.getVisibleTimeRange?.();
    const tolerance = Math.max(1, sourceInterval(currentBars) * 1e-7);
    if (!current || Math.abs(current.from - targetRange.from) > tolerance || Math.abs(current.to - targetRange.to) > tolerance) {
      chart.setVisibleTimeRange(targetRange); pendingRange = null;
    }
  }));
  cleanups.push(chart.on('crosshairMove', detail => {
    if (destroyed) return;
    crosshairEventSequence++;
    lastCrosshair = detail ? { index: detail.index, time: detail.time, x: detail.x, y: detail.y, value: detail.value, pane: detail.pane, source: detail.source,
      bar: detail.bar ? sourceMode === 'close-only' ? { time: detail.bar.time, close: detail.bar.close } : { ...detail.bar } : null } : null;
    const readout = sourceMode === 'close-only' && detail?.bar
      ? { time: detail.bar.time, bar: { time: detail.bar.time, close: detail.bar.close }, value: detail.bar.close, sourceMode: 'close-only' }
      : detail;
    onCrosshair(readout);
    clearTimeout(announceTimer);
    if (readout?.bar) announceTimer = setTimeout(() => {
      if (destroyed) return;
      const bar = readout.bar, time = new Date(bar.time).toISOString().replace('T', ' ').slice(0, 16);
      status.textContent = sourceMode === 'close-only' ? `${time} · 관측 종가 ${bar.close}` : `${time} · O ${bar.open} · H ${bar.high} · L ${bar.low} · C ${bar.close}${bar.volume === undefined ? '' : ` · 거래량 ${bar.volume}`}`;
    }, 180);
  }));
  cleanups.push(chart.on('visibleRangeChange', detail => {
    if (destroyed) return;
    const actual = chart.getVisibleTimeRange?.();
    if (actual && Number.isFinite(actual.from) && Number.isFinite(actual.to) && actual.to > actual.from) {
      if (!initialRangeOwned) retainedRange = actual;
      retainedMaxSpan = Math.max(retainedMaxSpan, sourceRangeSpan(currentBars, initialRangeOwned && ownedRange ? ownedRange : actual));
    }
    onViewport(detail);
  }));
  cleanups.push(chart.on('error', error => {
    if (!destroyed) { host.dataset.state = 'error'; status.textContent = '차트 엔진 오류 · 가격 자료를 표시할 수 없습니다.'; onError(error); }
  }));
  cleanups.push(chart.on('dataChange', () => {
    if (!destroyed) {
      clearFutureDateTicks(); futureDateOverlay.redraw?.();
      host.dataset.state = currentBars.length ? 'ready' : 'empty';
      status.textContent = currentBars.length ? `${currentBars.length}개 ${sourceMode === 'close-only' ? '실제 관측 종가' : '실제 관측 봉'} · ${new Date(currentBars.at(-1).time).toISOString()}` : '표시할 실제 관측 가격 자료가 없습니다.';
    }
  }));
  host.dataset.state = currentBars.length ? 'loading' : 'empty';
  if (!currentBars.length) status.textContent = '표시할 실제 관측 가격 자료가 없습니다.';
  const onKeyDown = event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    if (!currentBars.length) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); releaseInitialRange(); chart.scrollBars(event.key === 'ArrowLeft' ? -Math.max(1, Math.round(currentBars.length * 0.02)) : Math.max(1, Math.round(currentBars.length * 0.02)));
    } else if (event.key === '+' || event.key === '=') { event.preventDefault(); releaseInitialRange(); chart.zoom(1.2); }
    else if (event.key === '-' || event.key === '_') { event.preventDefault(); releaseInitialRange(); chart.zoom(1 / 1.2); }
    else if (event.key === 'Home') { event.preventDefault(); releaseInitialRange(); chart.setVisibleTimeRange({ from: currentBars[0].time, to: currentBars.at(-1).time }); }
    else if (event.key === 'End') { event.preventDefault(); releaseInitialRange(); chart.scrollToRealtime(); }
  };
  host.addEventListener('keydown', onKeyDown);
  const releaseInitialRange = () => { initialRangeOwned = false; pendingRange = null; userRange = true; };
  container.addEventListener('pointerdown', releaseInitialRange, true);
  container.addEventListener('wheel', releaseInitialRange, { capture: true, passive: true });
  cleanups.push(() => {
    container.removeEventListener('pointerdown', releaseInitialRange, true);
    container.removeEventListener('wheel', releaseInitialRange, true);
  });
  // Atlas's time-axis rule, shared with its SVG charts: dragging right shows e^(2 * travel / plot width)
  // times as many bars around the pressed date. Funnest 0.6.22's own axis drag does the reverse
  // around the plot's right edge, so this takes the gesture before the engine's pointer controller.
  if (typeof chart.timeScale?.zoom !== 'function' || typeof chart.invalidate !== 'function') throw new TypeError('Funnest 0.6.22 time-scale zoom is unavailable');
  let axisDrag = null;
  const onAxisPointerDown = event => {
    if (axisDrag || destroyed || event.button !== 0 || event.isPrimary === false) return;
    const rect = host.getBoundingClientRect(), layout = chart.layout;
    if (!(rect.width > 0 && rect.height > 0 && layout?.width > 0 && layout.height > 0 && layout.plotWidth > 0)) return;
    const perPixel = layout.width / rect.width, x = (event.clientX - rect.left) * perPixel, y = (event.clientY - rect.top) * layout.height / rect.height;
    if (!(x >= 0 && x < layout.plotWidth && y >= layout.panesHeight && y <= layout.height)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    axisDrag = { pointerId: event.pointerId, clientX: event.clientX, anchorX: x, perPixel, barSpacing: chart.timeScale.barSpacing, rightOffset: chart.timeScale.rightOffset };
    event.target?.setPointerCapture?.(event.pointerId);
  };
  const onAxisPointerMove = event => {
    if (!axisDrag || event.pointerId !== axisDrag.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const travel = Math.min(2, Math.max(-2, (event.clientX - axisDrag.clientX) * axisDrag.perPixel / chart.timeScale.width));
    chart.timeScale.barSpacing = axisDrag.barSpacing; chart.timeScale.rightOffset = axisDrag.rightOffset;
    chart.timeScale.zoom(axisDrag.anchorX, Math.exp(-2 * travel));
    chart.invalidate();
  };
  const onAxisPointerEnd = event => {
    if (!axisDrag || event.pointerId !== axisDrag.pointerId) return;
    event.stopImmediatePropagation(); axisDrag = null;
  };
  const axisDragListeners = [['pointerdown', onAxisPointerDown], ['pointermove', onAxisPointerMove], ['pointerup', onAxisPointerEnd], ['pointercancel', onAxisPointerEnd]];
  for (const [type, handler] of axisDragListeners) host.addEventListener(type, handler, true);
  cleanups.push(() => { for (const [type, handler] of axisDragListeners) host.removeEventListener(type, handler, true); });
  const api = {
    engine: 'funnest',
    chart,
    host,
    get state() { return host.dataset.state || 'loading'; },
    userOwnsRange() { return userRange; },
    ready() {
      if (!currentBars.length) return Promise.resolve({ painted: false, status: 'empty', bars: 0 });
      if (readyPromise) return readyPromise;
      readyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Funnest chart did not paint within 5 seconds')), 5000);
        const check = () => requestAnimationFrame(() => requestAnimationFrame(() => {
          if (destroyed) { clearTimeout(timeout); reject(new Error('Funnest chart was destroyed before paint')); return; }
          const canvas = host.querySelector('canvas');
          const layout = chart.layout;
          if (canvas?.width > 0 && canvas?.height > 0 && layout.plotWidth > 0 && layout.panesHeight > 0 && host.getBoundingClientRect().width > 0 && host.getBoundingClientRect().height > 0 && currentBars.length > 0 && chart.bars.length === currentBars.length) {
            try {
              const image = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
              let first = null, varied = false;
              for (let i = 0; image && i < image.length; i += 4 * Math.max(1, Math.floor(image.length / 16000))) {
                const pixel = `${image[i]},${image[i + 1]},${image[i + 2]},${image[i + 3]}`;
                if (first === null) first = pixel; else if (pixel !== first) { varied = true; break; }
              }
              if (varied) { clearTimeout(timeout); host.dataset.state = 'ready'; status.textContent = `${currentBars.length}개 실제 관측 봉 · Funnest 차트 준비 완료`; resolve({ painted: true, status: 'ready', bars: chart.bars.length, canvas: { width: canvas.width, height: canvas.height } }); return; }
            } catch (error) { clearTimeout(timeout); reject(error); return; }
          }
          if (typeof requestAnimationFrame === 'function') check();
        }));
        check();
      });
      return readyPromise;
    },
    setData(nextBars, { preserveRange = true } = {}) {
      const previousRange = preserveRange ? chart.getVisibleTimeRange() : null;
      lastCrosshair = null; clearFutureDateTicks(); mapData(nextBars); retainedMaxSpan = sourceRangeSpan(currentBars, initialRangeOwned && ownedRange ? ownedRange : retainedRange); host.dataset.state = currentBars.length ? 'loading' : 'empty';
      if (!currentBars.length) status.textContent = '표시할 실제 관측 가격 자료가 없습니다.';
      chart.setData(currentBars);
      if (previousRange) requestAnimationFrame(() => chart.setVisibleTimeRange(previousRange));
      readyPromise = null;
    },
    setRange(nextRange) { if (!nextRange || !(nextRange.to > nextRange.from)) return false; ownedRange = nextRange; retainedRange = nextRange; retainedMaxSpan = sourceRangeSpan(currentBars, nextRange); retainedFitException = true; initialRangeOwned = true; userRange = false; pendingRange = null; configureRetainedRangeSpacing(nextRange); chart.setVisibleTimeRange(nextRange); return true; },
    setChartType(nextType) {
      if (!['candles', 'line', 'area'].includes(nextType)) throw new RangeError('Unsupported Funnest chart type');
      if (sourceMode === 'close-only' && nextType !== 'line') throw new RangeError('Close-only sources cannot be presented as candles or area OHLC');
      chart.setChartType(nextType);
    },
    setScale(nextScale) { if (!['normal', 'log', 'percent'].includes(nextScale)) throw new RangeError('Unsupported Funnest scale'); chart.setSettings({ priceScale: nextScale }); },
    setInverted(nextInverted) { currentInverted = Boolean(nextInverted); return setFunnestPriceScaleInverted(chart, currentInverted); },
    setPriceExtrema(domain) { setFunnestPriceExtrema(chart, domain); },
    inspect() { return inspectAtlasFunnestChart({ chart, host, source: { ...source, volumeSource: volumeSource || null }, sourceMode, observations, crosshair: lastCrosshair, crosshairEventSequence, state: host.dataset.state || 'unknown' }); },
    setDrawingTool(tool) { chart.setDrawingTool(tool); },
    setMagnet(on) { chart.setMagnet(Boolean(on)); },
    setTheme(nextTheme) { chart.setTheme({ ...DEFAULT_THEME, ...nextTheme }); },
    addOverlay(overlay) { return chart.addOverlay(overlay); },
    getBars() { return sourceMode === 'close-only' ? observations.map(point => ({ ...point })) : currentBars.map(bar => ({ ...bar })); },
    destroy() {
      if (destroyed) return;
      destroyed = true; clearTimeout(announceTimer); host.removeEventListener('keydown', onKeyDown);
      for (const cleanup of cleanups) cleanup?.(); chart.destroy(); host.remove(); status.remove();
    },
  };
  cleanups.push(exposeAtlasFunnestSnapshot(host, () => api.inspect()));
  return api;
}

export { DEFAULT_THEME as ATLAS_FUNNEST_THEME };
