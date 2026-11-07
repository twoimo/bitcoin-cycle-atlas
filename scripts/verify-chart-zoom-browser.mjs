import assert from 'node:assert/strict';

// These functions run in the actual document (or its active iframe). They only
// read rendered geometry/state. All gestures below enter through native CDP.
function readChart({svgSelector,allocationSelector}) {
  const svg=document.querySelector(svgSelector),owner=document.querySelector(allocationSelector);
  if(!svg||!owner)return null;
  const rect=node=>{const b=node.getBoundingClientRect();return {left:b.left,top:b.top,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
  const box=rect(svg),view=svg.viewBox.baseVal,data=svg.dataset;
  const number=name=>data[name]===undefined||data[name]===''?null:Number(data[name]);
  const time=value=>value===undefined||value===''?null:/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):Date.parse(value);
  const x=value=>box.left+(value-view.x)/view.width*box.width,y=value=>box.top+(value-view.y)/view.height*box.height;
  const left=number('plotLeft'),right=number('plotRight'),top=number('plotTop'),bottom=number('priceBottom'),timeTop=number('timeAxisTop');
  const hit=point=>{if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;const node=document.elementFromPoint(point.x,point.y);return Boolean(node&&(node===svg||svg.contains(node))&&!node.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"]'));};
  const pick=points=>points.find(hit)||null;
  const points={
    plot:pick([.3,.45,.6].flatMap(fx=>[.45,.6,.3].map(fy=>({x:x(left+(right-left)*fx),y:y(top+(bottom-top)*fy)})))),
    price:pick([.4,.6,.3].map(fy=>({x:x(right+(view.width-right)*.55),y:y(top+(bottom-top)*fy)}))),
    time:pick([.38,.28,.48].map(fx=>({x:x(left+(right-left)*fx),y:y(timeTop+(view.height-timeTop)*.5)}))),
  };
  return {start:data.start,end:data.end,first:time(data.start),last:time(data.end),priceMin:number('priceMin'),priceMax:number('priceMax'),priceMode:data.priceMode,
    scale:data.scale,visible:svg.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),box,view:{width:view.width,height:view.height},
    allocation:{box:rect(owner),width:owner.clientWidth,height:owner.clientHeight},
    plot:{left:x(left),right:x(right),top:y(top),bottom:y(bottom),timeTop:y(timeTop)},points,
    viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth};
}

function readPerimeter() {
  const selectors={top:'.atlas-canvas-heading',left:'.atlas-sidebar',right:'.workbench-rail',bottom:'.workbench-bottom-bar'};
  return Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{
    const nodes=document.querySelectorAll(selector),node=nodes[0],b=node?.getBoundingClientRect();
    return [name,{count:nodes.length,visible:Boolean(node?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})),
      left:b?.left,top:b?.top,width:b?.width,height:b?.height}];
  }));
}

/** Shared browser contract for BTC, the native controllers and embedded price
 * charts. `context` reads the active frame; `cdp` always sends native input to
 * the real top-level target. `parentPoint` maps an iframe point without mutating
 * the page. This helper cannot pass without an actual browser/controller. */
export async function verifyChartZoomBrowser({cdp,context=cdp,receipt,evaluate,until,settled,parentPoint=async point=>point,
  svgSelector,allocationSelector,label}) {
  const record={label,svgSelector,input:'native CDP wheel, pointer drag and double-click',status:'running',inputs:[],states:[]};
  (receipt.chartZoom??=[]).push(record);
  const read=()=>evaluate(context,readChart,{svgSelector,allocationSelector});
  const span=state=>state.last-state.first,priceSpan=state=>state.priceMax-state.priceMin;
  const near=(a,b)=>Math.abs(a-b)<=1;
  const valid=state=>state?.visible&&state.box.width>0&&state.box.height>0&&
    [state.first,state.last,state.priceMin,state.priceMax].every(Number.isFinite)&&span(state)>0&&priceSpan(state)>0&&['auto','manual'].includes(state.priceMode);
  let baseline,perimeter;
  function assertGeometry(state,chrome,stage) {
    assert.ok(valid(state),label+': rendered chart metadata is invalid during '+stage+': '+JSON.stringify(state));
    assert.ok(near(state.box.height,state.allocation.height),label+': SVG must fill its allocated height during '+stage);
    assert.ok(near(state.box.width,state.allocation.width),label+': SVG must fill its allocated width during '+stage);
    assert.ok(near(state.view.height,state.box.height)&&near(state.view.width,state.box.width),label+': SVG coordinates must remain pixel-sized during '+stage);
    assert.ok(state.documentWidth<=state.viewport.width+1,label+': chart introduced horizontal page overflow during '+stage);
    for(const [name,box]of Object.entries(chrome)){
      assert.equal(box.count,1,label+': exactly one '+name+' perimeter owner');
      if(perimeter){assert.equal(box.visible,perimeter[name].visible,label+': '+name+' visibility changed during '+stage);
        for(const dimension of ['left','top','width','height'])assert.ok(near(box[dimension],perimeter[name][dimension]),label+': '+name+' '+dimension+' changed during '+stage);}
    }
    if(baseline)for(const dimension of ['left','top','width','height'])assert.ok(near(state.box[dimension],baseline.box[dimension]),label+': chart '+dimension+' changed during '+stage);
  }
  async function capture(stage) {
    const state=await read(),chrome=await evaluate(cdp,readPerimeter);
    assertGeometry(state,chrome,stage);record.states.push({stage,...state,perimeter:chrome});return state;
  }
  async function pointFor(state,kind) {
    const local=state.points[kind];assert.ok(local,label+': '+kind+' axis/plot has no unobscured native target');
    const point=await parentPoint(local);
    assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y),label+': invalid mapped native target');
    return point;
  }
  async function wheel(state,kind) {
    const point=await pointFor(state,kind);
    record.inputs.push({kind:'mouseWheel',surface:kind,...point,deltaY:-160});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-160});
  }
  function sameTime(a,b,stage) {
    assert.equal(a.start,b.start,label+': '+stage+' changed the time start');
    assert.equal(a.end,b.end,label+': '+stage+' changed the time end');
  }
  try{
    await until(async()=>valid(await read()),label+' rendered zoom metadata',10000);
    await settled(context);
    baseline=await read();perimeter=await evaluate(cdp,readPerimeter);
    assertGeometry(baseline,perimeter,'initial');record.states.push({stage:'initial',...baseline,perimeter});

    await wheel(baseline,'plot');
    await until(async()=>{const next=await read();return valid(next)&&span(next)<span(baseline);},label+' native plot-wheel zoom',5000);
    await settled(context);const zoomed=await capture('plot-wheel');
    assert.ok(span(zoomed)<span(baseline),label+': wheel-up must reduce the visible time span');
    assert.equal(zoomed.end,baseline.end,label+': ordinary plot-wheel zoom must retain the right endpoint');

    await wheel(zoomed,'price');
    await until(async()=>{const next=await read();return valid(next)&&next.priceMode==='manual'&&priceSpan(next)<priceSpan(zoomed);},label+' native price-axis wheel',5000);
    await settled(context);const priceZoomed=await capture('price-wheel');
    sameTime(priceZoomed,zoomed,'price-axis wheel');
    assert.equal(priceZoomed.priceMode,'manual');
    assert.ok(priceSpan(priceZoomed)<priceSpan(zoomed),label+': price-axis wheel-up must tighten only the price domain');

    const pricePoint=await pointFor(priceZoomed,'price');
    record.inputs.push({kind:'doubleClick',surface:'price',...pricePoint});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...pricePoint});
    for(const clickCount of [1,2])for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,button:'left',clickCount,...pricePoint});
    await until(async()=>{const next=await read();return valid(next)&&next.priceMode==='auto';},label+' price-axis double-click Auto',5000);
    await settled(context);const automatic=await capture('price-auto');
    sameTime(automatic,priceZoomed,'price-axis double-click');assert.equal(automatic.priceMode,'auto');

    const start=await pointFor(automatic,'time'),distance=Math.min(160,(automatic.plot.right-automatic.plot.left)*.2);
    assert.ok(distance>=12,label+': time axis must have enough physical width for a drag');
    const finish=await parentPoint({x:automatic.points.time.x+distance,y:automatic.points.time.y});
    record.inputs.push({kind:'drag',surface:'time',from:start,to:finish});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...start});
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...start});
    for(let step=1;step<=4;step++)await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:start.x+(finish.x-start.x)*step/4,y:start.y+(finish.y-start.y)*step/4});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...finish});
    await until(async()=>{const next=await read();return valid(next)&&span(next)>span(automatic);},label+' native rightward time-axis drag',5000);
    await settled(context);const expanded=await capture('time-axis-drag');
    assert.ok(span(expanded)>span(automatic),label+': dragging the time axis right must expand the visible time span');
    assert.equal(expanded.end,automatic.end,label+': time-axis drag must retain the right endpoint');
    record.status='passed';return record;
  }catch(error){record.status='failed';record.error=error instanceof Error?error.message:String(error);throw error;}
}
