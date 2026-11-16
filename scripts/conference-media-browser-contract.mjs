// Pure planning/evidence checks for the installed-media browser harness.
// The caller must verify the installed files against the ready manifest before
// using this plan. Neither this metadata check nor native playback observations
// certify what a person hears, visual correctness, or production delivery.
import assert from 'node:assert/strict';
import {assertConferenceTimeline} from '../dist/conference/timeline.js';
import {CONFERENCE_MEDIA_SETTINGS, validateConferenceMediaManifest} from '../dist/conference/media.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const rounded = value => Math.round(value * 1e9) / 1e9;
const interruptedEvents = new Set(['waiting', 'stalled', 'seeking', 'seeked', 'ended', 'error',
  'abort', 'emptied', 'loadstart', 'pause']);

// A requested seek and the browser's subsequent clock read-back are separate
// observations. The supplied macOS readings differ from their intended targets
// by 10–50ms; they do not record native setter requests or establish the cause.
// Three AAC-LC frames are the smallest whole-frame budget covering that maximum:
// ceil(50 / (1024/48000*1000))=3. This 64ms read-back policy applies only AFTER
// independent setter evidence proves every requested local time was exact.
// It is not an AAC/browser timing guarantee or a mapping budget; app/native
// coherence retains 1ms, and a changed request cannot spend the frame allowance.
export const CONFERENCE_SEEK_READBACK = Object.freeze({
  aacFrameSamples:1024,
  sampleRate:CONFERENCE_MEDIA_SETTINGS.audioSampleRate,
  readbackFrames:3,
  readbackSeconds:3 * 1024 / CONFERENCE_MEDIA_SETTINGS.audioSampleRate,
  stateRoundingSeconds:0.001,
});

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

export function assertConferenceSeekEvidence({snapshot, requests, session, eventTime, settings}) {
  assert.equal(settings?.audioCodec, 'aac', 'Seek clock policy requires the locked AAC encoding');
  assert.equal(settings?.audioSampleRate, CONFERENCE_SEEK_READBACK.sampleRate,
    'Seek clock policy requires the locked 48 kHz sample rate');
  assert.ok(session && finite(session.t0) && session.t0 >= 0 && finite(session.t1) && session.t1 > session.t0,
    'Seek evidence requires a valid session interval');
  assert.ok(finite(eventTime) && eventTime >= session.t0 && eventTime < session.t1,
    'Requested event time must belong to the expected session');
  const expectedLocalTime = eventTime - session.t0;
  assert.ok(Array.isArray(requests) && requests.length > 0, 'Seek evidence requires the observed native setter attempts');
  const accepted = [];
  for (const request of requests) {
    assert.ok(request && finite(request.currentTime), 'Seek evidence requires the observed native setter request');
    assert.ok(sourceMatchesFile(request.src, session.file), 'Native seek request source differs from the expected session');
    assert.equal(request.currentTime, expectedLocalTime, 'Requested native time must exactly equal event time minus session offset');
    assert.equal(typeof request.accepted, 'boolean', 'Seek attempt must record whether the native setter accepted it');
    if (request.accepted) accepted.push(request);
  }
  assert.ok(accepted.length > 0, 'Seek evidence requires at least one successful native setter attempt');
  const request = accepted.at(-1);

  assert.equal(snapshot?.state?.state, 'ready'); assert.equal(snapshot?.h1Count, 1);
  const audio = snapshot?.audio;
  assert.ok(audio && sourceMatchesFile(audio.currentSrc, session.file), 'Native read-back source differs from the expected session');
  assert.equal(audio.error, null, 'Native seek read-back has a media error');
  assert.equal(audio.seeking, false, 'Native seek has not settled');
  assert.equal(audio.paused, true, 'Seek read-back must precede playback advancement');
  assert.ok(Number.isInteger(audio.readyState) && audio.readyState >= 1 && audio.readyState <= 4,
    'Seek read-back requires native metadata');
  assert.ok(finite(audio.currentTime) && audio.currentTime >= 0, 'Native seek read-back must be a finite nonnegative time');
  const stateValue = snapshot.state.time;
  assert.ok((typeof stateValue === 'string' && stateValue.trim() !== '' || finite(stateValue))
    && finite(Number(stateValue)), 'Player event clock must be present and finite');
  const stateEventTime = Number(stateValue), nativeEventTime = session.t0 + audio.currentTime;
  const nativeDifferenceSeconds = audio.currentTime - expectedLocalTime;
  // At multi-hour offsets, subtracting doubles can slightly exceed an exact
  // mathematical boundary. This numerical allowance is a few ULPs only, not
  // an extra audio frame, clock granularity, or application timing tolerance.
  const arithmeticRoundoffSeconds = 4 * Number.EPSILON * Math.max(1, Math.abs(audio.currentTime), Math.abs(expectedLocalTime));
  assert.ok(Math.abs(nativeDifferenceSeconds) <= CONFERENCE_SEEK_READBACK.readbackSeconds + arithmeticRoundoffSeconds,
    'Native seek read-back exceeds the three-frame AAC budget (64ms)');
  assert.ok(Math.abs(stateEventTime - nativeEventTime) <= CONFERENCE_SEEK_READBACK.stateRoundingSeconds,
    'Player event clock must follow session offset plus native read-back within 1ms');
  return {passed:true, sessionId:session.id, file:session.file, requestedEventTime:eventTime,
    expectedLocalTime, requestedLocalTime:request.currentTime, observedLocalTime:audio.currentTime,
    requestCount:requests.length, acceptedRequestCount:accepted.length,
    observedNativeEventTime:nativeEventTime, observedPlayerEventTime:stateEventTime,
    nativeDifferenceMs:rounded(nativeDifferenceSeconds * 1000),
    playerNativeDifferenceMs:rounded((stateEventTime - nativeEventTime) * 1000),
    frameSamples:CONFERENCE_SEEK_READBACK.aacFrameSamples, sampleRate:CONFERENCE_SEEK_READBACK.sampleRate,
    readbackFrames:CONFERENCE_SEEK_READBACK.readbackFrames,
    readbackBudgetMs:CONFERENCE_SEEK_READBACK.readbackSeconds * 1000,
    stateRoundingBudgetMs:CONFERENCE_SEEK_READBACK.stateRoundingSeconds * 1000};
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
