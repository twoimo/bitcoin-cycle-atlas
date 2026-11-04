/*! Adapted from shadcn/ui dashboard-01 (MIT, copyright 2023 shadcn).
 * Source revision and original license: docs/design-system/templates/shadcn-dashboard-01.
 * Distribution license: /vendor/shadcn-ui-LICENSE.txt. No demo data or account controls are used. */
import { useLayoutEffect, useState } from 'react';
import { readShellPreference, writeShellPreference } from '../../../../dist/atlas-shell-state.js';

import { atlasPages } from '../../../../dist/atlas-navigation.js';

function storage() { try { return globalThis.localStorage; } catch { return undefined; } }
export function DashboardChrome({ title, currentPage, onNavigate }: { title: string; currentPage: string; onNavigate: (id: string) => void }) {
  const [compact, setCompact] = useState(() => readShellPreference(storage()));
  useLayoutEffect(() => { document.body.dataset.shell = 'dashboard'; document.body.dataset.sidebar = compact ? 'compact' : 'full'; }, [compact]);
  return <>
    <aside className="atlas-sidebar atlas-dashboard-sidebar" aria-label="주요 페이지">
      <a className="atlas-brand" href="/?page=outlook" aria-label="비트코인 사이클 통합 차트"><span aria-hidden="true">₿</span><strong>Cycle Atlas</strong></a>
      <nav className="atlas-nav" aria-label="주요 페이지">{atlasPages.map(page => <a key={page.id} href={page.href} data-atlas-page={page.id}
        aria-label={page.label} title={page.title} aria-current={page.id === currentPage ? 'page' : undefined} onClick={page.tab ? event => { if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return; event.preventDefault(); onNavigate(page.id); } : undefined}>
        {page.badge ? <span className="atlas-nav-code" aria-hidden="true">{page.badge}</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={page.icon} /></svg>}
        <span className="atlas-nav-label">{page.label}</span>
      </a>)}</nav>
    </aside>
    <header className="atlas-dashboard-header"><button className="atlas-sidebar-toggle" type="button" aria-expanded={!compact} aria-label={compact ? '탐색 메뉴 펼치기' : '탐색 메뉴 접기'}
      onClick={() => { setCompact(!compact); writeShellPreference(storage(), !compact); }}>☰</button><h1 className="atlas-shell-heading">{title}</h1>
    </header>
  </>;
}
