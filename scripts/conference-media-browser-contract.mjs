// Pure planning/evidence checks for the installed-media browser harness.
// The caller must verify the installed files against the ready manifest before
// using this plan. Neither this metadata check nor native playback observations
// certify what a person hears, visual correctness, or production delivery.
import assert from 'node:assert/strict';
import {assertConferenceTimeline} from '../dist/conference/timeline.js';
import {validateConferenceMediaManifest} from '../dist/conference/media.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const rounded = value => Math.round(value * 1e9) / 1e9;
const interruptedEvents = new Set(['waiting', 'stalled', 'seeking', 'seeked', 'ended', 'error',
  'abort', 'emptied', 'loadstart', 'pause']);

export function buildConferenceMediaPlaybackPlan({timeline, manifest}) {
  assertConferenceTimeline(timeline);
  const validation = validateConferenceMediaManifest(manifest, {timeline});
  assert.ok(validation.valid && validation.available, 'Playback plan requires a valid ready media manifest: '
    + validation.errors.map(error => error.path + ': ' + error.message).join('; '));
  const pageAssets = new Map(manifest.assets.filter(asset => asset.kind === 'page')
    .map(asset => [asset.deckId + ':' + asset.page, asset]));
  const audioAssets = new Map(manifest.assets.filter(asset => asset.kind === 'audio').map(asset => [asset.file, asset]));
  const decks = timeline.decks.map(deck => {
    const steps = [];
    let retained = null;
    for (let first = 0; first < timeline.segments.length;) {
      const t0 = timeline.segments[first].t0;
      let end = first + 1;
      while (end < timeline.segments.length && timeline.segments[end].t0 === t0) end++;
      const candidates = [];
      for (let index = first; index < end; index++) {
        const page = timeline.segments[index].page?.[deck.id] ?? null;
        if (page === null) continue; // A null row retains the preceding image.
        assert.ok(retained === null || page >= retained, 'Mapped page order reverses in ' + deck.id + ' at segment ' + index);
        if (page !== retained) candidates.push({page, t0, index});
        retained = page;
      }
      // The player selects the LAST segment at a shared t0, then retains the
      // latest non-null page. An earlier different page in that group has no
      // reachable playback interval and must not be silently counted as tested.
      for (const candidate of candidates) {
        assert.equal(candidate.page, retained, 'Mapped page cannot be reached at its first time: ' + deck.id + ' page ' + candidate.page);
        const asset = pageAssets.get(deck.id + ':' + candidate.page);
        assert.ok(asset, 'Mapped page has no installed-manifest asset: ' + deck.id + ' page ' + candidate.page);
        assert.equal(asset.file, deck.dir + '/' + String(candidate.page).padStart(4, '0') + '.webp', 'Mapped image file differs from the deck contract');
        const previous = steps.at(-1);
        assert.ok(!previous || candidate.page > previous.page && candidate.t0 > previous.t0, 'Mapped page steps must increase in original time and page order');
        steps.push({page: candidate.page, t0: candidate.t0, file: asset.file, index: candidate.index});
      }
      first = end;
    }
    assert.ok(steps.length, 'Deck has no reachable mapped pages to verify: ' + deck.id);
    return {id: deck.id, steps};
  });
  const sessions = manifest.audio.map((clip, index) => {
    const talk = timeline.talks[index], asset = audioAssets.get(clip.file);
    assert.ok(talk && clip.talkId === talk.id && clip.t0 === talk.t0 && clip.t1 === talk.t1, 'Session differs from its original program boundary');
    assert.ok(asset && asset.talkId === talk.id, 'Session has no matching installed-manifest audio asset');
    return {id: clip.id, talkId: clip.talkId, file: clip.file, t0: clip.t0, t1: clip.t1};
  });
  const boundaries = sessions.slice(1).map((to, index) => {
    const from = sessions[index];
    assert.equal(from.t1, to.t0, 'Session boundary must be contiguous');
    return {eventTime: to.t0, from, to};
  });
  const sourceJoins = manifest.audio.flatMap(clip => clip.sourceRanges.slice(1).flatMap((range, index) => {
    const previous = clip.sourceRanges[index];
    assert.equal(previous.t1, range.t0, 'Source ranges must meet without a gap');
    if (previous.inputId === range.inputId) return [];
    assert.ok(range.t0 > clip.t0 && range.t0 < clip.t1, 'Source join must be inside a single encoded session');
    return [{sessionId: clip.id, file: clip.file, eventTime: range.t0, localTime: rounded(range.t0 - clip.t0)}];
  }));
  // At this earliest shared time every deck has acquired an image, making an
  // absent/invalid-media fallback check exercise image and audio absence alike.
  const fallbackTime = Math.max(...decks.map(deck => deck.steps[0].t0));
  return {decks, sessions, boundaries, sourceJoins, fallbackTime};
}

function sourceMatchesFile(src, file) {
  if (typeof src !== 'string' || !src || typeof file !== 'string' || !file
      || /[\\:%?#\u0000-\u001f\u007f]/.test(file)
      || file.split('/').some(part => !part || part === '.' || part === '..')) return false;
  try {
    const parsed = new URL(src, 'http://evidence.invalid/');
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.pathname.endsWith('/' + file);
  } catch { return false; }
}

export function assertConferenceSourceJoinEvidence({samples, events}, join) {
  assert.ok(join && finite(join.eventTime) && finite(join.localTime) && join.localTime > 0
    && join.eventTime >= join.localTime, 'Source join requires finite event and local clocks');
  assert.ok(Array.isArray(samples) && samples.length >= 2, 'Source join requires native samples before and after the join');
  assert.ok(Array.isArray(events), 'Source join requires an event capture after the playback baseline');
  const offset = join.eventTime - join.localTime, src = samples[0]?.src;
  assert.ok(sourceMatchesFile(src, join.file), 'Native source does not match the joined session file');
  let previous = null, beforeCount = 0, afterCount = 0, maximumSampleGapMs = 0;
  for (const [index, sample] of samples.entries()) {
    assert.ok(sample && finite(sample.at) && sample.at >= 0 && finite(sample.eventTime) && sample.eventTime >= 0
      && finite(sample.currentTime) && sample.currentTime >= 0, 'Native sample clocks must be finite: ' + index);
    assert.equal(sample.src, src, 'Native source changed inside the encoded source join');
    assert.equal(sample.paused, false, 'Native playback paused at the source join');
    assert.equal(sample.ended, false, 'Native playback ended at the source join');
    assert.equal(sample.error, null, 'Native playback error or uncaptured error state at the source join');
    assert.ok(Number.isInteger(sample.readyState) && sample.readyState >= 2 && sample.readyState <= 4,
      'Native readyState fell below playable data at the source join');
    // This bound covers floating-point addition only; it is not a playback,
    // synchronization, layout, transition, or audible-gap tolerance.
    assert.ok(Math.abs(sample.eventTime - (sample.currentTime + offset)) <= 1e-8,
      'Native event time is not the session offset plus currentTime');
    if (previous) {
      assert.ok(sample.at >= previous.at, 'Native samples are not in capture order');
      assert.ok(sample.currentTime >= previous.currentTime && sample.eventTime >= previous.eventTime,
        'Native playback clock reversed at the source join');
      maximumSampleGapMs = Math.max(maximumSampleGapMs, sample.at - previous.at);
    }
    if (sample.eventTime < join.eventTime) beforeCount++;
    if (sample.eventTime > join.eventTime) afterCount++;
    previous = sample;
  }
  assert.ok(samples.at(-1).at > samples[0].at, 'Source join evidence has no observed elapsed capture time');
  assert.ok(beforeCount > 0, 'No native sample precedes the source join');
  assert.ok(afterCount > 0, 'No native sample follows the source join');
  for (const event of events) {
    assert.ok(event && typeof event.type === 'string' && event.type.length > 0 && finite(event.at) && event.at >= 0,
      'Captured media event requires its native type and capture time');
    assert.ok(!interruptedEvents.has(event.type), 'Native media event interrupted the source join: ' + event.type);
  }
  return {passed: true, sessionId: join.sessionId, file: join.file, eventTime: join.eventTime, localTime: join.localTime,
    source: src, sampleCount: samples.length, beforeCount, afterCount, eventCount: events.length,
    firstEventTime: samples[0].eventTime, lastEventTime: samples.at(-1).eventTime,
    nativeAdvanceSec: rounded(samples.at(-1).currentTime - samples[0].currentTime), maximumSampleGapMs,
    humanListening: 'not-performed'};
}
