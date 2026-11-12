import {createTradingChart} from '@funnest/charts-ui';
import {createAtlasBtcDatafeed} from './atlas-datafeed.mjs';

// Replaced with exact committed snapshot identity by the isolated build.
const source = Object.freeze(__SPIKE_DATASET__);
const mount = document.getElementById('spike-chart');
const status = document.getElementById('spike-status');
const sourceLabel = document.getElementById('spike-source');
const events = [], errors = [], cleanup = [];
let widget, loading = true, finishPending = false, destroyed = false;
let phase = 'loading', initialPaintedReadyMs = null;
const record = (type, detail = null) => {
  events.push({type, at:performance.now(), detail:structuredClone(detail)});
  if (events.length > 1000) events.shift();
};
function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  errors.push(message); phase = 'error'; mount.setAttribute('aria-busy', 'true');
  status.textContent = '일봉을 표시하지 못했습니다. ' + message;
  record('error', message);
}
window.addEventListener('error', event => fail(event.error || event.message));
window.addEventListener('unhandledrejection', event => fail(event.reason));
const {datafeed, inspect} = createAtlasBtcDatafeed({
  async loadSnapshot() {
    const response = await fetch('./data/btc-volume.json', {cache:'no-store'});
    if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (digest !== source.sha256) throw new Error('Snapshot identity differs from the built candidate');
    return JSON.parse(new TextDecoder().decode(bytes));
  },
  onEvent(event) {
    record('datafeed:' + event.type, event);
    if (event.type === 'snapshot-error') fail(event.message);
  },
});
function currentChart() {
  if (!widget) return null;
  const chart = widget.chart, bars = chart.bars;
  return {
    symbol:chart.symbolInfo?.symbol || null, resolution:chart.currentResolution,
    type:chart.type, barCount:bars.length, firstTime:bars[0]?.time ?? null,
    lastTime:bars.at(-1)?.time ?? null, firstBar:bars[0] ? {...bars[0]} : null,
    lastBar:bars.at(-1) ? {...bars.at(-1)} : null,
    priceScale:chart.settings.priceScale, settings:{...chart.settings},
    indicators:chart.getIndicators(), drawings:chart.getDrawings(),
    drawingTool:chart.drawingTool, visibleRange:chart.getVisibleTimeRange(),
    layout:chart.layout, view:widget.save().view,
    quote:chart.quote, connection:chart.connection,
  };
}
function populated() {
  const chart = currentChart(), feed = inspect();
  return !destroyed && !loading && !errors.length && feed.status === 'ready' &&
    chart?.symbol === 'BTCUSD' && chart.resolution === '1D' && chart.barCount > 1 &&
    chart.firstTime >= source.firstTime && chart.lastTime === source.lastTime &&
    chart.layout.plotWidth > 0 && chart.layout.panesHeight > 0 &&
    [...mount.querySelectorAll('canvas')].some(canvas => canvas.width > 0 && canvas.height > 0 &&
      canvas.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
}
async function finishPaint() {
  if (finishPending || !populated()) return;
  finishPending = true;
  try {
    await document.fonts.ready;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    if (!populated()) return;
    phase = 'ready'; mount.removeAttribute('aria-busy');
    if (initialPaintedReadyMs === null) {
      initialPaintedReadyMs = performance.now();
      performance.mark('atlas-funnest-initial-painted-ready');
      record('painted-ready', {barCount:widget.chart.bars.length});
    }
    const p = inspect().provenance;
    status.textContent = `완료 일봉 ${p.bars.toLocaleString('ko-KR')}개 · ${p.lastDate}까지`;
    sourceLabel.textContent = `${p.source} · ${p.product} · ${p.firstDate}–${p.lastDate} UTC · 보관 자료`;
  } catch (error) { fail(error); }
  finally { finishPending = false; }
}

// Observer only: the native verifier reads state after real input. No chart,
// focus, scroll or data mutation API is exposed through this diagnostic handle.
Object.defineProperty(window, '__atlasFunnestSpike', {value:Object.freeze({
  read:() => structuredClone({status:phase, errors, source:{...source, provenance:inspect().provenance},
    datafeed:inspect(), chart:currentChart(), events,
    metrics:{initialPaintedReadyMs}, package:{ui:'0.6.16',core:'0.6.16'},
    realtime:false, productionIntegration:false}),
}), configurable:false, writable:false});

try {
  widget = createTradingChart(mount, {
    datafeed, symbol:'BTCUSD', resolution:'1D', locale:'ko', displayTimezone:'Asia/Seoul',
    colorScheme:'system', theme:{fontFamily:'var(--font)'},
    intervalGroups:[{id:'days',intervals:['1D']}], favoriteIntervals:['1D'],
    searchCategories:[{id:'all',label:{ko:'전체',en:'All'},match:() => true}],
    storageKey:null, attribution:false, symbolLogo:false, drawingToolbar:true, chartType:'candles',
    // A completed archive has no in-progress candle and no realtime countdown.
    settings:{countdown:false},
  });
  for (const type of ['dataChange','symbolChange','settingsChange','indicatorsChange','drawingsChange','drawingToolChange','visibleRangeChange','crosshairMove']) {
    cleanup.push(widget.chart.on(type, detail => { record(type, detail); void finishPaint(); }));
  }
  cleanup.push(widget.chart.on('loadingChange', value => {
    loading = value; record('loadingChange', value);
    if (value) { phase = 'loading'; mount.setAttribute('aria-busy','true'); }
    void finishPaint();
  }));
  cleanup.push(widget.chart.on('error', fail));
  const picker = document.getElementById('spike-color-scheme');
  picker.addEventListener('change', () => {
    const scheme = picker.value;
    if (!['system','light','dark'].includes(scheme)) return;
    document.documentElement.style.colorScheme = scheme === 'system' ? 'light dark' : scheme;
    widget.setColorScheme(scheme); record('theme-input', scheme);
  });
} catch (error) { fail(error); }
window.addEventListener('pagehide', () => {
  destroyed = true; for (const off of cleanup) off(); widget?.destroy();
}, {once:true});
