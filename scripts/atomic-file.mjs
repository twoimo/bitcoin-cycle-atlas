import { randomUUID } from 'node:crypto';
import { access, chmod, constants, mkdir, readFile, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function linkTarget(file) {
  try { return await realpath(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { return linkTarget(path.resolve(path.dirname(file), await readlink(file))); }
  catch (error) { if (error.code === 'EINVAL' || error.code === 'ENOENT') return file; throw error; }
}

export async function writeFileAtomic(file, data, { mode, mkdir: createDirectory = false } = {}) {
  const requested = typeof file === 'string' ? file : fileURLToPath(file);
  if (createDirectory) await mkdir(path.dirname(requested), { recursive: true });
  const target = await linkTarget(requested);
  let existingMode = null;
  if (mode === undefined) {
    try { existingMode = (await stat(target)).mode & 0o7777; await access(target, constants.W_OK); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data, { flag: 'wx', mode });
    if (existingMode !== null) await chmod(temporary, existingMode);
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}

export async function writeOrCheckFile(file, data, { check, stale, ...options }) {
  if (!check) return writeFileAtomic(file, data, options);
  if (!(await readFile(file)).equals(Buffer.from(data))) throw new Error(stale);
}
