import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import {javascriptModuleSpecifiers} from '../scripts/module-references.mjs';
import {buildSitePreloads} from '../scripts/build-site-preloads.mjs';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const preloadScript = html.match(/<script id="atlas-boot-preloads">([\s\S]*?)<\/script>/)?.[1];
const manifest = JSON.parse(await readFile(new URL('../docs/conference/boot-preload-graph.json', import.meta.url), 'utf8'));
const entryHref = html.match(/<link rel="modulepreload" href="([^"]+)">/)?.[1];
const siteRoot = 'https://atlas.invalid/bitcoin-cycle-atlas/';

function hints(search, {page = siteRoot, entry = new URL(entryHref, siteRoot).href} = {}) {
  const links = [];
  vm.runInNewContext(preloadScript, {
    URL, URLSearchParams, location:{search, href:page + search},
    document:{
      querySelector(selector) {
        assert.equal(selector, 'link[rel="modulepreload"]');
        assert.equal(new URLSearchParams(search).get('page'), 'conference', 'Other routes do not inspect the preload base');
        return {href:entry};
      },
      createElement(tag) { assert.equal(tag, 'link'); return {}; },
      head:{append(node) { links.push({...node}); }},
    },
  });
  return links;
}

test('the shared entry hint exactly matches the module entry and precedes blocking CSS', () => {
  const entry = html.match(/<script type="module" src="([^"]+)"><\/script>/)?.[1];
  const hint = html.match(/<link rel="modulepreload" href="([^"]+)">/);
  assert.ok(entry && hint);
  assert.equal(hint[1], entry, 'Preload and evaluation must share the same versioned module URL');
  assert.ok(hint.index < html.indexOf('<link rel="stylesheet" href="./styles.css'));
  assert.ok(html.indexOf('id="atlas-boot-resource-script"') < hint.index);
});

test('conference hints schedule the JSON first and the complete static graph without evaluating or mounting it', async () => {
  const links = hints('?page=conference&t=20396.02&deck=r17-clean-257&symbol=ETHUSD');
  assert.deepEqual(links[0], {rel:'preload',as:'fetch',crossOrigin:'anonymous',fetchPriority:'high',
    href:new URL('conference/timeline.json', siteRoot).href});
  const modules = links.slice(1);
  assert.equal(modules.length, manifest.modules.length - 1, 'Only the pre-existing shared entry hint is excluded');
  assert.ok(modules.every(link => link.rel === 'modulepreload'));
  assert.deepEqual(modules.map(link => link.href), manifest.modulePreloads.map(url => new URL(url, siteRoot).href));
  assert.equal(modules[0].href, new URL('conference/timeline.js', siteRoot).href);
  const allModules = [new URL(entryHref, siteRoot).href, ...modules.map(link => link.href)];
  assert.equal(new Set(allModules).size, manifest.modules.length, 'No duplicate module URL hint');
  assert.deepEqual([...allModules].sort(), manifest.modules.map(node => new URL(node.url, siteRoot).href).sort());
  const entry = await readFile(new URL('../dist/site-entry.js', import.meta.url), 'utf8');
  const route = await readFile(new URL('../dist/conference/route.js', import.meta.url), 'utf8');
  const actualApp = javascriptModuleSpecifiers(entry).find(value => value.startsWith('./app.js'));
  assert.ok(allModules.includes(new URL(actualApp, siteRoot).href));
  const actualPlayer = javascriptModuleSpecifiers(route).find(value => value.startsWith('./player.js'));
  assert.ok(allModules.includes(new URL(actualPlayer, new URL('conference/route.js', siteRoot)).href));
  assert.doesNotMatch(preloadScript, /\bimport\s*\(|\bfetch\s*\(|dispatchEvent|dataset|mountConference/);
});

test('all other route families retain their existing lazy imports without conference hints', () => {
  for (const search of ['', '?page=outlook', '?page=compare&legacy=1', '?page=data',
    '?page=evidence', '?page=ipo', '?page=market', '?page=relay', '?symbol=ETHUSD',
    '?symbol=MSTR', '?symbol=BMNR', '?symbol=TQQQ', '?page=conference-unknown']) {
    assert.deepEqual(hints(search), [], search || 'default');
  }
});

test('conference hints resolve from the parsed entry link at origin, project and nested wrapper URLs', () => {
  for (const [root, page] of [
    ['https://atlas.invalid/', 'https://atlas.invalid/'],
    [siteRoot, siteRoot],
    [siteRoot, siteRoot + 'market-lab/charts/'],
  ]) {
    const links = hints('?page=conference', {page, entry:new URL(entryHref, root).href});
    assert.equal(links[0].href, new URL('conference/timeline.json', root).href);
    assert.deepEqual(links.slice(1).map(link => link.href), manifest.modulePreloads.map(url => new URL(url, root).href));
  }
});

test('the committed preload HTML and graph match all current source bytes and import edges', async () => {
  const result = await buildSitePreloads(fileURLToPath(new URL('../', import.meta.url)), {check:true});
  assert.equal(result.status, 'ok');
  assert.equal(result.moduleUrls, manifest.modules.length);
});
