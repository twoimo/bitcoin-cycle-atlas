/** Read-only evidence inventory. This does not construct or activate model snapshots. */
import {ETH_ECONOMIC_INPUT_SCHEMA,ETH_ECONOMIC_DEFAULTS,ETH_ECONOMIC_MAINNET_CLOCK} from './ethereum-economic-model.js';

export const ETH_ECONOMIC_EVIDENCE_VERSION='eth-economic-evidence-coverage-1';
const DAY=86400000,DEFINITION=ETH_ECONOMIC_INPUT_SCHEMA.snapshot.metricDefinitionVersion;
const BACKEND='567f60415e8b48eb84f7b08e1bd83c8ca99995bf';
const backend=path=>'https://github.com/growthepie/gtp-backend/blob/'+BACKEND+'/'+path;
const SOURCE={
  fees:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/fees-and-revenue/fees',
  issuance:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/supply/supply-issuance',
  supply:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/supply/current-supply',
  transactions:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/transactions/transactions',
  methodology:backend('docs/eth_asset_methodology.md'),
  staking:backend('backend/eim/adapters/adapter_eth_supply.py'),
  collateral:backend('backend/eim/adapters/adapter_eth_collateral.py'),
  blob:backend('backend/src/queries/postgres/da_metrics/ethereum_blob_base_fee.sql.j2'),
  txcount:backend('backend/src/queries/postgres/chain_metrics/select_txcount.sql.j2'),
  txregistry:backend('backend/src/queries/sql_queries.py'),
  rent:'https://docs.growthepie.com/metric-reference/metric-reference/rent-paid',
  eip1559:'https://eips.ethereum.org/EIPS/eip-1559',
  eip4844:'https://eips.ethereum.org/EIPS/eip-4844',
  eip3675:'https://eips.ethereum.org/EIPS/eip-3675',
  eip7918:'https://eips.ethereum.org/EIPS/eip-7918',
  beacon:'https://ethereum.github.io/beacon-APIs/',
};
function deepFreeze(value){for(const child of Object.values(value))if(child&&typeof child==='object')deepFreeze(child);return Object.freeze(value);}
const requirement=(gapCodes,requiredEvidence,sourceUrls,candidateRelation='unmeasured')=>({gapCodes,requiredEvidence,sourceUrls,candidateRelation});

/** Pinned code describes that version, not proof of the hosted deployment. */
export const ETH_ECONOMIC_EVIDENCE_REQUIREMENTS=deepFreeze({
  l1GasUsed:requirement(['rate-is-not-exact-gas','canonical-range-unverified'],
    ['Complete canonical UTC block range with integer gasUsed; retain missing blocks and reorg checks. A rounded Mgas/s conversion is a supplement.'],[SOURCE.methodology],'rate-derived'),
  l2Transactions:requirement(['l2-universe-not-fixed','filtered-transaction-scope'],
    ['Fixed chain identities and transaction inclusion policy for all 28 days; growthepie txcount filters positive gas_price or gas_used in the pinned query. Preserve per-chain missing days.'],[SOURCE.txcount,SOURCE.txregistry],'subset'),
  blobGasUsed:requirement(['blob-quantity-not-captured','fork-schedule-required'],
    ['Integer blobGasUsed for every included canonical block, including zero-blob blocks; retain fork and capacity changes.'],[SOURCE.eip4844,SOURCE.eip7918]),
  executionFeesEth:requirement(['total-fees-include-blobs','execution-blob-split-missing'],
    ['Sum gasUsed * effectiveGasPrice from execution receipts only; do not relabel total fees including blobs as execution fees.'],[SOURCE.fees,SOURCE.eip1559],'scope-mismatch'),
  executionBurnEth:requirement(['base-priority-split-missing'],
    ['Per-block baseFeePerGas * gasUsed in exact wei across the canonical UTC window; priority fees are transfers, not burn.'],[SOURCE.eip1559,SOURCE.fees],'subset'),
  blobFeesEth:requirement(['blob-fee-split-missing','noninteger-blob-formula'],
    ['Exact blobGasUsed * protocol integer blob base fee, or reconciled blob receipt fees, under the applicable fork schedule; TRUNC(EXP(...)) is not the integer fake_exponential algorithm.'],[SOURCE.blob,SOURCE.eip4844,SOURCE.eip7918],'scope-mismatch'),
  blobBurnEth:requirement(['blob-fee-split-missing','noninteger-blob-formula'],
    ['A verified blobFeesEth series supports the equal burn amount under the cited rule; equality is not permission to fill an unobserved amount with zero.'],[SOURCE.blob,SOURCE.eip4844],'scope-mismatch'),
  consensusNetIssuanceEth:requirement(['gross-versus-net','epoch-mean-not-utc-sum','historical-theoretical-fill'],
    ['Exact consensus creation minus all consensus destruction for the UTC window, excluding deposits/withdrawals and fee transfers.',
      'Pinned growthepie CL series has theoretical issuance for 2025-05-07 through 2026-01-01, an interpolated participation factor, and a two-day Shapella redistribution; current epoch-normalized hourly means also require boundary reconciliation.'],[SOURCE.issuance,SOURCE.staking,SOURCE.methodology],'scope-mismatch'),
  executionPowIssuanceEth:requirement(['protocol-zero-receipt-required'],
    ['Use the existing sourced EIP-3675 post-transition canonical-range receipt; never infer zero from absent IssTotNtv data. Retain provider-only canonical/finalized limitations.'],[SOURCE.eip3675]),
  supplyEth:requirement(['execution-consensus-supply-unreconciled'],
    ['Reconciled execution plus consensus supply at the exact window end, with deposits/withdrawals as transfers and a revision trail; do not subtract staked ETH.'],[SOURCE.supply,SOURCE.methodology],'scope-mismatch'),
  stakedEth:requirement(['active-balance-is-subset','stock-boundary-mismatch'],
    ['All contract-defined staking balances including pending exits at window end. Pinned growthepie active actual balance excludes nonactive balances; its fallback can be effective balance and daily data can use start_balance.'],[SOURCE.staking,SOURCE.methodology],'subset'),
  exitQueueEth:requirement(['pending-exit-stock-unmeasured'],
    ['Validator-status and actual-balance stock at the same end state; exclude withdrawn balances and avoid treating completed exits as the pending queue.'],[SOURCE.beacon]),
  l2UserFeesEth:requirement(['l2-universe-not-fixed','l2-fee-component-reconciliation','conversion-vintage-required'],
    ['Same fixed L2 universe as transactions and settlement; execution, data and operator user charges once each; dated native-token conversion where needed.'],['https://docs.growthepie.com/metric-reference/metric-reference/fees',SOURCE.txregistry],'scope-mismatch'),
  l2SettlementFeesEth:requirement(['l2-universe-not-fixed','settlement-already-in-l1-fees','derived-view-zero-fill'],
    ['Same fixed L2 universe and identified L1 settlement transactions; execution plus blob charges exactly once. rent_paid derived views can fill missing dates; obtain missingness/provenance instead of treating all displayed zeroes as observed.'],[SOURCE.rent,SOURCE.eip4844],'subset'),
  stakingConsensusRewardsEth:requirement(['staking-cohort-unfixed','net-not-gross-rewards','ideal-not-earned'],
    ['Earned gross rewards for the fixed validator/investor cohort, with disjoint total/component API accounting; net CL rewards or ideal rewards cannot substitute.'],[SOURCE.beacon,SOURCE.staking,SOURCE.methodology],'scope-mismatch'),
  stakingConsensusPenaltiesEth:requirement(['staking-cohort-unfixed','penalty-slashing-components'],
    ['Actual penalties and slashing destruction of the same cohort; missing penalties are not zero.'],[SOURCE.beacon]),
  stakingPriorityFeesEth:requirement(['staking-cohort-unfixed','priority-mev-disjointness'],
    ['Priority fees actually earned by identified cohort proposers/fee recipients, separate from issuance and other builder payments.'],[SOURCE.eip1559,SOURCE.methodology],'scope-mismatch'),
  stakingMevExcludingPriorityEth:requirement(['staking-cohort-unfixed','priority-mev-disjointness'],
    ['Reconciled execution/builder transfers to the same cohort after removing priority fees already counted; unknown decomposition remains missing.'],[SOURCE.methodology],'scope-mismatch'),
  stakingServiceFeesEth:requirement(['staking-cohort-unfixed','actual-service-charges-unmeasured'],
    ['Actual pool/operator/custody charges to those investors, with each expense counted once. A network APR does not provide this field.'],[SOURCE.methodology]),
  stakingOperatingCostsEth:requirement(['staking-cohort-unfixed','actual-operating-costs-unmeasured','conversion-vintage-required'],
    ['Actual residual operating expenses and dated non-ETH conversion; never use an assumed APR haircut or zero default.'],[SOURCE.methodology]),
  averageRewardEligibleStakeEth:requirement(['staking-cohort-unfixed','time-weighted-principal-unmeasured'],
    ['Time-weighted eligible principal for precisely the cohort earning all recorded reward/cost components; a final active-balance stock is not the denominator.'],[SOURCE.staking,SOURCE.beacon],'scope-mismatch'),
  completedExitCount:requirement(['completed-exit-universe-unfixed'],
    ['Count from the fixed sample of exits completed within the UTC window; keep the request and execution-availability event pair.'],[SOURCE.beacon]),
  completedExitMedianWaitDays:requirement(['completed-exit-universe-unfixed','request-to-availability-events'],
    ['Median elapsed duration over that same completed sample, not pending-queue clearance time; zero completed exits leaves the median missing.'],[SOURCE.beacon]),
  uniqueNativeCollateralEth:requirement(['collateral-universe-variable','recursive-underlying-deduplication','conversion-vintage-required'],
    ['Fixed protocol/asset/chain coverage and backing identifiers at window end; deduplicate ETH/WETH, bridges and lending receipts. Latest USD divided by latest ETH price is not a unique-underlying ledger.'],[SOURCE.collateral,SOURCE.methodology],'scope-mismatch'),
  uniqueStakingClaimCollateralEth:requirement(['collateral-universe-variable','recursive-underlying-deduplication','native-claim-overlap'],
    ['Recursive LST/LRT/wrapper backing units disjoint from native collateral. Subtracting aggregate LST categories does not establish unique underlying units.'],[SOURCE.collateral,SOURCE.methodology],'scope-mismatch'),
});

export const ETH_ECONOMIC_CAPTURE_NEXT_STEPS=deepFreeze([
  {id:'preserve-current-partials',priority:1,network:'existing collectors only',newModelMetrics:0,
    action:'Keep raw bytes and immutable receipts from the existing Coin Metrics, throughput and PoW-zero collectors. Replay locally; preserve failures and unknown publication times.'},
  {id:'bounded-l2-source-audit',priority:2,network:'one master plus per-chain txcount/fees/rent_paid JSON; no key',
    urls:['https://api.growthepie.com/v1/master.json','https://api.growthepie.com/v1/metrics/chains/{origin_key}/{metric_id}.json'],
    action:'Freeze an explicit research chain list before collection; retain separate per-chain 28-day rows and nulls. Begin with txcount, then reconcile filters and fee components against the same declared scope.',
    blockedBy:['hosted-code-version-unverified','filtered-transaction-scope','derived-view-zero-fill','publication-time-unknown'],
    resultingStatus:'source-subset research observations until definition and vintage evidence is complete',newModelMetrics:null},
  {id:'upstream-epoch-audit',priority:3,network:'one bounded public history response; no key',
    urls:['https://ethsupply.fyi/api/history?range=24h'],
    action:'Inspect exact integer strings, epoch coverage and issuance/penalty field semantics before any accumulation. An epoch crosses UTC boundaries; do not turn hourly means into exact UTC net issuance.',
    blockedBy:['epoch-boundary-allocation','destruction-component-completeness','historical-theoretical-fill','publication-time-unknown'],
    resultingStatus:'raw component audit, not a 28-day net issuance observation',newModelMetrics:0},
  {id:'exact-block-accounting',priority:4,network:'deferred: full 28-day canonical block/receipt enumeration is outside this small collector scope',
    action:'A later separately bounded collector can sum exact gas, base-fee burn and blob accounting using verified fork parameters and canonical boundaries.',
    blockedBy:['large-rpc-enumeration','canonical-completeness','publication-time-unknown'],newModelMetrics:null},
]);

function ensure(ok,message){if(!ok)throw new RangeError(message);}
function day(value){
  ensure(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'Expected UTC calendar date');
  const ms=Date.parse(value+'T00:00:00Z');ensure(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value,'Invalid UTC calendar date');return ms;
}
function stamp(value,label){
  if(value==null)return null;
  ensure(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),label+' requires UTC timestamp or null');
  const ms=Date.parse(value);ensure(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,19)===value.slice(0,19),'Invalid '+label);return ms;
}
const url=value=>typeof value==='string'&&/^https:\/\/[^\s]+$/.test(value);
function valueIsObserved(value){return typeof value==='number'?Number.isFinite(value)&&value>=0:typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value));}
function sourceIdentity(source,index){
  ensure(['coinmetrics','throughput','pow-zero'].includes(source.kind),'Unknown capture kind');
  ensure(source.receipt&&typeof source.receipt==='object'&&!Array.isArray(source.receipt),'Capture receipt required');
  if(source.receiptSha256!=null)ensure(/^[a-f0-9]{64}$/.test(source.receiptSha256),'Invalid receipt SHA-256');
  const audit=source.rawAudit??{status:'not-loaded',replayed:false};
  ensure(['not-loaded','verified','missing','failed'].includes(audit.status),'Unknown raw audit status');
  ensure(audit.replayed!==true||audit.status==='verified','Replay cannot be asserted without verified bytes');
  return {id:source.kind+':'+index,kind:source.kind,receiptPath:source.receiptPath??null,receiptSha256:source.receiptSha256??null,
    collectorStatus:source.receipt.status??null,collectorError:source.receipt.error??null,rawAudit:{status:audit.status,replayed:audit.replayed===true,verifiedFiles:audit.verifiedFiles??0},
    receiptAuthenticityProven:false};
}
function clocks(observation,asOfMs,issuedMs){
  const end=day(observation.observedThrough)+DAY,start=day(observation.observedFrom);
  ensure(end-start===28*DAY,'Observation must describe exactly 28 UTC calendar days');
  const published=stamp(observation.publishedAt,'publishedAt'),collected=stamp(observation.collectedAt,'collectedAt');
  const generated=stamp(observation.providerGeneratedAt,'providerGeneratedAt'),completed=stamp(observation.providerCompletedAt,'providerCompletedAt');
  if(collected!==null)ensure(collected>=end,'Collection predates observation completion');
  if(published!==null)ensure(published>=end,'Publication predates observation completion');
  if(published!==null&&collected!==null)ensure(collected>=published,'Collection predates publication');
  if(completed!==null&&collected!==null)ensure(completed<=collected,'Provider completion is after collection');
  const ageDays=(asOfMs-day(observation.observedThrough))/DAY,tags=[];
  if(published===null)tags.push('unknown-publication-time');
  if(collected===null)tags.push('unknown-collection-time');
  if(ageDays<0)tags.push('future-window');
  if(ageDays>ETH_ECONOMIC_DEFAULTS.maximumSnapshotAgeDays)tags.push('stale');
  if(end>issuedMs)tags.push('window-not-complete-at-issue');
  if(published!==null&&published>issuedMs)tags.push('published-after-issue');
  if(collected!==null&&collected>issuedMs)tags.push('collected-after-issue');
  return {observedFrom:observation.observedFrom,observedThrough:observation.observedThrough,observedAt:new Date(end).toISOString(),windowDays:28,
    publishedAt:observation.publishedAt??null,collectedAt:observation.collectedAt??null,providerGeneratedAt:observation.providerGeneratedAt??null,
    providerCompletedAt:observation.providerCompletedAt??null,ageDays,
    freshness:ageDays<0?'future-window':ageDays>ETH_ECONOMIC_DEFAULTS.maximumSnapshotAgeDays?'stale':'within-seven-days',
    tags,receiptTimesQualified:tags.length===0,providerClocksAreNotPublication:true};
}
function powShape(observation){
  ensure(observation.sourceType==='protocol-computed-zero'&&observation.metricDefinitionVersion===DEFINITION,'PoW observation definition mismatch');
  ensure(observation.partialMetrics?.executionPowIssuanceEth?.value===0&&observation.partialMetrics.executionPowIssuanceEth.unit===ETH_ECONOMIC_INPUT_SCHEMA.metrics.executionPowIssuanceEth.unit,'PoW observation must be the sourced zero metric');
  ensure(observation.completeWindow===true&&observation.windowDays===28&&day(observation.windowStart)>=day('2022-09-16'),'PoW zero requires a complete post-transition window');
  const first=observation.canonicalBlockRange?.first,last=observation.canonicalBlockRange?.last;
  const previous=observation.boundaryEvidence?.startPrevious,next=observation.boundaryEvidence?.endNext,anchor=observation.finalizedAnchor;
  const start=day(observation.windowStart)/1000,end=(day(observation.observedThrough)+DAY)/1000;
  for(const block of [first,last,previous,next,anchor])ensure(block&&Number.isSafeInteger(block.number)&&Number.isSafeInteger(block.timestampSeconds)&&/^0x[a-f0-9]{64}$/.test(block.hash)&&block.difficulty==='0','Missing PoW canonical boundary evidence');
  ensure(first.number>=15537394&&first.number<=last.number&&last.number<anchor.number,'Invalid post-transition block range');
  ensure(previous.number+1===first.number&&first.parentHash===previous.hash&&last.number+1===next.number&&next.parentHash===last.hash,'Unlinked canonical boundaries');
  ensure(previous.timestampSeconds<start&&first.timestampSeconds>=start&&last.timestampSeconds<end&&next.timestampSeconds>=end&&anchor.timestampSeconds>=end,'UTC boundaries do not bracket the full window');
  ensure(observation.providerCanonicalAssertion===true&&Array.isArray(observation.sourceManifest)&&observation.sourceManifest.some(x=>x.id==='eip-3675'&&url(x.url)&&/^[a-f0-9]{64}$/.test(x.sourceSha256)),'PoW zero source receipt is missing');
}

/** Inputs are preserved collector receipts plus optional caller-supplied byte/replay audits.
 * Reported definition matches and independently replayed matches are separate counts. */
export function inspectEthereumEconomicEvidence({asOf,issuedAt,sources=[]}={}){
  const asOfMs=day(asOf),issuedMs=stamp(issuedAt,'issuedAt');
  ensure(issuedMs!==null&&issuedMs>=asOfMs+DAY,'Diagnostic cutoff must follow its completed asOf day');
  ensure(Array.isArray(sources)&&sources.length<=100,'Expected bounded capture list');
  const metricIds=Object.keys(ETH_ECONOMIC_INPUT_SCHEMA.metrics);
  ensure(metricIds.length===25&&metricIds.every(id=>Object.hasOwn(ETH_ECONOMIC_EVIDENCE_REQUIREMENTS,id)),'Economic definition contract changed; review this inspector');
  const inventory=[],observations=[],links=[];
  function add(source,field,value,clock,sourceUrl,relations,notes=[]){
    if(!valueIsObserved(value))return;
    ensure(url(sourceUrl),'Observation needs HTTPS source URL');
    const id=source.id+':'+field;
    const observation={id,sourceId:source.id,sourceField:field,value,sourceUrl,clocks:clocks(clock,asOfMs,issuedMs),
      rawBytesVerified:source.rawAudit.status==='verified',replayedFromRaw:source.rawAudit.replayed,notes};
    observations.push(observation);
    for(const [metric,relation,reason]of relations)links.push({metric,observationId:id,relation,reason});
  }
  for(let i=0;i<sources.length;i++){
    const source=sourceIdentity(sources[i],i),r=sources[i].receipt;inventory.push(source);
    if(source.kind==='coinmetrics'&&r.status==='success'){
      const w=r.summary?.latestCompleteWindow;
      if(!w?.completeWindow||!w.aggregate)continue;
      ensure(/^[a-f0-9]{64}$/.test(r.sourceSha256),'Coin Metrics source hash required');
      const clock={observedFrom:w.observedFrom,observedThrough:w.observedThrough,publishedAt:r.publishedAt??null,collectedAt:r.collectedAt??null,providerCompletedAt:w.providerCompletedAt??null};
      const sourceUrl='https://github.com/'+r.source.repository+'/blob/'+r.source.commit+'/'+r.source.path;
      const preBlob=day(w.observedThrough)+DAY<=Date.parse(ETH_ECONOMIC_MAINNET_CLOCK.denebAt);
      add(source,'FeeTotNtv',w.aggregate.totalFeesIncludingBlobEth,clock,sourceUrl,[
        ['executionFeesEth',preBlob?'exact':'scope-mismatch',preBlob?'The complete window predates blobs; gross fees are execution fees in this era.':'Total fees already include blob fees; the execution/blob split is absent.'],
        ['executionBurnEth','scope-mismatch','Total fees include priority transfers and blobs; they are not execution burn.'],
        ['blobFeesEth','scope-mismatch','The total does not identify its blob component.'],
        ['blobBurnEth','scope-mismatch','The total does not identify blob fee burn.'],
        ['l2SettlementFeesEth','scope-mismatch','No fixed-rollup settlement subset is identified.']]);
      add(source,'IssTotNtv',w.aggregate.grossIssuanceEth,clock,sourceUrl,[
        ['consensusNetIssuanceEth','scope-mismatch','Gross network issuance does not subtract consensus penalties or establish layer accounting.'],
        ['executionPowIssuanceEth','scope-mismatch','A combined issuance field does not prove a PoW-only value.']]);
      add(source,'SplyCur',w.aggregate.providerLedgerSupplyEth,clock,sourceUrl,[['supplyEth','scope-mismatch','Execution/consensus supply and revision scope remain unreconciled.']]);
      add(source,'TxCnt',w.aggregate.l1TransactionCount,clock,sourceUrl,[
        ['l1GasUsed','incompatible-unit','L1 transaction count is not execution gas.'],['l2Transactions','scope-mismatch','L1 transactions are not transactions on the fixed rollup universe.']]);
    }else if(source.kind==='throughput'&&r.status==='supplement-collected'){
      const o=r.observation;ensure(o?.observationKind==='ethereum-l1-gas-rate-derived-supplement'&&o.sourceUnit==='Mgas/s'&&o.exactIntegerGas===false,'Throughput supplement identity changed');
      ensure(o.chainIdentity?.caip2==='eip155:1'&&o.chainIdentity.evmChainId===1&&o.windowObservations===28&&Array.isArray(o.rows)&&o.rows.length===28,'Invalid throughput chain/window');
      let gas=0;
      for(let j=0;j<28;j++){const row=o.rows[j];ensure(day(row.date)===day(o.windowStart)+j*DAY&&row.unixMilliseconds===day(row.date)&&Number.isFinite(row.mgasPerSecond)&&row.mgasPerSecond>=0,'Missing/invalid throughput day');gas+=row.mgasPerSecond*86400*1000000;}
      ensure(gas===o.l1GasUsedRateDerived,'Throughput value differs from its preserved daily rows');
      add(source,'l1GasUsedRateDerived',gas,{observedFrom:o.windowStart,...o},r.source.dataUrl,[['l1GasUsed','rate-derived','Daily Mgas/s converted to gas; exact integer/canonical completeness has not been established.']]);
    }else if(source.kind==='pow-zero'&&r.status==='partial-protocol-observation-collected'){
      const o=r.observation;powShape(o);
      add(source,'executionPowIssuanceEth',0,{observedFrom:o.windowStart,...o},o.metricSourceUrls?.executionPowIssuanceEth,[['executionPowIssuanceEth','exact','Sourced protocol-zero partial observation for the fully post-transition canonical range.']],
        ['Single-provider canonical/finalized assertion; not independent consensus validation or a verified complete header chain.','Not total or consensus issuance.']);
    }
  }
  const byId=new Map(observations.map(o=>[o.id,o]));
  const metrics=metricIds.map(metric=>{
    const evidence=links.filter(l=>l.metric===metric).map(({metric:_,...link})=>{
      const o=byId.get(link.observationId);return {...link,clockTags:o.clocks.tags,rawBytesVerified:o.rawBytesVerified,replayedFromRaw:o.replayedFromRaw,
        reportedDefinitionAndTimeMatch:link.relation==='exact'&&o.clocks.receiptTimesQualified};});
    const relations=[...new Set(evidence.map(e=>e.relation))];
    const status=relations.includes('exact')?'exact-partial':relations.includes('rate-derived')?'rate-derived-partial':relations.includes('subset')?'subset-partial':evidence.length?'scope-mismatch':'not-observed';
    const kinds=[...(['l1GasUsed','l2Transactions','executionFeesEth','executionBurnEth','blobFeesEth','blobBurnEth','l2SettlementFeesEth','consensusNetIssuanceEth','executionPowIssuanceEth','supplyEth'].includes(metric)?['coinmetrics']:[]),
      ...(metric==='l1GasUsed'?['throughput']:[]),...(metric==='executionPowIssuanceEth'?['pow-zero']:[])];
    const sourceCaptureStates=kinds.flatMap(kind=>{
      const candidates=inventory.filter(s=>s.kind===kind);
      return candidates.length?candidates.map(s=>({sourceId:s.id,kind,collectorStatus:s.collectorStatus,
        state:!['success','supplement-collected','partial-protocol-observation-collected'].includes(s.collectorStatus)?'failed-or-incomplete':
          evidence.some(e=>byId.get(e.observationId).sourceId===s.id)?'observation-reported':'no-usable-observation',error:s.collectorError,
        rawStatus:s.rawAudit.status,replayed:s.rawAudit.replayed})):[{sourceId:null,kind,state:'missing',collectorStatus:null,rawStatus:'not-loaded',replayed:false}];
    });
    return {metric,...ETH_ECONOMIC_INPUT_SCHEMA.metrics[metric],status,relations,evidence,
      sourceCaptureStates,
      clockTags:[...new Set(evidence.flatMap(e=>e.clockTags))],
      gaps:ETH_ECONOMIC_EVIDENCE_REQUIREMENTS[metric],modelInputActivated:false};
  });
  return {kind:'ethereum-economic-evidence-coverage',version:ETH_ECONOMIC_EVIDENCE_VERSION,metricDefinitionVersion:DEFINITION,asOf,issuedAt,
    policy:{windowDays:28,maximumSnapshotAgeDays:ETH_ECONOMIC_DEFAULTS.maximumSnapshotAgeDays,missingAsZero:false,
      newModelVariant:false,sourceAuthenticityProven:false,providerGeneratedOrCompletedAtSubstitutesForPublishedAt:false},
    sources:inventory,observations,metrics,
    summary:{requiredMetricCount:metricIds.length,sourceReceiptCount:inventory.length,observedSourceFieldCount:observations.length,
      failedOrIncompleteSourceCount:inventory.filter(s=>!['success','supplement-collected','partial-protocol-observation-collected'].includes(s.collectorStatus)).length,
      missingSourceKinds:['coinmetrics','throughput','pow-zero'].filter(kind=>!inventory.some(s=>s.kind===kind)),
      rawVerifiedSourceCount:inventory.filter(s=>s.rawAudit.status==='verified').length,replayedSourceCount:inventory.filter(s=>s.rawAudit.replayed).length,
      metricsWithRelatedObservations:metrics.filter(m=>m.evidence.length).length,
      definitionExactReportedMetricCount:metrics.filter(m=>m.relations.includes('exact')).length,
      definitionExactReplayedMetricCount:metrics.filter(m=>m.evidence.some(e=>e.relation==='exact'&&e.replayedFromRaw)).length,
      rateDerivedMetricCount:metrics.filter(m=>m.relations.includes('rate-derived')).length,
      scopeMismatchMetricCount:metrics.filter(m=>m.relations.includes('scope-mismatch')||m.relations.includes('incompatible-unit')).length,
      notObservedMetricCount:metrics.filter(m=>m.evidence.length===0).length,
      staleObservationCount:observations.filter(o=>o.clocks.tags.includes('stale')).length,
      unknownPublicationObservationCount:observations.filter(o=>o.clocks.tags.includes('unknown-publication-time')).length,
      reportedExactAndClockQualifiedMetricCount:metrics.filter(m=>m.evidence.some(e=>e.reportedDefinitionAndTimeMatch)).length,
      countsAreOverlappingEvidenceDimensions:true},
    sourceMethodologyReview:{repository:'growthepie/gtp-backend',commit:BACKEND,hostedBackendVersionVerified:false,
      documentationIsNotObservation:true,sourceUrls:[...new Set(Object.values(ETH_ECONOMIC_EVIDENCE_REQUIREMENTS).flatMap(r=>r.sourceUrls))]},
    nextCollectionSteps:ETH_ECONOMIC_CAPTURE_NEXT_STEPS,
    accountingConstraints:[
      'executionFeesEth + blobFeesEth is the total; executionBurnEth is a component, not additional fee revenue.',
      'l2SettlementFeesEth is already a subset of total L1 fees; never add it to those total fees.',
      'Epoch-average net CL rewards are neither exact UTC gross rewards nor a cohort return.',
      'Active staking balance is not total staking balance or time-weighted cohort principal.',
      'Native and staking-claim collateral require disjoint unique underlying units, not additive token/TVL headlines.'
    ],
    fullModelSnapshotReady:false,eligibleModelSnapshotCount:0,modelSnapshots:[],historicalPointInTimeReady:false,
    modelInputActivated:false,productionPromoted:false,definitionContractsRelaxed:false,
    interpretation:'Partial observations and source-definition gaps only. A zero full-snapshot count does not mean zero observations. This inventory never certifies a model input or forecast.'};
}
