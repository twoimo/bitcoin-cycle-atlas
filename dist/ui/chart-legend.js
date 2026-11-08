import {mountDialogViewport} from '../dialog-viewport.js?v=1.29.0';
import {chartLegendSlot,fitLegendEntries} from './chart-legend-layout.js';

const controllers=new WeakMap(),sources=new WeakMap();

/** Compare authored content, not the rows and disclosure controls added below. */
export function writeChartLegendMarkup(source,markup){
  const controller=sources.get(source);
  if(controller)return controller.write(markup);
  source.innerHTML=markup;return true;
}

/** Called by the renderer with its real plot bounds, before placing SVG labels. */
export function refreshChartLegendGeometry(plot,geometry){return controllers.get(plot)?.refresh(geometry)||null;}

export function mountChartLegend({plot}={}){
  const foot=plot?.querySelector('.lab-chart-foot'),source=foot?.querySelector('#atlas-chart-legend');
  if(!foot||!source)return {refresh(){return null;},destroy(){}};
  const doc=plot.ownerDocument,win=doc.defaultView,svg=plot.querySelector('#lab-chart');
  const request=win.requestAnimationFrame?.bind(win)||globalThis.requestAnimationFrame;
  const cancel=win.cancelAnimationFrame?.bind(win)||globalThis.cancelAnimationFrame;
  let geometry=null,rows=[],frame=null,queued=false,destroyed=false,opener=null,lastLayoutKey='',lastMarkup=null,lastFitWidth=null;
  foot.classList.add('chart-legend-dock');foot.setAttribute('aria-label','차트 범례');foot.removeAttribute('tabindex');
  plot.dataset.legendDock='top-right';
  const chip=doc.createElement('button');chip.type='button';chip.className='chart-legend-open';chip.textContent='범례';
  chip.setAttribute('aria-label','차트 범례 전체 보기');chip.setAttribute('aria-haspopup','dialog');chip.hidden=true;foot.append(chip);
  const dialog=doc.createElement('dialog');dialog.id='chart-legend-dialog';dialog.className='chart-legend-dialog';
  dialog.setAttribute('aria-labelledby','chart-legend-dialog-title');
  const heading=doc.createElement('header'),title=doc.createElement('h2'),close=doc.createElement('button');
  title.id='chart-legend-dialog-title';title.textContent='차트 범례';close.type='button';close.textContent='닫기';close.setAttribute('aria-label','차트 범례 닫기');
  heading.append(title,close);const content=doc.createElement('div');content.className='chart-legend-dialog-content';dialog.append(heading,content);doc.body.append(dialog);
  const dialogViewport=mountDialogViewport(dialog);
  chip.setAttribute('aria-controls',dialog.id);chip.setAttribute('aria-expanded','false');
  const expanded=value=>[chip,...rows.map(row=>row.more)].forEach(button=>button.setAttribute('aria-expanded',String(value)));
  function renderDialog(){
    const scrollTop=content.scrollTop;content.replaceChildren();
    for(const row of rows){
      const section=doc.createElement('section'),label=doc.createElement('h3'),list=doc.createElement('ul');label.textContent=row.label;
      for(const entry of row.entries){
        const item=doc.createElement('li'),sample=entry.node.cloneNode(true);sample.hidden=false;sample.removeAttribute('hidden');sample.classList.add('chart-legend-dialog-sample');
        for(const node of sample.querySelectorAll('[id]'))node.removeAttribute('id');
        item.append(sample);
        const meaning=entry.meaning;if(meaning&&meaning!==entry.label){const note=doc.createElement('p');note.textContent=meaning;item.append(note);}
        list.append(item);
      }
      section.append(label,list);content.append(section);
    }
    content.scrollTop=scrollTop;
  }
  function open(trigger){
    if(dialog.open)return;opener=trigger;renderDialog();
    doc.dispatchEvent(new win.CustomEvent('atlas:modal-open',{detail:{id:dialog.id}}));
    dialog.showModal();expanded(true);close.focus({preventScroll:true});
  }
  chip.onclick=()=>open(chip);close.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{expanded(false);const visible=node=>Boolean(node?.isConnected&&!node.hidden&&node.getClientRects().length);const target=visible(opener)?opener:visible(chip)?chip:rows.find(row=>visible(row.more))?.more;target?.focus({preventScroll:true});});
  const Mutation=win.MutationObserver||globalThis.MutationObserver;
  const sourceObserver=Mutation?new Mutation(()=>{lastMarkup=null;prepareSource(true);schedule();}):null;
  const observeSource=()=>sourceObserver?.observe(source,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title']});
  function prepareSource(force=false){
    if(!force&&source.querySelector(':scope > .chart-legend-row'))return;
    sourceObserver?.disconnect();
    lastFitWidth=null;
    const groups=[{id:'price',label:'가격 계열',nodes:[...source.querySelectorAll('.price-legend-item')]},{id:'cycle',label:'사이클 색상',nodes:[...source.querySelectorAll('.cycle-legend-item,.cycle-style-sample,.cycle-reference-key')]}];
    if(!groups[0].nodes.length&&!groups[1].nodes.length)groups[0].nodes=[...source.children];
    rows=[];
    for(const group of groups.filter(group=>group.nodes.length)){
      const row=doc.createElement('div'),label=doc.createElement('span'),items=doc.createElement('div'),more=doc.createElement('button');
      row.className='chart-legend-row';row.dataset.legendGroup=group.id;row.setAttribute('role','group');row.setAttribute('aria-label',group.label);
      label.className='chart-legend-row-label';label.textContent=group.id==='price'?'가격':'사이클';items.className='chart-legend-items';
      const entries=group.nodes.map(node=>{node.classList.add('chart-legend-entry');node.hidden=false;items.append(node);return {node,label:node.textContent.trim(),meaning:node.getAttribute('title')||node.textContent.trim()};});
      more.type='button';more.className='chart-legend-more';more.setAttribute('aria-controls',dialog.id);more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-expanded',String(dialog.open));more.onclick=()=>open(more);more.textContent=`+${entries.length}`;
      row.append(label,items,more);rows.push({...group,row,labelNode:label,items,more,entries});
    }
    source.replaceChildren(...rows.map(row=>row.row));observeSource();
    if(dialog.open)renderDialog();
  }
  function write(markup){
    // A restore can replace or edit the source before its observer runs.
    if(sourceObserver?.takeRecords?.().length)lastMarkup=null;
    if(markup===lastMarkup&&source.children.length===rows.length&&rows.every((row,index)=>source.children[index]===row.row))return false;
    sourceObserver?.disconnect();source.innerHTML=markup;lastMarkup=markup;
    prepareSource();schedule();return true;
  }
  function setStyle(node,name,value){const formatted=`${Math.max(0,Math.round(value*100)/100)}px`;if(node.style.getPropertyValue(name)!==formatted)node.style.setProperty(name,formatted);}
  function fitRows(){
    // Do not discard an external edit when geometry refresh precedes its observer.
    if(sourceObserver?.takeRecords?.().length){lastMarkup=null;prepareSource(true);}
    const width=source.clientWidth;
    if(!(width>0)){lastFitWidth=null;return;}
    if(width===lastFitWidth)return;
    sourceObserver?.disconnect();
    for(const row of rows){
      for(const entry of row.entries)entry.node.hidden=false;
      row.more.hidden=false;row.more.textContent=`+${row.entries.length}`;
      const widths=row.entries.map(entry=>entry.node.getBoundingClientRect().width);
      const available=Math.max(0,width-row.labelNode.getBoundingClientRect().width-8);
      const result=fitLegendEntries(widths,{available,gap:8,moreWidth:Math.max(32,row.more.getBoundingClientRect().width)});
      row.entries.forEach((entry,index)=>{entry.node.hidden=index>=result.visibleCount;});
      row.more.textContent=`+${result.hiddenCount}`;row.more.hidden=result.hiddenCount===0;
      row.more.setAttribute('aria-label',`${row.label} ${result.hiddenCount}개 더 보기 · 전체 ${row.entries.length}개`);
      row.row.dataset.visibleCount=String(result.visibleCount);row.row.dataset.hiddenCount=String(result.hiddenCount);
    }
    lastFitWidth=width;
    observeSource();
  }
  function refresh(nextGeometry){
    if(destroyed)return null;if(nextGeometry)geometry=nextGeometry;
    const box=plot.getBoundingClientRect();if(!box.width||!box.height){lastFitWidth=null;return null;}
    const width=plot.clientWidth||box.width,height=plot.clientHeight||box.height;
    const input=geometry&&geometry.width===width&&geometry.height===height?geometry:{width,height,left:Number(svg?.dataset.plotLeft)||0,right:Number(svg?.dataset.plotRight)||width-80,top:Number(svg?.dataset.plotTop)||18,bottom:Number(svg?.dataset.priceBottom)||height};
    const slot=chartLegendSlot({...input,width,height,viewportWidth:win.innerWidth||width});
    setStyle(foot,'--chart-legend-top',slot.y);setStyle(foot,'--chart-legend-right',width-slot.x-slot.width);setStyle(foot,'--chart-legend-width',slot.width);setStyle(foot,'--chart-legend-height',slot.height);
    setStyle(plot,'--chart-legend-hud-max-width',slot.hudMaxWidth);
    plot.dataset.legendVisible=String(!foot.hidden&&plot.dataset.chartFocus!=='true');
    foot.dataset.legendMode=slot.compact?'chip':'rows';foot.dataset.legendCompactReason=slot.compactReason||'';dialog.dataset.fullscreen=String(slot.compact);
    chip.hidden=!slot.compact;source.hidden=slot.compact;
    if(!slot.compact&&!foot.hidden&&plot.dataset.chartFocus!=='true')fitRows();else lastFitWidth=null;
    const layoutKey=JSON.stringify([slot.x,slot.y,slot.width,slot.height,slot.compact,foot.hidden]);
    if(layoutKey!==lastLayoutKey){lastLayoutKey=layoutKey;doc.dispatchEvent(new win.CustomEvent('atlas:legend-layout-change',{detail:{...slot}}));}
    return slot;
  }
  function schedule(){
    if(destroyed||queued)return;queued=true;
    const run=()=>{queued=false;frame=null;refresh();};if(request)frame=request(run);else queueMicrotask(run);
  }
  function invalidateFit(){lastFitWidth=null;schedule();}
  const Resize=win.ResizeObserver||globalThis.ResizeObserver,resize=Resize?new Resize(invalidateFit):null;
  resize?.observe(plot);resize?.observe(source);
  const stateObserver=Mutation?new Mutation(invalidateFit):null;
  stateObserver?.observe(foot,{attributes:true,attributeFilter:['hidden']});
  stateObserver?.observe(plot,{attributes:true,attributeFilter:['data-chart-focus','data-chart-replay-mode','data-mode']});
  doc.addEventListener('atlas:hud-layout-change',schedule);doc.addEventListener('atlas:chart-focus',schedule);win.addEventListener('resize',invalidateFit);
  doc.fonts?.ready.then(invalidateFit);doc.fonts?.addEventListener('loadingdone',invalidateFit);
  prepareSource();observeSource();const controller={refresh,write,destroy(){if(destroyed)return;destroyed=true;if(frame!==null)cancel?.(frame);sourceObserver?.disconnect();stateObserver?.disconnect();resize?.disconnect();dialogViewport.destroy();doc.removeEventListener('atlas:hud-layout-change',schedule);doc.removeEventListener('atlas:chart-focus',schedule);win.removeEventListener('resize',invalidateFit);doc.fonts?.removeEventListener('loadingdone',invalidateFit);dialog.remove();chip.remove();controllers.delete(plot);sources.delete(source);}};
  controllers.set(plot,controller);sources.set(source,controller);refresh();return controller;
}
