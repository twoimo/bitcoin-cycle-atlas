import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {buildEthereumProspectiveArchive} from '../scripts/ethereum-prospective-archive-core.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY as P,ethereumArchiveGitTree,readEthereumProspectiveArchiveRemote,
  publishEthereumProspectiveArchiveRemote,validateEthereumArchiveRemoteReadReceipt} from '../scripts/ethereum-prospective-archive-remote.mjs';

const json=canonicalForecastJson,bytes=value=>Buffer.from(json(value)+'\n');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const source={sourceCommit:'b'.repeat(40),sourceTree:'c'.repeat(40),runId:'123456'};
const context={eventName:'schedule',repository:P.repository,ref:'refs/heads/main',defaultBranch:'main'};
const head='d'.repeat(40),nextHead='e'.repeat(40),otherHead='f'.repeat(40),token='unit-test-token';
const seed=await buildEthereumProspectiveArchive({files:new Map([['receipt.json',bytes({kind:'synthetic-transport-test',n:0})]]),
  source:{...source,runId:null},createdAt:'2026-10-28T00:00:00.000Z'});
const next=await buildEthereumProspectiveArchive({files:new Map([['receipt.json',bytes({kind:'synthetic-transport-test',n:1})]]),
  previous:seed,source,createdAt:'2026-10-28T01:00:00.000Z'});
const cloned=value=>JSON.parse(JSON.stringify(value));
function mock({absent=false,mutate=null,race=false}={}){
  const calls=[],objects=new Map([...seed.files.values()].map(value=>[blob(value),value])),trees=new Map(),commits=new Map();
  const originalTree=ethereumArchiveGitTree(seed.files);trees.set(originalTree.sha,new Map(seed.files));
  commits.set(head,{sha:head,tree:{sha:originalTree.sha},parents:[{sha:'a'.repeat(40)}]});
  const state={head:absent?null:head};
  const result=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  async function fetchImpl(url,options={}){
    assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
    assert.ok(url.startsWith(P.apiOrigin+'/repos/'+P.repository));
    const path=new URL(url).pathname,method=options.method,body=options.body?JSON.parse(options.body):null;
    calls.push({path,method,body,authorization:options.headers.Authorization??null});
    let value,status=200;
    if(method==='GET'&&path==='/repos/'+P.repository)value={id:123,full_name:P.repository,private:false};
    else if(method==='GET'&&path.endsWith('/git/ref/heads/'+P.branch)){
      if(state.head)value={ref:'refs/heads/'+P.branch,object:{type:'commit',sha:state.head}};else{value={message:'Not Found'};status=404;}
    }else if(method==='GET'&&path.includes('/git/commits/')){
      const id=path.split('/').at(-1);value=id===source.sourceCommit?{sha:id,tree:{sha:source.sourceTree},parents:[]}:commits.get(id);
    }else if(method==='GET'&&path.includes('/git/trees/')){
      const id=path.split('/').at(-1);
      if(id===source.sourceTree)value={sha:id,truncated:false,tree:originalTree.tree.map(entry=>({...entry,path:'research-data/ethereum-prospective-archive/'+entry.path}))};
      else{const tree=ethereumArchiveGitTree(trees.get(id));value={...tree,truncated:false};}
    }else if(method==='GET'&&path.includes('/git/blobs/')){
      const id=path.split('/').at(-1),valueBytes=objects.get(id);value={sha:id,size:valueBytes.length,encoding:'base64',content:valueBytes.toString('base64')};
    }else if(method==='POST'&&path.endsWith('/git/blobs')){
      const valueBytes=Buffer.from(body.content,'base64'),id=blob(valueBytes);objects.set(id,valueBytes);value={sha:id};
    }else if(method==='POST'&&path.endsWith('/git/trees')){
      const files=new Map(body.base_tree?trees.get(body.base_tree):[]);
      for(const entry of body.tree){assert.equal(entry.type,'blob');assert.equal(entry.mode,'100644');files.set(entry.path,objects.get(entry.sha));}
      const tree=ethereumArchiveGitTree(files);trees.set(tree.sha,files);value={sha:tree.sha};
    }else if(method==='POST'&&path.endsWith('/git/commits')){
      value={sha:nextHead,tree:{sha:body.tree},parents:body.parents.map(sha=>({sha}))};commits.set(nextHead,value);
    }else if(method==='PATCH'&&path.endsWith('/git/refs/heads/'+P.branch)){
      assert.equal(body.force,false);
      if(race)state.head=otherHead;
      if(commits.get(body.sha).parents[0].sha!==state.head){status=422;value={message:'Not a fast-forward'};}
      else{state.head=body.sha;value={ref:'refs/heads/'+P.branch,object:{type:'commit',sha:state.head}};}
    }else if(method==='POST'&&path.endsWith('/git/refs')){
      assert.equal(body.ref,'refs/heads/'+P.branch);
      if(state.head){status=422;value={message:'Reference already exists'};}
      else{state.head=body.sha;value={ref:body.ref,object:{type:'commit',sha:state.head}};}
    }else throw new Error('Unexpected mock request '+method+' '+path);
    if(mutate){const changed=mutate({path,method,body,value:cloned(value),status,state,calls});if(changed instanceof Response)return changed;if(changed!==undefined)value=changed;}
    return result(value,status);
  }
  return {fetchImpl,calls,state};
}
const read=server=>readEthereumProspectiveArchiveRemote({fetchImpl:server.fetchImpl});
async function args(server){return {files:next.files,previousFiles:seed.files,readReceipt:(await read(server)).receipt,source,context,fetchImpl:server.fetchImpl,token};}
const writes=server=>server.calls.filter(call=>call.method!=='GET');

test('remote restore verifies actual tree and blob bytes and deduplicates identical Git blob reads',async()=>{
  const server=mock(),result=await read(server);
  assert.equal(result.receipt.status,'restored');assert.equal(result.receipt.expectedHead,head);
  assert.equal(result.receipt.manifestId,seed.manifest.id);assert.deepEqual([...result.files],[...seed.files].sort(([a],[b])=>a.localeCompare(b)));
  assert.equal(server.calls.filter(call=>call.path.includes('/git/blobs/')).length,new Set([...seed.files.values()].map(blob)).size);
  assert.equal(writes(server).length,0);
});
test('authenticated restore stays read-only and never retains the credential in its receipt',async()=>{
  const server=mock(),result=await readEthereumProspectiveArchiveRemote({fetchImpl:server.fetchImpl,token});
  assert.equal(result.receipt.status,'restored');assert.equal(result.receipt.expectedHead,head);
  assert.ok(server.calls.length>0);assert.ok(server.calls.every(call=>call.authorization==='Bearer '+token));
  assert.equal(writes(server).length,0);assert.equal(JSON.stringify(result.receipt).includes(token),false);
  assert.deepEqual([...result.files],[...seed.files].sort(([a],[b])=>a.localeCompare(b)));
});
test('production Git object strategy uses three metadata requests and still rehashes the complete tree',async()=>{
  const server=mock();let gitCalls=0;
  const result=await readEthereumProspectiveArchiveRemote({fetchImpl:server.fetchImpl,readGitObjects:async input=>{
    gitCalls++;assert.equal(input.head,head);assert.equal(input.expectedTree,ethereumArchiveGitTree(seed.files).sha);
    assert.equal(input.entries.length,seed.files.size);return {files:seed.files,receipt:{fetchOperations:1,wireBytes:null}};
  }});
  assert.equal(gitCalls,1);assert.equal(server.calls.length,3);assert.equal(result.receipt.transport.method,'git-object-pack');
  assert.equal(result.receipt.allGitBlobsVerified,true);
});
test('Git object strategy cannot use unchanged metadata to accept mutated bytes',async()=>{
  const files=new Map(seed.files),path=[...files.keys()].find(path=>path.startsWith('objects/'));files.set(path,Buffer.from('changed'));
  await assert.rejects(()=>readEthereumProspectiveArchiveRemote({fetchImpl:mock().fetchImpl,readGitObjects:async()=>({files,receipt:{}})}),/tree.*match|tree.*identity/i);
});
test('an explicitly missing data branch is reported without silently restoring a seed',async()=>{
  const server=mock({absent:true}),result=await read(server);assert.equal(result.receipt.status,'absent');
  assert.equal(result.receipt.expectedHead,null);assert.equal(result.files.size,0);assert.equal(server.calls.length,2);
  assert.equal(result.receipt.automaticSeedFallback,false);
});
test('disk receipt validation binds the compact inventory to every retained transport byte',async()=>{
  const result=await read(mock()),receipt=cloned(result.receipt);
  assert.equal(validateEthereumArchiveRemoteReadReceipt(result).expectedHead,head);
  receipt.inventory.bytes++;await assert.rejects(async()=>validateEthereumArchiveRemoteReadReceipt({receipt,files:result.files}),/remote-read receipt/);
  const files=new Map(result.files),path=[...files.keys()][0];files.set(path,Buffer.from('changed'));
  assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt:result.receipt,files}),/inventory differs/);
});
test('an absent-branch receipt cannot bind seed files as if they came from the remote',async()=>{
  const result=await read(mock({absent:true}));assert.equal(validateEthereumArchiveRemoteReadReceipt(result).status,'absent');
  assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt:result.receipt,files:seed.files}),/inventory differs/);
});
test('permission failure is not absence and never enables seed fallback',async()=>{
  const server=mock({mutate:()=>new Response('{}',{status:403})});await assert.rejects(()=>read(server),/HTTP 403/);
  assert.equal(server.calls.length,1);
});
test('a ref 404 plus an inaccessible or private repository does not establish absence',async()=>{
  for(const privateRepo of [false,true]){
    const server=mock({absent:true,mutate:({path,value})=>path==='/repos/'+P.repository?
      privateRepo?{...value,private:true}:new Response('{}',{status:404}):value});
    await assert.rejects(()=>read(server),/HTTP 404|accessible intended public/);assert.equal(writes(server).length,0);
  }
});
test('truncated remote trees fail before downloading blobs',async()=>{
  const server=mock({mutate:({path,value})=>path.includes('/git/trees/')?{...value,truncated:true}:value});
  await assert.rejects(()=>read(server),/Incomplete|oversized/);assert.equal(server.calls.length,3);
});
for(const [label,change]of [
  ['path traversal',entry=>({...entry,path:'../outside'})],
  ['symlink mode',entry=>({...entry,mode:'120000'})],
  ['executable mode',entry=>({...entry,mode:'100755'})],
  ['unexpected file',entry=>({...entry,path:'run.mjs'})],
  ['oversized blob',entry=>({...entry,size:P.maximumBlobBytes+1})],
])test('remote tree rejects '+label,async()=>{
  const server=mock({mutate:({path,value})=>{
    if(path.includes('/git/trees/')){const index=value.tree.findIndex(entry=>entry.type==='blob');value.tree[index]=change(value.tree[index]);}return value;
  }});await assert.rejects(()=>read(server),/Unsafe|Unexpected|oversized/);assert.equal(server.calls.length,3);
});
test('duplicate remote inventory paths fail before any blob is trusted',async()=>{
  const server=mock({mutate:({path,value})=>{if(path.includes('/git/trees/'))value.tree.push(value.tree[0]);return value;}});
  await assert.rejects(()=>read(server),/duplicate/);
});
test('wrong blob bytes fail even with the expected returned SHA field',async()=>{
  const server=mock({mutate:({path,value})=>path.includes('/git/blobs/')?{...value,content:Buffer.alloc(value.size).toString('base64')}:value});
  await assert.rejects(()=>read(server),/blob byte identity/);
});
test('malformed base64 cannot pass through permissive Buffer decoding',async()=>{
  const server=mock({mutate:({path,value})=>path.includes('/git/blobs/')?{...value,content:value.content+'!'}:value});
  await assert.rejects(()=>read(server),/base64/);
});
test('a wrong tree SHA is rejected after individual blob checks',async()=>{
  const server=mock({mutate:({path,value})=>{
    if(path.includes('/git/trees/')){const entry=value.tree.find(entry=>entry.type==='tree');entry.sha='0'.repeat(40);}return value;
  }});await assert.rejects(()=>read(server),/tree inventory mismatch/);
});
test('response declared length is bounded before body consumption',async()=>{
  const server=mock({mutate:()=>new Response('{}',{status:200,headers:{'content-length':String(P.maximumResponseBytes+1)}})});
  await assert.rejects(()=>read(server),/response exceeds byte budget/);
});
test('an abort-ignoring fetch still reaches the fixed total deadline',async()=>{
  let ticks=0;const now=()=>1000000+(++ticks<3?0:ticks===3?599998:599999);
  await assert.rejects(()=>readEthereumProspectiveArchiveRemote({now,fetchImpl:()=>new Promise(()=>{})}),/deadline/);
});
test('a response stream that stops producing bytes reaches the deadline',async()=>{
  let ticks=0;const now=()=>1000000+(++ticks<3?0:ticks===3?599998:599999);
  await assert.rejects(()=>readEthereumProspectiveArchiveRemote({now,fetchImpl:async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});}}),{status:200})}),/deadline/);
});
test('a stalled error-body cancellation cannot hold the request open',async()=>{
  let signal;
  await assert.rejects(()=>readEthereumProspectiveArchiveRemote({fetchImpl:async(_url,options)=>{
    signal=options.signal;return new Response(new ReadableStream({cancel(){return new Promise(()=>{});}}),{status:403});
  }}),/HTTP 403/);assert.equal(signal.aborted,true);
});
test('an absent-branch body with stalled cancellation still requires an accessible repository',async()=>{
  let calls=0;const signals=[];
  const result=await readEthereumProspectiveArchiveRemote({fetchImpl:async(_url,options)=>{
    signals.push(options.signal);calls++;
    if(calls===1)return new Response(new ReadableStream({cancel(){return new Promise(()=>{});}}),{status:404});
    return new Response(JSON.stringify({id:123,full_name:P.repository,private:false}),{status:200});
  }});assert.equal(result.receipt.status,'absent');assert.equal(calls,2);assert.ok(signals.every(signal=>signal.aborted));
});
test('validated append publishes only changed blobs with the old archive as its sole parent',async()=>{
  const server=mock(),input=await args(server),result=await publishEthereumProspectiveArchiveRemote(input);
  assert.equal(result.status,'published');assert.equal(result.commit,nextHead);assert.equal(result.parent,head);
  assert.equal(result.manifestId,next.manifest.id);assert.equal(result.readbackMatched,true);assert.equal(result.force,false);
  assert.equal(server.calls.find(call=>call.method==='PATCH').body.force,false);
  const commit=server.calls.find(call=>call.method==='POST'&&call.path.endsWith('/git/commits'));assert.deepEqual(commit.body.parents,[head]);
  assert.ok(writes(server).every(call=>call.authorization==='Bearer '+token));assert.equal(result.releaseAuthorized,false);
  assert.ok(server.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/git/blobs')).length<next.files.size);
});
for(const [label,changed]of [
  ['pull request',{eventName:'pull_request'}],['pull_request_target',{eventName:'pull_request_target'}],
  ['other repository',{repository:'another/repository'}],['feature branch',{ref:'refs/heads/feature'}],
  ['archive branch',{ref:'refs/heads/'+P.branch,defaultBranch:P.branch}],
])test('publisher rejects '+label+' before using a token',async()=>{
  const server=mock(),input=await args(server),before=server.calls.length;
  await assert.rejects(()=>publishEthereumProspectiveArchiveRemote({...input,context:{...context,...changed}}),/default-branch context/);
  assert.equal(server.calls.length,before);assert.equal(writes(server).length,0);
});
test('a tampered read receipt cannot authorize writes',async()=>{
  const server=mock(),input=await args(server);input.readReceipt.expectedHead=otherHead;
  await assert.rejects(()=>publishEthereumProspectiveArchiveRemote(input),/read-receipt|read receipt/);assert.equal(writes(server).length,0);
});
test('a changed archive head rejects a stale append before any object upload',async()=>{
  const server=mock(),input=await args(server);server.state.head=otherHead;
  await assert.rejects(()=>publishEthereumProspectiveArchiveRemote(input),/changed after restoration/);assert.equal(writes(server).length,0);
});
test('a racing sibling commit is never overwritten by a forced update',async()=>{
  const server=mock({race:true}),input=await args(server);
  await assert.rejects(()=>publishEthereumProspectiveArchiveRemote(input),/HTTP 422/);assert.equal(server.state.head,otherHead);
  assert.equal(server.calls.filter(call=>call.method==='PATCH').length,1);assert.equal(server.calls.find(call=>call.method==='PATCH').body.force,false);
});
test('changed old archive bytes fail before network publication',async()=>{
  const server=mock(),input=await args(server),files=new Map(next.files),path=[...seed.files.keys()].find(path=>path.startsWith('objects/'));
  files.set(path,Buffer.from('bad'));await assert.rejects(()=>publishEthereumProspectiveArchiveRemote({...input,files}),/mismatch|identity|Noncanonical|JSON/);
  assert.equal(writes(server).length,0);
});
test('a skipped archive generation is not published as a direct append',async()=>{
  const later=await buildEthereumProspectiveArchive({files:new Map(),previous:next,source,createdAt:'2026-10-28T02:00:00.000Z'});
  const server=mock(),input=await args(server);await assert.rejects(()=>publishEthereumProspectiveArchiveRemote({...input,files:later.files}),/exactly one/);
  assert.equal(writes(server).length,0);
});
test('an upload response with the wrong blob hash cannot advance the branch',async()=>{
  const server=mock({mutate:({path,method,value})=>method==='POST'&&path.endsWith('/git/blobs')?{...value,sha:'0'.repeat(40)}:value});
  await assert.rejects(async()=>publishEthereumProspectiveArchiveRemote(await args(server)),/Uploaded archive blob identity mismatch/);
  assert.equal(server.state.head,head);assert.equal(server.calls.some(call=>call.method==='PATCH'),false);
});
test('an initial archive is created only from exact committed seed bytes',async()=>{
  const server=mock({absent:true}),result=await publishEthereumProspectiveArchiveRemote(await args(server));
  assert.equal(result.previousHead,null);assert.equal(result.parent,source.sourceCommit);assert.equal(server.state.head,nextHead);
  assert.equal(server.calls.some(call=>call.method==='PATCH'),false);
  const create=server.calls.find(call=>call.method==='POST'&&call.path.endsWith('/git/refs'));assert.equal(create.body.ref,'refs/heads/'+P.branch);
});
test('a different committed seed denies initial branch creation',async()=>{
  const server=mock({absent:true,mutate:({path,value})=>{
    if(path.endsWith('/git/trees/'+source.sourceTree))value.tree.find(entry=>entry.type==='blob').sha='0'.repeat(40);return value;
  }});await assert.rejects(async()=>publishEthereumProspectiveArchiveRemote(await args(server)),/exact committed seed/);assert.equal(writes(server).length,0);
});
test('daily workflow has no PR privilege bridge and keeps acquisition failure visible',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/eth-prospective-daily.yml',import.meta.url),'utf8');
  assert.match(workflow,/schedule:\n\s+- cron: '17 1 \* \* \*'/);assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\n\s+(pull_request_target|pull_request|workflow_run):/);
  assert.match(workflow,/cancel-in-progress: false/);assert.match(workflow,/persist-credentials: false/);
  assert.equal((workflow.match(/ETH_ARCHIVE_GITHUB_TOKEN:/g)||[]).length,1);
  assert.match(workflow,/steps\.acquisition\.outcome == 'failure'/);assert.match(workflow,/exit 1/);
});
test('candidate workflow authenticates only its archive read and cannot publish repository content',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/eth-model-evaluation.yml',import.meta.url),'utf8');
  assert.match(workflow,/\npermissions:\n  contents: read\n/);
  assert.doesNotMatch(workflow,/\n\s+contents: write\b|pull_request_target:|ethereum-prospective-archive-remote\.mjs publish/);
  assert.equal((workflow.match(/ETH_ARCHIVE_GITHUB_TOKEN:/g)||[]).length,1);
  assert.match(workflow,/Read the fixed prospective evidence branch without publication permission\n\s+env:\n\s+ETH_ARCHIVE_GITHUB_TOKEN: \$\{\{ github\.token \}\}\n\s+run: node scripts\/ethereum-prospective-archive-remote\.mjs read/);
  assert.match(workflow,/persist-credentials: false/);
});
