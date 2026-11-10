import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {headlessWindowSize,headlessWindowArgument,verifyHeadlessWindowEnvelope} from '../scripts/headless-browser-window.mjs';
import {createEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';
function transport(width=2048,height=1513){
  const calls=[];
  return {calls,async send(method){calls.push(method);if(method==='Browser.getWindowForTarget')return {windowId:7,bounds:{width:2048,height:1600,windowState:'normal'}};if(method==='Page.getLayoutMetrics')return {cssLayoutViewport:{clientWidth:width,clientHeight:height}};throw Error('Unexpected mutation '+method);}};
}
test('the requested headless window covers every declared viewport without changing emulation',()=>{
  assert.equal(headlessWindowArgument,'--window-size=2048,1600');
  for(const spec of createEthBrowserCaseSpecs()){assert.ok(headlessWindowSize.width>=spec.width);assert.ok(headlessWindowSize.height>spec.height);}
});
test('native envelope acceptance records actual pre-emulation client bounds with read-only CDP calls',async()=>{
  const cdp=transport(),result=await verifyHeadlessWindowEnvelope(cdp,{width:1920,height:1440});
  assert.deepEqual(result.client,{width:2048,height:1513});assert.deepEqual(result.requestedViewport,{width:1920,height:1440});assert.equal(result.verifiedBeforeEmulation,true);
  assert.deepEqual(cdp.calls,['Browser.getWindowForTarget','Page.getLayoutMetrics']);
});
test('the observed 469px native-client regression is rejected before a 900px emulated test',async()=>{
  await assert.rejects(verifyHeadlessWindowEnvelope(transport(756,469),{width:320,height:900}),/client height 469 cannot cover emulated 900/);
});
test('a window outer box cannot substitute for an undersized client width',async()=>{
  await assert.rejects(verifyHeadlessWindowEnvelope(transport(1880,1513),{width:1920,height:1080}),/client width 1880 cannot cover emulated 1920/);
});
test('missing client geometry and invalid viewport values fail closed',async()=>{
  await assert.rejects(verifyHeadlessWindowEnvelope(transport(NaN,1513),{width:320,height:900}),/Missing native browser client width/);
  for(const width of [0,-1,NaN,Infinity]){const cdp=transport();await assert.rejects(verifyHeadlessWindowEnvelope(cdp,{width,height:900}),/Invalid test viewport width/);assert.deepEqual(cdp.calls,[]);}
});
test('both production browser runners establish the input envelope before device metrics',async()=>{
  for(const [file,count] of [['verify-eth-candidate-browser.mjs',1],['verify-wp6-browser.mjs',2]]){
    const source=await readFile(new URL('../scripts/'+file,import.meta.url),'utf8');
    assert.match(source,/'--headless=new',headlessWindowArgument/);
    const checks=[...source.matchAll(/receipt\.nativeWindowEnvelope=await verifyHeadlessWindowEnvelope\(cdp,\{width,height\}\);/g)];assert.equal(checks.length,count);
    for(const check of checks){const next=source.indexOf("await cdp.send('Emulation.setDeviceMetricsOverride'",check.index);assert.ok(next>check.index&&next-check.index<350,'Envelope check immediately precedes emulation');}
  }
});
test('failed browser cases still receive the final source-integrity check',async()=>{
  const source=await readFile(new URL('../scripts/verify-eth-candidate-browser.mjs',import.meta.url),'utf8');
  assert.ok(source.indexOf('report.sourceIntegrity={')<source.indexOf("assert.equal(report.failures.length,0,'Real browser verification failed"));
});
