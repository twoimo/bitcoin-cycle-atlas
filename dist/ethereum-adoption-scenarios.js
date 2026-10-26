/** Conditional accounting, not a fitted ETH price model. Every gas quantity
 * refers to L1 resources allocated to one settlement, including L2 batches. */
export function ethereumAgentDemand(input={}){
  const required=['paidRequestsPerDay','ethereumShare','settlementsPerRequest','l1DirectShare',
    'l1GasPerSettlement','l2L1GasPerSettlement','blobGasPerSettlement',
    'executionBaseFeeGwei','blobBaseFeeGwei','priorityFeeGwei','ethPriceUsd','workingBalanceDays'];
  for(const key of required)if(!Number.isFinite(input[key])||input[key]<0)throw new RangeError(key+' must be a finite nonnegative number');
  for(const key of ['ethereumShare','l1DirectShare'])if(input[key]>1)throw new RangeError(key+' must be in [0,1]');
  if(!(input.ethPriceUsd>0))throw new RangeError('ethPriceUsd must be positive');
  if(input.paidRequestsPerDay>1e15||input.settlementsPerRequest>1000||input.workingBalanceDays>3650)throw new RangeError('Agent accounting scenario exceeds its explicit input budget');
  const p=input,N=365*p.paidRequestsPerDay*p.ethereumShare*p.settlementsPerRequest;
  const executionGas=p.l1DirectShare*p.l1GasPerSettlement+(1-p.l1DirectShare)*p.l2L1GasPerSettlement;
  const blobGas=(1-p.l1DirectShare)*p.blobGasPerSettlement;
  const annualExecutionBurnEth=N*executionGas*p.executionBaseFeeGwei*1e-9;
  const annualBlobBurnEth=N*blobGas*p.blobBaseFeeGwei*1e-9;
  const annualPriorityFeesEth=N*executionGas*p.priorityFeeGwei*1e-9;
  const annualBurnEth=annualExecutionBurnEth+annualBlobBurnEth;
  const annualL1FeesEth=annualBurnEth+annualPriorityFeesEth;
  const result={annualSettlements:N,annualExecutionBurnEth,annualBlobBurnEth,annualPriorityFeesEth,
    annualBurnEth,annualL1FeesEth,annualL1FeesUsd:annualL1FeesEth*p.ethPriceUsd,
    workingBalanceEth:annualL1FeesEth*p.workingBalanceDays/365,
    priceForecast:null,calibrated:false,observed:false,netSupplyChangeEth:null,
    meaning:'Incremental hypothetical L1 accounting; excludes existing traffic, L2 sequencer margin, facilitator fees and payment principal'};
  if(Object.values(result).some(x=>typeof x==='number'&&!Number.isFinite(x)))throw new RangeError('Agent accounting output overflow');
  return result;
}
