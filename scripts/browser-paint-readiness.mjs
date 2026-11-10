// Native selectors can leave a macOS headless target hidden after committing.
// Reactivate only this runner-owned target; never fabricate visibility or skip
// the font/animation-frame readiness checks that follow.
export async function ensureOwnedVisibleForPaint(cdp,evaluate,until){
  const state=await evaluate(cdp,()=>document.visibilityState);
  if(state==='visible')return {reactivated:false};
  if(state!=='hidden')throw new Error('Unexpected owned browser visibility: '+state);
  await cdp.send('Page.bringToFront');
  await until(()=>evaluate(cdp,()=>document.visibilityState==='visible'),'owned browser target becomes visibly active',10000);
  return {reactivated:true};
}
