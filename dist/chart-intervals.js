/** Favorite interval chips and the grouped interval menu. Longer than one week is listed and disabled: the chart has no monthly candles. */
const STORAGE_KEY = 'atlas-chart-intervals-v1';
const DEFAULT_FAVORITES = ['1m', '5m', '15m', '1h', '4h', 'daily'];
const LONGER_REASON = '완료된 봉은 1주까지입니다';

export const INTERVAL_MENU = Object.freeze([
  { id: 'minute', label: '분', items: [
    { id: '1m', chip: '1분', menu: '1분' },
    { id: '5m', chip: '5분', menu: '5분' },
    { id: '15m', chip: '15분', menu: '15분' },
    { id: '30m', chip: '30분', menu: '30분' },
  ]},
  { id: 'hour', label: '시간', items: [
    { id: '1h', chip: '1시간', menu: '1시간' },
    { id: '4h', chip: '4시간', menu: '4시간' },
  ]},
  { id: 'day', label: '일', items: [
    { id: 'daily', chip: '일', menu: '1일' },
    { id: 'weekly', chip: '주', menu: '1주' },
    { id: '1M', chip: '월', menu: '1개월', disabledReason: LONGER_REASON },
    { id: '3M', chip: '분기', menu: '3개월', disabledReason: LONGER_REASON },
    { id: '6M', chip: '반기', menu: '6개월', disabledReason: LONGER_REASON },
    { id: '12M', chip: '연', menu: '1년', disabledReason: LONGER_REASON },
  ]},
].map(group => Object.freeze({ ...group, items: Object.freeze(group.items.map(Object.freeze)) })));

const allItems = () => INTERVAL_MENU.flatMap(group => group.items);
const itemById = id => allItems().find(item => item.id === id) || null;
const star = pressed => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${pressed ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6"><path d="m12 3.2 2.4 5.1 5.6.7-4.1 3.8 1.1 5.5L12 15.6 7 18.3l1.1-5.5L4 9l5.6-.7L12 3.2Z"/></svg>`;

function readFavorites(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '');
    const ids = Array.isArray(parsed?.favorites) ? parsed.favorites.filter(id => { const item = itemById(id); return item && !item.disabledReason; }) : [];
    return ids.length ? ids : [...DEFAULT_FAVORITES];
  } catch { return [...DEFAULT_FAVORITES]; }
}

export function mountChartIntervals({ host, command, storage = globalThis.localStorage, doc = host.ownerDocument }) {
  let favorites = readFavorites(storage);
  let current = 'daily';
  let open = false;
  const root = doc.createElement('div');
  root.className = 'chart-intervals';
  const chips = doc.createElement('div');
  chips.className = 'chart-interval-chips';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', '즐겨 찾는 시간 단위');
  const more = doc.createElement('button');
  more.type = 'button';
  more.className = 'chart-interval-more';
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-label', '시간 단위 더보기');
  const currentLabel = doc.createElement('span');
  currentLabel.className = 'chart-interval-current';
  const chevron = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  more.append(currentLabel, chevron);
  const menu = doc.createElement('div');
  menu.className = 'chart-interval-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '시간 단위');
  menu.hidden = true;
  root.append(chips, more, menu);
  host.append(root);

  const save = () => { try { storage.setItem(STORAGE_KEY, JSON.stringify({ favorites })); } catch { /* private mode */ } };
  const choose = id => {
    const item = itemById(id);
    if (!item || item.disabledReason) return;
    command('frequency', id);
    closeMenu(true);
  };
  function closeMenu(focusMore = false) {
    if (!open) return;
    open = false;
    menu.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    if (focusMore) more.focus({ preventScroll: true });
  }
  function openMenu() {
    open = true;
    menu.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
  }
  function paint() {
    const selected = itemById(current);
    currentLabel.textContent = selected?.chip || '일';
    more.title = selected?.disabledReason || `시간 단위 · ${selected?.menu || currentLabel.textContent}`;
    chips.replaceChildren();
    for (const id of favorites) {
      const item = itemById(id);
      if (!item) continue;
      const chip = doc.createElement('button');
      chip.type = 'button';
      chip.className = 'chart-interval-chip';
      chip.textContent = item.chip;
      chip.setAttribute('aria-pressed', String(item.id === current));
      chip.onclick = () => choose(item.id);
      chips.append(chip);
    }
    menu.replaceChildren();
    for (const group of INTERVAL_MENU) {
      const block = doc.createElement('div');
      block.className = 'chart-interval-group';
      const name = doc.createElement('p');
      name.textContent = group.label;
      block.append(name);
      for (const item of group.items) {
        const row = doc.createElement('div');
        row.className = 'chart-interval-row';
        const button = doc.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitemradio');
        button.setAttribute('aria-checked', String(item.id === current));
        button.textContent = item.menu;
        if (item.disabledReason) {
          button.disabled = true;
          button.title = item.disabledReason;
        } else button.onclick = () => choose(item.id);
        const pin = doc.createElement('button');
        pin.type = 'button';
        pin.className = 'chart-interval-star';
        const pinned = favorites.includes(item.id);
        pin.innerHTML = star(pinned);
        pin.setAttribute('aria-pressed', String(pinned));
        pin.setAttribute('aria-label', `${item.menu} 즐겨찾기`);
        pin.disabled = Boolean(item.disabledReason);
        pin.onclick = event => {
          event.stopPropagation();
          if (item.disabledReason) return;
          favorites = pinned ? favorites.filter(id => id !== item.id) : [...favorites, item.id];
          if (!favorites.length) favorites = [item.id];
          save();
          paint();
        };
        row.append(button, pin);
        block.append(row);
      }
      menu.append(block);
    }
  }
  more.onclick = () => { if (open) closeMenu(true); else openMenu(); };
  const onPointer = event => { if (open && !root.contains(event.target)) closeMenu(false); };
  const onKey = event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
  };
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('keydown', onKey);
  paint();
  return {
    sync(frequency) { if (frequency && frequency !== current) { current = frequency; paint(); } },
    destroy() {
      doc.removeEventListener('pointerdown', onPointer, true);
      doc.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
