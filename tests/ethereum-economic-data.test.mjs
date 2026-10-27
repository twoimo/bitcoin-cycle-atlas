import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COIN_METRICS_ETH_ARCHIVE, COIN_METRICS_ETH_FIELDS,
  parseCoinMetricsEthCsv, aggregateCoinMetricsEthWindow,
  assessCoinMetricsEconomicCoverage, captureCoinMetricsEthArchive,
} from '../dist/ethereum-economic-data.js';

const header = 'time,FeeTotNtv,IssTotNtv,SplyCur,TxCnt,AssetEODCompletionTime';
const DAY = 86400000;
// These dates, values and completion times are explicitly synthetic fixtures.
function fixture(count = 29) {
  return [header, ...Array.from({ length: count }, (_, i) => {
    const t = Date.UTC(2026, 0, 1) + i * DAY;
    const date = new Date(t).toISOString().slice(0, 10);
    return [date, i, 2 * i, 1000 + i, i * 10, (t + DAY + 3600000) / 1000].join(',');
  })].join('\n') + '\n';
}
const parsed = () => parseCoinMetricsEthCsv(fixture());

test('raw numeric zero and missing values remain different observations', () => {
  const p = parseCoinMetricsEthCsv(fixture().replace('2026-01-02,1,2,1001,10,', '2026-01-02,,2,1001,10,'));
  assert.equal(p.rows[0].metrics.FeeTotNtv, 0);
  assert.equal(p.rows[1].metrics.FeeTotNtv, null);
  assert.equal(p.rows[1].raw.FeeTotNtv, '');
  assert.equal(p.missingByField.FeeTotNtv, 1);
});
test('an exact 28-day window sums flows and takes only the final stock', () => {
  const w = aggregateCoinMetricsEthWindow(parsed(), '2026-01-29');
  assert.equal(w.observedFrom, '2026-01-02');
  assert.equal(w.observedAt, '2026-01-30T00:00:00.000Z');
  assert.equal(w.completeWindow, true);
  assert.deepEqual(w.aggregate, {
    totalFeesIncludingBlobEth: 406, grossIssuanceEth: 812,
    l1TransactionCount: 4060, providerLedgerSupplyEth: 1028,
  });
  assert.equal(w.modelSnapshot, null);
  assert.ok(!Object.hasOwn(w.aggregate, 'executionFeesEth'));
  assert.ok(!Object.hasOwn(w.aggregate, 'consensusNetIssuanceEth'));
});
test('missing day fails the entire requested window instead of summing 27 days', () => {
  const csv = fixture().split('\n').filter(l => !l.startsWith('2026-01-10,')).join('\n');
  const w = aggregateCoinMetricsEthWindow(parseCoinMetricsEthCsv(csv), '2026-01-29');
  assert.equal(w.completeWindow, false);
  assert.deepEqual(w.missingDates, ['2026-01-10']);
  assert.equal(w.aggregate, null);
});
test('missing field or provider completion is not imputed into a complete window', () => {
  const p = parseCoinMetricsEthCsv(fixture().replace('2026-01-02,1,2,1001,10,', '2026-01-02,1,,1001,10,'));
  const w = aggregateCoinMetricsEthWindow(p, '2026-01-29');
  assert.equal(w.completeWindow, false);
  assert.deepEqual(w.missingFields, [{ date: '2026-01-02', field: 'IssTotNtv' }]);
  assert.equal(w.aggregate, null);
  const noCompletion = fixture().replace(/(2026-01-10,[^\n]+),\d+\n/, '$1,\n');
  assert.equal(aggregateCoinMetricsEthWindow(parseCoinMetricsEthCsv(noCompletion), '2026-01-29').aggregate, null);
});
test('reference-only tail does not make old economic observations current', () => {
  const p = parseCoinMetricsEthCsv(fixture() + '2026-01-30,,,,,\n');
  const c = assessCoinMetricsEconomicCoverage(p, { asOf: '2026-02-20', collectedAt: '2026-02-21T10:00:00Z' });
  assert.equal(p.rawRowCount, 30);
  assert.equal(p.completeRawMetricRows, 29);
  assert.equal(c.latestCompleteWindow.observedThrough, '2026-01-29');
  assert.equal(c.staleDays, 22);
  assert.equal(c.freshness, 'stale');
  assert.equal(c.requestedWindow.completeWindow, false);
});
test('a valid raw window never becomes a fictitious complete economic input', () => {
  const c = assessCoinMetricsEconomicCoverage(parsed(), { asOf: '2026-01-29', collectedAt: '2026-01-30T10:00:00Z' });
  assert.equal(c.requiredMetricCount, 26);
  assert.equal(c.definitionMatchedMetricCount, 0);
  assert.equal(c.requirements.length, 26);
  assert.equal(c.fullModelSnapshotReady, false);
  assert.equal(c.modelFeasibility.provesInputReadiness, false);
  assert.equal(c.modelFeasibility.horizons.find(h=>h.horizonDays===180).structurallyEnoughMatureLabels, false);
  assert.equal(c.historicalPointInTimeReady, false);
  assert.equal(c.publishedAt, null);
  assert.deepEqual(c.modelSnapshots, []);
  assert.equal(c.eligibleModelSnapshotCount, 0);
  assert.equal(COIN_METRICS_ETH_FIELDS.FeeTotNtv.modelMapping, null);
  assert.match(COIN_METRICS_ETH_FIELDS.IssTotNtv.reason, /gross|penalt/);
});
test('asOf excludes later complete windows and collection cannot precede provider completion', () => {
  const c = assessCoinMetricsEconomicCoverage(parsed(), { asOf: '2026-01-28', collectedAt: '2026-01-30T10:00:00Z' });
  assert.equal(c.latestCompleteWindow.observedThrough, '2026-01-28');
  assert.throws(() => assessCoinMetricsEconomicCoverage(parsed(), {
    asOf: '2026-01-29', collectedAt: '2026-01-30T00:00:00Z',
  }), /later than collection/);
});
test('duplicate or unsorted days are rejected rather than silently overwritten', () => {
  const lines = fixture().trimEnd().split('\n');
  assert.throws(() => parseCoinMetricsEthCsv([...lines, lines.at(-1)].join('\n')), /unique/);
  [lines[1], lines[2]] = [lines[2], lines[1]];
  assert.throws(() => parseCoinMetricsEthCsv(lines.join('\n')), /increasing/);
});
test('malformed cells, dates and unreviewed CSV format fail closed', () => {
  for (const replacement of ['NaN', 'Infinity', '-1', '0x10', ' 1']) {
    assert.throws(() => parseCoinMetricsEthCsv(fixture().replace('2026-01-02,1,', '2026-01-02,' + replacement + ',')));
  }
  assert.throws(() => parseCoinMetricsEthCsv(fixture().replace('1001,10,', '1001,1.5,')), /safe integer/);
  assert.throws(() => parseCoinMetricsEthCsv(fixture().replace('2026-01-02', '2026-02-30')), /Invalid UTC day/);
  assert.throws(() => parseCoinMetricsEthCsv(fixture().replace('FeeTotNtv', '"FeeTotNtv"')), /Unreviewed/);
  assert.throws(() => parseCoinMetricsEthCsv(fixture().replace('FeeTotNtv', 'Other')), /Missing required/);
  assert.throws(() => parseCoinMetricsEthCsv(fixture().replace('2026-01-02,1,2,', '2026-01-02,1,')), /width mismatch/);
});
test('provider calculation before UTC observation completion is rejected', () => {
  const csv = fixture().replace(/(2026-01-02,[^\n]+),\d+\n/, '$1,1\n');
  assert.throws(() => parseCoinMetricsEthCsv(csv), /precedes/);
});
test('capture verifies exact bytes rather than trusting an asserted pin or hash', async () => {
  const times = { asOf: '2026-10-25', captureStartedAt: '2026-10-26T10:00:00Z', collectedAt: '2026-10-26T10:01:00Z' };
  await assert.rejects(captureCoinMetricsEthArchive(fixture(), times), /byte length/);
  await assert.rejects(captureCoinMetricsEthArchive('x'.repeat(COIN_METRICS_ETH_ARCHIVE.bytes), times), /Git blob hash/);
  await assert.rejects(captureCoinMetricsEthArchive(fixture(), { ...times, captureStartedAt: '2026-10-26T10:02:00Z' }), /start/);
  await assert.rejects(captureCoinMetricsEthArchive(fixture(), { ...times, collectedAt: '2026-10-26' }), /explicit UTC/);
});

test('direct aggregation rejects corrupted parsed values and observation clocks', () => {
  const a = parsed(); a.rows[1].metrics.FeeTotNtv = -1;
  assert.throws(() => aggregateCoinMetricsEthWindow(a, '2026-01-29'), /Invalid parsed/);
  const b = parsed(); b.rows[1].observedAt = '2026-01-02T00:00:00.000Z';
  assert.throws(() => aggregateCoinMetricsEthWindow(b, '2026-01-29'), /clock mismatch/);
  const c = parsed(); c.rows[1].metrics.SplyCur = undefined;
  assert.throws(() => aggregateCoinMetricsEthWindow(c, '2026-01-29'), /Invalid parsed/);
});

test('a complete pre-Dencun fee window matches execution fees without inventing remaining inputs or availability',()=>{
  const csv=end=>{const last=Date.parse(end+'T00:00:00Z');return [header,...Array.from({length:28},(_,i)=>{
    const d=last-(27-i)*DAY;return [new Date(d).toISOString().slice(0,10),i,2*i,1000+i,i*10,(d+DAY+3600000)/1000].join(',');
  })].join('\n')+'\n';};
  const before=assessCoinMetricsEconomicCoverage(parseCoinMetricsEthCsv(csv('2024-03-12')),{asOf:'2024-03-12',collectedAt:'2024-03-15T00:00:00Z'});
  assert.equal(before.definitionMatchedMetricCount,1);
  assert.equal(before.partialMetrics.executionFeesEth.value,378);
  assert.equal(before.requirements.find(row=>row.metric==='executionFeesEth').sourceField,'FeeTotNtv');
  assert.equal(before.partialMetrics.executionFeesEth.historicalAvailabilityProven,false);
  assert.equal(before.fullModelSnapshotReady,false);assert.equal(before.historicalPointInTimeReady,false);
  assert.equal(before.eligibleModelSnapshotCount,0);assert.deepEqual(before.modelSnapshots,[]);
  for(const metric of ['blobGasUsed','blobFeesEth','blobBurnEth'])assert.equal(before.requirements.find(row=>row.metric===metric).status,'unavailable');
  const active=assessCoinMetricsEconomicCoverage(parseCoinMetricsEthCsv(csv('2024-03-13')),{asOf:'2024-03-13',collectedAt:'2024-03-15T00:00:00Z'});
  assert.equal(active.definitionMatchedMetricCount,0);assert.deepEqual(active.partialMetrics,{});
  const missing=parseCoinMetricsEthCsv(csv('2024-03-12').split('\n').filter(line=>!line.startsWith('2024-03-01,')).join('\n'));
  assert.equal(assessCoinMetricsEconomicCoverage(missing,{asOf:'2024-03-12',collectedAt:'2024-03-15T00:00:00Z'}).definitionMatchedMetricCount,0);
});
