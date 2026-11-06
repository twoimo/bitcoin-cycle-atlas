import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { WORKSPACE_INSTRUMENTS, searchWorkspaceInstruments } from '../../../../dist/workspace-instruments.js';

export type WorkspaceInstrument = typeof WORKSPACE_INSTRUMENTS[number];
const marketViews = [
  { id:'market-us', label:'미국', code:'US' },
  { id:'market-kr', label:'국내', code:'KR' },
  { id:'scenario', label:'조건 실험', code:null },
  { id:'cashflow', label:'현금흐름', code:null },
];

export function MarketWorkspaceToolbar({ page, onNavigate }: { page:string; onNavigate:(page:string)=>void }) {
  return <div className="workspace-toolbar market-workspace-toolbar">
    <strong className="workspace-toolbar-title">시장 분석</strong>
    <div className="workspace-view-tabs" role="tablist" aria-label="시장 분석 보기" onKeyDown={event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.click(); buttons[next]?.focus();
    }}>
      {marketViews.map(view => <button key={view.id} type="button" role="tab" id={`workspace-tab-${view.id}`} data-workspace-page={view.id}
        aria-controls="ml-panel" aria-selected={page === view.id} tabIndex={page === view.id ? 0 : -1} onClick={() => onNavigate(view.id)}>
        {view.code && <span className="workspace-region-code" aria-hidden="true">{view.code}</span>}{view.label}
      </button>)}
    </div>
  </div>;
}

export function ChartWorkspaceToolbar({ instrument, onSelect }: { instrument:WorkspaceInstrument; onSelect:(instrument:WorkspaceInstrument)=>void }) {
  const [open,setOpen] = useState(false), [query,setQuery] = useState(''), [group,setGroup] = useState('all'), [active,setActive] = useState(0);
  const owner = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const id = useId(), listId = `${id}-instruments`;
  const results = useMemo(() => searchWorkspaceInstruments(query,group),[query,group]);
  const activeIndex = Math.min(Math.max(0,active),Math.max(0,results.length-1));
  useEffect(() => { setOpen(false); setQuery(''); setGroup('all'); setActive(0); },[instrument.symbol]);
  useEffect(() => {
    if (!open) return;
    const outside = (event:PointerEvent) => { if (!owner.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown',outside);
    return () => document.removeEventListener('pointerdown',outside);
  },[open]);
  useEffect(() => {
    if (!open) return;
    const option = list.current?.querySelector<HTMLElement>(`[data-result-index="${activeIndex}"]`);
    option?.scrollIntoView?.({ block:'nearest' });
  },[activeIndex,open,results]);
  function select(item:WorkspaceInstrument) {
    onSelect(item); input.current?.focus(); setOpen(false); setQuery(''); setGroup('all'); setActive(0);
  }
  return <div className="workspace-toolbar chart-workspace-toolbar" ref={owner} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <div className="workspace-current-instrument" aria-live="polite">
      <strong>{instrument.assetClass === 'housing' ? instrument.koreanName : instrument.product}</strong>
      <span>{instrument.assetClass === 'housing' ? '실거래지수 · 거래량' : instrument.koreanName}</span>
    </div>
    <div className="workspace-instrument-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>
      <input ref={input} type="search" role="combobox" aria-label="종목·지역 검색" placeholder="종목·지역 검색" value={query}
        autoComplete="off" spellCheck={false} aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open && results.length ? `${id}-result-${activeIndex}` : undefined}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(value => results.length ? (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0); return;
          }
          if (open && (event.key === 'Home' || event.key === 'End')) { event.preventDefault(); setActive(event.key === 'Home' ? 0 : Math.max(0,results.length-1)); return; }
          if (open && event.key === 'Enter') { event.preventDefault(); if (results[activeIndex]) select(results[activeIndex]); }
        }}/>
    </div>
    {open && <section className="workspace-search-popover" aria-label="종목·지역 검색 결과">
      <div className="workspace-search-heading"><strong>종목 차트</strong><button type="button" aria-label="검색 결과 닫기" onClick={() => { input.current?.focus(); setOpen(false); }}>닫기</button></div>
      <div className="workspace-search-groups" role="group" aria-label="종목 유형">
        {['all','ETF','디지털 자산','부동산'].map(value => <button key={value} type="button" aria-pressed={value === group} onClick={() => { setGroup(value); setActive(0); input.current?.focus(); }}>{value === 'all' ? '전체' : value}</button>)}
      </div>
      <div ref={list} className="workspace-search-results" id={listId} role="listbox" aria-label="차트 선택">
        {results.map((item,index) => <button key={item.symbol} id={`${id}-result-${index}`} data-result-index={index} data-workspace-symbol={item.symbol}
          type="button" role="option" aria-selected={activeIndex === index} tabIndex={-1} onPointerMove={() => setActive(index)}
          onMouseDown={event => event.preventDefault()} onClick={() => select(item)}>
          <span className="workspace-result-symbol">{item.assetClass === 'housing' ? item.base : item.symbol}</span>
          <span className="workspace-result-name"><strong>{item.koreanName}</strong><span>{item.assetClass === 'housing' ? '아파트 실거래지수 · 거래량' : item.name}</span></span>
          <span className="workspace-result-source">{item.source}<small>{item.group}</small></span>
          <span className="workspace-result-action">{instrument.symbol === item.symbol ? '선택됨' : '차트 보기'}</span>
        </button>)}
      </div>
      {!results.length && <p className="workspace-search-empty" role="status">검색 결과가 없습니다. 종목명·티커·지역명을 확인하세요.</p>}
      <div className="workspace-search-footer"><span role="status">{results.length}개 차트</span><span>↑↓ 선택 · Enter 열기 · Esc 닫기</span></div>
    </section>}
  </div>;
}
