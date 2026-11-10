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
const host = await readFile(new URL('../dist/compare-shell-host.js', import.meta.url), 'utf8');

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
  assert.match(app, /import \{ createCompareShellHost \} from '\.\/compare-shell-host\.js/, 'the hosting logic has one owned module');
  assert.match(app, /function hostCompareCenter\(active\) \{ compareShell\.setActive\(active\); \}/);
  assert.match(app, /const compareFrame = state\.view === 'compare' && document\.body\.dataset\.embedded !== 'true'/, 'the frame stays mounted for compare but not in an embedded child');
  assert.match(app, /view === 'outlook' \? state\.view !== 'outlook' && !compareFrame : state\.view !== view/);
  assert.match(app, /hostCompareCenter\(state\.view === 'compare'\)/, 'the async workspace re-hosts the section');
  assert.match(host, /if \(plot && section\.parentElement !== plot\) plot\.append\(section\)/, 'the section moves into the center');
  assert.match(host, /sectionHome\.insertBefore\(section, sectionNext\)/, 'and returns to its own slot');
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

test('the compare toolbar is cached, moved and restored as the same node', () => {
  // The node is resolved once: re-querying '#compare-view .lab-toolbar' after
  // the move returns null and leaves the toolbar inside the shell heading.
  assert.match(host, /if \(section\) return true;\n    section = document\.querySelector\('#compare-view'\);/);
  assert.match(host, /toolbar = section\.querySelector\('\.lab-toolbar'\)/, 'the real element is the one moved');
  const setActive = host.slice(host.indexOf('function setActive'), host.indexOf('return {'));
  assert.doesNotMatch(setActive, /querySelector\('#compare-view \.lab-toolbar'\)/, 'activation never re-queries a moved node');
  assert.match(host, /if \(toolbar && heading && toolbar\.parentElement !== heading\) heading\.append\(toolbar\)/, 'it moves into the shell heading');
  assert.match(host, /toolbarHome\.insertBefore\(toolbar, toolbarNext\)/, 'and returns to its original slot');
  assert.doesNotMatch(host, /cloneNode|outerHTML/, 'the toolbar is moved, never rebuilt or mirrored');
  assert.equal((html.match(/class="lab-toolbar"/g) || []).length, 1, 'the compare view keeps exactly one toolbar in markup');
  for (const control of ['id="structure-scope"', 'data-structure-frequency="daily"', 'data-structure-frequency="weekly"', 'id="structure-threshold"', 'id="structure-json"']) {
    assert.ok(html.includes(control), `the real control ${control} stays in the document`);
  }
});

test('price-only frame controls are locked with a reason and released by their own prior state', () => {
  assert.match(host, /const PRICE_CONTROL_SELECTOR = '\.workbench-tools button, \.workbench-bottom-bar :is\(button,select\):not\(#atlas-update-status\)'/);
  assert.match(host, /if \(!priorDisabled\.has\(control\)\) priorDisabled\.set\(control, control\.disabled === true\)/, 'the prior disabled state is remembered');
  assert.match(host, /control\.disabled = wasDisabled;/, 'and restored individually');
  assert.match(host, /data-disabled-reason', DISABLED_REASON/, 'the reason is exposed to the rail tooltip');
  assert.match(host, /document\.body\?\.dataset\.embedded === 'true'\) return;/, 'an embedded child is never locked or nested');
});

test('price-only controls leave the compare top row instead of staying inert', () => {
  const block = css.slice(css.indexOf('/* Compare owns the top row'));
  assert.match(block, /body\[data-page=compare\] \.atlas-canvas-heading>:not\(\.lab-toolbar\)\{display:none!important\}/, 'no visible chart-only control remains');
  assert.match(block, /flex-wrap:nowrap/, 'the row stays one scrollable line');
  assert.match(block, /overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;touch-action:pan-x pinch-zoom/, 'native horizontal access survives');
  assert.match(block, /@media\(max-width:760px\),\(pointer:coarse\)\{\n  body\[data-page=compare\] \.atlas-canvas-heading>\.lab-toolbar :is\(button,select\)\{min-height:44px\}/, 'moved controls keep the touch floor');
  assert.match(block, /@media\(max-width:390px\)\{[\s\S]*?body\[data-page=compare\] \.atlas-canvas-heading\{display:flex!important/, 'phones keep one row instead of the chart two-row grid');
  // The chart controls stay in the document so returning to the price chart restores them.
  for (const id of ['#workbench-frequency', '#workbench-chart-type', '#atlas-mode-menu', '#workbench-workspace']) {
    assert.ok(!app.includes(`remove('${id}')`), `${id} is never destroyed`);
  }
});
