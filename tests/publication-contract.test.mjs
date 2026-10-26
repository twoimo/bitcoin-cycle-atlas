import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublication, validatePublication, preparePublication, confirmPublication } from '../dist/publication-contract.js';
const commit='a'.repeat(40), digest='b'.repeat(64), otherCommit='c'.repeat(40), otherDigest='d'.repeat(64);
const collected=()=>createPublication({sourceCommit:commit,digest});
const verified=()=>validatePublication(collected(),{checkedDigest:digest,valid:true});
const ready=()=>preparePublication(verified(),{currentCommit:commit,currentDigest:digest});
test('publication needs validation, current source and observed served identity',()=>{
  assert.throws(()=>preparePublication(collected(),{currentCommit:commit,currentDigest:digest}));
  assert.throws(()=>confirmPublication(verified(),{servedCommit:commit,servedDigest:digest}));
  assert.equal(confirmPublication(ready(),{servedCommit:commit,servedDigest:digest}).phase,'confirmed');
});
test('source change supersedes a previously verified candidate',()=>{
  const result=preparePublication(verified(),{currentCommit:otherCommit,currentDigest:digest});
  assert.equal(result.phase,'superseded');
  assert.equal(result.reason,'source-changed');
  assert.throws(()=>confirmPublication(result,{servedCommit:commit,servedDigest:digest}));
});
test('changed files cannot pass on the earlier verification receipt',()=>{
  assert.equal(validatePublication(collected(),{checkedDigest:otherDigest,valid:true}).phase,'held');
  assert.equal(preparePublication(verified(),{currentCommit:commit,currentDigest:otherDigest}).phase,'held');
  assert.equal(validatePublication(collected(),{checkedDigest:digest,valid:false}).phase,'held');
});
test('a successful deploy API result does not replace public identity verification',()=>{
  assert.equal(confirmPublication(ready(),{servedCommit:otherCommit,servedDigest:digest}).phase,'held');
  assert.equal(confirmPublication(ready(),{servedCommit:commit,servedDigest:otherDigest}).phase,'held');
  assert.equal(ready().servedDigest,null);
});
test('state transitions preserve the input and reject malformed identities',()=>{
  const first=collected(); validatePublication(first,{checkedDigest:digest,valid:true});
  assert.equal(first.phase,'collected'); assert(Object.isFrozen(first));
  assert.throws(()=>createPublication({sourceCommit:'main',digest}));
  assert.throws(()=>preparePublication(verified(),{currentCommit:commit,currentDigest:'anything'}));
});
