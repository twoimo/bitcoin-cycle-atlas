// The source renderers choose useful labels from the available plot area.
// This final pass uses painted browser glyph bounds, including a loaded font
// and an open hover/focus preview. Only label paint may yield; source anchors,
// interval endpoints and the accessible evidence controls never move.
const controllers = new WeakMap();
const groupSelector = '.history-event-marker,.cycle-interval,.cycle-marker';
const previewSelector = '.history-event-preview,.cycle-interval-preview,.cycle-marker-preview';
const finiteBox = box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;
const tag = node => node?.tagName?.toLowerCase();
const classHas = (node, name) => (node.getAttribute?.('class') || '').split(/\s+/).includes(name);
const intersects = (a, b, gap) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
const intersectBox = (a, b) => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x, height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? {x, y, width, height} : null;
};

/** Priority affects text visibility only. Equal priorities keep source order. */
export function selectAnnotationLabels(labels, {obstacles = [], gap = 2} = {}) {
  const accepted = [], hidden = [], blocked = obstacles.filter(finiteBox);
  for (const item of labels.map((label, index) => ({...label, index})).filter(item => finiteBox(item.box))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.index - b.index)) {
    if (blocked.some(box => intersects(item.box, box, gap)) || accepted.some(other => intersects(item.box, other.box, gap))) hidden.push(item);
    else accepted.push(item);
  }
  return {accepted, hidden};
}

function plotBounds(svg) {
  const rect = svg.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0 && rect.height > 0)) return null;
  const outer = {x: rect.left, y: rect.top, width: rect.width, height: rect.height};
  const {plotLeft, plotRight, plotTop, priceBottom} = svg.dataset || {};
  const [left, right, top, bottom] = [plotLeft, plotRight, plotTop, priceBottom].map(Number);
  if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top) return outer;
  const matrix = svg.getScreenCTM?.();
  if (matrix && [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) {
    const points = [[left, top], [right, top], [left, bottom], [right, bottom]].map(([x, y]) => ({x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f}));
    const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
    return intersectBox(outer, {x, y, width: Math.max(...points.map(point => point.x)) - x, height: Math.max(...points.map(point => point.y)) - y});
  }
  return outer;
}

function paintedBox(node, svg, view, bounds) {
  // A hidden SVG preview still has a nonzero bounding rect. Check computed
  // visibility on the text itself, where SVG visibility inheritance resolves.
  const style = view.getComputedStyle(node);
  if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return null;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const parentStyle = view.getComputedStyle(parent);
    if (parent.hidden || parentStyle.display === 'none' || Number(parentStyle.opacity) === 0) return null;
    if (parent === svg) break;
  }
  const rect = node.getBoundingClientRect?.();
  return rect && finiteBox({x: rect.left, y: rect.top, width: rect.width, height: rect.height})
    ? intersectBox({x: rect.left, y: rect.top, width: rect.width, height: rect.height}, bounds) : null;
}

function labelCandidates(svg, view, bounds, priorities) {
  const result = [], focused = svg.ownerDocument?.activeElement?.closest?.(groupSelector);
  for (const group of svg.querySelectorAll(groupSelector)) {
    const kind = group.hasAttribute('data-history-event') ? 'history' : group.hasAttribute('data-cycle-interval') ? 'period' : 'milestone';
    const children = Array.from(group.children || []);
    const importance = kind === 'history' ? Number(priorities.get(group.dataset.historyEvent) || 1) : 0;
    const priority = (group === focused ? 10000 : group.matches?.(':hover') ? 9000 : classHas(group, 'is-active') ? 8000 : classHas(group, 'is-related') ? 7000 : 0)
      + (kind === 'history' ? 400 + importance * 20 : kind === 'milestone' ? 300 : 200);
    const add = (text, preview) => {
      const box = paintedBox(text, svg, view, bounds);
      if (!box) return;
      // Event/landmark backgrounds and their leader strokes yield with text.
      // Period geometry always remains, including its original-date hit line.
      const paint = preview ? [preview] : kind === 'period' ? [text] : children.filter(node => ['text', 'rect', 'path'].includes(tag(node)));
      result.push({text, group, kind, preview: Boolean(preview), paint, box, priority: priority + (preview ? 2 : 1)});
    };
    for (const child of children) if (tag(child) === 'text') add(child, null);
    for (const preview of group.querySelectorAll(previewSelector)) for (const text of preview.querySelectorAll('text')) add(text, preview);
  }
  return result;
}

function fixedLabelBoxes(svg, view, bounds) {
  // These labels have their own owners and source semantics. Reserve their
  // actual paint rather than changing a clock, model explanation or drawing.
  return Array.from(svg.querySelectorAll('[data-cycle-clock] > text,[data-next-turn] > text,.forecast-event-label,[data-forecast-evidence] > text,.research-annotation text'))
    .filter(node => node.textContent.trim() !== 'i')
    .map(node => paintedBox(node, svg, view, bounds)).filter(Boolean);
}

/** Install once per completed drawing; the next drawing retires this owner. */
export function createChartAnnotationLayout(svg, {isCurrent = () => true, eventPriorities = new Map()} = {}) {
  controllers.get(svg)?.destroy();
  const view = svg.ownerDocument?.defaultView, hidden = new Map(), listeners = [];
  let retired = false, frame = null;
  const current = () => !retired && isCurrent() && svg.isConnected !== false;
  const restore = () => {
    for (const [node, original] of hidden) {
      if (original.visibility) node.style.setProperty('visibility', original.visibility, original.priority);
      else node.style.removeProperty('visibility');
      if (original.marker === null) node.removeAttribute('data-annotation-overlap-hidden');
      else node.setAttribute('data-annotation-overlap-hidden', original.marker);
    }
    hidden.clear();
  };
  const hide = node => {
    if (!node.style || hidden.has(node)) return;
    hidden.set(node, {visibility: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility'), marker: node.getAttribute('data-annotation-overlap-hidden')});
    node.style.setProperty('visibility', 'hidden', 'important');
    node.setAttribute('data-annotation-overlap-hidden', 'true');
  };
  const refresh = () => {
    if (!current() || typeof view?.getComputedStyle !== 'function') return null;
    const bounds = plotBounds(svg);
    if (!bounds) return null;
    restore();
    const candidates = labelCandidates(svg, view, bounds, eventPriorities);
    const result = selectAnnotationLabels(candidates, {obstacles: fixedLabelBoxes(svg, view, bounds)});
    for (const item of result.hidden) item.paint.forEach(hide);
    const count = kind => result.accepted.filter(item => item.kind === kind && !item.preview).length;
    svg.dataset.annotationLayout = 'measured';
    svg.dataset.annotationTextCount = String(result.accepted.length);
    svg.dataset.annotationHiddenTextCount = String(result.hidden.length);
    if (svg.querySelector('.history-event-marker')) {
      svg.dataset.historyLabelCount = String(count('history'));
      svg.dataset.historyHiddenLabelCount = String(Math.max(0, Number(svg.dataset.historyEventCount || 0) - count('history')));
    }
    if (svg.querySelector('.cycle-interval')) {
      svg.dataset.cycleIntervalLabelCount = String(count('period'));
      const layer = svg.querySelector('.cycle-interval-overlay');
      if (layer) layer.dataset.cycleIntervalLabelCount = String(count('period'));
    }
    if (svg.querySelector('.cycle-marker')) svg.dataset.cycleMarkerLabelCount = String(count('milestone'));
    return {visibleCount: result.accepted.length, hiddenCount: result.hidden.length};
  };
  const schedule = () => {
    if (!current() || frame !== null) return;
    if (typeof view?.requestAnimationFrame === 'function') frame = view.requestAnimationFrame(() => {frame = null; refresh();});
    else refresh();
  };
  const listen = (node, type) => {
    if (!node?.addEventListener) return;
    node.addEventListener(type, schedule, true); listeners.push([node, type]);
  };
  const controller = {refresh, destroy() {
    if (retired) return;
    retired = true;
    if (frame !== null) view?.cancelAnimationFrame?.(frame);
    for (const [node, type] of listeners) node.removeEventListener(type, schedule, true);
    restore();
    if (controllers.get(svg) === controller) controllers.delete(svg);
  }};
  controllers.set(svg, controller);
  for (const type of ['pointerover', 'pointerout', 'focusin', 'focusout']) listen(svg, type);
  listen(svg.ownerDocument?.fonts, 'loadingdone');
  svg.ownerDocument?.fonts?.ready?.then(schedule, () => {});
  refresh();
  return controller;
}
