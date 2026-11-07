#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {getPriority,setPriority} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const commandPriorityPrefix='ATLAS_CLOUDFLARE_COMMAND_PRIORITY ';

export function applyCommandPriority(nice,{read=getPriority,write=setPriority,platform=process.platform}={}){
  assert.equal(platform,'linux','The verified command priority requires Linux nice semantics');
  assert.ok(Number.isInteger(nice)&&nice>=0&&nice<=19,'A bounded nonnegative nice value is required');
  const beforeNice=read(0);
  assert.ok(Number.isInteger(beforeNice)&&beforeNice<=nice,'Verification must not raise its inherited CPU priority');
  write(0,nice);
  const actualNice=read(0);assert.equal(actualNice,nice,'Requested CPU priority was not applied');
  return {beforeNice,actualNice};
}

// Change only this command wrapper before fork/exec. The outer runner and its
// browser sibling retain their existing priority; npm and its workers inherit
// the lowered value before their Node runtimes or test computations start.
export async function runPrioritizedCommand({id,nice,command,args,cwd=process.cwd(),environment=process.env,
  priorityApi,spawnCommand=spawn,write=(bytes,pipe)=>process[pipe].write(bytes)}={}){
  assert.equal(typeof id,'string');assert.ok(id.length>0);
  assert.equal(typeof command,'string');assert.ok(command.length>0);assert.ok(Array.isArray(args)&&args.every(value=>typeof value==='string'));
  const read=priorityApi?.read??getPriority,parentNice=read(process.ppid);
  const applied=applyCommandPriority(nice,priorityApi);
  return new Promise((accept,reject)=>{
    let problem=null,receipt=null;
    const child=spawnCommand(command,args,{cwd,env:environment,stdio:['ignore','pipe','pipe'],detached:false});
    const fail=error=>{problem??=error;child.kill('SIGTERM');};
    child.on('spawn',()=>{
      try{
        const commandNice=read(child.pid);assert.equal(commandNice,nice,'Command did not inherit the requested CPU priority');
        receipt={schemaVersion:1,kind:'atlas-cloudflare-command-priority',status:'APPLIED',gateId:id,requestedNice:nice,...applied,
          wrapperPid:process.pid,parentPid:process.ppid,parentNice,commandPid:child.pid,commandNice,command,args};
        write(commandPriorityPrefix+JSON.stringify(receipt)+'\n','stdout');
      }catch(error){fail(error);}
    });
    for(const [pipe,stream] of [['stdout',child.stdout],['stderr',child.stderr]])stream.on('data',bytes=>{
      try{write(bytes,pipe);}catch(error){fail(error);}
    });
    child.on('error',error=>{problem??=error;});
    child.on('close',(code,signal)=>{
      if(problem)reject(problem);
      else if(!receipt)reject(new Error('Command priority was not observed before execution'));
      else if(code!==0)reject(new Error(id+' exited with '+(signal??code)));
      else accept(receipt);
    });
  });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [gateFlag,id,niceFlag,nice,separator,command,...args]=process.argv.slice(2);
    assert.equal(gateFlag,'--gate');assert.equal(niceFlag,'--nice');assert.equal(separator,'--');assert.match(nice??'',/^\d{1,2}$/);
    await runPrioritizedCommand({id,nice:Number(nice),command,args});
  }catch(error){console.error(error.stack??error);process.exitCode=1;}
}
