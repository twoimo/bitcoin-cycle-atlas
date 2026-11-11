import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READER_RESERVATION_TOLERANCE_PX,
  ROUND_TRIP_FRACTIONAL_WIDTHS,
  ROUND_TRIP_INTEGER_WIDTHS,
  WIDTH_ROUNDING_TOLERANCE_PX,
  assertRoundTripWidths,
  compareRoundTripWidths,
} from '../scripts/verify-workspace-browser.mjs';

// D09: the reader round trip compares widths that come from two different sources.
// Integer widths must match exactly, fractional layout widths may round by at most
// WIDTH_ROUNDING_TOLERANCE_PX, and anything larger has to be reported as a
// regression so a shrink or a lost scrollbar can never hide inside a tolerance.
const base = () => ({ document: 1512, body: 1512, bodyScroll: 1512, workspace: 1512, main: 1080.5 });

test('the documented allowances stay pinned so they cannot be widened silently', () => {
  assert.equal(WIDTH_ROUNDING_TOLERANCE_PX, 1, 'layout rounding allowance is one CSS pixel');
  assert.equal(READER_RESERVATION_TOLERANCE_PX, 2, 'the reader reserve keeps its two-pixel allowance');
  assert.deepEqual([...ROUND_TRIP_INTEGER_WIDTHS], ['document', 'body', 'bodyScroll']);
  assert.deepEqual([...ROUND_TRIP_FRACTIONAL_WIDTHS], ['workspace', 'main']);
});

test('an unchanged round trip is reported as exact', () => {
  const result = compareRoundTripWidths(base(), base());
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'exact');
  assert.equal(result.delta, 0);
});

test('sub-pixel layout rounding is accepted and recorded as rounding, not a pass-by-default', () => {
  const after = { ...base(), main: 1080.75, workspace: 1512.5 };
  const result = compareRoundTripWidths(after, base());
  assert.equal(result.ok, true, 'half-pixel reflow is layout rounding');
  assert.equal(result.kind, 'rounding');
  assert.equal(result.key, 'workspace');
  assert.equal(result.delta, 0.5);
  assert.equal(result.tolerance, WIDTH_ROUNDING_TOLERANCE_PX);
  assert.equal(result.before, 1512);
  assert.equal(result.after, 1512.5);
});

test('the allowance is inclusive at one pixel and fails just past it', () => {
  assert.equal(compareRoundTripWidths({ ...base(), main: 1081.5 }, base()).ok, true);
  const outside = compareRoundTripWidths({ ...base(), main: 1081.51 }, base());
  assert.equal(outside.ok, false);
  assert.equal(outside.kind, 'regression');
  assert.equal(outside.reason, 'layout width moved beyond rounding');
});

test('a real layout regression fails even when it is close to rounding', () => {
  const shrunk = compareRoundTripWidths({ ...base(), main: 1078.5, workspace: 1510 }, base());
  assert.equal(shrunk.ok, false);
  assert.equal(shrunk.kind, 'regression');
  assert.equal(shrunk.delta, -2);
  assert.deepEqual(shrunk.beyond.map(item => item.key).sort(), ['main', 'workspace'], 'every box beyond the allowance is reported, not just the first');
  assert.deepEqual(shrunk.beyond.find(item => item.key === 'main'), { key: 'main', before: 1080.5, after: 1078.5, delta: -2 });
});

test('integer document widths are always exact, even inside the rounding allowance', () => {
  const overflowed = compareRoundTripWidths({ ...base(), document: 1513 }, base());
  assert.equal(overflowed.ok, false);
  assert.equal(overflowed.reason, 'integer width changed');
  assert.equal(overflowed.key, 'document');
  const scrollbar = compareRoundTripWidths({ ...base(), bodyScroll: 1500 }, base());
  assert.equal(scrollbar.ok, false);
  assert.equal(scrollbar.key, 'bodyScroll');
  assert.equal(scrollbar.before, 1512);
  assert.equal(scrollbar.after, 1500);
});

test('an unmeasurable width is a regression instead of a skipped comparison', () => {
  const missing = compareRoundTripWidths({ ...base(), main: null }, base());
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'unmeasurable layout width');
  const notANumber = compareRoundTripWidths({ ...base(), workspace: '1512' }, { ...base(), workspace: NaN });
  assert.equal(notANumber.ok, false);
  assert.equal(notANumber.reason, 'unmeasurable layout width');
});

test('a mis-typed tolerance fails instead of disabling the comparison', () => {
  assert.throws(() => compareRoundTripWidths({ ...base(), main: 1080 }, base(), 'Closing the reader'), /tolerance must be a non-negative number/);
  assert.throws(() => compareRoundTripWidths(base(), base(), -1), /tolerance must be a non-negative number/);
});

test('the asserting wrapper names a regression instead of swallowing it', () => {
  assert.doesNotThrow(() => assertRoundTripWidths({ ...base(), main: 1080 }, base(), 'Closing the reader'));
  assert.throws(
    () => assertRoundTripWidths({ ...base(), main: 1036 }, base(), 'Closing the reader'),
    /Closing the reader is a width regression, not layout rounding/,
  );
  assert.throws(
    () => assertRoundTripWidths({ ...base(), document: 1513 }, base(), 'Closing the reader'),
    /integer width changed/,
  );
});
