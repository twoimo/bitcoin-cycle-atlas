import { readFile,writeFile } from 'node:fs/promises';
import { analyzeHousing } from '@atlas/domain/housing';
const snapshot=JSON.parse(await readFile(new URL('../dist/data/housing.json',import.meta.url),'utf8'));
const results=[];
for(const region of snapshot.regions)for(const window of [12,36,60])for(const band of [0,5,10,20])for(const lag of [0,1,2,3])results.push(analyzeHousing(snapshot,{region:region.id,window,band,lag,start:'2006-01',end:'2026-09'}));
await writeFile(new URL('../build/housing-research/numerical-grid.json',import.meta.url),JSON.stringify(results));
const defaults=results.filter(r=>r.options.window===36&&r.options.band===10&&r.options.lag===2);
await writeFile(new URL('../build/housing-research/default-results.json',import.meta.url),JSON.stringify(defaults.map(r=>({region:r.region,options:r.options,correlations:r.relations,latest:r.rows.at(-1),backtests:r.backtests.map(({outcomes,...b})=>b)})),null,2));
console.log(JSON.stringify({combinations:results.length,regions:defaults.map(r=>({region:r.region,correlation:r.relations.deviation,threeMonths:r.backtests[1].groups.filter(g=>g.state!=='neutral').map(g=>({state:g.state,n:g.n,hit:g.hit,rate:g.rate,baseline:g.baseline.rate,lift:g.lift,mean:g.mean}))}))}));
