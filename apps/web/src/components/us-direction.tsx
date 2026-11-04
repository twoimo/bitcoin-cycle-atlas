import {useEffect,useState} from 'react';
import type { MarketSnapshot } from '@atlas/contracts/market-lab';
import type { UsCollectionStatus } from '@atlas/contracts/us-collection';
import { spxDirection } from '@atlas/domain/us-direction';
import { loadUsCollection,collectionMatchesSnapshot } from '../us-collection.js';
import { fmt } from './common.js';

export const collectionTime = (time: string) => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(time));
export function useUsCollection(active:boolean,refreshKey=0) {
  const [data,setData] = useState<UsCollectionStatus|null>(null), [error,setError] = useState('');
  useEffect(()=>{
    if (!active) return;
    const abort = new AbortController();
    const load = async()=>{
      if(document.visibilityState === 'hidden') return;
      try { const value = await loadUsCollection(abort.signal); if(!abort.signal.aborted){setData(value);setError('');} }
      catch { if(!abort.signal.aborted)setError('수집 상태 확인 실패'); }
    };
    void load();
    return ()=>abort.abort();
  },[active,refreshKey]);
  return {data,error};
}
export function UsDirection({snapshot,now,collection,error,saved,onRefresh}:{snapshot:MarketSnapshot|null;now:Date;collection:UsCollectionStatus|null;error:string;saved:boolean;onRefresh:()=>void}) {
  const result = snapshot ? spxDirection(snapshot,now) : null;
  const failed = Boolean(error || collection?.latest && ['failed','interrupted'].includes(collection.latest.status));
  const delayed = Boolean(collection?.schedule.enabled && collection.schedule.nextDueAt && +now > Date.parse(collection.schedule.nextDueAt)+120000);
  const latest = collection?.latest, schedule = collection?.schedule;
  const awaiting=Boolean(collection?.lastSuccess&&!collectionMatchesSnapshot(snapshot,collection));
  const status = error ? error : saved ? '이전 자료 표시' : !collection ? '수집 상태 확인 중' : latest?.status === 'running' || schedule?.running ? '공식 자료 확인 중' : failed ? '수집 실패 · 이전 자료 유지' : delayed ? '수집 지연 · 이전 자료 유지' : !schedule?.enabled ? '자동 수집 꺼짐' : !latest ? '첫 수집 대기' : awaiting?'새 자료 반영 중':'공식 자료 확인 완료';
  return <section className="ml-direction-panel" aria-label="S&P 500 모형 방향">
    <div className="ml-direction-main"><div><span className="ml-direction-label">S&P 500</span><strong className="ml-direction-value" data-direction={result?.direction??'pending'}>{result?.direction??'판정 대기'}</strong><span className="ml-direction-kind">대리지표 모형</span></div>
      <div className="ml-direction-formula"><span>α × β × γ</span><strong>{fmt(result?.product,4)}</strong>{result?.reason&&<span>{result.reason}</span>}{(failed||delayed||saved||awaiting)&&<span>최근 정상 자료 기준</span>}</div></div>
    <div className="ml-collection-line" role="status"><span>{status}</span><span>{schedule?.enabled?`${schedule.intervalMs/60000}분마다 확인`:'자동 수집 상태'}</span>{latest?.finishedAt&&<time>확인 {collectionTime(latest.finishedAt)} KST</time>}{schedule?.nextDueAt&&<time>다음 {collectionTime(schedule.nextDueAt)} KST</time>}<button type="button" onClick={onRefresh}>새로고침</button></div>
    <details className="ml-direction-method"><summary>판정식</summary><p>표준화된 성장·유동성·심리 점수의 곱이 양수면 UP, 음수면 DOWN입니다. 0·결측·노후 관측은 판정을 유보합니다. 두 음수의 곱은 양수가 됩니다. GDP·3개월 국채금리·VIX는 강연 개념의 대리지표이며 원문의 EPS·유동성 총량·투자심리 수치 공식과 동일하다고 검증되지 않았습니다. 특정 기간 수익률이나 상승 확률을 예측한 결과가 아닙니다.</p><p>공식 발표값을 주기적으로 확인합니다. GDP는 분기, 국채금리는 월간, VIX는 일별 종가입니다. 발표 전 새 값을 만들지 않으며 장중 실시간 지표로 표시하지 않습니다. 관측 기간과 확보 시각은 별개이며 원 공표 시각·당시 수정 전 판본은 확인되지 않았습니다. 서버가 실행 중일 때 자동 수집합니다.</p></details>
  </section>;
}
