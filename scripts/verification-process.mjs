import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './atomic-file.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const TLC_SHA256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
export const TLC_JAR = process.env.TLA2TOOLS || path.join(root, 'build/formal-tools/tla2tools-1.7.4.jar');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function prepareTlc() {
  let bytes;
  try { bytes = await readFile(TLC_JAR); }
  catch (error) {
    if (error.code !== 'ENOENT' || process.env.TLA2TOOLS) throw error;
    console.log('Downloading pinned TLC 1.7.4 from its official release.');
    const response = await fetch('https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar', { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`TLC download HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(sha256(bytes), TLC_SHA256, 'Unexpected TLC download checksum');
    await writeFileAtomic(TLC_JAR, bytes);
  }
  assert.equal(sha256(bytes), TLC_SHA256, 'Use the pinned TLC 1.7.4 jar');
}

// A counterexample is evidence only when the tool completed with the expected
// exit status. Buffered output from a crashed or timed-out process is not proof.
export function verificationProcessResult(result, { command = 'Verification process', expectedStatus = 0 } = {}) {
  if (result.error) throw result.error;
  if (result.signal || !Number.isInteger(result.status) || result.status < 0) {
    throw new Error(`${command} did not exit normally (signal: ${result.signal || 'none'}, status: ${String(result.status)})`);
  }
  if (!Number.isInteger(expectedStatus) || expectedStatus < 0) throw new TypeError('Expected a nonnegative integer verification exit status');
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== expectedStatus) {
    throw new Error(`${command} exited with ${result.status}; expected ${expectedStatus}\n${output}`);
  }
  return { status: result.status, output };
}

export function runVerification(command, args, { cwd = root, env = {}, expectedStatus = 0 } = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  return verificationProcessResult(result, { command, expectedStatus });
}

export function checkTap(result, expected, { fails = false } = {}) {
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
