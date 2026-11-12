import {createPriceAxisLabelVisibility} from './price-axis.js?v=1.29.0';

const NS='http://www.w3.org/2000/svg';
const INTERVAL_SECONDS=Object.freeze({'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,daily:86400,weekly:604800});
const dateMs=value=>typeof value==='number'?value*1000:Date.parse(value);
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;

/** CSV text cells are literal data even when imported into spreadsheet software. */
export function chartCsvCell(value){if(value==null)return '';let text=String(value);if(typeof value==='string'&&(/^[\t\r\n]/u.test(text)||/^\s*[=+@\-]/u.test(text)))text="'"+text;return /[",\r\n]/u.test(text)?`"${text.replaceAll('"','""')}"`:text;}
const csv=lines=>'\uFEFF'+lines.map(line=>line.map(chartCsvCell).join(',')).join('\r\n')+'\r\n';

export function chartExportRange(range,frequency='daily'){
  if(!range)throw new RangeError('저장할 표시 범위가 없습니다.');
  const multiplier=range.unit==='days'||range.unit!=='seconds'&&['daily','weekly'].includes(frequency)?86400000:1000;
  const start=typeof range.start==='number'?range.start*multiplier:Date.parse(range.start),end=typeof range.end==='number'?range.end*multiplier:Date.parse(range.end);
  if(![start,end].every(Number.isFinite)||end<start||!Number.isFinite(new Date(start).getTime())||!Number.isFinite(new Date(end).getTime()))throw new RangeError('저장할 표시 범위가 올바르지 않습니다.');
  return {start,end,startUTC:new Date(start).toISOString(),endUTC:new Date(end).toISOString()};
}

export function selectObservedChartRows({rows=[],candles=null,range,frequency='daily',asOf,completedBefore}={}){
  const window=chartExportRange(range,frequency),intraday=!['daily','weekly'].includes(frequency),cutoff=asOf?Date.parse(asOf):Infinity,completed=completedBefore?dateMs(completedBefore):Infinity;
  if(asOf&&!Number.isFinite(cutoff)||completedBefore&&!Number.isFinite(completed))throw new RangeError('관측 완료 기준 시각이 올바르지 않습니다.');
  const selected=(candles||rows).filter(row=>{
    const time=candles&&intraday?dateMs(row.time??row.date):Date.parse(row.date);
    if(!Number.isFinite(time)||time<window.start||time>window.end||(!intraday&&time>cutoff)||row.complete===false||row.completed===false)return false;
    if(row.kind&&!['observed','actual','observed-anchor'].includes(row.kind))return false;
    if(candles&&intraday&&Number.isFinite(completed)&&time+(INTERVAL_SECONDS[frequency]||0)*1000>completed)return false;
    return true;
  }).map(row=>({...row})).sort((a,b)=>dateMs(candles&&intraday?a.time??a.date:a.date)-dateMs(candles&&intraday?b.time??b.date:b.date));
  if(!selected.length)throw new RangeError('현재 범위에 저장할 실제 관측값이 없습니다.');
  const seen=new Set();
  for(const row of selected){
    const key=candles&&intraday?row.time??row.date:row.date;if(seen.has(key))throw new RangeError('중복된 관측 시각이 있어 CSV를 만들지 않았습니다.');seen.add(key);
    if(candles){if(!['open','high','low','close'].every(key=>positive(row[key]))||row.low>Math.min(row.open,row.close)||row.high<Math.max(row.open,row.close)||row.high<row.low||row.volume!=null&&(!Number.isFinite(row.volume)||row.volume<0))throw new RangeError('유효하지 않은 OHLC 관측값입니다.');}
    else if(!positive(row.price))throw new RangeError('유효하지 않은 관측 가격입니다.');
  }
  return selected;
}

/** Export original observations in the visible window, never sampled pixels or model paths. */
export function createObservedChartCsv({rows=[],candles=null,range,frequency='daily',asOf,source='Coin Metrics',completedBefore}={}) {
  const selected=selectObservedChartRows({rows,candles,range,frequency,asOf,completedBefore});
  const lines=[['chart_date_utc','candle_open_utc','interval','source','currency','open','high','low','close','volume_btc','kind']];
  for(const row of selected){
    const price=candles?row.close:row.price;if(!Number.isFinite(price)||price<=0)throw new RangeError('유효하지 않은 관측 가격입니다.');
    const opened=candles&&Number.isSafeInteger(row.time)?new Date(row.time*1000).toISOString():'';
    const record=candles?[row.date,opened,frequency,source,'USD',row.open,row.high,row.low,row.close,row.volume,'observed']:[row.date,'','daily',source,'USD',null,null,null,row.price,null,'observed'];
    lines.push(record);
  }
  return csv(lines);
}

/** Conditional model rows are a separate file and always carry scenario identity. */
export function createConditionalChartCsv({path=[],range,asOf,scenarioId='',scenarioLabel='',source='Atlas conditional model'}={}){
  const window=chartExportRange(range,'daily'),cutoff=Date.parse(asOf);if(!Number.isFinite(cutoff))throw new RangeError('가정 CSV에는 관측 기준일이 필요합니다.');
  const selected=path.filter(row=>{const time=Date.parse(row.date);return Number.isFinite(time)&&time>cutoff&&time>=window.start&&time<=window.end;});
  if(!selected.length)throw new RangeError('현재 범위에 저장할 조건부 가정값이 없습니다.');
  const lines=[['chart_date_utc','interval','source','currency','price','lower_scenario','upper_scenario','scenario_id','scenario_label','observation_cutoff_utc','kind','probability_interval']];
  const seen=new Set();for(const row of selected){if(seen.has(row.date)||!positive(row.price)||row.lower!=null&&!positive(row.lower)||row.upper!=null&&!positive(row.upper))throw new RangeError('유효하지 않은 조건부 가정값입니다.');seen.add(row.date);lines.push([row.date,'daily',source,'USD',row.price,row.lower??null,row.upper??null,scenarioId,scenarioLabel,asOf,'conditional',false]);}
  return csv(lines);
}

/** Explicitly provided analysis rows only: no indicator series is reconstructed from pixels. */
export function createResearchSeriesCsv({rows=[],columns=[],range,filterByRange=false,interval='daily',source='',unit='',kind='derived'}={}){
  if(!columns.length||columns.some(column=>!column?.key||!column?.label))throw new RangeError('분석 CSV 열 정의가 없습니다.');
  const window=filterByRange?chartExportRange(range,interval):null,selected=window?rows.filter(row=>{const time=dateMs(row.time??row.date);return Number.isFinite(time)&&time>=window.start&&time<=window.end;}):rows;
  if(!selected.length)throw new RangeError('현재 범위에 저장할 분석 값이 없습니다.');
  const lines=[['date_utc','interval','source','unit','kind',...columns.map(column=>column.label)]];
  for(const row of selected){const values=columns.map(column=>row[column.key]??null);if(values.some(value=>typeof value==='number'&&!Number.isFinite(value)))throw new RangeError('분석 CSV에 유효하지 않은 수치가 있습니다.');lines.push([row.date??(Number.isFinite(row.time)?new Date(row.time*1000).toISOString():''),interval,source,unit,kind,...values]);}return csv(lines);
}

/** Conservative text wrapping keeps vector exports legible at phone widths. */
export function wrapExportText(text,width,fontSize=11){
  const limit=Math.max(5,width/fontSize),lines=[];let line='',units=0;
  for(const char of String(text??'').replace(/\s+/gu,' ').trim()){
    const size=/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uff00-\uffef]/u.test(char)?1:.62;
    if(units+size>limit&&line){lines.push(line.trim());line='';units=0;}
    line+=char;units+=size;
  }
  if(line.trim())lines.push(line.trim());return lines;
}

const EXPORT_PAINT_PROPERTIES=Object.freeze([
  'color','fill','fill-opacity','fill-rule','stroke','stroke-opacity','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','opacity','paint-order','vector-effect',
  'font-family','font-size','font-style','font-weight','font-variant','font-stretch','letter-spacing','word-spacing','text-anchor','dominant-baseline','alignment-baseline',
  'stop-color','stop-opacity','flood-color','flood-opacity','lighting-color','filter','clip-path','mask','marker-start','marker-mid','marker-end',
]);
const computedStyleFor=node=>{const view=node?.ownerDocument?.defaultView;return typeof view?.getComputedStyle==='function'?view.getComputedStyle.bind(view):null;};
const styleValue=(style,name)=>String(style?.getPropertyValue?.(name)??style?.[name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]??'').trim();
function exportPaintValue(value,node){
  if(/\b(?:var|env)\s*\(/i.test(value))throw new Error('차트 표시 색을 확정할 수 없습니다. 화면을 다시 연 뒤 저장해 주세요.');
  return value.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi,(_match,_quote,reference)=>{
    if(reference.startsWith('#'))return `url("${reference}")`;
    const base=node.ownerDocument?.URL||node.ownerDocument?.baseURI||node.baseURI;
    if(base){const url=new URL(reference,base),documentUrl=new URL(base);if(url.hash&&url.href.split('#')[0]===documentUrl.href.split('#')[0])return `url("${url.hash}")`;}
    throw new Error('외부 자산을 참조하는 차트 색은 저장할 수 없습니다.');
  });
}

/** Resolve CSS while the live tree still owns its selectors and inherited
 * tokens. Only its independent clone receives paint; paths, data and ordering
 * remain untouched. Visibility is deliberately not inherited into descendants:
 * the axis pass must reveal its latest badge after removing the live cursor. */
export function materializeChartPaint(source,clone,{getComputedStyle=computedStyleFor(source)}={}){
  if(source===clone)throw new TypeError('차트 표시는 독립 복제본에만 적용할 수 있습니다.');
  if(!getComputedStyle)return clone;
  const originals=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  if(originals.length!==copies.length||originals.some((node,index)=>node.tagName!==copies[index].tagName))throw new TypeError('차트 복제본의 구조가 원본과 다릅니다.');
  // Collect first so an unsupported paint cannot leave a partly frozen clone.
  const paints=originals.map(node=>{const style=getComputedStyle(node);return EXPORT_PAINT_PROPERTIES.flatMap(name=>{
    let value=styleValue(style,name);if(!value)return [];
    value=exportPaintValue(value,node);
    // Axis collision layout reads this existing SVG attribute as a number.
    if(name==='font-size'&&/^(?:\d+(?:\.\d*)?|\.\d+)px$/i.test(value))value=value.slice(0,-2);
    return [[name,value]];
  });});
  copies.forEach((node,index)=>{for(const [name,value]of paints[index]){
    node.setAttribute(name,value);
    // An inline var() would otherwise outrank the resolved presentation attr.
    node.style?.removeProperty?.(name);
  }});
  return clone;
}

/** Export chrome uses the same semantic roles as the current document. The
 * temporary, out-of-flow probe resolves light-dark()/aliases without parsing
 * CSS or retaining a page stylesheet in the standalone SVG. */
export function chartExportTheme(svg,{getComputedStyle=computedStyleFor(svg)}={}){
  const doc=svg.ownerDocument,style=getComputedStyle?.(svg),preferred=doc.documentElement?.dataset?.theme;
  const scheme=styleValue(style,'color-scheme'),colorScheme=scheme==='dark'||scheme!=='light'&&preferred==='dark'?'dark':'light';
  const fontFamily=styleValue(style,'font-family')||'sans-serif';
  const palette={background:'Canvas',text:'CanvasText',muted:'CanvasText',subtle:'CanvasText',border:'CanvasText'};
  const host=doc.body||doc.documentElement;
  if(getComputedStyle&&doc.createElement&&host?.appendChild){
    const probe=doc.createElement('span');
    try{
      probe.setAttribute('aria-hidden','true');
      probe.setAttribute('style',`position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;color-scheme:${colorScheme}`);
      host.appendChild(probe);
      for(const [key,token]of Object.entries({background:'--bg',text:'--text',muted:'--muted',subtle:'--subtle',border:'--border'})){
        probe.style.setProperty('color',`var(${token},${palette[key]})`);
        const value=styleValue(getComputedStyle(probe),'color');if(value)palette[key]=exportPaintValue(value,probe);
      }
    }finally{probe.remove();}
  }
  return {...palette,colorScheme,fontFamily};
}

export function createChartSvgExport(svg,{title='BTCUSD',readout='',source='',note='',countdown='',panels=[],legend=[]}={}){
  if(!svg)throw new TypeError('저장할 차트가 없습니다.');
  const box=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/u).map(Number);
  const width=box.length===4?box[2]:svg.clientWidth,height=box.length===4?box[3]:svg.clientHeight;
  if(!(width>0&&height>0))throw new RangeError('표시 중인 차트만 저장할 수 있습니다.');
  const doc=svg.ownerDocument,make=(tag,attrs={},text)=>{const node=doc.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
  const theme=chartExportTheme(svg);
  const readableWidth=Math.max(80,width-28),head=[...wrapExportText(title,readableWidth,14).map(text=>({text,size:14,color:theme.text})),...wrapExportText(readout,readableWidth,11).map(text=>({text,size:11,color:theme.muted}))];
  if(countdown)head.push(...wrapExportText(countdown,readableWidth,10).map(text=>({text,size:10,color:theme.subtle})));
  const foot=[...wrapExportText(source,readableWidth,10),...wrapExportText(note,readableWidth,10)];
  const extra=panels.filter(item=>item&&!item.hidden&&!item.minimized).map(item=>{
    const panel=item.svg||item;
    const viewBox=(panel.getAttribute('viewBox')||'').trim().split(/[\s,]+/u).map(Number);
    if(viewBox.length!==4||!viewBox.every(Number.isFinite)||viewBox[2]<=0||viewBox[3]<=0)throw new RangeError('추가 차트의 크기가 올바르지 않습니다.');
    const labels=item.svg?[...wrapExportText(item.title||'',readableWidth,12).map(text=>({text,size:12})),...wrapExportText([item.readout,item.note].filter(Boolean).join(' · '),readableWidth,10).map(text=>({text,size:10}))]:[];
    return {panel,height:viewBox[3]*width/viewBox[2],labels,labelHeight:labels.length?8+labels.reduce((sum,line)=>sum+line.size+5,0):0};
  });
  const legendItems=legend.filter(item=>item?.label&&/^#[0-9a-f]{6}$/i.test(item.color||''));
  const legendColumns=Math.max(1,Math.min(6,Math.floor(readableWidth/132))),legendHeight=legendItems.length?Math.ceil(legendItems.length/legendColumns)*24+12:0;
  const chartHeight=height+extra.reduce((sum,item)=>sum+item.height+item.labelHeight+8,0);
  const top=18+head.reduce((sum,line)=>sum+line.size+5,0),bottom=18+foot.length*15,total=top+chartHeight+legendHeight+bottom;
  const root=make('svg',{xmlns:NS,width:Math.round(width),height:Math.round(total),viewBox:`0 0 ${width} ${total}`,role:'img','aria-label':title});
  root.setAttribute('style',`background:${theme.background};color:${theme.text};color-scheme:${theme.colorScheme};font-family:${theme.fontFamily};font-variant-numeric:tabular-nums`);
  root.append(make('title',{},title),make('desc',{},[readout,countdown,source,note].filter(Boolean).join(' · ')),make('rect',{width:'100%',height:'100%',fill:theme.background}));
  let yy=17;for(const line of head){yy+=line.size;root.append(make('text',{x:14,y:yy,fill:line.color,'font-size':line.size},line.text));yy+=5;}
  function copyChart(sourceChart,y,chartHeight){
    const clone=materializeChartPaint(sourceChart,sourceChart.cloneNode(true));clone.removeAttribute('id');clone.removeAttribute('class');clone.removeAttribute('hidden');clone.removeAttribute('tabindex');clone.setAttribute('x','0');clone.setAttribute('y',String(y));clone.setAttribute('width',String(width));clone.setAttribute('height',String(chartHeight));
    clone.removeAttribute('style');
    for(const node of clone.querySelectorAll('[id$="-cross"],.history-event-preview,.cycle-marker-preview,.cycle-interval-preview,.chart-magnet-preview,.chart-snap-feedback,.price-axis-interaction,.chart-measurement[data-pending="true"],script,foreignObject'))node.remove();
    createPriceAxisLabelVisibility(clone)();
    for(const node of [clone,...clone.querySelectorAll('*')]){
      node.removeAttribute('tabindex');node.removeAttribute('role');
      for(const attr of [...node.attributes])if(attr.name.startsWith('on'))node.removeAttribute(attr.name);
    }
    root.append(clone);
  }
  copyChart(svg,top,height);
  let chartY=top+height;
  for(const item of extra){chartY+=8;for(const line of item.labels){chartY+=line.size+5;root.append(make('text',{x:14,y:chartY,fill:theme.muted,'font-size':line.size},line.text));}if(item.labels.length)chartY+=8;copyChart(item.panel,chartY,item.height);chartY+=item.height;}
  for(let i=0;i<legendItems.length;i++){
    const item=legendItems[i],column=i%legendColumns,row=Math.floor(i/legendColumns),xx=20+column*(readableWidth/legendColumns),ly=chartY+18+row*24;
    root.append(make('circle',{cx:xx,cy:ly,r:item.id==='pit-stop'?4.29:5.5,fill:item.color,'fill-opacity':.17,stroke:item.color,'stroke-width':1.5}),make('text',{x:xx+12,y:ly+4,fill:item.color,'font-size':10},item.label));
  }
  root.append(make('line',{x1:14,x2:width-14,y1:top+chartHeight+legendHeight+1,y2:top+chartHeight+legendHeight+1,stroke:theme.border}));
  yy=top+chartHeight+legendHeight+17;for(const text of foot){root.append(make('text',{x:14,y:yy,fill:theme.subtle,'font-size':10},text));yy+=15;}
  const Serializer=doc.defaultView?.XMLSerializer||XMLSerializer;
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+new Serializer().serializeToString(root);
}

/** Bound raster memory on phones and unusually tall exported charts. */
export function chartRasterSize(width,height,{pixelRatio=2,maxEdge=4096,maxPixels=12000000}={}){
  if(![width,height,pixelRatio,maxEdge,maxPixels].every(value=>Number.isFinite(value)&&value>0))throw new RangeError('이미지 크기가 올바르지 않습니다.');
  const ratio=Math.min(pixelRatio,maxEdge/width,maxEdge/height,Math.sqrt(maxPixels/(width*height)));
  return {width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio))};
}

/** Rasterize the same source-labelled SVG used by vector export; no remote assets. */
export async function createChartPngFromSvg(vector,doc){
  const view=doc?.defaultView;
  if(!view?.Image||!view?.URL?.createObjectURL)throw new Error('이 브라우저에서는 PNG 저장을 지원하지 않습니다. SVG 저장을 사용해 주세요.');
  const root=new view.DOMParser().parseFromString(vector,'image/svg+xml').documentElement;
  await doc.fonts?.ready;
  const size=chartRasterSize(Number(root.getAttribute('width')),Number(root.getAttribute('height'))),canvas=doc.createElement('canvas');
  canvas.width=size.width;canvas.height=size.height;
  let url=null;
  try{
    // Export needs stable readback, not an accelerated display surface.
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('이미지를 만들 수 없습니다. SVG 저장을 사용해 주세요.');
    const image=new view.Image();url=view.URL.createObjectURL(new Blob([vector],{type:'image/svg+xml;charset=utf-8'}));
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('차트 이미지 변환에 실패했습니다. SVG 저장을 사용해 주세요.'));image.src=url;});
    context.drawImage(image,0,0,size.width,size.height);
    // Inspect bounded strips, not another full-size RGBA allocation.
    let painted=false;
    try{
      for(let row=0;row<size.height&&!painted;row+=16){
        const pixels=context.getImageData(0,row,size.width,Math.min(16,size.height-row)).data;
        for(let index=3;index<pixels.length;index+=4)if(pixels[index]>0){painted=true;break;}
      }
    }catch(cause){throw new Error('PNG 픽셀을 확인할 수 없습니다. SVG 저장을 사용해 주세요.',{cause});}
    if(!painted)throw new Error('빈 이미지를 PNG로 저장하지 않았습니다. SVG 저장을 사용해 주세요.');
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 파일을 만들지 못했습니다. SVG 저장을 사용해 주세요.')),'image/png'));
  }finally{if(url)view.URL.revokeObjectURL(url);canvas.width=0;canvas.height=0;}
}

export async function createChartPngExport(svg,options={}){
  // Geometry, text, sources and panel metadata are all serialized before fonts/image awaits.
  const vector=createChartSvgExport(svg,options);return createChartPngFromSvg(vector,svg.ownerDocument);
}
