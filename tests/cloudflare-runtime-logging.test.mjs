import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,basename,dirname} from 'node:path';
import {executeLoggedGate} from '../scripts/cloudflare-gate-runner.mjs';
import {runRuntimeCommand,startIsolatedPostgres} from '../scripts/bootstrap-cloudflare-build.mjs';

async function temporary(t){const path=await mkdtemp(resolve(tmpdir(),'atlas-runtime-logging-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}

test('isolated PostgreSQL cleanup uses its live gate logger after startup logging is sealed',async t=>{
  const root=await temporary(t),calls=[];let database;
  const runCommand=async(command,args,{log})=>{
    const binary=command==='runuser'?basename(args[3]):basename(command);
    const stop=binary==='pg_ctl'&&args.at(-1)==='stop';calls.push({binary,stop});
    log((stop?'database stopped':'database startup '+binary)+'\n');
    return {code:0,output:binary==='psql'?'170011\n':''};
  };
  const startup=await executeLoggedGate({id:'runtime-preflight',root,directory:root,publicWrite:()=>{},run:async({log})=>{
    database=await startIsolatedPostgres({log,environment:{},runCommand,allocatePort:async()=>55432});
  }});
  const original=await readFile(resolve(root,'runtime-preflight.log'));
  const shutdown=await executeLoggedGate({id:'postgres-service-tests',root,directory:root,publicWrite:()=>{},run:({log})=>database.cleanup({log})});
  assert.equal(startup.gate.status,'PASS');assert.equal(shutdown.gate.status,'PASS');assert.equal(database.serverVersion,'17.11');
  assert.deepEqual(await readFile(resolve(root,'runtime-preflight.log')),original,'A sealed startup receipt must not change');
  assert.equal(await readFile(resolve(root,'postgres-service-tests.log'),'utf8'),'database stopped\n');
  assert.equal(calls.filter(call=>call.stop).length,1);
  await database.cleanup({log:()=>{throw new Error('A completed database must not log another shutdown');}});
});

test('runtime command callback errors reject only after the child and its output close',async t=>{
  const root=await temporary(t),closed=resolve(root,'child-closed'),expected=new Error('sealed gate logger');let pid;
  const code=`import {writeFileSync} from 'node:fs';const keepAlive=setInterval(()=>{},1000);
    process.on('SIGTERM',()=>{writeFileSync(${JSON.stringify(closed)},'shutdown observed');clearInterval(keepAlive);process.stdout.write('shutdown complete\\n');});
    console.log(process.pid);`;
  await assert.rejects(runRuntimeCommand(process.execPath,['--input-type=module','-e',code],{cwd:root,timeout:5000,log:text=>{pid=Number(text.trim());throw expected;}}),error=>error===expected);
  assert.ok(Number.isInteger(pid)&&pid>0);assert.equal(await readFile(closed,'utf8'),'shutdown observed');
  assert.throws(()=>process.kill(pid,0),{code:'ESRCH'},'The rejected operation must have reaped its child');
});

test('PostgreSQL startup and shutdown failures retain both errors',async t=>{
  const cleanupError=new Error('fixture shutdown logger failed');
  await assert.rejects(startIsolatedPostgres({environment:{},allocatePort:async()=>55432,runCommand:async(command,args)=>{
    const binary=command==='runuser'?basename(args[3]):basename(command);
    if(binary==='initdb'){const directory=dirname(args[args.indexOf('-D')+1]);t.after(()=>rm(directory,{recursive:true,force:true}));}
    if(binary==='pg_ctl'&&args.at(-1)==='stop')throw cleanupError;
    return {code:0,output:binary==='psql'?'160000\n':''};
  }}),error=>{
    assert.ok(error instanceof AggregateError);assert.equal(error.errors.length,2);
    assert.match(error.errors[0].message,/live PostgreSQL server differs/);assert.equal(error.errors[1],cleanupError);return true;
  });
});
