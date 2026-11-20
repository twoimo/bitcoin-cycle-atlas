import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { liveQuoteRequest, parseLiveQuote, formatLivePrice, mountLiveQuote } from '../dist/live-quote.js';

test('traded charts map to their exchange sources and non-traded index charts omit quotes', () => {
  assert.match(liveQuoteRequest('BTCUSD').url, /BTC-USD\/ticker$/);
  assert.match(liveQuoteRequest('ETHUSD').url, /ETH-USD\/ticker$/);
  assert.equal(liveQuoteRequest('HYPE').kind, 'hyperliquid');
  assert.match(liveQuoteRequest('HYPE').url, /api\.hyperliquid\.xyz\/info$/);
  assert.equal(liveQuoteRequest('HYPE').init.method, 'POST');
  assert.match(liveQuoteRequest('MSTR').url, /chart\/MSTR/);
  assert.match(liveQuoteRequest('BMNR').url, /chart\/BMNR/);
  assert.match(liveQuoteRequest('TQQQ').url, /chart\/TQQQ/);
  assert.match(liveQuoteRequest('SOXL').url, /chart\/SOXL/);
  assert.match(liveQuoteRequest('233740').url, /chart\/233740\.KS/);
  assert.equal(liveQuoteRequest('233740').currency, 'KRW');
  assert.match(liveQuoteRequest('KODEX 233740').url, /chart\/233740\.KS/);
  assert.equal(liveQuoteRequest('HOUSING-SEOUL'), null);
  assert.equal(liveQuoteRequest('AXES-US'), null);
  assert.equal(liveQuoteRequest(''), null);

  const btc = parseLiveQuote('coinbase', { price: '95123.4', time: '2026-11-19T13:00:00.000Z' });
  assert.equal(btc.price, 95123.4);
  assert.equal(formatLivePrice(btc.price, 'USD'), '$95,123.40');

  const hype = parseLiveQuote('hyperliquid', { '@107': '66.932', HYPE: '66.5' }, 1763557200000);
  assert.equal(hype.price, 66.932);
  assert.equal(formatLivePrice(hype.price, 'USDC'), '66.93 USDC');
  assert.equal(formatLivePrice(1.2345, 'USDC'), '1.2345 USDC');

  const equity = parseLiveQuote('yahoo', { chart: { result: [{ meta: { regularMarketPrice: 410.5, regularMarketTime: 1763557200 } }] } });
  assert.equal(equity.price, 410.5);
  assert.equal(formatLivePrice(11235, 'KRW'), '11,235원');

  assert.throws(() => parseLiveQuote('coinbase', { price: '0', time: '2026-11-19T13:00:00.000Z' }), /positive price/);
  assert.throws(() => parseLiveQuote('hyperliquid', { '@107': '0' }), /positive price/);
  assert.throws(() => parseLiveQuote('yahoo', { chart: { result: [{ meta: {} }] } }), /positive price/);
});

test('mountLiveQuote serves HYPE on themes workspace and skips non-chart SPA routes', async () => {
  const { window } = parseHTML('<!doctype html><html><body data-page="outlook" data-center-tool="themes"><div class="bar"><button class="workbench-symbol"><span class="symbol-selector-label">HYPE</span></button></div></body></html>');
  window.location = new URL('https://atlas.example/?symbol=HYPE');
  const calls = [];
  const unmount = mountLiveQuote(window.document, {
    intervalMs: 60000,
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ '@107': '66.932' }) };
    },
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.hyperliquid\.xyz\/info$/);
  const badge = window.document.querySelector('.workbench-live-quote');
  assert.equal(badge?.hidden, false);
  assert.equal(badge?.querySelector('b')?.textContent, '66.93 USDC');

  window.document.body.removeAttribute('data-center-tool');
  window.document.body.dataset.page = 'relay';
  window.document.querySelector('.symbol-selector-label').textContent = 'BTCUSD';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(calls.length, 1, 'non-chart SPA page must not fetch live quotes');
  assert.equal(badge?.hidden, true);
  unmount();
});

test('mountLiveQuote circuit-breaks a Yahoo symbol after a network/CORS fetch error', async () => {
  const { window } = parseHTML('<!doctype html><html><body data-page="outlook"><div class="bar"><button class="workbench-symbol"><span class="symbol-selector-label">MSTR</span></button></div></body></html>');
  window.location = new URL('https://atlas.example/?symbol=MSTR');
  const calls = [];
  const unmount = mountLiveQuote(window.document, {
    intervalMs: 10,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes('yahoo.com')) throw new TypeError('Failed to fetch');
      return { ok: true, json: async () => ({ price: '95123.4', time: '2026-11-19T13:00:00.000Z' }) };
    },
  });
  await new Promise(resolve => setTimeout(resolve, 45));
  const mstrCalls = calls.filter(url => url.includes('MSTR')).length;
  assert.equal(mstrCalls, 1, 'failed Yahoo symbol must not retry on the 10s interval');
  const badge = window.document.querySelector('.workbench-live-quote');
  assert.equal(badge?.hidden, true);

  window.document.querySelector('.symbol-selector-label').textContent = 'BTCUSD';
  window.document.documentElement.dataset.symbol = 'BTCUSD';
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(calls.some(url => url.includes('coinbase.com')), true, 'non-Yahoo symbols continue fetching');
  assert.equal(badge?.hidden, false);

  window.document.querySelector('.symbol-selector-label').textContent = 'MSTR';
  window.document.documentElement.dataset.symbol = 'MSTR';
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(calls.filter(url => url.includes('MSTR')).length, 1, 'circuit-broken Yahoo symbol stays suppressed in the session');
  unmount();
});
