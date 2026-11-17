const KEY = 'atlas-chart-drawings-v1';
const PREF_KEY = 'atlas-chart-drawbar-v1';
const DAY = 86400000;
const COLOR = '#8eb4ff';
const RATIOS = [0, .236, .382, .5, .618, .786, 1];
const SVG_NS = 'http://www.w3.org/2000/svg';
const CHEVRON = '<path d="M6 0v6H0z" fill="currentColor" stroke="none"></path>';

const iconOf = inner => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** Source: https://funnest.xyz/trade/ drawing rail, measured 2026-11-17. */
export const DRAW_GROUPS = [
  {id:'cursor', more:'커서 종류', tools:[
    ['crosshair','십자','<path d="M10 3v14M3 10h14"></path>',0,'cursor','crosshair'],
    ['dot','점','<circle cx="10" cy="10" r="2.6" fill="currentColor"></circle>',0,'cursor','crosshair'],
    ['arrow','화살표','<path d="M5 3.5l10 6.2-4.4 1.1-2 4.2z"></path>',0,'select','crosshair'],
    ['demo','데모 커서','<circle cx="10" cy="10" r="6.5" opacity="0.5"></circle><circle cx="10" cy="10" r="2.2" fill="currentColor"></circle>',0,'cursor','crosshair'],
    ['eraser','지우개','<path d="M3 13.5 11.5 5l5 5L9.5 17H6z"></path><path d="M7 9.5l5 5"></path>',0,'eraser','crosshair'],
    ['pan','차트 이동','<path d="M10 3v14M3 10h14M6.5 6.5 10 3l3.5 3.5M6.5 13.5 10 17l3.5-3.5M6.5 6.5 3 10l3.5 3.5M13.5 6.5 17 10l-3.5 3.5"></path>',0,'cursor','pan'],
  ]},
  {id:'trend', more:'도구 더 보기', tools:[
    ['trend','추세선','<path d="M5 15L15 5"></path><circle cx="5" cy="15" r="1.6" fill="currentColor"></circle><circle cx="15" cy="5" r="1.6" fill="currentColor"></circle>',2],
    ['ray','반직선','<path d="M4 15L16 5"></path><circle cx="4" cy="15" r="1.6" fill="currentColor"></circle>',2],
    ['extended','연장선','<path d="M2 17 18 3"></path><circle cx="7" cy="12.6" r="1.5" fill="currentColor"></circle><circle cx="13" cy="7.4" r="1.5" fill="currentColor"></circle>',2],
    ['channel','평행 채널','<path d="M3 13L13 5M7 16L17 8"></path><path d="M5 14.5L15 6.5" stroke-dasharray="1.5 2" opacity="0.6"></path>',3],
    ['info','정보선','<path d="M3 15 13 7"></path><rect x="11" y="11" width="7" height="5" rx="1"></rect>',2],
    ['regression','회귀 추세','<path d="M3 13 17 6"></path><path d="M3 9.5 17 2.5M3 16.5 17 9.5" stroke-dasharray="2 2" opacity="0.7"></path>',2],
  ]},
  {id:'level', more:'도구 더 보기', tools:[
    ['hline','수평선','<path d="M3 10h14"></path><circle cx="10" cy="10" r="1.6" fill="currentColor"></circle>',1],
    ['vline','수직선','<path d="M10 3v14"></path><circle cx="10" cy="10" r="1.6" fill="currentColor"></circle>',1],
    ['hray','수평 반직선','<path d="M4 10h14"></path><circle cx="4" cy="10" r="1.7" fill="currentColor"></circle>',1],
    ['cross','십자선','<path d="M10 2v16M2 10h16"></path>',1],
  ]},
  {id:'fib', more:'도구 더 보기', tools:[
    ['fib','피보나치 되돌림','<path d="M3 3.5h14M3 7.4h14M3 9.9h14M3 12.3h14M3 16.5h14"></path><path d="M4.5 16.5 15.5 3.5" stroke-dasharray="1.6 1.8" opacity="0.7"></path>',2],
    ['fib-trend','피보나치 추세','<path d="M3 16.5 8 6l4 6.5"></path><path d="M12 3.5h6M12 7.5h6M12 10h6" opacity="0.8"></path>',2],
    ['fib-channel','피보나치 채널','<path d="M3 12 15 4M3 15 15 7M3 18 15 10"></path><path d="M3 9 15 1" opacity="0.5"></path>',3],
    ['fib-time','피보나치 타임존','<path d="M3 3v14M5 3v14M8 3v14M13 3v14"></path>',2],
    ['fib-fan','피보나치 속도 저항 팬','<path d="M3 17 17 3M3 17 17 8M3 17 17 13M3 17h14M3 17V3"></path>',2],
    ['fib-trend-time','추세 기반 피보나치 시간','<path d="M2 16 7 6l3 6"></path><path d="M12 3v14M14.5 3v14M17.5 3v14" opacity="0.8"></path>',2],
    ['fib-circle','피보나치 원','<circle cx="10" cy="10" r="7.5"></circle><circle cx="10" cy="10" r="4.6"></circle><circle cx="10" cy="10" r="2"></circle>',2],
    ['fib-spiral','피보나치 나선','<path d="M10 10.5c1 0 1.6-.8 1.4-1.7-.3-1.3-1.8-1.8-3-1.2-1.9.9-2 3.5-.6 4.9 1.9 2 5.4 1.6 6.8-.8 1.9-3.1 0-7.2-3.5-8.1C7 2.5 2.8 5.3 2.7 9.6"></path>',2],
    ['fib-arc','피보나치 속도 저항 호','<path d="M3 17a14 14 0 0 1 14-14M3 17a9 9 0 0 1 9-9M3 17a5 5 0 0 1 5-5"></path><path d="M3 17 17 3" opacity="0.5"></path>',2],
    ['fib-wedge','피보나치 쐐기','<path d="M3 15 17 4M3 15h14"></path><path d="M9 15a6 6 0 0 0-.7-2.8M14 15a11 11 0 0 0-1.3-5.2"></path>',3],
    ['pitchfan','피치팬','<path d="M3 17 16 3M3 17 17 7M3 17 17 11M3 17 15 16"></path><path d="M16 3 15 16" opacity="0.5"></path>',3],
    ['gann-box','갠 박스','<rect x="3" y="3" width="14" height="14" rx="1"></rect><path d="M10 3v14M3 10h14"></path>',2],
    ['gann-square-fixed','갠 스퀘어 고정','<rect x="3" y="3" width="14" height="14" rx="1"></rect><path d="M3 17 17 3M3 3l14 14"></path><path d="M3 10a7 7 0 0 1 7 7" opacity="0.7"></path>',2],
    ['gann-square','갠 스퀘어','<rect x="3" y="3" width="14" height="14" rx="1"></rect><path d="M3 17 17 3M3 17 17 10M3 17 10 3"></path><path d="M10 3v14M3 10h14" opacity="0.5"></path>',2],
    ['gann-fan','갠 팬','<path d="M3 17 17 3M3 17 17 10M3 17 10 3M3 17 17 14M3 17 14 3"></path>',2],
  ]},
  {id:'pitchfork', more:'도구 더 보기', tools:[
    ['pitchfork','피치포크','<path d="M3 17 9 10M9 10l8-6M9 10l8 2M9 10l8 8"></path>',3],
    ['schiff','쉬프 피치포크','<path d="M3 15h6M9 15l8-9M9 15l8-2M9 15l8 4"></path>',3],
    ['modified-schiff','수정 쉬프 피치포크','<path d="M3 17l6-4M9 13l8-8M9 13l8 0M9 13l8 5"></path>',3],
  ]},
  {id:'pattern', more:'도구 더 보기', tools:[
    ['xabcd','XABCD 패턴','<path d="M2 15 6 5l3.5 7 3.5-5 4 9"></path>',5,'XABCD'],
    ['cypher','사이퍼 패턴','<path d="M2 15 6 6l3 5 4-8 4 11"></path><circle cx="2" cy="15" r="1.3" fill="currentColor"></circle>',5,'XABCD'],
    ['head-shoulders','헤드 앤 숄더','<path d="M1.5 16 4.5 9 7 12l3-8 3 8 2.5-3 3 7"></path><path d="M3 12h14" opacity="0.5"></path>',7,'ABCDEFG'],
    ['abcd','ABCD 패턴','<path d="M3 15 8 5l4 6 5-8"></path>',4,'ABCD'],
    ['triangle-pattern','삼각형 패턴','<path d="M2 4 17 9 2 16"></path><path d="M2 4l4 10 3-8 3 5" opacity="0.7"></path>',4,'ABCD'],
    ['three-drives','쓰리 드라이브 패턴','<path d="M2 17 5 11l2 2 3-6 2 2 3-6 3 2"></path>',7,'1234567'],
    ['elliott-impulse','엘리어트 충격 파동','<path d="M2 17 5 9l2 3 4-9 2 5 4-3"></path><circle cx="17" cy="5" r="1.2" fill="currentColor"></circle>',6,'012345'],
    ['elliott-corrective','엘리어트 조정 파동','<path d="M3 4 8 13l3-4 6 8"></path>',4,'0ABC'],
    ['elliott-triangle','엘리어트 삼각형 파동','<path d="M2 4 5 15l3-9 3 7 3-5 3 3"></path>',6,'ABCDE'],
    ['elliott-double','엘리어트 더블 콤보','<path d="M3 16 8 6l3 5 6-8"></path>',4,'WXY'],
    ['elliott-triple','엘리어트 트리플 콤보','<path d="M2 17 5 10l2 3 4-7 2 3 4-6"></path><circle cx="17" cy="3" r="1.2" fill="currentColor"></circle>',6,'WXYXZ'],
    ['cycle-lines','주기선','<path d="M4 3v14M10 3v14M16 3v14"></path>',2],
    ['time-cycles','타임 사이클','<path d="M2 14a4 4 0 0 1 8 0 4 4 0 0 1 8 0"></path><path d="M2 14h16" opacity="0.5"></path>',2],
    ['sine','사인선','<path d="M2 10c2-6 4-6 6 0s4 6 6 0 3-4 4-3"></path>',2],
  ]},
  {id:'text', more:'도구 더 보기', tools:[
    ['text','텍스트','<path d="M4.5 5V3.8h11V5M10 3.8v12.5M7.5 16.3h5"></path>',1],
    ['balloon','말풍선','<path d="M3.5 4.5h13v8h-7l-3.5 3v-3h-2.5z"></path>',2],
    ['brush','브러시','<path d="M3 15c3-1 3-7 6-7s2 6 5 6 3-5 3-5"></path>',-1],
    ['highlighter','하이라이터','<path d="M4 15l7-7 3 3-7 7H4zM11 8l3-3 3 3-3 3"></path>',-1],
    ['price-note','가격 노트','<circle cx="5" cy="15" r="1.7" fill="currentColor"></circle><path d="M6 14l4-5"></path><rect x="9" y="3.5" width="9" height="6" rx="1.2"></rect>',1],
    ['pin','핀','<path d="M10 17s-5-5.2-5-9a5 5 0 0 1 10 0c0 3.8-5 9-5 9z"></path><circle cx="10" cy="8" r="1.8"></circle>',1],
    ['sign','표지판','<path d="M10 18V3"></path><path d="M10 4h6l2 2.5L16 9h-6z"></path>',1],
  ]},
  {id:'marker', more:'도구 더 보기', tools:[
    ['arrow-marker','화살표 마커','<path d="M3 8h8V5l6 5-6 5v-3H3z"></path>',2],
    ['line-arrow','화살표','<path d="M4 16 15 5M9 5h6v6"></path>',2],
    ['mark-left','왼쪽 화살표 마크','<path d="M16 10H4M9 5l-5 5 5 5"></path>',1],
    ['mark-right','오른쪽 화살표 마크','<path d="M4 10h12M11 5l5 5-5 5"></path>',1],
    ['mark-up','위 화살표 마크','<path d="M10 16V4M5 9l5-5 5 5"></path>',1],
    ['mark-down','아래 화살표 마크','<path d="M10 4v12M5 11l5 5 5-5"></path>',1],
    ['flag','깃발 마크','<path d="M5 17V3M5 4h10l-2.5 3.5L15 11H5"></path>',1],
  ]},
  {id:'shape', more:'도구 더 보기', tools:[
    ['rect','사각형','<rect x="3.5" y="5" width="13" height="10" rx="1"></rect>',2],
    ['circle','원','<circle cx="10" cy="10" r="6.5"></circle>',2],
    ['ellipse','타원','<ellipse cx="10" cy="10" rx="7.5" ry="4.5"></ellipse>',2],
    ['triangle','삼각형','<path d="M10 3.5 17 16H3z"></path>',3],
    ['curve','곡선','<path d="M3 15C6 3 14 3 17 15"></path>',3],
    ['path','경로','<path d="M3 15l4-6 4 4 6-8"></path><path d="M13.5 5H17v3.5"></path>',-1],
    ['polygon','다각형','<path d="M10 3l7 5-3 8H6L3 8z"></path>',-2],
  ]},
  {id:'position', more:'도구 더 보기', tools:[
    ['long','롱 포지션','<rect x="4" y="4" width="12" height="6" rx="1"></rect><rect x="4" y="10" width="12" height="5" rx="1" opacity="0.5"></rect><path d="M7 8l3-2.5L13 8"></path>',2],
    ['short','숏 포지션','<rect x="4" y="5" width="12" height="5" rx="1" opacity="0.5"></rect><rect x="4" y="10" width="12" height="6" rx="1"></rect><path d="M7 12l3 2.5 3-2.5"></path>',2],
    ['forecast','예측','<path d="M3 15 8 11l3 2 6-7"></path><circle cx="17" cy="6" r="1.6"></circle>',2],
    ['ghost','고스트 피드','<path d="M5 6v10M10 4v8M15 8v9" opacity="0.6"></path><rect x="3.5" y="8" width="3" height="5" rx=".6"></rect><rect x="8.5" y="6" width="3" height="4" rx=".6"></rect><rect x="13.5" y="10" width="3" height="5" rx=".6"></rect>',2],
    ['bars','바 패턴','<path d="M4 5v9M8 7v8M12 4v7"></path><path d="M14 9v7M17 6v6" opacity="0.5"></path>',2],
    ['sector','섹터','<path d="M4 16 16 8a9 9 0 0 0-6-4.5z"></path>',2],
    ['vwap','고정 VWAP','<path d="M3 14c3-1 4-6 7-6s3 4 7 2"></path><path d="M3 4v12" opacity="0.6"></path>',1],
    ['profile','고정 범위 거래량 프로필','<path d="M4 3v14"></path><path d="M4 5h6M4 8h10M4 11h13M4 14h7"></path>',2],
    ['price-range','가격 범위','<path d="M10 3v14M7 6l3-3 3 3M7 14l3 3 3-3"></path><path d="M4 3h12M4 17h12" opacity="0.6"></path>',2],
    ['date-range','날짜 범위','<path d="M3 10h14M6 7l-3 3 3 3M14 7l3 3-3 3"></path><path d="M3 4v12M17 4v12" opacity="0.6"></path>',2],
    ['date-price','날짜 및 가격 범위','<path d="M4 16V4M4 16h12"></path><path d="M8 12l3-3 2 2 3-4"></path>',2],
  ]},
].map(group => ({...group, tools: group.tools.map(([id,label,icon,points,kind,chartTool]) => ({id, label, icon, points, kind: kind || id, chartTool: chartTool || (points === 0 ? null : 'crosshair'), letters: typeof kind === 'string' && kind !== 'cursor' && kind !== 'select' && kind !== 'eraser' ? kind : ''}))}));

const TOOLS = new Map(DRAW_GROUPS.flatMap(group => group.tools.map(tool => [tool.id, tool])));
export const toolById = id => TOOLS.get(id) || null;
export const drawToolCount = () => TOOLS.size;

const dayNum = value => { const n = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`); return Number.isFinite(n) ? n / DAY : NaN; };
const num = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : Math.abs(value) >= 1 ? 2 : 4}) : '';
const pct = (from, to) => from ? `${to / from - 1 >= 0 ? '+' : ''}${((to / from - 1) * 100).toFixed(2)}%` : '';

export function fibRetracement(start, end) {
  return RATIOS.map(ratio => ({ratio, price: end.price + (start.price - end.price) * ratio}));
}

export function pitchforkGuide(points, kind = 'pitchfork') {
  const [p0, p1, p2] = points;
  const mid = {day: (p1.day + p2.day) / 2, price: (p1.price + p2.price) / 2};
  const origin = kind === 'schiff' ? {day: p0.day, price: (p0.price + p1.price) / 2} : kind === 'modified-schiff' ? {day: (p0.day + mid.day) / 2, price: (p0.price + mid.price) / 2} : p0;
  return {origin, mid, p1, p2};
}

export function projectPoint(point, scale) {
  const span = Math.max(1, dayNum(scale.end) - dayNum(scale.start));
  const x = scale.left + (point.day - dayNum(scale.start)) / span * (scale.right - scale.left);
  const transform = scale.log ? Math.log : value => value;
  const first = transform(scale.min), extent = transform(scale.max) - first;
  const t = (transform(point.price) - first) / extent;
  const y = scale.inverted ? scale.top + t * (scale.bottom - scale.top) : scale.bottom - t * (scale.bottom - scale.top);
  return {x, y};
}

export function unprojectPoint(x, y, scale) {
  const span = Math.max(1, dayNum(scale.end) - dayNum(scale.start));
  const day = dayNum(scale.start) + (x - scale.left) / (scale.right - scale.left) * span;
  const reverse = scale.log ? Math.exp : value => value;
  const transform = scale.log ? Math.log : value => value;
  const first = transform(scale.min), extent = transform(scale.max) - first;
  const t = scale.inverted ? (y - scale.top) / (scale.bottom - scale.top) : (scale.bottom - y) / (scale.bottom - scale.top);
  return {day, price: reverse(first + t * extent)};
}

export function lineThrough(a, b, box, mode = 'segment') {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return [a, b];
  const hits = [];
  if (dx) hits.push((box.left - a.x) / dx, (box.right - a.x) / dx);
  if (dy) hits.push((box.top - a.y) / dy, (box.bottom - a.y) / dy);
  const inside = hits.filter(t => { const x = a.x + t * dx, y = a.y + t * dy; return x >= box.left - .5 && x <= box.right + .5 && y >= box.top - .5 && y <= box.bottom + .5; }).sort((p, q) => p - q);
  if (inside.length < 2) return [a, b];
  let t0 = inside[0], t1 = inside.at(-1);
  if (mode === 'segment') { t0 = Math.max(t0, 0); t1 = Math.min(t1, 1); }
  if (mode === 'ray') t0 = Math.max(t0, 0);
  if (t1 < t0) return [a, b];
  return [{x: a.x + t0 * dx, y: a.y + t0 * dy}, {x: a.x + t1 * dx, y: a.y + t1 * dy}];
}

const readScale = svg => {
  const left = Number(svg.dataset.plotLeft), right = Number(svg.dataset.plotRight);
  const top = Number(svg.dataset.priceTop), bottom = Number(svg.dataset.priceAxisBottom);
  const min = Number(svg.dataset.priceMin), max = Number(svg.dataset.priceMax);
  if (![left, right, top, bottom, min, max].every(Number.isFinite) || !(max > min) || !(right > left) || !svg.dataset.start || !svg.dataset.end) return null;
  const view = svg.viewBox?.baseVal;
  return {left, right, top, bottom, min, max, start: svg.dataset.start, end: svg.dataset.end, log: svg.dataset.scale !== 'linear', inverted: svg.dataset.invertScale === 'true', viewWidth: view?.width || right, viewHeight: view?.height || bottom};
};

let drawings = [];
let loaded = false;
let active = 'crosshair';
let selectedId = null;
let draft = null;
let preview = null;
let drag = null;
let stay = false;
let locked = false;
let hidden = false;
let collapsed = false;
let echoing = false;
let seq = 1;

const ensureLoaded = () => {
  if (loaded) return;
  loaded = true;
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(KEY) || '[]');
    drawings = Array.isArray(parsed) ? parsed.filter(item => item && toolById(item.tool) && Array.isArray(item.points) && item.points.every(point => Number.isFinite(point.day) && Number.isFinite(point.price) && point.price > 0)).slice(-200) : [];
  } catch { drawings = []; }
  try {
    const pref = JSON.parse(globalThis.localStorage?.getItem(PREF_KEY) || '{}');
    stay = Boolean(pref.stay); locked = Boolean(pref.locked); hidden = Boolean(pref.hidden); collapsed = Boolean(pref.collapsed);
  } catch { /* keep defaults */ }
};
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(drawings)); localStorage.setItem(PREF_KEY, JSON.stringify({stay, locked, hidden, collapsed})); } catch { /* private mode keeps the session copy */ } };
const chartSvg = () => document.getElementById('lab-chart');
const announce = text => { const live = document.getElementById('workbench-announcement'); if (live) live.textContent = text; };
const boxOf = scale => ({left: scale.left, right: scale.right, top: scale.top, bottom: scale.bottom});
const placed = (points, scale) => points.map(point => ({...point, ...projectPoint(point, scale)}));
const candlesOf = svg => [...svg.querySelectorAll('.observed-candle')].map(node => ({date: node.dataset.date, day: dayNum(node.dataset.date), open: Number(node.dataset.open), high: Number(node.dataset.high), low: Number(node.dataset.low), close: Number(node.dataset.close), volume: Number(node.dataset.volume)})).filter(item => Number.isFinite(item.day) && item.close > 0);
const magnetMode = event => { const mode = document.getElementById('workbench-magnet')?.dataset.magnetMode || 'off'; return event?.ctrlKey || event?.metaKey ? (mode === 'off' ? 'weak' : 'off') : mode; };

function snap(pixel, scale, svg, event) {
  const point = unprojectPoint(pixel.x, pixel.y, scale);
  if (!(point.price > 0)) return null;
  const mode = magnetMode(event);
  if (mode === 'off') return point;
  let best = null, score = Infinity;
  for (const candle of candlesOf(svg)) {
    const x = projectPoint(candle, scale).x, dx = Math.abs(x - pixel.x);
    if (mode === 'weak' && dx > 16) continue;
    for (const price of [candle.open, candle.high, candle.low, candle.close]) {
      if (!(price > 0)) continue;
      const distance = Math.hypot(dx, projectPoint({day: candle.day, price}, scale).y - pixel.y);
      if (distance < score) { score = distance; best = {day: candle.day, price}; }
    }
  }
  return mode === 'strong' || score <= 18 ? best || point : point;
}

const locate = event => {
  const svg = event.target?.closest?.('#lab-chart');
  if (!svg || svg.dataset.chartReplayActive === 'true') return null;
  const scale = readScale(svg);
  if (!scale) return null;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = (event.clientX - rect.left) / rect.width * scale.viewWidth;
  const y = (event.clientY - rect.top) / rect.height * scale.viewHeight;
  if (x < scale.left || x > scale.right || y < scale.top || y > scale.bottom) return null;
  const point = snap({x, y}, scale, svg, event);
  return point ? {svg, scale, x, y, point} : null;
};

const segmentDistance = (x, y, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
};

function hitTest(hit) {
  let found = null, best = 10;
  for (const drawing of drawings) {
    const points = placed(drawing.points, hit.scale);
    if (['hline', 'hray', 'cross'].includes(drawing.tool) && points[0] && Math.abs(points[0].y - hit.y) < 8) found = drawing;
    if (['vline', 'cross'].includes(drawing.tool) && points[0] && Math.abs(points[0].x - hit.x) < 8) found = drawing;
    for (const point of points) { const distance = Math.hypot(point.x - hit.x, point.y - hit.y); if (distance < best) { best = distance; found = drawing; } }
    for (let index = 1; index < points.length; index++) { const distance = segmentDistance(hit.x, hit.y, points[index - 1], points[index]); if (distance < best) { best = distance; found = drawing; } }
  }
  return found;
}

const line = (a, b, extra = '') => `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}" ${extra}/>`;
const textAt = (x, y, value, anchor = 'start') => `<text x="${num(x)}" y="${num(y)}" fill="#d5e2f4" stroke="none" font-size="11" text-anchor="${anchor}">${esc(value)}</text>`;
const stroke = (a, b, box, mode) => { const [p, q] = lineThrough(a, b, box, mode); return line(p, q); };
const dots = points => points.map(point => `<circle cx="${num(point.x)}" cy="${num(point.y)}" r="2.4" fill="${COLOR}" stroke="none"/>`).join('');
const rubber = points => points.length < 2 ? dots(points) : `<polyline points="${points.map(point => `${num(point.x)},${num(point.y)}`).join(' ')}" fill="none"/>${dots(points)}`;
const labelOf = (drawing, index) => drawing.letters?.[index] || toolById(drawing.tool)?.letters?.[index] || String(index + 1);

function renderPattern(drawing, ctx) {
  const points = placed(drawing.points, ctx.scale);
  const body = points.length > 1 ? `<polyline points="${points.map(point => `${num(point.x)},${num(point.y)}`).join(' ')}" fill="none"/>` : '';
  return body + points.map((point, index) => `${dots([point])}${textAt(point.x + 5, point.y - 4, labelOf(drawing, index))}`).join('');
}

function renderDrawing(drawing, ctx) {
  const spec = toolById(drawing.tool);
  if (!spec || spec.points === 0) return '';
  const points = placed(drawing.points, ctx.scale);
  if (spec.points > 0 && points.length < spec.points || points.length < 1) return rubber(points);
  const box = boxOf(ctx.scale);
  const [a, b, c] = points;
  const candles = () => candlesOf(ctx.svg);
  if (drawing.tool === 'trend') return stroke(a, b, box, 'segment') + dots(points);
  if (drawing.tool === 'ray') return stroke(a, b, box, 'ray') + dots([a]);
  if (drawing.tool === 'extended') return stroke(a, b, box, 'line') + dots(points);
  if (drawing.tool === 'channel') {
    const offset = {day: c.day - b.day, price: c.price - b.price};
    const q0 = projectPoint({day: a.day + offset.day, price: a.price + offset.price}, ctx.scale);
    const q1 = projectPoint({day: b.day + offset.day, price: b.price + offset.price}, ctx.scale);
    const mid0 = projectPoint({day: a.day + offset.day / 2, price: a.price + offset.price / 2}, ctx.scale);
    const mid1 = projectPoint({day: b.day + offset.day / 2, price: b.price + offset.price / 2}, ctx.scale);
    return `<polygon points="${num(a.x)},${num(a.y)} ${num(b.x)},${num(b.y)} ${num(q1.x)},${num(q1.y)} ${num(q0.x)},${num(q0.y)}" fill="${COLOR}" fill-opacity=".08" stroke="none"/>${stroke(a, b, box, 'segment')}${stroke(q0, q1, box, 'segment')}${stroke(mid0, mid1, box, 'segment').replace('<line', '<line stroke-dasharray="4 3" opacity=".7"')}`;
  }
  if (drawing.tool === 'info' || drawing.tool === 'price-range' || drawing.tool === 'date-range' || drawing.tool === 'date-price') {
    const days = Math.round(b.day - a.day);
    const change = pct(a.price, b.price);
    const label = drawing.tool === 'price-range' ? `${money(a.price)} → ${money(b.price)} · ${change}` : drawing.tool === 'date-range' ? `${days >= 0 ? '+' : ''}${days}일` : `${days >= 0 ? '+' : ''}${days}일 · ${change} · ${money(b.price - a.price)}`;
    const range = drawing.tool === 'price-range' ? line({x: (a.x + b.x) / 2, y: a.y}, {x: (a.x + b.x) / 2, y: b.y}) : drawing.tool === 'date-range' ? line({x: a.x, y: (a.y + b.y) / 2}, {x: b.x, y: (a.y + b.y) / 2}) : `<rect x="${num(Math.min(a.x, b.x))}" y="${num(Math.min(a.y, b.y))}" width="${num(Math.abs(b.x - a.x))}" height="${num(Math.abs(b.y - a.y))}" fill="${COLOR}" fill-opacity=".08"/>${line(a, b)}`;
    return range + textAt(Math.max(a.x, b.x) + 6, Math.min(a.y, b.y) + 12, label);
  }
  if (drawing.tool === 'regression') {
    const rows = candles().filter(item => item.day >= Math.min(a.day, b.day) && item.day <= Math.max(a.day, b.day));
    if (rows.length < 2) return stroke(a, b, box, 'segment') + textAt(b.x + 6, b.y, '회귀 · 표본 부족');
    let count = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const row of rows) { const x = row.day, y = ctx.scale.log ? Math.log(row.close) : row.close; count++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const denom = count * sxx - sx * sx;
    if (!denom) return stroke(a, b, box, 'segment');
    const slope = (count * sxy - sx * sy) / denom, intercept = (sy - slope * sx) / count;
    const priceAt = day => ctx.scale.log ? Math.exp(intercept + slope * day) : intercept + slope * day;
    const start = projectPoint({day: Math.min(a.day, b.day), price: priceAt(Math.min(a.day, b.day))}, ctx.scale);
    const end = projectPoint({day: Math.max(a.day, b.day), price: priceAt(Math.max(a.day, b.day))}, ctx.scale);
    return stroke(start, end, box, 'segment') + textAt(end.x + 6, end.y, `회귀 · ${rows.length}개`);
  }
  if (drawing.tool === 'hline') return line({x: box.left, y: a.y}, {x: box.right, y: a.y}) + textAt(box.left + 6, a.y - 4, money(a.price));
  if (drawing.tool === 'hray') return line({x: a.x, y: a.y}, {x: box.right, y: a.y}) + dots([a]) + textAt(a.x + 6, a.y - 4, money(a.price));
  if (drawing.tool === 'vline') return line({x: a.x, y: box.top}, {x: a.x, y: box.bottom}) + textAt(a.x + 4, box.top + 12, new Date(a.day * DAY).toISOString().slice(0, 10));
  if (drawing.tool === 'cross') return line({x: box.left, y: a.y}, {x: box.right, y: a.y}) + line({x: a.x, y: box.top}, {x: a.x, y: box.bottom});
  if (drawing.tool === 'fib' || drawing.tool === 'fib-trend') {
    const levels = fibRetracement(a, b);
    const x1 = Math.min(a.x, b.x);
    return levels.map(level => { const y = projectPoint({day: a.day, price: level.price}, ctx.scale).y; return line({x: x1, y}, {x: box.right, y}, 'opacity=".85"') + textAt(x1 + 4, y - 3, `${level.ratio} · ${money(level.price)}`); }).join('') + (drawing.tool === 'fib-trend' ? stroke(a, b, box, 'segment') : stroke(a, b, box, 'segment').replace('<line', '<line stroke-dasharray="3 3" opacity=".65"'));
  }
  if (drawing.tool === 'fib-channel' && c) {
    return RATIOS.map(ratio => { const p = projectPoint({day: a.day + (c.day - a.day) * ratio, price: a.price + (c.price - a.price) * ratio}, ctx.scale); const q = projectPoint({day: b.day + (c.day - b.day) * ratio, price: b.price + (c.price - b.price) * ratio}, ctx.scale); return stroke(p, q, box, 'segment'); }).join('') + textAt(c.x + 4, c.y, '피보나치 채널');
  }
  if (drawing.tool === 'fib-time' || drawing.tool === 'cycle-lines') {
    const steps = drawing.tool === 'cycle-lines' ? [0, .5, 1] : [0, 1, 2, 3, 5, 8];
    const span = b.day - a.day || 1;
    return steps.map(step => { const x = projectPoint({day: a.day + span * step, price: a.price}, ctx.scale).x; return line({x, y: box.top}, {x, y: box.bottom}) + textAt(x + 3, box.top + 12, String(step)); }).join('');
  }
  if (drawing.tool === 'fib-fan' || drawing.tool === 'gann-fan') {
    const slopes = drawing.tool === 'gann-fan' ? [1, 2, .5, 3, 1 / 3, 4, .25, 8, .125] : RATIOS;
    return slopes.map(slope => { const end = drawing.tool === 'gann-fan' ? {x: a.x + (b.x - a.x), y: a.y + (b.y - a.y) * slope} : projectPoint({day: b.day, price: a.price + (b.price - a.price) * slope}, ctx.scale); return stroke(a, end, box, 'ray'); }).join('') + dots([a]);
  }
  if (drawing.tool === 'fib-trend-time') return stroke(a, b, box, 'segment') + [0, .382, .618, 1, 1.618].map(ratio => { const x = projectPoint({day: a.day + (b.day - a.day) * ratio, price: a.price}, ctx.scale).x; return line({x, y: box.top}, {x, y: box.bottom}, 'opacity=".75"'); }).join('');
  if (drawing.tool === 'fib-circle' || drawing.tool === 'fib-arc') {
    const radius = Math.hypot(b.x - a.x, b.y - a.y);
    return RATIOS.filter(ratio => ratio).map(ratio => drawing.tool === 'fib-circle' ? `<circle cx="${num(a.x)}" cy="${num(a.y)}" r="${num(radius * ratio)}" fill="none"/>` : `<path d="M ${num(a.x + radius * ratio)} ${num(a.y)} A ${num(radius * ratio)} ${num(radius * ratio)} 0 0 1 ${num(a.x)} ${num(a.y - radius * ratio)}" fill="none"/>`).join('') + dots([a, b]);
  }
  if (drawing.tool === 'fib-spiral') {
    const radius = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
    const turns = [];
    for (let index = 0; index <= 48; index++) { const t = index / 48 * Math.PI * 4, r = radius * Math.pow(1.618, t / (Math.PI * 2)) / 8; turns.push(`${num(a.x + Math.cos(t) * r)},${num(a.y + Math.sin(t) * r)}`); }
    return `<polyline points="${turns.join(' ')}" fill="none"/>`;
  }
  if (drawing.tool === 'fib-wedge' && c) {
    return RATIOS.filter(ratio => ratio).map(ratio => { const end = {x: a.x + (b.x - a.x) * ratio, y: a.y + (c.y - a.y) * ratio}; return stroke(a, end, box, 'segment'); }).join('') + stroke(b, c, box, 'segment');
  }
  if (drawing.tool === 'pitchfan' && c) return [a, b, c].map(origin => [a, b, c].filter(end => end !== origin).map(end => stroke(origin, end, box, 'ray')).join('')).join('');
  if (drawing.tool === 'gann-box' || drawing.tool === 'gann-square' || drawing.tool === 'gann-square-fixed') {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    const rect = `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${COLOR}" fill-opacity=".05"/>`;
    const mids = `<line x1="${num(x + w / 2)}" y1="${num(y)}" x2="${num(x + w / 2)}" y2="${num(y + h)}"/><line x1="${num(x)}" y1="${num(y + h / 2)}" x2="${num(x + w)}" y2="${num(y + h / 2)}"/>`;
    const diagonals = `<line x1="${num(x)}" y1="${num(y)}" x2="${num(x + w)}" y2="${num(y + h)}"/><line x1="${num(x)}" y1="${num(y + h)}" x2="${num(x + w)}" y2="${num(y)}"/>`;
    return rect + (drawing.tool === 'gann-box' ? mids : diagonals + (drawing.tool === 'gann-square' ? mids : ''));
  }
  if (['pitchfork', 'schiff', 'modified-schiff'].includes(drawing.tool) && c) {
    const guide = pitchforkGuide(points, drawing.tool);
    const origin = projectPoint(guide.origin, ctx.scale), mid = projectPoint(guide.mid, ctx.scale);
    const vector = {x: mid.x - origin.x, y: mid.y - origin.y};
    return stroke(origin, mid, box, 'ray') + stroke(a === points[1] ? b : b, {x: b.x + vector.x, y: b.y + vector.y}, box, 'ray') + stroke(c, {x: c.x + vector.x, y: c.y + vector.y}, box, 'ray') + line(b, c, 'opacity=".6"') + dots(points);
  }
  if (drawing.tool === 'text') return textAt(a.x, a.y, drawing.text || '텍스트');
  if (drawing.tool === 'balloon') return line(a, b) + `<rect x="${num(b.x)}" y="${num(b.y - 18)}" width="${num(Math.max(48, (drawing.text || '').length * 8))}" height="20" rx="4" fill="#17171c" stroke="${COLOR}"/>${textAt(b.x + 6, b.y - 4, drawing.text || '메모')}`;
  if (drawing.tool === 'brush' || drawing.tool === 'path' || drawing.tool === 'highlighter') return `<polyline points="${points.map(point => `${num(point.x)},${num(point.y)}`).join(' ')}" fill="none" stroke-width="${drawing.tool === 'highlighter' ? 8 : 1.6}" opacity="${drawing.tool === 'highlighter' ? .4 : 1}"/>`;
  if (drawing.tool === 'price-note') return dots([a]) + textAt(a.x + 8, a.y - 6, money(a.price));
  if (drawing.tool === 'pin') return `<path d="M ${num(a.x)} ${num(a.y)} v -14" fill="none"/><circle cx="${num(a.x)}" cy="${num(a.y - 16)}" r="4" fill="${COLOR}" stroke="none"/>`;
  if (drawing.tool === 'sign') return `<path d="M ${num(a.x)} ${num(a.y)} v -22 h 28 l 6 -6 l -6 -6 h -28 z" fill="${COLOR}" fill-opacity=".18"/>`;
  if (drawing.tool === 'arrow-marker' || drawing.tool === 'line-arrow' || drawing.tool === 'forecast') {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const wing = (turn, size = 9) => `${num(b.x - size * Math.cos(angle + turn))},${num(b.y - size * Math.sin(angle + turn))}`;
    return `${drawing.tool === 'forecast' ? stroke(a, b, box, 'ray').replace('<line', '<line stroke-dasharray="5 4"') : line(a, b)}<polygon points="${num(b.x)},${num(b.y)} ${wing(.45)} ${wing(-.45)}" fill="${COLOR}" stroke="none"/>${drawing.tool === 'forecast' ? textAt(b.x + 6, b.y, '예측') : ''}`;
  }
  if (drawing.tool.startsWith('mark-') || drawing.tool === 'flag') {
    const direction = { 'mark-left': [-1, 0], 'mark-right': [1, 0], 'mark-up': [0, -1], 'mark-down': [0, 1], flag: [1, 0] }[drawing.tool];
    const end = {x: a.x + direction[0] * 16, y: a.y + direction[1] * 16};
    return drawing.tool === 'flag' ? `<path d="M ${num(a.x)} ${num(a.y)} v -18 h 16 l -4 4 l 4 4 h -16" fill="${COLOR}" fill-opacity=".2"/>` : line(a, end) + dots([end]);
  }
  if (drawing.tool === 'rect' || drawing.tool === 'bars') { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return `<rect x="${num(x)}" y="${num(y)}" width="${num(Math.abs(b.x - a.x))}" height="${num(Math.abs(b.y - a.y))}" fill="${COLOR}" fill-opacity="${drawing.tool === 'bars' ? .16 : .08}"/>`; }
  if (drawing.tool === 'ellipse') return `<ellipse cx="${num((a.x + b.x) / 2)}" cy="${num((a.y + b.y) / 2)}" rx="${num(Math.abs(b.x - a.x) / 2)}" ry="${num(Math.abs(b.y - a.y) / 2)}" fill="${COLOR}" fill-opacity=".08"/>`;
  if (drawing.tool === 'circle') return `<circle cx="${num(a.x)}" cy="${num(a.y)}" r="${num(Math.hypot(b.x - a.x, b.y - a.y))}" fill="${COLOR}" fill-opacity=".06"/>`;
  if (drawing.tool === 'triangle' || drawing.tool === 'polygon') return `<polygon points="${points.map(point => `${num(point.x)},${num(point.y)}`).join(' ')}" fill="${COLOR}" fill-opacity=".08"/>`;
  if (drawing.tool === 'curve' && c) return `<path d="M ${num(a.x)} ${num(a.y)} Q ${num(b.x)} ${num(b.y)} ${num(c.x)} ${num(c.y)}" fill="none"/>`;
  if (drawing.tool === 'sector') { const radius = Math.hypot(b.x - a.x, b.y - a.y); return `<path d="M ${num(a.x)} ${num(a.y)} L ${num(b.x)} ${num(b.y)} A ${num(radius)} ${num(radius)} 0 0 1 ${num(a.x)} ${num(a.y - radius)} Z" fill="${COLOR}" fill-opacity=".16"/>`; }
  if (drawing.tool === 'long' || drawing.tool === 'short') {
    const entry = a.price, delta = b.price - entry, target = entry + delta, stop = entry - delta;
    const yTarget = projectPoint({day: a.day, price: target}, ctx.scale).y, yEntry = a.y, yStop = projectPoint({day: a.day, price: stop}, ctx.scale).y;
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x, x1 + 48);
    const band = (from, to, fill) => `<rect x="${num(x1)}" y="${num(Math.min(from, to))}" width="${num(x2 - x1)}" height="${num(Math.abs(to - from))}" fill="${fill}" fill-opacity=".18" stroke="none"/>`;
    const profit = drawing.tool === 'long' ? '#62bca5' : '#dd7e8d', loss = drawing.tool === 'long' ? '#dd7e8d' : '#62bca5';
    return band(yTarget, yEntry, profit) + band(yEntry, yStop, loss) + line({x: x1, y: yEntry}, {x: x2, y: yEntry}) + textAt(x1 + 4, yTarget + 12, `목표 ${money(target)}`) + textAt(x1 + 4, yEntry - 4, `진입 ${money(entry)}`) + textAt(x1 + 4, yStop - 4, `손절 ${money(stop)} · ${pct(entry, target)}`);
  }
  if (drawing.tool === 'ghost') {
    const parts = [];
    for (let index = 0; index < 8; index++) { const t = index / 7, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; parts.push(`<line x1="${num(x)}" y1="${num(y - 10)}" x2="${num(x)}" y2="${num(y + 10)}" opacity=".55"/><rect x="${num(x - 3)}" y="${num(y - 5)}" width="6" height="8" fill="${COLOR}" fill-opacity=".25" stroke="none"/>`); }
    return parts.join('') + textAt(b.x + 6, b.y, '고스트 피드');
  }
  if (drawing.tool === 'vwap') {
    const rows = candles().filter(item => item.day >= a.day).sort((p, q) => p.day - q.day);
    if (rows.length < 2) return line({x: a.x, y: a.y}, {x: box.right, y: a.y}) + textAt(a.x + 6, a.y - 4, 'VWAP · 캔들 부족');
    let total = 0, volume = 0; const path = [];
    for (const row of rows) { const typical = ((row.high || row.close) + (row.low || row.close) + row.close) / 3, weight = row.volume > 0 ? row.volume : 1; total += typical * weight; volume += weight; const point = projectPoint({day: row.day, price: total / volume}, ctx.scale); if (!path.length || path.length % Math.ceil(rows.length / 180) === 0) path.push(`${num(point.x)},${num(point.y)}`); }
    return `<polyline points="${path.join(' ')}" fill="none"/>` + textAt(a.x + 6, a.y - 4, rows.some(row => row.volume > 0) ? '고정 VWAP' : '균등 평균');
  }
  if (drawing.tool === 'profile') {
    const rows = candles().filter(item => item.day >= Math.min(a.day, b.day) && item.day <= Math.max(a.day, b.day));
    const prices = rows.map(row => ((row.high || row.close) + (row.low || row.close) + row.close) / 3);
    if (prices.length < 2) return stroke(a, b, box, 'segment') + textAt(b.x, b.y, '프로필 · 캔들 부족');
    const low = Math.min(...prices), high = Math.max(...prices), bins = 16, counts = Array(bins).fill(0);
    for (const price of prices) counts[Math.max(0, Math.min(bins - 1, Math.floor((price - low) / (high - low || 1) * bins)))]++;
    const max = Math.max(...counts), x = Math.min(a.x, b.x);
    return counts.map((count, index) => { const price = low + (high - low) * (index + .5) / bins, y = projectPoint({day: a.day, price}, ctx.scale).y; return `<rect x="${num(x)}" y="${num(y)}" width="${num(70 * count / max)}" height="4" fill="${COLOR}" fill-opacity=".45" stroke="none"/>`; }).join('');
  }
  if (drawing.tool === 'time-cycles' || drawing.tool === 'sine') {
    const span = Math.max(1, b.day - a.day), parts = [];
    for (let index = 0; index <= 64; index++) { const day = a.day + span * index / 32, price = drawing.tool === 'sine' ? a.price + (b.price - a.price) * Math.sin(index / 64 * Math.PI * 4) : a.price; if (drawing.tool === 'sine') { const point = projectPoint({day, price}, ctx.scale); parts.push(`${num(point.x)},${num(point.y)}`); } }
    if (drawing.tool === 'sine') return `<polyline points="${parts.join(' ')}" fill="none"/>`;
    return [0, .25, .5, .75, 1].map(step => { const x = projectPoint({day: a.day + span * step, price: a.price}, ctx.scale).x; return `<path d="M ${num(x)} ${num(box.bottom)} q ${num(span > 0 ? 12 : -12)} -30 ${num(span > 0 ? 24 : -24)} 0" fill="none"/>`; }).join('');
  }
  return renderPattern(drawing, ctx);
}

export function paintChartDrawings(svg) {
  try {
    if (!svg || svg.id !== 'lab-chart' || typeof document === 'undefined' || svg.ownerDocument !== document) return;
    ensureLoaded();
    svg.querySelector('#chart-draw-layer')?.remove();
    const scale = readScale(svg);
    if (!scale) return;
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'chart-draw-layer';
    layer.setAttribute('pointer-events', 'none');
    const clip = `chart-draw-clip-${svg.id}`;
    const items = (hidden ? [] : drawings).map(drawing => ({...drawing, letters: toolById(drawing.tool)?.letters}));
    if (draft) items.push({id: 'draft', tool: draft.tool, points: preview ? draft.points.concat(preview) : draft.points.slice(), text: draft.text, letters: toolById(draft.tool)?.letters, preview: true});
    layer.innerHTML = `<defs><clipPath id="${clip}"><rect x="${num(scale.left)}" y="${num(scale.top)}" width="${num(scale.right - scale.left)}" height="${num(scale.bottom - scale.top)}"/></clipPath></defs><g clip-path="url(#${clip})" fill="none" stroke="${COLOR}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${items.map(drawing => `<g data-draw-id="${esc(drawing.id)}"${drawing.id === selectedId ? ' stroke="#f4dcac"' : ''}${drawing.preview ? ' stroke-dasharray="4 3"' : ''}>${renderDrawing(drawing, {scale, svg})}</g>`).join('')}</g>`;
    svg.append(layer);
  } catch { /* The price chart remains usable when the overlay cannot paint. */ }
}

const refresh = () => paintChartDrawings(chartSvg());
const captures = id => { const spec = toolById(id); return Boolean(spec && (spec.kind === 'select' || spec.kind === 'eraser' || spec.points !== 0)); };
const askText = label => { const value = globalThis.prompt?.(`${label}에 넣을 문구`, ''); return value == null ? null : value.trim(); };

function finishDraft() {
  if (!draft || draft.points.length < 2 && toolById(draft.tool)?.points !== 1) { draft = null; preview = null; refresh(); return; }
  const item = {id: `d${(seq++).toString(36)}${Date.now().toString(36)}`, tool: draft.tool, points: draft.points.slice(), text: draft.text || ''};
  draft = null; preview = null; drawings.push(item); if (drawings.length > 200) drawings.splice(0, drawings.length - 200);
  selectedId = item.id; persist(); announce(`${toolById(item.tool).label}을 그렸습니다.`);
  if (!stay) setActive('arrow', {keep: true}); else refresh();
}

function reflectActive() {
  const spec = toolById(active);
  const group = DRAW_GROUPS.find(item => item.tools.some(tool => tool.id === active));
  if (group && spec) {
    const wrap = document.querySelector(`[data-draw-group="${group.id}"]`);
    const main = wrap?.querySelector('[data-draw-tool]');
    if (main) {
      wrap.dataset.selected = spec.id; main.dataset.drawTool = spec.id; main.innerHTML = iconOf(spec.icon);
      main.setAttribute('aria-label', spec.label); main.title = spec.label;
      const more = wrap.querySelector('.chart-draw-more');
      if (more) more.setAttribute('aria-label', `${group.more}: ${spec.label}`);
    }
  }
  document.querySelectorAll('[data-draw-tool]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.drawTool === active)));
  const svg = chartSvg();
  if (svg) { if (captures(active)) svg.dataset.drawing = active; else svg.removeAttribute('data-drawing'); svg.dataset.cursor = active; }
}

function setActive(id, {keep = false, silent = false} = {}) {
  const spec = toolById(id);
  if (!spec) return;
  active = id;
  if (!keep && !silent && spec.chartTool) { echoing = true; document.dispatchEvent(new CustomEvent('atlas:chart-command', {detail:{action:'tool', value:spec.chartTool}})); queueMicrotask(() => { echoing = false; }); }
  reflectActive();
  if (!silent) announce(spec.points > 0 ? `${spec.label} · ${spec.points}점` : spec.points === -1 ? `${spec.label} · 드래그` : spec.points === -2 ? `${spec.label} · 점을 찍고 더블클릭으로 닫기` : spec.label);
  refresh();
}

export function mountChartDrawbar(left, {command} = {}) {
  ensureLoaded();
  const listeners = new AbortController();
  const {signal} = listeners;
  const bar = document.createElement('div');
  bar.className = 'chart-drawbar';
  bar.dataset.collapsed = String(collapsed);
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '그리기 도구');
  const scroller = document.createElement('div');
  scroller.className = 'chart-draw-tools';
  const menu = document.createElement('div');
  menu.className = 'chart-draw-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  let menuOwner = null;
  const closeMenu = (focus = false) => { menu.hidden = true; menuOwner?.setAttribute('aria-expanded', 'false'); if (focus) menuOwner?.focus({preventScroll:true}); menuOwner = null; };
  const openMenu = (group, button) => {
    if (menuOwner === button && !menu.hidden) { closeMenu(true); return; }
    menu.replaceChildren(); menu.setAttribute('aria-label', group.more);
    for (const tool of group.tools) {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'chart-draw-option'; item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(tool.id === button.parentElement.dataset.selected));
      item.dataset.drawOption = tool.id; item.title = tool.label; item.innerHTML = iconOf(tool.icon); item.append(document.createTextNode(tool.label));
      item.onclick = () => { button.parentElement.dataset.selected = tool.id; const main = button.parentElement.querySelector('[data-draw-tool]'); main.dataset.drawTool = tool.id; main.setAttribute('aria-label', tool.label); main.title = tool.label; main.innerHTML = iconOf(tool.icon); setActive(tool.id); closeMenu(true); };
      menu.append(item);
    }
    menu.hidden = false; menuOwner = button; button.setAttribute('aria-expanded', 'true');
    const bounds = button.getBoundingClientRect(), width = 228, height = Math.min(menu.scrollHeight, 420);
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right + 6))}px`;
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, bounds.top))}px`;
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button'))?.focus({preventScroll:true});
  };
  for (const group of DRAW_GROUPS) {
    const wrap = document.createElement('div'); wrap.className = 'chart-draw-group'; wrap.dataset.drawGroup = group.id; wrap.dataset.selected = group.tools[0].id;
    const main = document.createElement('button'); main.type = 'button'; main.className = 'chart-draw-tool'; main.dataset.drawTool = group.tools[0].id;
    main.setAttribute('aria-pressed', 'false'); main.setAttribute('aria-label', group.tools[0].label); main.title = group.tools[0].label; main.innerHTML = iconOf(group.tools[0].icon);
    main.onclick = () => setActive(main.dataset.drawTool);
    const more = document.createElement('button'); more.type = 'button'; more.className = 'chart-draw-more'; more.setAttribute('aria-label', `${group.more}: ${group.tools[0].label}`); more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
    more.innerHTML = `<svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true">${CHEVRON}</svg>`;
    more.onclick = event => { event.stopPropagation(); openMenu(group, more); };
    wrap.append(main, more); scroller.append(wrap);
  }
  const ruler = document.createElement('button'); ruler.type = 'button'; ruler.className = 'chart-draw-tool'; ruler.dataset.drawTool = 'ruler'; ruler.setAttribute('aria-label', '자'); ruler.title = '자 · M'; ruler.setAttribute('aria-keyshortcuts', 'M'); ruler.setAttribute('aria-pressed', 'false');
  ruler.innerHTML = iconOf('<path d="M2.8 13.6 13.6 2.8l3.6 3.6L6.4 17.2z"></path><path d="M5.6 10.8 7.2 12.4M8.4 8 10 9.6M11.2 5.2l1.6 1.6"></path>');
  ruler.onclick = () => setActive('ruler');
  TOOLS.set('ruler', {id:'ruler', label:'자', points:0, kind:'cursor', chartTool:'measure'});
  scroller.append(ruler);
  const sep = document.createElement('div'); sep.className = 'chart-draw-sep';
  const utilities = document.createElement('div'); utilities.className = 'chart-draw-utilities';
  const utility = (id, label, icon, onClick) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'chart-draw-tool'; button.dataset.drawUtility = id; button.setAttribute('aria-label', label); button.title = label; button.setAttribute('aria-pressed', 'false'); button.innerHTML = iconOf(icon); button.onclick = onClick; utilities.append(button); return button; };
  const magnet = utility('magnet', '자석 모드 (시·고·저·종가에 붙이기)', '<path d="M5 4h3v6.5a2 2 0 0 0 4 0V4h3v6.5a5 5 0 0 1-10 0z"></path><path d="M5 7h3M12 7h3"></path>', () => document.getElementById('workbench-magnet')?.click());
  const stayButton = utility('stay', '연속 그리기 (도구 유지)', '<path d="M3.5 13.5 11 6l3 3-7.5 7.5H3.5z"></path><path d="M13 3.5a3.5 3.5 0 0 1 3.5 3.5M15 2l1.5 1.5L15 5"></path>', () => { stay = !stay; stayButton.setAttribute('aria-pressed', String(stay)); persist(); announce(stay ? '도구를 유지합니다.' : '한 번 그리면 화살표로 돌아갑니다.'); });
  const lockButton = utility('lock', '그림 모두 잠그기', '<rect x="4.5" y="9" width="11" height="8" rx="1.8"></rect><path d="M7 9V6.5a3 3 0 0 1 5.8-1"></path>', () => { locked = !locked; lockButton.setAttribute('aria-pressed', String(locked)); persist(); announce(locked ? '그림을 잠갔습니다.' : '그림 잠금을 풀었습니다.'); });
  const hideButton = utility('hide', '그림 모두 숨기기', '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"></path><circle cx="10" cy="10" r="2.3"></circle>', () => { hidden = !hidden; hideButton.setAttribute('aria-pressed', String(hidden)); persist(); refresh(); announce(hidden ? '그림을 숨겼습니다.' : '그림을 다시 표시합니다.'); });
  utility('delete', '그리기 모두 삭제', '<path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"></path>', () => {
    if (locked) { announce('그림이 잠겨 있어 삭제할 수 없습니다.'); return; }
    if (!drawings.length) { announce('지울 그림이 없습니다.'); return; }
    if (!globalThis.confirm?.('차트 위 그림을 모두 삭제할까요?')) return;
    drawings = []; selectedId = null; draft = null; persist(); refresh(); announce('그림을 모두 삭제했습니다.');
  });
  stayButton.setAttribute('aria-pressed', String(stay)); lockButton.setAttribute('aria-pressed', String(locked)); hideButton.setAttribute('aria-pressed', String(hidden));
  const spacer = document.createElement('span'); spacer.className = 'chart-draw-spacer';
  const collapse = document.createElement('button'); collapse.type = 'button'; collapse.className = 'chart-draw-collapse'; collapse.setAttribute('aria-label', collapsed ? '그리기 도구 펼치기' : '그리기 도구 접기');
  collapse.innerHTML = iconOf('<path d="M12 5l-5 5 5 5"></path>');
  collapse.onclick = () => { collapsed = !collapsed; bar.dataset.collapsed = String(collapsed); collapse.setAttribute('aria-label', collapsed ? '그리기 도구 펼치기' : '그리기 도구 접기'); persist(); };
  bar.append(scroller, sep, utilities, spacer, collapse); left.prepend(bar);
  for (const node of left.querySelectorAll(':scope > [data-chart-tool]')) { node.tabIndex = -1; node.setAttribute('aria-hidden', 'true'); }
  setActive('crosshair', {silent:true, keep:true});
  // A center workspace snapshots toolbar attributes while it covers the chart
  // and restores that snapshot when it closes. Reapply the active tool after it.
  document.addEventListener('atlas:center-restored', () => queueMicrotask(reflectActive), {signal});
  requestAnimationFrame(reflectActive);
  const onState = event => { magnet.setAttribute('aria-pressed', String(event.detail?.magnet && event.detail.magnet !== 'off')); };
  const onCommand = event => {
    if (echoing || event.detail?.action !== 'tool') return;
    const next = {crosshair:'crosshair', pan:'pan', measure:'ruler'}[event.detail.value];
    if (next && next !== active) setActive(next, {silent:true, keep:true});
  };
  const onKey = event => {
    if (event.target?.closest?.('input,textarea,select,[contenteditable=true]')) return;
    if (!menu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); const items = [...menu.querySelectorAll('button')]; const index = items.indexOf(document.activeElement); if (event.key === 'Escape') closeMenu(true); else { const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus(); } return; }
    if (event.key === 'Escape' && (draft || selectedId)) { event.preventDefault(); event.stopPropagation(); draft = null; preview = null; selectedId = null; refresh(); }
    else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && !locked) { event.preventDefault(); drawings = drawings.filter(item => item.id !== selectedId); selectedId = null; persist(); refresh(); announce('선택한 그림을 지웠습니다.'); }
    else if (event.key === 'Enter' && draft && toolById(draft.tool)?.points === -2 && draft.points.length >= 3) { event.preventDefault(); finishDraft(); }
  };
  const onPointerDown = event => {
    if (!menu.hidden && !menu.contains(event.target) && !event.target.closest?.('.chart-draw-more')) closeMenu();
    if (event.button !== 0 || !captures(active)) return;
    const hit = locate(event); if (!hit) return;
    const spec = toolById(active);
    event.preventDefault(); event.stopPropagation();
    if (spec.kind === 'select') { const found = hitTest(hit); selectedId = found?.id ?? null; drag = found && !locked ? {id: found.id, start: hit.point, points: found.points.map(point => ({...point}))} : null; if (found && locked) announce('그림이 잠겨 있어 옮길 수 없습니다.'); refresh(); return; }
    if (spec.kind === 'eraser') { if (locked) { announce('그림이 잠겨 있어 지울 수 없습니다.'); return; } const found = hitTest(hit); if (found) { drawings = drawings.filter(item => item.id !== found.id); if (selectedId === found.id) selectedId = null; persist(); refresh(); announce(`${toolById(found.tool).label}을 지웠습니다.`); } return; }
    if (spec.points === -2 && draft?.tool === active && draft.points.length >= 3) { const first = projectPoint(draft.points[0], hit.scale); if (Math.hypot(first.x - hit.x, first.y - hit.y) < 10 || event.detail > 1) { finishDraft(); return; } }
    if (!draft || draft.tool !== active) draft = {tool: active, points: [], text: ''};
    if (spec.points === -1) { draft.points = [hit.point]; preview = null; refresh(); return; }
    if ((spec.id === 'text' || spec.id === 'balloon') && (spec.points === 1 || draft.points.length + 1 >= spec.points)) { const value = askText(spec.label); if (!value) { draft = null; refresh(); return; } draft.text = value; }
    draft.points.push(hit.point); preview = null;
    if (spec.points > 0 && draft.points.length >= spec.points) finishDraft(); else refresh();
  };
  const onPointerMove = event => {
    if (!drag && !draft) return;
    const hit = locate(event);
    if (drag && hit) { const current = drawings.find(item => item.id === drag.id); if (!current) return; const dayDelta = hit.point.day - drag.start.day; const ratio = drag.start.price ? hit.point.price / drag.start.price : 1; const delta = hit.point.price - drag.start.price; current.points = drag.points.map(point => { const price = hit.scale.log ? point.price * ratio : point.price + delta; return {day: point.day + dayDelta, price: price > 0 ? price : point.price}; }); refresh(); return; }
    if (!draft) return;
    if (!hit) { preview = null; refresh(); return; }
    if (toolById(draft.tool)?.points === -1 && event.buttons) { const last = draft.points.at(-1), pixel = projectPoint(last, hit.scale); if (Math.hypot(pixel.x - hit.x, pixel.y - hit.y) >= 3) draft.points.push(hit.point); }
    else preview = hit.point;
    refresh();
  };
  const onPointerUp = () => { if (drag) { drag = null; persist(); return; } if (draft && toolById(draft.tool)?.points === -1) { if (draft.points.length > 1) finishDraft(); else { draft = null; refresh(); } } };
  document.addEventListener('atlas:workbench-state', onState, {signal});
  document.addEventListener('atlas:chart-command', onCommand, {signal});
  document.addEventListener('keydown', onKey, {signal, capture: true});
  document.addEventListener('pointerdown', onPointerDown, {signal, capture: true});
  document.addEventListener('pointermove', onPointerMove, {signal});
  document.addEventListener('pointerup', onPointerUp, {signal});
  document.addEventListener('dblclick', event => { if (draft && toolById(draft.tool)?.points === -2 && event.target?.closest?.('#lab-chart')) { event.preventDefault(); event.stopPropagation(); finishDraft(); } }, {signal, capture: true});
  return {destroy() { listeners.abort(); menu.remove(); bar.remove(); }};
}
