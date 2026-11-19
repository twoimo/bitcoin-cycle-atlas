import test from 'node:test';
import assert from 'node:assert/strict';
import { liveQuoteRequest, parseLiveQuote, formatLivePrice } from '../dist/live-quote.js';

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
