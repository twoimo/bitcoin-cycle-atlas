import { Reveal, createSkeletonBox } from './vendor/skullet/skullet.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds=new Set(['chart','rsi','diagnosis','scenario','cashflow','table','list','detail','calendar']);
const bar=(width='72%',height='12px')=>`<span skullet-block skullet-bar style="width:${width};height:${height}"></span>`;
const row=(widths=['36%','20%','18%','12%'])=>`<div class="atlas-skeleton-row">${widths.map(w=>bar(w)).join('')}</div>`;
export function skeletonShape(kind='chart') {
  if(!kinds.has(kind))kind='detail';
  const heading=`<div class="atlas-skeleton-heading">${bar('76px','16px')}${bar('44px')}${bar('64px')}${bar('52px')}</div>`;
  if(kind==='calendar')return `${heading}<div class="atlas-skeleton-calendar">${Array.from({length:42},()=>'<div skullet-block></div>').join('')}</div>`;
  if(kind==='rsi')return `${heading}<div class="atlas-skeleton-rsi-meta">${[0,1,2,3,4].map(()=>bar('52px','10px')).join('')}</div><div class="atlas-skeleton-rsi-panels"><div class="atlas-skeleton-plot" skullet-block></div><div class="atlas-skeleton-oscillator" skullet-block></div></div>`;
  if(kind==='table'||kind==='list')return `${heading}<div class="atlas-skeleton-rows">${Array.from({length:kind==='table'?9:6},(_,i)=>row(i%2?['28%','20%','16%','12%']:undefined)).join('')}</div>`;
  if(kind==='detail')return `${heading}<div class="atlas-skeleton-rows">${[0,1,2,3,4].map(()=>row(['32%','52%'])).join('')}</div>`;
  const fields=kind==='scenario'||kind==='cashflow'||kind==='diagnosis'?`<div class="atlas-skeleton-fields">${[0,1,2].map(()=>`<div>${bar('72px')}${bar('100%','36px')}</div>`).join('')}</div>`:'';
  return `${heading}${fields}<div class="atlas-skeleton-plot" skullet-block></div>${kind==='rsi'?'<div class="atlas-skeleton-oscillator" skullet-block></div>':''}<div class="atlas-skeleton-footer">${bar('48px')}${bar('48px')}${bar('64px')}</div>`;
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
export function enhanceSkeleton(root,onDispose=()=>{}) {
  if(!root||typeof getComputedStyle!=='function'||typeof requestAnimationFrame!=='function'||hidden(root))return ()=>{};
  const paint=root.querySelector('.atlas-skeleton-paint');if(!paint||paint.dataset.enhanced)return ()=>{};
  const shape=paint.firstElementChild;let reveal;
  try {reveal=new Reveal(paint,{reveal:'together'});reveal.load(shape);paint.dataset.enhanced='true';}
  catch {reveal?.destroy();paint.replaceChildren(shape);return ()=>{};}
  const item={root,destroy(){if(!active.delete(item))return;reveal.destroy();onDispose();for(const el of root.querySelectorAll('*'))for(const animation of el.getAnimations?.()||[])animation.cancel();root.remove();if(!active.size){observer?.disconnect();observer=null;}}};
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
  const kind=page==='ipo'?'calendar':page==='data'?'table':['research','evidence'].includes(page)?'list':path.includes('/rsi/')?'rsi':path.includes('/us/')||path.includes('/kr/')?'diagnosis':'chart';
  setLoadingSurface(canvas,true,{kind,label:'화면 로딩'});
  const boxes=[];
  for(const old of shell.querySelectorAll('.atlas-boot-bar')){
    const style=getComputedStyle(old),box=createSkeletonBox({width:style.width,height:style.height,radius:style.borderRadius});box.className=old.className;box.dataset.skulletBoot='true';old.replaceWith(box);boxes.push(box);
  }
  const stop=()=>{clearLoadingSurface(canvas);for(const box of boxes){for(const animation of box.getAnimations?.()||[])animation.cancel();box.remove();}bootObserver.disconnect();document.removeEventListener('atlas:ready',stop);document.removeEventListener('atlas:boot-error',stop);};
  const bootObserver=new MutationObserver(()=>{if(document.documentElement.dataset.boot!=='loading')stop();});
  bootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-boot']});
  document.addEventListener('atlas:ready',stop);document.addEventListener('atlas:boot-error',stop);
}
if(typeof window!=='undefined')window.addEventListener('pagehide',()=>{for(const item of [...active])item.destroy();});
