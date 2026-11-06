import React, { act, useState } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import type { Root } from 'react-dom/client';
import { WORKSPACE_INSTRUMENTS, workspaceInstrument, searchWorkspaceInstruments } from '../../dist/workspace-instruments.js';
import { ChartWorkspaceToolbar, MarketWorkspaceToolbar, type WorkspaceInstrument } from '../../apps/web/src/components/workspace-toolbar.js';
import { MarketLabApp } from '../../apps/web/src/app.js';

test('unified chart search resolves source-backed instrument identities, Korean names and housing regions', async () => {
  const [market,housing,themes] = await Promise.all(['market-lab','housing','themes'].map(name => readFile(new URL(`../../dist/data/${name}.json`,import.meta.url),'utf8').then(JSON.parse)));
  for (const instrument of WORKSPACE_INSTRUMENTS.filter(item => item.page === 'rsi')) {
    const observation = market.markets.find((item:{id:string}) => item.id === instrument.id);
    assert(observation,`${instrument.symbol} has a retained market series`);
    assert.equal(instrument.product,observation.symbol);
    assert.equal(instrument.currency,observation.unit);
  }
  assert.deepEqual(WORKSPACE_INSTRUMENTS.filter(item => item.page === 'housing').map(item => item.region).sort(),housing.regions.map((item:{id:string}) => item.id).sort());
  const hype = workspaceInstrument('hype/usdc')!;
  assert.equal(hype.symbol,themes.asset.symbol); assert.equal(hype.currency,themes.asset.quote);
  assert.equal(workspaceInstrument('  ｓｏｘｌ  ')?.symbol,'SOXL');
  assert.deepEqual(searchWorkspaceInstruments('서울').map(item=>item.symbol),['HOUSING-SEOUL']);
  assert.deepEqual(searchWorkspaceInstruments('하이퍼리퀴드').map(item=>item.symbol),['HYPE']);
  assert.deepEqual(searchWorkspaceInstruments('코스닥').map(item=>item.symbol),['233740']);
  assert.deepEqual(searchWorkspaceInstruments('없는 종목'),[]);
  assert.deepEqual(searchWorkspaceInstruments('HYPE','부동산'),[]);
});

async function mount(content:React.ReactNode,href='https://example.test/market-lab/charts/?symbol=TQQQ') {
  const {document,window:dom} = parseHTML('<html><head><meta name="atlas-static" content="1"></head><body><div id="root"></div></body></html>');
  // Linkedom does not expose the modern input-event capability property. Supply
  // it before React starts so keyboard tests use the browser input-event path.
  Object.defineProperty(document,'oninput',{value:null,configurable:true});
  const posts:{message:any;origin:string}[] = [], listeners = new Map<string,Set<(event:any)=>void>>();
  const parent = { postMessage:(message:unknown,origin:string)=>posts.push({message,origin}) };
  const window = {
    document,parent,HTMLIFrameElement:dom.HTMLIFrameElement,
    addEventListener:(kind:string,listener:(event:any)=>void)=>{if(!listeners.has(kind))listeners.set(kind,new Set());listeners.get(kind)!.add(listener);},
    removeEventListener:(kind:string,listener:(event:any)=>void)=>listeners.get(kind)?.delete(listener),
  };
  const fetch = (_url:unknown,options?:RequestInit):Promise<Response> => new Promise((_resolve,reject)=>{
    if(options?.signal?.aborted)reject(options.signal.reason);
    else options?.signal?.addEventListener('abort',()=>reject(options.signal?.reason),{once:true});
  });
  const globals = {document,window,location:new URL(href),fetch,IS_REACT_ACT_ENVIRONMENT:true};
  const previous = new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{value,configurable:true});
  const { createRoot } = await import('react-dom/client');
  let root:Root|null = createRoot(document.getElementById('root')!);
  async function cleanup(){
    if(root){await act(async()=>root!.unmount());root=null;}
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
  try {await act(async()=>root!.render(content));} catch(error){await cleanup();throw error;}
  async function click(selector:string){const node=document.querySelector(selector);assert(node,selector);await act(async()=>node.dispatchEvent(new dom.Event('click',{bubbles:true,cancelable:true})));}
  async function key(selector:string,key:string,properties:{isComposing?:boolean;keyCode?:number}={}){const node=document.querySelector(selector);assert(node,selector);const event=new dom.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'key',{value:key});for(const [name,value] of Object.entries(properties))Object.defineProperty(event,name,{value});await act(async()=>node.dispatchEvent(event));}
  async function message(data:unknown,origin='https://example.test',source:unknown=parent){await act(async()=>{for(const listener of listeners.get('message')??[])listener({data,origin,source});});}
  return {document,click,key,message,posts,cleanup};
}

test('chart search exposes all retained chart types and supports keyboard selection and explicit close',async t=>{
  const chosen:string[]=[];
  function Harness(){const [instrument,setInstrument]=useState<WorkspaceInstrument>(workspaceInstrument('TQQQ')!);return <ChartWorkspaceToolbar instrument={instrument} onSelect={item=>{chosen.push(item.symbol);setInstrument(item);}}/>;}
  const fixture=await mount(<Harness/>);t.after(fixture.cleanup);
  await fixture.click('[role=combobox]');
  assert.equal(fixture.document.querySelectorAll('[role=option]').length,8);
  await fixture.key('[role=combobox]','Enter',{isComposing:true});
  await fixture.key('[role=combobox]','Enter',{keyCode:229});
  assert.deepEqual(chosen,[],'IME confirmation never selects a result');
  assert.equal(fixture.document.querySelector('[role=combobox]')!.getAttribute('aria-expanded'),'true');
  await fixture.key('[role=combobox]','End');
  const active=fixture.document.querySelector('[role=combobox]')!.getAttribute('aria-activedescendant')!;
  assert.equal(fixture.document.getElementById(active)!.getAttribute('data-workspace-symbol'),'HOUSING-NATIONAL');
  await fixture.key('[role=combobox]','Enter');
  assert.deepEqual(chosen,['HOUSING-NATIONAL']);
  assert.match(fixture.document.querySelector('.workspace-current-instrument')!.textContent!,/전국 아파트/);
  assert.equal(fixture.document.querySelector('[role=combobox]')!.getAttribute('aria-expanded'),'false');
  await fixture.click('[role=combobox]');
  await fixture.click('.workspace-search-groups button:nth-child(3)');
  assert.deepEqual([...fixture.document.querySelectorAll('[role=option]')].map(node=>node.getAttribute('data-workspace-symbol')),['HYPE']);
  await fixture.key('[role=combobox]','Enter');assert.deepEqual(chosen,['HOUSING-NATIONAL','HYPE']);
  await fixture.click('[role=combobox]');await fixture.click('[aria-label="검색 결과 닫기"]');
  assert.equal(fixture.document.querySelector('.workspace-search-popover'),null);
});

test('market workspace presents one labelled view selector with independently selected US and KR diagnostics',async t=>{
  function Harness(){const [page,setPage]=useState('market-us');return <MarketWorkspaceToolbar page={page} onNavigate={setPage}/>;}
  const fixture=await mount(<Harness/>);t.after(fixture.cleanup);
  assert.equal(fixture.document.querySelectorAll('[role=tablist]').length,1);
  assert.equal(fixture.document.querySelectorAll('[role=tab]').length,4);
  await fixture.click('[data-workspace-page="market-kr"]');
  assert.equal(fixture.document.querySelector('[role=tab][aria-selected=true]')!.getAttribute('data-workspace-page'),'market-kr');
  await fixture.key('[data-workspace-page="market-kr"]','End');
  assert.equal(fixture.document.querySelector('[role=tab][aria-selected=true]')!.getAttribute('data-workspace-page'),'cashflow');
});

test('embedded chart selection waits for the owning host and ignores old or foreign navigation',async t=>{
  const pending:typeof import('../../apps/web/src/load-snapshot.js').loadSnapshot = options => new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(options.signal?.reason),{once:true}));
  const fixture=await mount(<MarketLabApp load={pending} embedded clock={()=>new Date('2026-11-04T06:00:00Z')}/>, 'https://example.test/market-lab/app/?embedded=1&lab-tab=rsi&symbol=TQQQ&epoch=4');t.after(fixture.cleanup);
  await fixture.click('[role=combobox]');await fixture.click('[data-workspace-symbol="HOUSING-SEOUL"]');
  const selection=fixture.posts.findLast(post=>post.message.kind==='atlas:center-select');
  assert.deepEqual(selection,{message:{kind:'atlas:center-select',page:'housing',symbol:'HOUSING-SEOUL',region:'seoul',epoch:4},origin:'https://example.test'});
  assert.equal(fixture.document.querySelector('.housing-workbench'),null,'the iframe cannot replace the host selection on its own');
  const target={kind:'atlas:center-navigate',page:'housing',symbol:'HOUSING-SEOUL',region:'seoul',epoch:5};
  await fixture.message(target,'https://foreign.test');await fixture.message(target,'https://example.test',{});
  await fixture.message({...target,epoch:3});
  assert.equal(fixture.document.querySelector('.housing-workbench'),null);
  await fixture.message(target);
  assert(fixture.document.querySelector('.housing-workbench'));
  assert.equal(fixture.document.querySelector('select[aria-label="부동산 지역"] option[selected]')!.getAttribute('value'),'seoul');
  assert.equal(fixture.posts.findLast(post=>post.message.kind==='atlas:center-state')!.message.symbol,'HOUSING-SEOUL');
  await fixture.message({kind:'atlas:center-navigate',page:'rsi',symbol:'SOXL',epoch:4});
  assert(fixture.document.querySelector('.housing-workbench'),'late RSI rendering cannot replace the current housing selection');
  await fixture.message({kind:'atlas:center-navigate',page:'scenario',symbol:'HOUSING-SEOUL',epoch:6});
  assert(fixture.document.querySelector('[data-workspace-page="scenario"][aria-selected=true]'));
  assert.equal(fixture.posts.findLast(post=>post.message.kind==='atlas:center-state')!.message.symbol,'HOUSING-SEOUL','market views preserve the host selected instrument identity');
});

test('independent charts and synchronous calculators defer the market snapshot until its first consumer',async t=>{
  let calls=0,signal:AbortSignal|undefined;
  const load:typeof import('../../apps/web/src/load-snapshot.js').loadSnapshot=options=>{
    calls++;signal=options?.signal;return new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(signal?.reason),{once:true}));
  };
  const fixture=await mount(<MarketLabApp load={load} embedded/>, 'https://example.test/market-lab/app/?embedded=1&lab-tab=housing&symbol=HOUSING-SEOUL&epoch=1');t.after(fixture.cleanup);
  assert.equal(calls,0,'an initial housing chart reads only its own data source');
  await fixture.message({kind:'atlas:center-navigate',page:'scenario',symbol:'HOUSING-SEOUL',epoch:2});
  await fixture.click('[data-action="negative"]');
  assert.equal(fixture.document.querySelector('.ml-index strong')!.textContent,'87.52');
  assert.equal(fixture.document.querySelector('.atlas-inline-loading'),null,'no pending-data placeholder when a request has not been made');
  assert.equal(calls,0);
  await fixture.message({kind:'atlas:center-navigate',page:'market-us',symbol:'HOUSING-SEOUL',epoch:3});
  assert.equal(calls,1);assert.equal(signal?.aborted,false);
  await fixture.message({kind:'atlas:center-navigate',page:'scenario',symbol:'HOUSING-SEOUL',epoch:4});
  await fixture.message({kind:'atlas:center-navigate',page:'rsi',symbol:'TQQQ',epoch:5});
  assert.equal(calls,1,'switching views retains the original snapshot request owner');
  assert.equal(signal?.aborted,false);
  await fixture.cleanup();assert.equal(signal?.aborted,true);
});
