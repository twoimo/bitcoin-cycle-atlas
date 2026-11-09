import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {drawAtlasPriceChart} from '../dist/atlas-price-chart.js';

// Real SVG ownership/attributes, not native font or screenshot evidence. A
// visibility:hidden SVG label still has coordinates in a browser: the legacy
// price-axis check must distinguish those labels from painted collisions.
const source=JSON.parse(readFileSync(new URL('./fixtures/btc-daily-2026-10-20.json',import.meta.url),'utf8'));
const rows=Object.freeze(source.prices.map(([date,price])=>Object.freeze({date,price})));
const original=JSON.stringify(rows),last=rows.at(-1);
const layouts=[[390,410],[320,410],[768,450],[1024,470],[1440,510],[1920,560]];

function render(width,height,frequency='weekly'){
  const {document}=parseHTML('<html><body><div><svg id="structure-chart"></svg></div></body></html>');
  const svg=document.querySelector('svg');
  Object.defineProperties(svg,{clientWidth:{value:width},clientHeight:{value:height}});
  svg.getBoundingClientRect=()=>({left:0,top:0,width,height});
  const readouts=[];
  const controller=drawAtlasPriceChart({svg,rows,start:rows[0].date,end:last.date,frequency,
    historical:true,showStates:true,onHover:detail=>readouts.push(detail)});
  // The legacy wrapper applies this readability floor after drawing. It must
  // not make the suppressed $50,000 label visible again.
  for(const label of svg.querySelectorAll('text[font-size]'))if(Number(label.getAttribute('font-size'))<11)label.style.fontSize='11px';
  return {svg,controller,readouts};
}
const ticks=svg=>[...svg.querySelectorAll('[data-price-axis-label="tick"]')];
const cursor=svg=>svg.querySelector('.cross-price-tag');
const quote=svg=>cursor(svg).querySelector('text');
const priceOf=text=>Number(text.replaceAll(',','').replace('$',''));
const geometry=svg=>({viewBox:svg.getAttribute('viewBox'),paths:[...svg.querySelectorAll('path[d]')].map(node=>node.getAttribute('d')),
  ticks:ticks(svg).map(node=>[node.textContent,node.getAttribute('x'),node.getAttribute('y')]),
  plot:['plotLeft','plotRight','plotTop','priceBottom','plotBottom'].map(key=>[key,svg.dataset[key]])});

test('legacy history keeps the actual last price and hides the conflicting tick at all six allocations',()=>{
  for(const [width,height]of layouts)for(const frequency of ['weekly','daily']){
    const {svg,controller,readouts}=render(width,height,frequency),tick=ticks(svg).find(node=>node.textContent==='$50,000');
    assert.ok(tick,'the meaningful $50,000 tick remains in the axis data');
    assert.equal(tick.getAttribute('visibility'),'hidden',`${width}px ${frequency}: a geometric overlap is not painted`);
    assert.equal(cursor(svg).getAttribute('visibility'),'visible');
    assert.equal(priceOf(quote(svg).textContent),Math.round(last.price*100)/100,'the badge retains the source quote, rounded only for display');
    assert.equal(readouts.at(-1).price,last.price,'the inspection value retains the complete source precision');
    assert.equal(controller.getDate(),last.date);
    assert.equal(svg.querySelector('.chart-latest-price-tag'),null,'legacy has one selected-price badge, not a second quote overlay');
    assert.ok(ticks(svg).some(node=>node.getAttribute('visibility')==='visible'),'unrelated axis ticks remain readable');
    assert.ok(Math.abs(Number(quote(svg).getAttribute('y'))-Number(tick.getAttribute('y')))<18,
      'the retained source recreates the close badge/tick rows that caused the reported raw-rectangle collision');
  }
  assert.equal(JSON.stringify(rows),original);
});

test('legacy pointer and keyboard selection reserve only the occupied tick and restore the last quote without moving price geometry',()=>{
  for(const [width,height]of layouts){
    const {svg,controller,readouts}=render(width,height),before=geometry(svg),axis=controller.getPriceScale();
    const latestTick=ticks(svg).find(node=>node.textContent==='$50,000');
    const target=ticks(svg).filter(node=>node.getAttribute('visibility')==='visible').at(-1);
    assert.ok(target);
    const targetPrice=priceOf(target.textContent);
    assert.equal(controller.previewPointer({clientX:(axis.left+axis.right)/2,clientY:axis.y(targetPrice)}),true);
    assert.equal(target.getAttribute('visibility'),'hidden','the live price cursor reserves the tick it now covers');
    assert.equal(latestTick.getAttribute('visibility'),'visible','the old quote row is immediately available again');
    assert.equal(priceOf(quote(svg).textContent),targetPrice);
    assert.equal(controller.getDate(),last.date,'hover does not commit a historical date');
    assert.deepEqual(geometry(svg),before,'collision handling does not alter source paths, axes or viewport');

    controller.clearPreview();
    assert.equal(latestTick.getAttribute('visibility'),'hidden');
    assert.equal(target.getAttribute('visibility'),'visible');
    assert.equal(readouts.at(-1).price,last.price);

    svg.onkeydown({key:'Home',target:svg,preventDefault(){}});
    assert.equal(controller.getDate(),rows[0].date);
    assert.equal(readouts.at(-1).price,rows[0].price);
    assert.equal(latestTick.getAttribute('visibility'),'visible');
    svg.onkeydown({key:'End',target:svg,preventDefault(){}});
    assert.equal(controller.getDate(),last.date);
    assert.equal(latestTick.getAttribute('visibility'),'hidden');
    assert.equal(readouts.at(-1).price,last.price);
    assert.deepEqual(geometry(svg),before);
  }
  assert.equal(JSON.stringify(rows),original);
});
