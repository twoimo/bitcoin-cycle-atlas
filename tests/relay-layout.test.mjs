import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { initRelayRoomView, createMemoryRelayAddress } from '../dist/relay-room.js';

const sample = () => ({ generated_at: '2026-11-13T12:00:00+09:00', rooms: [
  { id: 'telegram', kind: 'chat', title: '소수의견(26년 4분기)', subtitle: 'Telegram', messages: [
    { id: 'a', text: '비트코인과 금리 변화', at: '2026-11-13T10:00:00+09:00', url: 'https://example.test/a' },
    { id: 'b', text: '건강과 운동 이야기', at: '2026-11-13T11:00:00+09:00' },
    { id: 'c', text: '', images: ['data/relay/assets/chat.webp'], at: '2026-11-13T12:00:00+09:00' },
  ] },
  { id: 'naver', kind: 'articles', title: '인생의 방', subtitle: '네이버 프리미엄', articles: [
    { id: 'n1', title: '먼저 쓴 글', published_date: '2026-11-12', blocks: [{ kind: 'text', text: '법인세와 세금' }], images: ['data/relay/assets/n1.webp'], url: 'https://example.test/n1' },
    { id: 'n2', title: '나중에 쓴 글', published_date: '2026-11-13', blocks: [{ kind: 'text', text: '운동과 건강' }], url: 'https://example.test/n2' },
  ] },
  { id: 'hankyung', kind: 'editions', title: '모바일한경', subtitle: '신문 · 판본', editions: [
    { date: '2026-11-12', version: 'v5', pages: [{ label: '1면', image: 'data/relay/assets/v5-1.webp' }] },
    { date: '2026-11-13', version: 'v6', pages: [{ label: '1면', image: 'data/relay/assets/v6-1.webp' }, { label: '2면', image: 'data/relay/assets/v6-2.webp' }] },
  ] },
] });

// Linkedom has no focus model or CSS, and every parseHTML window shares its properties.
const focused = new WeakMap(), stacked = new WeakSet();
function trackFocus(window, document) {
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => {
    const el = focused.get(document);
    return el?.isConnected ? el : document.body;
  } });
  window.HTMLElement.prototype.focus = function focus() {
    if (this.hasAttribute('disabled')) return;
    focused.set(this.ownerDocument, this);
    this.dispatchEvent(new window.Event('focusin', { bubbles: true }));
  };
}

async function mount({ search = '', stack = false, data = sample() } = {}) {
  const { document, window } = parseHTML('<html><body><section id="relay"></section></body></html>');
  trackFocus(window, document);
  if (stack) stacked.add(document);
  window.getComputedStyle = element => ({ getPropertyValue: name => (name === '--relay-layout' && stacked.has(element.ownerDocument) ? 'stack' : 'split') });
  const root = document.getElementById('relay'), address = createMemoryRelayAddress(search);
  let resolve; const ready = new Promise(done => { resolve = done; });
  initRelayRoomView({ root, address, embeddedData: () => JSON.stringify(data), onReady: resolve }).show(true);
  await ready;
  const focus = () => {
    const el = document.activeElement;
    if (!el || !root.contains(el)) return 'outside the relay';
    if (el.dataset.room) return `row ${el.dataset.room}`;
    if (el.dataset.article) return `card ${el.dataset.article}`;
    return el.classList.contains('relay-detail-body') ? 'content' : el.tagName;
  };
  return { root, window, address, focus, active: () => document.activeElement };
}
const click = (root, window, selector) => root.querySelector(selector).dispatchEvent(new window.Event('click', { bubbles: true }));
const key = (target, window, name) => {
  const event = new window.Event('keydown', { bubbles: true, cancelable: true });
  event.key = name;
  target.dispatchEvent(event);
};
const heading = root => root.querySelector('.relay-detail .relay-peer h2').textContent;

test('a room link opens that room and a post link opens that article reader', async () => {
  const deep = await mount({ search: '?room=naver' });
  assert.equal(heading(deep.root), '인생의 방');
  assert.equal(deep.root.dataset.relayPane, 'room');
  assert.equal(deep.root.querySelectorAll('[data-article]').length, 2);
  assert.equal(deep.root.querySelector('[data-room="naver"]').getAttribute('aria-current'), 'true');
  assert.deepEqual([deep.address.href, deep.address.length], ['?room=naver', 1], 'a valid link is not rewritten');

  const post = await mount({ search: '?room=naver&post=n1' });
  assert.equal(post.root.querySelector('.relay-reader-head>h2').textContent, '먼저 쓴 글');
  assert.equal(post.root.dataset.relayMode, 'reading');
  assert.equal(post.root.querySelectorAll('[data-article]').length, 0, 'the reader replaces the stream');
});

test('selecting another room pushes one entry and Back returns to the list address', async () => {
  const { root, window, address } = await mount();
  assert.equal(root.dataset.relayPane, 'list');
  click(root, window, '[data-room="hankyung"]');
  assert.deepEqual([address.href, address.length], ['?room=hankyung', 2]);
  assert.equal(heading(root), '모바일한경');
  assert.equal(root.dataset.relayPane, 'room');
  address.back();
  assert.equal(address.href, '');
  assert.equal(root.dataset.relayPane, 'list');
  assert.equal(heading(root), '소수의견(26년 4분기)', 'split shows the default room for the list address');
});

function countWrites(address) {
  const write = address.write;
  let writes = 0;
  address.write = (...args) => { writes += 1; write(...args); };
  return () => writes;
}

test('clicking the room split already shows makes its address shareable without a history entry', async () => {
  const { root, window, address } = await mount();
  const writes = countWrites(address);
  click(root, window, '[data-room="telegram"]');
  assert.deepEqual([address.href, address.length], ['?room=telegram', 1], 'the shown room is written in place');
  assert.equal(heading(root), '소수의견(26년 4분기)');
  click(root, window, '[data-room="telegram"]');
  assert.equal(writes(), 1, 'a second click on the same room writes nothing');
  click(root, window, '[data-room="naver"]');
  click(root, window, '[data-room="naver"]');
  assert.deepEqual([address.href, address.length, writes()], ['?room=naver', 2, 2], 'only the visible change is a step');
});

test('an unknown room or a post outside an articles room is replaced with what the data honors', async () => {
  const unknown = await mount({ search: '?room=missing' });
  assert.deepEqual([unknown.address.href, unknown.address.length], ['', 1]);
  assert.equal(unknown.root.dataset.relayPane, 'list');
  const stray = await mount({ search: '?room=telegram&post=n1' });
  assert.deepEqual([stray.address.href, stray.address.length], ['?room=telegram', 1]);
  assert.equal(stray.root.querySelectorAll('[data-message-id]').length, 3);
});

test('the in-app back pops only an entry the relay pushed and replaces a deep link', async () => {
  const deep = await mount({ search: '?room=naver', stack: true });
  click(deep.root, deep.window, '[data-relay-action="room-back"]');
  assert.deepEqual([deep.address.href, deep.address.length, deep.address.index], ['', 1, 0], 'no relay entry sits below a shared link');
  assert.equal(deep.root.dataset.relayPane, 'list');

  const pushed = await mount({ stack: true });
  click(pushed.root, pushed.window, '[data-room="naver"]');
  click(pushed.root, pushed.window, '[data-relay-action="room-back"]');
  assert.deepEqual([pushed.address.href, pushed.address.length, pushed.address.index], ['', 2, 0], 'the pushed room entry is popped');
  assert.equal(pushed.root.dataset.relayPane, 'list');
});

test('stacked, opening a room focuses its content and Esc returns focus to that room row', async () => {
  const { root, window, address, focus, active } = await mount({ stack: true });
  click(root, window, '[data-room="telegram"]');
  assert.deepEqual([address.href, address.length], ['?room=telegram', 2], 'stacked, even the default room is a step');
  assert.equal(root.dataset.relayPane, 'room');
  assert.equal(focus(), 'content');
  key(active(), window, 'Escape');
  assert.equal(address.href, '');
  assert.equal(root.dataset.relayPane, 'list');
  assert.equal(focus(), 'row telegram');
});

function deferBack(address) {
  const requested = [], back = address.back;
  address.back = () => { requested.push(back); };
  return { requested: () => requested.length, land: () => { while (requested.length) requested.shift()(); } };
}

test('a second back before the traversal lands requests no second history step', async () => {
  const { root, window, address, active } = await mount({ stack: true });
  const traversal = deferBack(address);
  click(root, window, '[data-room="telegram"]');
  click(root, window, '[data-relay-action="room-back"]');
  click(root, window, '[data-relay-action="room-back"]');
  assert.equal(traversal.requested(), 1, 'a double tap asks for one Back');
  traversal.land();
  assert.deepEqual([address.href, address.index, root.dataset.relayPane], ['', 0, 'list']);

  click(root, window, '[data-room="naver"]');
  key(active(), window, 'Escape');
  key(active(), window, 'Escape');
  assert.equal(traversal.requested(), 1, 'a landed traversal allows the next Back, once');
  traversal.land();
  assert.deepEqual([address.href, address.index, root.dataset.relayPane], ['', 0, 'list']);

  const split = await mount(), reader = deferBack(split.address);
  click(split.root, split.window, '[data-room="naver"]');
  click(split.root, split.window, '[data-article="n1"]');
  click(split.root, split.window, '[data-relay-action="article-back"]');
  search(split.root, split.window, '세금');
  assert.equal(reader.requested(), 1, 'a filter applied while the Back is pending asks for no second one');
  reader.land();
  assert.deepEqual([split.address.href, split.address.index], ['?room=naver', 1]);
});

test('Esc closes a reader onto its card, then in split focuses the room row without navigating', async () => {
  const { root, window, address, focus, active } = await mount();
  click(root, window, '[data-room="naver"]');
  root.querySelector('.relay-detail-body').scrollTop = 120;
  click(root, window, '[data-article="n1"]');
  assert.deepEqual([address.href, address.length], ['?room=naver&post=n1', 3]);
  assert.equal(focus(), 'content');
  key(active(), window, 'Escape');
  assert.deepEqual([address.href, address.index], ['?room=naver', 1], 'the reader entry is popped');
  assert.equal(root.querySelectorAll('.relay-reader').length, 0);
  assert.equal(root.querySelector('.relay-detail-body').scrollTop, 120, 'the stream returns where the reader left it');
  assert.equal(focus(), 'card n1');
  key(active(), window, 'Escape');
  assert.equal(address.href, '?room=naver');
  assert.equal(focus(), 'row naver');
});

const search = (root, window, query) => {
  root.querySelector('[name="query"]').value = query;
  root.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
};

test('a filter applied in the reader pops the reader entry, so one Back then leaves the room', async () => {
  const { root, window, address } = await mount();
  click(root, window, '[data-room="naver"]');
  click(root, window, '[data-article="n1"]');
  search(root, window, '세금');
  assert.deepEqual([address.href, address.length, address.index], ['?room=naver', 3, 1], 'the reader entry stays forward, not overwritten');
  assert.equal(root.querySelectorAll('.relay-reader').length, 0);
  assert.match(root.querySelector('.relay-filter-note').textContent, /'세금'/);
  address.back();
  assert.deepEqual([address.href, address.index], ['', 0], 'the next Back leaves the room');

  const deep = await mount({ search: '?room=naver&post=n1' });
  search(deep.root, deep.window, '세금');
  assert.deepEqual([deep.address.href, deep.address.length], ['?room=naver', 1], 'a shared reader link is replaced');
  assert.equal(deep.root.querySelectorAll('.relay-reader').length, 0);
});

test('arrow keys, Home and End move focus between rows without opening a room', async () => {
  const { root, window, address, focus, active } = await mount();
  const rows = [...root.querySelectorAll('.relay-room-item')];
  rows[0].focus();
  key(active(), window, 'ArrowDown');
  assert.equal(focus(), 'row naver');
  key(active(), window, 'End');
  assert.equal(focus(), 'row hankyung');
  key(active(), window, 'ArrowDown');
  assert.equal(focus(), 'row hankyung', 'the last row does not wrap');
  key(active(), window, 'Home');
  assert.equal(focus(), 'row telegram');
  key(active(), window, 'ArrowUp');
  assert.equal(focus(), 'row telegram');
  key(active(), window, 'End');
  assert.deepEqual(rows.map(row => row.getAttribute('tabindex')), ['-1', '-1', '0'], 'the single tab stop follows focus');
  assert.deepEqual([address.href, address.length], ['', 1]);
  assert.equal(heading(root), '소수의견(26년 4분기)');
});

test('a page turn that reaches the first or last page leaves focus on the current page', async () => {
  const { root, window, active } = await mount();
  click(root, window, '[data-room="hankyung"]');
  const turn = action => {
    const button = root.querySelector(`[data-relay-action="${action}"]`);
    button.focus();
    button.dispatchEvent(new window.Event('click', { bubbles: true }));
  };
  const current = () => [active().textContent, active().getAttribute('aria-current')];
  turn('page-next');
  assert.ok(root.querySelector('[data-relay-action="page-next"]').disabled, 'the last page disables ›');
  assert.deepEqual(current(), ['2면', 'true']);
  turn('page-prev');
  assert.ok(root.querySelector('[data-relay-action="page-prev"]').disabled, 'the first page disables ‹');
  assert.deepEqual(current(), ['1면', 'true']);
});

test('loading, error, empty, ready and no-match states each have exactly one live status', async () => {
  const originalFetch = globalThis.fetch;
  let respond, settled, mode = 'network';
  globalThis.fetch = () => new Promise(resolve => { respond = resolve; });
  const { document, window } = parseHTML('<html><body><section id="relay"></section></body></html>');
  const root = document.getElementById('relay');
  const statuses = () => root.querySelectorAll('[role="status"]').length;
  const reloads = () => root.querySelectorAll('[data-relay-action="reload"]').length;
  const controller = initRelayRoomView({ root, address: createMemoryRelayAddress(''), onReady: () => settled?.(),
    embeddedData: () => (mode === 'network' ? null : JSON.stringify(mode === 'empty' ? { rooms: [] } : sample())) });
  try {
    const loaded = new Promise(resolve => { settled = resolve; });
    controller.show(true);
    assert.deepEqual([root.dataset.relayState, statuses(), reloads()], ['loading', 1, 0]);
    respond({ ok: false, status: 503 });
    await loaded;
    assert.deepEqual([root.dataset.relayState, statuses(), reloads()], ['error', 1, 1]);
    mode = 'empty';
    await controller.reload();
    assert.deepEqual([root.dataset.relayState, statuses(), reloads()], ['empty', 1, 1]);
    mode = 'ready';
    await controller.reload();
    assert.deepEqual([root.dataset.relayState, statuses(), reloads()], ['ready', 1, 1]);
    root.querySelector('[name="query"]').value = 'not-present';
    root.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    for (const room of ['telegram', 'naver', 'hankyung']) {
      click(root, window, `[data-room="${room}"]`);
      assert.match(root.querySelector('.relay-detail-body').textContent, /조건에 맞는 항목이 없습니다/, room);
      assert.equal(statuses(), 1, `${room} no-match keeps one status`);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('ready keeps one reload control and the room list never holds an image', async () => {
  const { root, window } = await mount();
  const check = label => {
    assert.equal(root.querySelectorAll('[data-relay-action="reload"]').length, 1, label);
    assert.equal(root.querySelectorAll('.relay-rooms img').length, 0, label);
  };
  check('default room');
  for (const room of ['naver', 'hankyung', 'telegram']) { click(root, window, `[data-room="${room}"]`); check(room); }
  click(root, window, '[data-room="naver"]');
  click(root, window, '[data-article="n1"]');
  check('reader');
  assert.equal(root.querySelector('.relay-detail img').getAttribute('src'), 'data/relay/assets/n1.webp', 'the room still renders its own images');
});

test('each row previews and dates its newest entry, and the editions room opens the newest edition', async () => {
  const { root, window } = await mount();
  const row = id => root.querySelector(`[data-room="${id}"]`);
  assert.equal(row('telegram').querySelector('.relay-room-sub').textContent, '사진 1장');
  assert.equal(row('naver').querySelector('.relay-room-sub').textContent, '나중에 쓴 글');
  assert.equal(row('hankyung').querySelector('.relay-room-sub').textContent, 'v6 2026.11.13');
  for (const [id, raw] of [['telegram', '2026-11-13T12:00:00+09:00'], ['naver', '2026-11-13'], ['hankyung', '2026-11-13']]) {
    assert.equal(row(id).querySelector('time').getAttribute('datetime'), raw, id);
  }
  assert.doesNotMatch(row('naver').querySelector('time').textContent, /:/, 'a date-only source never gains a time');
  click(root, window, '[data-room="hankyung"]');
  assert.match(root.querySelector('.relay-edition-chip.active').textContent, /v6/);
  assert.equal(root.querySelector('.relay-paper-image').getAttribute('src'), 'data/relay/assets/v6-1.webp');

  const data = sample(), now = new Date().toISOString();
  data.rooms[0].messages.push({ id: 'now', text: '지금', at: now });
  const today = await mount({ data });
  const time = today.root.querySelector('[data-room="telegram"] time');
  assert.equal(time.getAttribute('datetime'), now);
  assert.match(time.textContent, /^\d{2}:\d{2}$/, 'an entry from today shows its time');
});

// Linkedom windows share properties, so each test removes it.
function installHistory(window, href, { refuseWrites = false } = {}) {
  const entries = [{ url: href, state: null }];
  let index = 0, backs = 0;
  const refuse = () => { if (refuseWrites) throw new DOMException('URL writes are not allowed here', 'SecurityError'); };
  window.location = { get href() { return entries[index].url; }, get search() { return new URL(entries[index].url).search; } };
  window.history = {
    get state() { return entries[index].state; },
    pushState(state, title, url) { refuse(); entries.splice(index + 1, Infinity, { url: String(url), state: structuredClone(state) }); index += 1; },
    replaceState(state, title, url) { refuse(); entries[index] = { url: String(url), state: structuredClone(state) }; },
    back() { backs += 1; if (index === 0) return; index -= 1; setTimeout(() => window.dispatchEvent(new window.Event('popstate'))); },
  };
  return { entries, index: () => index, backs: () => backs, url: () => entries[index].url, remove() { delete window.history; delete window.location; } };
}
async function mountOnWindow(href, options) {
  const { document, window } = parseHTML('<html><body><section id="relay"></section></body></html>');
  const history = installHistory(window, href, options), root = document.getElementById('relay');
  let resolve; const ready = new Promise(done => { resolve = done; });
  initRelayRoomView({ root, embeddedData: () => JSON.stringify(sample()), onReady: resolve }).show(true);
  await ready;
  return { root, window, history };
}

test('the page address keeps other params, marks each push and pops it on the in-app back', async t => {
  const { root, window, history } = await mountOnWindow('https://atlas.test/?page=relay&room=naver');
  t.after(history.remove);
  assert.equal(heading(root), '인생의 방');
  click(root, window, '[data-article="n1"]');
  assert.equal(history.url(), 'https://atlas.test/?page=relay&room=naver&post=n1');
  assert.deepEqual(history.entries[1].state, { relay: { from: 'room=naver' } });
  click(root, window, '[data-relay-action="article-back"]');
  assert.equal(history.backs(), 1, 'the entry below shows the stream, so the back pops');
  await new Promise(done => setTimeout(done, 5));
  assert.equal(history.url(), 'https://atlas.test/?page=relay&room=naver');
  assert.equal(root.querySelectorAll('.relay-reader').length, 0, 'the popstate traversal closes the reader');
  click(root, window, '[data-room="hankyung"]');
  assert.deepEqual(history.entries.map(entry => entry.url), ['https://atlas.test/?page=relay&room=naver', 'https://atlas.test/?page=relay&room=hankyung']);
});

test('a document that refuses URL writes still opens rooms and never pops history', async t => {
  const { root, window, history } = await mountOnWindow('https://atlas.test/?page=relay', { refuseWrites: true });
  t.after(history.remove);
  click(root, window, '[data-room="naver"]');
  assert.equal(heading(root), '인생의 방');
  click(root, window, '[data-article="n1"]');
  click(root, window, '[data-relay-action="article-back"]');
  assert.equal(root.querySelectorAll('.relay-reader').length, 0);
  assert.deepEqual([history.backs(), history.entries.length, history.url()], [0, 1, 'https://atlas.test/?page=relay']);
});
