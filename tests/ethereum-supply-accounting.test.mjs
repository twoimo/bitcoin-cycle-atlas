import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditEthereumSupplyAccounting,ETH_SUPPLY_ACCOUNTING_SOURCE as SOURCE} from '../scripts/ethereum-supply-accounting-core.mjs';
import {fetchEthereumSupplyAccountingBytes,verifySupplyResponseDigest} from '../scripts/capture-ethereum-supply-accounting.mjs';
const G=1606824023,S=12;
const asOf='2026-10-26',collectedAt='2026-10-27T12:00:00.000Z';
const first=Math.ceil((Date.parse('2026-09-29T00:00:00Z')/1000-G)/S),last=first+201600-1;
function values(){return {issuanceWei:'10000000000000000001',baseFeeBurnWei:'1000000000000000000',blobBaseFeeBurnWei:'2000000000000000000',consensusPenaltiesWei:'3000000000000000000',otherExecutionBurnWei:'1',burnWei:'3000000000000000000',netWei:'4000000000000000000',gasUsed:'9007199254740993',supplyWei:'120000000000000000000000001'};}
function slot(n,more={}){return {slot:n,timestamp:G+n*S,blockKnown:true,finalized:true,...values(),...more};}
function payload(){return {schemaVersion:1,range:'30d',revision:10,generatedAt:Date.parse(collectedAt)/1000-5,slots:[slot(last-1),slot(last,{supplyWei:'120000004000000000000000001'})],epochs:[]};}
const audit=p=>auditEthereumSupplyAccounting(p,{collectedAt,observedThrough:asOf});

test('one wei non-fee destruction remains exact beyond Number precision',()=>{
  const a=audit(payload()),s=a.series.slots;
  assert.equal(s.burnComponentsChecked,2);assert.equal(s.burnComponentsMismatched,0);assert.equal(s.netComponentsMismatched,0);
  assert.equal(s.otherBurnNonzero,2);assert.equal(s.endpointArithmetic.adjacentPairsChecked,1);assert.equal(s.endpointArithmetic.firstPair.residualWei,'0');
  assert.equal(s.endpointArithmetic.endpointDecomposition.componentResidualWei,'0');assert.equal(s.endpointArithmetic.endpointDecomposition.biasIfOtherExecutionBurnOmittedWei,'1');
  assert.equal(s.reportedRowSums.otherExecutionBurnWei,'2');
  assert.equal(a.fullModelSnapshotReady,false);assert.equal(a.definitionMatchedModelMetricCount,0);assert.equal(a.publishedAt,null);
  assert.equal(a.independentCanonicalValidation,false);
});
test('unknown non-fee destruction is missing, not zero or residual classification',()=>{
  const p=payload();delete p.slots[0].otherExecutionBurnWei;p.slots[1].otherExecutionBurnWei=null;
  const s=audit(p).series.slots;assert.equal(s.otherBurnMissing,2);assert.equal(s.burnComponentsChecked,2);assert.equal(s.netComponentsChecked,0);assert.equal(s.netVersusReportedBurnChecked,0);
});
test('component and stock disagreements retain exact signed residuals',()=>{
  const p=payload();p.slots[1].otherExecutionBurnWei='2';p.slots[1].burnWei='3000000000000000001';p.slots[1].supplyWei='120000004000000000000000002';
  const s=audit(p).series.slots;assert.equal(s.burnComponentsMismatched,1);assert.equal(s.netComponentsMismatched,1);
  assert.equal(s.mismatchExamples[0].residualWei,'1');assert.equal(s.endpointArithmetic.mismatchExamples[0].residualWei,'1');
});
test('rounded numeric or noncanonical decimal money is rejected',()=>{
  for(const bad of [9007199254740992,'1e18','01','1.0','-0','-1',Infinity]){
    const p=payload();p.slots[0].gasUsed=bad;assert.throws(()=>audit(p),/exact integer string/);
  }
});
test('negative net issuance is permitted with exact reconciliation',()=>{
  const p=payload();for(const r of p.slots){r.issuanceWei='0';r.netWei='-6000000000000000001';}
  assert.equal(audit(p).series.slots.netComponentsMismatched,0);
});
test('duplicate and reversed source positions cannot manufacture coverage',()=>{
  const p=payload();p.slots.push({...p.slots[1]});assert.throws(()=>audit(p),/unique and ascending/);
  const q=payload();q.slots.reverse();assert.throws(()=>audit(q),/unique and ascending/);
});
test('slot timestamps must agree with the mainnet clock',()=>{
  const p=payload();p.slots[0].timestamp++;assert.throws(()=>audit(p),/mainnet slot clock/);
});
test('a bucket crossing UTC start is not prorated into exact 28-day data',()=>{
  const p=payload();p.slots=[slot(last,{fromSlot:first-1,toSlot:last,fromTimestamp:G+(first-1)*S,toTimestamp:G+last*S})];
  const w=audit(p).utcWindow;assert.equal(w.providerBucketsCoverAllRequiredSlots,true);assert.equal(w.boundaryCrossingBuckets,1);
  assert.equal(w.exactBucketBoundaryMatch,false);assert.deepEqual(w.providerClaimAggregates,{});
});
test('full explicit slot coverage can sum provider claims without model activation',()=>{
  const p=payload();p.slots=[slot(last,{fromSlot:first,toSlot:last,fromTimestamp:G+first*S,toTimestamp:G+last*S})];
  const a=audit(p),w=a.utcWindow;assert.equal(w.requiredSlots,201600);assert.equal(w.exactBucketBoundaryMatch,true);
  assert.equal(Object.hasOwn(w.providerClaimAggregates,'gasUsed'),false);assert(w.excludedUsageFields.includes('gasUsed'));assert.equal(w.providerClaimAggregates.otherExecutionBurnWei,'1');
  assert.equal(w.utcAccountingEligibilityProven,false);assert.equal(a.modelInputActivated,false);
});
test('an internal slot gap prevents complete window aggregation',()=>{
  const p=payload();p.slots=[slot(first),slot(last,{fromSlot:first+2,toSlot:last})];
  const w=audit(p).utcWindow;assert.equal(w.internalGapCount,1);assert.equal(w.providerBucketsCoverAllRequiredSlots,false);
});
test('an epoch-only source remains incapable of proving a UTC slot window',()=>{
  const p=payload();p.slots=[];p.epochs=[{epoch:Math.floor(last/32),timestamp:G+Math.floor(last/32)*32*S,...values()}];
  const a=audit(p);assert.equal(a.series.epochs.burnComponentsChecked,1);assert.equal(a.utcWindow.coveredSlots,0);assert.equal(a.utcWindow.exactBucketBoundaryMatch,false);
});
test('unknown schema, incomplete history, wrong chain and future clocks fail',()=>{
  for(const changes of [{schemaVersion:2},{partial:true},{baseRevision:9},{range:'24h'},{chainId:2},{generatedAt:Date.parse(collectedAt)/1000+301}])assert.throws(()=>audit({...payload(),...changes}));
  assert.throws(()=>audit({...payload(),slots:[],epochs:[]}),/no accounting rows/);
});
test('a small clock lead is disclosed and never becomes publication',()=>{
  const a=audit({...payload(),generatedAt:Date.parse(collectedAt)/1000+1});assert.equal(a.providerClockAfterCollection,true);assert.equal(a.publishedAt,null);
});
test('the requested UTC window must already be complete at collection',()=>{
  assert.throws(()=>auditEthereumSupplyAccounting(payload(),{collectedAt,observedThrough:'2026-10-27'}),/not yet complete/);
});
test('a source row after actual collection is disclosed even within generation tolerance',()=>{
  const p=payload(),future=Math.floor((Date.parse(collectedAt)/1000-G)/S)+1;
  p.slots.push(slot(future));const a=audit(p);assert.equal(a.observationClocks.slots.rowsAfterActualCollection,1);
  assert(a.observationClocks.slots.maximumLeadSeconds>0);assert.equal(a.modelInputActivated,false);
});
test('upstream EIP-6780 bytes match the connector-reviewed source blob',async()=>{
  const b=await readFile(new URL('../'+SOURCE.protocolFile,import.meta.url));
  const h=createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');assert.equal(h,SOURCE.protocolGitBlobSha);
  assert.match(b.toString('utf8'),/Ether will be burnt/);
});
test('HTTP error bytes are preserved before the caller marks collection failed',async()=>{
  const r=await fetchEthereumSupplyAccountingBytes(SOURCE.historyUrl,{fetchImpl:async()=>new Response('{"error":"not-ready"}',{status:503,headers:{'content-type':'application/json'}})});
  assert.equal(r.ok,false);assert.equal(r.acquisition.complete,true);assert.equal(r.bytes.toString(),' {"error":"not-ready"}'.trim());
});
test('response digest matches only exact captured bytes and is not authenticity proof',()=>{
  const d='a'.repeat(64),a={sha256:d,responseHeaders:{'x-supply-sha256':d}};
  assert.equal(verifySupplyResponseDigest(a).providerDigestVerified,true);assert.equal(verifySupplyResponseDigest(a).independentAuthenticityProven,false);
  assert.equal(verifySupplyResponseDigest({sha256:d,responseHeaders:{}}).providerDigestVerified,false);
  assert.throws(()=>verifySupplyResponseDigest({...a,sha256:'b'.repeat(64)}),/differs/);
});
test('unexpected URLs and advertised or streamed oversized bodies are rejected',async()=>{
  await assert.rejects(fetchEthereumSupplyAccountingBytes('https://example.com/'),/not allowlisted/);
  await assert.rejects(fetchEthereumSupplyAccountingBytes(SOURCE.historyUrl,{maximumBytes:2,fetchImpl:async()=>new Response('123',{headers:{'content-length':'3'}})}),/advertised body/);
  await assert.rejects(fetchEthereumSupplyAccountingBytes(SOURCE.historyUrl,{maximumBytes:2,fetchImpl:async()=>new Response('123')}),/streamed body/);
});

test('actual grouped source row retains fractional blob presentation without usage totals',()=>{
  // Minimal fields transcribed from captured 30d response SHA256 4992d3b2f4cc6d9e353c7f52fdc88c79af2e178dbe126fe5ddbaef1d79ecbbcc.
  const row={slot:15308063,epoch:478376,timestamp:1790520779,fromSlot:15307104,toSlot:15308063,fromTimestamp:1790509271,toTimestamp:1790520779,
    finalized:true,blocks:955,blobsUsed:4.641884816753927,blobsTarget:14,blobsMax:21,gasUsed:'31491039',
    supplyWei:'122081609399981044865783235',issuanceWei:'394039220870000000000',burnWei:'37878200147066821681',
    baseFeeBurnWei:'37860860855006600241',blobBaseFeeBurnWei:'17339292060221440',consensusPenaltiesWei:'1745197704000000000',otherExecutionBurnWei:'0',netWei:'354415823018933178319'};
  const a=audit({...payload(),slots:[row]}),s=a.series.slots;
  assert.equal(a.version,'eth-supply-accounting-audit-2');assert.equal(s.usagePresentation.blobsUsed.nonInteger,1);
  assert.equal(s.usagePresentation.blobsUsed.minimum,4.641884816753927);assert.equal(s.usagePresentation.blobsUsed.additiveTotalEligible,false);
  assert.equal(Object.hasOwn(s.reportedRowSums,'gasUsed'),false);assert.equal(s.burnComponentsMismatched,0);assert.equal(s.netComponentsMismatched,0);
  assert.equal(s.reportedBurnCandidates.allDestruction.mismatched,1);assert.equal(s.reportedBurnCandidates.feePlusOtherExecution.mismatched,0);
});
test('ancillary blob missing, explicit zero and fractional values remain distinct',()=>{
  const p=payload();p.slots[0].blobsUsed=null;p.slots[1].blobsUsed=0;
  const u=audit(p).series.slots.usagePresentation.blobsUsed;assert.equal(u.missing,1);assert.equal(u.present,1);assert.equal(u.minimum,0);assert.equal(u.nonInteger,0);
  for(const bad of ['4.2',-1,NaN,Infinity,{},true]){const q=payload();q.slots[0].blobsUsed=bad;assert.throws(()=>audit(q),/presentation number/);}
});
test('reported burn conventions do not double count consensus penalties or force a nonzero-other interpretation',()=>{
  const a=audit(payload()),s=a.series.slots;
  assert.equal(s.reportedBurnCandidates.feeOnly.mismatched,0);assert.equal(s.reportedBurnCandidates.feePlusOtherExecution.mismatched,2);
  assert.equal(s.reportedBurnCandidates.allDestruction.mismatched,2);assert.equal(s.netVersusReportedBurnMismatched,0);
  const p=payload();for(const r of p.slots)r.burnWei='3000000000000000001';
  const q=audit(p).series.slots;assert.equal(q.reportedBurnCandidates.feePlusOtherExecution.mismatched,0);assert.equal(q.reportedBurnCandidates.feeOnly.mismatched,2);
  assert.equal(q.netComponentsMismatched,0);
});
