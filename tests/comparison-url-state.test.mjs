import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseComparisonUrl, comparisonUrlChanged, COMPARISON_OWNED_KEYS } from '../dist/comparison-url-state.js';

const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const labView = await readFile(new URL('../dist/lab-view.js', import.meta.url), 'utf8');

test('the parser reads every comparison-owned field exactly like the first load', () => {
  const parsed = parseComparisonUrl('?page=compare&mode=top&compare-unit=indexed&scale=linear&range=730&day=45&hide=2012,2016&baseline=all3&analysis=peak&zone=0.9&future=analogues&scenario=calendar-48m');
  assert.deepEqual(parsed, {
    view: 'compare', mode: 'top', unit: 'indexed', scale: 'linear', horizon: '730', cursor: 45,
    hidden: ['2012', '2016'], timingBaseline: 'all3', analysisView: 'peak', peakThreshold: 0.9,
    forecastView: 'analogues', forecastScenario: 'calendar-48m',
  });
  assert.deepEqual(parseComparisonUrl(''), {
    view: 'outlook', mode: 'halving', unit: 'rebased', scale: 'log', horizon: '1461', cursor: null,
    hidden: [], timingBaseline: 'recent2', analysisView: 'forecast', peakThreshold: 0.95,
    forecastView: 'macro', forecastScenario: 'bottom-holds',
  });
  // Legacy links keep the old `unit` alias, and only with the alias present.
  assert.equal(parseComparisonUrl('?page=compare&legacy=1&unit=indexed').unit, 'indexed');
  assert.equal(parseComparisonUrl('?unit=indexed').unit, 'rebased');
  assert.equal(parseComparisonUrl('?day=abc').cursor, null);
  assert.equal(parseComparisonUrl('?mode=unknown').mode, 'halving');
});

test('the owned key list cannot drift from what persistUrl writes', () => {
  const persist = app.slice(app.indexOf('function persistUrl() {'), app.indexOf("document.documentElement.dataset.theme = 'dark';"));
  const written = [...persist.matchAll(/\['([a-z-]+)',/g)].map(match => match[1]);
  assert.deepEqual(written.sort(), [...COMPARISON_OWNED_KEYS].sort());
});

test('a same-page query change is a change, an identical URL is not', () => {
  const base = parseComparisonUrl('?page=compare&compare-unit=rebased');
  const state = { ...base, hidden: new Set(base.hidden) };
  assert.equal(comparisonUrlChanged(state, base), false, 'identical URL does not re-apply');
  const samePageOtherMode = parseComparisonUrl('?page=compare&compare-unit=rebased&mode=bottom');
  assert.equal(comparisonUrlChanged(state, samePageOtherMode), true, 'page unchanged, query changed still applies');
  const otherUnit = parseComparisonUrl('?page=compare&compare-unit=indexed');
  assert.equal(comparisonUrlChanged(state, otherUnit), true);
  const hiddenChanged = parseComparisonUrl('?page=compare&compare-unit=rebased&hide=2012');
  assert.equal(comparisonUrlChanged(state, hiddenChanged), true, 'hidden series are compared by value');
  const hiddenAgain = { ...state, hidden: new Set(['2012']) };
  assert.equal(comparisonUrlChanged(hiddenAgain, hiddenChanged), false);
  assert.equal(comparisonUrlChanged(state, parseComparisonUrl('?page=data')), true, 'destination change applies');
});

test('popstate restores every owned field from the URL and never rewrites history', () => {
  const pop = app.slice(app.indexOf("window.addEventListener('popstate'"), app.indexOf('```'));
  const block = app.slice(app.indexOf("window.addEventListener('popstate'"), app.indexOf("window.addEventListener('popstate'") + 2000);
  assert.match(block, /const next = parseComparisonUrl\(location\.search\);/, 'the shared parser restores the fields');
  assert.doesNotMatch(block, /persistUrl\(\);/, 'history navigation must not rewrite the URL from memory');
  for (const field of ['view', 'mode', 'unit', 'scale', 'horizon', 'cursor', 'hidden', 'timingBaseline', 'analysisView', 'peakThreshold', 'forecastView', 'forecastScenario']) {
    assert.match(block, new RegExp(`state\\.${field} = `), `popstate restores ${field}`);
  }
  assert.match(block, /if \(!comparisonUrlChanged\(state, next\)\) return;/, 'identical URLs are not re-applied');
  assert.ok(pop.length > 0);
});

test('the initial parse uses the same parser instead of a second inline copy', () => {
  const initial = app.slice(app.indexOf('// The initial parse and history restore share one pure parser'), app.indexOf('let toastTimer;'));
  assert.match(initial, /const urlState = parseComparisonUrl\(location\.search\);/);
  assert.doesNotMatch(initial, /new URLSearchParams\(location\.search\)/, 'no duplicate parsing rules');
});

test('the bare compare URL is no longer stripped by the atlas URL sync', () => {
  assert.doesNotMatch(labView, /p\.get\('page'\)==='compare'&&!p\.has\('legacy'\)/, 'the legacy controller keeps the destination');
  assert.doesNotMatch(labView, /delete\('page'\)/, 'no query rewrite may drop the compare route');
  assert.match(labView, /function syncAtlasUrl\(\)\{/, 'the atlas sync itself stays');
});
