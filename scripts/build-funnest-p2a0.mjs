#!/usr/bin/env node
// P2A0-6ffbdda: isolated experiment. Nothing is emitted to production dist/.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {dirname, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync, brotliCompressSync, constants} from 'node:zlib';
import {p0CssDeclarations} from './ui-renewal-p0-contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const spike = resolve(root, 'spikes/funnest-p2a0'), output = resolve(root, 'build/p2a0/site');
const args = process.argv.slice(2), check = args.includes('--check');
assert.ok(args.length === 0 || args.length === 1 && check, 'Usage: node scripts/build-funnest-p2a0.mjs [--check]');
const require = createRequire(resolve(spike, 'package.json'));
const {build, version} = require('esbuild');
assert.equal(version, '0.28.2', 'Use the pinned spike bundler');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const size = bytes => ({rawBytes:bytes.length, gzipBytes:gzipSync(bytes,{level:9}).length,
  brotliBytes:brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).length, sha256:hash(bytes)});
const sources = new Map(), files = new Map();
async function input(file) {
  const sourceFile=file.split(/[?#]/)[0], path=resolve(root,sourceFile);
  assert.ok(path.startsWith(root.endsWith('/')?root:root+'/'),'Build input escapes repository');
  const bytes = await readFile(path); sources.set(file,{sourceFile,bytes:bytes.length,sha256:hash(bytes)}); return bytes;
}
async function copy(from, to) { files.set(to, await input(from)); }
async function packageEntry(name) {
  const folder=resolve(spike,'node_modules',name), pkg=JSON.parse(await readFile(resolve(folder,'package.json'),'utf8'));
  assert.equal(pkg.name,name); assert.equal(pkg.version,'0.6.16',name);
  const entry=resolve(folder,pkg.exports['.'].import);
  assert.ok(entry.startsWith(folder+'/'),'Package entry escapes its pinned directory');
  return entry;
}
for (const name of ['@funnest/charts-ui','@funnest/charts']) {
  await packageEntry(name);
}
const lock = JSON.parse((await input('spikes/funnest-p2a0/package-lock.json')).toString());
for (const name of ['@funnest/charts-ui','@funnest/charts']) {
  assert.equal(lock.packages['node_modules/'+name].version,'0.6.16',name+' lock');
  assert.ok(lock.packages['node_modules/'+name].integrity.startsWith('sha512-'),name+' integrity');
}
await input('scripts/build-funnest-p2a0.mjs');
await input('scripts/ui-renewal-p0-contract.mjs');
await input('spikes/funnest-p2a0/package.json');
const snapshotBytes = await input('dist/data/btc-volume.json'), snapshot = JSON.parse(snapshotBytes);
const dataset = {file:'data/btc-volume.json',archivePath:'dist/data/btc-volume.json',sha256:hash(snapshotBytes),
  barCount:snapshot.bars.length,rows:snapshot.bars.length,firstTime:snapshot.bars[0].time*1000,
  lastTime:snapshot.bars.at(-1).time*1000,firstDate:snapshot.firstDate,lastDate:snapshot.lastDate,
  source:snapshot.source,product:snapshot.product,retrievedAt:snapshot.retrievedAt,completedOnly:snapshot.completedOnly};
files.set('data/btc-volume.json',snapshotBytes);

// Copy only the wrapper's original role declarations and their variable
// dependencies. Do not import Atlas component CSS over the package's controls.
const css = (await input('dist/styles.css')).toString();
const declarations = p0CssDeclarations(css).declarations.filter(row=>row.selector===':root' && row.ancestors.length===0 && row.property.startsWith('--'));
const tokens = new Map(declarations.map(row=>[row.property,row.value])), needed = new Set();
function token(name) {
  if (needed.has(name)) return;
  assert.ok(tokens.has(name),'Unknown shared token '+name); needed.add(name);
  for (const match of tokens.get(name).matchAll(/var\(\s*(--[\w-]+)/g)) token(match[1]);
}
for (const name of ['--bg','--surface','--text','--muted','--border-strong','--accent-ink','--focus','--font']) token(name);
files.set('atlas-tokens.css',Buffer.from('/* Exact shared Atlas token values; temporary page only. */\n:root {\n'+[...needed].map(name=>'  '+name+': '+tokens.get(name)+';').join('\n')+'\n}\n'));
await copy('spikes/funnest-p2a0/index.html','index.html');
await copy('spikes/funnest-p2a0/spike.css','spike.css');
await copy('dist/favicon.svg','favicon.svg');
async function copyFonts(dir,prefix='fonts/pretendard/') {
  for (const item of (await readdir(resolve(root,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    assert.ok(!item.isSymbolicLink(),'Font inputs must not be symlinks');
    if (item.isDirectory()) await copyFonts(dir+'/'+item.name,prefix+item.name+'/');
    else if (/\.(?:css|woff2)$/.test(item.name) || item.name==='OFL.txt') await copy(dir+'/'+item.name,prefix+item.name);
  }
}
await copyFonts('dist/fonts/pretendard');
const licenseNames=['FUNNEST-LICENSE.txt','FUNNEST-NOTICE.txt','PREACT-LICENSE.txt'];
const notices=[];
for (const name of licenseNames) notices.push((await input('spikes/funnest-p2a0/licenses/'+name)).toString());
notices.push((await input('dist/fonts/pretendard/OFL.txt')).toString());
files.set('THIRD_PARTY_NOTICES.txt',Buffer.from('Atlas P2a-0 temporary engine evaluation\n@funnest/charts-ui and @funnest/charts 0.6.16; bundled Preact 11.2.0; local Pretendard\n\n'+notices.join('\n\n---\n\n')));

const options={absWorkingDir:root,bundle:true,format:'esm',platform:'browser',target:['es2022'],
  charset:'utf8',minify:true,treeShaking:true,write:false,metafile:true,legalComments:'external',
  banner:{js:'/*! Atlas P2a-0 · @funnest/charts-ui 0.6.16 · Apache-2.0 / Preact MIT · see THIRD_PARTY_NOTICES.txt */'}};
const result = await build({...options,entryPoints:[resolve(spike,'main.mjs')],outfile:resolve(output,'spike.js'),
  define:{__SPIKE_DATASET__:JSON.stringify(dataset)}});
for (const asset of result.outputFiles) files.set(relative(output,asset.path),Buffer.from(asset.contents));
for (const file of Object.keys(result.metafile.inputs)) {
  if (file === '<define:__SPIKE_DATASET__>') {
    const bytes=Buffer.from(JSON.stringify(dataset));
    sources.set(file,{bytes:bytes.length,sha256:hash(bytes),derivedFrom:'dist/data/btc-volume.json'});
  } else await input(file);
}
const packageOnly = await build({...options,stdin:{contents:"export {createTradingChart} from '@funnest/charts-ui';",resolveDir:spike,sourcefile:'package-only.mjs'},outfile:resolve(output,'package-only.js')});
const packageBytes = Buffer.from(packageOnly.outputFiles.find(file=>file.path.endsWith('/package-only.js')).contents);
const upstream={};
for (const name of ['@funnest/charts-ui','@funnest/charts']) {
  const entry=await packageEntry(name); upstream[name]={version:'0.6.16',integrity:lock.packages['node_modules/'+name].integrity,...size(await readFile(entry))};
}
const measurements=Object.fromEntries([...files].map(([file,bytes])=>[file,size(bytes)]));
const baseline='6ffbdda618ad67df6aa47d62bf52f8ce7fc159ba';
const productionScopes=['dist','apps','packages','package.json','package-lock.json','scripts/build-site-preloads.mjs','scripts/build-site-styles.mjs','scripts/build-pages.mjs'];
const changed=execFileSync('git',['diff','--name-only',baseline,'--',...productionScopes],{cwd:root,encoding:'utf8'}).trim();
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','--',...productionScopes],{cwd:root,encoding:'utf8'}).trim();
assert.equal(changed,'','P2a-0 must leave the production entry graph and data unchanged');
assert.equal(untracked,'','P2a-0 must not add an untracked production entry');
const report={schemaVersion:1,kind:'atlas-funnest-p2a0-bundle',nativeEvidence:false,productionIntegrated:false,
  versions:{ui:'0.6.16',core:'0.6.16',esbuild:version},upstream,
  bundle:measurements['spike.js'],packageOnlyBundle:size(packageBytes),
  dataset,files:measurements,sourceInputs:Object.fromEntries([...sources].sort(([a],[b])=>a.localeCompare(b))),
  productionIsolation:{baseline,checkedScopes:productionScopes,changed:[],untracked:[],method:'Exact Git diff and untracked inventory; no browser timing claim'},
  productionEntryChanges:[],productionAddedRequests:0,productionAddedBytes:0,
  initialPaintedReadyMs:null,a9RuntimeImpactMs:null,
  measurementNotes:'Byte counts are generated artifacts, not browser transfer/timing. Unchanged production graph adds no spike resource; native A-9 still requires measurement.',
  esbuildInputs:result.metafile.inputs};
files.set('bundle-report.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));
for (const [file,bytes] of files) {
  const target=resolve(output,file);assert.ok(target.startsWith(output+'/'));
  if (check) assert.deepEqual(await readFile(target),bytes,'Stale generated spike artifact '+file);
  else {await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
}
// The served experiment must contain exactly this build's assets. Stale files
// could otherwise change HTTP/native evidence while --check still passed.
const actualFiles=[];
async function inventory(directory) {
  for (const item of await readdir(directory,{withFileTypes:true})) {
    const path=resolve(directory,item.name);
    assert.ok(!item.isSymbolicLink(),'Generated site must not contain symlinks');
    if (item.isDirectory()) await inventory(path);
    else {assert.ok(item.isFile(),'Unexpected generated site entry');actualFiles.push(relative(output,path));}
  }
}
await inventory(output);
assert.deepEqual(actualFiles.sort(),[...files.keys()].sort(),'Generated site has stale or missing assets');
console.log(JSON.stringify({status:'passed',mode:check?'check':'write',site:relative(root,output),bundle:report.bundle,
  packageOnlyBundle:report.packageOnlyBundle,dataset:measurements['data/btc-volume.json'],files:files.size,
  productionIntegrated:false,initialPaintedReadyMs:null}));
