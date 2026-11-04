import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { migrateHousing,publishHousing,readHousing } from '../../apps/api/src/housing-repository.js';
import { buildServer } from '../../apps/api/src/server.js';
import { analyzeHousing } from '@atlas/domain/housing';
const snapshot=JSON.parse(await readFile(new URL('../../dist/data/housing.json',import.meta.url),'utf8'));
test('housing PostgreSQL: immutable revision, idempotent migration/import, old revision, API/422/503 and route',async()=>{
  if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL required');
  const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL}),schema=`housing_check_${process.pid}_${Date.now()}`;await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}),app=await buildServer({pool,serveWeb:true});
  try{
    await migrateHousing(pool);await migrateHousing(pool);
    const first=await publishHousing(pool,snapshot);assert(first.published);assert.deepEqual(await publishHousing(pool,snapshot),first);
    const bad=structuredClone(snapshot);bad.regions[0].volume[0][1]++;await assert.rejects(publishHousing(pool,bad),/clock collision/);assert.equal((await readHousing(pool))!.revision,first.revision);
    const newer=structuredClone(snapshot);newer.generatedAt=new Date(Date.parse(snapshot.generatedAt)+1000).toISOString();const second=await publishHousing(pool,newer);assert.notEqual(first.revision,second.revision);assert.equal((await readHousing(pool,first.revision))!.revision,first.revision);
    const older=structuredClone(snapshot);older.generatedAt=new Date(Date.parse(snapshot.generatedAt)-1000).toISOString();for(const s of older.sources)s.retrievedAt=older.generatedAt;assert.equal((await publishHousing(pool,older)).published,false);
    const read=await app.inject({url:'/api/v1/housing'});assert.equal(read.statusCode,200);assert.equal(read.json().revision,second.revision);
    const options={region:'busan',window:36,band:10,lag:2,start:'2006-01',end:'2026-09'};
    const response=await app.inject({method:'POST',url:'/api/v1/housing/analysis',payload:{...options,revision:first.revision}});assert.equal(response.statusCode,200);assert.deepEqual(response.json().result,analyzeHousing(snapshot,options));
    assert.equal((await app.inject({method:'POST',url:'/api/v1/housing/analysis',payload:{...options,revision:first.revision,window:24}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/housing/analysis',payload:{...options,revision:first.revision,start:'2026-09',end:'2006-01'}})).statusCode,422);
    assert.equal((await app.inject({url:'/api/v1/housing?revision='+ '0'.repeat(64)})).statusCode,404);
    assert.equal((await app.inject({url:'/api/v1/housing?extra=yes'})).statusCode,400);
    const route=await app.inject({url:'/market-lab/housing/'});assert.equal(route.statusCode,200);assert.match(route.body,/부동산 거래량·가격/);
    const embedded=await app.inject({url:'/market-lab/housing/?embedded=1'});assert.equal(embedded.statusCode,200);assert.match(embedded.body,/\/market-lab\/assets\//);
    await pool.query('UPDATE housing_revisions SET canonical_body=$1 WHERE revision=$2',[JSON.stringify({...newer,indexBase:'changed'}),second.revision]);assert.equal((await app.inject({url:'/api/v1/housing'})).statusCode,503);
  }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
