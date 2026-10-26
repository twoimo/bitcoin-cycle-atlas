// Explicitly synthetic mechanism fixtures. These are not published network data,
// observed forecast accuracy, vintage-validation receipts or a calibration sample.
// Starts after Dencun; long fixtures extend into a hypothetical future solely to
// test regression mechanics. Their mature labels are not present-day evidence.
export function fixture(count=3000){
  const day=86400000,start=Date.parse('2024-04-01T00:00:00Z'),date=i=>new Date(start+i*day).toISOString().slice(0,10);
  const sourceUrl='https://fixtures.invalid/synthetic-eth-economics';
  const ethRows=[],btcRows=[],economicSnapshots=[];
  for(let i=0;i<count;i++){
    const stamp=new Date(start+(i+1)*day).toISOString(),provenance={publishedAt:stamp,collectedAt:stamp,vintageId:'synthetic-'+i,sourceHash:'a'.repeat(64),sourceUrl};
    ethRows.push({date:date(i),price:1000*Math.exp(i*.00015+.1*Math.sin(i/47)+.03*Math.cos(i/17)),...provenance});
    btcRows.push({date:date(i),price:15000*Math.exp(i*.0001+.06*Math.sin(i/61)),...provenance});
    if(i>=27&&i%7===0){
      const metrics={
        l1GasUsed:1e9*(1+.2*Math.sin(i/33)),l2Transactions:4e7*(1+.3*Math.cos(i/51)),blobGasUsed:2e9*(1+.1*Math.sin(i/65)),
        executionFeesEth:20000*(1+.1*Math.cos(i/87)),executionBurnEth:10000*(1+.1*Math.cos(i/87)),blobFeesEth:1000*(1+.2*Math.sin(i/42)),blobBurnEth:1000*(1+.2*Math.sin(i/42)),
        consensusNetIssuanceEth:25000*(1+.1*Math.sin(i/79)),executionPowIssuanceEth:0,supplyEth:120e6,stakedEth:30e6+5e5*Math.sin(i/107),exitQueueEth:1e5*(1+.1*Math.sin(i/19)),
        l2UserFeesEth:5000*(1+.1*Math.cos(i/23)),l2SettlementFeesEth:3000*(1+.1*Math.sin(i/29)),
        stakingConsensusRewardsEth:10000*(1+.2*Math.sin(i/83)),stakingConsensusPenaltiesEth:200*(1+.1*Math.cos(i/37)),
        stakingPriorityFeesEth:2400*(1+.15*Math.sin(i/33)),stakingMevExcludingPriorityEth:900*(1+.2*Math.cos(i/57)),
        stakingServiceFeesEth:700*(1+.1*Math.sin(i/107)),stakingOperatingCostsEth:200*(1+.05*Math.cos(i/29)),
        averageRewardEligibleStakeEth:12e6+2e5*Math.sin(i/97),completedExitCount:50+i%17,completedExitMedianWaitDays:2+.8*Math.sin(i/71),
        uniqueNativeCollateralEth:8e6+5e5*Math.sin(i/43),uniqueStakingClaimCollateralEth:4e6+3e5*Math.cos(i/67),
      };
      economicSnapshots.push({
        metricDefinitionVersion:'eth-economic-input-3',l2UniverseId:'synthetic-rollups-fixed',
        stakingCohortId:'synthetic-staking-fixed',stakingRewardAccounting:'earned-disjoint-28d-v1',
        exitTimingUniverseId:'synthetic-completed-exits-fixed',exitTimingBasis:'completed-request-to-execution-28d-v1',
        collateralUniverseId:'synthetic-collateral-fixed',collateralAccounting:'unique-underlying-disjoint-v1',
        observedThrough:date(i),windowDays:28,completeWindow:true,...provenance,metrics,
        metricSourceUrls:Object.fromEntries(Object.keys(metrics).map(k=>[k,sourceUrl])),
      });
    }
  }
  return {ethRows,btcRows,economicSnapshots,asOf:date(count-1),horizons:[30,90,180]};
}

