import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {armConferenceSlideObservation} from '../scripts/conference-media-slide-observer.mjs';

const baseURI = 'http://localhost:8123/bitcoin-cycle-atlas/?page=conference';
const source = file => new URL('./conference/' + file, baseURI).href;
const first = {deckId:'r17-clean-257', page:2, t0:2239.5, file:'pages/r17/0002.webp'};
const finalSix = {deckId:'final-290', page:6, t0:2401.74, file:'pages/final/0006.webp'};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const encodingError = () => Object.assign(new Error('The source image cannot be decoded.'), {name:'EncodingError'});

// This is a deterministic observer unit fixture, not a browser or a media
// decoding substitute. It controls image request identities and decode promise
// completion order; the real-data harness still requires real image.decode().
function environment({step = first, selected = true, complete = true, width = 1800} = {}) {
  let now = 0, nextFrame = 0, image;
  const frames = new Map(), listeners = new Map(), observers = new Set();
  const player = {dataset:{page:selected ? String(step.page) : '', deck:step.deckId,
    time:String(selected ? step.t0 : 0)}, querySelector:selector => selector === '.conference-slide-image' ? image : null};
  const document = {baseURI, querySelector:selector => selector === '.conference-player' ? player : null};
  const queue = (target, attributeName) => {
    for (const observer of observers) if (observer.active && observer.filters.includes(attributeName)) {
      observer.records.push({type:'attributes', target, attributeName});
    }
  };
  const makeImage = ({file = step.file, loaded = complete, pixels = width} = {}) => ({
    attribute:selected ? source(file) : '', currentSrc:selected ? source(file) : '', complete:loaded,
    naturalWidth:pixels, naturalHeight:pixels ? 1012 : 0, hidden:!selected, decodeCalls:0, decoders:[],
    getAttribute(name) { return name === 'src' ? this.attribute : null; },
    decode() { this.decodeCalls++; const next = this.decoders.shift(); return next ? next() : Promise.resolve(); },
    request(file) { this.attribute = source(file); queue(this, 'src'); },
    commit(file, {complete = true, width = 1800, hidden = false} = {}) {
      this.currentSrc = source(file); this.complete = complete; this.naturalWidth = width;
      this.naturalHeight = width ? 1012 : 0; this.hidden = hidden;
    },
  });
  image = makeImage();
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.records = []; this.active = false; observers.add(this); }
    observe(_target, options) { this.active = true; this.filters = options.attributeFilter; }
    takeRecords() { const records = this.records; this.records = []; return records; }
    disconnect() { this.active = false; this.records = []; }
  }
  const window = {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
  };
  const arm = runInNewContext('(' + armConferenceSlideObservation.toString() + ')', {
    window, document, URL, Promise, WeakMap, Set, Error, MutationObserver:FakeMutationObserver,
    performance:{now:() => now},
    requestAnimationFrame:callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame:id => frames.delete(id),
  });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return {window, player, arm, get image() { return image; },
    get receipt() { const value = window.__conferenceSlideMeasurement; return value ? JSON.parse(JSON.stringify(value)) : value; },
    get pendingFrames() { return frames.size; }, get keyListeners() { return listeners.get('keydown')?.size || 0; },
    get activeObservers() { return [...observers].filter(item => item.active).length; },
    key(key = ']', trusted = true) { for (const listener of [...(listeners.get('keydown') || [])]) listener({key, isTrusted:trusted}); },
    select(step) { player.dataset.page = String(step.page); player.dataset.deck = step.deckId; player.dataset.time = String(step.t0);
      queue(player, 'data-page'); queue(player, 'data-deck'); },
    replaceImage(file) { const replacement = makeImage({file, loaded:true, pixels:1800}); replacement.attribute = source(file);
      replacement.currentSrc = source(file); replacement.hidden = false; image = replacement; return image; },
    async frame(milliseconds = 16) { now += milliseconds; const current = [...frames]; frames.clear();
      for (const [, callback] of current) callback(now); await flush(); },
    async frames(count, milliseconds = 16) { for (let i = 0; i < count; i++) await this.frame(milliseconds); },
    flush,
  };
}

test('an already displayed first mapped page is decoded as an entry baseline without a new load or fake transition', async () => {
  const e = environment(), before = {...e.player.dataset};
  const armed = e.arm({expected:first, mode:'entry'});
  assert.equal(armed.mode, 'baseline'); assert.equal(e.keyListeners, 0);
  await e.frames(3);
  assert.equal(e.receipt.mode, 'baseline'); assert.equal(e.receipt.decoded, true);
  assert.equal(e.receipt.page, 2); assert.equal(e.receipt.deck, first.deckId);
  assert.equal(e.receipt.currentSrc, source(first.file)); assert.equal(e.receipt.requestedSrc, source(first.file));
  assert.equal(e.receipt.milliseconds, null); assert.equal(e.receipt.inputStartedAt, null); assert.equal(e.receipt.trusted, null);
  assert.equal(e.receipt.observationMilliseconds, 48); assert.equal(e.image.decodeCalls, 1);
  assert.deepEqual({...e.player.dataset}, before, 'Observation cannot seek or change the timeline');
  assert.equal(e.activeObservers, 0); assert.equal(e.pendingFrames, 0);
});

test('an entry that already selected its first page waits for that real source instead of dispatching past it', async () => {
  const e = environment(); e.image.commit('pages/r17/0001.webp'); e.image.complete = false;
  assert.equal(e.arm({expected:first, mode:'entry'}).mode, 'baseline');
  await e.frame(); assert.equal(e.image.decodeCalls, 0); assert.equal(e.receipt, null);
  e.image.commit(first.file); await e.frames(3);
  assert.equal(e.receipt.mode, 'baseline'); assert.equal(e.receipt.currentSrc, source(first.file));
  assert.equal(e.receipt.milliseconds, null); assert.equal(e.keyListeners, 0);
});

test('a blank entry observes the first pending native transition and requires a trusted-key receipt', async () => {
  const e = environment({selected:false});
  assert.equal(e.arm({expected:first, mode:'entry'}).mode, 'transition');
  await e.frames(2); assert.equal(e.receipt, null); assert.equal(e.image.decodeCalls, 0);
  e.key('x'); await e.frame(); assert.equal(e.image.decodeCalls, 0);
  e.key(); e.select(first); e.image.request(first.file); e.image.commit(first.file);
  await e.frames(3);
  assert.equal(e.receipt.mode, 'transition'); assert.equal(e.receipt.trusted, true);
  assert.equal(e.receipt.milliseconds, 48); assert.equal(e.receipt.inputStartedAt, 48);
  assert.equal(e.receipt.decoded, true); assert.equal(e.keyListeners, 0); assert.equal(e.activeObservers, 0);
});

test('a page number in the wrong deck cannot become an entry baseline or decode observation', async () => {
  const e = environment(); e.player.dataset.deck = 'final-290';
  assert.equal(e.arm({expected:first, mode:'entry'}).mode, 'transition');
  e.key(); await e.frames(4);
  assert.equal(e.receipt, null); assert.equal(e.image.decodeCalls, 0);
  e.window.__conferenceSlideObserver.cancel();
  assert.equal(e.pendingFrames, 0); assert.equal(e.activeObservers, 0);
});

test('new requested src with old currentSrc is never decoded into the new step', async () => {
  const e = environment({step:finalSix}); e.image.commit('pages/final/0002.webp');
  e.arm({expected:finalSix}); e.key(); await e.frames(2);
  assert.equal(e.image.decodeCalls, 0); assert.equal(e.receipt, null);
  e.image.commit(finalSix.file); await e.frames(3);
  assert.equal(e.receipt.currentSrc, source(finalSix.file)); assert.equal(e.receipt.decodeAttempts, 1);
  assert.equal(e.receipt.milliseconds, 80);
});

test('late decode rejection from a changed request is retried with identity evidence and never resets the150ms clock', async () => {
  const e = environment({step:finalSix}), oldDecode = deferred();
  e.image.decoders.push(() => oldDecode.promise); e.arm({expected:finalSix}); e.key(); await e.frame();
  assert.equal(e.image.decodeCalls, 1);
  e.image.request('pages/final/0002.webp'); e.image.commit('pages/final/0002.webp');
  await e.frame(100); oldDecode.reject(encodingError()); await e.flush();
  assert.equal(e.receipt, null);
  e.image.request(finalSix.file); e.image.commit(finalSix.file); await e.frames(3);
  assert.equal(e.receipt.decoded, true); assert.equal(e.receipt.error, undefined);
  assert.equal(e.receipt.staleDecodeRejections, 1); assert.equal(e.receipt.decodeAttempts, 2);
  assert.equal(e.receipt.milliseconds, 164); assert.ok(e.receipt.milliseconds > 150,
    'The unchanged harness budget must still reject a slow observation, including stale work');
});

test('A-to-B-to-A source replacement invalidates a pending decode even when src strings match again', async () => {
  const e = environment({step:finalSix}), pending = deferred();
  e.image.decoders.push(() => pending.promise); e.arm({expected:finalSix}); e.key(); await e.frame();
  e.image.request('pages/final/0002.webp'); e.image.commit('pages/final/0002.webp');
  e.image.request(finalSix.file); e.image.commit(finalSix.file);
  pending.reject(encodingError()); await e.flush(); await e.frames(3);
  assert.equal(e.receipt.decoded, true); assert.equal(e.receipt.staleDecodeRejections, 1);
  assert.equal(e.receipt.decodeAttempts, 2); assert.equal(e.receipt.currentSrc, source(finalSix.file));
});

for (const width of [1800, 0]) test('a stable current source that actually rejects decode fails without retry (width' + width + ')', async () => {
  const e = environment({step:finalSix, width}); e.image.decoders.push(() => Promise.reject(encodingError()));
  e.arm({expected:finalSix}); e.key(); await e.frame();
  assert.equal(e.receipt.decoded, false); assert.match(e.receipt.error, /EncodingError/);
  assert.equal(e.receipt.currentSrc, source(finalSix.file)); assert.equal(e.receipt.requestedSrc, source(finalSix.file));
  assert.equal(e.receipt.decodeAttempts, 1); assert.equal(e.receipt.staleDecodeRejections, 0);
  await e.frames(5); assert.equal(e.image.decodeCalls, 1); assert.equal(e.pendingFrames, 0); assert.equal(e.activeObservers, 0);
});

test('an unchanged page render cannot excuse a genuine current-image decode failure', async () => {
  const e = environment({step:finalSix}), pending = deferred();
  e.image.decoders.push(() => pending.promise); e.arm({expected:finalSix}); e.key(); await e.frame();
  // Player timeupdate renders assign data-page/data-deck again even when the
  // image request did not change. Those writes are not stale-source evidence.
  e.select(finalSix); pending.reject(encodingError()); await e.flush();
  assert.equal(e.receipt.decoded, false); assert.equal(e.receipt.staleDecodeRejections, 0);
  assert.equal(e.receipt.decodeAttempts, 1); assert.match(e.receipt.error, /EncodingError/);
});

test('rearming cancels the old step and a later rejected decode cannot overwrite the new receipt', async () => {
  const e = environment(), pending = deferred(); e.image.decoders.push(() => pending.promise);
  const old = e.arm({expected:first}); e.key(); await e.frame();
  const next = e.arm({expected:finalSix}); assert.ok(next.token > old.token);
  e.select(finalSix); e.image.request(finalSix.file); e.image.commit(finalSix.file); e.key();
  await e.frames(3); const valid = e.receipt;
  assert.equal(valid.page, 6); assert.equal(valid.token, next.token);
  pending.reject(encodingError()); await e.flush(); await e.frames(3);
  assert.deepEqual(e.receipt, valid); assert.equal(e.pendingFrames, 0); assert.equal(e.activeObservers, 0);
});

test('replacement of the image node invalidates the prior promise even with the same source URL', async () => {
  const e = environment({step:finalSix}), pending = deferred(); e.image.decoders.push(() => pending.promise);
  e.arm({expected:finalSix}); e.key(); await e.frame();
  const replacement = e.replaceImage(finalSix.file); pending.reject(encodingError()); await e.flush();
  await e.frames(3); assert.equal(e.receipt.decoded, true); assert.equal(e.receipt.staleDecodeRejections, 1);
  assert.equal(replacement.decodeCalls, 1);
});

test('a source replacement during the two paint frames cannot produce a stale successful step', async () => {
  const e = environment({step:finalSix}); e.arm({expected:finalSix}); e.key();
  await e.frame(); await e.frame();
  e.image.request('pages/final/0002.webp'); e.image.commit('pages/final/0002.webp');
  await e.frame(); assert.equal(e.receipt, null);
  e.image.request(finalSix.file); e.image.commit(finalSix.file); await e.frames(3);
  assert.equal(e.receipt.decoded, true); assert.equal(e.receipt.currentSrc, source(finalSix.file));
  assert.equal(e.receipt.paintRechecks, 1); assert.equal(e.receipt.decodeAttempts, 2); assert.equal(e.receipt.milliseconds, 96);
});

test('untrusted input is recorded honestly and cleanup removes inactive listeners and animation frames', async () => {
  const e = environment(); e.arm({expected:first}); e.key(']', false); await e.frames(3);
  assert.equal(e.receipt.trusted, false, 'The parent must reject this instead of fabricating native trust');
  e.arm({expected:first}); assert.equal(e.keyListeners, 1); e.window.__conferenceSlideObserver.cancel();
  assert.equal(e.keyListeners, 0); assert.equal(e.pendingFrames, 0); assert.equal(e.activeObservers, 0);
});
