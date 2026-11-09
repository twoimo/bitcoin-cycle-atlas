import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {Market,MarketSnapshot,Point} from '@atlas/contracts/market-lab';
import {simulateRsiTranches,type RsiSimulationResult} from '@atlas/domain/rsi-simulation';
import {calendarDate} from '@atlas/domain/market-lab';
import {useCompactToolbar} from './compact-toolbar.js';

export interface SimulationSettings {capital:number;feeBps:number;firstWeight:number;start:string;end:string}
const number=(value:number|null|undefined,digits=2)=>value==null||!Number.isFinite(value)?'—':new Intl.NumberFormat('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const signed=(value:number|null|undefined,digits=2)=>value==null?'—':`${value<0?'−':value>0?'+':''}${number(Math.abs(value),digits)}`;
const storageKey=(symbol:string)=>`atlas:rsi-simulation:v1:${symbol}`;
const defaults=(unit:string):SimulationSettings=>({capital:unit==='KRW'?10000000:10000,feeBps:5,firstWeight:50,start:'',end:''});

export function useRsiSimulation(symbol:string,market:Market,snapshot:MarketSnapshot,now:Date){
  const [settings,setSettings]=useState<SimulationSettings>(()=>{
    const initial=defaults(market.unit);
    try{const saved=JSON.parse(localStorage.getItem(storageKey(symbol))||'null');
      if(saved&&typeof saved==='object'&&Number.isFinite(saved.capital)&&saved.capital>0&&saved.capital<=1e12&&Number.isFinite(saved.feeBps)&&saved.feeBps>=0&&saved.feeBps<=1000&&Number.isFinite(saved.firstWeight)&&saved.firstWeight>=1&&saved.firstWeight<=99&&typeof saved.start==='string'&&typeof saved.end==='string')return {...initial,...saved};
    }catch{/* A blocked or invalid preference store never prevents a chart. */}
    return initial;
  });
  useEffect(()=>{try{localStorage.setItem(storageKey(symbol),JSON.stringify(settings));}catch{/* Preferences are optional. */}},[settings,symbol]);
  const source=snapshot.sources.find(item=>item.id===market.sourceId);
  // A source date alone cannot certify today's still-forming exchange candle.
  const today=calendarDate(now,market.timezone||source?.timezone||(market.region==='kr'?'Asia/Seoul':'America/New_York'));
  const completed=today?market.prices.filter(([date])=>date<today&&(!source?.lastObservation||date<=source.lastObservation)):[];
  const confirmedThrough=completed.at(-1)?.[0]||(today?new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10):'');
  const updatedAt=source?.retrievedAt&&Number.isFinite(Date.parse(source.retrievedAt))?source.retrievedAt:null;
  const calculation=useMemo(()=>{
    try{if(!today)throw new RangeError('거래소 시간대와 확정 봉 기준 시각을 확인할 수 없습니다.');return {result:simulateRsiTranches(market.prices,{start:settings.start||market.prices[0][0],end:settings.end||confirmedThrough,confirmedThrough,
      capital:settings.capital,feeBps:settings.feeBps,weights:[settings.firstWeight/100,1-settings.firstWeight/100],updatedAt}),error:''};}
    catch(error){return {result:null,error:error instanceof Error?error.message:'분할 매매를 계산하지 못했습니다.'};}
  },[market.prices,settings,confirmedThrough,updatedAt,today]);
  return {...calculation,settings,setSettings,confirmedThrough};
}

export function SimulationHud({symbol,unit,result,error,onDetails,onSettings}:{symbol:string;unit:string;result:RsiSimulationResult|null;error:string;onDetails:()=>void;onSettings:()=>void}){
  const metrics=result?.metrics;
  const clock=result?.updatedAt?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(result.updatedAt))+' KST':'미확인';
  return <section className="rsi-simulation-hud" aria-label={`${symbol} 분할 매매 평단가`} data-simulation-state={result?.state||'error'}>
    <header><span className="rsi-simulation-name">분할 매매 <small>{result?result.assumptions.weights.map(w=>number(w*100,0)).join(' / '):'50 / 50'}</small></span>
      <button type="button" className="rsi-win-badge" data-rsi-win-badge aria-haspopup="dialog" aria-label={`${symbol} 분할 매매 성과 상세`} onClick={onDetails}>
        승률 {metrics?.winRatePct==null?'—':number(metrics.winRatePct,1)+'%'} · n={metrics?.closedTranches??0}
      </button>
    </header>
    {error?<p className="rsi-simulation-error" role="alert">{error} <button type="button" onClick={onSettings}>설정</button></p>:result&&<>
      <dl className="rsi-position-grid">
        <div><dt>보유 트랜치</dt><dd data-rsi-hud="holdings">{result.holdings.length}/2 <small>{result.holdings.length?'진행 중':'대기'}</small></dd></div>
        <div><dt>수량</dt><dd data-rsi-hud="quantity">{number(result.quantity,4)}주</dd></div>
        <div><dt>평균단가</dt><dd data-rsi-hud="average-cost">{number(result.averageCost)} <small>{unit}</small></dd></div>
        <div><dt>현재가 <small>확정 종가</small></dt><dd data-rsi-hud="current-price">{number(result.currentPrice)} <small>{unit}</small></dd></div>
        <div><dt>평가손익</dt><dd data-rsi-hud="pnl" className={result.unrealizedPnl>0?'gain':result.unrealizedPnl<0?'loss':''}>{signed(result.unrealizedPnl)} <small>{unit}</small></dd></div>
        <div className="rsi-next-trigger"><dt>다음 트리거</dt><dd data-rsi-hud="next-trigger">{result.nextTriggers.map(trigger=><span key={trigger.side+trigger.tranche}>RSI {number(trigger.level)}까지 {signed(trigger.difference)}p{trigger.pending?' · 체결 대기':''}</span>)}</dd></div>
      </dl>
      <footer><span data-rsi-hud="updated-at">확정봉 {result.usedThrough||'없음'} · 갱신 {clock}</span><span data-rsi-ongoing>진행 중 {metrics?.ongoingTranches??0}트랜치 · 승률 제외</span><button type="button" data-rsi-simulation-settings onClick={onSettings}>매매 설정</button></footer>
    </>}
  </section>;
}

/** A native top-layer dialog in the same document as the outer toolbar. */
export function RsiDetailDialog({open,title,name,onClose,children}:{open:boolean;title:string;name:string;onClose:()=>void;children:ReactNode}){
  const owner=useCompactToolbar(),dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null);
  const close=useRef(onClose);close.current=onClose;
  const scope=useRef({epoch:owner.epoch,target:owner.target});
  const target=owner.target?.ownerDocument.body;
  useEffect(()=>{
    const node=dialog.current;if(!node)return;
    if(open&&owner.canInteract()){
      if(!node.open){const active=node.ownerDocument.activeElement;opener.current=(active?.tagName==='IFRAME'?document.activeElement:active) as HTMLElement|null;node.showModal();}
    }else if(node.open)node.close();
  },[open,owner.canInteract,owner.target]);
  useEffect(()=>{
    const changed=scope.current.epoch!==owner.epoch||scope.current.target!==owner.target;
    scope.current={epoch:owner.epoch,target:owner.target};
    if(!owner.active||changed)close.current();
  },[owner.active,owner.epoch,owner.target]);
  useEffect(()=>{
    if(!open||!owner.hosted)return;
    const frame=window.frameElement,Observer=frame?.ownerDocument.defaultView?.MutationObserver;
    if(!frame||!Observer)return;
    const observer=new Observer(()=>{if(!owner.canInteract()){dialog.current?.close();close.current();}});
    observer.observe(frame,{attributes:true,attributeFilter:['hidden','data-center-epoch']});
    return()=>observer.disconnect();
  },[open,owner.hosted,owner.canInteract]);
  const content=<dialog ref={dialog} className="compact-toolbar-dialog rsi-detail-dialog" data-rsi-dialog={name} aria-label={title} onCancel={()=>close.current()}
    onClose={()=>{close.current();if(owner.canInteract()&&opener.current?.isConnected)opener.current.focus();}}
    onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.current?.close();}}}>
    <header className="compact-toolbar-dialog-header"><h2>{title}</h2><button autoFocus type="button" data-rsi-dialog-close aria-label={`${title} 닫기`} onClick={()=>dialog.current?.close()}>닫기</button></header>
    <div className="compact-toolbar-dialog-body rsi-detail-body">{children}</div>
  </dialog>;
  return target?createPortal(content,target):content;
}

export function SimulationSettingsForm({settings,prices,confirmedThrough,unit,onApply}:{settings:SimulationSettings;prices:Point[];confirmedThrough:string;unit:string;onApply:(settings:SimulationSettings)=>void}){
  const [draft,setDraft]=useState(settings),[message,setMessage]=useState('');
  useEffect(()=>{setDraft(settings);},[settings]);
  const update=(key:keyof SimulationSettings,value:string)=>{setMessage('');setDraft(previous=>({...previous,[key]:key==='start'||key==='end'?value:Number(value)}));};
  return <form className="rsi-simulation-settings" onSubmit={event=>{event.preventDefault();onApply(draft);setMessage('매매 설정을 적용했습니다.');}}>
    <h3>분할 매매 설정</h3>
    <label>첫 매수 비중 · %<input aria-label="첫 트랜치 비중" type="number" required min="1" max="99" step="1" value={draft.firstWeight} onChange={e=>update('firstWeight',e.currentTarget.value)}/></label>
    <p className="rsi-simulation-note">33.50 매수 {draft.firstWeight}% / 29.50 추가 매수 {100-draft.firstWeight}%</p>
    <label>초기 자금 · {unit}<input aria-label="분할 매매 초기 자금" type="number" required min="1" max="1000000000000" value={draft.capital} onChange={e=>update('capital',e.currentTarget.value)}/></label>
    <label>편도 비용 · bp<input aria-label="분할 매매 편도 비용 bp" type="number" required min="0" max="1000" step="0.1" value={draft.feeBps} onChange={e=>update('feeBps',e.currentTarget.value)}/></label>
    <label>계산 시작<input aria-label="분할 매매 시작일" type="date" required min={prices[0][0]} max={draft.end||confirmedThrough} value={draft.start||prices[0][0]} onChange={e=>update('start',e.currentTarget.value)}/></label>
    <label>계산 종료<input aria-label="분할 매매 종료일" type="date" required min={draft.start||prices[0][0]} max={confirmedThrough} value={draft.end||confirmedThrough} onChange={e=>update('end',e.currentTarget.value)}/></label>
    <button type="submit">매매 설정 적용</button><button type="button" onClick={()=>{const reset=defaults(unit);setDraft(reset);onApply(reset);setMessage('기본 50/50 · 5bp · 전체 기간으로 복원했습니다.');}}>기본값</button>
    <p role="status">{message}</p>
  </form>;
}

export function SimulationDetails({result,unit,symbol}:{result:RsiSimulationResult;unit:string;symbol:string}){
  const m=result.metrics,pf=m.profitFactorStatus==='no-losses'?'손실 없음':number(m.profitFactor);
  const csv=[['symbol','cycle','tranche','side','signal_date','execution_date','price','quantity','fee','closed_pnl','closed_return_pct'],...result.trades.map(t=>[symbol,t.cycle,t.tranche,t.side,t.signalDate,t.date,t.price,t.quantity,t.fee,t.pnl??'',t.returnPct??''])].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const [url,setUrl]=useState('');
  useEffect(()=>{const next=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));setUrl(next);return()=>URL.revokeObjectURL(next);},[csv]);
  return <div className="rsi-simulation-details">
    <dl className="rsi-simulation-metrics">
      <div><dt>승률 · 청산 트랜치</dt><dd>{number(m.winRatePct,1)}% · n={m.closedTranches}</dd></div>
      <div><dt>PF · 동일 투자금 수익률 기준</dt><dd>{pf}</dd></div>
      <div><dt>거래당 기대값 · 비용 후</dt><dd>{signed(m.expectancyPct)}% <small>({signed(m.expectancy)} {unit})</small></dd></div>
      <div><dt>평균 보유일 · 달력일</dt><dd>{number(m.averageHoldingDays)}일</dd></div>
      <div><dt>최대 낙폭 · 전체 평가액</dt><dd>{number(m.maxDrawdownPct)}%</dd></div>
      <div><dt>진행 중 · 승률 제외</dt><dd>{m.ongoingTranches}트랜치 / {m.ongoingCycles}포지션</dd></div>
      <div><dt>편도 비용</dt><dd>{number(result.assumptions.feeBps,1)}bp</dd></div>
      <div><dt>기간 · 확정 일봉</dt><dd>{result.start} ~ {result.end} · {result.sessions.toLocaleString()}봉</dd></div>
    </dl>
    <h3>체결 가정</h3>
    <p>Wilder RSI14 · 일봉 종가 확정 후 다음 관측 거래일 종가에 체결합니다. 한 확정 봉에서 한 신호만 예약하며 미확정 봉과 종료일 뒤 체결은 사용하지 않습니다. 주봉 표시는 계산에 영향을 주지 않습니다.</p>
    <p>0 → RSI 33.50 매수 → 29.50 추가 매수 → 40 첫 트랜치 청산 → 43 나머지 청산. 첫 진입은 하향 통과, 보유 후 단계는 확정 RSI의 기준 충족으로 판정합니다. 한 트랜치만 보유했다면 40에서 청산합니다. 한 봉이 여러 기준선을 넘더라도 다음 단계는 별도 확정 봉에서 판정합니다.</p>
    <p>비중 {result.assumptions.weights.map(w=>number(w*100,0)+'%').join(' / ')} · 비용 포함 예산 · 소수점 수량 허용 · 손절 없음 · 전량 청산 전 재진입 없음. 평단에는 매수 비용, 평가손익에는 예상 청산 비용까지 포함합니다. 진행 중 보유분은 강제 청산하거나 승률 분모에 넣지 않습니다.</p>
    <p>PF는 청산 트랜치의 양수 순수익률 합 ÷ 음수 순수익률 절댓값 합입니다. 금액 기준 PF {number(m.cashProfitFactor)}. 최대 낙폭은 진행 중 보유분을 포함한 일별 현금+종가 평가액으로 계산합니다. 배당·세금·환율은 제외합니다.</p>
    {result.pending.length>0&&<p className="rsi-pending" role="status">{result.pending.map(p=>`${p.date} · ${p.tranche}차 ${p.side==='Buy'?'매수':'청산'} 신호 · 다음 확정 봉 체결 대기`).join(' / ')}</p>}
    <h3>진행 중 보유</h3>
    {result.holdings.length?<div className="rsi-simulation-table"><table><thead><tr><th>트랜치</th><th>체결일</th><th>수량</th><th>평가손익 · {unit}</th></tr></thead><tbody>{result.holdings.map(h=><tr key={h.tranche}><td>{h.tranche}차</td><td>{h.date}</td><td>{number(h.quantity,6)}</td><td>{signed(h.unrealizedPnl)}</td></tr>)}</tbody></table></div>:<p>진행 중 보유 없음</p>}
    <details><summary>분할 체결 기록 · {result.trades.length}건</summary><div className="rsi-simulation-table"><table><thead><tr><th>체결일</th><th>신호일</th><th>트랜치</th><th>구분</th><th>가격 · {unit}</th><th>수량</th><th>비용</th><th>청산 손익</th></tr></thead><tbody>{result.trades.map(t=><tr key={`${t.date}-${t.side}-${t.tranche}`}><td>{t.date}</td><td>{t.signalDate}</td><td>{t.tranche}차</td><td>{t.side==='Buy'?'매수':'청산'}</td><td>{number(t.price,4)}</td><td>{number(t.quantity,6)}</td><td>{number(t.fee,4)}</td><td>{signed(t.pnl)}</td></tr>)}</tbody></table></div></details>
    <a className="rsi-csv-download" href={url||undefined} download={`${symbol}-split-${result.start}-${result.end}.csv`}>분할 체결 CSV 저장</a>
  </div>;
}
