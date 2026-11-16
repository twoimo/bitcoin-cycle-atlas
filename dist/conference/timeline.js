// A-4 is an input contract, not a mapping generator. This module never fills in
// a missing subtitle, guesses a page, sorts source rows or rewrites source text.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?$/;

function clockSeconds(value) {
  if (typeof value !== 'string' || !clockPattern.test(value)) return null;
  const [hours, minutes, seconds] = value.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function relativeAsset(value) {
  return text(value) && !/[\\:%?#\u0000-\u001f\u007f]/.test(value)
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

export function validateConferenceTimeline(data, {sourceSegments, requireCoverage = false} = {}) {
  const errors = [];
  const fail = (code, path, message) => errors.push({code, path, message});
  const summary = {
    audioDurationSec: 0, segmentCount: 0, talkCount: 0, deckCount: 0,
    lastSegmentT1: null,
    coverage: {checked: false, expectedCount: null, missing: [], unexpected: [], duplicates: [], changed: []},
  };
  const finish = () => ({valid: errors.length === 0, errors, summary});
  if (!object(data)) {
    fail('timeline_object', '$', 'Timeline must be an object.');
    return finish();
  }
  if (data.schemaVersion !== 1) fail('schema_version', 'schemaVersion', 'schemaVersion must be 1.');
  const event = object(data.event) ? data.event : {};
  if (!object(data.event)) fail('event_object', 'event', 'event must be an object.');
  for (const key of ['id', 'title', 'date', 'timezone', 'clockStart', 'clockEnd']) {
    if (!text(event[key])) fail('event_field', `event.${key}`, `${key} must be a non-empty string.`);
  }
  if (text(event.date)) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? new Date(`${event.date}T00:00:00Z`) : null;
    if (!date || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== event.date) {
      fail('event_date', 'event.date', 'date must be a real YYYY-MM-DD date.');
    }
  }
  if (text(event.timezone)) {
    try { new Intl.DateTimeFormat('en', {timeZone: event.timezone}); }
    catch { fail('event_timezone', 'event.timezone', 'timezone must be an available IANA time zone.'); }
  }
  const eventStart = clockSeconds(event.clockStart);
  for (const key of ['clockStart', 'clockEnd']) {
    if (clockSeconds(event[key]) === null) fail('event_clock', `event.${key}`, 'Clock must use HH:MM:SS, optionally with fractional seconds.');
  }
  const collections = {};
  for (const key of ['audio', 'decks', 'talks', 'segments']) {
    if (!Array.isArray(data[key]) || data[key].length === 0) fail('nonempty_array', key, `${key} must be a non-empty array.`);
    collections[key] = Array.isArray(data[key]) ? data[key] : [];
  }
  summary.segmentCount = collections.segments.length;
  summary.talkCount = collections.talks.length;
  summary.deckCount = collections.decks.length;
  const registry = (rows, name) => {
    const map = new Map();
    rows.forEach((row, index) => {
      const path = `${name}[${index}]`;
      if (!object(row)) { fail('row_object', path, 'Each row must be an object.'); return; }
      if (!text(row.id)) fail('row_id', `${path}.id`, 'id must be a non-empty string.');
      else if (map.has(row.id)) fail('duplicate_id', `${path}.id`, `Duplicate ${name} id: ${row.id}`);
      else map.set(row.id, row);
    });
    return map;
  };
  const audio = registry(collections.audio, 'audio');
  const decks = registry(collections.decks, 'decks');
  const talks = registry(collections.talks, 'talks');
  let nextAudioStart = 0;
  collections.audio.forEach((row, index) => {
    if (!object(row)) return;
    const path = `audio[${index}]`;
    if (!relativeAsset(row.file)) fail('asset_path', `${path}.file`, 'Audio file must be a safe relative asset path.');
    const start = clockSeconds(row.clockStart);
    if (start === null) fail('audio_clock', `${path}.clockStart`, 'Audio clockStart must use HH:MM:SS.');
    const durationValid = finite(row.durationSec) && row.durationSec > 0;
    if (!durationValid) fail('audio_duration', `${path}.durationSec`, 'durationSec must be a finite positive number.');
    if (start !== null && eventStart !== null) {
      const offset = (start - eventStart + 86400) % 86400;
      if (Math.abs(offset - nextAudioStart) > 1e-6) {
        fail('audio_continuity', `${path}.clockStart`, 'Audio files must be ordered and contiguous from the event start.');
      }
    }
    if (durationValid) { summary.audioDurationSec += row.durationSec; nextAudioStart += row.durationSec; }
  });
  if (!finite(summary.audioDurationSec)) fail('audio_total', 'audio', 'Total audio duration must be finite.');
  collections.decks.forEach((row, index) => {
    if (!object(row)) return;
    const path = `decks[${index}]`;
    if (!text(row.label)) fail('deck_label', `${path}.label`, 'Deck label must be a non-empty string.');
    if (!Number.isSafeInteger(row.pages) || row.pages < 1) fail('deck_pages', `${path}.pages`, 'Deck pages must be a positive safe integer.');
    if (!relativeAsset(row.dir)) fail('asset_path', `${path}.dir`, 'Deck dir must be a safe relative asset path.');
  });
  const pageNumber = (value, deckId, path) => {
    const deck = decks.get(deckId);
    if (!deck) { fail('unknown_deck', path, `Unknown deck: ${deckId}`); return false; }
    if (!Number.isSafeInteger(value) || value < 1 || value > deck.pages) {
      fail('page_range', path, `Page must be a 1-based integer within deck ${deckId} (1..${deck.pages}).`);
      return false;
    }
    return true;
  };
  const interval = (row, path) => {
    const valid = finite(row.t0) && finite(row.t1) && row.t0 >= 0 && row.t1 > row.t0;
    if (!valid) fail('time_interval', path, 't0/t1 must be finite event seconds with 0 <= t0 < t1.');
    if (finite(row.t1) && row.t1 > summary.audioDurationSec) {
      fail('audio_overrun', `${path}.t1`, `t1 must not exceed total audio length (${summary.audioDurationSec}s).`);
    }
    return valid;
  };
  let previousTalkEnd = 0;
  collections.talks.forEach((row, index) => {
    if (!object(row)) return;
    const path = `talks[${index}]`;
    if (!text(row.title)) fail('talk_title', `${path}.title`, 'Talk title must be a non-empty string.');
    if (interval(row, path)) {
      if (row.t0 < previousTalkEnd) fail('talk_order', path, 'Talks must be ordered without overlapping intervals.');
      previousTalkEnd = row.t1;
    }
    if (!object(row.pageRange)) fail('talk_page_range', `${path}.pageRange`, 'pageRange must be a deck-keyed object; a deck range may be null.');
    else for (const [deckId, range] of Object.entries(row.pageRange)) {
      const here = `${path}.pageRange.${deckId}`;
      if (!decks.has(deckId)) { fail('unknown_deck', here, `Unknown deck: ${deckId}`); continue; }
      if (range === null) continue;
      if (!Array.isArray(range) || range.length !== 2) { fail('talk_page_range', here, 'Page range must be [first, last] or null.'); continue; }
      const first = pageNumber(range[0], deckId, `${here}[0]`);
      const last = pageNumber(range[1], deckId, `${here}[1]`);
      if (first && last && range[0] > range[1]) fail('talk_page_range', here, 'Page range must be ascending.');
    }
  });
  const actualSources = new Map();
  let previousStart = -Infinity;
  collections.segments.forEach((row, index) => {
    const path = `segments[${index}]`;
    if (!object(row)) { fail('row_object', path, 'Each segment must be an object.'); return; }
    if (interval(row, path)) {
      if (row.t0 < previousStart) fail('segment_order', path, 'Segments must remain ordered by event t0.');
      previousStart = row.t0;
      summary.lastSegmentT1 = row.t1;
    }
    if (!text(row.text)) fail('segment_text', `${path}.text`, 'Subtitle text must be a non-empty string.');
    if (!text(row.source)) fail('segment_source', `${path}.source`, 'Every segment must retain its original source id.');
    else if (actualSources.has(row.source)) {
      fail('duplicate_source', `${path}.source`, `Duplicate source segment: ${row.source}`);
      summary.coverage.duplicates.push(row.source);
    } else actualSources.set(row.source, row);
    if (!text(row.talk) || !talks.has(row.talk)) fail('unknown_talk', `${path}.talk`, 'Segment talk must refer to a declared talk id.');
    if (!own(row, 'page')) fail('segment_page', `${path}.page`, 'page is required; use null when no matching slide exists.');
    else if (row.page !== null) {
      if (!object(row.page)) fail('segment_page', `${path}.page`, 'page must be null or a deck-keyed page map.');
      else for (const [deckId, page] of Object.entries(row.page)) {
        if (!decks.has(deckId)) fail('unknown_deck', `${path}.page.${deckId}`, `Unknown deck: ${deckId}`);
        else if (page !== null) pageNumber(page, deckId, `${path}.page.${deckId}`);
      }
    }
  });
  const coverage = summary.coverage;
  if (sourceSegments === undefined) {
    if (requireCoverage) fail('source_inventory_required', 'sourceSegments', 'Independent source subtitle rows are required to prove zero missing segments.');
  } else if (!Array.isArray(sourceSegments) || sourceSegments.length === 0) {
    fail('source_inventory_array', 'sourceSegments', 'Independent source subtitles must be a non-empty array.');
  } else {
    coverage.checked = true;
    coverage.expectedCount = sourceSegments.length;
    const expected = new Map();
    sourceSegments.forEach((row, index) => {
      const path = `sourceSegments[${index}]`;
      if (!object(row) || !text(row.source) || !text(row.text) || !finite(row.t0) || !finite(row.t1) || row.t0 < 0 || row.t1 <= row.t0) {
        fail('source_inventory_row', path, 'Source rows require source, original text and finite ordered event t0/t1.'); return;
      }
      if (own(row, 'audioId') && !audio.has(row.audioId)) fail('unknown_audio', `${path}.audioId`, 'Source audioId must refer to a declared audio id.');
      if (expected.has(row.source)) { fail('source_inventory_duplicate', path, `Duplicate independent source id: ${row.source}`); return; }
      expected.set(row.source, row);
    });
    for (const [id, source] of expected) {
      const row = actualSources.get(id);
      if (!row) { coverage.missing.push(id); fail('missing_source', 'segments', `Missing source segment: ${id}`); }
      else if (row.text !== source.text || row.t0 !== source.t0 || row.t1 !== source.t1) {
        coverage.changed.push(id);
        fail('changed_source', 'segments', `Source text or event time changed: ${id}`);
      }
    }
    for (const id of actualSources.keys()) if (!expected.has(id)) {
      coverage.unexpected.push(id); fail('unexpected_source', 'segments', `Segment has no independent source row: ${id}`);
    }
  }
  return finish();
}

export function assertConferenceTimeline(data, options) {
  const validation = validateConferenceTimeline(data, options);
  if (!validation.valid) {
    const error = new TypeError(`Invalid conference timeline: ${validation.errors.map(item => `${item.path}: ${item.message}`).join(' ')}`);
    error.validation = validation;
    throw error;
  }
  return data;
}
