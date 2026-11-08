import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createEthBrowserCaseSpecs } from '../scripts/eth-browser-case-specs.mjs';
import { isEarlyChartReplayCadenceCase, verifyEarlyChartReplayCadence } from '../scripts/verify-chart-replay-browser.mjs';
import { fastCadencePolicy, fastCadenceMilestonePrefix, browserSourceInventorySha256, assertFastCadenceMilestone } from '../scripts/browser-fast-cadence-contract.mjs';

const archive = JSON.parse(await readFile(new URL('../dist/data/btc-volume.json', import.meta.url), 'utf8'));
const expectedDates = archive.bars.filter(row => row.date > '2026-10-20').map(row => row.date);

// Exercise the actual checker orchestration with injected native-action
// boundaries. The timestamps below are unit inputs, not Chrome evidence.
function phaseFixture({ original = {}, weekly = {}, restored = {}, persistenceChange, measurementChange, measurementError, milestoneError } = {}) {
  const baseline = { mode: 'atlas-chart', renderer: 'atlas', state: 'paused', frequency: 'daily', chartType: 'candles', speed: '1',
    origin: '2026-10-20', playbackStartDate: '2026-10-21', cursor: '2026-10-20', index: 0, actualCount: 0, lastIndex: expectedDates.length,
    viewStart: '2024-11-06', viewEnd: '2028-11-06', outputHash: 'frozen-output', forecastValueSignature: 'frozen-forecast',
    snapshotDigest: 'frozen-capture', forecastCount: 8822, annotationSignature: 'frozen-annotations', cycleMarkerCount: 5, cycleIntervalCount: 12,
    cycleMarkerLayers: 1, cycleIntervalLayers: 1, scale: 'log', unit: 'usd', updateInterval: 'daily',
    observedCandleCount: 714, volumeCount: 714, dateInput: '2026-10-21', dateMinimum: '2011-08-18', dateMaximum: expectedDates.at(-1), ...original };
  const persistent = { url: 'http://127.0.0.1/?symbol=BTCUSD&granularity=daily&type=line', historyLength: 1,
    local: [['workspace', 'unchanged-workspace']], session: [['replay', 'unchanged-saved-session']],
    historyControls: [{ action: 'undo', present: true, disabled: true, title: '실행 취소', label: '실행 취소' },
      { action: 'redo', present: true, disabled: true, title: '다시 실행', label: '다시 실행' }] };
  let frame = structuredClone(baseline), measured = null, persistenceReads = 0;
  const actions = [], milestones = [];
  const api = {
    expectedDates, originalView: [baseline.viewStart, baseline.viewEnd], referenceForecastSignature: baseline.forecastValueSignature,
    async readFrame(label) { actions.push(['frame', label]); return structuredClone(frame); },
    async readPersistence() {
      actions.push(['persistence', ++persistenceReads]);
      const value = structuredClone(persistent);
      if (persistenceReads > 1) persistenceChange?.(value);
      return value;
    },
    async selectFrequency(frequency) {
      actions.push(['frequency', frequency]); frame.frequency = frequency;
      if (frequency === 'weekly') Object.assign(frame, { observedCandleCount: 103, volumeCount: 102, dateMinimum: '2011-08-22' }, weekly);
      else Object.assign(frame, { observedCandleCount: baseline.observedCandleCount, volumeCount: baseline.volumeCount, dateMinimum: baseline.dateMinimum }, restored);
    },
    async measure(speeds) {
      actions.push(['measure', speeds]); assert.deepEqual(speeds, [['10', 100]]);
      assert.equal(frame.frequency, 'weekly'); assert.equal(frame.chartType, 'candles'); assert.ok(frame.volumeCount > 0);
      const observations = expectedDates.map((cursor, index) => ({ cursor, at: 1000 + index * 100 }));
      measured = { speed: 10, expectedMilliseconds: 100, observations, intervals: observations.slice(1).map(() => 100),
        meanMilliseconds: 100, averageUpdatesPerSecond: 10, allowedMeanRatio: [.85, 1.3],
        completionTimeoutMilliseconds: Math.ceil(expectedDates.length * 100 * 1.3) + 5000, setupAllowanceMilliseconds: 5000 };
      measurementChange?.(measured);
      Object.assign(frame, { cursor: expectedDates.at(-1), index: expectedDates.length, actualCount: expectedDates.length, state: 'ended', speed: '10' });
      if (measurementError) throw measurementError;
      return [measured];
    },
    async rewind() { actions.push(['rewind']); Object.assign(frame, { cursor: baseline.cursor, index: baseline.index, actualCount: baseline.actualCount, state: baseline.state }); },
    async selectSpeed(speed) { actions.push(['speed', speed]); frame.speed = speed; },
    async closeMenu() { actions.push(['close-menu']); },
    assertRestored(actual, expected) { actions.push(['assert-restored']); assert.deepEqual(actual, expected); },
    getMeasurement: () => measured,
    async onMilestone(result) { actions.push(['milestone', result.status]); milestones.push(result); if (milestoneError) throw milestoneError; },
  };
  return { api, baseline, actions, milestones, get measured() { return measured; }, get frame() { return frame; } };
}

test('only the original BTC1440 case runs the early phase without changing the 53-case inventory', () => {
  const cases = createEthBrowserCaseSpecs();
  assert.equal(cases.length, 53);
  assert.deepEqual(cases.filter(isEarlyChartReplayCadenceCase), [fastCadencePolicy.caseSpec]);
  assert.equal(isEarlyChartReplayCadenceCase({ ...fastCadencePolicy.caseSpec, height: 901 }), false);
  assert.equal(isEarlyChartReplayCadenceCase({ ...fastCadencePolicy.caseSpec, touch: true }), false);
});

test('10× uses all source dates once in the weekly fixture and releases only after full native restoration', async () => {
  const f = phaseFixture(), result = await verifyEarlyChartReplayCadence(f.api);
  assert.ok(expectedDates.length >= 5);
  assert.equal(result.status, 'passed'); assert.equal(result.restoration.unchanged, true);
  assert.equal(result.measurement, f.measured); assert.deepEqual(result.measurement.observations.map(row => row.cursor), expectedDates);
  assert.deepEqual(result.fixture, { origin: '2026-10-20', displayFrequency: 'weekly', updateInterval: 'daily',
    viewStart: f.baseline.viewStart, viewEnd: f.baseline.viewEnd });
  assert.deepEqual(f.frame, f.baseline); assert.deepEqual(f.milestones, [result]);
  assert.deepEqual(f.actions.filter(([action]) => ['frequency', 'measure', 'rewind', 'speed', 'close-menu', 'assert-restored', 'milestone'].includes(action)),
    [['frequency', 'weekly'], ['measure', [['10', 100]]], ['rewind'], ['speed', '1'], ['frequency', 'daily'], ['close-menu'], ['assert-restored'], ['milestone', 'passed']]);
  assert.match(result.restoration.persistedStateSha256, /^[a-f0-9]{64}$/);
  assert.ok(Date.parse(result.completedAt) >= Date.parse(result.startedAt));
});

test('a real measurement rejection stays failed and preserves its complete raw sample for diagnostics', async () => {
  const failure = new Error('Observed 10× cadence exceeded its unchanged bound'), f = phaseFixture({ measurementError: failure });
  await assert.rejects(verifyEarlyChartReplayCadence(f.api), error => error === failure);
  assert.equal(f.milestones.length, 1); assert.equal(f.milestones[0].status, 'failed');
  assert.equal(f.milestones[0].measurement, f.measured); assert.match(f.milestones[0].error, /unchanged bound/);
  assert.deepEqual(f.measured.observations.map(row => row.cursor), expectedDates);
  assert.ok(!f.actions.some(([action]) => action === 'rewind'), 'Failure cannot manufacture a restoration pass');
});

test('omitting any genuine source observation cannot release a passed phase', async () => {
  const f = phaseFixture({ measurementChange: value => value.observations.pop() });
  await assert.rejects(verifyEarlyChartReplayCadence(f.api), /Expected values to be strictly deep-equal/);
  assert.equal(f.milestones.length, 1); assert.equal(f.milestones[0].status, 'failed');
  assert.equal(f.milestones[0].measurement.observations.length, expectedDates.length - 1);
});

test('changing a frozen forecast or range during weekly setup fails before measuring', async () => {
  for (const weekly of [{ outputHash: 'changed' }, { forecastCount: 0 }, { viewEnd: '2028-11-07' }, { cycleMarkerLayers: 0 }]) {
    const f = phaseFixture({ weekly });
    await assert.rejects(verifyEarlyChartReplayCadence(f.api), /Early cadence setup changed/);
    assert.ok(!f.actions.some(([action]) => action === 'measure'));
    assert.equal(f.milestones[0].status, 'failed'); assert.equal(f.milestones[0].fixture, null); assert.equal(f.milestones[0].measurement, null);
  }
});

test('restoration rejects changes to the frame, saved workspace, URL and undo history', async () => {
  const faults = [
    { restored: { outputHash: 'changed' } }, { restored: { frequency: 'weekly' } },
    { persistenceChange: state => { state.local[0][1] = 'changed-workspace'; } },
    { persistenceChange: state => { state.session[0][1] = 'changed-replay'; } },
    { persistenceChange: state => { state.url += '&granularity=weekly'; } },
    { persistenceChange: state => { state.historyLength++; } },
    { persistenceChange: state => { state.historyControls[0].disabled = false; state.historyControls[0].title += ' · 봉 간격'; } },
  ];
  for (const fault of faults) {
    const f = phaseFixture(fault);
    await assert.rejects(verifyEarlyChartReplayCadence(f.api));
    assert.equal(f.milestones.length, 1); assert.equal(f.milestones[0].status, 'failed');
    assert.equal(f.milestones[0].measurement, f.measured); assert.equal(f.milestones[0].restoration, undefined);
  }
});

test('an invalid original baseline publishes only failure without starting the measurement', async () => {
  const f = phaseFixture({ original: { index: 1 } });
  await assert.rejects(verifyEarlyChartReplayCadence(f.api));
  assert.ok(!f.actions.some(([action]) => action === 'measure'));
  assert.equal(f.milestones.length, 1); assert.equal(f.milestones[0].status, 'failed');
  assert.equal(f.milestones[0].fixture, null); assert.equal(f.milestones[0].measurement, null);
});

test('milestone transport failure preserves the original phase error and emits no second terminal result', async () => {
  const original = new Error('cadence failed'), transport = new Error('output failed'), f = phaseFixture({ measurementError: original, milestoneError: transport });
  await assert.rejects(verifyEarlyChartReplayCadence(f.api), error => error instanceof AggregateError && error.errors[0] === original && error.errors[1] === transport);
  assert.equal(f.milestones.length, 1); assert.equal(f.milestones[0].status, 'failed');
});

const mainSource = await readFile(new URL('../scripts/verify-eth-candidate-browser.mjs', import.meta.url), 'utf8');
const reporterSource = mainSource.match(/    const onFastCadenceMilestone=async result=>\{[\s\S]*?\n    \};/)?.[0];
assert.ok(reporterSource, 'Test the actual harness milestone adapter without starting its HTTP server or Chrome');
function reporter({ lane = 'chart-replay', spec = fastCadencePolicy.caseSpec, profiling = false } = {}) {
  const receipt = {}, report = { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceHashes: { 'tracked-source.js': 'c'.repeat(64) }, ...(profiling ? { profiling: true } : {}) }, lines = [];
  const suiteRunId = 'd0000000-1111-4222-8333-444444444444';
  const publish = vm.runInNewContext(reporterSource + '\nonFastCadenceMilestone;', { lane, spec, receipt, report, suiteRunId, assert,
    fastCadencePolicy, fastCadenceMilestonePrefix, browserSourceInventorySha256, isEarlyChartReplayCadenceCase, console: { log: line => lines.push(line) } });
  return { publish, receipt, report, lines, context: { ...report, suiteRunId, sourceInventorySha256: browserSourceInventorySha256(report.sourceHashes), expectedObservationDates: expectedDates } };
}

test('the actual harness emits one source/run/case-bound milestone with the exact measured data', async () => {
  const f = phaseFixture(), phase = await verifyEarlyChartReplayCadence(f.api), r = reporter();
  await r.publish(phase);
  assert.equal(r.lines.length, 1); assert.ok(r.lines[0].startsWith(fastCadenceMilestonePrefix));
  const milestone = JSON.parse(r.lines[0].slice(fastCadenceMilestonePrefix.length));
  assertFastCadenceMilestone(milestone, r.context);
  assert.deepEqual(milestone.measurement, phase.measurement); assert.equal(milestone.restored, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.receipt.fastCadence)), milestone);
  assert.equal(r.report.fastCadence, r.receipt.fastCadence);
  await assert.rejects(r.publish(phase), /only one terminal milestone/); assert.equal(r.lines.length, 1);
});

test('the main adapter rejects unrestored passes, accepts a failed fallback, and never waits in standalone runs', async () => {
  const f = phaseFixture(), phase = await verifyEarlyChartReplayCadence(f.api), r = reporter();
  await assert.rejects(r.publish({ ...phase, restoration: { unchanged: false } }), /original baseline is restored/);
  assert.equal(r.lines.length, 0); assert.equal(r.receipt.fastCadence, undefined);
  await r.publish({ status: 'failed', startedAt: phase.startedAt, completedAt: phase.completedAt, fixture: null, measurement: null, error: 'Early case initialization failed' });
  const failed = JSON.parse(r.lines[0].slice(fastCadenceMilestonePrefix.length)); assertFastCadenceMilestone(failed, r.context);
  assert.equal(failed.status, 'failed'); assert.equal(failed.restored, false);
  for (const options of [{ lane: '' }, { lane: 'non-chart-replay' }, { spec: { ...fastCadencePolicy.caseSpec, width: 320 } }]) {
    const independent = reporter(options); await independent.publish(phase);
    assert.equal(independent.lines.length, 0); assert.equal(independent.receipt.fastCadence, undefined);
  }
});

test('profiled actual adapter output cannot be accepted as a canonical cadence milestone', async () => {
  const f = phaseFixture(), phase = await verifyEarlyChartReplayCadence(f.api), r = reporter({ profiling: true });
  await r.publish(phase);
  assert.equal(r.lines.length, 1);assert.ok(r.lines[0].startsWith('ATLAS_BROWSER_REPLAY_PROFILE_CADENCE '));
  assert.equal(r.lines[0].startsWith(fastCadenceMilestonePrefix), false);
  const milestone = JSON.parse(r.lines[0].slice('ATLAS_BROWSER_REPLAY_PROFILE_CADENCE '.length));
  assert.equal(milestone.status, 'passed');assert.equal(milestone.qualifiesCadence, false);
  assert.equal(milestone.qualifiesFullVerification, false);
  assert.throws(() => assertFastCadenceMilestone(milestone, r.context), /atlas-browser-fast-cadence/);
});
