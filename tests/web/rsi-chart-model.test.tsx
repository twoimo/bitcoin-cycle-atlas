import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRsiSeries } from '@atlas/domain/market-lab';
import { yahooRsiBars,validateRsiBars,weeklyRsiBars,weeklyRsiPrices,type RsiBar } from '@atlas/domain/rsi-bars';
import { initialChartView,applyChartCommand,chartGeometry,day,boundedDates,nearestPoint } from '../../apps/web/src/rsi-chart-model.js';
import type { Point } from '@atlas/contracts/market-lab';
import { createPriceScale } from '../../dist/chart-math.js';
const prices:Point[]=Array.from({length:180},(_,i)=>[new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),10+i/10+Math.sin(i/4)]);
const bars:RsiBar[]=prices.map(([date,close])=>[date,close*.99,close*1.02,close*.98,close,100]);
test('zoom preserves its anchor, pan has a stable span, fit restores source dates and raw indicators never change',()=>{
  const before=structuredClone(prices),rsi=calculateRsiSeries(prices),initial=initialChartView(prices),zoomed=applyChartCommand(initial,prices,'zoom',.5);
  assert(day(zoomed.end)-day(zoomed.start)<day(initial.end)-day(initial.start));
  assert.equal(zoomed.end,initial.end,'default zoom keeps the right edge fixed');
  const past=applyChartCommand(zoomed,prices,'pan',-.25);assert(past.start<zoomed.start);assert.equal(day(past.end)-day(past.start),day(zoomed.end)-day(zoomed.start));
  const restored=applyChartCommand(past,prices,'fit');assert.equal(restored.start,initial.start);assert.equal(restored.end,initial.end);
  assert.deepEqual(prices,before);assert.deepEqual(calculateRsiSeries(prices),rsi);
  assert.throws(()=>boundedDates(prices,'invalid','2025-01-01'));assert.equal(nearestPoint(prices,'2025-01-10'),9);
});
test('log/linear and inverted price axes round trip measured values; OHLC auto-fit uses only the visible period',()=>{
  const rows=calculateRsiSeries(prices),view=applyChartCommand(initialChartView(prices),prices,'span',30);
  for(const scale of ['linear','log'] as const)for(const inverted of [false,true]){
    const g=chartGeometry(prices,bars,rows,{...view,scale,inverted},1000,600);
    for(const p of g.visible)assert(Math.abs(g.fromY(g.y(p[1]))/p[1]-1)<1e-12);
    assert(g.x(view.start)<g.x(view.end));assert(g.rsiY(100)<g.rsiY(0));
  }
  const altered=structuredClone(bars);altered[0][2]=10000;
  const g=chartGeometry(prices,altered,rows,{...view,chartType:'candles'},900,500);assert(g.max<10000,'an offscreen high must not flatten the visible chart');
  const outside=applyChartCommand(initialChartView(prices),prices,'pan',2),empty=chartGeometry(prices,bars,rows,outside,900,500);assert.equal(empty.visible.length,0);assert.equal(empty.visibleBars.length,0);
});
test('weekly OHLC preserves actual first open, high/low extremes, final close and volume, including incomplete periods',()=>{
  const quotes:Point[]=[['2025-01-06',10],['2025-01-07',12],['2025-01-10',11],['2025-01-13',13]];
  const input:RsiBar[]=[['2025-01-06',9,11,8,10,100],['2025-01-07',10,14,9,12,200],['2025-01-10',12,13,10,11,300],['2025-01-13',11,15,10,13,null]];
  assert.deepEqual(weeklyRsiPrices(quotes),[['2025-01-10',11],['2025-01-13',13]]);
  assert.deepEqual(weeklyRsiBars(input),[['2025-01-10',9,14,8,11,600],['2025-01-13',11,15,10,13,null]]);
  assert.deepEqual(validateRsiBars(input,quotes),input);
  for(const index of [1,2,3,4]){const bad=structuredClone(input);bad[0][index]=-1;assert.throws(()=>validateRsiBars(bad,quotes));}
  const mismatch=structuredClone(input);mismatch[0][4]=10.00001;assert.throws(()=>validateRsiBars(mismatch,quotes));
  const missing=structuredClone(input);missing[0][5]=null;assert.equal(weeklyRsiBars(missing)[0][5],null,'a missing volume is never a fabricated zero');
});

test('short workspaces keep both panes inside their pixel canvas and use the common price scale',()=>{
  const rows=calculateRsiSeries(prices),view={...initialChartView(prices),chartType:'candles' as const};
  for(const height of [100,180,279,520])for(const width of [230,900]){
    const g=chartGeometry(prices,bars,rows,view,width,height);
    assert(g.top<g.priceBottom&&g.priceBottom<g.rsiTop&&g.rsiTop<g.bottom&&g.bottom<height);
    const axis=createPriceScale(bars.flatMap(bar=>[bar[2],bar[3]]),{scale:view.scale,top:g.top,bottom:g.priceBottom,
      tickCount:Math.max(2,Math.min(width<600?5:7,Math.floor((g.priceBottom-g.top)/38)+1))});
    assert.equal(g.min,axis.min);assert.equal(g.max,axis.max);assert.deepEqual(g.ticks,axis.ticks);
  }
});

test('switching daily and weekly preserves the manual price domain and UTC window',()=>{
  const initial={...initialChartView(prices),autoScale:false,domain:{min:15,max:25}};
  const weekly=applyChartCommand(initial,prices,'frequency','weekly');
  assert.deepEqual(weekly.domain,initial.domain);assert.equal(weekly.autoScale,false);
  assert.equal(weekly.start,initial.start);assert.equal(weekly.end,initial.end);
  const zoomed=applyChartCommand(weekly,prices,'zoom',.01,800);
  assert.equal(zoomed.end,weekly.end);assert(day(zoomed.end)-day(zoomed.start)>=12*7,'weekly candles use the same pixel spacing budget');
});

test('narrow full-history zoom is reversible through reconstructed React viewport state',()=>{
  const history:Point[]=[['2020-01-01',100],['2026-11-07',200]],initial=initialChartView(history);
  const inward=applyChartCommand(initial,history,'zoom',Math.exp(-.24),250);
  const outward=applyChartCommand(inward,history,'zoom',Math.exp(.4),250);
  assert(day(inward.end)-day(inward.start)<day(initial.end)-day(initial.start));
  assert.equal(outward.start,initial.start);assert.equal(outward.end,initial.end);
  assert.equal(outward.spacingBounds?.maxSpan,2503);
  assert.deepEqual(history,[['2020-01-01',100],['2026-11-07',200]]);
});

test('OHLC enrichment rejects a wrong provider identity or exchange clock and omits mismatches and unfinished days',()=>{
  const market={id:'tqqq',symbol:'TQQQ',name:'TQQQ',region:'us' as const,unit:'USD',sourceId:'tqqq',timezone:'America/New_York',prices:[['2025-01-06',10],['2025-01-07',12],['2025-01-08',13]] as Point[]};
  const payload={chart:{result:[{meta:{symbol:'TQQQ',currency:'USD',dataGranularity:'1d',exchangeTimezoneName:'America/New_York'},timestamp:['2025-01-06T21:00:00Z','2025-01-07T21:00:00Z','2025-01-08T21:00:00Z'].map(t=>Date.parse(t)/1000),indicators:{quote:[{open:[9,10,12],high:[11,14,15],low:[8,9,10],close:[10,12.01,13],volume:[100,null,300]}]}}],error:null}};
  assert.deepEqual(yahooRsiBars(payload,market,{now:new Date('2025-01-08T23:00:00Z')}),{bars:[['2025-01-06',9,11,8,10,100]],omitted:['2025-01-07'],timezone:'America/New_York'});
  for(const patch of [{symbol:'SOXL'},{currency:'KRW'},{dataGranularity:'1h'},{exchangeTimezoneName:'Asia/Seoul'},{exchangeTimezoneName:''}]){
    const bad=structuredClone(payload);Object.assign(bad.chart.result[0].meta,patch);assert.throws(()=>yahooRsiBars(bad,market));
  }
});
