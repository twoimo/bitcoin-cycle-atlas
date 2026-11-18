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
  account.innerHTML = icon('M12 12a3.2 3.2 0 1 0-3.2-3.2A3.2 3.2 0 0 0 12 12zM5.5 19.2a6.5 6.5 0 0 1 13 0');
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
  const tabs = [
    { id: 'chart', label: '차트', href: pageHref('outlook'), icon: 'M8 3v3M8 18v3M16 3v6M16 15v6M6 6h4v12H6zM14 9h4v6h-4z' },
    { id: 'data', label: '비교', href: atlasSitePath('/?center=data'), icon: 'M4 5h16v14H4zM4 10h16M4 14h16M9 5v14' },
    { id: 'market', label: '시장', href: pageHref('market-us'), icon: 'M4 20V10M12 20V5M20 20v-7M3 20h18' },
    { id: 'relay', label: '릴레이 콘텐츠', href: pageHref('relay'), icon: 'M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5' },
    { id: 'chat', label: '채팅', icon: 'M5 6h14v9H9l-4 3v-3H5z' },
  ];
  for (const tab of tabs) {
    const node = tab.href ? doc.createElement('a') : doc.createElement('button');
    node.className = 'atlas-trade-tab';
    node.dataset.tradeTab = tab.id;
    if (tab.href) node.href = tab.href;
    else node.type = 'button';
    node.innerHTML = `${icon(tab.icon)}<span>${tab.label}</span>`;
    if (tab.id === 'relay') node.setAttribute('aria-label', '릴레이 콘텐츠');
    nav.append(node);
  }
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
    const statusText = center && center !== 'chart' ? (boardStamp() || upperTab.textContent) : [quote?.name, close, raw].filter(Boolean).join('  ');
    writeText(status, statusText);
    const label = center === 'data' ? '자산 비교'
      : center === 'market-us' || doc.body.dataset.page === 'market' ? '시장'
      : doc.body.dataset.page === 'evidence' ? '리서치'
      : doc.body.dataset.page === 'ipo' ? '공모주'
      : doc.body.dataset.page === 'relay' ? '릴레이'
      : '가격 차트';
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
    const page = doc.body.dataset.page || 'outlook';
    if (doc.body.dataset.centerTool === 'data' || page === 'data') return 'data';
    if (doc.body.dataset.centerTool === 'market-us' || page === 'market') return 'market';
    if (page === 'relay') return 'relay';
    if (chatOpen()) return 'chat';
    if (page === 'outlook' || page === 'compare' || doc.body.dataset.shell === 'chart') return 'chart';
    return '';
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
  nav.addEventListener('click', event => {
    const tab = event.target instanceof Element ? event.target.closest('[data-trade-tab]') : null;
    if (!tab) return;
    if (tab.dataset.tradeTab === 'chart') {
      const here = (doc.body.dataset.page === 'outlook' || doc.body.dataset.page === 'compare') && doc.body.dataset.shell === 'chart' && !doc.body.dataset.centerTool;
      if (here) {
        event.preventDefault();
        if (chatOpen()) doc.querySelector('[data-chart-chat]')?.click();
      }
      return;
    }
    if (tab.dataset.tradeTab === 'indicators') {
      event.preventDefault();
      doc.getElementById('atlas-mode-menu')?.click();
      return;
    }
    if (tab.dataset.tradeTab === 'tools') {
      event.preventDefault();
      (doc.getElementById('mobile-tools-toggle') || doc.getElementById('chart-tools-menu'))?.click();
      return;
    }
    if (tab.dataset.tradeTab !== 'chat') return;
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
