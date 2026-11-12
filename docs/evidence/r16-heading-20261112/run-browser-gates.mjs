#!/usr/bin/env node
// Temporary runner only: committed repository scripts and bytes are read unchanged.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createWriteStream} from 'node:fs';
import {readFile, readlink, mkdir, realpath, stat, writeFile} from 'node:fs/promises';
import {resolve, relative, sep, extname} from 'node:path';
import {pathToFileURL} from 'node:url';

const [repository, expectedSource, output = 'build/r16/browser-gates'] = process.argv.slice(2);
assert.ok(repository, 'Usage: node /tmp/r10-browser-gates.mjs REPO FULL_SOURCE_SHA [OUT]');
assert.match(expectedSource || '', /^[a-f0-9]{40}$/);
assert.ok(process.env.ATLAS_BROWSER_PATH, 'Use the same ATLAS_BROWSER_PATH/font environment as the 53-case suite');
const root = resolve(repository), dist = resolve(root, 'dist'), out = resolve(root, output);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
const {validateWp6CandidateSource, validateWp6Report} = await import(pathToFileURL(resolve(root, 'scripts/verify-wp6-cloudflare.mjs')));
const harnessFiles = ['scripts/verify-responsive-workbench-browser.mjs', 'scripts/verify-wp6-browser.mjs', 'scripts/verify-wp6-cloudflare.mjs', 'scripts/verify-chart-qa-metrics.mjs'];
const started = Date.now(), deadline = started + 28 * 60 * 1000;
const report = {kind:'r16-local-candidate-ui-gates', productionDeployment:false, sourceCommit:expectedSource, startedAt:new Date(started).toISOString(), status:'failed', gates:[]};
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
  const directory = resolve(out, job.id); await mkdir(directory, {recursive:true});
  const entry = {id:job.id, expectedCases:job.count, startedAt:new Date().toISOString(), status:'failed'}; report.gates.push(entry);
  try {
    assert.ok(!interrupted && deadline - Date.now() > 1000, 'Run interrupted or time budget exhausted');
    const log = createWriteStream(resolve(directory, 'run.log'));
    const args = job.kind === 'responsive' ? ['scripts/verify-responsive-workbench-browser.mjs'] :
      ['scripts/verify-wp6-browser.mjs', '--suite', job.kind, '--phase', 'candidate', '--origin', report.origin, '--expected-source', expectedSource, '--out', directory];
    const env = {...process.env, ...(job.kind === 'responsive' ? {ATLAS_RESPONSIVE_BASE_URL:report.origin + '/bitcoin-cycle-atlas/',
      ATLAS_RESPONSIVE_QUERY:'?legacy=1&page=outlook&symbol=' + job.symbol, ATLAS_RESPONSIVE_OUT:directory, ATLAS_RESPONSIVE_HEADING:'bottom'} : {})};
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
    entry.exit = exit; entry.timedOut = timedOut;
    const native = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    entry.actualCases = native.cases?.length; entry.nativeStatus = native.status; entry.failures = native.failures;
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
  await writeFile(resolve(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({event:'gate-end', ...entry}));
}

try {
  await mkdir(out, {recursive:true});
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
  const jobs = [...['BTCUSD','ETHUSD','MSTR','BMNR'].map(symbol => ({id:'responsive-' + symbol, kind:'responsive', symbol, count:11})),
    {id:'chart-qa', kind:'chart-qa', count:12}];
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
  console.log(JSON.stringify({event:'bundle-end', status:report.status, gates:report.gates.length, durationMs:report.durationMs, output:out}));
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
