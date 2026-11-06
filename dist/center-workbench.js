import {atlasSitePath,atlasRootPath} from './site-paths.js';
import { atlasPages,atlasNavigationId,atlasPageHref,labPageFromLocation } from './atlas-navigation.js?v=1.32.0';
import { workspaceInstrument } from './workspace-instruments.js';
import { mountDataHeaderActions } from './data-header-actions.js';
import { createRsiWorkbenchControls } from './rsi-workbench-controls.js';
import { setLoadingSurface,clearLoadingSurface } from './loading-surfaces.js';

// The original chart owns all four perimeter regions. Only its center is
// replaced; the same-origin frame keeps React's DOM and styles independently owned.
export function mountCenterWorkbench() {
  const service=document.querySelector('meta[name="atlas-service-base"]');
  const staticEntry=!service&&/^https?:$/.test(location.protocol)?document.querySelector('meta[name="atlas-static-entry"]')?.getAttribute('content'):null;
  if (window.parent !== window || !(service||staticEntry)) return;
  // Freeze document-relative icons before history changes the route depth.
  if(staticEntry)for(const icon of document.querySelectorAll('link[rel~="icon"][href]'))icon.href=new URL(icon.getAttribute('href'),document.baseURI).href;
  const home=atlasSitePath('/');
  if(staticEntry&&new URLSearchParams(location.search).get('page')==='market'){
    const page=labPageFromLocation(location),query=new URLSearchParams(location.search);
    const url=new URL(atlasSitePath(atlasPageHref(page,{symbol:query.get('symbol'),region:query.get('region')})),location.origin);
    window.history.replaceState(null,'',url);
  }
  document.body.classList.add('js');
  let frame, plot, activePage=null, activeSymbol='TQQQ', activeRegion, originalSymbol='BTCUSD', originalUrl=null, originalTitle=null, waiting=null;
  let lastChart={page:atlasPages.find(page=>page.id==='rsi'),symbol:'TQQQ'},lastMarket=atlasPages.find(page=>page.id==='market-us');
  const frames=new Map();
  let loadingLayer=null;
  let dataHeaderActions=null;
  function clearCenterLoading(){if(loadingLayer){clearLoadingSurface(loadingLayer);loadingLayer.remove();loadingLayer=null;}}
  let epoch=0;
  let originalReader=null;
  const controls=createRsiWorkbenchControls({send:message=>frame?.contentWindow.postMessage(message,location.origin),isActive:()=>activePage?.id==='rsi'});
  const saved = new Map();
  // The BTC renderer can update its navigation buttons after the center opens.
  // Preserve their original state and keep hidden-chart actions unavailable.
  const protectNavigation=()=>{
    if(!activePage||activePage.id==='rsi')return;
    for(const node of document.querySelectorAll('.chart-navigation button')){
      if(!saved.has(node))saved.set(node,{inert:node.inert,aria:node.getAttribute('aria-hidden'),disabled:node.disabled});
      if(!node.disabled)node.disabled=true;
    }
  };
  const navigationObserver=new MutationObserver(protectNavigation);
  navigationObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  const closeTray=()=>document.querySelector('.mobile-workbench-button[aria-expanded="true"]')?.click();
  const navigateMessage=()=>({kind:'atlas:center-navigate',page:activePage.id,symbol:activeSymbol,epoch,...(activeRegion?{region:activeRegion}:{})});
  function context(page,symbol,region) {
    activePage=page;
    if(atlasNavigationId(page)==='rsi') {
      const target=new URL(atlasPageHref(page,{symbol,region}),location.origin);
      const instrument=workspaceInstrument(target.searchParams.get('symbol'));
      activeSymbol=instrument.symbol;activeRegion=instrument.page==='housing'?instrument.region:undefined;
      lastChart={page,symbol:activeSymbol,region:activeRegion};
    }else{activeRegion=undefined;if(atlasNavigationId(page)==='market-us')lastMarket=page;}
    document.body.dataset.centerTool=page.id;
    protectNavigation();
    for (const item of document.querySelectorAll('[data-atlas-page]')) {
      const selected=item.dataset.atlasPage===atlasNavigationId(page);item.classList.toggle('active',selected);
      if (selected) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    }
    document.title=`${page.title} · Cycle Atlas`;
    document.dispatchEvent(new CustomEvent('atlas:active-symbol',{detail:{symbol:atlasNavigationId(page)==='rsi'?activeSymbol:originalSymbol}}));
    const heading=document.querySelector('.atlas-canvas-heading');
    if (heading) heading.dataset.centerPage=page.title;
  }
  function restore() {
    if (!frame || !activePage) return;
    clearCenterLoading();closeTray();controls.restore();dataHeaderActions?.destroy();dataHeaderActions=null;frame.contentWindow.postMessage({kind:'atlas:center-visibility',visible:false},location.origin);
    document.dispatchEvent(new CustomEvent('atlas:close-detail'));
    frame.hidden=true;delete document.body.dataset.centerTool;activePage=null;
    for (const [node,state] of saved) { node.inert=state.inert; if(state.aria==null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',state.aria);if('disabled' in node)node.disabled=state.disabled; }
    saved.clear();
    document.dispatchEvent(new CustomEvent('atlas:active-symbol',{detail:{symbol:originalSymbol}}));
    document.dispatchEvent(new CustomEvent('atlas:center-restored'));
    if(originalReader)document.dispatchEvent(new CustomEvent('atlas:open-detail',{detail:{kind:originalReader,focus:false}}));originalReader=null;
    if (originalTitle) document.title=originalTitle;
    for (const item of document.querySelectorAll('[data-atlas-page]')) { const selected=item.dataset.atlasPage==='outlook';item.classList.toggle('active',selected);if(selected)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current'); }
  }
  function open(page,symbol,{history=true,region}={}) {
    if (!plot) {waiting={page,symbol,history,region};return;}
    clearCenterLoading();closeTray();controls.restore();dataHeaderActions?.destroy();dataHeaderActions=null;epoch++;
    if (!activePage) {
      const reader=document.querySelector('#chart-reader');originalReader=reader&&!reader.hidden?reader.dataset.kind:null;
      document.dispatchEvent(new CustomEvent('atlas:close-detail'));
      const chartUrl=new URL(location.href);
      const backgroundSymbol=document.documentElement.dataset.symbol||chartUrl.searchParams.get('symbol');
      originalSymbol=['ETHUSD','MSTR','BMNR'].includes(backgroundSymbol)?backgroundSymbol:'BTCUSD';
      const labIndex=chartUrl.pathname.indexOf('/market-lab/');if(labIndex>=0)chartUrl.pathname=chartUrl.pathname.slice(0,labIndex+1);
      for(const key of ['center','lab-tab','lab-region','embedded','view','region'])chartUrl.searchParams.delete(key);
      if(workspaceInstrument(chartUrl.searchParams.get('symbol')))chartUrl.searchParams.delete('symbol');
      if(chartUrl.searchParams.get('page')==='market')chartUrl.searchParams.delete('page');
      originalUrl=chartUrl.href;originalTitle=document.title;
      const headingChildren=[...document.querySelector('.atlas-canvas-heading')?.children || []].filter(node=>!node.matches('.symbol-selector-trigger,.mobile-workbench-button'));
      for(const node of new Set([...plot.children,...headingChildren,...document.querySelectorAll('.atlas-canvas-heading button:not(.symbol-selector-trigger):not(.mobile-workbench-button),.atlas-canvas-heading select,#atlas-cycle-panel,.workbench-tools,.workbench-tools button,.chart-navigation button,.workbench-detail-tools,.workbench-detail-tools button,.workbench-help,.mobile-extra-actions,.mobile-extra-actions button,.workbench-bottom-bar,.workbench-bottom-bar button,.workbench-bottom-bar select')])) {
        if(node.classList.contains('atlas-center-frame'))continue;saved.set(node,{inert:node.inert,aria:node.getAttribute('aria-hidden'),disabled:node.disabled});
        if(node.parentElement===plot) {node.inert=true;node.setAttribute('aria-hidden','true');} else if('disabled' in node)node.disabled=true;else node.inert=true;
      }
    }
    const key=page.tab?'lab':page.id,existing=frames.get(key);
    if(frame && frame!==existing){frame.contentWindow.postMessage({kind:'atlas:center-visibility',visible:false},location.origin);frame.hidden=true;}
    frame=existing;context(page,symbol,region);
    if(page.id==='rsi')controls.begin(activeSymbol,epoch);
    if(!frame) {frame=document.createElement('iframe');frame.className='atlas-center-frame';frame.title=page.title;frames.set(key,frame);plot.append(frame);const owned=frame;frame.addEventListener('load',()=>{owned.dataset.centerLoaded='true';if(frame===owned)clearCenterLoading();});}
    frame.hidden=false;frame.title=page.title;
    if(frame.dataset.centerLoaded!=='true'){loadingLayer=document.createElement('div');loadingLayer.className='atlas-center-loading';plot.append(loadingLayer);setLoadingSurface(loadingLayer,true,{kind:page.id==='rsi'?'rsi':page.tab==='diagnosis'?'diagnosis':page.id==='data'?'table':'chart',label:`${page.title} 로딩`});}
    if(existing && page.tab) frame.contentWindow.postMessage(navigateMessage(),location.origin);
    else if(!existing) {
      if(page.tab&&staticEntry){const target=new URL(staticEntry,new URL(home,location.origin));if(target.origin!==location.origin||!target.pathname.startsWith(atlasRootPath()))throw new Error('Static frame escaped Atlas root');target.search=new URLSearchParams({embedded:'1','lab-tab':page.tab,'lab-region':page.region||'us',epoch:String(epoch),...(atlasNavigationId(page)==='rsi'?{symbol:activeSymbol}:{}),...(activeRegion?{region:activeRegion}:{})}).toString();frame.src=target.href;}
      else if(page.tab){const target=new URL(atlasSitePath(atlasPageHref(page,{symbol:activeSymbol,region:activeRegion})),location.origin);target.searchParams.set('embedded','1');target.searchParams.set('epoch',String(epoch));frame.src=target.href;}
      else frame.src=`${home}?page=${page.view}&embedded=1`;
    }
    if(page.id==='data') {
      const owned=frame;
      dataHeaderActions=mountDataHeaderActions({frame:owned,heading:document.querySelector('.atlas-canvas-heading'),isActive:()=>frame===owned&&activePage?.id==='data'});
    }
    const url=page.tab?atlasSitePath(atlasPageHref(page,{symbol:activeSymbol,region:activeRegion})):`${home}?page=outlook&center=${page.id}`;
    if(history)window.history.pushState(null,'',url);
    else if(page.tab)window.history.replaceState(null,'',url);
  }
  function click(event) {
    if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const item=event.target.closest?.('[data-atlas-page],.atlas-brand'),page=atlasPages.find(page=>page.id===(item?.classList.contains('atlas-brand')?'outlook':item?.dataset.atlasPage));
    if(!page)return;
    if(page.id==='outlook') {if(!activePage)return;event.preventDefault();event.stopImmediatePropagation();restore();window.history.pushState(null,'',originalUrl && !originalUrl.includes('/market-lab/') ? originalUrl : home+'?page=outlook');return;}
    event.preventDefault();event.stopImmediatePropagation();
    const selected=page.id==='rsi'?lastChart.page:page.id==='market-us'?lastMarket:page;
    open(selected,page.id==='rsi'?lastChart.symbol:activeSymbol,{region:page.id==='rsi'?lastChart.region:undefined});
  }
  document.addEventListener('click',click,true);
  document.addEventListener('atlas:symbol-select',event=>{
    if(event.detail?.symbol===originalSymbol && activePage) {event.preventDefault();restore();window.history.pushState(null,'',originalUrl && !originalUrl.includes('/market-lab/') ? originalUrl : home+'?page=outlook');return;}
    const instrument=workspaceInstrument(event.detail?.symbol);
    if(!instrument)return;event.preventDefault();open(atlasPages.find(page=>page.id===instrument.page),instrument.symbol,{region:instrument.page==='housing'?instrument.region:undefined});
  });
  window.addEventListener('message',event=>{
    if(!frame||!activePage?.tab||event.source!==frame.contentWindow||event.origin!==location.origin)return;
    if(event.data?.kind==='atlas:rsi-state'){controls.update(event.data);return;}
    if(event.data?.kind==='atlas:center-select') {
      if(event.data.epoch!==epoch)return;
      const next=atlasPages.find(page=>page.id===event.data.page);if(!next?.tab)return;
      const instrument=workspaceInstrument(event.data.symbol);
      if(atlasNavigationId(next)==='rsi'&&(!instrument||instrument.page!==next.id))return;
      open(next,instrument?.symbol||activeSymbol,{region:instrument?.page==='housing'?instrument.region:undefined});return;
    }
    if(event.data?.kind!=='atlas:center-state')return;
    const page=atlasPages.find(page=>page.id===event.data.page);if(!page?.tab)return;
    // The host owns navigation. An initial/late frame render acknowledges its
    // state; if a newer user selection overtook it, replay that latest intent.
    const nextSymbol=workspaceInstrument(event.data.symbol)?.symbol || activeSymbol;
    if(activePage.id===page.id && (atlasNavigationId(page)!=='rsi'||activeSymbol===nextSymbol)&&event.data.epoch===epoch){frame.dataset.centerLoaded='true';clearCenterLoading();return;}
    frame.contentWindow.postMessage(navigateMessage(),location.origin);
  });
  window.addEventListener('popstate',()=>{
    const center=new URLSearchParams(location.search).get('center');
    const page=location.pathname.includes('/market-lab/')?labPageFromLocation(location):atlasPages.find(page=>page.id===center);
    if(page?.id&&page.id!=='outlook')open(page,new URLSearchParams(location.search).get('symbol'),{history:false,region:new URLSearchParams(location.search).get('region')});else restore();
  });
  const observer=new MutationObserver(()=>{
    plot=document.querySelector('.atlas-plot');if(!plot)return;observer.disconnect();
    if(waiting){const target=waiting;waiting=null;open(target.page,target.symbol,{history:target.history,region:target.region});}
    else {
      const center=new URLSearchParams(location.search).get('center'),initial=location.pathname.includes('/market-lab/')?labPageFromLocation(location):atlasPages.find(page=>page.id===center);
      if(initial?.id&&initial.id!=='outlook')open(initial,new URLSearchParams(location.search).get('symbol'),{history:false,region:new URLSearchParams(location.search).get('region')});
    }
  });
  observer.observe(document.body,{subtree:true,childList:true});
}
