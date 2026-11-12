import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EVENT, SOURCES, DECKS, MAX_ASSET_BYTES, sha256, parseSrt, clockSeconds, validateSessions, validateMediaManifest, validateSubtitleAudioBounds, selectListeningSources, buildTimelineFromConfig, writeTimelineBundle, verifyTimelineBundle, publishDirectoryNoReplace } from '../scripts/conference/timeline.mjs';

// All fixtures in this file are synthetic and live only in temporary directories.
// They do not establish real subtitle coverage, listening accuracy, media validity or UI acceptance.
const clone = (value) => structuredClone(value);
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fixture;
let caseNumber = 0;

function stamp(seconds) {
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')},000`;
}

function clock(seconds) {
  const total = clockSeconds(EVENT.clockStart) + seconds;
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function pinned(filename, value) {
  const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, bytes);
  return { file: filename, sha256: sha256(bytes) };
}

async function configCase(change = () => {}) {
  caseNumber += 1;
  const config = clone(fixture.config);
  config.outputDir = path.join(fixture.dir, `output-${caseNumber}`);
  await change(config, caseNumber);
  const file = path.join(fixture.dir, `config-${caseNumber}.json`);
  await fs.writeFile(file, jsonBytes(config));
  return { file, config };
}

before(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-conference-synthetic-'));
  const mediaDir = path.join(dir, 'media');
  const sourceSpecs = [];
  const sourceHashes = {};
  const cues = [];
  for (const source of SOURCES) {
    const body = Array.from({ length: source.expectedSegments }, (_, index) => `${index + 1}\r\n${stamp(index * 2)} --> ${stamp(index * 2 + 1)}\r\n합성 자막 ${source.id} ${index + 1}\r\n  원문 줄바꿈과 공백 유지  \r\n`).join('\r\n');
    const input = await pinned(path.join(dir, `${source.id}.srt`), Buffer.from(body));
    sourceSpecs.push({ ...source, ...input });
    sourceHashes[source.id] = input.sha256;
    cues.push(...parseSrt(Buffer.from(body), source.id));
  }
  const sessions = Array.from({ length: 15 }, (_, index) => ({ id: String(index).padStart(2, '0'), title: `SYNTHETIC program ${index}; not a real conference title`, t0: index * 1360, t1: (index + 1) * 1360, pageRange: { 'final-290': [1, 290], 'r17-257': [1, 257] } }));
  const mapping = { schemaVersion: 1, eventId: EVENT.id, sourceSha256: sourceHashes, rows: cues.map((cue, index) => ({ source: cue.source, talk: String(Math.floor(cue.t0 / 1360)).padStart(2, '0'), page: index % 17 === 0 ? null : { 'final-290': 1, 'r17-257': 2 }, reviewed: false })) };
  const inputs = [...DECKS.map((deck) => deck.id), ...SOURCES.map((source) => source.audioSourceId)].map((id) => ({ id, sha256: sha256(`SYNTHETIC original ${id}`), sizeBytes: 100 }));
  for (const source of SOURCES) Object.assign(inputs.find((input) => input.id === source.audioSourceId), { durationSec: source.durationSec, nominalDurationSec: source.durationSec });
  const decks = DECKS.map((deck) => ({ ...deck, label: `SYNTHETIC ${deck.id}`, dir: `pages/${deck.id}`, sourceSha256: inputs.find((input) => input.id === deck.id).sha256, variant: deck.id === 'r17-257' ? 'clean' : 'final' }));
  const audio = SOURCES.map((source) => ({ id: `synthetic-${source.id}`, file: `audio/${source.id}.opus`, clockStart: clock(source.offsetSec), durationSec: source.durationSec, plannedDurationSec: source.durationSec, durationDeviationSec: 0, t0: source.offsetSec, t1: source.offsetSec + source.durationSec, sourceId: source.audioSourceId, sourceOffsetSec: 0 }));
  const assets = [];
  for (const filename of [...decks.flatMap((deck) => Array.from({ length: deck.pages }, (_, index) => `${deck.dir}/${String(index + 1).padStart(4, '0')}.webp`)), ...audio.map((entry) => entry.file)]) {
    const bytes = Buffer.from(`SYNTHETIC fixture bytes, not playable media: ${filename}`);
    await pinned(path.join(mediaDir, filename), bytes);
    assets.push({ file: filename, sha256: sha256(bytes), sizeBytes: bytes.length });
  }
  const media = { schemaVersion: 1, eventId: EVENT.id, decks, audio, assets, inputs, verification: { mediaPrepared: true, realInputsVerified: true, audioFormat: 'opus', audioSplit: 'chunk', r17Variant: 'clean' }, testFixture: 'Synthetic metadata only; never a real verification receipt' };
  const config = { schemaVersion: 1, event: EVENT, decisions: { r17Variant: 'clean', audioFormat: 'opus', audioSplit: 'chunk', speakerLabels: false, generatedSlides: false, pageId: 'synthetic-conference', pageLabel: '합성 테스트' }, sources: sourceSpecs, mediaManifest: await pinned(path.join(mediaDir, 'media-manifest.json'), media), sessions: await pinned(path.join(dir, 'sessions.json'), { schemaVersion: 1, eventId: EVENT.id, sessions }), mapping: await pinned(path.join(dir, 'mapping.json'), mapping), review: null, outputDir: path.join(dir, 'unused-output') };
  fixture = { dir, mediaDir, config, sessions, mapping, cues, media };
});
after(async () => { if (fixture) await fs.rm(fixture.dir, { recursive: true, force: true }); });

test('SRT parser preserves Korean multiline text, whitespace, leading-zero cue ID and 18000-second offset', () => {
  const bytes = Buffer.from('\uFEFF0007\r\n00:00:02,250 --> 00:00:03,500\r\n  한국어 원문  \r\n두 번째 줄\r\n\r\n8\r\n00:39:59,000 --> 00:40:00,000\r\n마지막 세그먼트\r\n');
  const cues = parseSrt(bytes, 'plaud2');
  assert.equal(cues[0].source, 'plaud2#0007');
  assert.equal(cues[0].cueId, '0007');
  assert.equal(cues[0].text, '  한국어 원문  \r\n두 번째 줄');
  assert.equal(cues[0].t0, 18002.25);
  assert.equal(cues[0].t1, 18003.5);
  assert.equal(cues.at(-1).t1, 20400);
});

test('SRT rejects duplicate numeric IDs, reversed times, empty text, invalid UTF-8 and range violations', () => {
  const cue = (id, a, b, text = '합성') => `${id}\n${a} --> ${b}\n${text}\n\n`;
  assert.throws(() => parseSrt(Buffer.from(cue('001', '00:00:00,000', '00:00:01,000') + cue('1', '00:00:02,000', '00:00:03,000')), 'plaud1'), /Duplicate/);
  assert.throws(() => parseSrt(Buffer.from(cue('1', '00:00:02,000', '00:00:03,000') + cue('2', '00:00:01,000', '00:00:02,000')), 'plaud1'), /reversal/);
  assert.throws(() => parseSrt(Buffer.from(cue('1', '00:00:00,000', '00:00:01,000', '')), 'plaud1'), /Empty/);
  assert.throws(() => parseSrt(Buffer.from(cue('1', '00:39:59,000', '00:40:00,001')), 'plaud2'), /range violation/);
  assert.throws(() => parseSrt(Buffer.from([0xc3, 0x28]), 'plaud1'), /encoded data/);
});

test('nested overlapping SRT cues retain both full rows even when the later cue ends earlier', () => {
  const bytes = Buffer.from('1\n00:00:00,000 --> 00:03:00,000\n긴 안내 원문\n\n2\n00:00:10,000 --> 00:00:11,000\n겹치는 발화\n');
  const cues = parseSrt(bytes, 'plaud1');
  assert.equal(cues.length, 2);
  assert.equal(cues[0].t1, 180);
  assert.equal(cues[1].t1, 11);
  assert.equal(cues[0].text, '긴 안내 원문');
});

test('programs and audio require complete ordered coverage, valid source clocks and padding bounds', () => {
  validateSessions(fixture.sessions);
  validateMediaManifest(fixture.media, fixture.config.decisions);
  const gap = clone(fixture.sessions); gap[1].t0 += 1;
  assert.throws(() => validateSessions(gap), /gap, overlap/);
  const unordered = clone(fixture.sessions); unordered[5].id = '06';
  assert.throws(() => validateSessions(unordered), /ordered/);
  const audioGap = clone(fixture.media); audioGap.audio[1].t0 += 1;
  assert.throws(() => validateMediaManifest(audioGap, fixture.config.decisions), /gap, overlap/);
  const clockMismatch = clone(fixture.media); clockMismatch.audio[1].clockStart = '12:33:00';
  assert.throws(() => validateMediaManifest(clockMismatch, fixture.config.decisions), /clockStart/);
  const padding = clone(fixture.media); padding.audio[0].durationSec += 0.04; padding.audio[0].durationDeviationSec = 0.04;
  validateMediaManifest(padding, fixture.config.decisions);
  padding.audio[0].durationSec += 0.02;
  assert.throws(() => validateMediaManifest(padding, fixture.config.decisions), /measured duration/);
});

test('session-split media must use the same program boundaries, including the 18000-second source cut', () => {
  const audio = fixture.sessions.flatMap((session) => SOURCES.flatMap((source) => {
    const t0 = Math.max(session.t0, source.offsetSec);
    const t1 = Math.min(session.t1, source.offsetSec + source.durationSec);
    return t1 > t0 ? [{ id: `synthetic-${session.id}-${source.id}`, sessionId: session.id, sourceId: source.audioSourceId, t0, t1 }] : [];
  }));
  validateSessions(fixture.sessions, audio);
  assert(audio.some((entry) => entry.t0 === 18000));
  const wrong = clone(audio); wrong[1].sessionId = '02';
  assert.throws(() => validateSessions(fixture.sessions, wrong), /does not match program boundaries/);
});

test('media ledger rejects path traversal, missing pages and manifest overwrite paths', () => {
  const traversal = clone(fixture.media); traversal.assets[0].file = '../original.srt';
  assert.throws(() => validateMediaManifest(traversal, fixture.config.decisions), /path escape/);
  const missing = clone(fixture.media); missing.assets.shift();
  assert.throws(() => validateMediaManifest(missing, fixture.config.decisions), /Missing page asset/);
  const overwrite = clone(fixture.media); overwrite.assets[0].file = 'timeline.json';
  assert.throws(() => validateMediaManifest(overwrite, fixture.config.decisions), /cannot overwrite/);
  const oversized = clone(fixture.media); oversized.assets[0].sizeBytes = MAX_ASSET_BYTES + 1;
  assert.throws(() => validateMediaManifest(oversized, fixture.config.decisions), /exceeds 25 MiB/);
});

test('subtitle tails are compared with measured source ends and the measured prepared-audio sum', () => {
  const tailCues = [
    { sourceId: 'plaud1', localT1: 18000, t1: 18000 },
    { sourceId: 'plaud2', localT1: 2400, t1: 20400 },
  ];
  const timing = validateSubtitleAudioBounds(tailCues, fixture.media);
  assert.equal(timing.preparedMeasuredDurationSec, 20400);
  assert.equal(timing.maximumSubtitleT1, 20400);
  const shorterOutput = clone(fixture.media); shorterOutput.audio[1].durationSec -= 0.04;
  assert.throws(() => validateSubtitleAudioBounds(tailCues, shorterOutput), /measured total prepared-audio duration/);
  const shorterOriginal = clone(fixture.media); shorterOriginal.inputs.find((input) => input.id === 'plaud-2').durationSec -= 0.04;
  assert.throws(() => validateSubtitleAudioBounds(tailCues, shorterOriginal), /measured original audio end/);
});

test('full synthetic 7995+1174 conversion preserves every cue including late audio-2 rows and explicit null mapping', async () => {
  const entry = await configCase();
  const result = await buildTimelineFromConfig(entry.file);
  assert.equal(result.timeline.segments.length, 9169);
  assert.equal(result.timeline.segments[7995].source, 'plaud2#1');
  assert.equal(result.timeline.segments[7995].t0, 18000);
  assert.equal(result.timeline.segments.at(-1).source, 'plaud2#1174');
  assert.equal(result.timeline.segments.at(-1).t1, 20347);
  assert.equal(result.timeline.segments[0].page, null);
  assert.equal(result.timeline.segments[0].text, fixture.cues[0].text);
  assert.equal(result.timeline.verification.publishReady, false);
  assert.equal(result.timeline.verification.listeningPerformedByTool, false);
  assert(result.timeline.verification.blockers.some((blocker) => blocker.includes('Human approval')));
});

test('missing cue count and wrong full SHA-256 fail before any output directory is created', async () => {
  const wrongHash = await configCase((config) => { config.sources[0].sha256 = '0'.repeat(64); });
  await assert.rejects(buildTimelineFromConfig(wrongHash.file), /SHA-256 mismatch/);
  await assert.rejects(fs.stat(wrongHash.config.outputDir), { code: 'ENOENT' });
  const missingCue = await configCase(async (config, id) => {
    const bytes = Buffer.from('1\n00:00:00,000 --> 00:00:01,000\n합성 한 행\n');
    Object.assign(config.sources[0], await pinned(path.join(fixture.dir, `missing-${id}.srt`), bytes));
  });
  await assert.rejects(buildTimelineFromConfig(missingCue.file), /expected 7995 cues, found 1/);
});

test('one-to-one mapping rejects omissions, duplicate source IDs and out-of-range deck pages', async () => {
  for (const [name, mutate, error] of [
    ['missing', (mapping) => mapping.rows.pop(), /exactly one row/],
    ['duplicate', (mapping) => { mapping.rows[1].source = mapping.rows[0].source; }, /Duplicate mapping/],
    ['range', (mapping) => { mapping.rows[1].page['r17-257'] = 258; }, /page outside r17-257/],
    ['unknown', (mapping) => { mapping.rows[1].source = 'plaud2#99999'; }, /Missing mapping source/],
  ]) {
    const entry = await configCase(async (config, id) => { const mapping = clone(fixture.mapping); mutate(mapping); config.mapping = await pinned(path.join(fixture.dir, `${name}-${id}.json`), mapping); });
    await assert.rejects(buildTimelineFromConfig(entry.file), error);
  }
});

test('publish-ready gate rejects unreviewed mappings and missing 10-point listening receipts', async () => {
  const entry = await configCase();
  await assert.rejects(buildTimelineFromConfig(entry.file, { publishReady: true }), /Publish-ready input gate failed/);
});

test('all-null deck mappings cannot produce a vacuous publish-ready success', async () => {
  const entry = await configCase(async (config, id) => {
    const mapping = clone(fixture.mapping);
    for (const row of mapping.rows) row.page = null;
    config.mapping = await pinned(path.join(fixture.dir, `all-null-${id}.json`), mapping);
  });
  const draft = await buildTimelineFromConfig(entry.file);
  assert.equal(draft.timeline.verification.mappingCounts['final-290'].mapped, 0);
  assert(draft.timeline.verification.blockers.some((blocker) => blocker.includes('all-null deck')));
  await assert.rejects(buildTimelineFromConfig(entry.file, { publishReady: true }), /all-null deck/);
});

test('accepted synthetic review receipt is scoped to inputs; offset failure blocks it and never claims actual listening', async () => {
  const entry = await configCase(async (config, id) => {
    const mapping = clone(fixture.mapping);
    for (const row of mapping.rows) Object.assign(row, { reviewed: true, reviewer: 'Synthetic unit-test reviewer', reviewedAt: '2026-11-10T00:00:00Z' });
    config.mapping = await pinned(path.join(fixture.dir, `reviewed-mapping-${id}.json`), mapping);
    const seed = 'synthetic-review-fixture-not-actual-listening';
    const sources = selectListeningSources(fixture.cues, seed);
    const review = { schemaVersion: 1, eventId: EVENT.id, approved: true, reviewer: 'Synthetic unit-test reviewer', reviewedAt: '2026-11-10T00:00:00Z', inputSha256: { plaud1: config.sources[0].sha256, plaud2: config.sources[1].sha256, mediaManifest: config.mediaManifest.sha256, sessions: config.sessions.sha256, mapping: config.mapping.sha256 }, anchorEvidence: { bookmarks: 32, asrCheckpoints: 38, sha256: sha256('synthetic R11 receipt'), reference: 'synthetic-test-only' }, sampling: { algorithm: 'sha256-ranked-sources-v1', seed, sources }, listeningPoints: sources.map((source) => { const cue = fixture.cues.find((item) => item.source === source); const row = mapping.rows.find((item) => item.source === source); return { source, subtitleTimeSec: cue.t0, audioTimeSec: cue.t0, errorSec: 0, heardText: 'SYNTHETIC, no listening performed', evidence: 'unit-test fixture', reviewer: 'Synthetic reviewer', reviewedAt: '2026-11-10T00:00:00Z', page: row.page, slideMatches: { 'final-290': true, 'r17-257': true } }; }) };
    // JSON object key order is immaterial, including Python sort_keys output.
    review.inputSha256 = Object.fromEntries(Object.entries(review.inputSha256).reverse());
    for (const point of review.listeningPoints) if (point.page) point.page = Object.fromEntries(Object.entries(point.page).reverse());
    config.review = await pinned(path.join(fixture.dir, `review-${id}.json`), review);
  });
  const accepted = await buildTimelineFromConfig(entry.file, { publishReady: true });
  assert.equal(accepted.timeline.verification.publishReady, true);
  assert.equal(accepted.timeline.verification.scope, 'timeline-input-and-review-receipt-validation-only');
  assert.equal(accepted.timeline.verification.listeningPerformedByTool, false);
  assert.equal(accepted.timeline.verification.browserVerified, false);
  const broken = await configCase(async (config, id) => {
    Object.assign(config, entry.config);
    const review = JSON.parse(await fs.readFile(config.review.file, 'utf8'));
    review.listeningPoints[0].audioTimeSec += 0.6;
    review.listeningPoints[0].errorSec = -0.6;
    config.review = await pinned(path.join(fixture.dir, `review-bad-${id}.json`), review);
  });
  await assert.rejects(buildTimelineFromConfig(broken.file, { publishReady: true }), /±0.5 seconds/);
});

test('new directory bundle writes atomically, verifies exact bytes and refuses any existing output', async () => {
  const entry = await configCase();
  const result = await buildTimelineFromConfig(entry.file);
  const written = await writeTimelineBundle(result);
  assert.equal(written.segments, 9169);
  assert.equal((await verifyTimelineBundle(entry.file)).segments, 9169);
  const previous = await fs.readFile(path.join(entry.config.outputDir, 'timeline.json'));
  await assert.rejects(writeTimelineBundle(result), /Output already exists/);
  assert.deepEqual(await fs.readFile(path.join(entry.config.outputDir, 'timeline.json')), previous);
  const changed = JSON.parse(previous); changed.segments.pop();
  await fs.writeFile(path.join(entry.config.outputDir, 'timeline.json'), jsonBytes(changed));
  await assert.rejects(verifyTimelineBundle(entry.file), /differs from the exact pinned/);
});

test('unknown decision, missing input and symlink paths cannot alter an existing output', async () => {
  const entry = await configCase();
  await fs.mkdir(entry.config.outputDir);
  const sentinel = path.join(entry.config.outputDir, 'keep.txt');
  await fs.writeFile(sentinel, 'original output');
  entry.config.decisions.r17Variant = null;
  await fs.writeFile(entry.file, jsonBytes(entry.config));
  await assert.rejects(buildTimelineFromConfig(entry.file), /R17 final selection is unresolved/);
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'original output');
  const missing = await configCase((config) => { config.sources[0].file = path.join(fixture.dir, 'does-not-exist.srt'); });
  await assert.rejects(buildTimelineFromConfig(missing.file), { code: 'ENOENT' });
  const linked = await configCase(async (config, id) => { const link = path.join(fixture.dir, `symlink-${id}.srt`); await fs.symlink(config.sources[0].file, link); config.sources[0].file = link; });
  await assert.rejects(buildTimelineFromConfig(linked.file), /Symlink paths/);
});

test('failed staged copy cleans only its own stage and never publishes a partial destination', async () => {
  const entry = await configCase();
  const result = await buildTimelineFromConfig(entry.file);
  result.media = clone(result.media);
  result.media.assets.at(-1).sha256 = '0'.repeat(64);
  await assert.rejects(writeTimelineBundle(result), /changed during build/);
  await assert.rejects(fs.stat(entry.config.outputDir), { code: 'ENOENT' });
  assert.equal((await fs.readdir(fixture.dir)).some((name) => name.startsWith('.conference-timeline-stage-') || name.endsWith('.timeline-lock')), false);
});

test('atomic no-replace publication preserves even an empty directory created after preflight', async () => {
  const staging = await fs.mkdtemp(path.join(fixture.dir, 'race-stage-'));
  const destination = path.join(fixture.dir, 'race-destination');
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
  await fs.writeFile(path.join(staging, 'keep-stage.txt'), 'staging content');
  await fs.mkdir(destination);
  const originalStat = await fs.stat(destination);
  await assert.rejects(publishDirectoryNoReplace(staging, destination), /existing directory preserved/);
  assert.equal((await fs.stat(destination)).ino, originalStat.ino);
  assert.deepEqual(await fs.readdir(destination), []);
  assert.equal(await fs.readFile(path.join(staging, 'keep-stage.txt'), 'utf8'), 'staging content');
});

test('an original changed after validation aborts the entire staged publication', async () => {
  const entry = await configCase();
  const result = await buildTimelineFromConfig(entry.file);
  await fs.appendFile(entry.file, '\n');
  await assert.rejects(writeTimelineBundle(result), /Input changed during build/);
  await assert.rejects(fs.stat(entry.config.outputDir), { code: 'ENOENT' });
});

test('generated timeline JSON above the static asset ceiling fails before publication', async () => {
  const entry = await configCase((config) => { config.event = { ...EVENT }; });
  const result = await buildTimelineFromConfig(entry.file);
  // Direct writer calls also must not publish a modified oversized JSON object.
  result.timeline.segments[0].text = 'x'.repeat(MAX_ASSET_BYTES);
  await assert.rejects(writeTimelineBundle(result), /Generated JSON exceeds 25 MiB/);
  await assert.rejects(fs.stat(entry.config.outputDir), { code: 'ENOENT' });
});

test('unresolved example CLI fails closed without creating conference output', () => {
  const execution = spawnSync(process.execPath, ['scripts/conference/build-timeline.mjs', '--config', 'scripts/conference/timeline_config.example.json'], { cwd: root, encoding: 'utf8' });
  assert.equal(execution.status, 1);
  assert.match(execution.stderr, /R17 final selection is unresolved/);
});
