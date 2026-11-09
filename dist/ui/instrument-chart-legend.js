import {mountChartLegend,writeChartLegendMarkup} from './chart-legend.js?v=1.36.1';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const line=(color,dash='')=>`<path d="M1 6h16" stroke="${color}" stroke-width="1.5"${dash?` stroke-dasharray="${dash}"`:''}/>`;
const candles='<path d="M5 1v10" stroke="var(--green)"/><rect x="3" y="3" width="4" height="5" fill="var(--green)"/><path d="M13 2v9" stroke="var(--red)"/><rect x="11" y="5" width="4" height="4" fill="var(--red)"/>';
const sample=(label,title,shape,group='indicator')=>`<span class="instrument-legend-${group}" title="${esc(title)}"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" focusable="false" fill="none">${shape}</svg><span>${esc(label)}</span></span>`;

/** The common canvas also renders HYPE and monthly housing. Describe only
 * enabled, available observations; missing values never create a series. */
export function instrumentChartLegendMarkup({symbol,unit,prices=[],bars=[],rows=[],view={},series=null,markers=[],volumeUnit}={}){
  const entries=[],monthly=series?.frequency==='monthly';
  if(prices.length||bars.length){
    const isCandles=view.chartType==='candles'&&bars.length>0;
    const meaning=monthly?`${symbol}에 실제 공표된 월별 가격지수입니다. 미공표월은 선을 연결하거나 값을 채우지 않습니다.`:isCandles?
      `${symbol}의 확보한 실제 OHLC입니다.${view.frequency==='weekly'?' 주봉은 실제 일봉의 합계이며 마지막 주는 진행 중일 수 있습니다.':''}`:`${symbol}의 실제 관측 종가를 이은 선입니다.`;
    entries.push(sample(monthly?'실제 지수':isCandles?'관측 캔들':'실제 가격',`${meaning} 단위 ${unit}.`,isCandles?candles:line('var(--accent)'),'price'));
  }
  if(view.showRsi&&rows.some(row=>Number.isFinite(row.rsi))){
    entries.push(sample('RSI14','Wilder RSI14. 표시 주기의 관측 가격으로 계산합니다.',line('var(--ml-beta)')));
    if(view.showSignal&&rows.some(row=>Number.isFinite(row.signal)))entries.push(sample('SMA9','RSI14의 9개 관측 단순이동평균 신호선입니다.',line('var(--ml-gamma)')));
    if(view.showLevels)entries.push(sample('29.5 / 33.5 / 40 / 43','원문 기준선입니다. 기준선만으로 완전한 매매 규칙이나 주문 체결을 뜻하지 않습니다.',line('var(--subtle)','3 4')));
  }
  if(view.showCrossings&&rows.some(row=>Number.isFinite(row.rsi)))entries.push(sample('Buy / Sell','RSI 하향 33.5·29.5 통과는 Buy, 상향 40·43 통과는 Sell입니다. 기준선 통과 표식은 시뮬레이션의 체결과 구분합니다.','<path d="m4 3 3 6H1Z" fill="var(--green)"/><path d="m14 9 3-6h-6Z" fill="var(--red)"/>'));
  const volumes=series?.volumes||bars.map(bar=>({value:bar[5]}));
  if(view.showVolume&&volumes.some(row=>row.value!==null&&Number.isFinite(row.value))){
    entries.push(sample(volumeUnit?`거래량 · ${volumeUnit}`:'거래량','확보한 실제 거래량만 표시합니다. 미공표 거래량을 0으로 채우지 않습니다.','<rect x="2" y="6" width="3" height="5" fill="var(--muted)"/><rect x="8" y="2" width="3" height="9" fill="var(--muted)"/><rect x="14" y="4" width="3" height="7" fill="var(--muted)"/>'));
    if(volumes.some(row=>Number.isFinite(row.average)))entries.push(sample('과거 평균','선택한 과거 관측 기간으로 계산한 거래량 평균입니다.',line('var(--text)','5 4')));
    if(monthly)for(const [state,label,color]of [['above','상회','var(--housing-above,var(--green))'],['neutral','중립','var(--housing-neutral,var(--muted))'],['below','하회','var(--housing-below,var(--red))'],['warmup','산정 전','var(--housing-neutral,var(--muted))']]){
      if(volumes.some(row=>row.value!==null&&row.state===state))entries.push(sample(label,`실제 월별 거래량의 평균 대비 상태: ${label}.` ,`<rect x="3" y="3" width="12" height="6" fill="${color}"${state==='warmup'?' opacity=".25"':''}/>`));
    }
  }
  for(const[kind,label,meaning,color]of [['evidence','E · 근거','공개된 근거의 시점 표식입니다.','var(--border)'],['judgment','J · 판정','기록한 판정의 시점 표식입니다.','var(--accent)']])if(markers.some(marker=>marker.kind===kind)){
    entries.push(sample(label,meaning,'<rect x="3" y="2" width="12" height="8" fill="var(--surface-raised)" stroke="'+color+'"/>'));
  }
  return entries.join('');
}

export function mountInstrumentChartLegend({plot}={}){
  const doc=plot.ownerDocument,foot=doc.createElement('div'),source=doc.createElement('div');
  foot.className='lab-chart-foot';source.className='lab-legend';source.id='atlas-chart-legend';foot.append(source);plot.append(foot);
  const controller=mountChartLegend({plot,groups:[{id:'price',label:'가격 계열',shortLabel:'가격',selector:'.instrument-legend-price'},
    {id:'indicator',label:'보조 표시',shortLabel:'지표',selector:'.instrument-legend-indicator'}]});
  return {update(options,geometry){foot.hidden=options.active===false;writeChartLegendMarkup(source,instrumentChartLegendMarkup(options));controller.refresh(geometry);},
    destroy(){controller.destroy();foot.remove();}};
}
