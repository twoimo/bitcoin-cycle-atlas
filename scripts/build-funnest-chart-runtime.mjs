import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
assert(process.argv.length === 2 || process.argv.length === 3 && check, 'Usage: node scripts/build-funnest-chart-runtime.mjs [--check]');
const version = '0.6.22', upstream = 'e23919055dfca8d3051f4fc2946356269ab8372b';
const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const webPackage = JSON.parse(await readFile(path.join(root, 'apps/web/package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
assert.equal(rootPackage.devDependencies['@funnest/charts'], version, 'Root Funnest engine pin changed');
for (const name of ['@funnest/charts', '@funnest/charts-react', '@funnest/charts-viz']) assert.equal(webPackage.dependencies[name], version, `${name} pin changed`);
const expected = new Map(), packages = [];
const licenseRoot = `dist/vendor/funnest-charts-${version}`;
for (const name of ['@funnest/charts', '@funnest/charts-react', '@funnest/charts-ui', '@funnest/charts-viz']) {
  const dir = path.join(root, 'node_modules', name), entry = lock.packages[`node_modules/${name}`];
  const installed = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  assert.equal(entry?.version, version, `${name} lockfile provenance changed`);
  assert.equal(installed.version, version, `${name} installed version changed`);
  assert.equal(installed.name, name);
  assert.match(entry.integrity, /^sha512-/);
  assert.equal(entry.resolved, `https://registry.npmjs.org/${name}/-/${name.split('/')[1]}-${version}.tgz`);
  const prefix = name === '@funnest/charts' ? licenseRoot : `${licenseRoot}/${name.split('/')[1]}`;
  for (const file of ['LICENSE', 'NOTICE']) expected.set(`${prefix}/${file}.txt`, await readFile(path.join(dir, file)));
  packages.push({ name, version, license: installed.license, npmTarball: entry.resolved, integrity: entry.integrity });
}
const entries = [], sourceBytes = new Map();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
for (const source of ['src/charts/funnest-chart-runtime.js', 'src/charts/funnest-research-primitives.js']) {
  const sourcePath = path.join(root, source), bytes = await readFile(sourcePath);
  sourceBytes.set(sourcePath, bytes);
  const result = await build({
    absWorkingDir: root, stdin: { contents: bytes.toString(), resolveDir: path.dirname(sourcePath), sourcefile: source, loader: 'js' },
    bundle: true, format: 'esm', platform: 'browser', target: ['es2022'], write: false,
    legalComments: 'inline', minify: false, sourcemap: false,
  });
  const bundle = `dist/${path.basename(source, '.js')}.bundle.js`, output = Buffer.from(result.outputFiles[0].contents);
  expected.set(bundle, output);
  entries.push({ source, sourceSha256: sha256(bytes), bundle, bundleSha256: sha256(output) });
}
const sourceSha256 = entries[0].sourceSha256;
expected.set(`${licenseRoot}/PROVENANCE.json`, Buffer.from(JSON.stringify({
  version, upstreamSnapshot: upstream, repository: `https://github.com/funnest-xyz/funnest-charts/tree/${upstream}`,
  source: 'src/charts/funnest-chart-runtime.js', sourceSha256, entries, packages,
}, null, 2) + '\n'));
for (const [sourcePath, bytes] of sourceBytes) assert.deepEqual(await readFile(sourcePath), bytes, `Runtime source changed during build: ${sourcePath}; retry after its owner finishes`);
for (const [relative, bytes] of expected) {
  const destination = path.join(root, relative);
  if (check) assert.deepEqual(await readFile(destination), bytes, `Stale generated Funnest artifact: ${relative}`);
  else { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes); }
}
console.log(JSON.stringify({ status: check ? 'verified' : 'built', version, files: expected.size, sourceSha256, legalComments: 'inline' }));
