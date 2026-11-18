import { initTheme } from './ui/theme.js';
import { enhanceBootSkeleton } from './loading-surfaces.js?v=1.0.1';
import { initAtlasShell } from './atlas-shell.js?v=1.36.21';
import { canonicalNativeChartEntry, canonicalRetiredPageEntry, canonicalWorkspaceChartEntry, canonicalDefaultChartEntry } from './atlas-navigation.js?v=1.36.3';
import { mountJournalEntry } from './journal-entry.js?v=1.29.3';
import { initPerformanceDiagnostics } from './performance-diagnostics.js?v=1.29.0';

initTheme();

const canonicalEntry = canonicalRetiredPageEntry(location) || canonicalNativeChartEntry(location) || canonicalWorkspaceChartEntry(location) || canonicalDefaultChartEntry(location);
if (canonicalEntry) {
  location.replace(canonicalEntry);
} else {
  enhanceBootSkeleton();
  initAtlasShell();
  initPerformanceDiagnostics();
  mountJournalEntry();
  const requested = new URLSearchParams(location.search).get('symbol')?.toUpperCase();
  const symbol = ['ETHUSD','MSTR','BMNR'].includes(requested) ? requested : 'BTCUSD';
  document.documentElement.dataset.symbol = symbol;
  const bootSymbol = document.querySelector('.atlas-boot-symbol');
  if (bootSymbol) bootSymbol.textContent = symbol;
  let opened = false, failure = null;
  for (let attempt = 0; attempt < 4 && !opened; attempt += 1) {
    try {
      const specifier = attempt === 0 ? "./app.js?v=1.37.39" : `./app.js?v=1.37.39&retry=${attempt}`;
      await import(specifier);
      opened = true;
    } catch (error) {
      failure = error;
      const transient = error instanceof TypeError && /Failed to fetch|Load failed|dynamically imported module|Importing a module script failed/i.test(String(error?.message || error));
      if (!transient || attempt === 3) break;
      await new Promise(resolve => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }
  if (!opened) {
    console.error('Chart initialization failed', failure);
    document.dispatchEvent(new CustomEvent('atlas:boot-error', { detail: { message: String(failure?.message || failure) } }));
  }
}
