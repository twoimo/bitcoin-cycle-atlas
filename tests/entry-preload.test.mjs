import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

test('the shared entry hint exactly matches the module entry and precedes blocking CSS', () => {
  const entry = html.match(/<script type="module" src="([^"]+)"><\/script>/)?.[1];
  const hint = html.match(/<link rel="modulepreload" href="([^"]+)">/);
  assert.ok(entry && hint);
  assert.equal(hint[1], entry, 'Preload and evaluation must share the same versioned module URL');
  assert.ok(hint.index < html.indexOf('<link rel="stylesheet" href="./styles.css'));
  assert.ok(html.indexOf('id="atlas-boot-resource-script"') < hint.index);
});

test('no route-specific preload script remains after the conference page was removed', () => {
  assert.doesNotMatch(html, /id="atlas-boot-preloads"/);
  assert.doesNotMatch(html, /conference/);
});
