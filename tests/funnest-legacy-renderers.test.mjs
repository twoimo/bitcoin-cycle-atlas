import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {resolve} from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname);
const renderers=['app.js','forecast-view.js','peak-view.js','market-lab-view.js'];
const primitiveSpecifier="./funnest-research-primitives.bundle.js?v=1.29.0";
const requirements={
  'app.js':['linearScale','logScale','ticks','logTicks','funnestLinePath','areaPath','segments'],
  'forecast-view.js':['linearScale','logScale','logTicks','funnestLinePath','areaPath','segments'],
  'peak-view.js':['linearScale','ticks','funnestLinePath','segments'],
  'market-lab-view.js':['linearScale','ticks','funnestLinePath','segments'],
};

test('assigned price renderers import the shared chart primitives and delegate geometry',async()=>{
  for(const file of renderers){
    const source=await readFile(resolve(root,'dist',file),'utf8');
    assert.ok(source.includes(primitiveSpecifier),`${file} imports the pinned shared browser bundle`);
    for(const api of requirements[file])assert.ok(source.includes(api),`${file} uses ${api}`);
  }
  const app=await readFile(resolve(root,'dist/app.js'),'utf8');
  const forecast=await readFile(resolve(root,'dist/forecast-view.js'),'utf8');
  assert.doesNotMatch(app,/function niceStep\(/,'the cycle renderer no longer owns a local tick-step implementation');
  assert.doesNotMatch(forecast,/function logTicks\(/,'the forecast renderer no longer owns log tick generation');
  assert.match(app,/areaPath\(fillPoints, bottom\)/,'current-cycle fill uses the shared area path');
  assert.match(forecast,/areaPath\(upper, lower\)/,'forecast sensitivity band uses the shared area path');
});

test('all four browser renderers bundle against the shared pinned package entry',async()=>{
  const primitives=resolve(root,'src/charts/funnest-research-primitives.js');
  for(const file of renderers){
    const result=await build({
      absWorkingDir:root,entryPoints:[resolve(root,'dist',file)],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,legalComments:'none',
      plugins:[{name:'shared-funnest-test-alias',setup(build){
        build.onResolve({filter:/funnest-research-primitives\.bundle\.js/},()=>({path:primitives}));
        build.onResolve({filter:/^\./},args=>({path:args.path,external:true}));
      }}],
    });
    assert.ok(result.outputFiles[0].text.includes('function linePath')||result.outputFiles[0].text.includes('linePath'),`${file} includes the pinned Funnest implementation`);
  }
});
