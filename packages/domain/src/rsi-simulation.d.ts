import type { Point } from '@atlas/contracts/market-lab';
export interface RsiSimulationOptions {
  start:string; end:string; capital:number; confirmedThrough:string;
  feeBps?:number; weights?:[number,number]; updatedAt?:string|null;
}
export type RsiTranche = 1|2;
export type RsiSimulationState = 'flat'|'first'|'both'|'remaining';
export interface RsiPendingSignal { date:string; side:'Buy'|'Sell'; tranche:RsiTranche; level:number }
export interface RsiEntry {
  cycle:number; tranche:RsiTranche; signalDate:string; date:string; price:number;
  quantity:number; entryCost:number; entryFee:number;
}
export interface RsiHolding extends RsiEntry {
  marketValue:number; liquidationValue:number; unrealizedPnl:number; unrealizedReturnPct:number;
}
export interface RsiClosedTranche extends RsiEntry {
  exitSignalDate:string; exitDate:string; exitPrice:number; exitFee:number;
  proceeds:number; pnl:number; returnPct:number; holdingDays:number;
}
export interface RsiSimulationTrade {
  cycle:number; tranche:RsiTranche; side:'Buy'|'Sell'; threshold:number; signalDate:string;
  date:string; price:number; quantity:number; fee:number; pnl:number|null;
  returnPct:number|null; holdingDays:number|null; cash:number; equity:number;
}
export interface RsiNextTrigger {
  side:'Buy'|'Sell'; tranche:RsiTranche; level:number; difference:number|null; pending:boolean;
}
export interface RsiSimulationMetrics {
  closedTranches:number; wins:number; losses:number; breakeven:number; winRatePct:number|null;
  profitFactor:number|null; profitFactorStatus:'finite'|'no-closed-trades'|'no-losses'|'no-gains-or-losses';
  cashProfitFactor:number|null; expectancyPct:number|null; expectancy:number|null; averageHoldingDays:number|null;
  maxDrawdownPct:number|null; grossProfit:number; grossLoss:number; realizedPnl:number;
  ongoingTranches:number; ongoingCycles:number;
}
export interface RsiSimulationResult {
  status:'ready'|'insufficient'; start:string|null; end:string|null; sessions:number;
  requestedStart:string; requestedEnd:string; confirmedThrough:string; usedThrough:string|null;
  excludedUnconfirmed:number; excludedAfterEnd:number; updatedAt:string|null;
  capital:number; cash:number; finalEquity:number; returnPct:number;
  state:RsiSimulationState; holdings:RsiHolding[]; quantity:number; averageCost:number|null; averagePrice:number|null;
  currentPrice:number|null; currentRsi:number|null; unrealizedPnl:number; unrealizedReturnPct:number|null;
  pending:RsiPendingSignal[]; nextTriggers:RsiNextTrigger[]; trades:RsiSimulationTrade[];
  closed:RsiClosedTranche[]; equity:Point[]; metrics:RsiSimulationMetrics;
  assumptions:{version:string;entryLevels:number[];exitLevels:number[];weights:number[];feeBps:number;
    execution:string;signal:string;maxSignalsPerBar:number;gapPolicy:string;allocation:string;averageCost:string;
    unrealizedPnl:string;profitFactorBasis:string;expectancyBasis:string;drawdownBasis:string;holdingDays:string;
    reentry:string;fractionalShares:boolean;finalLiquidation:boolean;stopLoss:boolean;dividends:boolean;taxes:boolean;
    fx:boolean;period:number;signalPeriod:number;frequency:string};
}
export function simulateRsiTranches(prices:readonly Point[],options:RsiSimulationOptions):RsiSimulationResult;
