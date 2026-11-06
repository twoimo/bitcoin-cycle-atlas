import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { ipoCalendarRows, ipoDaysLeft, ipoMilestone, ipoRowMarkup, ipoSourceAttributionMarkup, ipoStatus, initIpoView } from '../dist/ipo-view.js';

const TODAY = '2026-11-01';
const doc = { '항목': [
  { '종목': '아델', '수요예측': ['2026-11-12', '2026-11-18'], '청약': ['2026-11-23', '2026-11-24'], '확정공모가': null, '희망공모가': '18000~25000', '공모금액_백만원': 54300, '일반청약경쟁률': null, '주간사': ['삼성증권', '미래에셋증권'] },
  { '종목': '넥스아이', '수요예측': ['2026-10-22', '2026-10-28'], '청약': ['2026-11-03', '2026-11-04'], '확정공모가': '12000', '희망공모가': '10000~12000', '공모금액_백만원': 30000, '일반청약경쟁률': null, '주간사': ['한국투자증권'] },
  { '종목': '래블업', '수요예측': ['2026-10-13', '2026-10-19'], '청약': ['2026-10-22', '2026-10-23'], '확정공모가': '19000', '희망공모가': '19000~22000', '공모금액_백만원': 20000, '일반청약경쟁률': '3.55:1', '주간사': ['NH투자증권'] },
  { '종목': '미정기업', '수요예측': [null, null], '청약': [null, null], '확정공모가': null, '희망공모가': null, '공모금액_백만원': null, '일반청약경쟁률': null, '주간사': [] },
] };

test('milestone prefers the pending demand forecast over the later subscription date', () => {
  assert.deepEqual(ipoMilestone(doc['항목'][0]), { label: '수요예측', date: '2026-11-12' });
});

test('status recomputes from viewing date instead of trusting stored labels', () => {
  assert.equal(ipoStatus(doc['항목'][0], TODAY), '수요예측 예정');
  assert.equal(ipoStatus(doc['항목'][1], TODAY), '청약 예정');
  assert.equal(ipoStatus(doc['항목'][2], TODAY), '마감');
  assert.equal(ipoStatus(doc['항목'][3], TODAY), '일정 미확인');
  // After the forecast passes, the same item becomes a subscription item.
  assert.equal(ipoStatus(doc['항목'][0], '2026-11-15'), '수요예측 진행 중');
});

test('D-day counts calendar days and closes become elapsed', () => {
  assert.equal(ipoDaysLeft(doc['항목'][0], TODAY), 11);
  assert.equal(ipoDaysLeft(doc['항목'][1], '2026-11-03'), 0);
  assert.equal(ipoDaysLeft(doc['항목'][2], TODAY), -9);
  assert.equal(ipoDaysLeft(doc['항목'][3], TODAY), null);
});

test('subscription price formats fixed prices and hoped ranges without NaN', () => {
  const row = ipoCalendarRows(doc, TODAY).find(r => r['종목'] === '미정기업');
  assert.ok(ipoRowMarkup({ ...row, '확정공모가': null, '희망공모가': '18000~25000' }).includes('18,000~25,000원'));
  assert.ok(ipoRowMarkup({ ...row, '확정공모가': '12000', '희망공모가': null }).includes('12,000원'));
  assert.ok(!ipoRowMarkup({ ...row, '확정공모가': null, '희망공모가': '18000~25000' }).includes('NaN'));
});

test('rows sort by next milestone with undated items last', () => {
  const names = ipoCalendarRows(doc, TODAY).map(r => r['종목']);
  assert.deepEqual(names, ['넥스아이', '아델', '래블업', '미정기업']);
});

test('row markup escapes injected names and renders missing values as dashes', () => {
  const row = ipoCalendarRows(doc, TODAY).find(r => r['종목'] === '미정기업');
  const evil = ipoRowMarkup({ ...row, '종목': '<img src=x onerror=alert(1)>', '주간사': ['<b>한투</b>'] });
  assert.ok(!evil.includes('<img'), 'raw image tag must not survive');
  assert.ok(evil.includes('&lt;img'), 'escaped name expected');
  assert.ok(evil.includes('일정 미확인'));
  assert.equal((evil.match(/—/g) || []).length >= 5, true);
});

test('source attribution preserves the collected description and exact source URL scheme', () => {
  const shipped = JSON.parse(readFileSync(new URL('../dist/data/ipo-calendar.json', import.meta.url), 'utf8'));
  const { document } = parseHTML('<html><body><p>' + ipoSourceAttributionMarkup(shipped) + '</p></body></html>');
  const panel = document.querySelector('p'), link = panel.querySelector('a');
  assert.equal(panel.textContent, '원자료 · ' + shipped['출처']);
  assert.equal(link.getAttribute('href'), 'http://www.38.co.kr/html/fund/index.htm');
  assert.equal(link.textContent, link.getAttribute('href'));
  assert.equal(link.getAttribute('target'), '_blank');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
});

test('source attribution escapes markup and never turns non-web protocols into links', () => {
  const input = '<img src=x onerror=alert(1)> javascript:alert(1) https://example.test/ipo?a=1&b=2';
  const { document } = parseHTML('<html><body>' + ipoSourceAttributionMarkup({ '출처': input }) + '</body></html>');
  assert.equal(document.body.textContent, '원자료 · ' + input);
  assert.equal(document.querySelector('img'), null);
  assert.deepEqual([...document.querySelectorAll('a')].map(link => link.getAttribute('href')), ['https://example.test/ipo?a=1&b=2']);
  assert.equal(ipoSourceAttributionMarkup({}), '원자료 출처 미확인');
  assert.equal(ipoSourceAttributionMarkup({ '출처': '수집 기관 확인 중' }), '원자료 · 수집 기관 확인 중');
});

// DOM boundary: only the selectors the controller touches.
function surface() {
  const nodes = new Map();
  const node = key => { if (!nodes.has(key)) nodes.set(key, { innerHTML: '', textContent: '', dataset: {}, attrs: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, querySelectorAll: () => [] }); return nodes.get(key); };
  const root = node('root');
  root.querySelectorAll = sel => sel === '[data-ipo-filter]' ? [node('f1')] : [];
  root.querySelector = sel => node(sel);
  root.addEventListener = (kind, fn) => { root.listeners[kind] = fn; };
  return { root, body: node('.ipo-table-body'), count: node('.ipo-count'), source: node('.ipo-source') };
}

test('controller renders rows, filters closed items, and reports source freshness', async () => {
  const { root, body, count, source } = surface();
  let ready = 0;
  const view = initIpoView({ root, load: async () => doc, now: () => new Date('2026-11-01T06:00:00+09:00'), onReady: () => { ready += 1; } });
  await view.render();
  assert.equal(view.state.status, 'ready');
  assert.equal((body.innerHTML.match(/<tr /g) || []).length, 2, 'upcoming filter hides closed and undated-only rows');
  assert.ok(body.innerHTML.includes('ipo-badge-forecast') && body.innerHTML.includes('ipo-badge-subscribe'));
  assert.ok(count.textContent.includes('/ 4건'));
  assert.ok(source.textContent.includes('재계산'));
  assert.ok(ready >= 1);
});

test('a failed data load surfaces an error row without crashing the controller', async () => {
  const { root, body } = surface();
  const view = initIpoView({ root, load: async () => { throw new Error('HTTP 503'); }, now: () => new Date('2026-11-01T06:00:00+09:00') });
  await view.render();
  assert.equal(view.state.status, 'error');
  assert.ok(body.innerHTML.includes('HTTP 503'));
});

test('the shipped calendar document parses and every row carries weekday-safe dates', () => {
  const shipped = JSON.parse(readFileSync(new URL('../dist/data/ipo-calendar.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(shipped['항목']) && shipped['항목'].length >= 30);
  for (const item of shipped['항목']) {
    for (const d of [...(item['수요예측'] ?? []), ...(item['청약'] ?? [])].filter(Boolean))
      assert.match(d, /^\d{4}-\d{2}-\d{2}$/, `bad date in ${item['종목']}`);
  }
  const rows = ipoCalendarRows(shipped, '2026-11-01');
  assert.ok(rows.some(r => r['종목'] === '아델' && r.상태 === '수요예측 예정'));
  assert.ok(rows.some(r => r['종목'] === '넥스아이' && r.상태 === '청약 예정'));
});


test('ranges stay active through the inclusive end and roll over only the next day', () => {
  const item = doc['항목'][0];
  assert.equal(ipoStatus(item, '2026-11-18'), '수요예측 진행 중');
  assert.equal(ipoStatus(item, '2026-11-19'), '청약 예정');
  assert.equal(ipoStatus(item, '2026-11-23'), '청약 진행 중');
  assert.equal(ipoStatus(item, '2026-11-24'), '청약 진행 중');
  assert.equal(ipoStatus(item, '2026-11-25'), '마감');
  assert.equal(ipoDaysLeft(item, '2026-11-24'), 0);
  assert.equal(ipoDaysLeft(item, '2026-11-25'), -1);
});

test('million KRW converts to hundred-million KRW without a tenfold error', () => {
  const row = ipoCalendarRows(doc, TODAY).find(r => r['종목'] === '아델');
  assert.ok(ipoRowMarkup(row).includes('543억'));
});

test('malformed documents become an error rather than a successful empty calendar', async () => {
  const { root, body } = surface();
  const view = initIpoView({ root, load: async () => ({notItems: []}) });
  await view.render();
  assert.equal(view.state.status, 'error');
  assert.match(body.innerHTML, /잘못된 일정 데이터 형식/);
});

test('refresh invalidates the same-day row cache', async () => {
  const {root, body} = surface();
  let count = 0;
  const view = initIpoView({root, load: async () => ({항목: count++ ? [] : doc['항목']}), now: () => new Date('2026-11-01T00:00:00Z')});
  await view.render();
  assert.match(body.innerHTML, /아델/);
  await view.refresh();
  assert.doesNotMatch(body.innerHTML, /아델/);
});


test('shipped month-crossing intervals retain their end month and every interval is ordered', () => {
  const shipped = JSON.parse(readFileSync(new URL('../dist/data/ipo-calendar.json', import.meta.url), 'utf8'));
  const robot = shipped['항목'].find(row => row['종목'] === '에이엘로봇');
  assert.deepEqual(robot['수요예측'], ['2026-10-28', '2026-11-03']);
  assert.equal(ipoStatus(robot, '2026-11-01'), '수요예측 진행 중');
  for (const item of shipped['항목']) for (const key of ['수요예측','청약']) {
    const [start,end] = item[key];
    assert.ok(!start || !end || start <= end, `${item['종목']} ${key} is reversed`);
  }
});

test('a reversed date range fails closed rather than showing a misleading next milestone', async () => {
  const { root, body } = surface();
  const view = initIpoView({root, load: async () => ({항목:[{종목:'역전일정',수요예측:['2026-10-28','2026-10-03'],청약:[]} ]})});
  await view.render();
  assert.equal(view.state.status, 'error');
  assert.match(body.innerHTML, /종료일이 시작일보다 빠릅니다/);
});
