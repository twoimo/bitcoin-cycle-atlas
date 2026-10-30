import { createPriceScale } from './chart-math.js?v=1.29.0';
import { clearChartHover, coalescedChartHover } from './chart-hover.js?v=1.29.0';
import { chartPaneLayout } from './chart-overlays.js?v=1.29.0';
import { createPriceAxisLayout, createPriceAxisFormatter } from './price-axis.js?v=1.29.0';
import { pixelExtrema } from './chart-window.js?v=1.29.0';
import { utcDay } from './cycle-engine.js?v=1.29.0';

const SVG_NS = 'http://www.w3.org/2000/svg';
const renderers = new WeakMap();
const positive = value => Number.isFinite(value) && value > 0;
const nonnegative = value => Number.isFinite(value) && value >= 0;
const fromDay = value => new Date(value * 86400000).toISOString().slice(0, 10);
const priceFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const money = value => nonnegative(value) ? '$' + priceFormat.format(value) : '—';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function calendarDate(value) {
  if (typeof value !== 'string') return null;
  const date = value.slice(0, 10);
  try { utcDay(date); return date; } catch { return null; }
}

function priceRows(values = [], allowZero = false) {
  const byDate = new Map();
  for (const value of values) {
    const row = Array.isArray(value) ? { date: value[0], price: value[1] } : value;
    const date = calendarDate(row?.date);
    const price = row?.price ?? row?.close;
    if (date && (allowZero ? nonnegative(price) : positive(price))) byDate.set(date, { ...row, date, price });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function genuineCandles(values = []) {
  const byDate = new Map();
  for (const row of values) {
    const date = calendarDate(row?.endDate ?? row?.date);
    const startDate = calendarDate(row?.startDate ?? row?.date) ?? date;
    if (!date || !startDate || startDate > date || !['open', 'high', 'low', 'close'].every(key => positive(row[key]))) continue;
    if (row.low > Math.min(row.open, row.close) || row.high < Math.max(row.open, row.close) || row.low > row.high) continue;
    byDate.set(date, { ...row, date, startDate, endDate: date, time: utcDay(startDate) * 86400 });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function node(svg, tag, attributes = {}, text = null) {
  const document = svg.ownerDocument ?? globalThis.document;
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== null) element.textContent = text;
  return element;
}

function continuousRuns(rows, usable = () => true) {
  const runs = []; let run = [];
  for (const row of rows) {
    if (!usable(row)) { if (run.length) runs.push(run); run = []; continue; }
    if (run.length && utcDay(row.date) !== utcDay(run.at(-1).date) + 1) { runs.push(run); run = []; }
    run.push(row);
  }
  if (run.length) runs.push(run);
  return runs;
}

function viewportDomain(rows, candles, forecast, start, end, scale) {
  let low = Infinity, high = -Infinity;
  const include = value => { if (nonnegative(value)) { low = Math.min(low, value); high = Math.max(high, value); } };
  for (const row of rows) if (row.date >= start && row.date <= end) include(row.price);
  for (const row of candles) if (row.endDate >= start && row.endDate <= end) { include(row.low); include(row.high); }
  for (const row of forecast) if (row.date >= start && row.date <= end) { include(row.price); include(row.lower); include(row.upper); }
  // Never inherit the live chart's scale for an empty replay viewport.
  if (!nonnegative(low) || !nonnegative(high)) return { min: 1, max: 10 };
  if (low === 0) return { min: 0, max: high > 0 ? high * 1.12 : 1 };
  const axis = createPriceScale([low, high], { scale });
  return { min: axis.min, max: axis.max };
}

function detachNativeHandlers(svg) {
  clearChartHover(svg);
  svg.onpointermove = svg.onpointerleave = svg.onclick = svg.onkeydown = svg.onkeyup = svg.onblur = null;
  svg.querySelector('[id$="-cross"]')?.setAttribute('display', 'none');
}

function sourceLabel(value) {
  return typeof value === 'string' ? value : value?.name ?? value?.label ?? value?.provider ?? '관측 자료';
}

/** An asset-neutral base painter. It never imports live workspaces, cycle
 * analysis or a model renderer; callers supply already revealed observations. */
function drawObservedViewport({svg,rows,candles,start,end,frequency,scale,domain,width,height,symbol,source}) {
  const layout = chartPaneLayout({width,height,volume:false,drawdown:false,states:false,top:18});
  const axisText = createPriceAxisLayout({svg,width,left:layout.left,minRight:layout.right});
  const left=layout.left,right=width-axisText.right,top=layout.top,bottom=layout.priceBottom;
  const first=utcDay(start),span=Math.max(1,utcDay(end)-first);
  const x=value=>left+(utcDay(typeof value==='string'?value:value.date)-first)/span*(right-left);
  const axis={...createPriceScale([domain.min,domain.max],{scale,domain,top,bottom,
    tickCount:Math.max(2,Math.min(7,Math.floor((bottom-top)/45)))}),left,right,mode:'auto'};
  const labels=createPriceAxisFormatter({axis,display:{unit:'usd'},layout:axisText});
  const visible=rows.filter(row=>row.date>=start&&row.date<=end);
  const visibleCandles=candles.filter(row=>row.endDate>=start&&row.endDate<=end);
  const covered=new Set();
  for(const row of visibleCandles)for(let day=utcDay(row.startDate);day<=utcDay(row.endDate);day++)covered.add(fromDay(day));
  const lineRows=visible.filter(row=>!covered.has(row.date));
  const clipId=`${svg.id||'atlas'}-replay-observed-clip`;
  let markup=`<title>${escape(symbol)} · 봉 리플레이</title><desc>현재 공개된 실제 관측 가격과 축입니다. 빈 날짜는 채우지 않습니다.</desc><defs><clipPath id="${clipId}"><rect x="${left}" y="${top}" width="${Math.max(0,right-left)}" height="${Math.max(0,bottom-top)}"/></clipPath></defs>`;
  for(const tick of axis.ticks){
    const y=axis.y(tick),label=labels.tick(tick);
    markup+=`<line class="replay-price-grid" x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="var(--border,#26323e)"/><text x="${right+axisText.inset}" y="${y+4}" ${axisText.attributes(label)} fill="var(--muted)" font-size="${axisText.fontSize}">${escape(label)}</text>`;
  }
  const tickCount=Math.max(2,Math.min(8,Math.floor(Math.max(1,right-left)/90)+1));
  const dates=new Set(Array.from({length:tickCount},(_,index)=>fromDay(Math.round(first+(utcDay(end)-first)*index/(tickCount-1)))));
  let dateIndex=0;
  for(const date of dates){
    const at=x(date),label=span>1095?date.slice(0,7):span>365?date.slice(2,7):date.slice(5);
    markup+=`<line class="replay-time-grid" x1="${at}" x2="${at}" y1="${top}" y2="${bottom}" stroke="var(--border,#26323e)"/><text class="replay-time-label" x="${at}" y="${layout.axisY}" text-anchor="${dateIndex===0?'start':dateIndex===dates.size-1?'end':'middle'}" fill="var(--muted)" font-size="11">${label}</text>`;dateIndex++;
  }
  markup+=`<g class="replay-observed-series" clip-path="url(#${clipId})">`;
  const runs=continuousRuns(lineRows).map(run=>pixelExtrema(run,x));
  const path=runs.map(run=>run.map((row,index)=>`${index?'L':'M'}${x(row).toFixed(2)},${axis.y(row.price).toFixed(2)}`).join(' ')).join(' ');
  markup+=`<path class="observed-close-line" d="${path}" fill="none" stroke="var(--text)" stroke-width="1.8"/>`;
  for(const run of runs)if(run.length===1)markup+=`<circle class="observed-close-point" cx="${x(run[0]).toFixed(2)}" cy="${axis.y(run[0].price).toFixed(2)}" r="1.8" fill="var(--text)"/>`;
  const candleWidth=Math.max(.7,Math.min(12,(right-left)*(frequency==='weekly'?7:1)/span*.68));
  const dense=visibleCandles.length>256&&candleWidth<2;
  if(dense){
    const wicks=['',''],bodies=['',''];
    for(const row of visibleCandles){
      const at=x(row.endDate),side=row.close>=row.open?0:1,bodyTop=Math.min(axis.y(row.open),axis.y(row.close)),bodyHeight=Math.max(1,Math.abs(axis.y(row.open)-axis.y(row.close)));
      wicks[side]+=`M${at.toFixed(2)},${axis.y(row.high).toFixed(2)}V${axis.y(row.low).toFixed(2)}`;
      bodies[side]+=`M${(at-candleWidth/2).toFixed(2)},${bodyTop.toFixed(2)}h${candleWidth.toFixed(2)}v${bodyHeight.toFixed(2)}h${(-candleWidth).toFixed(2)}Z`;
    }
    markup+=`<g class="observed-candles-batched" data-count="${visibleCandles.length}"><title>${escape(source)} ${escape(symbol)} · ${visibleCandles.length}개 실제 완료 봉 · 모든 OHLC 보존</title>`;
    for(let side=0;side<2;side++){
      const color=side?'var(--red)':'var(--green)';
      if(wicks[side])markup+=`<path d="${wicks[side]}" fill="none" stroke="${color}"/>`;
      if(bodies[side])markup+=`<path d="${bodies[side]}" fill="${color}"/>`;
    }
    markup+='</g>';
  }else for(const row of visibleCandles){
    const at=x(row.endDate),color=row.close>=row.open?'var(--green)':'var(--red)',bodyTop=Math.min(axis.y(row.open),axis.y(row.close)),bodyHeight=Math.max(1,Math.abs(axis.y(row.open)-axis.y(row.close)));
    const title=`${source} ${symbol} · ${row.startDate}${row.startDate===row.endDate?'':'–'+row.endDate} UTC · O ${money(row.open)} H ${money(row.high)} L ${money(row.low)} C ${money(row.close)}`;
    markup+=`<g class="observed-candle" data-date="${row.endDate}" data-open="${row.open}" data-high="${row.high}" data-low="${row.low}" data-close="${row.close}"><line x1="${at}" x2="${at}" y1="${axis.y(row.high)}" y2="${axis.y(row.low)}" stroke="${color}"/><rect x="${at-candleWidth/2}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}" fill="${color}"/><title>${escape(title)}</title></g>`;
  }
  markup+='</g>';
  if(!visible.length&&!visibleCandles.length)markup+=`<text class="chart-empty-message" x="${(left+right)/2}" y="${(top+bottom)/2}" text-anchor="middle" fill="var(--muted)" font-size="12">이 구간에는 공개된 관측 가격이 없습니다.</text>`;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.innerHTML=markup;
  Object.assign(svg.dataset,{plotLeft:String(left),plotRight:String(right),plotTop:String(top),plotBottom:String(bottom),priceBottom:String(bottom),timeAxisTop:String(bottom+8),
    observedLineCount:String(lineRows.length),observedCandleCount:String(visibleCandles.length),visiblePointCount:String(visible.length),scale,unit:'usd',interval:frequency,
    candleRendering:visibleCandles.length?(dense?'batched':'individual'):'none',forecastEvidenceCount:'0',cycleIntervalCount:'0',cycleIntervalLabelCount:'0',cycleMarkerCount:'0',cycleMarkerLabelCount:'0',historyLabelCount:'0',historyEventCount:'0',historyLabelMode:'off',historyHiddenLabelCount:'0'});
  delete svg.dataset.cycleIntervalBandTop;delete svg.dataset.cycleIntervalBandBottom;
  svg.parentElement?.style.setProperty('--plot-bottom-gap',`${height-bottom+6}px`);svg.parentElement?.style.setProperty('--plot-right-gap',`${axisText.right+7}px`);
  return axis;
}

/** View only: receives the already gated replay frame, never a session archive. */
function render({ svg, rows, candles, forecast, start, end, chartType, frequency, scale, originDate = null,
  cursorDate = null, selecting = false, symbol = '', source = '관측 자료', hidden = false, onInspect }) {
  if (!svg) throw new TypeError('A main chart SVG is required');
  const firstDay = utcDay(start), lastDay = utcDay(end);
  if (lastDay < firstDay) throw new RangeError('Replay viewport ends before it starts');
  renderers.get(svg)?.destroy();
  detachNativeHandlers(svg);
  const width = Math.max(1, Math.round(svg.clientWidth || svg.parentElement?.clientWidth || 1100));
  const height = Math.max(1, Math.round(svg.clientHeight || svg.parentElement?.clientHeight || 500));
  const visibleForecast = forecast.filter(row => row.date >= start && row.date <= end);
  const displayedCandles = chartType === 'candles' ? candles : [];
  let axis;
  if (hidden) {
    const layout = chartPaneLayout({ width, height, volume: false, drawdown: false, states: false, top: 18 });
    const axisText = createPriceAxisLayout({ svg, width, left: layout.left, minRight: layout.right });
    axis = { left: layout.left, right: width - axisText.right, top: layout.top, bottom: layout.priceBottom, scale: 'none', min: null, max: null, mode: 'auto' };
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren(node(svg, 'title', {}, '입력 자료 수집 이전'),
      node(svg, 'desc', {}, '이 시각에 확보하지 않은 가격과 예측을 표시하지 않습니다.'),
      node(svg, 'text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 13 }, '아직 확보하지 않은 입력 자료입니다'));
    Object.assign(svg.dataset, { plotLeft: String(axis.left), plotRight: String(axis.right), plotTop: String(axis.top), plotBottom: String(axis.bottom), priceBottom: String(axis.bottom), observedCandleCount: '0', observedLineCount: '0', visiblePointCount: '0' });
  } else {
    const domain = viewportDomain(rows, displayedCandles, visibleForecast, start, end, scale);
    axis = drawObservedViewport({svg,rows,candles:displayedCandles,start,end,frequency,scale,domain,width,height,symbol,source});
    if (visibleForecast.length) svg.querySelector('.chart-empty-message')?.remove();
    const title = svg.querySelector('title'), description = svg.querySelector('desc');
    if (title) title.textContent = `${symbol ? symbol + ' · ' : ''}${selecting ? '봉 리플레이 시작점 선택' : '고정 예측과 공개된 실제 가격'}`;
    if (description) description.textContent = selecting
      ? '현재 차트의 봉을 선택해 리플레이를 시작합니다. 실제 OHLC가 없는 구간은 관측 종가선으로 표시합니다.'
      : '실선과 캔들은 현재 재생시점까지 공개된 실제 가격입니다. 금색 점선은 기준일에 고정한 예측이며, 음영은 조건부 범위입니다. 미래 실제값은 표시하지 않습니다.';
  }
  const span = Math.max(1, lastDay - firstDay);
  const x = date => axis.left + (utcDay(typeof date === 'string' ? date : date.date) - firstDay) / span * (axis.right - axis.left);
  const dateAt = clientX => {
    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !Number.isFinite(clientX)) return null;
    const localX = (clientX - rect.left) / rect.width * width;
    const fraction = Math.max(0, Math.min(1, (localX - axis.left) / Math.max(1, axis.right - axis.left)));
    return fromDay(Math.round(firstDay + fraction * (lastDay - firstDay)));
  };
  const clipId = `${svg.id || 'atlas'}-replay-clip`;
  const definitions = node(svg, 'defs'), clip = node(svg, 'clipPath', { id: clipId });
  clip.append(node(svg, 'rect', { x: axis.left, y: axis.top, width: Math.max(0, axis.right - axis.left), height: Math.max(0, axis.bottom - axis.top) }));
  definitions.append(clip); svg.append(definitions);
  const overlay = node(svg, 'g', { 'data-chart-replay-overlay': 'true', 'data-replay-overlay': 'true', 'clip-path': `url(#${clipId})`, 'pointer-events': 'none' });
  if (!hidden) {
    const path = (values, key = 'price') => values.map((row, index) => `${index ? 'L' : 'M'}${x(row.date).toFixed(2)},${axis.y(row[key]).toFixed(2)}`).join(' ');
    const bands = continuousRuns(visibleForecast, row => nonnegative(row.lower) && nonnegative(row.upper) && row.lower <= row.upper);
    for (const run of bands) if (run.length > 1) {
      const reduced = pixelExtrema(run, x, ['lower', 'upper']);
      const lower = [...reduced].reverse().map(row => `L${x(row.date).toFixed(2)},${axis.y(row.lower).toFixed(2)}`).join(' ');
      overlay.append(node(svg, 'path', { d: path(reduced, 'upper') + ' ' + lower + ' Z', class: 'replay-band', fill: 'var(--replay-forecast,var(--accent))', opacity: .12 }));
    }
    const paths = continuousRuns(visibleForecast).map(run => path(pixelExtrema(run, x))).join(' ');
    if (paths) overlay.append(node(svg, 'path', { d: paths, class: 'replay-forecast-path', 'data-replay-forecast-path': 'true', fill: 'none', stroke: 'var(--replay-forecast,var(--accent))', 'stroke-width': 1.8, 'stroke-dasharray': '5 4' }));
  }
  const boundary = (date, className, attribute, label, color) => {
    if (!date || date < start || date > end) return;
    const line = node(svg, 'line', { x1: x(date), x2: x(date), y1: axis.top, y2: axis.bottom, class: className, [attribute]: 'true', stroke: color, 'stroke-width': 1, 'stroke-dasharray': '3 5' });
    line.append(node(svg, 'title', {}, label + ' ' + date)); overlay.append(line);
  };
  boundary(originDate, 'replay-origin-line', 'data-replay-origin-boundary', '고정 예측 기준일', 'var(--muted)');
  boundary(cursorDate, 'replay-cursor-line', 'data-replay-cursor-line', '실제 가격 공개일', 'var(--text)');
  const cursorLine = node(svg, 'line', { y1: axis.top, y2: axis.bottom, display: 'none', class: selecting ? 'replay-selection-line' : 'replay-inspection-line', 'data-replay-inspection-line': 'true', stroke: 'var(--focus,var(--text))', 'stroke-width': 1, 'stroke-dasharray': '4 4' });
  overlay.append(cursorLine); svg.append(overlay);
  const actualByDate = new Map(rows.map(row => [row.date, row])), predictionByDate = new Map(forecast.map(row => [row.date, row]));
  const candlesByDate = new Map(displayedCandles.map(row => [row.endDate, row]));
  let selected = cursorDate ?? rows.at(-1)?.date ?? start, destroyed = false;
  function detail(date) {
    const observation = actualByDate.get(date), predicted = predictionByDate.get(date), candle = candlesByDate.get(date);
    return { date, actual: observation?.price ?? null, predicted: predicted?.price ?? null,
      lower: predicted?.lower ?? null, upper: predicted?.upper ?? null, candle: candle ?? null,
      originDate, cursorDate, symbol, source, kind: observation ? 'observed' : predicted ? 'forecast' : 'unavailable' };
  }
  function inspect(date, preview = false) {
    if (destroyed || !calendarDate(date)) return null;
    if (!preview) selected = date;
    const value = detail(date); onInspect(value); return value;
  }
  function previewPointer(event) {
    if (destroyed || hidden || event.pointerType === 'touch') return false;
    const rect = svg.getBoundingClientRect();
    const localX = (event.clientX - rect.left) / rect.width * width;
    const localY = Number.isFinite(event.clientY) ? (event.clientY - rect.top) / rect.height * height : axis.top;
    if (localX < axis.left || localX > axis.right || localY < axis.top || localY > axis.bottom) { cursorLine.setAttribute('display', 'none'); return false; }
    const date = dateAt(event.clientX);
    if (!date) return false;
    cursorLine.setAttribute('x1', x(date)); cursorLine.setAttribute('x2', x(date)); cursorLine.removeAttribute('display');
    inspect(date, true); return true;
  }
  const hover = coalescedChartHover(svg, previewPointer);
  const leave = () => { hover.cancel(); cursorLine.setAttribute('display', 'none'); inspect(selected); };
  const click = event => { hover.cancel(); svg.focus?.({ preventScroll: true }); if (!selecting && !hidden) { const date = dateAt(event.clientX); if (date) inspect(date); } };
  svg.onpointermove = hover; svg.onpointerleave = leave; svg.onclick = click;
  Object.assign(svg.dataset, { replayMode: selecting ? 'selecting' : 'active', replaySelecting: String(selecting), replayPriceHidden: String(hidden), replayOrigin: originDate ?? '', replayCursor: cursorDate ?? '',
    replayObservedCount: String(rows.length), replayActualCount: String(rows.filter(row => originDate && row.date > originDate).length), replayActualThrough: rows.at(-1)?.date ?? '', replayForecastPoints: String(forecast.length), replayScale: hidden ? 'none' : scale,
    replayOhlcAvailable: String(candles.length > 0), replayForecastCandleCount: '0' });
  const controller = { x, dateAt, axis, getPriceScale: () => axis, getDate: () => selected,
    selectDate: date => inspect(calendarDate(date)), previewPointer,
    clearPreview() { if (destroyed) return false; leave(); return true; },
    getSelection() { const value = detail(selected); return { ...value, label: selected, copyText: `${symbol} ${selected}\n실제: ${money(value.actual)}\n고정 예측: ${money(value.predicted)}` }; },
    destroy() {
      if (destroyed) return; destroyed = true; hover.cancel();
      if (renderers.get(svg) !== controller) return;
      clearChartHover(svg);
      if (svg.onpointermove === hover) svg.onpointermove = null;
      if (svg.onpointerleave === leave) svg.onpointerleave = null;
      if (svg.onclick === click) svg.onclick = null;
      renderers.delete(svg);
    } };
  renderers.set(svg, controller);
  inspect(selected);
  return controller;
}

/** Paint the existing main SVG, with no second chart or access to unrevealed OHLC. */
export function drawChartReplay({ svg, data, session, start, end, chartType = 'candles', selecting = false, onInspect = () => {} }) {
  if (!data?.frame) throw new TypeError('A gated replay chart frame is required');
  const frame = data.frame, cursorDate = calendarDate(frame.cursorDate);
  if (!cursorDate) throw new RangeError('A replay cursor date is required');
  const originDate = calendarDate(data.originDate ?? session?.asOf ?? frame.forecast?.[0]?.date);
  const rows = priceRows(data.observedRows ?? [...(frame.inputPrices ?? []), ...(frame.actual ?? [])]).filter(row => row.date <= cursorDate);
  const candles = genuineCandles(data.observedCandles).filter(row => row.endDate <= cursorDate);
  const forecast = frame.forecastVisible === false ? [] : priceRows(frame.forecast, true).filter(row => !originDate || row.date >= originDate);
  const scale = data.scale === 'linear' || forecast.some(row => row.price === 0 || row.lower === 0 || row.upper === 0) ? 'linear' : 'log';
  return render({ svg, rows, candles, forecast, start, end, chartType, selecting,
    originDate, cursorDate, frequency: data.frequency ?? 'daily', scale,
    symbol: data.symbol ?? session?.identity?.symbol ?? '', source: sourceLabel(data.candleSource ?? data.source ?? session?.source),
    hidden: frame.inputVisible === false && !rows.length && !forecast.length, onInspect });
}

/** Full observed history is shown only while the user is choosing a new origin. */
export function drawReplaySelection({ svg, observations = [], start, end, chartType = 'candles', frequency = 'daily', scale = 'log', symbol = '', source = '관측 자료', onInspect = () => {} }) {
  const rows = priceRows(observations);
  // Daily observations are never converted into invented OHLC. Selection in a
  // weekly viewport stays a close line unless completed weekly OHLC is supplied.
  const candles = frequency === 'daily' ? genuineCandles(observations) : [];
  return render({ svg, rows, candles, forecast: [], start, end, chartType, frequency, scale,
    selecting: true, symbol, source: sourceLabel(source), onInspect });
}
