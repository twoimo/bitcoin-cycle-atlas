import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('retained historical gas source preserves original bytes, UTC dates and exact 28-day integer aggregation',async()=>{
  const root=new URL('../research-data/eth-economic-captures/20261026T134306Z-cadlabs-gas/',import.meta.url);
  const receipt=JSON.parse(await readFile(new URL('receipt.json',root),'utf8'));
  let csv;
  for(const entry of receipt.files){
    const bytes=await readFile(new URL(entry.retainedPath,root));
    assert.equal(bytes.length,entry.bytes);
    assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),entry.gitBlobSha);
    if(entry.retainedPath==='ether_gas_used.csv')csv=bytes;
  }
  const lines=csv.toString('utf8').trimEnd().split('\r\n');
  assert.equal(lines.shift(),'"Date(UTC)","UnixTimeStamp","Value"');
  let prior=null;
  const rows=lines.map(line=>{
    const match=/^"(\d{1,2})\/(\d{1,2})\/(\d{4})","(\d+)","(\d+)"$/.exec(line);
    assert.ok(match);
    const [,month,day,year,stamp,gas]=match,time=Date.UTC(Number(year),Number(month)-1,Number(day)),date=new Date(time);
    assert.equal(date.getUTCFullYear(),Number(year));assert.equal(date.getUTCMonth()+1,Number(month));assert.equal(date.getUTCDate(),Number(day));
    assert.equal(time/1000,Number(stamp));if(prior!==null)assert.equal(time-prior,86400000);prior=time;
    return {date:date.toISOString().slice(0,10),gas:BigInt(gas)};
  });
  assert.equal(rows.length,2182);assert.equal(rows[0].date,'2015-07-30');assert.equal(rows.at(-1).date,'2021-07-19');
  assert.equal(rows.slice(-28)[0].date,'2021-06-22');
  assert.equal(rows.slice(-28).reduce((sum,row)=>sum+row.gas,0n),2583387772249n);
  assert.equal(receipt.partialMetric.value,2583387772249);
  assert.equal(receipt.publishedAt,null);assert.equal(receipt.historicalCollectionProven,false);
  assert.equal(receipt.fullModelSnapshotReady,false);assert.equal(receipt.eligibleModelSnapshotCount,0);assert.deepEqual(receipt.modelSnapshots,[]);
  console.log('ETH_HISTORICAL_GAS_RECEIPT '+JSON.stringify({status:'PASS',source:receipt.repository,commit:receipt.commit,
    bytes:csv.length,sourceSha256:createHash('sha256').update(csv).digest('hex'),collectedAt:receipt.collectedAt,
    rows:rows.length,firstDate:rows[0].date,lastDate:rows.at(-1).date,partialMetric:receipt.partialMetric,fullModelSnapshotReady:false}));
});
