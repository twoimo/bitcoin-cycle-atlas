/**
 * GitHub-only research acquisition. No API key, account or paid service is used.
 * This script collects an immutable observation receipt, never a ready 25-metric
 * economic snapshot and never a historical publication/collection claim.
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  COIN_METRICS_ETH_ARCHIVE,
  captureCoinMetricsEthArchive,
} from '../dist/ethereum-economic-data.js';

const VERSION = 'eth-economic-github-collector-1';
const SOURCE = COIN_METRICS_ETH_ARCHIVE;
const LICENSE_URL = 'https://raw.githubusercontent.com/coinmetrics/data/' + SOURCE.commit + '/LICENSE';
const ALLOWED_URLS = new Set([SOURCE.rawUrl, LICENSE_URL]);
const TIMEOUT_MS = 45000;
const DAY_MS = 86400000;
const now = () => new Date().toISOString();
const errorText = error => String(error?.message ?? error).slice(0, 800);
const hash = (name, bytes) => createHash(name).update(bytes).digest('hex');
const gitBlobHash = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const cancelled = new AbortController();
let signalName = null;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  signalName = signal;
  cancelled.abort(new Error('Collection cancelled by ' + signal));
});
const requireNotCancelled = () => {
  if (cancelled.signal.aborted) throw cancelled.signal.reason;
};
const args = process.argv.slice(2);
let asOf, asOfPolicy;
if (args.length === 0) {
  asOf = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  asOfPolicy = 'last-completed-UTC-day-at-collector-start';
} else if (args.length === 2 && args[0] === '--as-of') {
  asOf = args[1];
  asOfPolicy = 'explicit-cli-day';
} else {
  throw new TypeError('Usage: node scripts/capture-ethereum-economic-data.mjs [--as-of YYYY-MM-DD]');
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    !Number.isFinite(Date.parse(asOf + 'T00:00:00.000Z')) ||
    new Date(asOf + 'T00:00:00.000Z').toISOString().slice(0, 10) !== asOf) {
  throw new RangeError('Invalid as-of UTC day');
}
if (Date.parse(asOf + 'T00:00:00.000Z') + DAY_MS > Date.now()) throw new RangeError('The as-of UTC day has not completed');

const outputRoot = resolve('build/ethereum-economic-data');
await mkdir(outputRoot, { recursive: true });
// Each execution gets a new directory. Existing captures are never overwritten.
const captureDirectory = await mkdtemp(join(outputRoot, 'capture-'));
const outputRelative = relative(process.cwd(), captureDirectory).split('\\').join('/');
const writeJson = (name, value) => writeFile(join(captureDirectory, name), JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8', timeout: 10000 }).trim();
const network = [];
const startedAt = now();
const receipt = {
  version: VERSION, status: 'started', startedAt, asOf, asOfPolicy,
  outputDirectory: outputRelative,
  sourceCommit: null, sourceTree: null, sourceHashes: {},
  runId: process.env.GITHUB_RUN_ID ?? null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  repository: process.env.GITHUB_REPOSITORY ?? null,
  source: {
    repository: SOURCE.repository, commit: SOURCE.commit, path: SOURCE.path,
    expectedGitBlobSha: SOURCE.gitBlobSha, expectedBytes: SOURCE.bytes,
    license: SOURCE.license, attribution: SOURCE.attribution,
    licenseUrl: SOURCE.licenseUrl, expectedLicenseGitBlobSha: SOURCE.licenseGitBlobSha,
    definitionCommit: SOURCE.definitionCommit,
    repositoryCommitTimestamp: SOURCE.repositoryCommitTimestamp,
  },
  publishedAt: null,
  historicalPointInTimeReady: false,
  fullModelSnapshotReady: false,
  eligibleModelSnapshotCount: 0,
  network,
};
await writeJson('started.json', receipt);

async function fetchPinned(url, { expectedBytes, expectedGitBlobSha, name }) {
  if (!ALLOWED_URLS.has(url)) throw new TypeError('Unapproved acquisition URL');
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'raw.githubusercontent.com' ||
      parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new TypeError('Only the two pinned public GitHub raw URLs are allowed');
  }
  requireNotCancelled();
  const controller = new AbortController();
  const relay = () => controller.abort(cancelled.signal.reason);
  cancelled.signal.addEventListener('abort', relay, { once: true });
  let timeoutExpired = false, reader = null;
  const record = {
    name, url, expectedBytes, expectedGitBlobSha,
    startedAt: now(), bodyReceivedAt: null, finishedAt: null,
    timeoutMs: TIMEOUT_MS, redirectPolicy: 'error', attempts: 1,
    receivedBytes: 0, httpStatus: null, status: 'started',
  };
  network.push(record);
  const timer = setTimeout(() => {
    timeoutExpired = true;
    controller.abort(new Error('Pinned GitHub download exceeded ' + TIMEOUT_MS + ' ms'));
  }, TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal, cache: 'no-store' });
    record.httpStatus = response.status;
    record.responseHeaders = Object.fromEntries(['content-type', 'content-length', 'etag', 'last-modified', 'date']
      .map(key => [key, response.headers.get(key)?.slice(0, 1024) ?? null]));
    if (!response.ok) throw new Error('Pinned GitHub source returned HTTP ' + response.status);
    if (response.url !== url) throw new Error('Pinned GitHub response URL changed');
    if (!response.body) throw new Error('Pinned GitHub response has no body');
    reader = response.body.getReader();
    const chunks = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      record.receivedBytes += part.value.byteLength;
      if (record.receivedBytes > expectedBytes) throw new RangeError('Pinned source exceeds the expected byte bound');
      chunks.push(Buffer.from(part.value));
    }
    record.bodyReceivedAt = now();
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== expectedBytes) throw new RangeError('Pinned source byte length mismatch');
    const actualGitBlobSha = gitBlobHash(bytes);
    record.actualGitBlobSha = actualGitBlobSha;
    record.sourceSha256 = hash('sha256', bytes);
    if (actualGitBlobSha !== expectedGitBlobSha) throw new Error('Pinned source Git blob hash mismatch');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('UTF-8 round trip changed the captured bytes');
    requireNotCancelled();
    record.status = 'verified';
    return { bytes, text, record };
  } catch (error) {
    controller.abort(error);
    record.status = signalName ? 'cancelled' : timeoutExpired ? 'timeout' : 'failed';
    record.error = errorText(error);
    if (reader) void reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    cancelled.signal.removeEventListener('abort', relay);
    record.finishedAt = now();
    await writeJson('network-' + network.length + '-' + name + '.json', record);
  }
}

try {
  receipt.sourceCommit = git('rev-parse', 'HEAD');
  receipt.sourceTree = git('rev-parse', 'HEAD^{tree}');
  if (!/^[0-9a-f]{40}$/.test(receipt.sourceCommit) || !/^[0-9a-f]{40}$/.test(receipt.sourceTree)) throw new Error('Invalid checkout identity');
  if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('Tracked checkout must be clean before economic acquisition');
  for (const path of [
    'scripts/capture-ethereum-economic-data.mjs',
    'dist/ethereum-economic-data.js',
    'dist/ethereum-economic-model.js',
  ]) receipt.sourceHashes[path] = hash('sha256', await readFile(path));

  const license = await fetchPinned(LICENSE_URL, {
    expectedBytes: 289, expectedGitBlobSha: SOURCE.licenseGitBlobSha, name: 'license',
  });
  await writeFile(join(captureDirectory, 'LICENSE.coinmetrics.txt'), license.bytes, { flag: 'wx' });
  const csv = await fetchPinned(SOURCE.rawUrl, {
    expectedBytes: SOURCE.bytes, expectedGitBlobSha: SOURCE.gitBlobSha, name: 'eth-csv',
  });
  requireNotCancelled();
  await writeFile(join(captureDirectory, 'coinmetrics-eth.csv'), csv.bytes, { flag: 'wx' });
  const capture = await captureCoinMetricsEthArchive(csv.text, {
    captureStartedAt: csv.record.startedAt,
    collectedAt: csv.record.bodyReceivedAt,
    asOf,
  });
  if (capture.source.sourceSha256 !== csv.record.sourceSha256) throw new Error('Independent capture SHA-256 mismatch');
  if (capture.coverage.fullModelSnapshotReady !== false ||
      capture.coverage.eligibleModelSnapshotCount !== 0 ||
      capture.coverage.modelSnapshots.length !== 0 ||
      capture.publishedAt !== null) throw new Error('Partial archive must not activate the full economic model');
  requireNotCancelled();
  await writeJson('capture.json', capture);
  await writeJson('coverage.json', capture.coverage);
  await writeFile(join(captureDirectory, 'ATTRIBUTION.md'), [
    '# Coin Metrics research source capture',
    '',
    'Source: Coin Metrics, Inc. — ' + SOURCE.sourceUrl,
    'License: ' + SOURCE.license + ' — ' + SOURCE.licenseUrl,
    'The original source and license bytes are preserved in this directory.',
    'Data is an unchanged pinned archive. capture.json and coverage.json are derived parsing and accounting assessments.',
    'No commercial-use license, historical collection, publication time or complete 25-metric model input is asserted.',
    '',
  ].join('\n'), { encoding: 'utf8', flag: 'wx' });
  receipt.status = 'success';
  receipt.captureStartedAt = capture.captureStartedAt;
  receipt.collectedAt = capture.collectedAt;
  receipt.sourceSha256 = capture.source.sourceSha256;
  receipt.vintageId = capture.vintageId;
  receipt.summary = {
    rawRows: capture.parsed.rawRowCount,
    completeRawMetricRows: capture.parsed.completeRawMetricRows,
    firstDate: capture.parsed.firstDate,
    lastDate: capture.parsed.lastDate,
    missingByField: capture.parsed.missingByField,
    sourceStatus: capture.coverage.sourceStatus,
    requestedWindowComplete: capture.coverage.requestedWindow.completeWindow,
    requestedWindowMissingDates: capture.coverage.requestedWindow.missingDates,
    latestCompleteWindow: capture.coverage.latestCompleteWindow,
    staleDays: capture.coverage.staleDays,
    freshness: capture.coverage.freshness,
    requiredMetricCount: capture.coverage.requiredMetricCount,
    definitionMatchedMetricCount: capture.coverage.definitionMatchedMetricCount,
    unavailableMetricIds: capture.coverage.requirements.filter(r => r.status !== 'available').map(r => r.metric),
    blockers: capture.coverage.blockers,
  };
} catch (error) {
  receipt.status = signalName ? 'cancelled' : network.some(r => r.status === 'timeout') ? 'timeout' : 'failed';
  receipt.error = errorText(error);
  receipt.signal = signalName;
  process.exitCode = signalName === 'SIGINT' ? 130 : signalName === 'SIGTERM' ? 143 : 1;
} finally {
  if (signalName) {
    receipt.status = 'cancelled';
    receipt.signal = signalName;
    process.exitCode = signalName === 'SIGINT' ? 130 : 143;
  }
  receipt.finishedAt = now();
  receipt.durationMs = Date.parse(receipt.finishedAt) - Date.parse(startedAt);
  await writeJson('receipt.json', receipt);
  const prefix = receipt.status === 'success' ? 'ETH_ECONOMIC_SOURCE_RECEIPT ' : 'ETH_ECONOMIC_SOURCE_FAILURE ';
  console.log(prefix + JSON.stringify(receipt));
}
