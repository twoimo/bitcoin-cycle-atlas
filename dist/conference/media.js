// P1c-A: metadata only. The timeline continues to own pages, talks and event time.
// Cloudflare Free limits apply to the whole retained site plus this output:
// https://developers.cloudflare.com/workers/platform/limits/#static-assets
// https://developers.cloudflare.com/pages/platform/limits/#files
export const CONFERENCE_MEDIA_LIMITS = Object.freeze({maxFileBytes:25 * 1024 * 1024, maxFiles:20000});
export const CONFERENCE_MEDIA_SETTINGS = Object.freeze({
  longEdge:1800, webpQuality:80, webpMethod:6, audioCodec:'aac', audioContainer:'m4a',
  audioBitrate:40000, audioChannels:1, audioSampleRate:48000,
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = value => typeof value === 'number' && Number.isFinite(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const path = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value)
  && value.split('/').every(part => part && part !== '.' && part !== '..');
const sameTime = (left, right) => number(left) && number(right) && Math.abs(left - right) < 1e-8;
const sample = seconds => Math.round(seconds * CONFERENCE_MEDIA_SETTINGS.audioSampleRate);

export function validateConferenceMediaManifest(data, {timeline, timelineSha256, manifestBytes} = {}) {
  const errors = [], summary = {pageCount:0, audioCount:0, assetCount:0, assetBytes:0, fileCount:0, siteFileCount:0};
  const fail = (code, field, message) => errors.push({code, path:field, message});
  const finish = () => ({valid:errors.length === 0, available:errors.length === 0 && data?.status === 'ready', errors, summary});
  if (!object(data)) { fail('manifest_object', '$', 'Media manifest must be an object.'); return finish(); }
  if (data.schemaVersion !== 1) fail('schema_version', 'schemaVersion', 'schemaVersion must be 1.');
  if (data.kind !== 'atlas-conference-media') fail('manifest_kind', 'kind', 'Unexpected conference media kind.');
  if (!text(data.eventId) || (timeline && data.eventId !== timeline.event?.id)) fail('event_id', 'eventId', 'Manifest must belong to this timeline event.');
  if (manifestBytes !== undefined && (!integer(manifestBytes) || manifestBytes < 1 || manifestBytes > CONFERENCE_MEDIA_LIMITS.maxFileBytes)) {
    fail('manifest_size', '$', 'Manifest exceeds the 25 MiB file limit or has an invalid size.');
  }
  if (!['ready','unavailable'].includes(data.status)) fail('media_status', 'status', 'Use ready or unavailable.');
  if (data.status === 'unavailable') {
    for (const key of ['decks','audio','assets']) if (!Array.isArray(data[key]) || data[key].length !== 0) {
      fail('unavailable_assets', key, 'An unavailable manifest must declare no media assets.');
    }
    return finish();
  }
  if (data.status !== 'ready') return finish();
  const rows = {};
  for (const key of ['inputs','decks','audio','assets']) {
    if (!Array.isArray(data[key]) || data[key].length === 0) fail('manifest_array', key, key + ' must be nonempty.');
    rows[key] = Array.isArray(data[key]) ? data[key] : [];
  }
  if (rows.assets.length + 1 > CONFERENCE_MEDIA_LIMITS.maxFiles) {
    fail('file_count', 'assets', 'Media plus manifest exceeds 20,000 files.'); return finish();
  }
  for (const [key, value] of Object.entries(CONFERENCE_MEDIA_SETTINGS)) {
    if (data.settings?.[key] !== value) fail('media_settings', 'settings.' + key, 'Expected ' + value + '.');
  }
  for (const [key, value] of Object.entries(CONFERENCE_MEDIA_LIMITS)) {
    if (data.limits?.[key] !== value) fail('media_limits', 'limits.' + key, 'Limits may not be raised or omitted.');
  }
  for (const key of ['timeline','deckLock']) {
    if (!object(data[key]) || !integer(data[key].bytes) || data[key].bytes < 1 || !digest(data[key].sha256)) {
      fail('source_identity', key, 'Require exact source bytes and SHA-256.');
    }
  }
  if (timelineSha256 !== undefined && (!digest(timelineSha256) || data.timeline?.sha256 !== timelineSha256)) {
    fail('timeline_identity', 'timeline.sha256', 'Media was prepared for different timeline bytes.');
  }
  if (!object(data.toolchain) || Object.keys(data.toolchain).length === 0) fail('toolchain', 'toolchain', 'Record renderer and encoder identities.');
  if (data.review?.listening !== 'pending' || data.review?.visual !== 'pending') {
    fail('review_claim', 'review', 'Machine preparation cannot claim human listening or visual acceptance.');
  }
  const inputs = new Map();
  for (const [index, input] of rows.inputs.entries()) {
    const at = 'inputs[' + index + ']';
    if (!object(input)) { fail('input_object', at, 'Input must be an object.'); continue; }
    if (!text(input.id) || inputs.has(input.id)) fail('input_id', at + '.id', 'Input IDs must be unique.');
    else inputs.set(input.id, input);
    if (!['pdf','audio'].includes(input.kind)) fail('input_kind', at + '.kind', 'Expected pdf or audio.');
    if (!text(input.file) || /[\\/\u0000-\u001f\u007f]/.test(input.file)) fail('input_name', at + '.file', 'Record the input basename, not a machine-specific path.');
    if (!integer(input.bytes) || input.bytes < 1 || !digest(input.sha256)) fail('input_identity', at, 'Require input bytes and SHA-256.');
  }
  const originalAudio = rows.inputs.filter(input => input?.kind === 'audio');
  let duration = 0;
  originalAudio.forEach((input, index) => {
    const at = 'inputs.audio[' + index + ']';
    if (!number(input.t0) || !number(input.t1) || input.t0 !== duration || input.t1 <= input.t0) {
      fail('input_audio_coverage', at, 'Original audio windows must be contiguous from event zero.');
      return;
    }
    duration = input.t1;
    if (!sameTime(input.durationSec, input.t1 - input.t0)) fail('input_audio_duration', at, 'Declared duration must match the event window.');
    if (!integer(input.decodedSamples) || input.decodedSamples < sample(input.t1 - input.t0)) {
      fail('input_audio_short', at, 'Decoded input must contain every requested sample; do not pad missing audio.');
    }
    const expected = timeline?.audio?.[index];
    if (timeline && (!expected || input.id !== expected.id || !sameTime(input.durationSec, expected.durationSec))) {
      fail('input_audio_timeline', at, 'Input audio windows must match the original timeline sources.');
    }
  });
  if (originalAudio.length !== 2) fail('input_audio_count', 'inputs', 'Exactly two original audio sources are required.');
  if (timeline && (!Array.isArray(timeline.audio) || timeline.audio.length !== originalAudio.length
      || !timeline.audio.every(clip => number(clip?.durationSec))
      || !sameTime(duration, timeline.audio.reduce((sum, clip) => sum + clip.durationSec, 0)))) {
    fail('event_duration', 'inputs', 'Input audio must cover the complete timeline duration.');
  }
  // Later inventory arithmetic depends on these validated input windows.
  // Malformed JSON must produce validation errors, never implicit coercion.
  if (errors.length) return finish();
  const decks = new Map(), expectedFiles = [];
  rows.decks.forEach((deck, index) => {
    const at = 'decks[' + index + ']';
    if (!object(deck)) { fail('deck_object', at, 'Deck must be an object.'); return; }
    if (!text(deck.id) || decks.has(deck.id)) fail('deck_id', at + '.id', 'Deck IDs must be unique.');
    else decks.set(deck.id, deck);
    if (!path(deck.dir) || !deck.dir.startsWith('pages/')) fail('deck_dir', at + '.dir', 'Use a relative pages directory.');
    if (!integer(deck.pageCount) || deck.pageCount < 1 || deck.pageCount > 9999) fail('deck_pages', at + '.pageCount', 'Page numbers require 1..9999 and four digits.');
    const input = inputs.get(deck.id), expected = timeline?.decks?.[index];
    if (!input || input.kind !== 'pdf' || input.pageCount !== deck.pageCount || input.sha256 !== deck.inputSha256) {
      fail('deck_input', at, 'Deck count and SHA-256 must match its PDF input.');
    }
    if (timeline && (!expected || deck.id !== expected.id || deck.dir !== expected.dir || deck.pageCount !== expected.pages)) {
      fail('deck_timeline', at, 'Deck order, directory and page count must match the timeline.');
    }
    if (integer(deck.pageCount) && deck.pageCount <= 9999 && path(deck.dir)) {
      summary.pageCount += deck.pageCount;
      for (let page = 1; page <= deck.pageCount; page++) expectedFiles.push(deck.dir + '/' + String(page).padStart(4, '0') + '.webp');
    }
  });
  if (rows.decks.length !== 2 || rows.inputs.filter(input => input?.kind === 'pdf').length !== 2
      || (timeline && rows.decks.length !== timeline.decks?.length)) fail('deck_count', 'decks', 'Both source decks are required.');
  if (errors.length) return finish();
  const audioByFile = new Map();
  let end = 0;
  rows.audio.forEach((clip, index) => {
    const at = 'audio[' + index + ']';
    if (!object(clip)) { fail('audio_object', at, 'Session audio must be an object.'); return; }
    const id = String(index).padStart(2, '0'), file = 'audio/session-' + id + '.m4a';
    if (clip.id !== 'session-' + id || clip.talkId !== id || clip.file !== file) fail('audio_name', at, 'Use ordered session-NN.m4a names and the original program ID.');
    if (!number(clip.t0) || !number(clip.t1) || clip.t0 !== end || clip.t1 <= clip.t0) {
      fail('audio_coverage', at, 'Sessions must be contiguous without gaps or overlaps.');
      return;
    }
    if (!sameTime(clip.durationSec, clip.t1 - clip.t0)) fail('audio_duration', at, 'Session duration must retain its exact event window.');
    if (number(clip.t1)) end = clip.t1;
    const expected = timeline?.talks?.[index];
    if (timeline && (!expected || clip.talkId !== expected.id || clip.t0 !== expected.t0 || clip.t1 !== expected.t1)) {
      fail('audio_timeline', at, 'Audio must use the unchanged program boundaries.');
    }
    const ranges = originalAudio.filter(input => input.t0 < clip.t1 && input.t1 > clip.t0).map(input => ({
      inputId:input.id, t0:Math.max(input.t0, clip.t0), t1:Math.min(input.t1, clip.t1), input,
    }));
    if (!Array.isArray(clip.sourceRanges) || clip.sourceRanges.length !== ranges.length) {
      fail('source_ranges', at + '.sourceRanges', 'Include every intersecting original audio source.');
    } else ranges.forEach((range, rangeIndex) => {
      const recorded = clip.sourceRanges[rangeIndex], sourceT0 = range.t0 - range.input.t0, sourceT1 = range.t1 - range.input.t0;
      if (!object(recorded) || recorded.inputId !== range.inputId || recorded.t0 !== range.t0 || recorded.t1 !== range.t1
          || !sameTime(recorded.sourceT0, sourceT0) || !sameTime(recorded.sourceT1, sourceT1)
          || recorded.startSample !== sample(sourceT0) || recorded.endSample !== sample(sourceT1)) {
        fail('source_range', at + '.sourceRanges[' + rangeIndex + ']', 'Preserve exact event and decoded source sample ranges.');
      }
    });
    audioByFile.set(file, clip); expectedFiles.push(file);
  });
  summary.audioCount = rows.audio.length;
  if (!sameTime(end, duration) || (timeline && rows.audio.length !== timeline.talks?.length)) {
    fail('audio_end', 'audio', 'Session audio must cover the complete event and every program.');
  }
  if (errors.length) return finish();
  const files = new Set();
  let maximumBytes = 0;
  rows.assets.forEach((asset, index) => {
    const at = 'assets[' + index + ']';
    if (!object(asset)) { fail('asset_object', at, 'Asset must be an object.'); return; }
    if (!path(asset.file) || files.has(asset.file)) fail('asset_path', at + '.file', 'Asset paths must be unique, relative and confined.');
    files.add(asset.file);
    if (asset.file !== expectedFiles[index]) fail('asset_inventory', at + '.file', 'Assets must contain every page then session in canonical order.');
    if (!integer(asset.bytes) || asset.bytes < 1 || asset.bytes > CONFERENCE_MEDIA_LIMITS.maxFileBytes) fail('asset_size', at + '.bytes', 'Asset must be nonempty and at most 25 MiB.');
    if (!digest(asset.sha256)) fail('asset_hash', at + '.sha256', 'Asset needs a SHA-256.');
    if (integer(asset.bytes)) { summary.assetBytes += asset.bytes; maximumBytes = Math.max(maximumBytes, asset.bytes); }
    if (asset.kind === 'page') {
      const deck = decks.get(asset.deckId);
      if (!deck || !integer(asset.page) || asset.page < 1 || asset.page > deck.pageCount
          || asset.file !== deck.dir + '/' + String(asset.page).padStart(4, '0') + '.webp') fail('page_identity', at, 'Page must identify its original deck and number.');
      if (!integer(asset.width) || !integer(asset.height) || asset.width < 1 || asset.height < 1
          || Math.max(asset.width, asset.height) !== CONFERENCE_MEDIA_SETTINGS.longEdge) fail('page_dimensions', at, 'Rendered WebP long edge must be exactly 1800px.');
    } else if (asset.kind === 'audio') {
      const clip = audioByFile.get(asset.file);
      if (!clip || asset.talkId !== clip.talkId) fail('audio_asset', at, 'Audio asset must belong to exactly one declared session.');
      if (asset.codec !== 'aac' || asset.channels !== 1 || asset.sampleRate !== CONFERENCE_MEDIA_SETTINGS.audioSampleRate) fail('audio_encoding', at, 'Require mono software AAC at 48 kHz.');
      // Encoder priming/edit-list rounding is bounded to one AAC frame. This is
      // a file probe check, never a change to the exact logical session clock.
      if (!clip || !number(asset.durationSec) || asset.durationSec <= 0
          || Math.abs(asset.durationSec - clip.durationSec) > 1024 / CONFERENCE_MEDIA_SETTINGS.audioSampleRate + 1e-8) fail('audio_probe_duration', at, 'Encoded duration must be within one AAC frame of its session.');
    } else fail('asset_kind', at + '.kind', 'Only page and audio assets belong in the manifest.');
  });
  if (rows.assets.length !== expectedFiles.length) fail('asset_count', 'assets', 'Missing or extra media files.');
  summary.assetCount = rows.assets.length; summary.fileCount = summary.assetCount + 1;
  const totals = object(data.totals) ? data.totals : {};
  for (const key of ['pageCount','audioCount','assetCount','assetBytes','fileCount']) {
    if (totals[key] !== summary[key]) fail('media_totals', 'totals.' + key, 'Totals must equal the exact inventory.');
  }
  if (totals.maxAssetBytes !== maximumBytes) fail('media_totals', 'totals.maxAssetBytes', 'Maximum must match the asset inventory.');
  if (!integer(totals.existingSiteFileCount)) fail('site_count', 'totals.existingSiteFileCount', 'Count every retained existing site file.');
  summary.siteFileCount = (integer(totals.existingSiteFileCount) ? totals.existingSiteFileCount : 0) + summary.fileCount;
  if (!integer(totals.siteFileCount) || totals.siteFileCount !== summary.siteFileCount || totals.siteFileCount > CONFERENCE_MEDIA_LIMITS.maxFiles) {
    fail('site_limit', 'totals.siteFileCount', 'Retained site plus generated output may not exceed 20,000 files.');
  }
  return finish();
}

export function assertConferenceMediaManifest(data, context) {
  const result = validateConferenceMediaManifest(data, context);
  if (!result.valid) {
    const error = new TypeError('Invalid conference media: ' + result.errors.map(item => item.path + ': ' + item.message).join(' '));
    error.validation = result; throw error;
  }
  return data;
}

export function conferenceMediaOverlay(data, context) {
  assertConferenceMediaManifest(data, context);
  if (data.status === 'unavailable') return null;
  return {
    decks:data.decks.map(deck => ({id:deck.id, dir:deck.dir, imagesAvailable:true})),
    clips:data.audio.map(clip => ({id:clip.id, file:clip.file, offset:clip.t0, durationSec:clip.t1 - clip.t0, available:true})),
  };
}
