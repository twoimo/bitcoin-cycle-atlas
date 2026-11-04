import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {axes,themeComparison,validateThemeSnapshot,type ThemeBar,type ThemeJudgment,type ThemeSnapshot} from '@atlas/domain/themes';

const fixture=JSON.parse(await readFile(new URL('../../dist/data/themes.json',import.meta.url),'utf8')) as ThemeSnapshot;
function controlledSnapshot(){
  const snapshot=structuredClone(fixture);
  snapshot.asset.bars=Array.from({length:26},(_,index)=>{
    const day=new Date(Date.parse('2026-04-10T00:00:00Z')+index*86400000).toISOString().slice(0,10);
    return [day,100,120,80,index===1?110:index===5?90:100,1] as ThemeBar;
  });
  snapshot.benchmark.bars=snapshot.asset.bars.map(b=>[b[0],100,100,100,100,1]);
  snapshot.judgments=[];
  for(const mode of ['recorded','reconstructed'] as const)for(const state of ['pass','hold','fail'] as const){
    const judgment:ThemeJudgment={...structuredClone(fixture.judgments[0]),id:`${mode}-${state}`,mode};
    if(mode==='recorded')judgment.recordedAt=judgment.asOf;
    for(const axis of axes)judgment.criteria[axis]={state,reason:'comparison regression fixture',evidenceIds:['bitwise-etp']};
    snapshot.judgments.push(judgment);
  }
  return validateThemeSnapshot(snapshot);
}

test('theme comparison: all 18 groups retain exact horizon, count, direction and return semantics',()=>{
  const snapshot=controlledSnapshot(),groups=themeComparison(snapshot,snapshot.judgments);
  const expected=[];
  for(const mode of ['recorded','reconstructed'])for(const status of ['pass','hold','fail'])for(const horizon of [1,5,20]){
    const mean=horizon===1?100*(110/100-1):horizon===5?100*(90/100-1):0;
    expected.push({mode,status,horizon,records:1,n:1,pending:0,unavailable:0,up:horizon===1?1:0,down:horizon===5?1:0,flat:horizon===20?1:0,mean,excessN:1,meanExcess:mean});
  }
  assert.deepEqual(groups,expected);
});

test('theme comparison: benchmark gaps, price gaps, missing entry and pending windows stay distinct',()=>{
  const snapshot=controlledSnapshot();
  snapshot.benchmark.bars=snapshot.benchmark.bars.filter(b=>b[0]!=='2026-04-12');
  let groups=themeComparison(snapshot,snapshot.judgments);
  assert(groups.filter(g=>g.horizon>1).every(g=>g.n===1&&g.excessN===0&&g.meanExcess===null));
  snapshot.asset.bars=snapshot.asset.bars.filter(b=>b[0]!=='2026-04-12');
  groups=themeComparison(snapshot,snapshot.judgments);
  assert(groups.filter(g=>g.horizon>1).every(g=>g.n===0&&g.unavailable===1&&g.mean===null));
  assert(groups.filter(g=>g.horizon===1).every(g=>g.n===1&&g.excessN===1));
  snapshot.asset.bars=snapshot.asset.bars.filter(b=>b[0]!=='2026-04-10');
  assert(themeComparison(snapshot,snapshot.judgments).every(g=>g.unavailable===1));
  for(const judgment of snapshot.judgments){judgment.asOf='2026-05-05T23:59:59.999Z';if(judgment.mode==='recorded')judgment.recordedAt=judgment.asOf;}
  assert(themeComparison(snapshot,snapshot.judgments).every(g=>g.pending===1&&g.n===0&&g.unavailable===0&&g.mean===null));
});

test('theme comparison: request-local indexes observe replacement bars and reject invalid judgments',()=>{
  const snapshot=controlledSnapshot(),before=themeComparison(snapshot,snapshot.judgments);
  snapshot.asset.bars=snapshot.asset.bars.map(b=>b[0]==='2026-04-11'?[b[0],100,130,80,120,1]:b);
  const after=themeComparison(snapshot,snapshot.judgments);
  assert.notDeepEqual(after,before);
  assert(after.filter(g=>g.horizon===1).every(g=>g.mean===100*(120/100-1)));
  assert.deepEqual(after.filter(g=>g.horizon!==1),before.filter(g=>g.horizon!==1));
  const empty=themeComparison(snapshot,[]);
  assert.equal(empty.length,18);
  assert(empty.every(g=>g.records===0&&g.n===0&&g.mean===null&&g.meanExcess===null));
  snapshot.judgments[0].criteria.novelty.evidenceIds=['nonexistent'];
  assert.throws(()=>themeComparison(snapshot,snapshot.judgments),/근거/);
});
