import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {drawAtlasPriceChart} from '../dist/atlas-price-chart.js';
import {drawIntradayChart} from '../dist/intraday-chart.js';
import {createPriceAxisLabelVisibility, priceAxisMarkup} from '../dist/price-axis.js';
import {createChartSvgExport} from '../dist/chart-export.js';

// These are actual renderer DOM/coordinate contracts, not native glyph, hit-test
// or document-overflow measurements. The browser harness owns those assertions.
const btcSource=JSON.parse(readFileSync(new URL('./fixtures/btc-daily-2026-10-20.json',import.meta.url),'utf8'));
const btcRows=Object.freeze(btcSource.prices.slice(-180).map(([date,price])=>Object.freeze({date,price})));
const ethSource=JSON.parse(readFileSync(new URL('./fixtures/market-v1.29.8/eth-ohlc.json',import.meta.url),'utf8')).intervals.daily;
const ethSeries=Object.freeze({...ethSource,candles:Object.freeze(ethSource.candles.map(row=>Object.freeze({...row})))});
const originalSources=JSON.stringify({btcRows,ethSeries});
const allocations=[[320,520],[390,520],[768,620],[1440,720]];
const latestPrice=kind=>kind==='btc'?btcRows.at(-1).price:ethSeries.candles.at(-1).close;
const firstPrice=kind=>kind==='btc'?btcRows[0].price:ethSeries.candles[0].close;
const quote=value=>'$'+new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
const close=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),message??`${actual} ≈ ${expected}`);
const numeric=(node,name)=>{assert.ok(node,`missing node for ${name}`);const raw=node.getAttribute(name);assert.notEqual(raw,null,`missing ${name}`);const value=Number(raw);assert.ok(Number.isFinite(value),`${name} must be numeric, got ${raw}`);return value;};
let fixtureId=0;

function fixture(width=390,height=520){
  const {document,window}=parseHTML(`<html><body><div class="atlas-plot"><svg id="axis-overlay-${++fixtureId}"></svg></div></body></html>`);
  const svg=document.querySelector('svg');
  Object.defineProperties(svg,{clientWidth:{value:width},clientHeight:{value:height}});
  // Linkedom's SVG innerHTML setter parses a bare fragment as HTML, nesting
  // everything after a self-closing <line/> inside that line. Parse under an
  // explicit SVG wrapper so the fixture models real SVG ownership instead.
  let prototype=svg;while(prototype&&!Object.hasOwn(prototype,'innerHTML'))prototype=Object.getPrototypeOf(prototype);
  const descriptor=Object.getOwnPropertyDescriptor(prototype,'innerHTML');
  Object.defineProperty(svg,'innerHTML',{
    get(){return descriptor.get.call(this);},
    set(markup){
      const parsed=parseHTML(`<html><body><svg xmlns="http://www.w3.org/2000/svg">${markup}</svg></body></html>`).document.querySelector('svg');
      this.replaceChildren(...[...parsed.childNodes].map(node=>document.importNode(node,true)));
    },
  });
  svg.getBoundingClientRect=()=>({left:0,top:0,width,height,right:width,bottom:height});
  return {document,window,svg,width,height};
}

function render(kind,{width=390,height=520,...options}={}){
  const f=fixture(width,height),readouts=[];
  const common={svg:f.svg,showVolume:false,headerInset:70,onHover:detail=>readouts.push(detail)};
  const draw=(changes={})=>kind==='btc'
    ?drawAtlasPriceChart({rows:btcRows,start:btcRows[0].date,end:btcRows.at(-1).date,split:btcRows.at(-1).date,frequency:'daily',showDrawdown:false,showHistoricalEvents:false,...common,...options,...changes})
    :drawIntradayChart({series:ethSeries,range:{start:ethSeries.candles[0].time,end:ethSeries.candles.at(-1).time+ethSeries.seconds},...common,...options,...changes});
  return {...f,kind,readouts,draw,controller:draw()};
}

const cursorTag=svg=>svg.querySelector('.cross-price-tag,.market-price-tag');
const ticks=svg=>[...svg.querySelectorAll('[data-price-axis-label="tick"]')];
const geometry=svg=>({viewBox:svg.getAttribute('viewBox'),paths:[...svg.querySelectorAll('path[d]')].map(node=>node.getAttribute('d')),
  ticks:ticks(svg).map(node=>[node.textContent,node.getAttribute('x'),node.getAttribute('y')]),
  plot:['plotLeft','plotRight','plotTop','priceBottom','plotBottom','priceMin','priceMax'].map(key=>[key,svg.dataset[key]])});

function checkFrame(svg,width,height){
  const layers=svg.querySelectorAll('[data-price-axis-paint-layer]');
  assert.equal(layers.length,1,'one shared paint owner per SVG');
  const layer=layers[0];assert.ok(layer.parentElement===svg,'the paint owner is a direct SVG child');
  const boundaries=layer.querySelectorAll('[data-price-axis-boundary]');
  assert.equal(boundaries.length,3,'one axis spine and two surface boundary lines');
  const right=Number(svg.dataset.plotRight),top=Number(svg.dataset.plotTop),bottom=Number(svg.dataset.priceBottom);
  for(const [name,expected] of [
    ['axis',[right,right,0,height]],['top',[0,right,0,0]],['bottom',[0,right,height,height]],
  ]){
    const line=layer.querySelector(`[data-price-axis-boundary="${name}"]`);
    assert.ok(line,`${name} boundary exists`);
    assert.deepEqual(['x1','x2','y1','y2'].map(key=>numeric(line,key)),expected,`${name} spans the complete SVG surface`);
    assert.ok(line.getAttribute('stroke')&&!['none','transparent'].includes(line.getAttribute('stroke')),'the boundary has paint, not only a hit rectangle');
  }
  const hit=layer.querySelector('.price-axis-interaction');
  assert.ok(hit,'interaction remains owned by the shared paint layer');
  const rect=hit.querySelector('rect');
  assert.deepEqual(['x','y','width','height'].map(name=>numeric(rect,name)),[right,top,width-right,bottom-top],'price gestures retain their original data-area bounds');
  assert.equal(rect.getAttribute('fill'),'transparent');assert.equal(rect.getAttribute('pointer-events'),'all');
  return layer;
}

function checkReady(h){
  const {svg,width,height,controller}=h,axis=controller.getPriceScale(),layer=checkFrame(svg,width,height);
  assert.ok(svg.lastElementChild===layer,'price paint stays above the other SVG layers');
  assert.equal(svg.getAttribute('viewBox'),`0 0 ${width} ${height}`);
  assert.equal(axis.left,width<600?8:12);assert.equal(axis.right,width-64);
  assert.equal(axis.top,70);assert.equal(axis.bottom,height-(width<600?53:46),'extending the spine does not extend the price transform');
  assert.equal(Number(svg.dataset.plotTop),axis.top);assert.equal(Number(svg.dataset.priceBottom),axis.bottom);
  const labels=ticks(svg);assert.equal(labels.length,axis.ticks.length);assert.ok(labels.length>=2);
  labels.forEach((node,index)=>{
    assert.ok(layer.contains(node));close(numeric(node,'y'),axis.y(axis.ticks[index])+4);
    assert.equal(node.getAttribute('pointer-events'),node.getAttribute('visibility')==='hidden'?'none':'bounding-box','only painted tick boxes own their hit surface');
  });
  assert.ok(labels.some(node=>node.getAttribute('visibility')==='visible'),'badge priority cannot hide the whole axis');
  for(const label of svg.querySelectorAll('[data-price-axis-label]')){
    assert.ok(layer.contains(label),'tick, latest and cursor labels share the paint owner');
    assert.equal(numeric(label,'x'),width-60,'all labels use the original 4px inset');
    assert.ok(numeric(label,'textLength')>0);assert.ok(numeric(label,'x')+numeric(label,'textLength')<=width-6,'fitted text stays within the existing SVG width');
    assert.equal(label.getAttribute('lengthAdjust'),'spacingAndGlyphs');
  }
  const cross=svg.querySelector('[id$="-cross"]'),cursor=cursorTag(svg),latest=svg.querySelector('.chart-latest-price-tag');
  assert.ok(layer.contains(cross));assert.ok(cursor.closest('[id$="-cross"]')===cross,'the whole cross group retains ownership of its cursor');
  assert.ok(layer.contains(latest));assert.equal(latest.querySelector('text').textContent,quote(latestPrice(h.kind)));
  assert.equal(cursor.querySelector('text').textContent,quote(latestPrice(h.kind)));
  assert.equal(h.readouts.at(-1).price,latestPrice(h.kind),'the displayed badge does not replace the raw inspection value');
  const latestOwner=h.kind==='eth'?latest.closest('.market-last-price'):latest;
  if(h.kind==='eth'){
    assert.ok(latestOwner&&layer.contains(latestOwner),'the complete intraday source/quote owner moves into the paint layer');
    assert.ok(latestOwner.querySelector('text')===latest.querySelector('text'),'the established market-last-price query still reads the quote');
    const title=latestOwner.querySelector('title');assert.ok(title);assert.ok(title.textContent.includes(ethSeries.source));assert.ok(title.textContent.includes(quote(latestPrice(h.kind))));
    const guide=latestOwner.querySelector('line');assert.ok(guide,'the observed-price guide retains the same owner as its source title');
    assert.deepEqual(['x1','x2'].map(name=>numeric(guide,name)),[axis.left,axis.right]);
    for(const name of ['y1','y2'])close(numeric(guide,name),axis.y(latestPrice(h.kind)));
  }
  return {axis,layer,cross,cursor,latest,latestOwner};
}

for(const [width,height] of allocations)test(`${width}px allocation: BTC and ETH overlay owners retain aligned axes and untouched source coordinates`,()=>{
  const btc=render('btc',{width,height}),eth=render('eth',{width,height});
  const a=checkReady(btc),b=checkReady(eth);
  assert.equal(a.axis.right,b.axis.right,'both production renderers have exactly the same right edge, inside the ±2px browser contract');
  assert.equal(numeric(ticks(btc.svg)[0],'x'),numeric(ticks(eth.svg)[0],'x'));
  assert.equal(numeric(a.layer.querySelector('.price-axis-interaction rect'),'width'),64);
  assert.equal(numeric(b.layer.querySelector('.price-axis-interaction rect'),'width'),64);
  assert.equal(JSON.stringify({btcRows,ethSeries}),originalSources);
});

for(const kind of ['btc','eth'])test(`${kind}: moving ticks and the complete cross group preserves pointer/keyboard selection and badge priority`,()=>{
  const h=render(kind),{svg,controller,readouts}=h,{axis,layer,cross,cursor,latest,latestOwner}=checkReady(h),before=geometry(svg);
  const label=ticks(svg).find(node=>node.getAttribute('visibility')==='visible'&&Math.abs(numeric(node,'y')-numeric(latest.querySelector('text'),'y'))>40);
  assert.ok(label,'the stored source offers an unoccupied tick for the hover regression');
  assert.equal(controller.previewPointer({clientX:(axis.left+axis.right)/2,clientY:numeric(label,'y')-4}),true);
  assert.equal(label.getAttribute('visibility'),'hidden','the cursor suppresses only its newly occupied tick');
  assert.equal(label.getAttribute('pointer-events'),'none','a hidden tick cannot intercept the cursor badge');
  assert.equal(latest.getAttribute('visibility'),'visible','leaving the latest row reveals its genuine quote');
  assert.ok(cursorTag(svg)===cursor);assert.ok(cursor.closest('[id$="-cross"]')===cross);assert.ok(layer.contains(cursor));
  assert.deepEqual(geometry(svg),before,'hover changes paint visibility, not source paths, tick coordinates or the price range');
  controller.clearPreview();
  assert.equal(label.getAttribute('visibility'),'visible');assert.equal(label.getAttribute('pointer-events'),'bounding-box');
  assert.equal(cursor.querySelector('text').textContent,quote(latestPrice(kind)));
  assert.equal(latest.getAttribute('visibility'),'hidden','the restored cursor has priority over the identical latest quote');
  assert.equal(readouts.at(-1).price,latestPrice(kind));
  for(const [key,expected] of [['Home',firstPrice(kind)],['End',latestPrice(kind)]]){
    let prevented=false;svg.onkeydown({key,target:svg,preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(readouts.at(-1).price,expected);assert.ok(cursorTag(svg)===cursor);
  }
  if(kind==='eth')assert.ok(latest.closest('.market-last-price')===latestOwner,'pointer and keyboard updates preserve the original intraday quote owner');
  assert.deepEqual(geometry(svg),before);assert.equal(JSON.stringify({btcRows,ethSeries}),originalSources);
});

test('remounting a shared paint owner retains original nodes and raises that owner after a later SVG overlay',()=>{
  const h=render('btc'),{svg,document}=h,{layer,cross,cursor,latest}=checkReady(h),labels=ticks(svg),before=geometry(svg);
  const late=document.createElementNS('http://www.w3.org/2000/svg','g');late.setAttribute('data-later-overlay','true');svg.append(late);
  assert.ok(svg.lastElementChild===late);
  const update=createPriceAxisLabelVisibility(svg,{cursorTag:cursor});update();update();
  assert.ok(svg.lastElementChild===layer);assert.equal(svg.querySelectorAll('[data-price-axis-paint-layer]').length,1);
  assert.ok(svg.querySelector('[id$="-cross"]')===cross);assert.ok(cursorTag(svg)===cursor);assert.ok(svg.querySelector('.chart-latest-price-tag')===latest);
  labels.forEach((node,index)=>assert.ok(ticks(svg)[index]===node,'paint ownership moves the original label instead of duplicating it'));
  assert.ok(late.parentElement===svg,'unrelated overlay ownership is preserved');assert.deepEqual(geometry(svg),before);
});

for(const kind of ['btc','eth'])test(`${kind}: SVG export keeps axis paint and its quote while removing interaction and the complete transient cursor`,()=>{
  const h=render(kind),{svg}=h;checkReady(h);
  const before=geometry(svg),sourceLabels=ticks(svg).map(node=>[node.textContent,node.getAttribute('x'),node.getAttribute('y')]);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'XMLSerializer');
  try{
    // Serialize Linkedom's real cloned DOM; this does not claim raster output.
    globalThis.XMLSerializer=class {serializeToString(node){return node.toString();}};
    const exported=parseHTML(createChartSvgExport(svg,{title:'R17 axis overlay regression'})).document;
    assert.equal(exported.querySelector('.price-axis-interaction'),null);
    assert.equal(exported.querySelector('[id$="-cross"]'),null);assert.equal(exported.querySelector('.cross-price-tag,.market-price-tag'),null);
    const layer=exported.querySelector('[data-price-axis-paint-layer]');assert.ok(layer);
    assert.equal(layer.querySelectorAll('[data-price-axis-boundary]').length,3);
    assert.deepEqual(ticks(layer).map(node=>[node.textContent,node.getAttribute('x'),node.getAttribute('y')]),sourceLabels);
    const latest=layer.querySelector('.chart-latest-price-tag');assert.ok(latest);assert.equal(latest.getAttribute('visibility'),'visible');
    assert.equal(latest.querySelector('text').textContent,quote(latestPrice(kind)));
    if(kind==='eth'){
      const owner=latest.closest('.market-last-price'),original=svg.querySelector('.market-last-price');assert.ok(owner&&layer.contains(owner));
      assert.equal(owner.querySelector('title').textContent,original.querySelector('title').textContent);
      assert.ok(owner.querySelector('text')===latest.querySelector('text'),'the exported source wrapper still owns the displayed quote');
      for(const name of ['x1','x2','y1','y2','stroke'])assert.equal(owner.querySelector('line').getAttribute(name),original.querySelector('line').getAttribute(name),'export preserves the observed-price guide '+name);
    }
    assert.deepEqual(geometry(svg),before,'export changes only its clone');assert.ok(cursorTag(svg));
  }finally{
    if(descriptor)Object.defineProperty(globalThis,'XMLSerializer',descriptor);else delete globalThis.XMLSerializer;
  }
});

test('a complete surface frame leaves manual log/linear and inverted price transforms in their original data pane',()=>{
  for(const kind of ['btc','eth'])for(const [scale,invertScale] of [['log',false],['linear',true]]){
    const priceDomain=kind==='btc'?{min:50000,max:130000}:{min:1000,max:6000};
    const h=render(kind,{width:320,scale,invertScale,priceDomain}),axis=h.controller.getPriceScale();
    checkFrame(h.svg,h.width,h.height);
    assert.equal(axis.min,priceDomain.min);assert.equal(axis.max,priceDomain.max);assert.equal(axis.mode,'manual');
    assert.equal(axis.top,70);assert.equal(axis.bottom,467);
    close(axis.y(axis.min),invertScale?70:467);close(axis.y(axis.max),invertScale?467:70);
    close(axis.invert(axis.y(latestPrice(kind))),latestPrice(kind));
  }
  assert.equal(JSON.stringify({btcRows,ethSeries}),originalSources);
});

for(const kind of ['btc','eth'])test(`${kind}: panning into an empty period retains a complete frame without manufacturing a latest quote`,()=>{
  const h=render(kind),before=h.controller.getPriceScale();
  const empty=h.draw(kind==='btc'?{start:'1900-01-01',end:'1900-02-01'}:{range:{start:0,end:86400}}),axis=empty.getPriceScale();
  const layer=checkFrame(h.svg,h.width,h.height);
  assert.ok(h.svg.lastElementChild===layer);assert.ok(ticks(h.svg).every(node=>layer.contains(node)));
  assert.equal(h.svg.dataset.visiblePointCount,'0');assert.equal(h.svg.querySelector('.chart-latest-price-tag'),null);assert.equal(cursorTag(h.svg),null);
  assert.equal(axis.min,before.min);assert.equal(axis.max,before.max);assert.equal(axis.top,before.top);assert.equal(axis.bottom,before.bottom);
  assert.equal(h.readouts.at(-1).kind,'unavailable');assert.ok(Number.isNaN(h.readouts.at(-1).price));
  assert.equal(empty.previewPointer({clientX:150,clientY:150}),false);
  assert.deepEqual(empty.updateCycleOverlayObstacles(),{changed:false,visibleCount:0,labelCount:0},'paint mounting does not invalidate the empty renderer identity');
  assert.equal(JSON.stringify({btcRows,ethSeries}),originalSources);
});

test('BTC latest price uses the actual displayed observed source: raw daily line or venue candle close, never a future value',()=>{
  // Deliberately different source prices expose the former originalVisible
  // lookup. These are synthetic unit inputs, not additional market records.
  const rows=Object.freeze([
    {date:'2026-10-18',price:100.123456},{date:'2026-10-19',price:110.123456},
    {date:'2026-10-20',price:120.987654},{date:'2026-10-21',price:800},
  ].map(Object.freeze));
  const candles=Object.freeze([101.25,111.75,123.456789].map((close,index)=>Object.freeze({
    time:Date.parse(rows[index].date+'T00:00:00Z')/1000,date:rows[index].date,
    open:close-1,high:close+2,low:close-2,close,volume:10+index,
  })));
  const before=JSON.stringify({rows,candles});
  for(const [chartType,expected] of [['line',rows[2].price],['candles',candles[2].close]]){
    const h=render('btc',{rows,observedCandles:candles,start:rows[0].date,end:rows.at(-1).date,split:rows[2].date,chartType,priceDomain:{min:80,max:150}});
    const latest=h.svg.querySelector('.chart-latest-price-tag'),cursor=cursorTag(h.svg);
    assert.ok(latest);assert.equal(latest.querySelector('text').textContent,quote(expected));
    assert.equal(cursor.querySelector('text').textContent,quote(expected));assert.equal(h.readouts.at(-1).price,expected);
    assert.equal(latest.getAttribute('visibility'),'hidden','latest and selected tags agree on the same actual observation and share one row');
    assert.equal(JSON.stringify({rows,candles}),before,'source rows and venue OHLC remain immutable');
  }
});

test('standalone frame markup is valid without a known height and rejects unusable interaction bounds',()=>{
  const {svg}=fixture();svg.innerHTML=priceAxisMarkup({left:326,right:390,top:70,bottom:467});
  const layer=svg.querySelector('[data-price-axis-paint-layer]');assert.ok(layer);
  assert.equal(layer.querySelector('[data-price-axis-boundary="axis"]').getAttribute('y2'),'100%');
  for(const bounds of [{left:390,right:390,top:70,bottom:467},{left:326,right:390,top:467,bottom:70},{left:NaN,right:390,top:70,bottom:467}])assert.equal(priceAxisMarkup(bounds),'');
});
