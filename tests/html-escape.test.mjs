import test from 'node:test';
import assert from 'node:assert/strict';
import {esc} from '../dist/ui/html-escape.js';

test('markup characters become entities in content and quoted attributes',()=>{
  assert.equal(esc(`<a href="x" title='y'>&</a>`),'&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(esc('&amp;'),'&amp;amp;');
  assert.equal(esc('비트코인 · 2026-10-25'),'비트코인 · 2026-10-25');
});

test('nullish input renders as empty text and other values as their string form',()=>{
  assert.equal(esc(undefined),'');
  assert.equal(esc(null),'');
  assert.equal(esc(0),'0');
  assert.equal(esc(false),'false');
  assert.equal(esc(['<','&']),'&lt;,&amp;');
});
