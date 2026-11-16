import { workspaceInstrument } from './workspace-instruments.js';

// Route identities remain stable for saved links. All instruments share the
// price-chart destination while source-specific workspaces keep their routes.
export const atlasPages = Object.freeze([
  {id:'outlook', label:'가격 차트', title:'가격 차트', view:'outlook', href:'/?page=outlook', icon:'M3 17l5-6 4 3 8-10M15 4h5v5'},
  {id:'market-us', badge:'US', label:'미국 시장', title:'미국 시장 진단', view:'market', tab:'diagnosis', region:'us', href:'/market-lab/us/', icon:'M4 20V10m8 10V4m8 16v-7'},
  {id:'market-kr', badge:'KR', label:'국내 시장', title:'국내 시장 진단', view:'market', tab:'diagnosis', region:'kr', href:'/market-lab/kr/', icon:'M4 20V10m8 10V4m8 16v-7'},
  {id:'scenario', label:'조건 실험', title:'조건 실험', view:'market', tab:'scenario', href:'/market-lab/scenario/', icon:'M3 12h4l3-8 4 16 3-8h4'},
  {id:'cashflow', label:'현금흐름', title:'현금흐름', view:'market', tab:'ai', href:'/market-lab/cashflow/', icon:'M3 6h18v12H3zM3 10h18M7 14h3'},
  {id:'rsi', label:'삼플레·RSI', title:'삼플레·RSI', view:'market', tab:'rsi', href:'/market-lab/rsi/', icon:'M3 4v16h18M4 14l4-3 4 4 4-9 5 4'},
  {id:'housing', label:'부동산', title:'부동산 거래량·가격', view:'market', tab:'housing', href:'/market-lab/housing/', icon:'M3 11l9-8 9 8M5 10v11h14V10M9 21v-7h6v7'},
  {id:'themes', label:'테마·재료', title:'테마·재료', view:'market', tab:'themes', href:'/market-lab/themes/', icon:'M3 5h7l3 3h8v12H3zM7 12h10M7 16h6'},
  {id:'evidence', label:'리서치', title:'리서치', view:'evidence', href:'/?page=evidence', icon:'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1m0-14c3-2 6-2 9-1v14c-3-1-6-1-9 1V6'},
  {id:'data', label:'자산 비교', title:'자산 비교', view:'data', href:'/?page=data', icon:'M3 4h18v16H3zM3 10h18M3 15h18M9 4v16'},
  {id:'ipo', label:'공모주', title:'공모주', view:'ipo', href:'/?page=ipo', icon:'M3 6h18v15H3zM3 11h18M8 3v5M16 3v5'},
  {id:'relay', label:'릴레이 콘텐츠', title:'릴레이 콘텐츠', view:'relay', href:'/?page=relay', icon:'M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5'},
  {id:'conference', label:'컨퍼런스 복습', title:'컨퍼런스 복습', view:'conference', href:'/?page=conference', icon:'M3 4h18v13H3zM8 21l4-4 4 4M10 7l5 3-5 3V7Z'},
]);
export function isWorkspaceChart(page) {
  const id=typeof page==='string'?page:page?.id;
  return ['rsi','housing','themes'].includes(id);
}
export function atlasNavigationId(page) {
  const id=typeof page==='string'?page:page?.id;
  return ['market-us','market-kr','scenario','cashflow'].includes(id)?'market-us'
    : isWorkspaceChart(id)?'outlook':id;
}
export const atlasNavigationPages=Object.freeze(atlasPages
  .filter(page=>atlasNavigationId(page)===page.id)
  .map(page=>Object.freeze(page.id==='market-us'
    ? {...page,badge:null,label:'시장 분석',title:'시장 분석',href:'/market-lab/'}
    :page)));

export function atlasPageHref(page,{symbol,region}={}) {
  const item=typeof page==='string'?atlasPages.find(item=>item.id===page):page;
  if(!item)return '/?page=outlook';
  if(item.id==='outlook') {
    const instrument=workspaceInstrument(symbol);
    if(instrument)return atlasPageHref(instrument.page,{symbol:instrument.symbol,region:instrument.region});
    const native=String(symbol||'').normalize('NFKC').trim().toUpperCase();
    return ['ETHUSD','MSTR','BMNR'].includes(native)?'/?page=outlook&symbol='+native:item.href;
  }
  if(atlasNavigationId(item)==='market-us') {
    const query=new URLSearchParams();
    if(item.id==='market-kr')query.set('region','kr');
    if(item.id==='scenario'||item.id==='cashflow')query.set('view',item.id);
    return '/market-lab/'+(query.size?'?'+query:'');
  }
  if(isWorkspaceChart(item)) {
    const candidate=workspaceInstrument(symbol);
    const fallback=item.id==='themes'?'HYPE':item.id==='housing'?`HOUSING-${String(region||'busan').toUpperCase()}`:'TQQQ';
    const selected=candidate?.page===item.id?candidate:workspaceInstrument(fallback)||workspaceInstrument('HOUSING-BUSAN');
    const query=new URLSearchParams({symbol:selected.symbol});
    if(selected.page==='housing')query.set('region',selected.region);
    return '/market-lab/charts/?'+query;
  }
  return item.href;
}
// Saved/shared chart URLs must reach the renderer that owns the instrument.
// Native charts do not belong to the embedded ETF/housing/theme catalog.
// Preserve chart settings while removing only the embedded-route selectors.
export function canonicalNativeChartEntry(location) {
  const root=(location?.pathname||'').match(/^(.*\/)market-lab\/charts\/?$/)?.[1];
  if(!root||!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(root)||root.includes('/../')||root.includes('/./'))return null;
  const query=new URLSearchParams(location?.search||'');
  const symbol=String(query.get('symbol')||'').normalize('NFKC').trim().toUpperCase();
  if(!['BTCUSD','ETHUSD','MSTR','BMNR'].includes(symbol))return null;
  query.set('symbol',symbol);
  for(const key of ['center','lab-tab','lab-region','view','region','embedded'])query.delete(key);
  if(query.get('page')==='market')query.delete('page');
  return `${root}?${query}${location?.hash||''}`;
}
// Root symbol links are also valid chart entry points. Route known hosted
// instruments before the native BTC boot fallback can claim their identity.
// Explicit dashboard/center links and already canonical chart routes keep
// their owner; the inverse native redirect above remains independent.
export function canonicalWorkspaceChartEntry(location) {
  const root=location?.pathname||'/';
  if(location?.protocol&&!/^https?:$/.test(location.protocol))return null;
  if(!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(root)||root.includes('/market-lab/')||root.includes('/../')||root.includes('/./'))return null;
  const query=new URLSearchParams(location?.search||'');
  if(query.get('embedded')==='1'||query.has('center')||query.has('page')&&query.get('page')!=='outlook')return null;
  const instrument=workspaceInstrument(query.get('symbol'));
  if(!instrument)return null;
  query.set('symbol',instrument.symbol);
  query.delete('page');
  if(instrument.page==='housing')query.set('region',instrument.region);
  return `${root}market-lab/charts/?${query}${location?.hash||''}`;
}
export function labPageFromLocation(location) {
  const pathname=location?.pathname||'';
  const query=new URLSearchParams(location?.search||'');
  if(/\/market-lab\/charts\/?$/.test(pathname)) {
    if(canonicalNativeChartEntry(location))return atlasPages[0];
    const selected=workspaceInstrument(query.get('symbol'));
    return atlasPages.find(page=>page.id===(selected?.page||'rsi'))||atlasPages[5];
  }
  const direct=atlasPages.find(page=>page.tab&&(page.href===pathname||pathname.endsWith(page.href)));
  if(direct)return direct;
  if(query.has('view')) {
    const view=query.get('view');
    if(view==='scenario'||view==='cashflow')return atlasPages.find(page=>page.id===view)||atlasPages[1];
  }
  const tab=query.get('lab-tab')||'diagnosis';
  return atlasPages.find(page=>page.tab===tab&&(tab!=='diagnosis'||page.region===((query.get('region')||query.get('lab-region'))==='kr'?'kr':'us')))||atlasPages[1];
}
