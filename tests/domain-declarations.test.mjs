import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

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
