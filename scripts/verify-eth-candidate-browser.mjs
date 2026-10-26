#!/usr/bin/env node
// PR-only verification of checked-out dist files. Does not deploy or alter UI.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm,stat} from 'node:fs/promises';
import {resolve,relative,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {createAssetForecastRecord,assetForecastIndexEntry} from '../dist/asset-forecast-records.js';
import {forecastHash} from '../dist/forecast-records.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const dist=resolve(root,'dist'),out=resolve(root,'build/eth-browser');
const widths=[320,390,768,1024,1440],height=900;
const report={schemaVersion:1,kind:'eth-candidate-real-browser',startedAt:new Date().toISOString(),status:'running',cases:[],failures:[],
  scope:'Actual checked-out static site in headless Chromium through native CDP; no production deployment, Safari or physical-device claim.'};
let server,chrome,browser,profile,base;
let chromeStderr='';
const syntheticJournalFiles=new Map();
let syntheticZeroRecord=null;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const errorText=error=>error instanceof Error?(error.stack||error.message):String(error);
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
async function until(fn,label,timeout=45000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await fn();if(value)return value;await delay(100);}
  throw new Error('Timed out: '+label);
}
class Cdp {
  constructor(ws){this.ws=ws;this.next=1;this.pending=new Map();this.listeners=new Map();
    ws.addEventListener('message',event=>{
      let message;try{message=JSON.parse(String(event.data));}catch(error){this.fail(error);return;}
      if(message.id){const call=this.pending.get(message.id);if(!call)return;clearTimeout(call.timer);this.pending.delete(message.id);
        if(message.error)call.reject(new Error(call.method+': '+JSON.stringify(message.error)));else call.resolve(message.result||{});
      }else for(const listener of this.listeners.get(message.method)||[])listener(message.params||{});
    });
    ws.addEventListener('close',()=>this.fail(new Error('CDP socket closed')));
    ws.addEventListener('error',()=>this.fail(new Error('CDP socket error')));
  }
  static async connect(url){
    const ws=new WebSocket(url);
    await new Promise((accept,reject)=>{
      const timer=setTimeout(()=>{ws.close();reject(new Error('CDP connection timeout'));},15000);
      ws.addEventListener('open',()=>{clearTimeout(timer);accept();},{once:true});
      ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Cannot connect CDP'));},{once:true});
    });
    return new Cdp(ws);
  }
  on(method,fn){const list=this.listeners.get(method)||[];list.push(fn);this.listeners.set(method,list);}
  fail(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  send(method,params={}){
    const id=this.next++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP command timeout: '+method));},30000);
      this.pending.set(id,{resolve,reject,timer,method});
      try{this.ws.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  close(){this.ws.close();}
}
async function evaluate(cdp,fn,...args){
  const expression='('+fn.toString()+')('+args.map(a=>JSON.stringify(a)).join(',')+')';
  const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw new Error('Browser evaluation failed: '+JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function settled(cdp){
  await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  await delay(150);
}
async function screenshot(cdp,name,receipt){
  const result=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  const bytes=Buffer.from(result.data,'base64');
  await writeFile(resolve(out,name),bytes);
  receipt.screenshots.push({file:name,bytes:bytes.length,sha256:hash(bytes)});
  if(name==='data-320-start.png'||name==='eth-320-loaded.png'||name==='bmnr-320-clock.png'||name==='zero-fixture-320.png'||/^(ethusd|bmnr|mstr)-journal-320-(base|stress)\.png$/.test(name)){
    const size=30000,total=Math.ceil(result.data.length/size);
    for(let index=0;index<total;index++)console.log('ETH_BROWSER_IMAGE_CHUNK '+JSON.stringify({name,index,total,data:result.data.slice(index*size,(index+1)*size)}));
  }
}
async function click(cdp,selector){
  const point=await evaluate(cdp,s=>{
    const el=document.querySelector(s);if(!el)throw new Error('Missing click target '+s);
    if(el.disabled)throw new Error('Disabled click target '+s);
    const b=el.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2;
    if(!b.width||!b.height||x<0||y<0||x>=innerWidth||y>=innerHeight)throw new Error('Click target outside viewport '+s);
    const top=document.elementFromPoint(x,y);
    if(!top||!(top===el||el.contains(top)))throw new Error('Click target occluded '+s);
    return {x,y};
  },selector);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await settled(cdp);
}
async function bounds(cdp,selector){
  return evaluate(cdp,s=>{
    const el=document.querySelector(s);if(!el)throw new Error('Missing bounds target '+s);
    const b=el.getBoundingClientRect(),style=getComputedStyle(el);
    return {selector:s,left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,
      background:style.backgroundColor,display:style.display,visibility:style.visibility,open:el.open??null,text:el.textContent};
  },selector);
}
function visibleBounds(b,width){
  assert.ok(b.width>0&&b.height>0&&b.display!=='none'&&b.visibility!=='hidden','Element must be visible: '+b.selector);
  assert.ok(b.left>=-1&&b.right<=width+1&&b.top>=-1&&b.bottom<=height+1,'Element exceeds viewport: '+JSON.stringify(b));
}
function dark(color,label){
  const m=color.match(/^rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\)$/);
  assert.ok(m,'Expected computed RGB color for '+label+': '+color);
  assert.ok(m.slice(1,4).every(n=>Number(n)<90)&&Number(m[4]??1)>=.9,'Dark opaque background required: '+label+' '+color);
}
async function dataCase(cdp,width,receipt){
  await until(()=>evaluate(cdp,()=>document.querySelectorAll('#data-body tr[data-asset-symbol]').length===18),'18 asset rows');
  await settled(cdp);
  receipt.layout=await evaluate(cdp,()=>{
    const rows=[...document.querySelectorAll('#data-body tr[data-asset-symbol]')];
    const controls=[...document.querySelectorAll('.daily-heading .daily-back, .daily-heading h1, .daily-heading .daily-action')].map(el=>{
      const r=el.getBoundingClientRect();return {id:el.id||el.className||el.tagName,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
    });
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      symbols:rows.map(r=>r.dataset.assetSymbol),judgments:rows.map(r=>r.querySelector('.asset-judgment')?.textContent),controls,headingHeight:document.querySelector('.daily-heading').getBoundingClientRect().height,headingBackground:getComputedStyle(document.querySelector('.daily-heading')).backgroundColor,
      bodyBackground:getComputedStyle(rows[0].querySelector('.asset-name')).backgroundColor,
      coarse:matchMedia('(pointer:coarse)').matches};
  });
  const layout=receipt.layout;
  assert.equal(layout.width,width);assert.ok(layout.scrollWidth<=width+1,'Page horizontal overflow');
  assert.equal(layout.symbols.length,18);assert.equal(new Set(layout.symbols).size,18);assert.equal(layout.symbols[0],'BTC');
  assert.ok(layout.judgments.every(j=>['적극 매수','분할 매수','중립','분할 매도','적극 매도','판단 보류'].includes(j)),'Unknown or missing comparison judgment');
  assert.equal(layout.controls.length,6,'Expected back, title and four action controls');
  assert.ok(layout.headingHeight<=64,'Heading must remain one compact toolbar row');
  const centers=layout.controls.map(c=>(c.top+c.bottom)/2);
  assert.ok(Math.max(...centers)-Math.min(...centers)<=10,'Heading controls wrapped into separate rows');
  for(const control of layout.controls){assert.ok(control.width>0&&control.height>0,'Invisible heading control');assert.ok(control.left>=-1&&control.right<=width+1,'Heading control clipped');}
  for(let i=0;i<layout.controls.length;i++)for(let j=i+1;j<layout.controls.length;j++){
    const a=layout.controls[i],b=layout.controls[j];
    assert.ok(!(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1),'Overlapping heading controls '+a.id+' / '+b.id);
  }
  dark(layout.headingBackground,'data heading');dark(layout.bodyBackground,'data sticky body');
  receipt.sticky=[];
  for(const fraction of [0,.5,1]){
    await evaluate(cdp,f=>{const box=document.querySelector('#asset-table-scroll');box.scrollLeft=(box.scrollWidth-box.clientWidth)*f;},fraction);
    await settled(cdp);
    const sticky=await evaluate(cdp,()=>{
      const panel=document.querySelector('#asset-table-scroll'),head=document.querySelector('.asset-mobile-name-header'),body=document.querySelector('tr[data-asset-symbol="BTC"] .asset-name');
      const rect=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
      const topmost=el=>{const b=el.getBoundingClientRect(),p=panel.getBoundingClientRect();const x=Math.max(p.left,b.left)+Math.min(12,b.width/2),y=b.top+Math.min(12,b.height/2);
        const top=document.elementFromPoint(x,y);return Boolean(top&&(top===el||el.contains(top)));};
      return {scrollLeft:panel.scrollLeft,maxScroll:panel.scrollWidth-panel.clientWidth,header:rect(head),body:rect(body),
        headerPosition:getComputedStyle(head).position,bodyPosition:getComputedStyle(body).position,
        headerBackground:getComputedStyle(head).backgroundColor,bodyBackground:getComputedStyle(body).backgroundColor,
        headerTopmost:topmost(head),bodyTopmost:topmost(body)};
    });
    sticky.requestedFraction=fraction;receipt.sticky.push(sticky);
    assert.equal(sticky.headerPosition,'sticky');assert.equal(sticky.bodyPosition,'sticky');
    assert.ok(Math.abs(sticky.header.left-sticky.body.left)<=1,'Sticky heading/body left mismatch');
    assert.ok(Math.abs(sticky.header.width-sticky.body.width)<=1,'Sticky heading/body width mismatch');
    assert.ok(sticky.headerTopmost&&sticky.bodyTopmost,'Sticky identity is occluded');
    if(width<=1024)assert.ok(sticky.maxScroll>0,'Expected actual horizontal table scrolling');
    if(fraction===0)assert.ok(sticky.scrollLeft<=1,'Table did not reach start');
    if(fraction===1)assert.ok(Math.abs(sticky.scrollLeft-sticky.maxScroll)<=1,'Table did not reach end');
    dark(sticky.headerBackground,'sticky heading');dark(sticky.bodyBackground,'sticky body');
    await screenshot(cdp,'data-'+width+'-'+(fraction===0?'start':fraction===1?'end':'middle')+'.png',receipt);
  }
  await click(cdp,'#daily-method-open');
  receipt.dialog=await bounds(cdp,'#daily-method-dialog');
  assert.equal(receipt.dialog.open,true);visibleBounds(receipt.dialog,width);dark(receipt.dialog.background,'data dialog');
  assert.ok(receipt.dialog.text.includes('자산 비교표'),'Expected actual method content');
  for(const judgment of ['적극 매수','분할 매수','중립','분할 매도','적극 매도'])assert.ok(receipt.dialog.text.includes(judgment),'Missing judgment definition '+judgment);
  await screenshot(cdp,'data-'+width+'-method.png',receipt);
  await click(cdp,'#daily-method-close');
  assert.equal((await bounds(cdp,'#daily-method-dialog')).open,false);
}

async function journalCase(cdp,width,receipt,symbol,archive){
  const entries=archive.filter(item=>item.entry.symbol===symbol),baseRecord=entries.find(item=>item.entry.scenario==='base').record;
  const trigger='[data-open-asset-forecast-journal="'+symbol+'"]';
  await evaluate(cdp,s=>document.querySelector(s).scrollIntoView({block:'center'}),trigger);
  await settled(cdp);await click(cdp,trigger);
  await until(()=>evaluate(cdp,()=>document.querySelector('#asset-forecast-journal')?.dataset.state==='ready'),symbol+' saved journal ready');
  receipt.journal={symbol,stages:[]};
  async function inspect(label,expected,{full=false}={}){
    await settled(cdp);
    const state=await evaluate(cdp,()=>{
      const dialog=document.querySelector('#asset-forecast-journal'),body=dialog.querySelector('.journal-body'),svg=dialog.querySelector('svg');
      const bounds=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
      return {dataset:{...dialog.dataset},open:dialog.open,box:bounds(dialog),background:getComputedStyle(dialog).backgroundColor,
        bodyWidth:body.clientWidth,bodyScrollWidth:body.scrollWidth,pageWidth:document.documentElement.scrollWidth,
        text:body.textContent,selected:dialog.querySelector('#asset-journal-selection')?.textContent,
        recordOptions:[...dialog.querySelectorAll('[data-asset-journal-record] option')].map(o=>o.value),
        chartDataset:{...svg.dataset},chartTitle:svg.querySelector('title')?.textContent,
        pathCount:svg.querySelectorAll('path').length,
        pathLengths:[...svg.querySelectorAll('path')].map(p=>p.getTotalLength()),
        invalidPaths:[...svg.querySelectorAll('path')].filter(p=>/NaN|Infinity/.test(p.getAttribute('d')||'')).length,
        zeroOverlay:Boolean(svg.querySelector('[data-asset-journal-zero-overlay="true"]')),
        baseline:svg.querySelector('[data-asset-journal-baseline]')?{points:Number(svg.querySelector('[data-asset-journal-baseline]').dataset.baselinePoints),dash:svg.querySelector('[data-asset-journal-baseline]').getAttribute('stroke-dasharray'),length:svg.querySelector('[data-asset-journal-baseline]').getTotalLength()}:null,
        controlBoxes:[...dialog.querySelectorAll('.journal-controls>*')].map(bounds)};
    });
    assert.equal(state.open,true);assert.equal(state.dataset.state,'ready');assert.equal(state.dataset.symbol,symbol);assert.equal(state.dataset.recordId,expected.id);
    assert.equal(state.chartDataset.assetJournalRecord,expected.id);
    assert.equal(Number(state.chartDataset.assetJournalFrozenRows),expected.output.path.length);
    assert.equal(state.recordOptions.length,entries.length);
    assert.deepEqual([...state.recordOptions].sort(),entries.map(item=>item.record.id).sort());
    assert.ok(state.text.includes(expected.asOf)&&state.text.includes(expected.issuedAt.replace('T',' ').replace('Z',' UTC')),'Saved source clocks missing');
    assert.ok(state.text.includes(expected.model.sourceCommit)&&state.text.includes(expected.outputHash),'Saved source/output identity missing');
    assert.ok(state.text.includes('확률이나 신뢰구간이 아닙니다'),'Saved scenario band mislabelled');
    assert.ok(state.pathCount>0&&state.pathLengths.some(value=>value>0)&&state.invalidPaths===0,'Journal chart has invalid or missing paths');
    assert.ok(state.chartTitle.startsWith(symbol),'Journal chart has wrong asset title');
    const expectedBaseline=expected.output.path.some(row=>Number.isFinite(row[4]));
    assert.equal(Boolean(state.baseline),expectedBaseline,'Stored baseline must have its own plotted line');
    if(expectedBaseline){assert.ok(state.baseline.length>0);assert.equal(state.baseline.dash,'2 5');}
    if(symbol==='ETHUSD')assert.ok(state.text.includes('무작위 예시 1개')&&state.text.includes('파란 점선'),'Saved ETH random example and baseline semantics missing');
    assert.ok(state.bodyScrollWidth<=state.bodyWidth+1&&state.pageWidth<=width+1,'Journal horizontal overflow');
    assert.ok(state.box.left>=-1&&state.box.right<=width+1&&state.box.top>=-1&&state.box.bottom<=height+1,'Journal outside viewport');
    for(const box of state.controlBoxes)assert.ok(box.width>0&&box.left>=state.box.left&&box.right<=state.box.right+1,'Journal control clipped');
    dark(state.background,symbol+' journal');
    if(full){
      const hasZero=expected.output.path.some(row=>row[1]===0||row[2]===0);
      assert.equal(state.chartDataset.assetJournalScale,hasZero?'linear':'log');
      assert.equal(state.zeroOverlay,hasZero,'Exact zero-value chart overlay does not match frozen rows');
      state.expectedZero=hasZero;
    }
    receipt.journal.stages.push({label,recordId:expected.id,scenario:expected.scenario.id,asOf:expected.asOf,issuedAt:expected.issuedAt,outputHash:expected.outputHash,
      frozenRows:expected.output.path.length,scale:state.chartDataset.assetJournalScale,zeroOverlay:state.zeroOverlay,baseline:state.baseline,selected:state.selected,
      box:state.box,bodyWidth:state.bodyWidth,bodyScrollWidth:state.bodyScrollWidth,pathCount:state.pathCount,invalidPaths:state.invalidPaths});
    return state;
  }
  await inspect('base-180',baseRecord);
  await screenshot(cdp,symbol.toLowerCase()+'-journal-'+width+'-base.png',receipt);
  await evaluate(cdp,()=>{
    const range=document.querySelector('[data-asset-journal-range]');range.value='0';range.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await inspect('base-full',baseRecord,{full:true});
  const stress=entries.find(item=>item.entry.scenario==='stress').record;
  await evaluate(cdp,id=>{
    const select=document.querySelector('[data-asset-journal-record]');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  },stress.id);
  await until(()=>evaluate(cdp,id=>{
    const dialog=document.querySelector('#asset-forecast-journal');
    return dialog?.dataset.state==='ready'&&dialog.dataset.recordId===id;
  },stress.id),symbol+' stress record verified');
  await inspect('stress-full',stress,{full:true});
  await evaluate(cdp,()=>document.querySelector('[data-asset-journal-date]').scrollIntoView({block:'center'}));
  await settled(cdp);await click(cdp,'[data-asset-journal-date]');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35,nativeVirtualKeyCode:35});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35,nativeVirtualKeyCode:35});
  await settled(cdp);
  const end=stress.output.path.at(-1),lastPrice='$'+end[1].toLocaleString('en-US',{maximumFractionDigits:2});
  receipt.journal.finalSelection=await evaluate(cdp,()=>({
    text:document.querySelector('#asset-journal-selection').textContent,
    value:document.querySelector('[data-asset-journal-date]').value,max:document.querySelector('[data-asset-journal-date]').max,
    ariaValue:document.querySelector('[data-asset-journal-date]').getAttribute('aria-valuetext')
  }));
  assert.equal(receipt.journal.finalSelection.value,receipt.journal.finalSelection.max,'Native End key did not select final saved date');
  assert.ok(receipt.journal.finalSelection.text.includes(end[0])&&receipt.journal.finalSelection.text.includes(' '+lastPrice),'Final saved value is not displayed exactly to documented precision');
  await screenshot(cdp,symbol.toLowerCase()+'-journal-'+width+'-stress.png',receipt);
  if(width===320&&symbol==='MSTR'){
    // Native dialog close is queued; a cached import can reopen first.
    await evaluate(cdp,()=>{
      const opener=document.querySelector('[data-equity-action="forecast"]');
      document.querySelector('#asset-forecast-journal').close();
      document.dispatchEvent(new CustomEvent('atlas:asset-forecast-journal',{detail:{symbol:'BMNR',opener}}));
    });
    await until(()=>evaluate(cdp,()=>{
      const dialog=document.querySelector('#asset-forecast-journal');
      return dialog?.open&&dialog.dataset.symbol==='BMNR'&&dialog.dataset.state==='ready';
    }),'reopened BMNR survives the older native close task');
    await settled(cdp);
    receipt.journal.closeReopen=await evaluate(cdp,()=>{
      const dialog=document.querySelector('#asset-forecast-journal');return {open:dialog.open,...dialog.dataset};
    });
    assert.equal(receipt.journal.closeReopen.recordId,archive.find(item=>item.entry.symbol==='BMNR'&&item.entry.scenario==='base').record.id);
    assert.equal(receipt.journal.closeReopen.state,'ready');
  }
  if(width===320&&symbol==='ETHUSD'){
    await evaluate(cdp,()=>document.querySelector('#asset-journal-price-chart').scrollIntoView({block:'center'}));
    await settled(cdp);await click(cdp,'#asset-journal-price-chart');
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await settled(cdp);receipt.journal.nativeEscapeFromChart=true;
  }else await click(cdp,'[data-asset-journal-close]');
  assert.equal(await evaluate(cdp,()=>document.querySelector('#asset-forecast-journal').open),false);
  assert.equal(await evaluate(cdp,()=>document.querySelector('#asset-forecast-journal').dataset.state),'closed');
}

async function ethCase(cdp,width,receipt,expected,archive){
  await until(()=>evaluate(cdp,()=>{
    const s=document.querySelector('#eth-chart');return s&&Number(s.dataset.observedCandleCount)>0&&Number(s.dataset.forecastPointCount)>0;
  }),'ETH observed and future paths');
  await settled(cdp);
  receipt.chart=await evaluate(cdp,()=>{
    const chart=document.querySelector('#eth-chart');
    const path=s=>{const el=document.querySelector(s);return el?{d:el.getAttribute('d'),length:el.getTotalLength(),dash:el.getAttribute('stroke-dasharray'),stroke:getComputedStyle(el).stroke}:null;};
    const note=document.querySelector('#eth-forecast-note');
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dataset:{...chart.dataset},
      price:document.querySelector('#eth-price').textContent,date:document.querySelector('#eth-bar-time').textContent,
      kind:document.querySelector('#eth-kind').textContent,observed:path('#eth-chart .market-close-line'),future:path('#eth-chart .equity-forecast-line'),baseline:path('#eth-chart .eth-forecast-baseline'),
      note:{hidden:note.hidden,text:note.textContent,bottom:note.getBoundingClientRect().bottom-document.querySelector('.eth-plot').getBoundingClientRect().top,
        plotTop:Number(chart.querySelector('defs clipPath rect').getAttribute('y')),keys:[...note.children].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,text:el.textContent};})},background:getComputedStyle(document.querySelector('.eth-plot')).backgroundColor};
  });
  const chart=receipt.chart;
  assert.equal(chart.width,width);assert.ok(chart.scrollWidth<=width+1,'ETH horizontal page overflow');
  assert.equal(chart.dataset.product,'ETH-USD');assert.equal(chart.dataset.chartType,'line');
  assert.ok(Number(chart.dataset.observedCandleCount)>0);assert.ok(Number(chart.dataset.forecastPointCount)>0);assert.equal(Number(chart.dataset.forecastCandleCount),0);
  for(const key of ['observed','future','baseline']){assert.ok(chart[key]&&chart[key].length>0,'Missing real SVG '+key+' path');assert.ok(!/NaN|Infinity/.test(chart[key].d),'Invalid SVG coordinates');}
  assert.equal(chart.future.dash,'7 5');assert.equal(chart.baseline.dash,'2 4');assert.equal(chart.price,expected.price);assert.equal(chart.date,expected.date);assert.equal(chart.kind,'');
  assert.equal(chart.note.hidden,false);assert.ok(chart.note.text.includes('확률 아님'));
  for(const text of ['실제 관측','조건 기준선','무작위 예시 1개','음영: 세 조건 범위'])assert.ok(chart.note.text.includes(text),'Missing forecast semantic label '+text);
  assert.ok(chart.note.bottom<=chart.note.plotTop+1,'Forecast legend overlaps plotted prices');
  assert.ok(chart.note.keys.every(k=>k.width>0&&k.left>=0&&k.right<=width),'A forecast legend key is clipped');
  dark(chart.background,'ETH plot');
  await screenshot(cdp,'eth-'+width+'-loaded.png',receipt);
  await click(cdp,'[data-eth-action="forecast"]');
  receipt.dialog=await bounds(cdp,'#eth-data-dialog');
  assert.equal(receipt.dialog.open,true);visibleBounds(receipt.dialog,width);dark(receipt.dialog.background,'ETH evidence dialog');
  assert.ok(receipt.dialog.text.includes(expected.date),'Dialog must identify real cutoff');
  assert.ok(receipt.dialog.text.includes('ETH와 BMNR')&&receipt.dialog.text.includes('신뢰구간'),'Missing shared-source and uncertainty disclosure');
  await screenshot(cdp,'eth-'+width+'-evidence.png',receipt);
  await journalCase(cdp,width,receipt,'ETHUSD',archive);
  assert.equal((await bounds(cdp,'#eth-data-dialog')).open,false);
}

async function equityCase(cdp,width,receipt,symbol,archive){
  const label=symbol.toLowerCase();
  await until(()=>evaluate(cdp,()=>{
    const s=document.querySelector('#equity-chart');
    return s&&Number(s.dataset.observedCandleCount)>0&&Number(s.dataset.forecastPointCount)>0;
  }),symbol+' observed and conditional paths');
  await settled(cdp);
  receipt.chart=await evaluate(cdp,()=>{
    const chart=document.querySelector('#equity-chart');
    const path=chart.querySelector('.equity-forecast-line');
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dataset:{...chart.dataset},
      symbol:document.querySelector('#equity-symbol').textContent,price:document.querySelector('#equity-price').textContent,
      date:document.querySelector('#equity-bar-time').textContent,pathLength:path?.getTotalLength()??0,
      pathData:path?.getAttribute('d')??'',background:getComputedStyle(document.querySelector('.equity-plot')).backgroundColor};
  });
  assert.equal(receipt.chart.symbol,symbol);assert.ok(receipt.chart.scrollWidth<=width+1,symbol+' horizontal page overflow');
  assert.ok(receipt.chart.pathLength>0&&!/NaN|Infinity/.test(receipt.chart.pathData));
  dark(receipt.chart.background,symbol+' plot');
  await screenshot(cdp,label+'-'+width+'-loaded.png',receipt);
  await click(cdp,'[data-equity-action="forecast"]');
  receipt.dialog=await bounds(cdp,'#equity-detail-dialog');
  assert.equal(receipt.dialog.open,true);visibleBounds(receipt.dialog,width);dark(receipt.dialog.background,symbol+' evidence dialog');
  receipt.clockLabels=await evaluate(cdp,()=>{
    const pairs=[...document.querySelectorAll('#equity-detail-content dl dt')].map(dt=>[dt.textContent,dt.nextElementSibling?.textContent]);
    const dt=[...document.querySelectorAll('#equity-detail-content dt')].find(el=>el.textContent==='실제 발행 시각');
    dt?.scrollIntoView({block:'center'});
    return Object.fromEntries(pairs);
  });
  assert.equal(receipt.clockLabels['모형 작성·검토일'],'2026-10-26');
  assert.equal(receipt.clockLabels['실제 발행 시각'],'화면 계산 · 발행 원장에 저장되지 않음');
  assert.equal(receipt.clockLabels['정보 컷오프'],'개별 자료 수집 기록 참조');
  await settled(cdp);
  await screenshot(cdp,label+'-'+width+'-clock.png',receipt);
  await journalCase(cdp,width,receipt,symbol,archive);
  assert.equal((await bounds(cdp,'#equity-detail-dialog')).open,false);
}


async function syntheticZeroCase(cdp,width,receipt){
  receipt.synthetic=true;
  receipt.scope='Synthetic zero-valued output with a real preserved input snapshot, explicitly reconstructed and excluded from issued forecasts or measured predictive performance.';
  await until(()=>evaluate(cdp,()=>Number(document.querySelector('#equity-chart')?.dataset.observedCandleCount)>0),'fixture stock chart');
  await settled(cdp);await click(cdp,'[data-equity-action="forecast"]');
  await evaluate(cdp,()=>document.querySelector('[data-open-asset-forecast-journal="BMNR"]').scrollIntoView({block:'center'}));
  await settled(cdp);await click(cdp,'[data-open-asset-forecast-journal="BMNR"]');
  await until(()=>evaluate(cdp,()=>document.querySelector('#asset-forecast-journal')?.dataset.state==='ready'),'verified synthetic zero journal');
  receipt.journal=await evaluate(cdp,()=>{
    const dialog=document.querySelector('#asset-forecast-journal'),svg=dialog.querySelector('svg');
    const paths=[...svg.querySelectorAll('[data-asset-journal-zero-overlay="true"] path')];
    return {dataset:{...dialog.dataset},chart:{...svg.dataset},text:dialog.textContent,
      overlayPaths:paths.length,invalidPaths:paths.filter(p=>/NaN|Infinity/.test(p.getAttribute('d'))).length,
      overlayLength:paths.reduce((sum,p)=>sum+p.getTotalLength(),0)};
  });
  assert.equal(receipt.journal.dataset.recordId,syntheticZeroRecord.id);
  assert.equal(receipt.journal.chart.assetJournalScale,'linear');assert.equal(receipt.journal.overlayPaths,2);
  assert.equal(receipt.journal.invalidPaths,0);assert.ok(receipt.journal.overlayLength>0);
  assert.ok(receipt.journal.text.includes('회고 재구성 · 전향 평가 제외'),'Synthetic/reconstructed record was presented as prospective');
  assert.ok(receipt.journal.text.includes('재구성 생성'),'Synthetic record clock was labelled as a real issue');
  await evaluate(cdp,()=>{
    const range=document.querySelector('[data-asset-journal-range]');range.value='0';range.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await settled(cdp);
  await evaluate(cdp,()=>document.querySelector('[data-asset-journal-date]').scrollIntoView({block:'center'}));
  await settled(cdp);await click(cdp,'[data-asset-journal-date]');
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'End',code:'End',windowsVirtualKeyCode:35,nativeVirtualKeyCode:35});
  await settled(cdp);
  receipt.journal.finalSelection=await evaluate(cdp,()=>document.querySelector('#asset-journal-selection').textContent);
  assert.ok(receipt.journal.finalSelection.includes(syntheticZeroRecord.output.displayEnd)&&receipt.journal.finalSelection.includes(' $0 · 조건 범위 $0'),'Exact zero tail is missing from the native keyboard selection');
  await screenshot(cdp,'zero-fixture-320.png',receipt);
  await click(cdp,'[data-asset-journal-close]');
}

async function main(){
  await mkdir(out,{recursive:true});
  assert.ok(Number(process.versions.node.split('.')[0])>=24,'Node 24 or newer is required');
  assert.equal(typeof WebSocket,'function','Native WebSocket is required');
  report.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  report.sourceHashes={};
  for(const path of ['dist/index.html','dist/site-entry.js','dist/daily-data-view.js','dist/daily-data.css','dist/eth-view.js','dist/eth-view.css','dist/ethereum-forecast.js','dist/eth-market-data.js','dist/intraday-chart.js','dist/equity-forecast-chart.js','dist/equity-view.js','dist/treasury-projection.js','dist/treasury-model.js','dist/forecast-information-time.js','dist/data/bmnr-ohlc.json','dist/data/eth-ohlc.json','scripts/verify-eth-candidate-browser.mjs','dist/asset-forecast-journal.js','dist/asset-forecast-records.js','dist/journal-entry.js','dist/forecast-journal.css','dist/data/asset-forecast-ledger/index.json','dist/data/mstr-ohlc.json']){
    report.sourceHashes[path]=hash(await readFile(resolve(root,path)));
  }
  const fonts=execFileSync('fc-list',[':lang=ko'],{encoding:'utf8'}).trim();
  assert.ok(fonts.length,'Korean fonts are required; install fonts-noto-cjk in this PR runner');
  report.koreanFonts=fonts.split('\n').slice(0,10);
  let binary=process.env.ATLAS_BROWSER_PATH;
  if(!binary)for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
    try{binary=execFileSync('which',[name],{encoding:'utf8'}).trim();if(binary)break;}catch{}
  }
  assert.ok(binary,'Chromium binary unavailable; set ATLAS_BROWSER_PATH (verification is blocked, not skipped)');
  report.browserBinary=binary;
  const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
  server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1'),synthetic=url.pathname.startsWith('/__synthetic-zero__/');
      const pathname=synthetic?url.pathname.slice('/__synthetic-zero__'.length):url.pathname;
      if(synthetic&&syntheticJournalFiles.has(pathname)){
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(syntheticJournalFiles.get(pathname));return;
      }
      const path=resolve(dist,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname)),rel=relative(dist,path);
      if(rel==='..'||rel.startsWith('..'+sep)){res.writeHead(403);res.end('Forbidden');return;}
      if(!(await stat(path)).isFile())throw new Error('Not a file');
      const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
  base='http://127.0.0.1:'+server.address().port;
  profile=await mkdtemp(resolve(tmpdir(),'atlas-eth-browser-'));
  chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let spawnError=null;chrome.once('error',error=>{spawnError=error;});
  chrome.stderr.on('data',chunk=>{chromeStderr=(chromeStderr+chunk.toString()).slice(-16000);});
  const active=await until(async()=>{
    if(spawnError)throw spawnError;
    if(chrome.exitCode!==null)throw new Error('Browser exited before readiness: '+chromeStderr);
    try{return (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{return null;}
  },'Chromium DevToolsActivePort',20000);
  const debugBase='http://127.0.0.1:'+active[0];
  browser=await Cdp.connect('ws://127.0.0.1:'+active[0]+active[1]);
  report.browserVersion=await browser.send('Browser.getVersion');
  const archived=parseEthArchive(JSON.parse(await readFile(resolve(dist,'data/eth-ohlc.json'),'utf8')),'daily');
  const last=archived.candles.at(-1),expected={price:'$'+new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(last.close),date:last.date.slice(0,10),close:last.close};
  report.expectedObservedEth=expected;
  const index=JSON.parse(await readFile(resolve(dist,'data/asset-forecast-ledger/index.json'),'utf8'));
  const archive=[];
  for(const entry of index.entries)archive.push({entry,record:JSON.parse(await readFile(resolve(dist,'data/asset-forecast-ledger',entry.recordPath),'utf8'))});
  // A separate URL namespace serves a labelled test-only zero path. It never
  // writes the production archive or changes the nine real issue records.
  const source=archive.find(item=>item.entry.symbol==='BMNR'&&item.entry.scenario==='base');
  const snapshot=JSON.parse(await readFile(resolve(dist,'data/asset-forecast-ledger',source.entry.snapshotPath),'utf8'));
  const anchor=snapshot.inputs.primaryPrices.at(-1)[1],at=Date.parse(snapshot.asOf+'T00:00:00Z');
  const path=Array.from({length:201},(_,i)=>{
    const price=i<20?anchor*(1-i/20):(i>=30&&i<=35?anchor*.1:0);
    return {date:new Date(at+i*86400000).toISOString().slice(0,10),price,low:price*.5,high:anchor,baselinePrice:null};
  });
  const files={'dist/asset-forecast-records.js':report.sourceHashes['dist/asset-forecast-records.js']};
  syntheticZeroRecord=await createAssetForecastRecord({snapshot,recordKind:'reconstructed',
    model:{version:'synthetic-zero-browser-fixture',sourceCommit:report.sourceCommit,files,sourceHash:await forecastHash(files)},
    options:{syntheticBrowserFixture:true,syntheticGenerator:{path:'scripts/verify-eth-candidate-browser.mjs',sha256:report.sourceHashes['scripts/verify-eth-candidate-browser.mjs']},sourceIdentityMeaning:'Committed ledger module under test; output is a synthetic fixture, not a production price-model result.'},forecast:{symbol:'BMNR',asOf:snapshot.asOf,scenario:{id:'base',label:'Synthetic zero test only'},
      displayEnd:path.at(-1).date,path}});
  const syntheticEntry=assetForecastIndexEntry(syntheticZeroRecord);
  const syntheticIndex={schemaVersion:1,kind:'atlas-asset-forecast-index',entries:[syntheticEntry]};
  syntheticJournalFiles.set('/data/asset-forecast-ledger/index.json',JSON.stringify(syntheticIndex));
  syntheticJournalFiles.set('/data/asset-forecast-ledger/'+syntheticEntry.recordPath,JSON.stringify(syntheticZeroRecord));
  syntheticJournalFiles.set('/data/asset-forecast-ledger/'+syntheticEntry.snapshotPath,JSON.stringify(snapshot));
  const fixtureBytes=Buffer.from(JSON.stringify({synthetic:true,description:'Browser-only zero-valued reconstructed path; no prospective forecast or economic observation.',index:syntheticIndex,record:syntheticZeroRecord,snapshotId:snapshot.id},null,2)+'\n');
  await writeFile(resolve(out,'zero-fixture.json'),fixtureBytes);
  report.syntheticFixture={file:'zero-fixture.json',bytes:fixtureBytes.length,sha256:hash(fixtureBytes),recordId:syntheticZeroRecord.id,snapshotId:snapshot.id};
  for(const width of widths)for(const page of (width===320?['data','eth','bmnr','mstr','zero-fixture']:['data','eth','bmnr','mstr'])){

    const receipt={page,width,height,status:'running',screenshots:[],runtimeErrors:[],resourceErrors:[],blockedOptionalFonts:[]};
    report.cases.push(receipt);let cdp,targetId;
    try{
      ({targetId}=await browser.send('Target.createTarget',{url:'about:blank'}));
      const target=await until(async()=>{const list=await (await fetch(debugBase+'/json/list')).json();return list.find(t=>t.id===targetId&&t.webSocketDebuggerUrl);},'page CDP target');
      cdp=await Cdp.connect(target.webSocketDebuggerUrl);
      const urls=new Map(),optional=url=>/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url||'');
      cdp.on('Runtime.exceptionThrown',event=>receipt.runtimeErrors.push(event.exceptionDetails));
      cdp.on('Runtime.consoleAPICalled',event=>{if(event.type==='error')receipt.runtimeErrors.push({type:'console.error',args:event.args});});
      cdp.on('Network.requestWillBeSent',event=>urls.set(event.requestId,event.request.url));
      cdp.on('Network.responseReceived',event=>{if(event.response.status>=400)receipt.resourceErrors.push({url:event.response.url,status:event.response.status});});
      cdp.on('Network.loadingFailed',event=>{
        const url=urls.get(event.requestId)||'unknown';
        if(optional(url)&&event.blockedReason)receipt.blockedOptionalFonts.push({url,reason:event.blockedReason});
        else receipt.resourceErrors.push({url,errorText:event.errorText,blockedReason:event.blockedReason??null});
      });
      await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs',{urls:['https://*']});
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=390});
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:width<=390,maxTouchPoints:1});
      await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-color-scheme',value:'dark'}]});
      receipt.url=base+(page==='zero-fixture'?'/__synthetic-zero__/?symbol=BMNR&granularity=daily&type=line':page==='data'?'/?indicator-hide=volume&indicator-list=open&indicator-settings=%7B%7D&page=data':page==='eth'?'/?symbol=ETHUSD&granularity=daily&type=line':'/?symbol='+page.toUpperCase()+'&granularity=daily&type=line');
      await cdp.send('Page.navigate',{url:receipt.url});
      if(page==='zero-fixture')await syntheticZeroCase(cdp,width,receipt);else if(page==='data')await dataCase(cdp,width,receipt);else if(page==='eth')await ethCase(cdp,width,receipt,expected,archive);else await equityCase(cdp,width,receipt,page.toUpperCase(),archive);
      assert.equal(receipt.runtimeErrors.length,0,'Browser runtime errors: '+JSON.stringify(receipt.runtimeErrors));
      assert.equal(receipt.resourceErrors.length,0,'Browser resource failures: '+JSON.stringify(receipt.resourceErrors));
      receipt.status='passed';
    }catch(error){
      receipt.status='failed';receipt.error=errorText(error);report.failures.push({page,width,error:receipt.error});
      if(cdp)try{await screenshot(cdp,page+'-'+width+'-failure.png',receipt);}catch(captureError){receipt.screenshotFailure=errorText(captureError);}
    }finally{
      if(cdp)cdp.close();
      if(targetId)try{await browser.send('Target.closeTarget',{targetId});}catch(error){report.failures.push({page,width,cleanupError:errorText(error)});}
    }
  }
  assert.equal(report.cases.length,21);assert.equal(report.failures.length,0,'Real browser verification failed; inspect report.json and screenshots');
  report.status='passed';
}
try{await main();}catch(error){report.status='failed';report.error=errorText(error);process.exitCode=1;}
finally{
  report.finishedAt=new Date().toISOString();report.chromeStderrTail=chromeStderr.slice(-6000);
  if(browser){try{await browser.send('Browser.close');}catch{}browser.close();}
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await delay(300);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  if(server)await new Promise(resolve=>server.close(resolve));
  if(profile)try{await rm(profile,{recursive:true,force:true});}catch(error){report.cleanupError=errorText(error);}
  await mkdir(out,{recursive:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('ETH_BROWSER_RECEIPT '+JSON.stringify({status:report.status,sourceCommit:report.sourceCommit,startedAt:report.startedAt,finishedAt:report.finishedAt,browserVersion:report.browserVersion,sourceHashes:report.sourceHashes,syntheticFixture:report.syntheticFixture,cases:report.cases.map(c=>({page:c.page,width:c.width,height:c.height,status:c.status,layout:c.layout,sticky:c.sticky,clockLabels:c.clockLabels,journal:c.journal,synthetic:c.synthetic,scope:c.scope,chart:c.chart?{...c.chart,observed:undefined,future:undefined,baseline:undefined}:null,screenshots:c.screenshots,runtimeErrors:c.runtimeErrors,resourceErrors:c.resourceErrors,error:c.error})),failures:report.failures,error:report.error,report:'build/eth-browser/report.json'}));
}
