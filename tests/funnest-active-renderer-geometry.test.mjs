import assert from 'node:assert/strict';
import test from 'node:test';
import { drawAtlasPriceChart } from '../dist/atlas-price-chart.js';
import { drawChartReplay } from '../dist/chart-replay-renderer.js';
import { areaPath, barPath, linearScale, linePath } from '../dist/funnest-research-primitives.bundle.js';
import { utcDay } from '../dist/cycle-engine.js';
import { chartPaneLayout } from '../dist/chart-overlays.js?v=1.29.0';
import { candleBodyWidth } from '../dist/chart-view-policy.js?v=1.36.1';

function fixedPath(path) {
  return path.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, value => Number(value).toFixed(2));
}
function relativeBar(x, width, baseY, valueY) {
  const match = barPath(x, width, baseY, valueY).match(/^M([^,]+),([^H]+)H([^V]+)V([^H]+)H([^Z]+)Z$/);
  assert.ok(match, 'Funnest bar primitive retains the expected rectangular path contract');
  const [sx, sy, ex, ey, baseX] = match.slice(1).map(Number);
  return `M${sx.toFixed(2)},${sy.toFixed(2)}h${(ex - sx).toFixed(2)}v${(ey - sy).toFixed(2)}h${(baseX - ex).toFixed(2)}Z`;
}

class AtlasSvg {
  constructor(width = 900, height = 420) {
    this.attrs = new Map(); this.nodes = new Map(); this.dataset = {}; this.textContent = '';
    Object.assign(this, { id: 'funnest-atlas', clientWidth: width, clientHeight: height,
      parentElement: { style: { setProperty() {} } },
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) });
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  querySelector(selector) { if (!this.nodes.has(selector)) this.nodes.set(selector, new AtlasSvg()); return this.nodes.get(selector); }
  querySelectorAll(selector) { return selector === 'text' ? [0, 1, 2, 3].map(index => this.querySelector(`text-${index}`)) : []; }
  focus() {}
}

class ReplayNode {
  constructor(tag = 'g') { this.tagName = tag; this.attrs = new Map(); this.nodes = new Map(); this.children = []; this.dataset = {}; this.textContent = ''; this._markup = ''; }
  setAttribute(key, value) { this.attrs.set(key, String(value)); if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  removeAttribute(key) { this.attrs.delete(key); }
  append(...nodes) { for (const child of nodes) { child.parentNode = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  removeChild(child) { this.children = this.children.filter(value => value !== child); child.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
  replaceChildren(...nodes) { this.innerHTML = ''; this.append(...nodes); }
  set innerHTML(value) { this._markup = value; this.nodes.clear(); this.children = []; }
  get innerHTML() { return this._markup; }
  matches(selector) {
    if (selector.startsWith('[') && selector.endsWith(']')) return this.attrs.has(selector.slice(1, -1));
    if (selector.startsWith('.')) return (this.attrs.get('class') ?? '').split(' ').includes(selector.slice(1));
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = parent => { for (const child of parent.children) { if (child.matches(selector)) found.push(child); walk(child); } };
    walk(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() {}
}
function replaySvg(width = 900, height = 420) {
  const svg = new ReplayNode('svg');
  Object.assign(svg, { id: 'funnest-replay', clientWidth: width, clientHeight: height,
    parentElement: { style: { setProperty() {} } },
    ownerDocument: { createElementNS: (_, tag) => new ReplayNode(tag), defaultView: {
      requestAnimationFrame(callback) { callback(); return 1; }, cancelAnimationFrame() {},
    } },
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) });
  return svg;
}
const day = index => new Date(Date.UTC(2024, 0, index)).toISOString().slice(0, 10);
const atlasRows = () => [
  { date: day(1), price: 101.25 }, { date: day(2), price: 107.5 }, { date: day(3), price: 103.75 },
];
const replayRows = () => [
  { date: day(1), price: 101.25 }, { date: day(2), price: 107.5 }, { date: day(3), price: 103.75 },
];
function replayData({ rows = replayRows(), forecast = [], candles = [] } = {}) {
  return { originDate: day(1), symbol: 'ETHUSD', candleSource: 'Fixture venue', frequency: 'daily', scale: 'linear',
    observedRows: rows, observedCandles: candles,
    frame: { cursorDate: day(3), inputVisible: true, forecastVisible: true, forecast } };
}

test('Atlas research close geometry is the shared Funnest line over the unchanged source rows', () => {
  const svg = new AtlasSvg(), rows = atlasRows(), before = structuredClone(rows), beforeBytes = JSON.stringify(rows);
  const controller = drawAtlasPriceChart({ svg, rows, start: day(1), end: day(3), split: day(3), frequency: 'daily',
    scale: 'linear', showDrawdown: false, showStates: false, showHistoricalEvents: false });
  const axis = controller.getPriceScale(), xScale = linearScale([utcDay(day(1)), utcDay(day(3))], [axis.left, axis.right]);
  const expected = fixedPath(linePath(rows.map(row => ({ x: xScale(utcDay(row.date)), y: axis.y(row.price) }))));
  const actual = svg.innerHTML.match(/class="observed-close-line" d="([^"]*)"/)?.[1];
  assert.equal(actual, expected, 'the active Atlas series uses Funnest linePath and the Funnest x/y scales');
  assert.deepEqual(rows, before, 'rendering does not rewrite source prices or dates');
  assert.equal(JSON.stringify(rows), beforeBytes, 'source bytes remain identical after rendering');
  assert.equal(controller.getDate(), day(3));
});

test('Atlas individual volume bars use Funnest scales with exact observed volume values', () => {
  const svg = new AtlasSvg(), rows = atlasRows(), volumeBars = rows.map((row, index) => ({ ...row, open: row.price - 1, close: row.price, volume: (index + 1) * 10 }));
  const before = structuredClone(volumeBars), beforeBytes = JSON.stringify(volumeBars);
  drawAtlasPriceChart({ svg, rows, volumeBars, start: day(1), end: day(3), split: day(3), frequency: 'daily',
    scale: 'linear', showVolume: true, showDrawdown: false, showStates: false, showHistoricalEvents: false });
  const bars = [...svg.innerHTML.matchAll(/<rect class="volume-bar"[^>]*>/g)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])));
  assert.equal(bars.length, volumeBars.length);
  const layout = chartPaneLayout({ width: svg.clientWidth, height: svg.clientHeight, volume: true, drawdown: false, states: false, cycleTiming: false, top: 70 });
  const left = layout.left, right = svg.clientWidth - layout.right, span = utcDay(day(3)) - utcDay(day(1));
  const x = linearScale([utcDay(day(1)), utcDay(day(1)) + span], [left, right]);
  const y = linearScale([0, 50], [layout.volumeBottom, layout.volumeTop]);
  const width = candleBodyWidth(right - left, span, 1);
  for (const [index, actual] of bars.entries()) {
    const bar = volumeBars[index], xx = x(utcDay(bar.date)) - width / 2, yy = y(bar.volume);
    assert.equal(Number(actual['data-volume']), bar.volume);
    assert.ok(Math.abs(Number(actual.x) - xx) < 1e-8 && Math.abs(Number(actual.width) - width) < 1e-8);
    assert.ok(Math.abs(Number(actual.y) - yy) < 1e-8 && Math.abs(Number(actual.height) - (layout.volumeBottom - yy)) < 1e-8,
      'rendered volume rectangles use Funnest x/y scales at the exact source quantity');
  }
  assert.deepEqual(volumeBars, before, 'volume data remains unchanged');
  assert.equal(JSON.stringify(volumeBars), beforeBytes, 'volume source bytes remain identical');
});

test('Atlas dense volume batches use Funnest barPath without summing or averaging source quantities', () => {
  const width = 320, height = 420, svg = new AtlasSvg(width, height), rows = Array.from({ length: 257 }, (_, index) => ({ date: day(index + 1), price: 100 + index }));
  const volumeBars = rows.map((row, index) => ({ ...row, open: 99, close: 100, volume: index + 1 })), beforeBytes = JSON.stringify(volumeBars);
  drawAtlasPriceChart({ svg, rows, volumeBars, start: rows[0].date, end: rows.at(-1).date, split: rows.at(-1).date,
    frequency: 'daily', scale: 'linear', showVolume: true, showDrawdown: false, showStates: false, showHistoricalEvents: false });
  const path = svg.innerHTML.match(/<path class="volume-bars-batch" d="([^"]+)"/)?.[1];
  assert.ok(path); assert.equal((path.match(/M/g) ?? []).length, volumeBars.length, 'every observed volume is retained as its own bar subpath');
  const layout = chartPaneLayout({ width, height, volume: true, drawdown: false, states: false, cycleTiming: false, top: 70 });
  const left = layout.left, right = width - layout.right, span = utcDay(rows.at(-1).date) - utcDay(rows[0].date);
  const x = linearScale([utcDay(rows[0].date), utcDay(rows[0].date) + span], [left, right]), y = linearScale([0, 500], [layout.volumeBottom, layout.volumeTop]);
  const barWidth = candleBodyWidth(right - left, span, 1), firstX = x(utcDay(volumeBars[0].date)) - barWidth / 2;
  assert.ok(path.startsWith(relativeBar(firstX, barWidth, layout.volumeBottom, y(volumeBars[0].volume))));
  assert.equal(JSON.stringify(volumeBars), beforeBytes, 'dense volume batching does not change source values');
});

test('Atlas and replay preserve missing-day discontinuities instead of connecting the gap', () => {
  const rows = [atlasRows()[0], atlasRows()[1], { date: day(5), price: 103.75 }], svg = new AtlasSvg();
  drawAtlasPriceChart({ svg, rows, start: day(1), end: day(5), split: day(5), frequency: 'daily', scale: 'linear',
    showDrawdown: false, showStates: false, showHistoricalEvents: false });
  const atlasPath = svg.innerHTML.match(/class="observed-close-line" d="([^"]*)"/)?.[1];
  assert.equal((atlasPath.match(/M/g) ?? []).length, 2, 'Atlas keeps distinct source runs across the absent date');

  const replay = replaySvg(), forecast = [
    { date: day(4), price: 112, lower: 108, upper: 116 },
    { date: day(6), price: 118, lower: 114, upper: 122 },
  ];
  drawChartReplay({ svg: replay, data: replayData({ forecast }), start: day(1), end: day(7), chartType: 'line' });
  const forecastPath = replay.querySelector('[data-replay-forecast-path]')?.getAttribute('d');
  assert.equal((forecastPath.match(/M/g) ?? []).length, 2, 'replay forecast uses Funnest segments with an explicit gap');
  assert.equal(replay.querySelectorAll('.replay-band').length, 0, 'isolated forecast points do not fabricate a filled band');
});

test('replay observed and forecast paths/areas match Funnest primitives and preserve exact inputs', () => {
  const svg = replaySvg(), rows = replayRows(), forecast = [
    { date: day(3), price: 111.125, lower: 106.5, upper: 115.75 },
    { date: day(4), price: 114.25, lower: 109.25, upper: 119.5 },
  ], data = replayData({ rows, forecast }), before = structuredClone(data), beforeBytes = JSON.stringify(data);
  const chart = drawChartReplay({ svg, data, start: day(1), end: day(5), chartType: 'line' });
  const xScale = linearScale([utcDay(day(1)), utcDay(day(5))], [chart.axis.left, chart.axis.right]);
  const observedExpected = fixedPath(linePath(rows.map(row => ({ x: xScale(utcDay(row.date)), y: chart.axis.y(row.price) }))));
  const observedActual = svg.innerHTML.match(/class="observed-close-line" d="([^"]*)"/)?.[1];
  assert.equal(observedActual, observedExpected, 'replay observed data uses Funnest linePath and scale functions');
  const forecastPath = svg.querySelector('[data-replay-forecast-path]')?.getAttribute('d');
  assert.equal(forecastPath, fixedPath(linePath(forecast.map(row => ({ x: xScale(utcDay(row.date)), y: chart.axis.y(row.price) })))));
  const band = svg.querySelector('.replay-band')?.getAttribute('d');
  assert.equal(band, fixedPath(areaPath(
    forecast.map(row => ({ x: xScale(utcDay(row.date)), y: chart.axis.y(row.upper) })),
    forecast.map(row => ({ x: xScale(utcDay(row.date)), y: chart.axis.y(row.lower) })),
  )), 'forecast bands use Funnest areaPath without altering their bounds');
  assert.deepEqual(data, before, 'observed and forecast inputs remain byte/value-equivalent');
  assert.equal(JSON.stringify(data), beforeBytes, 'observed and forecast source bytes remain identical');
  assert.deepEqual(chart.getSelection().candle, null);
});

test('generic replay reveals its SVG, suspends live Funnest hosts, and restores exact prior state on destroy/failure', () => {
  const svg = replaySvg(), stage = new ReplayNode('div'), canvas = new ReplayNode('div'), status = new ReplayNode('span');
  stage.style = { setProperty() {} }; stage.children = [canvas, status, svg];
  stage.querySelectorAll = selector => stage.children.filter(element => selector.includes('.atlas-funnest-canvas') && element.matches('.atlas-funnest-canvas') || selector.includes('.atlas-funnest-status') && element.matches('.atlas-funnest-status'));
  canvas.setAttribute('class', 'atlas-funnest-canvas'); canvas.style = { visibility: 'visible', opacity: '0.35', pointerEvents: 'none' }; canvas.setAttribute('aria-hidden', 'false');
  status.setAttribute('class', 'atlas-funnest-status'); status.style = { visibility: 'visible' }; status.hidden = false; status.setAttribute('aria-hidden', 'false');
  svg.parentElement = stage; svg.style = { visibility: 'hidden', opacity: '0', pointerEvents: 'none' }; svg.hidden = false;
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.setAttribute('tabindex', '-1');
  const data = replayData(), before = { canvas: { ...canvas.style }, status: { ...status.style }, canvasAria: canvas.getAttribute('aria-hidden'), statusAria: status.getAttribute('aria-hidden'), statusHidden: status.hidden,
    svg: { ...svg.style }, svgAria: svg.getAttribute('aria-hidden'), focusable: svg.getAttribute('focusable'), tabindex: svg.getAttribute('tabindex') };
  const chart = drawChartReplay({ svg, data, start: day(1), end: day(5), chartType: 'line' });
  assert.equal(svg.style.opacity, '1'); assert.equal(svg.style.pointerEvents, 'auto'); assert.equal(svg.getAttribute('aria-hidden'), null);
  assert.equal(svg.getAttribute('focusable'), 'true'); assert.equal(svg.getAttribute('tabindex'), '0');
  assert.equal(canvas.style.visibility, 'hidden'); assert.equal(canvas.getAttribute('aria-hidden'), 'true');
  assert.equal(status.hidden, true); assert.equal(status.getAttribute('aria-hidden'), 'true');
  assert.match(svg.innerHTML, /class="observed-close-line"/);
  chart.destroy();
  assert.deepEqual({ canvas: { ...canvas.style }, status: { ...status.style }, canvasAria: canvas.getAttribute('aria-hidden'), statusAria: status.getAttribute('aria-hidden'), statusHidden: status.hidden,
    svg: { ...svg.style }, svgAria: svg.getAttribute('aria-hidden'), focusable: svg.getAttribute('focusable'), tabindex: svg.getAttribute('tabindex') }, before,
  'destroy restores exact original visibility, interaction, accessibility and inline-style state');

  const createElementNS = svg.ownerDocument.createElementNS;
  svg.ownerDocument.createElementNS = () => { throw new Error('synthetic SVG paint failure'); };
  assert.throws(() => drawChartReplay({ svg, data, start: day(1), end: day(5), chartType: 'line' }), /synthetic SVG paint failure/);
  svg.ownerDocument.createElementNS = createElementNS;
  assert.deepEqual({ canvas: { ...canvas.style }, status: { ...status.style }, canvasAria: canvas.getAttribute('aria-hidden'), statusAria: status.getAttribute('aria-hidden'), statusHidden: status.hidden,
    svg: { ...svg.style }, svgAria: svg.getAttribute('aria-hidden'), focusable: svg.getAttribute('focusable'), tabindex: svg.getAttribute('tabindex') }, before,
  'failed rendering also releases the surface lease');
});

test('replay candle geometry follows the Funnest scales while source OHLC stays exact', () => {
  const svg = replaySvg(), candle = { date: day(2), startDate: day(2), endDate: day(2), time: Date.parse(day(2)) / 1000,
    open: 102.125, high: 110.875, low: 99.5, close: 108.375, volume: 17.25 };
  const data = replayData({ rows: [{ date: day(1), price: 101.25 }, { date: day(2), price: candle.close }], candles: [candle] });
  const before = structuredClone(data), beforeBytes = JSON.stringify(data), chart = drawChartReplay({ svg, data, start: day(1), end: day(3), chartType: 'candles' });
  const group = svg.innerHTML.match(/<g class="observed-candle"[^>]*>([\s\S]*?)<\/g>/)?.[0];
  assert.ok(group, 'the genuine source candle is rendered');
  for (const [key, value] of Object.entries({ open: candle.open, high: candle.high, low: candle.low, close: candle.close }))
    assert.match(group, new RegExp(`data-${key}="${value}"`), `${key} retains the exact source value`);
  const wick = group.match(/<line x1="([^"]+)" x2="([^"]+)" y1="([^"]+)" y2="([^"]+)" stroke=/);
  const rect = group.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" fill=/);
  assert.ok(wick && rect);
  const x = chart.x(day(2)), width = candleBodyWidth(chart.axis.right - chart.axis.left, utcDay(day(3)) - utcDay(day(1)), 1);
  assert.equal(Number(wick[1]), x); assert.equal(Number(wick[2]), x);
  assert.equal(Number(wick[3]), chart.axis.y(candle.high)); assert.equal(Number(wick[4]), chart.axis.y(candle.low));
  const [rectX, rectY, rectWidth, rectHeight] = rect.slice(1).map(Number), openY = chart.axis.y(candle.open), closeY = chart.axis.y(candle.close);
  assert.ok(Math.abs(rectX - (x - width / 2)) < 1e-8 && Math.abs(rectWidth - width) < 1e-8);
  assert.ok(Math.abs(rectY - Math.min(openY, closeY)) < 1e-8 && Math.abs(rectHeight - Math.max(1, Math.abs(openY - closeY))) < 1e-8,
    'visible body rectangle uses Funnest x/y scales without changing OHLC geometry');
  assert.deepEqual(data, before, 'candle painting does not synthesize or mutate OHLCV');
  assert.equal(JSON.stringify(data), beforeBytes, 'OHLCV input bytes remain identical');
});
