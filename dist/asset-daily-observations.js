import {utcDay} from './cycle-engine.js?v=1.29.0';

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive and finite`);
  return value;
}

export function readAssetDailyRows(history, asset, asOf) {
  if (asset === 'ETH' && history && !Array.isArray(history)) {
    if (history.product !== undefined && history.product !== 'ETH-USD') throw new TypeError('ETH history must be ETH-USD');
    if (history.dailyHistory && (history.source !== 'Coinbase Exchange' || history.product !== 'ETH-USD' || history.dailyHistory.source !== 'Coinbase Exchange' || history.dailyHistory.product !== 'ETH-USD' || history.dailyHistory.completedOnly !== true)) {
      throw new TypeError('ETH archive must contain completed Coinbase ETH-USD daily observations');
    }
    if (history.completedOnly === false) throw new TypeError('ETH history must contain completed daily observations');
  }
  const raw = Array.isArray(history) ? history : asset === 'BTC' ? history?.prices : history?.dailyHistory?.candles ?? history?.candles;
  if (!Array.isArray(raw) || !raw.length) throw new TypeError(`${asset} completed daily history is required`);
  const rows = [];
  let prior = null;
  for (let index = 0; index < raw.length; index++) {
    const row = raw[index], label = Array.isArray(row) ? row[0] : row?.date;
    if (typeof label !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(label)) throw new TypeError('Daily history requires ISO dates or UTC midnight labels');
    const date = label.slice(0, 10), epochDay = utcDay(date);
    if (prior !== null && epochDay <= prior) throw new RangeError('Daily history must be strictly chronological without duplicates');
    prior = epochDay;
    if (date > asOf) continue;
    if (!Array.isArray(row) && row.time !== undefined && row.time !== epochDay * 86400) throw new RangeError('Daily history timestamp conflicts with its date');
    const price = positive(Array.isArray(row) ? row[1] : row.close ?? row.price, `${asset} observed close`);
    rows.push({ date, price, epochDay });
  }
  if (rows.at(-1)?.date !== asOf) throw new RangeError(`${asset} requires an observed close on the exact asOf date`);
  return rows;
}

