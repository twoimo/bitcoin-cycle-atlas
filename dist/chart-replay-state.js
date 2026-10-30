export const CHART_REPLAY_SPEEDS=Object.freeze([.3,.5,1,2,4,8,10]);
// The 0.3× setting intentionally means three seconds per source observation.
// It is an explicit product cadence, rather than the reciprocal 3333… ms.
export const CHART_REPLAY_DELAYS=Object.freeze({0.3:3000,0.5:2000,1:1000,2:500,4:250,8:125,10:100});

function freeze(value,seen=new WeakSet()){
  if(value&&typeof value==='object'&&!seen.has(value)){
    seen.add(value);
    for(const item of Object.values(value))freeze(item,seen);
    Object.freeze(value);
  }
  return value;
}

function checkedSession(session){
  if(!session||!Array.isArray(session.timeline)||!session.timeline.length||
    !session.identity||typeof session.identity.outputHash!=='string'||!session.identity.outputHash)
    throw new TypeError('A verified replay session with a fixed output and nonempty timeline is required');
  let previous=null;
  for(const date of session.timeline){
    if(typeof date!=='string'||previous!==null&&date<=previous)
      throw new RangeError('Replay bars must be ordered without duplicate dates');
    previous=date;
  }
  // Preserve the engine session object: its provenance is held by an engine WeakSet.
  return freeze(session);
}

export function createChartReplayController({onChange=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,
  intervalMs=1000,now=()=>globalThis.performance?.now?.()??Date.now()}={}){
  if(typeof onChange!=='function'||typeof setTimer!=='function'||typeof clearTimer!=='function'||typeof now!=='function'||
    !Number.isFinite(intervalMs)||intervalMs<=0)throw new TypeError('Replay callbacks and a positive interval are required');
  let state={status:'idle',session:null,origin:null,cursorIndex:0,length:0,speed:1,error:null,generation:0};
  let request=null,timer=null,timerGeneration=0,timerDeadline=null,destroyed=false;
  const snapshot=()=>Object.freeze({...state});
  const notify=()=>{if(!destroyed)onChange(snapshot());};
  function cancelTimer(){
    timerGeneration++;timerDeadline=null;
    if(timer!==null){clearTimer(timer);timer=null;}
  }
  function revoke(){
    cancelTimer();
    state={...state,generation:state.generation+1};
    const previous=request;request=null;
    previous?.abort();
  }
  function clearSession(status,{origin=null,error=null}={}){
    state={...state,status,session:null,origin,cursorIndex:0,length:0,error};
  }
  function owns(generation,owner){
    return !destroyed&&state.generation===generation&&request===owner&&!owner.signal.aborted;
  }
  function schedule(){
    if(destroyed||state.status!=='playing'||timer!==null)return;
    const generation=state.generation,owned=++timerGeneration;
    const period=CHART_REPLAY_DELAYS[state.speed]*intervalMs/1000,started=now();
    const deadline=timerDeadline??started+period;
    timerDeadline=deadline;
    timer=setTimer(()=>{
      if(destroyed||generation!==state.generation||owned!==timerGeneration||state.status!=='playing')return;
      timer=null;
      // A queued callback is single-use, even if a scheduler delivers it twice.
      timerGeneration++;
      // Charge rendering to this period instead of waiting a whole period after
      // every paint. A late/background callback still reveals only one bar.
      const tickAt=now();
      timerDeadline=deadline+period>tickAt?deadline+period:tickAt+period;
      const cursorIndex=Math.min(state.length-1,state.cursorIndex+1);
      state={...state,cursorIndex,status:cursorIndex===state.length-1?'ended':'playing'};
      notify();
      if(!destroyed&&generation===state.generation)schedule();
    },Math.max(0,deadline-started));
  }
  function open(){
    if(destroyed)return;
    revoke();clearSession('selecting');notify();
  }
  async function selectOrigin(origin,loadSession){
    if(destroyed)return false;
    if(typeof loadSession!=='function')throw new TypeError('A replay session loader is required');
    const selected=freeze(structuredClone(origin));
    revoke();
    const owner=new AbortController(),generation=state.generation;
    request=owner;clearSession('loading',{origin:selected});notify();
    if(!owns(generation,owner))return false;
    let session;
    try{
      session=await loadSession({signal:owner.signal,origin:selected,generation});
      if(!owns(generation,owner))return false;
      session=checkedSession(session);
    }catch(reason){
      if(!owns(generation,owner))return false;
      request=null;
      clearSession('error',{origin:selected,error:reason instanceof Error?reason.message:String(reason??'Replay could not be loaded')});
      notify();return false;
    }
    request=null;
    state={...state,status:session.timeline.length===1?'ended':'paused',session,length:session.timeline.length,
      cursorIndex:0,error:null};
    notify();return !destroyed&&state.generation===generation&&state.session===session;
  }
  function pause(){
    if(destroyed)return;
    cancelTimer();
    if(state.status!=='playing')return;
    state={...state,status:state.cursorIndex===state.length-1?'ended':'paused'};notify();
  }
  function play(){
    if(destroyed||!state.session||state.length<2||state.status==='playing')return;
    cancelTimer();
    const generation=state.generation;
    state={...state,cursorIndex:state.cursorIndex===state.length-1?0:state.cursorIndex,status:'playing'};
    notify();
    if(!destroyed&&generation===state.generation)schedule();
  }
  function seek(index){
    if(destroyed)return;
    if(!Number.isSafeInteger(index))throw new TypeError('Replay position must be an integer');
    if(!state.session)return;
    cancelTimer();
    const cursorIndex=Math.max(0,Math.min(state.length-1,index));
    state={...state,cursorIndex,status:cursorIndex===state.length-1?'ended':'paused'};notify();
  }
  function speed(value){
    if(destroyed)return;
    if(!CHART_REPLAY_SPEEDS.includes(value))throw new RangeError('Unsupported replay speed');
    cancelTimer();
    const generation=state.generation;
    state={...state,speed:value};notify();
    if(!destroyed&&generation===state.generation)schedule();
  }
  function exit(){
    if(destroyed)return;
    revoke();clearSession('idle');notify();
  }
  function fail(reason){
    if(destroyed)return;
    const origin=state.origin;
    revoke();clearSession('error',{origin,error:reason instanceof Error?reason.message:String(reason??'Replay could not be displayed')});notify();
  }
  return Object.freeze({getState:snapshot,open,selectOrigin,play,pause,seek,speed,exit,fail,
    step(direction){
      if(destroyed)return;
      if(direction!==-1&&direction!==1)throw new RangeError('Replay step must be one bar');
      seek(state.cursorIndex+direction);
    },
    destroy(){
      if(destroyed)return;
      revoke();clearSession('idle');destroyed=true;
    },
  });
}
