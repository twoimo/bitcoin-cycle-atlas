import {buildCycleClockBacktest,assertCycleClockBacktest} from './cycle-clock-backtest.js';
import {createForecastComputation} from './forecast-computation.js';
import {forecastHash} from './forecast-records.js';
import {setLoadingSurface} from './loading-surfaces.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number.isFinite(value)?new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(value):'—';
const signed=value=>Number.isFinite(value)?(value>0?'+':'')+number(value)+'일':'—';
const typeLabel=type=>type==='peak'?'고점':'저점';
const reasonLabel=reason=>({'origin-before-history':'기준일 이전 자료 없음','origin-not-observed':'기준일 미도달','origin-close-missing':'기준일 종가 없음','timing-unavailable-at-origin':'당시 보정 근거 부족','next-era-outcome-not-closed':'다음 반감기 구간 미종료 · 채점 보류','clock-not-in-future':'시계 날짜가 기준일 이전','no-observed-halving':'관측 반감기 이전 · 시계 기준점 없음','no-complete-reference-era':'종료된 참고 사이클 없음','persistent-drawdown-not-confirmed':'지속 하락 확인 전','incomplete-current-era':'현재 구간의 연속 관측 부족','outcome-reference-unavailable':'종료 목표 자료 부족'})[reason]??reason;

export function clockSummaryMarkup(result){
  return '<table><caption>보정 효과 · 같은 원점끼리 비교 · 목표별 동일 가중 · MAE 단위 일</caption><thead><tr><th>목표</th><th>고유 목표</th><th>원점</th><th>무보정 MAE</th><th>보정 MAE</th><th>오차 감소</th></tr></thead><tbody>'+result.summary.map(s=>'<tr><th>'+typeLabel(s.type)+'</th><td>'+s.uniqueTargetCount+'</td><td>'+s.originCount+'</td><td>'+number(s.baselineMaeDays)+'</td><td>'+number(s.adjustedMaeDays)+'</td><td>'+signed(s.improvementDays)+'</td></tr>').join('')+'</tbody></table>';
}
export function clockOriginRowsMarkup(target,baselineRecords=[],records=[]){
  return target.origins.map(a=>{
    const baseline=baselineRecords.find(r=>r.origin===a.origin&&r.targetId===target.targetId)??(a.baselineDate?a:null);
    const paired=records.find(r=>r.origin===a.origin&&r.targetId===target.targetId)??(a.adjustedDate?a:null);
    const status=a.status==='baseline-only'?'무보정만':a.status==='unavailable'?'시계 없음':'쌍비교';
    return '<tr><th scope="row">'+a.origin+'<small>'+status+' · 입력 '+esc(a.trainingThrough??'없음')+'</small></th><td>'+esc(a.referencePeakDate??'—')+'<small>종료 참고 '+number(a.referenceCountAtOrigin)+'개'+(a.referenceKnownAts?.length?' · '+a.referenceKnownAts.at(-1)+' 확인':'')+'</small></td><td>'+esc(baseline?.baselineDate??'—')+'</td><td>'+esc(paired?.adjustedDate??'—')+(paired?'':'<small class="clock-missing-reason">'+esc(reasonLabel(a.calibrationReason??'timing-unavailable-at-origin'))+'</small>')+'</td><td>'+signed(baseline?.baselineErrorDays)+'</td><td>'+signed(paired?.adjustedErrorDays)+'</td><td>'+signed(paired?.appliedShiftDays)+'</td></tr>';
  }).join('');
}
export function clockExcludedRowsMarkup(excluded){
  return excluded.map(r=>'<tr><th scope="row">'+r.origin+'</th><td colspan="6">'+esc(reasonLabel(r.reason==='timing-unavailable-at-origin'?r.calibrationReason:r.reason))+(r.outcomeClosed===false&&r.outcomeReason!==r.reason?' · '+esc(reasonLabel(r.outcomeReason)):'')+'<small>종료 참고 '+number(r.referenceCountAtOrigin)+'개'+(r.referenceKnownAts?.length?' · '+r.referenceKnownAts.at(-1)+' 확인':'')+'</small></td></tr>').join('');
}
export function clockHistoryMarkup(result){
  const peaks=result.historicalTargets.filter(t=>t.type==='peak');
  return '<details class="clock-history-coverage"><summary>과거 목표 '+result.coverageStats.historicalCycleCount+' · 무보정 '+result.coverageStats.baselineCycleCount+' · 쌍비교 '+result.coverageStats.pairedCycleCount+' 사이클</summary><div class="monthly-summary" role="region" tabindex="0" aria-label="과거 사이클별 검증 범위"><table><caption>원점 수 · 같은 사이클의 고점·저점은 합산하지 않음</caption><thead><tr><th>목표 구간</th><th>실제 고점 / 저점</th><th>검토</th><th>무보정</th><th>쌍비교</th><th>보정 근거 부족</th><th>무보정 MAE 고점 / 저점</th></tr></thead><tbody>'+peaks.map(t=>{
    const low=result.historicalTargets.find(l=>l.cycleId===t.cycleId&&l.type==='trough');
    return '<tr><th>'+t.cycleYear+'</th><td>'+t.targetDate+' / '+low.targetDate+'</td><td>'+t.originCount+'</td><td>'+t.baselineOriginCount+'</td><td>'+t.pairedOriginCount+'</td><td>'+t.insufficientOriginCount+'</td><td>'+number(t.baselineMaeDays)+' / '+number(low.baselineMaeDays)+'</td></tr>';
  }).join('')+'</tbody></table></div><p>무보정 전체: 고점 '+number(result.baselineSummary[0].baselineMaeDays)+'일 · 저점 '+number(result.baselineSummary[1].baselineMaeDays)+'일 · '+result.coverageStats.baselineCycleCount+'개 목표 사이클 동일 가중. 보정 효과 표는 보정 가능한 같은 원점만 비교합니다.</p></details>';
}
export function clockConditionalMarkup(clock){
  return '<details class="monthly-method clock-conditional"><summary>현재 조건부 시계 · 채점 제외</summary><table><thead><tr><th>목표</th><th>무보정</th><th>보정</th></tr></thead><tbody><tr><th>고점</th><td>'+esc(clock.baselinePeak??'자료 없음')+'</td><td>'+esc(clock.adjustedPeak??'보정 근거 부족')+'</td></tr><tr><th>저점</th><td>'+esc(clock.baselineTrough??'자료 없음')+'</td><td>'+esc(clock.adjustedTrough??'보정 근거 부족')+'</td></tr></tbody></table><p>기준 고점 '+esc(clock.referencePeakDate??'없음')+' · 관측 '+clock.asOf+' UTC · 보정 '+signed(clock.appliedShiftDays)+'</p></details>';
}
function workerFactory(){
  if(typeof Worker!=='function'||!/^https?:$/.test(globalThis.location?.protocol??''))return undefined;
  return ()=>new Worker(new URL('./cycle-clock-backtest-worker.js',import.meta.url),{type:'module',name:'atlas-clock-audit'});
}

export function mountCycleClockBacktest({plot,trigger,getDataset,openPrice=()=>{},computer=null}={}){
  const doc=plot.ownerDocument,win=doc.defaultView,panel=doc.createElement('section');
  panel.className='monthly-backtest clock-backtest';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','거시 시계 검증');
  panel.innerHTML='<header class="monthly-heading"><h2>거시 시계 검증</h2><span>BTCUSD</span><div class="backtest-view-tabs" role="group" aria-label="백테스트 종류"><button type="button" data-cb="price-mode" aria-pressed="false">월말 가격</button><button type="button" aria-pressed="true">거시 시계</button></div><button type="button" data-cb="close" aria-label="거시 시계 검증 닫기">×</button></header>'+
    '<div class="monthly-toolbar"><button type="button" data-cb="run">다시 확인</button><label>목표 <select data-cb="target" aria-label="시계 검증 목표"></select></label><button type="button" data-cb="excluded" aria-pressed="false">보류 0</button><button type="button" data-cb="export" disabled>JSON</button></div>'+
    '<div class="monthly-clock" data-cb="clock"></div><div class="monthly-status" data-cb="status" role="status" aria-live="polite"></div><div class="monthly-content"><div class="monthly-summary" data-cb="summary" role="region" tabindex="0" aria-label="고유 목표별 시계 성적"></div>'+
    '<div data-cb="coverage"></div><div class="clock-target-meta" data-cb="target-meta"></div><div class="monthly-ledger clock-ledger" role="region" tabindex="0" aria-label="시계 예측 원점별 날짜와 오차"><table><thead data-cb="head"></thead><tbody data-cb="rows"></tbody></table></div><div data-cb="current"></div>'+
    '<details class="monthly-method"><summary>계산·자료 기준</summary><p>기존 시계 규칙을 바꾸지 않고 첫 가격 관측부터 마지막 완료 분기까지 모든 UTC 분기말을 평가합니다. 미래 고점·저점이나 보정 가능 여부로 원점을 고르지 않습니다. 각 원점까지의 관측만으로 48개월 고점 시계와 현재 보정 일수를 계산합니다. 저점은 무보정 고점에서 12개월 뒤 날짜에 같은 보정 일수를 더합니다. 윤년에도 보정된 고점에 다시 12개월을 더하는 방식으로 바꾸지 않습니다.</p><p>관측 반감기 이전에는 시계 기준점을 만들지 않습니다. 종료된 참고 사이클이 없거나 지속 하락이 확인되지 않은 원점은 보정 근거 부족으로 표시하고 보정 날짜를 0일 보정으로 대체하지 않습니다. 무보정만 가능한 원점은 별도로 채점합니다. 실제 목표는 기존 규칙의 다음 반감기 구간이 관측으로 종료될 때 고정된 고점·저점입니다. 목표가 확정된 날짜도 표시하고, 미종료 구간은 채점하지 않습니다. 실제 목표는 오차 평가에만 사용하며 원점의 계산에는 넣지 않습니다.</p><p>반감기 이전 원점의 첫 구간 배정은 범위 누락을 보여주기 위한 사후 분류이며 당시 예측이 아닙니다. 같은 반감기 구간·고점/저점 종류는 목표 하나로 묶습니다. 각 목표의 서로 다른 원점에서 절대 오차를 평균한 다음 목표마다 같은 가중치를 줍니다. 고점과 저점이 같은 사이클이면 고유 사이클은 하나입니다. 원점 수와 목표 수를 독립 사이클 표본 수로 더하지 않습니다. 보정 효과는 보정 가능한 동일 원점의 무보정과 보정 오차만 비교합니다. 전체 무보정 평균과 보정 가능한 부분의 평균을 빼지 않습니다.</p><p>원점별 오차는 예측일 − 실제일입니다. 음수는 빠름, 양수는 늦음이며 MAE는 절댓값의 평균입니다. 오차 감소는 무보정 MAE − 보정 MAE로, 양수이면 오차가 작아졌습니다.</p><p>현재 규칙과 현재 보존 가격 판본의 회고 비교입니다. 당시 발행 예측·당시 자료 판본·일반적인 예측 우월성은 입증하지 않습니다. 가격 경로의 극값, 시나리오의 도달·체류 개월과 표시 기간의 적용 제한은 이 시계 규칙 평가에 섞지 않습니다. 기존 가격 계산과 차트는 바꾸지 않습니다.</p></details></div>';
  plot.append(panel);const q=name=>panel.querySelector('[data-cb="'+name+'"]');
  const calculator=computer??createForecastComputation({compute:buildCycleClockBacktest,workerFactory:workerFactory()});
  let revision=0,result=null,snapshot=null,busy=false,disposed=false,excluded=false,renderedCurrent='',renderedCoverage='';
  function paint(){
    q('export').disabled=busy||!result;q('run').disabled=busy;q('target').disabled=busy||!result?.historicalTargets.length||excluded;q('excluded').disabled=busy||!result?.excluded.length;
    panel.setAttribute('aria-busy',String(busy));q('summary').hidden=busy;
    setLoadingSurface(panel.querySelector('.clock-ledger'),busy,{kind:'table',label:'거시 시계 평가'});
    if(!result)return;
    q('summary').innerHTML=clockSummaryMarkup(result);q('excluded').textContent=(excluded?'원점 보기':'미채점 '+result.excluded.length);q('excluded').setAttribute('aria-pressed',String(excluded));
    const target=result.historicalTargets.find(t=>t.targetId===q('target').value)??result.historicalTargets.at(-2);
    q('target-meta').textContent=excluded?'미채점 '+result.excluded.length+'개 · 보정 근거 부족 '+result.coverageStats.insufficientOrigins+'개(미종료 포함)' :target?
      target.cycleYear+' 반감기 구간 · 실제 '+typeLabel(target.type)+' '+target.targetDate+' · 목표 고정 '+target.targetKnownAt+' · 검토 '+target.originCount+' · 무보정 '+target.baselineOriginCount+' · 쌍비교 '+target.pairedOriginCount+' · 전체 무보정 MAE '+number(target.baselineMaeDays)+'일':'채점 가능한 종료 목표가 없습니다.';
    q('head').innerHTML=excluded?'<tr><th>원점 · UTC</th><th colspan="6">미채점 사유</th></tr>':'<tr><th>원점 · UTC</th><th>당시 기준 고점</th><th>무보정 날짜</th><th>보정 날짜</th><th>무보정 오차</th><th>보정 오차</th><th>보정 일수</th></tr>';
    q('rows').innerHTML=excluded?clockExcludedRowsMarkup(result.excluded):target?clockOriginRowsMarkup(target,result.baselineRecords,result.records):'<tr><td colspan="7">검토 원점 없음</td></tr>';
    const coverageMarkup=clockHistoryMarkup(result);if(coverageMarkup!==renderedCoverage){q('coverage').innerHTML=coverageMarkup;renderedCoverage=coverageMarkup;}
    const currentMarkup=clockConditionalMarkup(result.currentClock);if(currentMarkup!==renderedCurrent){q('current').innerHTML=currentMarkup;renderedCurrent=currentMarkup;}
    panel.dataset.target=target?.targetId??'';panel.dataset.origins=String(result.scoredOriginCount);panel.dataset.cycles=String(result.uniqueCycleCount);
  }
  async function run(){
    if(disposed||busy)return;
    const token=++revision;busy=true;result=null;snapshot=null;excluded=false;renderedCurrent='';renderedCoverage='';panel.dataset.state='loading';q('status').textContent='관측·목표 확인 중';q('rows').innerHTML='';q('summary').innerHTML='';q('clock').textContent='';q('target').innerHTML='';q('current').innerHTML='';q('target-meta').textContent='';q('coverage').innerHTML='';paint();
    try{
      const input=structuredClone(await getDataset());if(disposed||token!==revision||panel.hidden)return;
      if(!Array.isArray(input?.prices)||!input.prices.length)throw new Error('관측 가격을 먼저 확인해 주세요.');
      const asOf=Array.isArray(input.prices.at(-1))?input.prices.at(-1)[0]:input.prices.at(-1).date;
      const inputHash=await forecastHash(input.prices);if(disposed||token!==revision||panel.hidden)return;
      const reply=await calculator.run(input,{asOf,inputHash},{revision:token});if(disposed||token!==revision||panel.hidden)return;
      if(reply.status!=='ready')throw new Error(reply.error??'시계 계산이 중단됐습니다.');
      const checked=assertCycleClockBacktest(reply.model,{asOf,inputHash});
      snapshot=input;result=checked;busy=false;panel.dataset.state='ready';
      const initialTarget=(result.targets.find(t=>t.type==='peak')??result.historicalTargets.at(-2))?.targetId;
      q('target').innerHTML=result.historicalTargets.map(t=>'<option '+(t.targetId===initialTarget?'selected ':'')+'value="'+t.targetId+'">'+t.cycleYear+' · '+typeLabel(t.type)+' '+t.targetDate+(t.pairedOriginCount?' · 쌍비교':t.baselineOriginCount?' · 무보정만':' · 기준점 없음')+'</option>').join('');
      q('clock').textContent=(input.meta?.sourceName??'관측 종가')+' · '+asOf+' UTC · '+result.firstObservation+'부터 '+result.requestedOriginCount+'개 분기말 · 회고 비교';
      q('status').textContent='보정 쌍비교 '+result.uniqueCycleCount+' 사이클 · '+result.scoredOriginCount+' / '+result.requestedOriginCount+' 원점 · 무보정만 '+result.coverageStats.baselineOnlyOrigins+' · 기준점 없음 '+result.coverageStats.unavailableOrigins+' · 미종료 '+result.coverageStats.pendingOrigins;paint();
    }catch(error){if(disposed||token!==revision||panel.hidden)return;busy=false;panel.dataset.state='error';q('status').textContent='확인 실패 · '+(error.message??String(error));paint();}
  }
  function close({focus=true}={}){revision++;calculator.cancel();busy=false;setLoadingSurface(panel.querySelector('.clock-ledger'),false);panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus({preventScroll:true});}
  async function open(){if(disposed)return;panel.hidden=false;trigger.setAttribute('aria-expanded','true');q('close').focus({preventScroll:true});await run();}
  q('close').onclick=()=>close();q('run').onclick=()=>void run();q('price-mode').onclick=()=>openPrice();q('target').onchange=paint;
  q('excluded').onclick=()=>{excluded=!excluded;paint();};
  q('export').onclick=()=>{
    if(!result||busy)return;
    const url=win.URL.createObjectURL(new Blob([JSON.stringify({...result,evaluationPrices:snapshot.prices,source:snapshot.meta??{}},null,2)],{type:'application/json'}));
    const a=doc.createElement('a');a.href=url;a.download='BTCUSD-clock-backtest-'+result.asOf+'.json';a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);
  };
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  const replayOpened=()=>{if(!panel.hidden)close({focus:false});};doc.addEventListener('atlas:chart-replay-open',replayOpened);
  return {open,close,isOpen:()=>!panel.hidden,destroy(){close({focus:false});disposed=true;calculator.destroy();doc.removeEventListener('atlas:chart-replay-open',replayOpened);panel.remove();}};
}
