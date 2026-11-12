import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {javascriptModuleSpecifiers} from '../scripts/module-references.mjs';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const preloadScript = html.match(/<script id="atlas-boot-preloads">([\s\S]*?)<\/script>/)?.[1];

function hints(search) {
  const links = [];
  vm.runInNewContext(preloadScript, {
    URLSearchParams, location:{search},
    document:{
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

test('conference hints fetch the actual application/player URLs without evaluating or mounting them', async () => {
  const links = hints('?page=conference&t=20396.02&deck=r17-clean-257&symbol=ETHUSD');
  assert.equal(links.length, 2);
  assert.ok(links.every(link => link.rel === 'modulepreload'));
  const entry = await readFile(new URL('../dist/site-entry.js', import.meta.url), 'utf8');
  const route = await readFile(new URL('../dist/conference/route.js', import.meta.url), 'utf8');
  assert.ok(javascriptModuleSpecifiers(entry).includes(links[0].href));
  const actualPlayer = javascriptModuleSpecifiers(route).find(value => value.startsWith('./player.js'));
  assert.equal(links[1].href, './conference/' + actualPlayer.slice(2));
  assert.doesNotMatch(preloadScript, /\bimport\s*\(|\bfetch\s*\(|dispatchEvent|dataset|mountConference/);
});

test('all other route families retain their existing lazy imports without conference hints', () => {
  for (const search of ['', '?page=outlook', '?page=compare&legacy=1', '?page=data',
    '?page=evidence', '?page=ipo', '?page=market', '?page=relay', '?symbol=ETHUSD',
    '?symbol=MSTR', '?symbol=BMNR', '?symbol=TQQQ', '?page=conference-unknown']) {
    assert.deepEqual(hints(search), [], search || 'default');
  }
});
