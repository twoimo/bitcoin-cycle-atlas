const LIMIT = 200;
const safeDetails = details => Object.fromEntries(Object.entries(details || {}).filter(([key, value]) => ['view','scenario','symbol','frequency','cache','mode','status','reason','revision'].includes(key) && (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string')).map(([key,value]) => [key, typeof value === 'string' ? value.slice(0, 120) : value]));

export function createPerformanceRecorder({ now = () => globalThis.performance?.now?.() ?? 0, limit = LIMIT } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('Performance history limit must be 1–1000');
  let sequence = 0, dropped = 0;
  const active = new Map(), entries = [];
  function begin(name, details = {}) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9:.-]{0,79}$/.test(name)) throw new TypeError('Use a bounded performance action name');
    const token = ++sequence;
    if (active.size >= 40) { active.delete(active.keys().next().value); dropped++; }
    active.set(token, { name, startedAtMs: now(), details: safeDetails(details) });
    return token;
  }
  function finish(token, details = {}) {
    const entry = active.get(token);
    if (!entry) return null;
    active.delete(token);
    const endedAtMs = now();
    if (!Number.isFinite(endedAtMs) || endedAtMs < entry.startedAtMs) { dropped++; return null; }
    const result = { ...entry, endedAtMs, durationMs: endedAtMs - entry.startedAtMs, details: { ...entry.details, ...safeDetails(details) } };
    entries.push(result);
    if (entries.length > limit) { entries.shift(); dropped++; }
    return result;
  }
  return { begin, finish, snapshot: () => ({ entries: entries.map(e => ({ ...e, details: { ...e.details } })), pending: active.size, dropped }) };
}

const recorder = createPerformanceRecorder();
export const beginAction = (name, details) => recorder.begin(name, details);
export const finishAction = (token, details) => recorder.finish(token, details);
export function measureSync(name, action, details) {
  const token = beginAction(name, details);
  try { const result = action(); finishAction(token, { status: 'complete' }); return result; }
  catch (error) { finishAction(token, { status: 'error' }); throw error; }
}

let mounted = false;
const observations = {
  largestContentfulPaint: { valueMs: null, status: 'not-observed' },
  cumulativeLayoutShift: { value: null, status: 'not-observed' },
  interactionToNextPaint: { valueMs: null, status: 'not-computed', reason: 'Event durations below are diagnostic samples, not the field INP metric.' },
  eventDurations: [], longTasks: [], supportedEntryTypes: [],
};
let environment = {};

export function performanceSnapshot() {
  return {
    schemaVersion: 1, capturedAt: new Date().toISOString(), storage: 'this tab only; no transmission',
    scope: 'Current navigation diagnostics. Frame-ready actions use two animation frames, not a measurement of physical display presentation. Not a field Core Web Vitals compliance report.',
    environment: { ...environment }, actions: recorder.snapshot(), observations: structuredClone(observations),
  };
}

export function downloadPerformanceDiagnostics() {
  if (typeof document === 'undefined') return performanceSnapshot();
  const url = URL.createObjectURL(new Blob([JSON.stringify(performanceSnapshot(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'Atlas_Performance_Diagnostics.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initPerformanceDiagnostics() {
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  environment = { viewport: { width: innerWidth, height: innerHeight }, pixelRatio: devicePixelRatio, userAgent: navigator.userAgent, startedHidden: document.visibilityState === 'hidden' };
  window.AtlasPerformance = Object.freeze({ snapshot: performanceSnapshot, download: downloadPerformanceDiagnostics });
  const Observer = globalThis.PerformanceObserver;
  observations.supportedEntryTypes = [...(Observer?.supportedEntryTypes || [])];
  const observe = (type, handle, options = {}) => {
    if (!observations.supportedEntryTypes.includes(type)) return null;
    try { const observer = new Observer(list => handle(list.getEntries())); observer.observe({ type, buffered: true, ...options }); return observer; }
    catch { return null; }
  };
  let firstHidden = document.visibilityState === 'hidden' ? 0 : Infinity, inputCutoff = Infinity;
  const lcp = observations.largestContentfulPaint;
  const onLcp = entries => { for (const entry of entries) if (entry.startTime < firstHidden && entry.startTime < inputCutoff) { lcp.valueMs = entry.startTime; lcp.status = 'provisional'; } };
  const lcpObserver = observe('largest-contentful-paint', onLcp);
  if (!lcpObserver) lcp.status = 'unsupported';
  const finishLcp = () => {
    onLcp(lcpObserver?.takeRecords() || []);
    lcpObserver?.disconnect();
    if (lcp.valueMs !== null) lcp.status = 'observed-before-first-input-or-hidden';
  };
  for (const type of ['pointerdown','keydown']) document.addEventListener(type, event => {
    if (!event.isTrusted || inputCutoff !== Infinity) return;
    inputCutoff = performance.now(); finishLcp();
  }, { capture: true });
  let windowStart = 0, lastShift = 0, windowValue = 0, largestWindow = 0;
  const cls = observations.cumulativeLayoutShift;
  const onCls = entries => {
    if (firstHidden === 0) return;
    for (const entry of entries) {
      if (entry.hadRecentInput || entry.startTime >= firstHidden) continue;
      if (entry.startTime - lastShift < 1000 && entry.startTime - windowStart < 5000) windowValue += entry.value;
      else { windowStart = entry.startTime; windowValue = entry.value; }
      lastShift = entry.startTime; largestWindow = Math.max(largestWindow, windowValue);
    }
    cls.value = largestWindow; cls.status = 'provisional-session-window';
  };
  const clsObserver = observe('layout-shift', onCls);
  if (!clsObserver) cls.status = 'unsupported';
  else if (firstHidden === 0) { clsObserver.disconnect(); cls.status = 'not-observed-started-hidden'; }
  else { cls.value = 0; cls.status = 'provisional-session-window'; }
  const boundedPush = (list, values) => { list.push(...values); if (list.length > LIMIT) list.splice(0, list.length - LIMIT); };
  observe('longtask', entries => boundedPush(observations.longTasks, entries.map(e => ({ startTimeMs: e.startTime, durationMs: e.duration }))));
  observe('event', entries => boundedPush(observations.eventDurations, entries.filter(e => e.interactionId).map(e => ({ type: e.name, startTimeMs: e.startTime, durationMs: e.duration, processingMs: e.processingEnd - e.processingStart, interactionId: e.interactionId }))), { durationThreshold: 16 });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    firstHidden = Math.min(firstHidden, performance.now()); finishLcp();
    if (clsObserver) {
      onCls(clsObserver.takeRecords()); clsObserver.disconnect();
      if (cls.value !== null) cls.status = 'observed-until-first-hidden';
    }
  });
  const frameFinish = (token, details) => requestAnimationFrame(() => requestAnimationFrame(() => finishAction(token, { ...details, status: 'frame-ready' })));
  let boot = beginAction('first-view', { symbol: new URLSearchParams(location.search).get('symbol') || 'BTCUSD' });
  document.addEventListener('atlas:ready', () => { if (boot !== null) { frameFinish(boot); boot = null; } });
  document.addEventListener('atlas:boot-error', () => { if (boot !== null) { finishAction(boot, { status: 'error' }); boot = null; } });
  let navigation = null;
  document.addEventListener('click', event => {
    const page = event.target.closest?.('[data-view]')?.dataset.view;
    if (!['outlook','compare','evidence','data'].includes(page)) return;
    if (navigation) finishAction(navigation.token, { status: 'superseded' });
    navigation = { page, token: beginAction('page-navigation', { view: page }) };
  }, { capture: true });
  document.addEventListener('atlas:page-ready', event => {
    if (navigation?.page !== event.detail?.page) return;
    frameFinish(navigation.token); navigation = null;
  });
}
