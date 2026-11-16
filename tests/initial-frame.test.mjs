import test from 'node:test';
import assert from 'node:assert/strict';
import {queueInitialFrame} from '../dist/ui/initial-frame.js';
function fixture(initial){let frame,timer,runs=0;const cancelled=[];const cancel=queueInitialFrame(()=>runs++,{initial,requestFrame:fn=>(frame=fn,11),cancelFrame:id=>cancelled.push(['frame',id]),setTimer:(fn,ms)=>(assert.equal(ms,80),timer=fn,22),clearTimer:id=>cancelled.push(['timer',id])});return {frame:()=>frame(),timer:()=>timer?.(),get hasTimer(){return Boolean(timer);},get runs(){return runs;},cancel,cancelled};}
test('first boot runs actual rendering when frames are starved, and the late frame cannot duplicate it',()=>{const f=fixture(true);assert.equal(f.runs,0);f.timer();assert.equal(f.runs,1);f.frame();assert.equal(f.runs,1);assert.ok(f.cancelled.some(([kind,id])=>kind==='frame'&&id===11));});
test('normal first frame wins the race and cancels the fallback',()=>{const f=fixture(true);f.frame();f.timer();assert.equal(f.runs,1);assert.ok(f.cancelled.some(([kind,id])=>kind==='timer'&&id===22));});
test('post-boot gestures retain frame scheduling and never receive a fallback timer',()=>{const f=fixture(false);assert.equal(f.hasTimer,false);f.timer();assert.equal(f.runs,0);f.frame();assert.equal(f.runs,1);});
test('cancellation prevents both pending callbacks from rendering',()=>{const f=fixture(true);f.cancel();f.frame();f.timer();assert.equal(f.runs,0);});
