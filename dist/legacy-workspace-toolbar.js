// The child keeps every data/query/event owner. Only the active same-origin
// frame's controls are mirrored into its stable outer toolbar host.
const PAGE_LABELS = { data: '자산 비교', ipo: '공모주', evidence: '리서치' };
const REQUIRED = {
  data: ['#asset-search', '#asset-sector-filter', '#asset-group-filter', '#asset-columns', '#asset-sort', '#asset-filter-reset', '#asset-visible-count', '#asset-refresh', '#asset-history-open', '#daily-method-open', '#export-raw'],
  ipo: ['.ipo-search', '[data-ipo-filter="upcoming"]', '[data-ipo-filter="closed"]', '[data-ipo-filter="all"]', '[data-ipo-page="previous"]', '[data-ipo-page="next"]', '[data-ipo-page="today"]', '[data-ipo-page="list"]', '.ipo-page-label', '.ipo-source-panel'],
  evidence: ['#evidence-search', '#evidence-asset', '#evidence-filter', '#evidence-clear', '#evidence-prev', '#evidence-more', '#evidence-progress'],
};
const ICONS = {
  filters: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  previous: '<path d="m15 6-6 6 6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  source: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16M8 14h3m2 0h3m-8 3h3"/>',
};
const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
const setAttribute = (node, name, value) => {
  if (value == null) { if (node.hasAttribute(name)) node.removeAttribute(name); }
  else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
};
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };

export function mountLegacyWorkspaceToolbar({ frame, heading, host, page, isActive = () => true } = {}) {
  const id = typeof page === 'string' ? page : page?.id;
  const doc = host?.ownerDocument || heading?.ownerDocument;
  if (!frame || !heading || !host || !doc || !REQUIRED[id]) return { refresh() {}, sync() {}, destroy() {} };
  let sourceDocument = null, sourceRoot = null, sourceUrl = null, sourceObserver = null, frameObserver = null;
  let bar = null, bindings = [], dialogs = [], disposed = false, queued = false, lastDialogTrigger = null;
  let previousHosted, previousPage;
  const make = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function current() {
    if (disposed || !sourceDocument || !sourceRoot || !isActive() || frame.hidden || sourceRoot.hidden ||
        frame.isConnected === false || host.isConnected === false || frame.getAttribute('src') !== sourceUrl) return false;
    try {
      return frame.contentDocument === sourceDocument && sourceRoot.ownerDocument === sourceDocument &&
        (!sourceDocument.body.dataset.page || sourceDocument.body.dataset.page === id);
    } catch { return false; }
  }
  const source = selector => sourceRoot?.querySelector(selector);
  function restoreHosted() {
    if (!sourceDocument?.body) return;
    if (previousHosted === undefined) delete sourceDocument.body.dataset.centerToolbarHosted;
    else sourceDocument.body.dataset.centerToolbarHosted = previousHosted;
    if (previousPage === undefined) delete sourceDocument.body.dataset.centerToolbarPage;
    else sourceDocument.body.dataset.centerToolbarPage = previousPage;
  }
  function focusTrigger(trigger, owner = sourceDocument) {
    queueMicrotask(() => {
      if (current() && sourceDocument === owner && trigger?.isConnected && !trigger.disabled &&
          !owner.querySelector('dialog[open]') && !dialogs.some(entry => entry.dialog.open)) trigger.focus?.({ preventScroll: true });
    });
  }
  function sourceDialogClosed(event) {
    if (event.target?.tagName?.toLowerCase() !== 'dialog' || !lastDialogTrigger) return;
    const trigger = lastDialogTrigger, owner = sourceDocument;
    queueMicrotask(() => {
      if (!current() || sourceDocument !== owner || owner.querySelector('dialog[open]')) return;
      lastDialogTrigger = null; focusTrigger(trigger, owner);
    });
  }
  function group(parent, label, className = '') {
    const node = make('div', 'compact-toolbar-group legacy-toolbar-group ' + className);
    node.setAttribute('role', 'group'); node.setAttribute('aria-label', label); parent.append(node); return node;
  }
  function mirrorButton(parent, selector, key, options = {}) {
    const owner = sourceDocument;
    const node = make('button', 'compact-toolbar-action legacy-toolbar-action' + (options.iconOnly ? ' legacy-toolbar-icon-action' : '') + (options.dataAction ? ' center-data-action' : ''));
    node.type = 'button'; node.id = 'center-' + key; node.dataset.sourceControl = key;
    if (options.icon) node.innerHTML = icon(options.icon);
    if (options.ipoPage) node.dataset.ipoPage = options.ipoPage;
    if (options.ipoFilter) node.dataset.ipoFilter = options.ipoFilter;
    node.addEventListener('click', () => {
      if (!node.isConnected || sourceDocument !== owner || !current()) return;
      const target = source(selector);
      if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
      if (options.dialog) lastDialogTrigger = node;
      target.click();
      if (options.closeDialog) options.closeDialog.close();
      schedule();
    });
    parent.append(node); bindings.push({ kind: 'button', selector, node, options }); return node;
  }
  function mirrorField(parent, selector, key, label, { search = false, detailed = false } = {}) {
    const owner = sourceDocument;
    const wrapper = make('label', 'compact-toolbar-field legacy-toolbar-field' + (search ? ' legacy-toolbar-search' : '') + (detailed ? ' legacy-toolbar-detail-field' : ''));
    const text = make('span', 'legacy-toolbar-field-label', label);
    const node = make(search ? 'input' : 'select'); node.id = 'center-' + key; node.dataset.sourceControl = key;
    node.setAttribute('aria-label', label);
    if (search) { node.type = 'search'; node.autocomplete = 'off'; }
    node.addEventListener(search ? 'input' : 'change', () => {
      if (!node.isConnected || sourceDocument !== owner || !current()) return;
      const target = source(selector);
      if (!target || target.disabled || target.readOnly) return;
      target.value = node.value;
      const Event = sourceDocument.defaultView?.Event || globalThis.Event;
      target.dispatchEvent(new Event(search ? 'input' : 'change', { bubbles: true }));
      schedule();
    });
    wrapper.append(text, node); parent.append(wrapper);
    bindings.push({ kind: search ? 'input' : 'select', selector, node, options: {} }); return node;
  }
  function mirrorSummary(parent, selector, key, { conditional = false, className = '' } = {}) {
    const node = make('span', 'compact-toolbar-summary legacy-toolbar-summary ' + className);
    node.id = 'center-' + key; node.dataset.sourceControl = key;
    node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); parent.append(node);
    bindings.push({ kind: 'summary', selector, node, options: { conditional } }); return node;
  }
  function createDialog(kind, label, parent, glyph = 'filters') {
    const owner = sourceDocument;
    const trigger = make('button', 'compact-toolbar-action legacy-toolbar-action legacy-toolbar-icon-action');
    trigger.type = 'button'; trigger.dataset.toolbarOpen = kind;
    trigger.id = 'center-' + id + '-' + kind;
    trigger.title = label; trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.innerHTML = icon(glyph); parent.append(trigger);
    const dialog = make('dialog', 'legacy-toolbar-dialog');
    dialog.dataset.toolbarDialog = kind;
    dialog.id = (host.id || frame.dataset.toolbarId || 'atlas-center-toolbar-' + id) + '-' + kind + '-dialog';
    const titleId = dialog.id + '-title', header = make('header', 'legacy-toolbar-dialog-heading');
    const title = make('h2', '', label); title.id = titleId;
    dialog.setAttribute('aria-labelledby', titleId); trigger.setAttribute('aria-controls', dialog.id);
    const close = make('button', 'compact-toolbar-action', '닫기'); close.type = 'button'; close.setAttribute('aria-label', label + ' 닫기');
    close.dataset.toolbarClose = kind;
    close.addEventListener('click', () => dialog.close());
    header.append(title, close);
    const body = make('div', 'legacy-toolbar-dialog-body'); dialog.append(header, body); doc.body.append(dialog);
    const entry = { dialog, trigger, body, owner: null }; dialogs.push(entry);
    trigger.addEventListener('click', () => {
      if (!trigger.isConnected || sourceDocument !== owner || !current()) return;
      sync(); entry.owner = sourceDocument;
      const Event = doc.defaultView?.CustomEvent || globalThis.CustomEvent;
      if (Event) doc.dispatchEvent(new Event('atlas:modal-open', { detail: { id: dialog.id } }));
      if (!dialog.open) dialog.showModal();
      (body.querySelector('input,select,button') || close).focus?.({ preventScroll: true });
    });
    dialog.addEventListener('close', () => focusTrigger(trigger, entry.owner));
    dialog.addEventListener('keydown', event => event.stopPropagation());
    return entry;
  }
  function build() {
    bar = make('div', 'legacy-workspace-toolbar'); bar.dataset.page = id;
    bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', PAGE_LABELS[id] + ' 도구');
    const title = make('span', 'compact-toolbar-summary legacy-toolbar-title', PAGE_LABELS[id]); bar.append(title);
    if (id === 'data') {
      mirrorField(bar, '#asset-search', 'asset-search', '종목 검색', { search: true });
      mirrorField(bar, '#asset-sector-filter', 'asset-sector-filter', '섹터 선택');
      mirrorSummary(bar, '#asset-visible-count', 'asset-visible-count');
      mirrorSummary(bar, '#asset-context', 'asset-context', { conditional: true, className: 'legacy-toolbar-state' });
      const settings = createDialog('filters', '자산 필터·표 설정', bar);
      mirrorField(settings.body, '#asset-group-filter', 'asset-group-filter', '자산군', { detailed: true });
      mirrorField(settings.body, '#asset-columns', 'asset-columns', '표 구성', { detailed: true });
      mirrorField(settings.body, '#asset-sort', 'asset-sort', '자산군 내 정렬', { detailed: true });
      mirrorButton(settings.body, '#asset-filter-reset', 'asset-filter-reset');
      mirrorSummary(settings.body, '.asset-table-summary > span:last-child', 'asset-quote-summary');
      const moves = group(settings.body, '표 가로 이동');
      mirrorButton(moves, '#asset-scroll-start', 'asset-scroll-start', { closeDialog: settings.dialog });
      mirrorButton(moves, '#asset-scroll-end', 'asset-scroll-end', { closeDialog: settings.dialog });
      const actions = group(bar, '자산 비교 도구', 'legacy-toolbar-actions center-data-actions');
      for (const key of ['asset-refresh', 'asset-history-open', 'daily-method-open', 'export-raw'])
        mirrorButton(actions, '#' + key, key, { iconOnly: true, dataAction: true, dialog: key === 'asset-history-open' || key === 'daily-method-open' });
    } else if (id === 'ipo') {
      const months = group(bar, '공모주 달력 이동');
      mirrorButton(months, '[data-ipo-page="previous"]', 'ipo-previous', { icon: 'previous', iconOnly: true, ipoPage: 'previous' });
      mirrorSummary(months, '.ipo-page-label', 'ipo-page-label', { className: 'legacy-toolbar-month' });
      mirrorButton(months, '[data-ipo-page="next"]', 'ipo-next', { icon: 'next', iconOnly: true, ipoPage: 'next' });
      mirrorField(bar, '.ipo-search', 'ipo-search', '공모주 검색', { search: true });
      const filters = group(bar, '공모주 일정 상태');
      for (const filter of ['upcoming', 'closed', 'all'])
        mirrorButton(filters, '[data-ipo-filter="' + filter + '"]', 'ipo-filter-' + filter, { ipoFilter: filter });
      mirrorSummary(bar, '.ipo-month-summary', 'ipo-month-summary');
      mirrorSummary(bar, '.ipo-calendar-message', 'ipo-calendar-message', { conditional: true, className: 'legacy-toolbar-state' });
      const settings = createDialog('calendar', '공모주 달력 도구', bar, 'calendar');
      for (const key of ['today', 'list'])
        mirrorButton(settings.body, '[data-ipo-page="' + key + '"]', 'ipo-' + key, { ipoPage: key, closeDialog: settings.dialog });
      mirrorSummary(settings.body, '.ipo-count', 'ipo-count');
      const disclosure = createDialog('source', '공모주 출처와 일정 안내', bar, 'source');
      const panel = make('div', 'legacy-toolbar-source'); disclosure.body.append(panel);
      bindings.push({ kind: 'panel', selector: '.ipo-source-panel', node: panel, options: {} });
    } else {
      mirrorField(bar, '#evidence-search', 'evidence-search', '연구 자료 검색', { search: true });
      mirrorField(bar, '#evidence-asset', 'evidence-asset', '리서치 종목');
      const pages = group(bar, '리서치 자료 페이지');
      mirrorButton(pages, '#evidence-prev', 'evidence-prev', { icon: 'previous', iconOnly: true });
      mirrorSummary(pages, '#evidence-progress', 'evidence-progress');
      mirrorButton(pages, '#evidence-more', 'evidence-more', { icon: 'next', iconOnly: true });
      const settings = createDialog('filters', '리서치 필터', bar);
      mirrorField(settings.body, '#evidence-filter', 'evidence-filter', '리서치 분류', { detailed: true });
      mirrorButton(settings.body, '#evidence-clear', 'evidence-clear');
      mirrorSummary(settings.body, '#evidence-total', 'evidence-total');
    }
    host.append(bar);
  }
  function syncBinding(binding) {
    const { kind, selector, node, options } = binding, target = source(selector);
    if (!target) { if ('disabled' in node) node.disabled = true; return; }
    if (kind === 'summary') {
      const value = target.textContent || '';
      setText(node, value); node.title = value;
      node.hidden = options.conditional ? target.hidden || !value.trim() : false;
      return;
    }
    if (kind === 'panel') {
      if (binding.markup === target.innerHTML) return;
      binding.markup = target.innerHTML;
      const copy = target.cloneNode(true);
      for (const element of [copy, ...copy.querySelectorAll('[id]')]) element.removeAttribute('id');
      for (const link of copy.querySelectorAll('a[href]')) link.href = new URL(link.getAttribute('href'), sourceDocument.baseURI).href;
      node.replaceChildren(...copy.childNodes); return;
    }
    node.disabled = Boolean(target.disabled || target.getAttribute('aria-disabled') === 'true');
    if (kind === 'button') {
      if (!options.icon && node.innerHTML !== target.innerHTML) node.innerHTML = target.innerHTML;
      const label = target.getAttribute('aria-label') || target.title || target.textContent.trim();
      node.setAttribute('aria-label', label); node.title = target.title || label;
      for (const attribute of ['aria-pressed', 'aria-selected']) setAttribute(node, attribute, target.getAttribute(attribute));
    } else {
      if (kind === 'select' && node.innerHTML !== target.innerHTML) node.innerHTML = target.innerHTML;
      if (node.value !== target.value) node.value = target.value;
      node.readOnly = Boolean(target.readOnly);
      if (kind === 'input') setAttribute(node, 'placeholder', target.getAttribute('placeholder'));
      setAttribute(node, 'title', target.getAttribute('title'));
    }
  }
  function sync() {
    if (disposed || !sourceDocument) return;
    sourceRoot = sourceDocument.getElementById(id + '-view');
    if (!current()) {
      if (bar) bar.inert = true;
      for (const { dialog } of dialogs) if (dialog.open) dialog.close();
      restoreHosted(); return;
    }
    if (!bar) {
      if (REQUIRED[id].some(selector => !source(selector))) return;
      build();
    }
    bar.inert = false;
    for (const binding of bindings) syncBinding(binding);
    setAttribute(bar, 'aria-busy', source('#asset-table-scroll')?.getAttribute('aria-busy'));
    if (sourceDocument.body.dataset.centerToolbarHosted !== 'true') sourceDocument.body.dataset.centerToolbarHosted = 'true';
    if (sourceDocument.body.dataset.centerToolbarPage !== id) sourceDocument.body.dataset.centerToolbarPage = id;
  }
  function schedule() {
    if (disposed || queued) return;
    queued = true; queueMicrotask(() => { queued = false; sync(); });
  }
  function detach() {
    sourceObserver?.disconnect(); sourceObserver = null;
    if (sourceDocument) {
      sourceDocument.removeEventListener('close', sourceDialogClosed, true);
      for (const type of ['input', 'change', 'click']) sourceDocument.removeEventListener(type, schedule);
      restoreHosted();
    }
    for (const { dialog } of dialogs) { if (dialog.open) dialog.close(); dialog.remove(); }
    dialogs = []; bindings = []; bar?.remove(); bar = null;
    sourceDocument = null; sourceRoot = null; sourceUrl = null; lastDialogTrigger = null;
  }
  function attach() {
    if (disposed) return;
    detach();
    try { sourceDocument = frame.contentDocument; } catch { return; }
    if (!sourceDocument?.body) { sourceDocument = null; return; }
    sourceUrl = frame.getAttribute('src');
    previousHosted = sourceDocument.body.dataset.centerToolbarHosted;
    previousPage = sourceDocument.body.dataset.centerToolbarPage;
    sourceDocument.addEventListener('close', sourceDialogClosed, true);
    for (const type of ['input', 'change', 'click']) sourceDocument.addEventListener(type, schedule);
    const Observer = sourceDocument.defaultView?.MutationObserver || doc.defaultView?.MutationObserver;
    if (Observer) {
      sourceObserver = new Observer(schedule);
      sourceObserver.observe(sourceDocument.body, { childList: true, characterData: true, subtree: true, attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'aria-label', 'aria-pressed', 'aria-selected', 'title', 'value', 'selected', 'checked', 'readonly', 'hidden', 'open', 'aria-busy', 'data-page'] });
    }
    sync();
  }
  const Observer = doc.defaultView?.MutationObserver;
  if (Observer) {
    frameObserver = new Observer(schedule); frameObserver.observe(frame, { attributes: true, attributeFilter: ['hidden', 'src'] });
  }
  frame.addEventListener('load', attach); attach();
  return { refresh: sync, sync, destroy() {
    if (disposed) return;
    disposed = true; frame.removeEventListener('load', attach); frameObserver?.disconnect(); detach();
  } };
}
