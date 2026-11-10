import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
const rule = (source, selector) => {
  const matches = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectorList(selectors).includes(selector));
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
  assert.match(base, /p:not\(\.atlas-page-description\)\{\n {2}font-size:max\(12px,1em\);line-height:1\.6;/);
});

test('no decorative gradients, blur or large shadows enter the shell', () => {
  for (const [name, source] of [['atlas-shell.css', shell], ['styles.css', base]]) {
    assert.doesNotMatch(source, /backdrop-filter:\s*(?!none)\w+/, `${name} keeps backdrop-filter off`);
    const body = source.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(body, /linear-gradient|radial-gradient|conic-gradient/, `${name} paints no gradients`);
  }
});

test('the 390px two-row chart toolbar contract is preserved', () => {
  assert.match(shell, /grid-template-rows:44px 44px/);
  assert.match(shell, /grid-template-columns:minmax\(80px,1fr\) 56px repeat\(4,44px\)/);
});
