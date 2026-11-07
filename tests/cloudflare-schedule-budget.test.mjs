import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { measuredCloudflareBuild, calculateCloudflareScheduleBudget } from '../scripts/measure-cloudflare-schedule-budget.mjs';

const contract = JSON.parse(await readFile(new URL('../ops/cloudflare-scheduled-builds.json', import.meta.url), 'utf8'));
const ids = ['1', '2', '3', '4'].map(value => `${value.repeat(8)}-${value.repeat(4)}-4${value.repeat(3)}-8${value.repeat(3)}-${value.repeat(12)}`);
const roles = ['production', 'refresh', 'archivePrepare', 'archivePublish'];
function fixture(role = 'production') {
  const reference = { buildId: ids[0], triggerId: ids[1] }, job = contract.jobs[role];
  const build = { build_uuid: reference.buildId, trigger: { trigger_uuid: reference.triggerId }, status: 'stopped', build_outcome: 'success',
    created_on: '2026-11-06T00:00:00Z', initializing_on: '2026-11-07T01:00:00Z', stopped_on: '2026-11-07T01:07:01Z',
    build_trigger_metadata: { branch: 'main', provider_type: 'github', provider_account_name: 'twoimo', repo_name: 'bitcoin-cycle-atlas',
      commit_hash: 'a'.repeat(40), build_trigger_source: role === 'production' ? 'push' : 'deploy_hook', build_command: job.buildCommand, deploy_command: job.deployCommand } };
  return { role, reference, build, contract };
}

test('budget accepts complete actual commands and execution clocks, never inspect-only or queued duration', () => {
  const input = fixture(), value = measuredCloudflareBuild(input);
  assert.equal(value.durationMs, 421_000); assert.equal(value.budgetMinutes, 8);
  for (const mutate of [build => { build.build_outcome = 'fail'; }, build => { build.build_trigger_metadata.build_command += ' --inspect'; },
    build => { build.build_trigger_metadata.commit_hash = 'bad'; }, build => { build.stopped_on = '2026-11-07T01:21:00Z'; },
    build => { build.trigger.trigger_uuid = ids[2]; }]) {
    const build = structuredClone(input.build); mutate(build); assert.throws(() => measuredCloudflareBuild({ ...input, build }));
  }
  const scheduled = fixture('archivePrepare'); scheduled.build.build_trigger_metadata.build_trigger_source = 'push';
  assert.throws(() => measuredCloudflareBuild(scheduled));
});

test('monthly projection counts both refresh collection and every resulting full production build', () => {
  const measurements = roles.map((role, index) => ({ role, buildId: ids[index], durationMs: [600_000, 240_000, 240_000, 120_000][index], budgetMinutes: [10, 4, 4, 2][index] }));
  const report = calculateCloudflareScheduleBudget({ month: '2026-12', additionalProductionBuilds: 10, otherBuildMinutes: 50, reserveMinutes: 300, measurements });
  assert.equal(report.days, 31);
  assert.deepEqual(report.rows.map(row => [row.role, row.builds]), [['production', 134], ['refresh', 124], ['archivePrepare', 31], ['archivePublish', 31]]);
  assert.equal(report.projectedMinutes, 2372); assert.equal(report.status, 'WITHIN_MEASURED_BUDGET'); assert.equal(report.activationVerified, false);
  const slow = measurements.map(value => ({ ...value, durationMs: 1_140_000, budgetMinutes: 19 }));
  assert.equal(calculateCloudflareScheduleBudget({ month: '2026-12', additionalProductionBuilds: 0, otherBuildMinutes: 0, reserveMinutes: 300, measurements: slow }).status, 'EXCEEDS_FREE_BUDGET');
});

test('missing roles, duplicate builds and omitted retry/other-usage allowances cannot authorize activation', () => {
  const measurements = roles.map((role, index) => ({ role, buildId: ids[index], durationMs: 60_000, budgetMinutes: 1 }));
  const input = { month: '2026-11', additionalProductionBuilds: 0, otherBuildMinutes: 0, reserveMinutes: 300, measurements };
  assert.throws(() => calculateCloudflareScheduleBudget({ ...input, measurements: measurements.slice(1) }), /Measure/);
  assert.throws(() => calculateCloudflareScheduleBudget({ ...input, measurements: [...measurements, measurements[0]] }), /duplicate/);
  assert.throws(() => calculateCloudflareScheduleBudget({ ...input, reserveMinutes: 0 }), /300/);
  assert.throws(() => calculateCloudflareScheduleBudget({ ...input, otherBuildMinutes: undefined }), /explicit/);
});
