import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,appendFile,truncate,rm,lstat,readdir,rename,symlink,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {ethereumOperationJson as encoded,readEthereumOperationFile as readOperation,
  readEthereumOperationJson as readJson,writeEthereumOperationFile as writeOperation,
  writeEthereumOperationJson as writeJson} from '../scripts/ethereum-prospective-operation-io.mjs';

// All mutations below affect disposable local fixtures. FileHandle boundary
// hooks make real filesystem races deterministic without production test hooks.
const MAX=8*1024*1024;
async function temporary(t){
  const root=await mkdtemp(resolve(tmpdir(),'eth-operation-io-'));
  t.after(()=>rm(root,{recursive:true,force:true}));return root;
}
async function put(root,path,bytes){
  const file=resolve(root,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);return file;
}
async function missing(path){await assert.rejects(lstat(path),error=>error.code==='ENOENT');}
async function noTemporary(root,path='output'){
  assert.ok((await readdir(resolve(root,path))).every(name=>!name.startsWith('.eth-operation-')));
}
async function handlePrototype(root){
  const path=resolve(root,'handle-probe'),handle=await open(path,'wx'),prototype=Object.getPrototypeOf(handle);
  await handle.close();await rm(path);return prototype;
}

test('bounded operation reads preserve exact bytes and distinguish an absent optional input',async t=>{
  const root=await temporary(t),data=Buffer.alloc(65536,0x71);
  await put(root,'input/data.blob',data);await put(root,'input/empty.blob',Buffer.alloc(0));
  assert.deepEqual(await readOperation(root,'input/data.blob',{maximumBytes:data.length}),data);
  assert.deepEqual(await readOperation(root,'input/empty.blob'),Buffer.alloc(0));
  await assert.rejects(()=>readOperation(root,'input/data.blob',{maximumBytes:data.length-1}),/bounded regular/);
  assert.equal(await readOperation(root,'missing/input.json',{optional:true}),null);
  await assert.rejects(()=>readOperation(root,'missing/input.json'),error=>error.code==='ENOENT');
  for(const maximumBytes of [0,-1,1.5,NaN,Infinity,MAX+1])
    await assert.rejects(()=>readOperation(root,'input/data.blob',{maximumBytes}),/Bounded operation read/);
  const oversized=await put(root,'input/oversized.blob',Buffer.alloc(0));await truncate(oversized,MAX+1);
  await assert.rejects(()=>readOperation(root,'input/oversized.blob'),/bounded regular/);
});

test('operation JSON requires exact canonical lossless bytes',async t=>{
  const root=await temporary(t),value={z:[1,2],a:'검증'};
  await writeJson(root,'output/receipt.json',value);
  assert.deepEqual(await readJson(root,'output/receipt.json'),value);
  assert.deepEqual(await readFile(resolve(root,'output/receipt.json')),encoded(value));
  await put(root,'input/unordered.json',Buffer.from('{"z":2,"a":1}\n'));
  await put(root,'input/invalid-utf8.json',Buffer.from([0xff]));
  await put(root,'input/truncated.json',Buffer.from('{"a":'));
  await assert.rejects(()=>readJson(root,'input/unordered.json'),/canonical/);
  await assert.rejects(()=>readJson(root,'input/invalid-utf8.json'),/lossless UTF-8/);
  await assert.rejects(()=>readJson(root,'input/truncated.json'),SyntaxError);
  assert.equal(await readJson(root,'input/absent.json',{optional:true}),null);
});

test('ordinary repository workflow paths are readable without permitting traversal',async t=>{
  const root=await temporary(t),text=Buffer.from('name: offline fixture\n');
  await put(root,'.github/workflows/example.yml',text);
  assert.deepEqual(await readOperation(root,'.github/workflows/example.yml'),text);
  for(const path of ['../outside.json','input/../outside.json','./input.json','input//file.json','/tmp/escape.json','input\\file.json','input/./file.json']){
    await assert.rejects(()=>readOperation(root,path,{optional:true}),/safe operation path/);
    await assert.rejects(()=>writeOperation(root,path,Buffer.from('blocked')),/safe operation path/);
  }
  await assert.rejects(()=>readOperation('.', 'input.json',{optional:true}),/Regular repository/);
});

test('nonregular files, final symlinks and symlink ancestors fail without touching outside bytes',async t=>{
  const root=await temporary(t),outside=await temporary(t),sentinel=Buffer.from('outside-original');
  await put(outside,'receipt.json',sentinel);await mkdir(resolve(root,'input'));
  await symlink(resolve(outside,'receipt.json'),resolve(root,'input/file.json'));
  await symlink(outside,resolve(root,'alias'),'dir');
  for(const path of ['input/file.json','alias/receipt.json']){
    await assert.rejects(()=>readOperation(root,path,{optional:true}),/ELOOP|regular directory|symlink|changed/);
    await assert.rejects(()=>writeOperation(root,path,Buffer.from('replacement'),{immutable:false}),/ELOOP|regular directory|symlink|changed/);
  }
  await assert.rejects(()=>readOperation(root,'input'),/bounded regular/);
  await put(root,'plain-parent',Buffer.from('not a directory'));
  await assert.rejects(()=>writeOperation(root,'plain-parent/file.json',Buffer.from('blocked')),/regular directory/);
  await symlink(root,resolve(outside,'root-alias'),'dir');
  await assert.rejects(()=>readOperation(resolve(outside,'root-alias'),'input/file.json'),/Regular repository/);
  assert.deepEqual(await readFile(resolve(outside,'receipt.json')),sentinel);
});

test('growth after the initial stat is rejected at the read bound',async t=>{
  const root=await temporary(t),path=await put(root,'input/data.blob',Buffer.from('12345678'));
  const prototype=await handlePrototype(root),original=prototype.read;let changed=false;
  t.mock.method(prototype,'read',async function(...args){
    if(!changed){changed=true;await appendFile(path,Buffer.from('9'));}
    return original.apply(this,args);
  });
  await assert.rejects(()=>readOperation(root,'input/data.blob',{maximumBytes:8}),/exceeded its bound during read/);
  assert.equal(changed,true);
});

test('same-byte pathname replacement after reading the FD is rejected',async t=>{
  const root=await temporary(t),data=Buffer.from('original bytes'),path=await put(root,'input/data.blob',data);
  const prototype=await handlePrototype(root),original=prototype.read;let changed=false;
  t.mock.method(prototype,'read',async function(...args){
    const result=await original.apply(this,args);
    if(!changed){changed=true;await rename(path,path+'.old');await writeFile(path,data);}
    return result;
  });
  await assert.rejects(()=>readOperation(root,'input/data.blob'),/(?:path )?changed during read/);
  assert.equal(changed,true);assert.deepEqual(await readFile(path),data);
});

test('an ancestor redirected after an input FD was read cannot authorize its old bytes under the new path',async t=>{
  const root=await temporary(t),outside=await temporary(t),data=Buffer.from('unchanged inode bytes');
  await put(root,'input/data.blob',data);await put(outside,'data.blob',data);
  const prototype=await handlePrototype(root),original=prototype.read;let changed=false;
  t.mock.method(prototype,'read',async function(...args){
    const result=await original.apply(this,args);
    if(!changed){
      changed=true;await rename(resolve(root,'input'),resolve(root,'original-input'));
      await symlink(outside,resolve(root,'input'),'dir');
    }
    return result;
  });
  await assert.rejects(()=>readOperation(root,'input/data.blob'),/regular directory|changed during read/);
  assert.equal(changed,true);assert.deepEqual(await readFile(resolve(outside,'data.blob')),data);
});

test('optional absence cannot conceal disappearance after an input FD was opened',async t=>{
  const root=await temporary(t),path=await put(root,'input/receipt.json',encoded({status:'original'}));
  const prototype=await handlePrototype(root),original=prototype.read;let changed=false;
  t.mock.method(prototype,'read',async function(...args){
    const result=await original.apply(this,args);if(!changed){changed=true;await rm(path);}return result;
  });
  await assert.rejects(()=>readOperation(root,'input/receipt.json',{optional:true}),/ENOENT|changed during read/);
  assert.equal(changed,true);
});

test('immutable publication produces complete exclusive bytes and identical retries preserve the inode',async t=>{
  const root=await temporary(t),data=Buffer.alloc(128*1024,0x42),path='output/object.blob';
  await writeOperation(root,path,data);const first=await lstat(resolve(root,path));
  assert.deepEqual(await readOperation(root,path),data);assert.equal(first.nlink,1);assert.equal(first.mode&0o077,0);
  await writeOperation(root,path,Buffer.from(data));const second=await lstat(resolve(root,path));
  assert.equal(second.ino,first.ino);
  await assert.rejects(()=>writeOperation(root,path,Buffer.from('conflict')),/Immutable operation bytes conflict/);
  assert.deepEqual(await readFile(resolve(root,path)),data);await noTemporary(root);
});

test('concurrent immutable writers never replace the winner or publish partial bytes',async t=>{
  const root=await temporary(t);await mkdir(resolve(root,'output'));
  const first=Buffer.alloc(128*1024,0x31),second=Buffer.alloc(128*1024,0x32),path='output/object.blob';
  const results=await Promise.allSettled([writeOperation(root,path,first),writeOperation(root,path,second)]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(results.filter(row=>row.status==='rejected').length,1);
  const actual=await readOperation(root,path);assert.ok(actual.equals(first)||actual.equals(second));await noTemporary(root);
  const retries=await Promise.allSettled([writeOperation(root,'output/equal.blob',first),writeOperation(root,'output/equal.blob',first)]);
  assert.ok(retries.some(row=>row.status==='fulfilled'));
  // Removing the winner's temporary hard link changes ctime. A concurrent
  // equal-byte reader may safely reject that physical race, then retry.
  for(const row of retries.filter(value=>value.status==='rejected'))
    assert.match(row.reason.message,/Operation input(?: path)? changed during read/);
  await writeOperation(root,'output/equal.blob',first);
  assert.deepEqual(await readOperation(root,'output/equal.blob'),first);await noTemporary(root);
});

test('mutable receipt replacement is atomic while an existing reader retains the old complete bytes',async t=>{
  const root=await temporary(t),path='output/receipt.json',before=encoded({status:'before'}),after=encoded({status:'after'});
  await writeOperation(root,path,before);const old=await open(resolve(root,path),'r'),oldStat=await old.stat();
  try{
    await writeOperation(root,path,after,{immutable:false});
    assert.deepEqual(await old.readFile(),before);assert.deepEqual(await readOperation(root,path),after);
    assert.notEqual((await lstat(resolve(root,path))).ino,oldStat.ino);
  }finally{await old.close();}
  await noTemporary(root);
});

for(const initiallyPresent of [true,false])
test('mutable receipt refuses a changed '+(initiallyPresent?'existing':'initially absent')+' prior before replacement',async t=>{
  const root=await temporary(t),path='output/receipt.json',raced=encoded({writer:'other'});
  await mkdir(resolve(root,'output'));if(initiallyPresent)await put(root,path,encoded({writer:'original'}));
  const prototype=await handlePrototype(root),original=prototype.writeFile;let changed=false;
  t.mock.method(prototype,'writeFile',async function(...args){
    const result=await original.apply(this,args);if(!changed){changed=true;await writeFile(resolve(root,path),raced);}return result;
  });
  await assert.rejects(()=>writeOperation(root,path,encoded({writer:'planned'}),{immutable:false}),/receipt changed before replacement/);
  assert.equal(changed,true);assert.deepEqual(await readFile(resolve(root,path)),raced);await noTemporary(root);
});

for(const immutable of [true,false])
test((immutable?'immutable':'mutable')+' publication rejects an ancestor redirected after temporary bytes were written',async t=>{
  const root=await temporary(t),outside=await temporary(t),data=Buffer.from('complete intended bytes');
  const parent=resolve(root,'output');await mkdir(parent);
  const prototype=await handlePrototype(root),original=prototype.writeFile;let changed=false;
  t.mock.method(prototype,'writeFile',async function(...args){
    const result=await original.apply(this,args);
    if(!changed){
      changed=true;const names=await readdir(parent),temporaryName=names.find(name=>name.startsWith('.eth-operation-'));
      assert.ok(temporaryName);await rename(parent,resolve(root,'original-output'));await symlink(outside,parent,'dir');
      // A same-named decoy proves link/rename must not follow the redirected
      // parent after the operation has finished writing its original FD.
      await writeFile(resolve(outside,temporaryName),Buffer.from('outside decoy'));
    }
    return result;
  });
  await assert.rejects(()=>writeOperation(root,'output/object.blob',data,{immutable}),/regular directory|changed|symlink/);
  assert.equal(changed,true);await missing(resolve(outside,'object.blob'));
});

test('oversized and non-buffer writes fail before creating an output path',async t=>{
  const root=await temporary(t);
  await assert.rejects(()=>writeOperation(root,'output/object.blob',Buffer.alloc(MAX+1)),/Bounded operation bytes/);
  await assert.rejects(()=>writeOperation(root,'output/object.blob','text'),/Bounded operation bytes/);
  await missing(resolve(root,'output'));
});
