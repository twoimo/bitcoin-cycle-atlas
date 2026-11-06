import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

let fixtureId=0;
async function fixture(t){
 const {document,window}=parseHTML('<html><body><button id="outside">다른 작업</button><section id="evidence-view"><div class="evidence-table-shell"><table><caption><span id="evidence-total"></span></caption><thead><tr><th>자료</th></tr></thead><tbody id="evidence-body"></tbody><tfoot><tr><td><button id="evidence-more">다음</button><span id="evidence-progress"></span><span id="evidence-end"></span></td></tr></tfoot></table></div></section></body></html>');
 let active=document.body,room=24+4+56*8,nextFrame=0;
 const frames=new Map(),closeEvents=[],focusCalls=[];
 Object.defineProperty(document,'activeElement',{get:()=>active.isConnected?active:document.body});
 const elementPrototype=window.HTMLElement.prototype,selectPrototype=window.HTMLSelectElement.prototype;
 const originalFocus=Object.getOwnPropertyDescriptor(elementPrototype,'focus'),originalValue=Object.getOwnPropertyDescriptor(selectPrototype,'value');
 Object.defineProperty(elementPrototype,'focus',{configurable:true,value:function(){if(this.isConnected){active=this;focusCalls.push(this);}}});
 const selectValues=new WeakMap();
 Object.defineProperty(selectPrototype,'value',{configurable:true,get(){return selectValues.get(this)??originalValue.get.call(this);},set(value){selectValues.set(this,String(value));}});
 const createElement=document.createElement.bind(document);
 document.createElement=(tag,...args)=>{
  const element=createElement(tag,...args);
  if(tag==='dialog'){
   Object.defineProperty(element,'open',{get:()=>element.hasAttribute('open')});
   element.showModal=()=>element.setAttribute('open','');
   element.close=()=>{if(element.open){element.removeAttribute('open');closeEvents.push(()=>element.dispatchEvent(new window.Event('close')));}};
  }
  return element;
 };
 const shell=document.querySelector('.evidence-table-shell'),table=shell.querySelector('table'),body=document.querySelector('#evidence-body');
 Object.defineProperties(shell,{clientHeight:{get:()=>room},clientWidth:{get:()=>390}});
 const caption=table.querySelector('caption'),head=table.querySelector('thead');
 Object.defineProperties(table,{caption:{value:caption},tHead:{value:head}});
 caption.getBoundingClientRect=head.getBoundingClientRect=()=>({height:12});
 table.getBoundingClientRect=()=>({height:24+body.children.length*56});
 const location=new URL('https://example.test/bitcoin-cycle-atlas/?page=evidence');
 const globals={document,window,location,history:{replaceState(_state,_title,url){location.href=String(url);}},CustomEvent:window.CustomEvent,getComputedStyle:()=>({getPropertyValue:()=> '56px'}),requestAnimationFrame:callback=>{frames.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id)};
 const originals=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 t.after(()=>{
  document.body.replaceChildren();
  if(originalFocus)Object.defineProperty(elementPrototype,'focus',originalFocus);else delete elementPrototype.focus;
  Object.defineProperty(selectPrototype,'value',originalValue);
  for(const [key,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 });
 const evidence=await import(`../dist/evidence-view.js?focus-test=${++fixtureId}`);
 const reader=await import('../dist/research-reader.js?v=1.32.2');
 const flush=()=>{let turns=0;while(frames.size){assert.ok(++turns<10,'resize scheduling settles');const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();}};
 const flushClose=()=>{for(const callback of closeEvents.splice(0))callback();};
 evidence.initEvidenceView();evidence.showEvidenceView(true);flush();
 const button=(id,action='title')=>[...body.querySelectorAll(action==='title'?'.research-open':'.evidence-grade button')].find(node=>node.dataset.evidenceDetail===id);
 const click=node=>{node.focus();node.dispatchEvent(new window.Event('click',{bubbles:true}));};
 const resize=(capacity,{pending=false}={})=>{room=24+4+56*capacity;window.dispatchEvent(new window.Event('resize'));if(!pending)flush();};
 const filter=(selector,value)=>{const select=document.querySelector(selector);select.value=value;select.dispatchEvent(new window.Event('change',{bubbles:true}));flush();};
 return {document,window,location,reader,evidence,body,button,click,resize,filter,flush,flushClose,focusCalls,
  get dialog(){return document.querySelector('#research-reader');},
  close(){this.dialog.close();flushClose();},
  ids(){return [...body.children].map(row=>row.dataset.evidenceId);},
 };
}

for(const action of ['title','grade'])test(`Reader close reconnects the ${action} action after resize replaces its row`,async t=>{
 const f=await fixture(t),id=f.ids()[1],original=f.button(id,action);f.click(original);
 f.resize(6);assert.equal(original.isConnected,false);assert.ok(f.button(id,action));
 f.close();assert.equal(f.document.activeElement,f.button(id,action));assert.notEqual(f.document.activeElement,original);
});

for(const action of ['title','grade'])test(`Reader close reveals the filtered article dropped from the smaller page and retains ${action} focus on the next resize`,async t=>{
 const f=await fixture(t);f.filter('#evidence-asset','MSTR');
 const firstPage=f.ids(),id=firstPage.at(-1),original=f.button(id,action);assert.ok(firstPage.length>2);f.click(original);
 f.resize(2);assert.equal(f.button(id,action),undefined,'the modal does not pin its background row');
 f.resize(3,{pending:true});f.close();
 assert.equal(f.document.activeElement,f.button(id,action));assert.equal(f.document.querySelector('#evidence-asset').value,'MSTR');
 const restored=f.document.activeElement;f.flush();assert.equal(restored.isConnected,false,'a queued resize really replaces the restored node');assert.equal(f.document.activeElement,f.button(id,action));
 const beforeGrowth=f.document.activeElement;f.resize(8);assert.notEqual(f.document.activeElement,beforeGrowth);assert.equal(f.document.activeElement,f.button(id,action));
 assert.equal(f.document.querySelector('#evidence-prev').disabled,false);f.click(f.document.querySelector('#evidence-prev'));
 assert.equal(f.ids()[0],firstPage[0],'pagination retains the way back to the original filtered page');
});

test('Related article navigation returns to the original list article and action',async t=>{
 const f=await fixture(t),id=f.ids()[1],nextId=f.ids()[2];f.click(f.button(id,'grade'));
 f.reader.openResearchArticle(nextId,{keepHistory:true});f.resize(1);f.close();
 assert.equal(f.document.activeElement,f.button(id,'grade'));assert.notEqual(id,nextId);
});

test('Reader close leaves an inactive or newly filtered list alone',async t=>{
 const f=await fixture(t),id=f.ids().at(-1);f.click(f.button(id));f.resize(2);
 f.evidence.showEvidenceView(false);f.document.querySelector('#evidence-view').hidden=true;
 const ids=f.ids(),focusCount=f.focusCalls.length;f.close();assert.deepEqual(f.ids(),ids);assert.equal(f.focusCalls.length,focusCount);
 f.document.querySelector('#evidence-view').hidden=false;f.evidence.showEvidenceView(true);f.flush();
 const currentId=f.ids()[0];f.click(f.button(currentId));
 const search=f.document.querySelector('#evidence-search');search.value='no-match-focus-regression';search.dispatchEvent(new f.window.Event('input',{bubbles:true}));f.flush();
 const filteredFocusCount=f.focusCalls.length;f.close();assert.equal(f.focusCalls.length,filteredFocusCount);assert.equal(search.value,'no-match-focus-regression');assert.equal(f.document.querySelector('#evidence-progress').textContent,'0개');
});

test('A modal handoff does not invoke the old focus resolver even before the next dialog opens',async t=>{
 const f=await fixture(t),id=f.ids()[0];f.click(f.button(id));
 const focusCount=f.focusCalls.length;f.document.dispatchEvent(new f.window.CustomEvent('atlas:modal-open',{detail:{id:'next-dialog'}}));f.flushClose();
 assert.equal(f.focusCalls.length,focusCount,'closing for another modal does not steal focus');
 const other=f.document.createElement('dialog');f.document.body.append(other);other.showModal();
 f.reader.openResearchArticle(id,{opener:f.document.querySelector('#outside'),restoreFocus:()=>{assert.fail('an open dialog owns focus');}});f.close();
 assert.equal(other.open,true);
});

test('A queued close cannot clear a reopened reader, and callers without a resolver still regain their opener',async t=>{
 const f=await fixture(t),[firstId,nextId]=f.ids(),outside=f.document.querySelector('#outside');f.click(f.button(firstId));
 f.dialog.close();f.reader.openResearchArticle(nextId,{opener:outside});f.flushClose();
 assert.equal(f.dialog.open,true);assert.equal(f.location.searchParams.get('article'),nextId);assert.equal(f.document.activeElement.id,'research-reader-title');
 f.close();assert.equal(f.document.activeElement,outside);assert.equal(f.location.searchParams.has('article'),false);
});
