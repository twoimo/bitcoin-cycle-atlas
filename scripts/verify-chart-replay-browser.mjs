import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Uses the existing native-CDP harness. These are real page interactions, not
// renderer mocks, and do not claim prospective forecast accuracy.
export const chartReplayBrowserCases = [
  { symbol: 'BTCUSD', surface: 'btc', width: 1440, height: 900, touch: false },
  { symbol: 'BTCUSD', surface: 'btc', width: 320, height: 568, touch: true },
  { symbol: 'BTCUSD', surface: 'btc', width: 900, height: 430, touch: true },
  { symbol: 'ETHUSD', surface: 'eth', width: 1440, height: 900, touch: false },
  { symbol: 'ETHUSD', surface: 'eth', width: 320, height: 568, touch: true },
  { symbol: 'MSTR', surface: 'mstr', width: 1440, height: 900, touch: false },
  { symbol: 'BMNR', surface: 'bmnr', width: 390, height: 844, touch: true },
].map(spec => ({ ...spec, page: 'chart-replay-' + spec.surface, chartReplay: true,
  route: '/?symbol=' + spec.symbol + '&granularity=daily&type=line' }));

const digest = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const day = date => Date.parse(date + 'T00:00:00Z') / 86400000;
const dateAt = value => new Date(value * 86400000).toISOString().slice(0, 10);

// This oracle reads the preserved venue rows directly. It deliberately does
// not import the application aggregation or use a later completed-week row.
function disclosedBitcoinWeeks(rows, cursor) {
  const groups = new Map();
  for (const row of rows.filter(row => row.date <= cursor)) {
    const monday = day(row.date) - (new Date(row.date + 'T00:00:00Z').getUTCDay() + 6) % 7;
    if (!groups.has(monday)) groups.set(monday, []);
    groups.get(monday).push(row);
  }
  return [...groups].flatMap(([monday, values]) => {
    const days = Math.min(7, day(cursor) - monday + 1);
    if (values.length !== days || values.some((row, index) => row.date !== dateAt(monday + index))) return [];
    return [{ date: values.at(-1).date, periodStart: dateAt(monday), periodEnd: dateAt(monday + 6),
      open: values[0].open, high: Math.max(...values.map(row => row.high)), low: Math.min(...values.map(row => row.low)), close: values.at(-1).close,
      volume: values.reduce((total, row) => total + row.volume, 0), daysIncluded: values.length, complete: values.length === 7 }];
  });
}

export async function verifyChartReplaySurface(api) {
  const { cdp, browser, browserContextId, receipt, root, outputDirectory, evaluate, until, settled, click: nativeClick, bounds, visibleBounds, screenshot, verifyOfflineRefresh } = api;
  const { symbol, width, height, touch } = receipt;
  const crypto = ['BTCUSD', 'ETHUSD'].includes(symbol), btc = symbol === 'BTCUSD';
  const chartSelector = btc ? '#lab-chart' : symbol === 'ETHUSD' ? '#eth-chart' : '#equity-chart';
  const panel = '.chart-replay-controls', control = name => panel + ' [data-cr="' + name + '"]';
  const decision = name => '[data-cr="' + name + '"]';
  const prefix = receipt.page + '-' + width + 'x' + height;
  const evidence = receipt.chartReplay = { symbol, nativeInput: true, storageIsolation: 'independent-browser-context', states: [], exports: [], lifecycle: [],
    timing: [], weekly: [], selections: [], storage: [], floatingBar: [], popovers: [], dateEditors: [], removedBackwardInputs: [],
    scope: 'Existing main chart node, real page controls, native pointer/touch/keyboard, current interval and range, disclosed daily/weekly prefixes, explicit session decisions, and downloaded visible-frame JSON. Current-vintage replay is retrospective.' };
  assert.ok(browserContextId, 'Replay scenarios must not share persisted user sessions across viewport cases');
  const ledger = resolve(root, 'dist/data', btc ? 'forecast-ledger' : 'asset-forecast-ledger');
  const ledgerIndex = JSON.parse(await readFile(resolve(ledger, 'index.json'), 'utf8'));
  const raw = async path => JSON.parse(await readFile(resolve(root, 'dist', path), 'utf8'));
  const priceArchive = await raw(btc ? 'data/btc-daily.json' : symbol === 'ETHUSD' ? 'data/replay-eth-ohlc.json' : 'data/' + symbol.toLowerCase() + '-ohlc.json');
  const btcCandles = btc ? (await raw('data/btc-volume.json')).bars : null;
  const initialAtlas = btc ? await raw('data/project-origin-btc-2026-10-21.json') : null;
  let currentAtlasModel = null, originalAtlasViewport = null, originalChartBox = null;
  const archiveRows = mode => btc ? ['recorded', 'project-baseline'].includes(mode) ? priceArchive.prices.map(([date, price]) => ({ date, price })) : btcCandles.map(row => ({ ...row, price: row.close })) :
    (symbol === 'ETHUSD' ? priceArchive.dailyHistory.candles : priceArchive.candles).map(row => ({ ...row, date: row.date.slice(0, 10), price: row.close }));
  const storedBytes = () => evaluate(cdp, symbol => localStorage.getItem('atlas-chart-replay-v1:' + symbol), symbol);

  const menuIsOpen = () => evaluate(cdp, selector => Boolean(document.querySelector(selector)?.getClientRects().length), control('select-panel'));
  async function openMenu(view = 'start') {
    if (!await menuIsOpen()) await nativeClick(cdp, control('select-menu'));
    await until(menuIsOpen, 'native Select bar popover opens');
    if (view === null) return;
    const currentView = () => evaluate(cdp, selector => document.querySelector(selector).dataset.menuView, control('select-panel'));
    if (await currentView() !== view) {
      if (await currentView() !== 'start') {
        await nativeClick(cdp, control('menu-back'));
        await until(async () => await currentView() === 'start', 'native menu back returns to four starting actions');
      }
      if (view !== 'start') {
        const selector = control(view === 'date' ? 'select-date' : 'menu-settings');
        await revealOwnedControl(selector); await nativeClick(cdp, selector);
      }
    }
    await until(async () => await currentView() === view, 'native replay menu view ' + view);
  }
  const openDate = () => openMenu('date');
  const openForecast = () => openMenu('forecast');
  async function closeMenu() {
    if (await menuIsOpen()) await nativeClick(cdp, control('select-close'));
    assert.equal(await menuIsOpen(), false, 'The Select bar close action did not dismiss its popover');
  }
  async function revealOwnedControl(selector) {
    // The expanded menu owns vertical scrolling. Wheel real UI content into
    // its visible region, including the area below its sticky close header.
    // Never expose a hidden control by rewriting its style or invoking it.
    for (let attempt = 0; attempt < 10; attempt++) {
      const target = await evaluate(cdp, selector => {
        const node = document.querySelector(selector), owner = node?.closest('[data-cr="select-panel"],.chart-replay-choice');
        if (!owner || !node.getClientRects().length) return null;
        const box = node.getBoundingClientRect(), area = owner.getBoundingClientRect();
        const heading = owner.querySelector('.chart-replay-menu-heading'), footer = owner.querySelector(':scope > div:last-child');
        const top = heading && !heading.contains(node) ? Math.max(area.top + owner.clientTop, heading.getBoundingClientRect().bottom) : area.top + owner.clientTop;
        const bottom = footer && getComputedStyle(footer).position === 'sticky' && !footer.contains(node) ? Math.min(area.top + owner.clientTop + owner.clientHeight, footer.getBoundingClientRect().top) : area.top + owner.clientTop + owner.clientHeight;
        const delta = box.bottom > bottom - 3 ? box.bottom - bottom + 4 : box.top < top + 3 ? box.top - top - 4 : 0;
        return { delta, x: area.left + 6, y: top + Math.max(8, Math.min(24, (bottom - top) / 2)), scrollTop: owner.scrollTop,
          box: { top: box.top, bottom: box.bottom }, clip: { top, bottom } };
      }, selector);
      if (!target || Math.abs(target.delta) < 1) return;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: target.x, y: target.y, deltaX: 0, deltaY: target.delta });
      await settled(cdp);
      const current = await evaluate(cdp, selector => document.querySelector(selector).closest('[data-cr="select-panel"],.chart-replay-choice').scrollTop, selector);
      assert.notEqual(current, target.scrollTop, 'The owned replay popover cannot reveal its control: ' + selector + ' ' + JSON.stringify(target));
    }
    throw new Error('Replay popover scrolling did not expose ' + selector);
  }
  async function click(connection, selector) {
    const target = await evaluate(cdp, selector => {
      const node = document.querySelector(selector);
      const view = node?.closest('[data-cr="start-view"],[data-cr="date-view"],[data-cr="forecast-view"]')?.dataset.cr.replace('-view', '') ?? null;
      return { menu: Boolean(node?.closest('[data-cr="select-panel"]')), view, toggle: node?.dataset.cr === 'select-menu' };
    }, selector);
    if (target.menu) {
      if (target.view === 'date') await openDate();
      else if (target.view === 'forecast') await openForecast();
      else await openMenu(target.view);
    }
    else if (!target.toggle) await closeMenu();
    await revealOwnedControl(selector);
    await nativeClick(connection, selector);
  }
  async function verifyFloatingBar() {
    const geometry = await evaluate(cdp, ({ chartSelector, panel }) => {
      const svg = document.querySelector(chartSelector), plot = svg.closest('.atlas-plot'), root = document.querySelector(panel);
      const bar = root.querySelector('.chart-replay-bar'), actions = root.querySelector('.chart-replay-actions'), exit = root.querySelector('[data-cr="exit"]');
      const rect = node => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
      const box = rect(svg), point = { x: box.left + box.width * .5, y: box.top + box.height * .35 };
      return { chart: box, plot: { ...rect(plot), clientHeight: plot.clientHeight }, root: { ...rect(root), pointerEvents: getComputedStyle(root).pointerEvents, background: getComputedStyle(root).backgroundColor },
        bar: rect(bar), actions: { ...rect(actions), scrollLeft: actions.scrollLeft, scrollWidth: actions.scrollWidth, clientWidth: actions.clientWidth, flexWrap: getComputedStyle(actions).flexWrap },
        controls: [...actions.children].map(node => ({ name: node.dataset.cr, ...rect(node) })), exit: { ...rect(exit), separate: !bar.contains(exit) },
        menuHidden: root.querySelector('[data-cr="select-panel"]').hidden, pointerReachesChart: svg.contains(document.elementFromPoint(point.x, point.y)),
        settingsInPopover: ['date', 'start', 'display', 'mode', 'record', 'horizon', 'details', 'pooled-retry', 'scrub', 'export'].every(name => root.querySelector('[data-cr="select-panel"]').contains(root.querySelector('[data-cr="' + name + '"]'))),
        removedControls: ['previous', 'random', 'resume'].flatMap(name => [...root.querySelectorAll('[data-cr="' + name + '"]')].map(() => name)),
        pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), scrollX, scrollY,
        cursor: svg.dataset.replayCursor ?? null, hash: svg.dataset.replayOutputHash ?? null, viewStart: svg.dataset.replayViewStart ?? null, viewEnd: svg.dataset.replayViewEnd ?? null };
    }, { chartSelector, panel });
    const observedGeometry = { label: 'floating-controls-observed-geometry', validated: false, ...geometry, originalChart: originalChartBox };
    evidence.floatingBar.push(observedGeometry);
    assert.equal(geometry.root.pointerEvents, 'none', 'The positioning overlay blocks the chart');
    assert.match(geometry.root.background, /rgba\(0, 0, 0, 0\)|transparent/, 'A full-width replay surface still covers the plot');
    assert.equal(geometry.menuHidden, true); assert.equal(geometry.settingsInPopover, true); assert.equal(geometry.pointerReachesChart, true);
    assert.deepEqual(geometry.removedControls, [], 'Removed previous/duplicate random/menu-resume controls remain in the DOM');
    assert.deepEqual(geometry.controls.map(node => node.name), ['first', 'select-menu', 'pick', 'play', 'next', 'speed', 'update-interval', 'live']);
    assert.equal(geometry.actions.flexWrap, 'nowrap');
    const centerY = geometry.bar.top + geometry.bar.height / 2;
    for (const node of geometry.controls) assert.ok(Math.abs(node.top + node.height / 2 - centerY) <= 1, 'Replay controls wrapped into a second row');
    assert.ok(geometry.bar.height <= (touch || width <= 620 ? 57 : 45), 'The floating replay bar is no longer compact');
    assert.ok(geometry.bar.top > geometry.plot.top + geometry.plot.height / 2, 'Replay controls returned to a large upper panel');
    assert.ok(geometry.plot.bottom - geometry.bar.bottom >= 8, 'The floating bar is outside the chart');
    assert.ok(geometry.chart.height >= originalChartBox.height - 1, 'Entering replay reduced the existing chart height');
    assert.ok(geometry.chart.height >= geometry.plot.clientHeight - 2, 'The chart does not own its full allocated plot height');
    assert.ok(geometry.pageWidth <= width + 1); assert.equal(geometry.scrollX, 0);
    assert.equal(geometry.exit.separate, true); assert.ok(Math.abs(geometry.exit.width - 44) <= 1 && Math.abs(geometry.exit.height - 44) <= 1);
    assert.ok(Math.abs(geometry.plot.right - geometry.exit.right - 8) <= 1, 'The exit X is not at the right of the chart');
    assert.ok(Math.abs(geometry.exit.top + geometry.exit.height / 2 - centerY) <= 1, 'Exit X does not align with the floating controls');
    if (width > 620) {
      assert.ok(geometry.bar.width <= 421, 'Desktop replay expanded into a full-width toolbar');
      assert.ok(Math.abs((geometry.bar.left + geometry.bar.right - geometry.plot.left - geometry.plot.right) / 2) <= 1, 'Desktop replay is not centered on the current chart');
    } else {
      assert.ok(geometry.bar.left >= geometry.plot.left + 7 && geometry.bar.right <= geometry.exit.left - 7, 'Mobile replay controls overlap the separate exit X');
      for (const node of geometry.controls) assert.ok(node.width >= 43 && node.height >= 43, 'Mobile replay lost its 44px control target: ' + node.name);
    }
    observedGeometry.validated = true;
    await screenshot(cdp, prefix + '-floating-bar.png', receipt);
    if (touch && width <= 620) {
      assert.ok(geometry.actions.scrollWidth > geometry.actions.clientWidth + 20, 'The narrow toolbar does not provide an owned horizontal scroll area');
      const scroll = () => evaluate(cdp, () => { const node = document.querySelector('.chart-replay-actions'); return { left: node.scrollLeft, maximum: node.scrollWidth - node.clientWidth }; });
      const swipe = async direction => {
        const b = await bounds(cdp, '.chart-replay-actions'), distance = Math.min(150, b.width * .65);
        const x = direction < 0 ? b.right - 12 : b.left + 12, y = b.top + b.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
        for (const fraction of [.2, .45, .7, 1]) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + direction * distance * fraction, y, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
          await delay(30);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settled(cdp);
      };
      const before = await scroll();
      for (let i = 0; i < 4 && (await scroll()).left < before.maximum - 1; i++) await swipe(-1);
      const after = await scroll(); assert.ok(after.left > before.left + 20 && after.left >= after.maximum - 1, 'Native touch did not expose the right end of the replay bar');
      const live = await bounds(cdp, control('live'));
      assert.ok(live.left >= geometry.actions.left - 1 && live.right <= geometry.actions.right + 1, 'The Live action cannot be reached by native toolbar scrolling');
      await screenshot(cdp, prefix + '-floating-bar-native-scroll.png', receipt);
      const unchanged = await evaluate(cdp, selector => { const svg = document.querySelector(selector); return { cursor: svg.dataset.replayCursor ?? null, hash: svg.dataset.replayOutputHash ?? null,
        viewStart: svg.dataset.replayViewStart ?? null, viewEnd: svg.dataset.replayViewEnd ?? null, scrollX, scrollY, pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }; }, chartSelector);
      for (const name of ['cursor', 'hash', 'viewStart', 'viewEnd', 'scrollX', 'scrollY']) assert.equal(unchanged[name], geometry[name], 'Toolbar scrolling changed the chart or document ' + name);
      assert.ok(unchanged.pageWidth <= width + 1);
      for (let i = 0; i < 4 && (await scroll()).left > 1; i++) await swipe(1);
      assert.ok((await scroll()).left <= 1, 'Native toolbar swipe could not return to Select bar');
      evidence.floatingBar.push({ label: 'native-horizontal-toolbar-scroll-without-chart-or-page-scroll', before, after, unchanged });
    }
  }
  async function verifyLandingMenu(label, capture = false) {
    await openMenu();
    const observed = await evaluate(cdp, selector => {
      const menu = document.querySelector(selector), q = name => menu.querySelector('[data-cr="' + name + '"]');
      const shown = node => Boolean(node?.getClientRects().length);
      return { view: menu.dataset.menuView, title: q('menu-title').textContent, nonmodal: menu.getAttribute('aria-modal') === null,
        actions: [...q('start-view').querySelectorAll('button')].map(node => ({ name: node.dataset.cr, text: node.textContent, visible: shown(node), disabled: node.disabled })),
        visibleInputs: [...menu.querySelectorAll('input,select,textarea')].filter(shown).map(node => node.dataset.cr),
        dateHidden: q('date-view').hidden, forecastHidden: q('forecast-view').hidden, detailsHidden: q('detail-panel').hidden,
        backHidden: q('menu-back').hidden, settingsVisible: shown(q('menu-settings')), settingsExpanded: q('menu-settings').getAttribute('aria-expanded'),
        misplacedControls: [...q('start-view').querySelectorAll('[data-cr]')].filter(node => !['select-chart', 'select-date', 'select-random', 'select-first'].includes(node.dataset.cr)).map(node => node.dataset.cr) };
    }, control('select-panel'));
    const recorded = { label, validated: false, ...observed }; evidence.popovers.push(recorded);
    assert.equal(observed.view, 'start'); assert.equal(observed.title, 'Select bar'); assert.equal(observed.nonmodal, true);
    assert.deepEqual(observed.actions.map(node => node.name), ['select-chart', 'select-date', 'select-random', 'select-first']);
    assert.ok(observed.actions.every(node => node.visible), 'The four start actions are not rendered in their landing view');
    assert.deepEqual(observed.visibleInputs, [], 'Select bar exposed date or forecast settings before a secondary action');
    assert.deepEqual(observed.misplacedControls, []);
    assert.equal(observed.dateHidden, true); assert.equal(observed.forecastHidden, true); assert.equal(observed.detailsHidden, true);
    assert.equal(observed.backHidden, true); assert.equal(observed.settingsVisible, true); assert.equal(observed.settingsExpanded, 'false');
    for (const { name } of observed.actions) { await revealOwnedControl(control(name)); visibleBounds(await bounds(cdp, control(name)), width, height); }
    visibleBounds(await bounds(cdp, control('menu-settings')), width, height); visibleBounds(await bounds(cdp, control('select-close')), width, height);
    recorded.validated = true;
    if (capture) await screenshot(cdp, prefix + '-' + label + '.png', receipt);
    return observed;
  }
  async function verifyPopoverLifecycle() {
    const saved = await storedBytes(), before = await evaluate(cdp, selector => ({ cursor: document.querySelector(selector).dataset.replayCursor, hash: document.querySelector(selector).dataset.replayOutputHash }), chartSelector);
    await verifyLandingMenu('select-bar-only-four-start-actions', true);
    const menu = await bounds(cdp, control('select-panel')); visibleBounds(menu, width, height);
    assert.equal(await evaluate(cdp, selector => document.querySelector(selector).getAttribute('aria-modal'), control('select-panel')), null, 'Select bar became a blocking modal');
    await click(cdp, control('select-date'));
    const date = await evaluate(cdp, selector => {
      const node = document.querySelector(selector), menu = node.closest('[data-cr="select-panel"]'), box = node.getBoundingClientRect(), area = menu.getBoundingClientRect();
      const heading = menu.querySelector('.chart-replay-menu-heading').getBoundingClientRect();
      return { focused: document.activeElement === node, open: !menu.hidden, view: menu.dataset.menuView, value: node.value,
        forecastHidden: menu.querySelector('[data-cr="forecast-view"]').hidden, startHidden: menu.querySelector('[data-cr="start-view"]').hidden,
        top: box.top, bottom: box.bottom, left: box.left, right: box.right,
        clipTop: Math.max(area.top + menu.clientTop, heading.bottom), clipBottom: area.top + menu.clientTop + menu.clientHeight,
        hit: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === node, scrollTop: menu.scrollTop };
    }, control('date'));
    assert.equal(date.focused, true); assert.equal(date.open, true); assert.equal(date.hit, true, 'Select date focused an input hidden under another control');
    assert.equal(date.view, 'date'); assert.equal(date.forecastHidden, true); assert.equal(date.startHidden, true);
    assert.equal(date.value, before.cursor, 'The date view displayed the next hidden bar instead of the current replay cursor');
    assert.ok(date.top >= date.clipTop - 1 && date.bottom <= date.clipBottom + 1, 'Select date left the native input outside the menu viewport');
    visibleBounds(await bounds(cdp, control('select-close')), width, height);
    await screenshot(cdp, prefix + '-floating-menu-date.png', receipt);
    await key('Escape', 'Escape', 27);
    assert.equal(await menuIsOpen(), false); assert.equal(await evaluate(cdp, selector => document.activeElement === document.querySelector(selector), control('select-menu')), true);
    await verifyLandingMenu('escape-reopens-the-four-action-landing');
    await click(cdp, control('menu-settings'));
    const settings = await evaluate(cdp, selector => {
      const menu = document.querySelector(selector), q = name => menu.querySelector('[data-cr="' + name + '"]');
      return { view: menu.dataset.menuView, title: q('menu-title').textContent, startHidden: q('start-view').hidden, dateHidden: q('date-view').hidden,
        forecastHidden: q('forecast-view').hidden, backVisible: Boolean(q('menu-back').getClientRects().length),
        contained: ['display', 'mode', 'record', 'horizon', 'details', 'pooled-retry', 'scrub', 'export'].every(name => q('forecast-view').contains(q(name))),
        dateOutsideForecast: !q('forecast-view').contains(q('date')) };
    }, control('select-panel'));
    assert.equal(settings.view, 'forecast'); assert.match(settings.title, /예측·평가/); assert.equal(settings.startHidden, true); assert.equal(settings.dateHidden, true);
    assert.equal(settings.forecastHidden, false); assert.equal(settings.backVisible, true); assert.equal(settings.contained, true); assert.equal(settings.dateOutsideForecast, true);
    visibleBounds(await bounds(cdp, control('menu-back')), width, height);
    await click(cdp, control('menu-back'));
    await verifyLandingMenu('forecast-back-restores-four-start-actions');
    await openForecast(); await closeMenu(); await verifyLandingMenu('settings-close-reopens-four-start-actions');
    const outside = await evaluate(cdp, selector => {
      const svg = document.querySelector(selector), b = svg.getBoundingClientRect();
      return [[3, b.height * .25], [b.width - 3, b.height * .25], [b.width * .5, 3], [b.width * .1, b.height * .1]]
        .map(([dx, dy]) => ({ x: b.left + dx, y: b.top + dy })).find(point => svg.contains(document.elementFromPoint(point.x, point.y)));
    }, chartSelector);
    assert.ok(outside, 'An open nonmodal Select bar menu leaves no chart target');
    await pointAction(touch ? 'tap' : 'click', outside);
    assert.equal(await menuIsOpen(), false, 'A native outside click did not close Select bar');
    const after = await evaluate(cdp, selector => ({ cursor: document.querySelector(selector).dataset.replayCursor, hash: document.querySelector(selector).dataset.replayOutputHash }), chartSelector);
    assert.deepEqual(after, before, 'Menu focus or dismissal changed the confirmed replay cutoff');
    await storedUnchanged(saved, 'floating-menu-focus-escape-and-outside-click-do-not-save');
    evidence.popovers.push({ label: 'native-secondary-date-settings-back-escape-and-outside-dismissal', menu, date, settings, before, after });
  }

  function assertSameReplayFrame(actual, expected, label, { selectionPreview = false } = {}) {
    for (const field of ['state', 'origin', 'cursor', 'playbackStartDate', 'index', 'actualThrough', 'actualCount', 'observedCandleCount', 'volumeCount', 'frequency',
      'outputHash', 'forecastValueSignature', 'annotationSignature', 'priceMinimum', 'priceMaximum', 'viewStart', 'viewEnd']) {
      assert.equal(actual[field], expected[field], label + ' changed ' + field);
    }
    for (const field of ['candles', 'volumeBars', 'observedIndicatorDates']) assert.deepEqual(actual[field], expected[field], label + ' changed ' + field);
    if (selectionPreview) {
      assert.equal(actual.origins, 0, 'Selecting a new start still paints a committed origin');
      assert.equal(actual.cursors, 0, 'Selecting a new start still paints a committed cutoff');
    } else assert.deepEqual(actual.confirmedCursorXs, expected.confirmedCursorXs, label + ' changed confirmedCursorXs');
  }
  async function verifySavedDateEditor(before, label) {
    const saved = await storedBytes(); assert.ok(saved);
    assert.equal(JSON.parse(saved).cursorDate, before.cursor);
    await openDate();
    const observed = await evaluate(cdp, selector => {
      const menu = document.querySelector(selector), q = name => menu.querySelector('[data-cr="' + name + '"]'), context = q('date-context');
      return { view: menu.dataset.menuView, value: q('date').value, minimum: q('date').min, maximum: q('date').max,
        label: q('date-label').textContent, ariaLabel: q('date').getAttribute('aria-label'), context: context.textContent, hint: q('date-hint').textContent,
        contextReadOnly: !context.matches('input,select,textarea,[contenteditable="true"]') && !context.querySelector('input,select,textarea,[contenteditable="true"]'),
        focused: document.activeElement === q('date') };
    }, control('select-panel'));
    const expected = before.cursor < observed.minimum ? observed.minimum : before.cursor > observed.maximum ? observed.maximum : before.cursor;
    const next = archiveRows(before.mode).find(row => row.date > before.cursor)?.date;
    assert.equal(observed.view, 'date'); assert.equal(observed.value, expected); assert.equal(observed.focused, true); assert.equal(observed.contextReadOnly, true);
    assert.equal(observed.label, '새 시작점 날짜'); assert.equal(observed.ariaLabel, '새 시작점 날짜'); assert.match(observed.hint, /이 날짜 선택.*적용/);
    assert.ok(observed.context.includes('현재 공개: ' + before.cursor));
    assert.ok(observed.context.includes('다음 봉: ' + (next ?? '확보한 자료 끝')));
    assertSameReplayFrame(await snapshot(label + '-editor-open'), before, 'Opening the saved-date editor');
    await screenshot(cdp, prefix + '-' + label + '-current-date.png', receipt);
    // A native, unconfirmed edit must neither seek nor overwrite the save.
    await click(cdp, control('date'));
    for (let segment = 0; segment < 5; segment++) await key('ArrowRight', 'ArrowRight', 39, 0, false);
    await key('ArrowDown', 'ArrowDown', 40);
    const draft = await evaluate(cdp, selector => document.querySelector(selector).value, control('date'));
    assert.equal(draft, String(Number(expected.slice(0, 4)) - 1) + expected.slice(4));
    assertSameReplayFrame(await snapshot(label + '-unapplied-date'), before, 'Editing an unconfirmed start date');
    await storedUnchanged(saved, label + '-date-editor-does-not-save');
    await click(cdp, control('menu-back')); await verifyLandingMenu(label + '-back-cancels-date-draft');
    await openDate();
    const reopened = await evaluate(cdp, selector => document.querySelector(selector).value, control('date'));
    assert.equal(reopened, expected, 'Reopening Select date retained an unapplied date instead of the current cursor');
    assertSameReplayFrame(await snapshot(label + '-date-reopened'), before, 'Reopening Select date');
    await closeMenu(); await storedUnchanged(saved, label + '-date-close-keeps-saved-session');
    evidence.dateEditors.push({ label, originalStart: before.playbackStartDate, cursor: before.cursor, next, ...observed, canceledDraft: draft, reopened });
  }
  async function verifyRemovedBackwardInputs(before, label) {
    const saved = await storedBytes();
    assert.equal(before.previousPresent, false, 'The removed previous-bar button remains in the replay controls');
    await click(cdp, chartSelector);
    assert.equal(await evaluate(cdp, selector => document.activeElement === document.querySelector(selector), chartSelector), true, 'Native backward-shortcut check did not focus the chart');
    for (const modifiers of [8, 0]) {
      await key('ArrowLeft', 'ArrowLeft', 37, modifiers);
      const after = await snapshot(label + (modifiers ? '-shift-left-no-op' : '-left-no-op'));
      assertSameReplayFrame(after, before, 'Removed ' + (modifiers ? 'Shift+Left' : 'Left') + ' input');
      evidence.removedBackwardInputs.push({ label, key: modifiers ? 'Shift+Left' : 'Left', cursor: after.cursor, index: after.index, outputHash: after.outputHash,
        priceDomain: [after.priceMinimum, after.priceMaximum], observedCandleCount: after.observedCandleCount, unchanged: true });
    }
    await storedUnchanged(saved, label + '-removed-backward-shortcuts-do-not-save');
  }

  async function key(value, code, number, modifiers = 0, wait = true) {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: value, code, windowsVirtualKeyCode: number, nativeVirtualKeyCode: number, modifiers,
      ...(type === 'keyDown' && value === 'Enter' && !modifiers ? { text: '\r', unmodifiedText: '\r' } : {}) });
    if (wait) await settled(cdp);
  }
  async function select(selector, value) {
    const choices = await evaluate(cdp, selector => [...document.querySelector(selector).options].filter(option => !option.disabled).map(option => option.value), selector);
    const index = choices.indexOf(value); assert.ok(index >= 0, 'Unavailable native option: ' + value);
    await click(cdp, selector); await key('Home', 'Home', 36, 0, false);
    for (let i = 0; i < index; i++) await key('ArrowDown', 'ArrowDown', 40, 0, false);
    await key('Enter', 'Enter', 13);
    await until(() => evaluate(cdp, ({ selector, value }) => document.querySelector(selector)?.value === value, { selector, value }), 'native replay selection ' + value);
  }
  async function ready(selecting = false) {
    await until(async () => {
      const value = await evaluate(cdp, selector => ({ state: document.querySelector(selector)?.dataset.state,
        painted: Boolean(document.querySelector('svg[data-chart-replay-active="true"] [data-chart-replay-overlay]')),
        message: document.querySelector('.chart-replay-hud [role="status"]')?.textContent }), panel);
      if (value.state === 'error') throw new Error('Main-chart replay failed: ' + value.message);
      return value.painted && (selecting ? value.state === 'selecting' : ['paused', 'ended', 'playing'].includes(value.state));
    }, selecting ? 'main chart start selection' : 'main chart replay ready');
    await settled(cdp);
  }
  async function pickerReady() {
    await until(() => evaluate(cdp, selector => document.querySelector(selector)?.dataset.replaySelecting === 'true', chartSelector), 'native scissors start-point selection');
    await settled(cdp);
  }
  async function storedUnchanged(before, label) {
    const after = await storedBytes();
    assert.equal(after, before, label + ' changed the saved session without exit confirmation');
    evidence.storage.push({ label, unchanged: true, bytes: after?.length ?? 0, sha256: after === null ? null : digest(after) });
  }
  async function exitReplay(label, { save = true, cancelFirst = false, opener = 'exit' } = {}) {
    const before = await snapshot(label + '-before-dialog'), savedBefore = await storedBytes();
    let backgroundChecked = false;
    const open = async () => {
      await click(cdp, control(opener));
      await until(() => evaluate(cdp, selector => Boolean(document.querySelector(selector)?.getClientRects().length), decision('exit-confirm')), 'explicit replay exit decision');
      const state = await evaluate(cdp, selector => {
        const input = document.querySelector(selector), dialog = input.closest('[role="dialog"],dialog');
        return { type: input.type, checked: input.checked, dialog: Boolean(dialog?.getClientRects().length),
          active: document.documentElement.dataset.chartReplayActive === 'true' };
      }, decision('exit-save'));
      assert.equal(state.type, 'checkbox'); assert.equal(state.checked, true); assert.equal(state.dialog, true); assert.equal(state.active, true);
      evidence.floatingBar.push({ label: label + '-exit-decision', opener, defaultSaveChecked: state.checked });
      visibleBounds(await bounds(cdp, decision('exit-confirm')), width, height);
      visibleBounds(await bounds(cdp, decision('exit-cancel')), width, height);
      await storedUnchanged(savedBefore, label + '-dialog-open');
      if (cancelFirst && !touch && !backgroundChecked) {
        const behind = await evaluate(cdp, selector => {
          const svg = document.querySelector(selector), box = svg.getBoundingClientRect();
          const point = [[.1, .1], [.1, .5], [.9, .1], [.9, .8]].map(([x, y]) => ({ x: box.left + box.width * x, y: box.top + box.height * y }))
            .find(point => svg.contains(document.elementFromPoint(point.x, point.y)));
          return { point, cursor: svg.dataset.replayCursor, hash: svg.dataset.replayOutputHash,
            inspect: document.querySelector('.chart-replay-inspect').textContent,
            livePanels: document.querySelectorAll('#chart-reader:not([hidden]),#workspace-dialog[open],#indicator-library[open]').length };
        }, chartSelector);
        assert.ok(behind.point, 'Desktop exit dialog leaves no real chart target for background-input verification');
        await pointAction('click', behind.point);
        await key('ArrowRight', 'ArrowRight', 39, 8); await key('ArrowDown', 'ArrowDown', 40, 8);
        const blocked = await evaluate(cdp, selector => {
          const svg = document.querySelector(selector); return { cursor: svg.dataset.replayCursor, hash: svg.dataset.replayOutputHash,
            inspect: document.querySelector('.chart-replay-inspect').textContent,
            livePanels: document.querySelectorAll('#chart-reader:not([hidden]),#workspace-dialog[open],#indicator-library[open]').length,
            exitVisible: Boolean(document.querySelector('[data-cr="exit-confirm"]').getClientRects().length),
            state: document.querySelector('.chart-replay-controls').dataset.state };
        }, chartSelector);
        assert.equal(blocked.cursor, behind.cursor); assert.equal(blocked.hash, behind.hash); assert.equal(blocked.inspect, behind.inspect);
        assert.equal(blocked.livePanels, behind.livePanels, 'Chart interaction opened a live panel behind the replay exit choice');
        assert.equal(blocked.exitVisible, true); assert.notEqual(blocked.state, 'playing');
        await storedUnchanged(savedBefore, label + '-modal-blocks-background-input');
        evidence.lifecycle.push({ label: label + '-modal-blocks-native-chart-click-and-shortcuts', cursor: blocked.cursor, outputHash: blocked.hash, livePanels: blocked.livePanels });
        backgroundChecked = true;
      }
    };
    await open();
    if (cancelFirst) {
      await screenshot(cdp, prefix + '-' + label + '-save-choice.png', receipt);
      await click(cdp, decision('exit-cancel')); await ready();
      const canceled = await snapshot(label + '-exit-canceled');
      assert.equal(canceled.cursor, before.cursor); assert.equal(canceled.outputHash, before.outputHash);
      await storedUnchanged(savedBefore, label + '-exit-canceled'); await open();
    }
    if (!save) await click(cdp, decision('exit-save'));
    assert.equal(await evaluate(cdp, selector => document.querySelector(selector).checked, decision('exit-save')), save);
    await click(cdp, decision('exit-confirm'));
    await until(() => evaluate(cdp, selector => document.querySelector(selector)?.dataset.chartReplayActive !== 'true', chartSelector), 'confirmed return to latest chart');
    const after = await storedBytes();
    if (save) {
      assert.ok(after, 'Explicit save did not preserve a session');
      const saved = JSON.parse(after);
      assert.equal(saved.cursorDate, before.cursor); assert.equal(saved.outputHash, before.outputHash); assert.equal(saved.mode, before.mode);
      evidence.storage.push({ label: label + '-confirmed-save', cursor: saved.cursorDate, mode: saved.mode, bytes: after.length, sha256: digest(after) });
    } else await storedUnchanged(savedBefore, label + '-exit-without-save');
    return { before, saved: after };
  }
  async function reopenSaved(label, choice = 'entry-continue') {
    const before = await storedBytes(); assert.ok(before, 'Saved-session decision requires a genuine saved session');
    await click(cdp, '#workbench-replay');
    await until(() => evaluate(cdp, selector => Boolean(document.querySelector(selector)?.getClientRects().length), decision('entry-continue')), 'Continue or Start new replay choice');
    for (const name of ['entry-continue', 'entry-new']) visibleBounds(await bounds(cdp, decision(name)), width, height);
    await storedUnchanged(before, label + '-entry-choice');
    await click(cdp, decision(choice));
    if (choice === 'entry-continue') await ready(); else await pickerReady();
    await storedUnchanged(before, label + '-' + choice);
  }
  async function interval(value) {
    const selector = '#workbench-interval-' + value;
    const visible = await evaluate(cdp, selector => Boolean(document.querySelector(selector)?.getClientRects().length), selector);
    if (visible) await click(cdp, selector); else await select('#workbench-interval-select', value);
    await until(() => evaluate(cdp, value => document.querySelector('#workbench-interval-' + value)?.getAttribute('aria-pressed') === 'true' && document.querySelector('#workbench-interval-select')?.value === value, value), 'original interval remains ' + value);
  }
  async function assertToolbars(frequency, label) {
    const observed = await evaluate(cdp, frequency => {
      const usable = node => Boolean(node && node.getClientRects().length && !node.disabled && !node.closest('[inert]'));
      const buttons = [...document.querySelectorAll('#workbench-frequency [data-lab-frequency]')];
      const spans = [...document.querySelectorAll('[data-chart-span]')];
      return { frequency, selected: buttons.find(node => node.getAttribute('aria-pressed') === 'true')?.dataset.labFrequency,
        intervalOptions: [...document.querySelector('#workbench-interval-select').options].map(node => node.value),
        accessibleIntervals: buttons.filter(usable).map(node => node.dataset.labFrequency), intervalSelect: usable(document.querySelector('#workbench-interval-select')),
        accessibleSpans: spans.filter(usable).map(node => node.dataset.chartSpan), spanSelect: usable(document.querySelector('#workbench-range-select')),
        range: document.querySelector('#workbench-range-label').textContent,
        outsideReplayOverlay: [...buttons, ...spans, document.querySelector('#workbench-interval-select'), document.querySelector('#workbench-range-select')].filter(Boolean).every(node => !node.closest('.chart-replay-controls')) };
    }, frequency);
    assert.equal(observed.selected, frequency);
    assert.equal(observed.outsideReplayOverlay, true, 'The original interval or period toolbar was moved into replay settings');
    assert.deepEqual(observed.intervalOptions, ['1m', '5m', '15m', '30m', '1h', '4h', 'daily', 'weekly']);
    assert.ok(observed.accessibleIntervals.includes(frequency) || observed.intervalSelect, 'The original timeframe control disappeared during replay');
    assert.ok(observed.accessibleSpans.length === 4 || observed.spanSelect, 'The original period control disappeared during replay');
    if (width >= 1200) {
      assert.deepEqual(observed.accessibleIntervals, observed.intervalOptions, 'Desktop replay hid the original 1m–1W buttons');
      assert.deepEqual(observed.accessibleSpans, ['focus', 'near', 'all', 'history'], 'Desktop replay hid the original period buttons');
    }
    evidence.lifecycle.push({ label, ...observed });
    return observed;
  }
  async function snapshot(label, capture = false) {
    const value = await evaluate(cdp, ({ chartSelector, panel }) => {
      const svg = document.querySelector(chartSelector), controls = document.querySelector(panel), q = name => controls.querySelector('[data-cr="' + name + '"]');
      const plot = svg.closest('.atlas-plot'), box = svg.getBoundingClientRect();
      const candles = [...svg.querySelectorAll('.observed-candle')].map(node => ({ date: node.dataset.date,
        open: Number(node.dataset.open), high: Number(node.dataset.high), low: Number(node.dataset.low), close: Number(node.dataset.close),
        volume: node.dataset.volume === undefined ? null : Number(node.dataset.volume),
        periodStart: node.dataset.periodStart ?? null, periodEnd: node.dataset.periodEnd ?? null,
        daysIncluded: node.dataset.daysIncluded === undefined ? null : Number(node.dataset.daysIncluded), complete: node.dataset.complete === undefined ? null : node.dataset.complete === 'true',
        x: Number(node.querySelector('line')?.getAttribute('x1')) }));
      const candleBatches = [...svg.querySelectorAll('.observed-candles-batched')];
      const wickXs = candleBatches.flatMap(group => [...group.querySelectorAll('path[stroke]')].flatMap(path =>
        [...(path.getAttribute('d') ?? '').matchAll(/M(-?\d+(?:\.\d+)?),/g)].map(match => Number(match[1]))));
      return { sameNode: svg === globalThis.__mainReplayNode, sameDocument: performance.timeOrigin === globalThis.__mainReplayTime,
        active: svg.dataset.chartReplayActive === 'true', state: controls.dataset.state, origin: svg.dataset.replayOrigin, cursor: svg.dataset.replayCursor,
        playbackStartDate: svg.dataset.replayStartDate ?? null,
        selecting: svg.dataset.replaySelecting === 'true', pickerDate: svg.dataset.pickerDate ?? svg.dataset.replayPickerDate ?? null,
        frequency: svg.dataset.replayFrequency ?? svg.dataset.interval ?? 'daily',
        headerFrequency: document.querySelector('#workbench-interval-select')?.value ?? null,
        headerPressedFrequency: document.querySelector('#workbench-frequency [data-lab-frequency][aria-pressed="true"]')?.dataset.labFrequency ?? null,
        priceMinimum: svg.dataset.replayPriceMin === undefined ? null : Number(svg.dataset.replayPriceMin),
        priceMaximum: svg.dataset.replayPriceMax === undefined ? null : Number(svg.dataset.replayPriceMax),
        formingWeekCount: Number(svg.dataset.replayFormingWeekCount ?? 0), missingWeekCount: Number(svg.dataset.replayMissingWeekCount ?? 0),
        index: Number(q('scrub').value), lastIndex: Number(q('scrub').max), outputHash: svg.dataset.replayOutputHash,
        mode: q('mode').value, model: q('model')?.value ?? null, dateInput: q('date').value, dateMinimum: q('date').min, dateMaximum: q('date').max,
        menuView: q('select-panel').dataset.menuView, menuHidden: q('select-panel').hidden, dateContext: q('date-context').textContent,
        source: q('source').textContent, metric: q('metric').textContent,
        updateInterval: q('update-interval')?.value ?? null, updateIntervalLocked: q('update-interval')?.disabled ?? false,
        renderer: svg.dataset.replayRenderer ?? null, viewStart: svg.dataset.replayViewStart ?? null, viewEnd: svg.dataset.replayViewEnd ?? null,
        scale: svg.dataset.scale, unit: svg.dataset.unit, chartType: svg.dataset.chartType,
        forecastValueSignature: svg.dataset.forecastValueSignature ?? null,
        snapshotDigest: svg.dataset.replaySnapshotHash ?? null,
        annotationSignature: svg.dataset.replayAnnotationSignature ?? null,
        atlasPriceLayer: svg.querySelectorAll('.price-series-layer').length,
        cycleMarkerCount: Number(svg.dataset.cycleMarkerCount ?? 0), cycleIntervalCount: Number(svg.dataset.cycleIntervalCount ?? 0),
        cycleMarkerLayers: svg.querySelectorAll('[data-indicator-layer="cycle-landmarks"]').length,
        cycleIntervalLayers: svg.querySelectorAll('.cycle-interval-overlay-layer').length,
        actualThrough: svg.dataset.replayActualThrough, actualCount: Number(svg.dataset.replayActualCount ?? 0), forecastCount: Number(svg.dataset.replayForecastPoints ?? 0), candles,
        observedCandleCount: Number(svg.dataset.observedCandleCount ?? 0), batchedCandleCount: candleBatches.reduce((count, node) => count + Number(node.dataset.count), 0),
        batchedWickCount: wickXs.length, lastBatchedCandleX: wickXs.length ? Math.max(...wickXs) : null,
        plotLeft: Number(svg.dataset.plotLeft), plotRight: Number(svg.dataset.plotRight),
        forecastPath: svg.querySelector('[data-replay-forecast-path]')?.getAttribute('d') ?? null,
        forecastBelowActuals: (() => { const path = svg.querySelector('[data-replay-forecast-path]'); return path ? [...svg.querySelectorAll('.observed-candle,.observed-candles-batched,.observed-close-line')].every(node => Boolean(path.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) : null; })(),
        forecastPointerEvents: svg.querySelector('[data-replay-forecast-path]')?.getAttribute('pointer-events') ?? null,
        origins: svg.querySelectorAll('[data-replay-origin-boundary]').length, cursors: svg.querySelectorAll('[data-replay-cursor-line]').length,
        confirmedCursorXs: [...svg.querySelectorAll('[data-replay-cursor-line]')].map(node => node.getAttribute('x1')),
        pickerCount: svg.querySelectorAll('[data-chart-replay-picker]').length,
        volumeCount: Number(svg.querySelector('.volume-pane')?.dataset.volumeObservedCount ?? 0),
        volumeBars: [...svg.querySelectorAll('.volume-bar')].map(node => ({ date: node.dataset.date, volume: Number(node.dataset.volume), x: Number(node.getAttribute('x')) + Number(node.getAttribute('width')) / 2 })),
        observedIndicatorDates: [...svg.querySelectorAll('[data-indicator-layer="turns"] circle[data-date]')].filter(node => node.querySelector('title')?.textContent.startsWith('관측 ')).map(node => node.dataset.date),
        invalidPaths: [...svg.querySelectorAll('path')].filter(node => /NaN|Infinity/.test(node.getAttribute('d') ?? '')).length,
        separateReplayCharts: document.querySelectorAll('[data-forecast-replay] [data-replay-chart]').length, dialogs: document.querySelectorAll('dialog[open]').length,
        liveReadouts: [...plot.querySelectorAll('.atlas-readout,.eth-readout,.workbench-market-info,.equity-legend,.eth-forecast-note')].filter(node => node.getClientRects().length && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden').length,
        width: innerWidth, height: innerHeight, pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        scrollX, documentScrollLeft: document.documentElement.scrollLeft, bodyScrollLeft: document.body.scrollLeft,
        scrolledAncestors: (() => { const values = []; for (let parent = svg.parentElement; parent; parent = parent.parentElement) if (parent.scrollLeft || parent.scrollTop) values.push({ id: parent.id, className: parent.className, scrollLeft: parent.scrollLeft, scrollTop: parent.scrollTop }); return values; })(),
        chart: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
        playDisabled: q('play').disabled, nextDisabled: q('next').disabled, liveDisabled: q('live').disabled,
        nativeCrosshairVisible: (() => { const node = svg.querySelector('[id$="-cross"]'); return Boolean(node && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden'); })(),
        previousPresent: Boolean(q('previous')) };
    }, { chartSelector, panel });
    evidence.lastObservation = { label, ...value, candles: value.candles.map(row => row.date), annotationSignature: undefined,
      annotationSha256: value.annotationSignature === null ? null : digest(value.annotationSignature) };
    assert.ok(value.sameNode && value.sameDocument, 'Replay replaced the main chart or document');
    assert.equal(value.updateInterval, 'daily'); assert.equal(value.updateIntervalLocked, true, 'The source advances by completed daily observations');
    assert.equal(value.active, true); assert.equal(value.separateReplayCharts, 0); assert.equal(value.dialogs, 0);
    assert.equal(value.previousPresent, false, 'The removed previous-bar action is still mounted');
    if (value.renderer === 'atlas' && value.forecastPath) {
      assert.equal(value.forecastBelowActuals, true, 'Actual candles must be above the intact immutable comparison curve');
      assert.equal(value.forecastPointerEvents, 'none', 'The fixed forecast intercepts native chart selection');
    }
    assert.equal(value.invalidPaths, 0); assert.equal(value.liveReadouts, 0, 'Latest quote/readout remained visible during replay');
    assert.ok(value.pageWidth <= width + 1, 'Replay caused horizontal page overflow');
    assert.ok(value.chart.height >= 80 && value.chart.width > 100, 'Replay controls consumed the chart viewport');
    assert.ok(value.chart.height >= originalChartBox.height - 1, 'Replay settings reduced the existing full-height chart');
    assert.ok(value.chart.left >= -1 && value.chart.right <= width + 1 && value.chart.top >= -1 && value.chart.bottom <= height + 1, 'Main replay SVG escaped viewport: ' + JSON.stringify({ chart: value.chart, width, height, scrollX: value.scrollX, scrolledAncestors: value.scrolledAncestors }));
    if (value.state !== 'selecting') {
      if (btc) {
        assert.equal(value.headerFrequency, value.frequency, 'The original BTC interval selector contradicts the actual replay frame');
        assert.equal(value.headerPressedFrequency, value.frequency, 'The original BTC interval button contradicts the actual replay frame');
      }
      assert.match(value.outputHash, /^[a-f0-9]{64}$/); assert.ok(value.forecastCount > 1);
      // First-available and random-bar choices can move the viewport years
      // before the fixed current forecast begins. Off-screen assumptions must
      // remain in the fixed export without acquiring invented earlier values.
      const fixedOutsideView = value.mode === 'atlas-chart' && currentAtlasModel && !currentAtlasModel.path.some(row => row.date >= value.viewStart && row.date <= value.viewEnd);
      if (fixedOutsideView) assert.equal(value.forecastPath, null, 'The current forecast acquired a fake earlier visible segment');
      else assert.ok(value.forecastPath);
      assert.ok(value.actualThrough <= value.cursor, 'Main chart exposed an actual beyond the cursor');
      assert.ok(value.candles.every(row => row.date <= value.cursor), 'Main chart exposed a future candle');
      assert.ok(value.volumeBars.every(row => row.date <= value.cursor), 'Main chart exposed future actual volume');
      assert.ok(value.observedIndicatorDates.every(date => date <= value.cursor), 'Main chart exposed a future observed indicator');
      const sourceRows = btc && value.mode !== 'recorded' ? value.frequency === 'weekly' ? disclosedBitcoinWeeks(btcCandles, value.cursor) : btcCandles : archiveRows(value.mode);
      const source = new Map(sourceRows.map(row => [row.date, row]));
      for (const row of value.candles) {
        for (const key of ['open', 'high', 'low', 'close']) assert.equal(row[key], source.get(row.date)?.[key], 'Rendered OHLC changed disclosed source ' + key);
        if (btc && value.frequency === 'weekly') for (const key of ['periodStart', 'periodEnd', 'daysIncluded', 'complete', 'volume']) assert.equal(row[key], source.get(row.date)?.[key], 'Forming weekly candle changed disclosed ' + key);
      }
      for (const row of value.volumeBars) assert.equal(row.volume, source.get(row.date)?.volume, 'Volume used another day or an undisclosed completed week');
      if (value.mode === 'atlas-chart') {
        assert.equal(value.renderer, 'atlas', 'Direct BTC replay replaced the Atlas price renderer');
        const expectedCandles = sourceRows.filter(row => row.date >= value.viewStart && row.date <= value.viewEnd && row.date <= value.cursor);
        const expectedObservedRows = archiveRows(value.mode).filter(row => row.date >= value.viewStart && row.date <= value.viewEnd && row.date <= value.cursor);
        assert.equal(value.atlasPriceLayer, fixedOutsideView && expectedObservedRows.length === 0 ? 0 : 1, 'The original Atlas price layer does not match visible data availability');
        if (originalAtlasViewport?.[0] === value.viewStart && originalAtlasViewport?.[1] === value.viewEnd) {
          assert.ok(value.cycleMarkerLayers > 0 && value.cycleMarkerCount > 0, 'Direct replay removed the cycle landmarks');
          assert.ok(value.cycleIntervalLayers > 0 && value.cycleIntervalCount > 0, 'Direct replay removed the cycle period lines');
        }
        assert.ok(value.annotationSignature, 'Frozen cycle annotation identity is missing');
        assert.equal(value.observedCandleCount, expectedCandles.length, 'The current-chart candle layer omitted or invented source bars');
        assert.equal(value.observedCandleCount, value.candles.length + value.batchedCandleCount);
        assert.equal(value.batchedWickCount, value.batchedCandleCount, 'Dense rendering dropped genuine candle wicks');
        const cursorX = value.plotLeft + (Date.parse(value.cursor) - Date.parse(value.viewStart)) / (Date.parse(value.viewEnd) - Date.parse(value.viewStart)) * (value.plotRight - value.plotLeft);
        if (value.lastBatchedCandleX !== null) assert.ok(value.lastBatchedCandleX <= cursorX + .02, 'A dense actual candle painted beyond the reveal cursor');
        assert.ok(Number.isFinite(value.priceMinimum) && Number.isFinite(value.priceMaximum) && value.priceMinimum < value.priceMaximum, 'Replay omitted its actual displayed price-domain evidence');
      }
    }
    evidence.states.push({ label, ...value, candles: value.candles.map(row => row.date), forecastPath: undefined, forecastPathSha256: value.forecastPath === null ? null : digest(value.forecastPath),
      annotationSignature: undefined, annotationSha256: value.annotationSignature === null ? null : digest(value.annotationSignature) });
    if (capture) await screenshot(cdp, prefix + '-' + label + '.png', receipt);
    return value;
  }
  async function exported(label) {
    const before = await snapshot(label + '-before-export');
    await click(cdp, control('details'));
    const parent = resolve(outputDirectory, 'chart-replay-downloads', prefix); await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(resolve(parent, label + '-'));
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory, eventsEnabled: true, browserContextId });
    await click(cdp, control('export'));
    const file = await until(async () => { const files = (await readdir(directory)).filter(name => name.endsWith('.json')); assert.ok(files.length <= 1); return files[0]; }, 'main-chart replay JSON download');
    const bytes = await readFile(resolve(directory, file)), payload = JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.kind, 'atlas-visible-chart-replay'); assert.equal(payload.identity.symbol, symbol); assert.equal(payload.identity.outputHash, before.outputHash);
    assert.equal(payload.frame.cursorDate, before.cursor); assert.ok(payload.frame.actual.every(row => row.date > before.origin && row.date <= before.cursor));
    const observed = new Map(archiveRows(before.mode).map(row => [row.date, row]));
    for (const row of payload.frame.actual) {
      const source = observed.get(row.date); assert.ok(source, 'Exported actual date is absent in the source'); assert.equal(row.price, source.price);
      for (const key of ['open', 'high', 'low', 'close']) if (source[key] !== undefined) assert.equal(row[key], source[key]);
    }
    for (const row of payload.frame.targets) if (row.targetDate > before.cursor) assert.equal(row.actual, null);
    assert.equal(payload.frame.metrics.calibrated, false); assert.equal(payload.frame.metrics.independentSampleCount, null);
    if (before.mode === 'recorded') {
      const entry = ledgerIndex.entries.find(row => row.id === payload.identity.recordId); assert.ok(entry);
      const record = JSON.parse(await readFile(resolve(ledger, entry.recordPath), 'utf8')); assert.equal(payload.identity.outputHash, record.outputHash);
      const stored = new Map(record.output.path.map(row => [row[0], row]));
      for (const row of payload.frame.forecast) for (const key of ['price', 'lower', 'upper', 'baselinePrice']) assert.equal(row[key], stored.get(row.date)[record.output.columns.indexOf(key)] ?? null, 'Changed preserved forecast ' + key);
    }
    if (before.mode === 'project-baseline') {
      const original = initialAtlas.scenario.path.map(row => ({ date: row.date, price: row.price,
        lower: row.low, upper: row.high, baselinePrice: null }));
      assert.equal(original.length, 1098, 'The initial Atlas evidence path is incomplete');
      assert.deepEqual(payload.frame.forecast, original, 'Direct chart replay changed the original project-start forecast path');
    }
    if (before.mode === 'atlas-chart') {
      assert.ok(currentAtlasModel, 'The native current-model download must precede replay');
      const current = currentAtlasModel.path.map(row => ({ date: row.date, price: row.price,
        lower: row.lower ?? null, upper: row.upper ?? null, baselinePrice: row.baselinePrice ?? null,
        ...(row.representativePrice === undefined ? {} : { representativePrice: row.representativePrice }) }));
      assert.deepEqual(payload.frame.forecast, current, 'Replay rewrote the orange forecast that was already on the current chart');
      assert.equal(payload.identity.forecastOriginDate, currentAtlasModel.asOf);
      assert.equal(payload.identity.currentChartSnapshot, true); assert.equal(payload.identity.issuedAt, null);
      assert.equal(payload.frame.policy.forecastScoringEnabled, false);
      assert.deepEqual(payload.frame.dailyComparisons, [], 'A current snapshot was scored as a historically issued forecast');
      assert.equal(payload.frame.metrics.matchedCount, 0); assert.equal(payload.frame.metrics.meanAbsolutePercentageError, null);
    }
    evidence.exports.push({ label, file: relative(outputDirectory, resolve(directory, file)), bytes: bytes.length, sha256: digest(bytes), outputHash: payload.identity.outputHash,
      cursor: before.cursor, actualDates: payload.frame.actual.map(row => row.date), forecastSha256: digest(JSON.stringify(payload.frame.forecast)) });
    await click(cdp, control('hide-details')); await closeMenu(); return payload;
  }
  async function pointAction(type, point) {
    if (type === 'tap') {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    }
    await settled(cdp);
  }
  async function touchPan(label) {
    const before = await snapshot(label + '-before-hold');
    const gesture = await evaluate(cdp, selector => {
      const svg = document.querySelector(selector), box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
      const left = Number(svg.dataset.plotLeft), right = Number(svg.dataset.plotRight);
      return { x: box.left + (left + right) / 2 / view.width * box.width,
        y: box.top + (Number(svg.dataset.plotTop) + Number(svg.dataset.priceBottom)) / 2 / view.height * box.height,
        delta: Math.min(55, (right - left) / view.width * box.width * .18),
        originX: Number(svg.querySelector('[data-replay-origin-boundary]').getAttribute('x1')) };
    }, chartSelector);
    const hints = () => evaluate(cdp, () => document.querySelectorAll('.chart-touch-tracking-hint:not([hidden])').length);
    assert.equal(await hints(), 0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gesture.x, y: gesture.y, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
    await delay(650); assert.equal(await hints(), 0, 'Live-chart long-press tracking activated during replay');
    for (const fraction of [.4, 1]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gesture.x + gesture.delta * fraction, y: gesture.y, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
      await settled(cdp);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settled(cdp);
    assert.equal(await hints(), 0);
    const after = await snapshot(label + '-hold-pan', true);
    const originX = await evaluate(cdp, selector => Number(document.querySelector(selector).querySelector('[data-replay-origin-boundary]').getAttribute('x1')), chartSelector);
    assert.ok(Math.abs(originX - gesture.originX) > 8, 'Replay chart did not pan after native touch hold');
    assert.equal(after.index, before.index); assert.equal(after.outputHash, before.outputHash); assert.equal(after.actualThrough, before.actualThrough);
    if (before.mode === 'atlas-chart') {
      assert.equal(after.annotationSignature, before.annotationSignature, 'Panning changed the frozen cycle annotations');
      assert.ok(after.cycleMarkerLayers > 0 && after.cycleMarkerCount > 0, 'Panning removed the current-chart cycle landmarks');
      assert.ok(after.cycleIntervalLayers > 0 && after.cycleIntervalCount > 0, 'Panning removed the current-chart cycle periods');
    }
    evidence.lifecycle.push({ label: label + '-hold-pans-without-live-tracker', holdMilliseconds: 650, originBeforeX: gesture.originX, originAfterX: originX, cursor: after.cursor });
    return after;
  }
  async function chartPoint(date) {
    return evaluate(cdp, ({ selector, date }) => {
      const svg = document.querySelector(selector), box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
      const left = Number(svg.dataset.plotLeft), right = Number(svg.dataset.plotRight);
      const fraction = (Date.parse(date) - Date.parse(svg.dataset.replayViewStart)) / (Date.parse(svg.dataset.replayViewEnd) - Date.parse(svg.dataset.replayViewStart));
      if (!(fraction >= 0 && fraction <= 1)) throw new Error('Requested native pointer date is outside the current chart');
      return { x: box.left + (left + fraction * (right - left)) / view.width * box.width,
        y: box.top + (Number(svg.dataset.plotTop) + (Number(svg.dataset.priceBottom) - Number(svg.dataset.plotTop)) * .4) / view.height * box.height };
    }, { selector: chartSelector, date });
  }
  async function selectMenu(name) {
    await openMenu();
    for (const key of ['select-chart', 'select-date', 'select-random', 'select-first']) {
      await revealOwnedControl(decision(key)); visibleBounds(await bounds(cdp, decision(key)), width, height);
    }
    await click(cdp, decision(name));
  }
  async function previewStart(label, target, expectedDate) {
    const hit = await evaluate(cdp, ({ selector, target }) => {
      const node = document.elementFromPoint(target.x, target.y);
      return { chart: Boolean(node && document.querySelector(selector).contains(node)), tag: node?.tagName,
        control: node?.closest('[data-cr]')?.dataset.cr ?? null };
    }, { selector: chartSelector, target });
    assert.equal(hit.chart, true, 'Native picker target is covered by another control: ' + JSON.stringify({ target, hit }));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target }); await settled(cdp);
    const value = await evaluate(cdp, ({ selector, panel }) => {
      const svg = document.querySelector(selector), line = svg.querySelector('[data-chart-replay-picker] line.chart-replay-picker');
      const cross = svg.querySelector('[id$="-cross"]'), controls = document.querySelector(panel), q = name => controls.querySelector('[data-cr="' + name + '"]');
      return { cursor: svg.dataset.replayCursor ?? null, origin: svg.dataset.replayOrigin ?? null,
        pickerDate: svg.dataset.pickerDate ?? svg.dataset.replayPickerDate ?? null,
        selecting: svg.dataset.replaySelecting, stroke: line ? getComputedStyle(line).stroke : null,
        scissors: Boolean(svg.querySelector('[data-chart-replay-scissors]')),
        scissorsLabel: svg.querySelector('[data-chart-replay-scissors]')?.textContent ?? null,
        inspect: document.querySelector('.chart-replay-inspect')?.textContent ?? null,
        playDisabled: q('play').disabled, nextDisabled: q('next').disabled, liveDisabled: q('live').disabled,
        nativeCrosshairVisible: Boolean(cross && getComputedStyle(cross).display !== 'none' && getComputedStyle(cross).visibility !== 'hidden'),
        confirmedXs: [...svg.querySelectorAll('[data-replay-cursor-line]')].map(node => node.getAttribute('x1')),
        origins: svg.querySelectorAll('[data-replay-origin-boundary]').length,
        line: line ? { x1: line.getAttribute('x1'), x2: line.getAttribute('x2'), y1: line.getAttribute('y1'), y2: line.getAttribute('y2') } : null };
    }, { selector: chartSelector, panel });
    evidence.selections.push({ label, validated: false, target, hit, ...value });
    assert.equal(value.selecting, 'true'); assert.ok(value.line); assert.equal(value.line.x1, value.line.x2); assert.notEqual(value.line.y1, value.line.y2);
    assert.ok(value.scissors, 'Start-point preview omitted the scissors indicator');
    const rgb = value.stroke?.match(/\d+(?:\.\d+)?/g)?.map(Number);
    assert.ok(rgb && rgb[2] > rgb[0] && rgb[2] > rgb[1], 'The start-point preview is not visibly blue');
    assert.ok(btcCandles.some(row => row.date === value.pickerDate), 'The hovered start date is not a genuine source date');
    if (expectedDate) assert.equal(value.pickerDate, expectedDate, 'The start preview did not identify the pointed-to source candle');
    assert.ok(value.scissorsLabel?.includes(value.pickerDate), 'The blue scissors line omitted its pointed-to bar date');
    assert.ok(value.inspect?.includes(value.pickerDate), 'The displayed preview readout disagrees with the pointed-to bar');
    assert.equal(value.nativeCrosshairVisible, false, 'A fixed ordinary chart crosshair competes with the unconfirmed scissors preview');
    assert.equal(value.playDisabled, true); assert.equal(value.nextDisabled, true); assert.equal(value.liveDisabled, true, 'Jump to real-time remained enabled before the start click');
    assert.deepEqual(value.confirmedXs, []); assert.equal(value.origins, 0);
    evidence.selections.at(-1).validated = true;
    return value;
  }
  async function verifyUnconfirmedSelection(label, frequency, liveContext) {
    const saved = await storedBytes(), before = await snapshot(label + '-unconfirmed', true);
    assert.equal(before.state, 'selecting'); assert.equal(before.selecting, true); assert.equal(before.frequency, frequency);
    assert.equal(before.origin ?? null, null); assert.equal(before.cursor ?? null, null);
    assert.equal(before.origins, 0); assert.equal(before.cursors, 0, 'Unconfirmed selection invented a committed cutoff');
    assert.equal(before.nativeCrosshairVisible, false, 'Initial selection paints a fixed last-observed crosshair');
    assert.equal(before.playDisabled, true); assert.equal(before.nextDisabled, true); assert.equal(before.liveDisabled, true);
    assert.equal(before.forecastValueSignature, liveContext.forecastValueSignature);
    const source = frequency === 'weekly' ? disclosedBitcoinWeeks(btcCandles, btcCandles.at(-1).date) : btcCandles;
    const dateFor = row => frequency === 'weekly' ? row.periodStart : row.date;
    const visible = source.filter(row => dateFor(row) >= before.viewStart && dateFor(row) <= before.viewEnd);
    assert.ok(visible.length >= 8, 'The native picker requires distinct genuine bars in the visible range');
    const leftDate = dateFor(visible[Math.floor(visible.length * .1)]), centerDate = dateFor(visible.at(-3));
    assert.ok(leftDate < centerDate);
    const leftPoint = await chartPoint(leftDate), centerPoint = await chartPoint(centerDate);
    const left = await previewStart(label + '-left-bar-hover', leftPoint, leftDate);
    await screenshot(cdp, prefix + '-' + label + '-left-hover.png', receipt);
    const center = await previewStart(label + '-center-bar-hover', centerPoint, centerDate);
    assert.notEqual(left.pickerDate, center.pickerDate); assert.notEqual(left.line.x1, center.line.x1, 'The blue scissors line is stuck while the pointer crosses source bars');
    assert.equal(left.cursor, null); assert.equal(center.cursor, null); assert.equal(left.origin, null); assert.equal(center.origin, null);
    const expectedX = date => before.plotLeft + (day(date) - day(before.viewStart)) / (day(before.viewEnd) - day(before.viewStart)) * (before.plotRight - before.plotLeft);
    for (const hover of [left, center]) assert.ok(Math.abs(Number(hover.line.x1) - expectedX(hover.pickerDate)) < .01, 'Scissors line does not align with its actual bar coordinate');
    const after = await snapshot(label + '-hover-is-still-unconfirmed', true);
    for (const field of ['state', 'origin', 'cursor', 'outputHash', 'forecastValueSignature', 'annotationSignature', 'actualThrough', 'observedCandleCount', 'volumeCount']) assert.equal(after[field], before[field], 'Pointer movement silently committed or changed ' + field);
    await storedUnchanged(saved, label + '-hover-does-not-save');
    return { before, left, center, centerPoint };
  }
  async function measureCadence() {
    const expected = [['10', 100], ['1', 1000], ['0.5', 2000], ['0.3', 3000]];
    for (const [speed, milliseconds] of expected) {
      await click(cdp, control('scrub')); await key('Home', 'Home', 36); await select(control('speed'), speed);
      const initial = await snapshot('speed-' + speed + '-origin');
      assert.ok(initial.lastIndex >= 5, 'Cadence check needs at least five genuine source observations');
      // Instrument public DOM changes, not application timers or private state.
      await evaluate(cdp, selector => {
        const svg = document.querySelector(selector); let previous = svg.dataset.replayCursor;
        const observations = [];
        globalThis.__replayCadenceObserver?.disconnect();
        globalThis.__replayCadenceObservations = observations;
        globalThis.__replayCadenceObserver = new MutationObserver(() => {
          const cursor = svg.dataset.replayCursor;
          if (cursor && cursor !== previous) { observations.push({ cursor, at: performance.now() }); previous = cursor; }
        });
        globalThis.__replayCadenceObserver.observe(svg, { attributes: true, attributeFilter: ['data-replay-cursor'] });
      }, chartSelector);
      await click(cdp, control('play'));
      await until(() => evaluate(cdp, selector => document.querySelector(selector)?.dataset.state === 'ended', panel), 'real ' + speed + '× playback reaches the final available bar');
      const observations = await evaluate(cdp, () => { globalThis.__replayCadenceObserver.disconnect(); return globalThis.__replayCadenceObservations; });
      const intervals = observations.slice(1).map((row, index) => row.at - observations[index].at);
      assert.equal(observations.length, initial.lastIndex, 'Playback skipped or duplicated visible daily observations');
      assert.deepEqual(observations.map(row => row.cursor), btcCandles.filter(row => row.date > initial.origin).map(row => row.date));
      assert.ok(intervals.length >= 4, 'No sufficient post-paint interval sample was captured');
      const mean = intervals.reduce((total, value) => total + value, 0) / intervals.length;
      // Host scheduling can delay a frame; it cannot make the former 70/700ms
      // clock count as the requested 100/1000ms cadence. First-paint setup is
      // excluded, and the actual measured samples remain in the receipt.
      const measured = { speed: Number(speed), expectedMilliseconds: milliseconds, observations, intervals,
        meanMilliseconds: mean, averageUpdatesPerSecond: 1000 / mean, allowedMeanRatio: [.85, 1.3] };
      evidence.timing.push(measured);
      assert.ok(mean >= milliseconds * .85 && mean <= milliseconds * 1.3,
        'Observed ' + speed + '× cadence does not match the requested update interval: ' + JSON.stringify(measured));
      await snapshot('speed-' + speed + '-ended');
    }
    await select(control('speed'), '1');
  }
  async function verifyCurrentControls(direct, liveContext) {
    const savedBefore = await storedBytes();
    // The mobile start button must enter a real cancellable selector as well.
    const beforeCancel = await snapshot('start-point-before-cancel');
    await click(cdp, control('pick')); await pickerReady();
    await storedUnchanged(savedBefore, 'start-point-button-opens-without-saving');
    await click(cdp, control('pick-cancel')); await ready();
    const canceled = await snapshot('start-point-canceled', touch);
    assert.equal(canceled.cursor, beforeCancel.cursor); assert.equal(canceled.outputHash, beforeCancel.outputHash);
    await storedUnchanged(savedBefore, 'cancel-start-point-keeps-saved-session');
    await selectMenu('select-chart'); await pickerReady();
    assert.equal(await menuIsOpen(), false, 'Select bar did not hand selection back to the chart');
    const menuSelected = await snapshot('four-action-menu-selects-chart');
    assert.equal(menuSelected.selecting, true); assertSameReplayFrame(menuSelected, beforeCancel, 'Selecting a chart start from the four-action menu', { selectionPreview: true });
    await click(cdp, control('pick-cancel')); await ready();
    await storedUnchanged(savedBefore, 'menu-chart-selection-cancel-keeps-saved-session');
    if (touch) {
      await interval('daily'); await ready(); await assertToolbars('daily', 'touch-timeframe-restored-for-historical-comparisons');
      return;
    }

    await interval('weekly'); await ready(); await assertToolbars('weekly', 'weekly-original-toolbars');
    await click(cdp, control('scrub')); await key('Home', 'Home', 36);
    await click(cdp, control('next'));
    const first = await snapshot('weekly-first-daily-forward', true);
    await click(cdp, control('next'));
    const second = await snapshot('weekly-second-daily-forward', true);
    const candle1 = first.candles.find(row => row.date === first.cursor), candle2 = second.candles.find(row => row.date === second.cursor);
    assert.ok(candle1 && candle2, 'The forming week is absent from the original chart');
    assert.equal(first.frequency, 'weekly'); assert.equal(second.frequency, 'weekly');
    assert.equal(first.cursor, '2026-10-21'); assert.equal(second.cursor, '2026-10-22');
    assert.equal(candle1.periodStart, candle2.periodStart); assert.equal(candle1.open, candle2.open); assert.equal(candle1.x, candle2.x, 'A daily update moved the same weekly candle sideways');
    assert.equal(candle1.daysIncluded, 3); assert.equal(candle2.daysIncluded, 4); assert.equal(candle2.complete, false);
    assert.ok(first.volumeCount > 0 && second.volumeCount > 0, 'Weekly replay removed the explicitly enabled actual volume pane');
    const volumeScope = state => {
      const weeks = disclosedBitcoinWeeks(btcCandles, state.cursor).filter(row => row.date >= state.viewStart && row.date <= state.viewEnd);
      const visible = weeks.filter(row => row.periodStart >= state.viewStart && row.periodStart <= state.viewEnd);
      const outside = weeks.filter(row => row.periodStart < state.viewStart || row.periodStart > state.viewEnd);
      assert.equal(state.volumeCount, visible.length, 'Weekly volume membership does not match the disclosed Monday coordinates inside the viewport');
      assert.deepEqual(state.volumeBars.map(row => row.date), visible.map(row => row.date));
      for (const row of state.volumeBars) {
        const candle = state.candles.find(candle => candle.date === row.date);
        assert.ok(candle); assert.ok(Math.abs(row.x - candle.x) < .001, 'Weekly volume moved away from its candle Monday');
      }
      return { cursor: state.cursor, expectedVisibleVolumeCount: visible.length,
        outsideCandleCoordinates: outside.map(row => ({ date: row.date, periodStart: row.periodStart,
          x: state.plotLeft + (day(row.periodStart) - day(state.viewStart)) / (day(state.viewEnd) - day(state.viewStart)) * (state.plotRight - state.plotLeft) })),
        priceCandidateMeaning: 'Price candle metadata retains end-date candidates; volume excludes Monday coordinates outside the plot. Both use the same disclosed daily prefixes.' };
    };
    const firstVolumeScope = volumeScope(first), nextVolumeScope = volumeScope(second);
    assert.equal(second.forecastValueSignature, liveContext.forecastValueSignature); assert.equal(second.outputHash, direct.outputHash);
    evidence.weekly.push({ label: 'same-forming-week-updates-one-source-day', first: candle1, next: candle2,
      expectedFirst: disclosedBitcoinWeeks(btcCandles, first.cursor).at(-1), expectedNext: disclosedBitcoinWeeks(btcCandles, second.cursor).at(-1),
      firstVolumeScope, nextVolumeScope,
      firstDomain: [first.priceMinimum, first.priceMaximum], nextDomain: [second.priceMinimum, second.priceMaximum] });
    await click(cdp, control('scrub')); await key('Home', 'Home', 36); await key('ArrowRight', 'ArrowRight', 39);
    const rewound = await snapshot('weekly-rewind-identical');
    assert.deepEqual(rewound.candles, first.candles, 'Weekly rewind did not reproduce the exact disclosed prefix');
    assert.deepEqual([rewound.priceMinimum, rewound.priceMaximum], [first.priceMinimum, first.priceMaximum], 'Weekly rewind retained a later actual price domain');
    await exported('weekly-disclosed-prefix');
    await click(cdp, control('scrub')); await key('End', 'End', 35);
    const completed = await snapshot('weekly-completed-sunday');
    const completeCandle = completed.candles.find(row => row.date === completed.cursor);
    assert.equal(completeCandle.periodStart, candle1.periodStart); assert.equal(completeCandle.complete, true); assert.equal(completeCandle.daysIncluded, 7);

    const ranges = [];
    for (const span of ['near', 'all', 'history', 'focus']) {
      await click(cdp, '[data-chart-span="' + span + '"]'); await settled(cdp);
      const value = await evaluate(cdp, ({ selector, span }) => {
        const svg = document.querySelector(selector); return { span, selected: document.querySelector('[data-chart-span="' + span + '"]').getAttribute('aria-pressed'),
          start: svg.dataset.replayViewStart, end: svg.dataset.replayViewEnd, cursor: svg.dataset.replayCursor,
          signature: svg.dataset.forecastValueSignature, hash: svg.dataset.replayOutputHash, sameNode: svg === globalThis.__mainReplayNode };
      }, { selector: chartSelector, span });
      assert.equal(value.selected, 'true'); assert.equal(value.sameNode, true); assert.equal(value.cursor, completed.cursor);
      assert.equal(value.signature, liveContext.forecastValueSignature); assert.equal(value.hash, direct.outputHash);
      assert.ok(value.start < value.end); ranges.push(value);
    }
    assert.equal(new Set(ranges.map(value => value.start + '/' + value.end)).size, 4, 'The four original period controls did not change the active replay viewport');
    assert.deepEqual([ranges.at(-1).start, ranges.at(-1).end], [direct.viewStart, direct.viewEnd]);
    evidence.lifecycle.push({ label: 'original-four-period-buttons-control-active-replay', ranges });
    await snapshot('weekly-four-year-restored');
    await measureCadence();

    // Reselecting during playback pauses immediately; hovering is a preview,
    // not a new cutoff or a persistence operation.
    await click(cdp, control('scrub')); await key('Home', 'Home', 36);
    await click(cdp, control('play'));
    await until(() => evaluate(cdp, selector => Number(document.querySelector(selector).value) >= 1, control('scrub')), 'playback before start-point reselection');
    await click(cdp, control('pick')); await pickerReady();
    const selecting = await snapshot('playing-enters-scissors-selection');
    assert.notEqual(selecting.state, 'playing');
    const point = await chartPoint('2026-10-19');
    const hovered = await previewStart('scissors-hover-during-paused-reselection', point, '2026-10-19');
    assert.equal(hovered.cursor, selecting.cursor);
    assert.deepEqual(hovered.confirmedXs, selecting.confirmedCursorXs, 'Hover moved the confirmed cutoff before a click');
    const movedHover = await previewStart('scissors-follows-pointer-without-moving-cutoff', await chartPoint('2026-10-12'), '2026-10-12');
    assert.notEqual(movedHover.line.x1, hovered.line.x1); assert.equal(movedHover.cursor, selecting.cursor);
    assert.deepEqual(movedHover.confirmedXs, selecting.confirmedCursorXs);
    const during = await snapshot('scissors-preview-keeps-confirmed-cutoff', true);
    assert.equal(during.cursor, selecting.cursor); assert.equal(during.observedCandleCount, selecting.observedCandleCount); assert.equal(during.volumeCount, selecting.volumeCount);
    await delay(350); assert.equal((await snapshot('scissors-pauses-timer')).cursor, selecting.cursor);
    await storedUnchanged(savedBefore, 'scissors-hover-does-not-save');
    await key('Escape', 'Escape', 27); await ready();
    const escape = await snapshot('scissors-escape-keeps-session');
    assert.equal(escape.cursor, selecting.cursor); assert.equal(escape.outputHash, direct.outputHash); assert.equal(escape.pickerCount, 0);
    await storedUnchanged(savedBefore, 'scissors-escape-does-not-save');
    await click(cdp, control('scrub')); await key('End', 'End', 35);
    const uncut = await snapshot('before-new-start-cut');
    await click(cdp, control('pick')); await pickerReady();
    const chosen = await previewStart('scissors-before-native-click', point, '2026-10-19');
    assert.equal(chosen.cursor, uncut.cursor);
    await pointAction('click', point); await ready();
    const cut = await snapshot('scissors-click-cuts-future-actuals', true);
    assert.equal(cut.cursor, dateAt(day(chosen.pickerDate) - 1)); assert.equal(cut.playbackStartDate, chosen.pickerDate);
    assert.ok(cut.cursor < uncut.cursor); assert.ok(cut.volumeCount <= uncut.volumeCount); assert.equal(cut.selecting, false);
    assert.equal(cut.forecastValueSignature, liveContext.forecastValueSignature); assert.equal(cut.outputHash, direct.outputHash);
    await click(cdp, control('next'));
    const revealed = await snapshot('chosen-first-date-revealed'); assert.equal(revealed.cursor, chosen.pickerDate);
    await exported('scissors-chosen-first-date');
    await storedUnchanged(savedBefore, 'committed-start-and-next-remain-unsaved-draft');

    await selectMenu('select-date');
    assert.equal(await evaluate(cdp, selector => document.activeElement === document.querySelector(selector), control('date')), true, 'Select date did not focus the native date input');
    await key('ArrowDown', 'ArrowDown', 40); const requestedDate = await evaluate(cdp, selector => document.querySelector(selector).value, control('date'));
    await key('Enter', 'Enter', 13); await ready();
    const selectedDate = await snapshot('select-date-native-confirmed');
    assert.ok(btcCandles.some(row => row.date === selectedDate.playbackStartDate));
    assert.equal(selectedDate.cursor, dateAt(day(selectedDate.playbackStartDate) - 1)); assert.equal(selectedDate.outputHash, direct.outputHash);
    evidence.selections.push({ label: 'select-date-uses-native-input', requestedDate, selectedDate: selectedDate.playbackStartDate, cursor: selectedDate.cursor });
    await selectMenu('select-random'); await ready();
    const random = await snapshot('random-source-bar');
    assert.ok(btcCandles.some(row => row.date === random.playbackStartDate)); assert.equal(random.cursor, dateAt(day(random.playbackStartDate) - 1));
    assert.equal(random.outputHash, direct.outputHash); await storedUnchanged(savedBefore, 'random-start-does-not-save');
    await selectMenu('select-first'); await ready();
    const firstMonday = btcCandles.find(row => new Date(row.date + 'T00:00:00Z').getUTCDay() === 1).date;
    const firstWeek = await snapshot('first-available-week-start');
    assert.equal(firstWeek.playbackStartDate, firstMonday); assert.equal(firstWeek.cursor, dateAt(day(firstMonday) - 1)); assert.equal(firstWeek.actualCount, 0);
    await click(cdp, control('next')); const firstWeekExport = await exported('first-available-week-revealed');
    assert.equal(firstWeekExport.frame.actual.length, 1); assert.equal(firstWeekExport.frame.actual[0].date, firstMonday);
    await interval('daily'); await ready(); await selectMenu('select-first'); await ready();
    const firstDay = await snapshot('first-available-daily-empty-cutoff');
    assert.equal(firstDay.playbackStartDate, btcCandles[0].date); assert.equal(firstDay.cursor, dateAt(day(btcCandles[0].date) - 1));
    assert.equal(firstDay.actualCount, 0); assert.equal(firstDay.observedCandleCount, 0);
    const empty = await exported('first-available-daily-empty'); assert.deepEqual(empty.frame.actual, []);
    await click(cdp, control('next')); const firstDayExport = await exported('first-available-daily-revealed');
    assert.equal(firstDayExport.frame.actual.length, 1); assert.equal(firstDayExport.frame.actual[0].date, btcCandles[0].date);

    const beforeUnavailable = await snapshot('daily-before-unavailable-interval');
    await click(cdp, '#workbench-interval-1m');
    const unavailable = await until(async () => {
      const value = await evaluate(cdp, ({ selector, panel }) => {
        const svg = document.querySelector(selector), controls = document.querySelector(panel);
        return { selected: document.querySelector('#workbench-interval-select').value,
          message: document.querySelector('.chart-replay-notice:not([hidden])')?.textContent ?? document.querySelector('.chart-replay-hud [role="status"]').textContent,
          playDisabled: controls.querySelector('[data-cr="play"]').disabled, nextDisabled: controls.querySelector('[data-cr="next"]').disabled,
          candleCount: Number(svg.dataset.observedCandleCount ?? 0), sameNode: svg === globalThis.__mainReplayNode };
      }, { selector: chartSelector, panel });
      return /자료|확보|지원/.test(value.message) && /없|미확보|지원하지|불가/.test(value.message) ? value : false;
    }, 'unavailable real intraday replay is explicitly disclosed');
    assert.equal(unavailable.selected, 'daily'); assert.equal(unavailable.sameNode, true);
    assert.equal(unavailable.candleCount, beforeUnavailable.observedCandleCount, 'Rejected minute selection changed the actual candle layer');
    assert.match(unavailable.message, /없|미확보|지원하지|불가/);
    await screenshot(cdp, prefix + '-minute-source-unavailable.png', receipt);
    const afterUnavailable = await snapshot('unsupported-minute-selection-keeps-daily-chart');
    for (const field of ['frequency', 'cursor', 'outputHash', 'forecastValueSignature', 'observedCandleCount', 'volumeCount', 'priceMinimum', 'priceMaximum']) assert.equal(afterUnavailable[field], beforeUnavailable[field], 'Rejected intraday selection changed ' + field);
    evidence.lifecycle.push({ label: 'minute-source-unavailable-without-relabeling-daily-candles', requestedFrequency: '1m', ...unavailable });
    await storedUnchanged(savedBefore, 'unavailable-intraday-does-not-save');
    await interval('daily'); await ready(); await assertToolbars('daily', 'daily-controls-restored-after-unavailable-interval');

    // A new draft and an unchecked exit must keep the previously explicitly
    // saved session byte-for-byte. Continue then restores that exact session.
    await exitReplay('discard-current-draft', { save: false });
    await interval('weekly'); await settled(cdp);
    await reopenSaved('start-new-keeps-prior-save', 'entry-new');
    await storedUnchanged(savedBefore, 'start-new-before-selection');
    const fresh = await verifyUnconfirmedSelection('weekly-start-new', 'weekly', liveContext);
    await pointAction('click', fresh.centerPoint); await ready();
    const newDraft = await snapshot('weekly-start-new-native-click-confirms', true);
    assert.equal(newDraft.playbackStartDate, fresh.center.pickerDate); assert.equal(newDraft.cursor, dateAt(day(fresh.center.pickerDate) - 1));
    assert.equal(newDraft.selecting, false); assert.equal(newDraft.pickerCount, 0);
    assert.equal(newDraft.playDisabled, false); assert.equal(newDraft.nextDisabled, false); assert.equal(newDraft.liveDisabled, false);
    assert.equal(newDraft.forecastValueSignature, liveContext.forecastValueSignature); assert.equal(newDraft.outputHash, direct.outputHash);
    await click(cdp, control('next')); const monday = await snapshot('weekly-new-start-first-source-day', true);
    await click(cdp, control('next')); const tuesday = await snapshot('weekly-new-start-second-source-day', true);
    const mondayCandle = monday.candles.find(row => row.date === monday.cursor), tuesdayCandle = tuesday.candles.find(row => row.date === tuesday.cursor);
    assert.equal(monday.cursor, fresh.center.pickerDate); assert.equal(tuesday.cursor, dateAt(day(monday.cursor) + 1));
    assert.equal(monday.frequency, 'weekly'); assert.equal(tuesday.frequency, 'weekly');
    assert.ok(mondayCandle && tuesdayCandle); assert.equal(mondayCandle.periodStart, tuesdayCandle.periodStart);
    assert.equal(mondayCandle.open, tuesdayCandle.open); assert.equal(mondayCandle.x, tuesdayCandle.x);
    assert.equal(mondayCandle.daysIncluded, 1); assert.equal(tuesdayCandle.daysIncluded, 2);
    assert.equal(mondayCandle.complete, false); assert.equal(tuesdayCandle.complete, false);
    for (const state of [monday, tuesday]) assert.equal(state.forecastValueSignature, liveContext.forecastValueSignature);
    evidence.weekly.push({ label: 'native-start-click-keeps-daily-updates-within-selected-week', selectedMonday: fresh.center.pickerDate,
      first: mondayCandle, second: tuesdayCandle, expectedFirst: disclosedBitcoinWeeks(btcCandles, monday.cursor).at(-1), expectedSecond: disclosedBitcoinWeeks(btcCandles, tuesday.cursor).at(-1) });
    await storedUnchanged(savedBefore, 'new-draft-step-does-not-overwrite-saved-session');
    await exitReplay('discard-new-session', { save: false });
    await reopenSaved('continue-after-discarding-new-session');
    const continued = await snapshot('prior-saved-session-survives-new-draft', true), stored = JSON.parse(savedBefore);
    assert.equal(continued.cursor, stored.cursorDate); assert.equal(continued.outputHash, stored.outputHash);
    await storedUnchanged(savedBefore, 'continue-after-discard-is-read-only');
  }

  await until(() => evaluate(cdp, selector => Boolean(document.querySelector(selector)?.querySelector('path')) && Boolean(document.querySelector('#workbench-replay')), chartSelector), 'main price chart and replay control');
  await settled(cdp);
  if (btc) await verifyOfflineRefresh({ phase: 'main-chart-replay-entry' });
  // Preserve all three BTC viewport cases. The short landscape case also
  // proves that opening replay respects an already selected weekly interval.
  const entryFrequency = btc && width === 900 ? 'weekly' : 'daily';
  if (btc && entryFrequency === 'weekly') await interval('weekly');
  if (btc && !touch) {
    const volumeToggle = '[data-indicator-row="volume"] [data-indicator-action="visibility"]';
    if (await evaluate(cdp, selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false', volumeToggle)) await click(cdp, volumeToggle);
    await until(() => evaluate(cdp, () => Number(document.querySelector('#lab-chart .volume-pane')?.dataset.volumeObservedCount) > 0), 'genuine current volume before replay');
  }
  if (btc) {
    // Capture the actual live model through its existing native export action.
    // The replay export must retain every value, not just a matching label/hash.
    const parent = resolve(outputDirectory, 'chart-replay-downloads', prefix); await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(resolve(parent, 'current-model-before-replay-'));
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory, eventsEnabled: true, browserContextId });
    if (width < 620) {
      await click(cdp, chartSelector); await key('k', 'KeyK', 75, 2);
      await until(() => evaluate(cdp, () => document.querySelector('#workspace-dialog')?.open), 'native compact chart command palette');
      await click(cdp, '[aria-label="차트 명령 검색"]');
      await cdp.send('Input.insertText', { text: '차트 레이어' }); await settled(cdp); await key('Enter', 'Enter', 13);
    } else await click(cdp, '[aria-label="차트 레이어"]');
    await click(cdp, '#lab-json');
    const file = await until(async () => { const files = (await readdir(directory)).filter(name => name.endsWith('.json')); assert.ok(files.length <= 1); return files[0]; }, 'native current Atlas model JSON download');
    const bytes = await readFile(resolve(directory, file)); currentAtlasModel = JSON.parse(bytes.toString('utf8'));
    assert.ok(Array.isArray(currentAtlasModel.path) && currentAtlasModel.path.length > 1);
    evidence.currentModelExport = { file: relative(outputDirectory, resolve(directory, file)), bytes: bytes.length, sha256: digest(bytes),
      asOf: currentAtlasModel.asOf, scenario: currentAtlasModel.scenario.id, pathPoints: currentAtlasModel.path.length };
    await click(cdp, '[aria-label="상세 패널 닫기"]'); await settled(cdp);
  }
  const liveContext = btc ? await evaluate(cdp, selector => {
    const svg = document.querySelector(selector);
    return { range: document.querySelector('#workbench-range-label').textContent, scale: svg.dataset.scale, unit: svg.dataset.unit,
      chartType: svg.dataset.chartType, atlasPriceLayer: svg.querySelectorAll('.price-series-layer').length,
      forecastValueSignature: svg.dataset.forecastValueSignature ?? null,
        snapshotDigest: svg.dataset.replaySnapshotHash ?? null,
      frequency: document.querySelector('#workbench-interval-select').value,
      cycleMarkers: Number(svg.dataset.cycleMarkerCount), cycleIntervals: Number(svg.dataset.cycleIntervalCount) };
  }, chartSelector) : null;
  if (btc) {
    evidence.liveContext = liveContext;
    originalAtlasViewport = liveContext.range.match(/\d{4}\.\d{2}\.\d{2}/g)?.map(date => date.replaceAll('.', '-'));
    assert.equal(originalAtlasViewport?.length, 2);
    await screenshot(cdp, prefix + '-current-chart-before-replay.png', receipt);
  }
  originalChartBox = await evaluate(cdp, selector => {
    globalThis.__mainReplayNode = document.querySelector(selector); globalThis.__mainReplayTime = performance.timeOrigin;
    const box = globalThis.__mainReplayNode.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  }, chartSelector);
  await click(cdp, '#workbench-replay'); await ready(crypto);
  await verifyFloatingBar();
  if (btc) {
    await verifyUnconfirmedSelection('first-entry', entryFrequency, liveContext);
    // The suggested project start remains available, but opening replay no
    // longer commits it. Use the real Select date confirmation explicitly so
    // every established source-prefix and saved-session check still runs.
    await openDate();
    assert.equal(await evaluate(cdp, selector => document.querySelector(selector).value, control('date')), '2026-10-21');
    await click(cdp, control('start')); await ready();
    await verifyPopoverLifecycle();
  }
  else { await verifyLandingMenu('select-bar-only-four-start-actions', true); await closeMenu(); }
  if (btc) {
    const direct = await snapshot('atlas-project-start', true);
    assert.equal(direct.frequency, entryFrequency);
    await assertToolbars(entryFrequency, 'original-timeframe-and-period-tools-retained');
    assert.equal(direct.mode, 'atlas-chart', 'Explicit project start did not preserve the current BTC chart');
    assert.equal(direct.state, 'paused'); assert.equal(direct.dateInput, '2026-10-21');
    assert.equal(direct.playbackStartDate, '2026-10-21');
    assert.equal(direct.origin, '2026-10-20'); assert.equal(direct.cursor, '2026-10-20'); assert.equal(direct.index, 0); assert.equal(direct.actualCount, 0);
    assert.equal(direct.chartType, 'candles', 'Direct replay did not use genuine candles as requested');
    assert.ok(direct.observedCandleCount > 0, 'Direct replay did not paint any real historical candles');
    assert.ok(liveContext.forecastValueSignature, 'The live orange forecast value identity is missing');
    assert.equal(direct.forecastValueSignature, liveContext.forecastValueSignature, 'Opening replay replaced the current orange forecast');
    assert.equal(direct.scale, liveContext.scale, 'Opening replay changed the current price scale');
    assert.equal(direct.unit, liveContext.unit, 'Opening replay changed the current price unit');
    const dates = liveContext.range.match(/\d{4}\.\d{2}\.\d{2}/g);
    assert.equal(dates?.length, 2, 'Live chart did not expose its current date range');
    assert.deepEqual([direct.viewStart, direct.viewEnd], dates.map(value => value.replaceAll('.', '-')), 'Replay discarded the current chart viewport');
    assert.match(direct.metric, /현재 예측선 고정.*실제 0봉/); assert.equal(direct.previousPresent, false);
    const originalAtlas = await exported('atlas-project-start');
    assert.equal(originalAtlas.identity.playbackStartDate, '2026-10-21'); assert.equal(originalAtlas.frame.actual.length, 0);
    await click(cdp, control('next'));
    const firstAtlas = await snapshot('atlas-first-project-bar', true);
    assert.equal(firstAtlas.cursor, '2026-10-21'); assert.equal(firstAtlas.index, 1); assert.equal(firstAtlas.actualCount, 1);
    assert.equal(firstAtlas.outputHash, direct.outputHash); assert.equal(firstAtlas.annotationSignature, direct.annotationSignature);
    assert.equal(firstAtlas.forecastValueSignature, liveContext.forecastValueSignature);
    assert.deepEqual([firstAtlas.viewStart, firstAtlas.viewEnd], [direct.viewStart, direct.viewEnd]);
    assert.equal(firstAtlas.frequency, entryFrequency);
    if (entryFrequency === 'weekly') {
      const forming = firstAtlas.candles.find(row => row.date === '2026-10-21');
      assert.ok(forming, 'Weekly entry failed to reveal the current forming week');
      assert.equal(forming.periodStart, '2026-10-19'); assert.equal(forming.daysIncluded, 3); assert.equal(forming.complete, false);
      evidence.weekly.push({ label: 'weekly-entry-first-daily-forward', candle: forming, expected: disclosedBitcoinWeeks(btcCandles, '2026-10-21').at(-1) });
    }
    await click(cdp, control('first'));
    const firstReset = await snapshot('floating-first-rewinds');
    assert.equal(firstReset.index, 0); assert.equal(firstReset.cursor, direct.cursor); assert.equal(firstReset.actualCount, 0); assert.equal(firstReset.outputHash, direct.outputHash);
    await click(cdp, control('next'));
    const firstRestored = await snapshot('floating-first-forward-restores');
    assert.equal(firstRestored.cursor, firstAtlas.cursor); assert.equal(firstRestored.outputHash, firstAtlas.outputHash);
    assert.equal(firstRestored.forecastValueSignature, firstAtlas.forecastValueSignature); assert.deepEqual(firstRestored.candles, firstAtlas.candles);
    await verifyRemovedBackwardInputs(firstRestored, 'current-chart-backward-inputs-removed');
    const firstAtlasExport = await exported('atlas-first-project-bar');
    assert.deepEqual(firstAtlasExport.frame.forecast, originalAtlas.frame.forecast, 'First actual bar rewrote the initial Atlas forecast');
    await click(cdp, control('scrub')); await key('End', 'End', 35);
    const endAtlas = await snapshot('atlas-last-observed-bar', true);
    assert.equal(endAtlas.index, endAtlas.lastIndex); assert.equal(endAtlas.outputHash, direct.outputHash);
    assert.equal(endAtlas.annotationSignature, direct.annotationSignature); assert.equal(endAtlas.nextDisabled, true);
    assert.equal(endAtlas.forecastValueSignature, liveContext.forecastValueSignature);
    assert.equal(endAtlas.cursor, btcCandles.at(-1).date, 'Replay did not stop at the last real observed candle');
    const endAtlasExport = await exported('atlas-last-observed-bar');
    assert.deepEqual(endAtlasExport.frame.forecast, originalAtlas.frame.forecast, 'Revealing later actuals changed the initial Atlas forecast');
    await click(cdp, control('scrub')); await key('Home', 'Home', 36);
    const resetAtlas = await snapshot('atlas-scrub-rewound');
    assert.equal(resetAtlas.index, 0); assert.equal(resetAtlas.actualCount, 0); assert.equal(resetAtlas.outputHash, direct.outputHash);
    await select(control('speed'), '1'); await click(cdp, control('play'));
    await until(() => evaluate(cdp, selector => Number(document.querySelector(selector).value) >= 2, control('scrub')), 'current Atlas replay starts with native play');
    await click(cdp, control('play'));
    let pausedAtlas = await snapshot('atlas-play-paused'); assert.notEqual(pausedAtlas.state, 'playing');
    await delay(450); assert.equal((await snapshot('atlas-pause-stable')).index, pausedAtlas.index);
    assert.equal(await storedBytes(), null, 'Playing a fresh session silently saved it before an exit decision');
    // Reproduce the reported saved 24th / input 25th discrepancy with a real
    // saved session. Native slider keys choose the exact disclosed cursor.
    await click(cdp, control('scrub')); await key('Home', 'Home', 36);
    const saveIndex = btcCandles.filter(row => row.date > direct.origin && row.date <= '2026-10-24').length;
    assert.equal(saveIndex, 4);
    for (let index = 0; index < saveIndex; index++) await key('ArrowRight', 'ArrowRight', 39);
    await closeMenu(); pausedAtlas = await snapshot('atlas-exact-october24-save-position');
    assert.equal(pausedAtlas.cursor, '2026-10-24'); assert.equal(pausedAtlas.index, 4); assert.equal(pausedAtlas.playbackStartDate, '2026-10-21');
    assert.equal(pausedAtlas.outputHash, direct.outputHash);
    if (touch) pausedAtlas = await touchPan('atlas-touch');
    visibleBounds(await bounds(cdp, control('exit')), width, height);
    await exitReplay('atlas-explicit-save', { cancelFirst: true });
    await until(() => evaluate(cdp, selector => document.querySelector(selector)?.dataset.chartReplayActive !== 'true' && document.querySelector(selector)?.querySelector('.price-series-layer'), chartSelector), 'restore the same current Atlas chart');
    const restoredAtlas = await evaluate(cdp, selector => {
      const svg = document.querySelector(selector); return { sameNode: svg === globalThis.__mainReplayNode,
        range: document.querySelector('#workbench-range-label').textContent, scale: svg.dataset.scale, unit: svg.dataset.unit, chartType: svg.dataset.chartType,
        frequency: document.querySelector('#workbench-interval-select').value,
        cycleMarkers: Number(svg.dataset.cycleMarkerCount), cycleIntervals: Number(svg.dataset.cycleIntervalCount) };
    }, chartSelector);
    assert.equal(restoredAtlas.sameNode, true);
    for (const key of ['range', 'scale', 'unit', 'chartType', 'frequency', 'cycleMarkers', 'cycleIntervals']) assert.equal(restoredAtlas[key], liveContext[key], 'Returning from Atlas replay changed ' + key);
    evidence.lifecycle.push({ label: 'current-chart-restored-with-original-presentation', ...restoredAtlas });
    const persistedCapture=JSON.parse(await storedBytes()).forecastSnapshot;
    assert.ok(persistedCapture,'Explicit save must preserve the full forecast or its verified database reference');
    assert.ok(['atlas-local-replay-snapshot','atlas-replay-snapshot-reference'].includes(persistedCapture.kind));
    assert.match(persistedCapture.digest,/^[a-f0-9]{64}$/);
    evidence.lifecycle.push({label:'full-forecast-explicitly-persisted',kind:persistedCapture.kind,digest:persistedCapture.digest,storedBytes:Buffer.byteLength(await storedBytes())});
    await reopenSaved('atlas-saved-session');
    const resumedAtlas = await snapshot('atlas-resumed-paused');
    assert.equal(resumedAtlas.snapshotDigest,persistedCapture.digest,'Continue changed the stored capture');
    assert.equal(resumedAtlas.mode, 'atlas-chart'); assert.equal(resumedAtlas.index, pausedAtlas.index); assert.equal(resumedAtlas.cursor, pausedAtlas.cursor);
    assert.equal(resumedAtlas.outputHash, pausedAtlas.outputHash); assert.equal(resumedAtlas.annotationSignature, pausedAtlas.annotationSignature);
    assert.equal(resumedAtlas.forecastValueSignature, liveContext.forecastValueSignature);
    for (const field of ['cycleMarkerLayers', 'cycleMarkerCount', 'cycleIntervalLayers', 'cycleIntervalCount']) assert.equal(resumedAtlas[field], pausedAtlas[field], 'Continue changed the frozen visible ' + field);
    assert.notEqual(resumedAtlas.state, 'playing'); await delay(450); assert.equal((await snapshot('atlas-resume-stable')).index, resumedAtlas.index);
    await verifySavedDateEditor(resumedAtlas, 'saved-october24-current-date');
    evidence.lifecycle.push({ label: 'direct-current-chart-project-replay', projectStart: '2026-10-21', initialObservationCutoff: direct.origin, forecastAsOf: currentAtlasModel.asOf,
      firstRevealedDate: firstAtlas.cursor, finalObservedDate: endAtlas.cursor, outputHash: direct.outputHash, annotationSha256: digest(direct.annotationSignature) });
    await verifyCurrentControls(direct, liveContext);
    // The old prediction is a separate, explicit choice. It must retain the
    // actual original artifact and its Coin Metrics comparison source.
    await select(control('mode'), 'project-baseline'); await ready();
    const originalProject = await snapshot('original-project-forecast', true);
    assert.equal(originalProject.mode, 'project-baseline'); assert.equal(originalProject.renderer, 'atlas');
    assert.equal(originalProject.origin, '2026-10-20'); assert.equal(originalProject.dateInput, '2026-10-21');
    assert.equal(originalProject.index, 0); assert.equal(originalProject.actualCount, 0); assert.equal(originalProject.observedCandleCount, 0);
    assert.notEqual(originalProject.outputHash, direct.outputHash, 'Selecting the original artifact reused the current forecast');
    const projectExport = await exported('original-project-forecast');
    await click(cdp, control('next'));
    const projectNext = await snapshot('original-project-first-observation', true);
    assert.equal(projectNext.cursor, '2026-10-21'); assert.equal(projectNext.outputHash, originalProject.outputHash);
    const projectNextExport = await exported('original-project-first-observation');
    assert.deepEqual(projectNextExport.frame.forecast, projectExport.frame.forecast);
    assert.equal(projectNextExport.frame.actual.length, 1);
    evidence.lifecycle.push({ label: 'explicit-original-project-forecast-is-preserved', outputHash: originalProject.outputHash,
      forecastPoints: projectExport.frame.forecast.length, firstActual: projectNextExport.frame.actual[0].price,
      comparisonSource: projectNext.source });
    // Keep all prior retrospective, genuine-OHLC, and stored-record checks.
    // They are explicit alternatives to the direct current-chart default.
    await select(control('mode'), 'historical-reconstruction'); await ready(true);
    await select(control('display'), 'candles'); await ready(true);
  }
  if (crypto) {
    // Display settings intentionally leave the nonmodal menu open. Dismiss
    // it through its real close control before hovering the underlying chart.
    await closeMenu();
    const selection = await snapshot('start-selection', true); assert.equal(selection.forecastCount, 0);
    assert.equal(selection.origin || null, null); assert.equal(selection.cursor || null, null);
    assert.equal(selection.origins, 0); assert.equal(selection.cursors, 0, 'Unconfirmed historical selection invented a committed cutoff');
    const sourceDates = archiveRows(selection.mode).map(row => row.date);
    const selectionStart = Math.max(day(sourceDates[0]), day(sourceDates.at(-1)) - 730), selectionEnd = day(sourceDates.at(-1)) + 10;
    const point = await evaluate(cdp, ({ selector, fraction }) => {
      const svg = document.querySelector(selector), rect = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
      return { x: rect.left + (Number(svg.dataset.plotLeft) + fraction * (Number(svg.dataset.plotRight) - Number(svg.dataset.plotLeft))) / view.width * rect.width,
        y: rect.top + (Number(svg.dataset.plotTop) + Number(svg.dataset.priceBottom)) / 2 / view.height * rect.height };
    }, { selector: chartSelector, fraction: (day(selection.dateInput) - selectionStart) / (selectionEnd - selectionStart) });
    const pointHit = await evaluate(cdp, ({ selector, point }) => {
      const node = document.elementFromPoint(point.x, point.y);
      return { chart: Boolean(node && document.querySelector(selector).contains(node)), tag: node?.tagName, id: node?.id, control: node?.closest('[data-cr]')?.dataset.cr ?? null };
    }, { selector: chartSelector, point });
    assert.equal(pointHit.chart, true, 'Native start-selector pointer is occluded: ' + JSON.stringify({ point, pointHit }));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point }); await settled(cdp);
    const hoveredDate = await evaluate(cdp, selector => document.querySelector(selector).dataset.pickerDate, chartSelector);
    assert.ok(sourceDates.includes(hoveredDate), 'Native initial selector did not resolve a real source date');
    await pointAction(touch ? 'tap' : 'click', point); await ready();
    const picked = await snapshot('chart-picked'); assert.equal(picked.origin, hoveredDate);
    if (!touch) {
      await click(cdp, control('date'));
      // The native date control's center can land on a different segment
      // when the popover changes its width. ArrowRight stops at the final
      // year segment in the tested Chromium; select it before decrementing.
      // A real native-input probe covered 140, 280 and 400px field widths.
      for (let segment = 0; segment < 5; segment++) await key('ArrowRight', 'ArrowRight', 39, 0, false);
      await key('ArrowDown', 'ArrowDown', 40);
      const date = await evaluate(cdp, selector => document.querySelector(selector).value, control('date'));
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/); assert.notEqual(date, picked.origin, 'Native date editing did not change the chosen origin');
      assert.equal(date, String(Number(picked.origin.slice(0, 4)) - 1) + picked.origin.slice(4), 'Native keyboard editing did not decrement the explicitly selected year');
      if (symbol === 'ETHUSD') assert.equal(date, '2025-04-30', 'The preserved adaptive-model negative case changed its requested origin');
      evidence.lifecycle.push({ label: 'native-date-request', previous: picked.origin, requested: date });
      await key('Enter', 'Enter', 13);
      if (symbol === 'ETHUSD') {
        // This preserved archive cannot fit adaptive states at the earlier
        // origin. It must disclose that fact before an explicit model choice.
        const failure = await until(async () => {
          const result = await evaluate(cdp, ({ panel, chartSelector }) => {
            const controls = document.querySelector(panel), svg = document.querySelector(chartSelector);
            return { state: controls.dataset.state, date: controls.querySelector('[data-cr="date"]').value,
              model: controls.querySelector('[data-cr="model"]').value,
              message: document.querySelector('.chart-replay-hud [role="status"]').textContent,
              inspect: document.querySelector('.chart-replay-inspect').textContent,
              forecasts: svg.querySelectorAll('[data-replay-forecast-path]').length,
              sameNode: svg === globalThis.__mainReplayNode,
              retryVisible: Boolean(controls.querySelector('[data-cr="pooled-retry"]')?.getClientRects().length) };
          }, { panel, chartSelector });
          return result.state === 'error' ? result : false;
        }, 'unsupported adaptive origin is explicitly rejected');
        await openForecast(); await revealOwnedControl(control('pooled-retry'));
        failure.retryVisible = await evaluate(cdp, selector => Boolean(document.querySelector(selector)?.getClientRects().length), control('pooled-retry'));
        assert.equal(failure.sameNode, true); assert.equal(failure.date, date); assert.equal(failure.model, 'adaptive');
        assert.match(failure.message, /각 30개 이상 필요/); assert.equal(failure.forecasts, 0);
        assert.equal(failure.inspect, '', 'Failed model retained a stale actual/forecast readout'); assert.equal(failure.retryVisible, true);
        evidence.lifecycle.push({ label: 'unsupported-adaptive-origin-disclosed', ...failure });
        await screenshot(cdp, prefix + '-unsupported-origin.png', receipt);
        await click(cdp, control('pooled-retry')); await ready();
        const retry = await snapshot('explicit-pooled-retry', true);
        assert.equal(retry.origin, date, 'Explicit alternative changed the requested origin'); assert.equal(retry.model, 'pooled'); assert.equal(retry.index, 0);
        evidence.lifecycle.push({ label: 'explicit-alternative-keeps-origin', origin: retry.origin, model: retry.model, outputHash: retry.outputHash });
      } else await ready();
      const changed = await snapshot('date-entered');
      const eligible = archiveRows(changed.mode).map(row => row.date).filter(value => value >= changed.dateMinimum && value <= changed.dateMaximum);
      assert.ok(eligible.length, 'The origin picker must expose a usable source date range');
      const nearest = eligible.reduce((best, candidate) => Math.abs(Date.parse(candidate) - Date.parse(date)) < Math.abs(Date.parse(best) - Date.parse(date)) ? candidate : best, eligible[0]);
      assert.equal(changed.origin, nearest); evidence.lifecycle.push({ label: 'native-date-edit-and-enter', requested: date, origin: changed.origin });
    }
  }
  const origin = await snapshot('fixed-origin', true); assert.equal(origin.index, 0); assert.equal(origin.actualCount, 0);
  if (crypto && origin.mode === 'historical-reconstruction') assert.ok(origin.observedCandleCount > 0, 'Historical reconstruction stopped painting genuine candles');
  let progressed = origin;
  assert.ok(origin.metric.includes('평가 대기')); assert.equal(origin.previousPresent, false);
  const original = await exported('fixed-origin'); assert.equal(original.frame.actual.length, 0);
  if (symbol === 'ETHUSD' && !touch) assert.match(original.identity.modelVersion, /pooled/, 'Export did not disclose the explicitly chosen alternative model');
  if (origin.lastIndex > 0) {
    await click(cdp, control('next'));
    const first = await snapshot('next-bar', true);
    assert.equal(first.index, 1); assert.equal(first.outputHash, origin.outputHash);
    const next = archiveRows(first.mode).find(row => row.date > origin.origin); assert.equal(first.cursor, next.date);
    const step = await exported('next-bar'); assert.deepEqual(step.frame.forecast, original.frame.forecast, 'Next bar changed the fixed prediction'); assert.equal(step.frame.actual.length, 1);
    await verifyRemovedBackwardInputs(first, 'fixed-forecast-backward-inputs-removed');
    await key('Home', 'Home', 36);
    const rewound = await snapshot('keyboard-home-rewind'); assert.equal(rewound.index, 0); assert.equal(rewound.outputHash, origin.outputHash);
    const rewindExport = await exported('rewound-origin'); assert.deepEqual(rewindExport.frame.forecast, original.frame.forecast, 'Rewind changed preserved forecast values');
    await key('ArrowRight', 'ArrowRight', 39, 8); progressed = await snapshot('keyboard-forward'); assert.equal(progressed.index, 1);
    if (crypto && origin.lastIndex > 8) {
      await select(control('speed'), '4'); await click(cdp, chartSelector); await key('ArrowDown', 'ArrowDown', 40, 8);
      await until(() => evaluate(cdp, selector => Number(document.querySelector(selector).value) >= 4, control('scrub')), 'native autoplay advances actual bars');
      await key('ArrowDown', 'ArrowDown', 40, 8); const paused = await snapshot('paused'); assert.equal(paused.state, 'paused');
      await delay(450); assert.equal((await snapshot('pause-stable')).index, paused.index);
      progressed = paused;
      evidence.lifecycle.push({ label: 'shift-down-toggles-and-pauses-playback', index: paused.index, waitMilliseconds: 450 });
    }
  } else {
    assert.equal(origin.nextDisabled, true); evidence.lifecycle.push({ label: 'no-future-observations', inventedBars: false });
  }
  if (touch) await touchPan('touch');
  if (crypto) {
    // Save the progressed reconstruction explicitly, then prove that merely
    // inspecting a stored forecast and declining save cannot overwrite it.
    const historicalBeforeSave = await snapshot('historical-before-explicit-save');
    await exitReplay('historical-explicit-save');
    await reopenSaved('historical-explicit-continue');
    const historicalResume = await snapshot('historical-resumed-exactly');
    for (const field of ['mode', 'origin', 'cursor', 'index', 'outputHash']) assert.equal(historicalResume[field], historicalBeforeSave[field], 'Explicit historical resume changed ' + field);
    const historicalSavedBytes = await storedBytes();
    await select(control('mode'), 'recorded'); await ready();
    const recorded = await snapshot('preserved-record', true); assert.equal(recorded.index, 0);
    const preserved = await exported('preserved-record'); assert.equal(preserved.identity.recordId, await evaluate(cdp, selector => document.querySelector(selector).value, control('record')));
    if (btc) assert.equal(recorded.candles.length, 0, 'Saved Coin Metrics prices were substituted with exchange candles');
    if (recorded.lastIndex > 0) { await click(cdp, control('next')); await snapshot('preserved-record-next'); }
    await storedUnchanged(historicalSavedBytes, 'viewing-record-does-not-overwrite-progressed-reconstruction');
    await exitReplay('record-inspection-without-save', { save: false });
    await reopenSaved('historical-survives-unsaved-record');
    const kept = await snapshot('historical-save-survives-record-inspection');
    for (const field of ['mode', 'origin', 'cursor', 'index', 'outputHash']) assert.equal(kept[field], historicalBeforeSave[field], 'Unsaved record inspection erased historical ' + field);
    evidence.lifecycle.push({ label: 'unchecked-record-exit-preserves-explicitly-saved-progress', origin: kept.origin, cursor: kept.cursor, outputHash: kept.outputHash });
    await select(control('mode'), 'recorded'); await ready();
    if (recorded.lastIndex > 0) await click(cdp, control('next'));
  }
  visibleBounds(await bounds(cdp, control('exit')), width, height);
  const beforeExit = await snapshot('before-exit');
  const expectedResume = beforeExit;
  evidence.lifecycle.push({ label: 'resume-session-policy',
    behavior: 'only-explicit-checked-exit-saves-the-selected-session',
    previousOrigin: origin.origin, selectedOrigin: beforeExit.origin, selectedIndex: beforeExit.index,
    expectedOrigin: expectedResume.origin, expectedIndex: expectedResume.index });
  await exitReplay('selected-session-explicit-save', { cancelFirst: !btc, opener: 'live' });
  await until(() => evaluate(cdp, selector => document.querySelector(selector)?.dataset.chartReplayActive !== 'true' && document.querySelector(selector)?.querySelector('path'), chartSelector), 'restore main chart');
  const restored = await evaluate(cdp, ({ chartSelector, panel }) => ({ sameNode: document.querySelector(chartSelector) === globalThis.__mainReplayNode,
    controlsHidden: document.querySelector(panel).hidden, active: document.documentElement.dataset.chartReplayActive,
    overlayCount: document.querySelector(chartSelector).querySelectorAll('[data-chart-replay-overlay]').length,
    triggerPressed: document.querySelector('#workbench-replay').getAttribute('aria-pressed'),
    toolbarInert: [...document.querySelector('#workbench-replay').parentElement.children].filter(node => node.inert).length }), { chartSelector, panel });
  assert.equal(restored.sameNode, true); assert.equal(restored.controlsHidden, true); assert.equal(restored.active, undefined); assert.equal(restored.overlayCount, 0); assert.equal(restored.triggerPressed, 'false'); assert.equal(restored.toolbarInert, 0);
  evidence.restored = restored; await screenshot(cdp, prefix + '-latest-restored.png', receipt);
  await reopenSaved('selected-session-explicit-continue');
  const resumed = await snapshot('resumed-paused'); assert.equal(resumed.origin, expectedResume.origin); assert.equal(resumed.index, expectedResume.index); assert.equal(resumed.outputHash, expectedResume.outputHash);
  assert.notEqual(resumed.state, 'playing'); await delay(450); assert.equal((await snapshot('resume-stable')).index, resumed.index);
  evidence.lifecycle.push({ label: 'resume-restores-exact-fixed-path-and-pauses', origin: resumed.origin, index: resumed.index, outputHash: resumed.outputHash });
  await exitReplay('final-return-without-overwriting-save', { save: false });
}
