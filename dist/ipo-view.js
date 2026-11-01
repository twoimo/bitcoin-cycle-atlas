// 공모주 청약·수요예측 캘린더. 38커뮤니케이션 집계 원자료를 표시만 하며,
// 상태와 D-day는 열람 시점의 날짜로 다시 계산한다(저장된 상태 문자열을 신뢰하지 않는다).
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = v => String(v ?? '').normalize('NFKC').toLocaleLowerCase();
const DAY = 86400000;
const utcDay = iso => { const [y, m, d] = String(iso).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
const todayIso = now => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export function ipoMilestone(item) {
  const forecast = item?.['수요예측']?.[0] ?? null, subscribe = item?.['청약']?.[0] ?? null;
  return forecast || subscribe ? { label: forecast ? '수요예측' : '청약', date: forecast || subscribe } : null;
}

// 상태는 마일스톤 우선: 수요예측이 미래면 예측 예정, 그다음이 청약이면 청약 예정, 둘 다 지났으면 마감.
export function ipoStatus(item, today) {
  const t = utcDay(today);
  const f = item?.['수요예측']?.[0] ?? null, q = item?.['청약']?.[0] ?? null;
  if (f && utcDay(f) >= t) return '수요예측 예정';
  if (q && utcDay(q) >= t) return '청약 예정';
  if (f || q) return '마감';
  return '일정 미확인';
}

export function ipoNextDate(item, today) {
  const t = utcDay(today);
  for (const d of [item?.['수요예측']?.[0], item?.['청약']?.[0]]) if (d && utcDay(d) >= t) return d;
  return null;
}

export function ipoDaysLeft(item, today) {
  const next = ipoNextDate(item, today);
  if (next !== null) return Math.round((utcDay(next) - utcDay(today)) / DAY);
  // Nothing pending: elapsed days since the last known milestone, if any.
  const last = [item?.['청약']?.[0], item?.['수요예측']?.[0]].find(Boolean);
  return last === undefined || last === null ? null : Math.round((utcDay(last) - utcDay(today)) / DAY);
}

export function ipoCalendarRows(doc, today) {
  const items = Array.isArray(doc?.['항목']) ? doc['항목'] : [];
  return items
    .map(item => ({ ...item, 상태: ipoStatus(item, today), Dday: ipoDaysLeft(item, today) }))
    .sort((a, b) => String(ipoNextDate(a, today) ?? '9999-99-99').localeCompare(String(ipoNextDate(b, today) ?? '9999-99-99')) || String(a['종목']).localeCompare(String(b['종목'])));
}

const range = ([a, b]) => !a ? '—' : a === b ? a.slice(5).replace('-', '.') : `${a.slice(5).replace('-', '.')}~${b ? b.slice(5).replace('-', '.') : '미정'}`;
const price = v => { const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n.toLocaleString('ko-KR') : null; };
// 공모가는 확정가(숫자)와 희망 구간("18000~25000") 문자열이 섞여 있어 둘 다 쉼표 표기로 처리한다.
const won = v => {
  if (v == null || v === '') return '—';
  const s = String(v).trim();
  if (s.includes('~')) { const [a, b] = s.split('~').map(price); return a && b ? `${a}~${b}원` : s; }
  const n = price(s);
  return n ? `${n}원` : s;
};
const money = v => v == null ? '—' : `${(v / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`;
const dday = d => d == null ? '—' : d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`;
const STATE_CLASS = { '수요예측 예정': 'forecast', '청약 예정': 'subscribe', '마감': 'closed', '일정 미확인': 'unknown' };

export function ipoRowMarkup(row) {
  const cls = STATE_CLASS[row.상태] ?? 'unknown';
  return `<tr data-ipo-name="${esc(row['종목'])}" class="ipo-state-${cls}"><td class="ipo-name">${esc(row['종목'])}</td>`
    + `<td class="ipo-status"><span class="ipo-badge ipo-badge-${cls}">${esc(row.상태)}</span></td>`
    + `<td class="ipo-dday">${esc(dday(row.Dday))}</td>`
    + `<td>${esc(range(row['수요예측']))}</td><td>${esc(range(row['청약']))}</td>`
    + `<td class="ipo-num">${esc(won(row['확정공모가'] ?? row['희망공모가']))}</td>`
    + `<td class="ipo-num">${esc(money(row['공모금액_백만원']))}</td>`
    + `<td class="ipo-num">${esc(row['일반청약경쟁률'] ?? '—')}</td>`
    + `<td>${esc((row['주간사'] ?? []).join(' · ') || '—')}</td></tr>`;
}

export function initIpoView({ root, load = null, embeddedData = () => null, now = () => new Date(), onReady = null } = {}) {
  const state = { doc: null, rows: [], filter: 'upcoming', query: '', status: 'idle', error: '' };
  const el = sel => root.querySelector(sel);
  async function ensureData() {
    if (state.doc) return;
    state.status = 'loading';
    try {
      const embedded = embeddedData();
      state.doc = embedded ? JSON.parse(embedded) : await (load ?? (() => fetch('./data/ipo-calendar.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })))();
      state.status = 'ready';
    } catch (cause) { state.status = 'error'; state.error = String(cause?.message ?? cause); }
  }
  function filtered() {
    const terms = normalize(state.query).trim().split(/\s+/).filter(Boolean);
    return state.rows.filter(r => {
      const passState = state.filter === 'all' || (state.filter === 'closed') === (r.상태 === '마감');
      return passState && terms.every(term => normalize(`${r['종목']} ${(r['주간사'] ?? []).join(' ')}`).includes(term));
    });
  }
  function render() {
    const today = todayIso(now());
    if (!state.rows.length || root.dataset.ipoToday !== today) { state.rows = ipoCalendarRows(state.doc ?? { '항목': [] }, today); root.dataset.ipoToday = today; }
    const list = state.status === 'error' ? [] : filtered();
    el('.ipo-table-body').innerHTML = state.status === 'error'
      ? `<tr><td colspan="9">공모주 일정을 불러오지 못했습니다. (${esc(state.error)}) 원본: 38커뮤니케이션 o=c·o=r</td></tr>`
      : list.length ? list.map(ipoRowMarkup).join('') : '<tr><td colspan="9">조건에 맞는 공모 일정이 없습니다.</td></tr>';
    el('.ipo-count').textContent = `${list.length} / ${state.rows.length}건`;
    el('.ipo-source').textContent = `원자료 수집 ${state.doc?.['수집일시_KST']?.slice(0, 10) ?? '미확인'} · 상태·D-day는 ${today} 기준 재계산`;
    onReady?.();
  }
  root.addEventListener('input', e => { if (e.target.matches('.ipo-search')) { state.query = e.target.value; render(); } });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-ipo-filter]');
    if (b) { state.filter = b.dataset.ipoFilter; root.querySelectorAll('[data-ipo-filter]').forEach(n => n.setAttribute('aria-pressed', String(n === b))); render(); }
  });
  return { state, render: () => ensureData().then(render), refresh: () => { state.doc = null; state.rows = []; return ensureData().then(render); } };
}
