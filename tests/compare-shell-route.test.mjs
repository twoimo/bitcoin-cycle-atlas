import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// WP-C: the legacy bare compare route joins the single standard shell.
// These are source contracts; the rendered four-region evidence lives in the
// headless-Chrome receipt (/tmp/cmp-evidence/wp-c-verify.json) for the exact
// source revision, because no local build or install is available here.
const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const shell = await readFile(new URL('../dist/atlas-shell.js', import.meta.url), 'utf8');
const description = await readFile(new URL('../dist/ui/page-description.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../dist/atlas-shell.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

const initialStateSource = app.slice(app.indexOf('const params = new URLSearchParams(location.search);'), app.indexOf('let toastTimer;'));
const viewFor = (search) => {
  const context = { location: { pathname: '/bitcoin-cycle-atlas/', search }, URLSearchParams, Set };
  return runInNewContext(`${initialStateSource}\nstate.view;`, context);
};

test('page=compare resolves to the compare view with and without the legacy alias', () => {
  assert.equal(viewFor('?page=compare'), 'compare', 'the bare compare link keeps its content');
  assert.equal(viewFor('?page=compare&legacy=1'), 'compare', 'the legacy alias resolves to the same view');
  assert.equal(viewFor('?page=compare&legacy=1&compare-unit=rebased'), 'compare');
  assert.equal(viewFor('?page=outlook'), 'outlook', 'the price chart keeps its own view');
  assert.doesNotMatch(app, /params\.get\('page'\)===compare&&!params\.has\('legacy'\)/, 'no render branch may depend on legacy');
});

test('the compare route keeps the price frame and replaces only its center', () => {
  assert.match(app, /function hostCompareCenter\(active\)/);
  assert.match(app, /const plot = document\.querySelector\('\.atlas-plot'\)/);
  assert.match(app, /if \(plot && section\.parentElement !== plot\) plot\.append\(section\)/, 'the section moves into the center');
  assert.match(app, /compareHome\.insertBefore\(section, compareHomeNext\)/, 'and returns to #main for other pages');
  assert.match(app, /const compareFrame = state\.view === 'compare'/, 'the frame stays mounted for compare');
  assert.match(app, /view === 'outlook' \? state\.view !== 'outlook' && !compareFrame : state\.view !== view/);
  assert.match(app, /hostCompareCenter\(state\.view === 'compare'\)/, 'the async workspace re-hosts the section');
});

test('compare owns the chart shell and the single page heading', () => {
  assert.match(shell, /const chart = page === 'outlook' \|\| page === 'compare';/, 'the shell keeps the four regions for compare');
  assert.match(description, /const chart = page === 'outlook' \|\| page === 'compare';/, 'the page description lives in the chart frame');
  const compareMarkup = html.slice(html.indexOf('<section id="compare-view"'), html.indexOf('<section id="data-view"'));
  assert.equal((compareMarkup.match(/<h1[\s>]/g) || []).length, 0, 'compare contributes no second page H1');
  assert.match(html, /<h2 id="chart-heading">/, 'the inner chart card is a section heading');
  assert.match(html, /<h2>사이클 내부의 구조<\/h2>/);
});

test('the compare center hides price content without touching its own markup', () => {
  const block = css.slice(css.indexOf('/* The compare route renders inside the price chart frame'));
  assert.match(block, /body\[data-page=compare\] \.atlas-plot>:not\(#compare-view\)\{display:none!important\}/);
  assert.match(block, /body\[data-page=compare\] \.atlas-plot>#compare-view\{position:absolute;inset:0;overflow:auto/);
  assert.match(block, /body\[data-shell=chart\]\[data-page=compare\] \.workbench-tools\{display:flex\}/, 'the tool rail belongs to the shell');
  assert.match(block, /#compare-view :is\(\.anchor-tab,\[data-mode\],\[data-unit\],\[data-scale\]\)\{min-width:44px\}/, 'compare controls meet the touch floor');
  assert.equal((html.match(/id="compare-view"/g) || []).length, 1, 'the section is moved, never duplicated');
  assert.match(html, /id="structure-chart"/, 'the comparison chart stays in the document');
  assert.match(html, /id="structure-scope"/, 'its settings stay in the document');
});
