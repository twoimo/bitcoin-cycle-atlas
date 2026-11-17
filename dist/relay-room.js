// 릴레이 콘텐츠 방(Relay room).
//
// RelayDeck은 텔레그램(소수의견)·인생의 방(네이버 프리미엄)·모바일한경 세 원천을 한 리서치룸으로
// 보낸다. 카카오톡은 분류가 안 되므로, 이 화면이 세 원천을 좌측 채널 목록 → 우측 대화로 나눠 보여 준다.
// 데이터는 RelayDeck가 내보낸 ./data/relay/index.json을 읽기만 하며(사이트는 계산하지 않음),
// 값이 없거나 형식이 다르면 조용히 빈 상태를 보여 준다.
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
function dayHeading(iso) {
  const d = kst(iso);
  if (!d) return '';
  const weekday = '일월화수목금토'[d.getUTCDay()];
  const now = new Date(Date.now() + KST);
  const year = d.getUTCFullYear() === now.getUTCFullYear() ? '' : `${d.getUTCFullYear()}년 `;
  return `${year}${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${weekday})`;
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

const svg = path => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">${path}</svg>`;
const GLYPH = {
  relay: svg('<path d="M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5"/>'),
  chat: svg('<path d="M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5"/>'),
  book: svg('<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>'),
  paper: svg('<path d="M5 3h11l3 3v15H5V3Zm3 5h8M8 12h8M8 16h5"/>'),
  refresh: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V9H15"/>'),
};
const KIND_GLYPH = { chat: 'chat', articles: 'book', editions: 'paper' };
const kindGlyph = kind => GLYPH[KIND_GLYPH[kind]] || GLYPH.book;

function roomCount(item) {
  const kind = item?.kind || 'chat';
  return kind === 'chat' ? (item?.messages?.length || 0)
    : kind === 'articles' ? (item?.articles?.length || 0)
      : (item?.editions?.length || 0);
}
function countLabel(item) {
  const count = roomCount(item), kind = item?.kind || 'chat';
  return kind === 'chat' ? `메시지 ${count}개` : kind === 'articles' ? `글 ${count}편` : `판본 ${count}개`;
}
function shortTitle(item) {
  const title = String(item?.title || item?.id || '');
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim() || title;
}
function roomPreview(item) {
  const kind = item?.kind || 'chat';
  if (kind === 'chat') {
    const last = newestMessage(item);
    if (!last) return '아직 받은 메시지가 없습니다';
    const text = String(last.text || '').replace(/\s+/g, ' ').trim();
    if (text) return text.length > 64 ? `${text.slice(0, 64)}…` : text;
    const images = Array.isArray(last.images) ? last.images.length : 0;
    return images ? `사진 ${images}장` : '메시지';
  }
  if (kind === 'articles') {
    const articles = Array.isArray(item.articles) ? item.articles : [];
    const article = articles[articles.length - 1];
    return article?.title ? String(article.title).slice(0, 64) : '아직 받은 글이 없습니다';
  }
  const editions = Array.isArray(item.editions) ? item.editions : [];
  const edition = editions[latestEditionIndex(editions)] || null;
  return edition ? `${edition.version || ''} ${dayLabel(edition.date)}`.trim() : '아직 받은 판본이 없습니다';
}

function seoulToday() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Latest edition whose date is not after today in Seoul. Editions are oldest-first. */
export function latestEditionIndex(editions, today = seoulToday()) {
  let best = -1, bestDate = '';
  (Array.isArray(editions) ? editions : []).forEach((entry, index) => {
    const date = String(entry?.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today && date >= bestDate) {
      best = index; bestDate = date;
    }
  });
  const list = Array.isArray(editions) ? editions : [];
  return best >= 0 ? best : Math.max(0, list.length - 1);
}

function newestMessage(item) {
  let best = null, time = -Infinity;
  for (const message of Array.isArray(item?.messages) ? item.messages : []) {
    const parsed = Date.parse(message?.at || '');
    if (!Number.isNaN(parsed) && parsed >= time) { best = message; time = parsed; }
  }
  return best;
}

function latestObserved(item) {
  const kind = item?.kind || 'chat';
  if (kind === 'chat') {
    const message = newestMessage(item);
    return message?.at ? dayLabel(message.at) : '';
  }
  if (kind === 'articles') {
    let best = '';
    for (const article of Array.isArray(item?.articles) ? item.articles : []) {
      const date = String(article?.published_date || article?.at || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= best) best = date;
    }
    return best ? dayLabel(best) : '';
  }
  const editions = Array.isArray(item?.editions) ? item.editions : [];
  const edition = editions[latestEditionIndex(editions)] || null;
  return edition?.date ? dayLabel(edition.date) : '';
}

function articleImage(article) {
  const direct = Array.isArray(article?.images) ? article.images : [];
  const blocks = Array.isArray(article?.blocks) ? article.blocks.filter(block => block?.kind === 'image') : [];
  return direct[0] || blocks[0] || null;
}

function clipText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function scoreText(text, terms) {
  const hay = text.toLowerCase();
  let score = 0;
  for (const term of terms) if (hay.includes(term)) score += term.length;
  return score;
}

/** Quote loaded relay text. This does not call a remote model and does not invent a source. */
export function answerRelayQuestion(question, rooms) {
  const query = String(question || '').trim();
  if (!query) return { text: '질문을 입력해 주세요.', citations: [] };
  const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length >= 2))];
  if (!terms.length) return { text: '조금 더 구체적으로 물어봐 주세요.', citations: [] };
  const hits = [];
  for (const room of Array.isArray(rooms) ? rooms : []) {
    const kind = room?.kind || 'chat';
    const roomTitle = room?.title || room?.id || '';
    if (kind === 'chat') {
      for (const message of room.messages || []) {
        const text = String(message?.text || '').replace(/\s+/g, ' ').trim();
        const score = scoreText(text, terms);
        if (!text || score < 1) continue;
        hits.push({ score, roomId: room.id, title: roomTitle, at: message.at || '', excerpt: clipText(text, 180) });
      }
    } else if (kind === 'articles') {
      for (const article of room.articles || []) {
        const text = `${article?.title || ''} ${article?.body_text || ''}`.replace(/\s+/g, ' ').trim();
        const score = scoreText(text, terms);
        if (score < 1) continue;
        hits.push({ score, roomId: room.id, title: article?.title || roomTitle, at: article?.published_date || '', excerpt: clipText(text, 180) });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)));
  const citations = hits.slice(0, 3);
  if (!citations.length) return { text: '불러온 릴레이에서 근거를 찾지 못했습니다.', citations: [] };
  const lines = citations.map(hit => `${hit.title} · ${hit.at ? dayLabel(hit.at) : ''}\n${hit.excerpt}`);
  return { text: `불러온 릴레이에서 찾은 내용입니다.\n\n${lines.join('\n\n')}`, citations };
}

function cleanCopy(value) {
  return String(value || '').replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, '').replace(/\u00a0/g, ' ');
}

function paragraphsFrom(value) {
  return cleanCopy(value).split(/\n{2,}/).map(part => part.replace(/[ \t]*\n[ \t]*/g, ' ').trim()).filter(Boolean);
}

const FOLD_LABEL = {
  left: ['채널 접기', '채널 펼치기'],
  center: ['본문 접기', '본문 펼치기'],
  right: ['질문 접기', '질문 펼치기'],
};

function readRelayColumns() {
  const open = { left: true, center: true, right: true };
  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    if (params.has('relay-cols')) {
      const folded = new Set(String(params.get('relay-cols')).split(',').map(part => part.trim()).filter(Boolean));
      open.left = !folded.has('left');
      open.center = !folded.has('center');
      open.right = !folded.has('right');
      return open;
    }
    const saved = JSON.parse(globalThis.localStorage?.getItem('atlas-relay-columns') || 'null');
    for (const key of ['left', 'center', 'right']) if (typeof saved?.[key] === 'boolean') open[key] = saved[key];
  } catch { /* keep the three columns open */ }
  return open;
}

export function initRelayRoomView({ root, embeddedData, embeddedAssets, onReady } = {}) {
  if (!root) throw new TypeError('relay view root is required');
  let data = null, roomId = null, articleId = null, editionIndex = 0, pageIndex = 0, loading = false, error = null, readySent = false;
  let imageAssets = {};
  let revealLatest = true, stickToLatest = true, editionPinned = false, pinnedEditionKey = '', editionMenuOpen = false;
  let stickObserver = null, stickAnchor = 0;
  const columns = readRelayColumns();
  const assistantThread = [{ role: 'assistant', text: '불러온 릴레이 안에서만 찾아 답합니다. 없는 내용은 만들지 않습니다.' }];
  let assistantDraft = '';
  const REFRESH_MS = 15 * 60 * 1000;
  let lastFetchAt = 0;
  function imageSource(value) {
    const src = Object.hasOwn(imageAssets, value) ? imageAssets[value] : value;
    if (typeof src !== 'string' || /^(data:|blob:|https?:)/i.test(src) || src.includes('?')) return src;
    const stamp = data?.generated_at;
    return stamp ? `${src}?v=${encodeURIComponent(stamp)}` : src;
  }
  const signalReady = () => { if (!readySent) { readySent = true; try { onReady?.(); } catch { /* optional */ } } };

  const rooms = () => (Array.isArray(data?.rooms) ? data.rooms : []);
  const room = () => rooms().find(item => item.id === roomId) || rooms()[0] || null;

  function editionKey(entry) {
    return entry ? `${entry.date || ''}|${entry.version || ''}` : '';
  }
  function applyEditionSelection() {
    const editions = rooms().find(item => item.kind === 'editions')?.editions;
    const list = Array.isArray(editions) ? editions : [];
    if (!list.length) { editionIndex = 0; return; }
    if (editionPinned) {
      const found = list.findIndex(entry => editionKey(entry) === pinnedEditionKey);
      if (found >= 0) { editionIndex = found; return; }
      editionPinned = false; pinnedEditionKey = '';
    }
    editionIndex = latestEditionIndex(list);
  }

  async function load({ quiet = false } = {}) {
    if (loading) return;
    loading = true; error = null;
    if (!data) render();
    const previousGenerated = data?.generated_at || '';
    let skipRender = false;
    try {
      const inline = embeddedData?.();
      if (inline) {
        data = JSON.parse(inline);
        const assets = embeddedAssets?.();
        imageAssets = assets ? JSON.parse(assets) : {};
      }
      else {
        const response = await fetch('./data/relay/index.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('relay data unavailable');
        data = await response.json();
      }
      lastFetchAt = Date.now();
      if (!rooms().some(item => item.id === roomId)) roomId = rooms()[0]?.id || null;
      applyEditionSelection();
      const unchanged = quiet && previousGenerated && data?.generated_at === previousGenerated;
      if (unchanged) skipRender = true;
      else if ((room()?.kind || 'chat') === 'chat' && stickToLatest) revealLatest = true;
    } catch (cause) {
      if (!quiet || !data) { error = '릴레이 자료를 아직 받지 못했습니다.'; data = null; }
      else skipRender = true;
    } finally {
      loading = false;
      if (!skipRender) render();
      signalReady();
    }
  }

  function roomList() {
    return rooms().map(item => {
      const kind = item.kind || 'chat';
      const active = item.id === roomId;
      const count = roomCount(item);
      return `<li><button type="button" class="relay-room-item${active ? ' active' : ''}" data-room="${esc(item.id)}" title="${esc(item.title || item.id)}"${active ? ' aria-current="true"' : ''}>
        <span class="relay-room-avatar" data-kind="${esc(kind)}" aria-hidden="true">${kindGlyph(kind)}</span>
        <span class="relay-room-copy">
          <span class="relay-room-top">
            <span class="relay-room-name"><span class="relay-room-full">${esc(item.title || item.id)}</span><span class="relay-room-short">${esc(shortTitle(item))}</span></span>
            <span class="relay-room-count" aria-label="${esc(countLabel(item))}">${count}</span>
          </span>
          <span class="relay-room-sub">${esc(roomPreview(item))}</span>
        </span>
      </button></li>`;
    }).join('');
  }

  function chatDetail(item) {
    const messages = Array.isArray(item.messages) ? item.messages : [];
    if (!messages.length) return '<p class="relay-empty" role="status">아직 받은 메시지가 없습니다.</p>';
    const latest = newestMessage(item);
    const latestId = latest ? String(latest.id) : '';
    const today = seoulToday();
    const byId = new Map(messages.map(message => [String(message.id), message]));
    const authors = new Set(messages.map(message => String(message.author || '').trim()).filter(Boolean));
    const showAuthor = authors.size > 1;
    let lastDay = null, previous = null;
    const rows = messages.map(message => {
      const key = dayKey(message.at);
      const heading = key !== lastDay ? dayHeading(message.at) : '';
      lastDay = key;
      const continued = !heading && previous && String(previous.author || '') === String(message.author || '');
      previous = message;
      const divider = heading ? `<li class="relay-day${key === today ? ' relay-day--today' : ''}" data-day="${esc(key)}" role="separator"><span>${esc(heading)}</span></li>` : '';

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
        `<a class="relay-msg-image" href="${esc(image.src)}" target="_blank" rel="noopener noreferrer"><img src="${esc(image.src)}" alt="${esc(image.alt)}" loading="lazy" decoding="async"${image.dims}></a>`
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
      const author = showAuthor && !continued ? `<span class="relay-msg-author">${esc(message.author || '')}</span>` : '';
      return `${divider}<li class="relay-msg${continued ? ' relay-msg--continued' : ''}${mediaOnly ? ' relay-msg--media' : ''}" data-message-id="${esc(message.id)}"${String(message.id) === latestId ? ' data-latest="true"' : ''}${mediaOnly ? ` data-media="${imageList.length}"` : ''}>
        <div class="relay-bubble">
          ${author}${reply}${quote}${images}
          ${text ? `<p class="relay-msg-text">${text}</p>` : ''}
          ${previews ? `<div class="relay-msg-previews">${previews}</div>` : ''}
          ${withheld}${linkNote}
          <div class="relay-msg-foot">${album}<time datetime="${esc(message.at || '')}">${esc(clock(message.at))}</time></div>
        </div>
      </li>`;
    }).join('');
    return `<ol class="relay-chat" aria-label="${esc(item.title || '텔레그램')} 메시지">${rows}</ol><p class="relay-chat-note">받아 보기만 합니다</p>`;
  }

  function articleFigures(images) {
    return (Array.isArray(images) ? images : []).map(image => {
      const src = typeof image === 'string' ? image : image?.src;
      if (!src) return '';
      const width = Number(image?.width), height = Number(image?.height);
      const dims = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 ? ` width="${width}" height="${height}"` : '';
      return `<figure><img src="${esc(imageSource(src))}" alt="${esc(image?.alt || '')}" loading="lazy" decoding="async"${dims}></figure>`;
    }).join('');
  }

  function articleBody(article) {
    const blocks = Array.isArray(article.blocks) ? article.blocks : [];
    if (blocks.length) {
      const html = blocks.map(block => {
        if (block?.kind === 'image') return articleFigures([block]);
        return paragraphsFrom(block?.text).map(part => `<p>${esc(part)}</p>`).join('');
      }).join('');
      return html || '<p>본문이 아직 없습니다.</p>';
    }
    const paragraphs = paragraphsFrom(article.body_text).map(part => `<p>${esc(part)}</p>`).join('');
    return `${paragraphs || '<p>본문이 아직 없습니다.</p>'}${articleFigures(article.images)}`;
  }

  function articleReader(article) {
    const link = safeHref(article.url);
    return `<article class="relay-reader">
      <button type="button" class="relay-reader-back" data-relay-action="article-back">← 글 목록</button>
      <h1>${esc(article.title || '제목 없음')}</h1>
      <p class="relay-byline">${esc(dayLabel(article.published_date || article.at))}${article.author ? ' · ' + esc(article.author) : ''}</p>
      ${link ? `<p class="relay-source-link"><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">네이버 원문</a></p>` : ''}
      <div class="relay-body">${articleBody(article)}</div>
    </article>`;
  }

  function articleDetail(item) {
    const articles = Array.isArray(item.articles) ? item.articles : [];
    if (!articles.length) return '<p class="relay-empty" role="status">아직 받은 글이 없습니다.</p>';
    const chosen = articles.find(article => article.id === articleId);
    if (chosen) return articleReader(chosen);
    const ordered = [...articles].reverse();
    return `<ul class="relay-articles">${ordered.map(article => {
      const image = articleImage(article);
      const src = typeof image === 'string' ? image : image?.src;
      const alt = typeof image === 'string' ? (article.title || '글 사진') : (image?.alt || article.title || '글 사진');
      const thumb = src
        ? `<img class="relay-article-thumb" src="${esc(imageSource(src))}" alt="${esc(alt)}" width="72" height="72" loading="lazy" decoding="async">`
        : '<span class="relay-article-thumb relay-article-thumb--empty" aria-hidden="true"></span>';
      return `<li><button type="button" class="relay-article" data-article="${esc(article.id)}">
        ${thumb}
        <span class="relay-article-copy">
          <span class="relay-article-title">${esc(article.title || '제목 없음')}</span>
          <span class="relay-article-meta">${esc(dayLabel(article.published_date || article.at))}</span>
        </span>
      </button></li>`;
    }).join('')}</ul>`;
  }

  function editionDetail(item) {
    const editions = Array.isArray(item.editions) ? item.editions : [];
    if (!editions.length) return '<p class="relay-empty" role="status">아직 받은 판본이 없습니다.</p>';
    if (editionIndex >= editions.length) editionIndex = 0;
    const edition = editions[editionIndex];
    const pages = Array.isArray(edition.pages) ? edition.pages : [];
    if (pageIndex >= pages.length) pageIndex = 0;
    const page = pages[pageIndex] || null;
    const pager = pages.map((entry, index) => `<button type="button" class="relay-page-chip${index === pageIndex ? ' active' : ''}" data-page="${index}"${index === pageIndex ? ' aria-current="true"' : ''}>${esc(entry.label || String(index + 1))}</button>`).join('');
    const stage = page?.image
      ? `<img class="relay-paper-image" src="${esc(imageSource(page.image))}" alt="${esc(page.alt || (page.label || ''))}" decoding="async">`
      : `<div class="relay-paper-placeholder">${esc(page?.text || '이미지 준비 중')}</div>`;
    return `<div class="relay-paper" data-paper-room="${esc(item.id)}" data-paper-edition="${editionIndex}">
      <div class="relay-paper-foot"><span class="relay-paper-status">${esc(page?.label || '')} · ${pageIndex + 1}/${Math.max(pages.length, 1)}</span></div>
      <div class="relay-paper-body">
        <div class="relay-paper-stage">${stage}
          <div class="relay-paper-turn"><button type="button" class="relay-turn" data-relay-action="page-prev"${pageIndex === 0 ? ' disabled' : ''} aria-label="이전 면">‹</button><button type="button" class="relay-turn" data-relay-action="page-next"${pageIndex >= pages.length - 1 ? ' disabled' : ''} aria-label="다음 면">›</button></div>
        </div>
        <nav class="relay-pager" aria-label="신문 면 이동">${pager}</nav>
      </div>
    </div>`;
  }

  function foldButton(name) {
    const open = columns[name] !== false;
    const label = open ? FOLD_LABEL[name][0] : FOLD_LABEL[name][1];
    const controls = name === 'left' ? 'relay-channels' : name === 'center' ? 'relay-thread' : 'relay-assistant';
    return `<button type="button" class="relay-fold" data-relay-column="${name}" aria-controls="${controls}" aria-expanded="${open ? 'true' : 'false'}" aria-label="${esc(label)}">${open ? '접기' : '펼치기'}</button>`;
  }
  function editionMenu(item) {
    if ((item?.kind || '') !== 'editions') return '';
    const editions = Array.isArray(item.editions) ? item.editions : [];
    if (!editions.length) return '';
    const current = editions[Math.min(editionIndex, editions.length - 1)];
    const label = `${current?.version || ''} ${dayLabel(current?.date)}`.trim();
    const options = editions.map((entry, index) => ({ entry, index })).reverse().map(({ entry, index }) =>
      `<li role="presentation"><button type="button" role="option" class="relay-edition-chip${index === editionIndex ? ' active' : ''}" data-edition="${index}" aria-selected="${index === editionIndex ? 'true' : 'false'}">${esc(entry.version || '')} ${esc(dayLabel(entry.date))}</button></li>`
    ).join('');
    return `<div class="relay-edition-picker">
      <button type="button" class="relay-edition-current" data-relay-action="edition-menu" aria-haspopup="listbox" aria-expanded="${editionMenuOpen ? 'true' : 'false'}" aria-controls="relay-edition-menu">${esc(label)}</button>
      <ul id="relay-edition-menu" class="relay-edition-menu" role="listbox" aria-label="판본 날짜"${editionMenuOpen ? '' : ' hidden'}>${options}</ul>
    </div>`;
  }
  function detail() {
    const item = room();
    if (!item) return '<p class="relay-empty" role="status">표시할 원천이 없습니다.</p>';
    const kind = item.kind || 'chat';
    const body = kind === 'chat' ? chatDetail(item) : kind === 'editions' ? editionDetail(item) : articleDetail(item);
    const generated = data?.generated_at ? `최근 갱신 ${hhmm(data.generated_at)}` : '';
    const observed = latestObserved(item);
    return `<header class="relay-detail-head">
        ${foldButton('center')}
        <span class="relay-peer-avatar" data-kind="${esc(kind)}" aria-hidden="true">${kindGlyph(kind)}</span>
        <div class="relay-peer">
          <h2>${esc(item.title || item.id)}</h2>
          <p class="relay-peer-sub">${esc([item.subtitle, countLabel(item), observed ? `최근 ${observed}` : ''].filter(Boolean).join(' · '))}</p>
        </div>
        <div class="relay-peer-tools">
          ${editionMenu(item)}
          ${generated ? `<span class="relay-peer-updated">${esc(generated)}</span>` : ''}
          <button type="button" class="relay-refresh" data-relay-action="reload" aria-label="릴레이 새로고침" title="새로고침">${GLYPH.refresh}</button>
        </div>
      </header>
      <div class="relay-detail-body" role="region" aria-label="${esc(item.title || item.id)} 내용" tabindex="0">${body}</div>`;
  }

  const warmedPaper = new Map();
  function shellKey() {
    return [loading ? 1 : 0, error || '', data?.generated_at || '', rooms().map(item => item.id).join('\n')].join('|');
  }
  function detailKey() {
    const item = room();
    return [item?.id || '', item?.kind || '', articleId || '', editionIndex, pageIndex, loading ? 1 : 0, error || ''].join('|');
  }
  function currentEdition() {
    const item = room();
    if (!item || (item.kind || 'chat') !== 'editions') return null;
    const editions = Array.isArray(item.editions) ? item.editions : [];
    if (!editions.length) return null;
    if (editionIndex >= editions.length) editionIndex = 0;
    const edition = editions[editionIndex];
    const pages = Array.isArray(edition.pages) ? edition.pages : [];
    if (pageIndex >= pages.length) pageIndex = 0;
    return { item, pages, page: pages[pageIndex] || null };
  }
  function warmPaper(url) {
    if (!url || warmedPaper.has(url) || typeof Image !== 'function') return;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    warmedPaper.set(url, img);
  }
  function preloadPaper() {
    const current = currentEdition();
    if (!current) return;
    for (const index of [pageIndex - 1, pageIndex + 1]) {
      const image = current.pages[index]?.image;
      if (image) warmPaper(imageSource(image));
    }
  }
  function showPaperImage(stage, src, alt) {
    const current = stage.querySelector('.relay-paper-image:not(.relay-paper-image-incoming)');
    if (current?.getAttribute('src') === src) {
      current.alt = alt;
      for (const extra of stage.querySelectorAll('.relay-paper-image-incoming')) extra.remove();
      stage.querySelector('.relay-paper-placeholder')?.remove();
      return;
    }
    for (const extra of stage.querySelectorAll('.relay-paper-image-incoming')) extra.remove();
    stage.querySelector('.relay-paper-placeholder')?.remove();
    const incoming = stage.ownerDocument.createElement('img');
    incoming.className = 'relay-paper-image relay-paper-image-incoming';
    incoming.alt = alt;
    incoming.decoding = 'async';
    const commit = () => {
      if (!incoming.isConnected || stage.dataset.pendingSrc !== src) return;
      current?.remove();
      incoming.classList.remove('relay-paper-image-incoming');
    };
    stage.dataset.pendingSrc = src;
    incoming.addEventListener('load', commit, { once: true });
    incoming.addEventListener('error', commit, { once: true });
    stage.insertBefore(incoming, stage.firstChild);
    incoming.src = src;
    if (incoming.complete) commit();
  }
  function showPaperPlaceholder(stage, text) {
    stage.dataset.pendingSrc = '';
    for (const img of stage.querySelectorAll('.relay-paper-image')) img.remove();
    let note = stage.querySelector('.relay-paper-placeholder');
    if (!note) {
      note = stage.ownerDocument.createElement('div');
      note.className = 'relay-paper-placeholder';
      stage.insertBefore(note, stage.firstChild);
    }
    note.textContent = text;
  }
  // Page turns stay on the painted sheet until the next bitmap can draw.
  // Rebuilding the room here dropped the current image for at least one frame.
  function patchPaper(detailHost) {
    const paper = detailHost?.querySelector('.relay-paper');
    const current = currentEdition();
    if (!paper || !current?.page) return false;
    if (paper.dataset.paperRoom !== current.item.id || paper.dataset.paperEdition !== String(editionIndex)) return false;
    const page = current.page;
    const status = paper.querySelector('.relay-paper-status');
    if (status) status.textContent = `${page.label || ''} · ${pageIndex + 1}/${Math.max(current.pages.length, 1)}`;
    for (const chip of paper.querySelectorAll('.relay-page-chip')) {
      const on = Number(chip.dataset.page) === pageIndex;
      chip.classList.toggle('active', on);
      if (on) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    }
    const prev = paper.querySelector('[data-relay-action="page-prev"]');
    const next = paper.querySelector('[data-relay-action="page-next"]');
    if (prev) prev.disabled = pageIndex === 0;
    if (next) next.disabled = pageIndex >= current.pages.length - 1;
    const stage = paper.querySelector('.relay-paper-stage');
    if (!stage) return false;
    if (page.image) showPaperImage(stage, imageSource(page.image), page.alt || page.label || '');
    else showPaperPlaceholder(stage, page.text || '이미지 준비 중');
    return true;
  }
  function syncRoomSelection() {
    const selected = room()?.id;
    for (const button of root.querySelectorAll('[data-room]')) {
      const active = button.dataset.room === selected;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  }
  function revealChat() {
    stickObserver?.disconnect();
    stickObserver = null;
    const shouldStick = revealLatest || stickToLatest;
    if (!(shouldStick && data && (room()?.kind || 'chat') === 'chat')) { revealLatest = false; return; }
    revealLatest = false;
    const body = root.querySelector('.relay-detail-body');
    const chat = body?.querySelector('.relay-chat');
    if (!body || !chat) return;
    const scrollLatest = () => {
      if (!stickToLatest || (room()?.kind || 'chat') !== 'chat') return;
      const last = chat.querySelector('[data-latest="true"]') || chat.lastElementChild;
      if (typeof last?.scrollIntoView === 'function') last.scrollIntoView({ block: 'end' });
      body.scrollTop = body.scrollHeight;
      stickAnchor = body.scrollTop;
    };
    scrollLatest();
    if (typeof ResizeObserver === 'function') {
      stickObserver = new ResizeObserver(scrollLatest);
      stickObserver.observe(chat);
    }
    const view = body.ownerDocument?.defaultView;
    (view?.setTimeout || setTimeout)(scrollLatest, 60);
    for (const image of chat.querySelectorAll('img')) {
      if (!image.complete) image.addEventListener('load', scrollLatest, { once: true });
    }
  }
  function applyColumns() {
    root.dataset.left = columns.left ? 'open' : 'closed';
    root.dataset.center = columns.center ? 'open' : 'closed';
    root.dataset.right = columns.right ? 'open' : 'closed';
    for (const name of ['left', 'center', 'right']) {
      const button = root.querySelector(`[data-relay-column="${name}"]`);
      if (!button) continue;
      const open = columns[name] !== false;
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? FOLD_LABEL[name][0] : FOLD_LABEL[name][1]);
      button.textContent = open ? '접기' : '펼치기';
    }
  }
  function paintAssistant() {
    const log = root.querySelector('.relay-assistant-log');
    if (!log) return;
    log.replaceChildren();
    for (const entry of assistantThread) {
      const item = root.ownerDocument.createElement('li');
      item.className = 'relay-assistant-line';
      item.dataset.role = entry.role;
      const text = root.ownerDocument.createElement('p');
      text.textContent = entry.text;
      item.append(text);
      log.append(item);
    }
    log.scrollTop = log.scrollHeight;
  }
  function render() {
    const key = shellKey();
    if (root.dataset.shellKey === key && root.querySelector('.relay-rooms')) {
      syncRoomSelection();
      const detailHost = root.querySelector('.relay-detail');
      if (patchPaper(detailHost)) { preloadPaper(); return; }
      if (root.dataset.detailKey !== detailKey()) {
        detailHost.innerHTML = detail();
        root.dataset.detailKey = detailKey();
        revealChat();
      }
      preloadPaper();
      return;
    }
    const generatedTime = data?.generated_at ? hhmm(data.generated_at) : '';
    root.dataset.shellKey = key;
    root.innerHTML = `
      <aside class="relay-rooms" id="relay-channels" aria-label="릴레이 채널">
        <header class="relay-rooms-head">${foldButton('left')}<h1>채널</h1><span class="relay-rooms-total">${rooms().length}</span></header>
        ${rooms().length ? `<ul class="relay-room-list">${roomList()}</ul>` : `<p class="relay-empty" role="status">${loading ? '불러오는 중…' : esc(error || '자료 없음')}</p>`}
        <footer class="relay-rooms-foot">${generatedTime ? `<span>15분마다 갱신</span><time>${esc(generatedTime)}</time>` : '<span>RelayDeck</span>'}</footer>
      </aside>
      <section class="relay-detail" id="relay-thread">${detail()}</section>
      <aside class="relay-assistant" id="relay-assistant" aria-label="릴레이 질문">
        <header class="relay-assistant-head"><h2>질문</h2>${foldButton('right')}</header>
        <ol class="relay-assistant-log" aria-live="polite"></ol>
        <form class="relay-assistant-form">
          <label class="relay-assistant-label">질문
            <textarea class="relay-assistant-input" rows="3" maxlength="500" placeholder="불러온 릴레이에서 찾아 보세요"></textarea>
          </label>
          <button type="submit">보내기</button>
        </form>
      </aside>`;
    root.dataset.detailKey = detailKey();
    const assistantInput = root.querySelector('.relay-assistant-input');
    if (assistantInput) assistantInput.value = assistantDraft;
    applyColumns();
    paintAssistant();
    preloadPaper();
    revealChat();
  }

  root.addEventListener('click', event => {
    const fold = event.target.closest('[data-relay-column]');
    if (fold && root.contains(fold)) {
      const name = fold.dataset.relayColumn;
      if (Object.hasOwn(columns, name)) {
        columns[name] = !columns[name];
        applyColumns();
        try { globalThis.localStorage?.setItem('atlas-relay-columns', JSON.stringify(columns)); } catch { /* the layout still changes */ }
      }
      return;
    }
    if (editionMenuOpen && !event.target.closest('.relay-edition-picker')) {
      editionMenuOpen = false;
      const menu = root.querySelector('#relay-edition-menu');
      const button = root.querySelector('[data-relay-action="edition-menu"]');
      if (menu) menu.hidden = true;
      if (button) button.setAttribute('aria-expanded', 'false');
    }
    const roomButton = event.target.closest('[data-room]');
    if (roomButton) {
      roomId = roomButton.dataset.room; articleId = null; pageIndex = 0; revealLatest = true; stickToLatest = true;
      const next = rooms().find(item => item.id === roomId);
      if (next?.kind === 'editions') { editionPinned = false; pinnedEditionKey = ''; applyEditionSelection(); }
      render(); return;
    }
    const articleButton = event.target.closest('[data-article]');
    if (articleButton) { articleId = articleButton.dataset.article; render(); return; }
    const editionButton = event.target.closest('[data-edition]');
    if (editionButton) {
      editionIndex = Number(editionButton.dataset.edition); pageIndex = 0; editionMenuOpen = false;
      editionPinned = true; pinnedEditionKey = editionKey(room()?.editions?.[editionIndex]);
      render(); return;
    }
    const pageButton = event.target.closest('.relay-pager [data-page]');
    if (pageButton) { pageIndex = Number(pageButton.dataset.page); render(); return; }
    const action = event.target.closest('[data-relay-action]')?.dataset.relayAction;
    if (action === 'edition-menu') {
      editionMenuOpen = !editionMenuOpen;
      const menu = root.querySelector('#relay-edition-menu');
      const button = root.querySelector('[data-relay-action="edition-menu"]');
      if (menu) menu.hidden = !editionMenuOpen;
      if (button) button.setAttribute('aria-expanded', String(editionMenuOpen));
      return;
    }
    if (action === 'article-back') { articleId = null; render(); }
    else if (action === 'page-prev') { pageIndex = Math.max(0, pageIndex - 1); render(); }
    else if (action === 'page-next') { pageIndex = Math.min((room()?.editions?.[editionIndex]?.pages?.length || 1) - 1, pageIndex + 1); render(); }
    else if (action === 'reload') { revealLatest = true; void load(); }
  });

  root.addEventListener('scroll', event => {
    const body = event.target?.closest?.('.relay-detail-body');
    if (!body || !root.contains(body) || (room()?.kind || 'chat') !== 'chat') return;
    if (body.scrollTop >= stickAnchor - 48) return;
    stickToLatest = false;
    if (!stickToLatest) { stickObserver?.disconnect(); stickObserver = null; }
  }, true);
  root.addEventListener('submit', event => {
    const form = event.target?.closest?.('.relay-assistant-form');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const input = form.querySelector('textarea');
    const question = String(input?.value || '').trim();
    if (!question) return;
    assistantThread.push({ role: 'user', text: question });
    assistantThread.push({ role: 'assistant', text: answerRelayQuestion(question, rooms()).text });
    assistantDraft = '';
    if (input) input.value = '';
    paintAssistant();
  });
  root.addEventListener('input', event => {
    if (event.target?.classList?.contains('relay-assistant-input')) assistantDraft = event.target.value;
  });
  root.addEventListener('keydown', event => {
    if (event.target?.closest?.('input, textarea, select')) return;
    if (event.key !== '[' && event.key !== ']') return;
    const name = event.key === '[' ? 'left' : 'right';
    columns[name] = !columns[name];
    applyColumns();
    try { globalThis.localStorage?.setItem('atlas-relay-columns', JSON.stringify(columns)); } catch { /* the layout still changes */ }
  });

  render();
  if (typeof embeddedData !== 'function') {
    const page = root.ownerDocument;
    const view = page?.defaultView;
    const timer = (view?.setInterval || setInterval)(() => {
      if (page.visibilityState === 'hidden') return;
      void load({ quiet: true });
    }, REFRESH_MS);
    timer.unref?.();
    page.addEventListener?.('visibilitychange', () => {
      if (page.visibilityState === 'hidden' || Date.now() - lastFetchAt < 60 * 1000) return;
      void load({ quiet: true });
    });
  }

  return {
    render,
    show(visible) { if (visible && !data && !loading && !error) void load(); },
    reload: load,
  };
}
