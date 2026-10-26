import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createForecastComputation, browserForecastWorkerFactory } from '../dist/forecast-computation.js';
import { buildLongHorizonForecast } from '../dist/long-horizon-forecast.js';

const harness = () => {
  const workers = [], tasks = new Map(); let next = 0;
  const controller = createForecastComputation({ compute: (_data, options) => ({ scenario: options.scenario }), workerFactory: () => {
    const worker = { terminated: false, postMessage(message) { this.message = message; }, terminate() { this.terminated = true; }, reply(value) { this.onmessage({ data: { ...this.message, status: 'ready', model: value } }); } }; workers.push(worker); return worker;
  }, defer: action => { tasks.set(++next, action); return next; }, cancelDeferred: id => tasks.delete(id) });
  return { controller, workers, flush() { for (const [id, action] of tasks) { tasks.delete(id); action(); } } };
};

test('only the latest request and revision can publish; superseded computation terminates', async () => {
  const h = harness(); const a = h.controller.run([], { scenario: 'base' }, { revision: 1 });
  const b = h.controller.run([], { scenario: 'stress' }, { revision: 2 });
  assert.equal((await a).status, 'superseded'); assert.equal(h.workers[0].terminated, true);
  h.workers[0].reply('old');
  h.workers[1].onmessage({ data: { id: h.workers[1].message.id, revision: 1, status: 'ready', model: 'wrong revision' } });
  assert.equal(h.controller.pending(), true);
  h.workers[1].reply('new'); const result = await b;
  assert.equal(result.model, 'new'); assert.equal(result.revision, 2); assert.equal(h.controller.pending(), false);
  assert.equal(h.workers[1].terminated, true);
});

test('a worker failure uses the real fallback and cancellation removes a queued fallback', async () => {
  const h = harness(); const first = h.controller.run([], { scenario: 'base' });
  h.workers[0].onerror({ preventDefault() {} });
  const next = h.controller.run([], { scenario: 'stress' });
  h.flush(); assert.equal((await first).status, 'superseded'); assert.equal(h.controller.pending(), true);
  h.workers[1].onmessageerror(); h.flush();
  const result = await next; assert.equal(result.mode, 'main-thread-fallback'); assert.equal(result.model.scenario, 'stress');
});

test('calculation errors are explicit and are not relabeled successful fallbacks', async () => {
  const h = harness(); const pending = h.controller.run([], { scenario: 'base' });
  h.workers[0].onmessage({ data: { ...h.workers[0].message, status: 'error', error: 'invalid snapshot' } });
  const result = await pending; assert.equal(result.status, 'error'); assert.equal(result.error, 'invalid snapshot');
  assert.equal(result.mode, 'worker'); h.controller.destroy(); await assert.rejects(h.controller.run([], {}), /destroyed/);
});

test('offline fallback preserves the exact real model output and seed', async () => {
  const dataset = JSON.parse(await readFile(new URL('../dist/data/btc-daily.json', import.meta.url)));
  const options = { sampleCount: 16, seed: 20261022, scenario: 'stress' };
  const expected = buildLongHorizonForecast(dataset, options);
  const controller = createForecastComputation({ compute: buildLongHorizonForecast });
  const result = await controller.run(dataset, options, { revision: 3 });
  assert.equal(result.status, 'ready'); assert.equal(result.mode, 'main-thread-fallback'); assert.deepEqual(result.model, expected);
  assert.equal(browserForecastWorkerFactory(), undefined, 'Node has no browser worker transport');
});
