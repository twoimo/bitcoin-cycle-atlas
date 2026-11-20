import { initTheme } from './ui/theme.js';
import { enhanceBootSkeleton } from './loading-surfaces.js?v=1.0.3';
import { initAtlasShell } from './atlas-shell.js?v=1.36.29';
import { canonicalNativeChartEntry, canonicalRetiredPageEntry, canonicalWorkspaceChartEntry, canonicalDefaultChartEntry } from './atlas-navigation.js?v=1.36.3';
import { mountJournalEntry } from './journal-entry.js?v=1.29.3';
import { initPerformanceDiagnostics } from './performance-diagnostics.js?v=1.29.0';

initTheme();

function embeddedChartFrame() {
  try {
    return typeof window !== 'undefined' && window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1';
  } catch {
    return false;
  }
}

const canonicalEntry = canonicalRetiredPageEntry(location) || (embeddedChartFrame() ? null : canonicalNativeChartEntry(location)) || canonicalWorkspaceChartEntry(location) || canonicalDefaultChartEntry(location);
if (canonicalEntry) {
  location.replace(canonicalEntry);
} else {
  enhanceBootSkeleton();
  initAtlasShell();
  initPerformanceDiagnostics();
  mountJournalEntry();
  const params = new URLSearchParams(location.search);
  const requested = params.get('symbol')?.toUpperCase();
  const reqPage = params.get('page')?.toLowerCase();
  const symbol = ['ETHUSD','MSTR','BMNR'].includes(requested) ? requested : 'BTCUSD';
  document.documentElement.dataset.symbol = symbol;
  if (!location.pathname.includes('/market-lab/') && (!reqPage || reqPage === 'outlook' || reqPage === 'compare')) {
    const bootSymbol = document.querySelector('.atlas-boot-symbol');
    if (bootSymbol) bootSymbol.textContent = symbol;
  }
  let opened = false, failure = null;
  const retryDelay = [400, 900, 1600, 2500, 3500];
  for (let attempt = 0; attempt < retryDelay.length + 1 && !opened; attempt += 1) {
    try {
      const specifier = attempt === 0 ? "./app.js?v=1.37.63" : `./app.js?v=1.37.63&retry=${attempt}`;
      await import(specifier);
      opened = true;
    } catch (error) {
      failure = error;
      const transient = error instanceof TypeError && /Failed to fetch|Load failed|dynamically imported module|Importing a module script failed/i.test(String(error?.message || error));
      if (!transient || attempt === retryDelay.length) break;
      await new Promise(resolve => setTimeout(resolve, retryDelay[attempt]));
    }
  }
  if (!opened) {
    console.error('Chart initialization failed', failure);
    document.dispatchEvent(new CustomEvent('atlas:boot-error', { detail: { message: String(failure?.message || failure) } }));
  }
}
