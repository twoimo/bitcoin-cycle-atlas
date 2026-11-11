import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {mountConferencePlayer, formatConferenceTime, conferenceSegmentIndex, conferenceMappedPage} from '../dist/conference/player.js';

const fixtureTimeline = JSON.parse(await readFile(new URL('./fixtures/conference/timeline.synthetic.json', import.meta.url)));
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture({href='https://atlas.test/bitcoin-cycle-atlas/?page=conference', width=1440, response, play} = {}) {
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
    document, window:view, mediaElement:media,
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
