import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {readNativeRevealMovement} from '../scripts/verify-consolidated-workspace-browser.mjs';

// Geometry fixtures exercise ownership only. They are not native browser
// evidence. The two button edges below are from the source539 failures.
function fixture(width, {buttonLeft=width===320?244.25:254.25,buttonWidth=160,innerLeft=buttonLeft,innerWidth=width===320?240:260}={}) {
  const {document}=parseHTML('<html><body><header id="heading"><div id="instrument"><div id="host"><button id="summary">summary</button></div></div></header></body></html>');
  const styles=new Map(),visited=[];
  const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
  const layout=(node,box,{clientWidth=box.width,clientHeight=box.height,scrollWidth=clientWidth,scrollHeight=clientHeight,scrollLeft=0,overflowX='visible',overflowY='visible'}={})=>{
    node.getBoundingClientRect=()=>({...box});
    Object.defineProperties(node,Object.fromEntries(Object.entries({clientLeft:0,clientTop:0,clientWidth,clientHeight,scrollWidth,scrollHeight,scrollLeft}).map(([name,value])=>[name,{value,writable:true,configurable:true}])));
    styles.set(node,{overflowX,overflowY});
  };
  for(const node of [document.documentElement,document.body])layout(node,rect(0,0,width,900));
  const heading=document.querySelector('#heading'),instrument=document.querySelector('#instrument'),host=document.querySelector('#host'),summary=document.querySelector('#summary');
  layout(heading,rect(0,52.5,width,48),{scrollWidth:800,overflowX:'auto'});
  layout(instrument,rect(innerLeft,52.5,innerWidth,48),{scrollWidth:600,overflowX:'auto'});
  layout(host,rect(innerLeft,52.5,600,48));
  layout(summary,rect(buttonLeft,54.5,buttonWidth,44));
  const previous=Object.fromEntries(['document','getComputedStyle','innerWidth','innerHeight','CSS'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.assign(globalThis,{document,innerWidth:width,innerHeight:900,CSS:{escape:value=>value},getComputedStyle:node=>{visited.push(node.id||node.localName);return styles.get(node)||{overflowX:'visible',overflowY:'visible'};}});
  const restore=()=>{for(const [name,descriptor] of Object.entries(previous))if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];};
  return {document,heading,instrument,host,summary,layout,rect,visited,restore};
}

for(const width of [320,390])test(`a ${width}px viewport must scroll the outer heading when it clips a child that already contains the full button`,()=>{
  const f=fixture(width);
  try {
    const movement=readNativeRevealMovement('#summary');
    assert.equal(movement.ownerSelector,'#heading');
    assert.equal(movement.deltaX,f.summary.getBoundingClientRect().right-width+2);
    assert.equal(movement.deltaY,0);
    assert.equal(f.instrument.scrollLeft,0,'Planning must not programmatically move the nested owner');
    assert.equal(f.heading.scrollLeft,0,'Planning must not programmatically reveal the action');
  } finally {f.restore();}
});

test('a button beyond the actual child scrollport still belongs to the child scroll owner',()=>{
  const f=fixture(320,{buttonLeft:500,innerLeft:100,innerWidth:240});
  try {
    const movement=readNativeRevealMovement('#summary');
    assert.equal(movement.ownerSelector,'#instrument');
    assert.equal(movement.deltaX,180,'The existing maximum wheel delta stays bounded');
    assert.deepEqual(movement.ownerClient,{left:100,right:340});
  } finally {f.restore();}
});

test('a nested horizontal owner at its boundary does not consume every reveal attempt',()=>{
  const f=fixture(320,{buttonLeft:500,innerLeft:100,innerWidth:240});
  try {
    f.instrument.scrollLeft=360;
    const movement=readNativeRevealMovement('#summary');
    assert.equal(movement.ownerSelector,'#heading');
    assert.equal(movement.deltaX,180);
  } finally {f.restore();}
});

test('vertical reveal keeps its original clipped-edge distance and no new horizontal movement',()=>{
  const f=fixture(320,{buttonLeft:20,innerLeft:0,innerWidth:320});
  try {
    f.layout(f.instrument,f.rect(0,100,320,200),{scrollHeight:800,overflowY:'auto'});
    f.layout(f.host,f.rect(0,100,320,800));
    f.layout(f.summary,f.rect(20,320,160,44));
    const movement=readNativeRevealMovement('#summary');
    assert.equal(movement.ownerSelector,'#instrument');
    assert.equal(movement.deltaX,0);assert.equal(movement.deltaY,66);
  } finally {f.restore();}
});

test('an already-contained action supplies no fake native movement',()=>{
  const f=fixture(320,{buttonLeft:80,innerLeft:60,innerWidth:240});
  try {assert.equal(readNativeRevealMovement('#summary'),null);} finally {f.restore();}
});
