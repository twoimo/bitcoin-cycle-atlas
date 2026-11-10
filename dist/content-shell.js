// The dashboard composition (evidence, data, ipo, relay, market) keeps the
// sidebar, header and inset content of the authored dashboard layout. Only the
// page footer moves, into a bottom region, so its source links and info-sheet
// opener stay reachable; on phone widths, where the sidebar is not rendered,
// the service navigation moves into a right icon rail instead of disappearing.
// Nothing is cloned, so ids, listeners, dialogs and data owners stay with their
// original element, and the chart frame keeps its own regions.
export const CONTENT_SHELL_PAGES = Object.freeze(['evidence', 'data', 'ipo', 'relay', 'market']);

// The source sheet is rendered from the price dataset, which these routes do
// not load. The control keeps its node and its listener and is disabled with
// the exact reason instead of opening an empty dialog.
export const SOURCE_SHEET_REASON = '가격 자료가 없어 방법론 시트를 열 수 없습니다. 가격 차트에서 자료를 불러온 뒤 사용할 수 있습니다.';

export function createContentShell({ document }) {
  let rail = null, bottom = null, nav = null, footer = null;
  let navHome = null, navNext = null, footerHome = null, footerNext = null;
  let active = false, media = null;
  const lockedSources = new Map();

  function build() {
    if (rail) return true;
    const workspace = document.querySelector('.workspace');
    if (!workspace) return false;
    rail = document.createElement('div');
    rail.className = 'workbench-rail content-rail';
    rail.id = 'content-rail';
    rail.dataset.shellRegion = 'right';
    rail.setAttribute('role', 'complementary');
    rail.setAttribute('aria-label', '주요 페이지와 자료');
    bottom = document.createElement('div');
    bottom.className = 'workbench-bottom-bar content-bottom-bar';
    bottom.id = 'content-bottom-bar';
    bottom.dataset.shellRegion = 'bottom';
    bottom.setAttribute('role', 'contentinfo');
    bottom.setAttribute('aria-label', '자료 출처와 이용 조건');
    return true;
  }

  // The regions exist only while a dashboard route owns them, so the price
  // chart's own `.workbench-rail` / `.workbench-bottom-bar` are the only ones
  // in the document once the chart frame is back.
  function mount() {
    const workspace = document.querySelector('.workspace');
    if (!workspace) return;
    if (rail.parentElement !== workspace) workspace.append(rail, bottom);
    rail.hidden = false; bottom.hidden = false;
  }

  function unmount() {
    rail.hidden = true; bottom.hidden = true;
    rail.remove(); bottom.remove();
  }

  function lockSources() {
    // The source sheet renders from the price dataset. When this document still
    // owns a mounted plot the sheet is ready, so the control keeps working.
    if (document.querySelector('.atlas-plot')) { unlockSources(); return; }
    for (const control of document.querySelectorAll('.footer [data-method], .content-bottom-bar [data-method]')) {
      if (!lockedSources.has(control)) {
        lockedSources.set(control, {
          disabled: control.disabled === true,
          ariaDisabled: control.hasAttribute('aria-disabled') ? control.getAttribute('aria-disabled') : null,
          reason: control.hasAttribute('data-disabled-reason') ? control.getAttribute('data-disabled-reason') : null,
          description: control.hasAttribute('aria-description') ? control.getAttribute('aria-description') : null,
        });
      }
      control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      if (!control.hasAttribute('data-disabled-reason')) control.setAttribute('data-disabled-reason', SOURCE_SHEET_REASON);
      if (!control.hasAttribute('aria-description')) control.setAttribute('aria-description', SOURCE_SHEET_REASON);
    }
  }

  function unlockSources() {
    for (const [control, prior] of lockedSources) {
      if (!control.isConnected) continue;
      control.disabled = prior.disabled;
      if (prior.ariaDisabled === null) control.removeAttribute('aria-disabled');
      else control.setAttribute('aria-disabled', prior.ariaDisabled);
      if (prior.reason === null) control.removeAttribute('data-disabled-reason');
      else control.setAttribute('data-disabled-reason', prior.reason);
      if (prior.description === null) control.removeAttribute('aria-description');
      else control.setAttribute('aria-description', prior.description);
    }
    lockedSources.clear();
  }

  // The authored dashboard keeps its navigation in the sidebar. The right icon
  // rail exists only for widths where that sidebar is not rendered, so the
  // navigation is never duplicated and never leaves a dead column behind.
  function sidebarOwnsNav() {
    const sidebar = document.querySelector('.atlas-sidebar');
    if (!sidebar) return false;
    const style = sidebar.ownerDocument?.defaultView?.getComputedStyle?.(sidebar);
    if (style && style.display === 'none') return false;
    return sidebar.getClientRects().length > 0;
  }

  function place() {
    mount();
    nav = nav || document.querySelector('.atlas-nav');
    if (nav) {
      if (navHome === null) { navHome = nav.parentElement; navNext = nav.nextElementSibling; }
      const host = sidebarOwnsNav() ? (navHome || document.querySelector('.atlas-sidebar')) : rail;
      if (host && nav.parentElement !== host) {
        if (host === rail) rail.prepend(nav); else host.append(nav);
      }
    }
    rail.hidden = !nav || nav.parentElement !== rail;
    footer = footer || document.querySelector('#main > .footer') || document.querySelector('.footer');
    if (footer) {
      if (footerHome === null) { footerHome = footer.parentElement; footerNext = footer.nextElementSibling; }
      if (footer.parentElement !== bottom) bottom.append(footer);
    }
    lockSources();
  }

  function restore() {
    unlockSources();
    if (footer && footerHome && footer.parentElement !== footerHome) footerHome.insertBefore(footer, footerNext);
    if (nav && navHome && nav.parentElement !== navHome) navHome.insertBefore(nav, navNext);
    if (rail) unmount();
  }

  function setActive(next) {
    const value = Boolean(next);
    if (document.body?.dataset.embedded === 'true') { active = false; return; }
    if (value) {
      if (!build()) return;
      place();
      active = true;
      if (!media) {
        media = document.defaultView?.matchMedia?.('(max-width: 640px)') || null;
        media?.addEventListener?.('change', () => { if (active) place(); });
      }
      return;
    }
    if (!active) return;
    active = false;
    restore();
  }

  return {
    setActive,
    isActive: () => active,
    get rail() { return rail; },
    get bottom() { return bottom; },
    get lockedSources() { return [...lockedSources.keys()]; },
  };
}
