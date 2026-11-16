import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessNativeAxisPaints,selectCurrentCanvasPaints} from '../scripts/verify-r19-p5-f3-browser.mjs';

const css=async file=>readFile(new URL(`../dist/${file}`,import.meta.url),'utf8');

test('F3 page descriptions use readable body type and 1.4 line-height',async()=>{
  const source=await css('atlas-shell.css');
  assert.match(source,/\.atlas-page-description\{[^}]*font:12px\/1\.4 var\(--font\)/);
  assert.match(source,/\.atlas-page-description\{[^}]*word-break:keep-all/);
});
test('F3 small metadata is 11px; genuine chart axis remains explicitly 10px',async()=>{
  const [shell,cycles,lab,rsi]=await Promise.all(['atlas-shell.css','cycle-milestones.css','market-lab.css','ui/rsi-simulation.css'].map(css));
  assert.match(shell,/\.atlas-sidebar \.atlas-brand small\{[^}]*font-size:11px/);
  assert.match(shell,/\.rsi-crossing\{[^}]*font-size:10px/);
  assert.match(cycles,/\.cycle-interval-duration tspan\{font-size:11px!important\}/);
  assert.match(cycles,/\.cycle-marker-label[^}]*font-size:11px/);
  assert.match(lab,/\.ml-review\{[^}]*font-size:11px/);
  assert.doesNotMatch(rsi,/font-size:9px/);
  assert.doesNotMatch(rsi,/font-size:10px/);
});
test('F3 stylesheet edits avoid broad universal typography reset',async()=>{
  const files=['atlas-shell.css','cycle-milestones.css','chart-details-panel.css','compact-toolbar.css','monthly-backtest.css','ipo-view.css','editorial-system.css','market-lab.css','ui/rsi-simulation.css'];
  for(const file of files){const source=await css(file);assert.doesNotMatch(source,/(^|})\s*\*\s*\{\s*font-size\s*:/,`${file} contains a global font reset`);}
});
test('F3 native canvas oracle observes connected Funnest text, painter fills, public layout and real pixels',async()=>{
  const source=await readFile(new URL('../scripts/verify-r19-p5-f3-browser.mjs',import.meta.url),'utf8');
  assert.match(source,/CanvasRenderingContext2D/);assert.match(source,/proto\.fillText=wrapped/);assert.match(source,/proto\.fillRect=wrapped/);assert.match(source,/proto\.clearRect=wrapped/);assert.match(source,/resize-\'/);
  assert.match(source,/selectCurrentCanvasPaints/);assert.match(source,/getAtlasFunnestSnapshot/);assert.match(source,/layout\.plotWidth/);assert.match(source,/getImageData/);assert.match(source,/devicePixelRatio/);
  assert.match(source,/backgroundMatchesCanvasPainter/);assert.match(source,/canvasScale:/);assert.match(source,/region==='price'/);assert.match(source,/region==='time'/);
});
test('F3 native-axis oracle fails closed for missing axes, undersized labels and low contrast',()=>{
  const draws=[{region:'price',fontSize:10,ratio:4.5,backgroundVerified:true},{region:'time',fontSize:10,ratio:4.5,backgroundVerified:true}];
  assert.deepEqual(assessNativeAxisPaints({sourceBound:true,painted:true,draws}).failures,[]);
  assert.ok(assessNativeAxisPaints({sourceBound:true,painted:true,draws:[]}).failures.includes('Chart axis contrast remains unobserved'));
  assert.ok(assessNativeAxisPaints({sourceBound:true,painted:true,draws:[{...draws[0],fontSize:9.99},draws[1]]}).failures.includes('Axis label below 10px'));
  assert.ok(assessNativeAxisPaints({sourceBound:true,painted:true,draws:[draws[0],{...draws[1],ratio:4.49}]}).failures.includes('Axis label contrast below 4.5:1'));
  assert.ok(assessNativeAxisPaints({sourceBound:false,painted:true,draws}).failures.includes('Native source-bound Funnest chart is not painted'));
  assert.ok(assessNativeAxisPaints({sourceBound:true,painted:true,draws:[draws[0],{...draws[1],backgroundVerified:false}]}).failures.includes('Chart axis background paint not verified'));
  assert.ok(assessNativeAxisPaints({sourceBound:true,painted:true,draws:[draws[0]]}).failures.includes('Native price and time axis draws are both required'));
});
test('F3 excludes superseded canvas-frame draws but still fails a low-contrast current draw',()=>{
  const canvas={width:100,height:100},host={};
  const record=(seq,kind,ratio,fontSize=12,region='price')=>({seq,kind,ratio,fontSize,region,canvas,host,canvasSize:{width:100,height:100},backgroundVerified:true});
  const state=selectCurrentCanvasPaints({
    paints:[record(10,'text',2.19),record(21,'text',4.49),record(22,'text',8.52,12,'time')],
    backgrounds:[record(2,'background',0),record(20,'background',0)],
    invalidations:[record(1,'invalidate',0)]
  });
  assert.deepEqual(state.paints.map(x=>x.seq),[21,22]);
  const assessment=assessNativeAxisPaints({sourceBound:true,painted:true,draws:state.paints});
  assert.ok(assessment.failures.includes('Axis label contrast below 4.5:1'));
  assert.ok(!assessment.axisContrast.some(x=>x.seq===10));
});
test('F3 invalidation after paint rejects stale draws until a fresh full background',()=>{
  const canvas={width:200,height:100},record=(seq,kind,width=200)=>({seq,kind,canvas,canvasSize:{width,height:100}});
  const stale=selectCurrentCanvasPaints({paints:[record(13,'text')],backgrounds:[record(10,'background',100)],invalidations:[record(12,'invalidate')]});
  assert.deepEqual(stale.paints,[]);
  const fresh=selectCurrentCanvasPaints({paints:[record(15,'text')],backgrounds:[record(10,'background',100),record(14,'background')],invalidations:[record(12,'invalidate')]});
  assert.deepEqual(fresh.paints.map(x=>x.seq),[15]);
});
test('native F3 harness covers approved route/theme/viewport matrix and retains failure gates',async()=>{
  const source=await readFile(new URL('../scripts/verify-r19-p5-f3-browser.mjs',import.meta.url),'utf8');
  for(const width of ['320','390','768','1440'])assert.match(source,new RegExp(`\\b${width}\\b`));
  for(const theme of ['light','dark'])assert.match(source,new RegExp(`'${theme}'`));
  for(const surface of ['chart','relay'])assert.match(source,new RegExp(`id:'${surface}'`));
  assert.match(source,/Horizontal overflow/);
  assert.match(source,/Visible keyboard focus ring not observed/);assert.match(source,/Axis label contrast below 4\.5:1/);
  assert.match(source,/performance:\{status:'not-run'/);
});

test('injected native canvas probe preserves clear/resize calls and records their invalidations without runtime errors',async()=>{
  const {nativeAxisProbeSource}=await import('../scripts/verify-r19-p5-f3-browser.mjs');
  const host={isConnected:true};
  class Canvas{constructor(){this._width=100;this._height=50;this.isConnected=true;}get width(){return this._width;}set width(value){this._width=value;}get height(){return this._height;}set height(value){this._height=value;}closest(){return host;}}
  class Context{constructor(canvas){this.canvas=canvas;}getTransform(){return{a:1,b:0,c:0,d:1,e:0,f:0};}clearRect(){this.cleared=true;return 'original-clear';}}
  const canvas=new Canvas(),context=new Context(canvas),window={CanvasRenderingContext2D:Context,HTMLCanvasElement:Canvas},localStorage={setItem(){}};
  new Function('window','localStorage','performance',nativeAxisProbeSource('dark'))(window,localStorage,{now:()=>1});
  assert.equal(context.clearRect(0,0,100,50),'original-clear');assert.equal(context.cleared,true);
  canvas.width=200;canvas.height=80;assert.equal(canvas.width,200);assert.equal(canvas.height,80);
  assert.deepEqual(window.__atlasFunnestInvalidations.map(row=>row.reason),['clearRect','resize-width','resize-height']);
  assert.deepEqual(window.__atlasFunnestInvalidations.map(row=>row.seq),[1,2,3]);
});

test('native F3 readiness waits safely while navigation has no document element',async()=>{
  const source=await readFile(new URL('../scripts/verify-r19-p5-f3-browser.mjs',import.meta.url),'utf8');
  const expression=source.match(/theme=>(document\.documentElement\?\.dataset\.boot==='ready'&&document\.documentElement\?\.dataset\.theme===theme)/)?.[1];
  assert.ok(expression,'readiness must retain boot and theme checks with a navigation-null guard');
  const ready=new Function('document','theme','return '+expression);
  assert.equal(ready({documentElement:null},'dark'),false);
  assert.equal(ready({documentElement:{dataset:{boot:'loading',theme:'dark'}}},'dark'),false);
  assert.equal(ready({documentElement:{dataset:{boot:'ready',theme:'dark'}}},'dark'),true);
  assert.equal(ready({documentElement:{dataset:{boot:'ready',theme:'light'}}},'dark'),false);
});
