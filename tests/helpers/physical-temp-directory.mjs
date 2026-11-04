import {mkdtemp as createDirectory, realpath} from 'node:fs/promises';

// Safe-path tests need a physical normal root. Explicit symlink attack inputs
// remain unchanged and must still be refused by the production boundaries.
export async function mkdtemp(prefix) {
  return realpath(await createDirectory(prefix));
}
