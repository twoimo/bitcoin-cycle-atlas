import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {readEthereumArchiveDirectory} from '../scripts/manage-ethereum-prospective-archive.mjs';
import {openEthereumProspectiveArchiveSource,ethereumProspectiveArchiveSourceInfo} from '../scripts/ethereum-prospective-archive-source.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_REMOTE_POLICY as P,ethereumArchiveGitTree,ethereumArchiveGitTreeFromInventory,
  validateEthereumArchiveRemoteReadReceipt,validateEthereumArchiveRemoteReadInventory,
  readEthereumProspectiveArchiveRemote} from '../scripts/ethereum-prospective-archive-remote.mjs';

// Archive bytes come from the actual committed seed. Transport IDs and responses
// are synthetic offline fixtures; these tests never contact or publish to GitHub.
// Descriptor-only helpers are tested as integrity bindings after the opaque
// source has verified raw bytes. They are not themselves raw-byte verifiers.
const root=fileURLToPath(new URL('..',import.meta.url)),archivePath='research-data/ethereum-prospective-archive';
const json=canonicalForecastJson,sha=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const encode=value=>Buffer.from(json(value)+'\n'),clone=value=>JSON.parse(json(value));
const head='a'.repeat(40),fixedTime=Date.parse('2026-10-28T00:00:00.000Z');
const descriptors=files=>[...files].map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes),gitBlobSha:blob(bytes)}))
  .sort((a,b)=>a.path.localeCompare(b.path));
const resign=value=>{const {id,...body}=clone(value);return {id:sha(Buffer.from(json(body))),...body};};
const receiptCore=value=>({status:value.status,expectedHead:value.expectedHead,expectedTree:value.expectedTree,
  manifestId:value.manifestId,receiptId:value.receiptId,inventory:value.inventory});
let files,entries,manifestId,receipt,absentReceipt,summary,metadataRequests,packCalls;

function offlineRemote(archive,{absent=false}={}){
  const tree=ethereumArchiveGitTree(archive),calls=[];let packCount=0;
  const fetchImpl=async(url,options)=>{
    const path=new URL(url).pathname;assert.equal(options.method,'GET');calls.push(path);
    let value,status=200;
    if(path.endsWith('/git/ref/heads/'+P.branch)){
      if(absent){value={message:'Not Found'};status=404;}
      else value={ref:'refs/heads/'+P.branch,object:{type:'commit',sha:head}};
    }else if(path.endsWith('/git/commits/'+head))value={sha:head,tree:{sha:tree.sha},parents:[]};
    else if(path.endsWith('/git/trees/'+tree.sha))value={...tree,truncated:false};
    else if(path==='/repos/'+P.repository)value={id:42,full_name:P.repository,private:false};
    else throw new Error('Unexpected offline request '+path);
    return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  };
  return {calls,get packCount(){return packCount;},options:{fetchImpl,now:()=>fixedTime,
    readGitObjects:async input=>{
      packCount++;assert.equal(input.head,head);assert.equal(input.expectedTree,tree.sha);
      assert.equal(input.entries.length,archive.size);return {files:archive,receipt:{fetchOperations:1,wireBytes:null}};
    }}};
}

before(async()=>{
  files=await readEthereumArchiveDirectory(resolve(root,archivePath));
  const source=await openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath});
  summary=ethereumProspectiveArchiveSourceInfo(source);manifestId=summary.archiveManifestId;
  entries=Object.entries(summary.archiveFiles).map(([path,value])=>({path,...value})).sort((a,b)=>a.path.localeCompare(b.path));
  assert.deepEqual(entries,descriptors(files));
  const remote=offlineRemote(files),read=await readEthereumProspectiveArchiveRemote(remote.options);
  receipt=read.receipt;metadataRequests=remote.calls;packCalls=remote.packCount;
  absentReceipt=(await readEthereumProspectiveArchiveRemote(offlineRemote(new Map(),{absent:true}).options)).receipt;
});

test('descriptor and byte APIs reproduce the actual committed Git tree, including all intermediate directories',()=>{
  const expectedHash=execFileSync('git',['rev-parse','HEAD:'+archivePath],{cwd:root,encoding:'utf8'}).trim();
  const raw=execFileSync('git',['ls-tree','-r','-t','-l','-z','HEAD:'+archivePath],{cwd:root,encoding:'utf8'});
  const expectedEntries=raw.split('\0').filter(Boolean).map(row=>{
    const match=row.match(/^(\d{6}) (blob|tree) ([a-f0-9]{40}) +(-|\d+)\t(.+)$/);
    assert.ok(match,'native Git tree row must have an exact unquoted archive path');
    const [,mode,type,hash,size,path]=match;return {path,mode,type,sha:hash,...(type==='blob'?{size:Number(size)}:{})};
  }).sort((a,b)=>a.path.localeCompare(b.path));
  const byteTree=ethereumArchiveGitTree(files),descriptorTree=ethereumArchiveGitTreeFromInventory(entries);
  assert.equal(descriptorTree.sha,expectedHash);assert.deepEqual(descriptorTree.tree,expectedEntries);
  assert.deepEqual(descriptorTree,byteTree);assert.deepEqual(ethereumArchiveGitTreeFromInventory([...entries].reverse()),byteTree);
  assert.equal(summary.allRawBytesVerified,true);assert.equal(summary.completeInventoryVerified,true);
});

test('descriptor receipt validation equals byte receipt binding while explicitly requiring raw-source verification',()=>{
  const original=clone(entries),byteResult=validateEthereumArchiveRemoteReadReceipt({receipt,files});
  const descriptorResult=validateEthereumArchiveRemoteReadInventory({receipt,entries:[...entries].reverse(),manifestId});
  assert.deepEqual(receiptCore(descriptorResult),receiptCore(byteResult));assert.deepEqual(entries,original);
  assert.equal(descriptorResult.rawSourceVerificationRequired,true);
  for(const claim of ['allRetainedTransportBytesBound','allArchiveBytesVerified','allRawBytesVerified'])
    assert.equal(Object.hasOwn(descriptorResult,claim),false);
  assert.equal(byteResult.allRetainedTransportBytesBound,true);
});

test('production pack strategy validates every retained byte using three REST metadata requests and one pack callback',()=>{
  assert.equal(metadataRequests.length,3);assert.equal(packCalls,1);
  assert.equal(metadataRequests.some(path=>path.includes('/git/blobs/')),false);
  assert.equal(receipt.transport.method,'git-object-pack');assert.equal(receipt.transport.git.fetchOperations,1);
  assert.equal(receipt.allArchiveBytesVerified,true);assert.equal(receipt.allGitBlobsVerified,true);
  // The REST diagnostic and changed-blob publisher share the finite REST
  // request budget. Production does not spend one REST request per old blob.
  assert.equal(P.maximumRequests,4096);assert.equal(P.maximumFiles,37121);
});

for(const mode of ['missing','missing-manifest','extra','renamed','same-size-byte-change','changed-length','changed-manifest'])
test('old byte and new descriptor receipt APIs both reject '+mode+' retained archive evidence',()=>{
  const changed=new Map(files),objectPath=[...changed.keys()].find(path=>path.startsWith('objects/'));
  if(mode==='missing')changed.delete(objectPath);
  if(mode==='missing-manifest')changed.delete('manifest.json');
  if(mode==='extra')changed.set('objects/'+'f'.repeat(64)+'.blob',Buffer.from('extra'));
  if(mode==='renamed'){changed.set('objects/'+'e'.repeat(64)+'.blob',changed.get(objectPath));changed.delete(objectPath);}
  if(mode==='same-size-byte-change'){const bytes=Buffer.from(changed.get(objectPath));bytes[0]^=1;changed.set(objectPath,bytes);}
  if(mode==='changed-length')changed.set(objectPath,Buffer.concat([changed.get(objectPath),Buffer.from('x')]));
  if(mode==='changed-manifest'){
    const manifest=JSON.parse(changed.get('manifest.json').toString('utf8'));manifest.id='f'.repeat(64);
    changed.set('manifest.json',encode(manifest));
  }
  assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt,files:changed}),/inventory differs/);
  assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt,entries:descriptors(changed),
    manifestId:changed.has('manifest.json')?JSON.parse(changed.get('manifest.json')).id:manifestId}),/inventory differs/);
});

for(const field of ['bytes','sha256','gitBlobSha'])
test('the receipt binds each '+field+' descriptor field rather than trusting a matching tree label',()=>{
  const changed=clone(entries),row=changed.find(value=>value.path.startsWith('objects/'));
  row[field]=field==='bytes'?row.bytes+1:(field==='sha256'?'c'.repeat(64):'d'.repeat(40));
  if(field==='sha256')assert.equal(ethereumArchiveGitTreeFromInventory(changed).sha,receipt.expectedTree);
  assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt,entries:changed,manifestId}),/inventory differs/);
});

test('manifest identity and tree fields are checked even after a receipt is self-consistently rehashed',()=>{
  const changedManifest=resign({...receipt,manifestId:'f'.repeat(64)}),changedTree=resign({...receipt,expectedTree:'d'.repeat(40)});
  for(const changed of [changedManifest,changedTree]){
    assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt:changed,files}),/manifest differs|Git tree differs/);
    assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt:changed,entries,manifestId}),/tree or manifest differs/);
  }
  for(const wrongManifest of [undefined,null,'e'.repeat(64),123])
    assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt,entries,manifestId:wrongManifest}),/manifest differs/);
  const unbound=clone(receipt);unbound.expectedHead='e'.repeat(40);
  assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt:unbound,files}),/Invalid remote-read receipt/);
  assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt:unbound,entries,manifestId}),/Invalid remote-read receipt/);
});

for(const field of ['repository','branch','status','expectedHead'])
test('receipt routing and head validation remain identical for invalid '+field,()=>{
  const replacement={repository:'other/project',branch:'main',status:'denied',expectedHead:'invalid'};
  const changed=resign({...receipt,[field]:replacement[field]});
  assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt:changed,files}),/Invalid.*receipt|Invalid.*identity/);
  assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt:changed,entries,manifestId}),/Invalid.*receipt|Invalid.*identity/);
});

test('no receipt or caller-supplied verified flag can replace the original read binding',()=>{
  for(const claimed of [undefined,null,{verified:true,...summary}]){
    assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt:claimed,entries,manifestId}),/remote-read receipt/);
    assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt:claimed,files}),/remote-read receipt/);
  }
});

test('absent-branch descriptor binding matches the empty byte API and never treats seed files as remote bytes',()=>{
  const byteResult=validateEthereumArchiveRemoteReadReceipt({receipt:absentReceipt,files:new Map()});
  const descriptorResult=validateEthereumArchiveRemoteReadInventory({receipt:absentReceipt,entries:[],manifestId:null});
  assert.deepEqual(receiptCore(descriptorResult),receiptCore(byteResult));assert.equal(descriptorResult.status,'absent');
  assert.equal(descriptorResult.rawSourceVerificationRequired,true);assert.equal(byteResult.allRetainedTransportBytesBound,false);
  assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt:absentReceipt,files}),/inventory differs/);
  assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt:absentReceipt,entries,manifestId}),/inventory differs/);
  assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt:absentReceipt,entries:[],manifestId}),/cannot bind archive descriptors/);
});

for(const field of ['repository','repositoryId','publicRepositoryReadSucceeded','exactBranchReadReturned404'])
test('an absent receipt still requires its exact original public-repository proof: '+field,()=>{
  const replacement={repository:'other/project',repositoryId:0,publicRepositoryReadSucceeded:false,exactBranchReadReturned404:false};
  const changed=resign({...absentReceipt,absenceProof:{...absentReceipt.absenceProof,[field]:replacement[field]}});
  assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt:changed,files:new Map()}),/successful public repository check/);
  assert.throws(()=>validateEthereumArchiveRemoteReadInventory({receipt:changed,entries:[],manifestId:null}),/successful public repository check/);
});

test('descriptor tree rejects duplicate, escaping, malformed and oversized metadata before calculating a trusted binding',()=>{
  const original=entries.find(row=>row.path.startsWith('objects/'));
  const invalid=[
    {...original,path:'../manifest.json'}, {...original,path:'/manifest.json'},
    {...original,path:'objects/../../script.mjs'}, {...original,path:'objects\\escape.blob'},
    {...original,bytes:-1}, {...original,bytes:.5}, {...original,bytes:P.maximumBlobBytes+1},
    {...original,sha256:'bad'}, {...original,gitBlobSha:'bad'}, {...original,unexpected:true},
  ];
  for(const row of invalid)assert.throws(()=>ethereumArchiveGitTreeFromInventory([row]),/Invalid bounded archive transport descriptor/);
  assert.throws(()=>ethereumArchiveGitTreeFromInventory([original,{...original}]),/Duplicate archive tree path/);
  assert.throws(()=>ethereumArchiveGitTreeFromInventory(new Map()),/Bounded archive transport inventory/);
  assert.throws(()=>ethereumArchiveGitTreeFromInventory(Array(P.maximumFiles+1).fill(original)),/Bounded archive transport inventory/);
  const oversized=Array.from({length:Math.floor(P.maximumArchiveBytes/P.maximumBlobBytes)+1},(_,index)=>({
    path:'objects/'+index.toString(16).padStart(64,'0')+'.blob',bytes:P.maximumBlobBytes,sha256:'a'.repeat(64),gitBlobSha:'b'.repeat(40),
  }));
  assert.throws(()=>ethereumArchiveGitTreeFromInventory(oversized),/Invalid bounded archive transport descriptor/);
});

test('old verified descriptors do not claim to authenticate subsequently changed raw bytes',()=>{
  const changed=new Map(files),path=[...files.keys()].find(value=>value.startsWith('objects/')),bytes=Buffer.from(files.get(path));
  bytes[0]^=1;changed.set(path,bytes);
  const metadataOnly=validateEthereumArchiveRemoteReadInventory({receipt,entries,manifestId});
  assert.equal(metadataOnly.rawSourceVerificationRequired,true);
  assert.throws(()=>validateEthereumArchiveRemoteReadReceipt({receipt,files:changed}),/inventory differs/);
  // Active operations must obtain and revalidate the opaque source; accepting
  // its old serialized descriptor summary would fail this raw-byte boundary.
});
