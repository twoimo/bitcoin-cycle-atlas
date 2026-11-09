/** Read-only native geometry. Hidden SVG previews retain rectangles, so raw
 * geometry and painted collisions are deliberately separate measurements. */
export function readChartQa(selector='#lab-chart') {
  const svg=document.querySelector(selector),heading=document.querySelector('.atlas-canvas-heading');
  const box=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const intersection=(a,b)=>a&&b?{width:Math.min(a.right,b.right)-Math.max(a.left,b.left),height:Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)}:null;
  const overlaps=(a,b)=>{const r=intersection(a,b);return r&&r.width>.5&&r.height>.5;};
  const painted=(node,allowOffscreen=false)=>{
    if(!node||!node.getClientRects().length)return false;
    if(node.checkVisibility&&!node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true}))return false;
    const own=getComputedStyle(node),r=box(node);
    if(own.visibility!=='visible'||r.width<=0||r.height<=0)return false;
    for(let p=node;p&&p.nodeType===1;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||Number(s.opacity)===0||p.hidden)return false;}
    return (allowOffscreen||overlaps(r,{left:0,top:0,right:innerWidth,bottom:innerHeight}))&&(!node.ownerSVGElement||overlaps(r,box(node.ownerSVGElement)));
  };
  const entry=node=>({text:node.textContent.trim(),class:node.getAttribute('class'),parentClass:node.parentElement?.getAttribute('class'),rect:box(node),visibility:getComputedStyle(node).visibility,painted:painted(node)});
  const pairs=items=>{const result=[];for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(overlaps(items[i].rect,items[j].rect))result.push({a:items[i].text,b:items[j].text,overlap:intersection(items[i].rect,items[j].rect)});return result;};
  const texts=[...svg?.querySelectorAll('text')||[]].map(entry).filter(e=>e.rect.width>0&&e.rect.height>0);
  const annotations=[...svg?.querySelectorAll('.history-event-marker text,.cycle-interval-label,.cycle-interval-preview-label,.cycle-marker-label')||[]].map(entry);
  const quote=svg?.querySelector('.cross-price-tag text'),quoteEntry=quote?entry(quote):null;
  // Axis ticks are source labels, not title/event text containing a price.
  const ticks=[...svg?.querySelectorAll('[data-price-axis-label="tick"]')||[]].map(entry);
  const quotePairs=paintOnly=>quoteEntry&&(!paintOnly||quoteEntry.painted)?ticks.filter(t=>(!paintOnly||t.painted)&&overlaps(t.rect,quoteEntry.rect)).map(t=>({quote:quoteEntry.text,tick:t.text,visibility:t.visibility,rect:t.rect})):[];
  const h=box(heading),controls=[...heading?.querySelectorAll('button,select,input')||[]].filter(node=>painted(node,true)).map(node=>{
    const r=box(node),clip=h?{left:Math.max(0,h.left),right:Math.min(innerWidth,h.right),top:Math.max(0,h.top),bottom:Math.min(innerHeight,h.bottom)}:null;
    const inPanel=Boolean(node.closest('#atlas-shell-features-panel'));
    return {id:node.id,label:node.getAttribute('aria-label'),text:node.textContent.trim(),rect:r,inPanel,clipped:inPanel?(r.left<-.5||r.right>innerWidth+.5||r.top<-.5||r.bottom>innerHeight+.5):Boolean(clip&&(r.left<clip.left-.5||r.right>clip.right+.5||r.top<clip.top-.5||r.bottom>clip.bottom+.5)),small:innerWidth<=390&&(r.width<43.5||r.height<43.5)};
  });
  const visibleAnnotations=annotations.filter(e=>e.painted),visibleTexts=texts.filter(e=>e.painted),rawPairs=pairs(texts),visiblePairs=pairs(visibleTexts),annotationPairs=pairs(visibleAnnotations);
  return {url:location.href,width:innerWidth,height:innerHeight,boot:document.documentElement?.dataset.boot,rootWidth:document.documentElement?.scrollWidth,bodyWidth:document.body?.scrollWidth,
    chart:svg?{id:svg.id,rect:box(svg),paths:svg.querySelectorAll('path[d]').length,painted:painted(svg),dataset:{...svg.dataset}}:null,
    text:{rawCount:texts.length,rawPairs:rawPairs.length,rawPairDetails:rawPairs,paintedCount:visibleTexts.length,paintedPairs:visiblePairs.length,paintedPairDetails:visiblePairs},
    annotations:{rawCount:annotations.length,paintedCount:visibleAnnotations.length,pairs:annotationPairs.length,pairDetails:annotationPairs,labels:annotations},
    axis:{quote:quoteEntry,ticks,rawPairs:quotePairs(false).length,paintedPairs:quotePairs(true).length,rawPairDetails:quotePairs(false),paintedPairDetails:quotePairs(true)},
    heading:heading?{rect:h,scrollWidth:heading.scrollWidth,clientWidth:heading.clientWidth,mode:heading.dataset.mobileHeading||'legacy',toolbarLabels:[heading,...heading.querySelectorAll('[role="toolbar"]')].map(n=>n.getAttribute('aria-label')).filter(Boolean),controls,clippedControls:controls.filter(c=>c.clipped),smallControls:controls.filter(c=>c.small),featurePanelOpen:document.querySelector('#atlas-shell-features-toggle')?.getAttribute('aria-expanded')==='true'}:null};
}

/** Coordinates for native pointer input. No synthetic dispatch or DOM state
 * writes: preserve original date/price anchors and exercise live previews. */
export function readAnnotationHoverTargets(){
  const svg=document.querySelector('#lab-chart');if(!svg)return [];
  return [...svg.querySelectorAll('.history-event-marker circle,.cycle-interval-label,.cycle-marker-label')].flatMap(node=>{
    const r=node.getBoundingClientRect(),s=getComputedStyle(node),x=r.left+r.width/2,y=r.top+r.height/2;
    if(s.visibility!=='visible'||s.display==='none'||!r.width||!r.height||x<0||x>innerWidth||y<0||y>innerHeight)return [];
    return [{x,y,label:node.closest('[aria-label]')?.getAttribute('aria-label')||node.textContent,kind:node.closest('.history-event-marker')?'event':node.classList.contains('cycle-interval-label')?'period':'milestone'}];
  });
}
