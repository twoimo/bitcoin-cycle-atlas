import assert from 'node:assert/strict';

export const workspaceBrowserCases = [320, 1440].flatMap(width =>
  ['btc', 'evidence', 'legacy', 'preview'].map(surface => ({
    page: 'workspace-' + surface, surface, width, height: 900, touch: width === 320,
    route: surface === 'btc' ? '/?symbol=BTCUSD&granularity=daily&type=line' :
      surface === 'evidence' ? '/?page=evidence' : surface === 'legacy' ? '/?page=compare&legacy=1' : '/mobile-preview.html'
  })));
workspaceBrowserCases.push({page:'workspace-btc-short',surface:'btc',width:900,height:430,touch:true,route:'/?symbol=BTCUSD&granularity=daily&type=line'});

export async function verifyWorkspaceSurface(api) {
  const {cdp,receipt,evaluate,until,settled,click,bounds,visibleBounds,dark,screenshot,verifyOfflineRefresh}=api;
  const {width,height,surface,page}=receipt;
  receipt.workspace={surface,states:[]};
  const states=receipt.workspace.states;
  async function key(key,code,number,modifiers=0){
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,modifiers});
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
    const focus=await evaluate(cdp,s=>{
      const container=document.querySelector(s),el=document.activeElement;
      const b=el.getBoundingClientRect(),style=getComputedStyle(el),clip={left:0,right:innerWidth,top:0,bottom:innerHeight};
      for(let parent=el.parentElement;parent;parent=parent.parentElement){
        const p=parent.getBoundingClientRect(),css=getComputedStyle(parent);
        if(css.overflowX!=='visible'){clip.left=Math.max(clip.left,p.left+parent.clientLeft);clip.right=Math.min(clip.right,p.left+parent.clientLeft+parent.clientWidth);}
        if(css.overflowY!=='visible'){clip.top=Math.max(clip.top,p.top+parent.clientTop);clip.bottom=Math.min(clip.bottom,p.top+parent.clientTop+parent.clientHeight);}
      }
      const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
      return {clip,topmost:Boolean(hit&&(hit===el||el.contains(hit))),inside:container.contains(el),tag:el.tagName,label:el.getAttribute('aria-label')||el.textContent.slice(0,80),
        left:b.left,right:b.right,top:b.top,bottom:b.bottom,outline:style.outlineStyle,width:parseFloat(style.outlineWidth),color:style.outlineColor};
    },selector);
    assert.ok(focus.inside,'Keyboard focus escaped '+selector+': '+JSON.stringify(focus));
    assert.ok(focus.left>=-1&&focus.right<=width+1&&focus.top>=-1&&focus.bottom<=height+1,'Focused action is outside viewport: '+JSON.stringify(focus));
    assert.ok(focus.topmost&&focus.left>=focus.clip.left-1&&focus.right<=focus.clip.right+1&&focus.top>=focus.clip.top-1&&focus.bottom<=focus.clip.bottom+1,'Focused action is clipped or occluded: '+JSON.stringify(focus));
    assert.ok(focus.width>=2&&focus.outline!=='none','Keyboard focus lacks common visible ring: '+JSON.stringify(focus));
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
      const state=await evaluate(cdp,value=>{
        const frame=document.querySelector('#mobile-preview'),doc=frame.contentDocument;
        const shell=doc.getElementById('atlas-boot-shell'),status=doc.getElementById('atlas-boot-status'),error=doc.getElementById('atlas-boot-error');
        const rect=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
        const client=el=>{const b=rect(el);return {left:b.left+el.clientLeft,right:b.left+el.clientLeft+el.clientWidth,top:b.top+el.clientTop,bottom:b.top+el.clientTop+el.clientHeight};};
        const intersect=(...boxes)=>({left:Math.max(...boxes.map(b=>b.left)),right:Math.min(...boxes.map(b=>b.right)),top:Math.max(...boxes.map(b=>b.top)),bottom:Math.min(...boxes.map(b=>b.bottom))});
        const rendered=el=>{const css=el.ownerDocument.defaultView.getComputedStyle(el);return el.getClientRects().length>0&&css.display!=='none'&&!['hidden','collapse'].includes(css.visibility)&&Number(css.opacity)>0;};
        let active=null;
        if(value!=='actual'){
          const panel=value==='loading'?status:error,canvas=panel.closest('.atlas-boot-canvas'),main=document.querySelector('main');
          if(!canvas||!main)throw new Error('Preview clipping containers are missing');
          const local=intersect(rect(panel),client(canvas),{left:0,right:frame.contentWindow.innerWidth,top:0,bottom:frame.contentWindow.innerHeight});
          const f=client(frame),visible=intersect({left:f.left+local.left,right:f.left+local.right,top:f.top+local.top,bottom:f.top+local.bottom},f,client(main),{left:0,right:innerWidth,top:0,bottom:innerHeight});
          active={id:panel.id,rendered:[panel,canvas,shell,frame,main].every(rendered),local,visible,
            visibleWidth:Math.max(0,visible.right-visible.left),visibleHeight:Math.max(0,visible.bottom-visible.top)};
        }
        return {mode:value,boot:doc.documentElement?.dataset.boot,shellHidden:shell.hidden,
          statusHidden:status.hidden,errorHidden:error.hidden,active,caption:document.getElementById('preview-caption').textContent};
      },mode);
      if(mode==='actual')assert.equal(state.shellHidden,true);
      else {
        assert.equal(state.shellHidden,false);
        assert.equal(state.statusHidden,mode==='error');
        assert.equal(state.errorHidden,mode!=='error');
        assert.ok(state.caption.includes('실제 로딩 시간'));
        assert.ok(state.active.rendered&&state.active.visibleWidth>0&&state.active.visibleHeight>0,
          'Preview active boot panel is not visible: '+JSON.stringify(state.active));
      }
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
  await verifyOfflineRefresh({phase:'workspace-initial-document'});
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
    await click(cdp,'#evidence-clear');
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
    if(width<=620){
      await click(cdp,'#evidence-back');
      await until(()=>evaluate(cdp,()=>document.body.dataset.page==='outlook'&&document.querySelectorAll('#lab-chart path').length>0),'mobile research back to chart');
      receipt.workspace.mobileReturn=true;
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
  await command('차트 설정');
  await inspect('#chart-reader','settings');
  assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-reader').dataset.kind),'settings');
  await key('Escape','Escape',27);
  assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-reader').hidden),true);
  await click(cdp,'#atlas-mode-menu');
  await inspect('#indicator-library','indicators',{dialog:true});
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
  const indicatorSurface=await evaluate(cdp,()=>{
    const manager=document.querySelector('#chart-indicator-manager'),list=manager.querySelector('.chart-indicator-list'),b=manager.getBoundingClientRect();
    return {background:getComputedStyle(manager).backgroundColor,listBackground:getComputedStyle(list).backgroundColor,collapsed:manager.dataset.collapsed,left:b.left,top:b.top,width:b.width,height:b.height};
  });
  dark(indicatorSurface.background,'indicator list owned surface');
  assert.ok(!indicatorSurface.background.startsWith('rgba(')||indicatorSurface.background.endsWith(', 1)'),'Chart event labels must not show through the indicator surface');
  receipt.workspace.indicatorSurface=indicatorSurface;
  await click(cdp,'#workbench-bottom-more');
  await inspect('#workbench-bottom-menu','bottom-menu');
  await key('End','End',35);await focused('#workbench-bottom-menu');
  await key('Escape','Escape',27);
  assert.equal(await evaluate(cdp,()=>document.querySelector('#workbench-bottom-menu').hidden),true);
}
