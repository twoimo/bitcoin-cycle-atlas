import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountChartIntervals} from '../dist/chart-intervals.js';

function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

test('the interval menu selects a supported bar and refuses a month', () => {
  const {document} = parseHTML('<div id="host"></div>');
  const commands = [];
  const view = mountChartIntervals({ host: document.getElementById('host'), command: (action, value) => commands.push([action, value]), storage: memory(), doc: document });
  assert.equal(document.querySelector('.chart-interval-current').textContent, '일');
  document.querySelector('.chart-interval-more').click();
  const month = [...document.querySelectorAll('[role="menuitemradio"]')].find(node => node.textContent === '1개월');
  assert.equal(month.disabled, true);
  assert.match(month.title, /1주/);
  const week = [...document.querySelectorAll('[role="menuitemradio"]')].find(node => node.textContent === '1주');
  week.click();
  assert.deepEqual(commands, [['frequency', 'weekly']]);
  view.sync('weekly');
  assert.equal(document.querySelector('.chart-interval-current').textContent, '주');
  view.destroy();
  assert.equal(document.querySelector('.chart-intervals'), null);
});
