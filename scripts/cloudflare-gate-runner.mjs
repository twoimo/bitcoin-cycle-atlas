import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {finished} from 'node:stream/promises';
import {StringDecoder} from 'node:string_decoder';
import {getPriority} from 'node:os';
import {fileURLToPath} from 'node:url';

const priorityCommand=fileURLToPath(new URL('./cloudflare-priority-command.mjs',import.meta.url));

const failure=value=>value instanceof Error?value:new Error(String(value??'Verification cancelled'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export function installVerificationSignalHandlers(controller){
  const onTerm=()=>controller.abort(new Error('Verification cancelled by SIGTERM'));
  const onInterrupt=()=>controller.abort(new Error('Verification cancelled by SIGINT'));
  process.on('SIGTERM',onTerm);process.on('SIGINT',onInterrupt);
  return ()=>{process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInterrupt);};
}

// A completed child can leave public output queued in this parent. Wait for
// the writable callbacks before cleanup or CLI exit can interrupt delivery.
export async function drainVerificationOutput(streams=[process.stdout,process.stderr],{timeoutMs=10000}={}){
  const results=await Promise.allSettled(streams.map(stream=>new Promise((accept,reject)=>{
    let settled=false;
    const dispose=()=>{stream.removeListener('error',onError);stream.removeListener('close',onClose);};
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):accept();};
    const onError=error=>{finish(error);dispose();};
    const onClose=()=>{finish(new Error('Verification public output closed before its writes drained'));dispose();};
    const timer=setTimeout(()=>finish(new Error('Verification public output did not drain within its bound')),timeoutMs);
    stream.once('error',onError);stream.once('close',onClose);
    try{stream.write('',error=>{
      finish(error);
      // A failed write invokes its callback before emitting error. Keep the
      // listener until that event; otherwise a failed drain could crash the CLI.
      if(!error)dispose();
    });}catch(error){finish(error);dispose();}
  })));
  const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
  if(errors.length===1)throw errors[0];
  if(errors.length>1)throw new AggregateError(errors,'Verification public output failed to drain');
}

// Each pipe owns its decoder. Only complete lines enter the shared public
// stream; a sibling's TAP output must never split an evidence JSON record.
export function completeLineWriter(write,{maximumBytes=16*1024*1024}={}){
  const decoder=new StringDecoder('utf8');let pending='',ended=false;
  function flush(){
    let index;
    while((index=pending.indexOf('\n'))>=0){
      const line=pending.slice(0,index+1);pending=pending.slice(index+1);
      assert.ok(Buffer.byteLength(line)<=maximumBytes,'Verification log line exceeds its bounded transport');write(line);
    }
    assert.ok(Buffer.byteLength(pending)<=maximumBytes,'Verification log line exceeds its bounded transport');
  }
  return {
    write(bytes){assert.equal(ended,false,'Cannot write a closed log transport');pending+=decoder.write(Buffer.from(bytes));flush();},
    end(){if(ended)return;ended=true;pending+=decoder.end();flush();if(pending){write(pending+'\n');pending='';}},
  };
}

// Linux detached children own their process group. Resolve/reject only after
// close (including inherited output pipes), never immediately after kill().
export async function runVerificationCommand(command,args,{id,cwd,environment,deadline,signal,log,terminationGraceMs=500,nice}={}){
  signal?.throwIfAborted();
  assert.ok(deadline-Date.now()>0,'Verification execution budget expired before '+id);
  return new Promise((accept,reject)=>{
    let problem=null,closed=false,killTimer,initialNice,launchedAt;
    const invocation=nice===undefined?{command,args}:{command:process.execPath,args:[priorityCommand,'--gate',id,'--nice',String(nice),'--',command,...args]};
    const child=spawn(invocation.command,invocation.args,{cwd,env:environment,stdio:['ignore','pipe','pipe'],detached:process.platform==='linux'});
    const stop=(terminationSignal='SIGKILL')=>{
      if(!child.pid)return;
      try{if(process.platform==='linux')process.kill(-child.pid,terminationSignal);else child.kill(terminationSignal);}
      catch(error){if(error.code!=='ESRCH')problem??=error;}
    };
    const cancel=reason=>{
      problem??=failure(reason);if(killTimer)return;
      stop('SIGTERM');killTimer=setTimeout(()=>stop(),terminationGraceMs);
    };
    const abort=()=>cancel(signal.reason);
    const timer=setTimeout(()=>cancel(new Error('Verification exceeded its execution budget at '+id)),Math.max(1,deadline-Date.now()));
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    for(const [name,stream] of [['stdout',child.stdout],['stderr',child.stderr]])stream.on('data',bytes=>{
      try{log(bytes,name);}catch(error){cancel(error);}
    });
    child.on('spawn',()=>{launchedAt=new Date().toISOString();try{initialNice=getPriority(child.pid);}catch(error){cancel(error);}});
    child.on('error',error=>cancel(error));
    child.on('exit',(code,exitSignal)=>{
      if(code!==0)cancel(new Error(id+' failed with '+(exitSignal??'exit '+code)));
    });
    child.on('close',(code,exitSignal)=>{
      if(closed)return;closed=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);
      if(problem||code!==0){stop();reject(problem??new Error(id+' failed with '+(exitSignal??'exit '+code)));}
      else accept({code,signal:exitSignal,pid:child.pid,initialNice,launchedAt});
    });
  });
}

export async function executeLoggedGate({id,root,directory,signal,run,validate=()=>({}),publicWrite=line=>process.stdout.write(line)}){
  const began=Date.now(),startedAt=new Date(began).toISOString(),path=resolve(directory,id+'.log');
  await mkdir(directory,{recursive:true});
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const output=createWriteStream(path,{flags:'w'}),writers=new Map();let problem=null,value,details;
  output.on('error',error=>{problem??=error;controller.abort(error);});
  const log=(bytes,pipe='stdout')=>{
    if(output.destroyed)throw problem??new Error('Verification log closed before its command');
    output.write(bytes);
    if(!writers.has(pipe))writers.set(pipe,completeLineWriter(publicWrite));
    writers.get(pipe).write(bytes);
  };
  try{controller.signal.throwIfAborted();value=await run({log,signal:controller.signal});}
  catch(error){problem??=failure(error);}
  finally{
    signal?.removeEventListener('abort',abort);
    for(const writer of writers.values())try{writer.end();}catch(error){problem??=failure(error);}
    output.end();try{await finished(output,{cleanup:true});}catch(error){problem??=failure(error);}
  }
  let bytes;
  try{bytes=await readFile(path);}catch(error){problem??=failure(error);}
  if(!problem)try{signal?.throwIfAborted();details=await validate({value,logBytes:bytes});signal?.throwIfAborted();}
  catch(error){problem=failure(error);}
  const gate={id,status:problem?'FAIL':'PASS',startedAt,completedAt:new Date().toISOString(),durationMs:Date.now()-began,
    log:relative(root,path),logSha256:bytes?digest(bytes):null,...(problem?{error:problem.message}:{})};
  if(problem){const error=new Error(id+' failed: '+problem.message,{cause:problem});error.gateResult=gate;throw error;}
  return {gate,details};
}

const numbers=text=>Object.fromEntries(String(text??'').trim().split('\n').map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length===2&&/^\d+$/.test(parts[1])).map(([key,value])=>[key,Number(value)]));
const number=value=>/^\d+$/.test(value??'')&&Number.isSafeInteger(Number(value))?Number(value):null;

export async function readVerificationResources({read=path=>readFile(path,'utf8')}={}){
  try{
    const membership=await read('/proc/self/cgroup'),path=membership.match(/^0::([^\n]*)$/m)?.[1];
    if(path===undefined)return {available:false,reason:'cgroup-v2-unavailable'};
    const base='/sys/fs/cgroup',candidates=[...new Set([resolve(base,'.'+path),base])];
    for(const directory of candidates){
      if(directory!==base&&!directory.startsWith(base+'/'))continue;
      const paths=['memory.current','memory.max','memory.peak','memory.events','cpu.max','cpu.stat'];
      const values=await Promise.all(paths.map(name=>read(resolve(directory,name)).then(value=>value.trim(),()=>null)));
      if(number(values[0])===null||values[1]===null)continue;
      return {available:true,cgroup:directory,checkedAt:new Date().toISOString(),memoryCurrentBytes:number(values[0]),memoryLimitBytes:number(values[1]),
        memoryLimitRaw:values[1],lifetimeMemoryPeakBytes:number(values[2]),memoryEvents:numbers(values[3]),cpuMax:values[4],cpu:numbers(values[5])};
    }
    return {available:false,reason:'cgroup-v2-metrics-unreadable'};
  }catch(error){return {available:false,reason:'resource-observation-failed',error:error.code??error.name};}
}

export async function measureVerificationResources({read=readVerificationResources,intervalMs=1000}={}){
  const initial=await read();let last=initial,samples=initial.available?1:0,maximum=initial.memoryCurrentBytes??null,pending=null;
  const sample=async()=>{
    const value=await read();
    last=value;if(value.available){samples++;maximum=Math.max(maximum??0,value.memoryCurrentBytes??0);}
    return value;
  };
  const timer=setInterval(()=>{if(!pending)pending=sample().finally(()=>{pending=null;});},intervalMs);timer.unref();
  return {async finish(){
    clearInterval(timer);await pending;await sample();
    const same=initial.available&&last.available&&initial.cgroup===last.cgroup;
    const delta=(end,start)=>Object.fromEntries(Object.entries(end??{}).filter(([key,value])=>Number.isSafeInteger(value)&&Number.isSafeInteger(start?.[key])&&value>=start[key]).map(([key,value])=>[key,value-start[key]]));
    return {available:Boolean(same),scope:'Observed shared build cgroup; sampled group memory and lifetime kernel peak, not a runtime-fit certification',
      sampleIntervalMs:intervalMs,samples,maximumObservedMemoryBytes:maximum,initial,final:last,
      ...(same?{cpuDelta:delta(last.cpu,initial.cpu),memoryEventDelta:delta(last.memoryEvents,initial.memoryEvents)}:{})};
  }};
}

export async function runVerificationGroup(gates,execute,{signal,measure=measureVerificationResources}={}){
  assert.ok(gates.length>0,'An execution group cannot omit its gates');
  const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const started=Date.now(),startedAt=new Date(started).toISOString();let observation;
  try{
    observation=await measure();
    const settled=await Promise.allSettled(gates.map(async gate=>{
      try{return await execute(gate,{signal:controller.signal});}
      catch(error){controller.abort(error);throw error;}
    }));
    const resources=await observation.finish();
    return {settled,measurement:{gateIds:gates.map(gate=>gate.id),startedAt,completedAt:new Date().toISOString(),durationMs:Date.now()-started,resources}};
  }finally{signal?.removeEventListener('abort',abort);}
}
