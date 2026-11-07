import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { waitForChartReplayToolbarScroll, swipeChartReplayToolbarToEdge } from '../scripts/verify-chart-replay-browser.mjs';

// Exercise the actual read-only browser observer with controllable animation
// frames and native scroll events. This is not a claim of a Chrome render.
function scrollObserver({ left = 0, timeoutMs = 4000, quietMs = 140 } = {}) {
  let now = 0, nextId = 0, current = left, outcome;
  const frames = new Map(), timers = new Map(), listeners = new Map();
  const node = {
    get scrollLeft() { return current; }, set scrollLeft(_) { throw new Error('The observer may not set scrollLeft'); },
    clientWidth: 153, scrollWidth: 553, getClientRects: () => [{}],
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
  };
  const promise = vm.runInNewContext(`(${waitForChartReplayToolbarScroll.toString()})(options)`, {
    document: { querySelector: () => node }, performance: { now: () => now }, options: { timeoutMs, quietMs },
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, ms) { const id = ++nextId; timers.set(id, { callback, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  promise.then(value => { outcome = { value }; }, error => { outcome = { error }; });
  return {
    promise, get outcome() { return outcome; }, get pending() { return { frames: frames.size, timers: timers.size, listeners: listeners.size }; },
    async frame(ms, { left: next, end = false } = {}) {
      now += ms;
      if (next !== undefined && next !== current) { current = next; listeners.get('scroll')?.(); }
      if (end) listeners.get('scrollend')?.();
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(now);
      await Promise.resolve();
    },
  };
}

test('native toolbar observer does not finish during inertia after the old 150ms settle delay', async () => {
  const observer = scrollObserver();
  for (const left of [25, 60, 105, 140, 170]) {
    await observer.frame(50, { left });
    assert.equal(observer.outcome, undefined, 'Moving content cannot be considered settled');
  }
  await observer.frame(16, { end: true });
  assert.equal(observer.outcome, undefined, 'One rendered frame after scrollend is insufficient');
  await observer.frame(16);
  const value = await observer.promise;
  assert.equal(value.left, 170); assert.equal(value.settledBy, 'scrollend'); assert.equal(value.endEvents, 1);
  assert.ok(value.elapsedMs > 150);
  assert.deepEqual(observer.pending, { frames: 0, timers: 0, listeners: 0 });
});

test('native toolbar at its edge can settle from observed stable positions without a scrollend event', async () => {
  const observer = scrollObserver();
  await observer.frame(100); await observer.frame(30);
  assert.equal(observer.outcome, undefined, 'The observer needs a quiet window and at least three frames');
  await observer.frame(20);
  const value = await observer.promise;
  assert.equal(value.left, 0); assert.equal(value.settledBy, 'position-stable'); assert.equal(value.scrollEvents, 0);
  assert.deepEqual(observer.pending, { frames: 0, timers: 0, listeners: 0 });
});

test('subpixel native movement resets the quiet window instead of producing a stale edge assertion', async () => {
  const observer = scrollObserver();
  for (const left of [.1, .2, .3, .4]) {
    await observer.frame(80, { left });
    assert.equal(observer.outcome, undefined);
  }
  await observer.frame(50); await observer.frame(50);
  assert.equal(observer.outcome, undefined);
  await observer.frame(50);
  const value = await observer.promise;
  assert.equal(value.left, .4); assert.equal(value.settledBy, 'position-stable'); assert.equal(value.scrollEvents, 4);
});

test('native scrolling that never settles fails with its actual position and cleans up the observer', async () => {
  const observer = scrollObserver({ timeoutMs: 300 });
  for (const left of [20, 40, 60, 80]) await observer.frame(80, { left });
  await assert.rejects(observer.promise, /Native replay toolbar scrolling did not settle:.*"left":80.*"settledBy":"timeout"/);
  assert.deepEqual(observer.pending, { frames: 0, timers: 0, listeners: 0 });
});

function nativeGestureFixture({ left = 0, blocked = false } = {}) {
  const box = { left: 13, right: 166, top: 347, bottom: 391, width: 153, height: 44 };
  const calls = [];
  let current = left, start = null, last = null, observed = 0;
  return {
    calls, get left() { return current; }, get observed() { return observed; },
    api: {
      cdp: { async send(method, parameters) {
        assert.equal(method, 'Input.dispatchTouchEvent', 'Reaching an edge must use native touch input');
        calls.push(parameters);
        if (parameters.type === 'touchStart') start = last = parameters.touchPoints[0];
        if (parameters.type === 'touchMove') {
          last = parameters.touchPoints[0];
          assert.ok(last.x > box.left && last.x < box.right && last.y > box.top && last.y < box.bottom);
        }
        if (parameters.type === 'touchEnd') {
          // This deliberate no-fling case leaves 24px of each gesture to its
          // touch threshold. Four ~99px swipes cannot traverse 400px.
          const distance = start.x - last.x, travelled = Math.sign(distance) * Math.max(0, Math.abs(distance) - 24);
          if (!blocked) current = Math.max(0, Math.min(400, current + travelled));
        }
      } },
      async evaluate(_, observer) {
        assert.equal(observer, waitForChartReplayToolbarScroll, 'The gesture driver may only observe the native scroll owner');
        observed++;
        return { left: current, maximum: 400, width: 153, settledBy: 'position-stable', elapsedMs: 150 };
      },
      async bounds(_, selector) { assert.equal(selector, '.chart-replay-actions'); return box; },
      async pause(ms) { assert.equal(ms, 30); },
    },
  };
}

test('narrow native toolbar reaches both strict edges without relying on fling or four fixed swipes', async () => {
  const native = nativeGestureFixture();
  const outward = await swipeChartReplayToolbarToEdge(native.api, -1);
  assert.equal(outward.before.left, 0); assert.equal(outward.after.left, 400);
  assert.equal(outward.swipes.length, 6); assert.ok(outward.maximumSwipes >= outward.swipes.length);
  const returning = await swipeChartReplayToolbarToEdge(native.api, 1);
  assert.equal(returning.before.left, 400); assert.equal(returning.after.left, 0);
  assert.equal(returning.swipes.length, 6);
  assert.equal(native.calls.filter(call => call.type === 'touchEnd').length, 12);
  assert.equal(native.observed, 14, 'Each gesture must finish with an observed settled position');
});

test('a blocked native toolbar still fails the strict return assertion with bounded gesture evidence', async () => {
  const native = nativeGestureFixture({ left: 24, blocked: true });
  await assert.rejects(swipeChartReplayToolbarToEdge(native.api, 1), /Native toolbar swipe could not return to Select bar:.*"left":24.*"maximumSwipes":10.*"swipes"/);
  assert.equal(native.left, 24);
  assert.equal(native.calls.filter(call => call.type === 'touchEnd').length, 10);
});
