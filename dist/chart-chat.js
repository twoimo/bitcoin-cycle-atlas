const STORAGE_KEY = 'atlas-chart-chat-v1';
const OPEN_KEY = 'atlas-chart-chat-open';
const CHANNEL = 'atlas-chart-chat';

function readMessages() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.text === 'string' && typeof item.name === 'string').slice(-200) : [];
  } catch { return []; }
}
function writeMessages(messages) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-200))); } catch { /* The room still works in this tab. */ }
}
function authorName(doc) {
  const label = doc.querySelector('#auth-account [data-auth-action="menu"]')?.getAttribute('aria-label') || '';
  return label.endsWith(' 프로필') ? label.slice(0, -' 프로필'.length) : '손님';
}
function stamp(date) {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function readerIsOpen(doc) {
  const reader = doc.getElementById('chart-reader');
  return Boolean(reader && !reader.hidden);
}
function preferredOpen() {
  try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; }
}
function priceSurface(doc, chart) {
  return Boolean(chart) && !doc.body?.dataset.centerTool;
}
function placeChat(doc, panel, open) {
  panel.hidden = !open;
  if (doc.body) {
    if (open) doc.body.dataset.chatOpen = 'true';
    else delete doc.body.dataset.chatOpen;
  }
  const host = panel.closest('.workspace');
  if (!host) return;
  if (open) host.dataset.detailsOpen = 'true';
  else if (!readerIsOpen(doc)) host.dataset.detailsOpen = 'false';
}
const panelListeners = new WeakSet();
function listenForOtherPanels(doc) {
  if (panelListeners.has(doc)) return;
  panelListeners.add(doc);
  doc.addEventListener('atlas:panel-state', event => {
    if (event.detail?.kind === 'chat' || !event.detail?.open) return;
    const panel = doc.getElementById('atlas-chart-chat');
    const button = doc.querySelector('[data-chart-chat]');
    if (!panel || panel.hidden) return;
    placeChat(doc, panel, false);
    button?.setAttribute('aria-pressed', 'false');
    button?.setAttribute('aria-expanded', 'false');
    try { localStorage.setItem(OPEN_KEY, '0'); } catch { /* Preference is optional. */ }
  });
}

export function syncChartChat(doc, { chart = false, rail = null } = {}) {
  const workspace = doc.querySelector('.workspace');
  if (!workspace) return;
  listenForOtherPanels(doc);
  let panel = doc.getElementById('atlas-chart-chat');
  if (!panel) {
    panel = doc.createElement('aside');
    panel.id = 'atlas-chart-chat';
    panel.className = 'atlas-chat chart-details-panel';
    panel.setAttribute('aria-label', '채팅');
    panel.innerHTML = `<header class="atlas-chat-head"><h2 id="atlas-chart-chat-title">채팅</h2><span class="atlas-chat-presence"><i class="atlas-chat-dot" aria-hidden="true"></i><span data-chat-presence>이 브라우저</span></span><button type="button" data-chat-close aria-label="채팅 닫기">닫기</button></header><div class="atlas-chat-log" role="log" aria-live="polite"></div><form class="atlas-chat-form"><input name="text" maxlength="500" autocomplete="off" aria-label="채팅 메시지" placeholder="메시지"><button type="submit">보내기</button></form>`;
    panel.setAttribute('aria-labelledby', 'atlas-chart-chat-title');
    workspace.append(panel);
    const log = panel.querySelector('.atlas-chat-log');
    const form = panel.querySelector('form');
    const input = form.querySelector('input');
    let messages = readMessages();
    const paint = () => {
      log.replaceChildren();
      if (!messages.length) {
        const empty = doc.createElement('p');
        empty.className = 'atlas-chat-empty';
        empty.textContent = '이 브라우저에 남습니다. 다른 사이트 대화와 연결되지 않습니다.';
        log.append(empty);
        return;
      }
      for (const item of messages) {
        const line = doc.createElement('div');
        line.className = 'atlas-chat-line';
        const avatar = doc.createElement('span');
        avatar.className = 'atlas-chat-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = ([...item.name][0] || '·').toUpperCase();
        const body = doc.createElement('div');
        const who = doc.createElement('span');
        who.className = 'atlas-chat-who';
        who.textContent = `${item.name} ${item.at || ''}`;
        const bubble = doc.createElement('p');
        bubble.className = 'atlas-chat-bubble';
        bubble.textContent = item.text;
        body.append(who, bubble);
        line.append(avatar, body);
        log.append(line);
      }
      log.scrollTop = log.scrollHeight;
    };
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
    channel?.addEventListener('message', event => {
      if (event.data?.type !== 'message' || typeof event.data.text !== 'string') return;
      messages = readMessages();
      paint();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      messages = [...readMessages(), { name: authorName(doc), text, at: stamp(new Date()) }].slice(-200);
      writeMessages(messages);
      input.value = '';
      paint();
      channel?.postMessage({ type: 'message', text });
    });
    const setOpen = (open, { focus = false, persist = false, notify = false, restore = false } = {}) => {
      if (open && notify && readerIsOpen(doc)) doc.dispatchEvent(new CustomEvent('atlas:close-detail'));
      placeChat(doc, panel, open);
      const toggle = doc.querySelector('[data-chart-chat]');
      toggle?.setAttribute('aria-pressed', String(open));
      toggle?.setAttribute('aria-expanded', String(open));
      if (persist) { try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* Preference is optional. */ } }
      if (notify) doc.dispatchEvent(new CustomEvent('atlas:panel-state', { detail: { open, kind: 'chat' } }));
      if (open && focus) panel.querySelector('input')?.focus({ preventScroll: true });
      else if (!open && restore) toggle?.focus({ preventScroll: true });
    };
    panel.querySelector('[data-chat-close]').addEventListener('click', () => setOpen(false, { persist: true, notify: true, restore: true }));
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || panel.hidden) return;
      event.preventDefault();
      setOpen(false, { persist: true, notify: true, restore: true });
    });
    paint();
    const open = preferredOpen();
    if (open && !priceSurface(doc, chart)) panel.dataset.chatResume = '1';
    setOpen(open && priceSurface(doc, chart));
  }
  let button = rail?.querySelector('[data-chart-chat]');
  if (chart && rail) {
    if (!button) {
      button = doc.createElement('button');
      button.type = 'button';
      button.className = 'workbench-icon';
      button.dataset.chartChat = 'toggle';
      button.title = '채팅';
      button.setAttribute('aria-label', '채팅');
      button.setAttribute('aria-controls', panel.id);
      button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 6h14v9H8l-3 3V6z"/></svg>';
      button.addEventListener('click', () => {
        const open = panel.hidden;
        if (open && readerIsOpen(doc)) doc.dispatchEvent(new CustomEvent('atlas:close-detail'));
        if (open) panel.dataset.chatHold = '1'; else delete panel.dataset.chatHold;
        placeChat(doc, panel, open);
        button.setAttribute('aria-pressed', String(open));
        button.setAttribute('aria-expanded', String(open));
        try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* Preference is optional. */ }
        doc.dispatchEvent(new CustomEvent('atlas:panel-state', { detail: { open, kind: 'chat' } }));
        if (open) panel.querySelector('input')?.focus({ preventScroll: true });
      });
      (rail.querySelector('.workbench-detail-tools') || rail).append(button);
    }
    button.setAttribute('aria-pressed', String(!panel.hidden));
    button.setAttribute('aria-expanded', String(!panel.hidden));
  } else if (button) button.remove();
  // A stored open chat belongs to the price surface. A center page, such as
  // market diagnosis, keeps that preference and stays visible until return.
  if (!priceSurface(doc, chart)) {
    if (!panel.hidden && panel.dataset.chatHold !== '1') {
      panel.dataset.chatResume = preferredOpen() ? '1' : '0';
      placeChat(doc, panel, false);
    }
  } else if (panel.dataset.chatResume === '1') {
    delete panel.dataset.chatResume;
    delete panel.dataset.chatHold;
    placeChat(doc, panel, true);
  } else delete panel.dataset.chatHold;
  const toggle = doc.querySelector('[data-chart-chat]');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(!panel.hidden));
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  }
}
