import test from 'node:test';
import assert from 'node:assert/strict';
import {ethHistoryRange,ethViewQuery} from '../dist/eth-view-state.js';

const first=Date.parse('2022-09-15T00:00:00Z')/1000,last=Date.parse('2026-10-23T00:00:00Z')/1000;
const series={interval:'daily',retrievedAt:'2026-10-24T00:00:00Z',candles:[{time:first},{time:last}]};
test('explicit ETH future horizon extends navigation without changing actual bar bounds',()=>{
  const observed=ethHistoryRange(series),future=ethHistoryRange(series,'4y',null,'2035-12-31');
  assert.equal(observed.max,last+86400);
  assert.equal(future.max,Date.parse('2036-01-01T00:00:00Z')/1000);
  assert.ok(future.end>last);
  assert.equal(future.end-future.start,1461*86400);
  assert.deepEqual(series.candles,[{time:first},{time:last}]);
  const moved={...future,start:last-100*86400,end:last+100*86400};
  const retained=ethHistoryRange(series,'4y',moved,'2035-12-31');
  assert.equal(retained.start,moved.start);assert.equal(retained.end,moved.end);
});
test('ETH forecast visibility and economic condition survive a shareable view URL',()=>{
  const query=new URLSearchParams(ethViewQuery({frequency:'daily',chartType:'line',scale:'log',span:'4y',forecastVisible:false,ethScenario:'stress'}));
  assert.equal(query.get('forecast'),'off');assert.equal(query.get('eth-scenario'),'stress');
  assert.equal(query.get('scenario'),null);
});
