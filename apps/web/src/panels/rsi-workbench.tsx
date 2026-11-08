import { memo,useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { calculateRsiSeries,isFutureStamp } from '@atlas/domain/market-lab';
import type { RsiRow } from '@atlas/domain/market-lab';
import { validateRsiBars,weeklyRsiBars,weeklyRsiPrices } from '@atlas/domain/rsi-bars';
import type { Market,MarketSnapshot,Point } from '@atlas/contracts/market-lab';
import { SourceDisclosure } from '../components/source-disclosure.js';
import { RsiChartCanvas,axisNumber,type Pick } from '../components/rsi-chart-canvas.js';
import { applyChartCommand,boundedDates,chartRange,day,nearestPoint,initialChartView,type Pane,type RsiChartView,type RsiChartCache } from '../rsi-chart-model.js';
import { RsiHistory,type RsiHistoryState } from './rsi-history.js';
import { rsiCrossings } from '../rsi-crossings.js';
import {CompactToolbar,CompactToolbarMenu} from '../components/compact-toolbar.js';
import {initialChartUrlView,chartUrlView,persistStandaloneChartUrl} from '../chart-url-state.js';
const History=memo(RsiHistory);
type Props={symbol:string;market:Market;snapshot:MarketSnapshot;now:Date;rows:RsiRow[];revision?:string;epoch:number;active:boolean;embedded:boolean;historyCache?:Map<string,RsiHistoryState>;chartCache?:Map<string,RsiChartCache>;onDate:(index:number)=>void;comparison:React.ReactNode;references:React.ReactNode};
const panes=['data','indicators','settings','method','help','export','date','search'];
interface BarEvidence {retrievedAt?:string;timezone?:string;responseSha256?:string;retrievalClockBasis?:string}
function serializeSvg(svg:SVGSVGElement,symbol:string,unit:string,frequency:string) {
  const copy=svg.cloneNode(true) as SVGSVGElement;copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('style',`background:${getComputedStyle(document.body).backgroundColor}`);
  const source=[svg,...svg.querySelectorAll('*')],target=[copy,...copy.querySelectorAll('*')];
  for(let i=0;i<source.length;i++){const style=getComputedStyle(source[i]);for(const key of ['fill','stroke','stroke-width','stroke-dasharray','opacity','font-size','font-family','font-weight'])target[i].setAttribute(key,style.getPropertyValue(key));}
  const heading=document.createElementNS('http://www.w3.org/2000/svg','text');heading.setAttribute('x','12');heading.setAttribute('y','12');heading.setAttribute('fill',getComputedStyle(document.body).color);heading.setAttribute('font-size','11');heading.setAttribute('font-family','Arial,sans-serif');heading.textContent=`${symbol} / ${unit} / ${frequency==='daily'?'1D':'1W'} / ${svg.dataset.start} ~ ${svg.dataset.end}`;copy.append(heading);
  copy.setAttribute('aria-label',symbol+' 관측 가격·RSI');return new XMLSerializer().serializeToString(copy);
}
export function RsiWorkbench(props:Props) {
  const {symbol,market,snapshot,now,revision,epoch,active,embedded,historyCache,chartCache}=props,prices=market.prices;
  const evidence=market.ohlcEvidence as BarEvidence|undefined;
  const barData=useMemo(()=>{
    try {if(!evidence||typeof evidence.retrievedAt!=='string'||!Number.isFinite(Date.parse(evidence.retrievedAt))||!/^[a-f0-9]{64}$/.test(evidence.responseSha256||'')||evidence.timezone!==market.timezone||isFutureStamp(evidence.retrievedAt,now))return [];
      return validateRsiBars(market.ohlc,prices);
    }catch{return [];}
  },[market,prices,+now]);
  const [view,setView]=useState<RsiChartView>(()=>initialChartUrlView(symbol,chartCache?.get(symbol)?.view||initialChartView(prices),{frequencies:['daily','weekly'],candles:barData.length>0,embedded}));
  const [pane,setPane]=useState<Pane>(null),[tab,setTab]=useState<'chart'|'backtest'|'records'>('chart'),[hover,setHover]=useState<Pick|null>(null),[status,setStatus]=useState('');
  const undo=useRef<RsiChartView[]>(chartCache?.get(symbol)?.undo||[]),redo=useRef<RsiChartView[]>(chartCache?.get(symbol)?.redo||[]),gesture=useRef<RsiChartView|null>(null);
  const userViewRevision=useRef(0);
  const live=useRef({view,props,tab,pane});live.current={view,props,tab,pane};
  const svg=useRef<SVGSVGElement>(null),[exportText,setExportText]=useState(''),[exportUrl,setExportUrl]=useState('');
  const [pngUrl,setPngUrl]=useState(''),[search,setSearch]=useState('');
  const displayPrices=useMemo(()=>view.frequency==='weekly'?weeklyRsiPrices(prices):prices,[prices,view.frequency]);
  const bars=useMemo(()=>view.frequency==='weekly'?weeklyRsiBars(barData):barData,[barData,view.frequency]);
  const rows=useMemo(()=>view.frequency==='weekly'?calculateRsiSeries(displayPrices,14,9):props.rows,[displayPrices,view.frequency,props.rows]);
  const selectedDate=hover?.date||view.selected,selectedIndex=nearestPoint(displayPrices,selectedDate),point=displayPrices[selectedIndex],row=rows[selectedIndex],bar=bars.find(b=>b[0]===point?.[0]);
  const previous=displayPrices[selectedIndex-1],change=point&&previous?(point[1]/previous[1]-1)*100:null;
  function persist(next:RsiChartView,record=true) {
    const series=next.frequency==='weekly'?weeklyRsiPrices(prices):prices,visible=series.filter(p=>p[0]>=next.start&&p[0]<=next.end);
    if(visible.length&&(next.selected<visible[0][0]||next.selected>visible.at(-1)![0]))next={...next,selected:next.selected<visible[0][0]?visible[0][0]:visible.at(-1)![0]};
    const previous=live.current.view;if(JSON.stringify(next)===JSON.stringify(previous))return;
    if(record){undo.current=[...undo.current,previous].slice(-40);redo.current=[];}
    if(!gesture.current){userViewRevision.current++;persistStandaloneChartUrl(symbol,next,embedded);}
    live.current.view=next;setView(next);setExportText('');
  }
  const selectDate=useCallback((index:number)=>{
    const p=live.current.props.market.prices[index];if(!p)return;
    const next=applyChartCommand(live.current.view,live.current.props.market.prices,'date',p[0]);
    if(JSON.stringify(next)!==JSON.stringify(live.current.view)){userViewRevision.current++;persistStandaloneChartUrl(live.current.props.symbol,next,live.current.props.embedded);}
    live.current.view=next;setView(next);live.current.props.onDate(index);
  },[]);
  const command=useRef<(action:string,value?:unknown)=>void>(()=>{});
  command.current=(action,value)=>{
    if(!live.current.props.active)return;
    if(action==='pane'&&panes.includes(String(value))){if(value==='data')props.onDate(nearestPoint(prices,view.selected));if(value==='date'){setJump(view.selected);setFrom(view.start);setTo(view.end);}setPane(p=>p===value?null:value as Pane);setTab('chart');return;}
    if(action==='tab'&&['chart','backtest','records'].includes(String(value))){setTab(value as typeof tab);return;}
    if(action==='undo'||action==='redo'){
      const from=action==='undo'?undo:redo,to=action==='undo'?redo:undo,next=from.current.at(-1);if(!next)return;
      from.current=from.current.slice(0,-1);to.current=[...to.current,live.current.view].slice(-40);persist(next,false);setTab('chart');return;
    }
    if(action==='type'&&!barData.length){setStatus('실제 OHLC 자료가 없습니다.');return;}
    if(action==='context-menu'){setTab('chart');setPane(null);setMenuPulse(n=>n+1);return;}
    if(action==='auto-scale'){
      const min=Number(svg.current?.dataset.priceMin),max=Number(svg.current?.dataset.priceMax);
      persist({...view,autoScale:!view.autoScale,domain:view.autoScale&&min>0&&max>min?{min,max}:null});setTab('chart');return;
    }
    if(action==='next-signal'){const signals=rsiCrossings(rows),next=signals.find(s=>s.date>view.selected)||signals[0];if(next)persist(applyChartCommand(view,prices,'date',next.date));setTab('chart');return;}
    if(action==='step'){
      const at=nearestPoint(displayPrices,view.selected),next=displayPrices[Math.max(0,Math.min(displayPrices.length-1,at+Number(value)))];
      if(next)persist(applyChartCommand(view,prices,'date',next[0]),false);setTab('chart');return;
    }
    if(action==='close-pane'){setPane(null);return;}
    try {persist(applyChartCommand(view,prices,action,value,Number(svg.current?.dataset.plotRight)-Number(svg.current?.dataset.plotLeft)||800));setTab('chart');setStatus('');}catch{setStatus('표시 범위를 확인하세요.');}
  };
  useEffect(()=>{
    chartCache?.set(symbol,{view,undo:undo.current,redo:redo.current});
  },[view,chartCache,symbol]);
  useEffect(()=>{
    if(embedded)document.body.dataset.rsiWorkbench='true';return()=>{if(embedded)delete document.body.dataset.rsiWorkbench;};
  },[embedded]);
  useEffect(()=>{
    if(!embedded)return;
    const receive=(event:MessageEvent)=>{
      const message=event.data;if(event.source!==window.parent||event.origin!==location.origin||message?.kind!=='atlas:center-command'||message.epoch!==epoch||message.symbol!==symbol||!active)return;
      command.current(message.action,message.value);
    };
    window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
  },[embedded,epoch,symbol,active]);
  useEffect(()=>{
    if(!embedded||!active)return;
    window.parent.postMessage({kind:'atlas:rsi-state',epoch,symbol,ready:true,unit:market.unit,timezone:market.timezone||'',revision,
      start:view.start,end:view.end,first:prices[0][0],last:prices.at(-1)![0],selected:point?.[0],close:point?.[1],rsi:row?.rsi??null,
      tool:view.tool,magnet:view.magnet,scale:view.scale,autoScale:view.autoScale,chartType:view.chartType,frequency:view.frequency,
      candles:barData.length>0,volume:barData.some(b=>b[5]!==null),canUndo:undo.current.length>0,canRedo:redo.current.length>0,measurement:view.measurement.length>0,pane,tab,userViewRevision:userViewRevision.current,urlView:chartUrlView(view)},location.origin);
  },[embedded,active,epoch,symbol,view,pane,tab,point?.[0],point?.[1],row?.rsi,barData,revision,market.unit,market.timezone,prices]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(!active||event.target instanceof Element&&event.target.closest('input,select,textarea,button,a,[contenteditable=true]'))return;
      let action='',value:unknown;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){action=event.shiftKey?'redo':'undo';}
      else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){action='pane';value='search';}
      else if(event.altKey&&event.key.toLowerCase()==='m'){action='magnet';}
      else if(event.altKey&&event.key.toLowerCase()==='g'){action='pane';value='date';}
      else if(['c','h','m'].includes(event.key.toLowerCase())&&!event.ctrlKey&&!event.metaKey){action='tool';value=({c:'crosshair',h:'pan',m:'measure'} as Record<string,string>)[event.key.toLowerCase()];}
      else if(event.key==='Escape'){if(!live.current.pane)return;action='close-pane';}
      else if(!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){action='step';value=event.key==='ArrowLeft'?-1:1;}
      if(action){event.preventDefault();event.stopPropagation();command.current(action,value);}
    };
    document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
  },[active]);
  useEffect(()=>{
    setPngUrl('');if(!exportText){setExportUrl('');return;}
    const url=URL.createObjectURL(new Blob([exportText],{type:'image/svg+xml'}));setExportUrl(url);let active=true,png='';const image=new Image();
    image.onload=()=>{if(!active)return;try{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth*2;canvas.height=image.naturalHeight*2;const context=canvas.getContext('2d');if(!context)throw new Error('canvas unavailable');context.drawImage(image,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(!active||!blob)return;png=URL.createObjectURL(blob);setPngUrl(png);},'image/png');}catch{if(active)setStatus('PNG를 생성하지 못했습니다.');}};
    image.onerror=()=>{if(active)setStatus('차트 이미지를 생성하지 못했습니다.');};image.src=url;
    return()=>{active=false;image.src='';URL.revokeObjectURL(url);if(png)URL.revokeObjectURL(png);};
  },[exportText]);
  function pick(p:Pick){setHover(null);if(view.tool==='measure')persist({...view,measurement:view.measurement.length===1&&view.measurement[0].panel===p.panel?[view.measurement[0],p]:[p]});
    else {persist({...view,selected:p.date},false);const at=nearestPoint(prices,p.date);props.onDate(at);}}
  function endGesture(){if(gesture.current&&JSON.stringify(gesture.current)!==JSON.stringify(live.current.view)){undo.current=[...undo.current,gesture.current].slice(-40);redo.current=[];userViewRevision.current++;persistStandaloneChartUrl(symbol,live.current.view,embedded);setView({...live.current.view});}gesture.current=null;}
  const [jump,setJump]=useState(view.selected),[from,setFrom]=useState(view.start),[to,setTo]=useState(view.end);
  const [menuPulse,setMenuPulse]=useState(0);
  return <section className="rsi-workbench" data-tab={tab} aria-label={`${symbol} 차트 작업 화면`}>
    <CompactToolbar label={`${symbol} 조회·보기`}>
      <CompactToolbarMenu name="rsi-observation" title={`${symbol} 선택 관측`} label={<span className="compact-toolbar-summary">선택 <span>{point?.[0]}</span><b>{point?axisNumber(point[1]):'—'}</b><span>{market.unit}</span><span className={change!=null&&change>=0?'gain':'loss'}>{change==null?'':`${change>=0?'+':''}${change.toFixed(2)}%`}</span></span>}>
        <dl><dt>종목 · 주기</dt><dd>{symbol} · {view.frequency==='daily'?'1D':'1W'}</dd><dt>선택일 · 종가</dt><dd>{point?.[0]} · {point?axisNumber(point[1]):'—'} {market.unit}</dd><dt>이전 관측 대비</dt><dd>{change==null?'—':`${change>=0?'+':''}${change.toFixed(2)}%`}</dd></dl>
        {bar&&<div className="compact-toolbar-summary"><span>O {axisNumber(bar[1])}</span><span>H {axisNumber(bar[2])}</span><span>L {axisNumber(bar[3])}</span><span>C {axisNumber(bar[4])}</span>{bar[5]!==null&&<span>V {bar[5].toLocaleString()}</span>}</div>}
        <p className="compact-toolbar-muted">표시 구간 {view.start} ~ {view.end} · 가격 단위 {market.unit}</p>
      </CompactToolbarMenu>
      <div className="compact-toolbar-tabs rsi-workbench-tabs" role="group" aria-label="삼플레 화면">{[['chart','차트'],['backtest','백테스트'],['records','기록']].map(([id,label])=><button key={id} data-rsi-view={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id as typeof tab)}>{label}</button>)}</div>
      {!embedded&&<div className="rsi-toolbar compact-toolbar-tabs">{[[365,'1년'],[1095,'3년'],[0,'전체']].map(([days,label])=><button className="compact-toolbar-action" key={days} type="button" aria-pressed={Number(days)===0&&view.start===prices[0][0]||Number(days)>0&&Math.abs(day(view.end)-day(view.start)-Number(days))<2} onClick={()=>command.current('span',days)}>{label}</button>)}<button className="compact-toolbar-action" type="button" onClick={()=>command.current('zoom',.7)}>확대</button><button className="compact-toolbar-action" type="button" onClick={()=>command.current('zoom',1.4)}>축소</button><button className="compact-toolbar-action" type="button" onClick={()=>command.current('pane','settings')}>설정</button></div>}
    </CompactToolbar>
    {status&&<p className="rsi-workbench-status" role="status">{status}</p>}
    <div className="rsi-workbench-body">
      {tab==='chart'?<RsiChartCanvas menuPulse={menuPulse} symbol={symbol} revision={`${revision||''}:${epoch}`} unit={market.unit} prices={displayPrices} bars={bars} rows={rows} view={view} active={active} hover={hover} svgRef={svg}
        onHover={setHover} onPick={pick} onView={next=>persist(next,false)} onStart={()=>{gesture.current=live.current.view;}} onEnd={endGesture}/>
        :<div className="rsi-history-page" data-mode={tab}><History symbol={symbol} unit={market.unit} prices={prices} rows={props.rows} revision={revision} cache={historyCache} onDate={index=>{selectDate(index);setTab('chart');}}/></div>}
      {pane&&<aside className="rsi-workbench-panel" aria-label={`${symbol} ${pane}`}><header><strong>{symbol} · {({data:'선택 데이터',indicators:'지표',settings:'차트 설정',method:'계산·출처',help:'차트 사용법',export:'차트 내보내기',date:'날짜 이동',search:'차트 명령 검색'} as Record<string,string>)[pane]}</strong><button type="button" aria-label="차트 패널 닫기" onClick={()=>setPane(null)}>×</button></header><div className="rsi-workbench-panel-scroll">
        {pane==='data'&&<><dl className="rsi-data-list"><dt>날짜</dt><dd>{point?.[0]}</dd><dt>종가 · {market.unit}</dt><dd>{point?.[1]}</dd><dt>RSI14</dt><dd>{row?.rsi??'미산출'}</dd><dt>SMA9</dt><dd>{row?.signal??'미산출'}</dd>{bar&&<><dt>시가 / 고가 / 저가</dt><dd>{bar.slice(1,4).map(v=>axisNumber(Number(v))).join(' / ')}</dd><dt>거래량</dt><dd>{bar[5]?.toLocaleString()??'자료 없음'}</dd></>}</dl><button type="button" onClick={()=>{setPane(null);setTab('records');}}>전체 기록</button><button type="button" onClick={()=>{setPane(null);setTab('backtest');}}>백테스트</button><details open={view.measurement.length>0}><summary>측정 눈금값</summary><table aria-label="측정 데이터"><thead><tr><th>날짜</th><th>값</th><th>단위</th></tr></thead><tbody>{view.measurement.map((anchor,index)=><tr key={index}><td>{anchor.date}</td><td>{anchor.value}</td><td>{anchor.panel==='rsi'?'RSI pt':market.unit}</td></tr>)}</tbody></table><button type="button" disabled={!view.measurement.length} onClick={()=>command.current('clear-measurement')}>측정 지우기</button></details><details className="ml-original"><summary>키움 일봉 RSI 비교</summary>{props.comparison}</details></>}
        {pane==='indicators'&&<>{[['showRsi','RSI14'],['showSignal','SMA9 신호'],['showLevels','기준선 29.5 / 33.5 / 40 / 43'],['showCrossings','Buy / Sell'],['showVolume','거래량']].map(([key,label])=><label className="rsi-panel-check" key={key}><input type="checkbox" checked={Boolean(view[key as keyof RsiChartView])} disabled={key==='showVolume'&&!barData.some(b=>b[5]!==null)} onChange={()=>command.current('toggle',key)}/>{label}</label>)}</>}
        {pane==='settings'&&<><label className="rsi-panel-field">가격 눈금<select value={view.scale} onChange={()=>command.current('scale')}><option value="log">로그</option><option value="linear">선형</option></select></label><label className="rsi-panel-field">가격 표시<select value={view.chartType} onChange={()=>command.current('type')}><option value="line">선</option><option value="candles" disabled={!barData.length}>캔들</option></select></label><label className="rsi-panel-check"><input type="checkbox" checked={view.autoScale} onChange={()=>command.current('auto-scale')}/>가격축 자동 맞춤</label><label className="rsi-panel-check"><input type="checkbox" checked={view.inverted} onChange={()=>command.current('invert-scale')}/>가격축 뒤집기</label><label className="rsi-panel-field">자석<select value={view.magnet} onChange={e=>command.current('magnet',e.currentTarget.value)}><option value="off">끄기</option><option value="weak">약하게</option><option value="strong">강하게</option></select></label><button type="button" onClick={()=>command.current('fit')}>전체 구간</button></>}
        {pane==='date'&&<><form onSubmit={e=>{e.preventDefault();command.current('date',jump);}}><label className="rsi-panel-field">이동할 날짜<input type="date" min={prices[0][0]} max={prices.at(-1)![0]} value={jump} onChange={e=>setJump(e.currentTarget.value)}/></label><button type="submit">이동</button></form><form onSubmit={e=>{e.preventDefault();try{persist({...view,...boundedDates(prices,from,to)});}catch{setStatus('기간을 확인하세요.');}}}><label className="rsi-panel-field">표시 시작<input type="date" value={from} onChange={e=>setFrom(e.currentTarget.value)}/></label><label className="rsi-panel-field">표시 종료<input type="date" value={to} onChange={e=>setTo(e.currentTarget.value)}/></label><button type="submit">기간 적용</button></form></>}
        {pane==='method'&&<><p>Wilder RSI14 / SMA9. 일봉 백테스트는 표시 주기와 독립입니다. 주봉은 제공된 완료 일봉을 집계하며 마지막 주는 진행 중일 수 있습니다. 주봉 표식은 원문의 일봉 전략으로 검증하지 않았습니다.</p><p>캔들은 원래 종가와 정확히 일치하는 실제 OHLC만 사용합니다. 분할에 대한 공급자 관행을 따르며 배당 조정·키움 RSI 동등성은 검증하지 않았습니다.</p><details><summary>OHLC·거래량 자료</summary><dl className="rsi-data-list"><dt>확보 시각</dt><dd>{String(evidence?.retrievedAt||'미확인')}</dd><dt>시각 근거</dt><dd>{evidence?.retrievalClockBasis==='original source receipt'?'기존 수집 영수증':'로컬 원문 파일 기록, HTTP 수집 시각 미보관'}</dd><dt>종가 일치 봉</dt><dd>{barData.length.toLocaleString()}</dd><dt>원문 SHA-256</dt><dd>{String(evidence?.responseSha256||'미확인')}</dd></dl></details>{props.references}<SourceDisclosure snapshot={snapshot} region={market.region} now={now}/></>}
        {pane==='help'&&<dl className="rsi-data-list"><dt>휠</dt><dd>오른쪽 끝을 유지하며 확대·축소</dd><dt>Ctrl + 휠</dt><dd>가리킨 위치에서 확대·축소</dd><dt>드래그</dt><dd>날짜·가격 위치 이동</dd><dt>가격축 드래그 / 휠</dt><dd>가격 눈금 조절</dd><dt>가격축 두 번 클릭</dt><dd>가격 자동 맞춤</dd><dt>시간축 드래그</dt><dd>표시 기간 조절</dd><dt>C / H / M</dt><dd>십자선 / 이동 / 두 점 측정</dd><dt>← / →</dt><dd>이전 / 다음 관측</dd><dt>0 / 두 번 클릭</dt><dd>전체 범위</dd><dt>Alt+G / Alt+M</dt><dd>날짜 이동 / 자석</dd><dt>Ctrl/⌘ Z</dt><dd>실행 취소</dd><dt>Shift Ctrl/⌘ Z</dt><dd>다시 실행</dd></dl>}
        {pane==='search'&&<><label className="rsi-panel-field">명령 검색<input type="search" value={search} onChange={e=>setSearch(e.currentTarget.value)} placeholder="기간, 지표, 캔들…"/></label>{([['전체 기간','fit'],['1년','span',365],['3년','span',1095],['선 / 캔들','type'],['일봉','frequency','daily'],['주봉','frequency','weekly'],['지표','pane','indicators'],['날짜 이동','pane','date'],['선택 데이터','pane','data'],['차트 내보내기','pane','export'],['실행 취소','undo'],['다시 실행','redo']] as [string,string,unknown?][]).filter(([label])=>label.toLowerCase().includes(search.toLowerCase())).map(([label,action,value])=><button className="rsi-command-option" type="button" key={label} onClick={()=>{setPane(null);command.current(action,value);}}>{label}</button>)}</>}
        {pane==='export'&&<><p>{symbol} {view.start} ~ {view.end}</p><button type="button" onClick={()=>{if(svg.current)setExportText(serializeSvg(svg.current,symbol,market.unit,view.frequency));}}>현재 차트 준비</button>{exportUrl&&<><a href={exportUrl} download={`${symbol}-${view.start}-${view.end}.svg`}>SVG 저장</a>{pngUrl&&<a href={pngUrl} download={`${symbol}-${view.start}-${view.end}.png`}>PNG 저장</a>}<img className="rsi-export-preview" src={pngUrl||exportUrl} alt={`${symbol} 현재 차트 내보내기 미리보기`}/><details><summary>SVG 원문</summary><textarea readOnly value={exportText} aria-label="차트 SVG 원문" onFocus={e=>e.currentTarget.select()}/></details></>}</>}
      </div></aside>}
    </div>
    <span className="atlas-sr-only" aria-live="polite">{status}</span>
  </section>;
}
