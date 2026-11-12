// Dashboard pages reuse the original service navigation in the header's
// scrolling pill row. The fallback sidebar/rail still serves documents that
// have not mounted the dashboard header. The footer retains its bottom owner.
// Nothing is cloned, so ids, listeners, dialogs and data owners stay with their
// original element, and the chart frame keeps its own regions.
export const CONTENT_SHELL_PAGES = Object.freeze(['evidence', 'data', 'ipo', 'relay', 'market', 'conference']);

// The source sheet is rendered from the price dataset, which these routes do
// not load. The control keeps its node and its listener; while the price owner
// reports no comparison, the control is disabled with the exact reason instead
// of opening an empty dialog, and it is re-enabled as soon as that owner
// publishes readiness in this document.
export const SOURCE_SHEET_REASON = '가격 자료가 없어 방법론 시트를 열 수 없습니다. 가격 차트에서 자료를 불러온 뒤 사용할 수 있습니다.';
// The price owner publishes readiness on the body and in an event, so a shell
// that is already mounted and one that mounts later read the same answer.
export const SOURCE_READY_ATTRIBUTE = 'comparison';
export const SOURCE_READY_EVENT = 'atlas:comparison';

export function createContentShell({ document }) {
  let rail = null, bottom = null, nav = null, footer = null;
  let navHost = null, previousNav = null, nextNav = null, navResize = null;
  let navHome = null, navNext = null, footerHome = null, footerNext = null;
  let active = false, media = null, sourceListener = null;
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
    const header = document.querySelector('.atlas-dashboard-header');
    if (header) {
      navHost = document.createElement('div');
      navHost.className = 'atlas-dashboard-nav';
      for (const [direction, label, path] of [
        ['previous', '이전 페이지 메뉴 보기', 'm14 6-6 6 6 6'],
        ['next', '다음 페이지 메뉴 보기', 'm10 6 6 6-6 6'],
      ]) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'atlas-nav-scroll';
        button.dataset.shellNavScroll = direction;
        button.setAttribute('aria-label', label); button.title = label;
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${path}"/></svg>`;
        button.addEventListener('click', () => {
          nav?.scrollBy?.({left: (direction === 'previous' ? -1 : 1) * Math.max(132, nav.clientWidth * .75), behavior: 'instant'});
          updateNavigationScroll();
        });
        navHost.append(button);
        if (direction === 'previous') previousNav = button; else nextNav = button;
      }
      const Resize = document.defaultView?.ResizeObserver;
      navResize = Resize ? new Resize(updateNavigationScroll) : null;
    }
    return true;
  }

  function updateNavigationScroll() {
    if (!navHost || !nav || nav.parentElement !== navHost) return;
    const maximum = Math.max(0, nav.scrollWidth - nav.clientWidth);
    previousNav.hidden = nextNav.hidden = maximum === 0;
    previousNav.disabled = nav.scrollLeft <= 0;
    nextNav.disabled = nav.scrollLeft >= maximum - 1;
  }

  // The regions exist only while a dashboard route owns them, so the price
  // chart's own `.workbench-rail` / `.workbench-bottom-bar` are the only ones
  // in the document once the chart frame is back.
  function mount() {
    const workspace = document.querySelector('.workspace');
    if (!workspace) return;
    if (rail.parentElement !== workspace) workspace.append(rail, bottom);
    if (navHost && !navHost.isConnected) document.querySelector('.atlas-dashboard-header')?.append(navHost);
    // Visibility belongs to place() alone. Writing `hidden` here as well made
    // the two functions alternate the value, and the shell's mutation observer
    // re-entered sync() on every write.
  }

  function unmount() {
    rail.remove(); bottom.remove();
    navHost?.remove(); navResize?.disconnect();
    nav?.removeEventListener('scroll', updateNavigationScroll);
  }

  // These routes render the site footer, whose source control belongs to the
  // price document. The price owner publishes whether it can fill the sheet;
  // the lock follows that answer for this document instance, not the route.
  function sourcesReady() {
    return document.body?.dataset?.[SOURCE_READY_ATTRIBUTE] === 'ready';
  }

  function lockSources() {
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

  // Compatibility owner for documents without the shared dashboard header.
  // Its rail is used only while that document's sidebar is not rendered.
  function sidebarOwnsNav() {
    const sidebar = document.querySelector('.atlas-sidebar');
    if (!sidebar) return false;
    const style = sidebar.ownerDocument?.defaultView?.getComputedStyle?.(sidebar);
    if (style && style.display === 'none') return false;
    // Layout-less DOMs (tests, server rendering) carry no getClientRects; a
    // connected sidebar that is not display:none is still the authored owner.
    if (typeof sidebar.getClientRects !== 'function') return !sidebar.hidden;
    return sidebar.getClientRects().length > 0;
  }

  function place() {
    mount();
    nav = nav || document.querySelector('.atlas-nav');
    if (nav) {
      if (navHome === null) { navHome = nav.parentElement; navNext = nav.nextElementSibling; }
      // navHome records the chart's prior owner. A dashboard uses its header,
      // never that hidden chart rail; older documents keep their fallback host.
      const host = navHost || (sidebarOwnsNav() ? document.querySelector('.atlas-sidebar') : rail);
      if (host && nav.parentElement !== host) {
        const focused = nav.contains(document.activeElement) ? document.activeElement : null;
        if (host === navHost) host.insertBefore(nav, nextNav);
        else if (host === rail) rail.prepend(nav); else host.append(nav);
        focused?.focus?.({preventScroll: true});
      }
      if (navHost) {
        if (!nav.id) nav.id = 'atlas-primary-navigation';
        previousNav.setAttribute('aria-controls', nav.id);
        nextNav.setAttribute('aria-controls', nav.id);
        nav.addEventListener('scroll', updateNavigationScroll, {passive: true});
        navResize?.observe(nav); navResize?.observe(navHost);
        updateNavigationScroll();
      }
    }
    const hideRail = !nav || nav.parentElement !== rail;
    if (rail.hidden !== hideRail) rail.hidden = hideRail;
    footer = footer || document.querySelector('#main > .footer') || document.querySelector('.footer');
    if (footer) {
      if (footerHome === null) { footerHome = footer.parentElement; footerNext = footer.nextElementSibling; }
      if (footer.parentElement !== bottom) bottom.append(footer);
    }
    const hideBottom = !footer || footer.parentElement !== bottom;
    if (bottom.hidden !== hideBottom) bottom.hidden = hideBottom;
    if (sourcesReady()) unlockSources(); else lockSources();
  }

  function restore() {
    unlockSources();
    if (sourceListener) { document.removeEventListener?.(SOURCE_READY_EVENT, sourceListener); sourceListener = null; }
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
      if (!sourceListener) {
        sourceListener = () => { if (active) place(); };
        document.addEventListener?.(SOURCE_READY_EVENT, sourceListener);
      }
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
