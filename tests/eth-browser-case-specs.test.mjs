import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {relative,resolve} from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {createEthBrowserCaseSpecs,ethBrowserCaseScopes,selectEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';

test('the extracted inventory preserves all 53 original cases, their order and every option',()=>{
  const specs=createEthBrowserCaseSpecs();
  assert.equal(specs.length,53);
  assert.equal(new Set(specs.map(({page,width,height})=>`${page}:${width}x${height}`)).size,53);
  // Captured from the original construction at fe0bca before extracting it.
  // This binds routes, touch flags, resize/fill settings and order as well as IDs.
  assert.equal(createHash('sha256').update(JSON.stringify(specs)).digest('hex'),
    '2931d437a5f7bbd1873c6fa50ba5b79a6684c42e82401b525f6a1f6e84c011eb');
});

test('evidence consumers cannot mutate another caller\'s case inventory',()=>{
  const original=createEthBrowserCaseSpecs(),consumer=createEthBrowserCaseSpecs();
  for(const spec of consumer){spec.page='changed';spec.route='/changed';}
  consumer.pop();
  assert.deepEqual(createEthBrowserCaseSpecs(),original);
});

test('two process lanes form a disjoint complete partition without changing any existing scope',()=>{
  const all=createEthBrowserCaseSpecs(),standard=selectEthBrowserCaseSpecs('non-chart-replay'),replay=selectEthBrowserCaseSpecs('chart-replay');
  assert.equal(standard.length,46);assert.equal(replay.length,7);
  assert.deepEqual(standard,all.filter(spec=>!spec.chartReplay));assert.deepEqual(replay,all.filter(spec=>spec.chartReplay));
  assert.deepEqual(all.filter(spec=>[...standard,...replay].some(row=>JSON.stringify(row)===JSON.stringify(spec))),all);
  for(const scope of ethBrowserCaseScopes.filter(scope=>scope!=='non-chart-replay')){
    const previous=all.filter(spec=>scope==='all'||scope==='replay'&&spec.replay||scope==='chart-replay'&&spec.chartReplay||scope==='center-data'&&spec.surface==='center-data'
      ||scope==='data'&&spec.page==='data'||scope.startsWith('workspace')&&(spec.page===scope||spec.page.startsWith(scope+'-')));
    assert.deepEqual(selectEthBrowserCaseSpecs(scope),previous,scope+' changed its prior case inventory/order');
  }
  assert.throws(()=>selectEthBrowserCaseSpecs('partial-fast-pass'),/Unknown browser case scope/);
});

test('the actual runner preserves and emits each case specification after result fields replace its flags',()=>{
  const source=readFileSync(new URL('../scripts/verify-eth-candidate-browser.mjs',import.meta.url),'utf8');
  const creation=source.match(/^\s*const receipt=\{\.\.\.spec,[^\n]+;$/m)?.[0];
  const emission=source.match(/^\s*console\.log\('ETH_BROWSER_RECEIPT '[^\n]+;$/m)?.[0];
  assert.ok(creation,'The runner must create a receipt for the selected case');
  assert.ok(emission,'The runner must emit its final evidence receipt');
  for(const spec of createEthBrowserCaseSpecs()){
    // Evaluate only the actual metadata initializer and serializer, never the
    // runner's server, Chrome startup, model calculations or browser probes.
    const receipt=vm.runInNewContext(creation+'\nreceipt;', {spec});
    assert.notEqual(receipt.caseSpec,spec,'The original case must have its own snapshot');
    Object.assign(receipt,{consolidated:{states:[]},replay:{states:[]},chartReplay:{states:[]},resize:[]});
    assert.deepEqual(JSON.parse(JSON.stringify(receipt.caseSpec)),spec);
    const lines=[];
    vm.runInNewContext(emission,{report:{cases:[receipt]},console:{log:line=>lines.push(line)},relative,resolve,root:'/repo',out:'/repo/build/eth-browser'});
    assert.equal(lines.length,1);
    const report=JSON.parse(lines[0].slice('ETH_BROWSER_RECEIPT '.length));
    assert.deepEqual(report.cases[0].caseSpec,spec,'Log transport must preserve the same complete specification');
  }
});
