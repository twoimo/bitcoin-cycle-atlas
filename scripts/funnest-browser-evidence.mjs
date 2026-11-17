import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

/** Serialized into the runner-owned page. Uses public, detached snapshots only. */
export function readNativeFunnestEvidence(selector) {
  const plot=document.querySelector(selector),host=plot?.querySelector('.atlas-funnest-canvas');
  if(!host?.getAtlasFunnestSnapshot)return null;
  const snapshot=host.getAtlasFunnestSnapshot(),overlay=plot.inspectAtlasOverlayRender?.()??null;
  const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const hostBounds=box(host),layout=snapshot.layout,panes=layout?.panes||[];
  const paneBox=pane=>pane?{left:hostBounds.left,top:hostBounds.top+pane.top,right:hostBounds.left+layout.plotWidth,bottom:hostBounds.top+pane.top+pane.height,width:layout.plotWidth,height:pane.height}:null;
  const main=panes.find(p=>p.kind==='main'||p.id==='main'),volume=panes.find(p=>p.kind==='volume'||p.id==='volume');
  const css=getComputedStyle(host),canvas=host.querySelector('canvas');
  const ink={readable:false,mainPixels:0,volumePixels:0,targets:null};
  let colorProbe;
  try {
    const scratch=document.createElement('canvas');scratch.width=1;scratch.height=1;const context=scratch.getContext('2d');
    colorProbe=document.createElement('span');colorProbe.style.cssText='position:absolute;visibility:hidden;pointer-events:none';host.append(colorProbe);
    const rgb=color=>{colorProbe.style.color='';colorProbe.style.color=color;const resolved=getComputedStyle(colorProbe).color;context.clearRect(0,0,1,1);context.fillStyle=resolved;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3);};
    const token=(name,fallback)=>css.getPropertyValue(name).trim()||fallback;
    const background=rgb(snapshot.settings?.background||token('--bg','#17171c'));
    const up=rgb(snapshot.settings?.upColor||'#f04452'),down=rgb(snapshot.settings?.downColor||'#3182f6');
    const accent=rgb(token('--accent-ink','#74a7ee'));
    // Pinned core renderer.ts: line uses palette.accent; volume alpha is 0.35.
    const blend=color=>color.map((channel,i)=>Math.round(channel*.35+background[i]*.65));
    const mainTargets=snapshot.chartType==='candles'?[up,down]:[accent],volumeTargets=[blend(up),blend(down)];
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    const sx=canvas.width/hostBounds.width,sy=canvas.height/hostBounds.height;
    const count=(pane,targets)=>{
      if(!pane||!Number.isFinite(sx)||!Number.isFinite(sy))return 0;
      const left=Math.max(0,Math.ceil(4*sx)),right=Math.min(canvas.width,Math.floor((layout.plotWidth-4)*sx));
      const top=Math.max(0,Math.ceil((pane.top+3)*sy)),bottom=Math.min(canvas.height,Math.floor((pane.top+pane.height-3)*sy));
      let matched=0;
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
        const offset=(y*canvas.width+x)*4;
        if(pixels[offset+3]>200&&targets.some(color=>color.every((channel,i)=>Math.abs(pixels[offset+i]-channel)<=12)))matched++;
      }
      return matched;
    };
    ink.mainPixels=count(main,mainTargets);ink.volumePixels=count(volume,volumeTargets);ink.readable=true;
    ink.targets={background,main:mainTargets,volume:volumeTargets};
  } catch(error) { ink.error=String(error?.message||error); }
  finally { colorProbe?.remove(); }
  return {snapshot,overlay,hostBounds,mainBounds:paneBox(main),volumeBounds:paneBox(volume),ink};
}

/** Runs before the page's own scripts. Records, per canvas, the text and rounded-rectangle draws of the latest frame in
 * draw order (a full-canvas fillRect starts a frame) and always calls through, so the paint is byte for byte the product's. */
export function installCanvasDrawTap() {
  const proto = CanvasRenderingContext2D.prototype, frames = new WeakMap();
  const frameOf = canvas => {let frame = frames.get(canvas); if (!frame) frames.set(canvas,frame = {texts:[],rects:[],sequence:0,order:0}); return frame;};
  const fillRect = proto.fillRect, fillText = proto.fillText, roundRect = proto.roundRect, measureText = proto.measureText;
  proto.fillRect = function(x,y,w,h) {
    if (x === 0 && y === 0) {
      const transform = this.getTransform(), canvas = this.canvas;
      if (Math.round(w * transform.a) >= canvas.width && Math.round(h * transform.d) >= canvas.height) {const frame = frameOf(canvas); frame.texts = []; frame.rects = []; frame.order = 0; frame.sequence++;}
    }
    return fillRect.call(this,x,y,w,h);
  };
  proto.fillText = function(text,x,y,maxWidth) {
    // Measured on the drawing context itself: a fresh context can resolve another face and give boxes narrower than the ink.
    const frame = frameOf(this.canvas), metrics = measureText.call(this,String(text));
    frame.texts.push({order:++frame.order,text:String(text),x,y,font:this.font,align:this.textAlign,baseline:this.textBaseline,fill:String(this.fillStyle),alpha:this.globalAlpha,
      width:maxWidth === undefined ? metrics.width : Math.min(metrics.width,maxWidth),ascent:metrics.fontBoundingBoxAscent,descent:metrics.fontBoundingBoxDescent});
    return fillText.call(this,text,x,y,maxWidth);
  };
  proto.roundRect = function(x,y,w,h,radii) {
    const frame = frameOf(this.canvas);
    frame.rects.push({order:++frame.order,x,y,w,h,fill:String(this.fillStyle),alpha:this.globalAlpha});
    return roundRect.call(this,x,y,w,h,radii);
  };
  window.__atlasCanvasDraws = canvas => {const frame = frames.get(canvas); return frame ? {sequence:frame.sequence,texts:frame.texts.map(item => ({...item})),rects:frame.rects.map(item => ({...item}))} : null;};
}

/** Serialized into the runner-owned page. True once the chart behind `selector` is a painted Funnest canvas that holds observed bars. */
export function isNativeFunnestPainted(selector) {
  const host=document.querySelector(selector)?.closest('.atlas-plot')?.querySelector('.atlas-funnest-canvas'),snapshot=host?.getAtlasFunnestSnapshot?.();
  return Boolean(snapshot?.painted&&snapshot.engineBars?.length>0);
}

export function assertNativeObservedEvidence(evidence,series,{symbol,chartType='line'}={}) {
  assert.ok(evidence?.snapshot,'Missing read-only native Funnest snapshot');
  const state=evidence.snapshot;
  assert.equal(state.engine,'funnest');assert.equal(state.version,'0.6.22');assert.equal(state.painted,true,'Native canvas must have painted');
  assert.equal(state.sourceMode,'ohlc');assert.equal(state.timeUnit,'UTC milliseconds');assert.equal(state.currency,'USD');
  if(symbol)assert.equal(state.symbol,symbol);
  assert.equal(state.chartType,chartType);assert.equal(state.legacy.priceNodes,0,'A legacy price renderer remains behind the canvas');
  const expected=series.candles.map(row=>({time:row.time*1000,open:row.open,high:row.high,low:row.low,close:row.close,...(row.volume===undefined?{}:{volume:row.volume})}));
  assert.ok(expected.length>0);assert.deepEqual(state.observations,expected,'Observed OHLCV differs from the parsed archive');
  assert.deepEqual(state.engineBars,expected,'Actual Funnest bars differ from the parsed archive');
  assert.ok(Number.isFinite(state.range?.from)&&state.range.to>state.range.from,'Native visible range is invalid');
  assert.ok(evidence.mainBounds?.width>0&&evidence.mainBounds.height>0,'Missing actual main pane');
  assert.equal(evidence.ink.readable,true,'Native canvas pixels are unreadable');
  assert.ok(evidence.ink.mainPixels>0,'No observed-price-colored pixels in the actual main pane');
  const digest=createHash('sha256').update(JSON.stringify(expected)).digest('hex');
  return {...evidence,snapshot:{...state,observations:undefined,engineBars:undefined,internalLineGeometry:undefined,
    observedCount:expected.length,engineBarCount:state.engineBars.length,firstObservation:expected[0],lastObservation:expected.at(-1),observationsSha256:digest}};
}

export function assertNativeOverlayEvidence(overlay,{forecast,baseline=false}={}) {
  assert.ok(overlay?.rendered,'Native overlay renderer has not run');
  assert.equal(overlay.engine,'funnest');assert.equal(overlay.coordinatesSource,'painter.line arguments');
  const result={sequence:overlay.sequence};
  for(const [name,expected,dash] of [['forecast',forecast,[7,5]],['baseline',baseline,[2,4]]]){
    const input=overlay[name+'Input'],segments=overlay[name+'Segments'];
    assert.equal(input.present,expected,`${name} input presence changed`);
    assert.equal(segments.count,segments.coordinates.length);
    if(expected){assert.ok(input.pathRows>1&&segments.count>0,`${name} has no actual painted segments`);}else assert.equal(segments.count,0,`Unexpected ${name} painted segments`);
    let length=0;
    for(const segment of segments.coordinates){
      assert.ok([segment.from.x,segment.from.y,segment.to.x,segment.to.y].every(Number.isFinite),`Invalid ${name} painter coordinates`);
      assert.deepEqual(segment.dash,dash,`${name} dash meaning changed`);
      assert.ok(Number.isFinite(segment.width)&&segment.width>0&&typeof segment.color==='string'&&segment.color.length>0);
      length+=Math.hypot(segment.to.x-segment.from.x,segment.to.y-segment.from.y);
    }
    if(expected)assert.ok(length>0,`${name} painter path is degenerate`);
    result[name]={input,segments:segments.count,length,dash,first:segments.coordinates[0]??null,last:segments.coordinates.at(-1)??null,
      coordinatesSha256:createHash('sha256').update(JSON.stringify(segments.coordinates)).digest('hex')};
  }
  return result;
}
