// Page context belongs to the outer shell, independently of the selected
// instrument's quote, source clocks and toolbar controls.
export const ATLAS_PAGE_DESCRIPTIONS = Object.freeze({
  outlook: Object.freeze({id:'outlook', title:'가격 차트', description:'실제 일별 종가와 미래 가정을 구분해 보여줍니다. 기준: 거래소 완료 봉(UTC) · 종목별 표시.'}),
  market: Object.freeze({id:'market', title:'시장 분석', description:'미국·국내 지수를 알파·베타·감마로 나눠 시장을 판단합니다. 기준: 지표별 관측일.'}),
  evidence: Object.freeze({id:'evidence', title:'리서치', description:'근거 자료와 출처를 모아 봅니다. 기준: 발행·검토일.'}),
  data: Object.freeze({id:'data', title:'자산 비교', description:'자산별 가격 변화와 판단을 한 표에서 비교합니다. 기준: 자산별 관측일.'}),
  ipo: Object.freeze({id:'ipo', title:'공모주', description:'수요예측·청약·상장 일정을 달력으로 봅니다. 기준: 한국 날짜.'}),
  relay: Object.freeze({id:'relay', title:'릴레이 콘텐츠', description:'수집한 글과 기사를 원문 시각 순으로 봅니다. 기준: 원문·수집 시각.'}),
  compare: Object.freeze({id:'compare', title:'사이클 비교', description:'반감일 이후 경과일을 기준으로 과거 사이클과 현재 사이클을 겹쳐 비교합니다. 기준: 일별 종가(UTC).'}),
});

export function atlasPageDescription(page) {
  const id = typeof page === 'string' ? page : page?.id;
  if (['market-us','market-kr','scenario','cashflow'].includes(id)) return ATLAS_PAGE_DESCRIPTIONS.market;
  if (['rsi','housing','themes'].includes(id)) return ATLAS_PAGE_DESCRIPTIONS.outlook;
  return ATLAS_PAGE_DESCRIPTIONS[id] || ATLAS_PAGE_DESCRIPTIONS.outlook;
}

export function mountPageDescription(document, {header, heading} = {}) {
  const embedded = document.body.dataset.embedded === 'true' || new URLSearchParams(document.defaultView?.location?.search || '').get('embedded') === '1';
  if (embedded || !header || !heading) return {sync() {}, destroy() {}};
  const copy = document.createElement('div');
  const description = document.createElement('p');
  description.id = 'atlas-page-description';
  description.className = 'atlas-page-description';
  heading.id = 'atlas-page-heading';
  heading.setAttribute('aria-describedby', description.id);
  copy.append(heading, description);
  header.append(copy);
  let destroyed = false, lastToolbar = null, lastAnchor = null, frame = null;
  const view = document.defaultView;
  const Resize = view?.ResizeObserver || globalThis.ResizeObserver;
  const resize = Resize ? new Resize(schedulePlace) : null;
  // The H1 remains a sibling of the toolbar. Its paint follows existing chrome,
  // never the quote/legend/price axis and never a new row in the chart layout.
  function place() {
    frame = null;
    if (destroyed || copy.className !== 'atlas-page-intro' || !lastAnchor) return;
    const box = lastAnchor.getBoundingClientRect?.();
    if (!box?.width || !box.height) return;
    const comparison = copy.dataset.headingPlacement === 'compare';
    const left = comparison ? box.left - 76 : box.left + 4;
    const top = comparison ? box.top + (box.height - 14) / 2 : box.top + 2;
    const width = comparison ? 68 : Math.max(0, box.width - 8);
    for (const [name, value] of Object.entries({left, top, width})) {
      const next = `${value}px`;
      if (copy.style[name] !== next) copy.style[name] = next;
    }
    // A fixed caption must respect its toolbar's horizontal scroll clipping.
    const toolbarBox = lastAnchor.closest?.('.atlas-canvas-heading')?.getBoundingClientRect?.();
    if (toolbarBox?.width) {
      const clipLeft = Math.max(0, toolbarBox.left - left);
      const clipRight = Math.max(0, left + width - toolbarBox.right);
      copy.style.clipPath = clipLeft || clipRight ? `inset(0 ${clipRight}px 0 ${clipLeft}px)` : 'none';
    }
  }
  function schedulePlace() {
    if (destroyed || frame !== null) return;
    if (view?.requestAnimationFrame) frame = view.requestAnimationFrame(place);
    else place();
  }
  function anchorTo(toolbar, comparison) {
    const anchor = toolbar?.querySelector(comparison ? '.lab-toolbar' : '.symbol-selector-trigger') || null;
    const placement = comparison ? 'compare' : 'symbol';
    if (copy.dataset.headingPlacement !== placement) copy.dataset.headingPlacement = placement;
    if (anchor !== lastAnchor || toolbar !== lastToolbar) {
      resize?.disconnect();
      if (toolbar) resize?.observe(toolbar);
      if (anchor) resize?.observe(anchor);
      lastAnchor = anchor;
    }
    place();
  }
  function sync() {
    if (destroyed) return;
    const page = document.body.dataset.page || 'outlook';
    // compare renders inside the price chart frame and owns the same single H1.
    const chart = page === 'outlook' || page === 'compare';
    const info = atlasPageDescription(page === 'outlook' ? document.body.dataset.centerTool || page : page);
    if (heading.textContent !== info.title) heading.textContent = info.title;
    if (description.textContent !== info.description) description.textContent = info.description;
    if (copy.dataset.pageIntro !== info.id) copy.dataset.pageIntro = info.id;
    const toolbar = chart ? document.querySelector('.atlas-canvas-heading') : null;
    if (toolbar) {
      copy.className = 'atlas-page-intro';
      copy.hidden = false;
      if (toolbar.nextElementSibling !== copy) toolbar.after(copy);
      anchorTo(toolbar, page === 'compare');
    } else {
      copy.className = 'atlas-shell-copy';
      copy.hidden = chart;
      if (copy.parentElement !== header) header.append(copy);
      resize?.disconnect();
      lastAnchor = null;
      delete copy.dataset.headingPlacement;
      copy.removeAttribute('style');
    }
    lastToolbar = toolbar;
  }
  // BTC construction and native ETH/equity replacement can finish after shell
  // setup. Only toolbar insertion/removal matters here; quote/chart mutations
  // must not rewrite the page header or disturb its current focus owners.
  const workspace = document.querySelector('.workspace');
  const Observer = document.defaultView?.MutationObserver || globalThis.MutationObserver;
  // Replay rewrites chart internals on every frame. One deferred identity check
  // per mutation batch replaces a per-node subtree query, and the header is only
  // rewritten when the toolbar owner actually appears or disappears.
  let queued = false;
  const observer = workspace && Observer ? new Observer(() => {
    if (queued) return;
    queued = true;
    const check = () => {
      queued = false;
      const toolbar = document.querySelector('.atlas-canvas-heading');
      const anchor = toolbar?.querySelector(copy.dataset.headingPlacement === 'compare' ? '.lab-toolbar' : '.symbol-selector-trigger') || null;
      if (toolbar !== lastToolbar || copy.className === 'atlas-page-intro' && anchor !== lastAnchor) sync();
    };
    const microtask = document.defaultView?.queueMicrotask || globalThis.queueMicrotask;
    if (microtask) microtask(check); else check();
  }) : null;
  observer?.observe(workspace, {childList:true, subtree:true});
  view?.addEventListener?.('resize', schedulePlace);
  document.addEventListener('scroll', schedulePlace, true);
  sync();
  return {sync, destroy() {
    destroyed = true;
    observer?.disconnect();
    resize?.disconnect();
    if (frame !== null) view?.cancelAnimationFrame?.(frame);
    frame = null;
    view?.removeEventListener?.('resize', schedulePlace);
    document.removeEventListener('scroll', schedulePlace, true);
    copy.remove();
  }};
}
