import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {lstat,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
import {assertModelComponent} from './cloudflare-staged-contract.mjs';
import {createModelComponentIndex,assertModelComponentIndex,serializeModelComponentIndex,modelComponentIndexPath,modelStagePublicationProfile} from './cloudflare-model-provider-policy.mjs';

export const modelArtifactPaths=Object.freeze({
  component:'build/cloudflare-model-component.json',
  receipt:'build/cloudflare-model-artifact.json',
  workspace:'build/cloudflare-model-component',
  output:'.cloudflare/output/v0',
  assets:'.cloudflare/output/v0/workers/default/assets',
  workerConfig:'.cloudflare/output/v0/workers/default/worker.config.json',
  rootConfig:'.cloudflare/output/v0/config.json',
});
export const modelArtifactHeaders='/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src \'none\'; frame-ancestors \'none\'\n/sources/*\n  Cache-Control: no-store\n/receipts/*\n  Cache-Control: public, max-age=31536000, immutable\n';
const maximumComponentBytes=128*1024;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const jsonBytes=value=>Buffer.from(JSON.stringify(value)+'\n');
const shaPattern=/^[a-f0-9]{40}$/;
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const toolPins=Object.freeze({cf:'1.0.0-beta.28','@cloudflare/vite-plugin':'2.0.0-beta.v.12',vite:'8.3.5'});

export class ModelArtifactError extends Error {
  constructor(code,message){super(message);this.name='ModelArtifactError';this.code=code;}
}
const fail=(code,message)=>{throw new ModelArtifactError(code,message);};
export function reportModelArtifactFailure(error,write=line=>process.stderr.write(line)) {
  // Provider errors can contain the secret URL. Never print arbitrary messages,
  // causes, response bodies, command objects or stacks from external code.
  const code=error instanceof ModelArtifactError&&/^MODEL_COMPONENT_[A-Z_]+$/.test(error.code)?error.code:'MODEL_COMPONENT_UNEXPECTED';
  const result={status:'FAIL',code},detail=error instanceof ModelArtifactError?error.readback:null;
  if(code==='MODEL_COMPONENT_READBACK'&&detail&&
    ['transport','http','redirect','integrity','size','cancelled','deadline'].includes(detail.category)&&
    ['component','index'].includes(detail.asset)&&Number.isSafeInteger(detail.attempt)&&detail.attempt>=0&&detail.attempt<=16&&
    (detail.status===null||(Number.isInteger(detail.status)&&detail.status>=100&&detail.status<=599))&&
    Number.isSafeInteger(detail.elapsedMs)&&detail.elapsedMs>=0){
    result.readback={category:detail.category,asset:detail.asset,status:detail.status,attempt:detail.attempt,elapsedMs:detail.elapsedMs};
  }
  write(JSON.stringify(result)+'\n');
}
export function modelArtifactProfile(mode) {
  if(!['production','review'].includes(mode))fail('MODEL_COMPONENT_MODE','An explicit production or review mode is required');
  return modelStagePublicationProfile(mode==='production'?'bitcoin-cycle-atlas':'bitcoin-cycle-atlas-verify');
}
export function parseModelArtifactArgs(args,{deploy=false}={}) {
  const modes=args.filter(arg=>arg.startsWith('--mode='));
  const flags=args.filter(arg=>!arg.startsWith('--mode='));
  if(modes.length!==1||flags.length>(deploy?1:0)||flags.some(arg=>!['--check','--dry-run'].includes(arg))) {
    fail('MODEL_COMPONENT_ARGUMENTS','Use exactly one --mode=production|review and an optional deployment check flag');
  }
  const mode=modes[0].slice('--mode='.length);modelArtifactProfile(mode);
  return {mode,checkOnly:flags.includes('--check'),dryRun:flags.includes('--dry-run')};
}
export function modelCommandEnvironment(env=process.env) {
  const result={...env,CF_SEND_TELEMETRY:'false'};
  delete result.ATLAS_PUBLICATION_DEPLOY_HOOK;
  return result;
}
export async function runModelArtifactCommand(command,args,{cwd,env=process.env,timeout=120_000}={}) {
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(command,args,{cwd,env:modelCommandEnvironment(env),stdio:'inherit',detached:false});
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
    child.once('error',()=>{clearTimeout(timer);reject(new ModelArtifactError('MODEL_COMPONENT_COMMAND','The pinned build or deploy command could not start'));});
    child.once('close',code=>{clearTimeout(timer);if(code===0&&!timedOut)resolvePromise();else reject(new ModelArtifactError('MODEL_COMPONENT_COMMAND','The pinned build or deploy command failed'));});
  });
}
function gitRead(root,args) {
  try{return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30_000}).trim();}
  catch{fail('MODEL_COMPONENT_SOURCE','The committed source identity could not be verified');}
}
export function readModelBuildIdentity({root,mode,env=process.env,remote=false}) {
  modelArtifactProfile(mode);
  const sourceCommit=gitRead(root,['rev-parse','HEAD']);
  const sourceTree=gitRead(root,['rev-parse','HEAD^{tree}']);
  const branch=env.WORKERS_CI_BRANCH;
  if(env.WORKERS_CI!=='1'||!branch||!shaPattern.test(env.WORKERS_CI_COMMIT_SHA??'')||!uuidPattern.test(env.WORKERS_CI_BUILD_UUID??'')) {
    fail('MODEL_COMPONENT_CI_IDENTITY','Cloudflare source, build UUID and branch are required');
  }
  gitRead(root,['check-ref-format',`refs/heads/${branch}`]);
  const identity={sourceCommit,sourceTree,branch,runId:env.WORKERS_CI_BUILD_UUID,
    clean:gitRead(root,['status','--porcelain','--untracked-files=all'])==='',workersCi:env.WORKERS_CI==='1',ciSourceCommit:env.WORKERS_CI_COMMIT_SHA,
    envMode:env.ATLAS_VERIFICATION_MODE??mode};
  if(remote){
    const lines=gitRead(root,['ls-remote','--exit-code','origin',`refs/heads/${branch}`]).split('\n');
    const matches=lines.map(line=>line.split(/\s+/)).filter(parts=>parts.length===2&&parts[1]===`refs/heads/${branch}`);
    if(matches.length!==1)fail('MODEL_COMPONENT_REMOTE_HEAD','The exact remote branch head is unavailable');
    identity.remoteHead=matches[0][0];
  }
  return identity;
}
export function assertModelBuildIdentity(component,identity,{mode,remote=false,now=new Date()}={}) {
  try{assertModelComponent(component,{sourceCommit:identity.sourceCommit,sourceTree:identity.sourceTree,mode,branch:identity.branch,now:Number(now)});}
  catch{fail('MODEL_COMPONENT_INVALID','The model component does not satisfy the staged verification contract');}
  if(!identity.clean||!identity.workersCi||identity.ciSourceCommit!==identity.sourceCommit||identity.envMode!==mode||component.runId!==identity.runId||component.branch!==identity.branch) {
    fail('MODEL_COMPONENT_CI_IDENTITY','The clean source and active Cloudflare build must match the component');
  }
  if(remote&&identity.remoteHead!==identity.sourceCommit)fail('MODEL_COMPONENT_REMOTE_HEAD','A different source superseded this build');
  return component;
}
async function readJsonBytes(path,maximum=maximumComponentBytes) {
  const info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>maximum)fail('MODEL_COMPONENT_FILE','A bounded regular JSON file is required');
  const bytes=await readFile(path);
  if(bytes.length!==info.size)fail('MODEL_COMPONENT_FILE','The JSON file changed while being read');
  try{return {bytes,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};}
  catch{fail('MODEL_COMPONENT_JSON','The component or artifact is not valid UTF-8 JSON');}
}
async function regularFiles(directory,base=directory) {
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=resolve(directory,entry.name);
    if(entry.isSymbolicLink())fail('MODEL_COMPONENT_INVENTORY','The component artifact cannot contain symbolic links');
    if(entry.isDirectory())files.push(...await regularFiles(path,base));
    else if(entry.isFile())files.push(relative(base,path).replaceAll('\\','/'));
    else fail('MODEL_COMPONENT_INVENTORY','Only regular component artifact files are allowed');
  }
  return files.sort();
}
async function assertBuildTools(root) {
  const project=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
  for(const [name,version] of Object.entries(toolPins)){
    const installed=JSON.parse(await readFile(resolve(root,'node_modules',name,'package.json'),'utf8'));
    if(project.devDependencies?.[name]!==version||installed.version!==version)fail('MODEL_COMPONENT_TOOL_VERSION','The reviewed pinned Cloudflare and Vite versions are required');
  }
}
function expectedWorkerConfig(profile) {
  return {name:profile.producerWorkerName,compatibilityDate:'2026-11-07',assets:{htmlHandling:'none',notFoundHandling:'none'},workersDev:true,previewUrls:false};
}
function generatedProjectFiles(profile){
  return new Map([
    ['package.json',JSON.stringify({name:'atlas-model-component-artifact',private:true,type:'module'})+'\n'],
    ['cloudflare.config.ts',"import {defineConfig} from 'cf/config';\nexport default defineConfig({worker:"+JSON.stringify(expectedWorkerConfig(profile))+'});\n'],
    ['vite.config.ts',"import {cloudflare} from '@cloudflare/vite-plugin';\nimport {defineConfig} from 'vite';\nimport {fileURLToPath} from 'node:url';\nexport default defineConfig({plugins:[cloudflare({types:{generate:false},remoteBindings:false,inspectorPort:false})],publicDir:fileURLToPath(new URL('./public',import.meta.url)),build:{emptyOutDir:true}});\n"],
  ]);
}
async function assertGeneratedConfigs(workspace,profile,mode) {
  for(const [name,expected] of generatedProjectFiles(profile)){
    const path=resolve(workspace,name);
    if(!(await lstat(path)).isFile()||(await readFile(path,'utf8'))!==expected)fail('MODEL_COMPONENT_CONFIG','The isolated generated project configuration changed');
  }
  const workerBytes=await readFile(resolve(workspace,modelArtifactPaths.workerConfig));
  const rootBytes=await readFile(resolve(workspace,modelArtifactPaths.rootConfig));
  try{
    assert.deepEqual(JSON.parse(workerBytes),expectedWorkerConfig(profile));
    assert.deepEqual(JSON.parse(rootBytes),{buildContext:{isPreview:false,mode}});
  }catch{fail('MODEL_COMPONENT_CONFIG','The actual prebuilt configuration must remain the exact assets-only Worker');}
  return {workerConfigSha256:sha256(workerBytes),rootConfigSha256:sha256(rootBytes)};
}
async function ensureWorkspace(root) {
  for(const path of [resolve(root,'build'),resolve(root,modelArtifactPaths.workspace)]){
    try{if(!(await lstat(path)).isDirectory())fail('MODEL_COMPONENT_WORKSPACE','The isolated build workspace must be a real directory');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const workspace=resolve(root,modelArtifactPaths.workspace);
  await rm(workspace,{recursive:true,force:true});
  await mkdir(resolve(workspace,'public'),{recursive:true});
  return workspace;
}
function componentIdentity(component,profile,index,bytes,indexBytes){
  return {schemaVersion:1,kind:'atlas-cloudflare-model-artifact',status:'PASS',qualifiesFullVerification:false,
    sourceCommit:component.sourceCommit,sourceTree:component.sourceTree,planSha256:component.planSha256,
    runId:component.runId,mode:component.mode,workerName:profile.producerWorkerName,origin:profile.origin,
    workspace:modelArtifactPaths.workspace,outputDirectory:modelArtifactPaths.assets,
    component:{path:index.receipt.path,bytes:bytes.length,sha256:sha256(bytes)},
    index:{path:modelComponentIndexPath(component.sourceCommit),bytes:indexBytes.length,sha256:sha256(indexBytes)}};
}
export async function buildModelComponentArtifact({root,mode,env=process.env,now=new Date(),run=runModelArtifactCommand,readIdentity=readModelBuildIdentity}={}) {
  const identity=readIdentity({root,mode,env});
  const {bytes,value:component}=await readJsonBytes(resolve(root,modelArtifactPaths.component));
  assertModelBuildIdentity(component,identity,{mode,now});
  const profile=modelArtifactProfile(mode);
  const index=createModelComponentIndex(component,bytes);
  assertModelComponentIndex(index,{sourceCommit:component.sourceCommit,sourceTree:component.sourceTree,planSha256:component.planSha256,mode});
  const indexBytes=Buffer.from(serializeModelComponentIndex(index));
  await assertBuildTools(root);
  const workspace=await ensureWorkspace(root);
  const files=new Map([[index.receipt.path.slice(1),bytes],[modelComponentIndexPath(component.sourceCommit).slice(1),indexBytes],['_headers',Buffer.from(modelArtifactHeaders)]]);
  for(const [name,data] of files){const destination=resolve(workspace,'public',name);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,data);}
  for(const [name,contents] of generatedProjectFiles(profile))await writeFile(resolve(workspace,name),contents);
  await run(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'build','--config','vite.config.ts','--mode',mode],{cwd:workspace,env:modelCommandEnvironment(env)});
  const configHashes=await assertGeneratedConfigs(workspace,profile,mode);
  const artifact={...componentIdentity(component,profile,index,bytes,indexBytes),...configHashes};
  await verifyModelComponentArtifact({root,mode,env,artifact,now,readIdentity});
  await writeFile(resolve(root,modelArtifactPaths.receipt),jsonBytes(artifact));
  return artifact;
}
export async function verifyModelComponentArtifact({root,mode,env=process.env,artifact=null,now=new Date(),remote=false,readIdentity=readModelBuildIdentity}={}) {
  const identity=readIdentity({root,mode,env,remote});
  const {bytes,value:component}=await readJsonBytes(resolve(root,modelArtifactPaths.component));
  assertModelBuildIdentity(component,identity,{mode,now,remote});
  const profile=modelArtifactProfile(mode);
  const index=createModelComponentIndex(component,bytes);
  assertModelComponentIndex(index,{sourceCommit:component.sourceCommit,sourceTree:component.sourceTree,planSha256:component.planSha256,mode});
  const indexBytes=Buffer.from(serializeModelComponentIndex(index));
  await assertBuildTools(root);
  const workspace=resolve(root,modelArtifactPaths.workspace);
  for(const path of [resolve(root,'build'),workspace])if(!(await lstat(path)).isDirectory())fail('MODEL_COMPONENT_WORKSPACE','The artifact workspace must be a real directory');
  const expectedAssets=new Map([[index.receipt.path.slice(1),bytes],[modelComponentIndexPath(component.sourceCommit).slice(1),indexBytes],['_headers',Buffer.from(modelArtifactHeaders)]]);
  const expectedOutput=[...expectedAssets.keys()].map(name=>'workers/default/assets/'+name).concat(['config.json','workers/default/worker.config.json']).sort();
  if(JSON.stringify(await regularFiles(resolve(workspace,modelArtifactPaths.output)))!==JSON.stringify(expectedOutput))fail('MODEL_COMPONENT_INVENTORY','Only the typed component, source index and fixed headers may be published');
  for(const [name,expected] of expectedAssets)if(!(await readFile(resolve(workspace,modelArtifactPaths.assets,name))).equals(expected))fail('MODEL_COMPONENT_BYTES','Component asset bytes differ from the validated input');
  const configHashes=await assertGeneratedConfigs(workspace,profile,mode);
  artifact??=(await readJsonBytes(resolve(root,modelArtifactPaths.receipt),16*1024)).value;
  const expected={...componentIdentity(component,profile,index,bytes,indexBytes),...configHashes};
  try{assert.deepEqual(artifact,expected);}catch{fail('MODEL_COMPONENT_ARTIFACT','The packaged component identity changed or is incomplete');}
  return {artifact,component,index,componentBytes:bytes,indexBytes,workspace,profile};
}
