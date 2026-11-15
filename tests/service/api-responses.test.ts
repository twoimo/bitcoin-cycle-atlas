import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { InjectOptions } from 'fastify';
import { migrate, publishSnapshot } from '../../apps/api/src/repository.js';
import { migrateHousing, publishHousing } from '../../apps/api/src/housing-repository.js';
import { migrateThemes, publishThemes } from '../../apps/api/src/theme-repository.js';
import { migrateUsCollection } from '../../apps/api/src/us-collector.js';
import { buildServer } from '../../apps/api/src/server.js';

const load = async (name: string) => JSON.parse(await readFile(new URL(`../../dist/data/${name}.json`, import.meta.url), 'utf8'));
const [market, housing, themes] = await Promise.all([load('market-lab'), load('housing'), load('themes')]);
const now = new Date(Date.parse(market.generatedAt) + 3 * 86400000);
const zero = '0'.repeat(64);
const json = (body: object) => JSON.stringify(body);
const invalid = (message: string) => json({ statusCode: 400, code: 'FST_ERR_VALIDATION', error: 'Bad Request', message });
type Server = Awaited<ReturnType<typeof buildServer>>;
type Shape = { status: number; cacheControl: string | null; body: string };

async function observe(app: Server, request: InjectOptions) {
  const response = await app.inject(request);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  return { status: response.statusCode, cacheControl: (response.headers['cache-control'] as string | undefined) ?? null, body: response.body };
}

test('API error and status responses keep their exact status, cache header and body bytes', async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }), schema = `api_responses_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  const closed = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); await closed.end();
  const themeClock = () => new Date(Date.parse(themes.generatedAt) + 60000);
  const servers: Server[] = [];
  const server = async (options: Parameters<typeof buildServer>[0]) => { const app = await buildServer(options); servers.push(app); return app; };
  try {
    await migrate(pool); await migrateHousing(pool); await migrateThemes(pool); await migrateUsCollection(pool);
    const empty = await server({ pool, clock: () => now }), down = await server({ pool: closed, clock: () => now });
    const backtest = { symbol: 'TQQQ', start: '2020-01-01', end: '2021-01-01', capital: 10000, buy: 33.5, sell: 43, feeBps: 10 };
    const analysis = { region: 'busan', window: 36, band: 10, lag: 2, start: '2006-01', end: '2026-09' };
    const draft = { title: '계약 고정', criteria: structuredClone(themes.judgments[2].criteria) };
    const requestId = randomUUID();
    const post = (url: string, payload: object) => ({ method: 'POST' as const, url, payload });
    const actual: Record<string, Shape> = {}, expected: Record<string, Shape> = {};
    const check = async (name: string, app: Server, request: InjectOptions, status: number, cacheControl: string | null, body: string) => {
      actual[name] = await observe(app, request); expected[name] = { status, cacheControl, body };
    };

    await check('health ready', empty, { url: '/api/health' }, 200, null, json({ status: 'ready' }));
    await check('health down', down, { url: '/api/health' }, 503, null, json({ status: 'unavailable' }));
    await check('collection down', down, { url: '/api/v1/market-lab/collection' }, 503, 'no-store', json({ code: 'COLLECTION_STATUS_UNAVAILABLE', message: '수집 상태를 확인할 수 없습니다.' }));
    await check('market-lab empty', empty, { url: '/api/v1/market-lab' }, 404, null, json({ code: 'SNAPSHOT_NOT_FOUND', message: '검증된 연구 자료가 없습니다.' }));
    await check('market-lab down', down, { url: '/api/v1/market-lab' }, 503, null, json({ code: 'DATA_UNAVAILABLE', message: '연구 자료를 지금 읽을 수 없습니다.' }));
    await check('market-lab bad revision', empty, { url: '/api/v1/market-lab?revision=bad' }, 400, null, invalid('querystring/revision must match pattern "^[a-f0-9]{64}$"'));
    await check('backtest empty', empty, post('/api/v1/market-lab/backtest', { ...backtest, revision: zero }), 404, null, json({ code: 'SNAPSHOT_NOT_FOUND', message: '요청한 자료 판본이 없습니다.' }));
    await check('backtest down', down, post('/api/v1/market-lab/backtest', { ...backtest, revision: zero }), 503, null, json({ code: 'DATA_UNAVAILABLE', message: '연구 자료를 지금 읽을 수 없습니다.' }));
    await check('backtest bad revision', empty, post('/api/v1/market-lab/backtest', { ...backtest, revision: 'bad' }), 400, null, invalid('body/revision must match pattern "^[a-f0-9]{64}$"'));
    await check('themes empty', empty, { url: '/api/v1/themes' }, 404, null, json({ code: 'THEME_NOT_FOUND' }));
    await check('themes down', down, { url: '/api/v1/themes' }, 503, null, json({ code: 'THEME_UNAVAILABLE', message: '테마 자료를 읽을 수 없습니다.' }));
    await check('themes bad revision', empty, { url: '/api/v1/themes?revision=bad' }, 400, null, invalid('querystring/revision must match pattern "^[a-f0-9]{64}$"'));
    await check('receipt empty', empty, { url: `/api/v1/themes/receipts/${requestId}` }, 404, 'no-store', json({ code: 'RECEIPT_NOT_FOUND' }));
    await check('receipt down', down, { url: `/api/v1/themes/receipts/${requestId}` }, 503, null, json({ code: 'RECEIPT_UNAVAILABLE' }));
    await check('receipt bad id', empty, { url: '/api/v1/themes/receipts/nope' }, 400, null, invalid('params/id must match format "uuid"'));
    await check('judgment empty', empty, post('/api/v1/themes/judgments', { requestId, revision: zero, draft }), 404, null, json({ code: 'THEME_NOT_FOUND' }));
    await check('judgment down', down, post('/api/v1/themes/judgments', { requestId, revision: zero, draft }), 503, null, json({ code: 'SAVE_UNAVAILABLE', message: '저장 여부를 확인하세요.' }));
    await check('judgment bad revision', empty, post('/api/v1/themes/judgments', { requestId, revision: 'bad', draft }), 400, null, invalid('body/revision must match pattern "^[a-f0-9]{64}$"'));
    await check('housing empty', empty, { url: '/api/v1/housing' }, 404, null, json({ code: 'HOUSING_NOT_FOUND' }));
    await check('housing down', down, { url: '/api/v1/housing' }, 503, null, json({ code: 'HOUSING_UNAVAILABLE', message: '부동산 자료를 읽을 수 없습니다.' }));
    await check('housing bad revision', empty, { url: '/api/v1/housing?revision=bad' }, 400, null, invalid('querystring/revision must match pattern "^[a-f0-9]{64}$"'));
    await check('housing extra query', empty, { url: '/api/v1/housing?extra=yes' }, 400, null, invalid('querystring must NOT have additional properties'));
    await check('analysis empty', empty, post('/api/v1/housing/analysis', { ...analysis, revision: zero }), 404, null, json({ code: 'HOUSING_NOT_FOUND' }));
    await check('analysis down', down, post('/api/v1/housing/analysis', { ...analysis, revision: zero }), 503, null, json({ code: 'HOUSING_UNAVAILABLE' }));
    await check('analysis bad revision', empty, post('/api/v1/housing/analysis', { ...analysis, revision: 'bad' }), 400, null, invalid('body/revision must match pattern "^[a-f0-9]{64}$"'));

    const marketRevision = (await publishSnapshot(pool, market)).revision;
    const withoutSoxl = structuredClone(market); withoutSoxl.generatedAt = new Date(Date.parse(market.generatedAt) - 1).toISOString();
    withoutSoxl.markets = withoutSoxl.markets.filter((m: { id: string }) => m.id !== 'soxl');
    const absent = (await publishSnapshot(pool, withoutSoxl)).revision;
    const housingRevision = (await publishHousing(pool, housing)).revision;
    const themeRevision = (await publishThemes(pool, themes)).revision;
    const app = await server({ pool, clock: themeClock }), early = await server({ pool, clock: () => new Date(Date.parse(themes.generatedAt) - 1) }), lab = await server({ pool, clock: () => now });
    const judgment = (body: object) => post('/api/v1/themes/judgments', { requestId: randomUUID(), revision: themeRevision, draft, ...body });
    const criteria = (axis: 'continuity' | 'novelty', change: object) => ({ draft: { ...draft, criteria: { ...draft.criteria, [axis]: { ...draft.criteria[axis], ...change } } } });

    await check('backtest missing instrument', lab, post('/api/v1/market-lab/backtest', { ...backtest, symbol: 'SOXL', revision: absent }), 422, null, json({ code: 'OBSERVATIONS_UNAVAILABLE', message: '출처가 연결되지 않았습니다.' }));
    await check('backtest invalid thresholds', lab, post('/api/v1/market-lab/backtest', { ...backtest, buy: 50, sell: 40, revision: marketRevision }), 422, null, json({ code: 'INVALID_BACKTEST', message: '기간·자금·RSI 기준·수수료 범위를 확인하세요.' }));
    await check('analysis reversed range', app, post('/api/v1/housing/analysis', { ...analysis, start: '2026-09', end: '2006-01', revision: housingRevision }), 422, 'no-store', json({ code: 'INVALID_ANALYSIS', message: '분석 조건을 확인하세요.' }));
    assert.equal((await app.inject(post('/api/v1/themes/judgments', { requestId, revision: themeRevision, draft }))).statusCode, 201);
    await check('judgment conflict', app, post('/api/v1/themes/judgments', { requestId, revision: themeRevision, draft: { ...draft, title: '다른 내용' } }), 409, null, json({ code: 'IDEMPOTENCY_CONFLICT', message: '같은 저장 번호의 내용이 다릅니다.' }));
    await check('judgment blank title', app, judgment({ draft: { ...draft, title: '   ' } }), 422, null, json({ code: 'INVALID_JUDGMENT', message: '판정 이름을 확인하세요.' }));
    await check('judgment missing axes', app, judgment({ draft: { ...draft, criteria: {} } }), 422, null, json({ code: 'INVALID_JUDGMENT', message: '연·기·신 세 항목을 확인하세요.' }));
    await check('judgment blank reason', app, judgment(criteria('novelty', { reason: ' ' })), 422, null, json({ code: 'INVALID_JUDGMENT', message: '각 판정의 이유와 근거를 확인하세요.' }));
    await check('judgment unknown evidence', app, judgment(criteria('continuity', { evidenceIds: ['missing'] })), 422, null, json({ code: 'INVALID_JUDGMENT', message: '판정 시점 이후 또는 존재하지 않는 근거입니다.' }));
    await check('judgment future snapshot', early, judgment({}), 422, null, json({ code: 'INVALID_JUDGMENT', message: 'Future snapshot' }));

    const success = async (app: Server, request: InjectOptions) => {
      const response = await observe(app, request);
      return { status: response.status, cacheControl: response.cacheControl, keys: Object.keys(JSON.parse(response.body)) };
    };
    assert.deepEqual({
      marketLab: await success(lab, { url: '/api/v1/market-lab' }),
      backtest: await success(lab, post('/api/v1/market-lab/backtest', { ...backtest, revision: marketRevision })),
      collection: await success(lab, { url: '/api/v1/market-lab/collection' }),
      housing: await success(app, { url: '/api/v1/housing' }),
      analysis: await success(app, post('/api/v1/housing/analysis', { ...analysis, revision: housingRevision })),
      themes: await success(app, { url: '/api/v1/themes' }),
      receipt: await success(app, { url: `/api/v1/themes/receipts/${requestId}` }),
      replay: await success(app, post('/api/v1/themes/judgments', { requestId, revision: themeRevision, draft })),
    }, {
      marketLab: { status: 200, cacheControl: 'no-store', keys: ['schemaVersion', 'revision', 'importedAt', 'publishedAt', 'evaluatedAt', 'snapshot', 'diagnostics', 'usDirection'] },
      backtest: { status: 200, cacheControl: null, keys: ['revision', 'symbol', 'unit', 'result'] },
      collection: { status: 200, cacheControl: 'no-store', keys: ['schemaVersion', 'evaluatedAt', 'schedule', 'latest', 'lastSuccess'] },
      housing: { status: 200, cacheControl: 'no-store', keys: ['schemaVersion', 'revision', 'snapshot', 'importedAt'] },
      analysis: { status: 200, cacheControl: 'no-store', keys: ['revision', 'result'] },
      themes: { status: 200, cacheControl: 'no-store', keys: ['schemaVersion', 'revision', 'snapshot', 'judgments', 'comparison', 'performance'] },
      receipt: { status: 200, cacheControl: 'no-store', keys: ['revision', 'judgment'] },
      replay: { status: 200, cacheControl: null, keys: ['created', 'revision', 'judgment'] },
    });

    const tampered = structuredClone(themes); tampered.judgments[0].title = '';
    await pool.query('UPDATE theme_revisions SET canonical_body=$1 WHERE revision=$2', [JSON.stringify(tampered), themeRevision]);
    await check('themes tampered snapshot', app, { url: '/api/v1/themes' }, 503, null, json({ code: 'THEME_UNAVAILABLE', message: '테마 자료를 읽을 수 없습니다.' }));
    await check('judgment tampered snapshot', app, judgment({}), 422, null, json({ code: 'INVALID_JUDGMENT', message: '판정 기록 형식 오류' }));

    assert.deepEqual(actual, expected);
  } finally {
    for (const app of servers) await app.close();
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
