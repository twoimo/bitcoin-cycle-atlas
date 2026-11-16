// Observation helpers for the installed-media browser harness. These inspect
// evidence only: they neither fetch a substitute nor change player/media state.
import assert from 'node:assert/strict';

const manifestPath = 'conference/media-manifest.json';
const mediaType = value => typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : null;
const identity = value => ({method:value.method, url:value.url, path:value.path, mode:value.mode,
  status:value.status, contentType:value.contentType, contentLength:value.contentLength,
  bytesSent:value.bytesSent, complete:value.complete, aborted:value.aborted});

/**
 * Call with both marks captured immediately before this navigation. The local
 * server belongs to this case/mode, and cases dispose their isolated browser
 * context before another case starts. A receipt before requestStart therefore
 * cannot satisfy a new page's optional-manifest wait.
 *
 * CDP's responseReceived/loadingFinished pair is supplementary evidence. Chrome
 * can omit that pair for an HTTP error even though the local server finished the
 * exact 404 response. A complete, byte-accounted server response is authoritative
 * for transport completion; the caller must still await rendering and assert the
 * actual player fallback. This does not turn a missing/failed HTTP request into a
 * passing media case, or change the preflight's unavailable exit-2 contract.
 */
export function inspectOptionalManifestSettlement({receipts, requestStart, expectedUrl, mode,
  network = {}, responseStart = 0}) {
  assert.ok(Array.isArray(receipts), 'Manifest observation requires server receipts');
  assert.ok(Number.isInteger(requestStart) && requestStart >= 0 && requestStart <= receipts.length,
    'Manifest observation requires a valid pre-navigation request mark');
  assert.ok(['installed', 'missing', 'unavailable'].includes(mode), 'Unknown manifest observation mode');
  const target = new URL(expectedUrl);
  assert.ok(['http:', 'https:'].includes(target.protocol) && target.pathname.endsWith('/' + manifestPath)
    && !target.hash && !target.username && !target.password, 'Expected an exact manifest URL');
  const responses = network.responses ?? [];
  assert.ok(Array.isArray(responses) && Number.isInteger(responseStart) && responseStart >= 0
    && responseStart <= responses.length, 'Manifest observation requires a valid CDP response mark');
  const expectedStatus = mode === 'missing' ? 404 : 200;
  const matches = value => {
    try { return new URL(value, target).href === target.href; } catch { return false; }
  };
  const current = receipts.slice(requestStart).map((receipt, offset) => ({receipt, index:requestStart + offset}))
    .filter(({receipt}) => receipt.method === 'GET' && matches(receipt.url));
  const pending = reason => ({status:'pending', settled:false, reason, evidence:null});
  const failed = (reason, evidence) => ({status:'failed', settled:false, reason, evidence});
  if (!current.length) return pending('This navigation has no manifest GET receipt yet');
  if (current.length !== 1) return failed('This navigation has ambiguous manifest GET receipts',
    {server:current.map(({receipt, index}) => ({index, ...identity(receipt)}))});
  const {receipt, index} = current[0];
  const observed = responses.slice(responseStart).filter(response => matches(response.url));
  const evidence = {expectedUrl:target.href, expectedStatus, requestStart, responseStart,
    server:{index, ...identity(receipt)},
    cdp:{responses:observed.map(response => ({requestId:response.requestId, status:response.status,
      mimeType:response.mimeType, loadingFinished:network.finished?.has?.(response.requestId) === true}))}};
  if (receipt.mode !== mode) return failed('Manifest receipt belongs to a different server mode', evidence);
  if (receipt.aborted) return failed('Manifest response was aborted', evidence);
  if (receipt.error) return failed('Manifest response failed: ' + receipt.error, evidence);
  if (!receipt.complete) return pending('Manifest response has not completed');
  if (receipt.path !== manifestPath || receipt.aborted !== false) return failed('Manifest response identity is incomplete', evidence);
  if (receipt.status !== expectedStatus) return failed('Manifest response status differs from the requested mode', evidence);
  if (!Number.isInteger(receipt.contentLength) || receipt.contentLength <= 0
    || receipt.bytesSent !== receipt.contentLength) return failed('Manifest response byte accounting is incomplete', evidence);
  if (receipt.contentEncoding || receipt.contentRange || receipt.range) return failed('Manifest response is not a complete identity representation', evidence);
  const type = mediaType(receipt.contentType);
  if (mode === 'missing' ? ![null, 'text/plain'].includes(type) : type !== 'application/json') {
    return failed('Manifest response MIME is not the expected JSON or intentional absence', evidence);
  }
  for (const response of observed) {
    if (response.status !== expectedStatus) return failed('CDP manifest status conflicts with the completed server response', evidence);
    const cdpType = mediaType(response.mimeType);
    if (cdpType && (mode === 'missing' ? !['text/plain', 'application/octet-stream'].includes(cdpType)
      : cdpType !== 'application/json')) return failed('CDP manifest MIME conflicts with the expected response', evidence);
  }
  return {status:'settled', settled:true, reason:null, evidence:{...evidence, settledBy:'completed-server-response'}};
}

// Some Chrome HTTP-error deliveries finish as loadingFailed instead of the
// normal responseReceived/loadingFinished pair. Retain that observation in the
// report, but distinguish the intentionally served manifest404 from a transport
// failure. No generic ERR_FAILED, timeout, CORS, blocked, canceled, media-file,
// previous-navigation or unknown request is excused by this classification.
export function classifyOptionalManifestNetworkFailures({failures, requests, requestStart, settlement}) {
  assert.ok(Array.isArray(failures) && Array.isArray(requests), 'Manifest network classification requires request and failure evidence');
  assert.ok(Number.isInteger(requestStart) && requestStart >= 0 && requestStart <= requests.length,
    'Manifest network classification requires a pre-navigation request mark');
  const expectedHttpErrors = [], unexpected = [], evidence = settlement?.evidence, server = evidence?.server;
  const absenceCompleted = settlement?.status === 'settled' && settlement.settled === true
    && evidence?.expectedStatus === 404 && server?.mode === 'missing' && server.method === 'GET'
    && server.path === manifestPath && server.status === 404 && server.complete === true && server.aborted === false
    && Number.isInteger(server.contentLength) && server.contentLength > 0 && server.bytesSent === server.contentLength;
  for (const failure of failures) {
    const request = requests.slice(requestStart).findLast(item => item.requestId === failure.requestId);
    let sameUrl = false;
    try { sameUrl = request?.url && new URL(request.url).href === evidence?.expectedUrl; } catch { /* Unusable evidence remains unexpected. */ }
    const expected = absenceCompleted && typeof failure.requestId === 'string' && failure.requestId.length > 0
      && request?.method === 'GET' && sameUrl
      && failure.errorText === 'net::ERR_HTTP_RESPONSE_CODE_FAILURE' && failure.canceled !== true
      && !failure.blockedReason && !failure.corsErrorStatus;
    if (expected) expectedHttpErrors.push({...failure, url:request.url, method:request.method,
      classification:'intentional-complete-manifest-404', serverReceiptIndex:server.index});
    else unexpected.push(failure);
  }
  return {expectedHttpErrors, unexpected};
}
