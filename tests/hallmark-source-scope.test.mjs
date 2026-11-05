import test from 'node:test';
import assert from 'node:assert/strict';
import {countHallmarkSources,verifyHallmarkSourceScope} from '../scripts/hallmark-source-scope.mjs';

const baseline=['index.html','mobile-preview.html',...Array.from({length:24},(_,index)=>`styles/screen-${index}.css`),'app.js'];

test('Hallmark scope: added pages/styles remain in the full static scan without changing the pinned baseline',()=>{
  const current=[...baseline,'market-lab/app/index.html','market-lab/us/index.html','market-lab/app/assets/index-aLhLaYOa.css','market-lab/app/assets/index-DA-MnXHe.js'];
  const receipt=verifyHallmarkSourceScope(baseline,current);
  assert.deepEqual(receipt.baseline,{css:24,html:2});
  assert.deepEqual(receipt.current,{css:25,html:4});
  assert.equal(receipt.preservedBaselinePaths.length,26);
  assert.equal(countHallmarkSources(current).css+countHallmarkSources(current).html,29);
});

test('Hallmark scope: deleting either real baseline screen fails even with an unrelated same-count replacement',()=>{
  for(const missing of ['index.html','mobile-preview.html']){
    const current=baseline.filter(path=>path!==missing).concat('unrelated-screen.html');
    assert.deepEqual(countHallmarkSources(current),countHallmarkSources(baseline));
    assert.throws(()=>verifyHallmarkSourceScope(baseline,current),error=>error.message.includes(missing)&&error.message.includes('every baseline'));
  }
});

test('Hallmark scope: deleting a baseline stylesheet fails despite equal or greater aggregate coverage',()=>{
  for(const replacement of [['unrelated.css'],['unrelated.css','additional.css','added/index.html']]){
    const current=baseline.filter(path=>path!=='styles/screen-7.css').concat(replacement);
    assert.throws(()=>verifyHallmarkSourceScope(baseline,current),/styles\/screen-7\.css/);
  }
});

test('Hallmark scope: the fixed baseline still requires exactly 24 CSS and two HTML inputs',()=>{
  for(const changed of [baseline.slice(1),baseline.concat('extra.html'),baseline.concat('extra.css')]){
    assert.throws(()=>verifyHallmarkSourceScope(changed,changed),/Pinned baseline inventory changed/);
  }
});
