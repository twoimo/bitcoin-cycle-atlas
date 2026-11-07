import { atlasNavigationPages } from './atlas-navigation.js?v=1.36.0';
import { mountChartBottomBar } from './chart-bottom-bar.js';
import { mountMobileWorkspace } from './mobile-workspace.js';
import { createWorkspaceHistory } from './workspace-history.js';
import { parseGoToRequest } from './chart-view-policy.js?v=1.36.0';
import { normalizePriceDomain } from './price-axis.js';
import { createChartSvgExport, createChartPngFromSvg } from './chart-export.js';
import { isIntradayInterval } from './ohlc-data.js';

const glyphs={
  crosshair:'<path d="M12 2v5m0 10v5M2 12h5m10 0h5"/><circle cx="12" cy="12" r="4"/>',
  pan:'<path d="M8 12V7a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2"/>',
  measure:'<path d="m3 16 13-13 5 5L8 21 3 16Zm8-8 2 2m2-6 2 2M7 12l2 2"/>',
  magnet:'<path d="M4 3h5v9a3 3 0 0 0 6 0V3h5v9a8 8 0 0 1-16 0V3Z"/><path d="M4 7h5m6 0h5"/>',
  clear:'<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6m4-6v6"/>',
  settings:'<path d="M5 3v18M12 3v18M19 3v18M2 8h6m1 8h6m1-10h6"/>',
  data:'<path d="M4 5h16M4 12h16M4 19h16M8 3v18"/>',
  layers:'<path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  history:'<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/><path d="M12 7v5l3 2"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  candles:'<path d="M7 2v4m0 10v6M17 2v8m0 8v4"/><rect x="4" y="6" width="6" height="10"/><rect x="14" y="10" width="6" height="8"/>',
  line:'<path d="m3 17 5-7 5 4 8-11"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2"/>',
  fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8"/>',
  export:'<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>',
  undo:'<path d="m8 5-5 5 5 5M3 10h10a7 7 0 0 1 7 7"/>',
  redo:'<path d="m16 5 5 5-5 5M21 10h-10a7 7 0 0 0-7 7"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]||glyphs.info}</svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=(value,intraday=false)=>Number.isFinite(value)?new Date(value*1000).toISOString().slice(0,intraday?16:10).replace('T',' '):'—';

/** Keep the original shell and its navigation/focus owners mounted. Native
 * symbols replace only its center; their financial controllers remain separate. */
export function mountNativeChartApp(app) {
  const doc=app.ownerDocument,workspace=doc.querySelector('.workspace'),sidebar=doc.querySelector('.atlas-sidebar');
  if(!workspace||!sidebar)throw new Error('A native chart requires the Atlas workspace.');
  for(const node of [...doc.body.children])if(!node.matches('#atlas-boot-shell,script,.skip-link,.atlas-sidebar,.workspace,[data-atlas-shell],.atlas-rail-tooltip'))node.remove();
  workspace.replaceChildren(app);workspace.classList.add('atlas-details-layout','native-chart-workspace');workspace.dataset.detailsOpen='false';
  app.classList.add('native-chart-workbench');doc.body.classList.add('js');doc.body.dataset.page='outlook';doc.body.dataset.shell='chart';
  sidebar.querySelector('.atlas-side-foot')?.remove();
  const brand=sidebar.querySelector('.atlas-brand');if(brand){brand.setAttribute('aria-label','가격 차트');brand.title='가격 차트';}
  // app.js normally paints these icons. Native symbols intentionally do not
  // load that BTC controller, so render the same navigation paths here.
  for(const item of sidebar.querySelectorAll('[data-atlas-page]')){
    const page=atlasNavigationPages.find(page=>page.id===item.dataset.atlasPage),placeholder=item.querySelector('[data-icon]');
    if(page&&placeholder){placeholder.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${page.icon}"/></svg>`;}
  }
}

/** Only presentation state is undoable: no price observations, source clocks,
 * financial assumptions, requests or model outputs enter this snapshot. */
export function nativeChartSnapshot(state) {
  return Object.fromEntries(['frequency','chartType','scale','span','tool','range','rangeTouched','priceDomain','selectedTime','measurement','magnet','showVolume','invertScale']
    .filter(key=>state[key]!==undefined).map(key=>[key,structuredClone(state[key])]));
}

export function nativeDateRange(range,result) {
  if(!range||!result?.ok)return null;
  const read=value=>typeof value==='number'?value:Date.parse(`${value}T00:00:00Z`)/1000;
  const align=value=>range.min+Math.round((read(value)-range.min)/range.step)*range.step;
  const start=align(result.range.start),end=Math.max(start,align(result.range.end));
  if(![start,end].every(Number.isSafeInteger))return null;
  return {...range,start,end,allowEmpty:true,maxSpan:Math.max(range.minSpan||1,Math.round((range.max-range.min)/range.step)+1,Math.round((end-start)/range.step)+1)};
}

export function mountNativeChartWorkbench({app,svg,plot,symbol,intervals,state,getSeries,navigation,actions,onChange,onRestore,cancelInteraction}) {
  const doc=app.ownerDocument,win=doc.defaultView,workspace=app.parentElement,sidebar=doc.querySelector('.atlas-sidebar');
  const $=selector=>app.querySelector(selector),top=$('.eth-topbar');top.classList.add('atlas-canvas-heading');
  const active=()=>!doc.body.dataset.centerTool&&svg.dataset.chartReplayActive!=='true'&&doc.documentElement.dataset.chartReplayActive!=='true';
  const make=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const button=(name,label,id,action,value)=>{const node=make('button','workbench-icon');node.type='button';node.innerHTML=icon(name);node.title=label;node.setAttribute('aria-label',label);if(id)node.id=id;if(action)node.onclick=()=>emit('atlas:chart-command',{action,value});return node;};
  const emit=(name,detail)=>doc.dispatchEvent(new win.CustomEvent(name,{detail}));
  const timeZone=symbol==='ETHUSD'?'UTC':'뉴욕 거래 세션일';
  let inspection=null,readerKind=null,readerOpener=null,destroyed=false,exportUrl=null,exportVector=null;
  const owned=[];const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);owned.push(()=>target.removeEventListener(type,handler,options));};
  const uiHistory=createWorkspaceHistory({read:()=>nativeChartSnapshot(state),apply:snapshot=>{cancelInteraction();const changed=state.frequency!==snapshot.frequency;Object.assign(state,snapshot);onRestore?.({frequencyChanged:changed});onChange();},onChange:()=>update()});

  // Retain hidden legacy DOM hooks for the asset controller's existing source
  // and model controls. Its visible perimeter is the shared workbench.
  const legacy=make('div','native-legacy-controls');legacy.hidden=true;app.append(legacy);
  const oldTools=$('.eth-tools'),oldBottom=$('.eth-bottom'),oldTypes=$('.eth-chart-types'),oldInterval=$('#eth-interval');
  if(oldTools)legacy.append(oldTools);if(oldTypes)legacy.append(oldTypes);if(oldInterval)legacy.append(oldInterval);
  const oldPeriods=$('.eth-periods'),oldPeriodSelect=$('#eth-period-select')||$('#equity-period-select');
  const oldStatus=$('#eth-status')||$('#equity-status');
  if(oldBottom)legacy.append(oldBottom);if(oldPeriods)oldPeriods.classList.add('native-legacy-controls');if(oldPeriodSelect)oldPeriodSelect.classList.add('native-legacy-controls');
  const frequency=$('.eth-interval-buttons')||$('.equity-intervals');frequency.id='workbench-frequency';frequency.classList.add('native-frequency');
  const segmented=make('div','lab-segmented');segmented.append(...frequency.children);frequency.append(segmented);
  for(const node of segmented.querySelectorAll('button')){node.dataset.labFrequency=node.dataset.ethInterval||node.dataset.equityInterval;node.id=`workbench-interval-${node.dataset.labFrequency}`;}
  const interval=make('select');interval.id='workbench-interval-select';interval.setAttribute('aria-label','가격 표시 간격');
  for(const item of intervals){const option=make('option','',item.label);option.value=item.id;interval.append(option);}interval.onchange=()=>command('frequency',interval.value);frequency.append(interval);
  const type=button('line','가격 표시 · 캔들로 변경','workbench-chart-type','chart-type');frequency.after(type);
  const indicators=button('layers','지표 표시','atlas-mode-menu','reader','layers');indicators.classList.add('workbench-mode');const mode=make('span','','인디케이터');mode.id='atlas-mode-name';indicators.append(mode);type.after(indicators);
  const forecast=top.querySelector('[data-eth-action=forecast],[data-equity-action=forecast]');if(forecast){forecast.id='workbench-scenario';forecast.classList.add('workbench-icon');}
  for(const node of top.querySelectorAll('.eth-icon'))node.classList.add('workbench-icon');
  const spacer=$('.eth-top-spacer');if(spacer)spacer.classList.add('workbench-spacer');
  const historyButtons=make('span','workspace-history-controls'),undo=button('undo','실행 취소 · Ctrl/⌘ Z','workbench-undo','undo'),redo=button('redo','다시 실행 · Ctrl/⌘ Shift Z','workbench-redo','redo');historyButtons.append(undo,redo);top.append(historyButtons);
  const search=button('search','차트 명령 검색 · Ctrl/⌘ K','workbench-workspace','reader','search'),menu=button('more','차트 빠른 조작','workbench-chart-menu','context-menu'),save=button('export',`${symbol} 차트 내보내기 · PNG/SVG`,'lab-svg','export'),settings=button('settings','차트 설정','atlas-display-options','reader','settings');
  top.append(search,menu,save,settings);
  const left=make('nav','workbench-tools');left.setAttribute('aria-label','차트 조작 도구');
  for(const [name,label]of [['crosshair','십자선 · C'],['pan','차트 이동 · H'],['measure','두 지점 측정 · M']]){const node=button(name,label,'','tool',name);node.dataset.chartTool=name;node.setAttribute('aria-keyshortcuts',name==='crosshair'?'C':name==='pan'?'H':'M');left.append(node);}
  const magnet=button('magnet','자석 · 끄기 · Alt+M','workbench-magnet','magnet'),badge=make('span','workbench-magnet-badge','OFF');badge.setAttribute('aria-hidden','true');magnet.append(badge);
  const clear=button('clear','측정 지우기','workbench-clear','clear-measurement'),annotations=button('data','측정·선택 데이터','workbench-annotations','reader','selection'),navSlot=make('div');navSlot.id='workbench-navigation';navSlot.append(navigation.toolbar);left.append(magnet,clear,navSlot,annotations);sidebar.querySelector('.atlas-brand')?.after(left);
  const rail=make('aside','workbench-rail');rail.setAttribute('aria-label','차트 정보와 자료');
  const details=make('nav','workbench-detail-tools');details.setAttribute('aria-label','차트 상세');
  for(const [name,label,kind]of [['data','선택 데이터','selection'],['layers','차트 레이어','layers'],['info','계산·출처','math'],['history','역사 사건','events']]){const node=button(name,label,'','reader',kind);node.dataset.reader=kind;details.append(node);}
  const help=button('info','차트 사용법','','reader','guide');help.dataset.reader='guide';help.classList.add('workbench-help');rail.append(details,help);workspace.append(rail);
  const originalNav=doc.querySelector('.atlas-nav');if(originalNav)rail.prepend(originalNav);

  const reader=make('aside','chart-details-panel native-chart-reader');reader.id='chart-reader';reader.hidden=true;reader.setAttribute('aria-labelledby','chart-reader-title');
  const readerHeading=make('div','reader-heading'),readerTitle=make('h2');readerTitle.id='chart-reader-title';readerTitle.tabIndex=-1;const readerClose=button('close','상세 패널 닫기');readerClose.onclick=()=>closeReader();readerHeading.append(readerTitle,readerClose);
  const body=make('div','reader-body');body.id='chart-reader-body';reader.append(readerHeading,body);workspace.append(reader);
  function closeReader({restoreFocus=true}={}){reader.hidden=true;readerKind=null;workspace.dataset.detailsOpen='false';emit('atlas:panel-state',{open:false});if(restoreFocus&&readerOpener?.isConnected)readerOpener.focus({preventScroll:true});readerOpener=null;}
  function checkbox(label,key){const row=make('label','native-chart-setting'),input=make('input');input.type='checkbox';input.dataset.nativeSetting=key;input.checked=Boolean(state[key]);input.onchange=()=>command('toggle',key);row.append(input,doc.createTextNode(label));return row;}
  function renderReader(){
    body.replaceChildren();
    if(readerKind==='settings'||readerKind==='layers'){
      body.append(checkbox(`거래량 · ${symbol==='ETHUSD'?'ETH':'주'}`,'showVolume'),checkbox('가격축 뒤집기','invertScale'));
      const price=make('button','native-reader-action',state.scale==='log'?'로그 → 선형 가격축':'선형 → 로그 가격축');price.type='button';price.onclick=()=>command('scale');body.append(price);
      const future=make('button','native-reader-action','미래 가정·표시 설정');future.type='button';future.onclick=()=>{closeReader({restoreFocus:false});actions.forecast?.();};body.append(future);
      const note=make('p','','거래량은 실제 완료 봉에만 표시합니다. 미래 가정에는 거래량을 생성하지 않습니다.');body.append(note);
    }else if(readerKind==='selection'){
      const current=inspection||state.controller?.getSelection?.();
      if(current){body.append(make('p','',current.label));if(current.fields){const list=make('dl','native-chart-data');for(const field of current.fields)list.append(make('dt','',field.label),make('dd','',field.value));body.append(list,make('p','',current.note));}else body.append(make('pre','',current.copyText));}
      else body.append(make('p','','가격 자료를 불러오는 중입니다.'));
      if(state.measurement){const m=state.measurement,summary=make('dl','native-chart-data');summary.append(make('dt','','측정 시작'),make('dd','',`${m.startDate} · ${m.startPrice} USD`),make('dt','','측정 끝'),make('dd','',m.endDate?`${m.endDate} · ${m.endPrice} USD`:'끝점 선택'));body.append(summary);}
    }else if(readerKind==='search'){
      const label=make('label','native-command-search','명령 검색'),input=make('input');input.type='search';input.placeholder='기간, 지표, 날짜…';label.append(input);body.append(label);const list=make('div','native-command-results');body.append(list);
      const commands=[['기본 범위','fit'],['1년','span','1y'],['전체 기간','span','history'],['선 / 캔들','chart-type'],['가격축 전환','scale'],['지표','reader','layers'],['날짜·기간 이동','date'],['선택 데이터','reader','selection'],['차트 내보내기','export'],['실행 취소','undo'],['다시 실행','redo']];
      const paint=()=>{list.replaceChildren();for(const [name,action,value]of commands.filter(([name])=>name.includes(input.value))){const node=make('button','native-reader-action',name);node.type='button';node.onclick=()=>{closeReader({restoreFocus:false});command(action,value);};list.append(node);}};input.oninput=paint;paint();
    }else{
      const table=make('dl','native-chart-data');for(const [key,value]of [['휠 / 시간축 드래그','오른쪽 끝을 유지하며 확대·축소'],['Ctrl + 휠 / 두 손가락','가리킨 위치에서 확대·축소'],['드래그','날짜·가격 위치 이동'],['가격축 드래그 / 휠','가격 눈금 조절'],['가격축 두 번 클릭','가격 자동 맞춤'],['C / H / M','십자선 / 이동 / 두 점 측정'],['Alt+M / Alt+G','자석 / 날짜 이동'],['Ctrl/⌘ Z / Shift Z','실행 취소 / 다시 실행'],['0 / 두 번 클릭','기본 범위로']])table.append(make('dt','',key),make('dd','',value));body.append(table);
    }
  }
  function openReader(kind,opener=doc.activeElement){
    if(!active())return;
    if(kind==='math'||kind==='update'){actions.source?.();return;}if(kind==='scenarios'){actions.forecast?.();return;}if(kind==='events'){actions.history?.();return;}
    if(!reader.hidden&&readerKind===kind){closeReader();return;}
    readerKind=kind;readerOpener=opener;readerTitle.textContent=`${symbol} · ${{settings:'차트 설정',layers:'지표',selection:'선택 데이터',guide:'사용법',search:'명령 검색'}[kind]||kind}`;renderReader();reader.hidden=false;workspace.dataset.detailsOpen='true';emit('atlas:panel-state',{open:true,kind});readerTitle.focus({preventScroll:true});update();
  }

  const ranges=make('div','workbench-ranges');ranges.setAttribute('role','group');ranges.setAttribute('aria-label','차트 표시 기간');
  const spanMap={focus:'4y',near:'6m',all:'1y',history:'all'};
  for(const [id,label]of [['focus','4년'],['near','6개월'],['all','1년'],['history','전체']]){const node=make('button','',label);node.type='button';node.dataset.chartSpan=id;node.title=label;node.onclick=()=>command('span',id);ranges.append(node);}
  const dateButton=button('calendar',`${timeZone} 날짜·기간 이동 · Alt+G`,'workbench-go-date','date'),rangeLabel=make('span');rangeLabel.id='workbench-range-label';
  const axis=make('div','workbench-axis'),scale=make('button','','로그');scale.type='button';scale.id='workbench-scale';scale.onclick=()=>command('scale');
  const auto=make('button','workbench-auto','자동');auto.type='button';auto.id='workbench-auto-scale';auto.onclick=()=>command('auto-scale');const fit=button('fit','기본 범위로 · 0 / Alt+R','workbench-fit','fit');axis.append(scale,auto,fit);
  const status=make('div','workbench-status'),zone=make('span','workbench-zone',timeZone),updateButton=make('button','workbench-update');updateButton.type='button';updateButton.id='atlas-update-status';updateButton.onclick=()=>actions.source?.();if(oldStatus)updateButton.append(oldStatus);status.append(zone,updateButton);
  const bottom=mountChartBottomBar({stage:app,ranges,dateButton,rangeLabel,axis,status,fitButton:fit,updateButton,onCommand:(action,value)=>command(action,value),onUpdate:()=>actions.source?.()});
  const history=button('history',`${symbol} 역사 사건`,'history-journal-toggle','history');bottom.eventSlot.append(history);
  const menuZone=doc.querySelector('#workbench-bottom-menu .bottom-menu-context p:last-child');if(menuZone)menuZone.textContent=`날짜·봉 시각 · ${timeZone}`;

  function dialog(id,title){const node=make('dialog','eth-data-dialog native-chart-dialog');node.id=id;const heading=make('header'),label=make('h2','',title),close=button('close',`${title} 닫기`);label.id=id+'-title';node.setAttribute('aria-labelledby',label.id);close.onclick=()=>node.close();heading.append(label,close);const content=make('div','native-dialog-body');node.append(heading,content);doc.body.append(node);listen(node,'keydown',e=>e.stopPropagation());listen(node,'click',e=>{if(e.target===node){const b=node.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)node.close();}});return {node,content};}
  const dateDialog=dialog('chart-go-to-dialog',`${symbol} 날짜·기간 이동`),exportDialog=dialog('chart-export-dialog',`${symbol} 차트 내보내기`);
  let dialogOpener=null;
  for(const d of [dateDialog,exportDialog])listen(d.node,'close',()=>{if(dialogOpener?.isConnected)dialogOpener.focus({preventScroll:true});dialogOpener=null;});
  function showDialog(d,opener=doc.activeElement){cancelInteraction();dialogOpener=opener;emit('atlas:modal-open',{id:d.node.id});if(!d.node.open)d.node.showModal();}
  function openDate(){
    if(!state.range)return;const intraday=isIntradayInterval(state.frequency),form=make('form','native-date-form'),modeLabel=make('label','','이동 방식'),mode=make('select');mode.setAttribute('aria-label','이동 방식');mode.innerHTML='<option value="point">날짜·시각</option><option value="range">시작–끝 기간</option>';modeLabel.append(mode);
    const field=(title)=>{const label=make('label','',title),input=make('input');input.type=intraday?'datetime-local':'date';input.required=true;input.step=intraday?String(intervals.find(i=>i.id===state.frequency)?.seconds||60):'1';label.append(input);return {label,input};};
    const from=field(`날짜 · ${timeZone}`),to=field(`끝 · ${timeZone}`);from.input.setAttribute('aria-label','이동할 날짜');to.input.setAttribute('aria-label','기간 종료');from.input.value=stamp(state.selectedTime??getSeries()?.candles.at(-1)?.time,intraday).replace(' ','T');to.input.value=stamp(state.range.end,intraday).replace(' ','T');to.label.hidden=true;to.input.disabled=true;
    mode.onchange=()=>{to.label.hidden=mode.value!=='range';to.input.disabled=mode.value!=='range';if(mode.value==='range')from.input.value=stamp(state.range.start,intraday).replace(' ','T');};
    const error=make('p','native-chart-error');error.setAttribute('role','alert');const submit=make('button','native-reader-action','이동');submit.type='submit';
    form.append(make('p','',symbol==='ETHUSD'?'UTC 봉 시작 시각으로 이동합니다. 실제로 제공되지 않은 구간은 비워 둡니다.':'뉴욕 거래 세션일로 이동합니다. 휴장일에는 관측 가격을 생성하지 않습니다.'),modeLabel,from.label,to.label,error,submit);
    form.onsubmit=event=>{event.preventDefault();const result=parseGoToRequest({frequency:state.frequency,mode:mode.value,start:from.input.value,end:to.input.value,currentRange:intraday?state.range:{start:stamp(state.range.start),end:stamp(state.range.end)},loadedStart:getSeries()?.firstDate,loadedEnd:getSeries()?.lastDate});if(!result.ok){error.textContent=result.message;return;}command('go-to',result);dateDialog.node.close();};dateDialog.content.replaceChildren(form);showDialog(dateDialog,dateButton);from.input.focus();
  }
  function releaseExport(){if(exportUrl){win.URL.revokeObjectURL(exportUrl);exportUrl=null;}}
  function openExport(){
    if(!getSeries()||!state.controller)return;releaseExport();const series=getSeries(),range=`${stamp(state.range?.start,isIntradayInterval(state.frequency))} ~ ${stamp(state.range?.end,isIntradayInterval(state.frequency))}`;
    try{exportVector=createChartSvgExport(svg,{title:`${symbol} / USD / ${intervals.find(i=>i.id===state.frequency)?.label||state.frequency}`,readout:range,source:`${series.source} · ${series.product} · ${timeZone} · 수집 ${series.retrievedAt}`,note:[plot.querySelector('.eth-forecast-note:not([hidden]),.equity-legend')?.textContent,'현재 가격·날짜축과 완료한 측정을 저장합니다.'].filter(Boolean).join(' · ')});}catch(error){inspection={label:'내보내기 오류',copyText:error.message};openReader('selection');return;}
    exportUrl=win.URL.createObjectURL(new Blob([exportVector],{type:'image/svg+xml'}));const image=make('img','native-export-preview');image.src=exportUrl;image.alt=`${symbol} 현재 차트 내보내기 미리보기`;
    const exportName=`${symbol}-${stamp(state.range.start)}-${stamp(state.range.end)}`;
    const source=make('p','',`${symbol} · USD · ${timeZone} · ${range}`),download=make('a','native-reader-action','SVG 저장');download.href=exportUrl;download.download=`${exportName}.svg`;
    const png=make('button','native-reader-action','PNG 저장');png.type='button';png.dataset.nativeExport='png';const status=make('p');status.setAttribute('role','status');
    png.onclick=async()=>{png.disabled=true;status.textContent='PNG 생성 중';try{const blob=await createChartPngFromSvg(exportVector,doc),url=win.URL.createObjectURL(blob),a=make('a');a.href=url;a.download=`${exportName}.png`;a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);status.textContent='PNG 저장 완료';}catch(error){status.textContent=error.message;}finally{png.disabled=false;}};
    exportDialog.content.replaceChildren(source,image,download,png,status);showDialog(exportDialog,save);
  }

  function command(action,value){
    if(!active()||destroyed)return;
    if(action==='reader'){openReader(value);return;}if(action==='date'){openDate();return;}if(action==='export'){openExport();return;}
    if(action==='history'){actions.history?.();return;}if(action==='context-menu'){const b=plot.getBoundingClientRect();navigation.openMenu({clientX:b.left+b.width*.5,clientY:b.top+b.height*.4});return;}
    if(action==='undo'||action==='redo'){uiHistory[action]();return;}
    uiHistory.run(action,()=>{
      cancelInteraction();
      if(action==='frequency'){if(intervals.some(i=>i.id===value))actions.frequency(value);return;}
      if(action==='span'){actions.span(spanMap[value]||value);return;}if(action==='fit'){actions.fit();return;}
      if(action==='tool'&&['crosshair','pan','measure'].includes(value))state.tool=value;
      if(action==='chart-type')state.chartType=state.chartType==='line'?'candles':'line';
      if(action==='scale'){state.scale=state.scale==='log'?'linear':'log';state.priceDomain=normalizePriceDomain(state.priceDomain,{scale:state.scale});}
      if(action==='auto-scale'){const domain=state.controller?.getPriceScale?.();state.priceDomain=state.priceDomain?null:domain&&{min:domain.min,max:domain.max};}
      if(action==='magnet')state.magnet=['off','weak','strong'].includes(value)?value:({off:'weak',weak:'strong',strong:'off'})[state.magnet||'off'];
      if(action==='clear-measurement')state.measurement=null;
      if(action==='toggle'&&['showVolume','invertScale'].includes(value))state[value]=!state[value];
      if(action==='go-to'){const range=nativeDateRange(state.range,value);if(range){state.range=range;state.rangeTouched=true;state.selectedTime=Date.parse(value.selectedTime)/1000;actions.range?.(range);}}
      onChange();
    });
    if(!reader.hidden&&readerKind!=='search')renderReader();update();
  }
  function update(){
    if(!active()||destroyed)return;const series=getSeries(),ready=Boolean(series&&state.controller),historyState=uiHistory.status();
    interval.value=state.frequency;type.innerHTML=icon(state.chartType==='candles'?'candles':'line');type.setAttribute('aria-pressed',String(state.chartType==='candles'));type.title=`${symbol} ${state.chartType==='candles'?'선':'캔들'}으로 변경`;type.setAttribute('aria-label',type.title);
    for(const node of left.querySelectorAll('[data-chart-tool]'))node.setAttribute('aria-pressed',String(node.dataset.chartTool===state.tool));
    for(const node of segmented.querySelectorAll('[data-lab-frequency]')){node.setAttribute('aria-pressed',String(node.dataset.labFrequency===state.frequency));node.tabIndex=node.dataset.labFrequency===state.frequency?0:-1;}
    magnet.setAttribute('aria-pressed',String(state.magnet!=='off'));badge.textContent=({off:'OFF',weak:'약',strong:'강'})[state.magnet||'off'];magnet.setAttribute('aria-label',`${symbol} 자석 · ${{off:'끄기',weak:'약하게',strong:'강하게'}[state.magnet||'off']} · Alt+M`);
    clear.disabled=!state.measurement;undo.disabled=!historyState.canUndo;redo.disabled=!historyState.canRedo;save.disabled=!ready;dateButton.disabled=!ready;type.disabled=!ready;
    scale.textContent=state.scale==='log'?'로그':'선형';scale.setAttribute('aria-pressed',String(state.scale==='log'));auto.textContent=state.priceDomain?'수동':'자동';auto.setAttribute('aria-pressed',String(!state.priceDomain));auto.setAttribute('aria-label',`${symbol} 가격축 자동 맞춤 ${state.priceDomain?'꺼짐':'켜짐'}`);
    const range=state.range,intraday=isIntradayInterval(state.frequency);rangeLabel.textContent=range?`${stamp(range.start,intraday)} ~ ${stamp(range.end,intraday)}`:'';rangeLabel.title=`${symbol} · ${timeZone} · ${rangeLabel.textContent}`;
    updateButton.title=oldStatus?.title||`${symbol} 자료 출처`;for(const node of ranges.querySelectorAll('[data-chart-span]'))node.setAttribute('aria-pressed',String(spanMap[node.dataset.chartSpan]===state.span&&!state.rangeTouched));
    bottom.update({mode:'price',intraday,frequency:state.frequency,window:Object.keys(spanMap).find(key=>spanMap[key]===state.span),customRange:state.rangeTouched,navigationAvailable:ready});
    for(const node of [indicators,settings,search,...details.querySelectorAll('[data-reader]')]){const kind=node===indicators?'layers':node===settings?'settings':node===search?'search':node.dataset.reader;node.setAttribute('aria-expanded',String(!reader.hidden&&readerKind===kind));}
    emit('atlas:workbench-state',{mode:'price',frequency:state.frequency,intraday,tool:state.tool,magnet:state.magnet});
  }
  const onKey=event=>{
    if(!active()||event.defaultPrevented||event.isComposing||event.target.closest?.('input,textarea,select,dialog[open],[contenteditable=true]'))return;
    const key=event.key.toLowerCase();let action,value;
    if((event.ctrlKey||event.metaKey)&&key==='z')action=event.shiftKey?'redo':'undo';
    else if((event.ctrlKey||event.metaKey)&&key==='k'){action='reader';value='search';}
    else if(event.altKey&&key==='g')action='date';else if(event.altKey&&key==='m')action='magnet';else if(event.altKey&&key==='r')action='fit';else if(event.altKey&&key==='l')action='scale';
    else if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&['c','h','m'].includes(key)){action='tool';value=({c:'crosshair',h:'pan',m:'measure'})[key];}
    else if(key==='escape'&&!reader.hidden){event.preventDefault();closeReader();return;}
    if(action){event.preventDefault();event.stopImmediatePropagation();command(action,value);}
  };
  listen(doc,'keydown',onKey,true);
  listen(doc,'atlas:chart-command',event=>{if(!active())return;const {action,value}=event.detail||{};command(action,value);});
  listen(doc,'atlas:open-detail',event=>{if(active())openReader(event.detail?.kind,event.detail?.opener);});
  listen(doc,'atlas:workspace-open',()=>{if(active())openReader('search');});
  listen(doc,'atlas:close-detail',()=>closeReader({restoreFocus:false}));
  listen(doc,'atlas:center-restored',()=>{onChange();update();});
  listen(doc,'atlas:modal-open',event=>{if(![dateDialog.node.id,exportDialog.node.id].includes(event.detail?.id)){dateDialog.node.close();exportDialog.node.close();}});
  // Record existing interval/style/span actions without changing their owners.
  listen(app,'click',event=>{if(!active())return;const node=event.target.closest?.('[data-eth-interval],[data-equity-interval],[data-eth-span],[data-equity-span],[data-eth-action],[data-equity-action]');if(!node)return;const action=node.dataset.ethAction||node.dataset.equityAction;if(action&&!['line','candles','crosshair','pan','scale','auto','reset'].includes(action))return;uiHistory.begin('차트 변경');queueMicrotask(()=>uiHistory.commit());},true);
  const mobile=mountMobileWorkspace({workspace,stage:app,plot,reader,closeReader});
  update();
  return {update,command,inspect(detail){inspection=detail;if(active()&&!reader.hidden&&readerKind==='selection')renderReader();},
    beginGesture(){if(active())uiHistory.begin('차트 이동');},endGesture(){uiHistory.commit();},
    measure(value){uiHistory.run('두 지점 측정',()=>{state.measurement=value;});update();},
    destroy(){if(destroyed)return;destroyed=true;for(const cleanup of owned)cleanup();mobile.destroy();bottom.destroy();releaseExport();dateDialog.node.remove();exportDialog.node.remove();reader.remove();left.remove();rail.remove();}};
}
