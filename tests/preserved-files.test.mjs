import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { PRESERVED_FILES } from '../scripts/preserved-files.mjs';

const root = new URL('../', import.meta.url);

for (const { path, citedBy, reason } of PRESERVED_FILES) {
  test(`${path} is kept on purpose`, async () => {
    const stat = await lstat(new URL(path, root)).catch(() => null);
    assert.ok(stat, `${path} is kept on purpose: it ${reason} (${citedBy}). Restore it with git checkout HEAD -- ${path}. Delete it only together with its entry in scripts/preserved-files.mjs, after ${citedBy} stops relying on it.`);
    const citation = await readFile(new URL(citedBy, root), 'utf8');
    assert.ok(citation.includes(path), `${citedBy} no longer cites ${path}. Drop its entry from scripts/preserved-files.mjs, or restore the citation.`);
  });
}
