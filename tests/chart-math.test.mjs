import assert from 'node:assert/strict';
import test from 'node:test';
import { createPriceScale,nearestDailyIndex } from '../dist/chart-math.js';
import { utcDay } from '../dist/cycle-engine.js';

const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)),`${actual} ≈ ${expected}`);

test('linear prices have equal additive distances; log prices have equal ratio distances',()=>{
  const linear=createPriceScale([10,100,1000],{scale:'linear',top:50,bottom:450});
  const log=createPriceScale([10,100,1000],{scale:'log',top:50,bottom:450});
  close(linear.y(100)-linear.y(200),linear.y(200)-linear.y(300));
  close(log.y(10)-log.y(100),log.y(100)-log.y(1000));
  assert.notEqual(linear.y(100),log.y(100));
  for(const axis of [linear,log]){
    close(axis.y(axis.min),450);close(axis.y(axis.max),50);
    for(const price of [10,23.75,100,1000])close(axis.invert(axis.y(price)),price);
  }
});

test('automatic domains include visible prices and bands, including a flat history',()=>{
  for(const scale of ['log','linear']){
    const flat=createPriceScale([100,100],{scale});
    assert.ok(flat.min<100&&flat.max>100);assert.ok(Number.isFinite(flat.y(100)));
    const band=createPriceScale([50,80,120,175],{scale});
    assert.ok(band.min<=50&&band.max>=175);
    const focused=createPriceScale([90,100,110],{scale});
    assert.ok(focused.max<band.max&&focused.min>band.min);
  }
  assert.throws(()=>createPriceScale([0,NaN,-3]),RangeError);
  assert.throws(()=>createPriceScale([100],{scale:'unknown'}),RangeError);
});

test('linear tick spacing is uniform and indexed units do not change price geometry',()=>{
  const usd=createPriceScale([59000,63000],{scale:'linear',top:10,bottom:310,tickCount:6});
  const indexed=createPriceScale([59000,63000],{scale:'linear',top:10,bottom:310,tickCount:6,factor:100/60000});
  for(const axis of [usd,indexed]){
    assert.ok(axis.ticks.length>=2&&axis.ticks.length<=6);
    const step=axis.ticks[1]-axis.ticks[0];
    axis.ticks.slice(1).forEach((tick,i)=>close(tick-axis.ticks[i],step));
    assert.ok(axis.ticks.every(tick=>tick>=axis.min&&tick<=axis.max));
  }
  for(const price of [59000,60000,63000])close(usd.y(price),indexed.y(price));
});

const daily=[
  {date:'2024-02-27',price:100},
  {date:'2024-02-28',price:120},
  {date:'2024-02-29',price:90},
  {date:'2024-03-01',price:150},
  {date:'2024-03-02',price:180}
];

test('nearest daily index snaps to the closest UTC day across leap day',()=>{
  assert.equal(nearestDailyIndex(daily,utcDay('2024-02-29')+.2),2);
});

test('nearest daily index is -1 for an empty series',()=>{
  assert.equal(nearestDailyIndex([],0),-1);
});

test('intraday log axis fits a narrow price range without hiding movement',()=>{
  const axis=createPriceScale([80000,80100],{scale:'log',top:50,bottom:350,paddingRatio:.12});
  assert.ok(axis.min<80000&&axis.min>79900);assert.ok(axis.max>80100&&axis.max<80200);
  assert.ok(axis.ticks.length>=2);assert.ok(axis.y(80000)-axis.y(80100)>180);
  assert.throws(()=>createPriceScale([80000],{paddingRatio:-1}),RangeError);
});
