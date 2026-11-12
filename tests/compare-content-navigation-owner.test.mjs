import test from 'node:test';
import assert from 'node:assert/strict';
import {validateContentNavigationOwner,contentNavigationWheelDelta} from '../scripts/verify-compare-shell-browser.mjs';

const phone = () => ({navCount:1,originalNav:true,navItems:7,navLabelled:7,headerHostCount:0,headerOwnsNav:false,headerNavPainted:false,
  navDirection:'column',navOverflowX:'visible',navInSidebar:false,navInRail:true,sidebarRendered:false,railInDoc:true,railHidden:false,railCount:1});
const sidebar = () => ({...phone(),navInSidebar:true,navInRail:false,sidebarRendered:true,railHidden:true,railCount:0});
const header = () => ({...phone(),headerHostCount:1,headerOwnsNav:true,headerNavPainted:true,navDirection:'row',navOverflowX:'auto',navInRail:false,railHidden:true,railCount:0});

test('P1 header and both original fallback owners satisfy distinct complete contracts',()=>{
  for(const snapshot of [header(),sidebar(),phone()])assert.deepEqual(validateContentNavigationOwner(snapshot),[]);
});
test('owner migration never accepts a cloned, duplicated or incomplete navigation',()=>{
  for(const original of [header(),sidebar(),phone()])for(const patch of [{navCount:0},{navCount:2},{originalNav:false},{navItems:6},{navItems:8},{navLabelled:6}])assert.ok(validateContentNavigationOwner({...original,...patch}).length);
});
test('header must own exactly one original node inside a painted horizontal scroll host',()=>{
  for(const patch of [{headerHostCount:0},{headerHostCount:2},{headerOwnsNav:false},{headerNavPainted:false},{navDirection:'column'},{navOverflowX:'hidden'},{navOverflowX:'visible'}])assert.ok(validateContentNavigationOwner({...header(),...patch}).length);
  assert.deepEqual(validateContentNavigationOwner({...header(),navOverflowX:'scroll'}),[]);
});
test('header cannot retain a painted/orphan rail or a second sidebar owner',()=>{
  for(const patch of [{sidebarRendered:true},{navInSidebar:true},{navInRail:true},{railInDoc:false},{railHidden:false},{railCount:1},{railCount:2}])assert.ok(validateContentNavigationOwner({...header(),...patch}).length);
});
test('sidebar fallback keeps the original connected hidden rail requirement',()=>{
  for(const patch of [{navInSidebar:false},{navInRail:true},{railInDoc:false},{railHidden:false},{railCount:1},{headerHostCount:1}])assert.ok(validateContentNavigationOwner({...sidebar(),...patch}).length);
});
test('phone fallback requires its one visible rail and cannot claim a missing header',()=>{
  for(const patch of [{navInRail:false},{railInDoc:false},{railHidden:true},{railCount:0},{railCount:2},{headerHostCount:1}])assert.ok(validateContentNavigationOwner({...phone(),...patch}).length);
});
test('owner validation preserves raw evidence for the browser receipt',()=>{
  const snapshot=header(),before=structuredClone(snapshot);validateContentNavigationOwner(snapshot);assert.deepEqual(snapshot,before);
});

const wheelState = () => ({itemLeft:121,itemRight:234,portLeft:0,portRight:200,scrollLeft:0,scrollWidth:867,clientWidth:200});
const applyWheel = (state,delta) => ({...state,itemLeft:state.itemLeft-delta,itemRight:state.itemRight-delta,scrollLeft:state.scrollLeft+delta});

test('320px shell with a 200px nav port reveals the 121..234px tab without fixed-step oscillation',()=>{
  const before=wheelState(),delta=contentNavigationWheelDelta(before);
  assert.equal(delta,34);
  const after=applyWheel(before,delta);
  assert.ok(after.itemLeft>=after.portLeft && after.itemRight<=after.portRight);
  assert.equal(contentNavigationWheelDelta(after),0);
  // The rejected fixed jump would clip the other edge and reverse forever.
  const overshot=applyWheel(before,180);
  assert.ok(overshot.itemLeft<overshot.portLeft);
  assert.deepEqual(applyWheel(overshot,-180),before);
});
test('edge-derived wheel deltas expose every tab forward and backward in repeated narrow-port journeys',()=>{
  const widths=[113,113,95,113,95,145,145],items=[];
  let position=0;
  for(const width of widths){items.push({left:position,right:position+width});position+=width+8;}
  const scrollWidth=position-8;
  let scrollLeft=0;
  for(let journey=0;journey<3;journey++)for(const item of [...items,...items.toReversed()]) {
    const before={itemLeft:60+item.left-scrollLeft,itemRight:60+item.right-scrollLeft,portLeft:60,portRight:260,scrollLeft,scrollWidth,clientWidth:200};
    const delta=contentNavigationWheelDelta(before);
    assert.ok(Number.isFinite(delta));
    const after=applyWheel(before,delta);scrollLeft=after.scrollLeft;
    assert.ok(scrollLeft>=0 && scrollLeft<=scrollWidth-200);
    assert.ok(after.itemLeft>=60 && after.itemRight<=260,JSON.stringify({before,delta,after}));
    assert.equal(contentNavigationWheelDelta(after),0,'a fully exposed tab cannot trigger a reversing wheel');
  }
  assert.equal(scrollLeft,0);
});
test('native wheel requests are bounded by remaining scroll extent and the full-visibility interval',()=>{
  assert.equal(contentNavigationWheelDelta({...wheelState(),scrollLeft:662}),5);
  assert.equal(contentNavigationWheelDelta({...wheelState(),itemLeft:-10,itemRight:103,scrollLeft:5}),-5);
  assert.equal(contentNavigationWheelDelta({...wheelState(),scrollLeft:667}),0);
  assert.equal(contentNavigationWheelDelta({...wheelState(),itemLeft:-10,itemRight:103}),0);
  const fractional={...wheelState(),itemLeft:.4,itemRight:200.4};
  assert.equal(contentNavigationWheelDelta(fractional),.4,'rounding must not clip the opposite edge of a full-port tab');
  assert.equal(contentNavigationWheelDelta(applyWheel(fractional,.4)),0);
});
test('invalid geometry and a tab wider than the exposed port cannot become wheel reach evidence',()=>{
  assert.equal(contentNavigationWheelDelta(),null);
  for(const key of Object.keys(wheelState()))for(const value of [NaN,Infinity,undefined]) {
    assert.equal(contentNavigationWheelDelta({...wheelState(),[key]:value}),null,`${key}: ${value}`);
  }
  for(const patch of [{portRight:0},{itemRight:121},{itemRight:322},{clientWidth:0},{scrollWidth:199},{scrollLeft:-1},{scrollLeft:668}]) {
    assert.equal(contentNavigationWheelDelta({...wheelState(),...patch}),null,JSON.stringify(patch));
  }
});
