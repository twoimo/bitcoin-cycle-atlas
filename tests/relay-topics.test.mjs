import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { classifyRelayEntry, relayMatches, relayTextFields, relayTopicReport, relayEntries } from '../dist/relay-topics.js';
import { initRelayRoomView } from '../dist/relay-room.js';

const sample = () => ({ generated_at: '2026-11-13T12:00:00+09:00', rooms: [
  { id: 'telegram', kind: 'chat', title: '소수의견', messages: [
    { id: 'a', text: '비트코인과 금리 변화', at: '2026-11-13T10:00:00+09:00', url: 'https://example.test/a' },
    { id: 'b', text: '건강과 운동 이야기', at: '2026-11-13T11:00:00+09:00' },
    { id: 'c', text: '', images: ['data/relay/assets/image.webp'], at: '2026-11-13T12:00:00+09:00' },
  ] },
  { id: 'naver', kind: 'articles', title: '인생의 방', articles: [{ id: 'n', title: '법인 급여', blocks: [{kind:'text',text:'법인세와 세금'}], url:'https://example.test/n' }] },
  { id: 'hankyung', kind: 'editions', title: '모바일한경', editions: [{ date:'2026-11-13', version:'v6',pages:[{label:'1면',alt:'주식이라고 적힌 파일명은 근거가 아님',image:'data/relay/assets/a.webp'}] }] },
] });
async function view(data) {
  const { document, window } = parseHTML('<section id="relay"></section>');
  const root = document.getElementById('relay');
  let resolve; const ready = new Promise(done => { resolve = done; });
  const controller = initRelayRoomView({ root, embeddedData: () => JSON.stringify(data), onReady: resolve });
  controller.show(true); await ready;
  return { root, window, controller };
}
const click = (root, window, selector) => root.querySelector(selector).dispatchEvent(new window.Event('click', {bubbles:true}));

test('multiple grounded topics quote exact text with original offsets and never mutate source', () => {
  const item = {text:'비트코인과 금리 변화'}; const before = structuredClone(item);
  const result = classifyRelayEntry(item);
  assert.deepEqual(result.topics.map(topic=>topic.id), ['crypto','macro']);
  for(const topic of result.topics){const e=topic.evidence;assert.equal(item[e.field].slice(e.offset,e.offset+e.length),e.quote);}
  assert.deepEqual(item,before);
});
test('short Latin tickers do not match unrelated words; case insensitive complete tokens do', () => {
  assert.deepEqual(classifyRelayEntry({text:'whether ethical methods'}).topics.map(x=>x.id), ['unclassified']);
  assert.equal(classifyRelayEntry({text:'eth 가격'}).topics[0].id,'crypto');
});
test('image-only and unknown material stay explicitly unclassified without inferred source links', () => {
  const report=relayTopicReport(sample());
  assert.equal(report.entries.length,5);
  for(const entry of [report.entries[2],report.entries[4]]){
    assert.deepEqual(entry.topics,[{id:'unclassified',label:'미분류',evidence:null}]);
    assert.match(entry.reason,/이미지 내용 미판독/);assert.equal(entry.sourceUrl,null);
  }
});
test('query and topic intersect, article block text is searched, invalid topic never broadens results', () => {
  const article=sample().rooms[1].articles[0];
  assert.equal(relayMatches(article,{topic:'business',query:'법인세'}),true);
  assert.equal(relayMatches(article,{topic:'crypto',query:'법인세'}),false);
  assert.equal(relayMatches(article,{topic:'missing'}),false);
});
test('all current corpus entries have source identity and verifiable evidence or an explicit unknown', async () => {
  const data=JSON.parse(await readFile(new URL('../dist/data/relay/index.json',import.meta.url),'utf8'));
  const report=relayTopicReport(data);
  assert.equal(report.entries.length,data.rooms.reduce((n,r)=>n+relayEntries(r).length,0));
  let cursor=0;
  for(const room of data.rooms) for(const item of relayEntries(room)){
    const row=report.entries[cursor++];assert.equal(row.room,room.id);assert.ok(row.id);assert.ok(row.topics.length);
    for(const topic of row.topics) if(topic.evidence){const e=topic.evidence;const field=relayTextFields(item).find(x=>x.field===e.field);assert.equal(field.text.slice(e.offset,e.offset+e.length),e.quote);}
  }
});
test('filtering changes only selected entries, preserves original text and exposes empty/reset states', async () => {
  const {root,window}=await view(sample());
  assert.equal(root.querySelectorAll('[data-message-id]').length,3);
  root.querySelector('[name="query"]').value='비트코인';
  root.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(root.querySelectorAll('[data-message-id]').length,1);
  assert.equal(root.querySelector('.relay-msg-text').textContent,'비트코인과 금리 변화');
  assert.equal(root.querySelector('.relay-msg-link').getAttribute('href'),'https://example.test/a');
  assert.match(root.querySelector('output').textContent,/1 \/ 3건/);
  root.querySelector('[name="query"]').value='not-present';
  root.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(root.querySelectorAll('[data-message-id]').length,0);
  assert.match(root.querySelector('.relay-detail-body').textContent,/조건에 맞는 항목이 없습니다/);
  click(root,window,'[data-relay-action="clear-filters"]');
  assert.equal(root.querySelectorAll('[data-message-id]').length,3);
});
test('newly loaded items use the same rules and stale previous results disappear', async () => {
  const data=sample();const {root,controller}=await view(data);
  data.rooms[0].messages=[{id:'new',text:'부동산 아파트',at:'2026-11-14T00:00:00Z'}];
  await controller.reload();
  assert.equal(root.querySelectorAll('[data-message-id]').length,1);
  assert.equal(root.querySelector('[data-message-id]').dataset.messageId,'new');
  assert.match(root.querySelector('.relay-topic-evidence').textContent,/부동산/);
});
test('topic evidence quotes the exact source excerpt while labels and keywords remain outside it', async () => {
  const message={id:'quoted',text:'🎙비트코인과 금리 변화🐒',at:'2026-11-13T10:00:00+09:00'};
  const matches=classifyRelayEntry(message).topics.filter(topic=>topic.evidence);
  const {root}=await view({rooms:[{id:'telegram',kind:'chat',title:'원문',messages:[message]}]});
  const evidence=root.querySelector('.relay-topic-evidence');
  const rows=[...evidence.querySelectorAll('li')];
  assert.equal(rows.length,matches.length);
  for(let index=0;index<matches.length;index++){
    const row=rows[index],match=matches[index];
    const label=row.querySelector('.relay-topic-evidence-label');
    const keyword=row.querySelector('.relay-topic-evidence-keyword');
    const quote=row.querySelector('blockquote.relay-msg-quote.relay-topic-evidence-quote');
    assert.equal(label.textContent,match.label);
    assert.equal(keyword.textContent,`「${match.evidence.quote}」`);
    assert.equal(label.closest('blockquote'),null);
    assert.equal(keyword.closest('blockquote'),null);
    assert.ok(quote,'source excerpt must use the existing semantic quote contract');
    assert.equal(quote.textContent,match.evidence.excerpt);
    assert.equal(quote.children.length,0,'the quoted text contains only the original excerpt');
    assert.ok(quote.textContent.includes('🎙')&&quote.textContent.includes('🐒'));
  }
});

test('untrusted classification evidence and search terms remain escaped text', async () => {
  const data=sample();data.rooms[0].messages[0].text='비트코인 <img src=x onerror=alert(1)>';
  const {root,window}=await view(data);
  assert.equal(root.querySelector('.relay-topic-evidence img'),null);
  root.querySelector('[name="query"]').value='\"><script>alert(1)</script>';
  root.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(root.querySelector('script'),null);
});

test('worldwide is not jeonse, and Unicode case folding preserves original offsets', () => {
  assert.equal(classifyRelayEntry({text:'전세계 제약 시장'}).topics.some(x=>x.id==='housing'),false);
  const item={text:'İ 뉴스: ETH 가격'};const e=classifyRelayEntry(item).topics[0].evidence;
  assert.equal(item.text.slice(e.offset,e.offset+e.length),'ETH');
});

test('loading, unavailable, empty and recovered relay have one status owner and one retry', async () => {
  const originalFetch=globalThis.fetch;let resolveResponse,ready;
  const {document,window}=parseHTML('<section id="relay"></section>');const root=document.getElementById('relay');
  let mode='network';globalThis.fetch=()=>new Promise(resolve=>{resolveResponse=resolve});
  const controller=initRelayRoomView({root,embeddedData:()=>mode==='network'?null:JSON.stringify(mode==='empty'?{rooms:[]}:sample()),onReady:()=>ready?.()});
  try {
    const loaded=new Promise(resolve=>{ready=resolve});controller.show(true);
    assert.equal(root.dataset.relayState,'loading');assert.equal(root.querySelectorAll('[role="status"]').length,1);assert.equal(root.querySelectorAll('[data-relay-action="reload"]').length,0);
    resolveResponse({ok:false,status:503});await loaded;
    assert.equal(root.dataset.relayState,'error');assert.equal(root.querySelectorAll('[role="status"]').length,1);assert.equal(root.querySelectorAll('[data-relay-action="reload"]').length,1);
    mode='empty';await controller.reload();assert.equal(root.dataset.relayState,'empty');assert.equal(root.querySelectorAll('[role="status"]').length,1);
    mode='ready';click(root,window,'[data-relay-action="reload"]');await Promise.resolve();
    assert.equal(root.dataset.relayState,'ready');assert.equal(root.querySelectorAll('.relay-retry').length,0);assert.equal(root.querySelectorAll('[data-message-id]').length,3);
  } finally {globalThis.fetch=originalFetch;}
});

test('a pending latest-message scroll never takes ownership of newer search results', async () => {
  const original=globalThis.requestAnimationFrame;const scheduled=[];globalThis.requestAnimationFrame=callback=>{scheduled.push(callback);return scheduled.length;};
  try {const {root,window}=await view(sample());root.querySelector('[name="query"]').value='비트코인';root.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));const body=root.querySelector('.relay-detail-body');body.scrollTop=0;Object.defineProperty(body,'scrollHeight',{value:500});for(const fn of scheduled)fn();assert.equal(body.scrollTop,0);}finally{globalThis.requestAnimationFrame=original;}
});
