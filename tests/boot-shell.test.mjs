import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const bootMatch = html.match(/<script\b[^>]*id="atlas-boot-script"[^>]*>([\s\S]*?)<\/script>/);
const bootSource = bootMatch?.[1];
const earlyMatch = html.match(/<script\b[^>]*id="atlas-boot-resource-script"[^>]*>([\s\S]*?)<\/script>/);
const firstStylesheet = html.search(/<link\b[^>]*rel="stylesheet"/);

// This fixture supplies only the event and attribute APIs used by the real
// inline bootstrap. Browser layout and module loading are separate checks.
class ElementFixture extends EventTarget {
  constructor(attributes = '') {
    super();
    this.attributes = new Map([...attributes.matchAll(/([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)]
      .map(([, name, double, single, bare]) => [name, double ?? single ?? bare ?? '']));
    this.dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute(`data-${String(key).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`) ?? undefined,
      set: (_, key, value) => { this.setAttribute(`data-${String(key).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`, value); return true; },
    });
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get inert() { return this.hasAttribute('inert'); }
  set inert(value) { if (value) this.setAttribute('inert', ''); else this.removeAttribute('inert'); }
  click() { this.dispatchEvent(new Event('click')); }
}

function bootstrap({ earlyErrors = [] } = {}) {
  assert.ok(bootSource, 'The initial HTML must include its boot controller before the app module graph loads');
  const tags = [...html.matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)];
  const byId = new Map(), positions = new Map();
  const content = [];
  let root;
  for (const match of tags) {
    const [, tag, attributes] = match;
    const node = new ElementFixture(attributes);
    positions.set(node, match.index);
    node.tagName = tag.toUpperCase();
    if (tag === 'html') root = node;
    if (node.hasAttribute('id')) {
      byId.set(node.getAttribute('id'), node);
    }
    if (node.hasAttribute('data-boot-content')) {
      content.push(node);
    }
  }
  assert.ok(root);
  const window = new EventTarget(), document = new EventTarget();
  let now = 0, timerId = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  const advance = milliseconds => {
    now += milliseconds;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
  };
  document.documentElement = root;
  let parsingPosition = 0;
  document.getElementById = id => {
    const node = byId.get(id);
    return node && positions.get(node) < parsingPosition ? node : null;
  };
  document.querySelectorAll = selector => {
    assert.equal(selector, '[data-boot-content]', 'The boot controller must only touch its designated content roots');
    return content.filter(node => positions.get(node) < parsingPosition);
  };
  let reloads = 0;
  const location = { href: 'http://127.0.0.1/', pathname: '/', search: '', reload() { reloads += 1; } };
  window.location = location;
  window.document = document;
  const emit = (type, target = document) => target.dispatchEvent(new Event(type));
  const resourceError = target => {
    const event = new Event('error');
    // A browser captures this on window while retaining the resource's target.
    Object.defineProperty(event, 'target', { value: target });
    window.dispatchEvent(event);
  };
  const store = new Map();
  const sessionStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
  };
  const context = { window, document, location, Event, console, URL, sessionStorage };
  // Preceding stylesheets may fail before the body script is allowed to run.
  // Respect source order and do not expose DOM nodes the parser has not reached.
  const steps = [
    { position: firstStylesheet, run: () => earlyErrors.forEach(resourceError) },
    { position: bootMatch.index, run: () => runInNewContext(bootSource, context, { filename: 'atlas-boot-script', timeout: 1000 }) },
  ];
  if (earlyMatch) steps.push({ position: earlyMatch.index, run: () => runInNewContext(earlyMatch[1], context, { filename: 'atlas-boot-resource-script', timeout: 1000 }) });
  for (const step of steps.sort((a, b) => a.position - b.position)) {
    parsingPosition = step.position;
    step.run();
  }
  parsingPosition = Infinity;
  return { root, window, document, content, byId, emit, resourceError, advance, pendingTimers: () => timers.size, reloads: () => reloads };
}

test('the initial HTML provides a visible loading status while unfinished controls stay inert', () => {
  const { root, content, byId, emit, window } = bootstrap();
  assert.equal(root.dataset.boot, 'loading');
  for (const name of ['atlas-sidebar', 'workspace']) {
    assert.ok(content.some(node => (node.getAttribute('class') ?? '').split(/\s+/).includes(name)),
      `${name} must be gated before module evaluation`);
  }
  assert.ok(content.every(node => node.inert && node.getAttribute('aria-hidden') === 'true'));
  assert.equal(byId.get('atlas-boot-shell').hidden, false);
  assert.equal(byId.get('atlas-boot-status').getAttribute('role'), 'status');
  assert.equal(byId.get('atlas-boot-status').getAttribute('aria-busy'), 'true');
  assert.equal(byId.get('atlas-boot-error').hidden, true);
  emit('DOMContentLoaded');
  emit('load', window);
  assert.equal(root.dataset.boot, 'loading', 'Document load alone cannot prove the requested page has rendered');
  assert.ok(content.every(node => node.inert));
});

test('render readiness releases the real workspace once and later errors cannot resurrect the skeleton', () => {
  const { root, content, byId, emit, window } = bootstrap();
  emit('atlas:ready');
  assert.equal(root.dataset.boot, 'ready');
  assert.equal(byId.get('atlas-boot-shell').hidden, true);
  assert.ok(content.every(node => !node.inert && !node.hasAttribute('aria-hidden')));
  for (const type of ['atlas:ready', 'atlas:boot-error']) emit(type);
  for (const type of ['error', 'unhandledrejection']) emit(type, window);
  assert.equal(root.dataset.boot, 'ready');
  assert.equal(byId.get('atlas-boot-shell').hidden, true);
  assert.ok(content.every(node => !node.inert));
});

test('recoverable startup signals keep the skeleton and still reveal a completed page', () => {
  for (const type of ['atlas:boot-error', 'error', 'unhandledrejection']) {
    const { root, content, byId, emit, window, reloads } = bootstrap();
    emit(type, type === 'atlas:boot-error' ? undefined : window);
    assert.equal(root.dataset.boot, 'loading', type);
    assert.equal(byId.get('atlas-boot-error').hidden, true, type);
    assert.equal(byId.get('atlas-boot-status').hidden, false, type);
    assert.ok(content.every(node => node.inert), type);
    if (type === 'atlas:boot-error') assert.equal(reloads(), 1, 'a reported module failure reloads once without the connection alert');
    emit('atlas:ready');
    assert.equal(root.dataset.boot, 'ready', type);
    assert.equal(byId.get('atlas-boot-shell').hidden, true, type);
    assert.ok(content.every(node => !node.inert), type);
  }
});

test('a price refresh keeps the skeleton through the first 20 seconds and still opens when ready', () => {
  const f = bootstrap();
  f.emit('atlas:dataset');
  f.advance(20_000);
  assert.equal(f.reloads(), 0);
  assert.equal(f.root.dataset.boot, 'loading');
  assert.equal(f.byId.get('atlas-boot-error').hidden, true);
  f.advance(4_999);
  assert.equal(f.reloads(), 0);
  f.advance(1);
  assert.equal(f.reloads(), 1);
  f.emit('atlas:ready');
  assert.equal(f.root.dataset.boot, 'ready');
  assert.equal(f.byId.get('atlas-boot-shell').hidden, true);
});

test('a silent startup waits 20 seconds, reloads once, and still opens when the page becomes ready', () => {
  const f = bootstrap();
  f.advance(19_999);
  assert.equal(f.root.dataset.boot, 'loading');
  assert.equal(f.reloads(), 0);
  f.advance(1);
  assert.equal(f.root.dataset.boot, 'loading');
  assert.equal(f.byId.get('atlas-boot-error').hidden, true);
  assert.equal(f.byId.get('atlas-boot-status').getAttribute('aria-busy'), 'true');
  assert.ok(f.content.every(node => node.inert && node.getAttribute('aria-hidden') === 'true'));
  assert.equal(f.reloads(), 1);
  assert.equal(f.pendingTimers(), 0);
  f.emit('atlas:ready');
  assert.equal(f.root.dataset.boot, 'ready');
  assert.equal(f.byId.get('atlas-boot-shell').hidden, true);
  assert.ok(f.content.every(node => !node.inert));
});

test('a dataset already on the page survives the first deadline and still opens', () => {
  const f = bootstrap();
  f.emit('atlas:dataset');
  f.advance(20_000);
  assert.equal(f.root.dataset.boot, 'loading');
  assert.equal(f.byId.get('atlas-boot-error').hidden, true);
  assert.equal(f.pendingTimers(), 1);
  f.emit('atlas:ready');
  assert.equal(f.root.dataset.boot, 'ready');
  assert.equal(f.byId.get('atlas-boot-shell').hidden, true);
  assert.equal(f.pendingTimers(), 0);
});

test('optional resource failures stay quiet, and a required fault reloads once without trapping a later ready', () => {
  for (const resource of [{ tagName: 'IMG' }, { tagName: 'LINK', rel: 'icon' }, { tagName: 'LINK', rel: 'preload' }, { tagName: 'LINK', rel: 'stylesheet', id: 'atlas-optional-fonts' }, { tagName: 'LINK', rel: 'stylesheet', hasAttribute: name => name === 'data-atlas-optional' }, { tagName: 'SCRIPT', type: 'module', src: '/funnest-research-primitives.bundle.js?v=1.29.0' }]) {
    const { root, byId, emit, resourceError } = bootstrap();
    resourceError(resource);
    assert.equal(root.dataset.boot, 'loading', `${resource.tagName} ${resource.rel ?? ''} is not required to initialize the app`);
    assert.equal(byId.get('atlas-boot-error').hidden, true);
    emit('atlas:ready');
    assert.equal(root.dataset.boot, 'ready', 'A harmless resource failure must not prevent the completed page from opening');
  }
  for (const resource of [{ tagName: 'SCRIPT', type: 'module', src: '/site-entry.js?v=1.37.41' }, { tagName: 'LINK', rel: 'stylesheet' }]) {
    const { root, byId, content, emit, resourceError, reloads } = bootstrap();
    resourceError(resource);
    assert.equal(root.dataset.boot, 'loading', `${resource.tagName} ${resource.rel ?? resource.type} keeps the skeleton instead of the connection alert`);
    assert.equal(byId.get('atlas-boot-error').hidden, true);
    assert.equal(reloads(), 1);
    assert.ok(content.every(node => node.inert));
    emit('atlas:ready');
    assert.equal(root.dataset.boot, 'ready', 'A later ready still opens the page after one reload');
    assert.equal(byId.get('atlas-boot-error').hidden, true, 'the connection alert stays hidden');
    assert.equal(byId.get('atlas-boot-shell').hidden, true);
  }
});

test('stylesheet failure during head parsing reloads once without the connection alert while early icon failure remains optional', () => {
  const failed = bootstrap({ earlyErrors: [{ tagName: 'LINK', rel: 'stylesheet' }] });
  assert.equal(failed.root.dataset.boot, 'loading', 'A failed head stylesheet keeps the boot skeleton');
  assert.equal(failed.byId.get('atlas-boot-error').hidden, true);
  assert.equal(failed.reloads(), 1);
  assert.ok(failed.content.every(node => node.inert));
  failed.emit('atlas:ready');
  assert.equal(failed.root.dataset.boot, 'ready', 'A stylesheet fault cannot leave the skeleton up after the page is ready');
  assert.equal(failed.byId.get('atlas-boot-error').hidden, true);

  const optional = bootstrap({ earlyErrors: [{ tagName: 'LINK', rel: 'icon' }, { tagName: 'LINK', rel: 'preload' }, { tagName: 'LINK', rel: 'stylesheet', id: 'atlas-optional-fonts' }] });
  assert.equal(optional.root.dataset.boot, 'loading');
  optional.emit('atlas:ready');
  assert.equal(optional.root.dataset.boot, 'ready');
});

test('optional webfonts cannot hold essential CSS or page boot behind a network request', async () => {
  const css = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /@import\s+url\([^)]*fonts\.googleapis\.com/);
  assert.match(html, /<link\b[^>]*id="atlas-optional-fonts"[^>]*media="print"/);
  const fontScript = html.match(/<script\b[^>]*id="atlas-fonts-script"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(fontScript);
  const fonts = new EventTarget(); fonts.media = 'print'; fonts.sheet = null;
  runInNewContext(fontScript, { document: { getElementById: () => fonts } });
  assert.equal(fonts.media, 'print');
  fonts.dispatchEvent(new Event('load'));
  assert.equal(fonts.media, 'all');
  fonts.media = 'print'; fonts.sheet = {};
  runInNewContext(fontScript, { document: { getElementById: () => fonts } });
  assert.equal(fonts.media, 'all', 'An already cached stylesheet is activated too');
});


test('stray runtime script errors keep the skeleton open without blocking atlas:ready', () => {
  assert.doesNotMatch(html, /화면을 불러오지 못했습니다|연결을 확인한 뒤 다시 불러와 주세요/);
  const f = bootstrap(); const event = new Event('error');
  Object.defineProperties(event, { message: { value: 'renderer failed' }, error: { value: new Error('renderer failed') }, filename: { value: 'http://127.0.0.1/chart.js' } });
  f.window.dispatchEvent(event);
  assert.equal(f.root.dataset.boot, 'loading');
  assert.equal(f.byId.get('atlas-boot-error').hidden, true);
  assert.ok(f.content.every(node => node.inert));
  f.emit('atlas:ready');
  assert.equal(f.root.dataset.boot, 'ready');
  assert.ok(f.content.every(node => !node.inert));
});

test('a dropped entry script stays on the loading screen and still opens when the next copy is ready', () => {
  const f = bootstrap();
  const created = [];
  f.document.createElement = tag => ({ tagName: tag.toUpperCase() });
  const parent = { appendChild(node) { created.push(node); } };
  f.resourceError({ tagName: 'SCRIPT', type: 'module', src: 'http://127.0.0.1/site-entry.js?v=1.37.68', parentNode: parent });
  assert.equal(f.root.dataset.boot, 'loading');
  assert.equal(f.byId.get('atlas-boot-error').hidden, true);
  assert.equal(f.byId.get('atlas-boot-shell').hidden, false);
  f.advance(399);
  assert.equal(created.length, 0);
  f.advance(1);
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'module');
  assert.equal(created[0].src, 'http://127.0.0.1/site-entry.js?v=1.37.68&boot-retry=1');
  f.emit('atlas:ready');
  assert.equal(f.root.dataset.boot, 'ready');
  assert.equal(f.byId.get('atlas-boot-shell').hidden, true);
  assert.equal(f.byId.get('atlas-boot-error').hidden, true);
});

test('a dropped module import reloads once and keeps the skeleton instead of showing a connection failure', () => {
  const f = bootstrap();
  const message = 'Failed to fetch dynamically imported module: http://127.0.0.1/viewport-workspace.js?v=1.36.29&retry=3';
  f.document.dispatchEvent(new CustomEvent('atlas:boot-error', { detail: { message } }));
  assert.equal(f.root.dataset.boot, 'loading');
  assert.equal(f.byId.get('atlas-boot-error').hidden, true);
  assert.equal(f.reloads(), 1);
  f.document.dispatchEvent(new CustomEvent('atlas:boot-error', { detail: { message } }));
  assert.equal(f.root.dataset.boot, 'loading');
  assert.equal(f.byId.get('atlas-boot-error').hidden, true);
  assert.equal(f.reloads(), 1);
  f.emit('atlas:ready');
  assert.equal(f.root.dataset.boot, 'ready');
});
