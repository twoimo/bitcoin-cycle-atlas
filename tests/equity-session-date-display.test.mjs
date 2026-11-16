import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { equityViewFixture } from './helpers/equity-view-fixture.mjs';

const read = async name => JSON.parse(await readFile(new URL(`../dist/data/${name}.json`, import.meta.url), 'utf8'));

for (const symbol of ['MSTR', 'BMNR']) test(`${symbol} sessions reach the chart in a display timezone that names each New York session date`, async () => {
  const history = await read(`${symbol.toLowerCase()}-ohlc`), underlying = await read(symbol === 'MSTR' ? 'btc-daily' : 'eth-ohlc');
  const view = await equityViewFixture(symbol);
  view.reply(0, history); await view.microtasks(); view.reply(1, underlying); await view.settle(); await view.initialization;
  const mount = view.latest(), calendarDate = new Intl.DateTimeFormat('en-CA', { timeZone: mount.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  assert.equal(mount.series.candles.length, history.candles.length, 'every archived session is mounted');
  const relabelled = mount.series.candles.filter(candle => calendarDate.format(new Date(candle.time * 1000)) !== candle.sessionDate);
  assert.deepEqual(relabelled.slice(0, 3).map(candle => `${candle.sessionDate} shown as ${calendarDate.format(new Date(candle.time * 1000))}`), [],
    `${relabelled.length} of ${history.candles.length} sessions would be labelled on another calendar day`);
});
