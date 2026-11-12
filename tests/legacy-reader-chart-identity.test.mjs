import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {drawAtlasPriceChart} from '../dist/atlas-price-chart.js';
import {computeRollingStates, detectDirectionalChanges} from '../dist/market-structure.js';

class SvgNode {
  constructor(){this.attrs=new Map();this.nodes=new Map();this.dataset={};this.textContent='';}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  getAttribute(name){return this.attrs.get(name)??null;}
  removeAttribute(name){this.attrs.delete(name);}
  querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new SvgNode());return this.nodes.get(selector);}
  querySelectorAll(selector){return selector==='text'?[0,1,2,3].map(index=>this.querySelector(`text-${index}`)):[];}
  closest(){return null;}
  focus(){}
}

// Use the same retained archive and weekly inputs as the legacy structure chart.
// Widths below are allocated-column fixtures, not native browser measurements.
const archive=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
let high=0;
const rows=archive.prices.map(([date,price])=>{high=Math.max(high,price);return {date,price,drawdownPct:(price/high-1)*100};});
const states=computeRollingStates(archive,{frequency:'weekly',threshold:.12}).points;
const turns=detectDirectionalChanges(archive,{frequency:'weekly',threshold:.12}).pivots.map(p=>({date:p.eventDate,price:p.eventPrice,type:p.type,confirmationDate:p.confirmationDate}));

function chart(width){
  const svg=new SvgNode();
  Object.assign(svg,{id:'structure-chart',clientWidth:width,clientHeight:510,innerHTML:'',parentElement:{style:{setProperty(){}}}});
  svg.getBoundingClientRect=()=>({left:0,top:0,width:svg.clientWidth,height:svg.clientHeight});
  const draw=()=>{
    const controller=drawAtlasPriceChart({svg,rows,start:rows[0].date,end:rows.at(-1).date,frequency:'weekly',stateStepDays:7,states,turns,historical:true,showStates:true,threshold:.12});
    const paths=[...svg.innerHTML.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map(match=>match[1]);
    return {markup:svg.innerHTML,paths,axis:controller.getPriceScale()};
  };
  return {svg,draw};
}

// This is the unchanged native gate's coordinate-pair profile. Keep the complete
// path set: a grid or decorative stroke cannot be silently excluded from it.
function profile(d){
  const nums=d.match(/-?\d+(?:\.\d+)?/g)||[];
  let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
  for(let i=0;i+1<nums.length;i+=2){const x=+nums[i],y=+nums[i+1];xMin=Math.min(xMin,x);xMax=Math.max(xMax,x);yMin=Math.min(yMin,y);yMax=Math.max(yMax,y);}
  const round=n=>Number.isFinite(n)?Math.round(n*100)/100:null;
  return {nums:nums.length,x:[round(xMin),round(xMax)],y:[round(yMin),round(yMax)]};
}

for(const [closedWidth,readerWidth] of [[1328,360],[1100,320]]){
  test(`legacy split reader preserves every plotted y value at ${closedWidth} → ${closedWidth-readerWidth} → ${closedWidth}`,()=>{
    const fixture=chart(closedWidth),before=fixture.draw();
    fixture.svg.clientWidth-=readerWidth;
    const opened=fixture.draw();
    assert.equal(opened.paths.length,before.paths.length);
    let narrower=0;
    opened.paths.forEach((path,index)=>{
      const a=profile(before.paths[index]),b=profile(path);
      assert.equal(b.nums,a.nums,`path ${index} retains every point`);
      assert.deepEqual(b.y,a.y,`path ${index} retains its plotted y values`);
      assert.ok(b.x[1]<=a.x[1]+.01,`path ${index} fits its reserved column`);
      if(b.x[1]<a.x[1]-1)narrower++;
    });
    assert.ok(narrower>0);
    for(const key of ['min','max','top','bottom'])assert.equal(opened.axis[key],before.axis[key],`price ${key} stays unchanged`);
    assert.equal(closedWidth-before.axis.right,64);
    assert.equal(fixture.svg.clientWidth-opened.axis.right,64);
    fixture.svg.clientWidth=closedWidth;
    assert.equal(fixture.draw().markup,before.markup,'closing restores every rendered byte');
  });
}

test('batched grid paints the exact original horizontal tick segments without changing its DOM budget',()=>{
  for(const width of [320,780,968,1328]){
    const {paths,axis,markup}=chart(width).draw();
    assert.equal([...markup.matchAll(/class="price-axis-grid"/g)].length,1);
    const grid=paths[0];
    const segments=[...grid.matchAll(/M([^,]+),([^HL]+)([HL])([^,M]+)(?:,([^M]+))?/g)].map(match=>[+match[1],+match[2],+match[4],match[3]==='H'?+match[2]:+match[5]]);
    assert.deepEqual(segments,axis.ticks.map(value=>[axis.left,axis.y(value),axis.right,axis.y(value)]));
    assert.equal(width-axis.right,64);
  }
});
