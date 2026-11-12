import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {createContentShell, CONTENT_SHELL_PAGES} from '../dist/content-shell.js';
import {createCompareShellHost} from '../dist/compare-shell-host.js';
import {mountMobileWorkspace} from '../dist/mobile-workspace.js';
import {atlasNavigationId, atlasPages, labPageFromLocation} from '../dist/atlas-navigation.js';
import {readP1RouteReadiness, isP1RouteReady} from '../scripts/verify-ui-renewal-p1-browser.mjs';

const app = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../dist/atlas-shell.js', import.meta.url), 'utf8');
const lifecycle = app.slice(app.indexOf('let outlookController ='), app.indexOf('function ensureEvidence()'))
  .replace("import('./viewport-workspace.js?v=1.36.1')", 'loadViewport()')
  .replace("import('./lab-view.js?v=1.36.1')", 'loadLab()');
assert.doesNotMatch(lifecycle, /\bimport\(/, 'only the two module import boundaries are deferred by this fixture');
const syncPage = app.slice(app.indexOf('function syncPage()'), app.indexOf('\nsyncPage();'));
const syncShell = shell.slice(shell.indexOf('  function sync() {'), shell.indexOf('  const pageObserver ='))
  .replace('function sync()', 'function syncShell()');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

// This models the import/render boundary with the shipped app route functions,
// shell reconciliation, content owner, mobile controls and unchanged P1 reader.
// Only the heavy renderer/imports and layout APIs are doubles. These assertions
// are DOM lifecycle evidence, not native paint, geometry or four-width passes.
function fixture(t, width = 320) {
  const pages = ['outlook','compare','evidence','data','ipo','market','relay','conference'];
  const destinations = pages.filter(page => page !== 'compare');
  const {document, window} = parseHTML(`<html data-boot="ready"><body data-page="relay">
    <aside class="atlas-sidebar"><button class="atlas-brand">Cycle Atlas</button>
      <nav class="atlas-nav">${destinations.map(page => `<button data-view="${page}" data-atlas-page="${page === 'market' ? 'market-us' : page}">${page}</button>`).join('')}</nav>
      <span class="atlas-sidebar-group"></span></aside>
    <header class="atlas-dashboard-header"><h1>릴레이 콘텐츠</h1></header>
    <div class="workspace"><main id="main">${pages.map(page => `<section id="${page}-view"><p>${page} populated content</p>${page === 'outlook' ? '<div id="lab-chart-stage"></div>' : ''}</section>`).join('')}<footer class="footer">Source</footer></main></div>
    </body></html>`);
  Object.defineProperty(document, 'readyState', {value:'complete'});
  window.matchMedia = query => ({matches:width <= Number(query.match(/max-width:\s*(\d+)/)?.[1] || 0), addEventListener() {}, removeEventListener() {}});
  window.getComputedStyle = () => ({display:'block'});
  for (const section of document.querySelectorAll('section')) {
    section.checkVisibility = () => !section.closest('[hidden]');
    section.getBoundingClientRect = () => ({left:0, top:0, right:width, bottom:100, width, height:100});
  }
  const state = {view:'relay', dataset:{prices:[['2026-11-12', 1]]}};
  const counts = {viewport:0, lab:0, draws:0, bootErrors:0, imports:0};
  const errors = [];
  document.addEventListener('atlas:boot-error', () => counts.bootErrors++);
  const workspace = document.querySelector('.workspace'), nav = document.querySelector('.atlas-nav');
  const contentShell = createContentShell({document}), compareShell = createCompareShellHost({document});
  let imports = {viewport:deferred(), lab:deferred()}, mobile = null, renderer = null;
  const modules = {
    viewport: {initViewportWorkspace() {
      counts.viewport++;
      assert.equal(document.querySelector('.content-rail'), null, 'the chart transition must release the dashboard rail before chrome mounts');
      const stage = document.getElementById('lab-chart-stage');
      const heading = document.createElement('header'); heading.className = 'atlas-canvas-heading';
      const plot = document.createElement('div'); plot.className = 'atlas-plot';
      const footer = document.createElement('div'); footer.className = 'workbench-bottom-bar';
      stage.append(heading, plot, footer);
      const rail = document.createElement('aside'); rail.className = 'workbench-rail';
      const tools = document.createElement('nav'); tools.className = 'workbench-detail-tools';
      rail.append(tools, nav);
      const reader = document.createElement('aside'); reader.id = 'chart-reader'; reader.hidden = true;
      workspace.append(reader, rail);
      mobile = mountMobileWorkspace({workspace, stage, plot, reader, closeReader() { reader.hidden = true; }});
    }},
    lab: {initLabView() {
      counts.lab++;
      renderer = {dataset:null, outlook:false, compare:false,
        setDataset(value) { this.dataset = value; },
        show(value) { this.outlook = value; },
        showCompare(value) { this.compare = value; },
      };
      return renderer;
    }},
  };
  const context = {
    document, state, CustomEvent:window.CustomEvent, console:{error:(...args) => errors.push(args)},
    $:selector => document.querySelector(selector), $$:selector => [...document.querySelectorAll(selector)],
    icon:() => '', hostCompareCenter:value => compareShell.setActive(value), render() {},
    loadViewport:() => { counts.imports++; return imports.viewport.promise; }, loadLab:() => imports.lab.promise,
    ensureEvidence() {}, btcRefreshStatus:{update() {}}, ipoController:{render() {}}, marketController:{render() {}},
    relayController:{show() {}}, conferenceController:{setActive() {}},
    header:document.querySelector('.atlas-dashboard-header'), group:document.querySelector('.atlas-sidebar-group'),
    sidebar:document.querySelector('.atlas-sidebar'), contentShell, CONTENT_SHELL_PAGES,
    pageDescription:{sync() {}}, preference() {}, atlasNavigationId, atlasPages, labPageFromLocation,
    location:new URL('https://example.test/bitcoin-cycle-atlas/?page=relay'),
  };
  const api = runInNewContext(`${lifecycle}\n${syncPage}\n${syncShell}\n({syncPage, syncShell, pending:() => workspacePromise, read:${readP1RouteReadiness.toString()}})`, context);
  const setAttribute = document.body.setAttribute.bind(document.body);
  document.body.setAttribute = (name, value) => {
    if (name === 'data-page' && ['outlook','compare'].includes(value)) {
      assert.equal(document.getElementById(`${value}-view`).getAttribute('aria-busy'), 'true', 'pending must be published before the chart route');
    }
    return setAttribute(name, value);
  };
  function navigate(page) {
    state.view = page;
    api.syncPage();
    // Run the actual shell observer callback at this deterministic boundary.
    api.syncShell();
  }
  const emitReady = page => document.dispatchEvent(new window.CustomEvent('atlas:page-ready', {detail:{page}}));
  t.after(() => { mobile?.destroy(); compareShell.setActive(false); contentShell.setActive(false); });
  navigate('relay');
  return {
    document, nav, counts, errors, navigate, emitReady,
    ready:page => isP1RouteReady(api.read({id:page}), page),
    async resolveImports() {
      const pending = api.pending();
      imports.viewport.resolve(modules.viewport); imports.lab.resolve(modules.lab);
      await pending; api.syncShell();
    },
    async rejectImports() {
      const pending = api.pending();
      imports.viewport.resolve(modules.viewport); imports.lab.reject(new Error('module transport failed'));
      await pending; api.syncShell();
    },
    retryImports() { imports = {viewport:deferred(), lab:deferred()}; },
    finishDraw(page) {
      assert.ok(renderer?.dataset && renderer[page === 'outlook' ? 'outlook' : 'compare'], 'only an active renderer with data can publish its drawn page');
      assert.ok(document.getElementById('mobile-details-toggle'), 'the real mobile control is mounted before a drawn page can become ready');
      counts.draws++; emitReady(page);
    },
  };
}

test('a ready dashboard cannot expose an undrawn first chart to the unchanged P1 readiness gate', async t => {
  for (const width of [320, 1440]) await t.test(`DOM lifecycle with ${width}px media`, async t => {
    const f = fixture(t, width), {document, nav} = f;
    assert.equal(f.ready('relay'), true);
    assert.equal(nav.parentElement.className, 'atlas-dashboard-nav');
    f.navigate('outlook');
    assert.equal(document.documentElement.dataset.boot, 'ready', 'a route transition does not restart document boot');
    assert.equal(f.ready('outlook'), false);
    assert.equal(document.getElementById('mobile-details-toggle'), null);
    f.emitReady('outlook');
    assert.equal(f.ready('outlook'), false, 'a premature event cannot qualify an unmounted workspace');
    await f.resolveImports();
    const toggle = document.getElementById('mobile-details-toggle');
    const rail = document.getElementById(toggle.getAttribute('aria-controls'));
    assert.ok(rail.matches('.workbench-rail:not(.content-rail)'));
    assert.equal(nav.parentElement, rail, 'the original navigation has its actual chart owner');
    assert.equal(f.ready('outlook'), false, 'successful imports and mounted controls alone are not a drawn chart');
    f.emitReady('relay'); f.emitReady('compare');
    assert.equal(f.ready('outlook'), false, 'another renderer cannot clear the current page');
    f.finishDraw('outlook');
    assert.equal(f.ready('outlook'), true);
    if (width === 320) {
      toggle.click();
      assert.equal(toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(rail.dataset.mobileOpen, 'true', 'the shipped control actually opens the rail that owns navigation');
    }
    f.navigate('relay');
    assert.equal(f.ready('relay'), true);
    assert.equal(nav.parentElement.className, 'atlas-dashboard-nav');
    f.navigate('outlook');
    assert.equal(f.ready('outlook'), false, 'each visible chart return waits for its own draw');
    f.finishDraw('outlook');
    assert.equal(f.ready('outlook'), true);
    assert.equal(f.counts.viewport, 1); assert.equal(f.counts.lab, 1);
    assert.equal(document.querySelectorAll('#mobile-details-toggle').length, 1);
    assert.equal(document.querySelectorAll('.workbench-rail:not(.content-rail)').length, 1);
  });
});

test('late chart imports cannot steal dashboard navigation, and a later chart visit mounts once', async t => {
  const f = fixture(t);
  f.navigate('outlook'); f.navigate('relay');
  const owner = f.nav.parentElement;
  await f.resolveImports();
  assert.equal(f.counts.viewport, 0); assert.equal(f.counts.lab, 0);
  assert.equal(f.nav.parentElement, owner);
  assert.equal(f.document.getElementById('mobile-details-toggle'), null);
  assert.equal(f.ready('relay'), true);
  f.emitReady('outlook');
  assert.equal(f.document.getElementById('outlook-view').getAttribute('aria-busy'), 'true');
  f.navigate('outlook');
  await f.resolveImports();
  assert.equal(f.counts.viewport, 1); assert.equal(f.counts.lab, 1);
  assert.equal(f.ready('outlook'), false);
  f.finishDraw('outlook');
  assert.equal(f.ready('outlook'), true);
});

test('an active chart import failure remains unready and preserves the fatal error notification', async t => {
  const f = fixture(t);
  f.navigate('outlook');
  await f.rejectImports();
  assert.equal(f.counts.bootErrors, 1); assert.equal(f.errors.length, 1);
  assert.equal(f.counts.viewport, 0); assert.equal(f.ready('outlook'), false);
  f.emitReady('outlook');
  assert.equal(f.ready('outlook'), false);
  assert.equal(f.document.getElementById('mobile-details-toggle'), null);
});

test('an import rejected after leaving the chart cannot fail the dashboard and can retry next visit', async t => {
  const f = fixture(t);
  f.navigate('outlook'); f.navigate('relay');
  const owner = f.nav.parentElement;
  await f.rejectImports();
  assert.equal(f.counts.bootErrors, 0); assert.equal(f.errors.length, 1);
  assert.equal(f.counts.viewport, 0); assert.equal(f.nav.parentElement, owner);
  assert.equal(f.ready('relay'), true);
  f.retryImports(); f.navigate('outlook'); await f.resolveImports();
  assert.equal(f.ready('outlook'), false);
  f.finishDraw('outlook');
  assert.equal(f.ready('outlook'), true);
  assert.equal(f.counts.viewport, 1);
});

test('the nested compare frame clears its shared pending state only after the matching draw', async t => {
  const f = fixture(t);
  f.navigate('outlook'); f.navigate('compare'); await f.resolveImports();
  const outlook = f.document.getElementById('outlook-view'), compare = f.document.getElementById('compare-view');
  assert.equal(outlook.contains(compare), true, 'the real compare host nests its section in the chart frame');
  assert.equal(outlook.getAttribute('aria-busy'), 'true'); assert.equal(compare.getAttribute('aria-busy'), 'true');
  f.emitReady('outlook');
  assert.equal(compare.getAttribute('aria-busy'), 'true');
  f.finishDraw('compare');
  assert.equal(outlook.hasAttribute('aria-busy'), false); assert.equal(compare.hasAttribute('aria-busy'), false);
  f.navigate('outlook');
  assert.equal(f.ready('outlook'), false);
  f.emitReady('compare');
  assert.equal(f.ready('outlook'), false);
  f.finishDraw('outlook');
  assert.equal(f.ready('outlook'), true);
  assert.equal(f.counts.viewport, 1);
});
