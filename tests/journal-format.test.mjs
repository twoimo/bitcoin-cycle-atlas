import test from 'node:test';
import assert from 'node:assert/strict';
import {decimal,percent,day,fromDay} from '../dist/ui/journal-format.js';

test('evaluation metrics keep four decimals, or two as a percentage',()=>{
  assert.equal(decimal(0.5),'0.5000');
  assert.equal(decimal(-1.23456),'-1.2346');
  assert.equal(percent(0.5),'50.00%');
  assert.equal(percent(-0.0123),'-1.23%');
});

test('a metric without a finite value is shown as not evaluated',()=>{
  for(const missing of [undefined,null,NaN,Infinity,'0.5']){
    assert.equal(decimal(missing),'미평가');
    assert.equal(percent(missing),'미평가');
  }
});

test('UTC day numbers round-trip calendar dates across month and year ends',()=>{
  assert.equal(day('1970-01-02'),1);
  assert.equal(fromDay(1),'1970-01-02');
  assert.equal(fromDay(day('2026-10-25')+180),'2027-04-23');
  assert.equal(fromDay(day('2024-02-28')+1),'2024-02-29');
});
