import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  SEASONAL_THEMES,
  applySeasonalTheme,
  describeYear,
  eventDate,
  normalizeMode,
  resolveSeasonalTheme,
  toCalendarDate,
} from '../dist/ui/seasonal-theme.js';

const lunarTable = JSON.parse(await readFile(resolve('dist/data/seasonal/lunar-calendar.json'), 'utf8'));
const at = day => resolveSeasonalTheme(day, { lunarTable })?.id ?? null;

test('every seasonal theme activates on its own peak date', () => {
  const peaks = {
    newyear: '2026-01-01', valentine: '2026-02-14', samil: '2026-03-01', whiteday: '2026-03-14',
    children: '2026-05-05', parents: '2026-05-08', memorial: '2026-06-06', liberation: '2026-08-15',
    gaecheon: '2026-10-03', hangul: '2026-10-09', halloween: '2026-10-31', pepero: '2026-11-11',
    suneung: '2026-11-19', christmas: '2026-12-25', yearend: '2026-12-31',
    seollal: '2026-02-17', buddha: '2026-05-24', chuseok: '2026-09-25',
  };
  for (const [id, day] of Object.entries(peaks)) {
    assert.equal(at(day), id, `${day} should be ${id}`);
    assert.equal(resolveSeasonalTheme(day, { lunarTable }).phase, 'day');
  }
  assert.equal(Object.keys(peaks).length, SEASONAL_THEMES.length, 'every theme is covered by the peak table');
});

test('lunar holidays come from the generated table for several years', () => {
  assert.equal(at('2024-02-10'), 'seollal');
  assert.equal(at('2024-09-17'), 'chuseok');
  assert.equal(at('2024-05-15'), 'buddha');
  assert.equal(at('2025-01-29'), 'seollal');
  assert.equal(at('2025-10-06'), 'chuseok');
  assert.equal(at('2027-02-07'), 'seollal');
  assert.equal(at('2030-02-03'), 'seollal');
  assert.equal(at('2035-09-16'), 'chuseok');
});

test('windows open and close on the declared boundaries', () => {
  assert.equal(at('2026-12-03'), null, 'christmas window opens on 12-04');
  assert.equal(at('2026-12-04'), 'christmas');
  assert.equal(resolveSeasonalTheme('2026-12-04', { lunarTable }).phase, 'before');
  assert.equal(at('2026-12-26'), 'christmas');
  assert.equal(at('2026-12-27'), 'yearend', 'yearend takes over from 12-27');
  assert.equal(at('2026-12-31'), 'yearend');
  assert.equal(at('2027-01-01'), 'newyear');
  assert.equal(at('2027-01-06'), 'newyear');
  assert.equal(at('2027-01-07'), null, 'newyear window closes on 01-06');
});

test('overlaps resolve by priority and then by distance to the peak', () => {
  assert.equal(at('2026-05-06'), 'parents', 'parents outranks children the day after');
  assert.equal(at('2026-11-12'), 'suneung', 'suneung outranks pepero where the windows meet');
  assert.equal(at('2026-12-31'), 'yearend', 'yearend outranks newyear');
  assert.equal(at('2026-05-05'), 'children', 'the day itself outranks a neighbouring holiday');
  assert.equal(at('2025-05-05'), 'children', 'two holidays on the same day keep declaration order');
  assert.equal(at('2026-02-15'), 'seollal', 'seollal outranks valentine');
});

test('days outside every window resolve to null instead of a stale season', () => {
  for (const day of ['2026-01-20', '2026-04-20', '2026-07-10', '2026-09-05', '2026-11-25']) {
    assert.equal(at(day), null, day);
  }
  assert.equal(applySeasonalTheme({ root: { dataset: {} }, date: '2026-07-10', lunarTable }), null);
});

test('a year without lunar data keeps the fixed holidays and drops only lunar ones', () => {
  assert.equal(resolveSeasonalTheme('2045-02-17', { lunarTable }), null);
  assert.equal(at('2045-12-25'), 'christmas');
  assert.equal(eventDate(SEASONAL_THEMES.find(t => t.id === 'seollal'), 2045, lunarTable), null);
});

test('phases stay monotonic around each peak', () => {
  const theme = SEASONAL_THEMES.find(t => t.id === 'chuseok');
  const peak = eventDate(theme, 2026, lunarTable);
  assert.equal(peak, '2026-09-25');
  const before = resolveSeasonalTheme('2026-09-20', { lunarTable });
  const on = resolveSeasonalTheme(peak, { lunarTable });
  const after = resolveSeasonalTheme('2026-09-27', { lunarTable });
  assert.deepEqual([before.id, before.phase, before.daysToPeak], ['chuseok', 'before', -5]);
  assert.deepEqual([on.phase, on.intensity], ['day', 1]);
  assert.deepEqual([after.phase, after.daysToPeak], ['after', 2]);
  assert.ok(before.intensity < on.intensity && after.intensity <= before.intensity + 0.5);
});

test('a full year is covered without gaps or double assignment', () => {
  const days = describeYear(2026, { lunarTable });
  assert.equal(days.length, 365);
  // 한 해에 상위 우선순위 창에 완전히 먹히는 테마(예: 2026 설날이 삼킨 발렌타인)가 있을 수 있으므로
  // 커버리지는 여러 해 합집합으로 확인한다.
  const covered = new Set();
  for (let year = 2024; year <= 2032; year += 1) {
    for (const entry of describeYear(year, { lunarTable })) if (entry.season) covered.add(entry.season);
  }
  for (const theme of SEASONAL_THEMES) assert.ok(covered.has(theme.id), `${theme.id} appears across 2024-2032`);
  for (const entry of days) {
    if (!entry.season) continue;
    const theme = SEASONAL_THEMES.find(t => t.id === entry.season);
    const own = eventDate(theme, Number(entry.day.slice(0, 4)), lunarTable);
    assert.ok(own, `${theme.id} has a peak date`);
    const delta = (new Date(`${entry.day}T00:00:00Z`) - new Date(`${own}T00:00:00Z`)) / 86400000;
    assert.ok(delta >= -theme.before && delta <= theme.after, `${entry.day} within ${theme.id} window`);
  }
  for (let i = 1; i < days.length; i += 1) {
    assert.ok(days[i].day > days[i - 1].day, 'days are ordered');
  }
});

test('applySeasonalTheme writes and clears the resolved season on the root element', () => {
  const root = { dataset: {} };
  const applied = applySeasonalTheme({ root, date: '2026-12-25', lunarTable });
  assert.equal(applied.id, 'christmas');
  assert.equal(root.dataset.season, 'christmas');
  assert.equal(root.dataset.seasonPhase, 'day');
  assert.equal(root.dataset.seasonLabel, '크리스마스');
  assert.equal(applySeasonalTheme({ root, date: '2026-12-25', lunarTable, mode: 'off' }), null);
  assert.equal(root.dataset.season, undefined);
  assert.equal(applySeasonalTheme({ root, date: '2026-07-10', lunarTable, mode: 'halloween' }).id, 'halloween');
  assert.equal(root.dataset.season, 'halloween');
  assert.equal(normalizeMode('nope'), 'auto');
  assert.equal(normalizeMode('off'), 'off');
  assert.equal(normalizeMode('chuseok'), 'chuseok');
});

test('KST conversion keeps the Korean calendar day for UTC evening stamps', () => {
  assert.equal(toCalendarDate('2026-02-16T16:00:00Z'), '2026-02-17');
  assert.equal(toCalendarDate('2026-02-16T14:59:00Z'), '2026-02-16');
  assert.equal(toCalendarDate('2026-09-25'), '2026-09-25');
});
