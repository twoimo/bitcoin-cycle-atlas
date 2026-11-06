import { useLayoutEffect, useMemo, useState } from 'react';
import { calculateRsiSeries, matchingIndex, resolveRsiSelection, thresholdPositions, type RsiRow } from '@atlas/domain/market-lab';
import type { MarketSnapshot, Point } from '@atlas/contracts/market-lab';
import { rsiCrossings } from '../rsi-crossings.js';
import { rsiGate } from '../market-data.js';
import { Empty, Original, PublicLink, finite, fmt } from '../components/common.js';
import { ObservedChart } from '../components/observed-chart.js';
import { SymbolPicker } from '../components/symbol-picker.js';
import { RsiHistory, type RsiHistoryState } from './rsi-history.js';
import { rsiInstrument } from '../../../../dist/rsi-instruments.js';
import { RsiWorkbench } from './rsi-workbench.js';
import type { RsiChartCache } from '../rsi-chart-model.js';
import { CompactToolbar } from '../components/compact-toolbar.js';

export interface RsiState { rsiIndex: number | null; rsiOscIndex: number | null; rsiUnmatchedDate: string | null; manualRsi: string }
export const initialRsi = (): RsiState => ({ rsiIndex: null, rsiOscIndex: null, rsiUnmatchedDate: null, manualRsi: '' });
type ReadyRow = RsiRow & { rsi: number };
const emptyPrices: Point[] = [];
const thresholds = [29.5, 33.5, 40, 43];

function DistanceTable({ label, value }: { label: string; value: number | null | undefined }) {
  if (!finite(value)) return null;
  return <div className="ml-table-wrap"><table><caption>{label}와 원문 기준선의 거리 · 주문 신호 아님</caption>
    <thead><tr><th>원문 기준</th><th>수치</th><th>차이 (RSI pt)</th><th>위치</th></tr></thead>
    <tbody>{thresholdPositions(value).map(threshold => <tr key={threshold.label}><th>{threshold.label}</th><td>{fmt(threshold.threshold, 1)}</td>
      <td>{fmt(threshold.difference, Math.abs(threshold.difference) < 0.05 ? 6 : 2)}</td><td>{{ below: '아래', equal: '같음', above: '위' }[threshold.position] || '유보'}</td></tr>)}</tbody>
  </table></div>;
}
function Thresholds({ state, rows, gate }: { state: RsiState; rows: ReadyRow[]; gate: { ok: boolean; reason: string } }) {
  const manual = state.manualRsi === '' ? null : Number(state.manualRsi);
  const valid = manual !== null && finite(manual) && manual >= 0 && manual <= 100;
  const warning = !gate.ok && <p className="ml-warning">{gate.reason} 계산 RSI는 숨기고 수기 비교만 둡니다.</p>;
  if (state.rsiUnmatchedDate) return <>{warning}<p className="ml-warning">{state.rsiUnmatchedDate}에는 계산 RSI가 없습니다. 이전 기준선 표를 이 날짜의 값으로 읽지 마세요.</p>
    <p>수기 키움 RSI <strong>{valid ? fmt(manual) : '미입력 / 판단 유보'}</strong></p></>;
  const index = state.rsiOscIndex == null ? Math.max(0, rows.length - 1) : Math.max(0, Math.min(rows.length - 1, state.rsiOscIndex));
  const selected = rows[index] || null, latest = rows.at(-1) || null;
  const dateNote = selected ? `기준선 표 ${selected.date}${latest && selected.date !== latest.date ? ' · 마지막 완료 관측 ' + latest.date + '과 다름' : ' · 마지막 완료 관측'}` : '계산 RSI 없음';
  return <>{warning}<div className="ml-mini-results"><p>계산 RSI <strong>{fmt(selected?.rsi)}</strong> · {dateNote}</p>
    <p>계산 신호 SMA9 <strong>{fmt(selected?.signal)}</strong></p><p>수기 키움 RSI <strong>{valid ? fmt(manual) : '미입력 / 판단 유보'}</strong></p></div>
    {state.manualRsi !== '' && !valid && <p className="ml-error">0~100 범위의 수기 RSI를 입력하세요.</p>}
    <details className="ml-original"><summary>선택일과 기준선</summary><p>위치는 반올림 전 수치입니다. 차트에서 고른 과거일을 마지막 관측의 주문 시점으로 읽지 마세요.</p></details>
    <DistanceTable label="계산 RSI" value={selected?.rsi} /><DistanceTable label="수기 키움 RSI" value={valid ? manual : null} />
  </>;
}
export function RsiPanel({ snapshot, now, state, onChange, initialRangeDays = 0, symbol = 'TQQQ', onSymbol, revision, historyCache,chartCache,epoch=0,active=true,embedded=false }: { epoch?:number;active?:boolean;embedded?:boolean;chartCache?:Map<string,RsiChartCache>;historyCache?:Map<string,RsiHistoryState>; symbol?:string; onSymbol?:(symbol:string)=>void; revision?:string; initialRangeDays?: number; snapshot: MarketSnapshot | null; now: Date; state: RsiState; onChange: (state: RsiState) => void }) {
  const instrument = rsiInstrument(symbol)!;
  const market = snapshot?.markets.find(market => market.id === instrument.id);
  const prices = market?.prices || emptyPrices, gate = rsiGate(snapshot, market, now, symbol);
  const allRows = useMemo(() => {
    if (!gate.ok) return [];
    try { return calculateRsiSeries(prices, 14, 9); }
    catch { return []; }
  }, [prices, gate.ok]);
  const rows = useMemo(() => allRows.filter((row): row is ReadyRow => finite(row.rsi)),[allRows]);
  const points = useMemo<Point[]>(() => rows.map(row => [row.date, row.rsi]), [rows]);
  const signal = useMemo<[string, number | null][]>(() => rows.map(row => [row.date, row.signal]), [rows]);
  const [rangeDays, setRangeDays] = useState(initialRangeDays);
  const [showCrossings, setShowCrossings] = useState(true);
  const [heights, setHeights] = useState<{ price?: number; rsi?: number }>({});
  useLayoutEffect(() => {
    if (!Number.isFinite(window.innerHeight)) return;
    const resize = () => {
      const available = Math.max(300, window.innerHeight - (window.innerWidth <= 640 ? 440 : 330));
      setHeights({ price: Math.round(available * .66), rsi: Math.max(104, Math.round(available * .34)) });
    };
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const crossings = useMemo(() => rsiCrossings(rows), [rows]);
  const cutoff = rangeDays && prices.length ? new Date(Date.parse(prices.at(-1)![0]) - rangeDays * 86400000).toISOString().slice(0,10) : '';
  const priceOffset = Math.max(0, prices.findIndex(point => point[0] >= cutoff));
  const rsiOffset = Math.max(0, rows.findIndex(row => row.date >= cutoff));
  const visibleMarkers = showCrossings ? crossings.filter(marker => marker.date >= cutoff) : [];
  function priceDate(index: number) {
    const picked = resolveRsiSelection(prices, rows, index);
    onChange({ ...state, rsiIndex: picked.rsiIndex, rsiOscIndex: picked.rsiOscIndex, rsiUnmatchedDate: picked.unmatched ? picked.date : null });
  }
  function rsiDate(index: number) {
    const price = matchingIndex(prices, rows[index]?.date);
    onChange({ ...state, rsiUnmatchedDate: null, rsiOscIndex: index, rsiIndex: price ?? state.rsiIndex });
  }
  function changeRange(days: number) {
    setRangeDays(days);
    if (!days || state.rsiIndex == null || !prices.length) return;
    const start = new Date(Date.parse(prices.at(-1)![0]) - days * 86400000).toISOString().slice(0,10);
    if (prices[state.rsiIndex]?.[0] < start) priceDate(Math.max(0, prices.findIndex(point => point[0] >= start)));
  }
  if(onSymbol&&market&&gate.ok&&snapshot&&prices.length)return <RsiWorkbench symbol={symbol} market={market} snapshot={snapshot} now={now} rows={allRows} revision={revision} epoch={epoch} active={active} embedded={embedded} historyCache={historyCache} chartCache={chartCache} onDate={priceDate}
    references={<RsiReferences/>} comparison={<><label className="ml-field" htmlFor="ml-manual-rsi">키움 일봉 RSI 14 수기 입력 (0~100)<input id="ml-manual-rsi" data-control="manual-rsi" type="number" min="0" max="100" step="0.01" value={state.manualRsi} placeholder="미입력" onChange={e=>onChange({...state,manualRsi:e.currentTarget.value})}/></label><Thresholds state={state} rows={rows} gate={gate}/></>}/>;
  return <>
    <CompactToolbar label={`${symbol} 참고 RSI 도구`}><div className="compact-toolbar-tabs" data-presentation-control>
      {onSymbol && !embedded ? <SymbolPicker symbol={symbol} onSelect={onSymbol}/> : <strong>{symbol} <span>1D</span></strong>}
      <div role="group" aria-label="차트 표시 기간">{[[365,'1년'],[1095,'3년'],[0,'전체']].map(([days,label]) => <button key={days} type="button" aria-pressed={rangeDays === days} onClick={() => changeRange(Number(days))}>{label}</button>)}</div>
      <button type="button" aria-pressed={showCrossings} onClick={() => setShowCrossings(!showCrossings)}>Buy / Sell</button>
      <label>기준선 통과일 <select aria-label="기준선 통과일" value="" onChange={event => { const date = event.currentTarget.value, at = matchingIndex(prices, date); if (at != null) { if (date < cutoff) setRangeDays(0); priceDate(at); } }}>
        <option value="">날짜 선택</option>{[...crossings].reverse().map(marker => <option key={marker.date+marker.side} value={marker.date}>{marker.date} · {marker.side} {marker.level}</option>)}
      </select></label>
    </div><span className="compact-toolbar-muted" data-presentation-control>Buy 33.5 / 29.5 · Sell 40 / 43 · 하향 Buy / 상향 Sell</span></CompactToolbar>
    <div className="rsi-workbench"><article className="ml-card rsi-chart-panel"><h3>{symbol} 관측 종가 + 참고 RSI</h3><p className="ml-source-line">{snapshot?.sources.find(source => source.id === market?.sourceId)?.lastObservation || '관측일 없음'} · {market?.unit || 'USD'}</p>
      {market ? <>{gate.ok ? <ObservedChart id="rsi-price" points={prices.slice(priceOffset)} unit={market.unit} label={`${symbol} 관측 종가`} selected={state.rsiIndex == null ? null : state.rsiIndex - priceOffset} onSelect={index => priceDate(index + priceOffset)} markers={visibleMarkers} plotHeight={heights.price} />
        : <div data-chart="rsi-price"><p className="ml-warning">{gate.reason} 가격 차트는 숨깁니다.</p></div>}
        <ObservedChart id="rsi" points={points.slice(rsiOffset)} unit="RSI pt" label="참고 RSI14 · 키움 동등성 미검증" caption="참고 RSI14" selected={state.rsiOscIndex == null ? null : state.rsiOscIndex - rsiOffset} onSelect={index => rsiDate(index + rsiOffset)} lines={thresholds} rsi signal={signal.slice(rsiOffset)} plotHeight={heights.rsi} />
      </> : <Empty>{symbol} 종가가 없습니다. 계산 RSI는 표시하지 않으며 수기 입력 비교는 가능합니다.</Empty>}
      <details className="ml-original"><summary>RSI 계산 기준</summary><p className="ml-muted">마지막 제공된 완료 세션 종가 기준. 실제 계산: 종가 Wilder 14, 초기 14개 변화의 평균, 신호 SMA 9. 평균 상승폭과 평균 하락폭이 모두 0일 때만 RSI 50입니다. 최근 봉의 보합 전체가 50은 아닙니다. 키움 RSI 원본 내보내기가 없어 동등성은 유보입니다. 과거 당시의 데이터 판본과 키움 RSI 일치 여부는 재현하지 않습니다.</p></details>
    </article><details className="ml-card rsi-comparison"><summary>선택일 RSI · 키움값 비교</summary>
      <label className="ml-field" htmlFor="ml-manual-rsi">키움 일봉 RSI 14 수기 입력 (0~100)<input id="ml-manual-rsi" data-control="manual-rsi" type="number" min="0" max="100" step="0.01" value={state.manualRsi} placeholder="미입력" onChange={event => onChange({ ...state, manualRsi: event.currentTarget.value })} /></label>
      <div id="ml-thresholds" aria-live="polite"><Thresholds state={state} rows={rows} gate={gate} /></div>
      <details className="ml-original"><summary>기준선 안내 · 주문 신호 아님</summary><p>원문 매수 기준 33.5 / 29.5, 매도 기준 40 / 43. 차트 표식은 직전 RSI보다 내려 기준선 이하에 처음 닿으면 Buy, 올라 기준선 이상에 처음 닿으면 Sell로 표시하는 시각화 규칙입니다. 원문 매매 신호로 검증된 규칙은 아닙니다. 원문의 비교 연산, 비중, 3차 매수, 재진입, 이익 실현 우선순위는 미확인입니다.</p></details>
    </details></div>
    {market && gate.ok && prices.length > 0 && <RsiHistory key={symbol} cache={historyCache} symbol={symbol} unit={market.unit} prices={prices} rows={allRows} revision={revision} onDate={index=>{setRangeDays(0);priceDate(index);}}/>}
    <RsiReferences/>
  </>;
}

function RsiReferences(){return <>
    <details className="ml-original"><summary>종목·원문 기준</summary>
    <div className="ml-strategies">
      <article className="ml-card"><h3>TQQQ</h3><p className="ml-source-line">나스닥100 · 일일 3배</p><p>원문 수치 기준과 사용자 가정 실험을 구분합니다.</p></article>
      <article className="ml-card"><h3>KODEX 코스닥150 레버리지 · 233740</h3><p className="ml-source-line">국내 · 일일 2배</p><p>원문의 구두 상품명과 일치하는 공식 상품코드입니다. 종목별 매매 규칙은 미확인입니다.</p></article>
      <article className="ml-card"><h3>SOXL · 속쓸</h3><p className="ml-source-line">반도체 · 일일 3배</p><p>구두 표현에 해당하는 상품으로 연결했습니다. 원문 티커의 직접 표기와 종목별 매매 규칙은 미확인입니다.</p></article>
    </div>
    <div className="ml-risk"><strong>‘손절 없음’은 무위험이 아닙니다.</strong><p>원문 TQQQ 설명에 한정된 표현입니다. 일일 3배 레버리지 ETF는 일일 재설정·변동성 누적 손실·경로 의존성과 장기 손실 위험이 있습니다. 장기 수익률이 지수의 3배라는 뜻이 아닙니다.</p>
      <p><PublicLink url="https://www.proshares.com/our-etfs/leveraged-and-inverse/tqqq">ProShares 공식 TQQQ 상품·위험 설명</PublicLink></p></div>
    </details>
    <details className="ml-original"><summary>원문 조건과 계산 구현의 미확인 차이</summary><p>원문은 키움 일봉 14 + 신호 9를 요구합니다. 키움의 정확한 평활 방식·가격 종류·세션/시간 기준을 검증하지 못했습니다. 이 화면의 Wilder/SMA 계산과 수기 키움값은 독립된 값입니다. 자동 주문·검증된 승률·세 전략 동시 실행을 제공하지 않습니다.</p></details>
    <Original pages="사진 238 / R8 p.252 · 사진 239 / R8 p.254 · 사진 240 / R8 p.255">짧은 수치 인용: 매수 <q>33.5 / 29.5</q>, 매도 <q>40 / 43</q>. <q>손절 없음</q>은 TQQQ 설명에만 귀속합니다. 이 인용만으로 완전한 매매 엔진을 복원할 수 없습니다.</Original>
</>;}
