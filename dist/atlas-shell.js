/*! MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */
/*! Layout composition adapted from shadcn/ui dashboard-01, MIT, copyright (c) 2023 shadcn.
 * Exact source and license: docs/design-system/templates/shadcn-dashboard-01; /vendor/shadcn-ui-LICENSE.txt.
 * Existing chart/data controls retain their original DOM owners and handlers. */
import {atlasSitePath} from './site-paths.js';
import { atlasPages, atlasNavigationPages, atlasNavigationId, labPageFromLocation } from './atlas-navigation.js?v=1.36.1';
import { readShellPreference, writeShellPreference } from './atlas-shell-state.js';
import { mountCenterWorkbench } from './center-workbench.js?v=1.36.1';
import { mountShellSlots } from './ui/shell-slots.js';

const pageNames = { outlook: '통합 차트', compare: '사이클 비교', evidence: '리서치 자료', data: '자산 비교표', ipo: '공모주 캘린더', market: '세 축 연구실' };

// The compact rails keep their Korean names visible for pointer and keyboard
// users. A body-level tooltip avoids clipping inside the scrolling rail.
export function mountRailTooltip(document) {
  const view = document.defaultView || globalThis.window;
  const tooltip = document.createElement('div');
  tooltip.className = 'atlas-rail-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  let current = null;
  const trigger = target => target?.closest?.('.workbench-rail button, .workbench-rail a, .atlas-sidebar .workbench-icon');
  const hide = () => { tooltip.hidden = true; current = null; };
  const show = node => {
    if (!node || node.disabled || document.body.dataset.shell !== 'chart' || view?.matchMedia?.('(max-width: 620px)').matches) { hide(); return; }
    const label = node.getAttribute('aria-label') || node.getAttribute('title');
    if (!label) { hide(); return; }
    current = node;
    tooltip.textContent = label;
    tooltip.hidden = false;
    const bounds = node.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const width = view?.innerWidth || document.documentElement.clientWidth;
    const height = view?.innerHeight || document.documentElement.clientHeight;
    const left = node.closest('.workbench-rail') ? bounds.left - tip.width - 8 : bounds.right + 8;
    tooltip.style.left = `${Math.max(8, Math.min(left, width - tip.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(bounds.top + (bounds.height - tip.height) / 2, height - tip.height - 8))}px`;
  };
  const over = event => { const node = trigger(event.target); if (node && node !== trigger(event.relatedTarget)) show(node); };
  const out = event => { if (current && trigger(event.relatedTarget) !== current && document.activeElement !== current) hide(); };
  const focus = event => show(trigger(event.target));
  const blur = event => { if (trigger(event.target) === current) hide(); };
  const key = event => { if (event.key === 'Escape') hide(); };
  const scroll = () => { if (current && document.activeElement === current) show(current); else hide(); };
  document.addEventListener('pointerover', over);
  document.addEventListener('pointerout', out);
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', blur);
  document.addEventListener('keydown', key);
  document.addEventListener('pointerdown', hide);
  document.addEventListener('scroll', scroll, true);
  view?.addEventListener('resize', hide);
  return () => {
    document.removeEventListener('pointerover', over);
    document.removeEventListener('pointerout', out);
    document.removeEventListener('focusin', focus);
    document.removeEventListener('focusout', blur);
    document.removeEventListener('keydown', key);
    document.removeEventListener('pointerdown', hide);
    document.removeEventListener('scroll', scroll, true);
    view?.removeEventListener('resize', hide);
    tooltip.remove();
  };
}

export function initAtlasShell() {
  if (globalThis.window && window.parent !== window && new URLSearchParams(location.search).get('embedded')==='1') {document.body.dataset.embedded='true';return;}
  const sidebar = document.querySelector('.atlas-sidebar'), workspace = document.querySelector('.workspace');
  if (!sidebar || !workspace || document.querySelector('[data-atlas-shell]')) return;
  const brandName = sidebar.querySelector('.atlas-brand>div');
  if (brandName) brandName.replaceChildren(document.createTextNode('Cycle Atlas'));
  const originalNav = document.querySelector('.atlas-nav');
  const service = document.querySelector('meta[name="atlas-service-base"]')?.getAttribute('content');
  const originalItems = new Map([...originalNav?.querySelectorAll('[data-view]') || []].map(item => [item.dataset.view, item]));
  for (const page of atlasNavigationPages) {
    let item = originalItems.get(page.view);
    if (page.tab && page.id !== 'market-us') item = null;
    if (!item && originalNav) {
      item = document.createElement('a');
      item.href = service === '/market-lab/' || document.querySelector('meta[name="atlas-static-entry"]') || !page.tab ? atlasSitePath(page.href) : `?page=market&lab-tab=${page.tab}&lab-region=${page.region || 'us'}`;
      item.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${page.icon}"/></svg><span>${page.label}</span>`;
    }
    if (!item) continue;
    item.dataset.atlasPage = page.id;
    item.setAttribute('aria-label', page.label); item.setAttribute('title', page.title);
    if (page.badge) {
      const icon = item.querySelector('[data-icon],svg');
      if (icon) { const badge = document.createElement('span'); badge.className = 'atlas-nav-code'; badge.setAttribute('aria-hidden','true'); badge.textContent = page.badge; icon.replaceWith(badge); }
    }
    const label = item.querySelector('span:last-child:not([data-icon])');
    if (label) { label.classList.add('atlas-nav-label'); label.textContent = page.label; }
    originalNav.append(item);
  }
  let storage; try { storage = localStorage; } catch { /* Optional preference. */ }
  let compact = readShellPreference(storage);
  const routeToService = event => {
    const target = event.target instanceof Element ? event.target.closest('[data-atlas-page]') : null;
    const page = atlasPages.find(page => page.id === target?.dataset.atlasPage);
    if (page?.tab && target.tagName === 'BUTTON') { event.preventDefault(); event.stopPropagation(); location.assign(atlasSitePath(page.href)); }
  };
  if (service === '/market-lab/' || document.querySelector('meta[name="atlas-static-entry"]')) mountCenterWorkbench();
  const header = document.createElement('header'); header.className = 'atlas-dashboard-header'; header.dataset.atlasShell = 'dashboard-01';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'atlas-sidebar-toggle';
  toggle.textContent = '☰';
  const heading = document.createElement('h1'); heading.className = 'atlas-shell-heading';
  header.append(toggle, heading); document.body.insertBefore(header, workspace);
  const group = document.createElement('div'); group.className = 'atlas-sidebar-group'; sidebar.append(group);
  function preference() {
    document.body.dataset.sidebar = compact ? 'compact' : 'full';
    toggle.setAttribute('aria-expanded', String(!compact)); toggle.setAttribute('aria-label', compact ? '탐색 메뉴 펼치기' : '탐색 메뉴 접기');
  }
  toggle.addEventListener('click', () => { compact = !compact; preference(); writeShellPreference(storage, compact); });
  function sync() {
    const page = document.body.dataset.page || 'outlook';
    const chart = page === 'outlook';
    document.body.dataset.shell = chart ? 'chart' : 'dashboard';
    header.hidden = chart; group.hidden = chart;
    heading.textContent = page === 'market' ? labPageFromLocation(globalThis.location).title : atlasPages.find(item => item.view === page)?.title || pageNames[page] || 'Cycle Atlas';
    const navigation = document.querySelector('.atlas-nav'), rail = document.querySelector('.workbench-rail');
    if (navigation && chart && rail) {
      const tools = rail.querySelector('.workbench-detail-tools');
      // Keep visual and keyboard order together while reusing the same links.
      // A mobile tray heading, when present, remains before both groups.
      if (tools?.parentElement === rail) {
        if (navigation.nextElementSibling !== tools) rail.insertBefore(navigation, tools);
      } else if (navigation.parentElement !== rail) rail.append(navigation);
    }
    if (navigation && !chart && navigation.parentElement !== sidebar) sidebar.append(navigation);
    const currentWorkspace = chart && document.body.dataset.centerTool;
    const activePage = atlasNavigationId(currentWorkspace || (page === 'market' ? labPageFromLocation(globalThis.location).id : atlasPages.find(item => item.view === page)?.id));
    for (const item of navigation?.querySelectorAll('[data-atlas-page]') || []) {
      const active = item.dataset.atlasPage === activePage;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    }
    preference();
  }
  const pageObserver = new MutationObserver(sync), workspaceObserver = new MutationObserver(sync);
  pageObserver.observe(document.body, { attributes: true, attributeFilter: ['data-page', 'data-center-tool'] });
  workspaceObserver.observe(workspace, { childList: true });
  sync();
  const removeRailTooltip = mountRailTooltip(document);
  const shellSlots = mountShellSlots(document);
  return () => { shellSlots.destroy(); removeRailTooltip(); pageObserver.disconnect(); workspaceObserver.disconnect(); document.removeEventListener('click', routeToService, true); };
}
