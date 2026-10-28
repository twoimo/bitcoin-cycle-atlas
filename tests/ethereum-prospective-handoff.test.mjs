import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm,symlink,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {buildEthereumProspectiveArchive,verifyEthereumProspectiveArchive} from '../scripts/ethereum-prospective-archive-core.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY as R,ethereumArchiveGitTree,publishEthereumProspectiveArchiveRemote} from '../scripts/ethereum-prospective-archive-remote.mjs';
import {ETH_ARCHIVE_IO_PATHS as IO,readEthereumArchiveDirectory,writeEthereumArchiveDirectory} from '../scripts/manage-ethereum-prospective-archive.mjs';
import {ETH_PROSPECTIVE_HANDOFF_POLICY as P,createEthereumProspectiveHandoff,verifyEthereumProspectiveHandoff,
  sealEthereumHandoffFromRepository,restoreEthereumHandoffIntoRepository} from '../scripts/ethereum-prospective-handoff.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),json=canonicalForecastJson,bytes=value=>Buffer.from(json(value)+'\n');
const sha=value=>createHash('sha256').update(value).digest('hex'),blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const context={repository:R.repository,eventName:'schedule',ref:'refs/heads/main',defaultBranch:'main',
  sourceCommit:'1'.repeat(40),sourceTree:'2'.repeat(40),runId:'42',runAttempt:'3',acquisitionOutcome:'success'};
const source={sourceCommit:context.sourceCommit,sourceTree:context.sourceTree,runId:context.runId},head='3'.repeat(40),nextHead='4'.repeat(40);
// Archive timestamps and run contexts in these tests are fixture metadata;
// no network acquisition, live workflow or remote publication is performed.
function readReceipt(files,{absent=false}={}){
  const entries=(absent?[]:[...files]).sort(([a],[b])=>a.localeCompare(b)).map(([path,value])=>({path,bytes:value.length,sha256:sha(value),gitBlobSha:blob(value)}));
  const body={schemaVersion:1,kind:'ethereum-prospective-archive-remote-read',policyVersion:R.version,repository:R.repository,branch:R.branch,
    status:absent?'absent':'restored',expectedHead:absent?null:head,expectedTree:absent?null:ethereumArchiveGitTree(files).sha,
    manifestId:absent?null:JSON.parse(files.get('manifest.json')).id,
    inventory:{files:entries.length,bytes:entries.reduce((sum,entry)=>sum+entry.bytes,0),sha256:sha(Buffer.from(json(entries)))},
    absenceProof:absent?{repository:R.repository,repositoryId:1,publicRepositoryReadSucceeded:true,exactBranchReadReturned404:true}:null,
    automaticSeedFallback:false,releaseAuthorized:false,productionPromoted:false};
  return bytes({id:sha(Buffer.from(json(body))),...body});
}
async function fixture({outcome='success',absent=false,real=false}={}){
  const previousFiles=real?await readEthereumArchiveDirectory(resolve(root,IO.seed)):
    (await buildEthereumProspectiveArchive({files:new Map([['receipt.json',bytes({kind:'test-predecessor'})]]),
      source:{...source,runId:null},createdAt:'2026-10-28T00:00:00.000Z'})).files;
  const previous=await verifyEthereumProspectiveArchive({files:previousFiles}),logical=new Map(previous.logicalFiles);
  logical.set('receipt.json',bytes({kind:'test-acquisition-checkpoint',status:outcome,receivedBytes:0,networkExecuted:false}));
  const next=await buildEthereumProspectiveArchive({files:logical,previous:previousFiles,source,createdAt:'2026-10-29T00:00:00.000Z'});
  const ctx={...context,acquisitionOutcome:outcome};
  return {previousFiles,files:next.files,readReceiptBytes:readReceipt(previousFiles,{absent}),context:ctx};
}
const verify=(handoff,ctx=context)=>verifyEthereumProspectiveHandoff({files:handoff.files,expectedDigest:handoff.digest,context:ctx});
async function temporary(t){const path=await mkdtemp(resolve(tmpdir(),'eth-daily-handoff-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
async function put(root,path,value){const full=resolve(root,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,value);}
async function missing(path){await assert.rejects(access(path),error=>error.code==='ENOENT');}
async function materialize(root,handoff,path=P.download){await writeEthereumArchiveDirectory({repositoryRoot:root,path,files:handoff.files});}

function publisherServer(previousFiles){
  let current=head;const calls=[],priorTree=ethereumArchiveGitTree(previousFiles),objects=new Map([...previousFiles.values()].map(value=>[blob(value),value]));
  const trees=new Map([[priorTree.sha,previousFiles]]),commits=new Map([[head,{sha:head,tree:{sha:priorTree.sha},parents:[]}]]);
  const fetchImpl=async(url,options)=>{
    const path=new URL(url).pathname,method=options.method,body=options.body?JSON.parse(options.body):null;calls.push({method,path});
    let value;
    if(method==='GET'&&path.endsWith('/git/ref/heads/'+R.branch))value={ref:'refs/heads/'+R.branch,object:{type:'commit',sha:current}};
    else if(method==='GET'&&path.includes('/git/commits/'))value=commits.get(path.split('/').at(-1));
    else if(method==='GET'&&path.includes('/git/trees/'))value={...ethereumArchiveGitTree(trees.get(path.split('/').at(-1))),truncated:false};
    else if(method==='POST'&&path.endsWith('/git/blobs')){const valueBytes=Buffer.from(body.content,'base64'),id=blob(valueBytes);objects.set(id,valueBytes);value={sha:id};}
    else if(method==='POST'&&path.endsWith('/git/trees')){
      const files=new Map(trees.get(body.base_tree));for(const entry of body.tree)files.set(entry.path,objects.get(entry.sha));
      const tree=ethereumArchiveGitTree(files);trees.set(tree.sha,files);value={sha:tree.sha};
    }else if(method==='POST'&&path.endsWith('/git/commits')){value={sha:nextHead,tree:{sha:body.tree},parents:body.parents.map(sha=>({sha}))};commits.set(nextHead,value);}
    else if(method==='PATCH'&&path.endsWith('/git/refs/heads/'+R.branch)){assert.equal(body.force,false);current=body.sha;value={};}
    else throw new Error('Unexpected publisher mock request '+method+' '+path);
    return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  };
  return {calls,fetchImpl,get head(){return current;}};
}

test('complete handoff round trip binds original archive bytes source run attempt and raw read receipt',async()=>{
  const input=await fixture(),handoff=await createEthereumProspectiveHandoff(input),restored=await verify(handoff);
  assert.deepEqual(restored.files,input.files);assert.deepEqual(restored.previousFiles,input.previousFiles);
  assert.deepEqual(restored.readReceiptBytes,input.readReceiptBytes);assert.equal(handoff.digest,sha(handoff.files.get('handoff.json')));
  assert.equal(restored.receipt.acquisitionFailed,false);assert.equal(restored.receipt.remotePublished,false);
  assert.deepEqual(restored.receipt.context,context);assert.equal(restored.receipt.releaseAuthorized,false);
});

for(const [key,value]of [['runId','43'],['runAttempt','4'],['sourceCommit','a'.repeat(40)],['sourceTree','b'.repeat(40)],
  ['repository','other/project'],['eventName','pull_request'],['ref','refs/heads/feature'],['acquisitionOutcome','failure']])
test('handoff refuses wrong current '+key,async()=>{
  const handoff=await createEthereumProspectiveHandoff(await fixture());
  await assert.rejects(()=>verify(handoff,{...context,[key]:value}),/context|default-branch/);
});

test('missing original digest and modified canonical metadata fail before accepting archive payloads',async()=>{
  const handoff=await createEthereumProspectiveHandoff(await fixture());
  await assert.rejects(()=>verifyEthereumProspectiveHandoff({files:handoff.files,context}),/trusted preparation digest/);
  const files=new Map(handoff.files),manifest=JSON.parse(files.get('handoff.json'));
  manifest.context.runAttempt='9';files.set('handoff.json',bytes(manifest));
  await assert.rejects(()=>verify({...handoff,files}),/trusted preparation digest/);
});

for(const mode of ['missing','missing-ancestor','extra','extra-addressed','duplicate-prior','escape','path-mutation','mutated-prior','mutated-candidate','mutated-both','mutated-read-receipt'])
test('handoff rejects '+mode+' payload without replacing a lost input',async()=>{
  const input=await fixture(),handoff=await createEthereumProspectiveHandoff(input),files=new Map(handoff.files);
  const prior='candidate/'+[...input.previousFiles.keys()].find(path=>path.startsWith('objects/'));
  const next='candidate/'+[...input.files.keys()].find(path=>path.startsWith('objects/')&&!input.previousFiles.has(path));
  if(mode==='missing')files.delete(prior);
  if(mode==='missing-ancestor')files.delete('candidate/manifests/'+handoff.manifest.previousManifestId+'.json');
  if(mode==='extra')files.set('unexpected.json',Buffer.from('{}'));
  if(mode==='extra-addressed')files.set('candidate/objects/'+'f'.repeat(64)+'.blob',Buffer.from('{}'));
  if(mode==='duplicate-prior')files.set('previous/'+prior.slice(10),files.get(prior));
  if(mode==='escape')files.set('candidate/../../scripts/run.mjs',Buffer.from('bad'));
  if(mode==='path-mutation'){files.set('candidate/objects/'+'e'.repeat(64)+'.blob',files.get(prior));files.delete(prior);}
  if(mode==='mutated-prior'||mode==='mutated-both')files.set(prior,Buffer.from('changed'));
  if(mode==='mutated-candidate'||mode==='mutated-both')files.set(next,Buffer.from('changed'));
  if(mode==='mutated-read-receipt')files.set('remote-read.json',Buffer.from('{}\n'));
  await assert.rejects(()=>verify({...handoff,files}),/inventory|Unsafe handoff/);
});

test('one candidate payload exactly reconstructs a multi-generation predecessor with only two metadata files of overhead',async()=>{
  let input=await fixture();
  for(let run=43;run<=45;run++){
    const verified=await verifyEthereumProspectiveArchive({files:input.files}),logical=new Map(verified.logicalFiles);
    logical.set('receipt.json',bytes({kind:'test-generation',run}));
    const next=await buildEthereumProspectiveArchive({files:logical,previous:input.files,source,createdAt:'2026-10-29T01:00:00.000Z'});
    input={...input,previousFiles:input.files,files:next.files,readReceiptBytes:readReceipt(input.files)};
  }
  const handoff=await createEthereumProspectiveHandoff(input),restored=await verify(handoff);
  assert.deepEqual(restored.previousFiles,input.previousFiles);assert.deepEqual(restored.files,input.files);
  assert.equal(JSON.parse(restored.previousFiles.get('manifest.json')).sequence,4);
  assert.equal(handoff.files.size,input.files.size+2);
  assert.ok([...handoff.files.keys()].every(path=>path.startsWith('candidate/')||path==='handoff.json'||path==='remote-read.json'));
  const size=items=>[...items.values()].reduce((sum,value)=>sum+value.length,0);
  assert.equal(size(handoff.files)-size(input.files),input.readReceiptBytes.length+handoff.files.get('handoff.json').length);
  assert.equal(P.maximumBytes,2*1024*1024*1024);assert.equal(P.maximumFiles,40000);
});

test('a fresh digest cannot turn a foreign-run append into this run or authorize a skipped generation',async()=>{
  const input=await fixture(),prior=await verifyEthereumProspectiveArchive({files:input.files});
  const foreign=await buildEthereumProspectiveArchive({files:prior.logicalFiles,previous:input.previousFiles,
    source:{...source,runId:'99'},createdAt:'2026-10-29T00:00:00.000Z'});
  await assert.rejects(()=>createEthereumProspectiveHandoff({...input,files:foreign.files}),/selected source and run/);
  const later=await buildEthereumProspectiveArchive({files:prior.logicalFiles,previous:input.files,source,createdAt:'2026-10-29T01:00:00.000Z'});
  await assert.rejects(()=>createEthereumProspectiveHandoff({...input,files:later.files}),/exactly one/);
});

test('both prepared outcomes reach the unchanged publisher only after complete handoff validation',async()=>{
  for(const outcome of ['success','failure']){
    const input=await fixture({outcome}),handoff=await createEthereumProspectiveHandoff(input),restored=await verify(handoff,input.context);
    const server=publisherServer(restored.previousFiles),publication=await publishEthereumProspectiveArchiveRemote({...restored,source,
      context:{repository:context.repository,eventName:context.eventName,ref:context.ref,defaultBranch:context.defaultBranch},token:'test-only-token',fetchImpl:server.fetchImpl});
    assert.equal(publication.status,'published');assert.equal(server.head,nextHead);assert.equal(restored.receipt.acquisitionFailed,outcome==='failure');
    const verified=await verifyEthereumProspectiveArchive({files:restored.files});
    assert.ok([...verified.logicalFiles.values()].some(value=>value.toString().includes('test-acquisition-checkpoint')&&value.toString().includes('"status":"'+outcome+'"')));
    assert.ok(server.calls.some(call=>call.method==='PATCH'));assert.equal(publication.releaseAuthorized,false);
    if(outcome==='failure'){
      const workflow=await readFile(resolve(root,'.github/workflows/eth-prospective-daily.yml'),'utf8');
      const finalStep=workflow.match(/- name: Report a failed acquisition[^\n]*\n\s+if: always\(\) && needs\.prepare\.outputs\.acquisition_outcome == 'failure'\n\s+run: \|\n((?:          [^\n]*\n?)+)/);
      assert.ok(finalStep,'the final failure command must remain conditional on the original acquisition outcome');
      const command=finalStep[1].split('\n').map(line=>line.slice(10)).join('\n');
      const reported=spawnSync('bash',['--noprofile','--norc','-e','-c',command],{encoding:'utf8',timeout:10000});
      assert.equal(reported.error,undefined);assert.equal(reported.status,1);
      assert.match(reported.stdout,/Preserved failure evidence is not a successful daily observation/);
    }
  }
});

test('real committed archive round trips through fresh job directories without rewriting a record or source',async t=>{
  const input=await fixture({real:true}),prepare=await temporary(t),publish=await temporary(t);
  await writeEthereumArchiveDirectory({repositoryRoot:prepare,path:IO.remote,files:input.previousFiles});
  await writeEthereumArchiveDirectory({repositoryRoot:prepare,path:IO.output,files:input.files});
  await put(prepare,IO.remoteReceipt,input.readReceiptBytes);
  const sealed=await sealEthereumHandoffFromRepository({repositoryRoot:prepare,context});
  await materialize(publish,sealed);
  const result=await restoreEthereumHandoffIntoRepository({repositoryRoot:publish,context,expectedDigest:sealed.digest});
  assert.equal(result.status,'verified');assert.equal(result.acquisitionFailed,false);
  assert.deepEqual(await readEthereumArchiveDirectory(resolve(publish,IO.remote)),input.previousFiles);
  assert.deepEqual(await readEthereumArchiveDirectory(resolve(publish,IO.output)),input.files);
  assert.deepEqual(await readFile(resolve(publish,IO.remoteReceipt)),input.readReceiptBytes);
  await restoreEthereumHandoffIntoRepository({repositoryRoot:publish,context,expectedDigest:sealed.digest});
  await missing(resolve(publish,'scripts'));await missing(resolve(publish,'.git'));
});

test('a failed or incomplete preparation cannot seal or restore a publishable artifact',async t=>{
  const prepare=await temporary(t),publish=await temporary(t);
  await assert.rejects(()=>sealEthereumHandoffFromRepository({repositoryRoot:prepare,context}),/ENOENT/);
  await missing(resolve(prepare,P.output));
  await assert.rejects(()=>restoreEthereumHandoffIntoRepository({repositoryRoot:publish,context,expectedDigest:'a'.repeat(64)}),/ENOENT/);
  await missing(resolve(publish,IO.output));await missing(resolve(publish,IO.remoteReceipt));
});

test('download symlinks and unlisted files are rejected before any publication path is restored',async t=>{
  const handoff=await createEthereumProspectiveHandoff(await fixture());
  for(const mode of ['root','ancestor','file','extra']){
    const publish=await temporary(t),real=await temporary(t);await materialize(real,handoff);
    if(mode==='root'){await mkdir(resolve(publish,'build'));await symlink(resolve(real,P.download),resolve(publish,P.download),'dir');}
    else if(mode==='ancestor')await symlink(resolve(real,'build'),resolve(publish,'build'),'dir');
    else{
      await materialize(publish,handoff);
      if(mode==='file'){const path=resolve(publish,P.download,'remote-read.json');await rm(path);await symlink(resolve(real,P.download,'remote-read.json'),path);}
      else await put(publish,P.download+'/unlisted.json',Buffer.from('{}'));
    }
    await assert.rejects(()=>restoreEthereumHandoffIntoRepository({repositoryRoot:publish,context,expectedDigest:handoff.digest}),/symlink|regular|ancestor|inside|Unsafe/);
    await missing(resolve(publish,IO.output));await missing(resolve(publish,IO.remoteReceipt));
  }
});

test('all conflicting destinations are checked before restoring any candidate bytes',async t=>{
  const handoff=await createEthereumProspectiveHandoff(await fixture());
  for(const mode of ['previous','receipt']){
    const publish=await temporary(t);await materialize(publish,handoff);
    if(mode==='previous')await put(publish,IO.remote+'/manifest.json',Buffer.from('changed'));
    else await put(publish,IO.remoteReceipt,Buffer.from('changed'));
    await assert.rejects(()=>restoreEthereumHandoffIntoRepository({repositoryRoot:publish,context,expectedDigest:handoff.digest}),/different existing|conflicts/);
    await missing(resolve(publish,IO.output));
  }
});

test('an explicit absent branch uses only the byte-identical committed seed in the fresh publication job',async t=>{
  const input=await fixture({absent:true}),handoff=await createEthereumProspectiveHandoff(input),publish=await temporary(t);
  await materialize(publish,handoff);await writeEthereumArchiveDirectory({repositoryRoot:publish,path:IO.seed,files:input.previousFiles});
  await restoreEthereumHandoffIntoRepository({repositoryRoot:publish,context,expectedDigest:handoff.digest});
  await missing(resolve(publish,IO.remote));assert.deepEqual(await readFile(resolve(publish,IO.remoteReceipt)),input.readReceiptBytes);
  const conflicting=await temporary(t);await materialize(conflicting,handoff);await put(conflicting,IO.seed+'/manifest.json',Buffer.from('changed'));
  await assert.rejects(()=>restoreEthereumHandoffIntoRepository({repositoryRoot:conflicting,context,expectedDigest:handoff.digest}),/exact checkout seed/);
  await missing(resolve(conflicting,IO.output));
});

test('regular-file and metadata byte limits remain explicit before semantic parsing',async t=>{
  const input=await fixture(),handoff=await createEthereumProspectiveHandoff(input),files=new Map(handoff.files);
  files.set('remote-read.json',Buffer.alloc(P.maximumFileBytes+1));
  await assert.rejects(()=>verify({...handoff,files}),/budget/);
  const publish=await temporary(t);await materialize(publish,handoff);
  await writeFile(resolve(publish,P.download,'handoff.json'),Buffer.alloc(P.maximumMetadataBytes+1));
  await assert.rejects(()=>restoreEthereumHandoffIntoRepository({repositoryRoot:publish,context,expectedDigest:handoff.digest}),/trusted preparation digest/);
  await missing(resolve(publish,IO.output));
});

test('combined payload byte and file limits fail before any large buffer copies or semantic parsing',async()=>{
  const shared=Buffer.alloc(P.maximumFileBytes),oversizedBytes=new Map();
  for(let index=0;index<=P.maximumBytes/P.maximumFileBytes;index++)
    oversizedBytes.set('candidate/objects/'+index.toString(16).padStart(64,'0')+'.blob',shared);
  await assert.rejects(()=>verifyEthereumProspectiveHandoff({files:oversizedBytes,expectedDigest:'a'.repeat(64),context}),/budget/);
  const oversizedFiles=new Map();
  for(let index=0;index<=P.maximumFiles;index++)oversizedFiles.set('candidate/objects/'+index.toString(16).padStart(64,'0')+'.blob',Buffer.alloc(0));
  await assert.rejects(()=>verifyEthereumProspectiveHandoff({files:oversizedFiles,expectedDigest:'a'.repeat(64),context}),/Bounded handoff file Map/);
});

test('daily jobs isolate credentials and use an exact current-run handoff before the sole publisher',async()=>{
  const workflow=await readFile(resolve(root,'.github/workflows/eth-prospective-daily.yml'),'utf8');
  const split=workflow.indexOf('\n  publish:\n');assert.ok(split>0);
  const prepare=workflow.slice(workflow.indexOf('\n  prepare:\n'),split),publish=workflow.slice(split);
  assert.match(prepare,/permissions:\n\s+contents: read/);assert.doesNotMatch(prepare,/contents: write|archive-remote\.mjs publish/);
  assert.equal((prepare.match(/ETH_ARCHIVE_GITHUB_TOKEN:/g)||[]).length,1);
  assert.match(prepare,/ETH_ARCHIVE_GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/ethereum-prospective-archive-remote\.mjs read/);
  assert.match(prepare,/continue-on-error: true/);assert.match(prepare,/ETH_ARCHIVE_ACQUISITION_OUTCOME: \$\{\{ steps\.acquisition\.outcome \}\}/);
  assert.match(publish,/needs: prepare/);assert.match(publish,/needs\.prepare\.result == 'success'/);
  assert.match(publish,/permissions:\n\s+contents: write/);assert.doesNotMatch(publish,/archive-remote\.mjs read|issue-ethereum-prospective\.mjs/);
  assert.equal((publish.match(/ETH_ARCHIVE_GITHUB_TOKEN:/g)||[]).length,1);
  assert.match(publish,/artifact-ids: \$\{\{ needs\.prepare\.outputs\.artifact_id \}\}/);
  assert.match(publish,/path: build\/ethereum-prospective-publication-download/);assert.match(publish,/merge-multiple: true/);
  assert.doesNotMatch(publish,/github-token:|\n\s+run-id:|\n\s+repository:/);
  assert.match(publish,/ETH_ARCHIVE_HANDOFF_SHA256: \$\{\{ needs\.prepare\.outputs\.handoff_sha256 \}\}/);
  const verified=publish.indexOf('node scripts/ethereum-prospective-handoff.mjs restore'),token=publish.indexOf('ETH_ARCHIVE_GITHUB_TOKEN:');
  assert.ok(verified>0&&verified<token);assert.match(publish,/always\(\) && needs\.prepare\.outputs\.acquisition_outcome == 'failure'/);
  assert.ok(publish.indexOf('archive-remote.mjs publish')<publish.indexOf('Report a failed acquisition'));
  assert.match(publish,/exit 1/);assert.equal((workflow.match(/persist-credentials: false/g)||[]).length,2);
  assert.equal((workflow.match(/github\.repository == 'twoimo\/bitcoin-cycle-atlas'/g)||[]).length,2);
  assert.equal((workflow.match(/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/g)||[]).length,2);
  assert.doesNotMatch(workflow,/pull_request_target:|workflow_run:|pull_request:/);
});
