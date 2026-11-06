import assert from 'node:assert/strict';
import { readNativeInteractiveTarget } from './verify-workspace-browser.mjs';

// Match scripts/build-pages.mjs and the public GitHub Pages project root.
export const consolidatedPagesBase = '/bitcoin-cycle-atlas/';
export const consolidatedWorkspaceCases = [390, 1440].map(width => ({
  page: 'workspace-consolidated', width, height: width === 390 ? 844 : 900,
  touch: width === 390, route: `${consolidatedPagesBase}market-lab/us/`, consolidated: true,
}));

// Real static sources, native keyboard/pointer input, and the actual parent and
// iframe documents. No substitute model, synthetic price, or dispatched DOM event.
export async function verifyConsolidatedWorkspaceSurface(api) {
  const { cdp, receipt, evaluate, until, settled, screenshot, verifyOfflineRefresh } = api;
  const evidence = { inputs: [], states: [], frames: [] };
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
    for (let attempt = 0; attempt < 18; attempt++) {
      const target = await evaluate(context, readNativeInteractiveTarget, selector);
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
          const dx = horizontal && (box.left < left || box.right > right) ? Math.sign((box.left + box.right - left - right) / 2) * Math.min(180, (right - left) * .6) : 0;
          const dy = !dx && vertical && (box.top < top || box.bottom > bottom) ? Math.sign((box.top + box.bottom - top - bottom) / 2) * Math.min(260, (bottom - top) * .6) : 0;
          if (dx || dy) return { x: (left + right) / 2, y: (top + bottom) / 2, deltaX: dx, deltaY: dy };
        }
        return null;
      }, selector);
      assert.ok(movement, 'No native scroll can reveal ' + selector + ': ' + JSON.stringify(target));
      const point = await parentPoint(context, movement);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: movement.deltaX, deltaY: movement.deltaY });
      await settled(context);
    }
    throw new Error('Required action remains clipped: ' + selector);
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
      const doc = document.querySelector('.atlas-center-frame:not([hidden])')?.contentDocument;
      return { url: location.href, center: document.body.dataset.centerTool, width: innerWidth, documentWidth: document.documentElement.scrollWidth,
        childWidth: doc?.defaultView.innerWidth, childDocumentWidth: doc?.documentElement.scrollWidth,
        tab: doc?.querySelector('[data-workspace-page][aria-selected=true]')?.dataset.workspacePage,
        market: doc?.querySelector('[data-control="market"]')?.value, date: doc?.querySelector('[data-selected-date]')?.textContent,
        instrument: doc?.querySelector('.workspace-current-instrument')?.textContent,
        symbols: [...doc?.querySelectorAll('#data-body tr[data-asset-symbol]') || []].map(row => row.dataset.assetSymbol) };
    });
    assert.ok(new URL(result.url).pathname.startsWith(consolidatedPagesBase), label + ': parent URL escaped the Pages project root');
    assert.ok(result.documentWidth <= result.width + 1, label + ': outer document overflows');
    assert.ok(result.childDocumentWidth <= result.childWidth + 1, label + ': inner document overflows');
    evidence.states.push({ label, ...result }); return result;
  }
  async function marketTab(page) {
    await pointer(child, `[data-workspace-page="${page}"]`);
    await until(() => evaluate(child, page => document.querySelector(`[data-workspace-page="${page}"]`)?.getAttribute('aria-selected') === 'true', page), page);
  }
  async function navigate(id) {
    if (receipt.width <= 620) await pointer(cdp, '#mobile-details-toggle');
    await pointer(cdp, `.atlas-nav [data-atlas-page="${id}"]`);
    await until(() => evaluate(cdp, id => document.body.dataset.centerTool === id, id), 'navigation ' + id);
    await bindChild();
  }

  await until(() => evaluate(cdp, () => document.querySelector('.atlas-center-frame:not([hidden])')?.contentDocument?.querySelector('[data-workspace="market"]')), 'legacy US URL enters the unified workspace');
  await bindChild();
  await verifyOfflineRefresh({ phase: 'consolidated-initial-document' });
  await until(() => evaluate(child, () => document.querySelector('[data-ztd-chart="observed"] svg')), 'actual ztd diagnosis chart');
  const initial = await state('us');
  assert.equal(new URL(initial.url).pathname, `${consolidatedPagesBase}market-lab/`);
  assert.equal(initial.tab, 'market-us');
  evidence.diagnosisHeading = {
    title: await reveal(child, '.ml-price-card > header h3'),
    selector: await reveal(child, '[data-control="market"]'),
  };
  assert.ok(evidence.diagnosisHeading.title.box.width > 0, 'Diagnosis title must retain visible width beside the market selector');
  assert.match(evidence.diagnosisHeading.title.label, /미국 관측 차트/);
  await reveal(child, '[data-ztd-chart="observed"]'); await snap('market-us');
  await pointer(child, '.ml-price-card .ztd-root'); await key('Home', 'Home', 36); await settled(child);
  evidence.diagnosisFocus = await evaluate(child, readNativeInteractiveTarget, '.ml-price-card .ztd-root', true);
  evidence.diagnosisFocus.offset = await evaluate(child, () => getComputedStyle(document.activeElement).outlineOffset);
  assert.ok(complete(evidence.diagnosisFocus) && evidence.diagnosisFocus.inside && evidence.diagnosisFocus.outline !== 'none' && evidence.diagnosisFocus.outlineWidth >= 2,
    'Diagnosis chart must retain a visible keyboard focus ring');
  assert.equal(evidence.diagnosisFocus.offset, '-2px', 'Diagnosis focus must remain inside the clipped mobile figure');
  const alternative = await evaluate(child, () => {
    const select = document.querySelector('[data-control="market"]');
    return [...select.options].find(option => option.value !== select.value)?.value;
  });
  assert.ok(alternative); await select(child, '[data-control="market"]', alternative);
  await pointer(child, 'input[data-date="price"]'); await key('ArrowLeft', 'ArrowLeft', 37); await settled(child);
  const selected = await state('us-selected');
  await marketTab('market-kr'); await state('kr'); await marketTab('market-us');
  const restored = await state('us-restored'); assert.equal(restored.market, selected.market); assert.equal(restored.date, selected.date);
  await marketTab('scenario'); await reveal(child, '[data-ztd-chart="contributions"]');
  const before = await evaluate(child, () => document.querySelector('.ml-index strong').textContent);
  await pointer(child, '[data-action="negative"]');
  assert.notEqual(await evaluate(child, () => document.querySelector('.ml-index strong').textContent), before);
  await reveal(child, '[data-ztd-chart="contributions"]'); await state('scenario'); await snap('scenario');
  await marketTab('cashflow'); await pointer(child, '[data-action="economics-example"]');
  await until(() => evaluate(child, () => document.querySelectorAll('#ml-economics-output .ml-results > div').length === 5), 'calculated cashflow example');
  await reveal(child, '#ml-economics-output .ml-results');
  await state('cashflow'); await snap('cashflow');

  // The common outer symbol search and the inline chart search share destinations.
  await pointer(cdp, '.atlas-canvas-heading .symbol-selector-trigger');
  await type(cdp, '#symbol-search-dialog input', 'TQQQ');
  await pointer(cdp, '#symbol-option-TQQQ');
  await until(() => evaluate(child, () => document.querySelector('.rsi-price-line')?.getAttribute('d')?.length > 20), 'TQQQ actual price path');
  assert.match((await state('tqqq')).instrument, /TQQQ/); await snap('tqqq');
  async function chartSearch(query, symbol, page) {
    await type(child, '[aria-label="종목·지역 검색"]', query);
    await pointer(child, `[data-workspace-symbol="${symbol}"]`);
    await until(() => evaluate(cdp, page => document.body.dataset.centerTool === page, page), 'chart ' + symbol);
    await until(() => evaluate(child, () => !document.querySelector('.workspace-search-popover')), 'search closes after selection');
  }
  await chartSearch('서울', 'HOUSING-SEOUL', 'housing');
  await until(() => evaluate(child, () => document.querySelector('.housing-price')?.getAttribute('d')?.length > 20), 'Seoul observed price chart');
  assert.equal(await evaluate(child, () => document.querySelector('[aria-label="부동산 지역"]').value), 'seoul');
  await state('housing-seoul'); await snap('housing');
  await chartSearch('하이퍼리퀴드', 'HYPE', 'themes');
  await until(() => evaluate(child, () => document.querySelector('.theme-chart-readout')), 'HYPE actual chart');
  assert.match(await evaluate(child, () => document.querySelector('.theme-identity').textContent), /HYPE\/USDC/);
  await state('hype'); await snap('hype');

  await navigate('data');
  await until(() => evaluate(child, () => document.querySelectorAll('#data-body tr[data-asset-symbol]').length === 20), '20 committed asset rows');
  await select(child, '#asset-sector-filter', '디지털 자산');
  assert.deepEqual((await state('digital-assets')).symbols, ['BTC', 'ETH', 'HYPE']);
  await until(() => evaluate(cdp, () => document.querySelectorAll('.center-data-actions button:not(:disabled)').length === 4), 'all four hosted data actions enabled');
  assert.equal(await evaluate(child, () => document.querySelector('.daily-heading-actions').checkVisibility()), false);
  await snap('digital-assets');
  await select(child, '#asset-columns', 'performance');
  assert.equal(await evaluate(child, () => document.querySelector('.asset-comparison-table').dataset.columns), 'performance');
  await pointer(child, '#asset-filter-reset');
  assert.equal((await state('assets-reset')).symbols.length, 20);

  await navigate('ipo');
  await until(() => evaluate(child, () => /년.*월/.test(document.querySelector('.ipo-page-label')?.textContent || '')), 'IPO actual month');
  evidence.ipo = await evaluate(child, () => {
    const rect = selector => { const b = document.querySelector(selector).getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
    return { month: document.querySelector('.ipo-page-label').textContent, controls: rect('.ipo-calendar-nav'), content: rect('.ipo-pages'), search: rect('.ipo-toolbar') };
  });
  assert.ok(evidence.ipo.controls.bottom <= evidence.ipo.content.top + 1, 'Calendar navigation must not overlap calendar content');
  assert.ok(evidence.ipo.search.bottom <= evidence.ipo.controls.top + 1, 'Search and month navigation must be separate flow rows');
  await snap('ipo');
  await pointer(child, '[data-ipo-page="list"]');
  await until(() => evaluate(child, () => document.querySelector('.ipo-page-label').textContent === '전체 목록'), 'IPO list');
  await pointer(child, '[data-ipo-page="today"]');
  await until(() => evaluate(child, month => document.querySelector('.ipo-page-label').textContent === month && document.querySelector('[data-ipo-page="today"]').getAttribute('aria-pressed') === 'true', evidence.ipo.month), 'IPO original month restored');
  await state('ipo-restored');
}
