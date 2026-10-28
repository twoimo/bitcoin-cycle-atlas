import {drawAtlasPriceChart} from './atlas-price-chart.js?v=1.29.0';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const price=value=>Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:2}):'미공개';
const decimal=value=>Number.isFinite(value)?value.toFixed(4):'미평가';
const percent=value=>Number.isFinite(value)?(value*100).toFixed(2)+'%':'미평가';
const day=value=>Date.parse(value+'T00:00:00Z')/86400000;
const fromDay=value=>new Date(value*86400000).toISOString().slice(0,10);
const stamp=value=>value?value.replace('T',' ').replace('Z',' UTC'):'미상';
const speeds=new Set([1,2,4]);
let nextChartId=0;

export function createReplayController({length,onChange=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,intervalMs=700}={}){
  if(!Number.isSafeInteger(length)||length<1||typeof onChange!=='function'||!Number.isFinite(intervalMs)||intervalMs<=0)throw new TypeError('A nonempty replay timeline and positive interval are required');
  let state={cursorIndex:0,status:length===1?'ended':'paused',speed:1},timer=null,epoch=0,destroyed=false;
  const snapshot=()=>Object.freeze({...state});
  const notify=()=>{if(!destroyed)onChange(snapshot());};
  function cancel(){epoch++;if(timer!==null){clearTimer(timer);timer=null;}}
  function schedule(){
    const owned=epoch;
    timer=setTimer(()=>{
      if(destroyed||owned!==epoch||state.status!=='playing')return;
      timer=null;
      const cursorIndex=Math.min(length-1,state.cursorIndex+1);
      state={...state,cursorIndex,status:cursorIndex===length-1?'ended':'playing'};
      notify();
      if(!destroyed&&owned===epoch&&state.status==='playing')schedule();
    },intervalMs/state.speed);
  }
  function pause(){
    if(destroyed)return;
    cancel();state={...state,status:state.cursorIndex===length-1?'ended':'paused'};notify();
  }
  function seek(index){
    if(destroyed)return;
    if(!Number.isSafeInteger(index))throw new TypeError('Replay position must be an integer');
    cancel();const cursorIndex=Math.max(0,Math.min(length-1,index));
    state={...state,cursorIndex,status:cursorIndex===length-1?'ended':'paused'};notify();
  }
  function play(){
    if(destroyed||length===1||state.status==='playing')return;
    cancel();state={...state,cursorIndex:state.cursorIndex===length-1?0:state.cursorIndex,status:'playing'};
    notify();if(!destroyed&&state.status==='playing')schedule();
  }
  function speed(value){
    if(!speeds.has(value))throw new RangeError('Replay speed must be 1, 2, or 4');
    if(destroyed)return;
    cancel();state={...state,speed:value};notify();
    if(!destroyed&&state.status==='playing')schedule();
  }
  return {getState:snapshot,play,pause,seek,speed,step:direction=>{
    if(direction!==-1&&direction!==1)throw new RangeError('Replay step must be one bar');
    seek(state.cursorIndex+direction);
  },destroy(){if(destroyed)return;cancel();destroyed=true;state={...state,status:'paused'};}};
}

function svgElement(name,attributes){
  const element=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value]of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
}
function table(headers,rows){
  return '<div class="journal-table-scroll" tabindex="0" role="region" aria-label="리플레이 목표 상태 표"><table><thead><tr>'+headers.map(label=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function downloadFrame(frame,session){
  const payload={kind:'atlas-visible-replay-frame',schemaVersion:1,identity:session.identity,mode:session.mode,frame};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='atlas-replay-'+session.identity.symbol+'-'+frame.cursorDate+'.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function drawFrame(svg,session,frame,{display='line',onInspect=()=>{}}={}){
  svg.onpointermove?.cancel?.();
  if(frame.priceDomain===null){
    svg.onpointermove=null;svg.onpointerleave=null;svg.onclick=()=>svg.focus({preventScroll:true});
    for(const key of Object.keys(svg.dataset))if(key!=='replayChart')delete svg.dataset[key];
    const width=Math.max(1,svg.clientWidth||svg.parentElement?.clientWidth||800),height=Math.max(1,svg.clientHeight||250);
    svg.setAttribute('viewBox','0 0 '+width+' '+height);
    const title=svgElement('title',{});title.textContent='입력 자료 수집 이전';
    const description=svgElement('desc',{});description.textContent='이 시각에 확보하지 않은 입력 가격과 예측은 표시하지 않습니다. 다음 봉으로 이동해 자료가 공개되는 시각을 확인하세요.';
    const message=svgElement('text',{x:width/2,y:height/2-8,'text-anchor':'middle',fill:'currentColor','font-size':13});message.textContent='아직 확보하지 않은 입력 자료입니다';
    const hint=svgElement('text',{x:width/2,y:height/2+16,'text-anchor':'middle',fill:'currentColor','font-size':12});hint.textContent='다음 봉에서 공개 시각을 확인하세요';
    svg.replaceChildren(title,description,message,hint);
    Object.assign(svg.dataset,{replayPriceHidden:'true',replayActualCount:'0',replayActualThrough:'',replayForecastPoints:'0',replayCursor:frame.cursorDate,replayScale:'none',replayInputVisible:'false'});
    return;
  }
  delete svg.dataset.replayPriceHidden;
  svg.dataset.replayInputVisible=String(frame.inputVisible!==false);
  const rows=frame.inputPrices,start=rows[0]?.date??session.asOf,end=session.endDate;
  const chart=drawAtlasPriceChart({svg,rows,start,end,split:null,scale:frame.scale,priceDomain:frame.priceDomain,
    band:false,selectedDate:frame.cursorDate,showDrawdown:false,showTurns:false,showCycleMarkers:false,showHistoricalEvents:false,headerInset:16,dateTickMinSpacing:64,
    onHover:value=>{if(value?.date)onInspect(value.date);}});
  if(!chart)return;
  const axis=chart.getPriceScale(),span=Math.max(1,day(end)-day(start));
  const x=date=>axis.left+(day(date)-day(start))/span*(axis.right-axis.left);
  const overlay=svgElement('g',{'clip-path':'url(#'+svg.id+'-price-clip)','data-replay-overlay':'true','pointer-events':'none'});
  const origin=svgElement('line',{x1:x(session.asOf),x2:x(session.asOf),y1:axis.top,y2:axis.bottom,class:'replay-origin-line','data-replay-origin-boundary':'true'});
  const originTitle=svgElement('title',{});originTitle.textContent='고정 예측 기준일 '+session.asOf;origin.append(originTitle);overlay.append(origin);
  const path=(values,key='price')=>{
    let prior=null;
    return values.filter(row=>Number.isFinite(row[key])).map(row=>{
      const command=prior!==null&&day(row.date)-day(prior)===1?'L':'M';prior=row.date;
      return command+x(row.date).toFixed(2)+','+axis.y(row[key]).toFixed(2);
    }).join(' ');
  };
  const future=frame.forecast;
  const band=future.filter(row=>Number.isFinite(row.lower)&&Number.isFinite(row.upper));
  if(band.length>1){
    const upper=band.map(row=>x(row.date).toFixed(2)+','+axis.y(row.upper).toFixed(2));
    const lower=[...band].reverse().map(row=>x(row.date).toFixed(2)+','+axis.y(row.lower).toFixed(2));
    overlay.append(svgElement('path',{d:'M'+upper.join(' L')+' L'+lower.join(' L')+' Z',class:'replay-band'}));
  }
  if(future.length)overlay.append(svgElement('path',{d:path(future),class:'replay-forecast-path','data-replay-forecast-path':'true'}));
  const actual=frame.actual.filter(row=>row.date>=session.asOf);
  if(actual.length){
    if(display==='candles'&&actual.every(row=>['open','high','low','close'].every(key=>Number.isFinite(row[key])))){
      const width=Math.max(1,Math.min(9,(axis.right-axis.left)/span*.65));
      const candles=svgElement('g',{'data-replay-actual-candles':'true'});
      for(const row of actual){
        const color=row.close>=row.open?'replay-candle-up':'replay-candle-down',at=x(row.date);
        candles.append(svgElement('line',{x1:at,x2:at,y1:axis.y(row.high),y2:axis.y(row.low),class:color}));
        const top=Math.min(axis.y(row.open),axis.y(row.close)),height=Math.max(1,Math.abs(axis.y(row.open)-axis.y(row.close)));
        const candle=svgElement('rect',{x:at-width/2,y:top,width,height,class:color,'data-replay-candle-date':row.date});
        const title=svgElement('title',{});title.textContent=row.date+' 실제 시가 '+price(row.open)+' · 고가 '+price(row.high)+' · 저가 '+price(row.low)+' · 종가 '+price(row.close);candle.append(title);candles.append(candle);
      }
      overlay.append(candles);
    }else overlay.append(svgElement('path',{d:path(actual),class:'replay-actual-path','data-replay-actual-path':'true'}));
    const last=actual.at(-1);overlay.append(svgElement('circle',{cx:x(last.date),cy:axis.y(last.price),r:3,class:'replay-actual-dot'}));
  }
  overlay.append(svgElement('line',{x1:x(frame.cursorDate),x2:x(frame.cursorDate),y1:axis.top,y2:axis.bottom,class:'replay-cursor-line','data-replay-cursor-line':'true'}));
  svg.append(overlay);
  svg.dataset.replayActualCount=String(actual.length);
  svg.dataset.replayActualThrough=actual.at(-1)?.date??'';
  svg.dataset.replayForecastPoints=String(future.length);
  svg.dataset.replayCursor=frame.cursorDate;
  svg.dataset.replayScale=frame.scale;
  const title=svg.querySelector('title');if(title)title.textContent=session.identity.symbol+' · 고정 예측과 현재 재생 시점까지 공개된 실제 가격';
  const description=svg.querySelector('desc');if(description)description.textContent='흰색은 예측 기준일까지의 입력 관측, 금색은 고정 예측, 파란색 또는 캔들은 현재 재생 위치까지 공개한 실제값입니다. 좌우 방향키로 한 봉씩 이동하고 스페이스로 재생하거나 정지합니다.';
  svg.querySelector('[id$="-cross"]')?.setAttribute('display','none');
  svg.onpointermove?.cancel?.();
  svg.onpointermove=event=>{
    if(event.pointerType==='touch')return;
    const rect=svg.getBoundingClientRect();if(!rect.width)return;
    const width=svg.viewBox.baseVal.width||svg.clientWidth,at=(event.clientX-rect.left)/rect.width*width;
    if(at<axis.left||at>axis.right)return;
    onInspect(fromDay(Math.round(day(start)+(at-axis.left)/(axis.right-axis.left)*span)));
  };
  svg.onpointerleave=()=>onInspect(frame.cursorDate);
  svg.onclick=()=>svg.focus({preventScroll:true});
}

export function mountForecastReplay(host,{record,snapshot,symbol=record?.symbol??'BTCUSD',isActive=()=>host.isConnected}={}){
  if(!host||!record||!snapshot)throw new TypeError('A replay host and preserved record pair are required');
  const supportsHistory=['BTCUSD','ETHUSD'].includes(symbol),chartId='forecast-replay-chart-'+(++nextChartId);
  host.innerHTML='<section class="forecast-replay" data-forecast-replay data-state="loading" aria-label="고정 예측 리플레이" aria-live="off">'+
    '<div class="replay-settings"><label>기록 방식 <select data-replay-mode><option value="recorded">보존 발행본</option>'+(supportsHistory?'<option value="historical-reconstruction">과거 재구성</option>':'')+'</select></label>'+
    '<label data-replay-origin-field hidden>예측 기준일 <input type="date" data-replay-origin></label>'+
    (symbol==='ETHUSD'?'<label data-replay-model-field hidden>가격 모형 <select data-replay-model><option value="pooled">통합 변동성</option><option value="adaptive">국면 적응</option></select></label>':'')+
    '<label>재생 기간 <select data-replay-horizon><option value="30">30일</option><option value="90">90일</option><option value="180" selected>180일</option><option value="365">1년</option></select></label>'+
    '<label>관측 공개 기준 <select data-replay-clock><option value="observed-date">현재 판본 · 시장 날짜</option><option value="information-time">기록된 수집 시각</option></select></label></div>'+
    '<p class="journal-note replay-disclosure" data-replay-disclosure></p><p class="journal-note" data-replay-source></p>'+
    '<p role="status" data-replay-loading>보존본과 관측 자료를 확인하고 있습니다.</p><div data-replay-error hidden role="alert"></div>'+
    '<div data-replay-content hidden><div class="replay-toolbar" role="group" aria-label="재생 제어">'+
    '<button type="button" data-replay-reset aria-label="리플레이 처음으로">처음</button><button type="button" data-replay-previous aria-label="이전 봉">이전</button>'+
    '<button type="button" data-replay-play aria-label="리플레이 재생" aria-pressed="false">재생</button><button type="button" data-replay-next aria-label="다음 봉">다음</button>'+
    '<label class="replay-speed">속도 <select data-replay-speed aria-label="재생 속도"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>'+
    '<label>실제 가격 <select data-replay-display aria-label="실제 가격 표시"><option value="line">종가선</option><option value="candles">캔들</option></select></label></div>'+
    '<div class="replay-clock"><output data-replay-cursor></output><span data-replay-progress></span><span data-replay-state></span></div><p class="journal-note" data-replay-clock-detail></p>'+
    '<div class="journal-chart replay-chart"><svg id="'+chartId+'" data-replay-chart tabindex="0" role="group" aria-label="예측 리플레이 차트. 좌우 방향키로 한 봉, Home과 End로 처음과 끝, 스페이스로 재생합니다."></svg></div>'+
    '<div class="replay-legend"><span class="replay-legend-input">기준일까지 관측</span><span class="replay-legend-forecast">고정한 경로</span><span class="replay-legend-actual">공개된 실제값</span></div>'+
    '<label class="replay-scrubber">재생 위치 <input type="range" data-replay-scrub min="0" step="1" value="0" aria-label="리플레이 봉 위치"></label>'+
    '<label class="replay-date-field">날짜 이동 <input type="date" data-replay-date></label><p class="journal-selection" data-replay-selection aria-live="off"></p>'+
    '<div class="replay-metrics" data-replay-metrics></div><p class="journal-note" data-replay-metric-note></p>'+ 
    '<h3>목표별 상태</h3><div data-replay-targets></div><p class="journal-note" data-replay-empty></p>'+
    '<div class="journal-controls"><button type="button" data-replay-export>현재 화면 JSON</button></div>'+
    '<details class="journal-details"><summary>고정 경로와 재생 근거</summary><dl data-replay-provenance></dl><p>재생·역행·속도 변경은 저장 경로를 다시 계산하지 않습니다. 화면 내보내기는 현재 시점까지 공개된 실제값만 담습니다. 경로 음영은 원본의 조건 범위 또는 보정하지 않은 모형 구간이며, 미래 포함확률을 검증한 결과가 아닙니다.</p></details></div></section>';
  const panel=host.querySelector('[data-forecast-replay]'),query=selector=>panel.querySelector(selector),mode=query('[data-replay-mode]'),origin=query('[data-replay-origin]'),horizon=query('[data-replay-horizon]'),clock=query('[data-replay-clock]'),model=query('[data-replay-model]');
  const svg=query('svg'),content=query('[data-replay-content]'),loading=query('[data-replay-loading]'),error=query('[data-replay-error]');
  let epoch=0,destroyed=false,request=null,session=null,archive=null,engine=null,controller=null,frame=null,observer=null;
  const active=()=>!destroyed&&host.isConnected&&isActive();
  function stop(){controller?.destroy();controller=null;observer?.disconnect();observer=null;}
  function cancel(){epoch++;request?.abort();request=null;stop();}
  function inspect(date){
    if(!frame)return;
    const predicted=frame.forecast.find(row=>row.date===date)?.price;
    const actual=frame.actual.find(row=>row.date===date)?.price;
    const input=frame.inputPrices.find(row=>row.date===date)?.price;
    query('[data-replay-selection]').textContent=date+' · '+(date<=session.asOf?'기준 관측 '+price(input):'고정 예측 '+price(predicted)+' · 공개 실제 '+price(actual));
  }
  function paint(state){
    if(!active()||!session)return;
    frame=engine.buildReplayFrame(session,{cursorIndex:state.cursorIndex,clockMode:clock.value});
    panel.dataset.playback=state.status;panel.dataset.cursor=frame.cursorDate;panel.dataset.outputHash=session.identity.outputHash;
    const play=query('[data-replay-play]');play.textContent=state.status==='playing'?'일시정지':state.status==='ended'?'다시 재생':'재생';play.setAttribute('aria-label',state.status==='playing'?'리플레이 일시정지':'리플레이 재생');play.setAttribute('aria-pressed',String(state.status==='playing'));
    play.disabled=session.timeline.length<2;query('[data-replay-previous]').disabled=state.cursorIndex===0;query('[data-replay-reset]').disabled=state.cursorIndex===0;query('[data-replay-next]').disabled=state.cursorIndex===session.timeline.length-1;
    query('[data-replay-cursor]').textContent=frame.cursorDate;query('[data-replay-progress]').textContent=state.cursorIndex+' / '+(session.timeline.length-1)+'봉';query('[data-replay-state]').textContent=({playing:'재생 중',paused:'정지',ended:'재생 끝'})[state.status];
    query('[data-replay-clock-detail]').textContent=clock.value==='information-time'?'정보 확인 시각 '+stamp(frame.evaluationAt??frame.cursorAt)+' · 이 시각 뒤의 수집본은 공개하지 않습니다.':'';
    const scrub=query('[data-replay-scrub]');scrub.max=String(session.timeline.length-1);scrub.value=String(state.cursorIndex);scrub.setAttribute('aria-valuetext',frame.cursorDate);
    const date=query('[data-replay-date]');date.min=session.timeline[0];date.max=session.timeline.at(-1);date.value=frame.cursorDate;
    drawFrame(svg,session,frame,{display:query('[data-replay-display]').value,onInspect:inspect});inspect(frame.cursorDate);
    svg.onkeydown=event=>{
      if(!['ArrowLeft','ArrowRight','Home','End',' '].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      if(event.key===' ')toggle();else if(event.key==='Home')controller.seek(0);else if(event.key==='End')controller.seek(session.timeline.length-1);else controller.step(event.key==='ArrowLeft'?-1:1);
    };
    const m=frame.metrics;
    query('[data-replay-metrics]').innerHTML=[['비교 일봉',String(m.matchedCount)+'개'],['평균 절대 % 오차',percent(m.meanAbsolutePercentageError)],['평균 로그 오차',decimal(m.meanAbsoluteLogError)],['가격 유지 로그 오차',decimal(m.flatMeanAbsoluteLogError)],['유지 대비 개선',percent(m.skillVersusFlat)],['방향 일치',percent(m.directionAccuracy)]].map(([label,value])=>'<div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');
    query('[data-replay-metric-note]').textContent=(session.identity.pointLabel??'고정한 경로')+'의 오차입니다. 같은 날짜의 공개된 실제값만 비교합니다. 일봉 '+m.matchedCount+'개는 한 고정 경로 안에서 겹치는 결과이며 독립 예측 '+m.matchedCount+'회를 뜻하지 않습니다. 로그 오차는 작을수록 좋고, 유지 대비 개선은 양수일 때 유리합니다. '+(session.mode==='historical-reconstruction'||clock.value==='observed-date'?'이 화면의 비교는 과거 재구성이며 전향 성과에 합산하지 않습니다.':'수집시각을 통과한 관측으로만 목표 상태를 계산합니다.');
    const labels={pending:'미도래 · 대기',scored:'관측 확인 · 채점',retrospective:'회고 비교', 'missing-observation':'관측 미확보','before-issuance':'발행 이전 · 제외','not-issued':'발행 이전 · 제외'};
    query('[data-replay-targets]').innerHTML=table(['기간','목표일','고정 예측','공개 실제','로그 오차','상태'],frame.targets.map(row=>[row.horizonDays+'일',row.targetDate,price(row.predicted),price(row.actual),decimal(row.absoluteLogError),labels[row.status]??row.status]));
    query('[data-replay-empty]').textContent=(m.matchedCount===0?'현재 재생 위치에는 발행 이후 비교 가능한 실제값이 없습니다. ':'')+'목표 채점 '+m.scoredTargetCount+' · 회고 '+m.retrospectiveTargetCount+' · 대기 '+m.pendingTargetCount+' · 관측 미확보 '+m.missingTargetCount+'.';
  }
  function toggle(){if(controller?.getState().status==='playing')controller.pause();else controller?.play();}
  function settings(){
    const history=mode.value==='historical-reconstruction';query('[data-replay-origin-field]').hidden=!history;if(model)query('[data-replay-model-field]').hidden=!history;
    const sourceClock=archive?.observedAt;
    const modelLabel=history?(session?.historicalModel?.label??(symbol==='BTCUSD'?'가격만 사용한 축소 추세 기준모형':'가격 모형 중앙 경로')):'';
    query('[data-replay-disclosure]').textContent=history?
      modelLabel+'의 과거 재구성입니다. '+(symbol==='BTCUSD'?'실서비스의 장기 BTC 예측과 별개인 비교 기준모형입니다. ':'금색은 시뮬레이션의 중앙 경로입니다. ')+
      '선택한 기준일까지의 관측으로 한 번 계산한 뒤 고정합니다. '+(symbol==='ETHUSD'?'음영은 보정하지 않은 시뮬레이션 10–90% 분위수입니다. ':'')+'당시 실제 발행본·실전 성과·보정된 예측확률을 뜻하지 않습니다.':
      '금색은 '+(session?.identity.pointLabel??'실제 보존본의 고정 경로')+'입니다. 음영은 저장한 조건별 범위이며 예측확률 구간이 아닙니다. 시장 날짜 모드는 현재 확보한 판본으로 실제 가격을 한 봉씩 공개하므로, 당시 그 자료를 알았다는 증거는 아닙니다.';
    query('[data-replay-source]').textContent=archive?'실제값 자료 종료 '+archive.observedThrough+' · 판본의 수집 기록 '+stamp(sourceClock)+'. '+(clock.value==='information-time'?'선택한 재생 시각까지 수집된 관측만 공개합니다.':'관측 날짜만 순서대로 재생하며 판본의 수집시각을 소급하지 않습니다.'):'원본 관측과 수집 기록을 읽고 있습니다.';
  }
  async function load(){
    cancel();const token=epoch;request=new AbortController();const current=request;
    content.hidden=true;loading.hidden=false;error.hidden=true;panel.dataset.state='loading';settings();
    let rejectStop;
    const stopped=new Promise((_,reject)=>{rejectStop=reject;});
    const aborted=()=>rejectStop(current.signal.reason??new Error('리플레이 요청이 취소됐습니다.'));
    current.signal.addEventListener('abort',aborted,{once:true});
    const timer=setTimeout(()=>current.abort(new Error('관측 자료 확인 시간이 초과되었습니다. 다시 시도해 주세요.')),20000);
    const owned=()=>active()&&token===epoch&&request===current&&!current.signal.aborted;
    try{
      const [api,sources]=await Promise.race([Promise.all([import('./forecast-replay.js?v=1.29.0'),import('./forecast-replay-sources.js?v=1.29.0')]),stopped]);
      if(!owned())return;engine=api;
      if(!archive){
        const loaded=await Promise.race([sources.loadReplayPriceArchive(symbol,{signal:current.signal}),stopped]);
        if(!owned())return;archive=loaded;
      }
      if(!owned())return;
      if(!origin.value){
        const desired=fromDay(day(archive.observedThrough)-180);
        origin.value=archive.observations.filter(row=>row.date<=desired).at(-1)?.date??archive.observations[0]?.date??record.asOf;
        origin.min=archive.observations[0]?.date??origin.value;origin.max=archive.observedThrough;
      }
      const parameters={observations:archive.observations,observedAt:archive.observedAt,observedThrough:archive.observedThrough,source:archive.source,horizonDays:Number(horizon.value)};
      const creation=mode.value==='historical-reconstruction'?api.createHistoricalReplaySession({...parameters,symbol,asOf:origin.value,modelKey:model?.value,generatedAt:new Date().toISOString()}):api.createRecordedReplaySession({...parameters,record,snapshot});
      const next=await Promise.race([creation,stopped]);
      if(!owned())return;session=next;settings();
      const strict=clock.querySelector('[value="information-time"]');strict.disabled=!session.observationProvenance.informationTimeAvailable||session.mode==='historical-reconstruction';if(strict.disabled)clock.value='observed-date';settings();
      const hasCandles=archive.observations.some(row=>['open','high','low','close'].every(key=>Number.isFinite(row[key])));
      query('[data-replay-display] [value="candles"]').disabled=!hasCandles;if(!hasCandles)query('[data-replay-display]').value='line';
      const identity=session.identity;
      query('[data-replay-provenance]').innerHTML=[['재생 방식',session.mode==='recorded'?'보존한 경로':session.historicalModel?.label??'현재 모형 과거 재구성'],['종목',symbol==='BTCUSD'?'비트코인 · BTCUSD':symbol],['경로 의미',identity.pointLabel??session.historicalModel?.pointMeaning],['고정 기준일',session.asOf],['발행·생성 시각',stamp(identity.issuedAt??identity.createdAt)],['입력 공개 경계',stamp(identity.inputAvailableAt)],['모델',identity.modelVersion],['기록 ID',identity.recordId],['고정 출력 해시',identity.outputHash],['원본 코드',identity.sourceCommit??'현재 실행 모형']].map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('');
      loading.hidden=true;content.hidden=false;panel.dataset.state='ready';
      controller=createReplayController({length:session.timeline.length,onChange:paint});controller.speed(Number(query('[data-replay-speed]').value));
      if(typeof ResizeObserver==='function'){observer=new ResizeObserver(()=>{if(controller)paint(controller.getState());});observer.observe(svg.parentElement);}
    }catch(reason){
      if(!active()||token!==epoch)return;
      stop();loading.hidden=true;content.hidden=true;error.hidden=false;panel.dataset.state='error';
      error.innerHTML='<p>'+esc(current.signal.aborted?'관측 자료 확인 시간이 초과되거나 요청이 취소됐습니다.':reason?.message??'리플레이를 만들지 못했습니다.')+'</p><button type="button" data-replay-retry>다시 확인</button>';
    }finally{clearTimeout(timer);current.signal.removeEventListener('abort',aborted);if(request===current)request=null;}
  }
  const click=event=>{
    if(event.target.closest('[data-replay-play]'))toggle();
    else if(event.target.closest('[data-replay-previous]'))controller?.step(-1);
    else if(event.target.closest('[data-replay-next]'))controller?.step(1);
    else if(event.target.closest('[data-replay-reset]'))controller?.seek(0);
    else if(event.target.closest('[data-replay-export]')&&frame)downloadFrame(frame,session);
    else if(event.target.closest('[data-replay-retry]'))void load();
  };
  const change=event=>{
    if(event.target.matches('[data-replay-mode],[data-replay-origin],[data-replay-horizon],[data-replay-model]'))void load();
    else if(event.target.matches('[data-replay-speed]'))controller?.speed(Number(event.target.value));
    else if(event.target.matches('[data-replay-clock],[data-replay-display]')){settings();controller?.pause();}
    else if(event.target.matches('[data-replay-date]')&&session){
      const index=session.timeline.findIndex(date=>date>=event.target.value);controller?.seek(index<0?session.timeline.length-1:index);
    }
  };
  const input=event=>{if(event.target.matches('[data-replay-scrub]'))controller?.seek(Number(event.target.value));};
  const visibility=()=>{if(document.visibilityState==='hidden')controller?.pause();};
  const pagehide=()=>controller?.pause();
  panel.addEventListener('click',click);panel.addEventListener('change',change);panel.addEventListener('input',input);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);
  void load();
  return {pause:()=>controller?.pause(),destroy(){
    if(destroyed)return;destroyed=true;cancel();panel.dataset.state='closed';panel.dataset.playback='paused';
    panel.removeEventListener('click',click);panel.removeEventListener('change',change);panel.removeEventListener('input',input);
    document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);
    svg.onpointermove?.cancel?.();for(const key of ['onpointermove','onpointerleave','onkeydown','onclick'])svg[key]=null;
  }};
}
