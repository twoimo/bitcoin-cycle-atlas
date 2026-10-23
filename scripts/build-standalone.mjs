import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const output = resolve(process.argv[2] || resolve(root, 'build/Bitcoin_Cycles_Comparison.html'));
const modules = new Map();
const moduleKey = file => `atlas/${relative(dist, file).replaceAll('\\', '/')}`;
async function collectModule(file) {
  if (modules.has(file)) return;
  // Mark before visiting dependencies so shared imports and cycles are stored
  // once. Import maps keep references short instead of recursively embedding
  // entire dependency graphs in every importing module's data URL.
  modules.set(file, null);
  let source = await readFile(file, 'utf8');
  const imports = [...source.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)(['"])(\.\.?\/[^'"\r\n]+)\1/g)];
  for (const match of imports) {
    const imported = resolve(dirname(file), match[2].split(/[?#]/)[0]);
    if (!imported.startsWith(dist + '/')) throw new Error('Module outside dist');
    await collectModule(imported);
    source = source.replace(match[0], match[0].replace(`${match[1]}${match[2]}${match[1]}`, JSON.stringify(moduleKey(imported))));
  }
  modules.set(file, source);
}
let html = await readFile(resolve(dist, 'index.html'), 'utf8');
html = html.replace(/\s*<link\b[^>]*id="atlas-optional-fonts"[^>]*>/, '')
  .replace(/\s*<script\b[^>]*id="atlas-fonts-script"[^>]*>[\s\S]*?<\/script>/, '');
for (const file of ['styles.css', 'compact.css', 'outlook.css', 'lab.css', 'atlas.css', 'viewport.css', 'chart-details-panel.css', 'analysis-dock.css', 'chart-magnet.css', 'mobile-workspace.css', 'workspace-tools.css', 'chart-workspace-controls.css', 'research-annotations.css', 'chart-export-workbench.css', 'cycle-milestones.css', 'compact-chart-layout.css', 'chart-bottom-bar.css']) {
  // Font URLs contain semicolons in their weight lists. Consume the complete
  // url(...) before its terminating semicolon so :root stays valid CSS.
  const css = (await readFile(resolve(dist, file), 'utf8')).replace(/@import\s+url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)\s*;/g, '');
  const stylesheet = new RegExp(`<link rel="stylesheet" href="\\./${file.replaceAll('.', '\\.')}(?:\\?[^"\\s]*)?">`);
  html = html.replace(stylesheet, `<style>\n${css}\n</style>`);
}
const favicon = Buffer.from(await readFile(resolve(dist, 'favicon.svg'))).toString('base64');
html = html.replace('href="./favicon.svg"', `href="data:image/svg+xml;base64,${favicon}"`);
const data = (await readFile(resolve(dist, 'data/btc-daily.json'), 'utf8')).replaceAll('<', '\\u003c');
const ohlc = (await readFile(resolve(dist, 'data/btc-ohlc.json'), 'utf8')).replaceAll('<', '\\u003c');
const volume = (await readFile(resolve(dist, 'data/btc-volume.json'), 'utf8')).replaceAll('<', '\\u003c');
await collectModule(resolve(dist, 'app.js'));
const imports = Object.fromEntries([...modules].sort(([a], [b]) => a.localeCompare(b)).map(([file, source]) =>
  [moduleKey(file), `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`]));
const importMap = JSON.stringify({ imports }).replaceAll('<', '\\u003c');
html = html.replace(/<script type="module" src="\.\/app\.js(?:\?[^"\s]*)?"><\/script>/,
  `<script id="embedded-btc-data" type="application/json">${data}</script>\n  <script id="embedded-ohlc-data" type="application/json">${ohlc}</script>\n  <script id="embedded-volume-data" type="application/json">${volume}</script>\n  <script type="importmap">${importMap}</script>\n  <script id="atlas-standalone-entry" type="module">import "atlas/app.js";</script>`);
if (/\b(?:src|href)=["']\.\//.test(html)) throw new Error('Unresolved local resource');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(JSON.stringify({ file: basename(output), bytes: Buffer.byteLength(html), modules: modules.size, embeddedObservations: JSON.parse(data).prices.length }));
