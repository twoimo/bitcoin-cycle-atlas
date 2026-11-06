import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountCenterFrameFocus} from '../dist/center-workbench.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function childDocument(){return parseHTML('<html><body><button id="first">처음</button><button id="next">다음</button></body></html>').document;}
function fixture(){
  const {document}=parseHTML('<html><body><button id="outer">외곽 도구</button><iframe></iframe></body></html>');
  const frame=document.querySelector('iframe');frame.dataset.centerEpoch='1';
  let child=childDocument(),active=document.body,focused=true,visible=true,current=true;
  Object.defineProperties(document,{activeElement:{get:()=>active},hasFocus:{value:()=>focused},visibilityState:{get:()=>visible?'visible':'hidden'}});
  Object.defineProperty(frame,'contentDocument',{get:()=>child});
  const tracker=mountCenterFrameFocus({frame,epoch:1,isActive:()=>current});
  const emit=(target,type)=>target.dispatchEvent(new target.ownerDocument.defaultView.Event(type,{bubbles:true}));
  return {document,frame,tracker,get child(){return child;},
    enter(){active=frame;emit(child.getElementById('first'),'focusin');},
    leave(){active=document.getElementById('outer');emit(active,'focusin');},
    moveInside(){emit(child.getElementById('first'),'focusout');emit(child.getElementById('next'),'focusin');},
    blurWindow(){focused=false;document.defaultView.dispatchEvent(new document.defaultView.Event('blur'));},
    focusWindow(){focused=true;document.defaultView.dispatchEvent(new document.defaultView.Event('focus'));},
    hideDocument(){visible=false;document.dispatchEvent(new document.defaultView.Event('visibilitychange'));},
    deactivate(){current=false;},
    replace(next){child=next;frame.dispatchEvent(new document.defaultView.Event('load'));},
  };
}

test('The workspace boundary follows actual child focus and clears on outer focus or window loss',async t=>{
  const f=fixture();t.after(()=>f.tracker.destroy());
  assert.equal(f.frame.dataset.centerFocus,undefined,'An idle frame has no permanent focus decoration');
  f.enter();assert.equal(f.frame.dataset.centerFocus,'1');
  f.moveInside();await settle();assert.equal(f.frame.dataset.centerFocus,'1','Moving between child controls retains the active boundary');
  f.leave();await settle();assert.equal(f.frame.dataset.centerFocus,undefined);
  f.enter();f.blurWindow();await settle();assert.equal(f.frame.dataset.centerFocus,undefined,'activeElement alone cannot mark an unfocused browser document');
  f.focusWindow();await settle();assert.equal(f.frame.dataset.centerFocus,'1');
  f.hideDocument();await settle();assert.equal(f.frame.dataset.centerFocus,undefined);
});

test('Restoring the price chart or changing epoch rejects delayed focus events from the retained child',async t=>{
  for(const change of [f=>f.tracker.destroy(),f=>f.deactivate(),f=>{f.frame.hidden=true;},f=>{f.frame.dataset.centerEpoch='2';},f=>f.frame.remove()]){
    const f=fixture();f.enter();change(f);f.moveInside();await settle();
    assert.equal(f.frame.dataset.centerFocus,undefined);f.tracker.destroy();
  }
  const f=fixture();t.after(()=>f.tracker.destroy());f.enter();f.tracker.destroy();
  f.frame.dataset.centerEpoch='2';
  const next=mountCenterFrameFocus({frame:f.frame,epoch:2,isActive:()=>true});t.after(()=>next.destroy());
  await settle();assert.equal(f.frame.dataset.centerFocus,'2','A queued old-epoch callback cannot erase the new owner');
  f.tracker.destroy();assert.equal(f.frame.dataset.centerFocus,'2');
});

test('Frame reload replaces focus listeners and an inaccessible child cannot own the focus boundary',async t=>{
  const f=fixture();t.after(()=>f.tracker.destroy());f.enter();
  const previous=f.child;f.replace(childDocument());f.leave();
  previous.getElementById('first').dispatchEvent(new previous.defaultView.Event('focusin',{bubbles:true}));
  await settle();assert.equal(f.frame.dataset.centerFocus,undefined,'The detached child cannot restore a boundary');
  f.enter();await settle();assert.equal(f.frame.dataset.centerFocus,'1');
  f.replace(null);await settle();assert.equal(f.frame.dataset.centerFocus,undefined);
});
