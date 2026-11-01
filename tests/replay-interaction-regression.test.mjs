import assert from 'node:assert/strict';
import nodeTest from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import {uiFixture,until} from './replay-ui-fixture.mjs';

// A small, explicitly synthetic daily archive exercises interaction ownership
// without depending on a changing live feed or claiming these are market quotes.
// The coordinator, forecast engine, snapshot codec and controller are real. The
// fixture's DOM/renderer and timer boundary do not replace native browser checks.
const day=86400000;
const dateAt=offset=>new Date(Date.UTC(2026,6,1)+offset*day).toISOString().slice(0,10);
const observations=Array.from({length:122},(_,index)=>({
  date:dateAt(index),price:1000+index,open:999+index,high:1003+index,
  low:997+index,close:1000+index,volume:10+index,
}));
const archive={observations,observedThrough:observations.at(-1).date,
  observedAt:'2026-10-31T01:00:00.000Z',
  source:{provider:'Synthetic interaction fixture',sourceHash:'a'.repeat(64),ohlcAvailable:true}};
const dataset={prices:observations.map(row=>[row.date,row.price]),meta:{sourceName:'Synthetic interaction fixture'}};
const anchor=observations.at(-1);
const forecast={asOf:anchor.date,path:[
  {date:anchor.date,price:anchor.price,lower:anchor.price,upper:anchor.price},
  {date:'2026-11-01',price:1150,lower:1000,upper:1300},
  {date:'2027-01-01',price:1200,lower:900,upper:1500},
]};
const capture=()=>({dataset:structuredClone(dataset),forecast:structuredClone(forecast),
  start:'2026-07-01',end:'2027-01-01',frequency:'weekly',window:'focus',chartType:'candles',
  presentation:{band:true,scale:'log',unit:'usd',showCycleMarkers:true,showCycleIntervals:true}});
const fixture=()=>uiFixture({captured:capture(),archive});
const cases=[];
const test=(name,run)=>cases.push({name,run});

function overlays(h,expected,label){
  const visible=['select-panel','entry-dialog','exit-dialog'].filter(name=>!h.controls.get(name).hidden);
  assert.deepEqual(visible,expected?[expected]:[],label);
}
function pausedTransport(h,label){
  assert.equal(h.state().status,'paused',label);
  for(const name of ['play','next','live'])assert.equal(h.controls.get(name).disabled,false,label+': '+name);
  assert.equal(h.controls.get('play').getAttribute('aria-label'),'리플레이 재생',label+': accessible Play name');
}
function openDate(h){
  if(h.controls.get('select-panel').hidden)h.controls.get('select-menu').click();
  h.controls.get('select-date').click();
  assert.equal(h.controls.get('select-panel').dataset.menuView,'date');
  assert.equal(h.controls.get('date-view').hidden,false);
  overlays(h,'select-panel','the date editor owns the only open surface');
}
function menuKey(h,key){
  // Dispatch document capture first, then the menu listener only if propagation
  // survives. Using the focused menu button catches shortcuts incorrectly tied
  // to the SVG rather than to the active replay session.
  const event={type:'keydown',key,shiftKey:true,target:h.doc.activeElement,
    defaultPrevented:false,stopped:false,propagationStopped:false,
    preventDefault(){this.defaultPrevented=true;},
    stopPropagation(){this.propagationStopped=true;},
    stopImmediatePropagation(){this.stopped=true;this.propagationStopped=true;}};
  h.doc.dispatchEvent(event);
  if(!event.propagationStopped&&!h.controls.get('select-panel').hidden)h.controls.get('select-panel').dispatchEvent(event);
  return event;
}

test('date, exit and cancel transitions never stack replay dialogs or strand paused transport',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-10-21');h.controls.get('next').click();
    const cursor=h.state().cursorIndex,session=h.state().session;
    openDate(h);pausedTransport(h,'date editor remains usable while paused');
    h.controls.get('date').value='2026-08-17';
    h.controls.get('exit').click();
    overlays(h,'exit-dialog','opening exit replaces the date editor');
    assert.equal(h.controls.get('date-view').hidden,true,'the closed date subview must also reset');
    h.controls.get('exit-cancel').click();
    overlays(h,null,'cancelling exit closes the sole dialog');
    pausedTransport(h,'cancel returns usable paused controls');
    assert.equal(h.state().cursorIndex,cursor);assert.equal(h.state().session,session);
    openDate(h);pausedTransport(h,'the date editor can reopen without a stale choice lock');
    assert.equal(h.controls.get('date').value,'2026-10-21','the abandoned date draft must not become a new start');
    assert.match(h.controls.get('date-context').textContent,/현재 공개: 2026-10-21 · 다음 봉: 2026-10-22/);
    assert.equal(h.state().cursorIndex,cursor);
  }finally{h.mounted.destroy();}
});

test('saved-session reentry replaces prior dialogs and Continue restores usable paused controls',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-10-21');h.controls.get('next').click();
    const cursor=h.state().cursorIndex,signature=h.svg.dataset.forecastValueSignature;
    openDate(h);h.controls.get('exit').click();overlays(h,'exit-dialog','only exit is open before saving');
    h.controls.get('exit-save').checked=true;
    await h.controls.get('exit-confirm').click();
    assert.equal(h.mounted.isActive(),false);overlays(h,null,'exit clears every replay dialog');
    assert.ok(h.savedText(),'explicit save creates the saved-session entry');
    h.trigger.click();
    overlays(h,'entry-dialog','saved entry cannot coexist with date or exit');
    assert.equal(h.controls.get('select-menu').disabled,true,'an unresolved entry choice owns input');
    h.controls.get('select-menu').click();overlays(h,'entry-dialog','disabled start menu cannot stack over saved entry');
    h.controls.get('entry-continue').click();
    await until(()=>['paused','error'].includes(h.state().status),'Continue restores the saved cursor');
    assert.equal(h.state().status,'paused',h.state().error);
    overlays(h,null,'Continue dismisses saved entry');pausedTransport(h,'Continue returns usable controls');
    assert.equal(h.state().cursorIndex,cursor);assert.equal(h.svg.dataset.forecastValueSignature,signature);
    openDate(h);overlays(h,'select-panel','date editor is the only dialog after Continue');
    h.controls.get('exit').click();overlays(h,'exit-dialog','exit still replaces date after Continue');
    h.controls.get('exit-cancel').click();pausedTransport(h,'second exit cancellation clears choice ownership');
  }finally{h.mounted.destroy();}
});

test('closing an unresolved saved entry exits directly and preserves the exact resumable session',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-10-21');
    h.controls.get('next').click();h.controls.get('next').click();
    const cursor=h.state().cursorIndex,cursorDate=h.state().session.timeline[cursor];
    const signature=h.svg.dataset.forecastValueSignature;
    h.controls.get('exit').click();h.controls.get('exit-save').checked=true;
    await h.controls.get('exit-confirm').click();
    const saved=h.savedText(),writes=h.writes.length;
    assert.ok(saved);assert.equal(h.mounted.isActive(),false);
    for(const name of ['toolbar exit','replay trigger']){
      h.trigger.click();overlays(h,'entry-dialog',name+': saved entry is the only dialog');
      assert.equal(h.state().session,null,'the saved choice has not yet created an active session');
      if(name==='toolbar exit')h.controls.get('exit').click();else h.trigger.click();
      assert.equal(h.mounted.isActive(),false,name+': close must leave replay instead of opening exit confirmation');
      assert.equal(h.state().status,'idle');assert.equal(h.panel.hidden,true);
      overlays(h,null,name+': no stranded confirmation or entry dialog');
      assert.equal(h.savedText(),saved,name+': the saved snapshot must remain byte-for-byte unchanged');
      assert.equal(h.writes.length,writes,name+': closing an unresolved entry must not save');
    }
    h.trigger.click();overlays(h,'entry-dialog','the preserved session can still be selected');
    assert.equal(h.controls.get('entry-continue').disabled,false);
    h.controls.get('entry-continue').click();
    await until(()=>['paused','error'].includes(h.state().status),'Continue after closing unresolved saved entry');
    assert.equal(h.state().status,'paused',h.state().error);
    pausedTransport(h,'Continue after entry cancellation restores transport');
    assert.equal(h.state().cursorIndex,cursor);assert.equal(h.state().session.timeline[cursor],cursorDate);
    assert.equal(h.svg.dataset.forecastValueSignature,signature);
    assert.equal(h.savedText(),saved);assert.equal(h.writes.length,writes);
  }finally{h.mounted.destroy();}
});

test('Play exposes Pause immediately and pauses by click while Select bar remains open',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-10-21');h.controls.get('next').click();
    const cursor=h.state().cursorIndex,signature=h.svg.dataset.forecastValueSignature;
    h.controls.get('play').click();
    assert.equal(h.state().status,'playing',h.state().error);
    assert.equal(h.controls.get('play').getAttribute('aria-label'),'리플레이 일시정지');
    assert.equal(h.controls.get('play').getAttribute('aria-pressed'),'true');
    h.controls.get('select-menu').click();overlays(h,'select-panel','Select bar is actually open during playback');
    assert.equal(h.state().status,'playing');assert.equal(h.controls.get('play').disabled,false);
    h.controls.get('play').click();
    pausedTransport(h,'Pause click works without first closing the menu');
    assert.equal(h.controls.get('play').getAttribute('aria-pressed'),'false');
    assert.equal(h.state().cursorIndex,cursor,'pausing must neither rewind nor reveal another bar');
    assert.equal(h.svg.dataset.forecastValueSignature,signature);
  }finally{h.mounted.destroy();}
});

test('Shift+Down pauses and resumes from a focused Select bar item without closing the menu first',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-10-21');h.controls.get('next').click();
    const cursor=h.state().cursorIndex;
    h.controls.get('play').click();h.controls.get('select-menu').click();
    assert.equal(h.state().status,'playing');overlays(h,'select-panel','shortcut starts with the menu open');
    assert.equal(h.doc.activeElement,h.controls.get('select-chart'),'focus is inside the start menu');
    const pause=menuKey(h,'ArrowDown');
    assert.equal(pause.defaultPrevented,true);assert.equal(pause.propagationStopped,true);
    pausedTransport(h,'menu focus must not swallow Pause');
    assert.equal(h.state().cursorIndex,cursor);
    if(h.controls.get('select-panel').hidden)h.controls.get('select-menu').click();
    const resume=menuKey(h,'ArrowDown');
    assert.equal(resume.defaultPrevented,true);assert.equal(h.state().status,'playing',h.state().error);
    assert.equal(h.controls.get('play').getAttribute('aria-label'),'리플레이 일시정지');
    assert.equal(h.state().cursorIndex,cursor,'resuming at menu focus must not restart the session');
  }finally{h.mounted.destroy();}
});

test('Pause shortcut takes priority over a focused speed selector or date input',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-10-21');h.controls.get('next').click();
    const cursor=h.state().cursorIndex;
    for(const name of ['speed','date']){
      if(name==='date')openDate(h);
      const control=h.controls.get(name),value=control.value;
      h.controls.get('play').click();assert.equal(h.state().status,'playing',h.state().error);
      control.focus();assert.equal(h.doc.activeElement,control);
      const event=menuKey(h,'ArrowDown');
      assert.equal(event.defaultPrevented,true,name+' focus must not intercept Pause');
      assert.equal(event.propagationStopped,true,name+' must not also process the replay shortcut');
      pausedTransport(h,'Pause while '+name+' is focused');
      assert.equal(control.value,value,'Pause must not edit '+name);
      assert.equal(h.state().cursorIndex,cursor,'Pause must not seek from '+name);
    }
  }finally{h.mounted.destroy();}
});

test('start-menu arrow navigation ignores modified keys without disabling ordinary navigation',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-10-21');h.controls.get('select-menu').click();
    const first=h.controls.get('select-chart'),menu=h.controls.get('select-panel');
    // This isolates the menu's own bubbling listener; document-level replay
    // shortcut ownership is exercised by the preceding interaction cases.
    const key=modifier=>({type:'keydown',key:'ArrowDown',target:first,...modifier,
      defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}});
    for(const modifier of ['shiftKey','ctrlKey','metaKey','altKey']){
      first.focus();const event=key({[modifier]:true});menu.dispatchEvent(event);
      assert.equal(h.doc.activeElement,first,modifier+' must not move the menu focus');
      assert.equal(event.defaultPrevented,false,modifier+' belongs to its own shortcut handler');
    }
    first.focus();const plain=key({});menu.dispatchEvent(plain);
    assert.equal(h.doc.activeElement,h.controls.get('select-date'),'unmodified arrows still navigate the menu');
    assert.equal(plain.defaultPrevented,true);
  }finally{h.mounted.destroy();}
});

test('paused Play and Forward remain enabled with Select bar open and preserve the current forecast',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-10-21');h.controls.get('next').click();
    const cursor=h.state().cursorIndex,signature=h.svg.dataset.forecastValueSignature,session=h.state().session;
    h.controls.get('select-menu').click();overlays(h,'select-panel','start menu is open while paused');
    pausedTransport(h,'the nonmodal start menu must not lock transport');
    assert.equal(h.controls.get('first').disabled,false,'an advanced paused session can explicitly return to its start');
    h.controls.get('next').click();
    assert.equal(h.state().cursorIndex,cursor+1,'Forward reveals exactly one actual day with the menu open');
    assert.equal(h.state().session.timeline[h.state().cursorIndex],'2026-10-22');
    assert.equal(h.svg.dataset.forecastValueSignature,signature);assert.equal(h.state().session,session);
    h.controls.get('play').click();assert.equal(h.state().status,'playing',h.state().error);
    assert.equal(h.state().cursorIndex,cursor+1,'Play preserves the just-advanced cursor');
    assert.equal(h.svg.dataset.forecastValueSignature,signature);
    assert.equal(h.state().session.policy.forecastScoringEnabled,false);
    assert.equal(h.state().session.identity.issuedAt,null);
    assert.equal(h.calls.baseline,0,'current forecast interactions never substitute the October 21 baseline');
  }finally{h.mounted.destroy();}
});

test('unconfirmed initial selection and reselection disable Play, Forward and Jump together',async()=>{
  const h=await fixture();
  try{
    await h.open();assert.equal(h.state().status,'selecting');
    for(const name of ['play','next','live']){
      assert.equal(h.controls.get(name).disabled,true,'initial unconfirmed selection: '+name);
      h.controls.get(name).click();
    }
    h.key('ArrowDown');h.key('ArrowRight');
    assert.equal(h.state().status,'selecting');assert.equal(h.state().session,null);
    assert.equal(h.mounted.isActive(),true);overlays(h,null,'disabled Jump must not open exit before selection');
    await h.start('2026-10-21');h.controls.get('next').click();
    const cursor=h.state().cursorIndex,session=h.state().session;
    h.controls.get('pick').click();
    assert.equal(h.svg.dataset.replaySelecting,'true');
    for(const name of ['play','next','live']){
      assert.equal(h.controls.get(name).disabled,true,'pending reselection: '+name);
      h.controls.get(name).click();
    }
    h.key('ArrowDown');h.key('ArrowRight');
    assert.equal(h.state().status,'paused');assert.equal(h.state().cursorIndex,cursor);
    assert.equal(h.state().session,session);overlays(h,null,'disabled Jump cannot replace pending selection with exit');
    h.controls.get('pick-cancel').click();pausedTransport(h,'cancelling reselection restores existing transport');
  }finally{h.mounted.destroy();}
});

test('the last disclosed actual bar cannot implicitly restart via Play or Shift+Down',async()=>{
  const h=await fixture();
  try{
    await h.open();await h.start('2026-07-17');h.key('End',false);
    assert.equal(h.state().status,'ended');
    assert.equal(h.state().session.timeline[h.state().cursorIndex],'2026-10-30');
    const cursor=h.state().cursorIndex,signature=h.svg.dataset.forecastValueSignature;
    assert.equal(h.controls.get('play').disabled,true,'the archive end has no next actual bar to play');
    assert.equal(h.controls.get('next').disabled,true);
    assert.equal(h.controls.get('first').disabled,false,'rewind remains an explicit action');
    assert.equal(h.controls.get('live').disabled,false);
    h.controls.get('play').click();h.key('ArrowDown');
    assert.equal(h.state().status,'ended');assert.equal(h.state().cursorIndex,cursor);
    assert.equal(h.svg.dataset.forecastValueSignature,signature);
  }finally{h.mounted.destroy();}
});

// Preserve exactly the same assertions when the main suite launches Node
// without vm.SourceTextModule enabled; do not silently skip UI regressions.
if(process.argv.includes('--interaction-regression-case')){
  const index=Number(process.argv[process.argv.indexOf('--interaction-regression-case')+1]);
  const item=cases[index];assert.ok(item,'A named interaction case is required');
  assert.equal(typeof vm.SourceTextModule,'function');
  await item.run();console.log(JSON.stringify({status:'pass',name:item.name}));
}else{
  for(const [index,item]of cases.entries())nodeTest(item.name,async()=>{
    if(typeof vm.SourceTextModule==='function'){await item.run();return;}
    const result=JSON.parse(execFileSync(process.execPath,
      ['--experimental-vm-modules',fileURLToPath(import.meta.url),'--interaction-regression-case',String(index)],
      {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
    assert.equal(result.status,'pass');assert.equal(result.name,item.name);
  });
}
