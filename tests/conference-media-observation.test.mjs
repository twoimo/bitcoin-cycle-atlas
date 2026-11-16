import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectOptionalManifestSettlement, classifyOptionalManifestNetworkFailures} from '../scripts/conference-media-observation.mjs';
import {createConferenceMediaServer} from '../scripts/conference-media-server.mjs';

const expectedUrl = 'http://127.0.0.1:44201/bitcoin-cycle-atlas/conference/media-manifest.json';
const path = 'conference/media-manifest.json';
const absence = overrides => ({method:'GET', url:'/bitcoin-cycle-atlas/' + path, path, mode:'missing',
  status:404, contentType:null, contentLength:35, bytesSent:35, complete:true, aborted:false,
  contentEncoding:null, contentRange:null, range:null, ...overrides});
const json = overrides => absence({mode:'unavailable', status:200, contentType:'application/json; charset=utf-8',
  contentLength:167, bytesSent:167, ...overrides});
const inspect = (receipts, extra = {}) => inspectOptionalManifestSettlement({receipts, requestStart:0,
  expectedUrl, mode:'missing', ...extra});

test('the observed complete35B404 settles without a CDP responseReceived or loadingFinished pair', () => {
  const result = inspect([absence()], {network:{responses:[], finished:new Set()}});
  assert.equal(result.status, 'settled'); assert.equal(result.settled, true); assert.equal(result.reason, null);
  assert.equal(result.evidence.settledBy, 'completed-server-response');
  assert.equal(result.evidence.server.status, 404); assert.equal(result.evidence.server.bytesSent, 35);
  assert.deepEqual(result.evidence.cdp.responses, []);
});

test('a404 responseReceived without loadingFinished remains valid with completed server bytes', () => {
  const result = inspect([absence()], {network:{responses:[{requestId:'404-request', url:expectedUrl,
    status:404, mimeType:'text/plain'}], finished:new Set()}});
  assert.equal(result.settled, true);
  assert.deepEqual(result.evidence.cdp.responses, [{requestId:'404-request', status:404,
    mimeType:'text/plain', loadingFinished:false}]);
});

test('valid unavailable and installed200 JSON responses preserve their own completion evidence', () => {
  for (const mode of ['unavailable', 'installed']) {
    const result = inspect([json({mode})], {mode, network:{responses:[{requestId:mode, url:expectedUrl,
      status:200, mimeType:'application/json'}], finished:new Set([mode])}});
    assert.equal(result.status, 'settled'); assert.equal(result.evidence.expectedStatus, 200);
    assert.equal(result.evidence.cdp.responses[0].loadingFinished, true);
  }
});

test('a previous navigation complete404 cannot satisfy the new page request mark', () => {
  const old = absence();
  const result = inspect([old], {requestStart:1});
  assert.equal(result.status, 'pending'); assert.equal(result.settled, false);
  const inFlight = absence({status:null, contentLength:null, bytesSent:0, path:null, complete:false});
  assert.equal(inspect([old, inFlight], {requestStart:1}).status, 'pending');
  const fresh = inspect([old, absence()], {requestStart:1});
  assert.equal(fresh.settled, true); assert.equal(fresh.evidence.server.index, 1);
});

test('a previous CDP response cannot conflict with or certify the current navigation', () => {
  const responses = [{requestId:'old404', url:expectedUrl, status:404, mimeType:'text/plain'}];
  const result = inspect([json()], {mode:'unavailable', responseStart:1,
    network:{responses, finished:new Set(['old404'])}});
  assert.equal(result.settled, true); assert.deepEqual(result.evidence.cdp.responses, []);
});

test('unrelated URLs, origins, methods and lookalike manifest filenames do not settle the wait', () => {
  const unrelated = [
    absence({method:'HEAD'}), absence({url:'/bitcoin-cycle-atlas/conference/timeline.json'}),
    absence({url:'http://127.0.0.1:44202/bitcoin-cycle-atlas/' + path}),
    absence({url:'/bitcoin-cycle-atlas/' + path + '.html'}),
    absence({url:'/other/conference/media-manifest.json'}),
  ];
  assert.equal(inspect(unrelated).status, 'pending');
});

test('aborted, incomplete or unaccounted responses never count as settled', () => {
  assert.equal(inspect([absence({complete:false, bytesSent:12})]).status, 'pending');
  for (const bad of [
    {aborted:true, complete:false}, {aborted:true}, {aborted:undefined}, {error:'socket closed'},
    {bytesSent:34}, {bytesSent:36}, {contentLength:0, bytesSent:0}, {contentLength:null},
    {contentRange:'bytes 0-34/35'}, {contentEncoding:'gzip'}, {range:'bytes=0-'},
  ]) {
    const result = inspect([absence(bad)]);
    assert.equal(result.status, 'failed', JSON.stringify(bad)); assert.equal(result.settled, false);
  }
});

test('wrong mode, status, MIME and HTML fallback fail instead of looking like manifest completion', () => {
  for (const bad of [{mode:'installed'}, {path:'index.html'}, {status:200}, {status:500},
    {contentType:'text/html; charset=utf-8'}]) assert.equal(inspect([absence(bad)]).status, 'failed');
  for (const bad of [{status:404}, {contentType:'text/html'}, {contentType:null}, {contentType:'image/webp'}]) {
    assert.equal(inspect([json(bad)], {mode:'unavailable'}).status, 'failed');
  }
});

test('a present CDP response must agree with the authoritative completed response', () => {
  for (const bad of [{status:200}, {status:404, mimeType:'text/html'}]) {
    const result = inspect([absence()], {network:{responses:[{requestId:'current', url:expectedUrl, ...bad}],
      finished:new Set(['current'])}});
    assert.equal(result.status, 'failed'); assert.equal(result.settled, false);
  }
});

test('ambiguous current requests and invalid ownership marks fail explicitly', () => {
  assert.equal(inspect([absence(), absence()]).status, 'failed');
  for (const requestStart of [-1, .5, 2, undefined]) assert.throws(() => inspect([absence()], {requestStart}), /request mark/);
  assert.throws(() => inspect([absence()], {responseStart:1, network:{responses:[]}}), /response mark/);
  assert.throws(() => inspect([absence()], {expectedUrl:'http://127.0.0.1/index.html'}), /manifest URL/);
  assert.throws(() => inspect([absence()], {mode:'invented'}), /Unknown manifest/);
});

const classify = (failures, extra = {}) => classifyOptionalManifestNetworkFailures({failures,
  requests:[{requestId:'manifest-current', url:expectedUrl, method:'GET'}], requestStart:0,
  settlement:inspect([absence()]), ...extra});
const httpFailure = overrides => ({requestId:'manifest-current', type:'Fetch', canceled:false,
  errorText:'net::ERR_HTTP_RESPONSE_CODE_FAILURE', ...overrides});

test('an explicit Chrome HTTP-code failure for the completed current manifest404 is retained separately', () => {
  const result = classify([httpFailure()]);
  assert.deepEqual(result.unexpected, []); assert.equal(result.expectedHttpErrors.length, 1);
  assert.deepEqual(result.expectedHttpErrors[0], {...httpFailure(), url:expectedUrl, method:'GET',
    classification:'intentional-complete-manifest-404', serverReceiptIndex:0});
});

test('generic transport errors, timeouts, cancellations, blocking and CORS stay unexpected', () => {
  const errors = ['net::ERR_FAILED', 'net::ERR_TIMED_OUT', 'net::ERR_ABORTED', 'net::ERR_CONNECTION_RESET']
    .map(errorText => httpFailure({errorText}));
  errors.push(httpFailure({canceled:true}), httpFailure({blockedReason:'inspector'}),
    httpFailure({corsErrorStatus:{corsError:'DisallowedByMode'}}));
  const result = classify(errors);
  assert.deepEqual(result.expectedHttpErrors, []); assert.deepEqual(result.unexpected, errors);
});

test('stale, unknown, nonGET and other-origin CDP request IDs cannot borrow a completed404 receipt', () => {
  const failure = httpFailure();
  for (const extra of [
    {requestStart:1}, {requests:[]},
    {requests:[{requestId:'another-id', url:expectedUrl, method:'GET'}]},
    {requests:[{requestId:'manifest-current', url:expectedUrl, method:'HEAD'}]},
    {requests:[{requestId:'manifest-current', url:expectedUrl.replace('44201', '44202'), method:'GET'}]},
    {requests:[{requestId:'manifest-current', url:expectedUrl.replace('media-manifest.json', 'audio/session-00.m4a'), method:'GET'}]},
  ]) {
    const result = classify([failure], extra);
    assert.deepEqual(result.expectedHttpErrors, []); assert.deepEqual(result.unexpected, [failure]);
  }
});

test('unavailable200, pending, aborted and wrong-mode responses cannot excuse a Chrome HTTP error', () => {
  const failure = httpFailure();
  for (const settlement of [inspect([json()], {mode:'unavailable'}), inspect([absence({complete:false})]),
    inspect([absence({aborted:true})]), inspect([absence({mode:'installed'})]), null]) {
    const result = classify([failure], {settlement});
    assert.deepEqual(result.expectedHttpErrors, []); assert.deepEqual(result.unexpected, [failure]);
  }
});

test('expected manifest404 classification never removes an independent media failure', () => {
  const audio = httpFailure({requestId:'audio', errorText:'net::ERR_HTTP_RESPONSE_CODE_FAILURE'});
  const result = classify([httpFailure(), audio], {requests:[{requestId:'manifest-current', url:expectedUrl, method:'GET'},
    {requestId:'audio', url:expectedUrl.replace('media-manifest.json', 'audio/session-00.m4a'), method:'GET'}]});
  assert.equal(result.expectedHttpErrors.length, 1); assert.deepEqual(result.unexpected, [audio]);
});

test('the real local server404 and unavailable200 finish without any CDP ledger entries', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'atlas-manifest-observation-'));
  try {
    await mkdir(join(dist, 'conference'));
    await writeFile(join(dist, 'conference/timeline.json'), JSON.stringify({event:{id:'temporary-transport-test'}}));
    for (const mode of ['missing', 'unavailable']) {
      const {server, receipts} = createConferenceMediaServer({dist, mode});
      try {
        await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
        const url = 'http://127.0.0.1:' + server.address().port + '/bitcoin-cycle-atlas/' + path;
        const requestStart = receipts.length, response = await fetch(url), bytes = Buffer.from(await response.arrayBuffer());
        const result = inspectOptionalManifestSettlement({receipts, requestStart, expectedUrl:url, mode,
          network:{responses:[], finished:new Set()}});
        assert.equal(result.status, 'settled'); assert.equal(result.evidence.server.bytesSent, bytes.length);
        assert.equal(result.evidence.server.complete, true); assert.equal(result.evidence.server.aborted, false);
        assert.deepEqual(result.evidence.cdp.responses, []);
        if (mode === 'missing') { assert.equal(response.status, 404); assert.equal(bytes.length, 35); }
        else { assert.equal(response.status, 200); assert.equal(JSON.parse(bytes).status, 'unavailable'); }
      } finally { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
    }
  } finally { await rm(dist, {recursive:true, force:true}); }
});
