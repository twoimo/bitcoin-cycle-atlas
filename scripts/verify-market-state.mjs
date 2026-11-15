import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTap, prepareTlc, runVerification, TLC_JAR, TLC_SHA256 } from './verification-process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function checkModels(work) {
  const results = {};
  for (const [name, broken, invariant] of [
    ['MarketRequests', false, 'NoStaleDisplay'], ['MarketRequestsBroken', true, 'NoStaleDisplay'],
    ['HistoryRetry', false, 'RefreshCanRetry'], ['HistoryRetryBroken', true, 'RefreshCanRetry'],
  ]) {
    const modelDir = path.join(root, 'verification/market-state');
    const javaTmp = path.join(work, `${name}-java`);
    await mkdir(javaTmp, { recursive: true });
    const result = runVerification(process.env.JAVA || 'java', [
      '-XX:+UseParallelGC', '-Xmx512m', `-Djava.io.tmpdir=${javaTmp}`,
      '-cp', TLC_JAR, 'tlc2.TLC', '-workers', '1', '-seed', '1', '-fp', '0',
      '-metadir', path.join(work, name), '-config', path.join(modelDir, `${name}.cfg`), path.join(modelDir, `${name}.tla`),
    ], { expectedStatus: broken ? 12 : 0 });
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
  const original = runVerification(process.execPath, [...testArgs, ...files]);
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
  const failure = runVerification(process.execPath, [...testArgs, 'tests/market-request-ownership.test.mjs'], { cwd: copy, expectedStatus: 1 });
  checkTap(failure, 8, { fails: true });
  assert.match(failure.output, /superseded fallback must not (replace|notify)/, 'Mutation failed for an unrelated reason');

  const retryGuard = 'if (history) history.retryAt = 0;';
  assert.equal(source.split(retryGuard).length, 2, 'Refresh cooldown reset changed: review model/code correspondence and mutation selector');
  const retryMutated = source.replace(retryGuard, '// Negative control only: keep the previous failed-history cooldown.');
  await writeFile(controllerFile, retryMutated);
  const retryFailure = runVerification(process.execPath, [...testArgs, 'tests/intraday-history.test.mjs'], { cwd: copy, expectedStatus: 1 });
  checkTap(retryFailure, 14, { fails: true });
  assert.match(retryFailure.output, /explicit refresh must release history retry backoff/, 'History retry mutation failed for an unrelated reason');

  await writeFile(controllerFile, source);
  const restored = runVerification(process.execPath, [...testArgs, ...files], { cwd: copy });
  checkTap(restored, 32);
  return { tests: 32, regression: 'pass', restored: 'pass', mutation: 'expected assertion failure', historyRetryMutation: 'expected assertion failure', mutationExitStatus: failure.status, historyRetryMutationExitStatus: retryFailure.status, sourceSha256: hash(source), mutatedSourceSha256: hash(mutated), historyRetryMutatedSourceSha256: hash(retryMutated) };
}

await prepareTlc();
const work = await mkdtemp(path.join(tmpdir(), 'atlas-market-proof-'));
try {
  const model = await checkModels(work);
  const implementation = await checkImplementation(work);
  const receipt = {
    tool: { name: 'TLC', version: '1.7.4', sha256: TLC_SHA256 },
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
