import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { canonicalNativeChartEntry, canonicalWorkspaceChartEntry, labPageFromLocation } from '../dist/atlas-navigation.js';

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
    location, document, URLSearchParams, canonicalNativeChartEntry, canonicalWorkspaceChartEntry, console,
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

for (const symbol of ['BTCUSD', 'ETHUSD', 'MSTR', 'TQQQ', 'SOXL', '233740']) {
  test(`${symbol} root deep link dispatches to the instrument's own chart family`, async () => {
    const supplied = new URL(`https://atlas.example/?symbol=${symbol}`);
    const result = await boot(supplied.href);
    if (['TQQQ', 'SOXL', '233740'].includes(symbol)) {
      assert.deepEqual(result.redirects, [`/market-lab/charts/?symbol=${symbol}`]);
      assert.deepEqual(result.calls, [], 'root alias must resolve before initializing the BTC shell');
      assert.deepEqual(result.modules, [], 'root alias must not fetch or paint a BTC price owner');
      assert.equal(result.document.documentElement.dataset.symbol, undefined, 'fallback cannot publish a false BTC identity');
      const destination = new URL(result.redirects[0], supplied);
      assert.equal(labPageFromLocation(destination).id, 'rsi');
      assert.equal(destination.searchParams.get('symbol'), symbol);
      assert.equal(canonicalWorkspaceChartEntry(destination), null, 'hosted route cannot redirect in a loop');
      assert.equal(canonicalNativeChartEntry(destination), null, 'hosted instrument cannot take a native redirect');
    } else {
      assert.deepEqual(result.redirects, []);
      assert.equal(result.document.documentElement.dataset.symbol, symbol);
      assert.equal(result.symbolNode.textContent, symbol);
      assert.equal(result.modules.length, 1);
      assert.match(result.modules[0], new RegExp('^\\./' + ({BTCUSD:'app', ETHUSD:'eth-view', MSTR:'equity-view'})[symbol] + '\\.js\\?v='));
      assert.deepEqual(result.events, []);
    }
  });
}

test('workspace root aliases preserve supplied chart settings, project root and hash', () => {
  const supplied = new URL('https://atlas.example/bitcoin-cycle-atlas/?symbol=%20233740.ks%20&page=outlook&granularity=weekly&type=candles&axis=linear&view-start=2020-01-01&view-end=2026-11-01#price');
  const destination = new URL(canonicalWorkspaceChartEntry(supplied), supplied);
  assert.equal(destination.pathname, '/bitcoin-cycle-atlas/market-lab/charts/');
  assert.equal(destination.searchParams.get('symbol'), '233740');
  assert.equal(destination.searchParams.has('page'), false);
  assert.equal(destination.hash, '#price');
  for (const key of ['granularity', 'type', 'axis', 'view-start', 'view-end']) assert.equal(destination.searchParams.get(key), supplied.searchParams.get(key));
  assert.equal(canonicalWorkspaceChartEntry(new URL('https://atlas.example/?symbol=HOUSING-SEOUL&region=busan')), '/market-lab/charts/?symbol=HOUSING-SEOUL&region=seoul');
});

test('workspace root routing preserves explicit non-chart owners and existing fallback boundaries', async () => {
  for (const suffix of ['&page=evidence', '&page=data', '&page=ipo', '&page=relay', '&page=compare', '&page=market', '&center=evidence', '&embedded=1']) {
    assert.equal(canonicalWorkspaceChartEntry(new URL(`https://atlas.example/?symbol=TQQQ${suffix}`)), null, suffix);
  }
  for (const url of ['https://atlas.example/market-lab/?symbol=TQQQ', 'https://atlas.example/market-lab/rsi/?symbol=SOXL', 'https://atlas.example/market-lab/charts/?symbol=233740', 'file:///tmp/?symbol=TQQQ', 'https://atlas.example//foreign.example/?symbol=TQQQ']) {
    assert.equal(canonicalWorkspaceChartEntry(new URL(url)), null, url);
  }
  for (const symbol of ['unknown', 'ETHUSDT', 'https://foreign.example']) {
    const result = await boot(`https://atlas.example/?symbol=${encodeURIComponent(symbol)}`);
    assert.deepEqual(result.redirects, []);
    assert.equal(result.document.documentElement.dataset.symbol, 'BTCUSD');
    assert.match(result.modules[0], /^\.\/app\.js\?v=/);
  }
});
