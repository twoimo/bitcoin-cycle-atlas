import {utcDay,dateFromDay} from './cycle-engine.js?v=1.29.0';

const finite=(value,name)=>{if(!Number.isFinite(value)||value<0)throw new RangeError(`${name} must be finite and nonnegative`);return value;};
const fraction=(value,name)=>{finite(value,name);if(value>1)throw new RangeError(`${name} must be a fraction`);return value;};
export function liquidityUnits(pool){return pool.liquidUnits+pool.stakedUnits+pool.rewardUnits+pool.exitQueue.reduce((sum,item)=>sum+item.units,0);}
/** The pool is an allocation of holdings, never a second source of assets. */
export function validateTreasuryLiquidity(pool,coinUnits){
  if(!pool||!Array.isArray(pool.exitQueue))throw new TypeError('Liquidity pool and exit queue are required');
  utcDay(pool.asOf);
  for(const key of ['liquidUnits','stakedUnits','rewardUnits','totalRewards','unlockedUnits','requestedExitUnits','slashedUnits'])finite(pool[key],`Liquidity ${key}`);
  for(const key of ['exitDelayDays','rewardDelayDays'])if(!Number.isSafeInteger(pool[key])||pool[key]<1||pool[key]>730)throw new RangeError('Liquidity delay must be 1–730 calendar days');
  if(pool.rewardAvailableAt!==null){utcDay(pool.rewardAvailableAt);if(pool.rewardAvailableAt<=pool.asOf)throw new RangeError('Liquidity reward availability must follow the current pool date');}
  if(pool.rewardUnits>0&&!pool.rewardAvailableAt)throw new RangeError('Liquidity rewards require an availability date');
  for(const item of pool.exitQueue){
    finite(item.units,'Liquidity queued units');utcDay(item.requestedAt);utcDay(item.availableAt);
    if(item.requestedAt>pool.asOf||item.availableAt<=pool.asOf||item.availableAt<=item.requestedAt)throw new RangeError('Liquidity exit dates are inconsistent');
  }
  const total=finite(liquidityUnits(pool),'Liquidity total');finite(coinUnits,'Coin holdings');
  if(Math.abs(total-coinUnits)>32*Number.EPSILON*Math.max(1,total,coinUnits))throw new RangeError('Coin holdings must reconcile with liquidity pools');
  return total;
}
export function createTreasuryLiquidity({coinUnits,stakedFraction=0,asOf,exitDelayDays=7,rewardDelayDays=7}={}){
  finite(coinUnits,'Coin holdings');fraction(stakedFraction,'Staked fraction');utcDay(asOf);
  for(const value of [exitDelayDays,rewardDelayDays])if(!Number.isSafeInteger(value)||value<1||value>730)throw new RangeError('Liquidity delay must be 1–730 calendar days');
  return {asOf,liquidUnits:coinUnits*(1-stakedFraction),stakedUnits:coinUnits*stakedFraction,rewardUnits:0,rewardAvailableAt:null,exitQueue:[],exitDelayDays,rewardDelayDays,
    totalRewards:0,unlockedUnits:0,requestedExitUnits:0,slashedUnits:0};
}
export function advanceTreasuryLiquidity(pool,{to,grossAnnualYield=0,advisoryFee=0,otherFee=0,slashingFraction=0}={}){
  const first=utcDay(pool.asOf),last=utcDay(to),elapsed=last-first;
  if(elapsed<0)throw new RangeError('Liquidity cannot move backwards');
  fraction(grossAnnualYield,'Staking yield');fraction(advisoryFee,'Advisory fee');fraction(otherFee,'Other fee');fraction(slashingFraction,'Slashing fraction');
  const next={...pool,asOf:to,exitQueue:pool.exitQueue.map(item=>({...item}))};
  const netRate=grossAnnualYield*(1-advisoryFee)*(1-otherFee);
  // Daily rate preserves the existing daily model. With no automatic restaking,
  // longer intervals sum daily cash rewards rather than compound the principal.
  const dailyReward=pool.stakedUnits*Math.expm1(Math.log1p(netRate)/365.25),reward=dailyReward*elapsed;
  const released=next.exitQueue.filter(item=>item.availableAt<=to).reduce((sum,item)=>sum+item.units,0);
  next.exitQueue=next.exitQueue.filter(item=>item.availableAt>to);next.liquidUnits+=released;next.unlockedUnits+=released;
  const firstSweep=pool.rewardAvailableAt?utcDay(pool.rewardAvailableAt):reward?first+1+pool.rewardDelayDays:null;
  if(firstSweep!==null&&firstSweep<=last){
    // A sweep precedes that day's accrual. Process all crossed sweeps without
    // restaking so one long step and daily steps retain the same availability.
    const pendingDays=dailyReward?(last-firstSweep)%pool.rewardDelayDays+1:0;
    next.liquidUnits+=pool.rewardUnits+dailyReward*(elapsed-pendingDays);
    next.rewardUnits=dailyReward*pendingDays;
    next.rewardAvailableAt=dailyReward?dateFromDay(last-pendingDays+pool.rewardDelayDays+1):null;
  }else{
    next.rewardUnits+=reward;
    next.rewardAvailableAt=firstSweep===null?null:dateFromDay(firstSweep);
  }
  next.totalRewards+=reward;
  if(slashingFraction){
    const loss=(next.stakedUnits+next.exitQueue.reduce((sum,item)=>sum+item.units,0))*slashingFraction;
    next.stakedUnits*=1-slashingFraction;
    next.exitQueue=next.exitQueue.map(item=>({...item,units:item.units*(1-slashingFraction)}));next.slashedUnits+=loss;
  }
  finite(liquidityUnits(next),'Liquidity total');return next;
}
export function requestTreasuryExit(pool,units){
  finite(units,'Requested exit units');
  const alreadyQueued=pool.exitQueue.reduce((sum,item)=>sum+item.units,0);
  const requested=Math.min(pool.stakedUnits,Math.max(0,units-alreadyQueued));
  if(!requested)return pool;
  const availableAt=dateFromDay(utcDay(pool.asOf)+pool.exitDelayDays),queue=pool.exitQueue.map(item=>({...item}));
  const existing=queue.find(item=>item.availableAt===availableAt);
  if(existing)existing.units+=requested;else queue.push({requestedAt:pool.asOf,availableAt,units:requested});
  return {...pool,stakedUnits:pool.stakedUnits-requested,exitQueue:queue,requestedExitUnits:pool.requestedExitUnits+requested};
}
export function addTreasuryCoins(pool,units,stakedFraction=0){
  finite(units,'Purchased coins');fraction(stakedFraction,'Staked purchase fraction');
  return {...pool,liquidUnits:pool.liquidUnits+units*(1-stakedFraction),stakedUnits:pool.stakedUnits+units*stakedFraction};
}
export function sellLiquidCoins(pool,units){
  finite(units,'Coins sold');
  if(units>pool.liquidUnits+1e-12*Math.max(1,pool.liquidUnits))throw new RangeError('Cannot sell staked, queued or unavailable reward units');
  return {...pool,liquidUnits:Math.max(0,pool.liquidUnits-units)};
}
export function liquiditySummary(pool){
  return {liquidUnits:pool.liquidUnits,stakedUnits:pool.stakedUnits,rewardUnits:pool.rewardUnits,
    queuedUnits:pool.exitQueue.reduce((sum,item)=>sum+item.units,0),nextAvailableAt:[pool.rewardAvailableAt,...pool.exitQueue.map(item=>item.availableAt)].filter(Boolean).sort()[0]??null,
    exitDelayDays:pool.exitDelayDays,rewardDelayDays:pool.rewardDelayDays,totalRewards:pool.totalRewards,slashedUnits:pool.slashedUnits};
}
