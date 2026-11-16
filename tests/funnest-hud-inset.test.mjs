import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { mountObservedPriceChart } from '../dist/funnest-observed-price-adapter.js';

const candles = [
  { time: 1_700_000_000, open: 100, high: 110, low: 95, close: 105, volume: 12 },
  { time: 1_700_086_400, open: 105, high: 120, low: 101, close: 118, volume: 0 },
  { time: 1_700_172_800, open: 118, high: 125, low: 110, close: 112, volume: 4 },
].map(row => ({ ...row, date: new Date(row.time * 1000).toISOString() }));

/** Mount the actual pinned runtime under linkedom with a fixed 640x420 host box. */
function withRuntimeDom(run) {
  const { document, window } = parseHTML('<html><body><div id="plot"></div></body></html>');
  window.devicePixelRatio = 1;
  const globalKeys = ['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const originals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document);
  const setBounds = element => {
    element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 420, width: 640, height: 420 });
    for (const [key, value] of [['clientWidth', 640], ['clientHeight', 420], ['offsetWidth', 640], ['offsetHeight', 420]]) Object.defineProperty(element, key, { configurable: true, value });
  };
  document.createElement = (name, ...args) => {
    const element = originalCreate(name, ...args); setBounds(element);
    if (name === 'canvas') element.getContext = () => new Proxy({ canvas: element, measureText: value => ({ width: String(value).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }) }, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => { target[key] = value; return true; } });
    return element;
  };
  let nextFrame = 0;
  const ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const getComputedStyle = () => ({ getPropertyValue: () => '' });
  Object.assign(window, { ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++nextFrame, cancelAnimationFrame() {} });
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver, ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++nextFrame, cancelAnimationFrame() {} });
  try {
    const plot = document.getElementById('plot'); setBounds(plot);
    return run(plot);
  } finally {
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}

test('HUD top inset is reserved natively inside the price pane while the host keeps the allocated plot origin', () => {
  withRuntimeDom(plot => {
    const mounted = mountObservedPriceChart(plot, { series: { candles }, symbol: 'ETH-USD', currency: 'USD', insetTop: 100, onViewport() {}, onError() {} });
    try {
      assert.equal(mounted.host.style.inset, '0px 0px 0px 0px', 'the Funnest host must not move down for a HUD');
      assert.equal(mounted.chart.mainScale.insetTop, 100, 'the pinned engine setTopInset reserves the HUD height natively');
      assert.deepEqual({ top: mounted.getAtlasInsets().top, nativeTop: mounted.getAtlasInsets().nativeTop, hostInset: mounted.getAtlasInsets().hostInset }, { top: 100, nativeTop: 100, hostInset: '0px 0px 0px 0px' });
      assert.equal(mounted.setAtlasInsets({ top: 100 }), false, 'unchanged insets are a no-op');
      assert.equal(mounted.setAtlasInsets({ top: 76 }), true);
      assert.equal(mounted.chart.mainScale.insetTop, 76);
      assert.equal(mounted.host.style.inset, '0px 0px 0px 0px');
      assert.throws(() => mounted.setAtlasInsets({ top: -1 }), RangeError);
      mounted.chart.render();
      const layout = mounted.chart.layout, main = layout.panes.find(pane => pane.kind === 'main' || pane.id === 'main');
      assert.ok(layout.width > 0 && layout.height > 0 && main && main.height > 0, 'actual layout is available: ' + JSON.stringify(layout));
      const scaleY = 420 / layout.height, scaleX = 640 / layout.width, x = layout.plotWidth * scaleX / 2;
      // The reserved HUD band is not plot space for Atlas tools; the first pixel below it is.
      assert.equal(mounted.pointIsInPlot({ clientX: x, clientY: (main.top + 10) * scaleY }), false, 'points under the HUD reservation are outside the Atlas plot');
      assert.equal(mounted.pointIsInPlot({ clientX: x, clientY: (main.top + 76 + 1) * scaleY }), true, 'points below the reservation stay inside the Atlas plot');
      assert.equal(mounted.pointIsInPlot({ clientX: x, clientY: (main.top + main.height - 1) * scaleY }), true);
      assert.equal(mounted.pointIsInPlot({ clientX: x, clientY: (main.top + main.height + 2) * scaleY }), false);
      // Auto-scaled candles must lay out below the reserved band.
      const bars = mounted.getBars(), high = Math.max(...bars.map(bar => bar.high));
      const highY = mounted.chart.mainScale.priceToY(high);
      assert.ok(Number.isFinite(highY) && highY >= 76, 'the highest candle paints below the reserved HUD band: ' + highY);
      // Sibling HUDs (z-index 2) must stay above the runtime's z-index 3 native canvas.
      assert.equal(mounted.host.style.zIndex, '0', 'the host owns a stacking context so Atlas HUD siblings paint and hit-test above native canvases');
      // Event titles paint below the reserved band instead of under the HUD.
      const painted = [];
      const ctx = { font: '12px sans-serif', measureText: value => ({ width: String(value).length * 6, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 3, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 4 }) };
      const painter = { ctx, line() {}, vLine() {}, circle() {}, text: (...args) => painted.push(args), measure: value => String(value).length * 6 };
      const eventDate = candles[1].date.slice(0, 10), eventTime = Date.parse(eventDate + 'T00:00:00Z');
      mounted.setAtlasOverlays({ events: [{ date: eventDate, title: 'inset event' }], showEvents: true });
      const above = mounted.chart.overlays.slice(-3).filter(item => item.layer === 'above').at(0);
      above.render({ coords: { timeToX: time => time === eventTime ? 40 : NaN, priceToY: () => 150, height: 300, plotWidth: 400 }, painter });
      const receipt = mounted.inspectAtlasOverlayRender();
      assert.equal(receipt.eventLabels.length, 1);
      assert.equal(painted[0][2], 76 + 12, 'event label baseline sits just below the native top inset');
      assert.ok(receipt.eventLabels[0].canvasRect.top >= 76, 'event label never paints inside the reserved HUD band');
      mounted.setAtlasInsets({ top: 0 }); painted.length = 0;
      above.render({ coords: { timeToX: time => time === eventTime ? 40 : NaN, priceToY: () => 150, height: 300, plotWidth: 400 }, painter });
      assert.equal(painted[0][2], 12, 'without a HUD reservation the label keeps its original baseline');
    } finally { mounted.destroy(); }
  });
});

test('mounting fails closed when the pinned Funnest engine lacks setTopInset', () => {
  withRuntimeDom(plot => {
    const probe = mountObservedPriceChart(plot, { series: { candles }, symbol: 'ETH-USD', currency: 'USD', onViewport() {}, onError() {} });
    const proto = Object.getPrototypeOf(probe.chart), descriptor = Object.getOwnPropertyDescriptor(proto, 'setTopInset');
    probe.destroy();
    assert.ok(descriptor, 'the pinned engine exposes chart.setTopInset on its prototype');
    delete proto.setTopInset;
    try {
      assert.throws(() => mountObservedPriceChart(plot, { series: { candles }, symbol: 'ETH-USD', currency: 'USD', insetTop: 50, onViewport() {}, onError() {} }), /setTopInset/);
      assert.equal(plot.querySelector('.atlas-funnest-canvas'), null, 'a rejected mount leaves no orphan host');
    } finally { Object.defineProperty(proto, 'setTopInset', descriptor); }
  });
});

test('adapter and views keep the native inset contract in source', async () => {
  const adapter = await readFile(new URL('../dist/funnest-observed-price-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /mounted\.chart\.setTopInset\(top\)/);
  assert.match(adapter, /mounted\.host\.style\.inset = `0px \$\{right\}px \$\{bottom\}px \$\{left\}px`/);
  assert.doesNotMatch(adapter, /mounted\.host\.style\.inset = `\$\{top\}px/, 'the host must never be pushed down by the HUD inset');
  assert.match(adapter, /typeof mounted\.chart\.setTopInset !== 'function'/);
  for (const name of ['eth-view.js', 'equity-view.js']) {
    const source = await readFile(new URL(`../dist/${name}`, import.meta.url), 'utf8');
    assert.match(source, /insetTop:headerInset/);
    assert.match(source, /setAtlasInsets\?\.\(\{top:headerInset\}\)/);
    assert.doesNotMatch(source, /host\.style\.inset/);
  }
});
