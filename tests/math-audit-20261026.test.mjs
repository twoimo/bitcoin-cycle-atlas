import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildDetailedForecast } from '../dist/detailed-forecast.js';
import { buildAssetComparison } from '../dist/asset-comparison.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/btc-daily-2026-10-20.json', import.meta.url), 'utf8'));
const refreshed = { ...fixture, prices: [...fixture.prices,
  ['2026-10-21', 80000], ['2026-10-22', 80500], ['2026-10-23', 81000],
] };

test('the implicit detailed forecast reference advances with a refreshed daily archive', () => {
  const implicit = buildDetailedForecast(refreshed, { sampleCount: 16 });
  const explicit = buildDetailedForecast(refreshed, { sampleCount: 16, referenceDate: '2026-10-24' });
  assert.equal(implicit.asOf, '2026-10-23');
  assert.equal(implicit.referenceDate, '2026-10-24');
  assert.deepEqual(implicit, explicit);
});

test('detailed forecast refresh keeps the frozen historical reference and rejects an explicit expired one', () => {
  assert.equal(buildDetailedForecast(fixture, { sampleCount: 16 }).referenceDate, '2026-10-22');
  assert.throws(() => buildDetailedForecast(refreshed, { sampleCount: 16, referenceDate: '2026-10-22' }), /referenceDate must follow/);
});

function comparison(latest, { rises = [10, 30, 10, 30, 20], falls = [10, 30, 10, 30, 20], scale = 1 } = {}) {
  const prices = [];
  for (let year = 2021; year <= 2025; year++) {
    for (let time = Date.parse(`${year}-01-01T00:00:00Z`), index = 0; time <= Date.parse(`${year}-12-31T00:00:00Z`); time += 86400000, index++) {
      const price = index === 1 ? 100 + rises[year - 2021] : index === 2 ? 100 - falls[year - 2021] : 100;
      prices.push([new Date(time).toISOString().slice(0, 10), price * scale]);
    }
  }
  prices.push(['2026-01-01', 100 * scale], ['2026-01-02', latest * scale]);
  const bundle = { version: 1, assets: [{ symbol: 'TEST', name: 'Synthetic boundary fixture', group: 'test', category: 'test', currency: 'USD', prices, meta: { calendar: 'calendar-days', adjustment: 'none' } }] };
  return buildAssetComparison(bundle, { asOfDate: '2026-01-02' }).rows[0];
}

test('asset judgment reaches an exact mean-rise boundary despite arithmetic roundoff', () => {
  // Equal weights: (10 + 30 + 10 + 30 + 20) / 5 = 20%; 100 → 120 is 20%.
  for (const scale of [0.01, 1, 10, 1000]) {
    assert.equal(comparison(120, { scale }).judgment.id, 'strong-sell');
    // Equal weights: mean rise 40%; 100 → 120 reaches its half boundary.
    assert.equal(comparison(120, { scale, rises: [20, 60, 20, 60, 40] }).judgment.id, 'sell');
    assert.equal(comparison(80, { scale }).judgment.id, 'strong-buy');
    assert.equal(comparison(90, { scale }).judgment.id, 'buy');
  }
});

test('asset judgment keeps distinct unrounded sides of every boundary', () => {
  const sides = [
    [79.99999999, 'strong-buy'], [80.00000001, 'buy'],
    [89.99999999, 'buy'], [90.00000001, 'neutral'],
    [109.99999999, 'neutral'], [110.00000001, 'sell'],
    [119.99999999, 'sell'], [120.00000001, 'strong-sell'],
  ];
  for (const scale of [0.01, 1, 1000]) for (const [latest, stage] of sides) {
    assert.equal(comparison(latest, { scale }).judgment.id, stage, `price ${latest}, scale ${scale}`);
  }
});
