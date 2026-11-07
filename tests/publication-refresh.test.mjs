import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationRefreshAttempts, publicationAsset } from '../scripts/build-publication.mjs';

test('the second Build retains actual optional-provider failure and original observation clock', () => {
  const outcomes={eth:{outcome:'failure',attemptedAt:'2026-11-07T01:00:00.000Z'}},provenance={provider:'cloudflare-workers-builds',receiptCommit:'a'.repeat(40)};
  const selected=publicationRefreshAttempts({outcomes,provenance});
  assert.deepEqual(selected,{outcomes,provenance});
  const asset=publicationAsset({prices:[['2026-11-04',123]],meta:{retrievedAt:'2026-11-05T00:00:00Z'}},
    {symbol:'ETHUSD',role:'chart',sourcePath:'data/eth-ohlc.json',market:'crypto',outcome:selected.outcomes.eth},'2026-11-07T02:00:00Z');
  assert.equal(asset.freshness.lastOutcome,'failure');
  assert.equal(asset.freshness.lastAttemptAt,outcomes.eth.attemptedAt);
  assert.equal(asset.freshness.observedAt,'2026-11-05T00:00:00Z');
});

test('a supplied environment cannot replace a source-bound provider failure with success', () => {
  const committed={outcomes:{eth:{outcome:'failure',attemptedAt:'2026-11-07T01:00:00.000Z'}},provenance:{receiptCommit:'a'.repeat(40)}};
  assert.deepEqual(publicationRefreshAttempts(committed,structuredClone(committed.outcomes)),committed);
  assert.throws(()=>publicationRefreshAttempts(committed,{eth:{...committed.outcomes.eth,outcome:'success'}}),/conflict/);
  assert.deepEqual(publicationRefreshAttempts({outcomes:{},provenance:null},{btc:{outcome:'success'}}),{outcomes:{btc:{outcome:'success'}},provenance:null});
});
