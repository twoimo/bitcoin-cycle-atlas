import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createChart } from '@funnest/charts';
import { atlasBtcCandles, atlasBtcClosePoints, mapAtlasReplayBoundaries, mapAtlasReplayTimingRows, mountAtlasBtcFunnestChart } from '../dist/btc-funnest-chart.js';

const date = value => Date.parse(`${value}T00:00:00Z`);

test('BTC Coin Metrics daily mapper keeps UTC dates and the exact close-only source shape', () => {
  const source = [
    { date: '2024-01-01', price: 42_000 },
    { date: '2024-01-03', price: 43_000 },
  ];
  assert.deepEqual(atlasBtcClosePoints(source), [
    { time: date('2024-01-01'), close: 42_000, date: '2024-01-01' },
    { time: date('2024-01-03'), close: 43_000, date: '2024-01-03' },
  ]);
  assert.equal('open' in atlasBtcClosePoints(source)[0], false);
  assert.equal('volume' in atlasBtcClosePoints(source)[0], false);
});

test('BTC weekly close mapper selects the last real Coin Metrics observation in each UTC week without filling gaps', () => {
  const points = atlasBtcClosePoints([
    { date: '2024-01-01', price: 40 },
    { date: '2024-01-05', price: 45 },
    { date: '2024-01-09', price: 49 },
  ], 'weekly');
  assert.deepEqual(points.map(row => [row.date, row.close]), [['2024-01-05', 45], ['2024-01-09', 49]]);
  assert.equal(points[1].time - points[0].time, 4 * 86_400_000);
  assert.throws(() => atlasBtcClosePoints([{ date: '2024-01-01', price: 40 }, { date: '2024-01-01', price: 41 }]), /strictly increasing/);
  assert.throws(() => atlasBtcClosePoints([{ date: '2024-01-01', price: 0 }]), /Invalid Coin Metrics close/);
  assert.throws(() => atlasBtcClosePoints([], '4h'), /Unsupported close frequency/);
});

test('replay boundaries map their exact dates through Funnest PaneCoords and retain labels/source keys', () => {
  const from = date('2024-01-01'), coords = { plotWidth: 400, timeToX: time => (time - from) / 86_400_000 * 40 };
  const mapped = mapAtlasReplayBoundaries([
    { date: '2024-01-02', name: 'data-replay-origin-boundary', label: '봉 리플레이 시작 기준일', color: 'var(--muted)' },
    { date: '2024-01-04', name: 'data-replay-forecast-origin', label: '현재 고정 가정의 입력 기준일', color: 'var(--data-gold)' },
    { date: '2024-01-06', name: 'data-replay-cursor-line', label: '실제 가격 공개일', color: 'var(--text)' },
    { date: '2024-01-11', name: 'outside', label: 'outside' },
  ], coords, { start: '2024-01-02', end: '2024-01-10' });
  assert.deepEqual(mapped.map(({ date: day, x, name, label }) => [day, x, name, label]), [
    ['2024-01-02', 40, 'data-replay-origin-boundary', '봉 리플레이 시작 기준일'],
    ['2024-01-04', 120, 'data-replay-forecast-origin', '현재 고정 가정의 입력 기준일'],
    ['2024-01-06', 200, 'data-replay-cursor-line', '실제 가격 공개일'],
  ]);
  assert.throws(() => mapAtlasReplayBoundaries([], {}, {}), /Funnest pane coordinates/);
});

test('cycle timing rows preserve causal values and labels, split gaps/states, and stop at the replay cursor', () => {
  const from = date('2024-01-01'), coords = { plotWidth: 400, timeToX: time => (time - from) / 86_400_000 * 40 };
  const point = (day, state, shiftDays, causal = true) => ({ date: `2024-01-${String(day).padStart(2, '0')}`, epochDay: Math.floor(date(`2024-01-${String(day).padStart(2, '0')}`) / 86_400_000), state, shiftDays, causal });
  const series = [point(1, 'insufficient', 0), point(2, 'insufficient', -3.25), point(3, 'insufficient', 8, false),
    point(4, 'aligned', 20.5), point(5, 'aligned', 21.25), point(7, 'aligned', 22), point(8, 'lengthened', 26), point(9, 'shortened', -24)];
  const rows = mapAtlasReplayTimingRows({ series }, coords, { cursorDate: '2024-01-08', start: '2024-01-01', end: '2024-01-10' });
  assert.deepEqual(rows.map(row => ({ start: row.start.date, end: row.end.date, state: row.state, label: row.label, low: row.shiftLow, high: row.shiftHigh, x: row.x, width: row.width, count: row.rows.length })), [
    { start: '2024-01-01', end: '2024-01-02', state: 'insufficient', label: '근거 부족', low: -3.25, high: 0, x: 0, width: 80, count: 2 },
    { start: '2024-01-04', end: '2024-01-05', state: 'aligned', label: '기준 범위', low: 20.5, high: 21.25, x: 120, width: 80, count: 2 },
    { start: '2024-01-07', end: '2024-01-07', state: 'aligned', label: '기준 범위', low: 22, high: 22, x: 240, width: 40, count: 1 },
    { start: '2024-01-08', end: '2024-01-08', state: 'lengthened', label: '연장 가정', low: 26, high: 26, x: 280, width: 0, count: 1 },
  ]);
  assert.equal(rows.some(row => row.end.date > '2024-01-08'), false, 'cursor is an information-time bound, not just a view hint');
  assert.deepEqual(mapAtlasReplayTimingRows({ series }, coords, { cursorDate: '2023-12-31' }), []);
});

test('replay mapping consumes coordinates from the actual Funnest chart overlay callback', async () => {
  const { document, window } = parseHTML('<html><body><div id="chart"></div></body></html>');
  window.devicePixelRatio = 1;
  const root = document.getElementById('chart');
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 520 });
  const originals = new Map(['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document);
  const context = new Proxy({ canvas: null, measureText: value => ({ width: String(value).length * 6 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }) }, {
    get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true),
  });
  document.createElement = (name, ...args) => {
    const node = originalCreate(name, ...args);
    if (name === 'div') node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 520 });
    if (name === 'canvas') node.getContext = () => { context.canvas = node; return context; };
    return node;
  };
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }), requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout });
  let chart, mapped = null;
  try {
    chart = createChart(root, { volume: false, displayTimezone: 'UTC' });
    const first = date('2024-01-01'), second = date('2024-01-03');
    chart.setData([{ time: first, close: 100 }, { time: second, close: 120 }]);
    chart.addOverlay({ render({ coords }) {
      const boundaries = mapAtlasReplayBoundaries([{ date: '2024-01-02', name: 'data-replay-cursor-line', label: '실제 가격 공개일' }], coords, { start: '2024-01-01', end: '2024-01-03' });
      const timing = mapAtlasReplayTimingRows({ series: [
        { date: '2024-01-01', epochDay: first / 86_400_000, causal: true, state: 'aligned', shiftDays: 12.5 },
        { date: '2024-01-02', epochDay: first / 86_400_000 + 1, causal: true, state: 'aligned', shiftDays: 13.25 },
        { date: '2024-01-03', epochDay: first / 86_400_000 + 2, causal: true, state: 'lengthened', shiftDays: 30 },
      ] }, coords, { cursorDate: '2024-01-02', start: '2024-01-01', end: '2024-01-03' });
      if (boundaries.length && timing.length) mapped = { boundaries, timing, plotWidth: coords.plotWidth, x: coords.timeToX(date('2024-01-02')) };
    } });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(mapped, 'the mounted Funnest chart must invoke its real PaneCoords overlay API');
    assert.equal(mapped.boundaries[0].x, mapped.x);
    assert.equal(mapped.boundaries[0].date, '2024-01-02');
    assert.equal(mapped.timing.length, 1, 'the cursor excludes later calibration rows');
    assert.equal(mapped.timing[0].start.date, '2024-01-01'); assert.equal(mapped.timing[0].end.date, '2024-01-02');
    assert.deepEqual(mapped.timing[0].rows.map(row => row.shiftDays), [12.5, 13.25]);
    assert.ok(mapped.timing[0].x >= 0 && mapped.timing[0].x < mapped.plotWidth);
  } finally {
    chart?.destroy();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('Funnest BTC adapter paints replay boundaries and the causal timing pane from the live chart coordinates', async () => {
  const { document, window } = parseHTML('<html><body><div id="stage"></div></body></html>');
  window.devicePixelRatio = 1;
  const stage = document.getElementById('stage'); stage.style.position = 'relative';
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 520 });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); stage.append(svg);
  const originals = new Map(['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document);
  const context = new Proxy({ canvas: null, measureText: value => ({ width: String(value).length * 6 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }) }, {
    get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true),
  });
  document.createElement = (name, ...args) => {
    const node = originalCreate(name, ...args);
    if (name === 'div') node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 520 });
    if (name === 'canvas') node.getContext = () => { context.canvas = node; return context; };
    return node;
  };
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ color: '', getPropertyValue: () => '' }), requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout });
  let mounted;
  try {
    mounted = mountAtlasBtcFunnestChart({ container: stage, svg, sourceMode: 'close-only', frequency: 'daily', chartType: 'line',
      observedRows: [1, 2, 3, 4, 5].map(day => ({ date: `2024-01-0${day}`, price: 100 + day })), start: '2024-01-01', end: '2024-01-05',
      replayCursorDate: '2024-01-04', replayBoundaries: [
        { date: '2024-01-01', name: 'data-replay-origin-boundary', label: '봉 리플레이 시작 기준일', color: 'var(--muted)' },
        { date: '2024-01-03', name: 'data-replay-forecast-origin', label: '현재 고정 가정의 입력 기준일', color: 'var(--data-gold)' },
        { date: '2024-01-04', name: 'data-replay-cursor-line', label: '실제 가격 공개일', color: 'var(--text)' },
      ], showCycleTiming: true, cycleCalibration: { series: [
        { date: '2024-01-01', causal: true, state: 'insufficient', shiftDays: 0 },
        { date: '2024-01-02', causal: true, state: 'insufficient', shiftDays: -2.5 },
        { date: '2024-01-03', causal: true, state: 'aligned', shiftDays: 20 },
        { date: '2024-01-04', causal: true, state: 'aligned', shiftDays: 21.5 },
        { date: '2024-01-05', causal: true, state: 'lengthened', shiftDays: 30 },
      ] } });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(svg.dataset.chartEngine, 'funnest');
    assert.equal(svg.dataset.replayBoundaryCount, '3');
    assert.deepEqual([...svg.querySelectorAll('[data-replay-boundary]')].map(node => [node.dataset.date, node.getAttribute('aria-label'), Number(node.dataset.x)]), [
      ['2024-01-01', '봉 리플레이 시작 기준일 2024-01-01', Number(svg.querySelector('[data-replay-boundary="data-replay-origin-boundary"]').dataset.x)],
      ['2024-01-03', '현재 고정 가정의 입력 기준일 2024-01-03', Number(svg.querySelector('[data-replay-boundary="data-replay-forecast-origin"]').dataset.x)],
      ['2024-01-04', '실제 가격 공개일 2024-01-04', Number(svg.querySelector('[data-replay-boundary="data-replay-cursor-line"]').dataset.x)],
    ]);
    assert.equal(svg.dataset.replayCycleTimingCount, '4', 'future calibration date is excluded at the cursor');
    assert.equal(svg.getAttribute('viewBox').split(/\s+/)[3], String(mounted.chart.layout.height + 42), 'the timing subplot reserves its own bottom pane');
    const timingTitle = svg.querySelector('[data-cycle-timing-title="true"]');
    assert.ok(timingTitle.textContent.startsWith('사이클 시계 · 관측 보정'));
    assert.equal(svg.querySelector('[data-replay-cycle-timing="true"]').getAttribute('aria-label'), '사이클 시계 · 관측 기반 보정 · 매매 신호 아님');
    const blocks = [...svg.querySelectorAll('[data-cycle-state]')];
    assert.deepEqual(blocks.map(node => [node.dataset.cycleState, node.dataset.cycleStart, node.dataset.cycleEnd, Number(node.dataset.cycleRowCount)]), [
      ['insufficient', '2024-01-01', '2024-01-02', 2], ['aligned', '2024-01-03', '2024-01-04', 2],
    ]);
    assert.match(blocks[0].querySelector('title').textContent, /각 날짜까지 확인된 자료로 계산한 보정이며 매매 신호·확률구간이 아닙니다/);
    assert.equal(Number(blocks[1].dataset.cycleShiftHigh), 21.5);
  } finally {
    mounted?.destroy();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('BTC OHLC mapper preserves source OHLCV, missing intervals and source-row identity in UTC milliseconds', () => {
  const first = { time: Math.floor(date('2024-01-01') / 1000), date: '2024-01-07', startDate: '2024-01-01', endDate: '2024-01-07', open: 100, high: 120, low: 90, close: 110, volume: 5 };
  const second = { time: Math.floor(date('2024-01-15') / 1000), date: '2024-01-21', startDate: '2024-01-15', endDate: '2024-01-21', open: 110, high: 125, low: 105, close: 115, volume: 0 };
  const bars = atlasBtcCandles([first, second]);
  assert.equal(bars[0].time, date('2024-01-01'));
  assert.equal(bars[0].open, 100); assert.equal(bars[0].high, 120); assert.equal(bars[0].low, 90); assert.equal(bars[0].close, 110); assert.equal(bars[0].volume, 5);
  assert.equal(bars[0].sourceRow, first);
  assert.equal(bars[1].time - bars[0].time, 14 * 86_400_000, 'missing weekly periods are not synthesized');
  assert.equal(bars[1].volume, 0, 'a reported zero volume remains zero');
  assert.throws(() => atlasBtcCandles([{ ...first, high: 99 }]), /Invalid observed BTC OHLCV/);
  assert.throws(() => atlasBtcCandles([{ ...first, volume: -1 }]), /Invalid observed BTC OHLCV/);
});

test('BTC Funnest first paint uses only visible observed/forecast extrema and preserves exact manual domain', async () => {
  const { document, window } = parseHTML('<html><body><div id="stage"></div></body></html>');
  window.devicePixelRatio = 1;
  const stage=document.getElementById('stage');stage.style.position='relative';stage.getBoundingClientRect=()=>({left:0,top:0,width:900,height:520});
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');stage.append(svg);
  const originals=new Map(['document','window','MutationObserver','ResizeObserver','matchMedia','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const originalCreate=document.createElement.bind(document);
  const context=new Proxy({canvas:null,measureText:value=>({width:String(value).length*6}),createLinearGradient:()=>({addColorStop(){}}),getImageData:()=>({data:new Uint8ClampedArray([1,2,3,255,2,3,4,255])})},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});
  document.createElement=(name,...args)=>{const node=originalCreate(name,...args);if(name==='div')node.getBoundingClientRect=()=>({left:0,top:0,width:900,height:520});if(name==='canvas')node.getContext=()=>{context.canvas=node;return context;};return node;};
  const ResizeObserver=class{observe(){}disconnect(){}};
  Object.assign(window,{ResizeObserver,matchMedia:()=>({addEventListener(){},removeEventListener(){}}),getComputedStyle:()=>({color:'',getPropertyValue:()=>''}),requestAnimationFrame:callback=>setTimeout(callback,0),cancelAnimationFrame:clearTimeout});
  Object.assign(globalThis,{document,window,MutationObserver:window.MutationObserver,ResizeObserver,matchMedia:window.matchMedia,getComputedStyle:window.getComputedStyle,requestAnimationFrame:window.requestAnimationFrame,cancelAnimationFrame:clearTimeout});
  const observedRows=[{date:'2010-01-01',price:.08584},{date:'2024-11-12',price:70_000},{date:'2025-11-12',price:74_000}];
  const forecast=[{date:'2026-11-12',price:100_000,lower:90_000,upper:110_000},{date:'2027-11-12',price:140_000,lower:130_000,upper:150_000},{date:'2035-11-12',price:9_000_000,lower:8_000_000,upper:10_000_000}];
  let mounted;
  try{
    const args={container:stage,svg,observedRows,forecast,frequency:'daily',chartType:'line',start:'2024-11-12',end:'2028-11-12',selectedDate:'2025-11-12'};
    mounted=mountAtlasBtcFunnestChart(args);await new Promise(resolve=>setTimeout(resolve,60));
    assert.equal(mounted.chart.mainScale.mode,'log');assert.equal(mounted.chart.mainScale.autoScale,false,'manual forecast-aware range is installed before first native paint');
    assert.equal(mounted.chart.mainScale.min,70_000,'offscreen 2010 low is excluded from the automatic visible domain');
    assert.equal(mounted.chart.mainScale.max,150_000,'visible forecast bounds are included but the offscreen 2035 outlier is excluded');
    mounted.destroy();mounted=null;
    const manualStage=document.createElement('div');manualStage.style.position='relative';document.body.append(manualStage);
    const manualSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');manualStage.append(manualSvg);
    mounted=mountAtlasBtcFunnestChart({...args,container:manualStage,svg:manualSvg,priceDomain:{min:60_000,max:80_000}});await new Promise(resolve=>setTimeout(resolve,60));
    assert.equal(mounted.chart.mainScale.autoScale,false);assert.equal(mounted.chart.mainScale.min,60_000,'manual lower bound is exact');assert.equal(mounted.chart.mainScale.max,80_000,'manual upper bound is exact');
  }finally{mounted?.destroy();document.createElement=originalCreate;for(const[key,descriptor]of originals)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}
});
