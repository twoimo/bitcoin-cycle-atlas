#!/usr/bin/env node
// P1c-A: build local media from the locked originals, without editing the
// originals, timeline, deployed site, or human-review status. No browser use.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, writeFile, stat, lstat, readdir, mkdir, mkdtemp, rename, rm, realpath} from 'node:fs/promises';
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validateConferenceTimeline} from '../dist/conference/timeline.js';
import {validateConferenceMediaManifest} from '../dist/conference/media.js';

const execute = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RENDERER = fileURLToPath(new URL('./conference/render-media.py', import.meta.url));
const GENERATOR = fileURLToPath(import.meta.url);
const MANIFEST_FILE = 'media-manifest.json';
const FRAME_SECONDS = 1024 / 48000;
const pretty = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const sha = value => createHash('sha256').update(value).digest('hex');
const rounded = value => Math.round(value * 1e9) / 1e9;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const ensure = (condition, message) => assert.ok(condition, message);

export const MEDIA_SETTINGS = Object.freeze({
  longEdge: 1800, webpQuality: 80, webpMethod: 6,
  audioCodec: 'aac', audioContainer: 'm4a', audioBitrate: 40000,
  audioChannels: 1, audioSampleRate: 48000,
});
export const MEDIA_LIMITS = Object.freeze({maxFileBytes: 25 * 1024 * 1024, maxFiles: 20000});
// PDF identities must also match the separately committed deck lock. The audio
// values are the independently measured originals in WP_A_AUTOMATED_MEDIA §1.
// There is no CLI flag to weaken this production policy. Tiny integration tests
// inject a policy through the imported API, keeping the executable CLI locked.
export const MEDIA_INPUT_POLICY = Object.freeze({
  eventId: 'plspo-2026-10-31',
  decks: Object.freeze([
    Object.freeze({id: 'final-290', dir: 'pages/final', pageCount: 290, bytes: 63311016, sha256: '4b1affb46789400a4079743bb8f5b29bfbdcc4aa36544f4a43c3c7516dbd24db'}),
    Object.freeze({id: 'r17-clean-257', dir: 'pages/r17', pageCount: 257, bytes: 20233799, sha256: '3760cd72c04c4625750f3fe80b0b28cc666fe9a0b9a8467823750c30b87c873e'}),
  ]),
  audio: Object.freeze([
    Object.freeze({id: 'plaud-1', bytes: 72000800, sha256: '816e26250f012e5b92bea16379b108a5e3b665e582fc5034a4f6899afad0597d', t0: 0, t1: 18000}),
    Object.freeze({id: 'plaud-2', bytes: 9603152, sha256: 'cadc5e3abcfd6ec2ebcaa4c1c1649b3481eba36f2da60859e2ccc2c224145aff', t0: 18000, t1: 20400}),
  ]),
  talkIds: Object.freeze(Array.from({length: 15}, (_, index) => String(index).padStart(2, '0'))),
});

function sampleAt(seconds) {
  const samples = seconds * MEDIA_SETTINGS.audioSampleRate;
  ensure(finite(seconds) && seconds >= 0 && Number.isSafeInteger(Math.round(samples))
    && Math.abs(samples - Math.round(samples)) < 1e-5, 'Source boundary must be representable as an exact 48 kHz sample');
  return Math.round(samples);
}

function safeAsset(file) {
  return typeof file === 'string' && file.length > 0 && !/[\\:%?#\u0000-\u001f\u007f]/.test(file)
    && file.split('/').every(part => part && part !== '.' && part !== '..');
}

export function createConferenceMediaPlan(timeline, deckLock, {policy = MEDIA_INPUT_POLICY} = {}) {
  const validation = validateConferenceTimeline(timeline);
  ensure(validation.valid, 'Invalid source timeline: ' + validation.errors.map(error => error.path + ' ' + error.message).join('; '));
  assert.equal(timeline.event.id, policy.eventId, 'Unexpected event identity');
  assert.equal(deckLock.schema, 'atlas.wp-a.deck-lock/1', 'Unsupported deck lock');
  assert.deepEqual(timeline.decks.map(deck => deck.id), policy.decks.map(deck => deck.id), 'Timeline deck order differs from locked policy');
  assert.deepEqual(deckLock.decks.map(deck => deck.id), policy.decks.map(deck => deck.id), 'Deck lock order differs from locked policy');
  assert.deepEqual(timeline.audio.map(audio => audio.id), policy.audio.map(audio => audio.id), 'Audio source order differs from locked policy');
  assert.deepEqual(timeline.talks.map(talk => talk.id), policy.talkIds, 'Timeline must preserve every declared program in order');
  const decks = timeline.decks.map((deck, index) => {
    const locked = deckLock.decks[index].pdf, expected = policy.decks[index];
    assert.equal(locked.sha256, expected.sha256, 'Locked PDF SHA-256 differs from approved policy: ' + deck.id);
    assert.equal(locked.bytes, expected.bytes, 'Locked PDF bytes differ from approved policy: ' + deck.id);
    assert.equal(locked.pages, expected.pageCount, 'Locked PDF pages differ from approved policy: ' + deck.id);
    assert.equal(deck.pages, expected.pageCount, 'Timeline pages differ from deck lock: ' + deck.id);
    assert.equal(deck.dir, expected.dir, 'Timeline image directory differs from approved policy: ' + deck.id);
    ensure(safeAsset(deck.dir), 'Invalid page directory');
    return {id: deck.id, dir: deck.dir, pageCount: deck.pages, inputSha256: expected.sha256};
  });
  let nextSource = 0;
  const sources = policy.audio.map((source, index) => {
    assert.equal(source.t0, nextSource, 'Input audio must be continuous and ordered from event zero');
    ensure(finite(source.t1) && source.t1 > source.t0, 'Invalid source duration');
    assert.equal(timeline.audio[index].durationSec, rounded(source.t1 - source.t0), 'Timeline audio duration differs from locked source');
    sampleAt(source.t0); sampleAt(source.t1); nextSource = source.t1;
    return {...source, durationSec: rounded(source.t1 - source.t0)};
  });
  let nextTalk = 0;
  const audio = timeline.talks.map(talk => {
    assert.equal(talk.t0, nextTalk, 'Talk intervals must cover the entire event without gaps or overlap');
    ensure(talk.t1 > talk.t0 && talk.t1 <= nextSource, 'Talk interval outside source audio');
    sampleAt(talk.t0); sampleAt(talk.t1); nextTalk = talk.t1;
    const sourceRanges = sources.flatMap(source => {
      const t0 = Math.max(talk.t0, source.t0), t1 = Math.min(talk.t1, source.t1);
      if (t1 <= t0) return [];
      const sourceT0 = rounded(t0 - source.t0), sourceT1 = rounded(t1 - source.t0);
      return [{inputId: source.id, t0, t1, sourceT0, sourceT1, startSample: sampleAt(sourceT0), endSample: sampleAt(sourceT1)}];
    });
    const durationSec = rounded(talk.t1 - talk.t0);
    assert.equal(sourceRanges.reduce((sum, range) => sum + range.endSample - range.startSample, 0), sampleAt(durationSec), 'Session source slices must cover every sample exactly once');
    return {id: 'session-' + talk.id, talkId: talk.id, file: 'audio/session-' + talk.id + '.m4a',
      t0: talk.t0, t1: talk.t1, durationSec, sourceRanges};
  });
  assert.equal(nextTalk, nextSource, 'Sessions must cover the complete event');
  const pageFiles = decks.flatMap(deck => Array.from({length: deck.pageCount}, (_, index) => ({
    file: deck.dir + '/' + String(index + 1).padStart(4, '0') + '.webp', deckId: deck.id, page: index + 1,
  })));
  const files = [...pageFiles.map(page => page.file), ...audio.map(session => session.file), MANIFEST_FILE];
  ensure(files.every(safeAsset) && new Set(files).size === files.length, 'Output files must be safe and unique');
  ensure(files.length <= MEDIA_LIMITS.maxFiles, 'Planned media exceeds static asset count limit');
  return {eventId: timeline.event.id, decks, sources, audio, pageFiles, files, durationSec: nextSource};
}

async function identity(file) {
  const info = await stat(file);
  ensure(info.isFile(), 'Input/asset is not a regular file: ' + file);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return {bytes: info.size, sha256: digest.digest('hex')};
}

async function inventory(directory, prefix = '') {
  const entries = (await readdir(directory, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const files = [];
  for (const entry of entries) {
    const file = prefix ? prefix + '/' + entry.name : entry.name;
    ensure(!entry.isSymbolicLink(), 'Symlinks are not permitted in output/site inventory: ' + file);
    if (entry.isDirectory()) files.push(...await inventory(join(directory, entry.name), file));
    else { ensure(entry.isFile(), 'Non-regular output/site file: ' + file); files.push(file); }
  }
  return files;
}

export async function countRetainedSiteFiles(siteDist, plannedFiles) {
  const replaced = new Set(plannedFiles.map(file => 'conference/' + file));
  const files = await inventory(siteDist);
  return files.filter(file => !replaced.has(file)).length;
}

const childEnvironment = () => ({...process.env, LC_ALL: 'C', LANG: 'C', TZ: 'UTC',
  OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1'});

async function run(command, args) {
  try {
    const result = await execute(command, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: childEnvironment()});
    return result.stdout.trim();
  } catch (error) {
    throw new Error('Media tool failed (' + basename(command) + '): ' + (error.stderr?.trim() || error.message), {cause: error});
  }
}

async function python(tools, args) { return JSON.parse(await run(tools.python, [RENDERER, ...args])); }

export async function probeMediaToolchain({python: pythonPath = 'python3', ffmpeg = 'ffmpeg', ffprobe = 'ffprobe'} = {}) {
  const tools = {python: pythonPath, ffmpeg, ffprobe};
  const [render, encoder, prober, generatorBytes, rendererBytes] = await Promise.all([
    python(tools, ['toolchain']), run(ffmpeg, ['-version']), run(ffprobe, ['-version']), readFile(GENERATOR), readFile(RENDERER),
  ]);
  return {node: process.version, platform: process.platform, architecture: process.arch, renderer: render,
    ffmpeg: {version: encoder.split('\n')[0], fingerprint: sha(encoder)},
    ffprobe: {version: prober.split('\n')[0], fingerprint: sha(prober)},
    generator: {file: 'scripts/prepare-conference-media.mjs', bytes: generatorBytes.length, sha256: sha(generatorBytes)},
    rendererScript: {file: 'scripts/conference/render-media.py', bytes: rendererBytes.length, sha256: sha(rendererBytes)},
    determinism: {threads: 1, filterThreads: 1, filterComplexThreads: 1, ffmpegBitexact: true,
      metadata: 'strip source metadata and chapters; fixed UTC creation_time; no copied image metadata',
      creationTime: '1970-01-01T00:00:00Z', resampler: 'swr', dither: 'none',
      intermediate: 'mono 48000Hz signed 16-bit little-endian PCM; sample-index trims; concatenate before one AAC encode',
      webp: 'RGB, PDF annotations included, lossless=false, quality=80, method=6, exact=true, EXIF/ICC/XMP empty',
      reproducibility: 'Identical inputs, generator, settings and exact toolchain; cross-version bit equality is not claimed.'}};
}

async function probeAudio(file, tools, {input = false} = {}) {
  const report = JSON.parse(await run(tools.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
  const streams = report.streams || [];
  const audioStreams = streams.filter(stream => stream.codec_type === 'audio');
  if (input) {
    // Locked MP3s may legitimately carry an ID3 cover image. The decoder maps
    // only0:a:0, and output probing below still rejects every non-audio stream.
    ensure(audioStreams.length === 1 && streams.every(stream => stream.codec_type === 'audio'
      || stream.codec_type === 'video' && stream.disposition?.attached_pic === 1),
    'Expected one input audio stream and optional attached cover pictures: ' + basename(file));
  } else ensure(streams.length === 1 && audioStreams.length === 1, 'Expected one audio stream with no video/cover art: ' + basename(file));
  const stream = audioStreams[0];
  return {codec: stream.codec_name, channels: stream.channels, sampleRate: Number(stream.sample_rate),
    durationSec: Number(stream.duration ?? report.format?.duration), startTime: Number(stream.start_time ?? report.format?.start_time ?? 0),
    bitRate: Number(stream.bit_rate ?? report.format?.bit_rate), format: report.format?.format_name || '',
    tags: {...report.format?.tags, ...stream.tags}};
}

function validateAudioProbe(probe, session) {
  assert.equal(probe.codec, MEDIA_SETTINGS.audioCodec, 'Output codec must be AAC');
  assert.equal(probe.channels, MEDIA_SETTINGS.audioChannels, 'Output audio must be mono');
  assert.equal(probe.sampleRate, MEDIA_SETTINGS.audioSampleRate, 'Output sample rate must be 48 kHz');
  ensure(probe.format.split(',').includes('m4a'), 'Output container must be m4a');
  ensure(finite(probe.durationSec) && Math.abs(probe.durationSec - session.durationSec) <= FRAME_SECONDS + 1e-8,
    'Output duration differs by more than one AAC frame: ' + session.id);
  ensure(Math.abs(probe.startTime) <= 1 / MEDIA_SETTINGS.audioSampleRate, 'Output audio must start at sample zero');
  for (const [key, value] of Object.entries(probe.tags)) {
    if (key === 'creation_time') ensure(/^1970-01-01T00:00:00(?:\.0+)?Z$/.test(value), 'Output contains a non-fixed creation time');
    else ensure(['major_brand', 'minor_version', 'compatible_brands', 'language', 'handler_name', 'vendor_id', 'encoder'].includes(key), 'Unexpected copied output metadata: ' + key);
  }
}

function baseFfmpegArgs() {
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-filter_threads', '1', '-filter_complex_threads', '1'];
}

export function audioEncodeArguments(session, rawFiles, target) {
  const args = baseFfmpegArgs(), filters = [];
  session.sourceRanges.forEach((range, index) => {
    const raw = rawFiles.get(range.inputId);
    ensure(raw, 'Missing normalized input: ' + range.inputId);
    const samples = range.endSample - range.startSample;
    ensure(Number.isSafeInteger(samples) && samples > 0, 'Invalid normalized sample range');
    args.push('-f', 's16le', '-ar', '48000', '-ac', '1', '-skip_initial_bytes', String(range.startSample * 2),
      '-t', (samples / 48000).toFixed(9), '-threads', '1', '-fflags', '+bitexact', '-i', raw);
    filters.push('[' + index + ':a]atrim=end_sample=' + samples + ',asetpts=PTS-STARTPTS[a' + index + ']');
  });
  const labels = session.sourceRanges.map((_, index) => '[a' + index + ']').join('');
  filters.push(session.sourceRanges.length > 1 ? labels + 'concat=n=' + session.sourceRanges.length + ':v=0:a=1[out]' : labels + 'anull[out]');
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
    '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '40000', '-ac', '1', '-ar', '48000', '-threads', '1',
    '-flags:a', '+bitexact', '-fflags', '+bitexact', '-metadata', 'creation_time=1970-01-01T00:00:00Z', '-metadata', 'encoder=',
    '-movflags', '+faststart', '-use_editlist', '1', '-f', 'ipod', target);
  return args;
}

async function decodeSources(context, temporary) {
  const rawFiles = new Map();
  for (const [index, source] of context.plan.sources.entries()) {
    const file = context.audioPaths[index], target = join(temporary, source.id + '.s16le');
    await run(context.tools.ffmpeg, [...baseFfmpegArgs(), '-threads', '1', '-fflags', '+bitexact', '-i', file,
      '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
      '-af', 'aresample=48000:resampler=swr:dither_method=none,aformat=sample_fmts=s16:channel_layouts=mono',
      '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-threads', '1', '-flags:a', '+bitexact', '-fflags', '+bitexact', '-f', 's16le', target]);
    const size = (await stat(target)).size;
    ensure(size % 2 === 0 && size / 2 >= sampleAt(source.durationSec), 'Decoded source does not cover its complete declared event interval: ' + source.id);
    const input = context.inputs.find(item => item.id === source.id && item.kind === 'audio');
    input.decodedSamples = size / 2;
    rawFiles.set(source.id, target);
  }
  return rawFiles;
}

async function canonicalFuturePath(file) {
  let current = resolve(file);
  const absent = [];
  while (true) {
    try { return resolve(await realpath(current), ...absent.reverse()); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      absent.push(basename(current)); current = dirname(current);
    }
  }
}

function inside(directory, file) {
  const rest = relative(directory, file);
  return rest === '' || !isAbsolute(rest) && rest !== '..' && !rest.startsWith('..' + sep);
}

async function readContext(options) {
  const root = resolve(options.root || ROOT), policy = options.policy || MEDIA_INPUT_POLICY;
  const timelinePath = resolve(options.timeline || join(root, 'dist/conference/timeline.json'));
  const deckLockPath = resolve(options.deckLock || join(root, 'docs/conference/deck-lock-20261112.json'));
  const siteDist = resolve(options.siteDist || join(root, 'dist'));
  const output = resolve(options.out || join(root, 'build/conference-media'));
  const pdfPaths = [options.pdfFinal, options.pdfR17].map(file => file && resolve(file));
  const audioPaths = (options.audio || []).map(file => resolve(file));
  ensure(pdfPaths.every(Boolean), 'Both --pdf-final and --pdf-r17 are required');
  assert.equal(audioPaths.length, policy.audio.length, 'Supply exactly two --audio paths in source order');
  const canonicalOutput = await canonicalFuturePath(output);
  ensure(!inside(await realpath(siteDist), canonicalOutput),
    'Use a dedicated output directory outside the site dist; installation is a separate reviewed copy');
  for (const file of [...pdfPaths, ...audioPaths]) {
    const inputTree = dirname(await realpath(file));
    ensure(!inside(inputTree, canonicalOutput), 'Output must be outside every original PDF/audio input tree');
  }
  const [timelineBytes, deckLockBytes] = await Promise.all([readFile(timelinePath), readFile(deckLockPath)]);
  const timeline = JSON.parse(timelineBytes), deckLock = JSON.parse(deckLockBytes);
  const plan = createConferenceMediaPlan(timeline, deckLock, {policy});
  const inputs = [];
  // Identity checks precede tool execution and every output mutation. Swapping
  // MP3 order, a lookalike PDF, or a source replacement fails closed here.
  for (const [index, expected] of policy.decks.entries()) {
    const actual = await identity(pdfPaths[index]);
    assert.equal(actual.bytes, expected.bytes, 'PDF bytes differ from deck lock: ' + expected.id);
    assert.equal(actual.sha256, expected.sha256, 'PDF SHA-256 differs from deck lock: ' + expected.id);
    inputs.push({id: expected.id, kind: 'pdf', file: basename(pdfPaths[index]), ...actual, pageCount: expected.pageCount});
  }
  for (const [index, expected] of plan.sources.entries()) {
    const actual = await identity(audioPaths[index]);
    assert.equal(actual.bytes, expected.bytes, 'Audio bytes/order differ from approved input: ' + expected.id);
    assert.equal(actual.sha256, expected.sha256, 'Audio SHA-256/order differ from approved input: ' + expected.id);
    inputs.push({id: expected.id, kind: 'audio', file: basename(audioPaths[index]), ...actual,
      t0: expected.t0, t1: expected.t1, durationSec: expected.durationSec});
  }
  const tools = {python: options.python || 'python3', ffmpeg: options.ffmpeg || 'ffmpeg', ffprobe: options.ffprobe || 'ffprobe'};
  const toolchain = await probeMediaToolchain(tools);
  for (const [index, deck] of plan.decks.entries()) {
    const info = await python(tools, ['pdf-info', pdfPaths[index]]);
    assert.equal(info.pages, deck.pageCount, 'PDF actual page count differs from locked value: ' + deck.id);
  }
  for (const [index, source] of plan.sources.entries()) {
    const probe = await probeAudio(audioPaths[index], tools, {input: true});
    assert.equal(probe.codec, 'mp3', 'Approved audio input must decode as MP3');
    ensure(finite(probe.durationSec) && probe.durationSec >= source.durationSec && probe.durationSec - source.durationSec <= 1,
      'Audio probe duration does not cover the declared source interval: ' + source.id);
  }
  const existingSiteFileCount = await countRetainedSiteFiles(siteDist, plan.files);
  ensure(existingSiteFileCount + plan.files.length <= MEDIA_LIMITS.maxFiles, 'Existing site plus planned media exceeds 20,000 files');
  return {root, output, siteDist, pdfPaths, audioPaths, timeline, timelineBytes, deckLockBytes, plan, tools, toolchain, inputs, existingSiteFileCount};
}

function expectedMetadata(context, assets) {
  return {schemaVersion: 1, kind: 'atlas-conference-media', eventId: context.plan.eventId, status: 'ready',
    settings: {...MEDIA_SETTINGS}, inputs: context.inputs,
    timeline: {bytes: context.timelineBytes.length, sha256: sha(context.timelineBytes)},
    deckLock: {bytes: context.deckLockBytes.length, sha256: sha(context.deckLockBytes)},
    toolchain: context.toolchain, decks: context.plan.decks, audio: context.plan.audio, assets,
    totals: {pageCount: context.plan.pageFiles.length, audioCount: context.plan.audio.length,
      assetCount: assets.length, fileCount: assets.length + 1, assetBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
      maxAssetBytes: Math.max(0, ...assets.map(asset => asset.bytes)), existingSiteFileCount: context.existingSiteFileCount,
      siteFileCount: context.existingSiteFileCount + assets.length + 1},
    limits: {...MEDIA_LIMITS}, review: {listening: 'pending', visual: 'pending'}};
}

function assertManifest(context, manifest, bytes) {
  ensure(bytes.length <= MEDIA_LIMITS.maxFileBytes, 'Manifest exceeds 25 MiB');
  const validation = validateConferenceMediaManifest(manifest, {timeline: context.timeline, timelineSha256: sha(context.timelineBytes), manifestBytes: bytes.length});
  ensure(validation.valid && validation.available, 'Invalid ready media manifest: ' + validation.errors.map(error => error.path + ' ' + error.message).join('; '));
}

async function inspectAssets(context, directory) {
  const allFiles = await inventory(directory);
  assert.deepEqual([...allFiles].sort(), [...context.plan.files].sort(), 'Output inventory has missing or unexpected files');
  const assets = [], imageFiles = context.plan.pageFiles.map(page => join(directory, page.file));
  // Keep command length bounded on both Linux and macOS.
  const images = [];
  for (let start = 0; start < imageFiles.length; start += 64) images.push(...await python(context.tools, ['inspect-image', ...imageFiles.slice(start, start + 64)]));
  for (const [index, page] of context.plan.pageFiles.entries()) {
    const dimensions = images[index], observed = await identity(join(directory, page.file));
    assert.equal(Math.max(dimensions.width, dimensions.height), MEDIA_SETTINGS.longEdge, 'WebP long edge differs');
    assert.equal(dimensions.frames, 1, 'Slides must be static WebP');
    assert.equal(dimensions.hasMetadata, false, 'Slides must not copy source metadata');
    ensure(observed.bytes <= MEDIA_LIMITS.maxFileBytes, 'Page exceeds 25 MiB: ' + page.file);
    assets.push({file: page.file, kind: 'page', ...observed, deckId: page.deckId, page: page.page, width: dimensions.width, height: dimensions.height});
  }
  for (const session of context.plan.audio) {
    const file = join(directory, session.file), observed = await identity(file), probe = await probeAudio(file, context.tools);
    validateAudioProbe(probe, session);
    ensure(observed.bytes <= MEDIA_LIMITS.maxFileBytes, 'Session exceeds 25 MiB: ' + session.file);
    assets.push({file: session.file, kind: 'audio', ...observed, talkId: session.talkId,
      durationSec: probe.durationSec, codec: probe.codec, channels: probe.channels, sampleRate: probe.sampleRate});
  }
  return assets;
}

async function ensureNewOutput(output) {
  try { await lstat(output); throw new Error('Output already exists; refusing to overwrite: ' + output); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function prepareConferenceMedia(options = {}) {
  const output = resolve(options.out || join(options.root || ROOT, 'build/conference-media'));
  if (!options.check) await ensureNewOutput(output);
  const context = await readContext(options);
  if (options.check) {
    const outputInfo = await lstat(context.output);
    ensure(outputInfo.isDirectory() && !outputInfo.isSymbolicLink(), 'Output must be a real directory');
  }
  const temporary = await mkdtemp(join(tmpdir(), 'atlas-conference-media-'));
  let claimedOutput = null, published = false;
  try {
    const rawFiles = await decodeSources(context, temporary);
    if (options.check) {
      const bytes = await readFile(join(context.output, MANIFEST_FILE)), manifest = JSON.parse(bytes);
      assertManifest(context, manifest, bytes);
      const assets = await inspectAssets(context, context.output);
      const expected = expectedMetadata(context, assets);
      assert.deepEqual(manifest, expected, 'Media manifest is stale: input, toolchain, inventory, probe, or retained-site count changed');
      assert.equal(bytes.toString('utf8'), pretty(expected).toString('utf8'), 'Media manifest serialization/order is stale');
      return {...expected.totals, durationSec: context.plan.durationSec, manifestBytes: bytes.length,
        maxFileBytes: Math.max(expected.totals.maxAssetBytes, bytes.length), mode: 'check', status: 'ready', review: expected.review};
    }
    // Build privately. The chosen output is claimed exclusively only after all
    // assets and probes pass; manifest publication is last. Existing directories
    // are never replaced, including another process winning that final claim.
    const staging = join(temporary, 'output');
    await mkdir(staging);
    for (const [index, deck] of context.plan.decks.entries()) {
      await python(context.tools, ['render-pdf', context.pdfPaths[index], join(staging, deck.dir), '--pages', String(deck.pageCount), '--long-edge', '1800', '--quality', '80']);
    }
    await mkdir(join(staging, 'audio'));
    for (const session of context.plan.audio) await run(context.tools.ffmpeg, audioEncodeArguments(session, rawFiles, join(staging, session.file)));
    // A private placeholder allows the same exact-inventory checker for build
    // and --check; it is replaced with validated JSON before publication.
    await writeFile(join(staging, MANIFEST_FILE), '{}\n', {flag: 'wx'});
    const assets = await inspectAssets(context, staging), manifest = expectedMetadata(context, assets), bytes = pretty(manifest);
    assertManifest(context, manifest, bytes);
    await writeFile(join(staging, MANIFEST_FILE), bytes);
    await mkdir(dirname(context.output), {recursive: true});
    await mkdir(context.output); // exclusive: fails if a prior/racing output exists
    const claim = await lstat(context.output);
    claimedOutput = {dev: claim.dev, ino: claim.ino};
    for (const entry of (await readdir(staging)).filter(entry => entry !== MANIFEST_FILE).sort()) {
      // copyFile would lose directory structure; rename is atomic within a
      // filesystem. For cross-device tmp directories use the recursive copier.
      await moveNew(join(staging, entry), join(context.output, entry));
    }
    await moveNew(join(staging, MANIFEST_FILE), join(context.output, MANIFEST_FILE));
    published = true;
    return {...manifest.totals, durationSec: context.plan.durationSec, manifestBytes: bytes.length,
      maxFileBytes: Math.max(manifest.totals.maxAssetBytes, bytes.length), mode: 'build', status: 'ready', review: manifest.review};
  } catch (error) {
    // A failed copy must not leave a misleading half-package. Only remove the
    // directory this invocation exclusively created, never a prior output or
    // a different directory another process placed at the same path.
    if (claimedOutput && !published) {
      try {
        const current = await lstat(context.output);
        if (current.isDirectory() && current.dev === claimedOutput.dev && current.ino === claimedOutput.ino) {
          await rm(context.output, {recursive: true});
        }
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') error.message += '; partial output cleanup failed: ' + cleanupError.message;
      }
    }
    throw error;
  } finally { await rm(temporary, {recursive: true, force: true}); }
}

async function moveNew(source, target) {
  try { await rename(source, target); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    const {cp} = await import('node:fs/promises');
    await cp(source, target, {recursive: true, force: false, errorOnExist: true, dereference: false});
  }
}

export function parseMediaArguments(args) {
  const options = {audio: []};
  const names = new Map([['--pdf-final', 'pdfFinal'], ['--pdf-r17', 'pdfR17'], ['--out', 'out'], ['--timeline', 'timeline'],
    ['--deck-lock', 'deckLock'], ['--site-dist', 'siteDist'], ['--python', 'python'], ['--ffmpeg', 'ffmpeg'], ['--ffprobe', 'ffprobe']]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--check') { ensure(!options.check, 'Duplicate --check'); options.check = true; continue; }
    if (flag === '--help') { options.help = true; continue; }
    ensure(flag === '--audio' || names.has(flag), 'Unknown argument: ' + flag);
    const value = args[++index];
    ensure(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), 'Missing value for ' + flag);
    if (flag === '--audio') options.audio.push(value);
    else { const name = names.get(flag); ensure(!(name in options), 'Duplicate ' + flag); options[name] = value; }
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === GENERATOR) {
  try {
    const options = parseMediaArguments(process.argv.slice(2));
    if (options.help) console.log('Usage: node scripts/prepare-conference-media.mjs --pdf-final PATH --pdf-r17 PATH --audio FIRST.mp3 --audio SECOND.mp3 --out DIR [--check]\nOptional: --timeline PATH --deck-lock PATH --site-dist DIR --python PATH --ffmpeg PATH --ffprobe PATH\nRequires Python with PyMuPDF/Pillow WebP, ffmpeg and ffprobe. Uses about 2 GiB temporary PCM for the locked event. Builds refuse existing outputs; --check never modifies output. Human listening/visual review remains pending.');
    else console.log(JSON.stringify(await prepareConferenceMedia(options), null, 2));
  } catch (error) { console.error('conference-media: ' + error.message); process.exitCode = 1; }
}
