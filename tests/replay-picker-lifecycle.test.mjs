import assert from 'node:assert/strict';
import nodeTest from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import {uiFixture,until} from './replay-ui-fixture.mjs';
import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';

// Real coordinator, engine, and SVG painter; only DOM event delivery is a
// fixture. The public site's native pointer checks remain a separate gate.
const archive=await parseBitcoinReplayCandles(await frozenMarketText('btc-volume'),{now:Date.parse('2026-10-31T02:00:00Z')});
const dataset=JSON.parse(await frozenMarketText('btc-daily'));
const forecast=buildLongHorizonForecast(dataset,{scenario:'base',sampleCount:64});
const day=date=>Date.parse(date+'T00:00:00Z')/86400000;
const beforeDate='2026-10-19',targetDate='2025-03-31';

async function pickerFixture(){
  const captured={dataset:structuredClone(dataset),forecast:structuredClone(forecast),start:'2024-10-29',end:'2028-10-29',
    frequency:'weekly',window:'focus',chartType:'candles',presentation:{band:true,scale:'log',unit:'usd',showCycleMarkers:true,showCycleIntervals:true}};
  const h=await uiFixture({captured,archive,actualPainter:true});
  await h.open();
  // SvgNode supplies the painter's parsed output; add the DOM containment
  // operation required by the coordinator's real delegated pointer listener.
  h.svg.contains=node=>{for(let current=node;current;current=current.parentElement)if(current===h.svg)return true;return false;};
  const plot=h.svg.parentElement;
  function point(date){
    const {plotLeft,plotRight,plotTop,priceBottom,replayViewStart,replayViewEnd}=h.svg.dataset;
    return {clientX:Number(plotLeft)+(day(date)-day(replayViewStart))/(day(replayViewEnd)-day(replayViewStart))*(Number(plotRight)-Number(plotLeft)),
      clientY:(Number(plotTop)+Number(priceBottom))/2};
  }
  function pointer(type,date,{buttons=type==='pointerdown'?1:0,target=h.svg}={}){
    const event={type,target,button:0,buttons,pointerId:1,pointerType:'mouse',...point(date),
      preventDefault(){},stopImmediatePropagation(){this.stopped=true;}};
    plot.dispatchEvent(event);
  }
  const lineX=()=>h.svg.querySelector('[data-chart-replay-picker]')?.querySelector('line')?.getAttribute('x1');
  return {...h,plot,point,pointer,lineX};
}

const cases=[];
for(const interruption of ['lostpointercapture','blur','released mouse buttons'])cases.push({
  name:'weekly scissors resumes hover after '+interruption+' without choosing a start',
  async run(){
    const h=await pickerFixture();
    try{
      h.pointer('pointermove',beforeDate);
      assert.equal(h.svg.dataset.pickerDate,beforeDate);
      const initialX=h.lineX(),signature=h.svg.dataset.forecastValueSignature,annotations=h.svg.dataset.replayAnnotationSignature;
      const observedCount=h.svg.dataset.observedCandleCount;
      h.pointer('pointerdown',beforeDate);
      if(interruption==='lostpointercapture')h.pointer('lostpointercapture',beforeDate,{target:h.plot});
      if(interruption==='blur')h.win.dispatchEvent({type:'blur'});
      h.pointer('pointermove',targetDate,{buttons:0});
      assert.equal(h.svg.dataset.pickerDate,targetDate,'button-free movement must preview the pointed-to actual week');
      assert.notEqual(h.lineX(),initialX,'the blue line must move with its displayed date');
      assert.ok(Math.abs(Number(h.lineX())-h.point(targetDate).clientX)<.01);
      assert.equal(h.state().status,'selecting');
      assert.equal(h.state().session,null,'hover must not commit a replay session');
      assert.equal(h.svg.dataset.replayCursor,undefined);
      assert.equal(h.svg.dataset.replayOrigin,undefined);
      assert.equal(h.svg.dataset.forecastValueSignature,signature);
      assert.equal(h.svg.dataset.replayAnnotationSignature,annotations);
      assert.equal(h.svg.dataset.observedCandleCount,observedCount);
      for(const name of ['play','next','live'])assert.equal(h.controls.get(name).disabled,true,name+' must remain disabled before the start click');
      assert.equal(h.writes.length,0);
    }finally{h.mounted.destroy();}
  }
});

cases.push({name:'a fresh click after lost pointer capture confirms the hovered week and preserves the forecast',async run(){
  const h=await pickerFixture();
  try{
    h.pointer('pointermove',beforeDate);
    const signature=h.svg.dataset.forecastValueSignature;
    h.pointer('pointerdown',beforeDate);
    h.pointer('lostpointercapture',beforeDate,{target:h.plot});
    h.pointer('pointermove',targetDate,{buttons:0});
    assert.equal(h.svg.dataset.pickerDate,targetDate);
    h.pointer('pointerdown',targetDate);
    h.pointer('pointerup',targetDate);
    await until(()=>['paused','error'].includes(h.state().status),'click-confirmed replay after capture loss');
    assert.equal(h.state().status,'paused',h.state().error);
    assert.equal(h.state().session.replaySettings.startDate,targetDate);
    assert.equal(h.svg.dataset.replayCursor,'2025-03-30');
    assert.equal(h.svg.dataset.pickerDate,undefined);
    assert.equal(h.svg.dataset.forecastValueSignature,signature);
    assert.ok(h.lastDraw().data.observedCandles.every(row=>row.endDate<targetDate));
    assert.equal(h.controls.get('play').disabled,false);
    assert.equal(h.controls.get('next').disabled,false);
    h.key('ArrowRight');
    assert.equal(h.svg.dataset.replayCursor,targetDate);
    const candle=h.lastDraw().data.observedCandles.at(-1),source=archive.observations.find(row=>row.date===targetDate);
    assert.equal(candle.periodStartDate,targetDate);
    assert.equal(candle.daysIncluded,1);
    for(const field of ['open','high','low','close'])assert.equal(candle[field],source[field]);
    assert.equal(h.svg.dataset.forecastValueSignature,signature);
    assert.equal(h.writes.length,0);
  }finally{h.mounted.destroy();}
}});

// Match the other coordinator suites: exercise the same assertions in an
// explicitly enabled VM child when the main runner lacks VM-module support.
if(process.argv.includes('--picker-lifecycle-case')){
  const index=Number(process.argv[process.argv.indexOf('--picker-lifecycle-case')+1]),item=cases[index];
  assert.ok(item,'A named picker lifecycle case is required');
  assert.equal(typeof vm.SourceTextModule,'function','VM child must enable modules');
  await item.run();console.log(JSON.stringify({status:'pass',name:item.name}));
}else{
  for(const [index,item]of cases.entries())nodeTest(item.name,async()=>{
    if(typeof vm.SourceTextModule==='function'){await item.run();return;}
    const result=JSON.parse(execFileSync(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url),'--picker-lifecycle-case',String(index)],
      {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
    assert.equal(result.status,'pass');assert.equal(result.name,item.name);
  });
}
