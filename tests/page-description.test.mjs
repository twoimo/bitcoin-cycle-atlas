import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {atlasNavigationPages} from '../dist/atlas-navigation.js';
import {atlasPageDescription, mountPageDescription} from '../dist/ui/page-description.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({page='outlook', center, market, embedded=false, retained=false, toolbar=true} = {}) {
  const {document, window} = parseHTML(`<html><body data-page="${page}"${center ? ` data-center-tool="${center}"` : ''}${embedded ? ' data-embedded="true"' : ''}>
    <header class="atlas-dashboard-header"><button id="sidebar-toggle">목록</button><h1 class="atlas-shell-heading"></h1></header>
    <div class="workspace"><main><section class="atlas-chart-stage">${toolbar ? '<header class="atlas-canvas-heading" style="height:48px"><button id="symbol" aria-label="TQQQ 종목 선택">삼플레</button><select id="interval" aria-label="TQQQ 가격 간격"><option value="daily">일봉</option></select></header>' : ''}<div class="atlas-plot"><svg aria-label="관측 가격"></svg></div></section></main></div>${retained ? '<script id="embedded-btc-data" type="application/json">{}</script>' : ''}</body></html>`);
  if (market) document.body.dataset.market = market;
  const header = document.querySelector('.atlas-dashboard-header');
  const heading = header.querySelector('h1');
  const controller = mountPageDescription(document, {header, heading});
  const emit = (name, detail) => document.dispatchEvent(new window.CustomEvent(name, {detail}));
  return {document, window, header, heading, controller, emit};
}

test('the six destinations and saved comparison page disclose their own purpose, source and refresh basis', () => {
  assert.deepEqual(atlasNavigationPages.map(page => atlasPageDescription(page).title), ['가격 차트','시장 분석','리서치','자산 비교','공모주','릴레이 콘텐츠']);
  const contracts = [
    ['outlook', /가격/, [/Coin Metrics/, /공개본 6시간 확인/]],
    ['market-us', /시장|성장.*금리.*심리/, [/FRED/, /한은|한국은행/, /Yahoo/, /저장|보존/, /수동/]],
    ['evidence', /자료|근거|리서치/, [/공시|논문|기사/, /게시/]],
    ['data', /비교/, [/자산별|종목별/, /일.*종가|일별/, /수동/]],
    ['ipo', /청약|공모/, [/KST|한국 날짜/, /보존/, /새로고침/]],
    ['relay', /글|기사|콘텐츠|메시지.*발행물/, [/RelayDeck/, /보존/, /수동/]],
    ['compare', /기준일.*사이클.*비교/, [/일.*종가|일별/, /UTC/, /공개본 6시간 확인/]],
  ];
  for (const [page, purpose, basis] of contracts) {
    const info = atlasPageDescription(page);
    assert.match(info.purpose, purpose, page);
    for (const token of basis) assert.match(info.basis, token, `${page} basis`);
    assert.ok(info.description.includes(info.purpose));
    assert.ok(info.description.includes(info.basis));
    assert.doesNotMatch(info.description, /15분|실시간/);
  }
  for (const page of ['rsi','housing','themes']) assert.equal(atlasPageDescription(page).id, 'outlook', 'specialized copy keeps its navigation group');
  for (const page of ['market-kr','scenario','cashflow']) assert.equal(atlasPageDescription(page).id, 'market');
  assert.match(atlasPageDescription('housing').description, /한국부동산원/);
  assert.match(atlasPageDescription('housing').description, /월별|월간/);
  assert.match(atlasPageDescription('themes').description, /Hyperliquid.*현물|현물.*Hyperliquid/);
  for (const page of ['scenario','cashflow']) {
    assert.match(atlasPageDescription(page).description, /입력/);
    assert.match(atlasPageDescription(page).description, /재계산/);
    assert.doesNotMatch(atlasPageDescription(page).description, /6시간|15분|실시간/);
  }
});

test('chart context separates native publication checks, manual providers and retained snapshots', () => {
  for (const frequency of ['daily','weekly']) {
    const info = atlasPageDescription('outlook', {symbol:'BTCUSD', frequency, chartType:'line'});
    assert.match(info.basis, /Coin Metrics/);assert.match(info.basis, /공개본 6시간 확인/);
    assert.doesNotMatch(info.basis, /6시간.*수집|6시간.*제공자.*갱신/);
  }
  for (const [page, context, provider] of [
    ['outlook', {symbol:'BTCUSD', frequency:'1h'}, /Coinbase/],
    ['outlook', {symbol:'ETHUSD', frequency:'daily'}, /Coinbase/],
    ...['MSTR','BMNR'].map(symbol => ['outlook', {symbol, frequency:'weekly'}, /Yahoo/]),
    ...['TQQQ','SOXL','233740'].map(symbol => ['rsi', {symbol, frequency:'daily'}, /Yahoo/]),
    ['housing', {symbol:'HOUSING-SEOUL', frequency:'monthly'}, /한국부동산원/],
    ['themes', {symbol:'HYPE', frequency:'daily'}, /Hyperliquid/],
  ]) {
    const info = atlasPageDescription(page, context);
    assert.match(info.basis, provider);assert.match(info.basis, /수동/);
    assert.doesNotMatch(info.description, /6시간|15분|실시간/);
  }
  const candles = atlasPageDescription('outlook', {symbol:'BTCUSD', frequency:'daily', chartType:'candles', source:'Bitstamp'});
  assert.match(candles.basis, /Bitstamp/);
  for (const page of ['outlook','compare']) {
    const info = atlasPageDescription(page, {symbol:'BTCUSD', frequency:'daily', retained:true});
    assert.match(info.basis, /보존/);assert.doesNotMatch(info.basis, /공개본 6시간 확인/);
  }
  const polling = atlasPageDescription('market-us', {refreshMode:'poll', refreshIntervalMs:60000});
  assert.match(polling.basis, /1분.*재조회/);
  assert.doesNotMatch(polling.basis, /1분.*수집|1분.*제공자.*갱신/);
  const manual = atlasPageDescription('market-us', {refreshMode:'manual', refreshIntervalMs:60000});
  assert.match(manual.basis, /수동/);assert.doesNotMatch(manual.basis, /1분.*재조회/);
  for (const refreshIntervalMs of [0, -60000, NaN]) {
    const invalid = atlasPageDescription('market-us', {refreshMode:'poll', refreshIntervalMs});
    assert.match(invalid.basis, /화면 요청 시 확인/);assert.doesNotMatch(invalid.basis, /(?:0|NaN|-1)분|실시간/);
  }
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
    const spans = [...description.children];
    assert.equal(spans.length, 2);assert.ok(spans.every(node => node.tagName === 'SPAN'));
    let clicks = 0;
    controls[0].addEventListener('click', () => clicks++);
    for (const page of ['outlook','market-us','rsi','evidence','data','ipo','relay','housing']) {
      document.body.dataset.centerTool = page;
      controller.sync();
      assert.equal(heading.textContent, atlasPageDescription(page).title);
      assert.equal(description.textContent, atlasPageDescription(page).description);
      assert.deepEqual([...description.children], spans, 'purpose and basis retain their owners across page switches');
      assert.equal(spans[0].textContent, atlasPageDescription(page).purpose);
      assert.equal(spans[1].textContent, atlasPageDescription(page).basis);
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
    assert.equal(copy.parentElement, header);
    assert.equal(heading.textContent, '사이클 비교', 'direct page owns the introduction even with a stale center id');
    assert.match(description.textContent, /일별 종가/);assert.match(description.textContent, /UTC/);
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

test('accepted page context follows the current symbol and rejects stale native or center updates', async () => {
  const f = fixture({market:'BTCUSD'});
  try {
    const {document, controller, heading, emit} = f;
    const copy = heading.parentElement, description = document.getElementById(heading.getAttribute('aria-describedby'));
    const spans = [...description.children];
    assert.match(description.textContent, /Coin Metrics/);assert.match(description.textContent, /공개본 6시간 확인/);
    emit('atlas:workbench-state', {frequency:'1h', chartType:'line', marketSeries:{source:'Coinbase Exchange'}});
    assert.match(description.textContent, /Coinbase/);assert.match(description.textContent, /수동/);assert.doesNotMatch(description.textContent, /6시간/);

    document.body.dataset.centerTool = 'rsi';emit('atlas:active-symbol', {symbol:'TQQQ'});controller.sync();
    assert.match(description.textContent, /Yahoo/);const rsiDescription = description.textContent;
    emit('atlas:workbench-state', {frequency:'daily', chartType:'line'});
    emit('atlas:readout', {symbol:'BTCUSD', frequency:'weekly', source:'Bitstamp'});
    assert.equal(description.textContent, rsiDescription, 'a hidden native chart cannot relabel an active ETF workspace');
    delete document.body.dataset.centerTool;controller.sync();
    assert.match(description.textContent, /Coinbase/);assert.doesNotMatch(description.textContent, /6시간/,
      'a late hidden daily update must not replace the retained native hourly context');

    document.body.dataset.market = 'ETHUSD';await settle();
    assert.match(description.textContent, /Coinbase/);
    document.body.dataset.market = 'MSTR';await settle();
    assert.match(description.textContent, /Yahoo/);assert.match(description.textContent, /수동/);
    emit('atlas:workbench-state', {symbol:'MSTR', frequency:'weekly', chartType:'line'});
    assert.match(description.querySelector('[data-page-purpose]').textContent, /1W/);
    const mstrDescription = description.textContent;
    emit('atlas:workbench-state', {frequency:'1h', chartType:'line', marketSeries:{source:'Coinbase Exchange'}});
    assert.equal(description.textContent, mstrDescription, 'the legacy BTC emitter has no authority after native MSTR replaces it');
    emit('atlas:workbench-state', {symbol:'UNKNOWN-OWNER', frequency:'1h', chartType:'line', source:'Coinbase Exchange'});
    assert.equal(description.textContent, mstrDescription, 'an unknown explicit owner cannot be interpreted as the current native symbol');
    document.body.dataset.centerTool = 'rsi';emit('atlas:active-symbol', {symbol:'TQQQ'});controller.sync();

    const purpose = description.querySelector('[data-page-purpose]');
    assert.doesNotMatch(purpose.textContent, /1D|1W/, 'a center has no invented interval before accepted chart state');
    emit('atlas:page-context', {page:'rsi', symbol:'TQQQ', frequency:'daily', chartType:'line'});
    assert.match(purpose.textContent, /1D/);const dailyDescription = description.textContent;
    emit('atlas:page-context', {page:'rsi', symbol:'TQQQ', frequency:'weekly', chartType:'candles'});
    assert.match(purpose.textContent, /1W/);assert.notEqual(description.textContent, dailyDescription);
    assert.equal(description.textContent, atlasPageDescription('rsi', {symbol:'TQQQ', frequency:'weekly', chartType:'candles'}).description);
    const currentDescription = description.textContent;
    emit('atlas:page-context', {page:'themes', symbol:'TQQQ', frequency:'daily', source:'Coinbase'});
    assert.equal(description.textContent, currentDescription, 'an old page cannot replace the accepted weekly basis');
    emit('atlas:page-context', {page:'rsi', symbol:'HYPE', frequency:'daily', source:'Hyperliquid'});
    assert.equal(description.textContent, currentDescription, 'another symbol cannot replace the accepted weekly basis');

    document.body.dataset.centerTool = 'market-us';controller.sync();
    assert.match(description.textContent, /FRED/);assert.match(description.textContent, /수동/);
    const marketDescription = description.textContent;
    emit('atlas:page-context', {page:'rsi', symbol:'TQQQ', frequency:'weekly'});
    assert.equal(description.textContent, marketDescription, 'the old center cannot overwrite the new market context');
    emit('atlas:page-context', {page:'market-us', symbol:'TQQQ', refreshMode:'poll', refreshIntervalMs:60000});
    assert.match(description.textContent, /1분 재조회/);
    document.body.dataset.centerTool = 'market-kr';controller.sync();
    assert.match(description.textContent, /수동/);assert.doesNotMatch(description.textContent, /1분 재조회/,
      'a different market does not inherit the last accepted US polling cadence');
    emit('atlas:page-context', {page:'market-us', symbol:'TQQQ', refreshMode:'poll', refreshIntervalMs:60000});
    assert.doesNotMatch(description.textContent, /1분 재조회/, 'a late US acknowledgement cannot relabel the current Korean market');
    emit('atlas:page-context', {page:'market-kr', symbol:'TQQQ', refreshMode:'poll', refreshIntervalMs:60000});
    assert.doesNotMatch(description.textContent, /1분 재조회/, 'only the US market owns its polling cadence');

    document.body.dataset.page = 'evidence';controller.sync();
    assert.equal(copy.parentElement, f.header);assert.match(description.textContent, /게시/);
    const directDescription = description.textContent;
    emit('atlas:page-context', {page:'market-us', symbol:'TQQQ', refreshMode:'poll', refreshIntervalMs:60000});
    emit('atlas:active-symbol', {symbol:'ETHUSD'});
    assert.equal(description.textContent, directDescription, 'direct page context wins over old chart ownership');
    assert.deepEqual([...description.children], spans);
    assert.equal(document.querySelectorAll('#atlas-page-description').length, 1);

    controller.destroy();document.body.dataset.market = 'BTCUSD';
    emit('atlas:page-context', {page:'evidence', symbol:'ETHUSD', refreshMode:'poll', refreshIntervalMs:60000});
    emit('atlas:active-symbol', {symbol:'BTCUSD'});await settle();
    assert.equal(document.querySelector('[data-page-intro]'), null);
    assert.equal(description.textContent, directDescription, 'disposed context listeners cannot mutate the detached copy');
  } finally {f.controller.destroy();}
});

test('a retained BTC document suppresses automatic publication checks in chart and comparison context', () => {
  const f = fixture({market:'BTCUSD', retained:true});
  try {
    const description = f.document.getElementById(f.heading.getAttribute('aria-describedby'));
    for (const page of ['outlook','compare']) {
      f.document.body.dataset.page = page;f.controller.sync();
      assert.match(description.textContent, /보존/);
      assert.doesNotMatch(description.textContent, /공개본 6시간 확인|15분|실시간/);
    }
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
