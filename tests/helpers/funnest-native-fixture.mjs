import { parseHTML } from 'linkedom';

export async function withNativeRuntime(run) {
  const { document, window } = parseHTML('<html><body><div id="host"></div></body></html>');
  window.devicePixelRatio = 1;
  const originals = new Map(['document', 'window', 'MutationObserver', 'ResizeObserver', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalCreate = document.createElement.bind(document), bounds = { left: 100, top: 50, width: 900, height: 520, right: 1000, bottom: 570 };
  const glyph = { width: 6 };
  const context = new Proxy({ canvas: null, measureText: value => ({ width: String(value).length * glyph.width }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray([1, 2, 3, 255, 2, 3, 4, 255]) }) }, {
    get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true),
  });
  const container = document.getElementById('host'); container.getBoundingClientRect = () => ({ ...bounds });
  document.createElement = (name, ...args) => { const node = originalCreate(name, ...args); if (name === 'div' || name === 'canvas') node.getBoundingClientRect = () => ({ ...bounds }); if (name === 'canvas') node.getContext = () => { context.canvas = node; return context; }; return node; };
  // linkedom has no PointerEvent.
  class FixturePointerEvent extends window.Event {
    constructor(type, init = {}) {
      super(type, { bubbles: true, cancelable: true });
      for (const [key, fallback] of Object.entries({ pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: 0, clientY: 0, buttons: 0, button: 0 })) Object.defineProperty(this, key, { enumerable: true, value: init[key] ?? fallback });
    }
  }
  Object.assign(globalThis, { document, window, MutationObserver: window.MutationObserver, ResizeObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }), getComputedStyle: () => ({ color: '', getPropertyValue: () => '' }), requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout });
  const settle = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
  const relayout = async (mounted, width) => { glyph.width = width; mounted.chart.refreshTheme(); mounted.chart.takeScreenshot(); await settle(); };
  try { return await run({ container, bounds, window, settle, relayout, PointerEvent: FixturePointerEvent }); }
  finally { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; }
}
export const sessionDay = 86_400_000;
export const sessionBars = Array.from({ length: 400 }, (_, index) => index).filter(index => index % 7 < 5).map((index, order) => {
  const close = 100 + order;
  return { time: Date.parse('2024-01-01T00:00:00Z') + index * sessionDay, open: close - 1, high: close + 2, low: close - 2, close };
});
