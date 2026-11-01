import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {ipoMonthCells,ipoMonthKeys,ipoEventsOnDate,ipoMonthMarkup,mountIpoMonthCalendar} from '../dist/ipo-month-calendar.js';

const rows=[
  {종목:'월말회사',청약:['2026-12-30','2027-01-02'],수요예측:['2026-12-15','2026-12-18'],주간사:['A증권']},
  {종목:'신약회사',청약:['2026-11-02','2026-11-03'],수요예측:['2026-10-28','2026-11-03'],주간사:['B증권']},
];
test('month pages preserve captured months, year rollover and an otherwise empty current month',()=>{
  assert.deepEqual(ipoMonthKeys(rows,'2026-09-30'),['2026-09','2026-10','2026-11','2026-12','2027-01']);
  assert.deepEqual(ipoMonthKeys([],'2026-11-01'),['2026-11']);
});
test('a Sunday-start 30-day month takes five exact Sunday-to-Saturday rows',()=>{
  const cells=ipoMonthCells('2026-11');
  assert.equal(cells.length,35);assert.equal(cells[0].date,'2026-11-01');assert.equal(cells.at(-1).date,'2026-12-05');
  assert.equal(cells.filter(c=>!c.outside).length,30);
  assert.equal(new Set(cells.map(c=>c.date)).size,35);
});
test('February leap days and a six-week month are placed without timezone drift',()=>{
  assert.equal(ipoMonthCells('2024-02').filter(c=>!c.outside).length,29);
  assert.equal(ipoMonthCells('2026-02').length,28);
  const six=ipoMonthCells('2026-08');assert.equal(six.length,42);
  assert.equal(six[0].date,'2026-07-26');assert.equal(six.at(-1).date,'2026-09-05');
});
test('interval ends are inclusive, including month and year boundaries',()=>{
  assert.equal(ipoEventsOnDate(rows,'2027-01-02').length,1);
  assert.equal(ipoEventsOnDate(rows,'2027-01-03').length,0);
  assert.equal(ipoEventsOnDate(rows,'2026-10-27').length,0);
  assert.equal(ipoEventsOnDate(rows,'2026-10-28').length,1);
});
test('subscription events are visible before demand forecast events on a busy day',()=>{
  const events=ipoEventsOnDate(rows,'2026-11-02');
  assert.deepEqual(events.map(x=>x.kind),['subscription','forecast']);
});
test('unknown dates do not create false calendar events',()=>{
  assert.deepEqual(ipoEventsOnDate([{종목:'미정',청약:[null,null],수요예측:[]}],'2026-11-02'),[]);
});
test('every visible badge has a full accessible event label and safe escaped text',()=>{
  const evil={종목:'<img onerror=x>',청약:['2026-11-02','2026-11-03'],수요예측:[],주간사:[]};
  const html=ipoMonthMarkup([evil],'2026-11','2026-11-01');
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img onerror=x&gt;'));
  assert.ok(html.includes('aria-current="date"'));assert.ok(html.includes('aria-label="2026-11-02'));
  assert.ok(html.includes('style="--ipo-weeks:5"'));
});
test('overflow counts retain all events in the accessible name rather than dropping rows',()=>{
  const many=Array.from({length:5},(_,i)=>({종목:'회사'+i,청약:['2026-11-02','2026-11-02'],수요예측:[]}));
  const html=ipoMonthMarkup(many,'2026-11','2026-11-01');
  assert.ok(html.includes('외 3건'));assert.ok(html.includes('청약 회사4'));
});
test('the captured source keeps both ongoing month-crossing demand intervals on November 1',()=>{
  const shipped=JSON.parse(readFileSync(new URL('../dist/data/ipo-calendar.json',import.meta.url),'utf8'));
  const events=ipoEventsOnDate(shipped['항목'],'2026-11-01');
  assert.ok(events.some(x=>x.row['종목']==='에이엘로봇'&&x.kind==='forecast'));
  assert.ok(events.some(x=>x.row['종목']==='영광와이케이엠씨'&&x.kind==='forecast'));
});


test('a continuous long interval includes intermediate month pages rather than endpoints only',()=>{
  const long=[{종목:'장기범위',청약:['2026-01-31','2026-04-02'],수요예측:[]}];
  assert.deepEqual(ipoMonthKeys(long,'2026-01-01'),['2026-01','2026-02','2026-03','2026-04']);
});


function monthSurface(reduced=false) {
  const calls=[],listeners={},sections=Array.from({length:4},(_,i)=>({offsetTop:i*100,inert:false}));
  const pages={clientHeight:100,scrollTop:0,querySelectorAll:()=>sections,addEventListener:(kind,fn)=>{listeners[kind]=fn;},focus(){},scrollTo(options){calls.push(options);this.scrollTop=options.top;}};
  const host={innerHTML:''},label={textContent:''},previous={},next={};let onResize;
  const root={ownerDocument:{defaultView:{matchMedia:()=>({matches:reduced}),ResizeObserver:class{constructor(fn){onResize=fn;}observe(){}disconnect(){}}}},querySelector:sel=>({'.ipo-month-pages':host,'.ipo-pages':pages,'.ipo-page-label':label,'[data-ipo-page="previous"]':previous,'[data-ipo-page="next"]':next})[sel]};
  const data=[{종목:'기간',청약:['2026-10-30','2026-12-02'],수요예측:[]}];
  const calendar=mountIpoMonthCalendar(root);calendar.render(data,data,'2026-11-01');
  return {calendar,pages,calls,listeners,label,sections,previous,next,resize:()=>onResize()};
}

test('calendar opens this month and makes only that page interactive',()=>{
  const ui=monthSurface();assert.equal(ui.pages.scrollTop,100);assert.equal(ui.label.textContent,'2026년 11월 · 2/4장');
  assert.deepEqual(ui.sections.map(x=>x.inert),[true,false,true,true]);
});
test('hidden route resize preserves the selected month instead of snapping back to October',()=>{
  const ui=monthSurface();ui.pages.clientHeight=0;ui.pages.scrollTop=0;ui.resize();
  ui.pages.clientHeight=100;ui.resize();assert.equal(ui.pages.scrollTop,100);assert.equal(ui.label.textContent,'2026년 11월 · 2/4장');
});
test('keyboard page navigation is bounded and reduced-motion uses instant scrolling',()=>{
  const ui=monthSurface(true);let prevented=0;
  const press=key=>ui.listeners.keydown({target:ui.pages,key,preventDefault(){prevented++;}});
  press('PageDown');assert.equal(ui.pages.scrollTop,200);assert.equal(ui.calls.at(-1).behavior,'instant');
  press('End');assert.equal(ui.pages.scrollTop,300);assert.equal(ui.next.disabled,true);
  press('PageDown');assert.equal(ui.pages.scrollTop,300);press('Home');assert.equal(ui.pages.scrollTop,0);assert.equal(ui.previous.disabled,true);assert.equal(prevented,4);
});
test('native scroll state uses actual page offsets, including taller short-viewport pages',()=>{
  const ui=monthSurface();ui.sections.forEach((x,i)=>{x.offsetTop=i*160;});ui.pages.scrollTop=320;ui.listeners.scroll();
  assert.equal(ui.label.textContent,'2026년 12월 · 3/4장');
});
test('filter rerender retains the list page while updating month events',()=>{
  const ui=monthSurface();ui.listeners.keydown({target:ui.pages,key:'End',preventDefault(){}});
  ui.calendar.render([], [{종목:'기간',청약:['2026-10-30','2026-12-02'],수요예측:[]}], '2026-11-01');
  assert.equal(ui.pages.scrollTop,300);assert.match(ui.label.textContent,/전체 목록/);
});
