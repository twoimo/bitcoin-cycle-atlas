// Pixel geometry shared by the actual RSI chart and its neutral loading shape.
// These are renderer coordinates, independent of the control spacing scale.
export const RSI_CHART_LAYOUT=Object.freeze({
  left:12,top:18,bottom:28,right:64,narrowRight:64,narrowWidth:600,
  priceShare:.69,minimumPriceHeight:100,panelGap:24,
});

export function rsiChartLayout(width,height,showRsi=true,axisGutter){
  const layout=RSI_CHART_LAYOUT;
  const left=Math.min(layout.left,width*.05),gutter=Number.isFinite(axisGutter)?axisGutter:width<layout.narrowWidth?layout.narrowRight:layout.right;
  const right=Math.max(left+1,width-Math.min(gutter,width-left-1));
  const top=Math.min(layout.top,height*.15),bottom=Math.max(top+2,height-Math.min(layout.bottom,height*.2)),available=bottom-top;
  const gap=Math.min(layout.panelGap,available*.16);
  const priceBottom=showRsi?Math.min(bottom-gap-available*.18,Math.max(top+Math.min(layout.minimumPriceHeight,available*.5),Math.round(height*layout.priceShare))):bottom;
  return {left,right,top,bottom,priceBottom,rsiTop:priceBottom+gap};
}
