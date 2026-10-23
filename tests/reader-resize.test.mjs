import test from 'node:test';
import assert from 'node:assert/strict';
import {mountReaderResize} from '../dist/viewport-workspace.js';

class Surface{
  listeners=new Map();
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
  fire(type,values={}){const event={type,button:0,pointerId:1,isPrimary:true,clientX:1000,preventDefault(){this.defaultPrevented=true;},...values};for(const handler of [...this.listeners.get(type)||[]])handler(event);return event;}
}
function fixture(){
  const handle=new Surface(),doc=new Surface(),view=new Surface(),frames=new Map(),writes=[];
  let width=320,enabled=true,serial=0;
  handle.ownerDocument=doc;doc.defaultView=view;
  view.requestAnimationFrame=fn=>{const id=++serial;frames.set(id,fn);return id;};view.cancelAnimationFrame=id=>frames.delete(id);
  handle.setPointerCapture=id=>{handle.captured=id;};
  handle.releasePointerCapture=id=>{if(handle.captured!==id)return;handle.captured=null;handle.fire('lostpointercapture',{pointerId:id});};
  const controller=mountReaderResize({handle,getWidth:()=>width,setWidth:value=>{width=Math.max(280,Math.min(420,value));writes.push(width);},isEnabled:()=>enabled});
  const frame=()=>{for(const [id,fn]of [...frames]){frames.delete(id);fn();}};
  return {handle,doc,view,controller,frame,writes,get width(){return width;},get pending(){return frames.size;},disable(){enabled=false;}};
}

test('reader resize paints a move burst once and immediately includes the exact release coordinate',()=>{
  const f=fixture();f.handle.fire('pointerdown');
  for(let offset=1;offset<=50;offset++)f.handle.fire('pointermove',{clientX:1000-offset});
  assert.equal(f.writes.length,0);assert.equal(f.pending,1);
  f.frame();assert.equal(f.width,370);assert.deepEqual(f.writes,[370]);
  f.handle.fire('pointermove',{clientX:925});f.handle.fire('pointerup',{clientX:900});
  assert.equal(f.width,420);assert.equal(f.pending,0);assert.equal(f.handle.captured,null);
  f.frame();assert.deepEqual(f.writes,[370,420]);f.controller.destroy();
});

test('another finger cannot move, finish or replace the active reader resize',()=>{
  const f=fixture();f.handle.fire('pointerdown');
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])f.handle.fire(type,{pointerId:2,isPrimary:false,clientX:900});
  f.frame();assert.equal(f.width,320);assert.equal(f.handle.captured,1);
  f.handle.fire('pointerup',{clientX:950});assert.equal(f.width,370);assert.equal(f.handle.captured,null);
  f.handle.fire('pointerdown',{pointerId:2,isPrimary:false,clientX:900});f.handle.fire('pointermove',{pointerId:2,isPrimary:false,clientX:800});f.frame();assert.equal(f.width,370);
  f.controller.destroy();
});

test('capture loss, cancellation, hidden documents, viewport changes and destroy retire pending reader work',()=>{
  for(const interruption of ['pointercancel','lostpointercapture','blur','resize','hidden','disabled','cancel','destroy']){
    const f=fixture();f.handle.fire('pointerdown');f.handle.fire('pointermove',{clientX:950});
    if(['pointercancel','lostpointercapture'].includes(interruption))f.handle.fire(interruption);
    else if(['blur','resize'].includes(interruption))f.view.fire(interruption);
    else if(interruption==='hidden'){f.doc.hidden=true;f.doc.fire('visibilitychange');}
    else if(interruption==='disabled')f.disable();
    else f.controller[interruption]();
    f.frame();f.handle.fire('pointermove',{clientX:900});f.handle.fire('pointerup',{clientX:900});f.frame();
    assert.equal(f.width,320,interruption);assert.deepEqual(f.writes,[],interruption);assert.equal(f.pending,0);assert.equal(f.handle.captured,null);f.controller.destroy();
  }
});

test('keyboard and reset actions end a drag before changing width, and overlay mode cannot resize',()=>{
  for(const [type,values,expected]of [['keydown',{key:'ArrowLeft'},340],['keydown',{key:'ArrowRight'},300],['keydown',{key:'Home'},320],['dblclick',{},320]]){
    const f=fixture();f.handle.fire('pointerdown');f.handle.fire('pointermove',{clientX:900});
    f.handle.fire(type,values);f.frame();f.handle.fire('pointerup',{clientX:900});assert.equal(f.width,expected);assert.equal(f.handle.captured,null);
    f.disable();f.handle.fire('pointerdown');f.handle.fire('pointermove',{clientX:900});f.handle.fire('keydown',{key:'ArrowLeft'});f.handle.fire('dblclick');f.frame();assert.equal(f.width,expected);f.controller.destroy();
  }
});
