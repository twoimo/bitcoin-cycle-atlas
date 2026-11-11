#!/usr/bin/env node
// Task-local one-suite retry, derived from the original R10 runner.
// All committed harnesses, settle behavior and deadlines stay unchanged.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createWriteStream} from 'node:fs';
import {readFile, readlink, mkdir, realpath, stat, writeFile} from 'node:fs/promises';
import {resolve, relative, sep, extname} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const repository = '/workspace/scratch/15a50edfd7d0/bitcoin-cycle-atlas';
const [expectedSource = '4cc98d8195707ab69e534236bf2ed7fa22819327', output = 'build/r12-final/wp6-retry'] = process.argv.slice(2);
assert.equal(expectedSource, '4cc98d8195707ab69e534236bf2ed7fa22819327', 'Retry must use the same final product source');
assert.equal(process.version, 'v24.22.2');assert.equal(process.platform, 'linux');assert.equal(process.arch, 'x64');
assert.match(output, /^build\/[a-zA-Z0-9._/-]+$/);assert.ok(!output.split('/').includes('..'));
process.env.ATLAS_BROWSER_PATH ||= '/workspace/scratch/55a6bfaf803b/conference-tools/chrome-with-proxy';
assert.equal(process.env.ATLAS_BROWSER_PATH, '/workspace/scratch/55a6bfaf803b/conference-tools/chrome-with-proxy', 'Browser must match the original final run');
process.env.PATH = '/Applications/Docker.app/Contents/Resources/bin:/workspace/scratch/55a6bfaf803b/conference-tools/node-v24.22.2-linux-x64/bin:' + process.env.PATH;
const root = resolve(repository), dist = resolve(root, 'dist'), out = resolve(root, output);
try { await stat(out); throw new Error('Retry output already exists; refusing to overwrite evidence: ' + out); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
const {validateWp6CandidateSource, validateWp6Report, collectWp6Screenshots} = await import(pathToFileURL(resolve(root, 'scripts/verify-wp6-cloudflare.mjs')));
const harnessFiles = ['scripts/verify-responsive-workbench-browser.mjs', 'scripts/verify-wp6-browser.mjs', 'scripts/verify-wp6-cloudflare.mjs', 'scripts/verify-chart-qa-metrics.mjs'];
const started = Date.now(), deadline = started + 28 * 60 * 1000;
const report = {schemaVersion:1, kind:'r12-independent-complete-wp6-retry', productionDeployment:false, sourceCommit:expectedSource, startedAt:new Date(started).toISOString(), status:'failed', gates:[]};
let server, activeChild, interrupted = false;

async function candidateSource() {
  assert.equal(git(['rev-parse', 'HEAD']), expectedSource, 'Unexpected source HEAD');
  assert.equal(git(['status', '--porcelain', '--untracked-files=all', '--', 'dist']), '', 'dist must be clean and committed');
  const tree = git(['ls-tree', '-r', 'HEAD', '--', 'dist']);
  assert.ok(tree.includes('\tdist/index.html'));
  // Verify actual working bytes against every committed blob, including files
  // that git status might omit because of assume-unchanged index flags.
  const entries = execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD', '--', 'dist'], {cwd:root, encoding:'utf8'}).split('\0').filter(Boolean);
  for (const entry of entries) {
    const match = /^(\d+) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
    assert.ok(match, 'Unexpected dist tree entry');
    const [, mode, expectedBlob, file] = match;
    assert.ok(['100644', '100755', '120000'].includes(mode));
    const bytes = mode === '120000' ? Buffer.from(await readlink(resolve(root, file))) : await readFile(resolve(root, file));
    const actualBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(actualBlob, expectedBlob, 'Working dist bytes differ: ' + file);
  }
  return validateWp6CandidateSource({schemaVersion:1, kind:'atlas-wp6-candidate-source', productionDeployment:false, verifiedTrackedDistClean:true,
    sourceCommit:expectedSource, sourceTree:git(['rev-parse', 'HEAD^{tree}']), distTreeSha256:sha(tree)}, {expectedSource});
}

function stopGroup(pid, signal = 'SIGTERM') { if (pid) try { process.kill(-pid, signal); } catch {} }
function stopOwned(signal = 'SIGTERM') { stopGroup(activeChild?.pid, signal); }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true; stopOwned(); setTimeout(() => stopOwned('SIGKILL'), 500).unref();
  server?.closeAllConnections();
});

async function runJob(job) {
  const directory = out;
  const entry = {id:job.id, expectedCases:job.count, startedAt:new Date().toISOString(), status:'failed'}; report.gates.push(entry);
  try {
    assert.ok(!interrupted && deadline - Date.now() > 1000, 'Run interrupted or time budget exhausted');
    const log = createWriteStream(resolve(directory, 'run.log'));
    const args = job.kind === 'responsive' ? ['scripts/verify-responsive-workbench-browser.mjs'] :
      ['scripts/verify-wp6-browser.mjs', '--suite', job.kind, '--phase', 'candidate', '--origin', report.origin, '--expected-source', expectedSource, '--out', directory];
    const env = {...process.env, ...(job.kind === 'responsive' ? {ATLAS_RESPONSIVE_BASE_URL:report.origin + '/bitcoin-cycle-atlas/',
      ATLAS_RESPONSIVE_QUERY:'?legacy=1&page=outlook&symbol=' + job.symbol, ATLAS_RESPONSIVE_OUT:directory, ATLAS_RESPONSIVE_HEADING:'bottom'} : {})};
    entry.command = [process.execPath, ...args];
    console.log(JSON.stringify({event:'gate-start', id:job.id, args}));
    activeChild = spawn(process.execPath, args, {cwd:root, env, detached:true, stdio:['ignore','pipe','pipe']});
    const child = activeChild;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log.write(bytes); process.stdout.write(bytes); });
    let timedOut = false, spawnError = null, killTimer;
    child.once('error', error => { spawnError = error; });
    const timeout = setTimeout(() => {
      timedOut = true; stopGroup(child.pid); killTimer = setTimeout(() => stopGroup(child.pid, 'SIGKILL'), 500);
    }, Math.min(11 * 60 * 1000, deadline - Date.now()));
    const exit = await new Promise(accept => child.once('close', (code, signal) => accept({code, signal})));
    clearTimeout(timeout); clearTimeout(killTimer);
    if (timedOut || interrupted) stopGroup(child.pid, 'SIGKILL');
    activeChild = null;
    await new Promise(accept => log.end(accept));
    entry.exit = exit; entry.timedOut = timedOut;entry.spawnError = spawnError ? String(spawnError) : null;
    const reportBytes = await readFile(resolve(directory, 'report.json'));
    const native = JSON.parse(reportBytes);
    entry.report = {file:'report.json', bytes:reportBytes.length, sha256:sha(reportBytes)};
    entry.actualCases = native.cases?.length; entry.nativeStatus = native.status; entry.failures = native.failures;
    entry.counts = {executed:native.cases?.length || 0, passed:(native.cases || []).filter(item => item.status === 'PASS').length, failed:(native.cases || []).filter(item => item.status === 'FAIL').length};
    const captures = [];
    for (const shot of collectWp6Screenshots(native)) {
      const bytes = await readFile(resolve(directory, shot.file));
      const actual = {file:shot.file, bytes:bytes.length, sha256:sha(bytes), validPngSignature:bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a'};
      assert.equal(actual.bytes, shot.bytes);assert.equal(actual.sha256, shot.sha256);assert.equal(actual.validPngSignature, true);
      actual.width = bytes.readUInt32BE(16);actual.height = bytes.readUInt32BE(20);captures.push(actual);
    }
    const pngBytes = Buffer.from(JSON.stringify({status:'passed',verified:captures.length,captures}, null, 2) + '\n');
    await writeFile(resolve(out, 'screenshots-validation.json'), pngBytes);
    entry.screenshotValidation = {file:'screenshots-validation.json',bytes:pngBytes.length,sha256:sha(pngBytes),verified:captures.length};
    assert.equal(spawnError, null); assert.equal(timedOut, false); assert.equal(exit.code, 0);
    let screenshots;
    if (job.kind === 'responsive') {
      assert.equal(native.kind, 'atlas-responsive-workbench-browser'); assert.equal(native.status, 'passed');
      assert.equal(native.cases.length, 11); assert.deepEqual(native.failures, []);
      assert.ok(native.cases.every(item => item.status === 'passed')); screenshots = native.screenshots;
    } else screenshots = validateWp6Report(native, {phase:'candidate', origin:report.origin, expectedSource});
    for (const shot of screenshots) {
      const bytes = await readFile(resolve(directory, shot.file));
      assert.equal(bytes.length, shot.bytes); assert.equal(sha(bytes), shot.sha256);
      assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    }
    entry.verifiedScreenshots = screenshots.length; entry.status = 'passed';
  } catch (error) { entry.error = String(error.stack || error); }
  entry.finishedAt = new Date().toISOString();
  try {const bytes = await readFile(resolve(out, 'run.log'));entry.log = {file:'run.log',bytes:bytes.length,sha256:sha(bytes)};}catch(error){entry.logError=String(error);}
  await writeFile(resolve(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({event:'gate-end', ...entry}));
}

try {
  await mkdir(out, {recursive:false});
  const originalRunner = 'docs/evidence/chart-h1-20261112/r10-browser-gates.mjs';
  const originalRunnerBytes = await readFile(resolve(root, originalRunner));
  const selfBytes = await readFile(fileURLToPath(import.meta.url));
  report.runner = {file:fileURLToPath(import.meta.url),bytes:selfBytes.length,sha256:sha(selfBytes),original:{file:originalRunner,bytes:originalRunnerBytes.length,sha256:sha(originalRunnerBytes)},adaptation:'One unchanged complete WP6 suite; additional source/log/report/PNG receipts only',deadlines:{wrapperMs:28*60*1000,childMs:11*60*1000}};
  report.runtime = {node:process.version,execPath:process.execPath,platform:process.platform,arch:process.arch,browser:process.env.ATLAS_BROWSER_PATH,browserLauncherSha256:sha(await readFile(process.env.ATLAS_BROWSER_PATH)),requestedDockerPath:'/Applications/Docker.app/Contents/Resources/bin'};
  git(['diff', '--exit-code', 'HEAD', '--', ...harnessFiles]);
  report.harnessBefore = Object.fromEntries(await Promise.all(harnessFiles.map(async file => [file, sha(await readFile(resolve(root, file)))])));
  report.sourceBefore = await candidateSource();
  const identity = Buffer.from(JSON.stringify(report.sourceBefore) + '\n');
  const mime = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.ico':'image/x-icon'};
  server = createServer(async (request, response) => {
    try {
      if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/__wp6-candidate-source.json') {
        assert.deepEqual(await candidateSource(), report.sourceBefore, 'Candidate changed during capture');
        response.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}); response.end(request.method === 'HEAD' ? undefined : identity); return;
      }
      let pathname = url.pathname.startsWith('/bitcoin-cycle-atlas/') ? url.pathname.slice('/bitcoin-cycle-atlas'.length) : url.pathname;
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = await realpath(resolve(dist, '.' + decodeURIComponent(pathname))), rel = relative(dist, file);
      assert.ok(rel !== '..' && !rel.startsWith('..' + sep) && (await stat(file)).isFile());
      const bytes = await readFile(file);
      response.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) { response.writeHead(404); response.end(String(error.message)); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  report.origin = 'http://127.0.0.1:' + server.address().port; report.pid = process.pid;
  console.log(JSON.stringify({event:'loopback-server-ready', pid:process.pid, origin:report.origin, source:report.sourceBefore}));
  const jobs = [{id:'wp6', kind:'wp6', count:30}];
  for (const job of jobs) { if (interrupted || deadline - Date.now() <= 1000) break; await runJob(job); }
  report.sourceAfter = await candidateSource(); assert.deepEqual(report.sourceAfter, report.sourceBefore);
  report.harnessAfter = Object.fromEntries(await Promise.all(harnessFiles.map(async file => [file, sha(await readFile(resolve(root, file)))])));
  assert.deepEqual(report.harnessAfter, report.harnessBefore);
  report.status = !interrupted && report.gates.length === jobs.length && report.gates.every(item => item.status === 'passed') ? 'passed' : 'failed';
} catch (error) { report.error = String(error.stack || error); }
finally {
  stopOwned('SIGKILL');
  if (server?.listening) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
  report.finishedAt = new Date().toISOString(); report.durationMs = Date.now() - started;
  await mkdir(out, {recursive:true}); await writeFile(resolve(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  const summaryBytes = await readFile(resolve(out, 'summary.json'));
  await writeFile(resolve(out, 'summary.sha256.json'), JSON.stringify({file:'summary.json',bytes:summaryBytes.length,sha256:sha(summaryBytes)}, null, 2) + '\n');
  console.log(JSON.stringify({event:'bundle-end', status:report.status, gates:report.gates.length, durationMs:report.durationMs, output:out}));
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
