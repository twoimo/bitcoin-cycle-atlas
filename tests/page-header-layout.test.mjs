import assert from 'node:assert/strict';
import test from 'node:test';
import {observePageHeader} from '../dist/ui/page-header-layout.js';

const property='--app-header-height';
function fixture({height=64,previous='',priority='',withObserver=true}={}) {
  const values=new Map(previous?[[property,{value:previous,priority}]]:[]),writes=[],listeners=new Set(),observers=[];
  const style={
    getPropertyValue:name=>values.get(name)?.value||'',
    getPropertyPriority:name=>values.get(name)?.priority||'',
    setProperty(name,value,priority=''){values.set(name,{value,priority});writes.push({name,value,priority});},
    removeProperty(name){const value=this.getPropertyValue(name);values.delete(name);writes.push({name,removed:true});return value;},
  };
  const view={
    addEventListener(type,callback){assert.equal(type,'resize');listeners.add(callback);},
    removeEventListener(type,callback){assert.equal(type,'resize');listeners.delete(callback);},
  };
  if(withObserver)view.ResizeObserver=class {
    constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}
    observe(node,options){this.node=node;this.options=options;}
    disconnect(){this.disconnected=true;}
  };
  let measurements=0;
  const header={ownerDocument:{body:{style},defaultView:view},hidden:false,isConnected:true,
    getBoundingClientRect(){measurements++;return {height};}};
  const controller=observePageHeader(header);
  return {header,style,writes,listeners,observers,controller,setHeight:value=>{height=value;},measurements:()=>measurements,
    resize:()=>{for(const callback of listeners)callback();},observe:()=>{for(const observer of observers)observer.callback();}};
}

test('the initial border-box and later growth or shrinkage set only the body workspace offset',()=>{
  const f=fixture({height:64});
  assert.equal(f.style.getPropertyValue(property),'64px');
  assert.equal(f.observers[0].node,f.header);assert.deepEqual(f.observers[0].options,{box:'border-box'});
  f.setHeight(92.5);f.observe();assert.equal(f.style.getPropertyValue(property),'92.5px');
  f.setHeight(64);f.observe();assert.equal(f.style.getPropertyValue(property),'64px');
  assert.equal(f.writes.length,3);assert.ok(f.writes.every(write=>write.name===property));
  assert.equal(f.header.style,undefined,'measurement must never set the header height');
  f.controller.destroy();
});

test('unchanged measurements produce no duplicate writes and ignore zero or non-finite sizes',()=>{
  const f=fixture();
  f.controller.sync();f.observe();f.resize();assert.equal(f.writes.length,1);
  for(const height of [0,-1,NaN,Infinity,-Infinity]){f.setHeight(height);f.observe();assert.equal(f.style.getPropertyValue(property),'64px');}
  assert.equal(f.writes.length,1);
  f.setHeight(80);f.header.hidden=true;f.controller.sync();assert.equal(f.writes.length,1);
  f.header.hidden=false;f.header.isConnected=false;f.controller.sync();assert.equal(f.writes.length,1);
  f.header.isConnected=true;f.controller.sync();assert.equal(f.style.getPropertyValue(property),'80px');
  f.controller.destroy();
});

test('a zero-size hidden header preserves the prior offset until a real visible measurement arrives',()=>{
  const f=fixture({height:0,previous:'72px',priority:'important'});
  assert.equal(f.writes.length,0);assert.equal(f.style.getPropertyValue(property),'72px');
  f.setHeight(96);f.resize();assert.equal(f.style.getPropertyValue(property),'96px');
  assert.equal(f.style.getPropertyPriority(property),'');
  f.controller.destroy();assert.equal(f.style.getPropertyValue(property),'72px');assert.equal(f.style.getPropertyPriority(property),'important');
});

test('window resizing works without ResizeObserver and cleanup removes its actual listener',()=>{
  const f=fixture({withObserver:false});
  assert.equal(f.observers.length,0);assert.equal(f.listeners.size,1);
  f.setHeight(78);f.resize();assert.equal(f.style.getPropertyValue(property),'78px');
  f.controller.destroy();assert.equal(f.listeners.size,0);assert.equal(f.style.getPropertyValue(property),'');
  const writes=f.writes.length;f.setHeight(120);f.resize();f.controller.sync();assert.equal(f.writes.length,writes);
});

test('destroy restores the original value and priority only once and ignores queued observer callbacks',()=>{
  const f=fixture({height:88,previous:'70px',priority:'important'});
  f.controller.destroy();
  assert.equal(f.style.getPropertyValue(property),'70px');assert.equal(f.style.getPropertyPriority(property),'important');
  assert.equal(f.observers[0].disconnected,true);assert.equal(f.listeners.size,0);
  const writes=f.writes.length,measurements=f.measurements();
  f.controller.destroy();f.setHeight(140);f.observe();f.controller.sync();f.resize();
  assert.equal(f.writes.length,writes);assert.equal(f.measurements(),measurements);
});

test('cleanup preserves an external value, priority change, or property removal',()=>{
  for(const override of ['value','priority','remove']){
    const f=fixture({previous:'70px',priority:'important'});
    if(override==='remove')f.style.removeProperty(property);
    else f.style.setProperty(property,override==='value'?'120px':'64px',override==='priority'?'important':'');
    const value=f.style.getPropertyValue(property),priority=f.style.getPropertyPriority(property),writes=f.writes.length;
    f.controller.destroy();
    assert.equal(f.style.getPropertyValue(property),value);assert.equal(f.style.getPropertyPriority(property),priority);
    assert.equal(f.writes.length,writes,'cleanup cannot replace another owner’s offset');
  }
});

test('an already matching inline value is not rewritten or claimed by the observer',()=>{
  const f=fixture({previous:'64px',priority:'important'});
  assert.equal(f.writes.length,0);assert.equal(f.style.getPropertyPriority(property),'important');
  f.controller.destroy();assert.equal(f.writes.length,0);assert.equal(f.style.getPropertyValue(property),'64px');
});

test('missing or not-yet-mounted headers and DOM shims without priority methods have a harmless lifecycle',()=>{
  for(const header of [null,undefined,{}, {ownerDocument:{body:{style:{getPropertyValue:()=>'',getPropertyPriority:''}}}}]){
    const controller=observePageHeader(header);
    assert.doesNotThrow(()=>{controller.sync();controller.destroy();controller.destroy();});
  }
});
