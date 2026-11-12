import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readP0RootTokens,resolveP0Token} from '../scripts/ui-renewal-p0-contract.mjs';

// Launch-cleanup guards for the shell chrome owned by dist/atlas-shell.css and
// dist/styles.css. These assert the flat research-workbench direction: rules
// instead of cards, no decorative pills, and page-context copy that keeps the
// shell's compact size instead of inheriting prose sizing.
const shell = readFileSync(new URL('../dist/atlas-shell.css', import.meta.url), 'utf8');
const base = readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8');
// Split a selector list on top-level commas only, so `:is(a,b)` stays intact.
const selectorList = text => {
  const parts = []; let depth = 0; let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) { parts.push(text.slice(start, index)); start = index + 1; }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim());
};
const tidy = text => text.replace(/\s+/g, ' ').trim();
const rule = (source, selector) => {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const matches = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectorList(tidy(selectors)).includes(tidy(selector)));
  assert.ok(matches.length >= 1, `${selector} must keep an owning rule`);
  return matches.map(([, , body]) => body).join(';');
};

test('dashboard navigation is a flat left-aligned list rather than centred pills', () => {
  const nav = rule(shell, 'body[data-shell=dashboard] .atlas-sidebar .atlas-nav :is(a,button)');
  assert.match(nav, /justify-content:flex-start/, 'labels must share one left edge');
  assert.match(nav, /border-radius:2px/, 'nav rows keep a near-square corner');
  assert.doesNotMatch(nav, /border-radius:(?:7|8|9|1\d)px/, 'no rounded pill rows');
  const list = rule(shell, 'body[data-shell=dashboard] .atlas-sidebar .atlas-nav');
  assert.match(list, /gap:1px/, 'destination rows stay a tight list');
});

test('dashboard surfaces use rules and hairlines instead of rounded cards', () => {
  const tables = rule(shell, 'body[data-shell=dashboard] :is(.ipo-table-shell,.daily-table-shell,.evidence-table-wrap)');
  assert.match(tables, /border-radius:0/, 'ledger shells are square');
  assert.match(rule(shell, 'body[data-shell=dashboard] .ml-card'), /border-radius:0/);
  assert.match(rule(shell, 'body[data-shell=dashboard] .ml-score'), /border-radius:0/);
  assert.match(rule(shell, 'body[data-shell=dashboard] .ml-score'), /border-left-width:1px/, 'no 2px accent KPI bar');
  assert.match(rule(base, '.table-scroll'), /border-radius:0/);
  assert.match(rule(base, '.chart-card'), /border-radius:0/);
});

test('the outer dashboard header stays one compact row', () => {
  assert.match(shell, /--app-header-height:48px/);
  const copy = rule(shell, '.atlas-shell-copy');
  assert.match(copy, /flex-direction:row/, 'title and basis share one row');
  assert.match(rule(shell, '.atlas-shell-heading'), /font-size:13px/);
  assert.match(rule(shell, '.atlas-dashboard-header .atlas-page-description'), /white-space:nowrap/);
});

test('page-context chrome keeps its compact size while prose keeps a reading size', () => {
  assert.match(shell, /\.atlas-page-description\{margin:0;color:var\(--muted\);font:11px\/14px var\(--font\)/);
  assert.match(base, /p:not\(\.atlas-page-description\)\{\n {2}font-size:var\(--copy-size\);line-height:1\.6;/);
  const tokens = readP0RootTokens(base);
  assert.equal(tokens.get('--copy-size'), 'var(--body-size)');
  assert.deepEqual(['--type-body-sm','--type-body-md','--type-body-lg'].map(name => tokens.get(name)), ['15px','16px','17px']);
});

test('no decorative gradients, blur or large shadows enter the shell', () => {
  for (const [name, source] of [['atlas-shell.css', shell], ['styles.css', base],
    ['relay-room.css', scoped.relay], ['daily-data.css', scoped.daily],
    ['chart-legend.css', scoped.legend], ['analysis-dock.css', scoped.dock]]) {
    assert.doesNotMatch(source, /backdrop-filter:\s*(?!none)\w+/, `${name} keeps backdrop-filter off`);
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(body, /linear-gradient|radial-gradient|conic-gradient/, `${name} paints no gradients`);
  }
});

test('the data heading keeps its dark opaque sticky surface', () => {
  // scripts/verify-eth-candidate-browser.mjs requires a dark opaque
  // background on .daily-heading; the compaction must not make it transparent.
  const heading = rule(shell, 'body[data-shell=dashboard] #data-view .daily-heading');
  assert.doesNotMatch(heading, /background:(?:transparent|none)/, 'the data heading may not become transparent');
  assert.match(heading, /background:var\(--surface\)/, 'the heading paints the canvas surface token');
  const editorial = readFileSync(new URL('../dist/editorial-system.css', import.meta.url), 'utf8');
  const paintedHeading = rule(editorial, 'body[data-shell=dashboard] #data-view .daily-heading');
  assert.match(paintedHeading, /background:var\(--ledger-sticky-bg\)/);
  const tokens = readP0RootTokens(base);
  for (const theme of ['light','dark']) {
    const [red,green,blue,alpha] = resolveP0Token(tokens,'--ledger-sticky-bg',theme).color;
    assert.equal(alpha,1, `${theme}: the sticky header must remain opaque`);
    assert.ok([red,green,blue].every(value => value < 90), `${theme}: the sticky header remains dark`);
  }
});

test('the requested phone perimeter is one bottom dock with 44px controls', () => {
  assert.match(shell, /\[data-mobile-heading=phone-dock\]\{[^}]*order:100[^}]*height:calc\(48px/);
  assert.match(shell, /\[data-mobile-heading=phone-dock\]>:is\(\.workbench-icon,\.mobile-workbench-button\)\{[^}]*min-width:44px[^}]*min-height:44px/);
  assert.doesNotMatch(shell, /\[data-mobile-heading=(two-row|one-row)\]/);
});

// The panel surfaces added to this scope: relay reader, data filters, chart
// legend dock and the indicator dock. Panels and rows stay at 0-2px; controls
// may keep the shared 4px control radius; dialogs may keep 8px.
const scoped = {
  relay: readFileSync(new URL('../dist/relay-room.css', import.meta.url), 'utf8'),
  daily: readFileSync(new URL('../dist/daily-data.css', import.meta.url), 'utf8'),
  legend: readFileSync(new URL('../dist/ui/chart-legend.css', import.meta.url), 'utf8'),
  dock: readFileSync(new URL('../dist/analysis-dock.css', import.meta.url), 'utf8')
};

test('scoped panels and rows drop pill and card radii', () => {
  for (const [name, source] of Object.entries(scoped)) {
    assert.doesNotMatch(source, /border-radius:\s*999px/, `${name} paints no pill`);
    assert.doesNotMatch(source, /border-radius:\s*\d\d+px/, `${name} keeps no double-digit panel radius`);
  }
  assert.match(rule(scoped.relay, '.relay-bubble'), /border-radius:2px/, 'message bubbles are not tailed chat bubbles');
  assert.match(rule(scoped.relay, '.relay-day span'), /box-shadow:none/, 'date dividers keep no drop shadow');
  assert.match(rule(scoped.relay, '.relay-msg--media[data-media="1"] .relay-msg-foot'), /backdrop-filter:none/);
  assert.match(rule(scoped.legend, '.atlas-plot>.lab-chart-foot.chart-legend-dock'), /border-radius:2px/);
  assert.match(rule(scoped.dock, '.scenario-countdown'), /border-radius:2px/);
});

test('scoped surfaces keep circular data dots and semantic media treatment', () => {
  assert.match(scoped.relay, /border-radius:50%/, 'status dots stay round');
  assert.match(scoped.legend, /\.chart-legend-entry>svg/, 'legend line samples are untouched');
  assert.match(scoped.relay, /\.relay-msg-image\{[^}]*border-radius:2px/, 'media keeps a square frame');
});

test('the data filter row keeps native horizontal access for clipped controls', () => {
  const row = rule(scoped.daily, '#data-view .asset-filters');
  assert.match(row, /overflow-x:auto/);
  assert.match(row, /scroll-snap-type:x proximity/, 'a swipe lands on a control edge');
  assert.match(row, /overscroll-behavior-x:contain/, 'the gesture cannot chain to the page');
  assert.match(row, /touch-action:pan-x pinch-zoom/);
  assert.match(rule(scoped.daily, '#data-view .asset-filters > *'), /scroll-snap-align:start/);
});

test('dashboard return and navigation keep 44px targets on wide coarse-pointer screens', () => {
  const block = shell.match(/@media\(max-width:760px\),\(pointer:coarse\)\{\s*(body\[data-shell=dashboard\] \.atlas-sidebar :is\(\.atlas-brand,\.atlas-nav a,\.atlas-nav button\)\{[^}]+\})/);
  assert.ok(block, 'touch navigation sizing must not depend only on a narrow viewport');
  assert.match(block[1], /min-height:44px/);
  assert.match(block[1], /height:44px/);
  assert.match(block[1], /flex-shrink:0/);
});
