import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {fitReplayTransport} from '../dist/chart-replay.js';

function fixture(width,touch){
  const {document}=parseHTML('<html><body><div class="bar"><div class="actions"></div><button data-cr="more" hidden></button><button data-cr="exit"></button></div><section class="menu"></section></body></html>');
  const bar=document.querySelector('.bar'),transport=document.querySelector('.actions'),more=document.querySelector('[data-cr=more]'),exit=document.querySelector('[data-cr=exit]'),menu=document.querySelector('.menu');
  const names=['first','select-menu','mode-badge','result','pick','play','next','speed','update-interval','live'],controls=names.map(key=>{const node=document.createElement(['speed','update-interval'].includes(key)?'select':'button');node.dataset.cr=key;node.hidden=key==='result';transport.append(node);return node;});
  const size=touch?44:32,widths={'select-menu':touch?82:70,'mode-badge':touch?78:68,speed:touch?68:60,'update-interval':size};
  const measure=node=>node.hidden?0:widths[node.dataset.cr]||size;
  const outer=node=>node.parentElement===bar&&!node.hidden?measure(node)+4:0;
  Object.defineProperty(transport,'clientWidth',{get:()=>width-10-outer(more)-outer(exit)});
  Object.defineProperty(transport,'scrollWidth',{get:()=>{const nodes=[...transport.children].filter(node=>!node.hidden);return nodes.reduce((sum,node)=>sum+measure(node),0)+Math.max(0,nodes.length-1)*4;}});
  const slots=new Map();for(const name of [...names,'exit']){const node=document.createElement('div');menu.append(node);slots.set(name,node);}
  return {bar,transport,more,exit,controls,secondary:controls.filter(node=>['speed','update-interval','live'].includes(node.dataset.cr)),additional:controls.filter(node=>['first','select-menu','mode-badge','result','pick'].includes(node.dataset.cr)),slot:key=>slots.get(key),setWidth:value=>{width=value;}};
}

for(const [viewport,barWidth]of [[320,188],[390,258]])test(`${viewport}px transport keeps play/next in view and speed/latest one disclosure away`,()=>{
  const f=fixture(barWidth,true),handlers=new Map();
  for(const node of [...f.controls,f.exit]){node.onclick=()=>node.dataset.cr;handlers.set(node,node.onclick);}
  const folded=fitReplayTransport(f);assert.equal(folded,true);assert.equal(f.more.hidden,false);
  assert.ok(f.transport.scrollWidth<=f.transport.clientWidth,`${f.transport.scrollWidth} / ${f.transport.clientWidth}`);
  assert.deepEqual([...f.transport.children].filter(node=>!node.hidden).map(node=>node.dataset.cr),['play','next']);
  for(const key of ['speed','live','select-menu','pick'])assert.equal(f.controls.find(node=>node.dataset.cr===key).parentElement,f.slot(key));
  for(const[node,handler]of handlers)assert.equal(node.onclick,handler,'Reparenting must keep the real action');
  f.setWidth(620);fitReplayTransport(f);assert.equal(f.more.hidden,true);
  assert.deepEqual([...f.transport.children].map(node=>node.dataset.cr),f.controls.map(node=>node.dataset.cr));
  assert.equal(f.exit.parentElement,f.bar);
});

test('desktop controls retain their ordinary order and secondary-only fallback',()=>{
  const f=fixture(560,false);assert.equal(fitReplayTransport(f),false);
  assert.equal(f.more.hidden,true);assert.ok(f.transport.scrollWidth<=f.transport.clientWidth);
  f.setWidth(450);assert.equal(fitReplayTransport(f),true);
  assert.equal(f.controls.find(node=>node.dataset.cr==='select-menu').parentElement,f.transport);
  assert.equal(f.controls.find(node=>node.dataset.cr==='speed').parentElement,f.slot('speed'));
  assert.ok(f.transport.scrollWidth<=f.transport.clientWidth);
});
