import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_STORAGE_KEY, readTheme, applyTheme, initTheme, createThemeControl} from '../dist/ui/theme.js';

// Native event/attribute fixtures exercise preference and frame ownership only.
// They do not claim browser layout, rendered contrast or font measurements.
class ElementFixture extends EventTarget {
  constructor(tagName, document) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    const styles = new Map();
    this.style = {setProperty:(key, value) => styles.set(key, value), getPropertyValue:key => styles.get(key) || ''};
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  append(...nodes) { this.children.push(...nodes); }
  click() { this.dispatchEvent(new Event('click')); }
  focus() { this.ownerDocument.activeElement = this; }
}

function storage(value = null) {
  const values = new Map(value === null ? [] : [[THEME_STORAGE_KEY, value]]), writes = [];
  return {values, writes, getItem:key => values.get(key) ?? null, setItem(key, value) { writes.push([key, value]); values.set(key, String(value)); }};
}

function fixture(t, {theme, preference = storage(), origin = 'https://atlas.example', parent} = {}) {
  const document = new EventTarget(), view = new EventTarget();
  view.CustomEvent = CustomEvent;
  view.location = {origin};
  view.parent = parent || view;
  view.localStorage = preference;
  document.defaultView = view;
  document.createElement = tag => new ElementFixture(tag, document);
  document.documentElement = document.createElement('html');
  if (theme) document.documentElement.dataset.theme = theme;
  document.body = document.createElement('body');
  document.documentElement.append(document.body);
  document.querySelectorAll = selector => {
    assert.ok(['[data-atlas-theme-toggle]', 'iframe'].includes(selector), 'Theme synchronization must not rewrite chart or navigation nodes');
    const all = node => node.children.flatMap(child => [child, ...all(child)]);
    return all(document.documentElement).filter(node => selector === 'iframe' ? node.tagName === 'IFRAME' : node.hasAttribute('data-atlas-theme-toggle'));
  };
  const boot = () => initTheme({document});
  t.after(() => boot()?.destroy());
  return {document, view, preference, boot, root:document.documentElement};
}

function emit(target, type, properties) {
  const event = new Event(type);
  for (const [name, value] of Object.entries(properties)) Object.defineProperty(event, name, {value});
  target.dispatchEvent(event);
}

function frame(document) {
  const node = document.createElement('iframe'), calls = [];
  node.contentWindow = {postMessage:(message, targetOrigin) => calls.push({message, targetOrigin})};
  document.body.append(node);
  return {node, window:node.contentWindow, calls};
}

test('the default is light and only explicit light/dark preferences are accepted', () => {
  assert.equal(THEME_STORAGE_KEY, 'atlas-ui-theme');
  for (const value of [null, '', 'system', 'DARK', '{"theme":"dark"}', 'unexpected']) assert.equal(readTheme(storage(value)), 'light');
  assert.equal(readTheme(storage('dark')), 'dark');
  assert.equal(readTheme(storage('light'), 'dark'), 'light');
  assert.equal(readTheme({getItem() { throw new Error('blocked'); }}), 'light');
});

test('initialization honors a saved choice and the early head fallback without writing storage', t => {
  const saved = fixture(t, {theme:'light', preference:storage('dark')});
  saved.boot();
  assert.equal(saved.root.dataset.theme, 'dark');
  assert.equal(saved.root.style.getPropertyValue('color-scheme'), 'dark');
  assert.deepEqual(saved.preference.writes, []);
  const restored = fixture(t, {theme:'dark'});
  Object.defineProperty(restored.view, 'localStorage', {get() { throw new Error('SecurityError'); }});
  assert.doesNotThrow(() => restored.boot());
  assert.equal(restored.root.dataset.theme, 'dark');
  const clean = fixture(t);
  clean.boot();
  assert.equal(clean.root.dataset.theme, 'light');
});

test('native settings buttons toggle and persist one choice while keeping focus and chart nodes intact', t => {
  const f = fixture(t), first = createThemeControl(f.document), second = createThemeControl(f.document);
  const chart = f.document.createElement('svg');
  chart.dataset.plotRight = '256';
  f.document.body.append(chart, first, second);
  first.focus();
  let changes = 0, chartCommands = 0, resizes = 0;
  f.document.addEventListener('atlas:theme-change', () => changes++);
  f.document.addEventListener('atlas:chart-command', () => chartCommands++);
  f.view.addEventListener('resize', () => resizes++);
  assert.equal(first.tagName, 'BUTTON');
  assert.equal(first.type, 'button');
  assert.equal(first.getAttribute('aria-label'), '다크 모드');
  assert.equal(first.textContent, '다크 모드');
  assert.match(first.className, /\btheme-setting\b/);
  assert.equal(first.getAttribute('aria-pressed'), 'false');
  first.click();
  assert.equal(f.root.dataset.theme, 'dark');
  assert.equal(f.preference.values.get(THEME_STORAGE_KEY), 'dark');
  assert.equal(first.getAttribute('aria-pressed'), 'true');
  assert.equal(second.getAttribute('aria-pressed'), 'true');
  assert.equal(f.document.activeElement, first);
  assert.equal(f.document.body.children[0], chart);
  assert.equal(chart.dataset.plotRight, '256');
  second.click();
  assert.equal(f.root.dataset.theme, 'light');
  assert.equal(first.getAttribute('aria-pressed'), 'false');
  assert.equal(second.getAttribute('aria-pressed'), 'false');
  assert.equal(changes, 2);
  assert.equal(chartCommands, 0);
  assert.equal(resizes, 0);
  assert.deepEqual(f.preference.writes, [[THEME_STORAGE_KEY, 'dark'], [THEME_STORAGE_KEY, 'light']]);
});

test('reopening settings keeps the current choice when storage writes are blocked', t => {
  const preference = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }};
  const f = fixture(t, {preference}), first = createThemeControl(f.document);
  f.document.body.append(first);
  assert.doesNotThrow(() => first.click());
  const reopened = createThemeControl(f.document);
  assert.equal(f.root.dataset.theme, 'dark');
  assert.equal(reopened.getAttribute('aria-pressed'), 'true');
  assert.equal(f.root.style.getPropertyValue('color-scheme'), 'dark');
});

test('cross-tab preference changes update controls without re-persisting or accepting session storage', t => {
  const f = fixture(t), button = createThemeControl(f.document);
  f.document.body.append(button);
  emit(f.view, 'storage', {key:'another-setting', newValue:'dark', storageArea:f.preference});
  emit(f.view, 'storage', {key:THEME_STORAGE_KEY, newValue:'dark', storageArea:storage()});
  assert.equal(f.root.dataset.theme, 'light');
  emit(f.view, 'storage', {key:THEME_STORAGE_KEY, newValue:'dark', storageArea:f.preference});
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  emit(f.view, 'storage', {key:THEME_STORAGE_KEY, newValue:'unknown', storageArea:f.preference});
  assert.equal(f.root.dataset.theme, 'light');
  emit(f.view, 'storage', {key:THEME_STORAGE_KEY, newValue:'dark', storageArea:f.preference});
  emit(f.view, 'storage', {key:null, newValue:null, storageArea:f.preference});
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(f.preference.writes, []);
});

test('document initialization is idempotent and teardown removes external listeners', t => {
  const f = fixture(t), controller = f.boot();
  assert.equal(f.boot(), controller);
  let changes = 0;
  f.document.addEventListener('atlas:theme-change', () => changes++);
  emit(f.view, 'storage', {key:THEME_STORAGE_KEY, newValue:'dark'});
  assert.equal(changes, 1);
  controller.destroy();
  emit(f.view, 'storage', {key:THEME_STORAGE_KEY, newValue:'light'});
  assert.equal(f.root.dataset.theme, 'dark');
  assert.equal(changes, 1);
});

test('parent messages require both a matching origin and the actual parent window', t => {
  const parent = {postMessage() {}}, f = fixture(t, {parent});
  f.boot();
  const message = {type:'atlas:ui-theme', theme:'dark'};
  emit(f.view, 'message', {origin:'https://other.example', source:parent, data:message});
  emit(f.view, 'message', {origin:f.view.location.origin, source:{}, data:message});
  emit(f.view, 'message', {origin:f.view.location.origin, source:parent, data:{type:'atlas:ui-theme', theme:'system'}});
  assert.equal(f.root.dataset.theme, 'light');
  emit(f.view, 'message', {origin:f.view.location.origin, source:parent, data:message});
  assert.equal(f.root.dataset.theme, 'dark');
  assert.deepEqual(f.preference.writes, []);
});

test('a new child requests the parent choice before sending any fallback back to it', t => {
  const calls = [], parent = {postMessage:(message, targetOrigin) => calls.push({message, targetOrigin})};
  const f = fixture(t, {parent});
  f.boot();
  assert.deepEqual(calls, [{message:{type:'atlas:ui-theme-request'}, targetOrigin:f.view.location.origin}]);
  emit(f.view, 'message', {origin:f.view.location.origin, source:parent, data:{type:'atlas:ui-theme', theme:'dark'}});
  assert.equal(f.root.dataset.theme, 'dark');
  assert.equal(calls.length, 1, 'A parent update is not echoed back');
});

test('child requests receive the current theme at an exact origin, including late-loaded frames', t => {
  const f = fixture(t, {theme:'dark'}), child = frame(f.document);
  f.boot();
  assert.deepEqual(child.calls, [{message:{type:'atlas:ui-theme', theme:'dark'}, targetOrigin:f.view.location.origin}]);
  emit(f.view, 'message', {origin:f.view.location.origin, source:child.window, data:{type:'atlas:ui-theme-request'}});
  assert.equal(child.calls.length, 2);
  const late = frame(f.document);
  emit(f.document, 'load', {target:late.node});
  assert.deepEqual(late.calls, [{message:{type:'atlas:ui-theme', theme:'dark'}, targetOrigin:f.view.location.origin}]);
});

test('a same-origin child choice reaches siblings without echoing or rewriting source data', t => {
  const f = fixture(t), first = frame(f.document), second = frame(f.document);
  f.boot();
  first.calls.length = second.calls.length = 0;
  emit(f.view, 'message', {origin:f.view.location.origin, source:first.window, data:{type:'atlas:ui-theme', theme:'dark'}});
  assert.equal(f.root.dataset.theme, 'dark');
  assert.deepEqual(first.calls, []);
  assert.deepEqual(second.calls, [{message:{type:'atlas:ui-theme', theme:'dark'}, targetOrigin:f.view.location.origin}]);
  emit(f.view, 'message', {origin:f.view.location.origin, source:first.window, data:{type:'atlas:ui-theme', theme:'dark'}});
  assert.equal(second.calls.length, 1, 'An unchanged preference does not create a message loop');
});

test('opaque-origin standalone documents keep local controls without sending wildcard messages', t => {
  const calls = [], parent = {postMessage:(...args) => calls.push(args)};
  const f = fixture(t, {origin:'null', parent}), child = frame(f.document);
  const button = createThemeControl(f.document);
  f.document.body.append(button);
  button.click();
  assert.equal(f.root.dataset.theme, 'dark');
  assert.deepEqual(calls, []);
  assert.deepEqual(child.calls, []);
});

test('applyTheme rejects malformed input and does not need a mounted control', t => {
  const f = fixture(t);
  assert.equal(applyTheme('dark', {document:f.document, persist:false}), 'dark');
  assert.equal(applyTheme('invalid', {document:f.document, persist:false}), 'light');
  assert.equal(f.root.style.getPropertyValue('color-scheme'), 'light');
  assert.deepEqual(f.preference.writes, []);
});
