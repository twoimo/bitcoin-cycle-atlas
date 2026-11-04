import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderToStaticMarkup} from 'react-dom/server';
import {diagnoseRegion} from '@atlas/domain/market-lab';
import {spxDirection} from '@atlas/domain/us-direction';
import type {MarketSnapshot} from '@atlas/contracts/market-lab';
import {DiagnosisPanel} from '../../apps/web/src/panels/diagnosis-panel.js';
import {validateUsCollection,loadUsCollection,collectionMatchesSnapshot} from '../../apps/web/src/us-collection.js';
import {UsDirection} from '../../apps/web/src/components/us-direction.js';
import type {UsCollectionStatus} from '@atlas/contracts/us-collection';
const fixture:MarketSnapshot=JSON.parse(await readFile(new URL('../../dist/data/market-lab.json',import.meta.url),'utf8'));
const now=new Date('2026-11-03T15:00:00Z');
function withFactors(signs:number[]) {
  const snapshot=structuredClone(fixture),initial=diagnoseRegion(snapshot,'us',{now});
  initial.axes.forEach((axis,i)=>{const rows=snapshot.regions.us.axes[axis.key].values;rows.at(-1)![1]=axis.calibration.center!+axis.direction*axis.calibration.scale!*signs[i];});
  return snapshot;
}
test('SPX product signs: all 27 sign/zero combinations, two negatives, clipped magnitudes; legacy average unchanged',()=>{
  for(const a of [-1,0,1])for(const b of [-1,0,1])for(const c of [-1,0,1]){
    const snapshot=withFactors([a,b,c]),before=diagnoseRegion(snapshot,'us',{now}),result=spxDirection(snapshot,now),product=a*b*c;
    assert.equal(result.direction,product===0?null:product>0?'UP':'DOWN');
    assert.deepEqual(diagnoseRegion(snapshot,'us',{now}),before);
    if(product!==0)assert(Math.abs(result.product!-product)<1e-10);
  }
  assert.equal(spxDirection(withFactors([-10,-10,1]),now).direction,'UP');
});
test('SPX unavailable, expired and future source cannot produce a direction',()=>{
  for(const change of [(s:MarketSnapshot)=>{s.sources.find(v=>v.id===s.regions.us.axes.beta.sourceId)!.status='error';},(s:MarketSnapshot)=>{s.sources[0].retrievedAt='2030-01-01T00:00:00Z';s.generatedAt='2030-01-01T00:00:00Z';},(s:MarketSnapshot)=>{s.regions.us.axes.gamma.values=s.regions.us.axes.gamma.values.filter(v=>v[0]<'2026-10-01');}]){
    const s=structuredClone(fixture);change(s);assert.equal(spxDirection(s,now).direction,null);assert.equal(spxDirection(s,now).product,null);
  }
});
test('US diagnosis shows product direction, cadence and preserved average; Korean view stays independent',()=>{
  const render=(region:'us'|'kr',snapshot=fixture)=>renderToStaticMarkup(<DiagnosisPanel snapshot={snapshot} region={region} now={now} marketId={null} priceIndex={null} onMarket={()=>{}} onDate={()=>{}}/>);
  const html=render('us',withFactors([1,1,-1]));assert.match(html,/data-direction="DOWN"/);assert.match(html,/α × β × γ/);assert.match(html,/분기 발표/);assert.match(html,/월간 발표/);assert.match(html,/일별 종가/);assert.match(html,/기존 평균 점수/);assert.doesNotMatch(html,/NaN|Infinity|적중률/);
  assert.doesNotMatch(render('kr'),/S&amp;P 500 모형 방향|ml-direction-panel/);
  assert.match(render('us',withFactors([1,0,1])),/판정 대기/);
});
test('collection status decoder and loader reject malformed, duplicate and unsuccessful records',async()=>{
  const base={schemaVersion:1,evaluatedAt:now.toISOString(),schedule:{enabled:true,running:false,intervalMs:900000,nextDueAt:now.toISOString()},latest:null,lastSuccess:null};
  assert.deepEqual(validateUsCollection(base),base);
  const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
  assert.deepEqual(await loadUsCollection(new AbortController().signal,async()=>response(base)),base);
  await assert.rejects(loadUsCollection(new AbortController().signal,async()=>response({},503)));
  for(const invalid of [{...base,schedule:{...base.schedule,intervalMs:0}},{...base,lastSuccess:{status:'failed'}},{...base,latest:{id:'bad'}}])assert.throws(()=>validateUsCollection(invalid));
});
test('collection clocks cannot certify a displayed snapshot with different source bytes',()=>{
  const snapshot=structuredClone(fixture);
  const sources=(['alpha','beta','gamma'] as const).map((axis,i)=>{
    const source=snapshot.sources.find(source=>source.id===snapshot.regions.us.axes[axis].sourceId)!;
    source.responseSha256=String(i).repeat(64);
    return {axis,series:(['GDPC1','TB3MS','VIXCLS'] as const)[i],url:source.url,status:'ready' as const,checkedAt:now.toISOString(),sha256:String(i).repeat(64),rows:200,lastObservation:snapshot.regions.us.axes[axis].values.at(-1)![0]};
  });
  const run={id:'a5d01593-ccdd-43c4-b03c-4ed0e843d44b',startedAt:now.toISOString(),finishedAt:now.toISOString(),status:'unchanged' as const,revision:'a'.repeat(64),sources,error:null};
  const collection:UsCollectionStatus={schemaVersion:1,evaluatedAt:now.toISOString(),schedule:{enabled:true,running:false,intervalMs:900000,nextDueAt:new Date(+now+900000).toISOString()},latest:run,lastSuccess:run};
  assert(collectionMatchesSnapshot(snapshot,validateUsCollection(collection)));
  const changed=structuredClone(collection);changed.lastSuccess!.sources[2].sha256='f'.repeat(64);
  assert(!collectionMatchesSnapshot(snapshot,changed));
  const html=renderToStaticMarkup(<UsDirection snapshot={snapshot} now={now} collection={changed} error="" saved={false} onRefresh={()=>{}}/>);
  assert.match(html,/새 자료 반영 중/);assert.doesNotMatch(html,/공식 자료 확인 완료/);
  const invalid=structuredClone(collection);invalid.lastSuccess!.sources.pop();assert.throws(()=>validateUsCollection(invalid));
});
