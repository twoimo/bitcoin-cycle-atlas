import { parseEthArchive } from './eth-market-data.js?v=1.29.0';
import { EQUITIES, parseEquityArchive } from './equity-market-data.js?v=1.29.0';
import { createMarketDataController } from './market-data-controller.js?v=1.29.0';
import { isIntradayInterval } from './ohlc-data.js?v=1.29.0';
import { atlasCandlesToFunnestBars, mountObservedPriceChart } from './funnest-observed-price-adapter.js?v=1.36.7';
import { intervalShortLabel } from './interval-picker.js?v=1.0.0';
import { compactQuantity, renderChartSymbolLegend, signedChange, symbolLogo } from './chart-symbol-legend.js?v=1.0.0';

const PROFILES = {
  ETHUSD: { name: '이더리움', logo: 'ETH', source: 'Coinbase', product: 'ETH-USD', archive: './data/eth-ohlc.json', embedded: 'embedded-eth-data', kind: 'eth', timezone: 'UTC' },
  MSTR: { name: EQUITIES.MSTR.koreanName, logo: '', source: EQUITIES.MSTR.exchange, product: 'MSTR', archive: './data/mstr-ohlc.json', embedded: 'embedded-mstr-data', kind: 'equity', timezone: 'America/New_York' },
  BMNR: { name: EQUITIES.BMNR.koreanName, logo: '', source: EQUITIES.BMNR.exchange, product: 'BMNR', archive: './data/bmnr-ohlc.json', embedded: 'embedded-bmnr-data', kind: 'equity', timezone: 'America/New_York' },
};

function formatPrice(value) {
  if (!Number.isFinite(value)) return '';
  const digits = Math.abs(value) < 1 ? 4 : 2;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Swap the outlook plot to a real ETH or listed-equity series without leaving the page. */
export function mountOutlookSymbolChart({ plot, metrics, symbol, getState, onReady }) {
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

  function showStatus(text) {
    metrics.hidden = false;
    metrics.replaceChildren();
    const node = doc.createElement('div');
    node.className = 'chart-symbol-legend';
    node.textContent = `${profile.name} · ${intervalShortLabel(getState().frequency)} · ${text}`;
    metrics.append(node);
  }

  function paintLegend(bar, previous) {
    const close = Number(bar?.close), open = Number(bar?.open), high = Number(bar?.high), low = Number(bar?.low), volume = Number(bar?.volume);
    const changePct = previous && Number.isFinite(previous.close) && previous.close !== 0 && Number.isFinite(close) ? (close / previous.close - 1) * 100 : null;
    const absolute = previous && Number.isFinite(previous.close) && Number.isFinite(close) ? close - previous.close : null;
    let node = metrics.querySelector('.chart-symbol-legend');
    if (!node) { node = doc.createElement('div'); metrics.replaceChildren(node); }
    renderChartSymbolLegend(node, {
      name: profile.name, logo: symbolLogo(profile.logo), interval: intervalShortLabel(getState().frequency), source: profile.source,
      open: formatPrice(open), high: formatPrice(high), low: formatPrice(low), close: formatPrice(close),
      changeText: signedChange(changePct, absolute), volumeText: Number.isFinite(volume) ? compactQuantity(volume) : '',
      tone: changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat',
    });
    metrics.hidden = false;
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
          if (!bar || !currentSeries) { const last = currentSeries?.candles?.at(-1); if (last) paintLegend(last, currentSeries.candles.at(-2)); return; }
          const index = currentSeries.candles.findIndex(row => row.time * 1000 === bar.time);
          paintLegend(bar, index > 0 ? currentSeries.candles[index - 1] : null);
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

  return { sync, destroy() { destroyed = true; generation += 1; market?.cancel(); chart?.destroy(); host.remove(); } };
}
