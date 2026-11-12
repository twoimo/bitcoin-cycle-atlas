import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountConferencePlayer, formatConferenceTime, conferenceSegmentIndex, conferenceMappedPage} from '../dist/conference/player.js';
import {assertConferenceMediaManifest, CONFERENCE_MEDIA_LIMITS, CONFERENCE_MEDIA_SETTINGS} from '../dist/conference/media.js';
import {assertConferenceSeekEvidence} from '../scripts/conference-media-browser-contract.mjs';

const fixtureTimeline = JSON.parse(await readFile(new URL('./fixtures/conference/timeline.synthetic.json', import.meta.url)));
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture({href='https://atlas.test/bitcoin-cycle-atlas/?page=conference', width=1440, response, play, mediaManifestUrl} = {}) {
  const {document, window} = parseHTML('<html><body data-page="conference"><h1>컨퍼런스 복습</h1><main id="host"></main></body></html>');
  const host = document.getElementById('host');
  let location = new URL(href);
  const windowEvents = new window.EventTarget();
  const writes = [];
  const view = {
    get location() { return location; }, innerWidth:width,
    history:{state:null, replaceState(_state, _title, url) { location = new URL(url, location); writes.push(location.href); }},
    addEventListener:windowEvents.addEventListener.bind(windowEvents),
    removeEventListener:windowEvents.removeEventListener.bind(windowEvents),
    dispatchEvent:windowEvents.dispatchEvent.bind(windowEvents),
  };
  const media = document.createElement('audio');
  media.currentTime = 0; media.paused = true; media.ended = false; media.playbackRate = 1;
  let playCalls = 0, pauseCalls = 0, loads = 0;
  Object.defineProperty(media, 'src', {get:() => media.getAttribute('src') || '', set:value => media.setAttribute('src', value)});
  media.load = () => { loads++; };
  media.pause = () => { pauseCalls++; media.paused = true; media.dispatchEvent(new window.Event('pause')); };
  media.play = () => { playCalls++; media.paused = false; return play ? play() : Promise.resolve(); };
  const controller = mountConferencePlayer(host, {
    document, window:view, mediaElement:media, mediaManifestUrl,
    timelineUrl:'https://atlas.test/bitcoin-cycle-atlas/conference/timeline.json',
    fetchImpl:response || (async () => ({ok:true,status:200,json:async () => structuredClone(fixtureTimeline)})),
  });
  // linkedom supplies a read-only select.value. Emulate this standard browser
  // property only; every event, DOM mutation and controller operation is real.
  for (const select of host.querySelectorAll('select')) {
    Object.defineProperty(select, 'value', {
      get() { return this.querySelector('option[selected]')?.value || this.querySelector('option')?.value || ''; },
      set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', option.value === String(value)); },
    });
  }
  const click = name => {
    const target = host.querySelector('[data-action="' + name + '"]');
    target.dispatchEvent(new window.Event('click', {bubbles:true}));
  };
  const key = (value, extras = {}, target = host) => {
    const event = new window.Event('keydown', {bubbles:true,cancelable:true});
    Object.assign(event, {key:value, altKey:false,ctrlKey:false,metaKey:false,isComposing:false,repeat:false,shiftKey:false}, extras);
    target.dispatchEvent(event); return event;
  };
  const tick = value => { media.currentTime = value; media.dispatchEvent(new window.Event('timeupdate')); };
  return {document,window,view,host,media,controller,click,key,tick,writes,
    role:name => host.querySelector('[data-role="' + name + '"]'),
    navigate(url) { location = new URL(url, location); view.dispatchEvent(new window.Event('popstate')); },
    counts:() => ({playCalls,pauseCalls,loads})};
}

function absentMediaTimeline() {
  const timeline = structuredClone(fixtureTimeline);
  for (const clip of timeline.audio) clip.available = false;
  for (const deck of timeline.decks) deck.imagesAvailable = false;
  return timeline;
}

function jsonResponse(value) {
  return {ok:true, status:200, text:async () => JSON.stringify(value)};
}

const sha256 = value => createHash('sha256').update(value).digest('hex');

// These are unit-test metadata records, not rendered pages or encoded audio.
// Their complete inventory exercises the real optional-manifest validator.
function readyMediaManifest(timeline) {
  const raw = JSON.stringify(timeline), inputs = [], decks = [], audio = [], assets = [];
  for (const deck of timeline.decks) {
    const hash = sha256('synthetic PDF ' + deck.id);
    inputs.push({id:deck.id, kind:'pdf', file:deck.id + '.pdf', bytes:100, sha256:hash, pageCount:deck.pages});
    decks.push({id:deck.id, dir:deck.dir, pageCount:deck.pages, inputSha256:hash});
    for (let page = 1; page <= deck.pages; page++) {
      const file = deck.dir + '/' + String(page).padStart(4, '0') + '.webp';
      assets.push({kind:'page', deckId:deck.id, page, file, bytes:100, sha256:sha256(file), width:1800, height:1013});
    }
  }
  let offset = 0;
  for (const clip of timeline.audio) {
    inputs.push({id:clip.id, kind:'audio', file:clip.id + '.mp3', bytes:100, sha256:sha256('synthetic audio ' + clip.id),
      t0:offset, t1:offset + clip.durationSec, durationSec:clip.durationSec,
      decodedSamples:Math.round(clip.durationSec * CONFERENCE_MEDIA_SETTINGS.audioSampleRate)});
    offset += clip.durationSec;
  }
  const sources = inputs.filter(input => input.kind === 'audio');
  for (const talk of timeline.talks) {
    const file = 'audio/session-' + talk.id + '.m4a';
    const sourceRanges = sources.filter(input => input.t0 < talk.t1 && input.t1 > talk.t0).map(input => {
      const t0 = Math.max(input.t0, talk.t0), t1 = Math.min(input.t1, talk.t1);
      const sourceT0 = t0 - input.t0, sourceT1 = t1 - input.t0;
      return {inputId:input.id, t0, t1, sourceT0, sourceT1,
        startSample:Math.round(sourceT0 * CONFERENCE_MEDIA_SETTINGS.audioSampleRate),
        endSample:Math.round(sourceT1 * CONFERENCE_MEDIA_SETTINGS.audioSampleRate)};
    });
    audio.push({id:'session-' + talk.id, talkId:talk.id, file, t0:talk.t0, t1:talk.t1,
      durationSec:talk.t1 - talk.t0, sourceRanges});
    assets.push({kind:'audio', talkId:talk.id, file, bytes:100, sha256:sha256(file), codec:'aac', channels:1,
      sampleRate:CONFERENCE_MEDIA_SETTINGS.audioSampleRate, durationSec:talk.t1 - talk.t0 + 0.01});
  }
  const manifest = {schemaVersion:1, kind:'atlas-conference-media', eventId:timeline.event.id, status:'ready',
    settings:{...CONFERENCE_MEDIA_SETTINGS}, limits:{...CONFERENCE_MEDIA_LIMITS},
    timeline:{bytes:Buffer.byteLength(raw), sha256:sha256(raw)}, deckLock:{bytes:100, sha256:sha256('synthetic deck lock')},
    toolchain:{fixture:'unit-test metadata only'}, review:{visual:'pending', listening:'pending'}, inputs, decks, audio, assets,
    totals:{pageCount:timeline.decks.reduce((sum, deck) => sum + deck.pages, 0), audioCount:audio.length,
      assetCount:assets.length, assetBytes:100 * assets.length, maxAssetBytes:100, fileCount:assets.length + 1,
      existingSiteFileCount:1, siteFileCount:assets.length + 2}};
  assertConferenceMediaManifest(manifest, {timeline, timelineSha256:sha256(raw)});
  return manifest;
}

// Model native setter requests separately from read-back/events. In particular,
// a decoder clock just before t0 can still round to t0 in the displayed dataset.
// No real audio is decoded by this unit fixture.
function observeNativeSeeks(f) {
  let clock = Number(f.media.currentTime);
  const requests = [];
  f.media.readyState = 4; f.media.seeking = false; f.media.error = null;
  Object.defineProperty(f.media, 'currentSrc', {get:() => f.media.src});
  Object.defineProperty(f.media, 'currentTime', {
    get:() => clock,
    set(value) {
      clock = Number(value); f.media.seeking = true;
      requests.push({currentTime:clock, src:f.media.src, accepted:true});
    },
  });
  const emit = type => f.media.dispatchEvent(new f.window.Event(type));
  return {requests,
    settle(value = clock) {
      emit('seeking'); clock = value;
      emit('timeupdate'); f.media.seeking = false; emit('seeked'); emit('timeupdate');
    },
    advance(value) { clock = value; f.media.seeking = false; emit('timeupdate'); },
  };
}

function assertNativeSeekContract(f, observer, manifest, eventTime, requestStart = 0) {
  const session = manifest.audio.find(clip => eventTime >= clip.t0 && eventTime < clip.t1);
  assert.ok(session, 'target belongs to a real session');
  return assertConferenceSeekEvidence({
    snapshot:{state:{...f.host.querySelector('.conference-player').dataset}, h1Count:f.document.querySelectorAll('h1').length,
      audio:{currentSrc:f.media.currentSrc, currentTime:f.media.currentTime, error:null,
        seeking:f.media.seeking, paused:f.media.paused, readyState:f.media.readyState}},
    requests:observer.requests.slice(requestStart), session, eventTime, settings:manifest.settings,
  });
}

function assertVisibleSlide(f, page) {
  const image = f.host.querySelector('.conference-slide-image');
  assert.match(image.src, new RegExp('/' + String(page).padStart(4, '0') + '\\.webp$'));
  assert.equal(image.hidden, false, 'the mapped image must remain visible, not only retain its src');
  assert.equal(f.host.querySelector('.conference-stage-message').hidden, true, 'the stage message must not cover the mapped image');
}

test('conference time and last-segment lookup keep fractional and hour boundaries explicit', () => {
  assert.equal(formatConferenceTime(3725.8), '1:02:05');
  assert.equal(formatConferenceTime(59.99), '0:59');
  assert.equal(formatConferenceTime(-2), '0:00');
  assert.equal(conferenceSegmentIndex(fixtureTimeline.segments, -1), -1);
  assert.equal(conferenceSegmentIndex(fixtureTimeline.segments, 3725), 19);
  assert.equal(conferenceSegmentIndex(fixtureTimeline.segments, 4000), 22);
});

test('unmapped segments preserve the previous deck-specific slide without claiming a current mapping', () => {
  assert.deepEqual(conferenceMappedPage(fixtureTimeline.segments, 20, 'r17-257'), {page:1,mapped:false});
  assert.deepEqual(conferenceMappedPage(fixtureTimeline.segments, 21, 'final-290'), {page:3,mapped:false});
  assert.deepEqual(conferenceMappedPage(fixtureTimeline.segments, -1, 'r17-257'), {page:null,mapped:false});
});

test('missing timeline shows an explicit non-playing empty state and preserves pending deep-link parameters', async () => {
  const f = fixture({href:'https://atlas.test/?page=conference&t=3725&deck=r17-257',response:async () => ({ok:false,status:404})});
  try {
    assert.equal(await f.controller.load(), false);
    const state = f.controller.getState();
    assert.equal(state.status, 'empty'); assert.equal(state.time, 3725); assert.equal(state.deck, 'r17-257');
    assert.match(f.role('state-title').textContent, /아직 준비되지/);
    assert.equal(f.host.querySelector('[data-action="play"]').disabled, true);
    assert.equal(f.counts().playCalls, 0);
    assert.equal(f.host.querySelector('.conference-live').textContent, '');
    assert.equal(f.document.querySelectorAll('h1').length, 1);
    assert.equal(f.writes.length, 0);
  } finally {f.controller.destroy();}
});

test('invalid timelines are rejected by the actual schema validator before controls become active', async () => {
  const invalid = structuredClone(fixtureTimeline); invalid.segments[0].page['final-290'] = 4;
  const f = fixture({response:async () => ({ok:true,status:200,json:async () => invalid})});
  try {
    assert.equal(await f.controller.load(), false);
    assert.equal(f.controller.getState().status, 'error');
    assert.equal(f.host.querySelector('[data-action="play"]').disabled, true);
    assert.match(f.role('state-detail').textContent, /형식/);
  } finally {f.controller.destroy();}
});

test('deep-link restoration selects the second audio clip and the correct independent deck mapping without autoplay', async () => {
  const f = fixture({href:'https://atlas.test/bitcoin-cycle-atlas/?page=conference&t=3725&deck=r17-257'});
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(f.controller.getState().time, 3725); assert.equal(f.controller.getState().page, 1);
    assert.equal(f.media.currentTime, 5); assert.match(f.media.src, /audio\/fixture-2\.wav$/);
    assert.equal(f.counts().playCalls, 0);
    f.controller.setDeck('final-290');
    assert.equal(f.controller.getState().time, 3725); assert.equal(f.controller.getState().page, 3);
    assert.equal(new URL(f.writes.at(-1)).searchParams.get('deck'), 'final-290');
    f.navigate('?page=conference&t=18&deck=r17-257');
    assert.equal(f.controller.getState().time, 18); assert.equal(f.controller.getState().deck, 'r17-257');
    assert.equal(f.controller.getState().page, 1); assert.equal(f.controller.getState().playing, false);
    assert.match(f.role('page-status').textContent, /이 덱에 해당 장표 없음/);
    assert.match(f.media.src, /audio\/fixture-1\.wav$/);
  } finally {f.controller.destroy();}
});

test('one live owner changes only when the current source segment changes', async () => {
  const f = fixture();
  try {
    await f.controller.load();
    // Native progression requires playback; paused seek read-back keeps its
    // requested source segment until the clock actually advances in playback.
    f.click('play'); await settle();
    const live = f.host.querySelector('.conference-live'), text = live.textContent;
    assert.equal(f.host.querySelectorAll('[aria-live="polite"]').length, 1);
    let mutations = 0;
    const observer = new f.window.MutationObserver(records => { mutations += records.length; });
    observer.observe(live, {childList:true,subtree:true,characterData:true});
    f.tick(1); f.tick(2); f.click('follow'); f.controller.setDeck('r17-257');
    await settle(); assert.equal(live.textContent, text); assert.equal(mutations, 0);
    f.tick(12); await settle();
    const afterChange = mutations; assert.ok(afterChange > 0);
    assert.equal(live.textContent, fixtureTimeline.segments[1].text);
    f.tick(13); f.click('auto'); await settle(); assert.equal(mutations, afterChange);
    observer.disconnect();
  } finally {f.controller.destroy();}
});

test('audio offsets use event seconds across midnight instead of a negative wall-clock subtraction', async () => {
  const overnight = structuredClone(fixtureTimeline);
  overnight.event.clockStart = '23:30:00'; overnight.event.clockEnd = '00:36:40';
  overnight.audio[0].clockStart = '23:30:00'; overnight.audio[1].clockStart = '00:32:00';
  const f = fixture({href:'https://atlas.test/?page=conference&t=3725&deck=r17-257',
    response:async () => ({ok:true,status:200,json:async () => overnight})});
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(f.media.currentTime, 5); assert.match(f.media.src, /fixture-2\.wav$/);
    f.tick(10); assert.equal(f.controller.getState().time, 3730);
  } finally {f.controller.destroy();}
});

test('two distinct subtitle sources with identical text each receive one live-region update', async () => {
  const repeated = structuredClone(fixtureTimeline);
  repeated.segments[1].text = repeated.segments[0].text;
  const f = fixture({response:async () => ({ok:true,status:200,json:async () => repeated})});
  try {
    await f.controller.load();
    f.click('play'); await settle();
    const live = f.host.querySelector('.conference-live');
    let mutations = 0;
    const observer = new f.window.MutationObserver(records => { mutations += records.length; });
    observer.observe(live, {childList:true,subtree:true,characterData:true});
    f.tick(12); await settle(); assert.ok(mutations > 0);
    const once = mutations;
    assert.equal(live.textContent, repeated.segments[0].text);
    f.tick(13); f.tick(14); await settle(); assert.equal(mutations, once);
    observer.disconnect();
  } finally {f.controller.destroy();}
});

test('automatic slide advance can be paused while explicit seek and null-page handling still work', async () => {
  const f = fixture();
  try {
    await f.controller.load();
    assert.equal(f.controller.getState().page, 1);
    f.click('auto'); f.tick(20);
    assert.equal(f.controller.getState().time, 20); assert.equal(f.controller.getState().page, 1);
    f.controller.seek(20);
    assert.equal(f.controller.getState().page, 2);
    f.controller.seek(3780);
    assert.equal(f.controller.getState().page, 3);
    assert.match(f.role('page-status').textContent, /이 구간에 맞는 장표 없음/);
    f.controller.setDeck('r17-257');
    assert.equal(f.controller.getState().time, 3780); assert.equal(f.controller.getState().page, 1);
    f.click('next-slide');
    assert.equal(f.controller.getState().page, 2); assert.equal(f.controller.getState().time, 260);
  } finally {f.controller.destroy();}
});

test('keyboard shortcuts act on the active player while editable fields and other destinations retain their keys', async () => {
  const f = fixture();
  try {
    await f.controller.load();
    f.controller.seek(100);
    assert.equal(f.key('ArrowLeft').defaultPrevented, true); assert.equal(f.controller.getState().time, 95);
    f.key('ArrowRight',{shiftKey:true}); assert.equal(f.controller.getState().time, 125);
    f.key('f'); assert.equal(f.controller.getState().follow, false);
    f.key('D'); assert.equal(f.controller.getState().deck, 'r17-257');
    f.key(']'); assert.equal(f.controller.getState().page, 2);
    f.key('['); assert.equal(f.controller.getState().page, 1);
    f.key(' '); await settle(); assert.equal(f.controller.getState().playing, true);
    f.key(' '); assert.equal(f.controller.getState().playing, false);
    const time = f.controller.getState().time;
    f.key('ArrowRight',{},f.role('transcript-search')); assert.equal(f.controller.getState().time, time);
    f.document.body.dataset.page = 'outlook';
    assert.equal(f.key('ArrowRight').defaultPrevented, false); assert.equal(f.controller.getState().time, time);
    f.document.body.dataset.page = 'conference';
    const foreign = f.document.createElement('dialog'); foreign.setAttribute('open',''); f.document.body.append(foreign);
    assert.equal(f.key('ArrowRight').defaultPrevented, false); assert.equal(f.controller.getState().time, time);
  } finally {f.controller.destroy();}
});

test('transcript defaults closed, switches dock to sheet, searches original rows, and seeks the selected row', async () => {
  const f = fixture();
  try {
    await f.controller.load();
    const panel = f.host.querySelector('.conference-transcript');
    assert.equal(panel.hidden, true);
    f.click('transcript');
    assert.equal(panel.hidden, false); assert.equal(panel.dataset.mode, 'dock');
    assert.equal(f.host.querySelectorAll('.conference-transcript-row').length, fixtureTimeline.segments.length);
    f.view.innerWidth = 390; f.view.dispatchEvent(new f.window.Event('resize'));
    assert.equal(panel.dataset.mode, 'sheet'); assert.equal(panel.getAttribute('aria-modal'), 'true');
    f.role('transcript-search').value = '존재하지않는검색어';
    f.role('transcript-search').dispatchEvent(new f.window.Event('input'));
    assert.equal(f.host.querySelectorAll('.conference-transcript-row:not([hidden])').length, 0);
    assert.equal(f.host.querySelector('.conference-search-empty').hidden, false);
    f.role('transcript-search').value = '';
    f.role('transcript-search').dispatchEvent(new f.window.Event('input'));
    const row = f.host.querySelector('[data-segment="19"]');
    row.dispatchEvent(new f.window.Event('click',{bubbles:true}));
    assert.equal(f.controller.getState().time, 3725);
    f.key('Escape');
    assert.equal(panel.hidden, true); assert.equal(f.controller.getState().transcript, false);
  } finally {f.controller.destroy();}
});

test('closing a transcript opened through mobile settings returns focus to the visible caption', async () => {
  const f = fixture({width:390});
  try {
    await f.controller.load(); f.click('settings');
    const options = f.host.querySelector('.conference-options');
    const opener = f.host.querySelector('.conference-transcript-toggle');
    const caption = f.host.querySelector('.conference-caption'), focused = [];
    opener.focus = () => focused.push('hidden opener');
    caption.focus = () => focused.push('caption');
    assert.equal(options.hidden, false);
    opener.dispatchEvent(new f.window.Event('click',{bubbles:true}));
    assert.equal(options.hidden, true, 'opening the sheet closes mobile settings');
    f.click('close-transcript');
    assert.deepEqual(focused, ['caption']);
  } finally {f.controller.destroy();}
});

test('desktop-to-phone resize falls back from the now-hidden transcript opener while a visible desktop opener is retained', async () => {
  const f = fixture({width:1440});
  try {
    await f.controller.load();
    const opener = f.host.querySelector('.conference-transcript-toggle');
    const caption = f.host.querySelector('.conference-caption'), focused = [];
    opener.focus = () => focused.push('opener');
    opener.getClientRects = () => [{width:44,height:44}];
    caption.focus = () => focused.push('caption');
    opener.dispatchEvent(new f.window.Event('click',{bubbles:true}));
    f.click('close-transcript');
    assert.deepEqual(focused, ['opener']);
    opener.dispatchEvent(new f.window.Event('click',{bubbles:true}));
    f.view.innerWidth = 320; f.view.dispatchEvent(new f.window.Event('resize'));
    assert.equal(f.host.querySelector('.conference-options').hidden, true);
    assert.equal(f.host.querySelector('.conference-transcript').dataset.mode, 'sheet');
    f.click('close-transcript');
    assert.deepEqual(focused, ['opener','caption']);
  } finally {f.controller.destroy();}
});

test('native media time drives the global progress and ended advances only when playback was active', async () => {
  const f = fixture({href:'https://atlas.test/?page=conference&t=3719&deck=final-290'});
  try {
    await f.controller.load();
    f.click('play'); await settle(); assert.equal(f.controller.getState().playing, true);
    f.media.ended = true; f.media.dispatchEvent(new f.window.Event('ended'));
    await settle(); assert.match(f.media.src, /fixture-2\.wav$/);
    assert.equal(f.controller.getState().time, 3720); assert.equal(f.controller.getState().playing, true);
    f.media.ended = false; f.tick(5);
    assert.equal(f.controller.getState().time, 3725);
    assert.equal(f.role('timeline').value, '3725');
    f.media.ended = true; f.media.dispatchEvent(new f.window.Event('ended'));
    assert.equal(f.controller.getState().time, 4000); assert.equal(f.controller.getState().playing, false);
  } finally {f.controller.destroy();}
});

test('a rejected native play request remains paused and communicates failure without advancing a simulated clock', async () => {
  const f = fixture({play:() => Promise.reject(new Error('not allowed'))});
  try {
    await f.controller.load(); f.click('play'); await settle();
    assert.equal(f.controller.getState().playing, false); assert.equal(f.controller.getState().time, 0);
    assert.match(f.role('notice').textContent, /再生|재생할 수 없습니다/);
  } finally {f.controller.destroy();}
});

test('destroy aborts pending loads and detaches keyboard and native-media owners without resurrection', async () => {
  let resolveRequest;
  const f = fixture({response:() => new Promise(resolve => { resolveRequest = resolve; })});
  const loading = f.controller.load();
  f.controller.destroy(); f.controller.destroy();
  resolveRequest({ok:true,status:200,json:async () => structuredClone(fixtureTimeline)});
  assert.equal(await loading, false);
  assert.equal(f.host.children.length, 0);
  assert.equal(f.key('ArrowRight').defaultPrevented, false);
  f.tick(5); assert.equal(f.host.children.length, 0);
  assert.equal(f.media.getAttribute('src'), null);
});

test('a completed play promise cannot revive a destroyed player', async () => {
  let resolvePlay;
  const f = fixture({play:() => new Promise(resolve => { resolvePlay = resolve; })});
  await f.controller.load(); f.click('play');
  f.controller.destroy(); resolvePlay(); await settle();
  assert.equal(f.host.children.length, 0);
  assert.equal(f.media.paused, true);
});

test('an obsolete play completion cannot pause a newer request after an intervening cancellation', async () => {
  const pending = [];
  const f = fixture({play:() => new Promise(resolve => pending.push(resolve))});
  try {
    await f.controller.load();
    f.click('play'); assert.equal(f.controller.getState().playPending, true);
    f.click('play'); assert.equal(f.controller.getState().playPending, false);
    f.click('play'); assert.equal(pending.length, 2);
    const pauses = f.counts().pauseCalls;
    pending[0](); await settle();
    assert.equal(f.counts().pauseCalls, pauses, 'old completion has no authority over the current audio owner');
    assert.equal(f.media.paused, false);
    pending[1](); await settle();
    assert.equal(f.controller.getState().playing, true);
    assert.equal(f.controller.getState().playPending, false);
  } finally {f.controller.destroy();}
});

test('seeking to another audio clip while buffering preserves play intent and ignores the cancelled old request', async () => {
  const pending = [];
  const f = fixture({play:() => new Promise((resolve, reject) => pending.push({resolve,reject}))});
  try {
    await f.controller.load(); f.click('play');
    assert.equal(f.controller.getState().playPending, true);
    f.controller.seek(3725);
    assert.match(f.media.src, /fixture-2\.wav$/);
    assert.equal(f.media.currentTime, 5); assert.equal(pending.length, 2);
    pending[0].reject(new Error('old source was unloaded')); await settle();
    assert.equal(f.role('notice').hidden, true);
    assert.equal(f.controller.getState().playPending, true);
    pending[1].resolve(); await settle();
    assert.equal(f.controller.getState().playing, true);
    assert.equal(f.controller.getState().time, 3725);
  } finally {f.controller.destroy();}
});

test('pagehide pauses a cached document and pageshow restores the URL without autoplay', async () => {
  const f = fixture();
  try {
    await f.controller.load(); f.click('play'); await settle();
    f.tick(7); assert.equal(f.controller.getState().playing, true);
    f.view.dispatchEvent(new f.window.Event('pagehide'));
    assert.equal(f.controller.getState().playing, false); assert.equal(f.media.paused, true);
    const plays = f.counts().playCalls;
    f.view.dispatchEvent(new f.window.Event('pageshow')); await settle();
    assert.equal(f.controller.getState().time, 7); assert.equal(f.counts().playCalls, plays);
  } finally {f.controller.destroy();}
});

test('an already failed image preload renders an error instead of waiting for an event that has already fired', async () => {
  const f = fixture();
  f.view.Image = class { complete = true; naturalWidth = 0; };
  try {
    await f.controller.load();
    assert.match(f.role('state-title').textContent, /이미지를 불러오지 못했습니다/);
    assert.equal(f.host.querySelector('.conference-slide-image').hidden, true);
  } finally {f.controller.destroy();}
});

test('declared absent media stays honest without fetching missing assets or disabling text navigation', async () => {
  const data = structuredClone(fixtureTimeline);
  for (const clip of data.audio) clip.available = false;
  for (const deck of data.decks) deck.imagesAvailable = false;
  const f = fixture({response:async () => ({ok:true,status:200,json:async () => data})});
  let imageRequests = 0;
  f.view.Image = class { set src(_value) { imageRequests++; } };
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(f.controller.getState().status, 'ready');
    assert.equal(f.host.querySelectorAll('.conference-transcript-row').length, 0);
    assert.equal(f.role('state-title').textContent, '장표 이미지 없음');
    assert.equal(f.role('notice').textContent, '오디오 없음');
    assert.equal(f.host.querySelector('[data-action="play"]').disabled, true);
    assert.equal(f.host.querySelector('[data-action="zoom"]').disabled, true);
    assert.equal(f.host.querySelector('[data-action="forward"]').disabled, false);
    assert.equal(f.host.querySelector('.conference-slide-image').getAttribute('src'), null);
    f.key(' '); f.click('forward'); await settle();
    assert.equal(f.controller.getState().time, 10);
    f.controller.seek(18); f.controller.setDeck('r17-257');
    assert.equal(f.controller.getState().time, 18);
    assert.equal(f.controller.getState().page, 1);
    assert.equal(f.role('page-status').textContent, '이 덱에 해당 장표 없음');
    assert.equal(f.role('state-title').textContent, '장표 이미지 없음');
    f.controller.seek(12);
    assert.equal(f.role('page-status').textContent, '이 구간에 맞는 장표 없음');
    f.click('transcript');
    f.host.querySelector('[data-segment="22"]').dispatchEvent(new f.window.Event('click', {bubbles:true}));
    assert.equal(f.controller.getState().time, 3850);
    assert.equal(f.role('notice').textContent, '오디오 없음');
    assert.equal(f.media.src, ''); assert.equal(f.counts().playCalls, 0);
    assert.equal(imageRequests, 0); assert.equal(f.counts().loads, 1);
    assert.equal(f.document.querySelectorAll('h1').length, 1);
  } finally {f.controller.destroy();}
});

test('available and absent audio intervals switch without a stale media event moving the source clock', async () => {
  const data = structuredClone(fixtureTimeline); data.audio[0].available = false;
  const f = fixture({response:async () => ({ok:true,status:200,json:async () => data})});
  try {
    await f.controller.load();
    assert.equal(f.media.src, '');
    f.controller.seek(3725);
    assert.equal(f.role('notice').hidden, true);
    assert.equal(f.host.querySelector('[data-action="play"]').disabled, false);
    assert.match(f.media.src, /fixture-2\.wav$/);
    f.click('play'); await settle(); assert.equal(f.controller.getState().playing, true);
    f.controller.seek(18); await settle();
    assert.equal(f.controller.getState().playing, false); assert.equal(f.media.src, '');
    f.tick(99); f.media.dispatchEvent(new f.window.Event('ended')); f.media.dispatchEvent(new f.window.Event('error'));
    assert.equal(f.controller.getState().time, 18);
    assert.equal(f.role('notice').textContent, '오디오 없음');
    assert.equal(f.host.querySelector('[data-action="play"]').disabled, true);
  } finally {f.controller.destroy();}
});

test('locked deck IDs accept legacy links without changing fixture IDs or the event clock', async () => {
  const data = structuredClone(fixtureTimeline), oldId = 'r17-257', newId = 'r17-clean-257';
  data.decks.find(deck => deck.id === oldId).id = newId;
  for (const talk of data.talks) { talk.pageRange[newId] = talk.pageRange[oldId]; delete talk.pageRange[oldId]; }
  for (const segment of data.segments) if (segment.page) { segment.page[newId] = segment.page[oldId]; delete segment.page[oldId]; }
  const f = fixture({href:'https://atlas.test/?page=conference&t=3740&deck=r17-257',
    response:async () => ({ok:true,status:200,json:async () => data})});
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(f.controller.getState().time, 3740); assert.equal(f.controller.getState().deck, newId);
    assert.equal(f.controller.getState().page, 1);
    assert.equal(f.role('page-status').textContent, '이 덱에 해당 장표 없음');
    f.controller.setDeck('final-290'); f.controller.setDeck(oldId);
    assert.equal(f.controller.getState().time, 3740); assert.equal(f.controller.getState().deck, newId);
    assert.equal(new URL(f.writes.at(-1)).searchParams.get('deck'), newId);
    f.navigate('?page=conference&t=18&deck=r17-257');
    assert.equal(f.controller.getState().time, 18); assert.equal(f.controller.getState().deck, newId);
  } finally {f.controller.destroy();}
});

test('indexed mappings preserve null retention, equal-start overlaps, boundaries and first-page seek times', async () => {
  const data = structuredClone(fixtureTimeline);
  data.segments.splice(1, 0, {...data.segments[0],source:'fixture-overlap#1',page:{'final-290':3,'r17-257':2}});
  const f = fixture({response:async () => ({ok:true,status:200,json:async () => data})});
  try {
    assert.equal(await f.controller.load(), true);
    for (const deck of data.decks) {
      f.controller.setDeck(deck.id);
      for (const segment of data.segments) {
        for (const time of [segment.t0, segment.t1]) {
          f.controller.seek(time);
          const index = conferenceSegmentIndex(data.segments, time);
          const expected = conferenceMappedPage(data.segments, index, deck.id);
          assert.equal(f.controller.getState().segment, index);
          assert.equal(f.controller.getState().page, expected.page, deck.id + ' at ' + time);
          assert.equal(f.role('page-status').hidden, expected.mapped);
        }
      }
      const pages = [...new Set(data.segments.map(segment => segment.page?.[deck.id]).filter(Number.isInteger))];
      for (const page of pages) {
        f.role('page').value = String(page); f.role('page').dispatchEvent(new f.window.Event('change'));
        assert.equal(f.controller.getState().time, data.segments.find(segment => segment.page?.[deck.id] === page).t0);
      }
    }
  } finally {f.controller.destroy();}
});

test('page preloading skips repeated and null mappings while retaining the next different page', async () => {
  const data = structuredClone(fixtureTimeline);
  data.segments[2].page['final-290'] = 1; data.segments[3].page = null;
  const f = fixture({response:async () => ({ok:true,status:200,json:async () => data})});
  const requests = [];
  f.view.Image = class { complete = true; naturalWidth = 16; set src(value) { requests.push(value); } };
  try {
    await f.controller.load();
    assert.deepEqual(requests.map(value => value.split('/').at(-1)), ['0001.webp', '0002.webp']);
    f.click('auto'); f.controller.seek(18, {forceSlide:false});
    assert.equal(f.controller.getState().page, 1); assert.equal(requests.length, 2);
    f.click('next-slide');
    assert.equal(f.controller.getState().time, 260); assert.equal(f.controller.getState().page, 2);
    assert.deepEqual(requests.map(value => value.split('/').at(-1)), ['0001.webp', '0002.webp', '0003.webp']);
  } finally {f.controller.destroy();}
});

test('a full-size transcript defers DOM until opened and retains every source row, search and final seek', async () => {
  const data = structuredClone(fixtureTimeline), count = 9168;
  for (const clip of data.audio) clip.available = false;
  for (const deck of data.decks) deck.imagesAvailable = false;
  data.segments = Array.from({length:count}, (_, index) => {
    const t0 = index * 4000 / count, t1 = (index + 1) * 4000 / count;
    return {t0,t1,text:'전체 크기 검증 자막 ' + String(index).padStart(5, '0'),source:'size-fixture#' + (index + 1),
      talk:data.talks.find(talk => t0 >= talk.t0 && t0 < talk.t1).id,
      page:index % 13 ? {'final-290':index % 3 + 1,'r17-257':index % 2 + 1} : null};
  });
  const f = fixture({response:async () => ({ok:true,status:200,json:async () => data})});
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(f.host.querySelectorAll('.conference-transcript-row').length, 0);
    f.controller.seek(data.segments.at(-1).t0);
    assert.equal(f.host.querySelector('.conference-caption-text').textContent, data.segments.at(-1).text);
    f.click('transcript');
    const rows = [...f.host.querySelectorAll('.conference-transcript-row')];
    assert.equal(rows.length, count);
    assert.deepEqual(rows.map(row => Number(row.dataset.segment)), Array.from({length:count}, (_, index) => index));
    assert.deepEqual(rows.map(row => row.querySelector('.conference-transcript-text').textContent), data.segments.map(segment => segment.text));
    assert.equal(f.host.querySelectorAll('.conference-transcript-row[aria-current="true"]').length, 1);
    assert.equal(rows.at(-1).getAttribute('aria-current'), 'true');
    f.role('transcript-search').value = '09167'; f.role('transcript-search').dispatchEvent(new f.window.Event('input'));
    assert.equal(f.host.querySelectorAll('.conference-transcript-row:not([hidden])').length, 1);
    f.controller.seek(0);
    rows.at(-1).dispatchEvent(new f.window.Event('click', {bubbles:true}));
    assert.equal(f.controller.getState().time, data.segments.at(-1).t0);
    assert.equal(rows[0].hasAttribute('aria-current'), false); assert.equal(rows.at(-1).getAttribute('aria-current'), 'true');
    f.click('close-transcript'); f.click('transcript');
    assert.equal(f.host.querySelectorAll('.conference-transcript-row').length, count);
    assert.equal(f.host.querySelector('.conference-transcript-row'), rows[0]);
  } finally {f.controller.destroy();}
});

test('optional media discovery leaves the original timeline ready while its response is pending', async () => {
  const timeline = absentMediaTimeline(), original = JSON.stringify(timeline), requests = [];
  let releaseManifest;
  const f = fixture({href:'https://atlas.test/bitcoin-cycle-atlas/?page=conference&t=3725&deck=r17-257',
    response:async (url, options) => {
      requests.push({url, options});
      if (url.endsWith('/timeline.json')) return jsonResponse(timeline);
      return new Promise(resolve => { releaseManifest = resolve; });
    }});
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(f.controller.getState().status, 'ready');
    assert.equal(f.controller.getState().time, 3725);
    assert.equal(f.controller.getState().page, 1);
    assert.equal(f.role('state-title').textContent, '장표 이미지 없음');
    assert.equal(f.role('notice').textContent, '오디오 없음');
    assert.equal(f.media.src, '');
    assert.equal(f.counts().playCalls, 0);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].url, 'https://atlas.test/bitcoin-cycle-atlas/conference/media-manifest.json');
    assert.equal(requests[1].options.signal, requests[0].options.signal);
    f.controller.setDeck('final-290');
    f.controller.seek(3780);
    releaseManifest({ok:false, status:404});
    assert.equal(await f.controller.whenMediaSettled(), false);
    assert.equal(f.controller.getState().status, 'ready');
    assert.equal(f.controller.getState().time, 3780);
    assert.equal(f.controller.getState().deck, 'final-290');
    assert.equal(f.controller.getState().page, 3);
    assert.match(f.role('page-status').textContent, /이 구간에 맞는 장표 없음/);
    assert.equal(JSON.stringify(timeline), original);
  } finally {f.controller.destroy();}
});

test('unavailable and malformed optional manifests retain honest media absence and usable source navigation', async t => {
  const unavailable = JSON.parse(await readFile(new URL('../dist/conference/media-manifest.json', import.meta.url)));
  const cases = [
    ['unavailable package', () => jsonResponse(unavailable)],
    ['missing file', () => ({ok:false, status:404})],
    ['request failure', () => {throw new Error('connection closed');}],
    ['malformed JSON', () => ({ok:true, status:200, text:async () => '{broken'})],
    ['invalid ready package', () => jsonResponse({schemaVersion:1, status:'ready'})],
  ];
  for (const [name, response] of cases) await t.test(name, async () => {
    const timeline = absentMediaTimeline();
    const f = fixture({response:async url => url.endsWith('/timeline.json') ? jsonResponse(timeline) : response()});
    try {
      assert.equal(await f.controller.load(), true);
      assert.equal(await f.controller.whenMediaSettled(), false);
      assert.equal(f.controller.getState().status, 'ready');
      assert.equal(f.role('state-title').textContent, '장표 이미지 없음');
      assert.equal(f.role('notice').textContent, '오디오 없음');
      assert.equal(f.host.querySelector('[data-action="play"]').disabled, true);
      assert.equal(f.media.src, '');
      assert.equal(f.counts().playCalls, 0);
      f.controller.seek(3725); f.controller.setDeck('r17-257');
      assert.equal(f.controller.getState().time, 3725);
      assert.equal(f.controller.getState().page, 1);
      assert.equal(f.document.querySelectorAll('h1').length, 1);
    } finally {f.controller.destroy();}
  });
});

test('existing authored media does not request an optional replacement manifest', async () => {
  const requests = [];
  const f = fixture({response:async url => {requests.push(url); return jsonResponse(fixtureTimeline);}});
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(await f.controller.whenMediaSettled(), false);
    assert.equal(requests.length, 1);
    assert.match(f.media.src, /audio\/fixture-1\.wav$/);
    assert.equal(f.controller.getState().status, 'ready');
    assert.equal(f.host.querySelector('[data-action="play"]').disabled, false);
  } finally {f.controller.destroy();}
});

test('a verified media manifest adds pages and session audio without changing time, deck, source mapping or autoplay', async () => {
  const timeline = absentMediaTimeline(), original = JSON.stringify(timeline), manifest = readyMediaManifest(timeline);
  let releaseManifest;
  const f = fixture({href:'https://atlas.test/bitcoin-cycle-atlas/?page=conference&t=3725&deck=r17-257',
    response:async url => url.endsWith('/timeline.json') ? jsonResponse(timeline)
      : new Promise(resolve => {releaseManifest = resolve;})});
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(f.role('state-title').textContent, '장표 이미지 없음');
    f.controller.setDeck('final-290');
    f.role('rate').value = '1.5'; f.role('rate').dispatchEvent(new f.window.Event('change'));
    releaseManifest(jsonResponse(manifest));
    assert.equal(await f.controller.whenMediaSettled(), true);
    assert.equal(f.controller.getState().status, 'ready');
    assert.equal(f.controller.getState().time, 3725);
    assert.equal(f.controller.getState().duration, 4000);
    assert.equal(f.controller.getState().deck, 'final-290');
    assert.equal(f.controller.getState().page, 3);
    assert.equal(f.controller.getState().playing, false);
    assert.equal(f.media.currentTime, 85);
    assert.match(f.media.src, /conference\/audio\/session-14\.m4a$/);
    assert.equal(f.media.playbackRate, 1.5);
    assert.equal(f.counts().playCalls, 0);
    assert.equal(f.host.querySelector('[data-action="play"]').disabled, false);
    assert.equal(f.host.querySelector('.conference-slide-image').src,
      'https://atlas.test/bitcoin-cycle-atlas/conference/pages/synthetic-a/0003.webp');
    const audioLoads = f.counts().loads;
    f.controller.setDeck('r17-257');
    assert.equal(f.controller.getState().time, 3725);
    assert.equal(f.media.currentTime, 85);
    assert.equal(f.counts().loads, audioLoads);
    assert.equal(f.controller.getState().page, 1);
    f.controller.seek(3780);
    assert.equal(f.media.currentTime, 140);
    assert.equal(f.controller.getState().page, 1);
    assert.match(f.role('page-status').textContent, /이 구간에 맞는 장표 없음/);
    assert.equal(f.document.querySelectorAll('h1').length, 1);
    assert.equal(JSON.stringify(timeline), original);
    assert.equal(new URL(f.writes.at(-1)).searchParams.get('t'), '3780');
  } finally {f.controller.destroy();}
});

test('media prepared for different timeline bytes is rejected before any page or audio source is installed', async () => {
  const timeline = absentMediaTimeline(), manifest = readyMediaManifest(timeline);
  manifest.timeline.sha256 = sha256('different timeline revision');
  const f = fixture({response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
  try {
    assert.equal(await f.controller.load(), true);
    assert.equal(await f.controller.whenMediaSettled(), false);
    assert.equal(f.controller.getState().status, 'ready');
    assert.equal(f.role('state-title').textContent, '장표 이미지 없음');
    assert.equal(f.role('notice').textContent, '오디오 없음');
    assert.equal(f.media.src, '');
    assert.equal(f.host.querySelector('.conference-slide-image').hasAttribute('src'), false);
    assert.equal(f.counts().playCalls, 0);
  } finally {f.controller.destroy();}
});

test('session media rebases native time at exact program boundaries without accumulating encoder padding', async () => {
  const timeline = absentMediaTimeline(), manifest = readyMediaManifest(timeline);
  const f = fixture({href:'https://atlas.test/bitcoin-cycle-atlas/?page=conference&t=250',
    response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
  try {
    await f.controller.load(); assert.equal(await f.controller.whenMediaSettled(), true);
    assert.equal(f.media.currentTime, 250);
    assert.match(f.media.src, /session-00\.m4a$/);
    f.click('play'); await settle();
    assert.equal(f.controller.getState().playing, true);
    f.tick(260.01);
    assert.equal(f.controller.getState().time, 260);
    f.media.dispatchEvent(new f.window.Event('ended')); await settle();
    assert.equal(f.controller.getState().time, 260);
    assert.equal(f.media.currentTime, 0);
    assert.match(f.media.src, /session-01\.m4a$/);
    assert.equal(f.controller.getState().playing, true);
    f.tick(12.5);
    assert.equal(f.controller.getState().time, 272.5);
    f.controller.seek(3999);
    await settle();
    assert.equal(f.media.currentTime, 359);
    f.tick(360.01);
    assert.equal(f.controller.getState().time, 4000);
    f.media.dispatchEvent(new f.window.Event('ended'));
    assert.equal(f.controller.getState().time, 4000);
    assert.equal(f.controller.getState().playing, false);
    assert.equal(f.controller.getState().duration, 4000);
    assert.equal(f.role('total-time').textContent, '1:06:40');
  } finally {f.controller.destroy();}
});

test('session 13 crosses the original 18000-second audio split on the unchanged event clock', async () => {
  const timeline = JSON.parse(await readFile(new URL('../dist/conference/timeline.json', import.meta.url)));
  const original = JSON.stringify({talks:timeline.talks, segments:timeline.segments}), manifest = readyMediaManifest(timeline);
  assert.equal(manifest.audio[13].t0, 17956.51);
  assert.equal(manifest.audio[13].t1, 20042.82);
  assert.deepEqual(manifest.audio[13].sourceRanges.map(range => [range.inputId, range.t0, range.t1]),
    [['plaud-1',17956.51,18000], ['plaud-2',18000,20042.82]]);
  const f = fixture({href:'https://atlas.test/bitcoin-cycle-atlas/?page=conference&t=17999.5&deck=r17-clean-257',
    response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
  try {
    await f.controller.load(); assert.equal(await f.controller.whenMediaSettled(), true);
    assert.equal(f.controller.getState().time, 17999.5);
    assert.ok(Math.abs(f.media.currentTime - 42.99) < 1e-9);
    assert.match(f.media.src, /session-13\.m4a$/);
    const audioUrl = f.media.src, loads = f.counts().loads;
    f.tick(43.49);
    assert.equal(f.controller.getState().time, 18000);
    assert.equal(f.media.src, audioUrl);
    assert.equal(f.counts().loads, loads);
    f.controller.setDeck('final-290');
    assert.equal(f.controller.getState().time, 18000);
    assert.equal(f.media.currentTime, 43.49);
    f.tick(203.49);
    assert.equal(f.controller.getState().time, 18160);
    f.controller.seek(20042.82);
    assert.equal(f.controller.getState().time, 20042.82);
    assert.equal(f.media.currentTime, 0);
    assert.match(f.media.src, /session-14\.m4a$/);
    assert.equal(f.controller.getState().duration, 20400);
    assert.equal(JSON.stringify({talks:timeline.talks, segments:timeline.segments}), original);
  } finally {f.controller.destroy();}
});

test('optional media completion after destruction cannot revive media ownership', async () => {
  const timeline = absentMediaTimeline(), manifest = readyMediaManifest(timeline);
  let releaseManifest, signal;
  const f = fixture({response:async (url, options) => {
    if (url.endsWith('/timeline.json')) return jsonResponse(timeline);
    signal = options.signal;
    return new Promise(resolve => {releaseManifest = resolve;});
  }});
  await f.controller.load();
  const pending = f.controller.whenMediaSettled();
  f.controller.destroy();
  const loads = f.counts().loads;
  assert.equal(signal.aborted, true);
  releaseManifest(jsonResponse(manifest));
  assert.equal(await pending, false);
  assert.equal(f.counts().loads, loads);
  assert.equal(f.counts().playCalls, 0);
  assert.equal(f.media.src, '');
  assert.equal(f.host.childElementCount, 0);
});

test('a manifest from an obsolete load cannot replace the current unavailable package', async () => {
  const timeline = absentMediaTimeline(), manifest = readyMediaManifest(timeline);
  let releaseOldManifest, oldSignal, manifestRequests = 0;
  const f = fixture({response:async (url, options) => {
    if (url.endsWith('/timeline.json')) return jsonResponse(timeline);
    if (++manifestRequests === 1) {
      oldSignal = options.signal;
      return new Promise(resolve => {releaseOldManifest = resolve;});
    }
    return jsonResponse({schemaVersion:1, kind:'atlas-conference-media', eventId:timeline.event.id,
      status:'unavailable', decks:[], audio:[], assets:[]});
  }});
  try {
    await f.controller.load();
    const oldPending = f.controller.whenMediaSettled();
    f.controller.seek(3725); f.controller.setDeck('r17-257');
    await f.controller.load();
    assert.equal(await f.controller.whenMediaSettled(), false);
    assert.equal(oldSignal.aborted, true);
    releaseOldManifest(jsonResponse(manifest));
    assert.equal(await oldPending, false);
    assert.equal(f.controller.getState().status, 'ready');
    assert.equal(f.controller.getState().time, 3725);
    assert.equal(f.controller.getState().deck, 'r17-257');
    assert.equal(f.role('state-title').textContent, '장표 이미지 없음');
    assert.equal(f.role('notice').textContent, '오디오 없음');
    assert.equal(f.media.src, '');
    assert.equal(f.counts().playCalls, 0);
  } finally {f.controller.destroy();}
});

test('all 14 real session approaches keep exact URL seeks across their own pageshow echo', async () => {
  const timeline = JSON.parse(await readFile(new URL('../dist/conference/timeline.json', import.meta.url)));
  const manifest = readyMediaManifest(timeline);
  const f = fixture({response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
  const native = observeNativeSeeks(f);
  try {
    assert.equal(await f.controller.load(), true); assert.equal(await f.controller.whenMediaSettled(), true);
    native.settle();
    assert.equal(manifest.audio.length - 1, 14);
    for (const next of manifest.audio.slice(1)) {
      const eventTime = next.t0 - 1.5, requestStart = native.requests.length;
      f.navigate('?page=conference&t=' + eventTime + '&deck=final-290');
      native.settle();
      assert.equal(Number(new URL(f.view.location.href).searchParams.get('t')), eventTime, 'lossless URL at ' + eventTime);
      const afterRequest = native.requests.length;
      f.view.dispatchEvent(new f.window.Event('pageshow'));
      assert.equal(native.requests.length, afterRequest, 'self-written URL cannot issue another native seek at ' + eventTime);
      assert.equal(f.controller.getState().time, eventTime);
      assertNativeSeekContract(f, native, manifest, eventTime, requestStart);
    }
    // A genuinely changed URL must still navigate, including within one tenth.
    const eventTime = 2401.74, requestStart = native.requests.length;
    f.navigate('?page=conference&t=' + eventTime + '&deck=final-290'); native.settle();
    assertNativeSeekContract(f, native, manifest, eventTime, requestStart);
    const newStart = native.requests.length;
    f.navigate('?page=conference&t=2401.73&deck=final-290'); native.settle();
    assertNativeSeekContract(f, native, manifest, 2401.73, newStart);
    assert.equal(f.controller.getState().segment, 341);
    assert.equal(f.controller.getState().page, 2);
  } finally {f.controller.destroy();}
});

test('real final page 6 and r17 page 2 retain their target caption and page while the native clock reports seek read-back', async t => {
  const timeline = JSON.parse(await readFile(new URL('../dist/conference/timeline.json', import.meta.url)));
  const manifest = readyMediaManifest(timeline);
  for (const expected of [
    {time:2401.74, deck:'final-290', page:6, segment:342},
    {time:2239.5, deck:'r17-clean-257', page:2, segment:290},
  ].flatMap(expected => [1 / CONFERENCE_MEDIA_SETTINGS.audioSampleRate, 0.02, -0.02].map(readbackDelta => ({...expected, readbackDelta})))) {
    await t.test(expected.deck + ' at ' + expected.time + ' minus ' + expected.readbackDelta, async () => {
      const f = fixture({href:'https://atlas.test/?page=conference&t=' + expected.time + '&deck=' + expected.deck,
        response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
      const native = observeNativeSeeks(f);
      try {
        assert.equal(await f.controller.load(), true); assert.equal(await f.controller.whenMediaSettled(), true);
        assert.equal(f.controller.getState().segment, expected.segment);
        const session = manifest.audio.find(clip => clip.t0 <= expected.time && expected.time < clip.t1);
        native.settle(expected.time - session.t0 - expected.readbackDelta);
        assertNativeSeekContract(f, native, manifest, expected.time);
        assert.equal(f.controller.getState().segment, expected.segment, 'native read-back must not apply the preceding null segment');
        assert.equal(f.controller.getState().page, expected.page);
        assert.equal(f.role('page-status').hidden, true);
        assert.equal(f.host.querySelector('.conference-caption-text').textContent, timeline.segments[expected.segment].text);
        assertVisibleSlide(f, expected.page);
        assert.equal(Number(new URL(f.view.location.href).searchParams.get('t')), expected.time);
        const requests = native.requests.length;
        f.view.dispatchEvent(new f.window.Event('pageshow'));
        assert.equal(native.requests.length, requests);
        assert.equal(f.controller.getState().segment, expected.segment);
        assertVisibleSlide(f, expected.page);
        const otherDeck = timeline.decks.find(deck => deck.id !== expected.deck).id;
        f.controller.setDeck(otherDeck); f.controller.setDeck(expected.deck);
        assert.equal(native.requests.length, requests, 'deck changes do not re-seek the native read-back value');
        assert.equal(f.controller.getState().page, expected.page);
        assert.equal(f.controller.getState().segment, expected.segment);
        // A real playback clock must leave that target when it advances normally.
        f.click('play'); await settle();
        native.settle(expected.time - session.t0 - 0.02);
        assert.equal(f.controller.getState().segment, expected.segment, 'first playback read-back before t0 keeps the exact target');
        native.advance(expected.time - session.t0 - 0.001);
        assert.equal(f.controller.getState().segment, expected.segment, 'playback has not yet reached t0');
        const nextTime = timeline.segments[expected.segment + 1].t0 + 0.001;
        native.advance(nextTime - session.t0);
        assert.equal(f.controller.getState().segment, expected.segment + 1);
        assert.equal(f.host.querySelector('.conference-caption-text').textContent, timeline.segments[expected.segment + 1].text);
        assert.equal(f.controller.getState().playing, true);
      } finally {f.controller.destroy();}
    });
  }
});

test('all 200 real mapped pages survive fractional deep links and keyboard slide navigation', async () => {
  const timeline = JSON.parse(await readFile(new URL('../dist/conference/timeline.json', import.meta.url)));
  const manifest = readyMediaManifest(timeline);
  const f = fixture({response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
  const native = observeNativeSeeks(f), counts = {};
  const checkPage = (deck, page, time, requestStart) => {
    const session = manifest.audio.find(clip => clip.t0 <= time && time < clip.t1);
    const localTime = time - session.t0;
    native.settle(Math.max(0, localTime - 1 / CONFERENCE_MEDIA_SETTINGS.audioSampleRate));
    assertNativeSeekContract(f, native, manifest, time, requestStart);
    const expectedIndex = timeline.segments.findLastIndex(segment => segment.t0 <= time);
    const state = f.controller.getState();
    assert.equal(state.segment, expectedIndex, deck + ':' + page + ' target segment');
    assert.equal(state.page, page, deck + ':' + page + ' selected page');
    assert.equal(f.role('page-status').hidden, Number.isInteger(timeline.segments[expectedIndex].page?.[deck]),
      deck + ':' + page + ' source mapping state, including equal-start null retention');
    assert.equal(f.host.querySelector('.conference-caption-text').textContent, timeline.segments[expectedIndex].text);
    assertVisibleSlide(f, page);
    const afterRequest = native.requests.length;
    f.view.dispatchEvent(new f.window.Event('pageshow'));
    assert.equal(native.requests.length, afterRequest, deck + ':' + page + ' echo cannot re-seek');
    assertVisibleSlide(f, page);
  };
  try {
    await f.controller.load(); assert.equal(await f.controller.whenMediaSettled(), true); native.settle();
    for (const deck of timeline.decks) {
      // Independent first-occurrence oracle over the committed source rows.
      const firstTimes = new Map();
      for (const segment of timeline.segments) {
        const page = segment.page?.[deck.id];
        if (Number.isInteger(page) && !firstTimes.has(page)) firstTimes.set(page, segment.t0);
      }
      const steps = [...firstTimes].sort((a, b) => a[0] - b[0]); counts[deck.id] = steps.length;
      for (const [page, time] of steps) {
        const start = native.requests.length;
        f.navigate('?page=conference&t=' + time + '&deck=' + deck.id);
        checkPage(deck.id, page, time, start);
      }
      // Return to the first mapped page, then use the exact same ] input as the
      // real media harness. Each step must use the original fractional t0.
      let start = native.requests.length;
      f.navigate('?page=conference&t=' + steps[0][1] + '&deck=' + deck.id);
      checkPage(deck.id, ...steps[0], start);
      start = native.requests.length;
      f.click('slide'); checkPage(deck.id, ...steps[0], start);
      for (const [page, time] of steps.slice(1)) {
        start = native.requests.length;
        assert.equal(f.key(']').defaultPrevented, true);
        checkPage(deck.id, page, time, start);
      }
      // Backward stepping also uses page first times, not the rounded URL.
      for (const [page, time] of steps.slice(0, -1).reverse()) {
        start = native.requests.length;
        assert.equal(f.key('[').defaultPrevented, true);
        checkPage(deck.id, page, time, start);
      }
    }
    assert.deepEqual(counts, {'final-290':73, 'r17-clean-257':127});
  } finally {f.controller.destroy();}
});

test('intentional deep links one microsecond before a mapped boundary remain in the previous source segment', async () => {
  const timeline = JSON.parse(await readFile(new URL('../dist/conference/timeline.json', import.meta.url)));
  const manifest = readyMediaManifest(timeline);
  const f = fixture({response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
  const native = observeNativeSeeks(f);
  try {
    await f.controller.load(); assert.equal(await f.controller.whenMediaSettled(), true); native.settle();
    for (const expected of [
      {boundary:2401.74, deck:'final-290', segment:341, page:2},
      {boundary:2239.5, deck:'r17-clean-257', segment:289, page:null},
    ]) {
      const time = expected.boundary - 0.000001, requestStart = native.requests.length;
      f.navigate('?page=conference&t=' + time + '&deck=' + expected.deck); native.settle();
      assertNativeSeekContract(f, native, manifest, time, requestStart);
      assert.equal(f.controller.getState().segment, expected.segment, 'no global rounding or nearest-boundary snapping');
      assert.equal(f.controller.getState().page, expected.page);
      assert.equal(f.role('page-status').hidden, false);
      assert.equal(f.host.querySelector('.conference-caption-text').textContent, timeline.segments[expected.segment].text);
      assert.equal(Number(new URL(f.view.location.href).searchParams.get('t')), time);
    }
  } finally {f.controller.destroy();}
});

test('reloading at a self-written URL rebuilds native media ownership and restores the exact mapped target', async () => {
  const timeline = JSON.parse(await readFile(new URL('../dist/conference/timeline.json', import.meta.url)));
  const manifest = readyMediaManifest(timeline), time = 2401.74;
  const f = fixture({href:'https://atlas.test/?page=conference&t=' + time + '&deck=final-290',
    response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
  const native = observeNativeSeeks(f);
  try {
    await f.controller.load(); assert.equal(await f.controller.whenMediaSettled(), true);
    const session = manifest.audio.find(clip => clip.t0 <= time && time < clip.t1);
    native.settle(time - session.t0 - 0.02);
    assert.equal(Number(new URL(f.view.location.href).searchParams.get('t')), time);
    const source = f.media.src, loads = f.counts().loads, requestStart = native.requests.length;
    assert.equal(await f.controller.load(), true);
    assert.equal(await f.controller.whenMediaSettled(), true);
    assert.ok(f.counts().loads > loads, 'reload must initialize the new native source even when the URL is unchanged');
    assert.equal(f.media.src, source);
    native.settle(time - session.t0 - 0.02);
    assertNativeSeekContract(f, native, manifest, time, requestStart);
    assert.equal(f.controller.getState().segment, 342);
    assert.equal(f.controller.getState().page, 6);
    assert.equal(f.role('page-status').hidden, true);
    assert.equal(f.controller.getState().playing, false);
  } finally {f.controller.destroy();}
});

test('external A to B to A navigation cannot reuse a stale self-written URL marker', async () => {
  const f = fixture(), native = observeNativeSeeks(f);
  try {
    await f.controller.load(); native.settle();
    const timeA = 18.125, timeB = 3725.875;
    f.controller.seek(timeA); native.settle();
    const urlA = f.view.location.href, start = native.requests.length, writes = f.writes.length;
    f.navigate('?page=conference&t=' + timeB + '&deck=final-290');
    assert.equal(f.controller.getState().time, timeB);
    // No native clock event or URL write occurs between the two external
    // navigations. The old own-write marker for A must already be invalidated.
    f.navigate(urlA);
    assert.equal(f.writes.length, writes);
    assert.equal(f.controller.getState().time, timeA);
    assert.deepEqual(native.requests.slice(start).map(request => request.currentTime), [5.875, timeA]);
    assert.match(native.requests[start].src, /fixture-2\.wav$/);
    assert.match(native.requests[start + 1].src, /fixture-1\.wav$/);
    assert.equal(f.controller.getState().segment, conferenceSegmentIndex(fixtureTimeline.segments, timeA));
  } finally {f.controller.destroy();}
});

test('r17 first-image visibility survives preload completion on either side of native seek read-back', async t => {
  const timeline = JSON.parse(await readFile(new URL('../dist/conference/timeline.json', import.meta.url)));
  const manifest = readyMediaManifest(timeline), time = 2239.5, deck = 'r17-clean-257';
  for (const order of ['image-before-readback', 'image-after-readback']) await t.test(order, async () => {
    const f = fixture({href:'https://atlas.test/?page=conference&t=' + time + '&deck=' + deck,
      response:async url => jsonResponse(url.endsWith('/timeline.json') ? timeline : manifest)});
    const native = observeNativeSeeks(f), images = [];
    // Controlled Image lifecycle only: these unit tests perform no WebP decoding.
    f.view.Image = class {
      complete = false; naturalWidth = 0;
      constructor() { images.push(this); }
      finish() { this.complete = true; this.naturalWidth = 1800; this.onload?.(); }
    };
    try {
      await f.controller.load(); assert.equal(await f.controller.whenMediaSettled(), true);
      const prepared = images.find(image => image.src.endsWith('/0002.webp'));
      assert.ok(prepared, 'the exact first r17 image is preloaded');
      assert.equal(f.host.querySelector('.conference-slide-image').hidden, true);
      if (order === 'image-before-readback') { await settle(); prepared.finish(); assertVisibleSlide(f, 2); }
      const session = manifest.audio.find(clip => clip.t0 <= time && time < clip.t1);
      native.settle(time - session.t0 - 1 / CONFERENCE_MEDIA_SETTINGS.audioSampleRate);
      assertNativeSeekContract(f, native, manifest, time);
      const requests = native.requests.length;
      f.view.dispatchEvent(new f.window.Event('pageshow'));
      assert.equal(native.requests.length, requests);
      if (order === 'image-after-readback') { await settle(); prepared.finish(); }
      assert.equal(f.controller.getState().segment, 290);
      assert.equal(f.controller.getState().page, 2);
      assert.equal(f.role('page-status').hidden, true);
      assertVisibleSlide(f, 2);
    } finally {f.controller.destroy();}
  });
});
