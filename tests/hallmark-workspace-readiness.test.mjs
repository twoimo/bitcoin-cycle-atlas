import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {hallmarkAuditScope,hallmarkWorkspaceReady,adaptHallmarkWorkspaceReadiness} from '../scripts/hallmark-source-scope.mjs';

// Hallmark CI intentionally installs tooling outside the product checkout.
// The ordinary application test run resolves the same pinned parser locally.
const require=createRequire(process.env.HALLMARK_PUPPETEER?join(process.env.HALLMARK_PUPPETEER,'noop.js'):import.meta.url);
const {parseHTML}=require('linkedom');

const scope=hallmarkAuditScope('workspaces'),symbols=['BTC','ETH','HYPE'];
const pricePath='M0,1 L10,2 L20,3 L30,4 L40,5';
const content={
  diagnosis:'<div data-ztd-chart="observed" data-source-count="12"><svg><path d="M0,1 L1,2"/></svg></div><span data-selected-date="2026-11-05">2026-11-05</span>',
  scenario:'<div data-ztd-chart="contributions"><svg></svg></div><div id="ml-scenario-output"><div class="ml-index"><strong>100</strong></div><table><tbody><tr></tr><tr></tr><tr></tr></tbody></table></div>',
  cashflow:'<form id="ml-economics-form">'+Array.from({length:6},(_,index)=>`<input data-econ="field-${index}">`).join('')+'</form><div id="ml-economics-output"><p class="ml-empty-copy">입력 후 계산하세요.</p></div>',
  rsi:`<svg><path class="rsi-price-line" d="${pricePath}"/></svg>`,
  housing:`<svg><path class="housing-price" d="${pricePath}"/></svg>`,
  themes:'<div class="theme-price-chart"><svg><g class="theme-up"><rect/></g></svg></div>',
  ipo:'<span class="ipo-source">원자료 수집 2026-11-06</span><div class="ipo-pages"><section data-ipo-month="2026-11"><div class="ipo-month-grid"><button data-ipo-date="2026-11-06">6</button></div></section></div>',
  data:'<table><tbody id="data-body">'+symbols.map(symbol=>`<tr data-asset-symbol="${symbol}"></tr>`).join('')+'</tbody></table>',
  evidence:'<div id="evidence-body"><button data-evidence-detail="source-1">Source</button></div>',
};

function withWorkspace(route,run){
  const {document}=parseHTML('<html data-boot="ready"><head><meta name="atlas-root" content="/bitcoin-cycle-atlas/"></head><body><header class="atlas-canvas-heading"></header><iframe class="atlas-center-frame"></iframe></body></html>');
  const child=parseHTML('<html data-boot="ready"><body>'+content[route.probe]+'</body></html>').document;
  document.body.dataset.centerTool=route.center;
  const frame=document.querySelector('iframe'),heading=document.querySelector('header');
  const dashboard=['data','ipo','evidence'].includes(route.center);
  const query=new URLSearchParams({embedded:'1',...(dashboard?{page:route.center}:{}),...(route.probe==='diagnosis'?{'lab-tab':'diagnosis','lab-region':route.region}:{}),...(route.symbol?{symbol:route.symbol}:{}),epoch:'1'});
  const source='http://127.0.0.1:4177/bitcoin-cycle-atlas/'+(dashboard?'':'market-lab/app/')+'?'+query;
  Object.defineProperties(frame,{contentDocument:{value:child,configurable:true},src:{value:source,writable:true}});
  Object.defineProperties(child,{URL:{value:source,writable:true},readyState:{value:'complete',writable:true}});
  frame.getBoundingClientRect=()=>({width:1000,height:700});heading.getBoundingClientRect=()=>({width:1000,height:44});
  const toolbar=document.createElement('div');toolbar.id='atlas-center-toolbar-'+(dashboard?route.center:'lab');toolbar.dataset.page=route.center;
  toolbar.innerHTML='<button>Real outer control</button>';heading.append(toolbar);frame.dataset.toolbarId=toolbar.id;
  for(const node of [toolbar,...toolbar.querySelectorAll('*'),...child.querySelectorAll('*')])node.getBoundingClientRect=()=>({width:300,height:40});
  const saved=Object.fromEntries(['document','location'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.defineProperties(globalThis,{document:{value:document,configurable:true},location:{value:{origin:'http://127.0.0.1:4177'},configurable:true}});
  try{return run({document,child,frame,heading,toolbar,ready:(version='current')=>hallmarkWorkspaceReady(route,symbols,version)});}
  finally{for(const key of ['document','location']){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}}
}

test('Workspace readiness identifies real content for all ten declared host/child routes',()=>{
  for(const route of scope.routes)withWorkspace(route,({ready})=>{
    const result=ready();assert.equal(result.center,route.center);assert.ok(result.frameUrl.includes('/bitcoin-cycle-atlas/'));
    assert.ok(result.content);assert.equal(result.frameHeight,700);assert.ok(result.toolbar.controls>0);
    if(route.probe==='cashflow')assert.equal(result.content.state,'empty-input');
    if(route.probe==='data')assert.deepEqual(result.content.symbols,symbols);
  });
});

test('Only the current contract requires the actual parent toolbar; old child controls cannot replace it',()=>{
  for(const route of scope.routes){
    withWorkspace(route,({toolbar,child,ready})=>{
      toolbar.remove();child.body.insertAdjacentHTML('afterbegin','<div class="workspace-toolbar"><button>Old child control</button></div>');
      assert.equal(ready(),false,route.name+': missing current toolbar');
      assert.equal(ready('baseline').center,route.center,route.name+': immutable pre-change baseline');
    });
    withWorkspace(route,({toolbar,ready})=>{toolbar.hidden=true;assert.equal(ready(),false);});
    withWorkspace(route,({toolbar,ready})=>{toolbar.innerHTML='';assert.equal(ready(),false);});
    withWorkspace(route,({frame,ready})=>{frame.dataset.toolbarId='foreign-toolbar';assert.equal(ready(),false);});
  }
});

test('Moving summary/date controls to the host does not change the observed-content readiness requirement',()=>{
  withWorkspace(scope.routes[0],({child,ready})=>{child.querySelector('[data-selected-date]').remove();assert.ok(ready().content.observations>0);});
  withWorkspace(scope.routes.find(route=>route.probe==='scenario'),({child,ready})=>{child.querySelector('.ml-index').remove();assert.equal(ready().content.contributions,3);});
  withWorkspace(scope.routes[0],({child,ready})=>{child.querySelector('svg').getBoundingClientRect=()=>({width:0,height:0});assert.equal(ready(),false);});
  assert.throws(()=>hallmarkWorkspaceReady(scope.routes[0],symbols,'unknown'),/explicit baseline\/current/);
});

test('A blank, loading, wrong or unpainted child cannot satisfy workspace readiness',()=>{
  for(const route of scope.routes){
    withWorkspace(route,({child,ready})=>{child.body.innerHTML='<div class="atlas-skeleton">Loading</div>';assert.equal(ready(),false,route.name);});
    withWorkspace(route,({child,ready})=>{child.readyState='loading';assert.equal(ready(),false,route.name);});
    withWorkspace(route,({child,ready})=>{child.URL='about:blank';assert.equal(ready(),false,route.name);});
    withWorkspace(route,({document,ready})=>{document.body.dataset.centerTool='outlook';assert.equal(ready(),false,route.name);});
    withWorkspace(route,({frame,ready})=>{frame.getBoundingClientRect=()=>({width:0,height:700});assert.equal(ready(),false,route.name);});
    withWorkspace(route,({document,ready})=>{document.querySelector('header').remove();assert.equal(ready(),false,route.name);});
  }
});

test('Workspace readiness rejects foreign frames, escaped roots, absent embedded ownership and duplicate active frames',()=>{
  const route=scope.routes[0];
  for(const value of ['https://example.test/bitcoin-cycle-atlas/market-lab/app/?embedded=1','http://127.0.0.1:4177/market-lab/app/?embedded=1','http://127.0.0.1:4177/bitcoin-cycle-atlas/market-lab/app/']){
    withWorkspace(route,({frame,child,ready})=>{frame.src=value;child.URL=value;assert.equal(ready(),false);});
  }
  withWorkspace(route,({document,frame,ready})=>{document.body.append(frame.cloneNode());assert.equal(ready(),false);});
});

test('The readiness predicate does not confuse US/KR, chart identity or missing assets',()=>{
  withWorkspace(scope.routes[0],({frame,child,ready})=>{frame.src=frame.src.replace('lab-region=us','lab-region=kr');child.URL=frame.src;assert.equal(ready(),false);});
  for(const route of scope.routes.filter(item=>item.symbol))withWorkspace(route,({frame,child,ready})=>{frame.src=frame.src.replace(encodeURIComponent(route.symbol),'WRONG');child.URL=frame.src;assert.equal(ready(),false);});
  withWorkspace(scope.routes.find(item=>item.probe==='data'),({child,ready})=>{child.querySelector('[data-asset-symbol="ETH"]').remove();assert.equal(ready(),false);});
  withWorkspace(scope.routes.find(item=>item.probe==='data'),({child,ready})=>{child.querySelector('[data-asset-symbol="ETH"]').dataset.assetSymbol='BTC';assert.equal(ready(),false);});
  withWorkspace(scope.routes.find(item=>item.probe==='themes'),({child,ready})=>{child.querySelector('g').remove();assert.equal(ready(),false,'An empty chart frame is not observed candles');});
  withWorkspace(scope.routes.find(item=>item.probe==='ipo'),({child,ready})=>{child.querySelector('.ipo-source').textContent='원자료 수집 미확인';assert.equal(ready(),false,'An empty calendar shell is not a loaded source');});
  withWorkspace(scope.routes.find(item=>item.probe==='ipo'),({child,ready})=>{child.querySelector('.ipo-pages').setAttribute('aria-busy','true');assert.equal(ready(),false,'Calendar loading cannot pass readiness');});
  assert.throws(()=>hallmarkWorkspaceReady({probe:'unknown'},symbols),/Unsupported workspace/);
  assert.throws(()=>hallmarkWorkspaceReady(scope.routes[0],['BTC','BTC']),/exact snapshot/);
});

test('The build-copy readiness adapter retains the pinned renderer and fails on missing or ambiguous anchors',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../tools/hallmark/provenance.json',import.meta.url),'utf8'));
  let original=readFileSync(new URL('../tools/hallmark/upstream/sloplint-render.mjs',import.meta.url),'utf8');
  original=original.replace(manifest.compatibilityPatch.before,manifest.compatibilityPatch.after).replace(manifest.readinessPatch.before,manifest.readinessPatch.after);
  const adapted=adaptHallmarkWorkspaceReadiness(original);
  assert.ok(adapted.includes(hallmarkWorkspaceReady.toString()));
  const start=adapted.indexOf("        if (process.env.HALLMARK_ATLAS_READY === '1' && process.env.HALLMARK_ATLAS_SUITE === 'workspaces') {"),end=adapted.indexOf(" else if (process.env.HALLMARK_ATLAS_READY === '1') {",start);
  assert.ok(start>=0&&end>start);
  const restored=adapted.slice(0,start)+"        if (process.env.HALLMARK_ATLAS_READY === '1') {"+adapted.slice(end+" else if (process.env.HALLMARK_ATLAS_READY === '1') {".length);
  assert.equal(restored,original,'Only the additional pre-probe readiness branch may differ');
  const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:adapted,encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
  assert.throws(()=>adaptHallmarkWorkspaceReadiness(''),/exactly once/);
  assert.throws(()=>adaptHallmarkWorkspaceReadiness(original+original),/exactly once/);
});
