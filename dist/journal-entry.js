let mounted=false, pending=null;
export function mountJournalEntry() {
  if (mounted || typeof document==='undefined') return;
  mounted=true;
  async function open(tab,opener) {
    try {
      pending ||= import('./forecast-journal.js?v=1.29.0');
      const {openForecastJournal}=await pending;
      openForecastJournal({tab,opener});
    } catch (error) {
      pending=null;
      document.dispatchEvent(new CustomEvent('atlas:action-feedback',{detail:{message:'예측 기록을 열지 못했습니다. 다시 시도해 주세요.'}}));
      const status=document.getElementById('workbench-announcement');
      if(status)status.textContent='예측 기록을 열지 못했습니다. 다시 시도해 주세요.';
      console.error('Forecast journal could not open',error);
    }
  }
  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-open-forecast-journal]');
    if(!trigger)return;
    event.preventDefault();void open(trigger.dataset.openForecastJournal||'records',trigger);
  });
  document.addEventListener('atlas:forecast-journal',event=>void open(event.detail?.tab||'records',event.detail?.opener||document.activeElement));
}
