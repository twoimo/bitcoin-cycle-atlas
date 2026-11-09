import {CHART_INTERVALS, isIntradayInterval} from '../ohlc-data.js';
import {workspaceInstrument} from '../workspace-instruments.js';
import {observePageHeader} from './page-header-layout.js';

// Page context describes the selected source, independently of pointer quotes
// and their observation clocks. Each authored line remains visible in full.
const describe = (id, title, purpose, basis) => Object.freeze({id, title, purpose, basis, description:purpose + ' ' + basis});
export const ATLAS_PAGE_DESCRIPTIONS = Object.freeze({
  outlook: describe('outlook', '가격 차트', '선택 종목의 가격·지표를 봅니다.', 'Coin Metrics · 공개본 6시간 확인'),
  market: describe('market', '시장 분석', '성장·금리·심리 흐름을 살펴봅니다.', 'FRED·한은·Yahoo · 저장본·수동 갱신'),
  evidence: describe('evidence', '리서치', '원문 근거와 검토 요약을 읽습니다.', '공시·논문·기사 · 자료 게시 시 갱신'),
  data: describe('data', '자산 비교', '자산별 등락과 가격 위치를 비교합니다.', '종목별 일별 종가 · 수동 갱신'),
  ipo: describe('ipo', '공모주', '수요예측·청약 일정을 확인합니다.', 'KST 보존 일정 · 새로고침 시 확인'),
  relay: describe('relay', '릴레이 콘텐츠', '채널별 메시지와 발행물을 읽습니다.', 'RelayDeck 보존본 · 수동 갱신'),
  compare: describe('compare', '사이클 비교', '기준일로 과거·현재 사이클을 비교합니다.', 'UTC 일별 종가 · 공개본 6시간 확인'),
});

function sourceLabel(value) {
  const text = typeof value === 'string' ? value : value?.name || value?.label || value?.provider || '';
  if (typeof text !== 'string') return '';
  const providers = [['Coin Metrics',/coin\s*metrics/i],['Bitstamp',/bitstamp/i],['Coinbase',/coinbase/i],['Yahoo Finance',/yahoo/i],['Hyperliquid',/hyperliquid/i]];
  return providers.filter(([,pattern]) => pattern.test(text)).map(([label]) => label).join('·') || text.trim();
}

/**
 * A published-file check is not a provider collection schedule. The native BTC
 * app checks its published price/volume files every six foreground hours; the
 * static market/ETF app and other sources have explicit/manual loading.
 * @param {string | {id?: string}} page
 * @param {{symbol?: string, frequency?: string, chartType?: string, source?: unknown, retained?: boolean, refreshMode?: string, refreshIntervalMs?: number}} context
 */
export function atlasPageDescription(page, context = {}) {
  const id = typeof page === 'string' ? page : page?.id;
  // The page owns its description even when a previous chart symbol is retained.
  if (id === 'scenario') return describe('market', '시장 분석', '입력한 조건의 시장 변화를 비교합니다.', '사용자 가정 · 입력 변경 시 재계산');
  if (id === 'cashflow') return describe('market', '시장 분석', '가정에 따른 현금흐름을 계산합니다.', '사용자 입력 · 가정 변경 시 재계산');
  if (['market','market-us','market-kr'].includes(id)) {
    if (context.refreshMode !== 'poll') return ATLAS_PAGE_DESCRIPTIONS.market;
    const interval = Number(context.refreshIntervalMs ?? 60_000);
    const cadence = Number.isFinite(interval) && interval >= 60_000 && interval % 60_000 === 0 ? (interval / 60_000) + '분 재조회' : '화면 요청 시 확인';
    return describe('market', '시장 분석', ATLAS_PAGE_DESCRIPTIONS.market.purpose, 'FRED·한은·Yahoo · ' + cadence);
  }
  if (id === 'housing') return describe('outlook', '가격 차트', '지역별 아파트 가격·거래량을 봅니다.', '한국부동산원 월별 자료 · 수동 갱신');
  if (id === 'themes') return describe('outlook', '가격 차트', 'HYPE/USDC 현물과 근거를 봅니다.', 'Hyperliquid · 수동 갱신');
  if (id === 'compare') return context.retained
    ? describe('compare', '사이클 비교', ATLAS_PAGE_DESCRIPTIONS.compare.purpose, 'UTC 일별 종가 · 보존본·자동 갱신 없음')
    : ATLAS_PAGE_DESCRIPTIONS.compare;
  if (ATLAS_PAGE_DESCRIPTIONS[id] && id !== 'outlook') return ATLAS_PAGE_DESCRIPTIONS[id];

  const symbol = String(context.symbol || (id === 'rsi' ? 'TQQQ' : 'BTCUSD')).toUpperCase();
  const interval = CHART_INTERVALS.find(item => item.id === context.frequency);
  const purpose = interval ? interval.label + ' 가격·지표를 함께 봅니다.' : ATLAS_PAGE_DESCRIPTIONS.outlook.purpose;
  const intraday = isIntradayInterval(context.frequency || 'daily');
  const source = sourceLabel(context.source) || (symbol === 'BTCUSD'
    ? intraday ? 'Coinbase' : context.chartType === 'candles' ? 'Coin Metrics·Bitstamp' : 'Coin Metrics'
    : symbol === 'ETHUSD' ? 'Coinbase'
      : ['MSTR','BMNR','TQQQ','SOXL','233740'].includes(symbol) ? 'Yahoo Finance' : '종목별 관측 자료');
  const cadence = context.retained ? '보존본·자동 갱신 없음' : symbol === 'BTCUSD' && !intraday ? '공개본 6시간 확인' : '수동 갱신';
  return describe('outlook', '가격 차트', purpose, source + ' · ' + cadence);
}

export function mountPageDescription(document, {header, heading} = {}) {
  const query = new URLSearchParams(document.defaultView?.location?.search || '');
  const embedded = document.body.dataset.embedded === 'true' || query.get('embedded') === '1';
  if (embedded || !header || !heading) return {sync() {}, destroy() {}};
  const nativeSymbols = new Set(['BTCUSD','ETHUSD','MSTR','BMNR']);
  const canonicalSymbol = value => {
    const key = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return nativeSymbols.has(key) ? key : workspaceInstrument(key)?.symbol || '';
  };
  const querySymbol = canonicalSymbol(query.get('symbol'));
  const initialNative = nativeSymbols.has(document.body.dataset.market) ? document.body.dataset.market : nativeSymbols.has(querySymbol) ? querySymbol : 'BTCUSD';
  const nativeSymbol = () => nativeSymbols.has(document.body.dataset.market) ? document.body.dataset.market : initialNative;
  const nativeContexts = new Map([[initialNative, {symbol:initialNative, frequency:query.get('granularity') || 'daily', chartType:query.get('type') === 'candles' ? 'candles' : 'line'}]]);
  let activeSymbol = querySymbol || initialNative, centerContext = null, destroyed = false;
  const copy = document.createElement('div'), description = document.createElement('p');
  const purpose = document.createElement('span'), basis = document.createElement('span');
  purpose.setAttribute('data-page-purpose', '');basis.setAttribute('data-page-basis', '');
  description.id = 'atlas-page-description';description.className = 'atlas-page-description';
  description.append(purpose, document.createTextNode(' '), basis);
  heading.id = 'atlas-page-heading';heading.setAttribute('aria-describedby', description.id);
  copy.append(heading, description);header.append(copy);
  const headerLayout = observePageHeader(header);

  function currentSymbol() {
    const center = document.body.dataset.centerTool;
    if (!center) return nativeSymbol();
    const instrument = workspaceInstrument(activeSymbol);
    if (instrument?.page === center) return instrument.symbol;
    return ({rsi:'TQQQ', housing:'HOUSING-BUSAN', themes:'HYPE'})[center] || activeSymbol;
  }
  function sync() {
    if (destroyed) return;
    const page = document.body.dataset.page || 'outlook', chart = page === 'outlook';
    const center = chart ? document.body.dataset.centerTool : null;
    const symbol = currentSymbol();
    const context = center ? centerContext?.page === center && centerContext?.symbol === symbol ? centerContext : {symbol} : nativeContexts.get(symbol) || {symbol};
    const info = atlasPageDescription(center || page, {...context, symbol, retained:Boolean(document.getElementById('embedded-btc-data'))});
    if (heading.textContent !== info.title) heading.textContent = info.title;
    if (purpose.textContent !== info.purpose) purpose.textContent = info.purpose;
    if (basis.textContent !== info.basis) basis.textContent = info.basis;
    if (copy.dataset.pageIntro !== info.id) copy.dataset.pageIntro = info.id;
    const toolbar = chart ? document.querySelector('.atlas-canvas-heading') : null;
    if (toolbar) {
      copy.className = 'atlas-page-intro';copy.hidden = false;
      if (toolbar.nextElementSibling !== copy) toolbar.after(copy);
    } else {
      copy.className = 'atlas-shell-copy';copy.hidden = chart;
      if (copy.parentElement !== header) header.append(copy);
    }
    headerLayout.sync();
  }
  const onSymbol = event => {
    const symbol = canonicalSymbol(event.detail?.symbol);
    if (!symbol || destroyed) return;
    activeSymbol = symbol;
    if (centerContext?.symbol !== symbol) centerContext = null;
    sync();
  };
  const onNativeState = event => {
    if (destroyed || document.body.dataset.centerTool || (document.body.dataset.page || 'outlook') !== 'outlook') return;
    const detail = event.detail || {};
    // The original BTC controller predates explicit symbol payloads. The
    // ETH/equity controller now always supplies its owner; never reinterpret a
    // late BTC update or an unknown explicit owner as the current instrument.
    const symbol = detail.symbol == null ? 'BTCUSD' : canonicalSymbol(detail.symbol);
    if (!symbol || symbol !== nativeSymbol()) return;
    const previous = nativeContexts.get(symbol) || {symbol};
    const context = {...previous, symbol, frequency:detail.frequency || previous.frequency || 'daily', chartType:detail.chartType || previous.chartType || 'line'};
    if (symbol === 'BTCUSD') context.source = isIntradayInterval(context.frequency)
      ? sourceLabel(detail.marketSeries?.source) || 'Coinbase'
      : context.chartType === 'candles' ? 'Coin Metrics·' + (sourceLabel(detail.volumeMeta?.source) || 'Bitstamp') : 'Coin Metrics';
    else context.source = detail.source || previous.source;
    nativeContexts.set(symbol, context);sync();
  };
  const onPageContext = event => {
    const detail = event.detail, center = document.body.dataset.centerTool;
    if (destroyed || (document.body.dataset.page || 'outlook') !== 'outlook' || !center || detail?.page !== center || detail.symbol !== currentSymbol()) return;
    // Only the existing, validated center bridge emits this event. Never read
    // raw postMessage payloads or hover readouts as page-source authority.
    centerContext = {page:center, symbol:detail.symbol, frequency:detail.frequency, chartType:detail.chartType,
      ...(center === 'market-us' ? {refreshMode:detail.refreshMode, refreshIntervalMs:detail.refreshIntervalMs} : {})};sync();
  };
  const listeners = [['atlas:active-symbol', onSymbol], ['atlas:workbench-state', onNativeState], ['atlas:page-context', onPageContext]];
  for (const [name, listener] of listeners) document.addEventListener(name, listener);

  const workspace = document.querySelector('.workspace');
  const Observer = document.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = Observer ? new Observer(records => {
    const containsToolbar = node => node.nodeType === 1 && (node.matches('.atlas-canvas-heading') || node.querySelector('.atlas-canvas-heading'));
    if (records.some(record => record.attributeName === 'data-market' || [...record.addedNodes, ...record.removedNodes].some(containsToolbar))) sync();
  }) : null;
  if (workspace) observer?.observe(workspace, {childList:true, subtree:true});
  observer?.observe(document.body, {attributes:true, attributeFilter:['data-market']});
  sync();
  return {sync, destroy() {
    destroyed = true;observer?.disconnect();headerLayout.destroy();
    for (const [name, listener] of listeners) document.removeEventListener(name, listener);
    copy.remove();
  }};
}
