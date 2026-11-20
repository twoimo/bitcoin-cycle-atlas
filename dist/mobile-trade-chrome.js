import { atlasSitePath } from './site-paths.js';
import { atlasPages } from './atlas-navigation.js?v=1.36.3';

const COMPACT = '(max-width: 1024px)';
const CHAT_KEY = 'atlas-chart-chat-open';

function icon(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function pageHref(id) {
  const page = atlasPages.find(item => item.id === id);
  return page ? atlasSitePath(page.href) : atlasSitePath('/');
}

export function mountTradeChrome(doc) {
  const view = doc.defaultView || globalThis.window;
  if (!view?.matchMedia) return () => {};
  const media = view.matchMedia(COMPACT);
  const upper = doc.createElement('div');
  upper.className = 'atlas-trade-upper';
  const upperTab = doc.createElement('span');
  upperTab.className = 'atlas-trade-upper-tab';
  const account = doc.createElement('button');
  account.type = 'button';
  account.className = 'atlas-trade-account';
  account.setAttribute('aria-label', '계정');
  account.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="5.6" r="2.3" fill="currentColor"/><path d="M3.1 13.1a4.9 4.9 0 0 1 9.8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  account.addEventListener('click', () => doc.querySelector('[data-auth-action="account"]')?.click());
  const search = doc.createElement('button');
  search.type = 'button';
  search.className = 'atlas-trade-search';
  search.setAttribute('aria-label', '종목 검색');
  search.innerHTML = icon('M11 4a7 7 0 1 0 4.4 12.4l4.3 4.3 1.4-1.4-4.3-4.3A7 7 0 0 0 11 4z');
  search.addEventListener('click', () => doc.querySelector('.symbol-selector-trigger, .workbench-symbol')?.click());
  const indicators = doc.createElement('button');
  indicators.type = 'button';
  indicators.className = 'atlas-trade-indicators';
  indicators.setAttribute('aria-label', '지표');
  indicators.innerHTML = icon('M4 7h16M4 12h16M4 17h10');
  indicators.addEventListener('click', () => doc.getElementById('atlas-mode-menu')?.click());
  const toolButton = doc.createElement('button');
  toolButton.type = 'button';
  toolButton.className = 'atlas-trade-tools-btn';
  toolButton.setAttribute('aria-label', '도구');
  toolButton.innerHTML = icon('M5 3v18M12 3v18M19 3v18M2 8h6m1 8h6m1-10h6');
  toolButton.addEventListener('click', () => doc.querySelector('#chart-tools-menu button')?.click());
  const draw = doc.createElement('button');
  draw.type = 'button';
  draw.className = 'atlas-trade-draw';
  draw.setAttribute('aria-label', '그리기');
  draw.setAttribute('aria-pressed', 'false');
  draw.innerHTML = icon('M4 20l5.5-5.5M13 5l6 6-8 8H5v-6z');
  draw.addEventListener('click', () => {
    const open = doc.body.classList.toggle('atlas-draw-open');
    draw.setAttribute('aria-pressed', String(open));
  });
  upper.append(upperTab, search, account);
  const status = doc.createElement('div');
  status.className = 'atlas-trade-status';
  status.setAttribute('role', 'status');
  const nav = doc.createElement('nav');
  nav.className = 'atlas-trade-tabs';
  nav.setAttribute('aria-label', '화면');
  const iconFor = id => atlasPages.find(item => item.id === id)?.icon || '';
  const primary = [
    { id: 'chart', label: '차트', href: pageHref('outlook'), icon: 'M8 3v3M8 18v3M16 3v6M16 15v6M6 6h4v12H6zM14 9h4v6h-4z' },
    { id: 'data', label: '비교', href: atlasSitePath('/?center=data'), icon: 'M4 5h16v14H4zM4 10h16M4 14h16M9 5v14' },
    { id: 'market', label: '시장', href: pageHref('market-us'), icon: 'M4 20V10M12 20V5M20 20v-7M3 20h18' },
    { id: 'relay', label: '릴레이 콘텐츠', href: pageHref('relay'), icon: 'M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5' },
    { id: 'chat', label: '채팅', icon: 'M5 6h14v9H9l-4 3v-3H5z' },
  ];
  const more = [
    { id: 'market-home', label: '시장 분석', href: atlasSitePath('/market-lab/'), icon: iconFor('market-us') },
    { id: 'assets', label: '자산 비교', href: pageHref('data'), icon: iconFor('data') },
    { id: 'ipo', label: '공모주', href: pageHref('ipo'), icon: iconFor('ipo') },
    { id: 'evidence', label: '리서치', href: pageHref('evidence'), icon: iconFor('evidence') },
    { id: 'scenario', label: '조건 실험', href: pageHref('scenario'), icon: iconFor('scenario') },
    { id: 'cashflow', label: '현금흐름', href: pageHref('cashflow'), icon: iconFor('cashflow') },
    { id: 'rsi', label: '삼플레·RSI', href: pageHref('rsi'), icon: iconFor('rsi') },
    { id: 'housing', label: '부동산', href: pageHref('housing'), icon: iconFor('housing') },
    { id: 'themes', label: '테마·재료', href: pageHref('themes'), icon: iconFor('themes') },
  ];
  const groups = [primary];
  for (let index = 0; index < more.length; index += 5) groups.push(more.slice(index, index + 5));
  const scroller = doc.createElement('div');
  scroller.className = 'atlas-trade-pages';
  const dots = doc.createElement('div');
  dots.className = 'atlas-trade-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (const [index, group] of groups.entries()) {
    const page = doc.createElement('div');
    page.className = 'atlas-trade-page';
    page.dataset.tradePage = String(index + 1);
    for (const tab of group) {
      const node = tab.href ? doc.createElement('a') : doc.createElement('button');
      node.className = 'atlas-trade-tab';
      node.dataset.tradeTab = tab.id;
      if (tab.href) node.href = tab.href;
      else node.type = 'button';
      node.innerHTML = `${icon(tab.icon)}<span>${tab.label}</span>`;
      if (tab.id === 'relay') node.setAttribute('aria-label', '릴레이 콘텐츠');
      page.append(node);
    }
    scroller.append(page);
    const dot = doc.createElement('span');
    dot.className = 'atlas-trade-dot';
    dots.append(dot);
  }
  nav.append(scroller, dots);
  doc.body.append(upper, status, nav);

  const priceBox = doc.createElement('div');
  priceBox.className = 'atlas-trade-price';
  priceBox.setAttribute('role', 'group');
  priceBox.setAttribute('aria-label', '가격');
  const price = doc.createElement('strong');
  price.dataset.tradePrice = 'true';
  price.textContent = '';
  const change = doc.createElement('span');
  change.className = 'atlas-trade-change';
  change.dataset.tradeChange = 'true';
  change.textContent = '';
  priceBox.append(price, change);
  const brand = doc.createElement('a');
  brand.className = 'atlas-trade-brand';
  brand.setAttribute('aria-label', '홈');
  let frame = 0;

  function heading() {
    return doc.querySelector('.workspace .atlas-canvas-heading');
  }
  function placeChrome() {
    const compact = media.matches;
    doc.body.classList.toggle('atlas-funnest-compact', compact);
    if (!compact) doc.body.classList.remove('atlas-draw-open');
    const bar = heading();
    if (!bar) return;
    if (compact) {
      if (brand.parentElement !== bar) {
        const source = doc.querySelector('.atlas-sidebar .atlas-brand');
        brand.href = pageHref('outlook');
        brand.setAttribute('aria-label', source?.getAttribute('aria-label') || '홈');
        const mark = source?.querySelector('span[aria-hidden="true"]')?.textContent?.trim() || '₿';
        if (brand.textContent !== mark) brand.textContent = mark;
        bar.prepend(brand);
      }
      if (indicators.parentElement !== bar) bar.append(indicators);
      if (toolButton.parentElement !== bar) bar.append(toolButton);
      if (draw.parentElement !== bar) bar.append(draw);
      if (search.parentElement !== bar) bar.append(search);
      if (account.parentElement !== bar) bar.append(account);
      const drawing = doc.body.classList.contains('atlas-draw-open');
      if (draw.getAttribute('aria-pressed') !== String(drawing)) draw.setAttribute('aria-pressed', String(drawing));
    } else {
      brand.remove();
      if (search.parentElement !== upper) upper.append(search);
      if (account.parentElement !== upper) upper.append(account);
      priceBox.remove();
      indicators.remove();
      toolButton.remove();
      draw.remove();
    }
  }
  function writeText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function writeAttr(node, name, value) {
    if (value && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function legendQuote() {
    const values = doc.querySelector('.chart-symbol-legend-values');
    if (!values) return null;
    const close = [...values.querySelectorAll('span')].find(node => (node.childNodes[0]?.textContent || '').trim() === '종');
    const changeNode = values.querySelector(':scope > b');
    const toneClass = changeNode?.className || '';
    return {
      name: doc.querySelector('.chart-symbol-legend-title b')?.textContent?.trim() || '',
      close: close?.querySelector('b')?.textContent?.trim() || '',
      change: changeNode?.textContent?.trim() || '',
      tone: toneClass.includes('is-down') ? 'down' : toneClass.includes('is-up') ? 'up' : '',
    };
  }
  function boardStamp() {
    const text = doc.querySelector('.atlas-center-frame')?.contentDocument?.body?.innerText || '';
    const match = text.match(/최근 종가\s*(20\d\d\.\d\d\.\d\d)/);
    return match ? `최근 종가  ${match[1]}` : '';
  }
  const TAB_LABELS = {
    data: '자산 비교',
    'market-us': '시장',
    'market-kr': '시장',
    market: '시장',
    evidence: '리서치',
    ipo: '공모주',
    relay: '릴레이',
    scenario: '조건 실험',
    cashflow: '현금흐름',
    rsi: '삼플레·RSI',
    housing: '부동산',
    themes: '테마·재료',
  };
  function syncQuote() {
    const quote = legendQuote();
    const close = quote?.close || '';
    const raw = quote?.change || '';
    writeText(price, close);
    writeText(change, raw);
    if (quote?.tone) change.dataset.tone = quote.tone;
    else change.removeAttribute('data-tone');
    priceBox.hidden = !close;
    writeAttr(change, 'aria-label', raw ? `직전 봉 대비 ${raw}` : '');
    writeAttr(price, 'aria-label', close ? `가격 ${close}` : '');
    const center = doc.body.dataset.centerTool;
    const label = TAB_LABELS[center || doc.body.dataset.page || ''] || '가격 차트';
    const statusText = center && center !== 'chart' ? (boardStamp() || label) : [quote?.name, close, raw].filter(Boolean).join('  ');
    writeText(status, statusText);
    writeText(upperTab, label);
  }
  function syncLogin() {
    doc.querySelector('.atlas-trade-login')?.remove();
  }
  function chatOpen() {
    const panel = doc.querySelector('.atlas-chat');
    return Boolean(panel && !panel.hidden && doc.body.dataset.shell === 'chart' && !doc.body.dataset.centerTool);
  }
  function activeTab() {
    const center = doc.body.dataset.centerTool;
    if (center === 'data') return 'data';
    if (center === 'market-us' || center === 'market-kr') return 'market';
    if (center && Object.hasOwn(TAB_LABELS, center)) return center;
    const page = doc.body.dataset.page || 'outlook';
    const path = view.location?.pathname || '';
    if (page === 'data') return 'assets';
    if (page === 'ipo') return 'ipo';
    if (page === 'evidence') return 'evidence';
    if (page === 'market') {
      if (/\/market-lab\/scenario\/?$/.test(path)) return 'scenario';
      if (/\/market-lab\/cashflow\/?$/.test(path)) return 'cashflow';
      if (/\/market-lab\/rsi\/?$/.test(path)) return 'rsi';
      if (/\/market-lab\/housing\/?$/.test(path)) return 'housing';
      if (/\/market-lab\/themes\/?$/.test(path)) return 'themes';
      if (/\/market-lab\/?$/.test(path)) return 'market-home';
      return 'market';
    }
    if (page === 'relay') return 'relay';
    if (chatOpen()) return 'chat';
    if (page === 'outlook' || page === 'compare' || doc.body.dataset.shell === 'chart') return 'chart';
    return '';
  }
  let pinnedTab = '';
  function updateDots() {
    const width = scroller.clientWidth || 1;
    const index = Math.round(scroller.scrollLeft / width);
    [...dots.children].forEach((dot, dotIndex) => { dot.dataset.current = String(dotIndex === index); });
  }
  function pinActivePage(active) {
    if (!active || active === pinnedTab) return;
    const node = nav.querySelector(`[data-trade-tab="${active}"]`);
    const page = node?.closest('.atlas-trade-page');
    if (!page) return;
    if (!scroller.clientWidth) return;
    pinnedTab = active;
    if (Math.abs(scroller.scrollLeft - page.offsetLeft) > 1) scroller.scrollTo({ left: page.offsetLeft, behavior: 'instant' });
    updateDots();
  }
  function syncTabs() {
    const active = activeTab();
    for (const node of nav.querySelectorAll('[data-trade-tab]')) {
      const on = node.dataset.tradeTab === active;
      if (node.dataset.tradeTab === 'chat') {
        const pressed = String(chatOpen());
        if (node.getAttribute('aria-pressed') !== pressed) node.setAttribute('aria-pressed', pressed);
      }
      if (on) { if (node.getAttribute('aria-current') !== 'page') node.setAttribute('aria-current', 'page'); }
      else if (node.hasAttribute('aria-current')) node.removeAttribute('aria-current');
    }
    pinActivePage(active);
  }
  function revealInterval() {
    const scroller = doc.querySelector('#workbench-frequency .lab-segmented');
    const selected = scroller?.querySelector('.interval-chip[aria-pressed="true"]');
    if (!selected || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const left = selected.offsetLeft;
    const right = left + selected.offsetWidth;
    const view = scroller.clientWidth;
    if (left < scroller.scrollLeft) scroller.scrollLeft = left;
    else if (right > scroller.scrollLeft + view) scroller.scrollLeft = Math.max(0, right - view);
    const edge = scroller.scrollLeft;
    const cut = [...scroller.querySelectorAll('.interval-chip')].reverse().find(chip => chip.offsetLeft < edge - 1 && chip.offsetLeft + chip.offsetWidth > edge + 1);
    if (cut) {
      const next = cut.offsetLeft + cut.offsetWidth;
      if (right - next <= view + 1) scroller.scrollLeft = next;
    }
  }
  function refresh() {
    placeChrome();
    syncQuote();
    syncLogin();
    syncTabs();
    revealInterval();
  }
  function schedule() {
    if (frame) return;
    frame = view.requestAnimationFrame(() => { frame = 0; refresh(); });
  }
  scroller.addEventListener('scroll', updateDots, { passive: true });
  nav.addEventListener('focusin', event => {
    const page = event.target instanceof Element ? event.target.closest('.atlas-trade-page') : null;
    if (!page || !scroller.clientWidth) return;
    if (Math.abs(scroller.scrollLeft - page.offsetLeft) > 1) scroller.scrollTo({ left: page.offsetLeft, behavior: 'instant' });
    updateDots();
  });
  const SPA_VIEWS = { relay: 'relay', assets: 'data', data: 'data', ipo: 'ipo', evidence: 'evidence', market: 'market', 'market-home': 'market', chart: 'outlook' };
  const WORKBENCH_PAGES = { data: 'data', market: 'market-us', 'market-home': 'market-us', scenario: 'scenario', cashflow: 'cashflow', rsi: 'rsi', housing: 'housing', themes: 'themes' };
  const triggerWorkbenchPage = (pageId, { direct = false } = {}) => {
    const existing = !direct ? doc.querySelector(`[data-atlas-page="${pageId}"]`) : null;
    if (existing) { existing.click(); return true; }
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.dataset.atlasPage = pageId;
    if (direct) trigger.dataset.atlasDirect = '1';
    doc.body.append(trigger);
    try { trigger.click(); }
    finally { trigger.remove(); }
    return true;
  };
  const clickSpaView = (viewName, { bypassWorkbench = false } = {}) => {
    const target = (bypassWorkbench && doc.querySelector(`[data-view="${viewName}"]:not([data-atlas-page])`))
      || doc.querySelector(`[data-view="${viewName}"]`);
    if (!target) return false;
    const saved = bypassWorkbench ? target.dataset.atlasPage : '';
    if (saved) delete target.dataset.atlasPage;
    try { target.click(); }
    finally { if (saved) target.dataset.atlasPage = saved; }
    return true;
  };
  nav.addEventListener('click', event => {
    const tab = event.target instanceof Element ? event.target.closest('[data-trade-tab]') : null;
    if (!tab) return;
    const id = tab.dataset.tradeTab;
    if (id === 'chart') {
      const here = (doc.body.dataset.page === 'outlook' || doc.body.dataset.page === 'compare') && doc.body.dataset.shell === 'chart' && !doc.body.dataset.centerTool;
      if (here) {
        event.preventDefault();
        if (chatOpen()) doc.querySelector('[data-chart-chat]')?.click();
        return;
      }
      if (doc.body.dataset.centerTool) {
        event.preventDefault();
        if (chatOpen()) doc.querySelector('[data-chart-chat]')?.click();
        doc.dispatchEvent(new (view.CustomEvent || CustomEvent)('atlas:restore-chart', { detail: { restoreUrl: true } }));
        clickSpaView('outlook', { bypassWorkbench: true });
        schedule();
        return;
      }
      if (doc.querySelector('[data-view="outlook"]')) {
        event.preventDefault();
        if (chatOpen()) doc.querySelector('[data-chart-chat]')?.click();
        clickSpaView('outlook', { bypassWorkbench: true });
        schedule();
      }
      return;
    }
    if (Object.hasOwn(WORKBENCH_PAGES, id) && doc.querySelector('.atlas-plot')) {
      event.preventDefault();
      if (chatOpen()) doc.querySelector('[data-chart-chat]')?.click();
      triggerWorkbenchPage(WORKBENCH_PAGES[id], {
        direct: id === 'market-home' || (id === 'market' && ['cashflow', 'scenario'].includes(doc.body.dataset.centerTool)),
      });
      schedule();
      return;
    }
    if (Object.hasOwn(SPA_VIEWS, id)) {
      const viewName = SPA_VIEWS[id];
      const bypassWorkbench = id === 'assets' || !doc.querySelector('.atlas-plot');
      const hasTarget = Boolean((bypassWorkbench && doc.querySelector(`[data-view="${viewName}"]:not([data-atlas-page])`)) || doc.querySelector(`[data-view="${viewName}"]`));
      if (hasTarget) {
        event.preventDefault();
        if (chatOpen()) doc.querySelector('[data-chart-chat]')?.click();
        if (id === 'assets' && doc.body.dataset.centerTool) {
          doc.dispatchEvent(new (view.CustomEvent || CustomEvent)('atlas:restore-chart', { detail: { replaceUrl: true } }));
        }
        clickSpaView(viewName, { bypassWorkbench });
        schedule();
        return;
      }
    }
    if (id === 'indicators') {
      event.preventDefault();
      doc.getElementById('atlas-mode-menu')?.click();
      return;
    }
    if (id === 'tools') {
      event.preventDefault();
      (doc.getElementById('mobile-tools-toggle') || doc.getElementById('chart-tools-menu'))?.click();
      return;
    }
    if (id !== 'chat') return;
    event.preventDefault();
    const opener = doc.querySelector('[data-chart-chat]');
    if (doc.body.dataset.shell === 'chart' && !doc.body.dataset.centerTool && opener) {
      opener.click();
      schedule();
      return;
    }
    try { view.localStorage?.setItem(CHAT_KEY, '1'); } catch { /* The next chart visit still opens from the button. */ }
    view.location.assign(pageHref('outlook'));
  });
  const observer = new MutationObserver(records => {
    const relevant = records.some(record => {
      const node = record.target instanceof Element ? record.target : record.target.parentElement;
      const insideLegend = Boolean(node?.closest('.chart-symbol-legend, #lab-metrics'));
      return insideLegend || (node && !node.closest('svg, .atlas-plot, .atlas-trade-price, .atlas-trade-tabs, .atlas-trade-login, .atlas-trade-status, .atlas-trade-upper, .atlas-trade-draw'));
    });
    if (relevant) schedule();
  });
  observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-page', 'data-center-tool', 'data-shell', 'hidden', 'data-tone', 'aria-label'] });
  const revealAfterInterval = event => {
    if (event.target instanceof Element && event.target.closest('#workbench-frequency')) schedule();
  };
  doc.addEventListener('click', revealAfterInterval);
  media.addEventListener?.('change', schedule);
  view.addEventListener('resize', schedule);
  refresh();
  return () => {
    observer.disconnect();
    doc.removeEventListener('click', revealAfterInterval);
    media.removeEventListener?.('change', schedule);
    view.removeEventListener('resize', schedule);
    if (frame) view.cancelAnimationFrame(frame);
    doc.body.classList.remove('atlas-funnest-compact');
    brand.remove();
    search.remove();
    account.remove();
    priceBox.remove();
    indicators.remove();
    toolButton.remove();
    draw.remove();
    upper.remove();
    status.remove();
    nav.remove();
  };
}
