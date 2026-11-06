// Pixel geometry shared by the actual RSI chart and its neutral loading shape.
// These are renderer coordinates, independent of the control spacing scale.
export const RSI_CHART_LAYOUT=Object.freeze({
  left:12,top:18,bottom:28,right:84,narrowRight:72,narrowWidth:600,
  priceShare:.69,minimumPriceHeight:100,panelGap:24,
});

export function rsiChartLayout(width,height,showRsi=true){
  const layout=RSI_CHART_LAYOUT;
  const left=layout.left,right=width-(width<layout.narrowWidth?layout.narrowRight:layout.right);
  const top=layout.top,bottom=height-layout.bottom;
  const priceBottom=showRsi?Math.max(top+layout.minimumPriceHeight,Math.round(height*layout.priceShare)):bottom;
  return {left,right,top,bottom,priceBottom,rsiTop:priceBottom+layout.panelGap};
}
