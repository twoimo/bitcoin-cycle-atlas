import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const ipoCss = readFileSync(new URL('../dist/ipo-view.css', import.meta.url), 'utf8');
const relayJs = readFileSync(new URL('../dist/relay-room.js', import.meta.url), 'utf8');
const relayCss = readFileSync(new URL('../dist/relay-room.css', import.meta.url), 'utf8');
const shellCss = readFileSync(new URL('../dist/atlas-shell.css', import.meta.url), 'utf8');
const pageDescription = readFileSync(new URL('../dist/ui/page-description.js', import.meta.url), 'utf8');

// Top-level blocks of a stylesheet, so a rule can be attributed to its @media
// prelude instead of matching anywhere in the file.
function topLevelBlocks(css) {
  const blocks = [];
  let depth = 0, start = 0, prelude = '';
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) prelude = css.slice(start, i).trim();
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ prelude, body: css.slice(css.indexOf('{', start) + 1, i) });
        start = i + 1;
      }
    }
  }
  return blocks;
}

const ipoSection = html.match(/<section id="ipo-view"[\s\S]*?<\/section>\s*<\/main>|<section id="ipo-view"[\s\S]*?<\/section>/)?.[0];

test('the IPO module keeps its title but does not add a second page-level H1', () => {
  assert.ok(ipoSection, 'IPO view section exists');
  assert.match(ipoSection, /<h2>공모주 캘린더<\/h2>/, 'the IPO module heading stays visible as a section heading');
  assert.doesNotMatch(ipoSection, /<h1[\s>]/, 'the IPO module must not emit a second H1 next to #atlas-page-heading');
  assert.match(ipoSection, /class="ipo-back"[^>]*aria-label="통합 차트로 돌아가기"/, 'the back control and its accessible name are preserved');
  assert.doesNotMatch(ipoCss, /\.ipo-heading h1/, 'IPO styles target the section heading level');
  assert.match(ipoCss, /\.ipo-heading h2\s*\{[^}]*font-size:\s*17px/, 'the section heading keeps its 17px size');
});

test('the relay channel list label is a section heading, not a second H1', () => {
  assert.match(relayJs, /<header class="relay-rooms-head"><h2>채널<\/h2>/, 'the channel list keeps its label at section level');
  assert.doesNotMatch(relayJs, /<h1>채널<\/h1>/, 'the channel list must not emit a second H1');
  assert.match(relayCss, /\.relay-rooms-head h2\{[^}]*font-size:13px/, 'the channel label keeps its 13px size');
  assert.doesNotMatch(relayCss, /\.relay-rooms-head h1\{/, 'no leftover rule styles a channel H1');
});

test('the page keeps exactly one shell heading owner and its visible titles', () => {
  assert.equal((pageDescription.match(/heading\.id = 'atlas-page-heading'/g) || []).length, 1, 'the shell owns exactly one page heading element');
  assert.match(html, /공모주 캘린더/, 'the IPO title text is not hidden or deleted');
  assert.match(html, /aria-label="공모주 캘린더"/, 'the IPO region label is preserved');
});

test('the phone chart toolbar gives the reset control a 44px touch floor', () => {
  const phone = topLevelBlocks(shellCss).filter(block => /@media\s*\(/.test(block.prelude) && /max-width:\s*620px/.test(block.prelude));
  assert.ok(phone.length > 0, 'atlas-shell.css keeps its 620px block');
  const owner = phone.find(block => /body\[data-shell=chart\] \.chart-toolbar \.chart-options \.icon-button\{[^}]*min-width:44px/.test(block.body));
  assert.ok(owner, 'the 620px chart block must give .chart-options .icon-button a 44px minimum width');
  assert.match(owner.body, /body\[data-shell=chart\] \.chart-toolbar \.chart-options \.icon-button\{[^}]*width:44px/, 'the touch floor also pins the width');
  const links = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"?]+)/g)].map(match => match[1]);
  assert.ok(links.indexOf('styles.css') < links.indexOf('atlas-shell.css'), 'the shell stylesheet must load after styles.css so the touch floor wins');
});
