import test from 'node:test';
import assert from 'node:assert/strict';
import {assertNativeObservedEvidence,assertNativeOverlayEvidence} from '../scripts/funnest-browser-evidence.mjs';

const series={candles:[{time:1700000000,open:10,high:12,low:9,close:11,volume:7},{time:1700172800,open:11,high:14,low:10,close:13,volume:0}]};
const bars=series.candles.map(row=>({...row,time:row.time*1000}));
function fixture(){return {snapshot:{engine:'funnest',version:'0.6.22',painted:true,sourceMode:'ohlc',timeUnit:'UTC milliseconds',currency:'USD',symbol:'ETH-USD',chartType:'line',legacy:{priceNodes:0},observations:structuredClone(bars),engineBars:structuredClone(bars),range:{from:bars[0].time,to:bars[1].time}},mainBounds:{width:100,height:100},ink:{readable:true,mainPixels:20}};}
function overlay(){const segment=dash=>({from:{x:1,y:2},to:{x:3,y:4},color:'#123456',width:1.8,dash});return {engine:'funnest',coordinatesSource:'painter.line arguments',rendered:true,sequence:1,forecastInput:{present:true,pathRows:2},forecastSegments:{count:1,coordinates:[segment([7,5])]},baselineInput:{present:true,pathRows:2},baselineSegments:{count:1,coordinates:[segment([2,4])]}};}

test('native browser evidence compares every actual OHLCV and preserves source gaps and zero volume',()=>{
  const result=assertNativeObservedEvidence(fixture(),series,{symbol:'ETH-USD'});
  assert.equal(result.snapshot.observedCount,2);assert.equal(result.snapshot.engineBarCount,2);
  assert.equal(result.snapshot.lastObservation.volume,0);assert.equal(result.snapshot.lastObservation.time-result.snapshot.firstObservation.time,172800000);
  assert.equal(result.snapshot.observations,undefined);assert.match(result.snapshot.observationsSha256,/^[a-f0-9]{64}$/);
});
test('native browser evidence rejects changed prices, invented gaps, fake paint, wrong type and hidden legacy renderers',()=>{
  const mutations=[e=>e.snapshot.observations[0].close++,e=>e.snapshot.engineBars[1].volume=1,e=>e.snapshot.engineBars.splice(1,0,{...bars[0],time:bars[0].time+86400000}),e=>e.snapshot.painted=false,e=>e.snapshot.legacy.priceNodes=1,e=>e.snapshot.chartType='candles',e=>e.ink.readable=false,e=>e.ink.mainPixels=0,e=>e.snapshot.range.to=NaN];
  for(const mutate of mutations){const value=fixture();mutate(value);assert.throws(()=>assertNativeObservedEvidence(value,series,{symbol:'ETH-USD'}));}
});
test('overlay evidence validates actual painter coordinates and distinct dashed path semantics',()=>{
  const value=assertNativeOverlayEvidence(overlay(),{forecast:true,baseline:true});
  assert.equal(value.forecast.segments,1);assert.ok(value.forecast.length>0);assert.deepEqual(value.forecast.dash,[7,5]);assert.deepEqual(value.baseline.dash,[2,4]);
  assert.match(value.baseline.coordinatesSha256,/^[a-f0-9]{64}$/);
});
test('overlay evidence rejects stale absence, missing segments, invalid geometry and lost distinctions',()=>{
  const mutations=[o=>o.rendered=false,o=>o.forecastInput.present=false,o=>o.forecastSegments.count=0,o=>o.forecastSegments.coordinates[0].from.x=NaN,o=>o.baselineSegments.coordinates[0].dash=[7,5],o=>o.forecastSegments.coordinates[0].width=0,o=>o.forecastSegments.coordinates[0].to={x:1,y:2}];
  for(const mutate of mutations){const value=overlay();mutate(value);assert.throws(()=>assertNativeOverlayEvidence(value,{forecast:true,baseline:true}));}
});
test('blocked forecast is accepted only after real overlay render records no input and no painted segments',()=>{
  const value=overlay();for(const kind of ['forecast','baseline']){value[kind+'Input']={present:false,pathRows:0};value[kind+'Segments']={count:0,coordinates:[]};}
  assert.equal(assertNativeOverlayEvidence(value,{forecast:false,baseline:false}).forecast.segments,0);
  value.forecastSegments.coordinates.push(overlay().forecastSegments.coordinates[0]);value.forecastSegments.count=1;
  assert.throws(()=>assertNativeOverlayEvidence(value,{forecast:false,baseline:false}));
});


test('native legend oracle uses painted Funnest CSS geometry without weakening the 42% limit',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../scripts/verify-eth-candidate-browser.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function verifyNativeCommonLegend('),end=source.indexOf('\nasync function ',start+1),verifier=source.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(verifier,/native\.layout\.plotWidth\*host\.getBoundingClientRect\(\)\.width\/native\.layout\.width/);
  assert.match(verifier,/!native\?\.painted/);
  assert.match(verifier,/native\.legacy\?\.priceNodes!==0/);
  assert.match(verifier,/Number\.isFinite\(state\.priceWidth\)&&state\.priceWidth>0/);
  assert.match(verifier,/state\.dock\.width<=state\.priceWidth\*\.42\+1/);
  assert.doesNotMatch(verifier,/svg\.dataset\.plot(?:Right|Left)/);
});

test('browser source identity binds the actual export, disclosure, and served stylesheet bytes',async()=>{
  const {readBrowserSourceIdentity}=await import('../scripts/browser-source-identity.mjs');
  const {readFile}=await import('node:fs/promises');const {fileURLToPath}=await import('node:url');const {createHash}=await import('node:crypto');
  const root=fileURLToPath(new URL('../',import.meta.url)),identity=await readBrowserSourceIdentity(root);
  for(const file of ['dist/chart-export.js','dist/chart-export-workbench.js','dist/research-workbench.js','dist/site-before-shell.css','dist/site-after-shell.css']){
    const digest=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
    assert.equal(identity.sourceHashes[file],digest,file+' must be included in before/after source integrity');
  }
});
