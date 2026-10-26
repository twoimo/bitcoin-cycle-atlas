import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionCloseUtc, observationTiming, expectedObservationDate, describeFreshness, alignObservations } from '../dist/data-freshness.js';

test('a collected vintage cannot precede its completed observation or known publication',()=>{
  const now='2026-10-26T12:00:00Z';
  assert.throws(()=>describeFreshness({latestDate:'2026-10-25',observedAt:'2026-10-20T00:00:00Z'},now),/precedes.*close/);
  assert.throws(()=>alignObservations([{symbol:'BTC',prices:[['2026-10-25',10]],observedAt:'2026-10-20T00:00:00Z'}],now,{mode:'observed'}),/precedes.*close/);
  assert.throws(()=>alignObservations([{symbol:'BTC',prices:[{date:'2026-10-25',close:10,availableAt:'2026-10-26T04:00:00Z',observedAt:'2026-10-26T03:00:00Z'}]}],now,{mode:'observed'}),/publication.*collection/);
  const equity=describeFreshness({latestDate:'2026-10-23',market:'equity',observedAt:'2026-10-23T20:05:00Z'},now);
  assert.equal(equity.code,'closed','a real Friday session can be collected after its20:00UTC close before next-day eligibility');
  assert.throws(()=>describeFreshness({latestDate:'2026-10-25',observedAt:'2026-02-30T00:00:00Z'},now),/Invalid calendar/);
});

test('exchange close follows DST, early close and bounded holiday calendar',()=>{
  assert.equal(sessionCloseUtc('2026-03-06','equity'),'2026-03-06T21:00:00.000Z');
  assert.equal(sessionCloseUtc('2026-03-09','equity'),'2026-03-09T20:00:00.000Z');
  assert.equal(sessionCloseUtc('2026-11-02','equity'),'2026-11-02T21:00:00.000Z');
  assert.equal(sessionCloseUtc('2026-11-27','equity'),'2026-11-27T18:00:00.000Z');
  assert.equal(sessionCloseUtc('2026-11-26','equity'),null);
  assert.equal(sessionCloseUtc('2028-01-03','equity'),'2028-01-03T21:00:00.000Z');
  assert.equal(sessionCloseUtc('2029-01-03','equity'),null);
  assert.throws(()=>sessionCloseUtc('2026-02-30'));
});
test('completion policy does not pretend to know provider publication time',()=>{
  const time=observationTiming('2026-11-27','equity');
  assert.equal(time.eligibleAt,'2026-11-28T00:00:00.000Z');
  assert.equal(time.availableAt,null);
  assert.equal(time.availabilityKnown,false);
  assert.equal(expectedObservationDate('2026-11-27T22:00:00Z','equity'),'2026-11-25');
  assert.equal(expectedObservationDate('2026-11-28T00:00:00Z','equity'),'2026-11-27');
});
test('weekend equity closure, stale crypto, failed refresh and gaps stay distinct',()=>{
  const now='2026-10-26T05:00:00Z';
  assert.equal(describeFreshness({latestDate:'2026-10-23',market:'equity'},now).code,'closed');
  assert.equal(describeFreshness({latestDate:'2026-10-23'},now).code,'delayed');
  assert.equal(describeFreshness({latestDate:'2026-10-25',lastOutcome:'failure'},now).code,'retained');
  assert.equal(describeFreshness({latestDate:'2026-10-25',gaps:1},now).code,'gap');
  assert.equal(describeFreshness({latestDate:'2026-10-26'},now).code,'future');
  assert.equal(describeFreshness({latestDate:'2026-10-24',market:'equity'},now).code,'incomparable');
  assert.throws(()=>describeFreshness({latestDate:'2026-10-25'},'2026-10-26T05:00:00'));
});
test('common cutoff cannot borrow the later UTC crypto close',()=>{
  const result=alignObservations([
    {symbol:'BTC',prices:[['2026-10-22',100],['2026-10-23',110]]},
    {symbol:'MSTR',market:'equity',prices:[['2026-10-22',10],['2026-10-23',11]]},
  ],'2026-10-23T20:00:00Z');
  assert.deepEqual(result.rows.map(row=>row.observation.date),['2026-10-22','2026-10-22']);
  assert.equal(result.simultaneousPrices,false);
  const midnight=alignObservations([{symbol:'BTC',prices:[['2026-10-23',110]]},{symbol:'MSTR',market:'equity',prices:[['2026-10-23',11]]}],'2026-10-24T00:00:00Z');
  assert.deepEqual(midnight.rows.map(row=>row.observation.ageHours),[0,4]);
});
test('observed alignment rejects a vintage captured after the requested cutoff',()=>{
  const inputs=[{symbol:'BTC',observedAt:'2026-10-26T01:00:00Z',prices:[['2026-10-23',100],['2026-10-26',NaN]]}];
  assert.equal(alignObservations(inputs,'2026-10-24T00:00:00Z',{mode:'observed'}).rows[0].status,'unavailable');
  assert.equal(alignObservations(inputs,'2026-10-24T00:00:00Z').rows[0].observation.price,100);
  assert.throws(()=>alignObservations([{symbol:'BTC',prices:[['2026-10-23',NaN]]}],'2026-10-24T00:00:00Z'));
});
