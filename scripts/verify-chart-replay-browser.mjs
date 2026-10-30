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
  const archiveRows = mode => btc ? mode === 'recorded' ? priceArchive.prices.map(([date, price]) => ({ date, price })) : btcCandles.map(row => ({ ...row, price: row.close })) :
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
      return { sameNode: svg === globalThis.__mainReplayNode, sameDocument: performance.timeOrigin === globalThis.__mainReplayTime,
        active: svg.dataset.chartReplayActive === 'true', state: controls.dataset.state, origin: svg.dataset.replayOrigin, cursor: svg.dataset.replayCursor,
        index: Number(q('scrub').value), lastIndex: Number(q('scrub').max), outputHash: svg.dataset.replayOutputHash,
        mode: q('mode').value, model: q('model')?.value ?? null, dateInput: q('date').value, dateMinimum: q('date').min, dateMaximum: q('date').max, source: q('source').textContent, metric: q('metric').textContent,
        actualThrough: svg.dataset.replayActualThrough, actualCount: Number(svg.dataset.replayActualCount ?? 0), forecastCount: Number(svg.dataset.replayForecastPoints ?? 0), candles,
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
    evidence.lastObservation = { label, ...value, candles: value.candles.map(row => row.date) };
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
    }
    evidence.states.push({ label, ...value, candles: value.candles.map(row => row.date), forecastPath: undefined, forecastPathSha256: value.forecastPath === null ? null : digest(value.forecastPath) });
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

  await until(() => evaluate(cdp, selector => Boolean(document.querySelector(selector)?.querySelector('path')) && Boolean(document.querySelector('#workbench-replay')), chartSelector), 'main price chart and replay control');
  await settled(cdp);
  if (btc) await verifyOfflineRefresh({ phase: 'main-chart-replay-entry' });
  await evaluate(cdp, selector => { globalThis.__mainReplayNode = document.querySelector(selector); globalThis.__mainReplayTime = performance.timeOrigin; }, chartSelector);
  await click(cdp, '#workbench-replay'); await ready(crypto);
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
  if (touch) {
    const before = await snapshot('touch-before-hold');
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
    const after = await snapshot('touch-hold-pan', true);
    const originX = await evaluate(cdp, selector => Number(document.querySelector(selector).querySelector('[data-replay-origin-boundary]').getAttribute('x1')), chartSelector);
    assert.ok(Math.abs(originX - gesture.originX) > 8, 'Replay chart did not pan after native touch hold');
    assert.equal(after.index, before.index); assert.equal(after.outputHash, before.outputHash); assert.equal(after.actualThrough, before.actualThrough);
    evidence.lifecycle.push({ label: 'touch-hold-pans-replay-without-live-tracker', holdMilliseconds: 650, originBeforeX: gesture.originX, originAfterX: originX, cursor: after.cursor });
  }
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
