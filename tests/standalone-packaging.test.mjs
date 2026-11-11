import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { standaloneModuleMap } from '../scripts/standalone-modules.mjs';
import { verifyStandaloneArtifact } from '../scripts/standalone-verification.mjs';
import { javascriptModuleReferences, javascriptModuleSpecifiers } from '../scripts/module-references.mjs';
import { isolatedPackagingFixture } from './helpers/isolated-packaging-fixture.mjs';
import {parseHTML} from 'linkedom';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(root, 'tests/helpers/standalone-runtime.mjs');
const decode = url => Buffer.from(url.slice('data:text/javascript;base64,'.length), 'base64').toString('utf8');

async function fixture(t, files) {
  const directory = await mkdtemp(resolve(tmpdir(), 'atlas-standalone-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  for (const [name, source] of Object.entries(files)) {
    await mkdir(dirname(resolve(directory, name)), {recursive:true});
    await writeFile(resolve(directory, name), source);
  }
  return directory;
}

test('module references include exact quoted source spans without changing the existing string API', () => {
  const source = `/* import './ghost.js'; */
import value from /* note */ "\\x2e/real.js?v=1";
const example = 'export * from "./ghost.js"';
const lazy = import('./lazy.js');`;
  const references = javascriptModuleReferences(source);
  assert.deepEqual(references.map(reference => reference.specifier), javascriptModuleSpecifiers(source));
  assert.deepEqual(references.map(({start, end}) => source.slice(start, end)), ['"\\x2e/real.js?v=1"', "'./lazy.js'"]);
});

test('a shared dependency is encoded once and version/hash aliases keep the existing snapshot identity', async t => {
  const directory = await fixture(t, {
    'site-entry.js':'import "./left.js"; import "./right.js";',
    'left.js':'export * from "./shared.js?v=1";',
    'right.js':'export * from "./shared.js?v=2#alias";',
    'shared.js':'export const value = 42;',
  });
  const bundle = await standaloneModuleMap(directory);
  assert.equal(Object.keys(bundle.imports).length, 4);
  for (const id of ['@atlas/left.js', '@atlas/right.js']) {
    assert.deepEqual(javascriptModuleSpecifiers(decode(bundle.imports[id])), ['@atlas/shared.js']);
    assert(!decode(bundle.imports[id]).includes('data:text/javascript;base64,'));
  }
  assert.deepEqual(await standaloneModuleMap(directory), bundle);
});

test('source prose, comments, regexps and template text are untouched while literal imports are rewritten', async t => {
  const source = [
    `const title = "from './not-a-module.js'";`,
    `// import('./ghost.js');`,
    `const regexp = /import\('ghost'\)/;`,
    'const template = `import("./not-code.js") ${import("./real.js")}`;',
    `import /* comment */ './real.js';`,
    `export * from './real.js';`,
  ].join('\n');
  const directory = await fixture(t, {'site-entry.js':source, 'real.js':'export const value = 1;'});
  const bundle = await standaloneModuleMap(directory);
  const rewritten = decode(bundle.imports[bundle.entry]);
  assert.equal(rewritten, source.replace('import("./real.js")', 'import("@atlas/real.js")')
    .replace("import /* comment */ './real.js'", 'import /* comment */ "@atlas/real.js"')
    .replace("export * from './real.js'", 'export * from "@atlas/real.js"'));
  assert.equal(Object.keys(bundle.imports).length, 2);
});

test('real module evaluation preserves cycles, side effects, re-exports, shared instances and dynamic import', async t => {
  const directory = await fixture(t, {
    'site-entry.js':[
      'import "./shared.js?v=1";',
      'import {marker} from "./shared.js?v=2";',
      'import {value} from "./reexport.js";',
      'import {readCycle} from "./cycle-a.js";',
      'const lazy = await import("./lazy.js");',
      'globalThis.result = {count:globalThis.count, shared:marker === lazy.marker, value, cycle:readCycle()};',
    ].join('\n'),
    'shared.js':'globalThis.count = (globalThis.count || 0) + 1; export const marker = {}; export const value = 42;',
    'reexport.js':'export {value} from "./shared.js";',
    'lazy.js':'export {marker} from "./shared.js#lazy";',
    'cycle-a.js':'import {readB} from "./cycle-b.js"; export const a = "a"; export const readCycle = () => a + readB();',
    'cycle-b.js':'import {a} from "./cycle-a.js"; export const readB = () => "b" + a;',
  });
  const bundle = await standaloneModuleMap(directory);
  const file = resolve(directory, 'bundle.json');
  await writeFile(file, JSON.stringify(bundle));
  const {stdout} = await run(process.execPath, ['--experimental-vm-modules', runtime, 'fixture', file]);
  assert.deepEqual(JSON.parse(stdout), {modules:6, result:{count:1, shared:true, value:42, cycle:'aba'}});
});

test('outside, missing and nonlocal module dependencies stop packaging', async t => {
  const directory = await fixture(t, {'site-entry.js':''});
  for (const [specifier, expected] of [
    ['../outside.js', /Module outside dist/],
    ['https://example.com/library.js', /requires a relative module/],
    ['package', /requires a relative module/],
    ['./missing.js', /ENOENT/],
  ]) {
    await writeFile(resolve(directory, 'site-entry.js'), `import ${JSON.stringify(specifier)};`);
    await assert.rejects(standaloneModuleMap(directory), expected);
  }
});

test('the real standalone is deterministic, preserves every module and snapshot, and passes the runtime parser/linker', async t => {
  const publicationPath=resolve(root,'dist/publication.json');
  const publicationBytes=()=>readFile(publicationPath).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const before=await publicationBytes();
  const isolated=await isolatedPackagingFixture(root,{environment:{...process.env,WORKERS_CI:'1',WORKERS_CI_COMMIT_SHA:'0'.repeat(40)}});
  t.after(isolated.cleanup);t.after(async()=>assert.deepEqual(await publicationBytes(),before,'Packaging tests must not replace the browser-served publication'));
  const {directory}=isolated,options={cwd:directory,env:isolated.environment};
  const first = resolve(directory, 'first.html'), second = resolve(directory, 'second.html');
  const builder = resolve(directory, 'scripts/build-standalone.mjs');
  await run(process.execPath,[resolve(directory,'scripts/build-publication.mjs'),'--preview'],options);
  const buildStarted=performance.now();
  await run(process.execPath, [builder, first],options);
  const buildMilliseconds=performance.now()-buildStarted;
  await run(process.execPath, [builder, second],options);
  const html = await readFile(first, 'utf8');
  assert.equal(await readFile(second, 'utf8'), html);
  const verification = await verifyStandaloneArtifact(html, isolated.dist);
  t.diagnostic(JSON.stringify({standaloneBytes:Buffer.byteLength(html),buildMilliseconds:Math.round(buildMilliseconds),relayImages:verification.relayImages,relayImageBytes:verification.relayImageBytes}));
  const bundle = await standaloneModuleMap(isolated.dist);
  assert.equal(verification.modules, Object.keys(bundle.imports).length);
  assert.equal(verification.snapshots, 10); // Existing nine plus the exact relay source.
  assert.ok(verification.forecastRecords>=5,'all five initial economic scenarios have actual preserved outputs');
  assert.equal(verification.stylesheets, 41); // Includes the conference player and the common two-row quote HUD.
  for (const file of ['conference/route.js', 'conference/player.js', 'conference/timeline.js']) {
    assert.ok(Object.hasOwn(bundle.imports, '@atlas/' + file), file + ' remains in the offline module graph');
  }
  const conferenceStyle = `<style>\n${await readFile(resolve(isolated.dist, 'conference/player.css'), 'utf8')}\n</style>`;
  assert.equal(html.split(conferenceStyle).length - 1, 1, 'conference player styles are preserved exactly once');
  await assert.rejects(verifyStandaloneArtifact(html.replace(conferenceStyle, ''), isolated.dist), /Missing or changed stylesheet: conference\/player\.css/);
  const monthlyStyle = `<style>\n${await readFile(resolve(root, 'dist/monthly-backtest.css'), 'utf8')}\n</style>`;
  assert.equal(html.split(monthlyStyle).length - 1, 1, 'monthly backtest styles are preserved exactly once');
  assert.match(html,/\.forecast-journal\s*\{/,'the archived forecast workspace retains its offline styles');
  const replayStyle = `<style>\n${await readFile(resolve(root, 'dist/chart-replay.css'), 'utf8')}\n</style>`;
  assert.equal(html.split(replayStyle).length - 1, 1, 'inline chart replay embeds its exact stylesheet once');
  const shellStyle = `<style>\n${await readFile(resolve(root, 'dist/atlas-shell.css'), 'utf8')}\n</style>`;
  assert.equal(html.split(shellStyle).length - 1, 1, 'the shared shell remains exact and offline');
  for(const file of ['vendor/skullet/styles.css','loading-surfaces.css','compact-toolbar.css','ui/rsi-simulation.css','legacy-workspace-toolbar.css','editorial-system.css','editorial-panels.css','editorial-ledgers.css','relay-room.css','ui/chart-legend.css','ui/quote-hud.css']){const style=`<style>\n${await readFile(resolve(isolated.dist,file),'utf8')}\n</style>`;assert.equal(html.split(style).length-1,1,file+' is exact and offline');}
  const simulationStyle=`<style>\n${await readFile(resolve(isolated.dist,'ui/rsi-simulation.css'),'utf8')}\n</style>`;
  await assert.rejects(verifyStandaloneArtifact(html.replace(simulationStyle,''),isolated.dist),/Missing or changed stylesheet: ui\/rsi-simulation\.css/);
  const editorialStyle = `<style>\n${await readFile(resolve(root, 'dist/editorial-system.css'), 'utf8')}\n</style>`;
  await assert.rejects(verifyStandaloneArtifact(html.replace(editorialStyle, ''), isolated.dist), /Missing or changed stylesheet: editorial-system\.css/);
  await assert.rejects(verifyStandaloneArtifact(html.replace(replayStyle, '<style>.chart-replay-controls{display:none}</style>'), isolated.dist), /Missing or changed stylesheet: chart-replay\.css/);
  const {stdout} = await run(process.execPath, ['--experimental-vm-modules', runtime, 'artifact', first]);
  assert.deepEqual(JSON.parse(stdout), {modules:verification.modules, parsed:true, linked:true});
  const relayMatch=html.match(/(<script id="embedded-relay-data" type="application\/json">)([\s\S]*?)(<\/script>)/);
  assert.ok(relayMatch,'the exact relay source must be embedded');
  const relayRaw=await readFile(resolve(isolated.dist,'data/relay/index.json'),'utf8');
  assert.equal(relayMatch[2],relayRaw.replaceAll('<','\\u003c'),'HTML escaping preserves every source byte after decoding');
  assert.deepEqual(JSON.parse(relayMatch[2]),JSON.parse(relayRaw));
  await assert.rejects(verifyStandaloneArtifact(html.replace(relayMatch[0],()=>relayMatch[1]+' '+relayMatch[2]+relayMatch[3]),isolated.dist),/Changed embedded relay source bytes/);
  const relay=JSON.parse(relayMatch[2]);relay.rooms[0].title+=' changed';
  await assert.rejects(verifyStandaloneArtifact(html.replace(relayMatch[0],()=>relayMatch[1]+JSON.stringify(relay)+relayMatch[3]),isolated.dist),/Changed embedded snapshot: relay/);
  await assert.rejects(verifyStandaloneArtifact(html.replace(relayMatch[0],''),isolated.dist),/Missing or repeated snapshot: relay/);
  const relayAssetsMatch=html.match(/(<script id="embedded-relay-assets" type="application\/json">)([\s\S]*?)(<\/script>)/);
  assert.ok(relayAssetsMatch,'offline relay image bytes must be embedded');
  const relayAssets=JSON.parse(relayAssetsMatch[2]);
  assert.ok(verification.relayImages>0);assert.equal(verification.relayImages,Object.keys(relayAssets).length);
  for(const [path,url]of Object.entries(relayAssets))assert.deepEqual(Buffer.from(url.slice(url.indexOf(',')+1),'base64'),await readFile(resolve(isolated.dist,path)),path+' retains exact image bytes');
  const changedRelayAssets={...relayAssets,[Object.keys(relayAssets)[0]]:'data:image/jpeg;base64,AAAA'};
  await assert.rejects(verifyStandaloneArtifact(html.replace(relayAssetsMatch[0],()=>relayAssetsMatch[1]+JSON.stringify(changedRelayAssets)+relayAssetsMatch[3]),isolated.dist),/Changed embedded relay image bytes/);
  const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  const map = JSON.parse(mapMatch[1]);
  const {initRelayRoomView}=await import(map.imports['@atlas/relay-room.js']);
  const {document,window}=parseHTML('<section id="relay"></section>'),relayRoot=document.getElementById('relay');
  const previousFetch=globalThis.fetch,fetches=[];globalThis.fetch=async url=>{fetches.push(url);throw new Error('Standalone relay requested an external resource');};
  try{
    let ready;const loaded=new Promise(resolve=>{ready=resolve;});
    const controller=initRelayRoomView({root:relayRoot,embeddedData:()=>relayMatch[2],embeddedAssets:()=>relayAssetsMatch[2],onReady:ready});
    controller.show(true);await loaded;
    const source=JSON.parse(relayRaw),seenImages=new Set();
    const click=selector=>{const target=relayRoot.querySelector(selector);assert.ok(target,selector);target.dispatchEvent(new window.Event('click',{bubbles:true}));};
    const checkImages=paths=>{const nodes=[...relayRoot.querySelectorAll('img')];assert.equal(nodes.length,paths.length);nodes.forEach((node,index)=>{assert.ok(node.getAttribute('src')===relayAssets[paths[index]],'the rendered image must use its exact embedded bytes');seenImages.add(paths[index]);});};
    for(const room of source.rooms){
      click(`[data-room="${room.id}"]`);
      if(room.kind==='chat')checkImages((room.messages||[]).flatMap(message=>(message.images||[]).map(image=>typeof image==='string'?image:image.src)));
      if(room.kind==='articles')for(const article of room.articles){
        click(`[data-article="${article.id}"]`);
        assert.equal(relayRoot.querySelector('.relay-body').textContent.replace(/[\u200b\u200c\u200d\u2060\ufeff]/g,'').replace(/\s+/g,''),String(article.body_text).replace(/[\u200b\u200c\u200d\u2060\ufeff]/g,'').replace(/\s+/g,''));
        checkImages((article.images||[]).map(image=>typeof image==='string'?image:image.src));
        click('[data-relay-action="article-back"]');
      }
      if(room.kind==='editions')for(const [editionIndex,edition]of room.editions.entries()){
        click(`[data-edition="${editionIndex}"]`);
        for(const [pageIndex,page]of edition.pages.entries()){click(`[data-page="${pageIndex}"]`);checkImages(page.image?[page.image]:[]);}
      }
    }
    assert.deepEqual([...seenImages].sort(),Object.keys(relayAssets).sort());assert.deepEqual(fetches,[]);
  }finally{globalThis.fetch=previousFetch;}
  const changed = structuredClone(map);
  delete changed.imports['@atlas/cycle-engine.js'];
  await assert.rejects(verifyStandaloneArtifact(html.replace(mapMatch[1], JSON.stringify(changed)), isolated.dist), /Unmapped module/);
  const damaged = structuredClone(map);
  damaged.imports['@atlas/cycle-engine.js'] = 'data:text/javascript;base64,' + Buffer.from(decode(damaged.imports['@atlas/cycle-engine.js']) + '\n// corruption').toString('base64');
  await assert.rejects(verifyStandaloneArtifact(html.replace(mapMatch[1], JSON.stringify(damaged)), isolated.dist), /Changed module source/);
  const dataMatch = html.match(/(<script id="embedded-btc-data" type="application\/json">)([\s\S]*?)(<\/script>)/);
  const data = JSON.parse(dataMatch[2]);
  data.prices[0][1] += 1;
  await assert.rejects(verifyStandaloneArtifact(html.replace(dataMatch[0], dataMatch[1] + JSON.stringify(data) + dataMatch[3]), isolated.dist), /Changed embedded snapshot/);
  const marketMatch=html.match(/(<script id="embedded-market-lab-data" type="application\/json">)([\s\S]*?)(<\/script>)/);
  assert.ok(marketMatch,'research snapshot must be embedded');
  const market=JSON.parse(marketMatch[2]);market.markets[0].prices[0][1]+=1;
  await assert.rejects(verifyStandaloneArtifact(html.replace(marketMatch[0],marketMatch[1]+JSON.stringify(market)+marketMatch[3]),isolated.dist),/Changed embedded snapshot: market-lab/);
  const marketStyle=`<style>\n${await readFile(resolve(root,'dist/market-lab.css'),'utf8')}\n</style>`;
  await assert.rejects(verifyStandaloneArtifact(html.replace(marketStyle,''),isolated.dist),/Missing or changed stylesheet: market-lab\.css/);
  const archiveMatch=html.match(/(<script id="atlas-forecast-ledger" type="application\/json">)([\s\S]*?)(<\/script>)/);
  const archive=JSON.parse(archiveMatch[2]);Object.values(archive.records)[0].targets[0].price+=1;
  await assert.rejects(verifyStandaloneArtifact(html.replace(archiveMatch[0],archiveMatch[1]+JSON.stringify(archive)+archiveMatch[3]),isolated.dist),/Changed embedded forecast archive/);
  const projectMatch=html.match(/(<script id="atlas-project-origin-baseline" type="application\/json">)([\s\S]*?)(<\/script>)/);
  const project=JSON.parse(projectMatch[2]);
  assert.equal(project.sourceText,await readFile(resolve(root,'dist/data/project-origin-btc-2026-10-21.json'),'utf8'));
  const changedProject=JSON.parse(project.sourceText);changedProject.scenario.path[1].price+=1;
  project.sourceText=JSON.stringify(changedProject);
  await assert.rejects(verifyStandaloneArtifact(html.replace(projectMatch[0],projectMatch[1]+JSON.stringify(project)+projectMatch[3]),isolated.dist),/Changed embedded project origin baseline/);
  await assert.rejects(verifyStandaloneArtifact(html.replace(mapMatch[0], ''), isolated.dist), /exactly one import map/);
});
