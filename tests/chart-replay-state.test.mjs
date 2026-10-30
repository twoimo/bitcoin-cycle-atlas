import test from 'node:test';
import assert from 'node:assert/strict';
import {createChartReplayController,CHART_REPLAY_SPEEDS} from '../dist/chart-replay-state.js';

const session=(id='one',length=3)=>({identity:{outputHash:id,recordId:id},
  timeline:Array.from({length},(_,i)=>'2026-01-'+String(i+1).padStart(2,'0')),
  forecast:[{date:'2026-01-01',price:100},{date:'2026-01-03',price:105}]});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

function harness(onChange){
  let id=0,clock=0;
  const pending=new Map(),all=new Map(),states=[];
  const controller=createChartReplayController({now:()=>clock,
    setTimer(callback,delay){const key=++id,item={callback,delay,due:clock+delay};all.set(key,item);pending.set(key,item);return key;},
    clearTimer(key){pending.delete(key);},
    onChange(state){states.push(state);onChange?.(state,controller);},
  });
  return {controller,pending,all,states,
    advance(milliseconds){clock+=milliseconds;},
    fire(key=[...pending.keys()][0]){if(key===undefined)return;const active=pending.get(key);if(active)clock=Math.max(clock,active.due);pending.delete(key);all.get(key).callback();},
    load(value=session()){return controller.selectOrigin({symbol:'BTCUSD',asOf:'2026-01-01'},async()=>value);},
  };
}

test('main replay loads a fixed branded object and keeps it through forward, reverse and restart',async()=>{
  const h=harness(),fixed=session();h.controller.open();
  assert.equal(h.controller.getState().status,'selecting');
  assert.equal(await h.load(fixed),true);
  assert.equal(h.controller.getState().session,fixed);
  assert.ok(Object.isFrozen(fixed.forecast[0]));
  const original=JSON.stringify(fixed);
  h.controller.step(1);assert.equal(h.controller.getState().cursorIndex,1);
  h.controller.step(-1);assert.equal(h.controller.getState().cursorIndex,0);
  h.controller.seek(2);assert.equal(h.controller.getState().status,'ended');
  h.controller.play();assert.equal(h.controller.getState().cursorIndex,0);
  h.fire();h.fire();assert.equal(h.controller.getState().status,'ended');
  assert.equal(h.controller.getState().session,fixed);assert.equal(JSON.stringify(fixed),original);
  assert.equal(h.pending.size,0);
});

test('superseded origin success and failure cannot replace the current chart',async()=>{
  for(const outcome of ['resolve','reject']){
    const h=harness(),old=deferred(),fresh=deferred();let oldSignal;
    const a=h.controller.selectOrigin('old',({signal})=>{oldSignal=signal;return old.promise;});
    const b=h.controller.selectOrigin('new',()=>fresh.promise);
    assert.equal(oldSignal.aborted,true);fresh.resolve(session('new'));assert.equal(await b,true);
    const expected=h.controller.getState(),count=h.states.length;
    old[outcome](outcome==='resolve'?session('old'):new Error('old request failure'));
    assert.equal(await a,false);assert.deepEqual(h.controller.getState(),expected);
    assert.equal(h.states.length,count,'revoked request must not notify the chart');
  }
});

test('exit, start selection and destroy revoke pending work even when its loader ignores abort',async()=>{
  for(const command of ['exit','open','destroy'])for(const outcome of ['resolve','reject']){
    const h=harness(),work=deferred();let signal;
    const promise=h.controller.selectOrigin('origin',args=>{signal=args.signal;return work.promise;});
    h.controller[command]();const expected=h.controller.getState(),count=h.states.length;
    work[outcome](outcome==='resolve'?session():new Error('late load'));
    assert.equal(await promise,false);assert.equal(signal.aborted,true);
    assert.deepEqual(h.controller.getState(),expected);assert.equal(h.states.length,count);
    assert.equal(expected.session,null);assert.equal(h.pending.size,0);
  }
});

test('load errors clear stale session output and a retry can recover',async()=>{
  const h=harness();await h.load();h.controller.play();
  assert.equal(await h.controller.selectOrigin('bad',async()=>{throw new Error('가격 자료를 읽지 못했습니다.');}),false);
  const failed=h.controller.getState();
  assert.equal(failed.status,'error');assert.equal(failed.error,'가격 자료를 읽지 못했습니다.');
  assert.equal(failed.session,null);assert.equal(failed.length,0);assert.equal(h.pending.size,0);
  assert.equal(await h.load(),true);assert.equal(h.controller.getState().error,null);
});

test('invalid sessions cannot enter a playable state',async()=>{
  for(const value of [null,{},session('empty',0),{...session(),timeline:['2026-01-02','2026-01-01']}]){
    const h=harness();assert.equal(await h.load(value),false);
    assert.equal(h.controller.getState().status,'error');assert.equal(h.controller.getState().session,null);
    h.controller.play();assert.equal(h.pending.size,0);
  }
});

test('one bar is terminal and seeks clamp to available bars without fabricating more',async()=>{
  const h=harness();await h.load(session('one',1));h.controller.play();h.controller.step(1);h.controller.step(-1);
  assert.equal(h.controller.getState().status,'ended');assert.equal(h.controller.getState().cursorIndex,0);assert.equal(h.pending.size,0);
  await h.load(session('many',5));h.controller.seek(100);assert.equal(h.controller.getState().cursorIndex,4);
  h.controller.seek(-100);assert.equal(h.controller.getState().cursorIndex,0);
  assert.throws(()=>h.controller.seek(1.5),TypeError);assert.throws(()=>h.controller.step(2),RangeError);
  assert.throws(()=>h.controller.speed(0),RangeError);
});

test('play is idempotent and all speeds own exactly one correctly timed callback',async()=>{
  const h=harness();await h.load(session('speed',20));
  const expected=new Map([[.3,3000],[.5,2000],[1,1000],[2,500],[4,250],[8,125],[10,100]]);
  assert.deepEqual(CHART_REPLAY_SPEEDS,[...expected.keys()]);
  h.controller.play();assert.equal([...h.pending.values()][0].delay,1000);
  for(const value of CHART_REPLAY_SPEEDS){
    h.controller.play();h.controller.play();h.controller.speed(value);
    assert.equal(h.pending.size,1);assert.equal([...h.pending.values()][0].delay,expected.get(value));
    const stale=[...h.all.keys()].slice(0,-1),position=h.controller.getState().cursorIndex;
    for(const key of stale)h.fire(key);
    assert.equal(h.controller.getState().cursorIndex,position);assert.equal(h.pending.size,1);
    h.fire();assert.equal(h.controller.getState().cursorIndex,position+1);
  }
  h.controller.pause();assert.equal(h.pending.size,0);
  const painted=harness(state=>{if(state.status==='playing')painted.advance(35);});
  await painted.load(session('render-time',20));painted.controller.speed(10);painted.controller.play();
  assert.equal([...painted.pending.values()][0].delay,100);
  painted.fire();assert.equal([...painted.pending.values()][0].delay,65,'paint time belongs to the 100 ms period');
  painted.controller.pause();painted.advance(5000);painted.controller.speed(.3);painted.controller.play();
  assert.equal([...painted.pending.values()][0].delay,3000,'resuming starts a fresh explicit cadence');
  painted.fire();assert.equal([...painted.pending.values()][0].delay,2965);
  painted.advance(10000);const previous=painted.controller.getState().cursorIndex;painted.fire();
  assert.equal(painted.controller.getState().cursorIndex,previous+1,'a late callback reveals one bar, never a catch-up batch');
  assert.equal([...painted.pending.values()][0].delay,2965);
});

test('a timer callback can never be replayed twice or after pause, exit or a new origin',async()=>{
  const h=harness();await h.load(session('long',5));h.controller.play();
  const first=[...h.pending.keys()][0];h.fire(first);h.fire(first);
  assert.equal(h.controller.getState().cursorIndex,1,'one callback reveals only one new bar');
  const second=[...h.pending.keys()][0];h.controller.pause();h.fire(second);
  assert.equal(h.controller.getState().cursorIndex,1);
  h.controller.play();const third=[...h.pending.keys()][0];
  await h.load(session('replacement'));h.fire(third);
  assert.equal(h.controller.getState().cursorIndex,0);assert.equal(h.controller.getState().session.identity.outputHash,'replacement');
  h.controller.play();const fourth=[...h.pending.keys()][0];h.controller.exit();h.fire(fourth);
  assert.equal(h.controller.getState().status,'idle');assert.equal(h.controller.getState().session,null);assert.equal(h.pending.size,0);
});

test('reentrant chart callbacks cannot resurrect playback or schedule competing timers',async()=>{
  let action=null;
  const h=harness((state,controller)=>{if(state.status==='playing'&&action){const run=action;action=null;run(controller);}});
  await h.load(session('reentrant',5));action=controller=>controller.exit();h.controller.play();
  assert.equal(h.controller.getState().status,'idle');assert.equal(h.pending.size,0);
  await h.load(session('reentrant',5));h.controller.play();action=controller=>controller.speed(4);h.fire();
  assert.equal(h.pending.size,1);assert.equal([...h.pending.values()][0].delay,250);
  action=controller=>controller.pause();h.fire();assert.equal(h.pending.size,0);
});

test('a loading notification can revoke the request before the loader starts',async()=>{
  let calls=0;const h=harness((state,controller)=>{if(state.status==='loading')controller.exit();});
  assert.equal(await h.controller.selectOrigin('revoked',async()=>{calls++;return session();}),false);
  assert.equal(calls,0);assert.equal(h.controller.getState().status,'idle');
});

test('a rejected ready frame cannot report an accepted session to its awaiting caller',async()=>{
  for(const action of ['fail','exit','open','destroy']){
    let rejected=false;
    const h=harness((state,controller)=>{
      if(state.status==='paused'&&!rejected){rejected=true;controller[action]('The chart could not display this session');}
    });
    assert.equal(await h.load(),false,'A synchronous '+action+' must revoke load acceptance');
    assert.equal(h.controller.getState().session,null);assert.equal(h.pending.size,0);
  }
});

test('origin snapshots cannot be changed by the caller while a request waits',async()=>{
  const h=harness(),work=deferred(),origin={symbol:'BTCUSD',asOf:'2026-01-01'};
  const promise=h.controller.selectOrigin(origin,({origin:selected})=>{
    assert.ok(Object.isFrozen(selected));assert.equal(selected.asOf,'2026-01-01');return work.promise;
  });
  origin.asOf='2030-01-01';work.resolve(session());await promise;
  assert.equal(h.controller.getState().origin.asOf,'2026-01-01');assert.ok(Object.isFrozen(h.controller.getState()));
});

test('display failure revokes loaders and timers; destroy remains terminal without notifications',async()=>{
  const h=harness();await h.load();h.controller.play();const timer=[...h.pending.keys()][0];
  h.controller.fail(new Error('frame could not be drawn'));h.fire(timer);
  assert.equal(h.controller.getState().status,'error');assert.equal(h.controller.getState().session,null);assert.equal(h.pending.size,0);
  h.controller.destroy();const count=h.states.length,expected=h.controller.getState();
  h.controller.open();h.controller.play();h.controller.pause();h.controller.seek(1);h.controller.step(1);h.controller.speed(4);
  h.controller.fail('late');h.controller.exit();assert.equal(await h.load(),false);h.controller.destroy();
  assert.deepEqual(h.controller.getState(),expected);assert.equal(h.states.length,count);
});

test('all 10000 four-command playback traces preserve cursor, identity and timer ownership',async()=>{
  const actions=['play','pause','next','back','first','last','speed','tick','stale','exit'];
  for(let encoded=0;encoded<actions.length**4;encoded++){
    const h=harness();await h.load();let digits=encoded,trace=[];
    for(let depth=0;depth<4;depth++){
      const action=actions[digits%actions.length];digits=Math.floor(digits/actions.length);trace.push(action);
      if(action==='play'||action==='pause'||action==='exit')h.controller[action]();
      else if(action==='next'||action==='back')h.controller.step(action==='next'?1:-1);
      else if(action==='first'||action==='last')h.controller.seek(action==='first'?0:2);
      else if(action==='speed')h.controller.speed(4);
      else if(action==='tick')h.fire();
      else for(const key of h.all.keys())if(!h.pending.has(key))h.fire(key);
      const state=h.controller.getState(),label=trace.join(' → ');
      assert.equal(h.pending.size,state.status==='playing'?1:0,label);
      assert.ok(state.cursorIndex>=0&&state.cursorIndex<Math.max(1,state.length),label);
      if(state.session){assert.equal(state.session.identity.outputHash,'one',label);assert.equal(state.session.forecast[1].price,105,label);}
      if(state.status==='idle'){assert.equal(state.session,null,label);assert.equal(state.length,0,label);}
    }
    h.controller.destroy();
  }
});
