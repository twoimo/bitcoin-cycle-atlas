import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileAtomic, writeOrCheckFile } from '../scripts/atomic-file.mjs';

async function directory(t) {
  const created = await mkdtemp(path.join(tmpdir(), 'atlas-atomic-file-'));
  t.after(() => rm(created, { recursive: true, force: true }));
  return created;
}

test('an atomic write creates parent directories and leaves only the target', async t => {
  const root = await directory(t), file = path.join(root, 'nested/out.json');
  await writeFileAtomic(file, '{"a":1}\n');
  assert.equal(await readFile(file, 'utf8'), '{"a":1}\n');
  assert.deepEqual(await readdir(path.dirname(file)), ['out.json']);
});

test('an atomic write replaces an existing file and keeps its mode', async t => {
  const root = await directory(t), file = path.join(root, 'out.json');
  await writeFile(file, 'old\n');
  await chmod(file, 0o640);
  await writeFileAtomic(pathToFileURL(file), Buffer.from('new\n'));
  assert.equal(await readFile(file, 'utf8'), 'new\n');
  assert.equal((await stat(file)).mode & 0o7777, 0o640);
  assert.deepEqual(await readdir(root), ['out.json']);
});

test('an interrupted write keeps the previous bytes and removes its temporary file', async t => {
  const root = await directory(t), file = path.join(root, 'out.json');
  await writeFile(file, 'complete\n');
  async function* interrupted() { yield 'partial'; throw new Error('stream interrupted'); }
  await assert.rejects(writeFileAtomic(file, interrupted()), /stream interrupted/);
  assert.equal(await readFile(file, 'utf8'), 'complete\n');
  assert.deepEqual(await readdir(root), ['out.json']);
});

test('a check passes on identical bytes without rewriting the file', async t => {
  const root = await directory(t), file = path.join(root, 'out.json');
  await writeFile(file, 'same\n');
  const before = await stat(file);
  await writeOrCheckFile(file, 'same\n', { check: true, stale: 'Stale out.json' });
  const after = await stat(file);
  assert.equal(after.ino, before.ino);
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test('a check reports the caller message for different bytes and leaves them in place', async t => {
  const root = await directory(t), file = path.join(root, 'out.json');
  await writeFile(file, 'old\n');
  await assert.rejects(writeOrCheckFile(file, 'new\n', { check: true, stale: 'Stale out.json' }), { message: 'Stale out.json' });
  assert.equal(await readFile(file, 'utf8'), 'old\n');
});

test('a check of a missing file fails without creating it', async t => {
  const root = await directory(t), file = path.join(root, 'missing/out.json');
  await assert.rejects(writeOrCheckFile(file, 'new\n', { check: true, stale: 'Stale out.json' }), { code: 'ENOENT' });
  assert.deepEqual(await readdir(root), []);
});

test('without check the expected bytes are written', async t => {
  const root = await directory(t), file = path.join(root, 'out.json');
  await writeFile(file, 'old\n');
  await writeOrCheckFile(file, 'new\n', { check: false, stale: 'Stale out.json' });
  assert.equal(await readFile(file, 'utf8'), 'new\n');
});
