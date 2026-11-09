import {atlasSitePath,atlasRootPath} from './site-paths.js';
import { atlasPages,atlasNavigationId,atlasPageHref,labPageFromLocation,isWorkspaceChart,canonicalNativeChartEntry } from './atlas-navigation.js?v=1.36.1';
import { workspaceInstrument } from './workspace-instruments.js';
import { mountLegacyWorkspaceToolbar } from './legacy-workspace-toolbar.js';
import { createChartWorkbenchControls,nativeChartControlSelector } from './rsi-workbench-controls.js?v=1.36.1';
import { mountCenterLoading } from './ui/center-loading.js';

// Chromium retargets activeElement to an iframe when a child control owns
// focus, without matching :focus or :focus-within on that iframe. Reflect the
// real document focus so the outer workspace boundary remains visible too.
export function mountCenterFrameFocus({frame,epoch,isActive}) {
  const document=frame.ownerDocument,view=document.defaultView,token=String(epoch);
  let destroyed=false,child=null,queued=false,animation=null;
  const outerCleanup=[],childCleanup=[];
  const listen=(target,type,listener,cleanup)=>{
    if(!target?.addEventListener)return;
    target.addEventListener(type,listener,true);
    cleanup.push(()=>target.removeEventListener(type,listener,true));
  };
  const clear=()=>{if(frame.dataset.centerFocus===token)delete frame.dataset.centerFocus;};
  const sync=()=>{
    if(destroyed)return;
    let focused=false;
    try{
      focused=!!(isActive()&&frame.isConnected&&!frame.hidden&&frame.dataset.centerEpoch===token
        &&child&&child===frame.contentDocument&&document.visibilityState!=='hidden'
        &&document.hasFocus?.()&&document.activeElement===frame);
    }catch{/* An inaccessible/replaced child cannot own the current boundary. */}
    if(focused)frame.dataset.centerFocus=token;else clear();
  };
  const schedule=()=>{
    if(destroyed)return;
    sync();
    // focusout/Window blur can precede activeElement being retargeted. Check
    // again after native focus dispatch, and once at the next painted frame.
    if(!queued){queued=true;queueMicrotask(()=>{queued=false;sync();});}
    if(animation===null&&view?.requestAnimationFrame)animation=view.requestAnimationFrame(()=>{animation=null;sync();});
  };
  const bindChild=()=>{
    for(const remove of childCleanup.splice(0))remove();
    child=null;
    try{child=frame.contentDocument;}catch{/* Same-origin access is required. */}
    for(const type of ['focusin','focusout'])listen(child,type,schedule,childCleanup);
    for(const type of ['focus','blur'])listen(child?.defaultView,type,schedule,childCleanup);
    schedule();
  };
  for(const type of ['focusin','focusout','visibilitychange'])listen(document,type,schedule,outerCleanup);
  for(const type of ['focus','blur','pageshow'])listen(view,type,schedule,outerCleanup);
  listen(frame,'load',bindChild,outerCleanup);
  bindChild();
  return {destroy(){
    if(destroyed)return;
    destroyed=true;
    for(const remove of [...outerCleanup,...childCleanup])remove();
    if(animation!==null)view.cancelAnimationFrame(animation);
    child=null;clear();
  }};
}

// The original chart owns all four perimeter regions. Only its center is
// replaced; the same-origin frame keeps React's DOM and styles independently owned.
export function mountCenterWorkbench() {
  const document=globalThis.document,window=globalThis.window,location=globalThis.location;
  const service=document.querySelector('meta[name="atlas-service-base"]');
  const staticEntry=!service&&/^https?:$/.test(location.protocol)?document.querySelector('meta[name="atlas-static-entry"]')?.getAttribute('content'):null;
  if (window.parent !== window || !(service||staticEntry)) return;
  const nativeEntry=canonicalNativeChartEntry(location);
  if(nativeEntry){location.replace(nativeEntry);return;}
  // Freeze document-relative icons before history changes the route depth.
  if(staticEntry)for(const icon of document.querySelectorAll('link[rel~="icon"][href]'))icon.href=new URL(icon.getAttribute('href'),document.baseURI).href;
  const home=atlasSitePath('/');
  const entryVersion=new URL(import.meta.url).searchParams.get('v');
  const versionedFrame=target=>{if(entryVersion)target.searchParams.set('v',entryVersion);return target.href;};
  if(staticEntry&&new URLSearchParams(location.search).get('page')==='market'){
    const page=labPageFromLocation(location),query=new URLSearchParams(location.search);
    const url=new URL(atlasSitePath(atlasPageHref(page,{symbol:query.get('symbol'),region:query.get('region')})),location.origin);
    window.history.replaceState(null,'',url);
  }
  document.body.classList.add('js');
  let frame, plot, activePage=null, activeSymbol='TQQQ', activeRegion, originalSymbol='BTCUSD', originalUrl=null, originalTitle=null, waiting=null;
  // A null chart is the native BTC/ETH/equity underneath the center. Entering
  // an analysis page never replaces the most recently selected instrument.
  let lastChart=null,lastMarket=atlasPages.find(page=>page.id==='market-us');
  const frames=new Map();
  const toolbarHosts=new Map();
  let loading=null;
  let legacyToolbar=null;
  let frameFocus=null;
  // Each same-origin frame retains its own toolbar mount. React portals keep
  // their actual state/event owner; switching pages hides, never replaces, a
  // mounted target while the previous frame may still be completing work.
  function toolbarFor(key,page) {
    let host=toolbarHosts.get(key);
    if(!host){
      host=document.createElement('div');host.id=`atlas-center-toolbar-${key}`;
      host.className='center-workspace-toolbar';host.dataset.toolbarOwner=key;
      host.setAttribute('role','toolbar');host.tabIndex=-1;
      document.querySelector('.atlas-canvas-heading')?.append(host);toolbarHosts.set(key,host);
    }
    for(const candidate of toolbarHosts.values())candidate.hidden=candidate!==host;
    host.setAttribute('aria-label',`${page.title} 도구`);host.dataset.page=page.id;
    return host;
  }
  function clearCenterLoading(){loading?.destroy();loading=null;}
  let epoch=0,selectionEpochFloor=0,activeIntentSerial=0;
  let suspended=false,resumeCenter=null;
  window.addEventListener('pagehide',event=>{
    suspended=true;
    resumeCenter=event?.persisted&&activePage&&frame?{page:activePage,symbol:activeSymbol,region:activeRegion,frame,epoch}:null;
    clearCenterLoading();
  });
  window.addEventListener('pageshow',event=>{
    suspended=false;
    const pending=resumeCenter;resumeCenter=null;
    if(!event.persisted||!pending||frame!==pending.frame||activePage!==pending.page||epoch!==pending.epoch)return;
    // BFCache retains the child document, but pagehide retired its readiness
    // owner. Rebind a fresh epoch without rewriting the restored chart URL.
    open(pending.page,pending.symbol,{history:false,region:pending.region,preserveUrl:true});
  });
  let lastSelection={epoch:-1,serial:0};
  let originalReader=null;
  let originalIdentity=null;
  const controls=createChartWorkbenchControls({send:message=>frame?.contentWindow.postMessage(message,location.origin),isActive:()=>isWorkspaceChart(activePage)});
  const saved = new Map();
  // The BTC renderer can update its navigation buttons after the center opens.
  // Preserve their original state and keep hidden-chart actions unavailable.
  const protectNavigation=()=>{
    if(!activePage||isWorkspaceChart(activePage))return;
    for(const node of document.querySelectorAll('.chart-navigation button')){
      if(!saved.has(node))saved.set(node,{inert:node.inert,aria:node.getAttribute('aria-hidden'),disabled:node.disabled});
      if(!node.disabled)node.disabled=true;
    }
  };
  const navigationObserver=new MutationObserver(protectNavigation);
  navigationObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  const closeTray=()=>document.querySelector('.mobile-workbench-button[aria-expanded="true"]')?.click();
  const navigateMessage=()=>({kind:'atlas:center-navigate',page:activePage.id,symbol:activeSymbol,epoch,...(activeRegion?{region:activeRegion}:{}),...(activeIntentSerial?{intentSerial:activeIntentSerial}:{})});
  const centerHref=(page,symbol,region)=>page.tab?atlasSitePath(atlasPageHref(page,{symbol,region})):`${home}?page=outlook&center=${page.id}`;
  function syncPriceLink(){
    const href=lastChart?atlasSitePath(atlasPageHref('outlook',{symbol:lastChart.symbol})):originalUrl||atlasSitePath(atlasPageHref('outlook',{symbol:originalSymbol}));
    for(const item of document.querySelectorAll('a[data-atlas-page=outlook]'))item.href=href;
  }
  function context(page,symbol,region) {
    activePage=page;
    if(isWorkspaceChart(page)) {
      const target=new URL(atlasPageHref(page,{symbol,region}),location.origin);
      const instrument=workspaceInstrument(target.searchParams.get('symbol'));
      activeSymbol=instrument.symbol;activeRegion=instrument.page==='housing'?instrument.region:undefined;
      lastChart={page,symbol:activeSymbol,region:activeRegion};
    }else{activeRegion=undefined;if(atlasNavigationId(page)==='market-us')lastMarket=page;}
    document.body.dataset.centerTool=page.id;
    const headingNode=document.getElementById('outlook-heading'),graph=document.querySelector('.atlas-workbench');
    if(!originalIdentity)originalIdentity={heading:headingNode?.textContent,graphLabel:graph?.getAttribute('aria-label'),plot,plotLabel:plot?.getAttribute('aria-label')};
    const instrument=isWorkspaceChart(page)?workspaceInstrument(activeSymbol):null;
    if(headingNode)headingNode.textContent=instrument?`${instrument.koreanName} (${instrument.symbol}) 가격 차트`:page.title;
    const graphLabel=instrument?`${instrument.koreanName} · ${instrument.symbol} · ${instrument.currency} 관측 가격 그래프`:page.title;
    // Native ETH/equity plots are named sections and remain the iframe's
    // visible container. Their accessible name belongs to the active center.
    for(const region of [graph,plot])region?.setAttribute('aria-label',graphLabel);
    protectNavigation();
    for (const item of document.querySelectorAll('[data-atlas-page]')) {
      const selected=item.dataset.atlasPage===atlasNavigationId(page);item.classList.toggle('active',selected);
      if (selected) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    }
    document.title=`${isWorkspaceChart(page)?workspaceInstrument(activeSymbol).koreanName+' · 가격 차트':page.title} · Cycle Atlas`;
    syncPriceLink();
    document.dispatchEvent(new CustomEvent('atlas:active-symbol',{detail:{symbol:lastChart?.symbol||originalSymbol}}));
    const heading=document.querySelector('.atlas-canvas-heading');
    if (heading) heading.dataset.centerPage=page.title;
  }
  function restore() {
    if (!frame || !activePage) return;
    frameFocus?.destroy();frameFocus=null;
    clearCenterLoading();closeTray();controls.restore();legacyToolbar?.destroy();legacyToolbar=null;frame.contentWindow.postMessage({kind:'atlas:center-visibility',visible:false},location.origin);
    for(const host of toolbarHosts.values())host.hidden=true;
    document.dispatchEvent(new CustomEvent('atlas:close-detail'));
    frame.hidden=true;delete document.body.dataset.centerTool;activePage=null;lastChart=null;syncPriceLink();
    for (const [node,state] of saved) { node.inert=state.inert; if(state.aria==null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',state.aria);if('disabled' in node)node.disabled=state.disabled;if('hidden' in state)node.hidden=state.hidden; }
    saved.clear();
    if(originalIdentity){
      const headingNode=document.getElementById('outlook-heading'),graph=document.querySelector('.atlas-workbench');
      if(headingNode&&originalIdentity.heading!=null)headingNode.textContent=originalIdentity.heading;
      if(graph){if(originalIdentity.graphLabel==null)graph.removeAttribute('aria-label');else graph.setAttribute('aria-label',originalIdentity.graphLabel);}
      const nativePlot=originalIdentity.plot;
      if(nativePlot){if(originalIdentity.plotLabel==null)nativePlot.removeAttribute('aria-label');else nativePlot.setAttribute('aria-label',originalIdentity.plotLabel);}
      originalIdentity=null;
    }
    document.dispatchEvent(new CustomEvent('atlas:active-symbol',{detail:{symbol:originalSymbol}}));
    document.dispatchEvent(new CustomEvent('atlas:center-restored'));
    if(originalReader)document.dispatchEvent(new CustomEvent('atlas:open-detail',{detail:{kind:originalReader,focus:false}}));originalReader=null;
    if (originalTitle) document.title=originalTitle;
    for (const item of document.querySelectorAll('[data-atlas-page]')) { const selected=item.dataset.atlasPage==='outlook';item.classList.toggle('active',selected);if(selected)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current'); }
  }
  function open(page,symbol,{history=true,region,intentSerial=0,preserveUrl=false}={}) {
    // Direct dashboard entries do not initialize the chart host. A previously
    // mounted plot can also belong to a hidden outlook view. Navigate to the
    // shared shell instead of waiting for, or opening inside, an unavailable host.
    const outerView=document.body.dataset.page||new URLSearchParams(location.search).get('page');
    if(['compare','evidence','data','ipo','market'].includes(outerView)) {
      const url=centerHref(page,symbol,region);
      if(history)location.assign(url);else location.replace(url);
      return;
    }
    // Native asset controllers retain the outer shell but replace their plot
    // during boot. Resolve the live owner instead of keeping a detached plot.
    plot=document.querySelector('.atlas-plot');
    if (!plot) {waiting={page,symbol,history,region,intentSerial,preserveUrl};return;}
    frameFocus?.destroy();frameFocus=null;
    clearCenterLoading();closeTray();controls.restore();legacyToolbar?.destroy();legacyToolbar=null;epoch++;
    activeIntentSerial=intentSerial;
    // Consecutive child choices can share an epoch until the host reply arrives.
    // A menu, search or history action in the host starts a new ownership floor.
    if(!intentSerial){selectionEpochFloor=epoch;lastSelection={epoch:-1,serial:0};}
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
      const headingChildren=[...document.querySelector('.atlas-canvas-heading')?.children || []].filter(node=>!node.matches('.symbol-selector-trigger,.mobile-workbench-button,.center-workspace-toolbar'));
      for(const node of new Set([...plot.children,...headingChildren,...document.querySelectorAll('.atlas-canvas-heading button:not(.symbol-selector-trigger):not(.mobile-workbench-button),.atlas-canvas-heading select,#atlas-cycle-panel,.workbench-tools,.workbench-tools button,.chart-navigation button,.workbench-detail-tools,.workbench-detail-tools button,.workbench-help,.mobile-extra-actions,.mobile-extra-actions button,.workbench-bottom-bar,.workbench-bottom-bar button,.workbench-bottom-bar select')])) {
        if(node.classList.contains('atlas-center-frame')||node.closest('.center-workspace-toolbar'))continue;
        const nativeControl=node.closest('.atlas-canvas-heading')&&node.matches(nativeChartControlSelector);
        saved.set(node,{inert:node.inert,aria:node.getAttribute('aria-hidden'),disabled:node.disabled,...(nativeControl?{hidden:node.hidden}:{})});
        if(nativeControl)node.hidden=true;
        if(node.parentElement===plot) {node.inert=true;node.setAttribute('aria-hidden','true');} else if('disabled' in node)node.disabled=true;else node.inert=true;
      }
    }
    const key=page.tab?'lab':page.id,existing=frames.get(key);
    const toolbar=toolbarFor(key,page);
    if(frame && frame!==existing){frame.contentWindow.postMessage({kind:'atlas:center-visibility',visible:false},location.origin);frame.hidden=true;}
    frame=existing;context(page,symbol,region);
    if(isWorkspaceChart(page))controls.begin(activeSymbol,epoch);
    if(!frame) {frame=document.createElement('iframe');frame.className='atlas-center-frame';frames.set(key,frame);plot.append(frame);}
    frame.dataset.toolbarId=toolbar.id;frame.dataset.centerEpoch=String(epoch);frame.hidden=false;frame.title=isWorkspaceChart(page)?`${activeSymbol} 가격 차트`:page.title;
    delete frame.dataset.centerLoaded;
    const focusOwner=frame,focusEpoch=epoch;
    frameFocus=mountCenterFrameFocus({frame:focusOwner,epoch:focusEpoch,isActive:()=>frame===focusOwner&&!!activePage&&epoch===focusEpoch});
    loading=mountCenterLoading({frame:focusOwner,plot,toolbar,
      kind:page.id==='rsi'?'rsi':page.tab==='diagnosis'?'diagnosis':page.id==='data'?'table':'chart',
      label:isWorkspaceChart(page)?`${activeSymbol} 가격 차트`:page.title,
      isCurrent:()=>frame===focusOwner&&activePage?.id===page.id&&epoch===focusEpoch,
      documentReady:!page.tab,
      onLoad:()=>{if(page.tab)focusOwner.contentWindow?.postMessage(navigateMessage(),location.origin);},
      onSettled:()=>document.dispatchEvent(new CustomEvent('atlas:ready')),
      onRetry:()=>{
        // A failed document must not acknowledge the retry or leave its old
        // React portals attached to the new frame's toolbar host.
        const retryPage=activePage,retrySymbol=activeSymbol,retryRegion=activeRegion;
        frameFocus?.destroy();frameFocus=null;legacyToolbar?.destroy();legacyToolbar=null;
        focusOwner.hidden=true;focusOwner.remove();frames.delete(key);frame=null;
        toolbar.remove();toolbarHosts.delete(key);
        open(retryPage,retrySymbol,{history:false,region:retryRegion,preserveUrl:true});
      },
    });
    if(existing && page.tab) frame.contentWindow.postMessage(navigateMessage(),location.origin);
    else if(!existing) {
      if(page.tab&&staticEntry){const target=new URL(staticEntry,new URL(home,location.origin));if(target.origin!==location.origin||!target.pathname.startsWith(atlasRootPath()))throw new Error('Static frame escaped Atlas root');target.search=new URLSearchParams({embedded:'1','lab-tab':page.tab,'lab-region':page.region||'us',epoch:String(epoch),...(isWorkspaceChart(page)?{symbol:activeSymbol}:{}),...(activeRegion?{region:activeRegion}:{})}).toString();frame.src=versionedFrame(target);}
      else if(page.tab){const target=new URL(atlasSitePath(atlasPageHref(page,{symbol:activeSymbol,region:activeRegion})),location.origin);target.searchParams.set('embedded','1');target.searchParams.set('epoch',String(epoch));frame.src=versionedFrame(target);}
      else frame.src=versionedFrame(new URL(`${home}?page=${page.view}&embedded=1`,location.origin));
    }
    if(!page.tab) {
      const owned=frame;
      legacyToolbar=mountLegacyWorkspaceToolbar({frame:owned,heading:document.querySelector('.atlas-canvas-heading'),host:toolbar,page:page.id,isActive:()=>frame===owned&&activePage?.id===page.id});
    }
    const url=centerHref(page,activeSymbol,activeRegion);
    if(!preserveUrl){
      if(history)window.history.pushState(null,'',url);
      else if(page.tab)window.history.replaceState(null,'',url);
    }
  }
  function click(event) {
    if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const item=event.target.closest?.('[data-atlas-page],.atlas-brand'),page=atlasPages.find(page=>page.id===(item?.classList.contains('atlas-brand')?'outlook':item?.dataset.atlasPage));
    if(!page)return;
    if(page.id==='outlook') {
      if(!activePage)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(lastChart){
        if(!isWorkspaceChart(activePage))open(lastChart.page,lastChart.symbol,{region:lastChart.region});
      }else{restore();window.history.pushState(null,'',originalUrl && !originalUrl.includes('/market-lab/') ? originalUrl : home+'?page=outlook');}
      return;
    }
    event.preventDefault();event.stopImmediatePropagation();
    const selected=page.id==='market-us'?lastMarket:page;
    open(selected,isWorkspaceChart(page)&&lastChart?.page.id===page.id?lastChart.symbol:activeSymbol,{region:isWorkspaceChart(page)?lastChart?.region:undefined});
  }
  document.addEventListener('click',click,true);
  document.addEventListener('atlas:symbol-select',event=>{
    if(event.detail?.symbol===originalSymbol && activePage) {event.preventDefault();restore();window.history.pushState(null,'',originalUrl && !originalUrl.includes('/market-lab/') ? originalUrl : home+'?page=outlook');return;}
    const instrument=workspaceInstrument(event.detail?.symbol);
    if(!instrument)return;event.preventDefault();open(atlasPages.find(page=>page.id===instrument.page),instrument.symbol,{region:instrument.page==='housing'?instrument.region:undefined});
  });
  window.addEventListener('message',event=>{
    if(suspended||!frame||!activePage?.tab||event.source!==frame.contentWindow||event.origin!==location.origin)return;
    if(loading?.status==='error')return;
    if(['atlas:rsi-state','atlas:chart-state'].includes(event.data?.kind)){
      if(controls.update(event.data)){
        if(loading?.accept())frame.dataset.centerLoaded='true';
        // Only the acknowledged control owner can update outer page context.
        // Provider labels stay with the host's source policy, not child input.
        document.dispatchEvent(new CustomEvent('atlas:page-context',{detail:{page:activePage.id,symbol:activeSymbol,epoch,frequency:event.data.frequency,chartType:event.data.chartType}}));
      }
      return;
    }
    if(event.data?.kind==='atlas:center-select') {
      const next=atlasPages.find(page=>page.id===event.data.page);if(!next?.tab)return;
      const instrument=workspaceInstrument(event.data.symbol);
      if(isWorkspaceChart(next)&&(!instrument||instrument.page!==next.id))return;
      const baseEpoch=event.data.epoch,serial=event.data.intentSerial;
      if(serial===undefined){
        // Preserve the original protocol for an already loaded older child.
        if(baseEpoch!==epoch)return;
        open(next,instrument?.symbol||activeSymbol,{region:instrument?.page==='housing'?instrument.region:undefined});return;
      }
      if(!Number.isSafeInteger(serial)||serial<=0||!Number.isSafeInteger(baseEpoch)||baseEpoch<selectionEpochFloor||baseEpoch>epoch)return;
      if(baseEpoch<lastSelection.epoch||(baseEpoch===lastSelection.epoch&&serial<=lastSelection.serial))return;
      lastSelection={epoch:baseEpoch,serial};
      open(next,instrument?.symbol||activeSymbol,{region:instrument?.page==='housing'?instrument.region:undefined,intentSerial:serial});return;
    }
    if(event.data?.kind!=='atlas:center-state')return;
    const page=atlasPages.find(page=>page.id===event.data.page);if(!page?.tab)return;
    // The host owns navigation. An initial/late frame render acknowledges its
    // state; if a newer user selection overtook it, replay that latest intent.
    const nextInstrument=workspaceInstrument(event.data.symbol);
    if(activePage.id===page.id && (!isWorkspaceChart(page)||nextInstrument?.page===page.id&&activeSymbol===nextInstrument.symbol)&&event.data.epoch===epoch){
      // The route acknowledgement can precede price data and a painted chart.
      if(!isWorkspaceChart(page)){
        if(loading?.accept())frame.dataset.centerLoaded='true';
        // The host chooses the service/static renderer. Its US service view
        // requeries every minute; never accept a child's collection claim.
        document.dispatchEvent(new CustomEvent('atlas:page-context',{detail:{page:activePage.id,symbol:lastChart?.symbol||originalSymbol,epoch,refreshMode:service&&activePage.id==='market-us'?'poll':'manual',refreshIntervalMs:60000}}));
      }
      return;
    }
    frame.contentWindow.postMessage(navigateMessage(),location.origin);
  });
  window.addEventListener('popstate',()=>{
    const center=new URLSearchParams(location.search).get('center');
    const page=location.pathname.includes('/market-lab/')?labPageFromLocation(location):atlasPages.find(page=>page.id===center);
    if(page?.id&&page.id!=='outlook')open(page,new URLSearchParams(location.search).get('symbol'),{history:false,region:new URLSearchParams(location.search).get('region')});else restore();
  });
  const observer=new MutationObserver(()=>{
    plot=document.querySelector('.atlas-plot');if(!plot)return;observer.disconnect();
    if(waiting){const target=waiting;waiting=null;open(target.page,target.symbol,{history:target.history,region:target.region,intentSerial:target.intentSerial,preserveUrl:target.preserveUrl});}
    else {
      const center=new URLSearchParams(location.search).get('center'),initial=location.pathname.includes('/market-lab/')?labPageFromLocation(location):atlasPages.find(page=>page.id===center);
      if(initial?.id&&initial.id!=='outlook')open(initial,new URLSearchParams(location.search).get('symbol'),{history:false,region:new URLSearchParams(location.search).get('region')});
    }
  });
  observer.observe(document.body,{subtree:true,childList:true});
}
