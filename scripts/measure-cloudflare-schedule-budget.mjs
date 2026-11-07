import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCloudflareBuildReader } from './cloudflare-archive-build-api.mjs';
import { CLOUDFLARE_BUILD_UUID } from './ethereum-archive-provider-identity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roles = ['productionModels', 'production', 'refresh', 'archivePrepare', 'archivePublish'];
const number = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be an explicit nonnegative integer`);
  return value;
};

export function measuredCloudflareBuild({ role, reference, build, contract }) {
  const job = contract.jobs[role], meta = build?.build_trigger_metadata;
  if (!job || !CLOUDFLARE_BUILD_UUID.test(reference?.buildId) || !CLOUDFLARE_BUILD_UUID.test(reference?.triggerId) ||
      build?.build_uuid !== reference.buildId || build.trigger?.trigger_uuid !== reference.triggerId ||
      build.status !== 'stopped' || build.build_outcome !== 'success' || meta?.branch !== 'main' || meta.provider_type !== 'github' ||
      `${meta.provider_account_name}/${meta.repo_name}`.toLowerCase() !== contract.repository ||
      !/^[a-f0-9]{40}$/.test(meta.commit_hash) || build.pull_request ||
      meta.build_command !== job.buildCommand || meta.deploy_command !== job.deployCommand ||
      !['deploy_hook', 'manual', 'api', ...(role === 'productionModels' ? ['push', 'push_event'] : [])].includes(meta.build_trigger_source)) {
    throw new Error('Budget measurement requires an actual successful intended build with the complete production/job commands');
  }
  const start = Date.parse(build.initializing_on || build.running_on), stop = Date.parse(build.stopped_on);
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start || stop - start > 20 * 60 * 1000) throw new Error('Measured build lacks a valid completed execution clock within the free timeout');
  return { role, buildId: reference.buildId, triggerId: reference.triggerId, sourceCommit: meta.commit_hash,
    executionStartedAt: new Date(start).toISOString(), completedAt: new Date(stop).toISOString(), durationMs: stop - start,
    budgetMinutes: Math.ceil((stop - start) / 60_000) };
}

export function calculateCloudflareScheduleBudget({ month, additionalProductionBuilds, otherBuildMinutes, reserveMinutes, measurements }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('A concrete UTC calendar month is required');
  number(additionalProductionBuilds, 'additionalProductionBuilds'); number(otherBuildMinutes, 'otherBuildMinutes'); number(reserveMinutes, 'reserveMinutes');
  if (reserveMinutes < 300) throw new Error('Keep at least 300 free minutes for retries and unplanned verification');
  if (!Array.isArray(measurements)) throw new Error('Actual completed build measurements are required');
  const seen = new Set(), maximum = {};
  for (const value of measurements) {
    if (!roles.includes(value.role) || !CLOUDFLARE_BUILD_UUID.test(value.buildId) || seen.has(value.buildId) ||
        !Number.isFinite(value.durationMs) || value.durationMs <= 0 || value.durationMs > 1_200_000 ||
        value.budgetMinutes !== Math.ceil(value.durationMs / 60_000)) throw new Error('Invalid or duplicate actual build measurement');
    seen.add(value.buildId); maximum[value.role] = Math.max(maximum[value.role] ?? 0, value.budgetMinutes);
  }
  if (roles.some(role => !maximum[role])) throw new Error('Measure successful production model, production browser/publication, refresh, archive preparation and archive publication builds before activation');
  const [year, calendarMonth] = month.split('-').map(Number), days = new Date(Date.UTC(year, calendarMonth, 0)).getUTCDate();
  const publications = 4 * days + additionalProductionBuilds;
  const counts = { refresh: 4 * days, productionModels: publications, production: publications, archivePrepare: days, archivePublish: days };
  const rows = roles.map(role => ({ role, builds: counts[role], maximumObservedMinutes: maximum[role], projectedMinutes: counts[role] * maximum[role] }));
  const total = rows.reduce((sum, row) => sum + row.projectedMinutes, 0) + otherBuildMinutes + reserveMinutes;
  return { schemaVersion: 2, kind: 'atlas-cloudflare-schedule-budget', status: total <= 3000 ? 'WITHIN_MEASURED_BUDGET' : 'EXCEEDS_FREE_BUDGET',
    month, days, freeMinutes: 3000, rows, otherBuildMinutes, reserveMinutes, projectedMinutes: total, remainingMinutes: 3000 - total,
    measurements, activationVerified: false,
    scope: 'Conservative complete-month projection from authenticated successful execution clocks. No paid resources are enabled by this check. Actual resource configuration, credentials, real Cron triggers and publication readback remain separate requirements; account-wide billing plan is not inferred.' };
}

async function main() {
  const [flag, path, ...extra] = process.argv.slice(2);
  if (flag !== '--samples' || !path || extra.length) throw new Error('Use --samples <JSON containing actual Build UUIDs, trigger UUIDs and explicit monthly allowances>');
  const bytes = await readFile(resolve(path));
  if (bytes.length > 32 * 1024) throw new Error('Schedule measurement input exceeds its bound');
  const input = JSON.parse(bytes.toString('utf8'));
  if (input.schemaVersion !== 2 || input.kind !== 'atlas-cloudflare-schedule-samples' || Object.keys(input.samples ?? {}).sort().join(',') !== [...roles].sort().join(',')) throw new Error('Every scheduled build role, including both production stages, must have actual samples');
  const contract = JSON.parse(await readFile(resolve(root, 'ops/cloudflare-scheduled-builds.json'), 'utf8'));
  const reader = createCloudflareBuildReader({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.ATLAS_BUILDS_READ_TOKEN });
  const measurements = [];
  for (const role of roles) {
    const entries = input.samples[role];
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 4) throw new Error('Use one to four actual completed builds per role');
    for (const reference of entries) measurements.push(measuredCloudflareBuild({ role, reference, build: await reader.build(reference.buildId), contract }));
  }
  const report = { ...calculateCloudflareScheduleBudget({ ...input, measurements }), measuredAt: new Date().toISOString() };
  await mkdir(resolve(root, 'build'), { recursive: true });
  await writeFile(resolve(root, 'build/cloudflare-schedule-budget.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('ATLAS_CLOUDFLARE_SCHEDULE_BUDGET ' + JSON.stringify(report));
  if (report.status !== 'WITHIN_MEASURED_BUDGET') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
