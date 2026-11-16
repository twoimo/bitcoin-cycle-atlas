// Serialized into the isolated browser context before application scripts run.
// This observes application-issued seeks; it never chooses or changes a value.
export function installConferenceNativeSeekObserver() {
  'use strict';
  const kind = 'atlas-conference-native-seek-observer-v1';
  const previous = window.__conferenceNativeSeek;
  if (previous?.kind === kind && previous.isInstalled()) return previous;
  if (previous && previous.kind !== kind) throw new Error('Native seek observer global is already owned');
  const Media = HTMLMediaElement, prototype = Media.prototype;
  const original = Object.getOwnPropertyDescriptor(prototype, 'currentTime');
  if (!original || typeof original.get !== 'function' || typeof original.set !== 'function' || !original.configurable) {
    throw new Error('Native currentTime descriptor cannot be observed');
  }
  const operations = new Map(), orphaned = {requests:[], observationErrors:[]};
  let nextOperation = 0, nextRequest = 0, active = null, installed = true;
  const describe = error => { try { return String(error); } catch { return 'Uninspectable observation error'; } };
  const now = () => performance.now();
  const copyRequest = request => ({...request});
  const copyOperation = operation => ({id:operation.id, label:operation.label, startedAt:operation.startedAt,
    finishedAt:operation.finishedAt, closed:operation.closed, requests:operation.requests.map(copyRequest),
    observationErrors:operation.observationErrors.map(error => ({...error}))});
  const getOperation = id => {
    const operation = operations.get(id);
    if (!operation) throw new Error('Unknown native seek operation: ' + id);
    return operation;
  };
  const observationError = (owner, error) => {
    owner.observationErrors.push({operationId:owner === orphaned ? null : owner.id, error:describe(error)});
  };
  function observedCurrentTime(value) {
    const owner = active || orphaned;
    let request = null;
    try {
      if (this instanceof Media && this.matches('.conference-audio')) {
        // src is the requested resource. currentSrc may still name the previous
        // session while a newly assigned source is loading. Do not read the
        // native currentTime getter here: its quantization is separate evidence.
        request = {id:++nextRequest, operationId:active?.id ?? null, src:this.src,
          currentSrcBefore:this.currentSrc, currentTime:value, accepted:false, at:now(),
          url:location.href, trigger:window.event?.type || null};
        owner.requests.push(request);
      }
    } catch (error) { observationError(owner, error); }
    try {
      // Delegate once, with the exact receiver and raw argument. Native numeric
      // conversion, acceptance, return value and thrown object remain native.
      const returned = Reflect.apply(original.set, this, [value]);
      if (request) request.accepted = true;
      return returned;
    } catch (error) {
      if (request) request.error = describe(error);
      throw error;
    }
  }
  const api = {
    kind,
    begin(label) {
      if (!installed) throw new Error('Native seek observer has been restored');
      if (active) throw new Error('Native seek operation is already active: ' + active.id);
      if (typeof label !== 'string' || !label) throw new Error('Native seek operation requires a label');
      const operation = {id:++nextOperation, label, startedAt:now(), finishedAt:null, closed:false,
        requests:[], observationErrors:[]};
      operations.set(operation.id, operation); active = operation; return operation.id;
    },
    currentId() { return active?.id ?? null; },
    peek(id) { return copyOperation(getOperation(id)); },
    finish(id) {
      const operation = getOperation(id);
      if (!operation.closed) {
        if (active !== operation) throw new Error('Native seek operation is not active: ' + id);
        operation.finishedAt = now(); operation.closed = true; active = null;
      }
      return copyOperation(operation);
    },
    unowned() { return {requests:orphaned.requests.map(copyRequest),
      observationErrors:orphaned.observationErrors.map(error => ({...error}))}; },
    isInstalled() { return installed; },
    restore() {
      if (!installed) return false;
      const current = Object.getOwnPropertyDescriptor(prototype, 'currentTime');
      if (current?.set !== observedCurrentTime || current.get !== original.get
        || current.configurable !== original.configurable || current.enumerable !== original.enumerable) {
        throw new Error('Native currentTime descriptor changed outside this observer');
      }
      Object.defineProperty(prototype, 'currentTime', original); installed = false;
      if (active) api.finish(active.id);
      return true;
    },
  };
  Object.defineProperty(prototype, 'currentTime', {...original, set:observedCurrentTime});
  window.__conferenceNativeSeek = api;
  api.begin('navigation');
  return api;
}
