import { calculateRsiSeries, validateSeries } from './market-lab-math.js';

const DAY = 86400000;
const ENTRY = [33.5, 29.5];
const EXIT = [40, 43];
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
const sum = (rows, read) => rows.reduce((value,row) => value + read(row), 0);

/**
 * Ordered two-tranche long/cash experiment, not an order sender.
 *
 * A new cycle starts on a completed downward crossing of RSI 33.5. Once a
 * tranche exists, its next state uses the completed RSI level: add at <=29.5,
 * sell tranche 1 at >=40, then sell tranche 2 at >=43. There is at most one
 * signal per completed bar. A gap over two levels therefore uses two separate
 * completed signal bars and two next-observed-close fills; a fresh recrossing
 * is not required for a level that became active after the first fill.
 *
 * `confirmedThrough` is mandatory: neither indicator warmup, signals, fills,
 * valuation nor metrics can consume observations after that source boundary.
 * Daily source bars, not display-frequency aggregates, must be supplied.
 */
export function simulateRsiTranches(prices, options) {
  validateSeries(prices, { positive:true });
  const {start,end,capital,confirmedThrough,updatedAt=null,feeBps=5,weights=[.5,.5]} = options || {};
  if (!validDay(start) || !validDay(end) || !validDay(confirmedThrough) || start > end
    || !Number.isFinite(capital) || capital <= 0 || capital > 1e12
    || !Number.isFinite(feeBps) || feeBps < 0 || feeBps > 1000
    || !Array.isArray(weights) || weights.length !== 2 || weights.some(value => !Number.isFinite(value) || value <= 0 || value >= 1)
    || Math.abs(weights[0]+weights[1]-1) > 1e-9
    || updatedAt !== null && (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)))) {
    throw new RangeError('기간·확정 봉 기준일·자금·분할 비중·편도 비용을 확인하세요.');
  }
  const through = end < confirmedThrough ? end : confirmedThrough;
  // Cut before indicator calculation: an unconfirmed tail cannot change RSI.
  const confirmed = prices.filter(([date]) => date <= through);
  const rows = calculateRsiSeries(confirmed,14,9);
  const selected = rows.filter(row => row.date >= start);
  const offset = rows.length-selected.length;
  const rate = feeBps/10000, allocations = [...weights];
  const trades = [], closed = [], equity = [], held = [null,null];
  let cash = capital, cycleCapital = 0, pending = null, peak = capital, maxDrawdown = 0, cycle = 0;
  const mark = price => cash+sum(held.filter(Boolean), position => position.quantity*price);

  for (let i=0; i<selected.length; i++) {
    const row = selected[i];
    if (pending) {
      const signal = pending, index = signal.tranche-1;
      let quantity, fee, pnl=null, returnPct=null, holdingDays=null;
      if (signal.side === 'Buy') {
        if (index === 0) { cycleCapital=cash; cycle++; }
        // Costs are included in each cycle's fixed allocation; no leverage or
        // cash raised by a partial sale is recycled before the cycle is flat.
        const budget = index === 1 ? cash : cycleCapital*allocations[0];
        const amount = budget/(1+rate);
        quantity=amount/row.close; fee=amount*rate; cash-=budget;
        held[index]={cycle,tranche:signal.tranche,signalDate:signal.date,date:row.date,price:row.close,
          quantity,entryCost:budget,entryFee:fee};
      } else {
        const position = held[index];
        quantity=position.quantity;
        const amount=quantity*row.close;
        fee=amount*rate;
        const proceeds=amount-fee;
        cash+=proceeds; pnl=proceeds-position.entryCost;
        returnPct=(proceeds/position.entryCost-1)*100;
        holdingDays=(Date.parse(row.date)-Date.parse(position.date))/DAY;
        closed.push({...position,exitSignalDate:signal.date,exitDate:row.date,exitPrice:row.close,exitFee:fee,
          proceeds,pnl,returnPct,holdingDays});
        held[index]=null;
        if (!held[0]&&!held[1]) cycleCapital=0;
      }
      trades.push({cycle,tranche:signal.tranche,side:signal.side,threshold:signal.level,signalDate:signal.date,
        date:row.date,price:row.close,quantity,fee,pnl,returnPct,holdingDays,cash,equity:mark(row.close)});
      pending=null;
    }
    const value=mark(row.close);
    peak=Math.max(peak,value);
    maxDrawdown=Math.max(maxDrawdown,1-value/peak);
    equity.push([row.date,value]);
    const previous=rows[offset+i-1]?.rsi,current=row.rsi;
    if (current===null || previous==null) continue;
    // State guards, rather than repeated independent threshold triggers,
    // prevent double entries, short sales and re-entry before the cycle ends.
    if (!held[0]&&!held[1] && previous>ENTRY[0]&&current<=ENTRY[0])
      pending={date:row.date,side:'Buy',tranche:1,level:ENTRY[0]};
    else if (held[0]&&!held[1] && current<=ENTRY[1])
      pending={date:row.date,side:'Buy',tranche:2,level:ENTRY[1]};
    else if (held[0] && current>=EXIT[0])
      pending={date:row.date,side:'Sell',tranche:1,level:EXIT[0]};
    else if (!held[0]&&held[1] && current>=EXIT[1])
      pending={date:row.date,side:'Sell',tranche:2,level:EXIT[1]};
  }

  const last=selected.at(-1),currentPrice=last?.close??null,currentRsi=last?.rsi??null;
  const holdings=held.filter(Boolean).map(position => {
    const marketValue=position.quantity*currentPrice;
    // HUD P&L includes paid entry costs and the declared hypothetical exit
    // cost; no exit transaction or closed-trade score is invented.
    const liquidationValue=marketValue*(1-rate);
    return {...position,marketValue,liquidationValue,unrealizedPnl:liquidationValue-position.entryCost,
      unrealizedReturnPct:(liquidationValue/position.entryCost-1)*100};
  });
  const quantity=sum(holdings,position=>position.quantity),entryCost=sum(holdings,position=>position.entryCost);
  const state=held[0]?(held[1]?'both':'first'):(held[1]?'remaining':'flat');
  const next=state==='flat'?[{side:'Buy',tranche:1,level:ENTRY[0]}]
    :state==='first'?[{side:'Buy',tranche:2,level:ENTRY[1]},{side:'Sell',tranche:1,level:EXIT[0]}]
    :state==='both'?[{side:'Sell',tranche:1,level:EXIT[0]}]
    :[{side:'Sell',tranche:2,level:EXIT[1]}];
  const nextTriggers=next.map(trigger=>({...trigger,difference:currentRsi===null?null:trigger.level-currentRsi,
    pending:pending?.side===trigger.side&&pending?.tranche===trigger.tranche}));
  const wins=closed.filter(position=>position.pnl>0),losses=closed.filter(position=>position.pnl<0);
  const gainReturns=sum(wins,position=>position.returnPct),lossReturns=-sum(losses,position=>position.returnPct);
  const grossProfit=sum(wins,position=>position.pnl),grossLoss=-sum(losses,position=>position.pnl);
  const n=closed.length,finalEquity=equity.at(-1)?.[1]??capital;
  const ready=selected.length>=2&&selected.some(row=>row.rsi!==null);
  return {
    status:ready?'ready':'insufficient',start:selected[0]?.date??null,end:last?.date??null,sessions:selected.length,
    requestedStart:start,requestedEnd:end,confirmedThrough,usedThrough:last?.date??null,
    excludedUnconfirmed:prices.filter(([date])=>date>confirmedThrough).length,
    excludedAfterEnd:prices.filter(([date])=>date>end&&date<=confirmedThrough).length,
    updatedAt,capital,cash,finalEquity,returnPct:(finalEquity/capital-1)*100,
    state,holdings,quantity,averageCost:quantity?entryCost/quantity:null,
    averagePrice:quantity?sum(holdings,position=>position.quantity*position.price)/quantity:null,
    currentPrice,currentRsi,unrealizedPnl:sum(holdings,position=>position.unrealizedPnl),
    unrealizedReturnPct:entryCost?sum(holdings,position=>position.unrealizedPnl)/entryCost*100:null,
    pending:pending?[pending]:[],nextTriggers,trades,closed,equity,
    metrics:{closedTranches:n,wins:wins.length,losses:losses.length,breakeven:n-wins.length-losses.length,
      winRatePct:n?wins.length/n*100:null,
      // Equal-notional net returns reproduce the supplied single-entry PF
      // reference independently of capital compounding or allocation size.
      profitFactor:lossReturns?gainReturns/lossReturns:null,
      profitFactorStatus:!n?'no-closed-trades':lossReturns?'finite':gainReturns?'no-losses':'no-gains-or-losses',
      cashProfitFactor:grossLoss?grossProfit/grossLoss:null,
      expectancyPct:n?sum(closed,position=>position.returnPct)/n:null,
      expectancy:n?sum(closed,position=>position.pnl)/n:null,
      averageHoldingDays:n?sum(closed,position=>position.holdingDays)/n:null,
      maxDrawdownPct:ready?maxDrawdown*100:null,grossProfit,grossLoss,realizedPnl:sum(closed,position=>position.pnl),
      ongoingTranches:holdings.length,ongoingCycles:holdings.length?1:0},
    assumptions:{version:'rsi-two-tranche-1',entryLevels:[...ENTRY],exitLevels:[...EXIT],weights:allocations,feeBps,
      execution:'next-confirmed-observed-close',signal:'initial-down-cross-then-active-state-level',maxSignalsPerBar:1,
      gapPolicy:'one-state-per-confirmed-bar',allocation:'cycle-start-cash-including-entry-cost',
      averageCost:'quantity-weighted-entry-cost-including-entry-fee',unrealizedPnl:'net-of-entry-and-assumed-exit-cost',
      profitFactorBasis:'equal-notional-net-tranche-returns',expectancyBasis:'mean-net-closed-tranche-return',
      drawdownBasis:'daily-mark-to-market-equity-after-paid-costs',holdingDays:'calendar-days-fill-to-fill',
      reentry:'only-after-all-tranches-close',fractionalShares:true,finalLiquidation:false,
      stopLoss:false,dividends:false,taxes:false,fx:false,period:14,signalPeriod:9,frequency:'daily'}
  };
}
