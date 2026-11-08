/** Narrow expected-failure classification for the offline native evidence run.
 * No production URL, freshness rule, price value or error is changed here.
 * A true result is only eligibility; the caller must verify the actual document's
 * failed-refresh UI and preserved archive cutoff before accepting its request ID. */
export function ownsOfflineBtcPriceReadout(document={}){
  // A hosted center can retain the native parent's outlook/BTC identity while
  // replacing its price readout. Ownership comes from the active workspace,
  // never from whether a quote happens to exist or match the expected value.
  return document.page==='outlook'&&(document.center==null||document.center==='');
}

export function offlineBtcRefreshSurface(spec,document={}){
  if(spec?.consolidated!==true)return spec?.surface;
  if(spec.page!=='workspace-consolidated'||spec.surface!==undefined||document.preview===true)return undefined;
  // The evidence child boots its own BTC archive and refresh. Admit only that
  // explicitly observed active document; its failed UI, cutoff and request's
  // frame/loader identity still require separate browser verification.
  if(document.consolidatedEvidence===true){
    const owner=document.frameOwner;
    if(document.nativeSymbol!=='BTCUSD'||document.page!=='evidence'||document.embedded!==true||
      !owner||owner.parentCenter!=='evidence'||owner.count!==1||owner.source!==document.url||
      owner.visible!==true||owner.topmost!==true||typeof document.url!=='string'||typeof owner.parentUrl!=='string')return undefined;
    try{
      const child=new URL(document.url),parent=new URL(owner.parentUrl),root='/bitcoin-cycle-atlas/';
      if(!['http:','https:'].includes(child.protocol)||child.origin!==parent.origin||
        child.username||child.password||parent.username||parent.password||
        child.pathname!==root||!parent.pathname.startsWith(root)||
        child.searchParams.getAll('page').length!==1||child.searchParams.get('page')!=='evidence'||
        child.searchParams.getAll('embedded').length!==1||child.searchParams.get('embedded')!=='1')return undefined;
      return 'evidence';
    }catch{return undefined;}
  }
  // Initial consolidation leaves the native BTC parent in charge of its own
  // refresh. Unknown child surfaces cannot borrow that parent's ownership.
  if(document.nativeSymbol!=='BTCUSD'||document.page!=='outlook'||document.center!=='market-us')return undefined;
  return 'btc';
}

export function isExpectedOfflineBtcRefresh(error,{surface,archiveAsOf}={}){
  if(!['btc','evidence','legacy','preview','center-data'].includes(surface)||!error||
    error.networkEvent!=='Network.loadingFailed'||typeof error.errorText!=='string'||error.blockedReason!=='inspector'||error.method!=='GET'||error.resourceType!=='Fetch'||
    error.httpStatus!=null||typeof error.requestId!=='string'||!error.requestId||
    typeof error.frameId!=='string'||!error.frameId||typeof error.loaderId!=='string'||!error.loaderId||
    !Number.isFinite(error.requestWallTime)||error.requestWallTime<=0)return false;
  if(typeof archiveAsOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(archiveAsOf))return false;
  try{
    const requestDay=new Date(error.requestWallTime*1000).toISOString().slice(0,10);
    const archiveDay=Date.parse(archiveAsOf+'T00:00:00Z');
    if(!Number.isFinite(archiveDay)||new Date(archiveDay).toISOString().slice(0,10)!==archiveAsOf||
      (Date.parse(requestDay+'T00:00:00Z')-archiveDay)/86400000<=1)return false;
    const expected=new URL('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics');
    for(const [key,value] of Object.entries({assets:'btc',metrics:'PriceUSD',frequency:'1d',
      start_time:'2010-07-18',end_time:requestDay,page_size:'10000',paging_from:'start'}))expected.searchParams.set(key,value);
    return error.url===expected.href;
  }catch{return false;}
}
