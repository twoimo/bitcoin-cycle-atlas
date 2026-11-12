import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm, stat, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile, spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {
  MEDIA_INPUT_POLICY, MEDIA_SETTINGS, MEDIA_LIMITS, createConferenceMediaPlan,
  audioEncodeArguments, parseMediaArguments, countRetainedSiteFiles,
  prepareConferenceMedia, probeMediaToolchain,
} from '../scripts/prepare-conference-media.mjs';
import {validateConferenceMediaManifest} from '../dist/conference/media.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pretty = value => JSON.stringify(value, null, 2) + '\n';
const clone = value => structuredClone(value);
const originalTimeline = JSON.parse(await readFile(join(root, 'dist/conference/timeline.json'), 'utf8'));
const originalLock = JSON.parse(await readFile(join(root, 'docs/conference/deck-lock-20261112.json'), 'utf8'));

test('locked media plan retains all 547 pages and 15 exact programs including the source-13 join', () => {
  const plan = createConferenceMediaPlan(originalTimeline, originalLock);
  assert.equal(plan.pageFiles.length, 547);
  assert.equal(plan.audio.length, 15);
  assert.equal(plan.files.length, 563);
  assert.equal(plan.durationSec, 20400);
  assert.deepEqual(plan.decks.map(deck => [deck.id, deck.pageCount]), [['final-290', 290], ['r17-clean-257', 257]]);
  assert.deepEqual(plan.pageFiles.filter(page => [1, 257, 290].includes(page.page)).map(page => page.file), [
    'pages/final/0001.webp', 'pages/final/0257.webp', 'pages/final/0290.webp', 'pages/r17/0001.webp', 'pages/r17/0257.webp',
  ]);
  assert.deepEqual(plan.audio.map(clip => [clip.talkId, clip.t0, clip.t1]), originalTimeline.talks.map(talk => [talk.id, talk.t0, talk.t1]));
  assert.deepEqual(plan.audio[13].sourceRanges, [
    {inputId: 'plaud-1', t0: 17956.51, t1: 18000, sourceT0: 17956.51, sourceT1: 18000, startSample: 861912480, endSample: 864000000},
    {inputId: 'plaud-2', t0: 18000, t1: 20042.82, sourceT0: 0, sourceT1: 2042.82, startSample: 0, endSample: 98055360},
  ]);
  assert.equal(plan.audio.reduce((sum, clip) => sum + clip.sourceRanges.reduce((samples, range) => samples + range.endSample - range.startSample, 0), 0), 20400 * 48000);
  assert.equal(plan.audio[13].durationSec, 2086.31);
  assert.deepEqual(MEDIA_SETTINGS, {longEdge: 1800, webpQuality: 80, webpMethod: 6, audioCodec: 'aac', audioContainer: 'm4a', audioBitrate: 40000, audioChannels: 1, audioSampleRate: 48000});
  assert.deepEqual(MEDIA_LIMITS, {maxFileBytes: 26214400, maxFiles: 20000});
});

test('plan rejects changed lock identity, missing programs, gaps, overlap and off-sample-grid boundaries', () => {
  const changedLock = clone(originalLock); changedLock.decks[1].pdf.sha256 = '0'.repeat(64);
  assert.throws(() => createConferenceMediaPlan(originalTimeline, changedLock), /approved policy/);
  const changedDirectory = clone(originalTimeline); changedDirectory.decks[0].dir = 'pages/other-final';
  assert.throws(() => createConferenceMediaPlan(changedDirectory, originalLock), /directory differs/);
  const missing = clone(originalTimeline); missing.talks.splice(4, 1);
  assert.throws(() => createConferenceMediaPlan(missing, originalLock), /Invalid source timeline|preserve every/);
  const gap = clone(originalTimeline); gap.talks[0].t1 -= 1;
  assert.throws(() => createConferenceMediaPlan(gap, originalLock), /without gaps/);
  const overlap = clone(originalTimeline); overlap.talks[1].t0 -= 1;
  assert.throws(() => createConferenceMediaPlan(overlap, originalLock), /Invalid source timeline/);
  const offGrid = clone(originalTimeline); offGrid.talks[0].t1 += .000001; offGrid.talks[1].t0 += .000001;
  assert.throws(() => createConferenceMediaPlan(offGrid, originalLock), /exact 48 kHz sample/);
  const reordered = clone(originalTimeline); reordered.audio.reverse();
  assert.throws(() => createConferenceMediaPlan(reordered, originalLock), /Invalid source timeline|source order/);
  const short = clone(MEDIA_INPUT_POLICY); short.audio[1].t1 -= 1;
  assert.throws(() => createConferenceMediaPlan(originalTimeline, originalLock, {policy: short}), /duration differs/);
});

test('AAC command joins crossing source ranges before one encode with exact sample skips and fixed metadata', () => {
  const session = createConferenceMediaPlan(originalTimeline, originalLock).audio[13];
  const args = audioEncodeArguments(session, new Map([['plaud-1', '/scratch/first.s16le'], ['plaud-2', '/scratch/second.s16le']]), '/scratch/output.m4a');
  assert.equal(args.filter(value => value === '-c:a').length, 1);
  assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
  assert.equal(args[args.indexOf('-b:a') + 1], '40000');
  assert.deepEqual(args.flatMap((value, index) => value === '-skip_initial_bytes' ? [args[index + 1]] : []), ['1723824960', '0']);
  assert.match(args[args.indexOf('-filter_complex') + 1], /atrim=end_sample=2087520/);
  assert.match(args[args.indexOf('-filter_complex') + 1], /atrim=end_sample=98055360/);
  assert.match(args[args.indexOf('-filter_complex') + 1], /\[a0\]\[a1\]concat=n=2:v=0:a=1\[out\]/);
  assert.equal(args[args.indexOf('-map_metadata') + 1], '-1');
  assert.equal(args[args.indexOf('-map_chapters') + 1], '-1');
  assert.ok(args.includes('creation_time=1970-01-01T00:00:00Z'));
  assert.ok(args.includes('+faststart'));
  assert.ok(!args.includes('copy'), 'AAC sessions must not join independently encoded streams');
});

test('CLI preserves repeatable audio order and cannot relax media settings or source identity policy', () => {
  const options = parseMediaArguments(['--pdf-final', 'final.pdf', '--pdf-r17', 'r17.pdf', '--audio', 'one.mp3', '--audio', 'two.mp3', '--out', 'out', '--check']);
  assert.deepEqual(options, {audio: ['one.mp3', 'two.mp3'], pdfFinal: 'final.pdf', pdfR17: 'r17.pdf', out: 'out', check: true});
  assert.throws(() => parseMediaArguments(['--quality', '10']), /Unknown argument/);
  assert.throws(() => parseMediaArguments(['--policy', 'different.json']), /Unknown argument/);
  assert.throws(() => parseMediaArguments(['--audio']), /Missing value/);
  assert.throws(() => parseMediaArguments(['--out', 'one', '--out', 'two']), /Duplicate/);
});

test('retained site count measures exact union and remains stable after media installation', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'atlas-media-count-'));
  try {
    await mkdir(join(temporary, 'conference/pages/final'), {recursive: true});
    await writeFile(join(temporary, 'index.html'), 'site');
    await writeFile(join(temporary, 'conference/player.js'), 'player');
    await writeFile(join(temporary, 'conference/media-manifest.json'), 'unavailable');
    const planned = ['media-manifest.json', 'pages/final/0001.webp'];
    assert.equal(await countRetainedSiteFiles(temporary, planned), 2);
    await writeFile(join(temporary, 'conference/pages/final/0001.webp'), 'installed image');
    assert.equal(await countRetainedSiteFiles(temporary, planned), 2);
    await writeFile(join(temporary, 'conference/pages/final/unplanned.webp'), 'count this extra retained file');
    assert.equal(await countRetainedSiteFiles(temporary, planned), 3);
  } finally { await rm(temporary, {recursive: true, force: true}); }
});

const toolAvailability = [
  ['python3', ['-c', 'import fitz; from PIL import Image, features; assert features.check("webp")']],
  ['ffmpeg', ['-version']], ['ffprobe', ['-version']],
].map(([command, args]) => ({command, result: spawnSync(command, args, {stdio: 'ignore'})}));
const unavailable = toolAvailability.filter(item => item.result.status !== 0).map(item => item.command);

async function syntheticInputs(temporary) {
  const sources = join(temporary, 'sources'), siteDist = join(temporary, 'site');
  await mkdir(sources); await mkdir(join(siteDist, 'conference'), {recursive: true});
  await writeFile(join(siteDist, 'index.html'), '<!doctype html>');
  await writeFile(join(siteDist, 'conference/player.js'), '// retained player');
  await writeFile(join(siteDist, 'conference/media-manifest.json'), '{"status":"unavailable"}\n');
  const pdfFinal = join(sources, 'tiny-final.pdf'), pdfR17 = join(sources, 'tiny-r17.pdf');
  await execute('python3', ['-c', [
    'import fitz, sys',
    'for filename, count in [(sys.argv[1], 2), (sys.argv[2], 1)]:',
    '    document=fitz.open()',
    '    for index in range(count):',
    '        page=document.new_page(width=320 if index==0 else 240,height=180 if index==0 else 360)',
    '        page.draw_rect(fitz.Rect(12,12,150,80),color=(0.1,0.4,0.7),fill=(0.8,0.9,1))',
    '        page.insert_text((20,45),"Synthetic page %d"%(index+1),fontsize=13)',
    '    document.save(filename,no_new_id=True)',
    '    document.close()',
  ].join('\n'), pdfFinal, pdfR17]);
  const audio = [join(sources, 'first.mp3'), join(sources, 'second.mp3')];
  for (let index = 0; index < audio.length; index++) await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
    '-f', 'lavfi', '-i', 'sine=frequency=' + (index ? '880' : '440') + ':sample_rate=48000:duration=' + (index ? '1' : '2'),
    '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '64000', '-threads', '1', '-fflags', '+bitexact', '-flags:a', '+bitexact', audio[index]]);
  const identity = async file => { const bytes = await readFile(file); return {bytes: bytes.length, sha256: hash(bytes)}; };
  const decks = [
    {id: 'final-290', dir: 'pages/final', pageCount: 2, ...await identity(pdfFinal)},
    {id: 'r17-clean-257', dir: 'pages/r17', pageCount: 1, ...await identity(pdfR17)},
  ];
  const audioPolicy = [
    {id: 'plaud-1', ...await identity(audio[0]), t0: 0, t1: 2},
    {id: 'plaud-2', ...await identity(audio[1]), t0: 2, t1: 3},
  ];
  const policy = {eventId: 'synthetic-media-test', decks, audio: audioPolicy, talkIds: ['00', '01', '02']};
  const data = {
    schemaVersion: 1, event: {id: policy.eventId, title: 'Tiny fixture', date: '2026-10-31', timezone: 'Asia/Seoul', clockStart: '12:33:00', clockEnd: '12:33:03'},
    audio: audioPolicy.map((source, index) => ({id: source.id, file: 'audio/' + source.id + '.m4a', clockStart: index ? '12:33:02' : '12:33:00', durationSec: source.t1 - source.t0, available: false})),
    decks: decks.map((deck, index) => ({id: deck.id, pages: deck.pageCount, label: deck.id, dir: index ? 'pages/r17' : 'pages/final', imagesAvailable: false})),
    talks: [[0, .75], [.75, 2.5], [2.5, 3]].map(([t0, t1], index) => ({id: String(index).padStart(2, '0'), title: 'Program ' + index, t0, t1, pageRange: {'final-290': null, 'r17-clean-257': null}})),
    segments: [{source: 'fixture#1', text: 'Test caption', t0: 0, t1: .5, talk: '00', page: null}],
  };
  const lock = {schema: 'atlas.wp-a.deck-lock/1', decks: decks.map(deck => ({id: deck.id, pdf: {sha256: deck.sha256, bytes: deck.bytes, pages: deck.pageCount}}))};
  const timeline = join(temporary, 'timeline.json'), deckLock = join(temporary, 'deck-lock.json');
  await writeFile(timeline, pretty(data)); await writeFile(deckLock, pretty(lock));
  return {pdfFinal, pdfR17, audio, timeline, deckLock, siteDist, policy, data};
}

test('real temporary PDF/MP3 fixtures build deterministic WebP/AAC, verify probes, and reject stale/tampered output',
  {skip: unavailable.length ? 'Optional local media tools unavailable: ' + unavailable.join(', ') : false}, async t => {
    const temporary = await mkdtemp(join(tmpdir(), 'atlas-media-build-'));
    try {
      const fixture = await syntheticInputs(temporary), out = join(temporary, 'first-output');
      const options = {...fixture, out};
      const snapshots = await Promise.all([fixture.pdfFinal, fixture.pdfR17, ...fixture.audio, fixture.timeline, fixture.deckLock].map(file => readFile(file)));
      const built = await prepareConferenceMedia(options);
      assert.equal(built.pageCount, 3); assert.equal(built.audioCount, 3);
      assert.equal(built.assetCount, 6); assert.equal(built.fileCount, 7);
      assert.equal(built.existingSiteFileCount, 2); assert.equal(built.siteFileCount, 9);
      assert.equal(built.durationSec, 3); assert.equal(built.status, 'ready');
      assert.ok(built.maxFileBytes <= MEDIA_LIMITS.maxFileBytes);
      const manifestFile = join(out, 'media-manifest.json'), manifestBytes = await readFile(manifestFile), manifest = JSON.parse(manifestBytes);
      assert.equal(validateConferenceMediaManifest(manifest, {timeline: fixture.data, timelineSha256: hash(await readFile(fixture.timeline)), manifestBytes: manifestBytes.length}).valid, true);
      assert.deepEqual(manifest.review, {listening: 'pending', visual: 'pending'});
      assert.deepEqual(manifest.inputs.filter(input => input.kind === 'audio').map(input => input.decodedSamples), [96000, 48000]);
      assert.equal(manifest.audio[1].sourceRanges.length, 2);
      assert.deepEqual(manifest.assets.filter(asset => asset.kind === 'page').map(asset => [asset.width, asset.height]), [[1800, 1012], [1200, 1800], [1800, 1012]]);
      for (const asset of manifest.assets.filter(asset => asset.kind === 'audio')) {
        assert.equal(asset.codec, 'aac'); assert.equal(asset.channels, 1); assert.equal(asset.sampleRate, 48000);
      }
      assert.doesNotMatch(manifestBytes.toString(), new RegExp(temporary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const checked = await prepareConferenceMedia({...options, check: true});
      assert.equal(checked.mode, 'check'); assert.equal(checked.fileCount, 7);
      assert.deepEqual(await readFile(manifestFile), manifestBytes, '--check must not rewrite manifest');

      await t.test('encoded crossing session preserves the first then second source signal', async () => {
        const {stdout: pcm} = await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin',
          '-i', join(out, 'audio/session-01.m4a'), '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], {encoding: 'buffer', maxBuffer: 1024 * 1024});
        const frequencyAt = time => {
          const start = Math.round(time * 48000), length = 9600;
          let crossings = 0;
          for (let index = start + 1; index < start + length; index++) {
            if (pcm.readFloatLE((index - 1) * 4) <= 0 && pcm.readFloatLE(index * 4) > 0) crossings++;
          }
          return crossings / (length / 48000);
        };
        // The fixture's [.75,2.5) talk contains1.25s of440Hz then.5s of880Hz.
        assert.ok(Math.abs(frequencyAt(.1) - 440) <= 10, 'First source must precede the boundary');
        assert.ok(Math.abs(frequencyAt(1.35) - 880) <= 10, 'Second source must follow the boundary');
      });

      await t.test('second fresh build has byte-identical manifest, images and audio', async () => {
        const second = join(temporary, 'second-output');
        await prepareConferenceMedia({...options, out: second});
        assert.deepEqual(await readFile(join(second, 'media-manifest.json')), manifestBytes);
        for (const asset of manifest.assets) assert.deepEqual(await readFile(join(second, asset.file)), await readFile(join(out, asset.file)), asset.file);
      });

      await t.test('copied media keeps exact retained site union and --check stable', async () => {
        await cp(out, join(fixture.siteDist, 'conference'), {recursive: true});
        assert.equal(await countRetainedSiteFiles(fixture.siteDist, [...manifest.assets.map(asset => asset.file), 'media-manifest.json']), 2);
        assert.equal((await prepareConferenceMedia({...options, check: true})).siteFileCount, 9);
      });

      await t.test('existing output and swapped source order fail without changing any original', async () => {
        await assert.rejects(() => prepareConferenceMedia(options), /Output already exists/);
        await assert.rejects(() => prepareConferenceMedia({...options, out: join(temporary, 'swapped'), audio: [...fixture.audio].reverse()}), /Audio bytes\/order|Audio SHA-256\/order/);
        await assert.rejects(() => stat(join(temporary, 'swapped')), {code: 'ENOENT'});
        assert.deepEqual(await Promise.all([fixture.pdfFinal, fixture.pdfR17, ...fixture.audio, fixture.timeline, fixture.deckLock].map(file => readFile(file))), snapshots);
      });

      await t.test('hash-valid PDF still rejects an actual page count different from its declared lock', async () => {
        const policy = clone(fixture.policy), data = clone(fixture.data);
        const lock = JSON.parse(await readFile(fixture.deckLock, 'utf8'));
        // Keep the real PDF hash/bytes, while independently declaring three
        // pages everywhere the plan can see. The renderer must observe two.
        policy.decks[0].pageCount = 3; data.decks[0].pages = 3; lock.decks[0].pdf.pages = 3;
        const timeline = join(temporary, 'wrong-pages-timeline.json'), deckLock = join(temporary, 'wrong-pages-lock.json');
        await writeFile(timeline, pretty(data)); await writeFile(deckLock, pretty(lock));
        const target = join(temporary, 'wrong-pages-output');
        await assert.rejects(() => prepareConferenceMedia({...options, policy, timeline, deckLock, out: target}), /PDF actual page count differs/);
        await assert.rejects(() => stat(target), {code: 'ENOENT'});
      });

      await t.test('MP3 container padding cannot substitute for missing decoded source samples', async () => {
        const policy = clone(fixture.policy), data = clone(fixture.data);
        // This generated MP3 reports 1.032s including encoder padding, but
        // gapless decoding contains exactly 48,000 samples. A 1.01s declared
        // interval passes the container probe and must fail the PCM check.
        policy.audio[1].t1 = 3.01; data.audio[1].durationSec = 1.01;
        data.talks[2].t1 = 3.01; data.event.clockEnd = '12:33:03.01';
        const timeline = join(temporary, 'short-audio-timeline.json'); await writeFile(timeline, pretty(data));
        const target = join(temporary, 'short-audio-output');
        await assert.rejects(() => prepareConferenceMedia({...options, policy, timeline, out: target}), /Decoded source does not cover its complete declared event interval/);
        await assert.rejects(() => stat(target), {code: 'ENOENT'});
      });

      await t.test('locked MP3 input may contain cover art but generated AAC contains only audio', async () => {
        const coveredDir = join(temporary, 'covered-input'); await mkdir(coveredDir);
        const cover = join(coveredDir, 'cover.png'), covered = join(coveredDir, 'first-with-cover.mp3');
        await execute('python3', ['-c', 'from PIL import Image\nimport sys\nImage.new("RGB",(32,32),(20,50,100)).save(sys.argv[1])', cover]);
        await execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', fixture.audio[0], '-i', cover,
          '-map', '0:a:0', '-map', '1:v:0', '-c', 'copy', '-disposition:v', 'attached_pic', '-id3v2_version', '3',
          '-metadata', 'artist=Synthetic fixture metadata', '-metadata:s:v', 'title=Cover', '-metadata:s:v', 'comment=Cover (front)', covered]);
        const policy = clone(fixture.policy), inputBytes = await readFile(covered);
        policy.audio[0].bytes = inputBytes.length; policy.audio[0].sha256 = hash(inputBytes);
        const target = join(temporary, 'covered-input-output');
        const result = await prepareConferenceMedia({...options, policy, audio: [covered, fixture.audio[1]], out: target});
        assert.equal(result.audioCount, 3);
        const {stdout} = await execute('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(target, 'audio/session-00.m4a')]);
        const probe = JSON.parse(stdout);
        assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_type, 'audio');
        assert.equal(probe.format.tags.artist, undefined);
      });

      await t.test('actual retained site plus generated output cannot exceed 20,000 files', async () => {
        const siteDist = join(temporary, 'over-capacity-site'); await mkdir(siteDist);
        const retainedCount = MEDIA_LIMITS.maxFiles - manifest.totals.fileCount + 1;
        // Zero-byte files avoid a large fixture while exercising the real
        // directory inventory and prepare path, not a mocked count return.
        await execute('python3', ['-c', 'import pathlib,sys\nroot=pathlib.Path(sys.argv[1])\nfor index in range(int(sys.argv[2])):\n    (root/("retained-%05d.txt"%index)).touch()', siteDist, String(retainedCount)]);
        assert.equal(await countRetainedSiteFiles(siteDist, [...manifest.assets.map(asset => asset.file), 'media-manifest.json']), retainedCount);
        const target = join(temporary, 'over-capacity-output');
        await assert.rejects(() => prepareConferenceMedia({...options, siteDist, out: target}), /Existing site plus planned media exceeds 20,000 files/);
        await assert.rejects(() => stat(target), {code: 'ENOENT'});
        await rm(siteDist, {recursive: true});
      });

      await t.test('unexpected file, missing image and altered asset hash cannot pass check', async () => {
        const extra = join(out, 'unexpected.txt'); await writeFile(extra, 'not a declared asset');
        await assert.rejects(() => prepareConferenceMedia({...options, check: true}), /inventory has missing or unexpected/);
        await rm(extra);
        const firstPage = join(out, manifest.assets[0].file), pageBytes = await readFile(firstPage);
        await rm(firstPage);
        await assert.rejects(() => prepareConferenceMedia({...options, check: true}), /inventory has missing or unexpected/);
        await writeFile(firstPage, pageBytes);
        await writeFile(firstPage, await readFile(join(out, manifest.assets[1].file)));
        await assert.rejects(() => prepareConferenceMedia({...options, check: true}), /manifest is stale/);
        await writeFile(firstPage, pageBytes);
        const changed = clone(manifest); changed.assets[0].sha256 = 'f'.repeat(64);
        await writeFile(manifestFile, pretty(changed));
        await assert.rejects(() => prepareConferenceMedia({...options, check: true}), /manifest is stale/);
        await writeFile(manifestFile, manifestBytes);
      });

      await t.test('output probing rejects an MP3 disguised as a session m4a', async () => {
        const file = join(out, 'audio/session-00.m4a'), original = await readFile(file);
        await writeFile(file, await readFile(fixture.audio[0]));
        await assert.rejects(() => prepareConferenceMedia({...options, check: true}), /Output codec must be AAC/);
        await writeFile(file, original);
      });

      await t.test('input bytes, generator/toolchain provenance and retained site counts are checked', async () => {
        const original = await readFile(fixture.audio[0]);
        const altered = Buffer.from(original); altered[altered.length - 1] ^= 1;
        await writeFile(fixture.audio[0], altered);
        await assert.rejects(() => prepareConferenceMedia({...options, check: true}), /Audio SHA-256\/order/);
        await writeFile(fixture.audio[0], original);
        const changed = clone(manifest); changed.toolchain.ffmpeg.fingerprint = '0'.repeat(64);
        await writeFile(manifestFile, pretty(changed));
        await assert.rejects(() => prepareConferenceMedia({...options, check: true}), /manifest is stale/);
        await writeFile(manifestFile, manifestBytes);
        await writeFile(join(fixture.siteDist, 'new-page.js'), '// retained file count changed');
        await assert.rejects(() => prepareConferenceMedia({...options, check: true}), /manifest is stale/);
        await rm(join(fixture.siteDist, 'new-page.js'));
      });

      await t.test('manifest file limit and the immutable production policy are enforced', async () => {
        const changed = clone(manifest); changed.assets[0].bytes = MEDIA_LIMITS.maxFileBytes + 1;
        const validation = validateConferenceMediaManifest(changed, {timeline: fixture.data, manifestBytes: manifestBytes.length});
        assert.equal(validation.valid, false); assert.ok(validation.errors.some(error => error.code === 'asset_size'));
        assert.equal(validateConferenceMediaManifest(manifest, {timeline: fixture.data, manifestBytes: MEDIA_LIMITS.maxFileBytes + 1}).valid, false);
        await assert.rejects(() => prepareConferenceMedia({...options, policy: MEDIA_INPUT_POLICY, out: join(temporary, 'must-not-exist')}), /Unexpected event identity/);
        await assert.rejects(() => prepareConferenceMedia({...options, out: join(fixture.siteDist, 'new-media')}), /outside the site dist/);
        await assert.rejects(() => prepareConferenceMedia({...options, out: join(dirname(fixture.pdfFinal), 'new-media')}), /outside every original/);
      });
      assert.deepEqual(await readFile(manifestFile), manifestBytes);
      const toolchain = await probeMediaToolchain();
      assert.equal(toolchain.determinism.threads, 1);
      assert.equal(toolchain.determinism.ffmpegBitexact, true);
      assert.equal(toolchain.renderer.libwebp.length > 0, true);
    } finally { await rm(temporary, {recursive: true, force: true}); }
  });
