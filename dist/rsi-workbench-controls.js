import {workspaceInstrument} from './workspace-instruments.js';
import {refreshShellSlots} from './ui/shell-slots.js';

// These actions retain native ETH/equity data and handlers. Shared chart
// acknowledgements must never grant them ownership of a different instrument.
export const nativeChartControlSelector='#eth-history-trigger,[data-eth-action],[data-equity-action],#equity-scenario,#workbench-monthly-backtest';

// All observed instruments use the existing perimeter. The underlying native
// chart retains its state; only an acknowledged current frame owns controls.
export function createChartWorkbenchControls({send,isActive}) {
  let scope=null,state=null;const saved=new Map(),added=new Set();
  // Background BTC paints may finish after the iframe acknowledgement. Keep
  // only the owned perimeter contextual while active; never observe the chart.
  const observer=typeof MutationObserver==='undefined'?null:new MutationObserver(()=>{if(state&&isActive())update(state);});
  const $=selector=>document.querySelector(selector);
  function remember(node,text=false) {
    if(!node)return node;if(saved.has(node)){if(text&&saved.get(node).text===null)saved.get(node).text=[...node.childNodes];return node;}
    saved.set(node,{attributes:[...node.attributes].map(a=>[a.name,a.value]),inert:node.inert,disabled:node.disabled,text:text?[...node.childNodes]:null,value:node.value});return node;
  }
  function attr(node,key,value){remember(node);if(node){if(value==null)node.removeAttribute(key);else node.setAttribute(key,String(value));}}
  function text(node,value){remember(node,true);if(node)node.textContent=String(value);}
  function enable(node,enabled=true){remember(node);if(!node)return;node.inert=false;if('disabled'in node)node.disabled=!enabled;}
  function restore(){
    observer?.disconnect();
    for(const node of added)node.remove();added.clear();
    for(const [node,old]of saved){for(const attribute of [...node.attributes])node.removeAttribute(attribute.name);for(const [key,value]of old.attributes)node.setAttribute(key,value);node.inert=old.inert;if('disabled'in node)node.disabled=old.disabled;if(old.text!==null)node.replaceChildren(...old.text);if(old.value!==undefined)node.value=old.value;}
    saved.clear();state=null;scope=null;delete document.body.dataset.rsiControls;delete document.body.dataset.chartControls;
  }
  function begin(symbol,epoch){restore();scope={symbol,epoch};document.body.dataset.rsiControls='loading';document.body.dataset.chartControls='loading';text($('#history-journal-toggle'),'기록');attr($('#history-journal-toggle'),'aria-label',`${symbol} 기록 준비`);text($('#workbench-range-label'),'');text($('#atlas-update-status'),'—');attr($('#atlas-update-status'),'aria-label',`${symbol} 자료 로딩`);}
  function matches(message){return scope&&isActive()&&message?.symbol===scope.symbol&&message?.epoch===scope.epoch;}
  function command(action,value){
    if(!state||!isActive())return;
    if(action==='frequency'&&!state.frequencies.includes(value)){update(state);return;}
    if(action==='type'&&!state.candles||action==='next-signal'&&!state.nextSignal||action==='tab'&&value==='records'&&!state.records)return;
    if(['pane','context-menu','tab'].includes(action))$('.mobile-workbench-button[aria-expanded="true"]')?.click();
    send({kind:'atlas:center-command',...scope,action,value});
  }
  const spanDays={focus:365,near:180,all:1095,history:0};
  const ids={
    'workbench-chart-type':['type'],'atlas-mode-menu':['pane','indicators'],'atlas-display-options':['pane','settings'],'workbench-chart-menu':['context-menu'],
    'lab-svg':['pane','export'],'workbench-workspace':['pane','search'],'workbench-undo':['undo'],'workbench-redo':['redo'],
    'workbench-magnet':['magnet'],'workbench-clear':['clear-measurement'],'workbench-go-date':['pane','date'],'workbench-scale':['scale'],
    'workbench-auto-scale':['auto-scale'],'workbench-fit':['fit'],'workbench-bottom-more':['pane','settings'],'atlas-update-status':['pane','method'],
    'workbench-bottom-reset':['fit'],'workbench-bottom-update':['pane','method'],
    'history-journal-toggle':['tab','records'],'workbench-next-turn':['next-signal'],'workbench-annotations':['pane','data'],
  };
  function route(node){
    const mobile=node.dataset.mobileTarget;if(mobile?.startsWith('#'))return ids[mobile.slice(1)];
    if(ids[node.id])return ids[node.id];
    if(node.dataset.chartTool)return ['tool',node.dataset.chartTool];
    if(node.dataset.chartNavigation)return ({in:['zoom',.8],out:['zoom',1.25],left:['pan',-.25],right:['pan',.25],reset:['fit']})[node.dataset.chartNavigation];
    if(node.dataset.chartSpan)return ['span',spanDays[node.dataset.chartSpan]];
    if(node.dataset.reader==='events')return ['tab','records'];
    if(node.dataset.reader)return ['pane',({selection:'data',layers:'indicators',volume:'indicators',settings:'settings',math:'method',guide:'help',update:'method'})[node.dataset.reader]||'data'];
    return ids[node.id];
  }
  function click(event){
    if(!isActive())return;const node=event.target.closest?.('button,summary');if(!node)return;
    if(node.matches('.symbol-selector-trigger,.mobile-workbench-button,[data-atlas-page],.atlas-brand'))return;
    const value=node.dataset.labFrequency;if(value){event.preventDefault();event.stopImmediatePropagation();command('frequency',value);return;}
    const target=route(node);if(target){event.preventDefault();event.stopImmediatePropagation();$('.mobile-workbench-button[aria-expanded="true"]')?.click();command(...target);}
  }
  function change(event){if(!isActive())return;
    if(event.target.id==='workbench-interval-select'){event.stopImmediatePropagation();command('frequency',event.target.value);}
    if(event.target.id==='workbench-range-select'){event.stopImmediatePropagation();command('span',spanDays[event.target.value]);}
  }
  function intercept(event){if(!isActive())return;event.stopImmediatePropagation();const {action,value}=event.detail||{};
    if(action==='tool'||action==='frequency'||action==='clear-measurement'||action==='magnet')command(action,value);
    else if(action==='span')command('span',spanDays[value]??0);else if(action==='chart-type')command('type');else if(action==='scale'||action==='auto-scale'||action==='fit'||action==='context-menu')command(action);
  }
  function key(event){
    if(!isActive()||event.target.closest?.('input,textarea,select,dialog[open],[contenteditable=true]'))return;
    if(event.key==='Escape'&&$('.mobile-workbench-button[aria-expanded="true"]'))return;
    let action,value;const k=event.key.toLowerCase();
    if((event.ctrlKey||event.metaKey)&&k==='z')action=event.shiftKey?'redo':'undo';
    else if((event.ctrlKey||event.metaKey)&&k==='k'){action='pane';value='search';}
    else if(event.altKey&&k==='g'){action='pane';value='date';}else if(event.altKey&&k==='m')action='magnet';
    else if(event.altKey&&k==='r')action='fit';
    else if(!event.ctrlKey&&!event.metaKey&&['c','h','m'].includes(k)){action='tool';value={c:'crosshair',h:'pan',m:'measure'}[k];}
    else if(['+','=','-','0'].includes(k)){action=k==='0'?'fit':'zoom';value=k==='-'?1.25:.8;}
    else if((event.ctrlKey||event.metaKey)&&['ArrowUp','ArrowDown'].includes(event.key)){action='zoom';value=event.key==='ArrowUp'?.8:1.25;}
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){action=event.shiftKey?'pan':'step';value=event.shiftKey?(event.key==='ArrowLeft'?-.3:.3):(event.key==='ArrowLeft'?-1:1);}
    else if(event.key==='Escape')action='close-pane';
    if(action){event.preventDefault();event.stopImmediatePropagation();command(action,value);}
  }
  document.addEventListener('click',click,true);document.addEventListener('change',change,true);document.addEventListener('keydown',key,true);document.addEventListener('atlas:chart-command',intercept,true);
  function update(message){
    const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    if(!matches(message))return false;
    const instrument=workspaceInstrument(scope.symbol),monthly=instrument?.page==='housing',legacy=message.kind==='atlas:rsi-state';
    const allowed=monthly?['monthly']:['daily','weekly'];
    const frequencies=message.frequencies??(legacy?allowed:[]);
    const expectedUnit=monthly?'지수':instrument?.currency;
    const closeValid=Number.isFinite(message.close)&&message.close>0||!legacy&&message.close===null;
    if(!['atlas:rsi-state','atlas:chart-state'].includes(message.kind)||message.ready!==true||message.unit!==expectedUnit||!Array.isArray(frequencies)||!frequencies.length||frequencies.some(value=>!allowed.includes(value))||!frequencies.includes(message.frequency)||!['log','linear'].includes(message.scale)||!['line','candles'].includes(message.chartType)||!['crosshair','pan','measure'].includes(message.tool)||!['off','weak','strong'].includes(message.magnet)||!['start','end','first','last','selected'].every(key=>validDay(message[key]))||message.start>message.end||message.first>message.last||message.selected<message.first||message.selected>message.last||!['candles','canUndo','canRedo','measurement','autoScale'].every(key=>typeof message[key]==='boolean')||!closeValid||monthly&&(message.candles||message.chartType!=='line')||['priceLast','volumeLast'].some(key=>message[key]!=null&&!validDay(message[key])))return false;
    observer?.disconnect();
    state={...message,frequencies,records:message.records??legacy,nextSignal:message.nextSignal??legacy};message=state;
    document.body.dataset.rsiControls='ready';document.body.dataset.chartControls='ready';
    for(const selector of ['.atlas-canvas-heading','.workbench-tools','.workbench-detail-tools','.workbench-bottom-bar','.mobile-extra-actions','#workbench-frequency','#workbench-navigation','.workbench-ranges','.workbench-axis','.workspace-history-controls']){const node=$(selector);enable(node);if(node)attr(node,'inert',null);}
    for(const child of $('.atlas-canvas-heading')?.children||[])if(!child.matches(`${nativeChartControlSelector},#workbench-scenario,#atlas-cycle-panel,#workbench-replay`)){enable(child);attr(child,'inert',null);}
    for(const node of document.querySelectorAll('[data-chart-tool],[data-chart-navigation],[data-chart-span],.workbench-detail-tools button,.workbench-help,.mobile-extra-actions button'))enable(node);
    for(const id of Object.keys(ids))enable($('#'+id));
    enable($('#workbench-chart-type'),message.candles);enable($('#workbench-undo'),message.canUndo);enable($('#workbench-redo'),message.canRedo);enable($('#workbench-clear'),message.measurement);enable($('#workbench-next-turn'),message.nextSignal);enable($('#history-journal-toggle'),message.records);enable($('[data-reader=events]'),message.records);
    for(const node of document.querySelectorAll('[data-chart-tool]'))attr(node,'aria-pressed',node.dataset.chartTool===message.tool);
    for(const node of document.querySelectorAll('[data-lab-frequency]')){const supported=frequencies.includes(node.dataset.labFrequency);enable(node,supported);attr(node,'hidden',supported?null:'');attr(node,'aria-pressed',node.dataset.labFrequency===message.frequency);}
    for(const id of ['workbench-interval-select','workbench-range-select'])enable($('#'+id));
    const interval=$('#workbench-interval-select');if(interval){remember(interval);for(const frequency of frequencies)if(![...interval.options].some(option=>option.value===frequency)){const option=document.createElement('option');option.value=frequency;option.textContent=({daily:'1D',weekly:'1W',monthly:'1M'})[frequency];interval.append(option);added.add(option);}interval.value=message.frequency;for(const option of interval.options){remember(option);option.disabled=!frequencies.includes(option.value);attr(option,'hidden',option.disabled?'':null);}attr(interval,'aria-label',`${scope.symbol} 차트 간격${monthly?' · 월별 관측':''}`);}
    for(const node of document.querySelectorAll('[data-chart-span]')){text(node,({focus:'1년',near:'6개월',all:'3년',history:'전체'})[node.dataset.chartSpan]);attr(node,'title',node.textContent);attr(node,'aria-label',node.textContent);const days=spanDays[node.dataset.chartSpan],span=(Date.parse(message.end)-Date.parse(message.start))/86400000;attr(node,'aria-pressed',days===0?message.start===message.first&&message.end===message.last:Math.abs(span-days)<2);}
    for(const option of $('#workbench-range-select')?.options||[])if(option.value in spanDays){const label=({focus:'1년',near:'6개월',all:'3년',history:'전체'})[option.value];text(option,label);attr(option,'title',label);}
    const rangeSelect=$('#workbench-range-select');if(rangeSelect){remember(rangeSelect);const span=(Date.parse(message.end)-Date.parse(message.start))/86400000;rangeSelect.value=message.start===message.first&&message.end===message.last?'history':Object.keys(spanDays).find(key=>spanDays[key]>0&&Math.abs(span-spanDays[key])<2)||'';}
    const displayDate=value=>monthly?value.slice(0,7):value;
    text($('#workbench-range-label'),`${displayDate(message.start)} ~ ${displayDate(message.end)}`);attr($('#workbench-range-label'),'hidden',null);attr($('#workbench-range-label'),'title',`${scope.symbol} / ${message.unit} / 완료 관측`);
    text($('#workbench-scale'),message.scale==='log'?'로그':'선형');attr($('#workbench-scale'),'aria-label',`${scope.symbol} 가격 눈금 · ${message.scale==='log'?'선형':'로그'}으로 변경`);attr($('#workbench-scale'),'aria-pressed',message.scale==='log');
    attr($('#workbench-auto-scale'),'aria-pressed',message.autoScale);attr($('#workbench-auto-scale'),'aria-label',`${scope.symbol} 가격축 자동 맞춤 ${message.autoScale?'켜짐':'꺼짐'}`);
    attr($('#workbench-chart-type'),'aria-pressed',message.chartType==='candles');for(const key of ['aria-label','title'])attr($('#workbench-chart-type'),key,message.candles?`${scope.symbol} ${message.chartType==='line'?'캔들로':'선으로'} 변경`:`${scope.symbol} 관측 가격선 · OHLC 자료 없음`);
    const chartType=$('#workbench-chart-type');remember(chartType,true);if(chartType)chartType.innerHTML=message.chartType==='candles'?'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 2v20m12-20v20M3 7h6v9H3zM15 5h6v10h-6z"/></svg>':'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m3 18 6-7 5 3 7-10"/></svg>';
    attr($('#workbench-magnet'),'aria-pressed',message.magnet!=='off');for(const key of ['aria-label','title'])attr($('#workbench-magnet'),key,`${scope.symbol} 자석 · ${({off:'끄기',weak:'약하게',strong:'강하게'})[message.magnet]}`);text($('.workbench-magnet-badge'),({off:'OFF',weak:'약',strong:'강'})[message.magnet]);
    const exchange=monthly?'월별':message.timezone==='Asia/Seoul'?'KRX':message.timezone==='UTC'?'UTC':'뉴욕';
    const recordLabel=message.recordsLabel||(legacy?'신호·체결 기록':'기록');
    const sourceClock=monthly?`가격지수 ${message.priceLast?displayDate(message.priceLast):'미공표'} · 거래량 ${message.volumeLast?displayDate(message.volumeLast):'미공표'}`:`마지막 제공 관측 ${message.last}`;
    text($('.workbench-zone'),exchange);text($('#atlas-update-status'),displayDate(message.priceLast||message.last));
    for(const key of ['title','aria-label']){
      attr($('#atlas-update-status'),key,`${scope.symbol} ${sourceClock} · 자료 출처`);
      attr($('#workbench-go-date'),key,`${scope.symbol} ${monthly?'관측월':exchange+(exchange==='UTC'?' 관측일':' 거래일')}·기간으로 이동 · Alt+G`);
      attr($('#history-journal-toggle'),key,`${scope.symbol} ${recordLabel}`);
      attr($('#workbench-next-turn'),key,`${scope.symbol} ${message.nextSignal?'다음 기준선 통과일':'기준선 신호 없음'}`);
      attr($('#workbench-annotations'),key,`${scope.symbol} 측정·선택 데이터`);
    }
    attr($('#lab-svg'),'aria-label',`${scope.symbol} 차트 내보내기 · PNG/SVG`);attr($('#lab-svg'),'title',`${scope.symbol} 차트 내보내기 · PNG/SVG`);attr($('#workbench-workspace'),'aria-label',`${scope.symbol} 차트 명령 검색 · Ctrl/⌘ K`);
    text($('#history-journal-toggle'),'기록');enable($('#workbench-annotations'));attr($('#workbench-annotations'),'aria-label',`${scope.symbol} 측정·선택 데이터`);
    // Keep the same footer record slot even when the current instrument also
    // exposes records in its own toolbar.
    attr($('#history-journal-toggle'),'hidden',null);
    attr($('[data-reader=events]'),'aria-label',`${scope.symbol} ${recordLabel}`);attr($('[data-reader=volume]'),'aria-label',`${scope.symbol} 거래량 표시 설정`);
    for(const node of document.querySelectorAll('[data-reader]')){const pane=route(node)?.[1],label=node.getAttribute('aria-label')||node.textContent;attr(node,'aria-expanded',message.pane===pane);attr(node,'title',label.startsWith(scope.symbol)?label:`${scope.symbol} ${label}`);}
    for(const id of ['atlas-mode-menu','atlas-display-options','workbench-workspace','workbench-go-date'])attr($('#'+id),'aria-expanded',message.pane===ids[id][1]);
    for(const node of document.querySelectorAll('[data-mobile-target]')){const target=route(node);if(target){enable(node,target[0]==='undo'?message.canUndo:target[0]==='redo'?message.canRedo:true);if(node.dataset.mobileTarget==='#workbench-workspace'){text(node.querySelector('span')||node,'명령 검색');attr(node,'aria-label',`${scope.symbol} 차트 명령 검색`);}}else{enable(node,false);attr(node,'hidden','');}}
    const disabledReasons={
      'workbench-chart-type':message.candles?null:'OHLC 자료가 없어 관측 가격선만 지원합니다.',
      'workbench-undo':message.canUndo?null:'취소할 차트 변경이 없습니다.',
      'workbench-redo':message.canRedo?null:'다시 실행할 차트 변경이 없습니다.',
      'workbench-clear':message.measurement?null:'완료한 측정이 없습니다.',
      'workbench-next-turn':message.nextSignal?null:'이 종목은 기준선 신호 이동을 지원하지 않습니다.',
      'history-journal-toggle':message.records?null:'이 종목에는 공개된 판정 기록이 없습니다.',
    };
    for(const [id,reason]of Object.entries(disabledReasons)){
      const node=$('#'+id);attr(node,'data-disabled-reason',reason);attr(node,'aria-description',reason);
    }
    for(const node of document.querySelectorAll('.workbench-tools [data-chart-tool],.workbench-tools [data-chart-navigation],.workbench-detail-tools [data-reader],.workbench-help')){
      const label=node.getAttribute('aria-label')||node.title||node.textContent;
      attr(node,'aria-label',`${scope.symbol} ${label.replace(/^(?:BTCUSD|BTC|ETHUSD|ETH|MSTR|BMNR|TQQQ|SOXL|233740|HYPE|HOUSING-[A-Z]+)\s+/,'')}`);
      if(node.disabled){const reason=node.dataset.reader==='events'?'이 종목에는 공개된 판정 기록이 없습니다.':'현재 상태에서는 이 조작을 사용할 수 없습니다.';attr(node,'data-disabled-reason',reason);attr(node,'aria-description',reason);}else{attr(node,'data-disabled-reason',null);attr(node,'aria-description',null);}
    }
    refreshShellSlots(document,{symbol:scope.symbol});
    for(const selector of ['.atlas-canvas-heading','.workbench-bottom-bar','.workbench-tools','.workbench-detail-tools']){const node=$(selector);if(node)observer?.observe(node,{subtree:true,attributes:true,childList:true,characterData:true});}
    return true;
  }
  return {begin,update,restore,command,destroy(){restore();document.removeEventListener('click',click,true);document.removeEventListener('change',change,true);document.removeEventListener('keydown',key,true);document.removeEventListener('atlas:chart-command',intercept,true);}};
}

// Keep the named entry point for earlier imports and downstream tests.
export const createRsiWorkbenchControls=createChartWorkbenchControls;
