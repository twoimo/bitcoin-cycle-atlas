import { parseEthArchive } from './eth-market-data.js?v=1.29.0';
import { EQUITIES, parseEquityArchive } from './equity-market-data.js?v=1.29.0';
import { createMarketDataController } from './market-data-controller.js?v=1.29.0';
import { isIntradayInterval } from './ohlc-data.js?v=1.29.0';
import { atlasCandlesToFunnestBars, mountObservedPriceChart } from './funnest-observed-price-adapter.js?v=1.36.8';
import { intervalShortLabel } from './interval-picker.js?v=1.0.0';
import { compactQuantity, renderChartSymbolLegend, signedChange, symbolLogo } from './chart-symbol-legend.js?v=1.0.1';

const PROFILES = {
  ETHUSD: { name: '이더리움', logo: 'ETH', unit: 'ETH', source: 'Coinbase', product: 'ETH-USD', archive: './data/eth-ohlc.json', embedded: 'embedded-eth-data', kind: 'eth', timezone: 'UTC' },
  MSTR: { name: EQUITIES.MSTR.koreanName, logo: 'MSTR', unit: '주', source: EQUITIES.MSTR.exchange, product: 'MSTR', archive: './data/mstr-ohlc.json', embedded: 'embedded-mstr-data', kind: 'equity', timezone: 'America/New_York' },
  BMNR: { name: EQUITIES.BMNR.koreanName, logo: 'BMNR', unit: '주', source: EQUITIES.BMNR.exchange, product: 'BMNR', archive: './data/bmnr-ohlc.json', embedded: 'embedded-bmnr-data', kind: 'equity', timezone: 'America/New_York' },
};

function formatPrice(value) {
  if (!Number.isFinite(value)) return '';
  const digits = Math.abs(value) < 1 ? 4 : 2;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Swap the outlook plot to a real ETH or listed-equity series without leaving the page. */
export function mountOutlookSymbolChart({ plot, metrics, symbol, getState, onReady, onStatus }) {
  const profile = PROFILES[symbol];
  if (!profile || !plot || !metrics) throw new TypeError('Outlook symbol chart requires a known instrument and its plot');
  const doc = plot.ownerDocument;
  const host = doc.createElement('div');
  host.className = 'outlook-symbol-chart';
  plot.append(host);
  let destroyed = false, chart = null, archivePayload = null, currentSeries = null, shownKey = '', generation = 0, announced = false;
  const ready = () => { if (announced || destroyed) return; announced = true; onReady?.(); };
  const market = profile.kind === 'eth' ? createMarketDataController({
    product: 'ETH-USD', snapshotUrl: profile.archive, preferSnapshot: true,
    readEmbedded: () => doc.getElementById(profile.embedded)?.textContent || null,
    onChange: interval => {
      if (destroyed || getState().frequency !== interval) return;
      const entry = market.get(interval);
      if (entry.series) showSeries(entry.series);
    },
  }) : null;

  let marketClock = '';
  function studiesNode() {
    let list = plot.querySelector(':scope > .outlook-symbol-studies');
    if (list) return list;
    list = doc.createElement('div');
    list.className = 'chart-indicator-list outlook-symbol-studies';
    list.setAttribute('role', 'list');
    const row = doc.createElement('div');
    row.className = 'indicator-row';
    row.dataset.indicator = 'volume';
    row.dataset.visible = 'true';
    row.setAttribute('role', 'listitem');
    const name = doc.createElement('div');
    name.className = 'indicator-name';
    const label = doc.createElement('span');
    label.className = 'indicator-label';
    label.textContent = 'Vol';
    const value = doc.createElement('strong');
    value.className = 'indicator-value';
    name.append(label, value);
    row.append(name);
    list.append(row);
    plot.append(list);
    return list;
  }
  function paintStudies(volume) {
    const list = studiesNode();
    list.hidden = false;
    const value = list.querySelector('.indicator-value');
    if (Number.isFinite(volume) && volume >= 0) {
      value.textContent = `${compactQuantity(volume)} ${profile.unit}`;
      value.dataset.tone = 'neutral';
      value.title = `${profile.source} ${profile.product} 거래량`;
    } else {
      value.textContent = '선택일 없음';
      value.dataset.tone = 'muted';
      value.title = '선택한 날짜의 거래량은 없습니다.';
    }
  }
  function hideStudies() {
    const list = plot.querySelector(':scope > .outlook-symbol-studies');
    if (list) list.hidden = true;
  }
  function placeStack() {
    const top = Number.parseFloat(doc.defaultView.getComputedStyle(metrics).top);
    const legendTop = Number.isFinite(top) ? top : 8;
    const source = plot.querySelector(':scope > .workbench-market-info');
    const sourceTop = Math.ceil(legendTop + metrics.offsetHeight + 4);
    const sourceHeight = source && !source.hidden ? source.offsetHeight : 0;
    plot.style.setProperty('--source-top', `${sourceTop}px`);
    plot.style.setProperty('--indicator-top', `${sourceTop + (sourceHeight ? sourceHeight + 6 : 0)}px`);
  }
  const stackObserver = new ResizeObserver(() => placeStack());
  stackObserver.observe(metrics);
  const sourceNode = plot.querySelector(':scope > .workbench-market-info');
  if (sourceNode) stackObserver.observe(sourceNode);
  function clockText(bar) {
    const frequency = getState().frequency;
    const raw = String(bar?.date || '');
    const fromTime = !raw && Number.isFinite(Number(bar?.time)) ? new Date(Number(bar.time) > 1e12 ? Number(bar.time) : Number(bar.time) * 1000).toISOString() : raw;
    const shown = fromTime.slice(0, frequency === 'daily' || frequency === 'weekly' ? 10 : 16).replace('T', ' ');
    const kind = frequency === 'daily' ? '일말' : frequency === 'weekly' ? '주봉' : intervalShortLabel(frequency);
    const zone = profile.timezone === 'UTC' ? 'UTC' : 'ET';
    return shown ? `${profile.source} · ${kind} ${shown} ${zone}` : `${profile.source} · ${profile.product} · 완료된 관측`;
  }

  function showStatus(text) {
    metrics.hidden = false;
    hideStudies();
    metrics.replaceChildren();
    const node = doc.createElement('div');
    node.className = 'chart-symbol-legend';
    node.textContent = `${profile.name} · ${intervalShortLabel(getState().frequency)} · ${text}`;
    metrics.append(node);
    placeStack();
  }

  function paintLegend(bar, previous) {
    const close = Number(bar?.close), open = Number(bar?.open), high = Number(bar?.high), low = Number(bar?.low), volume = Number(bar?.volume);
    const changePct = previous && Number.isFinite(previous.close) && previous.close !== 0 && Number.isFinite(close) ? (close / previous.close - 1) * 100 : null;
    let node = metrics.querySelector('.chart-symbol-legend');
    if (!node) { node = doc.createElement('div'); metrics.replaceChildren(node); }
    renderChartSymbolLegend(node, {
      name: profile.name, logo: symbolLogo(profile.logo), interval: intervalShortLabel(getState().frequency), source: profile.source,
      close: formatPrice(close), changeText: signedChange(changePct, null),
      tone: changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat',
    });
    metrics.hidden = false;
    metrics.title = [profile.name, formatPrice(open) && `시 ${formatPrice(open)}`, formatPrice(high) && `고 ${formatPrice(high)}`, formatPrice(low) && `저 ${formatPrice(low)}`, formatPrice(close) && `종 ${formatPrice(close)}`, Number.isFinite(volume) ? `거래량 ${compactQuantity(volume)} ${profile.unit}` : ''].filter(Boolean).join(' · ');
    paintStudies(volume);
    marketClock = clockText(bar);
    onStatus?.(marketClock);
    placeStack();
  }

  function showSeries(series) {
    if (destroyed || !series?.candles?.length) return;
    currentSeries = series;
    const state = getState();
    const type = state.chartType === 'candles' ? 'candles' : 'line';
    const scale = state.scale === 'log' ? 'log' : 'normal';
    const seriesKey = `${profile.product}/${series.interval || state.frequency}/${series.candles.length}/${series.candles.at(-1).time}`;
    if (!chart) {
      chart = mountObservedPriceChart(host, {
        series, symbol: profile.product, currency: 'USD', timezone: profile.timezone, precision: 0, tickSize: 1,
        chartType: type, scale, accessibleName: `${profile.name} 가격 차트`, volume: true,
        source: { provider: profile.source, product: profile.product, interval: series.interval || state.frequency, timezone: profile.timezone },
        onViewport: () => {},
        onCrosshair: detail => {
          const bar = detail?.bar;
          const candles = currentSeries?.candles;
          if (!bar || !candles?.length) { const last = candles?.at(-1); if (last) paintLegend(last, candles.at(-2)); return; }
          const index = candles.findIndex(row => row.time * 1000 === bar.time);
          paintLegend(index >= 0 ? candles[index] : bar, index > 0 ? candles[index - 1] : null);
        },
        onError: error => { showStatus('가격 차트를 표시하지 못했습니다.'); metrics.title = String(error?.message || ''); ready(); },
      });
      chart.chart?.takeScreenshot?.();
    } else {
      if (shownKey !== seriesKey) chart.setData(atlasCandlesToFunnestBars(series), { preserveRange: false });
      chart.setChartType(type);
      chart.setScale(scale);
      chart.setInverted?.(Boolean(state.invertScale));
    }
    shownKey = seriesKey;
    const last = series.candles.at(-1);
    paintLegend(last, series.candles.at(-2));
    const when = String(series.lastDate || last.date || '').slice(0, 16).replace('T', ' ');
    metrics.title = `${profile.source} · ${profile.product} · ${when} UTC · 완료된 관측`;
    doc.title = `${profile.name} ${formatPrice(last.close)} · Bitcoin Cycle Atlas`;
    ready();
  }

  async function archive() {
    if (archivePayload) return archivePayload;
    const embedded = doc.getElementById(profile.embedded)?.textContent;
    if (embedded) return archivePayload = JSON.parse(embedded);
    const response = await fetch(profile.archive, { credentials: 'omit', cache: 'no-cache' });
    if (!response.ok) throw new Error(`${profile.name} 가격 자료 HTTP ${response.status}`);
    return archivePayload = await response.json();
  }

  async function sync() {
    const token = ++generation;
    const state = getState();
    try {
      if (profile.kind === 'eth' && isIntradayInterval(state.frequency)) {
        const prior = market.get(state.frequency);
        if (prior.status === 'idle' || prior.status === 'error') {
          showStatus('완료 봉을 불러오는 중입니다.');
          await market.load(state.frequency);
        }
        if (token !== generation || destroyed) return;
        const entry = market.get(state.frequency);
        if (!entry.series) { showStatus(entry.status === 'error' ? '완료 봉을 불러오지 못했습니다.' : '완료 봉을 불러오는 중입니다.'); if (entry.status === 'error') ready(); return; }
        showSeries(entry.series);
        return;
      }
      if (!archivePayload) showStatus('가격 자료를 불러오는 중입니다.');
      const payload = await archive();
      if (token !== generation || destroyed) return;
      const interval = state.frequency === 'weekly' ? 'weekly' : 'daily';
      showSeries(profile.kind === 'equity' ? parseEquityArchive(payload, { symbol, interval }) : parseEthArchive(payload, interval));
    } catch (error) {
      if (token !== generation || destroyed) return;
      showStatus('가격 자료를 표시하지 못했습니다.');
      metrics.title = String(error?.message || '');
      ready();
    }
  }

  return { sync, marketClock: () => marketClock, destroy() { destroyed = true; generation += 1; stackObserver.disconnect(); market?.cancel(); chart?.destroy(); host.remove(); plot.querySelector(':scope > .outlook-symbol-studies')?.remove(); } };
}
