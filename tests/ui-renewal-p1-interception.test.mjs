import test from 'node:test';
import assert from 'node:assert/strict';
import {createP1NetworkInterception,p1FinalStatus,p1Cases,p1Widths,p1Destinations} from '../scripts/verify-ui-renewal-p1-browser.mjs';

// Protocol/lifecycle models, not a native Chrome receipt. The real controller
// owns these pending promises; closing this model rejects them like Cdp.close.
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function fixture({cleanupErrors={},onStop=()=>{}}={}) {
  const origin='http://127.0.0.1:8171',failures=[],diagnostic={},commands=[],pending=new Map();
  let closed=false,disposed=false;
  const cdp={listeners:new Map(),send(method,params={}) {
    commands.push({method,params});
    if(closed)return Promise.reject(new Error('CDP closed'));
    if(method==='Fetch.continueRequest'||method==='Fetch.failRequest')return new Promise((resolve,reject)=>pending.set(params.requestId,{resolve,reject}));
    if(method==='Page.stopLoading')onStop(cdp);
    if(cleanupErrors[method])return Promise.reject(new Error(cleanupErrors[method]));
    return Promise.resolve({});
  },close() {
    commands.push({method:'CDP.close'});closed=true;
    for(const action of pending.values())action.reject(new Error('CDP closed'));
    pending.clear();
  }};
  const interception=createP1NetworkInterception(cdp,{origin,pageId:'pointer-320',failures,diagnostic});
  const event=(name,value)=>cdp.listeners.get(name)?.(value);
  const paused=(id,{url=origin+'/bitcoin-cycle-atlas/data.json',networkId='network-'+id}={})=>event('Fetch.requestPaused',{requestId:id,networkId,frameId:'frame-main',request:{url}});
  const settle=(id,error)=>{const action=pending.get(id);assert.ok(action,id);pending.delete(id);error?action.reject(new Error(error)):action.resolve({});};
  const canceled=(networkId,extra={})=>event('Network.loadingFailed',{requestId:networkId,canceled:true,errorText:'net::ERR_ABORTED',...extra});
  const dispose=async()=>{commands.push({method:'dispose'});disposed=true;};
  return {cdp,interception,failures,diagnostic,commands,pending,event,paused,settle,canceled,dispose,
    get closed(){return closed;},get disposed(){return disposed;}};
}
function completeReport(failures=[]) {
  return {sourceStable:true,failures,layouts:p1Cases.map(spec=>({...spec,status:'passed'})),
    journeys:p1Widths.flatMap(width=>['pointer','keyboard'].map(mode=>({id:`${mode}-${width}`,status:'passed',
      chartReturn:{destination:'relay',status:'passed'},steps:p1Destinations.map(item=>({destination:item.id,status:'passed'}))})))};
}

test('the interception policy continues only local/data/blob requests and still denies external traffic',async()=>{
  const f=fixture();await f.interception.start();
  f.paused('local');f.paused('remote',{url:'https://example.invalid/data'});
  f.paused('data',{url:'data:text/plain,ok'});f.paused('blob',{url:'blob:http://127.0.0.1:8171/uuid'});
  assert.deepEqual(f.commands[0],{method:'Fetch.enable',params:{patterns:[{urlPattern:'*'}]}});
  assert.deepEqual(f.commands.slice(1).map(item=>[item.method,item.params.errorReason||null]),[
    ['Fetch.continueRequest',null],['Fetch.failRequest','BlockedByClient'],['Fetch.continueRequest',null],['Fetch.continueRequest',null]]);
  for(const id of ['local','remote','data','blob'])f.settle(id);
  await f.interception.close(f.dispose);
  assert.deepEqual(f.failures,[]);
  assert.deepEqual(f.diagnostic.requests.map(item=>item.status),['continued','blocked','continued','continued']);
  assert.deepEqual(f.commands.slice(-4).map(item=>item.method),['Page.stopLoading','Fetch.disable','CDP.close','dispose']);
});

test('shutdown quiesces new decisions and drains existing promises before stopping, disabling or closing',async()=>{
  const f=fixture();await f.interception.start();f.paused('first');
  const closing=f.interception.close(f.dispose);
  assert.equal(f.interception.close(f.dispose),closing,'one owner performs cleanup exactly once');
  f.paused('arrived-during-drain');
  await tick();
  assert.deepEqual(f.commands.map(item=>item.method),['Fetch.enable','Fetch.continueRequest']);
  assert.equal(f.closed,false);assert.equal(f.disposed,false);
  assert.equal(f.diagnostic.requests.at(-1).status,'teardown-paused');
  f.settle('first');await closing;
  assert.equal(f.closed,true);assert.equal(f.disposed,true);assert.deepEqual(f.failures,[]);
  assert.equal(f.cdp.listeners.has('Fetch.requestPaused'),false);
  assert.equal(f.cdp.listeners.has('Network.loadingFailed'),false);
  assert.equal(f.diagnostic.requests[0].status,'continued');
  assert.equal(f.diagnostic.status,'closed');
});

test('only a matching browser cancellation observed between pause and exact InvalidID reply is classified canceled',async()=>{
  for(const end of [{canceled:true,errorText:'net::ERR_ABORTED'},{canceled:false,errorText:'net::ERR_ABORTED'}]) {
    const f=fixture();await f.interception.start();f.paused('old');
    f.canceled('network-old',end);f.settle('old','Invalid InterceptionId.');
    await f.interception.close(f.dispose);
    const entry=f.diagnostic.requests[0];
    assert.equal(entry.status,'canceled');assert.equal(entry.error,'Invalid InterceptionId.');
    assert.ok(entry.order<entry.cancellation.order&&entry.cancellation.order<=entry.errorOrder);
    assert.deepEqual(f.failures,[]);
    assert.equal(p1FinalStatus(completeReport(f.failures)).qualifiesP1Verification,true);
  }
});

test('an active InvalidID without positive same-request cancellation remains fatal despite all product counts passing',async()=>{
  for(const end of [null,{networkId:'unrelated',canceled:true},{networkId:'network-live',canceled:false,errorText:'net::ERR_FAILED'}]) {
    const f=fixture();await f.interception.start();f.paused('live');
    if(end)f.canceled(end.networkId,end);
    f.settle('live','Invalid InterceptionId.');await f.interception.close(f.dispose);
    assert.equal(f.diagnostic.requests[0].status,'failed');assert.equal(f.failures.length,1);
    assert.match(f.failures[0],/network interception: Invalid InterceptionId/);
    const result=p1FinalStatus(completeReport(f.failures));
    assert.equal(result.counts.passedLayouts,28);assert.equal(result.counts.passedNavigationActivations,56);assert.equal(result.counts.passedChartReturns,8);
    assert.equal(result.qualifiesP1Verification,false);
  }
});

test('earlier reused network IDs and future active cancellations cannot excuse a prior InvalidID error',async()=>{
  for(const timing of ['before-pause','after-error']) {
    const f=fixture();await f.interception.start();
    if(timing==='before-pause')f.canceled('network-reused');
    f.paused('live',{networkId:'network-reused'});f.settle('live','Invalid InterceptionId.');await tick();
    if(timing==='after-error')f.canceled('network-reused');
    await f.interception.close(f.dispose);
    assert.equal(f.diagnostic.requests[0].status,'failed',timing);
    assert.equal(f.failures.length,1,timing);
    assert.equal(p1FinalStatus(completeReport(f.failures)).qualifiesP1Verification,false);
  }
});

test('a reused network ID cancellation belongs only to its newest paused request lifetime',async()=>{
  const f=fixture();await f.interception.start();
  f.paused('older',{networkId:'shared'});f.paused('newest',{networkId:'shared'});f.canceled('shared');
  f.settle('older','Invalid InterceptionId.');f.settle('newest','Invalid InterceptionId.');
  await f.interception.close(f.dispose);
  const [older,newest]=f.diagnostic.requests;
  assert.equal(older.status,'failed');assert.equal(newest.status,'canceled');
  assert.equal(newest.cancellation.pausedRequestOrder,newest.order);
  assert.equal(f.failures.length,1);assert.match(f.failures[0],/request older/);
  assert.equal(p1FinalStatus(completeReport(f.failures)).qualifiesP1Verification,false);
});

test('a cancellation caused by our stopLoading cannot retroactively excuse an error, including a late rejection',async()=>{
  for(const rejectDuringDrain of [false,true]) {
    const f=fixture({onStop:cdp=>cdp.listeners.get('Network.loadingFailed')({requestId:'network-live',canceled:true,errorText:'net::ERR_ABORTED'})});
    await f.interception.start();f.paused('live');
    let closing;
    if(rejectDuringDrain)closing=f.interception.close(f.dispose);
    f.settle('live','Invalid InterceptionId.');
    await (closing||f.interception.close(f.dispose));
    assert.equal(f.diagnostic.requests[0].status,'failed');assert.equal(f.failures.length,1);
    assert.equal(f.diagnostic.networkEnds[0].phase,'stopping');
  }
});

test('unexpected active protocol failures and malformed URLs are never cancellation exceptions',async()=>{
  for(const message of ['CDP closed','Invalid parameters','CDP timeout: Fetch.continueRequest']) {
    const f=fixture();await f.interception.start();f.paused('live');f.canceled('network-live');f.settle('live',message);
    await f.interception.close(f.dispose);
    assert.equal(f.diagnostic.requests[0].status,'failed');assert.ok(f.failures[0].includes(message));
  }
  const f=fixture();await f.interception.start();f.paused('bad',{url:'not a URL'});await f.interception.close(f.dispose);
  assert.equal(f.diagnostic.requests[0].status,'failed');assert.match(f.failures[0],/Invalid URL/);
});

test('an unexpected live connection close still rejects the pending action and disqualifies verification',async()=>{
  const f=fixture();await f.interception.start();f.paused('live');f.cdp.close();
  await f.interception.close(f.dispose);
  assert.equal(f.diagnostic.requests[0].status,'failed');
  assert.ok(f.failures.some(item=>item.includes('CDP closed; request live')));
  assert.ok(f.failures.some(item=>item.includes('Page.stopLoading: CDP closed')));
  assert.ok(f.failures.some(item=>item.includes('Fetch.disable: CDP closed')));
  assert.equal(p1FinalStatus(completeReport(f.failures)).qualifiesP1Verification,false);
});

test('stop, disable and disposal failures remain failures while cleanup is still attempted',async()=>{
  for(const method of ['Page.stopLoading','Fetch.disable']) {
    const f=fixture({cleanupErrors:{[method]:'cleanup rejected'}});await f.interception.start();await f.interception.close(f.dispose);
    assert.equal(f.closed,true);assert.equal(f.disposed,true);assert.equal(f.diagnostic.status,'failed');
    assert.ok(f.failures.some(item=>item.includes(method+': cleanup rejected')));
    assert.equal(p1FinalStatus(completeReport(f.failures)).qualifiesP1Verification,false);
  }
  const f=fixture();await f.interception.start();
  await assert.rejects(f.interception.close(async()=>{throw new Error('context remains');}),/context remains/);
  assert.equal(f.closed,true);assert.equal(f.diagnostic.status,'failed');
  assert.ok(f.failures.some(item=>item.includes('Target.disposeBrowserContext: context remains')));
  assert.equal(p1FinalStatus(completeReport(f.failures)).qualifiesP1Verification,false);
});

test('benign interception cancellation cannot turn an actual product or chart-return failure into qualification',async()=>{
  const f=fixture();await f.interception.start();f.paused('old');f.canceled('network-old');f.settle('old','Invalid InterceptionId.');await f.interception.close(f.dispose);
  const report=completeReport(f.failures);report.journeys[0].chartReturn.status='failed';report.journeys[0].status='failed';
  report.failures.push('pointer-320 chart-return: Missing interactive target #mobile-details-toggle');
  const result=p1FinalStatus(report);
  assert.equal(result.counts.passedChartReturns,7);assert.equal(result.qualifiesP1Verification,false);assert.equal(result.status,'failed');
});
