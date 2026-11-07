// 릴레이 콘텐츠 방(Relay room).
//
// RelayDeck은 텔레그램(소수의견)·인생의 방(네이버 프리미엄)·모바일한경 세 원천을 한 리서치룸으로
// 보낸다. 카카오톡은 분류가 안 되므로, 이 화면이 세 원천을 좌측 목록 → 우측 상세로 나눠 보여 준다.
// 데이터는 RelayDeck가 내보낸 ./data/relay/index.json을 읽기만 하며(사이트는 계산하지 않음),
// 값이 없거나 형식이 다르면 조용히 빈 상태를 보여 준다.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function hhmm(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 9 * 3600000); // KST 표시
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function dayLabel(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso ?? '');
  const d = new Date(t + 9 * 3600000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}
const safeHref = value => (typeof value === 'string' && /^https:\/\//.test(value) ? value : null);

const svg = path => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">${path}</svg>`;
const GLYPH = {
  relay: svg('<path d="M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5"/>'),
  chat: svg('<path d="M4 5h16v11H7l-3 3V5Zm4 4h8M8 12h5"/>'),
  book: svg('<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14"/>'),
  paper: svg('<path d="M5 3h11l3 3v15H5V3Zm3 5h8M8 12h8M8 16h5"/>'),
};
const KIND_GLYPH = { chat: 'chat', articles: 'book', editions: 'paper' };

export function initRelayRoomView({ root, embeddedData, onReady } = {}) {
  if (!root) throw new TypeError('relay view root is required');
  let data = null, roomId = null, articleId = null, editionIndex = 0, pageIndex = 0, loading = false, error = null, readySent = false;
  const signalReady = () => { if (!readySent) { readySent = true; try { onReady?.(); } catch { /* optional */ } } };

  const rooms = () => (Array.isArray(data?.rooms) ? data.rooms : []);
  const room = () => rooms().find(item => item.id === roomId) || rooms()[0] || null;

  async function load() {
    if (loading) return;
    loading = true; error = null; render();
    try {
      const inline = embeddedData?.();
      if (inline) data = JSON.parse(inline);
      else {
        const response = await fetch('./data/relay/index.json', { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('relay data unavailable');
        data = await response.json();
      }
      if (!rooms().some(item => item.id === roomId)) roomId = rooms()[0]?.id || null;
    } catch (cause) {
      error = '릴레이 자료를 아직 받지 못했습니다.'; data = null;
    } finally {
      loading = false; render(); signalReady();
    }
  }

  function roomList() {
    return rooms().map(item => {
      const kind = item.kind || 'chat';
      const count = kind === 'chat' ? (item.messages?.length || 0)
        : kind === 'articles' ? (item.articles?.length || 0)
          : (item.editions?.length || 0);
      const active = item.id === roomId ? ' active' : '';
      return `<li><button type="button" class="relay-room-item${active}" data-room="${esc(item.id)}"${active ? ' aria-current="true"' : ''}>
        <span class="relay-room-glyph" aria-hidden="true">${GLYPH[KIND_GLYPH[kind]] || GLYPH.book}</span>
        <span class="relay-room-name">${esc(item.title || item.id)}</span>
        <span class="relay-room-sub">${esc(item.subtitle || '')}</span>
        <span class="relay-room-count">${count}</span>
      </button></li>`;
    }).join('');
  }

  function chatDetail(item) {
    const messages = Array.isArray(item.messages) ? item.messages : [];
    if (!messages.length) return '<p class="relay-empty" role="status">아직 받은 메시지가 없습니다.</p>';
    return `<ol class="relay-chat">${messages.map(message => {
      const link = safeHref(message.url || message.link);
      const body = esc(message.text || '').replace(/\n/g, '<br>');
      return `<li class="relay-msg">
        <div class="relay-msg-meta"><span class="relay-msg-author">${esc(message.author || item.title || '')}</span><time>${esc(hhmm(message.at))}</time></div>
        <p class="relay-msg-text">${body}</p>
        ${link ? `<a class="relay-msg-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">원문 링크</a>` : ''}
      </li>`;
    }).join('')}</ol>`;
  }

  function articleReader(article) {
    const body = String(article.body_text || '').trim();
    const paragraphs = body ? body.split(/\n{2,}/).map(part => `<p>${esc(part).replace(/\n/g, '<br>')}</p>`).join('') : '<p>본문이 아직 없습니다.</p>';
    const images = (Array.isArray(article.images) ? article.images : []).map(image => {
      const src = typeof image === 'string' ? image : image?.src;
      if (!src) return '';
      return `<figure><img src="${esc(src)}" alt="${esc(image?.alt || '')}" loading="lazy"></figure>`;
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
      ? `<img class="relay-paper-image" src="${esc(page.image)}" alt="${esc(page.alt || (page.label || ''))}" loading="lazy">`
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
    return `<header class="relay-detail-head">
        <h2>${esc(item.title || item.id)}</h2>
        <span class="relay-detail-sub">${esc(item.subtitle || '')}${item.updated_at ? ' · ' + esc(hhmm(item.updated_at)) : ''}</span>
      </header>
      <div class="relay-detail-body">${body}</div>`;
  }

  function render() {
    const generated = data?.generated_at ? `최근 갱신 ${esc(hhmm(data.generated_at))}` : '';
    root.innerHTML = `
      <aside class="relay-rooms" aria-label="릴레이 원천">
        <header class="relay-rooms-head">${GLYPH.relay}<h1>릴레이 콘텐츠</h1></header>
        ${rooms().length ? `<ul class="relay-room-list">${roomList()}</ul>` : `<p class="relay-empty" role="status">${loading ? '불러오는 중…' : esc(error || '자료 없음')}</p>`}
        <footer class="relay-rooms-foot">${generated || 'RelayDeck'}</footer>
      </aside>
      <section class="relay-detail">${detail()}</section>`;
  }

  root.addEventListener('click', event => {
    const roomButton = event.target.closest('[data-room]');
    if (roomButton) { roomId = roomButton.dataset.room; articleId = null; editionIndex = 0; pageIndex = 0; render(); return; }
    const articleButton = event.target.closest('[data-article]');
    if (articleButton) { articleId = articleButton.dataset.article; render(); return; }
    const editionButton = event.target.closest('[data-edition]');
    if (editionButton) { editionIndex = Number(editionButton.dataset.edition); pageIndex = 0; render(); return; }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) { pageIndex = Number(pageButton.dataset.page); render(); return; }
    const action = event.target.closest('[data-relay-action]')?.dataset.relayAction;
    if (action === 'article-back') { articleId = null; render(); }
    else if (action === 'page-prev') { pageIndex = Math.max(0, pageIndex - 1); render(); }
    else if (action === 'page-next') { pageIndex = Math.min((room()?.editions?.[editionIndex]?.pages?.length || 1) - 1, pageIndex + 1); render(); }
  });

  render();

  return {
    render,
    show(visible) { if (visible && !data && !loading && !error) void load(); },
    reload: load,
  };
}
