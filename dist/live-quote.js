// A separate live market print for traded chart headers. It does not enter the
// completed daily series, the forecast, or non-traded index charts.
const PRODUCTS = {
  BTCUSD: { kind: 'coinbase', product: 'BTC-USD', source: 'Coinbase BTC-USD', currency: 'USD' },
  ETHUSD: { kind: 'coinbase', product: 'ETH-USD', source: 'Coinbase ETH-USD', currency: 'USD' },
  HYPE: { kind: 'hyperliquid', coin: '@107', source: 'Hyperliquid @107 HYPE/USDC', currency: 'USDC' },
  MSTR: { kind: 'yahoo', symbol: 'MSTR', source: 'Yahoo Finance MSTR', currency: 'USD' },
  BMNR: { kind: 'yahoo', symbol: 'BMNR', source: 'Yahoo Finance BMNR', currency: 'USD' },
  TQQQ: { kind: 'yahoo', symbol: 'TQQQ', source: 'Yahoo Finance TQQQ', currency: 'USD' },
  SOXL: { kind: 'yahoo', symbol: 'SOXL', source: 'Yahoo Finance SOXL', currency: 'USD' },
  233740: { kind: 'yahoo', symbol: '233740.KS', source: 'Yahoo Finance 233740.KS', currency: 'KRW' },
};

const ALIASES = {
  '233740.KS': '233740',
  'KODEX 233740': '233740',
  'KODEX 코스닥150레버리지': '233740',
  '비트코인': 'BTCUSD',
  '이더리움': 'ETHUSD',
};

const NON_CHART_TOOLS = new Set(['data', 'market-us', 'market-kr', 'scenario', 'cashflow', 'ipo', 'evidence', 'relay', 'housing']);

export function normalizeQuoteSymbol(symbol) {
  const key = String(symbol ?? '').trim().toUpperCase();
  if (!key) return '';
  return ALIASES[key] || key;
}

export function liveQuoteRequest(symbol) {
  const key = normalizeQuoteSymbol(symbol);
  const item = Object.hasOwn(PRODUCTS, key) ? PRODUCTS[key] : null;
  if (!item) return null;
  if (item.kind === 'coinbase') {
    return { ...item, symbol: key, url: `https://api.exchange.coinbase.com/products/${item.product}/ticker` };
  }
  if (item.kind === 'hyperliquid') {
    return {
      ...item,
      symbol: key,
      url: 'https://api.hyperliquid.xyz/info',
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'allMids' }) },
    };
  }
  return { ...item, symbol: key, url: `https://query1.finance.yahoo.com/v8/finance/chart/${item.symbol}?interval=1m&range=1d` };
}

export function parseLiveQuote(kind, payload, now = Date.now()) {
  if (kind === 'yahoo') {
    const meta = payload?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const time = Number(meta?.regularMarketTime) * 1000;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time)) throw new TypeError('Yahoo quote is not a positive price');
    return { price, time };
  }
  if (kind === 'hyperliquid') {
    const price = Number(payload?.['@107'] ?? payload?.HYPE);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(now)) throw new TypeError('Hyperliquid mid is not a positive price');
    return { price, time: now };
  }
  const price = Number(payload?.price);
  const time = Date.parse(payload?.time);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time)) throw new TypeError('Coinbase ticker is not a positive price');
  return { price, time };
}

export function formatLivePrice(price, currency = 'USD') {
  if (currency === 'KRW') {
    return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(price))}원`;
  }
  const digits = price < 10 ? 4 : 2;
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(price);
  return currency === 'USDC' ? `${formatted} USDC` : `$${formatted}`;
}

export function mountLiveQuote(doc = document, { fetchImpl, intervalMs = 10000 } = {}) {
  if (!doc?.documentElement || typeof doc.createElement !== 'function') return () => {};
  const view = doc.defaultView || globalThis;
  const Observer = view.MutationObserver || globalThis.MutationObserver;
  const quote = doc.createElement('span');
  quote.className = 'workbench-live-quote';
  quote.hidden = true;
  quote.setAttribute('role', 'status');
  const priceNode = doc.createElement('b');
  const meta = doc.createElement('small');
  meta.textContent = '현재';
  quote.append(priceNode, meta);
  let timer = 0;
  let shown = '';
  let lastArmedSymbol = '';
  let requestId = 0;
  let stopped = false;
  const blockedSymbols = new Set();

  function activeSymbol() {
    const centerTool = doc.body?.dataset?.centerTool;
    if (centerTool && NON_CHART_TOOLS.has(centerTool)) return '';
    const page = doc.body?.dataset?.page;
    if (page && page !== 'outlook' && page !== 'compare') return '';
    const symbolEl = doc.querySelector('.workbench-symbol, .symbol-selector-trigger');
    const labelEl = symbolEl?.querySelector?.('.symbol-selector-label');
    const labelText = (labelEl?.textContent || symbolEl?.textContent || '').trim();
    if (/^(?:HOUSING|AXES)|아파트|부동산|주택/i.test(labelText)) return '';
    if (centerTool) {
      const urlSym = (() => {
        try { return new URLSearchParams(view.location?.search || '').get('symbol') || ''; }
        catch { return ''; }
      })();
      const sym = normalizeQuoteSymbol(urlSym || labelText || '');
      if (centerTool === 'themes') return sym === 'HYPE' ? sym : '';
      return sym;
    }
    return normalizeQuoteSymbol(labelText || doc.documentElement.dataset.symbol || 'BTCUSD');
  }

  function place() {
    const symbol = doc.querySelector('.workbench-symbol, .symbol-selector-trigger');
    if (!symbol) return false;
    if (!quote.isConnected || quote.parentElement !== symbol.parentElement) {
      symbol.insertAdjacentElement('afterend', quote);
    }
    return true;
  }

  async function tick() {
    if (stopped) return;
    const symbol = activeSymbol();
    const request = liveQuoteRequest(symbol);
    if (!request || blockedSymbols.has(request.symbol) || !place()) {
      shown = '';
      quote.hidden = true;
      return;
    }
    if (shown && shown !== request.symbol) {
      quote.hidden = true;
    }
    const id = ++requestId;
    let responseReceived = false;
    try {
      const fetchFn = fetchImpl || view.fetch;
      const options = request.init ? { cache: 'no-store', ...request.init } : { cache: 'no-store' };
      const response = await fetchFn(request.url, options);
      responseReceived = true;
      if (!response?.ok) throw new Error('Live quote request failed');
      const parsed = parseLiveQuote(request.kind, await response.json());
      if (stopped || id !== requestId || activeSymbol() !== request.symbol) return;
      priceNode.textContent = formatLivePrice(parsed.price, request.currency);
      quote.title = `${request.source} · ${new Date(parsed.time).toISOString()}`;
      quote.hidden = false;
      shown = request.symbol;
    } catch {
      if (request.kind === 'yahoo' && !responseReceived) blockedSymbols.add(request.symbol);
      if (!stopped && shown !== request.symbol) quote.hidden = true;
    }
  }

  function arm(delay) {
    view.clearTimeout(timer);
    if (stopped || doc.visibilityState === 'hidden') return;
    const request = liveQuoteRequest(activeSymbol());
    if (request && blockedSymbols.has(request.symbol)) return;
    const wait = typeof delay === 'number' ? delay : (quote.isConnected ? intervalMs : 400);
    timer = view.setTimeout(async () => {
      await tick();
      arm();
    }, wait);
  }

  function onContextChange() {
    if (stopped) return;
    const placed = place();
    const request = liveQuoteRequest(activeSymbol());
    if (!request || blockedSymbols.has(request.symbol)) {
      shown = '';
      lastArmedSymbol = '';
      quote.hidden = true;
      view.clearTimeout(timer);
      return;
    }
    if (shown && shown !== request.symbol) quote.hidden = true;
    if (placed && request.symbol !== lastArmedSymbol) {
      lastArmedSymbol = request.symbol;
      arm(0);
    }
  }

  const rootObserver = Observer ? new Observer(onContextChange) : null;
  rootObserver?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-symbol', 'data-boot'] });
  const bodyObserver = Observer && doc.body ? new Observer(onContextChange) : null;
  bodyObserver?.observe(doc.body, { attributes: true, attributeFilter: ['data-center-tool', 'data-page'] });
  const onVisibility = () => arm(0);
  doc.addEventListener?.('visibilitychange', onVisibility);
  doc.addEventListener?.('atlas:ready', onContextChange);
  doc.addEventListener?.('atlas:page-ready', onContextChange);
  place();
  arm(0);

  return () => {
    stopped = true;
    view.clearTimeout(timer);
    rootObserver?.disconnect();
    bodyObserver?.disconnect();
    doc.removeEventListener?.('visibilitychange', onVisibility);
    doc.removeEventListener?.('atlas:ready', onContextChange);
    doc.removeEventListener?.('atlas:page-ready', onContextChange);
    quote.remove();
  };
}
