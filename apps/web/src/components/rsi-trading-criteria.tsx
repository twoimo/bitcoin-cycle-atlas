import type {RsiSimulationResult} from '@atlas/domain/rsi-simulation';
import {RSI_REFERENCES} from '@atlas/domain/market-lab';
import {rsiCriteriaSlot} from '../../../../dist/ui/rsi-criteria-layout.js';
import {rsiTrancheStatus} from '../../../../dist/ui/rsi-tranche-status.js';
import type {ChartOverlayGeometry} from './rsi-chart-canvas.js';

const number=(value:number|null|undefined,digits=1)=>value==null||!Number.isFinite(value)?'—':new Intl.NumberFormat('ko-KR',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);
const level=(value:number)=>number(value,Number.isInteger(value)?0:1);
type CriteriaState='met'|'unmet'|'waiting';
export function tradingCriteriaState(result:RsiSimulationResult|null,error=''){
  const buy=result?.assumptions.entryLevels||RSI_REFERENCES.slice(0,2).map(item=>item.threshold);
  const sell=result?.assumptions.exitLevels||RSI_REFERENCES.slice(2,4).map(item=>item.threshold);
  const rsi=result?.currentRsi;
  const available=Boolean(!error&&result?.status==='ready'&&rsi!=null&&Number.isFinite(rsi));
  let state:CriteriaState='waiting',reason=error||'확정 일봉의 RSI 14 자료를 기다립니다.';
  if(available&&result){
    if(result.pending.length){state='met';reason=result.pending.map(signal=>`${signal.tranche}차 ${signal.side==='Buy'?'매수':'매도'} 충족 · 다음 확정 봉 종가 체결 대기`).join(' / ');}
    else if(result.nextTriggers.some(trigger=>trigger.side==='Buy'?rsi!<=trigger.level:rsi!>=trigger.level)){
      reason=result.state==='flat'?`새 ${level(buy[0])} 하향 통과 대기`:'선행 보유 상태와 다음 확정 신호 대기';
    }else{state='unmet';reason=result.nextTriggers.map(trigger=>`${trigger.tranche}차 ${trigger.side==='Buy'?'매수':'매도'} 기준 ${level(trigger.level)} 미충족`).join(' / ');}
  }
  const band=!available?'unavailable':rsi!<=buy[1]?'strong-buy':rsi!<=buy[0]?'buy':rsi!<sell[0]?'neutral':rsi!<sell[1]?'sell':'strong-sell';
  return {state,label:({met:'충족',unmet:'미충족',waiting:'대기'})[state],reason,buy,sell,rsi:available?rsi:null,band,
    bandLabel:({'strong-buy':'적극 매수',buy:'분할 매수',neutral:'중립',sell:'분할 매도','strong-sell':'적극 매도',unavailable:'—'})[band]};
}

function criteriaRows(result:RsiSimulationResult|null,error:string){
  const status=tradingCriteriaState(result,error),{buy,sell}=status,metrics=result?.metrics;
  const stages=rsiTrancheStatus(result,{error});
  const compactStage=(stage:(typeof stages.buy)[number])=>stage.status==='holding'?'보유':stage.status==='blocked'&&stage.label!=='보유 없음'?'순서대기':stage.label.replaceAll(' ','');
  const stageText=(rows:typeof stages.buy)=>rows.map(stage=>`${stage.stage}차 ${compactStage(stage)}`).join(' · ');
  const stageReason=(rows:typeof stages.buy)=>rows.map(stage=>`${stage.stage}차 RSI ${stage.level} · ${stage.reason}`).join(' / ');
  const active=(band:string)=>status.band==='unavailable'?'—':status.band===band?'활성':'비활성';
  return {status,stages,rows:[
    ['criteria','매매 기준',`RSI ${[...buy,...sell].map(level).join('/')}`],
    ['win-rate','전체 승률',`${number(metrics?.winRatePct)}${metrics?.winRatePct==null?'':'%'} · n=${metrics?.closedTranches??'—'}`],
    ['current','현재',`RSI ${number(status.rsi)} · ${status.label}`],
    ['buy','분할 매수',stageText(stages.buy),stageReason(stages.buy)],
    ['sell','분할 매도',stageText(stages.sell),stageReason(stages.sell)],
    ['strong','적극 구간',`매수 ${active('strong-buy')} · 매도 ${active('strong-sell')}`,`표시 구간: 매수 RSI ≤ ${level(buy[1])} · 매도 RSI ≥ ${level(sell[1])}. 실제 체결 신호와 구별합니다.`],
    ['neutral','중립',active('neutral'),`${level(buy[0])} < RSI < ${level(sell[0])}인 표시 구간입니다.`],
  ]};
}

export function TradingCriteriaHud({symbol,result,error,geometry,open,onDetails}:{symbol:string;result:RsiSimulationResult|null;error:string;geometry:ChartOverlayGeometry;open:boolean;onDetails:()=>void}){
  const layout=rsiCriteriaSlot(geometry),{status,stages,rows}=criteriaRows(result,error);
  if(!layout.visible)return null;
  return <button type="button" className="rsi-trading-criteria" data-rsi-criteria={symbol} data-criteria-state={status.state}
    data-criteria-band={status.band} data-criteria-collapsed={String(layout.collapsed)} data-criteria-placement={layout.placement}
    data-criteria-area-ratio={layout.areaRatio} data-criteria-through={result?.usedThrough||''} data-criteria-width={layout.width} data-criteria-height={layout.height}
    aria-label={`${symbol} 매매 기준 상세 · 현재 ${status.label}`} aria-haspopup="dialog" aria-expanded={open}
    title={`${symbol} · 확정 일봉 ${result?.usedThrough||'—'} · ${status.reason}`} onClick={onDetails}
    style={{left:layout.x,top:layout.y,width:layout.width,height:layout.height}}>
    {layout.collapsed?<span className="rsi-criteria-chip">{layout.width>=104?'매매 기준':'기준'}{layout.width>=136&&<small>{status.label}</small>}</span>:<>
      {rows.map(([key,label,value,description])=><span key={key} className="rsi-criteria-row" data-criteria-field={key} title={description||value}
        data-first-status={key==='buy'?stages.buy[0].status:key==='sell'?stages.sell[0].status:undefined}
        data-second-status={key==='buy'?stages.buy[1].status:key==='sell'?stages.sell[1].status:undefined}
        data-buy-active={key==='strong'?(status.band==='unavailable'?'unknown':String(status.band==='strong-buy')):undefined}
        data-sell-active={key==='strong'?(status.band==='unavailable'?'unknown':String(status.band==='strong-sell')):undefined}
        data-neutral-active={key==='neutral'?(status.band==='unavailable'?'unknown':String(status.band==='neutral')):undefined}><span>{label}</span><strong>{value}</strong></span>)}
      <span className="rsi-criteria-clock">확정 {result?.usedThrough||'—'} · 일봉 <span>상세 ›</span></span>
    </>}
  </button>;
}

export function TradingCriteriaDetails({symbol,result,error}:{symbol:string;result:RsiSimulationResult|null;error:string}){
  const {status,stages,rows}=criteriaRows(result,error),{buy,sell}=status;
  return <section className="rsi-criteria-details" aria-label={`${symbol} 매매 기준과 전체 기간 결과`}>
    <dl>{rows.map(([key,label,value,description])=><div key={key} data-criteria-detail={key}><dt>{label}</dt><dd title={description||value}>{value}</dd></div>)}</dl>
    <p data-criteria-current-reason><strong>{status.label}</strong> · {status.reason} · 표시 구간 {status.bandLabel}</p>
    <p>현재 판정은 {result?.usedThrough||'—'}까지 확정된 일봉과 실제 시뮬레이션 보유 상태를 사용합니다. 첫 매수는 직전 RSI가 {level(buy[0])} 초과이고 현재 {level(buy[0])} 이하인 하향 통과입니다. 추가 매수·매도는 활성 보유 단계에서만 판정하며, 충족 후 다음 확정 봉 종가까지 체결 대기입니다.</p>
    <p>전체 승률은 전체 보존 기간 {result?.start||'—'} ~ {result?.usedThrough||'—'}에 청산된 트랜치의 비용 후 승리 비율입니다. n은 청산 트랜치 수이며, 진행 중·체결 대기는 제외합니다. 저장한 시작·종료일, 차트 확대, 선택일과 주봉 표시는 전체 기간 판정을 바꾸지 않습니다. 비용·비중·초기 자금은 매매 설정을 따릅니다.</p>
    <h3>최근 신호 · 최대 5건</h3>
    {stages.recent.length?<div className="rsi-simulation-table"><table data-rsi-recent-signals><thead><tr><th scope="col">신호</th><th scope="col">신호일</th><th scope="col">체결일</th><th scope="col">상태</th></tr></thead>
      <tbody>{stages.recent.map(signal=><tr key={signal.id} data-status={signal.status}><td>{signal.label}</td><td>{signal.signalDate}</td><td>{signal.executionDate||'—'}</td><td>{signal.status==='pending'?'체결 대기':'체결'}</td></tr>)}</tbody></table></div>:<p>계산 구간에 발생한 신호 없음</p>}
    <details><summary>적극·분할·중립 표시 구간</summary><p>적극 매수는 RSI ≤ {level(buy[1])}, 분할 매수는 {level(buy[1])} &lt; RSI ≤ {level(buy[0])}, 중립은 {level(buy[0])} &lt; RSI &lt; {level(sell[0])}, 분할 매도는 {level(sell[0])} ≤ RSI &lt; {level(sell[1])}, 적극 매도는 RSI ≥ {level(sell[1])}입니다. 네 기준선을 읽기 위한 화면 표시 구간이며, 별도의 검증된 매매 신호나 주문 비중을 뜻하지 않습니다. 실제 충족 여부는 위의 하향 통과·보유 단계·체결 대기 규칙으로 판정합니다. 자료가 없으면 중립으로 채우지 않습니다.</p></details>
  </section>;
}
