import type { Point } from '@atlas/contracts/market-lab';
export interface BacktestOptions { start:string; end:string; capital:number; buy:number; sell:number; feeBps:number }
export interface BacktestTrade { signalDate:string; date:string; side:'Buy'|'Sell'; price:number; quantity:number; fee:number; pnl:number|null; equity:number }
export interface BacktestResult {
  start:string; end:string; sessions:number; capital:number; finalEquity:number; returnPct:number; buyHoldReturnPct:number; maxDrawdownPct:number;
  closedTrades:number; winRatePct:number|null; cash:number; quantity:number; pending:{date:string;side:'Buy'|'Sell'}|null;
  trades:BacktestTrade[]; equity:Point[]; assumptions:{buy:number;sell:number;feeBps:number;execution:string;allocation:string;fractionalShares:boolean;finalLiquidation:boolean;dividends:boolean;taxes:boolean};
}
export function backtestRsi(prices:Point[],options:BacktestOptions):BacktestResult;
