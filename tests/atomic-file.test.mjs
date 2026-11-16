import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileAtomic, writeOrCheckFile } from '../scripts/atomic-file.mjs';

async function directory(t) {
  const created = await mkdtemp(path.join(tmpdir(), 'atlas-atomic-file-'));
  t.after(() => rm(created, { recursive: true, force: true }));
  return created;
}

test('an atomic write with mkdir creates parent directories and leaves only the target', async t => {
  const root = await directory(t), file = path.join(root, 'nested/out.json');
  await writeFileAtomic(file, '{"a":1}\n', { mkdir: true });
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

test('an atomic write without mkdir fails on a missing directory and creates nothing', async t => {
  const root = await directory(t), file = path.join(root, 'missing/out.json');
  await assert.rejects(writeFileAtomic(file, 'new\n'), { code: 'ENOENT' });
  assert.deepEqual(await readdir(root), []);
});

test('an atomic write through a symlink replaces the real file and keeps the link', async t => {
  const root = await directory(t), real = path.join(root, 'real.json'), link = path.join(root, 'link.json');
  await writeFile(real, 'old\n');
  await chmod(real, 0o640);
  await symlink('real.json', link);
  await writeFileAtomic(link, 'new\n');
  assert.ok((await lstat(link)).isSymbolicLink());
  assert.equal(await readFile(real, 'utf8'), 'new\n');
  assert.equal((await stat(real)).mode & 0o7777, 0o640);
  assert.deepEqual((await readdir(root)).sort(), ['link.json', 'real.json']);
});

test('an atomic write through a dangling symlink creates the link target', async t => {
  const root = await directory(t), link = path.join(root, 'link.json');
  await symlink('real.json', link);
  await writeFileAtomic(link, 'new\n');
  assert.ok((await lstat(link)).isSymbolicLink());
  assert.equal(await readFile(path.join(root, 'real.json'), 'utf8'), 'new\n');
});

test('an atomic write refuses a read-only file as fs.writeFile does', async t => {
  if (process.getuid?.() === 0) return t.skip('root bypasses file permissions');
  const root = await directory(t), file = path.join(root, 'out.json');
  await writeFile(file, 'old\n');
  await chmod(file, 0o444);
  await assert.rejects(writeFileAtomic(file, 'new\n'), { code: 'EACCES' });
  assert.equal(await readFile(file, 'utf8'), 'old\n');
  assert.deepEqual(await readdir(root), ['out.json']);
});

test('an explicit mode replaces the existing mode and is masked by the umask', async t => {
  const root = await directory(t), existing = path.join(root, 'existing.json'), created = path.join(root, 'created.json');
  await writeFile(existing, 'old\n');
  await chmod(existing, 0o600);
  const previous = process.umask(0o002);
  try {
    await writeFileAtomic(existing, 'new\n', { mode: 0o644 });
    await writeFileAtomic(created, 'new\n', { mode: 0o644 });
  } finally { process.umask(previous); }
  assert.equal((await stat(existing)).mode & 0o7777, 0o644);
  assert.equal((await stat(created)).mode & 0o7777, 0o644);
});

test('without a mode a new file gets the umask default', async t => {
  const root = await directory(t), file = path.join(root, 'out.json');
  const previous = process.umask(0o002);
  try { await writeFileAtomic(file, 'new\n'); } finally { process.umask(previous); }
  assert.equal((await stat(file)).mode & 0o7777, 0o664);
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

test('without check a write passes mkdir through and otherwise fails on a missing directory', async t => {
  const root = await directory(t);
  await assert.rejects(writeOrCheckFile(path.join(root, 'a/out.json'), 'new\n', { check: false, stale: 'Stale' }), { code: 'ENOENT' });
  await writeOrCheckFile(path.join(root, 'b/out.json'), 'new\n', { check: false, stale: 'Stale', mkdir: true });
  assert.deepEqual(await readdir(root), ['b']);
});
