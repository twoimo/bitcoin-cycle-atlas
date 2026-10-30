import assert from 'node:assert/strict';
import test from 'node:test';
import { drawChartReplay, drawReplaySelection } from '../dist/chart-replay-renderer.js';

class SvgNode {
  constructor(tag = 'g') { this.tagName = tag; this.attrs = new Map(); this.nodes = new Map(); this.children = []; this.dataset = {}; this.textContent = ''; this._markup = ''; }
  setAttribute(key, value) { this.attrs.set(key, String(value)); if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  removeAttribute(key) { this.attrs.delete(key); }
  append(...nodes) { for (const child of nodes) { child.parentNode = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  removeChild(child) { this.children = this.children.filter(value => value !== child); child.parentNode = null; }
  remove() { this.removed = true; this.parentNode?.removeChild(this); }
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
    walk(this);
    if (selector === '.observed-candle') {
      if (!this.candleNodes) this.candleNodes = [];
      if (this.candleMarkup !== this._markup) {
        this.candleMarkup = this._markup;
        this.candleNodes = [...this._markup.matchAll(/<g class="observed-candle" data-date="([^"]+)"[^>]*>[\s\S]*?<title>([^<]+)<\/title><\/g>/g)].map(match => {
          const candle = new SvgNode(); candle.setAttribute('data-date', match[1]);
          const title = new SvgNode('title'); title.textContent = match[2]; candle.append(title); return candle;
        });
      }
      found.push(...this.candleNodes);
    }
    return found;
  }
  querySelector(selector) {
    const found = this.querySelectorAll(selector)[0]; if (found) return found;
    if (!this.nodes.has(selector)) this.nodes.set(selector, new SvgNode(selector));
    return this.nodes.get(selector);
  }
  focus() { this.focused = true; }
}

function fixture(width = 1100, height = 500) {
  const svg = new SvgNode('svg'), frames = new Map(); let nextFrame = 0;
  Object.assign(svg, { id: 'main-price-chart', clientWidth: width, clientHeight: height, parentElement: { style: { setProperty() {} } },
    ownerDocument: { createElementNS: (_, tag) => new SvgNode(tag), defaultView: {
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); },
    } } });
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
  return { svg, frames, flush() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); } };
}

const date = number => `2024-01-${String(number).padStart(2, '0')}`;
const row = (number, price = 100 + number) => ({ date: date(number), price });
const candle = (number, price = 100 + number) => ({ date: date(number), startDate: date(number), endDate: date(number), time: Date.parse(date(number)) / 1000, open: price - 2, high: price + 4, low: price - 4, close: price });
function frameData(cursor = 3) {
  return { originDate: date(2), symbol: 'ETHUSD', candleSource: 'Coinbase Exchange', frequency: 'daily', scale: 'log',
    observedRows: Array.from({ length: 6 }, (_, i) => row(i + 1, i === 5 ? 99999999 : undefined)),
    observedCandles: Array.from({ length: 6 }, (_, i) => candle(i + 1, i === 5 ? 99999999 : undefined)),
    frame: { cursorDate: date(cursor), inputVisible: true, forecastVisible: true,
      forecast: Array.from({ length: 6 }, (_, i) => ({ ...row(i + 2, 102 + i * 3), lower: 95 + i, upper: 110 + i * 5 })) } };
}
function draw(svg, data, options = {}) { return drawChartReplay({ svg, data, start: date(1), end: date(8), ...options }); }

test('the main SVG renders only revealed genuine OHLC and fixed predictions, with asset-correct titles', () => {
  const { svg } = fixture(), data = frameData(), preserved = structuredClone(data); let inspected;
  const result = draw(svg, data, { onInspect: value => { inspected = value; } });
  assert.equal(svg.id, 'main-price-chart');
  assert.equal(svg.dataset.observedCandleCount, '3');
  assert.equal(svg.dataset.replayForecastCandleCount, '0');
  assert.doesNotMatch(svg.innerHTML, /99999999|data-date="2024-01-0[4-6]"/);
  assert.equal(svg.querySelectorAll('[data-chart-replay-overlay]').length, 1);
  assert.ok(svg.querySelectorAll('.observed-candle').every(element => /Coinbase Exchange ETHUSD/.test(element.querySelector('title').textContent)));
  result.selectDate(date(6));
  assert.equal(inspected.actual, null);
  assert.equal(inspected.candle, null);
  assert.equal(inspected.predicted, data.frame.forecast[4].price);
  assert.equal(inspected.kind, 'forecast');
  result.selectDate(date(3));
  assert.equal(inspected.actual, 103);
  assert.equal(inspected.candle.high, 107);
  assert.deepEqual(data, preserved);
});

test('price scale ignores offscreen observations, unrevealed actuals, and the all-history frame domain', () => {
  const original = frameData();
  original.observedRows[0].price = 1e12;
  original.observedCandles[0] = candle(1, 1e12);
  original.frame.forecast.push({ date: date(10), price: 1e15, lower: 1e14, upper: 1e16 });
  original.priceDomain = { min: .001, max: 1e30 };
  const changed = structuredClone(original);
  for (const value of changed.observedRows) if (value.date > date(3)) value.price *= 1e10;
  for (const value of changed.observedCandles) if (value.date > date(3)) for (const key of ['open', 'high', 'low', 'close']) value[key] *= 1e10;
  const a = fixture(), b = fixture();
  const left = draw(a.svg, original, { start: date(2), end: date(5) });
  const right = draw(b.svg, changed, { start: date(2), end: date(5) });
  assert.ok(left.axis.min > 80 && left.axis.max < 150);
  assert.equal(left.axis.min, right.axis.min);
  assert.equal(left.axis.max, right.axis.max);
  assert.equal(a.svg.querySelector('[data-replay-forecast-path]').getAttribute('d'), b.svg.querySelector('[data-replay-forecast-path]').getAttribute('d'));
});

test('close-only observations stay a line when candles are requested', () => {
  const { svg } = fixture(), data = frameData();
  data.observedCandles = []; data.ohlcAvailable = false;
  draw(svg, data);
  assert.equal(svg.dataset.observedCandleCount, '0');
  assert.equal(svg.dataset.replayOhlcAvailable, 'false');
  assert.match(svg.innerHTML, /class="observed-close-line"/);
  assert.doesNotMatch(svg.innerHTML, /class="observed-candle"/);
});

test('forecast-only viewport keeps its permitted price axis and never reports a nearest hidden actual', () => {
  const { svg } = fixture(), data = frameData(); let inspected;
  const chart = draw(svg, data, { start: date(5), end: date(8), onInspect: value => { inspected = value; } });
  assert.ok(chart.axis.min > 90 && chart.axis.max < 145);
  assert.ok(svg.querySelector('[data-replay-forecast-path]').getAttribute('d').startsWith('M'));
  assert.equal(svg.querySelector('.chart-empty-message').removed, true);
  chart.selectDate(date(5)); assert.equal(inspected.actual, null); assert.equal(inspected.predicted, 111);
  assert.doesNotMatch(svg.innerHTML, /NaN|Infinity/);
});

test('missing forecast days break both the line and the conditional band', () => {
  const { svg } = fixture(), data = frameData();
  data.frame.forecast = data.frame.forecast.filter(value => value.date !== date(4));
  draw(svg, data);
  const path = svg.querySelector('[data-replay-forecast-path]').getAttribute('d');
  assert.equal((path.match(/M/g) ?? []).length, 2);
  assert.equal(svg.querySelectorAll('.replay-band').length, 2);
});

test('preserved equity forecasts keep zero to positive to zero segments on a linear axis', () => {
  const { svg } = fixture(), data = frameData(); let inspected;
  data.symbol = 'BMNR'; data.scale = 'linear';
  data.frame.forecast = [0, 20, 0].map((price, index) => ({ date: date(index + 4), price, lower: 0, upper: price + 5 }));
  const preserved = structuredClone(data.frame.forecast);
  const chart = draw(svg, data, { start: date(4), end: date(6), onInspect: value => { inspected = value; } });
  assert.equal(chart.axis.scale, 'linear'); assert.equal(chart.axis.min, 0);
  assert.equal(svg.dataset.replayForecastPoints, '3');
  const path = svg.querySelector('[data-replay-forecast-path]').getAttribute('d');
  assert.equal((path.match(/M/g) ?? []).length, 1); assert.equal((path.match(/L/g) ?? []).length, 2);
  assert.ok(path.includes(chart.axis.y(0).toFixed(2)));
  chart.selectDate(date(4)); assert.equal(inspected.predicted, 0); assert.equal(inspected.actual, null);
  assert.match(chart.getSelection().copyText, /고정 예측: \$0/);
  assert.deepEqual(data.frame.forecast, preserved);
  const zeros = { ...data, frame: { ...data.frame, forecast: data.frame.forecast.map(value => ({ ...value, price: 0, lower: 0, upper: 0 })) } };
  const allZero = draw(svg, zeros, { start: date(4), end: date(6) });
  assert.equal(allZero.axis.min, 0); assert.ok(allZero.axis.max > 0);
  assert.doesNotMatch(svg.querySelector('[data-replay-forecast-path]').getAttribute('d'), /NaN|Infinity/);
});

test('a strict information-time frame hides prices and does not retain the preceding live-like price scale', () => {
  const { svg } = fixture(), data = frameData();
  draw(svg, data);
  const hidden = { ...data, observedRows: [], observedCandles: [], frame: { ...data.frame, inputVisible: false, forecastVisible: false, forecast: [] } };
  const chart = draw(svg, hidden);
  assert.equal(svg.dataset.replayPriceHidden, 'true');
  assert.equal(svg.dataset.replayForecastPoints, '0');
  assert.equal(chart.axis.scale, 'none');
  assert.equal(chart.axis.min, null); assert.equal(chart.axis.max, null);
  assert.equal(chart.getSelection().actual, null); assert.equal(chart.getSelection().predicted, null);
  assert.equal(svg.querySelectorAll('[data-replay-forecast-path]').length, 0);
  assert.doesNotMatch(svg.innerHTML, /observed-candle|observed-close-line|\$10/);
});

test('date coordinates and inspection remain correct at phone, tablet, desktop and CSS-scaled sizes', () => {
  for (const width of [320, 390, 768, 1440]) for (const height of [180, 500]) {
    const { svg } = fixture(width, height); let inspected;
    const chart = draw(svg, frameData(), { onInspect: value => { inspected = value; } });
    svg.getBoundingClientRect = () => ({ left: 30, top: 20, width: width / 2, height: height / 2 });
    assert.equal(chart.dateAt(30 + chart.x(date(1)) / 2), date(1));
    assert.equal(chart.dateAt(30 + chart.x(date(6)) / 2), date(6));
    assert.equal(chart.dateAt(30 + chart.x(date(8)) / 2), date(8));
    assert.equal(chart.previewPointer({ clientX: 30 + chart.x(date(5)) / 2, clientY: 20 + (chart.axis.top + chart.axis.bottom) / 4, pointerType: 'mouse' }), true);
    assert.equal(inspected.date, date(5)); assert.equal(inspected.actual, null);
    assert.equal(chart.previewPointer({ clientX: 0, clientY: 0, pointerType: 'mouse' }), false);
    assert.doesNotMatch(svg.innerHTML, /NaN|Infinity/);
  }
});

test('redraw cancels queued native/replay hover, and an old destroy cannot detach the new renderer', () => {
  const harness = fixture(), { svg } = harness, inspected = [];
  const old = draw(svg, frameData(), { onInspect: value => inspected.push('old:' + value.date) });
  const staleHandler = svg.onpointermove;
  staleHandler({ clientX: old.x(date(4)), clientY: old.axis.top + 20, pointerType: 'mouse' });
  const next = draw(svg, frameData(4), { onInspect: value => inspected.push('new:' + value.date) });
  const handler = svg.onpointermove; old.destroy();
  assert.equal(svg.onpointermove, handler);
  const baseline = inspected.length; staleHandler({ clientX: old.x(date(5)), clientY: old.axis.top + 20 });
  harness.flush(); assert.equal(inspected.length, baseline);
  handler({ clientX: next.x(date(5)), clientY: next.axis.top + 20, pointerType: 'mouse' });
  harness.flush(); assert.equal(inspected.at(-1), 'new:' + date(5));
  next.destroy(); assert.equal(svg.onpointermove, null);
});

test('selection renders the supplied archive on the same chart without a prediction or invented weekly candles', () => {
  const { svg } = fixture(390, 250), observations = Array.from({ length: 8 }, (_, i) => ({ ...row(i + 1), ...candle(i + 1) }));
  const before = structuredClone(observations); let inspected;
  const chart = drawReplaySelection({ svg, observations, start: date(1), end: date(8), symbol: 'BTCUSD', frequency: 'weekly', onInspect: value => { inspected = value; } });
  assert.equal(svg.dataset.replayMode, 'selecting'); assert.equal(svg.dataset.observedCandleCount, '0');
  assert.equal(svg.querySelectorAll('[data-replay-forecast-path]').length, 0);
  chart.selectDate(date(8)); assert.equal(inspected.actual, 108); assert.equal(inspected.predicted, null);
  assert.deepEqual(observations, before);
});

test('the asset-neutral painter keeps price and date axes inside short mobile viewports', () => {
  for (const width of [320, 390]) for (const height of [180, 300]) {
    const { svg } = fixture(width, height);
    const chart = draw(svg, frameData());
    const priceLabels = [...svg.innerHTML.matchAll(/<text x="([\d.e+-]+)" y="([\d.e+-]+)"[^>]*data-price-axis-label="tick" textLength="([\d.e+-]+)"[^>]*>([^<]+)<\/text>/g)];
    assert.ok(priceLabels.length >= 2, 'The observed chart needs an explicit price axis');
    for (const [, x, y, length, label] of priceLabels) {
      assert.ok(Number(x) > chart.axis.right && Number(x) + Number(length) <= width);
      assert.ok(Number(y) >= chart.axis.top && Number(y) <= chart.axis.bottom + 4);
      assert.match(label, /^\$/);
    }
    const dates = [...svg.innerHTML.matchAll(/class="replay-time-label" x="([\d.e+-]+)" y="([\d.e+-]+)"[^>]*>([^<]+)<\/text>/g)];
    assert.ok(dates.length >= 2, 'The observed chart needs an explicit calendar axis');
    for (const [, x, y] of dates) {
      assert.ok(Number(x) >= chart.axis.left && Number(x) <= chart.axis.right);
      assert.ok(Number(y) > chart.axis.bottom && Number(y) < height);
    }
    assert.equal(svg.getAttribute('viewBox'), `0 0 ${width} ${height}`);
    assert.doesNotMatch(svg.innerHTML, /NaN|Infinity/);
  }
});

test('dense observed candles preserve every completed wick and body, including visible extrema', () => {
  const { svg } = fixture(320, 300);
  const calendar = index => new Date(Date.UTC(2023, 0, index + 1)).toISOString().slice(0, 10);
  const candles = Array.from({ length: 400 }, (_, index) => ({
    date: calendar(index), open: 100 + index, close: 101 + index,
    low: index === 150 ? 1 : 99 + index, high: index === 150 ? 1e6 : 103 + index,
  }));
  for (const value of candles.slice(397)) value.high = 1e15;
  const data = { symbol: 'ETHUSD', originDate: calendar(0), scale: 'linear',
    observedRows: candles.map(value => ({ date: value.date, price: value.close })), observedCandles: candles,
    frame: { cursorDate: calendar(396), forecast: [], inputVisible: true, forecastVisible: true } };
  const chart = draw(svg, data, { start: calendar(0), end: calendar(399) });
  assert.equal(svg.dataset.observedCandleCount, '397');
  assert.equal(svg.dataset.candleRendering, 'batched');
  assert.equal(svg.dataset.observedLineCount, '0');
  const batched = svg.innerHTML.match(/<g class="observed-candles-batched" data-count="397">([\s\S]*?)<\/g>/)?.[1];
  assert.ok(batched, 'A dense viewport must retain the complete observed-candle count');
  const paths = [...batched.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]);
  assert.equal(paths.filter(path => path.includes('V')).reduce((count, path) => count + (path.match(/M/g) ?? []).length, 0), 397);
  assert.equal(paths.filter(path => path.includes('Z')).reduce((count, path) => count + (path.match(/M/g) ?? []).length, 0), 397);
  const extreme = `M${chart.x(calendar(150)).toFixed(2)},${chart.axis.y(1e6).toFixed(2)}V${chart.axis.y(1).toFixed(2)}`;
  assert.ok(paths.some(path => path.includes(extreme)), 'Pixel density cannot remove a genuine OHLC extreme');
  assert.ok(chart.axis.min <= 1 && chart.axis.max >= 1e6 && chart.axis.max < 2e6);
  chart.selectDate(calendar(150)); assert.equal(chart.getSelection().candle.high, 1e6);
  chart.selectDate(calendar(397)); assert.equal(chart.getSelection().candle, null);
  assert.doesNotMatch(svg.innerHTML, /NaN|Infinity|1000000000000000/);
});

test('completed weekly candles cover only their actual dates while later close-only observations remain visible', () => {
  const { svg } = fixture(390, 300);
  const data = { originDate: date(7), symbol: 'ETHUSD', candleSource: 'Archive & Exchange', frequency: 'weekly',
    observedRows: Array.from({ length: 14 }, (_, index) => row(index + 1)),
    observedCandles: [
      { date: date(7), startDate: date(1), endDate: date(7), open: 100, high: 120, low: 90, close: 107 },
      { date: date(14), startDate: date(8), endDate: date(14), open: 108, high: 1e12, low: 105, close: 114 },
    ], frame: { cursorDate: date(10), forecast: [], inputVisible: true, forecastVisible: true } };
  const chart = draw(svg, data, { start: date(1), end: date(14) });
  assert.equal(svg.dataset.observedCandleCount, '1'); assert.equal(svg.dataset.observedLineCount, '3');
  assert.match(svg.innerHTML, /Archive &amp; Exchange ETHUSD/);
  assert.match(svg.innerHTML, /2024-01-01–2024-01-07 UTC/);
  const path = svg.innerHTML.match(/class="observed-close-line" d="([^"]*)"/)?.[1];
  assert.equal((path.match(/M/g) ?? []).length, 1); assert.equal((path.match(/L/g) ?? []).length, 2);
  assert.ok(path.startsWith(`M${chart.x(date(8)).toFixed(2)},${chart.axis.y(108).toFixed(2)}`));
  assert.ok(chart.axis.max < 150);
  chart.selectDate(date(10)); assert.equal(chart.getSelection().actual, 110); assert.equal(chart.getSelection().candle, null);
  chart.selectDate(date(14)); assert.equal(chart.getSelection().actual, null); assert.equal(chart.getSelection().candle, null);
});
