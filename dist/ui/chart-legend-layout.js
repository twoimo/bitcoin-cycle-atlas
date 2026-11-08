const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/** The axis gutter is outside this rectangle. A legend never owns another pane. */
export function chartLegendSlot({width=0,height=0,left=0,right=width,top=0,viewportWidth=width,protectedAnchors=[]}={}){
  width=Math.max(0,finite(width));height=Math.max(0,finite(height));
  left=clamp(finite(left),0,width);right=clamp(finite(right,width),left,width);
  const plotWidth=right-left,inset=Math.min(12,plotWidth/2),maxWidth=Math.max(0,Math.min(plotWidth*.42,plotWidth-inset*2));
  const compact=finite(viewportWidth,width)<=430||maxWidth<116;
  const legendWidth=compact?Math.min(68,maxWidth):maxWidth,legendHeight=Math.min(compact?44:64,Math.max(0,height-24));
  const x=Math.max(left,right-inset-legendWidth),minimumY=clamp(finite(top)+12,0,Math.max(0,height-legendHeight-12));
  // A model evidence dot is a date/price fact. If it reaches the corner, the
  // legend yields downward; the dot, chart frame and price scale stay fixed.
  const maxY=Math.max(minimumY,height-legendHeight-12),candidates=[minimumY,...protectedAnchors.map(box=>box.y+box.height+4)].filter(y=>Number.isFinite(y)&&y>=minimumY&&y<=maxY).sort((a,b)=>a-b);
  const y=candidates.find(y=>!protectedAnchors.some(anchor=>overlayBoxesIntersect({x,y,width:legendWidth,height:legendHeight},anchor,4)))??minimumY;
  return {x,y,width:legendWidth,height:legendHeight,compact,inset,maxWidth,hudMaxWidth:Math.max(0,x-20)};
}

/** Fit whole entries. Overflow remains available from a real, focusable +N control. */
export function fitLegendEntries(widths,{available=0,gap=8,moreWidth=36}={}){
  const entries=widths.map(width=>Math.max(0,finite(width))),space=Math.max(0,finite(available));
  const full=entries.reduce((sum,width)=>sum+width,0)+Math.max(0,entries.length-1)*gap;
  if(full<=space)return {visibleCount:entries.length,hiddenCount:0};
  let used=0,visibleCount=0;
  for(const width of entries){
    const next=used+(visibleCount?gap:0)+width;
    if(next+gap+moreWidth>space)break;
    used=next;visibleCount++;
  }
  return {visibleCount,hiddenCount:entries.length-visibleCount};
}

export function overlayBoxesIntersect(a,b,gap=0){
  return a.width>=0&&a.height>=0&&b.width>=0&&b.height>=0&&
    a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
}

/** Move only annotation text, never its date/price anchor or any chart axis. */
export function placePlotLabel({x,y,width,height,left,right,top,bottom,obstacles=[],gap=4}={}){
  if(![x,y,width,height,left,right,top,bottom].every(Number.isFinite)||width>right-left||height>bottom-top)return null;
  const bounds={left,right:right-width,top,bottom:bottom-height};
  const preferred={x:clamp(x,bounds.left,bounds.right),y:clamp(y,bounds.top,bounds.bottom),width,height};
  const blockers=obstacles.filter(box=>box&&[box.x,box.y,box.width,box.height].every(Number.isFinite));
  if(!blockers.some(box=>overlayBoxesIntersect(preferred,box,gap)))return preferred;
  const xs=[preferred.x,bounds.left,bounds.right],ys=[preferred.y,bounds.top,bounds.bottom];
  for(const box of blockers){xs.push(clamp(box.x-width-gap,bounds.left,bounds.right),clamp(box.x+box.width+gap,bounds.left,bounds.right));ys.push(clamp(box.y-height-gap,bounds.top,bounds.bottom),clamp(box.y+box.height+gap,bounds.top,bounds.bottom));}
  const candidates=[];
  for(const px of new Set(xs))for(const py of new Set(ys)){
    const candidate={x:px,y:py,width,height};
    if(!blockers.some(box=>overlayBoxesIntersect(candidate,box,gap)))candidates.push(candidate);
  }
  candidates.sort((a,b)=>(Math.abs(a.x-preferred.x)+Math.abs(a.y-preferred.y))-(Math.abs(b.x-preferred.x)+Math.abs(b.y-preferred.y)));
  return candidates[0]||null;
}
