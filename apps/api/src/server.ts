import Fastify from 'fastify';
import { atlasPages } from '../../../dist/atlas-navigation.js';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { diagnoseRegion } from '@atlas/domain/market-lab';
import { observationGate } from '@atlas/domain/market-lab';
import { backtestRsi, type BacktestOptions } from '@atlas/domain/rsi-backtest';
import { rsiInstrument } from '../../../dist/rsi-instruments.js';
import { readSnapshot } from './repository.js';
import { readHousing } from './housing-repository.js';
import { analyzeHousing,type HousingOptions } from '@atlas/domain/housing';
import { readThemes,readThemeReceipt,saveThemeJudgment } from './theme-repository.js';
import { themeComparison,themePerformance,type ThemeDraft } from '@atlas/domain/themes';
import { spxDirection } from '@atlas/domain/us-direction';
import { readUsCollection,US_COLLECTION_INTERVAL } from './us-collector.js';
import type { CollectionSchedule } from '@atlas/contracts/us-collection';

export async function buildServer({ pool, clock = () => new Date(), serveWeb = false, logger = false, collectionSchedule = () => ({enabled:false,intervalMs:US_COLLECTION_INTERVAL,running:false,nextDueAt:null}) }: { pool: pg.Pool; clock?: () => Date; serveWeb?: boolean; logger?: boolean; collectionSchedule?: () => CollectionSchedule }) {
  const app = Fastify({ logger, bodyLimit: 1024, requestTimeout: 15000, ajv: { customOptions: { removeAdditional: false } } });
  app.get('/api/health', async (_request, reply) => {
    try { await pool.query('SELECT 1'); return { status: 'ready' }; }
    catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  app.get('/api/v1/market-lab/collection', async (request,reply) => {
    try {
      reply.header('Cache-Control','no-store');
      return {schemaVersion:1,evaluatedAt:clock().toISOString(),schedule:collectionSchedule(),...await readUsCollection(pool)};
    } catch (error) {
      request.log.error({err:error},'US collection status unavailable');
      return reply.code(503).send({code:'COLLECTION_STATUS_UNAVAILABLE',message:'수집 상태를 확인할 수 없습니다.'});
    }
  });
  app.get<{Querystring:{revision?:string}}>('/api/v1/themes',{schema:{querystring:{type:'object',additionalProperties:false,properties:{revision:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}},async(request,reply)=>{
    try{const stored=await readThemes(pool,request.query.revision);if(!stored)return reply.code(404).send({code:'THEME_NOT_FOUND'});reply.header('Cache-Control','no-store');return {schemaVersion:1,revision:stored.revision,snapshot:stored.snapshot,judgments:stored.judgments,comparison:themeComparison(stored.snapshot,stored.judgments),performance:stored.judgments.map(j=>({id:j.id,result:themePerformance(stored.snapshot,j)}))};}catch{return reply.code(503).send({code:'THEME_UNAVAILABLE',message:'테마 자료를 읽을 수 없습니다.'});}
  });
  app.get<{Params:{id:string}}>('/api/v1/themes/receipts/:id',{schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}}}},async(request,reply)=>{
    try{const record=await readThemeReceipt(pool,request.params.id);reply.header('Cache-Control','no-store');return record??reply.code(404).send({code:'RECEIPT_NOT_FOUND'});}catch{return reply.code(503).send({code:'RECEIPT_UNAVAILABLE'});}
  });
  app.post<{Body:{requestId:string;revision:string;draft:ThemeDraft}}>('/api/v1/themes/judgments',{
    bodyLimit:8192,schema:{body:{type:'object',additionalProperties:false,required:['requestId','revision','draft'],properties:{requestId:{type:'string',format:'uuid'},revision:{type:'string',pattern:'^[a-f0-9]{64}$'},draft:{type:'object',additionalProperties:false,required:['title','criteria'],properties:{title:{type:'string',minLength:1,maxLength:100},criteria:{type:'object'}}}}}}
  },async(request,reply)=>{
    try{const saved=await saveThemeJudgment(pool,request.body,clock);return reply.code(saved.created?201:200).send(saved);}catch(e){const message=e instanceof Error?e.message:'저장 오류';if(message==='IDEMPOTENCY_CONFLICT')return reply.code(409).send({code:message,message:'같은 저장 번호의 내용이 다릅니다.'});if(message==='THEME_NOT_FOUND')return reply.code(404).send({code:message});if(/확인하세요|근거입니다|판정 기록|Future snapshot/.test(message))return reply.code(422).send({code:'INVALID_JUDGMENT',message});return reply.code(503).send({code:'SAVE_UNAVAILABLE',message:'저장 여부를 확인하세요.'});}
  });
  app.get<{Querystring:{revision?:string}}>('/api/v1/housing',{
    schema:{querystring:{type:'object',additionalProperties:false,properties:{revision:{type:'string',pattern:'^[a-f0-9]{64}$'}}}}
  },async(request,reply)=>{
    try{const stored=await readHousing(pool,request.query.revision);if(!stored)return reply.code(404).send({code:'HOUSING_NOT_FOUND'});reply.header('Cache-Control','no-store');return {schemaVersion:1,revision:stored.revision,snapshot:stored.snapshot,importedAt:stored.importedAt};}
    catch{return reply.code(503).send({code:'HOUSING_UNAVAILABLE',message:'부동산 자료를 읽을 수 없습니다.'});}
  });
  app.post<{Body:HousingOptions&{revision:string}}>('/api/v1/housing/analysis',{
    schema:{body:{type:'object',additionalProperties:false,required:['revision','region','window','band','lag','start','end'],properties:{
      revision:{type:'string',pattern:'^[a-f0-9]{64}$'},region:{type:'string',enum:['busan','seoul','gyeonggi','national']},window:{type:'integer',enum:[12,36,60]},band:{type:'integer',enum:[0,5,10,20]},lag:{type:'integer',enum:[0,1,2,3]},start:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'},end:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'}
    }}}
  },async(request,reply)=>{
    let stored;try{stored=await readHousing(pool,request.body.revision);}catch{return reply.code(503).send({code:'HOUSING_UNAVAILABLE'});}
    if(!stored)return reply.code(404).send({code:'HOUSING_NOT_FOUND'});
    const {revision:_revision,...options}=request.body;
    try{reply.header('Cache-Control','no-store');return {revision:stored.revision,result:analyzeHousing(stored.snapshot,options)};}
    catch(error){return reply.code(422).send({code:'INVALID_ANALYSIS',message:error instanceof Error?error.message:'분석 조건 오류'});}
  });
  app.post<{ Body: BacktestOptions & { symbol:string; revision:string } }>('/api/v1/market-lab/backtest', {
    schema:{ body:{ type:'object', additionalProperties:false, required:['symbol','revision','start','end','capital','buy','sell','feeBps'], properties:{
      symbol:{type:'string',enum:['TQQQ','SOXL','233740']}, revision:{type:'string',pattern:'^[a-f0-9]{64}$'},
      start:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},end:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},
      capital:{type:'number',exclusiveMinimum:0,maximum:1e12},buy:{type:'number',minimum:0,maximum:100},sell:{type:'number',minimum:0,maximum:100},feeBps:{type:'number',minimum:0,maximum:1000}
    } } }
  }, async (request,reply) => {
    let stored;
    try { stored = await readSnapshot(pool,request.body.revision); }
    catch { return reply.code(503).send({code:'DATA_UNAVAILABLE',message:'연구 자료를 지금 읽을 수 없습니다.'}); }
    if (!stored) return reply.code(404).send({code:'SNAPSHOT_NOT_FOUND',message:'요청한 자료 판본이 없습니다.'});
    const instrument = rsiInstrument(request.body.symbol), market = stored.snapshot.markets.find(m => m.id === instrument?.id);
    const source = stored.snapshot.sources.find(s => s.id === market?.sourceId);
    const gate = observationGate({generatedAt:stored.snapshot.generatedAt,source,prices:market?.prices,now:clock(),timeZone:market?.timezone});
    if (!market || !gate.ok) return reply.code(422).send({code:'OBSERVATIONS_UNAVAILABLE',message:gate.reason || '종목 자료가 없습니다.'});
    try { return {revision:stored.revision,symbol:request.body.symbol,unit:market.unit,result:backtestRsi(market.prices,request.body)}; }
    catch (error) { return reply.code(422).send({code:'INVALID_BACKTEST',message:error instanceof Error ? error.message : '계산할 수 없습니다.'}); }
  });
  app.get<{ Querystring: { revision?: string } }>('/api/v1/market-lab', {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { revision: { type: 'string', pattern: '^[a-f0-9]{64}$' } } } },
  }, async (request, reply) => {
    try {
      const stored = await readSnapshot(pool, request.query.revision);
      if (!stored) return reply.code(404).send({ code: 'SNAPSHOT_NOT_FOUND', message: '검증된 연구 자료가 없습니다.' });
      const now = clock();
      reply.header('Cache-Control', 'no-store');
      return {
        schemaVersion: 1, revision: stored.revision, importedAt: stored.importedAt, publishedAt: stored.publishedAt,
        evaluatedAt: now.toISOString(), snapshot: stored.snapshot,
        diagnostics: { us: diagnoseRegion(stored.snapshot, 'us', { now }), kr: diagnoseRegion(stored.snapshot, 'kr', { now }) },
        usDirection: spxDirection(stored.snapshot, now),
      };
    } catch (error) {
      request.log.error({ err: error }, 'market-lab read failed');
      return reply.code(503).send({ code: 'DATA_UNAVAILABLE', message: '연구 자료를 지금 읽을 수 없습니다.' });
    }
  });
  if (serveWeb) {
    const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
    const web = fileURLToPath(new URL('../../../build/web/', import.meta.url));
    await app.register(staticFiles, { root: dist, prefix: '/', index: false });
    await app.register(staticFiles, { root: web, prefix: '/market-lab/', decorateReply: false });
    for (const page of [{href:'/market-lab/',title:'시장 분석'},{href:'/market-lab/charts/',title:'가격 차트'},...atlasPages.filter(page => page.tab)]) app.get(page.href, async (request, reply) => {
      const embedded=new URL(request.url,'http://localhost').searchParams.get('embedded')==='1';
      const html=await readFile(`${embedded?web:dist}/index.html`,'utf8');
      return reply.type('text/html').send(html.replace('<head>',embedded?'<head>':'<head><base href="/"><meta name="atlas-service-base" content="/market-lab/">').replace(/<title>[^<]*<\/title>/,`<title>${page.title} · Cycle Atlas</title>`));
    });
    app.get('/', async (request, reply) => {
      const query = new URL(request.url, 'http://localhost').searchParams;
      const center=atlasPages.find(page=>page.view===query.get('page') && !page.tab && page.id!=='outlook');
      if(center && query.get('embedded')!=='1') {query.set('page','outlook');query.set('center',center.id);return reply.redirect(`/?${query}`);}
      if (rsiInstrument(query.get('symbol')) && query.get('embedded')!=='1') return reply.redirect(`/market-lab/charts/?symbol=${rsiInstrument(query.get('symbol'))!.symbol}`);
      if (query.get('page') === 'market') return reply.redirect(`/market-lab/?${query.toString()}`);
      const html = await readFile(`${dist}/index.html`, 'utf8');
      return reply.type('text/html').send(html.replace('<head>', '<head><meta name="atlas-service-base" content="/market-lab/">'));
    });
  }
  return app;
}
