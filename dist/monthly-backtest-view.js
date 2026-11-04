import {runMonthlyBacktests,summarizeMonthlyBacktests,monthlyReplayForecast,MONTHLY_HORIZONS} from './monthly-backtest.js';
import {createCutoffBacktestForecast} from './replay-cutoff-forecast.js';
import {createMonthlyBacktestStore} from './monthly-backtest-store.js';
import {loadMonthlyModelIdentity,browserMonthlyWorkerFactory} from './monthly-backtest-source.js';
import {loadChartReplayArchive} from './chart-replay-sources.js';
import {createForecastComputation} from './forecast-computation.js';
import {setLoadingSurface} from './loading-surfaces.js';
import {LONG_HORIZON_SCENARIOS} from './long-horizon-forecast.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=value=>Number.isFinite(value)?(value*100).toFixed(2)+'%':'—';
const usd=value=>Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:0}):'—';
const statusLabel={immature:'미성숙','awaiting-data':'자료 대기','missing-observations':'관측 누락'};
const metricLabel={mape:'구간 MAPE',endpoint:'종료일 오차',skill:'종가 유지 대비'};
function cellValue(e,metric){return pct(metric==='endpoint'?e.metrics.endpointAbsolutePercentageError:metric==='skill'?e.metrics.skillVersusFlat:e.metrics.meanAbsolutePercentageError);}

export function monthlySummaryMarkup(rows,{commonOrigins=false}={}){
  return '<table class="monthly-summary-table"><caption>완료 구간 · 기준일별 동일 가중</caption><thead><tr><th>기간</th><th>완료 기준일</th><th>구간 MAPE</th><th>MAE</th><th>종료일 오차</th><th>종가 유지 대비</th><th>종료 방향</th></tr></thead><tbody>'+summarizeMonthlyBacktests(rows,{commonOrigins}).map(s=>'<tr><th>'+s.horizonDays+'일</th><td>'+s.originCount+' / '+s.totalOrigins+'</td><td>'+pct(s.meanAbsolutePercentageError)+'</td><td>'+usd(s.meanAbsoluteError)+'</td><td>'+pct(s.endpointAbsolutePercentageError)+'</td><td>'+pct(s.skillVersusFlat)+'</td><td>'+s.endpointDirectionCorrectCount+' / '+s.originCount+'</td></tr>').join('')+'</tbody></table>';
}
export function monthlyRowsMarkup(rows,{metric='mape',disabled=false}={}){
  return rows.slice().reverse().map(r=>'<tr data-monthly-origin="'+r.asOf+'"><th scope="row"><time>'+r.asOf+'</time><small>'+ (r.status==='error'?'고정 실패':'고정 · '+r.outputHash.slice(0,8))+'</small></th>'+MONTHLY_HORIZONS.map(h=>{
    const e=r.evaluations.find(e=>e.horizonDays===h);
    if(!e)return '<td><span class="monthly-error" title="'+esc(r.error??'계산 중')+'">'+(r.status==='error'?'계산 실패':'계산 대기')+'</span></td>';
    const text=e.status==='complete'?cellValue(e,metric):statusLabel[e.status];
    return '<td><button type="button" '+(disabled?'disabled ':'')+'data-monthly-replay="'+r.asOf+'" data-horizon="'+h+'" aria-label="'+r.asOf+' 기준 '+h+'일 봉 리플레이 · '+esc(text)+'"><strong>'+esc(text)+'</strong><small>'+e.observedDays+' / '+h+'일 · '+e.targetDate+'</small></button></td>';
  }).join('')+'</tr>').join('');
}

export function mountMonthlyBacktest({plot,trigger,getOptions=()=>({}),openReplay,openClock=null,ownTrigger=true,loadArchive=loadChartReplayArchive,loadIdentity=loadMonthlyModelIdentity,storeFactory=createMonthlyBacktestStore,computer=null}={}){
  const doc=plot.ownerDocument,win=doc.defaultView;
  const panel=doc.createElement('section');panel.className='monthly-backtest';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','월말 백테스트');
  panel.innerHTML='<header class="monthly-heading"><h2>월말 백테스트</h2><span>BTCUSD</span>'+(openClock?'<div class="backtest-view-tabs" role="group" aria-label="백테스트 종류"><button type="button" aria-pressed="true">월말 가격</button><button type="button" data-mb="clock-mode" aria-pressed="false">거시 시계</button></div>':'')+'<button type="button" data-mb="close" aria-label="월말 백테스트 닫기">×</button></header>'+
    '<div class="monthly-toolbar"><button type="button" data-mb="run">다시 확인</button><button type="button" data-mb="stop" hidden>중단</button><label>표시 <select data-mb="metric"><option value="mape">구간 MAPE</option><option value="endpoint">종료일 오차</option><option value="skill">종가 유지 대비</option></select></label><label><input type="checkbox" data-mb="common"> 네 기간 공통 기준일</label><button type="button" data-mb="export" disabled>JSON</button></div>'+
    '<div class="monthly-clock" data-mb="clock"></div><div class="monthly-status" data-mb="status" role="status" aria-live="polite"></div>'+
    '<div class="monthly-content"><div class="monthly-summary" data-mb="summary" tabindex="0" role="region" aria-label="기간별 완료 성적"></div><div class="monthly-ledger" tabindex="0" role="region" aria-label="월말별 고정 예측 성적"><table><caption data-mb="caption">월말 기준 · 구간 MAPE · 셀 선택으로 봉 리플레이</caption><thead><tr><th>입력 마감 · UTC</th>'+MONTHLY_HORIZONS.map(h=>'<th>'+h+'일</th>').join('')+'</tr></thead><tbody data-mb="rows"></tbody></table></div>'+
    '<details class="monthly-method"><summary>계산·자료 기준</summary><p>각 완료 월말까지의 Bitstamp BTC/USD 종가와 발표일이 확인된 자료만 입력합니다. 기존 기준시점 모형의 365일 경로를 한 번 고정하고 같은 경로를 30·90·180·365일로 나눕니다. 그 이후 실제 가격은 예측 입력에 사용하지 않습니다.</p><p>현재 코드와 보존된 가격 판본으로 만든 과거 재구성입니다. 당시 발행 예측·당시 자료 판본은 입증하지 않습니다. 검증 가능한 첫 월말 이전은 계산하지 않습니다. 고정본은 이 브라우저에 보존하며, 입력·설정·계산 소스가 같으면 재계산하지 않습니다.</p><p>구간 MAPE·MAE는 기준일 다음 날부터 종료일까지의 일별 오차입니다. 종료일 오차는 해당 날짜 한 점의 절대 백분율 오차입니다. 종가 유지 대비는 1 − 평균 절대 로그오차 ÷ 종가 유지의 평균 절대 로그오차이며, 양수일 때 오차가 작습니다. 종료 방향은 기준 종가 대비 상승·하락·보합의 일치 수이며 매매 승률이 아닙니다.</p><p>완료된 모든 일별 관측이 있는 구간만 요약하며 기준일마다 같은 가중치를 줍니다. 공통 기준일을 켜면 네 기간 모두 완료된 기준일만 비교합니다. 미래·자료 지연·중간 누락을 보간하지 않습니다. 겹치는 평가 기간과 같은 사이클의 반복 기준일은 독립 예측 표본이 아닙니다. 경로 음영은 확률구간이 아닙니다.</p></details></div>';
  plot.append(panel);
  const q=name=>panel.querySelector('[data-mb="'+name+'"]');
  const ownComputer=computer??createForecastComputation({compute:createCutoffBacktestForecast,workerFactory:browserMonthlyWorkerFactory(),timeoutMs:60000});
  let request=null,revision=0,result=null,rows=[],archive=null,identity=null,busy=false,linking=false,disposed=false,priorFocus=null,store=null;
  function paint(){
    q('summary').innerHTML=monthlySummaryMarkup(rows,{commonOrigins:q('common').checked});
    q('summary').hidden=busy;
    q('rows').innerHTML=monthlyRowsMarkup(rows,{metric:q('metric').value,disabled:busy});
    setLoadingSurface(panel.querySelector('.monthly-ledger'),busy&&rows.length===0,{kind:'table',label:'월말 고정 경로 계산'});
    q('caption').textContent='월말 기준 · '+metricLabel[q('metric').value]+' · 셀 선택으로 봉 리플레이';
    q('export').disabled=!result||busy;q('run').disabled=busy;q('stop').hidden=!busy;panel.setAttribute('aria-busy',String(busy));
    panel.dataset.state=busy?'loading':result?(rows.some(r=>r.status==='error')?'partial':'ready'):panel.dataset.state??'idle';
    panel.dataset.completed=String(rows.length);panel.dataset.origins=String(result?.origins.length??rows.length);
  }
  function stop(){revision++;request?.abort();request=null;ownComputer.cancel();busy=false;if(!panel.hidden){panel.dataset.state='cancelled';q('status').textContent='중단 · 수락된 고정본은 유지됩니다.';paint();}}
  function close({focus=true}={}){stop();panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)(priorFocus?.isConnected?priorFocus:trigger).focus({preventScroll:true});}
  async function run(){
    if(busy||disposed)return;
    request=new AbortController();const {signal}=request,token=++revision,options=structuredClone(getOptions());
    busy=true;result=null;rows=[];panel.dataset.state='loading';q('status').textContent='자료·고정본 확인 중';paint();
    try{
      store??=storeFactory(win.indexedDB);
      const [loadedArchive,loadedIdentity]=await Promise.all([loadArchive('BTCUSD',{mode:'historical-reconstruction',signal}),loadIdentity({signal})]);
      signal.throwIfAborted();if(token!==revision||disposed)return;
      archive=loadedArchive;identity=loadedIdentity;
      const assumption=LONG_HORIZON_SCENARIOS.find(s=>s.id===(options.scenario??'base'))?.label??options.scenario;
      q('clock').textContent='Bitstamp · 실제 '+archive.observedThrough+' UTC · '+assumption+' 가정 · 현재 모형 재구성';
      const next=await runMonthlyBacktests({archive,modelIdentity:identity,modelOptions:options,store,signal,evaluatedAt:new Date().toISOString(),
        computeForecast:async parameters=>{
          signal.throwIfAborted();const reply=await ownComputer.run(parameters,{}, {revision:token});signal.throwIfAborted();
          if(reply.status!=='ready'||token!==revision)throw new Error(reply.error??'월말 경로 계산이 중단됐습니다.');return reply.model;
        },onProgress:progress=>{
          if(token!==revision||disposed||panel.hidden)return;rows=progress.rows;q('status').textContent=progress.completed+' / '+progress.total+' 기준일 · 새 고정 '+progress.createdCount+' · 복원 '+progress.restoredCount;paint();
        }});
      signal.throwIfAborted();if(token!==revision||disposed)return;
      result=next;rows=next.rows;busy=false;panel.dataset.state='ready';q('status').textContent=rows.length?rows.length+'개 기준일 · 새 고정 '+next.createdCount+' · 복원 '+next.restoredCount+' · 실패 '+rows.filter(r=>r.status==='error').length:'검증할 완료 월말이 없습니다.';paint();
    }catch(error){if(token!==revision||signal.aborted||disposed)return;busy=false;panel.dataset.state='error';q('status').textContent='확인 실패 · '+(error.message??String(error));paint();}
  }
  async function open(){if(disposed)return;priorFocus=doc.activeElement;panel.hidden=false;trigger.setAttribute('aria-expanded','true');q('close').focus({preventScroll:true});await run();}
  if(ownTrigger)trigger.onclick=()=>{if(panel.hidden)void open();else close();};q('close').onclick=()=>close();q('run').onclick=()=>void run();q('stop').onclick=stop;
  if(openClock)q('clock-mode').onclick=()=>openClock();
  const replayOpened=()=>{if(!panel.hidden)close({focus:false});};
  doc.addEventListener('atlas:chart-replay-open',replayOpened);
  q('common').onchange=q('metric').onchange=paint;
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('[data-monthly-replay]');if(!button||busy||linking)return;
    const row=rows.find(r=>r.asOf===button.dataset.monthlyReplay);if(!row?.record)return;
    linking=true;
    try{const record=await monthlyReplayForecast(row.record,Number(button.dataset.horizon));if(panel.hidden||disposed)return;close({focus:false});await openReplay(record);}
    catch(error){if(!panel.hidden)q('status').textContent='리플레이 연결 실패 · '+(error.message??String(error));}
    finally{linking=false;}
  });
  q('export').onclick=()=>{
    if(!result||busy)return;
    const payload={...result,summary:summarizeMonthlyBacktests(rows),commonOriginSummary:summarizeMonthlyBacktests(rows,{commonOrigins:true}),evaluationPrices:archive.observations.map(r=>[r.date,r.price])};
    const url=win.URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=doc.createElement('a');a.href=url;a.download='BTCUSD-monthly-backtest-'+archive.observedThrough+'.json';a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);
  };
  return {open,close,isOpen:()=>!panel.hidden,destroy(){close({focus:false});disposed=true;ownComputer.destroy();doc.removeEventListener('atlas:chart-replay-open',replayOpened);panel.remove();if(ownTrigger)trigger.onclick=null;}};
}
