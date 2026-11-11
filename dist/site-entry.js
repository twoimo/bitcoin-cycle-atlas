import { enhanceBootSkeleton } from './loading-surfaces.js';
import { initAtlasShell } from './atlas-shell.js?v=1.36.1';
import { canonicalNativeChartEntry } from './atlas-navigation.js?v=1.36.1';
import { canonicalWorkspaceChartEntry } from './atlas-navigation.js?v=1.36.1';
import { mountJournalEntry } from './journal-entry.js?v=1.29.0';
import { initPerformanceDiagnostics } from './performance-diagnostics.js?v=1.29.0';

const chartEntry = canonicalNativeChartEntry(location) || canonicalWorkspaceChartEntry(location);
if (chartEntry) {
  // Resolve either chart family before a fallback owner starts fetching or
  // rendering another instrument in the shared shell.
  location.replace(chartEntry);
} else {
  enhanceBootSkeleton();
  initAtlasShell();
  initPerformanceDiagnostics();
  mountJournalEntry();
  const requested = new URLSearchParams(location.search).get('symbol')?.toUpperCase();
  const conference = new URLSearchParams(location.search).get('page') === 'conference';
  const symbol = !conference && ['ETHUSD','MSTR','BMNR'].includes(requested) ? requested : 'BTCUSD';
  document.documentElement.dataset.symbol = symbol;
  const bootSymbol = document.querySelector('.atlas-boot-symbol');
  if (bootSymbol) bootSymbol.textContent = symbol;
  try {
    if (symbol === 'ETHUSD') {
      const { initEthView } = await import("./eth-view.js?v=1.36.1");
      await initEthView();
    } else if (symbol === 'MSTR' || symbol === 'BMNR') {
      const { initEquityView } = await import("./equity-view.js?v=1.36.1");
      await initEquityView({symbol});
    } else {
      await import("./app.js?v=1.37.8");
    }
  } catch (error) {
    console.error('Chart initialization failed', error);
    document.dispatchEvent(new CustomEvent('atlas:boot-error'));
  }
}
