import { setLoadingSurface, clearLoadingSurface } from '../loading-surfaces.js';

export const CENTER_LOADING_TIMEOUT_MS = 20_000;

// Keep the frame laid out, but conceal its previous document until the host has
// accepted a current renderer acknowledgement. A load event alone is not one.
export function mountCenterLoading({ frame, plot, toolbar, kind, label, isCurrent, onRetry, onSettled, onLoad, documentReady = false }) {
  const document = plot.ownerDocument;
  const layer = document.createElement('div');
  layer.className = 'atlas-center-loading';
  let phase = 'loading', child = null;
  const current = () => phase !== 'destroyed' && isCurrent();
  function state(value) {
    phase = value;
    frame.dataset.centerStatus = value;
    frame.inert = value !== 'ready';
    frame.setAttribute('aria-busy', String(value === 'loading'));
    if (value === 'ready') frame.removeAttribute('aria-hidden');
    else frame.setAttribute('aria-hidden', 'true');
    toolbar.dataset.centerStatus = value;
    toolbar.inert = value !== 'ready';
    layer.dataset.centerStatus = value;
  }
  function removeLayer() { clearLoadingSurface(layer); layer.remove(); }
  function unbindChild() {
    child?.removeEventListener('atlas:ready', acceptDocument);
    child?.removeEventListener('atlas:boot-error', acceptDocument);
    child = null;
  }
  function accept() {
    if (!current() || !['loading', 'ready'].includes(phase)) return false;
    if (phase === 'ready') return true;
    clearTimeout(timeout);
    state('ready');
    removeLayer(); unbindChild();
    onSettled?.();
    return true;
  }
  function fail() {
    if (!current() || phase !== 'loading') return;
    clearTimeout(timeout);
    state('error');
    clearLoadingSurface(layer); unbindChild();
    const content = document.createElement('div'); content.className = 'atlas-center-error'; content.setAttribute('role', 'alert');
    const title = document.createElement('strong'); title.textContent = '화면을 불러오지 못했습니다.';
    const detail = document.createElement('p'); detail.textContent = `${label} 연결을 확인한 뒤 다시 시도해 주세요.`;
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '재시도'; retry.setAttribute('aria-label', `${label} 재시도`);
    retry.addEventListener('click', () => { if (current() && phase === 'error') onRetry(); });
    content.append(title, detail, retry); layer.replaceChildren(content);
    onSettled?.();
  }
  function acceptDocument() {
    if (!current() || !documentReady || child !== frame.contentDocument) return;
    if (['ready', 'error'].includes(child?.documentElement?.dataset.boot)) accept();
  }
  function loaded() {
    if (!current() || phase !== 'loading') return;
    onLoad?.();
    if (!documentReady) return;
    unbindChild();
    try { child = frame.contentDocument; } catch { fail(); return; }
    child?.addEventListener('atlas:ready', acceptDocument);
    child?.addEventListener('atlas:boot-error', acceptDocument);
    acceptDocument();
  }
  state('loading');
  plot.append(layer);
  setLoadingSurface(layer, true, { kind, label: `${label} 로딩` });
  const timeout = setTimeout(fail, CENTER_LOADING_TIMEOUT_MS);
  // Browser timers are numbers; server-side DOM tests should not retain a
  // process solely for a detached page's fallback deadline.
  timeout?.unref?.();
  frame.addEventListener('load', loaded);
  frame.addEventListener('error', fail);
  if (documentReady) loaded();
  return {
    accept,
    get status() { return phase; },
    destroy() {
      if (phase === 'destroyed') return;
      phase = 'destroyed'; clearTimeout(timeout); unbindChild(); removeLayer();
      frame.removeEventListener('load', loaded); frame.removeEventListener('error', fail);
    },
  };
}
