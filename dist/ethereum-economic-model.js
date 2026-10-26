/**
 * Experimental ETH economic return candidate. Never a production default.
 * Strict vintage receipts are required; retrospective prices alone cannot satisfy
 * point-in-time eligibility. Synthetic test fixtures are not economic evidence.
 */
const DAY_MS = 86400000;
const EIP_REF = '7372d10a457b29eceb02cd052345af165de1fb60';
const SPEC_REF = 'ff73f4dd90a8717b13ed5a52afa5c1af358259b5';
export const ETH_ECONOMIC_VERSION = 'eth-economic-ridge-4';
export const ETH_ECONOMIC_DEFAULTS = Object.freeze({
  windowDays: 28, maximumSnapshotAgeDays: 7, ridgeAlpha: 1,
  minimumTrainingLabels: 16, maximumHorizonDays: 180,
});
export const ETH_ECONOMIC_MAINNET_CLOCK = Object.freeze({
  genesisTime:1606824023,secondsPerSlot:12,slotsPerEpoch:32,
  capellaEpoch:194048,denebEpoch:269568,
  genesisAt:'2020-12-01T12:00:23.000Z',
  capellaAt:'2023-04-12T22:27:35.000Z',
  denebAt:'2024-03-13T13:55:35.000Z',
});
export const ETH_ECONOMIC_SOURCES = Object.freeze([
  {id:'mainnet-genesis',url:'https://github.com/eth-clients/mainnet/blob/8cad4805e9cb5aa5e8e74d30e3f5029a7f133372/README.md',blobSha:'074fe44aaaf9561208b029c91671e499dc0af2f9'},
  {id:'mainnet-fork-clock',url:'https://github.com/ethereum/consensus-specs/blob/'+SPEC_REF+'/configs/mainnet.yaml',blobSha:'3dadbd7433b69a45669cdd2459fee41653cd2ac1'},
  {id:'mainnet-epoch-clock',url:'https://github.com/ethereum/consensus-specs/blob/'+SPEC_REF+'/presets/mainnet/phase0.yaml',blobSha:'44030cc5b9c19b80cc72639ba348c226c34aa88e'},
  {id:'eip-1559',url:'https://github.com/ethereum/EIPs/blob/'+EIP_REF+'/EIPS/eip-1559.md',blobSha:'26a5b739e1661fc7599d4d3a4c35e004a72886e1'},
  {id:'eip-4844',url:'https://github.com/ethereum/EIPs/blob/'+EIP_REF+'/EIPS/eip-4844.md',blobSha:'de2e4a46ad93fc04e6fe3174dc6e90a3307bdb5f'},
  {id:'eip-3675',url:'https://github.com/ethereum/EIPs/blob/'+EIP_REF+'/EIPS/eip-3675.md',blobSha:'efa51f543490bd6643fa943fb963d762312bda2a'},
  {id:'eip-4895',url:'https://github.com/ethereum/EIPs/blob/'+EIP_REF+'/EIPS/eip-4895.md',blobSha:'81af3b60b632bc9c03513d1d137f25410e3f4d34'},
  {id:'eip-7691',url:'https://github.com/ethereum/EIPs/blob/'+EIP_REF+'/EIPS/eip-7691.md',blobSha:'2bbc7d20da59c7ceb85736a47b1c75d2afdcc7ef'},
  {id:'eip-7918',url:'https://github.com/ethereum/EIPs/blob/'+EIP_REF+'/EIPS/eip-7918.md',blobSha:'9f17abdd1956499ddef12848e75dd6eff0b601e8'},
  {id:'altair-rewards',url:'https://github.com/ethereum/consensus-specs/blob/'+SPEC_REF+'/specs/altair/beacon-chain.md',blobSha:'265b7e1d4b243c2b1bac21c9ca7c6445579fa7df'},
  {id:'electra-exits',url:'https://github.com/ethereum/consensus-specs/blob/'+SPEC_REF+'/specs/electra/beacon-chain.md',blobSha:'9a14039cfbfffea48d5bfde56dac977151fb6a0d'},
  {id:'beacon-reward-types',url:'https://github.com/ethereum/beacon-APIs/blob/79b9b05e354da4f80d8f18879871af6f0068108d/types/rewards.yaml',blobSha:'c5c0485d0e090d0c111f1d5f254cff444237f402'},
  {id:'beacon-block-rewards',url:'https://github.com/ethereum/beacon-APIs/blob/79b9b05e354da4f80d8f18879871af6f0068108d/apis/beacon/rewards/blocks.yaml',blobSha:'f28edd8d40bb4cc5ba784ebf04876b565a9d0190'},
  {id:'erc-4626-accounting',url:'https://github.com/ethereum/ERCs/blob/4891ba3b86d2058d0f472dbf1500af6bb056caf2/ERCS/erc-4626.md',blobSha:'41de5ab9c01119d0c2f6700860d1cc25a278cf06'},
]);
export const ETH_ECONOMIC_INPUT_SCHEMA = Object.freeze({
  priceRow: {
    required:['date','price','publishedAt','collectedAt','vintageId','sourceHash','sourceUrl'],
    date:'UTC day label; its close is not observable before the next UTC midnight.',
    price:'USD per ETH or USD per BTC; a single consistent venue/definition per series.',
  },
  snapshot: {
    required:['metricDefinitionVersion','l2UniverseId','stakingCohortId','stakingRewardAccounting','exitTimingUniverseId','exitTimingBasis','collateralUniverseId','collateralAccounting','observedThrough','windowDays','completeWindow','publishedAt','collectedAt','vintageId','sourceHash','sourceUrl','metricSourceUrls','metrics'],
    windowDays:28,
    metricDefinitionVersion:'eth-economic-input-3',
    l2UniverseId:'A fixed explicit rollup universe; a changed universe requires a separate model/data revision.',
    stakingCohortId:'A fixed measured validator/investor cohort; its earned rewards, costs and time-weighted eligible principal use the same scope.',
    stakingRewardAccounting:'earned-disjoint-28d-v1: consensus rewards/penalties, execution priority fees and MEV excluding those fees are mutually reconciled; costs are actual cohort expenses, not assumed APR haircuts.',
    exitTimingUniverseId:'A fixed universe of completed validator exits; its completion sample is distinct from the pending queue stock.',
    exitTimingBasis:'completed-request-to-execution-28d-v1: completedExitMedianWaitDays measures elapsed request-to-available-execution-balance time for exits completed during this window.',
    collateralUniverseId:'A fixed set of collateral protocols and backing adapters; maintain the same coverage and deduplication method across vintages.',
    collateralAccounting:'unique-underlying-disjoint-v1: native/wrapped-native and staking-claim backing units are each deduplicated and mutually disjoint; lending receipts, bridges, wrappers and reused claims are not extra underlying ETH.',
    observedThrough:'Last included UTC day; flow window is the 28 complete days ending here; stocks are measured at its end.',
    provenance:'All component releases must be no later than publishedAt; collectedAt is the actual capture time for these exact bytes. Preserve revisions as additional vintages.',
    metricSourceUrls:'A nonempty HTTPS source URL for every metric. The estimator checks presence and chronology, not source authenticity.',
    missing:'A missing metric, incomplete window, unknown release time or missing vintage receipt makes that origin unavailable. No zero imputation.',
    late:'Select only a fully observed vintage published and collected by issue time; the latest eligible closed window may be at most seven days old.',
  },
  metrics: {
    l1GasUsed:{unit:'gas/28 UTC days',definition:'All executed L1 gas, including rollup settlement transactions; a resource load measure, not user count.'},
    l2Transactions:{unit:'transactions/28 UTC days',definition:'Transactions on an explicitly fixed rollup universe; not distinct people or L1 settlement transactions.'},
    blobGasUsed:{unit:'blob gas/28 UTC days',definition:'Consumed blob gas, with protocol era and capacity changes retained in the source vintage.'},
    executionFeesEth:{unit:'ETH/28 UTC days',definition:'L1 execution fees, base plus priority, excluding blob fees; rollup L1 payments are already included.'},
    executionBurnEth:{unit:'ETH/28 UTC days',definition:'Execution base-fee burn, already contained in execution fees.'},
    blobFeesEth:{unit:'ETH/28 UTC days',definition:'Blob gas fees only, separate from the execution fee of a blob-carrying transaction.'},
    blobBurnEth:{unit:'ETH/28 UTC days',definition:'Blob fee burn; equal to blobFeesEth under the cited protocol accounting.'},
    consensusNetIssuanceEth:{unit:'ETH/28 UTC days',definition:'Consensus balance creation less consensus penalties/destruction; excludes deposits, withdrawals and execution fee transfers. May be negative.'},
    executionPowIssuanceEth:{unit:'ETH/28 UTC days',definition:'Ethereum mainnet canonical PoW block, ommer inclusion and ommer beneficiary rewards; excludes transaction fees and consensus issuance. The source receipt must identify the canonical block range, transition boundary and reward rules. Zero requires a sourced protocol-zero receipt, not missing-data imputation. Full UTC windows starting on or after 2022-09-16 must be zero; a mixed transition window retains its actual pre-transition issuance.'},
    supplyEth:{unit:'ETH at window end',definition:'Total ETH supply across execution and consensus accounting; staking does not subtract from total supply.'},
    stakedEth:{unit:'ETH at window end',definition:'Consensus staking balances including pending exits; not assumed economically illiquid if claims trade.'},
    exitQueueEth:{unit:'ETH at window end',definition:'Subset of stakedEth with queued exits; excludes already withdrawn balances.'},
    l2UserFeesEth:{unit:'ETH/28 UTC days',definition:'End-user fees collected by the same rollup universe, each execution/data/operator charge counted once; ETH converted fees require a dated conversion receipt.'},
    l2SettlementFeesEth:{unit:'ETH/28 UTC days',definition:'That universe paid to L1 execution plus blob fees, a subset of total L1 fees; never added again to executionFeesEth+blobFeesEth.'},
    stakingConsensusRewardsEth:{unit:'ETH/28 UTC days',definition:'Gross consensus rewards earned by the fixed staking cohort; not ideal/theoretical reward and not duplicated across total and component API fields.'},
    stakingConsensusPenaltiesEth:{unit:'ETH/28 UTC days',definition:'Consensus penalties and slashing destruction borne by that same cohort, as a nonnegative deduction.'},
    stakingPriorityFeesEth:{unit:'ETH/28 UTC days',definition:'Execution priority fees received by the cohort, separate from issuance and burn.'},
    stakingMevExcludingPriorityEth:{unit:'ETH/28 UTC days',definition:'Measured additional MEV payment to the cohort after removing priority fees already in stakingPriorityFeesEth; unknown decomposition is missing, not zero.'},
    stakingServiceFeesEth:{unit:'ETH/28 UTC days',definition:'Actual pool, operator and custody charges to the measured investors; count each charge once.'},
    stakingOperatingCostsEth:{unit:'ETH/28 UTC days',definition:'Actual remaining operating costs not already included in service fees; non-ETH expenses require a dated conversion receipt.'},
    averageRewardEligibleStakeEth:{unit:'time-weighted ETH over 28 UTC days',definition:'Average cohort principal exposed to the recorded rewards/penalties during the window; denominator and all return components share the same cohort.'},
    completedExitCount:{unit:'completed exits/28 UTC days',definition:'Number of eligible completed exits underlying the waiting-time statistic; zero does not imply zero waiting time.'},
    completedExitMedianWaitDays:{unit:'elapsed days per completed exit',definition:'Median request-to-execution-availability duration for the completed exit sample. It is not a forecast of pending exits and is completion-selection biased.'},
    uniqueNativeCollateralEth:{unit:'unique underlying ETH at window end',definition:'Native and wrapped-native ETH pledged within the fixed collateral universe after deduplicating lending receipts and reused claims.'},
    uniqueStakingClaimCollateralEth:{unit:'unique underlying ETH at window end',definition:'ETH backing pledged staking claims after recursive wrapper/receipt deduplication; exclude any backing unit already counted as native collateral.'},
  },
});
export const ETH_ECONOMIC_FEATURES = Object.freeze([
  {id:'l1Usage',formula:'log1p(l1GasUsed/28)',unit:'log gas/day',group:'usage'},
  {id:'l2Usage',formula:'log1p(l2Transactions/28)',unit:'log transactions/day',group:'usage'},
  {id:'blobDemand',formula:'log1p(blobGasUsed/28)',unit:'log blob gas/day',group:'usage'},
  {id:'l1FeeYield',formula:'(executionFeesEth+blobFeesEth)/supplyEth',unit:'ETH/ETH per 28 days',group:'fees'},
  {id:'netSupplyRate',formula:'(consensusNetIssuanceEth+executionPowIssuanceEth-executionBurnEth-blobBurnEth)/supplyEth',unit:'ETH/ETH per 28 days',group:'supply'},
  {id:'stakedShare',formula:'stakedEth/supplyEth',unit:'fraction',group:'staking'},
  {id:'exitQueueShare',formula:'exitQueueEth/supplyEth',unit:'fraction',group:'liquidity'},
  {id:'l2CaptureRatio',formula:'l2SettlementFeesEth/l2UserFeesEth',unit:'ratio, may exceed 1 if sequencers lose money',group:'capture'},
  {id:'ethBtcMomentum',formula:'log((ETH[t]/BTC[t])/(ETH[t-28]/BTC[t-28]))',unit:'past 28-day log return',group:'relative-strength'},
  {id:'btcMomentum',formula:'log(BTC[t]/BTC[t-28])',unit:'past 28-day log return',group:'btc-link'},
  {id:'netStakingYield',formula:'(stakingConsensusRewardsEth-stakingConsensusPenaltiesEth+stakingPriorityFeesEth+stakingMevExcludingPriorityEth-stakingServiceFeesEth-stakingOperatingCostsEth)/averageRewardEligibleStakeEth',unit:'earned net ETH/ETH per 28 days; may be negative',group:'staking-return'},
  {id:'completedExitWait',formula:'log1p(completedExitMedianWaitDays)',unit:'log elapsed days of completed exits',group:'withdrawal-liquidity'},
  {id:'uniqueCollateralShare',formula:'(uniqueNativeCollateralEth+uniqueStakingClaimCollateralEth)/supplyEth',unit:'fraction of unique underlying ETH',group:'collateral-demand'},
]);
export const ETH_ECONOMIC_EQUATIONS = Object.freeze({
  supply:'S[t+1]=S[t]+consensusNetIssuanceEth+executionPowIssuanceEth-executionBurnEth-blobBurnEth; PoW issuance includes canonical block and ommer subsidies before the transition. Deposits/withdrawals move balances and do not create supply.',
  fit:'For each h, minimize mean((y-alpha-z*beta)^2)+ridgeAlpha*sum(beta^2), with z standardized on that training set only; alpha is unpenalized.',
  ethTarget:'y=log(ETH[t+h]/ETH[t]); ETH forecast=ETH[asOf]*exp(alpha+z[asOf]*beta).',
  ratioTarget:'q=log((ETH[t+h]/BTC[t+h])/(ETH[t]/BTC[t])); ETH/BTC is estimated separately using the same lagged inputs.',
  interpretation:'Estimated predictive associations, not causal effects or a discounted cash-flow proof. Fee and supply features share accounting components; they are not added as independent revenues.',
  ablation:'Drop one feature and refit on the identical eligible training origins; report change in the current prediction, not out-of-sample importance.',
  sensitivity:'Coefficient times one training feature standard deviation, holding other transformed features fixed; not a causal native-unit shock.',
  stakingReturn:'Net staking yield is an earned 28-day cohort return, not annualized guaranteed APR, available cash or market-wide total issuance. Costs can make it negative.',
  exitLiquidity:'Completed-exit waiting time and pending exitQueueEth are distinct observations. No current queue clearance time is inferred from the completed sample.',
  collateral:'Unique underlying collateral is the disjoint union of native/wrapped-native ETH and ETH backing staking claims; it is not gross USD TVL or a sum of every receipt token.',
  tradability:'No LST tradability coefficient is inferred from backing conversion, staked share or a queue. A fixed asset basket with dated executable quotes, size, depth and redemption limits would need a separately reviewed model variant.',
  probability:'No confidence or probability interval is produced. A ridge fit alone does not calibrate probabilities.',
  longHorizon:'Only 30, 90 and 180 days are supported. No extrapolation of these fitted returns to 2030-2035.',
});

const metricNames=Object.keys(ETH_ECONOMIC_INPUT_SCHEMA.metrics);
const unavailable=(reason,extra={})=>({status:'unavailable',version:ETH_ECONOMIC_VERSION,predictions:[],training:null,coefficients:[],contributions:[],ablations:[],reason,...extra});
function day(date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new TypeError('UTC date must be YYYY-MM-DD');
  const ms=Date.parse(date+'T00:00:00.000Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date)throw new RangeError('Invalid UTC day');
  return ms/DAY_MS;
}
const dateOf=d=>new Date(d*DAY_MS).toISOString().slice(0,10);
function stamp(value,name){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw new TypeError(name+' requires an ISO timestamp with timezone');
  day(value.slice(0,10));
  if(Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)throw new TypeError(name+' has an invalid clock time');
  const time=Date.parse(value);
  if(!Number.isFinite(time))throw new TypeError(name+' is invalid');
  return time;
}
const url=value=>typeof value==='string'&&/^https:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(value);
function receipt(row,observationEnd){
  const published=stamp(row.publishedAt,'publishedAt'),collected=stamp(row.collectedAt,'collectedAt');
  if(published<observationEnd||collected<published)throw new RangeError('Receipt predates observation completion or public release');
  if(typeof row.vintageId!=='string'||!row.vintageId.trim()||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(row.sourceHash)||!url(row.sourceUrl))throw new TypeError('A vintageId, source hash and HTTPS source URL are required');
  return {published,collected,vintageId:row.vintageId,sourceHash:row.sourceHash,sourceUrl:row.sourceUrl};
}
function finite(value,name,nonnegative=true){
  if(!Number.isFinite(value)||(nonnegative&&value<0))throw new RangeError(name+' must be finite'+(nonnegative?' and nonnegative':''));
  return value;
}

/** UTC windows ending before activation cannot contain the later protocol action.
 * A window containing the activation instant may contain actual later activity.
 * Protocol zero is not a substitute for a missing measurement/source receipt.
 */
export function assertEthereumEconomicProtocolEra(metrics,observedThrough){
  const d=day(observedThrough),end=(d+1)*DAY_MS;
  if(!metrics||typeof metrics!=='object')throw new TypeError('Economic metrics required for protocol-era validation');
  if(end<=Date.parse(ETH_ECONOMIC_MAINNET_CLOCK.genesisAt)&&[
    'consensusNetIssuanceEth','stakedEth','exitQueueEth','stakingConsensusRewardsEth',
    'stakingConsensusPenaltiesEth','averageRewardEligibleStakeEth',
  ].some(name=>metrics[name]!==0))throw new RangeError('Consensus issuance and active staking cannot predate mainnet Beacon genesis');
  if(end<=Date.parse(ETH_ECONOMIC_MAINNET_CLOCK.denebAt)&&
    ['blobGasUsed','blobFeesEth','blobBurnEth'].some(name=>metrics[name]!==0))throw new RangeError('Blob activity and fees cannot predate mainnet Dencun');
  if(end<=Date.parse(ETH_ECONOMIC_MAINNET_CLOCK.capellaAt)&&metrics.completedExitCount!==0)throw new RangeError('Completed execution-layer withdrawals cannot predate mainnet Capella');
  if(d-27>=day('2022-09-16')&&metrics.executionPowIssuanceEth!==0)throw new RangeError('Execution PoW issuance must be zero for fully post-Merge mainnet windows');
}

/** Supply accounting remains usable independently of full-model readiness. */
export function ethereumEconomicNetSupplyRate(metrics){
  for(const key of ['consensusNetIssuanceEth','executionPowIssuanceEth','executionBurnEth','blobBurnEth','supplyEth'])finite(metrics?.[key],key,key!=='consensusNetIssuanceEth');
  if(!(metrics.supplyEth>0))throw new RangeError('Supply must be positive');
  return (metrics.consensusNetIssuanceEth+metrics.executionPowIssuanceEth-metrics.executionBurnEth-metrics.blobBurnEth)/metrics.supplyEth;
}

/** Optimistic protocol ceiling, never actual data, training evidence or readiness. */
export function assessEthereumEconomicFeasibility({asOf,horizons=[30,90,180]}={}){
  const d=day(asOf),firstPossibleOriginDate=ETH_ECONOMIC_MAINNET_CLOCK.capellaAt.slice(0,10);
  if(!Array.isArray(horizons)||!horizons.length||new Set(horizons).size!==horizons.length||horizons.some(h=>![30,90,180].includes(h)))throw new RangeError('Only distinct 30, 90, 180 day horizons are supported');
  const first=day(firstPossibleOriginDate),minimum=ETH_ECONOMIC_DEFAULTS.minimumTrainingLabels;
  return {
    version:'eth-economic-protocol-feasibility-1',asOf,firstPossibleOriginDate,
    capellaAt:ETH_ECONOMIC_MAINNET_CLOCK.capellaAt,optimisticUpperBound:true,
    actualEligibleLabels:null,independentMarketRegimes:null,provesInputReadiness:false,
    limitation:'Completed execution-layer exits are required. Earliest activation-day origin is only an optimistic bound; actual exits, complete observations and publication/collection receipts can make eligibility later. Nonoverlapping labels are not independent regimes.',
    horizons:horizons.map(horizonDays=>{
      const maximumPossibleMatureLabels=Math.max(0,Math.floor((d-first)/horizonDays));
      const firstMatureDay=first+minimum*horizonDays;
      return {horizonDays,minimumTrainingLabels:minimum,maximumPossibleMatureLabels,
        structurallyEnoughMatureLabels:maximumPossibleMatureLabels>=minimum,
        earliestPossibleAsOf:dateOf(firstMatureDay),
        earliestPossibleIssuedAt:new Date((firstMatureDay+1)*DAY_MS).toISOString()};
    }),
  };
}

function priceIndex(rows,asOfDay,cutoff,label){
  if(!Array.isArray(rows)||!rows.length)throw new TypeError(label+' daily prices are required');
  const index=new Map();
  for(const row of rows){
    if(!row||typeof row!=='object')throw new TypeError(label+' rows must carry vintage receipts');
    const d=day(row.date);
    if(d>asOfDay)continue;
    if(typeof row.publishedAt==='string'&&stamp(row.publishedAt,'publishedAt')>cutoff)continue;
    if(typeof row.collectedAt==='string'&&stamp(row.collectedAt,'collectedAt')>cutoff)continue;
    const evidence=receipt(row,(d+1)*DAY_MS),price=finite(row.price??row.close,label+' price');
    if(!(price>0))throw new RangeError(label+' prices must be positive');
    const versions=index.get(d)||[];
    const tied=versions.find(x=>x.evidence.published===evidence.published&&x.evidence.collected===evidence.collected);
    if(tied&&(tied.price!==price||tied.evidence.sourceHash!==evidence.sourceHash||tied.evidence.vintageId!==evidence.vintageId))throw new RangeError('Ambiguous price vintages at the same release and collection time');
    const same=versions.find(x=>x.evidence.vintageId===evidence.vintageId);
    if(same&&(same.price!==price||same.evidence.sourceHash!==evidence.sourceHash||same.evidence.published!==evidence.published||same.evidence.collected!==evidence.collected||same.evidence.sourceUrl!==evidence.sourceUrl))throw new RangeError('Conflicting price vintage identity or receipt timestamps');
    if(!same)versions.push({day:d,price,evidence});
    index.set(d,versions);
  }
  for(const versions of index.values())versions.sort((a,b)=>a.evidence.published-b.evidence.published||a.evidence.collected-b.evidence.collected);
  return index;
}
function priceAt(index,d,cutoff){
  const versions=index.get(d);
  if(!versions)return null;
  for(let i=versions.length-1;i>=0;i--)if(versions[i].evidence.published<=cutoff&&versions[i].evidence.collected<=cutoff)return versions[i];
  return null;
}
function completePrices(index,start,end,cutoff){
  for(let d=start;d<=end;d++)if(!priceAt(index,d,cutoff))return false;
  return true;
}
function snapshotsAtIssue(raw,asOfDay,cutoff){
  if(!Array.isArray(raw)||!raw.length)return [];
  const result=[],seen=new Map(),times=new Map(),universes=new Set();
  for(const snapshot of raw){
    if(!snapshot||typeof snapshot!=='object')throw new TypeError('Economic snapshot must be an object');
    const d=day(snapshot.observedThrough);
    if(d>asOfDay)continue;
    if(typeof snapshot.publishedAt==='string'&&stamp(snapshot.publishedAt,'publishedAt')>cutoff)continue;
    if(typeof snapshot.collectedAt==='string'&&stamp(snapshot.collectedAt,'collectedAt')>cutoff)continue;
    const evidence=receipt(snapshot,(d+1)*DAY_MS);
    if(snapshot.metricDefinitionVersion!=='eth-economic-input-3')throw new TypeError('The versioned economic input definition is required');
    const scopes=['l2UniverseId','stakingCohortId','exitTimingUniverseId','collateralUniverseId'];
    if(scopes.some(key=>typeof snapshot[key]!=='string'||!snapshot[key].trim()))throw new TypeError('Fixed activity, staking, exit and collateral universes are required');
    if(snapshot.stakingRewardAccounting!=='earned-disjoint-28d-v1'||snapshot.exitTimingBasis!=='completed-request-to-execution-28d-v1'||snapshot.collateralAccounting!=='unique-underlying-disjoint-v1')throw new TypeError('Explicit nonduplicated reward, completed-exit and underlying-collateral accounting is required');
    universes.add(JSON.stringify(scopes.map(key=>snapshot[key])));
    if(universes.size>1)throw new RangeError('An economic measurement universe changed inside the eligible input dataset');
    if(snapshot.windowDays!==28||snapshot.completeWindow!==true)throw new RangeError('Economic snapshot requires one complete 28-day window');
    const m=snapshot.metrics;
    if(!m||typeof m!=='object')throw new TypeError('Economic metrics are required');
    for(const name of metricNames){
      finite(m[name],name,name!=='consensusNetIssuanceEth');
      if(!url(snapshot.metricSourceUrls?.[name]))throw new TypeError('Metric source URL missing: '+name);
    }
    assertEthereumEconomicProtocolEra(m,snapshot.observedThrough);
    if(!(m.supplyEth>0&&m.l2UserFeesEth>0))throw new RangeError('Supply and L2 user-fee denominator must be positive');
    if(m.stakedEth>m.supplyEth||m.exitQueueEth>m.stakedEth)throw new RangeError('Staking/exit stock accounting is inconsistent');
    if(!(m.averageRewardEligibleStakeEth>0))throw new RangeError('The staking return denominator must be positive');
    if(!Number.isSafeInteger(m.completedExitCount)||m.completedExitCount<1)throw new RangeError('Completed waiting-time observations require a positive completed-exit count');
    if(m.uniqueNativeCollateralEth+m.uniqueStakingClaimCollateralEth>m.supplyEth+64*Number.EPSILON*Math.max(1,m.supplyEth))throw new RangeError('Unique underlying collateral cannot exceed total ETH supply');

    const tol=1e-10*Math.max(1,m.executionFeesEth,m.blobFeesEth);
    if(m.executionBurnEth>m.executionFeesEth+tol||Math.abs(m.blobBurnEth-m.blobFeesEth)>tol)throw new RangeError('Fee and burn accounting is inconsistent');
    if(m.l2SettlementFeesEth>m.executionFeesEth+m.blobFeesEth+tol)throw new RangeError('Rollup L1 payments must be a subset of L1 fees');
    const key=d+'|'+evidence.vintageId,signature=JSON.stringify([metricNames.map(name=>m[name]),evidence.sourceHash,evidence.published,evidence.collected,evidence.sourceUrl,metricNames.map(name=>snapshot.metricSourceUrls[name])]);
    const timeKey=d+'|'+evidence.published+'|'+evidence.collected,timeValue=signature+'|'+evidence.vintageId;
    if(times.has(timeKey)&&times.get(timeKey)!==timeValue)throw new RangeError('Ambiguous economic vintages at the same release and collection time');
    times.set(timeKey,timeValue);
    if(seen.has(key)&&seen.get(key)!==signature)throw new RangeError('Conflicting economic vintage identity');
    if(!seen.has(key))result.push({day:d,metrics:m,evidence,scopes:Object.fromEntries(scopes.map(key=>[key,snapshot[key]]))});
    seen.set(key,signature);
  }
  return result.sort((a,b)=>a.day-b.day||a.evidence.published-b.evidence.published||a.evidence.collected-b.evidence.collected);
}
function economicAt(snapshots,d,cutoff){
  for(let i=snapshots.length-1;i>=0;i--){
    const s=snapshots[i];
    if(s.day<=d&&s.day>=d-ETH_ECONOMIC_DEFAULTS.maximumSnapshotAgeDays&&s.evidence.published<=cutoff&&s.evidence.collected<=cutoff)return s;
  }
  return null;
}
function featureAt(eth,btc,snapshots,d,cutoff){
  const start=d-28;
  if(!completePrices(eth,start,d,cutoff)||!completePrices(btc,start,d,cutoff))return null;
  const s=economicAt(snapshots,d,cutoff);
  if(!s)return null;
  const e=priceAt(eth,d,cutoff),b=priceAt(btc,d,cutoff),e0=priceAt(eth,start,cutoff),b0=priceAt(btc,start,cutoff),m=s.metrics;
  const x=[
    Math.log1p(m.l1GasUsed/28),Math.log1p(m.l2Transactions/28),Math.log1p(m.blobGasUsed/28),
    (m.executionFeesEth+m.blobFeesEth)/m.supplyEth,
    ethereumEconomicNetSupplyRate(m),
    m.stakedEth/m.supplyEth,m.exitQueueEth/m.supplyEth,m.l2SettlementFeesEth/m.l2UserFeesEth,
    Math.log(e.price/e0.price)-Math.log(b.price/b0.price),Math.log(b.price/b0.price),
    (m.stakingConsensusRewardsEth-m.stakingConsensusPenaltiesEth+m.stakingPriorityFeesEth+m.stakingMevExcludingPriorityEth-m.stakingServiceFeesEth-m.stakingOperatingCostsEth)/m.averageRewardEligibleStakeEth,
    Math.log1p(m.completedExitMedianWaitDays),
    (m.uniqueNativeCollateralEth+m.uniqueStakingClaimCollateralEth)/m.supplyEth,
  ];
  if(x.some(value=>!Number.isFinite(value)))return null;
  return {x,eth:e.price,btc:b.price,snapshot:s,cutoff,day:d};
}
function solve(matrix,rhs){
  const n=rhs.length,a=matrix.map((row,i)=>[...row,rhs[i]]);
  for(let c=0;c<n;c++){
    let p=c;
    for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;
    if(!Number.isFinite(a[p][c])||Math.abs(a[p][c])<1e-12)throw new RangeError('Regression system is singular');
    [a[c],a[p]]=[a[p],a[c]];
    const pivot=a[c][c];
    for(let j=c;j<=n;j++)a[c][j]/=pivot;
    for(let r=0;r<n;r++)if(r!==c){
      const f=a[r][c];
      for(let j=c;j<=n;j++)a[r][j]-=f*a[c][j];
    }
  }
  return a.map(row=>row[n]);
}
function ridge(samples,target,drop=-1){
  const n=samples.length,p=ETH_ECONOMIC_FEATURES.length,keep=Array.from({length:p},(_,i)=>i).filter(i=>i!==drop);
  const mean=Array.from({length:p},(_,j)=>samples.reduce((a,s)=>a+s.x[j],0)/n);
  const sd=mean.map((v,j)=>{
    const scale=Math.sqrt(samples.reduce((a,s)=>a+(s.x[j]-v)**2,0)/n);
    return scale>64*Number.EPSILON*Math.max(1,Math.abs(v))?scale:1;
  });
  const intercept=samples.reduce((a,s)=>a+s[target],0)/n;
  const a=keep.map(()=>keep.map(()=>0)),b=keep.map(()=>0);
  for(const s of samples){
    const z=keep.map(j=>(s.x[j]-mean[j])/sd[j]);
    for(let j=0;j<keep.length;j++){
      b[j]+=z[j]*(s[target]-intercept)/n;
      for(let k=0;k<keep.length;k++)a[j][k]+=z[j]*z[k]/n;
    }
  }
  for(let j=0;j<keep.length;j++)a[j][j]+=ETH_ECONOMIC_DEFAULTS.ridgeAlpha;
  const solution=solve(a,b),beta=Array(p).fill(0);
  keep.forEach((j,i)=>{beta[j]=solution[i];});
  const predict=x=>intercept+x.reduce((sum,v,j)=>sum+beta[j]*(v-mean[j])/sd[j],0);
  return {mean,sd,intercept,beta,predict};
}
function coefficientReceipt(model){
  return {
    interceptAtTrainingMean:model.intercept,
    rawFeatureIntercept:model.intercept-model.beta.reduce((sum,b,j)=>sum+b*model.mean[j]/model.sd[j],0),
    features:ETH_ECONOMIC_FEATURES.map((feature,j)=>({
      ...feature,trainingMean:model.mean[j],trainingSd:model.sd[j],
      coefficientPerTrainingSd:model.beta[j],coefficientPerTransformedUnit:model.beta[j]/model.sd[j],
    })),
  };
}

/** No output from this function is an authorization to promote a default model. */
export function buildEthereumEconomicCandidate({ethRows,btcRows,asOf,horizons=[30,90,180],economicSnapshots=[],issuedAt}={}){
  let feasibility=null;
  const blocked=(reason,extra={})=>unavailable(reason,{feasibility,...extra});
  try{
    const asOfDay=day(asOf),closeAt=(asOfDay+1)*DAY_MS;
    const cutoff=issuedAt===undefined?closeAt:stamp(issuedAt,'issuedAt');
    const issueLag=cutoff-closeAt;
    if(issueLag<0||issueLag>=DAY_MS)throw new RangeError('issuedAt must be within the UTC day after the asOf close');
    if(!Array.isArray(horizons)||!horizons.length||new Set(horizons).size!==horizons.length||horizons.some(h=>![30,90,180].includes(h)))throw new RangeError('Only distinct 30, 90, 180 day horizons are supported');
    feasibility=assessEthereumEconomicFeasibility({asOf,horizons});
    if(!Array.isArray(economicSnapshots)||!economicSnapshots.length)return blocked('No point-in-time economic snapshots; price-only data cannot activate economic inputs.',{asOf,issuedAt:new Date(cutoff).toISOString(),missingInputs:metricNames});
    const snapshots=snapshotsAtIssue(economicSnapshots,asOfDay,cutoff);
    const eth=priceIndex(ethRows,asOfDay,cutoff,'ETH'),btc=priceIndex(btcRows,asOfDay,cutoff,'BTC');
    const current=featureAt(eth,btc,snapshots,asOfDay,cutoff);
    if(!current)return blocked('The current origin lacks a complete lagged price window or an eligible economic vintage.',{asOf,issuedAt:new Date(cutoff).toISOString()});
    const first=Math.min(...eth.keys()),predictions=[],training=[],coefficients=[],contributions=[],ablations=[];
    for(const horizonDays of horizons){
      const samples=[];let considered=0,rejected=0;
      // Disjoint label interiors reduce pseudo-replication. Adjacent windows may
      // share one endpoint; economic dependence can still span those windows.
      for(let d=asOfDay-horizonDays;d>=first+28;d-=horizonDays){
        considered++;
        const originCutoff=(d+1)*DAY_MS+issueLag;
        const f=featureAt(eth,btc,snapshots,d,originCutoff),targetDay=d+horizonDays;
        if(!f||!completePrices(eth,d,targetDay,cutoff)||!completePrices(btc,d,targetDay,cutoff)){rejected++;continue;}
        const e=priceAt(eth,targetDay,cutoff),b=priceAt(btc,targetDay,cutoff);
        const y=Math.log(e.price/f.eth),ratioY=y-Math.log(b.price/f.btc);
        if(!Number.isFinite(y)||!Number.isFinite(ratioY)){rejected++;continue;}
        samples.push({x:f.x,y,ratioY,originDate:dateOf(d),targetDate:dateOf(targetDay),snapshotVintage:f.snapshot.evidence.vintageId,snapshotHash:f.snapshot.evidence.sourceHash});
      }
      samples.reverse();
      const info={
        horizonDays,consideredOrigins:considered,rejectedOrigins:rejected,eligibleOrigins:samples.length,
        minimumTrainingLabels:ETH_ECONOMIC_DEFAULTS.minimumTrainingLabels,
        protocolFeasibility:feasibility.horizons.find(row=>row.horizonDays===horizonDays),
        firstOrigin:samples[0]?.originDate??null,lastOrigin:samples.at(-1)?.originDate??null,
        maximumLabelDate:samples.at(-1)?.targetDate??null,labelWindowsOverlap:false,
        adjacentWindowsShareEndpoint:true,independentMarketRegimes:null,
        origins:samples.map(({originDate,targetDate,snapshotVintage,snapshotHash})=>({originDate,targetDate,snapshotVintage,snapshotHash})),
        publicAndCollectedByOrigin:true,hyperparameterFit:false,
      };
      training.push(info);
      if(samples.length<ETH_ECONOMIC_DEFAULTS.minimumTrainingLabels){
        predictions.push({status:'unavailable',horizonDays,targetDate:dateOf(asOfDay+horizonDays),reason:'Insufficient eligible nonoverlapping mature labels ('+samples.length+').'});
        continue;
      }
      const model=ridge(samples,'y'),ratioModel=ridge(samples,'ratioY');
      const logReturn=model.predict(current.x),relativeLogReturn=ratioModel.predict(current.x);
      const price=current.eth*Math.exp(logReturn),ethBtcRatio=current.eth/current.btc*Math.exp(relativeLogReturn);
      if(!Number.isFinite(price)||price<=0||!Number.isFinite(ethBtcRatio)||ethBtcRatio<=0){
        predictions.push({status:'unavailable',horizonDays,targetDate:dateOf(asOfDay+horizonDays),reason:'Fitted prediction exceeds finite positive numeric range.'});continue;
      }
      predictions.push({
        status:'ready',horizonDays,targetDate:dateOf(asOfDay+horizonDays),price,ethBtcRatio,logReturn,relativeLogReturn,
        interval:null,probability:null,calibrated:false,defaultEligible:false,
        extrapolatedFeatures:ETH_ECONOMIC_FEATURES.filter((_,j)=>current.x[j]<Math.min(...samples.map(s=>s.x[j]))||current.x[j]>Math.max(...samples.map(s=>s.x[j]))).map(f=>f.id),
      });
      coefficients.push({horizonDays,ethUsd:coefficientReceipt(model),ethBtc:coefficientReceipt(ratioModel)});
      contributions.push({
        horizonDays,interpretation:'Additive fitted log-return components; associations, not causal attribution.',
        intercept:model.intercept,relativeIntercept:ratioModel.intercept,
        features:ETH_ECONOMIC_FEATURES.map((feature,j)=>({
          id:feature.id,value:current.x[j],
          logReturnContribution:model.beta[j]*(current.x[j]-model.mean[j])/model.sd[j],
          relativeLogReturnContribution:ratioModel.beta[j]*(current.x[j]-ratioModel.mean[j])/ratioModel.sd[j],
          sensitivity:{type:'one-training-SD conditional transformed-feature shift',logReturnChange:model.beta[j],priceMultiplier:Number.isFinite(Math.exp(model.beta[j]))?Math.exp(model.beta[j]):null},
        })),
      });
      ablations.push({
        horizonDays,interpretation:'Refits at identical origins; current-prediction sensitivity only, not out-of-sample variable importance.',
        features:ETH_ECONOMIC_FEATURES.map((feature,j)=>{
          const reduced=ridge(samples,'y',j),reducedRelative=ridge(samples,'ratioY',j);
          return {id:feature.id,logReturnWithoutFeature:reduced.predict(current.x),logReturnDifference:logReturn-reduced.predict(current.x),relativeLogReturnDifference:relativeLogReturn-reducedRelative.predict(current.x)};
        }),
      });
    }
    const ready=predictions.some(p=>p.status==='ready');
    return {
      status:ready?'ready':'unavailable',version:ETH_ECONOMIC_VERSION,asOf,issuedAt:new Date(cutoff).toISOString(),
      predictions,training,coefficients,contributions,ablations,feasibility,
      reason:ready?null:'No horizon has enough eligible mature labels.',
      currentInput:{scopes:current.snapshot.scopes,completedExitCount:current.snapshot.metrics.completedExitCount,snapshotDate:dateOf(current.snapshot.day),ageDays:asOfDay-current.snapshot.day,vintageId:current.snapshot.evidence.vintageId,sourceHash:current.snapshot.evidence.sourceHash,observedEthUsd:current.eth,observedEthBtc:current.eth/current.btc},
      method:{name:'direct-horizon-ridge',ridgeAlpha:ETH_ECONOMIC_DEFAULTS.ridgeAlpha,alphaOrigin:'fixed analyst regularization, not selected using future performance',featureCount:ETH_ECONOMIC_FEATURES.length,trainingStandardizationOnly:true,futureBtcRealizationUsedAsPredictor:false,relativeStrengthIsSeparateTarget:true,causalClaim:false,probability:null,calibrated:false,defaultEligible:false,outOfSamplePerformance:null},
      warnings:[
        'Receipt metadata is validated but external authenticity and completeness require independent source verification.',
        'Small nonoverlapping samples can still share market regimes and overlapping 28-day feature windows; count is not independent cycle count.',
        'Fee/usage variables are endogenous; fitted signs need not imply causal effects. No forced positive-price response.',
        'Staking return is cohort-specific and earned rather than immediately liquid. Completed withdrawal waits do not forecast current queue clearance.',
        'Collateral disjointness requires a source backing/claim reconciliation; aggregate totals alone cannot prove deduplication. Staking and collateral features can refer to the same economic units without adding them as new supply.',
        'No direct LST tradability coefficient is fitted. Backing conversion is not an executable liquidation price.',
        'Protocol specification revisions describe accounting, not a fixed future fee market or activation calendar.',
        'Observed UTC coin closes are not contemporaneous New York equity closes. An equity consumer must supply its own information cutoff.',
        'The same frozen candidate result must be used for ETH and BMNR; no default promotion or long-range extrapolation is authorized.',
      ],
    };
  }catch(error){
    if(error instanceof TypeError||error instanceof RangeError)return blocked(error.message,{asOf:typeof asOf==='string'?asOf:null});
    throw error;
  }
}
