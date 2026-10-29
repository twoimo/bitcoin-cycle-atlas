import {bindPreservedArchiveDownload} from './preserved-archive-download.js?v=1.29.0';
import {buildEthereumForecasts} from './ethereum-forecast.js';
import {buildEthereumAdaptiveForecast} from './ethereum-adaptive-model.js';
import {buildEthereumPooledForecast} from './ethereum-pooled-model.js';
import {ethereumResearchPanel} from './ethereum-research-panel.js';
import { CHART_INTERVALS, chartInterval, isIntradayInterval, fetchMarketCandles } from './ohlc-data.js?v=1.29.0';
import { parseEthArchive, mergeEthArchive } from './eth-market-data.js?v=1.29.0';
import { createMarketDataController, marketStatusText } from "./market-data-controller.js?v=1.29.0";
import { drawIntradayChart } from "./intraday-chart.js?v=1.29.0";
import { bindChartNavigation } from './chart-navigation.js?v=1.29.0';
import { mountChartTouchTracking } from "./chart-touch-tracking.js?v=1.29.0";
import { clearChartHover } from './chart-hover.js?v=1.29.0';
import { mountSymbolSelector } from './symbol-selector.js?v=1.29.0';
import { readEthView, ethViewQuery, ethHistoryRange } from './eth-view-state.js?v=1.29.0';
import { ETHEREUM_EVENTS, ETHEREUM_EVENT_COLORS, getEthereumEvents } from './ethereum-events.js?v=1.29.0';
import { mountEthereumHistory, readEthereumEventSettings, ethereumEventQuery, ethereumEventRange } from './ethereum-history.js?v=1.29.0';

const glyphs = {
  line:'<path d="m3 17 5-7 5 4 8-11"/>',
  candles:'<path d="M7 2v4m0 10v6M17 2v8m0 8v4"/><rect x="4" y="6" width="6" height="10"/><rect x="14" y="10" width="6" height="8"/>',
  crosshair:'<path d="M12 2v5m0 10v5M2 12h5m10 0h5"/><circle cx="12" cy="12" r="4"/>',
  pan:'<path d="M8 12V7a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  future:'<path d="m3 17 5-5 5 3 8-10M16 5h5v5"/>',
  history:'<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/><path d="M12 7v5l3 2"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]}</svg>`;
const nf = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const number = value => Number.isFinite(value) ? nf.format(value) : '—';
const stamp = value => value ? value.replace('T',' ').slice(0,16) + ' UTC' : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const actionButton = (action,label,glyph) => `<button type="button" class="eth-icon" data-eth-action="${action}" aria-label="${label}" title="${label}">${icon(glyph)}</button>`;

export async function initEthView() {
  // Keep the boot controller and embedded JSON; remove BTC-only controls from
  // the document as well as the accessibility tree before opening this view.
  for (const node of document.querySelectorAll('body > :not(#atlas-boot-shell):not(script)')) node.remove();
  document.body.dataset.market = 'ETHUSD';
  document.title = 'ETHUSD · Ethereum — Bitcoin Cycle Atlas';
  const params = new URLSearchParams(location.search);
  const state = {...readEthView(params),ethModel:['pooled','valuation'].includes(params.get('eth-model'))?params.get('eth-model'):(!params.has('eth-model')&&params.has('eth-scenario'))?'valuation':'adaptive',forecastVisible:params.get('forecast')!=='off',ethScenario:['stress','base','bull'].includes(params.get('eth-scenario'))?params.get('eth-scenario'):'base',eventSettings:readEthereumEventSettings(params),selectedHistoryEvent:null,tool:'crosshair',range:null,priceDomain:null,controller:null,selectedTime:null,frame:null,loading:false,error:null,refreshError:null};
  let forecastBundle=null,forecastError=null,adaptiveForecast=null,adaptiveError=null,pooledForecast=null,pooledError=null,infoMode='data';
  let payload = null, daily = null, weekly = null, archiveRequest = null, generation = 0, navigationRevision = 0, ready = false, suspended = false;
  const app = document.createElement('main');
  app.id = 'main';app.className = 'eth-app';app.dataset.bootContent = '';app.inert = true;app.setAttribute('aria-hidden','true');
  app.innerHTML = `
    <nav class="eth-tools" aria-label="차트 조작 도구">
      <span class="eth-brand" title="Ethereum" aria-hidden="true"><svg viewBox="0 0 24 32"><path d="m12 1 11 17-11 6L1 18Z" fill="#bec7f9"/><path d="m12 1 0 23 11-6Z" fill="#7d8abb"/><path d="m1 20 11 11 11-11-11 6Z" fill="#a9b5ed"/></svg></span>
      ${actionButton('crosshair','십자선 · C','crosshair')}${actionButton('pan','차트 이동 · H','pan')}
      <span class="eth-rail-unit">USD</span>
    </nav>
    <header class="eth-topbar" aria-label="차트 상단 도구">
      <button id="eth-symbol" class="workbench-symbol" type="button">ETHUSD</button>
      <div class="eth-interval-buttons" role="group" aria-label="가격 표시 간격">${CHART_INTERVALS.map(item=>`<button type="button" data-eth-interval="${item.id}">${item.label}</button>`).join('')}</div>
      <select id="eth-interval" aria-label="가격 표시 간격">${CHART_INTERVALS.map(item=>`<option value="${item.id}">${item.label}</option>`).join('')}</select>
      <span class="eth-divider" aria-hidden="true"></span>
      <div class="eth-chart-types" role="group" aria-label="차트 유형">${actionButton('line','가격선','line')}${actionButton('candles','캔들','candles')}</div>
      <span class="eth-top-spacer"></span>
      ${actionButton('forecast','ETH 미래 가정과 근거','future')}
      <button id="eth-history-trigger" class="eth-icon" type="button" aria-label="이더리움 역사 사건" title="역사 사건 · 표시 설정과 원문">${icon('history')}</button>
      ${actionButton('refresh','ETH 가격 새로고침','refresh')}${actionButton('info','ETH 데이터 출처와 조회 상태','info')}
    </header>
    <section class="atlas-plot eth-plot" aria-label="이더리움 실제 가격과 조건부 미래 경로">
      <svg id="eth-chart" role="group" tabindex="0" aria-label="ETH-USD 실선·캔들은 실제 관측, 파란 점선은 조건 기준선, 금색 점선은 무작위 예시 1개이며 확률이 아닙니다. 음영은 세 조건의 예시 범위입니다. 드래그로 이동, 휠이나 두 손가락으로 확대·축소하고 방향키로 값을 확인하세요."></svg>
      <div class="eth-readout"><div class="eth-readout-heading"><strong>Ethereum / USD</strong><span id="eth-readout-interval"></span><span class="eth-venue">COINBASE</span></div><div class="eth-readout-value"><strong id="eth-price">—</strong><span id="eth-change"></span><span id="eth-kind"></span><time id="eth-bar-time"></time></div><div id="eth-ohlc" class="eth-ohlc"></div></div>
      <div id="eth-forecast-note" class="eth-forecast-note" hidden><span class="eth-observed-key">— 실제 관측</span><span class="eth-baseline-key">·· 조건 기준선</span><span class="eth-envelope-key">음영: 세 조건 범위</span><span class="eth-sample-key">┄ 무작위 예시 1개 · 확률 아님</span></div>
      <div id="eth-empty" class="eth-empty" role="status"><p id="eth-empty-message">ETH-USD 가격 자료를 불러오고 있습니다.</p><button type="button" data-eth-action="refresh" hidden>다시 조회</button></div>
      <button type="button" id="eth-touch-hint" class="chart-touch-tracking-hint" hidden>값 추적 중 · 탭하여 종료</button>
    </section>
    <footer class="eth-bottom" aria-label="차트 기간과 가격축">
      <div id="eth-periods" class="eth-periods" role="group" aria-label="표시 기간">${[['1m','1개월'],['6m','6개월'],['1y','1년'],['4y','4년'],['all','전체']].map(([id,label])=>`<button type="button" data-eth-span="${id}">${label}</button>`).join('')}</div>
      <select id="eth-period-select" aria-label="표시 기간">${[['1m','1개월'],['6m','6개월'],['1y','1년'],['4y','4년'],['all','전체']].map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select>
      <button id="eth-recent" type="button" data-eth-action="reset" hidden>최근 구간</button>
      <span id="eth-status" role="status" aria-live="polite"></span><span class="eth-timezone">UTC</span>
      <button type="button" data-eth-action="scale" title="로그 / 선형 가격축 전환">로그</button><button type="button" data-eth-action="auto" title="가격축 자동 맞춤">Auto</button>
    </footer>
    <span id="eth-announcement" class="lab-visually-hidden" role="status" aria-live="polite"></span>`;
  document.body.append(app);
  const $ = selector => app.querySelector(selector), $$ = selector => [...app.querySelectorAll(selector)];
  const svg = $('#eth-chart'), plot = $('.eth-plot'), readout = $('.eth-readout');
  const info = document.createElement('dialog');info.id='eth-data-dialog';info.className='eth-data-dialog';info.setAttribute('aria-labelledby','eth-data-title');
  info.innerHTML=`<header><h2 id="eth-data-title">ETHUSD 데이터</h2><button type="button" aria-label="데이터 설명 닫기">${icon('close')}</button></header><div id="eth-data-content"></div>`;
  document.body.append(info);
  info.querySelector('button').onclick=()=>info.close();
  info.addEventListener('click',event=>{if(event.target===info){const b=info.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)info.close();}});
  mountSymbolSelector({button:$('#eth-symbol'),symbol:'ETHUSD'});

  const market = createMarketDataController({product:'ETH-USD',snapshotUrl:'./data/eth-ohlc.json',preferSnapshot:true,readEmbedded:()=>payload?JSON.stringify(payload):null,onChange:(frequency)=>{if(state.frequency===frequency&&isIntradayInterval(frequency))schedule();}});
  const currentSeries = () => isIntradayInterval(state.frequency) ? market.get(state.frequency).series : state.frequency==='weekly'?weekly:daily;
  const announce = text => {$('#eth-announcement').textContent=text;};
  const touch = mountChartTouchTracking({element:plot,getTool:()=>state.tool,canStart:point=>{
    const b=svg.getBoundingClientRect(),v=svg.viewBox.baseVal,x=(point.clientX-b.left)/b.width*v.width,y=(point.clientY-b.top)/b.height*v.height;
    return Boolean(state.controller)&&x>=Number(svg.dataset.plotLeft)&&x<=Number(svg.dataset.plotRight)&&y>=Number(svg.dataset.plotTop)&&y<=Number(svg.dataset.priceBottom);
  },preview:point=>state.controller?.previewPointer?.(point),clear:()=>state.controller?.clearPreview?.(),cancelNavigation:()=>navigation.cancelGesture(),resumeNavigation:points=>navigation.resumeTouchGesture(points),onChange:active=>{$('#eth-touch-hint').hidden=!active;}});
  $('#eth-touch-hint').onclick=()=>touch.cancel();
  const navigation = bindChartNavigation({element:plot,getRange:()=>state.range,getTool:()=>state.tool,getPriceAxis:()=>state.controller?.getPriceScale?.(),getContext:context=>state.controller?.getSelection?.(context),
    onGestureStart:()=>touch.cancelPending(),onMenuOpen:()=>touch.cancel(),onRangeChange:range=>{++navigationRevision;state.range=range;if(isIntradayInterval(state.frequency))void market.ensureRange(state.frequency,range);schedule();},
    onPriceRangeChange:domain=>{++navigationRevision;state.priceDomain=domain;schedule();},onPriceReset:()=>{++navigationRevision;state.priceDomain=null;schedule();},onReset:()=>resetRange(false),onAnnounce:announce});
  document.addEventListener('atlas:modal-open',event=>{touch.cancel();navigation.cancelGesture();if(event.detail?.id!==info.id&&info.open)info.close();});
  const historyWorkbench = mountEthereumHistory({button:$('#eth-history-trigger'),initialSettings:state.eventSettings,
    onSettingsChange:settings=>{cancelInteraction();state.eventSettings=settings;persist();schedule();},onFocusEvent:focusHistoricalEvent});

  function persist(){try{history.replaceState(null,'',`${location.pathname}?${ethereumEventQuery(ethViewQuery(state),state.eventSettings)}`);}catch{}}
  function cancelInteraction(){touch.cancel();navigation.cancelGesture();clearChartHover(svg);state.selectedTime=null;}
  function resetRange(cancel=true){if(cancel)cancelInteraction();++navigationRevision;state.range=null;state.priceDomain=null;state.span='4y';persist();schedule();}
  async function focusHistoricalEvent(id){
    const event=ETHEREUM_EVENTS.find(item=>item.id===id);if(!event)return false;
    cancelInteraction();
    if(state.frequency!=='daily')await changeInterval('daily');
    else if(!daily)await load();
    const range=ethereumEventRange(event,daily);
    if(!range){announce('이 사건 날짜에는 표시할 일봉 가격 자료가 없습니다.');return false;}
    ++navigationRevision;state.selectedHistoryEvent=id;state.range=range;state.priceDomain=null;state.eventSettings.visible=true;
    if(state.eventSettings.category!=='all'&&state.eventSettings.category!==event.category)state.eventSettings.category='all';
    historyWorkbench.setSettings(state.eventSettings);persist();schedule();announce(`${event.date} ${event.title} 구간을 표시합니다.`);return true;
  }
  function openHistoricalEvent(id){cancelInteraction();state.selectedHistoryEvent=id;historyWorkbench.open(id);schedule();}
  function updateHistoryContext(){historyWorkbench.update({frequency:state.frequency,firstDate:daily?.firstDate?.slice(0,10),lastDate:daily?.lastDate?.slice(0,10),dailySeries:daily,visibleCount:Number(svg.dataset.historyEventCount||0)});}
  function ensureForecast(){
    if(state.ethModel==='pooled'){
      if(payload&&daily&&!pooledForecast&&!pooledError){
        try{pooledForecast=buildEthereumPooledForecast({ethHistory:payload,asOf:daily.lastDate.slice(0,10)});}
        catch(error){pooledError=error.message||'ETH 전체 수익률 입력을 확인해 주세요.';}
      }
      return pooledForecast;
    }
    if(state.ethModel==='adaptive'){
      if(payload&&daily&&!adaptiveForecast&&!adaptiveError){
        try{adaptiveForecast=buildEthereumAdaptiveForecast({ethHistory:payload,asOf:daily.lastDate.slice(0,10)});}
        catch(error){adaptiveError=error.message||'ETH 연구 모형의 관측 입력을 확인해 주세요.';}
      }
      return adaptiveForecast;
    }
    if(payload&&daily&&!forecastBundle&&!forecastError){
      try{forecastBundle=buildEthereumForecasts({ethHistory:payload,asOf:daily.lastDate.slice(0,10)});}
      catch(error){forecastError=error.message||'ETH 미래 조건 입력을 확인해 주세요.';}
    }
    return forecastBundle?.forecasts[state.ethScenario]??null;
  }
  function visibleForecast(){return !isIntradayInterval(state.frequency)&&state.forecastVisible?ensureForecast():null;}
  function openInfo(mode='data'){
    cancelInteraction();infoMode=mode;
    document.dispatchEvent(new CustomEvent('atlas:modal-open',{detail:{id:info.id}}));
    if(mode==='forecast')renderForecastInfo();else renderInfo();
    if(!info.open)info.showModal();
  }
  function renderForecastInfo(){
    const focused=document.activeElement?.id;
    try{
    info.querySelector('#eth-data-title').textContent='ETH 조건부 미래 경로';
    const selected=ensureForecast(),model=selected?.assetPath;
    const modelControl=`<div class="eth-forecast-controls"><label for="eth-model">미래 경로 모형</label><select id="eth-model"><option value="adaptive" ${state.ethModel==='adaptive'?'selected':''}>ETH 자체 기간·변동성 연구</option><option value="pooled" ${state.ethModel==='pooled'?'selected':''}>전체 수익률·변동성 비교 후보</option><option value="valuation" ${state.ethModel==='valuation'?'selected':''}>기존 외부 평가 조건 · BMNR 공통</option></select></div>`;
    if(['adaptive','pooled'].includes(state.ethModel)){
      info.querySelector('#eth-data-content').innerHTML=modelControl+`<div class="eth-forecast-controls"><label><input id="eth-forecast-visible" type="checkbox" ${state.forecastVisible?'checked':''}> 일봉·주봉에 연구 경로 표시</label></div>`+ethereumResearchPanel(selected,state.ethModel==='pooled'?pooledError:adaptiveError,state.ethModel)+`<button type="button" data-open-asset-forecast-journal="ETHUSD">보존한 연구 발행본</button> <button type="button" data-open-forecast-journal="data">자료 상태·공통 기준시각</button>`;
      return;
    }
    const options=[['stress','스트레스 · $360 기준선'],['base','현재 가격 기준선'],['bull','채택 확대 · $22,000 기준선']];
    info.querySelector('#eth-data-content').innerHTML=modelControl+`<p class="eth-data-lead">조건 기준선과 무작위 예시 1개</p><div class="eth-forecast-controls"><label for="eth-scenario">외부 평가 조건 · 앱 가정</label><select id="eth-scenario">${options.map(([id,label])=>`<option value="${id}" ${state.ethScenario===id?'selected':''}>${esc(label)}</option>`).join('')}</select><label><input id="eth-forecast-visible" type="checkbox" ${state.forecastVisible?'checked':''}> 일봉·주봉에 기준선·예시 경로 표시</label></div>${model?`<dl><dt>실제 관측 기준일</dt><dd>${esc(selected.asOf)}</dd><dt>학습 관측</dt><dd>${esc(model.training.firstObservation)} – ${esc(model.training.informationThrough)} · ${model.training.observations.toLocaleString('en-US')}일</dd><dt>외부 조건 발표일</dt><dd>${esc(model.training.researchAsOf)} · 과거 연구 조건</dd><dt>재현 seed</dt><dd>${model.metadata.seed}</dd><dt>선택한 기준선</dt><dd>${esc(model.anchors[0].date)} · $${number(model.anchors[0].price)}</dd><dt>표시 종료</dt><dd>${esc(selected.displayEnd)}</dd></dl>`:`<p class="eth-data-error">${esc(forecastError||'완료 일봉 자료를 준비하고 있습니다.')}</p>`}<p>이 기존 외부 평가 모드에서 ETH와 BMNR의 코인 입력은 같은 기준일·seed에서 같은 경로를 사용합니다. ETH 관측 범위는 주식 거래일보다 나중에 끝날 수 있으므로 각 화면의 기준일을 함께 확인하세요.</p><p>2030년 $360·$22,000은 VanEck의 2024년 연구에서 선택한 외부 평가 조건입니다. 원문의 기준 조건 $22,000을 앱의 채택 확대 사례로 선택했고, 현재 가격 유지·2030년 이후 기준선 유지는 앱 가정입니다. 원문의 전체 모형을 재현하거나 현재의 새 전망으로 해석하지 않습니다.</p><p>파란 점선은 선택한 외부 평가 조건과 앱 가정의 조건 기준선입니다. 금색 점선은 기준선에 무작위 잔차 하나를 더한 예시입니다. 사용량·수수료·소각·발행·스테이킹을 관측 자료에 적합한 경제 모형의 결과가 아닙니다.</p><p>과거 수익률의 28일 블록을 하나의 seed로 추출하고 최근 90일 변동성과 730일 잔차 반감기를 유지합니다. 세 조건은 같은 잔차를 사용합니다. 목표값은 기준선이며 실제 모의 종착점을 강제로 맞추지 않습니다.</p><p>실선·채운 캔들은 실제 완료 OHLC이고, 미래의 금색 점선은 일별 모의 종가의 무작위 예시 1개입니다. 미래 OHLC·거래량을 합성하지 않습니다. 음영은 세 조건의 최소·최대이며 확률·신뢰구간·가능한 손실의 전체 범위가 아닙니다. 분·시간봉에서는 미래 조건을 표시하지 않습니다.</p><p><a href="https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-eth-2030-price-target/" target="_blank" rel="noopener noreferrer">VanEck 2024 ETH 평가 원문 ↗</a></p><p><a href="https://eips.ethereum.org/EIPS/eip-3675" target="_blank" rel="noopener noreferrer">Merge · EIP-3675 ↗</a></p><button type="button" data-open-asset-forecast-journal="ETHUSD">보존한 연구 발행본</button> <button type="button" data-open-forecast-journal="data">자료 상태·공통 기준시각</button>`;
    }finally{if(['eth-model','eth-scenario','eth-forecast-visible'].includes(focused))info.querySelector('#'+focused)?.focus();}
  }
  info.addEventListener('change',event=>{
    if(event.target.id==='eth-model'&&['adaptive','pooled','valuation'].includes(event.target.value))state.ethModel=event.target.value;
    else if(event.target.id==='eth-scenario'&&['stress','base','bull'].includes(event.target.value))state.ethScenario=event.target.value;
    else if(event.target.id==='eth-forecast-visible')state.forecastVisible=event.target.checked;else return;
    cancelInteraction();++navigationRevision;state.range=null;state.priceDomain=null;persist();renderForecastInfo();if(event.target.id==='eth-model')info.querySelector('#eth-model')?.focus();schedule();
  });
  function showReadout(row){
    $('#eth-kind').textContent=row.kind==='forecast'?(state.ethModel!=='valuation'?'모형 예시':'무작위 예시'):'';
    if(row.kind==='forecast'){
      $('#eth-price').textContent=`$${number(row.price)}`;$('#eth-change').textContent='';
      $('#eth-bar-time').textContent=(row.date||'').slice(0,10);$('#eth-bar-time').dateTime=row.date||'';
      $('#eth-ohlc').innerHTML=`<span>${state.ethModel!=='valuation'?'모의 10–90%':'세 조건 범위'} $${number(row.low)} – $${number(row.high)}</span><span>미래 OHLC 아님</span>`;
      if(!row.hovered)state.selectedTime=row.time;return;
    }
    if(row.kind==='unavailable'){$('#eth-price').textContent='—';$('#eth-change').textContent='';$('#eth-bar-time').textContent='';$('#eth-ohlc').textContent='이 구간에 완료된 봉이 없습니다.';return;}
    $('#eth-price').textContent=`$${number(row.close)}`;
    const change=Number.isFinite(row.changePct)?row.changePct:null;
    $('#eth-change').textContent=change===null?'':`${change>=0?'+':'−'}${number(Math.abs(change))}%`;
    $('#eth-change').className=change===null?'':change>=0?'eth-gain':'eth-loss';
    $('#eth-bar-time').textContent=(row.date||'').slice(0,isIntradayInterval(state.frequency)?16:10).replace('T',' ');
    $('#eth-bar-time').dateTime=row.date||'';
    $('#eth-ohlc').innerHTML=[['O',row.open],['H',row.high],['L',row.low],['C',row.close]].map(([label,value])=>`<span><i>${label}</i> ${number(value)}</span>`).join('');
    if(!row.hovered)state.selectedTime=row.time;
  }
  function renderInfo(){
    info.querySelector('#eth-data-title').textContent='ETHUSD 데이터';
    const series=currentSeries();
    if(!series){info.querySelector('#eth-data-content').innerHTML='<p>표시할 완료 봉이 없습니다. 다시 조회해 주세요.</p>';return;}
    const intraday=isIntradayInterval(state.frequency),entry=intraday?market.get(state.frequency):null;
    info.querySelector('#eth-data-content').innerHTML=`<p class="eth-data-lead">Ethereum / U.S. Dollar <strong>ETH-USD</strong></p><dl><dt>거래소</dt><dd>Coinbase Exchange · USD 현물</dd><dt>표시 간격</dt><dd>${chartInterval(state.frequency).label} · 완료 봉 ${series.candles.length.toLocaleString('en-US')}개</dd><dt>조회된 봉 시작 시각</dt><dd>${stamp(series.firstDate)}<br>— ${stamp(series.lastDate)}</dd><dt>저장 자료 수집</dt><dd>${stamp(series.retrievedAt)}</dd>${series.historyRetrievedAt?`<dt>추가 조회</dt><dd>${stamp(series.historyRetrievedAt)}</dd>`:''}<dt>누락된 간격</dt><dd>${series.gapCount||0}개 · 빈 구간 유지</dd></dl><p>선은 실제 봉의 종가, 캔들은 같은 봉의 시가·고가·저가·종가입니다. 진행 중인 봉은 표시하지 않습니다. 30분·4시간·주봉은 빠짐없이 이어지는 완료 봉만 집계합니다.</p><p>날짜는 UTC의 봉 시작 시각입니다. 거래소·지수에 따라 다른 차트와 가격이 다를 수 있습니다.</p>${entry?.error||state.refreshError?'<p class="eth-data-error">최근 조회에 실패해 마지막 유효 자료를 표시합니다. 원래 수집 시각을 유지합니다.</p>':''}<a href="https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles" target="_blank" rel="noopener noreferrer">Coinbase OHLC 데이터 안내 ↗</a><p><a href="./data/eth-ohlc.json" target="_blank" rel="noopener noreferrer">보존한 일별 원자료(JSON) ↗</a> · <a href="${esc(location.pathname)}?page=data">18개 자산 비교표 ↗</a></p><button type="button" data-open-forecast-journal="data">자료 상태·공통 기준시각</button>`;
    bindPreservedArchiveDownload(info,'ETHUSD');
  }
  function revealReady(){if(ready)return;ready=true;document.dispatchEvent(new CustomEvent('atlas:ready'));}
  function render(){
    state.frame=null;if(suspended)return;
    const series=currentSeries(),intraday=isIntradayInterval(state.frequency),entry=intraday?market.get(state.frequency):null;
    $('#eth-interval').value=state.frequency;
    $('#eth-readout-interval').textContent=`· ${chartInterval(state.frequency).label}`;
    for(const button of $$('[data-eth-interval]')){const active=button.dataset.ethInterval===state.frequency;button.setAttribute('aria-pressed',String(active));button.tabIndex=active?0:-1;}
    for(const button of $$('[data-eth-action]')){const action=button.dataset.ethAction;if(['line','candles','crosshair','pan'].includes(action))button.setAttribute('aria-pressed',String(action===state.chartType||action===state.tool));}
    const scale=$('[data-eth-action="scale"]');scale.textContent=state.scale==='log'?'로그':'선형';scale.setAttribute('aria-pressed',String(state.scale==='log'));
    $('[data-eth-action="auto"]').setAttribute('aria-pressed',String(!state.priceDomain));
    for(const button of $$('[data-eth-span]'))button.setAttribute('aria-pressed',String(button.dataset.ethSpan===state.span));
    $('#eth-period-select').value=state.span;
    $('#eth-periods').hidden=intraday;$('#eth-period-select').hidden=intraday;$('#eth-recent').hidden=!intraday;
    const busy=state.loading||entry?.status==='loading';
    $('[data-eth-action="refresh"]').disabled=busy;plot.setAttribute('aria-busy',String(busy));
    $('#eth-empty').hidden=Boolean(series);
    readout.hidden=!series;
    if(!series){
      svg.innerHTML='';state.controller=null;state.range=null;
      svg.dataset.historyEventCount='0';updateHistoryContext();
      const error=state.error||entry?.error;
      $('#eth-empty-message').textContent=error?'ETH-USD 가격 자료를 불러오지 못했습니다. 연결을 확인하고 다시 조회해 주세요.':'ETH-USD 가격 자료를 불러오고 있습니다.';
      $('#eth-empty button').hidden=!error;$('#eth-status').textContent=error?'조회 실패':'불러오는 중';
      navigation.update();if(error)revealReady();return;
    }
    const forecast=visibleForecast();
    $('#eth-forecast-note').hidden=!forecast;
    $('#eth-forecast-note').title=forecast?`${forecast.scenario.label} · 관측 ${forecast.asOf}`:'';
    const adaptive=['adaptive','pooled'].includes(forecast?.researchModel);
    $('#eth-forecast-note').querySelector('.eth-baseline-key').textContent=adaptive?'·· 모형 중앙값':'·· 조건 기준선';
    $('#eth-forecast-note').querySelector('.eth-envelope-key').textContent=adaptive?'음영: 모의 10–90%':'음영: 세 조건 범위';
    $('#eth-forecast-note').querySelector('.eth-sample-key').textContent=adaptive?'┄ 모형 예시 1개 · 적중률 미보정':'┄ 무작위 예시 1개 · 확률 아님';
    svg.dataset.forecastModel=forecast?state.ethModel:'none';
    svg.setAttribute('aria-label',adaptive?'ETH-USD 실제 관측, 파란 점선은 모형 중앙값, 금색 점선은 모의 예시 1개, 음영은 모의 10–90% 분위수이며 실제 적중률 보장이 아닙니다. 드래그·휠·방향키로 탐색하세요.':'ETH-USD 실제 관측, 파란 점선은 외부 조건 기준선, 금색 점선은 무작위 예시 1개, 음영은 세 조건 범위이며 확률이 아닙니다. 드래그·휠·방향키로 탐색하세요.');
    $('[data-eth-action="forecast"]').setAttribute('aria-pressed',String(Boolean(forecast)));
    if(!state.range)state.range=intraday?market.range(state.frequency):ethHistoryRange(series,state.span,null,forecast?.displayEnd);
    // Keep readable semantic keys outside the price clip at every font/viewport size.
    const forecastNote=$('#eth-forecast-note'),noteBottom=forecastNote.offsetTop+forecastNote.offsetHeight;
    const headerInset=Math.max(plot.clientHeight<300?(forecast?70:54):(forecast?100:76),
      forecast&&Number.isFinite(noteBottom)?Math.ceil(noteBottom+8):0);
    state.controller=drawIntradayChart({svg,series,range:state.range,chartType:state.chartType,scale:state.scale,priceDomain:state.priceDomain,showVolume:false,tool:state.tool,selectedTime:state.selectedTime,headerInset,forecast,onForecastEvidence:()=>openInfo('forecast'),historyStatus:entry?.historyStatus||'ready',onHover:showReadout,
      historicalEvents:getEthereumEvents({category:state.eventSettings.category}),showHistoricalEvents:state.eventSettings.visible,activeHistoricalEventId:state.selectedHistoryEvent,historicalEventColors:ETHEREUM_EVENT_COLORS,onHistoricalEvent:openHistoricalEvent});
    updateHistoryContext();
    const status=intraday?marketStatusText(entry):`Coinbase ETH-USD · ${busy?'갱신 중':state.refreshError?'연결 실패 · 저장 자료':series.snapshot?'저장 자료':'완료 봉'} · ${stamp(series.lastDate)}${series.gapCount?` · 빈 봉 ${series.gapCount}개`:''}`;
    $('#eth-status').textContent=entry?.historyStatus==='loading'?'과거 봉 조회 중':state.refreshError||entry?.error?'연결 실패 · 저장 자료':`${series.snapshot?'저장 자료':'완료 봉'} · ${series.lastDate.slice(0,10)}`;
    $('#eth-status').title=status;$('#eth-status').setAttribute('aria-label',status);
    plot.dataset.tool=state.tool;navigation.update();if(info.open){if(infoMode==='forecast')renderForecastInfo();else renderInfo();}revealReady();
  }
  function schedule(){if(!suspended&&state.frame===null)state.frame=requestAnimationFrame(render);}
  function setPayload(value){const nextDaily=parseEthArchive(value),nextWeekly=parseEthArchive(value,'weekly');payload=value;daily=nextDaily;weekly=nextWeekly;forecastBundle=null;forecastError=null;adaptiveForecast=null;adaptiveError=null;pooledForecast=null;pooledError=null;}
  async function getArchive(signal){
    const embedded=document.getElementById('embedded-eth-data')?.textContent;
    if(embedded)return JSON.parse(embedded);
    const response=await fetch('./data/eth-ohlc.json',{credentials:'omit',cache:'no-cache',signal});
    if(!response.ok)throw new Error(`ETH snapshot HTTP ${response.status}`);
    return response.json();
  }
  async function load({force=false}={}){
    if(suspended)return;
    const navigationToken=navigationRevision;
    const token=++generation;archiveRequest?.abort();market.cancel();
    const request=new AbortController();archiveRequest=request;
    const timer=setTimeout(()=>request.abort(),20000);state.loading=true;state.error=null;state.refreshError=null;schedule();
    try{
      if(!payload){
        try{const saved=await getArchive(request.signal);if(token!==generation)return;setPayload(saved);}
        catch(error){if(token!==generation)return;if(!isIntradayInterval(state.frequency))throw error;}
      }
      if(isIntradayInterval(state.frequency)){
        state.loading=false;await market.load(state.frequency,{force});
        if(token===generation&&force&&navigationToken===navigationRevision){cancelInteraction();state.range=null;state.priceDomain=null;}
      }else if(force){
        const fresh=await fetchMarketCandles({product:'ETH-USD',interval:'daily',count:300,signal:request.signal});
        if(token!==generation)return;
        setPayload(mergeEthArchive(payload,fresh));
        // A response owns its prices, not a date/price range chosen after it
        // started. Refresh bounds while retaining the user's later navigation.
        if(navigationToken===navigationRevision)state.range=null;
        else if(state.range)state.range=ethHistoryRange(currentSeries(),state.span,state.range,visibleForecast()?.displayEnd);
      }
    }catch(error){
      if(token!==generation)return;
      if(currentSeries())state.refreshError=error.message||'조회 실패';
      else state.error=error.message||'조회 실패';
    }finally{clearTimeout(timer);if(token===generation){state.loading=false;archiveRequest=null;schedule();}}
  }
  async function changeInterval(value){
    if(value===state.frequency||!CHART_INTERVALS.some(item=>item.id===value))return;
    cancelInteraction();++navigationRevision;state.frequency=value;state.range=null;state.priceDomain=null;state.error=null;persist();await load();
  }
  function changeSpan(value){if(!['1m','6m','1y','4y','all'].includes(value))return;cancelInteraction();++navigationRevision;state.span=value;state.range=null;state.priceDomain=null;persist();schedule();}
  app.addEventListener('click',event=>{
    const interval=event.target.closest('[data-eth-interval]');if(interval){void changeInterval(interval.dataset.ethInterval);return;}
    const span=event.target.closest('[data-eth-span]');if(span){changeSpan(span.dataset.ethSpan);return;}
    const button=event.target.closest('[data-eth-action]');if(!button)return;
    const action=button.dataset.ethAction;
    if(action==='refresh'){void load({force:true});return;}
    if(action==='info'){openInfo();return;}
    if(action==='forecast'){openInfo('forecast');return;}
    if(action==='reset'){resetRange();return;}
    cancelInteraction();
    if(['line','candles','scale','auto'].includes(action))++navigationRevision;
    if(['line','candles'].includes(action)){state.chartType=action;state.priceDomain=null;}
    if(['crosshair','pan'].includes(action))state.tool=action;
    if(action==='scale'){state.scale=state.scale==='log'?'linear':'log';state.priceDomain=null;}
    if(action==='auto')state.priceDomain=null;
    persist();schedule();
  });
  $('#eth-interval').onchange=event=>void changeInterval(event.target.value);
  $('#eth-period-select').onchange=event=>changeSpan(event.target.value);
  $('.eth-interval-buttons').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const buttons=$$('[data-eth-interval]'),i=buttons.indexOf(event.target),n=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    buttons[n].click();buttons[n].focus();
  });
  document.addEventListener('keydown',event=>{if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.target.closest('input,select,textarea,dialog,[contenteditable="true"]'))return;const action={c:'crosshair',h:'pan'}[event.key.toLowerCase()];if(action){event.preventDefault();$(`[data-eth-action="${action}"]`).click();}});
  const observer=new ResizeObserver(()=>schedule());observer.observe(plot);
  document.fonts?.ready.then(()=>schedule());
  window.addEventListener('pagehide',event=>{
    suspended=true;++generation;archiveRequest?.abort();market.cancel();state.loading=false;
    if(state.frame!==null){cancelAnimationFrame(state.frame);state.frame=null;}
    cancelInteraction();
    // A Back/Forward cache restoration keeps the same document and listeners.
    // Destroy them only when the browser discards this document entirely.
    if(!event.persisted){touch.destroy();navigation.destroy();observer.disconnect();historyWorkbench.destroy();}
  });
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    suspended=false;
    if(!currentSeries())void load();else schedule();
  });
  persist();await load();
  await new Promise(resolve=>requestAnimationFrame(()=>{render();resolve();}));
}
