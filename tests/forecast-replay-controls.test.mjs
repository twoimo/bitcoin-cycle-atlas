import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplayController} from '../dist/forecast-replay-view.js';
import './helpers/forecast-replay-vintage-boundaries.mjs';
import {verifyReplayViewFailure} from './helpers/forecast-replay-view-failure.mjs';

function harness(length=6,onChange){
  let next=0;
  const timers=new Map(),cleared=new Set(),states=[];
  const controller=createReplayController({length,intervalMs:800,
    setTimer:(callback,delay)=>{const id=++next;timers.set(id,{callback,delay});return id;},
    clearTimer:id=>cleared.add(id),onChange:state=>{states.push(state);onChange?.(state,controller);}});
  return {controller,timers,cleared,states,tick(id=next){timers.get(id).callback();},latest:()=>next};
}

test('replay steps and direct seeks reveal the same position and never run a timer',()=>{
  const h=harness();h.controller.step(1);h.controller.step(1);
  const bySteps=h.controller.getState();h.controller.seek(0);h.controller.seek(2);
  assert.deepEqual(h.controller.getState(),bySteps);
  h.controller.step(-1);assert.equal(h.controller.getState().cursorIndex,1);
  assert.equal(h.timers.size,0);assert.equal(h.controller.getState().status,'paused');
  assert.ok(Object.isFrozen(h.controller.getState()));
});

test('replay play is idempotent and reaches a stopped terminal position',()=>{
  const h=harness(3);h.controller.play();const first=h.latest();h.controller.play();
  assert.equal(h.latest(),first);assert.equal(h.timers.get(first).delay,800);
  h.tick();assert.deepEqual(h.controller.getState(),{cursorIndex:1,status:'playing',speed:1});
  h.tick();assert.deepEqual(h.controller.getState(),{cursorIndex:2,status:'ended',speed:1});
  const finalTimer=h.latest();h.tick();assert.equal(h.latest(),finalTimer);assert.equal(h.controller.getState().cursorIndex,2);
  h.controller.play();assert.equal(h.controller.getState().cursorIndex,0);assert.equal(h.controller.getState().status,'playing');
});

test('pause, seek, speed changes and destroy discard already queued old callbacks',()=>{
  const h=harness();h.controller.play();const first=h.latest();h.controller.pause();const paused=h.controller.getState();
  h.tick(first);assert.deepEqual(h.controller.getState(),paused);assert.ok(h.cleared.has(first));
  h.controller.play();const beforeSeek=h.latest();h.controller.seek(4);h.tick(beforeSeek);
  assert.equal(h.controller.getState().cursorIndex,4);assert.equal(h.controller.getState().status,'paused');
  h.controller.seek(0);h.controller.play();const oldSpeed=h.latest();h.controller.speed(4);
  const current=h.latest();assert.equal(h.timers.get(current).delay,200);h.tick(oldSpeed);assert.equal(h.controller.getState().cursorIndex,0);
  h.tick(current);assert.equal(h.controller.getState().cursorIndex,1);
  const beforeDestroy=h.latest(),count=h.states.length;h.controller.destroy();h.tick(beforeDestroy);h.controller.play();h.controller.seek(3);
  assert.equal(h.states.length,count);assert.equal(h.controller.getState().cursorIndex,1);
});

test('a callback can close the view without leaving a scheduled successor',()=>{
  const h=harness(8,(state,controller)=>{if(state.cursorIndex===1)controller.destroy();});
  h.controller.play();const first=h.latest();h.tick(first);
  assert.equal(h.latest(),first);assert.equal(h.controller.getState().cursorIndex,1);assert.equal(h.controller.getState().status,'paused');
});

test('a destroyed session callback cannot advance the replacement session',()=>{
  const a=harness(),b=harness();a.controller.play();const old=a.latest();a.controller.destroy();b.controller.play();
  a.tick(old);assert.equal(b.controller.getState().cursorIndex,0);
  b.tick();assert.equal(b.controller.getState().cursorIndex,1);
});

test('one-frame and bounded-position controls cannot advance outside available bars',()=>{
  const h=harness(1);h.controller.play();h.controller.step(1);h.controller.step(-1);
  assert.deepEqual(h.controller.getState(),{cursorIndex:0,status:'ended',speed:1});assert.equal(h.timers.size,0);
  const multi=harness(5);multi.controller.seek(500);assert.equal(multi.controller.getState().cursorIndex,4);
  multi.controller.seek(-8);assert.equal(multi.controller.getState().cursorIndex,0);
  assert.throws(()=>multi.controller.seek(1.5),/integer/);
  assert.throws(()=>multi.controller.step(2),/one bar/);
  assert.throws(()=>multi.controller.speed(0),/speed/);
  assert.throws(()=>createReplayController({length:0}),/nonempty/);
});

test('view failures stop playback, conceal stale outputs and permit a clean retry',async()=>{
  const result=await verifyReplayViewFailure();
  assert.equal(result.status,'passed');assert.equal(result.checks.length,4);
});
