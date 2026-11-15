import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { atlasCandlesToFunnestBars, mountObservedPriceChart } from '../dist/funnest-observed-price-adapter.js';
import { ethPayload, ethViewFixture } from './helpers/eth-view-fixture.mjs';
import { equityPayload, equityViewFixture } from './helpers/equity-view-fixture.mjs';

const candles = [
  { time: 1_700_000_000, open: 100, high: 110, low: 95, close: 105, volume: 12 },
  { time: 1_700_086_400, open: 105, high: 120, low: 101, close: 118, volume: 0 },
];

test('Atlas candles map to UTC-millisecond Funnest bars without filling gaps or changing values', () => {
  const before = structuredClone(candles);
  const bars = atlasCandlesToFunnestBars({ candles });
  assert.deepEqual(bars, candles.map(row => ({ ...row, time: row.time * 1000 })));
  assert.equal(bars[1].time - bars[0].time, 86_400_000);
  assert.equal(bars[1].volume, 0);
  assert.deepEqual(candles, before);
});

test('adapter rejects malformed, nonchronological, and unsafe Atlas candle inputs instead of repairing them', () => {
  assert.throws(() => atlasCandlesToFunnestBars({ candles: [] }), /observed candles/);
  assert.throws(() => atlasCandlesToFunnestBars({ candles: [candles[0], { ...candles[1], time: candles[0].time }] }), /chronological/);
  assert.throws(() => atlasCandlesToFunnestBars({ candles: [{ ...candles[0], high: 90 }] }), /Invalid observed OHLCV/);
  assert.throws(() => atlasCandlesToFunnestBars({ candles: [{ ...candles[0], volume: -1 }] }), /Invalid observed OHLCV/);
  assert.throws(() => atlasCandlesToFunnestBars({ candles: [{ ...candles[0], time: Number.MAX_SAFE_INTEGER }] }), /Invalid observed OHLCV/);
});

test('adapter exposes copied Funnest overlay coordinates, uses shared canvas paint tokens, and copies selections with real newlines', async () => {
  const adapter = await readFile(new URL('../dist/funnest-observed-price-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /coordinatesSource: 'painter\.line arguments'/);
  assert.match(adapter, /forecastInputGate: lines \? lines\.forecastInputPresent \? 'present' : 'absent' : 'not-rendered'/);
  assert.match(adapter, /mounted\.inspectAtlasOverlayRender\s*=\s*readOverlayRender/);
  assert.match(adapter, /plot\.inspectAtlasOverlayRender\s*=\s*readOverlayRender/);
  assert.match(adapter, /diagnostics\.push\(\{ from: \{ x: previous\.x, y: previous\.y \}, to: \{ x, y \}, color, width, dash: Array\.isArray\(dash\) \? \[\.\.\.dash\] : dash \}\)/);
  assert.match(adapter, /forecast: paintToken\('--data-gold'/);
  assert.match(adapter, /baseline: paintToken\('--accent'/);
  assert.match(adapter, /layer: 'below'/);
  assert.match(adapter, /layer: 'above'/);
  assert.match(adapter, /const bandHandle = mounted\.addOverlay\(bandOverlay\)/);
  assert.match(adapter, /const lineHandle = mounted\.addOverlay\(lineOverlay\)/);
  assert.match(adapter, /bandHandle\?\.remove\?\.\(\); lineHandle\?\.remove\?\.\(\)/);
  assert.match(adapter, /copyText:.*\.join\('\\n'\)/);
  assert.match(adapter, /const visibleRange = \(\) => mounted\?\.chart\?\.getVisibleTimeRange\?\.\(\) \?\? null/);
  assert.doesNotMatch(adapter, /mounted\?\.inspect\?\.\(\)\.range/);
  assert.match(adapter, /mounted\.setAtlasInsets =/);
  // HUD insets are reserved natively (chart.setTopInset); the host keeps the allocated plot origin.
  assert.match(adapter, /mounted\.chart\.setTopInset\(top\)/);
  assert.doesNotMatch(adapter, /mounted\.host\.style\.inset = `\$\{top\}px/);
  assert.match(adapter, /mounted\.setVolumeVisible =/);
  assert.match(adapter, /isCrosshairReady = \(\) => true/);
  assert.match(adapter, /if \(!isCrosshairReady\(\)\) return/);
  assert.match(adapter, /const selection = lastSelection \|\| \(\(\) => \{ const bar = mounted\.getBars\(\)\.at\(-1\); return bar \? \{ bar, time: bar\.time \} : null; \}\)\(\)/);
  assert.match(adapter, /mounted\.pointIsInPlot = point =>/);
  assert.match(adapter, /color: segment\.color, width: segment\.width, dash: Array\.isArray\(segment\.dash\) \? Object\.freeze\(\[\.\.\.segment\.dash\]\) : segment\.dash/);
  assert.match(adapter, /diagnostics\.push\(\{ from: \{ x: previous\.x, y: previous\.y \}, to: \{ x, y \}, color, width, dash: Array\.isArray\(dash\) \? \[\.\.\.dash\] : dash \}\)/);
});

test('the installed below-layer ChartOverlay callback fills an actual band and exposes a detached paint receipt', () => {
  const { document, window } = parseHTML('<html><body><div id="plot"></div></body></html>');
  window.devicePixelRatio = 1;
  const globalKeys = ['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const originals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document);
  let nextFrame = 0, mounted;
  const setBounds = element => {
    element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 420, width: 640, height: 420 });
    for (const [key, value] of [['clientWidth', 640], ['clientHeight', 420], ['offsetWidth', 640], ['offsetHeight', 420]]) Object.defineProperty(element, key, { configurable: true, value });
  };
  document.createElement = (name, ...args) => {
    const element = originalCreate(name, ...args); setBounds(element);
    if (name === 'canvas') element.getContext = () => new Proxy({ canvas: element, measureText: value => ({ width: String(value).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }) }, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target, key, value) { target[key] = value; return true; } });
    return element;
  };
  const ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const getComputedStyle = () => ({ getPropertyValue: () => '' });
  Object.assign(window, { ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++nextFrame, cancelAnimationFrame() {} });
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver, ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++nextFrame, cancelAnimationFrame() {} });
  let plot, bandFills = [], currentPath = [], liveCoords = null, coordsCapture = null, measured = [], inspected = [];
  const ctx = {
    fillStyle: '', save() {}, restore() {}, beginPath() { currentPath = []; },
    moveTo(x, y) { currentPath.push({ x, y }); }, lineTo(x, y) { currentPath.push({ x, y }); }, closePath() {},
    fill() { bandFills.push({ color: this.fillStyle, coordinates: currentPath.map(point => ({ ...point })) }); },
  };
  const lineCalls = [];
  const painter = { ctx, line: (...args) => lineCalls.push(args), vLine() {}, circle() {}, text() {}, measure: text => String(text).length * 6 };
  try {
    plot = document.getElementById('plot'); setBounds(plot);
    const sourceCandles=candles.map(row=>({...row,date:new Date(row.time*1000).toISOString()}));
    mounted = mountObservedPriceChart(plot, { series: { candles:sourceCandles }, symbol: 'BTCUSD', currency: 'USD', magnet: 'weak', onViewport() {}, onError() {} });
    const firstDate = sourceCandles[0].date.slice(0, 10);
    const secondDate = sourceCandles[1].date.slice(0, 10);
    mounted.setAtlasOverlays({ forecast: { milestones: [], path: [
      { date: firstDate, low: 80, high: 120, price: 105, baselinePrice: 100 },
      { date: secondDate, low: 90, high: 130, price: 118, baselinePrice: 110 },
    ] } });
    const actualChart = mounted.chart, adapterOverlays = actualChart.overlays.slice(-3);
    assert.equal(actualChart.magnetEnabled, false, 'Funnest drawing-only magnet remains off; Atlas owns measurement snapping');
    assert.equal(mounted.atlasMagnet, 'weak');
    mounted.setAtlasInteraction({tool:'measure',magnet:'strong'}); assert.equal(mounted.atlasMagnet, 'strong'); assert.equal(actualChart.magnetEnabled, false);
    assert.deepEqual(adapterOverlays.map(overlay => overlay.layer), ['below', 'above', 'above'], 'the adapter owns the final forecast band, forecast/event lines, and interaction overlays after Funnest runtime overlays');
    const firstMidnight = Date.parse(`${firstDate}T00:00:00Z`), secondMidnight = Date.parse(`${secondDate}T00:00:00Z`);
    const coords = { timeToX: time => time === firstMidnight ? 20 : time === secondMidnight ? 40 : NaN, priceToY: price => 200 - price, height: 200, plotWidth: 100 };
    adapterOverlays.find(overlay => overlay.layer === 'below').render({ coords, painter });
    adapterOverlays.find(overlay => overlay.layer === 'above').render({ coords, painter });
    const receipt = mounted.inspectAtlasOverlayRender();
    assert.equal(bandFills.length, 1, 'the actual below callback invoked ctx.fill instead of only setting a diagnostic flag');
    assert.equal(bandFills[0].color, 'rgba(199,155,75,.13)');
    assert.deepEqual(bandFills[0].coordinates, [{ x: 20, y: 80 }, { x: 40, y: 70 }, { x: 40, y: 110 }, { x: 20, y: 120 }]);
    assert.equal(receipt.bandRender.layer, 'below'); assert.equal(receipt.bandRender.painted, true); assert.equal(receipt.bandRender.fillCalls, 1);
    assert.deepEqual(receipt.bandRender.coordinates, bandFills[0].coordinates);
    assert.equal(Object.isFrozen(receipt.bandRender), true); assert.equal(Object.isFrozen(receipt.bandRender.coordinates[0]), true);
    assert.equal(receipt.lineRender.layer, 'above'); assert.equal(receipt.lineRender.forecastSegments.count, 1); assert.equal(receipt.lineRender.baselineSegments.count, 1);
    assert.equal(lineCalls.length, 2, 'forecast and baseline lines still paint from the above overlay');

    // Capture the real PaneCoords object passed by the installed Funnest
    // ChartOverlay, then exercise the host's pointer listener against its
    // timeToX/priceToY/pointAt values, never guessed SVG or test geometry.
    coordsCapture=actualChart.addOverlay({layer:'above',render({coords}){liveCoords=coords;}});
    actualChart.render();
    assert.ok(actualChart.layout.plotWidth>0);
    for(const key of ['timeToX','timeToIndex','pointAt','priceToY','yToPrice'])assert.equal(typeof liveCoords[key],'function');
    const dispatchPointer=(type,x,y,modifiers={})=>{
      const rect=mounted.host.getBoundingClientRect(),layout=actualChart.layout,main=layout.panes.find(pane=>pane.kind==='main');
      const event=new window.Event(type,{bubbles:true,cancelable:true});
      Object.assign(event,{clientX:rect.left+x*rect.width/layout.width,clientY:rect.top+(y+main.top)*rect.height/layout.height,pointerId:91,pointerType:'mouse',button:0,...modifiers});
      mounted.host.dispatchEvent(event);
    };
    const observedBars=mounted.getBars(),target=observedBars.at(-1),targetX=liveCoords.timeToX(target.time),levels=[target.open,target.high,target.low,target.close].map(price=>liveCoords.priceToY(price));
    const freeY=Array.from({length:Math.floor(liveCoords.height)},(_,y)=>y).find(y=>Math.min(...levels.map(level=>Math.abs(level-y)))>12);
    assert.ok(Number.isFinite(freeY),'actual PaneCoords expose a point more than 12 screen pixels from all source OHLC levels');
    mounted.setAtlasInteraction({tool:'measure',chartType:'candles',magnet:'weak',onMeasure:value=>measured.push(value),onInspect:value=>inspected.push(value)});
    dispatchPointer('pointermove',targetX,liveCoords.priceToY(target.high)+1);actualChart.render();
    let interaction=mounted.inspectAtlasInteractionRender();
    assert.equal(interaction.coordinatesSource,'Funnest ChartOverlay PaneCoords + Painter calls');
    assert.equal(interaction.snapMarks[0]?.field,'H','weak magnet snaps when within 12 native screen pixels');
    dispatchPointer('pointermove',targetX,freeY);actualChart.render();
    assert.equal(mounted.inspectAtlasInteractionRender().snapMarks.length,0,'weak magnet remains free beyond the 12px threshold');
    mounted.setAtlasInteraction({magnet:'strong'});dispatchPointer('pointermove',targetX,freeY);actualChart.render();
    interaction=mounted.inspectAtlasInteractionRender();
    assert.equal(interaction.snapMarks[0]?.mode,'strong','strong magnet always chooses a genuine source OHLC');
    assert.ok([target.open,target.high,target.low,target.close].includes(interaction.snapMarks[0]?.price));
    mounted.setAtlasInteraction({magnet:'weak'});dispatchPointer('pointermove',targetX,freeY,{ctrlKey:true});actualChart.render();
    assert.equal(mounted.inspectAtlasInteractionRender().snapMarks.length,0,'Ctrl temporarily disables an enabled magnet');
    mounted.setAtlasInteraction({magnet:'off'});dispatchPointer('pointermove',targetX,freeY,{metaKey:true});actualChart.render();
    assert.equal(mounted.inspectAtlasInteractionRender().snapMarks[0]?.mode,'strong','Meta temporarily enables strong magnet');

    const clickAt=(x,y)=>{dispatchPointer('pointerdown',x,y);dispatchPointer('pointerup',x,y);};
    mounted.setAtlasInteraction({tool:'measure',magnet:'strong',measurement:null});
    clickAt(targetX,liveCoords.priceToY(target.close));actualChart.render();
    const first=measured.at(-1);assert.equal(first.startTime,target.time);assert.equal(first.startPrice,target.close);assert.equal(first.startKind,'observed');
    const priorBar=observedBars.at(-2),priorX=liveCoords.timeToX(priorBar.time);
    clickAt(priorX,liveCoords.priceToY(priorBar.low));actualChart.render();
    const complete=measured.at(-1);assert.equal(complete.endTime,priorBar.time);assert.equal(complete.endPrice,priorBar.low);assert.ok(inspected.length>=2);
    interaction=mounted.inspectAtlasInteractionRender();
    assert.equal(interaction.measurementSegments.length,1);
    assert.equal(interaction.measurementSegments[0].from.x,liveCoords.timeToX(target.time));
    assert.equal(interaction.measurementSegments[0].to.x,liveCoords.timeToX(priorBar.time));
    assert.equal(interaction.measurementSegments[0].kind,'observed');
    coordsCapture.remove();
    mounted.destroy(); mounted = null;
    assert.equal(actualChart.overlays.length, 0, 'destroy removes both overlay handles');
    assert.equal(plot.inspectAtlasOverlayRender, undefined);
  } finally {
    mounted?.destroy();
    document.createElement = originalCreate;
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('native Funnest future hover stays on the actual forecast row and separates manual cursor prices', () => {
  const { document, window } = parseHTML('<html><body><svg id="overlay" viewBox="0 0 640 420"></svg><div id="plot"></div></body></html>');
  window.devicePixelRatio = 1;
  const globalKeys = ['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const originals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document);
  let nextFrame = 0, mounted, liveCoords = null, inspected = [], crosshair = [], measured = [];
  const setBounds = element => { element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 420, width: 640, height: 420 }); for (const [key, value] of [['clientWidth', 640], ['clientHeight', 420], ['offsetWidth', 640], ['offsetHeight', 420]]) Object.defineProperty(element, key, { configurable: true, value }); };
  document.createElement = (name, ...args) => {
    const element = originalCreate(name, ...args); setBounds(element);
    if (name === 'canvas') element.getContext = () => new Proxy({ canvas: element, measureText: value => ({ width: String(value).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }) }, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target, key, value) { target[key] = value; return true; } });
    return element;
  };
  const ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const getComputedStyle = () => ({ getPropertyValue: () => '' });
  Object.assign(window, { ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++nextFrame, cancelAnimationFrame() {} });
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver, ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++nextFrame, cancelAnimationFrame() {} });
  const day = Math.floor(Date.parse('2023-10-01T00:00:00Z') / 1000), sourceCandles = [
    { time: day, date: '2023-10-01', open: 100, high: 110, low: 90, close: 105, volume: 12 },
    { time: day + 86400, date: '2023-10-02', open: 105, high: 125, low: 100, close: 118, volume: 0 },
  ];
  const sourceBefore = structuredClone(sourceCandles), forecastPath = [
    { date: '2023-10-03', price: 150, low: 145, high: 155, baselinePrice: 140 },
    { date: '2023-10-04', price: 160, low: 155, high: 165, baselinePrice: 150 },
  ];
  try {
    const plot = document.getElementById('plot'), overlaySvg = document.getElementById('overlay'); setBounds(plot); setBounds(overlaySvg);
    mounted = mountObservedPriceChart(plot, { series: { candles: sourceCandles }, symbol: 'ETH-USD', currency: 'USD', precision: 2, overlaySvg, onCrosshair: detail => crosshair.push(detail), onViewport() {}, onError() {} });
    const lastForecastTime = Date.parse('2023-10-04T00:00:00Z');
    mounted.setAtlasRange({ start: day - 86400, end: lastForecastTime / 1000 + 3 * 86400 });
    mounted.setAtlasOverlays({ forecast: { path: forecastPath, milestones: [] } });
    const actualChart = mounted.chart, coordsCapture = actualChart.addOverlay({ layer: 'above', render({ coords }) { liveCoords = coords; } });
    actualChart.render();
    assert.ok(liveCoords && typeof liveCoords.pointAt === 'function', 'the test uses the pinned Funnest public PaneCoords');
    const futureTime = Date.parse('2023-10-03T00:00:00Z'), futureX = liveCoords.timeToX(futureTime), modelPrice = forecastPath[0].price;
    const freeCursorPrice = 135, futureY = liveCoords.priceToY(freeCursorPrice), futurePoint = liveCoords.pointAt(futureX, futureY), actualCursorPrice = liveCoords.yToPrice(futureY);
    assert.equal(futurePoint.time, futureTime, 'UTC forecast date resolves through PaneCoords without private time geometry');
    assert.ok(futureX >= 0 && futureX < actualChart.layout.plotWidth);
    assert.ok(Math.abs(actualCursorPrice - modelPrice) > 1, 'the pointer price is deliberately different from the forecast row price');
    mounted.setAtlasInteraction({ tool: 'crosshair', magnet: 'off', onInspect: detail => inspected.push(detail) });
    const interactionCanvas = [...mounted.host.querySelectorAll('canvas')].at(-1);
    const dispatchPointer = (target, type, x, y, extras = {}) => {
      const rect = mounted.host.getBoundingClientRect(), layout = actualChart.layout, main = layout.panes.find(pane => pane.kind === 'main');
      const { allowNative = false, ...properties } = extras, event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { clientX: rect.left + x * rect.width / layout.width, clientY: rect.top + (y + main.top) * rect.height / layout.height, pointerId: 91, pointerType: 'mouse', button: 0, buttons: type === 'pointerdown' ? 1 : 0, ...properties });
      if (allowNative) Object.defineProperty(event, 'stopImmediatePropagation', { value() {}, configurable: true });
      target.dispatchEvent(event); return event;
    };
    const futureMove = dispatchPointer(interactionCanvas, 'pointermove', futureX, futureY); actualChart.render();
    assert.equal(futureMove.defaultPrevented, true, 'future hover does not pass through to Funnest native clamping at the last observed bar');
    const futureCrosshair = crosshair.at(-1), futureInspection = inspected.at(-1);
    assert.equal(futureCrosshair.kind, 'simulated'); assert.equal(futureCrosshair.time, futureTime); assert.equal(futureCrosshair.value, modelPrice);
    assert.ok(Math.abs(futureCrosshair.cursorPrice - actualCursorPrice) < 1e-6, 'free cursor price is separate from model price');
    assert.equal(futureInspection.kind, 'simulated'); assert.equal(futureInspection.time, futureTime); assert.equal(futureInspection.price, modelPrice);
    assert.equal(futureInspection.forecast.price, modelPrice); assert.ok(Math.abs(futureInspection.cursorPrice - actualCursorPrice) < 1e-6);
    assert.ok(Math.abs(futureInspection.measurementAnchor.price - actualCursorPrice) < 1e-6, 'manual measurement anchor remains the free cursor value');
    assert.equal(mounted.inspect().crosshair, null, 'the subsequent native Funnest frame has no clamped observed crosshair');
    const cursorGroup = [...overlaySvg.children].find(node => String(node.id).endsWith('-cross'));
    assert.ok(cursorGroup, 'the transient future cursor uses the existing export-strip suffix contract');
    assert.equal(cursorGroup.getAttribute('display'), 'inline');
    assert.match(cursorGroup.querySelector('text').textContent, /2023-10-03 · 전망 150\.00/);
    assert.notEqual(cursorGroup.querySelector('circle').getAttribute('cy'), String(liveCoords.priceToY(freeCursorPrice)), 'the forecast cursor uses the model point, not the free measurement price');

    dispatchPointer(interactionCanvas, 'pointermove', futureX, futureY, { allowNative: true }); actualChart.render(); actualChart.render();
    assert.equal(mounted.inspect().crosshair, null, 'a later native clamped crosshairMove is cleared and cannot replace forecast inspection');
    assert.equal(cursorGroup.getAttribute('display'), 'inline');
    assert.equal(inspected.at(-1).price, modelPrice);
    assert.equal(crosshair.some(detail => detail?.bar), false, 'native last-observed bar details never escape the future pointer route');

    const priorInspectionCount = inspected.length, outsideX = liveCoords.timeToX(Date.parse('2023-10-06T00:00:00Z'));
    dispatchPointer(interactionCanvas, 'pointermove', outsideX, futureY); actualChart.render();
    assert.equal(cursorGroup.getAttribute('display'), 'none', 'space beyond the forecast path remains blank');
    assert.equal(crosshair.at(-1), null, 'outside-forecast hover cannot fall back to an observed badge');
    assert.equal(inspected.length, priorInspectionCount, 'outside-forecast hover does not inspect a fabricated or clamped row');

    const observedBar = mounted.getBars().at(-1), observedX = liveCoords.timeToX(observedBar.time), observedY = liveCoords.priceToY(observedBar.close);
    dispatchPointer(interactionCanvas, 'pointermove', observedX, observedY); actualChart.render();
    assert.equal(cursorGroup.getAttribute('display'), 'none', 'returning to observations removes the transient forecast cursor');
    assert.equal(mounted.inspect().crosshair.time, observedBar.time, 'native observed hover resumes at the actual archived bar');
    assert.equal(inspected.at(-1).bar.time, observedBar.time);
    const leave = new window.Event('pointerleave'); Object.defineProperty(leave, 'pointerType', { value: 'mouse' }); interactionCanvas.dispatchEvent(leave); actualChart.render();
    assert.equal(cursorGroup.getAttribute('display'), 'none', 'leaving the plot clears the transient cursor');
    assert.equal(mounted.inspect().crosshair, null);

    const measuredAt = [];
    mounted.setAtlasInteraction({ tool: 'measure', magnet: 'off', measurement: null, onMeasure: value => measuredAt.push(value), onInspect: detail => inspected.push(detail) });
    dispatchPointer(interactionCanvas, 'pointerdown', futureX, futureY); dispatchPointer(interactionCanvas, 'pointerup', futureX, futureY); actualChart.render();
    assert.equal(measuredAt.at(-1).startTime, futureTime); assert.ok(Math.abs(measuredAt.at(-1).startPrice - actualCursorPrice) < 1e-6);
    assert.equal(measuredAt.at(-1).startKind, 'simulated', 'manual measurement keeps its separate free-price anchor');
    const beforePan = actualChart.getVisibleTimeRange();
    mounted.setAtlasInteraction({ tool: 'pan', magnet: 'off' });
    dispatchPointer(interactionCanvas, 'pointerdown', futureX, futureY, { buttons: 1 });
    dispatchPointer(interactionCanvas, 'pointermove', futureX - 30, futureY, { buttons: 1 }); actualChart.render();
    const afterPan = actualChart.getVisibleTimeRange();
    assert.notDeepEqual(afterPan, beforePan, 'an active manual pan still reaches native Funnest time-scale input');
    dispatchPointer(interactionCanvas, 'pointerup', futureX - 30, futureY); actualChart.render();
    assert.deepEqual(sourceCandles, sourceBefore, 'future hover, measurement, and pan do not mutate observed OHLCV rows');
    coordsCapture.remove(); mounted.destroy(); mounted = null;
    assert.equal([...overlaySvg.children].some(node => String(node.id).endsWith('-cross')), false, 'dispose removes the transient SVG crosshair');
  } finally {
    mounted?.destroy(); document.createElement = originalCreate;
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('ETH first readout is populated from the latest real archive OHLCV row and source', async () => {
  const archive = ethPayload(), f = await ethViewFixture();
  f.reply(0, archive); await f.settle(); await f.initialization;
  const expected = archive.dailyHistory.candles.at(-1), actual = f.latest().series.candles.at(-1);
  assert.deepEqual({ time: actual.time, date: actual.date, open: actual.open, high: actual.high, low: actual.low, close: actual.close, volume: actual.volume },
    { time: expected.time, date: expected.date, open: expected.open, high: expected.high, low: expected.low, close: expected.close, volume: expected.volume });
  assert.equal(f.latest().source.provider, archive.source);
  assert.equal(f.app.querySelector('#eth-kind').textContent, '관측 종가');
  assert.equal(f.app.querySelector('#eth-price').textContent, `$${expected.close.toFixed(2)}`);
  assert.equal(f.app.querySelector('#eth-bar-time').textContent, expected.date.slice(0, 10));
  for (const value of [expected.open, expected.high, expected.low, expected.close]) assert.ok(f.app.querySelector('#eth-ohlc').innerHTML.includes(value.toFixed(2)));
});

test('ETH preserves an explicit observed row across interval restoration but treats pointer hover as transient', async () => {
  const archive = ethPayload(), f = await ethViewFixture();
  f.reply(0, archive); await f.settle(); await f.initialization;
  const hovered = f.latest().series.candles[10];
  f.latest().onCrosshair({ time: hovered.time * 1000, source: 'mouse' });
  assert.equal(f.app.querySelector('#eth-bar-time').textContent, hovered.date.slice(0, 10));
  f.interval('weekly'); await f.settle();
  let series = f.latest().series;
  assert.equal(f.app.querySelector('#eth-bar-time').textContent, series.candles.at(-1).date.slice(0, 10));
  const selected = series.candles[3];
  f.latest().onCrosshair({ time: selected.time * 1000, source: 'sync' });
  assert.equal(f.app.querySelector('#eth-bar-time').textContent, selected.date.slice(0, 10));
  f.interval('daily'); await f.settle();
  series = f.latest().series;
  const restored = series.candles.reduce((best, row) => Math.abs(row.time - selected.time) < Math.abs(best.time - selected.time) ? row : best, series.candles[0]);
  assert.equal(f.app.querySelector('#eth-bar-time').textContent, restored.date.slice(0, 10));
});

test('ETH final visible-range callback refreshes the footer date after panel resize without changing the native viewport', async () => {
  const f = await ethViewFixture();
  f.reply(0, ethPayload()); await f.settle(); await f.initialization;
  const chart = f.latest(), nativeRange = structuredClone(chart.range);
  assert.equal(nativeRange.unit, 'seconds');
  const narrowedStart = nativeRange.start + Math.floor((nativeRange.end - nativeRange.start) / 3);
  assert.ok(narrowedStart < nativeRange.end);
  chart.onViewport({ from: narrowedStart * 1000, to: nativeRange.end * 1000 });
  assert.deepEqual({ start: chart.range.start, end: chart.range.end }, { start: nativeRange.start, end: nativeRange.end }, 'narrow layout only updates ETH display state, not the native viewport');
  chart.onViewport({ from: nativeRange.start * 1000, to: nativeRange.end * 1000 });
  assert.deepEqual({ start: chart.range.start, end: chart.range.end }, { start: nativeRange.start, end: nativeRange.end }, 'the final wide-layout callback leaves the restored native range untouched');
  const source = await readFile(new URL('../dist/eth-view.js', import.meta.url), 'utf8');
  assert.match(source, /const start=Math\.round\(visible\.from\/1000\),end=Math\.round\(visible\.to\/1000\);if\(end>start&&\(state\.range\?\.start!==start\|\|state\.range\?\.end!==end\)\)\{state\.range=\{\.\.\.state\.range,start,end\};state\.funnestRangeIdentity=rangeIdentity\(state\.range\);workbench\?\.update\?\.\(\);\}/,
    'the final visible-range callback refreshes the native footer label after its state changes');
});

test('ETH passes URL-selected volume and inversion to the initial Funnest mount with a nonzero inset', async () => {
  const f = await ethViewFixture({ query: '&axis-inverted=1&vol=0' });
  f.reply(0, ethPayload()); await f.settle(); await f.initialization;
  assert.equal(f.latest().invertScale, true);
  assert.equal(f.latest().volume, false);
  assert.ok(Number.isFinite(f.latest().insetTop) && f.latest().insetTop > 0);
});

for (const symbol of ['MSTR', 'BMNR']) {
  test(`${symbol} first readout is populated from the latest real archive OHLCV row and source`, async () => {
    const archive = equityPayload(symbol, 1), f = await equityViewFixture(symbol);
    f.reply(0, archive); await f.microtasks(); f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
    const expected = archive.candles.at(-1), actual = f.latest().series.candles.at(-1);
    assert.deepEqual({ time: actual.time, date: actual.date, open: actual.open, high: actual.high, low: actual.low, close: actual.close, volume: actual.volume },
      { time: expected.time, date: expected.date, open: expected.open, high: expected.high, low: expected.low, close: expected.close, volume: expected.volume });
    assert.equal(f.latest().source.provider, archive.source);
    assert.equal(f.app.querySelector('#equity-kind').textContent, '관측 종가');
    assert.equal(f.app.querySelector('#equity-price').textContent, `$${expected.close.toFixed(2)}`);
    assert.equal(f.app.querySelector('#equity-bar-time').textContent, expected.date.slice(0, 10));
    for (const value of [expected.open, expected.high, expected.low, expected.close]) assert.ok(f.app.querySelector('#equity-ohlc').innerHTML.includes(value.toFixed(2)));
  });

  test(`${symbol} passes URL-selected volume and inversion to the initial Funnest mount with a nonzero inset`, async () => {
    const f = await equityViewFixture(symbol, { query: '&axis-inverted=1&vol=0' });
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks();
    f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
    assert.equal(f.latest().invertScale, true);
    assert.equal(f.latest().volume, false);
    assert.ok(Number.isFinite(f.latest().insetTop) && f.latest().insetTop > 0);
  });
}

test('equity interval restoration preserves the explicit forecast valuation date', async () => {
  const components = { coinPrice: 1, coinBaselinePrice: 1, coinUnits: 1, cashUsd: 1, otherAssetsUsd: 1, seniorClaims: 1, residualUsd: 1, shares: 1, premium: 1, capitalRaised: 1, totalFinancingCost: 1, convertedShares: 1 };
  const point = (date, price) => ({ date, price, low: price - 10, high: price + 10, components });
  const project = () => ({ forecasts: Object.fromEntries(['stress', 'base', 'bull'].map((id, index) => [id, {
    scenario: { id, label: id }, asOf: '2026-10-23', financialAsOf: '2026-06-30', displayEnd: '2035-12-31',
    warnings: ['fixture forecast', 'fixture range'], milestones: [], assumptions: { anchors: [], labels: [] },
    snapshot: { coin: 'BTC' }, assetPath: { training: { firstObservation: '2020-01-01', informationThrough: '2026-10-23', observations: 10 }, metadata: { seed: index + 1 } },
    coinAnchor: { date: '2026-10-23', price: 1, retrievedAt: '2026-10-24T00:00:00Z' }, formula: 'fixture formula',
    path: [point('2026-10-23', 100), point('2035-12-31', 200)],
  }])) });
  const f = await equityViewFixture('MSTR', { project });
  f.reply(0, equityPayload('MSTR', 1)); await f.microtasks(); f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
  f.forecastDialog();
  const dialog = f.document.body.nodes.get('equity-detail-dialog'), jump = f.document.createElement('button');
  jump.dataset.equityFutureJump = '2035-12-31';
  dialog.dispatchEvent({ type: 'click', target: jump });
  await f.settle();
  f.interval('weekly'); await f.settle();
  assert.equal(f.app.querySelector('#equity-kind').textContent, '조건부 일별 경로');
  assert.equal(f.app.querySelector('#equity-bar-time').textContent, '2035-12-31');
  assert.equal(f.app.querySelector('#equity-price').textContent, '$200.00');
});

test('equity refresh preserves an explicit selected archive observation and updates it from the new archive', async () => {
  const first = equityPayload('MSTR', 1), f = await equityViewFixture('MSTR');
  f.reply(0, first); await f.microtasks(); f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
  const selected = first.candles[3];
  f.latest().onCrosshair({ time: selected.time * 1000, source: 'sync' });
  assert.equal(f.app.querySelector('#equity-bar-time').textContent, selected.date.slice(0, 10));
  f.reload();
  const refreshed = equityPayload('MSTR', 2);
  f.reply(2, refreshed); await f.microtasks(); f.reply(3, { revision: 2 }); await f.settle();
  const actual = f.latest().series.candles.find(row => row.date === selected.date);
  assert.equal(f.app.querySelector('#equity-bar-time').textContent, selected.date.slice(0, 10));
  assert.equal(f.app.querySelector('#equity-price').textContent, `$${actual.close.toFixed(2)}`);
  assert.equal(f.app.querySelector('#equity-kind').textContent, '관측 종가');
});

test('ETH and equity active price renderers use the shared Funnest adapter rather than the legacy SVG painter', async () => {
  const adapter = await readFile(new URL('../dist/funnest-observed-price-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /from ['"]\.\/funnest-chart-runtime\.bundle\.js['"]/);
  assert.doesNotMatch(adapter, /from ['"]\.\/funnest-chart-runtime\.js['"]/);
  assert.match(adapter, /getExportSurface\s*=\s*\(\)\s*=>\s*\(\{ canvas: mounted\.getCanvas\(\), svg: mounted\.getOverlaySvg\(\) \}\)/);
  for (const name of ['eth-view.js', 'equity-view.js']) {
    const source = await readFile(new URL(`../dist/${name}`, import.meta.url), 'utf8');
    assert.match(source, /mountObservedPriceChart/);
    assert.match(source, /setData\(atlasCandlesToFunnestBars\(series\),\{preserveRange:true\}\)/);
    assert.match(source, /setAtlasOverlays/);
    assert.match(source, /getAtlasChartExportSurface=\(\)=>state\.controller\?\.getExportSurface/);
    assert.match(source, /result\?\.painted===true/);
    assert.match(source, /state\.funnestReady=false/);
    assert.match(source, /pointIsInPlot\?\.\(point\)/);
    assert.match(source, /invertScale:state\.invertScale,magnet:state\.magnet,insetTop:headerInset/);
    assert.match(source, /isCrosshairReady:\(\)=>Boolean\(state\.funnestSeries\)/);
    assert.match(source, /setAtlasInsets\?\.\(\{top:headerInset\}\)/);
    assert.match(source, /setVolumeVisible\?\.\(state\.showVolume\)/);
    assert.match(source, /setInverted\?\.\(state\.invertScale\)/);
    assert.match(source, /canStart:point=>svg\.dataset\.chartReplayActive!=='true'&&Boolean\(state\.controller\?\.pointIsInPlot\?\.\(point\)\)/);
    assert.doesNotMatch(source, /drawIntradayChart/);
    assert.match(source, /funnestMount\?\.destroy\(\)/);
  }
});


test('actual Funnest event labels avoid a live HUD obstacle and expose copied paint geometry', () => {
  const { document, window } = parseHTML('<html><body><div id="plot"></div></body></html>');
  window.devicePixelRatio = 1;
  const globalKeys = ['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const originals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document);
  let nextFrame = 0, mounted, painted = [], eventLines = [];
  const setBounds = element => { element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 420, width: 640, height: 420 }); for (const [key, value] of [['clientWidth', 640], ['clientHeight', 420], ['offsetWidth', 640], ['offsetHeight', 420]]) Object.defineProperty(element, key, { configurable: true, value }); };
  document.createElement = (name, ...args) => { const element = originalCreate(name, ...args); setBounds(element); if (name === 'canvas') element.getContext = () => ({ canvas: element, measureText: value => ({ width: String(value).length * 6 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }) }); return element; };
  const ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const getComputedStyle = () => ({ getPropertyValue: () => '' });
  Object.assign(window, { ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++nextFrame, cancelAnimationFrame() {} });
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver, ResizeObserver, matchMedia, getComputedStyle, requestAnimationFrame: () => ++nextFrame, cancelAnimationFrame() {} });
  const ctx = { font: '12px sans-serif', measureText: value => ({ width: String(value).length * 6, actualBoundingBoxAscent: 7, actualBoundingBoxDescent: 3, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 4 }) };
  const painter = { ctx, line() {}, vLine: (...args) => eventLines.push(args), circle() {}, text: (...args) => painted.push(args), measure: value => String(value).length * 6 };
  const obstacles = [];
  try {
    const plot = document.getElementById('plot'); setBounds(plot);
    mounted = mountObservedPriceChart(plot, { series: { candles }, symbol: 'ETH-USD', currency: 'USD', eventObstacles: () => obstacles });
    mounted.host.getBoundingClientRect = () => ({ x: 100, y: 200, left: 100, top: 200, right: 740, bottom: 620, width: 640, height: 420 });
    Object.defineProperty(mounted.chart, 'layout', { configurable: true, value: { width: 640, height: 420, panes: [{ id: 'main', kind: 'main', top: 0, height: 200 }] } });
    const firstDate = new Date(candles[0].time * 1000).toISOString().slice(0, 10), secondDate = new Date(candles[1].time * 1000).toISOString().slice(0, 10);
    const firstMidnight = Date.parse(firstDate + 'T00:00:00Z'), secondMidnight = Date.parse(secondDate + 'T00:00:00Z');
    const coords = { timeToX: time => time === firstMidnight ? 20 : time === secondMidnight ? 160 : NaN, priceToY: () => 100, height: 200, plotWidth: 300 };
    const obstacle = { left: 125, top: 205, right: 180, bottom: 219, width: 55, height: 14 }; obstacles.push(obstacle);
    mounted.setAtlasOverlays({ events: [{ date: firstDate, title: 'blocked' }, { date: secondDate, title: 'visible' }], showEvents: true });
    const actualChart = mounted.chart, adapterOverlays = actualChart.overlays.slice(-3);
    assert.deepEqual(adapterOverlays.map(item => item.layer), ['below', 'above', 'above'], 'adapter paint overlays remain the final three native overlays');
    const overlay = adapterOverlays.filter(item => item.layer === 'above').at(0); overlay.render({ coords, painter });
    const receipt = mounted.inspectAtlasOverlayRender();
    assert.equal(receipt.eventInputCount, 2); assert.equal(receipt.eventLines.length, 2, 'HUD overlap never removes event marker lines');
    assert.deepEqual(receipt.eventLabels.map(item => item.date), [secondDate]);
    assert.equal(receipt.excludedEventLabels.length, 1); assert.equal(receipt.excludedEventLabels[0].date, firstDate);
    assert.deepEqual(receipt.excludedEventLabels[0].obstacleIndexes, [0]);
    assert.deepEqual(receipt.eventObstacles[0].canvasRect, { left: 25, top: 5, right: 80, bottom: 19, width: 55, height: 14 });
    assert.equal(receipt.excludedEventLabels[0].canvasRect.left, 24); assert.equal(receipt.eventLabels[0].canvasRect.left, 164);
    assert.equal(painted.length, 1); assert.equal(painted[0][0], 'visible');
    assert.equal(Object.isFrozen(receipt.eventLabels), true); assert.equal(Object.isFrozen(receipt.eventLabels[0].canvasRect), true);
    assert.equal(Object.isFrozen(receipt.excludedEventLabels), true); assert.equal(Object.isFrozen(receipt.excludedEventLabels[0].canvasRect), true);
    assert.equal(Object.isFrozen(receipt.eventObstacles), true); assert.equal(Object.isFrozen(receipt.eventObstacles[0].viewportRect), true);
    const copiedObstacleLeft = receipt.eventObstacles[0].viewportRect.left; obstacle.left = 999;
    assert.equal(receipt.eventObstacles[0].viewportRect.left, copiedObstacleLeft, 'receipts are detached from mutable DOMRect sources');
    obstacles[0] = { left: 150, top: 210, right: 150, bottom: 240, width: 0, height: 30 }; overlay.render({ coords, painter });
    const unobstructed = mounted.inspectAtlasOverlayRender();
    assert.equal(unobstructed.eventInputCount, 2); assert.equal(unobstructed.eventLines.length, 2);
    assert.deepEqual(unobstructed.eventObstacles, [], 'zero-area hidden rectangles are not treated as live obstacles');
    assert.deepEqual(unobstructed.eventLabels.map(item => item.date), [firstDate, secondDate]);
    assert.deepEqual(unobstructed.excludedEventLabels, []); assert.equal(painted.length, 3);

    // A later marker can pass the pre-clamp x-distance check while its longer
    // right-edge-clamped label moves back into the prior label's actual box.
    painted.length=0;eventLines.length=0;obstacles.length=0;
    painter.measure=text=>text==='first-right-edge'?102:123;
    ctx.measureText=text=>({width:painter.measure(text),actualBoundingBoxAscent:7,actualBoundingBoxDescent:3,fontBoundingBoxAscent:8,fontBoundingBoxDescent:4});
    const edgeCoords={...coords,timeToX:time=>time===firstMidnight?100:260,plotWidth:300};
    mounted.setAtlasOverlays({events:[{date:firstDate,title:'first-right-edge'},{date:secondDate,title:'second-right-edge'}],showEvents:true});
    overlay.render({coords:edgeCoords,painter});
    const edgeReceipt=mounted.inspectAtlasOverlayRender();
    assert.equal(edgeReceipt.eventInputCount,2);assert.equal(edgeReceipt.eventLines.length,2,'label exclusion never removes either source event line');
    assert.deepEqual(edgeReceipt.eventLines.map(item=>item.date),[firstDate,secondDate]);
    assert.deepEqual(edgeReceipt.eventLabels.map(item=>item.date),[firstDate]);
    assert.equal(edgeReceipt.excludedEventLabels[0].date,secondDate);assert.equal(edgeReceipt.excludedEventLabels[0].reason,'label-gap');
    assert.equal(edgeReceipt.excludedEventLabels[0].requiredGapPx,32);assert.ok(edgeReceipt.excludedEventLabels[0].canvasRect.left<edgeReceipt.excludedEventLabels[0].previousLabelRight+32,'post-clamp rectangle would violate the existing 32px gap');
    assert.equal(edgeReceipt.suppressedEventLabelCount,1,'the receipt counts event labels omitted for lack of spacing');
    assert.equal(painted.length,1,'only the non-colliding actual label is painted');assert.equal(eventLines.length,2);
    mounted.destroy(); mounted = null;
  } finally { mounted?.destroy(); document.createElement = originalCreate; for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; }
});

test('ETH rounds sub-second viewport edges and never echoes passive viewport into native range', async () => {
  const f = await ethViewFixture(); f.reply(0, ethPayload()); await f.settle(); await f.initialization;
  const chart = f.latest(), native = { from: 1715039999735.388, to: 1715126399735.388 }; chart.nativeRange = { ...native };
  const updates = f.workbenchUpdates(), rangeCalls = chart.setAtlasRangeCalls; chart.onViewport(native);
  assert.deepEqual({ start: Math.round(native.from / 1000), end: Math.round(native.to / 1000) }, { start: 1715040000, end: 1715126400 });
  assert.equal(f.workbenchUpdates(), updates + 1, 'a changed rounded range refreshes the footer once');
  const sameRounded = { from: 1715040000123.456, to: 1715126400456.789 }; chart.nativeRange = { ...sameRounded }; chart.onViewport(sameRounded);
  assert.equal(f.workbenchUpdates(), updates + 1, 'fraction-only movement within a rounded range does not refresh the footer');
  assert.equal(chart.setAtlasRangeCalls, rangeCalls); f.priceRange({ min: 90, max: 120 }); await f.settle();
  assert.equal(chart.setAtlasRangeCalls, rangeCalls, 'a price-range redraw does not echo the rounded display range'); assert.deepEqual(chart.nativeRange, sameRounded);
});

test('ETH event obstacles follow indicator element visibility and live DOMRect', async () => {
  const f = await ethViewFixture(); f.reply(0, ethPayload()); await f.settle(); await f.initialization;
  const obstacles = f.latest().eventObstacles; assert.equal(typeof obstacles, 'function'); assert.equal(obstacles().length, 0);
  f.indicator.hidden = false; const visible = obstacles(); assert.equal(visible.length, 1); assert.equal(visible[0], f.indicatorRect);
});

test('equity range callbacks update footer only on rounded edge changes and preserve native fractions', async () => {
  const f = await equityViewFixture('MSTR'); f.reply(0, equityPayload('MSTR', 1)); await f.microtasks(); f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
  const chart = f.latest(), native = { from: 1715039999735.388, to: 1715126399735.388 }; chart.nativeRange = { ...native };
  const updates = f.workbenchUpdates(), rangeCalls = chart.setAtlasRangeCalls; chart.onViewport(native); assert.equal(f.workbenchUpdates(), updates + 1, 'a genuine rounded-range change refreshes the footer');
  const sameRounded = { from: 1715040000123.456, to: 1715126400456.789 }; chart.nativeRange = { ...sameRounded }; chart.onViewport(sameRounded);
  assert.equal(f.workbenchUpdates(), updates + 1, 'fraction-only motion does not refresh the footer'); assert.equal(chart.setAtlasRangeCalls, rangeCalls);
  f.priceRange({ min: 90, max: 120 }); await f.settle(); assert.equal(chart.setAtlasRangeCalls, rangeCalls, 'an unrelated redraw does not reset native range'); assert.deepEqual(chart.nativeRange, sameRounded);
});

test('equity event obstacles follow indicator element visibility and live DOMRect', async () => {
  const f = await equityViewFixture('MSTR'); f.reply(0, equityPayload('MSTR', 1)); await f.microtasks(); f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
  const obstacles = f.latest().eventObstacles; assert.equal(typeof obstacles, 'function'); assert.equal(obstacles().length, 0);
  f.indicator.hidden = false; const visible = obstacles(); assert.equal(visible.length, 1); assert.equal(visible[0], f.indicatorRect);
});
