import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastHash} from '../dist/forecast-records.js';
import {createEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord} from '../dist/ethereum-prospective-records.js';
import {decideEthereumProspectiveIssue} from '../scripts/ethereum-prospective-reuse.mjs';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';

async function variant(f,{excludedClose=105,excludedVolume=20,offset=10000,editCompleted,forecast=f.forecast,model=f.model}={}){
  const rows=JSON.parse(f.tail.text);
  if(editCompleted)editCompleted(rows);
  rows.unshift([f.snapshot.request.requestedEnd,90,120,100,excludedClose,excludedVolume]);
  const shift=at=>new Date(Date.parse(at)+offset).toISOString();
  const tail={...f.tail,text:JSON.stringify(rows),requestStartedAt:shift(f.tail.requestStartedAt),bodyCompletedAt:shift(f.tail.bodyCompletedAt)};
  const snapshot=await createEthereumResearchSnapshot({base:f.base,tail});
  const record=await createEthereumProspectiveRecord({...f.args,snapshot,forecast,model,
    generationStartedAt:shift(f.args.generationStartedAt),generatedAt:shift(f.args.generatedAt),issuedAt:shift(f.args.issuedAt)});
  return {snapshot,record};
}
const decide=(f,v,records=[f.record],snapshots={[f.snapshot.id]:f.snapshot})=>
  decideEthereumProspectiveIssue({records,snapshots,candidate:v.record,candidateSnapshot:v.snapshot});

test('changing excluded live candle preserves the first issued record and source snapshot',async()=>{
  const f=await prospectiveFixture(),v=await variant(f);
  assert.notEqual(v.snapshot.tail.sourceHash,f.snapshot.tail.sourceHash);
  assert.notEqual(v.record.runKey,f.record.runKey);
  assert.equal(v.snapshot.primaryPricesHash,f.snapshot.primaryPricesHash);
  const d=await decide(f,v);
  assert.equal(d.action,'reuse');assert.equal(d.record.id,f.record.id);
  assert.equal(d.record.issuedAt,f.record.issuedAt);assert.equal(d.record.snapshotId,f.snapshot.id);
  assert.equal(d.reason,'same-completed-input-excluded-rows-may-differ');
});

test('all existing equivalent raw variants retain the earliest issuance',async()=>{
  const f=await prospectiveFixture(),older=await variant(f,{offset:10000}),later=await variant(f,{offset:20000,excludedClose:106});
  const d=await decide(f,later,[older.record,f.record],{[f.snapshot.id]:f.snapshot,[older.snapshot.id]:older.snapshot});
  assert.equal(d.record.id,f.record.id);assert.equal(d.equivalentPreservedIds.length,2);
});

test('completed OHLCV and completed close revisions remain distinct inputs',async()=>{
  const f=await prospectiveFixture();
  for(const editCompleted of [rows=>{rows[0][5]+=1;},rows=>{rows[1][4]=101;}]){
    const v=await variant(f,{editCompleted}),d=await decide(f,v);
    assert.equal(d.action,'append');assert.equal(d.record.id,v.record.id);
  }
});

test('identical consumed input with a different forecast is rejected',async()=>{
  const f=await prospectiveFixture(),forecast=structuredClone(f.forecast);
  forecast.path[30].price=181;
  const v=await variant(f,{forecast});
  await assert.rejects(decide(f,v),/Same completed-input candidate run produced different/);
});

test('changed model source remains a distinct candidate',async()=>{
  const f=await prospectiveFixture(),files={...f.model.files,'dist/ethereum-adaptive-model.js':'d'.repeat(64)};
  const model={...f.model,files,sourceHash:await forecastHash(files)},v=await variant(f,{model});
  assert.equal((await decide(f,v)).action,'append');
});

test('reuse cannot borrow an issuance from after the attempted generation',async()=>{
  const f=await prospectiveFixture(),later=await variant(f);
  await assert.rejects(decideEthereumProspectiveIssue({records:[later.record],snapshots:{[later.snapshot.id]:later.snapshot},
    candidate:f.record,candidateSnapshot:f.snapshot}),/issued after this attempt/);
});

test('claimed normalized prices must still reconstruct from the retained raw bytes',async()=>{
  const f=await prospectiveFixture(),v=await variant(f);
  v.snapshot.primaryPrices[0][1]=999;
  await assert.rejects(decide(f,v),/snapshot source, prices, hash or metadata mismatch/);
});
