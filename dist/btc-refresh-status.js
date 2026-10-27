// BTC daily source status. Provider checks, published snapshots and market
// candles have different owners; this component only describes the BTC archive.
const DAY=86400000;
function day(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time/DAY:null;
}
export function describeBtcRefresh({phase='idle',asOf=null,now=new Date()}={}){
  if(!['idle','refreshing','failed','checked','published'].includes(phase))throw new RangeError('Unknown BTC refresh phase');
  const time=now instanceof Date?now.getTime():Date.parse(now);
  if(!Number.isFinite(time))throw new RangeError('BTC refresh clock must be a valid instant');
  const observed=day(asOf),latestCompleted=Math.floor(time/DAY)-1;
  const date=observed===null?'관측일 미확인':asOf.replaceAll('-','.')+' UTC';
  const stale=observed===null||observed<latestCompleted;
  if(phase==='idle')return {state:'idle',visible:false,busy:false,summary:'',detail:'',announcement:'',stale};
  if(phase==='refreshing')return {state:'refreshing',visible:true,busy:true,summary:'비트코인 일별 확인 중',detail:'사용 중 · '+date,announcement:'비트코인 일별 자료를 확인합니다. 사용 중인 관측은 '+date+'입니다.',stale};
  if(phase==='failed')return {state:'failed',visible:true,busy:false,summary:'비트코인 일별 갱신 실패',detail:date+' 자료 유지',announcement:'비트코인 일별 갱신에 실패했습니다. '+date+' 자료를 유지합니다.',stale};
  const source=phase==='published'?'배포 자료 수신':'제공자 확인 완료';
  return {state:stale?'delayed':'checked',visible:stale,busy:false,summary:'비트코인 일별 제공 지연',detail:'확인한 관측 · '+date,
    announcement:stale?'비트코인 일별 자료를 확인했지만 최신 완료일보다 이전 자료입니다. 관측은 '+date+'입니다.':'비트코인 일별 '+source+'. 관측은 '+date+'입니다.',stale};
}

export function mountBtcRefreshStatus({document:doc=globalThis.document,onRetry,now=()=>new Date()}={}){
  const main=doc.getElementById('main'),notice=doc.getElementById('btc-refresh-notice');
  const summary=doc.getElementById('btc-refresh-summary'),detail=doc.getElementById('btc-refresh-detail');
  const button=doc.getElementById('btc-refresh-retry'),live=doc.getElementById('btc-refresh-announcement');
  if(!main||!notice||!summary||!detail||!button||!live)throw new Error('BTC refresh status markup missing');
  let phase='idle',asOf=null,page='outlook',destroyed=false;
  function measure(){
    const height=!notice.hidden&&page==='outlook'?Math.ceil(notice.getBoundingClientRect().height):0;
    const value=height+'px';
    if(doc.documentElement.style.getPropertyValue('--btc-refresh-height')!==value)doc.documentElement.style.setProperty('--btc-refresh-height',value);
  }
  function paint(){
    if(destroyed)return;
    const state=describeBtcRefresh({phase,asOf,now:now()}),visible=page!=='data'&&state.visible;
    summary.textContent=state.summary;detail.textContent=state.detail;
    notice.dataset.state=state.state;notice.setAttribute('aria-busy',String(state.busy));
    button.disabled=state.busy;button.textContent=state.busy?'확인 중':'재시도';
    if(!visible&&notice.contains(doc.activeElement))main.focus({preventScroll:true});
    notice.hidden=!visible;
    if(visible)main.dataset.btcNotice='true';else delete main.dataset.btcNotice;
    const announcement=page==='data'?'':state.announcement;
    // Updating only changed text avoids duplicate live announcements on renders.
    if(live.textContent!==announcement)live.textContent=announcement;
    measure();
  }
  function retry(){if(!button.disabled&&!destroyed)onRetry?.();}
  button.addEventListener('click',retry);
  const Resize=doc.defaultView?.ResizeObserver;
  const observer=Resize?new Resize(measure):null;observer?.observe(notice);
  return {
    update(next={}){
      if(Object.hasOwn(next,'phase'))phase=next.phase;
      if(Object.hasOwn(next,'asOf'))asOf=next.asOf;
      if(Object.hasOwn(next,'page'))page=next.page;
      paint();
    },
    destroy(){destroyed=true;observer?.disconnect();button.removeEventListener('click',retry);doc.documentElement.style.removeProperty('--btc-refresh-height');}
  };
}
