import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {recordedSourcePins,assertRecordedSources} from '../scripts/recorded-source-pins.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));

test('every file a committed ETH or forecast record pins still has its recorded bytes',async()=>{
  const pins=await recordedSourcePins(root);
  assert.ok(pins.some(pin=>pin.path==='dist/eth-market-data.js'),'issued ETH prospective records are read');
  assert.ok(pins.some(pin=>pin.recordPath==='dist/data/forecast-ledger/experiments.json'),'the forecast experiment ledger is read');
  await assertRecordedSources(root);
});
