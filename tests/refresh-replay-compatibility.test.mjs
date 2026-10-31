import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import {parseReplayPriceArchive} from '../dist/forecast-replay-sources.js';
import {createCurrentChartReplaySession,buildReplayChartData,createHistoricalReplaySession} from '../dist/forecast-replay.js';
import {parseProjectReplayBaseline} from '../dist/project-replay-baseline.js';
const data=path=>readFile(new URL('../dist/data/'+path,import.meta.url),'utf8');
test('mutable BTC replay observations use their real acquisition clock; future acquisition is still rejected',async()=>{
  const text=await data('btc-volume.json'),payload=JSON.parse(text),clock=Date.parse(payload.retrievedAt);
  const archive=await parseBitcoinReplayCandles(text,{now:clock});
  assert.equal(archive.observedThrough,payload.coverage.lastDate);
  await assert.rejects(parseBitcoinReplayCandles(text,{now:clock-1}),/acquisition is later/);
  const old=await parseProjectReplayBaseline(await data('project-origin-btc-2026-10-21.json'));
  const session=await createCurrentChartReplaySession({...archive,dataset:old.dataset,forecast:old.forecast,asOf:'2026-10-20',playbackStartDate:'2026-10-21',createdAt:'2026-10-26T23:00:00Z',evaluatedAt:new Date(Math.max(clock,Date.parse('2026-10-26T23:00:00Z'))).toISOString()});
  const last=buildReplayChartData(session,{cursorDate:archive.observedThrough,frequency:'weekly'});
  assert.equal(last.observedCandles.at(-1).close,archive.observations.at(-1).close);
  assert.equal(last.frame.policy.forecastScoringEnabled,false);
  assert.deepEqual(session.chartForecast.path,old.forecast.path);
});
test('mutable ETH replay integration uses an observed date and its actual acquisition, not a fixed historical clock',async()=>{
  const archive=await parseReplayPriceArchive('ETHUSD',await data('eth-ohlc.json'));
  const session=await createHistoricalReplaySession({...archive,asOf:archive.observedThrough,horizonDays:30,generatedAt:archive.observedAt,modelKey:'pooled'});
  assert.equal(session.training.informationThrough,archive.observedThrough);
  assert.ok(session.forecast.length>0);
});
test('fixed historical fixtures remain byte-bound independently of any published refresh',async()=>{
  const btc=await parseBitcoinReplayCandles(await frozenMarketText('btc-volume'),{now:Date.parse('2026-10-31T00:00:00Z')});
  assert.equal(btc.observedThrough,'2026-10-25');
  const eth=await parseReplayPriceArchive('ETHUSD',await frozenMarketText('eth-ohlc'));
  assert.ok(eth.observations.some(row=>row.date==='2026-04-28'));
});
