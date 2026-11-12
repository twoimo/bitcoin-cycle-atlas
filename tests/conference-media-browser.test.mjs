import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseConferenceMediaArguments, CONFERENCE_MEDIA_EXIT,
  assertConferenceBrowserMediaResponses} from '../scripts/verify-conference-media-browser.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const harness = join(root, 'scripts/verify-conference-media-browser.mjs');
const timeline = await readFile(join(root, 'dist/conference/timeline.json'));
const unavailable = JSON.stringify({schemaVersion:1, kind:'atlas-conference-media', eventId:'plspo-2026-10-31',
  status:'unavailable', decks:[], audio:[], assets:[]});

async function fixture(manifest) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-media-cli-'));
  const dist = join(directory, 'dist'), out = join(directory, 'receipt');
  await mkdir(join(dist, 'conference'), {recursive:true});
  await writeFile(join(dist, 'conference/timeline.json'), timeline);
  if (manifest !== undefined) await writeFile(join(dist, 'conference/media-manifest.json'), manifest);
  return {directory, dist, out, browser:join(directory, 'browser-that-must-not-be-started')};
}
async function run(fixture, extra = []) {
  try {
    const result = await execute(process.execPath, [harness, '--dist', fixture.dist, '--out', fixture.out,
      '--browser', fixture.browser, ...extra], {cwd:root, timeout:15000});
    return {...result, exitCode:0};
  } catch (error) {
    assert.equal(typeof error.code, 'number', 'CLI must exit normally instead of timing out');
    return {stdout:error.stdout, stderr:error.stderr, exitCode:error.code};
  }
}

test('media browser CLI cannot override the viewport, 150ms budget, source data, or skipped exit status', () => {
  assert.deepEqual(CONFERENCE_MEDIA_EXIT, {passed:0, failed:1, skipped:2});
  const values = parseConferenceMediaArguments(['--dist', 'copy', '--out', 'receipt', '--browser', 'chrome'], '/tmp/base');
  assert.deepEqual(values, {dist:'/tmp/base/copy', out:'/tmp/base/receipt', browser:'/tmp/base/chrome'});
  for (const name of ['--budget', '--threshold', '--timeline', '--skip-is-pass', '--fixture', '--viewport']) {
    assert.throws(() => parseConferenceMediaArguments([name, '1']), /Unknown option/);
  }
  assert.throws(() => parseConferenceMediaArguments(['--dist']), /Missing value/);
  assert.throws(() => parseConferenceMediaArguments(['--out', 'one', '--out', 'two']), /Duplicate option/);
});

for (const [name, manifest, reason] of [
  ['missing', undefined, /not installed/],
  ['unavailable', unavailable, /declares unavailable/],
]) test(name + ' media exits 2 with an explicit zero-browser skip receipt', async () => {
  const f = await fixture(manifest);
  try {
    const result = await run(f), report = JSON.parse(await readFile(join(f.out, 'report.json')));
    assert.equal(result.exitCode, 2); assert.equal(report.exitCode, 2); assert.equal(report.status, 'skipped');
    assert.match(report.skipReason, reason); assert.equal(report.browserLaunched, false);
    assert.deepEqual(report.counts, {cases:0, passed:0, failed:0, skipped:1});
    assert.equal(report.preflight.passed, false); assert.equal(report.preflight.skipped, true);
    assert.ok(report.unexecuted.includes('installed-media HTTP Range/206'));
    assert.equal(report.http, undefined); assert.equal(report.browserVersion, undefined);
    assert.equal(await readFile(join(f.out, 'chrome.stderr.log'), 'utf8'), '');
    assert.match(result.stdout, /"status":"skipped"/);
    assert.equal(await readFile(join(f.dist, 'conference/timeline.json'), 'utf8'), timeline.toString());
  } finally { await rm(f.directory, {recursive:true, force:true}); }
});

for (const [name, manifest] of [['invalid-json', '{invalid'], ['broken-ready', JSON.stringify({schemaVersion:1,
  kind:'atlas-conference-media', eventId:'plspo-2026-10-31', status:'ready', assets:[]})]]) {
  test(name + ' installed media fails instead of claiming absent-media skip', async () => {
    const f = await fixture(manifest);
    try {
      const result = await run(f), report = JSON.parse(await readFile(join(f.out, 'report.json')));
      assert.equal(result.exitCode, 1); assert.equal(report.status, 'failed'); assert.equal(report.browserLaunched, false);
      assert.equal(report.preflight.skipped, false); assert.equal(report.preflight.passed, false);
      assert.ok(report.preflight.errors.length > 0); assert.ok(report.failures.length > 0);
      assert.equal(report.skipReason, null); assert.equal(report.counts.passed, 0);
    } finally { await rm(f.directory, {recursive:true, force:true}); }
  });
}

test('media receipt directory is append-only; a retry cannot overwrite earlier evidence', async () => {
  const f = await fixture(unavailable);
  try {
    await mkdir(f.out); const previous = '{"previous":"receipt"}\n';
    await writeFile(join(f.out, 'report.json'), previous);
    const result = await run(f);
    assert.equal(result.exitCode, 1); assert.match(result.stdout, /"status":"failed"/);
    assert.equal(await readFile(join(f.out, 'report.json'), 'utf8'), previous);
    assert.equal(resolve(f.out), f.out);
  } finally { await rm(f.directory, {recursive:true, force:true}); }
});

test('browser HTTP evidence accepts sent 206 metadata cancellations and rejects full, incorrect, or undeclared audio', () => {
  const manifest = {assets:[{file:'audio/session-00.m4a', bytes:100}]};
  const sent = {method:'GET', url:'/bitcoin-cycle-atlas/conference/audio/session-00.m4a',
    path:'conference/audio/session-00.m4a', range:'bytes=0-', status:206,
    contentType:'audio/mp4', contentRange:'bytes 0-99/100', contentLength:100, contentEncoding:null,
    complete:false, aborted:true, bytesSent:24};
  assert.deepEqual(assertConferenceBrowserMediaResponses([sent], 'installed', manifest), {audioRangeResponses:1, abortedBeforeHeaders:0});
  for (const bad of [{range:null, status:200}, {status:200}, {contentRange:'bytes 0-99/200'},
    {contentType:'application/octet-stream'}, {contentLength:99}, {contentEncoding:'gzip'},
    {path:'conference/audio/undeclared.m4a'}]) {
    assert.throws(() => assertConferenceBrowserMediaResponses([{...sent, ...bad}], 'installed', manifest));
  }
  const beforeHeaders = {...sent, status:null, contentRange:null, contentType:null, bytesSent:0};
  assert.deepEqual(assertConferenceBrowserMediaResponses([sent, beforeHeaders], 'installed', manifest), {audioRangeResponses:1, abortedBeforeHeaders:1});
  assert.throws(() => assertConferenceBrowserMediaResponses([beforeHeaders], 'installed', manifest), /must make Range requests/);
  assert.throws(() => assertConferenceBrowserMediaResponses([{...sent, status:null, aborted:false}], 'installed', manifest));
});

test('fallback HTTP evidence allows only the intended manifest404 and never hides media requests or late image failures', () => {
  const missing = {method:'GET', url:'/bitcoin-cycle-atlas/conference/media-manifest.json', path:'conference/media-manifest.json', status:404};
  assert.deepEqual(assertConferenceBrowserMediaResponses([missing], 'missing', null), {audioRangeResponses:0, abortedBeforeHeaders:0});
  assert.throws(() => assertConferenceBrowserMediaResponses([missing], 'unavailable', null), /unexpected local HTTP errors/);
  const image = {method:'GET', url:'/bitcoin-cycle-atlas/conference/pages/final/0001.webp', path:'conference/pages/final/0001.webp', status:404};
  assert.throws(() => assertConferenceBrowserMediaResponses([missing, image], 'missing', null), /absent media must not be requested/);
  assert.throws(() => assertConferenceBrowserMediaResponses([{...image, status:null, aborted:true}], 'unavailable', null), /absent media must not be requested/);
});
