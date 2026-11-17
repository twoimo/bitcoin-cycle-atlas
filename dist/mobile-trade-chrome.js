import { atlasSitePath } from './site-paths.js';
import { atlasPages } from './atlas-navigation.js?v=1.36.2';

const COMPACT = '(max-width: 768px)';
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
  const nav = doc.createElement('nav');
  nav.className = 'atlas-trade-tabs';
  nav.setAttribute('aria-label', '화면');
  const tabs = [
    { id: 'chart', label: '차트', href: pageHref('outlook'), icon: 'M8 3v3M8 18v3M16 3v6M16 15v6M6 6h4v12H6zM14 9h4v6h-4z' },
    { id: 'market', label: '시장', href: pageHref('market-us'), icon: 'M4 20V10M12 20V5M20 20v-7M3 20h18' },
    { id: 'research', label: '리서치', href: pageHref('evidence'), icon: 'M12 6c-2.5-1.5-5-1.5-8-.5v13c3-1 5.5-1 8 1 2.5-2 5-2 8-1v-13c-3-1-5.5-1-8 .5zM12 6v13' },
    { id: 'chat', label: '채팅', icon: 'M5 6h14v9H9l-4 3v-3H5z' },
  ];
  for (const tab of tabs) {
    const node = tab.href ? doc.createElement('a') : doc.createElement('button');
    node.className = 'atlas-trade-tab';
    node.dataset.tradeTab = tab.id;
    if (tab.href) node.href = tab.href;
    else node.type = 'button';
    node.innerHTML = `${icon(tab.icon)}<span>${tab.label}</span>`;
    nav.append(node);
  }
  doc.body.append(nav);

  const priceBox = doc.createElement('div');
  priceBox.className = 'atlas-trade-price';
  priceBox.setAttribute('role', 'group');
  priceBox.setAttribute('aria-label', '가격');
  const price = doc.createElement('strong');
  price.dataset.tradePrice = 'true';
  price.textContent = '—';
  const change = doc.createElement('span');
  change.className = 'atlas-trade-change';
  change.dataset.tradeChange = 'true';
  change.textContent = '—';
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
    const bar = heading();
    if (!bar) return;
    if (compact) {
      if (!bar.contains(brand)) {
        const source = doc.querySelector('.atlas-sidebar .atlas-brand');
        brand.href = source?.href || pageHref('outlook');
        brand.setAttribute('aria-label', source?.getAttribute('aria-label') || '홈');
        brand.replaceChildren();
        const svg = source?.querySelector('svg');
        if (svg) brand.append(svg.cloneNode(true));
        bar.prepend(brand);
      }
      if (priceBox.parentElement !== bar) bar.append(priceBox);
      const search = bar.querySelector('#workbench-workspace');
      const account = bar.querySelector('.auth-account');
      if (search) { search.style.order = '2'; search.style.marginLeft = 'auto'; }
      if (account) { account.style.order = '3'; account.style.marginLeft = '8px'; account.style.marginRight = '8px'; }
    } else {
      const search = bar.querySelector('#workbench-workspace');
      const account = bar.querySelector('.auth-account');
      if (search) { search.style.order = ''; search.style.marginLeft = ''; }
      if (account) { account.style.order = ''; account.style.marginLeft = ''; account.style.marginRight = ''; }
      brand.remove();
      priceBox.remove();
    }
  }
  function writeText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function writeAttr(node, name, value) {
    if (value && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function syncQuote() {
    const sourcePrice = doc.querySelector('#lab-metrics .readout-main strong') || doc.querySelector('.quote-hud-price');
    const sourceChange = doc.querySelector('#lab-metrics .atlas-day-change') || doc.querySelector('.quote-hud-change');
    writeText(price, sourcePrice?.textContent?.trim() || '—');
    const raw = sourceChange?.textContent?.trim() || '';
    writeText(change, raw.replace(/^전봉\s*/, '') || '—');
    const tone = sourceChange?.dataset.tone || (sourceChange?.classList.contains('lab-down') ? 'down' : sourceChange?.classList.contains('lab-up') ? 'up' : '');
    if (tone && change.dataset.tone !== tone) change.dataset.tone = tone;
    writeAttr(change, 'aria-label', sourceChange?.getAttribute('aria-label') || (raw ? `직전 봉 대비 ${raw.replace(/^전봉\s*/, '')}` : ''));
    writeAttr(price, 'aria-label', sourcePrice?.getAttribute('aria-label') || (price.textContent !== '—' ? `가격 ${price.textContent}` : ''));
  }
  function syncLogin() {
    const button = doc.querySelector('.auth-account [data-auth-action="account"]');
    const compact = doc.body.classList.contains('atlas-funnest-compact');
    if (!button || !compact) {
      doc.querySelector('.atlas-trade-login')?.remove();
      if (button?.getAttribute('aria-label') === '로그인') button.setAttribute('aria-label', '계정');
      return;
    }
    if (!button.querySelector('.atlas-trade-login')) {
      const label = doc.createElement('span');
      label.className = 'atlas-trade-login';
      label.textContent = '로그인';
      button.append(label);
    }
    if (button.getAttribute('aria-label') !== '로그인') button.setAttribute('aria-label', '로그인');
  }
  function chatOpen() {
    const panel = doc.querySelector('.atlas-chat');
    return Boolean(panel && !panel.hidden && doc.body.dataset.shell === 'chart' && !doc.body.dataset.centerTool);
  }
  function activeTab() {
    const page = doc.body.dataset.page || 'outlook';
    if (doc.body.dataset.centerTool === 'market-us' || page === 'market') return 'market';
    if (page === 'evidence') return 'research';
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
  function refresh() {
    placeChrome();
    syncQuote();
    syncLogin();
    syncTabs();
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
      return node && !node.closest('svg, .atlas-plot, .atlas-trade-price, .atlas-trade-tabs, .atlas-trade-login');
    });
    if (relevant) schedule();
  });
  observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-page', 'data-center-tool', 'data-shell', 'hidden', 'data-tone', 'aria-label'] });
  media.addEventListener?.('change', schedule);
  view.addEventListener('resize', schedule);
  refresh();
  return () => {
    observer.disconnect();
    media.removeEventListener?.('change', schedule);
    view.removeEventListener('resize', schedule);
    if (frame) view.cancelAnimationFrame(frame);
    doc.body.classList.remove('atlas-funnest-compact');
    brand.remove();
    priceBox.remove();
    nav.remove();
  };
}
