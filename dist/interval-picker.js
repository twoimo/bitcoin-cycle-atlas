const PICKER_TEXT = {
  '1m': { chip: '1m', tip: '1m', short: '1m' },
  '5m': { chip: '5m', tip: '5m', short: '5m' },
  '15m': { chip: '15m', tip: '15m', short: '15m' },
  '30m': { chip: '30m', tip: '30m', short: '30m' },
  '1h': { chip: '1h', tip: '1h', short: '1h' },
  '4h': { chip: '4h', tip: '4h', short: '4h' },
  daily: { chip: 'D', tip: 'D', short: 'D' },
  weekly: { chip: 'W', tip: 'W', short: 'W' },
};
const DESKTOP_PINNED = ['1m', '5m', '15m', '1h', '4h', 'daily', 'weekly'];
const COMPACT_PINNED = ['15m', '1h', '4h', 'daily'];
const COMPACT_QUERY = '(max-width: 1024px)';

export function intervalShortLabel(id) {
  return PICKER_TEXT[id]?.short || id;
}

/** The visible chip row is the intervals this chart can actually load.
 *  Anything else this chart supports stays in the overflow menu. */
export function mountIntervalPicker({ host, intervals, selected = 'daily', onSelect, datasetKey = null, document = host?.ownerDocument }) {
  const labelFor = interval => PICKER_TEXT[interval.id] || { chip: interval.label, tip: interval.label, short: interval.label };
  const known = intervals.filter(interval => PICKER_TEXT[interval.id]);
  const view = document.defaultView;
  const media = view?.matchMedia?.(COMPACT_QUERY);
  host.classList.add('interval-picker');
  if (!host.getAttribute('aria-label')) host.setAttribute('aria-label', '가격 표시 간격');
  let chips = host.querySelector('.lab-segmented');
  if (!chips) { chips = document.createElement('div'); chips.className = 'lab-segmented'; host.append(chips); }
  chips.classList.add('interval-chips');
  chips.replaceChildren();
  const buttons = [];
  let currentId = known.some(interval => interval.id === selected) ? selected : known[0]?.id || '';
  const addButton = interval => {
    const text = labelFor(interval);
    const node = document.createElement('button');
    node.type = 'button';
    node.dataset.labFrequency = interval.id;
    if (datasetKey) node.dataset[datasetKey] = interval.id;
    node.id = `workbench-interval-${interval.id}`;
    node.textContent = text.chip;
    node.title = text.tip;
    node.setAttribute('aria-label', text.tip);
    node.setAttribute('aria-pressed', String(interval.id === currentId));
    node.tabIndex = interval.id === currentId ? 0 : -1;
    node.onclick = () => {
      currentId = interval.id;
      close(panel.contains(node));
      onSelect?.(interval.id);
    };
    buttons.push(node);
    return node;
  };
  for (const interval of known) addButton(interval);
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'interval-more';
  more.setAttribute('aria-label', '시간 단위 더보기');
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', 'interval-more-panel');
  const current = document.createElement('b');
  current.className = 'interval-current';
  current.textContent = intervalShortLabel(currentId);
  more.append(current);
  more.insertAdjacentHTML('beforeend', '<svg class="interval-chevron" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>');
  const panel = document.createElement('div');
  panel.id = 'interval-more-panel';
  panel.className = 'interval-more-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', '시간 단위');
  const phone = document.defaultView?.matchMedia?.('(max-width: 640px)');
  function pinnedIds() {
    const compact = Boolean(media?.matches);
    const allow = new Set(compact ? COMPACT_PINNED : DESKTOP_PINNED);
    return known.filter(interval => allow.has(interval.id)).map(interval => interval.id);
  }
  function place() {
    const pin = new Set(pinnedIds());
    chips.replaceChildren();
    panel.replaceChildren();
    for (const node of buttons) {
      const menu = !pin.has(node.dataset.labFrequency);
      node.className = menu ? 'interval-more-item' : 'interval-chip';
      if (menu) node.setAttribute('role', 'menuitemradio');
      else node.removeAttribute('role');
      (menu ? panel : chips).append(node);
    }
    const onChip = !phone?.matches && pin.has(currentId);
    current.textContent = intervalShortLabel(currentId);
    current.hidden = onChip;
    more.classList.toggle('is-overflow', !onChip);
    more.hidden = !phone?.matches && panel.childElementCount === 0;
  }
  function close(focus = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    if (focus) more.focus({ preventScroll: true });
  }
  function open() {
    if (panel.hidden === false) { close(true); return; }
    panel.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    const bounds = more.getBoundingClientRect?.() || { right: 8, bottom: 8 };
    const view = document.defaultView || globalThis;
    const panelWidth = 148;
    panel.style.left = `${Math.max(8, Math.min((view.innerWidth || 0) - panelWidth - 8, bounds.right - panelWidth))}px`;
    panel.style.top = `${Math.min((view.innerHeight || 0) - 16, bounds.bottom + 6)}px`;
    panel.querySelector('[aria-pressed="true"],button')?.focus?.({ preventScroll: true });
  }
  more.onclick = open;
  host.append(more);
  document.body.append(panel);
  place();
  panel.addEventListener('click', () => close());
  const onPointer = event => { if (!panel.hidden && !panel.contains(event.target) && !more.contains(event.target)) close(); };
  const onKey = event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); } };
  const onState = event => {
    const id = event.detail?.frequency;
    if (!id || !PICKER_TEXT[id] || !known.some(interval => interval.id === id)) return;
    currentId = id;
    const onChip = !phone?.matches && chips.contains(buttons.find(node => node.dataset.labFrequency === id));
    current.textContent = intervalShortLabel(id);
    current.hidden = onChip;
    more.classList.toggle('is-overflow', !onChip);
  };
  const onMedia = () => { close(); place(); };
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey);
  document.addEventListener('atlas:workbench-state', onState);
  media?.addEventListener?.('change', onMedia);
  phone?.addEventListener?.('change', onMedia);
  const select = document.createElement('select');
  select.id = 'workbench-interval-select';
  select.setAttribute('aria-label', '가격 표시 간격');
  for (const interval of known) {
    const option = document.createElement('option');
    option.value = interval.id;
    option.textContent = labelFor(interval).short;
    select.append(option);
  }
  select.value = known.some(interval => interval.id === selected) ? selected : known[0]?.id || '';
  select.onchange = () => onSelect?.(select.value);
  host.append(select);
  return {
    buttons,
    select,
    destroy() {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('atlas:workbench-state', onState);
      media?.removeEventListener?.('change', onMedia);
      phone?.removeEventListener?.('change', onMedia);
      panel.remove();
    },
  };
}
