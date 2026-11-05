import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {migrate,publishSnapshot,readSnapshot} from '../../apps/api/src/repository.js';
import {migrateUsCollection,runUsCollection,readUsCollection,startUsCollection,parseVixCsv} from '../../apps/api/src/us-collector.js';
import {spxDirection} from '@atlas/domain/us-direction';
import {buildServer} from '../../apps/api/src/server.js';
const fixture=JSON.parse(await readFile(new URL('../../dist/data/market-lab.json',import.meta.url),'utf8'));
const gdp=await readFile(new URL('../../docs/plspo-market-lab/raw/GDPC1.csv',import.meta.url),'utf8');
let rate=await readFile(new URL('../../docs/plspo-market-lab/raw/TB3MS.csv',import.meta.url),'utf8');
if(!rate.includes('2026-10-01,'))rate=rate.trim()+'\n2026-10-01,4.05\n';
const vix='observation_date,VIXCLS\n'+fixture.regions.us.axes.gamma.values.map(([date,value]:[string,number])=>`${date},${value.toFixed(2)}`).join('\n');
test('US collector PostgreSQL: complete acquisition, exclusion, no-op, partial failure, atomic receipt, restart and API',async t=>{
  if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL required');
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL}),schema=`us_collect_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
  let time=Date.parse('2026-11-03T15:00:00Z');const clock=()=>new Date(time++);
  let calls=0;let fail=false;
  const fetchImpl:typeof fetch=async url=>{calls++;const id=new URL(String(url)).searchParams.get('id');return new Response(id==='GDPC1'?gdp:id==='TB3MS'?rate:vix,{status:fail&&id==='TB3MS'?503:200});};
  const app=await buildServer({pool,clock});
  try {
    await migrate(pool);await migrateUsCollection(pool);await migrateUsCollection(pool);await publishSnapshot(pool,fixture);
    const original=(await readSnapshot(pool))!;
    await t.test('one owner collects; all three sources and immutable blobs commit with one new revision',async()=>{
      let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);let count=0;
      const delayed:typeof fetch=async(...args)=>{if(++count===3)entered();await gate;return fetchImpl(...args);};
      const first=runUsCollection(pool,{fetchImpl:delayed,clock,force:true});await started;
      assert.equal((await runUsCollection(pool,{fetchImpl,clock,force:true})).status,'busy');release();
      assert.equal((await first).status,'published');assert.equal(calls,3);
      const current=(await readSnapshot(pool))!;assert.notEqual(current.revision,original.revision);
      assert.deepEqual(current.snapshot.regions.kr,original.snapshot.regions.kr);
      assert.deepEqual(current.snapshot.markets,original.snapshot.markets);
      assert.deepEqual((await readSnapshot(pool,original.revision))!.snapshot,original.snapshot);
      assert.deepEqual(current.snapshot.regions.us.axes.beta.values.at(-1),['2026-10-31',4.05]);
      const source=current.snapshot.sources.find(s=>s.id===current.snapshot.regions.us.axes.gamma.sourceId)!;assert.match(source.linkLabel!,/FRED/);assert.doesNotMatch(String(source.priceBasis),/Yahoo/);
      assert.equal((await readUsCollection(pool)).latest?.revision,current.revision);
      assert.equal(+(await pool.query('SELECT count(*) FROM market_lab_source_payloads')).rows[0].count,3);
    });
    await t.test('unchanged source bytes update check receipt without duplicating snapshots or blobs; not due means no network',async()=>{
      const before=(await readSnapshot(pool))!.revision;
      assert.equal((await runUsCollection(pool,{fetchImpl,clock,force:true})).status,'unchanged');
      assert.equal((await readSnapshot(pool))!.revision,before);assert.equal(calls,6);
      assert.equal((await runUsCollection(pool,{fetchImpl,clock})).status,'not_due');assert.equal(calls,6);
      assert.equal(+(await pool.query('SELECT count(*) FROM market_lab_source_payloads')).rows[0].count,3);
    });
    await t.test('partial error preserves the complete last good revision and original source clocks',async()=>{
      const before=await readSnapshot(pool);fail=true;
      assert.equal((await runUsCollection(pool,{fetchImpl,clock,force:true})).status,'failed');fail=false;
      assert.deepEqual(await readSnapshot(pool),before);
      const status=await readUsCollection(pool);assert.equal(status.latest?.sources.find(v=>v.series==='TB3MS')?.status,'error');assert.equal(status.lastSuccess?.status,'unchanged');
    });
    await t.test('malformed and truncated histories cannot become a successful refresh',async()=>{
      assert.throws(()=>parseVixCsv(vix+'\n2010-01-01,1',clock()),/order/);
      const before=await readSnapshot(pool);
      const truncated:typeof fetch=async url=>new URL(String(url)).searchParams.get('id')==='GDPC1'?new Response(gdp.split('\n').filter((_,i)=>i!==1).join('\n')):fetchImpl(url);
      assert.equal((await runUsCollection(pool,{fetchImpl:truncated,clock,force:true})).status,'failed');assert.deepEqual(await readSnapshot(pool),before);
    });
    await t.test('publication compare-and-set and receipt rollback prevent lost updates or half acceptance',async()=>{
      const current=(await readSnapshot(pool))!,next=structuredClone(current.snapshot);next.generatedAt=clock().toISOString();next.regions.us.axes.beta.values.at(-1)![1]=4.1;
      await assert.rejects(publishSnapshot(pool,next,original.revision),/SNAPSHOT_CHANGED/);
      const id=randomUUID();await pool.query("INSERT INTO market_lab_collection_runs(id,started_at,status) VALUES ($1,$2,'running')",[id,clock().toISOString()]);
      await assert.rejects(publishSnapshot(pool,next,current.revision,async client=>{await client.query("UPDATE market_lab_collection_runs SET status='published',finished_at=$2,revision=$3 WHERE id=$1",[id,clock().toISOString(),current.revision]);throw new Error('injected receipt failure');}),/injected/);
      assert.equal((await readSnapshot(pool))!.revision,current.revision);
      assert.equal((await pool.query('SELECT status FROM market_lab_collection_runs WHERE id=$1',[id])).rows[0].status,'running');
      assert.equal((await runUsCollection(pool,{fetchImpl,clock,force:true})).status,'unchanged');
      assert.equal((await pool.query('SELECT status FROM market_lab_collection_runs WHERE id=$1',[id])).rows[0].status,'interrupted');
    });
    await t.test('cancellation during database work rolls back publication and its success receipt together',async()=>{
      for(const point of ['snapshot-read','publication-lock','acceptance-receipt']){
        const before=await readSnapshot(pool),beforeCount=(await pool.query('SELECT count(*) FROM market_lab_revisions')).rows[0].count,abort=new AbortController();let interrupted=false;
        const intercept=(sql:unknown)=>{
          const text=String(sql);
          if(point==='snapshot-read'&&text.startsWith('SELECT r.*,p.published_at')||point==='publication-lock'&&text.includes('pg_advisory_xact_lock')||point==='acceptance-receipt'&&text.includes("SET status='published'")){interrupted=true;abort.abort();}
        };
        const delayedPool=new Proxy(pool,{get(target,property){
          if(property==='query')return async(...args:unknown[])=>{const result=await (target.query as Function).apply(target,args);intercept(args[0]);return result;};
          if(property==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(owner,key){
            if(key==='query')return async(...args:unknown[])=>{const result=await (owner.query as Function).apply(owner,args);intercept(args[0]);return result;};
            const value=Reflect.get(owner,key);return typeof value==='function'?value.bind(owner):value;
          }});};
          const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
        }});
        const revised:typeof fetch=async url=>new URL(String(url)).searchParams.get('id')==='GDPC1'?new Response(gdp+'\n'):fetchImpl(url);
        assert.equal((await runUsCollection(delayedPool,{fetchImpl:revised,clock,force:true,signal:abort.signal})).status,'failed',point);
        assert.equal(interrupted,true,point);assert.deepEqual(await readSnapshot(pool),before,point);
        assert.equal((await readUsCollection(pool)).latest?.status,'failed',point);
        assert.equal((await pool.query('SELECT count(*) FROM market_lab_revisions')).rows[0].count,beforeCount,point);
      }
      assert.equal((await runUsCollection(pool,{fetchImpl,clock,force:true})).status,'unchanged');
    });
    await t.test('API exposes the same product and explicit collector state; disabled scheduler never announces active collection',async()=>{
      const market=await app.inject({url:'/api/v1/market-lab'});assert.equal(market.statusCode,200);const body=market.json();assert.deepEqual(body.usDirection,spxDirection(body.snapshot,new Date(body.evaluatedAt)));
      const response=await app.inject({url:'/api/v1/market-lab/collection'});assert.equal(response.statusCode,200);assert.equal(response.json().latest.status,'unchanged');assert.equal(response.json().schedule.enabled,false);
      let network=0;const scheduler=startUsCollection(pool,{fetchImpl:async()=>{network++;throw Error('unexpected network');}});await scheduler.stop();assert.equal(scheduler.status().enabled,false);assert.equal(network,0);
    });
  } finally {await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});


test('cancelled collection never starts transport after a delayed database acquisition and releases its connection',async()=>{
  const abort=new AbortController();let releaseConnect!:(value:unknown)=>void,queries=0,fetches=0,released=0;
  const connection=new Promise(resolve=>{releaseConnect=resolve;});
  const pool={connect:()=>connection} as unknown as pg.Pool;
  const pending=runUsCollection(pool,{signal:abort.signal,fetchImpl:async()=>{fetches++;throw Error('unexpected transport');}});
  abort.abort();releaseConnect({query:async()=>{queries++;throw Error('unexpected query');},release:()=>{released++;}});
  await assert.rejects(pending,{name:'AbortError'});assert.equal(fetches,0);assert.equal(queries,0);assert.equal(released,1);
});
