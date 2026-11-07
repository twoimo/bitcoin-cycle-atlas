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

// Real static sources, native keyboard/pointer input, and the actual parent and
// iframe documents. No substitute model, synthetic price, or dispatched DOM event.
export async function verifyConsolidatedWorkspaceSurface(api) {
  const { cdp, receipt, evaluate, until, settled, screenshot, verifyOfflineRefresh } = api;
  const evidence = { inputs: [], states: [], frames: [] };
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
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers });
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
        header:box(header),host:box(host),frame:box(frame),visibleHosts:document.querySelectorAll('.center-workspace-toolbar:not([hidden])').length,scrollbars,
        duplicateRows:obsoleteRows.filter(selector=>doc.querySelector(selector)?.checkVisibility()),
        symbols: [...doc?.querySelectorAll('#data-body tr[data-asset-symbol]') || []].map(row => row.dataset.assetSymbol) };
    });
    assert.ok(new URL(result.url).pathname.startsWith(consolidatedPagesBase), label + ': parent URL escaped the Pages project root');
    assert.ok(result.documentWidth <= result.width + 1, label + ': outer document overflows');
    assert.ok(result.childDocumentWidth <= result.childWidth + 1, label + ': inner document overflows');
    assert.equal(result.visibleHosts,1,label+': exactly one active toolbar owner');
    assert.deepEqual(result.duplicateRows,[],label+': redundant inner control rows remain visible');
    assert.ok(result.header.height<=(receipt.width<=620?48:44)+1,label+': controls must occupy one outer row');
    assert.ok(result.host.top>=result.header.top-1&&result.host.bottom<=result.header.bottom+1,label+': tool controls belong inside the outer header');
    assert.ok(result.frame.top>=result.header.bottom-1,label+': toolbar cannot cover the data canvas');
    assert.ok(result.scrollbars.every(owner=>owner.bar==='none'),label+': scrollbars remain visibly enabled: '+JSON.stringify(result.scrollbars));
    evidence.states.push({ label, ...result }); return result;
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
  async function chartContract(symbol,unit,frequencies){
    await until(()=>evaluate(cdp,symbol=>document.body.dataset.chartControls==='ready'&&document.querySelector('#workbench-range-label')?.title.startsWith(symbol+' /'),symbol),'current price perimeter '+symbol);
    const result=await evaluate(cdp,()=>{
      const doc=document.querySelector('.atlas-center-frame:not([hidden])').contentDocument,svg=doc.querySelector('.rsi-chart-canvas svg'),b=svg.getBoundingClientRect();
      const interval=document.querySelector('#workbench-interval-select');
      return {nav:[...document.querySelectorAll('.atlas-nav [data-atlas-page]')].map(n=>n.dataset.atlasPage),active:[...document.querySelectorAll('.atlas-nav [aria-current=page]')].map(n=>n.dataset.atlasPage),
        range:document.querySelector('#workbench-range-label').title,frequencies:[...interval.options].filter(o=>!o.disabled&&!o.hidden).map(o=>o.value),frequency:interval.value,
        rightRail:document.querySelector('.workbench-rail').getBoundingClientRect().width,svg:{width:b.width,height:b.height,viewWidth:svg.viewBox.baseVal.width,viewHeight:svg.viewBox.baseVal.height,start:svg.dataset.start,end:svg.dataset.end,visible:svg.checkVisibility()},
        childHeight:doc.defaultView.innerHeight,sourceClock:document.querySelector('#atlas-update-status').getAttribute('aria-label'),candles:!document.querySelector('#workbench-chart-type').disabled};
    });
    assert.deepEqual(result.nav,['outlook','market-us','evidence','data','ipo'],symbol+': one price destination');
    assert.deepEqual(result.active,['outlook'],symbol+': price destination owns all charts');
    assert.ok(result.range.includes(symbol+' / '+unit+' /'),symbol+': original price unit');
    assert.deepEqual(result.frequencies,frequencies,symbol+': only observed source frequencies');
    assert.ok(result.svg.visible&&result.svg.height>=result.childHeight*.75,symbol+': chart fills its allocated work area');
    assert.ok(Math.abs(result.svg.width-result.svg.viewWidth)<=1&&Math.abs(result.svg.height-result.svg.viewHeight)<=1,symbol+': pixel-sized chart labels');
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
