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
function softWrap(html) {
  return html.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\u0001').replace(/\n/g, ' ').replace(/\u0001/g, '<br><br>');
}
function renderMessageText(message) {
  const text = String(message?.text || '');
  if (!text) return '';
  let html = '', cursor = 0;
  for (const link of messageLinks(message)) {
    if (link.offset < cursor) continue;
    const end = Math.min(text.length, link.offset + link.length);
    if (end <= link.offset) continue;
    html += softWrap(esc(text.slice(cursor, link.offset)));
    html += `<a class="relay-msg-inline-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${softWrap(esc(text.slice(link.offset, end)))}</a>`;
    cursor = end;
  }
  return html + softWrap(esc(text.slice(cursor)));
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
    const messages = Array.isArray(item.messages) ? item.messages : [];
    const last = messages[messages.length - 1];
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
  const edition = Array.isArray(item.editions) ? item.editions[0] : null;
  return edition ? `${edition.version || ''} ${dayLabel(edition.date)}`.trim() : '아직 받은 판본이 없습니다';
}

export function initRelayRoomView({ root, embeddedData, embeddedAssets, onReady } = {}) {
  if (!root) throw new TypeError('relay view root is required');
  let data = null, roomId = null, articleId = null, editionIndex = 0, pageIndex = 0, loading = false, error = null, readySent = false;
  let imageAssets = {};
  let revealLatest = true;
  const imageSource = value => Object.hasOwn(imageAssets, value) ? imageAssets[value] : value;
  const signalReady = () => { if (!readySent) { readySent = true; try { onReady?.(); } catch { /* optional */ } } };

  const rooms = () => (Array.isArray(data?.rooms) ? data.rooms : []);
  const room = () => rooms().find(item => item.id === roomId) || rooms()[0] || null;

  async function load() {
    if (loading) return;
    loading = true; error = null;
    if (!data) render();
    try {
      const inline = embeddedData?.();
      if (inline) {
        data = JSON.parse(inline);
        const assets = embeddedAssets?.();
        imageAssets = assets ? JSON.parse(assets) : {};
      }
      else {
        const response = await fetch('./data/relay/index.json', { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('relay data unavailable');
        data = await response.json();
      }
      if (!rooms().some(item => item.id === roomId)) roomId = rooms()[0]?.id || null;
      revealLatest = true;
    } catch (cause) {
      error = '릴레이 자료를 아직 받지 못했습니다.'; data = null;
    } finally {
      loading = false; render(); signalReady();
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
    const byId = new Map(messages.map(message => [String(message.id), message]));
    const authors = new Set(messages.map(message => String(message.author || '').trim()).filter(Boolean));
    const showAuthor = authors.size > 1;
    let lastDay = null;
    const rows = messages.map(message => {
      const key = dayKey(message.at);
      const heading = key !== lastDay ? dayHeading(message.at) : '';
      lastDay = key;
      const divider = heading ? `<li class="relay-day" role="separator"><span>${esc(heading)}</span></li>` : '';

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
      const quote = message.quote ? `<blockquote class="relay-msg-quote">${softWrap(esc(message.quote))}</blockquote>` : '';
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
          <div class="relay-msg-foot">${album}<time datetime="${esc(message.at || '')}">${esc(clock(message.at))}</time></div>
        </div>
      </li>`;
    }).join('');
    return `<ol class="relay-chat" aria-label="${esc(item.title || '텔레그램')} 메시지">${rows}</ol>`;
  }

  function articleReader(article) {
    const body = String(article.body_text || '').trim();
    const paragraphs = body ? body.split(/\n{2,}/).map(part => `<p>${softWrap(esc(part))}</p>`).join('') : '<p>본문이 아직 없습니다.</p>';
    const images = (Array.isArray(article.images) ? article.images : []).map(image => {
      const src = typeof image === 'string' ? image : image?.src;
      if (!src) return '';
      return `<figure><img src="${esc(imageSource(src))}" alt="${esc(image?.alt || '')}" loading="lazy"></figure>`;
    }).join('');
    const link = safeHref(article.url);
    return `<article class="relay-reader">
      <button type="button" class="relay-reader-back" data-relay-action="article-back">← 글 목록</button>
      <h1>${esc(article.title || '제목 없음')}</h1>
      <p class="relay-byline">${esc(dayLabel(article.published_date || article.at))}${article.author ? ' · ' + esc(article.author) : ''}</p>
      ${link ? `<p class="relay-source-link"><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">네이버 원문</a></p>` : ''}
      <div class="relay-body">${paragraphs}${images}</div>
    </article>`;
  }

  function articleDetail(item) {
    const articles = Array.isArray(item.articles) ? item.articles : [];
    if (!articles.length) return '<p class="relay-empty" role="status">아직 받은 글이 없습니다.</p>';
    const chosen = articles.find(article => article.id === articleId);
    if (chosen) return articleReader(chosen);
    return `<ul class="relay-articles">${articles.map(article => `
      <li><button type="button" class="relay-article" data-article="${esc(article.id)}">
        <span class="relay-article-title">${esc(article.title || '제목 없음')}</span>
        <span class="relay-article-meta">${esc(dayLabel(article.published_date || article.at))}${
          (article.images?.length) ? ` · 사진 ${article.images.length}` : ''}</span>
      </button></li>`).join('')}</ul>`;
  }

  function editionDetail(item) {
    const editions = Array.isArray(item.editions) ? item.editions : [];
    if (!editions.length) return '<p class="relay-empty" role="status">아직 받은 판본이 없습니다.</p>';
    if (editionIndex >= editions.length) editionIndex = 0;
    const edition = editions[editionIndex];
    const pages = Array.isArray(edition.pages) ? edition.pages : [];
    if (pageIndex >= pages.length) pageIndex = 0;
    const page = pages[pageIndex] || null;
    const dates = editions.map((entry, index) => `<button type="button" class="relay-edition-chip${index === editionIndex ? ' active' : ''}" data-edition="${index}">${esc(entry.version || '')} ${esc(dayLabel(entry.date))}</button>`).join('');
    const pager = pages.map((entry, index) => `<button type="button" class="relay-page-chip${index === pageIndex ? ' active' : ''}" data-page="${index}"${index === pageIndex ? ' aria-current="true"' : ''}>${esc(entry.label || String(index + 1))}</button>`).join('');
    const stage = page?.image
      ? `<img class="relay-paper-image" src="${esc(imageSource(page.image))}" alt="${esc(page.alt || (page.label || ''))}" loading="lazy">`
      : `<div class="relay-paper-placeholder">${esc(page?.text || '이미지 준비 중')}</div>`;
    return `<div class="relay-paper">
      <div class="relay-paper-foot"><div class="relay-edition-list">${dates}</div><span class="relay-paper-status">${esc(page?.label || '')} · ${pageIndex + 1}/${Math.max(pages.length, 1)}</span></div>
      <div class="relay-paper-body">
        <div class="relay-paper-stage">${stage}
          <div class="relay-paper-turn"><button type="button" class="relay-turn" data-relay-action="page-prev"${pageIndex === 0 ? ' disabled' : ''} aria-label="이전 면">‹</button><button type="button" class="relay-turn" data-relay-action="page-next"${pageIndex >= pages.length - 1 ? ' disabled' : ''} aria-label="다음 면">›</button></div>
        </div>
        <nav class="relay-pager" aria-label="신문 면 이동">${pager}</nav>
      </div>
    </div>`;
  }

  function detail() {
    const item = room();
    if (!item) return '<p class="relay-empty" role="status">표시할 원천이 없습니다.</p>';
    const kind = item.kind || 'chat';
    const body = kind === 'chat' ? chatDetail(item) : kind === 'editions' ? editionDetail(item) : articleDetail(item);
    const generated = data?.generated_at ? `최근 갱신 ${hhmm(data.generated_at)}` : '';
    return `<header class="relay-detail-head">
        <span class="relay-peer-avatar" data-kind="${esc(kind)}" aria-hidden="true">${kindGlyph(kind)}</span>
        <div class="relay-peer">
          <h2>${esc(item.title || item.id)}</h2>
          <p class="relay-peer-sub">${esc([item.subtitle, countLabel(item)].filter(Boolean).join(' · '))}</p>
        </div>
        <div class="relay-peer-tools">
          ${generated ? `<span class="relay-peer-updated">${esc(generated)}</span>` : ''}
          <button type="button" class="relay-refresh" data-relay-action="reload" aria-label="릴레이 새로고침" title="새로고침">${GLYPH.refresh}</button>
        </div>
      </header>
      <div class="relay-detail-body" role="region" aria-label="${esc(item.title || item.id)} 내용" tabindex="0">${body}</div>`;
  }

  function render() {
    const generatedTime = data?.generated_at ? hhmm(data.generated_at) : '';
    root.innerHTML = `
      <aside class="relay-rooms" aria-label="릴레이 채널">
        <header class="relay-rooms-head"><h1>채널</h1><span class="relay-rooms-total">${rooms().length}</span></header>
        ${rooms().length ? `<ul class="relay-room-list">${roomList()}</ul>` : `<p class="relay-empty" role="status">${loading ? '불러오는 중…' : esc(error || '자료 없음')}</p>`}
        <footer class="relay-rooms-foot">${generatedTime ? `<span>15분마다 갱신</span><time>${esc(generatedTime)}</time>` : '<span>RelayDeck</span>'}</footer>
      </aside>
      <section class="relay-detail">${detail()}</section>`;

    if (revealLatest && data && (room()?.kind || 'chat') === 'chat') {
      revealLatest = false;
      const scrollLatest = () => {
        if ((room()?.kind || 'chat') !== 'chat') return;
        const body = root.querySelector('.relay-detail-body');
        if (body) body.scrollTop = body.scrollHeight;
      };
      scrollLatest();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scrollLatest);
      setTimeout(scrollLatest, 60);
    }
  }

  root.addEventListener('click', event => {
    const roomButton = event.target.closest('[data-room]');
    if (roomButton) { roomId = roomButton.dataset.room; articleId = null; editionIndex = 0; pageIndex = 0; revealLatest = true; render(); return; }
    const articleButton = event.target.closest('[data-article]');
    if (articleButton) { articleId = articleButton.dataset.article; render(); return; }
    const editionButton = event.target.closest('[data-edition]');
    if (editionButton) { editionIndex = Number(editionButton.dataset.edition); pageIndex = 0; render(); return; }
    const pageButton = event.target.closest('.relay-pager [data-page]');
    if (pageButton) { pageIndex = Number(pageButton.dataset.page); render(); return; }
    const action = event.target.closest('[data-relay-action]')?.dataset.relayAction;
    if (action === 'article-back') { articleId = null; render(); }
    else if (action === 'page-prev') { pageIndex = Math.max(0, pageIndex - 1); render(); }
    else if (action === 'page-next') { pageIndex = Math.min((room()?.editions?.[editionIndex]?.pages?.length || 1) - 1, pageIndex + 1); render(); }
    else if (action === 'reload') { revealLatest = true; void load(); }
  });

  render();

  return {
    render,
    show(visible) { if (visible && !data && !loading && !error) void load(); },
    reload: load,
  };
}
