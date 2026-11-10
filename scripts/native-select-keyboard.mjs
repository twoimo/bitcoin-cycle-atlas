// Native <select> keyboard acceptance for the Atlas browser harnesses.
//
// macOS Chromium keeps Blink's external (AppKit) popup menus enabled for a
// desktop-emulated target, so a *closed* dropdown hands its arrow keys to a
// native menu that headless cannot create: the trusted keydown/keyup reach the
// <select>, nothing changes the value and no input/change event is produced.
// The Linux CI baseline, and any mobile-emulated target, uses Blink's internal
// popup menu, where the same trusted key events move the selection and fire
// input + change (verified on a bare <select> and on #eth-model at 320px).
//
// This module runs the harness's own keystroke sequence inside that internal
// popup mode, proves the emulated desktop viewport rendered identically across
// the switch, and restores the case emulation afterwards. It never assigns
// .value, never dispatches synthetic events, and fails closed when the layout
// moves.

export const nativeSelectVirtualKeys = Object.freeze({
  ArrowDown: { windowsVirtualKeyCode: 40, darwin: 125 },
  ArrowUp: { windowsVirtualKeyCode: 38, darwin: 126 },
  Enter: { windowsVirtualKeyCode: 13, darwin: 36 },
  Home: { windowsVirtualKeyCode: 36, darwin: 115 },
  End: { windowsVirtualKeyCode: 35, darwin: 119 },
});

export function nativeSelectKeyEvent(name, type, platform = process.platform) {
  const keys = nativeSelectVirtualKeys[name];
  if (!keys) throw new Error('Unknown native select key: ' + name);
  return {
    type, key: name, code: name,
    windowsVirtualKeyCode: keys.windowsVirtualKeyCode,
    nativeVirtualKeyCode: platform === 'darwin' ? keys.darwin : keys.windowsVirtualKeyCode,
    ...(type === 'keyDown' && name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
  };
}

// Page-side readers, injected through each harness's own `evaluate` helper.
export function readNativeSelectTarget(selector, value) {
  const node = document.querySelector(selector);
  if (!node) return null;
  const options = [...node.options];
  // Arrow keys step through the options a user can actually reach, so disabled
  // and hidden options are not counted as keystrokes.
  const reachable = options.map((option, index) => (!option.disabled && !option.hidden ? index : -1)).filter(index => index >= 0);
  const target = options.findIndex(option => option.value === value && !option.disabled && !option.hidden);
  return {
    from: node.selectedIndex, to: target,
    fromPosition: reachable.indexOf(node.selectedIndex), toPosition: reachable.indexOf(target),
    selected: node.value, disabled: node.disabled, options: options.length, reachable: reachable.length,
  };
}

export function focusNativeSelect(selector) {
  const node = document.querySelector(selector);
  if (!node) return null;
  node.scrollIntoView({ block: 'center' });
  node.focus();
  return { focused: document.activeElement === node, disabled: node.disabled };
}

export function readNativeSelectLayout(selector) {
  const box = element => {
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    return [bounds.top, bounds.left, bounds.width, bounds.height].map(value => Math.round(value * 100) / 100);
  };
  const plot = document.querySelector('#eth-chart') || document.querySelector('#lab-chart') ||
    document.querySelector('.atlas-plot') || document.querySelector('svg[data-chart="price"]');
  const select = document.querySelector(selector);
  return {
    innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight, scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: Math.round(document.body.getBoundingClientRect().width * 100) / 100,
    devicePixelRatio, coarsePointer: matchMedia('(pointer: coarse)').matches,
    heading: document.querySelector('.atlas-canvas-heading')?.dataset.mobileHeading ?? null,
    plot: box(plot), select: box(select), selectValue: select?.value ?? null,
  };
}

// The viewport fingerprint that must survive the emulation switch. The select
// box is excluded: a legitimate re-render may move it, and every key handler
// re-resolves the current node.
export function nativeSelectLayoutLock(layout) {
  const { select, selectValue, ...lock } = layout;
  return lock;
}

/**
 * Run one native keyboard sequence against a <select> while Blink uses internal
 * popup menus, then restore the case emulation exactly as it was.
 *
 * @param {object} options
 * @param {{send:Function}} options.cdp CDP session that owns the key events.
 * @param {Function} options.evaluate Harness reader `evaluate(target, fn, ...args)`.
 * @param {object} [options.context] Document owner for the readers (defaults to cdp).
 * @param {Function} options.settled Harness readiness barrier `settled(target)`.
 * @param {string} options.selector Native <select> selector.
 * @param {{width:number,height:number,mobile:boolean}} options.viewport Case emulation to restore.
 * @param {Function} options.run The harness's own keystroke sequence.
 * @param {string} [options.platform] Injected for tests; defaults to process.platform.
 */
export async function inNativeSelectPopupMode({ cdp, evaluate, context, settled, selector, viewport, run, platform = process.platform }) {
  const { width, height, mobile } = viewport;
  if (!(width > 0) || !(height > 0) || typeof mobile !== 'boolean')
    throw new Error('Invalid native select viewport: ' + JSON.stringify(viewport));
  if (typeof run !== 'function') throw new Error('A native select keystroke sequence is required');
  const reader = context ?? cdp;
  const receipt = { selector, platform, emulated: mobile ? 'mobile' : 'desktop', internalPopupMode: false, layoutLocked: null, restored: false, transitions: [],
    // Which Blink popup implementation carried the keystrokes. Only the
    // internal-popup leg is exercised here; the AppKit menu a physical macOS
    // desktop would show is not reproduced by headless Chrome.
    popupMenu: { before: 'internal', during: 'internal', after: 'internal' } };
  // Only a desktop-emulated macOS target is affected; Linux and mobile targets
  // already use internal popup menus and keep their exact emulation.
  if (platform !== 'darwin' || mobile) {
    receipt.sequence = await run();
    return receipt;
  }
  const apply = async value => {
    receipt.transitions.push({ step: value ? 'enable-internal-popup' : 'restore-case-emulation', mobile: value, width, height, deviceScaleFactor: 1 });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: value });
  };
  const before = nativeSelectLayoutLock(await evaluate(reader, readNativeSelectLayout, selector));
  let failure = null;
  try {
    // Even a rejected switch, readiness barrier or geometry read must attempt
    // restoration: the browser may already have accepted the override.
    await apply(true);
    await settled(reader);
    const after = nativeSelectLayoutLock(await evaluate(reader, readNativeSelectLayout, selector));
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      throw new Error('Internal popup emulation changed the tested desktop layout: ' + JSON.stringify({ before, after }));
    }
    receipt.internalPopupMode = true;
    receipt.popupMenu = { before: 'external-appkit', during: 'internal', after: 'external-appkit' };
    receipt.layoutLocked = after;
    receipt.sequence = await run();
  } catch (error) {
    failure = error;
  }
  // Restoration and its readback run for every outcome. A restoration failure is
  // recorded next to the original error instead of replacing it.
  let restoreFailure = null;
  try {
    await apply(mobile);
    await settled(reader);
    const restored = nativeSelectLayoutLock(await evaluate(reader, readNativeSelectLayout, selector));
    if (JSON.stringify(restored) !== JSON.stringify(before)) {
      restoreFailure = new Error('Native select emulation was not restored to the tested desktop viewport: ' + JSON.stringify({ before, restored }));
    } else receipt.restored = true;
  } catch (error) {
    restoreFailure = restoreFailure || error;
  }
  if (failure) {
    if (restoreFailure) failure.restoreError = String(restoreFailure.message || restoreFailure);
    throw failure;
  }
  if (restoreFailure) throw restoreFailure;
  return receipt;
}

/**
 * Focus a <select> and reach one option with real trusted arrow keys.
 * Used by harnesses that assert the resulting value themselves.
 */
export async function selectNativeOptionByKeyboard({ cdp, evaluate, context, settled, selector, value, viewport, platform = process.platform }) {
  const reader = context ?? cdp;
  const target = await evaluate(reader, readNativeSelectTarget, selector, value);
  if (!target) throw new Error('Native select is missing: ' + selector);
  if (target.disabled) throw new Error('Native select is disabled: ' + selector);
  if (target.to < 0) throw new Error('The requested value is not a reachable native option: ' + value);
  // A selected option that is itself disabled/hidden has no reachable position;
  // Home moves to the first reachable option before the arrows run.
  const homeReset = target.fromPosition < 0;
  const fromPosition = homeReset ? 0 : target.fromPosition;
  const key = target.toPosition > fromPosition ? 'ArrowDown' : 'ArrowUp';
  const steps = Math.abs(target.toPosition - fromPosition);
  const receipt = await inNativeSelectPopupMode({ cdp, evaluate, context: reader, settled, selector, viewport, platform, run: async () => {
    const focus = async () => {
      const state = await evaluate(reader, focusNativeSelect, selector);
      if (!state) throw new Error('Native select is missing while focusing: ' + selector);
      if (!state.focused) throw new Error('Native select did not accept keyboard focus: ' + selector);
      await settled(reader);
    };
    // Establish focus inside the popup mode: the switch may have re-rendered the panel.
    await focus();
    const keys = [];
    if (homeReset) {
      await cdp.send('Input.dispatchKeyEvent', nativeSelectKeyEvent('Home', 'keyDown', platform));
      await cdp.send('Input.dispatchKeyEvent', nativeSelectKeyEvent('Home', 'keyUp', platform));
      await settled(reader);
      keys.push('Home');
    }
    for (let index = 0; index < steps; index++) {
      await cdp.send('Input.dispatchKeyEvent', nativeSelectKeyEvent(key, 'keyDown', platform));
      await cdp.send('Input.dispatchKeyEvent', nativeSelectKeyEvent(key, 'keyUp', platform));
      await settled(reader);
      keys.push(key);
    }
    const observed = await evaluate(reader, selector => {
      const node = document.querySelector(selector);
      return node ? { value: node.value, index: node.selectedIndex, focused: document.activeElement === node } : null;
    }, selector);
    return { keys, key, steps, homeReset, from: target.from, to: target.to, fromPosition, toPosition: target.toPosition, observed,
      noOp: steps === 0 && !homeReset };
  } });
  return { ...receipt, value, ...receipt.sequence };
}
