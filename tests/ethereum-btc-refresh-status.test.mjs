import assert from 'node:assert/strict';
import test from 'node:test';
import {describeBtcRefresh} from '../dist/btc-refresh-status.js';

const now=new Date('2026-10-27T05:00:00Z');
test('initial valid archive is quiet until a real refresh is attempted',()=>{
  const value=describeBtcRefresh({phase:'idle',asOf:'2026-10-25',now});
  assert.equal(value.visible,false);assert.equal(value.announcement,'');
});
test('provider failure retains a dated visible notice and permits retry',()=>{
  const value=describeBtcRefresh({phase:'failed',asOf:'2026-10-25',now});
  assert.equal(value.visible,true);assert.equal(value.busy,false);
  assert.equal(value.state,'failed');assert.match(value.detail,/2026\.10\.25 UTC 자료 유지/);
  assert.match(value.announcement,/실패/);assert.doesNotMatch(value.announcement,/최신 자료/);
});
test('a retry is busy with the archive cutoff, followed by a persistent failure',()=>{
  const busy=describeBtcRefresh({phase:'refreshing',asOf:'2026-10-25',now});
  assert.equal(busy.busy,true);assert.equal(busy.visible,true);assert.match(busy.detail,/2026\.10\.25/);
  const failed=describeBtcRefresh({phase:'failed',asOf:'2026-10-25',now});
  assert.equal(failed.busy,false);assert.equal(failed.visible,true);assert.equal(failed.state,'failed');
});
test('successful retrieval of an old archive is a provider delay, not current data',()=>{
  for(const phase of ['checked','published']){
    const value=describeBtcRefresh({phase,asOf:'2026-10-25',now});
    assert.equal(value.visible,true);assert.equal(value.state,'delayed');assert.equal(value.stale,true);
    assert.match(value.announcement,/최신 완료일보다 이전 자료/);
  }
});
test('fresh success hides the visual warning but preserves a distinct live announcement',()=>{
  const direct=describeBtcRefresh({phase:'checked',asOf:'2026-10-26',now});
  const publication=describeBtcRefresh({phase:'published',asOf:'2026-10-26',now});
  assert.equal(direct.visible,false);assert.equal(publication.visible,false);
  assert.match(direct.announcement,/제공자 확인 완료/);assert.match(publication.announcement,/배포 자료 수신/);
  assert.equal(direct.stale,false);assert.equal(publication.busy,false);
});
test('completed UTC day changes at midnight without a local-time assumption',()=>{
  const before=describeBtcRefresh({phase:'checked',asOf:'2026-10-26',now:'2026-10-27T23:59:59Z'});
  const after=describeBtcRefresh({phase:'checked',asOf:'2026-10-26',now:'2026-10-28T00:00:00Z'});
  assert.equal(before.visible,false);assert.equal(after.state,'delayed');assert.equal(after.visible,true);
});
test('unknown cutoffs never become fresh and invalid clocks/phases fail explicitly',()=>{
  for(const asOf of [null,'2026-02-30','not-a-date']){
    const value=describeBtcRefresh({phase:'checked',asOf,now});
    assert.equal(value.visible,true);assert.match(value.detail,/관측일 미확인/);
  }
  assert.throws(()=>describeBtcRefresh({phase:'success',now}),/phase/);
  assert.throws(()=>describeBtcRefresh({phase:'checked',now:'invalid'}),/clock/);
});
