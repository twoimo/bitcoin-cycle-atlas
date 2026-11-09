// Page context belongs to the outer shell, independently of the selected
// instrument's quote, source clocks and toolbar controls.
export const ATLAS_PAGE_DESCRIPTIONS = Object.freeze({
  outlook: Object.freeze({id:'outlook', title:'가격 차트', description:'가격·지표를 함께 봅니다. 기준·시각은 종목별 표시.'}),
  market: Object.freeze({id:'market', title:'시장 분석', description:'미국·국내 시장을 봅니다. 기준: 지표별 관측일.'}),
  evidence: Object.freeze({id:'evidence', title:'리서치', description:'근거 자료와 출처를 봅니다. 기준: 발행·검토일.'}),
  data: Object.freeze({id:'data', title:'자산 비교', description:'가격 변화와 판단을 비교합니다. 기준: 자산별 관측일.'}),
  ipo: Object.freeze({id:'ipo', title:'공모주', description:'수요예측·청약 일정입니다. 기준: 한국 날짜.'}),
  relay: Object.freeze({id:'relay', title:'릴레이 콘텐츠', description:'수집한 글·기사를 봅니다. 기준: 원문·수집 시각.'}),
  compare: Object.freeze({id:'compare', title:'사이클 비교', description:'반감일 등으로 사이클을 비교합니다. 기준: 일별 종가(UTC).'}),
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
  let destroyed = false;
  function sync() {
    if (destroyed) return;
    const page = document.body.dataset.page || 'outlook';
    const chart = page === 'outlook';
    const info = atlasPageDescription(chart ? document.body.dataset.centerTool || page : page);
    if (heading.textContent !== info.title) heading.textContent = info.title;
    if (description.textContent !== info.description) description.textContent = info.description;
    if (copy.dataset.pageIntro !== info.id) copy.dataset.pageIntro = info.id;
    const toolbar = chart ? document.querySelector('.atlas-canvas-heading') : null;
    if (toolbar) {
      copy.className = 'atlas-page-intro';
      copy.hidden = false;
      if (toolbar.nextElementSibling !== copy) toolbar.after(copy);
    } else {
      copy.className = 'atlas-shell-copy';
      copy.hidden = chart;
      if (copy.parentElement !== header) header.append(copy);
    }
  }
  // BTC construction and native ETH/equity replacement can finish after shell
  // setup. Only toolbar insertion/removal matters here; quote/chart mutations
  // must not rewrite the page header or disturb its current focus owners.
  const workspace = document.querySelector('.workspace');
  const Observer = document.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = workspace && Observer ? new Observer(records => {
    const containsToolbar = node => node.nodeType === 1 && (node.matches('.atlas-canvas-heading') || node.querySelector('.atlas-canvas-heading'));
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(containsToolbar))) sync();
  }) : null;
  observer?.observe(workspace, {childList:true, subtree:true});
  sync();
  return {sync, destroy() {destroyed = true; observer?.disconnect(); copy.remove();}};
}
