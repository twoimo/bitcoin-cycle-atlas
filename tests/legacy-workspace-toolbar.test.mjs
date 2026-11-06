import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { mountLegacyWorkspaceToolbar } from '../dist/legacy-workspace-toolbar.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const dataMarkup = '<header class="daily-heading"><button id="asset-refresh" aria-label="가격 자료 갱신"><svg></svg><span>갱신</span></button><button id="asset-history-open" disabled>판단 이력</button><button id="daily-method-open">읽는 법</button><button id="export-raw" disabled>CSV</button></header>'
  + '<div class="asset-filters"><label><input id="asset-search" type="search" placeholder="종목명 · 심볼 검색"></label>'
  + '<select id="asset-sector-filter"><option value="all">전체 섹터</option><option value="digital">디지털 자산</option></select>'
  + '<select id="asset-group-filter"><option value="all">전체 자산군</option><option value="risk">위험 자산</option></select>'
  + '<select id="asset-columns"><option value="all">전체 지표</option><option value="risk">위험·표본</option></select>'
  + '<select id="asset-sort"><option value="default">기본 순서</option><option value="name">종목명순</option></select><button id="asset-filter-reset">초기화</button></div>'
  + '<div class="asset-table-summary"><span id="asset-visible-count">표시 20 / 전체 20개</span><span>가격 USD · HYPE USDC</span></div>'
  + '<div id="asset-context" hidden></div><nav class="asset-mobile-nav"><button id="asset-scroll-start">표본·평균</button><button id="asset-scroll-end">가격·판단</button></nav>'
  + '<div id="asset-table-scroll" aria-busy="false"></div><dialog id="daily-method-dialog"><button>닫기</button></dialog><dialog id="asset-history-dialog"></dialog>';
const ipoMarkup = '<header class="ipo-heading"><input class="ipo-search" type="search" placeholder="종목·주간사 검색">'
  + '<button data-ipo-filter="upcoming" aria-pressed="true">예정</button><button data-ipo-filter="closed" aria-pressed="false">마감</button><button data-ipo-filter="all" aria-pressed="false">전체</button>'
  + '<details class="ipo-source-disclosure"><summary>출처</summary><div class="ipo-source-panel"><div id="ipo-source">원자료 수집 2026-11-07</div><p>일정 출처 <a href="./source">원문</a></p></div></details></header>'
  + '<nav class="ipo-calendar-nav"><button data-ipo-page="previous" aria-label="이전 장" disabled>이전</button><span class="ipo-page-label">2026년 11월</span><button data-ipo-page="next" aria-label="다음 장">다음</button>'
  + '<button data-ipo-page="today" aria-pressed="true">이번 달</button><button data-ipo-page="list" aria-pressed="false">전체 목록</button><span class="ipo-month-summary">청약 4종목 · 수요예측 2종목</span></nav>'
  + '<p class="ipo-calendar-message" hidden></p><div class="ipo-pages"><span class="ipo-count">6 / 20건</span></div>';
const evidenceMarkup = '<div class="evidence-controls"><input id="evidence-search" type="search"><select id="evidence-asset"><option value="all">전체 종목</option><option value="ETHUSD">ETHUSD</option></select>'
  + '<select id="evidence-filter"><option value="all">전체 분류</option><option value="paper">논문</option></select><button id="evidence-clear" disabled>초기화</button></div>'
  + '<div class="evidence-table-shell"><span id="evidence-total">30 / 60개</span></div><nav class="evidence-pagination"><button id="evidence-prev" disabled>이전</button><span id="evidence-progress">1–10 / 30</span><button id="evidence-more">다음</button></nav>';

// Linkedom supplies DOM ownership/events, but not native form value setters or
// dialog methods. These shims are deliberately unrelated to toolbar forwarding.
function browserElements(document) {
  const create = document.createElement.bind(document);
  function extend(node) {
    if (node.tagName === 'SELECT' && !Object.hasOwn(node, 'value')) {
      let value;
      Object.defineProperty(node, 'value', { configurable: true,
        get() { const option = this.querySelector('option[selected]') || this.querySelector('option'); return value ?? option?.getAttribute('value') ?? option?.textContent ?? ''; },
        set(next) { value = String(next); },
      });
    }
    if (node.tagName === 'DIALOG' && !node.showModal) {
      Object.defineProperty(node, 'open', { get() { return this.hasAttribute('open'); } });
      node.showModal = () => node.setAttribute('open', '');
      node.close = () => {
        if (!node.open) return;
        node.removeAttribute('open'); node.dispatchEvent(new document.defaultView.Event('close', { bubbles: true }));
      };
    }
    return node;
  }
  document.createElement = tag => extend(create(tag));
  document.querySelectorAll('select,dialog').forEach(extend);
}
function childDocument(page, markup) {
  const { document } = parseHTML('<html><head><base href="https://atlas.test/bitcoin-cycle-atlas/"></head><body data-page="' + page + '"><section id="' + page + '-view">' + markup + '</section></body></html>');
  browserElements(document); return document;
}
function fixture(page = 'data', markup = dataMarkup) {
  const { document } = parseHTML('<html><body><header class="atlas-canvas-heading"><div id="atlas-center-toolbar-' + page + '"><span id="retained-host-node"></span></div></header><iframe src="/?page=' + page + '&embedded=1"></iframe></body></html>');
  browserElements(document);
  let child = childDocument(page, markup), active = true;
  const frame = document.querySelector('iframe'), host = document.querySelector('[id^="atlas-center-toolbar-"]'), heading = document.querySelector('header');
  frame.dataset.toolbarId = host.id;
  Object.defineProperty(frame, 'contentDocument', { configurable: true, get: () => child });
  const toolbar = mountLegacyWorkspaceToolbar({ frame, heading, host, page, isActive: () => active });
  return { document, frame, host, toolbar, get child() { return child; }, setActive(value) { active = value; },
    replaceChild(next) { child = next; frame.dispatchEvent(new document.defaultView.Event('load')); },
  };
}
function change(document, selector, value, type = 'change') {
  const node = document.querySelector(selector); node.value = value;
  node.dispatchEvent(new document.defaultView.Event(type, { bubbles: true })); return node;
}

test('data mirrors keep delegated event owners and exact values, counts, disabled states and CSV routing', async t => {
  const f = fixture(); t.after(() => f.toolbar.destroy());
  const sourceRoot = f.child.querySelector('#data-view'), originalInput = f.child.getElementById('asset-search');
  const originalParent = originalInput.parentElement, events = [], clicks = [];
  sourceRoot.addEventListener('input', event => events.push([event.target.id, event.target.value, event.target.ownerDocument]));
  sourceRoot.addEventListener('change', event => {
    events.push([event.target.id, event.target.value, event.target.ownerDocument]);
    if (event.target.id === 'asset-sector-filter') {
      f.child.getElementById('asset-visible-count').textContent = '표시 3 / 전체 20개';
      f.child.getElementById('export-raw').disabled = false;
      f.child.getElementById('export-raw').setAttribute('aria-label', '표시된 3개 자산 CSV 내려받기');
    }
  });
  sourceRoot.addEventListener('click', event => {
    clicks.push(event.target.id);
    if (event.target.id === 'asset-filter-reset') {
      originalInput.value = ''; f.child.getElementById('asset-sector-filter').value = 'all';
      f.child.getElementById('asset-visible-count').textContent = '표시 20 / 전체 20개';
    }
  });
  assert.equal(f.child.body.dataset.centerToolbarHosted, 'true');
  assert.equal(f.child.body.dataset.centerToolbarPage, 'data');
  assert.equal(f.document.getElementById('center-export-raw').disabled, true);
  change(f.document, '#center-asset-search', '이더리움', 'input');
  change(f.document, '#center-asset-sector-filter', 'digital');
  change(f.document, '#center-asset-columns', 'risk');
  await settle();
  assert.equal(originalInput.parentElement, originalParent);
  assert.equal(originalInput.ownerDocument, f.child);
  assert.deepEqual(events.map(([id, value]) => [id, value]), [['asset-search', '이더리움'], ['asset-sector-filter', 'digital'], ['asset-columns', 'risk']]);
  assert.ok(events.every(([, , owner]) => owner === f.child));
  assert.equal(f.document.getElementById('center-asset-visible-count').textContent, '표시 3 / 전체 20개');
  const csv = f.document.getElementById('center-export-raw');
  assert.equal(csv.disabled, false); assert.equal(csv.getAttribute('aria-label'), '표시된 3개 자산 CSV 내려받기');
  csv.click(); assert.equal(clicks.at(-1), 'export-raw');
  f.document.getElementById('center-asset-filter-reset').click(); await settle();
  assert.equal(f.document.getElementById('center-asset-search').value, '');
  assert.equal(f.document.getElementById('center-asset-sector-filter').value, 'all');
  assert.equal(f.document.getElementById('center-asset-visible-count').textContent, '표시 20 / 전체 20개');
  const option = f.child.createElement('option'); option.value = 'new'; option.textContent = '새 섹터';
  f.child.getElementById('asset-sector-filter').append(option); await settle();
  assert.equal(f.document.querySelector('#center-asset-sector-filter option[value="new"]').textContent, '새 섹터');
  assert.equal(f.host.querySelector('.center-data-actions').children.length, 4);
  assert.equal(f.document.getElementById('center-asset-quote-summary').textContent, '가격 USD · HYPE USDC');
});

test('controls wait for lazy source initialization and restore only their own DOM on teardown', async () => {
  const f = fixture('data', '');
  assert.equal(f.child.body.dataset.centerToolbarHosted, undefined);
  assert.equal(f.host.querySelector('.legacy-workspace-toolbar'), null);
  f.child.querySelector('#data-view').innerHTML = dataMarkup; browserElements(f.child); await settle();
  assert.equal(f.child.body.dataset.centerToolbarHosted, 'true');
  assert.ok(f.document.getElementById('center-asset-search'));
  const input = f.child.getElementById('asset-search');
  f.toolbar.destroy(); await settle();
  assert.equal(f.host.querySelector('.legacy-workspace-toolbar'), null);
  assert.ok(f.document.getElementById('retained-host-node'));
  assert.equal(f.document.querySelector('.legacy-toolbar-dialog'), null);
  assert.equal(f.child.body.dataset.centerToolbarHosted, undefined);
  assert.equal(f.child.getElementById('asset-search'), input);
});

test('hidden, inactive, navigating and replaced frames cannot dispatch stale actions', async t => {
  const f = fixture(); t.after(() => f.toolbar.destroy());
  let calls = 0; const oldChild = f.child;
  oldChild.getElementById('asset-refresh').addEventListener('click', () => calls++);
  const oldButton = f.document.getElementById('center-asset-refresh');
  oldButton.click(); assert.equal(calls, 1);
  f.setActive(false); oldButton.click(); assert.equal(calls, 1);
  f.setActive(true); f.frame.hidden = true; oldButton.click(); await settle();
  assert.equal(calls, 1); assert.equal(oldChild.body.dataset.centerToolbarHosted, undefined);
  f.frame.hidden = false; await settle(); assert.equal(oldChild.body.dataset.centerToolbarHosted, 'true');
  f.frame.setAttribute('src', '/?page=ipo&embedded=1'); oldButton.click(); assert.equal(calls, 1);
  f.frame.setAttribute('src', '/?page=data&embedded=1');
  const next = childDocument('data', dataMarkup); let nextCalls = 0;
  next.getElementById('asset-refresh').addEventListener('click', () => nextCalls++);
  f.replaceChild(next); oldButton.click(); assert.equal(calls, 1);
  assert.equal(nextCalls, 0, 'detached old mirrors must not operate the replacement document');
  f.document.getElementById('center-asset-refresh').click(); assert.equal(nextCalls, 1);
  assert.equal(oldChild.body.dataset.centerToolbarHosted, undefined);
});

test('child and outer dialogs restore visible triggers only for the current frame', async t => {
  const f = fixture(); t.after(() => f.toolbar.destroy());
  const childDialog = f.child.getElementById('daily-method-dialog'), sourceButton = f.child.getElementById('daily-method-open');
  sourceButton.addEventListener('click', () => childDialog.showModal());
  const trigger = f.document.getElementById('center-daily-method-open'); let restored = 0;
  trigger.focus = () => restored++;
  trigger.click(); assert.equal(childDialog.open, true);
  childDialog.close(); await settle(); assert.equal(restored, 1);
  trigger.click(); f.setActive(false); childDialog.close(); await settle(); assert.equal(restored, 1);
  f.setActive(true);
  const settings = f.document.querySelector('[data-toolbar-open="filters"]'); let settingsFocus = 0;
  settings.focus = () => settingsFocus++; settings.click();
  const settingsDialog = f.document.getElementById(settings.getAttribute('aria-controls'));
  assert.equal(settingsDialog.open, true);
  settingsDialog.querySelector('.legacy-toolbar-dialog-heading button').click(); await settle();
  assert.equal(settingsDialog.open, false); assert.equal(settingsFocus, 1);
});

test('IPO calendar actions and live source disclosure retain their original owners', async t => {
  const f = fixture('ipo', ipoMarkup); t.after(() => f.toolbar.destroy());
  const owner = f.child.getElementById('ipo-view'), clicked = [], searched = [];
  owner.addEventListener('input', event => searched.push([event.target, event.target.value]));
  owner.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    clicked.push(button);
    if (button.dataset.ipoPage === 'next') {
      f.child.querySelector('.ipo-page-label').textContent = '2026년 12월';
      f.child.querySelector('.ipo-month-summary').textContent = '청약 1종목 · 수요예측 0종목';
      f.child.querySelector('[data-ipo-page="previous"]').disabled = false;
    }
    if (button.dataset.ipoFilter) for (const candidate of owner.querySelectorAll('[data-ipo-filter]'))
      candidate.setAttribute('aria-pressed', String(candidate === button));
  });
  assert.equal(f.document.querySelector('[data-ipo-page="previous"]').disabled, true);
  f.document.querySelector('[data-ipo-page="next"]').click(); await settle();
  assert.equal(clicked.at(-1), owner.querySelector('[data-ipo-page="next"]'));
  assert.equal(f.document.getElementById('center-ipo-page-label').textContent, '2026년 12월');
  assert.equal(f.document.querySelector('[data-ipo-page="previous"]').disabled, false);
  f.document.querySelector('[data-ipo-filter="all"]').click(); await settle();
  assert.equal(f.document.querySelector('[data-ipo-filter="all"]').getAttribute('aria-pressed'), 'true');
  assert.equal(f.document.querySelector('[data-ipo-filter="upcoming"]').getAttribute('aria-pressed'), 'false');
  change(f.document, '#center-ipo-search', '증권', 'input');
  assert.deepEqual(searched, [[owner.querySelector('.ipo-search'), '증권']]);
  f.document.querySelector('[data-toolbar-open="source"]').click();
  const disclosure = f.document.querySelector('.legacy-toolbar-source');
  assert.match(disclosure.textContent, /원자료 수집 2026-11-07/);
  assert.equal(disclosure.querySelector('a').getAttribute('href'), 'https://atlas.test/bitcoin-cycle-atlas/source');
  assert.equal(disclosure.querySelector('#ipo-source'), null);
  assert.equal(owner.querySelector('#ipo-source').parentElement.className, 'ipo-source-panel');
  owner.querySelector('#ipo-source').textContent = '원자료 수집 2026-11-08'; await settle();
  assert.match(disclosure.textContent, /원자료 수집 2026-11-08/);
  assert.equal(owner.querySelector('details').hasAttribute('open'), false, 'disclosure rendering does not move or toggle the hidden source owner');
});

test('research search, filters and paging mirror source-owned state without moving the reader actions', async t => {
  const f = fixture('evidence', evidenceMarkup); t.after(() => f.toolbar.destroy());
  const owner = f.child.getElementById('evidence-view'), received = [];
  for (const type of ['input', 'change']) owner.addEventListener(type, event => {
    received.push([event.target.id, event.target.value]);
    f.child.getElementById('evidence-clear').disabled = false;
  });
  f.child.getElementById('evidence-more').addEventListener('click', () => {
    f.child.getElementById('evidence-progress').textContent = '11–20 / 30';
    f.child.getElementById('evidence-prev').disabled = false;
  });
  assert.equal(f.document.getElementById('center-evidence-clear').disabled, true);
  change(f.document, '#center-evidence-search', '통화', 'input');
  change(f.document, '#center-evidence-asset', 'ETHUSD');
  change(f.document, '#center-evidence-filter', 'paper');
  f.document.getElementById('center-evidence-more').click(); await settle();
  assert.deepEqual(received, [['evidence-search', '통화'], ['evidence-asset', 'ETHUSD'], ['evidence-filter', 'paper']]);
  assert.equal(f.document.getElementById('center-evidence-progress').textContent, '11–20 / 30');
  assert.equal(f.document.getElementById('center-evidence-prev').disabled, false);
  assert.equal(f.document.getElementById('center-evidence-clear').disabled, false);
  assert.equal(owner.querySelector('.evidence-pagination #evidence-more'), f.child.getElementById('evidence-more'));
  assert.equal(f.child.body.dataset.centerToolbarPage, 'evidence');
});
