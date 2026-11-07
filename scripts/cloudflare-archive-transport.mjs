import { createHash } from 'node:crypto';
import { canonicalForecastJson } from '../dist/forecast-records.js';
import { verifyEthereumProspectiveHandoff } from './ethereum-prospective-handoff.mjs';
import { CLOUDFLARE_ARCHIVE_PROVIDER, CLOUDFLARE_BUILD_UUID, normalizeEthereumArchiveHandoffContext } from './ethereum-archive-provider-identity.mjs';
import { boundedResponse } from './cloudflare-archive-build-api.mjs';

export const CLOUDFLARE_ARCHIVE_TRANSPORT = Object.freeze({ maximumObjects: 192, maximumDeltaBytes: 64 * 1024 * 1024,
  maximumObjectBytes: 8 * 1024 * 1024, maximumIndexBytes: 128 * 1024, expirationTtl: 2 * 24 * 60 * 60 });
const P = CLOUDFLARE_ARCHIVE_TRANSPORT, digest = /^[a-f0-9]{64}$/;
const json = value => Buffer.from(canonicalForecastJson(value) + '\n');
export const cloudflareArchiveSha = bytes => createHash('sha256').update(bytes).digest('hex');
const safePayload = path => path === 'handoff.json' || path === 'remote-read.json' || path === 'candidate/manifest.json' || /^candidate\/(manifests|pages)\/[a-f0-9]{64}\.json$/.test(path) || /^candidate\/objects\/[a-f0-9]{64}\.blob$/.test(path);

// Only the new immutable delta crosses KV. The complete prior archive stays in
// Git; the publisher reconstructs and re-verifies the original complete handoff.
export async function packCloudflareArchiveDelta({ handoff, previousFiles }) {
  const context = normalizeEthereumArchiveHandoffContext(handoff?.manifest?.context);
  if (context.provider !== CLOUDFLARE_ARCHIVE_PROVIDER) throw new Error('Cloudflare transport requires an explicit Cloudflare preparation identity');
  const verified = await verifyEthereumProspectiveHandoff({ files: handoff.files, expectedDigest: handoff.digest, context });
  if (!(previousFiles instanceof Map) || previousFiles.size !== verified.previousFiles.size || [...previousFiles].some(([path, value]) => !value.equals(verified.previousFiles.get(path) ?? Buffer.alloc(0)))) throw new Error('Cloudflare delta predecessor differs from the verified handoff');
  const objects = new Map(), entries = [];
  let total = 0;
  for (const [path, value] of [...handoff.files].sort(([a], [b]) => a.localeCompare(b))) {
    if (path.startsWith('candidate/') && previousFiles.get(path.slice(10))?.equals(value)) continue;
    const sha256 = cloudflareArchiveSha(value);
    if (!safePayload(path) || value.length > P.maximumObjectBytes) throw new Error('Unsafe Cloudflare handoff delta object');
    if (!objects.has(sha256)) { objects.set(sha256, value); total += value.length; }
    entries.push({ path, bytes: value.length, sha256 });
  }
  if (objects.size > P.maximumObjects || entries.length > P.maximumObjects + 2 || total > P.maximumDeltaBytes) throw new Error('Cloudflare free handoff delta budget exhausted; retained evidence cannot be pruned');
  const index = { schemaVersion: 1, kind: 'atlas-cloudflare-archive-delta', context, handoffSha256: handoff.digest,
    previousManifestId: handoff.manifest.previousManifestId, entries, objects: objects.size, bytes: total };
  const indexBytes = json(index);
  if (indexBytes.length > P.maximumIndexBytes) throw new Error('Cloudflare handoff index budget exhausted');
  return { index, indexBytes, indexSha256: cloudflareArchiveSha(indexBytes), objects };
}

export async function restoreCloudflareArchiveDelta({ indexBytes, expectedIndexSha256, expectedHandoffSha256, context, previousFiles, getObject }) {
  if (!Buffer.isBuffer(indexBytes) || indexBytes.length > P.maximumIndexBytes || !digest.test(expectedIndexSha256) || cloudflareArchiveSha(indexBytes) !== expectedIndexSha256) throw new Error('Cloudflare handoff index differs from trusted build evidence');
  const index = JSON.parse(indexBytes.toString('utf8'));
  if (!json(index).equals(indexBytes) || index.schemaVersion !== 1 || index.kind !== 'atlas-cloudflare-archive-delta' ||
      canonicalForecastJson(index.context) !== canonicalForecastJson(normalizeEthereumArchiveHandoffContext(context)) || index.context.provider !== CLOUDFLARE_ARCHIVE_PROVIDER ||
      index.handoffSha256 !== expectedHandoffSha256 || !Array.isArray(index.entries) || index.entries.length > P.maximumObjects + 2 ||
      !Number.isSafeInteger(index.objects) || index.objects < 1 || index.objects > P.maximumObjects || !Number.isSafeInteger(index.bytes) || index.bytes < 1 || index.bytes > P.maximumDeltaBytes) throw new Error('Cloudflare handoff transport context or budget is invalid');
  if (!(previousFiles instanceof Map) || JSON.parse(previousFiles.get('manifest.json')?.toString('utf8') ?? 'null')?.id !== index.previousManifestId) throw new Error('Cloudflare handoff predecessor is not the selected original archive');
  const files = new Map([...previousFiles].map(([path, bytes]) => [`candidate/${path}`, bytes])), seen = new Set(), objects = new Map();
  let total = 0;
  for (const entry of index.entries) {
    if (!entry || Object.keys(entry).sort().join(',') !== 'bytes,path,sha256' || !safePayload(entry.path) || seen.has(entry.path) || !digest.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > P.maximumObjectBytes) throw new Error('Unsafe Cloudflare handoff delta descriptor');
    seen.add(entry.path);
    let bytes = objects.get(entry.sha256);
    if (!bytes) {
      bytes = await getObject(entry.sha256);
      if (!Buffer.isBuffer(bytes) || bytes.length !== entry.bytes || cloudflareArchiveSha(bytes) !== entry.sha256) throw new Error('Cloudflare handoff object bytes were substituted');
      total += bytes.length; if (total > P.maximumDeltaBytes) throw new Error('Cloudflare handoff download budget exhausted');
      objects.set(entry.sha256, bytes);
    } else if (bytes.length !== entry.bytes) throw new Error('Cloudflare handoff duplicate object descriptor differs');
    files.set(entry.path, bytes);
  }
  if (objects.size !== index.objects || total !== index.bytes) throw new Error('Cloudflare handoff delta inventory is incomplete');
  return verifyEthereumProspectiveHandoff({ files, expectedDigest: expectedHandoffSha256, context });
}

export function createCloudflareArchiveKV({ accountId, namespaceId, token, writable = false, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId) || !/^[a-f0-9]{32}$/.test(namespaceId) || typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('A dedicated free KV handoff namespace and scoped token are required');
  let operations = 0, uploaded = 0, downloaded = 0;
  const keyPath = key => {
    if (!/^archive\/(?:objects\/[a-f0-9]{64}|indices\/[a-f0-9-]{36}|publishers\/[a-f0-9-]{36})$/.test(key)) throw new Error('Unexpected Cloudflare handoff key');
    if (++operations > 2 * P.maximumObjects + 12) throw new Error('Cloudflare handoff operation budget exhausted');
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  };
  return {
    async get(key, maximumBytes = P.maximumObjectBytes) {
      const response = await fetchImpl(keyPath(key), { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Cloudflare handoff read HTTP ${response.status}`);
      const bytes = await boundedResponse(response, maximumBytes); downloaded += bytes.length;
      if (downloaded > P.maximumDeltaBytes + 2 * P.maximumIndexBytes) throw new Error('Cloudflare handoff read byte budget exhausted');
      return bytes;
    },
    async put(key, bytes) {
      if (!writable) throw new Error('The publisher KV client is read-only');
      if (!Buffer.isBuffer(bytes) || bytes.length > P.maximumObjectBytes || (uploaded += bytes.length) > P.maximumDeltaBytes + 2 * P.maximumIndexBytes) throw new Error('Cloudflare handoff upload byte budget exhausted');
      const response = await fetchImpl(`${keyPath(key)}?expiration_ttl=${P.expirationTtl}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: bytes, redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Cloudflare handoff write HTTP ${response.status}`);
      const result = JSON.parse((await boundedResponse(response, 64 * 1024)).toString('utf8'));
      if (result.success !== true || result.errors?.length) throw new Error('Cloudflare handoff write was not successful');
    },
  };
}
