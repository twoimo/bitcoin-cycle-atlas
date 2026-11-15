import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { checkTap, verificationProcessResult } from '../scripts/verification-process.mjs';

const success = 'Model checking completed. No error has been found.\n25 states generated, 20 distinct states found, 0 states left on queue.\n';
const counterexample = 'Invariant PreparedRevisionMatches is violated.\n18 states generated, 14 distinct states found, 6 states left on queue.\n';
function child(output, ending) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import { writeSync } from 'node:fs'; writeSync(1, ${JSON.stringify(output)}); ${ending}`], {
    encoding: 'utf8', timeout: 5000,
  });
}

test('verification accepts a completed successful process', () => {
  const result = child(success, 'process.exitCode = 0;');
  assert.deepEqual(verificationProcessResult(result), { status: 0, output: success });
});

test('verification accepts an expected completed invariant violation', () => {
  const result = child(counterexample, 'process.exitCode = 12;');
  assert.deepEqual(verificationProcessResult(result, { expectedStatus: 12 }), { status: 12, output: counterexample });
});

test('success-like output from a signal-terminated child cannot pass verification', () => {
  const result = child(success, "process.kill(process.pid, 'SIGTERM');");
  assert.equal(result.stdout, success, 'The child must print the misleading result before it terminates');
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.status, null);
  assert.throws(() => verificationProcessResult(result), /did not exit normally.*SIGTERM/);
});

test('counterexample-like output from a signal-terminated child is not a successful negative control', () => {
  const result = child(counterexample, "process.kill(process.pid, 'SIGTERM');");
  assert.equal(result.stdout, counterexample, 'The actual child must print the expected invariant and counts');
  assert.equal(result.signal, 'SIGTERM');
  assert.throws(() => verificationProcessResult(result, { expectedStatus: 12 }), /did not exit normally.*SIGTERM/);
});

test('a different completed failure exit cannot stand in for the expected counterexample', () => {
  const result = child(counterexample, 'process.exitCode = 13;');
  assert.equal(result.status, 13);
  assert.throws(() => verificationProcessResult(result, { expectedStatus: 12 }), /exited with 13; expected 12/);
});

test('process errors and absent or malformed exit statuses cannot qualify as verification', () => {
  const error = new Error('spawn failed');
  assert.throws(() => verificationProcessResult({ error, status: 0, stdout: success }), value => value === error);
  for (const status of [null, undefined, NaN, 0.5, -1, '0']) {
    assert.throws(() => verificationProcessResult({ status, stdout: success }), /did not exit normally/);
  }
});

const tap = ({ tests = 5, pass = tests, fail = 0, skipped = 0 } = {}) => `# tests ${tests}\n# pass ${pass}\n# fail ${fail}\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n`;

test('a complete TAP run qualifies only with every named case executed and passing', () => {
  checkTap({ status: 0, output: tap() }, 5);
  assert.throws(() => checkTap({ status: 0, output: tap({ tests: 4 }) }, 5), /execute each named regression/);
  assert.throws(() => checkTap({ status: 0, output: tap({ pass: 4, skipped: 1 }) }, 5), /No skipped tests may qualify/);
});

test('a mutation qualifies only as a completed run with an assertion failure', () => {
  checkTap({ status: 1, output: tap({ pass: 4, fail: 1 }) }, 5, { fails: true });
  assert.throws(() => checkTap({ status: 1, output: tap() }, 5, { fails: true }), /A tool failure is not a rejected mutation/);
  assert.throws(() => checkTap({ status: 0, output: tap({ pass: 4, fail: 1 }) }, 5, { fails: true }), /must complete with an assertion failure/);
});
