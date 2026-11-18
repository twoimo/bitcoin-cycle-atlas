const PICKER_TEXT = {
  '1m': { chip: '1분', tip: '1분', short: '1분' },
  '5m': { chip: '5분', tip: '5분', short: '5분' },
  '15m': { chip: '15분', tip: '15분', short: '15분' },
  '30m': { chip: '30분', tip: '30분', short: '30분' },
  '1h': { chip: '1시간', tip: '1시간', short: '1시간' },
  '4h': { chip: '4시간', tip: '4시간', short: '4시간' },
  daily: { chip: '일', tip: '1일', short: '일' },
  weekly: { chip: '주', tip: '1주', short: '주' },
};
const PINNED = ['1m', '5m', '15m', '1h', '4h', 'daily'];

export function intervalShortLabel(id) {
  return PICKER_TEXT[id]?.short || id;
}

/** The visible chip row is the intervals this chart can actually load.
 *  Anything else this chart supports stays in the overflow menu. */
export function mountIntervalPicker({ host, intervals, selected = 'daily', onSelect, datasetKey = null, document = host?.ownerDocument }) {
  const labelFor = interval => PICKER_TEXT[interval.id] || { chip: interval.label, tip: interval.label, short: interval.label };
  const known = intervals.filter(interval => PICKER_TEXT[interval.id]);
  const pinned = known.filter(interval => PINNED.includes(interval.id));
  const overflow = known.filter(interval => !PINNED.includes(interval.id));
  host.classList.add('interval-picker');
  if (!host.getAttribute('aria-label')) host.setAttribute('aria-label', '가격 표시 간격');
  let chips = host.querySelector('.lab-segmented');
  if (!chips) { chips = document.createElement('div'); chips.className = 'lab-segmented'; host.append(chips); }
  chips.classList.add('interval-chips');
  chips.replaceChildren();
  const buttons = [];
  const addButton = (interval, className, menu) => {
    const text = labelFor(interval);
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className;
    node.dataset.labFrequency = interval.id;
    if (datasetKey) node.dataset[datasetKey] = interval.id;
    node.id = `workbench-interval-${interval.id}`;
    node.textContent = text.chip;
    node.title = text.tip;
    node.setAttribute('aria-label', text.tip);
    node.setAttribute('aria-pressed', String(interval.id === selected));
    node.tabIndex = interval.id === selected ? 0 : -1;
    if (menu) node.setAttribute('role', 'menuitemradio');
    node.onclick = () => { close(menu); onSelect?.(interval.id); };
    buttons.push(node);
    return node;
  };
  for (const interval of pinned) chips.append(addButton(interval, 'interval-chip', false));
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'interval-more';
  more.setAttribute('aria-label', '시간 단위 더보기');
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', 'interval-more-panel');
  const current = document.createElement('b');
  current.className = 'interval-current';
  current.textContent = intervalShortLabel(selected);
  current.hidden = pinned.some(interval => interval.id === selected);
  more.append(current);
  more.insertAdjacentHTML('beforeend', '<svg class="interval-chevron" width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>');
  const panel = document.createElement('div');
  panel.id = 'interval-more-panel';
  panel.className = 'interval-more-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', '시간 단위');
  for (const interval of overflow) panel.append(addButton(interval, 'interval-more-item', true));
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
  panel.addEventListener('click', () => close());
  const onPointer = event => { if (!panel.hidden && !panel.contains(event.target) && !more.contains(event.target)) close(); };
  const onKey = event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); } };
  const onState = event => {
    const id = event.detail?.frequency;
    if (!id || !PICKER_TEXT[id] || !known.some(interval => interval.id === id)) return;
    current.textContent = intervalShortLabel(id);
    const onChip = pinned.some(interval => interval.id === id);
    current.hidden = onChip;
    more.classList.toggle('is-overflow', !onChip);
  };
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey);
  document.addEventListener('atlas:workbench-state', onState);
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
      panel.remove();
    },
  };
}
