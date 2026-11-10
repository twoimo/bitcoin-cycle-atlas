import assert from 'node:assert/strict';
import test from 'node:test';
import{ensureOwnedVisibleForPaint}from'../scripts/browser-paint-readiness.mjs';
test('visible targets do not activate any browser tab',async()=>{
  let calls=0;const cdp={send:async()=>{calls++;}};
  assert.deepEqual(await ensureOwnedVisibleForPaint(cdp,async target=>{assert.equal(target,cdp);return 'visible';},async()=>assert.fail('unexpected wait')),{reactivated:false});assert.equal(calls,0);
});
test('a hidden owned target is natively reactivated and read back before paint',async()=>{
  const events=[],cdp={send:async method=>events.push(method)};let reads=0;
  const evaluate=async(target,fn)=>{assert.equal(target,cdp);events.push('read');return reads++===0?'hidden':true;};
  const until=async(predicate,label,budget)=>{assert.equal(budget,10000);assert.match(label,/owned browser/);assert.equal(await predicate(),true);};
  assert.deepEqual(await ensureOwnedVisibleForPaint(cdp,evaluate,until),{reactivated:true});assert.deepEqual(events,['read','Page.bringToFront','read']);
});
test('native activation without visible readback cannot qualify',async()=>{
  let calls=0;const cdp={send:async()=>{calls++;}};let reads=0;
  await assert.rejects(ensureOwnedVisibleForPaint(cdp,async()=>reads++===0?'hidden':false,async predicate=>{if(!await predicate())throw Error('still hidden');}),/still hidden/);assert.equal(calls,1);
});
test('activation errors and unknown states propagate without a target fallback',async()=>{
  const cdp={send:async()=>{throw Error('target lost');}};
  await assert.rejects(ensureOwnedVisibleForPaint(cdp,async()=> 'hidden',async()=>assert.fail()),/target lost/);
  await assert.rejects(ensureOwnedVisibleForPaint(cdp,async()=> 'prerender',async()=>assert.fail()),/Unexpected owned browser visibility/);
});
