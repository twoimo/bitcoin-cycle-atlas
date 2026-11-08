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

const chatPayload=()=>({rooms:[{id:'telegram',kind:'chat',title:'소수의견',subtitle:'Telegram',updated_at:'2026-11-08T10:01:00+09:00',messages:[
  {id:'1',at:'2026-11-08T10:00:00+09:00',author:'소수의견',text:'본문 https://example.com/a',links:[{offset:3,length:21,url:'https://example.com/a'}],
    images:[{src:'data/relay/assets/chat-1.jpg',width:900,height:600,alt:'첫 사진'},{src:'data/relay/assets/chat-2.jpg',width:900,height:600,alt:'둘째 사진'}],
    post_ids:['1','2'],quote:'인용문',previews:[{url:'https://example.com/preview',title:'미리보기 제목',site_name:'예시뉴스',description:'요약 문장',display_url:'example.com/preview'}]},
  {id:'3',at:'2026-11-08T10:01:00+09:00',author:'소수의견',text:'',withheld:true,withheld_reasons:['unsupported_or_protected_attribute']},
]}]});

test('relay packaging embeds chat image bytes as well as article and edition media',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'atlas-relay-chat-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const dist=resolve(root,'dist'),assets=resolve(dist,'data/relay/assets');await mkdir(assets,{recursive:true});
  const first='data/relay/assets/chat-1.jpg',second='data/relay/assets/chat-2.jpg',body=Buffer.from([0xff,0xd8,7,8,9,0xff,0xd9]);
  await writeFile(resolve(dist,first),body);await writeFile(resolve(dist,second),Buffer.concat([body,Buffer.from([1])]));
  assert.deepEqual(relayLocalImagePaths(chatPayload()),[first,second]);
  const result=await readRelayStandaloneAssets(dist,chatPayload());
  assert.deepEqual(Object.keys(result.images),[first,second]);
  assert.deepEqual(Buffer.from(result.images[first].split(',')[1],'base64'),body);
  assert.equal(result.bytes,body.length*2+1);
});

test('the relay chat renders image albums, inline links, previews, quotes and withheld notes',async t=>{
  const data=chatPayload(),{document}=parseHTML('<section id="relay"></section>');
  const previous=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('embedded relay must not fetch');};t.after(()=>{globalThis.fetch=previous;});
  let ready;const loaded=new Promise(resolve=>{ready=resolve;});
  const root=document.getElementById('relay'),controller=initRelayRoomView({root,embeddedData:()=>JSON.stringify(data),onReady:ready});
  controller.show(true);await loaded;
  assert.equal(root.querySelectorAll('.relay-msg-image img').length,2);
  assert.deepEqual([...root.querySelectorAll('.relay-msg-image img')].map(node=>node.getAttribute('src')),['data/relay/assets/chat-1.jpg','data/relay/assets/chat-2.jpg']);
  assert.equal(root.querySelector('.relay-msg-album').textContent,'사진 2장');
  const link=root.querySelector('.relay-msg-inline-link');
  assert.equal(link.getAttribute('href'),'https://example.com/a');assert.equal(link.textContent,'https://example.com/a');
  const preview=root.querySelector('.relay-preview');
  assert.equal(preview.getAttribute('href'),'https://example.com/preview');
  assert.match(preview.textContent,/미리보기 제목/);assert.match(preview.textContent,/요약 문장/);
  assert.equal(root.querySelector('.relay-msg-quote').textContent,'인용문');
  assert.match(root.querySelector('.relay-msg-withheld').textContent,/본문이 제한된 글/);
  assert.equal(root.querySelector('.relay-msg-text script'),null);
});

test('unsafe chat links and previews are not rendered as anchors',async t=>{
  const data=chatPayload();data.rooms[0].messages[0].links=[{offset:0,length:2,url:'javascript:alert(1)'}];
  data.rooms[0].messages[0].previews=[{url:'javascript:alert(2)',title:'위험'}];
  data.rooms[0].messages[0].text='본문';
  const {document}=parseHTML('<section id="relay"></section>');
  let ready;const loaded=new Promise(resolve=>{ready=resolve;});
  const root=document.getElementById('relay');
  initRelayRoomView({root,embeddedData:()=>JSON.stringify(data),onReady:ready}).show(true);await loaded;
  assert.equal(root.querySelector('.relay-msg-inline-link'),null);assert.equal(root.querySelector('.relay-preview'),null);
  assert.equal(root.querySelector('.relay-msg-text').textContent,'본문');
});
