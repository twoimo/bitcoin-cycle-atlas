import {chartLegendSlot,overlayBoxesIntersect} from './chart-legend-layout.js';

export const RSI_CRITERIA_AREA_LIMIT=.22;
export const RSI_CRITERIA_CARD_HEIGHT=190;
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;

/** These are the renderer's price-pane bounds, excluding the RSI pane and
 * the measured price axis. A small pane uses one native 44px disclosure.
 * @param {{width?:number,height?:number,left?:number,right?:number,top?:number,bottom?:number,viewportWidth?:number,legend?:{x:number,y:number,width:number,height:number},protectedAnchors?:Array<{x:number,y:number,width:number,height:number}>}} input
 */
export function rsiCriteriaSlot({width=0,height=0,left=0,right=width,top=0,bottom=height,viewportWidth=width,legend,protectedAnchors=[]}={}){
  const plotWidth=Math.max(0,finite(right)-finite(left)),plotHeight=Math.max(0,finite(bottom)-finite(top));
  const area=plotWidth*plotHeight,budget=area*RSI_CRITERIA_AREA_LIMIT;
  const corner=legend||chartLegendSlot({width,height,left,right,top,bottom,viewportWidth,protectedAnchors});
  const inset=Math.min(12,plotWidth/2),gap=8;
  const fits=box=>box.x>=left&&box.x+box.width<=right&&box.y>=top&&box.y+box.height<=bottom
    &&box.width*box.height<=budget+.001&&!overlayBoxesIntersect(box,corner,gap);
  const expandWidth=Math.min(304,Math.floor(plotWidth*.46),Math.floor(budget/RSI_CRITERIA_CARD_HEIGHT),plotWidth-inset*2);
  const expanded={x:right-inset-expandWidth,y:Math.max(56,top+inset,corner.y+corner.height+gap),width:expandWidth,height:RSI_CRITERIA_CARD_HEIGHT};
  const reason=viewportWidth<=640?'viewport':budget/RSI_CRITERIA_CARD_HEIGHT<244?'area':expandWidth<244?'width':!fits(expanded)?'height':'';
  const finish=(box,collapsed,placement)=>({...box,collapsed,placement,reason:collapsed?reason:'',areaRatio:area?box.width*box.height/area:0,visible:true});
  if(!reason)return finish(expanded,false,'below');

  const chipWidth=Math.floor(Math.min(140,plotWidth-inset*2,budget/44));
  if(chipWidth>=44&&plotHeight>=44){
    const below={x:right-inset-chipWidth,y:Math.max(56,corner.y+corner.height+gap),width:chipWidth,height:44};
    if(fits(below))return finish(below,true,'below');
    // A short screen has enough horizontal room for the two controls even
    // when a second overlay row would cover the oscillator or its labels.
    const sideWidth=Math.floor(Math.min(chipWidth,corner.x-gap-left-inset));
    if(sideWidth>=44){
      const beside={x:corner.x-gap-sideWidth,y:Math.max(56,top,Math.min(corner.y,bottom-44)),width:sideWidth,height:44};
      if(fits(beside))return finish(beside,true,'beside');
    }
  }
  // A 44px square cannot meet the area budget in a smaller pane. The same
  // complete criteria remain available from the existing Backtest dialog.
  return {x:left,y:top,width:0,height:0,collapsed:true,placement:'unavailable',reason:'space',areaRatio:0,visible:false};
}
