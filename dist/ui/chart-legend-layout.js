const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

/** The axis gutter is outside this rectangle. A legend never owns another pane. */
export function chartLegendSlot({width=0,height=0,left=0,right=width,top=0,bottom=height,viewportWidth=width,protectedAnchors=[]}={}){
  width=Math.max(0,finite(width));height=Math.max(0,finite(height));
  left=clamp(finite(left),0,width);right=clamp(finite(right,width),left,width);
  bottom=clamp(finite(bottom,height),0,height);top=clamp(finite(top),0,bottom);
  const plotWidth=right-left,inset=Math.min(12,plotWidth/2),maxWidth=Math.max(0,Math.min(plotWidth*.42,plotWidth-inset*2));
  const availableHeight=Math.max(0,bottom-top-24);
  let compactReason=finite(viewportWidth,width)<=430?'viewport':maxWidth<200?'width':availableHeight<44?'height':null;
  // A model evidence dot is a date/price fact. If it reaches the corner, the
  // legend yields within the price pane. A short pane can use the same full-
  // list chip as mobile instead of spilling into cycle, volume or footer lanes.
  function placement(compact){
    // The compact chip owns a real 44px touch target. A short price pane may
    // not afford the 12px top inset, but it must never clip the chip: use the
    // pane's full height when that is all the room available.
    const legendWidth=compact?Math.min(68,maxWidth):maxWidth,legendHeight=Math.min(compact?44:40,Math.max(0,bottom-top));
    const x=Math.max(left,right-inset-legendWidth),minimumY=Math.min(top+12,Math.max(top,bottom-legendHeight));
    const maxY=Math.max(minimumY,bottom-legendHeight-12),candidates=[minimumY,...protectedAnchors.map(box=>box.y+box.height+4)].filter(y=>Number.isFinite(y)&&y>=minimumY&&y<=maxY).sort((a,b)=>a-b);
    const clearY=candidates.find(y=>!protectedAnchors.some(anchor=>overlayBoxesIntersect({x,y,width:legendWidth,height:legendHeight},anchor,4)));
    return {x,y:clearY??minimumY,width:legendWidth,height:legendHeight,clear:clearY!==undefined};
  }
  let placed=placement(Boolean(compactReason));
  if(!compactReason&&!placed.clear){compactReason='protected-anchors';placed=placement(true);}
  return {...placed,compact:Boolean(compactReason),compactReason,inset,maxWidth,hudMaxWidth:Math.max(0,placed.x-20)};
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
