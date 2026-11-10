import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readNativeInteractiveTarget } from './verify-workspace-browser.mjs';
import { verifyChartZoomBrowser } from './verify-chart-zoom-browser.mjs';

// Match scripts/build-pages.mjs and the public GitHub Pages project root.
export const consolidatedPagesBase = '/bitcoin-cycle-atlas/';
export const consolidatedWorkspaceCases = [320, 390, 1440].map(width => ({
  page: 'workspace-consolidated', width, height: width === 390 ? 844 : 900,
  touch: width <= 390, route: `${consolidatedPagesBase}market-lab/us/`, consolidated: true,
}));

// Parent-owned portals retain their original observed values and units. Measure
// text ranges against the button's own padding clip, not the horizontally
// scrollable header viewport: an offscreen control can still be reached by pan.
export function readConsolidatedObservationGeometry(unit) {
  const frame=document.querySelector('.atlas-center-frame:not([hidden])');
  const host=frame&&document.getElementById(frame.dataset.toolbarId);
  const rect=box=>({left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height});
  const textRange=node=>{
    const range=document.createRange();range.selectNodeContents(node);
    return {text:node.textContent,box:rect(range.getBoundingClientRect())};
  };
  return {buttons:[...host?.querySelectorAll('[data-toolbar-open$="-observation"]')||[]].filter(button=>button.checkVisibility()).map(button=>{
    const box=button.getBoundingClientRect(),style=getComputedStyle(button),summary=button.querySelector('.compact-toolbar-summary');
    const left=box.left+parseFloat(style.borderLeftWidth),right=box.right-parseFloat(style.borderRightWidth);
    const top=box.top+parseFloat(style.borderTopWidth),bottom=box.bottom-parseFloat(style.borderBottomWidth);
    const glyphs=[];
    if(summary){
      const walker=document.createTreeWalker(summary,NodeFilter.SHOW_TEXT);
      while(walker.nextNode())if(walker.currentNode.textContent.trim())glyphs.push(textRange(walker.currentNode));
    }
    return {name:button.dataset.toolbarOpen,box:rect(box),clip:{left,right,top,bottom,width:right-left,height:bottom-top},
      visible:button.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),disabled:button.disabled,
      overflow:{x:style.overflowX,y:style.overflowY},summary:summary?{...textRange(summary),glyphs}:null,
      units:[...summary?.querySelectorAll('span')||[]].filter(node=>node.textContent.trim()===unit).map(textRange)};
  })};
}

export function assertConsolidatedObservationGeometry(result,symbol,unit) {
  assert.equal(result.buttons.length,1,symbol+': one active observed-value toolbar button');
  const button=result.buttons[0],clip=button.clip;
  const valid=box=>box&&Object.values(box).every(Number.isFinite)&&box.width>0&&box.height>0;
  assert.ok(button.visible&&!button.disabled&&valid(clip),symbol+': observed-value button must remain available');
  assert.ok(button.summary?.glyphs.length>0,symbol+': observed-value summary retains actual text');
  assert.equal(button.units.length,1,symbol+': observation retains one original source unit '+unit);
  assert.equal(button.units[0].text.trim(),unit,symbol+': observation retains the original source unit');
  for(const [kind,value]of [['summary',button.summary],...button.summary.glyphs.map(glyph=>['text',glyph]),['unit',button.units[0]]]){
    const box=value.box;
    assert.ok(valid(box)&&box.left>=clip.left-.5&&box.right<=clip.right+.5&&box.top>=clip.top-.5&&box.bottom<=clip.bottom+.5,
      symbol+': observation '+kind+' glyphs must fit their own button clip: '+JSON.stringify({text:value.text,box,clip}));
  }
}

// The two-row perimeter survives a center-workspace switch. Only an active
// chart toolbar owns the disclosure; market/data toolbars occupy row two directly.
export function readConsolidatedToolbarOwnership() {
  const frame=document.querySelector('.atlas-center-frame:not([hidden])'),header=document.querySelector('.atlas-canvas-heading');
  const host=frame&&document.getElementById(frame.dataset.toolbarId),panel=document.querySelector('#atlas-shell-features-panel');
  const read=node=>{if(!node)return null;const r=node.getBoundingClientRect();let displayNoneOwner=null;
    for(let owner=node;owner;owner=owner.parentElement)if(getComputedStyle(owner).display==='none'){
      displayNoneOwner={tag:owner.tagName,id:owner.id||null,className:typeof owner.className==='string'?owner.className:null,display:'none'};break;
    }
    return {rect:{top:r.top,bottom:r.bottom,height:r.height},display:getComputedStyle(node).display,displayNoneOwner,
      visible:node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),hidden:Boolean(node.closest('[hidden]')),inert:Boolean(node.closest('[inert]')),disabled:Boolean(node.disabled)};};
  return {twoRow:header?.dataset.mobileHeading==='two-row',chartControls:document.body.dataset.chartControls||null,
    center:document.body.dataset.centerTool||null,activeHost:frame?.dataset.toolbarId||null,hostId:host?.id||null,
    hostInPanel:Boolean(host?.closest('.shell-feature-panel')),hostInHeader:host?.parentElement===header,
    header:read(header),host:read(host),panel:read(panel),feature:read(header?.querySelector('.shell-instrument-slot')),
    toggle:read(document.querySelector('#atlas-shell-features-toggle'))};
}

export function consolidatedToolbarUsesDisclosure(ownership,label='workspace') {
  assert.ok(ownership.activeHost&&ownership.hostId===ownership.activeHost&&ownership.host,label+': current iframe retains its actual toolbar owner');
  if(ownership.twoRow){
    assert.equal(ownership.hostInPanel,Boolean(ownership.chartControls),label+': only the active chart toolbar belongs to the feature disclosure');
  }
  return ownership.twoRow&&ownership.hostInPanel;
}

export function assertConsolidatedToolbarOwnership(ownership,label) {
  const disclosure=consolidatedToolbarUsesDisclosure(ownership,label),host=ownership.host;
  assert.ok(host.visible&&!host.hidden&&!host.inert&&host.rect.height>0,label+': active toolbar is visible and interactive');
  if(disclosure){
    assert.ok(ownership.panel?.visible&&!ownership.panel.hidden&&!ownership.panel.inert,label+': active chart disclosure is open and interactive');
    assert.ok(ownership.toggle?.visible&&!ownership.toggle.inert&&!ownership.toggle.disabled,label+': active chart disclosure retains its reachable trigger');
  }else if(ownership.twoRow){
    assert.ok(ownership.hostInHeader,label+': nonchart toolbar remains a direct header child');
    assert.ok(Math.abs(host.rect.height-44)<=1&&host.rect.top>=ownership.header.rect.top+44-1&&host.rect.bottom<=ownership.header.rect.bottom+1,
      label+': nonchart toolbar occupies the second 44px row');
    assert.ok(ownership.panel?.hidden&&!ownership.panel.visible,label+': retained chart disclosure stays closed in a nonchart center');
    assert.ok(ownership.feature&&!ownership.feature.visible&&(ownership.feature.inert||ownership.feature.hidden||ownership.feature.displayNoneOwner?.display==='none'),label+': previous chart feature controls remain hidden and protected');
    assert.ok(ownership.toggle&&!ownership.toggle.visible&&(ownership.toggle.inert||ownership.toggle.hidden||ownership.toggle.disabled||ownership.toggle.displayNoneOwner?.display==='none'),label+': previous chart trigger remains hidden and protected');
  }
}

// After cd53cad the chart tab owns a single in-flow body and draws its trading
// criteria inside the chart canvas; the position HUD lives in the details dialog.
// Read that actual ownership, not a former sibling row above the body.
const layoutTolerance=1;
const validRect=r=>r&&['left','right','top','bottom','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
const insideRect=(r,owner)=>validRect(r)&&validRect(owner)&&r.left>=owner.left-layoutTolerance&&r.right<=owner.right+layoutTolerance&&r.top>=owner.top-layoutTolerance&&r.bottom<=owner.bottom+layoutTolerance;

export function readConsolidatedChartAllocation() {
  const frame=document.querySelector('.atlas-center-frame:not([hidden])'),doc=frame?.contentDocument;
  const svg=doc?.querySelector('.rsi-chart-canvas svg'),canvas=svg?.closest('.rsi-chart-canvas');
  const workbench=canvas?.closest('.rsi-workbench'),body=canvas?.closest('.rsi-workbench-body');
  const criteria=canvas?.querySelector(':scope > .rsi-trading-criteria');
  const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const pixels=value=>Number.parseFloat(value)||0;
  const measured=node=>{
    if(!node)return null;
    const r=rect(node),style=node.ownerDocument.defaultView.getComputedStyle(node);
    const content={left:r.left+pixels(style.borderLeftWidth)+pixels(style.paddingLeft),right:r.right-pixels(style.borderRightWidth)-pixels(style.paddingRight),
      top:r.top+pixels(style.borderTopWidth)+pixels(style.paddingTop),bottom:r.bottom-pixels(style.borderBottomWidth)-pixels(style.paddingBottom)};
    return {rect:r,content:{...content,width:content.right-content.left,height:content.bottom-content.top},
      visible:node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),marginTop:pixels(style.marginTop),marginBottom:pixels(style.marginBottom)};
  };
  const style=workbench&&doc.defaultView.getComputedStyle(workbench);
  return {frame:{source:frame?.src,documentUrl:doc?.URL,parentUrl:document.URL,rect:rect(frame)},viewport:{width:doc?.defaultView.innerWidth,height:doc?.defaultView.innerHeight},
    owners:{activeWindow:doc?.defaultView.frameElement===frame,svgInActiveFrame:svg?.ownerDocument===doc,canvasOwnsSvg:svg?.parentElement===canvas,bodyOwnsCanvas:canvas?.parentElement===body,criteriaSharesCanvas:criteria?.parentElement===canvas},
    svg:measured(svg),canvas:measured(canvas),body:measured(body),workbench:measured(workbench),
    flow:{display:style?.display,direction:style?.flexDirection,gap:pixels(style?.rowGap),children:[...workbench?.children||[]].filter(node=>{
      const s=doc.defaultView.getComputedStyle(node);return s.display!=='none'&&!['absolute','fixed'].includes(s.position)&&node.getClientRects().length;
    }).map(node=>({kind:node===body?'body':node.classList?.contains('rsi-trading-criteria')?'criteria':node.matches('.rsi-workbench-status')?'status':'unexpected',...measured(node)}))},
    criteria:criteria?{...measured(criteria),symbol:criteria.dataset.rsiCriteria??null,label:criteria.getAttribute('aria-label'),
      hasPopup:criteria.getAttribute('aria-haspopup'),expanded:criteria.getAttribute('aria-expanded'),collapsed:criteria.getAttribute('data-criteria-collapsed'),
      chip:criteria.querySelector('.rsi-criteria-chip')?{...measured(criteria.querySelector('.rsi-criteria-chip')),text:criteria.querySelector('.rsi-criteria-chip').textContent.trim()}:null,
      fields:[...criteria.querySelectorAll('[data-criteria-field]')].map(node=>({key:node.dataset.criteriaField,text:node.textContent.trim(),...measured(node)}))}:null};
}

export function assertConsolidatedChartAllocation(result,symbol) {
  const label=symbol+': chart fills its allocated work area';
  if(!['TQQQ','SOXL','233740'].includes(symbol)){
    // These instruments have no trading-criteria overlay: preserve the original viewport gate.
    assert.ok(result.svg.visible&&result.svg.height>=result.childHeight*.75,label);
    return;
  }
  const a=result.allocation,tolerance=1;
  const valid=validRect;
  const inside=insideRect;
  const same=(r,owner)=>inside(r,owner)&&['left','right','top','bottom'].every(k=>Math.abs(r[k]-owner[k])<=tolerance);
  assert.ok(a?.criteria&&a.workbench&&a.body&&a.canvas&&a.svg,symbol+': actual in-chart trading criteria and chart allocation must exist');
  const sourceUrl=new URL(a.frame.source),documentUrl=new URL(a.frame.documentUrl),parentUrl=new URL(a.frame.parentUrl);
  assert.ok(documentUrl.origin===sourceUrl.origin&&sourceUrl.origin===parentUrl.origin&&documentUrl.pathname===sourceUrl.pathname&&documentUrl.pathname.startsWith(consolidatedPagesBase),symbol+': allocation retains the active iframe source application');
  assert.ok(['activeWindow','svgInActiveFrame','canvasOwnsSvg','bodyOwnsCanvas','criteriaSharesCanvas'].every(key=>a.owners[key]===true),symbol+': criteria, body, canvas and SVG retain their active-frame owners');
  assert.ok(Math.abs(a.frame.rect.width-a.viewport.width)<=tolerance&&Math.abs(a.frame.rect.height-a.viewport.height)<=tolerance,symbol+': active iframe maps to its child viewport 1:1');
  const viewport={left:0,top:0,right:a.viewport.width,bottom:a.viewport.height,width:a.viewport.width,height:a.viewport.height};
  assert.ok(a.workbench.visible&&same(a.workbench.rect,viewport),symbol+': workbench fills the active child viewport');
  assert.equal(a.flow.display,'flex',symbol+': the chart body uses the actual flex allocation');
  assert.equal(a.flow.direction,'column',symbol+': the chart body stacks in its real direction');
  assert.ok(Number.isFinite(a.flow.gap)&&a.flow.gap>=0,symbol+': declared row gap is finite');
  const rows=a.flow.children,index=rows.findIndex(row=>row.kind==='body');
  assert.equal(rows.filter(row=>row.kind==='body').length,1,symbol+': one allocated chart body');
  // The criteria overlay is painted inside the canvas, so it must not claim an
  // in-flow row. Any additional row would be the blank space this gate rejects.
  assert.equal(rows.filter(row=>row.kind==='criteria').length,0,symbol+': in-chart criteria must not claim an in-flow row');
  assert.ok(rows.every(row=>['body','status'].includes(row.kind)),symbol+': no unexplained in-flow spacer consumes chart height');
  for(const row of rows)assert.ok(row.visible&&inside(row.rect,a.workbench.content)&&Number.isFinite(row.marginTop)&&Number.isFinite(row.marginBottom),symbol+': visible flow rows stay inside the workbench');
  const extent=row=>row.rect.height+row.marginTop+row.marginBottom;
  const top=a.workbench.content.top+rows.slice(0,index).reduce((sum,row)=>sum+extent(row),0)+a.flow.gap*index+rows[index].marginTop;
  const bottom=a.workbench.content.bottom-rows.slice(index+1).reduce((sum,row)=>sum+extent(row),0)-a.flow.gap*(rows.length-index-1)-rows[index].marginBottom;
  const remainingHeight=bottom-top;
  assert.ok(remainingHeight>0&&Math.abs(a.body.rect.top-top)<=tolerance&&Math.abs(a.body.rect.bottom-bottom)<=tolerance,
    symbol+': chart body fills all remaining height after status, margins and gaps: '+JSON.stringify({top,bottom,remainingHeight,body:a.body.rect}));
  assert.ok(a.body.visible&&a.canvas.visible&&same(a.canvas.rect,a.body.content),symbol+': chart canvas fills its allocated body without blank space');
  assert.ok(result.svg.visible&&a.svg.visible&&result.svg.height>=a.canvas.content.height*.75,label);
  assert.ok(same(a.svg.rect,a.canvas.content),symbol+': SVG stays contained in and fills the actual canvas');
  assert.ok(Math.abs(result.svg.height-a.svg.rect.height)<=tolerance&&Math.abs(result.svg.width-a.svg.rect.width)<=tolerance,symbol+': price-axis and allocation receipts measure the same SVG');
  // cd53cad ownership: the trading criteria is a real overlay child of the chart
  // canvas, painted for this instrument and never escaping the plot it covers.
  assert.equal(a.criteria.symbol,symbol,symbol+': criteria overlay retains its selected instrument owner');
  assert.equal(a.criteria.hasPopup,'dialog',symbol+': criteria overlay declares its details dialog');
  assert.ok(a.criteria.visible&&valid(a.criteria.rect)&&a.criteria.rect.width>0&&a.criteria.rect.height>0,symbol+': criteria overlay is painted');
  assert.ok(inside(a.criteria.rect,a.canvas.content),symbol+': criteria overlay stays inside the chart canvas it covers');
  assert.ok(['true','false'].includes(a.criteria.collapsed),symbol+': criteria declares its responsive layout');
  if(a.criteria.collapsed==='true'){
    assert.equal(a.criteria.fields.length,0,symbol+': collapsed criteria uses its dedicated chip, not clipped rows');
    assert.ok(a.criteria.chip?.text&&a.criteria.chip.visible&&inside(a.criteria.chip.rect,a.criteria.rect),symbol+': collapsed criteria retains a readable contained trigger');
  }else{
    assert.deepEqual(a.criteria.fields.map(field=>field.key).sort(),['buy','criteria','current','neutral','sell','strong','win-rate'].sort(),
      symbol+': every trading-criteria row remains present');
    for(const field of a.criteria.fields)assert.ok(field.text&&field.visible&&inside(field.rect,a.criteria.rect),symbol+': criteria row remains visible and contained: '+field.key);
  }
}

// Read the details dialog and the position HUD it now owns, whichever document
// the hosted toolbar portal placed it in.
export function readSimulationDetailsState() {
  const frame=document.querySelector('.atlas-center-frame:not([hidden])'),doc=frame?.contentDocument;
  const owners=[doc,document].filter(Boolean);
  const dialog=owners.map(owner=>owner.querySelector('dialog.rsi-detail-dialog[open]')).find(Boolean)||null;
  const hud=dialog?.querySelector('.rsi-simulation-hud')||null;
  const body=dialog?.querySelector('.rsi-detail-body')||null;
  const criteria=(doc||document).querySelector('.rsi-trading-criteria');
  const criteriaDetails=dialog?.querySelector('.rsi-criteria-details'),criteriaList=criteriaDetails?.querySelector('dl');
  const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const pixels=value=>Number.parseFloat(value)||0;
  const measured=node=>{
    if(!node)return null;
    const r=rect(node),style=node.ownerDocument.defaultView.getComputedStyle(node);
    const content={left:r.left+pixels(style.borderLeftWidth)+pixels(style.paddingLeft),right:r.right-pixels(style.borderRightWidth)-pixels(style.paddingRight),
      top:r.top+pixels(style.borderTopWidth)+pixels(style.paddingTop),bottom:r.bottom-pixels(style.borderBottomWidth)-pixels(style.paddingBottom)};
    return {rect:r,content:{...content,width:content.right-content.left,height:content.bottom-content.top},
      visible:node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})};
  };
  // Overflow clips at the scrollport padding box, not the inner content box.
  // Keep both measurements and also intersect with the owning visual viewport.
  const scrollport=()=>{if(!body)return null;const r=body.getBoundingClientRect(),d=dialog.getBoundingClientRect(),win=body.ownerDocument.defaultView;
    const left=Math.max(0,d.left,r.left+body.clientLeft),top=Math.max(0,d.top,r.top+body.clientTop),right=Math.min(win.innerWidth,d.right,r.left+body.clientLeft+body.clientWidth),bottom=Math.min(win.innerHeight,d.bottom,r.top+body.clientTop+body.clientHeight);
    return {left,top,right,bottom,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};};
  return {owner:dialog?.ownerDocument===document?'parent':'child',
    dialog:dialog?{...measured(dialog),body:measured(body),scrollport:scrollport(),open:Boolean(dialog.open),name:dialog.dataset.rsiDialog??null,label:dialog.getAttribute('aria-label')}:null,
    criteria:criteriaList?{...measured(criteriaList),label:criteriaDetails.getAttribute('aria-label'),fields:[...criteriaList.querySelectorAll('[data-criteria-detail]')].map(node=>({key:node.dataset.criteriaDetail,text:node.textContent.trim(),...measured(node)}))}:null,
    hud:hud?{...measured(hud),label:hud.getAttribute('aria-label'),
      fields:[...hud.querySelectorAll('[data-rsi-hud]')].map(node=>({key:node.dataset.rsiHud,text:node.textContent.trim(),...measured(node)}))}:null,
    criteriaExpanded:criteria?.getAttribute('aria-expanded')??null};
}

// The details dialog is the confirmed cd53cad home of the position HUD. Closing
// it must return the chart to the exact height it had before the dialog opened.
export function assertSimulationDetailsRoundTrip({symbol,before,opened,after}) {
  const seven=['holdings','quantity','average-cost','current-price','pnl','next-trigger','updated-at'],inside=insideRect;
  const dialog=opened?.dialog;
  assert.ok(dialog?.open,symbol+': details dialog must be open');
  assert.equal(dialog.name,'simulation',symbol+': details dialog identifies the simulation view');
  assert.ok(dialog.visible,symbol+': details dialog is painted');
  assert.equal(opened.criteriaExpanded,'true',symbol+': criteria control reports its expanded details');
  const hud=opened?.hud;
  assert.ok(hud&&hud.visible,symbol+': position HUD must exist inside the opened details');
  assert.equal(hud.label,symbol+' 분할 매매 평단가',symbol+': HUD retains its selected instrument owner');
  assert.deepEqual(hud.fields.map(field=>field.key).sort(),[...seven].sort(),symbol+': all seven HUD fields remain present');
  assert.ok(inside(hud.rect,dialog.scrollport),symbol+': HUD stays inside the details dialog scrollport: '+JSON.stringify({hud:hud.rect,scrollport:dialog.scrollport}));
  assert.equal(opened.criteria?.label,symbol+' 매매 기준과 전체 기간 결과',symbol+': detailed criteria retains its selected instrument owner');
  assert.deepEqual(opened.criteria.fields.map(field=>field.key).sort(),['buy','criteria','current','neutral','sell','strong','win-rate'].sort(),symbol+': all seven detailed criteria fields remain present');
  assert.ok(opened.criteria.visible&&inside(opened.criteria.rect,opened.criteriaViewport),symbol+': detailed criteria were scrolled into the visible dialog body');
  for(const field of opened.criteria.fields)assert.ok(field.text&&field.visible&&inside(field.rect,opened.criteria.rect),symbol+': detailed criteria field remains visible and contained: '+field.key);
  for(const field of hud.fields)assert.ok(field.text&&field.visible&&inside(field.rect,hud.rect),symbol+': HUD field remains visible and contained: '+field.key);
  const closed=after?.allocation;
  assert.equal(closed?.criteria?.expanded,'false',symbol+': criteria control returns to its collapsed state');
  assert.ok(closed?.criteria?.visible&&inside(closed.criteria.rect,closed.canvas.content),symbol+': closed details restore the in-chart criteria overlay');
  for(const key of ['body','canvas','svg'])
    assert.ok(before?.allocation?.[key]&&after?.allocation?.[key]&&Math.abs(before.allocation[key].rect.height-after.allocation[key].rect.height)<=1,
      symbol+': closing details restores the '+key+' height ('+before?.allocation?.[key]?.rect?.height+' vs '+after?.allocation?.[key]?.rect?.height+')');
}

// Real static sources, native keyboard/pointer input, and the actual parent and
// iframe documents. No substitute model, synthetic price, or dispatched DOM event.
export async function verifyConsolidatedWorkspaceSurface(api) {
  const { cdp, receipt, evaluate, until, settled, screenshot, verifyOfflineRefresh } = api;
  const evidence = { inputs: [], states: [], frames: [], generatedImages: [] };
  const zoomVerifiedSymbols=new Set();
  receipt.consolidated = evidence;
  let child, childId;
  const frameSelector = '.atlas-center-frame:not([hidden])';
  const complete = value => value.painted && !value.disabled && value.topmost && value.box.width > 0 && value.box.height > 0 &&
    value.box.left >= value.clip.left - 1 && value.box.right <= value.clip.right + 1 &&
    value.box.top >= value.clip.top - 1 && value.box.bottom <= value.clip.bottom + 1;
  const snap = name => screenshot(cdp, `${receipt.page}-${receipt.width}-${name}.png`, receipt);

  async function bindChild() {
    const source = await until(() => evaluate(cdp, () => {
      const frame = document.querySelector('.atlas-center-frame:not([hidden])');
      // A newly inserted iframe still has a complete about:blank document while
      // its requested URL is loading. Bind only after that document commits.
      return frame?.contentDocument?.readyState === 'complete' && frame.contentDocument.URL === frame.src && frame.src;
    }), 'completed active workspace frame');
    const sourceUrl = new URL(source), parentUrl = new URL(await evaluate(cdp, () => location.href));
    assert.equal(sourceUrl.origin, parentUrl.origin, 'The active workspace must keep its same-origin owner');
    assert.ok(sourceUrl.pathname.startsWith(consolidatedPagesBase), 'The workspace frame must stay inside the Pages project root');
    const tree = await cdp.send('Page.getFrameTree');
    const matches = (tree.frameTree.childFrames || []).filter(node => node.frame.url === source);
    assert.equal(matches.length, 1, 'Exactly one direct child owns the selected workspace');
    childId = matches[0].frame.id;
    const world = await cdp.send('Page.createIsolatedWorld', { frameId: childId, worldName: 'atlas-consolidation-audit' });
    child = { send: (method, params = {}) => cdp.send(method, method === 'Runtime.evaluate' ? { ...params, contextId: world.executionContextId } : params) };
    evidence.frames.push({ id: childId, source });
    await settled(child);
  }
  async function parentPoint(context, point) {
    if (context === cdp) return { x: point.x, y: point.y };
    const frame = await evaluate(cdp, readNativeInteractiveTarget, frameSelector);
    assert.ok(complete(frame), 'Active iframe must be fully visible');
    const size = await evaluate(context, () => ({ width: innerWidth, height: innerHeight }));
    assert.ok(Math.abs(frame.box.width - size.width) <= 1 && Math.abs(frame.box.height - size.height) <= 1, 'Iframe coordinates must map 1:1');
    return { x: frame.box.left + point.x, y: frame.box.top + point.y };
  }
  async function reveal(context, selector) {
    if(context===cdp&&await evaluate(cdp,s=>Boolean(document.querySelector(s)?.closest('.shell-feature-panel[hidden]')),selector))await pointer(cdp,'#atlas-shell-features-toggle');
    let lastTarget;
    for (let attempt = 0; attempt < 18; attempt++) {
      const target = await evaluate(context, readNativeInteractiveTarget, selector);
      lastTarget=target;
      if (complete(target)) return target;
      assert.equal(target.disabled, false, 'Required action is disabled: ' + selector);
      const movement = await evaluate(context, selector => {
        const node = document.querySelector(selector), box = node.getBoundingClientRect();
        for (let owner = node.parentElement; owner; owner = owner.parentElement) {
          const style = getComputedStyle(owner), rect = owner.getBoundingClientRect();
          const left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right), top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
          if (right - left < 4 || bottom - top < 4) continue;
          const horizontal = /auto|scroll/.test(style.overflowX) && owner.scrollWidth > owner.clientWidth + 1;
          const vertical = /auto|scroll/.test(style.overflowY) && owner.scrollHeight > owner.clientHeight + 1;
          // Move only the clipped edge into view. A fixed fraction of the
          // viewport overshoots controls wider than half a narrow toolbar and
          // alternates between clipping their left and right edges forever.
          const distanceX=box.left<left?box.left-left-2:box.right>right?box.right-right+2:0;
          const distanceY=box.top<top?box.top-top-2:box.bottom>bottom?box.bottom-bottom+2:0;
          const dx=horizontal?Math.max(-180,Math.min(180,distanceX)):0;
          const dy=!dx&&vertical?Math.max(-260,Math.min(260,distanceY)):0;
          if (dx || dy) return { x: (left + right) / 2, y: (top + bottom) / 2, deltaX: dx, deltaY: dy };
        }
        return null;
      }, selector);
      assert.ok(movement, 'No native scroll can reveal ' + selector + ': ' + JSON.stringify(target));
      const point = await parentPoint(context, movement);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: movement.deltaX, deltaY: movement.deltaY });
      await settled(context);
    }
    throw new Error('Required action remains clipped: ' + selector + ': ' + JSON.stringify(lastTarget));
  }
  async function pointer(context, selector) {
    const target = await reveal(context, selector), point = await parentPoint(context, target);
    evidence.inputs.push({ kind: 'native-pointer', selector, frame: context === cdp ? 'parent' : childId, point });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await settled(context);
  }
  async function key(key, code, number, modifiers = 0) {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers,
      ...(type==='keyDown'&&key==='Enter'&&!modifiers?{text:'\r',unmodifiedText:'\r'}:{}) });
  }
  async function type(context, selector, text) {
    await pointer(context, selector); await key('a', 'KeyA', 65, 2);
    await cdp.send('Input.insertText', { text }); await settled(context);
  }
  async function select(context, selector, value) {
    const options = await evaluate(context, selector => [...document.querySelector(selector).options].map(option => option.value), selector);
    const index = options.indexOf(value); assert.ok(index >= 0, 'Native option exists: ' + value);
    await pointer(context, selector); await key('Home', 'Home', 36);
    for (let step = 0; step < index; step++) await key('ArrowDown', 'ArrowDown', 40);
    await key('Enter', 'Enter', 13); await settled(context);
    await until(() => evaluate(context, (selector, value) => document.querySelector(selector)?.value === value, selector, value), 'selected ' + value);
  }
  async function state(label) {
    const ownership=await evaluate(cdp,readConsolidatedToolbarOwnership),narrowHeading=ownership.twoRow;
    (evidence.toolbarOwnership??=[]).push({label,before:ownership});
    const narrowDisclosure=consolidatedToolbarUsesDisclosure(ownership,label);
    if(narrowDisclosure&&ownership.panel?.hidden)await pointer(cdp,'#atlas-shell-features-toggle');
    const result = await evaluate(cdp, () => {
      const frame=document.querySelector('.atlas-center-frame:not([hidden])'),doc = frame?.contentDocument;
      const header=document.querySelector('.atlas-canvas-heading'),host=document.getElementById(frame.dataset.toolbarId);
      const box=element=>{const b=element.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height};};
      const obsoleteRows={housing:['.housing-toolbar','.housing-period','.housing-quote','.housing-tabs','.chart-workspace-toolbar'],themes:['.theme-toolbar','.theme-summary','.theme-tabs','.chart-workspace-toolbar'],data:['.daily-heading','.asset-filters','.asset-table-summary'],ipo:['.ipo-heading','.ipo-calendar-nav'],evidence:['.evidence-controls','.evidence-pagination']}[document.body.dataset.centerTool]||['.workspace-toolbar'];
      const scrollbars=[document,doc].flatMap(owner=>[...owner.querySelectorAll('*')].filter(node=>{
        const style=owner.defaultView.getComputedStyle(node);
        return node.checkVisibility()&&(/auto|scroll/.test(style.overflowX)&&node.scrollWidth>node.clientWidth+1||/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1);
      }).map(node=>({tag:node.id||node.className,bar:owner.defaultView.getComputedStyle(node).scrollbarWidth})));
      return { url: location.href, center: document.body.dataset.centerTool, width: innerWidth, documentWidth: document.documentElement.scrollWidth,
        childWidth: doc?.defaultView.innerWidth, childDocumentWidth: doc?.documentElement.scrollWidth,
        tab: host?.querySelector('[data-workspace-page][aria-selected=true]')?.dataset.workspacePage,
        market: document.querySelector('[data-control="market"]')?.value, date: document.querySelector('[data-selected-date]')?.textContent||doc?.querySelector('[data-selected-date]')?.textContent,
        instrument:document.querySelector('.symbol-selector-trigger')?.textContent,
        header:box(header),headingLayout:header.dataset.mobileHeading||null,headingScroll:{width:header.scrollWidth,client:header.clientWidth},
        featurePanel:host.closest('.shell-feature-panel')?box(host.closest('.shell-feature-panel')):null,host:box(host),frame:box(frame),visibleHosts:document.querySelectorAll('.center-workspace-toolbar:not([hidden])').length,scrollbars,
        duplicateRows:obsoleteRows.filter(selector=>doc.querySelector(selector)?.checkVisibility()),
        symbols: [...doc?.querySelectorAll('#data-body tr[data-asset-symbol]') || []].map(row => row.dataset.assetSymbol) };
    });
    assert.ok(new URL(result.url).pathname.startsWith(consolidatedPagesBase), label + ': parent URL escaped the Pages project root');
    assert.ok(result.documentWidth <= result.width + 1, label + ': outer document overflows');
    assert.ok(result.childDocumentWidth <= result.childWidth + 1, label + ': inner document overflows');
    assert.equal(result.visibleHosts,1,label+': exactly one active toolbar owner');
    assert.deepEqual(result.duplicateRows,[],label+': redundant inner control rows remain visible');
    assert.ok(result.header.height<=(narrowHeading?92:receipt.width<=620?48:44)+1,label+': controls fit their declared outer rows');
    const toolOwner=result.featurePanel||result.header;
    assert.ok(result.host.height>0&&result.host.top>=toolOwner.top-1&&result.host.bottom<=toolOwner.bottom+1,label+': tool controls belong inside their visible header or disclosure');
    if(narrowHeading){assert.equal(result.headingLayout,'two-row');assert.ok(result.headingScroll.width<=result.headingScroll.client,label+': narrow primary controls cannot require horizontal scrolling');}
    result.toolbarOwnership=await evaluate(cdp,readConsolidatedToolbarOwnership);
    assert.equal(result.toolbarOwnership.activeHost,ownership.activeHost,label+': state inspection retains the same iframe toolbar');
    assertConsolidatedToolbarOwnership(result.toolbarOwnership,label);
    assert.ok(result.frame.top>=result.header.bottom-1,label+': toolbar cannot cover the data canvas');
    assert.ok(result.scrollbars.every(owner=>owner.bar==='none'),label+': scrollbars remain visibly enabled: '+JSON.stringify(result.scrollbars));
    evidence.states.push({ label, ...result });
    if(narrowDisclosure)await pointer(cdp,'[data-shell-feature-close]');
    return result;
  }
  async function marketTab(page) {
    await pointer(cdp, `[data-workspace-page="${page}"]`);
    await until(() => evaluate(cdp, page => document.querySelector(`[data-workspace-page="${page}"]`)?.getAttribute('aria-selected') === 'true', page), page);
  }
  async function action(selector){
    const inHeader=await evaluate(cdp,selector=>Boolean(document.querySelector(selector)?.checkVisibility()),selector);
    await pointer(inHeader?cdp:child,selector);
  }
  async function closeMenu(name){
    await pointer(cdp,`[data-toolbar-close="${name}"]`);
    await until(()=>evaluate(cdp,name=>!document.querySelector(`[data-toolbar-dialog="${name}"]`)?.open,name),'toolbar dialog closed '+name);
    assert.equal(await evaluate(cdp,name=>document.activeElement===document.querySelector(`[data-toolbar-open="${name}"]`),name),true,'Dialog returns focus to its visible header trigger');
  }
  async function navigate(id) {
    if (receipt.width <= 620) await pointer(cdp, '#mobile-details-toggle');
    await pointer(cdp, `.atlas-nav [data-atlas-page="${id}"]`);
    await until(() => evaluate(cdp, id => document.body.dataset.centerTool === id, id), 'navigation ' + id);
    await bindChild();
  }

  await until(() => evaluate(cdp, () => Boolean(document.querySelector('.atlas-center-frame:not([hidden])')?.contentDocument?.querySelector('[data-workspace="market"]'))), 'legacy US URL enters the unified workspace');
  await bindChild();
  await verifyOfflineRefresh({ phase: 'consolidated-initial-document' });
  await until(() => evaluate(child, () => Boolean(document.querySelector('[data-ztd-chart="observed"] svg'))), 'actual ztd diagnosis chart');
  const initial = await state('us');
  assert.equal(new URL(initial.url).pathname, `${consolidatedPagesBase}market-lab/`);
  assert.equal(initial.tab, 'market-us');
  evidence.diagnosisHeading = {
    activeTab: await reveal(cdp, '[data-workspace-page="market-us"]'),
    selector: await reveal(cdp, '[data-control="market"]'),
  };
  assert.match(evidence.diagnosisHeading.activeTab.label, /미국/,'The active market remains named in the single header');
  assert.equal(await evaluate(child,()=>document.querySelector('.ml-price-card > header')?.checkVisibility()),false,'Market title and selection must not retain a second inner header');
  await reveal(child, '[data-ztd-chart="observed"]'); await snap('market-us');
  await pointer(child, '.ml-price-card .ztd-root'); await key('Home', 'Home', 36); await settled(child);
  evidence.diagnosisFocus = await evaluate(child, readNativeInteractiveTarget, '.ml-price-card .ztd-root', true);
  evidence.diagnosisFocus.offset = await evaluate(child, () => getComputedStyle(document.activeElement).outlineOffset);
  assert.ok(complete(evidence.diagnosisFocus) && evidence.diagnosisFocus.inside && evidence.diagnosisFocus.outline !== 'none' && evidence.diagnosisFocus.outlineWidth >= 2,
    'Diagnosis chart must retain a visible keyboard focus ring');
  assert.equal(evidence.diagnosisFocus.offset, '-2px', 'Diagnosis focus must remain inside the clipped mobile figure');
  const alternative = await evaluate(cdp, () => {
    const select = document.querySelector('[data-control="market"]');
    return [...select.options].find(option => option.value !== select.value)?.value;
  });
  assert.ok(alternative); await select(cdp, '[data-control="market"]', alternative);
  await pointer(cdp,'[data-toolbar-open="market-date"]');
  await pointer(cdp, 'input[data-date="price"]'); await key('ArrowLeft', 'ArrowLeft', 37); await settled(child);
  await closeMenu('market-date');
  const selected = await state('us-selected');
  assert.match(selected.date,/\d{4}-\d{2}-\d{2}/,'Selected observed date must stay visible in the outer toolbar');
  await marketTab('market-kr'); await state('kr'); await marketTab('market-us');
  const restored = await state('us-restored'); assert.equal(restored.market, selected.market); assert.equal(restored.date, selected.date);
  await marketTab('scenario'); await reveal(child, '[data-ztd-chart="contributions"]');
  const before = await evaluate(cdp, () => document.querySelector('.ml-index strong').textContent);
  await action('[data-action="negative"]');
  assert.notEqual(await evaluate(cdp, () => document.querySelector('.ml-index strong').textContent), before);
  await reveal(child, '[data-ztd-chart="contributions"]'); await state('scenario'); await snap('scenario');
  await marketTab('cashflow'); await action('[data-action="economics-example"]');
  await until(() => evaluate(child, () => document.querySelectorAll('#ml-economics-output .ml-results > div').length === 5), 'calculated cashflow example');
  await reveal(child, '#ml-economics-output .ml-results');
  await state('cashflow'); await snap('cashflow');

  // The actual common outer symbol search is the single instrument entry point.
  await pointer(cdp, '.atlas-canvas-heading .symbol-selector-trigger');
  await type(cdp, '#symbol-search-dialog input', 'TQQQ');
  await pointer(cdp, '#symbol-option-TQQQ');
  await until(() => evaluate(child, () => document.querySelector('.rsi-price-line')?.getAttribute('d')?.length > 20), 'TQQQ actual price path');
  assert.match((await state('tqqq')).instrument, /TQQQ/); await snap('tqqq');
  async function chartSearch(query, symbol, page) {
    await pointer(cdp,'.atlas-canvas-heading .symbol-selector-trigger');
    await type(cdp, '#symbol-search-dialog input', query);
    await pointer(cdp, `#symbol-option-${symbol}`);
    await until(() => evaluate(cdp, page => document.body.dataset.centerTool === page, page), 'chart ' + symbol);
    await until(() => evaluate(cdp, () => !document.querySelector('#symbol-search-dialog').open), 'search closes after selection');
    await until(() => evaluate(cdp, symbol => document.body.dataset.chartControls==='ready'&&document.querySelector('#workbench-range-label')?.title.startsWith(symbol+' /'),symbol),'acknowledged controls for '+symbol);
    assert.equal(await evaluate(child,()=>Boolean(document.querySelector('.chart-workspace-toolbar')?.checkVisibility())),false,'Embedded chart cannot duplicate the instrument search row');
  }
  // The confirmed cd53cad details path: the position HUD is reached from the
  // in-chart criteria overlay with real pointer and keyboard input, and closing
  // it must return the chart to its previous height.
  async function simulationDetailsContract(symbol){
    const criteria='.rsi-trading-criteria',canvas='.rsi-chart-canvas svg';
    async function keyboardFocus(selector){
      for(let attempt=0;attempt<16;attempt++){
        await key('Tab','Tab',9);await settled(child);
        if(await evaluate(child,selector=>document.activeElement?.matches?.(selector)===true,selector))return;
      }
      assert.fail(symbol+': native Tab navigation never reached '+selector);
    }
    for(const input of ['pointer','keyboard']){
      const before={allocation:await evaluate(cdp,readConsolidatedChartAllocation)};
      if(input==='pointer')await pointer(child,criteria);
      else{await pointer(child,canvas);await keyboardFocus(criteria);await key('Enter','Enter',13);}
      await settled(child);
      let opened=await until(async()=>{const state=await evaluate(cdp,readSimulationDetailsState);return state?.dialog?.open&&state.hud?state:null;},symbol+': '+input+' opens the simulation details');
      const dialogContext=opened.owner==='parent'?cdp:child;
      await reveal(dialogContext,'dialog.rsi-detail-dialog[open] .rsi-criteria-details dl');
      const criteriaState=await evaluate(cdp,readSimulationDetailsState);
      await reveal(dialogContext,'dialog.rsi-detail-dialog[open] .rsi-simulation-hud');
      opened={...await evaluate(cdp,readSimulationDetailsState),criteria:criteriaState.criteria,criteriaViewport:criteriaState.dialog.scrollport};
      assert.equal(await evaluate(cdp,()=>document.querySelector('.atlas-center-frame:not([hidden])')?.contentDocument?.querySelector('.rsi-trading-criteria')?.getAttribute('aria-expanded')),'true',symbol+': '+input+' opens the criteria details');
      await snap(symbol.toLowerCase()+'-simulation-'+input);
      await key('Escape','Escape',27);await settled(child);
      await until(async()=>{const state=await evaluate(cdp,readSimulationDetailsState);return state?.dialog===null;},symbol+': '+input+' closes the simulation details');
      const after={allocation:await evaluate(cdp,readConsolidatedChartAllocation)};
      (evidence.simulationDetails??=[]).push({symbol,input,
        dialog:{name:opened.dialog.name,label:opened.dialog.label,rect:opened.dialog.rect},
        hud:{label:opened.hud.label,fields:opened.hud.fields.map(field=>({key:field.key,text:field.text}))},
        restored:{before:{body:before.allocation?.body?.rect.height,canvas:before.allocation?.canvas?.rect.height,svg:before.allocation?.svg?.rect.height},
          after:{body:after.allocation?.body?.rect.height,canvas:after.allocation?.canvas?.rect.height,svg:after.allocation?.svg?.rect.height}}});
      assertSimulationDetailsRoundTrip({symbol,before,opened,after});
    }
  }

  async function chartContract(symbol,unit,frequencies){
    await until(()=>evaluate(cdp,symbol=>document.body.dataset.chartControls==='ready'&&document.querySelector('#workbench-range-label')?.title.startsWith(symbol+' /'),symbol),'current price perimeter '+symbol);
    const result=await evaluate(cdp,()=>{
      const doc=document.querySelector('.atlas-center-frame:not([hidden])').contentDocument,svg=doc.querySelector('.rsi-chart-canvas svg'),b=svg.getBoundingClientRect();
      const interval=document.querySelector('#workbench-interval-select');
      const box=node=>{if(!node)return null;const b=node.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};};
      const units=[...svg.querySelectorAll('.rsi-price-unit')],guides=[...svg.querySelectorAll('.theme-event-guide[data-date]')];
      return {nav:[...document.querySelectorAll('.atlas-nav [data-atlas-page]')].map(n=>n.dataset.atlasPage),active:[...document.querySelectorAll('.atlas-nav [aria-current=page]')].map(n=>n.dataset.atlasPage),
        range:document.querySelector('#workbench-range-label').title,frequencies:[...interval.options].filter(o=>!o.disabled&&!o.hidden).map(o=>o.value),frequency:interval.value,
        rightRail:document.querySelector('.workbench-rail').getBoundingClientRect().width,svg:{width:b.width,height:b.height,viewWidth:svg.viewBox.baseVal.width,viewHeight:svg.viewBox.baseVal.height,start:svg.dataset.start,end:svg.dataset.end,visible:svg.checkVisibility()},
        plot:{left:Number(svg.dataset.plotLeft),right:Number(svg.dataset.plotRight),top:Number(svg.dataset.plotTop),axisBox:box(svg.querySelector('[data-price-axis="true"] > rect'))},
        units:units.map(node=>({text:node.textContent,box:box(node),visible:node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})})),
        markers:[...svg.querySelectorAll('.theme-event-mark')].map(node=>{
          const kind=node.classList.contains('evidence')?'evidence':'judgment',guide=guides.find(line=>line.dataset.date===node.dataset.date&&line.classList.contains(kind));
          return {date:node.dataset.date,anchorX:Number(node.dataset.anchorX),kind,label:node.querySelector('text')?.textContent,
            box:box(node),rectBox:box(node.querySelector('rect')),textBox:box(node.querySelector('text')),
            strokeWidth:parseFloat(doc.defaultView.getComputedStyle(node.querySelector('rect')).strokeWidth),
            role:node.getAttribute('role'),tabIndex:node.getAttribute('tabindex'),
            guide:guide?{x1:Number(guide.getAttribute('x1')),x2:Number(guide.getAttribute('x2')),
              pointerEvents:doc.defaultView.getComputedStyle(guide).pointerEvents,hidden:guide.getAttribute('aria-hidden')}:null};
        }),
        childHeight:doc.defaultView.innerHeight,sourceClock:document.querySelector('#atlas-update-status').getAttribute('aria-label'),candles:!document.querySelector('#workbench-chart-type').disabled};
    });
    result.allocation=await evaluate(cdp,readConsolidatedChartAllocation);
    // Preserve actual allocation and glyph bounds even if either assertion fails.
    (evidence.chartAllocation??=[]).push({symbol,...result.allocation});
    (evidence.priceAxisGeometry??=[]).push({symbol,svg:result.svg,plot:result.plot,units:result.units,markers:result.markers});
    const observationDisclosure=await evaluate(cdp,()=>document.querySelector('.atlas-canvas-heading')?.dataset.mobileHeading==='two-row');
    if(observationDisclosure&&await evaluate(cdp,()=>document.querySelector('#atlas-shell-features-panel')?.hidden))await pointer(cdp,'#atlas-shell-features-toggle');
    result.observation=await evaluate(cdp,readConsolidatedObservationGeometry,unit);
    // Keep the original ranges in a failed receipt too, including the unit's
    // last character when its parent button clips a longer observed readout.
    (evidence.observationGeometry??=[]).push({symbol,...result.observation});
    assertConsolidatedObservationGeometry(result.observation,symbol,unit);
    if(observationDisclosure)await pointer(cdp,'[data-shell-feature-close]');
    assert.deepEqual(result.nav,['outlook','market-us','evidence','data','ipo','relay'],symbol+': one price destination');
    assert.deepEqual(result.active,['outlook'],symbol+': price destination owns all charts');
    assert.ok(result.range.includes(symbol+' / '+unit+' /'),symbol+': original price unit');
    assert.deepEqual(result.frequencies,frequencies,symbol+': only observed source frequencies');
    assertConsolidatedChartAllocation(result,symbol);
    if(['TQQQ','SOXL','233740'].includes(symbol))await simulationDetailsContract(symbol);
    assert.ok(Math.abs(result.svg.width-result.svg.viewWidth)<=1&&Math.abs(result.svg.height-result.svg.viewHeight)<=1,symbol+': pixel-sized chart labels');
    assert.equal(result.units.length,1,symbol+': one visible price-axis unit');
    const axisUnit=result.units[0],unitBox=axisUnit.box;
    assert.ok(result.plot.axisBox&&Math.abs(result.plot.axisBox.x-result.plot.right)<.01,symbol+': actual price gutter matches its plot boundary');
    assert.equal(axisUnit.text,unit,symbol+': axis retains the original source unit');
    assert.ok(axisUnit.visible&&unitBox&&Object.values(unitBox).every(Number.isFinite)&&unitBox.width>0&&unitBox.height>0&&
      unitBox.x>=result.plot.axisBox.x&&unitBox.x+unitBox.width<=result.svg.viewWidth&&unitBox.y>=0&&unitBox.y+unitBox.height<=result.plot.top,
    symbol+': unit glyphs stay inside the existing upper price-gutter margin');
    if(symbol==='HYPE'){
      assert.ok(result.markers.length>0,'HYPE: actual evidence and judgment badges must be present');
      for(const marker of result.markers){
        const b=marker.box,stroke=marker.strokeWidth/2;
        assert.ok(b&&Object.values(b).every(Number.isFinite)&&b.width>0&&b.height>0&&Number.isFinite(stroke)&&stroke>=0&&
          b.x-stroke>=result.plot.left&&b.x+b.width+stroke<=result.plot.axisBox.x,'HYPE: painted badge glyphs and stroke must not enter the price gutter');
        const start=Date.parse(result.svg.start+'T00:00:00Z'),end=Date.parse(result.svg.end+'T00:00:00Z'),stamp=Date.parse(marker.date+'T00:00:00Z');
        const x=result.plot.left+(stamp-start)/Math.max(86400000,end-start)*(result.plot.right-result.plot.left);
        assert.ok(Number.isFinite(x)&&Math.abs(marker.anchorX-x)<.01&&marker.guide&&Math.abs(marker.guide.x1-x)<.01&&Math.abs(marker.guide.x2-x)<.01,
          'HYPE: moving a badge must preserve its original observed date guide');
        assert.equal(marker.guide.pointerEvents,'none','HYPE: date guides cannot become button hit targets');
        assert.equal(marker.guide.hidden,'true');assert.equal(marker.role,'button');assert.equal(marker.tabIndex,'0');
      }
    }
    if(receipt.width>760)assert.equal(result.rightRail,45,symbol+': same narrow rail');
    if(frequencies[0]==='monthly'){assert.equal(result.candles,false);assert.match(result.sourceClock,/가격지수 \d{4}-\d{2} · 거래량 \d{4}-\d{2}/);}
    evidence.states.push({label:'common-chart-'+symbol,...result});
    if(!zoomVerifiedSymbols.has(symbol)){
      await verifyChartZoomBrowser({...api,context:child,parentPoint:point=>parentPoint(child,point),
        svgSelector:'.rsi-chart-canvas svg',allocationSelector:'.rsi-chart-canvas',label:symbol});
      zoomVerifiedSymbols.add(symbol);
    }
    return result;
  }
  async function commonChartActions(symbol,monthly){
    const canvas='.rsi-chart-canvas svg',panel='.rsi-workbench-panel';
    if(receipt.width<=620){
      await pointer(cdp,'#mobile-tools-toggle');await key('k','KeyK',75,2);await settled(child);
      await until(()=>evaluate(child,()=>document.querySelector('.rsi-workbench-panel')?.getAttribute('aria-label')?.endsWith('명령 검색')),'keyboard command pane from mobile tray '+symbol);
      assert.equal(await evaluate(cdp,()=>Boolean(document.querySelector('.mobile-workbench-button[aria-expanded=true]'))),false,'mobile tray cannot obscure the selected chart command pane');
      await pointer(child,panel+' header button');
    }
    await pointer(child,canvas);
    await key('m','KeyM',77);await settled(child);
    assert.equal(await evaluate(child,()=>document.querySelector('.rsi-chart-canvas').dataset.tool),'measure');
    await key('c','KeyC',67);await settled(child);
    const original=await evaluate(child,()=>{const s=document.querySelector('.rsi-chart-canvas svg');return [s.dataset.start,s.dataset.end];});
    await key('+','Equal',187);await settled(child);
    await until(()=>evaluate(child,before=>{const s=document.querySelector('.rsi-chart-canvas svg');return s.dataset.start!==before[0]||s.dataset.end!==before[1];},original),'zoom '+symbol);
    await key('z','KeyZ',90,2);await settled(child);
    assert.deepEqual(await evaluate(child,()=>{const s=document.querySelector('.rsi-chart-canvas svg');return [s.dataset.start,s.dataset.end];}),original,symbol+': undo restores exact observed range');
    await key('g','KeyG',71,1);await settled(child);
    await until(()=>evaluate(child,()=>document.querySelector('.rsi-workbench-panel')?.getAttribute('aria-label')?.endsWith('날짜·기간')),'date pane '+symbol);
    assert.equal(await evaluate(child,()=>document.querySelector('.rsi-workbench-panel input').type),monthly?'month':'date');
    await pointer(child,panel+' header button');
    async function command(label){
      await pointer(child,canvas);await key('k','KeyK',75,2);await settled(child);
      await type(child,panel+' input[type=search]',label);await pointer(child,panel+' .rsi-command-option');
    }
    await command('차트 설정');
    assert.equal(await evaluate(child,()=>document.querySelector('.rsi-workbench-panel').getAttribute('aria-label')),symbol+' 차트 설정');
    await pointer(child,panel+' header button');
    await command('차트 내보내기');await pointer(child,panel+' .rsi-workbench-panel-scroll > button');
    await until(()=>evaluate(child,()=>Boolean(document.querySelector('.rsi-workbench-panel a[download$=".svg"]')&&document.querySelector('.rsi-workbench-panel a[download$=".png"]'))),'source chart SVG and PNG '+symbol);
    assert.match(await evaluate(child,()=>document.querySelector('.rsi-workbench-panel a[download$=".svg"]').download),new RegExp('^'+symbol+'-'));
    const generated=await evaluate(child,()=>{
      const panel=document.querySelector('.rsi-workbench-panel'),preview=panel.querySelector('.rsi-export-preview');
      return {documentUrl:document.URL,svgUrl:panel.querySelector('a[download$=".svg"]').href,pngUrl:panel.querySelector('a[download$=".png"]').href,
        previewSrc:preview.currentSrc||preview.src,previewComplete:preview.complete,previewWidth:preview.naturalWidth,previewHeight:preview.naturalHeight};
    });
    evidence.generatedImages.push({symbol,frameId:childId,...generated});
    await snap(symbol.toLowerCase()+'-export');await pointer(child,panel+' header button');
    await chartContract(symbol,monthly?'지수':'USDC',monthly?['monthly']:['daily','weekly']);
  }
  await chartContract('TQQQ','USD',['daily','weekly']);
  for(const [symbol,unit]of [['SOXL','USD'],['233740','KRW']]){
    await chartSearch(symbol,symbol,'rsi');await chartContract(symbol,unit,['daily','weekly']);await snap(symbol.toLowerCase());
  }
  await chartSearch('서울', 'HOUSING-SEOUL', 'housing');
  await until(() => evaluate(child, () => document.querySelector('.housing-chart .rsi-price-line')?.getAttribute('d')?.length > 20), 'Seoul observed price chart');
  await chartContract('HOUSING-SEOUL','지수',['monthly']);
  assert.equal(await evaluate(cdp, () => document.querySelector('[aria-label="부동산 지역"]').value), 'seoul');
  await state('housing-seoul'); await snap('housing');
  await pointer(cdp,'[data-toolbar-open="housing-settings"]');
  await select(cdp,'[aria-label="거래량 평균 기간"]','12');await closeMenu('housing-settings');
  await pointer(cdp,'[data-toolbar-open="housing-summary"]');
  assert.match(await evaluate(cdp,()=>document.querySelector('[data-toolbar-dialog="housing-summary"]').textContent),/상관/);
  await closeMenu('housing-summary');
  await pointer(cdp,'#housing-tab-history');
  await until(()=>evaluate(child,()=>Boolean(document.querySelector('#housing-view-history table'))),'housing history remains reachable');
  await state('housing-history');await pointer(cdp,'#housing-tab-chart');
  for(const [query,symbol]of [['부산','HOUSING-BUSAN'],['경기','HOUSING-GYEONGGI'],['전국','HOUSING-NATIONAL']]){
    await chartSearch(query,symbol,'housing');await chartContract(symbol,'지수',['monthly']);await snap(symbol.toLowerCase());
  }
  await commonChartActions('HOUSING-NATIONAL',true);
  await chartSearch('하이퍼리퀴드', 'HYPE', 'themes');
  await until(() => evaluate(child, () => document.querySelectorAll('.theme-price-chart .theme-volume').length>0), 'HYPE actual chart');
  assert.equal(new URL((await state('hype-selected')).url).searchParams.get('symbol'),'HYPE');
  await pointer(cdp,'[data-toolbar-open="theme-summary"]');
  assert.match(await evaluate(cdp,()=>document.querySelector('[data-toolbar-dialog="theme-summary"] .theme-identity').textContent),/HYPE\/USDC/,'The selected asset retains its actual quote currency');
  await closeMenu('theme-summary');
  await chartContract('HYPE','USDC',['daily','weekly']);await commonChartActions('HYPE',false);
  await state('hype'); await snap('hype');

  await navigate('data');
  await until(() => evaluate(child, () => document.querySelectorAll('#data-body tr[data-asset-symbol]').length === 20), '20 committed asset rows');
  await select(cdp, '#center-asset-sector-filter', '디지털 자산');
  assert.deepEqual((await state('digital-assets')).symbols, ['BTC', 'ETH', 'HYPE']);
  await until(() => evaluate(cdp, () => document.querySelectorAll('.center-data-actions button:not(:disabled)').length === 4), 'all four hosted data actions enabled');
  assert.equal(await evaluate(child, () => document.querySelector('.daily-heading-actions').checkVisibility()), false);
  await snap('digital-assets');
  await pointer(cdp,'[data-toolbar-open="filters"]');
  await select(cdp, '#center-asset-columns', 'performance');
  assert.equal(await evaluate(child, () => document.querySelector('.asset-comparison-table').dataset.columns), 'performance');
  await pointer(cdp, '#center-asset-filter-reset');
  assert.equal((await state('assets-reset')).symbols.length, 20);
  await closeMenu('filters');

  await navigate('ipo');
  await until(() => evaluate(child, () => /년.*월/.test(document.querySelector('.ipo-page-label')?.textContent || '')), 'IPO actual month');
  evidence.ipo = await evaluate(cdp, () => {
    const doc=document.querySelector('.atlas-center-frame:not([hidden])').contentDocument;
    return { month: doc.querySelector('.ipo-page-label').textContent,
      innerControlsVisible:['.ipo-heading','.ipo-calendar-nav'].some(selector=>doc.querySelector(selector)?.checkVisibility()),
      toolbar:document.querySelector('.center-workspace-toolbar:not([hidden])').textContent };
  });
  assert.equal(evidence.ipo.innerControlsVisible,false,'Calendar controls must not retain stacked inner rows');
  await state('ipo');
  await snap('ipo');
  await pointer(cdp,'[data-toolbar-open="calendar"]');
  await pointer(cdp, '#center-ipo-list');
  await until(() => evaluate(child, () => document.querySelector('.ipo-page-label').textContent === '전체 목록'), 'IPO list');
  assert.equal(await evaluate(cdp,()=>document.activeElement===document.querySelector('[data-toolbar-open="calendar"]')),true,'Calendar selection returns focus to the outer toolbar');
  await pointer(cdp,'[data-toolbar-open="calendar"]');
  await pointer(cdp, '#center-ipo-today');
  await until(() => evaluate(child, month => document.querySelector('.ipo-page-label').textContent === month && document.querySelector('[data-ipo-page="today"]').getAttribute('aria-pressed') === 'true', evidence.ipo.month), 'IPO original month restored');
  await pointer(cdp,'[data-toolbar-open="source"]');
  const ipoSnapshot=JSON.parse(await readFile(new URL('../dist/data/ipo-calendar.json',import.meta.url),'utf8'));
  const sourceDescription=ipoSnapshot['출처'];
  assert.equal(typeof sourceDescription,'string','IPO snapshot retains its original source description');
  const expectedSourceUrls=sourceDescription.split(/\s+/).filter(token=>/^https?:\/\//i.test(token)).map(token=>new URL(token).href);
  assert.ok(expectedSourceUrls.length>0,'IPO snapshot declares at least one original source URL');
  const source=await evaluate(cdp,()=>({text:document.querySelector('[data-toolbar-dialog="source"] .legacy-toolbar-source').textContent,links:[...document.querySelectorAll('[data-toolbar-dialog="source"] .legacy-toolbar-source a[href]')].map(link=>link.href)}));
  assert.ok(source.text.includes(sourceDescription),'The complete collected IPO source description remains reachable from the compact header');
  assert.ok(source.links.every(href=>['http:','https:'].includes(new URL(href).protocol)),'IPO source links retain a navigable web protocol');
  assert.deepEqual(source.links,expectedSourceUrls,'IPO disclosure links must match the original snapshot URLs, including their schemes');
  evidence.ipo.source=source;await closeMenu('source');
  await state('ipo-restored');
  await navigate('evidence');
  await verifyOfflineRefresh({consolidatedEvidence:true,phase:'consolidated-evidence-document'});
  await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('#center-evidence-search'))),'research search hosted');
  await type(cdp,'#center-evidence-search','no-matching-atlas-record-20261107');
  await until(()=>evaluate(child,()=>/^0\s*\//.test(document.querySelector('#evidence-total')?.textContent||'')),'research empty search');
  await state('research-empty');await snap('research-empty');
  if(receipt.width<=620)await pointer(cdp,'#mobile-details-toggle');
  await pointer(cdp,'.atlas-nav [data-atlas-page="outlook"]');
  await until(()=>evaluate(cdp,()=>document.body.dataset.centerTool==='themes'),'price destination retains HYPE after other pages');
  await bindChild();await chartContract('HYPE','USDC',['daily','weekly']);
  assert.equal(new URL((await state('price-return')).url).searchParams.get('symbol'),'HYPE');
}
