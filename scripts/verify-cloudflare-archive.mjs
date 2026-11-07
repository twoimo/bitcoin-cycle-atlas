import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareArchiveContextFromBuild, createCloudflareBuildReader } from './cloudflare-archive-build-api.mjs';

export const cloudflareArchiveTests = Object.freeze([
  'tests/cloudflare-archive.test.mjs',
  'tests/ethereum-prospective-archive.test.mjs', 'tests/ethereum-prospective-archive-remote.test.mjs',
  'tests/ethereum-prospective-archive-io.test.mjs', 'tests/ethereum-prospective-handoff.test.mjs',
  'tests/ethereum-prospective-archive-source.test.mjs', 'tests/ethereum-prospective-archive-operations.test.mjs',
  'tests/ethereum-prospective-archive-issuer.test.mjs', 'tests/ethereum-prospective-archive-summary.test.mjs',
  'tests/ethereum-prospective-archive-capacity.test.mjs', 'tests/ethereum-prospective-calibration-paged.test.mjs',
  'tests/ethereum-prospective-operation-io.test.mjs', 'tests/ethereum-prospective-archive-inventory-binding.test.mjs',
]);
const sha = value => createHash('sha256').update(value).digest('hex');
export const cloudflareArchiveTestPlan = sha(JSON.stringify({ node: 'v24.22.2', platform: 'linux', arch: 'x64', tests: cloudflareArchiveTests }));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = resolve(root, 'build/cloudflare-archive-verification.json');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 30_000 }).trim();

export function assertCloudflareArchiveVerification(receipt, identity) {
  assert.equal(receipt?.schemaVersion, 1); assert.equal(receipt.kind, 'atlas-cloudflare-archive-verification');
  assert.equal(receipt.status, 'PASS', 'Actual archive verification must pass');
  assert.equal(receipt.sourceCommit, identity.sourceCommit); assert.equal(receipt.sourceTree, identity.sourceTree);
  if (identity.buildId) assert.equal(receipt.buildId, identity.buildId, 'Archive verification belongs to another Cloudflare build');
  assert.equal(receipt.planSha256, cloudflareArchiveTestPlan); assert.equal(receipt.runtime, 'v24.22.2/linux/x64');
  assert.deepEqual(receipt.testFiles, cloudflareArchiveTests);
  assert.ok(Number.isSafeInteger(receipt.tests) && receipt.tests > 0);
  assert.equal(receipt.pass, receipt.tests); assert.equal(receipt.fail, 0); assert.equal(receipt.skipped, 0); assert.equal(receipt.cancelled, 0);
  assert.match(receipt.logSha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isFinite(Date.parse(receipt.startedAt)) && Number.isFinite(Date.parse(receipt.completedAt)) && Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt));
  return receipt;
}

export async function readCloudflareArchiveVerification(identity) {
  const value = JSON.parse(await readFile(receiptPath, 'utf8'));
  assertCloudflareArchiveVerification(value, identity);
  if (sha(await readFile(resolve(root, 'build/cloudflare-archive-verification.log'))) !== value.logSha256) throw new Error('Archive verification log changed');
  return value;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Archive verification does not accept partial scopes or bypass flags');
  const identity = { sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}') };
  const receipt = { schemaVersion: 1, kind: 'atlas-cloudflare-archive-verification', status: 'RUNNING', ...identity, planSha256: cloudflareArchiveTestPlan,
    runtime: `${process.version}/${process.platform}/${process.arch}`, testFiles: cloudflareArchiveTests, buildId: process.env.WORKERS_CI_BUILD_UUID ?? null, startedAt: new Date().toISOString() };
  await mkdir(dirname(receiptPath), { recursive: true }); await writeFile(receiptPath, JSON.stringify(receipt) + '\n');
  try {
    assert.equal(receipt.runtime, 'v24.22.2/linux/x64', 'Canonical archive runtime required');
    assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Archive verification requires a committed clean source');
    if (process.env.WORKERS_CI) {
      assert.equal(process.env.WORKERS_CI, '1');
      assert.equal(process.env.WORKERS_CI_COMMIT_SHA, identity.sourceCommit);
      assert.equal(process.env.WORKERS_CI_BRANCH, 'main');
      const stage = process.env.ATLAS_ARCHIVE_STAGE;
      assert.ok(stage === 'prepare' || stage === 'publish', 'An explicit archive preparation or publication stage is required');
      const reader = createCloudflareBuildReader({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.ATLAS_BUILDS_READ_TOKEN });
      cloudflareArchiveContextFromBuild({ build: await reader.build(receipt.buildId), buildId: receipt.buildId,
        triggerId: process.env[stage === 'prepare' ? 'ATLAS_ARCHIVE_PREPARE_TRIGGER_UUID' : 'ATLAS_ARCHIVE_PUBLISH_TRIGGER_UUID'], ...identity });
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=2', ...cloudflareArchiveTests], {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 8 * 60 * 1000,
    });
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    await writeFile(resolve(root, 'build/cloudflare-archive-verification.log'), output);
    receipt.logSha256 = sha(output);
    for (const key of ['tests', 'pass', 'fail', 'skipped', 'cancelled']) {
      const match = output.match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
      if (!match) throw new Error(`Archive test output is missing its ${key} total`);
      receipt[key] = Number(match[1]);
    }
    if (result.error || result.status !== 0) { console.error(output.slice(-16_000)); throw new Error(`Archive tests failed: ${result.error?.message ?? result.signal ?? result.status}`); }
    assert.equal(git('rev-parse', 'HEAD'), identity.sourceCommit); assert.equal(git('status', '--porcelain', '--untracked-files=no'), '');
    receipt.completedAt = new Date().toISOString(); receipt.status = 'PASS'; assertCloudflareArchiveVerification(receipt, identity);
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log('ATLAS_ARCHIVE_TESTS_PASS ' + JSON.stringify(receipt));
  } catch (error) {
    receipt.status = 'FAIL'; receipt.completedAt = new Date().toISOString(); receipt.error = error.message;
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n'); throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
