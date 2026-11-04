import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {MarketSnapshot} from '@atlas/contracts/market-lab';
import {initialSnapshotState,snapshotNotice,snapshotReducer} from '../../apps/web/src/snapshot-state.js';

const doc=JSON.parse(await readFile(new URL('../../dist/data/market-lab.json',import.meta.url),'utf8')) as MarketSnapshot;
const api={kind:'api' as const,revision:'a'.repeat(64)};
const accepted=snapshotReducer(initialSnapshotState,{type:'received',doc,delivery:api});
const older=structuredClone(doc);older.generatedAt=new Date(Date.parse(doc.generatedAt)-86400000).toISOString();older.markets=[];
for(const region of Object.values(older.regions))for(const axis of Object.values(region.axes))axis.values=[];

test('older saved response cannot split accepted snapshot, revision or populated phase',()=>{
  const kept=snapshotReducer(accepted,{type:'received',doc:older,delivery:{kind:'saved',reason:'API unavailable'}});
  assert.equal(kept.doc,doc);assert.equal(kept.delivery,api);assert.equal(kept.phase,'loaded');
  assert.equal(snapshotNotice(kept)?.text,'연결 실패 · 직전 자료 유지');
});
test('retry and failure retain the accepted revision until a replacement is accepted',()=>{
  const loading=snapshotReducer(accepted,{type:'loading'});
  assert.equal(loading.doc,doc);assert.equal(loading.delivery,api);assert.equal(loading.phase,'loading');
  const failed=snapshotReducer(loading,{type:'failed',error:'connection lost'});
  assert.equal(failed.doc,doc);assert.equal(failed.delivery,api);assert.equal(failed.phase,'error');
  assert.equal(snapshotNotice(failed)?.text,'연결 실패 · 직전 자료 유지');
  const nextDoc={...doc,generatedAt:new Date(Date.parse(doc.generatedAt)+1000).toISOString()},nextApi={kind:'api' as const,revision:'b'.repeat(64)};
  const replaced=snapshotReducer(failed,{type:'received',doc:nextDoc,delivery:nextApi});
  assert.equal(replaced.doc,nextDoc);assert.equal(replaced.delivery,nextApi);assert.equal(replaced.phase,'loaded');
  assert.equal(replaced.error,'');assert.equal(snapshotNotice(replaced),null);
});
test('initial saved, static hosting, empty and API replacements retain their actual delivery semantics',()=>{
  const saved={kind:'saved' as const,reason:'static-hosting',revision:'c'.repeat(64)};
  const staticState=snapshotReducer(initialSnapshotState,{type:'received',doc,delivery:saved});
  assert.equal(staticState.delivery,saved);assert.deepEqual(snapshotNotice(staticState),{text:'저장 자료',retry:'다시 읽기'});
  const fallback=snapshotReducer(initialSnapshotState,{type:'received',doc,delivery:{kind:'saved',reason:'API unavailable'}});
  assert.equal(snapshotNotice(fallback)?.text,'연결 실패 · 저장본 표시');
  const empty=snapshotReducer(accepted,{type:'received',doc:older,delivery:api});
  assert.equal(empty.doc,older);assert.equal(empty.delivery,api);assert.equal(empty.phase,'empty');assert.equal(empty.retainedPrevious,false);
});
