import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type pg from 'pg';
import {snapshotIdentity,publishSnapshot} from '../../apps/api/src/repository.js';
import {runUsCollection} from '../../apps/api/src/us-collector.js';

const fixture=JSON.parse(await readFile(new URL('../../dist/data/market-lab.json',import.meta.url),'utf8'));
const original=snapshotIdentity(fixture);
const clock=()=>new Date(Math.max(Date.parse(fixture.generatedAt)+1000,Date.parse('2026-11-04T12:00:00Z')));
const gdp=await readFile(new URL('../../docs/plspo-market-lab/raw/GDPC1.csv',import.meta.url),'utf8');
const rate=await readFile(new URL('../../docs/plspo-market-lab/raw/TB3MS.csv',import.meta.url),'utf8');
const vix='observation_date,VIXCLS\n'+fixture.regions.us.axes.gamma.values.map(([date,value]:[string,number])=>`${date},${value}`).join('\n');
const fetchImpl:typeof fetch=async url=>new Response(new URL(String(url)).searchParams.get('id')==='GDPC1'?gdp:new URL(String(url)).searchParams.get('id')==='TB3MS'?rate:vix);

function database(abort:AbortController,point:string){
  let status='running',published=original.revision,transaction=false,accepted=false,commits=0,releases=0;
  let pendingRevision=original.revision;
  const result=(rows:unknown[]=[])=>({rows,rowCount:rows.length});
  const query=async(sql:string,values:unknown[]=[])=>{
    if(sql==='BEGIN'){transaction=true;return result();}
    if(sql==='COMMIT'){commits++;if(accepted){status='published';published=pendingRevision;}transaction=false;return result();}
    if(sql==='ROLLBACK'){transaction=false;accepted=false;return result();}
    if(sql.includes('pg_try_advisory_lock'))return result([{locked:true}]);
    if(sql.includes('pg_advisory_xact_lock')){if(point==='publication-lock')abort.abort();return result();}
    if(sql.startsWith('SELECT started_at'))return result();
    if(sql.startsWith('SELECT status,revision'))return result([{status,revision:published}]);
    if(sql.startsWith('SELECT r.revision'))return result([{revision:original.revision,generated_at:new Date(fixture.generatedAt)}]);
    if(sql.startsWith('INSERT INTO market_lab_revisions')){pendingRevision=String(values[0]);return result([{revision:pendingRevision}]);}
    if(sql.includes("SET status='published'")){assert.ok(transaction);accepted=true;if(point==='acceptance-receipt')abort.abort();return result();}
    if(sql.includes("SET status='failed'")){status='failed';return result();}
    return result();
  };
  const pool={
    connect:async()=>({query,release:()=>{releases++;}}),
    query:async()=>{
      if(point==='snapshot-read')abort.abort();
      return result([{canonical_body:original.body,revision:original.revision,generated_at:new Date(fixture.generatedAt),imported_at:new Date(fixture.generatedAt),first_published_at:new Date(fixture.generatedAt)}]);
    },
  } as unknown as pg.Pool;
  return {pool,state:()=>({status,published,commits,releases})};
}

for(const point of ['snapshot-read','publication-lock','acceptance-receipt'])test(`collector cancellation at ${point} preserves the last accepted snapshot`,async()=>{
  const abort=new AbortController(),db=database(abort,point);
  const result=await runUsCollection(db.pool,{signal:abort.signal,fetchImpl,clock,force:true});
  assert.equal(result.status,'failed');
  assert.equal(db.state().published,original.revision);
  assert.equal(db.state().status,'failed');
  assert.equal(db.state().commits,0);
  assert.ok(db.state().releases>=1);
});

test('the same acquisition without cancellation reaches publication and its receipt',async()=>{
  const abort=new AbortController(),db=database(abort,'none');
  const result=await runUsCollection(db.pool,{signal:abort.signal,fetchImpl,clock,force:true});
  assert.equal(result.status,'published');
  assert.notEqual(db.state().published,original.revision);
  assert.equal(db.state().status,'published');
  assert.equal(db.state().commits,1);
  assert.equal(db.state().releases,2);
});

test('cancellation queued by the acceptance callback is checked at the commit owner',async()=>{
  const abort=new AbortController(),db=database(abort,'none'),next=structuredClone(fixture);
  next.generatedAt=clock().toISOString();
  await assert.rejects(publishSnapshot(db.pool,next,original.revision,async()=>{
    queueMicrotask(()=>abort.abort());
  },abort.signal),{name:'AbortError'});
  assert.equal(db.state().commits,0);
  assert.equal(db.state().published,original.revision);
  assert.equal(db.state().releases,1);
});
