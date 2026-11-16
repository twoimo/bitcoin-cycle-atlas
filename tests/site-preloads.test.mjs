import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {collectStaticModuleGraph, createSitePreloads, buildSitePreloads} from '../scripts/build-site-preloads.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const preloadTag = /<script id="atlas-boot-preloads">[\s\S]*?<\/script>/;
const files = {
  'dist/index.html': [
    '<!doctype html><html><head>',
    '<link rel="modulepreload" href="./site-entry.js?v=7">',
    '<script id="atlas-boot-preloads">/* previous generated hints */</script>',
    '<link rel="stylesheet" href="./styles.css">',
    '</head><body><script type="module" src="./site-entry.js?v=7"></script></body></html>\n',
  ].join('\n'),
  'dist/site-entry.js':'import "./shell.js?v=3"; await import("./app.js?v=11");\n',
  'dist/app.js':'import "./conference/route.js?v=2"; import "./shared.js"; export const timelineUrl = "conference/timeline.json";\n',
  'dist/shell.js':'export {shared} from "./shared.js";\n',
  'dist/shared.js':'export const shared = "retained source bytes";\n',
  'dist/conference/route.js':'export const loadPlayer = () => import("./player.js?v=13");\n',
  'dist/conference/player.js':'import "./timeline.js"; import "../shared.js"; export const player = true;\n',
  'dist/conference/timeline.js':'export const schemaVersion = 1;\n',
  'dist/conference/timeline.json':'{"schemaVersion":1,"event":{"id":"plspo-2026-10-31"},"segments":[]}\n',
  'dist/styles.css':':root { --text: #dbdbdb; }\n',
};

async function fixture(t, sourceFiles = files) {
  const root = await mkdtemp(resolve(tmpdir(), 'atlas-site-preloads-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  for (const [file, source] of Object.entries(sourceFiles)) {
    await mkdir(dirname(resolve(root, file)), {recursive:true});
    await writeFile(resolve(root, file), source);
  }
  return root;
}

test('static closure keeps breadth-first source order, cycles and full versioned URL identities', async t => {
  const root = await fixture(t, {
    'dist/entry.js': 'import "./left.js?v=1"; export * from "./shared.js?v=1"; const lazy=()=>import("./missing-lazy.js");',
    'dist/left.js': 'import "./cycle.js"; import "./shared.js?v=1"; import "./shared.js?v=2#copy";',
    'dist/shared.js': 'export const value=1;',
    'dist/cycle.js': 'export * from "./left.js?v=1";',
  });
  const graph = await collectStaticModuleGraph(resolve(root, 'dist'), ['./entry.js?v=boot']);
  assert.deepEqual(graph.map(node => node.url), [
    './entry.js?v=boot', './left.js?v=1', './shared.js?v=1', './cycle.js', './shared.js?v=2#copy',
  ]);
  assert.deepEqual(graph.map(node => node.depth), [0,1,1,2,2]);
  assert.deepEqual(graph[0].imports, [
    {specifier:'./left.js?v=1',url:'./left.js?v=1'},
    {specifier:'./shared.js?v=1',url:'./shared.js?v=1'},
  ]);
  const shared = graph.filter(node => node.file === 'shared.js');
  assert.equal(shared.length, 2, 'Different module URL identities must not collapse by physical file');
  assert.equal(shared[0].sha256, shared[1].sha256);
  assert.equal(shared[0].bytes, shared[1].bytes);
  assert.ok(graph.every(node => !node.url.includes('lazy')));
  assert.deepEqual(await collectStaticModuleGraph(resolve(root, 'dist'), ['./entry.js?v=boot']), graph);
});

test('generator discovers the three live entry URLs and hashes every original module and the JSON', async t => {
  const root = await fixture(t);
  const result = await createSitePreloads(root);
  assert.deepEqual(result.manifest.roots, ['./site-entry.js?v=7','./app.js?v=11','./conference/player.js?v=13']);
  assert.equal(result.manifest.sharedModulePreload, './site-entry.js?v=7');
  assert.deepEqual(result.manifest.modulePreloads, [
    './conference/timeline.js', './app.js?v=11', './conference/player.js?v=13',
    './shell.js?v=3', './conference/route.js?v=2', './shared.js',
  ]);
  assert.equal(new Set(result.manifest.modulePreloads).size, result.manifest.modulePreloads.length);
  for (const node of result.manifest.modules) {
    const original = await readFile(resolve(root, 'dist', node.file));
    assert.equal(node.bytes, original.length, node.url);
    assert.equal(node.sha256, sha256(original), node.url);
  }
  const json = await readFile(resolve(root, 'dist/conference/timeline.json'));
  for (const [key, value] of Object.entries({url:'./conference/timeline.json',bytes:json.length,
    sha256:sha256(json),rel:'preload',as:'fetch',crossorigin:'anonymous',fetchpriority:'high'})) {
    assert.equal(result.manifest.timeline[key], value, key);
  }
  assert.equal(result.html.match(preloadTag)?.[0], result.script);
  assert.ok(result.html.indexOf(result.script) < result.html.indexOf('<link rel="stylesheet"'));
  assert.equal(result.html.replace(preloadTag, 'HINTS'), files['dist/index.html'].replace(preloadTag, 'HINTS'),
    'HTML outside the conference hint block stays byte identical');
  assert.deepEqual(JSON.parse(result.manifestBytes), result.manifest);
  assert.deepEqual(await createSitePreloads(root), result, 'No timestamp or traversal randomness enters generation');
});

test('writing and checking hints preserve all original module bytes, import order, data and CSS', async t => {
  const root = await fixture(t);
  await assert.rejects(buildSitePreloads(root, {check:true}));
  const initial = await createSitePreloads(root);
  await buildSitePreloads(root);
  const index = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  const manifest = await readFile(resolve(root, 'docs/conference/boot-preload-graph.json'), 'utf8');
  assert.equal(index, initial.html);
  assert.equal(manifest, initial.manifestBytes);
  for (const [file, source] of Object.entries(files).filter(([file]) => file !== 'dist/index.html')) {
    assert.equal(await readFile(resolve(root, file), 'utf8'), source, file);
  }
  await buildSitePreloads(root, {check:true});
  await buildSitePreloads(root);
  assert.equal(await readFile(resolve(root, 'dist/index.html'), 'utf8'), index);
  assert.equal(await readFile(resolve(root, 'docs/conference/boot-preload-graph.json'), 'utf8'), manifest);
});

test('a leaf byte change makes generated evidence stale even when its dependency graph is unchanged', async t => {
  const root = await fixture(t);
  await buildSitePreloads(root);
  const before = await createSitePreloads(root);
  await writeFile(resolve(root, 'dist/shared.js'), 'export const shared = "different exact bytes";\n');
  await assert.rejects(buildSitePreloads(root, {check:true}));
  const after = await createSitePreloads(root);
  assert.deepEqual(after.manifest.modulePreloads, before.manifest.modulePreloads);
  assert.notEqual(after.manifest.modules.find(node => node.file === 'shared.js').sha256,
    before.manifest.modules.find(node => node.file === 'shared.js').sha256);
  await buildSitePreloads(root);
  await buildSitePreloads(root, {check:true});
});

test('new static edges enter the generated closure while a missing lazy branch is never prefetched', async t => {
  const root = await fixture(t);
  await buildSitePreloads(root);
  await writeFile(resolve(root, 'dist/shared.js'),
    'import "./added.js?v=new"; export const shared=1; const later=()=>import("./missing-lazy.js");\n');
  await writeFile(resolve(root, 'dist/added.js'), 'export const added=true;\n');
  await assert.rejects(buildSitePreloads(root, {check:true}));
  const changed = await createSitePreloads(root);
  assert.ok(changed.manifest.modulePreloads.includes('./added.js?v=new'));
  assert.ok(changed.manifest.modules.every(node => !node.url.includes('missing-lazy')));
  await buildSitePreloads(root);
  await buildSitePreloads(root, {check:true});
});

test('changed root version queries are discovered from current HTML and imports', async t => {
  const root = await fixture(t);
  await buildSitePreloads(root);
  const index = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  await writeFile(resolve(root, 'dist/index.html'), index.replaceAll('site-entry.js?v=7','site-entry.js?v=70'));
  await writeFile(resolve(root, 'dist/site-entry.js'), files['dist/site-entry.js'].replace('app.js?v=11','app.js?v=110'));
  await writeFile(resolve(root, 'dist/conference/route.js'), files['dist/conference/route.js'].replace('player.js?v=13','player.js?v=130'));
  await assert.rejects(buildSitePreloads(root, {check:true}));
  const result = await createSitePreloads(root);
  assert.deepEqual(result.manifest.roots, ['./site-entry.js?v=70','./app.js?v=110','./conference/player.js?v=130']);
  assert.equal(result.manifest.sharedModulePreload, './site-entry.js?v=70');
  assert.ok(result.manifest.modulePreloads.includes('./app.js?v=110'));
  assert.ok(result.manifest.modulePreloads.includes('./conference/player.js?v=130'));
  assert.ok(!result.manifest.modulePreloads.includes('./app.js?v=11'));
});

test('stale generated HTML and altered manifest bytes are independently rejected', async t => {
  const root = await fixture(t);
  await buildSitePreloads(root);
  const indexPath = resolve(root, 'dist/index.html');
  const manifestPath = resolve(root, 'docs/conference/boot-preload-graph.json');
  const originalIndex = await readFile(indexPath, 'utf8');
  const originalManifest = await readFile(manifestPath, 'utf8');
  await writeFile(indexPath, originalIndex.replace(preloadTag, '<script id="atlas-boot-preloads">/* stale */</script>'));
  await assert.rejects(buildSitePreloads(root, {check:true}));
  await writeFile(indexPath, originalIndex);
  await writeFile(manifestPath, originalManifest + '\n');
  await assert.rejects(buildSitePreloads(root, {check:true}));
  await writeFile(manifestPath, originalManifest);
  await buildSitePreloads(root, {check:true});
});

test('outside, symlink escape, missing and nonlocal dependencies fail generation', async t => {
  const root = await fixture(t, {'dist/entry.js':'','outside.js':'export const outside=true;'});
  const dist = resolve(root, 'dist');
  await symlink(resolve(root, 'outside.js'), resolve(dist, 'linked.js'));
  for (const specifier of ['../outside.js','./linked.js','./missing.js','https://example.invalid/remote.js',
    '//example.invalid/remote.js','bare-package','/outside.js']) {
    await writeFile(resolve(dist, 'entry.js'), `import ${JSON.stringify(specifier)};\n`);
    await assert.rejects(collectStaticModuleGraph(dist, ['./entry.js']), undefined, specifier);
  }
});
