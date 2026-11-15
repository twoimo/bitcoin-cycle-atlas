import { calculateRsiSeries, validateSeries } from './market-lab-math.js';

/** Price-only, long/cash experiment. Signals use the completed close and fills
 * use the next observed session's close. No final liquidation is invented. */
export function backtestRsi(prices, options) {
  validateSeries(prices, { positive:true });
  const { start, end, capital, buy, sell, feeBps } = options || {};
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
  if (!day(start) || !day(end) || start > end || !Number.isFinite(capital) || capital <= 0 || capital > 1e12
    || !Number.isFinite(buy) || !Number.isFinite(sell) || buy < 0 || sell > 100 || buy >= sell
    || !Number.isFinite(feeBps) || feeBps < 0 || feeBps > 1000) throw new RangeError('기간·자금·RSI 기준·수수료 범위를 확인하세요.');
  const all = calculateRsiSeries(prices,14,9), selected = all.filter(row => row.date >= start && row.date <= end);
  if (selected.length < 2 || !selected.some(row => row.rsi != null)) throw new RangeError('계산 가능한 RSI와 2개 이상의 완료 종가가 필요합니다.');
  const rate = feeBps / 10000, trades = [], equity = [];
  let cash = capital, quantity = 0, entryCost = 0, pending = null, peak = capital, maxDrawdown = 0, wins = 0, closed = 0;
  const offset = all.indexOf(selected[0]);
  for (let i = 0; i < selected.length; i++) {
    const row = selected[i];
    if (pending) {
      const side = pending.side;
      let fee, amount, pnl = null;
      if (side === 'Buy') {
        amount = cash / (1+rate); fee = amount*rate; quantity = amount/row.close; entryCost = cash; cash = 0;
      } else {
        amount = quantity*row.close; fee = amount*rate; cash = amount-fee; pnl = cash-entryCost; closed++; if (pnl > 0) wins++;
      }
      trades.push({ signalDate:pending.date, date:row.date, side, price:row.close, quantity, fee, pnl, equity:cash+ (side === 'Buy' ? quantity*row.close : 0) });
      if (side === 'Sell') quantity = 0;
      pending = null;
    }
    const value = cash+quantity*row.close;
    peak = Math.max(peak,value); maxDrawdown = Math.max(maxDrawdown,1-value/peak); equity.push([row.date,value]);
    const before = all[offset+i-1]?.rsi, current = row.rsi;
    if (before == null || current == null) continue;
    if (!quantity && before > buy && current <= buy) pending = {date:row.date,side:'Buy'};
    else if (quantity && before < sell && current >= sell) pending = {date:row.date,side:'Sell'};
  }
  const finalEquity = equity.at(-1)[1];
  const buyHold = capital/(1+rate)/selected[0].close*selected.at(-1).close;
  return { start:selected[0].date, end:selected.at(-1).date, sessions:selected.length, capital, finalEquity, returnPct:(finalEquity/capital-1)*100,
    buyHoldReturnPct:(buyHold/capital-1)*100, maxDrawdownPct:maxDrawdown*100, closedTrades:closed, winRatePct:closed ? wins/closed*100 : null,
    cash, quantity, pending, trades, equity, assumptions:{buy,sell,feeBps,execution:'next-observed-close',allocation:'all-in-long-or-cash',fractionalShares:true,finalLiquidation:false,dividends:false,taxes:false} };
}
