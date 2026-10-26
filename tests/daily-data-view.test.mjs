import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assetComparisonCsv, formatDailyPercent, initDailyDataView, renderAssetComparisonRows } from '../dist/daily-data-view.js';
import { COMPARISON_SYMBOLS, comparisonViewModel, dailyViewSurface, deferred } from './helpers/daily-data-view-fixture.mjs';

const symbols = markup => [...markup.matchAll(/data-asset-symbol="([^"]+)"/g)].map(match => match[1]);
function setup({ model = comparisonViewModel(), getter = async () => ({ retrievedAt: '2026-10-25T08:00:00Z' }), surface = dailyViewSurface(), ...options } = {}) {
  const view = initDailyDataView({ root: surface.root, getComparisonDataset: getter, buildModel: () => model, asOfDate: '2026-10-25', ...options });
  return { view, ui: surface, model };
}

// These tests verify the controller boundary; a real-browser pass verifies layout separately.
test('percentage formatting distinguishes missing, zero, signed values and sub-cent rounding', () => {
  for (const missing of [null, undefined, NaN, Infinity, '12']) assert.equal(formatDailyPercent(missing), '—');
  assert.equal(formatDailyPercent(-.0001), '0.00%');
  assert.equal(formatDailyPercent(1250.125), '+1,250.13%');
  assert.equal(formatDailyPercent(-12.5), '−12.50%');
  assert.equal(formatDailyPercent(-12.5, 1), '−12.5%');
});

test('opening the view creates exactly one grouped comparison table with all 18 assets', async () => {
  const { view, ui } = setup(); await view.render();
  assert.equal(view.state.status, 'ready');
  assert.equal((ui.root.innerHTML.match(/<table\b/g) || []).length, 1);
  assert.equal((ui.root.innerHTML.match(/<col\b/g) || []).length, 10);
  assert.match(ui.root.innerHTML, /colspan="3" scope="colgroup"[^>]*>종목명/);
  assert.match(ui.root.innerHTML, /<h1>자산 비교표/);
  assert.doesNotMatch(ui.root.innerHTML, /SMA|RSI|사이클 판단표|일별 원자료|cycle-scope|<select/);
  const table = ui.node('data-body').innerHTML;
  assert.deepEqual(symbols(table), COMPARISON_SYMBOLS);
  assert.deepEqual([...table.matchAll(/rowspan="(\d+)"/g)].map(match => Number(match[1])), [13, 4, 1]);
  assert.match(table, /asset-return-gain/); assert.match(table, /asset-return-loss/);
  assert.equal(symbols(table).length, 18);
  assert.doesNotMatch(table, /data-cycle|data-evidence|M7/);
  view.destroy();
});

test('the ready board removes the metadata strip without losing source and date disclosure', async () => {
  const { view, ui, model } = setup();
  assert.match(ui.root.innerHTML, /id="asset-context"[^>]*hidden/);
  await view.render();
  assert.equal(ui.node('asset-context').hidden, true);
  assert.equal(ui.node('asset-context').textContent, '');
  assert.equal(ui.node('asset-context').innerHTML, '');
  assert.equal(ui.node('asset-context').title, '');
  const css = readFileSync(new URL('../dist/daily-data.css', import.meta.url), 'utf8');
  assert.match(css, /\.asset-context\[hidden\] \{ display: none;/);
  ui.click('', { assetReason: 'BTC' });
  assert.match(ui.node('daily-method-content').innerHTML, /Example price source/);
  assert.match(ui.node('daily-method-content').innerHTML, /2026-01-02.*2026-10-23/);
  assert.match(assetComparisonCsv(model), /source_url/);
  assert.match(assetComparisonCsv(model), /https:\/\/example\.test\/prices\/BTC/);
  view.destroy();
});

test('the board has no footer, reserved footer styles or dangling note description', async () => {
  const { view, ui } = setup(); await view.render();
  assert.doesNotMatch(ui.root.innerHTML, /asset-table-footer|asset-table-meta|asset-color-key|asset-row-count|asset-sample-note|asset-table-note/);
  assert.match(ui.root.innerHTML, /<caption class="sr-only">18개 자산별/);
  const css = readFileSync(new URL('../dist/daily-data.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /asset-table-footer|asset-color-key|asset-row-count|asset-sample-note/);
  ui.click('daily-method-open');
  const content = ui.node('daily-method-content').innerHTML;
  assert.match(content, /평균 낙폭과 MDD는 다릅니다/);
  assert.match(content, /배당·분배금을 제외한 종가 기준/);
  assert.match(content, /미래의 저점·고점을 확정하지 않으며/);
  assert.match(content, /상장 첫해 일부 기간/);
  view.destroy();
});

test('each final cell uses an exact five-stage label and opens the relevant explanation', async () => {
  const { view, ui, model } = setup(); await view.render();
  const table = ui.node('data-body').innerHTML;
  for (const label of ['적극 매수', '분할 매수', '중립', '분할 매도', '적극 매도']) assert.match(table, new RegExp(`>${label}</button></td></tr>`));
  ui.click('', { assetReason: 'QQQ' });
  assert.equal(ui.node('daily-method-dialog').open, true);
  assert.match(ui.node('daily-method-content').innerHTML, /NASDAQ100 \(QQQ\) · 분할 매수/);
  assert.match(ui.node('daily-method-content').innerHTML, new RegExp(model.rows.find(row => row.symbol === 'QQQ').judgment.reason));
  assert.match(ui.node('daily-method-content').innerHTML, /−10\.00% 이하/);
  assert.match(ui.node('daily-method-content').innerHTML, /−5\.00% 초과, \+10\.00% 미만/);
  assert.match(ui.node('daily-method-content').innerHTML, /\+20\.00% 이상/);
  assert.doesNotMatch(ui.node('daily-method-content').innerHTML, /<table\b/);
  ui.click('daily-method-close'); assert.equal(ui.node('daily-method-dialog').open, false);
  ui.click('', { assetReason: 'missing' }); assert.equal(ui.node('daily-method-dialog').open, false);
  view.destroy();
});

test('identity headers and scroll hint retain one comparison table across screen sizes', () => {
  const { view, ui } = setup();
  const frame = ui.root.innerHTML;
  assert.equal((frame.match(/<table\b/g) || []).length, 1);
  assert.match(frame, /colspan="3" scope="colgroup" class="asset-identity-header">종목명/);
  assert.match(frame, /scope="col" class="asset-mobile-header asset-mobile-name-header">종목명/);
  assert.match(frame, /id="asset-scroll-hint">좌우로 밀어 수치와 맨 끝 판단을 확인하세요/);
  assert.match(frame, /id="asset-table-scroll"[^>]*aria-describedby="asset-scroll-hint"/);
  view.destroy();
});

test('mobile geometry fits the fixed name plus complete YTD and judgment without clipped previous values', () => {
  const css = readFileSync(new URL('../dist/daily-data.css', import.meta.url), 'utf8');
  const mobile = css.split('@media (max-width: 760px) {')[1].split('@media (max-width: 620px) {')[0];
  assert.match(mobile, /container-type: inline-size/);
  assert.match(mobile, /asset-comparison-table \{ width: calc\(100cqw \+ 432px\); min-width: calc\(100cqw \+ 432px\)/);
  assert.match(mobile, /asset-col-name \{ width: 120px;/);
  for (const key of ['ytd','judgment']) assert.ok(mobile.includes(`asset-col-${key} { width: calc(50cqw - 60px);`));
  for (const viewport of [320,390,700]) {
    const endWidth=(viewport/2-60)*2+120;
    assert.equal(endWidth,viewport,'fixed identity and complete final metrics fill the inner board width');
    assert.equal(120+60+180+192+2*(viewport/2-60),viewport+432,'table width equals the visible column sum');
  }
  assert.match(mobile, /asset-mobile-category-header, [^}]*asset-category \{ display: none;/);
  assert.match(css.split('@media')[0], /asset-mobile-name-header \{ position: sticky; left: 0;/);
  assert.match(mobile, /asset-name-label \{[^}]*white-space: normal;/);
  assert.match(mobile, /scroll-snap-type: x mandatory; scroll-padding-inline-start: 120px;/);
});

test('headers use actual observed trading dates and sample cells disclose partial first years', async () => {
  const { view, ui } = setup(); await view.render();
  assert.match(ui.node('asset-start-header').innerHTML, /2026\.01\.02/);
  assert.match(ui.node('asset-latest-header').innerHTML, /2026\.10\.23/);
  assert.match(ui.node('asset-ytd-header').innerHTML, /2026년/);
  assert.doesNotMatch(ui.node('asset-latest-header').innerHTML, /03\.25|현재가/);
  assert.match(ui.node('data-body').innerHTML, /2016–2025 · 10개 연도/);
  assert.match(ui.node('data-body').innerHTML, /첫해는 2016-03-02부터의 일부 기간/);
  assert.match(ui.node('data-body').innerHTML, /<sup aria-hidden="true">\*<\/sup>/);
  ui.click('daily-method-open');
  assert.match(ui.node('daily-method-content').innerHTML, /올해 자료는 이 평균에 넣지 않습니다/);
  view.destroy();
});

test('unequal dates are labeled per asset instead of asserting a shared observation date', async () => {
  const model = comparisonViewModel();
  model.rows[1].latestDate = '2026-10-22'; model.rows[1].yearStartDate = '2026-01-05';
  const { view, ui } = setup({ model }); await view.render();
  assert.match(ui.node('asset-start-header').innerHTML, /종목별 기준일/);
  assert.match(ui.node('asset-latest-header').innerHTML, /종목별 기준일/);
  assert.match(ui.node('data-body').innerHTML, /asset-cell-date">2026\.10\.22/);
  assert.match(ui.node('data-body').innerHTML, /asset-cell-date">2026\.01\.05/);
  assert.equal(ui.node('asset-context').hidden, true);
  view.destroy();
});

test('loading is lazy while hidden and repeated visible calls share the same pending request', async () => {
  const gate = deferred(), surface = dailyViewSurface({ hidden: true }); let reads = 0, builds = 0;
  const { view, ui } = setup({ surface, getter: () => { reads++; return gate.promise; }, buildModel: () => { builds++; return comparisonViewModel(); } });
  assert.equal(reads, 0); await view.render(); assert.equal(reads, 0);
  ui.root.hidden = false;
  const pending = view.render(); assert.equal(view.render(), pending);
  await ui.settle(); assert.equal(reads, 1); assert.equal(builds, 0);
  assert.equal(view.state.status, 'loading'); assert.equal(ui.node('export-raw').disabled, true);
  assert.equal(ui.node('asset-context').hidden, false);
  assert.deepEqual(symbols(ui.node('data-body').innerHTML), []);
  gate.resolve({ retrievedAt: '2026-10-25T08:00:00Z' }); await pending;
  assert.equal(builds, 1); assert.equal(view.state.status, 'ready');
  view.destroy();
});

test('failed fetch clears rows and export, does not retry on resize, and explicit retry recovers', async () => {
  let broken = false, reads = 0; const downloads = [];
  const { view, ui } = setup({ getter: async () => { reads++; if (broken) throw new Error('network offline'); return {}; }, download: (...args) => downloads.push(args) });
  await view.render(); assert.equal(ui.node('export-raw').disabled, false);
  broken = true; await view.refresh();
  assert.equal(view.state.status, 'error'); assert.equal(ui.node('export-raw').disabled, true);
  assert.deepEqual(symbols(ui.node('data-body').innerHTML), []);
  assert.match(ui.node('data-body').innerHTML, /id="asset-retry"/);
  assert.match(ui.node('asset-context').title, /network offline/);
  assert.equal(ui.node('asset-context').hidden, false);
  ui.click('export-raw'); assert.equal(downloads.length, 0);
  await view.render(); await view.render(); assert.equal(reads, 2);
  broken = false; ui.click('asset-retry'); await view.render();
  assert.equal(reads, 3); assert.equal(view.state.status, 'ready');
  assert.equal(ui.node('export-raw').disabled, false);
  assert.doesNotMatch(ui.node('asset-context').title, /network offline/);
  assert.equal(ui.node('asset-context').hidden, true);
  assert.deepEqual(symbols(ui.node('data-body').innerHTML), COMPARISON_SYMBOLS);
  view.destroy();
});

test('synchronous getter and model failures resolve after painting the error state', async () => {
  for (const options of [{ getter() { throw new Error('sync source failure'); } }, { buildModel() { throw new Error('bad price series'); } }]) {
    const { view, ui } = setup(options);
    assert.equal(await view.render(), null); assert.equal(view.state.status, 'error');
    assert.match(ui.node('data-body').innerHTML, /자료를 확인할 수 없어/);
    assert.equal(ui.node('export-raw').disabled, true);
    assert.equal(ui.node('asset-table-scroll').getAttribute('aria-busy'), 'false');
    view.destroy();
  }
});

test('the refresh button gets new data and immediately clears an old CSV and open judgment explanation', async () => {
  let offset = 0, reads = 0; const next = deferred(), downloads = [];
  const { view, ui } = setup({ getter: () => { reads++; return reads === 1 ? { offset } : next.promise; }, buildModel: bundle => comparisonViewModel({ offset: bundle.offset }), download: (name, blob) => downloads.push({ name, blob }) });
  await view.render(); const before = ui.node('data-body').innerHTML;
  ui.click('', { assetReason: 'QQQ' }); assert.match(ui.node('daily-method-content').innerHTML, /NASDAQ100 \(QQQ\) · 분할 매수/);
  ui.click('asset-refresh'); const pending = view.render();
  assert.equal(ui.node('asset-refresh').disabled, true); assert.equal(ui.node('export-raw').disabled, true);
  assert.deepEqual(symbols(ui.node('data-body').innerHTML), []);
  assert.doesNotMatch(ui.node('daily-method-content').innerHTML, /NASDAQ100 \(QQQ\) · 분할 매수/);
  ui.click('export-raw'); ui.click('asset-refresh'); await ui.settle();
  assert.equal(downloads.length, 0); assert.equal(reads, 2);
  offset = 700; next.resolve({ offset }); await pending;
  assert.equal(ui.node('asset-refresh').disabled, false); assert.equal(ui.node('export-raw').disabled, false);
  assert.notEqual(ui.node('data-body').innerHTML, before); assert.match(ui.node('data-body').innerHTML, />800\.00</);
  view.destroy();
});

test('a partial or duplicate asset result fails closed rather than silently dropping assets', async () => {
  for (const alter of [model => model.rows.pop(), model => { model.rows[16] = model.rows[0]; }]) {
    const model = comparisonViewModel(); alter(model);
    const { view, ui } = setup({ model, download() {} }); await view.render();
    assert.equal(view.state.status, 'error'); assert.deepEqual(symbols(ui.node('data-body').innerHTML), []);
    assert.equal(ui.node('export-raw').disabled, true); view.destroy();
  }
});

test('unavailable samples never become neutral; individual observed prices remain readable', async () => {
  const model = comparisonViewModel();
  model.rows[0].judgment = { id: 'unavailable', label: '판단 보류', reason: '자료가 오래되었습니다.', available: false };
  model.rows[1].sampleYears = 4;
  model.rows[2].meanRisePct = 0;
  model.rows[3].coverage.complete = false;
  const { view, ui } = setup({ model }); await view.render();
  assert.equal(view.state.status, 'ready');
  const table = ui.node('data-body').innerHTML;
  assert.equal((table.match(/>판단 보류<\/button>/g) || []).length, 4);
  assert.deepEqual(symbols(table), COMPARISON_SYMBOLS);
  assert.match(table, /최근 관측 종가">85\.00/);
  ui.click('', { assetReason: 'BTC' });
  assert.match(ui.node('daily-method-content').innerHTML, /자료가 오래되었습니다/);
  assert.match(assetComparisonCsv(model), /자료가 오래되었습니다/);
  view.destroy();
});

test('CSV contains the same 18 rows, unrounded metrics, provenance, boundaries and price dates', async () => {
  const downloads = [], model = comparisonViewModel(); model.rows[0].meanRisePct = 20.123456789;
  const { view, ui } = setup({ model, download: (name, blob) => downloads.push({ name, blob }) }); await view.render();
  ui.click('export-raw'); assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, 'asset-comparison-2026-10-25.csv');
  const csv = await downloads[0].blob.text();
  assert.equal(csv.trimEnd().split('\r\n').length, 19);
  assert.match(csv, /mean_annual_fall_pct_not_mdd/); assert.match(csv, /20\.123456789/);
  assert.match(csv, /2026-01-02,100,2026-10-23,85,-15,적극 매수/);
  assert.match(csv, /current year excluded/); assert.match(csv, /https:\/\/example\.test\/prices\/SPY/);
  assert.match(csv, /strong_buy_threshold_pct/); assert.doesNotMatch(csv, /SMA|RSI/);
  view.destroy();
});

test('method explains MDD distinction, operational boundaries, sample years and sources without another table', async () => {
  const { view, ui } = setup(); await view.render(); ui.click('daily-method-open');
  const content = ui.node('daily-method-content').innerHTML;
  assert.equal(ui.node('daily-method-dialog').open, true);
  assert.match(content, /100 → 150 → 120/); assert.match(content, /MDD는 −20%/);
  assert.match(content, /D &lt; r ≤ D ÷ 2/); assert.match(content, /U ÷ 2 ≤ r &lt; U/);
  assert.match(content, /상장 첫해 일부 기간/); assert.match(content, /5개 연도 미만/);
  assert.match(content, /종목별 출처·표본 범위 \(18개\)/);
  assert.match(content, /총수익률/); assert.doesNotMatch(content, /<table\b|SMA|RSI/);
  view.destroy();
});

test('untrusted names and explanations are escaped and CSV spreadsheet formulas are neutralized', async () => {
  const model = comparisonViewModel(), row = model.rows[0];
  row.name = '<img src=x onerror=alert(1)>'; row.judgment.reason = ' =1+1,"source"';
  row.source.name = '@IMPORTXML'; row.source.url = 'javascript:alert(1)';
  const markup = renderAssetComparisonRows(model.rows);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(markup, /<img/);
  assert.match(assetComparisonCsv(model), /' =1\+1/); assert.match(assetComparisonCsv(model), /""source""/);
  assert.match(assetComparisonCsv(model), /'@IMPORTXML/);
  const { view, ui } = setup({ model }); await view.render(); ui.click('daily-method-open');
  assert.doesNotMatch(ui.node('daily-method-content').innerHTML, /href="javascript:|<img/);
  view.destroy();
});

test('a superseded request cannot replace newer data or surface its obsolete error', async () => {
  const first = deferred(), second = deferred(); let reads = 0;
  const { view, ui } = setup({ getter: () => ++reads === 1 ? first.promise : second.promise, buildModel: bundle => comparisonViewModel({ offset: bundle.offset }) });
  const oldPending = view.render(); await ui.settle();
  const newPending = view.refresh(); await ui.settle();
  second.resolve({ offset: 700 }); await newPending; const newer = ui.snapshot();
  first.reject(new Error('obsolete error')); await oldPending;
  assert.deepEqual(ui.snapshot(), newer); assert.equal(view.state.status, 'ready');
  assert.match(newer.table, />800\.00</); view.destroy();
});

test('destroy cancels pending effects, removes actions and makes further renders inert', async () => {
  const gate = deferred(), downloads = []; let builds = 0;
  const { view, ui } = setup({ getter: () => gate.promise, buildModel: () => { builds++; return comparisonViewModel(); }, download: name => downloads.push(name) });
  const pending = view.render(); await ui.settle(); const before = ui.snapshot();
  view.destroy(); gate.resolve({}); await pending;
  assert.equal(builds, 0); assert.deepEqual(ui.snapshot(), before);
  await view.render(); ui.click('export-raw'); ui.click('daily-method-open');
  assert.equal(downloads.length, 0); assert.equal(ui.node('daily-method-dialog').open, false);
});

test('invalid comparison dates fail visibly before any source request', async () => {
  for (const asOfDate of ['2026-02-30', 'invalid', () => { throw new Error('clock unavailable'); }]) {
    let reads = 0; const { view, ui } = setup({ asOfDate, getter: () => { reads++; return {}; } });
    assert.equal(await view.render(), null); assert.equal(reads, 0); assert.equal(view.state.status, 'error');
    assert.deepEqual(symbols(ui.node('data-body').innerHTML), []); view.destroy();
  }
});

test('comparison uses the shared chart theme and keeps navigation and actions in one heading', () => {
  const {view, ui} = setup();
  assert.match(ui.root.innerHTML, /class="daily-heading"><button[^>]*class="daily-back"/);
  assert.match(ui.root.innerHTML, /MARKET BOARD/);
  assert.match(ui.root.innerHTML, /aria-label="통합 차트로 돌아가기"/);
  assert.match(ui.root.innerHTML, /aria-label="18개 자산 CSV 내려받기"/);
  const css = readFileSync(new URL('../dist/daily-data.css', import.meta.url), 'utf8');
  assert.match(css, /--asset-paper: var\(--bg\)/);
  assert.match(css, /--asset-ink: var\(--text\)/);
  assert.match(css, /--asset-grid: var\(--border-soft\)/);
  assert.match(css, /--asset-sign: var\(--accent\)/);
  assert.match(css, /--asset-muted: var\(--muted\)/);
  assert.match(css, /\.daily-board-label \{ display: none;/);
  assert.doesNotMatch(css, /background:\s*(?:#fff(?:fff)?\b|white\b|#d9dcda|#f7d0d5|#c9eed0)/i);
  assert.doesNotMatch(css, /\.daily-back\s*\{\s*display:\s*none/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  view.destroy();
});


test('mobile comparison owns its return control without the global fallback or reserved row', () => {
 const css = readFileSync(new URL('../dist/mobile-workspace.css', import.meta.url), 'utf8');
 assert.match(css, /body:not\(\[data-page=outlook\]\):not\(\[data-page=data\]\) \.mobile-chart-home/);
 assert.match(css, /body:not\(\[data-page=outlook\]\):not\(\[data-page=data\]\) \.workspace\.atlas-details-layout>#main/);
});

test('asset identities expose consistent codes and open the same audited explanation', async () => {
  const {view,ui}=setup();await view.render();
  const table=ui.node('data-body').innerHTML;
  assert.equal((table.match(/class="asset-identity"/g)||[]).length,18);
  assert.match(table, /class="asset-name-symbol">BTC<\/span><span class="asset-name-label">비트코인/);
  assert.match(table,/aria-label="비트코인 \(BTC\) 수치와 판단 근거 보기"/);
  ui.click('',{assetReason:'BTC'});
  const content=ui.node('daily-method-content').innerHTML;
  assert.match(content,/class="asset-reason-metrics"/);
  assert.match(content,/위험 자산 · Index ETF · USD/);
  assert.equal((content.match(/<dt>/g)||[]).length,3);
  assert.match(content,/<details class="asset-general-method"><summary>계산법과 유의사항/);
  assert.doesNotMatch(content,/<details class="asset-general-method" open/);
  assert.match(content,/주문 비중이나 미래 수익률을 뜻하지 않습니다/);
  view.destroy();
});

test('mobile quick moves change only the horizontal table position without recomputing or hiding rows', async () => {
  let reads=0;const {view,ui}=setup({getter:async()=>{reads++;return {};}});await view.render();
  const before=ui.node('data-body').innerHTML, panel=ui.node('asset-table-scroll'),moves=[];
  panel.scrollWidth=866;panel.clientWidth=300;panel.scrollTo=options=>moves.push(options);
  ui.click('asset-scroll-end');ui.click('asset-scroll-start');
  assert.deepEqual(moves,[{left:566,behavior:'instant'},{left:0,behavior:'instant'}]);
  assert.equal(reads,1);assert.equal(ui.node('data-body').innerHTML,before);
  assert.deepEqual(symbols(before),COMPARISON_SYMBOLS);
  panel.clientWidth=1000;ui.click('asset-scroll-end');assert.equal(moves.at(-1).left,0);
  view.destroy();ui.click('asset-scroll-end');assert.equal(moves.length,3);
});

test('sticky headings use a single bounded viewport and preserve the pinned identity corner', () => {
  const css=readFileSync(new URL('../dist/daily-data.css',import.meta.url),'utf8');
  const shared=css.split('@media')[0];
  assert.match(css,/asset-table-panel \{ display: flex; flex-direction: column; flex: 1; min-height: 0/);
  assert.match(css,/asset-table-scroll \{ flex: 1; min-height: 0; min-width: 0; overflow: auto/);
  assert.match(css,/thead th \{ position: sticky; top: 0; z-index: 3/);
  assert.match(shared,/asset-identity-header \{ display: none;/,'a merged three-column header cannot align with the pinned name column');
  assert.match(shared,/asset-mobile-header \{ display: table-cell;/,'individual column headings must also be visible on tablets and desktops');
  assert.match(shared,/asset-mobile-name-header \{ position: sticky; left: 0; z-index: 4/,'the name heading must follow its body column at every screen size');
});


test('rail identities use real asset groups, preserve labels and escape the new attribute boundary', () => {
  const model = comparisonViewModel();
  const markup = renderAssetComparisonRows(model.rows);
  assert.match(markup, /data-asset-symbol="BTC" data-asset-group="위험 자산"/);
  assert.match(markup, /aria-description="위험 자산 · Index ETF"/);
  assert.deepEqual(symbols(markup), COMPARISON_SYMBOLS);
  const attack = '\"><img src=x onerror=alert(1)>';
  model.rows[0].group = attack; model.rows[0].category = attack;
  const escaped = renderAssetComparisonRows(model.rows);
  assert.doesNotMatch(escaped, /<img|data-asset-group=""><|aria-description=""></);
  assert.match(escaped, /data-asset-group="&quot;&gt;&lt;img/);
});

test('comparison keeps neutral asset symbols and reserves colors for returns and judgments', () => {
  const css = readFileSync(new URL('../dist/daily-data.css', import.meta.url), 'utf8');
  assert.match(css, /--asset-route: var\(--accent\)/);
  assert.match(css, /\.asset-name-symbol \{ color: var\(--asset-ink\)/);
  assert.doesNotMatch(css, /\[data-asset-group=[^\]]+\] \.asset-name-symbol\s*\{/);
  assert.match(css, /asset-judgment-buy \{ color: var\(--green/);
  assert.match(css, /asset-judgment-sell \{ color: var\(--red/);
  assert.match(css, /asset-judgment-neutral \{ color: var\(--asset-sign\)/);
  assert.match(css, /asset-return-gain \{ color: var\(--green,[^;]+; background: var\(--asset-paper\)/);
  assert.match(css, /asset-return-loss \{ color: var\(--red,[^;]+; background: var\(--asset-paper\)/);
  assert.match(css, /border-left: 2px solid currentColor/);
  assert.match(css, /tr:focus-within/);
  assert.match(css, /asset-identity \{[^}]*min-height: 44px/);
  assert.match(css, /asset-judgment \{ min-height: 44px/);
});


test('narrow explanation metrics stack as full-width label/value rows instead of clipping long percentages', () => {
  const css = readFileSync(new URL('../dist/daily-data.css', import.meta.url), 'utf8');
  const narrow = css.split('@media (max-width: 620px) {')[1].split('@media (max-width: 380px) {')[0];
  assert.match(narrow, /asset-reason-metrics \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(narrow, /asset-reason-metrics > div \{ display: flex;[^}]*justify-content: space-between/);
  assert.match(narrow, /asset-reason-metrics dd \{ margin: 0; font-size: 16px; white-space: nowrap/);
});


test('precise compact headings distinguish year count and year-start-to-extreme means', () => {
  const {view,ui}=setup();
  assert.match(ui.root.innerHTML, /분석<br>연도 수/);
  assert.match(ui.root.innerHTML, /연초 → 최고 종가<\/small><span>평균 상승률/);
  assert.match(ui.root.innerHTML, /연초 → 최저 종가<\/small><span>평균 하락률/);
  assert.match(ui.root.innerHTML, /연초 종가 대비 연중 최저 종가 하락률의 과거 연도 평균 · MDD 아님/);
  assert.match(ui.root.innerHTML, /id="asset-history-open"[^>]*disabled/);
  assert.match(ui.root.innerHTML, /aria-label="자산군별 판단 이력"/);
  view.destroy();
});


test('asset explanation exposes its exact subject and restores generic help title',async()=>{
 const {view,ui,model}=setup();await view.render();ui.click('',{assetReason:'IEF'});const selected=model.rows.find(r=>r.symbol==='IEF');assert.equal(ui.node('daily-method-title').textContent,`${selected.name} (IEF) 판단 근거`);ui.click('daily-method-close');ui.click('daily-method-open');assert.equal(ui.node('daily-method-title').textContent,'자산 비교표 읽는 법');view.destroy();
});
