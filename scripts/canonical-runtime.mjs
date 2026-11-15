import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Frozen ETH archive outputs and the forecast experiment ledger were produced
// on this runtime. V8's Math.exp and Math.log differ from it in the last bit
// on arm64, so those replays verify only here.
export const CANONICAL_NODE = 'v24.22.2';
export const CANONICAL_IMAGE = 'node@sha256:8fa96264f302f58bbb13aa7339c541547b56975766ce956c875da149452a3e40';

export const onCanonicalRuntime = () => process.platform === 'linux' && process.arch === 'x64' && process.version === CANONICAL_NODE;

export async function canonicalDockerRun(root) {
  const common = await realpath(resolve(root, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim()));
  const options = ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--read-only', '--cpus', '8',
    '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`, '--tmpfs', '/tmp:rw,exec,nosuid,size=2g',
    '--env', 'GIT_OPTIONAL_LOCKS=0', '--mount', `type=bind,src=${root},dst=${root}`, '--workdir', root];
  if (!common.startsWith(root+'/')) options.push('--mount', `type=bind,src=${common},dst=${common},readonly`);
  options.push(CANONICAL_IMAGE);
  return options;
}
