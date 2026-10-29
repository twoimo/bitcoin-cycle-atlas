let mounted=false,pending=null,assetPending=null,generation=0;
export function mountJournalEntry({
  loadForecastModule=()=>import('./forecast-journal.js?v=1.29.0'),
  loadAssetModule=()=>import('./asset-forecast-journal.js?v=1.29.0'),
}={}){
  if(mounted||typeof document==='undefined')return;
  mounted=true;
  function intent(opener){
    const token=++generation,owner=opener?.closest?.('dialog');
    return ()=>token===generation&&document.visibilityState!=='hidden'&&Boolean(
      opener?.isConnected&&opener.getClientRects().length&&
      !opener.closest?.('[hidden],[inert],[aria-hidden="true"]')&&
      (!owner||owner.isConnected&&owner.open));
  }
  async function open(kind,value,opener){
    const current=intent(opener);
    if(!current())return;
    let requested;
    try{
      if(kind==='asset')requested=assetPending ||= Promise.resolve().then(loadAssetModule);
      else requested=pending ||= Promise.resolve().then(loadForecastModule);
      const module=await requested;
      if(!current())return;
      if(kind==='asset')module.openAssetForecastJournal({symbol:value,opener});
      else module.openForecastJournal({tab:value,opener});
    }catch(error){
      if(kind==='asset'&&assetPending===requested)assetPending=null;
      if(kind!=='asset'&&pending===requested)pending=null;
      if(!current())return;
      document.dispatchEvent(new CustomEvent('atlas:action-feedback',{detail:{message:'예측 기록을 열지 못했습니다. 다시 시도해 주세요.'}}));
      const status=document.getElementById('workbench-announcement');
      if(status)status.textContent='예측 기록을 열지 못했습니다. 다시 시도해 주세요.';
      console.error('Forecast journal could not open',error);
    }
  }
  document.addEventListener('click',event=>{
    const asset=event.target?.closest?.('[data-open-asset-forecast-journal]');
    if(asset){
      event.preventDefault();
      if(['ETHUSD','BMNR','MSTR'].includes(asset.dataset.openAssetForecastJournal))void open('asset',asset.dataset.openAssetForecastJournal,asset);
      return;
    }
    const trigger=event.target?.closest?.('[data-open-forecast-journal]');
    if(!trigger)return;
    event.preventDefault();void open('btc',trigger.dataset.openForecastJournal||'records',trigger);
  });
  document.addEventListener('atlas:forecast-journal',event=>void open('btc',event.detail?.tab||'records',event.detail?.opener||document.activeElement));
  document.addEventListener('atlas:asset-forecast-journal',event=>{
    const symbol=event.detail?.symbol;
    if(['ETHUSD','BMNR','MSTR'].includes(symbol))void open('asset',symbol,event.detail?.opener||document.activeElement);
  });
  document.addEventListener('atlas:modal-open',()=>{generation++;});
  if(typeof window!=='undefined')window.addEventListener('pagehide',()=>{generation++;});
}
