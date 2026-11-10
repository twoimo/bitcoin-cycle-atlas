import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {atlasNavigationPages} from '../dist/atlas-navigation.js';
import {atlasPageDescription, mountPageDescription} from '../dist/ui/page-description.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({page='outlook', center, embedded=false, toolbar=true} = {}) {
  const {document, window} = parseHTML(`<html><body data-page="${page}"${center ? ` data-center-tool="${center}"` : ''}${embedded ? ' data-embedded="true"' : ''}>
    <header class="atlas-dashboard-header"><button id="sidebar-toggle">목록</button><h1 class="atlas-shell-heading"></h1></header>
    <div class="workspace"><main><section class="atlas-chart-stage">${toolbar ? '<header class="atlas-canvas-heading" style="height:48px"><button id="symbol" aria-label="TQQQ 종목 선택">삼플레</button><select id="interval" aria-label="TQQQ 가격 간격"><option value="daily">일봉</option></select></header>' : ''}<div class="atlas-plot"><svg aria-label="관측 가격"></svg></div></section></main></div></body></html>`);
  const header = document.querySelector('.atlas-dashboard-header');
  const heading = header.querySelector('h1');
  const controller = mountPageDescription(document, {header, heading});
  return {document, window, header, heading, controller};
}

test('the six destinations and saved comparison page describe their actual basis without a shared refresh promise', () => {
  assert.deepEqual(atlasNavigationPages.map(page => atlasPageDescription(page).title), ['가격 차트','시장 분석','리서치','자산 비교','공모주','릴레이 콘텐츠']);
  for (const page of [...atlasNavigationPages, {id:'compare'}]) {
    const info = atlasPageDescription(page);
    assert.ok(info.description.length > 15);
    assert.doesNotMatch(info.description, /15분|실시간/);
  }
  assert.match(atlasPageDescription('compare').description, /반감일.*일별 종가\(UTC\)/);
  for (const page of ['rsi','housing','themes']) assert.equal(atlasPageDescription(page), atlasPageDescription('outlook'));
  for (const page of ['market-kr','scenario','cashflow']) assert.equal(atlasPageDescription(page), atlasPageDescription('market-us'));
});

test('one described h1 follows chart and dashboard destinations while original controls retain their listeners and labels', () => {
  const f = fixture();
  try {
    const {document, window, controller, header, heading} = f;
    const toolbar = document.querySelector('.atlas-canvas-heading');
    const controls = [...toolbar.children];
    const initialToolbar = toolbar.outerHTML;
    const copy = heading.parentElement;
    const description = document.getElementById(heading.getAttribute('aria-describedby'));
    let clicks = 0;
    controls[0].addEventListener('click', () => clicks++);
    for (const page of ['outlook','market-us','rsi','evidence','data','ipo','relay','housing']) {
      document.body.dataset.centerTool = page;
      controller.sync();
      assert.equal(heading.textContent, atlasPageDescription(page).title);
      assert.equal(description.textContent, atlasPageDescription(page).description);
      assert.equal(document.querySelectorAll('#atlas-page-description').length, 1);
      assert.equal(toolbar.nextElementSibling, copy);
      assert.equal(copy.closest('.atlas-plot'), null, 'page introduction cannot obscure chart observations');
      assert.equal(copy.hidden, false);
      assert.equal(toolbar.outerHTML, initialToolbar);
      assert.deepEqual([...toolbar.children], controls);
    }
    controls[0].dispatchEvent(new window.Event('click'));
    assert.equal(clicks, 1);
    document.body.dataset.page = 'compare';
    controller.sync();
    assert.equal(copy.parentElement === toolbar.parentElement, true, 'compare stays in the shared chart frame');
    assert.equal(toolbar.nextElementSibling === copy, true, 'one introduction follows the real compare toolbar');
    assert.equal(copy.parentElement === header, false, 'compare no longer uses the dashboard composition');
    assert.equal(heading.textContent, '사이클 비교', 'direct page owns the introduction even with a stale center id');
    assert.match(description.textContent, /일별 종가\(UTC\)/);
    assert.equal(document.querySelectorAll('h1[aria-describedby="atlas-page-description"]').length, 1);
  } finally {f.controller.destroy();}
});

test('late BTC construction and native replacement move the same introduction after the new toolbar', async () => {
  const f = fixture({center:'rsi', toolbar:false});
  try {
    const {document, controller, heading} = f;
    const copy = heading.parentElement;
    assert.equal(copy.hidden, true);
    const stage = document.querySelector('.atlas-chart-stage');
    const toolbar = document.createElement('header');toolbar.className = 'atlas-canvas-heading';
    toolbar.innerHTML = '<button aria-label="TQQQ 종목 선택">삼플레</button>';
    stage.prepend(toolbar);
    await settle();
    assert.equal(toolbar.nextElementSibling, copy);
    assert.equal(copy.hidden, false);
    const app = document.createElement('main');app.className = 'native-chart-workbench';
    app.innerHTML = '<header class="eth-topbar atlas-canvas-heading"><button aria-label="ETHUSD 종목 선택">이더리움</button></header><div class="eth-plot atlas-plot"></div>';
    document.querySelector('.workspace').replaceChildren(app);
    delete document.body.dataset.centerTool;
    await settle();
    const nextToolbar = app.querySelector('.atlas-canvas-heading');
    assert.equal(nextToolbar.nextElementSibling, copy);
    assert.equal(document.querySelector('#atlas-page-heading'), heading);
    assert.equal(document.querySelectorAll('[data-page-intro]').length, 1);
    controller.destroy();
    assert.equal(document.querySelector('[data-page-intro]'), null);
    app.replaceChildren(toolbar);
    await settle();
    assert.equal(document.querySelector('[data-page-intro]'), null, 'disposal does not resurrect the intro');
  } finally {f.controller.destroy();}
});

test('an embedded child leaves page context to its parent and keeps existing content intact', () => {
  const f = fixture({embedded:true});
  const before = f.document.body.innerHTML;
  f.controller.sync();f.controller.destroy();
  assert.equal(f.document.body.innerHTML, before);
  assert.equal(f.document.querySelector('[data-page-intro]'), null);
  assert.equal(f.heading.hasAttribute('aria-describedby'), false);
});
