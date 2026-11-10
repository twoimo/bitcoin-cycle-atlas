import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../dist/ipo-view.css', import.meta.url), 'utf8');
const ipoView = html.match(/<section id="ipo-view"[\s\S]*?<\/section>/)?.[0];

test('IPO header is compact and keeps source in a native disclosure', () => {
  assert.ok(ipoView, 'IPO view section exists');
  const header = ipoView.match(/<header class="ipo-heading">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header, 'IPO header exists');
  assert.match(header, /<h2>공모주 캘린더<\/h2>/);
  assert.doesNotMatch(header, /<h1/, 'the IPO module must not add a second page-level H1');
  assert.match(header, /class="ipo-back"[^>]*aria-label="통합 차트로 돌아가기">←<\/button>/);
  assert.doesNotMatch(header, /ipo-eyebrow|수요예측과 청약 일정/);
  assert.match(header, /<details class="ipo-source-disclosure"><summary>출처<\/summary><div class="ipo-source-panel" tabindex="0" role="region" aria-label="출처와 일정 안내"><div class="ipo-source" id="ipo-source" role="status"><\/div>/);
  assert.match(css, /\.ipo-heading h2\s*\{[^}]*font-size:\s*17px/);
  assert.match(css, /#ipo-view\s*:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\)/);
  assert.match(css, /\.ipo-source-disclosure summary\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.ipo-back\s*\{[^}]*min-width:\s*44px/);
});

test('compact header preserves existing IPO filters, search, status, and calendar controls', () => {
  assert.match(ipoView, /data-ipo-filter="upcoming"/);
  assert.match(ipoView, /data-ipo-filter="closed"/);
  assert.match(ipoView, /data-ipo-filter="all"/);
  assert.match(ipoView, /class="ipo-search"[^>]*aria-label="공모주 검색"/);
  assert.match(ipoView, /class="ipo-calendar-message" role="status"/);
  for (const page of ['previous', 'next', 'today', 'list'])
    assert.match(ipoView, new RegExp(`data-ipo-page="${page}"`));
  assert.match(ipoView, /tabindex="0" role="region" aria-label="월별 달력과 전체 목록/);
});
