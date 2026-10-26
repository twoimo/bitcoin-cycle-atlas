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
