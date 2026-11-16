import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {resolve} from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname);
async function loadBundled(file){
  const entry=resolve(root,'dist',file),primitives=resolve(root,'src/charts/funnest-research-primitives.js');
  const result=await build({absWorkingDir:root,entryPoints:[entry],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,legalComments:'none',plugins:[{name:'test-local-primitives',setup(build){build.onResolve({filter:/funnest-research-primitives\.bundle\.js/},()=>({path:primitives}));}}]});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const [atlas,crypto,dataset]=await Promise.all([loadBundled('atlas-analysis.js'),loadBundled('cryptocon-audit.js'),readFile(new URL('./fixtures/btc-daily-2026-10-20.json',import.meta.url),'utf8').then(JSON.parse)]);
const prices=new Map(dataset.prices);
function svgStub(width=900,height=420){const attrs=new Map();return {clientWidth:width,clientHeight:height,innerHTML:'',setAttribute:(key,value)=>attrs.set(key,String(value)),getAttribute:key=>attrs.get(key)||null,getBoundingClientRect:()=>({left:0,top:0,width,height})};}
test('all research modes render Funnest-generated paths/bands and keep observations, semantics, and exports intact',()=>{
  const cases=[{mode:'cycles',alignment:'halving',path:true},{mode:'peaks',path:true},{mode:'periods',period:'monthly',path:true},{mode:'periods',period:'quarterly',metric:'maxDrawdownPct',path:true},{mode:'duration',path:false},{mode:'phases',phaseLeg:'bull',path:false},{mode:'phases',phaseLeg:'bear',path:false}];
  for(const config of cases){const svg=svgStub(),events=[];let presentations=0;const c=atlas.renderAtlasAnalysis({svg,dataset,...config,onInspect:(value,meta)=>events.push({value,meta}),presentation:node=>{assert.strictEqual(node,svg);presentations++;}});
    assert.ok(svg.innerHTML.includes('data-indicator-axis-label'));if(config.path)assert.ok(/\bd="[MLCQ]/u.test(svg.innerHTML),`${config.mode} paths must come from Funnest path primitives`);else assert.ok(svg.innerHTML.includes('data-indicator-fill'),`${config.mode} uses specialized interval segments over Funnest scales`);assert.equal(presentations,1);assert.ok(events[0].value);assert.equal(events[0].meta.origin,'render');
    const out=c.exportData();assert.ok(out.rows.length&&out.columns.length);for(const row of out.rows){if(row.date&&row.priceUsd!==undefined)assert.equal(row.priceUsd,prices.get(row.date));}
    const before=out.rows.map(row=>JSON.stringify(row));c.next();assert.equal(presentations,2);assert.equal(c.exportData().rows.length,out.rows.length);assert.equal(JSON.stringify(out.rows.map(row=>JSON.stringify(row))),JSON.stringify(before),'selection must not mutate source/export data');
  }
});
test('analysis pointer/keyboard selection and presentation callbacks remain live after Funnest scale migration',()=>{
  const svg=svgStub(),observed=[];const c=atlas.renderAtlasAnalysis({svg,dataset,mode:'cycles',alignment:'halving',onInspect:(value,meta)=>observed.push({value,meta})});
  svg.onclick({clientX:450,clientY:180});assert.equal(observed.at(-1).meta.origin,'pointer');
  svg.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(observed.at(-1).meta.origin,'keyboard');
  c.selectDate('2020-05-11');assert.equal(observed.at(-1).meta.origin,'date');
});
test('CryptoCon date and value scales use Funnest primitives without changing claims, observations, or selection',()=>{
  for(const view of ['timing','thresholds','targets']){const svg=svgStub(900,400),events=[];let painted=0;const c=crypto.renderCryptoConAudit({svg,dataset,view,onInspect:(value,meta)=>events.push({value,meta}),presentation:()=>painted++});
    assert.ok(svg.innerHTML.includes('data-indicator-axis-label'));assert.ok(svg.innerHTML.includes('data-indicator-fill'));assert.ok(events[0].value);const before=c.exportData();assert.ok(before.rows.length);for(const row of before.rows)if(row.peakDate&&row.peakPriceUsd!=null)assert.equal(row.peakPriceUsd,prices.get(row.peakDate));c.next();assert.equal(painted,2);assert.equal(c.exportData().rows.length,before.rows.length);
  }
});
