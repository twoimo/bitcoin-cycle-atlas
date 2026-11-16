import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { withChartSpacing,retargetChartRange } from '../../dist/chart-view-policy.js';
import { normalizePriceDomain } from '../../dist/price-axis.js';
import * as ohlc from '../../dist/ohlc-data.js';
import * as ethData from '../../dist/eth-market-data.js';
import * as ethState from '../../dist/eth-view-state.js';
import { readChartUrlState } from '../../dist/ui/chart-url-state.js';
import { nativeDateRange } from '../../dist/native-chart-workbench.js';
import {buildEthereumForecasts} from '../../dist/ethereum-forecast.js';
import {buildEthereumAdaptiveForecast} from '../../dist/ethereum-adaptive-model.js';
import {buildEthereumPooledForecast} from '../../dist/ethereum-pooled-model.js';
import {ethereumResearchPanel} from '../../dist/ethereum-research-panel.js';
import * as events from '../../dist/ethereum-events.js';
import * as eventHistory from '../../dist/ethereum-history.js';
import { createMarketDataController, marketStatusText } from '../../dist/market-data-controller.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatchEvent(event) {
    for (const callback of this.listeners.get(event.type) || []) callback(event);
    return true;
  }
}

class Node extends Surface {
  constructor() {
    super(); this.nodes = new Map(); this.dataset = {}; this.attrs = new Map();
    this.clientHeight = 600; this.isConnected = true; this.textContent = '';
    this.innerHTML = ''; this.open = false; this.hidden = false;
  }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Node());
    return this.nodes.get(selector);
  }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  getAttribute(name) { return this.attrs.get(name); }
  append(node) { this.nodes.set(node.id || `child-${this.nodes.size}`, node); }
  remove() { this.isConnected = false; }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent({ type: 'close' }); }
  closest(selector) {
    const attr = selector.match(/^\[data-eth-([\w-]+)\]$/)?.[1];
    const key = attr && `eth${attr.replace(/(^|-)([a-z])/g, (_, _dash, letter) => letter.toUpperCase())}`;
    return key && key in this.dataset ? this : null;
  }
}

// Small, valid OHLC fixtures go through the production archive and week parsers.
export function ethPayload(revision = 1) {
  const start = Date.parse('2026-09-01T00:00:00Z') / 1000, seconds = 86400;
  const candles = Array.from({ length: 53 }, (_, index) => {
    const time = start + index * seconds;
    return { time, date: new Date(time * 1000).toISOString(), open: 100 + revision,
      high: 103 + revision, low: 99 + revision, close: 101 + revision, volume: 10 };
  });
  const dailyHistory = { interval: 'daily', seconds, candles, product: 'ETH-USD', source: 'Coinbase Exchange',
    completedOnly: true, retrievedAt: `2026-10-24T${String(revision).padStart(2, '0')}:00:00.000Z`,
    requestedStart: start, requestedEnd: candles.at(-1).time + seconds };
  const hourly = { ...dailyHistory, interval: '1h', seconds: 3600,
    candles: Array.from({ length: 48 }, (_, index) => {
      const time = dailyHistory.requestedEnd - (48 - index) * 3600;
      return { ...candles[0], time, date: new Date(time * 1000).toISOString() };
    }) };
  return { version: 1, product: 'ETH-USD', source: 'Coinbase Exchange',
    retrievedAt: dailyHistory.retrievedAt, dailyHistory, intervals: { daily: dailyHistory, '1h': hourly } };
}

/** Execute the complete production initializer and inline boot script. Only
 * imports, HTTP, animation-frame, timer and DOM boundaries are injected; no
 * private function is extracted or rewritten. Requests deliberately permit late
 * success after abort so ownership cannot accidentally rely on browser abort.
 * With paint 'manual', each chart paint confirmation stays pending until the
 * test settles it, so a case can order it against other events. */
export async function ethViewFixture({ query = '', pathname = '/', paint = 'auto' } = {}) {
  const requests = [], liveRequests = [], frames = new Map(), timers = new Map(), draws = [], paints = [], emitted = [];
  const window = new Surface(), document = new Surface();
  const bootTimers = new Map(); let bootTimerId = 0;
  window.setTimeout = callback => { bootTimers.set(++bootTimerId, callback); return bootTimerId; };
  window.clearTimeout = id => bootTimers.delete(id);
  document.body = new Node(); document.activeElement = new Node(); document.documentElement = new Node();
  document.documentElement.dataset.boot = 'loading';
  const boot = new Map(['atlas-boot-shell', 'atlas-boot-status', 'atlas-boot-error', 'atlas-boot-retry'].map(id => [id, new Node()]));
  document.getElementById = id => boot.get(id) || null;
  document.querySelectorAll = selector => selector === '[data-boot-content]'
    ? [...document.body.nodes.values()].filter(node => 'bootContent' in node.dataset) : [];
  document.createElement = () => new Node(); document.fonts = { ready: Promise.resolve() };
  document.addEventListener('atlas:ready', () => emitted.push('atlas:ready'));
  let frameId = 0, timerId = 0, navigation, historyOptions, resize, workbenchUpdates = 0, workbenchOptions = null;
  const indicatorRect={left:12,top:18,right:112,bottom:48,width:100,height:30};
  const indicatorElement={hidden:true,getClientRects(){return this.hidden?[]:[indicatorRect];},getBoundingClientRect(){return indicatorRect;}};
  const mount = () => ({ cancel() {}, cancelPending() {}, destroy() {} });
  const fetchImpl = (url, options) => {
    const pending = deferred(); requests.push({ url, options, ...pending }); return pending.promise;
  };
  const barsToSeries = new WeakMap();
  const atlasCandlesToFunnestBars = series => { const bars=series.candles.map(row=>({...row,time:row.time*1000}));barsToSeries.set(bars,series);return bars; };
  const mountObservedPriceChart = (_plot,options) => {
    const record={...options,setAtlasRangeCalls:0,nativeRange:options.range?{from:options.range.start*1000,to:options.range.end*1000}:null,nativeMagnet:false,atlasMagnet:options.magnet||'off',chart:{layout:{plotWidth:554},setMagnet(value){record.nativeMagnet=value;},getVisibleTimeRange(){return record.nativeRange;}}};draws.push(record);
    // Like the runtime, one promise answers every ready() call until setData.
    let watch=null;
    const painted=()=>({painted:true,status:'ready',bars:record.series.candles.length});
    const ready=paint==='manual'?()=>watch??=new Promise((resolve,reject)=>paints.push({chart:record,resolve:()=>resolve(painted()),reject})):async()=>painted();
    return {chart:record.chart,ready,setData(bars){record.series=barsToSeries.get(bars);watch=null;},setRange(range){const start=range.from/1000,end=range.to/1000;if(record.range?.start!==start||record.range?.end!==end)record.range={...record.range,start,end};},setAtlasRange(range){record.setAtlasRangeCalls++;record.range=range;record.nativeRange={from:range.start*1000,to:range.end*1000};},setChartType(value){record.chartType=value;},setScale(value){record.scale=value;},setAtlasInteraction(value){record.interaction={...value};record.atlasMagnet=value.magnet;},setAtlasRows(rows){record.sourceRows=rows;},setPriceExtrema(value){record.priceDomain=value;},setAtlasOverlays(value){Object.assign(record,value);},addOverlay(){return {redraw(){},remove(){}};},destroy(){record.destroyed=true;}};
  };
  const deps = {
    withChartSpacing,retargetChartRange,normalizePriceDomain,readChartUrlState,nativeDateRange,mountObservedPriceChart,atlasCandlesToFunnestBars,
    mountNativeChartApp: app => document.body.append(app),
    // The real shell adapter is exercised separately with a parsed DOM. This
    // fixture owns network/loader races and keeps its DOM boundary explicit.
    mountNativeChartWorkbench: options => (workbenchOptions = options, {update(){workbenchUpdates++;},inspect(){},measure(){},beginGesture(){},endGesture(){},destroy(){}}),
    setLoadingSurface:(element,busy)=>element?.setAttribute('data-skeleton',String(busy)),
    ...ohlc, ...ethData, ...ethState, ...events, ...eventHistory, marketStatusText,buildEthereumForecasts,buildEthereumAdaptiveForecast,buildEthereumPooledForecast,ethereumResearchPanel,
    createMarketDataController: options => createMarketDataController({ ...options, fetchImpl }),
    fetchMarketCandles: options => {
      const pending = deferred(); liveRequests.push({ options, ...pending }); return pending.promise;
    },
    bindChartNavigation: options => { navigation = options; return { cancelGesture() {}, destroy() {}, update() {} }; },
    mountChartTouchTracking: mount, clearChartHover() {}, mountSymbolSelector: mount,
    // Inline replay owns a separate lifecycle, exercised by chart-replay-ui.test.mjs.
    mountChartReplay: () => ({isActive:()=>false,open(){},exit(){},destroy(){}}),
    bindPreservedArchiveDownload() {}, // DOM download behavior is verified separately.
    mountEthereumHistory: options => { historyOptions = options; return { update() {}, setSettings() {}, open() {}, destroy() {} }; },
    mountInstrumentIndicatorOverlay: () => ({ update() {}, destroy() {}, reserveHeight: () => 0, element: indicatorElement }),
  };
  const source = await readFile(process.env.ETH_VIEW_SOURCE || new URL('../../dist/eth-view.js', import.meta.url), 'utf8');
  const transformed = source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?\s*$/gm, (_, names) => `const {${names}} = __deps;`)
    .replace('export async function initEthView', 'async function initEthView');
  const location = { search: `?symbol=ETHUSD${query}`, pathname }, urlWrites = [];
  const context = vm.createContext({
    __deps: deps, document, window, URLSearchParams, AbortController, AbortSignal, Date, Intl,
    location, history: { replaceState(_state, _title, path) { urlWrites.push(String(path)); const next = new URL(path, 'https://atlas.test'); location.pathname = next.pathname; location.search = next.search; } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id), fetch: fetchImpl,
  });
  const html = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
  const bootSource = html.match(/<script id="atlas-boot-script">([\s\S]*?)<\/script>/)?.[1];
  if (!bootSource) throw new Error('Review the ETH fixture after a boot entry change');
  vm.runInContext(bootSource, context, { timeout: 1000 });
  vm.runInContext(`${transformed}\nglobalThis.start = initEthView;`, context, { timeout: 1000 });
  const initialization = context.start();
  const microtasks = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  const frame = async () => {
    const work = [...frames.values()]; frames.clear();
    for (const callback of work) callback(0);
    await microtasks();
  };
  const settle = async () => { for (let i = 0; i < 8; i++) { await microtasks(); if (frames.size) await frame(); } };
  const app = document.body.nodes.get('main');
  const click = (kind, value) => {
    const target = new Node(); target.dataset[`eth${kind[0].toUpperCase()}${kind.slice(1)}`] = value;
    app.dispatchEvent({ type: 'click', target });
  };
  return {
    requests, liveRequests, frames, timers, draws, paints, events: emitted, initialization, document, app, location, urlWrites, indicator:indicatorElement,indicatorRect,workbenchUpdates:()=>workbenchUpdates,workbench:()=>workbenchOptions,
    microtasks, frame, settle,
    reply: (index, payload) => requests[index].resolve({ ok: true, json: async () => payload }),
    reject: (index, message = 'Archive failed') => requests[index].reject(new Error(message)),
    replyCandles: (index, revision = 2) => {
      const url = new URL(requests[index].url), step = Number(url.searchParams.get('granularity'));
      const start = Date.parse(url.searchParams.get('start')) / 1000, end = Date.parse(url.searchParams.get('end')) / 1000;
      const rows = Array.from({ length: (end - start) / step }, (_, offset) => [start + offset * step, 99 + revision, 103 + revision, 100 + revision, 101 + revision, 10]);
      requests[index].resolve({ ok: true, json: async () => rows });
    },
    replyLive: (index, payload) => liveRequests[index].resolve(payload.dailyHistory),
    rejectLive: (index, message = 'Live refresh failed') => liveRequests[index].reject(new Error(message)),
    hide: (persisted = true) => window.dispatchEvent({ type: 'pagehide', persisted }),
    show: () => window.dispatchEvent({ type: 'pageshow', persisted: true }),
    resize: () => resize(), refresh: () => click('action', 'refresh'),
    interval: value => click('interval', value), span: value => click('span', value),
    // pan and priceRange call the Atlas navigation callbacks directly. The real
    // bindChartNavigation cannot deliver them once a chart is mounted, because
    // getRange then returns null. nativeRange is the zoom or pan a user still has.
    // The mount reports its new window unless it was destroyed.
    pan: range => navigation.onRangeChange(range), priceRange: range => navigation.onPriceRangeChange(range), navigationRange: () => navigation.getRange(),
    nativeRange: range => { const chart = draws.at(-1); if (chart.destroyed) return; chart.nativeRange = { from: range.start * 1000, to: range.end * 1000 }; chart.onViewport(chart.nativeRange); },
    paint: index => paints[index].resolve(),
    paintRejects: (index, message = 'Funnest chart did not paint within 5 seconds') => paints[index].reject(new Error(message)),
    focusEvent: id => historyOptions.onFocusEvent(id), latest: () => draws.at(-1),
    status: () => app.querySelector('#eth-status').textContent,
    info: () => { click('action', 'info'); return document.body.nodes.get('eth-data-dialog'); },
    forecastDialog: () => { click('action','forecast'); return document.body.nodes.get('eth-data-dialog'); },
    forecastSetting: (id,value) => document.body.nodes.get('eth-data-dialog').dispatchEvent({type:'change',target:{id,value,checked:value}}),
  };
}
