import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeEthereumSupplyResolution} from '../scripts/ethereum-supply-resolution-core.mjs';
import {buildEthereumSupplyResolutionReport} from '../scripts/analyze-ethereum-supply-resolution.mjs';
import {ETH_SUPPLY_ACCOUNTING_SOURCE as SOURCE} from '../scripts/ethereum-supply-accounting-core.mjs';

const G=1606824023,S=12,observedThrough='2026-10-26',collectedAt='2026-10-27T12:00:00.000Z';
const first=Math.ceil((Date.parse('2026-09-29T00:00:00Z')/1000-G)/S),last=first+201600-1;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function row(from,to=from,label=to){return {fromSlot:from,toSlot:to,slot:label,epoch:Math.floor(label/32),timestamp:G+label*S,
  fromTimestamp:G+from*S,toTimestamp:G+to*S,supplyWei:'120000000000000000000000001',finalized:true};}
function document(slots){return {schemaVersion:1,range:'30d',revision:3,generatedAt:Date.parse(collectedAt)/1000-5,slots,epochs:[]};}
function grid(width=960){
  const start=Math.floor((first-width)/width)*width,slots=[];
  for(let from=start;from<=last;from+=width)slots.push(row(from,from+width-1));
  return {...document(slots),intervalSlots:width};
}
const analyze=payload=>analyzeEthereumSupplyResolution(payload,{collectedAt,observedThrough});

test('960-slot epoch grid conditionally cannot label UTC boundary stocks',()=>{
  const a=analyze(grid()),w=a.requestedWindow,g=a.observedGrid;
  assert.equal(g.uniformAlignedGridObserved,true);assert.equal(g.strideSlots,960);
  assert.deepEqual(g.epochResidues,{starts:[0],ends:[31],labels:[31]});
  assert.equal(w.startBoundary.slot,15317998);assert.equal(w.endBoundary.slot,15519598);
  assert.equal(w.startBoundary.epochResidue,14);assert.equal(w.endBoundary.epochResidue,14);
  assert.equal(a.utcAlignment.slotsPerDay,7200);assert.equal(a.utcAlignment.epochsPerDay,225);
  assert.equal(a.utcAlignment.gcdGridAndDailyAdvance,480);
  assert.equal(a.utcAlignment.conditionalIncompatibilityProven,true);
  assert.equal(a.utcAlignment.finiteSamplesProveFutureApiGrid,false);
  assert.equal(w.startBoundary.stockAvailable,false);assert.equal(w.startBoundary.supplyWei,null);
  assert.equal(a.modelInputActivated,false);assert.equal(a.independentCanonicalValidation,false);
});
test('even individual whole-epoch end stocks retain the UTC mismatch',()=>{
  const a=analyze(document([row(first-47,first-16),row(first-15,first+16)]));
  assert.equal(a.observedGrid.strideSlots,32);assert.equal(a.utcAlignment.gcdGridAndDailyAdvance,32);
  assert.equal(a.utcAlignment.conditionalIncompatibilityProven,true);
});
test('single-slot capability does not imply full historical flow availability',()=>{
  const a=analyze(document([row(first-1),row(last)]));
  assert.equal(a.observedGrid.strideSlots,1);assert.equal(a.utcAlignment.conditionalIncompatibilityProven,false);
  assert.equal(a.requestedWindow.startBoundary.stockAvailable,true);assert.equal(a.requestedWindow.endBoundary.stockAvailable,true);
  assert.equal(a.requestedWindow.exactWholeRowFlowCoverage,false);
  assert.equal(a.fullModelSnapshotReady,false);
});
test('a deliberately shifted synthetic grid exactly aligns both UTC stocks',()=>{
  const slots=[];for(let end=first-1;end<=last;end+=960)slots.push(row(end-959,end));
  const a=analyze(document(slots));
  assert.equal(a.observedGrid.uniformAlignedGridObserved,true);
  assert.equal(a.utcAlignment.conditionalIncompatibilityProven,false);
  assert.equal(a.requestedWindow.startBoundary.sameObservedGridCouldLabelThisSlot,true);
  assert.equal(a.requestedWindow.endBoundary.sameObservedGridCouldLabelThisSlot,true);
  assert.equal(a.requestedWindow.exactWholeRowFlowCoverage,true);
  assert.equal(a.modelInputActivated,false);
});
test('currently absent grid alignment may occur on another UTC day',()=>{
  const a=analyze(document([row(first-480,first+479),row(first+480,first+1439)]));
  assert.equal(a.requestedWindow.startBoundary.sameObservedGridCouldLabelThisSlot,false);
  assert.equal(a.requestedWindow.startBoundary.anyDailyUtcBoundaryCouldAlignIfGridPersists,true);
  assert.equal(a.utcAlignment.conditionalIncompatibilityProven,false);
});
test('irregular bucket widths do not establish a persistent grid',()=>{
  const p=grid();p.slots[1]=row(p.slots[1].fromSlot,p.slots[1].toSlot-1);
  const a=analyze(p);assert.equal(a.observedGrid.uniformAlignedGridObserved,false);
  assert.equal(a.utcAlignment.status,'regular-grid-not-established');
  assert.equal(a.requestedWindow.startBoundary.sameObservedGridCouldLabelThisSlot,null);
});
test('mixed interior label offsets do not become an end-stock grid',()=>{
  const p=grid();const r=p.slots[1];p.slots[1]=row(r.fromSlot,r.toSlot,r.toSlot-1);
  const a=analyze(p);assert.equal(a.observedGrid.allLabelsAtBucketEnd,false);
  assert.equal(a.observedGrid.uniformAlignedGridObserved,false);
});
test('a single observed bucket does not establish a repeated grid',()=>{
  const a=analyze(document([row(last-959,last)]));assert.equal(a.observedGrid.uniformAlignedGridObserved,false);
  assert.equal(a.utcAlignment.conditionalIncompatibilityProven,false);
});
test('row overlap, reversed ordering and out-of-range labels are rejected',()=>{
  const p=grid();assert.throws(()=>analyze({...p,slots:[p.slots[0],p.slots[0]]}),/overlap|ascending/);
  assert.throws(()=>analyze({...p,slots:[...p.slots].reverse()}),/overlap|ascending/);
  assert.throws(()=>analyze(document([row(first,first+3,first-1)])),/outside/);
});
test('slot, epoch and explicit endpoint clocks bind the original row',()=>{
  for(const key of ['timestamp','epoch','fromTimestamp','toTimestamp']){
    const p=grid();p.slots[0][key]++;assert.throws(()=>analyze(p),/clock|epoch|timestamp/);
  }
});
test('past labels cannot hide coverage after actual collection',()=>{
  const future=Math.floor((Date.parse(collectedAt)/1000-G)/S)+1;
  const p=document([row(future-32,future,future-32)]);
  assert.throws(()=>analyze(p),/coverage exceeds actual collection/);
});
test('unfinished requested days and excessive provider clocks are rejected',()=>{
  assert.throws(()=>analyzeEthereumSupplyResolution(grid(),{collectedAt,observedThrough:'2026-10-27'}),/not yet complete/);
  assert.throws(()=>analyze({...grid(),generatedAt:Date.parse(collectedAt)/1000+301}),/generation clock/);
});
test('partial, recovery and delta histories cannot masquerade as standalone snapshots',()=>{
  for(const extra of [{partial:true},{baseRevision:2},{baseRevision:null},{recoveryRequired:true},{dropBeforeSlot:0}])
    assert.throws(()=>analyze({...grid(),...extra}),/Incremental or recovery/);
});
test('missing raw rows and malformed stock values never become zeros',()=>{
  for(const p of [null,{},document([]),{...grid(),chainId:2}])assert.throws(()=>analyze(p));
  for(const value of [0,'01','1.0','-1','1e20']){const p=grid();p.slots[0].supplyWei=value;assert.throws(()=>analyze(p),/canonical exact/);}
  const p=document([row(first-1),row(last)]);p.slots[0].supplyWei=null;delete p.slots[1].supplyWei;
  const a=analyze(p);assert.equal(a.requestedWindow.startBoundary.stockAvailable,false);assert.equal(a.requestedWindow.endBoundary.supplyWei,null);
});
test('pure geometry analysis leaves supplied rows unchanged',()=>{
  const p=grid(),before=JSON.stringify(p);analyze(p);assert.equal(JSON.stringify(p),before);
});

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'eth-supply-resolution-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path='build/ethereum-supply-accounting/capture-fixture',dir=join(root,path);await mkdir(dir,{recursive:true});
  const raw=Buffer.from(JSON.stringify(grid())+'\n'),rawSha=sha(raw);
  const receipt={version:'eth-supply-accounting-audit-3',status:'provider-accounting-audited',collectedAt,
    sourceCommit:'a'.repeat(40),runId:'synthetic-test',rawFiles:[{file:'history-30d.raw.json',url:SOURCE.historyUrl,complete:true,bytes:raw.length,sha256:rawSha}],
    network:[{url:SOURCE.historyUrl,requestedAt:'2026-10-27T11:59:50.000Z',responseReceivedAt:'2026-10-27T11:59:51.000Z',completedAt:'2026-10-27T11:59:52.000Z',
      complete:true,httpStatus:200,receivedBytes:raw.length,sha256:rawSha,responseHeaders:{'x-supply-sha256':rawSha}}]};
  await writeFile(join(dir,'history-30d.raw.json'),raw);await writeFile(join(dir,'receipt.json'),JSON.stringify(receipt));
  return {root,dir,path,receipt,raw};
}
const report=root=>buildEthereumSupplyResolutionReport({repositoryRoot:root,informationCutoffAt:'2026-10-28T00:00:00.000Z'});
test('loader replays original bound bytes and original clocks with no network',async t=>{
  const f=await fixture(t),a=await report(f.root);assert.equal(a.status,'diagnosed');assert.equal(a.diagnosedCaptures,1);
  assert.equal(a.captures[0].diagnostic.collectedAt,collectedAt);assert.equal(a.sameGridConditionalIncompatibilityCount,1);
  assert.equal(a.inputFiles[f.path+'/history-30d.raw.json'].sha256,sha(f.raw));assert.equal(a.networkRequests,0);
});
test('audited receipt with missing raw file is invalid evidence, not an empty observation',async t=>{
  const f=await fixture(t);await rm(join(f.dir,'history-30d.raw.json'));const a=await report(f.root);
  assert.equal(a.status,'invalid-source-evidence');assert.equal(a.invalidSourceCaptures,1);assert.equal(a.diagnosedCaptures,0);
});
test('changed bytes, wrong digest and reordered acquisition clocks are rejected',async t=>{
  const f=await fixture(t);
  await writeFile(join(f.dir,'history-30d.raw.json'),Buffer.concat([f.raw,Buffer.from(' ')]));assert.equal((await report(f.root)).invalidSourceCaptures,1);
  await writeFile(join(f.dir,'history-30d.raw.json'),f.raw);
  f.receipt.network[0].responseHeaders['x-supply-sha256']='0'.repeat(64);await writeFile(join(f.dir,'receipt.json'),JSON.stringify(f.receipt));
  assert.equal((await report(f.root)).invalidSourceCaptures,1);
  f.receipt.network[0].responseHeaders['x-supply-sha256']=sha(f.raw);f.receipt.network[0].completedAt='2026-10-27T12:00:01.000Z';
  await writeFile(join(f.dir,'receipt.json'),JSON.stringify(f.receipt));assert.equal((await report(f.root)).invalidSourceCaptures,1);
});
test('failed acquisition remains unavailable and cannot produce a grid diagnosis',async t=>{
  const f=await fixture(t);await writeFile(join(f.dir,'receipt.json'),JSON.stringify({status:'failed',error:'HTTP 403'}));
  const a=await report(f.root);assert.equal(a.status,'source-unavailable');assert.equal(a.unavailableCaptures,1);
  assert.equal(a.diagnosedCaptures,0);assert.equal(a.captures[0].reason,'HTTP 403');
});
test('future capture and source-path escape cannot supply current evidence',async t=>{
  const f=await fixture(t);const a=await buildEthereumSupplyResolutionReport({repositoryRoot:f.root,informationCutoffAt:'2026-10-27T11:00:00.000Z'});
  assert.equal(a.invalidSourceCaptures,1);
  await assert.rejects(buildEthereumSupplyResolutionReport({repositoryRoot:f.root,informationCutoffAt:'2026-10-28T00:00:00.000Z',captureRoots:['../outside']}),/capture roots/);
});
test('symlinked raw evidence is rejected even when its bytes match',async t=>{
  const f=await fixture(t),target=join(f.root,'outside-source.json');await writeFile(target,f.raw);
  await rm(join(f.dir,'history-30d.raw.json'));await symlink(target,join(f.dir,'history-30d.raw.json'));
  assert.equal((await report(f.root)).invalidSourceCaptures,1);
});
test('capture-root symlinks cannot redirect directory discovery',async t=>{
  const f=await fixture(t);await symlink(join(f.root,'build/ethereum-supply-accounting'),join(f.root,'aliased-captures'));
  await assert.rejects(buildEthereumSupplyResolutionReport({repositoryRoot:f.root,informationCutoffAt:'2026-10-28T00:00:00.000Z',captureRoots:['aliased-captures']}),/Capture root/);
});
