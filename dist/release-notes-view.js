// 사이드바 하단의 릴리즈 노트 버튼과 대화상자.
//
// site-entry.js가 모든 셸 페이지에서 한 번 호출한다. 노트는 dist/release-notes.js의
// 정적 배열이므로 relay 번들처럼 네트워크를 기다리지 않고, standalone 패키지에서도
// 같은 내용을 보여 준다. 이 모듈은 읽기 전용 UI만 만들며 저장·전송을 하지 않는다.
import { atlasReleaseNotes } from './release-notes.js?v=1.37.9';

const esc = value => String(value ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function dateLabel(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.replaceAll('-', '.') : '';
}

function entryMarkup(entry, latest) {
  const version = esc(entry.version);
  const title = esc(entry.title);
  const date = dateLabel(entry.date);
  const items = Array.isArray(entry.items)
    ? entry.items.map(item => `<li>${esc(item)}</li>`).join('')
    : '';
  if (latest) {
    return `<section class="atlas-release-entry atlas-release-current" aria-labelledby="atlas-release-current-title">
      <header class="atlas-release-entry-head">
        <h3 id="atlas-release-current-title">v${version}<span class="atlas-release-badge">현재</span></h3>
        <time datetime="${esc(entry.date)}">${date}</time>
      </header>
      <p class="atlas-release-entry-title">${title}</p>
      <ul>${items}</ul>
    </section>`;
  }
  return `<details class="atlas-release-entry">
    <summary>
      <span class="atlas-release-entry-version">v${version}</span>
      <span class="atlas-release-entry-title">${title}</span>
      <time datetime="${esc(entry.date)}">${date}</time>
    </summary>
    <ul>${items}</ul>
  </details>`;
}

export function mountReleaseNotes({ document, data = atlasReleaseNotes } = {}) {
  const doc = document || globalThis.document;
  if (!doc) return null;
  const sidebar = doc.querySelector('.atlas-sidebar');
  if (!sidebar || sidebar.querySelector('[data-atlas-release-notes]')) return null;
  const notes = Array.isArray(data) ? data.filter(entry =>
    entry && typeof entry.version === 'string' && typeof entry.title === 'string'
    && Array.isArray(entry.items)) : [];
  if (!notes.length) return null;

  const latest = notes[0];
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'atlas-release-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', 'atlas-release-dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('title', '릴리즈 노트 · 최신 v' + latest.version);
  trigger.innerHTML = `<span class="atlas-release-trigger-icon" aria-hidden="true">▤</span>
    <span class="atlas-release-trigger-label">릴리즈 노트</span>
    <span class="atlas-release-trigger-version">v${esc(latest.version)}</span>`;

  const block = doc.createElement('div');
  block.className = 'atlas-release-notes';
  block.dataset.atlasReleaseNotes = '';
  block.append(trigger);
  const foot = sidebar.querySelector('.atlas-side-foot');
  if (foot) sidebar.insertBefore(block, foot); else sidebar.append(block);

  const dialog = doc.createElement('dialog');
  dialog.id = 'atlas-release-dialog';
  dialog.className = 'atlas-release-dialog';
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'atlas-release-title');
  dialog.innerHTML = `<div class="dialog-top">
      <span class="eyebrow">Bitcoin Cycle Atlas</span>
      <button type="button" class="atlas-release-close" aria-label="릴리즈 노트 닫기">×</button>
    </div>
    <h2 id="atlas-release-title">릴리즈 노트</h2>
    <p class="atlas-release-lead">화면과 조작에서 확인할 수 있는 변경만 기록합니다. 계산 결과와 실제 자료의 상태는 각 화면의 관측일·출처와 함께 확인하세요.</p>
    <div class="atlas-release-list">
      ${notes.map((entry, index) => entryMarkup(entry, index === 0)).join('')}
    </div>`;
  doc.body.append(dialog);

  const closeButton = dialog.querySelector('.atlas-release-close');
  // The dialog has exactly one opener. Restoring the trigger (rather than
  // document.activeElement) also works when a pointer click leaves focus on
  // the body, which is what macOS browsers do for buttons.
  let opener = null;
  function open() {
    opener = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
      dialog.setAttribute('aria-modal', 'true');
    }
    closeButton?.focus?.({ preventScroll: true });
  }
  function close() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    opener = null;
  }
  const onTrigger = event => {
    event.preventDefault();
    if (dialog.open) close(); else open();
  };
  const onDialogClose = () => {
    trigger.setAttribute('aria-expanded', 'false');
    if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    opener = null;
  };
  const onDialogClick = event => {
    if (event.target === dialog) close();
  };
  trigger.addEventListener('click', onTrigger);
  closeButton?.addEventListener('click', close);
  dialog.addEventListener('close', onDialogClose);
  dialog.addEventListener('click', onDialogClick);

  return {
    trigger, dialog, open, close,
    destroy() {
      trigger.removeEventListener('click', onTrigger);
      closeButton?.removeEventListener('click', close);
      dialog.removeEventListener('close', onDialogClose);
      dialog.removeEventListener('click', onDialogClick);
      if (dialog.open) close();
      dialog.remove();
      block.remove();
    }
  };
}
