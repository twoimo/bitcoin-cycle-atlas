// The schedules keep their original UTC acquisition cadence. A successful
// hook submission is not a successful collection, forecast or deployment.
export const SCHEDULES=Object.freeze([
  Object.freeze({id:'market-refresh',cron:'20 0,6,12,18 * * *',secret:'MARKET_REFRESH_DEPLOY_HOOK'}),
  Object.freeze({id:'eth-prospective',cron:'17 1 * * *',secret:'ETH_ARCHIVE_DEPLOY_HOOK'}),
]);
export const HOOK_TIMEOUT_MS=20_000;
export const MAX_RESPONSE_BYTES=64*1024;
const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const uuidPattern=new RegExp(`^${uuid}$`);
const hookPattern=new RegExp(`^https://api\\.cloudflare\\.com/client/v4/workers/builds/deploy_hooks/${uuid}$`);
const buildStatuses=new Set(['queued','initializing','running','stopped']);

class HookError extends Error {
  constructor(code,httpStatus){super(code);this.code=code;this.httpStatus=httpStatus;}
}

async function readReply(response) {
  if(!response.ok)throw new HookError('hook-http',response.status);
  const declared=Number(response.headers.get('content-length'));
  if(declared>MAX_RESPONSE_BYTES){await response.body?.cancel();throw new HookError('hook-response-too-large');}
  if(!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new HookError('hook-response-format');
  const reader=response.body?.getReader();if(!reader)throw new HookError('hook-response-empty');
  const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_RESPONSE_BYTES){await reader.cancel();throw new HookError('hook-response-too-large');}text+=decoder.decode(value,{stream:true});}
    text+=decoder.decode();
  }finally{reader.releaseLock();}
  let payload;try{payload=JSON.parse(text);}catch{throw new HookError('hook-response-format');}
  if(payload?.success!==true||!Array.isArray(payload.errors)||payload.errors.length||!uuidPattern.test(payload.result?.build_uuid??''))throw new HookError('hook-response-invalid');
  const result=payload.result;
  if(result.branch!==undefined&&result.branch!=='main')throw new HookError('hook-branch-mismatch');
  if(result.status!==undefined&&!buildStatuses.has(result.status))throw new HookError('hook-response-invalid');
  if(result.already_exists!==undefined&&typeof result.already_exists!=='boolean')throw new HookError('hook-response-invalid');
  return result;
}

/** Dependency seams exercise the real handler without calling an external hook. */
export async function dispatchScheduled(controller,env,{fetchImpl=globalThis.fetch,now=Date.now,log=value=>console.log(JSON.stringify(value)),timeoutSignal=ms=>AbortSignal.timeout(ms)}={}) {
  // An ambiguous timeout must not create an unbounded retry/build storm.
  // Cloudflare may already have accepted the POST before its reply was lost.
  controller.noRetry();
  const job=SCHEDULES.find(item=>item.cron===controller.cron);
  let clock=null,signal;
  try{
    if(!job)throw new HookError('unknown-schedule');
    if(!Number.isSafeInteger(controller.scheduledTime)||controller.scheduledTime<=0)throw new HookError('invalid-schedule-clock');
    clock={scheduledAt:new Date(controller.scheduledTime).toISOString(),triggeredAt:new Date(now()).toISOString()};
    const hook=env?.[job.secret];
    if(typeof hook!=='string'||!hookPattern.test(hook))throw new HookError('invalid-hook-secret');
    signal=timeoutSignal(HOOK_TIMEOUT_MS);
    const response=await fetchImpl(hook,{method:'POST',redirect:'error',headers:{accept:'application/json'},signal});
    const result=await readReply(response);
    // The documented already_exists response can omit its branch. Record
    // that honestly; the authenticated build/publisher checks the main source.
    const receipt={schemaVersion:1,kind:'atlas-scheduled-build-submission',status:'SUBMITTED',job:job.id,cron:job.cron,...clock,
      buildUuid:result.build_uuid,buildStatus:result.status??null,alreadyExists:result.already_exists===true,
      branch:result.branch??null,branchVerified:result.branch==='main'};
    log(receipt);return receipt;
  }catch(error){
    const code=error instanceof HookError?error.code:signal?.aborted?'hook-timeout':'hook-request-failed';
    const receipt={schemaVersion:1,kind:'atlas-scheduled-build-submission',status:'FAILED',job:job?.id??null,cron:job?.cron??null,...clock,code,
      ...(error instanceof HookError&&Number.isInteger(error.httpStatus)?{httpStatus:error.httpStatus}:{})};
    log(receipt);
    // Never retain the underlying fetch error/cause: it can contain the secret
    // URL. The bounded code is sufficient for the invocation's failure record.
    throw new Error(`Scheduled build submission failed: ${code}`);
  }
}

// No fetch handler, assets, routes or public invocation endpoint.
export default {async scheduled(controller,env){await dispatchScheduled(controller,env);}};
