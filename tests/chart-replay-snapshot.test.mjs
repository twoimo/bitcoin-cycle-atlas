import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureReplayView,sealReplaySnapshot,restoreReplaySnapshot,persistReplayDraft} from '../dist/chart-replay-snapshot.js';
import {createCurrentChartReplaySession,buildReplayChartData,buildReplayFrame} from '../dist/forecast-replay.js';
import {createAtlasReplayContext} from '../dist/chart-replay-atlas.js';
import {parseProjectReplayBaseline} from '../dist/project-replay-baseline.js';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';

const capturedAt='2026-10-26T23:00:00.000Z';
const later='2026-10-31T00:00:00.000Z';
const baseline=await parseProjectReplayBaseline(await readFile(new URL('../dist/data/project-origin-btc-2026-10-21.json',import.meta.url),'utf8'));
const archive=await parseBitcoinReplayCandles(await readFile(new URL('../dist/data/btc-volume.json',import.meta.url),'utf8'),{now:Date.parse(later)});
function view(){return {dataset:structuredClone(baseline.dataset),forecast:structuredClone(baseline.forecast),start:'2024-10-20',end:'2028-10-20',
  frequency:'weekly',chartType:'candles',window:'focus',presentation:{band:true,scale:'log',unit:'usd',showCycleMarkers:true,showCycleIntervals:true}};}
async function fixture(){
  const captured=captureReplayView(view());
  const session=await createCurrentChartReplaySession({...archive,dataset:captured.dataset,forecast:captured.forecast,
    asOf:'2026-10-20',playbackStartDate:'2026-10-21',createdAt:capturedAt,evaluatedAt:capturedAt});
  const context=createAtlasReplayContext({dataset:session.chartDataset,forecast:session.chartForecast,presentation:captured.presentation,originDate:session.asOf});
  const snapshot=await sealReplaySnapshot({view:captured,atlasContext:context,identity:session.identity});
  const draft={version:1,symbol:'BTCUSD',mode:'atlas-chart',origin:session.asOf,startDate:'2026-10-21',cursorDate:'2026-10-24',cursorIndex:4,
    outputHash:session.identity.outputHash,frequency:'weekly',forecastSnapshot:snapshot};
  return {captured,session,context,snapshot,draft};
}
function storage(initial='previous saved session'){
  const values=new Map([['replay',initial]]);
  return {values,getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
}

test('capture owns the painted path, range and presentation before a live mutation',()=>{
  const live=view(),captured=captureReplayView(live);
  live.forecast.path[1].price=1;live.forecast.path[1].lower=0;live.presentation.band=false;live.dataset.prices[0][1]=1;
  assert.notEqual(captured.forecast.path[1].price,1);assert.notEqual(captured.dataset.prices[0][1],1);assert.equal(captured.presentation.band,true);
  assert.ok(Object.isFrozen(captured.forecast.path[1]));assert.equal(captureReplayView(null),null);
});
test('saved curve restores despite a different current live model',async()=>{
  const {snapshot,draft,session,context}=await fixture(),store=storage();persistReplayDraft(store,'replay',draft);
  const newer=view();newer.forecast.path[1].price*=1.1;newer.forecast.path[1].upper*=1.1;
  const saved=JSON.parse(store.getItem('replay'));
  const restored=await restoreReplaySnapshot(saved.forecastSnapshot,{outputHash:saved.outputHash,origin:saved.origin,now:Date.parse(later)});
  const resumed=await createCurrentChartReplaySession({...archive,dataset:restored.view.dataset,forecast:restored.view.forecast,asOf:saved.origin,
    playbackStartDate:saved.startDate,createdAt:restored.capturedAt,evaluatedAt:later});
  assert.equal(resumed.identity.outputHash,session.identity.outputHash);assert.deepEqual(resumed.forecast,session.forecast);
  assert.deepEqual(restored.atlasContext,context);assert.equal(restored.snapshot.digest,snapshot.digest);
  assert.notEqual(newer.forecast.path[1].price,resumed.chartForecast.path[1].price);
  assert.equal(resumed.identity.issuedAt,null);assert.equal(resumed.policy.forecastScoringEnabled,false);
  assert.deepEqual(buildReplayFrame(resumed,{cursorDate:'2026-10-24'}).dailyComparisons,[]);
});
test('a later actual observation can be revealed without changing the old curve or capture time',async()=>{
  const {snapshot,draft,session}=await fixture(),restored=await restoreReplaySnapshot(snapshot,{outputHash:draft.outputHash,origin:draft.origin,now:Date.parse(later)});
  // Explicit synthetic extension: proves clock handling, not a market-price claim.
  const observations=[...archive.observations,{date:'2026-10-26',price:80001,open:80000,high:80100,low:79900,close:80001,volume:10}];
  const resumed=await createCurrentChartReplaySession({...archive,observations,observedThrough:'2026-10-26',observedAt:'2026-10-27T01:00:00Z',
    dataset:restored.view.dataset,forecast:restored.view.forecast,asOf:draft.origin,playbackStartDate:draft.startDate,
    createdAt:restored.capturedAt,evaluatedAt:later});
  assert.ok(resumed.timeline.includes('2026-10-26'));assert.equal(resumed.identity.createdAt,capturedAt);
  assert.equal(resumed.identity.outputHash,session.identity.outputHash);assert.deepEqual(resumed.forecast,session.forecast);
  assert.equal(buildReplayFrame(resumed,{cursorDate:'2026-10-26'}).selected.actual,80001);
});
for(const field of ['price','lower','upper'])test('changed saved '+field+' fails closed without replacing prior bytes',async()=>{
  const {snapshot,draft}=await fixture(),changed=structuredClone(snapshot),store=storage();changed.view.forecast.path[1][field]+=1;
  await assert.rejects(restoreReplaySnapshot(changed,{outputHash:draft.outputHash,origin:draft.origin,now:Date.parse(later)}),/변경/);
  assert.equal(store.getItem('replay'),'previous saved session');
});
test('changed saved cycle annotations fail integrity verification',async()=>{
  const {snapshot,draft}=await fixture(),changed=structuredClone(snapshot);changed.atlasContext.cycleMarkers.push({date:'2028-01-01',price:999});
  await assert.rejects(restoreReplaySnapshot(changed,{outputHash:draft.outputHash,origin:draft.origin,now:Date.parse(later)}),/변경/);
});
test('snapshot cannot be substituted for a different saved session',async()=>{
  const {snapshot,draft}=await fixture();
  await assert.rejects(restoreReplaySnapshot(snapshot,{outputHash:'f'.repeat(64),origin:draft.origin}),/식별자/);
  await assert.rejects(restoreReplaySnapshot(snapshot,{outputHash:draft.outputHash,origin:'2026-10-19'}),/식별자/);
});
test('capture and verification do not persist; only explicit save writes',async()=>{
  const {snapshot,draft}=await fixture(),store=storage();
  await restoreReplaySnapshot(snapshot,{outputHash:draft.outputHash,origin:draft.origin,now:Date.parse(later)});
  assert.equal(store.getItem('replay'),'previous saved session');persistReplayDraft(store,'replay',draft);
  assert.equal(JSON.parse(store.getItem('replay')).forecastSnapshot.digest,snapshot.digest);
});
test('quota failure keeps the previous saved session byte-for-byte',async()=>{
  const {draft}=await fixture(),store=storage();store.setItem=()=>{throw new DOMException('Storage full','QuotaExceededError');};
  assert.throws(()=>persistReplayDraft(store,'replay',draft),/Storage full/);assert.equal(store.getItem('replay'),'previous saved session');
});
test('current-chart save cannot silently degrade into a hash-only save',async()=>{
  const {draft}=await fixture(),store=storage();delete draft.forecastSnapshot;
  assert.throws(()=>persistReplayDraft(store,'replay',draft),/원본/);assert.equal(store.getItem('replay'),'previous saved session');
});
test('other replay modes keep their existing small session format',()=>{
  const store=storage(),draft={version:1,mode:'recorded',recordId:'test-record'};persistReplayDraft(store,'replay',draft);
  assert.deepEqual(JSON.parse(store.getItem('replay')),draft);
});
test('weekly D updates retain the open and all frozen forecast rows',async()=>{
  const {session}=await fixture(),one=buildReplayChartData(session,{cursorDate:'2026-10-21',frequency:'weekly'}),two=buildReplayChartData(session,{cursorDate:'2026-10-22',frequency:'weekly'});
  const a=one.observedCandles.at(-1),b=two.observedCandles.at(-1);
  assert.equal(a.periodStartDate,b.periodStartDate);assert.equal(a.open,b.open);assert.equal(b.daysIncluded,a.daysIncluded+1);
  assert.equal(a.close,84023.24);assert.equal(b.close,81315.35);assert.deepEqual(one.frame.forecast,two.frame.forecast);
  assert.equal(two.frame.policy.forecastScoringEnabled,false);
});
test('unrevealed actual extremes cannot change the disclosed replay data',async()=>{
  const {session,captured}=await fixture();
  const observations=archive.observations.map(row=>row.date==='2026-10-25'?{...row,open:1e7,high:1e8,low:1e6,close:2e7,price:2e7}:row);
  const other=await createCurrentChartReplaySession({...archive,observations,dataset:captured.dataset,forecast:captured.forecast,
    asOf:'2026-10-20',playbackStartDate:'2026-10-21',createdAt:capturedAt,evaluatedAt:later});
  const a=buildReplayChartData(session,{cursorDate:'2026-10-21',frequency:'weekly'}),b=buildReplayChartData(other,{cursorDate:'2026-10-21',frequency:'weekly'});
  assert.deepEqual(a.observedCandles,b.observedCandles);assert.deepEqual(a.frame.forecast,b.frame.forecast);
  assert.deepEqual(a.frame.priceDomain,b.frame.priceDomain);
});
