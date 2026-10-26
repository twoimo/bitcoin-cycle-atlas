import {canonicalForecastJson} from './forecast-records.js?v=1.29.0';
import {validateAssetForecastIndex,verifyAssetForecastRecord,assetForecastIndexEntry,restoreAssetForecastPath} from './asset-forecast-records.js?v=1.29.0';
import {drawAtlasPriceChart} from './atlas-price-chart.js?v=1.29.0';
import {nearestDailyIndex} from './chart-math.js?v=1.29.0';
import {mountDialogViewport} from './dialog-viewport.js?v=1.29.0';

const SYMBOLS=new Set(['ETHUSD','BMNR','MSTR']);
const ROOT_PATH='data/asset-forecast-ledger/';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const price=value=>Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
const stamp=value=>value?value.replace('T',' ').replace('Z',' UTC'):'미상';
const day=value=>Date.parse(value+'T00:00:00Z')/86400000;
const fromDay=value=>new Date(value*86400000).toISOString().slice(0,10);
const scenarioName=id=>({stress:'스트레스',base:'기준 조건',bull:'채택 확대'})[id]??id;
function savedPathMeaning(record){
  const sampled=record.output.metadata?.assetPath?.method==='eth-post-merge-historical-blocks';
  const seed=record.options?.seed;
  const seedNote=Number.isSafeInteger(seed)?' · seed '+seed:'';
  const baseline=record.output.path.some(row=>Number.isFinite(row[4]));
  const blue=baseline?' 파란 점선은 저장한 외부 평가 조건·앱 가정의 기준선입니다.':'';
  if(record.symbol==='ETHUSD'&&sampled)return '금색은 고정한 seed로 추출한 잔차를 더한 무작위 예시 1개입니다'+seedNote+'.'+blue;
  if(record.symbol==='BMNR'&&sampled)return '금색은 기초 ETH 무작위 예시 1개를 보유량·현금·선순위 청구권·희석 계산에 전달한 조건부 주당 평가 경로입니다'+seedNote+'.';
  return '금색은 저장한 조건부 경로입니다.'+blue;
}
const same=(left,right)=>canonicalForecastJson(left)===canonicalForecastJson(right);
const aborted=()=>new DOMException('Research journal request cancelled','AbortError');

/** Fetch/verification ownership spans index, record, snapshot and timeout.
 * Abort is an optimization; generation checks also reject late ignored aborts. */
export function createAssetJournalLoader({
  baseUrl=globalThis.document?.baseURI,fetchImpl=globalThis.fetch,
  timeoutMs=15000,setTimer=setTimeout,clearTimer=clearTimeout,onState=()=>{},
}={}){
  if(!baseUrl||typeof fetchImpl!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new TypeError('A journal base URL, fetch implementation and positive timeout are required');
  let generation=0,current=null;
  function cancel(){
    generation++;
    if(current){current.controller.abort();current.reject(aborted());clearTimer(current.timer);current=null;}
  }
  async function read(path,request,{missingIndex=false}={}){
    const response=await fetchImpl(new URL(ROOT_PATH+path,baseUrl),{
      credentials:'omit',redirect:'error',cache:'no-cache',signal:request.controller.signal,
    });
    if(!request.owned())throw aborted();
    if(missingIndex&&response.status===404)return null;
    if(!response.ok)throw new Error('자료 요청 실패 · HTTP '+response.status);
    const length=Number(response.headers?.get?.('content-length'));
    if(Number.isFinite(length)&&length>12000000)throw new Error('기록 자료의 크기 제한을 초과했습니다.');
    const text=await response.text();
    if(!request.owned())throw aborted();
    if(text.length>12000000||new TextEncoder().encode(text).byteLength>12000000)throw new Error('기록 자료의 크기 제한을 초과했습니다.');
    return JSON.parse(text);
  }
  async function load({symbol,recordId=null}={}){
    if(!SYMBOLS.has(symbol))throw new RangeError('Unknown saved-research asset');
    cancel();
    const token=generation,controller=new AbortController();
    let rejectStop;
    const stopped=new Promise((_,reject)=>{rejectStop=reject;});
    const request={controller,reject:rejectStop,timer:null,owned:()=>current===request&&generation===token};
    current=request;
    request.timer=setTimer(()=>{
      if(!request.owned())return;
      controller.abort();
      rejectStop(new Error('기록 확인 시간이 초과되었습니다. 다시 시도해 주세요.'));
    },timeoutMs);
    onState({status:'loading',symbol});
    try{
      const work=(async()=>{
        const raw=await read('index.json',request,{missingIndex:true});
        if(raw===null){
          if(recordId!==null)throw new Error('선택한 보존 기록이 현재 색인에 없습니다. 목록을 다시 열어 주세요.');
          return {status:'empty',symbol,entries:[]};
        }
        const index=validateAssetForecastIndex(raw);
        const entries=index.entries.filter(entry=>entry.symbol===symbol)
          .sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||a.scenario.localeCompare(b.scenario)||a.id.localeCompare(b.id));
        if(recordId!==null&&!entries.some(item=>item.id===recordId))throw new Error('선택한 보존 기록이 현재 색인에 없습니다. 목록을 다시 열어 주세요.');
        if(!entries.length)return {status:'empty',symbol,entries};
        const entry=recordId!==null?entries.find(item=>item.id===recordId):entries.find(item=>item.scenario==='base')||entries[0];
        const [record,snapshot]=await Promise.all([read(entry.recordPath,request),read(entry.snapshotPath,request)]);
        if(!request.owned())throw aborted();
        await verifyAssetForecastRecord(record,snapshot);
        if(!same(assetForecastIndexEntry(record),entry))throw new Error('색인과 보존 기록의 식별자가 다릅니다.');
        if(!request.owned())throw aborted();
        return {status:'ready',symbol,entries,record,snapshot};
      })();
      const result=await Promise.race([work,stopped]);
      if(!request.owned())return null;
      onState(result);return result;
    }catch(error){
      if(!request.owned())return null;
      controller.abort();
      onState({status:'error',symbol,message:error?.message||'보존 기록을 검증하지 못했습니다.'});
      return null;
    }finally{
      clearTimer(request.timer);
      if(request.owned())current=null;
    }
  }
  return {load,cancel};
}
function table(headers,rows){
  return '<div class="journal-table-scroll" tabindex="0" role="region" aria-label="보존 기록 표 가로 이동"><table><thead><tr>'+
    headers.map(value=>'<th scope="col">'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+
    rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function download(record,snapshot){
  const url=URL.createObjectURL(new Blob([JSON.stringify({record,snapshot},null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;link.download='atlas-research-'+record.symbol+'-'+record.asOf+'-'+record.scenario.id+'-'+record.id.slice(0,10)+'.json';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function visible(node){
  return Boolean(node?.isConnected&&!node.closest?.('[hidden],[inert],[aria-hidden="true"]')&&node.getClientRects().length);
}
function svgElement(name,attributes){
  const element=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
}
let instance=null;
function mount(){
  const dialog=document.createElement('dialog');
  dialog.id='asset-forecast-journal';dialog.className='forecast-journal';
  dialog.setAttribute('aria-labelledby','asset-forecast-journal-title');
  dialog.innerHTML='<header class="journal-heading"><h2 id="asset-forecast-journal-title">자산 연구 발행 기록</h2><button type="button" data-asset-journal-close aria-label="자산 연구 기록 닫기">×</button></header><div class="journal-body" aria-live="polite"></div>';
  document.body.append(dialog);
  const viewport=mountDialogViewport(dialog),content=dialog.querySelector('.journal-body');
  let symbol='ETHUSD',recordId=null,days=180,selectedDate=null,opener=null,active=null,observer=null,draw=null,focusAfter=null;
  function stopChart(){
    observer?.disconnect();observer=null;draw=null;
    const svg=content.querySelector('svg');
    svg?.onpointermove?.cancel?.();
    if(svg)for(const key of ['onclick','onpointermove','onpointerleave','onkeydown','onkeyup','onblur'])svg[key]=null;
  }
  function load(){stopChart();active=null;void loader.load({symbol,recordId});}
  function errorBody(message){
    content.innerHTML='<p role="alert">기록을 확인하지 못했습니다. '+esc(message)+'</p><button type="button" data-asset-journal-retry>다시 확인</button> <button type="button" data-asset-journal-list>목록 다시 열기</button>';
  }
  function renderReady(state){
    stopChart();active=state;
    const {record,snapshot,entries}=state;
    if(recordId!==record.id)selectedDate=null;
    recordId=record.id;
    const timing=record.informationClock,isIssued=record.recordKind==='issued';
    const targetRows=record.targets.map(target=>[
      target.horizonDays+'일',target.targetDate,stamp(target.eventAt),
      ((Date.parse(target.eventAt)-Date.parse(record.issuedAt))/86400000).toFixed(2)+'일',
      price(target.price),price(target.flat),price(target.shrunkenTrend),
      !isIssued?'회고 재구성 · 전향 평가 제외':Date.parse(target.eventAt)>Date.now()?'미도래 · 미평가':'목표 도래 · 관측 판본 확인 필요',
    ]);
    const sources=timing.inputs.map(input=>[
      input.id,input.asOf??'문서',stamp(input.eventAt),input.sourceObservedThrough??'문서',
      stamp(input.sourceEventAt),stamp(input.publishedAt),stamp(input.collectedAt),
    ]);
    content.innerHTML='<div class="journal-controls"><select data-asset-journal-record aria-label="보존한 연구 발행본 선택">'+
      entries.map(entry=>'<option value="'+esc(entry.id)+'"'+(entry.id===record.id?' selected':'')+'>'+
        esc(entry.asOf+' · '+scenarioName(entry.scenario)+' · '+entry.id.slice(0,8))+'</option>').join('')+
      '</select><select data-asset-journal-range aria-label="보존 차트 표시 기간">'+
      [[90,'90일'],[180,'180일'],[365,'1년'],[0,'전체 경로']].map(([value,label])=>'<option value="'+value+'"'+(days===value?' selected':'')+'>'+label+'</option>').join('')+
      '</select><button type="button" data-asset-journal-export>입력·기록 JSON</button></div>'+
      '<p class="journal-note"><strong>'+esc(record.symbol)+' · '+(record.recordKind==='issued'?'실제 생성·보존한 연구 발행본':'현재 코드로 만든 회고 재구성')+
      '</strong><br>관측 기준 '+esc(record.asOf)+' · '+(isIssued?'실제 발행 ':'재구성 생성 ')+esc(stamp(record.issuedAt))+
      '<br>정보 컷오프 '+esc(stamp(record.informationCutoffAt))+'</p>'+
      '<p class="journal-note">초안 PR의 연구 기록입니다. 사이트 공개·기본 모형 채택과는 별도이며, 화면을 열 때 새 예측을 만들지 않습니다. 기록 시각과 고정한 입력·출력 해시를 검증한 저장본을 재생합니다.</p>'+
      '<div class="journal-chart"><svg id="asset-journal-price-chart" tabindex="0" role="group" aria-label="보존한 가격 경로. 방향키와 날짜 선택으로 고정된 값을 확인하세요."></svg></div>'+
      '<label class="journal-field" for="asset-journal-date">날짜 선택 <input id="asset-journal-date" data-asset-journal-date type="range" min="0" step="1" style="flex:1;min-width:0;min-height:36px" aria-describedby="asset-journal-selection"></label>'+
      '<p id="asset-journal-selection" class="journal-selection" aria-live="off"></p>'+
      '<p class="journal-note" data-asset-journal-scale></p>'+
      '<p class="journal-note">흰색은 '+(isIssued?'발행 당시 고정한 관측':'재구성에 사용한 관측')+'입니다. '+esc(savedPathMeaning(record))+' 이후 수집한 가격을 고정된 입력에 덧붙이지 않습니다. 음영은 세 조건의 최소·최대이며 확률이나 신뢰구간이 아닙니다.</p>'+
      '<h3>'+(isIssued?'발행 이후 목표 상태':'회고 재구성의 목표')+'</h3>'+table(['기간','목표 관측일','목표 종료 UTC','생성 시각 기준 일수','저장 경로','가격 유지','축소 추세','상태'],targetRows)+
      '<p class="journal-note">목표가 도래해도 실제 관측 판본과 그 수집 시각이 검증되기 전에는 오차를 표시하지 않습니다. 주식 목표는 달력 기간 이후 첫 검토된 거래일이며, 코인은 UTC 일말입니다.</p>'+
      '<details class="journal-details"><summary>입력 시각과 원본 근거</summary>'+
      table(['입력','사용한 관측일','사용 관측 종료','전체 원본의 마지막 관측','전체 원본 종료','정확한 공개시각','실제 수집시각'],sources)+
      '<p>정확한 공개시각을 모르면 미상으로 남깁니다. 수집시각은 그 원본을 알게 된 가장 늦은 시각을 증명할 뿐, 과거에 실제 수집했다는 근거가 아닙니다. 주식 뉴욕 마감과 코인 UTC 일말은 같은 시각이 아닙니다.</p>'+
      '<ul>'+timing.inputs.map(input=>'<li><a href="'+esc(input.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(input.id)+' · 고정 원본</a></li>').join('')+'</ul></details>'+
      '<details class="journal-details"><summary>모델 판본과 수정 이유</summary><dl>'+
      [['모형',record.model.version],['모형 검토일',record.output.metadata?.modelReviewedAt??'별도 기록 없음'],['실제 생성 소스 커밋',record.model.sourceCommit],['모형 소스 해시',record.model.sourceHash],['입력 해시',record.snapshotDataHash],['출력 해시',record.outputHash],['기록 ID',record.id],['이전 기록 ID',record.replaces??'첫 기록'],['수정 이유',record.revisionReason??'이전 보존본을 수정하지 않은 새 기록']].map(([label,value])=>'<dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd>').join('')+
      '</dl><p>후속 판본은 이전 기록을 덮어쓰지 않습니다. 기본 모형 승격, 경제 입력의 검증 통과 또는 외부 검토 완료를 뜻하지 않습니다.</p></details>';
    content.querySelector('[data-asset-journal-export]').onclick=()=>download(record,snapshot);
    mountChart(record,snapshot);
    if(focusAfter&&dialog.open&&(document.activeElement===document.body||document.activeElement===dialog))content.querySelector(focusAfter)?.focus({preventScroll:true});
    focusAfter=null;
  }
  function mountChart(record,snapshot){
    const svg=content.querySelector('svg'),slider=content.querySelector('[data-asset-journal-date]'),selection=content.querySelector('#asset-journal-selection');
    const frozen=restoreAssetForecastPath(record);
    const end=days?fromDay(Math.min(day(record.output.displayEnd),day(record.asOf)+days)):record.output.displayEnd;
    const start=fromDay(Math.max(day(snapshot.inputs.primaryPrices[0][0]),day(record.asOf)-90));
    const rows=[...snapshot.inputs.primaryPrices.filter(([date])=>date<record.asOf).map(([date,price])=>({date,price})),...frozen];
    const visibleRows=rows.filter(row=>row.date>=start&&row.date<=end),byDate=new Map(visibleRows.map((row,index)=>[row.date,{row,index}]));
    const zeroMode=visibleRows.some(row=>row.price===0||row.lower===0);
    let minimum=Infinity,maximum=0,chart=null,selectSaved=null;
    for(const row of visibleRows){
      minimum=Math.min(minimum,row.lower??row.price,row.price);
      maximum=Math.max(maximum,row.upper??row.price,row.price);
      if(Number.isFinite(row.baselinePrice)){
        minimum=Math.min(minimum,row.baselinePrice);
        maximum=Math.max(maximum,row.baselinePrice);
      }
    }
    const domain={min:zeroMode?0:minimum*.95,max:maximum*1.05};
    const inspect=row=>{
      if(!row)return;
      selectedDate=row.date;
      const index=byDate.get(row.date)?.index??0;
      slider.value=String(index);
      slider.setAttribute('aria-valuetext',row.date+' · '+price(row.price));
      selection.textContent=row.date+' · '+(row.date>record.asOf?(record.symbol==='ETHUSD'&&record.output.metadata?.assetPath?.method==='eth-post-merge-historical-blocks'?'보존한 무작위 예시 1개':'보존한 조건부 가정'):(record.recordKind==='issued'?'발행 당시 관측':'재구성 입력 관측'))+' '+price(row.price)+
        (row.date>record.asOf?' · 조건 범위 '+price(row.lower)+' – '+price(row.upper):'')+
        (Number.isFinite(row.baselinePrice)?' · 저장 기준선 '+price(row.baselinePrice):'');
    };
    slider.max=String(visibleRows.length-1);
    content.querySelector('[data-asset-journal-scale]').textContent=zeroMode?
      '0인 경로 또는 조건 경계를 보존하기 위해 선형 축을 사용합니다. 날짜 선택과 방향키로 0 이후의 저장값도 확인할 수 있습니다.':
      '가격 차트는 로그 축입니다. 날짜 선택과 방향키로 저장된 일별 값을 확인할 수 있습니다.';
    const initial=byDate.get(selectedDate)?.row??byDate.get(record.asOf)?.row??visibleRows[0];inspect(initial);
    slider.oninput=()=>{
      const row=visibleRows[Number(slider.value)];
      if(!row)return;
      if(selectSaved)selectSaved(row);else chart?.selectDate(row.date);
      inspect(row);
    };
    draw=()=>{
      if(!svg.isConnected||!dialog.open||!svg.getClientRects().length)return;
      chart=drawAtlasPriceChart({svg,rows:zeroMode?rows.filter(row=>row.date<=record.asOf):rows,start,end,split:record.asOf,scale:zeroMode?'linear':'log',priceDomain:domain,
        band:!zeroMode,selectedDate,showDrawdown:false,showTurns:false,showCycleMarkers:false,showHistoricalEvents:false,
        headerInset:16,dateTickMinSpacing:64,onHover:value=>{if(!zeroMode)inspect(byDate.get(value?.date)?.row);}});
      const title=svg.querySelector('title');if(title)title.textContent=record.symbol+' · 발행 당시 관측과 보존한 조건부 경로';
      svg.dataset.assetJournalRecord=record.id;svg.dataset.assetJournalScale=zeroMode?'linear':'log';
      svg.dataset.assetJournalFrozenRows=String(frozen.length);
      selectSaved=null;
      const chartKeydown=svg.onkeydown;
      svg.onkeydown=event=>{if(event.key!=='Escape')chartKeydown?.call(svg,event);};
      if(!chart)return;
      const axis=chart.getPriceScale(),span=Math.max(1,day(end)-day(start));
      const x=date=>axis.left+(day(date)-day(start))/span*(axis.right-axis.left);
      const baseline=frozen.filter(row=>row.date>=start&&row.date<=end&&Number.isFinite(row.baselinePrice));
      if(baseline.length){
        let prior=null;
        const d=baseline.map(row=>{const command=prior!==null&&day(row.date)-day(prior)===1?'L':'M';prior=row.date;return command+x(row.date).toFixed(2)+','+axis.y(row.baselinePrice).toFixed(2);}).join(' ');
        const baselinePath=svgElement('path',{d,fill:'none',stroke:'#73b9eb','stroke-width':'1.6','stroke-dasharray':'2 5','pointer-events':'none','clip-path':'url(#'+svg.id+'-price-clip)','data-asset-journal-baseline':'true','data-baseline-points':baseline.length});
        svg.append(baselinePath);
      }
      if(!zeroMode)return;
      // Draw the exact nonnegative saved future in the reviewed linear scale.
      const future=frozen.filter(row=>row.date>=start&&row.date<=end);
      const group=svgElement('g',{'clip-path':'url(#'+svg.id+'-price-clip)','data-asset-journal-zero-overlay':'true','pointer-events':'none'});
      const vertices=(list,key)=>list.map(row=>x(row.date).toFixed(2)+','+axis.y(row[key]).toFixed(2));
      group.append(svgElement('path',{d:'M'+vertices(future,'upper').join(' L')+' L'+vertices([...future].reverse(),'lower').join(' L')+' Z',fill:'#cda65e',opacity:'.13'}));
      group.append(svgElement('path',{d:'M'+vertices(future,'price').join(' L'),fill:'none',stroke:'#e4bd71','stroke-width':'1.8','stroke-dasharray':'5 4'}));
      const cursor=svgElement('line',{y1:axis.top,y2:axis.bottom,stroke:'#b7c7db','stroke-dasharray':'3 3'});
      const dot=svgElement('circle',{r:3.2,fill:'#f4d393',stroke:'#111820','stroke-width':1});
      group.append(cursor,dot);svg.append(group);
      svg.querySelector('[id$="-cross"]')?.setAttribute('display','none');
      selectSaved=row=>{
        inspect(row);const at=x(row.date);
        cursor.setAttribute('x1',String(at));cursor.setAttribute('x2',String(at));
        dot.setAttribute('cx',String(at));dot.setAttribute('cy',String(axis.y(row.price)));
      };
      svg.onpointermove?.cancel?.();
      const pointer=event=>{
        if(event.pointerType==='touch')return;
        const rect=svg.getBoundingClientRect(),width=svg.viewBox.baseVal.width||svg.clientWidth;
        if(!rect.width)return;
        const px=(event.clientX-rect.left)/rect.width*width;
        if(px<axis.left||px>axis.right)return;
        const at=day(start)+(px-axis.left)/(axis.right-axis.left)*span;
        selectSaved(visibleRows[nearestDailyIndex(visibleRows,at)]);
      };
      svg.onpointermove=pointer;svg.onpointerleave=()=>{};
      svg.onclick=event=>{pointer(event);svg.focus({preventScroll:true});};
      svg.onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const selected=byDate.get(selectedDate)?.index??0;
        const index=event.key==='Home'?0:event.key==='End'?visibleRows.length-1:Math.max(0,Math.min(visibleRows.length-1,selected+(event.key==='ArrowLeft'?-1:1)));
        selectSaved(visibleRows[index]);
      };
      svg.onkeyup=null;svg.onblur=null;
      selectSaved(byDate.get(selectedDate)?.row??initial);
    };
    draw();
    if(typeof ResizeObserver==='function'){observer=new ResizeObserver(()=>draw?.());observer.observe(svg.parentElement);}
  }
  const loader=createAssetJournalLoader({onState:state=>{
    if(!dialog.open||!dialog.isConnected)return;
    dialog.dataset.state=state.status;dialog.dataset.symbol=state.symbol;
    if(state.status==='ready')dialog.dataset.recordId=state.record.id;else delete dialog.dataset.recordId;
    if(state.status==='loading')content.innerHTML='<p role="status">보존한 입력과 경로를 검증하고 있습니다.</p>';
    else if(state.status==='error'){stopChart();active=null;errorBody(state.message);}
    else if(state.status==='empty'){
      stopChart();active=null;
      content.innerHTML='<p>아직 '+esc(symbol)+'의 보존한 연구 발행본이 없습니다. 실제 생성·보존한 기록이 추가되면 이곳에서 확인할 수 있습니다.</p><button type="button" data-asset-journal-retry>다시 확인</button>';
    }else if(state.status==='ready')renderReady(state);
  }});
  dialog.addEventListener('click',event=>{
    if(event.target.closest?.('[data-asset-journal-close]'))dialog.close();
    else if(event.target.closest?.('[data-asset-journal-retry]')){focusAfter='[data-asset-journal-record]';load();}
    else if(event.target.closest?.('[data-asset-journal-list]')){recordId=null;selectedDate=null;focusAfter='[data-asset-journal-record]';load();}
    else if(event.target===dialog){
      const box=dialog.getBoundingClientRect();
      if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
    }
  });
  dialog.addEventListener('change',event=>{
    if(event.target.matches('[data-asset-journal-record]')){
      recordId=event.target.value;selectedDate=null;focusAfter='[data-asset-journal-record]';load();
    }else if(event.target.matches('[data-asset-journal-range]')&&active){
      days=Number(event.target.value);focusAfter='[data-asset-journal-range]';renderReady(active);
    }
  });
  dialog.addEventListener('close',()=>{
    // A native close task may arrive after a synchronous reopen.
    if(dialog.open)return;
    loader.cancel();stopChart();active=null;focusAfter=null;dialog.dataset.state='closed';delete dialog.dataset.recordId;
    if(document.visibilityState==='hidden')return;
    const fallback=[...document.querySelectorAll('[data-eth-action="forecast"],[data-equity-action="forecast"]')].find(visible);
    const target=visible(opener)?opener:fallback;target?.focus({preventScroll:true});
  });
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  document.addEventListener('atlas:modal-open',event=>{if(event.detail?.id!==dialog.id&&dialog.open)dialog.close();});
  window.addEventListener('pagehide',event=>{
    loader.cancel();stopChart();if(dialog.open)dialog.close();
    if(!event.persisted)viewport.destroy();
  });
  return {open({symbol:asset='ETHUSD',opener:source=document.activeElement}={}){
    if(!SYMBOLS.has(asset))throw new RangeError('Unknown saved-research asset');
    loader.cancel();stopChart();
    if(symbol!==asset){recordId=null;selectedDate=null;}
    symbol=asset;opener=source;active=null;
    dialog.querySelector('h2').textContent=asset+' · 연구 발행 기록';
    document.dispatchEvent(new CustomEvent('atlas:modal-open',{detail:{id:dialog.id}}));
    if(!dialog.open)dialog.showModal();
    dialog.querySelector('[data-asset-journal-close]').focus({preventScroll:true});load();
  }};
}
export function openAssetForecastJournal(options={}){
  instance ||= mount();instance.open(options);
}
