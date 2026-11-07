import { CLOUDFLARE_ARCHIVE_PROVIDER, CLOUDFLARE_BUILD_UUID, normalizeEthereumArchiveHandoffContext } from './ethereum-archive-provider-identity.mjs';

const sha = /^[a-f0-9]{40}$/;
const repository = 'twoimo/bitcoin-cycle-atlas';
const api = 'https://api.cloudflare.com/client/v4';

export async function boundedResponse(response, maximumBytes) {
  if (Number(response.headers.get('content-length')) > maximumBytes) throw new Error('Cloudflare response exceeds its byte budget');
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) throw new Error('Cloudflare response exceeds its byte budget');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally { await reader.cancel().catch(() => {}); }
}

export function cloudflareArchiveContextFromBuild({ build, buildId, triggerId, sourceCommit, sourceTree, defaultBranch = 'main', completed = false, acquisitionOutcome = 'success' }) {
  if (!CLOUDFLARE_BUILD_UUID.test(buildId) || !CLOUDFLARE_BUILD_UUID.test(triggerId) || !sha.test(sourceCommit) || !sha.test(sourceTree)) throw new Error('Exact Cloudflare build, trigger and Git identities are required');
  const metadata = build?.build_trigger_metadata, trigger = build?.trigger;
  if (build?.build_uuid !== buildId || trigger?.trigger_uuid !== triggerId || metadata?.commit_hash !== sourceCommit ||
      metadata?.branch !== defaultBranch || metadata?.provider_type !== 'github' ||
      `${metadata?.provider_account_name}/${metadata?.repo_name}`.toLowerCase() !== repository ||
      trigger?.repo_connection?.provider_type !== 'github' ||
      `${trigger?.repo_connection?.provider_account_name}/${trigger?.repo_connection?.repo_name}`.toLowerCase() !== repository ||
      !['deploy_hook', 'manual', 'api'].includes(metadata?.build_trigger_source) || build.pull_request) {
    throw new Error('Cloudflare API build metadata does not identify the intended repository, source and scheduled/manual trigger');
  }
  if (completed ? build.status !== 'stopped' || build.build_outcome !== 'success' || !Number.isFinite(Date.parse(build.stopped_on))
    : !['running', 'stopped'].includes(build.status) || build.status === 'stopped' && build.build_outcome !== 'success') {
    throw new Error('Cloudflare preparation build is not in the required actual execution state');
  }
  return normalizeEthereumArchiveHandoffContext({ provider: CLOUDFLARE_ARCHIVE_PROVIDER, repository, eventName: metadata.build_trigger_source,
    ref: `refs/heads/${defaultBranch}`, defaultBranch, sourceCommit, sourceTree, runId: buildId, triggerId, acquisitionOutcome });
}

export function createCloudflareBuildReader({ accountId, token, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId) || typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('A Cloudflare account and scoped Builds read token are required');
  let requests = 0, bytes = 0;
  async function request(path) {
    if (++requests > 36) throw new Error('Cloudflare build evidence request budget exhausted');
    const response = await fetchImpl(`${api}/accounts/${accountId}/builds/${path}`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Cloudflare build evidence HTTP ${response.status}`);
    const body = await boundedResponse(response, 2 * 1024 * 1024);
    bytes += body.length; if (bytes > 16 * 1024 * 1024) throw new Error('Cloudflare build evidence byte budget exhausted');
    const envelope = JSON.parse(body.toString('utf8'));
    if (envelope.success !== true || envelope.errors?.length) throw new Error('Cloudflare build evidence was not successful');
    return envelope.result;
  }
  return {
    async build(id) { if (!CLOUDFLARE_BUILD_UUID.test(id)) throw new Error('Invalid Cloudflare build UUID'); return request(`builds/${id}`); },
    async preparedReceipt(id) {
      if (!CLOUDFLARE_BUILD_UUID.test(id)) throw new Error('Invalid Cloudflare build UUID');
      let cursor = null, found = null;
      const seen = new Set();
      for (let page = 0; page < 32; page++) {
        const result = await request(`builds/${id}/logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        if (!Array.isArray(result?.lines)) throw new Error('Cloudflare preparation log lines are missing');
        for (const row of result.lines) {
          if (!Array.isArray(row) || !Number.isFinite(row[0]) || typeof row[1] !== 'string') throw new Error('Cloudflare preparation log shape is invalid');
          const line = row[1].trim();
          if (line.startsWith('ATLAS_ARCHIVE_PREPARED ')) {
            if (found) throw new Error('Cloudflare preparation emitted more than one trusted handoff identity');
            found = JSON.parse(line.slice('ATLAS_ARCHIVE_PREPARED '.length));
          }
        }
        if (!result.cursor || !result.lines.length || result.cursor === cursor && result.truncated !== true) {
          if (result.truncated === true) throw new Error('Cloudflare preparation logs were truncated without a usable cursor');
          if (!found) throw new Error('Cloudflare preparation log does not contain its sealed handoff identity');
          return found;
        }
        if (typeof result.cursor !== 'string' || result.cursor.length > 2048 || seen.has(result.cursor)) throw new Error('Cloudflare preparation log cursor is invalid');
        seen.add(result.cursor); cursor = result.cursor;
      }
      throw new Error('Cloudflare preparation log pagination budget exhausted');
    },
  };
}

export async function queueCloudflareArchivePublisher({ hookUrl, fetchImpl = fetch }) {
  const url = new URL(hookUrl);
  if (url.origin !== 'https://api.cloudflare.com' || !/^\/client\/v4\/workers\/builds\/deploy_hooks\/[a-f0-9-]{36}$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error('A scoped Cloudflare publisher Deploy Hook is required');
  const response = await fetchImpl(url.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Cloudflare publisher hook HTTP ${response.status}`);
  const body = JSON.parse((await boundedResponse(response, 64 * 1024)).toString('utf8'));
  if (body.success !== true || body.errors?.length || !CLOUDFLARE_BUILD_UUID.test(body.result?.build_uuid) || body.result?.already_exists === true || body.result?.branch && body.result.branch !== 'main') throw new Error('Publisher hook did not create a distinct default-branch build');
  return body.result.build_uuid;
}
