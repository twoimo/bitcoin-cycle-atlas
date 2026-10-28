import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {ethereumProspectiveIndexEntry,verifyEthereumProspectiveRecord} from '../dist/ethereum-prospective-dispatch.js';
import {verifyEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {ETH_PROSPECTIVE_WRITE_BUDGET,validateEthereumProspectiveWriteBudget} from '../scripts/ethereum-prospective-write-guard.mjs';

const json=canonicalForecastJson,clone=structuredClone,hex=value=>value.toString(16).padStart(64,'0');
// Capacity-only metadata fixtures. These are not forecasts or observations and
// are deliberately never passed to a market-evidence validator or persisted.
const recordMetadata=i=>({schemaVersion:1,kind:'ethereum-prospective-record',recordKind:'issued',symbol:'ETHUSD',
  id:hex(i+1),runKey:hex(i+100001),snapshotId:'a'.repeat(64),modelKey:'adaptive',
  model:{version:'v',sourceHash:'b'.repeat(64)},asOf:'2026-10-26',issuedAt:'2026-10-27T12:00:00.000Z'});
const observationMetadata=i=>({schemaVersion:1,kind:'ethereum-prospective-input',id:hex(i+200001),
  informationCutoffAt:'2026-10-27T11:00:00.000Z'});
const independentMetadata=i=>({schemaVersion:1,kind:'atlas-asset-outcome-snapshot',symbol:'ETHUSD',id:hex(i+200001),
  sourceReceipt:{collectedAt:'2026-10-27T11:00:00.000Z'}});
const check=overrides=>validateEthereumProspectiveWriteBudget({records:[],observations:[],...overrides});

test('the proposed index uses every unique record, deterministic ID order and exact canonical UTF-8 bytes with LF',()=>{
  const old=[recordMetadata(2),recordMetadata(0)],added=recordMetadata(1),before=json(old);
  const result=check({records:old,additionalRecords:[added],observations:[observationMetadata(0)],additionalObservations:[independentMetadata(1)]});
  const expected={schemaVersion:1,kind:'ethereum-prospective-index',entries:[0,1,2].map(i=>ethereumProspectiveIndexEntry(recordMetadata(i)))};
  assert.deepEqual(result.projectedIndex,expected);
  assert.equal(result.projectedIndexText,json(expected)+'\n');
  assert.equal(result.projectedIndexBytes,Buffer.byteLength(result.projectedIndexText,'utf8'));
  assert.equal(result.existingRecords,2);assert.equal(result.additionalUniqueRecords,1);assert.equal(result.projectedRecords,3);
  assert.equal(result.projectedObservations,2);assert.equal(result.additionalUniqueObservations,1);
  assert.equal(json(old),before);assert.equal(result.rawEvidenceValidated,false);assert.equal(result.selectedEvidenceOmitted,false);
  assert.equal(result.limitsChanged,false);assert.equal(result.releaseAuthorized,false);
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.projectedIndex));assert.ok(Object.isFrozen(result.projectedIndex.entries));
  assert.throws(()=>{result.projectedIndex.entries[0].issuedAt='changed';},TypeError);
});

test('identical seed/build and proposed duplicates consume capacity once without changing the original issue',()=>{
  const record=recordMetadata(0),observation=observationMetadata(0);
  const result=check({records:[record,clone(record)],observations:[observation,clone(observation)],
    additionalRecords:[clone(record)],additionalObservations:[clone(observation)]});
  assert.equal(result.projectedRecords,1);assert.equal(result.projectedObservations,1);
  assert.equal(result.additionalUniqueRecords,0);assert.equal(result.additionalUniqueObservations,0);
  assert.equal(result.projectedIndex.entries[0].issuedAt,record.issuedAt);
});

test('a repeated immutable ID cannot hide changed payload even when projected index metadata is identical',()=>{
  const record=recordMetadata(0),observation=observationMetadata(0);
  assert.throws(()=>check({records:[record],additionalRecords:[{...clone(record),outputHash:'c'.repeat(64)}]}),/Conflicting immutable record ID/);
  assert.throws(()=>check({observations:[observation],additionalObservations:[{...clone(observation),primaryPrices:[]}]}),/Conflicting immutable observation ID/);
  assert.throws(()=>check({records:[record,{...clone(record),issuedAt:'2026-10-27T12:01:00.000Z'}]}),/Conflicting immutable record ID/);
});

test('different immutable IDs for one run are rejected across retained and proposed inventories',()=>{
  const first=recordMetadata(0),second=recordMetadata(1);second.runKey=first.runKey;
  assert.throws(()=>check({records:[first],additionalRecords:[second]}),/Conflicting immutable run key/);
  assert.throws(()=>check({records:[first,second]}),/Conflicting immutable run key/);
});

test('the merged record count is bounded before writing and cannot reset in the additional list',()=>{
  const all=Array.from({length:2001},(_,i)=>recordMetadata(i));
  assert.throws(()=>check({records:all.slice(0,1000),additionalRecords:all.slice(1000)}),/exceed 2000 merged records/);
  assert.throws(()=>check({records:all}),/exceed 2000 merged records/);
  // The byte cap is tighter than 2,000 entries for this valid-width shape;
  // passing a numeric count bound never disables the independent byte bound.
  assert.throws(()=>check({records:all.slice(0,2000)}),/1 MiB candidate index/);
});

test('all 500 prospective and independent ETH observations share one unchanged capacity',()=>{
  const observations=Array.from({length:499},(_,i)=>i%2?independentMetadata(i):observationMetadata(i));
  const result=check({observations,additionalObservations:[independentMetadata(499)]});
  assert.equal(result.projectedObservations,500);assert.equal(result.policy.maximumObservations,500);
  assert.throws(()=>check({observations,additionalObservations:[independentMetadata(499),observationMetadata(500)]}),/exceed 500 merged observations/);
  assert.throws(()=>check({observations:[...observations,independentMetadata(499),observationMetadata(500)]}),/exceed 500 merged observations/);
});

test('a same-ID prospective/independent collision is a conflict, not capacity deduplication',()=>{
  assert.throws(()=>check({observations:[observationMetadata(0)],additionalObservations:[independentMetadata(0)]}),/Conflicting immutable observation ID/);
});

test('exactly 1 MiB of canonical index bytes is accepted and one extra byte is blocked',()=>{
  const max=ETH_PROSPECTIVE_WRITE_BUDGET.maximumIndexBytes;
  const empty=Buffer.byteLength(json({schemaVersion:1,kind:'ethereum-prospective-index',entries:[]})+'\n');
  const entryBytes=Buffer.byteLength(json(ethereumProspectiveIndexEntry(recordMetadata(0))));
  const count=Math.floor((max-empty+1)/(entryBytes+1)),records=Array.from({length:count},(_,i)=>recordMetadata(i));
  let remaining=max-check({records}).projectedIndexBytes;
  for(const record of records){
    const add=Math.min(119,remaining);record.model.version+='x'.repeat(add);remaining-=add;
    if(!remaining)break;
  }
  assert.equal(remaining,0);
  const exact=check({records});assert.equal(exact.projectedIndexBytes,max);assert.ok(exact.projectedRecords<2000);
  records.find(record=>record.model.version.length<120).model.version+='x';
  assert.throws(()=>check({records}),/1 MiB candidate index/);
});

test('byte accounting includes multibyte model-version characters and is detached from caller mutation',()=>{
  const record=recordMetadata(0),ascii=check({records:[record]});record.model.version='한';
  const unicode=check({records:[record]});assert.equal(unicode.projectedIndexBytes,ascii.projectedIndexBytes+2);
  const preserved=unicode.projectedIndexText;record.model.version='after-return';
  assert.equal(unicode.projectedIndexText,preserved);assert.equal(unicode.projectedIndex.entries[0].modelVersion,'한');
});

test('malformed identity, unsupported asset, invalid origin and unbounded supplied duplicates fail explicitly',()=>{
  for(const replacement of [null,{...recordMetadata(0),id:'../bad'},
    {...recordMetadata(0),modelKey:'unknown'},{...recordMetadata(0),asOf:'2026-02-30'},
    {...recordMetadata(0),issuedAt:'invalid'},{...recordMetadata(0),recordKind:'backtest'}]){
    assert.throws(()=>check({records:[replacement]}));
  }
  assert.throws(()=>check({observations:[{...independentMetadata(0),symbol:'BTCUSD'}]}),/Only prospective or independent ETH/);
  assert.throws(()=>check({observations:[{...observationMetadata(0),informationCutoffAt:'invalid'}]}));
  assert.throws(()=>check({records:Array(4001).fill(recordMetadata(0))}),/Bounded record/);
  assert.throws(()=>check({observations:Array(2001).fill(observationMetadata(0))}),/Bounded observation/);
  assert.throws(()=>check({alreadyVerified:true}),/Only retained and additional/);
});

test('actual original records pass separate immutable raw validation before capacity checking without new issue clocks',async()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),directory=resolve(root,'research-data/ethereum-prospective-ledger');
  const index=JSON.parse(await readFile(resolve(directory,'index.json'),'utf8')),records=[],snapshots=new Map();
  for(const entry of index.entries){
    const record=JSON.parse(await readFile(resolve(directory,entry.recordPath),'utf8'));
    if(!snapshots.has(entry.snapshotId))snapshots.set(entry.snapshotId,JSON.parse(await readFile(resolve(directory,entry.snapshotPath),'utf8')));
    await verifyEthereumProspectiveRecord(record,snapshots.get(entry.snapshotId));records.push(record);
  }
  for(const snapshot of snapshots.values())await verifyEthereumResearchSnapshot(snapshot);
  const receipt=check({records,observations:[...snapshots.values()]});
  assert.equal(receipt.projectedRecords,3);assert.equal(receipt.additionalUniqueRecords,0);
  assert.deepEqual(receipt.projectedIndex,index);
  assert.deepEqual(receipt.projectedIndex.entries.map(entry=>entry.issuedAt),index.entries.map(entry=>entry.issuedAt));
  assert.equal(receipt.rawEvidenceValidated,false,'the earlier independent validators supply evidence validation, not this capacity receipt');
});
