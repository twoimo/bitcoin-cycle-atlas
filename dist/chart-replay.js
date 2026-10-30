import {createChartReplayController,CHART_REPLAY_SPEEDS} from './chart-replay-state.js';

const day=date=>Date.parse(date+'T00:00:00Z')/86400000;
const dateAt=value=>new Date(Math.round(value)*86400000).toISOString().slice(0,10);
const price=value=>Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
const percent=value=>Number.isFinite(value)?(value*100).toFixed(2)+'%':'평가 대기';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const STORAGE='atlas-chart-replay-v1:';

export function mountChartReplay({svg,plot,toolbar,symbol='BTCUSD',restore=()=>{}}={}){
  if(!svg||!plot||!toolbar)throw new TypeError('The existing chart, plot and toolbar are required');
  const doc=svg.ownerDocument,win=doc.defaultView;
  const historical=['BTCUSD','ETHUSD'].includes(symbol);
  const minimumOriginIndex=symbol==='ETHUSD'?365:180;
  const trigger=doc.createElement('button');trigger.type='button';trigger.id='workbench-replay';
  trigger.className='chart-replay-trigger';trigger.textContent='↶ 봉 리플레이';trigger.title='현재 차트에서 시작 봉을 선택하고 고정 예측과 비교';
  trigger.setAttribute('aria-pressed','false');toolbar.insertBefore(trigger,toolbar.querySelector('.workbench-spacer,.eth-top-spacer'));
  const panel=doc.createElement('section');panel.className='chart-replay-controls';panel.hidden=true;
  panel.setAttribute('aria-label','봉 리플레이 제어');
  panel.innerHTML='<div class="chart-replay-toolbar"><div class="chart-replay-actions">'+
    '<button type="button" data-cr="previous" aria-label="이전 봉">‹</button><button type="button" data-cr="play" aria-label="리플레이 재생">▶</button><button type="button" data-cr="next" aria-label="다음 봉">›</button>'+
    '<select data-cr="speed" aria-label="재생 속도">'+CHART_REPLAY_SPEEDS.map(speed=>'<option value="'+speed+'"'+(speed===1?' selected':'')+'>'+speed+'×</option>').join('')+'</select>'+
    '<button type="button" data-cr="pooled-retry" hidden>통합 변동성으로 같은 날짜 비교</button>'+
    '<button type="button" data-cr="pick" title="시작 봉 다시 선택">시작점</button>'+
    '<label class="chart-replay-origin">기준 <input type="date" data-cr="date" aria-label="리플레이 예측 기준일"></label><button type="button" data-cr="start">이 날짜 시작</button>'+
    '<select data-cr="display" aria-label="리플레이 차트 유형"><option value="candles">캔들</option><option value="line">종가선</option></select>'+
    '<select data-cr="mode" aria-label="리플레이 예측 종류">'+(historical?'<option value="historical-reconstruction">'+(symbol==='BTCUSD'?'BTC 축소 추세 · 회고':'ETH 가격 모형 · 회고')+'</option>':'')+'<option value="recorded">보존 예측</option></select>'+
    (symbol==='ETHUSD'?'<select data-cr="model" aria-label="ETH 리플레이 가격 모형"><option value="adaptive">국면 적응</option><option value="pooled">통합 변동성</option></select>':'')+
    '<select data-cr="record" aria-label="리플레이 보존 예측 선택" hidden></select>'+
    '<select data-cr="horizon" aria-label="고정 예측 기간"><option value="30">30일</option><option value="90">90일</option><option value="180" selected>180일</option><option value="365">1년</option><option value="730">2년</option></select>'+
    '<button type="button" data-cr="random">무작위</button><button type="button" data-cr="resume" hidden>이어서</button><button type="button" data-cr="details" aria-expanded="false">평가·근거</button></div>'+
    '<button type="button" data-cr="exit" class="chart-replay-exit" aria-label="봉 리플레이 종료하고 최신 차트 복귀">최신 복귀 ×</button></div>'+
    '<div class="chart-replay-progress"><output data-cr="cursor">시작 봉 선택</output><input data-cr="scrub" type="range" min="0" max="0" value="0" step="1" aria-label="공개된 봉 위치"><span data-cr="metric"></span></div>'+
    '<div class="chart-replay-details" data-cr="detail-panel" hidden><strong data-cr="model-label"></strong><p data-cr="source"></p><p>금색 점선은 기준일에 고정한 예측, 실제 가격은 재생 위치까지만 공개합니다. 미래 실제값·사후 고저점·사건·지표는 숨깁니다. 음영은 조건 범위 또는 보정 전 모형 구간이며 적중 확률이 아닙니다.</p><p data-cr="detail-metric"></p><p>과거 재구성은 현재 코드와 보존 판본으로 다시 계산한 연구입니다. 당시 실제 발행한 예측 성적이 아니며, 한 경로의 여러 일봉은 독립 예측 횟수가 아닙니다. 보존 예측도 현재 판본의 시장 날짜 기준 회고 비교입니다.</p><button type="button" data-cr="export">공개된 평가 JSON</button><button type="button" data-cr="hide-details">닫기</button></div>';
  const hud=doc.createElement('div');hud.className='chart-replay-hud';hud.hidden=true;
  const status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const inspect=doc.createElement('p');inspect.className='chart-replay-inspect';hud.append(status,inspect);plot.append(hud,panel);
  const q=key=>panel.querySelector('[data-cr="'+key+'"]');
  let active=false,epoch=0,request=null,modules=null,archive=null,record=null,entries=[],rendered=null,range=null,frame=null;
  let gesture=null,follow=true,paintFrame=null,destroyed=false,lastSave=0,painting=false;
  const oldLabel=svg.getAttribute('aria-label'),ownedInert=new Map(),engagedSessions=new WeakSet();
  let stored=null;try{stored=JSON.parse(win.localStorage.getItem(STORAGE+symbol));}catch{}
  if(stored?.version!==1||stored.symbol!==symbol||!['recorded','historical-reconstruction'].includes(stored.mode)||!/^\d{4}-\d{2}-\d{2}$/.test(stored.origin??'')||!Number.isSafeInteger(stored.cursorIndex))stored=null;
  q('resume').hidden=!stored;
  const controller=createChartReplayController({onChange:paint});
  const getState=()=>controller.getState();
  function announce(message){status.textContent=message;}
  function preserve(){
    const state=getState();if(!state.session)return;
    if(state.cursorIndex>0)engagedSessions.add(state.session);
    if(state.session.autoOpened&&state.cursorIndex===0&&!engagedSessions.has(state.session)&&stored)return;
    stored={version:1,symbol,...state.session.replaySettings,origin:state.session.asOf,cursorIndex:state.cursorIndex,
      cursorDate:state.session.timeline[state.cursorIndex],sourceHash:state.session.observationProvenance.source?.sourceHash??null,
      outputHash:state.session.identity.outputHash,speed:state.speed};
    try{win.localStorage.setItem(STORAGE+symbol,JSON.stringify(stored));}catch{}
    q('resume').hidden=false;lastSave=Date.now();
  }
  function blockSurrounding(on){
    if(on){
      const nodes=[...toolbar.children,...doc.querySelectorAll('.workbench-tools,.workbench-rail,.workbench-bottom,.eth-tools,.eth-bottom,.eth-bottom-bar')];
      for(const node of nodes){if(node===trigger||node.contains(panel))continue;ownedInert.set(node,node.inert);node.inert=true;}
    }else{for(const [node,value]of ownedInert)node.inert=value;ownedInert.clear();}
  }
  function activate(){
    if(active)return;
    active=true;plot.classList.add('chart-replay-active');svg.dataset.chartReplayActive='true';
    doc.documentElement.dataset.chartReplayActive='true';trigger.setAttribute('aria-pressed','true');
    panel.hidden=false;hud.hidden=false;blockSurrounding(true);
    for(const dialog of doc.querySelectorAll('dialog[open]'))dialog.close();
    doc.dispatchEvent(new win.CustomEvent('atlas:chart-replay-open'));
    resize();
  }
  function disposeDrawing(){rendered?.destroy?.();rendered=null;svg.onpointermove?.cancel?.();svg.onpointermove=null;svg.onpointerleave=null;svg.onclick=null;}
  function exit(){
    if(!active)return;preserve();epoch++;request?.abort();request=null;active=false;controller.exit();
    if(paintFrame!==null){win.cancelAnimationFrame(paintFrame);paintFrame=null;}
    gesture=null;disposeDrawing();plot.classList.remove('chart-replay-active');plot.style.removeProperty('--chart-replay-controls-height');
    delete svg.dataset.chartReplayActive;delete doc.documentElement.dataset.chartReplayActive;
    for(const key of Object.keys(svg.dataset))if(key.startsWith('replay'))delete svg.dataset[key];
    if(oldLabel!==null)svg.setAttribute('aria-label',oldLabel);
    panel.hidden=true;hud.hidden=true;q('detail-panel').hidden=true;trigger.setAttribute('aria-pressed','false');
    blockSurrounding(false);frame=null;archive=null;restore();trigger.focus({preventScroll:true});
  }
  async function open({resume=null}={}){
    if(destroyed)return;activate();preserve();const token=++epoch;request?.abort();request=new AbortController();
    controller.open();disposeDrawing();svg.replaceChildren();archive=null;frame=null;record=null;entries=[];range=null;follow=true;
    if(resume){q('mode').value=resume.mode;q('horizon').value=String(resume.horizon);if(q('model')&&resume.model)q('model').value=resume.model;}
    announce('리플레이 자료를 확인하고 있습니다.');
    const signal=request.signal;
    try{
      modules??=await Promise.all([import('./forecast-replay.js'),import('./chart-replay-renderer.js'),import('./chart-replay-sources.js')]);
      if(!active||token!==epoch)return;
      const loadedArchive=await modules[2].loadChartReplayArchive(symbol,{mode:q('mode').value,signal});
      if(!active||token!==epoch)return;
      archive=loadedArchive;
      const candlesOption=q('display').querySelector('[value="candles"]');
      if(candlesOption.disabled&&archive.source.ohlcAvailable)q('display').value='candles';
      candlesOption.disabled=!archive.source.ohlcAvailable;
      if(!archive.source.ohlcAvailable)q('display').value='line';
      const rows=archive.observations;
      q('record').hidden=q('mode').value!=='recorded';q('random').hidden=!historical||q('mode').value==='recorded';
      q('date').disabled=q('mode').value==='recorded';q('start').hidden=q('mode').value==='recorded';q('pick').disabled=!historical||q('mode').value==='recorded';
      if(q('model'))q('model').hidden=q('mode').value==='recorded';
      q('source').textContent=archive.source.provider+' · '+archive.observedThrough+'까지 실제 관측 · 수집 '+archive.observedAt+' · 현재 보존 판본';
      if(q('mode').value==='recorded'){
        const loadedRecord=await modules[2].loadChartReplayRecord(symbol,{signal,recordId:resume?.recordId});
        if(!active||token!==epoch)return;record=loadedRecord;entries=record.entries;
        q('record').replaceChildren(...entries.map(entry=>{const option=doc.createElement('option');option.value=entry.id;option.textContent=entry.asOf+' · '+(entry.scenarioLabel??entry.scenario??entry.scenarioId??'보존본');return option;}));
        q('record').value=record.record.id;
        await start(record.record.asOf,{resume,automatic:true});
      }else{
        if(rows.length<minimumOriginIndex+2)throw new Error('기준일까지 '+(minimumOriginIndex+1)+'개 관측과 이후 실제 봉이 필요합니다.');
        q('date').min=rows[minimumOriginIndex].date;q('date').max=rows.at(-2).date;
        q('date').value=resume?.origin??rows[Math.max(minimumOriginIndex,rows.length-181)].date;
        range={start:dateAt(Math.max(day(rows[0].date),day(rows.at(-1).date)-730)),end:dateAt(day(rows.at(-1).date)+10)};
        paint(getState());
        if(resume)await start(resume.origin,{resume});
      }
    }catch(error){if(active&&token===epoch&&!signal.aborted)controller.fail(error);}
  }
  function nearestOrigin(value){
    const rows=archive?.observations;if(!rows?.length)return null;
    let low=0,high=rows.length-1;
    while(low<high){const mid=(low+high)>>1;if(rows[mid].date<value)low=mid+1;else high=mid;}
    if(low>0&&Math.abs(day(rows[low-1].date)-day(value))<Math.abs(day(rows[low].date)-day(value)))low--;
    return rows[clamp(low,minimumOriginIndex,rows.length-2)].date;
  }
  async function start(value,{resume=null,automatic=false}={}){
    if(!active||!archive||!modules)return;
    const source=archive,recorded=q('mode').value==='recorded',selectedRecord=record;
    const replaySettings={mode:q('mode').value,horizon:Number(q('horizon').value),model:q('model')?.value??null,recordId:recorded?selectedRecord.record.id:null};
    const asOf=recorded?record.record.asOf:nearestOrigin(value);if(!asOf)return;
    q('date').value=asOf;follow=true;range={start:dateAt(day(asOf)-120),end:dateAt(day(asOf)+Math.min(Number(q('horizon').value),120))};
    const accepted=await controller.selectOrigin(asOf,async({signal})=>{
      const engine=modules[0],options={symbol,observations:source.observations,observedAt:source.observedAt,observedThrough:source.observedThrough,source:source.source,horizonDays:replaySettings.horizon};
      const session=recorded?await engine.createRecordedReplaySession({...options,record:selectedRecord.record,snapshot:selectedRecord.snapshot}):
        await engine.createHistoricalReplaySession({...options,asOf,modelKey:symbol==='ETHUSD'?replaySettings.model:'shrunken-trend'});
      signal.throwIfAborted();
      const dates=new Set(source.observations.map(row=>row.date));
      // Playback advances by actual observed bars; missing days remain gaps.
      const timeline=session.timeline.filter(date=>date===session.asOf||dates.has(date));
      return Object.freeze({...session,engineSession:session,autoOpened:automatic,replaySettings:Object.freeze(replaySettings),timeline:Object.freeze(timeline)});
    });
    if(!accepted||!active||!getState().session)return;
    if(resume){
      if(getState().session.identity.outputHash===resume.outputHash){
        const dates=getState().session.timeline;
        const index=resume.cursorDate?Math.max(0,dates.findLastIndex(date=>date<=resume.cursorDate)):clamp(resume.cursorIndex,0,getState().length-1);
        controller.seek(index);if(CHART_REPLAY_SPEEDS.includes(resume.speed))controller.speed(resume.speed);
        announce('저장한 기준과 공개 날짜를 복원했습니다. 일시정지 상태입니다.'+(resume.sourceHash&&resume.sourceHash!==source.source.sourceHash?' 실제 관측 판본은 갱신되었습니다.':''));
      }else if(resume.outputHash)announce('입력 또는 모형이 바뀌어 이전 평가를 이어 붙이지 않습니다. 새 기준에서 시작합니다.');
    }
    svg.focus({preventScroll:true});
  }
  function onInspect(value){
    if(!active||!value||painting)return;
    const date=typeof value==='string'?value:value.date;
    if(getState().status==='selecting'){
      const selected=nearestOrigin(date);if(selected){q('date').value=selected;inspect.textContent=selected+' · 클릭 또는 탭하여 예측 기준일 선택';showPickLine(selected);}
    }else inspect.textContent=date+' · 실제 '+price(value.actual??value.price)+' · 고정 예측 '+price(value.predicted);
  }
  function showPickLine(date){
    if(!rendered?.x||!rendered?.axis)return;
    let line=svg.querySelector('[data-chart-replay-picker]');
    if(!line){line=doc.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('data-chart-replay-picker','');line.setAttribute('class','chart-replay-picker');svg.append(line);}
    const x=rendered.x(date);for(const [key,value]of Object.entries({x1:x,x2:x,y1:rendered.axis.top,y2:rendered.axis.bottom}))line.setAttribute(key,String(value));
  }
  function paint(state){
    if(!active||destroyed)return;
    panel.dataset.state=state.status;svg.dataset.replayStatus=state.status;
    const ready=Boolean(state.session),playing=state.status==='playing';
    q('export').disabled=true;
    if(!ready){
      inspect.textContent='';q('metric').textContent='';q('detail-metric').textContent='';
      q('model-label').textContent=state.status==='error'?'예측을 생성하지 않았습니다.':'선택한 기준의 예측을 준비합니다.';
      for(const key of ['replayOutputHash','replayOrigin','replayCursor','replayActualThrough'])delete svg.dataset[key];
    }
    q('play').disabled=!ready||state.length<2;q('previous').disabled=!ready||state.cursorIndex===0;q('next').disabled=!ready||state.cursorIndex>=state.length-1;q('scrub').disabled=!ready;
    q('play').textContent=playing?'Ⅱ':'▶';q('play').setAttribute('aria-label',playing?'리플레이 일시정지':'리플레이 재생');q('play').setAttribute('aria-pressed',String(playing));
    q('scrub').max=String(Math.max(0,state.length-1));q('scrub').value=String(state.cursorIndex);
    q('start').disabled=!archive||state.status==='loading';q('random').disabled=!archive||state.status==='loading';
    const adaptiveUnavailable=state.status==='error'&&symbol==='ETHUSD'&&q('mode').value==='historical-reconstruction'&&q('model')?.value==='adaptive'&&state.error==='ETH adaptive model needs at least 30 causally classified returns in each state';
    q('pooled-retry').hidden=!adaptiveUnavailable;
    if(state.status==='error'){
      disposeDrawing();svg.replaceChildren();frame=null;inspect.textContent='';q('cursor').textContent=adaptiveUnavailable?'예측 준비 조건 미충족':'리플레이 오류';q('metric').textContent='';q('detail-metric').textContent='';
      for(const key of ['replayOutputHash','replayOrigin','replayCursor','replayActualThrough'])delete svg.dataset[key];
      const reason=adaptiveUnavailable?'선택 기준일까지 확정된 상승·하락 수익률 표본이 각 30개 이상 필요합니다. 날짜를 바꾸거나 통합 변동성 모형으로 같은 날짜를 비교해 주세요.':state.error+' · 시작점 또는 예측 종류를 다시 선택해 주세요.';
      announce(reason);return;
    }
    if(!modules||!archive)return;
    try{
      painting=true;
      disposeDrawing();
      if(state.status==='selecting'){
        if(!range)return;rendered=modules[1].drawReplaySelection({svg,observations:archive.observations,...range,symbol,source:archive.source.provider,chartType:q('display').value,onInspect});
        frame=null;q('metric').textContent='';q('cursor').textContent='시작 봉 선택';
        announce(symbol+' · 차트에서 시작 봉을 선택하세요. 드래그로 이동하고 휠로 확대할 수 있습니다.');
        q('model-label').textContent=symbol==='BTCUSD'?'BTC 축소 추세 기준모형 · 과거 재구성':'ETH 가격 모형 · 과거 재구성';
        showPickLine(q('date').value);return;
      }
      if(!ready){svg.replaceChildren();frame=null;announce('기준일까지의 자료로 예측을 고정하고 있습니다.');return;}
      const session=state.session.engineSession,date=state.session.timeline[state.cursorIndex];
      if(follow&&day(date)>day(range.end)-20){const width=day(range.end)-day(range.start);range={start:dateAt(day(date)+40-width),end:dateAt(day(date)+40)};}
      const data=modules[0].buildReplayChartData(session,{cursorDate:date,clockMode:'observed-date',frequency:'daily'});frame=data.frame;
      rendered=modules[1].drawChartReplay({svg,session,data:{...data,symbol,candleSource:archive.source.provider},...range,chartType:q('display').value,onInspect});
      svg.dataset.replayOutputHash=session.identity.outputHash;svg.dataset.replayOrigin=session.asOf;
      svg.dataset.replayCursor=date;svg.dataset.replayActualThrough=frame.actual.at(-1)?.date??session.asOf;
      const m=frame.metrics;q('cursor').textContent=date+' · '+state.cursorIndex+'/'+(state.length-1)+'봉';q('scrub').setAttribute('aria-valuetext',date);
      q('metric').textContent='오차 '+percent(m.meanAbsolutePercentageError)+' · '+m.matchedCount+'개';
      q('detail-metric').textContent='평균 절대 % 오차 '+percent(m.meanAbsolutePercentageError)+' · 가격 유지 대비 개선 '+percent(m.skillVersusFlat)+' · 방향 일치 '+percent(m.directionAccuracy)+' · 비교 '+m.matchedCount+'개 일봉. 개선율은 양수일 때 가격 유지 기준보다 유리합니다. 결과 대기 '+m.pendingTargetCount+'개 / 관측 미확보 '+m.missingTargetCount+'개 목표.';
      q('model-label').textContent=(session.mode==='recorded'?'보존 예측 · ':'과거 재구성 · ')+(session.historicalModel?.label??session.identity.pointLabel??session.identity.modelVersion);
      if(!data.ohlcAvailable){q('display').value='line';q('display').querySelector('[value="candles"]').disabled=true;}else q('display').querySelector('[value="candles"]').disabled=false;
      const label={paused:'일시정지',playing:'재생 중',ended:'확보한 실제 봉까지 재생 완료'}[state.status]??'';
      announce(symbol+' · 1일 봉 · '+label+' · 예측 기준 '+session.asOf+' · '+(session.mode==='recorded'?'보존 경로':'과거 재구성'));
      const point=frame.selected;inspect.textContent=date+' · 실제 '+price(point.actual??(date===session.asOf?point.flat:null))+' · 고정 예측 '+price(point.predicted);
      q('export').disabled=false;
      if(state.status!=='playing'||Date.now()-lastSave>1000)preserve();
    }catch(error){controller.fail(error);}finally{painting=false;}
  }
  function schedulePaint(){if(!active||paintFrame!==null)return;paintFrame=win.requestAnimationFrame(()=>{paintFrame=null;paint(getState());});}
  function resize(){if(!active)return;plot.style.setProperty('--chart-replay-controls-height',panel.getBoundingClientRect().height+'px');schedulePaint();}
  function toggle(){if(getState().status==='playing')controller.pause();else controller.play();}
  trigger.onclick=()=>active?exit():void open();q('exit').onclick=exit;q('pick').onclick=()=>void open();
  q('start').onclick=()=>void start(q('date').value);q('date').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void start(q('date').value);}};
  q('play').onclick=toggle;q('previous').onclick=()=>controller.step(-1);q('next').onclick=()=>controller.step(1);
  q('speed').onchange=()=>controller.speed(Number(q('speed').value));q('display').onchange=()=>paint(getState());
  q('pooled-retry').onclick=()=>{const state=getState();if(q('pooled-retry').hidden||state.status!=='error'||!state.origin)return;q('model').value='pooled';void start(state.origin);};
  q('scrub').oninput=()=>controller.seek(Number(q('scrub').value));
  for(const key of ['mode','horizon','model'])if(q(key))q(key).onchange=()=>void open();
  q('record').onchange=()=>void open({resume:{...stored,recordId:q('record').value,mode:'recorded',horizon:Number(q('horizon').value),cursorIndex:0,outputHash:null}});
  q('random').onclick=()=>{if(!archive)return;const rows=archive.observations;const index=minimumOriginIndex+Math.floor(Math.random()*Math.max(1,rows.length-minimumOriginIndex-1));void start(rows[index].date);};
  q('resume').onclick=()=>{if(stored)void open({resume:{...stored}});};
  q('details').onclick=()=>{q('detail-panel').hidden=!q('detail-panel').hidden;q('details').setAttribute('aria-expanded',String(!q('detail-panel').hidden));};
  q('hide-details').onclick=()=>{q('detail-panel').hidden=true;q('details').setAttribute('aria-expanded','false');q('details').focus();};
  q('export').onclick=()=>{
    const session=getState().session;if(!frame||!session)return;
    const payload={kind:'atlas-visible-chart-replay',schemaVersion:1,identity:session.identity,mode:session.mode,source:archive.source,frame};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}));
    const link=doc.createElement('a');link.href=url;link.download='atlas-chart-replay-'+symbol+'-'+frame.cursorDate+'.json';link.click();win.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  function pointer(event){
    if(!active||event.target.closest?.('.chart-replay-controls,.chart-replay-hud'))return;
    if(!svg.contains(event.target)&&event.target!==plot)return;
    event.stopImmediatePropagation();
    if(event.type==='pointerdown'){
      if(event.button!==0)return;event.preventDefault();gesture={x:event.clientX,y:event.clientY,start:range?{...range}:null,moved:false,id:event.pointerId};
      plot.setPointerCapture?.(event.pointerId);svg.focus({preventScroll:true});
    }else if(event.type==='pointermove'){
      if(gesture?.start){
        const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;if(Math.hypot(dx,dy)>7)gesture.moved=true;
        if(gesture.moved){event.preventDefault();follow=false;const width=Math.max(1,svg.getBoundingClientRect().width-90),shift=-dx/width*(day(gesture.start.end)-day(gesture.start.start));range={start:dateAt(day(gesture.start.start)+shift),end:dateAt(day(gesture.start.end)+shift)};schedulePaint();}
      }else if(rendered?.previewPointer)rendered.previewPointer(event);
    }else if(event.type==='pointerup'||event.type==='pointercancel'){
      const prior=gesture;gesture=null;if(prior)try{plot.releasePointerCapture?.(prior.id);}catch{}
      if(event.type==='pointerup'&&prior&&!prior.moved&&getState().status==='selecting'){const date=rendered?.dateAt?.(event.clientX);if(date)void start(date);}
    }
  }
  const pointerTypes=['pointerdown','pointermove','pointerup','pointercancel'];for(const type of pointerTypes)plot.addEventListener(type,pointer,{capture:true,passive:false});
  function wheel(event){
    if(!active||event.target.closest?.('.chart-replay-controls')||!range)return;event.preventDefault();event.stopImmediatePropagation();follow=false;
    const span=day(range.end)-day(range.start),rect=svg.getBoundingClientRect(),ratio=clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1);
    if(Math.abs(event.deltaX)>Math.abs(event.deltaY)){const shift=event.deltaX/Math.max(1,rect.width)*span;range={start:dateAt(day(range.start)+shift),end:dateAt(day(range.end)+shift)};}
    else{const width=clamp(span*Math.exp(clamp(event.deltaY,-200,200)*.002),14,8000),anchor=day(range.start)+ratio*span;range={start:dateAt(anchor-width*ratio),end:dateAt(anchor+width*(1-ratio))};}
    schedulePaint();
  }
  plot.addEventListener('wheel',wheel,{capture:true,passive:false});
  function preventLiveGesture(event){if(active&&!event.target.closest?.('.chart-replay-controls')){event.preventDefault();event.stopImmediatePropagation();}}
  plot.addEventListener('contextmenu',preventLiveGesture,true);plot.addEventListener('dblclick',preventLiveGesture,true);
  function key(event){
    if(!active||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,select,textarea,[contenteditable=true],dialog'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!q('detail-panel').hidden)q('hide-details').click();else exit();return;}
    if((event.shiftKey&&event.key==='ArrowDown')||(event.key===' '&&event.target===svg)){event.preventDefault();event.stopImmediatePropagation();toggle();}
    else if((event.shiftKey&&['ArrowRight','ArrowLeft'].includes(event.key))||(event.target===svg&&['ArrowRight','ArrowLeft','Home','End'].includes(event.key))){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Home')controller.seek(0);else if(event.key==='End')controller.seek(getState().length-1);else controller.step(event.key==='ArrowRight'?1:-1);}
    else if(event.target===svg)event.stopImmediatePropagation();
  }
  doc.addEventListener('keydown',key,true);
  const pause=()=>{if(active){controller.pause();preserve();}};
  const visibility=()=>{if(doc.hidden)pause();};
  doc.addEventListener('visibilitychange',visibility);win.addEventListener('blur',pause);win.addEventListener('pagehide',pause);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(plot);resizeObserver.observe(panel);
  return {isActive:()=>active,open,exit,destroy(){if(destroyed)return;exit();destroyed=true;controller.destroy();resizeObserver.disconnect();
    for(const type of pointerTypes)plot.removeEventListener(type,pointer,true);plot.removeEventListener('wheel',wheel,true);plot.removeEventListener('contextmenu',preventLiveGesture,true);plot.removeEventListener('dblclick',preventLiveGesture,true);doc.removeEventListener('keydown',key,true);
    doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('blur',pause);win.removeEventListener('pagehide',pause);trigger.remove();panel.remove();hud.remove();}};
}
