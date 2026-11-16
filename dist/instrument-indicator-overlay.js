// Native ETH and equity charts keep the BTC chart's top-left indicator surface.
// The legend lists only the studies that chart actually draws, and the owning
// view supplies every value on each render so nothing is invented or stale.
const EYE = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
const HIDDEN = '<path d="m3 3 18 18M10 5a12 12 0 0 1 2 0c6.5 0 10 7 10 7a20 20 0 0 1-3 4M6 6a20 20 0 0 0-4 6s3.5 7 10 7a12 12 0 0 0 5-1"/>';
const FOLD = '<path d="m7 10 5 5 5-5"/>';
const UNFOLD = '<path d="m7 14 5-5 5 5"/>';
const glyph = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

/** Mount the indicator legend used above native ETH and equity price charts. */
export function mountInstrumentIndicatorOverlay({plot, anchor, context, items, onToggle, onGeometryChange}) {
  const doc = plot.ownerDocument;
  const manager = doc.createElement('section');
  manager.id = 'chart-indicator-manager';
  manager.className = 'chart-indicator-manager indicator-legend instrument-indicator-manager';
  manager.setAttribute('aria-label', '추가한 인디케이터');
  manager.dataset.instrumentIndicator = 'true';
  manager.dataset.collapsed = 'false';
  const readoutDate = doc.createElement('p');
  readoutDate.id = 'indicator-readout-date';
  readoutDate.className = 'indicator-readout-date';
  readoutDate.textContent = typeof context === 'function' ? context() : String(context || '');
  manager.setAttribute('aria-describedby', readoutDate.id);
  const list = doc.createElement('div');
  list.id = 'chart-indicator-list';
  list.className = 'chart-indicator-list';
  list.setAttribute('role', 'list');
  const fold = doc.createElement('button');
  fold.type = 'button';
  fold.id = 'indicator-legend-toggle';
  fold.className = 'indicator-legend-toggle';
  fold.setAttribute('aria-controls', list.id);
  fold.setAttribute('aria-expanded', 'true');
  fold.setAttribute('aria-label', '지표 목록 접기');
  fold.innerHTML = glyph(UNFOLD);
  fold.onclick = () => {
    const collapsed = manager.dataset.collapsed === 'true';
    manager.dataset.collapsed = String(!collapsed);
    fold.setAttribute('aria-expanded', String(collapsed));
    fold.setAttribute('aria-label', collapsed ? '지표 목록 접기' : '지표 목록 펼치기');
    fold.innerHTML = glyph(collapsed ? UNFOLD : FOLD);
  };
  manager.append(readoutDate, list, fold);
  // Phones fold the legend so it cannot cover the chart legend chip or the
  // first candles; the chevron expands it on demand.
  if (doc.defaultView.matchMedia?.('(max-width:620px)')?.matches) {
    manager.dataset.collapsed = 'true';
    fold.setAttribute('aria-expanded', 'false');
    fold.setAttribute('aria-label', '지표 목록 펼치기');
    fold.innerHTML = glyph(FOLD);
  }

  const rows = new Map();
  for (const item of items) {
    const row = doc.createElement('div');
    row.className = 'indicator-row';
    row.dataset.indicatorRow = item.id;
    row.dataset.visible = 'true';
    row.dataset.unavailable = 'false';
    row.setAttribute('role', 'listitem');
    const name = doc.createElement('div');
    name.className = 'indicator-name';
    const label = doc.createElement('span');
    label.className = 'indicator-label';
    label.textContent = item.label;
    label.title = item.title || item.label;
    const value = doc.createElement('strong');
    value.className = 'indicator-value';
    value.dataset.tone = 'muted';
    value.textContent = '—';
    name.append(label, value);
    const toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'indicator-row-action';
    toggle.dataset.indicatorAction = 'visibility';
    toggle.setAttribute('aria-pressed', 'true');
    toggle.title = `${item.title || item.label} 표시`;
    toggle.setAttribute('aria-label', toggle.title);
    toggle.innerHTML = glyph(EYE);
    toggle.onclick = () => onToggle(item.id, row.dataset.visible !== 'true');
    row.append(name, toggle);
    list.append(row);
    rows.set(item.id, {row, value, toggle, title: item.title || item.label});
  }
  plot.append(manager);

  // The legend sits directly under the visible readout, matching the BTC
  // stack, and follows readout wraps without overlapping the price plot.
  let frame = 0, lastGeometry = '';
  function place() {
    frame = 0;
    const box = plot.getBoundingClientRect();
    const target = typeof anchor === 'function' ? anchor() : anchor;
    const targetBox = target && target.getClientRects().length > 0 ? target.getBoundingClientRect() : null;
    const top = targetBox ? Math.max(0, Math.round(targetBox.bottom - box.top + 6)) : 8;
    manager.style.setProperty('--indicator-top', `${top}px`);
    manager.style.top = `${top}px`;
    plot.style.setProperty('--plot-height', String(plot.clientHeight));
    const key = `${top}:${manager.offsetHeight}:${manager.dataset.collapsed}`;
    if (lastGeometry && key !== lastGeometry) onGeometryChange?.();
    lastGeometry = key;
  }

  /** Height the price plot must clear so the legend never covers a candle row. */
  function reserveHeight() {
    if (manager.hidden) return 0;
    const plotBox = plot.getBoundingClientRect();
    const target = typeof anchor === 'function' ? anchor() : anchor;
    const targetBox = target && target.getClientRects().length > 0 ? target.getBoundingClientRect() : null;
    const top = targetBox ? Math.max(0, Math.round(targetBox.bottom - plotBox.top + 6)) : 8;
    const collapsed = manager.dataset.collapsed === 'true';
    const height = manager.offsetHeight > 0 ? manager.offsetHeight : (collapsed ? 24 : rows.size * 22 + 18);
    return Math.round(top + height + 8);
  }
  function schedulePlace() {
    if (!frame) frame = requestAnimationFrame(place);
  }
  const observer = new ResizeObserver(schedulePlace);
  observer.observe(plot);
  const anchorNode = typeof anchor === 'function' ? anchor() : anchor;
  if (anchorNode) observer.observe(anchorNode);
  schedulePlace();

  function update(values = []) {
    const byId = new Map(values.map(item => [item.id, item]));
    for (const [id, entry] of rows) {
      const next = byId.get(id);
      const visible = next ? next.visible !== false : false;
      entry.row.dataset.visible = String(visible);
      entry.row.dataset.unavailable = String(next?.unavailable === true);
      entry.value.textContent = next?.value || '—';
      entry.value.dataset.tone = next?.tone || (visible ? 'default' : 'muted');
      entry.toggle.setAttribute('aria-pressed', String(visible));
      entry.toggle.title = `${entry.title} ${visible ? '숨기기' : '표시'}`;
      entry.toggle.setAttribute('aria-label', entry.toggle.title);
      entry.toggle.innerHTML = glyph(visible ? EYE : HIDDEN);
    }
    readoutDate.textContent = typeof context === 'function' ? context() : String(context || '');
    manager.hidden = values.length === 0;
    schedulePlace();
  }

  function destroy() {
    observer.disconnect();
    manager.remove();
  }

  return {update, destroy, reserveHeight, element: manager};
}
