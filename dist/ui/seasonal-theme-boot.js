// 시즌 테마 부트스트랩: 음력 표를 읽어 오늘(한국 시간) 기준 테마를 적용한다.
// 기준 테마(dark/light)와 분리되어 있고, 사용자가 끄거나 특정 시즌으로 고정할 수 있다.
import { applySeasonalTheme, normalizeMode, resolveSeasonalTheme, SEASONAL_THEMES } from './seasonal-theme.js';

const STORAGE_KEY = 'atlas-season-mode';
const TABLE_URL = './data/seasonal/lunar-calendar.json';

function readMode(storage) {
  try {
    return normalizeMode(storage?.getItem(STORAGE_KEY) || 'auto');
  } catch {
    return 'auto';
  }
}

function writeMode(storage, mode) {
  try {
    storage?.setItem(STORAGE_KEY, normalizeMode(mode));
  } catch {
    /* 저장이 막힌 환경에서는 이번 세션에만 적용한다. */
  }
}

let cachedTable = null;

async function loadLunarTable(fetchImpl) {
  if (cachedTable) return cachedTable;
  try {
    const response = await fetchImpl(TABLE_URL, { cache: 'force-cache' });
    if (!response?.ok) return null;
    const data = await response.json();
    if (data && data.years && typeof data.years === 'object') cachedTable = data;
  } catch {
    /* 표를 못 읽으면 양력 명절만 적용한다. */
  }
  return cachedTable;
}

/**
 * @param {{root?: HTMLElement, storage?: Storage, fetchImpl?: Function, now?: () => Date}} [options]
 */
export function initSeasonalTheme({ root = document.documentElement, storage = globalThis.localStorage, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  let mode = readMode(storage);
  let resolution = null;

  const apply = (date = now()) => {
    resolution = applySeasonalTheme({ root, date, mode, lunarTable: cachedTable });
    ensureChip(resolution);
    return resolution;
  };

  let chip = null;
  const ensureChip = resolutionValue => {
    if (typeof document === 'undefined' || !document.body) return;
    if (!resolutionValue) {
      if (chip) { chip.remove(); chip = null; }
      return;
    }
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'atlas-season-chip';
      chip.addEventListener('click', () => { api.setMode('off'); apply(); });
      document.body.appendChild(chip);
    }
    chip.textContent = `${resolutionValue.emoji} ${resolutionValue.label}`;
    chip.setAttribute('aria-label', `${resolutionValue.label} 시즌 테마 적용 중 · 눌러서 끄기`);
    chip.dataset.phase = resolutionValue.phase;
  };

  const api = {
    get mode() { return mode; },
    get resolution() { return resolution; },
    themes: SEASONAL_THEMES.map(({ id, label, emoji }) => ({ id, label, emoji })),
    resolve: date => resolveSeasonalTheme(date, { lunarTable: cachedTable }),
    setMode(next) {
      mode = normalizeMode(next);
      writeMode(storage, mode);
      return apply();
    },
    refresh: () => apply(),
  };

  // 첫 페인트 뒤에 적용해 차트 렌더를 막지 않는다.
  const start = () => {
    apply();
    loadLunarTable(fetchImpl).then(() => apply());
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(start);
  else start();

  // 자정이 지나거나 탭이 다시 보일 때 날짜를 다시 본다.
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) apply();
    });
  }
  if (typeof setInterval === 'function') setInterval(() => apply(), 30 * 60 * 1000);

  return api;
}
