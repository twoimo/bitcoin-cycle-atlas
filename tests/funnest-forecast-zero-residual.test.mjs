import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { mountObservedPriceChart } from '../dist/funnest-observed-price-adapter.js';

const BAND = 'rgba(199,155,75,.13)', LINE = '#d8b56d';
const ZERO_PRICE_TITLE = '2023-10-06 · 선택한 조건의 보통주 잔여가치가 0입니다. 양수 가격으로 대체하지 않습니다.';
const ZERO_BOUND_TITLE = '2023-10-06 · 하단 조건의 보통주 잔여가치가 0입니다. 양수 가격으로 대체하지 않습니다.';
const LOG_GAP_TITLE = '양수와 0 사이의 구간은 로그축에서 보간하지 않습니다. 해당 가격선 또는 가정 범위를 생략합니다. 선형축에서 확인해 주세요.';
const LOG_GAP_LINES = ['0 경계 구간 · 로그 연결 생략', '선형축에서 확인해 주세요.'];
const day = Date.parse('2023-10-01T00:00:00Z') / 1000;
const candles = [0, 1, 2].map(index => ({ time: day + index * 86400, date: new Date((day + index * 86400) * 1000).toISOString(), open: 100, high: 110, low: 95, close: 105, volume: 10 }));
// MSTR hold-to-maturity stress: the selected price and the lower condition reach 0 when residual value is absorbed.
const zeroPricePath = [
  { date: '2023-10-04', price: 80, low: 80, high: 120, valuationState: 'active' },
  { date: '2023-10-05', price: 70, low: 70, high: 130, valuationState: 'active' },
  { date: '2023-10-06', price: 0, low: 0, high: 140, valuationState: 'absorbed' },
  { date: '2023-10-07', price: 0, low: 0, high: 150, valuationState: 'absorbed' },
];
// MSTR base: the selected price stays positive while the lower condition is 0.
const zeroBoundPath = [
  { date: '2023-10-04', price: 90, low: 80, high: 120, valuationState: 'active' },
  { date: '2023-10-05', price: 95, low: 70, high: 130, valuationState: 'active' },
  { date: '2023-10-06', price: 100, low: 0, high: 140, valuationState: 'active' },
  { date: '2023-10-07', price: 105, low: 0, high: 150, valuationState: 'active' },
];
const positivePath = [
  { date: '2023-10-04', price: 106, low: 98, high: 112, baselinePrice: 104 },
  { date: '2023-10-05', price: 109, low: 97, high: 118, baselinePrice: 106 },
  { date: '2023-10-06', price: 104, low: 92, high: 121, baselinePrice: 107 },
];

function paintForecast({ scale, path, milestones = [], invertScale = false }) {
  const { document, window } = parseHTML('<html><body><div id="plot"></div></body></html>');
  window.devicePixelRatio = 1;
  const globalKeys = ['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const originals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document);
  const fills = [], strokes = [], arcs = [], texts = [];
  const setBounds = element => {
    element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 420, width: 640, height: 420 });
    for (const [key, value] of [['clientWidth', 640], ['clientHeight', 420], ['offsetWidth', 640], ['offsetHeight', 420]]) Object.defineProperty(element, key, { configurable: true, value });
  };
  const context = canvas => {
    let points = [];
    const target = {
      canvas, fillStyle: '', strokeStyle: '', font: '12px sans-serif',
      beginPath() { points = []; }, moveTo(x, y) { points.push({ x, y }); }, lineTo(x, y) { points.push({ x, y }); },
      arc(x, y, r) { arcs.push({ x, y, r }); },
      fill() { fills.push({ color: String(this.fillStyle), points: points.map(point => ({ ...point })) }); },
      stroke() { strokes.push({ color: String(this.strokeStyle), points: points.map(point => ({ ...point })) }); },
      fillText(text, x, y) { texts.push({ text: String(text), x, y }); },
      measureText: value => ({ width: String(value).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
      createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }),
    };
    return new Proxy(target, { get(object, key) { return key in object ? object[key] : () => {}; }, set(object, key, value) { object[key] = value; return true; } });
  };
  document.createElement = (name, ...args) => {
    const element = originalCreate(name, ...args); setBounds(element);
    if (name === 'canvas') { const ctx = context(element); element.getContext = () => ctx; }
    return element;
  };
  let frame = 0, mounted = null, coords = null;
  const ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const getComputedStyle = () => ({ getPropertyValue: () => '' });
  Object.assign(window, { ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++frame, cancelAnimationFrame() {} });
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver, ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++frame, cancelAnimationFrame() {} });
  try {
    const plot = document.getElementById('plot'); setBounds(plot);
    mounted = mountObservedPriceChart(plot, { series: { candles }, symbol: 'MSTR', currency: 'USD', scale, invertScale, range: { start: day - 86400, end: day + 8 * 86400 }, onViewport() {}, onError() {} });
    mounted.chart.addOverlay({ layer: 'above', render(rc) { coords = rc.coords; } });
    mounted.setAtlasOverlays({ forecast: { path, milestones }, events: [], showEvents: false });
    mounted.chart.render();
    for (const list of [fills, strokes, arcs, texts]) list.length = 0;
    mounted.chart.render();
    assert.ok(coords, 'the pinned Funnest runtime passed its PaneCoords to the overlays');
    const x = date => coords.timeToX(Date.parse(`${date}T00:00:00Z`)), y = price => coords.priceToY(price);
    const segment = (from, to) => ({ from: { x: x(from[0]), y: y(from[1]) }, to: { x: x(to[0]), y: y(to[1]) } });
    return {
      coords, x, y, segment, receipt: mounted.inspectAtlasOverlayRender(), texts: texts.map(item => item.text), textAt: text => texts.find(item => item.text === text),
      band: fills.filter(item => item.color === BAND).map(item => item.points),
      line: strokes.filter(item => item.color === LINE && item.points.length === 2).map(({ points: [from, to] }) => ({ from, to })),
      arcs,
    };
  } finally {
    mounted?.destroy();
    document.createElement = originalCreate;
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
}

const inPane = (paint, point) => point.x >= 0 && point.x <= paint.coords.plotWidth && point.y >= 0 && point.y <= paint.coords.height;
const notice = (paint, kind) => paint.receipt.forecastNotices?.find(item => item.kind === kind) ?? null;

test('linear axis paints a zero residual path and band down to 0 and names the zero date', () => {
  const paint = paintForecast({ scale: 'normal', path: zeroPricePath, milestones: [{ id: 'absorbed', date: '2023-10-07', title: 'absorbed', turnType: 'low' }] });
  const zeroY = paint.y(0);
  assert.ok(zeroY >= 0 && zeroY <= paint.coords.height, `price 0 lies inside the linear price pane (y=${zeroY}, height=${paint.coords.height})`);
  assert.deepEqual(paint.line, [
    paint.segment(['2023-10-04', 80], ['2023-10-05', 70]),
    paint.segment(['2023-10-05', 70], ['2023-10-06', 0]),
    paint.segment(['2023-10-06', 0], ['2023-10-07', 0]),
  ], 'the painted forecast line keeps every row and reaches 0 instead of ending at the last positive price');
  assert.equal(paint.receipt.forecastSegments.count, 3);
  assert.equal(paint.band.length, 1, 'one band polygon covers all four rows on a linear axis');
  assert.deepEqual(paint.band[0], [
    ...[['2023-10-04', 120], ['2023-10-05', 130], ['2023-10-06', 140], ['2023-10-07', 150]],
    ...[['2023-10-07', 0], ['2023-10-06', 0], ['2023-10-05', 70], ['2023-10-04', 80]],
  ].map(([date, price]) => ({ x: paint.x(date), y: paint.y(price) })), 'the lower band edge runs along 0 for the absorbed rows');
  assert.ok(paint.arcs.some(arc => arc.r === 4 && arc.x === paint.x('2023-10-07') && arc.y === zeroY), 'the milestone on a zero row is drawn at price 0');
  const zero = notice(paint, 'equity-zero-residual');
  assert.equal(zero?.title, ZERO_PRICE_TITLE);
  assert.deepEqual(zero.lines.map(item => item.text), ['가정 가격 0 · 잔여가치 소진']);
  const painted = paint.textAt('가정 가격 0 · 잔여가치 소진');
  assert.ok(painted && inPane(paint, painted), 'the zero notice is painted inside the price pane');
  assert.equal(notice(paint, 'equity-log-gap'), null);
  assert.equal(paint.texts.some(text => LOG_GAP_LINES.includes(text)), false, 'a linear axis needs no log-gap notice');
});

test('log axis breaks the line at 0, cuts the band at the axis bottom, and shows the log-gap notice', () => {
  const paint = paintForecast({ scale: 'log', path: zeroPricePath, milestones: [{ id: 'absorbed', date: '2023-10-07', title: 'absorbed', turnType: 'low' }] });
  const bottom = paint.coords.height;
  assert.deepEqual(paint.line, [paint.segment(['2023-10-04', 80], ['2023-10-05', 70])], 'only the positive rows are joined; no line is interpolated toward 0');
  assert.equal(paint.receipt.forecastSegments.count, 1);
  assert.deepEqual(paint.band, [
    [['2023-10-04', 120], ['2023-10-05', 130], ['2023-10-05', 70], ['2023-10-04', 80]].map(([date, price]) => ({ x: paint.x(date), y: paint.y(price) })),
    [{ x: paint.x('2023-10-06'), y: paint.y(140) }, { x: paint.x('2023-10-07'), y: paint.y(150) }, { x: paint.x('2023-10-07'), y: bottom }, { x: paint.x('2023-10-06'), y: bottom }],
  ], 'the band stops where the lower condition moves to 0 and the zero run is cut at the axis bottom');
  for (const point of [...paint.line.flatMap(item => [item.from, item.to]), ...paint.band.flat()]) assert.ok(inPane(paint, point), `painted forecast point stays inside the pane: ${JSON.stringify(point)}`);
  const marker = paint.arcs.find(arc => arc.r === 4 && arc.x === paint.x('2023-10-07'));
  assert.ok(marker && marker.y > bottom - 40 && marker.y < bottom, 'the milestone on a zero row stays visible at the bottom of the log axis');
  const zero = notice(paint, 'equity-zero-residual');
  assert.equal(zero?.title, ZERO_PRICE_TITLE);
  assert.deepEqual(zero.lines.map(item => item.text), ['가정 가격 0 · 잔여가치 소진 · 로그축 외']);
  const gap = notice(paint, 'equity-log-gap');
  assert.equal(gap?.title, LOG_GAP_TITLE);
  assert.deepEqual(gap.lines.map(item => item.text), LOG_GAP_LINES);
  for (const text of ['가정 가격 0 · 잔여가치 소진 · 로그축 외', ...LOG_GAP_LINES]) assert.ok(paint.textAt(text) && inPane(paint, paint.textAt(text)), `painted notice inside the pane: ${text}`);
});

test('an inverted log axis cuts the zero band run at the low-price edge, which is the top', () => {
  const paint = paintForecast({ scale: 'log', path: zeroPricePath, invertScale: true });
  assert.ok(paint.y(150) > paint.y(70), 'the inverted axis puts higher prices lower on screen');
  assert.deepEqual(paint.band.at(-1), [{ x: paint.x('2023-10-06'), y: paint.y(140) }, { x: paint.x('2023-10-07'), y: paint.y(150) }, { x: paint.x('2023-10-07'), y: 0 }, { x: paint.x('2023-10-06'), y: 0 }]);
});

test('a zero lower bound keeps the selected line whole and names the lower condition on both axes', () => {
  const linear = paintForecast({ scale: 'normal', path: zeroBoundPath });
  assert.equal(linear.line.length, 3);
  assert.deepEqual(linear.band, [[
    ...[['2023-10-04', 120], ['2023-10-05', 130], ['2023-10-06', 140], ['2023-10-07', 150]],
    ...[['2023-10-07', 0], ['2023-10-06', 0], ['2023-10-05', 70], ['2023-10-04', 80]],
  ].map(([date, price]) => ({ x: linear.x(date), y: linear.y(price) }))]);
  assert.ok(linear.y(0) >= 0 && linear.y(0) <= linear.coords.height, 'the zero lower bound is inside the linear pane');
  assert.equal(notice(linear, 'equity-zero-residual')?.title, ZERO_BOUND_TITLE);
  assert.ok(linear.textAt('범위 하한 0 · 잔여가치 소진'));
  assert.equal(notice(linear, 'equity-log-gap'), null);

  const log = paintForecast({ scale: 'log', path: zeroBoundPath });
  assert.deepEqual(log.line, [
    log.segment(['2023-10-04', 90], ['2023-10-05', 95]),
    log.segment(['2023-10-05', 95], ['2023-10-06', 100]),
    log.segment(['2023-10-06', 100], ['2023-10-07', 105]),
  ], 'a positive selected price stays continuous on a log axis');
  assert.deepEqual(log.band, [
    [['2023-10-04', 120], ['2023-10-05', 130], ['2023-10-05', 70], ['2023-10-04', 80]].map(([date, price]) => ({ x: log.x(date), y: log.y(price) })),
    [{ x: log.x('2023-10-06'), y: log.y(140) }, { x: log.x('2023-10-07'), y: log.y(150) }, { x: log.x('2023-10-07'), y: log.coords.height }, { x: log.x('2023-10-06'), y: log.coords.height }],
  ]);
  assert.equal(notice(log, 'equity-zero-residual')?.title, ZERO_BOUND_TITLE);
  assert.ok(log.textAt('범위 하한 0 · 잔여가치 소진 · 로그축 외'));
  assert.equal(notice(log, 'equity-log-gap')?.title, LOG_GAP_TITLE);
});

test('a positive ETH-style forecast paints the same line, baseline, and single band on both axes with no zero notices', () => {
  for (const scale of ['normal', 'log']) {
    const paint = paintForecast({ scale, path: positivePath });
    assert.deepEqual(paint.line, [
      paint.segment(['2023-10-04', 106], ['2023-10-05', 109]),
      paint.segment(['2023-10-05', 109], ['2023-10-06', 104]),
    ], `${scale}: forecast line joins every positive row`);
    assert.equal(paint.receipt.baselineSegments.count, 2, `${scale}: baseline joins every positive row`);
    assert.deepEqual(paint.band, [[
      ...[['2023-10-04', 112], ['2023-10-05', 118], ['2023-10-06', 121]],
      ...[['2023-10-06', 92], ['2023-10-05', 97], ['2023-10-04', 98]],
    ].map(([date, price]) => ({ x: paint.x(date), y: paint.y(price) }))], `${scale}: one band polygon`);
    assert.deepEqual(paint.receipt.forecastNotices ?? [], [], `${scale}: no zero or log-gap notice`);
    assert.equal(paint.texts.some(text => /잔여가치|로그 연결/.test(text)), false);
  }
});
