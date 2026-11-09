import React,{act,useState} from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import type {Market,MarketSnapshot,Point} from '@atlas/contracts/market-lab';
import {useRsiSimulation,SimulationHud,SimulationSettingsForm,SimulationDetails,RsiDetailDialog} from '../../apps/web/src/components/rsi-simulation.js';
import {CompactToolbarProvider,CompactToolbarHost} from '../../apps/web/src/components/compact-toolbar.js';
import {TradingCriteriaHud,TradingCriteriaDetails,tradingCriteriaState} from '../../apps/web/src/components/rsi-trading-criteria.js';
import {simulateRsiTranches} from '@atlas/domain/rsi-simulation';
import {rsiChartLayout} from '../../dist/rsi-chart-layout.js';
import {chartLegendSlot} from '../../dist/ui/chart-legend-layout.js';

const prices:Point[]=[...Array.from({length:20},(_,i)=>100+i),...Array.from({length:18},(_,i)=>116-i*3),...Array.from({length:20},(_,i)=>68+i*4)]
  .map((close,index)=>[new Date(Date.UTC(2025,0,index+1)).toISOString().slice(0,10),close]);
const market:Market={id:'tqqq',sourceId:'market-tqqq',symbol:'TQQQ',name:'TQQQ',region:'us',unit:'USD',timezone:'America/New_York',prices};
function snapshot(input:Market,lastObservation='2025-02-27'):MarketSnapshot{return {
  schemaVersion:1,generatedAt:'2025-01-30T00:10:00Z',modelVersion:'fixture',markets:[input],regions:{} as MarketSnapshot['regions'],
  sources:[{id:input.sourceId,label:'Fixture completed-close source',url:'https://example.test/prices',unit:input.unit,frequency:'daily',
    retrievedAt:'2025-01-30T00:00:00Z',lastObservation,releaseTimeKnown:true,status:'ready',timezone:input.timezone}]
};}
const near=(a:number,b:number)=>assert(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);

async function mount(content:React.ReactNode,storage=new Map<string,string>(),embedded=false){
  const {document,window:dom}=parseHTML('<html><body><div id="host-toolbar"></div><iframe data-toolbar-id="host-toolbar" data-center-epoch="1"></iframe><div id="root"></div></body></html>');
  Object.defineProperty(document,'oninput',{configurable:true,value:null});
  let focused:Element|null=null;
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>focused});
  const elementPrototype=dom.HTMLElement.prototype as unknown as HTMLElement;
  const previousFocus=elementPrototype.focus;
  elementPrototype.focus=function(){focused=this;};
  const create=document.createElement.bind(document);
  document.createElement=((name:string)=>{
    const node=create(name);
    if(name==='dialog'){
      Object.defineProperty(node,'open',{configurable:true,get:()=>node.hasAttribute('open')});
      Object.assign(node,{showModal(){node.setAttribute('open','');},close(){if(!node.hasAttribute('open'))return;node.removeAttribute('open');node.dispatchEvent(new dom.Event('close'));}});
    }
    return node;
  }) as typeof document.createElement;
  const frame=document.querySelector('iframe')!;
  const window={document,HTMLIFrameElement:dom.HTMLIFrameElement,frameElement:embedded?frame:null};
  const globals={document,window,Element:dom.Element,IS_REACT_ACT_ENVIRONMENT:true,
    localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}};
  const old=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
  const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root')!);
  const cleanup=async()=>{await act(async()=>root.unmount());elementPrototype.focus=previousFocus;for(const [key,value]of old){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}};
  try{await act(async()=>root.render(content));}catch(error){await cleanup();throw error;}
  return {document,storage,frame,cleanup,
    render:(content:React.ReactNode)=>act(async()=>root.render(content)),
    click:async(selector:string)=>{const node=document.querySelector(selector) as unknown as HTMLElement;assert(node,selector);await act(async()=>{node.focus();node.dispatchEvent(new dom.Event('click',{bubbles:true,cancelable:true}));});},
    input:async(selector:string,value:string)=>{const node=document.querySelector(selector) as unknown as HTMLInputElement;assert(node,selector);await act(async()=>{
      const setter=Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype,'value')?.set;
      if(setter)setter.call(node,value);else node.value=value;
      node.dispatchEvent(new dom.Event('input',{bubbles:true,cancelable:true}));
    });},
    submit:async()=>{await act(async()=>document.querySelector('form')!.dispatchEvent(new dom.Event('submit',{bubbles:true,cancelable:true})));},
    cancel:async()=>{await act(async()=>document.querySelector('dialog')!.dispatchEvent(new dom.Event('cancel',{cancelable:true})));},
    hideFrame:async()=>{await act(async()=>{frame.hidden=true;await Promise.resolve();});}
  };
}

test('HUD uses exchange-day and source cutoffs, source retrieval time, and excludes an open position from n',async t=>{
  let current!:ReturnType<typeof useRsiSimulation>;
  const now=new Date('2025-01-30T00:30:00Z'); // New York is still Jan 29.
  function Harness({data,doc}:{data:Market;doc:MarketSnapshot}){
    current=useRsiSimulation(data.symbol,data,doc,now);
    return <SimulationHud symbol={data.symbol} unit={data.unit} result={current.result} error={current.error} onDetails={()=>{}} onSettings={()=>{}}/>;
  }
  const doc=snapshot(market,'2025-01-30');const fixture=await mount(<Harness data={market} doc={doc}/>);t.after(fixture.cleanup);
  assert.equal(current.error,'');assert.equal(current.confirmedThrough,'2025-01-28');
  assert.equal(current.result!.quantity>0,true);assert.equal(current.result!.holdings.length,1);
  assert.equal(current.result!.metrics.closedTranches,0);assert.equal(current.result!.metrics.winRatePct,null);
  assert.match(fixture.document.querySelector('[data-rsi-win-badge]')!.textContent!,/승률 — · n=0/);
  assert.match(fixture.document.querySelector('[data-rsi-ongoing]')!.textContent!,/진행 중 1트랜치 · 승률 제외/);
  assert.match(fixture.document.querySelector('[data-rsi-hud="current-price"]')!.textContent!,/95\.00.*USD/);
  assert.match(fixture.document.querySelector('[data-rsi-hud="updated-at"]')!.textContent!,/확정봉 2025-01-28.*09:00 KST/);
  assert.equal(current.result!.updatedAt,doc.sources[0].retrievedAt);
  const before={trades:current.result!.trades,equity:current.result!.equity,metrics:current.result!.metrics,quantity:current.result!.quantity,currentRsi:current.result!.currentRsi};
  const hostile={...market,prices:prices.map(([date,price]):Point=>[date,date>'2025-01-28'?price*1e9:price])};
  await fixture.render(<Harness data={hostile} doc={doc}/>);
  assert.deepEqual({trades:current.result!.trades,equity:current.result!.equity,metrics:current.result!.metrics,quantity:current.result!.quantity,currentRsi:current.result!.currentRsi},before);
  const dated=snapshot(market,'2025-01-27');await fixture.render(<Harness data={market} doc={dated}/>);
  assert.equal(current.confirmedThrough,'2025-01-27');assert.equal(current.result!.quantity,0);
  assert.equal(current.result!.trades.length,0);assert.equal(current.result!.pending[0].date,'2025-01-27');
  const kr={...market,timezone:'Asia/Seoul'};await fixture.render(<Harness data={kr} doc={doc}/>);
  assert.equal(current.confirmedThrough,'2025-01-29','Seoul is Jan 30 at the same instant');assert.equal(current.result!.holdings.length,2);
});

test('applied settings alter quantities, persist by symbol, and default reset restores full period50/50 at5bp',async t=>{
  let current!:ReturnType<typeof useRsiSimulation>;
  const stored=new Map([['atlas:rsi-simulation:v1:TQQQ',JSON.stringify({capital:1000,feeBps:5,firstWeight:50,start:'',end:'2025-01-29'})]]);
  function Harness({symbol='TQQQ',unit='USD'}:{symbol?:string;unit?:string}){
    const data={...market,symbol,unit};current=useRsiSimulation(symbol,data,snapshot(data),new Date('2025-03-01T12:00:00Z'));
    return <><SimulationSettingsForm settings={current.settings} prices={prices} confirmedThrough={current.confirmedThrough} unit={unit} onApply={current.setSettings}/>
      <SimulationHud symbol={symbol} unit={unit} result={current.result} error={current.error} onDetails={()=>{}} onSettings={()=>{}}/></>;
  }
  const fixture=await mount(<Harness key="TQQQ"/>,stored);t.after(fixture.cleanup);
  assert.equal(current.result!.holdings.length,2);near(current.result!.holdings[0].quantity,500/(95*1.0005));
  await fixture.input('[aria-label="첫 트랜치 비중"]','70');await fixture.submit();
  assert.equal(current.settings.firstWeight,70);near(current.result!.holdings[0].quantity,700/(95*1.0005));
  near(current.result!.holdings[1].quantity,300/(92*1.0005));
  assert.equal(JSON.parse(stored.get('atlas:rsi-simulation:v1:TQQQ')!).firstWeight,70);
  assert.match(fixture.document.querySelector('.rsi-simulation-name')!.textContent!,/70 \/ 30/);
  assert.equal(fixture.document.querySelector('[aria-label="분할 매매 종료일"]')!.getAttribute('max'),'2025-02-27');
  // RsiPanel is keyed by symbol in the real parent; use the same boundary.
  await fixture.render(<Harness key="233740" symbol="233740" unit="KRW"/>);
  assert.equal(current.settings.capital,10000000);assert.equal(current.settings.firstWeight,50);
  assert.equal(JSON.parse(stored.get('atlas:rsi-simulation:v1:TQQQ')!).firstWeight,70);
  await fixture.render(<Harness key="TQQQ"/>);assert.equal(current.settings.firstWeight,70);
  await fixture.click('button[type="button"]');
  assert.equal(current.settings.firstWeight,50);assert.equal(current.settings.feeBps,5);assert.equal(current.settings.start,'');assert.equal(current.settings.end,'');
  assert.equal(current.settings.capital,10000);assert.equal(current.result!.usedThrough,'2025-02-27');
});

test('details disclose numerator meaning, cost basis, ongoing position and pending fill without a fabricated win percentage',async t=>{
  let current!:ReturnType<typeof useRsiSimulation>;
  function Harness(){current=useRsiSimulation('TQQQ',market,snapshot(market,'2025-02-12'),new Date('2025-03-01T12:00:00Z'));return current.result?<SimulationDetails result={current.result} unit="USD" symbol="TQQQ"/>:null;}
  const fixture=await mount(<Harness/>);t.after(fixture.cleanup);
  assert.equal(current.result!.metrics.closedTranches,1);assert.equal(current.result!.holdings.length,1);
  const content=fixture.document.body.textContent!;
  assert.match(content,/0\.0% · n=1/);assert.match(content,/1트랜치 \/ 1포지션/);
  assert.match(content,/동일 투자금 수익률 기준/);assert.match(content,/평균 보유일 · 달력일/);
  assert.match(content,/예상 청산 비용/);assert.match(content,/다음 확정 봉 체결 대기/);
  assert.doesNotMatch(content,/68\.3%/);
});

test('dialog closes on native close and scope changes, and returns focus only to an active opener',async t=>{
  function Harness({active=true,epoch=1}:{active?:boolean;epoch?:number}){
    const [open,setOpen]=useState(false);
    return <CompactToolbarProvider embedded={false} active={active} epoch={epoch}><CompactToolbarHost/>
      <button data-open onClick={()=>setOpen(true)}>성과</button>
      <RsiDetailDialog open={open} title="TQQQ 성과" name="simulation" onClose={()=>setOpen(false)}>내용</RsiDetailDialog>
    </CompactToolbarProvider>;
  }
  const fixture=await mount(<Harness/>);t.after(fixture.cleanup);
  await fixture.click('[data-open]');assert.equal((fixture.document.querySelector('dialog') as unknown as HTMLDialogElement).open,true);
  await fixture.click('[data-rsi-dialog-close]');assert.equal((fixture.document.querySelector('dialog') as unknown as HTMLDialogElement).open,false);
  assert.equal(fixture.document.activeElement,fixture.document.querySelector('[data-open]'));
  await fixture.click('[data-open]');await fixture.render(<Harness epoch={2}/>);
  assert.equal((fixture.document.querySelector('dialog') as unknown as HTMLDialogElement).open,false);
  await fixture.click('[data-open]');await fixture.render(<Harness epoch={2} active={false}/>);
  assert.equal((fixture.document.querySelector('dialog') as unknown as HTMLDialogElement).open,false);
});

test('hosted modal closes immediately when its originating iframe is hidden',async t=>{
  function Harness(){const [open,setOpen]=useState(false);return <CompactToolbarProvider embedded active epoch={1}>
    <button data-open onClick={()=>setOpen(true)}>성과</button>
    <RsiDetailDialog open={open} title="TQQQ 성과" name="simulation" onClose={()=>setOpen(false)}>내용</RsiDetailDialog>
  </CompactToolbarProvider>;}
  const fixture=await mount(<Harness/>,new Map(),true);t.after(fixture.cleanup);
  await fixture.click('[data-open]');assert.equal((fixture.document.querySelector('dialog') as unknown as HTMLDialogElement).open,true);
  await fixture.hideFrame();assert.equal((fixture.document.querySelector('dialog') as unknown as HTMLDialogElement).open,false);
});

function criteriaGeometry(width:number,height=700){
  const {left,right,top,priceBottom:bottom}=rsiChartLayout(width,height,true,64);
  const input={width,height,left,right,top,bottom,viewportWidth:width};
  return {...input,legend:chartLegendSlot(input)};
}

test('whole-history criteria retain the latest confirmed state when saved experiment dates change',async t=>{
  let current!:ReturnType<typeof useRsiSimulation>;
  const stored=new Map([['atlas:rsi-simulation:v1:TQQQ',JSON.stringify({capital:1000,feeBps:5,firstWeight:50,start:'',end:'2025-01-29'})]]);
  function Harness(){current=useRsiSimulation('TQQQ',market,snapshot(market),new Date('2025-03-01T12:00:00Z'));
    return <TradingCriteriaHud symbol="TQQQ" result={current.overallResult} error={current.overallError} geometry={criteriaGeometry(1440)} open={false} onDetails={()=>{}}/>;}
  const fixture=await mount(<Harness/>,stored);t.after(fixture.cleanup);
  assert.equal(current.result!.usedThrough,'2025-01-29');assert.equal(current.result!.holdings.length,2);assert.equal(current.result!.metrics.closedTranches,0);
  assert.equal(current.overallResult!.usedThrough,'2025-02-27');assert.equal(current.overallResult!.holdings.length,0);assert.equal(current.overallResult!.metrics.closedTranches,2);
  assert.match(fixture.document.querySelector('[data-criteria-field="win-rate"]')!.textContent!,/0\.0% · n=2/);
  const whole=current.overallResult;
  await act(async()=>current.setSettings({...current.settings,start:'2025-01-28',end:'2025-02-12'}));
  assert.equal(current.result!.usedThrough,'2025-02-12');assert.equal(current.overallResult,whole,'date-only edits never recalculate or truncate the overall observation');
  assert.equal(fixture.document.querySelector('[data-rsi-criteria]')!.getAttribute('data-criteria-through'),'2025-02-27');
  await act(async()=>current.setSettings({...current.settings,firstWeight:70,feeBps:0}));
  assert.equal(current.overallResult!.assumptions.weights[0],.7);assert.equal(current.overallResult!.assumptions.feeBps,0);
  assert.notEqual(current.overallResult!.finalEquity,whole!.finalEquity);
});

test('criteria distinguish pending fills, inactive crossing waits, unmet active thresholds and missing RSI',()=>{
  const calculate=(end:string,start=prices[0][0],input=prices)=>simulateRsiTranches(input,{start,end,confirmedThrough:end,capital:1000,feeBps:5});
  const pending=calculate('2025-01-27'),met=tradingCriteriaState(pending);
  assert.equal(met.state,'met');assert.match(met.reason,/1차 매수 충족.*체결 대기/);assert.equal(pending.trades.length,0,'signal is not a fill');
  const held=tradingCriteriaState(calculate('2025-01-29'));
  assert.equal(held.state,'unmet');assert.match(held.reason,/매도 기준 40 미충족/);assert.equal(held.band,'strong-buy','RSI display band does not override active holding state');
  const noCross=tradingCriteriaState(calculate('2025-01-29','2025-01-28'));
  assert.equal(noCross.state,'waiting');assert.match(noCross.reason,/새 33.5 하향 통과 대기/);
  for(const result of [null,calculate('2025-01-10',prices[0][0],prices.slice(0,10))]){
    const state=tradingCriteriaState(result);assert.equal(state.state,'waiting');assert.equal(state.rsi,null);assert.equal(state.band,'unavailable');assert.equal(state.bandLabel,'—');
  }
  assert.equal(tradingCriteriaState(pending,'출처 확인 대기').state,'waiting');
});

test('three symbol criteria start as mobile chips, expose every rule in a native dialog and return focus',async t=>{
  const result=simulateRsiTranches(prices,{start:prices[0][0],end:'2025-01-27',confirmedThrough:'2025-01-27',capital:1000,feeBps:5});
  function Harness({symbol,width=390}:{symbol:string;width?:number}){
    const [open,setOpen]=useState(false);
    return <CompactToolbarProvider embedded={false} active epoch={1}><CompactToolbarHost/>
      <TradingCriteriaHud symbol={symbol} result={result} error="" geometry={criteriaGeometry(width)} open={open} onDetails={()=>setOpen(true)}/>
      <RsiDetailDialog open={open} title={`${symbol} 매매 기준`} name="simulation" onClose={()=>setOpen(false)}><TradingCriteriaDetails symbol={symbol} result={result} error=""/></RsiDetailDialog>
    </CompactToolbarProvider>;
  }
  const fixture=await mount(<Harness symbol="TQQQ"/>);t.after(fixture.cleanup);
  for(const symbol of ['TQQQ','SOXL','233740']){
    await fixture.render(<Harness key={symbol} symbol={symbol}/>);
    const chip=fixture.document.querySelector('[data-rsi-criteria]')!;
    assert.equal(chip.getAttribute('data-rsi-criteria'),symbol);assert.equal(chip.getAttribute('data-criteria-collapsed'),'true');assert.equal(chip.getAttribute('data-criteria-height'),'44');
    assert.match(chip.getAttribute('aria-label')!,new RegExp(symbol+' 매매 기준 상세'));assert.equal(chip.getAttribute('aria-expanded'),'false');
    await fixture.click('[data-rsi-criteria]');
    const dialog=fixture.document.querySelector('dialog')!;assert(dialog.hasAttribute('open'));assert.equal(chip.getAttribute('aria-expanded'),'true');
    assert.equal(dialog.querySelectorAll('[data-criteria-detail]').length,7);
    assert.match(dialog.textContent!,/RSI 33\.5\/29\.5\/40\/43/);assert.match(dialog.textContent!,/전체 승률— · n=0/);assert.match(dialog.textContent!,/다음 확정 봉 종가 체결 대기/);
    assert.match(dialog.textContent!,/화면 표시 구간/);assert.match(dialog.textContent!,/자료가 없으면 중립으로 채우지 않습니다/);
    await fixture.cancel();assert.equal(dialog.hasAttribute('open'),false);assert.equal(fixture.document.activeElement,chip);
    await fixture.click('[data-rsi-criteria]');await fixture.click('[data-rsi-dialog-close]');assert.equal(dialog.hasAttribute('open'),false);assert.equal(fixture.document.activeElement,chip);
  }
  await fixture.render(<Harness key="desktop" symbol="TQQQ" width={1440}/>);
  const card=fixture.document.querySelector('[data-rsi-criteria]')!;
  assert.equal(card.getAttribute('data-criteria-collapsed'),'false');assert.equal(card.querySelectorAll('[data-criteria-field]').length,7);
  assert.match(card.querySelector('[data-criteria-field="criteria"]')!.textContent!,/RSI 33\.5\/29\.5\/40\/43/);
  const buy=card.querySelector('[data-criteria-field="buy"]')!,sell=card.querySelector('[data-criteria-field="sell"]')!,strong=card.querySelector('[data-criteria-field="strong"]')!;
  assert.match(buy.textContent!,/분할 매수1차 체결대기 · 2차 순서대기/);assert.match(buy.getAttribute('title')!,/1차 RSI 33\.5.*2차 RSI 29\.5/);
  assert.match(sell.textContent!,/분할 매도1차 보유없음 · 2차 보유없음/);assert.match(sell.getAttribute('title')!,/1차 RSI 40.*2차 RSI 43/);
  assert.match(strong.textContent!,/적극 구간매수 비활성 · 매도 비활성/);assert.match(strong.getAttribute('title')!,/매수 RSI ≤ 29\.5 · 매도 RSI ≥ 43/);
});

const criteriaResult=(end:string,start=prices[0][0],input=prices)=>simulateRsiTranches(input,{start,end,confirmedThrough:end,capital:1000,feeBps:5});

test('criteria rows expose both tranche stages across pending, filled, closed and reset cycles',async t=>{
  const cases=[
    ['2025-01-26',['waiting','blocked'],['blocked','blocked'],'1차 신호대기 · 2차 순서대기','1차 보유없음 · 2차 보유없음'],
    ['2025-01-27',['pending','blocked'],['blocked','blocked'],'1차 체결대기 · 2차 순서대기','1차 보유없음 · 2차 보유없음'],
    ['2025-01-28',['holding','pending'],['waiting','blocked'],'1차 보유 · 2차 체결대기','1차 신호대기 · 2차 보유없음'],
    ['2025-01-29',['holding','holding'],['waiting','blocked'],'1차 보유 · 2차 보유','1차 신호대기 · 2차 순서대기'],
    ['2025-02-11',['holding','holding'],['pending','blocked'],'1차 보유 · 2차 보유','1차 체결대기 · 2차 순서대기'],
    ['2025-02-12',['closed','holding'],['closed','pending'],'1차 청산완료 · 2차 보유','1차 완료 · 2차 체결대기'],
    ['2025-02-13',['waiting','blocked'],['blocked','blocked'],'1차 신호대기 · 2차 순서대기','1차 보유없음 · 2차 보유없음'],
  ] as const;
  const content=(result:ReturnType<typeof criteriaResult>)=><><TradingCriteriaHud symbol="TQQQ" result={result} error="" geometry={criteriaGeometry(1440)} open={false} onDetails={()=>{}}/>
    <TradingCriteriaDetails symbol="TQQQ" result={result} error=""/></>;
  const fixture=await mount(content(criteriaResult(cases[0][0])));t.after(fixture.cleanup);
  for(const [end,buyStatus,sellStatus,buyText,sellText] of cases){
    const result=criteriaResult(end),before=structuredClone(result);await fixture.render(content(result));
    for(const [side,statuses,value]of [['buy',buyStatus,buyText],['sell',sellStatus,sellText]] as const){
      const row=fixture.document.querySelector(`[data-criteria-field="${side}"]`)!;
      assert.deepEqual([row.getAttribute('data-first-status'),row.getAttribute('data-second-status')],statuses,`${end} ${side}`);
      assert.equal(row.querySelector('strong')!.textContent,value,`${end} ${side} visible status`);
      assert.equal(fixture.document.querySelector(`[data-criteria-detail="${side}"] dd`)!.textContent,value,`${end} ${side} detail status`);
    }
    assert.deepEqual(result,before,'presenting current stages must not mutate the engine ledger');
  }
});

test('aggressive and neutral activation describe RSI display bands while unavailable readings retain unknown slots',async t=>{
  const content=(result:ReturnType<typeof criteriaResult>|null,error='')=><TradingCriteriaHud symbol="SOXL" result={result} error={error} geometry={criteriaGeometry(1440)} open={false} onDetails={()=>{}}/>;
  const fixture=await mount(content(criteriaResult('2025-01-27')));t.after(fixture.cleanup);
  const cases=[
    ['2025-01-27','buy',false,false,false],
    ['2025-01-29','strong-buy',true,false,false],
    ['2025-02-10','neutral',false,false,true],
    ['2025-02-11','sell',false,false,false],
    ['2025-02-13','strong-sell',false,true,false],
  ] as const;
  for(const [end,band,buyActive,sellActive,neutralActive]of cases){
    const result=criteriaResult(end);await fixture.render(content(result));
    const card=fixture.document.querySelector('[data-rsi-criteria]')!,strong=card.querySelector('[data-criteria-field="strong"]')!,neutral=card.querySelector('[data-criteria-field="neutral"]')!;
    assert.equal(card.getAttribute('data-criteria-band'),band);
    assert.equal(strong.getAttribute('data-buy-active'),String(buyActive));assert.equal(strong.getAttribute('data-sell-active'),String(sellActive));
    assert.equal(strong.querySelector('strong')!.textContent,`매수 ${buyActive?'활성':'비활성'} · 매도 ${sellActive?'활성':'비활성'}`);
    assert.equal(neutral.getAttribute('data-neutral-active'),String(neutralActive));assert.equal(neutral.querySelector('strong')!.textContent,neutralActive?'활성':'비활성');
    if(end==='2025-01-29'){assert.equal(result.pending.length,0);assert.equal(card.getAttribute('data-criteria-state'),'unmet','the strong-buy band does not create an order while both tranches are held');}
    if(end==='2025-02-10')assert.equal(result.holdings.length,2,'a neutral display band does not imply an empty position');
    if(end==='2025-02-13'){assert.equal(result.holdings.length,0);assert.equal(result.pending.length,0,'a strong-sell display band does not create a sell without holdings');}
  }
  const insufficientWithSignal=criteriaResult('2025-01-27','2025-01-27');
  assert.equal(insufficientWithSignal.status,'insufficient');assert.equal(insufficientWithSignal.pending.length,1);
  for(const [result,error]of [[null,''],[criteriaResult('2025-01-10'),''],[insufficientWithSignal,''],[criteriaResult('2025-01-27'),'출처 확인 대기']] as const){
    await fixture.render(content(result,error));
    const card=fixture.document.querySelector('[data-rsi-criteria]')!,strong=card.querySelector('[data-criteria-field="strong"]')!,neutral=card.querySelector('[data-criteria-field="neutral"]')!;
    assert.equal(card.getAttribute('data-criteria-band'),'unavailable');assert.equal(card.getAttribute('data-criteria-state'),'waiting');
    assert.equal(strong.getAttribute('data-buy-active'),'unknown');assert.equal(strong.getAttribute('data-sell-active'),'unknown');assert.equal(strong.querySelector('strong')!.textContent,'매수 — · 매도 —');
    assert.equal(neutral.getAttribute('data-neutral-active'),'unknown');assert.equal(neutral.querySelector('strong')!.textContent,'—');
    for(const side of ['buy','sell']){
      const row=card.querySelector(`[data-criteria-field="${side}"]`)!;
      assert.equal(row.getAttribute('data-first-status'),'unavailable');assert.equal(row.getAttribute('data-second-status'),'unavailable');assert.equal(row.querySelector('strong')!.textContent,'1차 — · 2차 —');
    }
  }
});

test('criteria details show only the latest five real signals and distinguish pending signal dates from filled dates',async t=>{
  const repeated:Point[]=[...prices,...prices].map(([,close],index)=>[new Date(Date.UTC(2025,0,index+1)).toISOString().slice(0,10),close]);
  const result=criteriaResult('2025-04-11',repeated[0][0],repeated),before=structuredClone(result);
  assert.equal(result.trades.length,7);assert.deepEqual(result.pending.map(signal=>[signal.date,signal.side,signal.tranche]),[['2025-04-11','Sell',2]]);
  const fixture=await mount(<TradingCriteriaDetails symbol="233740" result={result} error=""/>);t.after(fixture.cleanup);
  const table=fixture.document.querySelector('[data-rsi-recent-signals]')!;assert(table);
  assert.deepEqual([...table.querySelectorAll('thead th')].map(cell=>cell.textContent),['신호','신호일','체결일','상태']);
  const rows=[...table.querySelectorAll('tbody tr')];assert.equal(rows.length,5);
  assert.deepEqual(rows.map(row=>({status:row.getAttribute('data-status'),cells:[...row.querySelectorAll('td')].map(cell=>cell.textContent)})),[
    {status:'pending',cells:['2차 매도','2025-04-11','—','체결 대기']},
    {status:'filled',cells:['1차 매도','2025-04-10','2025-04-11','체결']},
    {status:'filled',cells:['2차 매수','2025-03-28','2025-03-29','체결']},
    {status:'filled',cells:['1차 매수','2025-03-26','2025-03-27','체결']},
    {status:'filled',cells:['2차 매도','2025-02-12','2025-02-13','체결']},
  ]);
  assert.deepEqual(result,before,'rendering recent records must not reorder or alter the engine history');
  await fixture.render(<TradingCriteriaDetails symbol="233740" result={criteriaResult('2025-01-26')} error=""/>);
  assert.equal(fixture.document.querySelector('[data-rsi-recent-signals]'),null);assert.match(fixture.document.body.textContent!,/계산 구간에 발생한 신호 없음/);
});
