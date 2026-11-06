#!/usr/bin/env node
// Join only complete evidence produced for the same checked-out source and run.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEthBrowserCaseSpecs} from './eth-browser-case-specs.mjs';

// The original workflow's explicit model upload scope, excluding browser/review
// packets and this receipt. Do not replace this with a recursive build/ upload.
export const ETH_MODEL_ARTIFACT_PATHS = Object.freeze([
  'build/ethereum-model-readiness.json',
  'build/ethereum-source-timing.json',
  'build/ethereum-interval-controls.json',
  'build/ethereum-warm-start.json',
  'build/ethereum-common-cohort.json',
  'build/ethereum-economic-evidence-coverage.json',
  'build/ethereum-economic-vintages',
  'build/ethereum-supply-accounting',
  'build/ethereum-supply-resolution.json',
  'build/ethereum-staking-cohort',
  'build/ethereum-independent-calibration.json',
  'build/ethereum-prospective-calibration-readiness.json',
  'build/ethereum-prospective-capacity.json',
  'build/ethereum-base-rollover',
  'build/ethereum-prospective-ledger',
  'build/ethereum-prospective-archive',
  'build/ethereum-prospective-archive-outcomes',
  'build/ethereum-prospective-archive-remote-receipt.json',
  'build/ethereum-prospective-archive-active.json',
  'build/ethereum-prospective-archive-evaluation.json',
  'build/ethereum-prospective-archive-restore.json',
  'build/ethereum-prospective-archive-append.json',
  'build/ethereum-prospective-archive-verify.json',
  'build/ethereum-monte-carlo-stability.json',
  'build/ethereum-pooled-research.json',
  'build/ethereum-throughput-supplement',
  'build/ethereum-pow-zero',
  'build/ethereum-adaptive-research.json',
  'build/ethereum-model-comparison.json',
  'build/ethereum-economic-ablation.json',
  'build/ethereum-economic-data',
  'build/asset-forecast-ledger',
  'build/asset-outcome-ledger'
]);
export const ETH_MODEL_HANDOFF_PATH = 'build/eth-model-handoff.json';
export const ETH_JOINED_HANDOFF_PATH = 'build/eth-evidence-joined.json';
const BROWSER_REPORT_PATH = 'build/eth-browser/report.json';
const requiredBrowserSources = [
  'dist/index.html',
  'scripts/verify-eth-candidate-browser.mjs',
  'scripts/eth-browser-case-specs.mjs',
  'scripts/verify-workspace-browser.mjs',
  'scripts/verify-forecast-replay-browser.mjs',
  'scripts/verify-chart-replay-browser.mjs',
  'scripts/verify-consolidated-workspace-browser.mjs'
];
const defaultRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const positiveInteger = (value, label) => {
  assert.equal(typeof value, 'string', `${label} must be provided`);
  assert.match(value, /^[1-9]\d*$/, `${label} must be a positive decimal integer`);
  return value;
};

function safePath(path) {
  assert.equal(typeof path, 'string', 'Evidence path must be a string');
  assert.ok(path && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path), 'Unsafe evidence path');
  assert.ok(!path.startsWith('/') && path.split('/').every(part => !['', '.', '..', '.git'].includes(part)), `Unsafe evidence path: ${path}`);
  return path;
}

async function evidenceStat(root, path) {
  const parts = safePath(path).split('/');
  let current = root;
  let info;
  for (const part of parts) {
    current = resolve(current, part);
    info = await lstat(current);
    assert.ok(!info.isSymbolicLink(), `Evidence symlink is not allowed: ${path}`);
  }
  return info;
}

async function fileReceipt(root, path) {
  const info = await evidenceStat(root, path);
  assert.ok(info.isFile(), `Evidence must be a regular file: ${path}`);
  const bytes = await readFile(resolve(root, path));
  return {path, sha256: sha256(bytes), bytes: bytes.length};
}

async function inventoryModelFiles(root) {
  const files = [];
  const directories = [];
  async function visit(path) {
    const info = await evidenceStat(root, path);
    if (info.isFile()) files.push(await fileReceipt(root, path));
    else {
      assert.ok(info.isDirectory(), `Unexpected evidence file type: ${path}`);
      directories.push(path);
      const entries = (await readdir(resolve(root, path))).sort();
      for (const name of entries) await visit(`${path}/${name}`);
    }
  }
  for (const path of ETH_MODEL_ARTIFACT_PATHS) {
    const info = await evidenceStat(root, path);
    assert.ok(path.endsWith('.json') ? info.isFile() : info.isDirectory(), `Wrong model artifact type: ${path}`);
    await visit(path);
  }
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return {files, directories: directories.sort()};
}

async function verifyModelInventory(root, model) {
  assert.ok(Array.isArray(model.files) && Array.isArray(model.directories), 'Model inventory is missing');
  const directoryRoots = ETH_MODEL_ARTIFACT_PATHS.filter(path => !path.endsWith('.json'));
  const directoryRootFor = path => directoryRoots.find(base => path === base || path.startsWith(`${base}/`));
  assert.deepEqual(model.directories, [...new Set(model.directories)].sort(), 'Model directory inventory must be unique and ordered');
  for (const path of model.directories) {
    safePath(path);
    const base = directoryRootFor(path);
    assert.ok(base, `Directory outside the original model artifact scope: ${path}`);
    assert.ok(path === base || model.directories.includes(path.slice(0, path.lastIndexOf('/'))), `Missing parent directory receipt: ${path}`);
  }
  for (const base of directoryRoots) assert.ok(model.directories.includes(base), `Missing model root directory receipt: ${base}`);
  for (const file of model.files) {
    const path = safePath(file.path);
    const base = directoryRootFor(path);
    assert.ok(base || ETH_MODEL_ARTIFACT_PATHS.includes(path), `File outside the original model artifact scope: ${path}`);
    if (base) assert.ok(model.directories.includes(path.slice(0, path.lastIndexOf('/'))), `Missing file parent directory receipt: ${path}`);
    assert.deepEqual(await fileReceipt(root, path), file, `Model artifact hash/bytes mismatch: ${path}`);
  }
  for (const path of ETH_MODEL_ARTIFACT_PATHS.filter(path => path.endsWith('.json'))) {
    assert.ok(model.files.some(file => file.path === path), `Missing required model file receipt: ${path}`);
  }
  // Artifact transport drops empty directories. Recreate only directories from
  // the authenticated producer inventory, after checking every preserved file.
  for (const path of model.directories) {
    try {
      assert.ok((await evidenceStat(root, path)).isDirectory(), `Expected evidence directory: ${path}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      assert.ok(!model.files.some(file => file.path.startsWith(`${path}/`)), `Missing nonempty model directory: ${path}`);
      await mkdir(resolve(root, path));
    }
  }
  const actual = await inventoryModelFiles(root);
  assert.deepEqual(model.files, actual.files, 'Model artifact inventory/hash/bytes mismatch');
  assert.deepEqual(model.directories, actual.directories, 'Model directory inventory mismatch');
  return actual;
}

function sourceIdentity(root, env) {
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  const sourceCommit = git('rev-parse', 'HEAD');
  const sourceTree = git('rev-parse', 'HEAD^{tree}');
  assert.match(sourceCommit, /^[0-9a-f]{40}$/, 'Invalid source commit');
  assert.match(sourceTree, /^[0-9a-f]{40}$/, 'Invalid source tree');
  assert.equal(env.ETH_EVIDENCE_SOURCE_SHA, sourceCommit, 'Checkout must match the requested PR head');
  // GITHUB_SHA is the synthetic merge ref for pull_request workflows, not HEAD.
  assert.equal(git('diff', '--name-only', 'HEAD', '--'), '', 'Tracked sources changed after checkout');
  return {
    sourceCommit, sourceTree,
    runId: positiveInteger(env.GITHUB_RUN_ID, 'GITHUB_RUN_ID'),
    runAttempt: positiveInteger(env.GITHUB_RUN_ATTEMPT, 'GITHUB_RUN_ATTEMPT')
  };
}

function producerIdentity(kind, current, env) {
  const prefix = `ETH_EVIDENCE_${kind.toUpperCase()}_`;
  const sourceCommit = env[`${prefix}SOURCE_SHA`];
  const sourceTree = env[`${prefix}SOURCE_TREE`];
  const runId = positiveInteger(env[`${prefix}RUN_ID`], `${prefix}RUN_ID`);
  const runAttempt = positiveInteger(env[`${prefix}RUN_ATTEMPT`], `${prefix}RUN_ATTEMPT`);
  const artifactId = positiveInteger(env[`${prefix}ARTIFACT_ID`], `${prefix}ARTIFACT_ID`);
  assert.equal(sourceCommit, current.sourceCommit, `${kind} producer commit does not match checkout`);
  assert.equal(sourceTree, current.sourceTree, `${kind} producer tree does not match checkout`);
  assert.equal(runId, current.runId, `${kind} producer belongs to a different workflow run`);
  assert.ok(BigInt(runAttempt) <= BigInt(current.runAttempt), `${kind} producer attempt is in the future`);
  return {sourceCommit, sourceTree, runId, runAttempt, artifactId};
}

async function readEvidenceJson(root, path) {
  const receipt = await fileReceipt(root, path);
  return {value: JSON.parse(await readFile(resolve(root, path), 'utf8')), receipt};
}

async function writeEvidenceJson(root, path, value) {
  await mkdir(dirname(resolve(root, path)), {recursive: true});
  await writeFile(resolve(root, path), JSON.stringify(value, null, 2) + '\n');
}

export async function captureModelEvidence({root = defaultRoot, env = process.env} = {}) {
  root = resolve(root);
  const identity = sourceIdentity(root, env);
  const {files, directories} = await inventoryModelFiles(root);
  assert.deepEqual(sourceIdentity(root, env), identity, 'Source identity changed during capture');
  const receipt = {
    schemaVersion: 1, kind: 'eth-model-evidence-handoff', ...identity,
    artifactPaths: [...ETH_MODEL_ARTIFACT_PATHS], files, directories
  };
  await writeEvidenceJson(root, ETH_MODEL_HANDOFF_PATH, receipt);
  return receipt;
}

async function verifyBrowserEvidence(root, current) {
  const {value: report, receipt: reportReceipt} = await readEvidenceJson(root, BROWSER_REPORT_PATH);
  assert.equal(report.schemaVersion, 1, 'Unknown browser report schema');
  assert.equal(report.kind, 'eth-candidate-real-browser', 'Wrong browser report kind');
  assert.equal(report.sourceCommit, current.sourceCommit, 'Browser report belongs to a different commit');
  assert.equal(report.status, 'passed', 'Browser report is not complete and passed');
  assert.equal(report.caseScope, 'all', 'Browser report must cover the entire declared scope');
  assert.deepEqual(report.failures, [], 'Browser report contains failures');
  assert.ok(!report.error && !report.cleanupError, 'Browser report contains an execution/cleanup error');
  assert.ok(typeof report.finishedAt === 'string' && Number.isFinite(Date.parse(report.finishedAt)), 'Browser report has no completion time');
  const expectedCases = createEthBrowserCaseSpecs();
  assert.equal(report.declaredCaseCount, expectedCases.length, 'Browser declared case count changed');
  assert.equal(report.expectedCaseCount, expectedCases.length, 'Browser expected case count is incomplete');
  assert.ok(Array.isArray(report.cases), 'Browser cases are missing');
  assert.equal(report.cases.length, expectedCases.length, 'Browser actual case count is incomplete');
  const resultFields = new Set(['consolidated', 'replay', 'chartReplay', 'resize']);
  const screenshotFiles = new Map();
  for (const [index, expected] of expectedCases.entries()) {
    const actual = report.cases[index];
    assert.ok(actual && typeof actual === 'object', `Missing browser case ${index}`);
    assert.deepEqual(actual.caseSpec, expected, `Browser case identity/order mismatch at ${index}`);
    for (const [key, value] of Object.entries(expected)) {
      if (!resultFields.has(key)) assert.deepEqual(actual[key], value, `Browser case ${index} changed ${key}`);
    }
    assert.equal(actual.status, 'passed', `Browser case ${index} did not pass`);
    assert.ok(!actual.error && !actual.screenshotFailure, `Browser case ${index} contains an error`);
    assert.deepEqual(actual.runtimeErrors, [], `Browser case ${index} contains runtime errors`);
    assert.deepEqual(actual.unscopedLocalRequests, [], `Browser case ${index} contains requests outside the project root`);
    assert.deepEqual(actual.unexpectedResourceErrors, [], `Browser case ${index} contains unexpected resource errors`);
    assert.ok(Array.isArray(actual.screenshots) && actual.screenshots.length > 0, `Browser case ${index} has no screenshots`);
    for (const shot of actual.screenshots) {
      safePath(shot.file);
      assert.ok(shot.file.endsWith('.png'), 'Browser screenshot must be a PNG');
      assert.match(shot.sha256, /^[0-9a-f]{64}$/, 'Invalid screenshot hash');
      assert.ok(Number.isSafeInteger(shot.bytes) && shot.bytes > 0, 'Invalid screenshot byte count');
      const actualFile = await fileReceipt(root, `build/eth-browser/${shot.file}`);
      assert.equal(actualFile.sha256, shot.sha256, `Screenshot hash mismatch: ${shot.file}`);
      assert.equal(actualFile.bytes, shot.bytes, `Screenshot byte count mismatch: ${shot.file}`);
      screenshotFiles.set(shot.file, actualFile);
    }
  }
  assert.ok(report.sourceHashes && typeof report.sourceHashes === 'object' && !Array.isArray(report.sourceHashes), 'Browser source hashes are missing');
  for (const path of requiredBrowserSources) assert.ok(Object.hasOwn(report.sourceHashes, path), `Missing browser source identity: ${path}`);
  const sources = Object.entries(report.sourceHashes);
  assert.equal(report.sourceIntegrity?.checkedFiles, sources.length, 'Browser source integrity count is incomplete');
  assert.equal(report.sourceIntegrity?.unchangedDuringRun, true, 'Browser sources changed during execution');
  assert.deepEqual(report.sourceIntegrity?.changedSources, [], 'Browser reported changed sources');
  for (const [path, hash] of sources) {
    assert.match(hash, /^[0-9a-f]{64}$/, `Invalid browser source hash: ${path}`);
    assert.equal((await fileReceipt(root, path)).sha256, hash, `Browser source hash mismatch: ${path}`);
  }
  assert.ok(report.syntheticFixture, 'Browser synthetic fixture receipt is missing');
  const fixture = report.syntheticFixture;
  const fixtureFile = await fileReceipt(root, `build/eth-browser/${safePath(fixture.file)}`);
  assert.equal(fixtureFile.sha256, fixture.sha256, 'Browser synthetic fixture hash mismatch');
  assert.equal(fixtureFile.bytes, fixture.bytes, 'Browser synthetic fixture byte count mismatch');
  return {reportReceipt, caseCount: expectedCases.length, sourceFileCount: sources.length, screenshotFileCount: screenshotFiles.size};
}

export async function verifyJoinedEvidence({root = defaultRoot, env = process.env} = {}) {
  root = resolve(root);
  const current = sourceIdentity(root, env);
  const modelProducer = producerIdentity('model', current, env);
  const browserProducer = producerIdentity('browser', current, env);
  assert.notEqual(modelProducer.artifactId, browserProducer.artifactId, 'Model and browser artifacts must be distinct');
  const {value: model, receipt: modelReceipt} = await readEvidenceJson(root, ETH_MODEL_HANDOFF_PATH);
  assert.equal(model.schemaVersion, 1, 'Unknown model handoff schema');
  assert.equal(model.kind, 'eth-model-evidence-handoff', 'Wrong model handoff kind');
  for (const key of ['sourceCommit', 'sourceTree', 'runId', 'runAttempt']) assert.equal(model[key], modelProducer[key], `Model handoff ${key} does not match producer`);
  assert.deepEqual(model.artifactPaths, ETH_MODEL_ARTIFACT_PATHS, 'Model artifact scope changed');
  const modelInventory = await verifyModelInventory(root, model);
  const browser = await verifyBrowserEvidence(root, current);
  assert.deepEqual(sourceIdentity(root, env), current, 'Source identity changed during verification');
  const joined = {
    schemaVersion: 1, kind: 'eth-evidence-joined', status: 'passed', ...current,
    model: {...modelProducer, receipt: modelReceipt, fileCount: modelInventory.files.length, directoryCount: modelInventory.directories.length},
    browser: {...browserProducer, ...browser}
  };
  await writeEvidenceJson(root, ETH_JOINED_HANDOFF_PATH, joined);
  return joined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: eth-evidence-handoff.mjs capture-model|verify-joined');
    const mode = process.argv[2];
    assert.ok(['capture-model', 'verify-joined'].includes(mode), 'Unknown evidence handoff mode');
    const result = mode === 'capture-model' ? await captureModelEvidence() : await verifyJoinedEvidence();
    console.log('ETH_EVIDENCE_HANDOFF ' + JSON.stringify({mode, status: result.status ?? 'captured', sourceCommit: result.sourceCommit, sourceTree: result.sourceTree, runId: result.runId, runAttempt: result.runAttempt, fileCount: result.files?.length, caseCount: result.browser?.caseCount}));
  } catch (error) {
    console.error('ETH_EVIDENCE_HANDOFF_FAILED ' + (error.stack || error.message));
    process.exitCode = 1;
  }
}
