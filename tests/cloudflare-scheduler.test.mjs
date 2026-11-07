import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveAndParseConfig} from '@cloudflare/config';
import worker,{SCHEDULES,HOOK_TIMEOUT_MS,MAX_RESPONSE_BYTES,dispatchScheduled} from '../ops/cloudflare-scheduler/worker.js';
import config from '../ops/cloudflare-scheduler/cloudflare.config.ts';

const hook='https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/01234567-89ab-cdef-0123-456789abcdef';
const other='https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/fedcba98-7654-3210-fedc-ba9876543210';
const buildUuid='a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const env={MARKET_REFRESH_DEPLOY_HOOK:hook,ETH_ARCHIVE_DEPLOY_HOOK:other};
const payload=(extra={})=>({success:true,errors:[],messages:[],result:{build_uuid:buildUuid,branch:'main',status:'queued',...extra}});
const reply=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
function fixture({cron=SCHEDULES[0].cron,time=Date.parse('2026-11-07T00:20:00Z'),fetchImpl=async()=>reply(payload()),environment=env,signal=new AbortController().signal}={}){
  const logs=[],requests=[],timeouts=[];let noRetry=0;
  const controller={cron,scheduledTime:time,noRetry(){noRetry++;}};
  return {logs,requests,timeouts,controller,get noRetry(){return noRetry;},run:()=>dispatchScheduled(controller,environment,{fetchImpl:async(url,options)=>{requests.push({url,options});return fetchImpl(url,options);},now:()=>Date.parse('2026-11-07T00:20:02Z'),log:receipt=>logs.push(receipt),timeoutSignal:ms=>{timeouts.push(ms);return signal;}})};
}

test('the installed Cloudflare CLI schema accepts the production scheduler configuration',async()=>{
  const parsed=await resolveAndParseConfig(config,{isPreview:false,mode:'production'});
  assert.equal(parsed.success,true,parsed.success?'':JSON.stringify(parsed.error.issues));
});

test('only the two scheduled triggers are declared; the worker has no public HTTP surface or paid bindings',()=>{
  assert.deepEqual(Object.keys(worker),['scheduled']);assert.equal(config.worker.workersDev,false);assert.equal(config.worker.previewUrls,false);
  assert.equal(config.worker.assets,undefined);assert.equal(config.worker.domains,undefined);assert.equal(config.worker.routes,undefined);
  assert.deepEqual(config.worker.env,{MARKET_REFRESH_DEPLOY_HOOK:{type:'secret'},ETH_ARCHIVE_DEPLOY_HOOK:{type:'secret'}});
  assert.deepEqual(config.worker.triggers.map(item=>item.schedule),SCHEDULES.map(item=>item.cron));
  assert.equal(config.worker.observability.logs.enabled,true);assert.equal(config.worker.observability.traces.enabled,false);
});

test('each original UTC schedule submits its own secret once and records actual clocks/UUID without claiming build completion',async()=>{
  for(const job of SCHEDULES){
    const f=fixture({cron:job.cron}),receipt=await f.run();
    assert.equal(f.noRetry,1);assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,env[job.secret]);
    assert.equal(f.requests[0].options.method,'POST');assert.equal(f.requests[0].options.redirect,'error');assert.deepEqual(f.requests[0].options.headers,{accept:'application/json'});assert.equal(f.requests[0].options.body,undefined);
    assert.deepEqual(f.timeouts,[HOOK_TIMEOUT_MS]);assert.equal(HOOK_TIMEOUT_MS,20_000);
    assert.equal(receipt.status,'SUBMITTED');assert.equal(receipt.buildUuid,buildUuid);assert.equal(receipt.branchVerified,true);assert.equal(receipt.scheduledAt,'2026-11-07T00:20:00.000Z');assert.equal(receipt.triggeredAt,'2026-11-07T00:20:02.000Z');
    assert.doesNotMatch(JSON.stringify(f.logs),/deploy_hooks|01234567-89ab|fedcba98-7654|completed|PASS/);
  }
});

test('the documented duplicate-pending response preserves the build identity and does not invent missing branch proof',async()=>{
  const f=fixture({fetchImpl:async()=>reply({success:true,errors:[],result:{build_uuid:buildUuid,status:'queued',already_exists:true,created_on:'2026-11-07T00:20:00Z'}})}),receipt=await f.run();
  assert.equal(receipt.alreadyExists,true);assert.equal(receipt.buildUuid,buildUuid);assert.equal(receipt.branch,null);assert.equal(receipt.branchVerified,false);assert.equal(f.requests.length,1);
});

test('unknown schedules and invalid clocks cannot dispatch any build',async()=>{
  for(const options of [{cron:'* * * * *'},{time:NaN},{time:-1},{time:1.1}]){
    const f=fixture(options);await assert.rejects(f.run(),/unknown-schedule|invalid-schedule-clock/);assert.equal(f.requests.length,0);assert.equal(f.noRetry,1);assert.equal(f.logs[0].status,'FAILED');
  }
});

test('only exact HTTPS Cloudflare deploy-hook URLs are accepted and secret values never enter error records',async()=>{
  for(const invalid of [undefined,'https://evil.example/secret',hook.replace('https:','http:'),hook.replace('/client/v4','/CLIENT/v4'),hook+'?secret=hidden',hook+'#token',hook.replace('api.cloudflare.com','api.cloudflare.com.evil.example'),hook.replace('api.cloudflare.com','token@api.cloudflare.com'),hook.replace('api.cloudflare.com','api.cloudflare.com:443'),hook+'/',hook.replace('01234567','not-uuid'),hook+'\n']){
    const f=fixture({environment:{...env,MARKET_REFRESH_DEPLOY_HOOK:invalid}});await assert.rejects(f.run(),/invalid-hook-secret/);assert.equal(f.requests.length,0);assert.doesNotMatch(JSON.stringify(f.logs),/https:|deploy_hooks|hidden|01234567/);
  }
});

test('HTTP rejection, invalid JSON, malformed build IDs and an explicit wrong branch are real failures without retries',async()=>{
  for(const response of [new Response('secret upstream echo',{status:503}),new Response('not json',{headers:{'content-type':'application/json'}}),reply({...payload(),success:false}),reply(payload({build_uuid:'not-a-uuid'})),reply(payload({branch:'feature/private'})),reply(payload({already_exists:'true'})),reply(payload({status:'unknown'}))]){
    const f=fixture({fetchImpl:async()=>response});await assert.rejects(f.run(),/hook-http|hook-response|hook-branch-mismatch/);assert.equal(f.requests.length,1);assert.equal(f.noRetry,1);assert.equal(f.logs[0].status,'FAILED');assert.doesNotMatch(JSON.stringify(f.logs),/secret upstream|feature\/private|not json/);
  }
});

test('both announced and streamed oversized responses are bounded before parsing',async()=>{
  let cancelled=false;
  const streamed=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}});
  const f=fixture({fetchImpl:async()=>streamed});await assert.rejects(f.run(),/hook-response-too-large/);assert.equal(cancelled,true);assert.equal(f.requests.length,1);
  const declared=fixture({fetchImpl:async()=>new Response('{}',{headers:{'content-type':'application/json','content-length':String(MAX_RESPONSE_BYTES+1)}})});await assert.rejects(declared.run(),/hook-response-too-large/);
});

test('timeouts and redirect/network failures preserve failure status while stripping credentials from thrown errors',async()=>{
  const abort=new AbortController();abort.abort();
  for(const signal of [abort.signal,new AbortController().signal]){
    const f=fixture({signal,fetchImpl:async()=>{throw new Error(`Failed request ${hook}`);}});
    await assert.rejects(f.run(),error=>{assert.doesNotMatch(error.message,/https:|deploy_hooks|01234567/);assert.equal(error.cause,undefined);return true;});
    assert.equal(f.logs[0].code,signal.aborted?'hook-timeout':'hook-request-failed');assert.equal(f.requests.length,1);assert.equal(f.noRetry,1);
  }
});

test('a thirty-day schedule stays at two definitions and 150 dispatches with one subrequest per invocation',async()=>{
  let calls=0;
  for(let day=0;day<30;day++)for(const job of SCHEDULES){
    const [minute,hours]=job.cron.split(' ');
    for(const hour of hours.split(',')){
      const f=fixture({cron:job.cron,time:Date.UTC(2026,10,day+1,Number(hour),Number(minute)),fetchImpl:async()=>{calls++;return reply(payload());}});await f.run();assert.equal(f.requests.length,1);
    }
  }
  assert.equal(SCHEDULES.length,2);assert.ok(SCHEDULES.length<=5);assert.equal(calls,150);assert.equal(calls/30,5);assert.ok(calls/30<100_000);
});
