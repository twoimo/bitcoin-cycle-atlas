// The dashboard header sizes itself from its content. Only the workspace uses
// this measured offset, so observing a wrapped description cannot resize its
// own measurement target and create a feedback loop.
export function observePageHeader(header) {
  const body=header?.ownerDocument?.body,style=body?.style;
  if(!header||!style)return {sync() {},destroy() {}};
  const view=header.ownerDocument.defaultView,key='--app-header-height';
  const priority=()=>typeof style.getPropertyPriority==='function'?style.getPropertyPriority(key):'';
  const previous={value:style.getPropertyValue(key),priority:priority()};
  let destroyed=false,ownedValue=null;
  function sync() {
    if(destroyed||header.hidden||header.isConnected===false)return;
    const height=header.getBoundingClientRect?.().height;
    if(!Number.isFinite(height)||height<=0)return;
    const value=`${height}px`;
    if(style.getPropertyValue(key)===value)return;
    style.setProperty(key,value);
    ownedValue=value;
  }
  const Observer=view?.ResizeObserver;
  const observer=Observer?new Observer(sync):null;
  observer?.observe(header,{box:'border-box'});
  view?.addEventListener?.('resize',sync);
  sync();
  return {sync,destroy() {
    if(destroyed)return;
    destroyed=true;
    observer?.disconnect();
    view?.removeEventListener?.('resize',sync);
    if(ownedValue!==null&&style.getPropertyValue(key)===ownedValue&&priority()===''){
      if(previous.value)style.setProperty(key,previous.value,previous.priority);
      else style.removeProperty(key);
    }
  }};
}
