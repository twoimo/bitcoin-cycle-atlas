import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeHousing,housingRows,validateHousing,monthAfter,correlation } from '@atlas/domain/housing';
import { housingIdentity } from '../../apps/api/src/housing-repository.js';
import { loadHousing } from '../../apps/web/src/housing-loader.js';
const snapshot=JSON.parse(await readFile(new URL('../../dist/data/housing.json',import.meta.url),'utf8'));
const options={region:'busan',window:36,band:10,lag:2,start:'2006-01',end:'2026-09'};
test('housing: official observed values, index base and declared reporting clocks',()=>{
  const d=validateHousing(snapshot);assert.equal(d.regions.length,4);assert.match(d.indexBase,/2026.06/);
  const busan=d.regions.find(r=>r.id==='busan')!;assert.deepEqual(busan.volume.at(-1),['2026-09',2395]);assert.deepEqual(busan.price.at(-1),['2026-08',100]);
  assert.equal(d.volumeBasis,'report-month');assert.equal(d.priceBasis,'contract-month');
});
test('housing: prior-only mean, current spikes and future perturbations cannot change earlier states',()=>{
  const region=structuredClone(snapshot.regions[0]);const before=housingRows(region,36,10);region.volume[100][1]*=100;region.volume[120][1]*=10;
  const after=housingRows(region,36,10);assert.deepEqual(before.slice(0,100),after.slice(0,100));assert.equal(before[100].average,after[100].average);
  assert.equal(before[35].state,'warmup');assert.notEqual(before[36].state,'warmup');
});
test('housing: exact neutral boundaries, missing calendar months, zero and absent price are distinct',()=>{
  const r={id:'synthetic',label:'검사',code:'1',volume:Array.from({length:15},(_,i)=>[monthAfter('2020-01',i),100] as [string,number]),price:[['2020-01',100],['2020-02',100]] as [string,number][]};
  r.volume[12][1]=110;assert.equal(housingRows(r,12,10)[12].state,'neutral');r.volume[12][1]=90;assert.equal(housingRows(r,12,10)[12].state,'neutral');r.volume[12][1]=111;assert.equal(housingRows(r,12,10)[12].state,'above');
  const gap=structuredClone(r);gap.volume.splice(3,1);assert.equal(housingRows(gap,12,10).find(v=>v.month==='2021-01')!.average,null);
  r.volume[12][1]=0;const zero=housingRows(r,12,10).find(v=>v.month==='2021-01')!;assert.equal(zero.volume,0);assert.equal(zero.price,null);assert.equal(zero.state,'below');
});
test('housing: malformed/duplicate/future observations and invalid analysis options reject',()=>{
  for(const change of [(d:any)=>d.regions[0].volume.push(d.regions[0].volume.at(-1)),(d:any)=>d.regions[0].price[0][1]=0,(d:any)=>d.regions[0].volume[0][1]=null,(d:any)=>d.regions[0].volume.push(['2099-01',1])]){const d=structuredClone(snapshot);change(d);assert.throws(()=>validateHousing(d));}
  for(const opts of [{...options,window:24},{...options,start:'2026-12',end:'2020-01'},{...options,band:9},{...options,lag:-1}])assert.throws(()=>analyzeHousing(snapshot,opts));
  assert.equal(correlation([[1,2],[1,3],[1,4]]).r,null);
});
test('housing: lagged exact calendar outcomes, incomplete tails, denominators and non-overlap',()=>{
  const a=analyzeHousing(snapshot,options),prices=new Map(snapshot.regions[0].price as [string,number][]);
  for(const b of a.backtests){assert.equal(b.groups.reduce((s,g)=>s+g.n,0)+b.excluded,b.eligible);
    for(const o of b.outcomes){assert.equal(o.entry,monthAfter(o.month,2));assert.equal(o.exit,monthAfter(o.entry,b.horizon));assert(o.exit<='2026-08');assert.equal(o.change,100*(prices.get(o.exit)!/prices.get(o.entry)!-1));}
    for(const g of b.groups){assert.equal(g.up+g.down+g.flat,g.n);assert.equal(g.hit,g.direction==='up'?g.up:g.down);assert(g.nonOverlapping.n<=g.n);}
  }
  assert.equal(a.rows.at(-1)!.price,null);assert(a.backtests.every(b=>b.excluded>=b.horizon+2));
});
test('housing: loader validates digest, saved fallback, failed data and cancellation',async()=>{
  const {revision}=housingIdentity(snapshot),json=(d:unknown,status=200)=>new Response(JSON.stringify(d),{status}),abort=new AbortController();
  const api=await loadHousing(abort.signal,async()=>json({schemaVersion:1,revision,snapshot}));assert.equal(api.kind,'api');
  const saved=await loadHousing(abort.signal,async url=>String(url).startsWith('/api')?json({schemaVersion:1,revision:'0'.repeat(64),snapshot}):json(snapshot));assert.equal(saved.kind,'saved');
  await assert.rejects(loadHousing(abort.signal,async()=>json({},503)));
  abort.abort();let calls=0;await assert.rejects(loadHousing(abort.signal,async()=>{calls++;throw abort.signal.reason;}));assert.equal(calls,1);
});
