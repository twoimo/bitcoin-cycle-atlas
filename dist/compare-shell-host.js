// Keeps the compare route inside the price chart frame without letting the
// frame's price-only controls act on a chart the route does not show.
//
// Everything here moves and restores the existing nodes. Nothing is cloned, so
// ids, handlers, FSM state and data owners stay with their original element.
const DISABLED_REASON = '가격 차트 전용 도구 · 사이클 비교에서는 사용할 수 없습니다';
const PRICE_CONTROL_SELECTOR = '.workbench-tools button, .workbench-bottom-bar :is(button,select):not(#atlas-update-status)';

export function createCompareShellHost({document}) {
  let section = null, toolbar = null;
  let sectionHome = null, sectionNext = null, toolbarHome = null, toolbarNext = null;
  const priorDisabled = new Map();
  const described = new Set();
  let active = false;

  function resolve() {
    if (section) return true;
    section = document.querySelector('#compare-view');
    if (!section) return false;
    sectionHome = section.parentElement;
    sectionNext = section.nextElementSibling;
    toolbar = section.querySelector('.lab-toolbar');
    if (toolbar) { toolbarHome = toolbar.parentElement; toolbarNext = toolbar.nextElementSibling; }
    return true;
  }

  function priceControls() {
    return [...document.querySelectorAll(PRICE_CONTROL_SELECTOR)];
  }

  function lockPriceControls() {
    for (const control of priceControls()) {
      if (!priorDisabled.has(control)) {
        // Both native and ARIA disabled states are the control's own; a control
        // may start enabled, natively disabled, or aria-disabled true/false and
        // must return to exactly that state.
        priorDisabled.set(control, {
          disabled: control.disabled === true,
          ariaDisabled: control.hasAttribute('aria-disabled') ? control.getAttribute('aria-disabled') : null,
        });
      }
      control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      if (!control.hasAttribute('aria-description') && !control.hasAttribute('data-disabled-reason')) {
        control.setAttribute('data-disabled-reason', DISABLED_REASON);
        described.add(control);
      }
    }
  }

  function releasePriceControls() {
    for (const [control, previous] of priorDisabled) {
      if (!control.isConnected) continue;
      control.disabled = previous.disabled;
      if (previous.ariaDisabled === null) control.removeAttribute('aria-disabled');
      else control.setAttribute('aria-disabled', previous.ariaDisabled);
      if (described.has(control)) control.removeAttribute('data-disabled-reason');
    }
    priorDisabled.clear();
    described.clear();
  }

  function setActive(next) {
    const value = Boolean(next);
    // No early return on a repeated state: the chart frame is created
    // asynchronously, so a later identical call is what actually hosts the
    // nodes. Every step below is idempotent through its parent check.
    active = value;
    // An embedded child renders this route on its own; nesting the outer shell
    // or hiding the authored section there would break the host document.
    if (document.body?.dataset.embedded === 'true') return;
    if (!resolve()) return;
    const heading = document.querySelector('.atlas-canvas-heading');
    const plot = document.querySelector('.atlas-plot');
    if (value) {
      if (plot && section.parentElement !== plot) plot.append(section);
      if (toolbar && heading && toolbar.parentElement !== heading) heading.append(toolbar);
      lockPriceControls();
      return;
    }
    releasePriceControls();
    if (toolbar && toolbar.parentElement !== toolbarHome) toolbarHome.insertBefore(toolbar, toolbarNext);
    if (section.parentElement !== sectionHome) sectionHome.insertBefore(section, sectionNext);
  }

  return {
    setActive,
    isActive: () => active,
    get section() { return section; },
    get toolbar() { return toolbar; },
    get lockedControls() { return [...priorDisabled.keys()]; },
  };
}
