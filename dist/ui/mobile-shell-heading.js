// Layout owns positions only. The source controllers keep every real control,
// its listeners, capability flags and authoritative interval selection.
export function shellFeatureContainer(feature) {
  return feature.querySelector('.shell-feature-actions') || feature;
}

/** Reserve whole 44px targets. A 320px row cannot contain eight such targets;
 * the current interval, then daily/weekly, take precedence over other actions. */
export function planShellHeading({width,symbolWidth=128,intervals=[],selected,actions=[],featureWidth=0,narrow=false,gap=2}) {
  let remaining=Math.max(0,width-symbolWidth-44-gap*2);
  const visibleIntervals=[],visibleActions=[];
  const keep=(id,size,list)=>{if(size+gap>remaining)return false;remaining-=size+gap;list.push(id);return true;};
  const current=intervals.includes(selected)?selected:intervals[0];
  if(current)keep(current,44,visibleIntervals);else remaining-=56+gap;
  for(const id of ['daily','weekly'])if(intervals.includes(id)&&id!==current)keep(id,44,visibleIntervals);
  if(!narrow)for(const id of intervals)if(!visibleIntervals.includes(id))keep(id,44,visibleIntervals);
  for(const item of actions)keep(item.id,item.width,visibleActions);
  const inlineFeatures=featureWidth>0&&featureWidth+gap<=remaining;
  return {visibleIntervals,visibleActions,inlineFeatures};
}

export function mountMobileShellHeading(document) {
  const view=document.defaultView || globalThis,media=view.matchMedia?.('(max-width:620px)');
  let heading=null,feature=null,symbol='',trigger=null,panel=null,actions=null,title=null,closeButton=null;
  let intervalOverflow=null,extraActions=null,selectGroup=null,frequency=null,segmented=null,intervalSelect=null;
  let open=false,destroyed=false,queued=false,intervals=[],topActions=[],lastLayout='';
  const widths=new WeakMap(),orders=new WeakMap();let nextOrder=0;
  const set=(node,key,value)=>{if(node.getAttribute(key)!==String(value))node.setAttribute(key,String(value));};
  const focus=node=>node?.focus?.({preventScroll:true});
  const sourceFocus=()=>[...panel?.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')||[]]
    .find(node=>node!==closeButton&&!node.closest('[hidden]')&&(!node.checkVisibility||node.checkVisibility()));
  const make=(tag,className)=>{const node=document.createElement(tag);node.className=className;return node;};
  const remember=node=>{if(!orders.has(node))orders.set(node,nextOrder++);return node;};
  const place=(parent,nodes)=>{
    const present=[...parent.children].filter(node=>nodes.includes(node));
    if(nodes.every((node,index)=>node.parentElement===parent&&present[index]===node))return;
    for(const node of nodes)parent.append(node);
  };
  const measure=(node,fallback=44)=>{
    if(node.hidden)return 0;
    const measured=Math.ceil(Math.max(node.getBoundingClientRect?.().width||0,node.scrollWidth||0));
    if(measured>0)widths.set(node,Math.max(fallback,measured));
    return widths.get(node)||fallback;
  };
  function setOpen(value,{restore=false,enter=false}={}) {
    if(!trigger)return;
    open=value;panel.hidden=!value;set(trigger,'aria-expanded',String(value));
    if(enter&&value)focus(sourceFocus() || closeButton);
    else if(restore)focus(trigger);
  }
  function restore() {
    if(!trigger)return;
    const active=document.activeElement,ownedFocus=feature.contains(active);
    if(segmented)place(segmented,intervals);
    if(intervalSelect&&frequency)frequency.append(intervalSelect);
    for(const node of topActions){delete node.dataset.shellOverflow;if(node.parentElement!==heading)heading.append(node);}
    feature.append(...actions.childNodes);
    trigger.remove();panel.remove();actions.remove();
    delete heading.dataset.mobileHeading;delete feature.dataset.mobileDisclosure;
    if(frequency)delete frequency.dataset.shellIntervalButtons;
    trigger=panel=actions=title=closeButton=intervalOverflow=extraActions=selectGroup=null;open=false;
    intervals=[];topActions=[];lastLayout='';
    if(ownedFocus)focus(active?.isConnected?active:heading.querySelector('#workbench-workspace'));
  }
  function create() {
    const original=[...feature.childNodes];
    trigger=make('button','shell-feature-toggle');trigger.type='button';trigger.id='atlas-shell-features-toggle';
    trigger.textContent='⋯';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','atlas-shell-features-panel');
    panel=make('div','shell-feature-panel');panel.id='atlas-shell-features-panel';panel.hidden=true;
    const header=make('div','shell-feature-header');title=document.createElement('strong');title.id='atlas-shell-features-title';
    closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='닫기';closeButton.dataset.shellFeatureClose='';
    intervalOverflow=make('div','shell-interval-overflow');intervalOverflow.setAttribute('role','group');
    selectGroup=make('label','shell-interval-select');selectGroup.append(document.createTextNode('전체 간격'));
    actions=make('div','shell-feature-actions');actions.append(...original);
    extraActions=make('div','shell-heading-actions');extraActions.setAttribute('role','group');
    panel.setAttribute('role','group');panel.setAttribute('aria-labelledby',title.id);
    header.append(title,closeButton);panel.append(header,intervalOverflow,selectGroup,extraActions);feature.append(actions,trigger,panel);
    trigger.addEventListener('click',()=>setOpen(!open,{enter:!open}));
    trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true,{enter:true});}});
    closeButton.addEventListener('click',()=>setOpen(false,{restore:true}));
  }
  function apply() {
    if(destroyed)return;
    const chart=document.body.dataset.shell==='chart'&&(!document.body.dataset.centerTool||Boolean(document.body.dataset.chartControls));
    if(!heading||!feature||!chart){restore();return;}
    const active=document.activeElement;
    if(!trigger)create();
    set(heading,'data-mobile-heading','one-row');set(feature,'data-mobile-disclosure','true');
    set(trigger,'aria-label',`${symbol} 간격과 종목 기능 더 보기`);set(closeButton,'aria-label',`${symbol} 간격과 종목 기능 닫기`);
    set(intervalOverflow,'aria-label',`${symbol} 추가 차트 간격`);set(extraActions,'aria-label',`${symbol} 추가 차트 조작`);
    if(title.textContent!==`${symbol} 간격과 종목 기능`)title.textContent=`${symbol} 간격과 종목 기능`;
    frequency=heading.querySelector('#workbench-frequency');segmented=frequency?.querySelector('.lab-segmented');
    intervalSelect=heading.querySelector('#workbench-interval-select');
    for(const node of heading.querySelectorAll('[data-lab-frequency]'))if(node.tagName==='BUTTON'&&!intervals.includes(node))intervals.push(remember(node));
    intervals=intervals.filter(node=>heading.contains(node)).sort((a,b)=>orders.get(a)-orders.get(b));
    const candidates=['#mobile-tools-toggle','#mobile-details-toggle','#workbench-chart-type','#atlas-mode-menu','.workspace-history-controls','#workbench-workspace','#workbench-chart-menu','#lab-svg','#atlas-display-options'];
    topActions=candidates.map(selector=>heading.querySelector(selector)).filter(Boolean).map(remember);
    const narrow=media?.matches??(view.innerWidth<=620);
    const style=view.getComputedStyle?.(heading),gap=Number.parseFloat(style?.columnGap)||2;
    const padding=(Number.parseFloat(style?.paddingLeft)||4)+(Number.parseFloat(style?.paddingRight)||4);
    const width=(heading.clientWidth||heading.getBoundingClientRect?.().width||view.innerWidth||(narrow?390:1280))-padding;
    const symbolNode=heading.querySelector('.symbol-selector-trigger,.workbench-symbol');
    const visible=intervals.filter(node=>!node.hidden);
    const selected=intervalSelect?.value||visible.find(node=>node.getAttribute('aria-pressed')==='true')?.dataset.labFrequency;
    const signature=JSON.stringify([width,narrow,symbol,selected,intervalSelect?.disabled,
      intervals.map(node=>[orders.get(node),node.hidden,node.disabled]),
      topActions.map(node=>[orders.get(node),node.hidden,node.disabled,node.textContent]),
      [...actions.children].map(node=>[remember(node)&&orders.get(node),node.hidden,node.textContent])]);
    // Source observers also see this shell. A no-op refresh must not toggle
    // measurement attributes or reparent controls and start another update.
    if(signature===lastLayout)return;
    lastLayout=signature;
    // Closed disclosures still need natural widths. This synchronous, invisible
    // measurement does not change open state, focus, source flags or listeners.
    set(panel,'data-shell-measuring','true');panel.hidden=false;
    const actionItems=topActions.filter(node=>!node.hidden&&(!node.matches('.mobile-workbench-button')||narrow))
      .map(node=>({id:node.id||'history',width:measure(node,node.matches('.workspace-history-controls')?88:44)}));
    const hasFeatures=[...actions.children].some(node=>!node.hidden);
    const featureWidth=hasFeatures?measure(actions,Math.max(44,[...actions.children].filter(node=>!node.hidden).reduce((sum,node)=>sum+measure(node)+gap,0))):0;
    const plan=planShellHeading({width,symbolWidth:symbolNode?measure(symbolNode,narrow?80:128):0,intervals:visible.map(node=>node.dataset.labFrequency),selected,actions:actionItems,featureWidth,narrow,gap});
    panel.hidden=!open;panel.removeAttribute('data-shell-measuring');
    const primary=new Set(plan.visibleIntervals);
    if(segmented){
      // Unsupported source buttons remain hidden in their original fieldset.
      // Legacy BTC selectors rely on that owner even during monthly hosting.
      place(segmented,intervals.filter(node=>node.hidden||primary.has(node.dataset.labFrequency)));
      place(intervalOverflow,intervals.filter(node=>!node.hidden&&!primary.has(node.dataset.labFrequency)));
    }
    intervalOverflow.hidden=!intervalOverflow.children.length;
    const hasButtons=Boolean(visible.length&&segmented);
    if(frequency)set(frequency,'data-shell-interval-buttons',String(hasButtons));
    if(intervalSelect){const parent=hasButtons?selectGroup:frequency;if(parent&&intervalSelect.parentElement!==parent)parent.append(intervalSelect);}
    selectGroup.hidden=!hasButtons||!intervalSelect;
    for(const node of topActions){
      const folded=!plan.visibleActions.includes(node.id||'history');
      if(folded){set(node,'data-shell-overflow','action');if(node.parentElement!==extraActions)extraActions.append(node);}
      else{delete node.dataset.shellOverflow;if(node.parentElement!==heading)heading.append(node);}
    }
    const destination=plan.inlineFeatures?feature:panel;
    if(actions.parentElement!==destination)destination.insertBefore(actions,plan.inlineFeatures?trigger:extraActions);
    // Only the source's selected visible control belongs in the tab sequence.
    // The open overflow group has its own entry point for keyboard users.
    for(const node of intervals){const tabbable=node.parentElement===intervalOverflow?node===intervalOverflow.querySelector('button:not(:disabled)'):node.dataset.labFrequency===selected;if(!node.disabled&&!node.hidden)node.tabIndex=tabbable?0:-1;}
    if(heading.scrollLeft)heading.scrollLeft=0;
    if(open&&active?.matches?.('[data-lab-frequency]')&&active.parentElement===segmented)setOpen(false);
    if(active?.isConnected&&heading.contains(active)&&document.activeElement!==active)focus(active);
    if(active&&panel.contains(active)&&!open)setOpen(true);
  }
  const schedule=()=>{if(queued||destroyed)return;queued=true;queueMicrotask(()=>{queued=false;apply();});};
  const outside=event=>{
    if(!open||feature.contains(event.target))return;
    // A source dialog or mobile tray must be able to restore its real opener.
    if(event.target.closest?.('dialog,.chart-details-panel,[data-mobile-open=true],.mobile-workbench-backdrop'))return;
    setOpen(false);
  };
  const key=event=>{
    if(event.defaultPrevented||event.target.closest?.('dialog[open]'))return;
    if(event.key==='Escape'&&document.querySelector('.mobile-workbench-button[aria-expanded=true],[data-mobile-open=true]'))return;
    if(open&&event.key==='Escape'&&!event.defaultPrevented&&feature.contains(event.target)){
      event.preventDefault();event.stopPropagation();setOpen(false,{restore:true});return;
    }
    if(!heading?.contains(event.target)||!event.target.matches?.('[data-lab-frequency]')||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const group=event.target.parentElement;
    if(group!==segmented&&group!==intervalOverflow)return;
    const nodes=[...group.querySelectorAll('[data-lab-frequency]')].filter(node=>!node.hidden&&!node.disabled),index=nodes.indexOf(event.target);
    if(index<0)return;
    event.preventDefault();event.stopPropagation();
    const next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(event.key==='ArrowRight'?1:-1)+nodes.length)%nodes.length;
    focus(nodes[next]);nodes[next].click();
  };
  const Observer=view.ResizeObserver||globalThis.ResizeObserver,observer=Observer?new Observer(schedule):null;
  document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside);
  document.addEventListener('keydown',key,true);view.addEventListener?.('resize',schedule);media?.addEventListener?.('change',schedule);
  document.fonts?.ready.then(()=>{lastLayout='';schedule();});
  return {owns:node=>node?.dataset.shellOverflow==='action'&&extraActions?.contains(node),update(next){
    if(heading!==next.heading||feature!==next.feature){observer?.disconnect();restore();heading=next.heading;feature=next.feature;observer?.observe(heading);}
    if(symbol&&symbol!==next.symbol)setOpen(false);
    symbol=next.symbol;apply();
  },destroy(){destroyed=true;observer?.disconnect();restore();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',key,true);view.removeEventListener?.('resize',schedule);media?.removeEventListener?.('change',schedule);}};
}
