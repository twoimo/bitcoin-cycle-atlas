import assert from 'node:assert/strict';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// No server, dependencies or network are required. Resolve resources as a browser
// would at a GitHub Pages project subpath, not only at the domain root.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const base = new URL('https://example.github.io/bitcoin-cycle-atlas/');
const run = promisify(execFile);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    assert(!entry.isSymbolicLink(), `Pages artifact must not contain symlinks: ${full}`);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) files.push(full);
  }
}
await walk(dist);
let checkedReferences = 0;
async function checkReference(specifier, source, { module = false } = {}) {
  if (!specifier || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(specifier)) return;
  assert(!specifier.startsWith('/'), `Root-absolute resource breaks project Pages: ${source}: ${specifier}`);
  if (module) assert(/^\.\.?\//.test(specifier), `Unbundled bare import: ${source}: ${specifier}`);
  const sourceRelative = path.relative(dist, source).split(path.sep).join('/');
  const resolved = new URL(specifier, new URL(sourceRelative, base));
  assert(resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname),
    `Resource escapes Pages base path: ${sourceRelative}: ${specifier}`);
  const relative = decodeURIComponent(resolved.pathname.slice(base.pathname.length));
  const target = path.resolve(dist, relative);
  assert(target.startsWith(`${dist}${path.sep}`), `Resource escapes dist: ${specifier}`);
  const stat = await lstat(target).catch(() => null);
  assert(stat?.isFile() && !stat.isSymbolicLink(), `Missing static resource: ${sourceRelative}: ${specifier}`);
  checkedReferences += 1;
}
for (const file of files) {
  const ext = path.extname(file);
  if (!['.js', '.mjs', '.html', '.css', '.json'].includes(ext)) continue;
  const source = await readFile(file, 'utf8');
  if (ext === '.json') JSON.parse(source);
  if (ext === '.js' || ext === '.mjs') {
    await run(process.execPath, ['--check', file]);
    // This project's ES modules use literal relative imports. Dynamic computed
    // URLs (for the optional public data refresh) are deliberately not guessed.
    for (const match of source.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)(['"])([^'"\r\n]+)\1/g)) {
      await checkReference(match[2], file, { module: true });
    }
    for (const match of source.matchAll(/\bfetch\(\s*(['"])([^'"\r\n]+)\1/g)) {
      await checkReference(match[2], file);
    }
  }
  if (ext === '.html') {
    assert(!/<base\b/i.test(source), 'A <base> element would alter local resource resolution');
    for (const match of source.matchAll(/\b(?:src|href)\s*=\s*(['"])(.*?)\1/gi)) {
      await checkReference(match[2], file);
    }
  }
  if (ext === '.css') {
    for (const match of source.matchAll(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi)) {
      await checkReference(match[2], file);
    }
    for (const match of source.matchAll(/@import\s+(['"])([^'"]+)\1/gi)) {
      await checkReference(match[2], file);
    }
  }
}
const index = await readFile(path.join(dist, 'index.html'), 'utf8');
assert(/<script\b[^>]*type=["']module["'][^>]*src=["']\.\/app\.js(?:\?[^"'\s]*)?["']/.test(index), 'Missing app module entry point');
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--standalone'),
  'Usage: node scripts/verify-static.mjs [--standalone build/Bitcoin_Cycles_Comparison.html]');
if (args.length) {
  const standalone = await readFile(path.resolve(root, args[1]), 'utf8');
  for (const [id, file] of [['embedded-btc-data', 'btc-daily.json'], ['embedded-ohlc-data', 'btc-ohlc.json'], ['embedded-volume-data', 'btc-volume.json']]) {
    const embedded = standalone.match(new RegExp(`<script\\b[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'))?.[1];
    assert.equal(embedded, (await readFile(path.join(dist, 'data', file), 'utf8')).replaceAll('<', '\\u003c'), `Standalone snapshot differs from its source: ${id}`);
  }
  const ohlcSnapshot = standalone.match(/<script\b[^>]*id=["']embedded-ohlc-data["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  assert(ohlcSnapshot, 'Standalone file lacks its real OHLC fallback');
  const { parseMarketSnapshot, CHART_INTERVALS } = await import('../dist/ohlc-data.js');
  const savedCandles = JSON.parse(ohlcSnapshot);
  for (const interval of CHART_INTERVALS) parseMarketSnapshot(savedCandles, interval.id);
  const mapText = standalone.match(/<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  assert(mapText, 'Standalone file lacks its flat ES module import map');
  const { imports } = JSON.parse(mapText);
  assert(imports && typeof imports === 'object' && !Array.isArray(imports), 'Invalid standalone import map');
  const entry = standalone.match(/<script\b[^>]*id=["']atlas-standalone-entry["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  assert(/^\s*import\s+["']atlas\/app\.js["'];?\s*$/.test(entry || ''), 'Standalone entry must use its mapped app module');
  const moduleEdges = new Map();
  for (const [specifier, url] of Object.entries(imports)) {
    assert(/^atlas\/(?:[\w.-]+\/)*[\w.-]+\.js$/.test(specifier), `Invalid standalone module alias: ${specifier}`);
    assert(typeof url === 'string' && /^data:text\/javascript;base64,[A-Za-z0-9+/]*={0,2}$/.test(url), `Missing embedded module: ${specifier}`);
    const file = path.resolve(dist, specifier.slice('atlas/'.length));
    assert(file.startsWith(`${dist}${path.sep}`), `Standalone alias escapes dist: ${specifier}`);
    const decoded = Buffer.from(url.slice('data:text/javascript;base64,'.length), 'base64').toString('utf8');
    const original = await readFile(file, 'utf8');
    // Verify module identity as well as reference closure. A swapped or stale
    // module can have valid imports but still be the wrong published product.
    const expected = original.replace(/\b(?:from\s*|import\s*\(\s*|import\s*)(['"])(\.\.?\/[^'"\r\n]+)\1/g, (full, quote, imported) => {
      const target = path.resolve(path.dirname(file), imported.split(/[?#]/)[0]);
      assert(target.startsWith(`${dist}${path.sep}`), `Standalone module escapes dist: ${specifier}`);
      return full.replace(`${quote}${imported}${quote}`, JSON.stringify(`atlas/${path.relative(dist, target).split(path.sep).join('/')}`));
    });
    assert.equal(decoded, expected, `Standalone module differs from its source: ${specifier}`);
    const edges = [...decoded.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)(['"])([^'"\r\n]+)\1/g)].map(match => match[2]);
    for (const dependency of edges) assert(Object.hasOwn(imports, dependency), `Unmapped standalone import: ${specifier} -> ${dependency}`);
    moduleEdges.set(specifier, edges);
  }
  const reachable = new Set(), visit = specifier => {
    assert(moduleEdges.has(specifier), `Missing standalone entry: ${specifier}`);
    if (reachable.has(specifier)) return;
    reachable.add(specifier);
    for (const dependency of moduleEdges.get(specifier)) visit(dependency);
  };
  visit('atlas/app.js');
  assert.equal(reachable.size, moduleEdges.size, 'Standalone contains unreachable duplicate module entries');
  assert(!/\b(?:src|href)\s*=\s*["']\.\.?\//i.test(standalone), 'Standalone file still references a local file');
  const baseStyle = standalone.match(/<style>\s*([\s\S]*?)<\/style>/i)?.[1];
  assert(baseStyle && /^:root\s*\{/.test(baseStyle),
    'Standalone base CSS is malformed before :root; check font import removal');
}
console.log(JSON.stringify({ status: 'ok', files: files.length, checkedReferences, basePath: base.pathname, standalone: args[1] ?? null }));
