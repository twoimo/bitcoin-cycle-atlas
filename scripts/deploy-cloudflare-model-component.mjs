import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
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
export async function verifyPublishedModelBytes({profile,index,componentBytes,indexBytes,fetchImpl=fetch,signal}={}){
  for(const [path,expected] of [[index.receipt.path,componentBytes],[modelComponentIndexPath(index.sourceCommit),indexBytes]]){
    let response,actual;
    try{
      response=await fetchImpl(profile.origin+path,{method:'GET',redirect:'error',cache:'no-store',credentials:'omit',signal:signal??AbortSignal.timeout(15_000)});
      if(!response.ok||response.redirected)throw new Error('Unexpected response');
      actual=await boundedResponseBytes(response,expected.length);
    }catch{throw failure('MODEL_COMPONENT_READBACK','The published component and index could not be confirmed');}
    if(!actual.equals(expected))throw failure('MODEL_COMPONENT_READBACK','Published bytes differ from the validated model component');
  }
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
  run=runModelArtifactCommand,readIdentity=readModelBuildIdentity,fetchImpl=fetch,write=writeFile}={}){
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
  await verifyPublishedModelBytes({...verified,fetchImpl});
  // A newer commit must not be queued through a hook whose branch has moved.
  await verifyModelComponentArtifact({root,mode,env,now:now(),remote:true,readIdentity});
  const publication=await triggerPublicationHook(env.ATLAS_PUBLICATION_DEPLOY_HOOK,{fetchImpl,expectedBranch:component.branch,expectedWorker:profile.consumerWorkerName});
  const result={schemaVersion:1,kind:'atlas-cloudflare-model-publication',status:'MODEL_COMPONENT_PUBLISHED',qualifiesFullVerification:false,
    sourceCommit:component.sourceCommit,sourceTree:component.sourceTree,planSha256:component.planSha256,runId:component.runId,
    mode,origin:profile.origin,component:artifact.component,index:artifact.index,publication,confirmedAt:now().toISOString()};
  await write(resolve(root,'build/cloudflare-model-publication.json'),JSON.stringify(result)+'\n');
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  try{const options=parseModelArtifactArgs(process.argv.slice(2),{deploy:true});console.log(JSON.stringify(await deployModelComponent({root,...options})));}
  catch(error){reportModelArtifactFailure(error);process.exitCode=1;}
}
