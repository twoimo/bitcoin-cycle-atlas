import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Readers never see a partial file: the bytes land in a sibling temporary file
// that replaces the target in one rename. An existing target keeps its mode.
export async function writeFileAtomic(file, data) {
  const target = typeof file === 'string' ? file : fileURLToPath(file);
  let mode = null;
  try { mode = (await stat(target)).mode & 0o7777; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { flag: 'wx' });
    if (mode !== null) await chmod(temporary, mode);
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}

// A check never writes; it fails with `stale` unless the bytes already match.
export async function writeOrCheckFile(file, data, { check, stale }) {
  if (!check) return writeFileAtomic(file, data);
  if (!(await readFile(file)).equals(Buffer.from(data))) throw new Error(stale);
}
