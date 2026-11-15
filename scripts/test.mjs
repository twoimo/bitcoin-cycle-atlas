import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { CANONICAL_NODE as version, CANONICAL_IMAGE as image, onCanonicalRuntime, canonicalDockerRun } from './canonical-runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// These cases reproduce immutable outputs originally made on Linux/x64.
// Every other case uses the host runtime, including new-model calculations.
const frozenFiles = new Set(['ethereum-prospective-archive-issuer.test.mjs', 'ethereum-prospective-archive-summary.test.mjs', 'ethereum-warm-start-prospective.test.mjs']);
const files = (await readdir(resolve(root, 'tests'))).filter(name => name.endsWith('.test.mjs')).sort();
const canonical = onCanonicalRuntime();
const args = process.argv.slice(2).filter(arg => arg !== '--test-reporter=tap');
if (args.some(arg => arg.startsWith('--test-reporter'))) throw new Error('The combined test receipt requires TAP reporting');
async function run(command, options) {
  return new Promise(resolveRun => {
    let tail = '';
    const child = spawn(command, options, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', chunk => { process.stdout.write(chunk); tail = (tail + chunk).slice(-8192); });
    child.on('error', error => { console.error('Unable to start the declared test runtime:', error.message); resolveRun({ code:1, counts:null }); });
    child.on('close', code => {
      const counts = Object.fromEntries(['tests','pass','fail','skipped'].map(key => [key, Number(tail.match(new RegExp('^# '+key+' (\\d+)$','m'))?.[1] ?? NaN)]));
      resolveRun({ code:code ?? 1, counts });
    });
  });
}
const batches = [];
const hostFiles = canonical ? files : files.filter(file => !frozenFiles.has(file));
batches.push(await run(process.execPath, ['--test', '--test-reporter=tap', ...args, ...hostFiles.map(file => 'tests/'+file)]));
if (!canonical) {
  const options = [...await canonicalDockerRun(root), 'node', '--test', '--test-reporter=tap', ...args, ...files.filter(file => frozenFiles.has(file)).map(file => 'tests/'+file)];
  console.log(`Frozen output replay: ${version} linux/x64, ${image}. No numerical tolerance or stored output changes.`);
  batches.push(await run('docker', options));
}
const complete = batches.every(batch => batch.counts && Object.values(batch.counts).every(Number.isFinite));
const counts = complete ? Object.fromEntries(['tests','pass','fail','skipped'].map(key => [key, batches.reduce((sum,batch) => sum+batch.counts[key],0)])) : null;
console.log('ATLAS_TEST_TOTAL '+JSON.stringify({ complete, ...counts, batches:batches.length }));
process.exitCode = complete && batches.every(batch => batch.code === 0) ? 0 : 1;
