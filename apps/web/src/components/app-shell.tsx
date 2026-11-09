import {atlasSitePath} from '../../../../dist/site-paths.js';
/*! Adapted from shadcn/ui dashboard-01 (MIT, copyright 2023 shadcn).
 * Source revision and original license: docs/design-system/templates/shadcn-dashboard-01.
 * Distribution license: /vendor/shadcn-ui-LICENSE.txt. No demo data or account controls are used. */
import { useLayoutEffect, useRef, useState } from 'react';
import { readShellPreference, writeShellPreference } from '../../../../dist/atlas-shell-state.js';

import { atlasNavigationPages, atlasNavigationId, atlasPageHref } from '../../../../dist/atlas-navigation.js';
import { workspaceInstrument } from '../../../../dist/workspace-instruments.js';
import { atlasPageDescription } from '../../../../dist/ui/page-description.js';
import { observePageHeader } from '../../../../dist/ui/page-header-layout.js';

function storage() { try { return globalThis.localStorage; } catch { return undefined; } }
export function DashboardChrome({ title, currentPage, chartSymbol, descriptionContext, onNavigate }: { title: string; currentPage: string; chartSymbol?: string; descriptionContext?: Parameters<typeof atlasPageDescription>[1]; onNavigate: (id: string) => void }) {
  const [compact, setCompact] = useState(() => readShellPreference(storage()));
  const header=useRef<HTMLElement>(null),headerLayout=useRef<ReturnType<typeof observePageHeader>|null>(null);
  const chartPage = workspaceInstrument(chartSymbol)?.page;
  const pageDescription = atlasPageDescription(currentPage,{...descriptionContext,symbol:chartSymbol});
  useLayoutEffect(() => { document.body.dataset.shell = 'dashboard'; document.body.dataset.sidebar = compact ? 'compact' : 'full'; }, [compact]);
  useLayoutEffect(() => {
    const layout=observePageHeader(header.current);headerLayout.current=layout;
    return()=>{headerLayout.current=null;layout.destroy();};
  },[]);
  useLayoutEffect(()=>{headerLayout.current?.sync();},[compact,title,pageDescription.description]);
  return <>
    <aside className="atlas-sidebar atlas-dashboard-sidebar" aria-label="주요 페이지">
      <a className="atlas-brand" href={atlasSitePath('/?page=outlook')} aria-label="비트코인 사이클 통합 차트"><span aria-hidden="true">₿</span><strong>Cycle Atlas</strong></a>
      <nav className="atlas-nav" aria-label="주요 페이지">{atlasNavigationPages.map(page => <a key={page.id} href={atlasSitePath(atlasPageHref(page, page.id === 'outlook' ? { symbol: chartSymbol } : undefined))} data-atlas-page={page.id}
        aria-label={page.label} title={page.title} aria-current={page.id === atlasNavigationId(currentPage) ? 'page' : undefined} onClick={page.tab || (page.id === 'outlook' && chartPage) ? event => { if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return; event.preventDefault(); onNavigate(page.id === 'outlook' ? chartPage! : page.id); } : undefined}>
        {page.badge ? <span className="atlas-nav-code" aria-hidden="true">{page.badge}</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={page.icon} /></svg>}
        <span className="atlas-nav-label">{page.label}</span>
      </a>)}</nav>
    </aside>
    <header ref={header} className="atlas-dashboard-header"><button className="atlas-sidebar-toggle" type="button" aria-expanded={!compact} aria-label={compact ? '탐색 메뉴 펼치기' : '탐색 메뉴 접기'}
      onClick={() => { setCompact(!compact); writeShellPreference(storage(), !compact); }}>☰</button><div className="atlas-shell-copy" data-page-intro={pageDescription.id}><h1 className="atlas-shell-heading" aria-describedby="atlas-page-description">{title}</h1><p id="atlas-page-description" className="atlas-page-description"><span data-page-purpose>{pageDescription.purpose}</span>{' '}<span data-page-basis>{pageDescription.basis}</span></p></div>
    </header>
  </>;
}
