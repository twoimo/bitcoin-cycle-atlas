import test from 'node:test';
import assert from 'node:assert/strict';
import {chartUrlRange,readChartUrlState,writeChartUrlState} from '../dist/ui/chart-url-state.js';

test('native legacy span keys are input aliases; common span has priority after editing',()=>{
  for(const alias of ['eth-span','equity-span']){
    const input=new URLSearchParams(`symbol=MSTR&${alias}=1y&granularity=weekly&type=candles&axis=linear&treasury-scenario=stress`);
    const before=input.toString(),state=readChartUrlState(input,{spanAliases:[alias]});
    assert.equal(state.span,'1y');assert.equal(input.toString(),before,'reading never rewrites the supplied link');
    const query=writeChartUrlState(input,{...state,range:{start:'2025-01-06',end:'2026-01-05'}});
    assert.equal(query.get('span'),'1y');assert.equal(query.has(alias),false);
    assert.equal(query.get('symbol'),'MSTR');assert.equal(query.get('treasury-scenario'),'stress','model settings keep their source owner');
    input.set('span','6m');assert.equal(readChartUrlState(input,{spanAliases:[alias]}).span,'6m');
  }
});

test('daily and monthly links use the same real calendar and price-domain keys',()=>{
  for(const frequency of ['daily','weekly','monthly']){
    const state={frequency,chartType:'line',scale:'linear',start:'2025-01-01',end:'2026-10-01',autoScale:false,domain:{min:0,max:120},inverted:true,magnet:'weak'};
    const query=writeChartUrlState('symbol=HOUSING-SEOUL&region=seoul',state,{explicit:true});
    assert.equal(query.get('view-start'),state.start);assert.equal(query.get('view-end'),state.end);
    assert.equal(query.get('type'),'line');assert.equal(query.get('axis'),'linear');assert.equal(query.get('granularity'),frequency);
    assert.equal(query.get('region'),'seoul');assert.equal(query.get('axis-inverted'),'1');
    const restored=readChartUrlState(query,{frequencies:[frequency]});
    assert.deepEqual(restored.range,{start:state.start,end:state.end});assert.deepEqual(restored.priceDomain,{min:0,max:120});
    assert.equal(restored.invertScale,true);assert.equal(restored.magnet,'weak');
  }
});

test('native second ranges become daily dates while intraday links keep their validated unit',()=>{
  const start=Date.parse('2026-10-01T00:00:00Z')/1000,end=start+86400;
  assert.deepEqual(chartUrlRange({start,end},'daily'),{start:'2026-10-01',end:'2026-10-02'});
  const query=writeChartUrlState('symbol=ETHUSD',{frequency:'1h',chartType:'candles',scale:'log',range:{start,end}});
  assert.equal(query.get('view-start'),String(start));
  assert.deepEqual(readChartUrlState(query,{frequencies:['daily','1h']}).range,{start,end});
  assert.equal(chartUrlRange({start:start+1,end},'1h'),null,'misaligned seconds cannot become an intraday viewport');
  for(const range of [{start:'2026-02-30',end:'2026-03-15'},{start:'2026-11-01',end:'2026-10-01'},{start:'1700-01-01',end:'2026-10-01'},{start:Infinity,end:1}])assert.equal(chartUrlRange(range),null);
  assert.equal(readChartUrlState('axis=log&price-min=0&price-max=120').priceDomain,null);
});
