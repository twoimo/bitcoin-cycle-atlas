import assert from 'node:assert/strict';

// A focused UI review uses the existing native browser runner. It does not
// replace, shorten, or qualify the canonical 53-case publication inventory.
export const uiContractBrowserCases = [
  [320,740,true],[390,844,true],[768,1024,true],[1024,768,false],[1440,900,false],[1920,1080,false],
].map(([width,height,touch])=>({page:'ui-contract-btc',uiContract:true,surface:'btc',symbol:'BTCUSD',width,height,touch,route:'/'}));

export function readUiContractGeometry(){
  const painted=e=>Boolean(e&&!e.hidden&&!e.closest('[hidden]')&&e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');
  const rect=e=>{if(!e)return null;const b=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:b.x,y:b.y,left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,display:s.display,fontSize:s.fontSize,flexWrap:s.flexWrap};};
  const plot=document.querySelector('.atlas-plot'),svg=document.querySelector('#lab-chart'),legend=document.querySelector('.chart-legend-dock')||document.querySelector('#atlas-chart-legend');
  const bar=document.querySelector('.chart-replay-bar'),actions=document.querySelector('.chart-replay-actions'),view=rect(actions);
  const controls=actions?[...actions.querySelectorAll('button,select,input')].filter(painted).map(e=>({control:e.dataset.cr,label:e.getAttribute('aria-label')||e.textContent,disabled:e.disabled,...rect(e)})):[];
  const clipped=controls.filter(b=>b.left<view.left-.5||b.right>view.right+.5||b.top<view.top-.5||b.bottom>view.bottom+.5).map(b=>({...b,excessRight:Math.max(0,b.right-view.right)}));
  const l=painted(legend)?rect(legend):null;
  const overlap=(a,b)=>a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const labels=[...document.querySelectorAll('.market-last-price,.cycle-macro-clock-label,[data-forecast-evidence] text,[data-history-event] text,.chart-replay-hud')].filter(painted);
  return {viewport:{width:innerWidth,height:innerHeight},url:location.pathname+location.search,rootWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
    plot:rect(plot),pricePane:{left:Number(svg?.dataset.plotLeft),right:Number(svg?.dataset.plotRight),top:Number(svg?.dataset.plotTop),bottom:Number(svg?.dataset.priceBottom)},
    legend:l&&{...l,mode:legend.dataset.legendMode||'legacy',groups:[...legend.querySelectorAll('[data-legend-group]')].map(e=>({id:e.dataset.legendGroup,visibleCount:e.dataset.visibleCount,hiddenCount:e.dataset.hiddenCount,...rect(e)})),more:[...legend.querySelectorAll('.chart-legend-more')].filter(painted).map(e=>({text:e.textContent,...rect(e)})),collisions:labels.filter(e=>overlap(l,rect(e))).map(e=>({tag:e.tagName,className:e.getAttribute('class'),text:e.textContent,...rect(e)}))},
    replay:painted(bar)?{bar:rect(bar),actions:view,clipped,controls,hint:[...document.querySelectorAll('.chart-replay-scroll-hint')].map(e=>({visible:painted(e),text:e.textContent,...rect(e)})),state:document.querySelector('.chart-replay-controls')?.dataset.state,selecting:svg?.dataset.replaySelecting==='true',cursor:svg?.dataset.replayCursor,strip:[...document.querySelectorAll('.cycle-phase-strip,.chart-cycle-strip,[data-cycle-strip]')].filter(painted).map(rect)}:null,
    undoDisabled:document.querySelector('#workbench-undo')?.disabled,
    firstEntryStorage:Object.keys(localStorage).filter(k=>/replay|history/.test(k)).map(k=>({key:k,bytes:localStorage.getItem(k)?.length||0})),
  };
}

export async function verifyUiContractSurface(api){
  const {cdp,receipt,evaluate,until,settled,click,screenshot,verifyOfflineRefresh}=api;
  const phase=process.env.ATLAS_UI_REVIEW_PHASE==='before'?'before':'after',prefix=`wp4-${phase}-${receipt.width}x${receipt.height}`;
  const result=receipt.uiContract={phase,input:'native pointer / keyboard / touch',states:[],scope:'UI geometry; no model-validity or production-deployment claim'};
  const read=()=>evaluate(cdp,readUiContractGeometry);
  const state=async label=>{await settled(cdp);const value=await read();result.states.push({label,...value});return value;};
  async function key(value,code,number,modifiers=0,wait=true){
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:value,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,modifiers,...(type==='keyDown'&&value==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
    if(wait)await settled(cdp);
  }
  const control=name=>'.chart-replay-controls [data-cr="'+name+'"]';
  function within(box,label){assert.ok(box&&box.width>0&&box.height>0,label+' not painted');assert.ok(box.left>=-.5&&box.right<=receipt.width+.5&&box.top>=-.5&&box.bottom<=receipt.height+.5,label+' outside viewport '+JSON.stringify(box));}
  function checkLegend(value){
    const {legend:l,pricePane:p,plot}=value;within(l,'legend');
    assert.ok(l.width<=(p.right-p.left)*.42+1,'Legend exceeds 42% of measured price pane');
    assert.ok(Math.abs(l.right-(plot.left+p.right-12))<1.5,'Legend must retain 12px right inset');
    assert.ok(l.top>=plot.top+p.top+12-1.5,'Legend must retain at least the 12px top inset');
    assert.ok(l.scrollWidth<=l.clientWidth+1,'Legend content overflows');
    assert.equal(l.mode,receipt.width<=390?'chip':'rows');
    if(l.mode==='rows')assert.deepEqual(l.groups.map(g=>g.id),['price','cycle']);
    assert.equal(l.collisions.length,0,'Legend overlaps reserved labels: '+JSON.stringify(l.collisions));
    assert.ok(Math.max(value.rootWidth,value.bodyWidth)<=receipt.width+1,'Page has horizontal overflow');
  }
  await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('#lab-chart path')&&Number(document.querySelector('#lab-chart')?.dataset.plotRight)>0)),'BTC chart with real observations');
  await verifyOfflineRefresh();
  const initial=await state('initial');await screenshot(cdp,prefix+'-chart.png',receipt);
  if(phase==='after'){
    checkLegend(initial);assert.equal(initial.url,'/','First render must retain the clean URL');assert.equal(initial.undoDisabled,true,'First render must not create an undo record');
    const trigger=receipt.width<=390?'.chart-legend-open':'.chart-legend-more:not([hidden])';
    if(await evaluate(cdp,s=>Boolean(document.querySelector(s)),trigger)){
      await click(cdp,trigger);await until(()=>evaluate(cdp,()=>document.querySelector('#chart-legend-dialog')?.open),'legend dialog');
      const modal=await evaluate(cdp,()=>{const d=document.querySelector('#chart-legend-dialog'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,items:d.querySelectorAll('li').length,close:d.querySelector('button')?.textContent};});
      within(modal,'legend dialog');assert.ok(modal.items>=10,'Full legend loses source items');
      if(receipt.width<=390){assert.equal(Math.round(modal.width),receipt.width);assert.equal(Math.round(modal.height),receipt.height);}
      result.legendDialog=modal;await screenshot(cdp,prefix+'-legend.png',receipt);
      await key('Escape','Escape',27);assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-legend-dialog').open),false);
      result.legendFocusReturned=await evaluate(cdp,()=>document.activeElement.matches('.chart-legend-open,.chart-legend-more'));
      assert.equal(result.legendFocusReturned,true);
    }
  }
  await click(cdp,'#workbench-replay');
  await until(()=>evaluate(cdp,()=>document.querySelector('.chart-replay-controls')?.dataset.state==='selecting'),'replay start selection');
  const entry=await state('replay-entry');await screenshot(cdp,prefix+'-replay-entry.png',receipt);
  await click(cdp,control('select-menu'));await click(cdp,control('select-date'));
  for(const [value,left]of [['06',2],['01',1],['2026',0]]){
    await click(cdp,control('date'));for(let i=0;i<5;i++)await key('ArrowRight','ArrowRight',39,0,false);
    for(let i=0;i<left;i++)await key('ArrowLeft','ArrowLeft',37,0,false);await key('Backspace','Backspace',8,0,false);
    for(const digit of value)for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:digit,code:'Digit'+digit,windowsVirtualKeyCode:48+Number(digit),nativeVirtualKeyCode:48+Number(digit),...(type==='keyDown'?{text:digit,unmodifiedText:digit}:{})});
    await settled(cdp);
  }
  assert.equal(await evaluate(cdp,s=>document.querySelector(s).value,control('date')),'2026-06-01');
  await click(cdp,control('start'));
  await until(()=>evaluate(cdp,()=>['paused','ended'].includes(document.querySelector('.chart-replay-controls')?.dataset.state)),'fixed replay cutoff');
  const ready=await state('replay-paused');await screenshot(cdp,prefix+'-replay.png',receipt);
  await click(cdp,control('pick'));await until(()=>evaluate(cdp,()=>document.querySelector('#lab-chart')?.dataset.replaySelecting==='true'),'replay picking');
  const picking=await state('replay-picking');await key('Escape','Escape',27);const canceled=await state('replay-pick-canceled');
  result.selectionY={entry:entry.replay.bar.y,paused:ready.replay.bar.y,picking:picking.replay.bar.y,canceled:canceled.replay.bar.y};
  if(phase==='after'){
    for(const value of [entry,ready,picking,canceled]){
      checkLegend(value);within(value.replay.bar,'replay bar');assert.equal(value.replay.clipped.length,0,'Replay controls clipped: '+JSON.stringify(value.replay.clipped));
    }
    assert.ok(Math.max(...Object.values(result.selectionY))-Math.min(...Object.values(result.selectionY))<1,'Selecting moves replay controls');
    if(receipt.width===1440)assert.ok(Math.abs(ready.replay.bar.width-560)<1.5,'Desktop transport must expand to 560px');
  }
  result.status=phase==='before'?'baseline-recorded':'passed';
}
