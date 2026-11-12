export const THEME_STORAGE_KEY = 'atlas-ui-theme';
const THEME_MESSAGE = 'atlas:ui-theme';
const THEME_REQUEST = 'atlas:ui-theme-request';
const controllers = new WeakMap();
const validTheme = value => value === 'light' || value === 'dark';
const normalizeTheme = value => validTheme(value) ? value : 'light';

function documentStorage(document) {
  try { return document?.defaultView?.localStorage; } catch { return null; }
}

/** Missing, malformed and blocked preferences keep the explicit fallback. */
export function readTheme(storage, fallback = 'light') {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    if (validTheme(value)) return value;
  } catch { /* Theme controls still work in a private or readonly preview. */ }
  return normalizeTheme(fallback);
}

function currentTheme(document) {
  return normalizeTheme(document?.documentElement?.dataset.theme);
}

function syncControls(document, theme) {
  for (const button of document.querySelectorAll('[data-atlas-theme-toggle]')) {
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  }
}

function publishTheme(controller, theme, except = null) {
  if (!controller?.origin) return;
  for (const frame of controller.document.querySelectorAll('iframe')) {
    const target = frame.contentWindow;
    if (target && target !== except) {
      // An exact target origin prevents delivery to third-party documents.
      try { target.postMessage({type:THEME_MESSAGE, theme}, controller.origin); } catch {}
    }
  }
  const parent = controller.view.parent;
  if (parent && parent !== controller.view && parent !== except) {
    try { parent.postMessage({type:THEME_MESSAGE, theme}, controller.origin); } catch {}
  }
}

/** Only presentation preferences change; chart coordinates and state stay put. */
export function applyTheme(theme, {document = globalThis.document, storage, persist = true, broadcast = true, source = null} = {}) {
  theme = normalizeTheme(theme);
  if (!document?.documentElement) return theme;
  const controller = controllers.get(document);
  const preference = storage === undefined ? controller?.storage ?? documentStorage(document) : storage;
  const root = document.documentElement, changed = root.dataset.theme !== theme;
  root.dataset.theme = theme;
  root.style.setProperty('color-scheme', theme);
  syncControls(document, theme);
  if (persist) {
    try { preference?.setItem(THEME_STORAGE_KEY, theme); } catch {}
  }
  if (changed) {
    const Event = document.defaultView?.CustomEvent || globalThis.CustomEvent;
    if (Event) document.dispatchEvent(new Event('atlas:theme-change', {detail:{theme}}));
    if (broadcast) publishTheme(controller, theme, source);
  }
  return theme;
}

/** One listener set per document, shared by settings controls and embeddings. */
export function initTheme({document = globalThis.document, storage} = {}) {
  if (!document?.documentElement) return null;
  if (controllers.has(document)) return controllers.get(document);
  const view = document.defaultView;
  const preference = storage === undefined ? documentStorage(document) : storage;
  let origin = null;
  try {
    const value = view?.location?.origin;
    if (value && value !== 'null') origin = value;
  } catch {}
  const controller = {document, view, storage:preference, origin, destroy};
  controllers.set(document, controller);
  const onStorage = event => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    if (event.storageArea && preference && event.storageArea !== preference) return;
    applyTheme(event.key === null ? 'light' : event.newValue, {document, persist:false});
  };
  const onMessage = event => {
    if (!origin || event.origin !== origin || !event.source) return;
    const parent = view?.parent;
    const fromParent = parent && parent !== view && event.source === parent;
    const fromFrame = [...document.querySelectorAll('iframe')].some(frame => frame.contentWindow === event.source);
    if (!fromParent && !fromFrame) return;
    if (event.data?.type === THEME_REQUEST && fromFrame) {
      try { event.source.postMessage({type:THEME_MESSAGE, theme:currentTheme(document)}, origin); } catch {}
    } else if (event.data?.type === THEME_MESSAGE && validTheme(event.data.theme)) {
      applyTheme(event.data.theme, {document, persist:false, source:event.source});
    }
  };
  const onFrameLoad = event => {
    if (!origin || event.target?.tagName !== 'IFRAME') return;
    try { event.target.contentWindow?.postMessage({type:THEME_MESSAGE, theme:currentTheme(document)}, origin); } catch {}
  };
  view?.addEventListener?.('storage', onStorage);
  view?.addEventListener?.('message', onMessage);
  document.addEventListener('load', onFrameLoad, true);
  applyTheme(readTheme(preference, currentTheme(document)), {document, persist:false, broadcast:false});
  // A newly mounted child asks its parent first; its fallback must not reset
  // the parent when storage is unavailable or the child is still loading.
  publishTheme(controller, currentTheme(document), view?.parent);
  if (origin && view?.parent && view.parent !== view) {
    try { view.parent.postMessage({type:THEME_REQUEST}, origin); } catch {}
  }
  function destroy() {
    view?.removeEventListener?.('storage', onStorage);
    view?.removeEventListener?.('message', onMessage);
    document.removeEventListener('load', onFrameLoad, true);
    controllers.delete(document);
  }
  return controller;
}

/** A native toggle belongs inside the existing settings reader, never a rail. */
export function createThemeControl(document = globalThis.document) {
  initTheme({document});
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'native-reader-action theme-setting';
  button.setAttribute('data-atlas-theme-toggle', '');
  button.setAttribute('aria-label', '다크 모드');
  button.setAttribute('aria-pressed', String(currentTheme(document) === 'dark'));
  button.textContent = '다크 모드';
  button.addEventListener('click', () => {
    applyTheme(currentTheme(document) === 'dark' ? 'light' : 'dark', {document});
  });
  return button;
}
