const axisEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Cache exact browser measurements, never sums of approximate glyph advances.
// A Document is the font-loading boundary. Keep both cache size and lifetime
// bounded, and invalidate existing hover fitters as well as future drawings.
const axisDocumentCaches=new WeakMap();
const newAxisCache=()=>({widths:new Map(),epoch:0});
function axisCacheFor(doc){
  if(!doc)return newAxisCache();
  let entry=axisDocumentCaches.get(doc);
  if(!entry){
    entry=newAxisCache();axisDocumentCaches.set(doc,entry);
    const invalidate=()=>{entry.epoch+=1;entry.widths.clear();};
    try{doc.fonts?.addEventListener?.('loadingdone',invalidate);doc.fonts?.addEventListener?.('loadingerror',invalidate);}catch{}
  }
  return entry;
}
const axisNumberFormats=new Map();
const axisNumber=(value,digits)=>{if(!axisNumberFormats.has(digits))axisNumberFormats.set(digits,new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}));return axisNumberFormats.get(digits).format(value);};

/** Measure the font that the SVG actually uses, in its own viewBox units.
 * The fallback is for detached/test renderers; a live browser uses SVG glyph
 * metrics. Explicit font attributes and textLength survive SVG/PNG export. */
function priceAxisTextMetrics(svg){
  const doc=svg?.ownerDocument,view=doc?.defaultView;
  let inherited=null;try{inherited=view?.getComputedStyle?.(svg);}catch{}
  const font={family:inherited?.fontFamily||'Arial,"Noto Sans KR",sans-serif',weight:inherited?.fontWeight||'400',style:inherited?.fontStyle||'normal',spacing:Number.parseFloat(inherited?.letterSpacing)||0};
  const viewBox=svg?.getAttribute?.('viewBox')||'',store=axisCacheFor(doc);
  const local=new Map();let localEpoch=store.epoch,sampleValue='';
  const typeKey=JSON.stringify([font.family,font.weight,font.style,font.spacing,viewBox]);
  let probe=null;
  try{if(doc?.createElementNS&&svg?.appendChild){probe=doc.createElementNS('http://www.w3.org/2000/svg','text');for(const [name,value] of Object.entries({'font-family':font.family,'font-weight':font.weight,'font-style':font.style,'font-variant-numeric':'tabular-nums','letter-spacing':font.spacing,x:0,y:0,visibility:'hidden','pointer-events':'none','aria-hidden':'true'}))probe.setAttribute(name,value);}}catch{}
  function syncEpoch(){if(localEpoch!==store.epoch){local.clear();localEpoch=store.epoch;}}
  function raw(text,size){
    text=String(text);syncEpoch();let width=0;
    if(probe){
      try{probe.setAttribute('font-size',size);probe.textContent=text;svg.appendChild(probe);const advance=probe.getComputedTextLength?.(),box=probe.getBBox?.();width=Math.max(Number.isFinite(advance)?advance:0,box&&Number.isFinite(box.width)?box.x+box.width:0)-Math.min(0,box?.x||0);}catch{}
      finally{try{if(probe.parentNode)probe.parentNode.removeChild(probe);}catch{}}
    }
    // Detached renderers have no glyph API. This existing conservative fallback
    // is not used as a calibration sample or a claimed browser measurement.
    if(!(width>0)&&text)width=[...text].reduce((sum,char)=>sum+(/[., ]/.test(char)?.34:/[-+]/.test(char)?.55:char==='%'?.9:.68)*size,0)+Math.max(0,text.length-1)*font.spacing;
    return Math.max(0,width);
  }
  function measure(text,size){
    text=String(text);syncEpoch();const key=JSON.stringify([size,text]);
    if(local.has(key))return local.get(key);
    const shared=JSON.stringify([typeKey,store.epoch,sampleValue,size,text]);
    const width=store.widths.has(shared)?store.widths.get(shared):raw(text,size);
    if(local.size>=256)local.clear();local.set(key,width);
    if(!store.widths.has(shared)){if(store.widths.size>=2048)store.widths.clear();store.widths.set(shared,width);}
    return width;
  }
  return {font,measure,raw,setSample(value){sampleValue=value;local.clear();}};
}

/** A fixed gutter gives the recovered width to the price plot. Actual glyph
 * metrics fit complete labels inside it without moving the axis on font load,
 * pan or hover. Exceptionally small embedded canvases retain a usable plot. */
export function createPriceAxisLayout({svg,width,left=8,minRight=64,fontSize=11,badgeFontSize=11}){
  const metrics=priceAxisTextMetrics(svg),inset=4,edge=6;
  const right=Math.min(minRight,Math.max(1,width-left-48));
  const labelWidth=Math.max(1,right-inset-edge),{font}=metrics;
  // One real sample per layout is the font-change detector: its advance is part
  // of every cached label width below. Font events also invalidate existing
  // layout instances so a live hover does not retain stale measurements.
  const sampleAdvance=metrics.raw('$-0123456789.,%',fontSize);metrics.setSample(sampleAdvance);
  // Font face loading can change glyph advances without changing the computed
  // family name or this fixed gutter. React must refresh its measured fitter.
  const probe='$-0123456789.,%';
  const common={'font-family':font.family,'font-weight':font.weight,'font-style':font.style,'font-variant-numeric':'tabular-nums','letter-spacing':font.spacing,lengthAdjust:'spacingAndGlyphs'};
  function textAttributes(label,{badge=false,kind=badge?'badge':'tick'}={}){
    const length=Math.min(labelWidth,Math.max(.01,metrics.measure(label,badge?badgeFontSize:fontSize)));
    return {...common,'data-price-axis-label':kind,textLength:Number(length.toFixed(3))};
  }
  // Render identity is an immutable snapshot, distinct from live hover fitting.
  // React compares the previous layout with a newly measured one on font load.
  // Updating both identities in place would incorrectly skip that rerender.
  const badgeSampleAdvance=badgeFontSize===fontSize?sampleAdvance:metrics.raw(probe,badgeFontSize);
  const axis={right,inset,edge,labelWidth,fontSize,badgeFontSize,measure:metrics.measure,
    // Keep the published literal getter shape for the React fitter.
    get metricKey(){
      const measured=sampleAdvance,badgeMeasured=badgeSampleAdvance;
      return JSON.stringify([font,fontSize,badgeFontSize,measured,badgeMeasured]);
    },
    attributes(label,options){return Object.entries(textAttributes(label,options)).map(([name,value])=>`${name}="${axisEscape(value)}"`).join(' ');},
    fitNode(node,options={}){if(!node)return;for(const [name,value] of Object.entries(textAttributes(node.textContent,options)))node.setAttribute(name,value);node.setAttribute('font-size',options.badge?badgeFontSize:fontSize);},
  };
  return axis;
}

/** Normal quotes keep their full decimal representation at every font width.
 * Scientific notation is a numeric-range policy for extreme values, never a
 * width fallback. Tiny prices stay nonzero and tight tick ranges stay distinct.
 * Source values/readouts remain untouched. */
export function createPriceAxisFormatter({axis,display,layout}){
  const shown=value=>display?.toDisplay?display.toDisplay(value):display?.available===false?null:value*(display?.factor??1)+(display?.offset??0);
  const values=(axis?.ticks||[]).map(shown).filter(Number.isFinite).sort((a,b)=>a-b);
  const gaps=values.slice(1).map((value,index)=>value-values[index]).filter(value=>value>0);
  const gap=gaps.length?Math.min(...gaps):Math.abs((axis?.max-axis?.min)*(display?.factor??1));
  const tickDigits=Math.max(0,Math.min(12,Number.isFinite(gap)&&gap>0?1-Math.floor(Math.log10(gap)):2));
  const wrap=text=>`${display?.unit==='usd'?'$':''}${text}${display?.unit==='percent'?'%':''}`;
  function format(raw,badge){
    const value=shown(raw);if(!Number.isFinite(value))return '—';
    const abs=Math.abs(value),digits=Math.min(12,Math.max(tickDigits,badge?(abs>0&&abs<1?6:2):0));
    const numeric=axisNumber(value,digits),fixed=wrap(numeric),rounded=Number(numeric.replaceAll(',',''));
    const precise=badge||!Number.isFinite(gap)||gap<=0||10**-digits<gap;
    const ordinary=abs>=1e-6&&abs<1e9;
    if(value===0||ordinary&&rounded!==0&&precise)return fixed;
    // Keep adjacent ticks distinguishable even in a very tight manual range.
    const significant=badge?8:Math.max(3,Math.min(16,Number.isFinite(gap)&&gap>0&&abs>0?Math.floor(Math.log10(abs))-Math.floor(Math.log10(gap))+3:6));
    const scientific=wrap(value.toExponential(significant-1).replace(/(\.\d*?[1-9])0+e/,'$1e').replace(/\.0+e/,'e').replace('e+','e'));
    return rounded===0||!precise||scientific.length<fixed.length?scientific:fixed;
  }
  return {tick:value=>format(value,false),price:value=>format(value,true),tickDigits};
}

/** Keep the axis paint after chart annotations without changing any price
 * coordinates. The whole cursor group retains its lookup/export owner; only
 * the separate interaction child is disposable when exporting the chart. */
function mountPriceAxisPaint(svg,{ticks,latest,cursorTag}){
  const layer=svg.querySelector?.('[data-price-axis-paint-layer]');
  // String-only render fixtures do not have a mounted SVG tree.
  if(!layer||layer.parentNode!==svg||!layer.appendChild)return null;
  const viewBox=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  const height=viewBox.length===4&&viewBox.every(Number.isFinite)&&viewBox[3]>0?viewBox[3]:svg.clientHeight;
  if(Number.isFinite(height)&&height>0){
    for(const edge of layer.querySelectorAll('[data-price-axis-boundary]')){
      if(edge.dataset.priceAxisBoundary==='axis')edge.setAttribute('y2',height);
      if(edge.dataset.priceAxisBoundary==='bottom'){edge.setAttribute('y1',height);edge.setAttribute('y2',height);}
    }
  }
  for(const tick of ticks){
    // A text center can fall between glyphs or just outside the data inset.
    // Its own painted box still belongs to the axis, not the chart below it.
    tick.setAttribute('pointer-events','bounding-box');
    tick.setAttribute('style','cursor:ns-resize;touch-action:none');
  }
  // Intraday quotes retain their source title and observed-price guide owner.
  const quote=latest?.closest?.('.market-last-price')||latest;
  for(const node of [...ticks,quote])if(node?.parentNode&&node.parentNode!==layer)layer.appendChild(node);
  const cross=cursorTag?.closest?.('[id$="-cross"]');
  if(cross?.parentNode&&cross.parentNode!==layer)layer.appendChild(cross);
  return layer;
}

/** Reserve the painted badge rows, not a second price axis. Labels return as
 * soon as the live cursor leaves their vertical interval; values stay intact. */
export function createPriceAxisLabelVisibility(svg,{cursorTag,padding=3}={}){
  const ticks=[...(svg.querySelectorAll?.('[data-price-axis-label="tick"]')||[])];
  const latest=svg.querySelector?.('.chart-latest-price-tag');
  const paint=mountPriceAxisPaint(svg,{ticks,latest,cursorTag});
  const badgeBounds=tag=>{
    if(!tag||tag.getAttribute('visibility')==='hidden')return null;
    const rect=tag.querySelector('rect'),raw=rect?.getAttribute('y'),height=Number(rect?.getAttribute('height'));
    if(raw==null||!Number.isFinite(Number(raw))||!(height>0))return null;
    return {top:Number(raw),bottom:Number(raw)+height};
  };
  const overlaps=(a,b)=>a&&b&&a.top<b.bottom+padding&&a.bottom+padding>b.top;
  return ()=>{
    // Measurement/annotation layers can be attached after initial rendering.
    // The axis owns its final paint order, including on retained hover updates.
    if(paint?.parentNode===svg&&svg.lastElementChild!==paint)svg.appendChild(paint);
    const cursor=badgeBounds(cursorTag);
    if(latest)latest.setAttribute('visibility','visible');
    const current=badgeBounds(latest),hideLatest=overlaps(current,cursor);
    if(latest&&hideLatest)latest.setAttribute('visibility','hidden');
    const badges=[cursor,...(hideLatest?[]:[current])].filter(Boolean);
    for(const tick of ticks){
      const y=Number(tick.getAttribute('y')),size=Number(tick.getAttribute('font-size'))||12;
      const hidden=badges.some(badge=>overlaps({top:y-size,bottom:y+3},badge));
      tick.setAttribute('visibility',hidden?'hidden':'visible');
      if(paint)tick.setAttribute('pointer-events',hidden?'none':'bounding-box');
    }
  };
}

// Price viewports are always expressed in the original USD coordinates.
// Indexed labels are a display concern and never change this domain.
export function normalizePriceDomain(domain, { scale = 'log' } = {}) {
  if (!domain || !['log', 'linear'].includes(scale)) return null;
  const { min, max } = domain;
  if (![min, max].every(Number.isFinite) || max <= min || (scale === 'log' && min <= 0)) return null;
  // Leave numeric headroom for unit factors and reject domains whose transform
  // collapses to a single floating-point value. These are display limits only.
  if ([min,max].some(value => value !== 0 && (Math.abs(value) < 1e-300 || Math.abs(value) > 1e300))) return null;
  const low=scale==='log'?Math.log(min):min,high=scale==='log'?Math.log(max):max,span=high-low;
  if(!Number.isFinite(span)||span<=Number.EPSILON*Math.max(Math.abs(low),Math.abs(high),Number.MIN_VALUE)*8)return null;
  return { min, max };
}

/** Scale about a price-axis anchor, using ratios for log and distances for linear. */
export function scalePriceDomain(axis, factor, anchor = .5) {
  const domain = normalizePriceDomain(axis, { scale: axis?.scale });
  if (!domain || !Number.isFinite(factor) || factor <= 0 || !Number.isFinite(anchor)) return null;
  const transform = axis.scale === 'log' ? Math.log : value => value;
  const reverse = axis.scale === 'log' ? Math.exp : value => value;
  const low = transform(domain.min), high = transform(domain.max);
  const fraction = Math.max(0, Math.min(1, anchor)), pivot = low + (high - low) * fraction;
  const minimum = axis.scale === 'log' ? 1e-6 : Math.max(1, Math.abs(pivot)) * 1e-8;
  const span = Math.max(minimum, (high - low) * Math.max(.05, Math.min(20, factor)));
  let first = pivot - span * fraction, last = pivot + span * (1 - fraction);
  if (axis.scale === 'linear' && domain.min >= 0 && first < 0) { last -= first; first = 0; }
  const result = { min: reverse(first), max: reverse(last) };
  return normalizePriceDomain(result, { scale: axis.scale });
}

/** Translate a viewport with a drag; empty linear price space is permitted. */
export function panPriceDomain(axis, fraction) {
  const domain = normalizePriceDomain(axis, { scale: axis?.scale });
  if (!domain || !Number.isFinite(fraction)) return null;
  const transform = axis.scale === 'log' ? Math.log : value => value;
  const reverse = axis.scale === 'log' ? Math.exp : value => value;
  const low = transform(domain.min), high = transform(domain.max), shift = (high - low) * fraction * (axis.inverted ? -1 : 1);
  const result = { min: reverse(low + shift), max: reverse(high + shift) };
  return normalizePriceDomain(result, { scale: axis.scale });
}

/** The full SVG surface has a continuous axis/frame even where no nice tick
 * exists. This visual extent never changes the T..priceBottom price mapping.
 * The input surface remains the original narrow price-axis rectangle. */
export function priceAxisMarkup({ left, right, top, bottom, surfaceBottom='100%' }) {
  if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top) return '';
  if(surfaceBottom!=='100%'&&(!Number.isFinite(surfaceBottom)||surfaceBottom<bottom))return '';
  return `<g data-price-axis-paint-layer="true" pointer-events="none"><g class="price-axis-interaction" data-price-axis="true"><title>가격축 · 위아래로 드래그하여 확대·축소 · 두 번 눌러 자동 맞춤</title><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="transparent" pointer-events="all" style="cursor:ns-resize;touch-action:none"/></g><line data-price-axis-boundary="axis" x1="${left}" x2="${left}" y1="0" y2="${surfaceBottom}" stroke="var(--border-strong)" vector-effect="non-scaling-stroke"/><line data-price-axis-boundary="top" x1="0" x2="${left}" y1="0" y2="0" stroke="var(--grid)" vector-effect="non-scaling-stroke"/><line data-price-axis-boundary="bottom" x1="0" x2="${left}" y1="${surfaceBottom}" y2="${surfaceBottom}" stroke="var(--grid)" vector-effect="non-scaling-stroke"/></g>`;
}

export function timeAxisMarkup({ left, right, top, bottom }) {
  if (![left,right,top,bottom].every(Number.isFinite) || right <= left || bottom <= top) return '';
  return `<g class="time-axis-interaction" data-time-axis="true"><title>시간축 · 좌우 드래그하여 시간 간격 확대·축소 · 두 번 눌러 기본 범위</title><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" fill="transparent" pointer-events="all" style="cursor:ew-resize;touch-action:none"/></g>`;
}
