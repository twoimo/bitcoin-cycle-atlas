import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectEthereumEconomicEvidence,ETH_ECONOMIC_EVIDENCE_REQUIREMENTS} from '../dist/ethereum-economic-evidence-coverage.js';
import {ETH_ECONOMIC_INPUT_SCHEMA} from '../dist/ethereum-economic-model.js';
import {inspectEconomicEvidenceFiles} from '../scripts/build-ethereum-economic-evidence-coverage.mjs';

const DAY=86400000,START=Date.parse('2026-09-29T00:00:00Z'),END=START+28*DAY;
const hash=n=>'0x'+String(n).padStart(64,'0');
const inspect=sources=>inspectEthereumEconomicEvidence({asOf:'2026-10-26',issuedAt:'2026-10-27T10:00:00Z',sources});
const metric=(r,id)=>r.metrics.find(m=>m.metric===id);
function coin(){return {kind:'coinmetrics',receipt:{status:'success',sourceSha256:'a'.repeat(64),publishedAt:null,collectedAt:'2026-10-27T08:00:00Z',
  source:{repository:'coinmetrics/data',commit:'b'.repeat(40),path:'csv/eth.csv'},summary:{latestCompleteWindow:{completeWindow:true,observedFrom:'2026-04-26',observedThrough:'2026-05-23',providerCompletedAt:'2026-05-24T03:00:00Z',
    aggregate:{totalFeesIncludingBlobEth:100,grossIssuanceEth:200,l1TransactionCount:300,providerLedgerSupplyEth:1000000}}}}};}
function throughput(){
  const rows=Array.from({length:28},(_,i)=>({date:new Date(START+i*DAY).toISOString().slice(0,10),unixMilliseconds:START+i*DAY,mgasPerSecond:1.234+i*.001}));
  return {kind:'throughput',receipt:{status:'supplement-collected',source:{dataUrl:'https://api.growthepie.com/v1/metrics/chains/ethereum/throughput.json'},
    observation:{observationKind:'ethereum-l1-gas-rate-derived-supplement',sourceUnit:'Mgas/s',exactIntegerGas:false,
      l1GasUsedRateDerived:rows.reduce((s,r)=>s+r.mgasPerSecond*86400*1000000,0),rows,windowObservations:28,
      windowStart:'2026-09-29',observedThrough:'2026-10-26',publishedAt:null,collectedAt:'2026-10-27T08:01:00Z',providerGeneratedAt:'2026-10-27T07:00:00Z',
      chainIdentity:{caip2:'eip155:1',evmChainId:1}}}};
}
function pow(){
  const block=(number,timestampSeconds)=>({number,timestampSeconds,hash:hash(number),parentHash:hash(number-1),difficulty:'0'});
  return {kind:'pow-zero',receipt:{status:'partial-protocol-observation-collected',definitionMatchedPartialMetricCount:1,
    observation:{sourceType:'protocol-computed-zero',metricDefinitionVersion:'eth-economic-input-3',partialMetrics:{executionPowIssuanceEth:{value:0,unit:'ETH/28 UTC days'}},
      metricSourceUrls:{executionPowIssuanceEth:'https://ethereum-rpc.publicnode.com'},windowDays:28,completeWindow:true,windowStart:'2026-09-29',observedThrough:'2026-10-26',
      publishedAt:null,collectedAt:'2026-10-27T08:02:00Z',providerCanonicalAssertion:true,
      canonicalBlockRange:{first:block(26000000,START/1000+11),last:block(26000200,END/1000-1)},
      boundaryEvidence:{startPrevious:block(25999999,START/1000-1),endNext:block(26000201,END/1000+11)},finalizedAnchor:block(26000210,END/1000+120),
      sourceManifest:[{id:'eip-3675',url:'https://eips.ethereum.org/EIPS/eip-3675',sourceSha256:'c'.repeat(64)}]}}};
}

test('a complete 25-row gap inventory does not interpret absent measurements as zero',()=>{
  const r=inspect([]);assert.equal(r.metrics.length,25);assert.equal(r.summary.notObservedMetricCount,25);
  assert.deepEqual(r.metrics.map(m=>m.metric),Object.keys(ETH_ECONOMIC_INPUT_SCHEMA.metrics));
  assert.equal(r.observations.length,0);assert.equal(r.eligibleModelSnapshotCount,0);assert.deepEqual(r.modelSnapshots,[]);
  assert.equal(metric(r,'executionPowIssuanceEth').sourceCaptureStates.find(s=>s.kind==='pow-zero').state,'missing');
  for(const m of r.metrics){assert.equal(m.modelInputActivated,false);assert(m.gaps.requiredEvidence.length);assert(m.gaps.sourceUrls.length);}
});

test('current partial evidence has separate definition, timing, scope and raw-replay dimensions',()=>{
  const r=inspect([coin(),throughput(),pow()]);
  assert.equal(r.summary.observedSourceFieldCount,6);assert.equal(r.summary.definitionExactReportedMetricCount,1);
  assert.equal(r.summary.definitionExactReplayedMetricCount,0);assert.equal(r.summary.rateDerivedMetricCount,1);
  assert.equal(r.summary.staleObservationCount,4);assert.equal(r.summary.unknownPublicationObservationCount,6);
  assert.equal(r.summary.reportedExactAndClockQualifiedMetricCount,0);assert.equal(r.summary.notObservedMetricCount,15);
  assert.equal(metric(r,'executionPowIssuanceEth').status,'exact-partial');assert.equal(metric(r,'l1GasUsed').status,'rate-derived-partial');
  assert.equal(r.fullModelSnapshotReady,false);assert.equal(r.productionPromoted,false);assert.equal(r.historicalPointInTimeReady,false);
  assert.equal(r.sourceMethodologyReview.hostedBackendVersionVerified,false);
});

test('total fees do not silently become execution, blob, burn or extra settlement revenue',()=>{
  const r=inspect([coin()]);
  for(const id of ['executionFeesEth','executionBurnEth','blobFeesEth','blobBurnEth','l2SettlementFeesEth']){
    assert.equal(metric(r,id).evidence[0].relation,'scope-mismatch');assert.equal(metric(r,id).evidence[0].reportedDefinitionAndTimeMatch,false);
  }
  assert.equal(new Set(r.metrics.flatMap(m=>m.evidence.filter(e=>e.observationId.endsWith(':FeeTotNtv')).map(e=>e.observationId))).size,1);
  assert.equal(r.observations.filter(o=>o.sourceField==='FeeTotNtv').length,1);
  assert(r.accountingConstraints.some(x=>x.includes('already a subset')));
});

test('the pre-Deneb fee definition match retains stale and unknown-publication blockers',()=>{
  const source=coin(),w=source.receipt.summary.latestCompleteWindow;
  w.observedFrom='2024-02-01';w.observedThrough='2024-02-28';w.providerCompletedAt='2024-02-29T03:00:00Z';
  const r=inspect([source]),m=metric(r,'executionFeesEth');
  assert.equal(m.status,'exact-partial');assert(m.clockTags.includes('stale'));assert(m.clockTags.includes('unknown-publication-time'));
  assert.equal(r.summary.reportedExactAndClockQualifiedMetricCount,0);
  assert.equal(metric(r,'blobFeesEth').status,'scope-mismatch');
});

test('gross issuance and active/epoch-mean methodology are not declared exact network or cohort observations',()=>{
  const r=inspect([coin()]);assert.equal(metric(r,'consensusNetIssuanceEth').status,'scope-mismatch');
  assert.equal(metric(r,'stakedEth').status,'not-observed');assert.equal(metric(r,'stakingConsensusRewardsEth').status,'not-observed');
  assert(ETH_ECONOMIC_EVIDENCE_REQUIREMENTS.consensusNetIssuanceEth.gapCodes.includes('historical-theoretical-fill'));
  assert(ETH_ECONOMIC_EVIDENCE_REQUIREMENTS.stakedEth.gapCodes.includes('active-balance-is-subset'));
  assert(ETH_ECONOMIC_EVIDENCE_REQUIREMENTS.averageRewardEligibleStakeEth.gapCodes.includes('time-weighted-principal-unmeasured'));
  assert(ETH_ECONOMIC_EVIDENCE_REQUIREMENTS.uniqueStakingClaimCollateralEth.gapCodes.includes('native-claim-overlap'));
});

test('provider generation/commit/completion clocks cannot fabricate publication or collection',()=>{
  const a=throughput();a.receipt.observation.publishedAt=null;a.receipt.observation.collectedAt=null;
  a.receipt.observation.providerGeneratedAt='2026-10-27T00:00:01Z';a.receipt.source.repositoryCommitTimestamp='2026-10-27T00:00:02Z';
  const r=inspect([a]),o=r.observations[0];assert.equal(o.clocks.publishedAt,null);assert.equal(o.clocks.collectedAt,null);
  assert(o.clocks.tags.includes('unknown-publication-time'));assert(o.clocks.tags.includes('unknown-collection-time'));
});

test('known publication still requires actual collection by the diagnostic issue cutoff',()=>{
  const a=pow();a.receipt.observation.publishedAt='2026-10-27T01:00:00Z';a.receipt.observation.collectedAt='2026-10-27T11:00:00Z';
  const r=inspect([a]);assert(metric(r,'executionPowIssuanceEth').clockTags.includes('collected-after-issue'));
  assert.equal(r.summary.reportedExactAndClockQualifiedMetricCount,0);
  a.receipt.observation.collectedAt='2026-10-27T08:02:00Z';
  const earlier=inspect([a]);assert.equal(earlier.summary.reportedExactAndClockQualifiedMetricCount,1);
  assert.equal(earlier.fullModelSnapshotReady,false);assert.equal(earlier.eligibleModelSnapshotCount,0);
});

test('same exact receipt is stale after seven days without changing its definition match',()=>{
  const r=inspectEthereumEconomicEvidence({asOf:'2026-11-03',issuedAt:'2026-11-04T01:00:00Z',sources:[pow()]});
  assert.equal(metric(r,'executionPowIssuanceEth').status,'exact-partial');assert(metric(r,'executionPowIssuanceEth').clockTags.includes('stale'));
  assert.equal(r.observations[0].clocks.ageDays,8);
});

test('collector failure stays visible per related metric and never acquires the claimed successful count',()=>{
  const a=pow();a.receipt.status='capture-failed';a.receipt.error='RPC timeout';a.receipt.definitionMatchedPartialMetricCount=25;
  const r=inspect([a]);assert.equal(r.observations.length,0);assert.equal(r.summary.definitionExactReportedMetricCount,0);
  const state=metric(r,'executionPowIssuanceEth').sourceCaptureStates.find(s=>s.kind==='pow-zero');
  assert.equal(state.state,'failed-or-incomplete');assert.equal(state.error,'RPC timeout');
});

test('tampered zero, unbracketed UTC edges, bad units and incomplete/changed throughput fail',()=>{
  for(const mutate of [a=>{a.receipt.observation.partialMetrics.executionPowIssuanceEth.value=1;},
    a=>{a.receipt.observation.boundaryEvidence.startPrevious.timestampSeconds=START/1000;},
    a=>{a.receipt.observation.canonicalBlockRange.first.parentHash=hash(1);},
    a=>{a.receipt.observation.completeWindow=false;}]){const a=pow();mutate(a);assert.throws(()=>inspect([a]));}
  for(const mutate of [a=>{a.receipt.observation.rows.splice(2,1);},a=>{a.receipt.observation.rows[2].date='2026-09-30';},
    a=>{a.receipt.observation.l1GasUsedRateDerived+=1;},a=>{a.receipt.observation.exactIntegerGas=true;},
    a=>{a.receipt.observation.rows[2].mgasPerSecond=null;}]){const a=throughput();mutate(a);assert.throws(()=>inspect([a]));}
});

test('raw-byte verification is not replay, and replay does not establish source publication',()=>{
  const a=pow();a.rawAudit={status:'verified',replayed:false,verifiedFiles:54};
  let r=inspect([a]);assert.equal(r.summary.definitionExactReplayedMetricCount,0);assert.equal(r.observations[0].rawBytesVerified,true);
  a.rawAudit.replayed=true;r=inspect([a]);assert.equal(r.summary.definitionExactReplayedMetricCount,1);
  assert.equal(r.summary.reportedExactAndClockQualifiedMetricCount,0);assert.equal(r.fullModelSnapshotReady,false);
  a.rawAudit.status='missing';assert.throws(()=>inspect([a]),/Replay cannot/);
});

test('invalid calendar/receipt chronology fails and the inspector does not mutate source receipts',()=>{
  const a=coin(),before=structuredClone(a);inspect([a]);assert.deepEqual(a,before);
  assert.throws(()=>inspectEthereumEconomicEvidence({asOf:'2026-02-30',issuedAt:'2026-03-01T01:00:00Z'}),/calendar/);
  a.receipt.collectedAt='2026-05-23T23:00:00Z';assert.throws(()=>inspect([a]),/Collection predates/);
  a.receipt.collectedAt='2026-10-27T08:00:00Z';a.receipt.publishedAt='2026-10-27T09:00:00Z';assert.throws(()=>inspect([a]),/Collection predates publication/);
});

test('offline file inspector replays the pinned CSV and retains unverified receipt-only partials',async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url));
  const report=await inspectEconomicEvidenceFiles({repositoryRoot:root,asOf:'2026-10-26',issuedAt:'2026-10-27T10:00:00Z',
    receiptBundlePath:'docs/eth-candidate-evidence/20261027-initialization/economic-capture-receipts.json'});
  assert.equal(report.provenance.networkRequests,0);assert.equal(report.sources.find(s=>s.kind==='coinmetrics').rawAudit.replayed,true);
  assert.equal(report.sources.find(s=>s.kind==='pow-zero').rawAudit.replayed,false);
  assert.equal(report.summary.definitionExactReportedMetricCount,1);assert.equal(report.summary.definitionExactReplayedMetricCount,0);
  assert.equal(report.observations.find(o=>o.sourceField==='FeeTotNtv').clocks.collectedAt,'2026-10-27T08:48:39.577Z');
  assert.equal(report.provenance.inputSha256['research-data/eth-economic-captures/20261026T121240869Z-coinmetrics/eth.csv'],'46b18f3df967405374b1f6ee8a3d11ee1b7a5b176ac9fb4342caf6bf8648f2cc');
});

test('offline file inspector rejects changed aggregate despite an unchanged CSV identity',async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'eth-evidence-'));
  try{
    const capture='research-data/eth-economic-captures/20261026T121240869Z-coinmetrics';
    await mkdir(resolve(temp,capture),{recursive:true});await cp(resolve(root,capture,'eth.csv'),resolve(temp,capture,'eth.csv'));
    const bundle=JSON.parse(await readFile(resolve(root,'docs/eth-candidate-evidence/20261027-initialization/economic-capture-receipts.json')));
    bundle.pinnedSource[0].summary.latestCompleteWindow.aggregate.grossIssuanceEth+=1;
    await writeFile(resolve(temp,'receipts.json'),JSON.stringify(bundle));
    await assert.rejects(inspectEconomicEvidenceFiles({repositoryRoot:temp,asOf:'2026-10-26',issuedAt:'2026-10-27T10:00:00Z',receiptBundlePath:'receipts.json'}),/does not replay/);
    await assert.rejects(inspectEconomicEvidenceFiles({repositoryRoot:temp,asOf:'2026-10-26',issuedAt:'2026-10-27T10:00:00Z',receiptBundlePath:'../outside.json'}),/Unsafe evidence path/);
  }finally{await rm(temp,{recursive:true,force:true});}
});
