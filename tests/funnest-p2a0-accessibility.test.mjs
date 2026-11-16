import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountFunnestAccessibility} from '../spikes/funnest-p2a0/accessibility.mjs';

// DOM/handler regression tests, not native browser evidence. LinkeDOM has no
// browser focus, layout visibility, capture phase or default key activation;
// this fixture models those platform operations explicitly. Search and close
// actions still go through the original button callbacks and real DOM removal.
const settle = () => new Promise(done => setImmediate(done));
function fixture(t) {
  const {document, window} = parseHTML('<html><body><button id="outside">Outside</button><div id="mount"><button class="fnc-symbol">BTC</button><button id="unrelated">Other</button></div></body></html>');
  const mount = document.getElementById('mount'), captures = new Map();
  let active = document.body, opens = 0, selections = 0, buttonActions = 0;
  const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
  document.addEventListener = (type, callback, capture) => {
    if (capture === true) { const set = captures.get(type) || new Set(); set.add(callback); captures.set(type, set); }
    else add(type, callback, capture);
  };
  document.removeEventListener = (type, callback, capture) => {
    if (capture === true) captures.get(type)?.delete(callback);
    else remove(type, callback, capture);
  };
  Object.defineProperty(document, 'activeElement', {get:() => active.isConnected ? active : document.body});
  function emit(target, type, detail={}) {
    const event = new window.Event(type, {bubbles:true, cancelable:true});
    Object.defineProperty(event, 'target', {configurable:true, value:target});
    Object.assign(event, detail);
    if (detail.cancelled) event.preventDefault();
    for (const callback of captures.get(type) || []) {
      callback(event);
      if (event.cancelBubble) break;
    }
    if (!event.cancelBubble) target.dispatchEvent(event);
    return event;
  }
  function decorate(root) {
    for (const node of [root, ...root.querySelectorAll('*')]) {
      Object.defineProperty(node, 'tabIndex', {configurable:true, get() {
        const explicit = this.getAttribute('tabindex');
        return explicit === null ? (/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(this.tagName) || this.matches('a[href]') ? 0 : -1) : Number(explicit);
      }});
      node.checkVisibility = () => !node.closest('[hidden], [data-css-hidden]');
      node.getClientRects = () => node.checkVisibility() ? [{}] : [];
      node.focus = () => { if (node.isConnected && !node.disabled) { active = node; emit(node, 'focusin'); } };
      if (node.tagName === 'BUTTON') node.click = () => { if (!node.disabled) emit(node, 'click'); };
    }
  }
  decorate(document.body);
  const symbol = () => mount.querySelector('.fnc-symbol');
  function open() {
    opens++;
    if (mount.querySelector('.fnc-search-dialog')) return;
    const backdrop = document.createElement('div'); backdrop.className = 'fnc-backdrop';
    backdrop.innerHTML = '<div class="fnc-search-dialog" role="dialog" aria-modal="true"><input role="combobox"><button class="close">ESC</button><button class="category">전체</button><button disabled>Disabled</button><button hidden>Hidden</button><button data-css-hidden>CSS hidden</button></div>';
    decorate(backdrop); mount.append(backdrop);
    const dialog = backdrop.firstElementChild;
    // Mirrors 0.6.16's broad dialog Enter selection, plus its close callback.
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Enter') { selections++; backdrop.remove(); event.preventDefault(); }
      else if (event.key === 'Escape') { backdrop.remove(); event.preventDefault(); }
    });
    dialog.querySelector('.close').addEventListener('click', () => backdrop.remove());
    dialog.querySelector('.category').addEventListener('click', () => buttonActions++);
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) backdrop.remove(); });
  }
  symbol().addEventListener('click', open);
  const controller = mountFunnestAccessibility(mount);
  t.after(() => controller.destroy());
  return {document, window, mount, controller, symbol, open, decorate, emit,
    get dialog() { return mount.querySelector('.fnc-search-dialog'); },
    get opens() { return opens; }, get selections() { return selections; }, get buttonActions() { return buttonActions; },
    key(key, detail={}, target=document.activeElement) { return emit(target, 'keydown', {key, ...detail}); },
    up(key, detail={}, target=document.activeElement) { return emit(target, 'keyup', {key, ...detail}); },
    get captureCount() { return [...captures.values()].reduce((n, set) => n + set.size, 0); },
  };
}

test('Enter without a character event activates the existing symbol callback once and owns dialog focus', async t => {
  const f = fixture(t); f.symbol().focus();
  const down = f.key('Enter');
  assert.equal(down.defaultPrevented, true, 'native default activation must not duplicate the explicit click');
  assert.equal(f.opens, 1); assert.ok(f.dialog);
  f.up('Enter'); await settle();
  assert.equal(f.opens, 1);
  assert.equal(f.document.activeElement, f.dialog.querySelector('[role="combobox"]'));
});

test('Space activates on release and never on repeat, lone keyup, moved focus or a lost window', async t => {
  for (const cancel of ['none', 'focus', 'blur']) {
    const f = fixture(t); f.symbol().focus();
    f.up(' '); assert.equal(f.opens, 0);
    assert.equal(f.key(' ').defaultPrevented, true); f.key(' ', {repeat:true}); assert.equal(f.opens, 0);
    if (cancel === 'focus') f.document.getElementById('unrelated').focus();
    if (cancel === 'blur') f.window.dispatchEvent(new f.window.Event('blur'));
    f.up(' '); await settle();
    assert.equal(f.opens, cancel === 'none' ? 1 : 0);
  }
});

test('modified, composing, already cancelled, disabled, unfocused and unrelated keys do not activate search', t => {
  const f = fixture(t); f.symbol().focus();
  for (const detail of [{altKey:true}, {ctrlKey:true}, {metaKey:true}, {isComposing:true}, {keyCode:229}, {repeat:true}]) f.key('Enter', detail);
  f.symbol().disabled = true; f.key('Enter'); f.symbol().disabled = false;
  f.document.getElementById('outside').focus(); f.key('Enter', {}, f.symbol());
  f.document.getElementById('unrelated').focus(); f.key('Enter');
  f.symbol().focus();
  // A preceding capture owner may cancel the event before this adapter.
  f.key('Enter', {cancelled:true});
  assert.equal(f.opens, 0);
});

test('pointer opening uses the same package callback and Escape returns focus after actual unmount', async t => {
  const f = fixture(t); f.symbol().focus(); f.symbol().click(); await settle();
  assert.equal(f.opens, 1); assert.ok(f.dialog.contains(f.document.activeElement));
  const down = f.key('Escape'); assert.equal(down.defaultPrevented, true);
  assert.equal(f.dialog, null); assert.notEqual(f.document.activeElement, f.symbol(), 'the adapter awaits real removal observation');
  await settle(); assert.equal(f.document.activeElement, f.symbol());
});

test('Tab wraps current visible enabled controls in both directions and leaves middle steps native', async t => {
  const f = fixture(t); f.symbol().focus(); f.symbol().click(); await settle();
  const input = f.dialog.querySelector('input'), close = f.dialog.querySelector('.close'), last = f.dialog.querySelector('.category');
  assert.equal(f.key('Tab', {shiftKey:true}).defaultPrevented, true); assert.equal(f.document.activeElement, last);
  assert.equal(f.key('Tab').defaultPrevented, true); assert.equal(f.document.activeElement, input);
  assert.equal(f.key('Tab').defaultPrevented, false); close.focus();
  assert.equal(f.key('Tab', {shiftKey:true}).defaultPrevented, false);
  const next = f.document.createElement('button'); next.textContent = 'New action'; f.decorate(next); f.dialog.append(next);
  input.focus(); f.key('Tab', {shiftKey:true}); assert.equal(f.document.activeElement, next, 'tab order is read after content changes');
});

test('focus escaping an open modal is redirected inside, without taking focus when no modal exists', async t => {
  const f = fixture(t), outside = f.document.getElementById('outside'); outside.focus();
  assert.equal(f.document.activeElement, outside);
  f.symbol().focus(); f.symbol().click(); await settle();
  const last = f.dialog.querySelector('.category'); last.focus(); outside.focus();
  assert.equal(f.document.activeElement, last);
  f.dialog.closest('.fnc-backdrop').remove(); await settle(); outside.focus();
  assert.equal(f.document.activeElement, outside);
});

test('focused close/category buttons receive their own activation instead of the parent Enter selection', async t => {
  const f = fixture(t); f.symbol().focus(); f.symbol().click(); await settle();
  f.dialog.querySelector('.category').focus(); f.key('Enter');
  assert.equal(f.buttonActions, 1); assert.equal(f.selections, 0); assert.ok(f.dialog);
  f.dialog.querySelector('.close').focus(); f.key('Enter'); await settle();
  assert.equal(f.dialog, null); assert.equal(f.selections, 0); assert.equal(f.document.activeElement, f.symbol());
});

test('combobox Enter keeps the package result-selection path and returns to the opener', async t => {
  const f = fixture(t); f.symbol().focus(); f.symbol().click(); await settle();
  f.key('Enter'); await settle();
  assert.equal(f.selections, 1); assert.equal(f.dialog, null); assert.equal(f.document.activeElement, f.symbol());
});

test('backdrop dismissal returns to a replacement symbol button when the original opener was removed', async t => {
  const f = fixture(t); f.symbol().focus(); f.symbol().click(); await settle();
  const original = f.symbol(), next = original.cloneNode(true); f.decorate(next); original.replaceWith(next);
  f.emit(f.dialog.closest('.fnc-backdrop'), 'pointerdown'); await settle();
  assert.equal(f.document.activeElement, next); assert.equal(original.isConnected, false);
});

test('a temporarily empty modal remains a focus boundary and its fallback tabindex is removed on cleanup', async t => {
  const f = fixture(t); f.symbol().focus(); f.symbol().click(); await settle();
  const dialog = f.dialog; dialog.replaceChildren(); await settle();
  f.document.getElementById('outside').focus();
  assert.equal(f.document.activeElement, dialog); assert.equal(dialog.getAttribute('tabindex'), '-1');
  assert.equal(f.key('Tab').defaultPrevented, true); assert.equal(f.document.activeElement, dialog);
  f.controller.destroy(); assert.equal(dialog.hasAttribute('tabindex'), false);
});

test('destroy is idempotent, removes handlers and observers, and never restores focus after teardown', async t => {
  const f = fixture(t); f.symbol().focus(); f.symbol().click(); await settle();
  assert.equal(f.captureCount, 4); f.controller.destroy(); f.controller.destroy(); assert.equal(f.captureCount, 0);
  f.dialog.closest('.fnc-backdrop').remove(); await settle();
  assert.equal(f.document.activeElement, f.document.body);
  f.symbol().focus(); f.key('Enter'); await settle(); assert.equal(f.opens, 1);
});
