import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectEthereumEconomicSnapshots,buildEthereumEconomicCandidate} from '../dist/ethereum-economic-model.js';
import {fixture} from './helpers/eth-economic-fixture.mjs';

test('provided snapshot count never stands in for actual full-input qualification',()=>{
  const f=fixture(64),bad=structuredClone(f.economicSnapshots.at(-1));
  delete bad.metrics.blobFeesEth;
  const d=inspectEthereumEconomicSnapshots({economicSnapshots:[bad],asOf:f.asOf});
  assert.equal(d.providedSnapshots,1);assert.equal(d.status,'invalid-input');
  assert.equal(d.definitionAndTimeQualifiedSnapshots,null);assert.equal(d.currentSnapshotAvailable,false);
  assert.match(d.reason,/blobFeesEth/);
  assert.equal(buildEthereumEconomicCandidate({...f,economicSnapshots:[bad]}).status,'unavailable');
});

test('empty, deferred and duplicate snapshots retain distinct provided and qualified counts',()=>{
  const f=fixture(64),last=f.economicSnapshots.at(-1),future=structuredClone(last);
  future.collectedAt='2027-01-01T00:00:00.000Z';
  const empty=inspectEthereumEconomicSnapshots({asOf:f.asOf});
  assert.equal(empty.providedSnapshots,0);assert.equal(empty.definitionAndTimeQualifiedSnapshots,0);
  const deferred=inspectEthereumEconomicSnapshots({economicSnapshots:[future],asOf:f.asOf});
  assert.equal(deferred.providedSnapshots,1);assert.equal(deferred.definitionAndTimeQualifiedSnapshots,0);
  const dedup=inspectEthereumEconomicSnapshots({economicSnapshots:[last,structuredClone(last)],asOf:f.asOf});
  assert.equal(dedup.providedSnapshots,2);assert.equal(dedup.definitionAndTimeQualifiedSnapshots,1);
});

test('qualified but stale history does not become current model readiness',()=>{
  const f=fixture(64),s=f.economicSnapshots[0];
  const d=inspectEthereumEconomicSnapshots({economicSnapshots:[s],asOf:f.asOf});
  assert.equal(d.status,'inspected');assert.equal(d.definitionAndTimeQualifiedSnapshots,1);
  assert.equal(d.currentSnapshotAvailable,false);assert.equal(d.currentSnapshot,null);
  assert.equal(d.modelReady,false);assert.equal(d.sourceAuthenticityVerified,false);
});

test('a fresh structurally valid input does not certify enough labels or a real historical vintage',()=>{
  const f=fixture(64),d=inspectEthereumEconomicSnapshots({economicSnapshots:f.economicSnapshots,asOf:f.asOf});
  assert.equal(d.definitionAndTimeQualifiedSnapshots,f.economicSnapshots.length);
  assert.equal(d.currentSnapshotAvailable,true);assert.equal(d.currentSnapshot.observedThrough,f.asOf);
  assert.equal(d.modelReady,false);assert.equal(d.historicalVintagesVerified,false);
  assert.equal(buildEthereumEconomicCandidate(f).status,'unavailable');
});

test('same-time conflicting vintages and invalid issue clocks cannot be labeled eligible',()=>{
  const f=fixture(64),a=f.economicSnapshots.at(-1),b=structuredClone(a);b.metrics.l1GasUsed++;
  const d=inspectEthereumEconomicSnapshots({economicSnapshots:[a,b],asOf:f.asOf});
  assert.equal(d.status,'invalid-input');assert.equal(d.definitionAndTimeQualifiedSnapshots,null);
  assert.match(d.reason,/Ambiguous|Conflicting/);
  const badClock=inspectEthereumEconomicSnapshots({economicSnapshots:[a],asOf:f.asOf,issuedAt:f.asOf+'T12:00:00Z'});
  assert.equal(badClock.status,'invalid-input');assert.equal(badClock.definitionAndTimeQualifiedSnapshots,null);
});

test('later unavailable malformed fields do not contaminate the already known input prefix',()=>{
  const f=fixture(64),known=f.economicSnapshots.at(-1),future=structuredClone(known);
  future.collectedAt='2027-01-01T00:00:00Z';future.metrics.blobFeesEth=NaN;
  const before=inspectEthereumEconomicSnapshots({economicSnapshots:[known],asOf:f.asOf});
  const after=inspectEthereumEconomicSnapshots({economicSnapshots:[known,future],asOf:f.asOf});
  assert.equal(after.status,'inspected');assert.equal(after.definitionAndTimeQualifiedSnapshots,1);
  assert.deepEqual(after.currentSnapshot,before.currentSnapshot);assert.equal(after.providedSnapshots,2);
});
