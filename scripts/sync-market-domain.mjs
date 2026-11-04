import { readFile, writeFile } from 'node:fs/promises';
const source = new URL('../packages/domain/src/market-lab-math.js', import.meta.url);
const target = new URL('../dist/market-lab-math.js', import.meta.url);
const body = await readFile(source, 'utf8');
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== body) throw new Error('Published market math differs from packages/domain; run npm run build:domain');
} else await writeFile(target, body);
