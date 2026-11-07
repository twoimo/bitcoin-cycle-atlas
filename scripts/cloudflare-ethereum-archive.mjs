import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalForecastJson } from '../dist/forecast-records.js';
import { ETH_ARCHIVE_IO_PATHS as IO, readEthereumArchiveDirectory } from './manage-ethereum-prospective-archive.mjs';
import { readEthereumProspectiveArchiveRemote, publishEthereumProspectiveArchiveRemote, readGitArchiveObjects, saveRemote } from './ethereum-prospective-archive-remote.mjs';
import { sealEthereumHandoffFromRepository } from './ethereum-prospective-handoff.mjs';
import { restoreEthereumArchiveOperations, issueEthereumArchiveOperations, replayEthereumArchiveOperations, readinessEthereumArchiveOperations,
  appendEthereumArchiveOperations, verifyEthereumArchiveOperations, openEthereumActiveArchiveSource, ETH_ARCHIVE_OPERATION_PATHS } from './ethereum-prospective-archive-operations.mjs';
import { buildEthereumArchiveCapacityReport } from './ethereum-prospective-archive-capacity.mjs';
import { writeEthereumOperationJson } from './ethereum-prospective-operation-io.mjs';
import { CLOUDFLARE_BUILD_UUID, ethereumArchiveSourceFromContext, ethereumArchivePublicationContext, normalizeEthereumArchiveHandoffContext } from './ethereum-archive-provider-identity.mjs';
import { cloudflareArchiveContextFromBuild, createCloudflareBuildReader, queueCloudflareArchivePublisher } from './cloudflare-archive-build-api.mjs';
import { packCloudflareArchiveDelta, restoreCloudflareArchiveDelta, createCloudflareArchiveKV, CLOUDFLARE_ARCHIVE_TRANSPORT } from './cloudflare-archive-transport.mjs';
import { readCloudflareArchiveVerification } from './verify-cloudflare-archive.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const encoded = value => Buffer.from(canonicalForecastJson(value) + '\n');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 30_000 }).trim();
const required = name => { const value = process.env[name]; if (!value) throw new Error(`Missing build secret or setting: ${name}`); return value; };
const same = (a, b) => canonicalForecastJson(a) === canonicalForecastJson(b);
export function cloudflareArchiveRemainingBudget(build, verification, now = Date.now()) {
  // created_on includes the free plan's queued time. Only an actual execution
  // clock can bound installation, verification and publication in this build.
  const executionStart = Date.parse(build.initializing_on || build.running_on);
  const verificationStart = Date.parse(verification.startedAt);
  const start = Math.min(executionStart, verificationStart);
  const remaining = 19 * 60 * 1000 - (now - start);
  if (!Number.isFinite(executionStart) || !Number.isFinite(verificationStart) || start > now || !Number.isFinite(remaining) || remaining <= 0) throw new Error('Archive build has exhausted its free execution budget or has no valid execution clock');
  return remaining;
}
function enforceBuildDeadline(build, verification) {
  const remaining = cloudflareArchiveRemainingBudget(build, verification);
  const timer = setTimeout(() => { console.error('Archive build exceeded its total 19-minute execution budget'); process.exit(1); }, remaining);
  timer.unref();
}

export function assertCloudflareArchiveDispatch({ dispatch, trusted, publisherBuildId, sourceCommit, sourceTree }) {
  if (!dispatch || dispatch.schemaVersion !== 1 || dispatch.kind !== 'atlas-cloudflare-archive-dispatch' ||
      !CLOUDFLARE_BUILD_UUID.test(dispatch.preparationBuildId) || dispatch.publisherBuildId !== publisherBuildId ||
      dispatch.sourceCommit !== sourceCommit || dispatch.sourceTree !== sourceTree || !/^[a-f0-9]{64}$/.test(dispatch.indexSha256) ||
      !/^[a-f0-9]{64}$/.test(dispatch.handoffSha256) || dispatch.context?.runId !== dispatch.preparationBuildId ||
      dispatch.context?.sourceCommit !== sourceCommit || dispatch.context?.sourceTree !== sourceTree || !same(dispatch, trusted)) throw new Error('Archive dispatch differs from the exact completed preparation build log and publisher source');
  return normalizeEthereumArchiveHandoffContext(dispatch.context);
}

async function waitForKV(kv, key, maximumBytes) {
  // KV is eventually consistent. Missing bytes retry with a finite deadline;
  // a changed digest fails immediately after the bytes become visible.
  for (let attempt = 0; attempt < 5; attempt++) {
    const value = await kv.get(key, maximumBytes);
    if (value) return value;
    if (attempt < 4) await delay(15_000);
  }
  throw new Error('Prepared handoff did not become visible within the bounded KV propagation wait');
}

function environment(command) {
  if (process.version !== 'v24.22.2' || process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Archive execution requires canonical Node24.22.2 Linux/x64');
  if (process.env.WORKERS_CI !== '1') throw new Error('Archive publication requires an actual Cloudflare Workers Build');
  const identity = { sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}') };
  if (git('status', '--porcelain', '--untracked-files=no') || identity.sourceCommit !== required('WORKERS_CI_COMMIT_SHA') || required('WORKERS_CI_BRANCH') !== 'main') throw new Error('Archive execution requires the exact clean default-branch Cloudflare checkout');
  const buildId = required('WORKERS_CI_BUILD_UUID');
  if (!CLOUDFLARE_BUILD_UUID.test(buildId)) throw new Error('Cloudflare build UUID is invalid');
  const accountId = required('CLOUDFLARE_ACCOUNT_ID'), namespaceId = required('ATLAS_ARCHIVE_KV_NAMESPACE_ID');
  if (command === 'prepare' && (process.env.ETH_ARCHIVE_GITHUB_TOKEN || process.env.ATLAS_DATA_GITHUB_TOKEN)) throw new Error('Preparation must not receive a repository write credential');
  return { identity, buildId, reader: createCloudflareBuildReader({ accountId, token: required('ATLAS_BUILDS_READ_TOKEN') }),
    kv: createCloudflareArchiveKV({ accountId, namespaceId, token: required(command === 'prepare' ? 'ATLAS_ARCHIVE_KV_WRITE_TOKEN' : 'ATLAS_ARCHIVE_KV_READ_TOKEN'), writable: command === 'prepare' }),
    triggerId: required(command === 'prepare' ? 'ATLAS_ARCHIVE_PREPARE_TRIGGER_UUID' : 'ATLAS_ARCHIVE_PUBLISH_TRIGGER_UUID') };
}

async function readArchive() {
  return readEthereumProspectiveArchiveRemote({ token: process.env.ETH_ARCHIVE_READ_TOKEN ?? null,
    readGitObjects: options => readGitArchiveObjects({ root, ...options }) });
}

async function prepare() {
  const { identity, buildId, reader, kv, triggerId } = environment('prepare');
  const verification = await readCloudflareArchiveVerification({ ...identity, buildId });
  const build = await reader.build(buildId);
  enforceBuildDeadline(build, verification);
  let context = cloudflareArchiveContextFromBuild({ build, buildId, triggerId, ...identity });
  const sourceIdentity = ethereumArchiveSourceFromContext(context), args = { repositoryRoot: root, sourceIdentity };
  const remote = await readArchive(); await saveRemote(root, remote);
  await restoreEthereumArchiveOperations(args);
  const issuance = await issueEthereumArchiveOperations(args);
  const acquisitionOutcome = issuance.status === 'blocked' ? 'failure' : 'success';
  context = normalizeEthereumArchiveHandoffContext({ ...context, acquisitionOutcome });
  await replayEthereumArchiveOperations(args);
  await readinessEthereumArchiveOperations(args);
  const source = await openEthereumActiveArchiveSource(args);
  const capacity = await buildEthereumArchiveCapacityReport({ source, repositoryRoot: root, informationCutoffAt: new Date().toISOString() });
  await writeEthereumOperationJson(root, ETH_ARCHIVE_OPERATION_PATHS.capacity, capacity, { immutable: false });
  await appendEthereumArchiveOperations(args);
  await verifyEthereumArchiveOperations(args);
  const handoff = await sealEthereumHandoffFromRepository({ repositoryRoot: root, context });
  const previousFiles = await readEthereumArchiveDirectory(resolve(root, remote.receipt.status === 'restored' ? IO.remote : IO.seed));
  const delta = await packCloudflareArchiveDelta({ handoff, previousFiles });
  if (git('status', '--porcelain', '--untracked-files=no') || git('rev-parse', 'HEAD') !== identity.sourceCommit) throw new Error('Archive preparation source changed during validation');
  for (const [sha, bytes] of delta.objects) await kv.put(`archive/objects/${sha}`, bytes);
  await kv.put(`archive/indices/${buildId}`, delta.indexBytes);
  const publisherBuildId = await queueCloudflareArchivePublisher({ hookUrl: required('ATLAS_ARCHIVE_PUBLISH_DEPLOY_HOOK') });
  const dispatch = { schemaVersion: 1, kind: 'atlas-cloudflare-archive-dispatch', preparationBuildId: buildId, publisherBuildId,
    ...identity, context, indexSha256: delta.indexSha256, handoffSha256: handoff.digest };
  const dispatchBytes = encoded(dispatch);
  if (await kv.get(`archive/publishers/${publisherBuildId}`, CLOUDFLARE_ARCHIVE_TRANSPORT.maximumIndexBytes)) throw new Error('Publisher build already has a handoff; refusing to replace its identity');
  await kv.put(`archive/publishers/${publisherBuildId}`, dispatchBytes);
  await mkdir(resolve(root, 'build'), { recursive: true });
  await writeFile(resolve(root, 'build/cloudflare-archive-prepared.json'), dispatchBytes, { flag: 'wx' });
  // The publisher reads this exact small identity from authenticated Builds
  // logs only after Cloudflare reports this preparation completed successfully.
  console.log('ATLAS_ARCHIVE_PREPARED ' + canonicalForecastJson(dispatch));
}

async function publish() {
  const { identity, buildId, reader, kv, triggerId } = environment('publish');
  const verification = await readCloudflareArchiveVerification({ ...identity, buildId });
  const build = await reader.build(buildId);
  enforceBuildDeadline(build, verification);
  cloudflareArchiveContextFromBuild({ build, buildId, triggerId, ...identity });
  const dispatchBytes = await waitForKV(kv, `archive/publishers/${buildId}`, CLOUDFLARE_ARCHIVE_TRANSPORT.maximumIndexBytes);
  const dispatch = JSON.parse(dispatchBytes.toString('utf8'));
  if (!encoded(dispatch).equals(dispatchBytes) || !CLOUDFLARE_BUILD_UUID.test(dispatch?.preparationBuildId)) throw new Error('Publisher handoff pointer is noncanonical or invalid');
  const preparedBuild = await reader.build(dispatch.preparationBuildId);
  const context = cloudflareArchiveContextFromBuild({ build: preparedBuild, buildId: dispatch.preparationBuildId,
    triggerId: required('ATLAS_ARCHIVE_PREPARE_TRIGGER_UUID'), ...identity, completed: true, acquisitionOutcome: dispatch.context?.acquisitionOutcome });
  const trusted = await reader.preparedReceipt(dispatch.preparationBuildId);
  assertCloudflareArchiveDispatch({ dispatch, trusted, publisherBuildId: buildId, ...identity });
  if (!same(context, dispatch.context)) throw new Error('Handoff context differs from authenticated preparation metadata');
  const indexBytes = await waitForKV(kv, `archive/indices/${dispatch.preparationBuildId}`, CLOUDFLARE_ARCHIVE_TRANSPORT.maximumIndexBytes);
  const remote = await readArchive();
  const previousFiles = remote.receipt.status === 'restored' ? remote.files : await readEthereumArchiveDirectory(resolve(root, IO.seed));
  const restored = await restoreCloudflareArchiveDelta({ indexBytes, expectedIndexSha256: dispatch.indexSha256,
    expectedHandoffSha256: dispatch.handoffSha256, context, previousFiles, getObject: sha => waitForKV(kv, `archive/objects/${sha}`, CLOUDFLARE_ARCHIVE_TRANSPORT.maximumObjectBytes) });
  if (remote.receipt.expectedHead !== restored.readReceipt.expectedHead) throw new Error('Archive changed after preparation; stale handoff rejected');
  if (git('status', '--porcelain', '--untracked-files=no') || git('rev-parse', 'HEAD') !== identity.sourceCommit) throw new Error('Archive publisher source changed during validation');
  // No repository write credential is read or passed to the publisher until
  // all downloaded bytes, provider evidence, context and live predecessor pass.
  const receipt = await publishEthereumProspectiveArchiveRemote({ ...restored, source: ethereumArchiveSourceFromContext(context),
    context: ethereumArchivePublicationContext(context), token: required('ETH_ARCHIVE_GITHUB_TOKEN') });
  await mkdir(resolve(root, 'build'), { recursive: true });
  await writeFile(resolve(root, 'build/ethereum-prospective-archive-publication.json'), encoded(receipt), { flag: 'wx' });
  console.log('ATLAS_ARCHIVE_PUBLISHED ' + canonicalForecastJson({ publisherBuildId: buildId, preparationBuildId: dispatch.preparationBuildId,
    handoffSha256: dispatch.handoffSha256, ...receipt }));
  if (context.acquisitionOutcome === 'failure') throw new Error('Current acquisition failed; preserved failure evidence is not a successful daily observation');
}

async function main() {
  const [command, ...extra] = process.argv.slice(2);
  if (extra.length || !['prepare', 'publish'].includes(command)) throw new Error('Use exactly prepare or publish');
  const timer = setTimeout(() => { console.error('Archive build exceeded the free 19-minute execution budget'); process.exit(1); }, 19 * 60 * 1000);
  timer.unref();
  try { await (command === 'prepare' ? prepare() : publish()); } finally { clearTimeout(timer); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
