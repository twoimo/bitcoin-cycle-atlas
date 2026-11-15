import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createChart } from '@funnest/charts';
import { mountAtlasBtcFunnestChart } from '../dist/btc-funnest-chart.js';

const DAY = 86_400_000;
const labViewSource = await readFile(new URL('../dist/lab-view.js', import.meta.url), 'utf8');
const date = value => Date.parse(`${value}T00:00:00Z`);

function createCanvasTrace() {
  const calls = [], stack = [];
  let paths = [], dash = [];
  const target = {
    canvas: null,
    measureText: value => ({ width: String(value).length * 6 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
  };
  const pathSnapshot = () => paths.map(path => ({ points: path.points.map(point => [...point]), closed: path.closed }));
  const event = (type, args = []) => calls.push({
    type, order: calls.length, args: [...args], fillStyle: target.fillStyle, strokeStyle: target.strokeStyle,
    lineWidth: target.lineWidth, lineCap: target.lineCap, lineJoin: target.lineJoin, dash: [...dash], paths: pathSnapshot(),
  });
  Object.assign(target, {
    beginPath(...args) { paths = []; event('beginPath', args); },
    moveTo(...args) { paths.push({ points: [], closed: false }); paths.at(-1).points.push(args.slice(0, 2)); event('moveTo', args); },
    lineTo(...args) { if (!paths.length) paths.push({ points: [], closed: false }); paths.at(-1).points.push(args.slice(0, 2)); event('lineTo', args); },
    closePath(...args) { if (paths.length) paths.at(-1).closed = true; event('closePath', args); },
    setLineDash(value) { dash = [...value]; event('setLineDash', [value]); },
    getLineDash() { return [...dash]; },
    fill(...args) { event('fill', args); },
    stroke(...args) { event('stroke', args); },
    save(...args) {
      stack.push({ style: Object.fromEntries(['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha', 'font', 'textAlign', 'textBaseline', 'lineDashOffset'].map(key => [key, target[key]])), dash: [...dash] });
      event('save', args);
    },
    restore(...args) {
      event('restore', args);
      const state = stack.pop();
      if (state) { Object.assign(target, state.style); dash = state.dash; }
    },
  });
  const context = new Proxy(target, {
    get: (object, key) => key in object ? object[key] : () => {},
    set: (object, key, value) => (object[key] = value, true),
  });
  return { context, calls };
}

async function withFunnestFixture(run) {
  const { document, window } = parseHTML('<html><body><div id="stage"><svg></svg></div></body></html>');
  window.devicePixelRatio = 1;
  const stage = document.getElementById('stage');
  let focused = document.body;
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => focused?.isConnected ? focused : document.body });
  window.Element.prototype.focus = function focus() { if (this.isConnected) focused = this; };
  const bounds = { left: 100, top: 50, width: 900, height: 520, right: 1000, bottom: 570 };
  stage.style.position = 'relative';
  stage.getBoundingClientRect = () => ({ ...bounds });
  const svg = stage.querySelector('svg');
  svg.getBoundingClientRect = () => ({ ...bounds });
  Object.defineProperty(svg, 'viewBox', { configurable: true, get() {
    const [x, y, width, height] = (svg.getAttribute('viewBox') || '0 0 0 0').trim().split(/\s+/).map(Number);
    return { baseVal: { x, y, width, height } };
  } });
  const { context, calls } = createCanvasTrace();
  const originals = new Map(['document', 'window', 'PointerEvent', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  // linkedom has no PointerEvent class. This standards-shaped DOM Event subclass
  // models the pointer fields consumed here while retaining real EventTarget delivery.
  class FixturePointerEvent extends window.Event {
    constructor(type, init = {}) {
      super(type, { bubbles: Boolean(init.bubbles), cancelable: Boolean(init.cancelable), composed: Boolean(init.composed) });
      for (const [key, fallback] of Object.entries({ pointerId: 0, pointerType: '', isPrimary: false, clientX: 0, clientY: 0, buttons: 0, pressure: 0, button: -1 }))
        Object.defineProperty(this, key, { configurable: false, enumerable: true, value: init[key] ?? fallback });
    }
  }
  window.PointerEvent = FixturePointerEvent;
  const originalCreate = document.createElement.bind(document);
  document.createElement = (name, ...args) => {
    const node = originalCreate(name, ...args);
    if (name === 'div' || name === 'canvas') node.getBoundingClientRect = () => ({ ...bounds });
    if (name === 'canvas') node.getContext = () => { context.canvas = node; return context; };
    return node;
  };
  Object.assign(globalThis, {
    document, window, PointerEvent: FixturePointerEvent, MutationObserver: window.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} },
    matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ color: '', getPropertyValue: () => '' }),
    requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
  });
  try {
    assert.equal(typeof createChart, 'function', 'the fixture resolves the pinned @funnest/charts createChart entry point');
    return await run({ document, window, stage, svg, context, calls });
  } finally {
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
}

function canvasPaths(event) { return event.paths.map(path => path.points); }
function receiptPaths(rows) { return rows.map(path => path.map(point => [point.x, point.y])); }
function findLastMatchingStroke(calls, { color, width, dash }, expectedPaths) {
  const expected = JSON.stringify(expectedPaths);
  return calls.filter(call => call.type === 'stroke' && call.strokeStyle === color && call.lineWidth === width &&
    JSON.stringify(call.dash) === JSON.stringify(dash) && JSON.stringify(canvasPaths(call)) === expected).at(-1);
}

const sourceForecast = [
  { date: '2024-01-06', price: 110, lower: 106, upper: 114, note: 'forecast-a' },
  { date: '2024-01-07', price: 112, lower: 108, upper: 117, note: 'forecast-b' },
  { date: '2024-01-08', price: 114, lower: 109, upper: 120, note: 'forecast-c' },
];
const sourceRetrospective = [
  { date: '2024-01-09', price: 96, note: 'retro-a' },
  { date: '2024-01-10', price: 98, note: 'retro-b' },
  { date: '2024-01-12', price: 101, note: 'retro-c' },
  { date: '2024-01-13', price: 103, note: 'retro-d' },
];

test('actual Funnest BTC below/above callbacks match the detached render receipt and preserve source records', async () => {
  await withFunnestFixture(async ({ stage, svg, calls }) => {
    const forecast = Object.freeze(sourceForecast.map(row => Object.freeze({ ...row })));
    const retrospective = Object.freeze(sourceRetrospective.map(row => Object.freeze({ ...row })));
    const forecastBefore = structuredClone(forecast), retrospectiveBefore = structuredClone(retrospective);
    let mounted, replacementOwner;
    const readouts = [], inspections = [];
    const observedRows = [1, 2, 3, 4, 5].map(day => ({ date: `2024-01-0${day}`, price: 100 + day }));
    try {
      mounted = mountAtlasBtcFunnestChart({
        container: stage, svg, sourceMode: 'close-only', frequency: 'daily', chartType: 'line', observedRows,
        start: '2024-01-01', end: '2024-01-13', forecast, retrospective,
        onHover: detail => readouts.push(detail), onInspect: (...args) => inspections.push(args),
      });
      assert.equal(readouts.length, 1, 'mount publishes one source-derived initial readout without waiting for pointer input');
      assert.equal(readouts[0].date, '2024-01-05'); assert.equal(readouts[0].price, 105);
      assert.equal(readouts[0].source, 'Coin Metrics'); assert.equal(readouts[0].kind, 'observed');
      for (const field of ['open', 'high', 'low', 'close', 'volume']) assert.equal(Object.hasOwn(readouts[0], field), false, `close-only initial readout must not fabricate ${field}`);
      assert.equal(inspections.length, 0, 'initial readout does not open an inspection panel');
      await new Promise(resolve => setTimeout(resolve, 100));
      const host = mounted.host, key = 'getAtlasBtcRenderSnapshot';
      const descriptor = Object.getOwnPropertyDescriptor(host, key);
      assert.ok(descriptor && typeof descriptor.value === 'function');
      assert.equal(descriptor.writable, false); assert.equal(descriptor.enumerable, false); assert.equal(descriptor.configurable, true);
      const snapshot = host[key]();
      assert.equal(snapshot.engine, 'funnest'); assert.equal(snapshot.version, '0.6.22');
      assert.equal(snapshot.rendered, true); assert.ok(snapshot.sequence > 0);
      assert.equal(snapshot.observed.coordinateBasis, 'projection through the real rendered Funnest PaneCoords; not intercepted core draw calls');
      assert.equal(snapshot.chartType, 'line');
      assert.equal(snapshot.interaction.selectedDate, '2024-01-05');
      const nativeInitial = host.getAtlasFunnestSnapshot();
      assert.equal(nativeInitial.crosshairEventSequence, 0, 'mount readout is not a synthetic crosshair event');
      assert.equal(nativeInitial.crosshair, null);
      assert.ok(snapshot.observed.rows.length > 0);
      for (const row of snapshot.observed.rows) for (const field of ['open', 'high', 'low']) assert.equal(Object.hasOwn(row, field), false, `close-only row must not fabricate ${field}`);

      const bandReceipt = snapshot.paint.bands;
      const forecastReceipt = snapshot.paint.paths.forecast;
      const retrospectiveReceipt = snapshot.paint.paths.retrospective;
      assert.equal(bandReceipt.layer, 'below');
      assert.equal(snapshot.paint.layer, 'above');
      assert.ok(bandReceipt.order < snapshot.paint.order);
      assert.equal(bandReceipt.forecast.layer, 'below');
      assert.equal(forecastReceipt.coordinateBasis, 'actual CanvasRenderingContext2D path arguments');
      assert.equal(forecastReceipt.strokes[0].kind, 'halo');
      assert.equal(forecastReceipt.strokes[1].kind, 'path');
      assert.ok(forecastReceipt.strokes[0].order < forecastReceipt.strokes[1].order);
      assert.ok(bandReceipt.forecast.order < forecastReceipt.strokes[0].order, 'the below-band receipt precedes above-path/halo receipt order');
      assert.deepEqual(forecastReceipt.subpaths.flatMap(path => path.map(point => point.value)), forecast.map(row => row.price));
      assert.deepEqual(retrospectiveReceipt.subpaths.map(path => path.length), [2, 2], 'the two-day missing observation splits the retrospective path');
      assert.deepEqual(retrospectiveReceipt.subpaths.flatMap(path => path.map(point => point.value)), retrospective.map(row => row.price));

      const expectedForecastPath = receiptPaths(forecastReceipt.subpaths);
      const [haloReceipt, colorReceipt] = forecastReceipt.strokes;
      const actualHalo = findLastMatchingStroke(calls, { color: haloReceipt.color, width: haloReceipt.width, dash: haloReceipt.dash }, expectedForecastPath);
      const actualForecast = findLastMatchingStroke(calls, { color: colorReceipt.color, width: colorReceipt.width, dash: colorReceipt.dash }, expectedForecastPath);
      assert.ok(actualHalo && actualForecast, 'both actual canvas strokes must match the real forecast receipt');
      assert.equal(actualHalo.lineCap, 'round'); assert.equal(actualHalo.lineJoin, 'round');
      assert.equal(actualForecast.lineCap, 'round'); assert.equal(actualForecast.lineJoin, 'round');
      assert.ok(actualHalo.order < actualForecast.order, 'the actual background halo is stroked before the colored forecast path');
      assert.deepEqual(canvasPaths(actualHalo), canvasPaths(actualForecast), 'halo and colored path use the exact same actual subpath coordinates');
      assert.deepEqual(canvasPaths(actualForecast), expectedForecastPath, 'receipt path coordinates equal actual moveTo/lineTo arguments');
      assert.ok(calls.some(call => call.type === 'moveTo') && calls.some(call => call.type === 'lineTo'));

      const bandColor = 'rgba(199,155,75,.14)';
      const actualBand = calls.filter(call => call.type === 'fill' && call.fillStyle === bandColor).at(-1);
      assert.ok(actualBand, 'the real below callback issued an actual Canvas fill');
      assert.deepEqual(actualBand.args, [], 'the callback uses the default nonzero fill rule');
      assert.equal(actualBand.paths.length, 1); assert.equal(actualBand.paths[0].closed, true);
      assert.deepEqual(canvasPaths(actualBand), [bandReceipt.forecast.polygon.map(point => [point.x, point.y])],
        'receipt band polygon equals actual moveTo/lineTo/closePath arguments');
      assert.ok(actualBand.order < actualHalo.order && actualBand.order < actualForecast.order,
        'the actual below-band fill occurs before actual above forecast halo and path strokes');

      const retroHalo = retrospectiveReceipt.strokes[0], retroColor = retrospectiveReceipt.strokes[1];
      const expectedRetroPath = receiptPaths(retrospectiveReceipt.subpaths);
      const actualRetroHalo = findLastMatchingStroke(calls, { color: retroHalo.color, width: retroHalo.width, dash: retroHalo.dash }, expectedRetroPath);
      const actualRetroColor = findLastMatchingStroke(calls, { color: retroColor.color, width: retroColor.width, dash: retroColor.dash }, expectedRetroPath);
      assert.ok(actualRetroHalo && actualRetroColor);
      assert.deepEqual(canvasPaths(actualRetroHalo), canvasPaths(actualRetroColor));
      assert.deepEqual(canvasPaths(actualRetroColor), expectedRetroPath, 'retrospective gap-separated receipt coordinates match actual canvas path commands');

      assert.deepEqual(host[key]().forecastRows, forecast.map(row => ({ ...row, time: date(row.date) })));
      assert.deepEqual(host[key]().retrospectiveRows, retrospective.map(row => ({ ...row, time: date(row.date) })));
      assert.deepEqual(forecast, forecastBefore); assert.deepEqual(retrospective, retrospectiveBefore);
      const detached = host[key]();
      detached.paint.paths.forecast.subpaths[0][0].x = -999;
      detached.forecastRows[0].price = -999;
      const fresh = host[key]();
      assert.notEqual(fresh.paint.paths.forecast.subpaths[0][0].x, -999);
      assert.equal(fresh.forecastRows[0].price, forecast[0].price);
      assert.throws(() => { host[key] = () => null; }, TypeError, 'the installed getter value is nonwritable');
      assert.equal(host[key]().engine, 'funnest');

      const inputCanvas = [...host.querySelectorAll('canvas')].at(-1);
      assert.ok(inputCanvas, 'the pinned Funnest chart exposes its input-owning overlay canvas');
      const canvasEvents = [];
      inputCanvas.addEventListener('pointermove', event => canvasEvents.push({ type: event.type, target: event.target, clientX: event.clientX, clientY: event.clientY }));
      inputCanvas.addEventListener('pointerleave', event => canvasEvents.push({ type: event.type, target: event.target, pointerType: event.pointerType }));
      const svgRect = svg.getBoundingClientRect(), canvasRect = inputCanvas.getBoundingClientRect(), view = svg.viewBox.baseVal;
      assert.deepEqual([canvasRect.left, canvasRect.top, canvasRect.width, canvasRect.height], [svgRect.left, svgRect.top, svgRect.width, svgRect.height],
        'mock SVG and actual input canvas share the same CSS-pixel viewport');
      assert.deepEqual([view.width, view.height], [svgRect.width, svgRect.height], 'the mocked SVG viewBox and rendered rectangle use the same coordinate scale');
      const pointerDate = '2024-01-03', pointerX = mounted.x(pointerDate), pointerPrice = 103.37;
      const pointerY = mounted.chart.mainScale.priceToY(pointerPrice);
      const clientPoint = { clientX: svgRect.left + pointerX / view.width * svgRect.width,
        clientY: svgRect.top + pointerY / view.height * svgRect.height, pointerId: 17, pointerType: 'mouse', buttons: 0, pressure: 0 };
      const nativeBeforeHostOnly = host.getAtlasFunnestSnapshot(), hostOnlyEvents = canvasEvents.length;
      host.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, cancelable: true, ...clientPoint }));
      await new Promise(resolve => setTimeout(resolve, 30));
      const nativeAfterHostOnly = host.getAtlasFunnestSnapshot();
      assert.equal(nativeAfterHostOnly.crosshairEventSequence, nativeBeforeHostOnly.crosshairEventSequence,
        'dispatching to the ancestor host does not reach the native listener on its canvas child');
      assert.equal(nativeAfterHostOnly.crosshair, null);
      assert.equal(canvasEvents.length, hostOnlyEvents, 'host-only dispatch did not invoke a canvas listener');

      assert.equal(mounted.previewPointer(clientPoint), true, 'the actual adapter forwards the preview to Funnest');
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(canvasEvents.filter(event => event.type === 'pointermove').length, hostOnlyEvents + 1);
      const deliveredMove = canvasEvents.filter(event => event.type === 'pointermove').at(-1);
      assert.equal(deliveredMove.target, inputCanvas); assert.equal(deliveredMove.clientX, clientPoint.clientX); assert.equal(deliveredMove.clientY, clientPoint.clientY);
      const nativeMove = host.getAtlasFunnestSnapshot();
      assert.ok(nativeMove.crosshairEventSequence > nativeBeforeHostOnly.crosshairEventSequence,
        'the standard Funnest snapshot records a public crosshairMove emitted by its real Interaction listener');
      assert.equal(nativeMove.crosshair.source, 'mouse');
      assert.equal(nativeMove.crosshair.time, date(pointerDate));
      assert.deepEqual(nativeMove.crosshair.bar, { time: date(pointerDate), close: observedRows[2].price }, 'public crosshair bar is copied from the actual close-only source');
      assert.equal(nativeMove.crosshair.value, pointerPrice, 'native crosshair value reflects the pointer price, not a fabricated source OHLC field');
      const pointerReceipt = host[key]().interaction;
      assert.equal(pointerReceipt.selectedDate, pointerDate);
      assert.equal(pointerReceipt.pointerBasis, 'Funnest PaneCoords.pointAt; not an observed source bar');
      assert.deepEqual([pointerReceipt.pointer.time, pointerReceipt.pointer.value, pointerReceipt.pointer.x, pointerReceipt.pointer.y],
        [date(pointerDate), pointerPrice, pointerX, pointerY]);
      assert.ok(pointerReceipt.pointer.value !== nativeMove.crosshair.bar.close,
        'the BTC interaction receipt preserves the free pointer price separately from the observed close');
      assert.ok(readouts.length > 1, 'native pointer movement may update readouts after the initial source-derived value');
      assert.equal(readouts[0].date, '2024-01-05'); assert.equal(readouts[0].price, 105);
      assert.equal(inspections.length, 0, 'pointer preview does not open an inspection panel');
      const detachedNative = host.getAtlasFunnestSnapshot();
      detachedNative.crosshair.bar.close = -1;
      assert.equal(host.getAtlasFunnestSnapshot().crosshair.bar.close, observedRows[2].price, 'native public snapshot is detached from stored crosshair state');

      const futureDate = '2024-01-07', futureX = mounted.x(futureDate), futureY = mounted.chart.mainScale.priceToY(112);
      const futurePoint = { clientX: svgRect.left + futureX / view.width * svgRect.width,
        clientY: svgRect.top + futureY / view.height * svgRect.height, pointerId: 19, pointerType: 'mouse', buttons: 0, pressure: 0 };
      assert.equal(mounted.previewPointer(futurePoint), true, 'future forecast hover remains inside the actual chart pane');
      await new Promise(resolve => setTimeout(resolve, 30));
      const futureReadout = readouts.at(-1), futureCross = svg.querySelector('.btc-future-cross');
      assert.equal(futureReadout.date, futureDate); assert.equal(futureReadout.kind, 'simulated'); assert.equal(futureReadout.price, 112);
      assert.equal(futureReadout.source, 'Atlas 조건부 모델');
      for (const field of ['open', 'high', 'low', 'close', 'volume']) assert.equal(Object.hasOwn(futureReadout, field), false, `forecast hover must not fabricate ${field}`);
      assert.equal(futureCross.getAttribute('display'), 'inline', 'the passive future marker is painted in the active SVG, not as a fake bar');
      const futureLabel = futureCross.querySelector('text'), futureLabelWidth = [...futureLabel.textContent].reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 11 : 6.6), 0);
      assert.equal(Number(futureLabel.getAttribute('font-size')), 11);
      assert.ok(Number(futureLabel.getAttribute('x')) >= 4 && Number(futureLabel.getAttribute('x')) + futureLabelWidth <= host[key]().pane.width - 4,
        '11px future text is measured and clamped inside the actual native plot width');
      assert.match(futureCross.textContent, /2024-01-07/); assert.match(futureCross.textContent, /가정/);
      // Deliver a late native canvas crosshair for the last actual bar after the
      // future hover. It must not replace the source-backed simulated HUD.
      inputCanvas.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 20, pointerType: 'mouse', clientX: futurePoint.clientX, clientY: futurePoint.clientY, buttons: 0 }));
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(readouts.at(-1).date, futureDate); assert.equal(readouts.at(-1).kind, 'simulated');
      assert.equal(host.getAtlasFunnestSnapshot().crosshair, null, 'stale native observed crosshair is cleared while future preview remains');
      assert.equal(futureCross.getAttribute('display'), 'inline');
      svg.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
      assert.equal(inspections.at(-1)[0].date, futureDate); assert.equal(inspections.at(-1)[0].kind, 'simulated', 'future click commits the modeled row, not the last observed bar');
      assert.equal(readouts.at(-1).kind, 'simulated');
      assert.equal(mounted.previewPointer(clientPoint), true, 'moving back to an observed date exits future preview mode');
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(readouts.at(-1).date, pointerDate); assert.equal(readouts.at(-1).kind, 'observed');
      assert.equal(futureCross.getAttribute('display'), 'none', 'returning to observed data clears the passive future crosshair');
      inputCanvas.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 21, pointerType: 'mouse', clientX: futurePoint.clientX, clientY: futurePoint.clientY, buttons: 0 }));
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(readouts.at(-1).date, pointerDate); assert.equal(readouts.at(-1).kind, 'observed', 'a stale native forecast frame cannot replace the new observed pointer either');
      assert.equal(host.getAtlasFunnestSnapshot().crosshair, null, 'the mismatched native marker is cleared instead of showing an unrelated observed bar');
      assert.equal(mounted.previewPointer(clientPoint), true); await new Promise(resolve => setTimeout(resolve, 30));
      const beforeLeave = host.getAtlasFunnestSnapshot();
      svg.dispatchEvent(new window.PointerEvent('pointerleave', { bubbles: false, cancelable: false, ...clientPoint }));
      await new Promise(resolve => setTimeout(resolve, 30));
      const nativeAfterLeave = host.getAtlasFunnestSnapshot(), receiptAfterLeave = host[key]().interaction;
      assert.ok(canvasEvents.some(event => event.type === 'pointerleave' && event.target === inputCanvas && event.pointerType === 'mouse'),
        'actual SVG leave forwards a PointerEvent to the input canvas');
      assert.equal(nativeAfterLeave.crosshairEventSequence, beforeLeave.crosshairEventSequence + 1);
      assert.equal(nativeAfterLeave.crosshair, null, 'native leave clears the public crosshair event');
      assert.equal(receiptAfterLeave.pointer, null, 'SVG leave clears the BTC pointAt pointer receipt');
      assert.equal(receiptAfterLeave.selectedDate, pointerDate, 'leave does not discard the selected source date');
      assert.equal(inspections.at(-1)[0].date, futureDate, 'only the explicit future click opens a selection inspection');

      mounted.destroy(); mounted = null;
      assert.equal(Object.hasOwn(host, key), false, 'destroy removes the getter while this controller still owns it');

      replacementOwner = mountAtlasBtcFunnestChart({ container: stage, svg, sourceMode: 'close-only', observedRows: [{ date: '2024-01-01', price: 100 }], start: '2024-01-01', end: '2024-01-01' });
      const replacementHost = replacementOwner.host;
      const replacementGetter = () => ({ owner: 'replacement' });
      Object.defineProperty(replacementHost, key, { configurable: true, enumerable: false, writable: false, value: replacementGetter });
      replacementOwner.destroy(); replacementOwner = null;
      assert.equal(replacementHost[key], replacementGetter, 'stale teardown preserves a newer owner’s getter');
    } finally {
      replacementOwner?.destroy(); mounted?.destroy();
    }
  });
});

test('BTC export uses the native crosshair-free screenshot and preserves exact host bounds and ownership', async () => {
  await withFunnestFixture(async ({ stage, svg }) => {
    let mounted;
    try {
      mounted = mountAtlasBtcFunnestChart({ container: stage, svg, sourceMode: 'close-only', frequency: 'daily', chartType: 'line',
        observedRows: [1, 2, 3, 4, 5].map(day => ({ date: `2024-01-0${day}`, price: 100 + day })),
        start: '2024-01-01', end: '2024-01-05', showCycleTiming: true, cycleCalibration: { series: [] } });
      const host = mounted.host, hostBox = { ...host.getBoundingClientRect(), height: 478, bottom: host.getBoundingClientRect().top + 478 };
      assert.equal(host.style.bottom, '42px', 'the cycle-timing pane reserves its existing 42px below the native chart');
      host.getBoundingClientRect = () => ({ ...hostBox });
      const screenshot = svg.ownerDocument.createElement('canvas'); screenshot.width = 900; screenshot.height = 478;
      let screenshotCalls = 0;
      mounted.chart.takeScreenshot = () => (screenshotCalls++, screenshot);
      const exported = mounted.exportCanvas();
      assert.equal(exported, screenshot, 'export returns Funnest takeScreenshot directly instead of merging live canvases');
      assert.equal(screenshotCalls, 1);
      assert.equal(exported.dataset.funnestExportCanvas, 'true');
      assert.equal(exported.getAttribute('aria-hidden'), 'true');
      assert.equal(exported.parentElement, stage);
      assert.deepEqual([exported.style.left, exported.style.top, exported.style.width, exported.style.height], ['0px', '0px', '900px', '478px'],
        'temporary bitmap CSS bounds match the host and exclude only the reserved 42px timing rail');
      const owner = Object.getOwnPropertyDescriptor(exported, 'atlasFunnestExportOwner');
      assert.equal(owner.value, host); assert.equal(owner.writable, false); assert.equal(owner.enumerable, false); assert.equal(owner.configurable, false);
    } finally { mounted?.destroy(); }
  });
});

test('weekly OHLC receipt preserves sourceRow metadata without changing the source candle', async () => {
  await withFunnestFixture(async ({ stage, svg }) => {
    const sourceRow = Object.freeze({
      time: Math.floor(date('2024-01-01') / 1000), date: '2024-01-07', startDate: '2024-01-01', endDate: '2024-01-07',
      open: 100, high: 120, low: 90, close: 110, volume: 5, venue: 'Bitstamp', sourceKey: 'weekly-2024-01-07',
    });
    let mounted;
    const readouts = [];
    try {
      mounted = mountAtlasBtcFunnestChart({ container: stage, svg, sourceMode: 'ohlc', frequency: 'weekly', chartType: 'candles',
        observedCandles: [sourceRow], start: '2024-01-01', end: '2024-01-07', candleSource: 'Bitstamp', onHover: detail => readouts.push(detail) });
      assert.equal(readouts.length, 1, 'weekly OHLC mount emits one real source readout immediately');
      assert.deepEqual(Object.fromEntries(['date', 'price', 'open', 'high', 'low', 'close', 'volume', 'source', 'frequency', 'completed'].map(key => [key, readouts[0][key]])),
        { date: '2024-01-07', price: 110, open: 100, high: 120, low: 90, close: 110, volume: 5, source: 'Bitstamp', frequency: 'weekly', completed: true });
      await new Promise(resolve => setTimeout(resolve, 80));
      const receipt = mounted.host.getAtlasBtcRenderSnapshot();
      assert.equal(receipt.sourceMode, 'ohlc'); assert.equal(receipt.frequency, 'weekly');
      assert.equal(receipt.observed.rows.length, 1);
      assert.deepEqual(receipt.observed.rows[0].sourceRow, sourceRow);
      assert.deepEqual(Object.fromEntries(['open', 'high', 'low', 'close', 'volume', 'startDate', 'endDate', 'venue', 'sourceKey']
        .map(key => [key, receipt.observed.rows[0].sourceRow[key]])),
      { open: 100, high: 120, low: 90, close: 110, volume: 5, startDate: '2024-01-01', endDate: '2024-01-07', venue: 'Bitstamp', sourceKey: 'weekly-2024-01-07' });
      assert.equal(Object.hasOwn(sourceRow, 'price'), false, 'weekly OHLC source remains OHLC, not synthesized close-only data');
    } finally { mounted?.destroy(); }
  });
});


test('BTC annotation counts, cycle colors, labels, and keyboard targets reflect only viewport-visible marks', async () => {
  await withFunnestFixture(async ({ stage, svg }) => {
    let mounted;
    const intervalSelections = [], countNotifications = [];
    try {
      mounted = mountAtlasBtcFunnestChart({
        container: stage, svg, sourceMode: 'close-only', frequency: 'daily', chartType: 'line',
        observedRows: [1, 2, 3, 4, 5].map(day => ({ date: `2024-01-0${day}`, price: 100 + day })),
        start: '2024-01-01', end: '2024-01-13',
        historicalEvents: [
          { id: 'history-visible', date: '2024-01-03', title: 'Protocol event', label: 'Protocol event', category: 'protocol' },
          { id: 'history-outside', date: '2024-02-03', title: 'Outside event', label: 'Outside event', category: 'market' },
        ],
        cycleMarkers: [
          { id: 'cycle-visible', date: '2024-01-04', price: 104, type: 'cycle-top', displayLabel: 'CYCLE TOP' },
          { id: 'cycle-outside', date: '2024-02-04', price: 140, type: 'bottom', displayLabel: 'BOTTOM' },
        ],
        cycleIntervals: [
          { id: 'interval-visible', relation: 'bottom-cycle-top', fromId: 'from', toId: 'to', startDate: '2023-12-29', endDate: '2024-01-11', startTime: date('2023-12-29'), endTime: date('2024-01-11'), from: { price: 102 }, to: { price: 104 }, label: 'Visible interval' },
          { id: 'interval-outside', relation: 'bottom-cycle-top', fromId: 'from2', toId: 'to2', startDate: '2024-02-02', endDate: '2024-02-04', startTime: date('2024-02-02'), endTime: date('2024-02-04'), from: { price: 130 }, to: { price: 140 }, label: 'Outside interval' },
        ],
        activeCycleInterval: 'interval-visible', activeCycleMarkerId: 'cycle-visible', activeCycleMarkerIds: ['cycle-visible'], activeHistoricalEventId: 'history-visible',
        onCycleInterval: id => intervalSelections.push(id),
        onAnnotationCounts: counts => countNotifications.push(counts),
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.deepEqual(Object.fromEntries(['historyEventCount', 'cycleMarkerCount', 'cycleIntervalCount'].map(key => [key, countNotifications.at(-1)?.[key]])),
        { historyEventCount: 1, cycleMarkerCount: 1, cycleIntervalCount: 1 }, 'count notification follows the first native overlay paint');
      assert.equal(countNotifications.at(-1).instance, mounted.host.getAtlasBtcRenderSnapshot().instance);
      assert.equal(svg.dataset.historyEventCount, '1');
      assert.equal(Number(svg.dataset.historyLabelCount) + Number(svg.dataset.historyHiddenLabelCount), 1);
      assert.equal(svg.dataset.cycleMarkerCount, '1');
      assert.ok(Number(svg.dataset.cycleMarkerLabelCount) > 0);
      assert.equal(svg.dataset.cycleIntervalCount, '1');
      assert.equal(svg.dataset.cycleIntervalLabelCount, '1');
      assert.equal(Number(mounted.host.getAtlasBtcRenderSnapshot().paint.intervalLayout.labelCount), svg.querySelectorAll('.cycle-interval-duration').length, 'receipt label count matches rendered interval duration labels');
      const snapshot = mounted.host.getAtlasBtcRenderSnapshot();
      const history = snapshot.paint.markers.find(item => item.type === 'history');
      const cycle = snapshot.paint.markers.find(item => item.id === 'cycle-visible');
      assert.equal(history.color, '#d8b779');
      assert.equal(cycle.color, '#f27781');
      assert.equal(cycle.active, true, 'selected cycle markers receive active styling metadata');
      assert.equal(snapshot.paint.markers.some(item => item.id === 'cycle-outside' || item.id === 'history-outside'), false);
      assert.equal(svg.querySelectorAll('[data-history-event-label="history-visible"]').length, 1);
      assert.equal(svg.querySelectorAll('[data-cycle-marker-label="cycle-visible"]').length, 1);
      const targets = [...svg.querySelectorAll('[data-btc-overlay-target]')];
      assert.ok(targets.some(target => target.getAttribute('data-id') === 'history-visible' && target.getAttribute('aria-pressed') === 'true'));
      assert.ok(targets.some(target => target.getAttribute('data-id') === 'cycle-visible' && target.getAttribute('aria-pressed') === 'true'));
      assert.equal(targets.some(target => target.getAttribute('data-id') === 'interval-visible'), false, 'the real interval group is the sole keyboard target, without a duplicate transparent target');
      assert.equal(targets.some(target => ['history-outside', 'cycle-outside', 'interval-outside'].includes(target.getAttribute('data-id'))), false);
      const historyTarget = svg.querySelector('[data-btc-overlay-target="history"][data-id="history-visible"]');
      assert.ok(historyTarget); historyTarget.focus(); assert.equal(document.activeElement, historyTarget);
      const intervalNode = svg.querySelector('[data-cycle-interval="interval-visible"]');
      assert.ok(intervalNode);
      const beforeObstacleUpdate = mounted.host.getAtlasBtcRenderSnapshot();
      const fullBandObstacle = { x: 0, y: beforeObstacleUpdate.paint.intervalLayout.bandTop, width: beforeObstacleUpdate.pane.width,
        height: beforeObstacleUpdate.paint.intervalLayout.bandBottom - beforeObstacleUpdate.paint.intervalLayout.bandTop };
      assert.equal(mounted.updateCycleOverlayObstacles([fullBandObstacle]), true);
      await new Promise(resolve => setTimeout(resolve, 100));
      const afterObstacleUpdate = mounted.host.getAtlasBtcRenderSnapshot();
      assert.equal(svg.dataset.cycleIntervalCount, '1', 'HUD repacking preserves the visible interval');
      assert.equal(svg.dataset.cycleIntervalLabelCount, '0', 'a blocking HUD hides the collided text instead of painting through it');
      assert.equal(svg.querySelectorAll('.cycle-interval-duration').length, 0);
      assert.equal(afterObstacleUpdate.paint.intervalLayout.labelCount, 0);
      assert.equal(countNotifications.at(-1).cycleIntervalLabelCount, 0, 'count notification refreshes after obstacle-driven repacking');
      assert.ok(countNotifications.length >= 2, 'first render and overlay redraw both publish counts');
      assert.equal(svg.querySelector('[data-btc-overlay-target="history"][data-id="history-visible"]'), historyTarget, 'obstacle repacking retains a still-visible target');
      assert.equal(document.activeElement, historyTarget, 'obstacle repaint keeps focus on the surviving history target');
      assert.equal(svg.querySelector('[data-cycle-interval="interval-visible"]'), intervalNode, 'obstacle repack preserves the actual interval control node');
      mounted.updateCycleOverlayObstacles([fullBandObstacle]); await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(svg.querySelector('[data-cycle-interval="interval-visible"]'), intervalNode, 'identical repaint retains the same interval node');
      assert.equal(document.activeElement, historyTarget, 'identical repaint retains focus on its same target');
      const externalFocus = document.createElement('button'); externalFocus.textContent = 'outside chart'; stage.append(externalFocus); externalFocus.focus();
      mounted.updateCycleOverlayObstacles([fullBandObstacle]); await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(document.activeElement, externalFocus, 'repaint does not steal focus after the user moves elsewhere');
      historyTarget.focus();
      assert.equal(svg.querySelector('[data-btc-overlay-target="history"][data-id="history-visible"]'), historyTarget, 'identical repack retains the same real target node');
      assert.deepEqual(afterObstacleUpdate.priceScale, beforeObstacleUpdate.priceScale, 'HUD obstacles do not alter price scale');
      assert.deepEqual(afterObstacleUpdate.nativeRange, beforeObstacleUpdate.nativeRange, 'HUD obstacles do not alter the viewport');
      assert.deepEqual(afterObstacleUpdate.observed.rows, beforeObstacleUpdate.observed.rows, 'HUD obstacles do not alter source coordinates');
      assert.equal(intervalNode.getAttribute('tabindex'), '0'); assert.equal(intervalNode.getAttribute('aria-pressed'), 'true');
      assert.equal(intervalNode.getAttribute('data-days'), '13'); assert.equal(intervalNode.getAttribute('data-clipped-start'), 'true');
      assert.match(intervalNode.textContent, /1주 6일/);
      intervalNode.dispatchEvent(new window.Event('click', { bubbles: true }));
      const keyEvent = new window.Event('keydown', { bubbles: true, cancelable: true });
      Object.defineProperty(keyEvent, 'key', { value: 'Enter' }); intervalNode.dispatchEvent(keyEvent);
      assert.deepEqual(intervalSelections, ['interval-visible', 'interval-visible']);
      intervalNode.focus();
      const oldX2 = intervalNode.getAttribute('data-x2'), oldHistoryX = historyTarget.getAttribute('cx');
      mounted.chart.setVisibleTimeRange({ from: date('2024-01-02'), to: date('2024-01-08') + DAY - 1 });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(svg.querySelector('[data-cycle-interval="interval-visible"]'), intervalNode, 'viewport change reconciles the same interval control');
      assert.equal(document.activeElement, intervalNode, 'viewport change retains focus on the surviving interval');
      assert.notEqual(intervalNode.getAttribute('data-x2'), oldX2, 'viewport change updates the interval to its real new geometry');
      assert.notEqual(historyTarget.getAttribute('cx'), oldHistoryX, 'viewport change updates a surviving historical target coordinate');
      mounted.chart.setVisibleTimeRange({ from: date('2024-01-20'), to: date('2024-01-25') + DAY - 1 });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(historyTarget.isConnected, false, 'an off-viewport target is removed instead of retained invisibly');
      assert.equal(svg.querySelector('[data-btc-overlay-target="history"][data-id="history-visible"]'), null);
      mounted.updateCycleOverlayObstacles([fullBandObstacle]); await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(svg.querySelector('[data-btc-overlay-target="history"][data-id="history-visible"]'), null, 'removed targets are not resurrected by repaint');
      const beforeDestroy = countNotifications.length;
      mounted.updateCycleOverlayObstacles([fullBandObstacle]); mounted.destroy(); mounted = null;
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(countNotifications.length, beforeDestroy, 'queued stale paint notifications are suppressed after destroy');
    } finally { mounted?.destroy(); }
  });
});


test('BTC event, cycle-marker, and cycle-clock labels meet 11px typography and fit their measured boxes', async () => {
  await withFunnestFixture(async ({ stage, svg }) => {
    let mounted;
    try {
      mounted = mountAtlasBtcFunnestChart({ container: stage, svg, sourceMode: 'close-only', frequency: 'daily', chartType: 'line',
        observedRows: [1, 2, 3, 4, 5].map(day => ({ date: `2024-01-0${day}`, price: 100 + day })),
        start: '2024-01-01', end: '2024-01-13',
        historicalEvents: [{ id: 'history-font', date: '2024-01-03', title: '미국 BTC 준비자산', label: '미국 BTC 준비자산', category: 'policy' }],
        cycleMarkers: [{ id: 'cycle-font', date: '2024-01-04', price: 104, type: 'cycle-top', displayLabel: '경로 MID-TOP' }],
        showCycleTiming: true, cycleCalibration: { series: [] } });
      await new Promise(resolve => setTimeout(resolve, 100));
      const historyGroup = svg.querySelector('[data-history-event-label="history-font"]');
      const cycleGroup = svg.querySelector('[data-cycle-marker-label="cycle-font"]');
      assert.ok(historyGroup); assert.ok(cycleGroup);
      const historyText = historyGroup.querySelector('text'), historyBox = historyGroup.querySelector('rect');
      const cycleText = cycleGroup.querySelector('text'), cycleBox = cycleGroup.querySelector('rect');
      const clockTitle = svg.querySelector('[data-cycle-timing-title]');
      const clockFallback = [...svg.querySelectorAll('text')].find(node => node.textContent === '이 구간에는 완료된 관측 보정이 없습니다.');
      assert.equal(Number(historyText.getAttribute('font-size')), 11);
      assert.equal(Number(cycleText.getAttribute('font-size')), 11);
      assert.equal(Number(clockTitle.getAttribute('font-size')), 11);
      assert.equal(Number(clockFallback.getAttribute('font-size')), 11);
      const widthAt11 = (text, cjk = 10, latin = 6) => [...text].reduce((width, char) => width + (char.charCodeAt(0) > 255 ? cjk : latin), 0) * 1.1;
      const cycleWidthAt11 = (text) => [...text].reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 10 : 5.6), 0) * 1.1;
      assert.ok(widthAt11(historyText.textContent) <= Number(historyBox.getAttribute('width')), '11px history text remains inside its padded event label box');
      assert.ok(cycleWidthAt11(cycleText.textContent) <= Number(cycleBox.getAttribute('width')), '11px milestone text remains inside its measured label box');
      assert.equal(Number(historyBox.getAttribute('height')), 22, 'history label keeps enough vertical space for the 11px baseline');
      assert.equal(Number(cycleBox.getAttribute('height')), 18, 'cycle label keeps enough vertical space for the 11px baseline');
    } finally { mounted?.destroy(); }
  });
});

test('live daily Funnest caller forwards the original analytical and selection inputs', () => {
  const line = labViewSource.split('\n').find(value => value.includes("sourceMode:state.chartType==='candles'") && value.includes("state.priceController=paintPrice({svg:$('#lab-chart')"));
  assert.ok(line, 'daily paintPrice call exists');
  for (const field of [
    'cyclePeriodComparisons:comparison.byInterval', 'cycleRelation:state.cycleRelation',
    'activeCycleMarkerId:cycleSelection?.marker?.id||null', 'activeCycleMarkerIds:cycleSelection?.markerIds||[]',
    'activeCycleInterval:cycleSelection?.interval||null', 'cycleOverlayObstacles:cycleObstacles',
    'activeHistoricalEventId:state.selectedHistoryEvent', 'cycleCalibration:m.cycleCalibration',
    "showCycleTiming:shown('cycle-timing')", 'onNextTurn:()=>focusEvent(activeMarker.type)',
  ]) assert.ok(line.includes(field), `daily caller forwards ${field}`);
});

for (const sourceMode of ['ohlc', 'close-only']) test(`BTC ${sourceMode} measurement preserves weak/strong/off and temporary modifier semantics through native coordinates`, async () => {
  const observedRows = Object.freeze([1,2,3,4,5].map(day=>Object.freeze({date:`2024-01-0${day}`,price:90+day*10})));
  const candles = Object.freeze(observedRows.map(row=>Object.freeze({date:row.date,time:date(row.date)/1000,open:row.price-2,high:row.price+6,low:row.price-6,close:row.price,volume:0})));
  const before = structuredClone({observedRows,candles});
  for(const item of [{mode:'weak',offset:6,snap:true},{mode:'weak',offset:-40,snap:false},{mode:'strong',offset:-40,snap:true},{mode:'off',offset:6,snap:false},{mode:'off',offset:-40,ctrlKey:true,snap:true},{mode:'strong',offset:6,metaKey:true,snap:false}]) {
    await withFunnestFixture(async ({stage,svg,window})=>{
      const measurements=[];let mounted;
      const options={container:stage,svg,sourceMode,observedRows,observedCandles:sourceMode==='ohlc'?candles:[],frequency:'daily',chartType:sourceMode==='ohlc'?'candles':'line',start:'2024-01-01',end:'2024-01-05',tool:'measure',magnet:item.mode,onMeasurement:value=>measurements.push(value)};
      try {
        mounted=mountAtlasBtcFunnestChart(options);await new Promise(resolve=>setTimeout(resolve,60));
        const row=observedRows[2],expected=sourceMode==='ohlc'?candles[2].high:row.price,axis=mounted.getPriceScale(),box=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;
        const x=mounted.x(row.date),y=axis.priceToY(expected)+item.offset;
        const point={clientX:box.left+x/view.width*box.width,clientY:box.top+y/view.height*box.height,pointerId:1,pointerType:'mouse',ctrlKey:Boolean(item.ctrlKey),metaKey:Boolean(item.metaKey)};
        assert.equal(mounted.previewPointer(point),true);
        await new Promise(resolve=>setTimeout(resolve,30));
        const receipt=mounted.host.getAtlasBtcRenderSnapshot(),anchor=receipt.interaction.measurementAnchor;
        assert.equal(anchor.date,row.date);assert.equal(anchor.snapped,item.snap,JSON.stringify(item));assert.equal(anchor.kind,'observed');
        assert.equal(anchor.field,item.snap?(sourceMode==='ohlc'?'H':'C'):'free');
        if(item.snap){assert.equal(anchor.price,expected);assert.equal(receipt.paint.snapFeedback.price,expected);assert.equal(receipt.paint.snapFeedback.radius,7);}
        else{assert.equal(receipt.paint.snapFeedback,null);assert.ok(Math.abs(anchor.price-axis.yToPrice(y))<1e-8,'free measurement uses the unsnapped native yToPrice inverse, not magnetized pointAt');assert.notEqual(anchor.price,expected,'disabled or out-of-threshold snapping must not choose the source OHLC/close');}
        svg.dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(measurements.length,1);
        assert.equal(measurements[0].startDate,row.date);assert.equal(measurements[0].startPrice,anchor.price);assert.equal(measurements[0].startField,anchor.field);
        mounted.destroy();mounted=mountAtlasBtcFunnestChart({...options,measurement:measurements[0]});await new Promise(resolve=>setTimeout(resolve,50));
        const painted=mounted.host.getAtlasBtcRenderSnapshot();assert.equal(painted.paint.measurements.length,1);assert.equal(painted.paint.measurements[0].price,anchor.price);
        assert.equal(painted.paint.measurements[0].x,mounted.x(row.date));
      }finally{mounted?.destroy();}
    });
  }
  assert.deepEqual({observedRows,candles},before,'measurement must not modify source OHLC, close-only data, dates, or zero volume');
});


test('lab HUD consumes completed native paint counts without requesting a chart render', () => {
  const line = labViewSource.split('\n').find(value => value.includes('onAnnotationCounts:counts=>'));
  assert.ok(line, 'daily BTC mount forwards its paint-completion count callback');
  assert.match(line, /state\.btcAnnotationOwner!==annotationOwner/);
  assert.match(line, /atlas:workbench-state/);
  const callback = line.slice(line.indexOf('onAnnotationCounts:'));
  assert.doesNotMatch(callback, /schedule\(|paintPrice\(|\.render\(/, 'HUD refresh must not trigger chart or model rendering');
  assert.match(labViewSource, /state\.lastWorkbenchState=workbenchState/);
});

test('initial BTC range survives the native price-axis width calculation', async () => {
  await withFunnestFixture(async ({stage,svg,context}) => {
    let glyphWidth=6;context.measureText=value=>({width:String(value).length*glyphWidth});
    const observedRows=Array.from({length:30},(_,i)=>({date:new Date(date('2024-01-01')+i*DAY).toISOString().slice(0,10),price:70000+i*100}));
    let mounted;
    try {
      mounted=mountAtlasBtcFunnestChart({container:stage,svg,sourceMode:'close-only',observedRows,start:'2024-01-01',end:'2024-02-05',scale:'log'});
      await new Promise(resolve=>setTimeout(resolve,120));
      glyphWidth=10;mounted.chart.refreshTheme();mounted.chart.takeScreenshot();
      await new Promise(resolve=>setTimeout(resolve,60));
      const range=mounted.getVisibleTimeRange();
      assert.equal(Math.round(range.from),date('2024-01-01'),'price-axis layout must not remove the requested first days');
      assert.equal(Math.round(range.to),date('2024-02-05')+DAY-1,'the requested inclusive UTC end must survive first layout');
      svg.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,button:0}));
      const userRange={from:date('2024-01-10'),to:date('2024-01-25')};
      mounted.chart.setVisibleTimeRange(userRange);glyphWidth=14;mounted.chart.refreshTheme();mounted.chart.takeScreenshot();
      await new Promise(resolve=>setTimeout(resolve,60));
      const afterGesture=mounted.getVisibleTimeRange();
      assert.ok(afterGesture.from>=userRange.from,'late layout must not restore the startup dates after a user gesture');
      assert.equal(Math.round(afterGesture.to),userRange.to,'native user viewport remains authoritative');
    } finally {mounted?.destroy();}
  });
});


test('future BTC model points preserve simulated measurement anchors and temporary magnet modifiers', async () => {
  for (const item of [
    { mode: 'weak', offset: 6, snap: true },
    { mode: 'weak', offset: -40, snap: false },
    { mode: 'strong', offset: -40, snap: true },
    { mode: 'off', offset: 6, ctrlKey: true, snap: true },
    { mode: 'strong', offset: 6, metaKey: true, snap: false },
  ]) await withFunnestFixture(async ({ stage, svg, window }) => {
    const measurements = [], readouts = []; let mounted;
    try {
      mounted = mountAtlasBtcFunnestChart({ container: stage, svg, sourceMode: 'close-only', frequency: 'daily', chartType: 'line',
        observedRows: [1, 2, 3, 4, 5].map(day => ({ date: `2024-01-0${day}`, price: 100 + day })),
        forecast: sourceForecast, start: '2024-01-01', end: '2024-01-13', tool: 'measure', magnet: item.mode,
        onHover: detail => readouts.push(detail), onMeasurement: value => measurements.push(value) });
      await new Promise(resolve => setTimeout(resolve, 60));
      const expected = sourceForecast.find(row => row.date === '2024-01-07'), axis = mounted.getPriceScale(), box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
      const x = mounted.x(expected.date), y = axis.priceToY(expected.price) + item.offset;
      const point = { clientX: box.left + x / view.width * box.width, clientY: box.top + y / view.height * box.height,
        pointerId: 31, pointerType: 'mouse', ctrlKey: Boolean(item.ctrlKey), metaKey: Boolean(item.metaKey) };
      assert.equal(mounted.previewPointer(point), true);
      await new Promise(resolve => setTimeout(resolve, 30));
      const anchor = mounted.host.getAtlasBtcRenderSnapshot().interaction.measurementAnchor;
      assert.equal(anchor.date, expected.date); assert.equal(anchor.kind, 'simulated');
      assert.equal(anchor.snapped, item.snap, JSON.stringify(item));
      assert.equal(anchor.field, item.snap ? 'C' : 'free');
      if (item.snap) assert.equal(anchor.price, expected.price);
      else assert.ok(Number.isFinite(anchor.price) && anchor.price > 0, 'free future measurement uses the actual PaneCoords inverse');
      assert.equal(readouts.at(-1).kind, 'simulated'); assert.equal(readouts.at(-1).price, expected.price);
      svg.dispatchEvent(new window.Event('click', { bubbles: true }));
      assert.equal(measurements.length, 1);
      assert.equal(measurements[0].startDate, expected.date); assert.equal(measurements[0].startKind, 'simulated');
      assert.equal(measurements[0].startPrice, anchor.price); assert.equal(measurements[0].startField, anchor.field);
    } finally { mounted?.destroy(); }
  });
});
