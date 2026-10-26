import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceRecorder, performanceSnapshot, measureSync, initPerformanceDiagnostics } from '../dist/performance-diagnostics.js';

test('completed actions keep exact durations and cannot be completed twice', () => {
  let time = 10; const recorder = createPerformanceRecorder({ now: () => time });
  const id = recorder.begin('scenario-change', { scenario: 'base', secret: 'not collected' });
  time = 34; const done = recorder.finish(id, { status: 'complete' });
  assert.equal(done.durationMs, 24); assert.equal(done.details.secret, undefined);
  time = 60; assert.equal(recorder.finish(id), null); assert.equal(recorder.snapshot().entries.length, 1);
});

test('local diagnostics bound history, pending actions and exported mutable objects', () => {
  let time = 0; const recorder = createPerformanceRecorder({ now: () => ++time, limit: 2 });
  for (let i = 0; i < 4; i++) recorder.finish(recorder.begin('render'));
  const snapshot = recorder.snapshot(); assert.equal(snapshot.entries.length, 2); assert.equal(snapshot.dropped, 2);
  snapshot.entries[0].details.status = 'changed'; assert.equal(recorder.snapshot().entries[0].details.status, undefined);
  for (let i = 0; i < 41; i++) recorder.begin('navigation');
  assert.equal(recorder.snapshot().pending, 40); assert.equal(recorder.snapshot().dropped, 3);
});

test('unsupported or uncomputed field metrics are never filled with custom event durations', () => {
  const snapshot = performanceSnapshot();
  assert.equal(snapshot.observations.interactionToNextPaint.valueMs, null);
  assert.equal(snapshot.observations.interactionToNextPaint.status, 'not-computed');
  assert.match(snapshot.storage, /no transmission/);
});

test('a failed timed operation preserves the actual error', () => {
  const error = new Error('bad calculation');
  assert.throws(() => measureSync('calculation', () => { throw error; }), value => value === error);
});

test('first hidden drains pending layout shifts and ends the visible-session observation', () => {
  const keys = ['document','window','innerWidth','innerHeight','devicePixelRatio','navigator','location','PerformanceObserver','performance'];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const document = new EventTarget(); document.visibilityState = 'visible';
  const observers = new Map();
  class Observer {
    static supportedEntryTypes = ['largest-contentful-paint','layout-shift'];
    constructor(callback) { this.callback = callback; this.queued = []; this.disconnected = false; }
    observe({ type }) { observers.set(type, this); }
    takeRecords() { return this.queued.splice(0); }
    disconnect() { this.disconnected = true; }
  }
  const values = { document, window: {}, innerWidth:390, innerHeight:844, devicePixelRatio:1, navigator:{userAgent:'test'}, location:{search:''}, PerformanceObserver:Observer, performance:{now:()=>100} };
  try {
    for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    initPerformanceDiagnostics();
    observers.get('layout-shift').queued.push({startTime:80,value:0.2,hadRecentInput:false});
    observers.get('largest-contentful-paint').queued.push({startTime:70});
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    const observed = performanceSnapshot().observations;
    assert.equal(observed.cumulativeLayoutShift.value,0.2,'Shifts delivered after hiding must still count when they occurred while visible');
    assert.equal(observed.cumulativeLayoutShift.status,'observed-until-first-hidden');
    assert.equal(observers.get('layout-shift').disconnected,true);
    assert.equal(observed.largestContentfulPaint.valueMs,70);
  } finally {
    for (const [key,descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});

test('hiding a page cannot turn unsupported metrics into observed zeroes', async () => {
  const values = { document:new EventTarget(), window:{}, innerWidth:390, innerHeight:844, devicePixelRatio:1, navigator:{userAgent:'test'}, location:{search:''}, PerformanceObserver:undefined, performance:{now:()=>100} };
  const originals = new Map(Object.keys(values).map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  values.document.visibilityState = 'visible';
  try {
    for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    const diagnostics = await import('../dist/performance-diagnostics.js?unsupported-observer-test');
    diagnostics.initPerformanceDiagnostics();
    values.document.visibilityState='hidden'; values.document.dispatchEvent(new Event('visibilitychange'));
    const observed = diagnostics.performanceSnapshot().observations;
    assert.equal(observed.cumulativeLayoutShift.value,null);
    assert.equal(observed.cumulativeLayoutShift.status,'unsupported');
    assert.equal(observed.largestContentfulPaint.valueMs,null);
    assert.equal(observed.largestContentfulPaint.status,'unsupported');
  } finally {
    for (const [key,descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});

test('a page initially hidden has no visible-session CLS value', async () => {
  const document = new EventTarget(); document.visibilityState = 'hidden';
  class Observer {
    static supportedEntryTypes=['layout-shift'];
    observe() {}
    takeRecords() { return [{startTime:80,value:0.2,hadRecentInput:false}]; }
    disconnect() {}
  }
  const values = {document,window:{},innerWidth:390,innerHeight:844,devicePixelRatio:1,navigator:{userAgent:'test'},location:{search:''},PerformanceObserver:Observer,performance:{now:()=>100}};
  const originals = new Map(Object.keys(values).map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try {
    for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    const diagnostics = await import('../dist/performance-diagnostics.js?initially-hidden-test');
    diagnostics.initPerformanceDiagnostics();
    document.dispatchEvent(new Event('visibilitychange'));
    const cls = diagnostics.performanceSnapshot().observations.cumulativeLayoutShift;
    assert.equal(cls.value,null);
    assert.equal(cls.status,'not-observed-started-hidden');
  } finally {
    for (const [key,descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis,key,descriptor);
      else delete globalThis[key];
    }
  }
});
