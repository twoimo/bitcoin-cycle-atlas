import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { calculateRsiSeries } from '@atlas/domain/market-lab';
import { CompactToolbar, CompactToolbarMenu } from './compact-toolbar.js';
import { RsiChartCanvas, axisNumber, type ChartQuote, type InstrumentMarker, type Pick } from './rsi-chart-canvas.js';
import { workspaceInstrument } from '../../../../dist/workspace-instruments.js';
import { type Pane, type RsiChartView } from '../rsi-chart-model.js';
import { applyInstrumentCommand, boundedInstrumentDates, displayInstrumentSeries, initialInstrumentView, nearestObservation,
  type ExternalInstrumentView, type InstrumentChartCache, type InstrumentSeries } from '../instrument-chart-model.js';
import { initialChartUrlView, chartUrlView, persistStandaloneChartUrl } from '../chart-url-state.js';

interface Props {
  symbol: string;
  unit: string;
  timezone: string;
  series: InstrumentSeries;
  revision?: string;
  cache?: InstrumentChartCache;
  embedded?: boolean;
  epoch?: number;
  active?: boolean;
  visible?: boolean;
  currentTab?: string;
  onShowChart?: () => void;
  onRecords?: () => void;
  recordsLabel?: string;
  initialView?: Partial<RsiChartView>;
  externalView?: ExternalInstrumentView;
  onView?: (view: RsiChartView) => void;
  data?: (date: string) => ReactNode;
  method?: ReactNode;
  details?: ReactNode;
  markers?: InstrumentMarker[];
  volumeUnit: string;
  description: string;
  chartClassName?: string;
}
const panes = ['data', 'indicators', 'settings', 'method', 'help', 'export', 'date', 'search'];
const paneNames = { data: '선택 데이터', indicators: '지표', settings: '차트 설정', method: '출처·계산 기준', help: '차트 사용법', export: '차트 내보내기', date: '날짜·기간', search: '명령 검색' };
const frequencyNames = { daily: '일봉', weekly: '주봉', monthly: '월별' };
const emptyRows: never[] = [];
const observedNumber = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 8 });

export function serializeInstrumentSvg(svg: SVGSVGElement, symbol: string, unit: string, frequency: RsiChartView['frequency']) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('style', `background:${getComputedStyle(document.body).backgroundColor}`);
  const source = [svg, ...svg.querySelectorAll('*')], target = [copy, ...copy.querySelectorAll('*')];
  for (let index = 0; index < source.length; index++) {
    const style = getComputedStyle(source[index]);
    for (const key of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight']) target[index].setAttribute(key, style.getPropertyValue(key));
  }
  const heading = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  heading.setAttribute('x', '12'); heading.setAttribute('y', '12'); heading.setAttribute('font-size', '11');
  heading.setAttribute('font-family', 'Arial,sans-serif'); heading.setAttribute('fill', getComputedStyle(document.body).color);
  heading.textContent = `${symbol} / ${unit} / ${{ daily: '1D', weekly: '1W', monthly: '1M' }[frequency]} / ${svg.dataset.start} ~ ${svg.dataset.end}`;
  copy.append(heading); copy.setAttribute('aria-label', `${symbol} 관측 가격`);
  return new XMLSerializer().serializeToString(copy);
}

/** Same plot/controller as the ETF workbench; data capabilities stay explicit. */
export function InstrumentWorkbench(props: Props) {
  const { symbol, unit, timezone, series, revision, cache, embedded = false, epoch = 0, active = true,
    visible = true, currentTab = 'chart', externalView, volumeUnit } = props;
  const [view, setView] = useState<RsiChartView>(() => initialChartUrlView(symbol, cache?.view || { ...initialInstrumentView(series), ...props.initialView, ...externalView }, { frequencies: series.frequency === 'monthly' ? ['monthly'] : ['daily', 'weekly'], candles: series.bars.length > 0, embedded }));
  const [pane, setPane] = useState<Pane>(null), [hover, setHover] = useState<Pick | null>(null), [status, setStatus] = useState('');
  const [menuPulse, setMenuPulse] = useState(0), [search, setSearch] = useState('');
  const [jump, setJump] = useState(view.selected), [from, setFrom] = useState(view.start), [to, setTo] = useState(view.end);
  const [exportText, setExportText] = useState(''), [exportUrl, setExportUrl] = useState(''), [pngUrl, setPngUrl] = useState('');
  const undo = useRef<RsiChartView[]>(cache?.undo || []), redo = useRef<RsiChartView[]>(cache?.redo || []), gesture = useRef<RsiChartView | null>(null);
  const userViewRevision = useRef(0), initialExternalView = useRef(true);
  const svg = useRef<SVGSVGElement>(null), closeButton = useRef<HTMLButtonElement>(null), focusReturn = useRef<HTMLElement | null>(null);
  const live = useRef({ props, view, pane }); live.current = { props, view, pane };
  const display = useMemo(() => displayInstrumentSeries(series, view.frequency), [series, view.frequency]);
  const selectedDate = display.timeline[nearestObservation(display.timeline, hover?.date || view.selected)] || view.selected;
  const selected = display.prices.find(point => point[0] === selectedDate), bar = display.bars.find(point => point[0] === selectedDate);
  const volume = display.volumes.find(point => point.date === selectedDate);
  const monthly = series.frequency === 'monthly', dateLabel = (stamp: string) => monthly ? stamp.slice(0, 7) : stamp;
  // The oscillator panel stays capability-owned; this adds only the common
  // quote summary from the unchanged canonical RSI calculation.
  const quoteRows = useMemo(() => monthly ? [] : calculateRsiSeries(display.prices, 14, 9), [display.prices, monthly]);
  const quoteRsi = quoteRows.find(row => row.date === selectedDate)?.rsi ?? null;
  const priorDate = display.timeline[display.timeline.indexOf(selectedDate) - 1];
  const prior = display.prices.find(point => point[0] === priorDate);
  const instrument = workspaceInstrument(symbol), interval = monthly ? '1M' : view.frequency === 'weekly' ? '1W' : '1D';
  const quote: ChartQuote = { symbol, name: monthly ? instrument?.base || symbol : instrument?.koreanName || symbol, fullName: instrument?.name || symbol,
    interval, kind: selected ? 'observed' : 'unavailable', kindLabel: monthly ? '관측 실거래가격지수' : '관측 종가', priceLabel: monthly ? '지수' : '종가',
    priceText: selected ? `${axisNumber(selected[1])}${monthly ? '' : ` ${unit}`}` : '—',
    changePct: selected && prior ? (selected[1] / prior[1] - 1) * 100 : null,
    dateTime: selectedDate, ...(monthly && selectedDate ? { timestampText: `${dateLabel(selectedDate).replace('-', '.')} ${timezone === 'Asia/Seoul' ? 'KST' : timezone}` } : {}), timezone,
    rsi: quoteRsi, rsiReason: monthly ? '월별 실거래가격지수 RSI 미제공' : quoteRsi === null ? '선택 봉까지 RSI 14 산출에 필요한 관측 부족' : `${interval} 관측 종가의 Wilder RSI 14`,
    source: instrument?.source, sourceDescription: `${instrument?.source || '출처 미제공'} · ${props.description}`,
    description: `${instrument?.name || symbol} · ${interval} · ${unit} · ${dateLabel(selectedDate)} · ${timezone} · ${props.description}`,
    detailText: bar ? `O ${bar[1]} · H ${bar[2]} · L ${bar[3]} · C ${bar[4]} ${unit}` : selected ? `관측 ${monthly ? '지수' : '종가'} ${selected[1]} ${unit}` : monthly ? '선택 월 가격 미공표' : '관측 자료 없음' };
  const frequencies: RsiChartView['frequency'][] = monthly ? ['monthly'] : ['daily', 'weekly'];
  const hasCandles = series.bars.length > 0, hasVolume = series.volumes.some(point => point.value !== null);

  function saveCache(next: RsiChartView) {
    if (cache) { cache.view = next; cache.undo = undo.current; cache.redo = redo.current; }
  }
  function persist(next: RsiChartView, record = true) {
    const dates = displayInstrumentSeries(series, next.frequency).timeline;
    const at = nearestObservation(dates, next.selected);
    if (at >= 0) next = { ...next, selected: dates[at] };
    const previous = live.current.view;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    if (record) { undo.current = [...undo.current, previous].slice(-40); redo.current = []; }
    if (!gesture.current) { userViewRevision.current++; persistStandaloneChartUrl(symbol, next, embedded); }
    live.current.view = next; saveCache(next); setView(next); setExportText(''); props.onView?.(next);
  }
  function openPane(next: Exclude<Pane, null>) {
    if (!live.current.pane) {
      try { focusReturn.current = (embedded ? window.parent.document.activeElement : document.activeElement) as HTMLElement | null; } catch { focusReturn.current = null; }
    }
    if (next === 'date') { setJump(view.selected); setFrom(view.start); setTo(view.end); }
    props.onShowChart?.(); setPane(previous => previous === next ? null : next);
  }
  function closePane() {
    setPane(null);
    const target = focusReturn.current;
    if (target?.isConnected && !target.closest('[hidden],[inert]')) target.focus(); else svg.current?.focus();
    focusReturn.current = null;
  }
  const command = useRef<(action: string, value?: unknown) => void>(() => {});
  command.current = (action, value) => {
    if (!active) return;
    setHover(null);
    if (action === 'pane' && panes.includes(String(value))) { openPane(value as Exclude<Pane, null>); return; }
    if (action === 'close-pane') { closePane(); return; }
    if (action === 'tab') { if (value === 'records') props.onRecords?.(); else if (value === 'chart') props.onShowChart?.(); return; }
    if (action === 'next-signal') return;
    props.onShowChart?.();
    if (action === 'undo' || action === 'redo') {
      const source = action === 'undo' ? undo : redo, target = action === 'undo' ? redo : undo, next = source.current.at(-1);
      if (!next) return;
      source.current = source.current.slice(0, -1); target.current = [...target.current, live.current.view].slice(-40); persist(next, false); return;
    }
    if (action === 'context-menu') { setPane(null); setMenuPulse(value => value + 1); return; }
    if (action === 'type' && !hasCandles) { setStatus('이 자료는 월별 가격지수만 제공합니다.'); return; }
    if (action === 'frequency' && !frequencies.includes(value as RsiChartView['frequency'])) { setStatus(monthly ? '이 자료는 월별 관측입니다.' : '일봉·주봉을 선택하세요.'); return; }
    if (action === 'auto-scale') {
      const min = Number(svg.current?.dataset.priceMin), max = Number(svg.current?.dataset.priceMax);
      persist({ ...view, autoScale: !view.autoScale, domain: view.autoScale && min > 0 && max > min ? { min, max } : null }); return;
    }
    if (action === 'step') {
      const at = nearestObservation(display.timeline, view.selected), next = display.timeline[Math.max(0, Math.min(display.timeline.length - 1, at + Number(value)))];
      if (next) persist(applyInstrumentCommand(view, series, 'date', next), false); return;
    }
    try { persist(applyInstrumentCommand(view, series, action, value,Number(svg.current?.dataset.plotRight)-Number(svg.current?.dataset.plotLeft)||800)); setStatus(''); }
    catch { setStatus('표시할 날짜 범위를 확인하세요.'); }
  };
  useEffect(() => { saveCache(view); }, [view, cache]);
  useEffect(() => {
    if (!externalView) return;
    const current = live.current.view;
    if (initialExternalView.current) {
      initialExternalView.current = false;
      // Keep a parent's cached selection aligned with restored URL state.
      // This is initialization, so it creates no edit, journal or URL write.
      if (Object.entries(externalView).some(([key, value]) => current[key as keyof ExternalInstrumentView] !== value)) props.onView?.(current);
      return;
    }
    if (Object.entries(externalView).some(([key, value]) => current[key as keyof ExternalInstrumentView] !== value)) persist({ ...current, ...externalView }, false);
  }, [externalView?.start, externalView?.end, externalView?.selected, externalView?.chartType]);
  useLayoutEffect(() => { if (pane && visible) closeButton.current?.focus(); }, [pane, visible]);
  useEffect(() => {
    if (!embedded) return;
    const receive = (event: MessageEvent) => {
      const message = event.data;
      if (event.source !== window.parent || event.origin !== location.origin || message?.kind !== 'atlas:center-command' || message.epoch !== epoch || message.symbol !== symbol || !active) return;
      command.current(message.action, message.value);
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [embedded, active, epoch, symbol]);
  useEffect(() => {
    if (!embedded || !active || !series.timeline.length) return;
    window.parent.postMessage({ kind: 'atlas:chart-state', epoch, symbol, ready: true, unit, timezone, revision,
      start: view.start, end: view.end, first: series.timeline[0], last: series.timeline.at(-1), selected: selectedDate, close: selected?.[1] ?? null,
      priceLast: series.prices.at(-1)?.[0], volumeLast: series.volumes.filter(point => point.value !== null).at(-1)?.date,
      tool: view.tool, magnet: view.magnet, scale: view.scale, autoScale: view.autoScale, chartType: view.chartType,
      frequency: view.frequency, frequencies, candles: hasCandles, volume: hasVolume, canUndo: undo.current.length > 0,
      canRedo: redo.current.length > 0, measurement: view.measurement.length > 0, pane: visible ? pane : null, tab: currentTab,
      records: Boolean(props.onRecords), recordsLabel: props.recordsLabel || '기록', nextSignal: false, userViewRevision: userViewRevision.current, urlView: chartUrlView(view),
    }, location.origin);
  }, [embedded, active, epoch, symbol, unit, timezone, revision, view, pane, visible, currentTab, selectedDate, selected?.[1], series, hasCandles, hasVolume, props.onRecords, props.recordsLabel]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!active) return;
      if (event.key === 'Escape' && live.current.pane) { event.preventDefault(); event.stopPropagation(); command.current('close-pane'); return; }
      if (event.target instanceof Element && event.target.closest('input,select,textarea,button,a,[contenteditable=true],[role=button]')) return;
      let action = '', value: unknown;
      const k = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && k === 'z') action = event.shiftKey ? 'redo' : 'undo';
      else if ((event.ctrlKey || event.metaKey) && k === 'k') { action = 'pane'; value = 'search'; }
      else if (event.altKey && k === 'g') { action = 'pane'; value = 'date'; }
      else if (event.altKey && k === 'm') action = 'magnet';
      else if (event.altKey && k === 'r') action = 'fit';
      else if (!event.ctrlKey && !event.metaKey && ['c', 'h', 'm'].includes(k)) { action = 'tool'; value = { c: 'crosshair', h: 'pan', m: 'measure' }[k]; }
      else if (['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) { action = event.shiftKey ? 'pan' : 'step'; value = event.key === 'ArrowLeft' ? event.shiftKey ? -.3 : -1 : event.shiftKey ? .3 : 1; }
      if (action) { event.preventDefault(); event.stopPropagation(); command.current(action, value); }
    };
    document.addEventListener('keydown', key, true); return () => document.removeEventListener('keydown', key, true);
  }, [active]);
  useEffect(() => {
    setPngUrl('');
    if (!exportText) { setExportUrl(''); return; }
    const url = URL.createObjectURL(new Blob([exportText], { type: 'image/svg+xml' }));
    setExportUrl(url); let live = true, png = ''; const image = new Image();
    image.onload = () => {
      if (!live) return;
      try {
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth * 2; canvas.height = image.naturalHeight * 2;
        const context = canvas.getContext('2d'); if (!context) throw new Error('canvas unavailable');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => { if (!live || !blob) return; png = URL.createObjectURL(blob); setPngUrl(png); }, 'image/png');
      } catch { if (live) setStatus('PNG를 생성하지 못했습니다. SVG를 저장할 수 있습니다.'); }
    };
    image.onerror = () => { if (live) setStatus('차트 이미지를 생성하지 못했습니다.'); }; image.src = url;
    return () => { live = false; image.src = ''; URL.revokeObjectURL(url); if (png) URL.revokeObjectURL(png); };
  }, [exportText]);
  function pick(point: Pick) {
    setHover(null);
    if (view.tool === 'measure') persist({ ...view, measurement: view.measurement.length === 1 ? [view.measurement[0], point] : [point] });
    else persist({ ...view, selected: point.date }, false);
  }
  function endGesture() {
    if (gesture.current && JSON.stringify(gesture.current) !== JSON.stringify(live.current.view)) {
      undo.current = [...undo.current, gesture.current].slice(-40); redo.current = []; userViewRevision.current++;
      persistStandaloneChartUrl(symbol, live.current.view, embedded); saveCache(live.current.view); setView({ ...live.current.view });
    }
    gesture.current = null;
  }
  const inputDate = (value: string) => monthly ? value ? `${value}-01` : '' : value;
  const commands: [string, string, unknown?][] = [['전체 기간', 'fit'], ['1년', 'span', 365], ['3년', 'span', 1095],
    ...(hasCandles ? [['선 / 캔들', 'type']] as [string, string][] : []),
    ...frequencies.map(frequency => [frequencyNames[frequency], 'frequency', frequency] as [string, string, string]),
    ['십자선', 'tool', 'crosshair'], ['이동', 'tool', 'pan'], ['두 점 측정', 'tool', 'measure'],
    ['지표', 'pane', 'indicators'], ['날짜 이동', 'pane', 'date'], ['차트 설정', 'pane', 'settings'],
    ['선택 데이터', 'pane', 'data'], ['출처·계산 기준', 'pane', 'method'], ['차트 내보내기', 'pane', 'export'], ['실행 취소', 'undo'], ['다시 실행', 'redo']];
  return <section className="rsi-workbench instrument-workbench" hidden={!visible} aria-label={`${symbol} 차트 작업 화면`} data-symbol={symbol} data-frequency={view.frequency}>
    <CompactToolbar label={`${symbol} 관측·차트`} order={30}>
      <CompactToolbarMenu name={`${symbol.toLowerCase()}-observation`} title={`${symbol} 선택 관측`} label={<span className="compact-toolbar-summary"><time>{dateLabel(selectedDate)}</time><b>{selected ? observedNumber(selected[1]) : '미공표'}</b><span>{unit}</span></span>}>
        <dl className="rsi-data-list"><dt>관측{monthly ? '월' : '일'}</dt><dd>{dateLabel(selectedDate)} · {timezone}</dd><dt>{monthly ? '실거래가격지수' : '종가'}</dt><dd>{selected ? axisNumber(selected[1]) : '미공표'} {unit}</dd><dt>거래량</dt><dd>{volume?.value == null ? '미공표' : axisNumber(volume.value)} {volumeUnit}</dd></dl>
        {bar && <p className="compact-toolbar-muted">O {observedNumber(bar[1])} · H {observedNumber(bar[2])} · L {observedNumber(bar[3])} · C {observedNumber(bar[4])}</p>}
        {props.data?.(selectedDate)}
      </CompactToolbarMenu>
      {!embedded && <>
        <select aria-label={`${symbol} 차트 시간 간격`} value={view.frequency} onChange={event => command.current('frequency', event.target.value)}>{frequencies.map(frequency => <option value={frequency} key={frequency}>{frequencyNames[frequency]}</option>)}</select>
        <button className="compact-toolbar-action" type="button" disabled={!hasCandles} aria-pressed={view.chartType === 'candles'} onClick={() => command.current('type')}>{hasCandles ? view.chartType === 'candles' ? '캔들' : '선' : '지수선'}</button>
        <button className="compact-toolbar-action" type="button" onClick={() => command.current('fit')}>전체</button>
        <button className="compact-toolbar-action" type="button" onClick={() => command.current('pane', 'search')}>도구</button>
        <button className="compact-toolbar-action" type="button" onClick={() => command.current('pane', 'settings')}>차트 설정</button>
        <button className="compact-toolbar-action" type="button" onClick={() => command.current('pane', 'export')}>내보내기</button>
      </>}
    </CompactToolbar>
    <div className="rsi-workbench-body">
      <RsiChartCanvas symbol={symbol} unit={unit} prices={display.prices} bars={display.bars} rows={emptyRows} series={display} view={view} quote={quote}
        active={active && visible} revision={`${revision||''}:${epoch}`} menuPulse={menuPulse} svgRef={svg} onView={next => persist(next, false)} onStart={() => { setHover(null); gesture.current = live.current.view; }} onEnd={endGesture}
        onPick={pick} onHover={setHover} hover={hover} markers={props.markers} onMarker={() => { if (pane !== 'data') openPane('data'); }} volumeUnit={volumeUnit} description={props.description} className={props.chartClassName}/>
      {pane && <aside className="rsi-workbench-panel" aria-label={`${symbol} ${paneNames[pane]}`}><header><strong>{paneNames[pane]}</strong><button ref={closeButton} type="button" aria-label={`${symbol} ${paneNames[pane]} 닫기`} onClick={closePane}>×</button></header><div className="rsi-workbench-panel-scroll">
        {pane === 'data' && <><dl className="rsi-data-list"><dt>종목</dt><dd>{symbol}</dd><dt>관측{monthly ? '월' : '일'}</dt><dd>{dateLabel(selectedDate)}</dd><dt>{monthly ? '실거래가격지수' : '종가'}</dt><dd>{selected ? axisNumber(selected[1]) : '미공표'} {unit}</dd>{bar && <><dt>시가 / 고가</dt><dd>{axisNumber(bar[1])} / {axisNumber(bar[2])}</dd><dt>저가 / 종가</dt><dd>{axisNumber(bar[3])} / {axisNumber(bar[4])}</dd></>}<dt>거래량</dt><dd>{volume?.value == null ? '미공표' : axisNumber(volume.value)} {volumeUnit}</dd></dl>{props.data?.(selectedDate)}{props.details}</>}
        {pane === 'indicators' && <><label className="rsi-panel-check"><input type="checkbox" checked={view.showVolume} disabled={!hasVolume} onChange={() => command.current('toggle', 'showVolume')}/>{monthly ? '매매 거래량·과거 평균' : '거래량'}</label>{!hasVolume && <p>거래량 자료 없음</p>}</>}
        {pane === 'settings' && <>
          <label className="rsi-panel-field">시간 간격<select value={view.frequency} onChange={event => command.current('frequency', event.target.value)}>{frequencies.map(frequency => <option key={frequency} value={frequency}>{frequencyNames[frequency]}</option>)}</select></label>
          <label className="rsi-panel-field">가격 표시<select value={view.chartType} disabled={!hasCandles} onChange={() => command.current('type')}><option value="line">{monthly ? '지수선' : '선'}</option>{hasCandles && <option value="candles">캔들</option>}</select></label>
          <label className="rsi-panel-field">가격 눈금<select value={view.scale} onChange={() => command.current('scale')}><option value="log">로그</option><option value="linear">선형</option></select></label>
          <label className="rsi-panel-check"><input type="checkbox" checked={view.autoScale} onChange={() => command.current('auto-scale')}/>가격축 자동 맞춤</label>
          <label className="rsi-panel-check"><input type="checkbox" checked={view.inverted} onChange={() => command.current('invert-scale')}/>가격축 반전</label>
          <label className="rsi-panel-field">자석<select value={view.magnet} onChange={event => command.current('magnet', event.target.value)}><option value="off">끄기</option><option value="weak">약하게</option><option value="strong">강하게</option></select></label>
          <button type="button" onClick={() => command.current('fit')}>전체 기간·축 맞춤</button><button type="button" disabled={!view.measurement.length} onClick={() => command.current('clear-measurement')}>측정 지우기</button>
        </>}
        {pane === 'date' && <>
          <form onSubmit={event => { event.preventDefault(); command.current('date', jump); }}><label className="rsi-panel-field">관측{monthly ? '월' : '일'}로 이동<input type={monthly ? 'month' : 'date'} value={dateLabel(jump)} min={dateLabel(series.timeline[0])} max={dateLabel(series.timeline.at(-1)!)} onChange={event => setJump(inputDate(event.target.value))}/></label><button type="submit">이동</button></form>
          <form onSubmit={event => { event.preventDefault(); try { persist({ ...view, ...boundedInstrumentDates(series, from, to), autoScale: true, domain: null }); setStatus(''); } catch { setStatus('표시할 날짜 범위를 확인하세요.'); } }}><label className="rsi-panel-field">시작<input type={monthly ? 'month' : 'date'} value={dateLabel(from)} onChange={event => setFrom(inputDate(event.target.value))}/></label><label className="rsi-panel-field">종료<input type={monthly ? 'month' : 'date'} value={dateLabel(to)} onChange={event => setTo(inputDate(event.target.value))}/></label><button type="submit">기간 적용</button></form>
        </>}
        {pane === 'method' && <><dl className="rsi-data-list"><dt>가격 기준</dt><dd>{monthly ? '월별 실거래가격지수' : '완료 현물 일봉'} · {unit}</dd><dt>가격 마지막 관측</dt><dd>{series.prices.at(-1)?.[0] ? dateLabel(series.prices.at(-1)![0]) : '미공표'}</dd><dt>거래량 마지막 관측</dt><dd>{dateLabel(series.volumes.filter(point => point.value !== null).at(-1)?.date || '') || '미공표'}</dd><dt>표시 간격</dt><dd>{frequencyNames[view.frequency]}</dd></dl>{view.frequency === 'weekly' && <p>관측 일봉의 첫 시가·최고가·최저가·마지막 종가와 거래량 합계입니다. 마지막 주는 제공된 일봉까지 표시합니다.</p>}{props.method}{revision && <p className="instrument-revision">판본 {revision}</p>}</>}
        {pane === 'help' && <dl className="rsi-data-list"><dt>휠</dt><dd>오른쪽 끝을 유지하며 확대·축소</dd><dt>Ctrl + 휠</dt><dd>가리킨 위치에서 확대·축소</dd><dt>드래그</dt><dd>날짜·가격 위치 이동</dd><dt>가격축 드래그 / 휠</dt><dd>가격 눈금 조절</dd><dt>가격축 두 번 클릭</dt><dd>가격 자동 맞춤</dd><dt>시간축 드래그</dt><dd>표시 기간 조절</dd><dt>C / H / M</dt><dd>십자선 / 이동 / 두 점 측정</dd><dt>← / →</dt><dd>이전 / 다음 관측</dd><dt>0 / 두 번 클릭</dt><dd>전체 범위</dd><dt>Alt+G / Alt+M</dt><dd>날짜 이동 / 자석</dd><dt>Ctrl/⌘ Z</dt><dd>실행 취소</dd><dt>Shift Ctrl/⌘ Z</dt><dd>다시 실행</dd></dl>}
        {pane === 'search' && <><label className="rsi-panel-field">명령 검색<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="기간, 표시, 측정…"/></label>{commands.filter(([label]) => label.includes(search)).map(([label, action, value]) => <button className="rsi-command-option" type="button" key={label} onClick={() => { setPane(null); command.current(action, value); }}>{label}</button>)}</>}
        {pane === 'export' && <><p>{symbol} · {unit} · {frequencyNames[view.frequency]}<br/>{dateLabel(view.start)} ~ {dateLabel(view.end)}</p><button type="button" onClick={() => { if (svg.current) setExportText(serializeInstrumentSvg(svg.current, symbol, unit, view.frequency)); }}>현재 차트 준비</button>{exportUrl && <><a href={exportUrl} download={`${symbol}-${view.start}-${view.end}.svg`}>SVG 저장</a>{pngUrl && <a href={pngUrl} download={`${symbol}-${view.start}-${view.end}.png`}>PNG 저장</a>}<img className="rsi-export-preview" src={pngUrl || exportUrl} alt={`${symbol} 현재 차트 내보내기 미리보기`}/><details><summary>SVG 원문</summary><textarea readOnly value={exportText} aria-label="차트 SVG 원문" onFocus={event => event.target.select()}/></details></>}</>}
      </div></aside>}
    </div>
    <span className="atlas-sr-only" aria-live="polite">{status}</span>
  </section>;
}
