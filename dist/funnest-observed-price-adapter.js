import { mountAtlasFunnestChart } from './funnest-chart-runtime.bundle.js?v=1.36.5';
import { advanceMeasurement, measurePriceAnchors, resolveMagnetPoint } from './chart-magnet.js';
import { refreshChartLegendGeometry } from './ui/chart-legend.js?v=1.36.4';

let futureCrosshairSequence = 0;

/** Convert trusted Atlas archive candles (UTC seconds) into Funnest's UTC-ms Bar contract. */
export function atlasCandlesToFunnestBars(series) {
  if (!Array.isArray(series?.candles) || !series.candles.length) throw new TypeError('Atlas chart requires observed candles');
  let previous = -Infinity;
  return series.candles.map((row) => {
    if (!Number.isSafeInteger(row.time) || row.time <= previous) throw new TypeError('Atlas candles must be strictly chronological');
    previous = row.time;
    const bar = { time: row.time * 1000, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume };
    if (![bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) || !Number.isSafeInteger(bar.time) || bar.time <= 0 || bar.low <= 0 || bar.volume < 0 || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) throw new TypeError('Invalid observed OHLCV candle');
    return bar;
  });
}

/** Mount the real Funnest renderer in the Atlas plot; callers own request/lifecycle policy. */
export function mountObservedPriceChart(plot, { series, symbol, currency = 'USD', timezone = 'UTC', precision = 2, tickSize = 0.01, chartType = 'candles', scale = 'normal', range, accessibleName, overlaySvg = null, source = {}, onCrosshair, isCrosshairReady = () => true, onViewport, onError, volume = false, invertScale = false, tool = 'crosshair', magnet = 'off', measurement = null, onMeasure, onInspect, insetTop = 0, eventObstacles = () => [] }) {
  if (!plot || typeof plot.append !== 'function') throw new TypeError('Funnest host must be a plot container');
  const bars = atlasCandlesToFunnestBars(series);
  const rangeMs = range ? { from: range.start * 1000, to: range.end * 1000 } : undefined;
  let mounted, lastSelection = null, interactionHandle = null, interactionSequence = 0, lastInteractionRender = null, measurePointer = null;
  let sourceRows = [...series.candles], paneCoords = null, pointer = null;
  let futureCrosshairGroup = null, nativeCrosshairCleared = false, clearingNativeCrosshair = false, lastInspectionKey = null, lastFutureCrosshairKey = null, routeFutureCrosshair = null, clearFutureCrosshair = null;
  const interactionState = { tool, chartType, magnet, measurement, onMeasure, onInspect };
  const visibleRange = () => mounted?.chart?.getVisibleTimeRange?.() ?? null;
  const handleCrosshair = detail => {
    if (!isCrosshairReady()) return;
    if (detail?.source !== 'sync' && routeFutureCrosshair?.(detail)) return;
    if (detail?.bar && Number.isFinite(detail.time)) lastSelection = { bar: { ...detail.bar }, time: detail.time }; else lastSelection = null;
    if (detail?.pane === 'main' && Number.isFinite(detail.x) && Number.isFinite(detail.y)) pointer = { x: detail.x, y: detail.y, ctrlKey: pointer?.ctrlKey || false, metaKey: pointer?.metaKey || false, buttons: Number(pointer?.buttons) || 0, source: detail.source };
    if (detail?.bar && Number.isFinite(detail.time)) { lastInspectionKey = null; interactionState.onInspect?.({ ...detail, bar: { ...detail.bar }, source: detail.source || 'funnest' }); }
    onCrosshair?.(detail);
    interactionHandle?.redraw?.();
  };
  const reportViewport = () => { const visible = visibleRange(); if (visible) { mounted.syncAtlasViewport?.(); onViewport(visible); } };
  mounted = mountAtlasFunnestChart(plot, { bars, symbol, currency, timezone, locale: 'ko', precision, tickSize, chartType, scale: scale === 'log' ? 'log' : 'normal', invertScale: Boolean(invertScale), range: rangeMs, source, accessibleName, onCrosshair: handleCrosshair, onViewport: reportViewport, onError, volume });
  if (!mounted || mounted.engine !== 'funnest' || typeof mounted.destroy !== 'function' || typeof mounted.setData !== 'function' || typeof mounted.setRange !== 'function' || typeof mounted.chart?.getVisibleTimeRange !== 'function' || !mounted.host?.style) {
    mounted?.destroy?.();
    throw new TypeError('Funnest runtime returned an incomplete chart handle');
  }
  // Native Funnest magnet snaps drawing tools only. Atlas measurement uses the
  // same observed rows plus resolveMagnetPoint in logical PaneCoords instead.
  mounted.chart.setMagnet?.(false);
  // HUDs (readout, forecast notice) are obstacles above the plot, not reasons to
  // shrink the host: the host keeps the full allocated plot origin and the top
  // inset is reserved natively inside the price pane with chart.setTopInset so
  // auto-scaled candles lay out below the HUD while axes keep their full size.
  if (typeof mounted.chart.setTopInset !== 'function') { mounted.destroy(); throw new TypeError('Pinned Funnest runtime lacks chart.setTopInset for HUD insets'); }
  // The runtime raises its top native canvas to z-index 3 inside the host; with
  // the host now spanning the HUD band, give the host its own stacking context so
  // Atlas HUDs (z-index 2 siblings) keep painting and hit-testing above the canvas.
  mounted.host.style.zIndex = '0';
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const nativeTopInset = () => { const value = Number(mounted.chart.mainScale?.insetTop); return Number.isFinite(value) && value > 0 ? value : 0; };
  mounted.setAtlasInsets = ({ top = 0, right = 0, bottom = 0, left = 0 } = {}) => {
    const next = { top, right, bottom, left };
    for (const [side, value] of Object.entries(next)) if (!Number.isFinite(value) || value < 0) throw new RangeError(`Funnest ${side} inset must be a finite nonnegative number`);
    if (Object.keys(next).every(side => next[side] === insets[side])) return false;
    mounted.host.style.inset = `0px ${right}px ${bottom}px ${left}px`;
    mounted.chart.setTopInset(top);
    insets = next;
    return true;
  };
  mounted.setAtlasInsets({ top: insetTop });
  mounted.getAtlasInsets = () => ({ ...insets, nativeTop: nativeTopInset(), hostInset: mounted.host.style.inset });
  mounted.setVolumeVisible = visible => {
    const next = Boolean(visible);
    if (typeof mounted.chart.setVolumeVisible === 'function') mounted.chart.setVolumeVisible(next);
    else if (typeof mounted.chart.setSettings === 'function') mounted.chart.setSettings({ volume: next });
    else throw new TypeError('Pinned Funnest volume setting is unavailable');
    return next;
  };
  mounted.pointIsInPlot = point => {
    const x = Number(point?.clientX), y = Number(point?.clientY), rect = mounted.host.getBoundingClientRect(), layout = mounted.chart.layout;
    const main = layout?.panes?.find(pane => pane.kind === 'main' || pane.id === 'main');
    const width = Number(layout?.width), height = Number(layout?.height), plotWidth = Number(layout?.plotWidth), paneTop = Number(main?.top), paneHeight = Number(main?.height);
    if (![x, y, rect.left, rect.top, rect.width, rect.height, width, height, plotWidth, paneTop, paneHeight].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0 || plotWidth <= 0 || paneHeight <= 0) return false;
    const scaleX = rect.width / width, scaleY = rect.height / height, reserved = Math.min(nativeTopInset(), paneHeight / 2);
    const left = rect.left, right = left + plotWidth * scaleX, top = rect.top + (paneTop + reserved) * scaleY, bottom = rect.top + (paneTop + paneHeight) * scaleY;
    return x >= left && x <= right && y >= top && y <= bottom;
  };
  let overlayData = { forecast: null, events: [], showEvents: false, priceDomain: null };
  let overlayRenderSequence = 0, lastBandRender = null, lastLineRender = null;
  const paintToken = (name, fallback) => {
    try { return typeof getComputedStyle === 'function' ? getComputedStyle(plot).getPropertyValue(name).trim() || fallback : fallback; }
    catch { return fallback; }
  };
  const freezeSegments = segments => Object.freeze(segments.map(segment => Object.freeze({
    from: Object.freeze({ ...segment.from }), to: Object.freeze({ ...segment.to }),
    color: segment.color, width: segment.width, dash: Array.isArray(segment.dash) ? Object.freeze([...segment.dash]) : segment.dash,
  })));
  const freezePoints = points => Object.freeze(points.map(([x, y]) => Object.freeze({ x, y })));
  const freezeRect = rect => Object.freeze({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
  const freezeObstacles = obstacles => Object.freeze(obstacles.map(item => Object.freeze({ index: item.index, viewportRect: freezeRect(item.viewportRect), canvasRect: freezeRect(item.canvasRect) })));
  const freezeEventLabels = labels => Object.freeze(labels.map(item => Object.freeze({ date: item.date, title: item.title, text: item.text, canvasRect: freezeRect(item.canvasRect), viewportRect: freezeRect(item.viewportRect) })));
  const freezeExcludedLabels = labels => Object.freeze(labels.map(item => Object.freeze({ date: item.date, title: item.title, text: item.text, canvasRect: freezeRect(item.canvasRect), viewportRect: freezeRect(item.viewportRect), reason: item.reason || 'obstacle', ...(Number.isFinite(item.previousLabelRight) ? { previousLabelRight: item.previousLabelRight } : {}), ...(Number.isFinite(item.requiredGapPx) ? { requiredGapPx: item.requiredGapPx } : {}), obstacleIndexes: Object.freeze([...(item.obstacleIndexes || [])]) })));
  const freezeEventLines = lines => Object.freeze(lines.map(item => Object.freeze({ date: item.date, x: item.x, y1: item.y1, y2: item.y2, color: item.color, dash: Object.freeze([...item.dash]) }))); 
  const readOverlayRender = () => {
    const band = lastBandRender, lines = lastLineRender;
    const forecastCoordinates = freezeSegments(lines?.forecastSegments || []), baselineCoordinates = freezeSegments(lines?.baselineSegments || []);
    const bandRender = Object.freeze({
      layer: 'below', rendered: Boolean(band), sequence: band?.sequence || 0,
      inputPresent: Boolean(band?.inputPresent), pathRows: band?.pathRows || 0,
      painted: Boolean(band?.painted), fillCalls: band?.fillCalls || 0,
      color: band?.color || null, coordinates: freezePoints(band?.coordinates || []),
      polygons: Object.freeze((band?.polygons || []).map(freezePoints)),
    });
    const lineRender = Object.freeze({
      layer: 'above', rendered: Boolean(lines), sequence: lines?.sequence || 0,
      forecastInput: Object.freeze({ present: Boolean(lines?.forecastInputPresent), pathRows: lines?.forecastPathRows || 0 }),
      forecastSegments: Object.freeze({ count: forecastCoordinates.length, coordinates: forecastCoordinates }),
      baselineInput: Object.freeze({ present: Boolean(lines?.baselineInputPresent), pathRows: lines?.baselinePathRows || 0 }),
      baselineSegments: Object.freeze({ count: baselineCoordinates.length, coordinates: baselineCoordinates }),
    });
    return Object.freeze({
      engine: 'funnest',
      coordinatesSource: 'painter.line arguments',
      rendered: Boolean(band || lines),
      sequence: Math.max(band?.sequence || 0, lines?.sequence || 0),
      forecastInputGate: lines ? lines.forecastInputPresent ? 'present' : 'absent' : 'not-rendered',
      forecastInput: lineRender.forecastInput,
      forecastSegments: lineRender.forecastSegments,
      baselineInput: lineRender.baselineInput,
      baselineSegments: lineRender.baselineSegments,
      eventInputCount: lines?.eventInputCount || 0,
      eventLines: freezeEventLines(lines?.eventLines || []),
      eventLabels: freezeEventLabels(lines?.eventLabels || []),
      excludedEventLabels: freezeExcludedLabels(lines?.excludedEventLabels || []),
      suppressedEventLabelCount: lines?.suppressedEventLabelCount || 0,
      eventObstacles: freezeObstacles(lines?.eventObstacles || []),
      forecastNotices: Object.freeze((lines?.forecastNotices || []).map(notice => Object.freeze({ ...notice, lines: Object.freeze(notice.lines.map(line => Object.freeze({ ...line }))) }))),
      bandRender,
      lineRender,
    });
  };
  const pointTime = row => Date.parse(`${String(row.date).slice(0, 10)}T00:00:00Z`);
  // A forecast value of 0 is an absorbed residual value, not a missing row. Only a log axis has no place for it.
  const logAxis = () => mounted.chart.settings?.priceScale === 'log';
  const valid = (row, key, log) => Number.isFinite(row[key]) && (row[key] > 0 || (row[key] === 0 && !log));
  const lowPriceEdge = coords => coords.priceToY(2) > coords.priceToY(1) ? 0 : coords.height;
  const crossesZero = (before, row, keys) => keys.some(key => (before[key] === 0) !== (row[key] === 0));
  const bandOverlay = {
    layer: 'below',
    render({ coords, painter }) {
      const rows = overlayData.forecast && Array.isArray(overlayData.forecast.path) ? overlayData.forecast.path : [];
      const log = logAxis(), edge = lowPriceEdge(coords), edgeY = value => value === 0 && log ? edge : coords.priceToY(value);
      const runs = [[]];
      for (const row of rows) {
        if (!valid(row, 'low', false) || !valid(row, 'high', false)) continue;
        const before = runs.at(-1).at(-1);
        if (before && log && crossesZero(before, row, ['low', 'high'])) runs.push([]);
        runs.at(-1).push(row);
      }
      const polygons = runs.filter(run => run.length > 1)
        .map(run => [...run.map(row => [coords.timeToX(pointTime(row)), edgeY(row.high)]), ...[...run].reverse().map(row => [coords.timeToX(pointTime(row)), edgeY(row.low)])])
        .filter(points => points.every(point => point.every(Number.isFinite)));
      let painted = false, fillCalls = 0, color = null;
      if (polygons.length) {
        const ctx = painter.ctx; ctx.save(); ctx.fillStyle = 'rgba(199,155,75,.13)'; color = String(ctx.fillStyle);
        for (const [[startX, startY], ...points] of polygons) {
          ctx.beginPath(); ctx.moveTo(startX, startY); for (const [x, y] of points) ctx.lineTo(x, y);
          ctx.closePath(); ctx.fill(); fillCalls++; painted = true;
        }
        ctx.restore();
      }
      lastBandRender = { sequence: ++overlayRenderSequence, inputPresent: rows.length > 0, pathRows: rows.length, painted, fillCalls, color, coordinates: polygons.flat(), polygons };
    },
  };
  const lineOverlay = {
    layer: 'above',
    render({ coords, painter }) {
      const forecastSegments = [], baselineSegments = [], forecastNotices = [], log = logAxis();
      const path = (rows, key, color, width, dash, diagnostics) => {
        let previous = null;
        for (const row of rows) {
          const time = pointTime(row);
          if (!Number.isFinite(time) || !valid(row, key, log)) { previous = null; continue; }
          const x = coords.timeToX(time), y = coords.priceToY(row[key]);
          if (previous && Number.isFinite(x) && Number.isFinite(y)) {
            painter.line(previous.x, previous.y, x, y, color, width, dash);
            diagnostics.push({ from: { x: previous.x, y: previous.y }, to: { x, y }, color, width, dash: Array.isArray(dash) ? [...dash] : dash });
          }
          previous = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
        }
      };
      const forecast = overlayData.forecast;
      const rows = forecast && Array.isArray(forecast.path) ? forecast.path : [];
      const readEventObstacles = () => {
        const supplied = eventObstacles?.();
        const source = supplied == null ? [] : Array.isArray(supplied) ? supplied : typeof supplied[Symbol.iterator] === 'function' ? [...supplied] : [supplied];
        if (!source.length) return [];
        const hostRect = mounted.host.getBoundingClientRect(), layout = mounted.chart.layout;
        const width = Number(layout?.width), height = Number(layout?.height), scaleX = width / Number(hostRect.width), scaleY = height / Number(hostRect.height);
        const main = layout?.panes?.find(pane => pane.kind === 'main' || pane.id === 'main'), paneTop = Number(main?.top ?? 0);
        if (![hostRect.left, hostRect.top, hostRect.width, hostRect.height, width, height, scaleX, scaleY, paneTop].every(Number.isFinite) || hostRect.width <= 0 || hostRect.height <= 0 || width <= 0 || height <= 0) return [];
        const viewportRect = rect => { const left=Number(rect?.left),top=Number(rect?.top),right=Number(rect?.right),bottom=Number(rect?.bottom); if (![left,top,right,bottom].every(Number.isFinite) || right <= left || bottom <= top) return null; return {left,top,right,bottom,width:right-left,height:bottom-top}; };
        const map = rect => { const left=(rect.left-hostRect.left)*scaleX,right=(rect.right-hostRect.left)*scaleX,top=(rect.top-hostRect.top)*scaleY-paneTop,bottom=(rect.bottom-hostRect.top)*scaleY-paneTop; return {left,top,right,bottom,width:right-left,height:bottom-top}; };
        return source.map((rect,index)=>{const viewport=viewportRect(rect);return viewport?{index,viewportRect:viewport,canvasRect:map(viewport)}:null;}).filter(Boolean);
      };
      const intersects = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const labelGeometry = (text, x, y, width) => {
        const ctx=painter.ctx, metrics=ctx.measureText(text), fontMatch=String(ctx.font||'').match(/(?:^|\s)(\d+(?:\.\d+)?)px(?:\s|$)/), fontSize=fontMatch?Number(fontMatch[1]):0;
        const ascent=Math.max(fontSize/2,Number(metrics.actualBoundingBoxAscent)||0,Number(metrics.fontBoundingBoxAscent)||0), descent=Math.max(fontSize/2,Number(metrics.actualBoundingBoxDescent)||0,Number(metrics.fontBoundingBoxDescent)||0);
        if (!(width >= 0) || !(ascent > 0) || !(descent > 0)) throw new TypeError('Pinned canvas painter must expose measurable event-label font bounds');
        const canvasRect={left:x,top:y-ascent,right:x+width,bottom:y+descent,width,height:ascent+descent};
        const hostRect=mounted.host.getBoundingClientRect(),layout=mounted.chart.layout,scaleX=Number(hostRect.width)/Number(layout?.width),scaleY=Number(hostRect.height)/Number(layout?.height),main=layout?.panes?.find(pane=>pane.kind==='main'||pane.id==='main'),paneTop=Number(main?.top??0);
        const viewportRect={left:hostRect.left+canvasRect.left*scaleX,top:hostRect.top+(canvasRect.top+paneTop)*scaleY,right:hostRect.left+canvasRect.right*scaleX,bottom:hostRect.top+(canvasRect.bottom+paneTop)*scaleY,width:canvasRect.width*scaleX,height:canvasRect.height*scaleY};
        return {canvasRect,viewportRect};
      };
      const baselineRows = rows.filter(row => valid(row, 'baselinePrice', log));
      const palette = {
        forecast: paintToken('--data-gold', '#d8b56d'),
        baseline: paintToken('--accent', '#2962ff'),
        label: paintToken('--workbench-frame-ink', '#ededed'),
        event: paintToken('--workbench-frame-muted', '#b0b0b5'),
        frame: paintToken('--workbench-frame', '#19191b'),
      };
      if (rows.length) {
        path(rows, 'price', palette.forecast, 1.8, [7, 5], forecastSegments);
        if (baselineRows.length) path(rows, 'baselinePrice', palette.baseline, 1.7, [2, 4], baselineSegments);
        const edge = lowPriceEdge(coords);
        for (const item of forecast.milestones || []) {
          const time = pointTime(item); if (!Number.isFinite(time)) continue;
          const row = rows.reduce((best, candidate) => Math.abs(pointTime(candidate) - time) < Math.abs(pointTime(best) - time) ? candidate : best, rows[0]);
          const x = coords.timeToX(time), y = valid(row, 'price', log) ? coords.priceToY(row.price) : row.price === 0 ? edge + (edge ? -20 : 20) : NaN;
          if (Number.isFinite(x) && Number.isFinite(y)) { painter.vLine(x, 0, coords.height, item.turnType === 'high' ? '#bc9bd7' : item.turnType === 'low' ? '#7bbfae' : palette.forecast, [2, 5]); painter.circle(x, y, 4, palette.frame, palette.forecast, 1.5); }
        }
        const inView = x => Number.isFinite(x) && x >= 0 && x <= coords.plotWidth;
        const visibleRows = rows.filter(row => inView(coords.timeToX(pointTime(row))));
        const zeroPrice = visibleRows.find(row => row.price === 0), zero = zeroPrice || visibleRows.find(row => row.low === 0);
        if (zero) {
          const date = String(zero.date).slice(0, 10), text = `${zeroPrice ? '가정 가격 0' : '범위 하한 0'} · 잔여가치 소진${log ? ' · 로그축 외' : ''}`;
          const x = Math.max(6, Math.min(coords.plotWidth - painter.measure(text) - 6, coords.timeToX(pointTime(zero))));
          forecastNotices.push({ kind: 'equity-zero-residual', zeroPrice: Boolean(zeroPrice), date, title: `${date} · ${zeroPrice ? '선택한 조건' : '하단 조건'}의 보통주 잔여가치가 0입니다. 양수 가격으로 대체하지 않습니다.`, lines: [{ text, x, y: coords.height - 10 }] });
        }
        const logGap = log && rows.some((row, index) => {
          const before = rows[index - 1];
          if (!before || !crossesZero(before, row, ['price', 'low', 'high'])) return false;
          const from = coords.timeToX(pointTime(before)), to = coords.timeToX(pointTime(row));
          return Number.isFinite(from) && Number.isFinite(to) && to >= 0 && from <= coords.plotWidth;
        });
        if (logGap) forecastNotices.push({ kind: 'equity-log-gap', title: '양수와 0 사이의 구간은 로그축에서 보간하지 않습니다. 해당 가격선 또는 가정 범위를 생략합니다. 선형축에서 확인해 주세요.', lines: ['0 경계 구간 · 로그 연결 생략', '선형축에서 확인해 주세요.'].map((text, index) => ({ text, x: 6, y: coords.height - 38 + index * 14 })) });
        for (const notice of forecastNotices) for (const line of notice.lines) painter.text(line.text, line.x, line.y, palette.label, 'left', 'middle');
      }
      let eventLines=[],eventLabels=[],excludedEventLabels=[],obstacles=[];
      if (overlayData.showEvents) {
        const markers = overlayData.events.map(item => ({ item, time: pointTime(item) })).filter(marker => Number.isFinite(marker.time)).map(marker => ({ ...marker, x: coords.timeToX(marker.time) })).filter(marker => Number.isFinite(marker.x) && marker.x >= 0 && marker.x <= coords.plotWidth).sort((a, b) => a.x - b.x);
        let lastMarkerX = -Infinity;
        const acceptedLabelRects = [];
        obstacles=readEventObstacles();
        // Event titles sit just below the natively reserved HUD band, never under it.
        const labelY = Math.min(nativeTopInset(), Number(coords.height) / 2 || 0) + 12;
        for (const { item, x } of markers) {
          if (x - lastMarkerX >= 24) { painter.vLine(x, 0, coords.height, palette.event, [2, 5]); eventLines.push({date:String(item.date||''),x,y1:0,y2:coords.height,color:palette.event,dash:[2,5]}); lastMarkerX = x; }
          if (item.title) {
            const fullText = String(item.title), maxWidth = Math.min(132, Math.max(24, coords.plotWidth - 8)); let text = fullText;
            if (painter.measure(text) > maxWidth) { let short = ''; for (const char of fullText) { if (painter.measure(short + char + '…') > maxWidth) break; short += char; } text = short ? short + '…' : '…'; }
            const width = Math.min(maxWidth, painter.measure(text)), labelX = Math.max(3, Math.min(coords.plotWidth - width - 3, x + 4));
            const geometry=labelGeometry(text,labelX,labelY,width),overlaps=obstacles.filter(obstacle=>intersects(geometry.canvasRect,obstacle.canvasRect));
            const prior=acceptedLabelRects.find(rect=>intersects(geometry.canvasRect,rect)||Math.min(Math.abs(geometry.canvasRect.left-rect.right),Math.abs(rect.left-geometry.canvasRect.right))<32);
            if(overlaps.length)excludedEventLabels.push({date:String(item.date||''),title:fullText,text,canvasRect:geometry.canvasRect,viewportRect:geometry.viewportRect,reason:'obstacle',obstacleIndexes:overlaps.map(item=>item.index)});
            else if(prior)excludedEventLabels.push({date:String(item.date||''),title:fullText,text,canvasRect:geometry.canvasRect,viewportRect:geometry.viewportRect,reason:'label-gap',previousLabelRight:prior.right,requiredGapPx:32,obstacleIndexes:[]});
            else{painter.text(text,labelX,labelY,palette.label,'left','middle');eventLabels.push({date:String(item.date||''),title:fullText,text,canvasRect:geometry.canvasRect,viewportRect:geometry.viewportRect});acceptedLabelRects.push(geometry.canvasRect);}
          }
        }
      }
      lastLineRender = {
        sequence: ++overlayRenderSequence,
        forecastInputPresent: rows.length > 0,
        forecastPathRows: rows.length,
        forecastSegments,
        baselineInputPresent: baselineRows.length > 0,
        baselinePathRows: baselineRows.length,
        baselineSegments,
        eventInputCount: overlayData.events.length,
        eventLines,
        eventLabels,
        excludedEventLabels,
        suppressedEventLabelCount: excludedEventLabels.length,
        eventObstacles: obstacles,
        forecastNotices,
      };
    },
  };
  const rowsByDate = () => {
    const rows = new Map();
    for (const row of sourceRows) if (row?.date) rows.set(String(row.date), { ...row, kind: 'observed', price: row.close });
    for (const row of overlayData.forecast?.path || []) if (row?.date) rows.set(String(row.date), { ...row, kind: 'simulated' });
    return rows;
  };
  const nearestAnchor = (coords, x, y, modifiers = {}) => {
    const nativePoint = coords?.pointAt?.(x, y);
    if (!nativePoint || !Number.isFinite(nativePoint.time) || typeof coords.timeToIndex !== 'function') return null;
    const bars = mounted.getBars();
    if (!bars.length) return null;
    let row = null, time = nativePoint.time, kind = 'observed';
    const index = Math.round(coords.timeToIndex(time));
    if (index >= 0 && index < bars.length && time <= bars.at(-1).time) {
      const bar = bars[index], sourceRow = sourceRows[index];
      const px = coords.timeToX(bar.time), left = index > 0 ? coords.timeToX(bars[index - 1].time) : NaN, right = index + 1 < bars.length ? coords.timeToX(bars[index + 1].time) : NaN;
      const spacing = Math.min(...[Math.abs(px - left), Math.abs(right - px)].filter(Number.isFinite));
      if (Number.isFinite(px) && (!Number.isFinite(spacing) || Math.abs(px - x) <= Math.max(2, spacing / 2 + 1))) {
        row = interactionState.chartType === 'line' ? { price: bar.close } : bar;
        time = bar.time;
        row = { ...row, date: sourceRow?.date || new Date(bar.time).toISOString(), time: bar.time, kind: 'observed' };
      }
    } else {
      const forecastRows = (overlayData.forecast?.path || []).filter(item => Number.isFinite(pointTime(item)) && valid(item, 'price', false));
      if (forecastRows.length) {
        const timed = forecastRows.map(item => ({ item, time: pointTime(item), x: coords.timeToX(pointTime(item)) })).filter(item => Number.isFinite(item.x));
        const first = timed[0], last = timed.at(-1);
        if (first && last && time >= first.time && time <= last.time) {
          const nearest = timed.reduce((best, item) => Math.abs(item.time - time) < Math.abs(best.time - time) ? item : best, timed[0]);
          row = { ...nearest.item, time: nearest.time, kind: 'simulated' };
          time = nearest.time; kind = 'simulated';
        }
      }
    }
    if (!row) return null;
    const resolved = resolveMagnetPoint({ row, pointerY: y, y: coords.priceToY, invertY: coords.yToPrice, mode: interactionState.magnet, ctrlKey: modifiers.ctrlKey, metaKey: modifiers.metaKey, thresholdPx: 12 });
    if (!resolved) return null;
    return { ...resolved, date: row.date || new Date(time).toISOString(), time, kind: row.kind || kind, ...(row.kind === 'simulated' ? { forecastDate: row.date, forecastPrice: row.price } : {}) };
  };
  const measureResult = (measurement, preview) => {
    if (!measurement) return null;
    const records = rowsByDate();
    const lookup = date => records.get(String(date)) || null;
    return measurePriceAnchors(measurement, { lookup, preview });
  };
  const pointXY = (coords, time, price) => ({ x: coords.timeToX(time), y: coords.priceToY(price) });
  const futureCrosshairNodes = (() => {
    if (!overlaySvg?.ownerDocument?.createElementNS || !overlaySvg.isConnected) return null;
    const namespace = 'http://www.w3.org/2000/svg', group = overlaySvg.ownerDocument.createElementNS(namespace, 'g');
    group.setAttribute('id', `atlas-future-${++futureCrosshairSequence}-cross`); group.setAttribute('aria-hidden', 'true'); group.setAttribute('pointer-events', 'none'); group.setAttribute('display', 'none');
    const make = (tag, attributes) => { const node = overlaySvg.ownerDocument.createElementNS(namespace, tag); for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value); group.append(node); return node; };
    const lineStyle = { stroke: paintToken('--workbench-frame-muted', '#a8a8ac'), 'stroke-width': '1', 'stroke-dasharray': '3 4', 'vector-effect': 'non-scaling-stroke' };
    const vertical = make('line', { ...lineStyle }), horizontal = make('line', { ...lineStyle });
    const dot = make('circle', { r: '4', fill: 'none', stroke: paintToken('--data-gold', '#d8b56d'), 'stroke-width': '1.5', 'vector-effect': 'non-scaling-stroke' });
    const label = make('text', { fill: paintToken('--data-gold', '#d8b56d'), 'font-size': '12', 'font-family': 'inherit', 'dominant-baseline': 'middle' });
    overlaySvg.append(group);
    return { group, vertical, horizontal, dot, label };
  })();
  futureCrosshairGroup = futureCrosshairNodes?.group || null;
  const hideFutureCursor = () => { if (futureCrosshairNodes) futureCrosshairNodes.group.setAttribute('display', 'none'); };
  clearFutureCrosshair = hideFutureCursor;
  const svgPoint = (x, y) => {
    const rect = overlaySvg?.getBoundingClientRect?.(), hostRect = mounted.host.getBoundingClientRect(), layout = mounted.chart.layout;
    const width = Number(layout?.width), height = Number(layout?.height);
    if (![x, y, rect?.left, rect?.top, rect?.width, rect?.height, hostRect.left, hostRect.top, hostRect.width, hostRect.height, width, height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || hostRect.width <= 0 || hostRect.height <= 0 || width <= 0 || height <= 0) return null;
    const clientX = hostRect.left + x * hostRect.width / width, clientY = hostRect.top + y * hostRect.height / height;
    try {
      const matrix = overlaySvg.getScreenCTM?.(), point = overlaySvg.createSVGPoint?.();
      if (matrix?.inverse && point?.matrixTransform) { point.x = clientX; point.y = clientY; const mapped = point.matrixTransform(matrix.inverse()); if (Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) return { x: mapped.x, y: mapped.y }; }
    } catch {}
    const raw = overlaySvg.getAttribute?.('viewBox') || '', values = raw.trim().split(/[\s,]+/).map(Number), view = overlaySvg.viewBox?.baseVal;
    const box = view && [view.x, view.y, view.width, view.height].every(Number.isFinite) && view.width > 0 && view.height > 0 ? view : values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0 ? { x: values[0], y: values[1], width: values[2], height: values[3] } : null;
    return box ? { x: box.x + (clientX - rect.left) * box.width / rect.width, y: box.y + (clientY - rect.top) * box.height / rect.height } : null;
  };
  const drawFutureCursor = (point, anchor, coords) => {
    if (!futureCrosshairNodes || !overlaySvg.isConnected) return hideFutureCursor();
    const layout = mounted.chart.layout, main = layout?.panes?.find(pane => pane.kind === 'main' || pane.id === 'main'), mainTop = Number(main?.top ?? 0);
    const position = pointXY(coords, anchor.time, anchor.price), dot = svgPoint(position.x, mainTop + position.y), top = svgPoint(position.x, mainTop), bottom = svgPoint(position.x, mainTop + coords.height), left = svgPoint(0, mainTop + position.y), right = svgPoint(coords.plotWidth, mainTop + position.y);
    if (![dot, top, bottom, left, right].every(Boolean)) return hideFutureCursor();
    const { vertical, horizontal, label } = futureCrosshairNodes;
    vertical.setAttribute('x1', String(top.x)); vertical.setAttribute('x2', String(bottom.x)); vertical.setAttribute('y1', String(top.y)); vertical.setAttribute('y2', String(bottom.y));
    horizontal.setAttribute('x1', String(left.x)); horizontal.setAttribute('x2', String(right.x)); horizontal.setAttribute('y1', String(dot.y)); horizontal.setAttribute('y2', String(dot.y));
    futureCrosshairNodes.dot.setAttribute('cx', String(dot.x)); futureCrosshairNodes.dot.setAttribute('cy', String(dot.y));
    label.setAttribute('x', String(dot.x + 8)); label.setAttribute('y', String(Math.max(top.y + 10, dot.y - 8))); label.textContent = `${String(anchor.date || '').slice(0, 10)} · 전망 ${Number(anchor.price).toFixed(precision)}`;
    futureCrosshairNodes.group.setAttribute('display', 'inline');
  };
  const emitFutureCrosshair = (point, anchor) => {
    const row = (overlayData.forecast?.path || []).find(item => pointTime(item) === anchor.time && valid(item, 'price', false));
    if (!row) return emitBlankFuture();
    const modelTime = pointTime(row), modelPrice = row.price, modelAnchor = { ...row, time: modelTime, kind: 'simulated', field: 'model', forecast: true, cursor: { price: anchor.price, field: anchor.field || 'free' } };
    const position = pointXY(paneCoords, modelTime, modelPrice);
    if (![position.x, position.y].every(Number.isFinite)) return emitBlankFuture();
    lastSelection = null;
    drawFutureCursor(point, modelAnchor, paneCoords);
    const inspectionKey = `forecast|${modelTime}|${modelPrice}|${anchor.price}`;
    if (inspectionKey !== lastInspectionKey) {
      const modelDate = String(row.date).slice(0, 10), modelPriceText = Number(modelPrice).toFixed(precision), cursorPriceText = Number(anchor.price).toFixed(precision);
      const fields = [{ label: '조건부 경로 날짜', value: modelDate }, { label: `조건부 경로 가격 (${currency})`, value: modelPriceText }, { label: `커서 가격 (${currency}, 미측정)`, value: cursorPriceText }];
      interactionState.onInspect?.({ label: `${symbol} · 조건부 예측`, kind: 'simulated', source: 'atlas-forecast-inspection', date: modelDate, time: modelTime, price: modelPrice, cursorPrice: anchor.price, forecast: { ...row, time: modelTime, kind: 'simulated' }, measurementAnchor: { ...anchor }, anchor: modelAnchor, fields, note: '예측 가격은 실제 조건부 경로 행입니다. 커서 가격은 별도이며 두 점 측정에는 수동 앵커만 사용합니다.', copyText: fields.map(field => `${field.label}: ${field.value}`).join('\n') });
      lastInspectionKey = inspectionKey;
    }
    const key = `${modelTime}|${modelPrice}|${anchor.price}|${point.x}|${point.y}`;
    if (key !== lastFutureCrosshairKey) onCrosshair?.({ time: modelTime, value: modelPrice, pane: 'main', x: position.x, y: position.y, source: point.source === 'touch' ? 'touch' : 'mouse', kind: 'simulated', price: modelPrice, cursorPrice: anchor.price, anchor: modelAnchor });
    lastFutureCrosshairKey = key;
    interactionHandle?.redraw?.();
  };
  const emitBlankFuture = () => {
    lastSelection = null; lastInspectionKey = null; hideFutureCursor();
    if (lastFutureCrosshairKey !== 'blank') onCrosshair?.(null);
    lastFutureCrosshairKey = 'blank'; interactionHandle?.redraw?.();
  };
  const clearNativeCrosshair = point => {
    if (nativeCrosshairCleared || clearingNativeCrosshair) { if (point) pointer = point; return; }
    const EventCtor = mounted.host.ownerDocument?.defaultView?.Event;
    if (typeof EventCtor !== 'function') return;
    clearingNativeCrosshair = true;
    try {
      const surfaces = [...(mounted.host.querySelectorAll?.('canvas') || [])];
      for (const target of surfaces.length ? surfaces : [mounted.host]) {
        const event = new EventCtor('pointerleave');
        try { Object.defineProperty(event, 'pointerType', { value: 'mouse' }); } catch { event.pointerType = 'mouse'; }
        target.dispatchEvent(event);
      }
    } finally { clearingNativeCrosshair = false; nativeCrosshairCleared = true; if (point) pointer = point; }
  };
  const routeFuturePoint = point => {
    if (!futureCrosshairNodes || !overlaySvg.isConnected || !point || !paneCoords) return false;
    const projected = paneCoords.pointAt(point.x, point.y), observedLast = mounted.getBars().at(-1)?.time;
    if (!Number.isFinite(projected?.time) || !Number.isFinite(observedLast) || projected.time <= observedLast) {
      if (nativeCrosshairCleared) { nativeCrosshairCleared = false; lastFutureCrosshairKey = null; lastInspectionKey = null; hideFutureCursor(); }
      return false;
    }
    clearNativeCrosshair(point);
    const anchor = nearestAnchor(paneCoords, point.x, point.y, point);
    if (anchor?.kind === 'simulated') emitFutureCrosshair(point, anchor); else emitBlankFuture();
    return true;
  };
  routeFutureCrosshair = detail => {
    if (!detail || !pointer || (interactionState.tool === 'pan' && Number(pointer.buttons) > 0)) return false;
    if (detail.bar) nativeCrosshairCleared = false;
    return routeFuturePoint(pointer);
  };
  const interactionOverlay = {
    layer: 'above',
    render({ coords, painter }) {
      paneCoords = coords;
      const segments = [], marks = [], labels = [];
      const cursor = pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y) ? nearestAnchor(coords, pointer.x, pointer.y, pointer) : null;
      if (cursor?.snapped) {
        const at = pointXY(coords, cursor.time, cursor.price);
        if (Number.isFinite(at.x) && Number.isFinite(at.y)) {
          painter.circle(at.x, at.y, 6, 'rgba(20,24,30,.35)', '#e8c46d', 2);
          painter.text(`${cursor.field} · ${cursor.mode}`, at.x + 9, Math.max(12, at.y - 8), '#e8c46d', 'left', 'middle');
          marks.push({ x: at.x, y: at.y, time: cursor.time, price: cursor.price, field: cursor.field, mode: cursor.mode, kind: cursor.kind });
          labels.push({ text: `${cursor.field} · ${cursor.mode}`, x: at.x + 9, y: Math.max(12, at.y - 8) });
        }
      }
      const current = interactionState.measurement;
      let paintedMeasurement = null;
      if (current) {
        const preview = !current.endDate && interactionState.tool === 'measure' ? cursor : null;
        const result = measureResult(current, preview);
        if (result) {
          const startTime = Number.isFinite(current.startTime) ? current.startTime : Date.parse(result.startDate);
          const endTime = Number.isFinite(current.endTime) ? current.endTime : result.endDate ? Date.parse(result.endDate) : preview?.time;
          const a = pointXY(coords, startTime, result.startPrice), hasEnd = Number.isFinite(endTime) && Number.isFinite(result.endPrice ?? preview?.price);
          const b = hasEnd ? pointXY(coords, endTime, result.endPrice ?? preview.price) : a;
          if ([a.x, a.y, b.x, b.y].every(Number.isFinite)) {
            painter.circle(a.x, a.y, 4, '#17191d', '#8ac8b9', 2);
            paintedMeasurement = { pending: !current.endDate, start: { time: startTime, date: result.startDate, price: result.startPrice, field: result.startField, kind: current.startKind || 'observed', ...a }, end: null, label: null };
            if (hasEnd) {
              painter.line(a.x, a.y, b.x, b.y, '#8ac8b9', 1.6, [5, 4]);
              painter.circle(b.x, b.y, 4, '#17191d', '#8ac8b9', 2);
              const label = `Δ ${Number(result.changePrice).toFixed(2)} (${Number(result.changePct).toFixed(2)}%) · ${result.deltaDays == null ? '—' : `${Number(result.deltaDays).toFixed(1)}일`}${result.includesSimulated ? ' · 가정 포함' : ''}`;
              painter.text(label, (a.x + b.x) / 2 + 7, Math.min(a.y, b.y) - 8, '#8ac8b9', 'left', 'middle');
              segments.push({ from: { ...a }, to: { ...b }, priceDelta: result.changePrice, percentDelta: result.changePct, deltaSeconds: result.deltaSeconds, kind: result.kind }); labels.push({ text: label, x: (a.x + b.x) / 2 + 7, y: Math.min(a.y, b.y) - 8 });
              paintedMeasurement.end = { time: endTime, date: result.endDate, price: result.endPrice ?? preview.price, field: result.endField, kind: current.endKind || preview?.kind || 'observed', ...b }; paintedMeasurement.label = label;
            } else marks.push({ ...a, time: startTime, price: result.startPrice, field: result.startField, kind: current.startKind || 'observed', role: 'measurement-start' });
          }
        }
      }
      lastInteractionRender = Object.freeze({ engine: 'funnest', coordinatesSource: 'Funnest ChartOverlay PaneCoords + Painter calls', sequence: ++interactionSequence, painted: Boolean(marks.length || segments.length), snapMarks: Object.freeze(marks.map(item => Object.freeze({ ...item }))), measurementSegments: Object.freeze(segments.map(item => Object.freeze({ ...item, from: Object.freeze({ ...item.from }), to: Object.freeze({ ...item.to }) }))), labels: Object.freeze(labels.map(item => Object.freeze({ ...item }))), measurement: paintedMeasurement && Object.freeze({ ...paintedMeasurement, start: Object.freeze(paintedMeasurement.start), end: paintedMeasurement.end && Object.freeze(paintedMeasurement.end) }) });
    },
  };
  const bandHandle = mounted.addOverlay(bandOverlay);
  const lineHandle = mounted.addOverlay(lineOverlay);
  interactionHandle = mounted.addOverlay(interactionOverlay);
  mounted.inspectAtlasOverlayRender = readOverlayRender;
  mounted.inspectAtlasInteractionRender = () => lastInteractionRender ? structuredClone(lastInteractionRender) : null;
  plot.inspectAtlasOverlayRender = readOverlayRender;
  plot.inspectAtlasInteractionRender = mounted.inspectAtlasInteractionRender;
  mounted.setAtlasInteraction = ({ tool: nextTool = interactionState.tool, chartType: nextType = interactionState.chartType, magnet: nextMagnet = interactionState.magnet, measurement: nextMeasurement = interactionState.measurement, onMeasure: nextOnMeasure = interactionState.onMeasure, onInspect: nextOnInspect = interactionState.onInspect } = {}) => {
    if (!['crosshair', 'pan', 'measure'].includes(nextTool)) throw new RangeError('Unsupported Atlas chart tool');
    if (!['off', 'weak', 'strong'].includes(nextMagnet)) throw new RangeError('Unsupported Atlas magnet mode');
    const visualChanged = interactionState.tool !== nextTool || interactionState.chartType !== nextType || interactionState.magnet !== nextMagnet || interactionState.measurement !== nextMeasurement;
    interactionState.tool = nextTool; interactionState.chartType = nextType; interactionState.magnet = nextMagnet; interactionState.measurement = nextMeasurement;
    interactionState.onMeasure = nextOnMeasure; interactionState.onInspect = nextOnInspect; mounted.atlasMagnet = nextMagnet;
    if (visualChanged) interactionHandle?.redraw?.();
    return { tool: nextTool, magnet: nextMagnet, measurement: nextMeasurement };
  };
  mounted.setAtlasRows = rows => {
    if (!Array.isArray(rows) || rows.length !== mounted.getBars().length) throw new TypeError('Atlas source rows must match the native observed bars');
    const bars = mounted.getBars();
    for (let index = 0; index < rows.length; index++) if (!Number.isSafeInteger(rows[index]?.time) || rows[index].time * 1000 !== bars[index].time) throw new TypeError('Atlas source rows must preserve native observed time identity');
    sourceRows = [...rows];
    interactionHandle?.redraw?.();
    return sourceRows.length;
  };
  mounted.setAtlasInteraction({ tool, chartType, magnet, measurement, onMeasure, onInspect });
  const destroyMounted = mounted.destroy.bind(mounted);
  const interactionCleanups = [];
  const listenInteraction = (type, handler) => { mounted.host.addEventListener(type, handler, true); interactionCleanups.push(() => mounted.host.removeEventListener(type, handler, true)); };
  const eventPoint = event => {
    const rect = mounted.host.getBoundingClientRect(), layout = mounted.chart.layout, main = layout?.panes?.find(pane => pane.kind === 'main' || pane.id === 'main'), width = Number(layout?.width), height = Number(layout?.height), mainTop = Number(main?.top ?? 0);
    if (![event.clientX, event.clientY, rect.left, rect.top, rect.width, rect.height, width, height, mainTop].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) return null;
    const x = (event.clientX - rect.left) * width / rect.width, y = (event.clientY - rect.top) * height / rect.height - mainTop;
    if (x < 0 || x > Number(paneCoords?.plotWidth) || y < Math.min(nativeTopInset(), Number(paneCoords?.height) / 2) || y > Number(paneCoords?.height)) return null;
    return { x, y, ctrlKey: Boolean(event.ctrlKey), metaKey: Boolean(event.metaKey), buttons: Number(event.buttons) || 0, source: event.pointerType || 'mouse' };
  };
  const inspectAt = (point, anchor) => {
    if (!point || !anchor) return;
    const key = `${anchor.kind}|${anchor.time}|${anchor.price}|${anchor.field}|${anchor.mode}`;
    if (key === lastInspectionKey) return;
    lastInspectionKey = key;
    interactionState.onInspect?.({ time: anchor.time, x: point.x, y: point.y, pane: 'main', source: 'atlas-interaction', bar: anchor.kind === 'observed' ? mounted.getBars().find(bar => bar.time === anchor.time) || null : null, anchor: { ...anchor } });
  };
  const chooseMeasureAnchor = point => {
    if (!paneCoords || !point) return;
    const anchor = nearestAnchor(paneCoords, point.x, point.y, point);
    if (!anchor) return;
    const prior = interactionState.measurement;
    const next = advanceMeasurement(prior, anchor);
    if (!prior || prior.endDate) next.startTime = anchor.time;
    else next.endTime = anchor.time;
    interactionState.measurement = next;
    interactionState.onMeasure?.(structuredClone(next));
    inspectAt(point, anchor);
    interactionHandle?.redraw?.();
  };
  listenInteraction('pointermove', event => {
    const next = eventPoint(event); if (!next) return;
    pointer = next;
    if (measurePointer?.pointerId === event.pointerId) {
      if (Math.hypot(next.x - measurePointer.x, next.y - measurePointer.y) > 8) measurePointer.moved = true;
      measurePointer.current = next;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!routeFuturePoint(next)) { const anchor = nearestAnchor(paneCoords, next.x, next.y, next); inspectAt(next, anchor); }
      interactionHandle?.redraw?.();
      return;
    }
    if (!(interactionState.tool === 'pan' && next.buttons > 0) && routeFuturePoint(next)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (interactionState.tool === 'measure' || interactionState.magnet !== 'off') interactionHandle?.redraw?.();
  });
  listenInteraction('pointerdown', event => {
    if (!['crosshair', 'measure'].includes(interactionState.tool)) return;
    const point = eventPoint(event); if (!point) return;
    event.preventDefault(); event.stopImmediatePropagation();
    pointer = point;
    if (interactionState.tool === 'measure') measurePointer = { pointerId: event.pointerId, x: point.x, y: point.y, current: point, moved: false };
    interactionHandle?.redraw?.();
  });
  listenInteraction('pointerup', event => {
    if (!measurePointer || measurePointer.pointerId !== event.pointerId) return;
    const next = eventPoint(event) || measurePointer.current;
    const wasMoved = measurePointer.moved || Math.hypot(next.x - measurePointer.x, next.y - measurePointer.y) > 8;
    measurePointer = null; pointer = next;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!wasMoved) chooseMeasureAnchor(next);
    interactionHandle?.redraw?.();
  });
  listenInteraction('pointercancel', event => { if (measurePointer?.pointerId === event.pointerId) measurePointer = null; });
  interactionCleanups.push(mounted.chart.on('layoutChange', () => {
    const layout = mounted.chart.layout, box = plot.getBoundingClientRect(), hostBox = mounted.host.getBoundingClientRect();
    const width = plot.clientWidth || box.width, height = plot.clientHeight || box.height, left = hostBox.left - box.left - (plot.clientLeft || 0);
    if (!(layout?.width > 0 && layout.plotWidth > 0 && hostBox.width > 0 && width > 0 && height > 0)) return;
    // The readout and notes size themselves by --plot-right-gap, the measured price-axis width plus 7px, which the
    // SVG renderers set. The canvas engine reports that width in its layout, so publish it from there.
    const axisWidth = hostBox.width * (1 - layout.plotWidth / layout.width);
    plot.style.setProperty('--plot-right-gap', `${Math.round((axisWidth + 7) * 100) / 100}px`);
    refreshChartLegendGeometry(plot, { width, height, left, right: left + layout.plotWidth * hostBox.width / layout.width });
  }));
  listenInteraction('pointerleave', () => { if (clearingNativeCrosshair) return; if (!measurePointer) { pointer = null; lastInspectionKey = null; lastFutureCrosshairKey = null; nativeCrosshairCleared = false; clearFutureCrosshair?.(); interactionHandle?.redraw?.(); } });
  let overlayHandlesRemoved = false;
  mounted.destroy = () => {
    if (plot.inspectAtlasOverlayRender === readOverlayRender) delete plot.inspectAtlasOverlayRender;
    if (plot.inspectAtlasInteractionRender === mounted.inspectAtlasInteractionRender) delete plot.inspectAtlasInteractionRender;
    if (!overlayHandlesRemoved) { overlayHandlesRemoved = true; for (const cleanup of interactionCleanups) cleanup(); bandHandle?.remove?.(); lineHandle?.remove?.(); interactionHandle?.remove?.(); futureCrosshairGroup?.remove?.(); }
    return destroyMounted();
  };
  const forecastDomain = () => {
    const visible = visibleRange(), from = visible?.from ?? -Infinity, to = visible?.to ?? Infinity, log = logAxis(), values = [];
    for (const bar of mounted.getBars()) if (bar.time >= from && bar.time <= to) values.push(bar.low, bar.high);
    for (const row of overlayData.forecast?.path || []) {
      const time = pointTime(row);
      if (time >= from && time <= to) for (const key of ['low', 'high', 'price', 'baselinePrice']) if (valid(row, key, log)) values.push(row[key]);
    }
    if (!values.length) return null;
    if (!values.some(value => value > 0)) values.push(mounted.getBars().at(-1).close);
    let min = Infinity, max = -Infinity;
    for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
    if (!(max > min)) { min *= .99; max *= 1.01; }
    return { min, max };
  };
  const syncPriceDomain = () => {
    const domain = overlayData.priceDomain || forecastDomain();
    if (domain) mounted.setPriceExtrema(domain);
  };
  mounted.setAtlasOverlays = ({ forecast = null, events = [], showEvents = false, priceDomain = null } = {}) => { overlayData = { forecast, events, showEvents, priceDomain }; syncPriceDomain(); bandHandle?.redraw?.(); lineHandle?.redraw?.(); interactionHandle?.redraw?.(); };
  mounted.setAtlasRange = nextRange => { if (!nextRange) return false; mounted.atlasRange = nextRange; return mounted.setRange({ from: nextRange.start * 1000, to: nextRange.end * 1000 }); };
  mounted.getVisibleTimeRange = visibleRange;
  mounted.getCanvas = () => [...plot.querySelectorAll('.atlas-funnest-canvas canvas')].find(canvas => canvas.isConnected && canvas.width > 0 && canvas.height > 0) || null;
  mounted.getOverlaySvg = () => overlaySvg?.isConnected ? overlaySvg : null;
  mounted.getExportSurface = () => ({ canvas: mounted.getCanvas(), svg: mounted.getOverlaySvg() });
  mounted.getSelection = () => { const selection = lastSelection || (() => { const bar = mounted.getBars().at(-1); return bar ? { bar, time: bar.time } : null; })(); if (!selection) return null; const { bar, time } = selection, stamp = new Date(time).toISOString().replace('T', ' ').slice(0, 16); const fields = [['시각', stamp], ['시가', bar.open], ['고가', bar.high], ['저가', bar.low], ['종가', bar.close], ...(bar.volume === undefined ? [] : [['거래량', bar.volume]])].filter(([, value]) => value !== undefined); return { label: `${symbol} · 실제 관측 봉`, fields: fields.map(([label, value]) => ({ label, value: String(value) })), copyText: fields.map(([label, value]) => `${label}: ${value}`).join('\n') }; };
  mounted.getPriceScale = () => overlayData.priceDomain ? { ...overlayData.priceDomain } : forecastDomain();
  mounted.syncAtlasViewport = () => { syncPriceDomain(); bandHandle?.redraw?.(); lineHandle?.redraw?.(); };
  const setNativeScale = mounted.setScale;
  // Funnest switches mainScale.mode on its next frame and resets it to auto-scale, which drops the
  // forecast-aware domain. Switch the mode now, as the runtime does at mount, and set the domain again.
  mounted.setScale = nextScale => { setNativeScale(nextScale); mounted.chart.mainScale.mode = mounted.chart.settings.priceScale; mounted.syncAtlasViewport(); };
  return mounted;
}
