import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildEthReviewPacket} from '../scripts/build-eth-review-packet.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = ['market-lab-math', 'rsi-backtest', 'rsi-bars', 'rsi-simulation'];

test('hand-written declarations type-check against the JavaScript they describe', () => {
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '-p', 'packages/domain/tsconfig.json'], {cwd: root, encoding: 'utf8'});
  } catch (error) { assert.fail(error.stdout || error.message); }
});

for (const name of modules) {
  test(`${name}.d.ts declares only values the module exports`, async () => {
    const declared = [...(await readFile(new URL(`../packages/domain/src/${name}.d.ts`, import.meta.url), 'utf8')).matchAll(/^export (?:function|const) (\w+)/gm)].map(match => match[1]);
    const actual = await import(`../packages/domain/src/${name}.js`);
    assert.ok(declared.length > 0);
    assert.deepEqual(declared.filter(exported => !(exported in actual)), []);
  });
}

test('published market math needs no source outside the ETH review packet', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'domain-review-packet-'));
  t.after(() => rm(fixture, {recursive: true, force: true}));
  await mkdir(join(fixture, 'dist'));
  await copyFile(new URL('../dist/market-lab-math.js', import.meta.url), join(fixture, 'dist/market-lab-math.js'));
  const git = args => execFileSync('git', args, {cwd: fixture, stdio: 'ignore'});
  git(['init']); git(['add', '--', 'dist']);
  git(['-c', 'user.name=Domain fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Published market math']);
  const manifest = await buildEthReviewPacket({repositoryRoot: fixture, seedPaths: ['dist/market-lab-math.js']});
  assert.deepEqual(manifest.unresolvedImports, []);
});
