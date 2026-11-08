import test from 'node:test';
import assert from 'node:assert/strict';
import {applyChartUrlView,initialChartUrlView,persistStandaloneChartUrl} from '../../apps/web/src/chart-url-state.js';
import {initialChartView} from '../../apps/web/src/rsi-chart-model.js';

test('hosted instruments restore common display keys while retaining source capabilities',()=>{
  const base=initialChartView([['2025-01-01',100],['2026-10-01',120]]);
  const params=new URLSearchParams('granularity=weekly&type=candles&axis=linear&view-start=2025-07-01&view-end=2026-07-01&price-min=0&price-max=150&axis-inverted=1&magnet=strong');
  const restored=applyChartUrlView(base,params,{frequencies:['daily','weekly'],candles:true});
  assert.equal(restored.frequency,'weekly');assert.equal(restored.chartType,'candles');assert.equal(restored.scale,'linear');
  assert.equal(restored.start,'2025-07-01');assert.equal(restored.end,'2026-07-01');assert.equal(restored.selected,'2026-07-01');
  assert.deepEqual(restored.domain,{min:0,max:150});assert.equal(restored.autoScale,false);assert.equal(restored.inverted,true);
  const monthly={...base,frequency:'monthly' as const,scale:'linear' as const};
  const housing=applyChartUrlView(monthly,params,{frequencies:['monthly'],candles:false});
  assert.equal(housing.frequency,'monthly','a weekly URL cannot manufacture weekly housing observations');
  assert.equal(housing.chartType,'line','a candles URL cannot manufacture housing OHLC');
  assert.deepEqual(applyChartUrlView(monthly,new URLSearchParams(),{frequencies:['monthly'],candles:false}),monthly);
});

test('URL restoration and embedded chart updates do not write the first-entry URL or a journal',t=>{
  const old=new Map(['window','location','history'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const location={origin:'https://atlas.test',pathname:'/market-lab/app/',search:'?embedded=1&symbol=TQQQ',hash:''};
  const parentLocation={...location,pathname:'/market-lab/charts/',search:'?symbol=TQQQ&axis=linear&type=candles'};
  let writes=0;
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location,parent:{location:parentLocation}}});
  Object.defineProperty(globalThis,'location',{configurable:true,value:location});
  Object.defineProperty(globalThis,'history',{configurable:true,value:{state:null,replaceState(){writes++;}}});
  t.after(()=>{for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}});
  const base=initialChartView([['2025-01-01',100],['2026-10-01',120]]);
  const view=initialChartUrlView('TQQQ',base,{frequencies:['daily','weekly'],candles:true,embedded:true});
  assert.equal(view.scale,'linear');assert.equal(view.chartType,'candles');assert.equal(writes,0);
  assert.deepEqual(initialChartUrlView('SOXL',base,{frequencies:['daily','weekly'],candles:true,embedded:true}),base,'a stale frame cannot restore another symbol URL');
  persistStandaloneChartUrl('TQQQ',{...view,scale:'log'},true);assert.equal(writes,0,'the parent remains the only embedded URL writer');
  parentLocation.origin='https://different.test';
  assert.deepEqual(initialChartUrlView('TQQQ',base,{frequencies:['daily','weekly'],candles:true,embedded:true}),base,'cross-origin state is never read');
});
