import {atlasSitePath,isAtlasStatic} from '../../../dist/site-paths.js';
import type { UsCollectionStatus } from '@atlas/contracts/us-collection';
import type {MarketSnapshot} from '@atlas/contracts/market-lab';
const stamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function validateUsCollection(value: unknown): UsCollectionStatus {
  const doc = value as UsCollectionStatus;
  if (!doc || doc.schemaVersion !== 1 || !stamp(doc.evaluatedAt) || typeof doc.schedule?.enabled !== 'boolean' || typeof doc.schedule?.running !== 'boolean' || !Number.isInteger(doc.schedule.intervalMs) || doc.schedule.intervalMs < 60000 || doc.schedule.intervalMs > 86400000 || doc.schedule.nextDueAt !== null && !stamp(doc.schedule.nextDueAt)) throw new Error('수집 상태 형식 오류');
  for (const run of [doc.latest,doc.lastSuccess]) {
    if (run === null) continue;
    if (!run || !/^[a-f0-9-]{36}$/.test(run.id) || !stamp(run.startedAt) || !['running','published','unchanged','failed','interrupted'].includes(run.status) || (run.finishedAt !== null && (!stamp(run.finishedAt) || Date.parse(run.finishedAt) < Date.parse(run.startedAt))) || (run.status === 'running') !== (run.finishedAt === null) || !Array.isArray(run.sources) || run.sources.length > 3 || (run.revision !== null && !/^[a-f0-9]{64}$/.test(run.revision))) throw new Error('수집 기록 형식 오류');
    const ids = new Set();
    for (const source of run.sources) {
      const expected = {GDPC1:'alpha',TB3MS:'beta',VIXCLS:'gamma'};
      if (!(source.series in expected) || source.axis !== expected[source.series] || ids.has(source.series) || !stamp(source.checkedAt) || !['ready','error'].includes(source.status) || source.status === 'ready' && (!/^[a-f0-9]{64}$/.test(source.sha256??'') || !/^\d{4}-\d{2}-\d{2}$/.test(source.lastObservation??'') || !Number.isInteger(source.rows) || source.rows! < 1)) throw new Error('수집 원천 형식 오류');
      ids.add(source.series);
    }
    if(['published','unchanged'].includes(run.status)&&(run.sources.length!==3||run.sources.some(source=>source.status!=='ready')||run.revision===null))throw new Error('정상 수집 근거 누락');
  }
  if (doc.lastSuccess && !['published','unchanged'].includes(doc.lastSuccess.status)) throw new Error('정상 수집 기록 오류');
  return doc;
}
export function collectionMatchesSnapshot(snapshot:MarketSnapshot|null,collection:UsCollectionStatus|null) {
  return Boolean(snapshot&&collection?.lastSuccess?.sources.length===3&&collection.lastSuccess.sources.every(receipt=>{
    const axis=snapshot.regions.us.axes[receipt.axis],source=snapshot.sources.find(source=>source.id===axis.sourceId);
    return receipt.status==='ready'&&source?.responseSha256===receipt.sha256;
  }));
}
export async function loadUsCollection(signal: AbortSignal, fetchImpl = fetch) {
  if(isAtlasStatic())throw new Error('저장 자료');
  const response = await fetchImpl(atlasSitePath('/api/v1/market-lab/collection'),{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(6000)])});
  if (!response.ok) throw new Error('수집 상태 연결 실패');
  const text = await response.text();
  if (text.length > 16384) throw new Error('수집 상태 크기 초과');
  return validateUsCollection(JSON.parse(text));
}
