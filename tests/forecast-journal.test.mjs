import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

const BASE='https://example.invalid/app/';
const LEDGER=new URL('../dist/data/forecast-ledger/',import.meta.url);
const TIMEOUT_MS=15000;
const testOptions={timeout:20000};

const flush=async()=>{for(let i=0;i<20;i++)await new Promise(setImmediate);};
const settled=async journal=>{for(let i=0;i<5000&&journal.loading();i++)await new Promise(setImmediate);};
const until=async ready=>{for(let i=0;i<5000&&!ready();i++)await new Promise(setImmediate);};
const shipped=async request=>({ok:true,status:200,text:()=>readFile(new URL(request.path.replace('data/forecast-ledger/',''),LEDGER),'utf8')});
const stalled=signal=>new Promise((_,reject)=>signal?.addEventListener('abort',()=>reject(signal.reason),{once:true}));

let instances=0;
async function mountJournal(t,respond){
  const {window,document}=parseHTML('<!doctype html><html><body></body></html>');
  Object.defineProperty(document,'baseURI',{value:BASE});
  const create=document.createElement.bind(document);
  document.createElement=tag=>{
    const node=create(tag);
    if(tag==='dialog'){
      Object.defineProperty(node,'open',{get:()=>node.hasAttribute('open')});
      node.showModal=()=>node.setAttribute('open','');
      node.close=()=>{if(node.open){node.removeAttribute('open');node.dispatchEvent(new window.Event('close'));}};
    }
    return node;
  };
  // Chrome holds a request for a URL until the pending request for that URL ends.
  const requests=[],pending=new Map();
  const globals={document,window,CustomEvent:window.CustomEvent,fetch:(url,options={})=>{
    const request={path:String(url).replace(BASE,''),signal:options.signal};
    requests.push(request);
    const turn=new Promise((resolve,reject)=>{
      (pending.get(request.path)??Promise.resolve()).then(resolve);
      request.signal?.addEventListener('abort',()=>reject(request.signal.reason),{once:true});
    });
    const response=turn.then(()=>respond(request));
    pending.set(request.path,response.then(()=>{},()=>{}));
    return response;
  }};
  for(const [key,value]of Object.entries(globals)){
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});
  }
  t.mock.timers.enable({apis:['setTimeout']});
  const {openForecastJournal}=await import('../dist/forecast-journal.js?instance='+(++instances));
  const dialog=()=>document.querySelector('#forecast-journal');
  return {requests,
    open:tab=>openForecastJournal({tab,opener:null}),
    close:()=>dialog().close(),
    loading:()=>dialog().querySelector('.journal-body [data-atlas-skeleton]')!==null,
    alert:()=>dialog().querySelector('.journal-body [role="alert"]')?.textContent??'',
    text:()=>dialog().querySelector('.journal-body').textContent,
    click:selector=>dialog().querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true})),
    sent:path=>requests.filter(request=>request.path===path).length};
}

for(const [tab,path]of [['records','data/forecast-ledger/index.json'],['evaluation','data/forecast-ledger/evaluation.json'],
  ['experiments','data/forecast-ledger/experiments.json'],['data','publication.json']]){
  test(`a stalled ${tab} request becomes the retryable error state`,testOptions,async t=>{
    const journal=await mountJournal(t,request=>stalled(request.signal));
    journal.open(tab);await flush();
    assert.equal(journal.sent(path),1);
    assert.equal(journal.loading(),true,'the request starts behind the loading skeleton');

    t.mock.timers.tick(TIMEOUT_MS);await flush();
    assert.equal(journal.loading(),false,'a stall must not keep the skeleton forever');
    assert.match(journal.alert(),/기록을 확인하지 못했습니다/);
    assert.equal(journal.requests[0].signal?.aborted,true,'the stalled connection is released');

    journal.click('[data-journal-retry]');await flush();
    assert.equal(journal.sent(path),2,'retry sends a new request');
  });
}

test('a reopened journal shows the records whose first requests never answered',testOptions,async t=>{
  let answering=false;
  const journal=await mountJournal(t,request=>answering||request.path.endsWith('index.json')?shipped(request):stalled(request.signal));
  journal.open('changes');await flush();
  assert.equal(journal.loading(),true);

  journal.close();answering=true;journal.open('changes');await settled(journal);
  assert.match(journal.text(),/보존본의 변경 이유/,'a reopened journal must not wait on the abandoned requests');
});

test('retry after a failed record does not wait behind a snapshot that never answered',testOptions,async t=>{
  let answering=false;
  const journal=await mountJournal(t,request=>answering||request.path.endsWith('index.json')?shipped(request)
    :request.path.includes('/records/')?{ok:false,status:503}:stalled(request.signal));
  journal.open('changes');await until(()=>journal.alert());
  assert.match(journal.alert(),/기록을 확인하지 못했습니다/);

  answering=true;journal.click('[data-journal-retry]');await settled(journal);
  assert.match(journal.text(),/보존본의 변경 이유/);
});

test('reopening keeps verified records and refreshes only the index',testOptions,async t=>{
  const journal=await mountJournal(t,shipped);
  const records=()=>journal.requests.filter(request=>request.path.includes('/records/')).length;
  journal.open('changes');await settled(journal);
  assert.match(journal.text(),/보존본의 변경 이유/);
  assert.equal(records(),2,'the comparison verifies two shipped records');

  journal.close();journal.open('changes');await settled(journal);
  assert.match(journal.text(),/보존본의 변경 이유/);
  assert.equal(journal.sent('data/forecast-ledger/index.json'),2);
  assert.equal(records(),2,'verified immutable records are reused');
});
