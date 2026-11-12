export const CHART_COLORS_STORAGE_KEY = 'atlas-chart-colors';
const MESSAGE = 'atlas:chart-colors';
const REQUEST = 'atlas:chart-colors-request';
const controllers = new WeakMap();
const valid = value => value === 'korean' || value === 'international';
const normalize = value => valid(value) ? value : 'korean';
const current = document => normalize(document?.documentElement?.dataset.chartColors);

function documentStorage(document) {
  try { return document?.defaultView?.localStorage; } catch { return null; }
}

export function readChartColors(storage, fallback = 'korean') {
  try {
    const value = storage?.getItem(CHART_COLORS_STORAGE_KEY);
    if (valid(value)) return value;
  } catch { /* A blocked preference must not disable the live control. */ }
  return normalize(fallback);
}

function publish(controller, value, except = null) {
  if (!controller?.origin) return;
  for (const frame of controller.document.querySelectorAll('iframe')) {
    if (frame.contentWindow && frame.contentWindow !== except) {
      try { frame.contentWindow.postMessage({type:MESSAGE, value}, controller.origin); } catch {}
    }
  }
  const parent = controller.view?.parent;
  if (parent && parent !== controller.view && parent !== except) {
    try { parent.postMessage({type:MESSAGE, value}, controller.origin); } catch {}
  }
}

/** Paint-only preference: neither chart state nor a rendering command changes. */
export function applyChartColors(value, {document = globalThis.document, storage, persist = true, broadcast = true, source = null} = {}) {
  value = normalize(value);
  if (!document?.documentElement) return value;
  const controller = controllers.get(document);
  const preference = storage === undefined ? controller?.storage ?? documentStorage(document) : storage;
  const changed = document.documentElement.dataset.chartColors !== value;
  document.documentElement.dataset.chartColors = value;
  for (const select of document.querySelectorAll('[data-chart-colors-select]')) select.value = value;
  if (persist) {
    try { preference?.setItem(CHART_COLORS_STORAGE_KEY, value); } catch {}
  }
  if (changed && broadcast) publish(controller, value, source);
  return value;
}

/** Share a preference only with this document's exact-origin parent/children. */
export function initChartColors({document = globalThis.document, storage} = {}) {
  if (!document?.documentElement) return null;
  if (controllers.has(document)) return controllers.get(document);
  const view = document.defaultView;
  const preference = storage === undefined ? documentStorage(document) : storage;
  let origin = null;
  try { if (view?.location?.origin && view.location.origin !== 'null') origin = view.location.origin; } catch {}
  const controller = {document, view, storage:preference, origin, destroy};
  let destroyed = false;
  const capture = {capture:true};
  controllers.set(document, controller);
  const onStorage = event => {
    if (event.key !== CHART_COLORS_STORAGE_KEY && event.key !== null) return;
    if (event.storageArea && preference && event.storageArea !== preference) return;
    applyChartColors(event.key === null ? 'korean' : event.newValue, {document, persist:false});
  };
  const onMessage = event => {
    if (!origin || event.origin !== origin || !event.source) return;
    const parent = view?.parent;
    const fromParent = parent && parent !== view && event.source === parent;
    const fromFrame = [...document.querySelectorAll('iframe')].some(frame => frame.contentWindow === event.source);
    if (!fromParent && !fromFrame) return;
    if (event.data?.type === REQUEST && fromFrame) {
      try { event.source.postMessage({type:MESSAGE, value:current(document)}, origin); } catch {}
    } else if (event.data?.type === MESSAGE && valid(event.data.value)) {
      applyChartColors(event.data.value, {document, persist:false, source:event.source});
    }
  };
  const onFrameLoad = event => {
    if (!origin || event.target?.tagName !== 'IFRAME') return;
    try { event.target.contentWindow?.postMessage({type:MESSAGE, value:current(document)}, origin); } catch {}
  };
  view?.addEventListener?.('storage', onStorage);
  view?.addEventListener?.('message', onMessage);
  document.addEventListener('load', onFrameLoad, capture);
  applyChartColors(readChartColors(preference, current(document)), {document, persist:false, broadcast:false});
  publish(controller, current(document), view?.parent);
  if (origin && view?.parent && view.parent !== view) {
    try { view.parent.postMessage({type:REQUEST}, origin); } catch {}
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    view?.removeEventListener?.('storage', onStorage);
    view?.removeEventListener?.('message', onMessage);
    document.removeEventListener('load', onFrameLoad, capture);
    if (controllers.get(document) === controller) controllers.delete(document);
  }
  return controller;
}

/** The same native select lives in each chart's existing settings reader. */
export function createChartColorsControl(document = globalThis.document) {
  initChartColors({document});
  const row = document.createElement('label');
  row.className = 'chart-colors-setting';
  const name = document.createElement('span');
  name.textContent = '캔들·등락 색';
  const select = document.createElement('select');
  select.setAttribute('data-chart-colors-select', '');
  select.setAttribute('aria-label', name.textContent);
  for (const [value, text] of [['korean', '상승 빨강 · 하락 파랑'], ['international', '상승 초록 · 하락 빨강']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = current(document);
  select.addEventListener('change', () => applyChartColors(select.value, {document}));
  row.append(name, select);
  return row;
}
