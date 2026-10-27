/** Narrow expected-failure classification for the offline native evidence run.
 * No production URL, freshness rule, price value or error is changed here.
 * A true result is only eligibility; the caller must verify the actual document's
 * failed-refresh UI and preserved archive cutoff before accepting its request ID. */
export function isExpectedOfflineBtcRefresh(error,{surface,archiveAsOf}={}){
  if(!['btc','evidence','legacy','preview'].includes(surface)||!error||
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
