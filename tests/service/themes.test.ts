import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {migrateThemes,publishThemes,readThemes,saveThemeJudgment,readThemeReceipt} from '../../apps/api/src/theme-repository.js';
import {buildServer} from '../../apps/api/src/server.js';
const snapshot=JSON.parse(await readFile(new URL('../../dist/data/themes.json',import.meta.url),'utf8'));
test('themes DB/API: append-only decisions, concurrent idempotency, rejected future evidence, readback and route',async()=>{
  if(!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL required');const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL}),schema=`themes_check_${process.pid}_${Date.now()}`;await admin.query(`CREATE SCHEMA ${schema}`);const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}),clock=()=>new Date(Date.parse(snapshot.generatedAt)+60000),app=await buildServer({pool,clock,serveWeb:true});
  try{await migrateThemes(pool);await migrateThemes(pool);const {revision}=await publishThemes(pool,snapshot);assert.equal((await publishThemes(pool,snapshot)).revision,revision);
    const original=(await readThemes(pool))!,payload={requestId:randomUUID(),revision,draft:{title:'저장 검증',criteria:structuredClone(snapshot.judgments[2].criteria)}};
    const writes=await Promise.all([saveThemeJudgment(pool,payload,clock),saveThemeJudgment(pool,payload,clock)]);assert.equal(writes.filter(r=>r.created).length,1);assert.deepEqual(writes[0].judgment,writes[1].judgment);assert.equal(writes[0].judgment.asOf,clock().toISOString());assert.equal(writes[0].judgment.mode,'recorded');assert.equal((await readThemes(pool))!.judgments.length,4);assert.deepEqual((await readThemeReceipt(pool,payload.requestId))!.judgment,writes[0].judgment);
    await assert.rejects(saveThemeJudgment(pool,{...payload,draft:{...payload.draft,title:'다른 내용'}},clock),/IDEMPOTENCY_CONFLICT/);
    const response=await app.inject({method:'POST',url:'/api/v1/themes/judgments',payload});assert.equal(response.statusCode,200);assert.deepEqual(response.json().judgment,writes[0].judgment);
    const conflict=await app.inject({method:'POST',url:'/api/v1/themes/judgments',payload:{...payload,draft:{...payload.draft,title:'새 내용'}}});assert.equal(conflict.statusCode,409);
    const another={...payload,requestId:randomUUID(),draft:{...payload.draft,title:'두 번째 기록'}};const created=await app.inject({method:'POST',url:'/api/v1/themes/judgments',payload:another});assert.equal(created.statusCode,201);const loaded=await app.inject({url:'/api/v1/themes'});assert.equal(loaded.statusCode,200);assert.equal(loaded.json().judgments.length,5);assert.deepEqual(loaded.json().snapshot,original.snapshot,'writes never change the sealed price/source snapshot');
    const receipt=await app.inject({url:`/api/v1/themes/receipts/${another.requestId}`});assert.equal(receipt.statusCode,200);assert.equal(receipt.json().judgment.title,'두 번째 기록');assert.equal((await app.inject({url:`/api/v1/themes/receipts/${randomUUID()}`})).statusCode,404);
    const invalid=structuredClone(another);invalid.requestId=randomUUID();invalid.draft.criteria.continuity.evidenceIds=['missing'];assert.equal((await app.inject({method:'POST',url:'/api/v1/themes/judgments',payload:invalid})).statusCode,422);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/themes/judgments',payload:{...another,asOf:'2020-01-01'}})).statusCode,400,'client cannot backdate a recorded judgment');
    assert.equal((await app.inject({url:'/market-lab/themes/'})).statusCode,200);assert.equal((await app.inject({url:'/market-lab/themes/?embedded=1'})).statusCode,200);
    const corrupted=JSON.stringify({...writes[0].judgment,title:'tampered'});await pool.query('UPDATE theme_judgments SET canonical_body=$1 WHERE request_id=$2',[corrupted,payload.requestId]);assert.equal((await app.inject({url:`/api/v1/themes/receipts/${payload.requestId}`})).statusCode,503);assert.equal((await app.inject({url:'/api/v1/themes'})).statusCode,503);
  }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
