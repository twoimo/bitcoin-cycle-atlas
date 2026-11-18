import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createChart } from '@funnest/charts';
import { ATLAS_FUNNEST_THEME, ATLAS_PRICE_AXIS_MIN_WIDTH, exposeAtlasFunnestSnapshot, holdFunnestPriceAxisWidth, inspectAtlasFunnestChart, mapCloseOnlyToFunnestLine, mountAtlasFunnestChart, setFunnestPriceExtrema, setFunnestPriceScaleInverted, validateFunnestBars } from '../src/charts/funnest-chart-runtime.js';
import { withChartSpacing } from '../dist/chart-view-policy.js';
import { sessionBars, sessionDay, withNativeRuntime } from './helpers/funnest-native-fixture.mjs';

test('native current-price badge direction colors preserve red/blue meaning and white text contrast',()=>{
  const channels=hex=>hex.match(/[a-f\d]{2}/ig).map(part=>parseInt(part,16)/255);
  const luminance=hex=>channels(hex).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  for(const color of [ATLAS_FUNNEST_THEME.up,ATLAS_FUNNEST_THEME.down]){
    assert.ok(1.05/(luminance(color)+.05)>=4.5,'white last-price label text must retain 4.5:1 contrast');
    assert.ok((luminance(color)+.05)/(luminance('#141415')+.05)>=3,'direction paint remains distinct on the native dark canvas');
  }
  const up=channels(ATLAS_FUNNEST_THEME.up),down=channels(ATLAS_FUNNEST_THEME.down);
  assert.ok(up[0]>up[1]&&up[0]>up[2],'Korean rising-price color stays red');
  assert.ok(down[2]>down[0]&&down[2]>down[1],'Korean falling-price color stays blue');
});

const valid = [
  { time: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105, volume: 7 },
  { time: 1_700_086_400_000, open: 105, high: 111, low: 101, close: 109, volume: 0 },
];

test('Funnest input preserves exact UTC OHLCV and missing-time gaps', () => {
  const bars = validateFunnestBars(valid);
  assert.equal(bars[0], valid[0]);
  assert.equal(bars[1], valid[1]);
  assert.equal(bars[1].time - bars[0].time, 86_400_000);
  assert.equal(bars[1].volume, 0);
});

test('Funnest input rejects malformed, unordered and synthetic values instead of repairing', () => {
  assert.throws(() => validateFunnestBars(null), /array/);
  assert.throws(() => validateFunnestBars([{ ...valid[0], close: NaN }]), /Invalid OHLC/);
  assert.throws(() => validateFunnestBars([valid[1], valid[0]]), /strictly increasing/);
  assert.throws(() => validateFunnestBars([{ ...valid[0], high: 99 }]), /OHLC envelope/);
  assert.throws(() => validateFunnestBars([{ ...valid[0], volume: -1 }]), /volume/);
});

test('empty observed series is preserved for explicit empty-state handling', () => {
  assert.deepEqual(validateFunnestBars([]), []);
});

test('read-only inspector reports real copied bars, source identity, range/layout and sampled canvas ink', () => {
  const bars = structuredClone(valid), pixels = new Uint8ClampedArray([20, 30, 40, 255, 80, 90, 100, 255]);
  const canvas = { width: 2, height: 1, isConnected: true, getContext: () => ({ getImageData: () => ({ data: pixels }) }) };
  const host = { dataset: { symbol: 'BTCUSD', currency: 'USD' }, parentElement: { querySelectorAll: () => [] }, contains: () => false, querySelectorAll: () => [canvas] };
  const chart = { bars, getVisibleTimeRange: () => ({ from: bars[0].time, to: bars[1].time }), layout: { plotWidth: 300, panesHeight: 240 } };
  const evidence = inspectAtlasFunnestChart({ chart, host, source: { name: 'Bitstamp', hash: 'a'.repeat(64) }, state: 'ready' });
  assert.equal(evidence.painted, true);
  assert.equal(evidence.symbol, 'BTCUSD'); assert.equal(evidence.currency, 'USD');
  assert.equal(evidence.timeUnit, 'UTC milliseconds'); assert.equal(evidence.source.hash, 'a'.repeat(64));
  assert.deepEqual(evidence.range, { from: bars[0].time, to: bars[1].time });
  assert.equal(evidence.canvases[0].sampledColors, 2); assert.equal(evidence.canvases[0].opaquePixels, 2);
  evidence.observations[0].close = 1; assert.equal(bars[0].close, 105, 'inspector returns copies and exposes no chart setters');
});

test('read-only inspector fails closed on blank or unreadable canvas ink', () => {
  const host = { dataset: {}, parentElement: { querySelectorAll: () => [] }, contains: () => false, querySelectorAll: () => [{ width: 1, height: 1, isConnected: true, getContext: () => null }] };
  const chart = { bars: valid, layout: { plotWidth: 100, panesHeight: 100 }, getVisibleTimeRange: () => null };
  assert.equal(inspectAtlasFunnestChart({ chart, host, state: 'ready' }).painted, false);
});

test('forecast extrema adapter changes an actual pinned Funnest Chart scale and resets it', () => {
  const { document, window } = parseHTML('<html><body><div id="host"></div></body></html>');
  window.devicePixelRatio = 1;
  const originals = new Map(['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document);
  const context = new Proxy({ canvas: null, measureText: value => ({ width: String(value).length * 6 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255]) }) }, {
    get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true),
  });
  document.createElement = (name, ...args) => {
    const node = originalCreate(name, ...args);
    if (name === 'canvas') node.getContext = () => { context.canvas = node; return context; };
    return node;
  };
  Object.assign(globalThis, {
    document, window, MutationObserver: window.MutationObserver,
    ResizeObserver: class { observe() {} disconnect() {} },
    matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
  });
  let chart;
  try {
    chart = createChart(document.getElementById('host'));
    chart.setData(valid);
    assert.equal(chart.mainScale.autoScale, true);
    setFunnestPriceExtrema(chart, { min: 50, max: 150 });
    assert.equal(chart.mainScale.autoScale, false);
    assert.equal(chart.mainScale.min, 50);
    assert.equal(chart.mainScale.max, 150);
    assert.deepEqual(chart.bars, valid, 'scale extension does not rewrite actual engine bars');
    chart.mainScale.height = 320; chart.mainScale.insetTop = 18; chart.mainScale.setRange(10, 20);
    const normalLow = chart.mainScale.priceToY(10), normalHigh = chart.mainScale.priceToY(20);
    assert.ok(normalLow > normalHigh, 'normal axes place low values lower on screen');
    setFunnestPriceScaleInverted(chart, true);
    const invertedLow = chart.mainScale.priceToY(10), invertedHigh = chart.mainScale.priceToY(20);
    assert.ok(invertedLow < invertedHigh, 'inverted extension flips Funnest scale coordinates');
    assert.ok(Math.abs(chart.mainScale.yToPrice(chart.mainScale.priceToY(15)) - 15) < 1e-8, 'inverted crosshair mapping remains an inverse');
    setFunnestPriceScaleInverted(chart, false);
    assert.equal(chart.mainScale.priceToY(10), normalLow, 'reset restores native coordinates');
    setFunnestPriceExtrema(chart, null);
    assert.equal(chart.mainScale.autoScale, true);
  } finally {
    chart?.destroy();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('explicit requested range survives real native font-axis re-layout until container gesture, and setRange owns the latest request', async () => {
  const { document, window } = parseHTML('<html><body><div id="host"></div></body></html>');
  window.devicePixelRatio = 1;
  const originals = new Map(['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document), bounds = { left: 100, top: 50, width: 900, height: 520, right: 1000, bottom: 570 };
  let glyphWidth=6, chart;
  const resizeObservers=[];
  class TestResizeObserver { constructor(callback){this.callback=callback;} observe(target){this.target=target;resizeObservers.push(this);} disconnect(){} }
  const context = new Proxy({ canvas: null, measureText: value => ({ width: String(value).length * glyphWidth }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255, 2, 3, 4, 255]) }) }, {
    get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true),
  });
  const container=document.getElementById('host');container.getBoundingClientRect=()=>({...bounds});
  document.createElement=(name,...args)=>{const node=originalCreate(name,...args);if(name==='div'||name==='canvas')node.getBoundingClientRect=()=>({...bounds});if(name==='canvas')node.getContext=()=>{context.canvas=node;return context;};return node;};
  window.ResizeObserver=TestResizeObserver;
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver, ResizeObserver: TestResizeObserver, matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }), getComputedStyle: () => ({ color: '', getPropertyValue: () => '' }), requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout });
  const day=86_400_000,start=Date.parse('2024-01-01T00:00:00Z'),bars=Array.from({length:30},(_,index)=>{const close=70_000+index*123;return{time:start+index*day,open:close-100,high:close+500,low:close-500,close,volume:0};});
  const firstRequest={from:start,to:start+29*day+day-1},latestRequest={from:start+4*day,to:start+24*day+day-1},userRange={from:start+9*day,to:start+19*day+day-1};
  try {
    chart=mountAtlasFunnestChart(container,{bars,symbol:'BTCUSD',scale:'log',range:firstRequest,volume:false});
    chart.setPriceExtrema({min:50_000,max:150_000});chart.setScale('log');
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(chart.chart.mainScale.autoScale,false,'first paint must not reset an explicit log-scale domain');
    assert.equal(chart.chart.mainScale.min,50_000);assert.equal(chart.chart.mainScale.max,150_000);
    chart.chart.mainScale.zoom(1.2);chart.chart.invalidate();await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(chart.chart.mainScale.autoScale,false,'genuine Y zoom remains manual');assert.notEqual(chart.chart.mainScale.min,50_000,'runtime does not reassert the original domain after a Y interaction');
    chart.setPriceExtrema({min:50_000,max:150_000});chart.setScale('log');await new Promise(resolve=>setTimeout(resolve,20));
    let visible=chart.chart.getVisibleTimeRange();
    assert.equal(Math.round(visible.from),firstRequest.from);assert.equal(Math.round(visible.to),firstRequest.to);
    assert.equal(chart.setRange(latestRequest),true,'public setRange accepts the latest explicit range');
    await new Promise(resolve=>setTimeout(resolve,40));
    visible=chart.chart.getVisibleTimeRange();assert.equal(Math.round(visible.from),latestRequest.from);assert.equal(Math.round(visible.to),latestRequest.to);
    const initialPlotWidth=chart.chart.layout.plotWidth;
    glyphWidth=11;chart.chart.refreshTheme();chart.chart.takeScreenshot();
    await new Promise(resolve=>setTimeout(resolve,60));
    const resizedPlotWidth=chart.chart.layout.plotWidth;
    assert.notEqual(resizedPlotWidth,initialPlotWidth,'changed canvas glyph metrics must change the actual native price-axis/plot layout');
    visible=chart.chart.getVisibleTimeRange();assert.equal(Math.round(visible.from),latestRequest.from,'font-axis re-layout keeps the most recent explicit start');assert.equal(Math.round(visible.to),latestRequest.to,'font-axis re-layout keeps the most recent explicit end');
    const overlay=document.createElement('svg');container.appendChild(overlay);
    overlay.dispatchEvent(new window.Event('pointerdown',{bubbles:true,cancelable:true}));
    chart.chart.setVisibleTimeRange(userRange);
    // Force a native re-layout before its visibleRangeChange callback can refresh retainedRange.
    glyphWidth=15;chart.chart.refreshTheme();chart.chart.takeScreenshot();
    await new Promise(resolve=>setTimeout(resolve,60));
    visible=chart.chart.getVisibleTimeRange();assert.notEqual(Math.round(visible.from),latestRequest.from,'a real gesture releases the last caller-requested range');assert.ok(visible.from>latestRequest.from&&visible.to<latestRequest.to,'later axis layout keeps the post-gesture native viewport rather than rewinding to a requested range');

    chart.destroy(); chart=mountAtlasFunnestChart(container,{bars,symbol:'BTCUSD',scale:'log',range:latestRequest,volume:false});
    await new Promise(resolve=>setTimeout(resolve,80));
    const dispatchKey=(target,key,modifiers={})=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'key',{value:key});for(const [name,value] of Object.entries(modifiers))Object.defineProperty(event,name,{value});target.dispatchEvent(event);return event;};
    const input=document.createElement('input');chart.host.appendChild(input);
    dispatchKey(chart.host,'x');dispatchKey(chart.host,'ArrowRight',{ctrlKey:true});dispatchKey(input,'End');
    glyphWidth=12;chart.chart.refreshTheme();chart.chart.takeScreenshot();await new Promise(resolve=>setTimeout(resolve,60));
    visible=chart.chart.getVisibleTimeRange();assert.equal(Math.round(visible.from),latestRequest.from,'unrelated, modified, and input-targeted keys retain requested-range ownership');
    dispatchKey(chart.host,'ArrowRight');
    await new Promise(resolve=>setTimeout(resolve,30));
    const keyboardRange=chart.chart.getVisibleTimeRange();assert.notDeepEqual(keyboardRange,latestRequest,'accepted keyboard navigation changes the native viewport');
    glyphWidth=15;chart.chart.refreshTheme();chart.chart.takeScreenshot();await new Promise(resolve=>setTimeout(resolve,60));
    visible=chart.chart.getVisibleTimeRange();assert.notEqual(Math.round(visible.from),latestRequest.from,'accepted keyboard navigation releases ownership before later font-axis re-layout');
    const renewedRequest={from:start+2*day,to:start+18*day+day-1};
    assert.equal(chart.setRange(renewedRequest),true,'a valid caller request re-owns the viewport after a gesture');
    assert.equal(chart.setRange({from:renewedRequest.to,to:renewedRequest.from}),false,'invalid caller ranges remain no-ops');
    glyphWidth=17;chart.chart.refreshTheme();chart.chart.takeScreenshot();await new Promise(resolve=>setTimeout(resolve,60));
    visible=chart.chart.getVisibleTimeRange();assert.equal(Math.round(visible.from),renewedRequest.from,'the renewed explicit request survives subsequent axis re-layout');assert.equal(Math.round(visible.to),renewedRequest.to,'invalid range input does not replace the retained request');

    chart.destroy();
    bounds.width=1440;bounds.right=bounds.left+bounds.width;
    const longBars=Array.from({length:5850},(_,index)=>{const close=30_000+index*13;return{time:Date.parse('2010-01-01T00:00:00Z')+index*day,open:close-20,high:close+70,low:close-70,close};});
    const fourYearRange={from:Date.parse('2024-11-12T00:00:00Z'),to:Date.parse('2028-11-12T00:00:00Z')+day-1};
    chart=mountAtlasFunnestChart(container,{bars:longBars,symbol:'BTCUSD',scale:'log',range:fourYearRange,volume:false});
    await new Promise(resolve=>setTimeout(resolve,80));
    const initialBarCount=chart.chart.bars.length;
    const nativeResize=resizeObservers.filter(observer=>observer.target?.className==='fnc-chart').at(-1);
    assert.ok(nativeResize,'test reaches the actual pinned Funnest ResizeObserver');
    bounds.width=388;bounds.right=bounds.left+bounds.width;nativeResize.callback([{contentRect:{width:388,height:520}}]);
    await new Promise(resolve=>setTimeout(resolve,80));
    visible=chart.chart.getVisibleTimeRange();
    assert.ok(Math.abs(visible.from-fourYearRange.from)<=day,'phone width retains the requested UTC start instead of clamping to the last ~two years');
    assert.ok(Math.abs(visible.to-fourYearRange.to)<=day,'phone width retains the requested UTC end');
    assert.equal(chart.chart.bars.length,initialBarCount,'responsive fitting never adds synthetic bars');
    assert.ok(chart.chart.timeScale.options.minBarSpacing<0.5,'only the explicit retained fit window receives a sub-0.5 density exception');
    assert.ok(chart.chart.timeScale.options.minBarSpacing>=chart.chart.timeScale.width/5999,'the retained window still respects the 6,000-bar budget');
    chart.chart.zoom(1.2);await new Promise(resolve=>setTimeout(resolve,30));chart.chart.zoom(1/1.2);await new Promise(resolve=>setTimeout(resolve,30));
    assert.ok(chart.chart.timeScale.options.minBarSpacing<0.5,'zoom gestures retain the fit-density exception instead of ratcheting its budget away');
    const retainedFit={from:Date.parse('2020-11-12T00:00:00Z'),to:fourYearRange.to};
    assert.equal(chart.setRange(retainedFit),true,'a new explicit fit after interaction is accepted');
    await new Promise(resolve=>setTimeout(resolve,60));visible=chart.chart.getVisibleTimeRange();
    assert.ok(Math.abs(visible.from-retainedFit.from)<=day&&Math.abs(visible.to-retainedFit.to)<=day,'a newly requested wider fit is applied without the previous range floor truncating it');
    assert.ok(chart.chart.timeScale.options.minBarSpacing>=chart.chart.timeScale.width/5999,'the wider fit still honors the maximum 6,000-bar budget');

    chart.destroy();
    const fitCount=7147,fitStart=Date.parse('2000-01-01T00:00:00Z'),fitEnd=fitStart+(fitCount-1)*day;
    const iso=time=>new Date(time).toISOString().slice(0,10),canonical=withChartSpacing({start:iso(fitStart),end:iso(fitEnd),min:iso(fitStart),max:iso(fitEnd)},{frequency:'daily',plotWidth:388});
    assert.equal(canonical.maxSpan,fitCount,'the shared policy explicitly retains this Fit beyond 6,000 bars');
    const denseBars=Array.from({length:fitCount},(_,index)=>{const close=20_000+index;return{time:fitStart+index*day,open:close-1,high:close+2,low:close-2,close};});
    chart=mountAtlasFunnestChart(container,{bars:denseBars,symbol:'MSTR',scale:'log',range:{from:fitStart,to:fitEnd},volume:false});
    await new Promise(resolve=>setTimeout(resolve,80));
    visible=chart.chart.getVisibleTimeRange();
    assert.ok(Math.abs(visible.from-fitStart)<=day&&Math.abs(visible.to-fitEnd)<=day,'native Funnest retains all dates in the canonical 7,147-bar explicit Fit');
    assert.equal(chart.chart.bars.length,fitCount,'Fit-density exceptions preserve source rows without adding geometry');
    assert.ok(chart.chart.timeScale.options.minBarSpacing<chart.chart.timeScale.width/5999,'explicit retained Fit may exceed the normal 6,000-bar budget');

    chart.destroy();bounds.width=4000;bounds.right=bounds.left+bounds.width;
    chart=mountAtlasFunnestChart(container,{bars:denseBars,symbol:'MSTR',scale:'log',volume:false});
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.ok(chart.chart.timeScale.options.minBarSpacing>=Math.max(.5,chart.chart.timeScale.width/5999)-1e-9,'ordinary unowned navigation keeps the 0.5 px and 6,000-bar floors');
  } finally {
    chart?.destroy();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('future-only UTC axis dates use native overlay coordinates without synthetic bars and remain passive across pan, data change and destroy', async () => {
  const { document, window } = parseHTML('<html><body><div id="host"></div></body></html>');
  window.devicePixelRatio = 1;
  const originals = new Map(['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document), bounds = { left: 0, top: 0, width: 388, height: 520, right: 388, bottom: 520 };
  const context = new Proxy({ canvas: null, measureText: value => ({ width: String(value).length * 6 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255, 2, 3, 4, 255]) }) }, {
    get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true),
  });
  class TestResizeObserver { constructor(callback){this.callback=callback;} observe(target){this.target=target;} disconnect(){} }
  const container=document.getElementById('host');container.getBoundingClientRect=()=>({...bounds});
  document.createElement=(name,...args)=>{const node=originalCreate(name,...args);if(name==='div'||name==='canvas')node.getBoundingClientRect=()=>({...bounds});if(name==='canvas')node.getContext=()=>{context.canvas=node;return context;};return node;};
  window.ResizeObserver=TestResizeObserver;
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver, ResizeObserver: TestResizeObserver, matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }), getComputedStyle: () => ({ color: '', getPropertyValue: () => '' }), requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout });
  const day=86_400_000,start=Date.parse('2025-01-01T00:00:00Z'),bars=Array.from({length:30},(_,index)=>{const close=70_000+index*123;return{time:start+index*day,open:close-100,high:close+500,low:close-500,close,volume:index};});
  const futureRange={from:Date.parse('2025-02-01T00:00:00Z'),to:Date.parse('2028-12-31T00:00:00Z')+day-1};
  let chart;
  try {
    chart=mountAtlasFunnestChart(container,{bars,symbol:'BTCUSD',scale:'log',timezone:'UTC',locale:'en',range:futureRange,volume:false});
    await new Promise(resolve=>setTimeout(resolve,100));
    let ticks=chart.inspect().futureDateTicks;
    assert.ok(ticks.length>0,'a future-only window receives UTC calendar date labels');
    assert.equal(chart.chart.bars.length,bars.length,'future annotations add no synthetic observed bars');
    assert.deepEqual(chart.getBars(),bars,'future annotations leave all observed source rows unchanged');
    for (const tick of ticks) {
      assert.match(tick.label,/^\d{4}-\d{2}$/,'Every future month retains its year even when density filtering omits January');
      assert.ok(tick.time>bars.at(-1).time,'annotations remain outside observed bar coverage');
      assert.ok(tick.x>=0&&tick.x<=chart.chart.layout.plotWidth,'measured labels stay inside the native time-axis plot');
      assert.ok(Math.abs(tick.x-chart.chart.paneCoords().timeToX(tick.time))<1e-6,'receipt x comes from native overlay timeToX');
    }
    const rail=chart.host.querySelector('[data-atlas-funnest-future-date-rail="true"]');
    assert.ok(rail);assert.equal(rail.style.pointerEvents,'none','the annotation rail cannot intercept native plot input');
    const nativeCanvases=[...chart.host.querySelectorAll('.fnc-chart > canvas')];
    assert.equal(nativeCanvases.length,2,'the pinned engine exposes distinct base and native overlay/input canvases');
    assert.equal(nativeCanvases[0].style.zIndex,'1','base price/time-axis canvas stays below the date rail');
    assert.equal(rail.style.zIndex,'2','date labels occupy the middle layer');
    assert.equal(nativeCanvases[1].style.zIndex,'3','native crosshair date badge and input canvas stay above the rail');
    const baseCanvas=nativeCanvases[0],overlayCanvas=nativeCanvases[1];
    assert.equal(rail.style.top,`${chart.chart.layout.panesHeight}px`,'rail starts at the native time-axis origin');
    assert.equal(rail.style.height,`${chart.chart.layout.timeAxisHeight}px`,'rail uses native time-axis layout height');
    assert.equal(rail.style.width,`${chart.chart.layout.plotWidth}px`,'rail uses the native plot width before the price axis');
    assert.equal(rail.style.fontSize,'12px','calendar annotations match the native 12px axis font');
    assert.ok(chart.chart.timeScale.options.minBarSpacing<0.5,'the future rail remains visible during dense phone Fit');
    const panRange={from:Date.parse('2027-01-01T00:00:00Z'),to:Date.parse('2028-03-01T00:00:00Z')+day-1};
    const gesture=document.createElement('svg');container.appendChild(gesture);gesture.dispatchEvent(new window.Event('pointerdown',{bubbles:true,cancelable:true}));
    chart.chart.setVisibleTimeRange(panRange);chart.chart.refreshTheme();chart.chart.takeScreenshot();
    await new Promise(resolve=>setTimeout(resolve,80));
    ticks=chart.inspect().futureDateTicks;
    assert.ok(ticks.length>0,'future labels refresh from the panned native viewport');
    assert.ok(ticks.every(tick=>tick.time>=chart.chart.getVisibleTimeRange().from&&tick.time<=chart.chart.getVisibleTimeRange().to),`panned labels are limited to visible UTC calendar dates: ${JSON.stringify({ticks,range:chart.chart.getVisibleTimeRange()})}`);

    chart.setData([...bars,{time:Date.parse('2029-01-01T00:00:00Z'),open:75_000,high:75_500,low:74_500,close:75_100,volume:0}]);
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.deepEqual(chart.inspect().futureDateTicks,[],'data change clears labels that are no longer future to the observed series');
    chart.setData(bars);await new Promise(resolve=>setTimeout(resolve,80));
    assert.ok(chart.inspect().futureDateTicks.length>0,'new data-frame render repopulates only valid future annotations');
    const host=chart.host;chart.destroy();
    assert.equal(host.querySelector('[data-atlas-funnest-future-date-rail="true"]'),null,'destroy removes the annotation rail');
    assert.equal(Object.hasOwn(host,'getAtlasFunnestFutureDateTicks'),false,'destroy removes the read-only tick receipt');
    assert.equal(baseCanvas.style.zIndex,'','destroy restores the base canvas stacking style');
    assert.equal(overlayCanvas.style.zIndex,'','destroy restores the native overlay stacking style');

    bounds.width=1400;bounds.right=1400;
    const nyBars=Array.from({length:761},(_,index)=>{const close=30_000+index;return{time:Date.parse('2025-01-01T00:00:00Z')+index*day,open:close-1,high:close+2,low:close-2,close};});
    const nyRange={from:Date.parse('2027-02-01T05:00:00Z'),to:Date.parse('2027-06-01T04:00:00Z')-1};
    chart=mountAtlasFunnestChart(container,{bars:nyBars,symbol:'MSTR',scale:'log',timezone:'America/New_York',locale:'en',range:nyRange,volume:false});
    await new Promise(resolve=>setTimeout(resolve,100));
    ticks=chart.inspect().futureDateTicks;
    const nyMarch=ticks.find(tick=>tick.label==='2027-03'),nyApril=ticks.find(tick=>tick.label==='2027-04');
    const nyRail=chart.host.querySelector('[data-atlas-funnest-future-date-rail="true"]');
    assert.equal(nyRail.dataset.timezone,'America/New_York','rail discloses the configured native clock');
    assert.equal(nyRail.getAttribute('aria-label'),'관측 봉 이후 달력 날짜 (America/New_York)','the accessible rail disclosure identifies its configured clock');
    assert.equal(nyMarch?.time,Date.parse('2027-03-01T05:00:00Z'),`March begins at midnight EST, not UTC midnight on the previous NY date: ${JSON.stringify(ticks.map(tick=>({...tick,iso:new Date(tick.time).toISOString()})))}`);
    assert.equal(nyApril?.time,Date.parse('2027-04-01T04:00:00Z'),'April begins at midnight EDT after the spring DST transition');
    assert.equal(new Date(nyMarch.time).toISOString().slice(0,10),'2027-03-01','internal UTC identity remains separate and matches the actual epoch date');
    assert.equal(new Date(nyApril.time).toISOString().slice(0,10),'2027-04-01','DST-shifted local month anchor keeps its correct UTC identity');
  } finally {
    chart?.destroy();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('close-only source remains source-typed and only receives explicitly internal line geometry', () => {
  const observations = [{ time: 1_700_000_000_000, close: 10 }, { time: 1_700_172_800_000, close: 14 }];
  const mapped = mapCloseOnlyToFunnestLine(observations);
  assert.deepEqual(mapped.observations, observations);
  assert.deepEqual(mapped.lineGeometry, [
    { time: observations[0].time, open: 10, high: 10, low: 10, close: 10 },
    { time: observations[1].time, open: 14, high: 14, low: 14, close: 14 },
  ]);
  assert.equal(mapped.observations[1].time - mapped.observations[0].time, 2 * 86_400_000, 'missing sessions are not filled');
  assert.throws(() => mapCloseOnlyToFunnestLine([{ time: 3, close: 1 }, { time: 3, close: 2 }]), /index 1/);
  assert.throws(() => mapCloseOnlyToFunnestLine([{ time: 3, close: NaN }]), /index 0/);
});

test('inspector never reports internal flat line geometry as observed OHLC', () => {
  const observation = { time: 1_700_000_000_000, close: 10 };
  const internal = { time: observation.time, open: 10, high: 10, low: 10, close: 10 };
  const host = { dataset: { symbol: 'BTCUSD', currency: 'USD' }, parentElement: { querySelectorAll: () => [] }, contains: () => false, querySelectorAll: () => [] };
  const result = inspectAtlasFunnestChart({ chart: { bars: [internal], layout: null }, host, sourceMode: 'close-only', observations: [observation] });
  assert.deepEqual(result.observations, [observation]);
  assert.deepEqual(result.internalLineGeometry, [internal]);
  assert.equal('open' in result.observations[0], false); assert.equal('volume' in result.observations[0], false);
});

test('forecast extrema use the guarded upstream scale adapter without inserting fabricated bars', () => {
  const calls = [];
  const chart = { mainScale: { autoScale: true, setRange: (...args) => calls.push(args) }, invalidate: () => calls.push('paint') };
  setFunnestPriceExtrema(chart, { min: 50, max: 150 });
  assert.deepEqual(calls, [[50, 150], 'paint']);
  assert.equal(chart.mainScale.autoScale, false);
  setFunnestPriceExtrema(chart, null);
  assert.equal(chart.mainScale.autoScale, true);
  assert.deepEqual(calls, [[50, 150], 'paint', 'paint']);
  for (const domain of [{ min: 0, max: 0 }, { min: NaN, max: 3 }, { min: 4, max: 2 }]) {
    assert.throws(() => setFunnestPriceExtrema(chart, domain), /finite increasing/);
  }
  assert.throws(() => setFunnestPriceExtrema({}, { min: 50, max: 150 }), /extension is unavailable/);
});

test('DOM inspection hook is nonwritable, deeply detached and removed only by its owner',()=>{
  const host={},source={observations:[{time:1,close:5}],settings:{volume:true},layout:{panes:[{kind:'main'}]}};
  const remove=exposeAtlasFunnestSnapshot(host,()=>source),descriptor=Object.getOwnPropertyDescriptor(host,'getAtlasFunnestSnapshot');
  assert.equal(descriptor.writable,false);assert.equal(descriptor.enumerable,false);
  const snapshot=host.getAtlasFunnestSnapshot();snapshot.observations[0].close=99;snapshot.settings.volume=false;snapshot.layout.panes[0].kind='fake';
  assert.equal(source.observations[0].close,5);assert.equal(source.settings.volume,true);assert.equal(source.layout.panes[0].kind,'main');
  assert.throws(()=>{host.getAtlasFunnestSnapshot=()=>null;},TypeError);remove();assert.equal('getAtlasFunnestSnapshot' in host,false);
  const stale=exposeAtlasFunnestSnapshot(host,()=>source),current=exposeAtlasFunnestSnapshot(host,()=>({new:true}));stale();assert.deepEqual(host.getAtlasFunnestSnapshot(),{new:true});current();
  assert.throws(()=>exposeAtlasFunnestSnapshot(null,()=>source),TypeError);
});

test('a suspended live canvas never counts as visibly painted during replay', () => {
  const pixels = new Uint8ClampedArray([20,30,40,255,80,90,100,255]);
  let visible = false;
  const canvas = { width: 2, height: 1, isConnected: true, checkVisibility: options => { assert.equal(options.checkOpacity, true); assert.equal(options.checkVisibilityCSS, true); return visible; }, getContext: () => ({ getImageData: () => ({ data: pixels }) }) };
  const host = { dataset: {}, parentElement: { querySelectorAll: () => [] }, contains: () => false, querySelectorAll: () => [canvas] };
  const chart = { bars: valid, layout: { plotWidth: 100, panesHeight: 100 }, getVisibleTimeRange: () => null };
  const hidden = inspectAtlasFunnestChart({chart,host,state:'ready'});
  assert.equal(hidden.canvases[0].readable, true); assert.equal(hidden.canvases[0].visible, false); assert.equal(hidden.painted, false);
  visible = true; assert.equal(inspectAtlasFunnestChart({chart,host,state:'ready'}).painted, true);
});


test('a narrower price label never moves bars or the plot edge after the viewer has taken the viewport', async () => {
  await withNativeRuntime(async ({ container, window, settle, relayout }) => {
    const mounted = mountAtlasFunnestChart(container, { bars: sessionBars, symbol: 'MSTR', range: { from: sessionBars[40].time, to: sessionBars.at(-1).time + 90 * sessionDay }, volume: false, minPriceAxisWidth: 0 });
    try {
      await settle(80);
      container.dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
      await relayout(mounted, 11);
      const wide = { plotWidth: mounted.chart.layout.plotWidth, range: mounted.chart.getVisibleTimeRange(), anchor: mounted.chart.timeScale.xToIndexFloat(270) };
      await relayout(mounted, 6);
      assert.equal(mounted.chart.layout.plotWidth, wide.plotWidth, 'the plot keeps its width when tick labels get narrower');
      assert.deepEqual(mounted.chart.getVisibleTimeRange(), wide.range, 'a narrower label leaves both visible dates where they were');
      assert.equal(mounted.chart.timeScale.xToIndexFloat(270), wide.anchor, 'the bar under a fixed pointer stays under it');
      await relayout(mounted, 15);
      assert.ok(mounted.chart.layout.plotWidth < wide.plotWidth, 'a wider label still gets the room it needs');
    } finally { mounted.destroy(); }
  });
});

test('while the caller still owns the range, a narrower label gives its width back and the range is refit', async () => {
  await withNativeRuntime(async ({ container, settle, relayout }) => {
    const owned = { from: sessionBars[40].time, to: sessionBars.at(-1).time + 90 * sessionDay };
    const mounted = mountAtlasFunnestChart(container, { bars: sessionBars, symbol: 'MSTR', range: owned, volume: false, minPriceAxisWidth: 0 });
    try {
      await settle(80);
      const narrow = mounted.chart.layout.plotWidth;
      await relayout(mounted, 11);
      assert.ok(mounted.chart.layout.plotWidth < narrow, 'a wider label takes plot width');
      await relayout(mounted, 6);
      assert.equal(mounted.chart.layout.plotWidth, narrow, 'before any viewer gesture a transient wide label does not cost plot width for good');
      const visible = mounted.chart.getVisibleTimeRange();
      assert.equal(Math.round(visible.from), owned.from); assert.equal(Math.round(visible.to), owned.to);
    } finally { mounted.destroy(); }
  });
});

test('dragging the time axis right widens the window around the pressed date, and left narrows it', async () => {
  await withNativeRuntime(async ({ container, bounds, settle, PointerEvent }) => {
    const mounted = mountAtlasFunnestChart(container, { bars: sessionBars, symbol: 'MSTR', range: { from: sessionBars[80].time, to: sessionBars[220].time }, volume: false });
    try {
      await settle(80);
      const layout = mounted.chart.layout, surface = [...mounted.host.querySelectorAll('canvas')].at(-1), scale = mounted.chart.timeScale;
      const pressX = layout.plotWidth * .38, clientY = bounds.top + layout.panesHeight + layout.timeAxisHeight / 2;
      const drag = async travel => {
        const start = { span: scale.width / scale.barSpacing, anchor: scale.xToIndexFloat(pressX) };
        surface.dispatchEvent(new PointerEvent('pointerdown', { clientX: bounds.left + pressX, clientY, buttons: 1 }));
        for (const step of [.25, .5, .75, 1]) surface.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.left + pressX + travel * step, clientY, buttons: 1 }));
        surface.dispatchEvent(new PointerEvent('pointerup', { clientX: bounds.left + pressX + travel, clientY }));
        await settle(40);
        return { start, span: scale.width / scale.barSpacing, anchor: scale.xToIndexFloat(pressX) };
      };
      const right = await drag(layout.plotWidth * .2);
      assert.ok(Math.abs(right.span / right.start.span - Math.exp(.4)) < 1e-9, 'a rightward drag of 20% of the plot shows e^0.4 times as many bars: ' + JSON.stringify(right));
      assert.ok(Math.abs(right.anchor - right.start.anchor) < 1e-9, 'the pressed bar stays under the pressed point');
      const left = await drag(-layout.plotWidth * .2);
      assert.ok(Math.abs(left.span / left.start.span - Math.exp(-.4)) < 1e-9, 'the same leftward drag shows e^-0.4 times as many bars');
      assert.ok(Math.abs(left.anchor - left.start.anchor) < 1e-9, 'the pressed bar stays under the pressed point when narrowing');
      const beforeHover = scale.width / scale.barSpacing;
      surface.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.left + pressX + 120, clientY }));
      await settle(20);
      assert.equal(scale.width / scale.barSpacing, beforeHover, 'a move after release is not part of the drag');
    } finally { mounted.destroy(); }
  });
});

test('only a gesture that moves the window gives it to the viewer, and setData reports no interim window', async () => {
  await withNativeRuntime(async ({ container, window, settle, relayout }) => {
    const owned = { from: sessionBars[40].time, to: sessionBars.at(-1).time }, reports = [];
    let mounted;
    mounted = mountAtlasFunnestChart(container, { bars: sessionBars, symbol: 'MSTR', range: owned, volume: false, onViewport: () => reports.push(mounted.userOwnsRange()) });
    try {
      await settle(80);
      assert.equal(mounted.userOwnsRange(), false, 'the requested range belongs to the caller');
      container.dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
      container.dispatchEvent(new window.Event('pointerup', { bubbles: true, cancelable: true }));
      await relayout(mounted, 11);
      assert.equal(mounted.userOwnsRange(), false, 'a click and the relayout after it do not give the window to the viewer');
      const before = mounted.chart.getVisibleTimeRange(), count = reports.length;
      mounted.setData(sessionBars); await settle(80);
      assert.equal(reports.length, count, 'setData reports neither its interim window nor the restore');
      assert.deepEqual(mounted.chart.getVisibleTimeRange(), before, 'setData keeps the visible window');
      const key = new window.Event('keydown', { bubbles: true, cancelable: true });
      Object.defineProperty(key, 'key', { value: 'ArrowLeft' });
      mounted.host.dispatchEvent(key); await settle(40);
      assert.equal(reports.at(-1), true, 'the report after a navigation key belongs to the viewer');
      mounted.setRange(owned); await settle(40);
      assert.equal(mounted.userOwnsRange(), false, 'setRange takes the window back');
    } finally { mounted.destroy(); }
  });
});

test('a setRange made before the data restore runs keeps its window', async () => {
  await withNativeRuntime(async ({ container, settle }) => {
    const first = { from: sessionBars[40].time, to: sessionBars.at(-1).time }, next = { from: sessionBars[10].time, to: sessionBars[60].time };
    const mounted = mountAtlasFunnestChart(container, { bars: sessionBars, symbol: 'MSTR', range: first, volume: false });
    try {
      await settle(80);
      mounted.setData(sessionBars); mounted.setRange(next); await settle(80);
      const visible = mounted.chart.getVisibleTimeRange();
      assert.deepEqual({ from: Math.round(visible.from), to: Math.round(visible.to) }, next, 'the delayed restore does not replace the newer requested window');
    } finally { mounted.destroy(); }
  });
});

test('the price axis never falls below the shared minimum width and still grows for a wider label', () => {
  const engine = width => ({ priceAxisWidth: width });
  const chart = engine(56);
  holdFunnestPriceAxisWidth(chart, () => false, 96);
  assert.equal(chart.priceAxisWidth, 96, 'the narrow starting width is raised at once');
  chart.priceAxisWidth = 80; assert.equal(chart.priceAxisWidth, 96, 'a narrower label cannot lower it');
  chart.priceAxisWidth = 112; assert.equal(chart.priceAxisWidth, 112, 'a wider label takes the room it needs');
  chart.priceAxisWidth = 88; assert.equal(chart.priceAxisWidth, 96, 'before the viewer takes the viewport it returns to the floor');
  let owned = true; const held = engine(112);
  holdFunnestPriceAxisWidth(held, () => owned, 96);
  held.priceAxisWidth = 88; assert.equal(held.priceAxisWidth, 112, 'the viewer-owned width is still never given back');
  owned = false; held.priceAxisWidth = 88; assert.equal(held.priceAxisWidth, 96);
  const legacy = engine(88); holdFunnestPriceAxisWidth(legacy, () => false); legacy.priceAxisWidth = 56;
  assert.equal(legacy.priceAxisWidth, 56, 'without a minimum the engine width passes through unchanged');
  for (const bad of [-1, NaN, Infinity, '96']) assert.throws(() => holdFunnestPriceAxisWidth(engine(56), () => false, bad), RangeError);
  assert.equal(ATLAS_PRICE_AXIS_MIN_WIDTH, 80);
});

test('instruments with different label widths share one gutter and keep the observed bars byte for byte', async () => {
  const gutters = [];
  for (const glyph of [6, 8, 9]) {
    await withNativeRuntime(async ({ container, settle, relayout }) => {
      const mounted = mountAtlasFunnestChart(container, { bars: sessionBars, symbol: 'MSTR', volume: false });
      try {
        await settle(80); await relayout(mounted, glyph);
        const layout = mounted.chart.layout;
        gutters.push(layout.width - layout.plotWidth);
        assert.deepEqual(mounted.getBars(), sessionBars, 'observed values are untouched by the axis width');
        assert.deepEqual(mounted.inspect().observations, sessionBars);
      } finally { mounted.destroy(); }
    });
  }
  assert.deepEqual(gutters, [ATLAS_PRICE_AXIS_MIN_WIDTH, ATLAS_PRICE_AXIS_MIN_WIDTH, ATLAS_PRICE_AXIS_MIN_WIDTH]);
  const unfloored = [];
  for (const glyph of [6, 9]) {
    await withNativeRuntime(async ({ container, settle, relayout }) => {
      const mounted = mountAtlasFunnestChart(container, { bars: sessionBars, symbol: 'MSTR', volume: false, minPriceAxisWidth: 0 });
      try { await settle(80); await relayout(mounted, glyph); unfloored.push(mounted.chart.layout.width - mounted.chart.layout.plotWidth); } finally { mounted.destroy(); }
    });
  }
  assert.ok(unfloored[1] > unfloored[0], 'without the minimum, a wider label still gives a wider gutter, which is the gap this closes');
});

test('resizing the chart canvas repaints before the next browser turn', async () => {
  await withNativeRuntime(async ({ container }) => {
    const mounted = mountAtlasFunnestChart(container, { bars: sessionBars.slice(0, 40), symbol: 'BTCUSD', volume: false });
    try {
      const chart = mounted.chart;
      let paints = 0;
      const original = chart.render.bind(chart);
      chart.render = () => { paints += 1; return original(); };
      const canvas = chart.mainLayer.canvas;
      canvas.width = 860;
      canvas.height = 480;
      assert.equal(paints, 0, 'both dimension writes clear the bitmap before either one should paint');
      let timerRan = false;
      setTimeout(() => { timerRan = true; }, 0);
      await Promise.resolve();
      assert.equal(paints, 1, 'the cleared canvas is painted before the browser can present it');
      assert.equal(timerRan, false, 'the repaint stays ahead of the next macrotask');
    } finally { mounted.destroy(); }
  });
});
