import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalForecastJson } from '../dist/forecast-records.js';
import { buildEthereumProspectiveArchive, verifyEthereumProspectiveArchive } from '../scripts/ethereum-prospective-archive-core.mjs';
import { createEthereumProspectiveHandoff } from '../scripts/ethereum-prospective-handoff.mjs';
import { ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY as R, ethereumArchiveGitTree } from '../scripts/ethereum-prospective-archive-remote.mjs';
import { CLOUDFLARE_ARCHIVE_PROVIDER as provider, normalizeEthereumArchiveSource, normalizeEthereumArchiveHandoffContext,
  ethereumArchiveSourceFromContext, ethereumArchivePublicationContext, validateEthereumArchivePublicationContext } from '../scripts/ethereum-archive-provider-identity.mjs';
import { cloudflareArchiveContextFromBuild, createCloudflareBuildReader, queueCloudflareArchivePublisher } from '../scripts/cloudflare-archive-build-api.mjs';
import { packCloudflareArchiveDelta, restoreCloudflareArchiveDelta, createCloudflareArchiveKV } from '../scripts/cloudflare-archive-transport.mjs';
import { assertCloudflareArchiveDispatch, cloudflareArchiveRemainingBudget } from '../scripts/cloudflare-ethereum-archive.mjs';
import { assertCloudflareArchiveVerification, cloudflareArchiveTestPlan, cloudflareArchiveTests } from '../scripts/verify-cloudflare-archive.mjs';

const json = canonicalForecastJson, bytes = value => Buffer.from(json(value) + '\n');
const sha = value => createHash('sha256').update(value).digest('hex');
const blob = value => createHash('sha1').update('blob ' + value.length + '\0').update(value).digest('hex');
const buildId = '11111111-1111-4111-8111-111111111111', triggerId = '22222222-2222-4222-8222-222222222222', publisherBuildId = '33333333-3333-4333-8333-333333333333';
const identity = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40) };
const context = { provider, repository: R.repository, eventName: 'deploy_hook', ref: 'refs/heads/main', defaultBranch: 'main', ...identity,
  runId: buildId, triggerId, acquisitionOutcome: 'success' };
function build() { return { build_uuid: buildId, status: 'stopped', build_outcome: 'success', stopped_on: '2026-11-07T01:20:00Z',
  build_trigger_metadata: { branch: 'main', commit_hash: identity.sourceCommit, provider_type: 'github', provider_account_name: 'twoimo', repo_name: 'bitcoin-cycle-atlas', build_trigger_source: 'deploy_hook' },
  trigger: { trigger_uuid: triggerId, repo_connection: { provider_type: 'github', provider_account_name: 'twoimo', repo_name: 'bitcoin-cycle-atlas' } } }; }
function receipt(files) {
  const entries = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, value]) => ({ path, bytes: value.length, sha256: sha(value), gitBlobSha: blob(value) }));
  const body = { schemaVersion: 1, kind: 'ethereum-prospective-archive-remote-read', policyVersion: R.version, repository: R.repository, branch: R.branch,
    status: 'restored', expectedHead: 'c'.repeat(40), expectedTree: ethereumArchiveGitTree(files).sha, manifestId: JSON.parse(files.get('manifest.json')).id,
    inventory: { files: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), sha256: sha(Buffer.from(json(entries))) },
    absenceProof: null, automaticSeedFallback: false, releaseAuthorized: false, productionPromoted: false };
  return bytes({ id: sha(Buffer.from(json(body))), ...body });
}
async function handoffFixture(outcome = 'success') {
  const previousFiles = (await buildEthereumProspectiveArchive({ files: new Map([['receipt.json', bytes({ retained: true })]]),
    source: { ...identity, runId: '123' }, createdAt: '2026-11-06T01:00:00.000Z' })).files;
  const prior = await verifyEthereumProspectiveArchive({ files: previousFiles });
  const logical = new Map(prior.logicalFiles); logical.set('receipt.json', bytes({ currentAcquisition: outcome }));
  const ctx = { ...context, acquisitionOutcome: outcome };
  const next = await buildEthereumProspectiveArchive({ files: logical, previous: previousFiles,
    source: ethereumArchiveSourceFromContext(ctx), createdAt: '2026-11-07T01:00:00.000Z' });
  const handoff = await createEthereumProspectiveHandoff({ previousFiles, files: next.files, readReceiptBytes: receipt(previousFiles), context: ctx });
  return { previousFiles, handoff, context: ctx };
}

test('explicit provider identity preserves historical GitHub bytes and rejects UUID masquerading', () => {
  assert.deepEqual(normalizeEthereumArchiveSource({ ...identity, runId: '123' }), { ...identity, runId: '123' });
  assert.deepEqual(normalizeEthereumArchiveSource(ethereumArchiveSourceFromContext(context)), { ...identity, runId: buildId, provider });
  for (const value of [{ ...identity, runId: buildId }, { ...identity, runId: '123', provider }, { ...identity, runId: `cloudflare:${buildId}` }, { ...identity, runId: buildId, provider: 'github' }]) {
    assert.throws(() => normalizeEthereumArchiveSource(value));
  }
  assert.throws(() => normalizeEthereumArchiveHandoffContext({ ...context, runAttempt: '1' }), /fields/);
  assert.throws(() => normalizeEthereumArchiveHandoffContext({ ...context, eventName: 'pull_request' }), /Cloudflare/);
  assert.throws(() => validateEthereumArchivePublicationContext(ethereumArchivePublicationContext(context), { ...identity, runId: '123' }), /context and source differ/);
});

test('the authenticated Cloudflare build must bind exact trigger repository branch source and completion', () => {
  const options = { build: build(), buildId, triggerId, ...identity, completed: true };
  assert.deepEqual(cloudflareArchiveContextFromBuild(options), context);
  for (const changed of [
    value => { value.build_uuid = publisherBuildId; }, value => { value.trigger.trigger_uuid = publisherBuildId; },
    value => { value.build_trigger_metadata.commit_hash = 'd'.repeat(40); }, value => { value.build_trigger_metadata.branch = 'feature'; },
    value => { value.build_trigger_metadata.provider_account_name = 'foreign'; }, value => { value.build_trigger_metadata.build_trigger_source = 'push'; },
    value => { value.status = 'running'; }, value => { value.build_outcome = 'fail'; }, value => { value.pull_request = { pull_request_url: 'https://example.com/' }; },
  ]) {
    const value = build(); changed(value);
    assert.throws(() => cloudflareArchiveContextFromBuild({ ...options, build: value }));
  }
});

test('free KV delta reconstructs and verifies every original handoff byte for successful and failed captures', async () => {
  for (const outcome of ['success', 'failure']) {
    const input = await handoffFixture(outcome), delta = await packCloudflareArchiveDelta(input);
    assert.ok(delta.objects.size < input.handoff.files.size);
    const restored = await restoreCloudflareArchiveDelta({ ...input, indexBytes: delta.indexBytes, expectedIndexSha256: delta.indexSha256,
      expectedHandoffSha256: input.handoff.digest, getObject: async key => delta.objects.get(key) });
    assert.deepEqual(restored.files, new Map([...input.handoff.files].filter(([path]) => path.startsWith('candidate/')).map(([path, value]) => [path.slice(10), value])));
    assert.deepEqual(restored.previousFiles, input.previousFiles);
    assert.equal(restored.receipt.acquisitionFailed, outcome === 'failure');
    assert.equal(restored.receipt.releaseAuthorized, false);
  }
});

test('a substituted index object or producer cannot pass immutable handoff reconstruction', async () => {
  const input = await handoffFixture(), delta = await packCloudflareArchiveDelta(input);
  const options = { ...input, indexBytes: delta.indexBytes, expectedIndexSha256: delta.indexSha256, expectedHandoffSha256: input.handoff.digest,
    getObject: async key => delta.objects.get(key) };
  await assert.rejects(restoreCloudflareArchiveDelta({ ...options, indexBytes: Buffer.from('changed') }), /trusted build evidence/);
  await assert.rejects(restoreCloudflareArchiveDelta({ ...options, getObject: async () => Buffer.from('substituted') }), /substituted/);
  await assert.rejects(restoreCloudflareArchiveDelta({ ...options, context: { ...context, runId: publisherBuildId } }), /context/);
  const rewritten = { ...delta.index, entries: delta.index.entries.slice(1) }, changed = bytes(rewritten);
  await assert.rejects(restoreCloudflareArchiveDelta({ ...options, indexBytes: changed, expectedIndexSha256: sha(changed) }), /incomplete|trusted preparation|handoff/i);
});

test('KV pointers cannot replace the separately authenticated preparation log or intended publisher', () => {
  const dispatch = { schemaVersion: 1, kind: 'atlas-cloudflare-archive-dispatch', preparationBuildId: buildId, publisherBuildId, ...identity,
    context, indexSha256: 'd'.repeat(64), handoffSha256: 'e'.repeat(64) };
  const options = { dispatch, trusted: structuredClone(dispatch), publisherBuildId, ...identity };
  assert.deepEqual(assertCloudflareArchiveDispatch(options), context);
  for (const changed of [{ indexSha256: 'f'.repeat(64) }, { publisherBuildId: buildId }, { sourceCommit: 'f'.repeat(40) }]) {
    assert.throws(() => assertCloudflareArchiveDispatch({ ...options, dispatch: { ...dispatch, ...changed } }), /dispatch differs/);
  }
});

test('Builds log pagination remains bounded and rejects duplicated trusted handoff identities', async () => {
  const record = { hello: 'fixture' }; let calls = 0;
  const reader = createCloudflareBuildReader({ accountId: '1'.repeat(32), token: 'test-only-read-token', fetchImpl: async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
    calls++; return Response.json({ success: true, result: calls === 1 ? { cursor: 'next', truncated: true, lines: [[1, 'ordinary']] }
      : { cursor: null, truncated: false, lines: [[2, 'ATLAS_ARCHIVE_PREPARED ' + JSON.stringify(record)]] } });
  } });
  assert.deepEqual(await reader.preparedReceipt(buildId), record); assert.equal(calls, 2);
  const duplicate = createCloudflareBuildReader({ accountId: '1'.repeat(32), token: 'test-only-read-token', fetchImpl: async () => Response.json({ success: true,
    result: { lines: [[1, 'ATLAS_ARCHIVE_PREPARED {}'], [2, 'ATLAS_ARCHIVE_PREPARED {}']] } }) });
  await assert.rejects(duplicate.preparedReceipt(buildId), /more than one/);
});

test('publisher hook is scoped and cannot overwrite a deduplicated pending publisher handoff', async () => {
  const hookUrl = `https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/${triggerId}`;
  const fetchImpl = async (url, options) => { assert.equal(url, hookUrl); assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    return Response.json({ success: true, result: { build_uuid: publisherBuildId } }); };
  assert.equal(await queueCloudflareArchivePublisher({ hookUrl, fetchImpl }), publisherBuildId);
  await assert.rejects(queueCloudflareArchivePublisher({ hookUrl: 'https://example.com/', fetchImpl }), /scoped/);
  await assert.rejects(queueCloudflareArchivePublisher({ hookUrl, fetchImpl: async () => Response.json({ success: true, result: { build_uuid: publisherBuildId, already_exists: true } }) }), /distinct/);
});

test('publisher KV client cannot mutate handoff storage and reads are size bounded', async () => {
  let calls = 0;
  const kv = createCloudflareArchiveKV({ accountId: '1'.repeat(32), namespaceId: '2'.repeat(32), token: 'test-only-read-token', fetchImpl: async () => { calls++; return new Response('x'.repeat(20)); } });
  await assert.rejects(kv.put(`archive/indices/${buildId}`, Buffer.from('x')), /read-only/); assert.equal(calls, 0);
  await assert.rejects(kv.get(`archive/indices/${buildId}`, 10), /byte budget/);
  await assert.rejects(kv.get('../../outside'), /Unexpected/);
});

test('archive verification requires every real test, the current build and its exact source', () => {
  const valid = { schemaVersion: 1, kind: 'atlas-cloudflare-archive-verification', status: 'PASS', ...identity, buildId,
    planSha256: cloudflareArchiveTestPlan, runtime: 'v24.22.2/linux/x64', testFiles: cloudflareArchiveTests,
    tests: 200, pass: 200, fail: 0, skipped: 0, cancelled: 0, logSha256: 'c'.repeat(64),
    startedAt: '2026-11-07T01:00:00Z', completedAt: '2026-11-07T01:02:00Z' };
  assert.equal(assertCloudflareArchiveVerification(valid, { ...identity, buildId }), valid);
  for (const changed of [{ status: 'RUNNING' }, { sourceCommit: 'c'.repeat(40) }, { buildId: publisherBuildId },
    { planSha256: 'd'.repeat(64) }, { testFiles: cloudflareArchiveTests.slice(1) }, { pass: 199 }, { skipped: 1 },
    { runtime: 'v24.22.1/linux/x64' }, { completedAt: '2026-11-06T01:00:00Z' }]) {
    assert.throws(() => assertCloudflareArchiveVerification({ ...valid, ...changed }, { ...identity, buildId }));
  }
});

test('archive execution budget includes initialization and checks without charging queued time', () => {
  const now = Date.parse('2026-11-07T01:10:00Z');
  const value = { created_on: '2026-11-06T23:00:00Z', initializing_on: '2026-11-07T01:00:00Z', running_on: '2026-11-07T01:01:00Z' };
  assert.equal(cloudflareArchiveRemainingBudget(value, { startedAt: '2026-11-07T01:02:00Z' }, now), 9 * 60 * 1000);
  assert.throws(() => cloudflareArchiveRemainingBudget(value, { startedAt: '2026-11-07T00:00:00Z' }, now), /budget/);
  assert.throws(() => cloudflareArchiveRemainingBudget({ created_on: value.created_on }, { startedAt: value.running_on }, now), /execution clock/);
});
