import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { copyEquityFixtureDependencies } from '../scripts/verify-equity-state.mjs';

async function workspace(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-equity-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('the actual formal fixture runs in isolation with its complete UI dependency closure', async t => {
  const copy = path.join(await workspace(t), 'implementation');
  const files = await copyEquityFixtureDependencies(copy);
  for (const file of ['dist/ui/chart-url-state.js', 'dist/native-chart-workbench.js', 'dist/workspace-state.js', 'dist/chart-bottom-bar.js']) {
    assert.ok(files.includes(file), `Missing real initializer dependency: ${file}`);
  }
  const result = spawnSync(process.execPath, ['tests/equity-load-ownership.test.mjs'], {
    cwd: copy, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tests 28/);
  assert.match(result.stdout, /fail 0/);
});

test('fixture copying follows cyclic imports, re-exports and lazy literals with versioned URLs', async t => {
  const directory = await workspace(t), sourceRoot = path.join(directory, 'source'), copy = path.join(directory, 'copy');
  await mkdir(path.join(sourceRoot, 'nested'), { recursive: true });
  await writeFile(path.join(sourceRoot, 'entry.mjs'), 'import "./nested/a.js?v=1"; export {value} from "./shared.js#value"; export const lazy = () => import("./lazy.js"); // import "./missing-comment.js"\n');
  await writeFile(path.join(sourceRoot, 'nested/a.js'), 'import "../entry.mjs#cycle"; export {value} from "../shared.js?v=2";');
  await writeFile(path.join(sourceRoot, 'shared.js'), 'export const value = 42;');
  await writeFile(path.join(sourceRoot, 'lazy.js'), 'import assert from "node:assert/strict"; assert.ok(true); export const value = 43;');
  assert.deepEqual(await copyEquityFixtureDependencies(copy, { sourceRoot, entries: ['entry.mjs'] }), ['entry.mjs', 'lazy.js', 'nested/a.js', 'shared.js']);
  const loaded = await import(pathToFileURL(path.join(copy, 'entry.mjs')).href);
  assert.equal(loaded.value, 42);
  assert.equal((await loaded.lazy()).value, 43);
});

test('a missing transitive fixture module stops copying before any mutation is attempted', async t => {
  const directory = await workspace(t), sourceRoot = path.join(directory, 'source');
  await mkdir(sourceRoot);
  await writeFile(path.join(sourceRoot, 'entry.mjs'), 'export * from "./missing.js";');
  await assert.rejects(copyEquityFixtureDependencies(path.join(directory, 'copy'), { sourceRoot, entries: ['entry.mjs'] }), { code: 'ENOENT' });
});
