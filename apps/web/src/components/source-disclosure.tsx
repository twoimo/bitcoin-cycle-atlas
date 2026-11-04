import { diagnoseRegion } from '@atlas/domain/market-lab';
import type { MarketSnapshot, Region } from '@atlas/contracts/market-lab';
import { PublicLink, sourceMeta } from './common.js';

export function SourceDisclosure({ snapshot, region, now }: { snapshot: MarketSnapshot | null; region: Region; now: Date }) {
  let notes: string[] = [];
  try { if (snapshot) notes = diagnoseRegion(snapshot, region, { now }).notes || []; } catch { /* Missing/invalid observations remain withheld. */ }
  const sources = snapshot?.sources || [];
  return <details className="ml-sources"><summary>출처·시점·모형 한계{snapshot && ` · ${sources.length}개 출처`}</summary><div className="ml-source-body">
    <p>스냅샷 생성 {snapshot?.generatedAt || '미수신'} · 모형 {snapshot?.modelVersion || 'research-0.1'}</p>
    <p>미국과 국내를 구분합니다. 국내 적용은 서비스의 새 가정으로, 원문 멘토 검증이 아닙니다. 수정 이력과 최초 공개 시점은 미확인입니다. 현재 자료로 과거 시점 백테스트를 재현했다고 주장하지 않습니다.</p>
    <p>관측값은 연결된 스냅샷만 사용합니다. 실시간 호가·자동매매 모형이 아닙니다. 마지막 저장 관측의 종가이며 전망선이나 가상 가격을 섞지 않습니다.</p>
    <p>원문 개념식 α × β × γ = SPX는 성장·유동성·심리를 함께 본다는 개념입니다. 실제 지수의 항등식이나 검증된 예측식이 아닙니다. 사진 158 / R8 p.163 · 사진 161 / R8 p.166. 축 선정·표준화·합성은 새 연구 가정입니다.</p>
    <p>원문 개념과 새 연구 가정과 검증된 투자 규칙을 구분합니다. 확률·목표가·수익 보장은 없습니다.</p>
    {notes.length > 0 && <ul className="ml-notes">{notes.map(note => <li key={note}>{note}</li>)}</ul>}
    {sources.length ? sources.map(source => <article key={source.id}><strong><PublicLink url={source.url}>{source.linkLabel || source.label}</PublicLink></strong>
      <p>{sourceMeta(source)} · 주기 {source.frequency || '미확인'} · 공개 시각 {source.releaseTimeKnown ? '확인' : '미확인'}</p>
      <p>{source.status === 'ready' ? '수집됨' : '수집 오류'}{source.error && ` · ${source.error}`}</p></article>)
      : <p>출처 목록을 아직 받지 못했습니다. 데이터 다시 읽기를 사용하세요.</p>}
  </div></details>;
}
