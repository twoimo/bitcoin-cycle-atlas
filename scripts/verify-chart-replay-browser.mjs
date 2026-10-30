import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Uses the existing native-CDP harness. These are real page interactions, not
// renderer mocks, and do not claim prospective forecast accuracy.
export const chartReplayBrowserCases = [
  { symbol: 'BTCUSD', surface: 'btc', width: 1440, height: 900, touch: false },
  { symbol: 'BTCUSD', surface: 'btc', width: 320, height: 568, touch: true },
  { symbol: 'BTCUSD', surface: 'btc', width: 900, height: 430, touch: true },
  { symbol: 'ETHUSD', surface: 'eth', width: 1440, height: 900, touch: false },
  { symbol: 'ETHUSD', surface: 'eth', width: 320, height: 568, touch: true },
  { symbol: 'MSTR', surface: 'mstr', width: 1440, height: 900, touch: false },
  { symbol: 'BMNR', surface: 'bmnr', width: 390, height: 844, touch: true },
].map(spec => ({ ...spec, page: 'chart-replay-' + spec.surface, chartReplay: true,
  route: '/?symbol=' + spec.symbol + '&granularity=daily&type=line' }));

const digest = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function verifyChartReplaySurface(api) {
  const { cdp, browser, receipt, root, outputDirectory, evaluate, until, settled, click, bounds, visibleBounds, screenshot, verifyOfflineRefresh } = api;
  const { symbol, width, height, touch } = receipt;
  const crypto = ['BTCUSD', 'ETHUSD'].includes(symbol), btc = symbol === 'BTCUSD';
  const chartSelector = btc ? '#lab-chart' : symbol === 'ETHUSD' ? '#eth-chart' : '#equity-chart';
  const panel = '.chart-replay-controls', control = name => panel + ' [data-cr="' + name + '"]';
  const prefix = receipt.page + '-' + width + 'x' + height;
  const evidence = receipt.chartReplay = { symbol, nativeInput: true, states: [], exports: [], lifecycle: [],
    scope: 'Existing main chart node, real page controls, native pointer/touch/keyboard, and downloaded visible-frame JSON. Current-vintage replay is retrospective.' };
  const ledger = resolve(root, 'dist/data', btc ? 'forecast-ledger' : 'asset-forecast-ledger');
  const ledgerIndex = JSON.parse(await readFile(resolve(ledger, 'index.json'), 'utf8'));
  const raw = async path => JSON.parse(await readFile(resolve(root, 'dist', path), 'utf8'));
  const priceArchive = await raw(btc ? 'data/btc-daily.json' : symbol === 'ETHUSD' ? 'data/replay-eth-ohlc.json' : 'data/' + symbol.toLowerCase() + '-ohlc.json');
  const btcCandles = btc ? (await raw('data/btc-volume.json')).bars : null;
  const initialAtlas = btc ? await raw('data/project-origin-btc-2026-10-21.json') : null;
  let currentAtlasModel = null;
  const archiveRows = mode => btc ? ['recorded', 'project-baseline'].includes(mode) ? priceArchive.prices.map(([date, price]) => ({ date, price })) : btcCandles.map(row => ({ ...row, price: row.close })) :
    (symbol === 'ETHUSD' ? priceArchive.dailyHistory.candles : priceArchive.candles).map(row => ({ ...row, date: row.date.slice(0, 10), price: row.close }));

  async function key(value, code, number, modifiers = 0, wait = true) {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: value, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers,
      ...(type === 'keyDown' && value === 'Enter' && !modifiers ? { text: '\r', unmodifiedText: '\r' } : {}) });
    if (wait) await settled(cdp);
  }
  async function select(selector, value) {
    const choices = await evaluate(cdp, selector => [...document.querySelector(selector).options].filter(option => !option.disabled).map(option => option.value), selector);
    const index = choices.indexOf(value); assert.ok(index >= 0, 'Unavailable native option: ' + value);
    await click(cdp, selector); await key('Home', 'Home', 36, 0, false);
    for (let i = 0; i < index; i++) await key('ArrowDown', 'ArrowDown', 40, 0, false);
    await key('Enter', 'Enter', 13);
    await until(() => evaluate(cdp, ({ selector, value }) => document.querySelector(selector)?.value === value, { selector, value }), 'native replay selection ' + value);
  }
  async function ready(selecting = false) {
    await until(async () => {
      const value = await evaluate(cdp, selector => ({ state: document.querySelector(selector)?.dataset.state,
        painted: Boolean(document.querySelector('svg[data-chart-replay-active="true"] [data-chart-replay-overlay]')),
        message: document.querySelector('.chart-replay-hud [role="status"]')?.textContent }), panel);
      if (value.state === 'error') throw new Error('Main-chart replay failed: ' + value.message);
      return value.painted && (selecting ? value.state === 'selecting' : ['paused', 'ended', 'playing'].includes(value.state));
    }, selecting ? 'main chart start selection' : 'main chart replay ready');
    await settled(cdp);
  }
  async function snapshot(label, capture = false) {
    const value = await evaluate(cdp, ({ chartSelector, panel }) => {
      const svg = document.querySelector(chartSelector), controls = document.querySelector(panel), q = name => controls.querySelector('[data-cr="' + name + '"]');
      const plot = svg.closest('.atlas-plot'), box = svg.getBoundingClientRect();
      const candles = [...svg.querySelectorAll('.observed-candle')].map(node => ({ date: node.dataset.date,
        open: Number(node.dataset.open), high: Number(node.dataset.high), low: Number(node.dataset.low), close: Number(node.dataset.close) }));
      const candleBatches = [...svg.querySelectorAll('.observed-candles-batched')];
      const wickXs = candleBatches.flatMap(group => [...group.querySelectorAll('path[stroke]')].flatMap(path =>
        [...(path.getAttribute('d') ?? '').matchAll(/M(-?\d+(?:\.\d+)?),/g)].map(match => Number(match[1]))));
      return { sameNode: svg === globalThis.__mainReplayNode, sameDocument: performance.timeOrigin === globalThis.__mainReplayTime,
        active: svg.dataset.chartReplayActive === 'true', state: controls.dataset.state, origin: svg.dataset.replayOrigin, cursor: svg.dataset.replayCursor,
        playbackStartDate: svg.dataset.replayStartDate ?? null,
        index: Number(q('scrub').value), lastIndex: Number(q('scrub').max), outputHash: svg.dataset.replayOutputHash,
        mode: q('mode').value, model: q('model')?.value ?? null, dateInput: q('date').value, dateMinimum: q('date').min, dateMaximum: q('date').max, source: q('source').textContent, metric: q('metric').textContent,
        renderer: svg.dataset.replayRenderer ?? null, viewStart: svg.dataset.replayViewStart ?? null, viewEnd: svg.dataset.replayViewEnd ?? null,
        scale: svg.dataset.scale, unit: svg.dataset.unit, chartType: svg.dataset.chartType,
        forecastValueSignature: svg.dataset.forecastValueSignature ?? null,
        annotationSignature: svg.dataset.replayAnnotationSignature ?? null,
        atlasPriceLayer: svg.querySelectorAll('.price-series-layer').length,
        cycleMarkerCount: Number(svg.dataset.cycleMarkerCount ?? 0), cycleIntervalCount: Number(svg.dataset.cycleIntervalCount ?? 0),
        cycleMarkerLayers: svg.querySelectorAll('[data-indicator-layer="cycle-landmarks"]').length,
        cycleIntervalLayers: svg.querySelectorAll('.cycle-interval-overlay-layer').length,
        actualThrough: svg.dataset.replayActualThrough, actualCount: Number(svg.dataset.replayActualCount ?? 0), forecastCount: Number(svg.dataset.replayForecastPoints ?? 0), candles,
        observedCandleCount: Number(svg.dataset.observedCandleCount ?? 0), batchedCandleCount: candleBatches.reduce((count, node) => count + Number(node.dataset.count), 0),
        batchedWickCount: wickXs.length, lastBatchedCandleX: wickXs.length ? Math.max(...wickXs) : null,
        plotLeft: Number(svg.dataset.plotLeft), plotRight: Number(svg.dataset.plotRight),
        forecastPath: svg.querySelector('[data-replay-forecast-path]')?.getAttribute('d') ?? null,
        origins: svg.querySelectorAll('[data-replay-origin-boundary]').length, cursors: svg.querySelectorAll('[data-replay-cursor-line]').length,
        invalidPaths: [...svg.querySelectorAll('path')].filter(node => /NaN|Infinity/.test(node.getAttribute('d') ?? '')).length,
        separateReplayCharts: document.querySelectorAll('[data-forecast-replay] [data-replay-chart]').length, dialogs: document.querySelectorAll('dialog[open]').length,
        liveReadouts: [...plot.querySelectorAll('.atlas-readout,.eth-readout,.workbench-market-info,.equity-legend,.eth-forecast-note')].filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden').length,
        width: innerWidth, height: innerHeight, pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        scrollX, documentScrollLeft: document.documentElement.scrollLeft, bodyScrollLeft: document.body.scrollLeft,
        scrolledAncestors: (() => { const values = []; for (let parent = svg.parentElement; parent; parent = parent.parentElement) if (parent.scrollLeft || parent.scrollTop) values.push({ id: parent.id, className: parent.className, scrollLeft: parent.scrollLeft, scrollTop: parent.scrollTop }); return values; })(),
        chart: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
        nextDisabled: q('next').disabled, previousDisabled: q('previous').disabled };
    }, { chartSelector, panel });
    evidence.lastObservation = { label, ...value, candles: value.candles.map(row => row.date), annotationSignature: undefined,
      annotationSha256: value.annotationSignature === null ? null : digest(value.annotationSignature) };
    assert.ok(value.sameNode && value.sameDocument, 'Replay replaced the main chart or document');
    assert.equal(value.active, true); assert.equal(value.separateReplayCharts, 0); assert.equal(value.dialogs, 0);
    assert.equal(value.invalidPaths, 0); assert.equal(value.liveReadouts, 0, 'Latest quote/readout remained visible during replay');
    assert.ok(value.pageWidth <= width + 1, 'Replay caused horizontal page overflow');
    assert.ok(value.chart.height >= 80 && value.chart.width > 100, 'Replay controls consumed the chart viewport');
    assert.ok(value.chart.left >= -1 && value.chart.right <= width + 1 && value.chart.top >= -1 && value.chart.bottom <= height + 1, 'Main replay SVG escaped viewport: ' + JSON.stringify({ chart: value.chart, width, height, scrollX: value.scrollX, scrolledAncestors: value.scrolledAncestors }));
    if (value.state !== 'selecting') {
      assert.match(value.outputHash, /^[a-f0-9]{64}$/); assert.ok(value.forecastCount > 1 && value.forecastPath);
      assert.ok(value.actualThrough <= value.cursor, 'Main chart exposed an actual beyond the cursor');
      assert.ok(value.candles.every(row => row.date <= value.cursor), 'Main chart exposed a future candle');
      const source = new Map(archiveRows(value.mode).map(row => [row.date, row]));
      for (const row of value.candles) for (const key of ['open', 'high', 'low', 'close']) assert.equal(row[key], source.get(row.date)?.[key], 'Rendered OHLC changed preserved ' + key);
      if (value.mode === 'atlas-chart') {
        assert.equal(value.renderer, 'atlas', 'Direct BTC replay replaced the Atlas price renderer');
        assert.equal(value.atlasPriceLayer, 1, 'The existing Atlas price-series layer is missing');
        assert.ok(value.cycleMarkerLayers > 0 && value.cycleMarkerCount > 0, 'Direct replay removed the cycle landmarks');
        assert.ok(value.cycleIntervalLayers > 0 && value.cycleIntervalCount > 0, 'Direct replay removed the cycle period lines');
        assert.ok(value.annotationSignature, 'Frozen cycle annotation identity is missing');
        const expectedCandles = archiveRows(value.mode).filter(row => row.date >= value.viewStart && row.date <= value.viewEnd && row.date <= value.cursor);
        assert.equal(value.observedCandleCount, expectedCandles.length, 'The current-chart candle layer omitted or invented source bars');
        assert.equal(value.observedCandleCount, value.candles.length + value.batchedCandleCount);
        assert.equal(value.batchedWickCount, value.batchedCandleCount, 'Dense rendering dropped genuine candle wicks');
        const cursorX = value.plotLeft + (Date.parse(value.cursor) - Date.parse(value.viewStart)) / (Date.parse(value.viewEnd) - Date.parse(value.viewStart)) * (value.plotRight - value.plotLeft);
        if (value.lastBatchedCandleX !== null) assert.ok(value.lastBatchedCandleX <= cursorX + .02, 'A dense actual candle painted beyond the reveal cursor');
      }
    }
    evidence.states.push({ label, ...value, candles: value.candles.map(row => row.date), forecastPath: undefined, forecastPathSha256: value.forecastPath === null ? null : digest(value.forecastPath),
      annotationSignature: undefined, annotationSha256: value.annotationSignature === null ? null : digest(value.annotationSignature) });
    if (capture) await screenshot(cdp, prefix + '-' + label + '.png', receipt);
    return value;
  }
  async function exported(label) {
    const before = await snapshot(label + '-before-export');
    await click(cdp, control('details'));
    const parent = resolve(outputDirectory, 'chart-replay-downloads', prefix); await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(resolve(parent, label + '-'));
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory, eventsEnabled: true });
    await click(cdp, control('export'));
    const file = await until(async () => { const files = (await readdir(directory)).filter(name => name.endsWith('.json')); assert.ok(files.length <= 1); return files[0]; }, 'main-chart replay JSON download');
    const bytes = await readFile(resolve(directory, file)), payload = JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.kind, 'atlas-visible-chart-replay'); assert.equal(payload.identity.symbol, symbol); assert.equal(payload.identity.outputHash, before.outputHash);
    assert.equal(payload.frame.cursorDate, before.cursor); assert.ok(payload.frame.actual.every(row => row.date > before.origin && row.date <= before.cursor));
    const observed = new Map(archiveRows(before.mode).map(row => [row.date, row]));
    for (const row of payload.frame.actual) {
      const source = observed.get(row.date); assert.ok(source, 'Exported actual date is absent in the source'); assert.equal(row.price, source.price);
      for (const key of ['open', 'high', 'low', 'close']) if (source[key] !== undefined) assert.equal(row[key], source[key]);
    }
    for (const row of payload.frame.targets) if (row.targetDate > before.cursor) assert.equal(row.actual, null);
    assert.equal(payload.frame.metrics.calibrated, false); assert.equal(payload.frame.metrics.independentSampleCount, null);
    if (before.mode === 'recorded') {
      const entry = ledgerIndex.entries.find(row => row.id === payload.identity.recordId); assert.ok(entry);
      const record = JSON.parse(await readFile(resolve(ledger, entry.recordPath), 'utf8')); assert.equal(payload.identity.outputHash, record.outputHash);
      const stored = new Map(record.output.path.map(row => [row[0], row]));
      for (const row of payload.frame.forecast) for (const key of ['price', 'lower', 'upper', 'baselinePrice']) assert.equal(row[key], stored.get(row.date)[record.output.columns.indexOf(key)] ?? null, 'Changed preserved forecast ' + key);
    }
    if (before.mode === 'project-baseline') {
      const original = initialAtlas.scenario.path.map(row => ({ date: row.date, price: row.price,
        lower: row.low, upper: row.high, baselinePrice: null }));
      assert.equal(original.length, 1098, 'The initial Atlas evidence path is incomplete');
      assert.deepEqual(payload.frame.forecast, original, 'Direct chart replay changed the original project-start forecast path');
    }
    if (before.mode === 'atlas-chart') {
      assert.ok(currentAtlasModel, 'The native current-model download must precede replay');
      const current = currentAtlasModel.path.map(row => ({ date: row.date, price: row.price,
        lower: row.lower ?? null, upper: row.upper ?? null, baselinePrice: row.baselinePrice ?? null,
        ...(row.representativePrice === undefined ? {} : { representativePrice: row.representativePrice }) }));
      assert.deepEqual(payload.frame.forecast, current, 'Replay rewrote the orange forecast that was already on the current chart');
      assert.equal(payload.identity.forecastOriginDate, currentAtlasModel.asOf);
      assert.equal(payload.identity.currentChartSnapshot, true); assert.equal(payload.identity.issuedAt, null);
      assert.equal(payload.frame.policy.forecastScoringEnabled, false);
      assert.deepEqual(payload.frame.dailyComparisons, [], 'A current snapshot was scored as a historically issued forecast');
      assert.equal(payload.frame.metrics.matchedCount, 0); assert.equal(payload.frame.metrics.meanAbsolutePercentageError, null);
    }
    evidence.exports.push({ label, file: relative(outputDirectory, resolve(directory, file)), bytes: bytes.length, sha256: digest(bytes), outputHash: payload.identity.outputHash,
      cursor: before.cursor, actualDates: payload.frame.actual.map(row => row.date), forecastSha256: digest(JSON.stringify(payload.frame.forecast)) });
    await click(cdp, control('hide-details')); return payload;
  }
  async function pointAction(type, point) {
    if (type === 'tap') {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    }
    await settled(cdp);
  }
  async function touchPan(label) {
    const before = await snapshot(label + '-before-hold');
    const gesture = await evaluate(cdp, selector => {
      const svg = document.querySelector(selector), box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
      const left = Number(svg.dataset.plotLeft), right = Number(svg.dataset.plotRight);
      return { x: box.left + (left + right) / 2 / view.width * box.width,
        y: box.top + (Number(svg.dataset.plotTop) + Number(svg.dataset.priceBottom)) / 2 / view.height * box.height,
        delta: Math.min(55, (right - left) / view.width * box.width * .18),
        originX: Number(svg.querySelector('[data-replay-origin-boundary]').getAttribute('x1')) };
    }, chartSelector);
    const hints = () => evaluate(cdp, () => document.querySelectorAll('.chart-touch-tracking-hint:not([hidden])').length);
    assert.equal(await hints(), 0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gesture.x, y: gesture.y, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
    await delay(650); assert.equal(await hints(), 0, 'Live-chart long-press tracking activated during replay');
    for (const fraction of [.4, 1]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gesture.x + gesture.delta * fraction, y: gesture.y, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
      await settled(cdp);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settled(cdp);
    assert.equal(await hints(), 0);
    const after = await snapshot(label + '-hold-pan', true);
    const originX = await evaluate(cdp, selector => Number(document.querySelector(selector).querySelector('[data-replay-origin-boundary]').getAttribute('x1')), chartSelector);
    assert.ok(Math.abs(originX - gesture.originX) > 8, 'Replay chart did not pan after native touch hold');
    assert.equal(after.index, before.index); assert.equal(after.outputHash, before.outputHash); assert.equal(after.actualThrough, before.actualThrough);
    if (before.mode === 'atlas-chart') assert.equal(after.annotationSignature, before.annotationSignature, 'Panning changed the frozen cycle annotations');
    evidence.lifecycle.push({ label: label + '-hold-pans-without-live-tracker', holdMilliseconds: 650, originBeforeX: gesture.originX, originAfterX: originX, cursor: after.cursor });
    return after;
  }

  await until(() => evaluate(cdp, selector => Boolean(document.querySelector(selector)?.querySelector('path')) && Boolean(document.querySelector('#workbench-replay')), chartSelector), 'main price chart and replay control');
  await settled(cdp);
  if (btc) await verifyOfflineRefresh({ phase: 'main-chart-replay-entry' });
  if (btc) {
    // Capture the actual live model through its existing native export action.
    // The replay export must retain every value, not just a matching label/hash.
    const parent = resolve(outputDirectory, 'chart-replay-downloads', prefix); await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(resolve(parent, 'current-model-before-replay-'));
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory, eventsEnabled: true });
    if (width < 620) {
      await click(cdp, chartSelector); await key('k', 'KeyK', 75, 2);
      await until(() => evaluate(cdp, () => document.querySelector('#workspace-dialog')?.open), 'native compact chart command palette');
      await click(cdp, '[aria-label="차트 명령 검색"]');
      await cdp.send('Input.insertText', { text: '차트 레이어' }); await settled(cdp); await key('Enter', 'Enter', 13);
    } else await click(cdp, '[aria-label="차트 레이어"]');
    await click(cdp, '#lab-json');
    const file = await until(async () => { const files = (await readdir(directory)).filter(name => name.endsWith('.json')); assert.ok(files.length <= 1); return files[0]; }, 'native current Atlas model JSON download');
    const bytes = await readFile(resolve(directory, file)); currentAtlasModel = JSON.parse(bytes.toString('utf8'));
    assert.ok(Array.isArray(currentAtlasModel.path) && currentAtlasModel.path.length > 1);
    evidence.currentModelExport = { file: relative(outputDirectory, resolve(directory, file)), bytes: bytes.length, sha256: digest(bytes),
      asOf: currentAtlasModel.asOf, scenario: currentAtlasModel.scenario.id, pathPoints: currentAtlasModel.path.length };
    await click(cdp, '[aria-label="상세 패널 닫기"]'); await settled(cdp);
  }
  const liveContext = btc ? await evaluate(cdp, selector => {
    const svg = document.querySelector(selector);
    return { range: document.querySelector('#workbench-range-label').textContent, scale: svg.dataset.scale, unit: svg.dataset.unit,
      chartType: svg.dataset.chartType, atlasPriceLayer: svg.querySelectorAll('.price-series-layer').length,
      forecastValueSignature: svg.dataset.forecastValueSignature ?? null,
      cycleMarkers: Number(svg.dataset.cycleMarkerCount), cycleIntervals: Number(svg.dataset.cycleIntervalCount) };
  }, chartSelector) : null;
  if (btc) { evidence.liveContext = liveContext; await screenshot(cdp, prefix + '-current-chart-before-replay.png', receipt); }
  await evaluate(cdp, selector => { globalThis.__mainReplayNode = document.querySelector(selector); globalThis.__mainReplayTime = performance.timeOrigin; }, chartSelector);
  await click(cdp, '#workbench-replay'); await ready(crypto && !btc);
  if (btc) {
    const direct = await snapshot('atlas-project-start', true);
    assert.equal(direct.mode, 'atlas-chart', 'One click did not open replay on the current BTC chart');
    assert.equal(direct.state, 'paused'); assert.equal(direct.dateInput, '2026-10-21');
    assert.equal(direct.playbackStartDate, '2026-10-21');
    assert.equal(direct.origin, '2026-10-20'); assert.equal(direct.cursor, '2026-10-20'); assert.equal(direct.index, 0); assert.equal(direct.actualCount, 0);
    assert.equal(direct.chartType, 'candles', 'Direct replay did not use genuine candles as requested');
    assert.ok(direct.observedCandleCount > 0, 'Direct replay did not paint any real historical candles');
    assert.ok(liveContext.forecastValueSignature, 'The live orange forecast value identity is missing');
    assert.equal(direct.forecastValueSignature, liveContext.forecastValueSignature, 'Opening replay replaced the current orange forecast');
    assert.equal(direct.scale, liveContext.scale, 'Opening replay changed the current price scale');
    assert.equal(direct.unit, liveContext.unit, 'Opening replay changed the current price unit');
    const dates = liveContext.range.match(/\d{4}\.\d{2}\.\d{2}/g);
    assert.equal(dates?.length, 2, 'Live chart did not expose its current date range');
    assert.deepEqual([direct.viewStart, direct.viewEnd], dates.map(value => value.replaceAll('.', '-')), 'Replay discarded the current chart viewport');
    assert.match(direct.metric, /현재 예측선 고정.*실제 0봉/); assert.equal(direct.previousDisabled, true);
    const originalAtlas = await exported('atlas-project-start');
    assert.equal(originalAtlas.identity.playbackStartDate, '2026-10-21'); assert.equal(originalAtlas.frame.actual.length, 0);
    await click(cdp, control('next'));
    const firstAtlas = await snapshot('atlas-first-project-bar', true);
    assert.equal(firstAtlas.cursor, '2026-10-21'); assert.equal(firstAtlas.index, 1); assert.equal(firstAtlas.actualCount, 1);
    assert.equal(firstAtlas.outputHash, direct.outputHash); assert.equal(firstAtlas.annotationSignature, direct.annotationSignature);
    assert.equal(firstAtlas.forecastValueSignature, liveContext.forecastValueSignature);
    assert.deepEqual([firstAtlas.viewStart, firstAtlas.viewEnd], [direct.viewStart, direct.viewEnd]);
    const firstAtlasExport = await exported('atlas-first-project-bar');
    assert.deepEqual(firstAtlasExport.frame.forecast, originalAtlas.frame.forecast, 'First actual bar rewrote the initial Atlas forecast');
    await click(cdp, control('scrub')); await key('End', 'End', 35);
    const endAtlas = await snapshot('atlas-last-observed-bar', true);
    assert.equal(endAtlas.index, endAtlas.lastIndex); assert.equal(endAtlas.outputHash, direct.outputHash);
    assert.equal(endAtlas.annotationSignature, direct.annotationSignature); assert.equal(endAtlas.nextDisabled, true);
    assert.equal(endAtlas.forecastValueSignature, liveContext.forecastValueSignature);
    assert.equal(endAtlas.cursor, btcCandles.at(-1).date, 'Replay did not stop at the last real observed candle');
    const endAtlasExport = await exported('atlas-last-observed-bar');
    assert.deepEqual(endAtlasExport.frame.forecast, originalAtlas.frame.forecast, 'Revealing later actuals changed the initial Atlas forecast');
    await click(cdp, control('scrub')); await key('Home', 'Home', 36);
    const resetAtlas = await snapshot('atlas-scrub-rewound');
    assert.equal(resetAtlas.index, 0); assert.equal(resetAtlas.actualCount, 0); assert.equal(resetAtlas.outputHash, direct.outputHash);
    await select(control('speed'), '1'); await click(cdp, control('play'));
    await until(() => evaluate(cdp, selector => Number(document.querySelector(selector).value) >= 2, control('scrub')), 'current Atlas replay starts with native play');
    await click(cdp, control('play'));
    let pausedAtlas = await snapshot('atlas-play-paused'); assert.notEqual(pausedAtlas.state, 'playing');
    await delay(450); assert.equal((await snapshot('atlas-pause-stable')).index, pausedAtlas.index);
    if (touch) pausedAtlas = await touchPan('atlas-touch');
    visibleBounds(await bounds(cdp, control('exit')), width, height);
    await click(cdp, control('exit'));
    await until(() => evaluate(cdp, selector => document.querySelector(selector)?.dataset.chartReplayActive !== 'true' && document.querySelector(selector)?.querySelector('.price-series-layer'), chartSelector), 'restore the same current Atlas chart');
    const restoredAtlas = await evaluate(cdp, selector => {
      const svg = document.querySelector(selector); return { sameNode: svg === globalThis.__mainReplayNode,
        range: document.querySelector('#workbench-range-label').textContent, scale: svg.dataset.scale, unit: svg.dataset.unit, chartType: svg.dataset.chartType,
        cycleMarkers: Number(svg.dataset.cycleMarkerCount), cycleIntervals: Number(svg.dataset.cycleIntervalCount) };
    }, chartSelector);
    assert.equal(restoredAtlas.sameNode, true);
    for (const key of ['range', 'scale', 'unit', 'chartType', 'cycleMarkers', 'cycleIntervals']) assert.equal(restoredAtlas[key], liveContext[key], 'Returning from Atlas replay changed ' + key);
    evidence.lifecycle.push({ label: 'current-chart-restored-with-original-presentation', ...restoredAtlas });
    await click(cdp, '#workbench-replay'); await ready();
    await click(cdp, control('resume')); await ready();
    const resumedAtlas = await snapshot('atlas-resumed-paused');
    assert.equal(resumedAtlas.mode, 'atlas-chart'); assert.equal(resumedAtlas.index, pausedAtlas.index); assert.equal(resumedAtlas.cursor, pausedAtlas.cursor);
    assert.equal(resumedAtlas.outputHash, pausedAtlas.outputHash); assert.equal(resumedAtlas.annotationSignature, pausedAtlas.annotationSignature);
    assert.equal(resumedAtlas.forecastValueSignature, liveContext.forecastValueSignature);
    assert.notEqual(resumedAtlas.state, 'playing'); await delay(450); assert.equal((await snapshot('atlas-resume-stable')).index, resumedAtlas.index);
    evidence.lifecycle.push({ label: 'direct-current-chart-project-replay', projectStart: '2026-10-21', initialObservationCutoff: direct.origin, forecastAsOf: currentAtlasModel.asOf,
      firstRevealedDate: firstAtlas.cursor, finalObservedDate: endAtlas.cursor, outputHash: direct.outputHash, annotationSha256: digest(direct.annotationSignature) });
    // The old prediction is a separate, explicit choice. It must retain the
    // actual original artifact and its Coin Metrics comparison source.
    await select(control('mode'), 'project-baseline'); await ready();
    const originalProject = await snapshot('original-project-forecast', true);
    assert.equal(originalProject.mode, 'project-baseline'); assert.equal(originalProject.renderer, 'atlas');
    assert.equal(originalProject.origin, '2026-10-20'); assert.equal(originalProject.dateInput, '2026-10-21');
    assert.equal(originalProject.index, 0); assert.equal(originalProject.actualCount, 0); assert.equal(originalProject.observedCandleCount, 0);
    assert.notEqual(originalProject.outputHash, direct.outputHash, 'Selecting the original artifact reused the current forecast');
    const projectExport = await exported('original-project-forecast');
    await click(cdp, control('next'));
    const projectNext = await snapshot('original-project-first-observation', true);
    assert.equal(projectNext.cursor, '2026-10-21'); assert.equal(projectNext.outputHash, originalProject.outputHash);
    const projectNextExport = await exported('original-project-first-observation');
    assert.deepEqual(projectNextExport.frame.forecast, projectExport.frame.forecast);
    assert.equal(projectNextExport.frame.actual.length, 1);
    evidence.lifecycle.push({ label: 'explicit-original-project-forecast-is-preserved', outputHash: originalProject.outputHash,
      forecastPoints: projectExport.frame.forecast.length, firstActual: projectNextExport.frame.actual[0].price,
      comparisonSource: projectNext.source });
    // Keep all prior retrospective, genuine-OHLC, and stored-record checks.
    // They are explicit alternatives to the direct current-chart default.
    await select(control('mode'), 'historical-reconstruction'); await ready(true);
    await select(control('display'), 'candles'); await ready(true);
  }
  if (crypto) {
    const selection = await snapshot('start-selection', true); assert.equal(selection.forecastCount, 0);
    const point = await evaluate(cdp, selector => {
      const svg = document.querySelector(selector), line = svg.querySelector('[data-chart-replay-picker]'), rect = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
      if (!line) throw new Error('Missing blue start-point selector');
      return { x: rect.left + Number(line.getAttribute('x1')) / view.width * rect.width,
        y: rect.top + (Number(svg.dataset.plotTop) + Number(svg.dataset.priceBottom)) / 2 / view.height * rect.height };
    }, chartSelector);
    await pointAction(touch ? 'tap' : 'click', point); await ready();
    const picked = await snapshot('chart-picked'); assert.equal(picked.origin, selection.dateInput);
    if (!touch) {
      await click(cdp, control('date')); await key('ArrowDown', 'ArrowDown', 40);
      const date = await evaluate(cdp, selector => document.querySelector(selector).value, control('date'));
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/); assert.notEqual(date, picked.origin, 'Native date editing did not change the chosen origin');
      evidence.lifecycle.push({ label: 'native-date-request', previous: picked.origin, requested: date });
      await key('Enter', 'Enter', 13);
      if (symbol === 'ETHUSD') {
        // This preserved archive cannot fit adaptive states at the earlier
        // origin. It must disclose that fact before an explicit model choice.
        const failure = await until(async () => {
          const result = await evaluate(cdp, ({ panel, chartSelector }) => {
            const controls = document.querySelector(panel), svg = document.querySelector(chartSelector);
            return { state: controls.dataset.state, date: controls.querySelector('[data-cr="date"]').value,
              model: controls.querySelector('[data-cr="model"]').value,
              message: document.querySelector('.chart-replay-hud [role="status"]').textContent,
              inspect: document.querySelector('.chart-replay-inspect').textContent,
              forecasts: svg.querySelectorAll('[data-replay-forecast-path]').length,
              sameNode: svg === globalThis.__mainReplayNode,
              retryVisible: Boolean(controls.querySelector('[data-cr="pooled-retry"]')?.getClientRects().length) };
          }, { panel, chartSelector });
          return result.state === 'error' ? result : false;
        }, 'unsupported adaptive origin is explicitly rejected');
        assert.equal(failure.sameNode, true); assert.equal(failure.date, date); assert.equal(failure.model, 'adaptive');
        assert.match(failure.message, /각 30개 이상 필요/); assert.equal(failure.forecasts, 0);
        assert.equal(failure.inspect, '', 'Failed model retained a stale actual/forecast readout'); assert.equal(failure.retryVisible, true);
        evidence.lifecycle.push({ label: 'unsupported-adaptive-origin-disclosed', ...failure });
        await screenshot(cdp, prefix + '-unsupported-origin.png', receipt);
        await click(cdp, control('pooled-retry')); await ready();
        const retry = await snapshot('explicit-pooled-retry', true);
        assert.equal(retry.origin, date, 'Explicit alternative changed the requested origin'); assert.equal(retry.model, 'pooled'); assert.equal(retry.index, 0);
        evidence.lifecycle.push({ label: 'explicit-alternative-keeps-origin', origin: retry.origin, model: retry.model, outputHash: retry.outputHash });
      } else await ready();
      const changed = await snapshot('date-entered');
      const eligible = archiveRows(changed.mode).map(row => row.date).filter(value => value >= changed.dateMinimum && value <= changed.dateMaximum);
      assert.ok(eligible.length, 'The origin picker must expose a usable source date range');
      const nearest = eligible.reduce((best, candidate) => Math.abs(Date.parse(candidate) - Date.parse(date)) < Math.abs(Date.parse(best) - Date.parse(date)) ? candidate : best, eligible[0]);
      assert.equal(changed.origin, nearest); evidence.lifecycle.push({ label: 'native-date-edit-and-enter', requested: date, origin: changed.origin });
    }
  }
  const origin = await snapshot('fixed-origin', true); assert.equal(origin.index, 0); assert.equal(origin.actualCount, 0);
  if (crypto && origin.mode === 'historical-reconstruction') assert.ok(origin.observedCandleCount > 0, 'Historical reconstruction stopped painting genuine candles');
  let progressed = origin;
  assert.ok(origin.metric.includes('평가 대기')); assert.equal(origin.previousDisabled, true);
  const original = await exported('fixed-origin'); assert.equal(original.frame.actual.length, 0);
  if (symbol === 'ETHUSD' && !touch) assert.match(original.identity.modelVersion, /pooled/, 'Export did not disclose the explicitly chosen alternative model');
  if (origin.lastIndex > 0) {
    await click(cdp, control('next'));
    const first = await snapshot('next-bar', true);
    assert.equal(first.index, 1); assert.equal(first.outputHash, origin.outputHash);
    const next = archiveRows(first.mode).find(row => row.date > origin.origin); assert.equal(first.cursor, next.date);
    const step = await exported('next-bar'); assert.deepEqual(step.frame.forecast, original.frame.forecast, 'Next bar changed the fixed prediction'); assert.equal(step.frame.actual.length, 1);
    await click(cdp, chartSelector); await key('ArrowLeft', 'ArrowLeft', 37, 8);
    const rewound = await snapshot('keyboard-rewind'); assert.equal(rewound.index, 0); assert.equal(rewound.outputHash, origin.outputHash);
    const rewindExport = await exported('rewound-origin'); assert.deepEqual(rewindExport.frame.forecast, original.frame.forecast, 'Rewind changed preserved forecast values');
    await key('ArrowRight', 'ArrowRight', 39, 8); progressed = await snapshot('keyboard-forward'); assert.equal(progressed.index, 1);
    if (crypto && origin.lastIndex > 8) {
      await select(control('speed'), '4'); await click(cdp, control('play'));
      await until(() => evaluate(cdp, selector => Number(document.querySelector(selector).value) >= 4, control('scrub')), 'native autoplay advances actual bars');
      await click(cdp, control('play')); const paused = await snapshot('paused'); assert.equal(paused.state, 'paused');
      await delay(450); assert.equal((await snapshot('pause-stable')).index, paused.index);
      progressed = paused;
      evidence.lifecycle.push({ label: 'pause-stops-playback', index: paused.index, waitMilliseconds: 450 });
    }
  } else {
    assert.equal(origin.nextDisabled, true); evidence.lifecycle.push({ label: 'no-future-observations', inventedBars: false });
  }
  if (touch) await touchPan('touch');
  if (crypto) {
    await select(control('mode'), 'recorded'); await ready();
    const recorded = await snapshot('preserved-record', true); assert.equal(recorded.index, 0);
    const preserved = await exported('preserved-record'); assert.equal(preserved.identity.recordId, await evaluate(cdp, selector => document.querySelector(selector).value, control('record')));
    if (btc) assert.equal(recorded.candles.length, 0, 'Saved Coin Metrics prices were substituted with exchange candles');
    if (recorded.lastIndex > 0) { await click(cdp, control('next')); await snapshot('preserved-record-next'); }
  }
  visibleBounds(await bounds(cdp, control('exit')), width, height);
  const beforeExit = await snapshot('before-exit');
  // Opening a saved record that has no later actual bars must not erase a
  // meaningful rehearsal. Resume keeps the prior progressed session in that case.
  const expectedResume = beforeExit.mode === 'recorded' && beforeExit.index === 0 && origin.mode === 'historical-reconstruction' && progressed.index > 0 ? progressed : beforeExit;
  evidence.lifecycle.push({ label: 'resume-session-policy',
    behavior: expectedResume === progressed ? 'unprogressed-record-keeps-prior-progress' : 'progressed-session-becomes-resume-target',
    previousOrigin: origin.origin, selectedOrigin: beforeExit.origin, selectedIndex: beforeExit.index,
    expectedOrigin: expectedResume.origin, expectedIndex: expectedResume.index });
  await click(cdp, control('exit'));
  await until(() => evaluate(cdp, selector => document.querySelector(selector)?.dataset.chartReplayActive !== 'true' && document.querySelector(selector)?.querySelector('path'), chartSelector), 'restore main chart');
  const restored = await evaluate(cdp, ({ chartSelector, panel }) => ({ sameNode: document.querySelector(chartSelector) === globalThis.__mainReplayNode,
    controlsHidden: document.querySelector(panel).hidden, active: document.documentElement.dataset.chartReplayActive,
    overlayCount: document.querySelector(chartSelector).querySelectorAll('[data-chart-replay-overlay]').length,
    triggerPressed: document.querySelector('#workbench-replay').getAttribute('aria-pressed'),
    toolbarInert: [...document.querySelector('#workbench-replay').parentElement.children].filter(node => node.inert).length }), { chartSelector, panel });
  assert.equal(restored.sameNode, true); assert.equal(restored.controlsHidden, true); assert.equal(restored.active, undefined); assert.equal(restored.overlayCount, 0); assert.equal(restored.triggerPressed, 'false'); assert.equal(restored.toolbarInert, 0);
  evidence.restored = restored; await screenshot(cdp, prefix + '-latest-restored.png', receipt);
  await click(cdp, '#workbench-replay'); await ready(crypto && beforeExit.mode !== 'recorded');
  await click(cdp, control('resume')); await ready();
  const resumed = await snapshot('resumed-paused'); assert.equal(resumed.origin, expectedResume.origin); assert.equal(resumed.index, expectedResume.index); assert.equal(resumed.outputHash, expectedResume.outputHash);
  assert.notEqual(resumed.state, 'playing'); await delay(450); assert.equal((await snapshot('resume-stable')).index, resumed.index);
  evidence.lifecycle.push({ label: 'resume-restores-exact-fixed-path-and-pauses', origin: resumed.origin, index: resumed.index, outputHash: resumed.outputHash });
  await click(cdp, control('exit'));
}
