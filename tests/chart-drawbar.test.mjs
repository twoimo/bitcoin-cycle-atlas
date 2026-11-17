import assert from 'node:assert/strict';
import test from 'node:test';
import { DRAW_GROUPS, drawToolCount, fibRetracement, lineThrough, pitchforkGuide, projectPoint, toolById, unprojectPoint } from '../dist/chart-drawbar.js';

const labels = DRAW_GROUPS.flatMap(group => group.tools.map(tool => tool.label));

test('the drawing rail keeps the measured funnest tool groups', () => {
  assert.deepEqual(DRAW_GROUPS.map(group => group.tools.length), [6, 6, 4, 15, 3, 14, 7, 7, 7, 11]);
  assert.equal(drawToolCount(), 80);
  for (const label of ['십자', '지우개', '추세선', '연장선', '수평선', '피보나치 되돌림', '갠 팬', '피치포크', 'XABCD 패턴', '엘리어트 충격 파동', '텍스트', '화살표 마커', '사각형', '롱 포지션', '고정 VWAP', '날짜 및 가격 범위']) {
    assert.ok(labels.includes(label), label);
  }
  assert.equal(toolById('fib').points, 2);
  assert.equal(toolById('pitchfork').points, 3);
  assert.equal(toolById('xabcd').points, 5);
  assert.equal(toolById('polygon').points, -2);
  assert.equal(toolById('brush').points, -1);
});

test('fibonacci retracement places 0 at the second price and 1 at the first', () => {
  const levels = fibRetracement({price: 100}, {price: 200});
  assert.deepEqual(levels.map(level => level.ratio), [0, .236, .382, .5, .618, .786, 1]);
  assert.equal(levels.find(level => level.ratio === 0).price, 200);
  assert.equal(levels.find(level => level.ratio === 1).price, 100);
  assert.equal(levels.find(level => level.ratio === .5).price, 150);
});

test('pitchfork guides move the handle for the schiff variants', () => {
  const points = [{day: 0, price: 100}, {day: 10, price: 80}, {day: 10, price: 140}];
  assert.equal(pitchforkGuide(points).origin.price, 100);
  assert.equal(pitchforkGuide(points).mid.price, 110);
  assert.equal(pitchforkGuide(points, 'schiff').origin.price, 90);
  assert.equal(pitchforkGuide(points, 'modified-schiff').origin.price, 105);
  assert.equal(pitchforkGuide(points, 'modified-schiff').origin.day, 5);
});

test('plot coordinates round-trip and lines stay inside the price pane', () => {
  const scale = {left: 100, right: 900, top: 40, bottom: 400, min: 100, max: 200, start: '2020-01-01', end: '2020-01-11', log: false, inverted: false};
  const day = Date.parse('2020-01-06T00:00:00Z') / 86400000;
  const pixel = projectPoint({day, price: 150}, scale);
  const back = unprojectPoint(pixel.x, pixel.y, scale);
  assert.ok(Math.abs(back.day - day) < 1e-6);
  assert.ok(Math.abs(back.price - 150) < 1e-6);
  const box = {left: 0, right: 100, top: 0, bottom: 100};
  const segment = lineThrough({x: 10, y: 20}, {x: 40, y: 20}, box, 'segment');
  assert.deepEqual(segment, [{x: 10, y: 20}, {x: 40, y: 20}]);
  const ray = lineThrough({x: 10, y: 20}, {x: 40, y: 20}, box, 'ray');
  assert.equal(ray[0].x, 10);
  assert.ok(ray[1].x > 90);
});
