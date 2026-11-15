import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { createPool, migrate, publishSnapshot, readSnapshot, snapshotIdentity } from '../../apps/api/src/repository.js';
import { buildServer } from '../../apps/api/src/server.js';
import { diagnoseRegion, calculateRsiSeries, positiveFactorScenario, assetEconomics } from '@atlas/domain/market-lab';
import { loadSnapshot } from '../../apps/web/src/load-snapshot.js';
import { refreshMarketLab } from '../../scripts/refresh-market-lab.mjs';

const fixture = JSON.parse(await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8'));
const fixtureTime=Date.parse(fixture.generatedAt);
const now = new Date(fixtureTime+3*86400000);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required; service checks must exercise real PostgreSQL');

test('canonical domain preserves original formulas with reviewed instrument and RSI boundary guards', async () => {
  const canonical = await readFile(new URL('../../packages/domain/src/market-lab-math.js', import.meta.url));
  const published = await readFile(new URL('../../dist/market-lab-math.js', import.meta.url));
  assert.deepEqual(canonical, published);
  // Keep the migration's original source hash. Only these exact reviewed edits
  // may differ: two instrument identities and three RSI input-range guards.
  // Wilder seeding, recurrence, signal averaging and all other formulas remain
  // covered by the original hash. Runtime edge cases have separate regressions.
  const approvedEdits = [
    ["tqqq:'America/New_York', soxl:'America/New_York', 'kodex-kosdaq150':'Asia/Seoul', vix:", "tqqq:'America/New_York', vix:"],
    ["['spx','nasdaq','kospi','kosdaq','tqqq','soxl','kodex-kosdaq150'].includes(m.id)", "['spx','nasdaq','kospi','kosdaq','tqqq'].includes(m.id)"],
    ['  if (!prices.length) return [];\n', ''],
    ['  let factor = anchor < 1 ? Math.min(1/anchor,Number.MAX_VALUE) : 1;\n', '  const factor = anchor > 0 && anchor < 1 ? 1/anchor : 1;\n'],
    [`      const change=close-prices[i-1][1];
      if (!Number.isFinite(change*factor)) {
        // Both Wilder averages must change units together. Only this observed
        // prefix sets the scale; a later large price cannot rewrite earlier RSI.
        const nextFactor=1/Math.max(close,prices[i-1][1]),ratio=nextFactor/factor;
        avgGain*=ratio;avgLoss*=ratio;factor=nextFactor;
      }
      const delta=change*factor,gain=Math.max(delta,0),loss=Math.max(-delta,0);`,
    '      const delta=(close-prices[i-1][1])*factor,gain=Math.max(delta,0),loss=Math.max(-delta,0);'],
  ];
  let originalSource = canonical.toString();
  for (const [reviewed, original] of approvedEdits) {
    assert.equal(originalSource.split(reviewed).length - 1, 1, 'Each approved source edit must occur exactly once');
    originalSource = originalSource.replace(reviewed, original);
  }
  assert.equal(createHash('sha256').update(originalSource).digest('hex'), snapshotMathHash);
});
const snapshotMathHash = '04f76285edfd22996dc3bc922f98e9e5baeca70a4a137310b72c57370159176a';

test('React loader verifies API content, marks saved fallback, and rejects unavailable data', async () => {
  const { revision } = snapshotIdentity(fixture);
  const deliveries: string[] = [];
  const envelope = { schemaVersion: 1, revision, evaluatedAt: now.toISOString(), snapshot: fixture };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  const request = async (url: string | URL | Request) => json(String(url).startsWith('/api') ? envelope : fixture);
  const result = await loadSnapshot({ fetchImpl: request, onDelivery: state => deliveries.push(state.kind) });
  assert.deepEqual(result, fixture); assert.deepEqual(deliveries, ['api']);
  const calls: string[] = [];
  const saved = await loadSnapshot({ fetchImpl: async url => {
    calls.push(String(url)); return String(url).startsWith('/api') ? json({ ...envelope, revision: '0'.repeat(64) }) : json(fixture);
  }, onDelivery: state => deliveries.push(state.kind) });
  assert.deepEqual(saved, fixture); assert.equal(deliveries.at(-1), 'saved');
  assert.deepEqual(calls, ['/api/v1/market-lab', '/data/market-lab.json']);
  await assert.rejects(loadSnapshot({ fetchImpl: async () => json({}, 503) }), /HTTP 503/);
  const abort = new AbortController(); abort.abort();
  let requests = 0;
  await assert.rejects(loadSnapshot({ signal: abort.signal, fetchImpl: async () => { requests++; throw abort.signal.reason; } }));
  assert.equal(requests, 1, 'unmounted view must not start a fallback request');
});

test('DB-only collector failure writes no legacy files and preserves its input', async () => {
  const before = await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8');
  const original = JSON.stringify(fixture);
  await assert.rejects(refreshMarketLab('/a-target-that-must-never-be-written/market.json', {
    persist: false, previousSnapshot: fixture, scope: 'macro', now,
    fetchImpl: async () => new Response('', { status: 503 }),
  }), /Partial refresh preserved previous snapshot/);
  assert.equal(JSON.stringify(fixture), original);
  assert.equal(await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8'), before);
});

test('real PostgreSQL publication, API and calculation parity', async t => {
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `atlas_service_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, max: 5 });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await migrate(pool); await migrate(pool);
  const api = await buildServer({ pool, clock: () => now });
  t.after(() => api.close());

  await t.test('empty DB, malformed/extra queries, and writes fail explicitly', async () => {
    assert.equal((await api.inject('/api/v1/market-lab')).statusCode, 404);
    assert.equal((await api.inject('/api/v1/market-lab?revision=bad')).statusCode, 400);
    assert.equal((await api.inject('/api/v1/market-lab?secret=1')).statusCode, 400);
    assert.equal((await api.inject({ method: 'POST', url: '/api/v1/market-lab', payload: {} })).statusCode, 404);
    assert.equal((await api.inject({ method: 'POST', url: '/api/v1/market-lab', payload: fixture })).statusCode, 413);
  });
  await t.test('lossless import, normalized counts, duplicate idempotency and parity', async () => {
    const first = await publishSnapshot(pool, fixture);
    assert.equal(first.inserted, true); assert.equal(first.published, true);
    const duplicate = await publishSnapshot(pool, fixture);
    assert.equal(duplicate.inserted, false); assert.equal(duplicate.revision, first.revision);
    const stored = await readSnapshot(pool);
    assert.deepEqual(stored?.snapshot, fixture);
    const expected = fixture.markets.reduce((n: number, m: any) => n + m.prices.length, 0)
      + Object.values(fixture.regions).reduce((n: number, r: any) => n + Object.values(r.axes).reduce((count: number, a: any) => count + a.values.length, 0), 0);
    assert.equal(Number((await pool.query('SELECT count(*) FROM market_lab_observations')).rows[0].count), expected);
    assert.equal((await pool.query('SELECT count(*) FROM market_lab_sources WHERE released_at IS NOT NULL')).rows[0].count, '0');
    const response = await api.inject('/api/v1/market-lab');
    assert.equal(response.statusCode, 200);
    const payload = response.json(); assert.deepEqual(payload.snapshot, fixture);
    for (const region of ['us', 'kr'] as const) assert.deepEqual(payload.diagnostics[region], diagnoseRegion(fixture, region, { now }));
    const prices = fixture.markets.find((m: any) => m.id === 'tqqq').prices;
    const roundTrip = payload.snapshot.markets.find((m: any) => m.id === 'tqqq').prices;
    assert.deepEqual(calculateRsiSeries(roundTrip, 14, 9), calculateRsiSeries(prices, 14, 9));
    const scenario = { alpha: -2, beta: -2, gamma: 0, weights: [1, 1, 1], sensitivity: 0.1 };
    assert.equal(positiveFactorScenario(scenario).index < 100, true);
    const economics = assetEconomics({ costBasis: 100000, residual: 10000, lifeYears: 5, annualRevenue: 40000, annualOpex: 15000, discountRate: 0.08 });
    assert.equal(economics.depreciation, 18000); assert.equal(economics.operatingCash, 25000);
    assert.equal((await api.inject(`/api/v1/market-lab?revision=${'0'.repeat(64)}`)).statusCode, 404);
    const loaded = await loadSnapshot({ fetchImpl: async url => {
      const r = await api.inject(String(url)); return new Response(r.body, { status: r.statusCode });
    } });
    assert.deepEqual(loaded, fixture);
  });
  await t.test('backtest binds its snapshot and instrument and rejects invalid, unavailable and extra inputs',async()=>{
    const stored=(await readSnapshot(pool))!;
    const body={revision:stored.revision,symbol:'TQQQ',start:'2010-02-11',end:'2026-10-30',capital:10000,buy:33.5,sell:43,feeBps:10};
    const send=(payload:unknown)=>api.inject({method:'POST',url:'/api/v1/market-lab/backtest',payload:payload as object});
    const ok=await send(body);assert.equal(ok.statusCode,200);const value=ok.json();
    assert.equal(value.revision,stored.revision);assert.equal(value.symbol,'TQQQ');assert.equal(value.result.sessions,4206);assert(value.result.trades.length>0);
    assert.equal((await send({...body,extra:'ignored?'})).statusCode,400);
    assert.equal((await send({...body,symbol:'BTCUSD'})).statusCode,400);
    assert.equal((await send({...body,symbol:'SOXL'})).statusCode,200);
    const missing=structuredClone(fixture);missing.generatedAt=new Date(fixtureTime-1).toISOString();missing.markets=missing.markets.filter((m:{id:string})=>m.id!=='soxl');
    const absent=await publishSnapshot(pool,missing);assert.equal(absent.published,false);
    assert.equal((await send({...body,symbol:'SOXL',revision:absent.revision})).statusCode,422);
    assert.equal((await send({...body,revision:'0'.repeat(64)})).statusCode,404);
    assert.equal((await send({...body,buy:50,sell:40})).statusCode,422);
    assert.equal((await send({...body,start:'2025-02-30'})).statusCode,422);
  });
  await t.test('real constraint failure rolls back data and publication together', async () => {
    const previous = await readSnapshot(pool);
    await pool.query("ALTER TABLE market_lab_observations ADD CONSTRAINT injected_failure CHECK (series_key<>'market:tqqq') NOT VALID");
    const changed = structuredClone(fixture); changed.generatedAt = new Date(fixtureTime+86400000).toISOString();
    const { revision } = snapshotIdentity(changed);
    await assert.rejects(publishSnapshot(pool, changed), /injected_failure/);
    assert.equal((await pool.query('SELECT revision FROM market_lab_revisions WHERE revision=$1', [revision])).rowCount, 0);
    assert.equal((await readSnapshot(pool))?.revision, previous?.revision);
    await pool.query('ALTER TABLE market_lab_observations DROP CONSTRAINT injected_failure');
  });
  await t.test('concurrent new/older imports do not roll back the public clock; old revision remains readable', async () => {
    const older = structuredClone(fixture); older.generatedAt = new Date(fixtureTime+86400000).toISOString();
    const newer = structuredClone(fixture); newer.generatedAt = new Date(fixtureTime+2*86400000).toISOString();
    const original = snapshotIdentity(fixture).revision;
    await Promise.all([publishSnapshot(pool, newer), publishSnapshot(pool, older)]);
    assert.deepEqual((await readSnapshot(pool))?.snapshot, newer);
    assert.deepEqual((await api.inject(`/api/v1/market-lab?revision=${original}`)).json().snapshot, fixture);
    const conflict = structuredClone(newer); conflict.collectionWarnings = ['same clock different content'];
    await assert.rejects(publishSnapshot(pool, conflict), /Different content/);
  });
  await t.test('DB outage is unavailable, with no forged successful snapshot', async () => {
    const closed = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); await closed.end();
    const unavailable = await buildServer({ pool: closed });
    const r = await unavailable.inject('/api/v1/market-lab'); assert.equal(r.statusCode, 503);
    assert.equal(r.json().code, 'DATA_UNAVAILABLE'); assert.equal(r.json().snapshot, undefined);
    const failed=await unavailable.inject({method:'POST',url:'/api/v1/market-lab/backtest',payload:{revision:'0'.repeat(64),symbol:'TQQQ',start:'2020-01-01',end:'2021-01-01',capital:10000,buy:33.5,sell:43,feeBps:10}});
    assert.equal(failed.statusCode,503);assert.equal(failed.json().result,undefined);
    await unavailable.close();
  });
  await t.test('lost idle DB connection is observed and the next request reconnects', async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!); url.searchParams.set('options', `-c search_path=${schema}`);
    const idle = createPool(url.href);
    const pid = (await idle.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const lost = new Promise<void>(resolve => idle.once('error', () => resolve()));
    await admin.query('SELECT pg_terminate_backend($1)', [pid]); await lost;
    const recovered = await buildServer({ pool: idle, clock: () => now });
    assert.equal((await recovered.inject('/api/v1/market-lab')).statusCode, 200);
    await recovered.close(); await idle.end();
  });
  await t.test('built React route, legacy URLs and static containment remain usable', async () => {
    const web = await buildServer({ pool, serveWeb: true });
    t.after(() => web.close());
    const redirect = await web.inject('/?page=market&lab-tab=rsi&lab-region=kr');
    assert.equal(redirect.statusCode, 302);
    assert.equal(redirect.headers.location, '/market-lab/?page=market&lab-tab=rsi&lab-region=kr');
    const page = await web.inject(redirect.headers.location!);
    assert.equal(page.statusCode, 200); assert.match(page.body, /시장 분석/);
    for (const [path,title] of [['us','미국 시장 진단'],['kr','국내 시장 진단'],['scenario','조건 실험'],['cashflow','현금흐름'],['rsi','삼플레·RSI']]) {
      const direct = await web.inject(`/market-lab/${path}/`);
      assert.equal(direct.statusCode, 200); assert(direct.body.includes(`<title>${title} · Cycle Atlas</title>`));
      assert.match(direct.body,/<base href="\/">/);
      const center=await web.inject(`/market-lab/${path}/?embedded=1`);assert.equal(center.statusCode,200);assert.match(center.body,/<div id="root">[\s\S]*data-atlas-skeleton="chart"/);assert.match(center.body,/role="status" aria-busy="true"/);
    }
    const script = page.body.match(/src="([^"]+\.js(?:\?[^"]*)?)"/)![1];
    const scriptUrl=new URL(script,'http://localhost/');
    const asset = await web.inject(scriptUrl.pathname+scriptUrl.search); assert.equal(asset.statusCode, 200);
    assert.match(String(asset.headers['content-type']), /javascript/);
    const chart = await web.inject('/?page=outlook');
    assert.equal(chart.statusCode, 200);
    assert.match(chart.body, /<meta name="atlas-service-base" content="\/market-lab\/">/);
    for(const page of ['data','evidence','ipo']) {
      const direct=await web.inject(`/?page=${page}`);assert.equal(direct.statusCode,302);assert.equal(direct.headers.location,`/?page=outlook&center=${page}`);
      assert.equal((await web.inject(`/?page=${page}&embedded=1`)).statusCode,200);
    }
    assert.doesNotMatch(await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8'), /name="atlas-service-base"/);
    assert.equal((await web.inject('/data/market-lab.json')).statusCode, 200);
    assert.equal((await web.inject('/market-lab/%2e%2e/%2e%2e/package.json')).statusCode, 404);
    assert.equal((await web.inject('/.env')).statusCode, 404);
  });
});
