import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp,mkdir,realpath,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createP2a0StaticServer,parseP2a0Arguments,p2a0Budgets,p2a0Network,p2a0Viewports,p2a0FeatureIds,p2a0KeyboardWidths,p2a0TouchIds,p2a0FinalStatus,validateP2a0Ready,validateP2a0Target} from '../scripts/verify-funnest-p2a0-browser.mjs';

// These are protocol, HTTP and negative-contract unit models. They are never
// native input/pixel/timing evidence and cannot close P2a-0 or replace Mac QA.
const clone=value=>structuredClone(value);
const box=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
const target=()=>({box:box(4,4,80,44),clip:box(4,4,80,44),painted:true,disabled:false,topmost:true,inside:true,outline:'solid',outlineWidth:2});
const oracle={sha256:'canonical-fixture-digest',times:[1000,2000,3000]};
function ready(){return {observer:{status:'ready',errors:[],source:{sha256:oracle.sha256},chart:{symbol:'BTCUSD',resolution:'1D',type:'candles',barCount:3,firstTime:1000,lastTime:3000},metrics:{initialPaintedReadyMs:2500}},canvas:{visible:true,width:300,height:400,paintedPixels:100},overflow:0};}
function completeModel(){const entry=id=>({id,status:'passed',attempted:true});return {sourceStable:true,failures:[],startup:p2a0Viewports.map(v=>entry(`${v.width}x${v.height}`)),features:p2a0FeatureIds.map(entry),keyboard:p2a0KeyboardWidths.map(w=>entry(String(w))),touch:p2a0TouchIds.map(entry)};}

test('P2a0 requires a fresh evidence destination without configurable acceptance thresholds',()=>{
  assert.throws(()=>parseP2a0Arguments([]),/NEW_DIRECTORY/);
  for(const args of [['--out'],['--out','--browser'],['--timeout','999999'],['--allow-unverified'],['--threshold','3000']])assert.throws(()=>parseP2a0Arguments(args));
  const options=parseP2a0Arguments(['--out','receipt','--site','site','--browser','chrome'],'/tmp/p2a0');
  assert.deepEqual(options,{out:'/tmp/p2a0/receipt',site:'/tmp/p2a0/site',bin:'/tmp/p2a0/chrome'});
  for(const out of ['site','site/evidence'])assert.throws(()=>parseP2a0Arguments(['--site','site','--out',out],'/tmp/p2a0'),/outside/);
  assert.equal(parseP2a0Arguments(['--help']).help,true);
});

test('fixed six-case Fast4G contract retains 2500/150ms, 44px, 2px, 4.5/3.0',()=>{
  assert.deepEqual(p2a0Viewports,[{width:390,height:844},{width:320,height:740},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900},{width:1920,height:1080}]);
  assert.deepEqual(p2a0Network,{offline:false,latency:165,downloadThroughput:1012500,uploadThroughput:168750,connectionType:'cellular4g'});
  assert.deepEqual(p2a0Budgets,{initialPaintedReadyMs:2500,pageTransitionMs:150,targetPx:44,focusRingPx:2,textContrast:4.5,iconContrast:3});
  assert.deepEqual(p2a0FeatureIds,['candles','log','percent','indicator-ma','drawing-trendline','symbol-search','korean-colors']);
  assert.deepEqual(p2a0KeyboardWidths,[320,390,768,1440]);assert.deepEqual(p2a0TouchIds,['pan-320','pinch-320','pan-390','pinch-390']);
});

test('zero native attempts remain unverified with exact required counts',()=>{
  const result=p2a0FinalStatus({sourceStable:true,failures:['Chromium launch blocked']});
  assert.equal(result.status,'unverified');assert.equal(result.qualifiesP2a0NativeVerification,false);assert.equal(result.complete,false);
  assert.deepEqual(result.counts,{startup:{required:6,attempted:0,passed:0,failed:0},features:{required:7,attempted:0,passed:0,failed:0},keyboard:{required:4,attempted:0,passed:0,failed:0},touch:{required:4,attempted:0,passed:0,failed:0}});
});

test('protocol model requires every unique native case and every attempted flag',()=>{
  assert.equal(p2a0FinalStatus(completeModel()).qualifiesP2a0NativeVerification,true);
  for(const group of ['startup','features','keyboard','touch'])for(const mutate of [rows=>rows.pop(),rows=>rows.push(clone(rows[0])),rows=>rows[0].id='substituted',rows=>rows[0].attempted=false]){
    const report=completeModel();mutate(report[group]);assert.equal(p2a0FinalStatus(report).qualifiesP2a0NativeVerification,false,group);
  }
});

test('actual case failure, unsupported/unverified observation, source drift and harness errors disqualify',()=>{
  for(const group of ['startup','features','keyboard','touch'])for(const status of ['failed','unverified']){
    const report=completeModel();report[group][0].status=status;const result=p2a0FinalStatus(report);
    assert.equal(result.qualifiesP2a0NativeVerification,false);assert.equal(result.complete,true,'complete coverage is independent from passing');
  }
  for(const mutate of [r=>r.failures.push('active network failure'),r=>delete r.failures,r=>r.sourceStable=false,r=>delete r.sourceStable]){const report=completeModel();mutate(report);assert.equal(p2a0FinalStatus(report).qualifiesP2a0NativeVerification,false);}
});

test('startup accepts the exact budget boundary but rejects slow or unmeasured paint',()=>{
  assert.deepEqual(validateP2a0Ready(ready(),oracle),[]);
  for(const value of [2500.001,null,undefined,NaN,0,-1]){const state=ready();state.observer.metrics.initialPaintedReadyMs=value;assert.ok(validateP2a0Ready(state,oracle).length,String(value));}
});

test('constructor readiness, blank positive-size canvas and stale source metadata are insufficient',()=>{
  for(const mutate of [s=>s.observer.status='loading',s=>s.observer.status='error',s=>s.observer.errors.push('datafeed error'),s=>delete s.observer.errors,s=>s.observer.source.sha256='other',s=>s.canvas.paintedPixels=0,s=>s.canvas.visible=false,s=>s.canvas.width=0,s=>s.overflow=1,s=>delete s.canvas]){
    const state=ready();mutate(state);assert.ok(validateP2a0Ready(state,oracle).length);
  }
});

test('actual candle identity, UTC data boundaries and contiguous count are required',()=>{
  for(const patch of [{symbol:'ETHUSD'},{resolution:'1W'},{type:'line'},{firstTime:1},{lastTime:3},{barCount:2},{barCount:0},{firstTime:3000,lastTime:1000}]){const state=ready();Object.assign(state.observer.chart,patch);assert.ok(validateP2a0Ready(state,oracle).length);}
  const partial=ready();Object.assign(partial.observer.chart,{firstTime:2000,lastTime:3000,barCount:2});assert.deepEqual(validateP2a0Ready(partial,oracle),[],'a real canonical paged slice remains legitimate');
});

test('native observer must preserve exact first/last OHLCV values, not only counts',()=>{
  const bars=[1000,2000,3000].map(time=>({time,open:10,high:12,low:9,close:11,volume:20}));
  const expected={...oracle,bars},state=ready();state.observer.chart.firstBar=clone(bars[0]);state.observer.chart.lastBar=clone(bars[2]);
  assert.deepEqual(validateP2a0Ready(state,expected),[]);
  for(const name of ['firstBar','lastBar'])for(const key of ['time','open','high','low','close','volume']){const altered=clone(state);altered.observer.chart[name][key]++;assert.ok(validateP2a0Ready(altered,expected).length,`${name}.${key}`);}
});

test('native target evidence rejects covering, clipping, disabled state and invalid geometry',()=>{
  assert.deepEqual(validateP2a0Target(target()),[]);
  for(const patch of [{painted:false},{disabled:true},{topmost:false},{clip:box(5,4,79,44)},{box:box(4,4,0,44)},{box:{...box(4,4,80,44),left:NaN}}])assert.ok(validateP2a0Target({...target(),...patch}).length);
  assert.ok(validateP2a0Target(null).length);
});

test('small upstream controls may be measured functionally but do not pass accessibility',()=>{
  const small={...target(),box:box(4,4,32,32),clip:box(4,4,32,32)};
  assert.deepEqual(validateP2a0Target(small),[]);assert.ok(validateP2a0Target(small,{minimumSize:true}).length);
  assert.deepEqual(validateP2a0Target(target(),{keyboard:true,minimumSize:true}),[]);
  for(const patch of [{inside:false},{outline:'none'},{outlineWidth:1.99}])assert.ok(validateP2a0Target({...target(),...patch},{keyboard:true}).length);
});

async function fixture(t){
  const base=await realpath(await mkdtemp(resolve(tmpdir(),'atlas-p2a0-http-'))),site=resolve(base,'site'),outside=resolve(base,'site-other');
  await mkdir(resolve(site,'data'),{recursive:true});await mkdir(outside);const index=Buffer.from('<!doctype html><title>isolated spike</title>\n');
  await writeFile(resolve(site,'index.html'),index);await writeFile(resolve(site,'data/btc-volume.json'),'{}');await writeFile(resolve(outside,'index.html'),'outside');
  const receipts=[],server=createP2a0StaticServer(site,receipts);await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
  t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));await rm(base,{recursive:true,force:true});});
  const get=(path,{gzip=false,method='GET'}={})=>new Promise((ok,no)=>{const req=request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:gzip?{'accept-encoding':'gzip'}:{}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>ok({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));res.on('error',no);});req.on('error',no);req.end();});
  return {site,outside,index,get,receipts};
}

test('the actual spike server serves root index before bounds checks and gzip preserves source bytes',async t=>{
  const f=await fixture(t);
  for(const path of ['/','/?native=1','/index.html']){const r=await f.get(path,{gzip:true});assert.equal(r.status,200);assert.equal(r.headers['content-encoding'],'gzip');assert.equal(r.headers['cache-control'],'no-store');assert.deepEqual(gunzipSync(r.bytes),f.index);}
  const raw=await f.get('/');assert.equal(raw.status,200);assert.deepEqual(raw.bytes,f.index);
  const head=await f.get('/',{method:'HEAD',gzip:true});assert.equal(head.status,200);assert.equal(head.bytes.length,0);assert.ok(Number(head.headers['content-length'])>0);
  assert.ok(f.receipts.every(r=>r.status===200&&r.sourceSha256.length===64));
});

test('server refuses malformed, encoded sibling traversal, missing files and mutation methods',async t=>{
  const f=await fixture(t);
  for(const path of ['/%ZZ','/%00','/%2e%2e%2fsite-other/index.html','/%2e%2e%5csite-other/index.html','/missing.js']){const r=await f.get(path);assert.equal(r.status,404,path);assert.equal(r.bytes.toString(),'not found');}
  assert.equal((await f.get('/',{method:'POST'})).status,404);
});

test('in-scope symlinks cannot expose an outside file, directory or rewritten root index',async t=>{
  const f=await fixture(t);await symlink(resolve(f.outside,'index.html'),resolve(f.site,'leak.html'));await symlink(f.outside,resolve(f.site,'outside'),'dir');
  for(const path of ['/leak.html','/outside/'])assert.equal((await f.get(path)).status,404,path);
  await rm(resolve(f.site,'index.html'));await symlink(resolve(f.outside,'index.html'),resolve(f.site,'index.html'));
  assert.equal((await f.get('/')).status,404);
});
