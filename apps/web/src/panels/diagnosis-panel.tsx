import { useState } from 'react';
import { diagnoseRegion, isFutureStamp } from '@atlas/domain/market-lab';
import type { Axis, MarketSnapshot, Region } from '@atlas/contracts/market-lab';
import { axes, errorText, fmt } from '../components/common.js';
import { ObservedResearchChart, ResearchChartCard } from '../components/ztd-research-charts.js';
import type {UsCollectionStatus} from '@atlas/contracts/us-collection';
import {UsDirection,collectionTime} from '../components/us-direction.js';
import {collectionMatchesSnapshot} from '../us-collection.js';
import {CompactToolbar,CompactToolbarMenu} from '../components/compact-toolbar.js';

interface Props {
  snapshot: MarketSnapshot | null;
  region: Region;
  now: Date;
  marketId: string | null;
  priceIndex: number | null;
  onMarket: (market: string) => void;
  onDate: (index: number) => void;
  collection?: UsCollectionStatus|null;
  collectionError?: string;
  saved?: boolean;
  onRefresh?: ()=>void;
}
const spokenAxis = { alpha: '알파', beta: '베타', gamma: '감마' } as const;
function AxisChart({ snapshot, region, axisKey, symbol, name, now }: {
  snapshot: MarketSnapshot | null; region: Region; axisKey: Axis; symbol: string; name: string; now: Date;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const series = snapshot?.regions[region].axes[axisKey];
  const source = snapshot?.sources.find(item => item.id === series?.sourceId);
  const title = `${symbol} ${spokenAxis[axisKey]} · ${name}`;
  let points = series?.values || [];
  let withheld = '';
  if (!snapshot || !series || !source) withheld = '출처가 연결되지 않아 차트를 표시하지 않습니다.';
  else if (isFutureStamp(snapshot.generatedAt, now) || isFutureStamp(source.retrievedAt, now)) withheld = '미래 수집·생성 시각은 현재 관측으로 표시하지 않습니다.';
  else if (source.status !== 'ready') withheld = source.error || '원천 수집이 완료되지 않았습니다. 차트는 표시하지 않습니다.';
  else {
    points = series.values.filter(([date]) => !isFutureStamp(date, now));
    if (!points.length) withheld = '표시할 관측일이 없습니다.';
  }
  return <article className="ml-axis-chart" aria-label={title}>
    <ResearchChartCard dense className="ml-axis-chart-card" title={title}>
      {withheld ? <div data-chart={`axis-${axisKey}`}><p className="ml-warning">{withheld}</p></div>
        : <ObservedResearchChart fit id={`axis-${axisKey}`} points={points} unit={source?.unit || ''} label={title} detail={source?.label || ''} selected={selected} onSelect={setSelected} />}
    </ResearchChartCard>
  </article>;
}
export function DiagnosisPanel({ snapshot, region, now, marketId, onMarket, collection=null,collectionError='',saved=false,onRefresh=()=>{} }: Props) {
  let result = null;
  try { if (snapshot) result = diagnoseRegion(snapshot, region, { now }); }
  catch (error) { return <div className="ml-error" role="alert">진단 계산을 유보합니다. {errorText(error)}</div>; }
  const markets = snapshot?.markets.filter(market => market.region === region && market.id !== 'tqqq') || [];
  const market = markets.find(market => market.id === marketId) || markets[0];
  const label = region === 'us' ? '미국' : '국내';
  return <>
    <CompactToolbar label={`${label} 시장 진단 도구`}>
      <label className="compact-toolbar-field">지수 <select data-control="market" aria-label="관측 지수 선택" value={market?.id || ''} onChange={event => onMarket(event.currentTarget.value)}>
        {markets.length ? markets.map(market => <option key={market.id} value={market.id}>{market.name} · {market.symbol}</option>) : <option value="">지역 관측 없음</option>}
      </select></label>
      <CompactToolbarMenu name="market-summary" label="진단 요약" title={`${label} 시장 진단 요약`}>
    {region==='us'&&<UsDirection snapshot={snapshot} now={now} collection={collection} error={collectionError} saved={saved} onRefresh={onRefresh}/>}
    <div className="ml-score-row compact-toolbar-fields">{axes.map(([key, symbol, name]) => {
      const axis = result?.axes.find(axis => axis.key === key);
      const rawUnit = axis?.source?.unit || '';
      const unit = key === 'gamma' ? rawUnit.includes('pt') ? 'pt' : rawUnit.includes('%') ? '%' : '' : key === 'alpha' ? '전기비 %' : '연율 %';
      return <article key={key} className={`ml-axis ml-score ml-axis-${key}`}>
        <h3><span>{symbol}</span> {name}</h3>
        <span className="ml-axis-measure">표준화 점수</span><strong className="ml-axis-value">{fmt(axis?.z)}</strong>
        <dl className="ml-axis-observations"><dt>관측값 · 관측일</dt><dd className="ml-axis-stats"><span>{axis?.status === 'ready' ? fmt(axis.latest, axis.source?.displayDecimals ?? 2) : '유보'} {unit}</span><span>{axis?.date || '관측일 없음'}</span></dd></dl>
        {region==='us'&&<p className="ml-axis-collection"><span>{key==='alpha'?'분기 발표':key==='beta'?'월간 발표':'일별 종가'}</span>{collectionMatchesSnapshot(snapshot,collection)&&<time>확인 {collectionTime(collection!.lastSuccess!.sources.find(source=>source.axis===key)!.checkedAt)} KST</time>}</p>}
        {axis?.reason && <p className="ml-warning">{axis.reason}</p>}
      </article>;
    })}</div>
    {region==='us'?<details className="ml-legacy-score"><summary>기존 평균 점수 <strong>{result?.status==='ready'?fmt(result.score):'판단 유보'}</strong></summary><p className="ml-score-total">{result?.scoreLabel || '연구용 종합 점수'} <strong>{result?.status==='ready'?fmt(result.score):'판단 유보'}</strong></p><p>기존 (α+β+γ)/3 계산은 유지하며, 위 곱의 부호와 구분합니다.</p></details>:<p className="ml-score-total">{result?.scoreLabel || '연구용 종합 점수'} <strong>{result?.status === 'ready' ? fmt(result.score) : '판단 유보'}</strong></p>}
      </CompactToolbarMenu>
    </CompactToolbar>
    <section className="ml-axis-stack" data-presentation-chart="axes" aria-label="알파, 베타, 감마 관측 차트">
      {axes.map(([key, symbol, name]) => <AxisChart key={key} snapshot={snapshot} region={region} axisKey={key} symbol={symbol} name={name} now={now} />)}
    </section>
  </>;
}
