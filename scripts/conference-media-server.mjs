// P1c-B local delivery checks. This module never writes the installed package.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat, open, readFile, readdir, realpath} from 'node:fs/promises';
import {extname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {validateConferenceMediaManifest} from '../dist/conference/media.js';
import {validateConferenceTimeline} from '../dist/conference/timeline.js';

export const CONFERENCE_MEDIA_PREFIX = '/bitcoin-cycle-atlas';
const manifestPath = 'conference/media-manifest.json', timelinePath = 'conference/timeline.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mime = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.m4a':'audio/mp4',
  '.wav':'audio/wav', '.mp3':'audio/mpeg', '.opus':'audio/ogg', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2'};
const confined = (root, file) => {
  const rel = relative(root, file);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};
const failure = (code, message) => Object.assign(new Error(message), {code});

async function confinedFile(root, name) {
  if (typeof name !== 'string' || !name || isAbsolute(name) || /[\\\u0000-\u001f\u007f]/.test(name)
      || name.split('/').some(part => !part || part === '.' || part === '..')) throw failure('FORBIDDEN', 'Unsafe relative path');
  let file = root;
  for (const part of name.split('/')) {
    file = join(file, part);
    if ((await lstat(file)).isSymbolicLink()) throw failure('FORBIDDEN', 'Symbolic links are not served or verified');
  }
  file = await realpath(file);
  if (!confined(root, file) || !(await lstat(file)).isFile()) throw failure('FORBIDDEN', 'Expected a confined regular file');
  return file;
}

async function fileIdentity(root, name) {
  const file = await confinedFile(root, name), digest = createHash('sha256');
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    for await (const bytes of handle.createReadStream({autoClose:false})) digest.update(bytes);
    return {file:name, bytes:info.size, sha256:digest.digest('hex')};
  } finally { await handle.close(); }
}

async function inventory(root, prefix = '') {
  const files = [];
  for (const entry of (await readdir(join(root, prefix), {withFileTypes:true})).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw failure('FORBIDDEN', 'Symbolic link in site inventory: ' + name);
    if (entry.isDirectory()) files.push(...await inventory(root, name));
    else if (entry.isFile()) files.push(name);
    else throw failure('FORBIDDEN', 'Non-regular site asset: ' + name);
  }
  return files;
}

export async function inspectInstalledConferenceMedia({dist}) {
  const result = {status:'failed', passed:false, skipped:false, reason:null, errors:[],
    dist:resolve(dist), manifest:null, timeline:null, identities:{manifest:null, timeline:null},
    counts:null, assets:[]};
  const fail = (code, path, message) => result.errors.push({code, path, message});
  const skip = reason => Object.assign(result, {status:'skipped', skipped:true, reason});
  try {
    const root = await realpath(result.dist);
    const timelineBytes = await readFile(await confinedFile(root, timelinePath));
    result.identities.timeline = {file:timelinePath, bytes:timelineBytes.length, sha256:hash(timelineBytes)};
    try { result.timeline = JSON.parse(timelineBytes); }
    catch { fail('timeline_json', timelinePath, 'Installed timeline is not valid JSON'); return result; }
    const timelineValidation = validateConferenceTimeline(result.timeline);
    if (!timelineValidation.valid) {
      fail('timeline_schema', timelinePath, JSON.stringify(timelineValidation.errors)); return result;
    }
    let manifestBytes;
    try { manifestBytes = await readFile(await confinedFile(root, manifestPath)); }
    catch (error) {
      if (error.code === 'ENOENT') return skip('media-manifest.json is not installed');
      throw error;
    }
    result.identities.manifest = {file:manifestPath, bytes:manifestBytes.length, sha256:hash(manifestBytes)};
    try { result.manifest = JSON.parse(manifestBytes); }
    catch { fail('manifest_json', manifestPath, 'Installed media manifest is not valid JSON'); return result; }
    const validation = validateConferenceMediaManifest(result.manifest, {timeline:result.timeline,
      timelineSha256:result.identities.timeline.sha256, manifestBytes:manifestBytes.length});
    result.counts = {...validation.summary, verifiedAssetCount:0};
    if (!validation.valid) { result.errors.push(...validation.errors); return result; }
    if (!validation.available) return skip('media manifest declares unavailable; real media checks were not run');
    if (result.manifest.timeline.bytes !== timelineBytes.length) fail('timeline_bytes', timelinePath, 'Timeline byte count differs from the ready manifest');
    for (const asset of result.manifest.assets) {
      try {
        const observed = await fileIdentity(root, 'conference/' + asset.file);
        const passed = observed.bytes === asset.bytes && observed.sha256 === asset.sha256;
        result.assets.push({...observed, kind:asset.kind, passed});
        if (passed) result.counts.verifiedAssetCount++;
        else fail('asset_identity', observed.file, 'Installed asset bytes or SHA-256 differs from the ready manifest');
      } catch (error) { fail('asset_read', asset.file, error.message); }
    }
    const files = await inventory(root), planned = new Set(result.manifest.assets.map(asset => 'conference/' + asset.file));
    planned.add(manifestPath);
    const mediaFiles = files.filter(file => file.startsWith('conference/pages/') || file.startsWith('conference/audio/'));
    for (const file of mediaFiles) if (!planned.has(file)) fail('unexpected_media', file, 'Installed media is not declared in the ready manifest');
    result.counts.observedSiteFileCount = files.length;
    result.counts.observedMediaFileCount = mediaFiles.length;
    if (files.length !== result.manifest.totals.siteFileCount) fail('site_file_count', 'dist', 'Installed site count differs from the ready manifest');
    if (!result.errors.length) Object.assign(result, {status:'passed', passed:true});
  } catch (error) { fail('installed_package', 'dist', error.message); }
  return result;
}

// Strict single-range delivery, including open-ended and suffix forms. BigInt
// prevents a huge header integer from losing precision before EOF checks.
export function parseConferenceByteRange(header, size) {
  if (header === undefined) return {status:200, start:0, end:size - 1, length:size};
  const match = typeof header === 'string' && /^bytes=(\d*)-(\d*)$/.exec(header);
  const invalid = () => ({status:416, length:0, contentRange:'bytes */' + size});
  if (!match || (!match[1] && !match[2]) || size === 0) return invalid();
  const length = BigInt(size);
  let start, end;
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return invalid();
    start = suffix >= length ? 0n : length - suffix; end = length - 1n;
  } else {
    start = BigInt(match[1]); end = match[2] ? BigInt(match[2]) : length - 1n;
    if (start >= length || end < start) return invalid();
    if (end >= length) end = length - 1n;
  }
  return {status:206, start:Number(start), end:Number(end), length:Number(end - start + 1n),
    contentRange:'bytes ' + start + '-' + end + '/' + size};
}

function requestPath(url) {
  const raw = String(url || '').split('?')[0];
  let path;
  try { path = decodeURIComponent(raw); }
  catch { throw failure('BAD_REQUEST', 'Invalid URL encoding'); }
  if (!path.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(path)
      || path.split('/').some(part => part === '.' || part === '..')) throw failure('BAD_REQUEST', 'Unsafe URL path');
  if (path !== CONFERENCE_MEDIA_PREFIX && !path.startsWith(CONFERENCE_MEDIA_PREFIX + '/')) throw failure('ENOENT', 'Unknown local site prefix');
  path = path.slice(CONFERENCE_MEDIA_PREFIX.length) || '/';
  if (path.endsWith('/')) path += 'index.html';
  return path.slice(1);
}

export function createConferenceMediaServer({dist, mode = 'installed'}) {
  if (!['installed','missing','unavailable'].includes(mode)) throw new TypeError('Unknown conference media server mode');
  const rootPromise = realpath(resolve(dist)), receipts = [];
  // Attach a rejection owner before the first request, even if listen fails.
  rootPromise.catch(() => {});
  const server = createServer(async (request, response) => {
    const started = performance.now();
    const receipt = {method:request.method, url:request.url, path:null, mode, range:request.headers.range || null,
      status:null, contentType:null, contentLength:null, contentRange:null, acceptRanges:null,
      contentEncoding:null, bytesSent:0, complete:false, aborted:false, startedAt:new Date().toISOString()};
    receipts.push(receipt);
    let completed = false, handle, stream;
    const record = (final = false) => {
      if (completed) return;
      Object.assign(receipt, {status:response.headersSent ? response.statusCode : null, complete:response.writableFinished,
        contentType:response.getHeader('Content-Type') || null, contentLength:Number(response.getHeader('Content-Length') || 0),
        contentRange:response.getHeader('Content-Range') || null, acceptRanges:response.getHeader('Accept-Ranges') || null,
        contentEncoding:response.getHeader('Content-Encoding') || null, durationMs:performance.now() - started});
      if (final) { receipt.aborted = !response.writableFinished; completed = true; }
    };
    response.once('finish', () => record(true)); response.once('close', () => { stream?.destroy(); record(true); });
    const sendHeaders = (status, headers) => {
      if (response.destroyed) return;
      for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
      response.writeHead(status); record();
    };
    const buffer = (status, bytes, headers = {}) => {
      if (response.destroyed) return;
      sendHeaders(status, {'Cache-Control':'no-store', 'Content-Length':bytes.length, ...headers});
      receipt.bytesSent = request.method === 'HEAD' ? 0 : bytes.length;
      response.end(request.method === 'HEAD' ? undefined : bytes);
    };
    try {
      if (!['GET','HEAD'].includes(request.method)) { buffer(405, Buffer.alloc(0), {Allow:'GET, HEAD'}); return; }
      const root = await rootPromise, name = requestPath(request.url); receipt.path = name;
      if (mode !== 'installed' && (name.startsWith('conference/pages/') || name.startsWith('conference/audio/'))) {
        buffer(404, Buffer.from('Media intentionally unavailable')); return;
      }
      if (name === manifestPath && mode === 'missing') { buffer(404, Buffer.from('Media manifest intentionally absent')); return; }
      if (name === manifestPath && mode === 'unavailable') {
        const timeline = JSON.parse(await readFile(await confinedFile(root, timelinePath)));
        const bytes = Buffer.from(JSON.stringify({schemaVersion:1, kind:'atlas-conference-media', eventId:timeline.event.id,
          status:'unavailable', decks:[], audio:[], assets:[]}) + '\n');
        buffer(200, bytes, {'Content-Type':mime['.json']}); return;
      }
      const file = await confinedFile(root, name);
      if (response.destroyed) return;
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      if (response.destroyed) { await handle.close(); handle = null; return; }
      // RFC 9110 §14.2: Range is defined for GET and is ignored for HEAD.
      const size = (await handle.stat()).size, range = parseConferenceByteRange(request.method === 'GET' ? request.headers.range : undefined, size);
      if (response.destroyed) { await handle.close(); handle = null; return; }
      const headers = {'Content-Type':mime[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length':range.length, 'Accept-Ranges':'bytes', 'Cache-Control':'no-store',
        ...(range.contentRange ? {'Content-Range':range.contentRange} : {})};
      sendHeaders(range.status, headers);
      if (request.method === 'HEAD' || range.length === 0) { await handle.close(); handle = null; response.end(); return; }
      stream = handle.createReadStream({start:range.start, end:range.end}); handle = null;
      stream.on('data', bytes => { receipt.bytesSent += bytes.length; });
      stream.once('error', error => { receipt.error = error.message; response.destroy(error); });
      stream.pipe(response);
    } catch (error) {
      await handle?.close().catch(() => {});
      receipt.error = error.message;
      if (response.headersSent) response.destroy(error);
      else buffer(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404
        : error.code === 'BAD_REQUEST' ? 400 : error.code === 'FORBIDDEN' || error.code === 'ELOOP' ? 403 : 500,
      Buffer.from('Local asset unavailable'));
    }
  });
  return {server, receipts};
}

export async function auditConferenceMediaHttp({origin, preflight, dist = preflight?.dist}) {
  const result = {status:'failed', passed:false, skipped:false, reason:null, errors:[], images:[], sessions:[]};
  if (preflight?.status === 'skipped') return {...result, status:'skipped', skipped:true, reason:preflight.reason};
  if (!preflight?.passed) return {...result, reason:'Installed media preflight did not pass'};
  const root = await realpath(resolve(dist));
  const check = (condition, file, message) => { if (!condition) result.errors.push({file, message}); };
  const get = async (asset, method, range) => {
    const response = await fetch(origin + CONFERENCE_MEDIA_PREFIX + '/conference/' + asset.file,
      {method, headers:range ? {Range:range, 'Accept-Encoding':'identity'} : {'Accept-Encoding':'identity'}});
    const bytes = Buffer.from(await response.arrayBuffer());
    return {status:response.status, contentType:response.headers.get('content-type'),
      contentLength:Number(response.headers.get('content-length')), contentRange:response.headers.get('content-range'),
      acceptRanges:response.headers.get('accept-ranges'), contentEncoding:response.headers.get('content-encoding'), bytes};
  };
  for (const asset of preflight.manifest.assets) {
    try {
      const head = await get(asset, 'HEAD');
      check(head.status === 200 && head.contentLength === asset.bytes && head.bytes.length === 0, asset.file, 'HEAD status/length/body');
      check(head.acceptRanges === 'bytes' && !head.contentEncoding, asset.file, 'Byte ranges and identity encoding');
      check(head.contentType === (asset.kind === 'page' ? 'image/webp' : 'audio/mp4'), asset.file, 'Media MIME');
      const {bytes:ignored, ...metadata} = head;
      if (asset.kind === 'page') { result.images.push({file:asset.file, ...metadata}); continue; }
      const session = {file:asset.file, head:metadata, ranges:[]}; result.sessions.push(session);
      const ranges = ['bytes=0-' + Math.min(31, asset.bytes - 1), 'bytes=' + Math.max(0, asset.bytes - 32) + '-', 'bytes=-32'];
      const handle = await open(await confinedFile(root, 'conference/' + asset.file), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        for (const header of ranges) {
          const expected = parseConferenceByteRange(header, asset.bytes), received = await get(asset, 'GET', header);
          const local = Buffer.alloc(expected.length); await handle.read(local, 0, local.length, expected.start);
          check(received.status === 206 && received.contentLength === expected.length && received.contentRange === expected.contentRange,
            asset.file, header + ': partial status/headers');
          check(received.acceptRanges === 'bytes' && !received.contentEncoding && received.contentType === 'audio/mp4', asset.file, header + ': MIME/range/encoding');
          check(received.bytes.equals(local), asset.file, header + ': response bytes differ from installed asset');
          session.ranges.push({request:header, status:received.status, contentRange:received.contentRange,
            contentLength:received.contentLength, receivedBytes:received.bytes.length, sha256:hash(received.bytes), expectedSha256:hash(local)});
        }
      } finally { await handle.close(); }
      const unsatisfiable = await get(asset, 'GET', 'bytes=' + asset.bytes + '-');
      check(unsatisfiable.status === 416 && unsatisfiable.contentRange === 'bytes */' + asset.bytes
        && unsatisfiable.contentLength === 0 && unsatisfiable.bytes.length === 0, asset.file, 'Unsatisfiable range must return 416');
      session.unsatisfiable = {status:unsatisfiable.status, contentRange:unsatisfiable.contentRange, receivedBytes:unsatisfiable.bytes.length};
    } catch (error) { result.errors.push({file:asset.file, message:error.message}); }
  }
  result.counts = {images:result.images.length, sessions:result.sessions.length,
    ranges:result.sessions.reduce((sum, session) => sum + session.ranges.length, 0)};
  if (!result.errors.length) Object.assign(result, {status:'passed', passed:true});
  return result;
}
