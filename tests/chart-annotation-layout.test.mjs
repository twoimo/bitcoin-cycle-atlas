import assert from 'node:assert/strict';
import test from 'node:test';
import {createChartAnnotationLayout, selectAnnotationLabels} from '../dist/ui/chart-annotation-layout.js';

// This boundary supplies measured glyph rectangles, not a text-width estimate.
// Native browser receipts separately measure the real font and SVG transform.
class Style {
  values = new Map();
  getPropertyValue(name) {return this.values.get(name)?.value || '';}
  getPropertyPriority(name) {return this.values.get(name)?.priority || '';}
  setProperty(name, value, priority = '') {this.values.set(name, {value, priority});}
  removeProperty(name) {this.values.delete(name);}
}
class Node {
  constructor(tagName, attrs = {}, box = null) {
    this.tagName = tagName; this.attrs = new Map(Object.entries(attrs)); this.children = [];
    this.style = new Style(); this.dataset = {}; this.box = box; this.listeners = new Map(); this.textContent = '';
    for (const [name, value] of this.attrs) this.setAttribute(name, value);
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = String(value);
  }
  getAttribute(name) {return this.attrs.get(name) ?? null;}
  hasAttribute(name) {return this.attrs.has(name);}
  removeAttribute(name) {this.attrs.delete(name);}
  append(...nodes) {for (const node of nodes) {node.parentElement = this; node.ownerDocument = this.ownerDocument; this.children.push(node);} return nodes.at(-1);}
  matches(selector) {
    if (selector === ':hover') return Boolean(this.hovered);
    if (selector.startsWith('.')) return (this.getAttribute('class') || '').split(/\s+/).includes(selector.slice(1));
    return selector === this.tagName;
  }
  closest(selector) {return selector.split(',').some(part => this.matches(part)) ? this : this.parentElement?.closest(selector) || null;}
  querySelectorAll(selector) {
    if (selector.includes('[data-cycle-clock]')) return this.fixed || [];
    const parts = selector.split(',');
    return this.children.flatMap(child => [...(parts.some(part => child.matches(part)) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  getBoundingClientRect() {return {left: this.box?.x || 0, top: this.box?.y || 0, width: this.box?.width || 0, height: this.box?.height || 0};}
  addEventListener(type, handler) {const handlers = this.listeners.get(type) || new Set(); handlers.add(handler); this.listeners.set(type, handlers);}
  removeEventListener(type, handler) {this.listeners.get(type)?.delete(handler);}
  dispatch(type) {for (const handler of this.listeners.get(type) || []) handler({target: this});}
}
const computed = node => {
  let visibility = 'visible';
  for (let current = node; current; current = current.parentElement) {
    const value = current.style.getPropertyValue('visibility') || current.visibility;
    if (value) {visibility = value; break;}
  }
  return {visibility, display: node.display || 'inline', opacity: String(node.opacity ?? 1)};
};
function fixture(width = 390) {
  const queue = new Map(); let next = 0, resolveFonts;
  const fonts = new Node('fonts'); fonts.ready = new Promise(resolve => {resolveFonts = resolve;});
  const doc = {activeElement: null, fonts, defaultView: {
    getComputedStyle: computed,
    requestAnimationFrame(callback) {queue.set(++next, callback); return next;},
    cancelAnimationFrame(id) {queue.delete(id);},
  }};
  const svg = new Node('svg', {}, {x: 0, y: 0, width, height: 400}); svg.ownerDocument = doc; svg.isConnected = true;
  Object.assign(svg.dataset, {plotLeft: '8', plotRight: String(width - 66), plotTop: '18', priceBottom: '340'});
  svg.getScreenCTM = () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0});
  return {svg, doc, fonts, resolveFonts, flush() {for (const [id, callback] of [...queue]) {queue.delete(id); callback();}}, queue};
}
function annotation(fix, kind, id, box, text = id, {preview = false} = {}) {
  const names = {history: ['history-event-marker', 'data-history-event', 'history-event-preview'], period: ['cycle-interval', 'data-cycle-interval', 'cycle-interval-preview'], milestone: ['cycle-marker', 'data-cycle-marker', 'cycle-marker-preview']};
  const [className, attribute, previewClass] = names[kind];
  const group = new Node('g', {class: className, [attribute]: id, role: 'button', tabindex: '0', 'aria-label': `${id} · 2025-01-29 UTC · 원문과 가격 근거`});
  fix.svg.append(group);
  const title = new Node('title'); title.textContent = '원문과 가격 근거'; group.append(title);
  const anchor = new Node(kind === 'period' ? 'line' : 'circle', kind === 'period' ? {x1: '31.25', x2: '201.75', y1: '205', y2: '205'} : {cx: '67.25', cy: '128.75', r: '4'});
  group.append(anchor);
  let container = group;
  if (preview) {container = new Node('g', {class: previewClass, 'aria-hidden': 'true'}); container.visibility = 'hidden'; group.append(container);}
  const leader = new Node('path', {d: 'M67.25,128.75L75,140'}), background = new Node('rect', {x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height)});
  if (kind !== 'period') container.append(leader, background);
  const label = new Node('text', {}, box); label.textContent = text; container.append(label);
  return {group, label, anchor, background, leader, container};
}
const hidden = node => computed(node).visibility === 'hidden';
const immutable = item => ({group: Object.fromEntries(item.group.attrs), anchor: Object.fromEntries(item.anchor.attrs)});
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('measured event and milestone paint no longer overlaps while both evidence anchors remain unchanged', () => {
  const fix = fixture(1440);
  const event = annotation(fix, 'history', 'el-salvador-reform-2025', {x: 760, y: 180, width: 110, height: 14}, '엘살바도르 법 개정');
  const milestone = annotation(fix, 'milestone', 'first-top', {x: 806, y: 183, width: 66, height: 14}, 'FIRST TOP');
  const before = [event, milestone].map(immutable);
  fix.svg.dataset.historyEventCount = '1';
  const layout = createChartAnnotationLayout(fix.svg, {eventPriorities: new Map([['el-salvador-reform-2025', 2]])});
  assert.equal(hidden(event.label), false); assert.equal(hidden(milestone.label), true);
  assert.equal(hidden(milestone.background), true); assert.equal(hidden(milestone.leader), true);
  assert.equal(hidden(milestone.anchor), false);
  assert.deepEqual([event, milestone].map(immutable), before);
  assert.deepEqual(layout.refresh(), {visibleCount: 1, hiddenCount: 1});
  assert.equal(fix.svg.dataset.cycleMarkerLabelCount, '0');
  layout.destroy(); assert.equal(hidden(milestone.label), false);
});

test('nearby real event names use source importance, then focus priority, without moving their dates or prices', () => {
  const fix = fixture();
  const sec = annotation(fix, 'history', 'sab-122-2025', {x: 35, y: 70, width: 166, height: 15}, 'SEC 수탁 회계지침');
  const reform = annotation(fix, 'history', 'el-salvador-reform-2025', {x: 52, y: 70, width: 171, height: 15}, '엘살바도르 법 개정');
  const before = [sec, reform].map(immutable); fix.svg.dataset.historyEventCount = '2';
  const layout = createChartAnnotationLayout(fix.svg, {eventPriorities: new Map([['sab-122-2025', 1], ['el-salvador-reform-2025', 2]])});
  assert.equal(hidden(sec.label), true); assert.equal(hidden(reform.label), false);
  assert.equal(fix.svg.dataset.historyLabelCount, '1'); assert.equal(fix.svg.dataset.historyHiddenLabelCount, '1');
  fix.doc.activeElement = sec.group; fix.svg.dispatch('focusin'); fix.flush();
  assert.equal(hidden(sec.label), false); assert.equal(hidden(reform.label), true);
  assert.deepEqual([sec, reform].map(immutable), before);
  fix.doc.activeElement = null; fix.svg.dispatch('focusout'); fix.flush();
  assert.equal(hidden(sec.label), true); assert.equal(hidden(reform.label), false);
  layout.destroy();
});

test('overlapping period text yields before any UTC endpoint, duration line or accessible evidence is removed', () => {
  const fix = fixture(768);
  const bottom = annotation(fix, 'period', 'bottom-bottom', {x: 80, y: 230, width: 166, height: 14}, 'BOTTOM → BOTTOM · 177주');
  const peak = annotation(fix, 'period', 'bottom-cycle-top', {x: 110, y: 231, width: 177, height: 14}, 'BOTTOM → CYCLE TOP · 1…');
  const before = [bottom, peak].map(immutable);
  const layout = createChartAnnotationLayout(fix.svg);
  assert.equal(hidden(bottom.label), false); assert.equal(hidden(peak.label), true);
  assert.equal(hidden(peak.anchor), false); assert.deepEqual([bottom, peak].map(immutable), before);
  assert.equal(fix.svg.dataset.cycleIntervalLabelCount, '1');
  peak.group.hovered = true; fix.svg.dispatch('pointerover'); fix.flush();
  assert.equal(hidden(peak.label), false); assert.equal(hidden(bottom.label), true);
  layout.destroy();
});

test('hidden SVG previews with nonzero geometry are not counted; a visible focused preview reserves its actual text', () => {
  const fix = fixture();
  const visible = annotation(fix, 'history', 'visible', {x: 90, y: 90, width: 130, height: 16});
  const preview = annotation(fix, 'period', 'preview', {x: 95, y: 91, width: 140, height: 40}, '기간 · 날짜 · 근거', {preview: true});
  const layout = createChartAnnotationLayout(fix.svg);
  assert.deepEqual(layout.refresh(), {visibleCount: 1, hiddenCount: 0});
  preview.container.visibility = 'visible'; fix.doc.activeElement = preview.group;
  fix.svg.dispatch('focusin'); fix.flush();
  assert.equal(hidden(preview.label), false); assert.equal(hidden(visible.label), true);
  preview.container.visibility = 'hidden'; fix.doc.activeElement = null;
  fix.svg.dispatch('focusout'); fix.flush();
  assert.equal(hidden(visible.label), false); assert.deepEqual(layout.refresh(), {visibleCount: 1, hiddenCount: 0});
  layout.destroy();
});

test('font completion remeasures glyph expansion and releases labels when the collision goes away', async () => {
  const fix = fixture();
  const first = annotation(fix, 'history', 'first', {x: 20, y: 75, width: 75, height: 15});
  const second = annotation(fix, 'period', 'second', {x: 120, y: 76, width: 75, height: 15});
  const layout = createChartAnnotationLayout(fix.svg);
  assert.equal(hidden(second.label), false);
  first.label.box.width = 125; fix.resolveFonts(); await Promise.resolve(); fix.flush();
  assert.equal(hidden(second.label), true);
  first.label.box.width = 75; fix.fonts.dispatch('loadingdone'); fix.flush();
  assert.equal(hidden(second.label), false);
  layout.destroy();
});

test('fixed annotation text is reserved, while an information-dot glyph is not treated as a label', () => {
  const fix = fixture();
  const event = annotation(fix, 'history', 'event', {x: 70, y: 90, width: 110, height: 14});
  const clock = new Node('text', {}, {x: 130, y: 92, width: 100, height: 14}); clock.textContent = '거시 시계'; fix.svg.append(clock); fix.svg.fixed = [clock];
  const layout = createChartAnnotationLayout(fix.svg);
  assert.equal(hidden(event.label), true);
  clock.textContent = 'i'; layout.refresh(); assert.equal(hidden(event.label), false);
  layout.destroy();
});

test('a new drawing and a retired renderer cannot retain old listeners or hide replacement text', async () => {
  const fix = fixture();
  annotation(fix, 'history', 'first', {x: 20, y: 50, width: 120, height: 14});
  const second = annotation(fix, 'period', 'second', {x: 30, y: 50, width: 120, height: 14});
  let active = true;
  const previous = createChartAnnotationLayout(fix.svg, {isCurrent: () => active});
  assert.equal(hidden(second.label), true);
  const replacement = createChartAnnotationLayout(fix.svg);
  assert.equal(fix.svg.listeners.get('focusin').size, 1); assert.equal(fix.fonts.listeners.get('loadingdone').size, 1);
  active = false; assert.equal(previous.refresh(), null);
  replacement.destroy(); fix.resolveFonts(); await Promise.resolve(); fix.flush();
  assert.equal(hidden(second.label), false);
  assert.equal(fix.svg.listeners.get('focusin').size, 0); assert.equal(fix.fonts.listeners.get('loadingdone').size, 0);
  assert.equal(fix.queue.size, 0);
});

test('phone, tablet and desktop priority packing keeps meaningful labels with zero measured rectangle intersections', () => {
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    const labels = Array.from({length: 61}, (_, index) => ({id: index, priority: index % 9 === 0 ? 10 : 1, box: {
      x: 8 + (index % 12) * (width - 90) / 12,
      y: 25 + Math.floor(index / 12) * 13,
      width: index % 3 === 0 ? 177 : 110, height: 16,
    }}));
    const {accepted, hidden: rejected} = selectAnnotationLabels(labels);
    assert.ok(accepted.length > 0 && rejected.length > 0, `${width}: preserve readable labels while collapsing crowded text`);
    assert.equal(accepted.length + rejected.length, labels.length);
    for (const [index, label] of accepted.entries()) for (const other of accepted.slice(index + 1)) assert.equal(overlap(label.box, other.box), false);
  }
});
