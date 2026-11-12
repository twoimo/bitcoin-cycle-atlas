import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createContentShell} from '../dist/content-shell.js';
import {readP0RootTokens} from '../scripts/ui-renewal-p0-contract.mjs';
import {SITE_STYLE_GROUPS} from '../scripts/build-site-styles.mjs';

// These are lifecycle/DOM models. Real rendered dimensions and trusted input
// are independently required by verify-ui-renewal-p1-browser.mjs.
function fixture() {
  const {document, window} = parseHTML(`<html><body data-shell="dashboard" data-page="relay">
    <header class="atlas-dashboard-header"><h1 id="atlas-page-heading" aria-describedby="page-description">릴레이 콘텐츠</h1><p id="page-description">원문 시각 기준</p></header>
    <aside class="atlas-sidebar"><nav class="atlas-nav" aria-label="주요 페이지"><button data-atlas-page="outlook">가격 차트</button><button data-atlas-page="relay">릴레이 콘텐츠</button></nav><span id="nav-next"></span></aside>
    <div class="workspace"><main id="main"><section id="relay-view"></section><footer class="footer"><button data-method>출처</button></footer></main></div>
    </body></html>`);
  const nav = document.querySelector('.atlas-nav'), footer = document.querySelector('.footer');
  let scrollLeft=0, clientWidth=200, scrollWidth=600, update;
  Object.defineProperties(nav, {
    clientWidth: {get: () => clientWidth}, scrollWidth: {get: () => scrollWidth},
    scrollLeft: {get: () => scrollLeft},
  });
  const moves=[];
  nav.scrollBy = options => {moves.push(options);scrollLeft=Math.max(0, Math.min(scrollWidth-clientWidth, scrollLeft+options.left));nav.dispatchEvent(new window.Event('scroll'));};
  const targets = new Set();
  window.ResizeObserver=class { constructor(callback) {update=callback;} observe(target) {targets.add(target);} disconnect() {targets.clear();} };
  const shell=createContentShell({document});
  const click=selector=>document.querySelector(selector).dispatchEvent(new window.Event('click', {bubbles:true}));
  return {document,window,nav,footer,shell,moves,targets,click,resize(width,total=scrollWidth) {clientWidth=width;scrollWidth=total;scrollLeft=Math.max(0,Math.min(scrollLeft,total-width));update();}};
}

test('header pill host moves the one original nav and restores its exact owner and listeners', () => {
  const f=fixture(), {document,nav,footer,shell}=f;
  const home=nav.parentElement, next=nav.nextElementSibling, original=[...nav.children];
  let clicks=0;original[1].addEventListener('click',()=>clicks++);
  for (let pass=0;pass<3;pass++) {
    shell.setActive(true);
    assert.equal(document.querySelectorAll('.atlas-nav').length,1);
    assert.equal(nav.parentElement.className,'atlas-dashboard-nav');
    assert.equal(nav.closest('header'),document.querySelector('.atlas-dashboard-header'));
    assert.deepEqual([...nav.children],original);
    assert.equal(shell.rail.hidden,true,'no empty sidebar/rail reservation');
    assert.equal(footer.parentElement,shell.bottom);
    assert.equal(document.querySelectorAll('h1').length,1,'header migration cannot clone the title');
    f.click('[data-atlas-page=relay]');
    shell.setActive(false);
    assert.equal(nav.parentElement,home);
    assert.equal(nav.nextElementSibling,next);
    assert.equal(footer.parentElement,document.getElementById('main'));
    assert.equal(document.querySelector('.atlas-dashboard-nav'),null);
    assert.equal(f.targets.size,0);
  }
  assert.equal(clicks,3);
});

test('pointer scroll controls expose both ends and disappear only when all nav content fits', () => {
  const f=fixture(), {document,nav,shell}=f;
  shell.setActive(true);
  const previous=document.querySelector('[data-shell-nav-scroll=previous]'),next=document.querySelector('[data-shell-nav-scroll=next]');
  assert.equal(previous.hidden,false);assert.equal(next.hidden,false);
  assert.equal(previous.disabled,true);assert.equal(next.disabled,false);
  assert.equal(previous.getAttribute('aria-controls'),nav.id);
  assert.equal(next.getAttribute('aria-controls'),nav.id);
  f.click('[data-shell-nav-scroll=next]');f.click('[data-shell-nav-scroll=next]');f.click('[data-shell-nav-scroll=next]');
  assert.equal(nav.scrollLeft,400);assert.equal(next.disabled,true);assert.equal(previous.disabled,false);
  f.click('[data-shell-nav-scroll=previous]');
  assert.equal(nav.scrollLeft,250);assert.equal(next.disabled,false);
  assert.ok(f.moves.every(move=>move.behavior==='instant'),'no smooth-scroll or reduced-motion mismatch');
  f.resize(800);
  assert.equal(previous.hidden,true);assert.equal(next.hidden,true);
  f.resize(200);
  assert.equal(previous.hidden,false);assert.equal(next.hidden,false);
  assert.equal(previous.disabled,true);assert.equal(next.disabled,false);
});

test('header nav migration preserves source readiness rather than enabling an empty sheet', () => {
  const {document,window,shell}=fixture();
  const source=document.querySelector('[data-method]');
  shell.setActive(true);
  assert.equal(source.disabled,true);
  document.body.dataset.comparison='ready';
  document.dispatchEvent(new window.Event('atlas:comparison'));
  assert.equal(source.disabled,false);
  shell.setActive(false);shell.setActive(true);
  assert.equal(source.disabled,false);
  assert.equal(document.querySelectorAll('.atlas-dashboard-nav').length,1);
});

test('P1 uses exact shared containers and appends only shell-scoped CSS after authored surfaces', () => {
  const tokens=readP0RootTokens(readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8'));
  assert.equal(tokens.get('--shell-container'),'1140px');
  assert.equal(tokens.get('--shell-container-wide'),'1280px');
  assert.equal(tokens.get('--pill-radius'),'999px');
  const source=readFileSync(new URL('../dist/ui/shell-layout.css',import.meta.url),'utf8');
  assert.equal(SITE_STYLE_GROUPS.at(-1).sources.at(-1),'ui/shell-layout.css');
  assert.match(source,/\[data-shell-width=wide\] #main \{ max-width: var\(--shell-container-wide\)/);
  assert.match(source,/border-radius: var\(--card-radius-md\)/);
  assert.match(source,/overflow-x: auto/);
  assert.match(source,/outline: 2px solid var\(--focus\)/);
  const card=source.match(/#main > :is\([^}]+\{([^}]+)\}/)?.[1];
  assert.ok(card);
  assert.doesNotMatch(card,/overflow\s*:/,'outer cards cannot clip source-owned popovers or replace their scroll owners');
  assert.doesNotMatch(source,/minRight|price-axis|\.atlas-plot|#lab-chart|\.eth-chart|\.equity-chart|linear-gradient|backdrop-filter/);
  const chartRules=[...source.matchAll(/body\[data-shell=chart\][^{]+\{([^}]+)\}/g)];
  assert.equal(chartRules.length,2);
  assert.equal(chartRules[0][1].trim(),'border-radius: var(--pill-radius);','chart nav paint cannot change chart geometry');
  assert.match(chartRules[1][0],/\[data-mobile-heading=phone-dock\]\s*>\s*#atlas-display-options/);
  assert.equal(chartRules[1][1].trim(),'display: inline-flex;','the original settings action can become visible without changing its geometry');
});
