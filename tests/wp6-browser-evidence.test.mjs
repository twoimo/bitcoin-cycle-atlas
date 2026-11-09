import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { decodeBrowserEvidenceChunks } from '../scripts/browser-evidence-transport.mjs';
import { readChartQa } from '../scripts/verify-chart-qa-metrics.mjs';
import { collectWp6Screenshots,validateWp6Report,validateWp6CandidateSource,wp6EvidenceSymbols,wp6EvidenceViewports,planWp6ScreenshotTransport,wp6ScreenshotLogBytes,emitWp6ScreenshotTransport } from '../scripts/verify-wp6-cloudflare.mjs';

const origin='https://bitcoin-cycle-atlas.twoimo.workers.dev',source='a'.repeat(40);
const fixture=phase=>({kind:'atlas-wp6-native-browser-evidence',qualifiesFullVerification:false,phase,origin,status:'PASS',failures:[],
  publicationBefore:{sourceCommit:source,sha256:'b'.repeat(64)},publicationAfter:{sourceCommit:source,sha256:'b'.repeat(64)},
  cases:wp6EvidenceViewports.flatMap(([width,height])=>wp6EvidenceSymbols.map(symbol=>{const id=symbol.toLowerCase()+'-'+width+'x'+height;return {symbol,width,height,id,contextId:id,status:'PASS',runtimeErrors:[],
    screenshots:[id+'-chart.png',...(symbol==='BTCUSD'?[id+'-replay.png']:[]),...(phase!=='before'&&symbol==='TQQQ'?[id+'-statistics.png']:[])].map(file=>({file,bytes:1000,sha256:'c'.repeat(64)}))};}))});

test('WP6 evidence requires all30 cases and every requested screenshot, never partial success',()=>{
  const report=fixture('after'),options={phase:'after',origin,expectedSource:source};
  assert.equal(validateWp6Report(report,options).length,42);
  const missingCase=structuredClone(report);missingCase.cases.pop();assert.throws(()=>validateWp6Report(missingCase,options),/every instrument/);
  const missingImage=structuredClone(report);missingImage.cases[0].screenshots.pop();assert.throws(()=>validateWp6Report(missingImage,options),/Required screenshot missing/);
  const failed=structuredClone(report);failed.cases[3].status='FAIL';assert.throws(()=>validateWp6Report(failed,options),/failed/);
  const mixed=structuredClone(report);mixed.publicationAfter.sourceCommit='d'.repeat(40);assert.throws(()=>validateWp6Report(mixed,options),/Publication source changed/);
  const reused=structuredClone(report);reused.cases[1].contextId=reused.cases[0].contextId;assert.throws(()=>validateWp6Report(reused,options),/isolated browser state/);
});

test('before measurements remain distinct from exact-source after assertions',()=>{
  assert.equal(validateWp6Report(fixture('before'),{phase:'before',origin}).length,36);
  assert.throws(()=>validateWp6Report(fixture('after'),{phase:'after',origin}),/exact published source/);
  assert.throws(()=>validateWp6Report(fixture('after'),{phase:'after',origin,expectedSource:'e'.repeat(40)}));
  const report=fixture('before');report.cases[0].screenshots[0].file='../outside.png';assert.throws(()=>validateWp6Report(report,{phase:'before',origin}));
});

test('valid failure screenshots remain transportable but never make failed or partial evidence pass',()=>{
  const report=fixture('after'),options={phase:'after',origin,expectedSource:source};
  report.status='FAIL';report.cases[3].status='FAIL';report.cases[3].error='Actual missing T3 message';report.failures=[{id:report.cases[3].id,error:report.cases[3].error}];
  report.cases[3].screenshots.push({file:report.cases[3].id+'-failure.png',bytes:1234,sha256:'d'.repeat(64)});
  assert.equal(collectWp6Screenshots(report).length,43);assert.throws(()=>validateWp6Report(report,options));
  report.cases=report.cases.slice(0,4);assert.equal(collectWp6Screenshots(report).length,6);assert.throws(()=>validateWp6Report(report,options));
  report.cases[3].screenshots.at(-1).file='../failure.png';assert.throws(()=>collectWp6Screenshots(report));
});

test('candidate evidence binds a clean committed dist tree without claiming production publication',()=>{
  const report=fixture('candidate'),candidateOrigin='http://127.0.0.1:4545';report.origin=candidateOrigin;
  const identity={kind:'atlas-wp6-candidate-source',productionDeployment:false,verifiedTrackedDistClean:true,sourceCommit:source,sourceTree:'d'.repeat(40),distTreeSha256:'e'.repeat(64),sha256:'f'.repeat(64)};
  delete report.publicationBefore;delete report.publicationAfter;
  report.candidateSourceBefore={...identity};report.candidateSourceAfter={...identity};
  const options={phase:'candidate',origin:candidateOrigin,expectedSource:source};
  assert.equal(validateWp6Report(report,options).length,42);
  assert.throws(()=>validateWp6Report(report,{...options,expectedSource:null}),/exact committed source/);
  assert.throws(()=>validateWp6CandidateSource({...identity,productionDeployment:true}));
  assert.throws(()=>validateWp6CandidateSource({...identity,verifiedTrackedDistClean:false}),/clean committed dist/);
  const mixed=structuredClone(report);mixed.candidateSourceAfter.distTreeSha256='9'.repeat(64);assert.throws(()=>validateWp6Report(mixed,options),/Candidate source changed/);
  const mislabeled=structuredClone(report);mislabeled.publicationBefore={sourceCommit:source};assert.throws(()=>validateWp6Report(mislabeled,options));
  assert.throws(()=>validateWp6Report(report,{...options,phase:'after'}));
});

// Execute the exact observational function sent through CDP. A navigation can
// briefly expose no documentElement; an active iframe retains a hidden BTC SVG.
const browserSource=await readFile(new URL('../scripts/verify-wp6-browser.mjs',import.meta.url),'utf8');
const observerSource=browserSource.slice(browserSource.indexOf('function readWp6(){'),browserSource.indexOf('async function locate('))+'\nreadWp6();';
const observe=document=>runInNewContext(observerSource,{document,location:{href:'https://atlas.test/?symbol=TQQQ'},innerWidth:1440,innerHeight:900});

test('WP6 readiness tolerates the empty document during native navigation',()=>{
  const result=observe({documentElement:null,body:null,querySelectorAll:()=>[],querySelector:()=>null});
  assert.equal(result.boot,null);assert.equal(result.chart,null);assert.equal(result.rootWidth,0);assert.equal(result.bodyWidth,0);
});

test('WP6 probes the painted iframe chart and its legend instead of the retained hidden BTC surface',()=>{
  const rectangle={left:10,right:610,top:20,bottom:420,width:600,height:400};
  let frame,outerPlot,innerPlot,retained,active,dock,legend;
  const makeDocument=child=>({documentElement:{dataset:{boot:'ready'},scrollWidth:1440},body:{scrollWidth:1440},defaultView:{getComputedStyle:()=>({visibility:'visible'})},title:'Actual chart',
    querySelector:selector=>selector==='.atlas-plot'?(child?innerPlot:outerPlot):null,
    querySelectorAll:selector=>selector==='.atlas-center-frame'?(child?[]:[frame]):selector==='#lab-chart,#eth-chart,#equity-chart,.rsi-chart-canvas > svg'?[child?active:retained]:[]});
  const parent=makeDocument(false),child=makeDocument(true);
  const node=(ownerDocument,props={})=>({ownerDocument,dataset:{},hidden:false,textContent:'',scrollWidth:100,clientWidth:100,getClientRects:()=>[rectangle],getBoundingClientRect:()=>rectangle,closest:()=>null,querySelector:()=>null,querySelectorAll:()=>[],...props});
  frame=node(parent,{src:'https://atlas.test/app/?symbol=TQQQ',dataset:{centerStatus:'ready',centerLoaded:'true'},contentDocument:child});
  outerPlot=node(parent,{dataset:{chartSymbol:'BTCUSD'}});innerPlot=node(child,{querySelector:selector=>selector==='.chart-legend-dock'?dock:null});
  retained=node(parent,{id:'lab-chart',closest:selector=>selector==='.atlas-plot'?outerPlot:{inert:true}});
  active=node(child,{id:'active-rsi-chart',dataset:{plotLeft:'10',plotRight:'610',observedCandleCount:'0',observedLineCount:'63'},closest:selector=>selector==='.atlas-plot'?innerPlot:null,
    querySelector:selector=>selector==='desc'?{textContent:'TQQQ actual observations'}:null,querySelectorAll:selector=>selector==='path[d]'?[{},{}]:[]});
  legend=node(child,{textContent:'TQQQ actual legend'});dock=node(child,{dataset:{legendMode:'rows'},querySelector:selector=>selector==='.lab-legend'?legend:null});
  const result=observe(parent);assert.equal(result.chart.id,'active-rsi-chart');assert.equal(result.chart.embedded,true);assert.equal(result.chart.observedCount,63);
  assert.equal(result.legend.text,'TQQQ actual legend');assert.equal(result.legend.rect.left,20);assert.equal(result.chart.rect.top,40);
});

test('native heading input follows the actual responsive scroll owner, including the tablet instrument slot',()=>{
  const source=browserSource.slice(browserSource.indexOf('function readHeadingScrollOwner('),browserSource.indexOf('async function revealHeading('))+'\nreadHeadingScrollOwner("#workbench-replay");';
  const owners={'.center-workspace-toolbar':{id:'center-tools',scrollWidth:700,clientWidth:700,overflowX:'visible'},
    '.shell-instrument-slot':{scrollWidth:420,clientWidth:130,overflowX:'auto'},'.atlas-canvas-heading':{scrollWidth:663,clientWidth:663,overflowX:'auto'}};
  const run=()=>runInNewContext(source,{document:{querySelector:()=>({closest:selector=>owners[selector]})},getComputedStyle:node=>node});
  assert.equal(run(),'.shell-instrument-slot');
  owners['.shell-instrument-slot'].overflowX='visible';owners['.atlas-canvas-heading'].scrollWidth=550;owners['.atlas-canvas-heading'].clientWidth=390;
  assert.equal(run(),'.atlas-canvas-heading');
  owners['.center-workspace-toolbar'].overflowX='auto';owners['.center-workspace-toolbar'].clientWidth=220;
  assert.equal(run(),'#center-tools');
});

test('bounded PNG transport puts every requested TQQQ viewport first and explicitly lists omitted captures',()=>{
  const inventory=['before','candidate'].flatMap(phase=>collectWp6Screenshots(fixture(phase)).map(image=>({phase,...image})));
  const options={phases:['before','candidate'],budget:{pngBytes:12000,logBytes:100000}};
  const plan=planWp6ScreenshotTransport(inventory,options);
  assert.equal(plan.selected.length,12);assert.deepEqual(plan.errors,[]);assert.equal(plan.capturedImages,78);
  assert.equal(plan.omitted.length,66);assert.ok(plan.omitted.every(image=>image.reason));
  assert.deepEqual(plan.selected.slice(0,6).map(image=>image.phase),Array(6).fill('candidate'));
  assert.deepEqual(plan.selected.slice(6).map(image=>image.phase),Array(6).fill('before'));
  assert.deepEqual(plan.selected.slice(0,6).map(image=>image.file),wp6EvidenceViewports.map(([width,height])=>'tqqq-'+width+'x'+height+'-chart.png'));
  assert.equal(plan.logBytes,plan.selected.reduce((sum,image)=>sum+wp6ScreenshotLogBytes(image),0));
  const tooSmall=planWp6ScreenshotTransport(inventory,{...options,budget:{pngBytes:11999,logBytes:100000}});
  assert.equal(tooSmall.selected.length,11);assert.match(tooSmall.errors[0],/Required viewport screenshot exceeds/);
});

test('paced image emission awaits writes and drains while preserving exact captured bytes',async()=>{
  const bytes=Buffer.from(Array.from({length:18000},(_,i)=>(i*17)%256)),name='wp6-candidate/tqqq-390x844-chart.png';
  const lines=[];let active=0,maximumActive=0,drains=0,pauses=0;
  const result=await emitWp6ScreenshotTransport([{name,bytes}],{batchBytes:8000,delayMs:1,
    write:async line=>{active++;maximumActive=Math.max(maximumActive,active);await Promise.resolve();lines.push(line);active--;},
    drain:async()=>{assert.equal(active,0);drains++;},pause:async()=>{pauses++;}});
  assert.equal(maximumActive,1);assert.ok(drains>=3&&pauses>=3);assert.equal(result.images,1);assert.equal(result.status,'emitted');
  const chunks=lines.map(line=>JSON.parse(line.slice('ETH_BROWSER_IMAGE_CHUNK '.length)));
  assert.deepEqual(decodeBrowserEvidenceChunks(chunks,{name}),bytes);
  assert.equal(result.logBytes,wp6ScreenshotLogBytes({phase:'candidate',file:'tqqq-390x844-chart.png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
});


test('supplementary chart QA keeps all twelve source-bound cases and six route screenshots',()=>{
  const report=fixture('before');report.suite='chart-qa';
  report.cases=wp6EvidenceViewports.flatMap(([width,height])=>['BTCUSD','COMPARE'].map(symbol=>{const id=symbol.toLowerCase()+'-'+width+'x'+height;return {symbol,width,height,id,contextId:id,status:'PASS',runtimeErrors:[],screenshots:[{file:id+'-chart.png',bytes:1000,sha256:'c'.repeat(64)}]};}));
  assert.equal(validateWp6Report(report,{phase:'before',origin}).length,12);
  const inventory=collectWp6Screenshots(report).map(image=>({phase:'before',...image}));
  const plan=planWp6ScreenshotTransport(inventory,{suite:'chart-qa',phases:['before']});
  assert.equal(plan.selected.length,12);assert.deepEqual(plan.errors,[]);assert.equal(plan.omitted.length,0);
  report.cases.pop();assert.throws(()=>validateWp6Report(report,{phase:'before',origin}),/every instrument/);
});

test('chart QA distinguishes hidden SVG geometry while retaining real positive collisions',()=>{
  const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
  let svg;
  const node=(text,r,visibility='visible')=>({nodeType:1,textContent:text,visibility,style:{},getAttribute:()=>null,
    getClientRects:()=>[r],getBoundingClientRect:()=>r,get parentElement(){return svg;},get ownerSVGElement(){return svg;}});
  const tick=node('$50,000',rect(220,30,50,14),'hidden'),quote=node('$74,967.72',rect(220,32,60,14));
  const a=node('Visible event',rect(20,20,60,14)),b=node('Visible milestone',rect(50,25,60,14));
  svg={nodeType:1,dataset:{},textContent:'',id:'lab-chart',visibility:'visible',getAttribute:()=>null,
    getClientRects:()=>[rect(0,0,300,400)],getBoundingClientRect:()=>rect(0,0,300,400),
    querySelector:s=>s==='.cross-price-tag text'?quote:null,querySelectorAll:s=>s==='text'?[tick,quote,a,b]:s==='path[d]'?[{}]:s==='[data-price-axis-label="tick"]'?[tick]:s.startsWith('.history-event-marker')?[a,b]:[]};
  const document={documentElement:{dataset:{boot:'ready'},scrollWidth:390},body:{scrollWidth:390},querySelector:s=>s==='#lab-chart'?svg:null};
  const result=runInNewContext('('+readChartQa.toString()+')()', {document,innerWidth:390,innerHeight:844,location:{href:origin},
    getComputedStyle:n=>({display:'block',visibility:n.visibility,opacity:'1'})});
  assert.equal(result.axis.rawPairs,1);assert.equal(result.axis.paintedPairs,0);
  assert.equal(result.annotations.pairs,1,'a genuinely visible overlap must fail the native zero-pair assertion');
  assert.equal(result.text.rawCount,4);assert.equal(result.text.paintedCount,3);
});
