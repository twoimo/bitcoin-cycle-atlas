import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {createEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';
import {
  ETH_MODEL_ARTIFACT_PATHS, ETH_MODEL_HANDOFF_PATH, ETH_JOINED_HANDOFF_PATH,
  captureModelEvidence, verifyJoinedEvidence
} from '../scripts/eth-evidence-handoff.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const browserPath = 'build/eth-browser/report.json';
const sourcePaths = [
  'dist/index.html', 'scripts/verify-eth-candidate-browser.mjs',
  'scripts/eth-browser-case-specs.mjs', 'scripts/verify-workspace-browser.mjs',
  'scripts/verify-forecast-replay-browser.mjs', 'scripts/verify-chart-replay-browser.mjs',
  'scripts/verify-consolidated-workspace-browser.mjs'
];

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'eth-evidence-handoff-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const write = async (path, contents) => {
    await mkdir(dirname(resolve(root, path)), {recursive: true});
    await writeFile(resolve(root, path), contents);
  };
  const json = (path, value) => write(path, JSON.stringify(value, null, 2) + '\n');
  const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const mutateJson = async (path, mutate) => { const value = await readJson(path); mutate(value); await json(path, value); };
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const sourceHashes = {};
  for (const path of sourcePaths) {
    const content = `Synthetic unit-test source: ${path}\n`;
    await write(path, content);
    sourceHashes[path] = digest(content);
  }
  git('init', '--quiet');
  git('add', 'dist', 'scripts');
  git('-c', 'user.name=Evidence fixture', '-c', 'user.email=evidence@example.invalid', 'commit', '--quiet', '-m', 'Synthetic source fixture');
  const sourceCommit = git('rev-parse', 'HEAD');
  const sourceTree = git('rev-parse', 'HEAD^{tree}');
  const env = {
    GITHUB_SHA: 'f'.repeat(40), // PR merge ref deliberately differs from checkout.
    GITHUB_RUN_ID: '501', GITHUB_RUN_ATTEMPT: '1', ETH_EVIDENCE_SOURCE_SHA: sourceCommit
  };
  for (const kind of ['MODEL', 'BROWSER']) Object.assign(env, {
    [`ETH_EVIDENCE_${kind}_SOURCE_SHA`]: sourceCommit,
    [`ETH_EVIDENCE_${kind}_SOURCE_TREE`]: sourceTree,
    [`ETH_EVIDENCE_${kind}_RUN_ID`]: '501',
    [`ETH_EVIDENCE_${kind}_RUN_ATTEMPT`]: '1',
    [`ETH_EVIDENCE_${kind}_ARTIFACT_ID`]: kind === 'MODEL' ? '1001' : '1002'
  });
  for (const path of ETH_MODEL_ARTIFACT_PATHS) {
    if (path.endsWith('.json')) await json(path, {fixture: path});
    else await json(`${path}/receipt.json`, {fixture: path});
  }
  await mkdir(resolve(root, 'build/ethereum-throughput-supplement/empty/nested'), {recursive: true});
  const cases = [];
  for (const [index, spec] of createEthBrowserCaseSpecs().entries()) {
    const file = `case-${index}.png`;
    const bytes = Buffer.from(`Synthetic screenshot hash fixture ${index}`);
    await write(`build/eth-browser/${file}`, bytes);
    const actual = {...spec, caseSpec: {...spec}, status: 'passed', runtimeErrors: [], unscopedLocalRequests: [], unexpectedResourceErrors: [], screenshots: [{file, bytes: bytes.length, sha256: digest(bytes)}]};
    // The actual runner replaces these flags with detailed measurement results.
    for (const key of ['consolidated', 'replay', 'chartReplay']) if (spec[key]) actual[key] = {nativeInput: true};
    if (spec.resize) actual.resize = [{width: 900, height: 430}];
    cases.push(actual);
  }
  const fixtureBytes = Buffer.from('{"syntheticBrowserFixture":true}\n');
  await write('build/eth-browser/zero-fixture.json', fixtureBytes);
  const report = {
    schemaVersion: 1, kind: 'eth-candidate-real-browser', status: 'passed', caseScope: 'all', sourceCommit,
    declaredCaseCount: cases.length, expectedCaseCount: cases.length, cases, failures: [],
    finishedAt: '2026-11-07T01:00:00.000Z', sourceHashes,
    sourceIntegrity: {checkedFiles: sourcePaths.length, changedSources: [], unchangedDuringRun: true},
    syntheticFixture: {file: 'zero-fixture.json', bytes: fixtureBytes.length, sha256: digest(fixtureBytes)}
  };
  await json(browserPath, report);
  await captureModelEvidence({root, env});
  return {root, env, write, json, readJson, mutateJson, git, report};
}

test('same-source full evidence joins all declared cases and the original model roots', async t => {
  const f = await fixture(t);
  const joined = await verifyJoinedEvidence(f);
  assert.equal(joined.status, 'passed');
  assert.equal(joined.browser.caseCount, createEthBrowserCaseSpecs().length);
  assert.equal(joined.browser.screenshotFileCount, createEthBrowserCaseSpecs().length);
  assert.equal(joined.model.fileCount, ETH_MODEL_ARTIFACT_PATHS.length);
  assert.equal(joined.model.artifactId, '1001');
  assert.equal(joined.browser.artifactId, '1002');
  assert.deepEqual(await f.readJson(ETH_JOINED_HANDOFF_PATH), joined);
  const model = await f.readJson(ETH_MODEL_HANDOFF_PATH);
  assert.deepEqual(model.artifactPaths, ETH_MODEL_ARTIFACT_PATHS);
  assert.ok(model.files.every(file => !file.path.includes('eth-browser') && !file.path.includes('eth-review-packet') && !file.path.includes('handoff')));
});

test('a failed-job rerun accepts an exact successful producer from an earlier attempt', async t => {
  const f = await fixture(t);
  f.env.GITHUB_RUN_ATTEMPT = '2';
  f.env.ETH_EVIDENCE_BROWSER_RUN_ATTEMPT = '2';
  const joined = await verifyJoinedEvidence(f);
  assert.equal(joined.runAttempt, '2');
  assert.equal(joined.model.runAttempt, '1');
  assert.equal(joined.browser.runAttempt, '2');
});

test('artifact transfer restores only producer-declared empty directories', async t => {
  const f = await fixture(t);
  const empty = 'build/ethereum-throughput-supplement/empty';
  const emptyRoot = 'build/ethereum-pow-zero';
  await rm(resolve(f.root, `${emptyRoot}/receipt.json`));
  await captureModelEvidence(f);
  await rm(resolve(f.root, empty), {recursive: true});
  await rm(resolve(f.root, emptyRoot), {recursive: true});
  await verifyJoinedEvidence(f);
  assert.ok((await stat(resolve(f.root, `${empty}/nested`))).isDirectory());
  assert.ok((await stat(resolve(f.root, emptyRoot))).isDirectory());
});

const rejectionCases = [
  ['different checkout head', async f => { f.env.ETH_EVIDENCE_SOURCE_SHA = '0'.repeat(40); }, /requested PR head/],
  ['model receipt commit mismatch', f => f.mutateJson(ETH_MODEL_HANDOFF_PATH, model => { model.sourceCommit = '0'.repeat(40); }), /sourceCommit does not match/],
  ['model receipt tree mismatch', f => f.mutateJson(ETH_MODEL_HANDOFF_PATH, model => { model.sourceTree = '0'.repeat(40); }), /sourceTree does not match/],
  ['different producer tree', async f => { f.env.ETH_EVIDENCE_MODEL_SOURCE_TREE = '0'.repeat(40); }, /producer tree/],
  ['different model workflow run', async f => { f.env.ETH_EVIDENCE_MODEL_RUN_ID = '500'; }, /different workflow run/],
  ['different browser workflow run', async f => { f.env.ETH_EVIDENCE_BROWSER_RUN_ID = '500'; }, /different workflow run/],
  ['model receipt attempt mismatch', f => f.mutateJson(ETH_MODEL_HANDOFF_PATH, model => { model.runAttempt = '2'; }), /runAttempt does not match/],
  ['future producer attempt', async f => { f.env.ETH_EVIDENCE_BROWSER_RUN_ATTEMPT = '2'; }, /attempt is in the future/],
  ['missing exact artifact ID', async f => { delete f.env.ETH_EVIDENCE_BROWSER_ARTIFACT_ID; }, /must be provided/],
  ['same artifact reused for both producers', async f => { f.env.ETH_EVIDENCE_BROWSER_ARTIFACT_ID = '1001'; }, /must be distinct/],
  ['modified model bytes', f => f.write(ETH_MODEL_ARTIFACT_PATHS[0], 'changed\n'), /hash\/bytes mismatch/],
  ['missing model file', f => rm(resolve(f.root, ETH_MODEL_ARTIFACT_PATHS[0])), /ENOENT/],
  ['missing original directory', f => rm(resolve(f.root, 'build/ethereum-economic-vintages'), {recursive: true}), /ENOENT/],
  ['extra unreceipted model file', f => f.write('build/ethereum-economic-vintages/unreceipted.json', '{}'), /inventory\/hash\/bytes mismatch/],
  ['truncated model file inventory', f => f.mutateJson(ETH_MODEL_HANDOFF_PATH, model => { model.files.pop(); }), /Missing required model file|inventory\/hash\/bytes mismatch/],
  ['changed model upload scope', f => f.mutateJson(ETH_MODEL_HANDOFF_PATH, model => { model.artifactPaths.push('build/unrelated'); }), /artifact scope changed/],
  ['traversing empty directory path', f => f.mutateJson(ETH_MODEL_HANDOFF_PATH, model => { model.directories.push('build/ethereum-throughput-supplement/../../outside'); model.directories.sort(); }), /Unsafe evidence path/],
  ['empty directory outside model scope', f => f.mutateJson(ETH_MODEL_HANDOFF_PATH, model => { model.directories.push('build/unrelated'); model.directories.sort(); }), /outside the original model artifact scope/],
  ['model symlink', async f => { const path = resolve(f.root, ETH_MODEL_ARTIFACT_PATHS[0]); await rm(path); await symlink(resolve(f.root, ETH_MODEL_ARTIFACT_PATHS[1]), path); }, /symlink/],
  ['missing browser report', f => rm(resolve(f.root, browserPath)), /ENOENT/],
  ['truncated browser JSON', f => f.write(browserPath, '{"status":'), /JSON/],
  ['partial running report', f => f.mutateJson(browserPath, report => { report.status = 'running'; }), /not complete and passed/],
  ['different browser source commit', f => f.mutateJson(browserPath, report => { report.sourceCommit = '0'.repeat(40); }), /different commit/],
  ['limited browser scope', f => f.mutateJson(browserPath, report => { report.caseScope = 'data'; }), /entire declared scope/],
  ['truncated case count', f => f.mutateJson(browserPath, report => { report.cases.pop(); }), /actual case count/],
  ['forged declared case count', f => f.mutateJson(browserPath, report => { report.declaredCaseCount--; }), /declared case count/],
  ['forged expected case count', f => f.mutateJson(browserPath, report => { report.expectedCaseCount--; }), /expected case count/],
  ['duplicate case replacing a required case', f => f.mutateJson(browserPath, report => { report.cases[1] = report.cases[0]; }), /identity\/order mismatch/],
  ['missing immutable case specification', f => f.mutateJson(browserPath, report => { delete report.cases[0].caseSpec; }), /identity\/order mismatch/],
  ['wrong executed case viewport', f => f.mutateJson(browserPath, report => { report.cases[0].width++; }), /changed width/],
  ['failed case hidden behind passed report', f => f.mutateJson(browserPath, report => { report.cases[0].status = 'failed'; }), /did not pass/],
  ['nonempty failure list', f => f.mutateJson(browserPath, report => { report.failures.push({error: 'failure'}); }), /contains failures/],
  ['runtime error hidden behind passed case', f => f.mutateJson(browserPath, report => { report.cases[0].runtimeErrors.push({error: 'failure'}); }), /runtime errors/],
  ['unfinished browser receipt', f => f.mutateJson(browserPath, report => { delete report.finishedAt; }), /completion time/],
  ['changed source integrity', f => f.mutateJson(browserPath, report => { report.sourceIntegrity.unchangedDuringRun = false; }), /changed during execution/],
  ['missing source inventory', f => f.mutateJson(browserPath, report => { report.sourceHashes = {}; report.sourceIntegrity.checkedFiles = 0; }), /Missing browser source identity/],
  ['changed browser source hash', f => f.mutateJson(browserPath, report => { report.sourceHashes['dist/index.html'] = '0'.repeat(64); }), /source hash mismatch/],
  ['changed tracked checkout source', f => f.write('dist/index.html', 'changed\n'), /Tracked sources changed/],
  ['missing screenshot', f => rm(resolve(f.root, 'build/eth-browser/case-0.png')), /ENOENT/],
  ['changed screenshot bytes', f => f.write('build/eth-browser/case-0.png', 'changed\n'), /Screenshot hash mismatch/],
  ['incorrect screenshot byte length', f => f.mutateJson(browserPath, report => { report.cases[0].screenshots[0].bytes++; }), /Screenshot byte count mismatch/],
  ['empty screenshot list', f => f.mutateJson(browserPath, report => { report.cases[0].screenshots = []; }), /has no screenshots/],
  ['screenshot path traversal', f => f.mutateJson(browserPath, report => { report.cases[0].screenshots[0].file = '../../outside.png'; }), /Unsafe evidence path/],
  ['changed synthetic fixture', f => f.write('build/eth-browser/zero-fixture.json', '{}'), /synthetic fixture hash mismatch/]
];

for (const [name, mutate, reason] of rejectionCases) test(`rejects ${name}`, async t => {
  const f = await fixture(t);
  await mutate(f);
  await assert.rejects(() => verifyJoinedEvidence(f), reason);
  await assert.rejects(() => stat(resolve(f.root, ETH_JOINED_HANDOFF_PATH)), {code: 'ENOENT'});
});

test('capture rejects a missing required model artifact before writing a receipt', async t => {
  const f = await fixture(t);
  await rm(resolve(f.root, ETH_MODEL_HANDOFF_PATH));
  await rm(resolve(f.root, ETH_MODEL_ARTIFACT_PATHS[0]));
  await assert.rejects(() => captureModelEvidence(f), {code: 'ENOENT'});
  await assert.rejects(() => stat(resolve(f.root, ETH_MODEL_HANDOFF_PATH)), {code: 'ENOENT'});
});
