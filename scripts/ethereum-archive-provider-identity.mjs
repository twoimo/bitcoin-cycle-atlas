import { canonicalForecastJson } from '../dist/forecast-records.js';

export const CLOUDFLARE_ARCHIVE_PROVIDER = 'cloudflare-workers-builds';
export const CLOUDFLARE_BUILD_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const commit = /^[a-f0-9]{40}$/;
const repository = 'twoimo/bitcoin-cycle-atlas';
const archiveBranch = 'eth-prospective-archive';
const copy = value => JSON.parse(canonicalForecastJson(value));
const exact = (value, keys, label) => {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new TypeError(`Unexpected ${label} fields`);
};

// Historical GitHub receipts keep their original three fields and numeric run
// ID. New Cloudflare receipts explicitly name their provider and retain its raw
// UUID. Neither provider's identifier is converted into the other's namespace.
export function normalizeEthereumArchiveSource(source, { allowLocal = true } = {}) {
  const cloudflare = source?.provider === CLOUDFLARE_ARCHIVE_PROVIDER;
  exact(source, ['sourceCommit', 'sourceTree', 'runId', ...(cloudflare ? ['provider'] : [])], 'archive source');
  const validRun = cloudflare ? typeof source.runId === 'string' && CLOUDFLARE_BUILD_UUID.test(source.runId)
    : allowLocal && source.runId === null || typeof source.runId === 'string' && /^\d{1,24}$/.test(source.runId);
  if (!commit.test(source.sourceCommit) || !commit.test(source.sourceTree) || !validRun) throw new TypeError('Exact committed archive source and provider run identity required');
  return copy(source);
}

function branchContext(value) {
  if (value.repository !== repository || typeof value.defaultBranch !== 'string' || !value.defaultBranch ||
      value.ref !== `refs/heads/${value.defaultBranch}` || value.defaultBranch === archiveBranch ||
      /[\x00-\x20~^:?*\[\\]/.test(value.defaultBranch) || value.defaultBranch.includes('..')) {
    throw new Error('Archive publication requires the intended repository and a scheduled/manual default-branch context');
  }
}

export function normalizeEthereumArchiveHandoffContext(value) {
  const cloudflare = value?.provider === CLOUDFLARE_ARCHIVE_PROVIDER;
  exact(value, ['repository', 'eventName', 'ref', 'defaultBranch', 'sourceCommit', 'sourceTree', 'runId', 'acquisitionOutcome', ...(cloudflare ? ['provider', 'triggerId'] : ['runAttempt'])], 'handoff context');
  branchContext(value);
  normalizeEthereumArchiveSource(ethereumArchiveSourceFromContext(value), { allowLocal: false });
  if (cloudflare) {
    if (!['deploy_hook', 'manual', 'api'].includes(value.eventName) || !CLOUDFLARE_BUILD_UUID.test(value.triggerId)) throw new Error('Exact Cloudflare manual/deploy-hook build and trigger identity required');
  } else if (!['schedule', 'workflow_dispatch'].includes(value.eventName) || typeof value.runAttempt !== 'string' || !/^[1-9]\d{0,9}$/.test(value.runAttempt)) {
    throw new Error('Handoff requires the exact daily default-branch run, attempt, source and acquisition outcome');
  }
  if (!['success', 'failure'].includes(value.acquisitionOutcome)) throw new Error('Handoff requires the actual acquisition outcome');
  return copy(value);
}

export function ethereumArchiveSourceFromContext(context) {
  return { sourceCommit: context.sourceCommit, sourceTree: context.sourceTree, runId: context.runId,
    ...(context.provider === CLOUDFLARE_ARCHIVE_PROVIDER ? { provider: CLOUDFLARE_ARCHIVE_PROVIDER } : {}) };
}

export function ethereumArchivePublicationContext(context) {
  const common = { repository: context.repository, eventName: context.eventName, ref: context.ref, defaultBranch: context.defaultBranch };
  return context.provider === CLOUDFLARE_ARCHIVE_PROVIDER ? { ...common, ...ethereumArchiveSourceFromContext(context), triggerId: context.triggerId } : common;
}

export function validateEthereumArchivePublicationContext(context, source) {
  branchContext(context ?? {});
  if (context?.provider === CLOUDFLARE_ARCHIVE_PROVIDER) {
    exact(context, ['repository', 'eventName', 'ref', 'defaultBranch', 'sourceCommit', 'sourceTree', 'runId', 'provider', 'triggerId'], 'Cloudflare publication context');
    if (!['deploy_hook', 'manual', 'api'].includes(context.eventName) || !CLOUDFLARE_BUILD_UUID.test(context.triggerId)) throw new Error('Exact Cloudflare archive publication trigger required');
    normalizeEthereumArchiveSource(ethereumArchiveSourceFromContext(context), { allowLocal: false });
    if (source && canonicalForecastJson(source) !== canonicalForecastJson(ethereumArchiveSourceFromContext(context))) throw new Error('Cloudflare archive context and source differ');
  } else if (context?.provider !== undefined || source?.provider !== undefined || !['schedule', 'workflow_dispatch'].includes(context.eventName)) {
    throw new Error('Archive publication requires a scheduled/manual default-branch context or an explicit Cloudflare context');
  }
}
