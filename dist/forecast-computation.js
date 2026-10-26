export function createForecastComputation({ compute, workerFactory, timeoutMs = 30000, defer = action => setTimeout(action, 0), cancelDeferred = handle => clearTimeout(handle) } = {}) {
  if (typeof compute !== 'function') throw new TypeError('A synchronous forecast fallback is required');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Forecast timeout must be positive');
  let sequence = 0, active = null, destroyed = false;
  const supported = typeof workerFactory === 'function';
  function stop(request) {
    clearTimeout(request.timer);
    if (request.deferred !== null) cancelDeferred(request.deferred);
    request.worker?.terminate(); request.worker = null;
  }
  function finish(request, result) {
    if (active !== request) return;
    active = null; stop(request); request.resolve({ id: request.id, revision: request.revision, ...result });
  }
  function cancel() {
    if (!active) return;
    const previous = active; active = null; stop(previous);
    previous.resolve({ id: previous.id, revision: previous.revision, status: 'superseded' });
  }
  function run(dataset, options, { revision = 0 } = {}) {
    if (destroyed) return Promise.reject(new Error('Forecast computation is destroyed'));
    cancel();
    return new Promise(resolve => {
      const request = { id: ++sequence, revision, resolve, worker: null, timer: null, deferred: null };
      active = request;
      const fallback = reason => {
        if (active !== request) return;
        clearTimeout(request.timer); request.worker?.terminate(); request.worker = null;
        request.deferred = defer(() => {
          request.deferred = null;
          if (active !== request) return;
          try { finish(request, { status: 'ready', model: compute(dataset, options), mode: 'main-thread-fallback', reason }); }
          catch (error) { finish(request, { status: 'error', error: error.message || String(error), mode: 'main-thread-fallback', reason }); }
        });
      };
      if (!supported) { fallback('worker-unavailable'); return; }
      try {
        request.worker = workerFactory();
        request.worker.onmessage = event => {
          if (active !== request || event.data?.id !== request.id || event.data?.revision !== request.revision) return;
          const response = event.data;
          if (response.status === 'ready') finish(request, { status: 'ready', model: response.model, mode: 'worker' });
          else if (response.status === 'error') finish(request, { status: 'error', error: response.error || 'Forecast calculation failed', mode: 'worker' });
        };
        request.worker.onerror = event => { event.preventDefault?.(); fallback('worker-start-or-runtime-error'); };
        request.worker.onmessageerror = () => fallback('worker-message-error');
        request.timer = setTimeout(() => fallback('worker-timeout'), timeoutMs);
        request.worker.postMessage({ id: request.id, revision, dataset, options });
      } catch { fallback('worker-construction-error'); }
    });
  }
  return { run, cancel, supported, destroy() { destroyed = true; cancel(); }, pending: () => active !== null };
}

export function browserForecastWorkerFactory() {
  if (typeof Worker !== 'function' || !/^https?:$/.test(globalThis.location?.protocol || '')) return undefined;
  return () => new Worker(new URL('./forecast-worker.js?v=1.29.0', import.meta.url), { type: 'module', name: 'atlas-forecast' });
}
