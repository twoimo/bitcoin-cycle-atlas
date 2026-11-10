// The dashboard composition (evidence, data, ipo, relay, market) already owns
// the shell's top header and left rail. This module gives those routes the same
// right and bottom regions the price chart has, using the nodes that already
// carry that information: the service navigation moves into the right rail and
// the page footer, with its source links and its info-sheet opener, becomes the
// bottom bar. Nothing is cloned, so ids, listeners, dialogs and data owners stay
// with their original element, and the chart frame keeps its own regions.
export const CONTENT_SHELL_PAGES = Object.freeze(['evidence', 'data', 'ipo', 'relay', 'market']);

export function createContentShell({ document }) {
  let rail = null, bottom = null, nav = null, footer = null;
  let navHome = null, navNext = null, footerHome = null, footerNext = null;
  let active = false;

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
    workspace.append(rail, bottom);
    return true;
  }

  function place() {
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
  }

  function restore() {
    if (footer && footerHome && footer.parentElement !== footerHome) footerHome.insertBefore(footer, footerNext);
    if (nav && navHome && nav.parentElement !== navHome) navHome.insertBefore(nav, navNext);
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
  };
}
