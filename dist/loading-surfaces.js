import { Reveal, createSkeletonBox } from './vendor/skullet/skullet.js';
import { RSI_CHART_LAYOUT,rsiChartLayout } from './rsi-chart-layout.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds=new Set(['chart','rsi','diagnosis','scenario','cashflow','table','list','detail','calendar']);
const bar=(width='72%',height='8px')=>`<span skullet-block skullet-bar style="width:${width};height:${height}"></span>`;
const line=(widths)=>`<div class="atlas-skeleton-row">${widths.map(width=>bar(width,'8px')).join('')}</div>`;
// Visible first-paint geometry also derives from the real chart's coordinate
// contract. Enhancement resolves the split and axis width to measured pixels.
const rsiLayout=RSI_CHART_LAYOUT;
const rsiStyle=`--atlas-rsi-left:${rsiLayout.left}px;--atlas-rsi-top:${rsiLayout.top}px;--atlas-rsi-bottom:${rsiLayout.bottom}px;--atlas-rsi-right:${rsiLayout.right}px;--atlas-rsi-price-bottom:max(${rsiLayout.top+rsiLayout.minimumPriceHeight}px,${rsiLayout.priceShare*100}%);--atlas-rsi-gap:${rsiLayout.panelGap}px`;
const toolbar=(widths)=>`<div class="atlas-skeleton-toolbar">${widths.map(width=>bar(width,'12px')).join('')}</div>`;
const chartBody=`<div class="atlas-skeleton-chart"><div class="atlas-skeleton-plot" skullet-block></div><div class="atlas-skeleton-y-axis">${[0,1,2,3,4].map(()=>bar('48px','8px')).join('')}</div><div class="atlas-skeleton-x-axis">${[0,1,2,3,4].map(()=>bar('36px','8px')).join('')}</div></div>`;
export function skeletonShape(kind='chart') {
  if(!kinds.has(kind))kind='detail';
  if(kind==='chart')return chartBody;
  if(kind==='calendar')return `${toolbar(['120px'])}<div class="atlas-skeleton-calendar">${Array.from({length:42},()=>'<div skullet-block></div>').join('')}</div>`;
  if(kind==='rsi')return `${toolbar(['88px','64px'])}<div class="atlas-skeleton-rsi-panels" style="${rsiStyle}"><div class="atlas-skeleton-plot" skullet-block></div><div class="atlas-skeleton-oscillator" skullet-block></div></div>`;
  if(kind==='diagnosis')return `${toolbar(['96px'])}<div class="atlas-skeleton-scores">${[0,1,2].map(()=>'<div skullet-block></div>').join('')}</div><div class="atlas-skeleton-stack">${[0,1,2].map(()=>'<div skullet-block></div>').join('')}</div>`;
  if(kind==='scenario')return `${toolbar(['72px','64px'])}<div class="atlas-skeleton-split"><div class="atlas-skeleton-rows">${[0,1,2].map(()=>line(['28%','44%'])).join('')}</div><div class="atlas-skeleton-stack"><div skullet-block></div>${[0,1,2].map(()=>line(['22%','16%','16%'])).join('')}</div></div>`;
  if(kind==='cashflow')return `${toolbar(['88px'])}<div class="atlas-skeleton-split"><div class="atlas-skeleton-rows">${[0,1,2,3].map(()=>line(['32%','40%'])).join('')}</div><div class="atlas-skeleton-rows">${[0,1,2,3].map(()=>line(['36%','28%'])).join('')}</div></div>`;
  if(kind==='table')return `<div class="atlas-skeleton-table-head">${['18%','16%','14%','12%','12%'].map(width=>bar(width,'8px')).join('')}</div><div class="atlas-skeleton-rows">${Array.from({length:9},(_,index)=>line(index%2?['16%','14%','12%','10%','10%']:['18%','16%','14%','12%','12%'])).join('')}</div>`;
  if(kind==='list')return `<div class="atlas-skeleton-rows">${Array.from({length:6},()=>line(['46%','22%'])).join('')}</div>`;
  return `${toolbar(['46%'])}<div class="atlas-skeleton-rows">${[0,1,2,3,4].map(()=>line(['32%','40%'])).join('')}</div>`;
}
export function skeletonMarkup(kind='chart',label='자료 로딩') {
  const key=kinds.has(kind)?kind:'detail';
  return `<div class="atlas-skeleton" data-atlas-skeleton="${key}" role="status" aria-busy="true"><span class="atlas-loading-label">${escape(label)}</span><div class="atlas-skeleton-paint" aria-hidden="true" inert><div class="atlas-skeleton-shape">${skeletonShape(key)}</div></div></div>`;
}
const mounted=new WeakMap(),active=new Set();let observer;
function hidden(node){return !node.isConnected||!!node.closest('[hidden]')||!!node.closest('dialog:not([open])');}
function watch(){
  if(observer||!active.size||typeof MutationObserver==='undefined')return;
  observer=new MutationObserver(()=>{for(const item of [...active])if(hidden(item.root))item.destroy();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open']});
}
// Skullet measures only neutral geometry. No sample prices, forecasts, controls
// with real handlers or financial outputs are rendered as pending data.
function observeRsiLayout(root){
  const panels=root.querySelector('.atlas-skeleton-rsi-panels');
  if(!panels)return ()=>{};
  let previous='';
  const measure=()=>{
    const width=panels.clientWidth,height=panels.clientHeight;
    const size=`${width}:${height}`;if(size===previous)return;previous=size;
    const geometry=rsiChartLayout(width,height);
    panels.style.setProperty('--atlas-rsi-right',`${width-geometry.right}px`);
    panels.style.setProperty('--atlas-rsi-price-bottom',`${geometry.priceBottom}px`);
  };
  measure();
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  resize?.observe(panels);
  return ()=>resize?.disconnect();
}
export function enhanceSkeleton(root,onDispose=()=>{}) {
  if(!root||typeof getComputedStyle!=='function'||typeof requestAnimationFrame!=='function'||hidden(root))return ()=>{};
  const paint=root.querySelector('.atlas-skeleton-paint');if(!paint||paint.dataset.enhanced)return ()=>{};
  const shape=paint.firstElementChild,stopLayout=observeRsiLayout(paint);let reveal;
  try {reveal=new Reveal(paint,{reveal:'together'});reveal.load(shape);paint.dataset.enhanced='true';}
  catch {reveal?.destroy();reveal=null;paint.replaceChildren(shape);}
  const item={root,destroy(){if(!active.delete(item))return;stopLayout();reveal?.destroy();onDispose();for(const el of root.querySelectorAll('*'))for(const animation of el.getAnimations?.()||[])animation.cancel();root.remove();if(!active.size){observer?.disconnect();observer=null;}}};
  active.add(item);watch();return item.destroy;
}
export function clearLoadingSurface(host){const item=host&&mounted.get(host);if(!item)return;item.destroy();item.root.remove();host.classList.remove('atlas-has-skeleton');mounted.delete(host);}
export function setLoadingSurface(host,loading,{kind='chart',label='자료 로딩'}={}) {
  if(!host)return;if(!loading){clearLoadingSurface(host);return;}
  const previous=mounted.get(host);if(previous?.root.isConnected)return;clearLoadingSurface(host);
  const owner=host.ownerDocument;if(!owner?.createElement)return;
  const template=owner.createElement('template');template.innerHTML=skeletonMarkup(kind,label);const root=template.content.firstElementChild;
  host.append(root);host.classList.add('atlas-has-skeleton');const destroy=enhanceSkeleton(root,()=>{if(mounted.get(host)?.root===root){mounted.delete(host);host.classList.remove('atlas-has-skeleton');}});mounted.set(host,{root,destroy});
}
export function replaceWithSkeleton(host,kind='detail',label='자료 로딩') {
  clearLoadingSurface(host);if(host.replaceChildren)host.replaceChildren();else host.innerHTML='';setLoadingSurface(host,true,{kind,label});
}
export function setChartLoading(plot,loading,label='가격 자료 로딩'){
  if(!plot)return;let layer=plot.querySelector(':scope > .atlas-chart-pending');
  if(!layer&&loading){layer=document.createElement('div');layer.className='atlas-chart-pending';plot.append(layer);}
  if(layer){layer.hidden=!loading;setLoadingSurface(layer,loading,{kind:'chart',label});}
}
export function enhanceBootSkeleton(){
  const shell=document.querySelector('#atlas-boot-shell');if(!shell||shell.hidden||document.documentElement.dataset.boot!=='loading')return;
  const page=new URLSearchParams(location.search).get('page'),path=location.pathname,canvas=shell.querySelector('.atlas-boot-canvas');
  const kind=page==='ipo'?'calendar':page==='data'?'table':['research','evidence','relay'].includes(page)?'list':path.includes('/rsi/')?'rsi':path.includes('/scenario/')?'scenario':path.includes('/cashflow/')?'cashflow':path.includes('/us/')||path.includes('/kr/')?'diagnosis':'chart';
  setLoadingSurface(canvas,true,{kind,label:'화면 로딩'});
  const pending=[...shell.querySelectorAll('.atlas-boot-bar')].map(old=>{
    const style=getComputedStyle(old);
    return [old,style.width,style.height,style.borderRadius];
  });
  const boxes=[];
  for(const [old,width,height,radius] of pending){
    const box=createSkeletonBox({width,height,radius});box.className=old.className;box.dataset.skulletBoot='true';old.replaceWith(box);boxes.push(box);
  }
  const stop=()=>{clearLoadingSurface(canvas);for(const box of boxes){for(const animation of box.getAnimations?.()||[])animation.cancel();box.remove();}bootObserver.disconnect();document.removeEventListener('atlas:ready',stop);};
  const bootObserver=new MutationObserver(()=>{if(document.documentElement.dataset.boot!=='loading')stop();});
  bootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-boot']});
  document.addEventListener('atlas:ready',stop);
}
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>{for(const item of [...active])item.destroy();});
