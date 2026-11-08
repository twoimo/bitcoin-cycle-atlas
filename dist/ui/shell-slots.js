// The shell owns positions, while the existing chart controllers keep their
// nodes, listeners and state. Asset-specific controls share only top slot 5.
export const SHELL_SLOT_KEYS = Object.freeze({
  top: ['symbol', 'interval', 'chart-type', 'indicators', 'instrument', 'history', 'workspace', 'chart-menu', 'export', 'settings'],
  bottom: ['range', 'date', 'events', 'readout', 'scale', 'auto-scale', 'fit', 'status'],
  left: ['crosshair', 'pan', 'measure', 'magnet', 'clear', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'reset', 'annotations'],
  right: ['outlook', 'market-us', 'evidence', 'data', 'ipo', 'relay', 'selection', 'layers', 'method', 'records', 'help'],
});

const instances = new WeakMap();
const set = (node, key, value) => { if (node && node.getAttribute(key) !== String(value)) node.setAttribute(key, String(value)); };
function slot(node, region, index) {
  if (!node) return;
  set(node, 'data-shell-slot', index + 1);
  set(node, 'data-shell-key', SHELL_SLOT_KEYS[region][index]);
  set(node, 'data-shell-owner', region);
}
function ordered(parent, nodes) {
  const present = nodes.filter(Boolean);
  // Move only when needed: moving a focused control unnecessarily loses focus
  // in some browsers and moving portal hosts can disrupt their current owner.
  const current = [...parent.children].filter(node => present.includes(node));
  if (present.every((node, index) => current[index] === node && node.parentElement === parent)) return;
  for (const node of present) parent.append(node);
}

export function refreshShellSlots(document, {symbol} = {}) {
  const heading = document.querySelector('.atlas-canvas-heading');
  if (!heading?.querySelector('#workbench-workspace')) return;
  const instance = instances.get(document);
  if (symbol && instance) instance.symbol = symbol;
  const currentSymbol = symbol || instance?.symbol || document.documentElement.dataset.symbol || 'BTCUSD';
  const $ = selector => document.querySelector(selector);
  set(heading, 'data-shell-region', 'top');
  set(heading, 'aria-label', `${currentSymbol} 차트 상단 도구`);
  let feature = heading.querySelector('[data-shell-key="instrument"]');
  if (!feature) {
    feature = document.createElement('div');
    feature.className = 'shell-instrument-slot';
    feature.setAttribute('role', 'group');
    heading.append(feature);
  }
  slot(feature, 'top', 4);
  set(feature, 'aria-label', `${currentSymbol} 종목 기능`);
  const special = '#workbench-scenario,#atlas-cycle-panel,#workbench-monthly-backtest,#workbench-replay,#workbench-next-turn,#equity-scenario,#eth-history-trigger,[data-eth-action],[data-equity-action],.center-workspace-toolbar';
  for (const node of heading.querySelectorAll(special)) {
    if (node.matches('.center-workspace-toolbar') && document.body.dataset.centerTool && !document.body.dataset.chartControls) {
      if (node.parentElement !== heading) heading.append(node);
      continue;
    }
    if (node.parentElement !== feature && !node.closest('.center-workspace-toolbar')) feature.append(node);
    else if (node.matches('.center-workspace-toolbar') && node.parentElement !== feature) feature.append(node);
  }
  // The symbol controller adds history buttons later during BTC boot. Reserve
  // its slot without creating a second, nonfunctional undo/redo action.
  let history = heading.querySelector('.workspace-history-controls');
  if (!history) {
    history = heading.querySelector('.shell-history-slot');
    if (!history) { history = document.createElement('span'); history.className = 'shell-history-slot'; heading.append(history); }
    set(history, 'aria-label', '차트 변경 기록 준비 중');
  } else heading.querySelector('.shell-history-slot')?.remove();
  const top = [heading.querySelector('.symbol-selector-trigger,.workbench-symbol'), $('#workbench-frequency'), $('#workbench-chart-type'), $('#atlas-mode-menu'), feature, history, $('#workbench-workspace'), $('#workbench-chart-menu'), $('#lab-svg'), $('#atlas-display-options')];
  top.forEach((node, index) => slot(node, 'top', index));
  ordered(heading, [...top, ...[...heading.children].filter(node => !top.includes(node))]);
  for (const spacer of heading.querySelectorAll('.workbench-spacer,.eth-divider')) if (!spacer.hidden) spacer.hidden = true;

  const footer = $('.workbench-bottom-bar');
  if (footer) {
    set(footer, 'data-shell-region', 'bottom');
    set(footer, 'aria-label', `${currentSymbol} 차트 하단 조작부`);
    [footer.querySelector('.workbench-range-controls'), $('#workbench-go-date'), footer.querySelector('.workbench-event-slot'), $('#workbench-range-label'), $('#workbench-scale'), $('#workbench-auto-scale'), $('#workbench-fit'), footer.querySelector('.workbench-status')].forEach((node, index) => slot(node, 'bottom', index));
    // More is the status slot's disclosure, not a ninth tool category.
    set($('#workbench-bottom-more'), 'data-shell-disclosure', 'status');
  }
  const left = $('.workbench-tools');
  if (left) {
    set(left, 'data-shell-region', 'left');
    set(left, 'aria-label', `${currentSymbol} 차트 조작 도구`);
    const controls = ['[data-chart-tool="crosshair"]','[data-chart-tool="pan"]','[data-chart-tool="measure"]','#workbench-magnet','#workbench-clear','[data-chart-navigation="in"]','[data-chart-navigation="out"]','[data-chart-navigation="left"]','[data-chart-navigation="right"]','[data-chart-navigation="reset"]','#workbench-annotations'].map(selector => left.querySelector(selector));
    controls.forEach((node, index) => slot(node, 'left', index));
    ordered(left, [...controls.slice(0, 5), left.querySelector('#workbench-navigation'), controls[10]]);
    const navigation = left.querySelector('.chart-navigation');
    if (navigation) ordered(navigation, controls.slice(5, 10));
  }
  const rail = $('.workbench-rail');
  if (rail) {
    set(rail, 'data-shell-region', 'right');
    set(rail, 'aria-label', `${currentSymbol} 차트 정보와 자료`);
    const navigation = rail.querySelector('.atlas-nav');
    const links = navigation ? [...navigation.querySelectorAll('[data-atlas-page]')] : [];
    // Service navigation has six entries maintained by atlas-navigation.js.
    links.forEach((node, index) => slot(node, 'right', index));
    const details = rail.querySelector('.workbench-detail-tools');
    const detailControls = details ? ['[data-reader="selection"]','[data-reader="layers"]','[data-reader="math"]','[data-reader="events"],#workbench-next-turn'].map(selector => details.querySelector(selector)) : [];
    detailControls.forEach((node, index) => slot(node, 'right', index + 6));
    if (details) ordered(details, detailControls);
    slot(rail.querySelector('.workbench-help'), 'right', 10);
  }
  const workbench = $('.atlas-workbench,.native-chart-workbench');
  if (workbench) set(workbench, 'aria-label', `${currentSymbol} 가격 차트`);
  const plot = $('.atlas-plot');
  if (plot) set(plot, 'data-chart-symbol', currentSymbol);
}

/** One observer covers asynchronous shell mounts, not chart paints. It never
 * writes URL/history or edits a source-owned chart or financial data. */
export function mountShellSlots(document) {
  if (instances.has(document)) return instances.get(document).controller;
  const view = document.defaultView || globalThis;
  const state = {symbol: null, controller: null};
  let queued = false, destroyed = false;
  const schedule = () => {
    if (queued || destroyed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (destroyed) return;
      observer?.disconnect();
      refreshShellSlots(document);
      observer?.observe(document.body, {childList: true, subtree: true});
    });
  };
  const onSymbol = event => { if (event.detail?.symbol) state.symbol = event.detail.symbol; schedule(); };
  const Observer = view.MutationObserver || globalThis.MutationObserver;
  const observer = Observer ? new Observer(records => {
    if (records.some(record => {
      const target = record.target;
      if (target.namespaceURI === 'http://www.w3.org/2000/svg') return false;
      if (target.closest?.('.atlas-canvas-heading,.workbench-bottom-bar,.workbench-tools,.workbench-rail')) return true;
      return [...record.addedNodes].some(node => node.closest?.('.atlas-canvas-heading,.workbench-bottom-bar,.workbench-tools,.workbench-rail') || node.querySelector?.('.atlas-canvas-heading,.workbench-bottom-bar,.workbench-tools,.workbench-rail'));
    })) schedule();
  }) : null;
  state.controller = {refresh: options => refreshShellSlots(document, options), destroy() {
    destroyed = true; observer?.disconnect(); document.removeEventListener('atlas:active-symbol', onSymbol); document.removeEventListener('atlas:workbench-state', schedule); instances.delete(document);
  }};
  instances.set(document, state);
  document.addEventListener('atlas:active-symbol', onSymbol);
  document.addEventListener('atlas:workbench-state', schedule);
  observer?.observe(document.body, {childList: true, subtree: true});
  schedule();
  return state.controller;
}
