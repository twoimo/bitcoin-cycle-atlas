// 시즌 테마(대한민국 명절·행사) 결정 엔진.
// 원칙: 기준 테마(dark/light)는 건드리지 않고, 날짜에 맞는 장식 토큰만 얹는다.
// 날짜 계산은 KST 달력 날짜 기준이며, 음력 명절은 빌드 시 생성한 표를 쓴다.

export const SEASONAL_THEMES = [
  { id: 'newyear', label: '새해', emoji: '🎊', fixed: [1, 1], before: 5, after: 5, priority: 80 },
  { id: 'seollal', label: '설날', emoji: '🧧', lunar: 'seollal', before: 12, after: 3, priority: 85 },
  { id: 'valentine', label: '발렌타인데이', emoji: '🍫', fixed: [2, 14], before: 4, after: 1, priority: 30 },
  { id: 'samil', label: '삼일절', emoji: '🇰🇷', fixed: [3, 1], before: 3, after: 1, priority: 40 },
  { id: 'whiteday', label: '화이트데이', emoji: '🍬', fixed: [3, 14], before: 3, after: 1, priority: 30 },
  { id: 'children', label: '어린이날', emoji: '🎈', fixed: [5, 5], before: 5, after: 1, priority: 50 },
  { id: 'parents', label: '어버이날', emoji: '💐', fixed: [5, 8], before: 4, after: 1, priority: 55 },
  { id: 'buddha', label: '부처님오신날', emoji: '🪷', lunar: 'buddha', before: 7, after: 2, priority: 50 },
  { id: 'memorial', label: '현충일', emoji: '🎗️', fixed: [6, 6], before: 3, after: 1, priority: 45 },
  { id: 'liberation', label: '광복절', emoji: '🕊️', fixed: [8, 15], before: 3, after: 1, priority: 45 },
  { id: 'chuseok', label: '추석', emoji: '🌕', lunar: 'chuseok', before: 12, after: 3, priority: 85 },
  { id: 'gaecheon', label: '개천절', emoji: '🏛️', fixed: [10, 3], before: 3, after: 1, priority: 40 },
  { id: 'hangul', label: '한글날', emoji: '📜', fixed: [10, 9], before: 3, after: 1, priority: 40 },
  { id: 'halloween', label: '할로윈', emoji: '🎃', fixed: [10, 31], before: 10, after: 1, priority: 70 },
  { id: 'pepero', label: '빼빼로데이', emoji: '🍫', fixed: [11, 11], before: 3, after: 1, priority: 35 },
  { id: 'suneung', label: '수능', emoji: '📝', nthWeekday: { month: 11, weekday: 4, nth: 3 }, before: 7, after: 1, priority: 65 },
  { id: 'christmas', label: '크리스마스', emoji: '🎄', fixed: [12, 25], before: 21, after: 2, priority: 70 },
  { id: 'yearend', label: '연말', emoji: '🎆', fixed: [12, 31], before: 4, after: 0, priority: 90 },
];

const DAY_MS = 86400000;
const pad = n => String(n).padStart(2, '0');

/** 입력을 KST 달력 날짜(YYYY-MM-DD)로 정규화한다. */
export function toCalendarDate(input = new Date()) {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new TypeError('invalid date');
  const kst = new Date(date.getTime() + 9 * 3600000);
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}

const toUtc = iso => new Date(`${iso}T00:00:00Z`);
const diffDays = (a, b) => Math.round((toUtc(a) - toUtc(b)) / DAY_MS);
const addDays = (iso, n) => new Date(toUtc(iso).getTime() + n * DAY_MS).toISOString().slice(0, 10);

/** 매년 반복되는 고정 날짜를 해당 연도 날짜로 만든다. */
function fixedDate(year, [month, day]) {
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return Number.isNaN(toUtc(iso).getTime()) ? null : iso;
}

/** n번째 특정 요일(예: 11월 셋째 목요일 = 수능). */
function nthWeekdayDate(year, { month, weekday, nth }) {
  const first = toUtc(`${year}-${pad(month)}-01`);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return addDays(`${year}-${pad(month)}-01`, offset + (nth - 1) * 7);
}

/** 음력 명절 표에서 해당 연도 날짜를 찾는다. 표 범위를 벗어나면 null. */
function lunarDate(table, year, key) {
  const entry = table?.years?.[year];
  const value = entry?.[key];
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** 명절/행사의 그 해 기준일. 계산할 수 없으면 null. */
export function eventDate(theme, year, lunarTable) {
  if (theme.lunar) return lunarDate(lunarTable, year, theme.lunar);
  if (theme.nthWeekday) return nthWeekdayDate(year, theme.nthWeekday);
  if (theme.fixed) return fixedDate(year, theme.fixed);
  return null;
}

function activeWindow(theme, year, lunarTable) {
  const peak = eventDate(theme, year, lunarTable);
  if (!peak) return null;
  return { peak, start: addDays(peak, -theme.before), end: addDays(peak, theme.after) };
}

/**
 * 해당 날짜에 적용할 시즌 테마를 고른다.
 * 우선순위(priority)가 높은 테마가 이기고, 같으면 기준일이 더 가까운 쪽이 이긴다.
 * @returns {{id:string,label:string,emoji:string,peak:string,phase:'before'|'day'|'after',daysToPeak:number,intensity:number,window:{start:string,end:string}}|null}
 */
export function resolveSeasonalTheme(dateInput, { lunarTable = null, themes = SEASONAL_THEMES } = {}) {
  const day = toCalendarDate(dateInput);
  const year = Number(day.slice(0, 4));
  let best = null;
  for (const theme of themes) {
    // 연말·새해처럼 창이 해를 넘는 경우를 위해 전후 연도도 확인한다.
    for (const windowYear of [year - 1, year, year + 1]) {
      const window = activeWindow(theme, windowYear, lunarTable);
      if (!window) continue;
      if (day < window.start || day > window.end) continue;
      const daysToPeak = diffDays(day, window.peak);
      const candidate = { theme, window, daysToPeak };
      if (!best) { best = candidate; continue; }
      // 규칙: 1) 그날이 기준일인 테마 2) 우선순위 3) 기준일과 가까운 쪽 4) 선언 순서
      const exact = daysToPeak === 0, bestExact = best.daysToPeak === 0;
      if (exact !== bestExact) {
        if (exact) best = candidate;
      } else if (theme.priority !== best.theme.priority) {
        if (theme.priority > best.theme.priority) best = candidate;
      } else if (Math.abs(daysToPeak) < Math.abs(best.daysToPeak)) {
        best = candidate;
      }
    }
  }
  if (!best) return null;
  const { theme, window, daysToPeak } = best;
  const phase = daysToPeak === 0 ? 'day' : daysToPeak < 0 ? 'before' : 'after';
  const span = phase === 'before' ? theme.before : Math.max(theme.after, 1);
  const distance = Math.abs(daysToPeak);
  return {
    id: theme.id,
    label: theme.label,
    emoji: theme.emoji,
    peak: window.peak,
    phase,
    daysToPeak,
    intensity: phase === 'day' ? 1 : Number(Math.max(0.2, 1 - distance / (span + 1)).toFixed(2)),
    window: { start: window.start, end: window.end },
  };
}

/** 사용자 설정: auto(기본) | off | 특정 테마 id */
export const SEASONAL_MODES = ['auto', 'off'];

export function normalizeMode(mode) {
  if (mode === 'off') return 'off';
  if (SEASONAL_THEMES.some(theme => theme.id === mode)) return mode;
  return 'auto';
}

/**
 * DOM에 시즌 테마를 적용한다. 기준 테마(dark/light)는 그대로 둔다.
 * @returns 시즌 결과 또는 null
 */
export function applySeasonalTheme({ root, date = new Date(), mode = 'auto', lunarTable = null, themes = SEASONAL_THEMES } = {}) {
  if (!root || !root.dataset) return null;
  const normalized = normalizeMode(mode);
  if (normalized === 'off') {
    delete root.dataset.season;
    delete root.dataset.seasonPhase;
    delete root.dataset.seasonLabel;
    return null;
  }
  const forced = themes.find(theme => theme.id === normalized);
  const resolution = resolveSeasonalTheme(date, { lunarTable, themes });
  if (forced) {
    const applied = { id: forced.id, label: forced.label, emoji: forced.emoji, peak: null, phase: 'day', daysToPeak: 0, intensity: 1, forced: true, window: null };
    root.dataset.season = applied.id;
    root.dataset.seasonPhase = applied.phase;
    root.dataset.seasonLabel = applied.label;
    return applied;
  }
  if (!resolution) {
    delete root.dataset.season;
    delete root.dataset.seasonPhase;
    delete root.dataset.seasonLabel;
    return null;
  }
  const applied = resolution;
  root.dataset.season = applied.id;
  root.dataset.seasonPhase = applied.phase;
  root.dataset.seasonLabel = applied.label;
  return applied;
}

/** 테마 표에서 한 해 전체를 검사용으로 훑는다(격리 QA·문서용). */
export function describeYear(year, { lunarTable = null, themes = SEASONAL_THEMES } = {}) {
  const days = [];
  const start = `${year}-01-01`;
  for (let i = 0; i < 366; i += 1) {
    const day = addDays(start, i);
    if (day.slice(0, 4) !== String(year)) break;
    const resolution = resolveSeasonalTheme(day, { lunarTable, themes });
    days.push({ day, season: resolution?.id ?? null, phase: resolution?.phase ?? null, peak: resolution?.peak ?? null });
  }
  return days;
}
