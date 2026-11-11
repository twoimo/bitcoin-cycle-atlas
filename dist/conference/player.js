import {assertConferenceTimeline} from './timeline.js';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const icon = name => {
  const paths = {
    play:'M8 5l11 7-11 7z', pause:'M8 5v14M16 5v14',
    previous:'M6 5v14M18 5l-9 7 9 7z', next:'M18 5v14M6 5l9 7-9 7z',
    previousTalk:'M4 5v14M12 6l-6 6 6 6M20 6l-6 6 6 6',
    nextTalk:'M20 5v14M12 6l6 6-6 6M4 6l6 6-6 6',
    zoom:'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12M14.5 14.5L21 21M7 10h6M10 7v6',
    fullscreen:'M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6',
    settings:'M4 7h16M4 17h16M8 4v6M16 14v6',
    close:'M6 6l12 12M18 6L6 18',
    transcript:'M4 4h16v16H4zM7 8h10M7 12h10M7 16h7',
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + paths[name] + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
};

export function formatConferenceTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), rest = total % 60;
  return (hours ? hours + ':' + String(minutes).padStart(2, '0') : String(minutes)) + ':' + String(rest).padStart(2, '0');
}

export function conferenceSegmentIndex(segments, seconds) {
  let low = 0, high = segments.length - 1, result = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (segments[middle].t0 <= seconds) { result = middle; low = middle + 1; }
    else high = middle - 1;
  }
  return result;
}

export function conferenceMappedPage(segments, index, deck) {
  const current = index < 0 ? null : segments[index].page?.[deck] ?? null;
  if (current !== null) return {page:current, mapped:true};
  for (let i = index - 1; i >= 0; i--) {
    const previous = segments[i].page?.[deck];
    if (Number.isInteger(previous)) return {page:previous, mapped:false};
  }
  return {page:null, mapped:false};
}

// The shell owns the sole H1 and all other destinations. This player only owns
// its mounted host, native media, transcript dialog and scoped keyboard input.
export function mountConferencePlayer(host, options = {}) {
  const document = options.document || host.ownerDocument;
  const view = options.window || document.defaultView;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timelineUrl = new URL(options.timelineUrl || './conference/timeline.json', view?.location?.href || 'http://localhost/').href;
  const state = {status:'loading', time:0, duration:0, deck:null, page:null, segment:-1,
    playing:false, playPending:false, follow:true, auto:true, rate:1, transcript:false, settings:false, zoom:false};
  let timeline = null, destroyed = false, loadVersion = 0, abort = null, playVersion = 0;
  let audioIndex = -1, pendingSeek = null, lastAnnouncement = null, lastUrlKey = null;
  let transcriptOpener = null, transcriptMode = null, imageVersion = 0, imageKey = null;
  let imagePreload = null, resizeObserver = null, mediaError = false;
  const disposers = [], transcriptRows = [], imageCache = new Map();

  host.innerHTML = [
    '<section class="conference-player" data-state="loading" aria-label="컨퍼런스 플레이어">',
    '<div class="conference-main">',
      '<div class="conference-visual">',
        '<div class="conference-event"><span data-role="event-title">컨퍼런스 자료</span><span data-role="talk-title"></span></div>',
        '<div class="conference-stage">',
          '<button type="button" class="conference-slide" data-action="slide" aria-label="현재 장표의 첫 발화로 이동" disabled>',
            '<img class="conference-slide-image" alt="" hidden decoding="async">',
            '<span class="conference-stage-message"><strong data-role="state-title">복습 자료를 불러오는 중</strong><span data-role="state-detail"></span></span>',
          '</button>',
          '<div class="conference-stage-tools">',
            '<button type="button" data-action="zoom" aria-label="장표 확대" aria-pressed="false" disabled>' + icon('zoom') + '</button>',
            '<button type="button" data-action="fullscreen" aria-label="장표 전체화면" disabled>' + icon('fullscreen') + '</button>',
            '<label class="conference-page-field"><span class="conference-sr-only">장표 페이지</span><input data-role="page" type="number" min="1" step="1" inputmode="numeric" aria-label="장표 페이지" disabled><span data-role="page-total">/ —</span></label>',
          '</div>',
          '<span class="conference-page-status" data-role="page-status" hidden></span>',
        '</div>',
      '</div>',
      '<button type="button" class="conference-caption" data-action="transcript" aria-label="자막 전체 보기" aria-expanded="false" disabled>',
        '<span class="conference-caption-text">재생 자료가 준비되면 자막이 표시됩니다.</span>',
      '</button>',
      '<div class="conference-live conference-sr-only" aria-live="polite" aria-atomic="true"></div>',
      '<div class="conference-controls" aria-label="재생 조작">',
        '<div class="conference-progress">',
          '<div class="conference-track"><input data-role="timeline" type="range" min="0" max="1" step="0.1" value="0" aria-label="전체 이벤트 재생 위치" disabled><div class="conference-markers" aria-hidden="true"></div></div>',
          '<div class="conference-clock" aria-live="off"><span data-role="current-time">0:00</span><span aria-hidden="true"> / </span><span data-role="total-time">—:—</span></div>',
        '</div>',
        '<div class="conference-transport">',
          '<button type="button" data-action="previous-talk" aria-label="이전 발표" title="이전 발표" disabled>' + icon('previousTalk') + '</button>',
          '<button type="button" data-action="previous-slide" aria-label="이전 장표" aria-keyshortcuts="[" title="이전 장표 · [" disabled>' + icon('previous') + '</button>',
          '<button type="button" data-action="backward" aria-label="10초 뒤로" title="10초 뒤로" disabled><span aria-hidden="true">−10</span></button>',
          '<button type="button" class="conference-play" data-action="play" aria-label="재생" aria-keyshortcuts="Space" disabled>' + icon('play') + '</button>',
          '<button type="button" data-action="forward" aria-label="10초 앞으로" title="10초 앞으로" disabled><span aria-hidden="true">+10</span></button>',
          '<button type="button" data-action="next-slide" aria-label="다음 장표" aria-keyshortcuts="]" title="다음 장표 · ]" disabled>' + icon('next') + '</button>',
          '<button type="button" data-action="next-talk" aria-label="다음 발표" title="다음 발표" disabled>' + icon('nextTalk') + '</button>',
          '<button type="button" class="conference-settings-toggle" data-action="settings" aria-label="재생 설정" aria-expanded="false" disabled>' + icon('settings') + '</button>',
        '</div>',
        '<div class="conference-options" aria-label="재생 설정">',
          '<label class="conference-select"><span>덱</span><select data-role="deck" aria-label="장표 덱 선택" disabled><option>자료 없음</option></select></label>',
          '<label class="conference-select"><span>속도</span><select data-role="rate" aria-label="재생 속도" disabled>' + SPEEDS.map(speed => '<option value="' + speed + '"' + (speed === 1 ? ' selected' : '') + '>' + speed + '×</option>').join('') + '</select></label>',
          '<button type="button" data-action="follow" aria-pressed="true" aria-keyshortcuts="F" disabled>자막 따라가기</button>',
          '<button type="button" data-action="auto" aria-pressed="true" disabled>장표 자동 넘김</button>',
          '<button type="button" class="conference-transcript-toggle" data-action="transcript" aria-expanded="false" disabled>' + icon('transcript') + '<span>자막 전체 보기</span></button>',
        '</div>',
        '<p class="conference-notice" data-role="notice" hidden></p>',
        '<button type="button" class="conference-retry" data-action="retry" hidden>다시 불러오기</button>',
      '</div>',
      '<audio class="conference-audio" preload="metadata" hidden></audio>',
    '</div>',
    '<dialog class="conference-transcript" aria-label="자막 전체 보기" hidden>',
      '<header class="conference-transcript-header"><h2>전체 자막</h2><button type="button" data-action="close-transcript" aria-label="자막 닫기">' + icon('close') + '</button></header>',
      '<div class="conference-transcript-filters"><label><span class="conference-sr-only">자막 검색</span><input type="search" data-role="transcript-search" placeholder="자막 검색" aria-label="자막 검색"></label><label><span class="conference-sr-only">발표 이동</span><select data-role="talk-select" aria-label="발표 이동"></select></label></div>',
      '<div class="conference-transcript-list" tabindex="0" aria-label="시간순 자막"></div>',
      '<p class="conference-search-empty" hidden>일치하는 자막이 없습니다.</p>',
    '</dialog>',
    '</section>',
  ].join('');
  const root = host.querySelector('.conference-player'), panel = root.querySelector('.conference-transcript');
  const role = name => root.querySelector('[data-role="' + name + '"]');
  const action = name => root.querySelector('[data-action="' + name + '"]');
  const image = root.querySelector('.conference-slide-image'), message = root.querySelector('.conference-stage-message');
  const live = root.querySelector('.conference-live'), caption = root.querySelector('.conference-caption-text');
  const list = root.querySelector('.conference-transcript-list');
  const audio = options.mediaElement || root.querySelector('audio');
  const clips = [];

  function on(target, event, handler, settings) {
    target?.addEventListener(event, handler, settings);
    disposers.push(() => target?.removeEventListener(event, handler, settings));
  }
  function phone() { return (view?.innerWidth || 1440) <= 767; }
  function sheet() { return (view?.innerWidth || 1440) <= 1023; }
  function active() {
    return !destroyed && host.isConnected && !host.hidden &&
      (!document.body.dataset.page || document.body.dataset.page === 'conference');
  }
  function notice(text = '') { setText(role('notice'), text); role('notice').hidden = !text; }
  function assetUrl(path) { return new URL(path, timelineUrl).href; }
  function readUrl() {
    const url = new URL(view?.location?.href || timelineUrl);
    const seconds = Number(url.searchParams.get('t'));
    return {time:Number.isFinite(seconds) && seconds >= 0 ? seconds : 0, deck:url.searchParams.get('deck')};
  }
  function writeUrl(force = false) {
    if (!active() || !timeline || !view?.history?.replaceState || !view?.location?.href) return;
    const time = Math.round(state.time * 10) / 10, key = Math.floor(time) + ':' + state.deck;
    if (!force && key === lastUrlKey) return;
    const url = new URL(view.location.href);
    if (url.searchParams.get('page') !== 'conference') return;
    url.searchParams.set('t', String(time)); url.searchParams.set('deck', state.deck);
    view.history.replaceState(view.history.state, '', url.href); lastUrlKey = key;
  }
  function currentDeck() { return timeline?.decks.find(deck => deck.id === state.deck); }
  function currentTalk() {
    return timeline?.talks.find(talk => talk.t0 <= state.time && state.time < talk.t1) ||
      timeline?.talks.filter(talk => talk.t0 <= state.time).at(-1);
  }
  function audioClipIndex(time) {
    const found = clips.findIndex(clip => time >= clip.offset && time < clip.offset + clip.durationSec);
    return found >= 0 ? found : time === state.duration ? clips.length - 1 : -1;
  }
  function applyPendingSeek() {
    if (pendingSeek === null) return;
    try { audio.currentTime = pendingSeek; pendingSeek = null; } catch { /* Metadata may not be ready yet. */ }
  }
  function ensureAudio(time) {
    const index = audioClipIndex(time);
    if (index < 0) { pause(); notice('이 시각의 오디오가 없습니다.'); return false; }
    const clip = clips[index], localTime = clamp(time - clip.offset, 0, clip.durationSec);
    pendingSeek = localTime;
    if (index !== audioIndex) {
      audioIndex = index; mediaError = false;
      audio.src = assetUrl(clip.file);
      audio.playbackRate = state.rate;
      audio.load?.();
    }
    applyPendingSeek();
    return true;
  }
  function pause() {
    playVersion++; state.playing = false; state.playPending = false; audio.pause?.(); renderPlayback();
  }
  async function play() {
    if (!timeline || state.status !== 'ready' || !active()) return;
    if (state.time >= state.duration) seek(0);
    const version = ++playVersion;
    if (!ensureAudio(state.time)) return;
    state.playPending = true; renderPlayback(); notice();
    try {
      await audio.play();
      if (destroyed || !active()) { audio.pause?.(); return; }
      // A completed obsolete request does not own the shared media element.
      // In particular it must not pause a newer clip/play request.
      if (version !== playVersion) return;
      state.playPending = false; state.playing = true; mediaError = false; renderPlayback();
    } catch {
      if (destroyed || version !== playVersion) return;
      state.playPending = false; state.playing = false; renderPlayback();
      notice('오디오를 재생할 수 없습니다. 자료 연결을 확인한 뒤 다시 재생해 주세요.');
    }
  }
  function togglePlayback() { if (state.playing || state.playPending) pause(); else void play(); }
  function renderPlayback() {
    const button = action('play'), label = state.playing || state.playPending ? '일시정지' : '재생';
    if (button.getAttribute('aria-label') !== label) {
      button.setAttribute('aria-label', label); button.innerHTML = icon(state.playing || state.playPending ? 'pause' : 'play');
    }
    root.dataset.playing = String(state.playing);
  }
  function pageUrl(deck, page) { return assetUrl(deck.dir.replace(/\/$/, '') + '/' + String(page).padStart(4, '0') + '.webp'); }
  function preloadPage(deck, page) {
    if (!view?.Image || !page) return null;
    const url = pageUrl(deck, page);
    if (!imageCache.has(url)) {
      const candidate = new view.Image();
      candidate.src = url; imageCache.set(url, candidate);
      // Bound retained decoded images; current + nearby images only.
      if (imageCache.size > 4) imageCache.delete(imageCache.keys().next().value);
    }
    return imageCache.get(url);
  }
  function renderPage(force = false) {
    if (!timeline) return;
    const deck = currentDeck(), mapping = conferenceMappedPage(timeline.segments, state.segment, state.deck);
    const selected = force || state.auto ? mapping.page : state.page;
    const mapped = mapping.mapped;
    state.page = selected;
    root.dataset.page = selected === null ? '' : String(selected);
    role('page').max = String(deck.pages);
    role('page').value = selected === null ? '' : String(selected);
    setText(role('page-total'), '/ ' + deck.pages);
    const status = !mapped ? (timeline.segments[state.segment]?.page === null ? '이 구간에 맞는 장표 없음' : '이 덱에 해당 장표 없음') : '';
    setText(role('page-status'), status); role('page-status').hidden = !status;
    action('slide').disabled = selected === null;
    action('zoom').disabled = selected === null;
    if (selected === null) {
      imageKey = null; imageVersion++; image.hidden = true; message.hidden = false;
      setText(role('state-title'), '표시할 장표가 없습니다.');
      setText(role('state-detail'), status || '첫 장표가 연결된 구간으로 이동해 주세요.');
      return;
    }
    const key = state.deck + ':' + selected, url = pageUrl(deck, selected);
    if (key !== imageKey) {
      imageKey = key; const version = ++imageVersion;
      const prepared = preloadPage(deck, selected);
      const show = () => {
        if (destroyed || version !== imageVersion) return;
        image.src = url; image.alt = deck.label + ' · ' + selected + '쪽';
        image.hidden = false; message.hidden = true;
      };
      const failed = () => {
          if (destroyed || version !== imageVersion) return;
          image.hidden = true; message.hidden = false;
          setText(role('state-title'), '장표 이미지를 불러오지 못했습니다.');
          setText(role('state-detail'), deck.label + ' · ' + selected + '쪽');
      };
      if (prepared?.complete && prepared.naturalWidth > 0) show();
      else if (prepared?.complete && prepared.naturalWidth === 0) failed();
      else if (prepared) {
        prepared.onload = show;
        prepared.onerror = failed;
        if (!image.getAttribute('src')) {
          message.hidden = false; setText(role('state-title'), '장표를 불러오는 중');
          setText(role('state-detail'), '');
        }
      } else show();
    }
    const next = timeline.segments.slice(state.segment + 1).find(segment => Number.isInteger(segment.page?.[state.deck]) && segment.page[state.deck] !== selected);
    if (next) imagePreload = preloadPage(deck, next.page[state.deck]);
  }
  function render(forceSlide = false) {
    root.dataset.state = state.status;
    root.dataset.time = String(Math.round(state.time * 1000) / 1000);
    root.dataset.deck = state.deck || '';
    root.dataset.follow = String(state.follow); root.dataset.auto = String(state.auto);
    setText(role('current-time'), formatConferenceTime(state.time));
    setText(role('total-time'), timeline ? formatConferenceTime(state.duration) : '—:—');
    action('follow').setAttribute('aria-pressed', String(state.follow));
    action('auto').setAttribute('aria-pressed', String(state.auto));
    renderPlayback();
    if (!timeline) return;
    role('timeline').max = String(state.duration); role('timeline').value = String(state.time);
    role('timeline').setAttribute('aria-valuetext', formatConferenceTime(state.time) + ' / ' + formatConferenceTime(state.duration));
    state.segment = conferenceSegmentIndex(timeline.segments, state.time);
    const segment = timeline.segments[state.segment], talk = currentTalk();
    setText(role('talk-title'), talk?.title || '');
    if (talk) role('talk-select').value = talk.id;
    setText(caption, segment?.text || '현재 구간에 자막이 없습니다.');
    // This is the only live owner. Time, deck, focus and setting changes do not
    // reinsert the same source text or cause a second announcement.
    const announcement = segment?.source || null;
    if (announcement !== lastAnnouncement) {
      // Distinct source segments may repeat identical words. Each source
      // transition gets exactly one update, even when the text is unchanged.
      live.textContent = segment?.text || ''; lastAnnouncement = announcement;
      for (let i = 0; i < transcriptRows.length; i++) {
        if (i === state.segment) transcriptRows[i].setAttribute('aria-current', 'true');
        else transcriptRows[i].removeAttribute('aria-current');
      }
      if (state.follow && state.transcript && transcriptRows[state.segment] && !transcriptRows[state.segment].hidden) {
        transcriptRows[state.segment].scrollIntoView?.({block:'nearest'});
      }
    }
    renderPage(forceSlide);
  }
  function seek(seconds, {keepPlaying = state.playing || state.playPending, forceSlide = true} = {}) {
    if (!timeline || destroyed) return;
    const value = Number(seconds);
    if (!Number.isFinite(value)) return;
    const previousClip = audioIndex;
    state.time = clamp(value, 0, state.duration);
    ensureAudio(state.time); render(forceSlide); writeUrl(true);
    if (keepPlaying && previousClip !== audioIndex && state.time < state.duration) void play();
    if (state.time >= state.duration) pause();
  }
  function setDeck(id) {
    if (!timeline?.decks.some(deck => deck.id === id) || destroyed) return;
    state.deck = id; role('deck').value = id; render(true); writeUrl(true);
  }
  function stepSlide(direction) {
    const pages = [...new Set(timeline.segments.map(segment => segment.page?.[state.deck]).filter(Number.isInteger))].sort((a,b) => a-b);
    const next = direction > 0 ? pages.find(page => state.page === null || page > state.page) : pages.filter(page => page < (state.page ?? Infinity)).at(-1);
    if (next !== undefined) seekPage(next);
  }
  function seekPage(page) {
    const value = Number(page), segment = timeline?.segments.find(item => item.page?.[state.deck] === value);
    if (!segment) { notice('이 장표에 연결된 자막이 없습니다.'); render(); return; }
    notice(); seek(segment.t0);
  }
  function stepTalk(direction) {
    const talks = timeline.talks;
    const current = talks.findIndex(talk => talk.id === currentTalk()?.id);
    const next = talks[clamp(current + direction, 0, talks.length - 1)];
    if (next) seek(next.t0);
  }
  function setPanelMode() {
    const nextMode = sheet() ? 'sheet' : 'dock';
    panel.dataset.mode = nextMode;
    if (!state.transcript || transcriptMode === nextMode) return;
    if (panel.open) panel.close?.();
    panel.removeAttribute('open');
    panel.hidden = false;
    if (nextMode === 'sheet') {
      panel.setAttribute('aria-modal', 'true');
      if (panel.showModal) panel.showModal(); else panel.setAttribute('open', '');
    } else {
      panel.removeAttribute('aria-modal');
      if (panel.show) panel.show(); else panel.setAttribute('open', '');
    }
    transcriptMode = nextMode;
  }
  function closeTranscript({restoreFocus = true} = {}) {
    if (!state.transcript) return;
    state.transcript = false; root.classList.remove('conference-transcript-open');
    if (panel.open) panel.close?.();
    panel.removeAttribute('open'); panel.hidden = true; transcriptMode = null;
    for (const button of root.querySelectorAll('[data-action="transcript"]')) button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      const available = node => {
        if (!node?.isConnected || node.disabled || node.closest?.('[hidden],[inert]')) return false;
        if (node.checkVisibility) return node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
        if (node.getClientRects && !node.getClientRects().length) return false;
        const style = view?.getComputedStyle?.(node);
        return style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
      };
      // Settings close when the transcript opens; resizing can also hide a
      // desktop opener. The caption remains reachable in both layouts.
      const target = available(transcriptOpener) ? transcriptOpener : root.querySelector('.conference-caption');
      target?.focus?.({preventScroll:true});
    }
  }
  function openTranscript(opener) {
    if (!timeline) return;
    transcriptOpener = opener || document.activeElement;
    state.transcript = true; state.settings = false;
    root.classList.add('conference-transcript-open');
    for (const button of root.querySelectorAll('[data-action="transcript"]')) button.setAttribute('aria-expanded', 'true');
    setPanelMode(); responsive();
    role('transcript-search').focus?.({preventScroll:true});
    if (state.follow) transcriptRows[state.segment]?.scrollIntoView?.({block:'nearest'});
  }
  function responsive() {
    if (destroyed) return;
    const collapsed = phone() && !state.settings;
    root.querySelector('.conference-options').hidden = collapsed;
    action('settings').setAttribute('aria-expanded', String(state.settings));
    setPanelMode();
    // Fit the image to the space actually left by the caption and controls.
    // Measuring the owned visual area also accounts for wrapped options, a
    // docked transcript, the outer shell footer and short viewports.
    const visual = root.querySelector('.conference-visual'), stage = root.querySelector('.conference-stage');
    const availableWidth = visual.clientWidth, availableHeight = visual.clientHeight - root.querySelector('.conference-event').offsetHeight;
    if (availableWidth > 0 && availableHeight > 0) {
      const width = phone() ? availableWidth : Math.min(availableWidth, availableHeight * 16 / 9, (view?.innerWidth || 1440) >= 1280 ? 1120 : Infinity);
      const dimensions = {width:width + 'px', height:(width * 9 / 16) + 'px'};
      for (const [name, value] of Object.entries(dimensions)) if (stage.style[name] !== value) stage.style[name] = value;
    }
  }
  function filterTranscript() {
    const query = role('transcript-search').value.trim().toLocaleLowerCase();
    let visible = 0;
    transcriptRows.forEach((row, i) => {
      row.hidden = query !== '' && !timeline.segments[i].text.toLocaleLowerCase().includes(query);
      if (!row.hidden) visible++;
    });
    root.querySelector('.conference-search-empty').hidden = visible > 0;
    list.hidden = visible === 0;
  }
  function buildTimeline() {
    role('deck').replaceChildren(); role('talk-select').replaceChildren(); list.replaceChildren(); transcriptRows.length = 0;
    for (const deck of timeline.decks) {
      const option = document.createElement('option'); option.value = deck.id; option.textContent = deck.label; role('deck').append(option);
    }
    for (const talk of timeline.talks) {
      const option = document.createElement('option'); option.value = talk.id; option.textContent = talk.title; role('talk-select').append(option);
    }
    const fragment = document.createDocumentFragment();
    for (const [index, segment] of timeline.segments.entries()) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'conference-transcript-row';
      button.dataset.segment = String(index);
      const stamp = document.createElement('span'); stamp.className = 'conference-transcript-time'; stamp.textContent = formatConferenceTime(segment.t0);
      const text = document.createElement('span'); text.className = 'conference-transcript-text'; text.textContent = segment.text;
      button.append(stamp, text); fragment.append(button); transcriptRows.push(button);
    }
    list.append(fragment);
    const markers = root.querySelector('.conference-markers'); markers.replaceChildren();
    for (const talk of timeline.talks) {
      const marker = document.createElement('span');
      marker.className = /휴식|break/i.test(talk.title) ? 'conference-marker conference-marker-break' : 'conference-marker';
      marker.style.left = (talk.t0 / state.duration * 100) + '%';
      marker.style.width = ((talk.t1 - talk.t0) / state.duration * 100) + '%';
      marker.title = talk.title; markers.append(marker);
    }
    for (const control of root.querySelectorAll('button:disabled,select:disabled,input:disabled')) control.disabled = false;
    role('deck').value = state.deck;
    setText(role('event-title'), timeline.event.title);
    action('retry').hidden = true;
    lastAnnouncement = null; imageKey = null;
    responsive(); syncFromUrl();
  }
  function clearContent() {
    pause(); closeTranscript({restoreFocus:false}); timeline = null; state.duration = 0; state.page = null; state.segment = -1;
    clips.length = 0; audioIndex = -1; pendingSeek = null; imageVersion++; imageKey = null; imageCache.clear();
    audio.removeAttribute?.('src'); audio.load?.();
    image.removeAttribute('src'); image.hidden = true; message.hidden = false;
    role('page-status').hidden = true;
    for (const control of root.querySelectorAll('.conference-controls button,.conference-controls select,.conference-controls input,.conference-stage button,.conference-stage input,.conference-caption')) control.disabled = true;
    action('retry').disabled = false;
    lastAnnouncement = null; setText(live, '');
    setText(caption, '재생 자료가 준비되면 자막이 표시됩니다.');
  }
  async function load() {
    if (destroyed) return false;
    const version = ++loadVersion;
    abort?.abort(); abort = typeof AbortController === 'function' ? new AbortController() : null;
    clearContent(); state.status = 'loading'; notice();
    const pending = readUrl(); state.time = pending.time; state.deck = pending.deck;
    setText(role('state-title'), '복습 자료를 불러오는 중'); setText(role('state-detail'), '');
    action('retry').hidden = true; render();
    try {
      const response = await fetchImpl(timelineUrl, {signal:abort?.signal, cache:'no-cache'});
      if (destroyed || version !== loadVersion) return false;
      if (response.status === 404) {
        state.status = 'empty';
        setText(role('state-title'), '복습 자료가 아직 준비되지 않았습니다.');
        setText(role('state-detail'), '장표·자막·오디오가 등록되면 여기에서 다시 볼 수 있습니다.');
        action('retry').hidden = false; render(); return false;
      }
      if (!response.ok) throw new Error('Timeline request failed');
      const data = await response.json();
      if (destroyed || version !== loadVersion) return false;
      timeline = assertConferenceTimeline(data);
      state.duration = timeline.audio.reduce((sum, clip) => sum + clip.durationSec, 0);
      // Validation requires contiguous clips. Accumulated event seconds remain
      // unambiguous even when an audio clock passes midnight.
      let offset = 0;
      for (const clip of timeline.audio) { clips.push({...clip, offset}); offset += clip.durationSec; }
      state.status = 'ready';
      state.deck = timeline.decks.some(deck => deck.id === pending.deck) ? pending.deck : timeline.decks[0].id;
      state.time = clamp(pending.time, 0, state.duration);
      buildTimeline(); render(true); return true;
    } catch (error) {
      if (destroyed || version !== loadVersion || error?.name === 'AbortError') return false;
      clearContent(); state.status = 'error';
      setText(role('state-title'), '복습 자료를 불러오지 못했습니다.');
      setText(role('state-detail'), '자료 연결과 형식을 확인한 뒤 다시 불러와 주세요.');
      action('retry').hidden = false; render(); return false;
    }
  }
  function syncFromUrl() {
    if (destroyed) return;
    const pending = readUrl(); pause();
    state.time = timeline ? clamp(pending.time, 0, state.duration) : pending.time;
    if (timeline) {
      state.deck = timeline.decks.some(deck => deck.id === pending.deck) ? pending.deck : timeline.decks[0].id;
      role('deck').value = state.deck; ensureAudio(state.time);
    } else state.deck = pending.deck;
    lastUrlKey = null; render(true);
  }
  function click(event) {
    const row = event.target.closest?.('[data-segment]');
    const selection = view?.getSelection?.()?.toString();
    if (selection && (row || event.target.closest?.('.conference-caption'))) return;
    if (row && timeline) { seek(timeline.segments[Number(row.dataset.segment)].t0); return; }
    const button = event.target.closest?.('[data-action]');
    if (!button || button.disabled) return;
    const name = button.dataset.action;
    if (name === 'retry') { void load(); return; }
    if (!timeline) return;
    if (name === 'play') togglePlayback();
    if (name === 'backward') seek(state.time - 10);
    if (name === 'forward') seek(state.time + 10);
    if (name === 'previous-slide') stepSlide(-1);
    if (name === 'next-slide') stepSlide(1);
    if (name === 'previous-talk') stepTalk(-1);
    if (name === 'next-talk') stepTalk(1);
    if (name === 'slide') seekPage(state.page);
    if (name === 'follow') { state.follow = !state.follow; render(); }
    if (name === 'auto') { state.auto = !state.auto; render(state.auto); }
    if (name === 'transcript') openTranscript(button);
    if (name === 'close-transcript') closeTranscript();
    if (name === 'settings') { state.settings = !state.settings; responsive(); }
    if (name === 'zoom') {
      state.zoom = !state.zoom; root.querySelector('.conference-stage').classList.toggle('conference-zoomed', state.zoom);
      button.setAttribute('aria-pressed', String(state.zoom)); button.setAttribute('aria-label', state.zoom ? '장표 확대 해제' : '장표 확대');
    }
    if (name === 'fullscreen') {
      const stage = root.querySelector('.conference-stage');
      try {
        const result = document.fullscreenElement === stage ? document.exitFullscreen?.() : stage.requestFullscreen?.();
        if (!result) notice('이 브라우저에서는 전체화면을 사용할 수 없습니다.');
        result?.catch?.(() => notice('전체화면을 열지 못했습니다.'));
      } catch { notice('전체화면을 열지 못했습니다.'); }
    }
  }
  function keydown(event) {
    if (!active() || !timeline || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const foreignDialog = [...document.querySelectorAll('dialog[open]')].some(dialog => dialog !== panel);
    if (foreignDialog) return;
    if (event.key === 'Escape') {
      if (state.transcript) { event.preventDefault(); event.stopPropagation(); closeTranscript(); }
      else if (state.settings) { event.preventDefault(); state.settings = false; responsive(); action('settings').focus?.(); }
      return;
    }
    if (state.transcript && sheet() && event.key === 'Tab') {
      const focusables = [...panel.querySelectorAll('button,input,select,[tabindex="0"]')].filter(node => !node.disabled && !node.hidden && !node.closest('[hidden]'));
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus?.(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus?.(); }
      return;
    }
    if (event.target?.closest?.('input,select,textarea,[contenteditable=""],[contenteditable="true"]')) return;
    if (event.key === ' ' && event.target?.closest?.('button,summary,a[href]')) return;
    let handled = true;
    if (event.key === ' ') { if (!event.repeat) togglePlayback(); }
    else if (event.key === 'ArrowLeft') seek(state.time - (event.shiftKey ? 30 : 5));
    else if (event.key === 'ArrowRight') seek(state.time + (event.shiftKey ? 30 : 5));
    else if (event.key === '[') stepSlide(-1);
    else if (event.key === ']') stepSlide(1);
    else if (event.key.toLowerCase() === 'f') { state.follow = !state.follow; render(); }
    else if (event.key.toLowerCase() === 'd') {
      const index = timeline.decks.findIndex(deck => deck.id === state.deck); setDeck(timeline.decks[(index + 1) % timeline.decks.length].id);
    } else handled = false;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  }
  on(root, 'click', click);
  on(role('timeline'), 'input', () => seek(role('timeline').value));
  on(role('deck'), 'change', () => setDeck(role('deck').value));
  on(role('rate'), 'change', () => { const value = Number(role('rate').value); if (SPEEDS.includes(value)) { state.rate = value; audio.playbackRate = value; } });
  on(role('page'), 'change', () => seekPage(role('page').value));
  on(role('talk-select'), 'change', () => { const talk = timeline?.talks.find(item => item.id === role('talk-select').value); if (talk) seek(talk.t0); });
  on(role('transcript-search'), 'input', filterTranscript);
  on(panel, 'cancel', event => { event.preventDefault(); closeTranscript(); });
  on(panel, 'click', event => {
    if (event.target !== panel || !sheet()) return;
    const rect = panel.getBoundingClientRect?.();
    if (rect && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeTranscript();
  });
  on(document, 'keydown', keydown, true);
  on(view, 'popstate', syncFromUrl);
  on(view, 'resize', responsive);
  on(view, 'pagehide', () => { if (timeline) writeUrl(true); pause(); });
  on(view, 'pageshow', () => { if (active()) syncFromUrl(); });
  on(audio, 'loadedmetadata', applyPendingSeek);
  on(audio, 'timeupdate', () => {
    if (!timeline || audioIndex < 0 || pendingSeek !== null || destroyed) return;
    const localTime = Number(audio.currentTime);
    if (!Number.isFinite(localTime)) return;
    state.time = clamp(clips[audioIndex].offset + localTime, 0, state.duration);
    render(); writeUrl();
  });
  on(audio, 'ended', () => {
    if (!timeline || destroyed) return;
    const next = clips[audioIndex + 1], resume = state.playing;
    if (next) { seek(next.offset, {keepPlaying:false}); if (resume) void play(); }
    else { state.time = state.duration; pause(); render(true); writeUrl(true); }
  });
  on(audio, 'error', () => {
    if (!timeline || destroyed || mediaError) return;
    mediaError = true; pause(); notice('오디오를 불러오지 못했습니다. 자료 연결을 확인해 주세요.');
  });
  on(audio, 'pause', () => { if (!audio.ended && state.playing) { state.playing = false; renderPlayback(); } });
  const Resize = view?.ResizeObserver || globalThis.ResizeObserver;
  if (Resize) {
    resizeObserver = new Resize(responsive);
    resizeObserver.observe(host);
    resizeObserver.observe(root.querySelector('.conference-visual'));
  }
  const initial = readUrl(); state.time = initial.time; state.deck = initial.deck;
  responsive(); render();
  return {
    load, syncFromUrl, seek, setDeck,
    getState:() => ({...state}),
    destroy() {
      if (destroyed) return;
      destroyed = true; loadVersion++; imageVersion++; playVersion++;
      abort?.abort(); resizeObserver?.disconnect();
      for (const dispose of disposers.splice(0)) dispose();
      audio.pause?.(); audio.removeAttribute?.('src'); audio.load?.();
      if (panel.open) panel.close?.();
      imageCache.clear(); imagePreload = null; root.remove();
    },
  };
}
