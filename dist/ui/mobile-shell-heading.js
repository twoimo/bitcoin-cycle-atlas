// The narrow shell keeps the real feature controls in their original document
// and event-delegation tree. Only their disclosure and layout change.
export function shellFeatureContainer(feature) {
  return feature.querySelector(':scope > .shell-feature-panel > .shell-feature-actions') || feature;
}

export function mountMobileShellHeading(document) {
  const view=document.defaultView || globalThis;
  const media=view.matchMedia?.('(max-width:390px)');
  let heading=null,feature=null,symbol='',trigger=null,panel=null,actions=null,title=null,closeButton=null,open=false;
  const set=(node,key,value)=>{if(node.getAttribute(key)!==String(value))node.setAttribute(key,String(value));};
  const focus=node=>node?.focus?.({preventScroll:true});
  const sourceFocus=()=>[...actions?.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')||[]]
    .find(node=>!node.closest('[hidden]')&&(!node.checkVisibility||node.checkVisibility()));
  function setOpen(value,{restore=false,enter=false}={}) {
    if(!trigger)return;
    open=value;panel.hidden=!value;trigger.setAttribute('aria-expanded',String(value));
    if(enter&&value)focus(sourceFocus() || closeButton);
    else if(restore)focus(trigger);
  }
  function restore() {
    if(!trigger)return;
    const active=document.activeElement,ownedFocus=feature.contains(active),source=actions.contains(active)?active:null;
    feature.append(...actions.childNodes);
    trigger.remove();panel.remove();
    delete heading.dataset.mobileHeading;delete feature.dataset.mobileDisclosure;
    trigger=panel=actions=title=closeButton=null;open=false;
    if(ownedFocus)focus(source || feature.querySelector('button:not(:disabled),select:not(:disabled)') || heading.querySelector('#workbench-workspace'));
  }
  function apply() {
    if(!heading||!feature||!media?.matches||document.body.dataset.shell!=='chart'){restore();return;}
    // Center workspaces replace the plot, not its surrounding shell. Retain
    // the two-row perimeter and exact protected chart controls while their
    // independently owned toolbar occupies the second row.
    const chart=!document.body.dataset.centerTool||Boolean(document.body.dataset.chartControls);
    if(!chart)setOpen(false);
    if(!trigger){
      const active=document.activeElement,retainFocus=feature.contains(active);
      const original=[...feature.childNodes];
      trigger=document.createElement('button');trigger.type='button';trigger.className='shell-feature-toggle';trigger.id='atlas-shell-features-toggle';
      trigger.textContent='⋯ 종목 기능';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','atlas-shell-features-panel');
      panel=document.createElement('div');panel.className='shell-feature-panel';panel.id='atlas-shell-features-panel';panel.hidden=true;
      const header=document.createElement('div');header.className='shell-feature-header';
      title=document.createElement('strong');title.id='atlas-shell-features-title';
      closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='닫기';closeButton.dataset.shellFeatureClose='';
      actions=document.createElement('div');actions.className='shell-feature-actions';actions.append(...original);
      panel.setAttribute('role','group');panel.setAttribute('aria-labelledby',title.id);
      header.append(title,closeButton);panel.append(header,actions);feature.append(trigger,panel);
      trigger.addEventListener('click',()=>setOpen(!open,{enter:!open}));
      trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true,{enter:true});}});
      closeButton.addEventListener('click',()=>setOpen(false,{restore:true}));
      if(retainFocus){setOpen(true);focus(active);}
    }
    set(heading,'data-mobile-heading','two-row');set(feature,'data-mobile-disclosure','true');
    if(title.textContent!==`${symbol} 종목 기능`)title.textContent=`${symbol} 종목 기능`;
    set(trigger,'aria-label',`${symbol} 종목 기능 더 보기`);
    set(closeButton,'aria-label',`${symbol} 종목 기능 닫기`);
  }
  const outside=event=>{
    if(!open||feature.contains(event.target))return;
    // A source-owned modal/reader may return focus to its original trigger in
    // this disclosure. Keep that trigger visible until the detail closes.
    if(event.target.closest?.('dialog,.chart-details-panel'))return;
    setOpen(false);
  };
  const key=event=>{if(open&&event.key==='Escape'&&!event.defaultPrevented&&feature.contains(event.target)){
    event.preventDefault();event.stopPropagation();setOpen(false,{restore:true});
  }};
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('focusin',outside);
  document.addEventListener('keydown',key);
  media?.addEventListener?.('change',apply);
  return {update(next){
    if(heading!==next.heading||feature!==next.feature){restore();heading=next.heading;feature=next.feature;}
    if(symbol&&symbol!==next.symbol)setOpen(false);
    symbol=next.symbol;apply();
  },destroy(){restore();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',key);media?.removeEventListener?.('change',apply);}};
}
