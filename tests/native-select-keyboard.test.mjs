import test from 'node:test';
import assert from 'node:assert/strict';
import { inNativeSelectPopupMode, selectNativeOptionByKeyboard, nativeSelectKeyEvent, readNativeSelectTarget, nativeSelectLayoutLock } from '../scripts/native-select-keyboard.mjs';

const layout = { innerWidth: 1440, clientWidth: 1440, scrollWidth: 1440, bodyWidth: 1440, devicePixelRatio: 1, coarsePointer: false,
  heading: null, plot: [83, 56, 1335, 779], select: [123.59, 496, 448, 35], selectValue: 'adaptive' };

function harness({ platform = 'darwin', targets = [], layouts = [], observed = [], focus = { focused: true, disabled: false } } = {}) {
  const sends = [], reads = [];
  let targetIndex = 0, layoutIndex = 0, observedIndex = 0;
  const cdp = { async send(method, params) { sends.push({ method, params }); } };
  const evaluate = async (context, fn, ...args) => {
    reads.push({ name: fn.name || 'anonymous', source: String(fn), args });
    if (fn.name === 'readNativeSelectTarget') return targets[targetIndex++];
    if (fn.name === 'readNativeSelectLayout') return layouts[layoutIndex++];
    if (fn.name === 'focusNativeSelect') return focus;
    return observed[observedIndex++] ?? null;
  };
  const settled = async () => {};
  const keys = () => sends.filter(call => call.method === 'Input.dispatchKeyEvent');
  const metrics = () => sends.filter(call => call.method === 'Emulation.setDeviceMetricsOverride');
  return { cdp, evaluate, settled, sends, reads, keys, metrics };
}

const desktop = { width: 1440, height: 900, mobile: false };
const twoSteps = { from: 0, to: 2, fromPosition: 0, toPosition: 2, selected: 'adaptive', disabled: false, options: 3, reachable: 3 };

test('desktop macOS uses internal popup mode, keeps the layout lock and restores the case emulation', async () => {
  const h = harness({ targets: [twoSteps], layouts: [layout, layout, layout], observed: [{ value: 'valuation', index: 2, focused: true }] });
  const receipt = await selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'valuation', viewport: desktop });
  assert.deepEqual(h.metrics().map(call => call.params), [
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: true },
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  ]);
  assert.deepEqual(h.keys().map(call => [call.params.type, call.params.key]), [['keyDown', 'ArrowDown'], ['keyUp', 'ArrowDown'], ['keyDown', 'ArrowDown'], ['keyUp', 'ArrowDown']]);
  assert.equal(h.keys()[0].params.nativeVirtualKeyCode, 125);
  assert.equal(h.keys()[0].params.windowsVirtualKeyCode, 40);
  assert.deepEqual(receipt.keys, ['ArrowDown', 'ArrowDown']);
  assert.equal(receipt.internalPopupMode, true);
  assert.equal(receipt.restored, true);
  assert.deepEqual(receipt.layoutLocked, nativeSelectLayoutLock(layout));
  assert.equal(receipt.observed.focused, true);
});

test('receipts record the popup backend and every emulation transition', async () => {
  const h = harness({ targets: [twoSteps], layouts: [layout, layout, layout], observed: [{ value: 'valuation', index: 2, focused: true }] });
  const receipt = await selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'valuation', viewport: desktop });
  assert.deepEqual(receipt.popupMenu, { before: 'external-appkit', during: 'internal', after: 'external-appkit' });
  assert.deepEqual(receipt.transitions, [
    { step: 'enable-internal-popup', mobile: true, width: 1440, height: 900, deviceScaleFactor: 1 },
    { step: 'restore-case-emulation', mobile: false, width: 1440, height: 900, deviceScaleFactor: 1 },
  ]);
  assert.equal(receipt.noOp, false);
  const linux = harness({ platform: 'linux', targets: [twoSteps], observed: [{ value: 'valuation', index: 2, focused: true }] });
  const linuxReceipt = await selectNativeOptionByKeyboard({ cdp: linux.cdp, evaluate: linux.evaluate, settled: linux.settled, selector: '#eth-model', value: 'valuation', viewport: desktop, platform: 'linux' });
  assert.deepEqual(linuxReceipt.popupMenu, { before: 'internal', during: 'internal', after: 'internal' });
  assert.deepEqual(linuxReceipt.transitions, []);
});

test('a no-op selection dispatches no keys, keeps focus and still restores the viewport', async () => {
  const h = harness({ targets: [{ from: 1, to: 1, fromPosition: 1, toPosition: 1, selected: 'pooled', disabled: false, options: 3, reachable: 3 }],
    layouts: [layout, layout, layout], observed: [{ value: 'pooled', index: 1, focused: true }] });
  const receipt = await selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'pooled', viewport: desktop });
  assert.deepEqual(receipt.keys, []);
  assert.equal(receipt.noOp, true);
  assert.equal(h.keys().length, 0);
  assert.deepEqual(h.metrics().map(call => call.params.mobile), [true, false]);
  assert.equal(receipt.restored, true);
  assert.equal(receipt.observed.focused, true);
});

test('only trusted key and emulation commands are sent: no value assignment, no synthetic events', async () => {
  const h = harness({ targets: [twoSteps], layouts: [layout, layout, layout], observed: [{ value: 'valuation', index: 2, focused: true }] });
  await selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'valuation', viewport: desktop });
  assert.deepEqual([...new Set(h.sends.map(call => call.method))], ['Emulation.setDeviceMetricsOverride', 'Input.dispatchKeyEvent']);
  for (const read of h.reads) {
    assert.ok(!/\.value\s*=(?!=)/.test(read.source), 'reader must never assign a value: ' + read.name);
    assert.ok(!/dispatchEvent|new Event|new InputEvent/.test(read.source), 'reader must never dispatch a synthetic event: ' + read.name);
  }
  assert.ok(h.keys().every(call => typeof call.params.isSystemKey === 'undefined'));
});

test('a layout change during the switch fails closed before any keystroke', async () => {
  const narrower = { ...layout, innerWidth: 980, clientWidth: 980, scrollWidth: 980, bodyWidth: 980, plot: [83, 56, 875, 779] };
  const h = harness({ targets: [twoSteps], layouts: [layout, narrower] });
  await assert.rejects(selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'valuation', viewport: desktop }),
    /changed the tested desktop layout/);
  assert.deepEqual(h.metrics().map(call => call.params.mobile), [true, false]);
  assert.equal(h.keys().length, 0, 'the rejected switch must not dispatch keys');
});

test('an unrestorable viewport is reported instead of silently keeping internal popup mode', async () => {
  const narrower = { ...layout, innerWidth: 1000, clientWidth: 1000, scrollWidth: 1000, bodyWidth: 1000 };
  const h = harness({ targets: [twoSteps], layouts: [layout, layout, narrower], observed: [{ value: 'valuation', index: 2, focused: true }] });
  await assert.rejects(selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'valuation', viewport: desktop }),
    /not restored to the tested desktop viewport/);
  assert.deepEqual(h.metrics().map(call => call.params.mobile), [true, false]);
});

test('linux targets keep their emulation and use the standard virtual key codes', async () => {
  const h = harness({ platform: 'linux', targets: [twoSteps], observed: [{ value: 'valuation', index: 2, focused: true }] });
  const receipt = await selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'valuation', viewport: desktop, platform: 'linux' });
  assert.equal(h.metrics().length, 0);
  assert.equal(receipt.internalPopupMode, false);
  assert.equal(h.keys()[0].params.nativeVirtualKeyCode, 40);
  assert.equal(h.keys().length, 4);
});

test('mobile-emulated cases are untouched', async () => {
  const h = harness({ targets: [twoSteps], observed: [{ value: 'valuation', index: 2, focused: true }] });
  const receipt = await selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'valuation', viewport: { width: 320, height: 900, mobile: true } });
  assert.equal(h.metrics().length, 0);
  assert.equal(receipt.emulated, 'mobile');
  assert.equal(h.keys().length, 4);
});

test('an unreachable option is rejected without touching the browser', async () => {
  const h = harness({ targets: [{ ...twoSteps, to: -1, toPosition: -1 }] });
  await assert.rejects(selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'missing', viewport: desktop }),
    /not a reachable native option/);
  assert.equal(h.sends.length, 0);
});

test('a disabled or hidden current option is reset with Home before the arrows', async () => {
  const h = harness({ targets: [{ from: 0, to: 1, fromPosition: -1, toPosition: 1, selected: '', disabled: false, options: 3, reachable: 2 }],
    layouts: [layout, layout, layout], observed: [{ value: 'b', index: 1, focused: true }] });
  const receipt = await selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#s', value: 'b', viewport: desktop });
  assert.deepEqual(receipt.keys, ['Home', 'ArrowDown']);
  assert.equal(receipt.homeReset, true);
  assert.equal(h.keys()[0].params.nativeVirtualKeyCode, 115);
});

test('arrow direction follows the reachable position, not the raw index', async () => {
  const h = harness({ targets: [{ from: 4, to: 1, fromPosition: 2, toPosition: 0, selected: 'e', disabled: false, options: 5, reachable: 3 }],
    layouts: [layout, layout, layout], observed: [{ value: 'b', index: 1, focused: true }] });
  const receipt = await selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#s', value: 'b', viewport: desktop });
  assert.equal(receipt.key, 'ArrowUp');
  assert.deepEqual(receipt.keys, ['ArrowUp', 'ArrowUp']);
  assert.equal(h.keys()[0].params.nativeVirtualKeyCode, 126);
});

test('focus loss inside the interaction is rejected', async () => {
  const h = harness({ targets: [twoSteps], layouts: [layout, layout], focus: { focused: false, disabled: false } });
  await assert.rejects(selectNativeOptionByKeyboard({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#eth-model', value: 'valuation', viewport: desktop }),
    /did not accept keyboard focus/);
  assert.deepEqual(h.metrics().map(call => call.params.mobile), [true, false]);
  assert.equal(h.keys().length, 0);
});

test('the primitive runs the harness sequence unchanged when no override is needed', async () => {
  const h = harness();
  let ran = 0;
  const receipt = await inNativeSelectPopupMode({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#s', viewport: { width: 320, height: 900, mobile: true }, run: async () => { ran++; return { steps: 1 }; } });
  assert.equal(ran, 1);
  assert.equal(h.sends.length, 0);
  assert.equal(receipt.internalPopupMode, false);
  assert.deepEqual(receipt.sequence, { steps: 1 });
});

test('the primitive restores the case viewport even when the sequence throws', async () => {
  const h = harness({ layouts: [layout, layout, layout] });
  await assert.rejects(inNativeSelectPopupMode({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#s', viewport: desktop, run: async () => { throw new Error('sequence failed'); } }),
    /sequence failed/);
  assert.deepEqual(h.metrics().map(call => call.params.mobile), [true, false]);
});

test('key events carry the platform native virtual key codes', () => {
  assert.deepEqual(nativeSelectKeyEvent('Enter', 'keyDown', 'darwin'), { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 36, text: '\r', unmodifiedText: '\r' });
  assert.deepEqual(nativeSelectKeyEvent('ArrowDown', 'keyUp', 'darwin'), { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 125 });
  assert.equal(nativeSelectKeyEvent('Home', 'keyDown', 'linux').nativeVirtualKeyCode, 36);
  assert.throws(() => nativeSelectKeyEvent('Tab', 'keyDown', 'darwin'), /Unknown native select key/);
});

test('the page reader counts only reachable options', () => {
  const options = [{ value: 'a', disabled: false, hidden: false }, { value: 'b', disabled: true, hidden: false }, { value: 'c', disabled: false, hidden: true }, { value: 'd', disabled: false, hidden: false }];
  const node = { selectedIndex: 0, value: 'a', disabled: false, options };
  const previous = globalThis.document;
  globalThis.document = { querySelector: () => node };
  try {
    const target = readNativeSelectTarget('#s', 'd');
    assert.equal(target.to, 3);
    assert.equal(target.toPosition, 1);
    assert.equal(target.fromPosition, 0);
    assert.equal(target.reachable, 2);
    assert.equal(readNativeSelectTarget('#s', 'b').to, -1);
  } finally { globalThis.document = previous; }
});

test('the layout lock ignores the moving select box but keeps the viewport', () => {
  const lock = nativeSelectLayoutLock({ ...layout, select: [1, 2, 3, 4], selectValue: 'pooled' });
  assert.equal('select' in lock, false);
  assert.equal('selectValue' in lock, false);
  assert.equal(lock.innerWidth, 1440);
  assert.deepEqual(lock.plot, [83, 56, 1335, 779]);
});

for (const failure of ['override', 'readiness', 'geometry']) {
  test('popup emulation is restored after a failed ' + failure + ' step', async () => {
    const h = harness({ layouts: [layout, layout, layout] });
    const send = h.cdp.send;
    let reads = 0, waits = 0, ran = false;
    h.cdp.send = async (method, params) => {
      await send(method, params);
      if (failure === 'override' && method === 'Emulation.setDeviceMetricsOverride' && params.mobile) throw new Error('injected override');
    };
    const evaluate = async (...args) => {
      if (args[1].name === 'readNativeSelectLayout' && ++reads === 2 && failure === 'geometry') throw new Error('injected geometry');
      return h.evaluate(...args);
    };
    const settled = async () => { if (++waits === 1 && failure === 'readiness') throw new Error('injected readiness'); };
    await assert.rejects(inNativeSelectPopupMode({ cdp: h.cdp, evaluate, settled, selector: '#s', viewport: desktop,
      run: async () => { ran = true; } }), new RegExp('injected ' + failure));
    assert.equal(ran, false);
    assert.deepEqual(h.metrics().map(call => call.params.mobile), [true, false]);
  });
}

test('a failing keystroke run still reads the restored layout and keeps the first error', async () => {
  const h = harness({ layouts: [layout, layout, layout] });
  let layoutReads = 0;
  const evaluate = async (...args) => {
    if (args[1].name === 'readNativeSelectLayout') layoutReads++;
    return h.evaluate(...args);
  };
  const error = await inNativeSelectPopupMode({ cdp: h.cdp, evaluate, settled: h.settled, selector: '#s', viewport: desktop,
    run: async () => { throw new Error('injected keystroke'); } }).then(() => null, failure => failure);
  assert.equal(error?.message, 'injected keystroke');
  assert.equal(layoutReads, 3, 'the restoration read must still run after a failing sequence');
  assert.deepEqual(h.metrics().map(call => call.params.mobile), [true, false]);
  assert.equal(error?.restoreError, undefined);
});

test('a failed restoration is reported next to the original error instead of replacing it', async () => {
  const h = harness({ layouts: [layout, layout, { ...layout, innerWidth: 900, clientWidth: 900, scrollWidth: 900, bodyWidth: 900 }] });
  const error = await inNativeSelectPopupMode({ cdp: h.cdp, evaluate: h.evaluate, settled: h.settled, selector: '#s', viewport: desktop,
    run: async () => { throw new Error('injected keystroke'); } }).then(() => null, failure => failure);
  assert.equal(error?.message, 'injected keystroke');
  assert.match(error?.restoreError ?? '', /not restored|injected/);
});
