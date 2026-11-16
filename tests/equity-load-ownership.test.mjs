import assert from 'node:assert/strict';
import test from 'node:test';
import { equityPayload, equityViewFixture } from './helpers/equity-view-fixture.mjs';
import { nativeDateRange } from '../dist/native-chart-workbench.js';

async function complete(fixture, symbol, offset, revision) {
  fixture.reply(offset, equityPayload(symbol, revision)); await fixture.microtasks();
  fixture.reply(offset + 1, { revision }); await fixture.settle();
}

for (const symbol of ['MSTR', 'BMNR']) {
  test(`${symbol} ignores a chart window report on a cleared range, so go-to and the interval switch keep working`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks(); await f.frame();
    const state = f.workbench().state, chart = f.latest(), day = 86400;
    f.reply(1, { revision: 1 }); await f.microtasks(); await f.frame(); await f.frame();
    assert.equal(state.range, null, 'the finished projection clears the range before its render');
    f.gesture({ start: chart.range.start + 2 * day, end: chart.range.start + 4 * day }); await f.settle(); await f.initialization;
    assert.ok(Number.isSafeInteger(state.range?.step), 'a report on a cleared range must not leave a range without its grid');
    const first = new Date(state.range.start * 1000).toISOString().slice(0, 10), next = new Date((state.range.start + day) * 1000).toISOString().slice(0, 10);
    assert.ok(nativeDateRange(state.range, { ok: true, range: { start: first, end: next } }), 'go-to still resolves a date window');
    assert.doesNotThrow(() => f.interval('weekly'), 'the interval switch accepts the range');
  });

  test(`${symbol} releases the usable observed chart before the coin response or projection`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol, { pathname: '/atlas-"quote&path' });
    assert.equal(f.document.documentElement.dataset.boot, 'loading');
    assert.equal(f.app.inert, true);
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks(); await f.frame();
    assert.equal(f.requests.length, 2, 'coin request is still pending');
    const initiallyVisible = f.latest(), lastObserved = initiallyVisible.series.candles.at(-1).time;
    initiallyVisible.onViewport({ from: initiallyVisible.range.start * 1000, to: lastObserved * 1000 });
    assert.equal(f.calculations.length, 0);
    assert.equal(f.latest().forecast, null);
    assert.equal(f.document.documentElement.dataset.boot, 'ready', 'a completed observed render must release the boot shell');
    assert.equal(f.app.inert, false, 'observed chart controls must be usable while the coin archive is pending');
    assert.equal(f.app.getAttribute('aria-hidden'), undefined);
    assert.match(f.status(), /계산 중/, 'forecast status must remain pending after observed readiness');
    const dialog = f.info();
    assert.equal(dialog.open, true, 'observed data links are usable before the coin projection completes');
    const markup = dialog.querySelector('#equity-detail-content').innerHTML;
    const saved = markup.match(/<a href="([^"]+)" target="_blank" rel="noopener noreferrer">보존한 일별 원자료\(JSON\) ↗<\/a>/);
    assert.ok(saved, 'the info dialog must identify its preserved JSON archive');
    assert.equal(saved[1], './data/'+symbol.toLowerCase()+'-ohlc.json');
    assert.equal(saved[1], f.requests[0].url, 'the original-data link must use this symbol’s actual price archive');
    assert.match(markup, /href="\/atlas-&quot;quote&amp;path\?page=data">20개 자산 비교표 ↗<\/a>/);
    assert.doesNotMatch(markup, /data-asset=|일별 원자료 · 연간 수익률 · MDD/);
    assert.equal(f.requests.length, 2, 'opening data information must not refetch or switch assets');
    dialog.close();
    f.scenario('bull'); await f.frame();
    f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
    assert.equal(f.latest().forecast.scenario, 'bull');
    assert.ok(f.latest().range.end >= lastObserved + 365 * 86400, 'initial viewport sync must not freeze the later forecast range');
    f.hide(); f.show(); await f.settle();
    assert.deepEqual(f.events, ['atlas:ready'], 'projection completion and cache restoration must not repeat readiness');
  });

  test(`${symbol} shows an actionable price failure and opens a requested source view once`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol, { query: '&article=fixture-article&article-view=source' });
    f.reject(0); await f.settle(); await f.initialization;
    assert.equal(f.document.documentElement.dataset.boot, 'ready');
    assert.equal(f.app.inert, false);
    assert.equal(f.app.querySelector('#equity-empty button').hidden, false);
    assert.deepEqual(f.articles, [{ id: 'fixture-article', view: 'source' }]);
    f.reload(); await complete(f, symbol, 1, 2);
    assert.deepEqual(f.events, ['atlas:ready']);
    assert.equal(f.articles.length, 1, 'retry must not reopen an initial deep link');
  });

  test(`${symbol} cannot release or render a suspended document before restoration`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    f.hide(); f.reply(0, equityPayload(symbol, 1)); await f.settle(); await f.initialization;
    assert.equal(f.document.documentElement.dataset.boot, 'loading');
    assert.equal(f.draws.length, 0);
    assert.deepEqual(f.events, []);
    f.show(); await complete(f, symbol, 1, 2);
    assert.equal(f.document.documentElement.dataset.boot, 'ready');
    assert.equal(f.app.inert, false);
  });

  test(`${symbol} does not reveal loaded prices after leaving before their first render`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks();
    f.hide(); f.reject(1); await f.settle(); await f.initialization;
    assert.equal(f.document.documentElement.dataset.boot, 'loading', 'a hidden initialization callback must not release the boot shell');
    assert.equal(f.draws.length, 0, 'a suspended document must not render retained prices');
    assert.deepEqual(f.events, []);
    f.show(); await complete(f, symbol, 2, 2);
    assert.equal(f.document.documentElement.dataset.boot, 'ready');
  });

  test(`${symbol} does not release a price failure after leaving before its first render`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    f.reject(0); await f.microtasks();
    f.hide(); await f.settle(); await f.initialization;
    assert.equal(f.document.documentElement.dataset.boot, 'loading', 'a hidden initialization callback must not release the boot shell');
    assert.deepEqual(f.events, []);
    f.show(); await complete(f, symbol, 1, 2);
    assert.equal(f.document.documentElement.dataset.boot, 'ready');
  });

  test(`${symbol} holds the boot shell until Funnest confirms the observed paint`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol, { manualPaint: true });
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks(); await f.frame();
    assert.equal(f.paints.length, 1, 'the mounted series must ask Funnest for one paint confirmation');
    assert.equal(f.document.documentElement.dataset.boot, 'loading', 'an unconfirmed chart must keep the boot shell');
    f.paints[0].confirm(); await f.microtasks();
    assert.equal(f.document.documentElement.dataset.boot, 'ready', 'a confirmed paint must release the boot shell');
    assert.equal(f.app.inert, false);
    f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
    assert.equal(f.paints.length, 1, 'an unchanged series must not ask for another confirmation');
    assert.deepEqual(f.events, ['atlas:ready']);
  });

  test(`${symbol} holds a paint failure delivered to a suspended document until the page returns`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol, { manualPaint: true });
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks(); await f.frame();
    f.hide(); f.paints[0].fail('Funnest chart did not paint within 5 seconds');
    f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
    assert.equal(f.document.documentElement.dataset.boot, 'loading', 'a hidden paint failure must not release the boot shell');
    assert.deepEqual(f.events, []);
    f.show(); await f.microtasks(); await f.frame();
    assert.equal(f.document.documentElement.dataset.boot, 'ready', 'pageshow must publish the paint failure that arrived while hidden');
    assert.match(f.status(), /차트 표시 실패/);
    await complete(f, symbol, 2, 2);
    f.paints.at(-1).confirm(); await f.settle();
    assert.doesNotMatch(f.status(), /차트 표시 실패/, 'a confirmed repaint must clear the earlier paint failure');
    assert.deepEqual(f.events, ['atlas:ready']);
  });

  test(`${symbol} releases a paint that Funnest confirmed while the document was suspended`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol, { manualPaint: true });
    await complete(f, symbol, 0, 1); await f.initialization;
    f.hide(); f.paints[0].confirm(); await f.settle();
    assert.equal(f.document.documentElement.dataset.boot, 'loading', 'a hidden paint confirmation must not release the boot shell');
    assert.deepEqual(f.events, []);
    f.show(); await f.settle();
    assert.equal(f.document.documentElement.dataset.boot, 'ready', 'a paint confirmed while hidden must release the boot shell after pageshow');
    assert.equal(f.app.inert, false);
    assert.equal(f.requests.length, 2, 'a loaded projection must not start a reload');
    assert.deepEqual(f.events, ['atlas:ready']);
  });

  test(`${symbol} offers a retry after a paint failure and ignores the destroyed chart`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol, { manualPaint: true });
    await complete(f, symbol, 0, 1); await f.initialization;
    f.paints[0].fail('Funnest chart did not paint within 5 seconds'); await f.settle();
    assert.equal(f.document.documentElement.dataset.boot, 'ready', 'a paint failure must release the boot shell');
    assert.match(f.status(), /차트 표시 실패/);
    assert.equal(f.app.querySelector('#equity-empty button').hidden, false, 'a paint failure must offer a retry');
    f.interval('weekly'); await f.frame();
    assert.equal(f.paints.length, 2, 'the weekly series must ask the failed chart for a second confirmation');
    const failed = f.latest();
    f.reload(); await complete(f, symbol, 2, 2);
    assert.equal(failed.destroyed, true, 'the retry must destroy the failed chart');
    assert.notEqual(f.latest(), failed, 'the retry must mount a new chart');
    f.paints[1].fail('Funnest chart was destroyed before paint'); await f.settle();
    assert.doesNotMatch(f.status(), /차트 표시 실패/, 'a destroyed chart must not publish its paint failure');
    assert.equal(f.app.querySelector('#equity-empty').hidden, true, 'a destroyed chart must not publish its paint failure');
    assert.deepEqual(f.events, ['atlas:ready']);
  });

  for (const lateFailure of [false, true]) {
    test(`${symbol} ignores revoked stock replies, success or failure=${lateFailure}`, { timeout: 2000 }, async () => {
      const f = await equityViewFixture(symbol);
      f.hide(); f.show(); f.show();
      assert.equal(f.requests.length, 2, 'repeated restore must not duplicate the current request');
      await complete(f, symbol, 1, 2);
      const displayed = f.snapshot();
      if (lateFailure) f.reject(0); else f.reply(0, equityPayload(symbol, 1));
      await f.settle();
      assert.equal(f.requests.length, 3, 'a revoked stock response must not request a coin archive');
      assert.equal(f.calculations.length, 1, 'a revoked stock response must not calculate');
      assert.equal(f.latest().forecast, displayed.forecast, 'revoked stock work must not replace the current forecast');
      assert.doesNotMatch(f.status(), /실패/);
      await f.initialization;
    });

    test(`${symbol} ignores revoked underlying replies, success or failure=${lateFailure}`, { timeout: 2000 }, async () => {
      const f = await equityViewFixture(symbol);
      f.reply(0, equityPayload(symbol, 1)); await f.microtasks();
      assert.equal(f.requests.length, 2);
      f.hide(); f.show(); f.show();
      await complete(f, symbol, 2, 2);
      const displayed = f.snapshot();
      if (lateFailure) f.reject(1); else f.reply(1, { revision: 1 });
      await f.settle(); await f.initialization;
      assert.deepEqual(f.calculations, [{ priceRevision: 2, assetRevision: 2 }], 'revoked underlying work must not calculate');
      assert.equal(f.latest().forecast, displayed.forecast, 'revoked underlying work must not clear a newer forecast');
      assert.doesNotMatch(f.status(), /확인 필요|실패/, 'revoked underlying work must not clear a newer forecast');
    });
  }

  for (const completedPaints of [0, 1]) {
    test(`${symbol} cancels projection after ${completedPaints} paint yields`, { timeout: 2000 }, async () => {
      const f = await equityViewFixture(symbol);
      f.reply(0, equityPayload(symbol, 1)); await f.microtasks();
      f.reply(1, { revision: 1 }); await f.microtasks();
      if (completedPaints) await f.frame();
      f.hide(); f.show();
      await complete(f, symbol, 2, 2); await f.initialization;
      assert.deepEqual(f.calculations, [{ priceRevision: 2, assetRevision: 2 }], 'revoked paint continuation must not calculate with a stale underlying archive');
      assert.equal(f.latest().forecast.priceRevision, 2);
      assert.equal(f.latest().forecast.assetRevision, 2);
    });
  }

  test(`${symbol} invalidates the previous projection when refreshed stock prices publish`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    await complete(f, symbol, 0, 1); await f.initialization;
    assert.equal(f.latest().forecast.priceRevision, 1);
    f.reload(); f.reload();
    assert.equal(f.requests.length, 3, 'a second click must not start overlapping refreshes');
    f.reply(2, equityPayload(symbol, 2)); await f.microtasks(); await f.frame();
    assert.equal(f.latest().series.candles[0].close, 103);
    assert.equal(f.latest().forecast, null, 'new prices must never be displayed with the previous projection');
    f.reply(3, { revision: 2 }); await f.settle();
    assert.equal(f.latest().forecast.priceRevision, 2);
  });

  test(`${symbol} preserves user interval, scenario and range while the projection is pending`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks(); await f.frame();
    f.interval('weekly'); f.scenario('bull'); await f.frame();
    const range = { ...f.latest().range, start: 1791849600, end: 1801440000 };
    f.pan(range);
    f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
    assert.equal(f.latest().series.interval, 'weekly');
    assert.equal(f.latest().forecast.scenario, 'bull');
    assert.equal(f.latest().range.start, range.start);
    assert.equal(f.latest().range.end, range.end);
    assert.equal(f.calculations.length, 1);
  });

  test(`${symbol} keeps a pan or zoom made on the chart while the projection is pending`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks(); await f.frame();
    const shown = f.latest().range, chosen = { start: shown.start + 2 * 86400, end: shown.start + 4 * 86400 };
    f.gesture(chosen);
    f.reply(1, { revision: 1 }); await f.settle(); await f.initialization;
    assert.equal(f.latest().forecast.scenario, 'base');
    assert.deepEqual(f.latest().nativeRange, { from: chosen.start * 1000, to: chosen.end * 1000 }, 'a pan or zoom on the chart must survive the projection');
  });

  test(`${symbol} keeps observed prices after coin failure and recovers on retry`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks();
    f.reject(1, 'Coin archive unavailable'); await f.settle(); await f.initialization;
    assert.equal(f.latest().series.candles[0].close, 102);
    assert.equal(f.latest().forecast, null);
    assert.match(f.forecastDialog(), /Coin archive unavailable/);
    f.reload(); await complete(f, symbol, 2, 2);
    assert.equal(f.latest().forecast.assetRevision, 2);
    assert.doesNotMatch(f.status(), /확인 필요|실패/);
  });

  test(`${symbol} keeps observed prices when projection rejects inputs and a retry can recover`, { timeout: 2000 }, async () => {
    const f = await equityViewFixture(symbol);
    f.reply(0, equityPayload(symbol, 1)); await f.microtasks();
    f.reply(1, { revision: 1, fail: true }); await f.settle(); await f.initialization;
    assert.equal(f.latest().series.candles[0].close, 102);
    assert.equal(f.latest().forecast, null);
    assert.match(f.forecastDialog(), /Model inputs rejected/);
    f.reload(); await complete(f, symbol, 2, 2);
    assert.equal(f.latest().forecast.assetRevision, 2);
    assert.doesNotMatch(f.status(), /확인 필요|실패/);
  });
}
