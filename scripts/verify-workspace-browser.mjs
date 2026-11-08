import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function readComparisonAssetSymbols(source=new URL('../dist/data/asset-comparison.json',import.meta.url)){
  const snapshot=JSON.parse(await readFile(source,'utf8')),symbols=snapshot.assets?.map(asset=>asset.symbol);
  assert.ok(Array.isArray(symbols)&&symbols.length>0&&symbols.every(symbol=>typeof symbol==='string'&&symbol.length>0),'Comparison snapshot must declare its actual asset identities');
  assert.equal(new Set(symbols).size,symbols.length,'Comparison snapshot contains duplicate asset identities');
  assert.equal(symbols[0],'BTC','Comparison snapshot must keep BTC first');
  return symbols;
}

export const workspaceBrowserCases = [320, 1440].flatMap(width =>
  ['btc', 'evidence', 'legacy', 'preview'].map(surface => ({
    page: 'workspace-' + surface, surface, width, height: 900, touch: width === 320,
    route: surface === 'btc' ? '/?symbol=BTCUSD&granularity=daily&type=line' :
      surface === 'evidence' ? '/?page=evidence' : surface === 'legacy' ? '/?page=compare&legacy=1' : '/mobile-preview.html'
  })));
workspaceBrowserCases.push({page:'workspace-btc-short',surface:'btc',width:900,height:430,touch:true,route:'/?symbol=BTCUSD&granularity=daily&type=line'});

workspaceBrowserCases.push({page:'workspace-legacy',surface:'legacy',width:375,height:900,touch:true,route:'/?page=compare&legacy=1'});
workspaceBrowserCases.push(...[{width:320,height:900,touch:true},{width:1440,height:900,touch:false},{width:900,height:430,touch:true}].map(size=>({
  page:'workspace-center-data',surface:'center-data',...size,route:'/?symbol=BTCUSD&granularity=daily&type=line'
})));

// Let native layout resolve the containing-block and top-layer clip chain.
// DOM ancestry alone incorrectly clips both modal dialogs and fixed rails.
export async function readNativeInteractiveTarget(selector,focused=false){
  const container=document.querySelector(selector),el=focused?document.activeElement:container;
  if(!el)throw new Error('Missing interactive target '+selector);
  const entry=await new Promise((accept,reject)=>{
    const observer=new IntersectionObserver(entries=>{
      const current=entries.find(item=>item.target===el);if(!current)return;
      clearTimeout(timer);observer.disconnect();accept(current);
    });
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Native intersection unavailable for '+selector));},5000);
    observer.observe(el);
  });
  const rect=box=>({left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height});
  const box=rect(entry.boundingClientRect),clip=rect(entry.intersectionRect),x=box.left+box.width/2,y=box.top+box.height/2;
  const hit=document.elementFromPoint(x,y),style=getComputedStyle(el);
  return {selector,box,clip,x,y,viewport:{width:innerWidth,height:innerHeight},inside:Boolean(container?.contains(el)),
    painted:el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),disabled:Boolean(el.disabled),
    topmost:Boolean(hit&&(hit===el||el.contains(hit))),tag:el.tagName,label:el.getAttribute('aria-label')||el.textContent.slice(0,80),
    outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth),outlineColor:style.outlineColor};
}

/** Actual parent chart -> embedded asset board -> chart, with native mapped inputs. */
export async function verifyEmbeddedDataSurface(api){
  const {cdp,receipt,evaluate,until,settled,bounds,visibleBounds,screenshot,verifyOfflineRefresh,expectedBtc}=api;
  const {width,height,page}=receipt,frameSelector='.atlas-center-frame:not([hidden])';
  const expectedSymbols=await readComparisonAssetSymbols();
  const evidence={inputs:[],states:[],expectedSymbols};receipt.workspace={surface:'center-data',states:evidence.states,centerData:evidence};
  const complete=target=>target.painted&&!target.disabled&&target.topmost&&target.box.width>0&&target.box.height>0&&target.clip.width>0&&target.clip.height>0&&
    target.box.left>=target.clip.left-1&&target.box.right<=target.clip.right+1&&target.box.top>=target.clip.top-1&&target.box.bottom<=target.clip.bottom+1;
  const readParent=()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const stage=document.querySelector('#lab-chart-stage');
    return {page:document.body.dataset.page,shell:document.body.dataset.shell,center:document.body.dataset.centerTool||null,
      documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
      stage:{...rect(stage),scrollLeft:stage.scrollLeft,scrollTop:stage.scrollTop,clientWidth:stage.clientWidth,scrollWidth:stage.scrollWidth},
      perimeter:Object.fromEntries(['.atlas-canvas-heading','.workbench-bottom-bar','.atlas-sidebar','.workbench-rail'].map(selector=>{
        const el=document.querySelector(selector);return [selector,{connected:Boolean(el?.isConnected),...rect(el)}];
      }))};
  };
  const readSource=()=>({timeOrigin:performance.timeOrigin,price:document.querySelector('#lab-metrics .readout-main > strong')?.textContent,
    date:document.querySelector('#lab-metrics .atlas-observation-date')?.textContent,kind:document.querySelector('#lab-metrics')?.dataset.kind,
    cutoff:document.querySelector('#sidebar-asof')?.textContent,product:document.querySelector('#lab-chart')?.dataset.product});
  const rawPointer=async(selector,context=cdp,frame=null)=>{
    const target=await evaluate(context,readNativeInteractiveTarget,selector);
    assert.ok(complete(target),'Native target is clipped, hidden, disabled or occluded: '+JSON.stringify(target));
    let point={x:target.x,y:target.y};
    if(frame){
      const owner=await evaluate(cdp,readNativeInteractiveTarget,frameSelector);
      assert.ok(complete(owner),'Embedded frame is clipped or occluded: '+JSON.stringify(owner));
      assert.ok(Math.abs(owner.box.width-target.viewport.width)<=1&&Math.abs(owner.box.height-target.viewport.height)<=1,'Embedded control mapping requires actual 1:1 iframe pixels');
      point={x:owner.box.left+target.x,y:owner.box.top+target.y};
      assert.equal(await evaluate(cdp,({x,y})=>document.elementFromPoint(x,y)===document.querySelector('.atlas-center-frame:not([hidden])'),point),true,'Mapped pointer must hit the active iframe');
    }
    evidence.inputs.push({kind:'raw-native-pointer',selector,frameId:frame?.id||null,target,point,parentBefore:await evaluate(cdp,readParent)});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await settled(context);
  };
  const revealHeadingControl=async(selector)=>{
      for(let attempt=0;attempt<18;attempt++){
        const target=await evaluate(cdp,readNativeInteractiveTarget,selector);
        if(complete(target))return target;
        assert.ok(target.painted&&!target.disabled,'Header action is hidden or disabled: '+selector);
        const owner=await evaluate(cdp,selector=>{
          const node=document.querySelector(selector),host=node?.closest('.center-workspace-toolbar');
          return host&&host.scrollWidth>host.clientWidth+1?'#'+host.id:'.atlas-canvas-heading';
        },selector);
        const heading=await bounds(cdp,owner);visibleBounds(heading,width,height);
        const before=await evaluate(cdp,owner=>document.querySelector(owner).scrollLeft,owner);
        const direction=target.box.left<heading.left?1:-1,distance=Math.min(144,heading.width/2),x=direction<0?heading.right-24:heading.left+24,y=(heading.top+heading.bottom)/2;
        if(receipt.touch){
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
          for(let step=1;step<=12;step++){
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+direction*distance*step/12,y,id:1}]});
            await new Promise(resolve=>setTimeout(resolve,16));
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        }else{
          await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:-direction*distance,deltaY:0});
        }
        await until(()=>evaluate(cdp,(owner,value)=>Math.abs(document.querySelector(owner).scrollLeft-value)>1,owner,before),'native heading pan',5000);
        let previous=null,stable=0;
        await until(async()=>{const left=await evaluate(cdp,owner=>document.querySelector(owner).scrollLeft,owner);stable=previous!==null&&Math.abs(left-previous)<.1?stable+1:0;previous=left;return stable>=3;},'native heading pan end',5000);
        evidence.inputs.push({kind:receipt.touch?'native-heading-swipe':'native-heading-wheel',selector,owner,before,after:previous,x,y,distance,direction,parentAfter:await evaluate(cdp,readParent)});
      }
      const target=await evaluate(cdp,readNativeInteractiveTarget,selector);
      assert.ok(complete(target),'Native heading pan never exposed '+selector+': '+JSON.stringify(target));return target;
  };
  const headerPointer=async selector=>{await revealHeadingControl(selector);await rawPointer(selector);};
  const chooseNavigation=async(id)=>{
    if(width<=620){
      const target=await revealHeadingControl('#mobile-details-toggle');
      assert.ok(target.box.width>=44&&target.box.height>=44,'Mobile navigation must retain its full touch target');
      await rawPointer('#mobile-details-toggle');
    }
    const selector='.atlas-nav [data-atlas-page="'+id+'"]';
    // Scroll only the actual navigation tray with native wheel input when needed.
    for(let attempt=0;attempt<12;attempt++){
      const target=await evaluate(cdp,readNativeInteractiveTarget,selector);
      if(complete(target)){await rawPointer(selector);return;}
      const rail=await bounds(cdp,'.workbench-rail');visibleBounds(rail,width,height);
      const point={x:(rail.left+rail.right)/2,y:Math.max(rail.top+24,Math.min(rail.bottom-24,(rail.top+rail.bottom)/2))};
      const deltaY=target.y<(rail.top+rail.bottom)/2?-180:180;
      evidence.inputs.push({kind:'native-navigation-scroll',selector,point,deltaY});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY});await settled(cdp);
    }
    throw new Error('Native navigation never exposed '+id);
  };
  await until(()=>evaluate(cdp,()=>document.documentElement?.dataset.boot==='ready'&&document.querySelectorAll('#lab-chart path').length>0),'center-data initial chart');
  const initialPage=await evaluate(cdp,readParent);
  assert.equal(initialPage.page,'outlook');assert.equal(initialPage.center,null);
  evidence.navigation=await evaluate(cdp,()=>[...document.querySelectorAll('.atlas-nav [data-atlas-page]')].map(item=>({id:item.dataset.atlasPage,label:item.getAttribute('aria-label'),href:item.getAttribute('href')})));
  assert.deepEqual(evidence.navigation.map(item=>item.id),['outlook','market-us','evidence','data','ipo','relay'],'The sidebar must retain the five existing destinations followed by relay, with one price-chart destination');
  assert.equal(evidence.navigation.find(item=>item.id==='market-us').label,'시장 분석');
  assert.equal(evidence.navigation.find(item=>item.id==='outlook').label,'가격 차트');
  for(const [id,path] of [['market-us','/market-lab/']]){
    const entry=evidence.navigation.find(item=>item.id===id);
    if(entry.href)assert.ok(new URL(entry.href,'http://atlas.test').pathname.endsWith(path),'Workspace link must use its canonical route: '+id);
  }
  const initialRefreshVerified=await verifyOfflineRefresh({phase:'center-data-initial-parent'});
  await settled(cdp);
  evidence.sourceBefore=await evaluate(cdp,readSource);evidence.before=await evaluate(cdp,readParent);
  assert.equal(evidence.sourceBefore.price,expectedBtc.formattedPrice);assert.equal(evidence.sourceBefore.kind,'observed');
  assert.equal(evidence.sourceBefore.date,expectedBtc.asOf.replaceAll('-','.')+' UTC');
  assert.equal(evidence.sourceBefore.cutoff,'관측 · '+expectedBtc.asOf.replaceAll('-','.')+' UTC');
  const samePerimeter=(current,label)=>{
    assert.equal(current.stage.scrollLeft,0,label+' must not scroll the outer chart stage');
    assert.equal(current.stage.scrollTop,0,label+' must not vertically scroll the outer chart stage');
    assert.ok(Math.max(current.documentWidth,current.bodyWidth)<=width+1,label+' must not overflow the parent document');
    for(const [selector,original] of Object.entries(evidence.before.perimeter)){
      const actual=current.perimeter[selector];assert.ok(original.connected&&actual.connected,'Missing perimeter '+selector);
      for(const key of ['left','right','top','bottom','width','height'])assert.ok(Math.abs(actual[key]-original[key])<=1,label+' moved '+selector+' '+key+': '+JSON.stringify({original,actual}));
    }
  };
  samePerimeter(evidence.before,'Initial chart');
  await chooseNavigation('data');
  await until(()=>evaluate(cdp,expected=>{
    const rows=[...document.querySelector('.atlas-center-frame:not([hidden])')?.contentDocument?.querySelectorAll('#data-body tr[data-asset-symbol]')||[]];
    return document.body.dataset.centerTool==='data'&&rows.length===expected.length&&expected.every(symbol=>rows.some(row=>row.dataset.assetSymbol===symbol))&&document.querySelectorAll('.center-data-actions .center-data-action:not(:disabled)').length===4;
  },expectedSymbols),'native center-data entry');
  evidence.entered=await evaluate(cdp,readParent);samePerimeter(evidence.entered,'Embedded data entry');
  assert.equal(evidence.entered.page,'outlook');assert.equal(evidence.entered.shell,'chart');assert.equal(evidence.entered.center,'data');
  const activeFrame=await evaluate(cdp,()=>{const frame=document.querySelector('.atlas-center-frame:not([hidden])');return {src:frame.src,title:frame.title,borderLeft:frame.clientLeft,borderTop:frame.clientTop};});
  assert.equal(activeFrame.borderLeft,0);assert.equal(activeFrame.borderTop,0);assert.equal(activeFrame.title,'자산 비교');
  const tree=await cdp.send('Page.getFrameTree'),frames=[];
  const collect=node=>{frames.push(node.frame);for(const child of node.childFrames||[])collect(child);};collect(tree.frameTree);
  const matches=frames.filter(frame=>frame.parentId===tree.frameTree.frame.id&&frame.url===activeFrame.src);
  assert.equal(matches.length,1,'Exactly one current child frame must own the embedded board');
  const frame=matches[0],world=await cdp.send('Page.createIsolatedWorld',{frameId:frame.id,worldName:'atlas-center-data-audit'});
  const child={send:(method,params={})=>cdp.send(method,method==='Runtime.evaluate'?{...params,contextId:world.executionContextId}:params)};
  evidence.childContext={frameId:frame.id,parentFrameId:frame.parentId,url:frame.url,executionContextId:world.executionContextId};
  await settled(child);
  evidence.board=await evaluate(child,()=>{
    const root=document.querySelector('#data-view'),heading=root.querySelector('.daily-heading'),actions=heading.querySelector('.daily-heading-actions'),rows=[...root.querySelectorAll('#data-body tr[data-asset-symbol]')];
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    return {embedded:document.body.dataset.embedded,coarse:matchMedia('(pointer:coarse)').matches,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,
      root:rect(root),toolbar:rect(heading),symbols:rows.map(row=>row.dataset.assetSymbol),btcName:rows[0]?.querySelector('.asset-name-label').textContent,
      hosted:document.body.dataset.centerToolbarHosted,ownerActionsVisible:actions.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
      ownerActionIds:[...heading.querySelectorAll('.daily-action')].map(button=>button.id)};
  });
  assert.equal(evidence.board.embedded,'true');assert.equal(evidence.board.symbols.length,expectedSymbols.length);assert.equal(new Set(evidence.board.symbols).size,expectedSymbols.length);
  assert.deepEqual([...evidence.board.symbols].sort(),[...expectedSymbols].sort(),'Every committed asset must appear exactly once');
  assert.equal(evidence.board.symbols[0],'BTC');assert.equal(evidence.board.btcName,'비트코인');assert.ok(evidence.board.documentWidth<=evidence.board.width+1);
  assert.deepEqual(evidence.board.ownerActionIds,['asset-refresh','asset-history-open','daily-method-open','export-raw']);
  assert.equal(evidence.board.hosted,'true');assert.equal(evidence.board.ownerActionsVisible,false,'Embedded source controls must not duplicate the parent header');
  evidence.header=await evaluate(cdp,()=>{
    const heading=document.querySelector('.atlas-canvas-heading'),bar=heading.querySelector('.center-data-actions'),rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    return {heading:rect(heading),toolbar:rect(bar),actionIds:[...bar.querySelectorAll('.center-data-action')].map(button=>button.id),coarse:matchMedia('(pointer:coarse)').matches};
  });
  assert.deepEqual(evidence.header.actionIds,evidence.board.ownerActionIds.map(id=>'center-'+id));
  assert.ok(evidence.header.toolbar.height<=evidence.header.heading.height+1&&evidence.header.toolbar.top>=evidence.header.heading.top-1&&evidence.header.toolbar.bottom<=evidence.header.heading.bottom+1,'Hosted actions must fit the single parent toolbar row');
  evidence.actions=[];const minimum=evidence.board.coarse||evidence.board.width<=760?44:32;
  const headerMinimum=evidence.header.coarse||width<=760?44:32;
  for(const id of evidence.header.actionIds){
    const target=await revealHeadingControl('#'+id);evidence.actions.push(target);
    assert.ok(complete(target)&&target.label&&target.tag==='BUTTON','Hosted action must be named, enabled and physically reachable: '+id);
    assert.ok(target.box.width>=headerMinimum&&target.box.height>=headerMinimum,'Hosted action hit target compressed: '+id);
  }
  await screenshot(cdp,page+'-'+width+'x'+height+'-board.png',receipt);
  await headerPointer('#center-daily-method-open');
  const dialog=await bounds(child,'#daily-method-dialog');assert.equal(dialog.open,true);visibleBounds(dialog,evidence.board.width,evidence.board.height);
  assert.ok(dialog.text.includes('자산 비교표')&&dialog.text.includes('판단 보류'),'Actual comparison method must be present');
  const frameBox=await bounds(cdp,frameSelector);
  const dialogPoint={x:frameBox.left+dialog.left+dialog.width/2,y:frameBox.top+dialog.top+dialog.height*.7};
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...dialogPoint,deltaX:0,deltaY:10000});await settled(child);
  await until(()=>evaluate(child,()=>{const d=document.querySelector('#daily-method-dialog');return d.scrollHeight<=d.clientHeight+1||d.scrollTop>=d.scrollHeight-d.clientHeight-2;}),'embedded method native scroll end');
  evidence.method=await evaluate(child,()=>{const d=document.querySelector('#daily-method-dialog');return {modal:d.matches(':modal'),scrollTop:d.scrollTop,maxScroll:d.scrollHeight-d.clientHeight};});
  assert.equal(evidence.method.modal,true);
  for(const selector of ['#daily-method-title','#daily-method-close']){
    const target=await evaluate(child,readNativeInteractiveTarget,selector);assert.ok(complete(target),'Scrolled embedded method clips '+selector);evidence.method[selector]=target;
  }
  const close=evidence.method['#daily-method-close'];assert.ok(close.box.width>=minimum&&close.box.height>=minimum,'Embedded close must retain a usable hit target');
  await screenshot(cdp,page+'-'+width+'x'+height+'-method.png',receipt);
  await rawPointer('#daily-method-close',child,frame);
  assert.equal(await evaluate(child,()=>document.querySelector('#daily-method-dialog').open),false);
  await until(()=>evaluate(cdp,()=>document.activeElement===document.querySelector('#center-daily-method-open')),'embedded method returns focus to its parent header trigger');
  evidence.afterMethod=await evaluate(cdp,readParent);samePerimeter(evidence.afterMethod,'Embedded method close');
  await headerPointer('#center-asset-history-open');
  await until(()=>evaluate(child,()=>document.querySelector('#asset-history-dialog')?.open),'parent header opens the actual child history dialog');
  const history=await bounds(child,'#asset-history-dialog');visibleBounds(history,evidence.board.width,evidence.board.height);
  assert.ok(history.text.includes('판단 이력')&&history.text.includes('과거 재계산'),'Actual judgment history must retain its source disclosure');
  evidence.history=await evaluate(child,()=>({modal:document.querySelector('#asset-history-dialog').matches(':modal'),state:document.querySelector('#history-state')?.textContent}));
  assert.equal(evidence.history.modal,true);
  const historyClose=await evaluate(child,readNativeInteractiveTarget,'#asset-history-close');
  assert.ok(complete(historyClose)&&historyClose.box.width>=minimum&&historyClose.box.height>=minimum,'Embedded history close must remain reachable');
  await rawPointer('#asset-history-close',child,frame);
  await until(()=>evaluate(cdp,()=>document.activeElement===document.querySelector('#center-asset-history-open')),'embedded history returns focus to its parent header trigger');
  assert.equal(await evaluate(child,()=>document.querySelector('#asset-history-dialog').open),false);

  // Observe the actual owner transitions; no synthetic click or loader replaces
  // the parent pointer input or the child data handler.
  await evaluate(child,()=>{
    const target=document.querySelector('#asset-table-scroll'),probe={transitions:[]};
    probe.observer=new MutationObserver(records=>{for(const record of records)probe.transitions.push({before:record.oldValue,after:target.getAttribute('aria-busy')});});
    probe.observer.observe(target,{attributes:true,attributeFilter:['aria-busy'],attributeOldValue:true});
    globalThis.__atlasAssetRefreshProbe=probe;
  });
  await headerPointer('#center-asset-refresh');
  await until(()=>evaluate(cdp,expected=>{
    const doc=document.querySelector('.atlas-center-frame:not([hidden])')?.contentDocument,rows=[...doc?.querySelectorAll('#data-body tr[data-asset-symbol]')||[]];
    return rows.length===expected.length&&expected.every(symbol=>rows.some(row=>row.dataset.assetSymbol===symbol))&&doc.querySelector('#asset-table-scroll').getAttribute('aria-busy')!=='true'&&!document.querySelector('#center-asset-refresh').disabled;
  },expectedSymbols),'parent refresh returns the complete committed asset board');
  evidence.refresh=await evaluate(child,()=>{const probe=globalThis.__atlasAssetRefreshProbe;probe.observer.disconnect();delete globalThis.__atlasAssetRefreshProbe;return {transitions:probe.transitions,symbols:[...document.querySelectorAll('#data-body tr[data-asset-symbol]')].map(row=>row.dataset.assetSymbol)};});
  assert.ok(evidence.refresh.transitions.some(state=>state.before==='true'||state.after==='true'),'Parent refresh must enter the real child loading state');
  assert.deepEqual([...evidence.refresh.symbols].sort(),[...expectedSymbols].sort());

  await evaluate(child,()=>{
    const probe={completed:null,error:null};
    probe.listener=event=>{
      const link=event.target.closest?.('a[download]');if(!link||!/^asset-comparison-.*\.csv$/.test(link.download))return;
      const filename=link.download;
      void fetch(link.href).then(response=>response.blob()).then(async blob=>{probe.completed={filename,type:blob.type,bytes:blob.size,columns:(await blob.text()).replace(/^\uFEFF/,'').split(/\r?\n/,1)[0]};}).catch(error=>{probe.error=String(error);});
    };
    document.addEventListener('click',probe.listener,true);globalThis.__atlasAssetCsvProbe=probe;
  });
  await headerPointer('#center-export-raw');
  await until(()=>evaluate(child,()=>Boolean(globalThis.__atlasAssetCsvProbe.completed||globalThis.__atlasAssetCsvProbe.error)),'parent CSV action produces the actual child export');
  evidence.csv=await evaluate(child,()=>{const probe=globalThis.__atlasAssetCsvProbe;document.removeEventListener('click',probe.listener,true);delete globalThis.__atlasAssetCsvProbe;return {error:probe.error,...probe.completed};});
  assert.equal(evidence.csv.error,null);assert.match(evidence.csv.filename,/^asset-comparison-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(evidence.csv.type,/^text\/csv/);assert.ok(evidence.csv.bytes>0);
  for(const column of ['comparison_as_of','symbol','price_definition','retrieved_at'])assert.ok(evidence.csv.columns.split(',').includes(column),'Actual CSV omitted '+column);
  samePerimeter(await evaluate(cdp,readParent),'Hosted data actions');
  await chooseNavigation('outlook');
  await until(()=>evaluate(cdp,()=>!document.body.dataset.centerTool&&document.querySelectorAll('.atlas-center-frame:not([hidden])').length===0),'native return from embedded data');
  evidence.returned=await evaluate(cdp,readParent);samePerimeter(evidence.returned,'Return to chart');
  evidence.sourceAfter=await evaluate(cdp,readSource);assert.deepEqual(evidence.sourceAfter,evidence.sourceBefore,'Returning from the board must retain the actual BTC source and observation');
  if(initialRefreshVerified){
    // A second verification consumes a distinct, explicitly triggered parent request.
    assert.equal(evidence.returned.page,'outlook');assert.equal(evidence.returned.center,null);
    await rawPointer('#btc-refresh-retry');await verifyOfflineRefresh({phase:'center-data-return-parent-retry'});
    evidence.sourceAfterRetry=await evaluate(cdp,readSource);assert.deepEqual(evidence.sourceAfterRetry,evidence.sourceBefore);
  }
  await screenshot(cdp,page+'-'+width+'x'+height+'-returned.png',receipt);
}

// Export the actual native measurement/assertion boundary so negative controls
// can prove that missing paint or missing status semantics still fail.
export function readPreviewBootSurface(mode){
  const frame=document.querySelector('#mobile-preview'),doc=frame.contentDocument;
  const shell=doc.getElementById('atlas-boot-shell'),status=doc.getElementById('atlas-boot-status'),error=doc.getElementById('atlas-boot-error');
  const canvas=shell.querySelector('.atlas-boot-canvas'),main=document.querySelector('main');
  if(!canvas||!main)throw new Error('Preview clipping containers are missing');
  const rect=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
  const client=el=>{const b=rect(el);return {left:b.left+el.clientLeft,right:b.left+el.clientLeft+el.clientWidth,top:b.top+el.clientTop,bottom:b.top+el.clientTop+el.clientHeight};};
  const intersect=(...boxes)=>({left:Math.max(...boxes.map(b=>b.left)),right:Math.min(...boxes.map(b=>b.right)),top:Math.max(...boxes.map(b=>b.top)),bottom:Math.min(...boxes.map(b=>b.bottom))});
  const rendered=el=>Boolean(el?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
  const measure=el=>{
    if(!el)return null;
    const local=intersect(rect(el),client(canvas),{left:0,right:frame.contentWindow.innerWidth,top:0,bottom:frame.contentWindow.innerHeight});
    const f=client(frame),visible=intersect({left:f.left+local.left,right:f.left+local.right,top:f.top+local.top,bottom:f.top+local.bottom},f,client(main),{left:0,right:innerWidth,top:0,bottom:innerHeight});
    return {id:el.id||el.className,rendered:[el,canvas,shell,frame,main].every(rendered),local,visible,
      visibleWidth:Math.max(0,visible.right-visible.left),visibleHeight:Math.max(0,visible.bottom-visible.top)};
  };
  let active=null;
  if(mode==='loading'){
    const paint=[...canvas.querySelectorAll('.atlas-boot-readout .atlas-boot-bar,.atlas-boot-indicators .atlas-boot-bar')].map(el=>{
      const css=doc.defaultView.getComputedStyle(el);
      return {...measure(el),background:css.backgroundColor,decorative:Boolean(el.closest('[aria-hidden="true"]'))};
    });
    active={kind:'skeleton',paint,status:{role:status.getAttribute('role'),live:status.getAttribute('aria-live'),busy:status.getAttribute('aria-busy'),
      text:status.textContent.trim(),available:status.checkVisibility({checkVisibilityCSS:true}),excluded:Boolean(status.closest('[hidden],[inert],[aria-hidden="true"]'))}};
  }else if(mode==='error'){
    const retry=doc.getElementById('atlas-boot-retry');
    active={kind:'error',...measure(error),role:error.getAttribute('role'),retry:{...measure(retry),disabled:retry.disabled,name:retry.textContent.trim()}};
  }
  return {mode,boot:doc.documentElement?.dataset.boot,shellHidden:shell.hidden,
    statusHidden:status.hidden,errorHidden:error.hidden,active,caption:document.getElementById('preview-caption').textContent};
}

function computedColorAlpha(color){
  if(color==='transparent')return 0;
  const rgb=color?.match(/^rgba?\(\s*[\d.]+(?:\s*,\s*|\s+)[\d.]+(?:\s*,\s*|\s+)[\d.]+(?:\s*(?:,|\/)\s*([\d.]+))?\s*\)$/);
  const alpha=rgb?Number(rgb[1]??1):NaN;
  return Number.isFinite(alpha)&&alpha>=0&&alpha<=1?alpha:NaN;
}

export function assertPreviewBootSurface(state){
  if(state.mode==='actual'){assert.equal(state.shellHidden,true);return;}
  assert.equal(state.shellHidden,false);
  assert.equal(state.statusHidden,state.mode==='error');
  assert.equal(state.errorHidden,state.mode!=='error');
  assert.ok(state.caption.includes('실제 로딩 시간'));
  const visible=item=>item?.rendered&&item.visibleWidth>0&&item.visibleHeight>0;
  if(state.mode==='loading'){
    const {paint,status}=state.active;
    const visiblePaint=paint.filter(item=>visible(item)&&computedColorAlpha(item.background)>0);
    assert.ok(visiblePaint.length>=2&&visiblePaint.every(item=>item.decorative),'Preview loading skeleton paint is missing: '+JSON.stringify(paint));
    assert.equal(status.role,'status');assert.equal(status.live,'polite');assert.equal(status.busy,'true');
    assert.ok(status.text&&status.available&&!status.excluded,'Preview loading status must remain available independently of decorative paint');
  }else{
    assert.ok(visible(state.active),'Preview error panel is not visible: '+JSON.stringify(state.active));
    assert.equal(state.active.role,'alert');
    assert.ok(visible(state.active.retry)&&state.active.retry.name&&!state.active.retry.disabled,'Preview retry action is missing');
  }
}

export function readIndicatorLegendSurface(){
  const manager=document.querySelector('#chart-indicator-manager'),list=manager.querySelector('.chart-indicator-list'),toggle=manager.querySelector('.indicator-legend-toggle');
  const b=manager.getBoundingClientRect(),l=list.getBoundingClientRect(),t=toggle.getBoundingClientRect(),rows=[...list.querySelectorAll('.indicator-label')];
  return {background:getComputedStyle(manager).backgroundColor,listBackground:getComputedStyle(list).backgroundColor,
    foldOverlap:Math.max(0,Math.min(l.right,t.right)-Math.max(l.left,t.left))*Math.max(0,Math.min(l.bottom,t.bottom)-Math.max(l.top,t.top)),
    collapsed:manager.dataset.collapsed==='true',listHidden:list.hidden,expanded:toggle.getAttribute('aria-expanded'),
    mobile:matchMedia('(max-width:620px)').matches,disabled:toggle.disabled,name:toggle.getAttribute('aria-label'),controls:toggle.getAttribute('aria-controls'),listId:list.id,
    painted:manager.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,
    rowCount:rows.length,visibleLabels:rows.filter(el=>{
      const r=el.getBoundingClientRect(),l=list.getBoundingClientRect();
      return el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&r.bottom>l.top&&r.top<l.bottom;
    }).map(el=>({text:el.textContent.trim(),color:getComputedStyle(el).color}))};
}

export function assertIndicatorLegendSurface(state){
  for(const [name,color] of [['manager',state.background],['list',state.listBackground]]){
    assert.equal(computedColorAlpha(color),0,'Indicator '+name+' must retain the requested transparent background: '+color);
  }
  assert.ok(state.painted&&state.width>0&&state.height>0,'Indicator manager is missing');
  assert.ok(state.name&&state.controls===state.listId&&state.rowCount>0,'Indicator legend lost its named controls or actual rows');
  assert.equal(state.listHidden,state.collapsed);assert.equal(state.expanded,String(!state.collapsed));
  if(state.mobile){
    assert.equal(state.collapsed,true);assert.equal(state.disabled,true);
    assert.match(state.name,/모바일.*인디케이터 메뉴/,'Mobile fixed collapse must explain its menu owner');
  }else assert.equal(state.disabled,false);
  if(!state.collapsed)assert.ok(state.visibleLabels.length>0&&state.visibleLabels.every(label=>label.text&&computedColorAlpha(label.color)>0),
    'Expanded indicator labels are missing');
  if(!state.collapsed)assert.equal(state.foldOverlap,0,'The fold control covers the indicator list scrollport');
}

export function readPriceLegendScrollSurface(){
  const svg=document.querySelector('#lab-chart'),plot=svg.closest('.atlas-plot'),legend=plot.querySelector(':scope > .lab-chart-foot');
  const box=node=>{const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
  const painted=node=>Boolean(node&&node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&node.getClientRects().length);
  const named=node=>({...box(node),name:node.textContent.replace(/\s+/g,' ').trim(),painted:painted(node)});
  const itemSelector='.price-legend-item,.cycle-legend-item',statusSelector='.cycle-style-sample,.cycle-reference-key';
  const area=box(legend),items=[...legend.querySelectorAll(itemSelector)].map(named),statusItems=[...legend.querySelectorAll(statusSelector)].map(named);
  const trigger=[...legend.querySelectorAll('.chart-legend-open,.chart-legend-more')].find(painted);
  const chart=box(svg),view=svg.viewBox.baseVal,pricePane={left:chart.left+(Number(svg.dataset.plotLeft)-view.x)/view.width*chart.width,
    right:chart.left+(Number(svg.dataset.plotRight)-view.x)/view.width*chart.width,top:chart.top+(Number(svg.dataset.plotTop)-view.y)/view.height*chart.height,
    bottom:chart.top+(Number(svg.dataset.priceBottom)-view.y)/view.height*chart.height};
  const dialog=document.querySelector('#chart-legend-dialog'),content=dialog?.querySelector('.chart-legend-dialog-content');
  let sheet=null;
  if(dialog?.open&&content){
    const bounds=box(content),scrollport={left:bounds.left+content.clientLeft,right:bounds.left+content.clientLeft+content.clientWidth,
      top:bounds.top+content.clientTop,bottom:bounds.top+content.clientTop+content.clientHeight};
    const entries=[...content.querySelectorAll(itemSelector+','+statusSelector)].map(named);
    sheet={...box(dialog),scrollport,scrollTop:content.scrollTop,maximum:content.scrollHeight-content.clientHeight,clientHeight:content.clientHeight,
      horizontalOverflow:content.scrollWidth-content.clientWidth,overflowY:getComputedStyle(content).overflowY,items:entries,
      visibleNames:entries.filter(item=>item.painted&&item.width>0&&item.height>0&&item.left>=scrollport.left-1&&item.right<=scrollport.right+1&&item.top>=scrollport.top-1&&item.bottom<=scrollport.bottom+1).map(item=>item.name)};
  }
  return {width:innerWidth,height:innerHeight,scrollX,scrollY,pageWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),
    url:location.pathname+location.search,pricePane,sheet,
    range:{start:svg.dataset.start,end:svg.dataset.end,interval:svg.dataset.interval},
    observed:{line:Number(svg.dataset.observedLineCount),candles:Number(svg.dataset.observedCandleCount)},
    price:{min:Number(svg.dataset.priceMin),max:Number(svg.dataset.priceMax),mode:svg.dataset.priceMode,scale:svg.dataset.scale,unit:svg.dataset.unit,inverted:svg.dataset.invertScale},
    touchAction:{plot:getComputedStyle(plot).touchAction,svg:getComputedStyle(svg).touchAction,legend:getComputedStyle(legend).touchAction},
    legend:{...area,mode:legend.dataset.legendMode,clientWidth:legend.clientWidth,maximum:legend.scrollWidth-legend.clientWidth,items,statusItems,trigger:trigger?named(trigger):null}};
}

export function assertPriceLegendScrollSurface(state,baseline=state){
  assert.deepEqual(state.range,baseline.range,'A native legend gesture changed the chart time range');
  assert.deepEqual(state.observed,baseline.observed,'A native legend gesture changed the observed price inventory');
  assert.deepEqual(state.price,baseline.price,'A native legend gesture changed the price axis');
  assert.equal(state.url,baseline.url,'A native legend gesture changed URL state');
  assert.deepEqual([state.scrollX,state.scrollY],[baseline.scrollX,baseline.scrollY],'Legend scrolling moved the document');
  assert.ok(state.pageWidth<=state.width+1,'Legend scrolling introduced document overflow');
  assert.ok(state.observed.line+state.observed.candles>0&&Number.isFinite(state.price.min)&&state.price.max>state.price.min,'The legend check requires actual observed prices and a valid axis');
  assert.deepEqual(state.legend.items.map(item=>item.name),['실제 가격','미래 가정','가정 범위','고점·저점','CYCLE TOP','PIT STOP','FIRST TOP','ATH','MID-TOP','BOTTOM'],'The price/cycle legend lost actual items');
  const statusNames=['실선 · 관측 사후 기준','점선 · 잠정·가정','◇ 거시 시계 · ○ 예시 경로'];
  assert.deepEqual(state.legend.statusItems.map(item=>item.name),statusNames,'The legend lost provisional/retrospective meanings');
  assert.ok(state.legend.clientWidth>0&&state.legend.maximum<=1,'The responsive legend must not overflow horizontally');
  assert.ok(state.legend.width<=(state.pricePane.right-state.pricePane.left)*.42+1,'Legend exceeds its measured 42% price-pane budget');
  assert.ok(Math.abs(state.pricePane.right-state.legend.right-12)<=1,'Legend lost its 12px right inset');
  assert.ok(state.legend.top>=state.pricePane.top+11&&state.legend.bottom<=state.pricePane.bottom+1,'Legend escaped its price-pane safe area');
  assert.ok(state.legend.trigger?.painted&&state.legend.trigger.width>0&&state.legend.trigger.height>0,'Overflow entries lack a visible full-list trigger');
  if(state.width<=430){assert.equal(state.legend.mode,'chip');assert.equal(state.legend.trigger.name,'범례');assert.ok(state.legend.trigger.height>=44);}
  if(state.sheet){
    assert.deepEqual(state.sheet.items.map(item=>item.name),[...state.legend.items.map(item=>item.name),...statusNames],'The full legend did not expose every original meaning');
    assert.ok(state.sheet.items.every(item=>item.painted&&item.width>0&&item.height>0),'A full-sheet legend entry is hidden');
    assert.ok(state.sheet.left>=-1&&state.sheet.right<=state.width+1&&state.sheet.top>=-1&&state.sheet.bottom<=state.height+1,'The full legend escaped the viewport');
    assert.ok(state.sheet.horizontalOverflow<=1,'The full legend has horizontal overflow');
    assert.ok(state.sheet.clientHeight>0&&state.sheet.maximum>0,'This regression must exercise the actual vertically overflowing full legend');
    assert.match(state.sheet.overflowY,/^(auto|scroll)$/,'The full legend must own its native vertical scrolling');
    if(state.legend.mode==='chip'){assert.ok(Math.abs(state.sheet.width-state.width)<=1);assert.ok(Math.abs(state.sheet.height-state.height)<=1);}
  }
}

// Observe the full-list owner's vertical scroll to completion; never assign
// scrollTop or move the document to manufacture an exposed legend item.
export function waitForPriceLegendSheetScroll({selector='#chart-legend-dialog .chart-legend-dialog-content',timeoutMs=4000,quietMs=140}={}){
  const node=document.querySelector(selector);if(!node?.getClientRects().length)throw new Error('The native full-legend scroll owner is not visible');
  const read=()=>({top:node.scrollTop,maximum:node.scrollHeight-node.clientHeight,height:node.clientHeight});
  return new Promise((resolve,reject)=>{
    const started=performance.now();let current=read(),lastChange=started,stableFrames=0,scrollEvents=0,endEvents=0,ended=false,frame;
    const onScroll=()=>{scrollEvents++;lastChange=performance.now();stableFrames=0;ended=false;};
    const onEnd=()=>{endEvents++;ended=true;stableFrames=0;};
    const cleanup=()=>{clearTimeout(timer);cancelAnimationFrame(frame);node.removeEventListener('scroll',onScroll);node.removeEventListener('scrollend',onEnd);};
    const evidence=settledBy=>({...current,settledBy,elapsedMs:performance.now()-started,stableFrames,scrollEvents,endEvents});
    const timer=setTimeout(()=>{current=read();const state=evidence('timeout');cleanup();reject(new Error('Native full-legend scrolling did not settle: '+JSON.stringify(state)));},timeoutMs);
    node.addEventListener('scroll',onScroll,{passive:true});node.addEventListener('scrollend',onEnd,{passive:true});
    const sample=()=>{const next=read(),now=performance.now();if(Object.keys(next).some(key=>next[key]!==current[key])){lastChange=now;stableFrames=0;}else stableFrames++;current=next;
      if(stableFrames>=2&&(ended||now-lastChange>=quietMs)){const state=evidence(ended?'scrollend':'quiet');cleanup();resolve(state);return;}frame=requestAnimationFrame(sample);};
    frame=requestAnimationFrame(sample);
  });
}

async function verifyPriceLegendScrollOwnership(api,{touch,label}){
  const {cdp,receipt,evaluate,until,settled,screenshot,click}=api,selector='#chart-legend-dialog .chart-legend-dialog-content';
  const record={input:touch?'native-touch':'native-wheel',contract:'upper-right compact legend and native full-list sheet',states:[],gestures:[]};
  (receipt.workspace.priceLegendScroll??=[]).push(record);
  const read=async()=>{const state=await evaluate(cdp,readPriceLegendScrollSurface);record.states.push(state);assertPriceLegendScrollSurface(state,record.states[0]);return state;};
  let state=await read();
  const trigger=state.legend.mode==='chip'?'.chart-legend-open':'.chart-legend-more:not([hidden])';
  async function activate(selector){
    if(!touch){await click(cdp,selector);return;}
    const target=await evaluate(cdp,selector=>{const node=document.querySelector(selector),b=node.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2,hit=document.elementFromPoint(x,y);return {x,y,ownsHit:Boolean(hit&&(hit===node||node.contains(hit)))};},selector);
    assert.equal(target.ownsHit,true,'Native legend tap target is obscured');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(cdp);
  }
  if(!touch){
    const target=state.legend.trigger;
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:(target.left+target.right)/2,y:(target.top+target.bottom)/2,deltaX:120,deltaY:0});
    await settled(cdp);state=await read();record.gestures.push({owner:'compact-legend',axis:'x',delta:120,chartUnchanged:true});
  }
  await activate(trigger);await until(()=>evaluate(cdp,()=>document.querySelector('#chart-legend-dialog')?.open),'native complete legend opens');
  state=await read();const names=state.sheet.items.map(item=>item.name);
  for(const [index,edge]of ['start','end','start'].entries()){
    const distance=Math.min(96,state.sheet.clientHeight*.4),maximumSteps=Math.ceil(state.sheet.maximum/Math.max(8,distance*.5))+4;
    const reached=()=>edge==='start'?state.sheet.scrollTop<=1:state.sheet.scrollTop>=state.sheet.maximum-1;
    let steps=0;
    while(!reached()&&steps++<maximumSteps){
      const direction=edge==='end'?-1:1,before=state.sheet.scrollTop;
      const target=await evaluate(cdp,({selector,direction,distance,preferGlyph})=>{
        const node=document.querySelector(selector),b=node.getBoundingClientRect();
        const glyph=preferGlyph?[...node.querySelectorAll('.cycle-legend-item > svg')].find(svg=>{
          const r=svg.getBoundingClientRect(),y=r.top+r.height/2;
          return r.left>=b.left+2&&r.right<=b.right-2&&r.top>=b.top&&r.bottom<=b.bottom&&(direction<0?y-distance>=b.top+2:y+distance<=b.bottom-2);
        }):null;
        const g=glyph?.getBoundingClientRect(),x=g?g.left+g.width/2:b.left+b.width/2,y=g?g.top+g.height/2:direction<0?b.bottom-12:b.top+12,hit=document.elementFromPoint(x,y);
        return {x,y,distance,ownsHit:Boolean(hit&&(hit===node||node.contains(hit))),cycleGlyph:Boolean(glyph&&hit&&(hit===glyph||glyph.contains(hit))),glyphTouchAction:glyph?getComputedStyle(glyph).touchAction:null};
      },{selector,direction,distance,preferGlyph:touch&&!record.gestures.some(item=>item.cycleGlyph)});
      assert.equal(target.ownsHit,true,'The native legend input point is obscured');
      if(touch){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y,id:1}]});
        for(let step=1;step<=6;step++){
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x,y:target.y+direction*distance*step/6,id:1}]});
          await new Promise(resolve=>setTimeout(resolve,50));
          state=await read();
        }
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }else await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:target.x,y:target.y,deltaX:0,deltaY:-direction*distance});
      const settledScroll=await evaluate(cdp,waitForPriceLegendSheetScroll,{selector});await settled(cdp);
      state=await read();record.gestures.push({edge,owner:'full-legend',axis:'y',before,after:state.sheet.scrollTop,...target,settledScroll});
      assert.ok(edge==='end'?state.sheet.scrollTop>before:state.sheet.scrollTop<before,'Native legend input failed to move its own scrollport');
    }
    assert.ok(reached(),'Native legend input did not reach '+edge);
    state=await read();
    await screenshot(cdp,`workspace-btc-legend-${label}-${index}-${edge}.png`,receipt);
  }
  assert.ok(record.gestures.some(item=>item.owner==='full-legend'),'Native full-legend gestures were never exercised');
  if(touch)assert.ok(record.gestures.some(item=>item.cycleGlyph),'Native legend scrolling must also start on an actual cycle glyph');
  assert.ok(record.states.some(value=>value.sheet?.scrollTop<=1&&value.sheet.visibleNames.includes(names[0])),'Native legend scrolling never exposed its first item');
  assert.ok(record.states.some(value=>value.sheet&&value.sheet.scrollTop>=value.sheet.maximum-1&&value.sheet.visibleNames.includes(names.at(-1))),'Native legend scrolling never exposed its last item');
  const exposed=new Set(record.states.flatMap(value=>value.sheet?.visibleNames??[]));
  assert.deepEqual(names.filter(name=>!exposed.has(name)),[],'Some legend items were never fully visible during native input');
  assert.ok(state.sheet.scrollTop<=1,'Native legend scrolling did not return to its start');
  await activate('#chart-legend-dialog > header > button');await until(()=>evaluate(cdp,()=>!document.querySelector('#chart-legend-dialog')?.open),'native full legend closes');
  state=await read();assert.equal(state.sheet,null);
  assert.equal(await evaluate(cdp,()=>document.activeElement.matches('.chart-legend-open,.chart-legend-more')),true,'Native legend close did not return focus');
  record.completed=true;
}

/** Long-document readers must retain native controls and the actual opener. */
export async function verifyLegacyMethodReader(api){
  const {cdp,receipt,evaluate,until,settled,screenshot}=api;
  const record={inputs:[],states:[]};receipt.workspace.legacy.methodReader=record;
  const complete=t=>t.painted&&!t.disabled&&t.topmost&&t.box.width>0&&t.box.height>0&&
    t.box.left>=t.clip.left-1&&t.box.right<=t.clip.right+1&&t.box.top>=t.clip.top-1&&t.box.bottom<=t.clip.bottom+1;
  const pointer=async selector=>{
    const target=await evaluate(cdp,readNativeInteractiveTarget,selector);
    assert.ok(complete(target),'Legacy reader native pointer is unavailable: '+JSON.stringify(target));
    record.inputs.push({kind:'raw-native-pointer',selector,target});
    const point={x:target.x,y:target.y};
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
    await settled(cdp);
  };
  const key=async(key,code,number)=>{
    record.inputs.push({kind:'native-keyboard',key});
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number});
    await settled(cdp);
  };
  const reveal=async(selector,{menuSpace=false}={})=>{
    for(let attempt=0;attempt<40;attempt++){
      const target=await evaluate(cdp,readNativeInteractiveTarget,selector);
      const desiredTop=menuSpace?Math.min(200,target.viewport.height*.25):target.viewport.height*.3;
      if(complete(target)&&(!menuSpace||target.box.top<=desiredTop+1))return;
      const point=await evaluate(cdp,()=>{const main=document.querySelector('#main').getBoundingClientRect();return{x:(Math.max(0,main.left)+innerWidth)/2,y:innerHeight/2};});
      const deltaY=Math.max(-640,Math.min(640,target.box.top-desiredTop));
      record.inputs.push({kind:'native-body-wheel',selector,point,deltaY});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY});await settled(cdp);
    }
    throw new Error('Native body wheel did not reveal '+selector);
  };
  const readState=async()=>{
    const paths=[...document.querySelectorAll('#structure-chart path[d],#legacy-comparison svg path[d]')].map(el=>el.getAttribute('d')).join('\n');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(paths));
    const svgs=[];
    for(const svg of document.querySelectorAll('#structure-chart,#legacy-comparison svg')){
      const p=[...svg.querySelectorAll('path[d]')].map(el=>el.getAttribute('d')).join('\n'),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p)),box=svg.getBoundingClientRect();
      svgs.push({id:svg.id||svg.parentElement?.getAttribute('data-icon')||svg.getAttribute('class'),viewBox:svg.getAttribute('viewBox'),width:box.width,height:box.height,pathCount:svg.querySelectorAll('path[d]').length,hash:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('')});
    }
    return {scrollTop:document.body.scrollTop,scrollHeight:document.body.scrollHeight,clientHeight:document.body.clientHeight,
      widths:{document:document.documentElement.scrollWidth,body:document.body.clientWidth,bodyScroll:document.body.scrollWidth,workspace:document.querySelector('.workspace').getBoundingClientRect().width,main:document.querySelector('#main').getBoundingClientRect().width},
      pathHash:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join(''),pathCount:document.querySelectorAll('#structure-chart path[d],#legacy-comparison svg path[d]').length,
      focused:document.activeElement?.id||null,readerHidden:document.querySelector('#chart-reader').hidden,menuHidden:document.querySelector('#export-menu').hidden,
      readerPosition:getComputedStyle(document.querySelector('#chart-reader')).position,svgs};
  };
  await reveal('#legacy-comparison > summary');
  if(!await evaluate(cdp,()=>document.querySelector('#legacy-comparison').open))await pointer('#legacy-comparison > summary');
  await reveal('#export-button',{menuSpace:true});
  const before=await evaluate(cdp,readState);record.before=before;
  assert.ok(before.scrollTop>0&&before.pathCount>0,'Reader must be opened from the actual scrolled legacy content');
  for(const action of ['close-button','Escape']){
    await pointer('#export-button');await pointer('#export-menu [data-method]');
    await until(()=>evaluate(cdp,()=>!document.querySelector('#chart-reader').hidden&&document.querySelector('#chart-reader').dataset.kind==='method'),'legacy method reader opens');
    const close=await evaluate(cdp,readNativeInteractiveTarget,'#chart-reader .reader-heading button');
    const next=await evaluate(cdp,readNativeInteractiveTarget,'#chart-reader [aria-label="다음 설명 페이지"]');
    assert.ok(complete(close)&&complete(next),'Scrolled reader close/pager is outside its viewport: '+JSON.stringify({close,next}));
    const opened=await evaluate(cdp,readState);record.latestOpened=opened;assert.ok(Math.abs(opened.scrollTop-before.scrollTop)<=1,'Opening reader moved the long document');assert.deepEqual(opened.widths,before.widths,'Opening reader changed document or chart workspace width');assert.equal(opened.pathHash,before.pathHash,'Opening reader changed chart paths');
    const initialPage=await evaluate(cdp,()=>document.querySelector('#chart-reader .reader-pagination span').textContent);
    await pointer('#chart-reader [aria-label="다음 설명 페이지"]');
    const nextPage=await evaluate(cdp,()=>document.querySelector('#chart-reader .reader-pagination span').textContent);assert.notEqual(nextPage,initialPage,'Real method pagination did not advance');
    await pointer('#chart-reader [aria-label="이전 설명 페이지"]');
    assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-reader .reader-pagination span').textContent),initialPage,'Real method pagination did not return');
    if(action==='close-button'){
      // Shift-Tab from the previous-page control traverses the real reader.
      for(let attempt=0;attempt<24&&!await evaluate(cdp,()=>document.activeElement===document.querySelector('#chart-reader .reader-heading button'));attempt++){
        for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9,modifiers:8});await settled(cdp);
      }
      const focus=await evaluate(cdp,readNativeInteractiveTarget,'#chart-reader .reader-heading button',true);
      assert.equal(await evaluate(cdp,()=>document.activeElement===document.querySelector('#chart-reader .reader-heading button')),true,'Native Tab did not reach reader close');
      assert.ok(complete(focus)&&focus.outline!=='none'&&focus.outlineWidth>=2,'Reader close lacks a visible keyboard ring');
      record.closeFocus=focus;await screenshot(cdp,`${receipt.page}-${receipt.width}x${receipt.height}-legacy-method-reader.png`,receipt);
      await pointer('#chart-reader .reader-heading button');
    }else await key('Escape','Escape',27);
    await until(()=>evaluate(cdp,()=>document.querySelector('#chart-reader').hidden&&document.activeElement===document.querySelector('#export-button')),'legacy reader returns focus to its visible menu trigger');
    const closed=await evaluate(cdp,readState),returned=await evaluate(cdp,readNativeInteractiveTarget,'#export-button');
    assert.ok(complete(returned),'Reader returned focus to an unreachable trigger');
    assert.ok(Math.abs(closed.scrollTop-before.scrollTop)<=1,'Closing reader moved the long document');assert.deepEqual(closed.widths,before.widths,'Closing reader changed document or chart workspace width');assert.equal(closed.pathHash,before.pathHash,'Reader pagination/close changed chart paths');
    record.states.push({action,opened,initialPage,nextPage,close,next,closed,returned});
  }
}

export async function verifyWorkspaceSurface(api) {
  const {cdp,receipt,evaluate,until,settled,click,bounds,visibleBounds,dark,screenshot,verifyOfflineRefresh,expectedBtc,verifyHeaderOwnership}=api;
  const {width,height,surface,page}=receipt;
  if(surface==='center-data')return verifyEmbeddedDataSurface(api);
  receipt.workspace={surface,states:[]};
  const states=receipt.workspace.states;
  async function key(key,code,number,modifiers=0){
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,modifiers,...(type==='keyDown'&&key==='Enter'&&modifiers===0?{text:'\r',unmodifiedText:'\r'}:{})});
    await settled(cdp);
  }
  async function text(selector,value){
    await click(cdp,selector);await key('a','KeyA',65,2);
    if(value)await cdp.send('Input.insertText',{text:value});else await key('Backspace','Backspace',8);
    await settled(cdp);
  }
  async function inspect(selector,label,{opaque=true,dialog=false}={}){
    const box=await bounds(cdp,selector);visibleBounds(box,width,height);
    if(opaque)dark(box.background,label);
    if(dialog)assert.equal(box.open,true,label+' is not open');
    const overflow=await evaluate(cdp,()=>({root:document.documentElement.scrollWidth,body:document.body.scrollWidth,width:innerWidth}));
    assert.ok(Math.max(overflow.root,overflow.body)<=width+1,label+' causes page overflow');
    states.push({label,selector,box:{...box,text:box.text.slice(0,300)},overflow});
    await screenshot(cdp,page+'-'+width+'x'+height+'-'+label+'.png',receipt);
    return box;
  }
  async function focused(selector){
    const focus=await evaluate(cdp,readNativeInteractiveTarget,selector,true),b=focus.box;
    assert.ok(focus.inside,'Keyboard focus escaped '+selector+': '+JSON.stringify(focus));
    assert.ok(focus.painted&&b.left>=-1&&b.right<=width+1&&b.top>=-1&&b.bottom<=height+1,'Focused action is outside viewport: '+JSON.stringify(focus));
    assert.ok(focus.topmost&&b.left>=focus.clip.left-1&&b.right<=focus.clip.right+1&&b.top>=focus.clip.top-1&&b.bottom<=focus.clip.bottom+1,'Focused action is clipped or occluded: '+JSON.stringify(focus));
    assert.ok(focus.outlineWidth>=2&&focus.outline!=='none','Keyboard focus lacks common visible ring: '+JSON.stringify(focus));
    states.push({label:'keyboard-focus',selector,focus});
  }
  async function escape(selector){
    await key('Escape','Escape',27);
    assert.equal(await evaluate(cdp,s=>Boolean(document.querySelector(s)?.open),selector),false,'Escape did not close '+selector);
  }
  async function command(query,{empty=false}={}){
    await key('k','KeyK',75,2);
    await until(()=>evaluate(cdp,()=>document.querySelector('#workspace-dialog')?.open),'workspace command dialog');
    await text('.workspace-command-search',query);
    if(empty){
      assert.equal(await evaluate(cdp,()=>document.querySelectorAll('.workspace-command-results button').length),0);
      assert.ok((await bounds(cdp,'.workspace-command-results')).text.includes('일치하는 기능이 없습니다'));
      await inspect('#workspace-dialog','commands-empty',{dialog:true});
      await escape('#workspace-dialog');return;
    }
    const matches=await evaluate(cdp,()=>[...document.querySelectorAll('.workspace-command:not(:disabled) strong')].map(n=>n.textContent));
    assert.ok(matches.length>0,'Command not found: '+query);
    await click(cdp,'.workspace-command:not(:disabled)');
  }
  if(surface==='preview'){
    await until(()=>evaluate(cdp,()=>document.querySelector('#mobile-preview')?.contentDocument?.documentElement?.dataset.boot==='ready'),'preview actual app ready');
    const previewSettled=()=>until(()=>evaluate(cdp,()=>{const doc=document.querySelector('#mobile-preview')?.contentDocument;return doc?.documentElement?.dataset.boot==='ready'&&!doc.querySelector('.atlas-plot[aria-busy="true"]')&&!doc.querySelector('.workspace-toast:not([hidden])');}),'preview settled observed chart');
    await previewSettled();
    await verifyOfflineRefresh({preview:true,phase:'preview-initial-actual'});
    await inspect('header','preview-controls',{opaque:false});
    receipt.workspace.actual=await evaluate(cdp,()=>{
      const frame=document.querySelector('#mobile-preview'),doc=frame.contentDocument,main=document.querySelector('main');
      return {boot:doc.documentElement?.dataset.boot,width:frame.width,height:frame.height,innerWidth:frame.contentWindow.innerWidth,plotPaths:doc.querySelectorAll('#lab-chart path').length,mainHeight:main.clientHeight,scrollHeight:main.scrollHeight,scrollWidth:main.scrollWidth,clientWidth:main.clientWidth};
    });
    assert.ok(receipt.workspace.actual.plotPaths>0,'Preview iframe never rendered actual BTC chart');
    await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('#mobile-preview')?.contentDocument?.querySelector('.workbench-bottom-bar'))),'preview footer ready');
    const previewPan=await evaluate(cdp,()=>{
      const main=document.querySelector('main'),frame=document.querySelector('#mobile-preview');
      main.scrollLeft=main.scrollWidth;main.scrollTop=main.scrollHeight;
      return {scrollLeft:main.scrollLeft,maxLeft:main.scrollWidth-main.clientWidth,scrollTop:main.scrollTop,maxTop:main.scrollHeight-main.clientHeight};
    });await settled(cdp);
    const previewEnd=await evaluate(cdp,()=>{
      const main=document.querySelector('main'),frame=document.querySelector('#mobile-preview'),m=main.getBoundingClientRect(),f=frame.getBoundingClientRect();
      return {frameRight:f.right,frameBottom:f.bottom,clipRight:m.left+main.clientLeft+main.clientWidth,clipBottom:m.top+main.clientTop+main.clientHeight,
        parentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,footer:frame.contentDocument.querySelector('.workbench-bottom-bar')?.textContent||''};
    });
    assert.ok(Math.abs(previewPan.scrollLeft-previewPan.maxLeft)<=1&&Math.abs(previewPan.scrollTop-previewPan.maxTop)<=1,'Preview must reach both scroll ends');
    assert.ok(previewEnd.frameRight<=previewEnd.clipRight+1&&previewEnd.frameBottom<=previewEnd.clipBottom+1,'Selected viewport bottom/right edge is unreachable');
    assert.ok(previewEnd.footer.includes('로그')&&previewEnd.parentWidth<=previewEnd.viewportWidth+1,'Preview footer must exist without page overflow');
    receipt.workspace.previewPan={...previewPan,...previewEnd,settled:true};
    await screenshot(cdp,page+'-'+width+'x'+height+'-preview-scroll-end.png',receipt);
    await evaluate(cdp,()=>{const main=document.querySelector('main');main.scrollLeft=0;main.scrollTop=0;});await settled(cdp);
    for(const mode of ['loading','error','actual']){
      await evaluate(cdp,value=>{const picker=document.querySelector('#preview-mode');picker.value=value;picker.dispatchEvent(new Event('change',{bubbles:true}));},mode);
      await until(()=>evaluate(cdp,value=>{
        const frame=document.querySelector('#mobile-preview');
        return !frame.hidden&&frame.contentDocument?.documentElement?.dataset.boot===(value==='actual'?'ready':value);
      },mode),'preview '+mode);
      if(mode==='actual'){await previewSettled();await verifyOfflineRefresh({preview:true,phase:'preview-restored-actual'});}
      const state=await evaluate(cdp,readPreviewBootSurface,mode);
      assertPreviewBootSurface(state);
      states.push({label:'preview-'+mode,...state});
      await screenshot(cdp,page+'-'+width+'x'+height+'-preview-'+mode+'.png',receipt);
      await screenshot(cdp,page+'-'+width+'-'+mode+'.png',receipt);
    }
    await evaluate(cdp,()=>document.querySelector('header a').focus());
    await key('Tab','Tab',9);
    const frameFocus=await evaluate(cdp,()=>{
      const frame=document.querySelector('#mobile-preview'),css=getComputedStyle(frame);
      return {active:document.activeElement===frame,outline:css.outlineStyle,width:parseFloat(css.outlineWidth),color:css.outlineColor};
    });
    assert.ok(frameFocus.active&&frameFocus.outline!=='none'&&frameFocus.width>=2,'Embedded preview keyboard focus must be visible');
    receipt.workspace.frameFocus=frameFocus;
    await evaluate(cdp,()=>{const picker=document.querySelector('#preview-size');picker.value='844x390';picker.dispatchEvent(new Event('change',{bubbles:true}));});
    await settled(cdp);
    assert.deepEqual(await evaluate(cdp,()=>{const f=document.querySelector('#mobile-preview');return [f.contentWindow.innerWidth,f.contentWindow.innerHeight];}),[844,390]);
    receipt.workspace.resized=true;return;
  }
  await until(()=>evaluate(cdp,()=>document.documentElement?.dataset.boot==='ready'),'app boot ready');
  const failedRefresh=await verifyOfflineRefresh({phase:'workspace-initial-document'});
  receipt.workspace.headerOwnership=await verifyHeaderOwnership();
  if(surface==='btc'&&failedRefresh){
    await inspect('#btc-refresh-notice','refresh-failed');
    await evaluate(cdp,()=>{
      const notice=document.querySelector('#btc-refresh-notice'),button=document.querySelector('#btc-refresh-retry');
      globalThis.__btcRefreshProbe={transitions:[],observer:new MutationObserver(()=>{
        globalThis.__btcRefreshProbe.transitions.push({state:notice.dataset.state,disabled:button.disabled,busy:notice.getAttribute('aria-busy'),cutoff:document.querySelector('#btc-refresh-detail').textContent});
      })};
      globalThis.__btcRefreshProbe.observer.observe(notice,{attributes:true,subtree:true,attributeFilter:['data-state','aria-busy','disabled']});
      button.focus();
    });
    await focused('#btc-refresh-notice');await key('Enter','Enter',13);
    await verifyOfflineRefresh({phase:'native-keyboard-retry'});
    const transitions=await evaluate(cdp,()=>{const probe=globalThis.__btcRefreshProbe;probe.observer.disconnect();return probe.transitions;});
    assert.ok(transitions.some(t=>t.state==='refreshing'&&t.disabled&&t.busy==='true'),'Real retry never entered busy state');
    assert.ok(transitions.some(t=>t.state==='failed'&&!t.disabled&&t.busy==='false'),'Real retry never returned to a retryable failure');
    receipt.workspace.refreshRetry={transitions,archivePreserved:true};
    await inspect('#btc-refresh-notice','refresh-retry-failed');
  }
  if(surface==='legacy'){
    await until(()=>evaluate(cdp,()=>document.querySelectorAll('#structure-chart path').length>0&&document.querySelectorAll('#structure-cycles tr').length>0),'legacy chart and real cycle rows');
    const readLegacySizing=()=>['structure-chart','structure-timeline'].map(id=>{
      const svg=document.getElementById(id),box=svg.getBoundingClientRect(),view=svg.viewBox.baseVal,matrix=svg.getScreenCTM();
      const renderedText=[...svg.querySelectorAll('text')].filter(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return b.width>0&&b.height>0&&s.visibility!=='hidden'&&s.display!=='none';}).map(el=>{const m=el.getScreenCTM();return parseFloat(getComputedStyle(el).fontSize)*Math.hypot(m.a,m.b);});
      return {id,width:box.width,height:box.height,viewWidth:view.width,viewHeight:view.height,scale:Math.hypot(matrix.a,matrix.b),minText:Math.min(...renderedText),textCount:renderedText.length};
    });
    const sizingReady=()=>until(async()=>{const rows=await evaluate(cdp,readLegacySizing);return rows.every(row=>row.textCount>0&&Math.abs(row.width-row.viewWidth)<=1&&Math.abs(row.scale-1)<.01);},'legacy chart redraw at allocated size');
    await sizingReady();
    receipt.workspace.legacy=await evaluate(cdp,()=>({rows:document.querySelectorAll('#structure-cycles tr').length,paths:document.querySelectorAll('#structure-chart path').length,
      scroller:{height:document.body.clientHeight,scrollHeight:document.body.scrollHeight,overflow:getComputedStyle(document.body).overflowY}}));
    receipt.workspace.legacy.sizing=await evaluate(cdp,readLegacySizing);
    const samePage=await evaluate(cdp,()=>performance.timeOrigin);
    receipt.workspace.legacy.resize=[];
    for(const nextWidth of [width===320?1440:375,width]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:nextWidth,height,deviceScaleFactor:1,mobile:receipt.touch});
      await settled(cdp);await sizingReady();
      const sizing=await evaluate(cdp,readLegacySizing);
      for(const row of sizing)assert.ok(row.minText>=10.9,'Legacy SVG text shrank after viewport resize: '+JSON.stringify(row));
      assert.equal(await evaluate(cdp,()=>performance.timeOrigin),samePage,'Legacy resize must stay on the same document');
      receipt.workspace.legacy.resize.push({width:nextWidth,sizing,samePage:true});
    }
    await evaluate(cdp,()=>{document.body.scrollTop=0;});
    await settled(cdp);
    await inspect('body','legacy-scroll-owner');
    const tableRows=receipt.workspace.legacy.rows;assert.ok(tableRows>0);
    assert.equal(receipt.workspace.legacy.scroller.overflow,'auto','Legacy body must own its long-document scroll');
    assert.ok(Math.abs(receipt.workspace.legacy.scroller.height-height)<=1,'Legacy scroll owner does not fill the viewport');
    assert.ok(receipt.workspace.legacy.scroller.scrollHeight>height,'Legacy document content is unexpectedly clipped');
    await evaluate(cdp,()=>document.querySelector('#structure-method').closest('details').scrollIntoView({block:'center'}));await settled(cdp);
    await click(cdp,'#compare-view details:has(#structure-method) > summary');
    assert.equal(await evaluate(cdp,()=>document.querySelector('#structure-method').closest('details').open),true);
    assert.ok((await bounds(cdp,'#structure-method')).text.length>200,'Legacy method text is missing');
    states.push({label:'legacy-method-open',rows:tableRows});

    await evaluate(cdp,()=>document.querySelector('#legacy-comparison > summary').scrollIntoView({block:'center'}));await settled(cdp);
    if(!await evaluate(cdp,()=>document.querySelector('#legacy-comparison').open))await click(cdp,'#legacy-comparison > summary');
    await evaluate(cdp,()=>document.querySelector('#analysis-tab-forecast').scrollIntoView({block:'center'}));await settled(cdp);
    await click(cdp,'#analysis-tab-forecast');
    await evaluate(cdp,()=>document.querySelector('#forecast-method').closest('details').querySelector('summary').scrollIntoView({block:'center'}));await settled(cdp);
    if(!await evaluate(cdp,()=>document.querySelector('#forecast-method').closest('details').open))await click(cdp,'#forecast-analysis details:has(#forecast-method) > summary');
    await until(()=>evaluate(cdp,()=>document.querySelector('#forecast-method .forecast-sources')?.querySelectorAll('a').length===3),'live forecast sources');
    await evaluate(cdp,()=>document.querySelector('#forecast-method .forecast-sources').scrollIntoView({block:'center',inline:'nearest'}));await settled(cdp);
    const sources=await evaluate(cdp,()=>{
      const block=document.querySelector('#forecast-method .forecast-sources'),cite=block.querySelector('cite');
      return {width:innerWidth,clientWidth:block.clientWidth,scrollWidth:block.scrollWidth,cite:cite?.textContent,citeRendered:Boolean(cite&&cite.getClientRects().length),
        links:[...block.querySelectorAll('a')].map(a=>{const b=a.getBoundingClientRect(),style=getComputedStyle(a),lineHeight=parseFloat(style.lineHeight);
          return {href:a.getAttribute('href'),label:a.textContent.trim(),target:a.target,rel:a.rel,lineHeight,height:b.height,rendered:b.width>0&&b.height>0,left:b.left,right:b.right,top:b.top,bottom:b.bottom};
        })};
    });
    assert.deepEqual(sources.links.map(a=>a.href),['https://docs.coinmetrics.io/network-data/network-data-overview/market/price',expectedBtc.sourceUrl,'https://otexts.com/fpp3/toolbox.html']);
    assert.equal(sources.cite,'Forecasting: Principles and Practice');assert.equal(sources.citeRendered,true);
    assert.ok(sources.scrollWidth<=sources.clientWidth+1,'Source paragraph overflows');
    for(const a of sources.links){assert.ok(a.rendered&&Number.isFinite(a.lineHeight)&&a.height<=a.lineHeight+1,'Source link wraps: '+JSON.stringify(a));
      assert.ok(a.left>=-1&&a.right<=width+1&&a.top>=-1&&a.bottom<=height+1,'Source link is outside viewport');
      assert.equal(a.target,'_blank');assert.ok(a.rel.split(/\s+/).includes('noopener')&&a.rel.split(/\s+/).includes('noreferrer'));}
    receipt.workspace.legacy.sources=sources;
    await inspect('#forecast-method .forecast-sources','legacy-sources',{opaque:false});

    await verifyLegacyMethodReader(api);

    await evaluate(cdp,()=>{document.body.scrollTop=document.body.scrollHeight;});await settled(cdp);
    const end=await evaluate(cdp,()=>({top:document.body.scrollTop,max:document.body.scrollHeight-document.body.clientHeight}));
    assert.ok(end.max>0&&Math.abs(end.top-end.max)<=2,'Legacy document did not reach its real scroll end');
    receipt.workspace.legacy.end=end;
    await inspect('#main > .footer','legacy-footer',{opaque:false});return;
  }
  if(surface==='evidence'){
    await until(()=>evaluate(cdp,()=>document.querySelectorAll('#evidence-body [data-evidence-detail]').length>0),'research rows ready');
    await inspect('#evidence-view','research-list',{opaque:false});
    const density=await evaluate(cdp,()=>{
      const view=document.querySelector('#evidence-view'),controls=view.querySelector('.evidence-controls'),shell=view.querySelector('.evidence-table-shell'),rect=shell.getBoundingClientRect();
      const rows=[...view.querySelectorAll('#evidence-body tr')].filter(row=>{const r=row.getBoundingClientRect();return r.height>0&&r.top>=rect.top&&r.bottom<=rect.bottom+1;});
      return {controlsHeight:controls.getBoundingClientRect().height,tableHeight:rect.height,rowsInView:rows.length,gridRows:getComputedStyle(view).gridTemplateRows};
    });
    assert.ok(density.controlsHeight<=112,'Research filters consume the reading viewport');
    assert.ok(density.tableHeight>=height*.6&&density.rowsInView>=6,'Research viewport must retain useful list density');
    receipt.workspace.density=density;

    await text('#evidence-search','__atlas_no_matching_research__');
    assert.ok((await bounds(cdp,'#evidence-body')).text.includes('일치하는 자료가 없습니다'));
    assert.ok((await evaluate(cdp,()=>location.search)).includes('research-q='));
    await inspect('#evidence-view','research-empty',{opaque:false});
    for(const id of ['evidence-asset','evidence-filter','evidence-clear']){
      await key('Tab','Tab',9);await focused('.evidence-controls');
      assert.equal(await evaluate(cdp,()=>document.activeElement.id),id,'Research filter tab order changed');
    }
    await key('Enter','Enter',13);
    assert.equal(await evaluate(cdp,()=>document.querySelector('#evidence-search').value),'');
    assert.equal(await evaluate(cdp,()=>new URLSearchParams(location.search).has('research-q')),false);
    await click(cdp,'#evidence-body [data-evidence-detail]');
    await inspect('#research-reader','research-reader',{dialog:true});
    const childColors=await evaluate(cdp,()=>{
      const reader=document.querySelector('#research-reader');
      const nav=reader.querySelector('.research-reader-nav'),provenance=reader.querySelector('.research-provenance');
      if(!nav||!provenance)throw new Error('Required research reader regions are missing');
      return [nav,provenance,...reader.querySelectorAll('.research-claim')].slice(0,10).map(n=>({class:n.className,background:getComputedStyle(n).backgroundColor}));
    });
    for(const c of childColors)if(c.background!=='rgba(0, 0, 0, 0)')dark(c.background,c.class);
    receipt.workspace.readerColors=childColors;
    await evaluate(cdp,()=>{const body=document.querySelector('.research-reader-scroll');body.scrollTop=body.scrollHeight;});await settled(cdp);
    const readerScroll=await evaluate(cdp,()=>{const body=document.querySelector('#research-reader .research-reader-scroll');return {top:body.scrollTop,max:body.scrollHeight-body.clientHeight};});
    assert.ok(Math.abs(readerScroll.top-readerScroll.max)<=2,'Research reader did not reach scroll end');receipt.workspace.readerScroll=readerScroll;
    await click(cdp,'[data-reader-action="close"]');
    assert.equal(await evaluate(cdp,()=>document.querySelector('#research-reader').open),false);
    assert.equal(await evaluate(cdp,()=>document.activeElement===document.querySelector('#evidence-body [data-evidence-detail]')),true,'Closing a research article must return to its source action');

    // A short viewport removes the last source row while its article is open.
    // Exercise native resize/Escape, then require the same article AND action
    // to be restored. A focus call on the old detached node cannot pass this.
    const resizeReturns=[];
    for(const action of ['title','grade']){
      const selector=`#evidence-body tr:last-child .evidence-${action} [data-evidence-detail]`;
      const before=await evaluate(cdp,selector=>({
        id:document.querySelector(selector).dataset.evidenceDetail,
        filter:{query:document.querySelector('#evidence-search').value,asset:document.querySelector('#evidence-asset').value,category:document.querySelector('#evidence-filter').value},
        rows:document.querySelectorAll('#evidence-body tr').length,
      }),selector);
      await click(cdp,selector);
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:430,deviceScaleFactor:1,mobile:receipt.touch});
      await settled(cdp);
      await until(()=>evaluate(cdp,id=>document.querySelector('#research-reader').open&&
        ![...document.querySelectorAll('#evidence-body [data-evidence-detail]')].some(node=>node.dataset.evidenceDetail===id),before.id),'resize actually removes the invoking research row');
      await key('Escape','Escape',27);
      await until(()=>evaluate(cdp,(id,action)=>!document.querySelector('#research-reader').open&&
        document.activeElement?.dataset.evidenceDetail===id&&Boolean(document.activeElement.closest('.evidence-'+action)),before.id,action),'research close restores the current equivalent action');
      const returned=await evaluate(cdp,()=>({
        id:document.activeElement.dataset.evidenceDetail,
        filter:{query:document.querySelector('#evidence-search').value,asset:document.querySelector('#evidence-asset').value,category:document.querySelector('#evidence-filter').value},
        progress:document.querySelector('#evidence-progress').textContent,
        rowIds:[...document.querySelectorAll('#evidence-body tr')].map(node=>node.dataset.evidenceId),
      }));
      assert.deepEqual(returned.filter,before.filter,'Returning to an article must not reset research filters');
      assert.ok(returned.rowIds.includes(before.id),'The restored source article must be in the visible page');
      await focused('#evidence-body');
      await screenshot(cdp,`${page}-${width}x${height}-research-resize-${action}.png`,receipt);
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:receipt.touch});
      await settled(cdp);
      await until(()=>evaluate(cdp,(id,action,shortRows)=>document.querySelectorAll('#evidence-body tr').length>shortRows&&
        document.activeElement?.dataset.evidenceDetail===id&&Boolean(document.activeElement.closest('.evidence-'+action)),before.id,action,returned.rowIds.length),'a subsequent list render retains the restored keyboard focus');
      await focused('#evidence-body');
      resizeReturns.push({action,before,returned,restoredViewport:{width,height}});
    }
    receipt.workspace.researchResizeReturns=resizeReturns;
    if(width<=620){
      const returnSelector=await evaluate(cdp,()=>document.body.dataset.shell==='dashboard'?'.atlas-sidebar .atlas-brand[data-view="outlook"]':'#evidence-back');
      await click(cdp,returnSelector);
      await until(()=>evaluate(cdp,()=>document.body.dataset.page==='outlook'&&document.querySelectorAll('#lab-chart path').length>0),'mobile research back to chart');
      receipt.workspace.mobileReturn={selector:returnSelector,actualChart:true};
    }
    return;
  }
  await until(()=>evaluate(cdp,()=>document.querySelectorAll('#lab-chart path').length>0&&document.querySelector('#workbench-workspace')),'BTC workbench ready');
  await inspect('.atlas-canvas-heading','btc-toolbar');
  const geometry=await evaluate(cdp,()=>{
    const chart=document.querySelector('#lab-chart'),b=chart.getBoundingClientRect(),stage=document.querySelector('.atlas-workbench').getBoundingClientRect();
    return {paths:chart.querySelectorAll('path').length,invalidPaths:[...chart.querySelectorAll('path')].filter(p=>/NaN|Infinity/.test(p.getAttribute('d')||'')).length,
      width:b.width,height:b.height,stageBottom:stage.bottom,viewportHeight:innerHeight,bodyPage:document.body.dataset.page};
  });
  assert.ok(geometry.width>=200&&geometry.height>=80,'BTC price canvas compressed');assert.equal(geometry.invalidPaths,0);assert.equal(geometry.bodyPage,'outlook');
  receipt.workspace.geometry=geometry;
  await click(cdp,'.workbench-symbol');
  await inspect('.symbol-search-dialog','symbols',{dialog:true});
  // Native combobox keyboard movement must keep the aria-selected row visible.
  for(let i=0;i<3;i++)await key('ArrowDown','ArrowDown',40);
  const option=await evaluate(cdp,()=>{
    const list=document.querySelector('#symbol-search-results'),selected=list.querySelector('[aria-selected="true"]');
    const b=selected.getBoundingClientRect(),p=list.getBoundingClientRect(),dialog=list.closest('dialog'),d=dialog.getBoundingClientRect();
    return {symbol:selected.dataset.symbol,top:b.top,bottom:b.bottom,
      clientTop:Math.max(0,p.top+list.clientTop,d.top+dialog.clientTop),
      clientBottom:Math.min(innerHeight,p.top+list.clientTop+list.clientHeight,d.top+dialog.clientTop+dialog.clientHeight),
      scrollTop:dialog.scrollTop};
  });
  assert.ok(option.top>=option.clientTop-1&&option.bottom<=option.clientBottom+1,'Selected symbol is outside its scrollport');
  receipt.workspace.symbolSelection=option;
  await key('Tab','Tab',9);await focused('.symbol-search-dialog');await escape('.symbol-search-dialog');
  await command('__atlas_no_matching_command__',{empty:true});
  const candleSettingsCheck=page==='workspace-btc'&&width===1440;
  const originalChartType=candleSettingsCheck?await evaluate(cdp,()=>document.querySelector('#lab-chart').dataset.chartType):null;
  if(candleSettingsCheck&&originalChartType!=='candles')await click(cdp,'#workbench-chart-type');
  if(candleSettingsCheck)await until(()=>evaluate(cdp,()=>document.querySelector('#lab-chart').dataset.chartType==='candles'&&Number(document.querySelector('#lab-chart').dataset.observedCandleCount)>0),'BTC observed candles before opening settings');
  await command('차트 설정');
  await inspect('#chart-reader','settings');
  assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-reader').dataset.kind),'settings');
  const panelBoundary=await evaluate(cdp,()=>{
    const panel=document.querySelector('#chart-reader'),rail=document.querySelector('.workbench-rail');
    const p=panel.getBoundingClientRect(),r=rail.getBoundingClientRect();
    return {panel:p.toJSON(),rail:r.toJSON(),railVisible:rail.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
      overlap:Math.max(0,Math.min(p.right,r.right)-Math.max(p.left,r.left))*Math.max(0,Math.min(p.bottom,r.bottom)-Math.max(p.top,r.top))};
  });
  if(panelBoundary.railVisible)assert.equal(panelBoundary.overlap,0,'Settings panel and right rail must occupy separate areas');
  receipt.workspace.settingsPanelBoundary=panelBoundary;
  if(candleSettingsCheck){
    await until(()=>evaluate(cdp,()=>{const svg=document.querySelector('#lab-chart'),b=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;return Math.abs(b.width-v.width)<=1&&Math.abs(b.height-v.height)<=1;}),'open-settings candle SVG resize');
    const candleSettings=await evaluate(cdp,()=>{
      const svg=document.querySelector('#lab-chart'),b=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;
      const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
      const ticks=[...svg.querySelectorAll('[data-price-axis-label="tick"]')].filter(el=>el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).map(el=>({...box(el),text:el.textContent}));
      const candles=[...svg.querySelectorAll('.observed-candle,.observed-candles-batched')];
      const clips=[...new Set(candles.map(el=>el.closest('[clip-path]')?.getAttribute('clip-path')).filter(Boolean))].map(value=>{
        const id=value.match(/^url\(#(.+)\)$/)?.[1],rect=id&&svg.querySelector(`[id="${id}"] rect`);
        if(!rect)return null;
        const x=Number(rect.getAttribute('x')),y=Number(rect.getAttribute('y')),width=Number(rect.getAttribute('width')),height=Number(rect.getAttribute('height'));
        if(!(width>0&&height>0))return null;
        return {left:b.left+(x-v.x)/v.width*b.width,right:b.left+(x+width-v.x)/v.width*b.width,
          top:b.top+(y-v.y)/v.height*b.height,bottom:b.top+(y+height-v.y)/v.height*b.height};
      });
      return {type:svg.dataset.chartType,count:Number(svg.dataset.observedCandleCount),chart:box(svg),
        plotRight:b.left+(Number(svg.dataset.plotRight)-v.x)/v.width*b.width,ticks,candleNodes:candles.length,clips,
        panel:box(document.querySelector('#chart-reader')),rail:box(document.querySelector('.workbench-rail'))};
    });
    assert.equal(candleSettings.type,'candles');assert.ok(candleSettings.count>0&&candleSettings.candleNodes>0&&candleSettings.ticks.length>0,'Open settings must exercise actual candles and painted price ticks');
    assert.ok(candleSettings.panel.right<=candleSettings.rail.left+1,'The rail overlaps the open candle settings panel');
    assert.ok(candleSettings.clips.length>0&&candleSettings.clips.every(clip=>clip&&clip.right<=candleSettings.plotRight+1),'Candle paint must stop at the measured plot edge while settings is open');
    for(const tick of candleSettings.ticks)assert.ok(tick.left>=candleSettings.plotRight-1&&tick.right<=candleSettings.chart.right+1,'Open candle settings moved price ticks over candles: '+JSON.stringify({tick,plotRight:candleSettings.plotRight,chart:candleSettings.chart}));
    receipt.workspace.candleSettingsBoundary=candleSettings;
    await screenshot(cdp,'workspace-btc-candles-settings-open.png',receipt);
  }
  await key('Escape','Escape',27);
  assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-reader').hidden),true);
  if(candleSettingsCheck&&originalChartType!=='candles'){
    await click(cdp,'#workbench-chart-type');
    await until(()=>evaluate(cdp,type=>document.querySelector('#lab-chart').dataset.chartType===type,originalChartType),'restore BTC chart type after open-settings check');
  }
  await click(cdp,'#atlas-mode-menu');
  await inspect('#indicator-library','indicators',{dialog:true});

  if(height<=600){
    await evaluate(cdp,()=>{const dialog=document.querySelector('#indicator-library');dialog.scrollTop=dialog.scrollHeight-dialog.clientHeight;});await settled(cdp);
    const scrolled=await evaluate(cdp,()=>{
      const dialog=document.querySelector('#indicator-library'),head=dialog.querySelector('.indicator-library-heading'),close=head.querySelector('button');
      const rect=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
      const d=rect(dialog),c=rect(close),clip={left:Math.max(0,d.left+dialog.clientLeft),right:Math.min(innerWidth,d.left+dialog.clientLeft+dialog.clientWidth),top:Math.max(0,d.top+dialog.clientTop),bottom:Math.min(innerHeight,d.top+dialog.clientTop+dialog.clientHeight)};
      const hit=document.elementFromPoint((c.left+c.right)/2,(c.top+c.bottom)/2);
      return {scrollTop:dialog.scrollTop,maxScroll:dialog.scrollHeight-dialog.clientHeight,results:dialog.querySelectorAll('[data-library-indicator]').length,position:getComputedStyle(head).position,clip,title:rect(head.querySelector('h2')),close:c,closeTopmost:Boolean(hit&&(hit===close||close.contains(hit)))};
    });
    assert.ok(scrolled.results>0&&scrolled.maxScroll>0,'Short library must exercise a populated scrolling dialog');
    assert.ok(scrolled.scrollTop>0&&Math.abs(scrolled.scrollTop-scrolled.maxScroll)<=2);assert.equal(scrolled.position,'sticky');
    for(const name of ['title','close']){const b=scrolled[name],c=scrolled.clip;assert.ok(b.left>=c.left-1&&b.right<=c.right+1&&b.top>=c.top-1&&b.bottom<=c.bottom+1,'Scrolled heading clips '+name);}
    assert.equal(scrolled.closeTopmost,true);receipt.workspace.indicatorScroll=scrolled;
    await screenshot(cdp,page+'-'+width+'x'+height+'-indicators-scroll-end.png',receipt);
    const closeSelector='#indicator-library .indicator-library-heading > button';
    await evaluate(cdp,()=>document.querySelector('#indicator-search').focus());
    let closeFocused=false;
    for(let step=0;step<16;step++){await key('Tab','Tab',9,8);closeFocused=await evaluate(cdp,s=>document.activeElement===document.querySelector(s),closeSelector);if(closeFocused)break;}
    assert.equal(closeFocused,true,'Native reverse Tab never reached indicator close');
    await focused(closeSelector);await key('Enter','Enter',13);
    assert.equal(await evaluate(cdp,()=>document.querySelector('#indicator-library').open),false);
    receipt.workspace.indicatorClosedOwnership=await verifyHeaderOwnership();
    await click(cdp,'#atlas-mode-menu');await until(()=>evaluate(cdp,()=>document.querySelector('#indicator-library').open),'indicator library reopened');
  }

  await text('#indicator-search','__atlas_no_matching_indicator__');
  assert.ok((await bounds(cdp,'#indicator-library-results')).text.includes('없'));
  await key('Tab','Tab',9);await focused('#indicator-library');await escape('#indicator-library');
  for(const [query,selector,label,content] of [
    ['저장한 연구 측정','#research-annotations-dialog','annotations-empty','연구 측정'],
    ['날짜로 이동','#chart-go-to-dialog','go-to','UTC'],
    ['원자료·가정·연구 CSV','#chart-export-dialog','export-preview','출처'],
    ['예측 기록과 누적 평가','#forecast-journal','btc-journal','예측']
  ]){
    await command(query);await until(()=>evaluate(cdp,s=>document.querySelector(s)?.open,selector),label+' open');
    if(label==='btc-journal')await until(()=>evaluate(cdp,()=>document.querySelector('#journal-price-chart path')),'BTC preserved journal SVG');
    const box=await inspect(selector,label,{dialog:true});assert.ok(box.text.includes(content),label+' has no expected content');
    if(label==='annotations-empty')assert.ok((await bounds(cdp,'.research-annotations-list')).text.includes('아직 저장한 측정이 없습니다'),'Annotation empty state missing');
    await key('Tab','Tab',9);await focused(selector);await escape(selector);
  }
  const indicatorSurface=await evaluate(cdp,readIndicatorLegendSurface);
  assertIndicatorLegendSurface(indicatorSurface);
  receipt.workspace.indicatorSurface={initial:indicatorSurface,transitions:[]};
  if(!indicatorSurface.mobile){
    await click(cdp,'#indicator-legend-toggle');
    const pointerState=await evaluate(cdp,readIndicatorLegendSurface);assertIndicatorLegendSurface(pointerState);
    assert.equal(pointerState.collapsed,!indicatorSurface.collapsed,'Pointer action did not toggle the indicator list');
    receipt.workspace.indicatorSurface.transitions.push({input:'pointer',...pointerState});
    await key('Tab','Tab',9,8);await key('Tab','Tab',9);await focused('#indicator-legend-toggle');
    await key('Enter','Enter',13);
    const keyboardState=await evaluate(cdp,readIndicatorLegendSurface);assertIndicatorLegendSurface(keyboardState);
    assert.equal(keyboardState.collapsed,indicatorSurface.collapsed,'Keyboard action did not restore the indicator list');
    receipt.workspace.indicatorSurface.transitions.push({input:'keyboard',...keyboardState});
  }
  await screenshot(cdp,page+'-'+width+'x'+height+'-indicator-surface.png',receipt);
  await click(cdp,'#workbench-bottom-more');
  await inspect('#workbench-bottom-menu','bottom-menu');
  await key('End','End',35);await focused('#workbench-bottom-menu');
  await key('Escape','Escape',27);
  assert.equal(await evaluate(cdp,()=>document.querySelector('#workbench-bottom-menu').hidden),true);
  if(page==='workspace-btc'&&width===320&&receipt.touch)await verifyPriceLegendScrollOwnership(api,{touch:true,label:'touch-320x900'});
  if(page==='workspace-btc'&&width===1440){
    receipt.workspace.reportedQaViewports=[];
    try{
      for(const [qaWidth,qaHeight]of [[390,844],[320,740],[390,430]]){
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:qaWidth,height:qaHeight,deviceScaleFactor:1,mobile:receipt.touch});
        await settled(cdp);
        await until(()=>evaluate(cdp,()=>{const svg=document.querySelector('#lab-chart'),b=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;return b.width>0&&b.height>0&&Math.abs(b.width-v.width)<=1&&Math.abs(b.height-v.height)<=1;}),'reported mobile SVG resize',10000);
        await settled(cdp);
        const qa=await evaluate(cdp,()=>{
          const svg=document.querySelector('#lab-chart'),b=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;
          const rect=el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,text:el.textContent.trim().slice(0,120),left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
          const painted=(selector,owner=svg)=>[...owner.querySelectorAll(selector)].filter(el=>el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&el.getBoundingClientRect().width>0);
          const boxes=(selector,owner=svg)=>painted(selector,owner).map(rect);
          const plot={left:b.left+(Number(svg.dataset.plotLeft)-v.x)/v.width*b.width,right:b.left+(Number(svg.dataset.plotRight)-v.x)/v.width*b.width,
            top:b.top+(Number(svg.dataset.plotTop)-v.y)/v.height*b.height,bottom:b.top+(Number(svg.dataset.priceBottom)-v.y)/v.height*b.height};
          const evidence=painted('.forecast-evidence-layer [data-forecast-evidence] > circle,.forecast-evidence-layer [data-forecast-evidence] > rect,.forecast-evidence-layer [data-forecast-evidence] > text').flatMap(el=>{
            const r=rect(el),style=getComputedStyle(el),stroke=style.stroke==='none'?0:(parseFloat(style.strokeWidth)||0)/2;
            const clipped={...r,left:Math.max(plot.left,r.left-stroke*b.width/v.width),right:Math.min(plot.right,r.right+stroke*b.width/v.width),
              top:Math.max(plot.top,r.top-stroke*b.height/v.height),bottom:Math.min(plot.bottom,r.bottom+stroke*b.height/v.height)};
            return clipped.right>clipped.left&&clipped.bottom>clipped.top?[clipped]:[];
          });
          const cycleTags=boxes('.cycle-marker-label-bg'),historyTags=boxes('.history-event-marker.has-label > rect');
          const headers=boxes('#lab-metrics,.workbench-market-info',svg.parentElement),badges=boxes('.chart-latest-price-tag > rect,.cross-price-tag > rect');
          const obstacles=[...cycleTags,...historyTags,...evidence,...headers,...badges],periodPaint=[],strokeCollisions=[];
          for(const el of svg.querySelectorAll('.cycle-interval-line,.cycle-interval-cap,.cycle-interval-continuation,.cycle-interval-end-arrow')){
            if(strokeCollisions.length>20)break;
            if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
            const length=el.getTotalLength();if(!(length>0))continue;
            const matrix=el.getScreenCTM(),style=getComputedStyle(el),radius=(parseFloat(style.strokeWidth)||0)/2*Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d));
            const count=Math.max(1,Math.ceil(length*2)),interval=el.closest('[data-cycle-interval]').dataset.cycleInterval;
            periodPaint.push({interval,class:el.getAttribute('class'),bounds:rect(el),samples:count+1});
            for(let index=0;index<=count;index++){
              const point=el.getPointAtLength(length*index/count).matrixTransform(matrix);
              const sample={left:Math.max(plot.left,point.x-radius),right:Math.min(plot.right,point.x+radius),top:Math.max(plot.top,point.y-radius),bottom:Math.min(plot.bottom,point.y+radius)};
              for(const obstacle of obstacles)if(Math.min(sample.right,obstacle.right)-Math.max(sample.left,obstacle.left)>.1&&Math.min(sample.bottom,obstacle.bottom)-Math.max(sample.top,obstacle.top)>.1){
                strokeCollisions.push({interval,class:el.getAttribute('class'),point:{x:point.x,y:point.y},sample,obstacle});break;
              }
              if(strokeCollisions.length>20)break;
            }
          }
          return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,
            chart:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,viewWidth:v.width,viewHeight:v.height},
            plotRight:b.left+(Number(svg.dataset.plotRight)-v.x)/v.width*b.width,
            events:boxes('.history-event-marker.has-label > text'),periods:boxes('.cycle-interval-label'),
            evidence,cycleTags,historyTags,periodPaint,strokeCollisions,headers,
            ticks:boxes('[data-price-axis-label="tick"]'),badges,
            dates:boxes('.cross-date-tag > rect'),timeTicks:boxes('.price-time-label,.market-time-label')};
        });
        const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        assert.equal(qa.width,qaWidth);assert.equal(qa.height,qaHeight);assert.ok(qa.pageWidth<=qaWidth+1,'Reported mobile viewport acquired horizontal overflow');
        assert.ok(Math.abs(qa.chart.width-qa.chart.viewWidth)<=1&&Math.abs(qa.chart.height-qa.chart.viewHeight)<=1,'Reported mobile SVG must remain pixel-sized');
        for(const event of qa.events)for(const period of qa.periods)assert.ok(!overlaps(event,period),'Historical label covers period comparison: '+JSON.stringify({qaWidth,qaHeight,event,period}));
        assert.ok(qa.headers.length===2&&qa.ticks.length>0,'Source/quote headers and actual price ticks must be present');
        assert.ok(qa.evidence.length>=4&&qa.periods.length>0,'Model evidence and visible period labels must be present for the collision check');
        assert.ok(qa.cycleTags.length>0&&qa.periodPaint.length>0,'Cycle tags and visible period strokes must be present for the collision check');
        assert.deepEqual(qa.strokeCollisions,[],'A period line or arrow crosses a cycle/history/evidence tag, HUD or price badge: '+JSON.stringify({qaWidth,qaHeight,collisions:qa.strokeCollisions}));
        for(const evidence of qa.evidence)for(const period of qa.periods)assert.ok(!overlaps(evidence,period),'Model evidence control covers period text: '+JSON.stringify({qaWidth,qaHeight,evidence,period}));
        for(const tick of qa.ticks){
          assert.ok(tick.left>=qa.plotRight-1&&tick.right<=qa.chart.right+1,'Price tick escapes its reserved axis gutter: '+JSON.stringify({qaWidth,qaHeight,tick,plotRight:qa.plotRight}));
          for(const header of qa.headers)assert.ok(!overlaps(tick,header),'Quote/source header covers a visible price tick: '+JSON.stringify({qaWidth,qaHeight,tick,header}));
          for(const badge of qa.badges)assert.ok(!overlaps(tick,badge),'Selected/latest price tag covers a visible price tick');
        }
        for(const date of qa.dates)for(const tick of qa.timeTicks)assert.ok(!overlaps(date,tick),'Selected date badge covers a normal time tick');
        receipt.workspace.reportedQaViewports.push(qa);
        await screenshot(cdp,`workspace-btc-qa-${qaWidth}x${qaHeight}.png`,receipt);
        if(qaWidth===390&&qaHeight===844)await verifyPriceLegendScrollOwnership(api,{touch:false,label:'wheel-390x844'});
      }
    }finally{
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:receipt.touch});
      await settled(cdp);
      await until(()=>evaluate(cdp,()=>{const svg=document.querySelector('#lab-chart'),b=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;return Math.abs(b.width-v.width)<=1&&Math.abs(b.height-v.height)<=1;}),'restored desktop SVG resize',10000);
    }
  }
}
