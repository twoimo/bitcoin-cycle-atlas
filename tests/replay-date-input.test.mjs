import test from 'node:test';
import assert from 'node:assert/strict';
import {replayDateInputError} from '../dist/chart-replay.js';

const min='2011-08-22',max='2026-10-30';
for(const value of ['',null,undefined,'2099-08-24','2011-08-21','2026-02-29','2024-02-30','2026-13-01','2026-00-01','2026-10-00','2026-10-32','0000-01-01','10000-01-01','2026-8-24','2026-08-24T00:00:00Z',' 2026-08-24 ']){
  test('manual replay date rejects '+JSON.stringify(value),()=>assert.notEqual(replayDateInputError(value,min,max),''));
}
for(const value of [min,max,'2024-02-29','2026-08-24']){
  test('manual replay date accepts exact '+value,()=>assert.equal(replayDateInputError(value,min,max),''));
}
test('manual replay date fails closed on unknown or reversed observed bounds',()=>{
  for(const [a,b] of [['',max],[min,''],['bad',max],['2026-02-30',max],[max,min]])assert.notEqual(replayDateInputError('2026-08-24',a,b),'');
});
test('Gregorian century and timezone-neutral date checks',()=>{
  assert.notEqual(replayDateInputError('1900-02-29','1800-01-01','2100-12-31'),'');
  assert.equal(replayDateInputError('2000-02-29','1800-01-01','2100-12-31'),'');
  assert.notEqual(replayDateInputError('2100-02-29','1800-01-01','2100-12-31'),'');
});
