import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_NODE, CANONICAL_IMAGE, onCanonicalRuntime, canonicalDockerRun } from './canonical-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ledger = ['scripts/build-forecast-ledger.mjs', ...process.argv.slice(2)];
let result;
if (onCanonicalRuntime()) {
  result = spawnSync(process.execPath, ledger, { cwd: root, stdio: 'inherit' });
} else {
  console.log(`Forecast experiments replay bit for bit only on linux/x64 Node ${CANONICAL_NODE}. This host is ${process.platform}/${process.arch} ${process.version}, so the ledger runs in ${CANONICAL_IMAGE}.`);
  result = spawnSync('docker', [...await canonicalDockerRun(root), 'node', ...ledger], { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(`Docker is unavailable (${result.error.message}). Start Docker or run on linux/x64 Node ${CANONICAL_NODE}. Running node scripts/build-forecast-ledger.mjs directly on this host fails the experiment replay even when nothing changed, so that result is not evidence either way.`);
  }
}
process.exitCode = result.status ?? 1;
