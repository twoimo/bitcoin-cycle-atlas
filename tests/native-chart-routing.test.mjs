import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { canonicalNativeChartEntry, labPageFromLocation } from '../dist/atlas-navigation.js';

const entrySource = (await readFile(new URL('../dist/site-entry.js', import.meta.url), 'utf8'))
  .replace(/^import [^\n]+;\s*$/gm, '')
  .replace(/\bimport\(/g, 'loadModule(');

// Run the actual entry dispatcher with only its module/network boundary
// replaced. Native renderer drawing is exercised by native-chart-entry-url.
async function boot(url) {
  const calls = [], redirects = [], modules = [], events = [];
  const location = new URL(url);
  location.replace = href => redirects.push(href);
  const symbolNode = { textContent: '' };
  const document = { documentElement: { dataset: {} }, querySelector: () => symbolNode, dispatchEvent: event => events.push(event.type) };
  await runInNewContext(`(async () => {${entrySource}\n})()`, {
    location, document, URLSearchParams, canonicalNativeChartEntry, console,
    enhanceBootSkeleton: () => calls.push('skeleton'), initAtlasShell: () => calls.push('shell'),
    initPerformanceDiagnostics: () => calls.push('diagnostics'), mountJournalEntry: () => calls.push('journal'),
    CustomEvent: class { constructor(type) { this.type = type; } },
    loadModule: async path => { modules.push(path); return {
      initEquityView: async ({symbol}) => calls.push(`equity:${symbol}`), initEthView: async () => calls.push('eth:ETHUSD'),
    }; },
  });
  return { calls, redirects, modules, events, document, symbolNode };
}

for (const symbol of ['MSTR', 'BMNR']) for (const path of ['/', '/market-lab/charts/']) {
  test(`${symbol} ${path} enters its own native chart before any ETF frame can mount`, async () => {
    const entry = new URL(`${path}?symbol=${symbol}`, 'https://atlas.example');
    let result = await boot(entry.href);
    if (path === '/market-lab/charts/') {
      assert.deepEqual(result.redirects, [`/?symbol=${symbol}`]);
      assert.deepEqual(result.calls, [], 'redirect must precede shell, skeleton and journal initialization');
      assert.deepEqual(result.modules, [], 'no background or previous-symbol data owner starts before redirect');
      assert.equal(labPageFromLocation(entry).id, 'outlook', 'native stock paths never fall back to TQQQ');
      result = await boot(new URL(result.redirects[0], entry).href);
    }
    assert.deepEqual(result.redirects, []);
    assert.equal(result.modules.length, 1);
    assert.match(result.modules[0], /^\.\/equity-view\.js\?v=/);
    assert.deepEqual(result.calls, ['skeleton', 'shell', 'diagnostics', 'journal', `equity:${symbol}`]);
    assert.equal(result.document.documentElement.dataset.symbol, symbol);
    assert.equal(result.symbolNode.textContent, symbol);
    assert.deepEqual(result.events, []);
  });
}

test('native canonical entry keeps project roots and supplied chart settings without inserting defaults', () => {
  const supplied = new URL('https://atlas.example/bitcoin-cycle-atlas/market-lab/charts/?symbol=%20mstr%20&granularity=weekly&type=candles&axis=linear&view-start=2020-01-01&view-end=2026-11-01&forecast=off&lab-tab=rsi&lab-region=us&center=rsi&region=us&view=rsi&embedded=1#price');
  const target = new URL(canonicalNativeChartEntry(supplied), supplied);
  assert.equal(target.pathname, '/bitcoin-cycle-atlas/');
  assert.equal(target.hash, '#price');
  assert.equal(target.searchParams.get('symbol'), 'MSTR');
  for (const key of ['granularity', 'type', 'axis', 'view-start', 'view-end', 'forecast']) assert.equal(target.searchParams.get(key), supplied.searchParams.get(key));
  for (const key of ['lab-tab', 'lab-region', 'center', 'region', 'view', 'embedded', 'page']) assert.equal(target.searchParams.has(key), false);
  assert.equal(canonicalNativeChartEntry(target), null, 'canonical entry cannot loop');
  for (const symbol of ['BTCUSD', 'ETHUSD']) assert.equal(canonicalNativeChartEntry(new URL(`https://atlas.example/market-lab/charts?symbol=${symbol}`)), `/?symbol=${symbol}`);
  for (const symbol of ['TQQQ', 'HYPE', 'HOUSING-SEOUL', 'unknown', 'https://foreign.example']) assert.equal(canonicalNativeChartEntry(new URL(`https://atlas.example/market-lab/charts/?symbol=${encodeURIComponent(symbol)}`)), null);
  assert.equal(canonicalNativeChartEntry(new URL('https://atlas.example/market-lab/app/?symbol=MSTR')), null);
  assert.equal(canonicalNativeChartEntry(new URL('https://atlas.example//foreign.example/market-lab/charts/?symbol=MSTR')), null, 'a supplied path cannot become a protocol-relative redirect');
});
