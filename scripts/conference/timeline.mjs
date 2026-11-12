import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, promisify } from 'node:util';

export const EVENT = Object.freeze({ id: 'plspo-2026-10-31', title: '플스포 투자 컨퍼런스 2026', date: '2026-10-31', timezone: 'Asia/Seoul', clockStart: '12:33:00', clockEnd: '18:13:00' });
export const EVENT_DURATION_SEC = 20400;
// Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/platform/limits/
// Checked for this task on 2026-11-10. This does not verify the complete Worker's file count.
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const SOURCES = Object.freeze([
  { id: 'plaud1', audioSourceId: 'plaud-1', clockStart: '12:33:00', offsetSec: 0, durationSec: 18000, expectedSegments: 7995 },
  { id: 'plaud2', audioSourceId: 'plaud-2', clockStart: '17:33:00', offsetSec: 18000, durationSec: 2400, expectedSegments: 1174 },
]);
export const DECKS = Object.freeze([{ id: 'final-290', pages: 290 }, { id: 'r17-257', pages: 257 }]);
const SHA256 = /^[a-f0-9]{64}$/;
const EPSILON = 0.000001;
const AUDIO_PADDING_SEC = 0.05;
const own = (object, key) => Object.hasOwn(object, key);
const fail = (message) => { throw new Error(message); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const sameNumber = (a, b) => finite(a) && finite(b) && Math.abs(a - b) < EPSILON;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const equal = isDeepStrictEqual;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const executeFile = promisify(execFile);

export function clockSeconds(clock) {
  const match = /^(\d{2}):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(clock ?? '');
  requireValue(match && Number(match[1]) < 24, `Invalid clock: ${String(clock)}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number((match[4] ?? '').padEnd(3, '0')) / 1000;
}

function srtSeconds(clock) {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(clock);
  requireValue(match, `Invalid SRT timestamp: ${clock}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

/** Keep cue IDs, body whitespace and original LF/CRLF line breaks; never merge cues. */
export function parseSrt(bytes, sourceId) {
  const source = SOURCES.find((entry) => entry.id === sourceId);
  requireValue(source, `Unknown subtitle source: ${sourceId}`);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  const lines = [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)].filter((match) => match[0] !== '').map((match) => ({ text: match[1], ending: match[2] }));
  const cues = [];
  const ids = new Set();
  let cursor = 0;
  let previousStart = -1;
  while (cursor < lines.length) {
    while (cursor < lines.length && lines[cursor].text.trim() === '') cursor += 1;
    if (cursor === lines.length) break;
    const cueId = lines[cursor++].text;
    requireValue(/^\d+$/.test(cueId), `Non-numeric SRT cue ID at ${sourceId}: ${cueId}`);
    const numericId = BigInt(cueId).toString();
    requireValue(!ids.has(numericId), `Duplicate SRT cue ID: ${sourceId}#${cueId}`);
    ids.add(numericId);
    const timing = /^(\d{2,}:[0-5]\d:[0-5]\d[,.]\d{3})\s+-->\s+(\d{2,}:[0-5]\d:[0-5]\d[,.]\d{3})$/.exec(lines[cursor++]?.text ?? '');
    requireValue(timing, `Invalid SRT timing: ${sourceId}#${cueId}`);
    const localT0 = srtSeconds(timing[1]);
    const localT1 = srtSeconds(timing[2]);
    requireValue(localT0 >= 0 && localT1 > localT0 && localT1 <= source.durationSec + EPSILON, `SRT audio range violation: ${sourceId}#${cueId}`);
    requireValue(localT0 >= previousStart, `SRT timestamp reversal: ${sourceId}#${cueId}`);
    const body = [];
    while (cursor < lines.length && lines[cursor].text.trim() !== '') body.push(lines[cursor++]);
    requireValue(body.length > 0, `Empty SRT cue: ${sourceId}#${cueId}`);
    cues.push({ source: `${sourceId}#${cueId}`, sourceId, cueId, localT0, localT1, t0: localT0 + source.offsetSec, t1: localT1 + source.offsetSec, text: body.map((line, index) => line.text + (index < body.length - 1 ? line.ending : '')).join('') });
    previousStart = localT0;
  }
  requireValue(cues.length > 0, `No SRT cues: ${sourceId}`);
  return cues;
}

function safeRelative(value, label) {
  requireValue(nonempty(value) && !path.isAbsolute(value) && !value.includes('\\') && !value.includes('\0'), `${label}: relative path required`);
  requireValue(!value.split('/').some((part) => part === '..' || part === '.' || part === ''), `${label}: path escape or empty component`);
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value), `${label}: URL-special or unsupported path characters`);
  return value;
}

async function noSymlinks(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      requireValue(!stat.isSymbolicLink(), `Symlink paths are not accepted: ${current}`);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function readFileSafe(filename) {
  await noSymlinks(filename);
  const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    requireValue(stat.isFile(), `Expected a regular file: ${filename}`);
    return await handle.readFile();
  } finally { await handle.close(); }
}

async function readPinned(spec, base, label) {
  requireValue(isObject(spec) && nonempty(spec.file), `${label}: input file is required`);
  requireValue(SHA256.test(spec.sha256 ?? ''), `${label}: full lowercase SHA-256 is required`);
  const filename = path.resolve(base, spec.file);
  const bytes = await readFileSafe(filename);
  requireValue(sha256(bytes) === spec.sha256, `${label}: SHA-256 mismatch`);
  return { filename, bytes, sha256: spec.sha256, sizeBytes: bytes.length };
}

function parseJson(bytes, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (error) { fail(`${label}: invalid JSON (${error.message})`); }
}

function requireEvent(value, label) {
  requireValue(isObject(value), `${label}: event is required`);
  for (const [key, expected] of Object.entries(EVENT)) requireValue(value[key] === expected, `${label}: event.${key} must be ${expected}`);
}

function validatePage(page, label) {
  if (page === null) return;
  requireValue(isObject(page) && Object.keys(page).length === DECKS.length, `${label}: page must be null or contain both deck IDs`);
  for (const deck of DECKS) requireValue(own(page, deck.id) && (page[deck.id] === null || (Number.isInteger(page[deck.id]) && page[deck.id] >= 1 && page[deck.id] <= deck.pages)), `${label}: page outside ${deck.id} 1..${deck.pages}`);
}

export function validateSessions(sessions, sessionAudio) {
  requireValue(Array.isArray(sessions) && sessions.length === 15, 'Programs 00..14: exactly 15 sessions are required');
  let end = 0;
  sessions.forEach((session, index) => {
    requireValue(session.id === String(index).padStart(2, '0') && nonempty(session.title), `Program ${index}: actual ordered ID/title required`);
    requireValue(sameNumber(session.t0, end) && finite(session.t1) && session.t1 > session.t0, `Program ${session.id}: gap, overlap or invalid boundary`);
    requireValue(isObject(session.pageRange) && Object.keys(session.pageRange).length === DECKS.length, `Program ${session.id}: explicit pageRange for both decks required`);
    for (const deck of DECKS) {
      const range = session.pageRange[deck.id];
      requireValue(range === null || (Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) && range[0] >= 1 && range[0] <= range[1] && range[1] <= deck.pages), `Program ${session.id}: invalid ${deck.id} page range`);
    }
    end = session.t1;
  });
  requireValue(sameNumber(end, EVENT_DURATION_SEC), 'Programs must cover 0..20400 seconds exactly');
  if (sessionAudio) for (const audio of sessionAudio) {
    const session = sessions.find((item) => item.id === audio.sessionId);
    const source = SOURCES.find((item) => item.audioSourceId === audio.sourceId);
    requireValue(session && source && sameNumber(audio.t0, Math.max(session.t0, source.offsetSec)) && sameNumber(audio.t1, Math.min(session.t1, source.offsetSec + source.durationSec)), `Session-split audio does not match program boundaries: ${audio.id}`);
  }
}

export function validateMediaManifest(manifest, decisions) {
  requireValue(manifest?.schemaVersion === 1 && manifest.eventId === EVENT.id, 'Media manifest schema/event mismatch');
  requireValue(manifest.verification?.mediaPrepared === true && manifest.verification?.realInputsVerified === true, 'Media preparation/real input verification receipt is required');
  for (const field of ['audioFormat', 'audioSplit', 'r17Variant']) requireValue(manifest.verification[field] === decisions[field], `Media manifest decision mismatch: ${field}`);
  requireValue(Array.isArray(manifest.decks) && manifest.decks.length === DECKS.length, 'Both real source decks are required');
  for (const deck of DECKS) {
    const entry = manifest.decks.find((item) => item.id === deck.id);
    requireValue(entry && entry.pages === deck.pages && nonempty(entry.label) && SHA256.test(entry.sourceSha256 ?? ''), `Invalid ${deck.id} deck manifest`);
    safeRelative(entry.dir, `${deck.id}.dir`);
    if (deck.id === 'r17-257') requireValue(entry.variant === decisions.r17Variant, 'R17 selection does not match media manifest');
  }
  requireValue(Array.isArray(manifest.inputs), 'Media source hashes are required');
  const inputIds = new Set();
  for (const input of manifest.inputs) {
    requireValue(nonempty(input.id) && !inputIds.has(input.id) && SHA256.test(input.sha256 ?? '') && Number.isInteger(input.sizeBytes) && input.sizeBytes > 0, 'Invalid or duplicate media input hash/size');
    inputIds.add(input.id);
  }
  for (const id of [...DECKS.map((deck) => deck.id), ...SOURCES.map((source) => source.audioSourceId)]) requireValue(inputIds.has(id), `Missing media source input: ${id}`);
  for (const source of SOURCES) {
    const input = manifest.inputs.find((item) => item.id === source.audioSourceId);
    requireValue(finite(input.durationSec) && Math.abs(input.durationSec - source.durationSec) <= AUDIO_PADDING_SEC + EPSILON, `Measured original audio duration required: ${source.audioSourceId}`);
  }
  for (const deck of manifest.decks) requireValue(manifest.inputs.find((input) => input.id === deck.id).sha256 === deck.sourceSha256, `Deck/source hash mismatch: ${deck.id}`);
  requireValue(Array.isArray(manifest.audio) && manifest.audio.length > 0, 'Prepared audio is required');
  let end = 0;
  const ids = new Set();
  for (const audio of manifest.audio) {
    requireValue(nonempty(audio.id) && !ids.has(audio.id), 'Duplicate/empty audio ID');
    ids.add(audio.id);
    safeRelative(audio.file, 'audio.file');
    requireValue(audio.file.endsWith(`.${decisions.audioFormat}`), 'Audio extension does not match explicit format decision');
    const source = SOURCES.find((item) => item.audioSourceId === audio.sourceId);
    requireValue(source && sameNumber(audio.t0, end) && finite(audio.t1) && audio.t1 > audio.t0, `Audio ${audio.id}: source, gap, overlap or invalid boundary`);
    requireValue(sameNumber(audio.sourceOffsetSec, audio.t0 - source.offsetSec) && audio.sourceOffsetSec >= 0 && audio.t1 <= source.offsetSec + source.durationSec + EPSILON, `Audio ${audio.id}: source offset/range mismatch`);
    requireValue(sameNumber(clockSeconds(audio.clockStart) - clockSeconds(EVENT.clockStart), audio.t0), `Audio ${audio.id}: clockStart offset mismatch`);
    requireValue(finite(audio.durationSec) && Math.abs(audio.durationSec - (audio.t1 - audio.t0)) <= AUDIO_PADDING_SEC + EPSILON, `Audio ${audio.id}: measured duration differs from planned coverage`);
    if (own(audio, 'plannedDurationSec')) requireValue(sameNumber(audio.plannedDurationSec, audio.t1 - audio.t0), `Audio ${audio.id}: planned duration mismatch`);
    if (own(audio, 'durationDeviationSec')) requireValue(sameNumber(audio.durationDeviationSec, audio.durationSec - (audio.t1 - audio.t0)), `Audio ${audio.id}: duration deviation mismatch`);
    end = audio.t1;
  }
  requireValue(sameNumber(end, EVENT_DURATION_SEC), 'Audio must cover 0..20400 seconds exactly');
  requireValue(Array.isArray(manifest.assets), 'Media asset ledger is required');
  const assets = new Map();
  for (const asset of manifest.assets) {
    safeRelative(asset.file, 'asset.file');
    requireValue(!assets.has(asset.file) && SHA256.test(asset.sha256 ?? '') && Number.isInteger(asset.sizeBytes) && asset.sizeBytes > 0, `Invalid/duplicate media asset: ${asset.file}`);
    requireValue(asset.sizeBytes <= MAX_ASSET_BYTES, `Media asset exceeds 25 MiB: ${asset.file}`);
    requireValue(asset.file !== 'timeline.json' && !asset.file.startsWith('subtitles/'), 'Media assets cannot overwrite timeline/subtitles');
    assets.set(asset.file, asset);
  }
  for (const deck of manifest.decks) for (let page = 1; page <= deck.pages; page += 1) requireValue(assets.has(`${deck.dir}/${String(page).padStart(4, '0')}.webp`), `Missing page asset: ${deck.id}#${page}`);
  for (const audio of manifest.audio) requireValue(assets.has(audio.file), `Missing audio asset: ${audio.file}`);
}

/** Compare subtitle ends against measured metadata, separately from planned event clocks. */
export function validateSubtitleAudioBounds(segments, manifest) {
  requireValue(Array.isArray(segments) && segments.length > 0, 'Subtitle timing cannot be verified without segments');
  const preparedMeasuredDurationSec = Number(manifest.audio.reduce((sum, audio) => sum + audio.durationSec, 0).toFixed(6));
  const maximumSubtitleT1 = Math.max(...segments.map((segment) => segment.t1));
  requireValue(finite(preparedMeasuredDurationSec) && maximumSubtitleT1 <= preparedMeasuredDurationSec + EPSILON, 'Last subtitle exceeds the measured total prepared-audio duration');
  const sourceMeasurements = SOURCES.map((source) => {
    const input = manifest.inputs.find((item) => item.id === source.audioSourceId);
    requireValue(input && finite(input.durationSec), `Measured source duration missing: ${source.audioSourceId}`);
    const sourceSegments = segments.filter((segment) => segment.sourceId === source.id);
    requireValue(sourceSegments.length > 0, `Source subtitles missing: ${source.id}`);
    const maximumSubtitleLocalT1 = Math.max(...sourceSegments.map((segment) => segment.localT1));
    requireValue(maximumSubtitleLocalT1 <= input.durationSec + EPSILON, `Subtitle exceeds measured original audio end: ${source.id}`);
    return { sourceId: source.audioSourceId, plannedDurationSec: source.durationSec, measuredDurationSec: input.durationSec, deviationSec: Number((input.durationSec - source.durationSec).toFixed(6)), maximumSubtitleLocalT1 };
  });
  return { measurementSource: 'pinned-media-manifest-ffprobe-receipt', plannedEventDurationSec: EVENT_DURATION_SEC, preparedMeasuredDurationSec, preparedDeviationSec: Number((preparedMeasuredDurationSec - EVENT_DURATION_SEC).toFixed(6)), maximumSubtitleT1, preparedAudioRemainingSec: Number((preparedMeasuredDurationSec - maximumSubtitleT1).toFixed(6)), sourceMeasurements, perClipDurationToleranceSec: AUDIO_PADDING_SEC, endComparisonToleranceSec: EPSILON };
}

function validateDecisions(decisions) {
  requireValue(isObject(decisions), 'Explicit decisions are required');
  requireValue(['original', 'clean'].includes(decisions.r17Variant), 'R17 final selection is unresolved');
  requireValue(['m4a', 'opus'].includes(decisions.audioFormat), 'Audio format is unresolved');
  requireValue(['session', 'chunk'].includes(decisions.audioSplit), 'Audio split decision is unresolved');
  requireValue(typeof decisions.speakerLabels === 'boolean', 'Speaker-label decision is unresolved');
  requireValue(decisions.generatedSlides === false, 'Generated-slide decision is unresolved or needs a separately reviewed asset contract; this converter supports explicit false only');
}

function validateMapping(mapping, cues, sessions, sourceHashes, speakerLabels) {
  requireValue(mapping?.schemaVersion === 1 && mapping.eventId === EVENT.id, 'Mapping schema/event mismatch');
  requireValue(equal(mapping.sourceSha256, sourceHashes), 'Mapping must pin the exact two subtitle hashes');
  requireValue(Array.isArray(mapping.rows) && mapping.rows.length === cues.length, 'Mapping must contain exactly one row per SRT cue');
  const rows = new Map();
  for (const row of mapping.rows) {
    requireValue(nonempty(row.source) && !rows.has(row.source), `Duplicate mapping source: ${row.source}`);
    requireValue(typeof row.reviewed === 'boolean', `Mapping ${row.source}: explicit reviewed flag required`);
    if (row.reviewed) requireValue(nonempty(row.reviewer) && validDate(row.reviewedAt), `Mapping ${row.source}: reviewer/date missing`);
    validatePage(row.page, `Mapping ${row.source}`);
    if (speakerLabels) requireValue(own(row, 'speaker') && (row.speaker === null || nonempty(row.speaker)), `Mapping ${row.source}: explicit speaker or null required`);
    rows.set(row.source, row);
  }
  return cues.map((cue) => {
    const row = rows.get(cue.source);
    requireValue(row, `Missing mapping source: ${cue.source}`);
    const talk = sessions.find((session) => session.id === row.talk);
    requireValue(talk && cue.t0 >= talk.t0 && cue.t0 < talk.t1, `Mapping ${cue.source}: session does not contain cue start`);
    if (row.page !== null) for (const deck of DECKS) {
      const page = row.page[deck.id];
      const range = talk.pageRange[deck.id];
      requireValue(page === null || (range !== null && page >= range[0] && page <= range[1]), `Mapping ${cue.source}: page outside session range`);
    }
    // A cue crossing a session boundary remains one lossless row, assigned by its start.
    return { ...cue, talk: row.talk, page: row.page, ...(speakerLabels ? { speaker: row.speaker } : {}) };
  });
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
}

export function selectListeningSources(cues, seed) {
  requireValue(nonempty(seed) && cues.length >= 10, 'Listening sample requires a seed and at least 10 cues');
  return cues.map((cue) => ({ source: cue.source, rank: sha256(`${seed}\0${cue.source}`) })).sort((a, b) => a.rank.localeCompare(b.rank) || a.source.localeCompare(b.source)).slice(0, 10).map((entry) => entry.source);
}

function reviewBlockers(review, mapping, segments, provenance, decisions) {
  const blockers = [];
  if (!mapping.rows.every((row) => row.reviewed)) blockers.push('Every mapping row requires human review');
  for (const deck of DECKS) if (!segments.some((segment) => Number.isInteger(segment.page?.[deck.id]))) blockers.push(`No actual page mappings for ${deck.id}; an all-null deck cannot pass`);
  if (!nonempty(decisions.pageId) || !/^[a-z][a-z0-9-]*$/.test(decisions.pageId) || !nonempty(decisions.pageLabel)) blockers.push('Page ID/label remain unresolved');
  if (!review) return [...blockers, 'Human approval and 10-point listening receipt are missing'];
  try {
    requireValue(review.schemaVersion === 1 && review.eventId === EVENT.id && review.approved === true && nonempty(review.reviewer) && validDate(review.reviewedAt), 'Explicit human approval/reviewer/date required');
    requireValue(equal(review.inputSha256, provenance), 'Review must pin subtitle, mapping, sessions and media-manifest hashes');
    requireValue(review.anchorEvidence?.bookmarks === 32 && review.anchorEvidence?.asrCheckpoints === 38 && SHA256.test(review.anchorEvidence?.sha256 ?? '') && nonempty(review.anchorEvidence?.reference), 'R11 32-bookmark/38-ASR anchor evidence reference/hash required');
    requireValue(review.sampling?.algorithm === 'sha256-ranked-sources-v1', 'Reproducible random listening sample required');
    const expectedSources = selectListeningSources(segments, review.sampling.seed);
    requireValue(equal(review.sampling.sources, expectedSources), 'Listening sample does not match the recorded random seed');
    requireValue(Array.isArray(review.listeningPoints) && review.listeningPoints.length === 10, 'Exactly 10 listening measurements required');
    const seen = new Set();
    for (const point of review.listeningPoints) {
      const segment = segments.find((item) => item.source === point.source);
      requireValue(segment && expectedSources.includes(point.source) && !seen.has(point.source), 'Unknown/duplicate listening sample');
      seen.add(point.source);
      requireValue(sameNumber(point.subtitleTimeSec, segment.t0) && finite(point.audioTimeSec) && point.audioTimeSec >= 0 && point.audioTimeSec <= EVENT_DURATION_SEC, 'Listening measurement time mismatch');
      requireValue(sameNumber(point.errorSec, point.subtitleTimeSec - point.audioTimeSec) && Math.abs(point.errorSec) <= 0.5, 'Listening offset exceeds ±0.5 seconds or is inconsistent');
      requireValue(nonempty(point.heardText) && nonempty(point.evidence) && nonempty(point.reviewer) && validDate(point.reviewedAt), 'Actual listening text/evidence/reviewer/date required');
      requireValue(equal(point.page, segment.page) && DECKS.every((deck) => point.slideMatches?.[deck.id] === true), 'Listening slide check for both decks required');
    }
  } catch (error) { blockers.push(error.message); }
  return blockers;
}

export async function buildTimelineFromConfig(configPath, { publishReady = false } = {}) {
  const configFile = path.resolve(configPath);
  const configBytes = await readFileSafe(configFile);
  const config = parseJson(configBytes, 'Config');
  const base = path.dirname(configFile);
  requireValue(config.schemaVersion === 1, 'Config schemaVersion must be 1');
  requireEvent(config.event, 'Config');
  validateDecisions(config.decisions);
  requireValue(nonempty(config.outputDir), 'outputDir is required');
  requireValue(Array.isArray(config.sources) && config.sources.length === 2, 'Exactly the two original SRT inputs are required');
  const sourceInputs = [];
  const sourceHashes = {};
  const subtitles = {};
  for (const expected of SOURCES) {
    const source = config.sources.find((item) => item.id === expected.id);
    requireValue(source, `Missing ${expected.id} input`);
    for (const key of ['audioSourceId', 'clockStart', 'durationSec', 'expectedSegments']) requireValue(source[key] === expected[key], `${expected.id}: ${key} must be ${expected[key]}`);
    requireValue(sameNumber(clockSeconds(source.clockStart) - clockSeconds(EVENT.clockStart), expected.offsetSec), `${expected.id}: source clock offset mismatch`);
    const input = await readPinned(source, base, expected.id);
    const cues = parseSrt(input.bytes, expected.id);
    requireValue(cues.length === expected.expectedSegments, `${expected.id}: expected ${expected.expectedSegments} cues, found ${cues.length}`);
    sourceInputs.push(input);
    sourceHashes[expected.id] = input.sha256;
    subtitles[expected.id] = { schemaVersion: 1, eventId: EVENT.id, sourceId: expected.id, sourceSha256: input.sha256, offsetSec: expected.offsetSec, segments: cues };
  }
  const cues = SOURCES.flatMap((source) => subtitles[source.id].segments);
  const mediaInput = await readPinned(config.mediaManifest, base, 'Media manifest');
  const media = parseJson(mediaInput.bytes, 'Media manifest');
  validateMediaManifest(media, config.decisions);
  const assetRoot = path.dirname(mediaInput.filename);
  for (const asset of media.assets) {
    const bytes = await readFileSafe(path.join(assetRoot, asset.file));
    requireValue(bytes.length === asset.sizeBytes && sha256(bytes) === asset.sha256, `Media asset hash/size mismatch: ${asset.file}`);
  }
  const sessionInput = await readPinned(config.sessions, base, 'Sessions');
  const sessionDocument = parseJson(sessionInput.bytes, 'Sessions');
  requireValue(sessionDocument.schemaVersion === 1 && sessionDocument.eventId === EVENT.id, 'Sessions schema/event mismatch');
  const sessions = sessionDocument.sessions;
  validateSessions(sessions, config.decisions.audioSplit === 'session' ? media.audio : undefined);
  const mappingInput = await readPinned(config.mapping, base, 'Mapping');
  const mapping = parseJson(mappingInput.bytes, 'Mapping');
  const segments = validateMapping(mapping, cues, sessions, sourceHashes, config.decisions.speakerLabels);
  const audioTiming = validateSubtitleAudioBounds(segments, media);
  const provenance = { ...sourceHashes, mediaManifest: mediaInput.sha256, sessions: sessionInput.sha256, mapping: mappingInput.sha256 };
  let reviewInput = null;
  let review = null;
  if (config.review !== null && config.review !== undefined) {
    reviewInput = await readPinned(config.review, base, 'Human review');
    review = parseJson(reviewInput.bytes, 'Human review');
  }
  const blockers = reviewBlockers(review, mapping, segments, provenance, config.decisions);
  if (publishReady) requireValue(blockers.length === 0, `Publish-ready input gate failed: ${blockers.join('; ')}`);
  const timeline = {
    schemaVersion: 1, event: EVENT, audio: media.audio, decks: media.decks, talks: sessions, segments,
    provenance: { ...provenance, configSha256: sha256(configBytes), reviewSha256: reviewInput?.sha256 ?? null, mediaInputs: media.inputs },
    verification: { subtitleCounts: Object.fromEntries(SOURCES.map((source) => [source.id, subtitles[source.id].segments.length])), mappingCounts: Object.fromEntries(DECKS.map((deck) => { const mapped = segments.filter((segment) => Number.isInteger(segment.page?.[deck.id])).length; return [deck.id, { mapped, unmapped: segments.length - mapped }]; })), audioTiming, missingSubtitles: 0, duplicateSubtitles: 0, inputIntegrity: true, publishReady: blockers.length === 0, scope: 'timeline-input-and-review-receipt-validation-only', listeningPerformedByTool: false, browserVerified: false, productionVerified: false, deploymentPackageVerified: false, blockers },
  };
  for (const [filename, value] of [['timeline.json', timeline], ...SOURCES.map((source) => [`subtitles/${source.id}.json`, subtitles[source.id]])]) requireValue(jsonBytes(value).length <= MAX_ASSET_BYTES, `Generated JSON exceeds 25 MiB: ${filename}`);
  const inputPaths = [configFile, ...sourceInputs.map((input) => input.filename), mediaInput.filename, sessionInput.filename, mappingInput.filename, ...(reviewInput ? [reviewInput.filename] : [])];
  const pinnedInputs = [{ filename: configFile, sha256: sha256(configBytes) }, ...sourceInputs, mediaInput, sessionInput, mappingInput, ...(reviewInput ? [reviewInput] : [])].map(({ filename, sha256: hash }) => ({ filename, sha256: hash }));
  return { config, timeline, subtitles, media, assetRoot, inputPaths, pinnedInputs, outputDir: path.resolve(base, config.outputDir) };
}

const within = (candidate, directory) => candidate === directory || candidate.startsWith(`${directory}${path.sep}`);

/** Share the media publisher's Linux RENAME_NOREPLACE primitive; never fall back to rename(). */
export async function publishDirectoryNoReplace(stage, destination) {
  const helper = fileURLToPath(new URL('./prepare-media.py', import.meta.url));
  await executeFile('python3', ['-c', 'import importlib.util, sys; sys.dont_write_bytecode = True; spec = importlib.util.spec_from_file_location("conference_media", sys.argv[1]); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); module.publish_directory(sys.argv[2], sys.argv[3])', helper, stage, destination], { timeout: 30000, maxBuffer: 1024 * 1024 });
}

/** New output only: never replace, delete, merge or rename a pre-existing destination. */
export async function writeTimelineBundle(result) {
  const destination = result.outputDir;
  for (const [filename, value] of [['timeline.json', result.timeline], ...SOURCES.map((source) => [`subtitles/${source.id}.json`, result.subtitles[source.id]])]) requireValue(jsonBytes(value).length <= MAX_ASSET_BYTES, `Generated JSON exceeds 25 MiB: ${filename}`);
  requireValue(!result.inputPaths.some((input) => within(input, destination)) && !within(result.assetRoot, destination) && !within(destination, result.assetRoot), 'Output must not overlap original inputs or media assets');
  await noSymlinks(destination);
  try { await fs.lstat(destination); fail(`Output already exists; refusing to replace it: ${destination}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true });
  await noSymlinks(parent);
  const lock = path.join(parent, `.${path.basename(destination)}.timeline-lock`);
  await fs.mkdir(lock);
  let stage;
  try {
    try { await fs.lstat(destination); fail(`Output already exists; refusing to replace it: ${destination}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    stage = await fs.mkdtemp(path.join(parent, '.conference-timeline-stage-'));
    for (const asset of result.media.assets) {
      const bytes = await readFileSafe(path.join(result.assetRoot, asset.file));
      requireValue(bytes.length === asset.sizeBytes && sha256(bytes) === asset.sha256, `Media asset changed during build: ${asset.file}`);
      requireValue(bytes.length <= MAX_ASSET_BYTES, `Media asset exceeds 25 MiB: ${asset.file}`);
      const target = path.join(stage, safeRelative(asset.file, 'asset.file'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes, { flag: 'wx' });
    }
    await fs.mkdir(path.join(stage, 'subtitles'));
    for (const source of SOURCES) await fs.writeFile(path.join(stage, 'subtitles', `${source.id}.json`), jsonBytes(result.subtitles[source.id]), { flag: 'wx' });
    await fs.writeFile(path.join(stage, 'timeline.json'), jsonBytes(result.timeline), { flag: 'wx' });
    for (const input of result.pinnedInputs) requireValue(sha256(await readFileSafe(input.filename)) === input.sha256, `Input changed during build: ${input.filename}`);
    await noSymlinks(destination);
    try { await fs.lstat(destination); fail(`Output appeared during build; refusing to replace it: ${destination}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await publishDirectoryNoReplace(stage, destination);
    stage = null;
  } finally {
    if (stage) await fs.rm(stage, { recursive: true, force: true });
    await fs.rmdir(lock);
  }
  return { outputDir: destination, segments: result.timeline.segments.length, publishReady: result.timeline.verification.publishReady, scope: result.timeline.verification.scope };
}

export async function verifyTimelineBundle(configPath, options = {}) {
  const result = await buildTimelineFromConfig(configPath, options);
  const timeline = await readFileSafe(path.join(result.outputDir, 'timeline.json'));
  requireValue(timeline.equals(jsonBytes(result.timeline)), 'timeline.json differs from the exact pinned, lossless reconstruction');
  for (const source of SOURCES) {
    const bytes = await readFileSafe(path.join(result.outputDir, 'subtitles', `${source.id}.json`));
    requireValue(bytes.equals(jsonBytes(result.subtitles[source.id])), `Subtitle output differs: ${source.id}`);
  }
  for (const asset of result.media.assets) {
    const bytes = await readFileSafe(path.join(result.outputDir, asset.file));
    requireValue(bytes.length === asset.sizeBytes && sha256(bytes) === asset.sha256, `Output asset changed: ${asset.file}`);
  }
  return { outputDir: result.outputDir, segments: result.timeline.segments.length, publishReady: result.timeline.verification.publishReady, scope: result.timeline.verification.scope, blockers: result.timeline.verification.blockers };
}
