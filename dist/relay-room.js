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
  relay: svg('<path d="M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5"/>'),
  chat: svg('<path d="M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5"/>'),
  book: svg('<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>'),
  paper: svg('<path d="M5 3h11l3 3v15H5V3Zm3 5h8M8 12h8M8 16h5"/>'),
  refresh: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V9H15"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
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
          <div class="relay-msg-foot">${album}<time datetime="${esc(message.at || '')}">${esc(clock(message.at))}</time></div>
        </div>
      </li>`;
    }).join('');
    return `<ol class="relay-chat" aria-label="${esc(item.title || '텔레그램')} 메시지">${rows}</ol>`;
  }

  function articleReader(article, publication = '인생의 방') {
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

  function articleCard(article) {
    const content = articleContentBlocks(article);
    const images = content.filter(block => block.kind === 'image');
    const excerpt = articleExcerpt(article);
    const thumb = images.length
      ? `<span class="relay-article-thumb"><img src="${esc(imageSource(images[0].src))}" alt="" loading="lazy" decoding="async"></span>`
      : '<span class="relay-article-thumb relay-article-thumb--empty" aria-hidden="true"></span>';
    return `<li><button type="button" class="relay-article" data-article="${esc(article.id)}">
      <span class="relay-article-copy">
        <span class="relay-article-meta">${esc(dayLabel(article.published_date || article.at))} · ${articleReadMinutes(article)}분 읽기</span>
        <span class="relay-article-title">${esc(article.title || '제목 없음')}</span>
        ${excerpt ? `<span class="relay-article-excerpt">${esc(excerpt)}</span>` : ''}
        <span class="relay-article-foot">${images.length ? `사진 ${images.length}장` : '글'}</span>
      </span>
      ${thumb}
    </button></li>`;
  }

  function articleDetail(item) {
    const articles = Array.isArray(item.articles) ? item.articles : [];
    if (!articles.length) return '<p class="relay-empty" role="status">아직 받은 글이 없습니다.</p>';
    const chosen = articles.find(article => article.id === articleId);
    if (chosen) return articleReader(chosen, item.title || '인생의 방');
    return `<div class="relay-feed"><ul class="relay-articles">${articles.map(articleCard).join('')}</ul></div>`;
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

  function currentArticle(item) {
    if ((item?.kind || 'chat') !== 'articles' || !articleId) return null;
    return (Array.isArray(item.articles) ? item.articles : []).find(article => article.id === articleId) || null;
  }

  function detail() {
    const item = room();
    if (!item) return '<p class="relay-empty" role="status">표시할 원천이 없습니다.</p>';
    const kind = item.kind || 'chat';
    const article = currentArticle(item);
    const body = kind === 'chat' ? chatDetail(item) : kind === 'editions' ? editionDetail(item) : articleDetail(item);
    const generated = data?.generated_at ? `최근 갱신 ${hhmm(data.generated_at)}` : '';
    const avatar = article
      ? `<button type="button" class="relay-detail-back" data-relay-action="article-back" aria-label="글 목록으로" title="글 목록">${GLYPH.back}</button>`
      : `<span class="relay-peer-avatar" data-kind="${esc(kind)}" aria-hidden="true">${kindGlyph(kind)}</span>`;
    return `<header class="relay-detail-head${article ? ' relay-detail-head--reading' : ''}">
        ${avatar}
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
    const currentRoom = room(), currentKind = currentRoom?.kind || 'chat';
    const reading = !!(currentArticle(currentRoom));
    root.dataset.relayMode = reading ? 'reading' : currentKind === 'articles' ? 'articles' : 'default';
    root.innerHTML = `
      <aside class="relay-rooms" aria-label="릴레이 채널">
        <header class="relay-rooms-head"><h2>채널</h2><span class="relay-rooms-total">${rooms().length}</span></header>
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
