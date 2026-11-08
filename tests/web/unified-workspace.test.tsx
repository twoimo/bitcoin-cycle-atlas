import React, { act, useState } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import type { Root } from 'react-dom/client';
import { WORKSPACE_INSTRUMENTS, workspaceInstrument, searchWorkspaceInstruments } from '../../dist/workspace-instruments.js';
import { atlasPageHref } from '../../dist/atlas-navigation.js';
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
  async function select(selector:string,value:string){const node=document.querySelector(selector);assert(node,selector);const options=[...node.querySelectorAll('option')],chosen=options.find(option=>option.getAttribute('value')===value);assert(chosen,value);await act(async()=>{for(const option of options)option.selected=false;chosen.selected=true;assert.equal((node as unknown as HTMLSelectElement).value,value);node.dispatchEvent(new dom.Event('change',{bubbles:true,cancelable:true}));});}
  async function key(selector:string,key:string,properties:{isComposing?:boolean;keyCode?:number}={}){const node=document.querySelector(selector);assert(node,selector);const event=new dom.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'key',{value:key});for(const [name,value] of Object.entries(properties))Object.defineProperty(event,name,{value});await act(async()=>node.dispatchEvent(event));}
  async function message(data:unknown,origin='https://example.test',source:unknown=parent){await act(async()=>{for(const listener of listeners.get('message')??[])listener({data,origin,source});});}
  return {document,click,select,key,message,posts,cleanup};
}

test('chart search exposes all retained chart types and supports keyboard selection and explicit close',async t=>{
  const chosen:string[]=[];
  function Harness(){const [instrument,setInstrument]=useState<WorkspaceInstrument>(workspaceInstrument('TQQQ')!);return <ChartWorkspaceToolbar instrument={instrument} onSelect={item=>{chosen.push(item.symbol);setInstrument(item);}}/>;}
  const fixture=await mount(<Harness/>);t.after(fixture.cleanup);
  await fixture.click('[role=combobox]');
  assert.equal(fixture.document.querySelectorAll('[role=option]').length,8);
  assert.equal(fixture.document.querySelector('.workspace-search-popover')!.parentElement,fixture.document.body,'standalone results escape the clipped toolbar through a body portal');
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

test('one standalone price-chart destination retains every selected source and region across market analysis',async t=>{
  const pending:typeof import('../../apps/web/src/load-snapshot.js').loadSnapshot = options => new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(options.signal?.reason),{once:true}));
  const fixture=await mount(<MarketLabApp load={pending} clock={()=>new Date('2026-11-04T06:00:00Z')}/>);t.after(fixture.cleanup);
  const priceLink=()=>fixture.document.querySelector('[data-atlas-page="outlook"]')!;
  const selectedPage=()=>fixture.document.querySelector('.atlas-nav [aria-current="page"]')?.getAttribute('data-atlas-page');
  assert.deepEqual([...fixture.document.querySelectorAll('.atlas-nav [data-atlas-page]')].map(node=>node.getAttribute('data-atlas-page')),['outlook','market-us','evidence','data','ipo','relay']);
  assert.deepEqual([...fixture.document.querySelectorAll('.atlas-nav [data-atlas-page]')].map(node=>[node.getAttribute('aria-label'),node.getAttribute('href')]),[
    ['가격 차트','/market-lab/charts/?symbol=TQQQ'],
    ['시장 분석','/market-lab/'],
    ['리서치','/?page=evidence'],
    ['자산 비교','/?page=data'],
    ['공모주','/?page=ipo'],
    ['릴레이 콘텐츠','/?page=relay'],
  ]);
  assert.equal(fixture.document.querySelector('[data-atlas-page="rsi"]'),null);
  for(const instrument of WORKSPACE_INSTRUMENTS) {
    await fixture.click('[role=combobox]');
    await fixture.click(`[data-workspace-symbol="${instrument.symbol}"]`);
    const href=atlasPageHref('outlook',{symbol:instrument.symbol});
    assert.equal(priceLink().getAttribute('href'),href,instrument.symbol);
    assert.equal(selectedPage(),'outlook',instrument.symbol);
    await fixture.click('[data-atlas-page="market-us"]');
    await fixture.click('[data-workspace-page="scenario"]');
    assert.equal(selectedPage(),'market-us',instrument.symbol);
    assert.equal(priceLink().getAttribute('href'),href,'analysis preserves the exact instrument link');
    await fixture.click('[data-atlas-page="outlook"]');
    assert.equal(selectedPage(),'outlook',instrument.symbol);
    assert.equal(fixture.document.querySelector('[data-workspace]')?.getAttribute('data-workspace'),'charts');
    assert.equal(fixture.document.querySelector('.workspace-current-instrument strong')?.textContent,instrument.assetClass==='housing'?instrument.koreanName:instrument.product);
    assert.equal(priceLink().getAttribute('href'),href,'returning preserves the exact source and region');
  }
});

test('embedded charts use host-owned search and reject old or foreign navigation',async t=>{
  const pending:typeof import('../../apps/web/src/load-snapshot.js').loadSnapshot = options => new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(options.signal?.reason),{once:true}));
  const fixture=await mount(<MarketLabApp load={pending} embedded clock={()=>new Date('2026-11-04T06:00:00Z')}/>, 'https://example.test/market-lab/app/?embedded=1&lab-tab=rsi&symbol=TQQQ&epoch=4');t.after(fixture.cleanup);
  assert.equal(fixture.document.querySelector('[role=combobox][aria-label="종목·지역 검색"]'),null,'the embedded child does not duplicate the host instrument search');
  assert.equal(fixture.posts.some(post=>post.message.kind==='atlas:center-select'),false,'mounting the embedded page cannot request another host selection');
  assert.equal(fixture.posts.findLast(post=>post.message.kind==='atlas:center-state')!.message.symbol,'TQQQ');
  assert.equal(fixture.document.querySelector('.housing-workbench'),null,'only an accepted host message can replace the selected view');
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

test('rapid market tab choices ignore intermediate replies and yield to host-owned navigation', async t => {
  const pending:typeof import('../../apps/web/src/load-snapshot.js').loadSnapshot = options => new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(options.signal?.reason),{once:true}));
  const fixture = await mount(<MarketLabApp load={pending} embedded />, 'https://example.test/market-lab/app/?embedded=1&lab-tab=scenario&epoch=10'); t.after(fixture.cleanup);
  const selected = () => fixture.document.querySelector('[data-workspace-page][aria-selected=true]')?.getAttribute('data-workspace-page');
  const choices = () => fixture.posts.filter(post => post.message.kind === 'atlas:center-select').map(post => post.message);
  await fixture.click('[data-workspace-page="market-kr"]');
  await fixture.click('[data-workspace-page="cashflow"]');
  await fixture.click('[data-workspace-page="scenario"]');
  assert.deepEqual(choices().map(({ page, epoch, intentSerial }) => ({ page, epoch, intentSerial })), [
    { page: 'market-kr', epoch: 10, intentSerial: 1 }, { page: 'cashflow', epoch: 10, intentSerial: 2 }, { page: 'scenario', epoch: 10, intentSerial: 3 },
  ]);
  await fixture.message({ kind: 'atlas:center-navigate', page: 'market-kr', symbol: 'TQQQ', epoch: 11, intentSerial: 1 });
  await fixture.message({ kind: 'atlas:center-navigate', page: 'cashflow', symbol: 'TQQQ', epoch: 12, intentSerial: 2 });
  assert.equal(selected(), 'scenario', 'intermediate replies do not briefly replace the final choice');
  await fixture.message({ kind: 'atlas:center-navigate', page: 'scenario', symbol: 'TQQQ', epoch: 13, intentSerial: 3 });
  assert.equal(fixture.posts.findLast(post => post.message.kind === 'atlas:center-state')!.message.epoch, 13);
  await fixture.click('[data-workspace-page="cashflow"]');
  assert.equal(choices().at(-1).epoch, 13);
  await fixture.message({ kind: 'atlas:center-navigate', page: 'market-us', symbol: 'TQQQ', epoch: 15 });
  assert.equal(selected(), 'market-us', 'host search/menu/history navigation cancels a pending child choice');
  await fixture.message({ kind: 'atlas:center-navigate', page: 'cashflow', symbol: 'TQQQ', epoch: 14, intentSerial: 4 });
  assert.equal(selected(), 'market-us');
  await fixture.click('[data-workspace-page="market-kr"]');
  assert.deepEqual(choices().at(-1), { kind: 'atlas:center-select', page: 'market-kr', symbol: 'TQQQ', region: undefined, epoch: 15, intentSerial: 5 });
  await fixture.message({ kind: 'atlas:center-navigate', page: 'market-kr', symbol: 'TQQQ', epoch: 16, intentSerial: 5 });
  assert.equal(selected(), 'market-kr');
});

test('rapid header region choices keep the last housing intent through delayed host replies', async t => {
  const pending:typeof import('../../apps/web/src/load-snapshot.js').loadSnapshot = options => new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(options.signal?.reason),{once:true}));
  const fixture = await mount(<MarketLabApp load={pending} embedded />, 'https://example.test/market-lab/app/?embedded=1&lab-tab=housing&symbol=HOUSING-SEOUL&epoch=20'); t.after(fixture.cleanup);
  const selected = () => fixture.document.querySelector('select[aria-label="부동산 지역"] option[selected]')!.getAttribute('value');
  assert.equal(selected(),'seoul');
  assert.equal(fixture.document.querySelector('[role=combobox][aria-label="종목·지역 검색"]'),null);
  await fixture.select('select[aria-label="부동산 지역"]','gyeonggi');
  await fixture.select('select[aria-label="부동산 지역"]','busan');
  const choices = fixture.posts.filter(post => post.message.kind === 'atlas:center-select').map(post => post.message);
  assert.deepEqual(choices.map(({ symbol, region, epoch, intentSerial }) => ({ symbol, region, epoch, intentSerial })), [
    { symbol: 'HOUSING-GYEONGGI', region: 'gyeonggi', epoch: 20, intentSerial: 1 }, { symbol: 'HOUSING-BUSAN', region: 'busan', epoch: 20, intentSerial: 2 },
  ]);
  assert.equal(selected(),'seoul','a child region control waits for the host acknowledgement');
  await fixture.message({ kind: 'atlas:center-navigate', page: 'housing', symbol: 'HOUSING-GYEONGGI', region: 'gyeonggi', epoch: 21, intentSerial: 1 });
  assert.equal(selected(),'seoul','the intermediate reply cannot replace the newer queued region');
  await fixture.message({ kind: 'atlas:center-navigate', page: 'housing', symbol: 'HOUSING-BUSAN', region: 'busan', epoch: 22, intentSerial: 2 });
  assert.equal(selected(), 'busan');
  const state = fixture.posts.findLast(post => post.message.kind === 'atlas:center-state')!.message;
  assert.equal(state.symbol, 'HOUSING-BUSAN'); assert.equal(state.epoch, 22);
  await fixture.message({ kind: 'atlas:center-navigate', page: 'housing', symbol: 'HOUSING-GYEONGGI', region: 'gyeonggi', epoch: 21, intentSerial: 1 });
  assert.equal(selected(),'busan','a late duplicate cannot undo the acknowledged final region');
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
