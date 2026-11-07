import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Writable} from 'node:stream';
import {completeLineWriter,executeLoggedGate,runVerificationCommand,runVerificationGroup,readVerificationResources,
  measureVerificationResources,installVerificationSignalHandlers,drainVerificationOutput} from '../scripts/cloudflare-gate-runner.mjs';
import {decodeCompressedBrowserReport} from '../scripts/browser-evidence-transport.mjs';
import {packagingFixtureEnvironment} from './helpers/isolated-packaging-fixture.mjs';

const cancellation=new AbortController(),removeSignals=installVerificationSignalHandlers(cancellation);
after(removeSignals);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const noMeasurement=async()=>({finish:async()=>({available:false,reason:'unit-fixture'})});
async function temporary(t){const path=await mkdtemp(resolve(tmpdir(),'atlas-gate-runner-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
function execute(root,code,{publicWrite=()=>{},validate,deadline=Date.now()+5000}={}){
  return (gate,{signal=cancellation.signal}={})=>executeLoggedGate({id:gate.id,root,directory:root,signal,publicWrite,validate,
    run:({log,signal})=>runVerificationCommand(process.execPath,['--input-type=module','-e',code[gate.id]],{
      id:gate.id,cwd:root,environment:{...process.env},deadline,signal,log,terminationGraceMs:50,
    })});
}
const group=(gates,run,options={})=>runVerificationGroup(gates,run,{signal:cancellation.signal,measure:noMeasurement,...options});

test('complete-line public transport keeps fragmented UTF-8 and sibling evidence separate',()=>{
  const lines=[],left=completeLineWriter(line=>lines.push(line)),right=completeLineWriter(line=>lines.push(line));
  const evidence=Buffer.from('ETH_BROWSER_REPORT_CHUNK '+JSON.stringify({data:'한글',index:0})+'\n');
  const split=evidence.indexOf(Buffer.from('한'))+1;
  left.write(evidence.subarray(0,split));right.write('ok 1 - model\n');left.write(evidence.subarray(split));
  left.write('last partial');right.write('ok 2 - model\n');left.end();right.end();
  assert.deepEqual(lines,['ok 1 - model\n',evidence.toString(),'ok 2 - model\n','last partial\n']);
  assert.equal(JSON.parse(lines[1].slice('ETH_BROWSER_REPORT_CHUNK '.length)).data,'한글');
  assert.throws(()=>completeLineWriter(()=>{},{maximumBytes:4}).write('oversized'),/bounded transport/);
});

test('out-of-order completion preserves declared result order and exact independent log hashes',async t=>{
  const root=await temporary(t),lines=[],completion=[],ready=resolve(root,'model-finished');
  const codes={
    'native-browser':`import {existsSync} from 'node:fs';process.stdout.write('BROWSER {"value":');const timer=setInterval(()=>{if(existsSync(${JSON.stringify(ready)})){clearInterval(timer);setTimeout(()=>process.stdout.write('53}\\n'),160);}},10);`,
    'model-tests':`import {writeFileSync} from 'node:fs';process.stdout.write('ok 1 - model\\n');writeFileSync(${JSON.stringify(ready)},'finished');`,
  };
  const run=execute(root,codes,{publicWrite:line=>lines.push(line)});
  const result=await group([{id:'native-browser'},{id:'model-tests'}],async(gate,options)=>{const value=await run(gate,options);completion.push(gate.id);return value;});
  assert.deepEqual(completion,['model-tests','native-browser']);
  assert.deepEqual(result.settled.map(item=>item.value.gate.id),['native-browser','model-tests']);
  assert.deepEqual(lines.sort(),['BROWSER {"value":53}\n','ok 1 - model\n'].sort());
  for(const item of result.settled){
    assert.equal(item.status,'fulfilled');assert.equal(item.value.gate.status,'PASS');
    assert.equal(item.value.gate.logSha256,sha(await readFile(resolve(root,item.value.gate.log))));
  }
  assert.deepEqual(result.measurement.gateIds,['native-browser','model-tests']);assert.ok(result.measurement.durationMs>=150);
});

test('a failed browser report survives joined failure and slow public output with every compressed chunk',async t=>{
  const root=await temporary(t),delivered=[],ready=resolve(root,'model-finished'),reportPath=resolve(root,'report.json');
  const report=Buffer.from(JSON.stringify({status:'failed',declaredCaseCount:53,failures:['expected fixture failure'],observation:randomBytes(600*1024).toString('base64')}));
  await writeFile(reportPath,report);
  const transport=fileURLToPath(new URL('../scripts/browser-evidence-transport.mjs',import.meta.url));
  const publicOutput=new Writable({highWaterMark:1024,write(bytes,_encoding,callback){setTimeout(()=>{delivered.push(Buffer.from(bytes));callback();},4);}});
  t.after(()=>publicOutput.destroy());
  const codes={
    'native-browser':`import {existsSync,readFileSync} from 'node:fs';import {emitCompressedBrowserReport} from ${JSON.stringify(transport)};
      while(!existsSync(${JSON.stringify(ready)}))await new Promise(done=>setTimeout(done,5));
      emitCompressedBrowserReport(readFileSync(${JSON.stringify(reportPath)}));process.exitCode=1;`,
    'model-tests':`import {writeFileSync} from 'node:fs';console.log('ATLAS_TEST_TOTAL {"complete":true,"fail":0}');writeFileSync(${JSON.stringify(ready)},'finished');`,
  };
  const result=await group([{id:'native-browser'},{id:'model-tests'}],execute(root,codes,{publicWrite:line=>publicOutput.write(line)}));
  assert.deepEqual(result.settled.map(item=>item.status),['rejected','fulfilled']);
  const failed=result.settled[0].reason.gateResult,raw=await readFile(resolve(root,'native-browser.log'));
  assert.equal(failed.status,'FAIL');assert.equal(failed.logSha256,sha(raw));
  const chunks=bytes=>bytes.toString('utf8').trimEnd().split('\n').filter(line=>line.startsWith('ETH_BROWSER_REPORT_CHUNK ')).map(line=>JSON.parse(line.slice('ETH_BROWSER_REPORT_CHUNK '.length)));
  const diskChunks=chunks(raw);assert.ok(diskChunks.length>174,'Exercise a report larger than the interrupted Cloudflare transport');
  assert.deepEqual(decodeCompressedBrowserReport(diskChunks,{expectedBytes:report.length,expectedSha256:sha(report)}),report);
  assert.ok(publicOutput.writableLength>0,'The fixture must leave real queued public writes after the child closes');
  await drainVerificationOutput([publicOutput]);
  const publicBytes=Buffer.concat(delivered),publicChunks=chunks(publicBytes);
  assert.equal(publicOutput.writableLength,0);assert.equal(publicChunks.length,diskChunks.length);
  assert.deepEqual(decodeCompressedBrowserReport(publicChunks,{expectedBytes:report.length,expectedSha256:sha(report)}),report);
  assert.ok(publicBytes.includes('ATLAS_TEST_TOTAL {"complete":true,"fail":0}\n'));
});

test('public output drain rejects a write failure without an unhandled later stream error',async()=>{
  const expected=new Error('fixture output unavailable');
  const output=new Writable({write(_bytes,_encoding,callback){callback(expected);}});
  await assert.rejects(drainVerificationOutput([output]),error=>error===expected);
  await new Promise(done=>setImmediate(done));
  assert.equal(output.destroyed,true);assert.equal(output.listenerCount('error'),0);
});

test('a failed public stream cannot interrupt the other stream before queued evidence drains',async()=>{
  const expected=new Error('fixture stderr unavailable'),delivered=[];
  const stdout=new Writable({write(bytes,_encoding,callback){setTimeout(()=>{delivered.push(bytes.toString());callback();},20);}});
  const stderr=new Writable({write(_bytes,_encoding,callback){callback(expected);}});
  stdout.write('last report chunk\n');
  await assert.rejects(drainVerificationOutput([stdout,stderr]),error=>error===expected);
  assert.equal(delivered.join(''),'last report chunk\n');assert.equal(stdout.writableLength,0);stdout.destroy();
});

test('public output drain has a failure bound and releases listeners when a late write completes',async()=>{
  let complete;
  const output=new Writable({write(_bytes,_encoding,callback){complete=callback;}});
  await assert.rejects(drainVerificationOutput([output],{timeoutMs:20}),/did not drain within its bound/);
  complete();await new Promise(done=>setImmediate(done));
  assert.equal(output.listenerCount('error'),0);assert.equal(output.listenerCount('close'),0);output.destroy();
});

test('a failed gate cancels its sibling process group and waits for descendant output closure',{skip:process.platform!=='linux'},async t=>{
  const root=await temporary(t),ready=resolve(root,'grandchild.pid');
  const grandchild=`import {writeFileSync,readFileSync} from 'node:fs';writeFileSync(${JSON.stringify(ready)},readFileSync('/proc/self/stat','utf8').split(' ')[0]);setInterval(()=>process.stdout.write('tick\\n'),20);`;
  const codes={
    'native-browser':`import {existsSync} from 'node:fs';const timer=setInterval(()=>{if(existsSync(${JSON.stringify(ready)})){clearInterval(timer);process.stderr.write('browser failed\\n');process.exitCode=1;}},10);`,
    'model-tests':`import {spawn} from 'node:child_process';spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(grandchild)}],{stdio:'inherit'});setInterval(()=>{},1000);`,
  };
  const result=await group([{id:'native-browser'},{id:'model-tests'}],execute(root,codes));
  assert.deepEqual(result.settled.map(item=>item.status),['rejected','rejected']);
  assert.deepEqual(result.settled.map(item=>item.reason.gateResult.id),['native-browser','model-tests'],'Abort errors cannot overwrite another gate result');
  for(const item of result.settled){assert.equal(item.reason.gateResult.status,'FAIL');assert.equal(item.reason.gateResult.logSha256,sha(await readFile(resolve(root,item.reason.gateResult.log))));}
  const pid=(await readFile(ready,'utf8')).trim();
  const state=await readFile('/proc/'+pid+'/stat','utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  assert.ok(state===null||/\) Z /.test(state),'A cancelled grandchild must not remain running');
});

test('zero exit with invalid required evidence fails before PASS and aborts the other gate',async t=>{
  const root=await temporary(t),codes={browser:"setInterval(()=>{},1000)",models:"console.log('ATLAS_TEST_TOTAL {}')"};
  const run=execute(root,codes,{validate:({logBytes})=>{
    if(logBytes.includes('ATLAS_TEST_TOTAL'))throw new Error('Complete model receipt missing');
    return {};
  }});
  const result=await group([{id:'browser'},{id:'models'}],run);
  assert.deepEqual(result.settled.map(item=>item.status),['rejected','rejected']);
  assert.equal(result.settled[1].reason.gateResult.status,'FAIL');assert.match(result.settled[1].reason.message,/Complete model receipt/);
});

test('budget cancellation captures final output and cannot treat a cancelled zero exit as PASS',async t=>{
  const root=await temporary(t),codes={bounded:"process.on('SIGTERM',()=>{process.stdout.write('cancelled final output\\n');process.exitCode=0;clearInterval(timer);});const timer=setInterval(()=>{},1000);console.log('ready');"};
  const result=await group([{id:'bounded'}],execute(root,codes,{deadline:Date.now()+2000}));
  assert.equal(result.settled[0].status,'rejected');assert.match(result.settled[0].reason.message,/execution budget/);
  const entry=result.settled[0].reason.gateResult,bytes=await readFile(resolve(root,entry.log));
  assert.ok(bytes.includes('cancelled final output'));assert.equal(entry.logSha256,sha(bytes));assert.equal(entry.status,'FAIL');
});

test('a child ignoring graceful cancellation is killed and joined before failure returns',async t=>{
  const root=await temporary(t),controller=new AbortController(),lines=[];
  const codes={stubborn:"process.on('SIGTERM',()=>console.log('ignored SIGTERM'));console.log('READY');setInterval(()=>{},1000)"};
  const result=await group([{id:'stubborn'}],execute(root,codes,{publicWrite:line=>{lines.push(line);if(line==='READY\n')controller.abort(new Error('cancel stubborn fixture'));}}),{
    signal:AbortSignal.any([cancellation.signal,controller.signal]),
  });
  assert.equal(result.settled[0].status,'rejected');assert.ok(lines.includes('ignored SIGTERM\n'));
  assert.match(result.settled[0].reason.message,/cancel stubborn fixture/);
  assert.equal(result.settled[0].reason.gateResult.logSha256,sha(await readFile(resolve(root,'stubborn.log'))));
});

test('an actual SIGTERM propagates through the shared handler and joins managed children',{skip:process.platform!=='linux'},async t=>{
  const root=await temporary(t),module=fileURLToPath(new URL('../scripts/cloudflare-gate-runner.mjs',import.meta.url));
  const code=`import {runVerificationCommand,installVerificationSignalHandlers} from ${JSON.stringify(module)};
    const controller=new AbortController(),dispose=installVerificationSignalHandlers(controller);
    try{await runVerificationCommand(process.execPath,['-e',"console.log('READY');setInterval(()=>{},1000)"],{id:'signal-child',cwd:${JSON.stringify(root)},environment:process.env,deadline:Date.now()+5000,signal:controller.signal,log:bytes=>process.stdout.write(bytes),terminationGraceMs:50});process.exitCode=0;}
    catch(error){console.log('JOINED_FAILURE '+error.message);process.exitCode=1;}finally{dispose();}`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  let output='',sent=false;
  child.stdout.on('data',bytes=>{output+=bytes;if(output.includes('READY')&&!sent){sent=true;child.kill('SIGTERM');}});
  child.stderr.on('data',bytes=>{output+=bytes;});
  const result=await new Promise((accept,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Signal fixture did not finish'));},7000);
    child.on('error',reject);child.on('close',(code,signal)=>{clearTimeout(timer);accept({code,signal});});
  });
  assert.deepEqual(result,{code:1,signal:null});assert.match(output,/JOINED_FAILURE Verification cancelled by SIGTERM/);
});

test('resource measurements report actual cgroup limits and counters without inferring a fit',async()=>{
  const files={
    '/proc/self/cgroup':'0::/worker\n','/sys/fs/cgroup/worker/memory.current':'123\n','/sys/fs/cgroup/worker/memory.max':'8589934592\n',
    '/sys/fs/cgroup/worker/memory.peak':'456\n','/sys/fs/cgroup/worker/memory.events':'oom 0\noom_kill 0\n',
    '/sys/fs/cgroup/worker/cpu.max':'200000 100000\n','/sys/fs/cgroup/worker/cpu.stat':'usage_usec 42\nnr_throttled 3\n',
  };
  const snapshot=await readVerificationResources({read:async path=>{if(!(path in files))throw new Error('missing');return files[path];}});
  assert.equal(snapshot.available,true);assert.equal(snapshot.memoryLimitBytes,8*1024**3);assert.equal(snapshot.cpuMax,'200000 100000');
  assert.equal(snapshot.cpu.usage_usec,42);assert.equal(snapshot.lifetimeMemoryPeakBytes,456);
  let calls=0;
  const observation=await measureVerificationResources({read:async()=>({...snapshot,memoryCurrentBytes:++calls===1?123:300,cpu:{usage_usec:calls*42},memoryEvents:{oom_kill:0}})});
  const measured=await observation.finish();
  assert.equal(measured.maximumObservedMemoryBytes,300);assert.equal(measured.cpuDelta.usage_usec,42);assert.match(measured.scope,/not a runtime-fit certification/);
  assert.equal((await readVerificationResources({read:async()=>{throw new Error('unavailable');}})).available,false);
});

test('only isolated packaging subprocesses discard foreign CI identity',()=>{
  const environment={PATH:'/safe/bin',WORKERS_CI:'1',WORKERS_CI_COMMIT_SHA:'a'.repeat(40),WORKERS_CI_BUILD_UUID:'fixture',GITHUB_SHA:'b'.repeat(40),ATLAS_CHECKOUT_SHA:'c'.repeat(40)};
  assert.deepEqual(packagingFixtureEnvironment(environment),{PATH:'/safe/bin'});
  assert.equal(environment.WORKERS_CI_COMMIT_SHA,'a'.repeat(40),'Production parent environment must remain unchanged');
});
