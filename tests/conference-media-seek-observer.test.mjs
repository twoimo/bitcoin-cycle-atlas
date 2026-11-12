import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installConferenceNativeSeekObserver} from '../scripts/conference-media-seek-observer.mjs';

function fixture({enumerable = true} = {}) {
  const setterCalls = [], getterCalls = [], nativeError = new Error('Native setter rejected this request');
  const nativeResult = {returnedByNative:true}; let at = 0;
  class Media {
    constructor({conference = true} = {}) {
      this.conference = conference; this.rawTime = 0;
      this.src = 'http://127.0.0.1/conference/audio/session-01.m4a';
      this.currentSrc = 'http://127.0.0.1/conference/audio/session-00.m4a';
    }
    matches(selector) { assert.equal(selector, '.conference-audio'); return this.conference; }
  }
  const getter = function() { getterCalls.push(this); return Math.round(this.rawTime / .04) * .04; };
  const setter = function(value) {
    setterCalls.push({receiver:this, value});
    if (!(this instanceof Media) || value === 'native-reject') throw nativeError;
    this.rawTime = Number(value); return nativeResult;
  };
  Object.defineProperty(Media.prototype, 'currentTime', {get:getter, set:setter, enumerable, configurable:true});
  const original = Object.getOwnPropertyDescriptor(Media.prototype, 'currentTime');
  const window = {event:null}, location = {href:'http://127.0.0.1/?page=conference&t=2239.5'};
  const context = vm.createContext({window, HTMLMediaElement:Media, location,
    performance:{now:() => ++at}});
  const install = () => vm.runInContext('(' + installConferenceNativeSeekObserver.toString() + ')()', context);
  return {Media, window, location, setterCalls, getterCalls, nativeError, nativeResult, original, install};
}

test('the self-contained observer starts navigation operation1 and preserves the exact native request before quantized readback', () => {
  const f = fixture(), api = f.install(), audio = new f.Media();
  assert.equal(api.currentId(), 1); assert.equal(api.peek(1).label, 'navigation');
  const requested = 123.13;
  audio.currentTime = requested;
  assert.equal(f.setterCalls.length, 1); assert.equal(f.setterCalls[0].receiver, audio);
  assert.equal(f.setterCalls[0].value, requested); assert.equal(f.getterCalls.length, 0);
  const readback = audio.currentTime; assert.equal(readback, 123.12); assert.equal(f.getterCalls.length, 1);
  const request = api.peek(1).requests[0];
  assert.equal(request.currentTime, requested); assert.equal(request.accepted, true);
  assert.equal(request.id, 1); assert.equal(request.operationId, 1);
  assert.equal(request.url, f.location.href); assert.equal(request.trigger, null);
  assert.equal(api.peek(1).closed, false);
});

test('raw values are neither converted nor read back by the observer, and the native return value is unchanged', () => {
  const f = fixture(), api = f.install(), audio = new f.Media(); let conversions = 0;
  const raw = {valueOf() { conversions++; return 42.125; }};
  const wrapper = Object.getOwnPropertyDescriptor(f.Media.prototype, 'currentTime').set;
  const returned = wrapper.call(audio, raw);
  assert.equal(returned, f.nativeResult); assert.equal(conversions, 1);
  assert.equal(f.setterCalls.length, 1); assert.equal(f.setterCalls[0].value, raw);
  assert.equal(api.peek(1).requests[0].currentTime, raw);
  assert.equal(f.getterCalls.length, 0);
});

test('a throwing native setter is recorded as rejected and rethrows the same object without another native call', () => {
  const f = fixture(), api = f.install(), audio = new f.Media();
  assert.throws(() => { audio.currentTime = 'native-reject'; }, error => error === f.nativeError);
  assert.equal(f.setterCalls.length, 1); assert.equal(f.getterCalls.length, 0);
  const rejected = api.peek(1).requests[0];
  assert.equal(rejected.currentTime, 'native-reject'); assert.equal(rejected.accepted, false);
  assert.match(rejected.error, /Native setter rejected/);
  audio.currentTime = 8;
  const requests = api.peek(1).requests;
  assert.equal(requests.length, 2); assert.equal(requests[0].accepted, false); assert.equal(requests[1].accepted, true);
});

test('the requested src is captured separately from the previous native currentSrc', () => {
  const f = fixture(), api = f.install(), audio = new f.Media();
  f.window.event = {type:'click'}; audio.currentTime = 0;
  const request = api.peek(1).requests[0];
  assert.equal(request.src, audio.src); assert.equal(request.currentSrcBefore, audio.currentSrc);
  assert.notEqual(request.src, request.currentSrcBefore); assert.equal(request.trigger, 'click');
});

test('operation boundaries isolate seeks and preserve unowned attempts between trusted actions', () => {
  const f = fixture(), api = f.install(), audio = new f.Media();
  audio.currentTime = 1; const navigation = api.finish(1);
  assert.equal(navigation.closed, true); assert.equal(api.currentId(), null);
  audio.currentTime = 2; const next = api.begin('next-talk'); assert.equal(next, 2);
  audio.currentTime = 3; const second = api.finish(next);
  assert.equal(navigation.requests.length, 1); assert.equal(navigation.requests[0].currentTime, 1);
  assert.equal(second.requests.length, 1); assert.equal(second.requests[0].currentTime, 3);
  assert.equal(second.requests[0].operationId, 2);
  const unowned = api.unowned(); assert.equal(unowned.requests.length, 1);
  assert.equal(unowned.requests[0].currentTime, 2); assert.equal(unowned.requests[0].operationId, null);
  assert.equal(api.peek(1).requests.length, 1); assert.equal(f.setterCalls.length, 3);
});

test('overlapping operations, unknown identifiers and missing labels are rejected without affecting native state', () => {
  const f = fixture(), api = f.install();
  assert.throws(() => api.begin('overlap'), /already active/);
  assert.throws(() => api.finish(999), /Unknown/); assert.throws(() => api.peek(999), /Unknown/);
  api.finish(1);
  for (const label of ['', null, undefined, 7]) assert.throws(() => api.begin(label), /requires a label/);
  assert.equal(api.currentId(), null); assert.equal(f.setterCalls.length, 0);
});

test('receipt snapshots cannot change the observer ledger or move requests into later operations', () => {
  const f = fixture(), api = f.install(), audio = new f.Media();
  audio.currentTime = 6;
  const copy = api.peek(1); copy.requests[0].currentTime = 999; copy.requests.length = 0; copy.closed = true;
  const actual = api.peek(1); assert.equal(actual.requests.length, 1); assert.equal(actual.requests[0].currentTime, 6);
  assert.equal(actual.closed, false); api.finish(1);
  const after = api.begin('second'); audio.currentTime = 7;
  api.finish(1); assert.equal(api.currentId(), after); assert.equal(api.peek(after).requests.length, 1);
});

test('nonconference audio and invalid native receivers still delegate once with original behavior', () => {
  const f = fixture(), api = f.install(), other = new f.Media({conference:false});
  other.currentTime = 4.25;
  assert.equal(f.setterCalls.length, 1); assert.equal(f.setterCalls[0].receiver, other);
  assert.equal(api.peek(1).requests.length, 0); assert.equal(f.getterCalls.length, 0);
  const wrapper = Object.getOwnPropertyDescriptor(f.Media.prototype, 'currentTime').set;
  const invalid = {};
  assert.throws(() => wrapper.call(invalid, 3), error => error === f.nativeError);
  assert.equal(f.setterCalls.length, 2); assert.equal(f.setterCalls[1].receiver, invalid);
  assert.equal(api.peek(1).requests.length, 0);
  for (const receiver of [null, undefined, 0, 'not-media']) {
    const before = f.setterCalls.length;
    assert.throws(() => wrapper.call(receiver, 3), error => error === f.nativeError);
    assert.equal(f.setterCalls.length, before + 1);
    assert.equal(f.setterCalls[before].receiver, receiver);
  }
});

test('observation metadata failure cannot suppress or replace a native setter call', () => {
  const f = fixture(), api = f.install(), audio = new f.Media();
  Object.defineProperty(audio, 'src', {get() { throw new Error('Observation metadata unavailable'); }});
  audio.currentTime = 4;
  assert.equal(f.setterCalls.length, 1); assert.equal(f.setterCalls[0].value, 4);
  assert.equal(api.peek(1).requests.length, 0);
  assert.match(api.peek(1).observationErrors[0].error, /metadata unavailable/);
  assert.throws(() => { audio.currentTime = 'native-reject'; }, error => error === f.nativeError);
  assert.equal(f.setterCalls.length, 2);
});

test('installation is idempotent and preserves the original getter and descriptor flags', () => {
  for (const enumerable of [true, false]) {
    const f = fixture({enumerable}), first = f.install(), installed = Object.getOwnPropertyDescriptor(f.Media.prototype, 'currentTime');
    assert.equal(installed.get, f.original.get); assert.equal(installed.enumerable, f.original.enumerable);
    assert.equal(installed.configurable, f.original.configurable); assert.notEqual(installed.set, f.original.set);
    assert.equal(f.install(), first); assert.equal(first.currentId(), 1);
    const audio = new f.Media(); audio.currentTime = 9;
    assert.equal(f.setterCalls.length, 1); assert.equal(first.peek(1).requests.length, 1);
  }
});

test('restore returns the exact native descriptor, closes the active receipt and is idempotent', () => {
  const f = fixture(), api = f.install(), audio = new f.Media();
  audio.currentTime = 3;
  assert.equal(api.restore(), true); assert.equal(api.restore(), false); assert.equal(api.isInstalled(), false);
  assert.equal(api.currentId(), null); assert.equal(api.peek(1).closed, true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.Media.prototype, 'currentTime'), f.original);
  audio.currentTime = 5;
  assert.equal(f.setterCalls.length, 2); assert.equal(api.peek(1).requests.length, 1);
  assert.equal(api.unowned().requests.length, 0); assert.throws(() => api.begin('retired'), /restored/);
  const next = f.install(); assert.notEqual(next, api); assert.equal(next.currentId(), 1);
});

test('restore refuses to overwrite an unrelated descriptor replacement', () => {
  const f = fixture(), api = f.install(), changed = function() {};
  Object.defineProperty(f.Media.prototype, 'currentTime', {...f.original, set:changed});
  assert.throws(() => api.restore(), /changed outside/);
  assert.equal(Object.getOwnPropertyDescriptor(f.Media.prototype, 'currentTime').set, changed);
});
