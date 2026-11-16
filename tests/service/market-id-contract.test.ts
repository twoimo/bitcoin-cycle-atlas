import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MARKET_IDS } from '@atlas/contracts/market-lab';
import { validateSnapshot } from '@atlas/domain/market-lab';

const fixture = JSON.parse(await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8'));
const withMarketId = (id: string) => ({ ...fixture, markets: [{ ...fixture.markets[0], id }] });

// The frozen domain file keeps this list inline and exports no value that holds it.
async function acceptedMarketIds() {
  const source = await readFile(new URL('../../packages/domain/src/market-lab-math.js', import.meta.url), 'utf8');
  const lists = [...source.matchAll(/\[((?:'[^']+',?)+)\]\.includes\(m\.id\)/g)];
  assert.equal(lists.length, 1, 'validateSnapshot must keep exactly one inline market id list');
  return [...lists[0][1].matchAll(/'([^']+)'/g)].map(match => match[1]);
}

test('MarketId lists exactly the market ids that validateSnapshot enforces', async () => {
  assert.deepEqual([...MARKET_IDS].sort(), (await acceptedMarketIds()).sort(), 'update packages/contracts/src/market-lab.ts MARKET_IDS and the frozen domain list together');
});

test('validateSnapshot accepts every MarketId and rejects an id outside the contract', () => {
  for (const id of MARKET_IDS) assert.equal(validateSnapshot(withMarketId(id)).markets[0].id, id);
  for (const id of ['vix', 'btc', '']) assert.throws(() => validateSnapshot(withMarketId(id)), /관측 시장의 식별 정보를 확인하세요/, id);
});
