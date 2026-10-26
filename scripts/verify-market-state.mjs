import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationProcessResult } from './verification-process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const toolUrl = 'https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar';
const toolSha256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
const toolPath = process.env.TLA2TOOLS || path.join(root, 'build/formal-tools/tla2tools-1.7.4.jar');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function prepareTool() {
  let bytes;
  try { bytes = await readFile(toolPath); }
  catch (error) {
    if (error.code !== 'ENOENT' || process.env.TLA2TOOLS) throw error;
    console.log('Downloading pinned TLC 1.7.4 from its official release.');
    const response = await fetch(toolUrl, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`TLC download HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(hash(bytes), toolSha256, 'TLC checksum differs from the reviewed release');
    await mkdir(path.dirname(toolPath), { recursive: true });
    await writeFile(toolPath, bytes);
  }
  assert.equal(hash(bytes), toolSha256, 'Use the pinned TLC 1.7.4 jar for reproducible checks');
}

function run(command, args, cwd = root, expectedStatus = 0) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  return verificationProcessResult(result, { command, expectedStatus });
}

function checkTap(result, expected, { fails = false } = {}) {
  const count = label => Number(result.output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1]);
  assert.equal(count('tests'), expected, 'The verifier must execute each named regression, not only test files');
  for (const label of ['cancelled', 'skipped', 'todo']) assert.equal(count(label), 0, `No ${label} tests may qualify as verification`);
  assert.equal(count('pass') + count('fail'), expected, 'The TAP result is incomplete');
  if (fails) {
    assert.equal(result.status, 1, 'The isolated product mutation must complete with an assertion failure');
    assert.ok(count('fail') > 0, 'A tool failure is not a rejected mutation');
  } else {
    assert.equal(result.status, 0, result.output);
    assert.equal(count('pass'), expected, 'Every original/restored regression must pass');
    assert.equal(count('fail'), 0);
  }
}

async function checkModels(work) {
  const results = {};
  for (const [name, broken, invariant] of [
    ['MarketRequests', false, 'NoStaleDisplay'], ['MarketRequestsBroken', true, 'NoStaleDisplay'],
    ['HistoryRetry', false, 'RefreshCanRetry'], ['HistoryRetryBroken', true, 'RefreshCanRetry'],
  ]) {
    const modelDir = path.join(root, 'verification/market-state');
    const javaTmp = path.join(work, `${name}-java`);
    await mkdir(javaTmp, { recursive: true });
    const result = run(process.env.JAVA || 'java', [
      '-XX:+UseParallelGC', '-Xmx512m', `-Djava.io.tmpdir=${javaTmp}`,
      '-cp', toolPath, 'tlc2.TLC', '-workers', '1', '-seed', '1', '-fp', '0',
      '-metadir', path.join(work, name), '-config', path.join(modelDir, `${name}.cfg`), path.join(modelDir, `${name}.tla`),
    ], root, broken ? 12 : 0);
    if (broken) {
      assert.equal(result.status, 12, `${name} must finish with the invariant-violation exit status`);
      assert.ok(result.output.includes(`Invariant ${invariant} is violated`), `The negative control must fail for ${invariant}, not a tool error: ${result.output}`);
    } else {
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /Model checking completed\. No error has been found\./);
    }
    const counts = result.output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);
    assert.ok(counts, 'TLC did not report completed state counts');
    results[name] = {
      outcome: broken ? 'expected invariant violation' : 'pass',
      exitStatus: result.status,
      generatedStates: Number(counts[1].replaceAll(',', '')),
      distinctStates: Number(counts[2].replaceAll(',', '')),
      remainingStates: Number(counts[3].replaceAll(',', '')),
    };
  }
  return results;
}

async function checkImplementation(work) {
  const files = ['tests/market-data-controller.test.mjs', 'tests/intraday-history.test.mjs', 'tests/market-request-ownership.test.mjs'];
  const testArgs = ['--test', '--test-reporter=tap'];
  const original = run(process.execPath, [...testArgs, ...files]);
  checkTap(original, 32);
  console.log(original.output.trim());

  const copy = path.join(work, 'actual-code-mutation');
  await mkdir(path.join(copy, 'tests'), { recursive: true });
  await cp(path.join(root, 'dist'), path.join(copy, 'dist'), { recursive: true });
  await writeFile(path.join(copy, 'package.json'), '{"type":"module"}\n');
  for (const file of files) await cp(path.join(root, file), path.join(copy, file));
  const controllerFile = path.join(copy, 'dist/market-data-controller.js');
  const source = await readFile(controllerFile, 'utf8');
  const guarded = 'const series = prior.series || parseMarketSnapshot(await snapshot(), interval);\n        if (active !== request) return;';
  assert.equal(source.split(guarded).length, 2, 'Controller changed: review model/code correspondence and mutation selector');
  const mutated = source.replace(guarded, 'const series = prior.series || parseMarketSnapshot(await snapshot(), interval);\n        // Negative control only: revoked request can publish.');
  await writeFile(controllerFile, mutated);
  const failure = run(process.execPath, [...testArgs, 'tests/market-request-ownership.test.mjs'], copy, 1);
  checkTap(failure, 8, { fails: true });
  assert.match(failure.output, /superseded fallback must not (replace|notify)/, 'Mutation failed for an unrelated reason');

  const retryGuard = 'if (history) history.retryAt = 0;';
  assert.equal(source.split(retryGuard).length, 2, 'Refresh cooldown reset changed: review model/code correspondence and mutation selector');
  const retryMutated = source.replace(retryGuard, '// Negative control only: keep the previous failed-history cooldown.');
  await writeFile(controllerFile, retryMutated);
  const retryFailure = run(process.execPath, [...testArgs, 'tests/intraday-history.test.mjs'], copy, 1);
  checkTap(retryFailure, 14, { fails: true });
  assert.match(retryFailure.output, /explicit refresh must release history retry backoff/, 'History retry mutation failed for an unrelated reason');

  await writeFile(controllerFile, source);
  const restored = run(process.execPath, [...testArgs, ...files], copy);
  checkTap(restored, 32);
  return { tests: 32, regression: 'pass', restored: 'pass', mutation: 'expected assertion failure', historyRetryMutation: 'expected assertion failure', mutationExitStatus: failure.status, historyRetryMutationExitStatus: retryFailure.status, sourceSha256: hash(source), mutatedSourceSha256: hash(mutated), historyRetryMutatedSourceSha256: hash(retryMutated) };
}

await prepareTool();
const work = await mkdtemp(path.join(tmpdir(), 'atlas-market-proof-'));
try {
  const model = await checkModels(work);
  const implementation = await checkImplementation(work);
  const receipt = {
    tool: { name: 'TLC', version: '1.7.4', sha256: toolSha256 },
    bounds: { requestGenerations: 3, intervals: ['1m', '5m'], property: 'NoStaleDisplay' },
    historyRetryScope: { intervals: 1, existingCandles: true, clock: 'boolean cooldown only', property: 'RefreshCanRetry' },
    model, implementation,
    limitations: ['Separate bounded abstract models, not a composed whole-program proof', 'No pricing, numerical, page-content, wall-clock or liveness proof'],
  };
  console.log(JSON.stringify(receipt, null, 2));
  if (process.argv[2]) await writeFile(process.argv[2], `${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  await rm(work, { recursive: true, force: true });
}
