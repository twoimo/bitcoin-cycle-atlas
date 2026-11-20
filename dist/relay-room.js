import { RELAY_TOPICS, relayEntries, relayMatches } from './relay-topics.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const KST = 9 * 3600000;
function kst(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t + KST);
}
function hhmm(iso) {
  const d = kst(iso);
  if (!d) return '';
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function clock(iso) {
  const d = kst(iso);
  if (!d) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function dayLabel(iso) {
  const d = kst(iso);
  if (!d) return String(iso ?? '');
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}
function dayKey(iso) {
  const d = kst(iso);
  if (!d) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function shortDate(iso) {
  const d = kst(iso);
  if (!d) return '';
  return `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, '0')}`;
}
/** Page and article indexes stay inside a loaded list; moving past either end stays put. */
export function stepRelayIndex(index, delta, count) {
  const size = Number.isInteger(count) && count > 0 ? count : 0;
  if (!size) return 0;
  const current = Number.isInteger(index) ? index : 0;
  const move = Number.isInteger(delta) ? delta : 0;
  return Math.min(size - 1, Math.max(0, current + move));
}
function dayHeading(iso) {
  const d = kst(iso);
  if (!d) return '';
  const weekday = '일월화수목금토'[d.getUTCDay()];
  const now = new Date(Date.now() + KST);
  const year = d.getUTCFullYear() === now.getUTCFullYear() ? '' : `${d.getUTCFullYear()}년 `;
  return `${year}${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${weekday})`;
}
function dateDropdown(entries, timeOf, activeKey, ariaLabel) {
  const chips = [];
  const seen = new Set();
  for (const entry of entries) {
    const raw = timeOf(entry);
    const key = dayKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const label = shortDate(raw) || key.slice(5);
    chips.push({ key, label, name: dayHeading(raw) || label });
  }
  if (!chips.length) return '';
  const active = chips.find(chip => chip.key === activeKey) || chips[0];
  const items = chips.map(chip => {
    const on = chip.key === active.key;
    return `<button type="button" class="relay-edition-chip${on ? ' active' : ''}" role="option" data-relay-day="${esc(chip.key)}" aria-label="${esc(chip.name)}" aria-selected="${on ? 'true' : 'false'}"${on ? ' aria-current="true"' : ''}>${esc(chip.label)}</button>`;
  }).join('');
  return `<div class="relay-edition-menu relay-date-menu"><button type="button" class="relay-edition-trigger" data-relay-action="edition-menu" aria-expanded="false" aria-haspopup="listbox" aria-controls="relay-edition-list"><span class="relay-edition-label">${esc(active.label)}</span>${GLYPH.chevron}</button><div class="relay-edition-list" id="relay-edition-list" role="listbox" aria-label="${esc(ariaLabel)}" hidden>${items}</div></div>`;
}
const safeHref = value => {
  const href = typeof value === 'string' ? value.trim() : '';
  return /^https?:\/\//i.test(href) ? href : null;
};
const trimUrl = value => value.replace(/[.,;:!?]+$/, '');
function autoLinks(text) {
  const links = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const url = trimUrl(match[0]);
    if (safeHref(url)) links.push({ offset: match.index, length: url.length, url });
  }
  return links;
}
function messageLinks(message) {
  const text = String(message?.text || '');
  if (!text) return [];
  const supplied = (Array.isArray(message?.links) ? message.links : []).flatMap(link => {
    const url = safeHref(link?.url), offset = Number(link?.offset), length = Number(link?.length);
    return url && Number.isInteger(offset) && Number.isInteger(length)
      && offset >= 0 && length > 0 && offset + length <= text.length
      ? [{ offset, length, url }] : [];
  });
  const all = [...supplied];
  for (const link of autoLinks(text)) {
    if (!all.some(other => link.offset < other.offset + other.length && other.offset < link.offset + link.length)) all.push(link);
  }
  return all.sort((a, b) => a.offset - b.offset || b.length - a.length);
}
function renderMessageText(message) {
  const text = String(message?.text || '');
  if (!text) return '';
  let html = '', cursor = 0;
  for (const link of messageLinks(message)) {
    if (link.offset < cursor) continue;
    const end = Math.min(text.length, link.offset + link.length);
    if (end <= link.offset) continue;
    html += esc(text.slice(cursor, link.offset)).replace(/\n/g, '<br>');
    html += `<a class="relay-msg-inline-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(text.slice(link.offset, end)).replace(/\n/g, '<br>')}</a>`;
    cursor = end;
  }
  return html + esc(text.slice(cursor)).replace(/\n/g, '<br>');
}
function replySnippet(message) {
  const text = String(message?.text || '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 84 ? `${text.slice(0, 84)}…` : text;
  const images = Array.isArray(message?.images) ? message.images.length : 0;
  return images ? `사진 ${images}장` : '이전 메시지';
}

// 인생의 방 본문은 네이버 에디터의 줄바꿈·zero-width 공백을 그대로 담고 있다.
// Medium처럼 문단은 빈 줄로만 나누고, 한 줄짜리 줄바꿈은 이어 붙인다.
const ARTICLE_INVISIBLE = /[\u200b\u200c\u200d\u2060\ufeff]/g;
const ARTICLE_GENERIC_ALT = /본문 사진\s*\d+\s*$/;

function normalizeArticleText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(ARTICLE_INVISIBLE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function articleLines(part) {
  return part.split('\n').map(line => line.trim()).filter(Boolean);
}
function articleImage(block) {
  const src = typeof block?.src === 'string' ? block.src.trim() : '';
  if (!src) return null;
  const width = Number(block?.width), height = Number(block?.height);
  return {
    kind: 'image', src,
    alt: typeof block?.alt === 'string' ? block.alt.trim() : '',
    caption: typeof block?.caption === 'string' ? block.caption.trim() : '',
    width: Number.isInteger(width) && width > 0 ? width : 0,
    height: Number.isInteger(height) && height > 0 ? height : 0,
  };
}
function articleContentBlocks(article) {
  const content = [];
  for (const block of Array.isArray(article?.blocks) ? article.blocks : []) {
    if (!block || typeof block !== 'object') continue;
    if (block.kind === 'image') {
      const image = articleImage(block);
      if (image) content.push(image);
      continue;
    }
    if (block.kind !== 'text') continue;
    const text = normalizeArticleText(block.text);
    if (!text) continue;
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length && lines.every(line => /^\s*>/.test(line))) {
      const quote = lines.map(line => line.replace(/^\s*>\s?/, '').trim()).filter(Boolean).join(' ');
      if (quote) content.push({kind: 'quote', text: quote});
      continue;
    }
    for (const part of text.split(/\n{2,}/)) {
      const paragraph = articleLines(part).join(' ');
      if (paragraph) content.push({kind: 'text', text: paragraph});
    }
  }
  if (!content.length) {
    for (const part of normalizeArticleText(article?.body_text).split(/\n{2,}/)) {
      const paragraph = articleLines(part).join(' ');
      if (paragraph) content.push({kind: 'text', text: paragraph});
    }
  }
  const seen = new Set(content.filter(block => block.kind === 'image').map(block => block.src));
  for (const value of Array.isArray(article?.images) ? article.images : []) {
    const image = articleImage(typeof value === 'string' ? {src: value} : value);
    if (!image || seen.has(image.src)) continue;
    content.push(image); seen.add(image.src);
  }
  return content;
}
function articleHeading(text) {
  const markdown = /^(#{1,3})\s+(.+)$/.exec(text);
  if (markdown) return {level: Math.min(3, markdown[1].length + 1), text: markdown[2].trim()};
  const numbered = /^(\d{1,2})([.)])\s+\S/.exec(text);
  if (numbered) return {level: numbered[2] === ')' ? 3 : 2, text};
  if (/^제?\s*\d{1,2}\s*[장절][.:]?\s+\S/.test(text)) return {level: 2, text};
  const marked = /^([■◆▶◈●])\s*(.+)$/.exec(text);
  if (marked) return {level: 3, text: marked[2].trim()};
  return null;
}
function articlePlainText(article) {
  return articleContentBlocks(article)
    .filter(block => block.kind === 'text' || block.kind === 'quote')
    .map(block => block.text).join('\n\n');
}
function articleReadMinutes(article) {
  const chars = articlePlainText(article).replace(/\s/g, '').length;
  return Math.max(1, Math.round(chars / 500));
}
function articleExcerpt(article) {
  const text = articleContentBlocks(article)
    .filter(block => block.kind === 'text')
    .map(block => block.text).join(' ')
    .replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 150 ? `${text.slice(0, 150).trimEnd()}…` : text;
}
function articleCaption(image) {
  if (image.caption) return image.caption;
  const alt = String(image.alt || '').trim();
  return alt && alt.length <= 120 && !ARTICLE_GENERIC_ALT.test(alt) ? alt : '';
}
function articleInline(text) {
  const links = autoLinks(text);
  if (!links.length) return esc(text);
  let html = '', cursor = 0;
  for (const link of links) {
    if (link.offset < cursor) continue;
    html += esc(text.slice(cursor, link.offset));
    html += `<a class="relay-reader-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(text.slice(link.offset, link.offset + link.length))}</a>`;
    cursor = link.offset + link.length;
  }
  return html + esc(text.slice(cursor));
}

const svg = path => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">${path}</svg>`;
const GLYPH = {
  book: svg('<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>'),
  refresh: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V9H15"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  prev: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
};

function countLabel(room) {
  const count = relayEntries(room).length;
  return room.kind === 'chat' ? `메시지 ${count}개` : room.kind === 'articles' ? `글 ${count}편` : `판본 ${count}개`;
}
const ROOM_LABELS = { naver: '플스포 인생의 방 (네프콘)' };
function roomLabel(room) {
  return ROOM_LABELS[room?.id] || room?.title || room?.id || '';
}
function shortTitle(room) {
  const title = roomLabel(room);
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title;
}
function listedRooms(rooms) {
  return [...rooms].sort((left, right) => Number(right.id === 'naver') - Number(left.id === 'naver'));
}
const graphemes = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const initial = room => graphemes.segment(shortTitle(room))[Symbol.iterator]().next().value?.segment ?? '';
const entryTime = entry => String(entry?.at || entry?.published_date || entry?.date || '');

function roomPreview(room) {
  const last = relayEntries(room).at(-1);
  if (room.kind === 'chat') {
    if (!last) return '아직 받은 메시지가 없습니다';
    const text = String(last.text || '').replace(/\s+/g, ' ').trim();
    if (text) return text.length > 64 ? `${text.slice(0, 64)}…` : text;
    const images = Array.isArray(last.images) ? last.images.length : 0;
    return images ? `사진 ${images}장` : '메시지';
  }
  if (room.kind === 'articles') return last?.title ? String(last.title).slice(0, 64) : '아직 받은 글이 없습니다';
  return last ? `${last.version || ''} ${dayLabel(last.date)}`.trim() : '아직 받은 판본이 없습니다';
}
function rowTime(raw) {
  const now = new Date(Date.now() + KST);
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw), date = dateOnly ? raw : dayKey(raw);
  if (!date) return raw;
  if (!dateOnly && date === today) return clock(raw);
  const [year, month, day] = date.split('-');
  return Number(year) === now.getUTCFullYear() ? `${month}.${day}` : `${year}.${month}.${day}`;
}

/** The relay's two URL params as read, before the data can vouch for them.
 * @typedef {{room:string|null, post:string|null}} RawAddress */
/** A RawAddress the ready data honors: `room` exists, `post` is an article of that articles room.
 * @typedef {{room:string|null, post:string|null}} Address */

const HOME = Object.freeze({ room: null, post: null });
const NO_FILTERS = Object.freeze({ topic: 'all', query: '' });
const RELAY_PARAMS = ['room', 'post'];
const ROOM_KINDS = new Set(['chat', 'articles', 'editions']);
const KEEP = Object.freeze({ kind: 'keep' });
const CONTENT = Object.freeze({ kind: 'content' });

function parseRelayPayload(json, token, assets) {
  const seen = new Set(), rooms = [];
  for (const room of Array.isArray(json?.rooms) ? json.rooms : []) {
    if (!room || typeof room.id !== 'string' || !room.id || seen.has(room.id)) continue;
    seen.add(room.id);
    rooms.push(ROOM_KINDS.has(room.kind) ? room : { ...room, kind: 'chat' });
  }
  const generatedAt = typeof json?.generated_at === 'string' ? json.generated_at : null;
  return rooms.length ? { kind: 'ready', data: { generatedAt, rooms, token, assets } } : { kind: 'empty', generatedAt };
}

function readRelayParams(search, scope) {
  const params = new URLSearchParams(search);
  if (scope === 'center' && params.get('center') !== 'relay') return null;
  if (scope === 'page' && params.get('page') !== 'relay') return null;
  return { room: params.get('room') || null, post: params.get('post') || null };
}
function serializeAddress(address) {
  const params = new URLSearchParams();
  for (const key of RELAY_PARAMS) if (address[key]) params.set(key, address[key]);
  return params.toString();
}
const sameAddress = (a, b) => serializeAddress(a) === serializeAddress(b);

/**
 * @typedef {{read:() => RawAddress|null, from:() => RawAddress|null,
 *   write:(next:Address, how:'push'|'replace', from?:Address) => void,
 *   back:() => void, subscribe:(listener:(raw:RawAddress) => void) => () => void}} RelayAddressPort
 */

function relayAddressFor(win) {
  if (!win?.history || !win.location) return createMemoryRelayAddress('');
  let target = win, scope = 'page';
  try {
    if (win.parent !== win && new URLSearchParams(win.location.search).get('embedded') === '1'
      && win.parent.location.origin === win.location.origin) { target = win.parent; scope = 'center'; }
  } catch {}
  let writing = false;
  const read = () => readRelayParams(target.location.search, scope);
  return {
    read,
    from() {
      const from = target.history.state?.relay?.from;
      return typeof from === 'string' ? readRelayParams(from, 'any') : null;
    },
    write(next, how, from = HOME) {
      const url = new URL(target.location.href);
      for (const key of RELAY_PARAMS) if (next[key]) url.searchParams.set(key, next[key]); else url.searchParams.delete(key);
      const state = how === 'push' ? { relay: { from: serializeAddress(from) } } : target.history.state;
      writing = true;
      // Chrome throws SecurityError on URL writes in a sandboxed frame, whose origin is opaque.
      try { target.history[how === 'push' ? 'pushState' : 'replaceState'](state, '', url); } catch {} finally { writing = false; }
    },
    back: () => target.history.back(),
    subscribe(listener) {
      const source = target.navigation?.addEventListener ? target.navigation : target;
      const type = source === target ? 'popstate' : 'currententrychange';
      const stop = () => source.removeEventListener(type, handler);
      function handler() {
        if (writing) return;
        if (win.closed) { stop(); return; }
        const raw = read();
        if (raw) listener(raw);
      }
      source.addEventListener(type, handler);
      win.addEventListener('pagehide', event => { if (!event.persisted) stop(); });
      return stop;
    },
  };
}

/** In-memory session history with the browser port's semantics; back() notifies synchronously. */
export function createMemoryRelayAddress(search = '') {
  const entries = [{ address: readRelayParams(search, 'any'), from: null }];
  const listeners = new Set();
  let index = 0;
  return {
    read: () => entries[index].address,
    from: () => entries[index].from,
    write(next, how, from = HOME) {
      const address = { room: next.room, post: next.post };
      if (how === 'push') { entries.splice(index + 1); entries.push({ address, from: { ...from } }); index += 1; }
      else entries[index] = { address, from: entries[index].from };
    },
    back() {
      if (index === 0) return;
      index -= 1;
      for (const listener of listeners) listener(entries[index].address);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get href() { const search = serializeAddress(entries[index].address); return search ? `?${search}` : ''; },
    get length() { return entries.length; },
    get index() { return index; },
  };
}

function normalizeAddress(raw, data) {
  const room = data.rooms.find(item => item.id === raw.room);
  if (!room) return HOME;
  const post = room.kind === 'articles' && relayEntries(room).some(article => article.id === raw.post) ? raw.post : null;
  return { room: room.id, post };
}
function withAddress(model, address) {
  const { phase } = model, room = address.room ?? phase.data.rooms[0].id;
  return { ...model, phase: { ...phase, address, edition: phase.edition?.room === room ? phase.edition : null } };
}
const filtering = filters => filters.topic !== 'all' || filters.query.trim() !== '';
const shownMemo = new WeakMap();
function shownByRoom(data, filters) {
  const key = `${filters.topic}\u0000${filters.query}`, memo = shownMemo.get(data);
  if (memo?.key === key) return memo.byRoom;
  const byRoom = new Map(data.rooms.map(room => [room.id, relayEntries(room).filter(entry => relayMatches(entry, filters))]));
  shownMemo.set(data, { key, byRoom });
  return byRoom;
}
const CHAT_WINDOW_THRESHOLD = 120;
const CHAT_WINDOW_INITIAL = 100;
const CHAT_WINDOW_BATCH = 100;

function deriveView(model) {
  const { phase, filters } = model;
  if (phase.kind !== 'ready') return null;
  const { data, address } = phase;
  const room = data.rooms.find(item => item.id === address.room) ?? data.rooms[0];
  const byRoom = shownByRoom(data, filters), shown = byRoom.get(room.id);
  const article = room.kind === 'articles' && address.post ? relayEntries(room).find(item => item.id === address.post) ?? null : null;
  let edition = null;
  if (room.kind === 'editions' && shown.length) {
    const editions = relayEntries(room);
    const cursor = phase.edition?.room === room.id && shown.includes(editions[phase.edition.edition]) ? phase.edition : null;
    const index = cursor ? cursor.edition : editions.indexOf(shown.at(-1));
    const pages = Array.isArray(editions[index].pages) ? editions[index].pages.length : 0;
    edition = { index, page: cursor ? Math.max(0, Math.min(cursor.page, pages - 1)) : 0 };
  }
  const chatLimit = room.kind === 'chat' ? (model.chatLimits?.[room.id] ?? CHAT_WINDOW_INITIAL) : null;
  return {
    data, address, room, article, edition, filters, byRoom, shown, chatLimit,
    filtering: filtering(filters),
    pane: address.room === null ? 'list' : 'room',
    mode: article ? 'reading' : room.kind === 'articles' ? 'articles' : 'default',
  };
}
function screenKey(view, layout) {
  const shown = `${view.room.id}\u0000${view.article?.id ?? ''}`;
  if (layout === 'split') return shown;
  return view.pane === 'list' ? 'list' : `room\u0000${shown}`;
}
function leaveTarget(view) {
  if (view.article) return { room: view.room.id, post: null };
  return view.address.room === null ? null : HOME;
}
function leaveStep(from, target, model, layout) {
  if (!from) return 'replace';
  const below = deriveView(withAddress(model, normalizeAddress(from, model.phase.data)));
  return screenKey(below, layout) === screenKey(deriveView(withAddress(model, target)), layout) ? 'back' : 'replace';
}
function focusAfterTraversal(prev, next, layout) {
  if (layout === 'stack' && prev.pane === 'room' && next.pane === 'list') return { kind: 'row', room: prev.room.id };
  if (prev.article && !next.article && prev.room.id === next.room.id) return { kind: 'card', article: prev.article.id };
  const entered = next.article || (layout === 'stack' && next.pane === 'room');
  return entered && screenKey(prev, layout) !== screenKey(next, layout) ? CONTENT : KEEP;
}
function revealsLatest(prev, next, layout) {
  if (next.article || next.room.kind === 'editions') return false;
  if (!prev) return true;
  if (prev.article && prev.room.id === next.room.id) return false;
  return prev.room.id !== next.room.id || (layout === 'stack' && prev.pane === 'list' && next.pane === 'room');
}

const NO_MATCHES = '<p class="relay-empty">조건에 맞는 항목이 없습니다. 분류나 검색어를 바꿔 주세요.</p>';
const assetSource = assets => value => Object.hasOwn(assets, value) ? assets[value] : value;

function editionLabel(entry) {
  const d = kst(entry?.date);
  const date = d ? `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, '0')}` : dayLabel(entry?.date);
  return `${date}${entry?.version ? ` ${entry.version}` : ''}`.trim();
}
function editionCenterStatus(view) {
  const editions = relayEntries(view.room);
  const { index, page: pageIndex } = view.edition;
  const edition = editions[index];
  const pages = Array.isArray(edition?.pages) ? edition.pages : [];
  const page = pages[pageIndex];
  const status = [page?.label || '', `${pageIndex + 1}/${Math.max(pages.length, 1)}`].filter(Boolean).join(' ');
  return `<span class="relay-paper-status">${esc(status)}</span>`;
}
function editionMenuControl(view) {
  const editions = relayEntries(view.room);
  const { index } = view.edition;
  const edition = editions[index];
  const current = editionLabel(edition);
  const items = view.shown.map(entry => {
    const source = editions.indexOf(entry);
    const active = source === index;
    const label = editionLabel(entry);
    const name = `${entry.version || ''} ${dayLabel(entry.date)}`.trim();
    return `<button type="button" class="relay-edition-chip${active ? ' active' : ''}" role="option" data-edition="${source}" title="${esc(name)}" aria-label="${esc(name)}" aria-selected="${active ? 'true' : 'false'}"${active ? ' aria-current="true"' : ''}>${esc(label)}</button>`;
  }).join('');
  return `<div class="relay-edition-menu"><button type="button" class="relay-edition-trigger" data-relay-action="edition-menu" aria-expanded="false" aria-haspopup="listbox" aria-controls="relay-edition-list"><span class="relay-edition-label">${esc(current)}</span>${GLYPH.chevron}</button><div class="relay-edition-list" id="relay-edition-list" role="listbox" aria-label="신문 날짜" hidden>${items}</div></div>`;
}

function renderPhase(phase) {
  const message = phase.kind === 'error' ? phase.message : phase.kind === 'empty' ? '표시할 원천이 없습니다.' : '릴레이 자료를 불러오는 중입니다.';
  const settled = phase.kind === 'error' || phase.kind === 'empty';
  const clock = phase.kind === 'empty' && phase.generatedAt ? hhmm(phase.generatedAt) : '';
  return `<div class="relay-blank-state"><p class="relay-empty" role="status">${esc(message)}</p>${settled ? '<button type="button" class="relay-retry" data-relay-action="reload">다시 불러오기</button>' : ''}${clock ? `<p class="relay-blank-clock"><span>15분마다 갱신</span> <time datetime="${esc(phase.generatedAt)}">${esc(clock)}</time></p>` : ''}</div>`;
}

function renderFrame(view) {
  const { data } = view;
  const generated = data.generatedAt ? hhmm(data.generatedAt) : '';
  return `<div class="relay-panes">
    <aside class="relay-rooms" aria-label="릴레이 채널">
      <header class="relay-rooms-head"><h2>채널</h2><span class="relay-rooms-total">${data.rooms.length}</span><button type="button" class="relay-refresh" data-relay-action="reload" aria-label="릴레이 새로고침" title="새로고침">${GLYPH.refresh}</button></header>
      <ul class="relay-room-list" aria-label="채널 목록"></ul>
      <footer class="relay-rooms-foot" role="status">${generated ? `<span>15분마다 갱신</span><time datetime="${esc(data.generatedAt)}">${esc(generated)}</time>` : '<span>RelayDeck</span>'}</footer>
    </aside>
    <section class="relay-detail" aria-labelledby="relay-room-title"></section>
    <div class="relay-backdrop" aria-hidden="true"></div>
  </div>`;
}

function renderRows(view) {
  return listedRooms(view.data.rooms).map(room => {
    const total = relayEntries(room).length, raw = entryTime(relayEntries(room).at(-1));
    const label = roomLabel(room);
    const sub = view.filtering ? `${view.byRoom.get(room.id).length} / ${total}건 일치` : roomPreview(room);
    return `<li><button type="button" class="relay-room-item" data-room="${esc(room.id)}" title="${esc(label)}" tabindex="-1">
      <span class="relay-room-avatar" data-kind="${room.kind}" aria-hidden="true">${esc(initial(room))}</span>
      <span class="relay-room-copy">
        <span class="relay-room-top"><span class="relay-room-name">${esc(label)}</span>${raw ? `<time class="relay-room-time" datetime="${esc(raw)}">${esc(rowTime(raw))}</time>` : ''}</span>
        <span class="relay-room-sub">${esc(sub)}</span>
      </span>
    </button></li>`;
  }).join('');
}

function renderRoom(view) {
  const { room, article, data } = view, title = roomLabel(room), src = assetSource(data.assets);
  const lead = article
    ? `<button type="button" class="relay-detail-back" data-relay-action="article-back" aria-label="글 목록으로" title="글 목록">${GLYPH.back}</button>`
    : `<button type="button" class="relay-room-back" data-relay-action="room-back" aria-label="채널 목록으로" title="채널 목록">${GLYPH.back}</button><span class="relay-peer-avatar" data-kind="${room.kind}" aria-hidden="true">${esc(initial(room))}</span>`;
  const topic = RELAY_TOPICS.find(tag => tag.id === view.filters.topic)?.label ?? '전체 주제';
  const query = view.filters.query.trim();
  const note = view.filtering
    ? `<p class="relay-filter-note">${esc([query ? `'${query}'` : '', topic, `${view.shown.length} / ${relayEntries(room).length}건`].filter(Boolean).join(' · '))}</p>` : '';
  let centerSlot = '', rightControl = '';
  if (!article && room.kind === 'chat' && view.shown.length) {
    rightControl = dateDropdown(view.shown, item => item.at, dayKey(view.shown.at(-1).at), '대화 날짜');
  } else if (!article && room.kind === 'articles' && view.shown.length) {
    rightControl = dateDropdown(view.shown, item => item.published_date || item.at, dayKey(view.shown[0].published_date || view.shown[0].at), '글 날짜');
  } else if (article && room.kind === 'articles') {
    const at = view.shown.findIndex(item => item.id === article.id);
    if (at >= 0) centerSlot = `<span class="relay-paper-status">${at + 1}/${view.shown.length}</span>`;
    const stamp = shortDate(article.published_date || article.at);
    if (stamp) rightControl = `<span class="relay-head-stamp" title="${esc(dayLabel(article.published_date || article.at))}">${esc(stamp)}</span>`;
  } else if (room.kind === 'editions' && view.edition) {
    centerSlot = editionCenterStatus(view);
    rightControl = editionMenuControl(view);
  }
  const body = room.kind === 'chat' ? chatDetail(room, view, src)
    : room.kind === 'editions' ? editionDetail(room, view, src)
      : article ? articleReader(article, title, src) : articleStream(view, src);
  return `<header class="relay-detail-head${article ? ' relay-detail-head--reading' : ''}${rightControl ? ' relay-detail-head--dates' : ''}">
      <div class="relay-head-lead">${lead}<div class="relay-peer"><h2 id="relay-room-title">${esc(title)}</h2><p class="relay-peer-sub">${esc([room.subtitle, countLabel(room)].filter(Boolean).join(' · '))}</p></div></div>
      <div class="relay-head-center">${centerSlot}</div>
      <div class="relay-head-date">${rightControl}</div>
      ${data.generatedAt ? `<span class="relay-peer-updated">최근 갱신 ${esc(hhmm(data.generatedAt))}</span>` : ''}
    </header>${note}
    <div class="relay-detail-body" role="region" aria-label="${esc(title)} 내용" tabindex="0">${body}</div>`;
}

function chatDetail(item, view, imageSource) {
  const allMessages = view.shown;
  if (!allMessages.length) return view.filtering ? NO_MATCHES : '<p class="relay-empty">아직 받은 메시지가 없습니다.</p>';
  const windowed = !view.filtering && allMessages.length > CHAT_WINDOW_THRESHOLD;
  const limit = windowed ? Math.max(CHAT_WINDOW_INITIAL, view.chatLimit || CHAT_WINDOW_INITIAL) : allMessages.length;
  const start = windowed ? Math.max(0, allMessages.length - limit) : 0;
  const messages = start > 0 ? allMessages.slice(start) : allMessages;
  const moreButton = start > 0
    ? `<li class="relay-chat-more" style="display:flex;justify-content:center;padding:8px 0"><button type="button" class="relay-retry" data-relay-action="chat-more">이전 메시지 더 보기 (${start}개)</button></li>`
    : '';
  const byId = new Map(relayEntries(item).map(message => [String(message.id), message]));
  const authors = new Set(allMessages.map(message => String(message.author || '').trim()).filter(Boolean));
  const showAuthor = authors.size > 1;
  let lastDay = null;
  const rows = messages.map(message => {
    const key = dayKey(message.at);
    const heading = key !== lastDay ? dayHeading(message.at) : '';
    lastDay = key;
    const divider = heading ? `<li class="relay-day" data-day="${esc(key)}" role="separator"><span>${esc(heading)}</span></li>` : '';

    const text = renderMessageText(message);
    const imageList = (Array.isArray(message.images) ? message.images : []).flatMap(image => {
      const src = typeof image === 'string' ? image : image?.src;
      if (!src) return [];
      const width = Number(image?.width), height = Number(image?.height);
      const dims = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
        ? ` width="${width}" height="${height}"` : '';
      const alt = String(image?.alt || message.text || '텔레그램 사진').slice(0, 160);
      return [{ src: imageSource(src), dims, alt }];
    });
    const images = imageList.length ? `<div class="relay-msg-images" data-count="${imageList.length}">${imageList.map(image =>
      `<button type="button" class="relay-msg-image" data-relay-image="${esc(image.src)}" aria-label="${esc(image.alt || '사진 보기')}"><img src="${esc(image.src)}" alt="${esc(image.alt)}" loading="lazy" decoding="async"${image.dims}></button>`
    ).join('')}</div>` : '';

    const previews = (Array.isArray(message.previews) ? message.previews : []).flatMap(preview => {
      const url = safeHref(preview?.url);
      if (!url) return [];
      const title = preview.title || preview.display_url || url;
      const site = preview.site_name || '', description = preview.description || '';
      return [`<a class="relay-preview" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
          ${site ? `<span class="relay-preview-site">${esc(site)}</span>` : ''}
          <span class="relay-preview-title">${esc(title)}</span>
          ${description ? `<span class="relay-preview-description">${esc(description)}</span>` : ''}
          <span class="relay-preview-url">${esc(preview.display_url || url)}</span>
        </a>`];
    }).join('');

    const replied = message.reply_to ? byId.get(String(message.reply_to)) : null;
    const reply = replied
      ? `<div class="relay-reply"><span class="relay-reply-name">${esc(replied.author || item.title || '')}</span><span class="relay-reply-text">${esc(replySnippet(replied))}</span></div>`
      : message.reply_to ? '<div class="relay-reply"><span class="relay-reply-text">이전 메시지</span></div>' : '';
    const quote = message.quote ? `<blockquote class="relay-msg-quote">${esc(message.quote).replace(/\n/g, '<br>')}</blockquote>` : '';
    const withheld = message.withheld && !text ? '<p class="relay-msg-withheld">Telegram에서 본문이 제한된 글입니다.</p>' : '';
    const link = safeHref(message.url || message.link);
    const album = imageList.length > 1 ? `<span class="relay-msg-album">사진 ${imageList.length}장</span>` : '';
    const linkNote = link && !previews
      ? `<a class="relay-msg-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">원문 보기</a>` : '';
    const mediaOnly = imageList.length > 0 && !text && !previews && !quote && !reply && !withheld && !link && !showAuthor;
    const author = showAuthor ? `<span class="relay-msg-author">${esc(message.author || '')}</span>` : '';
    return `${divider}<li class="relay-msg${mediaOnly ? ' relay-msg--media' : ''}" data-message-id="${esc(message.id)}"${mediaOnly ? ` data-media="${imageList.length}"` : ''}>
        <div class="relay-bubble">
          ${author}${reply}${quote}${images}
          ${text ? `<p class="relay-msg-text">${text}</p>` : ''}
          ${previews ? `<div class="relay-msg-previews">${previews}</div>` : ''}
          ${withheld}${linkNote}
          <div class="relay-msg-foot"><span>${esc(item.title || item.id)}</span>${!link ? '<span>원문 링크 미제공</span>' : ''}${album}<time datetime="${esc(message.at || '')}">${esc(clock(message.at))}</time></div>
        </div>
      </li>`;
  }).join('');
  return `<ol class="relay-chat" aria-label="${esc(item.title || '텔레그램')} 메시지">${moreButton}${rows}</ol>`;
}

function articleReader(article, publication, imageSource) {
  const title = article.title || '제목 없음';
  const date = dayLabel(article.published_date || article.at);
  const minutes = articleReadMinutes(article);
  const link = safeHref(article.url);
  let firstImage = true;
  const body = articleContentBlocks(article).map(block => {
    if (block.kind === 'image') {
      const dims = block.width && block.height ? ` width="${block.width}" height="${block.height}"` : '';
      const caption = articleCaption(block);
      const figure = `<figure class="relay-reader-figure"><img src="${esc(imageSource(block.src))}" alt="${esc(block.alt || '본문 사진')}" loading="${firstImage ? 'eager' : 'lazy'}" decoding="async"${dims}>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
      firstImage = false;
      return figure;
    }
    if (block.kind === 'quote') return `<blockquote>${articleInline(block.text)}</blockquote>`;
    const heading = articleHeading(block.text);
    return heading
      ? `<h${heading.level}>${articleInline(heading.text)}</h${heading.level}>`
      : `<p>${articleInline(block.text)}</p>`;
  }).join('');
  return `<article class="relay-reader">
      <header class="relay-reader-head">
        <h2>${esc(title)}</h2>
        <div class="relay-reader-byline">
          <span class="relay-reader-avatar" aria-hidden="true">${GLYPH.book}</span>
          <div class="relay-reader-byline-copy">
            <span class="relay-reader-author">${esc(publication)}</span>
            <span class="relay-reader-meta">${esc(date)} · ${minutes}분 읽기</span>
          </div>
        </div>
      </header>
      <div class="relay-body">${body || '<p class="relay-reader-empty">본문이 아직 없습니다.</p>'}</div>
      <footer class="relay-reader-foot">
        <span>${esc(publication)}</span>
        ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">네이버 원문 <span aria-hidden="true">↗</span></a>` : ''}
      </footer>
    </article>`;
}

function articleCard(article, imageSource) {
  const content = articleContentBlocks(article);
  const images = content.filter(block => block.kind === 'image');
  const excerpt = articleExcerpt(article);
  const thumb = images.length
    ? `<span class="relay-article-thumb"><img src="${esc(imageSource(images[0].src))}" alt="" loading="lazy" decoding="async"></span>`
    : '<span class="relay-article-thumb relay-article-thumb--empty" aria-hidden="true"></span>';
  const day = dayKey(article.published_date || article.at);
  return `<li${day ? ` data-day="${esc(day)}"` : ''}><button type="button" class="relay-article" data-article="${esc(article.id)}">
      <span class="relay-article-copy">
        <span class="relay-article-meta">${esc(dayLabel(article.published_date || article.at))} · ${articleReadMinutes(article)}분 읽기</span>
        <span class="relay-article-title">${esc(article.title || '제목 없음')}</span>
        ${excerpt ? `<span class="relay-article-excerpt">${esc(excerpt)}</span>` : ''}
        ${images.length ? `<span class="relay-article-foot">사진 ${images.length}장</span>` : ''}
      </span>
      ${thumb}
    </button></li>`;
}

function articleStream(view, imageSource) {
  if (!view.shown.length) return view.filtering ? NO_MATCHES : '<p class="relay-empty">아직 받은 글이 없습니다.</p>';
  return `<div class="relay-feed"><ol class="relay-articles">${view.shown.map(article => articleCard(article, imageSource)).join('')}</ol></div>`;
}

function editionDetail(item, view, imageSource) {
  if (!view.edition) return view.filtering ? NO_MATCHES : '<p class="relay-empty">아직 받은 판본이 없습니다.</p>';
  const editions = relayEntries(item), { index, page: pageIndex } = view.edition, edition = editions[index];
  const pages = Array.isArray(edition.pages) ? edition.pages : [];
  const page = pages[pageIndex] || null;
  const pager = pages.map((entry, at) => {
    const label = entry.label || String(at + 1);
    const active = at === pageIndex;
    const thumb = entry.image
      ? `<img src="${esc(imageSource(entry.image))}" alt="" loading="${active ? 'eager' : 'lazy'}" decoding="async">`
      : '';
    return `<button type="button" class="relay-page-chip${active ? ' active' : ''}" data-page="${at}" aria-label="${esc(label)}"${active ? ' aria-current="true"' : ''}>${thumb}<span>${esc(label)}</span></button>`;
  }).join('');
  const stage = page?.image
    ? `<button type="button" class="relay-paper-open" data-relay-image="${esc(imageSource(page.image))}" aria-label="${esc(page.alt || page.label || '지면 크게 보기')}"><img class="relay-paper-image" src="${esc(imageSource(page.image))}" alt="${esc(page.alt || (page.label || ''))}" loading="lazy"></button>`
    : `<div class="relay-paper-placeholder">${esc(page?.text || '이미지 준비 중')}</div>`;
  return `<div class="relay-paper">
      <div class="relay-paper-body">
        <div class="relay-paper-stage">${stage}
          <div class="relay-paper-turn"><button type="button" class="relay-turn" data-relay-action="page-prev"${pageIndex === 0 ? ' disabled' : ''} aria-label="이전 면">‹</button><button type="button" class="relay-turn" data-relay-action="page-next"${pageIndex >= pages.length - 1 ? ' disabled' : ''} aria-label="다음 면">›</button></div>
        </div>
        <nav class="relay-pager" aria-label="신문 면 이동">${pager}</nav>
      </div>
    </div>`;
}

const FOCUS_TARGETS = [
  ['[data-room]', el => el.dataset.room],
  ['[data-article]', el => el.dataset.article],
  ['[data-edition]', el => el.dataset.edition],
  ['.relay-pager [data-page]', el => el.dataset.page],
  ['[data-relay-action]', el => el.dataset.relayAction],
  ['[name]', el => el.getAttribute('name')],
  ['.relay-detail-body', () => ''],
];
function focusKey(el) {
  const index = FOCUS_TARGETS.findIndex(([selector]) => el.matches?.(selector));
  return index < 0 ? null : `${index}:${FOCUS_TARGETS[index][1](el)}`;
}
const findBy = (root, selector, read, value) => [...root.querySelectorAll(selector)].find(el => read(el) === value);

const ROW_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

/**
 * @param {{root:HTMLElement, embeddedData?:() => string|null, embeddedAssets?:() => string|null,
 *   onReady?:() => void, address?:RelayAddressPort}} options
 */
export function initRelayRoomView({ root, embeddedData, embeddedAssets, onReady, address } = {}) {
  if (!root) throw new TypeError('relay view root is required');
  const port = address ?? relayAddressFor(root.ownerDocument?.defaultView);
  let model = { phase: { kind: 'idle', pending: port.read() ?? HOME }, filters: NO_FILTERS, chatLimits: {} };
  let view = null;
  let token = 0, fetching = false, readySent = false, version = 0;
  let lastFocus = null;
  let streamBeforeReader = null;
  let backPending = false;
  const painted = { frame: null, rows: null, selected: null, room: null };
  const repaintAll = frame => Object.assign(painted, { frame, rows: null, selected: null, room: null });

  function readLayout() {
    const panes = root.querySelector('.relay-panes');
    const style = panes && root.ownerDocument?.defaultView?.getComputedStyle?.(panes);
    return style?.getPropertyValue('--relay-layout').trim() === 'stack' ? 'stack' : 'split';
  }

  function commit(next, { focus = KEEP, reveal = false, deferFocus = false } = {}) {
    const prev = view, top = root.querySelector('.relay-detail-body')?.scrollTop ?? 0;
    model = next;
    view = deriveView(model);
    if (paint(view)) version += 1;
    if (view) {
      if (prev && !prev.article && view.article && prev.room.id === view.room.id) streamBeforeReader = { room: view.room.id, top };
      const closedReader = prev?.article && !view.article && prev.room.id === view.room.id;
      if (closedReader && streamBeforeReader?.room === view.room.id) root.querySelector('.relay-detail-body').scrollTop = streamBeforeReader.top;
      else if (reveal || closedReader) revealLatest();
    }
    if (deferFocus && typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(() => applyFocus(focus));
    else applyFocus(focus);
  }

  function paint(next) {
    const { phase } = model;
    root.dataset.relayState = phase.kind === 'idle' ? 'loading' : phase.kind;
    root.dataset.relayMode = next?.mode ?? 'default';
    if (!next) {
      delete root.dataset.relayPane;
      const key = `${root.dataset.relayState}:${phase.message ?? ''}`;
      if (painted.frame !== key) { root.innerHTML = renderPhase(phase); repaintAll(key); }
      return false;
    }
    root.dataset.relayPane = next.pane;
    if (painted.frame !== next.data.token) { root.innerHTML = renderFrame(next); repaintAll(next.data.token); }
    const filters = `${next.filters.topic}\u0000${next.filters.query}`;
    if (painted.rows !== filters) {
      root.querySelector('.relay-room-list').innerHTML = renderRows(next);
      const topic = root.querySelector('[name="topic"]');
      if (topic) for (const option of topic.options) option.selected = option.value === next.filters.topic;
      painted.rows = filters;
      painted.selected = null;
    }
    const current = next.pane === 'room' || readLayout() === 'split' ? next.room.id : null;
    const selected = `${next.room.id}\u0000${current ?? ''}`;
    if (painted.selected !== selected) {
      for (const row of root.querySelectorAll('.relay-room-item')) {
        row.setAttribute('tabindex', row.dataset.room === next.room.id ? '0' : '-1');
        if (row.dataset.room === current) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
      }
      painted.selected = selected;
    }
    const totals = [...next.byRoom.values()].reduce((sum, rows) => sum + rows.length, 0);
    const status = `${totals} / ${next.data.rooms.reduce((sum, room) => sum + relayEntries(room).length, 0)}건 · 원문 키워드 분류`;
    const output = root.querySelector('.relay-filter-form output');
    if (output && output.textContent !== status) output.textContent = status;
    root.querySelector('[data-relay-action="clear-filters"]')?.toggleAttribute('hidden', !next.filtering);
    const chatKey = next.room.kind === 'chat' && !next.filtering && next.shown.length > CHAT_WINDOW_THRESHOLD
      ? Math.min(next.shown.length, Math.max(CHAT_WINDOW_INITIAL, next.chatLimit || CHAT_WINDOW_INITIAL))
      : '';
    const roomKey = [next.room.id, next.article?.id ?? '', next.edition ? `${next.edition.index}.${next.edition.page}` : '', chatKey, filters].join('\u0000');
    if (painted.room === roomKey) return false;
    root.querySelector('.relay-detail').innerHTML = renderRoom(next);
    painted.room = roomKey;
    alignDateRail();
    alignPaperPager();
    globalThis.requestAnimationFrame?.(alignPaperPager);
    return true;
  }

  function revealLatest() {
    const at = version;
    const reveal = () => {
      if (at !== version) return;
      const body = root.querySelector('.relay-detail-body');
      if (body) body.scrollTop = body.scrollHeight;
      alignDateRail();
    };
    reveal();
    globalThis.requestAnimationFrame?.(reveal);
    setTimeout(reveal, 60);
  }

  function rove(row) {
    for (const item of root.querySelectorAll('.relay-room-item')) item.setAttribute('tabindex', item === row ? '0' : '-1');
  }
  function applyFocus(intent) {
    if (intent.kind === 'keep') {
      const doc = root.ownerDocument, active = doc.activeElement;
      if (!lastFocus || (active && active !== doc.body)) return;
      const [index] = lastFocus.split(':'), [selector, read] = FOCUS_TARGETS[Number(index)];
      const kept = findBy(root, selector, el => `${index}:${read(el)}`, lastFocus);
      (kept?.disabled ? root.querySelector('.relay-page-chip[aria-current="true"]') : kept)?.focus({ preventScroll: true });
      return;
    }
    const target = intent.kind === 'row' ? findBy(root, '[data-room]', el => el.dataset.room, intent.room)
      : intent.kind === 'card' ? findBy(root, '[data-article]', el => el.dataset.article, intent.article)
        : intent.kind === 'content' ? root.querySelector('.relay-detail-body')
          : root.querySelector(`[name="${intent.name}"]`);
    if (intent.kind === 'row' && target) rove(target);
    target?.focus({ preventScroll: intent.kind === 'content' });
  }

  const signalReady = () => { if (!readySent) { readySent = true; try { onReady?.(); } catch {} } };

  async function load() {
    if (fetching) return;
    fetching = true;
    if (model.phase.kind !== 'ready') commit({ ...model, phase: { kind: 'loading', pending: model.phase.pending } });
    let parsed;
    try {
      const inline = embeddedData?.();
      if (inline) {
        const assets = embeddedAssets?.();
        parsed = parseRelayPayload(JSON.parse(inline), ++token, assets ? JSON.parse(assets) : {});
      } else {
        const response = await (globalThis.__atlasEarlyData?.take?.('data/relay/index.json') || fetch('./data/relay/index.json', { signal: AbortSignal.timeout(15000) }));
        if (!response.ok) throw new Error('relay data unavailable');
        parsed = parseRelayPayload(await response.json(), ++token, {});
      }
    } catch {
      parsed = null;
    } finally {
      fetching = false;
    }
    try { settle(parsed); } finally { signalReady(); }
  }

  function settle(parsed) {
    const { phase } = model, pending = phase.kind === 'ready' ? phase.address : phase.pending;
    if (!parsed) { commit({ ...model, phase: { kind: 'error', pending, message: '릴레이 자료를 아직 받지 못했습니다.' } }); return; }
    if (parsed.kind === 'empty') { commit({ ...model, phase: { kind: 'empty', pending, generatedAt: parsed.generatedAt } }); return; }
    const normalized = normalizeAddress(pending, parsed.data);
    if (!sameAddress(normalized, pending)) port.write(normalized, 'replace');
    const next = { ...model, phase: { kind: 'ready', data: parsed.data, address: normalized, edition: phase.edition ?? null } };
    commit(next, { reveal: revealsLatest(null, deriveView(next), readLayout()) });
  }

  function selectRoom(id) {
    const next = withAddress(model, normalizeAddress({ room: id, post: null }, model.phase.data));
    const layout = readLayout(), nextView = deriveView(next);
    if (screenKey(nextView, layout) === screenKey(view, layout)) {
      if (view.address.room !== null) return;
      port.write(next.phase.address, 'replace');
      commit(next);
      return;
    }
    port.write(next.phase.address, 'push', view.address);
    commit(next, { focus: layout === 'stack' ? CONTENT : KEEP, reveal: revealsLatest(view, nextView, layout) });
  }

  function openArticle(id) {
    const next = withAddress(model, normalizeAddress({ room: view.room.id, post: id }, model.phase.data));
    if (!next.phase.address.post) return;
    port.write(next.phase.address, 'push', view.address);
    commit(next, { focus: CONTENT });
  }

  function requestBack() {
    if (backPending) return;
    backPending = true;
    port.back();
  }

  function leave(layout = readLayout()) {
    const target = leaveTarget(view);
    if (!target || backPending) return;
    if (leaveStep(port.from(), target, model, layout) === 'back') { requestBack(); return; }
    port.write(target, 'replace');
    const next = withAddress(model, target), nextView = deriveView(next);
    commit(next, { focus: focusAfterTraversal(view, nextView, layout), reveal: revealsLatest(view, nextView, layout) });
  }

  function adopt(raw) {
    backPending = false;
    if (model.phase.kind !== 'ready') { model = { ...model, phase: { ...model.phase, pending: raw } }; return; }
    const normalized = normalizeAddress(raw, model.phase.data);
    if (sameAddress(normalized, model.phase.address)) return;
    if (!sameAddress(normalized, raw)) port.write(normalized, 'replace');
    const next = withAddress(model, normalized), layout = readLayout(), nextView = deriveView(next);
    commit(next, { focus: focusAfterTraversal(view, nextView, layout), reveal: revealsLatest(view, nextView, layout), deferFocus: true });
  }

  function applyFilters(filters, origin) {
    const target = view.article ? { room: view.room.id, post: null } : null;
    const step = target && leaveStep(port.from(), target, model, readLayout());
    if (step === 'replace') port.write(target, 'replace');
    const next = target ? withAddress({ ...model, filters }, target) : { ...model, filters };
    commit({ ...next, phase: { ...next.phase, edition: null } }, { focus: { kind: 'control', name: origin } });
    if (step === 'back') requestBack();
  }

  function setCursor(edition, page) {
    commit({ ...model, phase: { ...model.phase, edition: { room: view.room.id, edition, page } } });
  }

  function readFilters(form) {
    const chosen = form.querySelector('[name="topic"]')?.value;
    return {
      topic: RELAY_TOPICS.some(tag => tag.id === chosen) ? chosen : 'all',
      query: form.querySelector('[name="query"]')?.value || '',
    };
  }

  function escape(event) {
    if (event.target.closest('input,select,textarea')) return;
    const layout = readLayout();
    if (view.article || (layout === 'stack' && view.pane === 'room')) { event.preventDefault(); leave(layout); }
    else if (layout === 'split' && event.target.closest('.relay-detail')) { event.preventDefault(); applyFocus({ kind: 'row', room: view.room.id }); }
  }

  function moveRowFocus(event, row) {
    const rows = [...root.querySelectorAll('.relay-room-item')], at = rows.indexOf(row);
    const to = { ArrowDown: Math.min(at + 1, rows.length - 1), ArrowUp: Math.max(at - 1, 0), Home: 0, End: rows.length - 1 }[event.key];
    event.preventDefault();
    rove(rows[to]);
    rows[to].focus();
  }

  let viewerItems = [];
  let viewerIndex = 0;
  function alignDateRail() {
    const rail = root.querySelector('.relay-date-rail');
    const active = rail?.querySelector('.active, [aria-current="true"]');
    if (!rail || !active) return;
    rail.scrollLeft = Math.max(0, active.offsetLeft - (rail.clientWidth - active.clientWidth) / 2);
  }
  function alignPaperPager() {
    const pager = root.querySelector('.relay-pager');
    const active = pager?.querySelector('.relay-page-chip.active');
    if (!pager || !active || !pager.clientWidth) return;
    const left = active.getBoundingClientRect().left - pager.getBoundingClientRect().left + pager.scrollLeft;
    pager.scrollLeft = Math.max(0, left - (pager.clientWidth - active.clientWidth) / 2);
  }
  function closeEditionMenu() {
    const menu = root.querySelector('.relay-edition-list');
    const trigger = root.querySelector('.relay-edition-trigger');
    const returnFocus = Boolean(menu && root.ownerDocument?.activeElement && menu.contains(root.ownerDocument.activeElement));
    if (menu) menu.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger?.focus?.({ preventScroll: true });
  }
  function toggleEditionMenu() {
    const menu = root.querySelector('.relay-edition-list');
    const trigger = root.querySelector('.relay-edition-trigger');
    if (!menu || !trigger) return;
    const open = menu.hidden;
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      const active = menu.querySelector('.active');
      if (active) menu.scrollTop = Math.max(0, active.offsetTop - 8);
    }
  }
  function expandChat(nextLimit, { preserveScroll = true } = {}) {
    if (!view || view.room?.kind !== 'chat') return;
    const roomId = view.room.id;
    const body = root.querySelector('.relay-detail-body');
    const prevHeight = body?.scrollHeight ?? 0;
    const prevTop = body?.scrollTop ?? 0;
    const current = Math.min(view.shown.length, Math.max(CHAT_WINDOW_INITIAL, model.chatLimits?.[roomId] ?? CHAT_WINDOW_INITIAL));
    const limit = Math.min(view.shown.length, Math.max(current, nextLimit));
    if (limit === current) return;
    const next = { ...model, chatLimits: { ...model.chatLimits, [roomId]: limit } };
    commit(next, { focus: limit >= view.shown.length ? CONTENT : KEEP, reveal: false });
    if (preserveScroll) {
      const updatedBody = root.querySelector('.relay-detail-body');
      if (updatedBody) updatedBody.scrollTop = prevTop + Math.max(0, updatedBody.scrollHeight - prevHeight);
    }
  }
  function syncDateRail() {
    const body = root.querySelector('.relay-detail-body');
    const rail = root.querySelector('.relay-date-menu, .relay-date-rail');
    const markers = [...(body?.querySelectorAll('[data-day]') || [])];
    if (!body || !rail || !markers.length || !rail.querySelector('[data-relay-day]')) return;
    const edge = body.getBoundingClientRect().top + 12;
    let current = markers[0];
    for (const marker of markers) if (marker.getBoundingClientRect().top <= edge) current = marker;
    const key = current.dataset.day;
    let changed = false, activeLabel = '';
    for (const chip of rail.querySelectorAll('[data-relay-day]')) {
      const on = chip.dataset.relayDay === key;
      if (chip.classList.contains('active') !== on) changed = true;
      chip.classList.toggle('active', on);
      if (chip.hasAttribute('aria-selected')) chip.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) { chip.setAttribute('aria-current', 'true'); activeLabel = chip.textContent; }
      else chip.removeAttribute('aria-current');
    }
    const label = root.querySelector('.relay-date-menu .relay-edition-label');
    if (label && activeLabel && label.textContent !== activeLabel) label.textContent = activeLabel;
    if (changed) alignDateRail();
  }
  function scrollToDay(key) {
    let body = root.querySelector('.relay-detail-body');
    let target = body?.querySelector(`[data-day="${key}"]`);
    if (!target && view?.room?.kind === 'chat') {
      const idx = view.shown.findIndex(message => dayKey(message.at) === key);
      if (idx >= 0) {
        expandChat(view.shown.length - idx, { preserveScroll: false });
        body = root.querySelector('.relay-detail-body');
        target = body?.querySelector(`[data-day="${key}"]`);
      }
    }
    if (!body || !target) return;
    body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top;
    syncDateRail();
    closeEditionMenu();
  }
  function viewerDialog() {
    let dialog = root.querySelector('.relay-viewer');
    if (dialog) return dialog;
    root.insertAdjacentHTML('beforeend', `<dialog class="relay-viewer" aria-label="사진">
      <div class="relay-viewer-bar"><span class="relay-viewer-count"></span><button type="button" class="relay-viewer-close" data-relay-action="close-image" aria-label="사진 닫기">${GLYPH.close}</button></div>
      <div class="relay-viewer-stage"><button type="button" class="relay-viewer-step" data-relay-action="image-prev" aria-label="이전 사진">${GLYPH.prev}</button><img class="relay-viewer-image" alt=""><button type="button" class="relay-viewer-step" data-relay-action="image-next" aria-label="다음 사진">${GLYPH.next}</button></div>
    </dialog>`);
    dialog = root.querySelector('.relay-viewer');
    dialog.addEventListener('click', event => { if (event.target === dialog) closeViewer(); });
    dialog.addEventListener('close', () => dialog.returnFocus?.focus?.({ preventScroll: true }));
    return dialog;
  }
  function paintViewer() {
    const dialog = root.querySelector('.relay-viewer');
    const item = viewerItems[viewerIndex];
    if (!dialog || !item) return;
    const source = item.querySelector('img');
    const image = dialog.querySelector('.relay-viewer-image');
    image.src = source?.currentSrc || source?.getAttribute('src') || '';
    image.alt = source?.alt || item.getAttribute('aria-label') || '사진';
    const count = dialog.querySelector('.relay-viewer-count');
    const several = viewerItems.length > 1;
    count.hidden = !several;
    count.textContent = several ? `${viewerIndex + 1} / ${viewerItems.length}` : '';
    for (const step of dialog.querySelectorAll('.relay-viewer-step')) step.hidden = !several;
    dialog.querySelector('[data-relay-action="image-prev"]').disabled = viewerIndex === 0;
    dialog.querySelector('[data-relay-action="image-next"]').disabled = viewerIndex >= viewerItems.length - 1;
  }
  function openViewer(button) {
    const group = button.closest('.relay-msg-images');
    viewerItems = group ? [...group.querySelectorAll('.relay-msg-image')] : [button];
    viewerIndex = Math.max(0, viewerItems.indexOf(button));
    const dialog = viewerDialog();
    dialog.returnFocus = button;
    paintViewer();
    try { if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal(); else dialog.setAttribute('open', ''); }
    catch { dialog.setAttribute('open', ''); }
    dialog.querySelector('.relay-viewer-close')?.focus?.({ preventScroll: true });
  }
  function closeViewer() {
    const dialog = root.querySelector('.relay-viewer');
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else { dialog.removeAttribute('open'); dialog.returnFocus?.focus?.({ preventScroll: true }); }
  }
  function stepViewer(delta) {
    viewerIndex = Math.min(viewerItems.length - 1, Math.max(0, viewerIndex + delta));
    paintViewer();
  }
  const viewerOpen = () => { const dialog = root.querySelector('.relay-viewer'); return Boolean(dialog?.open || dialog?.hasAttribute('open')); };

  function turnPaper(delta) {
    if (!view?.edition || view.room?.kind !== 'editions') return false;
    const pages = relayEntries(view.room)[view.edition.index]?.pages || [];
    const next = stepRelayIndex(view.edition.page, delta, pages.length);
    if (next === view.edition.page) return false;
    setCursor(view.edition.index, next);
    return true;
  }
  function turnArticle(delta) {
    if (!view?.article || view.room?.kind !== 'articles') return false;
    const articles = view.shown || [];
    const current = articles.findIndex(item => item.id === view.article.id);
    if (current < 0 || !articles.length) return false;
    const next = stepRelayIndex(current, delta, articles.length);
    if (next === current) return false;
    openArticle(articles[next].id);
    return true;
  }
  let swipe = null;
  let suppressImageClick = false;
  let suppressImageTimer = null;
  function noteSwipeTurn() {
    suppressImageClick = true;
    if (suppressImageTimer) clearTimeout(suppressImageTimer);
    suppressImageTimer = setTimeout(() => { suppressImageClick = false; suppressImageTimer = null; }, 300);
  }
  root.addEventListener('pointerdown', event => {
    suppressImageClick = false;
    if (typeof event.button === 'number' && event.button > 0) return;
    const surface = event.target?.closest?.('.relay-paper-stage, .relay-reader');
    if (!surface || !root.contains(surface) || event.target.closest('a, input, textarea, select, .relay-turn')) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, kind: surface.classList.contains('relay-paper-stage') ? 'paper' : 'article' };
  });
  root.addEventListener('pointerup', event => {
    if (!swipe || (swipe.id != null && event.pointerId != null && event.pointerId !== swipe.id)) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    const kind = swipe.kind;
    swipe = null;
    if (!Number.isFinite(dx) || Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
    const delta = dx < 0 ? 1 : -1;
    if (kind === 'paper') {
      turnPaper(delta);
      noteSwipeTurn();
    } else if (turnArticle(delta)) {
      noteSwipeTurn();
    }
  });
  root.addEventListener('pointercancel', event => {
    if (swipe && (event.pointerId == null || event.pointerId === swipe.id)) swipe = null;
  });

  root.addEventListener('click', event => {
    const action = event.target.closest('[data-relay-action]')?.dataset.relayAction;
    if (action === 'close-image') { closeViewer(); return; }
    if (action === 'image-prev') { stepViewer(-1); return; }
    if (action === 'image-next') { stepViewer(1); return; }
    if (action === 'reload') { void load(); return; }
    if (action === 'edition-menu') { toggleEditionMenu(); return; }
    if (!view) return;
    if (action === 'chat-more') {
      const current = Math.min(view.shown.length, Math.max(CHAT_WINDOW_INITIAL, model.chatLimits?.[view.room.id] ?? CHAT_WINDOW_INITIAL));
      expandChat(current + CHAT_WINDOW_BATCH, { preserveScroll: true });
      return;
    }
    const imageButton = event.target.closest('.relay-msg-image, .relay-paper-open');
    if (imageButton) {
      if (suppressImageClick) { suppressImageClick = false; event.preventDefault(); return; }
      openViewer(imageButton);
      return;
    }
    const dayButton = event.target.closest('[data-relay-day]');
    if (dayButton) { scrollToDay(dayButton.dataset.relayDay); return; }
    const roomButton = event.target.closest('[data-room]');
    if (roomButton) { selectRoom(roomButton.dataset.room); return; }
    const articleButton = event.target.closest('[data-article]');
    if (articleButton) { openArticle(articleButton.dataset.article); return; }
    const editionButton = event.target.closest('[data-edition]');
    if (editionButton) { setCursor(Number(editionButton.dataset.edition), 0); return; }
    const pageButton = event.target.closest('.relay-pager [data-page]');
    if (pageButton) { setCursor(view.edition.index, Number(pageButton.dataset.page)); return; }
    if (action === 'clear-filters') {
      const field = root.querySelector('[name="query"]');
      if (field) field.value = '';
      applyFilters(NO_FILTERS, 'query');
    } else if (action === 'article-back' || action === 'room-back') leave();
    else if (action === 'page-prev') turnPaper(-1);
    else if (action === 'page-next') turnPaper(1);
  });
  root.addEventListener('submit', event => {
    const form = event.target.closest('.relay-filter-form');
    if (!form || !view) return;
    event.preventDefault();
    applyFilters(readFilters(form), 'query');
  });
  root.addEventListener('change', event => {
    if (!view || !event.target.matches('[name="topic"]')) return;
    applyFilters(readFilters(event.target.closest('.relay-filter-form')), 'topic');
  });
  root.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || !view) return;
    if (viewerOpen() && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      stepViewer(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (event.key === 'Escape' && viewerOpen()) { event.preventDefault(); closeViewer(); return; }
    const openMenu = root.querySelector('.relay-edition-list:not([hidden])');
    if (event.key === 'Escape' && openMenu) { event.preventDefault(); closeEditionMenu(); return; }
    if (openMenu && ROW_KEYS.has(event.key) && event.target.closest?.('.relay-edition-menu')) {
      const options = [...openMenu.querySelectorAll('[role="option"], .relay-edition-chip')];
      if (options.length) {
        event.preventDefault();
        const at = options.indexOf(event.target.closest('[role="option"], .relay-edition-chip'));
        let to;
        if (at < 0) {
          const activeIndex = Math.max(0, options.findIndex(el => el.classList.contains('active') || el.getAttribute('aria-selected') === 'true'));
          if (event.key === 'Home') to = 0;
          else if (event.key === 'End') to = options.length - 1;
          else if (event.key === 'ArrowUp') to = Math.max(activeIndex - 1, 0);
          else to = activeIndex;
        } else {
          to = { ArrowDown: Math.min(at + 1, options.length - 1), ArrowUp: Math.max(at - 1, 0), Home: 0, End: options.length - 1 }[event.key];
        }
        options[to]?.focus?.({ preventScroll: true });
        return;
      }
    }
    const row = event.target.closest('.relay-room-item');
    if (row && ROW_KEYS.has(event.key)) { moveRowFocus(event, row); return; }
    if (!openMenu && !viewerOpen() && !event.target?.closest?.('input, textarea, select') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      if (view.room?.kind === 'editions') { event.preventDefault(); turnPaper(delta); return; }
      if (view.room?.kind === 'articles' && view.article) { event.preventDefault(); turnArticle(delta); return; }
    }
    if (event.key === 'Escape') escape(event);
  });
  root.addEventListener('scroll', event => {
    if (event.target?.classList?.contains('relay-detail-body')) syncDateRail();
  }, true);
  root.ownerDocument.addEventListener('pointerdown', event => {
    if (!root.querySelector('.relay-edition-list:not([hidden])')) return;
    if (event.target?.closest?.('.relay-edition-menu')) return;
    closeEditionMenu();
  });
  root.addEventListener('focusin', event => { lastFocus = focusKey(event.target); });
  root.addEventListener('focusout', event => { if (event.relatedTarget && !root.contains(event.relatedTarget)) lastFocus = null; });
  port.subscribe(adopt);

  commit(model);

  return {
    render: () => { repaintAll(null); commit(model); },
    show(visible) { if (visible && model.phase.kind === 'idle') void load(); },
    reload: load,
  };
}
