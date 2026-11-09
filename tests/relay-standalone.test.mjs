import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,readFile} from 'node:fs/promises';
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

const articlePayload=()=>({rooms:[{id:'naver',kind:'articles',title:'인생의 방',subtitle:'네이버 프리미엄 · 플스포',articles:[{
  id:'a',title:'운동에서 가장 중요한 두 가지 패턴',published_date:'2026-11-09',
  url:'https://contents.premium.naver.com/ps4/ps4life/contents/a',
  body_text:'무시되는 예전 본문',
  blocks:[
    {kind:'text',text:'첫 문단입니다.\n둘째 줄입니다.\n\n\u200b\n\n'},
    {kind:'image',src:'data/relay/assets/a-1.jpg',alt:'첫 사진',width:1200,height:800},
    {kind:'text',text:'\u200b'},
    {kind:'text',text:'1. 첫 번째 제목\n\n제목 아래 본문'},
    {kind:'image',src:'data/relay/assets/a-2.jpg',alt:'',width:900,height:1200},
    {kind:'text',text:'마지막 문단'},
  ],
  images:[{src:'data/relay/assets/a-1.jpg'},{src:'data/relay/assets/a-2.jpg'}],
}]}]});

test('the article reader interleaves images, joins soft wraps and drops invisible paragraphs',async t=>{
  const data=articlePayload(),{document,window}=parseHTML('<section id="relay"></section>');
  let ready;const loaded=new Promise(resolve=>{ready=resolve;});
  const root=document.getElementById('relay');
  initRelayRoomView({root,embeddedData:()=>JSON.stringify(data),onReady:ready}).show(true);await loaded;
  assert.match(root.querySelector('.relay-article-title').textContent,/운동에서/);
  assert.match(root.querySelector('.relay-article-excerpt').textContent,/첫 문단입니다/);
  assert.equal(root.querySelector('.relay-article-thumb img').getAttribute('src'),'data/relay/assets/a-1.jpg');
  root.querySelector('[data-article="a"]').dispatchEvent(new window.Event('click',{bubbles:true}));
  const body=root.querySelector('.relay-body');
  assert.deepEqual([...body.children].map(node=>node.tagName),['P','FIGURE','H2','P','FIGURE','P']);
  assert.equal(body.children[0].textContent,'첫 문단입니다. 둘째 줄입니다.');
  assert.equal(body.querySelectorAll('br').length,0);
  assert.equal([...body.querySelectorAll('p')].every(node=>node.textContent.trim()),true);
  assert.equal(body.querySelector('h2').textContent,'1. 첫 번째 제목');
  const figures=[...body.querySelectorAll('figure')];
  assert.deepEqual(figures.map(node=>node.querySelector('img').getAttribute('src')),
    ['data/relay/assets/a-1.jpg','data/relay/assets/a-2.jpg']);
  assert.equal(figures[1].querySelector('img').getAttribute('width'),'900');
  assert.equal(figures[1].querySelector('img').getAttribute('height'),'1200');
  assert.match(root.querySelector('.relay-reader-meta').textContent,/2026\.11\.09 · \d+분 읽기/);
  assert.equal(root.querySelector('.relay-reader-foot a').getAttribute('href'),
    'https://contents.premium.naver.com/ps4/ps4life/contents/a');
  assert.doesNotMatch(body.textContent,/\u200b/);
  root.querySelector('[data-relay-action="article-back"]').dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.ok(root.querySelector('.relay-article'));
});

test('the article reader falls back to legacy body text and appends its image array',async t=>{
  const data={rooms:[{id:'naver',kind:'articles',title:'인생의 방',articles:[{
    id:'legacy',title:'예전 글',published_date:'2026-11-01',
    body_text:'첫 줄\n둘째 줄\n\n\u200b\n\n둘째 문단',images:['data/relay/assets/legacy.jpg'],
  }]}]};
  const {document,window}=parseHTML('<section id="relay"></section>');
  let ready;const loaded=new Promise(resolve=>{ready=resolve;});
  const root=document.getElementById('relay');
  initRelayRoomView({root,embeddedData:()=>JSON.stringify(data),onReady:ready}).show(true);await loaded;
  root.querySelector('[data-article="legacy"]').dispatchEvent(new window.Event('click',{bubbles:true}));
  const body=root.querySelector('.relay-body');
  assert.deepEqual([...body.children].map(node=>node.tagName),['P','P','FIGURE']);
  assert.equal(body.children[0].textContent,'첫 줄 둘째 줄');
  assert.equal(body.children[1].textContent,'둘째 문단');
  assert.equal(body.querySelectorAll('br').length,0);
  assert.equal(body.querySelector('figure img').getAttribute('src'),'data/relay/assets/legacy.jpg');
});

test('the article reader maps numbered subheads to a smaller heading level',async t=>{
  const data={rooms:[{id:'naver',kind:'articles',title:'인생의 방',articles:[{
    id:'sub',title:'소제목 글',published_date:'2026-11-02',
    blocks:[{kind:'text',text:'1) 첫 번째 조건\n\n조건 설명'}],
  }]}]};
  const {document,window}=parseHTML('<section id="relay"></section>');
  let ready;const loaded=new Promise(resolve=>{ready=resolve;});
  const root=document.getElementById('relay');
  initRelayRoomView({root,embeddedData:()=>JSON.stringify(data),onReady:ready}).show(true);await loaded;
  root.querySelector('[data-article="sub"]').dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.equal(root.querySelector('.relay-body h3').textContent,'1) 첫 번째 조건');
  assert.equal(root.querySelector('.relay-body h2'),null);
  assert.equal(root.querySelector('.relay-body p').textContent,'조건 설명');
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

test('the relay chat groups messages by day and carries the replied excerpt',async t=>{
  const data={rooms:[{id:'telegram',kind:'chat',title:'소수의견',messages:[
    {id:'1',at:'2026-11-07T21:10:00+09:00',author:'소수의견',text:'어제 남긴 본문입니다'},
    {id:'2',at:'2026-11-08T09:05:00+09:00',author:'소수의견',text:'답장 본문입니다',reply_to:'1'},
    {id:'3',at:'2026-11-08T09:06:00+09:00',author:'소수의견',text:'',images:[{src:'data/relay/assets/chat-1.jpg',width:900,height:600,alt:'답장 사진'}]},
  ]}]};
  const {document}=parseHTML('<section id="relay"></section>');
  let ready;const loaded=new Promise(resolve=>{ready=resolve;});
  const root=document.getElementById('relay');
  initRelayRoomView({root,embeddedData:()=>JSON.stringify(data),onReady:ready}).show(true);await loaded;
  const days=[...root.querySelectorAll('.relay-day')].map(node=>node.textContent.trim());
  assert.equal(days.length,2);assert.match(days[0],/11월 7일 \(토\)/);assert.match(days[1],/11월 8일 \(일\)/);
  assert.equal(root.querySelector('.relay-msg-author'),null);
  assert.match(root.querySelector('.relay-reply-text').textContent,/어제 남긴 본문입니다/);
  assert.equal(root.querySelectorAll('.relay-msg--media').length,1);
  assert.equal(root.querySelector('.relay-msg--media time').textContent,'09:06');
});

test('relay actions do not confuse the page container with a pager button',async t=>{
  const data=chatPayload(),{document,window}=parseHTML('<section id="relay"></section>');
  let reads=0,ready;const loaded=new Promise(resolve=>{ready=resolve;});
  const root=document.getElementById('relay');
  initRelayRoomView({root,embeddedData:()=>{reads++;return JSON.stringify(data);},onReady:ready}).show(true);await loaded;
  const message=root.querySelector('.relay-msg');
  root.querySelector('.relay-msg-text').dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.equal(root.querySelector('.relay-msg'),message);
  assert.equal(reads,1);
  root.querySelector('[data-relay-action="reload"]').dispatchEvent(new window.Event('click',{bubbles:true}));
  assert.equal(reads,2);
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

test('the relay chat track can shrink below its content width on narrow screens',async()=>{
  const css=await readFile(new URL('../dist/relay-room.css',import.meta.url),'utf8');
  assert.match(css,/\.relay-chat\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});
