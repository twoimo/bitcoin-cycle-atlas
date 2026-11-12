// Q-P2A0-1: adapt the isolated, pinned 0.6.16 widget's real controls. The
// package owns search, selection and closing; this module owns keyboard
// activation and focus. It never creates a substitute dialog or changes data.
const SEARCH = '.fnc-search-dialog';
const SYMBOL = 'button.fnc-symbol';
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';

function available(node) {
  return Boolean(node?.isConnected && !node.disabled && node.getAttribute('aria-disabled') !== 'true' &&
    !node.closest('[hidden], [inert]') &&
    node.checkVisibility({checkOpacity:true, checkVisibilityCSS:true}) && node.getClientRects().length);
}
function tabStops(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE)].filter(node => node.tabIndex >= 0 && available(node))
    .map((node, order) => ({node, order, rank:node.tabIndex > 0 ? node.tabIndex : Infinity}))
    .sort((a, b) => a.rank - b.rank || a.order - b.order).map(item => item.node);
}

export function mountFunnestAccessibility(mount) {
  const doc = mount?.ownerDocument, win = doc?.defaultView;
  if (!doc || !win?.MutationObserver) throw new TypeError('A mounted browser document is required');
  let disposed = false, dialog = null, opener = null, lastInside = null, spaceButton = null, fallback = null;

  function releaseFallback(node) {
    if (fallback === node) { node.removeAttribute('tabindex'); fallback = null; }
  }
  function focusDialog({initial=false}={}) {
    if (!dialog?.isConnected) return;
    const stops = tabStops(dialog);
    const input = dialog.querySelector('[role="combobox"]');
    const target = !initial && stops.includes(lastInside) ? lastInside :
      stops.includes(input) ? input : stops[0];
    if (target) target.focus();
    else {
      if (!dialog.hasAttribute('tabindex')) { dialog.setAttribute('tabindex', '-1'); fallback = dialog; }
      dialog.focus();
    }
  }
  function reconcile() {
    if (disposed) return;
    const next = mount.querySelector(SEARCH);
    if (next === dialog) return;
    const previous = dialog;
    if (previous) releaseFallback(previous);
    dialog = next; lastInside = null; spaceButton = null;
    if (next) {
      if (!opener) opener = mount.contains(doc.activeElement) && available(doc.activeElement)
        ? doc.activeElement : mount.querySelector(SYMBOL);
      if (!next.contains(doc.activeElement)) focusDialog({initial:true});
    } else if (previous) {
      // Restore only after the package really unmounts its dialog, including
      // Escape, its close button, backdrop dismissal and symbol selection.
      const target = available(opener) ? opener : mount.querySelector(SYMBOL);
      opener = null;
      if (available(target)) target.focus();
    }
  }
  function onClick(event) {
    const trigger = event.target?.closest?.(SYMBOL);
    if (!dialog && mount.contains(trigger) && available(trigger)) opener = trigger;
  }
  function onFocus(event) {
    if (!dialog?.isConnected) return;
    if (dialog.contains(event.target)) lastInside = event.target;
    else focusDialog();
  }
  function nativeButton(event) {
    const button = event.target?.closest?.('button');
    if (!button || !mount.contains(button) || !button.contains(doc.activeElement) || !available(button)) return null;
    return button.matches(SYMBOL) || dialog?.contains(button) ? button : null;
  }
  const modified = event => event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.keyCode === 229;
  function onKeyDown(event) {
    if (disposed || event.defaultPrevented || modified(event)) { spaceButton = null; return; }
    // Read the current DOM in case this key arrives before a mutation callback.
    reconcile();
    if (event.key === 'Tab' && dialog) {
      spaceButton = null;
      const stops = tabStops(dialog), at = stops.indexOf(doc.activeElement);
      if (!stops.length) { event.preventDefault(); focusDialog(); }
      else if (at < 0 || event.shiftKey && at === 0 || !event.shiftKey && at === stops.length - 1) {
        event.preventDefault(); (event.shiftKey ? stops.at(-1) : stops[0]).focus();
      }
      return;
    }
    const button = nativeButton(event);
    if (!button || !['Enter', ' '].includes(event.key)) { spaceButton = null; return; }
    // 0.6.16's symbol button has only onClick. Explicit keyboard activation
    // also works for keydown/keyup input without a separate character event.
    // Stop the search dialog's broad Enter handler from selecting a result
    // when a close/category/favorite button, rather than the combobox, owns it.
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Enter') {
      spaceButton = null;
      if (!event.repeat) button.click();
    } else if (!event.repeat) spaceButton = button;
  }
  function onKeyUp(event) {
    if (event.key !== ' ') return;
    const pressed = spaceButton; spaceButton = null;
    if (!pressed || disposed || event.defaultPrevented || modified(event)) return;
    event.preventDefault(); event.stopPropagation();
    if (nativeButton(event) === pressed) pressed.click();
  }
  const cancelSpace = () => { spaceButton = null; };
  const observer = new win.MutationObserver(reconcile);
  observer.observe(mount, {childList:true, subtree:true});
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('keyup', onKeyUp, true);
  win.addEventListener('blur', cancelSpace);
  reconcile();
  return {destroy() {
    if (disposed) return;
    disposed = true; observer.disconnect();
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('keyup', onKeyUp, true);
    win.removeEventListener('blur', cancelSpace);
    if (dialog) releaseFallback(dialog);
    dialog = opener = lastInside = spaceButton = null;
  }};
}
