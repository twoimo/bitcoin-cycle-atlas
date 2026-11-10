// The dashboard composition (evidence, data, ipo, relay, market) already owns
// the shell's top header and left rail. This module gives those routes the same
// right and bottom regions the price chart has, using the nodes that already
// carry that information: the service navigation moves into the right rail and
// the page footer, with its source links and its info-sheet opener, becomes the
// bottom bar. Nothing is cloned, so ids, listeners, dialogs and data owners stay
// with their original element, and the chart frame keeps its own regions.
export const CONTENT_SHELL_PAGES = Object.freeze(['evidence', 'data', 'ipo', 'relay', 'market']);

// The source sheet is rendered from the price dataset, which these routes do
// not load. The control keeps its node and its listener and is disabled with
// the exact reason instead of opening an empty dialog.
export const SOURCE_SHEET_REASON = '가격 자료가 없어 방법론 시트를 열 수 없습니다. 가격 차트에서 자료를 불러온 뒤 사용할 수 있습니다.';

export function createContentShell({ document }) {
  let rail = null, bottom = null, nav = null, footer = null;
  let navHome = null, navNext = null, footerHome = null, footerNext = null;
  let active = false;
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

  function place() {
    mount();
    nav = nav || document.querySelector('.atlas-nav');
    if (nav) {
      if (navHome === null) { navHome = nav.parentElement; navNext = nav.nextElementSibling; }
      if (nav.parentElement !== rail) rail.prepend(nav);
    }
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
