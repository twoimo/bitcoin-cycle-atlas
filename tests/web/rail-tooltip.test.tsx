import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { mountRailTooltip } from '../../dist/atlas-shell.js';

function fixture() {
  const { document, window } = parseHTML('<html><body data-shell="chart"><aside class="workbench-rail"><button aria-label="시장 분석"><svg></svg><span>시장 분석</span></button><button disabled aria-label="선택 데이터"></button></aside><input aria-label="검색"></body></html>');
  const control = document.querySelector('button')!;
  const properties = ['innerWidth', 'innerHeight', 'matchMedia'].map(key => [key, Object.getOwnPropertyDescriptor(window, key)] as const);
  let mobile = false;
  Object.assign(window, { innerWidth: 1000, innerHeight: 600, matchMedia: () => ({ matches: mobile }) });
  control.getBoundingClientRect = () => ({ left: 955, right: 999, top: 580, bottom: 624, width: 44, height: 44 } as DOMRect);
  const stop = mountRailTooltip(document);
  const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!;
  tip.getBoundingClientRect = () => ({ width: 100, height: 30 } as DOMRect);
  const emit = (node: Element, name: string) => node.dispatchEvent(new window.Event(name, { bubbles: true }));
  return { document, window, control, tip, emit, mobile: () => { mobile = true; }, cleanup: () => { stop(); for (const [key, descriptor] of properties) { if (descriptor) Object.defineProperty(window, key, descriptor); else Reflect.deleteProperty(window, key); } } };
}

test('compact rail keyboard names remain visible and inside a short viewport', t => {
  const f = fixture(); t.after(f.cleanup);
  f.emit(f.control, 'focusin');
  assert.equal(f.tip.hidden, false);
  assert.equal(f.tip.textContent, '시장 분석');
  assert.equal(f.tip.style.left, '847px');
  assert.equal(f.tip.style.top, '562px');
  const escape = new f.window.Event('keydown', { bubbles: true });
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  f.control.dispatchEvent(escape);
  assert.equal(f.tip.hidden, true);
});

test('rail pointer labels follow nested icons and dismiss on navigation or scrolling', t => {
  const f = fixture(); t.after(f.cleanup);
  f.emit(f.control.querySelector('svg')!, 'pointerover');
  assert.equal(f.tip.hidden, false);
  f.emit(f.control, 'pointerdown');
  assert.equal(f.tip.hidden, true);
  f.emit(f.control, 'focusin');
  f.emit(f.document.querySelector('input')!, 'focusin');
  assert.equal(f.tip.hidden, true);
  f.emit(f.control, 'pointerover');
  f.document.dispatchEvent(new f.window.Event('scroll'));
  assert.equal(f.tip.hidden, true);
});

test('disabled controls and mobile trays do not leave a floating desktop label', t => {
  const f = fixture(); t.after(f.cleanup);
  f.emit(f.document.querySelector('button[disabled]')!, 'pointerover');
  assert.equal(f.tip.hidden, true);
  f.mobile();
  f.emit(f.control, 'focusin');
  assert.equal(f.tip.hidden, true);
});
