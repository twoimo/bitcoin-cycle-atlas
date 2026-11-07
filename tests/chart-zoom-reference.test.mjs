import assert from 'node:assert/strict';
import test from 'node:test';
import { utcDay } from '../dist/cycle-engine.js';
import { panRange,zoomRange } from '../dist/chart-navigation.js';
import { withChartSpacing,retargetChartRange,CHART_SPACING,candleBodyWidth } from '../dist/chart-view-policy.js';
import { navigationHarness } from './helpers/navigation-fixture.mjs';

const range={start:'2024-01-01',end:'2024-04-09',min:'2023-01-01',max:'2025-12-31',minSpan:2,allowEmpty:true,contextKey:'real-observations'};
const count=range=>utcDay(range.end)-utcDay(range.start)+1;
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} ≈ ${b}`);
test('candle bodies expand with zoom and use identical spacing for day, week and second grids',()=>{
  const daily=candleBodyWidth(1000,100,1);
  near(candleBodyWidth(1000,700,7),daily);
  near(candleBodyWidth(1000,8640000,86400),daily);
  near(candleBodyWidth(1000,50,1),daily*2);
  near(candleBodyWidth(1000,1,1),CHART_SPACING.maxBarSpacing*.68);
  assert.equal(candleBodyWidth(1000,0,1),.7);
});
function priceHarness(axisOptions={},rangeOptions={}) {
  let axis={min:100,max:200,scale:'linear',inverted:false,top:50,bottom:400,right:930,mode:'auto',...axisOptions};
  const prices=[],transactions=[];
  const h=navigationHarness({...range,...rangeOptions},{getPriceAxis:()=>axis,onPriceRangeChange:domain=>{axis={...axis,...domain,mode:'manual'};prices.push(domain);},onPriceReset:()=>{axis={...axis,min:100,max:200,mode:'auto'};},onGestureStart:label=>transactions.push(label),onGestureEnd:()=>transactions.push('end')});
  return {...h,get range(){return h.range;},set range(value){h.range=value;},get axis(){return axis;},set axis(value){axis=value;},prices,transactions};
}

test('reference wheel, floating buttons and time-axis drag preserve the right time endpoint',()=>{
  const h=priceHarness();h.svg.dataset.timeAxisTop='450';
  h.fire('wheel',{clientX:147,deltaY:-100});h.flush();
  assert.equal(h.range.end,range.end);assert.ok(count(h.range)<100);h.expire();
  h.controller.toolbar.children.find(button=>button.dataset.chartNavigation==='in').click();h.flush();assert.equal(h.range.end,range.end);
  const before=count(h.range);h.fire('pointerdown',{clientX:300,clientY:470});h.pointer('pointermove',{clientX:500,clientY:470});h.pointer('pointerup');h.flush();
  assert.equal(h.range.end,range.end);assert.ok(count(h.range)>before);assert.equal(h.prices.length,0);h.controller.destroy();
});

test('Ctrl anchors plot zoom to its actual pointer while Meta and outside surfaces remain browser-owned',()=>{
  for(const anchor of [.1,.5,.9]){
    const h=priceHarness(),before=utcDay(h.range.start)+anchor*(count(h.range)-1);
    const event=h.fire('wheel',{clientX:60+870*anchor,ctrlKey:true,deltaY:-100});h.flush();
    assert.equal(event.defaultPrevented,true);near(utcDay(h.range.start)+anchor*(count(h.range)-1),before,.5);
    for(const props of [{clientX:965,ctrlKey:true},{clientY:20,ctrlKey:true},{metaKey:true},{target:h.controller.toolbar.children[0]}])assert.equal(h.fire('wheel',{deltaY:-100,...props}).defaultPrevented,false);
    h.controller.destroy();
  }
});

test('explicit center and pointer policies remain available without changing the default',()=>{
  for(const policy of ['center','pointer']){
    const h=navigationHarness(range,{zoomAnchor:policy});const pointer=.1,anchor=policy==='center'?.5:pointer;
    h.fire('wheel',{clientX:60+870*pointer,deltaY:-100});h.flush();
    near(utcDay(h.range.start)+anchor*(count(h.range)-1),utcDay(range.start)+anchor*99,.5);h.controller.destroy();
  }
});

test('price-axis wheel holds the cursor price on linear, logarithmic and inverted axes without moving time',()=>{
  for(const scale of ['linear','log'])for(const inverted of [false,true]){
    const h=priceHarness({min:10,max:1000,scale,inverted}),y=.3,anchor=inverted?y:1-y;
    const transform=value=>scale==='log'?Math.log(value):value;
    const original=transform(h.axis.min)+anchor*(transform(h.axis.max)-transform(h.axis.min));
    assert.equal(h.fire('wheel',{clientX:965,clientY:50+350*y,deltaY:-100}).defaultPrevented,true);h.flush();
    assert.equal(h.axis.mode,'manual');assert.ok(h.axis.max-h.axis.min<990);assert.equal(h.changes.length,0);assert.deepEqual(h.range,range);
    near(transform(h.axis.min)+anchor*(transform(h.axis.max)-transform(h.axis.min)),original);
    assert.equal(h.fire('wheel',{clientX:965,clientY:430,deltaY:-100}).defaultPrevented,false,'oscillator/volume axis does not own the price domain');
    h.fire('dblclick',{clientX:965,clientY:200});assert.equal(h.axis.mode,'auto');assert.deepEqual(h.range,range);h.controller.destroy();
  }
});

test('coalesced axis wheel and gesture completion retain every delta in one undo transaction',()=>{
  const h=priceHarness();h.fire('wheel',{clientX:965,clientY:225,deltaY:-50});h.fire('wheel',{clientX:965,clientY:225,deltaY:-50});
  assert.equal(h.prices.length,0);h.expire();near(h.axis.max-h.axis.min,100*Math.exp(-.15));
  assert.equal(h.prices.length,1);assert.equal(h.transactions.length,2);assert.equal(h.transactions.at(-1),'end');h.controller.destroy();
});

test('fine trackpad zoom and pan accumulate below a single interval without inventing fractional dates',()=>{
  const short={...range,end:'2024-01-12'},h=navigationHarness(short);
  for(let i=0;i<100;i++){h.fire('wheel',{deltaY:-1});h.flush();}
  assert.ok(count(h.range)<12);assert.equal(h.range.end,short.end);assert.equal(Number.isInteger(utcDay(h.range.start)),true);h.expire();
  const initial=utcDay(h.range.start);for(let i=0;i<100;i++){h.fire('wheel',{deltaX:1});h.flush();}
  assert.ok(utcDay(h.range.start)>initial);assert.equal(count(h.range),10);h.controller.destroy();
});

test('reversing wheel direction at the spacing limit moves immediately without retained overscroll debt',()=>{
  const h=navigationHarness({...range,end:'2024-01-12',minSpan:12});
  for(let i=0;i<20;i++){h.fire('wheel',{deltaY:-100});h.flush();}
  assert.equal(count(h.range),12);h.fire('wheel',{deltaY:100});h.flush();assert.ok(count(h.range)>12);h.controller.destroy();
});

test('an external source change discards a queued axis wheel and starts fine zoom from the new range',()=>{
  const h=priceHarness();h.fire('wheel',{clientX:965,clientY:225,deltaY:-100});
  h.range={...h.range,contextKey:'replacement-source'};h.controller.update();h.flush();assert.equal(h.prices.length,0);
  h.fire('wheel',{deltaY:-1});h.flush();h.range={...h.range,start:'2024-06-01',end:'2024-06-12',contextKey:'third-source'};
  h.fire('wheel',{deltaY:-1});h.flush();assert.equal(h.range.end,'2024-06-12');assert.equal(count(h.range),12);h.controller.destroy();
});

test('bounded native timelines allow Y pan before any date jump and endpoint-span pan matches painted X',()=>{
  const h=priceHarness({}, {allowEmpty:false});h.fire('pointerdown',{clientX:500,clientY:200});h.pointer('pointermove',{clientX:500,clientY:270});h.pointer('pointerup');
  near(h.axis.min,120);near(h.axis.max,220);assert.equal(h.changes.length,0);assert.equal(h.axis.mode,'manual');h.controller.destroy();
  const full=panRange(range,1);assert.equal(utcDay(full.start)-utcDay(range.start),99);assert.equal(full.start,range.end);assert.deepEqual(panRange(full,-1),range);
});

test('spacing limits count actual selected intervals and leave fit/source observations unchanged',()=>{
  const source={...range,start:'2020-01-01',end:'2026-01-01',min:'2020-01-01',max:'2026-01-01'},original=structuredClone(source);
  const daily=withChartSpacing(source,{frequency:'daily',plotWidth:1200}),weekly=withChartSpacing(source,{frequency:'weekly',plotWidth:1200});
  assert.equal(CHART_SPACING.minBarSpacing,.5);assert.equal(daily.minSpan,20);assert.equal(weekly.minSpan,134);
  assert.equal(daily.start,source.start);assert.equal(daily.end,source.end);assert.deepEqual(source,original);
  const native={unit:'seconds',step:604800,start:0,end:200*604800,min:0,max:500*604800,allowEmpty:true};
  assert.equal(withChartSpacing(native,{frequency:'weekly',plotWidth:1200}).minSpan,20);
  const fitted={...source,start:'2000-01-01',min:'2000-01-01'},bounded=withChartSpacing(fitted,{frequency:'daily',plotWidth:400});
  assert.equal(bounded.maxSpan,count(fitted));assert.equal(count(zoomRange(bounded,1.2,1)),count(fitted));
  assert.ok(count(zoomRange(bounded,.9,1))>801,'first inward wheel does not jump to the density cap');
  assert.throws(()=>withChartSpacing(source,{plotWidth:1200,minBarSpacing:80,maxBarSpacing:64}),RangeError);
});

test('native interval conversion preserves UTC center, target source identity and grid without altering observations',()=>{
  const day=86400,first=Date.parse('2024-01-01T00:00:00Z')/1000;
  const daily={unit:'seconds',step:day,start:first+30*day,end:first+240*day,min:first,max:first+500*day,contextKey:'daily-source'},weekly={unit:'seconds',step:7*day,start:first,end:first+490*day,min:first-7*day,max:first+700*day,minSpan:12,contextKey:'weekly-source'};
  const original=structuredClone(daily),converted=retargetChartRange(daily,weekly),center=value=>(value.start+value.end+value.step)/2;
  near(center(converted),center(daily),weekly.step/2);assert.equal((converted.start-weekly.min)%weekly.step,0);assert.equal((converted.end-weekly.min)%weekly.step,0);assert.equal(converted.contextKey,weekly.contextKey);assert.deepEqual(daily,original);
  const minute={...daily,step:60,min:first,max:first+6000*60,maxSpan:6000},limited=retargetChartRange(daily,minute);
  assert.equal((limited.end-limited.start)/60+1,6000);near(center(limited),center(daily),30);assert.equal(limited.allowEmpty,true);
});

test('dense Fit and short explicit windows remain reversible after recalculating spacing bounds',()=>{
  const fitted={start:'2020-01-01',end:'2026-11-07',min:'2020-01-01',max:'2026-11-07',allowEmpty:true};
  const options={frequency:'daily',plotWidth:250};
  const first=withChartSpacing(fitted,options);
  const inward=withChartSpacing(zoomRange(first,Math.exp(-.24),1),options);
  const outward=zoomRange(inward,Math.exp(.4),1);
  assert.equal(count(first),2503);assert.ok(count(inward)<count(first));
  assert.equal(outward.start,fitted.start);assert.equal(outward.end,fitted.end);
  assert.equal(inward.maxSpan,first.maxSpan,'full-fit allowance cannot ratchet with each redraw');

  const ordinary=withChartSpacing({...fitted,start:'2026-08-01'},options);
  const crowded=withChartSpacing(zoomRange(ordinary,20,1),options);
  assert.equal(count(crowded),501,'ordinary zoom still obeys the density budget');
  assert.equal(count(zoomRange(crowded,2,1)),501);

  const short=withChartSpacing({...fitted,start:'2026-11-06'}, {plotWidth:1200});
  const wider=withChartSpacing(zoomRange(short,4,1),{plotWidth:1200});
  assert.equal(wider.minSpan,2,'a short date window retains its inward allowance');
  assert.equal(count(zoomRange(wider,.01,1)),2);
  const replaced=withChartSpacing({...inward,min:'2026-01-01',start:'2026-08-01',maxSpan:311},options);
  assert.notEqual(replaced.spacingBounds.scope,inward.spacingBounds.scope);
  assert.equal(replaced.maxSpan,311,'new source bounds retire the old fit allowance');
});
