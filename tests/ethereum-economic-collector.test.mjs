import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repo = fileURLToPath(new URL('..', import.meta.url));
const collector = join(repo, 'scripts/capture-ethereum-economic-data.mjs');
const sourcePaths = [
  'scripts/capture-ethereum-economic-data.mjs',
  'dist/ethereum-economic-data.js',
  'dist/ethereum-economic-model.js',
];
// Synthetic subprocess fixtures: no source or license bytes are fetched.
const bootstrap = String.raw`
import { appendFileSync } from 'node:fs';
const mode = process.env.ETH_COLLECTOR_TEST_MODE;
const realSetTimeout = globalThis.setTimeout;
if (mode === 'timeout') {
  // Only this synthetic child uses a shortened acquisition timer.
  globalThis.setTimeout = (callback, delay, ...args) =>
    realSetTimeout(callback, delay === 45000 ? 25 : delay, ...args);
}
globalThis.fetch = async (url, options = {}) => {
  appendFileSync('synthetic-requests.jsonl', JSON.stringify({
    synthetic: true, mode, url, calledAt: new Date().toISOString(),
  }) + '\n');
  if (mode === 'http503') {
    return { ok: false, status: 503, url, headers: new Headers(), body: null };
  }
  if (mode === 'overflow') {
    return {
      ok: true, status: 200, url, headers: new Headers(),
      body: new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array(290));
        controller.close();
      } }),
    };
  }
  if (mode !== 'timeout' && mode !== 'sigterm') throw new Error('Unexpected fixture mode');
  const pending = new Promise((resolve, reject) => {
    if (options.signal?.aborted) reject(options.signal.reason);
    else options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  if (mode === 'sigterm') process.stdout.write('SYNTHETIC_FETCH_READY\n');
  return pending;
};
`;

async function runSynthetic(mode) {
  const dir = await mkdtemp(join(tmpdir(), 'eth-collector-fixture-'));
  let child;
  try {
    const hashes = {};
    for (const path of sourcePaths) {
      const bytes = await readFile(join(repo, path));
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), bytes);
      hashes[path] = createHash('sha256').update(bytes).digest('hex');
    }
    const git = args => execFileSync('git', args, {
      cwd: dir, encoding: 'utf8', timeout: 5000, stdio: 'pipe',
    }).trim();
    git(['init', '--quiet']);
    git(['add', '--', ...sourcePaths]);
    git(['-c', 'user.name=Synthetic Collector Fixture',
      '-c', 'user.email=collector-fixture@example.invalid',
      'commit', '--quiet', '-m', 'Synthetic collector failure fixture']);
    const fixtureCommit = git(['rev-parse', 'HEAD']);
    const bootstrapPath = join(dir, 'synthetic-bootstrap.mjs');
    await writeFile(bootstrapPath, bootstrap);
    const asOf = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    child = spawn(process.execPath, [
      '--import', pathToFileURL(bootstrapPath).href, collector, '--as-of', asOf,
    ], {
      cwd: dir,
      env: {
        ...process.env, ETH_COLLECTOR_TEST_MODE: mode,
        GITHUB_RUN_ID: 'synthetic-no-network-fixture',
        GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'fixture/collector-no-network',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', sentTermination = false;
    const result = await new Promise((resolve, reject) => {
      const watchdog = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Synthetic collector exceeded 10 seconds'));
      }, 10000);
      child.stdout.on('data', chunk => {
        stdout += chunk;
        if (mode === 'sigterm' && !sentTermination &&
            stdout.includes('SYNTHETIC_FETCH_READY')) {
          sentTermination = true;
          child.kill('SIGTERM');
        }
      });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', error => { clearTimeout(watchdog); reject(error); });
      child.once('close', (code, signal) => {
        clearTimeout(watchdog);
        resolve({ code, signal });
      });
    });
    const root = join(dir, 'build/ethereum-economic-data');
    const captures = await readdir(root);
    assert.equal(captures.length, 1);
    const capture = join(root, captures[0]);
    const files = await readdir(capture);
    const json = async name => JSON.parse(await readFile(join(capture, name), 'utf8'));
    const started = await json('started.json');
    const receipt = await json('receipt.json');
    const netFiles = files.filter(name => /^network-/.test(name));
    assert.deepEqual(netFiles, ['network-1-license.json']);
    const network = await json(netFiles[0]);
    const requests = (await readFile(join(dir, 'synthetic-requests.jsonl'), 'utf8'))
      .trim().split('\n').map(line => JSON.parse(line));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].synthetic, true);
    assert.match(requests[0].url, /^https:\/\/raw\.githubusercontent\.com\/coinmetrics\/data\/[a-f0-9]{40}\/LICENSE$/);
    assert.equal(network.attempts, 1);
    assert.equal(network.timeoutMs, 45000);
    assert.equal(started.status, 'started');
    assert.equal(receipt.sourceCommit, fixtureCommit);
    assert.deepEqual(receipt.sourceHashes, hashes);
    assert.equal(receipt.runId, 'synthetic-no-network-fixture');
    assert.deepEqual([receipt.publishedAt, receipt.historicalPointInTimeReady,
      receipt.fullModelSnapshotReady, receipt.eligibleModelSnapshotCount], [null, false, false, 0]);
    assert.equal(Object.hasOwn(receipt, 'summary'), false);
    for (const name of ['coinmetrics-eth.csv', 'capture.json', 'coverage.json'])
      assert.equal(files.includes(name), false);
    assert.ok(Date.parse(network.finishedAt) >= Date.parse(network.startedAt));
    assert.ok(Date.parse(receipt.finishedAt) >= Date.parse(receipt.startedAt));
    const log = stdout.split('\n').find(line => line.startsWith('ETH_ECONOMIC_SOURCE_FAILURE '));
    assert.ok(log);
    assert.deepEqual(JSON.parse(log.slice('ETH_ECONOMIC_SOURCE_FAILURE '.length)), receipt);
    assert.equal(stdout.includes('ETH_ECONOMIC_SOURCE_RECEIPT '), false);
    assert.equal(stderr, '');
    return { ...result, receipt, network, sentTermination };
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
}

for (const c of [
  { mode: 'http503', title: 'HTTP 503 is recorded without retry',
    status: 'failed', code: 1, bytes: 0, error: /HTTP 503/ },
  { mode: 'overflow', title: 'byte overflow stops before hash acceptance',
    status: 'failed', code: 1, bytes: 290, error: /byte bound/ },
  { mode: 'timeout', title: 'delayed fetch aborts through the timeout path',
    status: 'timeout', code: 1, bytes: 0, error: /exceeded 45000 ms/ },
  { mode: 'sigterm', title: 'SIGTERM records cancellation',
    status: 'cancelled', code: 143, bytes: 0, error: /SIGTERM/ },
]) {
  test('synthetic collector: ' + c.title, { timeout: 20000 }, async () => {
    const r = await runSynthetic(c.mode);
    assert.equal(r.code, c.code);
    assert.equal(r.signal, null);
    assert.equal(r.receipt.status, c.status);
    assert.equal(r.network.status, c.status);
    assert.equal(r.network.receivedBytes, c.bytes);
    assert.match(r.receipt.error, c.error);
    if (c.mode === 'http503') assert.equal(r.network.httpStatus, 503);
    if (c.mode === 'overflow') assert.equal(Object.hasOwn(r.network, 'actualGitBlobSha'), false);
    if (c.mode === 'sigterm') {
      assert.equal(r.sentTermination, true);
      assert.equal(r.receipt.signal, 'SIGTERM');
    }
  });
}
