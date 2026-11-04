import type { RsiRow } from '@atlas/domain/market-lab';
export interface RsiCrossing { date: string; side: 'Buy' | 'Sell'; level: string; rsi: number }
// Observed threshold crossings only. No position, quantity or order is inferred.
export function rsiCrossings(rows: readonly RsiRow[]): RsiCrossing[] {
  const result: RsiCrossing[] = [];
  for (let i = 1; i < rows.length; i++) {
    const before = rows[i-1].rsi, value = rows[i].rsi;
    if (before == null || value == null || !Number.isFinite(before) || !Number.isFinite(value)) continue;
    for (const side of ['Buy','Sell'] as const) {
      const levels = (side === 'Buy' ? [33.5,29.5] : [40,43]).filter(level => side === 'Buy' ? before > level && value <= level : before < level && value >= level);
      if (levels.length) result.push({ date: rows[i].date, side, level: levels.join(' / '), rsi: value });
    }
  }
  return result;
}
