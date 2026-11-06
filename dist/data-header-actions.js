// Keep each action's data and event owner in the active asset board. The shell
// exposes a single right-aligned toolbar and mirrors availability, never data.
const ACTIONS=['asset-refresh','asset-history-open','daily-method-open','export-raw'];
export function mountDataHeaderActions({frame,heading,isActive}) {
  let observer,sourceDocument,bar,lastDialogTrigger,disposed=false;
  function restoreDialogFocus(event) {
    if(event.target?.tagName?.toLowerCase()!=='dialog')return;
    const owner=sourceDocument,trigger=lastDialogTrigger;
    queueMicrotask(()=>{
      if(disposed||!isActive()||frame.hidden||sourceDocument!==owner||!trigger?.isConnected||owner.querySelector('dialog[open]'))return;
      trigger.focus();lastDialogTrigger=null;
    });
  }
  const detach=()=>{
    observer?.disconnect();observer=null;
    sourceDocument?.removeEventListener('close',restoreDialogFocus,true);
    if(sourceDocument?.body)delete sourceDocument.body.dataset.dataActionsHosted;
    bar?.remove();bar=null;sourceDocument=null;lastDialogTrigger=null;
  };
  function sync() {
    if(disposed||!isActive()||!sourceDocument)return;
    const sources=ACTIONS.map(id=>sourceDocument.getElementById(id));
    if(sources.some(node=>!node))return;
    if(!bar) {
      const doc=heading.ownerDocument;
      bar=doc.createElement('div');bar.className='center-data-actions';bar.setAttribute('role','group');bar.setAttribute('aria-label','자산 비교 도구');
      const title=doc.createElement('span');title.className='center-data-title';title.textContent='자산 비교';bar.append(title);
      for(const id of ACTIONS) {
        const button=doc.createElement('button');button.type='button';button.className='center-data-action';button.id='center-'+id;
        button.addEventListener('click',()=>{
          if(disposed||!isActive()||frame.hidden)return;
          let current;try{current=frame.contentDocument;}catch{return;}
          if(current!==sourceDocument)return;
          const action=current.getElementById(id);
          if(action&&!action.disabled) {
            if(id==='asset-history-open'||id==='daily-method-open')lastDialogTrigger=button;
            action.click();
          }
        });bar.append(button);
      }
      heading.append(bar);
    }
    for(const [index,source] of sources.entries()) {
      const button=bar.querySelector('#center-'+ACTIONS[index]);
      if(button.innerHTML!==source.innerHTML)button.innerHTML=source.innerHTML;
      button.disabled=source.disabled;
      button.title=source.title;button.setAttribute('aria-label',source.getAttribute('aria-label')||source.textContent);
    }
    sourceDocument.body.dataset.dataActionsHosted='true';
  }
  function attach() {
    if(disposed||!isActive()||!heading)return;
    detach();
    try{sourceDocument=frame.contentDocument;}catch{return;}
    if(!sourceDocument?.body)return;
    sourceDocument.addEventListener('close',restoreDialogFocus,true);
    const Observer=sourceDocument.defaultView?.MutationObserver||heading.ownerDocument.defaultView?.MutationObserver||globalThis.MutationObserver;
    observer=new Observer(sync);observer.observe(sourceDocument.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','aria-label','title']});
    sync();
  }
  frame.addEventListener('load',attach);attach();
  return {destroy(){disposed=true;frame.removeEventListener('load',attach);detach();}};
}
