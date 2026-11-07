import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
import {modelComponentIndexPath} from './cloudflare-model-provider-policy.mjs';
import {ModelArtifactError,modelCommandEnvironment,parseModelArtifactArgs,readModelBuildIdentity,reportModelArtifactFailure,runModelArtifactCommand,verifyModelComponentArtifact} from './cloudflare-model-artifact.mjs';

const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hookPattern=/^https:\/\/api\.cloudflare\.com\/client\/v4\/workers\/builds\/deploy_hooks\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function failure(code,message){return new ModelArtifactError(code,message);}
export function assertPublicationHook(value){
  if(typeof value!=='string'||!hookPattern.test(value))throw failure('MODEL_COMPONENT_HOOK_CONFIG','An exact private Cloudflare publication Deploy Hook is required');
  return value;
}
async function boundedResponseBytes(response,maximum){
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maximum))throw failure('MODEL_COMPONENT_RESPONSE','The provider response exceeds its byte limit');
  const chunks=[];let count=0;
  for await(const chunk of response.body??[]){count+=chunk.length;if(count>maximum)throw failure('MODEL_COMPONENT_RESPONSE','The provider response exceeds its byte limit');chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks);
}
function abortableReadback(promise,signal){
  return new Promise((accept,reject)=>{
    let complete=false;
    const finish=(ok,value)=>{if(complete)return;complete=true;signal.removeEventListener('abort',aborted);ok?accept(value):reject(value);};
    const aborted=()=>finish(false,new Error('Model readback aborted'));
    // Observe the operation even when already aborted, including cancellation
    // promises which may reject after the deadline has won the race.
    Promise.resolve(promise).then(value=>finish(true,value),error=>finish(false,error));
    if(signal.aborted)aborted();else signal.addEventListener('abort',aborted,{once:true});
  });
}
async function readbackResponseBytes(response,maximum,signal){
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maximum))throw failure('MODEL_COMPONENT_RESPONSE','The provider response exceeds its byte limit');
  if(!response.body)return Buffer.alloc(0);
  const reader=response.body.getReader(),chunks=[];let count=0,complete=false;
  try{
    while(true){
      const {done,value}=await abortableReadback(reader.read(),signal);if(done){complete=true;break;}
      count+=value.length;
      if(count>maximum)throw failure('MODEL_COMPONENT_RESPONSE','The provider response exceeds its byte limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }finally{
    // Do not let an uncooperative cancel() hide an already observed size
    // violation. The owned request controller also aborts the actual fetch.
    if(!complete)try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}
    try{reader.releaseLock();}catch{}
  }
}
const modelReadbackPolicy=Object.freeze({timeoutMs:30_000,requestTimeoutMs:5_000,retryDelayMs:2_000,maximumAttempts:16});
const transientReadbackStatuses=new Set([404,408,425,429,500,502,503,504]);
export async function verifyPublishedModelBytes({profile,index,componentBytes,indexBytes,fetchImpl=fetch,signal,
  clock=()=>performance.now(),delay=(ms,{signal})=>wait(ms,undefined,{signal})}={}){
  const started=clock(),deadline=started+modelReadbackPolicy.timeoutMs;
  const budget=AbortSignal.timeout(modelReadbackPolicy.timeoutMs);
  const sharedSignal=signal?AbortSignal.any([signal,budget]):budget;
  let attempt=0,asset='component',status=null;
  const retries=[];
  const readbackFailure=(category,retryable=false)=>{
    const error=failure('MODEL_COMPONENT_READBACK','Exact public model bytes were not confirmed');
    error.readback={category,asset,status,attempt,elapsedMs:Math.max(0,Math.round(clock()-started))};
    error.retryable=retryable;return error;
  };
  const active=()=>{
    if(signal?.aborted)throw readbackFailure('cancelled');
    if(sharedSignal.aborted||clock()>=deadline)throw readbackFailure('deadline');
  };
  while(attempt<modelReadbackPolicy.maximumAttempts){
    active();attempt++;
    const responses=[];
    try{
      // A retry starts both reads again; bytes from different attempts cannot
      // be combined into a successful receipt/index observation.
      for(const [name,path,expected] of [['component',index.receipt.path,componentBytes],['index',modelComponentIndexPath(index.sourceCommit),indexBytes]]){
        asset=name;status=null;active();
        const requestController=new AbortController();
        const requestSignal=AbortSignal.any([requestController.signal,sharedSignal,AbortSignal.timeout(Math.max(1,Math.ceil(Math.min(modelReadbackPolicy.requestTimeoutMs,deadline-clock()))))]);
        let response,actual;
        try{
          // Expose a redirect status for diagnosis without following it.
          response=await abortableReadback(fetchImpl(profile.origin+path,{method:'GET',redirect:'manual',cache:'no-store',credentials:'omit',signal:requestSignal}),requestSignal);
          status=Number.isInteger(response.status)?response.status:null;active();
          if(response.redirected||(status>=300&&status<400))throw readbackFailure('redirect');
          if(status!==200)throw readbackFailure('http',transientReadbackStatuses.has(status));
          try{actual=await readbackResponseBytes(response,expected.length,requestSignal);}
          catch(error){
            active();
            if(error instanceof ModelArtifactError&&error.code==='MODEL_COMPONENT_RESPONSE')throw readbackFailure('size');
            throw readbackFailure('transport',true);
          }
          active();
          if(!actual.equals(expected))throw readbackFailure('integrity');
          responses.push({asset,status,bytes:actual.length});
        }catch(error){
          active();
          if(error instanceof ModelArtifactError&&error.code==='MODEL_COMPONENT_READBACK')throw error;
          throw readbackFailure('transport',true);
        }finally{
          requestController.abort();
          if(response?.body&&!response.body.locked)await abortableReadback(response.body.cancel(),requestSignal).catch(()=>{});
        }
      }
      active();
      return {status:'EXACT_BYTES_CONFIRMED',attempts:attempt,elapsedMs:Math.max(0,Math.round(clock()-started)),responses,retries};
    }catch(error){
      if(!(error instanceof ModelArtifactError)||error.code!=='MODEL_COMPONENT_READBACK'||!error.retryable||attempt===modelReadbackPolicy.maximumAttempts)throw error;
      retries.push({...error.readback});
      active();
      try{await abortableReadback(delay(Math.min(modelReadbackPolicy.retryDelayMs,Math.max(1,Math.ceil(deadline-clock()))),{signal:sharedSignal}),sharedSignal);}
      catch{active();throw readbackFailure('transport');}
    }
  }
  throw readbackFailure('deadline');
}
export async function triggerPublicationHook(value,{fetchImpl=fetch,expectedBranch,expectedWorker,signal}={}){
  const url=assertPublicationHook(value);
  let payload;
  try{
    const response=await fetchImpl(url,{method:'POST',redirect:'error',credentials:'omit',headers:{Accept:'application/json'},signal:signal??AbortSignal.timeout(20_000)});
    if(!response.ok||response.redirected)throw new Error('Unexpected response');
    payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedResponseBytes(response,16*1024)));
  }catch{throw failure('MODEL_COMPONENT_HOOK_REQUEST','The publication build could not be triggered');}
  const result=payload?.result;
  if(payload?.success!==true||!Array.isArray(payload.errors)||payload.errors.length||!uuidPattern.test(result?.build_uuid??'')||
    (result.branch!==undefined&&result.branch!==expectedBranch)||(result.worker!==undefined&&result.worker!==expectedWorker)||
    (result.already_exists!==undefined&&typeof result.already_exists!=='boolean')) {
    throw failure('MODEL_COMPONENT_HOOK_RESPONSE','The publication hook returned an invalid build acknowledgement');
  }
  return {buildUuid:result.build_uuid,alreadyExists:result.already_exists===true};
}
export async function deployModelComponent({root,mode,checkOnly=false,dryRun=false,env=process.env,now=()=>new Date(),
  run=runModelArtifactCommand,readIdentity=readModelBuildIdentity,fetchImpl=fetch,write=writeFile,signal,readbackClock,readbackDelay}={}){
  if(checkOnly&&dryRun)throw failure('MODEL_COMPONENT_ARGUMENTS','Choose only one non-deploying check mode');
  const verified=await verifyModelComponentArtifact({root,mode,env,now:now(),remote:true,readIdentity});
  const {artifact,component,workspace,profile}=verified;
  if(checkOnly)return {status:'MODEL_COMPONENT_CHECKED',sourceCommit:component.sourceCommit,runId:component.runId,qualifiesFullVerification:false};
  // Validate the private configuration before any upload; never forward this
  // secret to Vite or cf. --dry-run does not need or access the hook.
  if(!dryRun){
    assertPublicationHook(env.ATLAS_PUBLICATION_DEPLOY_HOOK);
    if(env.CLOUDFLARE_ACCOUNT_ID!==profile.accountId)throw failure('MODEL_COMPONENT_ACCOUNT','The existing Build deployment account must match the reviewed owner');
    if(typeof env.CLOUDFLARE_API_TOKEN!=='string'||!env.CLOUDFLARE_API_TOKEN.trim())throw failure('MODEL_COMPONENT_BUILD_AUTH','The existing Cloudflare Build token is required for unattended deployment');
  }
  await run(process.execPath,[resolve(root,'node_modules/cf/bin/cf'),'deploy','--prebuilt','--mode',mode,...(dryRun?['--dry-run']:[])],
    {cwd:workspace,env:modelCommandEnvironment(env)});
  if(dryRun)return {status:'MODEL_COMPONENT_DRY_RUN',sourceCommit:component.sourceCommit,runId:component.runId,qualifiesFullVerification:false};
  const readback=await verifyPublishedModelBytes({...verified,fetchImpl,signal,clock:readbackClock,delay:readbackDelay});
  // A newer commit must not be queued through a hook whose branch has moved.
  await verifyModelComponentArtifact({root,mode,env,now:now(),remote:true,readIdentity});
  if(signal?.aborted)throw failure('MODEL_COMPONENT_CANCELLED','Model publication was cancelled before dispatch');
  const publication=await triggerPublicationHook(env.ATLAS_PUBLICATION_DEPLOY_HOOK,{fetchImpl,expectedBranch:component.branch,expectedWorker:profile.consumerWorkerName,signal});
  const result={schemaVersion:1,kind:'atlas-cloudflare-model-publication',status:'MODEL_COMPONENT_PUBLISHED',qualifiesFullVerification:false,
    sourceCommit:component.sourceCommit,sourceTree:component.sourceTree,planSha256:component.planSha256,runId:component.runId,
    mode,origin:profile.origin,component:artifact.component,index:artifact.index,readback,publication,confirmedAt:now().toISOString()};
  await write(resolve(root,'build/cloudflare-model-publication.json'),JSON.stringify(result)+'\n');
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  try{const options=parseModelArtifactArgs(process.argv.slice(2),{deploy:true});console.log(JSON.stringify(await deployModelComponent({root,...options})));}
  catch(error){reportModelArtifactFailure(error);process.exitCode=1;}
}
