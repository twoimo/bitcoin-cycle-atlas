#!/usr/bin/env node
// P1c-B: only installed, hash-verified real media can reach the browser checks.
// No generated substitutes, media writes, deployment, or browser installation.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {headlessWindowArgument, verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';
import {createConferenceMediaServer, inspectInstalledConferenceMedia, auditConferenceMediaHttp,
  parseConferenceByteRange, CONFERENCE_MEDIA_PREFIX} from './conference-media-server.mjs';
import {buildConferenceMediaPlaybackPlan, assertConferenceSourceJoinEvidence, assertConferenceSeekEvidence,
  CONFERENCE_SEEK_READBACK} from './conference-media-browser-contract.mjs';
import {inspectOptionalManifestSettlement, classifyOptionalManifestNetworkFailures} from './conference-media-observation.mjs';
import {armConferenceSlideObservation} from './conference-media-slide-observer.mjs';
import {installConferenceNativeSeekObserver} from './conference-media-seek-observer.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const delay = ms => new Promise(accept => setTimeout(accept, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const viewport = {width:1440, height:900, mobile:false};
export const CONFERENCE_MEDIA_EXIT = Object.freeze({passed:0, failed:1, skipped:2});

export function parseConferenceMediaArguments(args, cwd = root) {
  const values = {dist:'dist', out:'build/conference-media-browser',
    browser:process.env.ATLAS_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'};
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const name = args[i].replace(/^--/, '');
    assert.ok(args[i].startsWith('--') && Object.hasOwn(values, name), 'Unknown option: ' + args[i]);
    assert.ok(!seen.has(name), 'Duplicate option: ' + args[i]); seen.add(name);
    assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), 'Missing value: ' + args[i]);
    values[name] = args[++i];
  }
  return {dist:resolve(cwd, values.dist), out:resolve(cwd, values.out), browser:resolve(cwd, values.browser)};
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.addEventListener('message', event => {
      const data = JSON.parse(String(event.data));
      if (!data.id) { for (const listener of this.listeners.get(data.method) || []) listener(data.params || {}); return; }
      const call = this.pending.get(data.id); if (!call) return;
      this.pending.delete(data.id); clearTimeout(call.timer);
      data.error ? call.reject(new Error(JSON.stringify(data.error))) : call.resolve(data.result || {});
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((accept, reject) => { ws.addEventListener('open', accept, {once:true}); ws.addEventListener('error', reject, {once:true}); });
    return new Cdp(ws);
  }
  on(method, listener) { this.listeners.set(method, [...(this.listeners.get(method) || []), listener]); }
  send(method, params = {}) {
    return new Promise((accept, reject) => {
      const id = ++this.id, timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000);
      this.pending.set(id, {resolve:accept, reject, timer}); this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  close() { this.ws.close(); for (const call of this.pending.values()) { clearTimeout(call.timer); call.reject(new Error('CDP closed')); } this.pending.clear(); }
}
async function evaluate(cdp, fn, ...values) {
  const result = await cdp.send('Runtime.evaluate', {expression:`(${fn.toString()})(${values.map(value => JSON.stringify(value)).join(',')})`,
    returnByValue:true, awaitPromise:true});
  if (result.exceptionDetails) throw new Error('Browser evaluation: ' + JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(read, label, timeout = 30000) {
  const deadline = Date.now() + timeout; let last;
  while (Date.now() < deadline) { last = await read(); if (last) return last; await delay(25); }
  throw new Error('Timed out: ' + label + '; last=' + JSON.stringify(last));
}
async function settled(cdp) {
  await evaluate(cdp, async () => { await document.fonts.ready; await new Promise(accept => requestAnimationFrame(() => requestAnimationFrame(accept))); });
}
function inspect(finishSeek = false) {
  const player = document.querySelector('.conference-player'), audio = player?.querySelector('audio'), image = player?.querySelector('.conference-slide-image');
  const capture = window.__conferenceNativeSeek, operation = capture?.currentId();
  return {state:player ? {...player.dataset} : null, h1Count:document.querySelectorAll('h1').length,
    stateTitle:player?.querySelector('[data-role=state-title]')?.textContent,
    notice:player?.querySelector('[data-role=notice]')?.textContent,
    stageVisible:Boolean(player?.querySelector('.conference-stage')?.checkVisibility()),
    captionEnabled:player?.querySelector('.conference-caption')?.disabled === false,
    playDisabled:player?.querySelector('[data-action=play]')?.disabled,
    image:image ? {src:image.getAttribute('src'), requestedSrc:image.src, currentSrc:image.currentSrc, complete:image.complete,
      width:image.naturalWidth, height:image.naturalHeight, visible:!image.hidden && image.checkVisibility()} : null,
    audio:audio ? {src:audio.getAttribute('src'), currentSrc:audio.currentSrc, currentTime:audio.currentTime,
      duration:audio.duration, paused:audio.paused, ended:audio.ended, seeking:audio.seeking,
      readyState:audio.readyState, error:audio.error?.code || null} : null,
    seekOperation:operation == null ? null : finishSeek ? capture.finish(operation) : capture.peek(operation)};
}
async function click(cdp, selector) {
  const locate = async block => {
    await evaluate(cdp, (selector, block) => {
      const node = document.querySelector(selector);
      if (!node || node.disabled || node.closest('[hidden]')) throw new Error('Unavailable ' + selector);
      node.scrollIntoView({block, inline:'nearest'});
    }, selector, block);
    await settled(cdp);
    return evaluate(cdp, selector => {
      const node = document.querySelector(selector), r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return {x, y, hit:Boolean(node.contains(document.elementFromPoint(x, y)))};
    }, selector);
  };
  let point = await locate('nearest'); if (!point.hit) point = await locate('center');
  assert.ok(point.hit, 'Covered native pointer target: ' + selector);
  await evaluate(cdp, selector => {
    window.__conferenceLastClick = null;
    document.querySelector(selector).addEventListener('click', event => {
      window.__conferenceLastClick = {trusted:event.isTrusted, selector, at:performance.now()};
    }, {once:true, capture:true});
  }, selector);
  await cdp.send('Input.dispatchMouseEvent', {type:'mousePressed', x:point.x, y:point.y, button:'left', clickCount:1});
  await cdp.send('Input.dispatchMouseEvent', {type:'mouseReleased', x:point.x, y:point.y, button:'left', clickCount:1});
  const observed = await evaluate(cdp, () => window.__conferenceLastClick);
  assert.equal(observed?.trusted, true, 'The player must receive a trusted native click');
}
function beginAudioProbe(sessions) {
  const audio = document.querySelector('.conference-audio'), evidence = {samples:[], events:[]};
  const sample = () => {
    const src = audio.currentSrc, session = sessions.find(item => src.endsWith('/conference/' + item.file));
    evidence.samples.push({at:performance.now(), src, currentTime:audio.currentTime,
      eventTime:session ? session.t0 + audio.currentTime : null, paused:audio.paused, ended:audio.ended,
      readyState:audio.readyState, error:audio.error?.code || null});
  };
  const types = ['playing', 'timeupdate', 'waiting', 'stalled', 'seeking', 'seeked', 'ended', 'error', 'abort', 'emptied', 'loadstart', 'pause'];
  const handler = event => evidence.events.push({type:event.type, at:performance.now(), src:audio.currentSrc, currentTime:audio.currentTime});
  for (const type of types) audio.addEventListener(type, handler);
  sample(); const timer = setInterval(sample, 25);
  window.__conferenceAudioProbe = {evidence, stop() {
    clearInterval(timer); sample(); for (const type of types) audio.removeEventListener(type, handler); return evidence;
  }};
}
async function playAndAdvance(cdp, seconds = 0.3) {
  const before = await evaluate(cdp, inspect); assert.equal(before.audio.paused, true);
  await click(cdp, '[data-action=play]');
  return until(async () => {
    const now = await evaluate(cdp, inspect);
    return now.state.playing === 'true' && !now.audio.paused && now.audio.readyState >= 2
      && now.audio.currentSrc === before.audio.currentSrc && now.audio.currentTime >= before.audio.currentTime + seconds && now;
  }, 'native audio clock advances after trusted play');
}
function assetFile(src) {
  if (!src) return null;
  return new URL(src).pathname.split('/conference/')[1] || null;
}
async function beginSeek(cdp, label) {
  return evaluate(cdp, label => window.__conferenceNativeSeek.begin(label), label);
}
async function finishSeek(page, session, eventTime, settings) {
  const {cdp, entry} = page;
  await until(async () => {
    const snapshot = await evaluate(cdp, inspect);
    return assetFile(snapshot.audio?.currentSrc) === session.file && snapshot.audio.readyState >= 1
      && !snapshot.audio.seeking && snapshot.audio.paused && snapshot;
  }, 'settled native session seek ' + session.id);
  await settled(cdp);
  const snapshot = await evaluate(cdp, inspect, true), operation = snapshot.seekOperation;
  // Preserve the actual requests even when a later assertion rejects them.
  // A second URL-rounded request must never disappear behind the final clock.
  (entry.seekObservations ||= []).push({sessionId:session.id, eventTime, snapshot});
  assert.ok(operation?.closed, 'Seek request evidence must belong to this completed operation');
  assert.deepEqual(operation.observationErrors, [], 'Native seek request observation must remain complete');
  snapshot.seekEvidence = assertConferenceSeekEvidence({snapshot, requests:operation.requests, session, eventTime, settings});
  return snapshot;
}

export function assertConferenceSlideReceipt({armed, measured, snapshot, asset, step, deckId}) {
  assert.equal(measured.token, armed.token, 'Only this step owns the decode result');
  assert.equal(measured.mode, armed.mode); assert.equal(measured.page, step.page);
  assert.equal(measured.file, step.file); assert.equal(measured.deck, deckId);
  assert.equal(measured.error, undefined, 'Actual WebP decode must succeed'); assert.equal(measured.decoded, true);
  assert.equal(measured.requestedSrc, measured.currentSrc, 'Decoded source is the requested current image');
  assert.equal(assetFile(measured.currentSrc), step.file);
  assert.equal(snapshot.state.deck, deckId); assert.equal(Number(snapshot.state.page), step.page);
  // Requested mapping time stays exact. The separate seek receipt validates
  // native read-back and app/native coherence, without changing the mapping.
  assert.equal(snapshot.seekEvidence?.passed, true, 'Mapped page requires completed exact seek evidence');
  assert.equal(snapshot.seekEvidence.requestedEventTime, step.t0, 'Page uses its original mapping event time');
  assert.equal(snapshot.image.visible, true); assert.equal(snapshot.image.complete, true);
  assert.equal(snapshot.image.requestedSrc, snapshot.image.currentSrc, 'Current source must still match after the seek settles');
  assert.equal(snapshot.image.currentSrc, measured.currentSrc, 'The measured image remains current after the seek settles');
  assert.equal(measured.width, asset.width); assert.equal(measured.height, asset.height);
  assert.equal(snapshot.image.width, asset.width); assert.equal(snapshot.image.height, asset.height); assert.equal(snapshot.h1Count, 1);
  if (armed.mode === 'baseline') {
    assert.equal(measured.milliseconds, null, 'A baseline is not a zero-ms transition'); assert.equal(measured.trusted, null);
  } else {
    assert.equal(armed.mode, 'transition'); assert.equal(measured.trusted, true);
    assert.ok(Number.isFinite(measured.milliseconds) && measured.milliseconds >= 0 && measured.milliseconds <= 150,
      'Decoded page transition ' + measured.milliseconds + 'ms exceeds 150ms');
  }
}

export function assertConferenceBrowserMediaResponses(requests, mode, manifest) {
  const media = requests.filter(item => /\/conference\/(pages|audio)\//.test(item.url));
  const sent = media.filter(item => !(item.status === null && item.aborted));
  let audioRangeResponses = 0;
  if (mode === 'installed') {
    const audio = sent.filter(item => item.method === 'GET' && item.path?.endsWith('.m4a'));
    assert.ok(audio.length > 0, 'Browser native audio must make Range requests');
    for (const item of audio) {
      const file = item.path.slice('conference/'.length), asset = manifest.assets.find(asset => asset.file === file);
      assert.ok(asset, 'Browser requested a declared audio asset');
      const expected = parseConferenceByteRange(item.range, asset.bytes);
      assert.equal(expected.status, 206, 'Native audio request carries a valid Range'); assert.equal(item.status, 206);
      assert.equal(item.contentRange, expected.contentRange); assert.equal(item.contentLength, expected.length);
      assert.equal(item.contentType, 'audio/mp4'); assert.equal(item.contentEncoding, null);
    }
    for (const item of sent.filter(item => item.path?.endsWith('.webp'))) {
      assert.equal(item.status, 200); assert.equal(item.contentType, 'image/webp');
    }
    audioRangeResponses = audio.length;
  } else assert.deepEqual(media, [], 'Known absent media must not be requested');
  assert.deepEqual(requests.filter(item => item.status >= 400 && !(mode === 'missing'
    && item.path?.endsWith('/media-manifest.json') && item.status === 404)), [], 'No unexpected local HTTP errors');
  return {audioRangeResponses, abortedBeforeHeaders:media.length - sent.length};
}

export async function verifyConferenceMediaBrowser(options) {
  const {dist, out, browser} = options;
  const report = {schemaVersion:1, kind:'atlas-conference-p1c-b-media-browser', status:'failed',
    startedAt:new Date().toISOString(), sourceCommit:execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim(),
    workingChanges:execFileSync('git', ['status', '--porcelain'], {cwd:root, encoding:'utf8'}).trim(),
    dist, syntheticFixture:false, productionDeployment:false, humanListening:'not-performed',
    browserLaunched:false, viewport, network:{local:true, cacheDisabled:true, encoding:'identity', cpuThrottling:1, throttled:false},
    budgets:{pageTransitionMs:150, initialLoad:'not-measured; use unchanged A-9 fast4g harness',
      nativeSeekReadbackMs:CONFERENCE_SEEK_READBACK.readbackSeconds * 1000,
      nativeSeekReadbackFrames:CONFERENCE_SEEK_READBACK.readbackFrames,
      exactSeekRequest:true, playerNativeClockRoundingMs:CONFERENCE_SEEK_READBACK.stateRoundingSeconds * 1000},
    cases:[], failures:[], skipReason:null};
  let outputCreated = false, child, browserCdp, browserProfile, stderr = '', spawnError;
  const servers = new Map(); let debugOrigin;
  async function startServer(mode) {
    const state = createConferenceMediaServer({dist, mode});
    await new Promise((accept, reject) => { state.server.once('error', reject); state.server.listen(0, '127.0.0.1', accept); });
    state.origin = 'http://127.0.0.1:' + state.server.address().port; servers.set(mode, state); return state;
  }
  async function createPage(entry) {
    const {browserContextId} = await browserCdp.send('Target.createBrowserContext');
    let cdp;
    try {
    const {targetId} = await browserCdp.send('Target.createTarget', {url:'about:blank', browserContextId});
    const target = await until(async () => (await (await fetch(debugOrigin + '/json/list')).json()).find(item => item.id === targetId), 'isolated media target');
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    const network = {requests:[], responses:[], failures:[], cancellations:[], finished:new Set()};
    cdp.on('Runtime.exceptionThrown', event => entry.runtimeErrors.push(event.exceptionDetails));
    cdp.on('Runtime.consoleAPICalled', event => { if (event.type === 'error') entry.consoleErrors.push(event.args); });
    cdp.on('Network.requestWillBeSent', event => network.requests.push({requestId:event.requestId, url:event.request.url, method:event.request.method}));
    cdp.on('Network.responseReceived', event => network.responses.push({requestId:event.requestId, url:event.response.url,
      status:event.response.status, mimeType:event.response.mimeType, headers:event.response.headers}));
    cdp.on('Network.loadingFinished', event => network.finished.add(event.requestId));
    cdp.on('Network.loadingFailed', event => {
      if (event.canceled) network.cancellations.push(event);
      const request = network.requests.findLast(item => item.requestId === event.requestId);
      // Native audio switches may cancel their old downloads. A canceled
      // manifest fetch must still fail, even if its server finished writing.
      if (!event.canceled || request?.url === network.manifestUrl) network.failures.push(event);
    });
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
    entry.nativeWindow = await verifyHeadlessWindowEnvelope(cdp, viewport);
    await cdp.send('Emulation.setDeviceMetricsOverride', {...viewport, deviceScaleFactor:1});
    await cdp.send('Network.setCacheDisabled', {cacheDisabled:true});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source:`(${installConferenceNativeSeekObserver.toString()})()`});
    return {cdp, network, entry, async dispose() { cdp.close(); await browserCdp.send('Target.disposeBrowserContext', {browserContextId}); }};
    } catch (error) {
      cdp?.close();
      await browserCdp.send('Target.disposeBrowserContext', {browserContextId}).catch(() => {});
      throw error;
    }
  }
  async function navigate(page, server, time, deck, session) {
    const url = server.origin + CONFERENCE_MEDIA_PREFIX + '/?page=conference&t=' + time + '&deck=' + encodeURIComponent(deck);
    const observation = {serverRequestStart:server.receipts.length, cdpResponseStart:page.network.responses.length,
      cdpRequestStart:page.network.requests.length, expectedUrl:server.origin + CONFERENCE_MEDIA_PREFIX + '/conference/media-manifest.json'};
    page.entry.navigation = {url, requestedEventTime:time, requestedDeck:deck, ...observation};
    page.manifestObservation = observation;
    page.network.manifestUrl = observation.expectedUrl;
    const result = await page.cdp.send('Page.navigate', {url}); assert.ok(!result.errorText, result.errorText);
    await until(() => evaluate(page.cdp, () => document.querySelector('.conference-player')?.dataset.state === 'ready'), 'real timeline ready');
    // First-load pageshow owns a URL synchronization/pause. Start interaction
    // after that document lifecycle, as in the unchanged R13 harness.
    await until(() => evaluate(page.cdp, () => document.readyState === 'complete' && document.fonts.status === 'loaded'), 'document load and fonts before native media input');
    observation.settlement = await until(() => {
      const observed = inspectOptionalManifestSettlement({receipts:server.receipts, requestStart:observation.serverRequestStart,
        expectedUrl:observation.expectedUrl, mode:page.entry.mode, network:page.network, responseStart:observation.cdpResponseStart});
      page.entry.navigation.manifest = observed;
      assert.notEqual(observed.status, 'failed', observed.reason);
      return observed.settled && observed;
    }, 'optional manifest response settled');
    await settled(page.cdp);
    const snapshot = session ? await finishSeek(page, session, time, preflight.manifest.settings) : await evaluate(page.cdp, inspect, true);
    assert.equal(snapshot.h1Count, 1); assert.equal(snapshot.state.state, 'ready'); assert.equal(snapshot.stageVisible, true);
    page.entry.navigation.snapshot = snapshot;
    return snapshot;
  }
  async function runCase(id, mode, operation) {
    const entry = {id, mode, status:'failed', runtimeErrors:[], consoleErrors:[], failures:[]}; report.cases.push(entry);
    const server = servers.get(mode) || await startServer(mode), firstRequest = server.receipts.length; let page;
    try {
      page = await createPage(entry); await operation(page, server, entry);
      const screenshot = await page.cdp.send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
      entry.screenshot = id + '.png'; await writeFile(resolve(out, entry.screenshot), Buffer.from(screenshot.data, 'base64'));
      entry.status = 'passed';
    } catch (error) {
      entry.failures.push(String(error.stack || error));
      if (page) { try { entry.finalState = await evaluate(page.cdp, inspect); } catch { /* Target may already have failed. */ } }
    } finally {
      try {
        if (page) {
          entry.responses = page.network.responses; entry.networkFailures = page.network.failures;
          entry.networkRequests = page.network.requests; entry.networkCancellations = page.network.cancellations;
          try { entry.unownedSeekRequests = await evaluate(page.cdp, () => window.__conferenceNativeSeek?.unowned()); }
          catch (error) { entry.failures.push('Cannot retain unowned seek observations: ' + String(error)); }
          await page.dispose();
          await until(() => server.receipts.slice(firstRequest).every(item => item.complete || item.aborted), 'final HTTP receipts after context disposal', 5000);
          assert.deepEqual(entry.runtimeErrors, [], 'No unhandled browser exceptions');
          assert.deepEqual(entry.consoleErrors, [], 'No console errors from player execution');
          entry.manifestHttpErrors = classifyOptionalManifestNetworkFailures({failures:entry.networkFailures,
            requests:page.network.requests, requestStart:page.manifestObservation?.cdpRequestStart ?? 0,
            settlement:page.manifestObservation?.settlement});
          assert.deepEqual(entry.manifestHttpErrors.unexpected, [], 'No unexpected browser network failures');
          entry.requests = server.receipts.slice(firstRequest);
          entry.browserHttp = assertConferenceBrowserMediaResponses(entry.requests, mode, preflight.manifest);
        }
      } catch (error) { entry.failures.push(String(error.stack || error)); }
      entry.requests ||= server.receipts.slice(firstRequest);
      if (entry.failures.length) entry.status = 'failed';
      for (const error of entry.failures) report.failures.push({id, error});
      console.log(JSON.stringify({id, status:entry.status, failure:entry.failures[0]?.split('\n')[0]}));
      await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
  }
  let preflight;
  try {
    // Create missing parents, but reserve the receipt directory exclusively:
    // reruns must never overwrite evidence from an earlier invocation.
    await mkdir(dirname(out), {recursive:true});
    await mkdir(out, {recursive:false}); outputCreated = true;
    report.harnessSources = Object.fromEntries(await Promise.all(['scripts/verify-conference-media-browser.mjs',
      'scripts/conference-media-browser-contract.mjs', 'scripts/conference-media-server.mjs', 'scripts/headless-browser-window.mjs',
      'scripts/conference-media-observation.mjs', 'scripts/conference-media-slide-observer.mjs', 'scripts/conference-media-seek-observer.mjs']
      .map(async file => [file, digest(await readFile(resolve(root, file)))])));
    preflight = await inspectInstalledConferenceMedia({dist});
    const {manifest, timeline, ...receipt} = preflight; report.preflight = receipt;
    if (preflight.skipped) {
      report.status = 'skipped'; report.skipReason = preflight.reason;
      report.unexecuted = ['real image decoding/transitions', 'native audio playback/session seeks', 'session-13 source join continuity', 'installed-media HTTP Range/206', 'browser missing/unavailable fallback'];
      return report;
    }
    assert.equal(preflight.passed, true, 'Installed media identity/schema preflight: ' + JSON.stringify(preflight.errors));
    assert.notEqual(timeline.synthetic, true, 'Real playback harness refuses a synthetic timeline');
    assert.equal(timeline.event.id, 'plspo-2026-10-31', 'Locked conference event');
    const committedTimeline = execFileSync('git', ['show', 'HEAD:dist/conference/timeline.json'], {cwd:root, maxBuffer:4 * 1024 * 1024});
    assert.equal(preflight.identities.timeline.sha256, digest(committedTimeline), 'Installed timeline must match the committed real source, without overrides');
    report.installedProductHashes = Object.fromEntries(await Promise.all(['index.html', 'site-entry.js',
      'conference/player.js', 'conference/media.js', 'conference/timeline.js']
      .map(async file => [file, digest(await readFile(resolve(dist, file)))])));
    const plan = buildConferenceMediaPlaybackPlan({timeline, manifest}); report.plan = plan;
    const installed = await startServer('installed'); report.http = await auditConferenceMediaHttp({origin:installed.origin, preflight});
    assert.equal(report.http.passed, true, 'Installed media HTTP audit: ' + JSON.stringify(report.http.errors));
    try { await access(browser, constants.X_OK); }
    catch {
      report.status = 'skipped'; report.skipReason = 'Configured browser executable is unavailable: ' + browser;
      report.unexecuted = ['all actual browser playback, continuity and fallback cases']; return report;
    }
    browserProfile = await mkdtemp(resolve(tmpdir(), 'atlas-conference-media-'));
    child = spawn(browser, ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
      '--no-first-run', '--hide-scrollbars', headlessWindowArgument, '--remote-debugging-port=0', '--user-data-dir=' + browserProfile, 'about:blank'],
    {stdio:['ignore', 'ignore', 'pipe']});
    child.once('error', error => { spawnError = error; }); child.stderr.on('data', bytes => { stderr += bytes; });
    report.browserLaunched = true;
    const endpoint = await until(() => {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error('Chrome exited ' + child.exitCode + ': ' + stderr.slice(-2000));
      return stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)?.[1];
    }, 'Chrome CDP');
    debugOrigin = new URL(endpoint).origin.replace('ws:', 'http:'); browserCdp = await Cdp.connect(endpoint);
    report.browserVersion = await browserCdp.send('Browser.getVersion');
    for (const deck of plan.decks) await runCase('slides-' + deck.id, 'installed', async (page, server, entry) => {
      await navigate(page, server, 0, deck.id, plan.sessions[0]); entry.transitions = []; entry.baselines = [];
      await evaluate(page.cdp, () => document.activeElement?.blur());
      for (let i = 0; i < deck.steps.length; i++) {
        const step = deck.steps[i], session = plan.sessions.find(item => step.t0 >= item.t0 && step.t0 < item.t1);
        assert.ok(session, 'Every mapped page uses its original event-time session');
        let armed = await evaluate(page.cdp, armConferenceSlideObservation, {expected:{...step, deckId:deck.id}, mode:i === 0 ? 'entry' : 'transition'});
        const record = {...step, observation:armed};
        (armed.mode === 'baseline' ? entry.baselines : entry.transitions).push(record);
        await beginSeek(page.cdp, 'page-' + deck.id + '-' + step.page);
        if (armed.mode === 'baseline') {
          // Already-selected first pages are decoded as a baseline. Re-seek
          // that same mapped page through its real control to verify the exact
          // event target without sending ] and skipping the first step.
          await click(page.cdp, '[data-action=slide]');
        } else {
          await page.cdp.send('Input.dispatchKeyEvent', {type:'keyDown', key:']', code:'BracketRight', windowsVirtualKeyCode:221});
          await page.cdp.send('Input.dispatchKeyEvent', {type:'keyUp', key:']', code:'BracketRight', windowsVirtualKeyCode:221});
        }
        let measured = await until(() => evaluate(page.cdp, () => window.__conferenceSlideMeasurement), 'decoded mapped page ' + step.file);
        Object.assign(record, measured);
        assert.equal(measured.error, undefined, 'Actual WebP decode must succeed');
        const snapshot = await finishSeek(page, session, step.t0, manifest.settings), asset = manifest.assets.find(asset => asset.file === step.file);
        if (armed.mode === 'baseline') {
          // The first baseline may finish while click() positions the pointer.
          // Decode the post-click generation too, including a same-URL image
          // replacement, instead of reusing a pre-input decode receipt.
          record.initialBaselineDecode = measured;
          armed = await evaluate(page.cdp, armConferenceSlideObservation, {expected:{...step, deckId:deck.id}, mode:'baseline'});
          record.postSeekObservation = armed;
          measured = await until(() => evaluate(page.cdp, () => window.__conferenceSlideMeasurement), 'decoded baseline after exact page seek ' + step.file);
          Object.assign(record, measured);
        }
        assertConferenceSlideReceipt({armed, measured, snapshot, asset, step, deckId:deck.id});
      }
      entry.mappedPages = entry.baselines.length + entry.transitions.length;
      assert.equal(entry.mappedPages, deck.steps.length, 'Every mapped page has baseline or transition evidence');
    });
    await runCase('session-seek-and-play', 'installed', async (page, server, entry) => {
      const initial = await navigate(page, server, 0, plan.decks[0].id, plan.sessions[0]); entry.sessions = [];
      for (let i = 0; i < plan.sessions.length; i++) {
        const session = plan.sessions[i]; let sought = initial;
        if (i) {
          await beginSeek(page.cdp, 'next-program-' + session.id);
          await click(page.cdp, '[data-action=next-talk]');
          sought = await finishSeek(page, session, session.t0, manifest.settings);
        }
        const played = await playAndAdvance(page.cdp);
        await click(page.cdp, '[data-action=play]');
        assert.equal((await evaluate(page.cdp, inspect)).audio.paused, true);
        entry.sessions.push({id:session.id, sought, played});
      }
      // A backward program seek must also reset the explicit session offset.
      const previous = plan.sessions.at(-2); await beginSeek(page.cdp, 'previous-program-' + previous.id);
      await click(page.cdp, '[data-action=previous-talk]');
      entry.backwardSeek = await finishSeek(page, previous, previous.t0, manifest.settings);
    });
    for (const boundary of plan.boundaries) await runCase('boundary-' + boundary.from.talkId + '-' + boundary.to.talkId, 'installed', async (page, server, entry) => {
      await navigate(page, server, boundary.eventTime - 1.5, plan.decks[0].id, boundary.from);
      await playAndAdvance(page.cdp, 0.1); await evaluate(page.cdp, beginAudioProbe, plan.sessions);
      const after = await until(async () => { const state = await evaluate(page.cdp, inspect);
        return assetFile(state.audio.currentSrc) === boundary.to.file && !state.audio.paused && state.state.playing === 'true' && state.audio.currentTime >= 0.3 && state;
      }, 'automatic session rollover ' + boundary.to.id);
      entry.evidence = await evaluate(page.cdp, () => window.__conferenceAudioProbe.stop());
      assert.ok(entry.evidence.samples.some(item => assetFile(item.src) === boundary.from.file), 'Observe outgoing session before boundary');
      assert.ok(entry.evidence.samples.some(item => assetFile(item.src) === boundary.to.file && item.currentTime >= 0.3), 'Observe incoming session clock');
      assert.ok(entry.evidence.events.some(item => item.type === 'ended'), 'Native ended must drive session rollover');
      assert.equal(after.h1Count, 1); assert.equal(after.audio.error, null);
      assert.ok(Number(after.state.time) >= boundary.eventTime, 'Session event clock advances across boundary');
      entry.after = after; await click(page.cdp, '[data-action=play]');
    });
    for (const join of plan.sourceJoins) await runCase('source-join-' + join.sessionId + '-' + join.eventTime, 'installed', async (page, server, entry) => {
      const session = plan.sessions.find(item => item.id === join.sessionId);
      await navigate(page, server, join.eventTime - 2, plan.decks[0].id, session);
      await playAndAdvance(page.cdp, 0.1); await evaluate(page.cdp, beginAudioProbe, plan.sessions);
      await until(async () => { const state = await evaluate(page.cdp, inspect); return assetFile(state.audio.currentSrc) === join.file && state.audio.currentTime + session.t0 > join.eventTime + 1; }, 'native clock crosses original source join');
      entry.evidence = await evaluate(page.cdp, () => window.__conferenceAudioProbe.stop());
      entry.continuity = assertConferenceSourceJoinEvidence(entry.evidence, join);
      await click(page.cdp, '[data-action=play]');
    });
    for (const mode of ['missing', 'unavailable']) await runCase(mode + '-fallback', mode, async (page, server, entry) => {
      const state = await navigate(page, server, plan.fallbackTime, plan.decks[0].id);
      assert.match(state.stateTitle, /장표 이미지 없음/); assert.match(state.notice, /오디오 없음/);
      assert.equal(state.image.src, null); assert.equal(state.audio.src, null); assert.equal(state.playDisabled, true);
      assert.equal(state.captionEnabled, true); entry.fallback = state;
      await click(page.cdp, '[data-action=next-talk]'); const next = await evaluate(page.cdp, inspect);
      assert.match(next.stateTitle, /장표 이미지 없음/); assert.match(next.notice, /오디오 없음/);
      assert.equal(next.image.src, null); assert.equal(next.audio.src, null); assert.equal(next.h1Count, 1);
    });
    assert.equal(report.cases.length, plan.decks.length + 1 + plan.boundaries.length + plan.sourceJoins.length + 2);
    const after = await inspectInstalledConferenceMedia({dist});
    report.sourceIntegrity = {unchangedDuringRun:after.passed && JSON.stringify(after.identities) === JSON.stringify(preflight.identities)
      && JSON.stringify(after.assets) === JSON.stringify(preflight.assets)};
    assert.equal(report.sourceIntegrity.unchangedDuringRun, true, 'Installed manifest, timeline and media did not change during verification');
    report.status = report.failures.length ? 'failed' : 'passed';
  } catch (error) { report.failures.push({id:'harness', error:String(error.stack || error)}); report.status = 'failed'; }
  finally {
    browserCdp?.close(); child?.kill('SIGTERM');
    for (const {server} of servers.values()) { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
    if (browserProfile) await rm(browserProfile, {recursive:true, force:true}).catch(() => {});
    report.finishedAt = new Date().toISOString(); report.exitCode = CONFERENCE_MEDIA_EXIT[report.status];
    report.counts = {cases:report.cases.length, passed:report.cases.filter(item => item.status === 'passed').length,
      failed:report.cases.filter(item => item.status === 'failed').length, skipped:report.status === 'skipped' ? 1 : 0};
    if (outputCreated) {
      await writeFile(resolve(out, 'chrome.stderr.log'), stderr);
      await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify({status:report.status, ...report.counts, failures:report.failures.length,
      browserLaunched:report.browserLaunched, reason:report.skipReason || report.failures[0]?.error || null,
      exitCode:report.exitCode, output:out}));
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const report = await verifyConferenceMediaBrowser(parseConferenceMediaArguments(process.argv.slice(2))); process.exitCode = report.exitCode; }
  catch (error) { console.error(String(error.stack || error)); process.exitCode = CONFERENCE_MEDIA_EXIT.failed; }
}
