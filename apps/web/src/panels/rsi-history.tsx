import {atlasSitePath,isAtlasStatic} from '../../../../dist/site-paths.js';
import {backtestRsi} from '@atlas/domain/rsi-backtest';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '@atlas/contracts/market-lab';
import type { RsiRow } from '@atlas/domain/market-lab';
import type { BacktestOptions, BacktestResult } from '@atlas/domain/rsi-backtest';
import { LoadingSkeleton } from '../components/loading-skeleton.js';
import { fmt } from '../components/common.js';
import { ObservedChart } from '../components/observed-chart.js';
import { rsiCrossings } from '../rsi-crossings.js';
import {CompactToolbar,CompactToolbarMenu} from '../components/compact-toolbar.js';

export interface RsiHistoryState {options:BacktestOptions;result:BacktestResult|null;revision?:string}
export function RsiHistory({symbol,unit,prices,rows,revision,onDate,cache,initialCsv=false}:{symbol:string;unit:string;prices:Point[];rows:RsiRow[];revision?:string;onDate:(index:number)=>void;cache?:Map<string,RsiHistoryState>;initialCsv?:boolean}) {
  const [options,setOptions] = useState<BacktestOptions>(() => cache?.get(symbol)?.options || ({start:prices[0]?.[0] || '',end:prices.at(-1)?.[0] || '',capital:unit === 'KRW' ? 10000000 : 10000,buy:33.5,sell:43,feeBps:10}));
  const [result,setResult] = useState<BacktestResult|null>(()=>cache?.get(symbol)?.revision===revision ? cache?.get(symbol)?.result || null : null), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const resultRevision=useRef(revision);
  const [signalsOnly,setSignalsOnly] = useState(false);
  const [equityIndex,setEquityIndex] = useState<number|null>(null);
  const [csvText,setCsvText] = useState<string|null>(null);
  useEffect(()=>setCsvText(null),[options,revision,symbol,result,signalsOnly]);
  const active = useRef<AbortController|null>(null);
  useEffect(() => { if(resultRevision.current!==revision)setResult(null);setError('');setBusy(false);return () => active.current?.abort(); },[options,revision,symbol]);
  useEffect(()=>{cache?.set(symbol,{options,result:resultRevision.current===revision?result:null,revision});},[cache,symbol,options,result,revision]);
  const markers = useMemo(() => new Map(rsiCrossings(rows).map(marker => [marker.date,`${marker.side} ${marker.level}`])),[rows]);
  const executions = useMemo(() => new Map(result?.trades.map(trade => [trade.date,trade]) || []),[result]);
  const equityByDate = useMemo(()=>new Map(result?.equity || []),[result]);
  const history = rows.filter(row => row.date >= options.start && row.date <= options.end && (!signalsOnly || markers.has(row.date) || executions.has(row.date)));
  function update(key:keyof BacktestOptions,value:string) { active.current?.abort();setResult(null);setOptions(previous => ({...previous,[key]:key === 'start' || key === 'end' ? value : Number(value)})); }
  async function run(event:React.FormEvent) {
    event.preventDefault(); active.current?.abort(); const request = new AbortController(); active.current=request;setBusy(true);setError('');setResult(null);
    try {
      const response = isAtlasStatic()?Response.json({symbol,revision,result:backtestRsi(prices,options)}):await fetch(atlasSitePath('/api/v1/market-lab/backtest'),{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([request.signal,AbortSignal.timeout(15000)]),body:JSON.stringify({...options,symbol,revision})});
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
      if (body.revision !== revision || body.symbol !== symbol || !Array.isArray(body.result?.equity) || !Array.isArray(body.result?.trades) || !Number.isFinite(body.result?.finalEquity)) throw new Error('백테스트 응답을 확인할 수 없습니다.');
      if (!request.signal.aborted) {resultRevision.current=revision;setResult(body.result);}
    } catch (e) { if (!request.signal.aborted) setError(e instanceof Error ? e.message : '백테스트를 실행하지 못했습니다.'); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  function csv() {
    const output = [['date','close','rsi14','sma9','threshold_crossing','execution','quantity','fee','equity'],...history.map(row => {
      const trade=executions.get(row.date), value=equityByDate.get(row.date);
      return [row.date,row.close,row.rsi??'',row.signal??'',markers.get(row.date)||'',trade?.side||'',trade?.quantity??'',trade?.fee??'',value??''];
    })].map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n');
    setCsvText(output);
  }
  useEffect(()=>{if(initialCsv)csv();},[initialCsv]);
  return <section className="rsi-history" data-presentation-control aria-label="과거 기록·백테스트">
    <CompactToolbar label={`${symbol} 과거 기록 도구`} order={30}>
      <CompactToolbarMenu name="rsi-history-summary" label={`${history.length.toLocaleString()}일 · 가정`} title={`${symbol} 과거 기록·계산 가정`}><p>{prices[0]?.[0]} ~ {prices.at(-1)?.[0]} · {prices.length.toLocaleString()}일</p><p>가정 실험 · 다음 관측일 종가 체결 · 전액 매수/전량 매도 · {options.feeBps}bp = {fmt(options.feeBps/100)}%</p></CompactToolbarMenu>
      <label className="compact-toolbar-field"><input type="checkbox" checked={signalsOnly} onChange={e=>setSignalsOnly(e.currentTarget.checked)}/>신호·체결일만</label><button className="compact-toolbar-action" type="button" onClick={csv} disabled={!history.length}>CSV</button>
    </CompactToolbar>
    <div className="rsi-experiment-layout"><div className="rsi-experiment-input">
    <h2>백테스트 <small>{symbol}</small></h2>
    <form onSubmit={run} className="rsi-backtest-form">
      <label>시작<input aria-label="백테스트 시작일" type="date" required min={prices[0]?.[0]} max={prices.at(-1)?.[0]} value={options.start} onChange={e=>update('start',e.currentTarget.value)}/></label>
      <label>종료<input aria-label="백테스트 종료일" type="date" required min={options.start} max={prices.at(-1)?.[0]} value={options.end} onChange={e=>update('end',e.currentTarget.value)}/></label>
      <label>초기 자금 · {unit}<input aria-label="백테스트 초기 자금" type="number" required min="1" max="1000000000000" value={options.capital} onChange={e=>update('capital',e.currentTarget.value)}/></label>
      <label>Buy · 하향<input aria-label="백테스트 매수 RSI" type="number" required min="0" max="99.9" step="0.1" value={options.buy} onChange={e=>update('buy',e.currentTarget.value)}/></label>
      <label>Sell · 상향<input aria-label="백테스트 매도 RSI" type="number" required min="0.1" max="100" step="0.1" value={options.sell} onChange={e=>update('sell',e.currentTarget.value)}/></label>
      <label>편도 비용 · bp<input aria-label="백테스트 편도 비용 bp" type="number" required min="0" max="1000" step="1" value={options.feeBps} onChange={e=>update('feeBps',e.currentTarget.value)}/></label>
      <button type="submit" disabled={busy || !revision}>{busy?'계산 중…':'실행'}</button>
    </form>
    </div><div className="rsi-experiment-result"><h3>계산 결과</h3>
    {!revision && <p role="status">DB 연결 후 백테스트를 실행할 수 있습니다. 저장 자료의 기록은 아래에서 확인할 수 있습니다.</p>}
    {busy && <LoadingSkeleton kind="chart" label={`${symbol} 백테스트 계산 중`}/>}
    {error && <p role="alert" className="ml-error">{error}</p>}
    {!result && !busy && !error && revision && <p className="ml-empty-copy">조건을 입력하고 실행하세요.</p>}
    {result && <>
      <dl className="rsi-backtest-metrics"><div className="rsi-metric-primary"><dt>수익률</dt><dd>{fmt(result.returnPct)}%</dd></div><div><dt>매수 후 보유</dt><dd>{fmt(result.buyHoldReturnPct)}%</dd></div><div><dt>최대 낙폭</dt><dd>{fmt(result.maxDrawdownPct)}%</dd></div><div><dt>최종 평가액 · {unit}</dt><dd>{fmt(result.finalEquity)}</dd></div><div><dt>청산 거래</dt><dd>{result.closedTrades}</dd></div><div><dt>승률</dt><dd>{result.winRatePct == null ? '—' : `${fmt(result.winRatePct)}%`}</dd></div></dl>
      <ObservedChart id="rsi-equity" points={result.equity} label="백테스트 평가액" unit={unit} plotHeight={180} selected={equityIndex} onSelect={setEquityIndex}/>
      <div className="ml-source-line rsi-history-meta"><span>{result.start} ~ {result.end}</span><span>{result.sessions.toLocaleString()}일</span><span>잔여 {fmt(result.quantity,6)}주</span>{result.pending && <span>{result.pending.date} {result.pending.side} 체결 대기</span>}</div>
    </>}
    </div></div>
    {result && <details open className="rsi-trades"><summary>체결 기록 · {result.trades.length}건</summary><div className="ml-table-wrap rsi-ledger-scroll"><table><thead><tr><th>체결일</th><th>신호일</th><th>구분</th><th>체결가 · {unit}</th><th>수량</th><th>비용</th><th>청산 손익</th></tr></thead><tbody>{result.trades.map(trade=><tr key={trade.date}><td>{trade.date}</td><td>{trade.signalDate}</td><td>{trade.side}</td><td>{fmt(trade.price,4)}</td><td>{fmt(trade.quantity,6)}</td><td>{fmt(trade.fee)}</td><td>{trade.pnl == null?'—':fmt(trade.pnl)}</td></tr>)}</tbody></table></div></details>}
    <details className="ml-original"><summary>체결·자료 가정</summary><p>강연 원문을 복원한 전략이 아닌 단일 RSI 기준 실험입니다. 완료 종가로 신호를 확인한 뒤 다음 관측 거래일 종가에 체결합니다. 소수점 수량을 허용하고 보유 중 추가 매수·공매도는 하지 않습니다. 종료일 미체결 신호는 대기, 보유분은 평가만 하며 강제 청산하지 않습니다. 매수 후 보유도 동일한 초기 자금과 매수 비용을 적용하고 종료일 평가합니다. 비용은 수수료·슬리피지를 합한 편도 가정이며 세금·배당·환율은 제외합니다. 공급자 종가는 현재의 분할 조정 관행을 따르며 당시 데이터 판본을 재현하지 않습니다. 종목별 원문 규칙과 키움 RSI 동등성은 미검증입니다.</p></details>
    <h2>과거 기록 <small>{history.length.toLocaleString()}일</small></h2>
    {csvText != null && <section className="rsi-csv" aria-label="CSV 기록"><div className="rsi-history-heading"><strong>{symbol} CSV</strong><button type="button" onClick={()=>setCsvText(null)}>닫기</button></div><textarea aria-label="CSV 기록" readOnly value={csvText} onFocus={event=>event.currentTarget.select()}/></section>}
    <div className="ml-table-wrap rsi-ledger-scroll"><table><thead><tr><th>날짜</th><th>종가 · {unit}</th><th>RSI14</th><th>SMA9</th><th>기준선 통과</th><th>실험 체결</th></tr></thead><tbody>{history.map(row=><tr key={row.date}><td><button type="button" onClick={()=>onDate(prices.findIndex(point=>point[0]===row.date))}>{row.date}</button></td><td>{fmt(row.close,4)}</td><td>{fmt(row.rsi,4)}</td><td>{fmt(row.signal,4)}</td><td>{markers.get(row.date)||'—'}</td><td>{executions.get(row.date)?.side||'—'}</td></tr>)}</tbody></table></div>
  </section>;
}
