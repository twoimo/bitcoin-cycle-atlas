import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { syncChartChat } from '../dist/chart-chat.js';

function fixture() {
  globalThis.BroadcastChannel = class {
    addEventListener() {}
    postMessage() {}
    close() {}
  };
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => { store.set(key, String(value)); },
  };
  const { document } = parseHTML(`<html><body data-page="outlook" data-shell="chart">
    <div class="workspace"><aside class="workbench-rail"></aside></div>
  </body></html>`);
  const rail = document.querySelector('.workbench-rail');
  return { document, rail, store };
}

test('a stored open chat stays hidden while a center page owns the canvas and returns with the price chart', () => {
  const { document, rail, store } = fixture();
  store.set('atlas-chart-chat-open', '1');
  document.body.dataset.centerTool = 'market-us';
  syncChartChat(document, { chart: true, rail });
  const panel = document.getElementById('atlas-chart-chat');
  assert.equal(panel.hidden, true);
  assert.equal(store.get('atlas-chart-chat-open'), '1');
  delete document.body.dataset.centerTool;
  syncChartChat(document, { chart: true, rail });
  assert.equal(panel.hidden, false);
});

test('an explicit open on a center page stays open across a later shell sync', () => {
  const { document, rail } = fixture();
  document.body.dataset.centerTool = 'market-us';
  syncChartChat(document, { chart: true, rail });
  const panel = document.getElementById('atlas-chart-chat');
  panel.hidden = false;
  panel.dataset.chatHold = '1';
  syncChartChat(document, { chart: true, rail });
  assert.equal(panel.hidden, false);
});
