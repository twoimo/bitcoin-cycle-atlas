import { validateDataset } from './cycle-engine.js?v=1.29.0';
import { fetchLatestDataset } from './data-source.js?v=1.29.0';
import { fetchMarketCandles } from './ohlc-data.js?v=1.29.0';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = date => Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000);

/** Newest completed close in the bundle. Null when the archive has no dated rows. */
export function newestObservationDate(bundle) {
  let newest = null;
  for (const asset of bundle?.assets || []) {
    const date = asset?.prices?.at?.(-1)?.[0];
    if (DATE.test(date) && (!newest || date > newest)) newest = date;
  }
  return newest;
}

/**
 * Use the newest completed close when it is the caller's current clock and
 * that close is still inside the seven-day judgment window. An explicit
 * historical date, or an archive that is still older than that window, keeps
 * the caller's date so a stale close is not judged as current.
 */
export function comparisonModelDate(bundle, clockDate, { followLatest = false } = {}) {
  if (!followLatest || !DATE.test(clockDate)) return clockDate;
  const newest = newestObservationDate(bundle);
  if (!newest || newest > clockDate) return clockDate;
  const lag = dayNumber(clockDate) - dayNumber(newest);
  return lag <= 7 ? newest : clockDate;
}

function stamp(asset, prices) {
  const observed = new Set(prices.map(row => row[0]));
  const meta = { ...(asset.meta || {}) };
  if (Array.isArray(meta.missingDates)) meta.missingDates = meta.missingDates.filter(date => !observed.has(date));
  if (Array.isArray(meta.unavailableSessions)) meta.unavailableSessions = meta.unavailableSessions.filter(date => !observed.has(date));
  meta.lastDate = prices.at(-1)[0];
  meta.count = prices.length;
  meta.retrievedAt = new Date().toISOString();
  return { ...asset, prices, meta };
}

/** Append only the continuous completed tail. A gap keeps the last valid close. */
export function appendContinuousCloses(asset, closes, today) {
  const last = asset?.prices?.at?.(-1)?.[0];
  if (!DATE.test(last) || !DATE.test(today) || !Array.isArray(closes)) return asset;
  const calendar = asset.meta?.calendar === 'calendar-days';
  let expected = dayNumber(last);
  const prices = asset.prices.map(row => [row[0], row[1]]);
  const seen = new Set(prices.map(row => row[0]));
  for (const row of closes) {
    const date = row?.[0];
    const price = row?.[1];
    if (!DATE.test(date) || typeof price !== 'number' || !(price > 0) || date >= today || seen.has(date)) continue;
    const day = dayNumber(date);
    if (day <= expected) continue;
    if (calendar ? day !== expected + 1 : day - expected > 7) break;
    prices.push([date, price]);
    seen.add(date);
    expected = day;
  }
  return prices.length === asset.prices.length ? asset : stamp(asset, prices);
}

/** Replace Bitcoin with a newer gap-free series that still contains every archived date. */
export function replaceBitcoinCloses(asset, prices, today) {
  const first = asset?.prices?.[0]?.[0];
  const last = asset?.prices?.at?.(-1)?.[0];
  if (!DATE.test(first) || !DATE.test(last) || !DATE.test(today) || !Array.isArray(prices)) return null;
  const usable = prices.filter(row => DATE.test(row?.[0]) && typeof row[1] === 'number' && row[1] > 0 && row[0] < today);
  if (usable.length < 2) return null;
  validateDataset(usable);
  const start = usable.findIndex(row => row[0] === first);
  if (start < 0) return null;
  const series = usable.slice(start);
  if (series.at(-1)[0] <= last) return null;
  if (asset.meta?.calendar === 'calendar-days') {
    for (let index = 1; index < series.length; index += 1) {
      if (dayNumber(series[index][0]) - dayNumber(series[index - 1][0]) !== 1) return null;
    }
  }
  const dates = new Set(series.map(row => row[0]));
  if (asset.prices.some(row => !dates.has(row[0]))) return null;
  return stamp(asset, series.map(row => [row[0], row[1]]));
}

function readBitcoinCache(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.('btc-cycles-daily-v1') || 'null');
    if (!Array.isArray(parsed?.prices)) return null;
    validateDataset(parsed.prices);
    return parsed.prices;
  } catch {
    return null;
  }
}

async function extendBitcoin(asset, { storage, fetchImpl, today, bitcoinPrices }) {
  const cached = bitcoinPrices || readBitcoinCache(storage);
  const replaced = cached ? replaceBitcoinCloses(asset, cached, today) : null;
  if (replaced) return replaced;
  if (bitcoinPrices || fetchImpl !== globalThis.fetch) return asset;
  try {
    const next = await fetchLatestDataset({ signal: AbortSignal.timeout(8000) });
    return replaceBitcoinCloses(asset, next?.prices, today) || asset;
  } catch {
    return asset;
  }
}

async function extendEthereum(asset, { fetchImpl, now, today }) {
  const last = asset?.prices?.at?.(-1)?.[0];
  if (!DATE.test(last) || last >= today) return asset;
  const start = Date.parse(`${last}T00:00:00Z`) / 1000;
  const end = Math.floor(now.getTime() / 86400000) * 86400;
  if (!(end > start)) return asset;
  const result = await fetchMarketCandles({
    product: 'ETH-USD', interval: 'daily', start, end, now: now.getTime(), fetchImpl, allowEmpty: true,
    signal: AbortSignal.timeout(8000),
  });
  const closes = (result.candles || []).map(candle => [String(candle.date).slice(0, 10), candle.close]);
  return appendContinuousCloses(asset, closes, today);
}

async function extendHyperliquid(asset, { fetchImpl, today }) {
  const last = asset?.prices?.at?.(-1)?.[0];
  if (!DATE.test(last) || last >= today) return asset;
  const coin = typeof asset.meta?.product === 'string' && asset.meta.product.startsWith('@') ? asset.meta.product : '@107';
  const response = await fetchImpl('https://api.hyperliquid.xyz/info', {
    method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin, interval: '1d', startTime: Date.parse(`${last}T00:00:00Z`), endTime: Date.parse(`${today}T00:00:00Z`) },
    }),
  });
  if (!response.ok) throw new Error(`Hyperliquid candles HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new TypeError('Hyperliquid candles were not a list');
  const closes = rows.flatMap(candle => {
    const time = Number(candle?.t);
    const price = Number(candle?.c);
    if (!Number.isFinite(time) || !(price > 0)) return [];
    const date = new Date(time).toISOString().slice(0, 10);
    return DATE.test(date) ? [[date, price]] : [];
  }).sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  return appendContinuousCloses(asset, closes, today);
}

/** Extend BTC, ETH and HYPE to the latest completed close. A failed source keeps its archive. */
export async function extendComparisonToLatest(bundle, options = {}) {
  if (!bundle || !Array.isArray(bundle.assets)) return bundle;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now instanceof Date ? options.now : new Date();
  const bitcoinPrices = options.bitcoinPrices || null;
  let storage = options.storage;
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  const today = now.toISOString().slice(0, 10);
  const assets = await Promise.all(bundle.assets.map(async asset => {
    try {
      if (asset?.symbol === 'BTC') return await extendBitcoin(asset, { storage, fetchImpl, today, bitcoinPrices });
      if (asset?.symbol === 'ETH') return await extendEthereum(asset, { fetchImpl, now, today });
      if (asset?.symbol === 'HYPE') return await extendHyperliquid(asset, { fetchImpl, today });
      return asset;
    } catch {
      return asset;
    }
  }));
  return assets.some((asset, index) => asset !== bundle.assets[index]) ? { ...bundle, assets } : bundle;
}
