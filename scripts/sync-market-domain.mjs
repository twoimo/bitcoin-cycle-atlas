import { readFile } from 'node:fs/promises';
import { writeOrCheckFile } from './atomic-file.mjs';
const source = new URL('../packages/domain/src/market-lab-math.js', import.meta.url);
const target = new URL('../dist/market-lab-math.js', import.meta.url);
await writeOrCheckFile(target, await readFile(source, 'utf8'), {
  check: process.argv.includes('--check'),
  stale: 'Published market math differs from packages/domain; run npm run build:domain',
});
