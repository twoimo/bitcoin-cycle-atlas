import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeMeasurementFacts, readNativeMeasurementInk } from '../scripts/verify-native-chart-workbench-browser.mjs';

async function withCanvas(paint, run) {
  const width = 400, height = 200, data = new Uint8ClampedArray(width * height * 4);
  const set = (x, y, rgba) => data.set(rgba, (y * width + x) * 4);
  paint(set);
  const canvas = { width, height, getContext: () => ({ getImageData: () => ({ data }) }) };
  const host = { querySelector: selector => selector === 'canvas' ? canvas : null, getAtlasFunnestSnapshot: () => ({ layout: { width: 200, height: 100, panes: [{ kind: 'main', top: 10, height: 60 }] } }) };
  const plot = { querySelector: selector => selector === '.atlas-funnest-canvas' ? host : null };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { querySelector: selector => selector === '#eth-chart' ? { closest: name => name === '.atlas-plot' ? plot : null } : null };
  try { await run(); } finally { original ? Object.defineProperty(globalThis, 'document', original) : delete globalThis.document; }
}

test('measurement ink counts only the measurement stroke around each painted anchor in device pixels', async () => {
  await withCanvas(set => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) set(100 + dx, 60 + dy, [138, 200, 185, 255]);
    set(110, 60, [160, 200, 185, 255]);
    set(111, 60, [163, 200, 185, 255]);
    set(112, 60, [138, 200, 185, 0]);
    set(300, 60, [116, 167, 238, 255]);
  }, async () => {
    const ink = await readNativeMeasurementInk({ svgSelector: '#eth-chart', anchors: [{ x: 50, y: 20 }, { x: 150, y: 20 }] });
    assert.deepEqual(ink, [10, 0], 'the 2x pane-offset anchor finds 9 exact and 1 near stroke pixels; other paint and transparent pixels are not ink');
  });
});

test('measurement ink refuses a chart without the actual Funnest main canvas', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { querySelector: () => null };
  try { await assert.rejects(readNativeMeasurementInk({ svgSelector: '#eth-chart', anchors: [] }), /actual Funnest main canvas/); }
  finally { original ? Object.defineProperty(globalThis, 'document', original) : delete globalThis.document; }
});

test('undo compares the painted source facts, not screen coordinates', () => {
  const painted = { pending: false, label: 'Δ 1.00 (1.00%) · 1.0일', start: { time: 1, date: '1970-01-01', price: 10, field: 'C', kind: 'observed', x: 4, y: 5 }, end: { time: 2, date: '1970-01-02', price: 11, field: 'H', kind: 'observed', x: 9, y: 3 } };
  const moved = { ...painted, start: { ...painted.start, x: 40 }, end: { ...painted.end, y: 30 } };
  assert.deepEqual(nativeMeasurementFacts(moved), nativeMeasurementFacts(painted));
  assert.notDeepEqual(nativeMeasurementFacts({ ...painted, end: { ...painted.end, time: 3 } }), nativeMeasurementFacts(painted));
  assert.notDeepEqual(nativeMeasurementFacts({ ...painted, pending: true }), nativeMeasurementFacts(painted));
  assert.equal(nativeMeasurementFacts(null), null);
});
