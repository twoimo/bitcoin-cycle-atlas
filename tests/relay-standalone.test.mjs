import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {parseHTML} from 'linkedom';
import {relayLocalImagePaths,readRelayStandaloneAssets} from '../scripts/relay-standalone-assets.mjs';
import {initRelayRoomView} from '../dist/relay-room.js';

const payload=path=>({rooms:[{id:'articles',kind:'articles',title:'자료',articles:[{id:'a',title:'원문',body_text:'원문 <script> 그대로',images:[path]}]}]});

test('relay packaging reads only referenced local bytes and rejects traversal, missing files and escaping symlinks',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'atlas-relay-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const dist=resolve(root,'dist'),assets=resolve(dist,'data/relay/assets');await mkdir(assets,{recursive:true});
  const path='data/relay/assets/selected.jpg',body=Buffer.from([0xff,0xd8,1,2,3,0xff,0xd9]);
  await writeFile(resolve(dist,path),body);await writeFile(resolve(assets,'unreferenced.jpg'),Buffer.from([9,8,7]));
  const data=payload(path);data.rooms[0].articles[0].images.push({src:path},'https://example.test/source.jpg');
  const result=await readRelayStandaloneAssets(dist,data);
  assert.deepEqual(relayLocalImagePaths(data),[path]);assert.deepEqual(Object.keys(result.images),[path]);assert.equal(result.bytes,body.length);
  assert.deepEqual(Buffer.from(result.images[path].split(',')[1],'base64'),body);
  for(const bad of ['../outside.jpg','data/relay/../outside.jpg','data/relay/%2e%2e/outside.jpg','data/relay/assets/../../outside.jpg','data/relay/assets\\outside.jpg','/data/relay/assets/selected.jpg','data/relay/assets/selected.jpg?x=1']){
    assert.throws(()=>relayLocalImagePaths(payload(bad)),/Unsafe local relay image path/);
  }
  await assert.rejects(readRelayStandaloneAssets(dist,payload('data/relay/assets/missing.jpg')),{code:'ENOENT'});
  const outside=resolve(root,'outside.jpg');await writeFile(outside,body);await symlink(outside,resolve(assets,'escaped.jpg'));
  await assert.rejects(readRelayStandaloneAssets(dist,payload('data/relay/assets/escaped.jpg')),/escapes its data directory/);
});

test('the online relay controller retains its source request and original image path without an embedded map',async t=>{
  const path='data/relay/assets/selected.jpg',data=payload(path),{document,window}=parseHTML('<section id="relay"></section>');
  const previous=globalThis.fetch,calls=[];globalThis.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>data};};t.after(()=>{globalThis.fetch=previous;});
  let ready;const loaded=new Promise(resolve=>{ready=resolve;});
  const root=document.getElementById('relay'),controller=initRelayRoomView({root,onReady:ready});controller.show(true);await loaded;
  root.querySelector('[data-article="a"]').dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.deepEqual(calls,['./data/relay/index.json']);assert.equal(root.querySelector('img').getAttribute('src'),path);
  assert.equal(root.querySelector('.relay-body').textContent,'원문 <script> 그대로');assert.equal(root.querySelector('.relay-body script'),null);
});
