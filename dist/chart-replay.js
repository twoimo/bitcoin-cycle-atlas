import {setChartLoading} from './loading-surfaces.js';
import {createChartReplayController,CHART_REPLAY_SPEEDS} from './chart-replay-state.js?v=1.36.0';
import {captureReplayView,sealReplaySnapshot,supplementReplaySnapshot,restoreReplaySnapshot,persistReplayDraft} from './chart-replay-snapshot.js?v=1.36.0';
import {panRange,zoomRange,accumulateWheelRange} from './chart-navigation.js?v=1.36.0';
import {withChartSpacing} from './chart-view-policy.js?v=1.36.0';
import {normalizePriceDomain,scalePriceDomain,panPriceDomain} from './price-axis.js?v=1.36.0';

const day=date=>Date.parse(date+'T00:00:00Z')/86400000;
const dateAt=value=>new Date(Math.round(value)*86400000).toISOString().slice(0,10);
const price=value=>Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
const percent=value=>Number.isFinite(value)?(value*100).toFixed(2)+'%':'평가 대기';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const STORAGE='atlas-chart-replay-v1:';
const intervalName=value=>({daily:'일봉',weekly:'주봉','1m':'1분봉','5m':'5분봉','15m':'15분봉','30m':'30분봉','1h':'1시간봉','4h':'4시간봉'})[value]??value;
const speedMeaning=value=>value===.3?'3초마다 1업데이트':value===.5?'2초마다 1업데이트':value===1?'초당 1업데이트':'초당 '+value+'업데이트';
const replayIcon=path=>'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+path+'"/></svg>';
const playIcon=()=>replayIcon('M8 5l11 7-11 7Z');
const pauseIcon=()=>replayIcon('M8 5v14M16 5v14');

/** Convert the renderer's real viewBox axes into client pixels. Replay owns
 * its gesture guards, but uses the same plot/axis regions as live charts. */
export function replayNavigationGeometry(svg,axis){
  const rect=svg.getBoundingClientRect(),view=svg.viewBox?.baseVal;
  const width=view?.width||svg.clientWidth||rect.width,height=view?.height||svg.clientHeight||rect.height;
  if(!(width>0&&height>0&&rect.width>0&&rect.height>0))return null;
  const left=axis?.left??Number(svg.dataset.plotLeft),right=axis?.right??Number(svg.dataset.plotRight);
  const top=axis?.top??Number(svg.dataset.plotTop),bottom=Number(svg.dataset.plotBottom??axis?.bottom);
  if(![left,right,top,bottom].every(Number.isFinite)||right<=left||bottom<=top)return null;
  const box=(x,y,w,h)=>({left:rect.left+(x-(view?.x||0))/width*rect.width,top:rect.top+(y-(view?.y||0))/height*rect.height,width:w/width*rect.width,height:h/height*rect.height});
  const plot=box(left,top,right-left,bottom-top),price=normalizePriceDomain(axis,{scale:axis?.scale})&&right<width?box(right,axis.top,width-right,axis.bottom-axis.top):null;
  const timeTop=Number(svg.dataset.timeAxisTop??bottom+8),time=timeTop<height?box(left,timeTop,right-left,height-timeTop):null;
  return {plot,price,time};
}
const insideReplayRegion=(event,rect)=>Boolean(rect&&rect.width>0&&rect.height>0&&event.clientX>=rect.left&&event.clientX<=rect.left+rect.width&&event.clientY>=rect.top&&event.clientY<=rect.top+rect.height);

/** Capture the painted chart before any asynchronous archive request. A live
 * refresh must not mutate the forecast while its replay is being prepared. */
export function captureAtlasReplaySnapshot(value){
  if(value===null||value===undefined)return null;
  const snapshot=structuredClone(value),seen=new WeakSet();
  const freeze=node=>{if(node&&typeof node==='object'&&!seen.has(node)){seen.add(node);for(const child of Object.values(node))freeze(child);Object.freeze(node);}return node;};
  return freeze(snapshot);
}

export function mountChartReplay({svg,plot,toolbar,symbol='BTCUSD',restore=()=>{},getAtlasContext=null,getChartState=null,getChartRenderer=null,resolveAtlasRange=null,loadAtlasRenderer=null,loadRetrospectiveModel=null,loadCutoffModel=null,onAtlasFrame=()=>{},initialMode='cutoff-backtest'}={}){
  if(!svg||!plot||!toolbar)throw new TypeError('The existing chart, plot and toolbar are required');
  const doc=svg.ownerDocument,win=doc.defaultView;
  const historical=['BTCUSD','ETHUSD'].includes(symbol);
  const atlasAvailable=symbol==='BTCUSD'&&typeof getAtlasContext==='function';
  const minimumOriginIndex=symbol==='ETHUSD'?365:180;
  const preferredMode=atlasAvailable&&initialMode==='cutoff-backtest'?'cutoff-backtest':'atlas-chart';
  const trigger=doc.createElement('button');trigger.type='button';trigger.id='workbench-replay';
  trigger.className='chart-replay-trigger';trigger.textContent='↶ 봉 리플레이';trigger.title=atlasAvailable?'선택 시점의 예측을 고정하고 이후 실제 봉과 비교':'현재 차트에서 시작 봉을 선택하고 고정 예측과 비교';
  trigger.setAttribute('aria-pressed','false');toolbar.insertBefore(trigger,toolbar.querySelector('.workbench-spacer,.eth-top-spacer'));
  const panel=doc.createElement('section');panel.className='chart-replay-controls';panel.hidden=true;
  panel.setAttribute('aria-label','봉 리플레이 제어');
  panel.innerHTML='<div class="chart-replay-bar" role="toolbar" aria-label="봉 리플레이 재생 막대"><div class="chart-replay-actions">'+
    '<button type="button" data-cr="first" aria-label="리플레이 처음으로" title="리플레이 처음으로 · Home">'+replayIcon('M5 5v14M18 5l-10 7 10 7Z')+'</button>'+
    '<button type="button" data-cr="select-menu" aria-label="시작 봉 선택 메뉴 · Select bar" aria-haspopup="dialog" aria-expanded="false">Select bar <span aria-hidden="true">▾</span></button>'+
    '<button type="button" data-cr="mode-badge" aria-label="리플레이 모드 설정">백테스트</button>'+
    '<button type="button" data-cr="result" hidden>결과 보기</button>'+
    '<button type="button" data-cr="pick" aria-label="시작점 선택 · Select starting point" title="시작점 선택 · Select starting point" aria-pressed="false">'+replayIcon('M5 3v15l4-4 3 6 3-1-3-6 6-1Z')+'</button>'+
    '<button type="button" data-cr="play" aria-label="리플레이 재생" title="재생 / 일시정지 · Shift + ↓">'+playIcon()+'</button>'+
    '<button type="button" data-cr="next" aria-label="다음 봉" title="실제 일봉 한 개 전진 · Shift + →">'+replayIcon('M19 5v14M6 5l10 7-10 7Z')+'</button>'+
    '<select data-cr="speed" aria-label="재생 속도" title="초당 1업데이트">'+CHART_REPLAY_SPEEDS.map(speed=>'<option value="'+speed+'" title="'+speedMeaning(speed)+'"'+(speed===1?' selected':'')+'>'+speed+'×</option>').join('')+'</select>'+
    '<select data-cr="update-interval" aria-label="리플레이 업데이트 간격 · D · Auto 1일" title="D · Auto 1일. 확보한 실제 일봉을 하루씩 공개하며 주봉은 같은 주의 OHLC를 갱신합니다." disabled><option value="daily">D</option></select>'+
    '<button type="button" data-cr="live" aria-label="최신 차트로 이동 · Jump to real-time chart" title="최신 차트로 이동 · 세션 저장 선택 후 복귀">'+replayIcon('M4 5l7 7-7 7M12 5l7 7-7 7M21 5v14')+'</button></div></div>'+
    '<button type="button" data-cr="exit" class="chart-replay-exit" aria-label="봉 리플레이 종료" title="봉 리플레이 종료">'+replayIcon('m6 6 12 12M18 6 6 18')+'</button>'+
    '<button type="button" data-cr="pick-cancel" class="chart-replay-pick-cancel" hidden>선택 취소 · Esc</button>'+
    '<section class="chart-replay-select-menu" data-cr="select-panel" data-menu-view="start" role="dialog" aria-label="Select bar · 시작 봉 선택" hidden>'+
    '<div class="chart-replay-menu-heading"><button type="button" data-cr="menu-back" aria-label="시작 봉 선택으로 돌아가기" hidden>'+replayIcon('m14 6-6 6 6 6')+'</button><strong data-cr="menu-title">Select bar</strong><button type="button" data-cr="menu-settings" aria-label="예측·평가 설정 열기" title="예측·평가 · 별도 설정" aria-expanded="false">'+replayIcon('M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6')+'</button><button type="button" data-cr="select-close" aria-label="시작 봉 메뉴 닫기">'+replayIcon('m6 6 12 12M18 6 6 18')+'</button></div>'+
    '<div data-cr="start-view"><div class="chart-replay-select-actions" role="group" aria-label="시작 봉 선택"><button type="button" data-cr="select-chart">차트에서 선택 · Select bar</button><button type="button" data-cr="select-date">날짜 선택 · Select date</button><button type="button" data-cr="select-random">무작위 봉 · Random bar</button><button type="button" data-cr="select-first">첫 사용 가능일 · First available day</button></div></div>'+
    '<div data-cr="date-view" hidden><div class="chart-replay-date-fields"><label class="chart-replay-origin"><span data-cr="date-label">새 시작점 날짜</span> <input type="date" data-cr="date" aria-label="새 시작점 날짜" required></label><button type="button" data-cr="start">이 날짜 선택</button></div><p class="chart-replay-date-context" data-cr="date-context"></p><p class="chart-replay-date-hint" data-cr="date-hint"></p></div>'+
    '<div data-cr="forecast-view" hidden>'+
    '<div class="chart-replay-menu-fields"><label>가격 표시<select data-cr="display" aria-label="리플레이 차트 유형"><option value="candles">캔들</option><option value="line">종가선</option></select></label>'+
    '<label>예측 종류<select data-cr="mode" aria-label="리플레이 예측 종류">'+(atlasAvailable?'<option value="cutoff-backtest">기준시점 백테스트</option><option value="atlas-chart">현재 예측선 고정</option><option value="project-baseline">10월 21일 당시 전망</option>':'')+(historical?'<option value="historical-reconstruction">'+(symbol==='BTCUSD'?'BTC 축소 추세 · 회고':'ETH 가격 모형 · 회고')+'</option>':'')+'<option value="recorded">보존 예측</option></select></label>'+
    (symbol==='ETHUSD'?'<label>가격 모형<select data-cr="model" aria-label="ETH 리플레이 가격 모형"><option value="adaptive">국면 적응</option><option value="pooled">통합 변동성</option></select></label>':'')+
    '<select data-cr="record" aria-label="리플레이 보존 예측 선택" hidden></select>'+
    '<select data-cr="horizon" aria-label="고정 예측 기간"><option value="30">30일</option><option value="90">90일</option><option value="180" selected>180일</option><option value="365">1년</option><option value="730">2년</option></select></div>'+
    '<div class="chart-replay-menu-actions"><button type="button" data-cr="details" aria-expanded="false">평가·근거</button><button type="button" data-cr="pooled-retry" hidden>통합 변동성으로 같은 날짜 비교</button></div>'+
    '<p class="chart-replay-cadence" data-cr="speed-meaning">속도 1× · 초당 1업데이트</p><p class="chart-replay-cadence">D · Auto 1일. 주봉은 실제 일봉으로 같은 주의 OHLC를 하루씩 갱신합니다.</p>'+
    '<div class="chart-replay-progress"><output data-cr="cursor">시작 봉 선택</output><input data-cr="scrub" type="range" min="0" max="0" value="0" step="1" aria-label="공개된 봉 위치"><span data-cr="metric"></span></div>'+
    '<div class="chart-replay-details" data-cr="detail-panel" hidden><strong data-cr="model-label"></strong><p data-cr="source"></p><p data-cr="chart-meaning"></p><p data-cr="detail-metric"></p><p data-cr="evaluation-meaning"></p><button type="button" data-cr="export">공개된 평가 JSON</button><button type="button" data-cr="hide-details">평가 닫기</button></div></div></section>'+
    '<section class="chart-replay-choice" data-cr="entry-dialog" role="dialog" aria-modal="true" aria-label="저장된 리플레이" hidden><strong>저장된 리플레이가 있습니다</strong><p data-cr="saved-summary"></p><div><button type="button" data-cr="entry-continue">이어서 · Continue</button><button type="button" data-cr="entry-new">새로 시작 · Start new</button><button type="button" data-cr="entry-cancel">취소</button></div></section>'+
    '<section class="chart-replay-choice" data-cr="exit-dialog" role="dialog" aria-modal="true" aria-label="리플레이 종료" hidden><strong>봉 리플레이를 종료할까요?</strong><label><input type="checkbox" data-cr="exit-save" checked>현재 세션 저장</label><p>저장을 해제하면 이번 진행은 저장하지 않고 기존 저장 기록을 유지합니다.</p><p data-cr="save-status" role="status" hidden></p><div><button type="button" data-cr="exit-confirm">종료</button><button type="button" data-cr="exit-cancel">계속 보기</button></div></section>';
  const hud=doc.createElement('div');hud.className='chart-replay-hud';hud.hidden=true;
  const status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const inspect=doc.createElement('p');inspect.className='chart-replay-inspect';const seriesKey=doc.createElement('p');seriesKey.className='chart-replay-series-key';const compactScore=doc.createElement('p');compactScore.className='chart-replay-compact-score';compactScore.hidden=true;hud.append(status,inspect,compactScore,seriesKey);
  const notice=doc.createElement('p');notice.className='chart-replay-notice';notice.hidden=true;notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');plot.append(hud,panel,notice);
  const q=key=>panel.querySelector('[data-cr="'+key+'"]');
  const transport=panel.querySelector('.chart-replay-actions'),bar=panel.querySelector('.chart-replay-bar');
  const scrollHint=doc.createElement('span');scrollHint.className='chart-replay-scroll-hint';scrollHint.id='replay-scroll-hint-'+symbol;
  scrollHint.textContent='좌우로 밀어 더 보기';scrollHint.hidden=true;bar?.append(scrollHint);
  transport?.setAttribute('aria-describedby',scrollHint.id);
  function transportHints(){
    if(!transport||!bar)return;
    const overflow=transport.scrollWidth>transport.clientWidth+1;
    bar.dataset.scrollLeft=String(overflow&&transport.scrollLeft>1);
    bar.dataset.scrollRight=String(overflow&&transport.scrollLeft+transport.clientWidth<transport.scrollWidth-1);
    scrollHint.hidden=!overflow||!q('select-panel').hidden||!q('entry-dialog').hidden||!q('exit-dialog').hidden;
  }
  function revealControl(event){
    if(!transport||!event.target?.getBoundingClientRect)return;
    const parent=transport.getBoundingClientRect(),child=event.target.getBoundingClientRect();
    if(child.left<parent.left+2)transport.scrollLeft-=parent.left+2-child.left;
    else if(child.right>parent.right-2)transport.scrollLeft+=child.right-parent.right+2;
    transportHints();
  }
  transport?.addEventListener('scroll',transportHints,{passive:true});transport?.addEventListener('focusin',revealControl);
  if(atlasAvailable)q('mode').value=preferredMode;
  let active=false,epoch=0,request=null,modules=null,archive=null,record=null,entries=[],rendered=null,range=null,frame=null;
  let cutoffModel=null,atlasModules=null,atlasBaseline=null,atlasCaptured=null,atlasCandles=null,atlasPreview=null,pendingAtlas=null,restoredSnapshot=null,atlasCapturedAt=null;
  let gesture=null,follow=true,paintFrame=null,destroyed=false,lastSave=0,painting=false,displayEpoch=0,saving=false;
  let replayPriceDomain, wheelViewport=null, wheelGeometry=null, wheelAt=0, suppressClickUntil=0;
  let picking=false,pickerDate=null,overlay=null,draft=null,dateDraftBase=null,capabilities=null,candleCapabilities=null,replayFrequency='daily',replayWindow='focus',customRange=false;
  let externalBacktest=false,entryOpened=false;
  const hasChoice=()=>overlay==='entry'||overlay==='exit';
  const oldLabel=svg.getAttribute('aria-label'),ownedInert=new Map();
  const storageKey=()=>q('mode').value==='cutoff-backtest'?'atlas-cutoff-backtest-v1:'+symbol:STORAGE+symbol;
  let readKey=null;
  let stored=null,storedText=null,saveBaseText,storageReadError=null;
  function readStored(){
    storageReadError=null;readKey=storageKey();
    try{
      storedText=win.localStorage.getItem(storageKey())??null;
      if(storedText!==null&&storedText.length>2*1024*1024)throw new Error('저장된 리플레이의 크기 제한을 초과했습니다.');
      stored=storedText===null?null:JSON.parse(storedText);
      if(storedText!==null&&(!stored||typeof stored!=='object'||Array.isArray(stored)))throw new Error('저장된 리플레이의 형식이 올바르지 않습니다.');
      if(stored&&(stored.version!==1||stored.symbol!==symbol||!['recorded','historical-reconstruction',...(atlasAvailable?['atlas-chart','project-baseline','cutoff-backtest']:[])].includes(stored.mode)||!/^\d{4}-\d{2}-\d{2}$/.test(stored.origin??'')||!Number.isSafeInteger(stored.cursorIndex)))throw new Error('저장된 리플레이의 형식이 올바르지 않습니다.');
      if(stored&&(stored.mode==='cutoff-backtest')!==(q('mode').value==='cutoff-backtest'))throw new Error('저장된 리플레이의 모드와 저장 위치가 다릅니다.');
    }catch(error){stored=null;storageReadError=error;}
    return !storageReadError;
  }
  function savedSummary(){
    q('entry-continue').disabled=!stored||Boolean(storageReadError);
    q('saved-summary').textContent=storageReadError?'저장된 세션을 읽지 못했습니다. 기존 저장은 변경하지 않습니다.':stored?(stored.cursorDate??stored.origin)+' · '+intervalName(stored.frequency??replayFrequency)+' · 일시정지 상태로 이어집니다.':'저장된 세션이 다른 탭에서 삭제되었습니다. 새로 시작을 선택하세요.';
  }
  function savedChanged(event){
    if(event.key!==null&&event.key!==storageKey())return;
    readStored();if(overlay==='entry')savedSummary();
    // An active replay keeps its own immutable capture and expected save revision.
    if(active&&overlay!=='entry'&&storedText!==saveBaseText){
      q('save-status').textContent='다른 탭에서 저장이 변경되었습니다. 현재 재생은 유지하며 최신 저장을 덮어쓰지 않습니다.';q('save-status').hidden=false;
    }
  }
  readStored();
  const controller=createChartReplayController({onChange:paint});
  const getState=()=>controller.getState();
  function announce(message){status.textContent=message;}
  function preserve(){
    if(externalBacktest)return;
    const state=getState();if(!state.session)return;
    draft={version:1,symbol,...state.session.replaySettings,origin:state.session.asOf,cursorIndex:state.cursorIndex,
      cursorDate:state.session.timeline[state.cursorIndex],sourceHash:state.session.observationProvenance.source?.sourceHash??null,
      outputHash:state.session.identity.outputHash,speed:state.speed,frequency:replayFrequency,chartType:q('display').value,
      window:replayWindow,customRange,range:range?{start:range.start,end:range.end}:null,
      ...(state.session.replaySnapshot?{forecastSnapshot:state.session.replaySnapshot}:{}),
      ...(state.session.cutoffForecast?{cutoffForecast:state.session.cutoffForecast}:{})};
    lastSave=Date.now();
  }
  async function save(){
    if(externalBacktest)return true;
    preserve();if(!draft)return true;
    const token=epoch,isCurrent=()=>active&&!destroyed&&epoch===token;
    try{
      const savedText=await persistReplayDraft(win.localStorage,storageKey(),draft,{indexedDB:win.indexedDB,locks:win.navigator?.locks,expectedText:saveBaseText,isCurrent});
      if(!isCurrent())return false;
      saveBaseText=savedText;
      readStored();q('save-status').hidden=true;return true;
    }catch(error){
      if(!isCurrent())return false;
      const text=(error?.message??'이 브라우저에 세션을 저장하지 못했습니다.')+' 기존 저장은 유지됩니다. 저장 체크를 해제하거나 다시 시도해 주세요.';
      announce(text);q('save-status').textContent=text;q('save-status').hidden=false;return false;
    }
  }
  function unavailable(frequency){
    const text=intervalName(frequency)+' 리플레이에 필요한 실제 분봉 자료가 없습니다. '+intervalName(active?replayFrequency:frequency)+' 간격을 유지합니다.';
    notice.textContent=text;notice.hidden=false;if(active)announce(text);
  }
  function discardDateDraft(){q('date').setCustomValidity('');if(dateDraftBase!==null){q('date').value=dateDraftBase;dateDraftBase=null;}}
  function menuView(view,{focus=true}={}){
    if(view!=='date')discardDateDraft();
    q('select-panel').dataset.menuView=view;
    for(const name of ['start','date','forecast'])q(name+'-view').hidden=name!==view;
    q('menu-back').hidden=view==='start';q('menu-settings').hidden=view==='forecast';q('menu-settings').setAttribute('aria-expanded',String(view==='forecast'));
    q('menu-title').textContent=({start:'Select bar',date:'Select date',forecast:'예측·평가'})[view];
    q('select-panel').setAttribute('aria-label',({start:'Select bar · 시작 봉 선택',date:'Select date · 새 시작점 선택',forecast:'리플레이 예측·평가 설정'})[view]);
    if(view!=='forecast'){q('detail-panel').hidden=true;q('details').setAttribute('aria-expanded','false');}
    q('select-panel').scrollTop=0;transportHints();
    if(focus){const target=view==='date'?q('date'):view==='forecast'?(externalBacktest?q('details'):q('mode')):q('select-chart').disabled?q('menu-settings'):q('select-chart');target.focus({preventScroll:true});}
  }
  function releaseGesture(){
    const prior=gesture;gesture=null;
    wheelViewport=null;wheelGeometry=null;wheelAt=0;
    if(prior)try{plot.releasePointerCapture?.(prior.id);}catch{}
  }
  const replayAxis=()=>rendered?.getPriceScale?.()??rendered?.axis;
  const navigationGeometry=()=>replayNavigationGeometry(svg,replayAxis());
  function navigationRange(geometry=navigationGeometry()){
    if(!range||!geometry)return null;
    const rows=archive?.observations??[],min=rows[0]?.date??range.start;
    const max=[rows.at(-1)?.date,frame?.forecast?.at(-1)?.date,atlasCaptured?.forecast?.path?.at(-1)?.date,min].filter(Boolean).sort().at(-1);
    return withChartSpacing({min,max,...range,allowEmpty:true,maxSpan:Math.max(6000*(replayFrequency==='weekly'?7:1),day(range.end)-day(range.start)+1),contextKey:symbol+':'+epoch+':'+displayEpoch+':'+replayFrequency+':'+q('mode').value},
      {frequency:replayFrequency,plotWidth:geometry.plot.width});
  }
  function useNavigationRange(next){follow=false;customRange=true;range={start:next.start,end:next.end,...(next.spacingBounds?{spacingBounds:next.spacingBounds}:{})};schedulePaint();}
  // Only the view receives this copy. The captured context, fixed forecasts,
  // stored issue clocks and replay snapshot are never changed by axis gestures.
  const displayedContext=context=>replayPriceDomain===undefined||!context?context:{...context,presentation:{...context.presentation,priceDomain:replayPriceDomain}};
  // A single owner controls every replay popover. Hidden panels cannot retain
  // a modal guard, and a new choice always replaces the previous surface.
  function setOverlay(next){
    releaseGesture();overlay=next;
    q('select-panel').hidden=next!=='menu';q('entry-dialog').hidden=next!=='entry';q('exit-dialog').hidden=next!=='exit';
    q('select-menu').setAttribute('aria-expanded',String(next==='menu'));
    panel.dataset.overlay=next??'none';transportHints();
  }
  function closeMenu(){if(overlay==='menu')setOverlay(null);menuView('start',{focus:false});}
  function focusMenuTrigger(){q(externalBacktest?'mode-badge':'select-menu').focus({preventScroll:true});}
  function updateDateContext(state=getState()){
    const date=state.session?.timeline[state.cursorIndex],visible=date?archive?.observations.findLast(row=>row.date<=date)?.date:null,next=state.session?.timeline[state.cursorIndex+1];
    q('date-context').textContent=state.session?'현재 공개: '+(visible??'없음')+' · 다음 봉: '+(next??'확보한 자료 끝'):'시작점 미확정 · 날짜를 선택해 적용하세요.';
  }
  function openDateView(){
    if(hasChoice())return;
    controller.pause();
    if(dateDraftBase===null)dateDraftBase=q('date').value;
    const state=getState(),date=state.session?.timeline[state.cursorIndex];
    // This editor proposes a new selection; it is neither the saved session's
    // first hidden bar nor the next update. Merely opening it never seeks.
    if(date)q('date').value=nearestOrigin(date)??dateDraftBase;
    updateDateContext(state);
    menuView('date');
  }
  function clearPicker(){svg.querySelector('[data-chart-replay-picker]')?.remove();delete svg.dataset.pickerDate;}
  function closeChoice(){if(hasChoice())setOverlay(null);}
  function requestExit(){
    if(!active||saving)return;
    // The saved-session prompt has no open session to confirm or resume yet.
    // Closing it is cancellation; do not strand an idle toolbar behind Exit.
    if(overlay==='entry')return exit();
    controller.pause();cancelPick({leaveUnconfirmed:false});closeMenu();preserve();setOverlay('exit');
    q('exit-save').checked=Boolean(draft);q('exit-save').disabled=!draft;
    paint(getState());q('exit-confirm').focus({preventScroll:true});
  }
  function requestEntry(){
    if(destroyed||active)return;
    externalBacktest=false;
    const current=getChartState?.()??getAtlasContext?.()??{};
    if(atlasAvailable&&!['daily','weekly'].includes(current.frequency??'daily')){unavailable(current.frequency);return;}
    notice.hidden=true;atlasCaptured=null;atlasCapturedAt=null;draft=null;replayFrequency=current.frequency??'daily';replayWindow=current.window??'focus';customRange=Boolean(current.customRange);
    // Keep the selected mode on return, so its saved capture remains reachable.
    // On first entry only, an absent default-cutoff slot may offer the older
    // generic capture. Invalid or existing records never fall through to it.
    const firstEntry=!entryOpened;entryOpened=true;readStored();
    if(firstEntry&&atlasAvailable&&q('mode').value==='cutoff-backtest'&&storedText===null&&!storageReadError){
      q('mode').value='atlas-chart';readStored();
      if(stored)q('mode').value=stored.mode;
      else if(!storageReadError){q('mode').value=preferredMode;readStored();}
    }
    saveBaseText=storageReadError?undefined:storedText;q('save-status').hidden=true;
    if(stored||storageReadError){activate();setOverlay('entry');savedSummary();
      paint(getState());q('entry-continue').focus({preventScroll:true});return;}
    return open({selectOnly:true});
  }
  function blockSurrounding(on){
    if(on){
      const nodes=[...toolbar.children,...doc.querySelectorAll('.workbench-tools,.workbench-rail,.workbench-axis,.workbench-status,.workbench-event-slot,#workbench-go-date,#workbench-bottom-more,.eth-tools,.eth-bottom,.eth-bottom-bar')];
      for(const node of nodes){if(node===trigger||node.contains(panel)||atlasAvailable&&['workbench-frequency','workbench-chart-type'].includes(node.id))continue;ownedInert.set(node,node.inert);node.inert=true;}
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
  async function exit({saveSession=false}={}){
    if(!active||saving)return;
    if(saveSession){
      saving=true;q('exit-confirm').disabled=true;q('exit-cancel').disabled=true;q('exit-save').disabled=true;
      const token=epoch,ok=await save();
      if(destroyed||!active||token!==epoch)return;
      saving=false;q('exit-confirm').disabled=false;q('exit-cancel').disabled=false;q('exit-save').disabled=false;
      if(!ok)return;
    }
    finishExit();
  }
  // Interactive exit waits for its explicit save; terminal destruction must
  // release DOM ownership synchronously even while that save is pending.
  function finishExit(){
    if(!active)return;
    epoch++;request?.abort();request=null;active=false;saving=false;externalBacktest=false;controller.exit();
    if(paintFrame!==null){win.cancelAnimationFrame(paintFrame);paintFrame=null;}
    releaseGesture();picking=false;pickerDate=null;closeChoice();closeMenu();clearPicker();disposeDrawing();plot.classList.remove('chart-replay-active');plot.style.removeProperty('--chart-replay-controls-height');
    delete svg.dataset.chartReplayActive;delete doc.documentElement.dataset.chartReplayActive;delete doc.documentElement.dataset.chartReplayMode;
    delete plot.dataset.chartReplayMode;plot.classList.remove('chart-replay-atlas');
    for(const key of Object.keys(svg.dataset))if(key.startsWith('replay'))delete svg.dataset[key];
    if(oldLabel!==null)svg.setAttribute('aria-label',oldLabel);
    panel.hidden=true;hud.hidden=true;notice.hidden=true;q('detail-panel').hidden=true;trigger.setAttribute('aria-pressed','false');
    blockSurrounding(false);frame=null;archive=null;atlasCaptured=null;atlasCandles=null;atlasPreview=null;pendingAtlas=null;restoredSnapshot=null;atlasCapturedAt=null;capabilities=null;candleCapabilities=null;draft=null;restore();trigger.focus({preventScroll:true});
  }
  async function open({resume=null,selectOnly=false,startDateOverride=null}={}){
    if(destroyed||saving)return;
    replayPriceDomain=undefined;releaseGesture();suppressClickUntil=0;
    if(readKey!==storageKey()){readStored();saveBaseText=storageReadError?undefined:storedText;draft=null;}
    const current=getChartState?.()??getAtlasContext?.()??{};
    if(!active&&atlasAvailable&&!externalBacktest&&!['daily','weekly'].includes(current.frequency??'daily')){unavailable(current.frequency);return;}
    if(!active){readStored();saveBaseText=storageReadError?undefined:storedText;replayFrequency=current.frequency??'daily';replayWindow=current.window??'focus';customRange=Boolean(current.customRange);}
    if(resume){replayFrequency=['daily','weekly'].includes(resume.frequency)?resume.frequency:replayFrequency;replayWindow=resume.window??replayWindow;customRange=Boolean(resume.customRange);}
    releaseGesture();closeChoice();closeMenu();notice.hidden=true;picking=selectOnly;pickerDate=null;clearPicker();activate();preserve();if(draft?.mode!==q('mode').value)draft=null;const token=++epoch;request?.abort();request=new AbortController();
    disposeDrawing();archive=null;frame=null;record=null;entries=[];range=null;atlasPreview=null;pendingAtlas=null;restoredSnapshot=null;follow=true;controller.open();
    if(resume){q('mode').value=resume.mode;q('horizon').value=String(resume.horizon);if(q('model')&&resume.model)q('model').value=resume.model;}
    const atlasMode=atlasAvailable&&['atlas-chart','project-baseline','cutoff-backtest'].includes(q('mode').value),currentMode=q('mode').value==='atlas-chart',backtestMode=q('mode').value==='cutoff-backtest';
    doc.documentElement.dataset.chartReplayMode=q('mode').value;plot.dataset.chartReplayMode=q('mode').value;
    if(atlasMode)plot.classList.add('chart-replay-atlas');else{plot.classList.remove('chart-replay-atlas');svg.replaceChildren();}
    q('date-label').textContent=atlasMode?'새 시작점 날짜':'예측 기준일 선택';
    q('date').setAttribute('aria-label',atlasMode?'새 시작점 날짜':'리플레이 예측 기준일 선택');
    q('date-hint').textContent=atlasMode?'선택한 날짜부터 실제 봉을 숨깁니다. 「이 날짜 선택」을 눌러야 적용됩니다.':'선택한 날짜까지의 자료로 예측을 고정합니다. 「이 날짜 선택」을 눌러야 적용됩니다.';
    q('horizon').hidden=atlasMode&&!backtestMode;
    q('chart-meaning').textContent=backtestMode?'선택 시작일 전날까지의 Bitstamp 종가만 입력해 예측을 한 번 계산하고 고정합니다. 이후 실제 Bitstamp 종가와 비교하며 현재 전망·현재 차트 주석은 계산과 비교에서 제외합니다.':currentMode?'지금 차트의 주황색 예측선과 범위를 그대로 고정합니다. 그 앞 구간에는 선택한 시작일 전날까지의 가격에 현재 모형을 적용한 별도 회고 경로를 한 번 생성해 고정합니다. 실제 Bitstamp 일봉은 시작일부터 하나씩 공개하며 두 예측은 재생 중 다시 계산하지 않습니다.':atlasMode?'현재 차트의 눈금·표시 기간·사이클 레이어로 첫 보존 전망을 봅니다. 금색 점선과 음영은 당시 조건부 경로이며 재생 중 바뀌지 않습니다. 사이클 표시는 기준일까지의 관측과 그 경로로 고정합니다. 실제 가격은 재생 위치까지만 공개합니다.':'금색 점선은 기준일에 고정한 예측, 실제 가격은 재생 위치까지만 공개합니다. 미래 실제값·사후 고저점·사건·지표는 숨깁니다. 음영은 조건 범위 또는 보정 전 모형 구간이며 적중 확률이 아닙니다.';
    q('evaluation-meaning').textContent=backtestMode?'현재 코드와 보존된 과거 가격으로 재구성한 백테스트입니다. 당시 발행한 예측이나 당시 자료 판본을 입증하지 않습니다. MAPE와 종가 유지 대비 로그오차 개선을 비교하며, 기준 종가 대비 방향 일치는 일일 수익률 적중이나 매매 승률이 아닙니다. 한 경로의 일별 오차는 독립 예측 횟수가 아닙니다.':currentMode?'현재 차트의 가정과 별도 회고 경로는 2026-10-21에 발행한 예측 성적으로 채점하지 않습니다. 회고 경로는 현재 코드와 현재 보존 판본의 과거 가격으로 생성하며, 당시 발행되거나 당시 확보된 자료라는 뜻이 아닙니다. 캔들은 Bitstamp, 모형 입력은 Coin Metrics이므로 제공자도 구분합니다.':atlasMode?'프로젝트 시작은 2026-10-21 한국시간, 당시 완료된 마지막 일봉은 2026-10-20 UTC입니다. 다음 봉부터 10월 21일 실제값을 공개합니다. 첫 커밋에 보존된 3년 전망을 현재 판본의 Coin Metrics 종가와 비교하며, 현재 장기 모형의 과거 실적을 뜻하지 않습니다. 사이클 표시는 현재 표시 규칙으로 그린 주석이며, 당시 화면의 표식이 그대로 보존됐다는 뜻은 아닙니다. 음영은 적중 확률이 아니며 한 경로의 일별 오차는 독립 예측 횟수가 아닙니다.':'과거 재구성은 현재 코드와 보존 판본으로 다시 계산한 연구입니다. 당시 실제 발행한 예측 성적이 아니며, 한 경로의 여러 일봉은 독립 예측 횟수가 아닙니다. 보존 예측도 현재 판본의 시장 날짜 기준 회고 비교입니다.';
    announce('리플레이 자료를 확인하고 있습니다.');
    const signal=request.signal;
    try{
      // Freeze the displayed assumptions before the first asynchronous request.
      // Continue must not depend on today's live forecast being ready or unchanged.
      if(atlasAvailable&&!(currentMode&&resume?.forecastSnapshot)&&!atlasCaptured){
        atlasCaptured=captureReplayView(getAtlasContext());atlasCapturedAt=new Date().toISOString();
      }
      if(currentMode&&resume?.forecastSnapshot){
        const saved=await restoreReplaySnapshot(resume.forecastSnapshot,{outputHash:resume.outputHash,origin:resume.origin,indexedDB:win.indexedDB});
        if(!active||token!==epoch||signal.aborted)return;
        restoredSnapshot=saved;atlasCaptured=saved.view;atlasCapturedAt=saved.capturedAt;
      }
      modules??=await Promise.all([import('./forecast-replay.js?v=1.36.0'),import('./chart-replay-renderer.js'),import('./chart-replay-sources.js')]);
      if(!active||token!==epoch)return;
      if(atlasMode){
        atlasCaptured??=captureReplayView(getAtlasContext());
        if(!atlasCaptured)throw new Error('현재 차트가 준비된 후 봉 리플레이를 다시 눌러 주세요.');
        q('display').value=resume?.chartType??(currentMode?'candles':atlasCaptured.chartType==='candles'?'candles':'line');
        if(typeof loadAtlasRenderer!=='function')throw new Error('현재 차트 리플레이 연결을 확인해 주세요.');
        atlasModules??=await Promise.all([import('./project-replay-baseline.js'),loadAtlasRenderer()]);
        if(!active||token!==epoch)return;
        if(backtestMode){if(typeof loadCutoffModel!=='function')throw new Error('BTC 백테스트 모형 연결을 확인해 주세요.');cutoffModel??=await loadCutoffModel();if(!active||token!==epoch)return;}
        if(currentMode){
          range??={start:atlasCaptured.start,end:atlasCaptured.end};
          prepareAtlasPending(atlasCaptured.forecast.asOf,{confirmed:false});
        }else if(!backtestMode)atlasBaseline=await atlasModules[0].loadProjectReplayBaseline({signal});
        if(!active||token!==epoch)return;
        if(currentMode||backtestMode||q('display').value==='candles')atlasCandles=await modules[2].loadChartReplayArchive(symbol,{mode:'historical-reconstruction',signal});
        if(!active||token!==epoch)return;
      }
      const loadedArchive=currentMode||backtestMode?atlasCandles:await modules[2].loadChartReplayArchive(symbol,{mode:atlasMode?'recorded':q('mode').value,signal});
      if(!active||token!==epoch)return;
      archive=loadedArchive;
      capabilities=modules[0].getReplayIntervalCapabilities?.({...archive,symbol,evaluatedAt:new Date().toISOString()})??null;
      candleCapabilities=atlasCandles?modules[0].getReplayIntervalCapabilities?.({...atlasCandles,symbol,evaluatedAt:new Date().toISOString()})??null:capabilities;
      const candlesOption=q('display').querySelector('[value="candles"]');
      if(!resume?.chartType&&candlesOption.disabled&&archive.source.ohlcAvailable)q('display').value='candles';
      candlesOption.disabled=!atlasMode&&!archive.source.ohlcAvailable;
      if(!atlasMode&&!archive.source.ohlcAvailable)q('display').value='line';
      const rows=archive.observations;
      q('record').hidden=q('mode').value!=='recorded';
      q('date').disabled=q('mode').value==='recorded';q('start').hidden=q('mode').value==='recorded';q('pick').disabled=!historical||q('mode').value==='recorded';
      if(q('model'))q('model').hidden=q('mode').value==='recorded';
      q('source').textContent=archive.source.provider+' · '+archive.observedThrough+'까지 실제 관측 · 수집 '+archive.observedAt+' · 현재 보존 판본';
      if(atlasMode){
        const first=currentMode||backtestMode?atlasModules[0].PROJECT_REPLAY_ORIGIN.startDate:atlasBaseline.forecast.referenceDate;
        q('date').min=backtestMode?cutoffModel.firstCutoffBacktestStart(rows):currentMode?(capabilities?.intervals[replayFrequency]?.firstReplayDate??rows[0].date):first;q('date').max=rows.at(-1).date;
        q('date').value=resume?.startDate??startDateOverride??first;
        q('source').textContent=backtestMode?'예측 입력·실제 비교 모두 Bitstamp 완료 종가 · 확보 '+archive.observedThrough+'까지':currentMode?'현재 차트의 예측선 고정 · 가정 입력 '+atlasCaptured.forecast.asOf+' UTC까지 · 실제 캔들 '+archive.source.provider+' · '+archive.observedThrough+'까지':
          '2026-10-21 첫 커밋의 3년 전망 · 마지막 입력 '+atlasBaseline.forecast.asOf+' UTC · 실제 비교 '+archive.source.provider+' · '+archive.observedThrough+'까지 현재 보존 판본';
        if(selectOnly){
          range={start:atlasCaptured.start,end:atlasCaptured.end};
          if(backtestMode){paint(getState());beginPick();return;}
          const previewOrigin=archive.observedThrough<atlasCaptured.forecast.asOf?archive.observedThrough:atlasCaptured.forecast.asOf;
          const preview=await modules[0].createCurrentChartReplaySession({symbol,observations:archive.observations,observedAt:archive.observedAt,observedThrough:archive.observedThrough,source:archive.source,
            dataset:atlasCaptured.dataset,forecast:atlasCaptured.forecast,asOf:previewOrigin,playbackStartDate:dateAt(day(previewOrigin)+1)});
          if(!active||token!==epoch)return;
          atlasPreview={session:preview,context:atlasModules[1].createAtlasReplayContext({dataset:preview.chartDataset,forecast:preview.chartForecast,presentation:atlasCaptured.presentation,originDate:preview.asOf})};
          paint(getState());beginPick();
        }
        else await start(q('date').value,{resume,automatic:true});
      }else if(q('mode').value==='recorded'){
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
    if(!Number.isFinite(day(value)))return null;
    if(atlasAvailable&&['atlas-chart','project-baseline','cutoff-backtest'].includes(q('mode').value)){
      const allowed=(q('mode').value==='atlas-chart'?(capabilities?.availableDates??rows.map(row=>row.date)):rows.map(row=>row.date)).filter(date=>date>=q('date').min&&date<=q('date').max);
      if(!allowed.length)return null;
      let low=0,high=allowed.length-1;while(low<high){const mid=(low+high)>>1;if(allowed[mid]<value)low=mid+1;else high=mid;}
      if(low>0&&Math.abs(day(allowed[low-1])-day(value))<Math.abs(day(allowed[low])-day(value)))low--;
      return allowed[low];
    }
    let low=0,high=rows.length-1;
    while(low<high){const mid=(low+high)>>1;if(rows[mid].date<value)low=mid+1;else high=mid;}
    if(low>0&&Math.abs(day(rows[low-1].date)-day(value))<Math.abs(day(rows[low].date)-day(value)))low--;
    return rows[clamp(low,minimumOriginIndex,rows.length-2)].date;
  }
  async function start(value,{resume=null,automatic=false}={}){
    if(!active||!archive||!modules)return;
    const source=archive,recorded=q('mode').value==='recorded',selectedRecord=record;
    const atlasMode=atlasAvailable&&['atlas-chart','project-baseline','cutoff-backtest'].includes(q('mode').value),currentMode=q('mode').value==='atlas-chart',backtestMode=q('mode').value==='cutoff-backtest';
    const first=atlasMode?(currentMode||backtestMode?atlasModules[0].PROJECT_REPLAY_ORIGIN.startDate:atlasBaseline.forecast.referenceDate):null;
    const startDate=atlasMode?nearestOrigin(value||first):null;
    const replaySettings={mode:q('mode').value,horizon:Number(q('horizon').value),model:q('model')?.value??null,recordId:recorded?selectedRecord.record.id:null,...(atlasMode?{startDate}:{})};
    const asOf=currentMode||backtestMode?(resume?.origin??(startDate?dateAt(day(startDate)-1):null)):atlasMode?atlasBaseline.forecast.asOf:recorded?record.record.asOf:nearestOrigin(value);if(!asOf)return;
    const restored=currentMode&&resume?restoredSnapshot:null,savedRetrospective=restored?.retrospectiveForecast??null;
    const supplement=currentMode&&Boolean(resume)&&!savedRetrospective,expectedSaveText=saveBaseText;
    if(backtestMode&&resume&&!resume.cutoffForecast){controller.fail(new Error('저장된 백테스트에 고정 예측이 없습니다. 새로 시작을 선택해 주세요.'));return;}
    const resumeIndex=dates=>resume?.cursorDate?Math.max(0,dates.findLastIndex(date=>date<=resume.cursorDate)):clamp(resume?.cursorIndex??0,0,dates.length-1);
    releaseGesture();picking=false;pickerDate=null;clearPicker();closeMenu();notice.hidden=true;
    q('date').value=atlasMode?startDate:asOf;follow=!atlasMode;
    range=atlasMode?(range??{start:atlasCaptured.start,end:atlasCaptured.end}):{start:dateAt(day(asOf)-120),end:dateAt(day(asOf)+Math.min(Number(q('horizon').value),120))};
    if(!atlasMode)customRange=resume?.range?Boolean(resume.customRange):true;
    if(resume?.range&&[resume.range.start,resume.range.end].every(date=>typeof date==='string'&&Number.isFinite(day(date)))&&resume.range.start<resume.range.end)range={start:resume.range.start,end:resume.range.end};
    if(currentMode){
      const pendingDates=[asOf,...source.observations.filter(row=>row.date>asOf&&row.date<=atlasCaptured.forecast.path.at(-1).date).map(row=>row.date)];
      try{prepareAtlasPending(asOf,{confirmed:true,cursorDate:resume?pendingDates[resumeIndex(pendingDates)]:asOf});}
      catch(error){pendingAtlas=null;controller.fail(error);return;}
    }
    const accepted=await controller.selectOrigin(asOf,async({signal})=>{
      const engine=modules[0],options={symbol,observations:source.observations,observedAt:source.observedAt,observedThrough:source.observedThrough,source:source.source,horizonDays:replaySettings.horizon};
      let retrospectiveModel=null;
      if(currentMode){
        if(typeof loadRetrospectiveModel!=='function')throw new Error('BTC 회고 모형 연결을 확인해 주세요.');
        retrospectiveModel=await loadRetrospectiveModel();
        signal.throwIfAborted();
      }
      const session=backtestMode?await engine.createCutoffBacktestReplaySession({...options,cutoffModel,asOf,playbackStartDate:dateAt(day(asOf)+1),modelOptions:{scenario:atlasCaptured?.modelOptions?.scenario??'base',seed:20261022,sampleCount:128,blockDays:28},forecastRecord:resume?.cutoffForecast??null,evaluatedAt:new Date().toISOString()}):currentMode?await engine.createCurrentChartReplaySession({...options,dataset:atlasCaptured.dataset,forecast:atlasCaptured.forecast,asOf,playbackStartDate:dateAt(day(asOf)+1),
          createRetrospective:!savedRetrospective,retrospectiveForecast:savedRetrospective,retrospectiveModel,modelOptions:atlasCaptured.modelOptions??{},
          createdAt:atlasCapturedAt??undefined,evaluatedAt:new Date().toISOString()}):
        atlasMode?await engine.createProjectReplaySession({...options,baseline:atlasBaseline}):
        recorded?await engine.createRecordedReplaySession({...options,record:selectedRecord.record,snapshot:selectedRecord.snapshot}):
        await engine.createHistoricalReplaySession({...options,asOf,modelKey:symbol==='ETHUSD'?replaySettings.model:'shrunken-trend'});
      signal.throwIfAborted();
      if(resume?.outputHash&&session.identity.outputHash!==resume.outputHash)throw new Error('저장된 예측과 현재 차트의 예측이 달라 이어서 재생할 수 없습니다. 기존 저장은 유지됩니다. 새로 시작을 선택해 주세요.');
      const dates=new Set(source.observations.map(row=>row.date));
      // Playback advances by actual observed bars; missing days remain gaps.
      const timeline=session.timeline.filter(date=>date===session.asOf||dates.has(date));
      let atlasContext=restored?restored.atlasContext:atlasMode?
        atlasModules[1].createAtlasReplayContext({dataset:session.chartDataset,forecast:session.chartForecast,presentation:atlasCaptured.presentation,originDate:session.asOf,retrospectiveForecast:session.retrospectiveForecast??null,includeAnnotations:!backtestMode}):null;
      const replaySnapshot=currentMode?(restored?(supplement&&session.retrospectiveForecast?
        await supplementReplaySnapshot(restored,{identity:session.identity,retrospectiveForecast:session.retrospectiveForecast}):restored.snapshot):
        await sealReplaySnapshot({view:atlasCaptured,atlasContext,identity:session.identity,retrospectiveForecast:session.retrospectiveForecast??null})):null;
      if(replaySnapshot)atlasContext=replaySnapshot.atlasContext;
      signal.throwIfAborted();
      return Object.freeze({...session,engineSession:session,autoOpened:automatic,replaySettings:Object.freeze(replaySettings),timeline:Object.freeze(timeline),atlasContext,replaySnapshot});
    },resume?.outputHash?{cursorDate:resume.cursorDate??null,cursorIndex:resume.cursorIndex??0}:{});
    if(!accepted||!active||!getState().session)return;
    if(atlasMode&&!resume){const index=Math.max(0,getState().session.timeline.findLastIndex(date=>date<startDate));if(index>0)controller.seek(index);}
    if(resume){
      if(getState().session.identity.outputHash===resume.outputHash){
        if(CHART_REPLAY_SPEEDS.includes(resume.speed))controller.speed(resume.speed);
        const retrospective=getState().session.retrospectiveForecast;
        announce('저장한 기준과 공개 날짜를 복원했습니다. 일시정지 상태입니다.'+(resume.sourceHash&&resume.sourceHash!==source.source.sourceHash?' 실제 관측 판본은 갱신되었습니다.':'')+
          (retrospective?.status==='unavailable'?' · 회고 경로 없음: '+retrospective.reason:''));
      }
    }
    svg.focus({preventScroll:true});
    if(supplement&&getState().session.retrospectiveForecast&&resume.outputHash===getState().session.identity.outputHash&&typeof expectedSaveText==='string'){
      const owner=getState().session,token=epoch;
      const isCurrent=()=>active&&!destroyed&&epoch===token&&getState().session===owner;
      try{
        // Continue authorizes completion of this saved capture, not a save of
        // newly revealed bars or changed source/range/display preferences.
        const text=await persistReplayDraft(win.localStorage,storageKey(),{...resume,forecastSnapshot:owner.replaySnapshot},
          {indexedDB:win.indexedDB,locks:win.navigator?.locks,expectedText:expectedSaveText,isCurrent});
        if(!isCurrent())return;
        saveBaseText=text;readStored();q('save-status').hidden=true;
      }catch(error){
        if(!isCurrent())return;
        const text=(error?.message??'회고 경로를 저장하지 못했습니다.')+' 현재 회고 경로와 재생 위치는 유지되며 기존 저장은 변경하지 않았습니다.';
        announce(text);q('save-status').textContent=text;q('save-status').hidden=false;
      }
    }
  }
  function prepareAtlasPending(origin,{confirmed,cursorDate=origin}={}){
    if(q('mode').value!=='atlas-chart'||!atlasCaptured||!atlasModules)return;
    pendingAtlas={context:restoredSnapshot?.atlasContext?.originDate===origin?restoredSnapshot.atlasContext:null,confirmed:Boolean(confirmed),cursor:cursorDate,
      session:{asOf:origin,mode:'current-chart-snapshot',chartForecast:atlasCaptured.forecast,identity:{recordKind:'current-chart-snapshot'}}};
  }
  function drawAtlasPending(){
    if(q('mode').value!=='atlas-chart'||!pendingAtlas||!range||!atlasModules)return false;
    const {session,cursor,confirmed}=pendingAtlas;
    const context=pendingAtlas.context??=atlasModules[1].createAtlasReplayContext({dataset:atlasCaptured.dataset,forecast:atlasCaptured.forecast,presentation:atlasCaptured.presentation,originDate:session.asOf});
    // Never retain the previous screen's actuals on reselection: its cursor
    // may be later than the new start. Rebuild only the disclosed prefix.
    const observedRows=(archive?.observations??[]).filter(row=>row.date<=cursor).map(row=>({date:row.date,price:row.price}));
    const displayed=archive?modules[0].buildReplayObservedCandles({...archive,symbol,cursorDate:cursor,frequency:replayFrequency,evaluatedAt:new Date().toISOString()}):null;
    const data={...displayed?.metadata,symbol,frequency:replayFrequency,observedRows,observedCandles:displayed?.candles??[],
      priceSource:archive?.source?.provider??'Bitstamp',candleSource:archive?.source?.provider??'Bitstamp',
      frame:{cursorDate:cursor,inputVisible:true,forecastVisible:true,forecast:context.forecast,retrospectiveForecast:context.retrospectiveForecast?.path??[]}};
    rendered=atlasModules[1].drawAtlasChartReplay({svg,session,data,...range,chartType:q('display').value,context:displayedContext(context),onInspect:()=>{},selectionPreview:!confirmed});
    // Disable hover/inspection of a pending frame; it is not a verified session.
    const axis=rendered.getPriceScale?.();disposeDrawing();
    svg.dataset.replayPending='true';
    onAtlasFrame({session,data,...range,chartType:q('display').value,context,frequency:replayFrequency,window:replayWindow,customRange,axis});
    return true;
  }
  function onInspect(value){
    if(!active||!value||painting)return;
    const date=typeof value==='string'?value:value.date;
    if(picking||getState().status==='selecting'){
      const selected=nearestOrigin(date);if(selected){pickerDate=selected;inspect.textContent=selected+' · ✂ 클릭하면 이 날짜부터 실제 봉을 숨기고 선택을 확정합니다.';showPickLine(selected);}
    }else inspect.textContent=inspectionText(value);
  }
  function inspectionText(value){
    const actual=Object.hasOwn(value,'actual')?value.actual:value.price;
    const separate=value.candle&&value.source&&value.candleSource&&value.source!==value.candleSource;
    const candle=value.candle,ohlc=candle?' · O '+price(candle.open)+' H '+price(candle.high)+' L '+price(candle.low)+' C '+price(candle.close):'';
    const forming=candle&&replayFrequency==='weekly'?' · '+(candle.complete?'완료 주봉':'형성 중 주봉 · '+candle.daysIncluded+'일 공개'):'';
    const predictionLabel=value.predictedKind==='retrospective'?'회고 예측 고정':'고정 예측';
    return value.date+' · '+(separate?'평가 종가 ('+value.source+') '+price(actual)+' · 캔들 종가 ('+value.candleSource+') '+price(value.candle.close):'실제 '+price(actual))+ohlc+forming+' · '+predictionLabel+' '+price(value.predicted);
  }
  function showPickLine(date){
    if(!rendered?.x||!rendered?.axis)return;
    clearPicker();if(!range||date<range.start||date>range.end)return;
    const group=doc.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('data-chart-replay-picker','true');group.setAttribute('pointer-events','none');group.setAttribute('aria-label','시작점 미리보기 · 아직 확정하지 않음');
    const line=doc.createElementNS('http://www.w3.org/2000/svg','line'),label=doc.createElementNS('http://www.w3.org/2000/svg','text');
    const x=rendered.x(date);for(const [key,value]of Object.entries({x1:x,x2:x,y1:rendered.axis.top,y2:rendered.axis.bottom}))line.setAttribute(key,String(value));
    line.setAttribute('class','chart-replay-picker');label.setAttribute('class','chart-replay-picker-label');label.setAttribute('data-chart-replay-scissors','true');
    const right=Number.isFinite(rendered.axis.right)&&x>rendered.axis.right-180;label.setAttribute('x',String(x+(right?-6:6)));label.setAttribute('text-anchor',right?'end':'start');label.setAttribute('y',String(Math.min(rendered.axis.bottom-12,rendered.axis.top+72)));label.textContent='✂ '+date+' · 선택 전';
    group.append(line,label);svg.append(group);svg.dataset.pickerDate=date;
  }
  function beginPick(){
    if(!active||hasChoice()||!archive||q('mode').value==='recorded')return;
    controller.pause();releaseGesture();picking=true;pickerDate=null;closeMenu();clearPicker();paint(getState());svg.focus({preventScroll:true});
  }
  function cancelPick({leaveUnconfirmed=true}={}){
    if(!picking)return;releaseGesture();picking=false;pickerDate=null;clearPicker();q('pick').setAttribute('aria-pressed','false');q('pick-cancel').hidden=true;delete svg.dataset.replaySelecting;
    if(leaveUnconfirmed&&!getState().session){exit();return;}
    if(active)paint(getState());
  }
  function selectionRenderer(){
    const source=getChartRenderer?.(),axis=source?.getPriceScale?.();if(!axis||!range)return null;
    const width=svg.viewBox?.baseVal?.width||svg.clientWidth||svg.getBoundingClientRect().width;
    return {axis,x:date=>axis.left+(day(date)-day(range.start))/Math.max(1,day(range.end)-day(range.start))*(axis.right-axis.left),
      dateAt:clientX=>{const rect=svg.getBoundingClientRect(),local=(clientX-rect.left)/Math.max(1,rect.width)*width;return dateAt(day(range.start)+clamp((local-axis.left)/Math.max(1,axis.right-axis.left),0,1)*(day(range.end)-day(range.start)));},
      destroy(){}};
  }
  function paint(state){
    if(!active||destroyed)return;
    transportHints();
    panel.dataset.state=state.status;svg.dataset.replayStatus=state.status;
    const ready=Boolean(state.session),playing=state.status==='playing',backtest=q('mode').value==='cutoff-backtest';
    compactScore.hidden=!backtest||!ready;
    seriesKey.textContent=backtest?'파랑 · 기준시점 고정 예측 / '+(q('display').value==='candles'?'캔들':'실선')+' · 실제 가격':q('mode').value==='atlas-chart'?'주황 · 현재 예측선 / 파랑 · 회고선 (채점 제외)':'';
    q('mode-badge').textContent=externalBacktest?'월말 고정본':backtest?'기준시점 백테스트':q('mode').value==='atlas-chart'?'현재선 비교':'예측 비교';
    q('mode-badge').disabled=hasChoice();q('result').hidden=!backtest;q('result').disabled=!ready||hasChoice()||picking||state.status==='selecting';
    setChartLoading(svg.parentElement,!ready&&state.status==='loading'&&!pendingAtlas,'리플레이 자료 로딩');
    const blocked=hasChoice()||picking||state.status==='selecting';
    updateDateContext(state);
    q('export').disabled=true;
    if(!ready){
      inspect.textContent='';q('metric').textContent='';q('detail-metric').textContent='';
      q('model-label').textContent=state.status==='error'?'예측을 생성하지 않았습니다.':'선택한 기준의 예측을 준비합니다.';
      for(const key of Object.keys(svg.dataset))if(key.startsWith('replay')&&key!=='replayStatus')delete svg.dataset[key];
    }
    q('play').disabled=!playing&&(blocked||!ready||state.cursorIndex>=state.length-1);q('first').disabled=blocked||!ready||state.cursorIndex===0;q('next').disabled=blocked||!ready||state.cursorIndex>=state.length-1;q('scrub').disabled=blocked||!ready;
    q('speed').value=String(state.speed);q('speed').title=speedMeaning(state.speed)+' · 실제 일봉 한 개씩 공개';q('speed').disabled=hasChoice();
    q('speed-meaning').textContent='속도 '+state.speed+'× · '+speedMeaning(state.speed);q('live').disabled=blocked||!ready;
    q('pick').setAttribute('aria-pressed',String(picking));q('pick-cancel').hidden=!picking;
    if(picking)svg.dataset.replaySelecting='true';else delete svg.dataset.replaySelecting;
    q('play').innerHTML=playing?pauseIcon():playIcon();q('play').setAttribute('aria-label',playing?'리플레이 일시정지':'리플레이 재생');q('play').title=(playing?'일시정지':'재생')+' · Shift + ↓';q('play').setAttribute('aria-pressed',String(playing));
    q('scrub').max=String(Math.max(0,state.length-1));q('scrub').value=String(state.cursorIndex);
    q('start').disabled=hasChoice()||!archive||state.status==='loading';
    q('pick').disabled=hasChoice()||!archive||state.status==='loading'||q('mode').value==='recorded';q('select-menu').disabled=hasChoice();
    for(const name of ['select-chart','select-date','select-random','select-first'])q(name).disabled=q('pick').disabled;
    for(const name of ['mode','display','horizon','model','record','date'])if(q(name))q(name).disabled=hasChoice()||(name==='date'&&q('mode').value==='recorded');
    if(externalBacktest)for(const name of ['select-menu','pick','start','mode','horizon','model','record','date','select-chart','select-date','select-random','select-first'])if(q(name))q(name).disabled=true;
    const adaptiveUnavailable=state.status==='error'&&symbol==='ETHUSD'&&q('mode').value==='historical-reconstruction'&&q('model')?.value==='adaptive'&&state.error==='ETH adaptive model needs at least 30 causally classified returns in each state';
    q('pooled-retry').hidden=!adaptiveUnavailable;
    if(state.status==='error'){
      disposeDrawing();frame=null;inspect.textContent='';q('cursor').textContent=adaptiveUnavailable?'예측 준비 조건 미충족':'리플레이 오류';q('metric').textContent='';q('detail-metric').textContent='';
      for(const key of Object.keys(svg.dataset))if(key.startsWith('replay')&&key!=='replayStatus')delete svg.dataset[key];
      let retained=false;try{retained=drawAtlasPending();if(!retained)svg.replaceChildren();}catch{svg.replaceChildren();}
      if(retained)q('model-label').textContent='현재 예측선 보존 · 실제 리플레이 준비 실패';
      const reason=adaptiveUnavailable?'선택 기준일까지 확정된 상승·하락 수익률 표본이 각 30개 이상 필요합니다. 날짜를 바꾸거나 통합 변동성 모형으로 같은 날짜를 비교해 주세요.':state.error+' · 시작점 또는 예측 종류를 다시 선택해 주세요.';
      announce(reason+(retained?' · 현재 예측선과 범위는 그대로 유지합니다.':''));return;
    }
    if(!modules||!archive)return;
    try{
      painting=true;
      disposeDrawing();
      if(state.status==='selecting'){
        if(!range)return;
        const selectingAtlas=atlasAvailable&&['atlas-chart','project-baseline'].includes(q('mode').value);
        if(selectingAtlas&&atlasPreview){
          const previewData={...modules[0].buildReplayChartData(atlasPreview.session,{cursorDate:archive.observedThrough,clockMode:'observed-date',frequency:replayFrequency}),symbol,priceSource:archive.source.provider,candleSource:archive.source.provider};
          rendered=atlasModules[1].drawAtlasChartReplay({svg,session:atlasPreview.session,data:previewData,...range,chartType:q('display').value,context:displayedContext(atlasPreview.context),onInspect,selectionPreview:true});
          onAtlasFrame({session:atlasPreview.session,data:previewData,...range,chartType:q('display').value,context:atlasPreview.context,frequency:replayFrequency,window:replayWindow,customRange,axis:rendered.getPriceScale?.()});
        }else rendered=selectingAtlas?selectionRenderer():modules[1].drawReplaySelection({svg,observations:archive.observations,...range,symbol,source:archive.source.provider,chartType:q('display').value,frequency:replayFrequency,priceDomain:replayPriceDomain,onInspect});
        frame=null;q('metric').textContent='';q('cursor').textContent='시작 봉 선택';
        announce(symbol+' · ✂ 파란 가위선은 선택 미리보기입니다. 클릭 또는 날짜 선택으로 확정하세요.');
        q('model-label').textContent=backtest?'기준시점 백테스트 · 시작점 선택 중':selectingAtlas?'현재 주황색 예측선 고정 · 시작점 선택 중':symbol==='BTCUSD'?'BTC 축소 추세 기준모형 · 과거 재구성':'ETH 가격 모형 · 과거 재구성';
        svg.dataset.replaySelecting='true';if(pickerDate)showPickLine(pickerDate);return;
      }
      if(!ready){if(!drawAtlasPending())svg.replaceChildren();frame=null;announce(q('mode').value==='atlas-chart'?'현재 예측선을 유지하며 선택한 시작점의 실제 봉을 확인하고 있습니다.':'기준일까지의 자료로 예측을 고정하고 있습니다.');return;}
      const session=state.session.engineSession,date=state.session.timeline[state.cursorIndex];
      if(follow&&day(date)>day(range.end)-20){const width=day(range.end)-day(range.start);range={start:dateAt(day(date)+40-width),end:dateAt(day(date)+40)};}
      const data=modules[0].buildReplayChartData(session,{cursorDate:date,clockMode:'observed-date',frequency:replayFrequency});frame=data.frame;
      const atlasMode=Boolean(state.session.atlasContext),currentMode=session.mode==='current-chart-snapshot';
      const chartData={...data,symbol,priceSource:archive.source.provider,candleSource:archive.source.provider};
      if(atlasMode&&atlasCandles&&!currentMode){
        const display=modules[0].buildReplayObservedCandles({...atlasCandles,symbol,cursorDate:date,frequency:replayFrequency,evaluatedAt:session.evaluatedAt});
        Object.assign(chartData,display.metadata);chartData.observedCandles=display.candles;
        chartData.candleSource=atlasCandles.source.provider;
      }
      if(session.mode==='project-baseline')q('source').textContent='2026-10-21 첫 커밋의 3년 전망 · 성적 비교 '+archive.source.provider+' 종가 · '+archive.observedThrough+'까지 현재 보존 판본'+
        (q('display').value==='candles'&&atlasCandles?' · 표시 캔들 '+atlasCandles.source.provider+' 실제 OHLC (성적의 종가와 제공자 다름)':'');
      rendered=atlasMode?atlasModules[1].drawAtlasChartReplay({svg,session,data:chartData,...range,chartType:q('display').value,context:displayedContext(state.session.atlasContext),onInspect,selectionPreview:picking}):
        modules[1].drawChartReplay({svg,session,data:chartData,...range,chartType:q('display').value,priceDomain:replayPriceDomain,onInspect});
      delete svg.dataset.replayPending;
      if(currentMode)pendingAtlas={context:state.session.atlasContext,session,cursor:date,confirmed:true};
      svg.dataset.replayOutputHash=session.identity.outputHash;svg.dataset.replayComparisonMode=session.mode;svg.dataset.replayOrigin=session.asOf;
      if(state.session.replaySnapshot){svg.dataset.replaySnapshotHash=state.session.replaySnapshot.digest;svg.dataset.replaySnapshotCapturedAt=state.session.replaySnapshot.capturedAt;}
      else{delete svg.dataset.replaySnapshotHash;delete svg.dataset.replaySnapshotCapturedAt;}
      if(atlasMode){svg.dataset.replayStartDate=state.session.replaySettings.startDate;svg.dataset.replayForecastOrigin=session.identity.forecastOriginDate??session.asOf;}
      svg.dataset.replayFrequency=replayFrequency;svg.dataset.replayUpdateInterval='daily';
      svg.dataset.replayCursor=date;svg.dataset.replayActualThrough=frame.actual.at(-1)?.date??session.asOf;
      const forecastOrigin=session.identity.forecastOriginDate??session.asOf;
      const firstForecast=session.forecast.find(row=>row.date>forecastOrigin)?.date??'없음';
      const retrospective=session.retrospectiveForecast,retrospectiveReady=retrospective?.status==='ready';
      const forecastDates=new Set([...session.forecast.filter(row=>row.date>forecastOrigin),...(frame.retrospectiveForecast??[]).filter(row=>row.date>session.asOf)].map(row=>row.date));
      const overlap=chartData.observedRows.filter(row=>forecastDates.has(row.date)).length;
      svg.dataset.replayActualArchiveThrough=archive.observedThrough;svg.dataset.replayOverlapCount=String(overlap);
      const retrospectiveNote=retrospectiveReady?' · 회고 입력 '+retrospective.asOf+'까지 · 회고 표시 '+retrospective.path[0].date+'–'+retrospective.path.at(-1).date+' · 회고 생성 '+retrospective.createdAt:retrospective?.status==='unavailable'?' · 회고 경로 없음: '+retrospective.reason:'';
      const coverage='현재 예측 기준 '+forecastOrigin+' · 미래 구간 시작 '+firstForecast+retrospectiveNote+' · 실제 자료 끝 '+archive.observedThrough+' · 공개된 시각 비교 '+overlap+'일'+(overlap===0?' (날짜가 겹치는 실제 봉 대기)':'');
      const m=frame.metrics;compactScore.textContent=backtest?'MAPE '+percent(m.meanAbsolutePercentageError)+' · '+m.matchedCount+'/'+(session.forecast.length-1)+'일 비교':'';q('cursor').textContent=date+' · '+state.cursorIndex+'/'+(state.length-1)+'일 업데이트';q('scrub').setAttribute('aria-valuetext',date);
      q('metric').textContent=backtest?'MAPE '+percent(m.meanAbsolutePercentageError)+' · '+m.matchedCount+'개 비교':currentMode?'현재 예측선 고정 · 실제 '+state.cursorIndex+'봉':'오차 '+percent(m.meanAbsolutePercentageError)+' · '+m.matchedCount+'개';
      q('detail-metric').textContent=backtest?'입력 마감 '+session.asOf+' · 이후 공개 실제 '+date+'까지 · 비교 '+m.matchedCount+'/'+(session.forecast.length-1)+'일 · 미공개·미확보 '+(session.forecast.length-1-m.matchedCount)+'일 · MAPE '+percent(m.meanAbsolutePercentageError)+' · 종가 유지 대비 로그오차 개선 '+percent(m.skillVersusFlat)+' · 기준 종가 대비 방향 일치 '+percent(m.directionAccuracy)+' ('+m.directionCorrectCount+'/'+m.directionCount+')':currentMode?'이 화면은 고정 예측선과 실제 캔들의 시각 비교입니다. 캡처 '+(state.session.replaySnapshot?.capturedAt??session.identity.createdAt)+' · '+coverage+' · 경로·범위·표식을 함께 보존합니다. 현재 전망을 프로젝트 시작일에 미리 발행한 예측으로 채점하지 않습니다.':'평균 절대 % 오차 '+percent(m.meanAbsolutePercentageError)+' · 가격 유지 대비 개선 '+percent(m.skillVersusFlat)+' · 방향 일치 '+percent(m.directionAccuracy)+' · 비교 '+m.matchedCount+'개 일봉. 개선율은 양수일 때 가격 유지 기준보다 유리합니다. 결과 대기 '+m.pendingTargetCount+'개 / 관측 미확보 '+m.missingTargetCount+'개 목표.';
      q('model-label').textContent=backtest?'기준시점 백테스트 · Bitstamp 종가':(currentMode?'현재 차트의 가정 고정 · ':session.mode==='project-baseline'?'프로젝트 시작일 보존 전망 · ':session.mode==='recorded'?'보존 예측 · ':'과거 재구성 · ')+(session.historicalModel?.label??session.identity.pointLabel??session.identity.modelVersion);
      if(!atlasMode&&!data.ohlcAvailable){q('display').value='line';q('display').querySelector('[value="candles"]').disabled=true;}else q('display').querySelector('[value="candles"]').disabled=false;
      if(atlasAvailable){
        const axis=rendered.getPriceScale?.()??rendered.axis;
        const context=state.session.atlasContext??{presentation:{scale:axis?.scale??'log',unit:'usd',band:true,showTurns:false,showHistoricalEvents:false,showCycleMarkers:false,showCycleIntervals:false}};
        onAtlasFrame({session,data:chartData,...range,chartType:q('display').value,context,frequency:replayFrequency,window:replayWindow,customRange,axis});
      }
      const label={paused:'일시정지',playing:'재생 중',ended:'확보한 실제 봉까지 재생 완료'}[state.status]??'';
      announce(backtest?'기준시점 백테스트 · 입력 '+session.asOf+'까지 · 실제 '+date+'까지 · '+label+' · MAPE '+percent(m.meanAbsolutePercentageError)+' · '+m.matchedCount+'개 비교':atlasMode?'시작 '+state.session.replaySettings.startDate+' · '+intervalName(replayFrequency)+' / 업데이트 Auto 1일 · 실제 '+date+'까지 · '+label+' · '+(currentMode?'현재 주황색 예측선 고정'+(retrospectiveReady?' · 회고 예측 고정 (입력 '+retrospective.asOf+')':retrospective?.status==='unavailable'?' · 회고 경로 없음: '+retrospective.reason:''):'10월 21일 당시 전망'):
        symbol+' · '+intervalName(replayFrequency)+' / 업데이트 1일 · '+label+' · 예측 기준 '+session.asOf+' · '+(session.mode==='recorded'?'보존 경로':'과거 재구성'));
      const point=frame.selected,retrospectivePoint=(frame.retrospectiveForecast??[]).find(row=>row.date===date);
      inspect.textContent=inspectionText({date,actual:point.actual??chartData.observedRows?.findLast(row=>row.date===date)?.price??null,predicted:point.predicted??retrospectivePoint?.price??null,predictedKind:point.predicted!==null?'original':retrospectivePoint?'retrospective':null,
        source:chartData.priceSource,candleSource:chartData.candleSource,candle:q('display').value==='candles'?chartData.observedCandles?.findLast(row=>row.date===date):null});
      q('export').disabled=hasChoice()||picking;
      if(picking){announce('✂ 시작점 선택 중 · 파란 선을 클릭하면 그 날짜부터 실제 봉을 숨깁니다. Esc로 취소합니다.');if(pickerDate)showPickLine(pickerDate);}
      if(state.status!=='playing'||Date.now()-lastSave>1000)preserve();
    }catch(error){controller.fail(error);}finally{painting=false;}
  }
  function schedulePaint(){if(!active||paintFrame!==null)return;paintFrame=win.requestAnimationFrame(()=>{paintFrame=null;paint(getState());});}
  function resize(){if(active){transportHints();schedulePaint();}}
  function toggle(){
    // Pause must remain reachable from every open menu and focused editor.
    if(getState().status==='playing'){controller.pause();return;}
    if(hasChoice()||picking||getState().status==='selecting')return;
    controller.play();
  }
  function chooseStart(value){
    if(hasChoice()||!archive)return;const selected=q('mode').value==='recorded'?value:nearestOrigin(value);if(!selected)return;
    if(atlasAvailable&&['atlas-chart','project-baseline','cutoff-backtest'].includes(q('mode').value)&&range&&(selected<range.start||selected>range.end)){
      const width=Math.max(14,day(range.end)-day(range.start)),left=day(selected)-Math.min(120,width*.2);range={start:dateAt(left),end:dateAt(left+width)};customRange=true;
    }
    return start(selected);
  }
  function chooseEnteredDate(){
    const input=q('date');if(hasChoice()||!archive||input.disabled)return;
    const value=input.value,parsed=day(value);
    let message='';
    if(!value)message='시작 날짜를 입력해 주세요.';
    else if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-')||!Number.isFinite(parsed)||dateAt(parsed)!==value)message='올바른 날짜를 입력해 주세요.';
    else if((input.min&&value<input.min)||(input.max&&value>input.max))message='선택 가능한 날짜는 '+input.min+'부터 '+input.max+'까지입니다.';
    input.setCustomValidity(message);
    if(message||!input.checkValidity()){
      input.reportValidity();return;
    }
    return chooseStart(value);
  }
  function randomStart(){
    if(!archive||hasChoice())return;
    if(atlasAvailable&&['atlas-chart','project-baseline','cutoff-backtest'].includes(q('mode').value)){
      const dates=(q('mode').value==='atlas-chart'?(capabilities?.availableDates??archive.observations.map(row=>row.date)):archive.observations.map(row=>row.date)).filter(date=>date>=q('date').min&&date<=q('date').max);
      if(dates.length)return chooseStart(dates[Math.floor(Math.random()*dates.length)]);
    }else{const rows=archive.observations,index=minimumOriginIndex+Math.floor(Math.random()*Math.max(1,rows.length-minimumOriginIndex-1));return chooseStart(rows[index].date);}
  }
  function handleChartCommand({action,value}={}){
    if(!active||!atlasAvailable)return false;
    if(hasChoice()){announce('먼저 리플레이 대화상자에서 계속할 작업을 선택해 주세요.');return true;}
    if(action==='frequency'){
      if(!['daily','weekly'].includes(value)){controller.pause();paint(getState());unavailable(value);return true;}
      if(candleCapabilities?.intervals[value]?.supported===false&&q('display').value==='candles'){controller.pause();paint(getState());notice.textContent=intervalName(value)+'에 필요한 실제 OHLC가 없습니다. 현재 '+intervalName(replayFrequency)+'을 유지합니다.';notice.hidden=false;announce(notice.textContent);return true;}
      controller.pause();replayFrequency=value;notice.hidden=true;
      if(q('mode').value==='atlas-chart'&&capabilities?.intervals[value]?.firstReplayDate)q('date').min=capabilities.intervals[value].firstReplayDate;
      paint(getState());return true;
    }
    if(action==='span'||action==='fit'){
      if(!atlasCaptured||!getState().session&&!atlasPreview){announce('리플레이 자료가 준비된 뒤 표시 기간을 바꿀 수 있습니다.');return true;}
      const span=action==='fit'?'focus':value;
      if(!['focus','near','all','history'].includes(span))return true;
      if(resolveAtlasRange){range=resolveAtlasRange(span,atlasCaptured);replayWindow=span;customRange=false;follow=false;paint(getState());}
      return true;
    }
    if(action==='chart-type'){
      if(!['line','candles'].includes(value))return true;q('display').value=value;void q('display').onchange();return true;
    }
    // Unowned live commands must never mutate a paused replay's model, data,
    // or the workspace that will be restored when replay ends.
    announce('이 설정은 리플레이를 종료한 뒤 바꿀 수 있습니다.');return true;
  }
  trigger.onclick=()=>{if(active)requestExit();else void requestEntry();};q('exit').onclick=requestExit;
  q('live').onclick=()=>{if(!hasChoice()&&!picking&&getState().session)requestExit();};q('pick').onclick=beginPick;q('pick-cancel').onclick=cancelPick;
  q('mode-badge').onclick=()=>{if(hasChoice())return;setOverlay('menu');menuView('forecast');};
  q('result').onclick=()=>{if(q('mode').value!=='cutoff-backtest'||hasChoice()||picking)return;controller.pause();const s=getState().session;if(s){range={start:dateAt(day(s.asOf)-45),end:dateAt(day(s.forecast.at(-1).date)+14)};customRange=true;follow=false;}controller.seek(Math.max(0,getState().length-1));};
  q('start').onclick=()=>void chooseEnteredDate();q('date').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void chooseEnteredDate();}};
  q('date').oninput=()=>q('date').setCustomValidity('');
  q('play').onclick=toggle;q('first').onclick=()=>controller.seek(0);q('next').onclick=()=>controller.step(1);
  q('speed').onchange=()=>controller.speed(Number(q('speed').value));q('display').onchange=async()=>{
    const displayToken=++displayEpoch;
    if(getState().session?.atlasContext&&q('display').value==='candles'&&!atlasCandles){
      const token=epoch;
      try{const candles=await modules[2].loadChartReplayArchive(symbol,{mode:'historical-reconstruction',signal:request?.signal});if(!active||token!==epoch||displayToken!==displayEpoch)return;atlasCandles=candles;candleCapabilities=modules[0].getReplayIntervalCapabilities?.({...candles,symbol,evaluatedAt:new Date().toISOString()})??null;}
      catch(error){if(active&&token===epoch&&displayToken===displayEpoch)controller.fail(error);return;}
    }
    paint(getState());
  };
  q('pooled-retry').onclick=()=>{const state=getState();if(q('pooled-retry').hidden||state.status!=='error'||!state.origin)return;q('model').value='pooled';void start(state.origin);};
  q('scrub').oninput=()=>controller.seek(Number(q('scrub').value));
  // A settings change reloads the preview; only a start action may confirm it.
  // Preserve an open picker even when it was entered from a committed session.
  for(const key of ['mode','model'])if(q(key))q(key).onchange=()=>{if(!externalBacktest)void open({selectOnly:picking||!getState().session});};
  q('horizon').onchange=()=>{if(!externalBacktest)void open({selectOnly:picking||!getState().session,startDateOverride:getState().session?.replaySettings?.startDate??null});};
  q('record').onchange=()=>void open({resume:{...stored,recordId:q('record').value,mode:'recorded',horizon:Number(q('horizon').value),cursorIndex:0,outputHash:null}});
  q('select-menu').onclick=()=>{if(hasChoice())return;const show=overlay!=='menu';closeMenu();if(show){setOverlay('menu');menuView('start');}};
  q('select-close').onclick=()=>{closeMenu();focusMenuTrigger();};
  q('menu-back').onclick=()=>menuView('start');q('menu-settings').onclick=()=>menuView('forecast');
  q('select-chart').onclick=beginPick;q('select-date').onclick=openDateView;
  q('select-random').onclick=()=>{closeMenu();void randomStart();};q('select-first').onclick=()=>{closeMenu();void chooseStart(q('date').min);};
  q('select-panel').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();focusMenuTrigger();return;}
    if(event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const nodes=['select-chart','select-date','select-random','select-first'].map(q).filter(node=>!node.disabled),index=nodes.indexOf(doc.activeElement);
    if(index<0)return;event.preventDefault();event.stopPropagation();const next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(event.key==='ArrowUp'?-1:1)+nodes.length)%nodes.length;nodes[next].focus();});
  const dismissMenu=event=>{if(active&&!q('select-panel').hidden&&!panel.contains(event.target))closeMenu();};
  doc.addEventListener('pointerdown',dismissMenu,true);
  q('entry-continue').onclick=()=>{readStored();savedSummary();if(!stored||storageReadError)return;saveBaseText=storedText;const saved={...stored};closeChoice();void open({resume:saved});};
  q('entry-new').onclick=()=>{readStored();saveBaseText=storageReadError?undefined:storedText;closeChoice();if(atlasAvailable)q('mode').value=preferredMode;void open({selectOnly:true});};
  q('entry-cancel').onclick=()=>exit();
  q('exit-confirm').onclick=()=>exit({saveSession:q('exit-save').checked});
  q('exit-cancel').onclick=()=>{closeChoice();paint(getState());svg.focus({preventScroll:true});};
  q('details').onclick=()=>{q('detail-panel').hidden=!q('detail-panel').hidden;q('details').setAttribute('aria-expanded',String(!q('detail-panel').hidden));};
  q('hide-details').onclick=()=>{q('detail-panel').hidden=true;q('details').setAttribute('aria-expanded','false');q('details').focus();};
  q('export').onclick=()=>{
    const session=getState().session;if(!frame||!session)return;
    const payload={kind:'atlas-visible-chart-replay',schemaVersion:1,identity:session.identity,mode:session.mode,source:archive.source,frame,
      ...(session.retrospectiveForecast?{retrospectiveForecast:session.retrospectiveForecast}:{}),
      ...(session.cutoffForecast?{cutoffForecast:session.cutoffForecast}:{}),
      ...(session.replaySnapshot?{fixedCapture:{digest:session.replaySnapshot.digest,capturedAt:session.replaySnapshot.capturedAt,meaning:session.replaySnapshot.meaning,publicationTimeProven:false}}:{})};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}));
    const link=doc.createElement('a');link.href=url;link.download='atlas-chart-replay-'+symbol+'-'+frame.cursorDate+'.json';link.click();win.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  function pointer(event){
    if(event.type==='lostpointercapture'){if(gesture?.id===event.pointerId)releaseGesture();return;}
    if(!active||event.target.closest?.('.chart-replay-controls,.chart-replay-hud,.chart-replay-notice'))return;
    if(!svg.contains(event.target)&&event.target!==plot)return;
    event.stopImmediatePropagation();
    if(hasChoice()){event.preventDefault();return;}
    if(event.type==='pointerdown'){
      if(event.button!==0||event.isPrimary===false)return;
      const geometry=navigationGeometry(),start=navigationRange(geometry);if(!geometry||!start)return;
      const kind=insideReplayRegion(event,geometry.price)?'price':insideReplayRegion(event,geometry.time)?'time-scale':insideReplayRegion(event,geometry.plot)?'plot':null;
      if(!kind)return;releaseGesture();suppressClickUntil=0;event.preventDefault();
      gesture={kind,x:event.clientX,y:event.clientY,start,moved:false,id:event.pointerId,geometry,axis:replayAxis(),pointerType:event.pointerType,
        anchor:event.ctrlKey?clamp((event.clientX-geometry.plot.left)/geometry.plot.width,0,1):1};
      plot.setPointerCapture?.(event.pointerId);svg.focus({preventScroll:true});
    }else if(event.type==='pointermove'){
      // A lost mouse-up/capture must not leave future hover in the drag branch.
      if(gesture&&event.buttons===0&&event.pointerType!=='touch')releaseGesture();
      if(gesture?.start){
        if(event.pointerId!==gesture.id)return;
        const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
        if((gesture.kind==='price'?Math.abs(dy):gesture.kind==='time-scale'?Math.abs(dx):Math.hypot(dx,dy))>(gesture.kind==='plot'?7:3))gesture.moved=true;
        if(gesture.moved){
          event.preventDefault();
          if(gesture.kind==='price'){
            replayPriceDomain=scalePriceDomain(gesture.axis,Math.exp(clamp(dy/gesture.geometry.price.height,-1.5,1.5)*2));schedulePaint();
          }else if(gesture.kind==='time-scale')useNavigationRange(zoomRange(gesture.start,Math.exp(clamp(dx/gesture.geometry.time.width,-2,2)*2),gesture.anchor));
          else{
            if(gesture.geometry.price&&Math.abs(dy)>3)replayPriceDomain=panPriceDomain(gesture.axis,dy/gesture.geometry.price.height);
            useNavigationRange(panRange(gesture.start,-dx/gesture.geometry.plot.width));
          }
        }
      }else if((picking||getState().status==='selecting')&&insideReplayRegion(event,navigationGeometry()?.plot)){const date=(rendered?.barDateAt??rendered?.dateAt)?.(event.clientX);if(date)onInspect(date);}
      else if(rendered?.previewPointer)rendered.previewPointer(event);
    }else if(event.type==='pointerup'||event.type==='pointercancel'){
      if(gesture&&event.pointerId!==gesture.id)return;
      const prior=gesture;gesture=null;if(prior)try{plot.releasePointerCapture?.(prior.id);}catch{}
      if(prior?.moved)suppressClickUntil=Date.now()+250;
      if(event.type==='pointerup'&&prior?.kind==='plot'&&!prior.moved&&(picking||getState().status==='selecting')){const date=(rendered?.barDateAt??rendered?.dateAt)?.(event.clientX);if(date)void chooseStart(date);}
    }else if(event.type==='pointerleave'&&!gesture){pickerDate=null;clearPicker();}
  }
  const pointerTypes=['pointerdown','pointermove','pointerup','pointercancel','pointerleave','lostpointercapture'];for(const type of pointerTypes)plot.addEventListener(type,pointer,{capture:true,passive:false});
  function blockChoiceClick(event){if(active&&(hasChoice()||Date.now()<suppressClickUntil)&&(svg.contains(event.target)||event.target===plot)){event.preventDefault();event.stopImmediatePropagation();}}
  plot.addEventListener('click',blockChoiceClick,true);
  function wheel(event){
    if(!active||event.target.closest?.('.chart-replay-controls'))return;
    if(event.metaKey)return;
    if(hasChoice()){event.preventDefault();event.stopImmediatePropagation();return;}
    const geometry=navigationGeometry(),current=navigationRange(geometry);if(!geometry||!current)return;
    const onPlot=insideReplayRegion(event,geometry.plot),onPrice=insideReplayRegion(event,geometry.price);
    if(event.ctrlKey&&!onPlot)return;
    if(!onPlot&&!onPrice||!event.deltaX&&!event.deltaY)return;
    event.preventDefault();event.stopImmediatePropagation();if(gesture)releaseGesture();
    if(onPrice){
      wheelViewport=null;wheelGeometry=null;
      const axis=replayAxis(),unit=event.deltaMode===1?16:event.deltaMode===2?geometry.price.height:1;
      const y=clamp((event.clientY-geometry.price.top)/geometry.price.height,0,1),anchor=axis.inverted?y:1-y;
      const base=replayPriceDomain?{...axis,...replayPriceDomain}:axis;
      replayPriceDomain=scalePriceDomain(base,Math.exp(clamp(event.deltaY*unit,-600,600)*.0015),anchor);schedulePaint();return;
    }
    const rect=geometry.plot,now=Date.now(),geometryKey=[rect.left,rect.top,rect.width,rect.height].join(':');
    if(now-wheelAt>220||wheelGeometry!==geometryKey)wheelViewport=null;
    wheelAt=now;wheelGeometry=geometryKey;
    const unit=event.deltaMode===1?16:event.deltaMode===2?rect.height:1;
    const options=event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)
      ?{pan:clamp((event.deltaX||event.deltaY)*unit,-rect.width,rect.width)/rect.width}
      :{factor:Math.exp(clamp(event.deltaY*unit,-600,600)*.0015),anchor:event.ctrlKey?clamp((event.clientX-rect.left)/rect.width,0,1):1};
    wheelViewport=accumulateWheelRange(current,wheelViewport,options);useNavigationRange(wheelViewport.range);
  }
  plot.addEventListener('wheel',wheel,{capture:true,passive:false});
  function preventLiveGesture(event){if(active&&!event.target.closest?.('.chart-replay-controls')){
    event.preventDefault();event.stopImmediatePropagation();
    if(event.type==='dblclick'&&!hasChoice()&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&insideReplayRegion(event,navigationGeometry()?.price)){
      replayPriceDomain=null;releaseGesture();schedulePaint();
    }
  }}
  plot.addEventListener('contextmenu',preventLiveGesture,true);plot.addEventListener('dblclick',preventLiveGesture,true);
  function key(event){
    if(!active)return;
    const pauseShortcut=event.shiftKey&&event.key==='ArrowDown'&&!event.ctrlKey&&!event.metaKey&&!event.altKey;
    if(pauseShortcut&&getState().status==='playing'){event.preventDefault();event.stopImmediatePropagation();controller.pause();return;}
    if(hasChoice()){
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(overlay==='entry')exit();else q('exit-cancel').click();}
      else if(event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();const nodes=(overlay==='entry'?['entry-continue','entry-new','entry-cancel']:['exit-save','exit-confirm','exit-cancel']).map(q).filter(node=>!node.disabled),index=nodes.indexOf(doc.activeElement);nodes[(index+(event.shiftKey?-1:1)+nodes.length)%nodes.length]?.focus();}
      else event.stopImmediatePropagation();
      return;
    }
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.target.closest?.('input,select,textarea,[contenteditable=true],dialog'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(picking)cancelPick();else if(!q('select-panel').hidden){closeMenu();focusMenuTrigger();}else if(!q('detail-panel').hidden)q('hide-details').click();else requestExit();return;}
    if(event.target===svg&&['+','=','-'].includes(event.key)){
      const current=navigationRange();if(!current)return;
      event.preventDefault();event.stopImmediatePropagation();releaseGesture();useNavigationRange(zoomRange(current,event.key==='-'?1.25:.8,1));return;
    }
    if(picking||getState().status==='selecting')return;
    if((event.shiftKey&&event.key==='ArrowDown')||(event.key===' '&&event.target===svg)){event.preventDefault();event.stopImmediatePropagation();toggle();}
    else if((event.shiftKey&&event.key==='ArrowRight')||(event.target===svg&&['ArrowRight','Home','End'].includes(event.key))){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Home')controller.seek(0);else if(event.key==='End')controller.seek(getState().length-1);else controller.step(1);}
    else if(event.target===svg)event.stopImmediatePropagation();
  }
  doc.addEventListener('keydown',key,true);
  const pause=()=>{releaseGesture();if(active){controller.pause();preserve();}};
  const visibility=()=>{if(doc.hidden)pause();};
  doc.addEventListener('visibilitychange',visibility);win.addEventListener('blur',pause);win.addEventListener('pagehide',pause);win.addEventListener('storage',savedChanged);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(plot);resizeObserver.observe(panel);
  async function openFixedBacktest(forecast){
    if(!atlasAvailable||active||destroyed||saving)throw new Error('현재 리플레이를 종료한 뒤 월말 고정본을 열어 주세요.');
    if(forecast?.kind!=='atlas-cutoff-backtest-forecast'||forecast.symbol!==symbol||![30,90,180,365].includes(forecast.horizonDays))throw new TypeError('월말 고정 경로가 올바르지 않습니다.');
    externalBacktest=true;
    q('mode').value='cutoff-backtest';q('horizon').value=String(forecast.horizonDays);
    await open({resume:{version:1,symbol,mode:'cutoff-backtest',origin:forecast.asOf,startDate:dateAt(day(forecast.asOf)+1),horizon:forecast.horizonDays,
      cutoffForecast:forecast,outputHash:forecast.outputHash,cursorIndex:0,cursorDate:forecast.asOf,frequency:'daily',chartType:'candles',window:'half'}});
    return getState().status;
  }
  return {isActive:()=>active,open,openFixedBacktest,exit,handleChartCommand,destroy(){if(destroyed)return;destroyed=true;finishExit();controller.destroy();resizeObserver.disconnect();
    for(const type of pointerTypes)plot.removeEventListener(type,pointer,true);plot.removeEventListener('click',blockChoiceClick,true);plot.removeEventListener('wheel',wheel,true);plot.removeEventListener('contextmenu',preventLiveGesture,true);plot.removeEventListener('dblclick',preventLiveGesture,true);doc.removeEventListener('keydown',key,true);
    doc.removeEventListener('pointerdown',dismissMenu,true);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('blur',pause);win.removeEventListener('pagehide',pause);win.removeEventListener('storage',savedChanged);transport?.removeEventListener('scroll',transportHints);transport?.removeEventListener('focusin',revealControl);trigger.remove();panel.remove();hud.remove();notice.remove();}};
}
